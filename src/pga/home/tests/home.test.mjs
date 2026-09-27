import test from 'node:test'
import assert from 'node:assert/strict'

import {
  HOME_STATES,
  buildHomeSnapshot,
  compareKpis,
  evaluateKpi,
  formatCompactNumber,
  summarizeTrend,
} from '../model.js'

const NOW = Date.parse('2026-09-10T04:00:00Z')

test('Home state vocabulary is stable and complete', () => {
  assert.deepEqual(HOME_STATES, [
    'loading',
    'available',
    'partial',
    'stale',
    'unavailable',
    'offline',
    'auth-expired',
    'error',
  ])
})

test('real zero stays a real available zero', () => {
  const metric = evaluateKpi({ status: 'available', value: 0 }, { nowMs: NOW })
  assert.equal(metric.status, 'available')
  assert.equal(metric.value, 0)
  assert.equal(metric.exactValue, 0)
  assert.equal(metric.displayValue, '0')
  assert.equal(metric.zeroData, true)
})

test('unavailable and loading evidence never manufacture zero', () => {
  for (const status of ['unavailable', 'loading', 'offline', 'auth-expired', 'error']) {
    const metric = evaluateKpi({ status }, { nowMs: NOW })
    assert.equal(metric.status, status)
    assert.equal(metric.value, null)
    assert.equal(metric.exactValue, null)
    assert.equal(metric.displayValue, '—')
    assert.equal(metric.zeroData, false)
  }
})

test('available state without a value becomes unavailable rather than zero', () => {
  const metric = evaluateKpi({ status: 'available' }, { nowMs: NOW })
  assert.equal(metric.status, 'unavailable')
  assert.equal(metric.value, null)
  assert.match(metric.reason, /unavailable/i)
})

