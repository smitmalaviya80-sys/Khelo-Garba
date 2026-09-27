import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const appRoot = path.join(root, 'src/pga/app');
const browserMode = process.argv.includes('--browser');

const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');
const metric = (value, precision = 'exact', sampled = false) => ({ value, precision, sampled });

const audienceEnvelope = {
  status: 'complete',
  generatedAt: '2026-09-09T21:00:00.000Z',
  dataThrough: '2026-09-09T20:59:00.000Z',
  data: {
    range: '30d',
    summary: {
      uniqueBrowsers: metric(8),
      sessions: metric(10),
      newBrowserIds: metric(3),
      returningBrowserIds: metric(5),
    },
    breakdowns: [
      { client: 'mobile|iOS|Safari', country: 'IN', region: 'GJ', referrerHost: null, acquisition: 'instagram|social|', displayMode: 'standalone', sessions: metric(6) },
      { client: 'desktop|Windows|Chrome', country: 'CA', region: 'ON', referrerHost: 'google.com', acquisition: '||', displayMode: 'browser', sessions: metric(3) },
      { client: 'mobile|Android|Chrome', country: 'IN', region: null, referrerHost: null, acquisition: '||', displayMode: 'browser', sessions: metric(1) },
    ],
  },
};

const listeningEnvelope = {
  status: 'complete',
  generatedAt: '2026-09-09T21:00:00.000Z',
  dataThrough: '2026-09-09T20:59:00.000Z',
  data: {
    range: '30d',
    listeningMs: metric(7_800_000),
    search: {
      searches: metric(20),
      selectedSearches: metric(12),
      searchesWithConfirmedPlay: metric(9),
      zeroResultSearches: metric(4),
      unmetDemand: [
        { term: 'old sanedo', searches: metric(5), zeroResults: metric(4) },
      ],
    },
    rows: [
      { eventName: 'play_intent', surface: 'player', world: 'traditional', contentType: 'song', contentId: 'song-current', canonicalId: 'song-current', contentLabel: 'Aavo Maadi', artist: 'Artist One', releaseTitle: 'Current Release', identityStatus: 'resolved', events: metric(10) },
      { eventName: 'playback_started', surface: 'player', world: 'traditional', contentType: 'song', contentId: 'song-current', canonicalId: 'song-current', contentLabel: 'Aavo Maadi', artist: 'Artist One', releaseTitle: 'Current Release', identityStatus: 'resolved', events: metric(4) },
      { eventName: 'playback_started', surface: 'explore', world: 'traditional', contentType: 'song', contentId: 'song-presentation', canonicalId: 'song-current', contentLabel: 'Aavo Maadi', artist: 'Artist One', releaseTitle: 'Current Release', identityStatus: 'resolved', events: metric(3) },
      { eventName: 'playback_started', surface: 'nonstop', world: 'dandiya', contentType: 'nonstop_set', contentId: 'set-night', canonicalId: 'set-night', contentLabel: 'Nonstop Night', artist: 'Artist Two', releaseTitle: 'Live Set Release', identityStatus: 'resolved', events: metric(2) },
      { eventName: 'playback_paused', surface: 'player', events: metric(2) },
      { eventName: 'next_requested', surface: 'player', events: metric(3) },
      { eventName: 'previous_requested', surface: 'player', events: metric(1) },
      { eventName: 'skip_requested', surface: 'nonstop', events: metric(2) },
      { eventName: 'playback_error', surface: 'player', errorCode: 'network', events: metric(1) },
      { eventName: 'playback_unavailable', surface: 'explore', errorCode: 'route_unavailable', events: metric(2) },
    ],
  },
};

const unavailableAggregate = {
  status: 'unavailable',
  generatedAt: null,
  dataThrough: null,
  data: null,
};

