#!/usr/bin/env node

import { writeFile } from 'node:fs/promises';
import process from 'node:process';
import {
  DEFAULT_BUDGETS,
  SESSION_PROFILES,
  attachNetworkAccounting,
  collectSessionSnapshot,
  compactSnapshot,
  evaluateSessionBudgets,
  exerciseExploreRoundTrip,
  exercisePlayerCycle,
  installSessionInstrumentation,
  makeNetworkState,
  parseSessionArgs,
  resetSessionTransientMetrics,
  usageText,
} from './session-stability-lib.mjs';

const STARTUP_SHEET_BUDGETS = Object.freeze({
  closedSongRows: 0,
  closedSongListChildren: 0,
});

const SOAK_BUDGETS = Object.freeze({
  ...DEFAULT_BUDGETS,
  domNodeGrowth: 1300,
  jsEventListenerGrowth: 150,
});

async function loadChromium() {
  try {
    const { chromium } = await import('@playwright/test');
    return chromium;
  } catch {
    console.error('Missing @playwright/test. Use the repository-standard temporary runner without changing package.json:');
    console.error('  npm install --no-save --no-package-lock @playwright/test@1.55.0');
    console.error('  npx playwright install chromium');
    process.exit(2);
  }
}

function attachRuntimeFailureCapture(page, originValue, failures, requestAborts) {
  let documentGeneration = 0;
  const requestGenerations = new WeakMap();

  const onRequest = (request) => {
    try {
      if (request.isNavigationRequest() && request.frame() === page.mainFrame()) documentGeneration += 1;
    } catch {
      // If frame identity is unavailable, keep the current generation.
    }
    requestGenerations.set(request, documentGeneration);
  };
  const onPageError = (error) => failures.push(`pageerror: ${error.message}`);
  const onConsole = (message) => {
    if (message.type() !== 'error') return;
    const text = message.text();
    if (text.includes('ERR_INTERNET_DISCONNECTED')) return;
    try {
      const sourceUrl = message.location()?.url;
      if (sourceUrl && new URL(sourceUrl).origin !== originValue) return;
    } catch {
      // Keep an unparseable same-document console error rather than hiding it.
    }
    failures.push(`console: ${text}`);
  };
  const onRequestFailed = (request) => {
    try {
      const url = new URL(request.url());
      if (url.origin !== originValue) return;
      if (url.searchParams.get('session-soak') === 'offline') return;
      const errorText = request.failure()?.errorText || '';
      const detail = `${request.method()} ${url.pathname}${url.search} ${errorText}`.trim();
      if (errorText.includes('ERR_ABORTED')) {
        const startedGeneration = requestGenerations.get(request);
        let detached = false;
        try { detached = request.frame().isDetached(); } catch { detached = false; }
        const supersededDocument = Number.isInteger(startedGeneration) && startedGeneration < documentGeneration;
        if (supersededDocument || detached) {
          requestAborts.push(`${detail} [superseded-document]`);
          return;
        }
      }
      failures.push(`requestfailed: ${detail}`);
    } catch {
      // Ignore malformed/non-URL request values.
    }
  };
  const onResponse = (response) => {
    try {
      const url = new URL(response.url());
      if (url.origin === originValue && response.status() >= 400) {
        failures.push(`http ${response.status()}: ${url.pathname}${url.search}`);
      }
    } catch {
      // Ignore malformed/non-URL response values.
    }
  };

  page.on('request', onRequest);
  page.on('pageerror', onPageError);
  page.on('console', onConsole);
  page.on('requestfailed', onRequestFailed);
  page.on('response', onResponse);
  return () => {
    page.off('request', onRequest);
    page.off('pageerror', onPageError);
    page.off('console', onConsole);
    page.off('requestfailed', onRequestFailed);
    page.off('response', onResponse);
  };
}

