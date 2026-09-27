import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const read = (relative) => readFile(path.join(ROOT, relative), 'utf8')

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

await check('Operational adapter exports the four bounded signal adapters', async () => {
  const source = await read('src/pga/health/operational-adapters.js')
  for (const marker of [
    'export function pwaUpdateEvidence',
    'export function playbackSmokeEvidence',
    'export function telemetryHealthEvidence',
    'export function rollupHealthEvidence',
  ]) {
    assert.ok(source.includes(marker), `missing adapter export: ${marker}`)
  }
})

await check('Operational adapter remains pure and secret-free', async () => {
  const source = await read('src/pga/health/operational-adapters.js')
  const prohibited = [
    [/\bfetch\s*\(/, 'network fetch'],
    [/XMLHttpRequest/, 'XMLHttpRequest'],
    [/\blocalStorage\b/, 'browser storage'],
    [/\bsessionStorage\b/, 'browser storage'],
    [/\bdocument\b/, 'DOM document'],
    [/\bwindow\b/, 'browser window'],
    [/process\.env/, 'process environment'],
    [/PGA_HMAC_SECRET/, 'PGA HMAC secret identifier'],
    [/CF_ACCESS_CLIENT_SECRET/, 'Cloudflare Access secret identifier'],
    [/Authorization\s*:/i, 'authorization header construction'],
    [/src\/pga\/backend/, 'backend dependency'],
    [/src\/pga\/app/, 'PGA app dependency'],
  ]
  for (const [pattern, label] of prohibited) {
    assert.ok(!pattern.test(source), `operational adapter unexpectedly contains ${label}`)
  }
})

await check('Operational adapters do not manufacture raw telemetry or popularity claims', async () => {
  const source = await read('src/pga/health/operational-adapters.js')
  for (const prohibited of [
    'uniqueBrowsers',
    'sessions',
    'search_term',
    'raw event',
    'popularity',
  ]) {
    assert.ok(!source.includes(prohibited), `operational adapter unexpectedly contains ${prohibited}`)
  }
})

await check('Operational fixture coverage exercises all truth states and stale integration', async () => {
  const tests = await read('src/pga/health/tests/operational-adapters.test.mjs')
  for (const marker of [
    "status, 'healthy'",
    "status, 'degraded'",
    "status, 'failed'",
    "status, 'unknown'",
    "result.status, 'stale'",
    'waitingVersion',
    'confirmedStart',
    'controlsResponsive',
    'dataThrough',
    'rollups',
  ]) {
    assert.ok(tests.includes(marker), `operational fixtures missing marker: ${marker}`)
  }
})

await check('Dedicated PGA Health workflow runs all adapter fixtures and validators', async () => {
  const workflow = await read('.github/workflows/pga-health-validate.yml')
  for (const marker of [
    'src/pga/health/tests/health.test.mjs',
    'src/pga/health/tests/evidence-adapters.test.mjs',
    'src/pga/health/tests/operational-adapters.test.mjs',
    'node scripts/lib/validate-pga-health.mjs',
    'node scripts/lib/validate-pga-health-evidence.mjs',
    'node scripts/lib/validate-pga-health-operational.mjs',
    "'scripts/lib/validate-pga-health-operational.mjs'",
  ]) {
    assert.ok(workflow.includes(marker), `PGA Health workflow missing marker: ${marker}`)
  }
})

if (failed) {
  console.error(`\nPGA operational Health validation failed (${checks} checks).`)
  process.exit(1)
}

console.log(`\nPGA operational Health validation passed (${checks} checks).`)
console.log('Operational adapters transform caller-supplied evidence only; protected fetching and visible #844 UI integration remain separate concerns.')
