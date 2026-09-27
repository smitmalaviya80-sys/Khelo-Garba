#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { pathToFileURL } from 'node:url'

export const RUN_METRIC_SCHEMA_VERSION = 'raas-run-metrics/v1'

const TIERS = new Set(['fast', 'standard', 'deep', 'critical'])
const COMPLETION_STATES = new Set(['completed', 'blocked', 'partial', 'failed', 'cancelled'])
const NUMERIC_FIELDS = Object.freeze([
  'routesMatched',
  'sourcesLoaded',
  'contextChars',
  'graphNodes',
  'toolQueries',
  'providerQueries',
  'cacheHits',
  'cacheMisses',
  'agentCount',
  'validationCommands',
  'repairRounds',
  'reviewerFindings'
])
const ALLOWED_FIELDS = new Set([
  'schemaVersion',
  'tier',
  ...NUMERIC_FIELDS,
  'completionState'
])

function assertPlainObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`${label} must be a plain object`)
  }
}

function assertExactFields(record) {
  for (const key of Object.keys(record)) {
    if (!ALLOWED_FIELDS.has(key)) {
      throw new Error(`RAAS run metrics reject unknown/private field: ${key}`)
    }
  }
  for (const key of ALLOWED_FIELDS) {
    if (!(key in record)) throw new Error(`RAAS run metrics missing required field: ${key}`)
  }
}

function safeCount(value, field) {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw new TypeError(`RAAS run metric ${field} must be a non-negative safe integer number`)
  }
  return value
}

export function normalizeRunMetric(record) {
  assertPlainObject(record, 'RAAS run metric')
  assertExactFields(record)

  if (record.schemaVersion !== RUN_METRIC_SCHEMA_VERSION) {
    throw new Error(`Unsupported RAAS run-metrics schema: ${record.schemaVersion || '(missing)'}`)
  }
  if (!TIERS.has(record.tier)) throw new Error(`Invalid RAAS run-metrics tier: ${record.tier}`)
  if (!COMPLETION_STATES.has(record.completionState)) {
    throw new Error(`Invalid RAAS run-metrics completionState: ${record.completionState}`)
  }

  const normalized = {
    schemaVersion: RUN_METRIC_SCHEMA_VERSION,
    tier: record.tier
  }
  for (const field of NUMERIC_FIELDS) normalized[field] = safeCount(record[field], field)
  normalized.completionState = record.completionState
  return Object.freeze(normalized)
}

function emptyCountMap(values) {
  return Object.fromEntries([...values].map((value) => [value, 0]))
}

export function aggregateRunMetrics(records) {
  if (!Array.isArray(records)) throw new TypeError('RAAS run metrics aggregate input must be an array')

  const totals = Object.fromEntries(NUMERIC_FIELDS.map((field) => [field, 0]))
  const byTier = emptyCountMap(TIERS)
  const byCompletionState = emptyCountMap(COMPLETION_STATES)

  for (const rawRecord of records) {
    const record = normalizeRunMetric(rawRecord)
    byTier[record.tier] += 1
    byCompletionState[record.completionState] += 1
    for (const field of NUMERIC_FIELDS) {
      const next = totals[field] + record[field]
      if (!Number.isSafeInteger(next)) throw new RangeError(`RAAS run metrics aggregate overflow: ${field}`)
      totals[field] = next
    }
  }

  return {
    schemaVersion: `${RUN_METRIC_SCHEMA_VERSION}/aggregate`,
    runCount: records.length,
    byTier,
    byCompletionState,
    totals
  }
}

export function appendRunMetric(filePath, record) {
  const normalized = normalizeRunMetric(record)
  const target = path.resolve(String(filePath || ''))
  if (!filePath) throw new Error('RAAS run metrics output path is required')
  fs.mkdirSync(path.dirname(target), { recursive: true })
  fs.appendFileSync(target, `${JSON.stringify(normalized)}\n`, { encoding: 'utf8', mode: 0o600 })
  return normalized
}

export function readRunMetrics(filePath) {
  const text = fs.readFileSync(filePath, 'utf8')
  if (!text.trim()) return []
  return text
    .split(/\r?\n/)
    .filter((line) => line.trim())
    .map((line, index) => {
      let parsed
      try {
        parsed = JSON.parse(line)
      } catch (error) {
        throw new Error(`Invalid RAAS run-metrics JSON on line ${index + 1}: ${error.message}`)
      }
      return normalizeRunMetric(parsed)
    })
}

function usage() {
  return [
    'RAAS privacy-safe aggregate run metrics',
    '',
    'Usage:',
    '  node scripts/lib/raas-run-metrics.mjs append <file.ndjson> <record-json>',
    '  node scripts/lib/raas-run-metrics.mjs aggregate <file.ndjson>',
    '',
    'The record schema accepts counters and bounded status enums only. Unknown fields are rejected.'
  ].join('\n')
}

function runCli(argv) {
  const [command, filePath, ...rest] = argv
  if (!command || command === '--help' || command === '-h') {
    process.stdout.write(`${usage()}\n`)
    return
  }

  if (command === 'append') {
    if (!filePath || rest.length !== 1) throw new Error('append requires <file.ndjson> <record-json>')
    const record = JSON.parse(rest[0])
    const normalized = appendRunMetric(filePath, record)
    process.stdout.write(`${JSON.stringify(normalized)}\n`)
    return
  }

  if (command === 'aggregate') {
    if (!filePath || rest.length !== 0) throw new Error('aggregate requires exactly <file.ndjson>')
    process.stdout.write(`${JSON.stringify(aggregateRunMetrics(readRunMetrics(filePath)), null, 2)}\n`)
    return
  }

  throw new Error(`Unknown RAAS run-metrics command: ${command}`)
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
if (isMain) {
  try {
    runCli(process.argv.slice(2))
  } catch (error) {
    console.error(error.message || String(error))
    process.exitCode = 1
  }
}