async function validateModels() {
  const analyticsUrl = pathToFileURL(path.join(appRoot, 'analytics.js')).href;
  const {
    formatDuration,
    formatMetric,
    normaliseAudience,
    normaliseListening,
    ratio,
  } = await import(`${analyticsUrl}?validate=${Date.now()}`);

  assert.equal(formatMetric(metric(12345)), '12,345');
  assert.equal(formatDuration(metric(7_800_000)), '2 h 10 min');
  assert.deepEqual(ratio(metric(7), metric(10)), { value: 0.7, numerator: 7, denominator: 10 });
  assert.equal(ratio(metric(0), metric(0)), null);

  const audience = normaliseAudience(audienceEnvelope);
  assert.equal(audience.summary.uniqueBrowsers.value, 8);
  assert.equal(audience.distributions.device[0].label, 'mobile');
  assert.equal(audience.distributions.displayMode.find((row) => row.label === 'PWA').metric.value, 6);
  assert.equal(audience.distributions.acquisition.find((row) => row.label === 'google.com').metric.value, 3);
  assert.equal(audience.distributions.region.some((row) => row.label === null), false);

  const listening = normaliseListening(listeningEnvelope);
  assert.equal(listening.playSuccess.value, 0.9);
  assert.equal(listening.playSuccess.denominator, 10);
  assert.equal(listening.search.selectionRate.denominator, 20);
  assert.equal(listening.search.playRate.numerator, 9);
  assert.equal(listening.search.zeroResultRate.numerator, 4);
  assert.equal(listening.topSongs[0].contentId, 'song-current');
  assert.equal(listening.topSongs[0].metric.value, 7, 'canonical aliases must aggregate instead of split history');
  assert.equal(listening.topArtists.find((row) => row.label === 'Artist One').metric.value, 7);
  assert.equal(listening.topReleases.find((row) => row.label === 'Current Release').metric.value, 7);
  assert.equal(listening.nonstopSets[0].contentId, 'set-night');
  assert.equal(listening.surfaces.find((row) => row.label === 'player').metric.value, 4);
  assert.equal(listening.worlds.find((row) => row.label === 'traditional').metric.value, 7);
}

function validateStaticContract() {
  const html = read('src/pga/app/index.html');
  const css = read('src/pga/app/app.css');
  const app = read('src/pga/app/app.js');
  const analytics = read('src/pga/app/analytics.js');
  const backendAnalytics = read('src/pga/backend/lib/analytics.js');
  const admin = read('src/pga/backend/admin-worker.js');
  const catalogue = read('src/pga/backend/lib/catalogue.js');

  for (const view of ['audience', 'listening']) {
    for (const range of ['7d', '30d', '90d']) {
      assert.match(html, new RegExp(`data-range-view="${view}" data-range="${range}"`), `${view} ${range} control missing`);
    }
  }
  for (const id of [
    'audienceUnique', 'audienceSessions', 'audienceNew', 'audienceReturning', 'audienceDevices', 'audienceDisplayMode',
    'audienceAcquisition', 'audienceCountries', 'audienceRegions', 'listeningStarts', 'listeningIntents', 'listeningSuccess',
    'listeningSuccessDenominator', 'listeningTime', 'listeningSurfaces', 'listeningSearch', 'listeningTopContent',
    'listeningArtists', 'listeningReleases', 'listeningNonstopSets', 'listeningWorlds', 'listeningErrors', 'listeningDemand',
  ]) assert.ok(html.includes(`id="${id}"`), `missing analytics surface #${id}`);

  assert.match(html, /Most played in measured telemetry/, 'measured-popularity qualifier missing');
  assert.match(html, /First-class listening sets, not a genre/, 'Nonstop type truth rule missing');
  assert.doesNotMatch(html, /unique people/i, 'PGA must not relabel browser identifiers as people');
  assert.match(css, /overflow-wrap: anywhere/, 'dense analytics text must wrap on mobile');
  assert.match(css, /@media \(max-width: 480px\)/, 'narrow-phone adaptation missing');
  assert.doesNotMatch(css, /transition\s*:\s*all\b/, 'transition: all is prohibited');

  assert.match(app, /'\/api\/audience'/, 'Audience must call protected aggregate endpoint');
  assert.match(app, /'\/api\/listening'/, 'Listening must call protected aggregate endpoint');
  assert.match(app, /Missing results are not rendered as zero/, 'failed-data truth rule missing');
  assert.match(app, /rate\.numerator.*rate\.denominator/s, 'conversion rendering needs explicit numerator and denominator');
  assert.match(analytics, /credentials: 'same-origin'/, 'private API requests must stay same-origin');
  assert.match(analytics, /cache: 'no-store'/, 'private API requests must bypass browser HTTP cache');
  assert.match(analytics, /window-controls-overlay/, 'installed display-mode grouping should tolerate modern PWA mode');

  assert.match(backendAnalytics, /argMax\(blob8, double3\) AS surface/, 'surface dimension must survive deduplication');
  assert.match(backendAnalytics, /argMax\(blob14, double3\) AS referrer_host/, 'coarse referrer host must survive deduplication');
  assert.match(backendAnalytics, /SELECT event_name, surface, world/, 'Listening aggregate must group by surface');
  assert.match(backendAnalytics, /SELECT client, geo, referrer_host, acquisition, display_mode/, 'Audience aggregate must expose coarse referrer');
  assert.match(admin, /referrerHost: row\.referrer_host \|\| null/, 'Audience API must expose referrer hostname');
  assert.match(admin, /surface: row\.surface \|\| null/, 'Listening API must expose surface');
  assert.match(admin, /status: catalogueOk \? 'complete' : 'partial'/, 'catalogue failure must downgrade response to partial');
  assert.match(catalogue, /CATALOGUE_ID_ALIASES_JSON/, 'explicit historical ID alias strategy missing');
  assert.match(catalogue, /nonstopSet/, 'Nonstop set identity index missing');
}

