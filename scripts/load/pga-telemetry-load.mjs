import { writeFile } from 'node:fs/promises'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

import { HEARTBEAT_INTERVAL_MS, MAX_QUEUE_EVENTS } from '../../src/pga/telemetry/constants.js'
import { MAX_BODY_BYTES, SCHEMA_VERSION } from '../../src/pga/backend/lib/constants.js'

export const MAX_EXECUTION_RPS = 500
export const MAX_EXECUTION_CONCURRENCY = 100
export const DEFAULT_EXECUTION_RPS = 100
export const DEFAULT_EXECUTION_CONCURRENCY = 20
export const DEFAULT_DURATION_MS = 90_000
export const DEFAULT_LISTENERS = 1_000
export const DEFAULT_INVALID_RATIO = 0.1
export const DEFAULT_RETRY_ATTEMPTS = 3

const SCENARIOS = new Set(['steady', 'navratri-burst', 'retry-storm', 'invalid-mix', 'matrix'])
const PRODUCTION_HOSTS = new Set([
  'playgarba.com',
  'www.playgarba.com',
  'events.playgarba.com',
  'pga.playgarba.com',
])
const ADMIN_ROUTES = [
  '/api/home',
  '/api/live',
  '/api/audience?range=24h',
  '/api/listening?range=24h',
  '/api/health',
]
const INVALID_VARIANTS = ['invalid_json', 'oversized_body', 'unknown_event', 'wrong_origin']

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const round = (value, places = 3) => Number(value.toFixed(places))

function requireValue(argv, index, flag) {
  const value = argv[index + 1]
  if (value == null || value.startsWith('--')) throw new Error(`${flag} requires a value`)
  return value
}

function parsePositiveInteger(value, flag, { min = 1, max = Number.MAX_SAFE_INTEGER } = {}) {
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw new Error(`${flag} must be an integer between ${min} and ${max}`)
  }
  return parsed
}

function parseRatio(value, flag) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 0.5) {
    throw new Error(`${flag} must be between 0 and 0.5`)
  }
  return parsed
}

export function parseArgs(argv = process.argv.slice(2)) {
  const config = {
    scenario: 'steady',
    listeners: DEFAULT_LISTENERS,
    durationMs: DEFAULT_DURATION_MS,
    retryAttempts: DEFAULT_RETRY_ATTEMPTS,
    invalidRatio: DEFAULT_INVALID_RATIO,
    rpsCap: DEFAULT_EXECUTION_RPS,
    concurrency: DEFAULT_EXECUTION_CONCURRENCY,
    execute: false,
    target: '',
    environment: 'model-only',
    output: '',
    revision: process.env.GITHUB_SHA || 'unknown',
    adminUrl: '',
    accessJwtEnv: '',
    adminProbeSeconds: 10,
  }

  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i]
    if (flag === '--execute') config.execute = true
    else if (flag === '--scenario') {
      const value = requireValue(argv, i, flag)
      if (!SCENARIOS.has(value)) throw new Error(`Unknown scenario: ${value}`)
      config.scenario = value
      i += 1
    } else if (flag === '--listeners') {
      config.listeners = parsePositiveInteger(requireValue(argv, i, flag), flag, { max: 100_000 })
      i += 1
    } else if (flag === '--duration-seconds') {
      config.durationMs = parsePositiveInteger(requireValue(argv, i, flag), flag, { max: 86_400 }) * 1000
      i += 1
    } else if (flag === '--retry-attempts') {
      config.retryAttempts = parsePositiveInteger(requireValue(argv, i, flag), flag, { max: MAX_QUEUE_EVENTS })
      i += 1
    } else if (flag === '--invalid-ratio') {
      config.invalidRatio = parseRatio(requireValue(argv, i, flag), flag)
      i += 1
    } else if (flag === '--rps-cap') {
      config.rpsCap = parsePositiveInteger(requireValue(argv, i, flag), flag, { max: MAX_EXECUTION_RPS })
      i += 1
    } else if (flag === '--concurrency') {
      config.concurrency = parsePositiveInteger(requireValue(argv, i, flag), flag, { max: MAX_EXECUTION_CONCURRENCY })
      i += 1
    } else if (flag === '--target') {
      config.target = requireValue(argv, i, flag)
      i += 1
    } else if (flag === '--environment') {
      config.environment = requireValue(argv, i, flag)
      i += 1
    } else if (flag === '--output') {
      config.output = requireValue(argv, i, flag)
      i += 1
    } else if (flag === '--revision') {
      config.revision = requireValue(argv, i, flag)
      i += 1
    } else if (flag === '--admin-url') {
      config.adminUrl = requireValue(argv, i, flag)
      i += 1
    } else if (flag === '--access-jwt-env') {
      config.accessJwtEnv = requireValue(argv, i, flag)
      i += 1
    } else if (flag === '--admin-probe-seconds') {
      config.adminProbeSeconds = parsePositiveInteger(requireValue(argv, i, flag), flag, { max: 300 })
      i += 1
    } else if (flag === '--help' || flag === '-h') {
      config.help = true
    } else {
      throw new Error(`Unknown argument: ${flag}`)
    }
  }

  return config
}

