export const ACCEPTANCE_STATES = Object.freeze([
  'verified',
  'failed',
  'blocked',
  'not_inspected',
])

export const EVIDENCE_METHODS = Object.freeze([
  'browser_automation',
  'physical_device',
  'assistive_technology',
  'manual_interaction',
  'production_probe',
  'performance_measurement',
  'repository_validation',
  'reviewed_external_evidence',
])

const STATE_SET = new Set(ACCEPTANCE_STATES)
const METHOD_SET = new Set(EVIDENCE_METHODS)
const MAX_FUTURE_SKEW_MS = 5 * 60 * 1000
const SHA_RE = /^[0-9a-f]{40}$/i

function item(id, category, label, methods) {
  return Object.freeze({
    id,
    category,
    label,
    required: true,
    allowedMethods: Object.freeze([...methods]),
  })
}

export const ACCEPTANCE_MATRIX = Object.freeze([
  // Environment, adaptive, PWA and accessibility states from #846.
  item('env.iphone-safari-browser', 'environment', 'iPhone Safari browser', ['physical_device']),
  item('env.iphone-installed-pwa', 'environment', 'Installed iPhone PWA', ['physical_device']),
  item('env.android-chrome-browser', 'environment', 'Android Chrome browser', ['physical_device']),
  item('env.android-installed-pwa', 'environment', 'Installed Android PWA', ['physical_device']),
  item('env.ipad-portrait', 'environment', 'iPad portrait', ['physical_device']),
  item('env.ipad-landscape', 'environment', 'iPad landscape', ['physical_device']),
  item('env.desktop-chrome', 'environment', 'Desktop Chrome', ['browser_automation', 'manual_interaction']),
  item('env.desktop-safari', 'environment', 'Desktop Safari', ['manual_interaction']),
  item('env.narrow-phone', 'environment', 'Narrow phone layout', ['browser_automation', 'physical_device']),
  item('env.short-landscape-phone', 'environment', 'Short landscape phone', ['browser_automation', 'physical_device']),
  item('env.keyboard-only', 'environment', 'Keyboard-only navigation', ['browser_automation', 'manual_interaction']),
  item('env.screen-reader-spot-check', 'environment', 'Screen-reader spot check', ['assistive_technology']),
  item('env.zoom-200', 'environment', '200% text or zoom', ['browser_automation', 'manual_interaction']),
  item('env.reduced-motion', 'environment', 'Reduced motion', ['browser_automation', 'manual_interaction']),
  item('env.increased-forced-contrast', 'environment', 'Increased or forced contrast', ['browser_automation', 'manual_interaction']),
  item('env.offline-flaky-network', 'environment', 'Offline and flaky network', ['browser_automation', 'physical_device']),
  item('env.auth-expired-denied', 'environment', 'Expired or denied access', ['browser_automation', 'manual_interaction', 'production_probe']),
  item('env.telemetry-backend-unavailable', 'environment', 'Telemetry backend unavailable', ['browser_automation', 'manual_interaction']),
  item('env.partial-stale-analytics', 'environment', 'Partial or stale analytics', ['browser_automation', 'manual_interaction']),
  item('env.cold-start-warm-return', 'environment', 'Cold start and warm return', ['performance_measurement', 'physical_device']),

  // Founder journeys from #846.
  item('journey.authenticate-enter-pga', 'journey', 'Authenticate and enter PGA', ['browser_automation', 'manual_interaction', 'physical_device']),
  item('journey.cold-open-home', 'journey', 'Cold-open Home and interpret live/today status', ['browser_automation', 'manual_interaction', 'physical_device']),
  item('journey.switch-ranges-views', 'journey', 'Switch ranges and views without losing context unexpectedly', ['browser_automation', 'manual_interaction', 'physical_device']),
  item('journey.inspect-audience', 'journey', 'Inspect Audience', ['browser_automation', 'manual_interaction', 'physical_device']),
  item('journey.inspect-listening', 'journey', 'Inspect Listening and unmet demand', ['browser_automation', 'manual_interaction', 'physical_device']),
  item('journey.inspect-health', 'journey', 'Inspect Health and follow an actionable problem', ['browser_automation', 'manual_interaction', 'physical_device']),
  item('journey.install-relaunch-pga', 'journey', 'Install and relaunch PGA', ['physical_device']),
  item('journey.recover-network-backend-failure', 'journey', 'Recover from network or backend failure', ['browser_automation', 'manual_interaction', 'physical_device']),
  item('journey.expire-access-safely', 'journey', 'Expire or deny access safely', ['browser_automation', 'manual_interaction', 'physical_device', 'production_probe']),

  // Public PlayGarba regression checks from #846. #452 may provide reviewed evidence,
  // but existence of #452 alone never verifies these entries.
  item('public.player-cold-start', 'public_regression', 'Public player cold start', ['performance_measurement', 'reviewed_external_evidence']),
  item('public.transport-controls', 'public_regression', 'Public play, pause, next and previous controls', ['browser_automation', 'physical_device', 'reviewed_external_evidence']),
  item('public.explore-search', 'public_regression', 'Public Explore and search', ['browser_automation', 'physical_device', 'reviewed_external_evidence']),
  item('public.nonstop', 'public_regression', 'Public Nonstop', ['browser_automation', 'physical_device', 'reviewed_external_evidence']),
  item('public.pwa-install-update-offline', 'public_regression', 'Public PWA install, update and offline shell', ['physical_device', 'reviewed_external_evidence']),
  item('public.telemetry-endpoint-failure', 'public_regression', 'Public player survives telemetry endpoint failure', ['browser_automation', 'physical_device', 'reviewed_external_evidence']),
  item('public.analytics-performance-regression', 'public_regression', 'No material analytics layout-shift or blocking-request regression', ['performance_measurement', 'reviewed_external_evidence']),

  // Quality gates from #846.
  item('quality.no-fake-zero', 'quality', 'No fake zero or error masking', ['browser_automation', 'manual_interaction', 'repository_validation']),
  item('quality.accessible-chart-equivalents', 'quality', 'No inaccessible chart-only information', ['assistive_technology', 'manual_interaction']),
  item('quality.primary-actions-visible', 'quality', 'No hidden primary actions', ['browser_automation', 'manual_interaction', 'physical_device']),
  item('quality.safe-area', 'quality', 'No safe-area collision', ['browser_automation', 'physical_device']),
  item('quality.no-horizontal-overflow', 'quality', 'No normal-mobile horizontal overflow', ['browser_automation', 'physical_device']),
  item('quality.no-excessive-motion', 'quality', 'No excessive motion', ['browser_automation', 'manual_interaction']),
  item('quality.no-critical-console-error', 'quality', 'No console or runtime error in critical flows', ['browser_automation', 'reviewed_external_evidence']),
  item('quality.no-admin-secret-public', 'quality', 'No admin secret in public artefacts', ['repository_validation', 'production_probe', 'reviewed_external_evidence']),
  item('quality.no-public-indexing', 'quality', 'PGA is not publicly indexed', ['repository_validation', 'production_probe', 'reviewed_external_evidence']),
  item('quality.protected-production-build', 'quality', 'Production host serves the intended protected PGA build', ['production_probe']),
])

