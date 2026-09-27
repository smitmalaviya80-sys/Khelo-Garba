import test from 'node:test'
import assert from 'node:assert/strict'

import {
  HEALTH_COLLECTOR_LIMITS,
  collectHealthSnapshot,
  healthCollectorTargets,
} from '../collector.js'

const NOW = Date.parse('2026-09-10T07:00:00.000Z')
const SHA = 'a'.repeat(40)
const REPOSITORY = 'ruddvz/garba'
const FIVE_MINUTES = 5 * 60 * 1000

function headers(values = {}) {
  const entries = new Map(Object.entries(values).map(([key, value]) => [key.toLowerCase(), String(value)]))
  return { get: (name) => entries.get(String(name).toLowerCase()) ?? null }
}

function bodyReader(text = '') {
  const chunk = new TextEncoder().encode(text)
  let sent = false
  return {
    getReader() {
      return {
        async read() {
          if (sent) return { done: true, value: undefined }
          sent = true
          return { done: false, value: chunk }
        },
        async cancel() {
          sent = true
        },
      }
    },
  }
}

function response(url, { status = 200, body = '', headers: headerValues = {} } = {}) {
  return {
    url,
    status,
    headers: headers(headerValues),
    body: bodyReader(body),
  }
}

function jsonResponse(url, value, options = {}) {
  return response(url, { ...options, body: JSON.stringify(value) })
}

function stalledResponse(url, signal) {
  return {
    url,
    status: 200,
    headers: headers(),
    body: {
      getReader() {
        return {
          read() {
            return new Promise((resolve, reject) => {
              signal.addEventListener('abort', () => reject(new Error('RAW_SLOW_BODY_SECRET')), { once: true })
            })
          },
          async cancel() {},
        }
      },
    },
  }
}

function mockFetch(routes) {
  const calls = []
  const fetchImpl = async (url, init = {}) => {
    calls.push({ url: String(url), init })
    const route = routes[String(url)]
    if (!route) throw new Error('UNEXPECTED_FETCH_SECRET')
    if (typeof route === 'function') return route(init)
    if (route instanceof Error) throw route
    return route
  }
  fetchImpl.calls = calls
  return fetchImpl
}

function buildInfo(revision = SHA) {
  return {
    generatedAt: new Date(NOW - 1_000).toISOString(),
    deployment: { origin: 'https://playgarba.com' },
    build: { revision, workflowRunId: 123 },
    catalogue: { version: 'catalogue-test', activeSongs: 42, ordinaryListeningSongs: 40 },
    playback: { youtubePlayable: 39, migrationBacklog: 3 },
  }
}

function checksPayload() {
  return {
    total_count: 2,
    secret: 'RAW_GITHUB_BODY_SECRET',
    check_runs: [
      {
        id: 10,
        name: 'Validate GARBA',
        status: 'completed',
        conclusion: 'success',
        completed_at: new Date(NOW - 5_000).toISOString(),
        details_url: 'https://github.com/ruddvz/garba/actions/runs/10?token=drop-me#job',
        output: { text: 'DO_NOT_COPY_RAW_CHECK_OUTPUT' },
      },
      {
        id: 11,
        name: 'PGA security validate',
        status: 'completed',
        conclusion: 'success',
        completed_at: new Date(NOW - 4_000).toISOString(),
        details_url: 'https://github.com/ruddvz/garba/actions/runs/11',
      },
    ],
  }
}