async function waitForPlayer(page, origin) {
  await page.goto(origin, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  await page.waitForFunction(() => {
    const title = document.getElementById('songTitle');
    const play = document.getElementById('playButton');
    return Boolean(title?.textContent?.trim() && play?.getBoundingClientRect().width);
  }, null, { timeout: 20_000 });

  const catalogueReady = await page.waitForFunction(() => window.GARBA_CATALOGUE_READY === true, null, { timeout: 30_000 })
    .then(() => true)
    .catch(() => false);
  return { catalogueReady };
}

async function configureCdp(page) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Performance.enable').catch(() => {});
  await cdp.send('Network.enable').catch(() => {});
  return cdp;
}

function uniqueFailures(failures) {
  return [...new Set(failures)];
}

async function captureClosedSheetBaseline(page) {
  return page.evaluate(() => {
    const sheet = document.getElementById('songSheet');
    const songList = document.getElementById('songList');
    return {
      sheetPresent: Boolean(sheet),
      songListPresent: Boolean(songList),
      sheetAriaHidden: sheet?.getAttribute('aria-hidden') ?? null,
      sheetTitle: document.getElementById('sheetTitle')?.textContent?.trim() || null,
      songRowCount: songList?.querySelectorAll('.song-row').length ?? null,
      songListChildCount: songList?.children.length ?? null,
      emptyStateCount: songList?.querySelectorAll('.empty-state').length ?? null,
      domNodeCount: document.getElementsByTagName('*').length,
    };
  });
}

async function snapshotSheetSurface(page) {
  return page.evaluate(() => {
    const sheet = document.getElementById('songSheet');
    const songList = document.getElementById('songList');
    return {
      sheetAriaHidden: sheet?.getAttribute('aria-hidden') ?? null,
      title: document.getElementById('sheetTitle')?.textContent?.trim() || null,
      songRowCount: songList?.querySelectorAll('.song-row').length ?? null,
      songListChildCount: songList?.children.length ?? null,
      emptyStateCount: songList?.querySelectorAll('.empty-state').length ?? null,
    };
  });
}

async function closeProbeSheet(page) {
  const close = page.locator('#sheetClose').first();
  if (!(await close.count()) || !(await close.isVisible().catch(() => false))) return false;
  const clicked = await close.click({ timeout: 2_500 }).then(() => true).catch(() => false);
  if (!clicked) return false;
  return page.waitForFunction(() => document.getElementById('songSheet')?.getAttribute('aria-hidden') === 'true', null, { timeout: 5_000 })
    .then(() => true)
    .catch(() => false);
}

async function openProbeSurface(page, triggerSelector, expectedTitle, { searchQuery = null, requireSongRows = false } = {}) {
  const trigger = page.locator(triggerSelector).first();
  const result = {
    trigger: triggerSelector,
    expectedTitle,
    clicked: false,
    opened: false,
    materialised: false,
  };

  if (!(await trigger.count()) || !(await trigger.isVisible().catch(() => false)) || !(await trigger.isEnabled().catch(() => false))) {
    return { ...result, surface: await snapshotSheetSurface(page) };
  }

  result.clicked = await trigger.click({ timeout: 2_500 }).then(() => true).catch(() => false);
  if (!result.clicked) return { ...result, surface: await snapshotSheetSurface(page) };

  const expectedTitles = Array.isArray(expectedTitle) ? expectedTitle : [expectedTitle];
  result.opened = await page.waitForFunction((titles) => {
    const sheet = document.getElementById('songSheet');
    const sheetTitle = document.getElementById('sheetTitle')?.textContent?.trim();
    return sheet?.getAttribute('aria-hidden') === 'false' && titles.includes(sheetTitle);
  }, expectedTitles, { timeout: 5_000 }).then(() => true).catch(() => false);

  if (searchQuery !== null && result.opened) {
    const input = page.locator('#searchInput').first();
    if (await input.isVisible().catch(() => false)) {
      await input.fill(searchQuery);
      await page.waitForFunction(() => document.querySelectorAll('#songList .song-row').length > 0, null, { timeout: 5_000 }).catch(() => {});
    }
  }

  const surface = await snapshotSheetSurface(page);
  result.materialised = requireSongRows
    ? Number(surface.songRowCount) > 0
    : Number(surface.songListChildCount) > 0;
  return { ...result, surface };
}

