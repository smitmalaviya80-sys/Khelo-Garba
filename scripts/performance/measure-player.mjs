#!/usr/bin/env node

import { writeFile } from 'node:fs/promises';
import process from 'node:process';

const DEFAULT_ORIGIN = 'http://127.0.0.1:4173';
const DEFAULT_RUNS = 5;
const SEARCH_QUERY = 'Khalasi';

const PROFILES = {
  desktop: {
    context: {
      viewport: { width: 1440, height: 900 },
      deviceScaleFactor: 1,
      hasTouch: false,
      isMobile: false,
    },
    cpuThrottleRate: 1,
    network: null,
  },
  'mobile-low-end': {
    context: {
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: 2,
      hasTouch: true,
      isMobile: true,
    },
    cpuThrottleRate: 4,
    network: {
      offline: false,
      latency: 150,
      downloadThroughput: 200_000,
      uploadThroughput: 93_750,
      connectionType: 'cellular3g',
    },
  },
};

function usage() {
  console.log(`Usage: node scripts/performance/measure-player.mjs [options]\n\nOptions:\n  --origin=<url>       Target origin (default: ${DEFAULT_ORIGIN})\n  --runs=<n>           Cold/warm pairs per profile (default: ${DEFAULT_RUNS})\n  --profile=<name>     desktop, mobile-low-end, or all (default: all)\n  --output=<path>      Also write the JSON report to this path\n  --help               Show this help\n\nThe harness never initiates provider playback; provider startup latency is outside these local UI measurements.`);
}

function parseArgs(argv) {
  const options = {
    origin: DEFAULT_ORIGIN,
    runs: DEFAULT_RUNS,
    profile: 'all',
    output: null,
  };

  for (const argument of argv) {
    if (argument === '--help') {
      usage();
      process.exit(0);
    }
    const [key, ...valueParts] = argument.split('=');
    const value = valueParts.join('=');
    if (key === '--origin' && value) options.origin = value;
    else if (key === '--runs' && value) options.runs = Number.parseInt(value, 10);
    else if (key === '--profile' && value) options.profile = value;
    else if (key === '--output' && value) options.output = value;
    else throw new Error(`Unknown or incomplete argument: ${argument}`);
  }

  if (!Number.isInteger(options.runs) || options.runs < 1 || options.runs > 30) {
    throw new Error('--runs must be an integer from 1 to 30');
  }
  if (options.profile !== 'all' && !PROFILES[options.profile]) {
    throw new Error(`--profile must be one of: all, ${Object.keys(PROFILES).join(', ')}`);
  }

  const parsedOrigin = new URL(options.origin);
  if (!['http:', 'https:'].includes(parsedOrigin.protocol)) {
    throw new Error('--origin must use http or https');
  }
  parsedOrigin.hash = '';
  parsedOrigin.search = '';
  options.origin = parsedOrigin.href;
  options.originValue = parsedOrigin.origin;
  return options;
}

function percentile(values, fraction) {
  const finite = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!finite.length) return null;
  const index = Math.min(finite.length - 1, Math.max(0, Math.ceil(finite.length * fraction) - 1));
  return finite[index];
}

function round(value, digits = 1) {
  if (!Number.isFinite(value)) return null;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function summariseMetric(samples, key) {
  const values = samples.map((sample) => sample[key]).filter(Number.isFinite);
  const digits = key === 'layoutShiftScore' ? 4 : 1;
  return {
    samples: values.length,
    median: round(percentile(values, 0.5), digits),
    p75: round(percentile(values, 0.75), digits),
    max: values.length ? round(Math.max(...values), digits) : null,
  };
}

function summarisePhase(samples) {
  const keys = [
    'shellReadyMs',
    'catalogueReadyMs',
    'songsResponseEndMs',
    'catalogueHydrationAfterSongsResponseMs',
    'domContentLoadedMs',
    'loadEventMs',
    'firstContentfulPaintMs',
    'largestContentfulPaintMs',
    'searchPresentationMs',
    'nonstopPresentationMs',
    'layoutShiftScore',
    'longTaskTotalMs',
    'longTaskMaxMs',
    'sameOriginTransferBytes',
    'catalogueTransferBytes',
    'songsTransferBytes',
    'songsEncodedBytes',
    'songsDecodedBytes',
    'artworkTransferBytes',
    'backgroundLibraryTransferBytes',
    'backgroundLibraryRequestCount',
    'uniqueBackgroundLibraryAssetCount',
  ];
  return Object.fromEntries(keys.map((key) => [key, summariseMetric(samples, key)]));
}

function installPageObservers() {
  window.__PLAYGARBA_PERF = {
    longTasks: [],
    lcp: null,
    cls: 0,
  };

  try {
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        window.__PLAYGARBA_PERF.longTasks.push({ startTime: entry.startTime, duration: entry.duration });
      }
    }).observe({ type: 'longtask', buffered: true });
  } catch {
    // Long Tasks are Chromium-only and may be unavailable in some environments.
  }

  try {
    new PerformanceObserver((list) => {
      const entries = list.getEntries();
      const last = entries.at(-1);
      if (last) window.__PLAYGARBA_PERF.lcp = last.startTime;
    }).observe({ type: 'largest-contentful-paint', buffered: true });
  } catch {
    // LCP observer support is browser-dependent.
  }

  try {
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (!entry.hadRecentInput) window.__PLAYGARBA_PERF.cls += entry.value;
      }
    }).observe({ type: 'layout-shift', buffered: true });
  } catch {
    // Layout Shift observer support is browser-dependent.
  }
}

