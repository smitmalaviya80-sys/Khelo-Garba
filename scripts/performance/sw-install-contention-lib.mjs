import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';

export const DEFAULT_RUNS = 3;

export const CONSTRAINED_PROFILE = Object.freeze({
  context: Object.freeze({
    viewport: Object.freeze({ width: 390, height: 844 }),
    deviceScaleFactor: 2,
    hasTouch: true,
    isMobile: true,
  }),
  cpuThrottleRate: 4,
  network: Object.freeze({
    latencyMs: 150,
    aggregateDownloadBytesPerSecond: 200_000,
    uploadBytesPerSecond: 93_750,
    connectionType: 'cellular3g',
    enforcement: 'shared-fixture-origin',
    note: 'Latency and aggregate download throughput are enforced by the local origin for every request, including service-worker cache.addAll traffic. Upload is metadata only because the experiment performs GET/HEAD requests.',
  }),
});

const MIME_TYPES = new Map([
  ['.css', 'text/css; charset=utf-8'],
  ['.html', 'text/html; charset=utf-8'],
  ['.ico', 'image/x-icon'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.png', 'image/png'],
  ['.svg', 'image/svg+xml'],
  ['.webmanifest', 'application/manifest+json; charset=utf-8'],
  ['.webp', 'image/webp'],
]);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, ms)));
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

function summaryFor(samples, key) {
  const values = samples.map((sample) => sample[key]).filter(Number.isFinite);
  return {
    samples: values.length,
    median: round(percentile(values, 0.5)),
    p75: round(percentile(values, 0.75)),
    min: values.length ? round(Math.min(...values)) : null,
    max: values.length ? round(Math.max(...values)) : null,
  };
}

export function summariseSamples(samples) {
  const metrics = [
    'playerReadyMs',
    'loadEventMs',
    'catalogueReadyMs',
    'songsResponseEndMs',
    'catalogueHydrationAfterSongsResponseMs',
    'serverRequestCount',
    'serverResponseBytes',
    'uniqueRequestPathCount',
    'coreShellRequestCount',
    'coreShellResponseBytes',
    'postLoadPreCatalogueRequestCount',
    'peakInFlightRequests',
    'serviceWorkerReadyMs',
  ];
  return Object.fromEntries(metrics.map((key) => [key, summaryFor(samples, key)]));
}

export function medianDeltas(allowedSummary, blockedSummary) {
  const keys = Object.keys(allowedSummary);
  return Object.fromEntries(keys.map((key) => {
    const allowed = allowedSummary[key]?.median;
    const blocked = blockedSummary[key]?.median;
    return [key, Number.isFinite(allowed) && Number.isFinite(blocked) ? round(allowed - blocked) : null];
  }));
}

export function parseArgs(argv) {
  const options = {
    root: null,
    host: '127.0.0.1',
    port: 4174,
    runs: DEFAULT_RUNS,
    output: null,
    help: false,
  };

  for (const argument of argv) {
    if (argument === '--help') {
      options.help = true;
      continue;
    }
    const [key, ...valueParts] = argument.split('=');
    const value = valueParts.join('=');
    if (key === '--root' && value) options.root = path.resolve(value);
    else if (key === '--host' && value) options.host = value;
    else if (key === '--port' && value) options.port = Number.parseInt(value, 10);
    else if (key === '--runs' && value) options.runs = Number.parseInt(value, 10);
    else if (key === '--output' && value) options.output = value;
    else throw new Error(`Unknown or incomplete argument: ${argument}`);
  }

  if (!options.root) throw new Error('--root=<fixture-directory> is required');
  if (!Number.isInteger(options.port) || options.port < 1 || options.port > 65535) throw new Error('--port must be 1-65535');
  if (!Number.isInteger(options.runs) || options.runs < 2 || options.runs > 10) throw new Error('--runs must be 2-10');
  return options;
}

export function usageText() {
  return `Usage: node scripts/performance/measure-sw-install-contention.mjs --root=<fixture> [options]\n\nOptions:\n  --root=<path>       Production-equivalent fixture root (required)\n  --host=<host>       Local host (default 127.0.0.1)\n  --port=<n>          Local port (default 4174)\n  --runs=<n>          Alternating A/B pairs, 2-10 (default ${DEFAULT_RUNS})\n  --output=<path>     Write JSON report as well as stdout\n  --help              Show help\n\nThe constrained network is enforced at the shared fixture origin so page and service-worker requests receive the same latency and aggregate download limit. The blocked-service-worker scenario is an upper-bound comparison against zero install work, not a claim about the benefit of any particular production deferral.`;
}

function normalizeCoreShellPath(value) {
  const withoutDot = value.startsWith('./') ? value.slice(1) : value;
  return withoutDot.startsWith('/') ? withoutDot : `/${withoutDot}`;
}

