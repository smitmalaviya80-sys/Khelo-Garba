import test from 'node:test'
import assert from 'node:assert/strict'

import { getDailySeries, getLifetimeMetrics, replaceDailyMetrics, setRollupRun } from '../lib/d1.js'

class FakeStatement {
  constructor(db, sql, args = []) {
    this.db = db
    this.sql = sql
    this.args = args
  }

  bind(...args) {
    return new FakeStatement(this.db, this.sql, args)
  }

  async run() {
    this.db.runs.push({ sql: this.sql, args: this.args })
    return { success: true }
  }

  async all() {
    this.db.alls.push({ sql: this.sql, args: this.args })
    return { results: this.db.results }
  }
}

class FakeDb {
  constructor(results = []) {
    this.batches = []
    this.runs = []
    this.alls = []
    this.results = results
  }

  prepare(sql) {
    return new FakeStatement(this, sql)
  }

  async batch(statements) {
    this.batches.push(statements.map((statement) => ({ sql: statement.sql, args: statement.args })))
    return []
  }
}

const META = {
  precision: 'exact',
  sampled: false,
  dataThroughMs: 0,
  schemaVersion: 'test-schema',
  updatedAt: '2026-09-10T00:00:00.000Z',
}

test('replaceDailyMetrics preserves finite numeric values including zero', async () => {
  const db = new FakeDb()
  const count = await replaceDailyMetrics(
    db,
    '2026-09-10',
    { sessions: 0, listening_ms: 125.5 },
    META,
  )

  assert.equal(count, 2)
  assert.equal(db.batches.length, 1)
  const inserts = db.batches[0].filter(({ sql }) => sql.startsWith('INSERT INTO daily_metrics'))
  assert.deepEqual(inserts.map(({ args }) => args[4]), [0, 125.5])
  assert.deepEqual(inserts.map(({ args }) => args[7]), [0, 0])
})

test('replaceDailyMetrics rejects coercible and non-finite metric values before mutation', async () => {
  const invalidValues = [true, false, '', '12', null, undefined, NaN, Infinity, -Infinity]

  for (const value of invalidValues) {
    const db = new FakeDb()
    await assert.rejects(
      replaceDailyMetrics(db, '2026-09-10', { sessions: 10, listening_ms: value }, META),
      /invalid_metric_value/,
    )
    assert.equal(db.batches.length, 0, `unexpected D1 batch for ${String(value)}`)
    assert.equal(db.runs.length, 0, `unexpected D1 run for ${String(value)}`)
  }
})

test('replaceDailyMetrics accepts absent freshness and finite non-negative numeric freshness', async () => {
  const cases = [
    [{}, null],
    [{ dataThroughMs: null }, null],
    [{ dataThroughMs: 0 }, 0],
    [{ dataThroughMs: 1_789_034_000_000 }, 1_789_034_000_000],
  ]

  for (const [meta, expected] of cases) {
    const db = new FakeDb()
    await replaceDailyMetrics(db, '2026-09-10', { sessions: 1 }, {
      precision: 'exact',
      sampled: false,
      updatedAt: META.updatedAt,
      ...meta,
    })
    const insert = db.batches[0].find(({ sql }) => sql.startsWith('INSERT INTO daily_metrics'))
    assert.equal(insert.args[7], expected)
  }
})

test('replaceDailyMetrics rejects malformed explicit freshness before mutation', async () => {
  const invalidValues = [true, false, '', '0', NaN, Infinity, -Infinity, -1]

  for (const value of invalidValues) {
    const db = new FakeDb()
    await assert.rejects(
      replaceDailyMetrics(db, '2026-09-10', { sessions: 1 }, { ...META, dataThroughMs: value }),
      /invalid_data_through_ms/,
    )
    assert.equal(db.batches.length, 0, `unexpected D1 batch for ${String(value)}`)
  }
})

test('setRollupRun preserves optional and valid numeric freshness', async () => {
  const cases = [
    [{}, null],
    [{ dataThroughMs: null }, null],
    [{ dataThroughMs: 0 }, 0],
    [{ dataThroughMs: 1_789_034_000_000 }, 1_789_034_000_000],
  ]

  for (const [options, expected] of cases) {
    const db = new FakeDb()
    await setRollupRun(db, '2026-09-10', 'complete', {
      nowMs: 0,
      startedAt: '1970-01-01T00:00:00.000Z',
      ...options,
    })
    assert.equal(db.runs.length, 1)
    assert.equal(db.runs[0].args[5], expected)
  }
})

test('setRollupRun rejects malformed explicit freshness before mutation', async () => {
  const invalidValues = [true, false, '', '0', NaN, Infinity, -Infinity, -1]

  for (const value of invalidValues) {
    const db = new FakeDb()
    await assert.rejects(
      setRollupRun(db, '2026-09-10', 'complete', { nowMs: 0, dataThroughMs: value }),
      /invalid_data_through_ms/,
    )
    assert.equal(db.runs.length, 0, `unexpected D1 run for ${String(value)}`)
    assert.equal(db.batches.length, 0, `unexpected D1 batch for ${String(value)}`)
  }
})

test('setRollupRun preserves omitted and valid numeric evaluation clocks', async () => {
  const zeroDb = new FakeDb()
  await setRollupRun(zeroDb, '2026-09-10', 'complete', { nowMs: 0 })
  assert.equal(zeroDb.runs[0].args[3], '1970-01-01T00:00:00.000Z')
  assert.equal(zeroDb.runs[0].args[7], '1970-01-01T00:00:00.000Z')

  const positiveNowMs = 1_789_034_000_000
  const positiveDb = new FakeDb()
  await setRollupRun(positiveDb, '2026-09-10', 'complete', { nowMs: positiveNowMs })
  assert.equal(positiveDb.runs[0].args[7], new Date(positiveNowMs).toISOString())

  const defaultDb = new FakeDb()
  const before = Date.now()
  await setRollupRun(defaultDb, '2026-09-10', 'running')
  const after = Date.now()
  const persistedNow = Date.parse(defaultDb.runs[0].args[7])
  assert.ok(persistedNow >= before && persistedNow <= after)
})

