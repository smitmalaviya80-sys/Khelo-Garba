import { composeHealthSnapshot } from './snapshot.js'

const CANONICAL_ORIGIN = 'https://playgarba.com'
const PRODUCTION_URL = `${CANONICAL_ORIGIN}/`
const BUILD_INFO_URL = `${CANONICAL_ORIGIN}/build-info.json`
const GITHUB_API_ORIGIN = 'https://api.github.com'
const GITHUB_WEB_ORIGIN = 'https://github.com'
const FULL_SHA = /^[0-9a-f]{40}$/i
const REPOSITORY_COMPONENT = /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/
const DEFAULT_TIMEOUT_MS = 5_000
const MAX_TIMEOUT_MS = 10_000
const BUILD_INFO_MAX_BYTES = 64 * 1024
const GITHUB_CHECKS_MAX_BYTES = 512 * 1024
const MAX_REQUIRED_CHECKS = 50
const MAX_CHECK_NAME_LENGTH = 160
const MAX_CHECK_RUNS = 100

export const HEALTH_COLLECTOR_LIMITS = Object.freeze({
  defaultTimeoutMs: DEFAULT_TIMEOUT_MS,
  maxTimeoutMs: MAX_TIMEOUT_MS,
  buildInfoMaxBytes: BUILD_INFO_MAX_BYTES,
  githubChecksMaxBytes: GITHUB_CHECKS_MAX_BYTES,
  maxRequiredChecks: MAX_REQUIRED_CHECKS,
  maxCheckRuns: MAX_CHECK_RUNS,
})

function safeText(value, max = 160) {
  if (value == null) return null
  const text = String(value).trim()
  return text ? text.slice(0, max) : null
}

function fullSha(value) {
  const sha = safeText(value, 40)
  return sha && FULL_SHA.test(sha) ? sha.toLowerCase() : null
}

function finiteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function positiveSafeInteger(value) {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0 ? value : null
}

function boundedTimeout(value) {
  const number = Number(value)
  if (!Number.isFinite(number) || number <= 0) return DEFAULT_TIMEOUT_MS
  return Math.max(1, Math.min(MAX_TIMEOUT_MS, Math.floor(number)))
}

function freshnessBudget(budgets, name) {
  if (!budgets || typeof budgets !== 'object' || Array.isArray(budgets)) return undefined
  const value = budgets[name]
  const number = finiteNumber(value)
  return number != null && number >= 0 ? number : undefined
}

function isPlainObject(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function repositoryName(value) {
  const raw = value == null ? '' : String(value).trim()
  if (!raw || raw.length > 205) return null
  const parts = raw.split('/')
  if (parts.length !== 2) return null
  if (!parts.every((part) => REPOSITORY_COMPONENT.test(part) && part !== '.' && part !== '..')) return null
  return `${parts[0]}/${parts[1]}`
}

function requiredCheckNames(value) {
  if (!Array.isArray(value) || value.length > MAX_REQUIRED_CHECKS) return null
  const names = []
  const seen = new Set()
  for (const item of value) {
    const raw = item == null ? '' : String(item).trim()
    if (!raw || raw.length > MAX_CHECK_NAME_LENGTH) return null
    if (seen.has(raw)) continue
    seen.add(raw)
    names.push(raw)
  }
  return names
}

function safeToken(value) {
  if (value == null) return null
  const token = String(value).trim()
  if (!token || token.length > 512 || /[\r\n]/.test(token)) return null
  return token
}

function safeGithubWebUrl(value) {
  const text = safeText(value, 800)
  if (!text) return null
  try {
    const url = new URL(text)
    if (url.origin !== GITHUB_WEB_ORIGIN || url.username || url.password) return null
    url.search = ''
    url.hash = ''
    return url.toString().slice(0, 500)
  } catch {
    return null
  }
}

function githubCheckUrls(repository, revision) {
  const repo = repositoryName(repository)
  const sha = fullSha(revision)
  if (!repo || !sha) return null
  const encoded = repo.split('/').map(encodeURIComponent).join('/')
  return {
    api: `${GITHUB_API_ORIGIN}/repos/${encoded}/commits/${sha}/check-runs?per_page=${MAX_CHECK_RUNS}`,
    web: `${GITHUB_WEB_ORIGIN}/${repo}/commit/${sha}/checks`,
  }
}

function responseHeader(response, name) {
  try {
    return response?.headers?.get?.(name) ?? null
  } catch {
    return null
  }
}

function readWithAbort(reader, signal) {
  if (signal.aborted) return Promise.reject(new Error('collector_timeout'))
  return new Promise((resolve, reject) => {
    let settled = false
    const finish = (callback, value) => {
      if (settled) return
      settled = true
      signal.removeEventListener('abort', onAbort)
      callback(value)
    }
    const onAbort = () => finish(reject, new Error('collector_timeout'))
    signal.addEventListener('abort', onAbort, { once: true })
    Promise.resolve()
      .then(() => reader.read())
      .then((value) => finish(resolve, value), (error) => finish(reject, error))
  })
}

async function readBoundedText(response, maxBytes, signal) {
  const contentLength = responseHeader(response, 'content-length')
  if (contentLength != null && contentLength !== '') {
    const declaredLength = Number(contentLength)
    if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
      return { ok: false, errorCode: 'body_too_large' }
    }
  }

  const reader = response?.body?.getReader?.()
  if (!reader) return { ok: false, errorCode: 'invalid_response' }

  const decoder = new TextDecoder()
  let total = 0
  let text = ''

  try {
    while (true) {
      const { done, value } = await readWithAbort(reader, signal)
      if (done) break
      if (!(value instanceof Uint8Array)) return { ok: false, errorCode: 'invalid_response' }
      total += value.byteLength
      if (total > maxBytes) {
        try { await reader.cancel() } catch {}
        return { ok: false, errorCode: 'body_too_large' }
      }
      text += decoder.decode(value, { stream: true })
    }
    text += decoder.decode()
  } catch {
    try { await reader.cancel() } catch {}
    return { ok: false, errorCode: signal.aborted ? 'timeout' : 'network_error' }
  }

  return { ok: true, text }
}

