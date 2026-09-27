import test from 'node:test'
import assert from 'node:assert/strict'

import {
  catalogueValidationEvidence,
  composeHealthEvidence,
  composeHealthSnapshot,
  healthSubsystemOrder,
} from '../snapshot.js'

const NOW = Date.parse('2026-09-10T04:15:00.000Z')
const SHA = 'a'.repeat(40)
const FIVE_MINUTES = 5 * 60 * 1000
const DAY = 24 * 60 * 60 * 1000

function iso(ms) {
  return new Date(ms).toISOString()
}

function healthyObservations(nowMs = NOW) {
  const fresh = iso(nowMs - 10_000)
  return {
    production: {
      completed: true,
      ok: true,
      statusCode: 200,
      checkedAt: nowMs - 1_000,
      freshnessBudgetMs: FIVE_MINUTES,
      sourceUrl: 'https://playgarba.com/',
    },
    playback: {
      completed: true,
      state: 'success',
      confirmedStart: true,
      controlsResponsive: true,
      contentId: 'song-fixture-1',
      checkedAt: nowMs - 1_000,
      freshnessBudgetMs: FIVE_MINUTES,
      sourceUrl: 'https://playgarba.com/',
    },
    deployment: {
      buildInfo: {
        deployment: { origin: 'https://playgarba.com' },
        build: { revision: SHA },
      },
      expectedRevision: SHA,
      checkedAt: nowMs - 1_000,
      freshnessBudgetMs: FIVE_MINUTES,
      sourceUrl: 'https://playgarba.com/build-info.json',
    },
    ci: {
      checkRunsPayload: {
        check_runs: [{
          id: 11,
          name: 'Validate GARBA',
          status: 'completed',
          conclusion: 'success',
          completed_at: iso(nowMs - 1_000),
          details_url: 'https://github.com/ruddvz/garba/actions',
        }],
      },
      requiredChecks: ['Validate GARBA'],
      checkedAt: nowMs - 1_000,
      freshnessBudgetMs: FIVE_MINUTES,
      sourceUrl: 'https://github.com/ruddvz/garba/actions',
    },
    catalogue: {
      completed: true,
      state: 'success',
      ok: true,
      errors: 0,
      warnings: 0,
      revision: SHA,
      checkedAt: nowMs - 1_000,
      freshnessBudgetMs: FIVE_MINUTES,
      sourceUrl: 'https://github.com/ruddvz/garba/actions',
    },
    telemetry: {
      payload: {
        status: 'complete',
        generatedAt: fresh,
        dataThrough: fresh,
        sources: [{ name: 'analytics-engine', status: 'complete', sampled: false }],
      },
      checkedAt: nowMs - 1_000,
      freshnessBudgetMs: FIVE_MINUTES,
      sourceUrl: 'https://pga.playgarba.com/api/health',
    },
    rollups: {
      payload: {
        status: 'complete',
        generatedAt: fresh,
        dataThrough: fresh,
        sources: [{ name: 'd1-rollups', status: 'complete', sampled: false }],
        data: {
          rollups: [{
            id: 'rollup-fixture-1',
            status: 'complete',
            completed_at: fresh,
            data_through_ms: nowMs - 10_000,
          }],
        },
      },
      checkedAt: nowMs - 1_000,
      freshnessBudgetMs: DAY,
      sourceUrl: 'https://pga.playgarba.com/api/health',
    },
    pwa: {
      completed: true,
      ok: true,
      controlled: true,
      state: 'success',
      activeVersion: 'pga-sw-v1',
      expectedVersion: 'pga-sw-v1',
      checkedAt: nowMs - 1_000,
      freshnessBudgetMs: FIVE_MINUTES,
      sourceUrl: 'https://pga.playgarba.com/sw.js',
    },
  }
}

function byName(snapshot, name) {
  return snapshot.subsystems.find((subsystem) => subsystem.name === name)
}