async function configureProfile(page, profile, { clearCache = false, cacheDisabled = false } = {}) {
  const session = await page.context().newCDPSession(page);
  await session.send('Network.enable');
  await session.send('Network.setCacheDisabled', { cacheDisabled });
  if (clearCache) await session.send('Network.clearBrowserCache');
  await session.send('Emulation.setCPUThrottlingRate', { rate: profile.cpuThrottleRate });
  if (profile.network) {
    await session.send('Network.emulateNetworkConditions', profile.network);
  }
  return session;
}

async function waitForFullCatalogue(page) {
  await page.waitForFunction(() => window.GARBA_CATALOGUE_READY === true, null, { timeout: 30_000 });
  return page.evaluate(() => performance.now());
}

async function collectCatalogueHydrationMetrics(page, catalogueReadyMs) {
  return page.evaluate((readyAt) => {
    const songsEntry = performance.getEntriesByType('resource').find((entry) => {
      try { return new URL(entry.name).pathname === '/data/songs.json'; }
      catch { return false; }
    });
    const responseEnd = songsEntry?.responseEnd ?? null;
    return {
      songsResponseEndMs: responseEnd,
      catalogueHydrationAfterSongsResponseMs: Number.isFinite(responseEnd) ? Math.max(0, readyAt - responseEnd) : null,
      songsTransferBytes: songsEntry?.transferSize || 0,
      songsEncodedBytes: songsEntry?.encodedBodySize || 0,
      songsDecodedBytes: songsEntry?.decodedBodySize || 0,
    };
  }, catalogueReadyMs);
}

async function measureSearch(page) {
  await page.locator('#searchButton').click();
  await page.locator('#searchInput').waitFor({ state: 'visible' });

  return page.evaluate(async (query) => {
    const input = document.getElementById('searchInput');
    const list = document.getElementById('songList');
    if (!input || !list) return { duration: null, resultCount: null, matchedQuery: false };

    input.value = '';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await new Promise((resolve) => requestAnimationFrame(resolve));

    const start = performance.now();
    const duration = await new Promise((resolve) => {
      let finished = false;
      const finish = () => {
        if (finished) return;
        finished = true;
        observer.disconnect();
        requestAnimationFrame(() => resolve(performance.now() - start));
      };
      const observer = new MutationObserver(finish);
      observer.observe(list, { childList: true, subtree: true, characterData: true });
      input.value = query;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      setTimeout(finish, 2_000);
    });

    const text = list.textContent || '';
    return {
      duration,
      resultCount: list.children.length,
      matchedQuery: text.toLocaleLowerCase().includes(query.toLocaleLowerCase()),
    };
  }, SEARCH_QUERY);
}

async function measureNonstop(page) {
  await page.locator('#sheetClose').click().catch(() => {});
  await page.locator('#nonstopButton').waitFor({ state: 'attached' });

  return page.evaluate(async () => {
    const button = document.getElementById('nonstopButton');
    if (!button) return { duration: null, setCount: null };

    const start = performance.now();
    return new Promise((resolve) => {
      let finished = false;
      let timeoutId = 0;
      const finish = (force = false) => {
        if (finished) return;
        const panel = document.getElementById('nonstopBrowser');
        const ready = panel?.getAttribute('aria-hidden') === 'false' && panel.querySelector('.nonstop-set');
        if (!ready && !force) return;
        finished = true;
        clearTimeout(timeoutId);
        observer.disconnect();
        requestAnimationFrame(() => resolve({
          duration: ready ? performance.now() - start : null,
          setCount: panel?.querySelectorAll('.nonstop-set').length ?? null,
        }));
      };

      const observer = new MutationObserver(() => finish());
      observer.observe(document.body, {
        attributes: true,
        childList: true,
        subtree: true,
        attributeFilter: ['aria-hidden'],
      });
      button.click();
      finish();
      timeoutId = window.setTimeout(() => finish(true), 20_000);
    });
  });
}