export function heartbeatRequestsPerSecond(listeners, heartbeatMs = HEARTBEAT_INTERVAL_MS) {
  if (!Number.isFinite(listeners) || listeners < 0) throw new Error('listeners must be non-negative')
  if (!Number.isFinite(heartbeatMs) || heartbeatMs <= 0) throw new Error('heartbeatMs must be positive')
  return listeners * 1000 / heartbeatMs
}

function listenerIds(listenerIndex) {
  const suffix = String(listenerIndex + 1).padStart(6, '0')
  return {
    browserId: `load-browser-${suffix}`,
    sessionId: `load-session-${suffix}`,
    tabId: `load-tab-${suffix}`,
    playbackId: `load-playback-${suffix}`,
    searchId: `load-search-${suffix}`,
  }
}

function baseEvent({ listenerIndex, eventName, sequence, nowMs, surface = 'player' }) {
  const ids = listenerIds(listenerIndex)
  return {
    schema_version: SCHEMA_VERSION,
    event_name: eventName,
    event_id: `load-${eventName}-${listenerIndex + 1}-${sequence}`,
    occurred_at: nowMs,
    browser_id: ids.browserId,
    session_id: ids.sessionId,
    tab_id: ids.tabId,
    surface,
    display_mode: 'browser',
    world: 'traditional',
    entry_point: 'unknown',
    build_id: 'pga-load-test',
  }
}

function presenceEvent({ listenerIndex, sequence, nowMs, stableEventId = false }) {
  const event = baseEvent({ listenerIndex, eventName: 'presence_heartbeat', sequence, nowMs })
  if (stableEventId) event.event_id = `load-presence-retry-${listenerIndex + 1}`
  return {
    ...event,
    content_type: 'song',
    content_id: 'load-song-1',
    playback_state: 'playing',
    played_ms_since_previous_heartbeat: Math.min(60_000, HEARTBEAT_INTERVAL_MS),
  }
}

function navratriBurstEvents({ listenerIndex, nowMs }) {
  const ids = listenerIds(listenerIndex)
  const session = baseEvent({ listenerIndex, eventName: 'session_started', sequence: 'burst-session', nowMs })
  const search = {
    ...baseEvent({ listenerIndex, eventName: 'search_submitted', sequence: 'burst-search', nowMs, surface: 'explore' }),
    search_id: ids.searchId,
    search_term: 'garba load test',
    entry_point: 'explore_search',
  }
  const playIntent = {
    ...baseEvent({ listenerIndex, eventName: 'play_intent', sequence: 'burst-intent', nowMs }),
    playback_instance_id: ids.playbackId,
    content_type: 'song',
    content_id: 'load-song-1',
    entry_point: 'player',
  }
  const playbackStarted = {
    ...baseEvent({ listenerIndex, eventName: 'playback_started', sequence: 'burst-started', nowMs }),
    playback_instance_id: ids.playbackId,
    content_type: 'song',
    content_id: 'load-song-1',
    entry_point: 'player',
  }
  return [session, search, playIntent, playbackStarted]
}

function bodyText(value) {
  return JSON.stringify(value)
}

function validHeaders(origin = 'https://playgarba.com') {
  return {
    'content-type': 'application/json',
    origin,
    'user-agent': 'PlayGarba-PGA-Load-Harness/1.0',
  }
}