const MATRIX_BY_ID = new Map(ACCEPTANCE_MATRIX.map((entry) => [entry.id, entry]))

function boundedText(value, max = 240) {
  if (value == null) return null
  const text = String(value).trim()
  return text ? text.slice(0, max) : null
}

function parseTimestamp(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (!value) return null
  const parsed = Date.parse(String(value))
  return Number.isFinite(parsed) ? parsed : null
}

function normaliseRevision(value) {
  const revision = boundedText(value, 80)
  return revision && SHA_RE.test(revision) ? revision.toLowerCase() : null
}

function safeSourceUrl(value) {
  const text = boundedText(value, 500)
  if (!text) return null
  try {
    const url = new URL(text)
    if (url.protocol !== 'https:' || url.username || url.password) return null
    url.search = ''
    url.hash = ''
    return url.toString()
  } catch {
    return null
  }
}

function nonNegativeNumber(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null
}

function sanitiseEvidence(raw = {}) {
  const method = METHOD_SET.has(raw.method) ? raw.method : null
  const observedAtMs = parseTimestamp(raw.observedAt)
  const revision = normaliseRevision(raw.revision)
  const environment = boundedText(raw.environment, 160)
  const sourceUrl = safeSourceUrl(raw.sourceUrl)
  const sourceId = boundedText(raw.sourceId, 160)
  const freshnessBudgetSupplied = Object.prototype.hasOwnProperty.call(raw, 'freshnessBudgetMs')
  const freshnessBudgetMs = freshnessBudgetSupplied
    ? nonNegativeNumber(raw.freshnessBudgetMs)
    : null

  return {
    method,
    observedAtMs,
    revision,
    environment,
    sourceUrl,
    sourceId,
    freshnessBudgetSupplied,
    freshnessBudgetMs,
  }
}

function sanitiseBlocker(raw = {}) {
  const issue = typeof raw.issue === 'number' && Number.isInteger(raw.issue) && raw.issue > 0
    ? raw.issue
    : null
  return {
    code: boundedText(raw.code, 80),
    issue,
    detail: boundedText(raw.detail, 240),
  }
}

function evidenceOutput(evidence) {
  if (!evidence) return null
  const output = {
    method: evidence.method,
    observedAt: new Date(evidence.observedAtMs).toISOString(),
    revision: evidence.revision,
    environment: evidence.environment,
  }
  if (evidence.sourceUrl) output.sourceUrl = evidence.sourceUrl
  if (evidence.sourceId) output.sourceId = evidence.sourceId
  if (evidence.freshnessBudgetMs != null) output.freshnessBudgetMs = evidence.freshnessBudgetMs
  return output
}