test('all healthy bounded observations compose a stable founder Health snapshot', () => {
  const observations = healthyObservations()
  observations.production.apiToken = 'DO_NOT_ECHO_SECRET_MARKER'
  observations.telemetry.rawListenerPayload = 'DO_NOT_ECHO_LISTENER_MARKER'

  const snapshot = composeHealthSnapshot(observations, { nowMs: NOW })

  assert.equal(snapshot.schemaVersion, 'pga-health-snapshot/v1')
  assert.equal(snapshot.generatedAt, iso(NOW))
  assert.equal(snapshot.status, 'healthy')
  assert.deepEqual(snapshot.subsystems.map((subsystem) => subsystem.name), healthSubsystemOrder())
  assert.equal(snapshot.counts.healthy, 8)
  assert.equal(snapshot.counts.failed, 0)
  assert.equal(snapshot.counts.unknown, 0)

  const serialized = JSON.stringify(snapshot)
  assert.doesNotMatch(serialized, /DO_NOT_ECHO_SECRET_MARKER/)
  assert.doesNotMatch(serialized, /DO_NOT_ECHO_LISTENER_MARKER/)
  assert.equal(Object.hasOwn(snapshot, 'observations'), false)
})

test('missing source evidence remains explicit unknown rather than disappearing or becoming healthy', () => {
  const observations = healthyObservations()
  delete observations.playback

  const snapshot = composeHealthSnapshot(observations, { nowMs: NOW })
  const playback = byName(snapshot, 'playback')

  assert.equal(playback.status, 'unknown')
  assert.equal(snapshot.subsystems.length, 8)
  assert.equal(snapshot.counts.unknown, 1)
  assert.equal(snapshot.status, 'unknown')
})

test('critical production failure makes overall Health failed without changing healthy playback evidence', () => {
  const observations = healthyObservations()
  observations.production = {
    completed: true,
    ok: false,
    statusCode: 503,
    checkedAt: NOW - 1_000,
    freshnessBudgetMs: FIVE_MINUTES,
    sourceUrl: 'https://playgarba.com/',
  }

  const snapshot = composeHealthSnapshot(observations, { nowMs: NOW })

  assert.equal(snapshot.status, 'failed')
  assert.equal(snapshot.leadingSubsystem, 'production')
  assert.equal(byName(snapshot, 'production').status, 'failed')
  assert.equal(byName(snapshot, 'playback').status, 'healthy')
})

test('important catalogue failure degrades overall Health but does not claim production is unreachable', () => {
  const observations = healthyObservations()
  observations.catalogue = {
    completed: true,
    state: 'failure',
    ok: false,
    errors: 2,
    warnings: 0,
    revision: SHA,
    checkedAt: NOW - 1_000,
    freshnessBudgetMs: FIVE_MINUTES,
  }

  const snapshot = composeHealthSnapshot(observations, { nowMs: NOW })

  assert.equal(snapshot.status, 'degraded')
  assert.equal(byName(snapshot, 'catalogue').status, 'failed')
  assert.equal(byName(snapshot, 'catalogue').details.errors, 2)
  assert.equal(byName(snapshot, 'production').status, 'healthy')
})

test('catalogue success with warnings is degraded and preserves explicit bounded counts', () => {
  const evidence = catalogueValidationEvidence({
    completed: true,
    state: 'success',
    ok: true,
    errors: 0,
    warnings: 3,
    revision: SHA,
    checkedAt: NOW,
  })

  assert.equal(evidence.status, 'degraded')
  assert.equal(evidence.details.errors, 0)
  assert.equal(evidence.details.warnings, 3)
  assert.equal(evidence.details.revision, SHA)
})

test('catalogue healthy requires explicit zero error and warning counts; missing count is not manufactured', () => {
  const healthy = catalogueValidationEvidence({
    completed: true,
    state: 'success',
    ok: true,
    errors: 0,
    warnings: 0,
    checkedAt: NOW,
  })
  const incomplete = catalogueValidationEvidence({
    completed: true,
    state: 'success',
    ok: true,
    errors: 0,
    checkedAt: NOW,
  })

  assert.equal(healthy.status, 'healthy')
  assert.equal(healthy.details.errors, 0)
  assert.equal(healthy.details.warnings, 0)
  assert.equal(incomplete.status, 'unknown')
  assert.equal(Object.hasOwn(incomplete.details, 'warnings'), false)
})