function invalidRequestSpec({ variant, listenerIndex, nowMs }) {
  if (variant === 'invalid_json') {
    return {
      kind: variant,
      expectedClass: 'rejected',
      headers: validHeaders(),
      bodyText: '{"events":',
      logicalEvents: 0,
    }
  }
  if (variant === 'oversized_body') {
    const padding = 'x'.repeat(MAX_BODY_BYTES + 1024)
    return {
      kind: variant,
      expectedClass: 'rejected',
      headers: validHeaders(),
      bodyText: JSON.stringify({ events: [], padding }),
      logicalEvents: 0,
    }
  }
  const event = presenceEvent({ listenerIndex, sequence: 'invalid', nowMs })
  if (variant === 'unknown_event') event.event_name = 'unknown_load_event'
  return {
    kind: variant,
    expectedClass: 'rejected',
    headers: validHeaders(variant === 'wrong_origin' ? 'https://invalid.example' : 'https://playgarba.com'),
    bodyText: bodyText({ events: [event] }),
    logicalEvents: 1,
  }
}

export function buildScenarioPlan(options = {}) {
  const scenario = options.scenario || 'steady'
  if (!SCENARIOS.has(scenario) || scenario === 'matrix') {
    if (scenario === 'matrix') throw new Error('matrix is a CLI aggregate, not a single executable scenario')
    throw new Error(`Unknown scenario: ${scenario}`)
  }
  const listeners = Number(options.listeners ?? DEFAULT_LISTENERS)
  const durationMs = Number(options.durationMs ?? DEFAULT_DURATION_MS)
  const retryAttempts = Math.min(MAX_QUEUE_EVENTS, Number(options.retryAttempts ?? DEFAULT_RETRY_ATTEMPTS))
  const invalidRatio = Number(options.invalidRatio ?? DEFAULT_INVALID_RATIO)
  if (!Number.isInteger(listeners) || listeners < 1) throw new Error('listeners must be a positive integer')
  if (!Number.isFinite(durationMs) || durationMs < 1) throw new Error('durationMs must be positive')
  if (!Number.isInteger(retryAttempts) || retryAttempts < 1 || retryAttempts > MAX_QUEUE_EVENTS) throw new Error('retryAttempts out of bounds')
  if (!Number.isFinite(invalidRatio) || invalidRatio < 0 || invalidRatio > 0.5) throw new Error('invalidRatio out of bounds')

  const heartbeatRounds = Math.max(1, Math.ceil(durationMs / HEARTBEAT_INTERVAL_MS))
  const heartbeatRequests = heartbeatRounds * listeners
  let requests = heartbeatRequests
  let events = heartbeatRequests
  let rejectedRequests = 0

  if (scenario === 'navratri-burst') {
    requests += listeners
    events += listeners * 4
  } else if (scenario === 'retry-storm') {
    requests = listeners * retryAttempts
    events = requests
  } else if (scenario === 'invalid-mix') {
    requests = listeners
    rejectedRequests = Math.round(listeners * invalidRatio)
    events = requests - rejectedRequests + rejectedRequests
  }

  const heartbeatRps = heartbeatRequestsPerSecond(listeners)
  return {
    scenario,
    listeners,
    durationMs,
    heartbeatIntervalMs: HEARTBEAT_INTERVAL_MS,
    heartbeatRps: round(heartbeatRps),
    heartbeatRounds,
    logicalRequests: requests,
    logicalEvents: events,
    expectedRejectedRequests: rejectedRequests,
    retryAttempts: scenario === 'retry-storm' ? retryAttempts : 0,
    invalidRatio: scenario === 'invalid-mix' ? invalidRatio : 0,
    clientQueueBound: MAX_QUEUE_EVENTS,
    notes: [
      'Request counts are a deterministic model, not measured Cloudflare capacity.',
      'Execution is globally paced by the configured RPS cap even for burst/retry scenarios.',
    ],
  }
}