test('setRollupRun rejects malformed explicit evaluation clocks before mutation', async () => {
  const invalidValues = [
    null,
    true,
    false,
    '',
    '0',
    '1789034000000',
    NaN,
    Infinity,
    -Infinity,
    -1,
    8_640_000_000_000_001,
  ]

  for (const value of invalidValues) {
    const db = new FakeDb()
    await assert.rejects(
      setRollupRun(db, '2026-09-10', 'complete', { nowMs: value }),
      /invalid_rollup_time/,
    )
    assert.equal(db.runs.length, 0, `unexpected D1 run for ${String(value)}`)
    assert.equal(db.batches.length, 0, `unexpected D1 batch for ${String(value)}`)
  }
})

test('getLifetimeMetrics preserves explicit numeric zero, sampling flags and max freshness', async () => {
  const db = new FakeDb([
    { metric: 'sessions', value: 0, sampled: 0, data_through_ms: null },
    { metric: 'listening_ms', value: 125.5, sampled: 1, data_through_ms: 1_789_034_000_000 },
  ])

  const result = await getLifetimeMetrics(db)

  assert.deepEqual(result, {
    data: {
      sessions: { value: 0, sampled: false, precision: 'exact' },
      listening_ms: { value: 125.5, sampled: true, precision: 'estimated' },
    },
    dataThroughMs: 1_789_034_000_000,
  })
  assert.equal(db.alls.length, 1)
})

test('getDailySeries preserves valid numeric rows and chronological presentation', async () => {
  const db = new FakeDb([
    { day_ist: '2026-09-10', value: 12.5, precision: 'estimated', sampled: 1, data_through_ms: 1_789_034_000_000 },
    { day_ist: '2026-09-09', value: 0, precision: 'exact', sampled: 0, data_through_ms: null },
  ])

  const result = await getDailySeries(db, 'sessions', 2)

  assert.deepEqual(result, [
    { day: '2026-09-09', value: 0, precision: 'exact', sampled: false, dataThroughMs: null },
    { day: '2026-09-10', value: 12.5, precision: 'estimated', sampled: true, dataThroughMs: 1_789_034_000_000 },
  ])
  assert.deepEqual(db.alls[0].args, ['sessions', 2])
})

test('D1 read helpers reject coercible, null and non-finite metric values', async () => {
  const invalidValues = ['0', '', true, false, null, undefined, NaN, Infinity, -Infinity]

  for (const value of invalidValues) {
    const lifetimeDb = new FakeDb([{ metric: 'sessions', value, sampled: 0, data_through_ms: null }])
    await assert.rejects(getLifetimeMetrics(lifetimeDb), /invalid_metric_value/)

    const dailyDb = new FakeDb([{ day_ist: '2026-09-10', value, precision: 'exact', sampled: 0, data_through_ms: null }])
    await assert.rejects(getDailySeries(dailyDb, 'sessions', 1), /invalid_metric_value/)
  }
})

test('D1 read helpers accept only explicit sampled integers 0 or 1', async () => {
  for (const sampled of [0, 1]) {
    const lifetime = await getLifetimeMetrics(new FakeDb([
      { metric: 'sessions', value: 1, sampled, data_through_ms: null },
    ]))
    assert.equal(lifetime.data.sessions.sampled, sampled === 1)
  }

  const invalidValues = ['0', '1', '', true, false, null, undefined, NaN, Infinity, -1, 2]
  for (const sampled of invalidValues) {
    const lifetimeDb = new FakeDb([{ metric: 'sessions', value: 1, sampled, data_through_ms: null }])
    await assert.rejects(getLifetimeMetrics(lifetimeDb), /invalid_sampled_value/)

    const dailyDb = new FakeDb([{ day_ist: '2026-09-10', value: 1, precision: 'exact', sampled, data_through_ms: null }])
    await assert.rejects(getDailySeries(dailyDb, 'sessions', 1), /invalid_sampled_value/)
  }
})

test('D1 read helpers reject malformed explicit freshness while preserving absent or null freshness', async () => {
  const absentLifetime = await getLifetimeMetrics(new FakeDb([
    { metric: 'sessions', value: 1, sampled: 0 },
  ]))
  assert.equal(absentLifetime.dataThroughMs, null)

  const nullDaily = await getDailySeries(new FakeDb([
    { day_ist: '2026-09-10', value: 1, precision: 'exact', sampled: 0, data_through_ms: null },
  ]), 'sessions', 1)
  assert.equal(nullDaily[0].dataThroughMs, null)

  const invalidValues = ['0', '', true, false, undefined, NaN, Infinity, -Infinity, -1]
  for (const dataThroughMs of invalidValues) {
    const lifetimeDb = new FakeDb([{ metric: 'sessions', value: 1, sampled: 0, data_through_ms: dataThroughMs }])
    await assert.rejects(getLifetimeMetrics(lifetimeDb), /invalid_data_through_ms/)

    const dailyDb = new FakeDb([{ day_ist: '2026-09-10', value: 1, precision: 'exact', sampled: 0, data_through_ms: dataThroughMs }])
    await assert.rejects(getDailySeries(dailyDb, 'sessions', 1), /invalid_data_through_ms/)
  }
})
