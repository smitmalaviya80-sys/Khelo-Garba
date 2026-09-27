export const DEFAULT_ORIGIN = 'http://127.0.0.1:4173';

export const SESSION_PROFILES = Object.freeze({
  ci: Object.freeze({ cycles: 6, settleMs: 300, postGcSettleMs: 300, exploreRounds: 1 }),
  diagnostic: Object.freeze({ cycles: 30, settleMs: 450, postGcSettleMs: 500, exploreRounds: 3 }),
});

export const DEFAULT_BUDGETS = Object.freeze({
  domNodeGrowth: 220,
  documentTailGrowth: 0,
  jsEventListenerGrowth: 80,
  heapGrowthBytes: 16 * 1024 * 1024,
  liveIntervalGrowth: 4,
  liveObserverGrowth: 8,
  liveAudioContextGrowth: 1,
  activeObjectUrlGrowth: 2,
  mediaElementGrowth: 2,
  iframeGrowth: 1,
  warmRequestGrowthPerCycle: 60,
  initialFullCatalogueRequests: 1,
  fullCatalogueRequestGrowth: 0,
  repeatedBackgroundRequestGrowthPerCycle: 8,
  longTaskMaxMs: 500,
  runtimeErrors: 0,
});

export function parseSessionArgs(argv) {
  const options = {
    origin: DEFAULT_ORIGIN,
    profile: 'ci',
    cycles: null,
    output: null,
    failOnBudget: true,
    help: false,
  };

  for (const argument of argv) {
    if (argument === '--help') {
      options.help = true;
      continue;
    }
    if (argument === '--no-fail') {
      options.failOnBudget = false;
      continue;
    }
    const [key, ...parts] = argument.split('=');
    const value = parts.join('=');
    if (key === '--origin' && value) options.origin = value;
    else if (key === '--profile' && value) options.profile = value;
    else if (key === '--cycles' && value) options.cycles = Number.parseInt(value, 10);
    else if (key === '--output' && value) options.output = value;
    else throw new Error(`Unknown or incomplete argument: ${argument}`);
  }

  if (!SESSION_PROFILES[options.profile]) {
    throw new Error(`--profile must be one of: ${Object.keys(SESSION_PROFILES).join(', ')}`);
  }
  if (options.cycles !== null && (!Number.isInteger(options.cycles) || options.cycles < 2 || options.cycles > 100)) {
    throw new Error('--cycles must be an integer from 2 to 100');
  }

  const parsedOrigin = new URL(options.origin);
  if (!['http:', 'https:'].includes(parsedOrigin.protocol)) throw new Error('--origin must use http or https');
  parsedOrigin.hash = '';
  parsedOrigin.search = '';
  options.origin = parsedOrigin.href;
  options.originValue = parsedOrigin.origin;
  options.cycles ??= SESSION_PROFILES[options.profile].cycles;
  return options;
}

export function usageText() {
  return `Usage: node scripts/performance/measure-session-stability.mjs [options]\n\nOptions:\n  --origin=<url>       Target origin (default: ${DEFAULT_ORIGIN})\n  --profile=<name>     ci or diagnostic (default: ci)\n  --cycles=<n>         Override profile cycles, 2-100\n  --output=<path>      Also write the JSON report to this path\n  --no-fail            Record budget failures without a non-zero exit\n  --help               Show this help\n\nThe primary budget phase keeps one player document alive. Explore navigation is exercised afterwards so a navigation reset cannot hide player-session growth. Instrumentation is test-only and never ships to listeners.`;
}