export function buildRequestSpec({
  scenario,
  index,
  listeners,
  durationMs = DEFAULT_DURATION_MS,
  retryAttempts = DEFAULT_RETRY_ATTEMPTS,
  invalidRatio = DEFAULT_INVALID_RATIO,
  nowMs = Date.now(),
}) {
  const listenerIndex = index % listeners
  if (scenario === 'steady') {
    const roundIndex = Math.floor(index / listeners)
    const eventNow = nowMs + roundIndex * HEARTBEAT_INTERVAL_MS
    const events = [presenceEvent({ listenerIndex, sequence: `steady-${roundIndex}`, nowMs: eventNow })]
    return { kind: 'valid_presence', expectedClass: 'accepted', headers: validHeaders(), bodyText: bodyText({ events }), logicalEvents: 1 }
  }

  if (scenario === 'navratri-burst') {
    if (index < listeners) {
      const events = navratriBurstEvents({ listenerIndex, nowMs })
      return { kind: 'valid_navratri_burst', expectedClass: 'accepted', headers: validHeaders(), bodyText: bodyText({ events }), logicalEvents: events.length }
    }
    const heartbeatIndex = index - listeners
    const heartbeatListener = heartbeatIndex % listeners
    const roundIndex = Math.floor(heartbeatIndex / listeners)
    const eventNow = nowMs + roundIndex * HEARTBEAT_INTERVAL_MS
    const events = [presenceEvent({ listenerIndex: heartbeatListener, sequence: `burst-steady-${roundIndex}`, nowMs: eventNow })]
    return { kind: 'valid_presence', expectedClass: 'accepted', headers: validHeaders(), bodyText: bodyText({ events }), logicalEvents: 1 }
  }

  if (scenario === 'retry-storm') {
    const attempt = Math.floor(index / listeners)
    if (attempt >= retryAttempts) throw new Error('retry request index exceeds configured attempts')
    const events = [presenceEvent({ listenerIndex, sequence: `retry-${attempt}`, nowMs, stableEventId: true })]
    return {
      kind: 'valid_retry_attempt',
      expectedClass: 'accepted',
      headers: validHeaders(),
      bodyText: bodyText({ events }),
      logicalEvents: 1,
      attempt: attempt + 1,
      logicalEventId: events[0].event_id,
    }
  }

  if (scenario === 'invalid-mix') {
    const invalidCount = Math.round(listeners * invalidRatio)
    if (index < invalidCount) {
      return invalidRequestSpec({ variant: INVALID_VARIANTS[index % INVALID_VARIANTS.length], listenerIndex, nowMs })
    }
    const events = [presenceEvent({ listenerIndex, sequence: 'mixed-valid', nowMs })]
    return { kind: 'valid_presence', expectedClass: 'accepted', headers: validHeaders(), bodyText: bodyText({ events }), logicalEvents: 1 }
  }

  throw new Error(`Unsupported executable scenario: ${scenario}`)
}

export function assertSafeTarget(target, environment = '') {
  if (!target) throw new Error('Execution requires --target')
  const url = new URL(target)
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Target must use http or https')
  const hostname = url.hostname.toLowerCase()
  if (PRODUCTION_HOSTS.has(hostname)) {
    throw new Error(`Production host ${hostname} is intentionally blocked by this harness`)
  }
  if (/^prod(?:uction)?$/i.test(String(environment).trim())) {
    throw new Error('Production environment execution is intentionally blocked by this harness')
  }
  if (url.pathname === '/' || url.pathname === '') url.pathname = '/v1/events'
  if (url.pathname !== '/v1/events') throw new Error('Ingestion target path must be /v1/events')
  url.search = ''
  url.hash = ''
  return url
}

function assertSafeAdminTarget(target, environment = '') {
  if (!target) return null
  const url = new URL(target)
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Admin target must use http or https')
  if (PRODUCTION_HOSTS.has(url.hostname.toLowerCase())) {
    throw new Error(`Production admin host ${url.hostname} is intentionally blocked by this harness`)
  }
  if (/^prod(?:uction)?$/i.test(String(environment).trim())) {
    throw new Error('Production environment execution is intentionally blocked by this harness')
  }
  url.pathname = '/'
  url.search = ''
  url.hash = ''
  return url
}

export function percentile(values, quantile) {
  if (!Array.isArray(values) || values.length === 0) return null
  if (!Number.isFinite(quantile) || quantile < 0 || quantile > 1) throw new Error('quantile must be between 0 and 1')
  const sorted = [...values].sort((a, b) => a - b)
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(quantile * sorted.length) - 1))
  return sorted[index]
}

function summarizeResults(results, startedAt, finishedAt) {
  const latencies = results.filter((result) => Number.isFinite(result.latencyMs)).map((result) => result.latencyMs)
  const byStatus = {}
  const rejectedByReason = {}
  let acceptedEvents = 0
  let networkErrors = 0
  let expectedAcceptedRequests = 0
  let expectedRejectedRequests = 0
  let expectedClassMismatches = 0

  for (const result of results) {
    if (result.expectedClass === 'accepted') expectedAcceptedRequests += 1
    else expectedRejectedRequests += 1
    if (result.status) byStatus[result.status] = (byStatus[result.status] || 0) + 1
    if (result.networkError) networkErrors += 1
    if (Number.isFinite(result.accepted)) acceptedEvents += result.accepted
    if (result.errorCode) rejectedByReason[result.errorCode] = (rejectedByReason[result.errorCode] || 0) + 1
    const wasAccepted = result.status >= 200 && result.status < 300
    if ((result.expectedClass === 'accepted' && !wasAccepted) || (result.expectedClass === 'rejected' && wasAccepted)) expectedClassMismatches += 1
  }

  const elapsedSeconds = Math.max(0.001, (finishedAt - startedAt) / 1000)
  return {
    requestsAttempted: results.length,
    requestsPerSecondObserved: round(results.length / elapsedSeconds),
    acceptedEvents,
    expectedAcceptedRequests,
    expectedRejectedRequests,
    expectedClassMismatches,
    networkErrors,
    byStatus,
    rejectedByReason,
    latencyMs: {
      p50: percentile(latencies, 0.5),
      p95: percentile(latencies, 0.95),
      p99: percentile(latencies, 0.99),
      max: latencies.length ? Math.max(...latencies) : null,
    },
  }
}