test('catalogue counts reject coercible, negative, fractional and non-finite values without manufacturing health', () => {
  const malformedCounts = [
    '0',
    '1',
    false,
    true,
    null,
    '',
    -1,
    0.5,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    Number.NEGATIVE_INFINITY,
  ]

  for (const malformed of malformedCounts) {
    for (const field of ['errors', 'warnings']) {
      const evidence = catalogueValidationEvidence({
        completed: true,
        state: 'success',
        ok: true,
        errors: 0,
        warnings: 0,
        [field]: malformed,
        checkedAt: NOW,
      })

      assert.equal(
        evidence.status,
        'unknown',
        `expected malformed ${field}=${String(malformed)} (${typeof malformed}) to stay unavailable`,
      )
      assert.equal(Object.hasOwn(evidence.details, field), false)
    }
  }
})

test('unresolved catalogue validation stays unknown even if a caller supplies zero errors', () => {
  const evidence = catalogueValidationEvidence({
    completed: false,
    state: 'pending',
    errors: 0,
    warnings: 0,
    checkedAt: NOW,
  })

  assert.equal(evidence.status, 'unknown')
})

test('stale source evidence uses the adapter freshness budget instead of inventing a universal timeout', () => {
  const observations = healthyObservations()
  observations.telemetry.payload.generatedAt = iso(NOW - 10 * 60 * 1000)
  observations.telemetry.payload.dataThrough = iso(NOW - 10 * 60 * 1000)
  observations.telemetry.freshnessBudgetMs = FIVE_MINUTES

  const snapshot = composeHealthSnapshot(observations, { nowMs: NOW })
  const telemetry = byName(snapshot, 'telemetry')

  assert.equal(telemetry.observedStatus, 'healthy')
  assert.equal(telemetry.status, 'stale')
  assert.equal(snapshot.status, 'stale')
})

test('partial telemetry and rollup envelopes remain degraded and actionable', () => {
  const observations = healthyObservations()
  observations.telemetry.payload.status = 'partial'
  observations.rollups.payload.status = 'partial'

  const snapshot = composeHealthSnapshot(observations, { nowMs: NOW })

  assert.equal(byName(snapshot, 'telemetry').status, 'degraded')
  assert.equal(byName(snapshot, 'rollups').status, 'degraded')
  assert.equal(snapshot.status, 'degraded')
  assert.equal(snapshot.actionable.some((item) => item.subsystem === 'telemetry'), true)
  assert.equal(snapshot.actionable.some((item) => item.subsystem === 'rollups'), true)
})

test('invalid observation container still produces eight unknown subsystems safely', () => {
  const evidence = composeHealthEvidence(null)
  const snapshot = composeHealthSnapshot(null, { nowMs: NOW })

  assert.deepEqual(Object.keys(evidence), healthSubsystemOrder())
  assert.equal(snapshot.subsystems.length, 8)
  assert.equal(snapshot.counts.unknown, 8)
  assert.equal(snapshot.status, 'unknown')
})

test('numeric zero remains a valid snapshot evaluation clock', () => {
  const snapshot = composeHealthSnapshot({}, { nowMs: 0 })

  assert.equal(snapshot.generatedAt, '1970-01-01T00:00:00.000Z')
  assert.equal(snapshot.evaluatedAt, 0)
  assert.equal(snapshot.status, 'unknown')
})

test('coercible non-number and non-finite snapshot clocks fail closed', () => {
  for (const nowMs of ['0', '', false, true, null, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
    assert.throws(
      () => composeHealthSnapshot({}, { nowMs }),
      /invalid_health_snapshot_time/,
      `expected ${String(nowMs)} (${typeof nowMs}) to be rejected`,
    )
  }
})