async function validateBrowserContract() {
  const { chromium, webkit } = await import('@playwright/test');
  const baseUrl = process.env.PGA_BASE_URL || 'http://127.0.0.1:4174';
  const engines = [['chromium', chromium], ['webkit', webkit]];
  const viewports = [
    ['phone', { width: 390, height: 844 }],
    ['short-landscape', { width: 844, height: 390 }],
    ['tablet', { width: 1024, height: 768 }],
    ['desktop', { width: 1440, height: 900 }],
  ];

  for (const [engineName, engine] of engines) {
    const browser = await engine.launch({ headless: true });
    try {
      for (const [viewportName, viewport] of viewports) {
        const context = await browser.newContext({ viewport, reducedMotion: 'reduce', serviceWorkers: 'block' });
        const page = await context.newPage();
        const apiRequests = [];
        const failures = [];
        page.on('pageerror', (error) => failures.push(`pageerror: ${error.message}`));
        page.on('response', (response) => {
          if (response.url().startsWith(baseUrl) && response.status() >= 400 && !response.url().includes('/api/')) {
            failures.push(`http ${response.status()}: ${response.url()}`);
          }
        });
        await page.route('**/api/home', async (route) => {
          apiRequests.push(route.request().url());
          await route.fulfill({ status: 200, contentType: 'application/json', headers: { 'cache-control': 'no-store' }, body: JSON.stringify(unavailableAggregate) });
        });
        await page.route('**/api/live', async (route) => {
          apiRequests.push(route.request().url());
          await route.fulfill({ status: 200, contentType: 'application/json', headers: { 'cache-control': 'no-store' }, body: JSON.stringify(unavailableAggregate) });
        });
        await page.route('**/api/audience?*', async (route) => {
          apiRequests.push(route.request().url());
          await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(audienceEnvelope) });
        });
        await page.route('**/api/listening?*', async (route) => {
          apiRequests.push(route.request().url());
          await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(listeningEnvelope) });
        });

        await page.goto(`${baseUrl}/`, { waitUntil: 'domcontentloaded' });
        const navRoot = viewport.width >= 980 ? '.side-nav' : '.bottom-nav';

        await page.locator(`${navRoot} [data-nav="audience"]`).click();
        await page.locator('#audienceContent').waitFor({ state: 'visible' });
        assert.equal((await page.locator('#audienceUnique').textContent()).trim(), '8');
        assert.match(await page.locator('#audienceAcquisition').textContent(), /google\.com/);
        assert.match(await page.locator('#audienceDisplayMode').textContent(), /PWA/);

        await page.locator('[data-range-view="audience"][data-range="7d"]').click();
        await page.locator('#audienceContent').waitFor({ state: 'visible' });
        assert.ok(apiRequests.some((url) => url.includes('/api/audience') && url.includes('range=7d')), `${engineName}/${viewportName} did not preserve Audience range`);

        await page.locator(`${navRoot} [data-nav="listening"]`).click();
        await page.locator('#listeningContent').waitFor({ state: 'visible' });
        assert.equal((await page.locator('#listeningSuccess').textContent()).trim(), '90%');
        assert.match(await page.locator('#listeningSuccessDenominator').textContent(), /9 confirmed starts \/ 10 play intents/);
        assert.match(await page.locator('#listeningTopContent').textContent(), /Aavo Maadi/);
        assert.match(await page.locator('#listeningArtists').textContent(), /Artist One/);
        assert.match(await page.locator('#listeningReleases').textContent(), /Current Release/);
        assert.match(await page.locator('#listeningNonstopSets').textContent(), /Nonstop Night/);
        assert.match(await page.locator('#listeningSurfaces').textContent(), /player/);
        assert.match(await page.locator('#listeningDemand').textContent(), /old sanedo/);

        const dimensions = await page.evaluate(() => ({ width: innerWidth, scrollWidth: document.documentElement.scrollWidth }));
        assert.ok(dimensions.scrollWidth <= dimensions.width, `${engineName}/${viewportName} has horizontal overflow: ${dimensions.scrollWidth} > ${dimensions.width}`);

        await page.locator('[data-range-view="listening"][data-range="90d"]').focus();
        assert.equal(await page.evaluate(() => document.activeElement?.dataset?.range), '90d', `${engineName}/${viewportName} range control not keyboard-focusable`);
        assert.deepEqual(failures, [], `${engineName}/${viewportName} emitted runtime failures`);
        await context.close();
      }
    } finally {
      await browser.close();
    }
  }
  console.log('✓ PGA Audience/Listening Chromium + WebKit contract');
}

validateStaticContract();
await validateModels();
console.log('✓ PGA Audience/Listening model + static contract');
if (browserMode) await validateBrowserContract();
