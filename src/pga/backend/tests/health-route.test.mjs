import test from 'node:test'
import assert from 'node:assert/strict'
import { webcrypto } from 'node:crypto'

if (!globalThis.crypto) globalThis.crypto = webcrypto

import { handleAdmin } from '../admin-worker.js'
import { resetJwksCacheForTests } from '../lib/crypto.js'

const NOW = Date.parse('2026-09-10T07:20:00Z')
const REVISION = '1'.repeat(40)
const HEALTH_PRESENTATION = Object.freeze({
  schemaVersion: 'pga-health-presentation/v1',
  sourceSchemaVersion: 'pga-health-snapshot/v1',
  status: 'healthy',
  statusLabel: 'Healthy',
  summary: 'All eight canonical health checks are healthy.',
  complete: true,
  generatedAt: new Date(NOW).toISOString(),
  evaluatedAt: new Date(NOW).toISOString(),
  counts: { failed: 0, degraded: 0, stale: 0, unknown: 0 },
  accessibilitySummary: 'PlayGarba Health: Healthy.',
  subsystems: [],
  problems: [],
  actions: [],
})

function base64url(value) {
  return Buffer.from(value).toString('base64url')
}

async function accessFixture(path = '/api/health') {
  resetJwksCacheForTests()
  const pair = await crypto.subtle.generateKey(
    { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
    true,
    ['sign', 'verify'],
  )
  const publicJwk = await crypto.subtle.exportKey('jwk', pair.publicKey)
  publicJwk.kid = 'health-route-test-key'
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
  const signed = new TextEncoder().encode(`${header}.${payload}`)
  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', pair.privateKey, signed)
  const token = `${header}.${payload}.${Buffer.from(signature).toString('base64url')}`

  return {
    request: new Request(`https://pga.playgarba.com${path}`, {
      headers: { 'cf-access-jwt-assertion': token },
    }),
    env: {
      TEAM_DOMAIN: teamDomain,
      POLICY_AUD: 'pga-aud',
      PGA_EXPECTED_REVISION: REVISION,
      PGA_GITHUB_REPOSITORY: 'ruddvz/garba',
      PGA_GITHUB_TOKEN: 'server-only-health-token',
      PGA_HEALTH_REQUIRED_CHECKS_JSON: JSON.stringify(['Validate GARBA', 'PGA security validate']),
      PGA_HEALTH_FRESHNESS_BUDGETS_JSON: JSON.stringify({ production: 60_000, rollups: 86_400_000 }),
      PGA_HEALTH_TIMEOUT_MS: '7000',
      DB: {},
    },
    authFetch: async () => Response.json({ keys: [publicJwk] }),
  }
}

function rollupRun(overrides = {}) {
  return {
    day_ist: '2026-09-10',
    status: 'complete',
    completed_at: new Date(NOW - 60_000).toISOString(),
    data_through_ms: NOW - 120_000,
    schema_version: 1,
    updated_at: new Date(NOW - 60_000).toISOString(),
    ...overrides,
  }
}

test('protected Health API returns only the bounded canonical presentation and forwards explicit server configuration', async () => {
  const fixture = await accessFixture()
  let collectorArgs = null
  const snapshot = { schemaVersion: 'pga-health-snapshot/v1', secretInternalField: 'must-not-leak' }

  const response = await handleAdmin(fixture.request, fixture.env, {
    nowMs: NOW,
    fetchImpl: fixture.authFetch,
    getRollupHealth: async () => [rollupRun()],
    collectHealthSnapshot: async (args) => {
      collectorArgs = args
      return snapshot
    },
    buildHealthPresentation: (value, options) => {
      assert.equal(value, snapshot)
      assert.equal(options.nowMs, NOW)
      return HEALTH_PRESENTATION
    },
  })

  assert.equal(response.status, 200)
  assert.equal(response.headers.get('cache-control'), 'no-store')
  assert.equal(response.headers.get('referrer-policy'), 'no-referrer')
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff')

  const body = await response.json()
  assert.equal(body.status, 'complete')
  assert.deepEqual(body.data, { presentation: HEALTH_PRESENTATION })
  assert.equal(JSON.stringify(body).includes('must-not-leak'), false, 'raw snapshot internals must not reach the browser')
  assert.equal(JSON.stringify(body).includes(fixture.env.PGA_GITHUB_TOKEN), false, 'server token must never be serialized')
  assert.deepEqual(body.sources, [
    { name: 'health-collector', status: 'complete' },
    { name: 'd1-rollups', status: 'complete' },
  ])

  assert.equal(collectorArgs.nowMs, NOW)
  assert.equal(collectorArgs.expectedRevision, REVISION)
  assert.equal(collectorArgs.githubRepository, 'ruddvz/garba')
  assert.equal(collectorArgs.githubToken, fixture.env.PGA_GITHUB_TOKEN)
  assert.deepEqual(collectorArgs.requiredChecks, ['Validate GARBA', 'PGA security validate'])
  assert.deepEqual(collectorArgs.freshnessBudgets, { production: 60_000, rollups: 86_400_000 })
  assert.equal(collectorArgs.timeoutMs, '7000')
  assert.equal(collectorArgs.observations.rollups.payload.status, 'complete')
  assert.equal(collectorArgs.observations.rollups.payload.data.rollups[0].status, 'complete')
})

test('omitted configuration uses empty array and object for collector arguments', async () => {
  const fixture = await accessFixture()
  delete fixture.env.PGA_HEALTH_REQUIRED_CHECKS_JSON
  delete fixture.env.PGA_HEALTH_FRESHNESS_BUDGETS_JSON
  let collectorArgs = null

  await handleAdmin(fixture.request, fixture.env, {
    nowMs: NOW,
    fetchImpl: fixture.authFetch,
    collectHealthSnapshot: async (args) => {
      collectorArgs = args
      return { schemaVersion: 'pga-health-snapshot/v1' }
    },
  })

  assert.deepEqual(collectorArgs.requiredChecks, [])
  assert.deepEqual(collectorArgs.freshnessBudgets, {})
})

test('missing D1 binding stays unknown evidence and makes the transport envelope partial without blocking other Health collection', async () => {
  const fixture = await accessFixture()
  delete fixture.env.DB
  let rollupObservation = 'not-seen'
  const unknownPresentation = { ...HEALTH_PRESENTATION, status: 'unknown', statusLabel: 'Unknown', summary: 'Rollups are unknown.' }

  const response = await handleAdmin(fixture.request, fixture.env, {
    nowMs: NOW,
    fetchImpl: fixture.authFetch,
    collectHealthSnapshot: async ({ observations }) => {
      rollupObservation = observations.rollups
      return { schemaVersion: 'pga-health-snapshot/v1' }
    },
    buildHealthPresentation: () => unknownPresentation,
  })

  assert.equal(response.status, 200)
  const body = await response.json()
  assert.equal(body.status, 'partial')
  assert.equal(body.data.presentation.status, 'unknown')
  assert.equal(rollupObservation.payload, null, 'an absent binding is unknown, not a fabricated failed run')
  assert.deepEqual(body.sources, [
    { name: 'health-collector', status: 'complete' },
    { name: 'd1-rollups', status: 'unavailable' },
  ])
})

test('configured D1 query failure is supplied to the canonical adapter as failed evidence rather than zero or healthy', async () => {
  const fixture = await accessFixture()
  let rollupPayload = null
  const failedPresentation = { ...HEALTH_PRESENTATION, status: 'failed', statusLabel: 'Failed', summary: 'Rollup health failed.' }

  const response = await handleAdmin(fixture.request, fixture.env, {
    nowMs: NOW,
    fetchImpl: fixture.authFetch,
    getRollupHealth: async () => { throw new Error('d1_unavailable') },
    collectHealthSnapshot: async ({ observations }) => {
      rollupPayload = observations.rollups.payload
      return { schemaVersion: 'pga-health-snapshot/v1' }
    },
    buildHealthPresentation: () => failedPresentation,
  })

  assert.equal(response.status, 200)
  const body = await response.json()
  assert.equal(body.status, 'partial')
  assert.equal(body.data.presentation.status, 'failed')
  assert.equal(rollupPayload.status, 'unavailable')
  assert.equal(rollupPayload.data, null)
  assert.equal(JSON.stringify(body).includes('d1_unavailable'), false, 'raw infrastructure errors must not leak')
})

test('Health collector failure fails closed as unavailable and never falls back to a misleading rollup-only success', async () => {
  const fixture = await accessFixture()
  const response = await handleAdmin(fixture.request, fixture.env, {
    nowMs: NOW,
    fetchImpl: fixture.authFetch,
    getRollupHealth: async () => [rollupRun()],
    collectHealthSnapshot: async () => { throw new Error('collector_failed') },
  })

  assert.equal(response.status, 503)
  const body = await response.json()
  assert.equal(body.status, 'unavailable')
  assert.equal(body.data, null)
  assert.equal(JSON.stringify(body).includes('collector_failed'), false)
  assert.deepEqual(body.sources, [
    { name: 'health-collector', status: 'unavailable' },
    { name: 'd1-rollups', status: 'complete' },
  ])
})

test('missing Access authentication is rejected before Health collection runs', async () => {
  let collectorCalls = 0
  const response = await handleAdmin(new Request('https://pga.playgarba.com/api/health'), {
    TEAM_DOMAIN: 'https://example.cloudflareaccess.com',
    POLICY_AUD: 'pga-aud',
  }, {
    nowMs: NOW,
    collectHealthSnapshot: async () => {
      collectorCalls += 1
      return { schemaVersion: 'pga-health-snapshot/v1' }
    },
  })

  assert.equal(response.status, 401)
  assert.equal(collectorCalls, 0)
  assert.equal(response.headers.get('cache-control'), 'no-store')
})