async function issueRequest(url, spec) {
  const started = performance.now()
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: spec.headers,
      body: spec.bodyText,
      redirect: 'manual',
    })
    const text = await response.text()
    let data = null
    try { data = text ? JSON.parse(text) : null } catch { data = null }
    return {
      kind: spec.kind,
      expectedClass: spec.expectedClass,
      status: response.status,
      latencyMs: round(performance.now() - started),
      accepted: Number.isFinite(data?.accepted) ? data.accepted : null,
      errorCode: typeof data?.error === 'string' ? data.error : '',
      networkError: '',
      logicalEventId: spec.logicalEventId || '',
      attempt: spec.attempt || 0,
    }
  } catch (error) {
    return {
      kind: spec.kind,
      expectedClass: spec.expectedClass,
      status: 0,
      latencyMs: round(performance.now() - started),
      accepted: null,
      errorCode: '',
      networkError: error instanceof Error ? error.name : 'network_error',
      logicalEventId: spec.logicalEventId || '',
      attempt: spec.attempt || 0,
    }
  }
}

async function runPaced(total, { concurrency, rpsCap }, task) {
  const results = new Array(total)
  const startedAt = Date.now()
  let nextIndex = 0
  const spacingMs = 1000 / rpsCap
  const workerCount = Math.min(concurrency, total)

  const workers = Array.from({ length: workerCount }, async () => {
    while (true) {
      const index = nextIndex
      nextIndex += 1
      if (index >= total) return
      const dueAt = startedAt + index * spacingMs
      const waitMs = dueAt - Date.now()
      if (waitMs > 0) await sleep(waitMs)
      results[index] = await task(index)
    }
  })

  await Promise.all(workers)
  return { results, startedAt, finishedAt: Date.now() }
}

async function fetchAdminRoute(baseUrl, route, accessJwt) {
  const started = performance.now()
  try {
    const response = await fetch(new URL(route, baseUrl), {
      method: 'GET',
      headers: { 'CF-Access-Jwt-Assertion': accessJwt },
      redirect: 'manual',
    })
    const text = await response.text()
    let payload = null
    try { payload = text ? JSON.parse(text) : null } catch { payload = null }
    return {
      route,
      status: response.status,
      latencyMs: round(performance.now() - started),
      state: typeof payload?.state === 'string' ? payload.state : '',
      generatedAt: payload?.generatedAt || payload?.generated_at || '',
      error: typeof payload?.error === 'string' ? payload.error : '',
    }
  } catch (error) {
    return {
      route,
      status: 0,
      latencyMs: round(performance.now() - started),
      state: '',
      generatedAt: '',
      error: error instanceof Error ? error.name : 'network_error',
    }
  }
}

async function probeAdmin(baseUrl, accessJwt) {
  const sampledAt = new Date().toISOString()
  const routes = await Promise.all(ADMIN_ROUTES.map((route) => fetchAdminRoute(baseUrl, route, accessJwt)))
  return { sampledAt, routes }
}

function matrixPlans(config) {
  return [1_000, 5_000, 10_000].map((listeners) => buildScenarioPlan({
    scenario: 'steady',
    listeners,
    durationMs: config.durationMs,
    retryAttempts: config.retryAttempts,
    invalidRatio: config.invalidRatio,
  }))
}

function dryRunReport(config) {
  const plans = config.scenario === 'matrix'
    ? matrixPlans(config)
    : [buildScenarioPlan(config)]
  return {
    mode: 'model-only',
    revision: config.revision,
    environment: config.environment,
    generatedAt: new Date().toISOString(),
    executionBlocked: true,
    capacityClaim: 'not measured',
    plans,
    externalEvidenceStillRequired: [
      'production-equivalent Cloudflare Worker capacity',
      'Analytics Engine write-failure evidence under load',
      'protected PGA aggregate latency while ingestion is active',
      'D1 rollup freshness under sustained ingestion',
      'platform CPU/runtime-limit evidence',
    ],
  }
}