function inspectAttempt(entry, attempt, context) {
  const requestedState = STATE_SET.has(attempt?.state) ? attempt.state : 'not_inspected'

  if (requestedState === 'not_inspected') {
    return { state: 'not_inspected', reason: attempt?.state && !STATE_SET.has(attempt.state) ? 'invalid_state' : null }
  }

  if (requestedState === 'blocked') {
    const blocker = sanitiseBlocker(attempt?.blocker || {})
    if (!blocker.code && !blocker.issue && !blocker.detail) {
      return { state: 'not_inspected', reason: 'blocker_evidence_required' }
    }
    return { state: 'blocked', blocker }
  }

  const evidence = sanitiseEvidence(attempt?.evidence || {})
  if (!evidence.method || !entry.allowedMethods.includes(evidence.method)) {
    return { state: 'not_inspected', reason: 'incompatible_evidence_method' }
  }
  if (evidence.freshnessBudgetSupplied && evidence.freshnessBudgetMs == null) {
    return { state: 'not_inspected', reason: 'invalid_freshness_budget' }
  }
  if (evidence.observedAtMs == null) {
    return { state: 'not_inspected', reason: 'evidence_time_required' }
  }
  if (evidence.observedAtMs > context.nowMs + MAX_FUTURE_SKEW_MS) {
    return { state: 'not_inspected', reason: 'future_evidence_time' }
  }
  if (!evidence.environment) {
    return { state: 'not_inspected', reason: 'environment_required' }
  }
  if (!evidence.sourceUrl && !evidence.sourceId) {
    return { state: 'not_inspected', reason: 'evidence_source_required' }
  }
  if (!context.targetRevision) {
    return { state: 'not_inspected', reason: 'target_revision_required' }
  }
  if (!evidence.revision || evidence.revision !== context.targetRevision) {
    return { state: 'not_inspected', reason: 'revision_mismatch' }
  }

  const stale = evidence.freshnessBudgetMs != null
    && context.nowMs - evidence.observedAtMs > evidence.freshnessBudgetMs
  if (requestedState === 'verified' && stale) {
    return { state: 'not_inspected', reason: 'stale_evidence', evidence: evidenceOutput(evidence) }
  }

  return {
    state: requestedState,
    evidence: evidenceOutput(evidence),
    ...(stale ? { stale: true } : {}),
  }
}

export function createAcceptanceLedger(attempts = {}, options = {}) {
  const nowCandidate = Object.prototype.hasOwnProperty.call(options, 'nowMs')
    ? options.nowMs
    : Date.now()
  if (typeof nowCandidate !== 'number' || !Number.isFinite(nowCandidate)) {
    throw new Error('invalid_acceptance_time')
  }
  const nowMs = nowCandidate

  const targetRevision = normaliseRevision(options.targetRevision)
  const targetEnvironment = boundedText(options.targetEnvironment, 160)
  const source = attempts && typeof attempts === 'object' && !Array.isArray(attempts) ? attempts : {}
  const unknownItemIds = Object.keys(source).filter((id) => !MATRIX_BY_ID.has(id)).sort()

  const entries = ACCEPTANCE_MATRIX.map((matrixEntry) => {
    const result = inspectAttempt(matrixEntry, source[matrixEntry.id] || {}, { nowMs, targetRevision })
    return {
      id: matrixEntry.id,
      category: matrixEntry.category,
      label: matrixEntry.label,
      required: matrixEntry.required,
      allowedMethods: [...matrixEntry.allowedMethods],
      state: result.state,
      ...(result.reason ? { reason: result.reason } : {}),
      ...(result.evidence ? { evidence: result.evidence } : {}),
      ...(result.blocker ? { blocker: result.blocker } : {}),
      ...(result.stale ? { stale: true } : {}),
    }
  })

  const counts = Object.fromEntries(ACCEPTANCE_STATES.map((state) => [state, 0]))
  for (const entry of entries) counts[entry.state] += 1

  let status = 'ready'
  if (counts.failed > 0) status = 'failed'
  else if (counts.blocked > 0) status = 'blocked'
  else if (counts.not_inspected > 0) status = 'incomplete'

  return {
    schemaVersion: 'pga-release-acceptance/v1',
    evaluatedAt: new Date(nowMs).toISOString(),
    targetRevision,
    targetEnvironment,
    status,
    counts,
    unknownItemIds,
    entries,
  }
}

export function acceptanceItem(id) {
  const entry = MATRIX_BY_ID.get(id)
  return entry
    ? { ...entry, allowedMethods: [...entry.allowedMethods] }
    : null
}

export function acceptanceMatrix() {
  return ACCEPTANCE_MATRIX.map((entry) => ({ ...entry, allowedMethods: [...entry.allowedMethods] }))
}
