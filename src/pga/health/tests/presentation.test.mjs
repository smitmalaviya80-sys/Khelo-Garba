import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buildHealthPresentation,
  healthPresentationSubsystemOrder,
  sanitizeHealthSourceUrl,
} from '../presentation.js'

const NOW = Date.parse('2026-09-10T05:30:00.000Z')
const ORDER = ['production', 'playback', 'deployment', 'ci', 'catalogue', 'telemetry', 'rollups', 'pwa']
const LABELS = {
  production: 'Production',
  playback: 'Playback',
  deployment: 'Deployment',
  ci: 'CI',
  catalogue: 'Catalogue',
  telemetry: 'Telemetry',
  rollups: 'Rollups',
  pwa: 'PWA',
}
const CRITICALITY = {
  production: 'critical',
  playback: 'critical',
  deployment: 'important',
  ci: 'important',
  catalogue: 'important',
  telemetry: 'supporting',
  rollups: 'supporting',
  pwa: 'supporting',
}

function row(name, status = 'healthy', overrides = {}) {
  return {
    name,
    label: LABELS[name],
    criticality: CRITICALITY[name],
    status,
    checkedAt: NOW - 10_000,
    dataThroughAt: NOW - 12_000,
    freshnessAt: NOW - 12_000,
    summary: status === 'healthy' ? `${LABELS[name]} is healthy.` : `${LABELS[name]} needs attention.`,
    reasons: status === 'healthy' ? [] : [`${LABELS[name]} fixture reason.`],
    action: status === 'healthy' ? null : `Inspect ${LABELS[name]}.`,
    source: {
      kind: `${name}-fixture`,
      id: `${name}-1`,
      url: `https://example.com/${name}?token=secret#fragment`,
    },
    details: {},
    ...overrides,
  }
}

function snapshot(status = 'healthy', overrides = {}) {
  return {
    schemaVersion: 'pga-health-snapshot/v1',
    generatedAt: new Date(NOW - 1_000).toISOString(),
    evaluatedAt: NOW - 1_000,
    status,
    leadingSubsystem: status === 'healthy' ? 'production' : null,
    counts: {},
    actionable: [],
    subsystems: ORDER.map((name) => row(name)),
    ...overrides,
  }
}

function byName(model, name) {
  return model.subsystems.find((item) => item.name === name)
}

test('healthy snapshot becomes a complete scan-first eight-subsystem model', () => {
  const model = buildHealthPresentation(snapshot(), { nowMs: NOW })

  assert.equal(model.schemaVersion, 'pga-health-presentation/v1')
  assert.equal(model.status, 'healthy')
  assert.equal(model.statusLabel, 'Healthy')
  assert.equal(model.complete, true)
  assert.deepEqual(model.subsystems.map((item) => item.name), ORDER)
  assert.deepEqual(healthPresentationSubsystemOrder(), ORDER)
  assert.deepEqual(model.counts, { failed: 0, degraded: 0, stale: 0, unknown: 0 })
  assert.equal(model.problems.length, 0)
  assert.equal(model.actions.length, 0)
  assert.match(model.accessibilitySummary, /All eight canonical subsystems are healthy/)
})

test('critical failure stays failed and is presented first with its supplied action', () => {
  const input = snapshot('failed')
  input.leadingSubsystem = 'production'
  input.subsystems[0] = row('production', 'failed', {
    summary: 'Production is unreachable.',
    reasons: ['Production returned HTTP 503.'],
    action: 'Inspect production reachability.',
  })

  const model = buildHealthPresentation(input, { nowMs: NOW })

  assert.equal(model.status, 'failed')
  assert.equal(model.statusLabel, 'Failed')
  assert.equal(model.problems[0].subsystem, 'production')
  assert.equal(model.problems[0].reason, 'Production returned HTTP 503.')
  assert.equal(model.actions[0].action, 'Inspect production reachability.')
  assert.equal(byName(model, 'playback').status, 'healthy')
})

test('problem ordering uses status severity, then criticality, then canonical order', () => {
  const input = snapshot('degraded')
  input.subsystems = ORDER.map((name) => row(name))
  input.subsystems[1] = row('playback', 'unknown')
  input.subsystems[3] = row('ci', 'failed')
  input.subsystems[4] = row('catalogue', 'failed')
  input.subsystems[5] = row('telemetry', 'degraded')

  const model = buildHealthPresentation(input, { nowMs: NOW })

  assert.deepEqual(model.problems.map((item) => item.subsystem), ['ci', 'catalogue', 'telemetry', 'playback'])
  assert.deepEqual(model.counts, { failed: 2, degraded: 1, stale: 0, unknown: 1 })
  assert.match(model.accessibilitySummary, /CI: Failed/)
  assert.match(model.accessibilitySummary, /Playback: Unknown/)
})

