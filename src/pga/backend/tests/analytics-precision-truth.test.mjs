import test from 'node:test'
import assert from 'node:assert/strict'

import { precisionFromRows } from '../lib/analytics.js'

test('absent and null sampling metadata preserve the unsampled exact fallback', () => {
  assert.deepEqual(precisionFromRows([]), { sampled: false, precision: 'exact' })
  assert.deepEqual(precisionFromRows([{}]), { sampled: false, precision: 'exact' })
  assert.deepEqual(precisionFromRows([{ max_sample_interval: null }]), { sampled: false, precision: 'exact' })
  assert.deepEqual(precisionFromRows([{ max_sample_interval: undefined }]), { sampled: false, precision: 'exact' })
})

test('explicit finite sampling intervals preserve exact and estimated precision truth', () => {
  assert.deepEqual(precisionFromRows([{ max_sample_interval: 1 }]), { sampled: false, precision: 'exact' })
  assert.deepEqual(precisionFromRows([{ max_sample_interval: 2 }]), { sampled: true, precision: 'estimated' })
  assert.deepEqual(
    precisionFromRows([{ max_sample_interval: 1 }, { max_sample_interval: 3 }]),
    { sampled: true, precision: 'estimated' },
  )
  assert.deepEqual(precisionFromRows([{ max_sample_interval: 1.5 }]), { sampled: true, precision: 'estimated' })
})

test('coercible and invalid explicit sampling metadata fails closed', () => {
  const invalidValues = [
    '1',
    '2',
    '',
    true,
    false,
    0,
    -1,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    Number.NEGATIVE_INFINITY,
    {},
    [],
  ]

  for (const value of invalidValues) {
    assert.throws(
      () => precisionFromRows([{ max_sample_interval: value }]),
      /analytics_precision_invalid_sample_interval/,
      `expected ${String(value)} (${typeof value}) to fail closed`,
    )
  }
})

test('one malformed row fails the whole precision decision instead of publishing another valid row', () => {
  assert.throws(
    () => precisionFromRows([
      { max_sample_interval: 4 },
      { max_sample_interval: '1' },
      { max_sample_interval: 1 },
    ]),
    /analytics_precision_invalid_sample_interval/,
  )
})
