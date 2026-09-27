import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium, webkit } from 'playwright';

const ORIGIN = process.env.PLAYGARBA_MOBILE_QUALITY_ORIGIN || 'http://127.0.0.1:4173';
const ARTIFACT_DIR = process.env.PLAYGARBA_MOBILE_QUALITY_ARTIFACTS || 'artifacts/mobile-quality';
const TOLERANCE = 2;
const TOUCH_MIN = 44;

const viewportCases = [
  { name: 'phone-320', width: 320, height: 700 },
  { name: 'phone-360', width: 360, height: 800 },
  { name: 'phone-375', width: 375, height: 812 },
  { name: 'phone-390', width: 390, height: 844 },
  { name: 'phone-390-browser-chrome', width: 390, height: 700 },
  { name: 'phone-393', width: 393, height: 852 },
  { name: 'phone-412', width: 412, height: 915 },
  { name: 'phone-430', width: 430, height: 932 },
  { name: 'short-landscape', width: 844, height: 390 },
  { name: 'tablet-portrait', width: 768, height: 1024 },
];

const engines = [
  ['chromium', chromium],
  ['webkit', webkit],
];

function label(engine, viewport, surface) {
  return `${engine}/${viewport.name}/${surface}`;
}

function finiteRect(rect, message) {
  assert.ok(rect, `${message}: missing layout box`);
  for (const key of ['x', 'y', 'width', 'height', 'top', 'right', 'bottom', 'left']) {
    assert.ok(Number.isFinite(rect[key]), `${message}: non-finite ${key}`);
  }
  assert.ok(rect.width > 0 && rect.height > 0, `${message}: zero-size layout box`);
}

function insideViewport(rect, viewport, message) {
  finiteRect(rect, message);
  assert.ok(rect.left >= -TOLERANCE, `${message}: left edge ${rect.left}px is outside viewport`);
  assert.ok(rect.top >= -TOLERANCE, `${message}: top edge ${rect.top}px is outside viewport`);
  assert.ok(rect.right <= viewport.width + TOLERANCE, `${message}: right edge ${rect.right}px exceeds ${viewport.width}px viewport`);
  assert.ok(rect.bottom <= viewport.height + TOLERANCE, `${message}: bottom edge ${rect.bottom}px exceeds ${viewport.height}px viewport`);
}

function minTouchTarget(rect, message) {
  finiteRect(rect, message);
  assert.ok(rect.width + 0.01 >= TOUCH_MIN, `${message}: ${rect.width}px width is below ${TOUCH_MIN}px`);
  assert.ok(rect.height + 0.01 >= TOUCH_MIN, `${message}: ${rect.height}px height is below ${TOUCH_MIN}px`);
}

function assertDisjoint(first, second, message) {
  finiteRect(first, `${message} first`);
  finiteRect(second, `${message} second`);
  const separated = first.right <= second.left
    || second.right <= first.left
    || first.bottom <= second.top
    || second.bottom <= first.top;
  assert.ok(separated, `${message}: rendered rectangles intersect`);
}

async function rootMetrics(page) {
  return page.evaluate(() => ({
    viewport: { width: innerWidth, height: innerHeight },
    rootScrollWidth: document.documentElement.scrollWidth,
    bodyScrollWidth: document.body?.scrollWidth || 0,
  }));
}

function assertNoRootOverflow(metrics, message) {
  assert.ok(metrics.rootScrollWidth <= metrics.viewport.width + TOLERANCE,
    `${message}: root scrollWidth ${metrics.rootScrollWidth}px exceeds ${metrics.viewport.width}px viewport`);
  assert.ok(metrics.bodyScrollWidth <= metrics.viewport.width + TOLERANCE,
    `${message}: body scrollWidth ${metrics.bodyScrollWidth}px exceeds ${metrics.viewport.width}px viewport`);
}

async function waitForPlayer(page) {
  await page.goto(`${ORIGIN}/`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => {
    const title = document.getElementById('songTitle');
    const genres = document.querySelectorAll('#genreStrip .genre-button[data-genre-bound="true"]');
    return Boolean(title?.textContent?.trim()) && genres.length > 0;
  }, null, { timeout: 15_000 });
}