export function installSessionInstrumentation() {
  const state = {
    createdIntervals: 0,
    clearedIntervals: 0,
    liveIntervals: new Set(),
    observers: {
      mutationCreated: 0,
      mutationDisconnected: 0,
      mutationLive: 0,
      resizeCreated: 0,
      resizeDisconnected: 0,
      resizeLive: 0,
      intersectionCreated: 0,
      intersectionDisconnected: 0,
      intersectionLive: 0,
    },
    audioContextsCreated: 0,
    audioContextsClosed: 0,
    liveAudioContexts: 0,
    objectUrlsCreated: 0,
    objectUrlsRevoked: 0,
    activeObjectUrls: new Set(),
    longTasks: [],
    runtimeErrors: [],
    unhandledRejections: [],
  };

  Object.defineProperty(window, '__PLAYGARBA_SESSION_STABILITY', {
    configurable: false,
    enumerable: false,
    writable: false,
    value: state,
  });

  const originalSetInterval = window.setInterval.bind(window);
  const originalClearInterval = window.clearInterval.bind(window);
  window.setInterval = (...args) => {
    const id = originalSetInterval(...args);
    state.createdIntervals += 1;
    state.liveIntervals.add(id);
    return id;
  };
  window.clearInterval = (id) => {
    if (state.liveIntervals.delete(id)) state.clearedIntervals += 1;
    return originalClearInterval(id);
  };

  const wrapObserver = (name, key) => {
    const Original = window[name];
    if (typeof Original !== 'function') return;
    const createdKey = `${key}Created`;
    const disconnectedKey = `${key}Disconnected`;
    const liveKey = `${key}Live`;
    window[name] = class SessionStabilityObserver extends Original {
      constructor(...args) {
        super(...args);
        state.observers[createdKey] += 1;
        state.observers[liveKey] += 1;
        this.__sessionDisconnected = false;
      }
      disconnect() {
        if (!this.__sessionDisconnected) {
          this.__sessionDisconnected = true;
          state.observers[disconnectedKey] += 1;
          state.observers[liveKey] = Math.max(0, state.observers[liveKey] - 1);
        }
        return super.disconnect();
      }
    };
  };
  wrapObserver('MutationObserver', 'mutation');
  wrapObserver('ResizeObserver', 'resize');
  wrapObserver('IntersectionObserver', 'intersection');

  const wrapAudioContext = (name) => {
    const Original = window[name];
    if (typeof Original !== 'function') return;
    window[name] = class SessionStabilityAudioContext extends Original {
      constructor(...args) {
        super(...args);
        state.audioContextsCreated += 1;
        state.liveAudioContexts += 1;
        this.__sessionClosed = false;
      }
      close() {
        if (!this.__sessionClosed) {
          this.__sessionClosed = true;
          state.audioContextsClosed += 1;
          state.liveAudioContexts = Math.max(0, state.liveAudioContexts - 1);
        }
        return super.close();
      }
    };
  };
  wrapAudioContext('AudioContext');
  if (window.webkitAudioContext && window.webkitAudioContext !== window.AudioContext) wrapAudioContext('webkitAudioContext');

  if (window.URL && typeof window.URL.createObjectURL === 'function') {
    const originalCreate = window.URL.createObjectURL.bind(window.URL);
    const originalRevoke = window.URL.revokeObjectURL.bind(window.URL);
    window.URL.createObjectURL = (...args) => {
      const url = originalCreate(...args);
      state.objectUrlsCreated += 1;
      state.activeObjectUrls.add(url);
      return url;
    };
    window.URL.revokeObjectURL = (url) => {
      if (state.activeObjectUrls.delete(url)) state.objectUrlsRevoked += 1;
      return originalRevoke(url);
    };
  }

  try {
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) state.longTasks.push({ startTime: entry.startTime, duration: entry.duration });
    }).observe({ type: 'longtask', buffered: true });
  } catch {
    // Long Task timing is Chromium-specific and optional.
  }

  window.addEventListener('error', (event) => {
    state.runtimeErrors.push(String(event.error?.message || event.message || 'window error'));
  });
  window.addEventListener('unhandledrejection', (event) => {
    state.unhandledRejections.push(String(event.reason?.message || event.reason || 'unhandled rejection'));
  });
}

export async function resetSessionTransientMetrics(page) {
  await page.evaluate(() => {
    const state = window.__PLAYGARBA_SESSION_STABILITY;
    if (!state) return;
    state.longTasks.length = 0;
    state.runtimeErrors.length = 0;
    state.unhandledRejections.length = 0;
  });
}

function finiteNumber(value) {
  return Number.isFinite(value) ? value : null;
}

function metricValue(metrics, name) {
  return finiteNumber(metrics.find((metric) => metric.name === name)?.value);
}

export function makeNetworkState(originValue) {
  return {
    originValue,
    sameOriginRequestCount: 0,
    backgroundLibraryRequests: 0,
    backgroundLibraryAssets: new Set(),
  };
}

