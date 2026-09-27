import { test, expect } from '@playwright/test';

const SMOKE_ORIGIN = 'http://127.0.0.1:4173';

function isSupersededDocumentImageAbort({ resourceType, errorText, startedGeneration, currentGeneration }) {
  return resourceType === 'image'
    && /net::ERR_ABORTED$/i.test(String(errorText || ''))
    && Number.isInteger(startedGeneration)
    && startedGeneration < currentGeneration;
}

function collectRuntimeFailures(page) {
  const failures = [];
  const requestGenerations = new WeakMap();
  let documentGeneration = 0;
  const sameOrigin = (url) => {
    try { return new URL(url).origin === SMOKE_ORIGIN; }
    catch { return false; }
  };

  page.on('pageerror', (error) => failures.push(`pageerror: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') failures.push(`console: ${message.text()}`);
  });
  page.on('request', (request) => {
    if (request.isNavigationRequest() && request.frame() === page.mainFrame()) documentGeneration += 1;
    requestGenerations.set(request, documentGeneration);
  });
  page.on('requestfailed', (request) => {
    if (!sameOrigin(request.url())) return;
    const errorText = request.failure()?.errorText || '';
    const startedGeneration = requestGenerations.get(request) ?? documentGeneration;
    if (isSupersededDocumentImageAbort({
      resourceType: request.resourceType(),
      errorText,
      startedGeneration,
      currentGeneration: documentGeneration,
    })) return;
    failures.push(`requestfailed: ${request.method()} ${request.url()} ${errorText}`);
  });
  page.on('response', (response) => {
    if (sameOrigin(response.url()) && response.status() >= 400) failures.push(`http ${response.status()}: ${response.url()}`);
  });

  return failures;
}

function isExpectedOfflineNetworkFailure(failure) {
  if (failure.startsWith('pageerror:')) return false;
  if (failure === 'console: Failed to load resource: net::ERR_INTERNET_DISCONNECTED') return true;
  return failure.startsWith('requestfailed:') && failure.includes('net::ERR_INTERNET_DISCONNECTED');
}

async function expectNoDocumentOverflow(page) {
  const metrics = await page.evaluate(() => ({
    viewportWidth: window.innerWidth,
    scrollWidth: document.documentElement.scrollWidth,
    bodyScrollWidth: document.body?.scrollWidth || 0,
  }));
  expect(metrics.scrollWidth, 'document should not overflow horizontally').toBeLessThanOrEqual(metrics.viewportWidth + 2);
  expect(metrics.bodyScrollWidth, 'body should not overflow horizontally').toBeLessThanOrEqual(metrics.viewportWidth + 2);
}

async function expectInsideViewport(page, selector) {
  const locator = page.locator(selector);
  await expect(locator).toBeVisible();
  // The first layout on a cold browser waits on web fonts; measure once they are in
  await page.evaluate(() => document.fonts?.ready);
  await expect.poll(async () => {
    const box = await locator.boundingBox();
    if (!box) return false;
    const viewport = await page.evaluate(() => ({ width: innerWidth, height: innerHeight }));
    return box.x >= -2
      && box.x + box.width <= viewport.width + 2
      && box.y >= -2
      && box.y + box.height <= viewport.height + 2;
  }, {
    message: `${selector} should settle fully inside the visual viewport`,
    // A cold WebKit start (the first test of its pass) can take a few seconds to settle
    timeout: 6_000,
    intervals: [50, 100, 150, 250],
  }).toBe(true);
}

async function expectAppCoversViewport(page) {
  const coverage = await page.evaluate(() => {
    const app = document.getElementById('app')?.getBoundingClientRect();
    const layer = document.querySelector('.world-layer.is-visible')?.getBoundingClientRect();
    return {
      width: innerWidth,
      height: innerHeight,
      app: app && { left: app.left, top: app.top, right: app.right, bottom: app.bottom },
      layer: layer && { left: layer.left, top: layer.top, right: layer.right, bottom: layer.bottom },
    };
  });

  expect(coverage.app, 'app shell should have a layout box').toBeTruthy();
  expect(coverage.layer, 'active background layer should have a layout box').toBeTruthy();
  expect(coverage.app.left).toBeLessThanOrEqual(2);
  expect(coverage.app.top).toBeLessThanOrEqual(2);
  expect(coverage.app.right).toBeGreaterThanOrEqual(coverage.width - 2);
  expect(coverage.app.bottom).toBeGreaterThanOrEqual(coverage.height - 2);
  expect(coverage.layer.left).toBeLessThanOrEqual(2);
  expect(coverage.layer.top).toBeLessThanOrEqual(2);
  expect(coverage.layer.right).toBeGreaterThanOrEqual(coverage.width - 2);
  expect(coverage.layer.bottom).toBeGreaterThanOrEqual(coverage.height - 2);
}

async function expectNoRuntimeFailures(page, failures, label, { ignoreFailure = null } = {}) {
  await page.waitForTimeout(150);
  const unexpectedFailures = ignoreFailure ? failures.filter((failure) => !ignoreFailure(failure)) : failures;
  expect(unexpectedFailures, `${label} should have no uncaught errors, failed same-origin requests or HTTP errors`).toEqual([]);
}

async function expectPlayerReady(page) {
  await expect(page.locator('#app')).toBeVisible();
  await expect(page.locator('#songTitle')).not.toHaveText('', { timeout: 15_000 });
  await expect(page.locator('#genreStrip .genre-button[data-genre-bound="true"]').first()).toBeVisible({ timeout: 15_000 });
}

async function measureTitleGeometry(page, title) {
  return page.evaluate((nextTitle) => {
    const trackBlock = document.querySelector('.track-block');
    const songTitle = document.getElementById('songTitle');
    if (!(trackBlock instanceof HTMLElement) || !(songTitle instanceof HTMLElement)) {
      throw new Error('Player title geometry target is missing');
    }

    songTitle.textContent = nextTitle;
    const titleLength = [...nextTitle].length;
    trackBlock.classList.toggle('is-long-title', titleLength > 28);
    trackBlock.classList.toggle('is-very-long-title', titleLength > 44);

    const anchors = {};
    for (const id of ['playButton', 'progress', 'genreStrip', 'browseButton']) {
      const rect = document.getElementById(id)?.getBoundingClientRect();
      anchors[id] = rect ? { top: rect.top, centerY: rect.top + rect.height / 2 } : null;
    }

    return {
      title: songTitle.textContent,
      viewportWidth: window.innerWidth,
      scrollWidth: document.documentElement.scrollWidth,
      bodyScrollWidth: document.body?.scrollWidth || 0,
      anchors,
    };
  }, title);
}

function expectTitleGeometryNoOverflow(metrics, label) {
  expect(metrics.scrollWidth, `${label} should not overflow the document horizontally`).toBeLessThanOrEqual(metrics.viewportWidth + 2);
  expect(metrics.bodyScrollWidth, `${label} should not overflow the body horizontally`).toBeLessThanOrEqual(metrics.viewportWidth + 2);
}

function expectStablePlayerAnchors(longTitleAnchors, shortTitleAnchors) {
  for (const id of ['playButton', 'progress', 'genreStrip', 'browseButton']) {
    expect(longTitleAnchors[id], `${id} should exist for the long title`).toBeTruthy();
    expect(shortTitleAnchors[id], `${id} should exist for the short title`).toBeTruthy();
    const centerDelta = Math.abs(longTitleAnchors[id].centerY - shortTitleAnchors[id].centerY);
    expect(centerDelta, `${id} should not jump vertically when song-title length changes`).toBeLessThanOrEqual(3);
  }
}

test('production player shell is stable, complete and uses the custom genre artwork', async ({ page }) => {
  const failures = collectRuntimeFailures(page);
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expectPlayerReady(page);

  await expectAppCoversViewport(page);
  await expectNoDocumentOverflow(page);
  for (const selector of ['#searchButton', '#queueButton', '#playButton', '#browseButton']) {
    await expectInsideViewport(page, selector);
  }

  const browse = page.locator('#browseButton');
  await expect(browse).toHaveAttribute('href', './explore/');
  await expect(browse).not.toHaveAttribute('aria-controls', /.+/);

  const genreButtons = page.locator('#genreStrip .genre-button[data-genre]');
  await expect(genreButtons).toHaveCount(6);
  const backgrounds = await genreButtons.evaluateAll((buttons) => buttons.map((button) => getComputedStyle(button).backgroundImage));
  for (const background of backgrounds) expect(background).toContain('.webp');

  const nonstopButton = page.locator('#nonstopButton');
  await nonstopButton.scrollIntoViewIfNeeded();
  await expectInsideViewport(page, '#nonstopButton');
  const nonstopBackground = await nonstopButton.evaluate((button) => getComputedStyle(button).backgroundImage);
  expect(nonstopBackground).toContain('nonstop.webp');

  await expectNoRuntimeFailures(page, failures, 'player');
});

test('short and very long song titles keep transport and discovery controls anchored', async ({ page }) => {
  const failures = collectRuntimeFailures(page);
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expectPlayerReady(page);

  const longTitle = 'Non Stop Bollywood Dandiya Garbe Ki Raat Hai 2014';
  const shortTitle = 'Ochhav Theme';

  const longTitleGeometry = await measureTitleGeometry(page, longTitle);
  expect(longTitleGeometry.title).toBe(longTitle);
  expectTitleGeometryNoOverflow(longTitleGeometry, 'very-long title state');

  const shortTitleGeometry = await measureTitleGeometry(page, shortTitle);
  expect(shortTitleGeometry.title).toBe(shortTitle);
  expectTitleGeometryNoOverflow(shortTitleGeometry, 'short title state');

  expectStablePlayerAnchors(longTitleGeometry.anchors, shortTitleGeometry.anchors);
  await expectNoRuntimeFailures(page, failures, 'title-geometry player');
});

test('Search opens without clipping and closing restores focus to the opener', async ({ page }) => {
  const failures = collectRuntimeFailures(page);
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expectPlayerReady(page);
  const searchButton = page.locator('#searchButton');
  await searchButton.click();

  const sheet = page.locator('#songSheet');
  await expect(sheet).toHaveAttribute('aria-hidden', 'false');
  await expect(page.locator('#searchInput')).toBeVisible();
  await expectInsideViewport(page, '#sheetClose');
  await expectNoDocumentOverflow(page);

  await page.locator('#sheetClose').click();
  await expect(sheet).toHaveAttribute('aria-hidden', 'true');
  await expect(searchButton).toBeFocused();
  await expectNoDocumentOverflow(page);
  await expectNoRuntimeFailures(page, failures, 'Search sheet');
});

test('Nonstop browser is reachable, keyboard-safe, populated and restores focus when closed', async ({ page }) => {
  const failures = collectRuntimeFailures(page);
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expectPlayerReady(page);

  const nonstopButton = page.locator('#nonstopButton');
  await nonstopButton.scrollIntoViewIfNeeded();
  await expectInsideViewport(page, '#nonstopButton');
  await nonstopButton.click();

  const panel = page.locator('#nonstopBrowser');
  const search = page.locator('#nonstopBrowserSearch');
  await expect(panel).toHaveAttribute('aria-hidden', 'false');
  await expect(panel).toBeFocused();
  await expect(search).toBeVisible();
  await expect(search).toHaveAttribute('aria-label', 'Search Nonstop Garba');
  await panel.press('Tab');
  await expect(search).toBeFocused();
  await expectInsideViewport(page, '#nonstopBrowserClose');

  const sets = page.locator('#nonstopBrowserList .nonstop-set');
  const firstSet = sets.first();
  await expect(firstSet).toBeVisible();
  expect(await sets.count()).toBeGreaterThan(0);
  await expect(firstSet.locator('.nonstop-set-title')).toHaveText(/\S/);
  await expect(firstSet.locator('.nonstop-set-meta')).toHaveText(/\S/);
  await expect(firstSet).toHaveAttribute('aria-label', /^(?:Currently playing|Play),\s+\S/);

  const duration = firstSet.locator('.nonstop-set-duration');
  await expect(duration).toBeVisible();
  await expect(duration).toHaveAttribute('aria-hidden', 'true');
  const durationText = (await duration.textContent() || '').trim();
  if (durationText) expect(durationText).toMatch(/^(?:\d+:\d{2}|\d+:\d{2}:\d{2})$/);

  await expect(firstSet.locator('.nonstop-set-recording, .nonstop-set-badge')).toHaveCount(0);
  await expect(page.locator('#nonstopBrowserSummary')).toHaveCount(0);
  await expectNoDocumentOverflow(page);

  await page.locator('#nonstopBrowserClose').click();
  await expect(panel).toHaveAttribute('aria-hidden', 'true');
  await expect(nonstopButton).toBeFocused();
  await expectNoDocumentOverflow(page);
  await expectNoRuntimeFailures(page, failures, 'Nonstop browser');
});

test('Explore is reached through the production player link and renders real catalogue content', async ({ page }) => {
  const failures = collectRuntimeFailures(page);
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expectPlayerReady(page);
  // Navigation commit establishes the document boundary; visible Explore UI establishes readiness.
  await Promise.all([
    page.waitForURL(/\/explore\/$/, { waitUntil: 'commit' }),
    page.locator('#browseButton').click(),
  ]);

  await expect(page.locator('#catalogueTitle')).toHaveText('Explore');
  const cards = page.locator('.collection-card');
  await expect(cards.first()).toBeVisible();
  expect(await cards.count()).toBeGreaterThan(0);
  await expectInsideViewport(page, '.close-explore');
  await expectNoDocumentOverflow(page);
  await expectNoRuntimeFailures(page, failures, 'Explore');
});

test('Explore detail preserves keyboard focus when entering and returning', async ({ page }) => {
  const failures = collectRuntimeFailures(page);
  await page.goto('/explore/', { waitUntil: 'commit' });
  const firstCard = page.locator('.collection-card').first();
  await expect(firstCard).toBeVisible();
  await firstCard.focus();
  await firstCard.press('Enter');

  await expect(page.locator('#collectionDetail')).toBeVisible();
  await expect(page.locator('#detailTitle')).toBeFocused();
  await page.locator('#backToCollections').click();
  await expect(page.locator('#collectionHome')).toBeVisible();
  await expect(firstCard).toBeFocused();
  await expectNoDocumentOverflow(page);
  await expectNoRuntimeFailures(page, failures, 'Explore detail');
});

test('active-document same-origin image request failures remain blocking', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'one deterministic Chromium classifier regression is sufficient');
  const failures = collectRuntimeFailures(page);
  const probeUrl = `${SMOKE_ORIGIN}/__browser-smoke/active-document-image.webp`;

  expect(isSupersededDocumentImageAbort({
    resourceType: 'image',
    errorText: 'net::ERR_ABORTED',
    startedGeneration: 1,
    currentGeneration: 2,
  })).toBe(true);
  expect(isSupersededDocumentImageAbort({
    resourceType: 'image',
    errorText: 'net::ERR_ABORTED',
    startedGeneration: 2,
    currentGeneration: 2,
  })).toBe(false);
  expect(isSupersededDocumentImageAbort({
    resourceType: 'script',
    errorText: 'net::ERR_ABORTED',
    startedGeneration: 1,
    currentGeneration: 2,
  })).toBe(false);

  await page.route(probeUrl, (route) => route.abort('failed'));
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expectPlayerReady(page);
  await page.evaluate((url) => new Promise((resolve) => {
    const image = new Image();
    image.onload = image.onerror = resolve;
    image.src = url;
  }), probeUrl);

  await expect.poll(() => failures.some((failure) => failure.startsWith('requestfailed: GET') && failure.includes('/__browser-smoke/active-document-image.webp'))).toBe(true);
});

test('installed shell survives an offline reload after the service worker is ready', async ({ page, context }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'one deterministic Chromium PWA contract is sufficient');
  const failures = collectRuntimeFailures(page);

  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expectPlayerReady(page);
  const serviceWorkerReady = await page.evaluate(async () => {
    if (!('serviceWorker' in navigator)) return false;
    await navigator.serviceWorker.ready;
    return true;
  });
  expect(serviceWorkerReady).toBe(true);

  await context.setOffline(true);
  try {
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expectPlayerReady(page);
    await expectAppCoversViewport(page);
    await expectNoDocumentOverflow(page);
  } finally {
    await context.setOffline(false);
  }

  await expectNoRuntimeFailures(page, failures, 'offline PWA shell', { ignoreFailure: isExpectedOfflineNetworkFailure });
});