async function playerGeometry(page, engineName, viewport) {
  await waitForPlayer(page);
  const contextLabel = label(engineName, viewport, 'player');
  let metrics = await rootMetrics(page);
  assertNoRootOverflow(metrics, contextLabel);

  const geometry = await page.evaluate(() => {
    const pack = (node) => {
      if (!(node instanceof HTMLElement)) return null;
      const style = getComputedStyle(node);
      if (style.display === 'none' || style.visibility === 'hidden' || node.getClientRects().length === 0) return null;
      const box = node.getBoundingClientRect();
      return {
        x: box.x, y: box.y, width: box.width, height: box.height,
        top: box.top, right: box.right, bottom: box.bottom, left: box.left,
      };
    };
    const rect = (selector) => pack(document.querySelector(selector));
    const rects = (selector) => [...document.querySelectorAll(selector)].map(pack).filter(Boolean);
    const genreStrip = document.getElementById('genreStrip');
    return {
      title: rect('#songTitle'),
      artist: rect('#songArtist'),
      transports: [rect('#prevButton'), rect('#playButton'), rect('#nextButton')],
      progressParts: [rect('#elapsedTime'), rect('#progress'), rect('#durationTime')],
      genres: rects('#genreStrip .genre-button'),
      genreStrip: genreStrip instanceof HTMLElement ? {
        rect: pack(genreStrip),
        scrollWidth: genreStrip.scrollWidth,
        clientWidth: genreStrip.clientWidth,
        overflowX: getComputedStyle(genreStrip).overflowX,
      } : null,
      browse: rect('#browseButton'),
    };
  });

  const semanticRects = [
    geometry.title,
    geometry.artist,
    ...geometry.transports,
    ...geometry.progressParts,
    geometry.browse,
  ];
  for (const [index, rect] of semanticRects.entries()) {
    insideViewport(rect, metrics.viewport, `${contextLabel} semantic anchor ${index + 1}`);
  }
  insideViewport(geometry.genreStrip?.rect, metrics.viewport, `${contextLabel} genre strip`);
  assert.ok(geometry.genres.length > 0, `${contextLabel}: no genre anchors rendered`);
  assert.ok(geometry.genres.some((genre) => genre.right > 0 && genre.left < metrics.viewport.width),
    `${contextLabel}: no genre anchor is reachable in the visible strip`);
  if (geometry.genreStrip.scrollWidth > geometry.genreStrip.clientWidth + TOLERANCE) {
    assert.ok(['auto', 'scroll'].includes(geometry.genreStrip.overflowX),
      `${contextLabel}: overflowing genre strip uses overflow-x ${geometry.genreStrip.overflowX}`);
  }
  minTouchTarget(geometry.transports[1], `${contextLabel} primary Play target`);

  assertDisjoint(geometry.title, geometry.artist, `${contextLabel} title/artist`);
  for (const textAnchor of [geometry.title, geometry.artist]) {
    for (const transport of geometry.transports) {
      assertDisjoint(textAnchor, transport, `${contextLabel} Now Playing/transport`);
    }
  }
  for (const transport of geometry.transports) {
    for (const progressPart of geometry.progressParts) {
      assertDisjoint(transport, progressPart, `${contextLabel} transport/progress`);
    }
  }
  for (const progressPart of geometry.progressParts) {
    for (const genre of geometry.genres) {
      assertDisjoint(progressPart, genre, `${contextLabel} progress/genre`);
    }
  }
  for (const genre of geometry.genres) {
    assertDisjoint(genre, geometry.browse, `${contextLabel} genre/Explore`);
  }

  const titleStates = await page.evaluate(() => {
    const title = document.getElementById('songTitle');
    const block = document.getElementById('trackBlock');
    if (!(title instanceof HTMLElement) || !(block instanceof HTMLElement)) throw new Error('title geometry target missing');
    const anchors = () => Object.fromEntries(['playButton', 'progress', 'genreStrip', 'browseButton'].map((id) => {
      const box = document.getElementById(id)?.getBoundingClientRect();
      return [id, box ? { centerY: box.top + box.height / 2 } : null];
    }));
    const apply = (value) => {
      title.textContent = value;
      const length = [...value].length;
      block.classList.toggle('is-long-title', length > 28);
      block.classList.toggle('is-very-long-title', length > 44);
      return { anchors: anchors(), scrollWidth: document.documentElement.scrollWidth };
    };
    return {
      long: apply('Non Stop Bollywood Dandiya Garbe Ki Raat Hai 2014'),
      short: apply('Ochhav Theme'),
      viewportWidth: innerWidth,
    };
  });

  assert.ok(titleStates.long.scrollWidth <= titleStates.viewportWidth + TOLERANCE, `${contextLabel}: long title widens document`);
  assert.ok(titleStates.short.scrollWidth <= titleStates.viewportWidth + TOLERANCE, `${contextLabel}: short title widens document`);
  for (const id of ['playButton', 'progress', 'genreStrip', 'browseButton']) {
    const longAnchor = titleStates.long.anchors[id];
    const shortAnchor = titleStates.short.anchors[id];
    assert.ok(longAnchor && shortAnchor, `${contextLabel}: ${id} anchor missing`);
    const delta = Math.abs(longAnchor.centerY - shortAnchor.centerY);
    assert.ok(delta <= 3, `${contextLabel}: ${id} moved ${delta.toFixed(2)}px between long/short title states`);
  }

  metrics = await rootMetrics(page);
  assertNoRootOverflow(metrics, `${contextLabel} after title mutation`);
}

