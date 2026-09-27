import test from 'node:test'
import assert from 'node:assert/strict'
import { webcrypto } from 'node:crypto'

if (!globalThis.crypto) globalThis.crypto = webcrypto

import {
  audienceSql,
  eventDataPoint,
  homeWindowSql,
  liveBreakdownSql,
  liveSql,
  listeningTimeSql,
  normaliseForStorage,
  presenceDataPoint,
  precisionFromRows,
} from '../lib/analytics.js'
import { resetJwksCacheForTests, hmacPseudonym, verifyAccessJwt } from '../lib/crypto.js'
import { replaceDailyMetrics } from '../lib/d1.js'
import { searchDemandSql } from '../lib/search-analytics.js'
import { istDateKey, istDayBounds, previousClosedIstDate, shiftIstDate } from '../lib/time.js'
import { normalizeEdgeDimensions, sanitizeSearchTerm, validateBatch, validateEvent } from '../lib/validation.js'
import { MAX_BODY_BYTES } from '../lib/constants.js'
import { handleIngest } from '../ingest-worker.js'
import { handleAdmin } from '../admin-worker.js'
import { rollupDay } from '../rollup-worker.js'

const NOW = Date.parse('2026-09-09T20:00:00Z')

function baseEvent(overrides = {}) {
  return {
    schema_version: 1,
    event_name: 'session_started',
    event_id: 'event-1',
    occurred_at: NOW,
    browser_id: 'browser-1',
    session_id: 'session-1',
    tab_id: 'tab-1',
    surface: 'player',
    display_mode: 'browser',
    entry_point: 'player',
    ...overrides,
  }
}

function base64url(value) {
  return Buffer.from(value).toString('base64url')
}

