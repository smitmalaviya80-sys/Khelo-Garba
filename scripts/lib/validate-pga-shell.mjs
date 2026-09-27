import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const appRoot = path.join(root, 'src/pga/app');
const browserMode = process.argv.includes('--browser');

const requiredFiles = [
  'index.html',
  'app.css',
  'app.js',
  'sw.js',
  'manifest.webmanifest',
  'icons/icon.svg',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/maskable-192.png',
  'icons/maskable-512.png',
  'icons/apple-touch-icon.png',
];

function read(relativePath, encoding = 'utf8') {
  return fs.readFileSync(path.join(appRoot, relativePath), encoding);
}

function assertPng(relativePath, expectedWidth, expectedHeight) {
  const data = read(relativePath, null);
  assert.equal(data.subarray(0, 8).toString('hex'), '89504e470d0a1a0a', `${relativePath} must be PNG`);
  assert.equal(data.readUInt32BE(16), expectedWidth, `${relativePath} width`);
  assert.equal(data.readUInt32BE(20), expectedHeight, `${relativePath} height`);
}

function validateStaticContract() {
  for (const relativePath of requiredFiles) {
    const absolute = path.join(appRoot, relativePath);
    assert.ok(fs.existsSync(absolute), `missing ${relativePath}`);
    assert.ok(fs.statSync(absolute).size > 0, `empty ${relativePath}`);
  }

  const manifest = JSON.parse(read('manifest.webmanifest'));
  assert.equal(manifest.name, 'PlayGarba Admin');
  assert.equal(manifest.short_name, 'PGA');
  assert.equal(manifest.display, 'standalone');
  assert.equal(manifest.theme_color.toLowerCase(), '#151412');
  assert.equal(manifest.background_color.toLowerCase(), '#151412');
  assert.equal(manifest.start_url, '/');
  assert.equal(manifest.scope, '/');

  const iconKeys = new Set(manifest.icons.map((icon) => `${icon.sizes}:${icon.purpose || 'any'}`));
  assert.ok(iconKeys.has('192x192:any'), 'manifest needs 192 regular icon');
  assert.ok(iconKeys.has('512x512:any'), 'manifest needs 512 regular icon');
  assert.ok(iconKeys.has('192x192:maskable'), 'manifest needs 192 maskable icon');
  assert.ok(iconKeys.has('512x512:maskable'), 'manifest needs 512 maskable icon');

  assertPng('icons/icon-192.png', 192, 192);
  assertPng('icons/icon-512.png', 512, 512);
  assertPng('icons/maskable-192.png', 192, 192);
  assertPng('icons/maskable-512.png', 512, 512);
  assertPng('icons/apple-touch-icon.png', 180, 180);

  const html = read('index.html');
  assert.match(html, /<meta name="robots" content="noindex,nofollow,noarchive">/, 'PGA shell must stay out of public indexing');
  assert.match(html, /class="skip-link" href="#main"/, 'keyboard skip link missing');
  assert.match(html, /<main id="main" tabindex="-1">/, 'focusable main landmark missing');
  assert.match(html, /aria-label="Primary"/, 'primary navigation landmark missing');
  assert.match(html, /No data yet/, 'truthful no-data state missing');
  assert.match(html, /Unknown is never converted to zero or healthy\./, 'unknown-state truth rule missing');
  assert.doesNotMatch(html, /BookPhysio|physiotherap/i, 'PGA shell must not inherit BookPhysio copy');

  const navValues = [...html.matchAll(/data-nav="([^"]+)"/g)].map((match) => match[1]);
  assert.deepEqual([...new Set(navValues)].sort(), ['audience', 'health', 'home', 'listening', 'more'], 'PGA must expose exactly five primary destinations');

  const css = read('app.css');
  assert.match(css, /env\(safe-area-inset-top/, 'top safe area missing');
  assert.match(css, /env\(safe-area-inset-bottom/, 'bottom safe area missing');
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/, 'reduced-motion support missing');
  assert.match(css, /@media \(prefers-contrast: more\)/, 'increased-contrast support missing');
  assert.match(css, /@media \(forced-colors: active\)/, 'forced-colors support missing');
  assert.match(css, /@media \(min-width: 980px\)/, 'desktop adaptation missing');
  assert.doesNotMatch(css, /transition\s*:\s*all\b/, 'transition: all is prohibited');

  const js = read('app.js');
  for (const state of ['loading', 'offline', 'stale', 'error', 'auth-expired']) {
    assert.ok(js.includes(`${state}:`) || js.includes(`'${state}':`), `boundary state ${state} missing`);
  }
  assert.match(js, /heading\.focus\(\{ preventScroll: true \}\)/, 'navigation must move focus to the new view heading');
  assert.match(js, /location\.hostname === 'localhost'/, 'test fixture API must be localhost-only');

  const sw = read('sw.js');
  assert.match(sw, /const CACHE_PREFIX = 'pga-shell-'/, 'PGA needs a separate cache namespace');
  assert.match(sw, /url\.pathname\.startsWith\('\/api\/'\)/, 'private API exclusion missing');
  assert.match(sw, /accept\.includes\('application\/json'\)/, 'JSON private-data cache exclusion missing');
  assert.doesNotMatch(sw, /skipWaiting\s*\(/, 'PGA install must not force-update active sessions');

  console.log('✓ PGA static shell contract');
}

function unavailableAggregate() {
  return JSON.stringify({
    status: 'unavailable',
    generatedAt: null,
    dataThrough: null,
    data: null,
  });
}

function audienceAggregate() {
  const metric = (value) => ({ value, precision: 'exact', sampled: false });
  return JSON.stringify({
    status: 'complete',
    generatedAt: '2026-09-10T18:00:00.000Z',
    dataThrough: '2026-09-10T17:59:00.000Z',
    data: {
      range: '30d',
      summary: {
        uniqueBrowsers: metric(5),
        sessions: metric(7),
        newBrowserIds: metric(3),
        returningBrowserIds: metric(2),
      },
      breakdowns: [
        {
          client: 'mobile|iOS|Safari',
          country: 'IN',
          region: 'GJ',
          referrerHost: null,
          acquisition: 'direct||',
          displayMode: 'browser',
          sessions: metric(7),
        },
      ],
    },
  });
}

async function installUnavailableRoutes(page, fixtureOrigin, protectedAggregatePaths) {
  await page.route('**/api/**', async (route) => {
    const url = new URL(route.request().url());
    if (url.origin !== fixtureOrigin || !protectedAggregatePaths.has(url.pathname)) {
      await route.continue();
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'cache-control': 'no-store' },
      body: unavailableAggregate(),
    });
  });
}