async function executeScenario(config) {
  if (config.scenario === 'matrix') throw new Error('Use one concrete scenario with --execute; matrix mode is model-only')
  const ingestUrl = assertSafeTarget(config.target, config.environment)
  const adminBase = assertSafeAdminTarget(config.adminUrl, config.environment)
  const accessJwt = config.accessJwtEnv ? process.env[config.accessJwtEnv] || '' : ''
  if (adminBase && !accessJwt) throw new Error('--admin-url requires --access-jwt-env pointing to a populated environment variable')

  const plan = buildScenarioPlan(config)
  const samples = []
  const probePromises = []
  let probeTimer = null
  if (adminBase) {
    samples.push(await probeAdmin(adminBase, accessJwt))
    probeTimer = setInterval(() => {
      const promise = probeAdmin(adminBase, accessJwt).then((sample) => samples.push(sample))
      probePromises.push(promise)
    }, config.adminProbeSeconds * 1000)
  }

  const baseNowMs = Date.now()
  const run = await runPaced(plan.logicalRequests, config, async (index) => {
    const spec = buildRequestSpec({
      scenario: config.scenario,
      index,
      listeners: config.listeners,
      durationMs: config.durationMs,
      retryAttempts: config.retryAttempts,
      invalidRatio: config.invalidRatio,
      nowMs: baseNowMs,
    })
    return issueRequest(ingestUrl, spec)
  })

  if (probeTimer) clearInterval(probeTimer)
  await Promise.all(probePromises)
  if (adminBase) samples.push(await probeAdmin(adminBase, accessJwt))

  const duplicateAttempts = new Map()
  for (const result of run.results) {
    if (!result.logicalEventId) continue
    const current = duplicateAttempts.get(result.logicalEventId) || { attempts: 0, acceptedAttempts: 0 }
    current.attempts += 1
    if (result.status >= 200 && result.status < 300) current.acceptedAttempts += 1
    duplicateAttempts.set(result.logicalEventId, current)
  }
  const retryTransport = [...duplicateAttempts.entries()].map(([eventId, value]) => ({ eventId, ...value }))

  return {
    mode: 'non-production-execution',
    revision: config.revision,
    environment: config.environment,
    target: `${ingestUrl.origin}${ingestUrl.pathname}`,
    generatedAt: new Date().toISOString(),
    capacityClaim: 'measured only for the named non-production target and exact revision',
    plan,
    execution: summarizeResults(run.results, run.startedAt, run.finishedAt),
    retryTransport,
    adminSamples: samples,
    evidenceBoundaries: {
      storageLevelRetryDeduplication: retryTransport.length ? 'requires Analytics Engine/aggregate evidence; transport response alone is insufficient' : 'not exercised',
      analyticsEngineWriteFailures: 'only observable when the target surfaces them through status/log/health evidence',
      d1RollupFreshness: adminBase ? 'inspect protected health/aggregate samples and external D1 evidence' : 'blocked: no protected PGA target supplied',
      productionCapacity: 'not tested; production hosts are hard-blocked by this harness',
    },
  }
}

function helpText() {
  return `PGA telemetry load harness\n\nModel only (default):\n  node scripts/load/pga-telemetry-load.mjs --scenario matrix --duration-seconds 90\n  node scripts/load/pga-telemetry-load.mjs --scenario steady --listeners 10000 --duration-seconds 90\n\nNon-production execution:\n  node scripts/load/pga-telemetry-load.mjs --execute --scenario steady --listeners 1000 \\\n    --duration-seconds 90 --target https://example-staging.workers.dev/v1/events \\\n    --environment staging --rps-cap 100 --concurrency 20 --output /tmp/pga-load.json\n\nScenarios: steady, navratri-burst, retry-storm, invalid-mix, matrix (model only).\nProduction PlayGarba hosts are intentionally blocked.\n`
}

async function main() {
  const config = parseArgs()
  if (config.help) {
    console.log(helpText())
    return
  }
  const report = config.execute ? await executeScenario(config) : dryRunReport(config)
  const json = `${JSON.stringify(report, null, 2)}\n`
  if (config.output) await writeFile(config.output, json, 'utf8')
  process.stdout.write(json)
}

const isDirect = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]
if (isDirect) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  })
}