function expectedResponseUrl(response, requestUrl) {
  const finalUrl = safeText(response?.url, 1000)
  if (!finalUrl) return false
  try {
    return new URL(finalUrl).href === new URL(requestUrl).href
  } catch {
    return false
  }
}

async function fetchBounded(fetchImpl, url, {
  timeoutMs,
  headers,
  jsonMaxBytes = null,
} = {}) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), boundedTimeout(timeoutMs))
  const finish = (result) => {
    clearTimeout(timer)
    return result
  }

  let response
  try {
    response = await fetchImpl(url, {
      method: 'GET',
      redirect: 'manual',
      cache: 'no-store',
      headers,
      signal: controller.signal,
    })
  } catch {
    return finish({
      ok: false,
      statusCode: null,
      errorCode: controller.signal.aborted ? 'timeout' : 'network_error',
      data: null,
    })
  }

  const statusCode = Number(response?.status)
  if (!Number.isFinite(statusCode) || statusCode < 100 || statusCode > 599) {
    return finish({ ok: false, statusCode: null, errorCode: 'invalid_response', data: null })
  }
  if (!expectedResponseUrl(response, url)) {
    return finish({ ok: false, statusCode, errorCode: 'off_origin', data: null })
  }
  if (statusCode < 200 || statusCode >= 300) {
    return finish({ ok: false, statusCode, errorCode: `http_${statusCode}`, data: null })
  }
  if (jsonMaxBytes == null) {
    return finish({ ok: true, statusCode, errorCode: null, data: null })
  }

  const body = await readBoundedText(response, jsonMaxBytes, controller.signal)
  if (!body.ok) return finish({ ok: false, statusCode, errorCode: body.errorCode, data: null })

  try {
    return finish({ ok: true, statusCode, errorCode: null, data: JSON.parse(body.text) })
  } catch {
    return finish({ ok: false, statusCode, errorCode: 'invalid_json', data: null })
  }
}

function safeCheckRun(run) {
  if (!isPlainObject(run)) return null
  const name = safeText(run.name, MAX_CHECK_NAME_LENGTH)
  if (!name) return null

  const output = {
    name,
    status: safeText(run.status, 40),
    conclusion: safeText(run.conclusion, 80),
    completed_at: safeText(run.completed_at, 80),
    started_at: safeText(run.started_at, 80),
    updated_at: safeText(run.updated_at, 80),
    created_at: safeText(run.created_at, 80),
    details_url: safeGithubWebUrl(run.details_url || run.html_url),
  }

  const id = positiveSafeInteger(run.id)
  if (id != null) output.id = id
  return output
}

function boundedCheckRunsPayload(value) {
  if (!isPlainObject(value) || !Array.isArray(value.check_runs)) return null
  const checkRuns = value.check_runs
    .slice(0, MAX_CHECK_RUNS)
    .map(safeCheckRun)
    .filter(Boolean)
  return { check_runs: checkRuns }
}