export function attachNetworkAccounting(page, networkState) {
  const onRequest = (request) => {
    try {
      const url = new URL(request.url());
      if (url.origin !== networkState.originValue) return;
      networkState.sameOriginRequestCount += 1;
      if (url.pathname.startsWith('/assets/backgrounds/library/')) {
        networkState.backgroundLibraryRequests += 1;
        networkState.backgroundLibraryAssets.add(url.pathname);
      }
    } catch {
      // Ignore malformed URLs.
    }
  };
  page.on('request', onRequest);
  return () => page.off('request', onRequest);
}

export async function collectSessionSnapshot(page, cdp, label, networkState) {
  await cdp.send('HeapProfiler.collectGarbage').catch(() => {});
  await page.waitForTimeout(80);

  const [domCounters, performanceMetrics, inPage] = await Promise.all([
    cdp.send('Memory.getDOMCounters').catch(() => null),
    cdp.send('Performance.getMetrics').catch(() => ({ metrics: [] })),
    page.evaluate((originValue) => {
      const state = window.__PLAYGARBA_SESSION_STABILITY;
      const longTasks = state?.longTasks || [];
      const liveObservers = state?.observers
        ? state.observers.mutationLive + state.observers.resizeLive + state.observers.intersectionLive
        : null;
      const resourceEntries = performance.getEntriesByType('resource').filter((entry) => {
        try { return new URL(entry.name).origin === originValue; }
        catch { return false; }
      });
      const backgroundEntries = resourceEntries.filter((entry) => {
        try { return new URL(entry.name).pathname.startsWith('/assets/backgrounds/library/'); }
        catch { return false; }
      });
      const fullCatalogueEntries = resourceEntries.filter((entry) => {
        try { return new URL(entry.name).pathname === '/data/songs.json'; }
        catch { return false; }
      });
      const sum = (entries, key) => entries.reduce((total, entry) => total + (Number(entry[key]) || 0), 0);
      const heap = performance.memory?.usedJSHeapSize;
      return {
        domNodeCount: document.getElementsByTagName('*').length,
        iframeCount: document.querySelectorAll('iframe').length,
        mediaElementCount: document.querySelectorAll('audio, video').length,
        providerSurfaceCount: document.querySelectorAll('[id*="youtube" i], [class*="youtube" i], [id*="provider" i], [class*="provider" i]').length,
        liveIntervals: state?.liveIntervals?.size ?? null,
        createdIntervals: state?.createdIntervals ?? null,
        clearedIntervals: state?.clearedIntervals ?? null,
        liveObservers,
        observers: state?.observers ? { ...state.observers } : null,
        liveAudioContexts: state?.liveAudioContexts ?? null,
        audioContextsCreated: state?.audioContextsCreated ?? null,
        audioContextsClosed: state?.audioContextsClosed ?? null,
        activeObjectUrls: state?.activeObjectUrls?.size ?? null,
        objectUrlsCreated: state?.objectUrlsCreated ?? null,
        objectUrlsRevoked: state?.objectUrlsRevoked ?? null,
        runtimeErrors: state?.runtimeErrors?.length ?? 0,
        unhandledRejections: state?.unhandledRejections?.length ?? 0,
        longTaskCount: longTasks.length,
        longTaskTotalMs: sum(longTasks, 'duration'),
        longTaskMaxMs: longTasks.length ? Math.max(...longTasks.map((entry) => entry.duration)) : 0,
        heapFromPerformanceMemory: Number.isFinite(heap) ? heap : null,
        resourceTiming: {
          sameOriginResourceCount: resourceEntries.length,
          sameOriginTransferBytes: sum(resourceEntries, 'transferSize'),
          fullCatalogueRequestCount: fullCatalogueEntries.length,
          backgroundLibraryResourceCount: backgroundEntries.length,
          backgroundLibraryTransferBytes: sum(backgroundEntries, 'transferSize'),
        },
      };
    }, networkState.originValue),
  ]);

  const metrics = performanceMetrics.metrics || [];
  return {
    label,
    capturedAt: new Date().toISOString(),
    browser: {
      documents: finiteNumber(domCounters?.documents),
      nodes: finiteNumber(domCounters?.nodes),
      jsEventListeners: finiteNumber(domCounters?.jsEventListeners),
      jsHeapUsedBytes: metricValue(metrics, 'JSHeapUsedSize') ?? inPage.heapFromPerformanceMemory,
      jsHeapTotalBytes: metricValue(metrics, 'JSHeapTotalSize'),
      layoutObjects: metricValue(metrics, 'LayoutObjects'),
      nodesMetric: metricValue(metrics, 'Nodes'),
    },
    page: inPage,
    network: {
      sameOriginRequestCount: networkState.sameOriginRequestCount,
      sameOriginResourceCount: inPage.resourceTiming.sameOriginResourceCount,
      sameOriginTransferBytes: inPage.resourceTiming.sameOriginTransferBytes,
      fullCatalogueRequestCount: inPage.resourceTiming.fullCatalogueRequestCount,
      backgroundLibraryRequests: networkState.backgroundLibraryRequests,
      backgroundLibraryResourceCount: inPage.resourceTiming.backgroundLibraryResourceCount,
      backgroundLibraryTransferBytes: inPage.resourceTiming.backgroundLibraryTransferBytes,
      uniqueBackgroundLibraryAssets: networkState.backgroundLibraryAssets.size,
    },
  };
}