async function exerciseStartupSheetMaterialisation(browser, origin) {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    deviceScaleFactor: 1,
    hasTouch: false,
    isMobile: false,
    serviceWorkers: 'allow',
  });
  const page = await context.newPage();
  const result = {
    isolatedContext: true,
    catalogueReady: false,
    songs: null,
    search: null,
    queue: null,
    favourites: null,
    closedBetweenSurfaces: [],
  };

  try {
    const browseUrl = new URL(origin);
    browseUrl.searchParams.set('browse', '1');
    browseUrl.searchParams.set('session-soak', 'startup-sheet-probe');
    const boot = await waitForPlayer(page, browseUrl.href);
    result.catalogueReady = Boolean(boot.catalogueReady);
    await page.waitForTimeout(100);

    const songsSurface = await snapshotSheetSurface(page);
    result.songs = {
      trigger: 'query:browse=1',
      expectedTitle: 'Songs',
      clicked: true,
      opened: songsSurface.sheetAriaHidden === 'false' && songsSurface.title === 'Songs',
      materialised: Number(songsSurface.songRowCount) > 0,
      surface: songsSurface,
    };

    const searchQuery = (await page.locator('#songTitle').textContent().catch(() => ''))?.trim() || 'Garba';
    result.closedBetweenSurfaces.push(await closeProbeSheet(page));
    result.search = await openProbeSurface(page, '#searchButton', 'Search', { searchQuery, requireSongRows: true });

    result.closedBetweenSurfaces.push(await closeProbeSheet(page));
    result.queue = await openProbeSurface(page, '#queueButton', ['Up next', 'After this set']);

    result.closedBetweenSurfaces.push(await closeProbeSheet(page));
    result.favourites = await openProbeSurface(page, '#favouritesButton', 'My Garba');
    result.closedBetweenSurfaces.push(await closeProbeSheet(page));
  } finally {
    await context.close();
  }

  return result;
}

function startupSheetFailures(baseline, firstUse) {
  const failures = [];
  if (!baseline?.sheetPresent || !baseline?.songListPresent) {
    failures.push({ code: 'startup-sheet-baseline-missing', message: 'Warm startup did not expose the expected song sheet and song list DOM for baseline inspection.' });
    return failures;
  }
  if (baseline.sheetAriaHidden !== 'true') {
    failures.push({ code: 'startup-sheet-not-closed', message: `Warm startup song sheet aria-hidden was ${String(baseline.sheetAriaHidden)} instead of true.` });
  }
  if (baseline.songRowCount !== STARTUP_SHEET_BUDGETS.closedSongRows) {
    failures.push({ code: 'startup-sheet-hidden-song-rows', message: `Closed warm startup retained ${baseline.songRowCount} .song-row nodes; budget is ${STARTUP_SHEET_BUDGETS.closedSongRows}.` });
  }
  if (baseline.songListChildCount !== STARTUP_SHEET_BUDGETS.closedSongListChildren) {
    failures.push({ code: 'startup-sheet-hidden-children', message: `Closed warm startup retained ${baseline.songListChildCount} song-list children; budget is ${STARTUP_SHEET_BUDGETS.closedSongListChildren}.` });
  }
  if (!firstUse?.catalogueReady) {
    failures.push({ code: 'startup-sheet-probe-catalogue-not-ready', message: 'The isolated first-use sheet probe did not reach full catalogue readiness.' });
  }
  if (firstUse?.closedBetweenSurfaces?.some((closed) => !closed)) {
    failures.push({ code: 'startup-sheet-probe-close-failed', message: 'The isolated first-use probe could not return the song sheet to a closed state between surfaces.' });
  }

  for (const [name, surface] of Object.entries({
    songs: firstUse?.songs,
    search: firstUse?.search,
    queue: firstUse?.queue,
    favourites: firstUse?.favourites,
  })) {
    if (!surface?.opened) {
      failures.push({ code: `startup-sheet-${name}-open-failed`, message: `First explicit ${name} use did not open the expected song-sheet mode.` });
      continue;
    }
    if (!surface.materialised) {
      failures.push({ code: `startup-sheet-${name}-materialisation-failed`, message: `First explicit ${name} use did not materialise song-sheet content on demand.` });
    }
  }

  return failures;
}

