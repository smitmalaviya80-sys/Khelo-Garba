import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

import {
  buildIdentityEvidence,
  checkRunEvidence,
  evaluateHealth,
  HEALTH_STATUSES,
} from '../../src/pga/health/model.js'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const read = (relative) => readFile(path.join(ROOT, relative), 'utf8')
const NOW = Date.parse('2026-09-09T21:00:00Z')
const MINUTE = 60_000

let failed = false
let checks = 0

async function check(name, fn) {
  checks += 1
  try {
    await fn()
    console.log(`✓ ${name}`)
  } catch (error) {
    failed = true
    console.error(`✗ ${name}`)
    console.error(`  ${error instanceof Error ? error.message : String(error)}`)
  }
}

await check('Health v1 exposes exactly five truthful product states', () => {
  assert.deepEqual(HEALTH_STATUSES, ['healthy', 'degraded', 'stale', 'unknown', 'failed'])
})

await check('Critical production failure is not diluted by healthy supporting systems', () => {
  const result = evaluateHealth({
    production: { status: 'failed', checkedAt: NOW, reason: 'Production is unreachable.' },
    telemetry: { status: 'healthy', checkedAt: NOW },
    rollups: { status: 'healthy', checkedAt: NOW },
  }, { nowMs: NOW })
  assert.equal(result.status, 'failed')
  assert.equal(result.leadingSubsystem, 'production')
})

await check('Supporting-system failure degrades but does not invent public-player failure', () => {
  const result = evaluateHealth({
    production: { status: 'healthy', checkedAt: NOW },
    playback: { status: 'healthy', checkedAt: NOW },
    telemetry: { status: 'failed', checkedAt: NOW, reason: 'Ingestion is unavailable.' },
  }, { nowMs: NOW })
  assert.equal(result.status, 'degraded')
  assert.equal(result.subsystems.find((item) => item.name === 'production').status, 'healthy')
  assert.equal(result.subsystems.find((item) => item.name === 'telemetry').status, 'failed')
})

await check('Staleness requires an explicit producer freshness budget', () => {
  const withoutBudget = evaluateHealth({
    rollups: { status: 'healthy', dataThroughAt: NOW - 24 * 60 * MINUTE },
  }, { nowMs: NOW })
  assert.equal(withoutBudget.status, 'healthy')

  const withBudget = evaluateHealth({
    rollups: {
      status: 'healthy',
      dataThroughAt: NOW - 31 * MINUTE,
      freshnessBudgetMs: 15 * MINUTE,
    },
  }, { nowMs: NOW })
  assert.equal(withBudget.status, 'stale')
})

await check('Build identity mismatches remain actionable degraded evidence', () => {
  const evidence = buildIdentityEvidence({
    expectedBuildId: 'expected',
    deployedBuildId: 'observed',
    checkedAt: NOW,
  })
  assert.equal(evidence.status, 'degraded')
  assert.match(evidence.action, /deployment/i)
  assert.deepEqual(evidence.details, {
    expectedBuildId: 'expected',
    deployedBuildId: 'observed',
  })
})

await check('Pending and cancelled CI stay unknown rather than being fabricated as pass/fail', () => {
  for (const state of ['pending', 'queued', 'in_progress', 'cancelled']) {
    assert.equal(checkRunEvidence({ state, checkedAt: NOW }).status, 'unknown', state)
  }
})

await check('Absent metrics remain absent while a real supplied zero survives', () => {
  const result = evaluateHealth({
    telemetry: { status: 'failed', checkedAt: NOW },
    production: { status: 'healthy', checkedAt: NOW, value: 0 },
  }, { nowMs: NOW })
  const telemetry = result.subsystems.find((item) => item.name === 'telemetry')
  const production = result.subsystems.find((item) => item.name === 'production')
  assert.equal(Object.hasOwn(telemetry.details, 'value'), false)
  assert.equal(production.details.value, 0)
})

await check('Health model remains pure and free of collection/runtime dependencies', async () => {
  const model = await read('src/pga/health/model.js')
  const prohibited = [
    [/\bfetch\s*\(/, 'network fetch'],
    [/XMLHttpRequest/, 'XMLHttpRequest'],
    [/\blocalStorage\b/, 'browser storage'],
    [/\bsessionStorage\b/, 'browser storage'],
    [/\bdocument\b/, 'DOM document'],
    [/\bwindow\b/, 'browser window'],
    [/process\.env/, 'process environment'],
    [/PGA_HMAC_SECRET/, 'PGA server secret identifier'],
    [/CF_ACCESS_CLIENT_SECRET/, 'Cloudflare Access secret identifier'],
  ]
  for (const [pattern, label] of prohibited) {
    assert.ok(!pattern.test(model), `pure health model unexpectedly contains ${label}`)
  }
})

await check('Health documentation preserves truth, freshness and integration boundaries', async () => {
  const readme = await read('src/pga/health/README.md')
  for (const marker of [
    'healthy',
    'degraded',
    'stale',
    'unknown',
    'failed',
    'There is no universal hard-coded stale timeout.',
    'It never fills a missing metric with zero.',
    'Later #844 integration',
  ]) {
    assert.ok(readme.includes(marker), `Health README missing marker: ${marker}`)
  }
})

await check('Dedicated Health workflow runs both tests and the focused validator', async () => {
  const workflow = await read('.github/workflows/pga-health-validate.yml')
  assert.ok(workflow.includes('node --test src/pga/health/tests/health.test.mjs'))
  assert.ok(workflow.includes('node scripts/lib/validate-pga-health.mjs'))
  assert.ok(workflow.includes("'src/pga/health/**'"))
  assert.ok(workflow.includes("'scripts/lib/validate-pga-health.mjs'"))
})

if (failed) {
  console.error(`\nPGA Health validation failed (${checks} checks).`)
  process.exit(1)
}

console.log(`\nPGA Health validation passed (${checks} checks).`)
console.log('The model evaluates supplied evidence only; live signal collection remains in the later protected #844 integration lane.')
