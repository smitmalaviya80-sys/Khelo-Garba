export const HEALTH_STATUSES = Object.freeze([
  'healthy',
  'degraded',
  'stale',
  'unknown',
  'failed',
])

export const HEALTH_CRITICALITIES = Object.freeze([
  'critical',
  'important',
  'supporting',
])

const STATUS_SET = new Set(HEALTH_STATUSES)
const CRITICALITY_SET = new Set(HEALTH_CRITICALITIES)

const DEFAULT_SUBSYSTEMS = Object.freeze({
  production: { label: 'Production', criticality: 'critical' },
  playback: { label: 'Playback', criticality: 'critical' },
  deployment: { label: 'Deployment', criticality: 'important' },
  ci: { label: 'CI', criticality: 'important' },
  catalogue: { label: 'Catalogue', criticality: 'important' },
  telemetry: { label: 'Telemetry', criticality: 'supporting' },
  rollups: { label: 'Rollups', criticality: 'supporting' },
  pwa: { label: 'PWA', criticality: 'supporting' },
})

const KNOWN_ORDER = Object.freeze(Object.keys(DEFAULT_SUBSYSTEMS))
const CHECK_STATES = Object.freeze({
  success: 'healthy',
  passed: 'healthy',
  pass: 'healthy',
  failure: 'failed',
  failed: 'failed',
  error: 'failed',
  pending: 'unknown',
  queued: 'unknown',
  in_progress: 'unknown',
  inprogress: 'unknown',
  cancelled: 'unknown',
  canceled: 'unknown',
  skipped: 'unknown',
  neutral: 'unknown',
  unknown: 'unknown',
})

function finiteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function evaluationClock(value) {
  const now = finiteNumber(value)
  if (now == null) throw new TypeError('nowMs must be a finite number')
  return now
}

function normaliseTimestamp(value) {
  if (value == null || value === '') return null
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  const parsed = Date.parse(String(value))
  return Number.isFinite(parsed) ? parsed : null
}

function normaliseStatus(value) {
  const status = String(value || '').trim().toLowerCase()
  return STATUS_SET.has(status) ? status : 'unknown'
}

function normaliseCriticality(value, fallback = 'supporting') {
  const criticality = String(value || '').trim().toLowerCase()
  if (CRITICALITY_SET.has(criticality)) return criticality
  return CRITICALITY_SET.has(fallback) ? fallback : 'supporting'
}

function safeText(value) {
  if (value == null) return null
  const text = String(value).trim()
  return text || null
}

function cloneEvidenceValue(value) {
  if (Array.isArray(value)) return value.map(cloneEvidenceValue)
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(
    Object.entries(value).map(([key, nested]) => [key, cloneEvidenceValue(nested)]),
  )
}

function freshnessTimestamp(input) {
  return normaliseTimestamp(
    input?.freshnessAt ?? input?.dataThroughAt ?? input?.checkedAt ?? input?.observedAt,
  )
}

function freshnessBudget(input) {
  const budget = finiteNumber(input?.freshnessBudgetMs)
  return budget != null && budget >= 0 ? budget : null
}

function statusContribution(status, criticality) {
  if (status === 'healthy') return { rank: 0, overall: 'healthy' }
  if (status === 'unknown') return { rank: 1, overall: 'unknown' }
  if (status === 'stale') return { rank: 2, overall: 'stale' }

  if (status === 'degraded') {
    return { rank: 3, overall: 'degraded' }
  }

  if (status === 'failed') {
    if (criticality === 'critical') return { rank: 4, overall: 'failed' }
    return { rank: 3, overall: 'degraded' }
  }

  return { rank: 1, overall: 'unknown' }
}

function sortSubsystems(entries) {
  const knownIndex = new Map(KNOWN_ORDER.map((name, index) => [name, index]))
  return entries.sort((a, b) => {
    const aIndex = knownIndex.has(a.name) ? knownIndex.get(a.name) : Number.MAX_SAFE_INTEGER
    const bIndex = knownIndex.has(b.name) ? knownIndex.get(b.name) : Number.MAX_SAFE_INTEGER
    if (aIndex !== bIndex) return aIndex - bIndex
    return a.name.localeCompare(b.name)
  })
}

