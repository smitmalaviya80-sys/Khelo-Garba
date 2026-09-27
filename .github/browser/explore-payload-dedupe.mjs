import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const baseUrl = process.env.EXPLORE_DEDUPE_BASE_URL || 'http://127.0.0.1:4173/catalogue/';
const songs = JSON.parse(await readFile('data/songs.json', 'utf8'));
const index = JSON.parse(await readFile('data/catalogue/index.json', 'utf8'));
const sessionSong = songs.find((song) => song?.id && String(song?.presentationRole || 'catalogue') === 'catalogue');
assert.ok(sessionSong?.id, 'fixture needs at least one canonical song');

const corePaths = [
  '/data/songs.json',
  '/data/releases.json',
  '/data/release-artwork.json',
  '/data/catalogue/index.json',
];
const sharedPaths = [
  ...corePaths,
  ...(index?.discovery?.artists || []).map((path) => `/${path}`),
];
const uniqueSharedPaths = [...new Set(sharedPaths)];

async function runCase(browser, { listeningState }) {
  const context = await browser.newContext({ serviceWorkers: 'block' });
  await context.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.origin !== new URL(baseUrl).origin) return route.abort();
    if (route.request().resourceType() === 'image' || route.request().resourceType() === 'font') return route.abort();
    return route.continue();
  });

  if (listeningState) {
    await context.addInitScript(({ songId, genre }) => {
      localStorage.setItem('garba:session', JSON.stringify({ songId, genreId: genre, elapsed: 12 }));
    }, { songId: sessionSong.id, genre: sessionSong.genre || 'traditional' });
  }

  const page = await context.newPage();
  const counts = new Map();
  const statuses = new Map();
  page.on('request', (request) => {
    const pathname = new URL(request.url()).pathname;
    if (uniqueSharedPaths.includes(pathname)) counts.set(pathname, (counts.get(pathname) || 0) + 1);
  });
  page.on('response', (response) => {
    const pathname = new URL(response.url()).pathname;
    if (uniqueSharedPaths.includes(pathname)) statuses.set(pathname, response.status());
  });

  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => {
    const text = document.getElementById('catalogueCount')?.textContent || '';
    return text && !text.startsWith('Loading');
  });
  await page.locator('.collection-card[data-collection-id^="artist-"]').first().waitFor({ state: 'visible' });
  await page.waitForFunction(() => document.querySelector('.collection-card.artist-collection-card'));

  if (listeningState) {
    await page.locator('#personalListeningSection').waitFor({ state: 'visible' });
  } else {
    assert.equal(await page.locator('#personalListeningSection').count(), 0, 'no-state Explore must not render My Garba');
  }

  await page.waitForTimeout(250);
  for (const pathname of uniqueSharedPaths) {
    assert.equal(statuses.get(pathname), 200, `${pathname} must load successfully`);
    assert.equal(counts.get(pathname), 1, `${pathname} must be fetched exactly once per Explore document`);
  }

  const artistArtworkCount = await page.evaluate(() => performance.getEntriesByName(new URL('../data/artist-artwork.json', location.href).href).length);
  assert.ok(artistArtworkCount <= 1, 'artist-artwork.json must not be duplicated');

  await context.close();
  return Object.fromEntries([...counts.entries()].sort(([a], [b]) => a.localeCompare(b)));
}

async function runPartialCoreRetryCase(browser) {
  const context = await browser.newContext({ serviceWorkers: 'block' });
  const counts = new Map();
  let releasesFailedOnce = false;

  await context.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.origin !== new URL(baseUrl).origin) return route.abort();
    if (route.request().resourceType() === 'image' || route.request().resourceType() === 'font') return route.abort();
    if (url.pathname === '/data/releases.json' && !releasesFailedOnce) {
      releasesFailedOnce = true;
      return route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"temporary"}' });
    }
    return route.continue();
  });

  const page = await context.newPage();
  page.on('request', (request) => {
    const pathname = new URL(request.url()).pathname;
    if (corePaths.includes(pathname)) counts.set(pathname, (counts.get(pathname) || 0) + 1);
  });

  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => {
    const text = document.getElementById('catalogueCount')?.textContent || '';
    return text && !text.startsWith('Loading');
  });

  assert.equal(releasesFailedOnce, true, 'fixture must fail releases.json exactly once before retry');
  assert.equal(counts.get('/data/releases.json'), 1, 'first fail-open load must attempt releases.json once');

  const recovery = await page.evaluate(async () => {
    const store = window.__PLAYGARBA_EXPLORE_PAGE_DATA_V1__;
    if (!store?.loadCore) throw new Error('shared Explore page-data store unavailable');
    const second = await store.loadCore();
    const third = await store.loadCore();
    return {
      secondReleaseCount: Array.isArray(second?.releases) ? second.releases.length : -1,
      thirdReleaseCount: Array.isArray(third?.releases) ? third.releases.length : -1,
    };
  });

  assert.ok(recovery.secondReleaseCount > 0, 'second loadCore() must recover the real releases payload');
  assert.equal(recovery.thirdReleaseCount, recovery.secondReleaseCount, 'fully recovered core must remain memoised');
  assert.equal(counts.get('/data/releases.json'), 2, 'only the unresolved releases payload should be retried');
  for (const pathname of corePaths.filter((pathname) => pathname !== '/data/releases.json')) {
    assert.equal(counts.get(pathname), 1, `${pathname} must stay deduplicated across partial-core recovery`);
  }

  await context.close();
  return Object.fromEntries(corePaths.map((pathname) => [pathname, counts.get(pathname) || 0]));
}

const browser = await chromium.launch({ headless: true });
try {
  const noState = await runCase(browser, { listeningState: false });
  const withState = await runCase(browser, { listeningState: true });
  const partialRetry = await runPartialCoreRetryCase(browser);
  console.log('Explore shared payload counts without personal state:', JSON.stringify(noState));
  console.log('Explore shared payload counts with personal state:', JSON.stringify(withState));
  console.log('Explore partial-core retry counts:', JSON.stringify(partialRetry));
  console.log('✓ Explore reuses successful page-local payloads and retries only unresolved core resources');
} finally {
  await browser.close();
}
