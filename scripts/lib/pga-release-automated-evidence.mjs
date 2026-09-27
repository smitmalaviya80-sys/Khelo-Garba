#!/usr/bin/env node

import { execFileSync, spawnSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'

import {
  automatedEvidenceSuites,
  compileAutomatedEvidence,
} from '../../src/pga/release/automated-evidence.js'

const SHA_RE = /^[0-9a-f]{40}$/i
const DEFAULT_OUTPUT = 'artifacts/pga-release-automated-evidence.json'
const DEFAULT_TIMEOUT_MS = 6 * 60 * 1000
const MAX_TIMEOUT_MS = 15 * 60 * 1000
const EXPECTED_AUTOMATED_VERIFIED_COUNT = 21

function text(value) {
  if (value == null) return null
  const result = String(value).trim()
  return result || null
}

function targetRevision() {
  const configured = text(process.env.PGA_RELEASE_REVISION)
  const value = configured || execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
  if (!SHA_RE.test(value)) throw new Error('pga_release_exact_revision_required')
  return value.toLowerCase()
}

function fixtureBaseUrl() {
  const raw = text(process.env.PGA_BASE_URL) || 'http://127.0.0.1:4174'
  let url
  try {
    url = new URL(raw)
  } catch {
    throw new Error('pga_release_local_fixture_url_required')
  }
  if (url.protocol !== 'http:' || !['127.0.0.1', 'localhost', '::1'].includes(url.hostname)) {
    throw new Error('pga_release_local_fixture_url_required')
  }
  url.username = ''
  url.password = ''
  url.search = ''
  url.hash = ''
  return url.toString().replace(/\/$/, '')
}

function suiteTimeoutMs() {
  const configured = Number(process.env.PGA_RELEASE_SUITE_TIMEOUT_MS)
  if (!Number.isFinite(configured) || configured <= 0) return DEFAULT_TIMEOUT_MS
  return Math.min(MAX_TIMEOUT_MS, Math.max(1_000, Math.floor(configured)))
}

function runSource() {
  const server = text(process.env.GITHUB_SERVER_URL)
  const repository = text(process.env.GITHUB_REPOSITORY)
  const runId = text(process.env.GITHUB_RUN_ID)
  if (server && repository && runId) {
    return {
      sourceUrl: `${server.replace(/\/$/, '')}/${repository}/actions/runs/${encodeURIComponent(runId)}`,
      sourceId: `github-run-${runId}`,
    }
  }
  return { sourceUrl: null, sourceId: 'local-release-evidence-run' }
}

function runCommand(command, env, timeout) {
  const [script, ...args] = command
  const result = spawnSync(process.execPath, [script, ...args], {
    cwd: process.cwd(),
    env,
    stdio: 'inherit',
    timeout,
    killSignal: 'SIGTERM',
  })
  return result.status === 0 && !result.error
}

const revision = targetRevision()
const environment = text(process.env.PGA_RELEASE_ENVIRONMENT) || 'github-actions-local-fixture'
const baseUrl = fixtureBaseUrl()
const outputPath = path.resolve(process.cwd(), text(process.env.PGA_RELEASE_EVIDENCE_OUTPUT) || DEFAULT_OUTPUT)
const timeoutMs = suiteTimeoutMs()
const source = runSource()
const suiteResults = {}
const failedSuites = []

const childEnv = {
  ...process.env,
  PGA_BASE_URL: baseUrl,
}

for (const suite of automatedEvidenceSuites()) {
  console.log(`\n▶ ${suite.label}`)
  let passed = true
  for (const command of suite.commands) {
    if (!runCommand(command, childEnv, timeoutMs)) {
      passed = false
      break
    }
  }

  suiteResults[suite.id] = {
    outcome: passed ? 'passed' : 'failed',
    observedAt: new Date().toISOString(),
    environment,
    sourceUrl: source.sourceUrl,
    sourceId: source.sourceId,
  }
  if (!passed) failedSuites.push(suite.id)
}

const record = compileAutomatedEvidence({
  suiteResults,
  targetRevision: revision,
  targetEnvironment: environment,
  nowMs: Date.now(),
})

mkdirSync(path.dirname(outputPath), { recursive: true })
writeFileSync(outputPath, `${JSON.stringify(record, null, 2)}\n`, 'utf8')

console.log(`\nPGA automated release evidence: ${record.ledger.counts.verified} verified, ${record.ledger.counts.failed} failed, ${record.ledger.counts.not_inspected} not inspected.`)
console.log(`Release status remains: ${record.ledger.status}.`)
console.log(`Evidence record: ${path.relative(process.cwd(), outputPath)}`)

if (failedSuites.length > 0) {
  console.error(`Failed automated suites: ${failedSuites.join(', ')}`)
  process.exit(1)
}

if (record.ledger.status !== 'incomplete' || record.ledger.counts.verified !== EXPECTED_AUTOMATED_VERIFIED_COUNT) {
  console.error('Automated evidence boundary changed unexpectedly; refusing to claim release readiness.')
  process.exit(1)
}
