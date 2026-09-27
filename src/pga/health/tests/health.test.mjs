import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildIdentityEvidence,
  checkRunEvidence,
  evaluateHealth,
  evaluateSubsystem,
  HEALTH_STATUSES,
  subsystemDefaults,
} from '../model.js'

const NOW = Date.parse('2026-09-09T21:00:00Z')
const MINUTE = 60_000

function healthyEvidence(overrides = {}) {
  return {
    production: {
      status: 'healthy',
      checkedAt: NOW - MINUTE,
      freshnessBudgetMs: 5 * MINUTE,
      summary: 'Production is reachable.',
      source: { kind: 'http_probe', url: 'https://playgarba.com/' },
    },
    playback: {
      status: 'healthy',
      checkedAt: NOW - MINUTE,
      freshnessBudgetMs: 5 * MINUTE,
      summary: 'Playback probe is passing.',
    },
    deployment: buildIdentityEvidence({
      expectedBuildId: 'abc123',
      deployedBuildId: 'abc123',
      checkedAt: NOW - MINUTE,
      freshnessBudgetMs: 5 * MINUTE,
    }),
    ci: checkRunEvidence({
      state: 'success',
      checkedAt: NOW - MINUTE,
      freshnessBudgetMs: 30 * MINUTE,
    }),
    telemetry: {
      status: 'healthy',
      checkedAt: NOW - MINUTE,
      freshnessBudgetMs: 5 * MINUTE,
    },
    rollups: {
      status: 'healthy',
      dataThroughAt: NOW - 2 * MINUTE,
      freshnessBudgetMs: 15 * MINUTE,
    },
    pwa: {
      status: 'healthy',
      checkedAt: NOW - MINUTE,
      freshnessBudgetMs: 30 * MINUTE,
    },
    ...overrides,
  }
}

test('all current healthy evidence produces healthy overall status', () => {
  const result = evaluateHealth(healthyEvidence(), { nowMs: NOW })
  assert.equal(result.status, 'healthy')
  assert.equal(result.leadingSubsystem, 'production')
  assert.equal(result.counts.healthy, 7)
  assert.equal(result.reasons.length, 0)
})

test('critical production failure makes overall health failed', () => {
  const result = evaluateHealth(healthyEvidence({
    production: {
      status: 'failed',
      checkedAt: NOW,
      reason: 'Production probe returned an unavailable result.',
      action: 'Inspect production reachability.',
    },
  }), { nowMs: NOW })

  assert.equal(result.status, 'failed')
  assert.equal(result.leadingSubsystem, 'production')
  assert.equal(result.subsystems.find((item) => item.name === 'production').status, 'failed')
  assert.equal(result.actionable[0].action, 'Inspect production reachability.')
})

test('critical playback failure makes overall health failed', () => {
  const result = evaluateHealth(healthyEvidence({
    playback: { status: 'failed', checkedAt: NOW, reason: 'Verified playback probe failed.' },
  }), { nowMs: NOW })
  assert.equal(result.status, 'failed')
  assert.equal(result.leadingSubsystem, 'playback')
})

test('non-critical CI failure degrades health without claiming production is down', () => {
  const result = evaluateHealth(healthyEvidence({
    ci: checkRunEvidence({ state: 'failure', checkedAt: NOW }),
  }), { nowMs: NOW })

  assert.equal(result.status, 'degraded')
  const ci = result.subsystems.find((item) => item.name === 'ci')
  assert.equal(ci.status, 'failed')
  assert.equal(ci.criticality, 'important')
  assert.equal(result.subsystems.find((item) => item.name === 'production').status, 'healthy')
})

test('supporting telemetry failure degrades health without mutating other evidence', () => {
  const result = evaluateHealth(healthyEvidence({
    telemetry: {
      status: 'failed',
      checkedAt: NOW,
      reason: 'Ingestion health endpoint is unavailable.',
    },
  }), { nowMs: NOW })

  assert.equal(result.status, 'degraded')
  assert.equal(result.subsystems.find((item) => item.name === 'telemetry').status, 'failed')
  assert.equal(result.subsystems.find((item) => item.name === 'playback').status, 'healthy')
})

test('build identity mismatch is explicit degraded evidence', () => {
  const deployment = buildIdentityEvidence({
    expectedBuildId: 'expected-sha',
    deployedBuildId: 'older-sha',
    checkedAt: NOW,
  })
  const result = evaluateHealth(healthyEvidence({ deployment }), { nowMs: NOW })

  assert.equal(deployment.status, 'degraded')
  assert.match(deployment.reason, /expected-sha/)
  assert.match(deployment.reason, /older-sha/)
  assert.equal(result.status, 'degraded')
})

test('incomplete build identity stays unknown rather than passing', () => {
  const deployment = buildIdentityEvidence({ expectedBuildId: 'expected-sha', checkedAt: NOW })
  assert.equal(deployment.status, 'unknown')
  const result = evaluateHealth({ deployment }, { nowMs: NOW })
  assert.equal(result.status, 'unknown')
})

