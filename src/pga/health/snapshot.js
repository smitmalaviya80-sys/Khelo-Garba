import {
  deploymentBuildEvidence,
  productionProbeEvidence,
  requiredChecksEvidence,
} from './evidence-adapters.js'
import { evaluateHealth } from './model.js'
import {
  playbackSmokeEvidence,
  pwaUpdateEvidence,
  rollupHealthEvidence,
  telemetryHealthEvidence,
} from './operational-adapters.js'

const HEALTH_SUBSYSTEM_ORDER = Object.freeze([
  'production',
  'playback',
  'deployment',
  'ci',
  'catalogue',
  'telemetry',
  'rollups',
  'pwa',
])

const SUCCESS_STATES = new Set(['success', 'passed', 'pass'])
const FAILURE_STATES = new Set(['failed', 'failure', 'error', 'timed_out', 'startup_failure'])
const UNRESOLVED_STATES = new Set(['pending', 'queued', 'in_progress', 'inprogress', 'cancelled', 'canceled', 'skipped', 'unknown'])

function safeText(value, max = 160) {
  if (value == null) return null
  const text = String(value).trim()
  if (!text) return null
  return text.slice(0, max)
}

function normaliseState(value) {
  return String(value || 'unknown').trim().toLowerCase().replace(/[ -]+/g, '_')
}

function nonNegativeInteger(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null
  return Number.isInteger(value) && value >= 0 ? value : null
}

function catalogueSource(sourceUrl, revision) {
  return {
    kind: 'catalogue-validation',
    id: safeText(revision, 80),
    url: safeText(sourceUrl, 500),
  }
}

export function catalogueValidationEvidence({
  completed,
  state,
  ok,
  errors,
  warnings,
  revision,
  checkedAt,
  freshnessBudgetMs,
  sourceUrl,
} = {}) {
  const observedState = normaliseState(state)
  const errorCount = nonNegativeInteger(errors)
  const warningCount = nonNegativeInteger(warnings)
  const canonicalRevision = safeText(revision, 80)
  const details = { completed: completed === true }

  if (canonicalRevision) details.revision = canonicalRevision
  if (errorCount != null) details.errors = errorCount
  if (warningCount != null) details.warnings = warningCount
  if (safeText(state, 64)) details.observedState = observedState

  const common = {
    label: 'Catalogue',
    criticality: 'important',
    checkedAt,
    freshnessBudgetMs,
    source: catalogueSource(sourceUrl, canonicalRevision),
    details,
  }

  if (completed !== true || UNRESOLVED_STATES.has(observedState)) {
    return {
      ...common,
      status: 'unknown',
      summary: 'Catalogue validation is not yet resolved.',
      reason: completed !== true
        ? 'No completed catalogue validation was supplied.'
        : `Catalogue validation is ${observedState}.`,
      action: 'Run or finish the canonical catalogue validation.',
    }
  }

  if (ok === false || FAILURE_STATES.has(observedState) || (errorCount != null && errorCount > 0)) {
    return {
      ...common,
      status: 'failed',
      summary: 'Catalogue validation reports a blocking failure.',
      reason: errorCount != null && errorCount > 0
        ? `Catalogue validation reported ${errorCount} error${errorCount === 1 ? '' : 's'}.`
        : `Catalogue validation completed as ${observedState}.`,
      action: 'Inspect and repair the failing catalogue validation before the next release.',
    }
  }

  if (!SUCCESS_STATES.has(observedState) || errorCount == null || warningCount == null) {
    return {
      ...common,
      status: 'unknown',
      summary: 'Catalogue validation completed without enough evidence for a healthy result.',
      reason: !SUCCESS_STATES.has(observedState)
        ? `Catalogue validation state ${observedState} is not an explicit success.`
        : 'Healthy catalogue evidence requires explicit error and warning counts.',
      action: 'Repeat catalogue validation with explicit error and warning counts.',
    }
  }

  if (warningCount > 0) {
    return {
      ...common,
      status: 'degraded',
      summary: 'Catalogue validation passed with warnings.',
      reason: `Catalogue validation reported ${warningCount} warning${warningCount === 1 ? '' : 's'}.`,
      action: 'Review the catalogue warnings and decide whether they need release follow-up.',
    }
  }

  return {
    ...common,
    status: 'healthy',
    summary: 'Catalogue validation completed without errors or warnings.',
  }
}

export function composeHealthEvidence(observations = {}) {
  const source = observations && typeof observations === 'object' && !Array.isArray(observations)
    ? observations
    : {}

  return {
    production: productionProbeEvidence(source.production || {}),
    playback: playbackSmokeEvidence(source.playback || {}),
    deployment: deploymentBuildEvidence(source.deployment || {}),
    ci: requiredChecksEvidence(source.ci || {}),
    catalogue: catalogueValidationEvidence(source.catalogue || {}),
    telemetry: telemetryHealthEvidence(source.telemetry || {}),
    rollups: rollupHealthEvidence(source.rollups || {}),
    pwa: pwaUpdateEvidence(source.pwa || {}),
  }
}

export function composeHealthSnapshot(observations = {}, { nowMs = Date.now() } = {}) {
  if (typeof nowMs !== 'number' || !Number.isFinite(nowMs)) {
    throw new Error('invalid_health_snapshot_time')
  }
  const evaluatedAt = nowMs

  const evidence = composeHealthEvidence(observations)
  const evaluation = evaluateHealth(evidence, { nowMs: evaluatedAt })

  return {
    schemaVersion: 'pga-health-snapshot/v1',
    generatedAt: new Date(evaluatedAt).toISOString(),
    evaluatedAt: evaluation.evaluatedAt,
    status: evaluation.status,
    leadingSubsystem: evaluation.leadingSubsystem,
    counts: { ...evaluation.counts },
    actionable: evaluation.actionable.map((item) => ({
      subsystem: item.subsystem,
      status: item.status,
      action: item.action,
      source: { ...item.source },
    })),
    subsystems: evaluation.subsystems.map((subsystem) => ({
      ...subsystem,
      reasons: [...subsystem.reasons],
      source: { ...subsystem.source },
      details: { ...subsystem.details },
    })),
  }
}

export function healthSubsystemOrder() {
  return [...HEALTH_SUBSYSTEM_ORDER]
}
