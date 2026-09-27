import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const sourcePath = path.join(repoRoot, 'src/pga/health/snapshot.js')
const testPath = path.join(repoRoot, 'src/pga/health/tests/snapshot.test.mjs')
const source = fs.readFileSync(sourcePath, 'utf8')
const tests = fs.readFileSync(testPath, 'utf8')

const failures = []
function requireMatch(label, pattern, input = source) {
  if (!pattern.test(input)) failures.push(`missing ${label}`)
}
function forbid(label, pattern, input = source) {
  if (pattern.test(input)) failures.push(`forbidden ${label}`)
}

requireMatch('canonical Health evaluator import', /import\s*\{\s*evaluateHealth\s*\}\s*from\s*['"]\.\/model\.js['"]/)
requireMatch('production evidence adapter', /productionProbeEvidence\(/)
requireMatch('deployment evidence adapter', /deploymentBuildEvidence\(/)
requireMatch('required CI evidence adapter', /requiredChecksEvidence\(/)
requireMatch('playback evidence adapter', /playbackSmokeEvidence\(/)
requireMatch('PWA evidence adapter', /pwaUpdateEvidence\(/)
requireMatch('telemetry evidence adapter', /telemetryHealthEvidence\(/)
requireMatch('rollup evidence adapter', /rollupHealthEvidence\(/)
requireMatch('catalogue evidence adapter', /export function catalogueValidationEvidence\(/)
requireMatch('snapshot composer', /export function composeHealthSnapshot\(/)
requireMatch('snapshot schema', /pga-health-snapshot\/v1/)
requireMatch('stable eight-subsystem order', /'production'[\s\S]*'playback'[\s\S]*'deployment'[\s\S]*'ci'[\s\S]*'catalogue'[\s\S]*'telemetry'[\s\S]*'rollups'[\s\S]*'pwa'/)

forbid('network fetch', /\bfetch\s*\(/)
forbid('XMLHttpRequest', /\bXMLHttpRequest\b/)
forbid('WebSocket', /\bWebSocket\b/)
forbid('environment access', /\bprocess\.env\b/)
forbid('DOM document access', /\bdocument\s*\./)
forbid('window access', /\bwindow\s*\./)
forbid('browser local storage', /\blocalStorage\b/)
forbid('browser session storage', /\bsessionStorage\b/)
forbid('raw browser-id vocabulary', /\bbrowser_id\b/i)
forbid('raw session-id vocabulary', /\bsession_id\b/i)
forbid('raw search-term vocabulary', /\bsearch_term\b/i)
forbid('raw observation passthrough property', /^[ \t]*observations[ \t]*:/m)
forbid('spread of raw observations', /\.\.\.\s*observations\b/)

requireMatch('healthy snapshot fixture', /status,\s*'healthy'/, tests)
requireMatch('critical failure fixture', /status,\s*'failed'/, tests)
requireMatch('degraded fixture', /status,\s*'degraded'/, tests)
requireMatch('stale fixture', /status,\s*'stale'/, tests)
requireMatch('unknown fixture', /status,\s*'unknown'/, tests)
requireMatch('explicit zero preservation fixture', /details\.errors,\s*0/, tests)
requireMatch('raw secret non-echo fixture', /DO_NOT_ECHO_SECRET_MARKER/, tests)
requireMatch('raw listener non-echo fixture', /DO_NOT_ECHO_LISTENER_MARKER/, tests)
requireMatch('stable subsystem order fixture', /healthSubsystemOrder\(\)/, tests)

if (failures.length) {
  console.error('PGA Health snapshot validation failed:')
  for (const failure of failures) console.error(`- ${failure}`)
  process.exit(1)
}

console.log('PGA Health snapshot validation passed.')