export async function clickIfUsable(page, selector, timeout = 2_500) {
  const locator = page.locator(selector).first();
  if (!(await locator.count())) return false;
  if (!(await locator.isVisible().catch(() => false))) return false;
  if (!(await locator.isEnabled().catch(() => false))) return false;
  try {
    await locator.click({ timeout });
    return true;
  } catch {
    return false;
  }
}

export async function closeTransientSurfaces(page) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await page.keyboard.press('Escape').catch(() => {});
    await clickIfUsable(page, '#sheetClose', 900);
    await clickIfUsable(page, '#nonstopBrowserClose', 900);
    await clickIfUsable(page, '.atmosphere-close', 900);
  }
}

async function exerciseTransport(page) {
  const result = { play: false, pause: false, next: false, previous: false, providerClosed: false };
  result.play = await clickIfUsable(page, '#playButton');
  if (result.play) {
    await page.waitForTimeout(120);
    result.pause = await clickIfUsable(page, '#playButton');
    result.providerClosed = await clickIfUsable(page, '#youtubeDockStop', 1_000);
  }
  result.next = await clickIfUsable(page, '#nextButton');
  result.previous = await clickIfUsable(page, '#prevButton');
  return result;
}

async function exerciseGenres(page, cycleIndex) {
  const genres = page.locator('#genreStrip .genre-button[data-genre]');
  const count = await genres.count();
  let clicks = 0;
  for (let offset = 0; offset < Math.min(3, count); offset += 1) {
    const index = (cycleIndex + offset) % Math.max(1, count);
    const button = genres.nth(index);
    if (await button.isVisible().catch(() => false)) {
      const clicked = await button.click({ timeout: 1_500 }).then(() => true).catch(() => false);
      if (clicked) clicks += 1;
    }
  }
  return { available: count, clicks };
}

async function exerciseSearch(page, cycleIndex) {
  if (!(await clickIfUsable(page, '#searchButton'))) return { status: 'unavailable', rapidSelections: 0 };
  const input = page.locator('#searchInput');
  if (!(await input.isVisible().catch(() => false))) {
    await closeTransientSurfaces(page);
    return { status: 'not-visible', rapidSelections: 0 };
  }
  await input.fill(cycleIndex % 2 ? 'Garba' : 'Khalasi');
  await page.waitForTimeout(60);

  let rapidSelections = 0;
  if (cycleIndex === 0) {
    const rows = page.locator('#songList .song-row');
    const rowCount = Math.min(3, await rows.count());
    for (let index = 0; index < rowCount; index += 1) {
      const row = rows.nth(index);
      if (!(await row.isVisible().catch(() => false))) continue;
      const clicked = await row.click({ timeout: 900 }).then(() => true).catch(() => false);
      if (!clicked) continue;
      rapidSelections += 1;
      if (!(await input.isVisible().catch(() => false))) break;
    }
  }

  if (await input.isVisible().catch(() => false)) await input.fill('');
  await closeTransientSurfaces(page);
  return { status: 'exercised', rapidSelections };
}