async function settleReturnedPlayer(page) {
  // Explore's explicit route changes can otherwise tear down the just-returned player
  // while its normal post-load catalogue/idle work is still in flight. Let that work
  // finish instead of teaching the error collector to ignore active-document aborts.
  await page.waitForFunction(() => window.GARBA_CATALOGUE_READY === true, null, { timeout: 10_000 }).catch(() => {});
  await page.waitForTimeout(250);
  await page.waitForLoadState('networkidle', { timeout: 5_000 }).catch(() => {});
}

async function retryExploreDetailCoverage(page, origin, journey) {
  if (!journey?.entered || (journey.detailOpened && journey.detailClosed)) return journey;
  const exploreUrl = new URL('./explore/', origin).href;
  const retry = {
    attempted: true,
    entered: false,
    detailOpened: false,
    detailClosed: false,
  };

  await settleReturnedPlayer(page);
  const response = await page.goto(exploreUrl, { waitUntil: 'domcontentloaded', timeout: 20_000 }).catch(() => null);
  retry.entered = Boolean(response) && await page.locator('#catalogueTitle').isVisible().catch(() => false);
  if (retry.entered) {
    const firstCard = page.locator('.collection-card').first();
    await firstCard.waitFor({ state: 'visible', timeout: 15_000 }).catch(() => {});
    await firstCard.scrollIntoViewIfNeeded().catch(() => {});
    retry.detailOpened = await firstCard.click({ timeout: 2_500 }).then(() => true).catch(() => false);
    if (retry.detailOpened) {
      retry.detailOpened = await page.locator('#collectionDetail:not([hidden])')
        .waitFor({ state: 'visible', timeout: 5_000 })
        .then(() => true)
        .catch(() => false);
    }
    if (retry.detailOpened) {
      const back = page.locator('#backToCollections');
      await back.waitFor({ state: 'visible', timeout: 5_000 }).catch(() => {});
      retry.detailClosed = await back.click({ timeout: 2_500 }).then(() => true).catch(() => false);
      if (retry.detailClosed) {
        retry.detailClosed = await page.waitForFunction(() => {
          const detail = document.getElementById('collectionDetail');
          const home = document.getElementById('collectionHome');
          return Boolean(
            detail?.hidden
            && home
            && !home.hidden
            && !history.state?.collection
            && !history.state?.release
            && !history.state?.search
          );
        }, null, { timeout: 5_000 }).then(() => true).catch(() => false);
      }
    }
  }

  await page.goto(origin, { waitUntil: 'domcontentloaded', timeout: 20_000 }).catch(() => null);
  const returned = await page.waitForFunction(() => Boolean(document.getElementById('playButton')), null, { timeout: 10_000 })
    .then(() => true)
    .catch(() => false);
  if (returned) await settleReturnedPlayer(page);

  return {
    ...journey,
    detailOpened: retry.detailOpened,
    detailClosed: retry.detailClosed,
    returnedToPlayer: Boolean(journey.returnedToPlayer && returned),
    detailCoverageRetry: retry,
  };
}