export async function readServiceWorkerMetadata(root) {
  const source = await readFile(path.join(root, 'sw.js'), 'utf8');
  const arrayMatch = source.match(/const\s+CORE_SHELL\s*=\s*\[([\s\S]*?)\];/);
  if (!arrayMatch) throw new Error('Unable to locate CORE_SHELL in fixture sw.js');
  const entries = [...arrayMatch[1].matchAll(/['"]([^'"]+)['"]/g)].map((match) => match[1]);
  if (!entries.length) throw new Error('CORE_SHELL is empty');

  const prefix = source.match(/const\s+CACHE_PREFIX\s*=\s*['"]([^'"]+)['"]/i)?.[1] ?? null;
  const suffix = source.match(/const\s+CACHE_NAME\s*=\s*`\$\{CACHE_PREFIX\}([^`]+)`/)?.[1] ?? null;
  const cacheName = prefix && suffix ? `${prefix}${suffix}` : null;
  return {
    coreShellEntries: entries,
    coreShellPaths: new Set(entries.map(normalizeCoreShellPath)),
    coreShellEntryCount: entries.length,
    cacheName,
  };
}

function safeRequestPath(root, pathname) {
  let decoded;
  try { decoded = decodeURIComponent(pathname); }
  catch { return null; }
  const relative = decoded.replace(/^\/+/, '');
  const withIndex = !relative || relative.endsWith('/') ? `${relative}index.html` : relative;
  const resolved = path.resolve(root, withIndex);
  if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) return null;
  return resolved;
}

function mimeType(filePath) {
  return MIME_TYPES.get(path.extname(filePath).toLowerCase()) || 'application/octet-stream';
}

function compactRequest(record) {
  return {
    path: record.path,
    status: record.status,
    bytes: record.bytes,
    startEpochMs: record.startEpochMs,
    responseStartEpochMs: record.responseStartEpochMs,
    endEpochMs: record.endEpochMs,
    durationMs: Number.isFinite(record.endEpochMs) ? round(record.endEpochMs - record.startEpochMs) : null,
    activeAtStart: record.activeAtStart,
  };
}

function createAggregateDownloadGate(bytesPerSecond) {
  let tail = Promise.resolve();
  return async function consume(bytes) {
    if (!Number.isFinite(bytes) || bytes <= 0) return;
    let release;
    const previous = tail;
    tail = new Promise((resolve) => { release = resolve; });
    await previous;
    try {
      await sleep((bytes / bytesPerSecond) * 1000);
    } finally {
      release();
    }
  };
}

export async function startFixtureServer(root, host, port, network = CONSTRAINED_PROFILE.network) {
  const latencyMs = Number(network?.latencyMs) || 0;
  const aggregateDownloadBytesPerSecond = Number(network?.aggregateDownloadBytesPerSecond) || Number.POSITIVE_INFINITY;
  const consumeDownload = Number.isFinite(aggregateDownloadBytesPerSecond)
    ? createAggregateDownloadGate(aggregateDownloadBytesPerSecond)
    : async () => {};

  const state = {
    sampleId: null,
    requests: [],
    active: 0,
    peak: 0,
  };

  async function beginResponse(record, response, status, headers, body = null, method = 'GET') {
    record.status = status;
    record.bytes = body?.byteLength || 0;
    await sleep(latencyMs);
    record.responseStartEpochMs = Date.now();
    response.writeHead(status, headers);
    if (method === 'HEAD' || !body?.byteLength) {
      response.end();
      return;
    }
    await consumeDownload(body.byteLength);
    response.end(body);
  }

  const server = http.createServer(async (request, response) => {
    const parsed = new URL(request.url || '/', `http://${host}:${port}`);
    const record = {
      sampleId: state.sampleId,
      path: parsed.pathname,
      startEpochMs: Date.now(),
      responseStartEpochMs: null,
      endEpochMs: null,
      status: null,
      bytes: 0,
      activeAtStart: state.active + 1,
    };
    state.active += 1;
    state.peak = Math.max(state.peak, state.active);
    state.requests.push(record);

    let finalized = false;
    const finalize = () => {
      if (finalized) return;
      finalized = true;
      record.endEpochMs = Date.now();
      state.active = Math.max(0, state.active - 1);
    };
    response.once('finish', finalize);
    response.once('close', finalize);

    try {
      if (request.method !== 'GET' && request.method !== 'HEAD') {
        const body = Buffer.from('Method Not Allowed');
        await beginResponse(record, response, 405, {
          'content-type': 'text/plain; charset=utf-8',
          'content-length': body.byteLength,
        }, body, request.method);
        return;
      }

      const filePath = safeRequestPath(root, parsed.pathname);
      if (!filePath) {
        const body = Buffer.from('Bad Request');
        await beginResponse(record, response, 400, {
          'content-type': 'text/plain; charset=utf-8',
          'content-length': body.byteLength,
        }, body, request.method);
        return;
      }

      let fileStat;
      let body;
      try {
        fileStat = await stat(filePath);
        if (!fileStat.isFile()) throw new Error('not-file');
        body = await readFile(filePath);
      } catch {
        const missing = Buffer.from('Not Found');
        await beginResponse(record, response, 404, {
          'content-type': 'text/plain; charset=utf-8',
          'content-length': missing.byteLength,
        }, missing, request.method);
        return;
      }

      const etag = `\"${fileStat.size.toString(16)}-${Math.trunc(fileStat.mtimeMs).toString(16)}\"`;
      const headers = {
        'cache-control': 'public, max-age=0, must-revalidate',
        'content-type': mimeType(filePath),
        etag,
        'last-modified': fileStat.mtime.toUTCString(),
      };
      if (request.headers['if-none-match'] === etag) {
        await beginResponse(record, response, 304, headers, null, request.method);
        return;
      }

      await beginResponse(record, response, 200, { ...headers, 'content-length': body.byteLength }, body, request.method);
    } catch (error) {
      if (response.headersSent || response.destroyed) {
        response.destroy(error);
        return;
      }
      const body = Buffer.from(`Fixture server error: ${error.message}`);
      await beginResponse(record, response, 500, {
        'content-type': 'text/plain; charset=utf-8',
        'content-length': body.byteLength,
      }, body, request.method);
    }
  });

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, resolve);
  });

  return {
    origin: `http://${host}:${port}/`,
    networkEnforcement: {
      location: 'shared-fixture-origin',
      latencyMs,
      aggregateDownloadBytesPerSecond: Number.isFinite(aggregateDownloadBytesPerSecond) ? aggregateDownloadBytesPerSecond : null,
      appliesToServiceWorkerRequests: true,
    },
    beginSample(sampleId) {
      if (state.active !== 0) throw new Error(`Cannot begin ${sampleId} while ${state.active} request(s) are active`);
      state.sampleId = sampleId;
      state.requests = [];
      state.peak = 0;
    },
    async waitForIdle(timeoutMs = 12_000) {
      const started = Date.now();
      let stableSince = null;
      while (Date.now() - started < timeoutMs) {
        if (state.active === 0) {
          stableSince ??= Date.now();
          if (Date.now() - stableSince >= 150) return true;
        } else {
          stableSince = null;
        }
        await sleep(25);
      }
      return state.active === 0;
    },
    endSample(sampleId) {
      if (state.sampleId !== sampleId) throw new Error(`Server sample mismatch: expected ${state.sampleId}, received ${sampleId}`);
      const requests = state.requests.filter((record) => record.sampleId === sampleId).map(compactRequest);
      const peakInFlightRequests = state.peak;
      state.sampleId = null;
      return { requests, peakInFlightRequests };
    },
    async close() {
      await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    },
  };
}