async function validateResponsiveMatrix({ chromium, webkit, baseUrl, fixtureOrigin, protectedAggregatePaths }) {
  const engines = [
    ['chromium', chromium],
    ['webkit', webkit],
  ];
  const viewports = [
    ['iphone-portrait', { width: 390, height: 844 }],
    ['android-portrait', { width: 412, height: 915 }],
    ['tablet', { width: 1024, height: 768 }],
    ['desktop', { width: 1440, height: 900 }],
  ];

  for (const [engineName, engine] of engines) {
    const browser = await engine.launch({ headless: true });
    try {
      for (const [viewportName, viewport] of viewports) {
        const context = await browser.newContext({ viewport, reducedMotion: 'reduce', serviceWorkers: 'block' });
        const page = await context.newPage();
        const failures = [];
        await installUnavailableRoutes(page, fixtureOrigin, protectedAggregatePaths);

        page.on('pageerror', (error) => failures.push(`pageerror: ${error.message}`));
        page.on('response', (response) => {
          if (response.url().startsWith(baseUrl) && response.status() >= 400) failures.push(`http ${response.status()}: ${response.url()}`);
        });

        await page.goto(`${baseUrl}/`, { waitUntil: 'domcontentloaded' });
        await page.waitForSelector('[data-view="home"]:not([hidden])');
        const dimensions = await page.evaluate(() => ({ width: innerWidth, scrollWidth: document.documentElement.scrollWidth }));
        assert.ok(dimensions.scrollWidth <= dimensions.width, `${engineName}/${viewportName} has horizontal overflow: ${dimensions.scrollWidth} > ${dimensions.width}`);

        const navRoot = viewport.width >= 980 ? '.side-nav' : '.bottom-nav';
        for (const view of ['audience', 'listening', 'health', 'more', 'home']) {
          await page.locator(`${navRoot} [data-nav="${view}"]`).click();
          const section = page.locator(`[data-view="${view}"]`);
          await section.waitFor({ state: 'visible' });
          assert.equal(await section.getAttribute('hidden'), null, `${engineName}/${viewportName}/${view} stayed hidden`);
          const focusedHeading = await page.evaluate(() => document.activeElement?.tagName === 'H1' ? document.activeElement.textContent : null);
          assert.ok(focusedHeading, `${engineName}/${viewportName}/${view} did not focus its heading`);
        }

        await page.evaluate(() => window.PGA_TEST.setBoundary('auth-expired'));
        await page.waitForSelector('#boundary:not([hidden])');
        assert.match(await page.locator('#boundaryTitle').textContent(), /Access expired/);

        await context.setOffline(true);
        await page.evaluate(() => window.dispatchEvent(new Event('offline')));
        assert.match(await page.locator('#boundaryTitle').textContent(), /Offline/);
        await context.setOffline(false);

        assert.deepEqual(failures, [], `${engineName}/${viewportName} emitted runtime failures`);
        await context.close();
      }
    } finally {
      await browser.close();
    }
  }
}

