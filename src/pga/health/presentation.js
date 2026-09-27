const PRESENTATION_SCHEMA = 'pga-health-presentation/v1'
const SNAPSHOT_SCHEMA = 'pga-health-snapshot/v1'

const SUBSYSTEMS = Object.freeze([
  ['production', 'Production', 'critical'],
  ['playback', 'Playback', 'critical'],
  ['deployment', 'Deployment', 'important'],
  ['ci', 'CI', 'important'],
  ['catalogue', 'Catalogue', 'important'],
  ['telemetry', 'Telemetry', 'supporting'],
  ['rollups', 'Rollups', 'supporting'],
  ['pwa', 'PWA', 'supporting'],
])

const STATUSES = new Set(['healthy', 'degraded', 'stale', 'unknown', 'failed'])
const STATUS_PRIORITY = Object.freeze({ failed: 5, degraded: 4, stale: 3, unknown: 2, healthy: 1 })
const CRITICALITY_PRIORITY = Object.freeze({ critical: 3, important: 2, supporting: 1 })
const SAFE_DETAIL_KEYS = new Set([
  'value',
  'statusCode',
  'expectedBuildId',
  'deployedBuildId',
  'generatedAt',
  'workflowRunId',
  'catalogueVersion',
  'activeSongs',
  'ordinaryListeningSongs',
  'youtubePlayable',
  'migrationBacklog',
  'rawState',
  'completed',
  'controlled',
  'activeVersion',
  'expectedVersion',
  'waitingVersion',
  'revision',
  'errors',
  'warnings',
  'confirmedStart',
  'controlsResponsive',
  'contentId',
])

function safeText(value, max = 160) {
  if (value == null) return null
  const text = String(value).trim()
  return text ? text.slice(0, max) : null
}

function finiteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function normaliseTimestamp(value) {
  if (value == null || value === '') return null
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  const parsed = Date.parse(String(value))
  return Number.isFinite(parsed) ? parsed : null
}

function isoOrNull(value) {
  const timestamp = normaliseTimestamp(value)
  return timestamp == null ? null : new Date(timestamp).toISOString()
}

function canonicalStatus(value) {
  const status = String(value || '').trim().toLowerCase()
  return STATUSES.has(status) ? status : 'unknown'
}

function safeCriticality(value, fallback) {
  const criticality = String(value || '').trim().toLowerCase()
  return Object.hasOwn(CRITICALITY_PRIORITY, criticality) ? criticality : fallback
}

function safeReasonList(value) {
  if (!Array.isArray(value)) return []
  const reasons = []
  for (const item of value) {
    const reason = safeText(item, 180)
    if (reason && !reasons.includes(reason)) reasons.push(reason)
    if (reasons.length === 4) break
  }
  return reasons
}

function safeDetailValue(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined
  if (typeof value === 'boolean') return value
  if (typeof value === 'string') return safeText(value, 120) ?? undefined
  if (Array.isArray(value)) {
    const items = value
      .slice(0, 10)
      .map(safeDetailValue)
      .filter((item) => item !== undefined && (typeof item !== 'object' || item === null))
    return items
  }
  return undefined
}

function safeDetails(details) {
  if (!details || typeof details !== 'object' || Array.isArray(details)) return {}
  const output = {}
  for (const [key, value] of Object.entries(details)) {
    if (!SAFE_DETAIL_KEYS.has(key)) continue
    const safeValue = safeDetailValue(value)
    if (safeValue !== undefined) output[key] = safeValue
  }
  return output
}

function ageText(ageMs) {
  if (ageMs == null) return null
  const seconds = Math.max(0, Math.floor(ageMs / 1000))
  if (seconds < 60) return `${seconds}s ago`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 48) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

function relativeTimestampText(label, timestamp, nowMs) {
  if (timestamp == null) return null
  if (timestamp > nowMs) return `${label} time is ahead of evaluation clock`
  return `${label} ${ageText(nowMs - timestamp)}`
}