export function deriveServerMetrics(serverSample, swMetadata, browserTiming) {
  const requests = serverSample.requests;
  const coreShell = requests.filter((request) => swMetadata.coreShellPaths.has(request.path));
  const uniquePaths = new Set(requests.map((request) => request.path));
  const timeOriginMs = browserTiming.timeOriginMs;
  const loadEpoch = Number.isFinite(browserTiming.loadEventMs) ? timeOriginMs + browserTiming.loadEventMs : null;
  const catalogueEpoch = Number.isFinite(browserTiming.catalogueReadyMs) ? timeOriginMs + browserTiming.catalogueReadyMs : null;
  const postLoadPreCatalogue = Number.isFinite(loadEpoch) && Number.isFinite(catalogueEpoch)
    ? requests.filter((request) => request.startEpochMs >= loadEpoch && request.startEpochMs <= catalogueEpoch)
    : [];
  const statusFailures = requests.filter((request) => Number.isFinite(request.status) && request.status >= 400);
  const swRequests = requests.filter((request) => request.path === '/sw.js');

  return {
    serverRequestCount: requests.length,
    serverResponseBytes: requests.reduce((total, request) => total + (request.bytes || 0), 0),
    uniqueRequestPathCount: uniquePaths.size,
    coreShellRequestCount: coreShell.length,
    coreShellResponseBytes: coreShell.reduce((total, request) => total + (request.bytes || 0), 0),
    postLoadPreCatalogueRequestCount: postLoadPreCatalogue.length,
    peakInFlightRequests: serverSample.peakInFlightRequests,
    serviceWorkerScriptRequestCount: swRequests.length,
    serviceWorkerScriptFirstStartMs: swRequests.length && Number.isFinite(timeOriginMs)
      ? round(Math.min(...swRequests.map((request) => request.startEpochMs)) - timeOriginMs)
      : null,
    statusFailures,
    requests,
  };
}
