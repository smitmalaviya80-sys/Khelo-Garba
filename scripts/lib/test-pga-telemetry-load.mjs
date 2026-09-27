import assert from 'node:assert/strict'

import { MAX_BODY_BYTES } from '../../src/pga/backend/lib/constants.js'
import { validateBatch } from '../../src/pga/backend/lib/validation.js'
import {
  MAX_EXECUTION_CONCURRENCY,
  MAX_EXECUTION_RPS,
  assertSafeTarget,
  buildRequestSpec,
  buildScenarioPlan,
  heartbeatRequestsPerSecond,
  parseArgs,
  percentile,
} from '../load/pga-telemetry-load.mjs'

const NOW = Date.parse('2026-09-09T22:00:00Z')

function approx(actual, expected, tolerance = 0.001) {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} is not within ${tolerance} of ${expected}`)
}

function parseBody(spec) {
  return JSON.parse(spec.bodyText)
}

function expectValid(spec) {
  const body = parseBody(spec)
  const events = validateBatch(body, { nowMs: NOW })
  assert.equal(events.length, spec.logicalEvents)
  return events
}

approx(heartbeatRequestsPerSecond(1_000), 22.222222, 0.00001)
approx(heartbeatRequestsPerSecond(5_000), 111.111111, 0.00001)
approx(heartbeatRequestsPerSecond(10_000), 222.222222, 0.00001)

const steady1k = buildScenarioPlan({ scenario: 'steady', listeners: 1_000, durationMs: 45_000 })
assert.equal(steady1k.logicalRequests, 1_000)
assert.equal(steady1k.logicalEvents, 1_000)
assert.equal(steady1k.heartbeatRounds, 1)
assert.equal(steady1k.heartbeatRps, 22.222)

const steady10k = buildScenarioPlan({ scenario: 'steady', listeners: 10_000, durationMs: 90_000 })
assert.equal(steady10k.logicalRequests, 20_000)
assert.equal(steady10k.logicalEvents, 20_000)
assert.equal(steady10k.heartbeatRounds, 2)
assert.equal(steady10k.heartbeatRps, 222.222)

const burst = buildScenarioPlan({ scenario: 'navratri-burst', listeners: 1_000, durationMs: 45_000 })
assert.equal(burst.logicalRequests, 2_000)
assert.equal(burst.logicalEvents, 5_000)

const retry = buildScenarioPlan({ scenario: 'retry-storm', listeners: 1_000, retryAttempts: 3 })
assert.equal(retry.logicalRequests, 3_000)
assert.equal(retry.logicalEvents, 3_000)
assert.equal(retry.retryAttempts, 3)
assert.equal(retry.clientQueueBound, 100)

const invalid = buildScenarioPlan({ scenario: 'invalid-mix', listeners: 1_000, invalidRatio: 0.1 })
assert.equal(invalid.logicalRequests, 1_000)
assert.equal(invalid.expectedRejectedRequests, 100)

const steadySpec = buildRequestSpec({
  scenario: 'steady',
  index: 0,
  listeners: 1_000,
  durationMs: 45_000,
  nowMs: NOW,
})
const steadyEvents = expectValid(steadySpec)
assert.equal(steadyEvents[0].eventName, 'presence_heartbeat')
assert.equal(steadyEvents[0].playbackState, 'playing')

const burstSpec = buildRequestSpec({
  scenario: 'navratri-burst',
  index: 0,
  listeners: 1_000,
  durationMs: 45_000,
  nowMs: NOW,
})
const burstEvents = expectValid(burstSpec)
assert.deepEqual(burstEvents.map((event) => event.eventName), [
  'session_started',
  'search_submitted',
  'play_intent',
  'playback_started',
])
assert.ok(burstEvents[1].searchId)
assert.ok(burstEvents[2].playbackId)
assert.ok(burstEvents[3].playbackId)

const retryFirst = buildRequestSpec({
  scenario: 'retry-storm',
  index: 0,
  listeners: 1_000,
  retryAttempts: 3,
  nowMs: NOW,
})
const retrySecond = buildRequestSpec({
  scenario: 'retry-storm',
  index: 1_000,
  listeners: 1_000,
  retryAttempts: 3,
  nowMs: NOW,
})
expectValid(retryFirst)
expectValid(retrySecond)
assert.equal(retryFirst.logicalEventId, retrySecond.logicalEventId)
assert.equal(retryFirst.attempt, 1)
assert.equal(retrySecond.attempt, 2)

const invalidJson = buildRequestSpec({
  scenario: 'invalid-mix',
  index: 0,
  listeners: 1_000,
  invalidRatio: 0.1,
  nowMs: NOW,
})
assert.equal(invalidJson.kind, 'invalid_json')
assert.throws(() => JSON.parse(invalidJson.bodyText))

const oversized = buildRequestSpec({
  scenario: 'invalid-mix',
  index: 1,
  listeners: 1_000,
  invalidRatio: 0.1,
  nowMs: NOW,
})
assert.equal(oversized.kind, 'oversized_body')
assert.ok(Buffer.byteLength(oversized.bodyText, 'utf8') > MAX_BODY_BYTES)

const unknown = buildRequestSpec({
  scenario: 'invalid-mix',
  index: 2,
  listeners: 1_000,
  invalidRatio: 0.1,
  nowMs: NOW,
})
assert.equal(unknown.kind, 'unknown_event')
assert.throws(() => validateBatch(parseBody(unknown), { nowMs: NOW }), /invalid_event_name/)

const wrongOrigin = buildRequestSpec({
  scenario: 'invalid-mix',
  index: 3,
  listeners: 1_000,
  invalidRatio: 0.1,
  nowMs: NOW,
})
assert.equal(wrongOrigin.kind, 'wrong_origin')
expectValid(wrongOrigin)
assert.equal(wrongOrigin.headers.origin, 'https://invalid.example')

const stagingTarget = assertSafeTarget('https://example-staging.workers.dev', 'staging')
assert.equal(stagingTarget.pathname, '/v1/events')
assert.throws(() => assertSafeTarget('https://events.playgarba.com/v1/events', 'staging'), /Production host/)
assert.throws(() => assertSafeTarget('https://example-staging.workers.dev/v1/events', 'production'), /Production environment/)
assert.throws(() => assertSafeTarget('https://example-staging.workers.dev/other', 'staging'), /must be \/v1\/events/)

assert.equal(percentile([1, 2, 3, 4], 0.5), 2)
assert.equal(percentile([1, 2, 3, 4], 0.95), 4)
assert.equal(percentile([], 0.95), null)

const parsed = parseArgs([
  '--scenario', 'retry-storm',
  '--listeners', '5000',
  '--duration-seconds', '45',
  '--retry-attempts', '4',
  '--rps-cap', String(MAX_EXECUTION_RPS),
  '--concurrency', String(MAX_EXECUTION_CONCURRENCY),
])
assert.equal(parsed.scenario, 'retry-storm')
assert.equal(parsed.listeners, 5_000)
assert.equal(parsed.durationMs, 45_000)
assert.equal(parsed.retryAttempts, 4)
assert.equal(parsed.rpsCap, MAX_EXECUTION_RPS)
assert.equal(parsed.concurrency, MAX_EXECUTION_CONCURRENCY)
assert.throws(() => parseArgs(['--rps-cap', String(MAX_EXECUTION_RPS + 1)]), /between 1 and/)
assert.throws(() => parseArgs(['--concurrency', String(MAX_EXECUTION_CONCURRENCY + 1)]), /between 1 and/)
assert.throws(() => parseArgs(['--invalid-ratio', '0.75']), /between 0 and 0.5/)

console.log('✓ PGA telemetry load model tests passed')
console.log('✓ 1k/5k/10k heartbeat models remain 22.2/111.1/222.2 requests per second at the 45-second client cadence')
console.log('✓ generated valid fixtures pass the canonical backend schema; malformed variants stay deliberately invalid')
console.log('✓ production hosts and unbounded execution settings remain blocked')