function freshnessFor(subsystem, nowMs) {
  const checkedAt = normaliseTimestamp(subsystem?.checkedAt)
  const dataThroughAt = normaliseTimestamp(subsystem?.dataThroughAt)
  const freshnessAt = normaliseTimestamp(subsystem?.freshnessAt)
  const observedAt = freshnessAt ?? dataThroughAt ?? checkedAt
  const futureObserved = observedAt != null && observedAt > nowMs
  const ageMs = observedAt == null || futureObserved ? null : nowMs - observedAt
  const parts = []

  if (canonicalStatus(subsystem?.status) === 'stale') parts.push('Stale')
  if (checkedAt != null) parts.push(relativeTimestampText('checked', checkedAt, nowMs))
  if (dataThroughAt != null) parts.push(relativeTimestampText('data through', dataThroughAt, nowMs))
  if (checkedAt == null && dataThroughAt == null && observedAt != null) {
    parts.push(relativeTimestampText('observed', observedAt, nowMs))
  } else if (futureObserved && observedAt !== checkedAt && observedAt !== dataThroughAt) {
    parts.push('freshness time is ahead of evaluation clock')
  }

  return {
    checkedAt: checkedAt == null ? null : new Date(checkedAt).toISOString(),
    dataThroughAt: dataThroughAt == null ? null : new Date(dataThroughAt).toISOString(),
    observedAt: observedAt == null ? null : new Date(observedAt).toISOString(),
    ageMs,
    text: parts.length ? parts.join(' · ') : 'No freshness timestamp',
  }
}

export function sanitizeHealthSourceUrl(value) {
  const text = safeText(value, 1000)
  if (!text) return null
  try {
    const url = new URL(text)
    if (url.protocol !== 'https:') return null
    url.username = ''
    url.password = ''
    url.search = ''
    url.hash = ''
    return url.toString().slice(0, 500)
  } catch {
    return null
  }
}

function safeSource(source) {
  if (!source || typeof source !== 'object' || Array.isArray(source)) {
    return { kind: null, id: null, url: null }
  }
  return {
    kind: safeText(source.kind, 80),
    id: safeText(source.id, 120),
    url: sanitizeHealthSourceUrl(source.url),
  }
}

function missingRow(name, label, criticality) {
  return {
    name,
    label,
    criticality,
    status: 'unknown',
    statusLabel: 'Unknown',
    summary: 'Current evidence is unavailable.',
    reasons: ['No canonical subsystem evidence was supplied.'],
    action: null,
    source: { kind: null, id: null, url: null },
    freshness: {
      checkedAt: null,
      dataThroughAt: null,
      observedAt: null,
      ageMs: null,
      text: 'No freshness timestamp',
    },
    details: {},
  }
}

function statusLabel(status) {
  return {
    healthy: 'Healthy',
    degraded: 'Degraded',
    stale: 'Stale',
    unknown: 'Unknown',
    failed: 'Failed',
  }[status] || 'Unknown'
}

function rowFromSubsystem(subsystem, fallback) {
  const [name, defaultLabel, defaultCriticality] = fallback
  const status = canonicalStatus(subsystem?.status)
  return {
    name,
    label: safeText(subsystem?.label, 80) || defaultLabel,
    criticality: safeCriticality(subsystem?.criticality, defaultCriticality),
    status,
    statusLabel: statusLabel(status),
    summary: safeText(subsystem?.summary, 180) || (status === 'healthy' ? 'Current evidence is healthy.' : 'Current evidence needs attention.'),
    reasons: safeReasonList(subsystem?.reasons),
    action: safeText(subsystem?.action, 180),
    source: safeSource(subsystem?.source),
    freshness: null,
    details: safeDetails(subsystem?.details),
  }
}

function overallCopy(status, complete, rows) {
  const problemCount = rows.filter((row) => row.status !== 'healthy').length
  if (!complete) {
    return {
      label: 'Unknown',
      summary: 'Health evidence is incomplete, so current system health cannot be confirmed.',
    }
  }
  if (status === 'healthy') {
    return {
      label: 'Healthy',
      summary: 'All eight canonical health checks are healthy.',
    }
  }
  if (status === 'failed') {
    return {
      label: 'Failed',
      summary: 'A critical PlayGarba health check is failing.',
    }
  }
  if (status === 'degraded') {
    return {
      label: 'Attention needed',
      summary: problemCount > 0
        ? `${problemCount} health ${problemCount === 1 ? 'check needs' : 'checks need'} attention.`
        : 'The canonical snapshot reports degraded health without matching subsystem detail.',
    }
  }
  if (status === 'stale') {
    return {
      label: 'Stale',
      summary: 'Health evidence is stale. Refresh it before relying on the current state.',
    }
  }
  return {
    label: 'Unknown',
    summary: 'Current health cannot be confirmed from the available evidence.',
  }
}