test('stale evidence is labelled stale and freshness text uses only supplied timestamps', () => {
  const input = snapshot('stale')
  input.subsystems[6] = row('rollups', 'stale', {
    checkedAt: NOW - 2 * 60 * 60 * 1000,
    dataThroughAt: NOW - 3 * 60 * 60 * 1000,
    freshnessAt: NOW - 3 * 60 * 60 * 1000,
  })

  const model = buildHealthPresentation(input, { nowMs: NOW })
  const rollups = byName(model, 'rollups')

  assert.equal(model.status, 'stale')
  assert.equal(rollups.statusLabel, 'Stale')
  assert.equal(rollups.freshness.ageMs, 3 * 60 * 60 * 1000)
  assert.match(rollups.freshness.text, /^Stale · checked 2h ago · data through 3h ago$/)
})

test('future canonical freshness stays unknown instead of rendering as zero-age recency', () => {
  const input = snapshot('unknown')
  input.subsystems[5] = row('telemetry', 'unknown', {
    checkedAt: NOW - 10_000,
    dataThroughAt: NOW - 12_000,
    freshnessAt: NOW + 60_000,
    reasons: ['Evidence freshness timestamp is later than the evaluation clock.'],
  })

  const model = buildHealthPresentation(input, { nowMs: NOW })
  const telemetry = byName(model, 'telemetry')

  assert.equal(telemetry.status, 'unknown')
  assert.equal(telemetry.freshness.ageMs, null)
  assert.equal(telemetry.freshness.observedAt, new Date(NOW + 60_000).toISOString())
  assert.match(telemetry.freshness.text, /checked 10s ago/i)
  assert.match(telemetry.freshness.text, /data through 12s ago/i)
  assert.match(telemetry.freshness.text, /freshness time is ahead of evaluation clock/i)
})

test('future canonical freshness can coexist with truthful exact-now checked recency', () => {
  const input = snapshot('unknown')
  input.subsystems[5] = row('telemetry', 'unknown', {
    checkedAt: NOW,
    dataThroughAt: NOW - 12_000,
    freshnessAt: NOW + 60_000,
    reasons: ['Evidence freshness timestamp is later than the evaluation clock.'],
  })

  const model = buildHealthPresentation(input, { nowMs: NOW })
  const telemetry = byName(model, 'telemetry')

  assert.equal(telemetry.status, 'unknown')
  assert.equal(telemetry.freshness.ageMs, null)
  assert.equal(telemetry.freshness.observedAt, new Date(NOW + 60_000).toISOString())
  assert.match(telemetry.freshness.text, /checked 0s ago/i)
  assert.match(telemetry.freshness.text, /data through 12s ago/i)
  assert.match(telemetry.freshness.text, /freshness time is ahead of evaluation clock/i)
})

test('future checked and data-through timestamps use explicit ahead-of-clock copy', () => {
  const input = snapshot('unknown')
  input.subsystems[6] = row('rollups', 'unknown', {
    checkedAt: NOW + 10_000,
    dataThroughAt: NOW + 20_000,
    freshnessAt: null,
  })

  const model = buildHealthPresentation(input, { nowMs: NOW })
  const rollups = byName(model, 'rollups')

  assert.equal(rollups.freshness.ageMs, null)
  assert.match(rollups.freshness.text, /checked time is ahead of evaluation clock/i)
  assert.match(rollups.freshness.text, /data through time is ahead of evaluation clock/i)
  assert.doesNotMatch(rollups.freshness.text, /\b0s ago\b/)
})

test('missing canonical subsystem stays explicit unknown and prevents a green presentation', () => {
  const input = snapshot('healthy')
  input.subsystems = input.subsystems.filter((item) => item.name !== 'pwa')

  const model = buildHealthPresentation(input, { nowMs: NOW })
  const pwa = byName(model, 'pwa')

  assert.equal(model.complete, false)
  assert.equal(model.status, 'unknown')
  assert.equal(model.statusLabel, 'Unknown')
  assert.equal(pwa.status, 'unknown')
  assert.match(pwa.reasons[0], /No canonical subsystem evidence/)
  assert.doesNotMatch(model.summary, /all eight.*healthy/i)
})

