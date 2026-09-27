import test from 'node:test'
import assert from 'node:assert/strict'
import { webcrypto } from 'node:crypto'

if (!globalThis.crypto) globalThis.crypto = webcrypto

import { handleAdmin } from '../admin-worker.js'
import { resetJwksCacheForTests } from '../lib/crypto.js'

const NOW = Date.parse('2026-09-10T12:00:00Z')
const TEAM_DOMAIN = 'https://example.cloudflareaccess.com'
const POLICY_AUD = 'pga-aud'

function base64url(value) {
  return Buffer.from(value).toString('base64url')
}

async function createAccessFixture(path = '/api/live') {
  resetJwksCacheForTests()
  const pair = await crypto.subtle.generateKey(
    { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
    true,
    ['sign', 'verify'],
  )
  const publicJwk = await crypto.subtle.exportKey('jwk', pair.publicKey)
  publicJwk.kid = 'admin-numeric-truth-test-key'
  publicJwk.alg = 'RS256'

  const header = base64url(JSON.stringify({ alg: 'RS256', kid: publicJwk.kid, typ: 'JWT' }))
  const payload = base64url(JSON.stringify({
    iss: TEAM_DOMAIN,
    aud: [POLICY_AUD],
    exp: Math.floor(NOW / 1000) + 600,
    iat: Math.floor(NOW / 1000),
    sub: 'founder',
    type: 'app',
  }))
  const input = new TextEncoder().encode(`${header}.${payload}`)
  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', pair.privateKey, input)
  const token = `${header}.${payload}.${Buffer.from(signature).toString('base64url')}`

  return {
    request: new Request(`https://pga.playgarba.com${path}`, {
      headers: { 'cf-access-jwt-assertion': token },
    }),
    env: { TEAM_DOMAIN, POLICY_AUD },
    fetchImpl: async () => Response.json({ keys: [publicJwk] }),
  }
}

function liveQuery({ summary, breakdown = [], trend = [] }) {
  return async (_env, sql) => {
    if (sql.includes('AS live_now')) return [summary]
    if (sql.includes('GROUP BY surface, world, display_mode')) return breakdown
    if (sql.includes('AS active_sessions')) return trend
    throw new Error('unexpected_live_query')
  }
}

async function readLive(fixture, queryAnalytics) {
  const response = await handleAdmin(fixture.request, fixture.env, {
    nowMs: NOW,
    fetchImpl: fixture.fetchImpl,
    queryAnalytics,
  })
  return { response, body: await response.json() }
}

const validSummary = () => ({
  live_now: 0,
  listening_now: 0,
  browsing_now: 0,
  data_through_ms: 0,
  max_sample_interval: 1,
})

test('protected Live preserves explicit numeric zero and positive aggregate evidence', async () => {
  const fixture = await createAccessFixture()
  const { response, body } = await readLive(fixture, liveQuery({
    summary: {
      live_now: 4,
      listening_now: 0,
      browsing_now: 4,
      data_through_ms: NOW,
      max_sample_interval: 1,
    },
  }))

  assert.equal(response.status, 200)
  assert.equal(response.headers.get('cache-control'), 'no-store')
  assert.equal(body.status, 'complete')
  assert.equal(body.data.liveNow.value, 4)
  assert.equal(body.data.listeningNow.value, 0)
  assert.equal(body.data.browsingNow.value, 4)
  assert.equal(body.dataThrough, new Date(NOW).toISOString())
})

test('protected Live rejects coercible, missing and non-finite aggregate metrics instead of fabricating zero or one', async () => {
  const fixture = await createAccessFixture()
  const invalidValues = ['0', '', true, false, null, undefined, NaN, Infinity, -Infinity]

  for (const value of invalidValues) {
    const summary = { ...validSummary(), live_now: value }
    const { response, body } = await readLive(fixture, liveQuery({ summary }))
    assert.equal(response.status, 503, `expected 503 for ${String(value)}`)
    assert.equal(body.status, 'unavailable')
    assert.equal(body.error, 'query_unavailable')
    assert.equal(body.data, undefined)
  }
})

test('protected Live rejects malformed explicit freshness evidence while preserving numeric zero freshness', async () => {
  const fixture = await createAccessFixture()

  const zero = await readLive(fixture, liveQuery({ summary: validSummary() }))
  assert.equal(zero.response.status, 200)
  assert.equal(zero.body.dataThrough, null)

  const invalidValues = ['0', '', true, false, NaN, Infinity, -Infinity, -1, 8_640_000_000_000_001]
  for (const value of invalidValues) {
    const summary = { ...validSummary(), data_through_ms: value }
    const { response, body } = await readLive(fixture, liveQuery({ summary }))
    assert.equal(response.status, 503, `expected 503 for freshness ${String(value)}`)
    assert.equal(body.status, 'unavailable')
    assert.equal(body.error, 'query_unavailable')
  }
})

test('privacy threshold calculations reject coerced sessions and sample intervals', async () => {
  const fixture = await createAccessFixture()
  const invalidRows = [
    { surface: 'player', world: 'traditional', display_mode: 'browser', sessions: '3', listening_sessions: 1, browsing_sessions: 2, data_through_ms: NOW, max_sample_interval: 1 },
    { surface: 'player', world: 'traditional', display_mode: 'browser', sessions: 3, listening_sessions: 1, browsing_sessions: 2, data_through_ms: NOW, max_sample_interval: '1' },
  ]

  for (const row of invalidRows) {
    const { response, body } = await readLive(fixture, liveQuery({ summary: { ...validSummary(), data_through_ms: NOW }, breakdown: [row] }))
    assert.equal(response.status, 503)
    assert.equal(body.status, 'unavailable')
    assert.equal(body.error, 'query_unavailable')
  }
})

test('Live trend rejects coerced minute buckets instead of publishing a fabricated timestamp', async () => {
  const fixture = await createAccessFixture()
  const trend = [{
    minute_bucket: String(Math.floor(NOW / 1000)),
    active_sessions: 1,
    listening_sessions: 1,
    browsing_sessions: 0,
    data_through_ms: NOW,
    max_sample_interval: 1,
  }]
  const { response, body } = await readLive(fixture, liveQuery({ summary: { ...validSummary(), data_through_ms: NOW }, trend }))

  assert.equal(response.status, 503)
  assert.equal(body.status, 'unavailable')
  assert.equal(body.error, 'query_unavailable')
})