test('stale rollup evidence is derived only from the supplied freshness budget', () => {
  const result = evaluateHealth(healthyEvidence({
    rollups: {
      status: 'healthy',
      dataThroughAt: NOW - 31 * MINUTE,
      freshnessBudgetMs: 15 * MINUTE,
      reason: 'Rollups were healthy at their last observation.',
    },
  }), { nowMs: NOW })

  const rollups = result.subsystems.find((item) => item.name === 'rollups')
  assert.equal(rollups.status, 'stale')
  assert.equal(rollups.observedStatus, 'healthy')
  assert.equal(rollups.stale, true)
  assert.equal(result.status, 'stale')
})

test('freshness budgets accept only finite JavaScript numbers while preserving numeric zero', () => {
  const numericZero = evaluateSubsystem('telemetry', {
    status: 'healthy',
    checkedAt: NOW - 1,
    freshnessBudgetMs: 0,
  }, { nowMs: NOW })
  assert.equal(numericZero.freshnessBudgetMs, 0)
  assert.equal(numericZero.status, 'stale')

  for (const value of ['0', '', false, true, null, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
    const result = evaluateSubsystem('telemetry', {
      status: 'healthy',
      checkedAt: NOW - 365 * 24 * 60 * MINUTE,
      freshnessBudgetMs: value,
    }, { nowMs: NOW })
    assert.equal(result.freshnessBudgetMs, null, `freshnessBudgetMs must reject ${String(value)}`)
    assert.equal(result.status, 'healthy', `invalid budget must not manufacture stale status for ${String(value)}`)
  }
})

test('future freshness evidence fails closed instead of being clamped to age zero', () => {
  const subsystem = evaluateSubsystem('production', {
    status: 'healthy',
    checkedAt: NOW + MINUTE,
    freshnessBudgetMs: 5 * MINUTE,
  }, { nowMs: NOW })

  assert.equal(subsystem.status, 'unknown')
  assert.equal(subsystem.observedStatus, 'healthy')
  assert.equal(subsystem.ageMs, null)
  assert.equal(subsystem.freshnessAt, NOW + MINUTE)
  assert.equal(subsystem.stale, false)
  assert.match(subsystem.reasons.join(' '), /later than the evaluation clock/i)
})

test('future data-through and explicit freshness timestamps use canonical precedence and fail closed', () => {
  const dataThrough = evaluateSubsystem('rollups', {
    status: 'healthy',
    checkedAt: NOW - MINUTE,
    dataThroughAt: NOW + MINUTE,
    freshnessBudgetMs: 15 * MINUTE,
  }, { nowMs: NOW })
  assert.equal(dataThrough.status, 'unknown')
  assert.equal(dataThrough.freshnessAt, NOW + MINUTE)
  assert.equal(dataThrough.ageMs, null)

  const explicitFreshness = evaluateSubsystem('telemetry', {
    status: 'healthy',
    checkedAt: NOW - MINUTE,
    dataThroughAt: NOW - 2 * MINUTE,
    freshnessAt: NOW + 2 * MINUTE,
    freshnessBudgetMs: 5 * MINUTE,
  }, { nowMs: NOW })
  assert.equal(explicitFreshness.status, 'unknown')
  assert.equal(explicitFreshness.freshnessAt, NOW + 2 * MINUTE)
  assert.equal(explicitFreshness.ageMs, null)
})

test('future timestamp cannot hide an explicit hard failure', () => {
  const subsystem = evaluateSubsystem('playback', {
    status: 'failed',
    checkedAt: NOW + MINUTE,
    freshnessBudgetMs: 5 * MINUTE,
    reason: 'Playback probe failed.',
  }, { nowMs: NOW })

  assert.equal(subsystem.status, 'failed')
  assert.equal(subsystem.ageMs, null)
  assert.equal(subsystem.stale, false)
  assert.match(subsystem.reasons.join(' '), /Playback probe failed/)
  assert.match(subsystem.reasons.join(' '), /later than the evaluation clock/i)
})

test('evidence exactly at the evaluation clock remains current with age zero', () => {
  const subsystem = evaluateSubsystem('production', {
    status: 'healthy',
    checkedAt: NOW,
    freshnessBudgetMs: 0,
  }, { nowMs: NOW })

  assert.equal(subsystem.status, 'healthy')
  assert.equal(subsystem.ageMs, 0)
  assert.equal(subsystem.stale, false)
  assert.equal(subsystem.reasons.length, 0)
})

test('evaluation clocks reject coercible non-number values in subsystem and aggregate paths', () => {
  const invalidClocks = ['0', '', false, true, null, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]
  for (const nowMs of invalidClocks) {
    assert.throws(
      () => evaluateSubsystem('production', { status: 'healthy' }, { nowMs }),
      { name: 'TypeError', message: 'nowMs must be a finite number' },
      `evaluateSubsystem must reject ${String(nowMs)}`,
    )
    assert.throws(
      () => evaluateHealth({}, { nowMs }),
      { name: 'TypeError', message: 'nowMs must be a finite number' },
      `evaluateHealth must reject ${String(nowMs)}`,
    )
  }

  const atEpoch = evaluateHealth({}, { nowMs: 0 })
  assert.equal(atEpoch.evaluatedAt, 0)
})

test('evidence without a freshness budget never becomes stale by guesswork', () => {
  const subsystem = evaluateSubsystem('telemetry', {
    status: 'healthy',
    checkedAt: NOW - 365 * 24 * 60 * MINUTE,
  }, { nowMs: NOW })
  assert.equal(subsystem.status, 'healthy')
  assert.equal(subsystem.stale, false)
})

test('hard failure remains failed even if the failure evidence is old', () => {
  const subsystem = evaluateSubsystem('playback', {
    status: 'failed',
    checkedAt: NOW - 60 * MINUTE,
    freshnessBudgetMs: 5 * MINUTE,
  }, { nowMs: NOW })
  assert.equal(subsystem.status, 'failed')
})

test('pending and cancelled CI are unknown, not false failure or success', () => {
  for (const state of ['pending', 'queued', 'in_progress', 'cancelled']) {
    const evidence = checkRunEvidence({ state, checkedAt: NOW })
    assert.equal(evidence.status, 'unknown', state)
    const result = evaluateHealth({ ci: evidence }, { nowMs: NOW })
    assert.equal(result.status, 'unknown', state)
  }
})

test('mixed degraded and unknown evidence resolves to degraded while preserving both', () => {
  const result = evaluateHealth({
    production: { status: 'healthy', checkedAt: NOW },
    ci: { status: 'degraded', checkedAt: NOW, reason: 'Required validation is warning/degraded.' },
    telemetry: { status: 'unknown', checkedAt: NOW, reason: 'No current telemetry probe.' },
  }, { nowMs: NOW })

  assert.equal(result.status, 'degraded')
  assert.equal(result.counts.degraded, 1)
  assert.equal(result.counts.unknown, 1)
})

test('missing evidence produces an explicit unknown result', () => {
  const result = evaluateHealth({}, { nowMs: NOW })
  assert.equal(result.status, 'unknown')
  assert.equal(result.subsystems.length, 0)
  assert.match(result.reasons[0], /No health evidence/)
})

test('fake clock moves evidence from current to stale deterministically', () => {
  const evidence = {
    production: {
      status: 'healthy',
      checkedAt: NOW,
      freshnessBudgetMs: 5 * MINUTE,
    },
  }
  assert.equal(evaluateHealth(evidence, { nowMs: NOW + 4 * MINUTE }).status, 'healthy')
  assert.equal(evaluateHealth(evidence, { nowMs: NOW + 6 * MINUTE }).status, 'stale')
})

test('new healthy evidence recovers a previously failed or stale evaluation', () => {
  const failed = evaluateHealth({
    production: { status: 'failed', checkedAt: NOW, reason: 'Down.' },
  }, { nowMs: NOW })
  assert.equal(failed.status, 'failed')

  const recovered = evaluateHealth({
    production: {
      status: 'healthy',
      checkedAt: NOW + MINUTE,
      freshnessBudgetMs: 5 * MINUTE,
      summary: 'Reachability restored.',
    },
  }, { nowMs: NOW + MINUTE })
  assert.equal(recovered.status, 'healthy')
})

test('failed and unknown metrics do not receive fabricated zero values', () => {
  const result = evaluateHealth({
    telemetry: { status: 'failed', checkedAt: NOW },
    rollups: { status: 'unknown', checkedAt: NOW },
    production: { status: 'healthy', checkedAt: NOW, value: 0 },
  }, { nowMs: NOW })

  const telemetry = result.subsystems.find((item) => item.name === 'telemetry')
  const rollups = result.subsystems.find((item) => item.name === 'rollups')
  const production = result.subsystems.find((item) => item.name === 'production')
  assert.equal(Object.hasOwn(telemetry.details, 'value'), false)
  assert.equal(Object.hasOwn(rollups.details, 'value'), false)
  assert.equal(production.details.value, 0, 'a real supplied zero must be preserved')
})

test('source identity and actionable evidence survive evaluation', () => {
  const result = evaluateHealth({
    ci: {
      status: 'degraded',
      checkedAt: NOW,
      action: 'Open the failing workflow.',
      source: {
        kind: 'github_actions',
        id: 'run-123',
        url: 'https://github.com/ruddvz/garba/actions/runs/123',
      },
    },
  }, { nowMs: NOW })

  assert.deepEqual(result.actionable[0].source, {
    kind: 'github_actions',
    id: 'run-123',
    url: 'https://github.com/ruddvz/garba/actions/runs/123',
  })
})

test('default subsystem criticality keeps production/playback critical and analytics supporting', () => {
  const defaults = subsystemDefaults()
  assert.equal(defaults.production.criticality, 'critical')
  assert.equal(defaults.playback.criticality, 'critical')
  assert.equal(defaults.ci.criticality, 'important')
  assert.equal(defaults.telemetry.criticality, 'supporting')
})

test('all five public health statuses remain part of the stable model contract', () => {
  assert.deepEqual(HEALTH_STATUSES, ['healthy', 'degraded', 'stale', 'unknown', 'failed'])
})