async function waitForExplore(page) {
  await page.goto(`${ORIGIN}/explore/`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.collection-card', { state: 'visible', timeout: 15_000 });
  await page.waitForSelector('.search-explore', { state: 'visible', timeout: 5_000 });
}

async function exploreGeometry(page, engineName, viewport) {
  await waitForExplore(page);
  const contextLabel = label(engineName, viewport, 'explore');
  let metrics = await rootMetrics(page);
  assertNoRootOverflow(metrics, contextLabel);

  const controls = await page.evaluate(() => {
    const rect = (selector) => {
      const node = document.querySelector(selector);
      if (!(node instanceof HTMLElement)) return null;
      const box = node.getBoundingClientRect();
      return {
        x: box.x, y: box.y, width: box.width, height: box.height,
        top: box.top, right: box.right, bottom: box.bottom, left: box.left,
      };
    };
    return { search: rect('.search-explore'), close: rect('.close-explore') };
  });
  insideViewport(controls.search, metrics.viewport, `${contextLabel} Search`);
  insideViewport(controls.close, metrics.viewport, `${contextLabel} Close`);
  minTouchTarget(controls.search, `${contextLabel} Search target`);
  minTouchTarget(controls.close, `${contextLabel} Close target`);

  const search = page.locator('.search-explore');
  await search.click();
  await page.waitForFunction(() => document.body.classList.contains('explore-search-open'));
  await page.waitForFunction(() => document.activeElement?.id === 'catalogueSearch');
  const searchOpen = await page.evaluate(() => {
    const pack = (box) => box ? {
      x: box.x, y: box.y, width: box.width, height: box.height,
      top: box.top, right: box.right, bottom: box.bottom, left: box.left,
    } : null;
    return {
      panel: pack(document.getElementById('catalogueSearchPanel')?.getBoundingClientRect()),
      input: pack(document.getElementById('catalogueSearch')?.getBoundingClientRect()),
      viewport: { width: innerWidth, height: innerHeight },
    };
  });
  insideViewport(searchOpen.panel, searchOpen.viewport, `${contextLabel} Search panel`);
  insideViewport(searchOpen.input, searchOpen.viewport, `${contextLabel} Search input`);
  assertNoRootOverflow(await rootMetrics(page), `${contextLabel} Search open`);

  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !document.body.classList.contains('explore-search-open'));
  await page.waitForFunction(() => document.activeElement?.classList.contains('search-explore'));

  const shelves = await page.evaluate(() => [...document.querySelectorAll('.collection-grid--shelf,.essential-release-rail,.release-rail')]
    .filter((node) => node instanceof HTMLElement)
    .map((node) => ({
      scrollWidth: node.scrollWidth,
      clientWidth: node.clientWidth,
      overflowX: getComputedStyle(node).overflowX,
    })));
  assert.ok(shelves.length > 0, `${contextLabel}: no Explore shelves found`);
  for (const shelf of shelves) {
    if (shelf.scrollWidth <= shelf.clientWidth + TOLERANCE) continue;
    assert.ok(['auto', 'scroll'].includes(shelf.overflowX), `${contextLabel}: overflowing shelf uses overflow-x ${shelf.overflowX}`);
  }
  assertNoRootOverflow(await rootMetrics(page), `${contextLabel} shelves`);

  if (viewport.name === 'phone-390') {
    const firstCard = page.locator('.collection-card').first();
    await firstCard.focus();
    await firstCard.press('Enter');
    await page.waitForSelector('#collectionDetail:not([hidden])', { state: 'visible', timeout: 5_000 });
    await page.waitForFunction(() => document.activeElement?.id === 'detailTitle');
    await page.locator('#backToCollections').click();
    await page.waitForSelector('#collectionHome', { state: 'visible', timeout: 5_000 });
    await page.waitForFunction(() => document.activeElement?.classList.contains('collection-card'));
    assertNoRootOverflow(await rootMetrics(page), `${contextLabel} detail return`);
  }

  metrics = await rootMetrics(page);
  assertNoRootOverflow(metrics, `${contextLabel} final`);
}

