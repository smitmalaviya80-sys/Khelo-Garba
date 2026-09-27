import test from 'node:test'
import assert from 'node:assert/strict'

import {
  IST_OFFSET_MS,
  istDateKey,
  istDayBounds,
  previousClosedIstDate,
  shiftIstDate,
} from '../lib/time.js'

const DAY_MS = 24 * 60 * 60 * 1000

test('valid IST calendar dates preserve exact UTC day bounds', () => {
  const bounds = istDayBounds('2026-09-10')

  assert.equal(IST_OFFSET_MS, 19_800_000)
  assert.equal(new Date(bounds.startUtcMs).toISOString(), '2026-09-09T18:30:00.000Z')
  assert.equal(new Date(bounds.endUtcMs).toISOString(), '2026-09-10T18:30:00.000Z')
  assert.equal(bounds.endUtcMs - bounds.startUtcMs, DAY_MS)
  assert.equal(istDateKey(bounds.startUtcMs), '2026-09-10')
})

test('real Gregorian leap dates remain valid', () => {
  const bounds = istDayBounds('2024-02-29')

  assert.equal(new Date(bounds.startUtcMs).toISOString(), '2024-02-28T18:30:00.000Z')
  assert.equal(new Date(bounds.endUtcMs).toISOString(), '2024-02-29T18:30:00.000Z')
  assert.equal(shiftIstDate('2024-02-29', 1), '2024-03-01')
  assert.equal(shiftIstDate('2024-03-01', -1), '2024-02-29')
})

test('impossible Gregorian dates are rejected instead of normalizing into another day', () => {
  const impossible = [
    '2026-02-29',
    '2026-02-30',
    '2026-02-31',
    '2026-04-31',
    '2026-06-31',
    '2026-09-31',
    '2026-11-31',
    '2026-00-10',
    '2026-13-10',
    '2026-01-00',
    '2026-01-32',
  ]

  for (const dateKey of impossible) {
    assert.throws(
      () => istDayBounds(dateKey),
      /Invalid IST date key/,
      `${dateKey} must fail closed`,
    )
  }
})

test('IST date keys require the exact YYYY-MM-DD representation', () => {
  const malformed = [
    '2026-9-10',
    '26-09-10',
    '2026/09/10',
    '2026-09-10T00:00:00Z',
    ' 2026-09-10',
    '2026-09-10 ',
    '',
    null,
    undefined,
    20260910,
  ]

  for (const dateKey of malformed) {
    assert.throws(() => istDayBounds(dateKey), /Invalid IST date key/)
  }
})

test('month and year transitions keep existing IST repair semantics', () => {
  assert.equal(shiftIstDate('2026-01-31', 1), '2026-02-01')
  assert.equal(shiftIstDate('2025-12-31', 1), '2026-01-01')
  assert.equal(shiftIstDate('2026-01-01', -1), '2025-12-31')

  const nowMs = Date.parse('2026-09-10T18:29:59.999Z')
  assert.equal(previousClosedIstDate(nowMs), '2026-09-09')
})