async function accessFixture(path = '/api/live', payloadOverrides = {}) {
  resetJwksCacheForTests()
  const pair = await crypto.subtle.generateKey(
    { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
    true,
    ['sign', 'verify'],
  )
  const publicJwk = await crypto.subtle.exportKey('jwk', pair.publicKey)
  publicJwk.kid = 'test-key'
  publicJwk.alg = 'RS256'
  const teamDomain = 'https://example.cloudflareaccess.com'
  const header = base64url(JSON.stringify({ alg: 'RS256', kid: 'test-key', typ: 'JWT' }))
  const payload = base64url(JSON.stringify({
    iss: teamDomain,
    aud: ['pga-aud'],
    exp: Math.floor(NOW / 1000) + 600,
    iat: Math.floor(NOW / 1000),
    sub: 'founder',
    type: 'app',
    ...payloadOverrides,
  }))
  const data = new TextEncoder().encode(`${header}.${payload}`)
  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', pair.privateKey, data)
  const token = `${header}.${payload}.${Buffer.from(signature).toString('base64url')}`
  const request = new Request(`https://pga.playgarba.com${path}`, {
    headers: { 'cf-access-jwt-assertion': token },
  })
  const env = { TEAM_DOMAIN: teamDomain, POLICY_AUD: 'pga-aud' }
  const fetchImpl = async () => Response.json({ keys: [publicJwk] })
  return { request, env, fetchImpl }
}

class FakeStatement {
  constructor(db, sql) {
    this.db = db
    this.sql = sql
    this.args = []
  }
  bind(...args) {
    const statement = new FakeStatement(this.db, this.sql)
    statement.args = args
    return statement
  }
  async run() {
    this.db.runs.push({ sql: this.sql, args: this.args })
    return { success: true }
  }
  async all() {
    this.db.alls.push({ sql: this.sql, args: this.args })
    return { success: true, results: [] }
  }
}

class FakeDb {
  constructor() {
    this.runs = []
    this.alls = []
    this.batches = []
  }
  prepare(sql) {
    return new FakeStatement(this, sql)
  }
  async batch(statements) {
    this.batches.push(statements.map((statement) => ({ sql: statement.sql, args: statement.args })))
    return statements.map(() => ({ success: true }))
  }
}

test('validates a minimal session event', () => {
  const event = validateEvent(baseEvent(), { nowMs: NOW })
  assert.equal(event.eventName, 'session_started')
  assert.equal(event.browserId, 'browser-1')
})

test('rejects unknown event keys', () => {
  assert.throws(() => validateEvent(baseEvent({ secret_extra: 'nope' }), { nowMs: NOW }), /unknown_key/)
})

test('rejects unsupported schema versions', () => {
  assert.throws(() => validateEvent(baseEvent({ schema_version: 99 }), { nowMs: NOW }), /unsupported_schema_version/)
})

test('rejects timestamps outside the bounded skew window', () => {
  assert.throws(() => validateEvent(baseEvent({ occurred_at: NOW - 25 * 60 * 60 * 1000 }), { nowMs: NOW }), /timestamp_out_of_bounds/)
})

test('requires search correlation IDs', () => {
  assert.throws(() => validateEvent(baseEvent({ event_name: 'search_submitted', search_term: 'garba' }), { nowMs: NOW }), /search_id_required/)
})

test('caps presence played time at 60 seconds', () => {
  const event = validateEvent(baseEvent({
    event_name: 'presence_heartbeat',
    playback_state: 'playing',
    played_ms_since_previous_heartbeat: 999999,
  }), { nowMs: NOW })
  assert.equal(event.playedMs, 60_000)
})

test('redacts email, phone and URL-like search input', () => {
  assert.equal(sanitizeSearchTerm('hello@example.com'), '')
  assert.equal(sanitizeSearchTerm('+91 98765 43210'), '')
  assert.equal(sanitizeSearchTerm('https://example.com/me'), '')
  assert.equal(sanitizeSearchTerm('  nonstop   garba  '), 'nonstop garba')
})

test('rejects empty batches', () => {
  assert.throws(() => validateBatch([], { nowMs: NOW }), /invalid_batch_size/)
  assert.throws(() => validateBatch({ events: [] }, { nowMs: NOW }), /invalid_batch_size/)
})

test('rejects mixed-browser batches', () => {
  assert.throws(() => validateBatch([
    baseEvent({ event_id: 'one', browser_id: 'one' }),
    baseEvent({ event_id: 'two', browser_id: 'two' }),
  ], { nowMs: NOW }), /mixed_browser_batch/)
})

test('normalises edge dimensions without retaining raw user agent', () => {
  const request = new Request('https://events.playgarba.com/v1/events', {
    headers: { 'user-agent': 'Mozilla/5.0 (iPhone) Version/18.0 Mobile Safari/605.1.15' },
  })
  const edge = normalizeEdgeDimensions(request)
  assert.equal(edge.device, 'mobile')
  assert.equal(edge.os, 'iOS')
  assert.equal(edge.browser, 'Safari')
  assert.equal('userAgent' in edge, false)
})

test('HMAC pseudonyms are deterministic, scoped and bounded', async () => {
  const a = await hmacPseudonym('secret', 'same', 'browser:')
  const b = await hmacPseudonym('secret', 'same', 'browser:')
  const c = await hmacPseudonym('secret', 'same', 'session:')
  assert.equal(a, b)
  assert.notEqual(a, c)
  assert.match(a, /^[0-9a-f]{32}$/)
  assert.notEqual(a, 'same')
})

test('HMAC pseudonyms handle empty and invalid inputs gracefully', async () => {
  assert.equal(await hmacPseudonym('secret', ''), null)
  assert.equal(await hmacPseudonym('secret', null), null)
  assert.equal(await hmacPseudonym('secret', undefined), null)
  assert.equal(await hmacPseudonym('secret', 123), null)
  assert.equal(await hmacPseudonym('secret', {}), null)

  await assert.rejects(
    async () => hmacPseudonym('', 'value'),
    { message: 'PGA_HMAC_SECRET is required' }
  )
  await assert.rejects(
    async () => hmacPseudonym(null, 'value'),
    { message: 'PGA_HMAC_SECRET is required' }
  )
  await assert.rejects(
    async () => hmacPseudonym(undefined, 'value'),
    { message: 'PGA_HMAC_SECRET is required' }
  )
  await assert.rejects(
    async () => hmacPseudonym(123, 'value'),
    { message: 'PGA_HMAC_SECRET is required' }
  )
})

test('storage data points stay within Analytics Engine field limits', async () => {
  const event = validateEvent(baseEvent(), { nowMs: NOW })
  const stored = await normaliseForStorage(event, { PGA_HMAC_SECRET: 'secret' }, { country: 'IN', region: 'GJ', device: 'mobile', os: 'iOS', browser: 'Safari', bot: false }, NOW)
  const product = eventDataPoint(stored)
  const presence = presenceDataPoint({ ...stored, playbackState: 'playing', playedMs: 45_000 })
  assert.ok(product.blobs.length <= 20)
  assert.ok(product.doubles.length <= 20)
  assert.equal(product.indexes.length, 1)
  assert.ok(presence.blobs.length <= 20)
  assert.equal(presence.indexes.length, 1)
})

test('normaliseForStorage throws when crypto dependency fails', async () => {
  const originalSign = globalThis.crypto.subtle.sign
  try {
    globalThis.crypto.subtle.sign = async () => {
      throw new Error('crypto_transient_failure')
    }
    const event = validateEvent(baseEvent(), { nowMs: NOW })
    const edge = { country: 'IN', region: 'GJ', device: 'mobile', os: 'iOS', browser: 'Safari', bot: false }
    await assert.rejects(
      normaliseForStorage(event, { PGA_HMAC_SECRET: 'secret' }, edge, NOW),
      /crypto_transient_failure/
    )
  } finally {
    globalThis.crypto.subtle.sign = originalSign
  }
})

test('IST day bounds remain fixed regardless of founder timezone', () => {
  const bounds = istDayBounds('2026-09-10')
  assert.equal(new Date(bounds.startUtcMs).toISOString(), '2026-09-09T18:30:00.000Z')
  assert.equal(new Date(bounds.endUtcMs).toISOString(), '2026-09-10T18:30:00.000Z')
  assert.equal(istDateKey(bounds.startUtcMs), '2026-09-10')
})

test('closed-day helpers cross month boundaries correctly', () => {
  assert.equal(shiftIstDate('2026-09-01', -1), '2026-08-31')
  assert.equal(previousClosedIstDate(Date.parse('2026-09-09T20:00:00Z')), '2026-09-09')
})

test('event queries deduplicate retries and weight sampled counts', () => {
  const sql = homeWindowSql('playgarba_events_v1', 1, 2)
  assert.match(sql, /GROUP BY event_id/)
  assert.match(sql, /sample_interval/)
  assert.match(sql, /confirmed_play_starts/)
})

test('audience breakdown counts session starts instead of every event', () => {
  const sql = audienceSql('playgarba_events_v1', '30d')
  assert.match(sql, /event_name = 'session_started'/)
  assert.match(sql, /SUM\(sample_interval\) AS sessions/)
})

test('listening-time SQL caps a session minute at 60 seconds', () => {
  const sql = listeningTimeSql('playgarba_presence_v1', '24h')
  assert.match(sql, /GROUP BY session_key, minute_bucket/)
  assert.match(sql, /raw_played_ms > 60000/)
  assert.match(sql, /GROUP BY event_id/)
})

test('live SQL uses received-time liveness and deterministic same-time session selection', () => {
  for (const sql of [liveSql('playgarba_presence_v1'), liveBreakdownSql('playgarba_presence_v1')]) {
    assert.match(sql, /WITH same_time_sessions AS/)
    assert.match(sql, /argMax\(blob6, blob1\) AS playback_state/)
    assert.match(sql, /GROUP BY session_key, received_at_ms/)
    assert.match(sql, /argMax\(playback_state, received_at_ms\) AS playback_state/)
    assert.match(sql, /GROUP BY session_key/)
    assert.match(sql, /toDateTime\(double3 \/ 1000\) >= NOW\(\) - INTERVAL '120' SECOND/)
    assert.match(sql, /toDateTime\(double3 \/ 1000\) <= NOW\(\)/)
    assert.doesNotMatch(sql, /timestamp > NOW\(\) - INTERVAL '120' SECOND/)
    assert.doesNotMatch(sql, /GROUP BY session_key, tab_key/)
  }
  const sql = liveSql('playgarba_presence_v1')
  assert.match(sql, /playback_state = 'playing'/)
  assert.match(sql, /playback_state != 'playing'/)
})

test('search demand SQL enforces the minimum-volume privacy threshold', () => {
  const sql = searchDemandSql('playgarba_events_v1', '30d')
  assert.match(sql, /HAVING searches >= 3/)
})

test('precision metadata becomes estimated when source rows were sampled', () => {
  assert.deepEqual(precisionFromRows([{ max_sample_interval: 1 }]), { sampled: false, precision: 'exact' })
  assert.deepEqual(precisionFromRows([{ max_sample_interval: 4 }]), { sampled: true, precision: 'estimated' })
})

test('ingestion enforces the maximum body size limit precisely', async () => {
  const env = {
    PGA_HMAC_SECRET: 'server-secret',
    EVENTS: { writeDataPoint() {} },
    PRESENCE: { writeDataPoint() {} },
    BROWSER_RATE_LIMITER: { limit: async () => ({ success: true }) },
  }

  const exactBuffer = new Uint8Array(MAX_BODY_BYTES)
  exactBuffer.fill(32) // spaces, invalid JSON but structurally within limits
  const exactStream = new ReadableStream({
    start(controller) {
      controller.enqueue(exactBuffer)
      controller.close()
    },
  })
  const requestExact = new Request('https://events.playgarba.com/v1/events', {
    method: 'POST',
    headers: { origin: 'https://playgarba.com', 'content-type': 'application/json' },
    body: exactStream,
    duplex: 'half',
  })
  const resExact = await handleIngest(requestExact, env, { nowMs: NOW })
  // 400 because it's invalid JSON (not 413 body too large)
  assert.equal(resExact.status, 400)

  const overBuffer = new Uint8Array(MAX_BODY_BYTES + 1)
  overBuffer.fill(32)
  const overStream = new ReadableStream({
    start(controller) {
      controller.enqueue(overBuffer)
      controller.close()
    },
  })
  const requestOver = new Request('https://events.playgarba.com/v1/events', {
    method: 'POST',
    headers: { origin: 'https://playgarba.com', 'content-type': 'application/json' },
    body: overStream,
    duplex: 'half',
  })
  const resOver = await handleIngest(requestOver, env, { nowMs: NOW })
  // 413 because it exceeds MAX_BODY_BYTES
  assert.equal(resOver.status, 413)
})

test('ingestion rejects foreign origins', async () => {
  const request = new Request('https://events.playgarba.com/v1/events', {
    method: 'POST',
    headers: { origin: 'https://evil.example', 'content-type': 'application/json' },
    body: JSON.stringify([baseEvent()]),
  })
  const response = await handleIngest(request, {})
  assert.equal(response.status, 403)
})

test('ingestion separates product and presence datasets and stores only HMAC browser keys', async () => {
  const eventPoints = []
  const presencePoints = []
  const env = {
    PGA_HMAC_SECRET: 'server-secret',
    EVENTS: { writeDataPoint: (point) => eventPoints.push(point) },
    PRESENCE: { writeDataPoint: (point) => presencePoints.push(point) },
    BROWSER_RATE_LIMITER: { limit: async () => ({ success: true }) },
  }
  const request = new Request('https://events.playgarba.com/v1/events', {
    method: 'POST',
    headers: { origin: 'https://playgarba.com', 'content-type': 'application/json' },
    body: JSON.stringify([
      baseEvent({ event_id: 'product-1' }),
      baseEvent({ event_id: 'presence-1', event_name: 'presence_heartbeat', playback_state: 'playing', played_ms_since_previous_heartbeat: 45_000 }),
    ]),
  })
  const response = await handleIngest(request, env, { nowMs: NOW })
  assert.equal(response.status, 202)
  assert.equal(eventPoints.length, 1)
  assert.equal(presencePoints.length, 1)
  assert.notEqual(eventPoints[0].blobs[2], 'browser-1')
  assert.equal(eventPoints[0].indexes[0], eventPoints[0].blobs[2])
})

test('ingestion fails closed when the browser rate limit is exceeded', async () => {
  const env = {
    PGA_HMAC_SECRET: 'server-secret',
    EVENTS: { writeDataPoint() {} },
    PRESENCE: { writeDataPoint() {} },
    BROWSER_RATE_LIMITER: { limit: async () => ({ success: false }) },
  }
  const request = new Request('https://events.playgarba.com/v1/events', {
    method: 'POST',
    headers: { origin: 'https://playgarba.com', 'content-type': 'application/json' },
    body: JSON.stringify([baseEvent()]),
  })
  const response = await handleIngest(request, env, { nowMs: NOW })
  assert.equal(response.status, 429)
})


test('Access verifier rejects missing environment configuration', async () => {
  const fixture = await accessFixture()
  const result1 = await verifyAccessJwt(fixture.request, {}, { nowMs: NOW, fetchImpl: fixture.fetchImpl })
  assert.deepEqual(result1, { ok: false, reason: 'access_config_missing' })

  const result2 = await verifyAccessJwt(fixture.request, { TEAM_DOMAIN: fixture.env.TEAM_DOMAIN }, { nowMs: NOW, fetchImpl: fixture.fetchImpl })
  assert.deepEqual(result2, { ok: false, reason: 'access_config_missing' })
})

test('Access verifier rejects malformed JWTs', async () => {
  const env = { TEAM_DOMAIN: 'https://example.cloudflareaccess.com', POLICY_AUD: 'pga-aud' }
  const req1 = new Request('https://pga.playgarba.com/api/home', { headers: { 'cf-access-jwt-assertion': 'not.a.jwt' } })
  assert.deepEqual(await verifyAccessJwt(req1, env), { ok: false, reason: 'malformed_access_jwt' })

  const req2 = new Request('https://pga.playgarba.com/api/home', { headers: { 'cf-access-jwt-assertion': 'a.b.c' } })
  assert.deepEqual(await verifyAccessJwt(req2, env), { ok: false, reason: 'malformed_access_jwt' })
})

test('Access verifier denies missing JWT assertions', async () => {
  const result = await verifyAccessJwt(new Request('https://pga.playgarba.com/api/home'), {
    TEAM_DOMAIN: 'https://example.cloudflareaccess.com',
    POLICY_AUD: 'pga-aud',
  })
  assert.deepEqual(result, { ok: false, reason: 'missing_access_jwt' })
})

test('Access verifier validates a signed RS256 application assertion against the Access JWKS', async () => {
  const fixture = await accessFixture()
  const result = await verifyAccessJwt(fixture.request, fixture.env, { nowMs: NOW, fetchImpl: fixture.fetchImpl })
  assert.equal(result.ok, true)
  assert.equal(result.payload.sub, 'founder')
  assert.equal(result.payload.type, 'app')
})


test('Access verifier rejects tokens with unsupported algorithms or missing Key IDs', async () => {
  const env = { TEAM_DOMAIN: 'https://example.cloudflareaccess.com', POLICY_AUD: 'pga-aud' }
  const payloadBase64 = Buffer.from(JSON.stringify({ iss: env.TEAM_DOMAIN, aud: [env.POLICY_AUD] })).toString('base64url')

  const headerHS256 = Buffer.from(JSON.stringify({ alg: 'HS256', kid: 'test-key' })).toString('base64url')
  const req1 = new Request('https://pga.playgarba.com', { headers: { 'cf-access-jwt-assertion': `${headerHS256}.${payloadBase64}.signature` } })
  assert.deepEqual(await verifyAccessJwt(req1, env), { ok: false, reason: 'unsupported_access_jwt' })

  const headerNoKid = Buffer.from(JSON.stringify({ alg: 'RS256' })).toString('base64url')
  const req2 = new Request('https://pga.playgarba.com', { headers: { 'cf-access-jwt-assertion': `${headerNoKid}.${payloadBase64}.signature` } })
  assert.deepEqual(await verifyAccessJwt(req2, env), { ok: false, reason: 'unsupported_access_jwt' })
})

test('Access verifier rejects tokens that are not yet valid', async () => {
  const futureNbf = Math.floor(NOW / 1000) + 60
  const fixture = await accessFixture('/api/live', { nbf: futureNbf })
  const result = await verifyAccessJwt(fixture.request, fixture.env, { nowMs: NOW, fetchImpl: fixture.fetchImpl })
  assert.deepEqual(result, { ok: false, reason: 'not_yet_valid' })
})

test('Access verifier rejects signed non-application token classes', async () => {
  for (const [label, type] of [
    ['global session token', 'org'],
    ['missing token type', undefined],
    ['non-string token type', true],
  ]) {
    const fixture = await accessFixture('/api/live', { type })
    const result = await verifyAccessJwt(fixture.request, fixture.env, { nowMs: NOW, fetchImpl: fixture.fetchImpl })
    assert.deepEqual(result, { ok: false, reason: 'invalid_token_type' }, label)
  }
})

test('Access verifier preserves issuer, audience and expiry rejection precedence', async () => {
  const wrongIssuer = await accessFixture('/api/live', { iss: 'https://other.cloudflareaccess.com', type: 'org' })
  assert.deepEqual(
    await verifyAccessJwt(wrongIssuer.request, wrongIssuer.env, { nowMs: NOW, fetchImpl: wrongIssuer.fetchImpl }),
    { ok: false, reason: 'invalid_issuer' },
  )

  const wrongAudience = await accessFixture('/api/live', { aud: ['other-aud'], type: 'org' })
  assert.deepEqual(
    await verifyAccessJwt(wrongAudience.request, wrongAudience.env, { nowMs: NOW, fetchImpl: wrongAudience.fetchImpl }),
    { ok: false, reason: 'invalid_audience' },
  )

  const expired = await accessFixture('/api/live', { exp: Math.floor(NOW / 1000) - 1 })
  assert.deepEqual(
    await verifyAccessJwt(expired.request, expired.env, { nowMs: NOW, fetchImpl: expired.fetchImpl }),
    { ok: false, reason: 'expired' },
  )
})


test('Access verifier rejects tokens signed with unknown keys', async () => {
  const fixture = await accessFixture()
  const originalToken = fixture.request.headers.get('cf-access-jwt-assertion')
  const parts = originalToken.split('.')
  const header = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'))
  header.kid = 'unknown-key'
  const newHeader = Buffer.from(JSON.stringify(header)).toString('base64url')
  const modifiedToken = `${newHeader}.${parts[1]}.${parts[2]}`
  const request = new Request('https://pga.playgarba.com/api/live', { headers: { 'cf-access-jwt-assertion': modifiedToken } })

  const result = await verifyAccessJwt(request, fixture.env, { nowMs: NOW, fetchImpl: fixture.fetchImpl })
  assert.deepEqual(result, { ok: false, reason: 'unknown_signing_key' })
})

test('Access verifier rejects tokens with invalid signatures', async () => {
  const fixture = await accessFixture()
  const originalToken = fixture.request.headers.get('cf-access-jwt-assertion')
  const parts = originalToken.split('.')
  const modifiedToken = `${parts[0]}.${parts[1]}.invalidsignature`
  const request = new Request('https://pga.playgarba.com/api/live', { headers: { 'cf-access-jwt-assertion': modifiedToken } })

  const result = await verifyAccessJwt(request, fixture.env, { nowMs: NOW, fetchImpl: fixture.fetchImpl })
  assert.deepEqual(result, { ok: false, reason: 'invalid_signature' })
})

test('Access verifier fails safely on JWKS fetch errors', async () => {
  const fixture = await accessFixture()
  const fetchImpl = async () => { throw new Error('Network error') }

  const result = await verifyAccessJwt(fixture.request, fixture.env, { nowMs: NOW, fetchImpl })
  assert.deepEqual(result, { ok: false, reason: 'access_verification_failed' })
})

test('protected Live API returns aggregate data with no-store caching', async () => {
  const fixture = await accessFixture('/api/live')
  const response = await handleAdmin(fixture.request, fixture.env, {
    nowMs: NOW,
    fetchImpl: fixture.fetchImpl,
    queryAnalytics: async () => [{ live_now: 3, listening_now: 2, browsing_now: 1, data_through_ms: NOW, max_sample_interval: 1 }],
  })
  assert.equal(response.status, 200)
  assert.equal(response.headers.get('cache-control'), 'no-store')
  const body = await response.json()
  assert.equal(body.data.liveNow.value, 3)
  assert.equal(body.data.listeningNow.value, 2)
})

test('protected API rejects unsupported ranges as client errors, not fake zero data', async () => {
  const fixture = await accessFixture('/api/audience?range=all-time')
  const response = await handleAdmin(fixture.request, fixture.env, {
    nowMs: NOW,
    fetchImpl: fixture.fetchImpl,
    queryAnalytics: async () => { throw new Error('should_not_run') },
  })
  assert.equal(response.status, 400)
  const body = await response.json()
  assert.equal(body.status, 'unavailable')
  assert.equal(body.data, null)
})

test('daily metric replacement is transaction-shaped instead of incrementing counters', async () => {
  const db = new FakeDb()
  await replaceDailyMetrics(db, '2026-09-08', { sessions: 10, listening_ms: 5000 }, { precision: 'exact', sampled: false, dataThroughMs: NOW })
  assert.equal(db.batches.length, 1)
  assert.match(db.batches[0][0].sql, /^DELETE FROM daily_metrics/)
  assert.equal(db.batches[0].filter((statement) => /INSERT INTO daily_metrics/.test(statement.sql)).length, 2)
})

test('rollup day stores additive metrics and a daily unique-browser snapshot without increment semantics', async () => {
  const db = new FakeDb()
  const env = { DB: db, EVENTS_DATASET_NAME: 'events', PRESENCE_DATASET_NAME: 'presence' }
  const query = async (_env, sql) => sql.includes('FROM presence')
    ? [{ played_ms: 90_000, data_through_ms: NOW, max_sample_interval: 1 }]
    : [{ unique_browsers: 4, sessions: 5, browser_ids_created: 2, confirmed_play_starts: 7, surface_views: 12, data_through_ms: NOW, max_sample_interval: 1 }]
  const result = await rollupDay(env, '2026-09-08', { nowMs: NOW, queryAnalytics: query })
  assert.equal(result.status, 'complete')
  assert.equal(result.metrics.sessions, 5)
  assert.equal(result.metrics.unique_browsers_daily, 4)
  assert.equal(db.batches.length, 1)
})

test('ingestion rejects overly large bodies', async () => {
  const env = {
    PGA_HMAC_SECRET: 'server-secret',
    EVENTS: { writeDataPoint() {} },
    PRESENCE: { writeDataPoint() {} },
    BROWSER_RATE_LIMITER: { limit: async () => ({ success: true }) },
  }
  const request = new Request('https://events.playgarba.com/v1/events', {
    method: 'POST',
    headers: { origin: 'https://playgarba.com', 'content-type': 'application/json', 'content-length': '33000' },
    body: 'x'.repeat(33000),
  })
  const response = await handleIngest(request, env, { nowMs: NOW })
  assert.equal(response.status, 413)
  const body = await response.json()
  assert.equal(body.error, 'body_too_large')
})

test('ingestion rejects invalid json', async () => {
  const env = {
    PGA_HMAC_SECRET: 'server-secret',
    EVENTS: { writeDataPoint() {} },
    PRESENCE: { writeDataPoint() {} },
    BROWSER_RATE_LIMITER: { limit: async () => ({ success: true }) },
  }
  const request = new Request('https://events.playgarba.com/v1/events', {
    method: 'POST',
    headers: { origin: 'https://playgarba.com', 'content-type': 'application/json' },
    body: '{ invalid json ',
  })
  const response = await handleIngest(request, env, { nowMs: NOW })
  assert.equal(response.status, 400)
  const body = await response.json()
  assert.equal(body.error, 'invalid_json')
})