export function evaluateSubsystem(name, input = {}, { nowMs = Date.now() } = {}) {
  const now = evaluationClock(nowMs)
  const canonicalName = safeText(name) || 'unknown'
  const defaults = DEFAULT_SUBSYSTEMS[canonicalName] || {}
  const criticality = normaliseCriticality(input.criticality, defaults.criticality)
  const explicitStatus = normaliseStatus(input.status)
  const observedAt = freshnessTimestamp(input)
  const budgetMs = freshnessBudget(input)
  const futureDated = observedAt != null && observedAt > now
  const ageMs = observedAt == null || futureDated ? null : now - observedAt

  let status = futureDated && explicitStatus !== 'failed' ? 'unknown' : explicitStatus
  let stale = false

  // A hard failure remains a failure even when its last observation is old or its
  // timestamp is invalidly in the future. Non-failure evidence from the future is
  // never certified current; otherwise evidence may become stale only when its
  // producer supplied a concrete freshness budget. PGA never invents a universal
  // timeout or clock-skew tolerance here.
  if (
    explicitStatus !== 'failed'
    && !futureDated
    && observedAt != null
    && budgetMs != null
    && now - observedAt > budgetMs
  ) {
    status = 'stale'
    stale = true
  }

  const reasons = []
  if (Array.isArray(input.reasons)) {
    for (const reason of input.reasons) {
      const text = safeText(reason)
      if (text) reasons.push(text)
    }
  }
  const reason = safeText(input.reason)
  if (reason && !reasons.includes(reason)) reasons.push(reason)
  if (futureDated) reasons.push('Evidence freshness timestamp is later than the evaluation clock.')
  if (stale) reasons.push(`Evidence is older than its ${budgetMs} ms freshness budget.`)
  if (explicitStatus === 'unknown' && reasons.length === 0) reasons.push('Current evidence is unavailable or unresolved.')

  const source = {
    kind: safeText(input.source?.kind ?? input.sourceKind),
    id: safeText(input.source?.id ?? input.sourceId),
    url: safeText(input.source?.url ?? input.sourceUrl),
  }

  const details = input.details && typeof input.details === 'object'
    ? cloneEvidenceValue(input.details)
    : {}

  // Preserve supplied values verbatim. In particular, do not manufacture zero for a
  // missing/failed metric. Consumers can distinguish absent `value` from a real 0.
  if (Object.prototype.hasOwnProperty.call(input, 'value')) details.value = cloneEvidenceValue(input.value)

  return {
    name: canonicalName,
    label: safeText(input.label) || defaults.label || canonicalName,
    criticality,
    status,
    observedStatus: explicitStatus,
    checkedAt: normaliseTimestamp(input.checkedAt),
    dataThroughAt: normaliseTimestamp(input.dataThroughAt),
    freshnessAt: observedAt,
    freshnessBudgetMs: budgetMs,
    ageMs,
    stale,
    summary: safeText(input.summary),
    action: safeText(input.action),
    reasons,
    source,
    details,
  }
}

