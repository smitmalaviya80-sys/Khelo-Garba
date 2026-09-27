import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  RUN_METRIC_SCHEMA_VERSION,
  aggregateRunMetrics,
  appendRunMetric,
  normalizeRunMetric,
  readRunMetrics
} from './raas-run-metrics.mjs'

function metric(overrides = {}) {
  return {
    schemaVersion: RUN_METRIC_SCHEMA_VERSION,
    tier: 'standard',
    routesMatched: 2,
    sourcesLoaded: 3,
    contextChars: 12000,
    graphNodes: 8,
    toolQueries: 7,
    providerQueries: 1,
    cacheHits: 2,
    cacheMisses: 3,
    agentCount: 1,
    validationCommands: 4,
    repairRounds: 1,
    reviewerFindings: 2,
    completionState: 'completed',
    ...overrides
  }
}

{
  const normalized = normalizeRunMetric(metric())
  assert.deepEqual(normalized, metric())
  assert.equal(Object.isFrozen(normalized), true)
}

{
  for (const tier of ['fast', 'standard', 'deep', 'critical']) {
    assert.equal(normalizeRunMetric(metric({ tier })).tier, tier)
  }
  for (const completionState of ['completed', 'blocked', 'partial', 'failed', 'cancelled']) {
    assert.equal(normalizeRunMetric(metric({ completionState })).completionState, completionState)
  }
}

{
  for (const [field, value] of [
    ['routesMatched', -1],
    ['sourcesLoaded', 1.5],
    ['contextChars', '12000'],
    ['graphNodes', Number.NaN],
    ['toolQueries', Number.POSITIVE_INFINITY],
    ['providerQueries', Number.MAX_SAFE_INTEGER + 1]
  ]) {
    assert.throws(() => normalizeRunMetric(metric({ [field]: value })), new RegExp(field))
  }
  assert.throws(() => normalizeRunMetric(metric({ tier: 'turbo' })), /Invalid RAAS run-metrics tier/)
  assert.throws(() => normalizeRunMetric(metric({ completionState: 'done-ish' })), /completionState/)
  assert.throws(() => normalizeRunMetric(metric({ schemaVersion: 'raas-run-metrics/v2' })), /Unsupported RAAS run-metrics schema/)
}

{
  const missing = metric()
  delete missing.cacheHits
  assert.throws(() => normalizeRunMetric(missing), /missing required field: cacheHits/)
}

{
  for (const [field, value] of [
    ['prompt', 'Fix the private production incident'],
    ['rawPrompt', 'secret task text'],
    ['userPrompt', 'user text'],
    ['input', { token: 'secret' }],
    ['privateData', { email: 'person@example.com' }],
    ['messages', ['private chat']],
    ['filePath', 'src/private.js'],
    ['sourceNames', ['provider-a']]
  ]) {
    assert.throws(() => normalizeRunMetric(metric({ [field]: value })), new RegExp(`unknown/private field: ${field}`))
  }
}

{
  const records = [
    metric({ tier: 'fast', routesMatched: 1, sourcesLoaded: 1, contextChars: 2500, graphNodes: 0, toolQueries: 2, providerQueries: 0, cacheHits: 3, cacheMisses: 1, agentCount: 1, validationCommands: 1, repairRounds: 0, reviewerFindings: 0, completionState: 'completed' }),
    metric({ tier: 'critical', routesMatched: 4, sourcesLoaded: 8, contextChars: 30000, graphNodes: 15, toolQueries: 12, providerQueries: 3, cacheHits: 5, cacheMisses: 4, agentCount: 2, validationCommands: 7, repairRounds: 2, reviewerFindings: 3, completionState: 'blocked' })
  ]
  const aggregate = aggregateRunMetrics(records)
  assert.equal(aggregate.schemaVersion, `${RUN_METRIC_SCHEMA_VERSION}/aggregate`)
  assert.equal(aggregate.runCount, 2)
  assert.deepEqual(aggregate.byTier, { fast: 1, standard: 0, deep: 0, critical: 1 })
  assert.deepEqual(aggregate.byCompletionState, { completed: 1, blocked: 1, partial: 0, failed: 0, cancelled: 0 })
  assert.deepEqual(aggregate.totals, {
    routesMatched: 5,
    sourcesLoaded: 9,
    contextChars: 32500,
    graphNodes: 15,
    toolQueries: 14,
    providerQueries: 3,
    cacheHits: 8,
    cacheMisses: 5,
    agentCount: 3,
    validationCommands: 8,
    repairRounds: 2,
    reviewerFindings: 3
  })
  const serialized = JSON.stringify(aggregate)
  for (const forbidden of ['prompt', 'private', 'src/private.js', 'provider-a', 'person@example.com']) {
    assert.equal(serialized.includes(forbidden), false)
  }
}

{
  assert.throws(
    () => aggregateRunMetrics([metric({ contextChars: Number.MAX_SAFE_INTEGER }), metric({ contextChars: 1 })]),
    /aggregate overflow: contextChars/
  )
}

{
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'raas-run-metrics-'))
  const file = path.join(directory, 'runs.ndjson')
  try {
    appendRunMetric(file, metric({ tier: 'fast', completionState: 'completed' }))
    appendRunMetric(file, metric({ tier: 'deep', completionState: 'partial', repairRounds: 2 }))
    const records = readRunMetrics(file)
    assert.equal(records.length, 2)
    assert.equal(records[0].tier, 'fast')
    assert.equal(records[1].tier, 'deep')
    assert.equal(records[1].repairRounds, 2)
    const raw = fs.readFileSync(file, 'utf8')
    assert.equal(raw.split(/\r?\n/).filter(Boolean).length, 2)
    assert.equal(raw.includes('prompt'), false)
    assert.equal(raw.includes('privateData'), false)
  } finally {
    fs.rmSync(directory, { recursive: true, force: true })
  }
}

{
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'raas-run-metrics-invalid-'))
  const file = path.join(directory, 'runs.ndjson')
  try {
    fs.writeFileSync(file, '{not-json}\n', 'utf8')
    assert.throws(() => readRunMetrics(file), /Invalid RAAS run-metrics JSON on line 1/)
  } finally {
    fs.rmSync(directory, { recursive: true, force: true })
  }
}

console.log('RAAS run metrics tests: PASS')
