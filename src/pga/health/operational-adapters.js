const HARD_FAILURE_STATES = new Set([
  'failed',
  'failure',
  'error',
  'timed_out',
  'startup_failure',
])

const SUCCESS_STATES = new Set([
  'success',
  'passed',
  'pass',
])

const UNRESOLVED_STATES = new Set([
  'pending',
  'queued',
  'in_progress',
  'inprogress',
  'cancelled',
  'canceled',
  'skipped',
  'unknown',
])

function safeText(value) {
  if (value == null) return null
  const text = String(value).trim()
  return text || null
}

function normaliseState(value) {
  return String(value || 'unknown').trim().toLowerCase().replace(/[ -]+/g, '_')
}

function finiteNumber(value) {
  if (value == null || value === '') return null
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

function copyPresent(target, source, key, outputKey = key) {
  if (!source || typeof source !== 'object') return
  if (!Object.prototype.hasOwnProperty.call(source, key)) return
  const value = source[key]
  if (value == null || value === '') return
  target[outputKey] = value
}

function evidenceSource(kind, url, id = null) {
  return {
    kind,
    id: safeText(id),
    url: safeText(url),
  }
}

function sourceSummaries(sources) {
  if (!Array.isArray(sources)) return []
  return sources.map((source) => {
    const summary = {
      name: safeText(source?.name),
      status: safeText(source?.status),
    }
    if (Object.prototype.hasOwnProperty.call(source || {}, 'sampled')) {
      summary.sampled = typeof source.sampled === 'boolean' ? source.sampled : null
    }
    return summary
  }).filter((source) => source.name || source.status)
}

function hasUnavailableSource(sources) {
  return sourceSummaries(sources).some((source) => {
    const status = normaliseState(source.status)
    return HARD_FAILURE_STATES.has(status) || status === 'unavailable'
  })
}

function baseEvidence({
  status,
  criticality,
  checkedAt,
  dataThroughAt,
  freshnessAt,
  freshnessBudgetMs,
  source,
  summary,
  reason,
  action,
  details,
}) {
  return {
    status,
    criticality,
    checkedAt,
    dataThroughAt,
    freshnessAt,
    freshnessBudgetMs,
    source,
    summary,
    reason,
    action,
    details,
  }
}

export function pwaUpdateEvidence({
  completed,
  ok,
  controlled,
  state,
  activeVersion,
  expectedVersion,
  waitingVersion,
  failureCode,
  checkedAt,
  freshnessBudgetMs,
  sourceUrl,
} = {}) {
  const observedState = normaliseState(state)
  const active = safeText(activeVersion)
  const expected = safeText(expectedVersion)
  const waiting = safeText(waitingVersion)
  const failure = safeText(failureCode)
  const details = {
    completed: completed === true,
  }
  if (typeof controlled === 'boolean') details.controlled = controlled
  if (active) details.activeVersion = active
  if (expected) details.expectedVersion = expected
  if (waiting) details.waitingVersion = waiting
  if (failure) details.failureCode = failure
  if (safeText(state)) details.observedState = observedState

  const common = {
    criticality: 'supporting',
    checkedAt,
    freshnessBudgetMs,
    source: evidenceSource('pwa-observation', sourceUrl, active),
    details,
  }

  if (completed !== true || UNRESOLVED_STATES.has(observedState)) {
    return baseEvidence({
      ...common,
      status: 'unknown',
      summary: 'PWA update health is not yet resolved.',
      reason: completed !== true
        ? 'No completed PWA observation was supplied.'
        : `PWA observation is ${observedState}.`,
      action: 'Complete a fresh installed-PWA update observation.',
    })
  }

  if (ok === false || HARD_FAILURE_STATES.has(observedState) || failure) {
    return baseEvidence({
      ...common,
      status: 'failed',
      summary: 'The PWA update path reported a hard failure.',
      reason: failure
        ? `PWA observation failed with ${failure}.`
        : `PWA observation completed as ${observedState}.`,
      action: 'Inspect the installed service worker and update path.',
    })
  }

  if (controlled !== true) {
    return baseEvidence({
      ...common,
      status: 'degraded',
      summary: 'The installed surface is not controlled by the expected service worker.',
      reason: 'The completed PWA observation did not confirm service-worker control.',
      action: 'Inspect service-worker registration/control and retry the installed app.',
    })
  }

  if (waiting) {
    return baseEvidence({
      ...common,
      status: 'degraded',
      summary: 'A PWA update is waiting to activate.',
      reason: `Waiting worker ${waiting} has not replaced active worker ${active || '(unknown)'}.`,
      action: 'Complete the intended update boundary and verify the new worker activates cleanly.',
    })
  }

  if (!active || !expected) {
    return baseEvidence({
      ...common,
      status: 'unknown',
      summary: 'PWA worker identity is incomplete.',
      reason: !active ? 'Active worker identity is missing.' : 'Expected worker identity is missing.',
      action: 'Resolve both active and expected PWA worker identities.',
    })
  }

  if (active !== expected) {
    return baseEvidence({
      ...common,
      status: 'degraded',
      summary: 'The active PWA worker differs from the expected version.',
      reason: `Expected ${expected} but observed ${active}.`,
      action: 'Reconcile the installed PWA worker with the expected deployment.',
    })
  }

  return baseEvidence({
    ...common,
    status: 'healthy',
    summary: 'The installed PWA is controlled by the expected active worker.',
  })
}

export function playbackSmokeEvidence({
  completed,
  state,
  confirmedStart,
  controlsResponsive,
  contentId,
  failureCode,
  checkedAt,
  freshnessBudgetMs,
  sourceUrl,
} = {}) {
  const observedState = normaliseState(state)
  const canonicalContentId = safeText(contentId)
  const failure = safeText(failureCode)
  const details = {
    completed: completed === true,
  }
  if (safeText(state)) details.observedState = observedState
  if (typeof confirmedStart === 'boolean') details.confirmedStart = confirmedStart
  if (typeof controlsResponsive === 'boolean') details.controlsResponsive = controlsResponsive
  if (canonicalContentId) details.contentId = canonicalContentId
  if (failure) details.failureCode = failure

  const common = {
    criticality: 'critical',
    checkedAt,
    freshnessBudgetMs,
    source: evidenceSource('playback-smoke', sourceUrl, canonicalContentId),
    details,
  }

  if (completed !== true || UNRESOLVED_STATES.has(observedState)) {
    return baseEvidence({
      ...common,
      status: 'unknown',
      summary: 'Canonical playback smoke is not yet resolved.',
      reason: completed !== true
        ? 'No completed canonical playback smoke was supplied.'
        : `Playback smoke is ${observedState}.`,
      action: 'Run or finish the canonical playback smoke.',
    })
  }

  if (
    HARD_FAILURE_STATES.has(observedState)
    || failure
    || confirmedStart === false
    || controlsResponsive === false
  ) {
    let reason = `Playback smoke completed as ${observedState}.`
    if (failure) reason = `Playback smoke failed with ${failure}.`
    else if (confirmedStart === false) reason = 'Canonical playback did not confirm a media start.'
    else if (controlsResponsive === false) reason = 'Canonical playback controls did not remain responsive.'

    return baseEvidence({
      ...common,
      status: 'failed',
      summary: 'Canonical playback smoke found a blocking playback failure.',
      reason,
      action: 'Inspect the failing playback route/runtime evidence.',
    })
  }

  if (SUCCESS_STATES.has(observedState) && confirmedStart === true && controlsResponsive === true) {
    return baseEvidence({
      ...common,
      status: 'healthy',
      summary: 'Canonical playback start and controls passed the smoke check.',
    })
  }

  return baseEvidence({
    ...common,
    status: 'unknown',
    summary: 'Playback smoke completed without enough evidence for a healthy result.',
    reason: 'Healthy playback requires explicit successful state, confirmed start and responsive controls.',
    action: 'Repeat the canonical playback smoke with complete start/control evidence.',
  })
}

export function telemetryHealthEvidence({
  payload,
  checkedAt,
  freshnessBudgetMs,
  sourceUrl,
} = {}) {
  const validPayload = Boolean(payload && typeof payload === 'object' && !Array.isArray(payload))
  const envelopeStatus = validPayload ? normaliseState(payload.status) : 'unknown'
  const sources = validPayload ? sourceSummaries(payload.sources) : []
  const generatedAt = validPayload ? safeText(payload.generatedAt) : null
  const dataThrough = validPayload ? safeText(payload.dataThrough) : null
  const details = {}
  if (generatedAt) details.generatedAt = generatedAt
  if (sources.length > 0) details.sources = sources

  const common = {
    criticality: 'supporting',
    checkedAt,
    dataThroughAt: dataThrough,
    freshnessAt: dataThrough || generatedAt,
    freshnessBudgetMs,
    source: evidenceSource('pga-telemetry-health', sourceUrl),
    details,
  }

  if (!validPayload) {
    return baseEvidence({
      ...common,
      status: 'unknown',
      summary: 'Telemetry health evidence is unavailable.',
      reason: 'No valid protected telemetry-health payload was supplied.',
      action: 'Refresh the protected telemetry health evidence.',
    })
  }

  if (envelopeStatus === 'unavailable' || HARD_FAILURE_STATES.has(envelopeStatus) || hasUnavailableSource(payload.sources)) {
    return baseEvidence({
      ...common,
      status: 'failed',
      summary: 'Protected telemetry health reports an unavailable source.',
      reason: 'A completed telemetry source is unavailable or failed.',
      action: 'Inspect telemetry ingestion/query health before trusting analytics freshness.',
    })
  }

  if (envelopeStatus === 'partial') {
    return baseEvidence({
      ...common,
      status: 'degraded',
      summary: 'Protected telemetry health is only partially available.',
      reason: 'The telemetry health envelope is partial.',
      action: 'Inspect the incomplete telemetry source and recover full coverage.',
    })
  }

  if (envelopeStatus === 'complete') {
    return baseEvidence({
      ...common,
      status: 'healthy',
      summary: 'Protected telemetry health is complete.',
    })
  }

  return baseEvidence({
    ...common,
    status: 'unknown',
    summary: 'Telemetry health state is unresolved.',
    reason: `Telemetry envelope state ${envelopeStatus} is not a completed health result.`,
    action: 'Refresh the protected telemetry health evidence.',
  })
}

export function rollupHealthEvidence({
  payload,
  checkedAt,
  freshnessBudgetMs,
  sourceUrl,
} = {}) {
  const validPayload = Boolean(payload && typeof payload === 'object' && !Array.isArray(payload))
  const envelopeStatus = validPayload ? normaliseState(payload.status) : 'unknown'
  const generatedAt = validPayload ? safeText(payload.generatedAt) : null
  const dataThrough = validPayload ? safeText(payload.dataThrough) : null
  const sources = validPayload ? sourceSummaries(payload.sources) : []
  const rollups = validPayload && Array.isArray(payload?.data?.rollups) ? payload.data.rollups : []
  const latest = rollups[0] && typeof rollups[0] === 'object' ? rollups[0] : null
  const latestStatus = latest ? normaliseState(latest.status) : null
  const details = {}

  if (generatedAt) details.generatedAt = generatedAt
  if (sources.length > 0) details.sources = sources
  if (latest) {
    copyPresent(details, latest, 'id', 'latestRunId')
    copyPresent(details, latest, 'run_id', 'latestRunId')
    copyPresent(details, latest, 'date_key', 'latestDateKey')
    copyPresent(details, latest, 'status', 'latestStatus')
    copyPresent(details, latest, 'data_through_ms', 'latestDataThroughMs')
    copyPresent(details, latest, 'completed_at', 'latestCompletedAt')
  }

  const common = {
    criticality: 'supporting',
    checkedAt,
    dataThroughAt: dataThrough,
    freshnessAt: dataThrough || generatedAt,
    freshnessBudgetMs,
    source: evidenceSource('pga-rollup-health', sourceUrl),
    details,
  }

  if (!validPayload) {
    return baseEvidence({
      ...common,
      status: 'unknown',
      summary: 'Rollup health evidence is unavailable.',
      reason: 'No valid protected rollup-health payload was supplied.',
      action: 'Refresh the protected rollup health evidence.',
    })
  }

  if (
    envelopeStatus === 'unavailable'
    || HARD_FAILURE_STATES.has(envelopeStatus)
    || hasUnavailableSource(payload.sources)
    || (latestStatus && HARD_FAILURE_STATES.has(latestStatus))
  ) {
    return baseEvidence({
      ...common,
      status: 'failed',
      summary: 'Protected rollup health reports a failure.',
      reason: latestStatus && HARD_FAILURE_STATES.has(latestStatus)
        ? `Latest rollup completed as ${latestStatus}.`
        : 'The rollup health source is unavailable or failed.',
      action: 'Inspect and repair the protected daily rollup pipeline.',
    })
  }

  if (!latest) {
    return baseEvidence({
      ...common,
      status: 'unknown',
      summary: 'Rollup health has no completed run evidence.',
      reason: 'No latest rollup record was supplied.',
      action: 'Confirm that the rollup job has produced a protected health record.',
    })
  }

  if (envelopeStatus === 'partial' || latestStatus !== 'complete') {
    return baseEvidence({
      ...common,
      status: 'degraded',
      summary: 'Daily rollup health is incomplete.',
      reason: envelopeStatus === 'partial'
        ? 'The rollup health envelope is partial.'
        : `Latest rollup state is ${latestStatus || 'unknown'}.`,
      action: 'Inspect the latest rollup and recover a complete run.',
    })
  }

  if (envelopeStatus === 'complete' && latestStatus === 'complete') {
    return baseEvidence({
      ...common,
      status: 'healthy',
      summary: 'Latest protected daily rollup is complete.',
    })
  }

  return baseEvidence({
    ...common,
    status: 'unknown',
    summary: 'Rollup health state is unresolved.',
    reason: `Rollup envelope state ${envelopeStatus} is not a completed health result.`,
    action: 'Refresh the protected rollup health evidence.',
  })
}