async function collectBrowserMetrics(page, targetOrigin) {
  return page.evaluate((origin) => {
    const navigation = performance.getEntriesByType('navigation')[0];
    const paintEntries = performance.getEntriesByType('paint');
    const fcp = paintEntries.find((entry) => entry.name === 'first-contentful-paint')?.startTime ?? null;
    const state = window.__PLAYGARBA_PERF || { longTasks: [], lcp: null, cls: 0 };
    const resources = performance.getEntriesByType('resource')
      .filter((entry) => {
        try { return new URL(entry.name).origin === origin; }
        catch { return false; }
      })
      .map((entry) => ({
        name: new URL(entry.name).pathname,
        transferSize: entry.transferSize || 0,
        encodedBodySize: entry.encodedBodySize || 0,
        decodedBodySize: entry.decodedBodySize || 0,
        duration: entry.duration || 0,
      }));

    const sum = (entries, key) => entries.reduce((total, entry) => total + (entry[key] || 0), 0);
    const catalogue = resources.filter((entry) => entry.name.startsWith('/data/'));
    const artwork = resources.filter((entry) => entry.name.startsWith('/assets/backgrounds/') || entry.name.startsWith('/assets/genre-icons/'));
    const backgroundLibrary = resources.filter((entry) => entry.name.startsWith('/assets/backgrounds/library/'));
    const uniqueBackgroundLibraryAssets = new Set(backgroundLibrary.map((entry) => entry.name));
    const topTransfers = [...resources]
      .sort((a, b) => b.transferSize - a.transferSize)
      .slice(0, 10);
    const longTasks = state.longTasks || [];

    return {
      domContentLoadedMs: navigation?.domContentLoadedEventEnd ?? null,
      loadEventMs: navigation?.loadEventEnd || null,
      firstContentfulPaintMs: fcp,
      largestContentfulPaintMs: state.lcp,
      layoutShiftScore: state.cls || 0,
      longTaskCount: longTasks.length,
      longTaskTotalMs: sum(longTasks, 'duration'),
      longTaskMaxMs: longTasks.length ? Math.max(...longTasks.map((entry) => entry.duration)) : 0,
      sameOriginTransferBytes: sum(resources, 'transferSize'),
      sameOriginEncodedBytes: sum(resources, 'encodedBodySize'),
      sameOriginDecodedBytes: sum(resources, 'decodedBodySize'),
      catalogueTransferBytes: sum(catalogue, 'transferSize'),
      artworkTransferBytes: sum(artwork, 'transferSize'),
      backgroundLibraryTransferBytes: sum(backgroundLibrary, 'transferSize'),
      backgroundLibraryRequestCount: backgroundLibrary.length,
      uniqueBackgroundLibraryAssetCount: uniqueBackgroundLibraryAssets.size,
      resourceCount: resources.length,
      topTransfers,
    };
  }, targetOrigin);
}

