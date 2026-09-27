import { buildIdentityEvidence, checkRunEvidence } from './model.js'

const CANONICAL_ORIGIN = 'https://playgarba.com'
const FULL_SHA = /^[0-9a-f]{40}$/i
const BLOCKING_CHECK_CONCLUSIONS = new Set([
  'failure',
  'failed',
  'error',
  'timed_out',
  'startup_failure',
  'action_required',
])

function safeText(value) {
  if (value == null) return null
  const text = String(value).trim()
  return text || null
}

function checkRunId(value) {
  return typeof value === 'number'
    && Number.isSafeInteger(value)
    && value > 0
    ? value
    : null
}

function httpStatusCode(value) {
  return typeof value === 'number'
    && Number.isInteger(value)
    && value >= 100
    && value <= 599
    ? value
    : null
}

function canonicalSha(value) {
  const sha = safeText(value)
  return sha && FULL_SHA.test(sha) ? sha.toLowerCase() : null
}

function copyPresent(target, source, key, outputKey = key) {
  if (!source || typeof source !== 'object') return
  if (!Object.prototype.hasOwnProperty.call(source, key)) return
  const value = source[key]
  if (value == null) return
  target[outputKey] = value
}

function parseTime(value) {
  if (!value) return -1
  const parsed = Date.parse(String(value))
  return Number.isFinite(parsed) ? parsed : -1
}

function latestCheck(candidates = []) {
  return candidates
    .map((run, index) => ({
      run,
      index,
      timestamp: Math.max(
        parseTime(run?.completed_at),
        parseTime(run?.started_at),
        parseTime(run?.updated_at),
        parseTime(run?.created_at),
      ),
      id: checkRunId(run?.id) ?? -1,
    }))
    .sort((a, b) => (
      b.timestamp - a.timestamp
      || b.id - a.id
      || b.index - a.index
    ))[0]?.run || null
}

function normaliseRequiredChecks(requiredChecks = []) {
  const seen = new Set()
  const names = []
  for (const value of Array.isArray(requiredChecks) ? requiredChecks : []) {
    const name = safeText(value)
    if (!name || seen.has(name)) continue
    seen.add(name)
    names.push(name)
  }
  return names
}

function checkState(run) {
  const status = safeText(run?.status)?.toLowerCase() || 'unknown'
  const conclusion = safeText(run?.conclusion)?.toLowerCase() || null
  if (status !== 'completed') return status
  if (conclusion && BLOCKING_CHECK_CONCLUSIONS.has(conclusion)) return 'failure'
  return conclusion || 'unknown'
}

export function productionProbeEvidence({
  completed,
  ok,
  statusCode,
  error,
  checkedAt,
  freshnessBudgetMs,
  sourceUrl = `${CANONICAL_ORIGIN}/`,
} = {}) {
  const statusCodeSupplied = statusCode !== undefined && statusCode !== null
  const code = httpStatusCode(statusCode)
  const invalidStatusCode = statusCodeSupplied && code == null
  const errorText = safeText(error)
  const source = {
    kind: 'production-probe',
    id: code == null ? null : `http-${code}`,
    url: safeText(sourceUrl),
  }
  const details = {}
  if (code != null) details.statusCode = code
  if (errorText) details.error = errorText

  if (completed !== true) {
    return {
      status: 'unknown',
      criticality: 'critical',
      checkedAt,
      freshnessBudgetMs,
      source,
      summary: 'Production reachability has not been confirmed.',
      reason: 'No completed production probe is available.',
      action: 'Run a fresh production reachability probe.',
      details,
    }
  }

  if (invalidStatusCode && ok !== false && !errorText) {
    return {
      status: 'unknown',
      criticality: 'critical',
      checkedAt,
      freshnessBudgetMs,
      source,
      summary: 'Production probe supplied malformed HTTP status evidence.',
      reason: 'An explicit production status code must be an integer from 100 to 599.',
      action: 'Repeat the production reachability probe with a valid HTTP status code.',
      details,
    }
  }

  const successfulStatus = !statusCodeSupplied || (code != null && code >= 200 && code < 400)
  if (ok === true && successfulStatus && !errorText) {
    return {
      status: 'healthy',
      criticality: 'critical',
      checkedAt,
      freshnessBudgetMs,
      source,
      summary: 'Production responded successfully.',
      details,
    }
  }

  const reason = errorText
    ? `Production probe failed: ${errorText}`
    : code != null
      ? `Production returned HTTP ${code}.`
      : 'The completed production probe did not report success.'

  return {
    status: 'failed',
    criticality: 'critical',
    checkedAt,
    freshnessBudgetMs,
    source,
    summary: 'Production is not currently confirmed reachable.',
    reason,
    action: 'Inspect production reachability and the current deployment.',
    details,
  }
}