async function reducedMotionCheck(browser, engineName) {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    hasTouch: true,
    reducedMotion: 'reduce',
    serviceWorkers: 'block',
  });
  const page = await context.newPage();
  try {
    await waitForExplore(page);
    assert.equal(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches), true,
      `${engineName}: reduced-motion emulation did not apply`);
    await page.locator('.search-explore').click();
    await page.waitForFunction(() => document.body.classList.contains('explore-search-open'));
    const motion = await page.evaluate(() => {
      const button = document.querySelector('.search-explore');
      const panel = document.getElementById('catalogueSearchPanel');
      return {
        buttonTransition: button ? getComputedStyle(button).transitionDuration : null,
        panelAnimation: panel ? getComputedStyle(panel).animationName : null,
        panelDuration: panel ? getComputedStyle(panel).animationDuration : null,
      };
    });
    assert.ok(motion.buttonTransition && motion.buttonTransition.split(',').every((value) => value.trim() === '0s'),
      `${engineName}: Search transition remains active under reduced motion (${motion.buttonTransition})`);
    assert.ok(motion.panelAnimation === 'none' || motion.panelDuration === '0s',
      `${engineName}: Search panel animation remains active under reduced motion (${motion.panelAnimation}/${motion.panelDuration})`);
  } finally {
    await context.close();
  }
}

async function captureFailure(page, name) {
  try {
    await fs.mkdir(ARTIFACT_DIR, { recursive: true });
    const safe = name.replace(/[^a-z0-9_.-]+/gi, '-').toLowerCase();
    await page.screenshot({ path: path.join(ARTIFACT_DIR, `${safe}.png`), fullPage: true });
  } catch {
    // Diagnostics must never replace the original assertion failure.
  }
}

async function runViewport(browser, engineName, viewport) {
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    deviceScaleFactor: 2,
    hasTouch: true,
    serviceWorkers: 'block',
  });
  const page = await context.newPage();
  const caseName = `${engineName}-${viewport.name}`;
  try {
    await playerGeometry(page, engineName, viewport);
    await exploreGeometry(page, engineName, viewport);
    console.log(`PASS ${caseName}`);
  } catch (error) {
    await captureFailure(page, caseName);
    throw error;
  } finally {
    await context.close();
  }
}

let failures = 0;
for (const [engineName, engine] of engines) {
  const browser = await engine.launch({ headless: true });
  try {
    for (const viewport of viewportCases) {
      try {
        await runViewport(browser, engineName, viewport);
      } catch (error) {
        failures += 1;
        console.error(`FAIL ${engineName}/${viewport.name}: ${error?.stack || error}`);
      }
    }
    try {
      await reducedMotionCheck(browser, engineName);
      console.log(`PASS ${engineName}/phone-390-reduced-motion`);
    } catch (error) {
      failures += 1;
      console.error(`FAIL ${engineName}/phone-390-reduced-motion: ${error?.stack || error}`);
    }
  } finally {
    await browser.close();
  }
}

if (failures > 0) throw new Error(`Mobile quality gate failed in ${failures} case(s). See assertions and failure screenshots.`);

console.log(`Mobile quality gate passed ${viewportCases.length * engines.length} viewport/browser cases plus reduced-motion checks.`);
console.log('The 390x700 browser-chrome case models reduced visual height only; it does not emulate physical safe-area insets.');
console.log('Evidence is deterministic browser emulation only; it does not claim physical iOS/Android/PWA device verification.');