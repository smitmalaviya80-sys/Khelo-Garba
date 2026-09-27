import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

import {
  HOME_STATES,
  buildHomeSnapshot,
  compareKpis,
  evaluateKpi,
  summarizeTrend,
} from '../../src/pga/home/model.js'

const NOW = Date.parse('2026-09-10T04:00:00Z')
const modelUrl = new URL('../../src/pga/home/model.js', import.meta.url)
const readmeUrl = new URL('../../src/pga/home/README.md', import.meta.url)
const workflowUrl = new URL('../../.github/workflows/pga-home-validate.yml', import.meta.url)

assert.deepEqual(HOME_STATES, [
  'loading',
  'available',
  'partial',
  'stale',
  'unavailable',
  'offline',
  'auth-expired',
  'error',
])

const zero = evaluateKpi({ status: 'available', value: 0 }, { nowMs: NOW })
assert.equal(zero.value, 0)
assert.equal(zero.zeroData, true)

for (const status of ['loading', 'unavailable', 'offline', 'auth-expired', 'error']) {
  const metric = evaluateKpi({ status }, { nowMs: NOW })
  assert.equal(metric.value, null, `${status} must not manufacture a numeric value`)
}

const stale = evaluateKpi({
  status: 'available',
  value: 4,
  dataThroughAt: NOW - 121_000,
  freshnessBudgetMs: 120_000,
}, { nowMs: NOW })
assert.equal(stale.status, 'stale')
assert.equal(stale.value, 4)

const noBudget = evaluateKpi({
  status: 'available',
  value: 4,
  dataThroughAt: NOW - 86_400_000,
}, { nowMs: NOW })
assert.equal(noBudget.status, 'available')

const newActivity = compareKpis(
  { status: 'available', value: 2 },
  { status: 'available', value: 0 },
  { nowMs: NOW },
)
assert.equal(newActivity.status, 'new-activity')
assert.equal(newActivity.percent, null)
assert.equal(Number.isFinite(newActivity.percent), false)

const unavailableComparison = compareKpis(
  { status: 'available', value: 2 },
  { status: 'unavailable' },
  { nowMs: NOW },
)
assert.equal(unavailableComparison.status, 'unavailable')
assert.equal(unavailableComparison.delta, null)

const partial = buildHomeSnapshot({
  status: 'partial',
  metrics: {
    sessions: { status: 'available', value: 3 },
    listening: {},
  },
}, { nowMs: NOW })
assert.equal(partial.metrics.sessions.value, 3)
assert.equal(partial.metrics.listening.value, null)
assert.equal(partial.availableMetricCount, 1)
assert.equal(partial.missingMetricCount, 1)

const trend = summarizeTrend([1, 2, 4], { label: 'Live sessions' })
assert.equal(trend.direction, 'up')
assert.match(trend.text, /rose from 1 to 4/)

const invalid = evaluateKpi({ status: 'available', value: -1 }, { nowMs: NOW })
assert.equal(invalid.status, 'error')
assert.equal(invalid.value, null)

const model = await readFile(modelUrl, 'utf8')
const forbiddenRuntimePatterns = [
  /\bfetch\s*\(/,
  /\bXMLHttpRequest\b/,
  /\bwindow\b/,
  /\bdocument\b/,
  /\blocalStorage\b/,
  /\bsessionStorage\b/,
  /\bprocess\.env\b/,
  /\bPGA_HMAC_SECRET\b/,
  /\bANALYTICS_API_TOKEN\b/,
  /\bCF_ACCOUNT_ID\b/,
]
for (const pattern of forbiddenRuntimePatterns) {
  assert.doesNotMatch(model, pattern, `pure Home model must not contain ${pattern}`)
}

assert.match(model, /zeroData: value === 0/)
assert.match(model, /freshnessBudgetMs/)
assert.match(model, /prior\.value === 0 && current\.value > 0/)
assert.match(model, /percent: null/)
assert.match(model, /pga-home\/v1/)

const readme = await readFile(readmeUrl, 'utf8')
for (const marker of [
  'real supplied `0` remains `0`',
  'Explicit freshness only',
  'New activity',
  'Text-first trend summaries',
  'Parent #842',
]) {
  assert.ok(readme.includes(marker), `Home README must document ${marker}`)
}

const workflow = await readFile(workflowUrl, 'utf8')
assert.match(workflow, /node --test src\/pga\/home\/tests\/home\.test\.mjs/)
assert.match(workflow, /node scripts\/lib\/validate-pga-home\.mjs/)
assert.match(workflow, /node-version: ['"]22['"]/)

console.log('PGA Home truth contract validated')