function coverageFailures(boot, journeys, exploreJourneys) {
  const failures = [];
  if (!boot?.catalogueReady) {
    failures.push({ code: 'catalogue-not-ready', message: 'Full catalogue did not become ready before the warm-session soak.' });
  }
  if (!journeys.some((journey) => journey.genres?.clicks > 0)) {
    failures.push({ code: 'genre-coverage-missing', message: 'No genre switch completed during the player soak.' });
  }
  if (!journeys.some((journey) => journey.search?.status === 'exercised')) {
    failures.push({ code: 'search-coverage-missing', message: 'Search was not exercised during the player soak.' });
  }
  if (!journeys.some((journey) => journey.queueAndFavourites?.queue === 'opened')) {
    failures.push({ code: 'queue-coverage-missing', message: 'Queue was not opened during the player soak.' });
  }
  if (!journeys.some((journey) => journey.nonstop?.status === 'exercised')) {
    failures.push({ code: 'nonstop-coverage-missing', message: 'Nonstop chooser was not exercised during the player soak.' });
  }
  if (!journeys.some((journey) => journey.atmosphere?.status === 'exercised')) {
    failures.push({ code: 'atmosphere-coverage-missing', message: 'Garba Atmosphere was not exercised during the player soak.' });
  }
  const finalJourney = journeys.at(-1);
  if (finalJourney?.offlineRecovery !== 'recovered') {
    failures.push({ code: 'offline-recovery-missing', message: `Offline recovery result was ${finalJourney?.offlineRecovery || 'missing'}.` });
  }
  if (!exploreJourneys.length || exploreJourneys.some((journey) => !journey.entered || !journey.searched || !journey.detailOpened || !journey.detailClosed || !journey.returnedToPlayer)) {
    failures.push({ code: 'explore-roundtrip-failed', message: 'Explore did not complete search, detail open/close and return-to-player coverage.' });
  }
  return failures;
}