async function exerciseQueueAndFavourites(page) {
  const result = {};
  result.queue = (await clickIfUsable(page, '#queueButton')) ? 'opened' : 'unavailable';
  await closeTransientSurfaces(page);
  result.favourites = (await clickIfUsable(page, '#favouritesButton')) ? 'opened' : 'unavailable';
  await closeTransientSurfaces(page);
  return result;
}

async function exerciseNonstop(page, cycleIndex) {
  if (!(await clickIfUsable(page, '#nonstopButton'))) return { status: 'unavailable', setSelected: false, providerClosed: false };
  await page.locator('#nonstopBrowser').waitFor({ state: 'visible', timeout: 2_500 }).catch(() => {});
  let setSelected = false;
  let providerClosed = false;
  if (cycleIndex % 3 === 0) {
    const firstSet = page.locator('#nonstopBrowser .nonstop-set').first();
    if (await firstSet.isVisible().catch(() => false)) {
      setSelected = await firstSet.click({ timeout: 1_500 }).then(() => true).catch(() => false);
      if (setSelected) {
        await page.waitForTimeout(120);
        providerClosed = await clickIfUsable(page, '#youtubeDockStop', 1_000);
      }
    }
  }
  await closeTransientSurfaces(page);
  return { status: 'exercised', setSelected, providerClosed };
}

async function exerciseAtmosphere(page, cycleIndex) {
  const button = page.locator('#atmosphereButton');
  await button.waitFor({ state: 'attached', timeout: 1_500 }).catch(() => {});
  if (!(await clickIfUsable(page, '#atmosphereButton'))) return { status: 'unavailable' };
  await page.locator('#atmospherePanel').waitFor({ state: 'visible', timeout: 1_500 }).catch(() => {});

  const mode = cycleIndex % 2 === 0 ? 'courtyard' : 'ground';
  const modeChanged = await clickIfUsable(page, `.atmosphere-mode[data-mode="${mode}"]`, 1_000);
  const slider = page.locator('#atmosphereLevel');
  if (await slider.isVisible().catch(() => false)) {
    await slider.evaluate((element, value) => {
      element.value = String(value);
      element.dispatchEvent(new Event('input', { bubbles: true }));
    }, 45 + (cycleIndex % 4) * 10).catch(() => {});
  }
  await clickIfUsable(page, '.atmosphere-mode[data-mode="off"]', 1_000);
  await closeTransientSurfaces(page);
  return { status: 'exercised', modeChanged };
}

async function exerciseBackground(page) {
  const input = page.locator('#localBackgroundInput, input[type="file"][accept*="image"]').first();
  if (!(await input.count())) return 'local-control-unavailable';
  // Do not fabricate an uploaded image in the generic CI soak. The object-URL lifecycle is
  // instrumented and will be exercised by dedicated local-background fixtures once present.
  return 'control-present-not-mutated';
}

async function exerciseVisibility(cdp) {
  try {
    await cdp.send('Emulation.setPageVisibilityOverride', { visibilityState: 'hidden' });
    await new Promise((resolve) => setTimeout(resolve, 35));
    await cdp.send('Emulation.setPageVisibilityOverride', { visibilityState: 'visible' });
    return 'emulated-hidden-visible';
  } catch {
    return 'unsupported-by-cdp';
  }
}

async function exerciseOfflineRecovery(page, cdp, originValue) {
  try {
    await cdp.send('Network.enable');
    await cdp.send('Network.emulateNetworkConditions', {
      offline: true,
      latency: 0,
      downloadThroughput: 0,
      uploadThroughput: 0,
      connectionType: 'none',
    });
    await page.evaluate(async (origin) => {
      await fetch(`${origin}/manifest.webmanifest?session-soak=offline`, { cache: 'no-store' }).catch(() => null);
    }, originValue);
    await cdp.send('Network.emulateNetworkConditions', {
      offline: false,
      latency: 0,
      downloadThroughput: -1,
      uploadThroughput: -1,
      connectionType: 'wifi',
    });
    const recovered = await page.evaluate(async (origin) => {
      try {
        const response = await fetch(`${origin}/manifest.webmanifest?session-soak=recovered`, { cache: 'no-store' });
        return response.ok;
      } catch {
        return false;
      }
    }, originValue);
    return recovered ? 'recovered' : 'recovery-request-failed';
  } catch {
    await cdp.send('Network.emulateNetworkConditions', {
      offline: false,
      latency: 0,
      downloadThroughput: -1,
      uploadThroughput: -1,
      connectionType: 'wifi',
    }).catch(() => {});
    return 'unsupported-or-failed';
  }
}