async function measurePhase(page, options, phase) {
  const failures = [];
  const consoleErrors = [];
  const onPageError = (error) => failures.push(`pageerror: ${error.message}`);
  const onConsole = (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  };
  const onRequestFailed = (request) => {
    try {
      if (new URL(request.url()).origin === options.originValue) {
        failures.push(`requestfailed: ${request.method()} ${request.url()} ${request.failure()?.errorText || ''}`);
      }
    } catch {
      // Ignore malformed/non-URL request values.
    }
  };
  const onResponse = (response) => {
    try {
      if (new URL(response.url()).origin === options.originValue && response.status() >= 400) {
        failures.push(`http ${response.status()}: ${response.url()}`);
      }
    } catch {
      // Ignore malformed/non-URL response values.
    }
  };

  page.on('pageerror', onPageError);
  page.on('console', onConsole);
  page.on('requestfailed', onRequestFailed);
  page.on('response', onResponse);

  try {
    await page.goto(options.origin, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await page.waitForFunction(() => {
      const title = document.getElementById('songTitle');
      const play = document.getElementById('playButton');
      return Boolean(title?.textContent?.trim() && play?.getBoundingClientRect().width);
    }, null, { timeout: 15_000 });
    const shellReadyMs = await page.evaluate(() => performance.now());
    const catalogueReadyMs = await waitForFullCatalogue(page);
    const catalogueHydration = await collectCatalogueHydrationMetrics(page, catalogueReadyMs);

    const search = await measureSearch(page);
    if (!search.matchedQuery || !search.resultCount) {
      failures.push(`loaded-index Search did not render the expected ${SEARCH_QUERY} result`);
    }

    const nonstop = await measureNonstop(page);
    if (!Number.isFinite(nonstop.duration) || !nonstop.setCount) {
      failures.push('Nonstop chooser did not render at least one set during the measurement window');
    }

    await page.waitForLoadState('load', { timeout: 10_000 }).catch(() => {});
    await page.waitForTimeout(250);
    const browser = await collectBrowserMetrics(page, options.originValue);

    return {
      phase,
      cacheMode: phase === 'cold' ? 'cleared-before-navigation' : 'reused-from-cold-navigation',
      shellReadyMs,
      catalogueReadyMs,
      ...catalogueHydration,
      searchPresentationMs: search.duration,
      searchResultCount: search.resultCount,
      searchMatchedQuery: search.matchedQuery,
      nonstopPresentationMs: nonstop.duration,
      nonstopSetCount: nonstop.setCount,
      ...browser,
      failures,
      consoleErrors,
    };
  } finally {
    page.off('pageerror', onPageError);
    page.off('console', onConsole);
    page.off('requestfailed', onRequestFailed);
    page.off('response', onResponse);
  }
}

async function runProfile(browser, profileName, profile, options) {
  const cold = [];
  const warm = [];

  for (let index = 0; index < options.runs; index += 1) {
    const context = await browser.newContext({
      ...profile.context,
      serviceWorkers: 'block',
    });
    await context.addInitScript(installPageObservers);

    const page = await context.newPage();
    const session = await configureProfile(page, profile, { clearCache: true, cacheDisabled: false });
    try {
      cold.push(await measurePhase(page, options, 'cold'));
      await page.goto('about:blank');
      warm.push(await measurePhase(page, options, 'warm'));
    } finally {
      await session.detach().catch(() => {});
      await context.close();
    }
  }

  return {
    profile: profileName,
    configuration: {
      ...profile.context,
      cpuThrottleRate: profile.cpuThrottleRate,
      network: profile.network,
      httpCache: 'cold cleared; warm reuses the same context cache',
      providerPlaybackInitiated: false,
      serviceWorkers: 'blocked',
    },
    cold,
    warm,
    summary: {
      cold: summarisePhase(cold),
      warm: summarisePhase(warm),
    },
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));

  let chromium;
  try {
    ({ chromium } = await import('@playwright/test'));
  } catch {
    console.error('Missing @playwright/test. Install the repository-standard temporary runner first:');
    console.error('  npm install --no-save --no-package-lock @playwright/test@1.55.0');
    console.error('  npx playwright install chromium');
    process.exit(2);
  }

  const browser = await chromium.launch({ headless: true });
  const browserVersion = browser.version();
  const profileNames = options.profile === 'all' ? Object.keys(PROFILES) : [options.profile];
  const profiles = [];

  try {
    for (const profileName of profileNames) {
      profiles.push(await runProfile(browser, profileName, PROFILES[profileName], options));
    }
  } finally {
    await browser.close();
  }

  const report = {
    schemaVersion: 3,
    generatedAt: new Date().toISOString(),
    testedRevision: process.env.PLAYGARBA_TESTED_REVISION || null,
    fixture: process.env.PLAYGARBA_PERF_FIXTURE || null,
    target: options.origin,
    runsPerProfile: options.runs,
    browser: {
      name: 'chromium',
      version: browserVersion,
      playwright: '1.55.0 expected',
    },
    measurementBoundary: {
      providerLatencyIncluded: false,
      providerPlaybackInitiated: false,
      thirdPartyRequestsBlocked: false,
      sameOriginResourceMetricsOnly: true,
      serviceWorkersBlocked: true,
      searchQuery: SEARCH_QUERY,
      searchRequiresFullCatalogue: true,
      consoleErrorsReportedSeparately: true,
    },
    provisionalBudgets: {
      localPrimaryControlResponseMs: 100,
      loadedIndexSearchPresentationMs: 150,
      note: 'Provider-confirmed playback start is intentionally outside these local UI budgets.',
    },
    profiles,
  };

  const json = `${JSON.stringify(report, null, 2)}\n`;
  process.stdout.write(json);
  if (options.output) await writeFile(options.output, json, 'utf8');
}

main().catch((error) => {
  console.error(error.stack || error.message || String(error));
  process.exit(1);
});