async function validateKeyboardAndReducedMotion({ chromium, webkit, baseUrl, fixtureOrigin, protectedAggregatePaths }) {
  for (const [engineName, engine] of [['chromium', chromium], ['webkit', webkit]]) {
    const browser = await engine.launch({ headless: true });
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce', serviceWorkers: 'block' });
    try {
      const page = await context.newPage();
      await installUnavailableRoutes(page, fixtureOrigin, protectedAggregatePaths);
      await page.goto(`${baseUrl}/`, { waitUntil: 'domcontentloaded' });

      const motion = await page.evaluate(() => {
        const maxDurationMs = (value) => Math.max(0, ...String(value).split(',').map((token) => {
          const trimmed = token.trim();
          if (!trimmed) return 0;
          if (trimmed.endsWith('ms')) return Number.parseFloat(trimmed) || 0;
          if (trimmed.endsWith('s')) return (Number.parseFloat(trimmed) || 0) * 1000;
          return Number.parseFloat(trimmed) || 0;
        }));
        const style = getComputedStyle(document.querySelector('[data-view="home"]'));
        return {
          reduced: matchMedia('(prefers-reduced-motion: reduce)').matches,
          animationMs: maxDurationMs(style.animationDuration),
          transitionMs: maxDurationMs(style.transitionDuration),
        };
      });
      assert.equal(motion.reduced, true, `${engineName} reduced-motion media query must be active`);
      assert.ok(motion.animationMs <= 0.01, `${engineName} reduced-motion animation remains ${motion.animationMs}ms`);
      assert.ok(motion.transitionMs <= 0.01, `${engineName} reduced-motion transition remains ${motion.transitionMs}ms`);

      await page.evaluate(() => document.activeElement?.blur());
      let reachedAudience = false;
      for (let index = 0; index < 24; index += 1) {
        await page.keyboard.press('Tab');
        const activeNav = await page.evaluate(() => document.activeElement?.dataset?.nav || null);
        if (activeNav === 'audience') {
          reachedAudience = true;
          break;
        }
      }
      assert.equal(reachedAudience, true, `${engineName} keyboard tab order did not reach Audience navigation`);
      await page.keyboard.press('Enter');
      await page.locator('[data-view="audience"]').waitFor({ state: 'visible' });
      assert.equal(await page.evaluate(() => document.activeElement?.tagName), 'H1', `${engineName} keyboard navigation did not move focus to the view heading`);
      assert.match(await page.evaluate(() => document.activeElement?.textContent || ''), /Audience/);
    } finally {
      await context.close();
      await browser.close();
    }
  }
}

async function validateForcedColors({ chromium, baseUrl, fixtureOrigin, protectedAggregatePaths }) {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    forcedColors: 'active',
    serviceWorkers: 'block',
  });
  try {
    const page = await context.newPage();
    await installUnavailableRoutes(page, fixtureOrigin, protectedAggregatePaths);
    await page.goto(`${baseUrl}/`, { waitUntil: 'domcontentloaded' });
    assert.equal(await page.evaluate(() => matchMedia('(forced-colors: active)').matches), true, 'Chromium forced-colors media query must be active');

    const audienceNav = page.locator('.side-nav [data-nav="audience"]');
    await audienceNav.focus();
    const focusStyle = await audienceNav.evaluate((node) => {
      const style = getComputedStyle(node);
      return { outlineStyle: style.outlineStyle, outlineWidth: Number.parseFloat(style.outlineWidth) || 0 };
    });
    assert.notEqual(focusStyle.outlineStyle, 'none', 'forced-colors keyboard focus must stay visibly outlined');
    assert.ok(focusStyle.outlineWidth >= 2, `forced-colors focus outline is only ${focusStyle.outlineWidth}px`);

    await page.keyboard.press('Enter');
    await page.locator('[data-view="audience"]').waitFor({ state: 'visible' });
    assert.equal(await page.evaluate(() => document.activeElement?.tagName), 'H1', 'forced-colors navigation must remain operable');
  } finally {
    await context.close();
    await browser.close();
  }
}