function healthyOperationalObservations() {
  const checkedAt = NOW - 2_000
  const dataThrough = new Date(NOW - 3_000).toISOString()
  return {
    playback: {
      completed: true,
      state: 'success',
      confirmedStart: true,
      controlsResponsive: true,
      contentId: 'fixture-song',
      checkedAt,
      sourceUrl: 'https://github.com/ruddvz/garba/actions/runs/playback',
      rawSecret: 'DO_NOT_ECHO_PLAYBACK_SECRET',
    },
    catalogue: {
      completed: true,
      state: 'success',
      ok: true,
      errors: 0,
      warnings: 0,
      revision: SHA,
      checkedAt,
      sourceUrl: 'https://github.com/ruddvz/garba/actions/runs/catalogue',
      rawSecret: 'DO_NOT_ECHO_CATALOGUE_SECRET',
    },
    telemetry: {
      payload: {
        status: 'complete',
        generatedAt: dataThrough,
        dataThrough,
        sources: [{ name: 'analytics-engine', status: 'complete' }],
        data: { rawEvents: ['DO_NOT_ECHO_EVENT'] },
      },
      checkedAt,
      sourceUrl: 'https://pga.playgarba.com/api/health',
    },
    rollups: {
      payload: {
        status: 'complete',
        generatedAt: dataThrough,
        dataThrough,
        sources: [{ name: 'd1-rollups', status: 'complete' }],
        data: { rollups: [{ id: 'rollup-1', status: 'complete', completed_at: dataThrough }] },
      },
      checkedAt,
      sourceUrl: 'https://pga.playgarba.com/api/health',
    },
    pwa: {
      completed: true,
      ok: true,
      controlled: true,
      state: 'success',
      activeVersion: 'pga-shell-test',
      expectedVersion: 'pga-shell-test',
      checkedAt,
      sourceUrl: 'https://github.com/ruddvz/garba/actions/runs/pwa',
      rawSecret: 'DO_NOT_ECHO_PWA_SECRET',
    },
  }
}

function freshnessBudgets() {
  return {
    production: FIVE_MINUTES,
    playback: FIVE_MINUTES,
    deployment: FIVE_MINUTES,
    ci: FIVE_MINUTES,
    catalogue: FIVE_MINUTES,
    telemetry: FIVE_MINUTES,
    rollups: FIVE_MINUTES,
    pwa: FIVE_MINUTES,
  }
}

function successfulFetch({ token = null } = {}) {
  const targets = healthCollectorTargets({ githubRepository: REPOSITORY, revision: SHA })
  const fetchImpl = mockFetch({
    [targets.production]: response(targets.production),
    [targets.buildInfo]: jsonResponse(targets.buildInfo, buildInfo()),
    [targets.githubChecksApi]: (init) => {
      if (token) assert.equal(init.headers.authorization, `Bearer ${token}`)
      else assert.equal(Object.hasOwn(init.headers, 'authorization'), false)
      return jsonResponse(targets.githubChecksApi, checksPayload())
    },
  })
  return { fetchImpl, targets }
}

async function collect(fetchImpl, overrides = {}) {
  return collectHealthSnapshot({
    fetchImpl,
    nowMs: NOW,
    timeoutMs: 50,
    expectedRevision: SHA,
    githubRepository: REPOSITORY,
    requiredChecks: ['Validate GARBA', 'PGA security validate'],
    freshnessBudgets: freshnessBudgets(),
    observations: healthyOperationalObservations(),
    ...overrides,
  })
}

function subsystem(snapshot, name) {
  return snapshot.subsystems.find((item) => item.name === name)
}

test('successful bounded collection composes the canonical eight-subsystem Health snapshot', async () => {
  const { fetchImpl, targets } = successfulFetch()
  const snapshot = await collect(fetchImpl)

  assert.equal(snapshot.schemaVersion, 'pga-health-snapshot/v1')
  assert.equal(snapshot.status, 'healthy')
  assert.equal(snapshot.subsystems.length, 8)
  assert.deepEqual(snapshot.subsystems.map((item) => item.name), [
    'production', 'playback', 'deployment', 'ci', 'catalogue', 'telemetry', 'rollups', 'pwa',
  ])
  assert.equal(subsystem(snapshot, 'production').status, 'healthy')
  assert.equal(subsystem(snapshot, 'deployment').status, 'healthy')
  assert.equal(subsystem(snapshot, 'ci').status, 'healthy')
  assert.equal(fetchImpl.calls.length, 3)
  assert.deepEqual(fetchImpl.calls.map((call) => call.url), [targets.production, targets.buildInfo, targets.githubChecksApi])
  assert.equal(fetchImpl.calls.every((call) => call.init.redirect === 'manual'), true)
  assert.equal(fetchImpl.calls.every((call) => call.init.cache === 'no-store'), true)
})