test('wrong-schema and malformed snapshots cannot become healthy', () => {
  for (const input of [null, {}, { schemaVersion: 'pga-health-snapshot/v0', status: 'healthy', subsystems: [] }]) {
    const model = buildHealthPresentation(input, { nowMs: NOW })
    assert.equal(model.status, 'unknown')
    assert.equal(model.complete, false)
    assert.equal(model.subsystems.length, 8)
    assert.equal(model.counts.unknown, 8)
  }
})

test('a contradictory healthy snapshot never gets all-good presentation copy', () => {
  const input = snapshot('healthy')
  input.subsystems[0] = row('production', 'failed')

  const model = buildHealthPresentation(input, { nowMs: NOW })

  assert.notEqual(model.statusLabel, 'Healthy')
  assert.doesNotMatch(model.summary, /all eight.*healthy/i)
})

test('source links retain only HTTPS origin/path and remove credentials, query and fragment', () => {
  assert.equal(
    sanitizeHealthSourceUrl('https://user:password@example.com/path/to/run?token=secret#logs'),
    'https://example.com/path/to/run',
  )
  assert.equal(sanitizeHealthSourceUrl('http://example.com/run'), null)
  assert.equal(sanitizeHealthSourceUrl('javascript:alert(1)'), null)

  const input = snapshot('degraded')
  input.subsystems[3] = row('ci', 'degraded', {
    source: { kind: 'github', id: 'run-1', url: 'https://user:secret@example.com/actions/1?token=hidden#step' },
  })
  const model = buildHealthPresentation(input, { nowMs: NOW })
  assert.equal(byName(model, 'ci').source.url, 'https://example.com/actions/1')
})

test('bounded safe details preserve explicit zero, preserve absence and strip uncontrolled error text', () => {
  const input = snapshot('degraded')
  input.subsystems[4] = row('catalogue', 'degraded', {
    details: {
      errors: 0,
      warnings: 2,
      error: 'DO_NOT_EXPOSE_RAW_ERROR',
      token: 'DO_NOT_EXPOSE_TOKEN',
    },
  })

  const model = buildHealthPresentation(input, { nowMs: NOW })
  const details = byName(model, 'catalogue').details

  assert.equal(details.errors, 0)
  assert.equal(details.warnings, 2)
  assert.equal(Object.hasOwn(details, 'value'), false)
  assert.doesNotMatch(JSON.stringify(model), /DO_NOT_EXPOSE_RAW_ERROR|DO_NOT_EXPOSE_TOKEN/)
})

test('actions are never invented when source evidence supplied none', () => {
  const input = snapshot('degraded')
  input.subsystems[5] = row('telemetry', 'degraded', { action: null })

  const model = buildHealthPresentation(input, { nowMs: NOW })

  assert.equal(model.problems[0].subsystem, 'telemetry')
  assert.equal(model.problems[0].action, null)
  assert.deepEqual(model.actions, [])
})

test('unknown extra subsystem cannot displace or rename canonical rows', () => {
  const input = snapshot('healthy')
  input.subsystems.unshift({
    name: 'secret-internal-system',
    label: 'Do not render',
    status: 'failed',
    criticality: 'critical',
  })

  const model = buildHealthPresentation(input, { nowMs: NOW })

  assert.deepEqual(model.subsystems.map((item) => item.name), ORDER)
  assert.equal(model.subsystems.some((item) => item.name === 'secret-internal-system'), false)
})

test('numeric zero remains a valid presentation evaluation clock', () => {
  const input = snapshot('healthy')
  input.subsystems = input.subsystems.map((item) => ({
    ...item,
    checkedAt: 0,
    dataThroughAt: 0,
    freshnessAt: 0,
  }))

  const model = buildHealthPresentation(input, { nowMs: 0 })

  assert.equal(model.status, 'healthy')
  assert.equal(byName(model, 'production').freshness.ageMs, 0)
  assert.match(byName(model, 'production').freshness.text, /checked 0s ago/)
})

test('coercible non-number and non-finite presentation clocks fail closed', () => {
  for (const nowMs of ['0', '', false, true, null, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
    assert.throws(
      () => buildHealthPresentation(snapshot(), { nowMs }),
      /invalid_health_presentation_time/,
      `expected ${String(nowMs)} (${typeof nowMs}) to be rejected`,
    )
  }
})