async function main() {
  const options = parseSessionArgs(process.argv.slice(2));
  if (options.help) {
    console.log(usageText());
    return;
  }

  const chromium = await loadChromium();
  const profile = SESSION_PROFILES[options.profile];
  const browser = await chromium.launch({ headless: true });
  const browserVersion = browser.version();
  const runtimeFailures = [];
  const requestAborts = [];
  const journeys = [];
  const exploreJourneys = [];
  const snapshots = [];

  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    deviceScaleFactor: 1,
    hasTouch: false,
    isMobile: false,
    serviceWorkers: 'allow',
  });
  await context.addInitScript(installSessionInstrumentation);

  const page = await context.newPage();
  const cdp = await configureCdp(page);
  const networkState = makeNetworkState(options.originValue);
  const detachNetworkAccounting = attachNetworkAccounting(page, networkState);
  const detachRuntimeFailures = attachRuntimeFailureCapture(page, options.originValue, runtimeFailures, requestAborts);

  let boot = null;
  let startupSheetBaseline = null;
  let startupSheetFirstUse = null;
  try {
    boot = await waitForPlayer(page, options.origin);
    await page.waitForTimeout(profile.settleMs);
    snapshots.push(await collectSessionSnapshot(page, cdp, 'baseline-warm', networkState));
    startupSheetBaseline = await captureClosedSheetBaseline(page);
    startupSheetFirstUse = await exerciseStartupSheetMaterialisation(browser, options.origin);
    await resetSessionTransientMetrics(page);

    for (let cycle = 0; cycle < options.cycles; cycle += 1) {
      journeys.push(await exercisePlayerCycle(page, cdp, options, cycle));
      await page.waitForTimeout(profile.settleMs);
      snapshots.push(await collectSessionSnapshot(page, cdp, `cycle-${cycle + 1}`, networkState));
    }

    await page.waitForTimeout(profile.postGcSettleMs);
    snapshots.push(await collectSessionSnapshot(page, cdp, 'final-player-settled', networkState));

    // Navigation intentionally runs after the memory-growth budget phase. A full route
    // navigation creates a new document and would otherwise reset the very listener,
    // observer and object-URL state this soak is designed to measure.
    for (let round = 0; round < profile.exploreRounds; round += 1) {
      const journey = await exerciseExploreRoundTrip(page, options.origin, round);
      exploreJourneys.push(await retryExploreDetailCoverage(page, options.origin, journey));
    }
  } finally {
    detachRuntimeFailures();
    detachNetworkAccounting();
    await cdp.detach().catch(() => {});
    await context.close();
    await browser.close();
  }

  const dedupedRuntimeFailures = uniqueFailures(runtimeFailures);
  const dedupedRequestAborts = uniqueFailures(requestAborts);
  const growthFailures = evaluateSessionBudgets(snapshots, dedupedRuntimeFailures, options.cycles, SOAK_BUDGETS);
  const journeyFailures = coverageFailures(boot, journeys, exploreJourneys);
  const startupFailures = startupSheetFailures(startupSheetBaseline, startupSheetFirstUse);
  const budgetFailures = [...growthFailures, ...journeyFailures, ...startupFailures];
  const baseline = snapshots[0] || null;
  const final = snapshots.at(-1) || null;

  const report = {
    schemaVersion: 4,
    generatedAt: new Date().toISOString(),
    testedRevision: process.env.PLAYGARBA_TESTED_REVISION || null,
    target: options.origin,
    profile: options.profile,
    cycles: options.cycles,
    browser: {
      name: 'chromium',
      version: browserVersion,
      playwright: '1.55.0 expected',
      viewport: { width: 1280, height: 800 },
    },
    measurementBoundary: {
      productionInstrumentationChanged: false,
      productionEquivalentFixtureRequired: true,
      harnessInstrumentation: 'context.addInitScript test-only counters plus Chromium CDP Memory/Performance metrics',
      budgetPhaseNavigation: 'none; one player document remains alive for every measured cycle',
      startupSheetBaseline: 'measured on the warm player before any explicit song-sheet interaction; hidden .song-row DOM is a hard regression',
      startupSheetFirstUseProbe: 'Songs/Search/Queue/My Garba first-use materialisation runs in a separate browser context so it cannot alter the measured player document, cache state or soak deltas',
      exploreNavigation: 'exercised only after the final player snapshot and excluded from player memory-growth deltas; Search and detail/back must both pass, with an explicit fresh-Explore detail retry recorded when Search history makes the combined transition indeterminate',
      detachedDomNodesDirectlyMeasured: false,
      detachedDomBoundary: 'Chromium aggregate document/node/listener counters are recorded; detached-node claims require a heap-snapshot diagnostic and are not fabricated.',
      browserDocumentRule: 'one-time provider/iframe document creation is diagnostic; the gate fails if document count continues growing across the final four player snapshots',
      browserWideTimerCountClaimed: false,
      browserWideListenerCountClaimed: false,
      playGarbaOwnedIntervalsInstrumented: true,
      playGarbaConstructedObserversInstrumented: true,
      playGarbaConstructedAudioContextsInstrumented: true,
      objectUrlsInstrumented: true,
      longTasksObservedWhereSupported: true,
      sameOriginTransferBytes: 'Resource Timing transferSize, not Content-Length',
      requestAborts: 'same-origin net::ERR_ABORTED is non-blocking only when request generation proves a superseded or detached document; active-document aborts remain hard failures; deliberate post-Explore return settles normal player work before the next route/teardown',
      serviceWorkers: 'allowed',
      providerPlaybackMayBeRequestedByJourney: true,
      thirdPartyTransferBytesIncluded: false,
    },
    boot: {
      fullCatalogueReadyBeforeSoak: Boolean(boot?.catalogueReady),
    },
    budgets: SOAK_BUDGETS,
    startupSheet: {
      budgets: STARTUP_SHEET_BUDGETS,
      baseline: startupSheetBaseline,
      firstUse: startupSheetFirstUse,
    },
    result: {
      passed: budgetFailures.length === 0,
      budgetFailures,
      runtimeFailures: dedupedRuntimeFailures,
      requestAborts: dedupedRequestAborts,
    },
    baseline: baseline ? compactSnapshot(baseline) : null,
    final: final ? compactSnapshot(final) : null,
    trend: snapshots.map(compactSnapshot),
    journeys,
    exploreJourneys,
    snapshots,
  };

  const json = `${JSON.stringify(report, null, 2)}\n`;
  process.stdout.write(json);
  if (options.output) await writeFile(options.output, json, 'utf8');

  if (options.failOnBudget && budgetFailures.length) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error.stack || error.message || String(error));
  process.exit(1);
});