test('production network failure stays a bounded critical failure without erasing other sources', async () => {
  const { fetchImpl: baseFetch, targets } = successfulFetch()
  const fetchImpl = mockFetch({
    [targets.production]: new Error('RAW_NETWORK_SECRET'),
    [targets.buildInfo]: jsonResponse(targets.buildInfo, buildInfo()),
    [targets.githubChecksApi]: jsonResponse(targets.githubChecksApi, checksPayload()),
  })

  const snapshot = await collect(fetchImpl)
  const serialized = JSON.stringify(snapshot)

  assert.equal(snapshot.status, 'failed')
  assert.equal(subsystem(snapshot, 'production').status, 'failed')
  assert.equal(subsystem(snapshot, 'deployment').status, 'healthy')
  assert.equal(subsystem(snapshot, 'ci').status, 'healthy')
  assert.match(serialized, /network_error/)
  assert.doesNotMatch(serialized, /RAW_NETWORK_SECRET/)
  assert.equal(baseFetch.calls.length, 0)
})

test('production timeout is reported as timeout without raw exception disclosure', async () => {
  const targets = healthCollectorTargets({ githubRepository: REPOSITORY, revision: SHA })
  const fetchImpl = mockFetch({
    [targets.production]: (init) => new Promise((resolve, reject) => {
      init.signal.addEventListener('abort', () => reject(new Error('RAW_TIMEOUT_SECRET')), { once: true })
    }),
    [targets.buildInfo]: jsonResponse(targets.buildInfo, buildInfo()),
    [targets.githubChecksApi]: jsonResponse(targets.githubChecksApi, checksPayload()),
  })

  const snapshot = await collect(fetchImpl, { timeoutMs: 2 })
  const serialized = JSON.stringify(snapshot)

  assert.equal(subsystem(snapshot, 'production').status, 'failed')
  assert.match(serialized, /timeout/)
  assert.doesNotMatch(serialized, /RAW_TIMEOUT_SECRET/)
})

test('environment-string timeout normalization remains supported and bounded', async () => {
  const targets = healthCollectorTargets({ githubRepository: REPOSITORY, revision: SHA })
  const fetchImpl = mockFetch({
    [targets.production]: response(targets.production),
    [targets.buildInfo]: jsonResponse(targets.buildInfo, buildInfo()),
    [targets.githubChecksApi]: jsonResponse(targets.githubChecksApi, checksPayload()),
  })

  const snapshot = await collect(fetchImpl, { timeoutMs: '50' })
  assert.equal(snapshot.status, 'healthy')
  assert.equal(fetchImpl.calls.length, 3)
})

test('a response that stalls after headers is still bounded by the acquisition timeout', async () => {
  const targets = healthCollectorTargets({ githubRepository: REPOSITORY, revision: SHA })
  const fetchImpl = mockFetch({
    [targets.production]: response(targets.production),
    [targets.buildInfo]: (init) => stalledResponse(targets.buildInfo, init.signal),
    [targets.githubChecksApi]: jsonResponse(targets.githubChecksApi, checksPayload()),
  })

  const snapshot = await collect(fetchImpl, { timeoutMs: 2 })
  const serialized = JSON.stringify(snapshot)

  assert.equal(subsystem(snapshot, 'production').status, 'healthy')
  assert.equal(subsystem(snapshot, 'deployment').status, 'unknown')
  assert.equal(subsystem(snapshot, 'ci').status, 'healthy')
  assert.doesNotMatch(serialized, /RAW_SLOW_BODY_SECRET/)
})

test('HTTP production failure is explicit while deployment and CI remain independently usable', async () => {
  const targets = healthCollectorTargets({ githubRepository: REPOSITORY, revision: SHA })
  const fetchImpl = mockFetch({
    [targets.production]: response(targets.production, { status: 503 }),
    [targets.buildInfo]: jsonResponse(targets.buildInfo, buildInfo()),
    [targets.githubChecksApi]: jsonResponse(targets.githubChecksApi, checksPayload()),
  })

  const snapshot = await collect(fetchImpl)
  const production = subsystem(snapshot, 'production')

  assert.equal(production.status, 'failed')
  assert.equal(production.details.statusCode, 503)
  assert.match(JSON.stringify(production), /http_503/)
  assert.equal(subsystem(snapshot, 'deployment').status, 'healthy')
  assert.equal(subsystem(snapshot, 'ci').status, 'healthy')
})