function boundedOperationalObservation(observations, name, budgets) {
  const source = isPlainObject(observations?.[name]) ? observations[name] : {}
  const budget = freshnessBudget(budgets, name)
  if (budget == null || Object.prototype.hasOwnProperty.call(source, 'freshnessBudgetMs')) return source
  return { ...source, freshnessBudgetMs: budget }
}

function ciObservation({
  payload,
  requiredChecks,
  repository,
  revision,
  checkedAt,
  freshnessBudgetMs,
}) {
  const urls = githubCheckUrls(repository, revision)
  return {
    checkRunsPayload: payload,
    requiredChecks: requiredChecks || [],
    checkedAt,
    freshnessBudgetMs,
    sourceUrl: urls?.web || null,
  }
}

export async function collectHealthSnapshot({
  fetchImpl = globalThis.fetch,
  nowMs = Date.now(),
  timeoutMs = DEFAULT_TIMEOUT_MS,
  expectedRevision,
  githubRepository,
  githubToken,
  requiredChecks = [],
  freshnessBudgets = {},
  observations = {},
} = {}) {
  if (typeof fetchImpl !== 'function') throw new Error('health_collector_fetch_required')
  const now = finiteNumber(nowMs)
  if (now == null) throw new Error('invalid_health_collector_time')

  const revision = fullSha(expectedRevision)
  const repository = repositoryName(githubRepository)
  const checks = requiredCheckNames(requiredChecks)
  const token = safeToken(githubToken)
  const checkUrls = repository && revision && checks && checks.length > 0
    ? githubCheckUrls(repository, revision)
    : null

  const productionPromise = fetchBounded(fetchImpl, PRODUCTION_URL, {
    timeoutMs,
    headers: { accept: 'text/html,application/xhtml+xml' },
  })
  const buildPromise = fetchBounded(fetchImpl, BUILD_INFO_URL, {
    timeoutMs,
    headers: { accept: 'application/json' },
    jsonMaxBytes: BUILD_INFO_MAX_BYTES,
  })
  const checksPromise = checkUrls
    ? fetchBounded(fetchImpl, checkUrls.api, {
        timeoutMs,
        headers: {
          accept: 'application/vnd.github+json',
          ...(token ? { authorization: `Bearer ${token}` } : {}),
          'x-github-api-version': '2022-11-28',
        },
        jsonMaxBytes: GITHUB_CHECKS_MAX_BYTES,
      })
    : Promise.resolve({ ok: false, statusCode: null, errorCode: 'not_configured', data: null })

  const [productionResult, buildResult, checksResult] = await Promise.all([
    productionPromise,
    buildPromise,
    checksPromise,
  ])

  const productionError = productionResult.ok ? null : productionResult.errorCode
  const safeChecksPayload = checksResult.ok ? boundedCheckRunsPayload(checksResult.data) : null

  const healthObservations = {
    production: {
      completed: true,
      ok: productionResult.ok,
      statusCode: productionResult.statusCode,
      error: productionError,
      checkedAt: now,
      freshnessBudgetMs: freshnessBudget(freshnessBudgets, 'production'),
      sourceUrl: PRODUCTION_URL,
    },
    deployment: {
      buildInfo: buildResult.ok && isPlainObject(buildResult.data) ? buildResult.data : null,
      expectedRevision: revision,
      checkedAt: now,
      freshnessBudgetMs: freshnessBudget(freshnessBudgets, 'deployment'),
      sourceUrl: BUILD_INFO_URL,
    },
    ci: ciObservation({
      payload: safeChecksPayload,
      requiredChecks: checks,
      repository,
      revision,
      checkedAt: now,
      freshnessBudgetMs: freshnessBudget(freshnessBudgets, 'ci'),
    }),
    playback: boundedOperationalObservation(observations, 'playback', freshnessBudgets),
    catalogue: boundedOperationalObservation(observations, 'catalogue', freshnessBudgets),
    telemetry: boundedOperationalObservation(observations, 'telemetry', freshnessBudgets),
    rollups: boundedOperationalObservation(observations, 'rollups', freshnessBudgets),
    pwa: boundedOperationalObservation(observations, 'pwa', freshnessBudgets),
  }

  return composeHealthSnapshot(healthObservations, { nowMs: now })
}

export function healthCollectorTargets({ githubRepository, revision } = {}) {
  const github = githubCheckUrls(githubRepository, revision)
  return {
    production: PRODUCTION_URL,
    buildInfo: BUILD_INFO_URL,
    githubChecksApi: github?.api || null,
    githubChecksWeb: github?.web || null,
  }
}