export function deploymentBuildEvidence({
  buildInfo,
  expectedRevision,
  checkedAt,
  freshnessBudgetMs,
  sourceUrl = `${CANONICAL_ORIGIN}/build-info.json`,
} = {}) {
  const expected = canonicalSha(expectedRevision)
  const validObject = Boolean(buildInfo && typeof buildInfo === 'object' && !Array.isArray(buildInfo))
  const origin = validObject ? safeText(buildInfo?.deployment?.origin) : null
  const deployed = validObject && origin === CANONICAL_ORIGIN
    ? canonicalSha(buildInfo?.build?.revision)
    : null
  const source = {
    kind: 'build-info',
    id: deployed,
    url: safeText(sourceUrl),
  }

  const evidence = buildIdentityEvidence({
    expectedBuildId: expected,
    deployedBuildId: deployed,
    checkedAt,
    freshnessBudgetMs,
    source,
  })

  const details = { ...evidence.details }
  if (validObject) {
    copyPresent(details, buildInfo, 'generatedAt')
    copyPresent(details, buildInfo?.build, 'workflowRunId')
    copyPresent(details, buildInfo?.catalogue, 'version', 'catalogueVersion')
    copyPresent(details, buildInfo?.catalogue, 'activeSongs')
    copyPresent(details, buildInfo?.catalogue, 'ordinaryListeningSongs')
    copyPresent(details, buildInfo?.playback, 'youtubePlayable')
    copyPresent(details, buildInfo?.playback, 'migrationBacklog')
  }

  if (!validObject) {
    return {
      ...evidence,
      summary: 'Production build diagnostic is unavailable or malformed.',
      reason: 'build-info.json was not supplied as an object.',
      action: 'Re-fetch and validate the production build diagnostic.',
      details,
    }
  }

  if (origin !== CANONICAL_ORIGIN) {
    return {
      ...evidence,
      summary: 'Production build diagnostic does not identify the canonical PlayGarba origin.',
      reason: `Expected deployment origin ${CANONICAL_ORIGIN} but observed ${origin || '(missing)'}.`,
      action: 'Reject the diagnostic and verify the canonical production source.',
      details,
    }
  }

  if (!deployed) {
    return {
      ...evidence,
      summary: 'Production build diagnostic has an invalid revision.',
      reason: 'The deployed build revision is missing or is not a full Git commit SHA.',
      action: 'Re-check the deployed build-info.json identity.',
      details,
    }
  }

  if (!expected) {
    return {
      ...evidence,
      summary: 'Expected deployment identity is incomplete.',
      reason: 'The expected revision is missing or is not a full Git commit SHA.',
      action: 'Resolve the expected production revision before comparing builds.',
      details,
    }
  }

  return { ...evidence, details }
}

export function requiredChecksEvidence({
  checkRunsPayload,
  requiredChecks,
  checkedAt,
  freshnessBudgetMs,
  sourceUrl,
} = {}) {
  const required = normaliseRequiredChecks(requiredChecks)
  const runs = Array.isArray(checkRunsPayload)
    ? checkRunsPayload
    : Array.isArray(checkRunsPayload?.check_runs)
      ? checkRunsPayload.check_runs
      : []
  const source = {
    kind: 'github-check-runs',
    id: null,
    url: safeText(sourceUrl),
  }

  if (required.length === 0) {
    return {
      status: 'unknown',
      label: 'CI',
      criticality: 'important',
      checkedAt,
      freshnessBudgetMs,
      source,
      summary: 'Required CI checks are not configured.',
      reason: 'No required check names were supplied.',
      action: 'Configure the explicit required CI check list.',
      details: { requiredChecks: [] },
    }
  }

  const checks = required.map((name) => {
    const selected = latestCheck(runs.filter((run) => safeText(run?.name) === name))
    if (!selected) {
      return {
        name,
        status: 'missing',
        conclusion: null,
        id: null,
        detailsUrl: null,
        completedAt: null,
        evidenceStatus: 'unknown',
      }
    }

    const state = checkState(selected)
    const evidence = checkRunEvidence({ state, checkedAt, label: name })
    return {
      name,
      status: safeText(selected.status)?.toLowerCase() || 'unknown',
      conclusion: safeText(selected.conclusion)?.toLowerCase() || null,
      id: checkRunId(selected.id),
      detailsUrl: safeText(selected.details_url || selected.html_url),
      completedAt: safeText(selected.completed_at),
      evidenceStatus: evidence.status,
    }
  })

  const failed = checks.filter((check) => check.evidenceStatus === 'failed')
  const unresolved = checks.filter((check) => check.evidenceStatus !== 'healthy' && check.evidenceStatus !== 'failed')

  if (failed.length > 0) {
    const names = failed.map((check) => check.name).join(', ')
    return {
      status: 'failed',
      label: 'CI',
      criticality: 'important',
      checkedAt,
      freshnessBudgetMs,
      source,
      summary: 'One or more required CI checks are failing.',
      reason: `Failing required checks: ${names}.`,
      action: 'Inspect the failing required CI checks before treating the build as healthy.',
      details: { requiredChecks: required, checks },
    }
  }

  if (unresolved.length > 0) {
    const names = unresolved.map((check) => check.name).join(', ')
    return {
      status: 'unknown',
      label: 'CI',
      criticality: 'important',
      checkedAt,
      freshnessBudgetMs,
      source,
      summary: 'Required CI checks are not fully resolved.',
      reason: `Unresolved required checks: ${names}.`,
      action: 'Wait for or re-run the unresolved required CI checks.',
      details: { requiredChecks: required, checks },
    }
  }

  return {
    status: 'healthy',
    label: 'CI',
    criticality: 'important',
    checkedAt,
    freshnessBudgetMs,
    source,
    summary: 'All required CI checks are passing.',
    details: { requiredChecks: required, checks },
  }
}