test('off-origin production and build responses are rejected and evil URL never enters the snapshot', async () => {
  const targets = healthCollectorTargets({ githubRepository: REPOSITORY, revision: SHA })
  const fetchImpl = mockFetch({
    [targets.production]: response('https://evil.example/'),
    [targets.buildInfo]: jsonResponse('https://evil.example/build-info.json', buildInfo()),
    [targets.githubChecksApi]: jsonResponse(targets.githubChecksApi, checksPayload()),
  })

  const snapshot = await collect(fetchImpl)
  const serialized = JSON.stringify(snapshot)

  assert.equal(subsystem(snapshot, 'production').status, 'failed')
  assert.equal(subsystem(snapshot, 'deployment').status, 'unknown')
  assert.match(serialized, /off_origin/)
  assert.doesNotMatch(serialized, /evil\.example/)
})

test('malformed build JSON fails closed without echoing the raw response', async () => {
  const targets = healthCollectorTargets({ githubRepository: REPOSITORY, revision: SHA })
  const fetchImpl = mockFetch({
    [targets.production]: response(targets.production),
    [targets.buildInfo]: response(targets.buildInfo, { body: '{"secret":"RAW_BUILD_SECRET"' }),
    [targets.githubChecksApi]: jsonResponse(targets.githubChecksApi, checksPayload()),
  })

  const snapshot = await collect(fetchImpl)
  const serialized = JSON.stringify(snapshot)

  assert.equal(subsystem(snapshot, 'deployment').status, 'unknown')
  assert.doesNotMatch(serialized, /RAW_BUILD_SECRET/)
})

test('oversized build body is rejected before parsing', async () => {
  const targets = healthCollectorTargets({ githubRepository: REPOSITORY, revision: SHA })
  const fetchImpl = mockFetch({
    [targets.production]: response(targets.production),
    [targets.buildInfo]: response(targets.buildInfo, {
      body: '{"deployment":{}}',
      headers: { 'content-length': HEALTH_COLLECTOR_LIMITS.buildInfoMaxBytes + 1 },
    }),
    [targets.githubChecksApi]: jsonResponse(targets.githubChecksApi, checksPayload()),
  })

  const snapshot = await collect(fetchImpl)
  assert.equal(subsystem(snapshot, 'deployment').status, 'unknown')
})

test('missing CI configuration performs no GitHub request and leaves CI unknown', async () => {
  const targets = healthCollectorTargets({ githubRepository: REPOSITORY, revision: SHA })
  const fetchImpl = mockFetch({
    [targets.production]: response(targets.production),
    [targets.buildInfo]: jsonResponse(targets.buildInfo, buildInfo()),
  })

  const snapshot = await collect(fetchImpl, { requiredChecks: [] })

  assert.equal(fetchImpl.calls.length, 2)
  assert.equal(subsystem(snapshot, 'ci').status, 'unknown')
  assert.match(subsystem(snapshot, 'ci').reasons.join(' '), /required check/i)
})

test('invalid GitHub repository cannot create an arbitrary fetch target', async () => {
  const targets = healthCollectorTargets({ githubRepository: REPOSITORY, revision: SHA })
  const fetchImpl = mockFetch({
    [targets.production]: response(targets.production),
    [targets.buildInfo]: jsonResponse(targets.buildInfo, buildInfo()),
  })

  const snapshot = await collect(fetchImpl, { githubRepository: 'https://evil.example/repo' })

  assert.equal(fetchImpl.calls.length, 2)
  assert.equal(subsystem(snapshot, 'ci').status, 'unknown')
  assert.equal(healthCollectorTargets({ githubRepository: 'https://evil.example/repo', revision: SHA }).githubChecksApi, null)
})

