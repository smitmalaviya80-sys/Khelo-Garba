import assert from 'node:assert/strict';

const baseUrl = process.env.PGA_BASE_URL || 'http://127.0.0.1:4174';
const metric = (value, precision = 'exact', sampled = false) => ({ value, precision, sampled });
const PARTIAL_DATA_THROUGH = '2026-09-10T06:39:30.000Z';
const STALE_DATA_THROUGH = '2026-09-08T06:39:30.000Z';
const GENERATED_AT = '2026-09-10T06:40:00.000Z';
const HEALTH_EVALUATED_AT = '2026-09-10T07:20:00.000Z';

function homeEnvelope(status, dataThrough) {
  return {
    status,
    generatedAt: GENERATED_AT,
    dataThrough,
    window: {
      from: '2026-09-09T18:30:00.000Z',
      to: '2026-09-10T18:30:00.000Z',
      timezone: 'Asia/Kolkata',
    },
    sources: [{ name: 'analytics-engine', status, sampled: false }],
    data: {
      today: {
        uniqueBrowsers: metric(2),
        sessions: metric(7),
        confirmedPlayStarts: metric(4),
        surfaceViews: metric(11),
      },
      listeningTodayMs: metric(3_900_000),
      lifetime: {
        sessions: metric(120),
        confirmed_play_starts: metric(86),
        surface_views: metric(310),
        listening_ms: metric(75_600_000),
      },
      sessionsDaily: [
        { day: '2026-09-08', value: 5, precision: 'exact', sampled: false, dataThroughMs: 1_757_300_000_000 },
        { day: '2026-09-09', value: 7, precision: 'exact', sampled: false, dataThroughMs: 1_757_386_000_000 },
      ],
    },
  };
}

const unavailableEnvelope = {
  status: 'unavailable',
  generatedAt: null,
  dataThrough: null,
  data: null,
};

function healthRow(name, status = 'healthy', overrides = {}) {
  const labels = {
    production: 'Production',
    playback: 'Playback',
    deployment: 'Deployment',
    ci: 'CI',
    catalogue: 'Catalogue',
    telemetry: 'Telemetry',
    rollups: 'Rollups',
    pwa: 'PWA',
  };
  return {
    name,
    label: labels[name] || name,
    criticality: ['production', 'playback'].includes(name) ? 'critical' : 'important',
    status,
    summary: `${labels[name] || name} ${status}`,
    reasons: status === 'healthy' ? [] : [`${labels[name] || name} requires attention`],
    action: status === 'healthy' ? null : `Inspect ${name}`,
    freshness: {
      checkedAt: HEALTH_EVALUATED_AT,
      dataThroughAt: HEALTH_EVALUATED_AT,
      observedAt: HEALTH_EVALUATED_AT,
      text: `Checked ${HEALTH_EVALUATED_AT}`,
    },
    source: { kind: 'github', id: `${name}-check`, url: null },
    ...overrides,
  };
}

function healthEnvelope() {
  const subsystems = [
    healthRow('production'),
    healthRow('playback', 'failed', {
      summary: 'Playback route failures require review.',
      reasons: ['Playback route errors exceed the release threshold.'],
      action: 'Inspect playback failures',
      source: {
        kind: 'github',
        id: 'playback-check',
        url: 'https://github.com/ruddvz/garba/actions/runs/123?token=must-strip#playback',
      },
    }),
    healthRow('deployment'),
    healthRow('ci'),
    healthRow('catalogue'),
    healthRow('telemetry', 'stale', {
      summary: 'Telemetry evidence is stale.',
      reasons: ['Telemetry freshness target was missed.'],
      action: 'Inspect telemetry freshness',
      source: {
        kind: 'external',
        id: 'unsafe-evidence',
        url: 'https://evil.example/secret?token=must-not-render#telemetry',
      },
    }),
    healthRow('rollups'),
    healthRow('pwa'),
  ];

  return {
    status: 'complete',
    generatedAt: HEALTH_EVALUATED_AT,
    dataThrough: HEALTH_EVALUATED_AT,
    data: {
      presentation: {
        schemaVersion: 'pga-health-presentation/v1',
        complete: true,
        status: 'degraded',
        statusLabel: 'Attention needed',
        summary: 'Playback failed and telemetry evidence is stale.',
        generatedAt: HEALTH_EVALUATED_AT,
        evaluatedAt: HEALTH_EVALUATED_AT,
        accessibilitySummary: 'PlayGarba Health: Attention needed. Playback failed. Telemetry is stale.',
        subsystems,
      },
    },
  };
}