test('coercible non-number KPI values fail closed instead of becoming zero', () => {
  for (const value of [null, '', '0', '12', false, true, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
    const metric = evaluateKpi({ status: 'available', value }, { nowMs: NOW })
    assert.equal(metric.status, 'error', `value ${String(value)} must fail closed`)
    assert.equal(metric.value, null)
    assert.equal(metric.exactValue, null)
    assert.equal(metric.displayValue, '—')
    assert.equal(metric.zeroData, false)
  }

  assert.equal(formatCompactNumber(null), '—')
  assert.equal(formatCompactNumber('0'), '—')
  assert.equal(formatCompactNumber(false), '—')
})

test('partial Home evidence preserves valid subset without filling missing metrics', () => {
  const snapshot = buildHomeSnapshot({
    status: 'partial',
    metrics: {
      liveNow: { status: 'available', value: 7 },
      sessions: { status: 'available', value: 0 },
      confirmedStarts: {},
    },
  }, { nowMs: NOW })

  assert.equal(snapshot.status, 'partial')
  assert.equal(snapshot.metrics.liveNow.value, 7)
  assert.equal(snapshot.metrics.sessions.value, 0)
  assert.equal(snapshot.metrics.confirmedStarts.value, null)
  assert.equal(snapshot.availableMetricCount, 2)
  assert.equal(snapshot.missingMetricCount, 1)
})

test('explicit freshness budget turns old available evidence stale while retaining value', () => {
  const metric = evaluateKpi({
    status: 'available',
    value: 4,
    dataThroughAt: NOW - 121_000,
    freshnessBudgetMs: 120_000,
  }, { nowMs: NOW })

  assert.equal(metric.status, 'stale')
  assert.equal(metric.value, 4)
  assert.equal(metric.ageMs, 121_000)
})

test('no freshness budget means the model never invents a stale timeout', () => {
  const metric = evaluateKpi({
    status: 'available',
    value: 4,
    dataThroughAt: NOW - 86_400_000,
  }, { nowMs: NOW })

  assert.equal(metric.status, 'available')
  assert.equal(metric.value, 4)
})

test('supplied malformed freshness budgets fail closed instead of disabling stale checks', () => {
  for (const freshnessBudgetMs of [null, '', '120000', false, Number.NaN, Number.POSITIVE_INFINITY, -1]) {
    const metric = evaluateKpi({
      status: 'available',
      value: 4,
      dataThroughAt: NOW - 121_000,
      freshnessBudgetMs,
    }, { nowMs: NOW })
    assert.equal(metric.status, 'error', `budget ${String(freshnessBudgetMs)} must fail closed`)
    assert.equal(metric.value, null)
    assert.equal(metric.zeroData, false)
    assert.match(metric.reason, /freshness budget/i)
  }
})

test('negative and non-finite values fail closed instead of being coerced', () => {
  for (const value of [-1, Number.NaN, Number.POSITIVE_INFINITY]) {
    const metric = evaluateKpi({ status: 'available', value }, { nowMs: NOW })
    assert.equal(metric.status, 'error')
    assert.equal(metric.value, null)
    assert.equal(metric.displayValue, '—')
  }
})

test('precision, sampling and evidence metadata are preserved', () => {
  const metric = evaluateKpi({
    status: 'available',
    value: 12,
    checkedAt: NOW - 100,
    dataThroughAt: NOW - 200,
    precision: 'estimated',
    sampled: true,
    source: { kind: 'analytics-engine', id: 'presence-v1', url: 'https://example.test/evidence' },
    action: 'Inspect telemetry freshness.',
  }, { nowMs: NOW })

  assert.equal(metric.precision, 'estimated')
  assert.equal(metric.sampled, true)
  assert.equal(metric.checkedAt, NOW - 100)
  assert.equal(metric.dataThroughAt, NOW - 200)
  assert.equal(metric.source.id, 'presence-v1')
  assert.equal(metric.action, 'Inspect telemetry freshness.')
})

test('sampling metadata preserves absent and explicit boolean truth', () => {
  const absent = evaluateKpi({ status: 'available', value: 1 }, { nowMs: NOW })
  assert.equal(absent.sampled, false)
  assert.equal(absent.precision, null)

  const exact = evaluateKpi({ status: 'available', value: 1, sampled: false }, { nowMs: NOW })
  assert.equal(exact.sampled, false)
  assert.equal(exact.precision, null)

  const estimated = evaluateKpi({ status: 'available', value: 1, sampled: true }, { nowMs: NOW })
  assert.equal(estimated.sampled, true)
  assert.equal(estimated.precision, 'estimated')

  assert.equal(buildHomeSnapshot({ status: 'available', sampled: false }, { nowMs: NOW }).sampled, false)
  assert.equal(buildHomeSnapshot({ status: 'available', sampled: true }, { nowMs: NOW }).sampled, true)
  assert.equal(buildHomeSnapshot({ status: 'available' }, { nowMs: NOW }).sampled, false)
})

test('malformed sampling metadata stays unknown and cannot infer estimated precision', () => {
  const malformed = ['false', '0', 0, 1, null, {}, [], Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]

  for (const sampled of malformed) {
    const metric = evaluateKpi({ status: 'available', value: 1, sampled }, { nowMs: NOW })
    assert.equal(metric.sampled, null, `sampled ${String(sampled)} must remain unknown`)
    assert.equal(metric.precision, null, `sampled ${String(sampled)} must not infer precision`)

    const explicitPrecision = evaluateKpi({
      status: 'available',
      value: 1,
      sampled,
      precision: 'source-estimate',
    }, { nowMs: NOW })
    assert.equal(explicitPrecision.sampled, null)
    assert.equal(explicitPrecision.precision, 'source-estimate')

    const snapshot = buildHomeSnapshot({ status: 'available', sampled }, { nowMs: NOW })
    assert.equal(snapshot.sampled, null, `snapshot sampled ${String(sampled)} must remain unknown`)
  }
})

test('normal comparisons calculate positive, negative and flat percentage deltas', () => {
  const up = compareKpis(
    { status: 'available', value: 15 },
    { status: 'available', value: 10 },
    { nowMs: NOW },
  )
  assert.equal(up.direction, 'up')
  assert.equal(up.delta, 5)
  assert.equal(up.percent, 50)
  assert.equal(up.label, '+50% vs prior period')

  const down = compareKpis(
    { status: 'available', value: 8 },
    { status: 'available', value: 10 },
    { nowMs: NOW },
  )
  assert.equal(down.direction, 'down')
  assert.equal(down.percent, -20)

  const flat = compareKpis(
    { status: 'available', value: 10 },
    { status: 'available', value: 10 },
    { nowMs: NOW },
  )
  assert.equal(flat.direction, 'flat')
  assert.equal(flat.percent, 0)
  assert.equal(flat.label, 'No change')
})

test('zero prior with positive current is new activity, never Infinity', () => {
  const comparison = compareKpis(
    { status: 'available', value: 5 },
    { status: 'available', value: 0 },
    { nowMs: NOW },
  )

  assert.equal(comparison.status, 'new-activity')
  assert.equal(comparison.direction, 'up')
  assert.equal(comparison.delta, 5)
  assert.equal(comparison.percent, null)
  assert.equal(comparison.label, 'New activity')
})

test('zero prior and zero current is a truthful flat comparison', () => {
  const comparison = compareKpis(
    { status: 'available', value: 0 },
    { status: 'available', value: 0 },
    { nowMs: NOW },
  )

  assert.equal(comparison.status, 'comparable')
  assert.equal(comparison.direction, 'flat')
  assert.equal(comparison.delta, 0)
  assert.equal(comparison.percent, 0)
})

test('missing prior evidence suppresses comparison', () => {
  const comparison = compareKpis(
    { status: 'available', value: 5 },
    { status: 'unavailable' },
    { nowMs: NOW },
  )

  assert.equal(comparison.status, 'unavailable')
  assert.equal(comparison.percent, null)
  assert.equal(comparison.delta, null)
})

test('compact formatting keeps an exact numeric value alongside presentation text', () => {
  const metric = evaluateKpi({ status: 'available', value: 12_500 }, { nowMs: NOW })
  assert.equal(metric.exactValue, 12_500)
  assert.equal(metric.displayValue, '12.5K')
  assert.equal(formatCompactNumber(1_000), '1K')
  assert.equal(formatCompactNumber(1_250_000), '1.3M')
})

test('trend summaries are text-first for rising, falling and flat activity', () => {
  const rising = summarizeTrend([2, 4, 5], { label: 'Live sessions' })
  assert.equal(rising.direction, 'up')
  assert.match(rising.text, /rose from 2 to 5/)
  assert.match(rising.text, /range 2–5/)

  const falling = summarizeTrend([{ liveNow: 7 }, { liveNow: 3 }], {
    label: 'Live sessions',
    valueKey: 'liveNow',
  })
  assert.equal(falling.direction, 'down')
  assert.match(falling.text, /fell from 7 to 3/)

  const flat = summarizeTrend([3, 3, 3], { label: 'Sessions' })
  assert.equal(flat.direction, 'flat')
  assert.match(flat.text, /stayed flat at 3/)
})

test('trend summary reports insufficient evidence instead of inventing direction', () => {
  const summary = summarizeTrend([4], { label: 'Live sessions' })
  assert.equal(summary.status, 'insufficient')
  assert.equal(summary.direction, 'unknown')
  assert.match(summary.text, /at least two valid points/)
})

test('Home snapshot evaluation time must be a finite number', () => {
  assert.throws(() => buildHomeSnapshot({ status: 'available', metrics: {} }, { nowMs: '123' }), /finite number/)
  assert.throws(() => buildHomeSnapshot({ status: 'available', metrics: {} }, { nowMs: Number.NaN }), /finite number/)
})