test('GitHub token is outbound-only and raw check payload fields are not returned', async () => {
  const token = 'ghp_SUPER_SECRET_COLLECTOR_TOKEN'
  const { fetchImpl } = successfulFetch({ token })
  const snapshot = await collect(fetchImpl, { githubToken: token })
  const serialized = JSON.stringify(snapshot)

  assert.equal(subsystem(snapshot, 'ci').status, 'healthy')
  assert.doesNotMatch(serialized, /SUPER_SECRET_COLLECTOR_TOKEN/)
  assert.doesNotMatch(serialized, /RAW_GITHUB_BODY_SECRET|DO_NOT_COPY_RAW_CHECK_OUTPUT/)
  assert.doesNotMatch(serialized, /token=drop-me/)
})

test('collector preserves only explicit positive safe-integer GitHub check-run IDs', async () => {
  const targets = healthCollectorTargets({ githubRepository: REPOSITORY, revision: SHA })
  const invalidIds = [
    '999',
    '',
    true,
    false,
    null,
    0,
    -1,
    1.5,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    Number.NEGATIVE_INFINITY,
    Number.MAX_SAFE_INTEGER + 1,
    {},
    [],
  ]

  for (const id of invalidIds) {
    const payload = checksPayload()
    payload.check_runs[0].id = id
    const fetchImpl = mockFetch({
      [targets.production]: response(targets.production),
      [targets.buildInfo]: jsonResponse(targets.buildInfo, buildInfo()),
      [targets.githubChecksApi]: jsonResponse(targets.githubChecksApi, payload),
    })

    const snapshot = await collect(fetchImpl)
    const ci = subsystem(snapshot, 'ci')
    const check = ci.details.checks.find((item) => item.name === 'Validate GARBA')
    assert.equal(ci.status, 'healthy', `malformed ID must not alter CI state for ${String(id)}`)
    assert.equal(check.id, null, `collector must omit malformed check-run ID ${String(id)}`)
    assert.equal(check.status, 'completed')
    assert.equal(check.conclusion, 'success')
  }

  const payload = checksPayload()
  payload.check_runs[0].id = 42
  const fetchImpl = mockFetch({
    [targets.production]: response(targets.production),
    [targets.buildInfo]: jsonResponse(targets.buildInfo, buildInfo()),
    [targets.githubChecksApi]: jsonResponse(targets.githubChecksApi, payload),
  })
  const snapshot = await collect(fetchImpl)
  const check = subsystem(snapshot, 'ci').details.checks.find((item) => item.name === 'Validate GARBA')
  assert.equal(check.id, 42, 'valid positive safe-integer GitHub ID must survive collection unchanged')
})

test('malformed high GitHub check-run IDs cannot win equal-timestamp CI selection', async () => {
  const targets = healthCollectorTargets({ githubRepository: REPOSITORY, revision: SHA })
  const completedAt = new Date(NOW - 5_000).toISOString()
  const payload = checksPayload()
  payload.check_runs = [
    {
      id: '999',
      name: 'Validate GARBA',
      status: 'completed',
      conclusion: 'failure',
      completed_at: completedAt,
      details_url: 'https://github.com/ruddvz/garba/actions/runs/malformed',
    },
    {
      id: 11,
      name: 'Validate GARBA',
      status: 'completed',
      conclusion: 'success',
      completed_at: completedAt,
      details_url: 'https://github.com/ruddvz/garba/actions/runs/11',
    },
    {
      id: 12,
      name: 'PGA security validate',
      status: 'completed',
      conclusion: 'success',
      completed_at: completedAt,
      details_url: 'https://github.com/ruddvz/garba/actions/runs/12',
    },
  ]

  const fetchImpl = mockFetch({
    [targets.production]: response(targets.production),
    [targets.buildInfo]: jsonResponse(targets.buildInfo, buildInfo()),
    [targets.githubChecksApi]: jsonResponse(targets.githubChecksApi, payload),
  })
  const snapshot = await collect(fetchImpl)
  const ci = subsystem(snapshot, 'ci')
  const selected = ci.details.checks.find((item) => item.name === 'Validate GARBA')

  assert.equal(ci.status, 'healthy')
  assert.equal(selected.id, 11)
  assert.equal(selected.conclusion, 'success')
})

