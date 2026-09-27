#!/usr/bin/env node

import { writeFile } from 'node:fs/promises';
import process from 'node:process';

const DEFAULT_ORIGIN = 'http://127.0.0.1:4173';
const DEFAULT_RUNS = 5;
const PRODUCT_SHELL_TARGET_MS = 1_000;
const RETIRED_WORLD_RE = /^\/assets\/backgrounds\/(?:traditional|dandiya|devotional|folk|sanedo|fusion)\.svg$/;
const BACKGROUND_LIBRARY_PREFIX = '/assets/backgrounds/library/';
const FULL_CATALOGUE_PATH = '/data/songs.json';

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
  console.log(`Usage: node scripts/performance/measure-startup.mjs [options]\n\nOptions:\n  --origin=<url>       Target origin (default: ${DEFAULT_ORIGIN})\n  --runs=<n>           Cold samples per profile (default: ${DEFAULT_RUNS})\n  --profile=<name>     desktop, mobile-low-end, or all (default: all)\n  --output=<path>      Also write the JSON report to this path\n  --help               Show this help\n\nThis harness stops its request checkpoint at the first usable player shell. It does not wait for full catalogue hydration or initiate provider playback.`);
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

function round(value, digits = 1) {
  if (!Number.isFinite(value)) return null;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function percentile(values, fraction) {
  const finite = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!finite.length) return null;
  const index = Math.min(finite.length - 1, Math.max(0, Math.ceil(finite.length * fraction) - 1));
  return finite[index];
}

function summarise(samples, key) {
  const values = samples.map((sample) => sample[key]).filter(Number.isFinite);
  return {
    samples: values.length,
    median: round(percentile(values, 0.5)),
    p75: round(percentile(values, 0.75)),
    max: values.length ? round(Math.max(...values)) : null,
  };
}

async function configureProfile(page, profile) {
  const session = await page.context().newCDPSession(page);
  await session.send('Network.enable');
  await session.send('Network.setCacheDisabled', { cacheDisabled: false });
  await session.send('Network.clearBrowserCache');
  await session.send('Emulation.setCPUThrottlingRate', { rate: profile.cpuThrottleRate });
  if (profile.network) await session.send('Network.emulateNetworkConditions', profile.network);
  return session;
}

async function collectCompletedResourcesAtShell(page, targetOrigin) {
  return page.evaluate((origin) => {
    const navigation = performance.getEntriesByType('navigation')[0];
    const fcp = performance.getEntriesByType('paint')
      .find((entry) => entry.name === 'first-contentful-paint')?.startTime ?? null;
    const resources = performance.getEntriesByType('resource')
      .filter((entry) => {
        try { return new URL(entry.name).origin === origin; }
        catch { return false; }
      })
      .map((entry) => ({
        path: new URL(entry.name).pathname,
        transferSize: entry.transferSize || 0,
        encodedBodySize: entry.encodedBodySize || 0,
        decodedBodySize: entry.decodedBodySize || 0,
        startTime: entry.startTime || 0,
        responseEnd: entry.responseEnd || 0,
      }));

    const sum = (entries, key) => entries.reduce((total, entry) => total + (entry[key] || 0), 0);
    const artwork = resources.filter((entry) => entry.path.startsWith('/assets/backgrounds/') || entry.path.startsWith('/assets/genre-icons/'));
    const backgroundLibrary = resources.filter((entry) => entry.path.startsWith('/assets/backgrounds/library/'));

    return {
      domContentLoadedMs: navigation?.domContentLoadedEventEnd ?? null,
      firstContentfulPaintMs: fcp,
      completedSameOriginResourceCountAtShell: resources.length,
      completedSameOriginTransferBytesAtShell: sum(resources, 'transferSize'),
      completedArtworkTransferBytesAtShell: sum(artwork, 'transferSize'),
      completedBackgroundLibraryTransferBytesAtShell: sum(backgroundLibrary, 'transferSize'),
      completedResourcePathsAtShell: resources.map((entry) => entry.path),
    };
  }, targetOrigin);
}

function classifyStartupRequests(requestPaths) {
  const backgroundLibrary = requestPaths.filter((path) => path.startsWith(BACKGROUND_LIBRARY_PREFIX));
  const retiredWorlds = requestPaths.filter((path) => RETIRED_WORLD_RE.test(path));
  const fullCatalogue = requestPaths.filter((path) => path === FULL_CATALOGUE_PATH);
  return {
    startupSameOriginRequestCount: requestPaths.length,
    startupBackgroundLibraryRequestCount: backgroundLibrary.length,
    startupUniqueBackgroundLibraryAssetCount: new Set(backgroundLibrary).size,
    startupRetiredWorldSvgRequestCount: retiredWorlds.length,
    startupFullCatalogueRequestCount: fullCatalogue.length,
    startupRequestPaths: requestPaths,
    startupBackgroundLibraryPaths: backgroundLibrary,
    startupRetiredWorldSvgPaths: retiredWorlds,
  };
}

function structuralViolations(sample) {
  const violations = [];
  if (sample.startupBackgroundLibraryRequestCount > 1) {
    violations.push(`first usable player started ${sample.startupBackgroundLibraryRequestCount} high-resolution background requests; expected at most 1`);
  }
  if (sample.startupUniqueBackgroundLibraryAssetCount > 1) {
    violations.push(`first usable player requested ${sample.startupUniqueBackgroundLibraryAssetCount} unique high-resolution backgrounds; expected at most 1`);
  }
  if (sample.startupRetiredWorldSvgRequestCount > 0) {
    violations.push(`first usable player requested retired world SVGs: ${sample.startupRetiredWorldSvgPaths.join(', ')}`);
  }
  if (sample.startupFullCatalogueRequestCount > 0) {
    violations.push('full /data/songs.json hydration started before the first usable player shell');
  }
  return violations;
}