async function fulfillJson(route, body) {
  await route.fulfill({
    status: 200,
    contentType: 'application/json',
    headers: { 'cache-control': 'no-store' },
    body: JSON.stringify(body),
  });
}

async function visibleText(locator) {
  return (await locator.textContent() || '').trim();
}

async function validateEngine(engineName, engine) {
  const browser = await engine.launch({ headless: true });
  try {
    const context = await browser.newContext({
      viewport: { width: 1280, height: 800 },
      reducedMotion: 'reduce',
      serviceWorkers: 'block',
    });
    const page = await context.newPage();
    const failures = [];
    let analyticsPhase = 'partial';

    page.on('pageerror', (error) => failures.push(`pageerror: ${error.message}`));
    page.on('console', (message) => {
      if (message.type() === 'error') failures.push(`console: ${message.text()}`);
    });

    await page.route('**/api/home', async (route) => {
      const status = analyticsPhase === 'stale' ? 'stale' : 'complete';
      const dataThrough = analyticsPhase === 'stale' ? STALE_DATA_THROUGH : PARTIAL_DATA_THROUGH;
      await fulfillJson(route, homeEnvelope(status, dataThrough));
    });
    await page.route('**/api/live', async (route) => fulfillJson(route, unavailableEnvelope));
    await page.route('**/api/health', async (route) => fulfillJson(route, healthEnvelope()));

    await page.goto(`${baseUrl}/`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => Boolean(window.PGA_TEST && window.PGA_HOME_LIVE_TEST && window.PGA_HEALTH_TEST));

    await page.evaluate(() => window.PGA_HOME_LIVE_TEST.reload());
    const homeState = page.locator('#homeState');
    await homeState.waitFor({ state: 'visible' });
    assert.equal(await homeState.getAttribute('data-state'), 'partial', `${engineName}: partial Home state not surfaced`);
    assert.equal(await visibleText(homeState.locator('strong')), 'Partial data', `${engineName}: partial state label missing`);
    assert.match(await visibleText(homeState.locator('p')), /Available values stay visible and missing values stay blank\./, `${engineName}: partial truth copy missing`);
    assert.equal(await visibleText(page.locator('#homeSessionsToday')), '7', `${engineName}: trustworthy Home value was not retained`);
    assert.equal(await visibleText(page.locator('#homeLiveNow')), '—', `${engineName}: missing Live value must not become zero`);
    assert.match(await page.locator('#homeLiveNow').getAttribute('aria-label') || '', /unavailable$/i, `${engineName}: missing Live value must stay semantically unavailable`);
    await page.locator('#homeContent').waitFor({ state: 'visible' });
    const partialFreshness = await visibleText(page.locator('#homeFreshness'));
    assert.match(partialFreshness, /^Data through /, `${engineName}: partial data freshness missing`);

    await page.locator('[data-nav="more"]:visible').first().click();
    await page.locator('[data-view="more"]').waitFor({ state: 'visible' });
    await page.locator('[data-nav="home"]:visible').first().click();
    await page.locator('[data-view="home"]').waitFor({ state: 'visible' });

    analyticsPhase = 'stale';
    await page.evaluate(() => window.PGA_HOME_LIVE_TEST.reload());
    await homeState.waitFor({ state: 'visible' });
    assert.equal(await homeState.getAttribute('data-state'), 'stale', `${engineName}: stale Home state not surfaced`);
    assert.equal(await visibleText(homeState.locator('strong')), 'Stale data', `${engineName}: stale state label missing`);
    assert.match(await visibleText(homeState.locator('p')), /Values remain timestamped rather than presented as current\./, `${engineName}: stale truth copy missing`);
    assert.equal(await visibleText(page.locator('#homeSessionsToday')), '7', `${engineName}: stale trustworthy value was hidden`);
    assert.equal(await visibleText(page.locator('#homeLiveNow')), '—', `${engineName}: stale state must not invent missing Live zero`);
    const staleFreshness = await visibleText(page.locator('#homeFreshness'));
    assert.match(staleFreshness, /^Data through /, `${engineName}: stale timestamp missing`);
    assert.notEqual(staleFreshness, partialFreshness, `${engineName}: stale snapshot must retain its own original timestamp`);

    await page.locator('[data-nav="health"]:visible').first().click();
    await page.locator('[data-view="health"]').waitFor({ state: 'visible' });
    await page.evaluate(() => window.PGA_HEALTH_TEST.reload());
    await page.locator('#healthContent').waitFor({ state: 'visible' });

    const overall = page.locator('#healthOverallStatus');
    assert.equal(await visibleText(overall), 'Attention needed', `${engineName}: degraded Health status missing`);
    assert.equal(await overall.getAttribute('data-status'), 'degraded', `${engineName}: degraded Health state missing`);
    assert.match(await visibleText(page.locator('#healthOverallSummary')), /Playback failed and telemetry evidence is stale\./, `${engineName}: Health summary missing`);

    const problems = page.locator('#healthProblems .health-row');
    assert.equal(await problems.count(), 2, `${engineName}: expected failed + stale Health problems`);
    const firstProblem = problems.nth(0);
    const secondProblem = problems.nth(1);
    assert.equal(await visibleText(firstProblem.locator('.health-row-heading strong')), 'Playback', `${engineName}: failed Playback problem must lead`);
    assert.equal(await visibleText(firstProblem.locator('.health-status')), 'Failed', `${engineName}: failed status missing`);
    assert.match(await visibleText(firstProblem.locator('small')), /Playback route errors exceed the release threshold\./, `${engineName}: Health reason missing`);
    assert.equal(await visibleText(firstProblem.locator('.health-action')), 'Inspect playback failures', `${engineName}: actionable Health instruction missing`);

    const safeEvidence = firstProblem.locator('a');
    await safeEvidence.waitFor({ state: 'visible' });
    assert.equal(await safeEvidence.getAttribute('href'), 'https://github.com/ruddvz/garba/actions/runs/123', `${engineName}: Health evidence URL must strip query and fragment`);
    await safeEvidence.focus();
    assert.equal(await page.evaluate(() => document.activeElement?.textContent?.trim()), 'Evidence', `${engineName}: Health evidence link is not keyboard reachable`);

    assert.equal(await visibleText(secondProblem.locator('.health-row-heading strong')), 'Telemetry', `${engineName}: stale Telemetry problem must follow failed problem`);
    assert.equal(await visibleText(secondProblem.locator('.health-status')), 'Stale', `${engineName}: stale Health status missing`);
    assert.equal(await secondProblem.locator('a').count(), 0, `${engineName}: unsafe Health evidence host must not become a link`);
    assert.match(await visibleText(page.locator('#healthFreshness')), /Evaluated /, `${engineName}: Health freshness missing`);

    await page.locator('[data-nav="home"]:visible').first().click();
    await page.locator('[data-view="home"]').waitFor({ state: 'visible' });
    assert.deepEqual(failures, [], `${engineName}: critical browser/runtime failures`);

    await context.close();
  } finally {
    await browser.close();
  }
}

const { chromium, webkit } = await import('@playwright/test');
for (const [engineName, engine] of [['chromium', chromium], ['webkit', webkit]]) {
  await validateEngine(engineName, engine);
}

console.log('✓ PGA partial/stale Home + Live evidence is truthful in Chromium and WebKit');
console.log('✓ PGA actionable Health journey prioritises problems and sanitises evidence links in Chromium and WebKit');