test('caller-supplied operational observations are adapted rather than echoed raw', async () => {
  const { fetchImpl } = successfulFetch()
  const snapshot = await collect(fetchImpl)
  const serialized = JSON.stringify(snapshot)

  assert.doesNotMatch(serialized, /DO_NOT_ECHO_PLAYBACK_SECRET/)
  assert.doesNotMatch(serialized, /DO_NOT_ECHO_CATALOGUE_SECRET/)
  assert.doesNotMatch(serialized, /DO_NOT_ECHO_EVENT/)
  assert.doesNotMatch(serialized, /DO_NOT_ECHO_PWA_SECRET/)
  assert.equal(subsystem(snapshot, 'catalogue').details.errors, 0)
})

test('one failed acquisition does not suppress healthy evidence from other subsystems', async () => {
  const targets = healthCollectorTargets({ githubRepository: REPOSITORY, revision: SHA })
  const fetchImpl = mockFetch({
    [targets.production]: response(targets.production),
    [targets.buildInfo]: new Error('BUILD_FETCH_SECRET'),
    [targets.githubChecksApi]: jsonResponse(targets.githubChecksApi, checksPayload()),
  })

  const snapshot = await collect(fetchImpl)

  assert.equal(subsystem(snapshot, 'production').status, 'healthy')
  assert.equal(subsystem(snapshot, 'deployment').status, 'unknown')
  assert.equal(subsystem(snapshot, 'ci').status, 'healthy')
  assert.equal(subsystem(snapshot, 'playback').status, 'healthy')
  assert.equal(subsystem(snapshot, 'catalogue').status, 'healthy')
})

test('collector freshness budgets accept only finite numbers while preserving numeric zero', async () => {
  const { fetchImpl: zeroFetch } = successfulFetch()
  const zeroSnapshot = await collect(zeroFetch, {
    freshnessBudgets: { playback: 0 },
  })
  assert.equal(subsystem(zeroSnapshot, 'playback').freshnessBudgetMs, 0)
  assert.equal(subsystem(zeroSnapshot, 'playback').status, 'stale')

  for (const value of ['0', '', false, true, null, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
    const { fetchImpl } = successfulFetch()
    const snapshot = await collect(fetchImpl, {
      freshnessBudgets: { playback: value },
    })
    const playback = subsystem(snapshot, 'playback')
    assert.equal(playback.freshnessBudgetMs, null, `freshness budget must reject ${String(value)}`)
    assert.equal(playback.status, 'healthy', `invalid budget must not manufacture stale status for ${String(value)}`)
  }
})

test('collector targets are fixed to canonical production and validated GitHub hosts', () => {
  const targets = healthCollectorTargets({ githubRepository: REPOSITORY, revision: SHA })

  assert.equal(targets.production, 'https://playgarba.com/')
  assert.equal(targets.buildInfo, 'https://playgarba.com/build-info.json')
  assert.equal(targets.githubChecksApi, `https://api.github.com/repos/ruddvz/garba/commits/${SHA}/check-runs?per_page=100`)
  assert.equal(targets.githubChecksWeb, `https://github.com/ruddvz/garba/commit/${SHA}/checks`)
  assert.equal(healthCollectorTargets({ githubRepository: REPOSITORY, revision: 'short' }).githubChecksApi, null)
})

test('invalid fetch dependency and coercible or non-finite clocks fail before evidence is fabricated', async () => {
  await assert.rejects(
    collectHealthSnapshot({ fetchImpl: null, nowMs: NOW }),
    /health_collector_fetch_required/,
  )

  const fetchImpl = mockFetch({})
  for (const nowMs of ['0', '', false, true, null, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
    await assert.rejects(
      collectHealthSnapshot({ fetchImpl, nowMs }),
      /invalid_health_collector_time/,
      `nowMs ${String(nowMs)} must fail closed`,
    )
  }
  assert.equal(fetchImpl.calls.length, 0, 'invalid clocks must fail before any network request')
})

test('numeric epoch zero remains a valid collector evaluation clock', async () => {
  const { fetchImpl } = successfulFetch()
  const snapshot = await collect(fetchImpl, {
    nowMs: 0,
    freshnessBudgets: {},
    observations: {},
  })
  assert.equal(snapshot.evaluatedAt, 0)
})