function problemPriority(row, canonicalIndex) {
  return {
    status: STATUS_PRIORITY[row.status] || 0,
    criticality: CRITICALITY_PRIORITY[row.criticality] || 0,
    canonicalIndex,
  }
}

export function buildHealthPresentation(snapshot, { nowMs = Date.now() } = {}) {
  const now = finiteNumber(nowMs)
  if (now == null) throw new Error('invalid_health_presentation_time')

  const structurallyValid = Boolean(
    snapshot
      && typeof snapshot === 'object'
      && !Array.isArray(snapshot)
      && snapshot.schemaVersion === SNAPSHOT_SCHEMA
      && Array.isArray(snapshot.subsystems),
  )

  const suppliedRows = new Map()
  if (structurallyValid) {
    for (const subsystem of snapshot.subsystems) {
      const name = safeText(subsystem?.name, 80)
      if (!name || suppliedRows.has(name)) continue
      suppliedRows.set(name, subsystem)
    }
  }

  const rows = SUBSYSTEMS.map((definition) => {
    const source = suppliedRows.get(definition[0])
    const row = source ? rowFromSubsystem(source, definition) : missingRow(...definition)
    row.freshness = source ? freshnessFor(source, now) : row.freshness
    return row
  })

  const complete = structurallyValid && SUBSYSTEMS.every(([name]) => suppliedRows.has(name))
  const sourceStatus = structurallyValid ? canonicalStatus(snapshot.status) : 'unknown'
  const contradictoryHealthy = sourceStatus === 'healthy' && rows.some((row) => row.status !== 'healthy')
  const status = complete && !contradictoryHealthy ? sourceStatus : 'unknown'
  const copy = overallCopy(status, complete && !contradictoryHealthy, rows)

  const counts = { failed: 0, degraded: 0, stale: 0, unknown: 0 }
  for (const row of rows) {
    if (Object.hasOwn(counts, row.status)) counts[row.status] += 1
  }

  const problems = rows
    .map((row, canonicalIndex) => ({ row, canonicalIndex, priority: problemPriority(row, canonicalIndex) }))
    .filter(({ row }) => row.status !== 'healthy')
    .sort((a, b) => (
      b.priority.status - a.priority.status
      || b.priority.criticality - a.priority.criticality
      || a.priority.canonicalIndex - b.priority.canonicalIndex
    ))
    .map(({ row }) => ({
      subsystem: row.name,
      label: row.label,
      status: row.status,
      statusLabel: row.statusLabel,
      criticality: row.criticality,
      summary: row.summary,
      reason: row.reasons[0] || null,
      action: row.action,
      source: { ...row.source },
      freshness: { ...row.freshness },
    }))

  const actions = problems
    .filter((problem) => problem.action)
    .map((problem) => ({
      subsystem: problem.subsystem,
      label: problem.label,
      status: problem.status,
      action: problem.action,
      source: { ...problem.source },
    }))

  const nonHealthyText = problems.length
    ? problems.map((problem) => `${problem.label}: ${problem.statusLabel}`).join('; ')
    : 'All eight canonical subsystems are healthy'

  return {
    schemaVersion: PRESENTATION_SCHEMA,
    sourceSchemaVersion: structurallyValid ? SNAPSHOT_SCHEMA : null,
    status,
    statusLabel: copy.label,
    summary: copy.summary,
    complete: complete && !contradictoryHealthy,
    generatedAt: structurallyValid ? isoOrNull(snapshot.generatedAt) : null,
    evaluatedAt: structurallyValid ? isoOrNull(snapshot.evaluatedAt) : null,
    leadingSubsystem: complete && !contradictoryHealthy && SUBSYSTEMS.some(([name]) => name === snapshot.leadingSubsystem)
      ? snapshot.leadingSubsystem
      : null,
    counts,
    accessibilitySummary: `PlayGarba Health: ${copy.label}. ${copy.summary} ${nonHealthyText}.`,
    subsystems: rows,
    problems,
    actions,
  }
}

export function healthPresentationSubsystemOrder() {
  return SUBSYSTEMS.map(([name]) => name)
}