async function validateProtectedResilience({ chromium, baseUrl, fixtureOrigin, protectedAggregatePaths }) {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce', serviceWorkers: 'block' });
  try {
    const page = await context.newPage();
    const pageErrors = [];
    let audienceMode = 'ready';
    let audienceRequests = 0;

    page.on('pageerror', (error) => pageErrors.push(error.message));
    await page.route('**/api/**', async (route) => {
      const url = new URL(route.request().url());
      if (url.origin !== fixtureOrigin || !protectedAggregatePaths.has(url.pathname)) {
        await route.continue();
        return;
      }
      if (url.pathname !== '/api/audience') {
        await route.fulfill({ status: 200, contentType: 'application/json', body: unavailableAggregate() });
        return;
      }

      audienceRequests += 1;
      if (audienceMode === 'auth-expired') {
        await route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ error: 'access_expired' }) });
        return;
      }
      if (audienceMode === 'backend-unavailable') {
        await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ status: 'unavailable', error: 'query_unavailable' }) });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: { 'cache-control': 'no-store' },
        body: audienceAggregate(),
      });
    });

    await page.goto(`${baseUrl}/`, { waitUntil: 'domcontentloaded' });
    await page.locator('.bottom-nav [data-nav="audience"]').click();
    await page.locator('#audienceContent').waitFor({ state: 'visible' });
    assert.equal((await page.locator('#audienceSessions').textContent()).trim(), '7', 'valid private Audience data must render before resilience transitions');

    audienceMode = 'auth-expired';
    await page.locator('#refreshButton').click();
    await page.waitForFunction(() => document.querySelector('#audienceState')?.dataset?.state === 'auth-expired');
    assert.match(await page.locator('#boundaryTitle').textContent(), /Access expired/);
    assert.equal(await page.locator('#audienceContent').isHidden(), true, 'expired access must hide previously rendered private data');

    audienceMode = 'backend-unavailable';
    await page.locator('#refreshButton').click();
    await page.waitForFunction(() => document.querySelector('#audienceState')?.dataset?.state === 'error');
    assert.match(await page.locator('#audienceState strong').textContent(), /Analytics unavailable/);
    assert.equal(await page.locator('#audienceContent').isHidden(), true, 'backend failure must not expose stale data as current');

    audienceMode = 'ready';
    await page.locator('#refreshButton').click();
    await page.locator('#audienceContent').waitFor({ state: 'visible' });
    assert.equal((await page.locator('#audienceSessions').textContent()).trim(), '7', 'backend recovery must restore fresh trustworthy data');

    const beforeOffline = audienceRequests;
    await context.setOffline(true);
    await page.evaluate(() => window.dispatchEvent(new Event('offline')));
    await page.waitForFunction(() => document.querySelector('#audienceState')?.dataset?.state === 'offline');
    assert.match(await page.locator('#boundaryTitle').textContent(), /Offline/);
    assert.equal(await page.locator('#audienceContent').isHidden(), true, 'offline transition must hide analytics content from current-state presentation');

    audienceMode = 'ready';
    await context.setOffline(false);
    await page.evaluate(() => window.dispatchEvent(new Event('online')));
    await page.locator('#audienceContent').waitFor({ state: 'visible' });
    assert.ok(audienceRequests > beforeOffline, 'online recovery must start a fresh protected Audience request');
    assert.equal((await page.locator('#audienceSessions').textContent()).trim(), '7', 'online recovery must restore fresh Audience data');
    assert.deepEqual(pageErrors, [], 'resilience flow emitted page errors');
  } finally {
    await context.close();
    await browser.close();
  }
}

async function validateBrowserContract() {
  const { chromium, webkit } = await import('@playwright/test');
  const baseUrl = process.env.PGA_BASE_URL || 'http://127.0.0.1:4174';
  const fixtureOrigin = new URL(baseUrl).origin;
  const protectedAggregatePaths = new Set(['/api/home', '/api/live', '/api/audience', '/api/listening']);
  const options = { chromium, webkit, baseUrl, fixtureOrigin, protectedAggregatePaths };

  await validateResponsiveMatrix(options);
  await validateKeyboardAndReducedMotion(options);
  await validateForcedColors(options);
  await validateProtectedResilience(options);

  console.log('✓ PGA Chromium/WebKit responsive shell contract');
  console.log('✓ PGA keyboard-only and reduced-motion browser evidence contract');
  console.log('✓ PGA Chromium forced-colors focus/navigation evidence contract');
  console.log('✓ PGA protected 401/503/offline failure and recovery evidence contract');
}

validateStaticContract();
if (browserMode) await validateBrowserContract();