export async function exercisePlayerCycle(page, cdp, options, cycleIndex) {
  const journey = {
    cycle: cycleIndex + 1,
    transport: await exerciseTransport(page),
    genres: await exerciseGenres(page, cycleIndex),
    search: await exerciseSearch(page, cycleIndex),
    queueAndFavourites: await exerciseQueueAndFavourites(page),
    nonstop: await exerciseNonstop(page, cycleIndex),
    atmosphere: await exerciseAtmosphere(page, cycleIndex),
    background: await exerciseBackground(page),
    visibility: await exerciseVisibility(cdp),
    offlineRecovery: 'final-cycle-only',
  };
  if (cycleIndex === options.cycles - 1) {
    journey.offlineRecovery = await exerciseOfflineRecovery(page, cdp, options.originValue);
  }
  await closeTransientSurfaces(page);
  return journey;
}

export async function exerciseExploreRoundTrip(page, origin, roundIndex = 0) {
  const startedAt = Date.now();
  const exploreUrl = new URL('./explore/', origin).href;
  const result = {
    round: roundIndex + 1,
    entered: false,
    searched: false,
    detailOpened: false,
    detailClosed: false,
    returnedToPlayer: false,
    durationMs: null,
  };

  const response = await page.goto(exploreUrl, { waitUntil: 'domcontentloaded', timeout: 20_000 }).catch(() => null);
  result.entered = Boolean(response) && await page.locator('#catalogueTitle').isVisible().catch(() => false);
  if (result.entered) {
    await page.locator('.search-explore').waitFor({ state: 'visible', timeout: 10_000 }).catch(() => {});
    await page.locator('.collection-card').first().waitFor({ state: 'visible', timeout: 15_000 }).catch(() => {});

    if (await clickIfUsable(page, '.search-explore', 1_500)) {
      const input = page.locator('#catalogueSearch');
      if (await input.isVisible().catch(() => false)) {
        await input.fill('Garba').catch(() => {});
        await page.waitForTimeout(80);
        result.searched = true;
        await input.fill('').catch(() => {});
        // Search state is history-backed. Wait for the product's own empty-query back
        // navigation to finish before opening a collection, otherwise the following
        // collection Back action can land on the stale Search history entry.
        await page.waitForFunction(() => {
          const detail = document.getElementById('collectionDetail');
          const home = document.getElementById('collectionHome');
          return Boolean(detail?.hidden && home && !home.hidden && !history.state?.search);
        }, null, { timeout: 5_000 }).catch(() => {});
        await page.keyboard.press('Escape').catch(() => {});
      }
    }

    const firstCard = page.locator('.collection-card').first();
    if (await firstCard.isVisible().catch(() => false)) {
      result.detailOpened = await firstCard.click({ timeout: 1_500 }).then(() => true).catch(() => false);
      if (result.detailOpened) {
        const detail = page.locator('#collectionDetail:not([hidden])');
        result.detailOpened = await detail.waitFor({ state: 'visible', timeout: 5_000 }).then(() => true).catch(() => false);
      }
      if (result.detailOpened) {
        const back = page.locator('#backToCollections');
        if (await back.isVisible().catch(() => false)) {
          result.detailClosed = await back.click({ timeout: 1_500 }).then(() => true).catch(() => false);
          if (result.detailClosed) {
            // The Explore product contract is state-based: closeCollection() marks the
            // detail hidden and collection home unhidden after history.back() settles.
            // Prove that contract directly instead of relying on layout visibility,
            // which can be affected by content-visibility and scroll positioning.
            result.detailClosed = await page.waitForFunction(() => {
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
    }
  }

  await page.goto(origin, { waitUntil: 'domcontentloaded', timeout: 20_000 }).catch(() => null);
  result.returnedToPlayer = await page.waitForFunction(() => Boolean(document.getElementById('playButton')), null, { timeout: 10_000 })
    .then(() => true)
    .catch(() => false);
  result.durationMs = Date.now() - startedAt;
  return result;
}

function delta(finalValue, baselineValue) {
  return Number.isFinite(finalValue) && Number.isFinite(baselineValue) ? finalValue - baselineValue : null;
}

function monotonicGrowth(samples, read, meaningfulDelta) {
  const values = samples.map(read).filter(Number.isFinite);
  if (values.length < 4) return false;
  const tail = values.slice(-4);
  const nonDecreasing = tail.every((value, index) => index === 0 || value >= tail[index - 1]);
  return nonDecreasing && tail.at(-1) - tail[0] > meaningfulDelta;
}

export function evaluateSessionBudgets(snapshots, runtimeFailures, cycleCount, budgets = DEFAULT_BUDGETS) {
  if (snapshots.length < 2) return [{ code: 'insufficient-snapshots', message: 'Need baseline and final player snapshots.' }];
  const baseline = snapshots[0];
  const final = snapshots.at(-1);
  const failures = [];

  const checks = [
    ['dom-node-growth', delta(final.browser.nodes, baseline.browser.nodes), budgets.domNodeGrowth],
    ['event-listener-growth', delta(final.browser.jsEventListeners, baseline.browser.jsEventListeners), budgets.jsEventListenerGrowth],
    ['heap-growth', delta(final.browser.jsHeapUsedBytes, baseline.browser.jsHeapUsedBytes), budgets.heapGrowthBytes],
    ['interval-growth', delta(final.page.liveIntervals, baseline.page.liveIntervals), budgets.liveIntervalGrowth],
    ['observer-growth', delta(final.page.liveObservers, baseline.page.liveObservers), budgets.liveObserverGrowth],
    ['audio-context-growth', delta(final.page.liveAudioContexts, baseline.page.liveAudioContexts), budgets.liveAudioContextGrowth],
    ['object-url-growth', delta(final.page.activeObjectUrls, baseline.page.activeObjectUrls), budgets.activeObjectUrlGrowth],
    ['media-element-growth', delta(final.page.mediaElementCount, baseline.page.mediaElementCount), budgets.mediaElementGrowth],
    ['iframe-growth', delta(final.page.iframeCount, baseline.page.iframeCount), budgets.iframeGrowth],
  ];
  for (const [code, growth, budget] of checks) {
    if (Number.isFinite(growth) && growth > budget) {
      failures.push({ code, growth, budget, message: `${code} exceeded budget: +${growth} > +${budget}` });
    }
  }

  const initialFullCatalogueRequests = baseline.network.fullCatalogueRequestCount;
  if (Number.isFinite(initialFullCatalogueRequests) && initialFullCatalogueRequests > budgets.initialFullCatalogueRequests) {
    failures.push({
      code: 'initial-full-catalogue-requests',
      value: initialFullCatalogueRequests,
      budget: budgets.initialFullCatalogueRequests,
      message: `initial hydration requested /data/songs.json ${initialFullCatalogueRequests} times; expected at most ${budgets.initialFullCatalogueRequests}`,
    });
  }

  const cycles = Math.max(1, Number(cycleCount) || 1);
  const warmRequestGrowth = delta(final.network.sameOriginRequestCount, baseline.network.sameOriginRequestCount);
  const perCycleRequests = Number.isFinite(warmRequestGrowth) ? warmRequestGrowth / cycles : null;
  if (Number.isFinite(perCycleRequests) && perCycleRequests > budgets.warmRequestGrowthPerCycle) {
    failures.push({
      code: 'warm-request-growth',
      value: perCycleRequests,
      budget: budgets.warmRequestGrowthPerCycle,
      message: `same-origin warm requests averaged ${perCycleRequests.toFixed(1)} per cycle`,
    });
  }

  const fullCatalogueGrowth = delta(final.network.fullCatalogueRequestCount, baseline.network.fullCatalogueRequestCount);
  if (Number.isFinite(fullCatalogueGrowth) && fullCatalogueGrowth > budgets.fullCatalogueRequestGrowth) {
    failures.push({
      code: 'full-catalogue-refetch',
      growth: fullCatalogueGrowth,
      budget: budgets.fullCatalogueRequestGrowth,
      message: `the same player document requested /data/songs.json ${fullCatalogueGrowth} additional time(s) during the warm soak`,
    });
  }

  const backgroundRequestGrowth = delta(final.network.backgroundLibraryRequests, baseline.network.backgroundLibraryRequests);
  const backgroundUniqueGrowth = delta(final.network.uniqueBackgroundLibraryAssets, baseline.network.uniqueBackgroundLibraryAssets);
  const repeatedBackgroundRequests = Number.isFinite(backgroundRequestGrowth) && Number.isFinite(backgroundUniqueGrowth)
    ? Math.max(0, backgroundRequestGrowth - backgroundUniqueGrowth)
    : null;
  const repeatedBackgroundPerCycle = Number.isFinite(repeatedBackgroundRequests) ? repeatedBackgroundRequests / cycles : null;
  if (Number.isFinite(repeatedBackgroundPerCycle) && repeatedBackgroundPerCycle > budgets.repeatedBackgroundRequestGrowthPerCycle) {
    failures.push({
      code: 'repeated-background-requests',
      value: repeatedBackgroundPerCycle,
      budget: budgets.repeatedBackgroundRequestGrowthPerCycle,
      message: `background-library requests repeated ${repeatedBackgroundPerCycle.toFixed(1)} times per cycle beyond newly discovered assets`,
    });
  }

  if (Number.isFinite(final.page.longTaskMaxMs) && final.page.longTaskMaxMs > budgets.longTaskMaxMs) {
    failures.push({
      code: 'long-task-max',
      value: final.page.longTaskMaxMs,
      budget: budgets.longTaskMaxMs,
      message: `longest post-baseline task ${final.page.longTaskMaxMs.toFixed(1)}ms exceeded ${budgets.longTaskMaxMs}ms`,
    });
  }

  const runtimeErrorCount = runtimeFailures.length + (final.page.runtimeErrors || 0) + (final.page.unhandledRejections || 0);
  if (runtimeErrorCount > budgets.runtimeErrors) {
    failures.push({
      code: 'runtime-errors',
      value: runtimeErrorCount,
      budget: budgets.runtimeErrors,
      message: `${runtimeErrorCount} hard runtime/network error(s) were captured`,
    });
  }

  if (monotonicGrowth(snapshots, (sample) => sample.browser.documents, budgets.documentTailGrowth)) {
    failures.push({ code: 'document-tail-growth', message: 'Browser document count continued rising across the final four player snapshots instead of stabilising.' });
  }
  if (monotonicGrowth(snapshots, (sample) => sample.browser.nodes, Math.max(50, budgets.domNodeGrowth / 3))) {
    failures.push({ code: 'dom-monotonic-growth', message: 'DOM counters rose monotonically across the final four player snapshots.' });
  }
  if (monotonicGrowth(snapshots, (sample) => sample.browser.jsHeapUsedBytes, Math.max(4 * 1024 * 1024, budgets.heapGrowthBytes / 3))) {
    failures.push({ code: 'heap-monotonic-growth', message: 'GC-normalised JS heap rose monotonically across the final four player snapshots.' });
  }

  return failures;
}

export function compactSnapshot(snapshot) {
  return {
    label: snapshot.label,
    nodes: snapshot.browser.nodes,
    documents: snapshot.browser.documents,
    jsEventListeners: snapshot.browser.jsEventListeners,
    jsHeapUsedBytes: snapshot.browser.jsHeapUsedBytes,
    liveIntervals: snapshot.page.liveIntervals,
    liveObservers: snapshot.page.liveObservers,
    liveAudioContexts: snapshot.page.liveAudioContexts,
    activeObjectUrls: snapshot.page.activeObjectUrls,
    mediaElementCount: snapshot.page.mediaElementCount,
    iframeCount: snapshot.page.iframeCount,
    longTaskCount: snapshot.page.longTaskCount,
    longTaskMaxMs: snapshot.page.longTaskMaxMs,
    sameOriginRequestCount: snapshot.network.sameOriginRequestCount,
    sameOriginTransferBytes: snapshot.network.sameOriginTransferBytes,
    fullCatalogueRequestCount: snapshot.network.fullCatalogueRequestCount,
    backgroundLibraryRequests: snapshot.network.backgroundLibraryRequests,
    uniqueBackgroundLibraryAssets: snapshot.network.uniqueBackgroundLibraryAssets,
  };
}
