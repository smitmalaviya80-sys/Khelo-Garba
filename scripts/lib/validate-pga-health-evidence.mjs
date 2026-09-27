import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const read = (relative) => readFile(path.join(ROOT, relative), 'utf8')

const adapter = await read('src/pga/health/evidence-adapters.js')
const tests = await read('src/pga/health/tests/evidence-adapters.test.mjs')
const workflow = await read('.github/workflows/pga-health-validate.yml')

for (const marker of [
  "import { buildIdentityEvidence, checkRunEvidence } from './model.js'",
  'export function productionProbeEvidence',
  'export function deploymentBuildEvidence',
  'export function requiredChecksEvidence',
  "const CANONICAL_ORIGIN = 'https://playgarba.com'",
]) {
  assert.ok(adapter.includes(marker), `Health evidence adapter missing marker: ${marker}`)
}

for (const [pattern, label] of [
  [/\bfetch\s*\(/, 'network fetch'],
  [/XMLHttpRequest/, 'XMLHttpRequest'],
  [/\blocalStorage\b/, 'localStorage'],
  [/\bsessionStorage\b/, 'sessionStorage'],
  [/\bdocument\b/, 'DOM document'],
  [/\bwindow\b/, 'browser window'],
  [/process\.env/, 'process environment'],
  [/Authorization\s*:/i, 'authorization header'],
  [/\bBearer\b/, 'bearer credential'],
  [/PGA_HMAC_SECRET/, 'PGA server secret identifier'],
  [/CF_ACCESS_CLIENT_SECRET/, 'Cloudflare Access secret identifier'],
]) {
  assert.ok(!pattern.test(adapter), `Health evidence adapter unexpectedly contains ${label}`)
}

for (const marker of [
  "test('production probe distinguishes success, failure and absent evidence'",
  "test('matching deployment build evidence preserves supplied diagnostic details'",
  "test('malformed and off-origin build diagnostics fail closed as unknown'",
  "test('a completed required CI failure produces failed evidence'",
  "test('pending, cancelled and missing required CI checks remain unknown'",
  "test('duplicate check names select the newest applicable run deterministically'",
]) {
  assert.ok(tests.includes(marker), `Health evidence fixtures missing marker: ${marker}`)
}

for (const marker of [
  'node --test src/pga/health/tests/health.test.mjs src/pga/health/tests/evidence-adapters.test.mjs',
  'node scripts/lib/validate-pga-health.mjs',
  'node scripts/lib/validate-pga-health-evidence.mjs',
  "'scripts/lib/validate-pga-health-evidence.mjs'",
]) {
  assert.ok(workflow.includes(marker), `PGA Health workflow missing marker: ${marker}`)
}

console.log('PGA Health evidence adapter validation passed.')
console.log('Adapters transform caller-supplied evidence only; protected collection and UI integration remain outside this lane.')