export function evaluateHealth(evidence = {}, { nowMs = Date.now() } = {}) {
  const now = evaluationClock(nowMs)
  const entries = evidence && typeof evidence === 'object' && !Array.isArray(evidence)
    ? Object.entries(evidence)
    : []

  const subsystems = sortSubsystems(entries.map(([name, input]) => (
    evaluateSubsystem(name, input, { nowMs: now })
  )))

  if (subsystems.length === 0) {
    return {
      schemaVersion: 'pga-health/v1',
      evaluatedAt: now,
      status: 'unknown',
      reasons: ['No health evidence was supplied.'],
      actionable: [],
      subsystems: [],
      counts: Object.fromEntries(HEALTH_STATUSES.map((status) => [status, 0])),
    }
  }

  let winner = { rank: -1, overall: 'healthy', subsystem: null }
  const counts = Object.fromEntries(HEALTH_STATUSES.map((status) => [status, 0]))
  const actionable = []
  const reasons = []

  for (const subsystem of subsystems) {
    counts[subsystem.status] += 1
    const contribution = statusContribution(subsystem.status, subsystem.criticality)
    if (contribution.rank > winner.rank) {
      winner = { ...contribution, subsystem: subsystem.name }
    }

    if (subsystem.status !== 'healthy') {
      reasons.push({
        subsystem: subsystem.name,
        status: subsystem.status,
        criticality: subsystem.criticality,
        reasons: [...subsystem.reasons],
      })
    }

    if (subsystem.action) {
      actionable.push({
        subsystem: subsystem.name,
        status: subsystem.status,
        action: subsystem.action,
        source: { ...subsystem.source },
      })
    }
  }

  return {
    schemaVersion: 'pga-health/v1',
    evaluatedAt: now,
    status: winner.overall,
    leadingSubsystem: winner.subsystem,
    reasons,
    actionable,
    subsystems,
    counts,
  }
}

export function buildIdentityEvidence({
  expectedBuildId,
  deployedBuildId,
  checkedAt,
  freshnessBudgetMs,
  source,
} = {}) {
  const expected = safeText(expectedBuildId)
  const deployed = safeText(deployedBuildId)

  if (!expected || !deployed) {
    return {
      status: 'unknown',
      criticality: 'important',
      checkedAt,
      freshnessBudgetMs,
      source,
      summary: 'Deployment identity is incomplete.',
      reason: !expected ? 'Expected build identity is missing.' : 'Deployed build identity is missing.',
      action: 'Re-check the expected and deployed build identities.',
      details: { expectedBuildId: expected, deployedBuildId: deployed },
    }
  }

  if (expected !== deployed) {
    return {
      status: 'degraded',
      criticality: 'important',
      checkedAt,
      freshnessBudgetMs,
      source,
      summary: 'Production is serving a different build than expected.',
      reason: `Expected ${expected} but observed ${deployed}.`,
      action: 'Inspect the production deployment and reconcile the deployed build.',
      details: { expectedBuildId: expected, deployedBuildId: deployed },
    }
  }

  return {
    status: 'healthy',
    criticality: 'important',
    checkedAt,
    freshnessBudgetMs,
    source,
    summary: 'Production build identity matches the expected build.',
    details: { expectedBuildId: expected, deployedBuildId: deployed },
  }
}

export function checkRunEvidence({
  state,
  checkedAt,
  freshnessBudgetMs,
  source,
  label = 'CI',
  criticality = 'important',
} = {}) {
  const rawState = String(state || 'unknown').trim().toLowerCase().replace(/[ -]+/g, '_')
  const status = CHECK_STATES[rawState] || 'unknown'
  const isPending = ['pending', 'queued', 'in_progress', 'inprogress'].includes(rawState)
  const isCancelled = ['cancelled', 'canceled'].includes(rawState)

  return {
    status,
    label,
    criticality,
    checkedAt,
    freshnessBudgetMs,
    source,
    summary: status === 'healthy'
      ? `${label} is passing.`
      : status === 'failed'
        ? `${label} has a failing check.`
        : `${label} state is not a completed pass/fail result.`,
    reason: isPending
      ? `${label} is still ${rawState}.`
      : isCancelled
        ? `${label} was cancelled; current correctness is unknown.`
        : status === 'unknown'
          ? `${label} state ${rawState || 'unknown'} is not a completed result.`
          : null,
    action: status === 'failed'
      ? `Inspect the failing ${label} evidence.`
      : isCancelled
        ? `Re-run or replace the cancelled ${label} evidence.`
        : null,
    details: { rawState },
  }
}

export function subsystemDefaults() {
  return cloneEvidenceValue(DEFAULT_SUBSYSTEMS)
}
