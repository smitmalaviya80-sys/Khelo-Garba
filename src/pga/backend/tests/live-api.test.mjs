import test from 'node:test'
import assert from 'node:assert/strict'
import { webcrypto } from 'node:crypto'

if (!globalThis.crypto) globalThis.crypto = webcrypto

import { handleAdmin } from '../admin-worker.js'
import { resetJwksCacheForTests } from '../lib/crypto.js'

const NOW = Date.parse('2026-09-10T06:30:00Z')
const MINUTE_BUCKET = Math.floor(NOW / 60_000) * 60

const DEFAULT_BREAKDOWN_ROWS = [
  {
    surface: 'player',
    world: 'traditional',
    display_mode: 'standalone',
    sessions: 5,
    listening_sessions: 4,
    browsing_sessions: 1,
    data_through_ms: NOW - 1_000,
    max_sample_interval: 1,
  },
  {
    surface: 'explore',
    world: 'folk',
    display_mode: 'browser',
    sessions: 2,
    listening_sessions: 1,
    browsing_sessions: 1,
    data_through_ms: NOW - 2_000,
    max_sample_interval: 1,
  },
]

function base64url(value) {
  return Buffer.from(value).toString('base64url')
}

async function accessFixture(path = '/api/live') {
  resetJwksCacheForTests()
  const pair = await crypto.subtle.generateKey(
    { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
    true,
    ['sign', 'verify'],
  )
  const publicJwk = await crypto.subtle.exportKey('jwk', pair.publicKey)
  publicJwk.kid = 'live-api-test-key'
  publicJwk.alg = 'RS256'

  const teamDomain = 'https://example.cloudflareaccess.com'
  const header = base64url(JSON.stringify({ alg: 'RS256', kid: publicJwk.kid, typ: 'JWT' }))
  const payload = base64url(JSON.stringify({
    iss: teamDomain,
    aud: ['pga-aud'],
    exp: Math.floor(NOW / 1000) + 600,
    iat: Math.floor(NOW / 1000),
    sub: 'founder',
    type: 'app',
  }))
  const data = new TextEncoder().encode(`${header}.${payload}`)
  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', pair.privateKey, data)
  const token = `${header}.${payload}.${Buffer.from(signature).toString('base64url')}`

  return {
    request: new Request(`https://pga.playgarba.com${path}`, {
      headers: { 'cf-access-jwt-assertion': token },
    }),
    env: { TEAM_DOMAIN: teamDomain, POLICY_AUD: 'pga-aud' },
    fetchImpl: async () => Response.json({ keys: [publicJwk] }),
  }
}

function queryFixture({ fail = null, breakdownRows = null } = {}) {
  return async (_env, sql) => {
    if (sql.includes('GROUP BY surface, world, display_mode')) {
      if (fail === 'breakdown') throw new Error('breakdown_failed')
      return breakdownRows ?? DEFAULT_BREAKDOWN_ROWS
    }

    if (sql.includes('GROUP BY minute_bucket')) {
      if (fail === 'trend') throw new Error('trend_failed')
      return [{
        minute_bucket: MINUTE_BUCKET,
        active_sessions: 7,
        listening_sessions: 5,
        browsing_sessions: 2,
        data_through_ms: NOW,
        max_sample_interval: 4,
      }]
    }

    if (fail === 'summary') throw new Error('summary_failed')
    return [{
      live_now: 7,
      listening_now: 5,
      browsing_now: 2,
      data_through_ms: NOW - 500,
      max_sample_interval: 2,
    }]
  }
}

test('protected Live API exposes truthful totals, privacy-safe breakdowns and bounded trend metadata', async () => {
  const fixture = await accessFixture()
  const response = await handleAdmin(fixture.request, fixture.env, {
    nowMs: NOW,
    fetchImpl: fixture.fetchImpl,
    queryAnalytics: queryFixture(),
  })

  assert.equal(response.status, 200)
  assert.equal(response.headers.get('cache-control'), 'no-store')

  const body = await response.json()
  assert.equal(body.status, 'complete')
  assert.equal(body.dataThrough, new Date(NOW).toISOString())
  assert.deepEqual(body.data.liveNow, { value: 7, precision: 'estimated', sampled: true })
  assert.deepEqual(body.data.listeningNow, { value: 5, precision: 'estimated', sampled: true })
  assert.deepEqual(body.data.browsingNow, { value: 2, precision: 'estimated', sampled: true })
  assert.equal(body.data.expirySeconds, 120)
  assert.equal(body.data.trendMinutes, 30)

  assert.equal(body.data.breakdowns.length, 1, 'breakdown rows below the privacy threshold must be suppressed')
  assert.deepEqual(body.data.breakdowns[0], {
    surface: 'player',
    world: 'traditional',
    displayMode: 'standalone',
    sessions: { value: 5, precision: 'exact', sampled: false },
    listeningSessions: { value: 4, precision: 'exact', sampled: false },
    browsingSessions: { value: 1, precision: 'exact', sampled: false },
  })

  assert.deepEqual(body.data.trend, [{
    minute: new Date(MINUTE_BUCKET * 1000).toISOString(),
    activeSessions: { value: 7, precision: 'estimated', sampled: true },
    listeningSessions: { value: 5, precision: 'estimated', sampled: true },
    browsingSessions: { value: 2, precision: 'estimated', sampled: true },
  }])

  assert.deepEqual(body.sources, [
    { name: 'analytics-engine-live', status: 'complete', sampled: true },
    { name: 'analytics-engine-live-breakdown', status: 'complete', sampled: false },
    { name: 'analytics-engine-live-trend', status: 'complete', sampled: true },
  ])
})

test('Live API privacy threshold uses a conservative observed-session floor under sampling', async () => {
  const fixture = await accessFixture()
  const breakdownRows = [
    {
      surface: 'sampled-one', world: 'traditional', display_mode: 'standalone',
      sessions: 4, listening_sessions: 4, browsing_sessions: 0,
      data_through_ms: NOW - 1_000, max_sample_interval: 4,
    },
    {
      surface: 'sampled-two', world: 'folk', display_mode: 'browser',
      sessions: 8, listening_sessions: 4, browsing_sessions: 4,
      data_through_ms: NOW - 1_000, max_sample_interval: 4,
    },
    {
      surface: 'sampled-three', world: 'dandiya', display_mode: 'standalone',
      sessions: 9, listening_sessions: 5, browsing_sessions: 4,
      data_through_ms: NOW - 1_000, max_sample_interval: 4,
    },
    {
      surface: 'unsampled-two', world: 'sanedo', display_mode: 'browser',
      sessions: 2, listening_sessions: 1, browsing_sessions: 1,
      data_through_ms: NOW - 1_000, max_sample_interval: 1,
    },
    {
      surface: 'unsampled-three', world: 'fusion', display_mode: 'browser',
      sessions: 3, listening_sessions: 2, browsing_sessions: 1,
      data_through_ms: NOW - 1_000, max_sample_interval: 1,
    },
    {
      surface: 'missing-sampling-metadata', world: 'devotional', display_mode: 'browser',
      sessions: 50, listening_sessions: 25, browsing_sessions: 25,
      data_through_ms: NOW - 1_000,
    },
  ]

  const response = await handleAdmin(fixture.request, fixture.env, {
    nowMs: NOW,
    fetchImpl: fixture.fetchImpl,
    queryAnalytics: queryFixture({ breakdownRows }),
  })

  assert.equal(response.status, 200)
  const body = await response.json()
  assert.deepEqual(body.data.breakdowns.map((row) => row.surface), ['sampled-three', 'unsampled-three'])
  assert.deepEqual(body.data.breakdowns[0], {
    surface: 'sampled-three',
    world: 'dandiya',
    displayMode: 'standalone',
    sessions: { value: 9, precision: 'estimated', sampled: true },
    listeningSessions: { value: 5, precision: 'estimated', sampled: true },
    browsingSessions: { value: 4, precision: 'estimated', sampled: true },
  })
  assert.deepEqual(Object.keys(body.data.breakdowns[1]).sort(), [
    'browsingSessions', 'displayMode', 'listeningSessions', 'sessions', 'surface', 'world',
  ])
  assert.equal(JSON.stringify(body.data.breakdowns).includes('session_key'), false)
})

test('Live API preserves valid headline data and reports partial when the trend source fails', async () => {
  const fixture = await accessFixture()
  const response = await handleAdmin(fixture.request, fixture.env, {
    nowMs: NOW,
    fetchImpl: fixture.fetchImpl,
    queryAnalytics: queryFixture({ fail: 'trend' }),
  })

  assert.equal(response.status, 200)
  const body = await response.json()
  assert.equal(body.status, 'partial')
  assert.equal(body.data.liveNow.value, 7)
  assert.equal(body.data.breakdowns.length, 1)
  assert.equal(body.data.trend, null)
  assert.deepEqual(body.sources[2], {
    name: 'analytics-engine-live-trend',
    status: 'unavailable',
    sampled: null,
  })
})

test('Live API reports partial when the breakdown source fails without inventing an empty breakdown', async () => {
  const fixture = await accessFixture()
  const response = await handleAdmin(fixture.request, fixture.env, {
    nowMs: NOW,
    fetchImpl: fixture.fetchImpl,
    queryAnalytics: queryFixture({ fail: 'breakdown' }),
  })

  assert.equal(response.status, 200)
  const body = await response.json()
  assert.equal(body.status, 'partial')
  assert.equal(body.data.liveNow.value, 7)
  assert.equal(body.data.breakdowns, null)
  assert.equal(body.data.trend.length, 1)
})

test('Live API fails closed when the headline live query is unavailable', async () => {
  const fixture = await accessFixture()
  const response = await handleAdmin(fixture.request, fixture.env, {
    nowMs: NOW,
    fetchImpl: fixture.fetchImpl,
    queryAnalytics: queryFixture({ fail: 'summary' }),
  })

  assert.equal(response.status, 503)
  const body = await response.json()
  assert.equal(body.status, 'unavailable')
  assert.equal(body.data, null)
  assert.equal(body.sources[0].name, 'analytics-engine-live')
  assert.equal(body.sources[0].status, 'unavailable')
})
