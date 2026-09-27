import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';

const baseUrl = process.env.PGA_BASE_URL || 'http://127.0.0.1:4174';
const metric = (value) => ({ value, precision: 'exact', sampled: false });

const audienceEnvelope = {
  status: 'complete',
  generatedAt: '2026-09-10T07:00:00.000Z',
  dataThrough: '2026-09-10T06:59:00.000Z',
  data: {
    range: '30d',
    summary: {
      uniqueBrowsers: metric(8),
      sessions: metric(10),
      newBrowserIds: metric(3),
      returningBrowserIds: metric(5),
    },
    breakdowns: [],
  },
};

const listeningEnvelope = {
  status: 'complete',
  generatedAt: '2026-09-10T07:00:00.000Z',
  dataThrough: '2026-09-10T06:59:00.000Z',
  data: {
    range: '30d',
    listeningMs: metric(60_000),
    search: {},
    rows: [
      { eventName: 'play_intent', surface: 'player', events: metric(10) },
      { eventName: 'playback_started', surface: 'player', contentType: 'song', contentId: 'song-ci', canonicalId: 'song-ci', contentLabel: 'CI song', identityStatus: 'resolved', events: metric(9) },
    ],
  },
};

const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
  const page = await context.newPage();
  const failures = [];
  page.on('pageerror', (error) => failures.push(error.message));

  await page.addInitScript(() => {
    let online = true;
    const records = [];
    Object.defineProperty(window.navigator, 'onLine', {
      configurable: true,
      get: () => online,
    });

    window.__PGA_FETCH_RECORDS = records;
    window.__PGA_SET_ONLINE = (next) => {
      online = Boolean(next);
      window.dispatchEvent(new Event(online ? 'online' : 'offline'));
    };
    window.__PGA_RESOLVE_FETCH = (index, envelope) => {
      const record = records[index];
      if (!record) throw new Error(`missing fetch record ${index}`);
      record.lateResolveAttempted = record.aborted;
      record.resolve(new Response(JSON.stringify(envelope), {
        status: 200,
        headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
      }));
    };

    window.fetch = (input, options = {}) => new Promise((resolve, reject) => {
      const url = String(input?.url || input);
      const record = { url, aborted: false, lateResolveAttempted: false, resolve, reject };
      records.push(record);
      const signal = options?.signal;
      if (signal?.aborted) {
        record.aborted = true;
        reject(new DOMException('Aborted', 'AbortError'));
        return;
      }
      signal?.addEventListener('abort', () => {
        record.aborted = true;
        reject(new DOMException('Aborted', 'AbortError'));
      }, { once: true });
    });
  });

  await page.goto(`${baseUrl}/#audience`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__PGA_FETCH_RECORDS?.length === 1);
  assert.match(await page.evaluate(() => window.__PGA_FETCH_RECORDS[0].url), /\/api\/audience\?range=30d/);

  await page.evaluate(() => window.__PGA_SET_ONLINE(false));
  await page.waitForFunction(() => window.__PGA_FETCH_RECORDS[0].aborted === true);
  assert.equal(await page.locator('#boundary').getAttribute('data-state'), 'offline');
  assert.equal(await page.locator('#audienceState').getAttribute('data-state'), 'offline');
  assert.equal(await page.locator('#audienceContent').isHidden(), true);

  await page.evaluate((payload) => window.__PGA_RESOLVE_FETCH(0, payload), audienceEnvelope);
  await page.waitForTimeout(50);
  assert.equal(await page.locator('#boundary').getAttribute('data-state'), 'offline', 'late Audience response must not clear Offline');
  assert.equal(await page.locator('#audienceState').getAttribute('data-state'), 'offline', 'late Audience response must not render');
  assert.equal(await page.locator('#audienceContent').isHidden(), true);

  await page.evaluate(() => window.__PGA_SET_ONLINE(true));
  await page.waitForFunction(() => window.__PGA_FETCH_RECORDS.length === 2);
  await page.evaluate((payload) => window.__PGA_RESOLVE_FETCH(1, payload), audienceEnvelope);
  await page.locator('#audienceContent').waitFor({ state: 'visible' });
  assert.equal((await page.locator('#audienceUnique').textContent()).trim(), '8');

  await page.evaluate(() => window.PGA_TEST.selectView('listening'));
  await page.waitForFunction(() => window.__PGA_FETCH_RECORDS.length === 3);
  assert.match(await page.evaluate(() => window.__PGA_FETCH_RECORDS[2].url), /\/api\/listening\?range=30d/);

  await page.evaluate(() => window.__PGA_SET_ONLINE(false));
  await page.waitForFunction(() => window.__PGA_FETCH_RECORDS[2].aborted === true);
  assert.equal(await page.locator('#listeningState').getAttribute('data-state'), 'offline');
  assert.equal(await page.locator('#listeningContent').isHidden(), true);

  await page.evaluate((payload) => window.__PGA_RESOLVE_FETCH(2, payload), listeningEnvelope);
  await page.waitForTimeout(50);
  assert.equal(await page.locator('#boundary').getAttribute('data-state'), 'offline', 'late Listening response must not clear Offline');
  assert.equal(await page.locator('#listeningState').getAttribute('data-state'), 'offline', 'late Listening response must not render');

  await page.evaluate(() => window.__PGA_SET_ONLINE(true));
  await page.waitForFunction(() => window.__PGA_FETCH_RECORDS.length === 4);
  await page.evaluate((payload) => window.__PGA_RESOLVE_FETCH(3, payload), listeningEnvelope);
  await page.locator('#listeningContent').waitFor({ state: 'visible' });
  assert.equal((await page.locator('#listeningStarts').textContent()).trim(), '9');

  const records = await page.evaluate(() => window.__PGA_FETCH_RECORDS.map(({ url, aborted, lateResolveAttempted }) => ({ url, aborted, lateResolveAttempted })));
  assert.equal(records[0].aborted, true);
  assert.equal(records[0].lateResolveAttempted, true);
  assert.equal(records[2].aborted, true);
  assert.equal(records[2].lateResolveAttempted, true);
  assert.deepEqual(failures, []);

  await context.close();
  console.log('✓ PGA Audience/Listening offline transition aborts stale requests and recovers online');
} finally {
  await browser.close();
}
