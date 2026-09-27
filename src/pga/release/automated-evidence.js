import { acceptanceItem, createAcceptanceLedger } from './acceptance.js'

export const AUTOMATED_EVIDENCE_SCHEMA_VERSION = 'pga-release-automated-evidence/v1'

const SUITES = Object.freeze([
  Object.freeze({
    id: 'pga-security',
    label: 'PGA security validation',
    method: 'repository_validation',
    commands: Object.freeze([
      Object.freeze(['scripts/lib/validate-pga-security.mjs']),
    ]),
    itemIds: Object.freeze([
      'quality.no-admin-secret-public',
      'quality.no-public-indexing',
    ]),
  }),
  Object.freeze({
    id: 'pga-data-truth',
    label: 'PGA founder-data truth validation',
    method: 'repository_validation',
    commands: Object.freeze([
      Object.freeze(['scripts/lib/validate-pga-home-live-ui.mjs']),
      Object.freeze(['scripts/lib/validate-pga-analytics.mjs']),
      Object.freeze(['scripts/lib/validate-pga-health-ui.mjs']),
    ]),
    itemIds: Object.freeze([
      'quality.no-fake-zero',
    ]),
  }),
  Object.freeze({
    id: 'pga-shell-browser',
    label: 'PGA shell browser validation',
    method: 'browser_automation',
    commands: Object.freeze([
      Object.freeze(['scripts/lib/validate-pga-shell.mjs', '--browser']),
    ]),
    itemIds: Object.freeze([
      'env.desktop-chrome',
      'env.narrow-phone',
      'env.keyboard-only',
      'env.reduced-motion',
      'env.increased-forced-contrast',
      'env.auth-expired-denied',
      'env.telemetry-backend-unavailable',
      'journey.recover-network-backend-failure',
      'journey.expire-access-safely',
      'quality.primary-actions-visible',
      'quality.no-horizontal-overflow',
    ]),
  }),
  Object.freeze({
    id: 'pga-analytics-browser',
    label: 'PGA Audience and Listening browser validation',
    method: 'browser_automation',
    commands: Object.freeze([
      Object.freeze(['scripts/lib/validate-pga-analytics.mjs', '--browser']),
    ]),
    itemIds: Object.freeze([
      'env.short-landscape-phone',
      'journey.switch-ranges-views',
      'journey.inspect-audience',
      'journey.inspect-listening',
      'quality.no-critical-console-error',
    ]),
  }),
  Object.freeze({
    id: 'pga-release-browser-evidence',
    label: 'PGA partial, stale and Health browser release evidence',
    method: 'browser_automation',
    commands: Object.freeze([
      Object.freeze(['scripts/lib/validate-pga-release-browser-evidence.mjs']),
    ]),
    itemIds: Object.freeze([
      'env.partial-stale-analytics',
      'journey.inspect-health',
    ]),
  }),
])

const SUITE_BY_ID = new Map(SUITES.map((suite) => [suite.id, suite]))

function assertSuiteContract() {
  const seenItems = new Set()
  for (const suite of SUITES) {
    if (!suite.id || !suite.method || suite.itemIds.length === 0 || suite.commands.length === 0) {
      throw new Error(`invalid_automated_evidence_suite:${suite.id || 'unknown'}`)
    }
    for (const itemId of suite.itemIds) {
      if (seenItems.has(itemId)) throw new Error(`duplicate_automated_evidence_item:${itemId}`)
      seenItems.add(itemId)
      const entry = acceptanceItem(itemId)
      if (!entry) throw new Error(`unknown_automated_evidence_item:${itemId}`)
      if (!entry.allowedMethods.includes(suite.method)) {
        throw new Error(`incompatible_automated_evidence_method:${suite.id}:${itemId}`)
      }
    }
  }
}

assertSuiteContract()

function isRecord(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function copySuite(suite) {
  return {
    id: suite.id,
    label: suite.label,
    method: suite.method,
    commands: suite.commands.map((command) => [...command]),
    itemIds: [...suite.itemIds],
  }
}

function normaliseReceipt(receipt) {
  if (!isRecord(receipt)) return null
  if (receipt.outcome !== 'passed' && receipt.outcome !== 'failed') return null
  return {
    outcome: receipt.outcome,
    observedAt: receipt.observedAt,
    environment: receipt.environment,
    sourceUrl: receipt.sourceUrl,
    sourceId: receipt.sourceId,
  }
}

export function automatedEvidenceSuites() {
  return SUITES.map(copySuite)
}

export function compileAutomatedEvidence({
  suiteResults = {},
  targetRevision,
  targetEnvironment,
  nowMs = Date.now(),
} = {}) {
  const source = isRecord(suiteResults) ? suiteResults : {}
  const attempts = {}
  const executedSuites = []
  let ignoredReceiptCount = 0

  for (const key of Object.keys(source)) {
    if (!SUITE_BY_ID.has(key)) ignoredReceiptCount += 1
  }

  for (const suite of SUITES) {
    if (!Object.prototype.hasOwnProperty.call(source, suite.id)) continue
    const receipt = normaliseReceipt(source[suite.id])
    if (!receipt) {
      ignoredReceiptCount += 1
      continue
    }

    executedSuites.push({ id: suite.id, outcome: receipt.outcome })
    for (const itemId of suite.itemIds) {
      attempts[itemId] = {
        state: receipt.outcome === 'passed' ? 'verified' : 'failed',
        evidence: {
          method: suite.method,
          observedAt: receipt.observedAt,
          revision: targetRevision,
          environment: receipt.environment || targetEnvironment,
          sourceUrl: receipt.sourceUrl,
          sourceId: receipt.sourceId ? `${receipt.sourceId}:${suite.id}` : suite.id,
        },
      }
    }
  }

  const ledger = createAcceptanceLedger(attempts, {
    nowMs,
    targetRevision,
    targetEnvironment,
  })

  return {
    schemaVersion: AUTOMATED_EVIDENCE_SCHEMA_VERSION,
    evaluatedAt: ledger.evaluatedAt,
    targetRevision: ledger.targetRevision,
    targetEnvironment: ledger.targetEnvironment,
    executedSuites,
    ignoredReceiptCount,
    ledger,
  }
}