async function measureColdStartup(browser, profileName, profile, options, runNumber) {
  const context = await browser.newContext({
    ...profile.context,
    serviceWorkers: 'block',
  });
  const page = await context.newPage();
  const session = await configureProfile(page, profile);
  const requestPaths = [];
  const failures = [];
  let shellCheckpointReached = false;

  const onRequest = (request) => {
    if (shellCheckpointReached) return;
    try {
      const url = new URL(request.url());
      if (url.origin === options.originValue) requestPaths.push(url.pathname);
    } catch {
      // Ignore malformed/non-URL request values.
    }
  };
  const onPageError = (error) => failures.push(`pageerror: ${error.message}`);
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

  page.on('request', onRequest);
  page.on('pageerror', onPageError);
  page.on('requestfailed', onRequestFailed);
  page.on('response', onResponse);

  try {
    await page.goto(options.origin, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await page.waitForFunction(() => {
      const title = document.getElementById('songTitle');
      const play = document.getElementById('playButton');
      const rect = play?.getBoundingClientRect();
      return Boolean(title?.textContent?.trim() && rect?.width && rect?.height);
    }, null, { timeout: 15_000 });

    const shellReadyMs = await page.evaluate(() => performance.now());
    shellCheckpointReached = true;
    const requestShape = classifyStartupRequests(requestPaths);
    const completed = await collectCompletedResourcesAtShell(page, options.originValue);
    const sample = {
      run: runNumber,
      profile: profileName,
      shellReadyMs,
      shellTargetMs: PRODUCT_SHELL_TARGET_MS,
      shellTargetMet: shellReadyMs <= PRODUCT_SHELL_TARGET_MS,
      ...requestShape,
      ...completed,
      failures,
    };
    sample.structuralViolations = structuralViolations(sample);
    return sample;
  } finally {
    page.off('request', onRequest);
    page.off('pageerror', onPageError);
    page.off('requestfailed', onRequestFailed);
    page.off('response', onResponse);
    await session.detach().catch(() => {});
    await context.close();
  }
}

async function runProfile(browser, profileName, profile, options) {
  const samples = [];
  for (let index = 0; index < options.runs; index += 1) {
    samples.push(await measureColdStartup(browser, profileName, profile, options, index + 1));
  }

  const structuralViolationCount = samples.reduce((total, sample) => total + sample.structuralViolations.length, 0);
  return {
    profile: profileName,
    configuration: {
      ...profile.context,
      cpuThrottleRate: profile.cpuThrottleRate,
      network: profile.network,
      httpCache: 'cleared before every sample',
      providerPlaybackInitiated: false,
      serviceWorkers: 'blocked',
    },
    samples,
    summary: {
      shellReadyMs: summarise(samples, 'shellReadyMs'),
      startupSameOriginRequestCount: summarise(samples, 'startupSameOriginRequestCount'),
      startupBackgroundLibraryRequestCount: summarise(samples, 'startupBackgroundLibraryRequestCount'),
      startupUniqueBackgroundLibraryAssetCount: summarise(samples, 'startupUniqueBackgroundLibraryAssetCount'),
      startupRetiredWorldSvgRequestCount: summarise(samples, 'startupRetiredWorldSvgRequestCount'),
      startupFullCatalogueRequestCount: summarise(samples, 'startupFullCatalogueRequestCount'),
      completedSameOriginTransferBytesAtShell: summarise(samples, 'completedSameOriginTransferBytesAtShell'),
      completedArtworkTransferBytesAtShell: summarise(samples, 'completedArtworkTransferBytesAtShell'),
      completedBackgroundLibraryTransferBytesAtShell: summarise(samples, 'completedBackgroundLibraryTransferBytesAtShell'),
      structuralViolationCount,
      shellTargetMetCount: samples.filter((sample) => sample.shellTargetMet).length,
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
    schemaVersion: 1,
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
      checkpoint: 'first usable player shell with non-empty title and laid-out Play control',
      fullCatalogueWaitedFor: false,
      providerPlaybackInitiated: false,
      serviceWorkersBlocked: true,
      httpCacheClearedBeforeEverySample: true,
      requestStartShapeCapturedUntilShellCheckpoint: true,
      completedTransferBytesCapturedAtShellCheckpoint: true,
    },
    structuralBudgets: {
      highResolutionBackgroundRequestsBeforeShellMax: 1,
      uniqueHighResolutionBackgroundsBeforeShellMax: 1,
      retiredWorldSvgRequestsBeforeShellMax: 0,
      fullSongsCatalogueRequestsBeforeShellMax: 0,
    },
    timingTarget: {
      shellReadyMs: PRODUCT_SHELL_TARGET_MS,
      enforcement: 'measurement target only; not a CI failure because runner/network timing is environment-sensitive',
    },
    profiles,
  };

  const json = `${JSON.stringify(report, null, 2)}\n`;
  process.stdout.write(json);
  if (options.output) await writeFile(options.output, json, 'utf8');

  const violations = profiles.flatMap((profile) => profile.samples.flatMap((sample) => sample.structuralViolations));
  const runtimeFailures = profiles.flatMap((profile) => profile.samples.flatMap((sample) => sample.failures));
  if (violations.length || runtimeFailures.length) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error.stack || error.message || String(error));
  process.exit(1);
});
