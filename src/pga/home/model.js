export const HOME_STATES = Object.freeze([
  'loading',
  'available',
  'partial',
  'stale',
  'unavailable',
  'offline',
  'auth-expired',
  'error',
])

const HOME_STATE_SET = new Set(HOME_STATES)
const VALUE_STATES = new Set(['available', 'partial', 'stale'])

function finiteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function nonNegativeNumber(value) {
  const number = finiteNumber(value)
  return number != null && number >= 0 ? number : null
}

function normaliseTimestamp(value) {
  if (value == null || value === '') return null
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  const parsed = Date.parse(String(value))
  return Number.isFinite(parsed) ? parsed : null
}

function safeText(value, max = 240) {
  if (value == null) return null
  const text = String(value).trim()
  return text ? text.slice(0, max) : null
}

function normaliseState(value, fallback = 'unavailable') {
  const state = String(value || '').trim().toLowerCase()
  return HOME_STATE_SET.has(state) ? state : fallback
}

function optionalBooleanFlag(source, key) {
  if (!Object.prototype.hasOwnProperty.call(source, key)) return false
  return typeof source[key] === 'boolean' ? source[key] : null
}

function sourceValue(source) {
  if (!source || typeof source !== 'object') return null
  const normalised = {
    kind: safeText(source.kind, 80),
    id: safeText(source.id, 160),
    url: safeText(source.url, 320),
  }
  return Object.values(normalised).some(Boolean) ? Object.freeze(normalised) : null
}

function trimFixed(value, digits) {
  const fixed = Number(value).toFixed(digits)
  return fixed.replace(/\.0+$|(?<=\.[0-9]*?)0+$/g, '').replace(/\.$/, '')
}

export function formatCompactNumber(value) {
  const number = nonNegativeNumber(value)
  if (number == null) return '—'
  if (number < 1_000) {
    return Number.isInteger(number) ? String(number) : trimFixed(number, 1)
  }

  const units = [
    { threshold: 1_000_000_000, suffix: 'B' },
    { threshold: 1_000_000, suffix: 'M' },
    { threshold: 1_000, suffix: 'K' },
  ]

  for (const unit of units) {
    if (number >= unit.threshold) {
      const scaled = number / unit.threshold
      const digits = scaled >= 100 ? 0 : scaled >= 10 ? 1 : 1
      return `${trimFixed(scaled, digits)}${unit.suffix}`
    }
  }

  return String(number)
}

export function evaluateKpi(input = {}, { nowMs = Date.now() } = {}) {
  const now = finiteNumber(nowMs)
  if (now == null) throw new TypeError('nowMs must be a finite number')

  const evidence = input && typeof input === 'object' && !Array.isArray(input) ? input : {}
  const observedState = normaliseState(evidence.status, 'unavailable')
  const hasValue = Object.prototype.hasOwnProperty.call(evidence, 'value')
  const suppliedValue = hasValue ? finiteNumber(evidence.value) : null
  const validValue = hasValue ? nonNegativeNumber(evidence.value) : null
  const checkedAt = normaliseTimestamp(evidence.checkedAt ?? evidence.checked_at)
  const dataThroughAt = normaliseTimestamp(evidence.dataThroughAt ?? evidence.data_through_at)
  const freshnessAt = normaliseTimestamp(
    evidence.freshnessAt ?? evidence.freshness_at ?? dataThroughAt ?? checkedAt,
  )
  const hasFreshnessBudget = Object.prototype.hasOwnProperty.call(evidence, 'freshnessBudgetMs')
    || Object.prototype.hasOwnProperty.call(evidence, 'freshness_budget_ms')
  const rawFreshnessBudget = evidence.freshnessBudgetMs ?? evidence.freshness_budget_ms
  const freshnessBudgetMs = hasFreshnessBudget ? nonNegativeNumber(rawFreshnessBudget) : null

  let status = observedState
  let reason = safeText(evidence.reason)

  if (VALUE_STATES.has(status) && hasValue && validValue == null) {
    status = 'error'
    reason = suppliedValue != null && suppliedValue < 0
      ? 'Metric value cannot be negative.'
      : 'Metric value must be a finite non-negative number.'
  } else if (VALUE_STATES.has(status) && hasFreshnessBudget && freshnessBudgetMs == null) {
    status = 'error'
    reason = 'Freshness budget must be a finite non-negative number.'
  } else if (status === 'available' && !hasValue) {
    status = 'unavailable'
    reason ||= 'Metric value is unavailable.'
  } else if (
    (status === 'available' || status === 'partial')
    && freshnessAt != null
    && freshnessBudgetMs != null
    && now - freshnessAt > freshnessBudgetMs
  ) {
    status = 'stale'
    reason ||= `Metric evidence is older than its ${freshnessBudgetMs} ms freshness budget.`
  }

  const value = VALUE_STATES.has(status) && validValue != null ? validValue : null
  const sampled = optionalBooleanFlag(evidence, 'sampled')
  const precision = safeText(evidence.precision, 40) || (sampled === true ? 'estimated' : null)

  return Object.freeze({
    status,
    observedStatus: observedState,
    value,
    exactValue: value,
    displayValue: value == null ? '—' : formatCompactNumber(value),
    zeroData: value === 0,
    checkedAt,
    dataThroughAt,
    freshnessAt,
    freshnessBudgetMs,
    ageMs: freshnessAt == null ? null : Math.max(0, now - freshnessAt),
    precision,
    sampled,
    source: sourceValue(evidence.source),
    action: safeText(evidence.action),
    reason,
  })
}

function evaluatedKpi(value, options) {
  if (
    value
    && typeof value === 'object'
    && HOME_STATE_SET.has(value.status)
    && Object.prototype.hasOwnProperty.call(value, 'displayValue')
    && Object.prototype.hasOwnProperty.call(value, 'exactValue')
  ) {
    return value
  }
  return evaluateKpi(value, options)
}

export function compareKpis(currentInput, priorInput, { nowMs = Date.now() } = {}) {
  const current = evaluatedKpi(currentInput, { nowMs })
  const prior = evaluatedKpi(priorInput, { nowMs })

  if (current.value == null || prior.value == null) {
    return Object.freeze({
      status: 'unavailable',
      direction: 'unknown',
      delta: null,
      percent: null,
      label: 'Comparison unavailable',
      current,
      prior,
    })
  }

  const delta = current.value - prior.value

  if (prior.value === 0 && current.value > 0) {
    return Object.freeze({
      status: 'new-activity',
      direction: 'up',
      delta,
      percent: null,
      label: 'New activity',
      current,
      prior,
    })
  }

  if (prior.value === 0 && current.value === 0) {
    return Object.freeze({
      status: 'comparable',
      direction: 'flat',
      delta: 0,
      percent: 0,
      label: 'No change',
      current,
      prior,
    })
  }

  const percent = Math.round(((delta / prior.value) * 100) * 10) / 10
  const direction = delta > 0 ? 'up' : delta < 0 ? 'down' : 'flat'
  const sign = percent > 0 ? '+' : ''

  return Object.freeze({
    status: 'comparable',
    direction,
    delta,
    percent,
    label: direction === 'flat' ? 'No change' : `${sign}${percent}% vs prior period`,
    current,
    prior,
  })
}

function trendPointValue(point, valueKey) {
  if (typeof point === 'number') return nonNegativeNumber(point)
  if (!point || typeof point !== 'object') return null
  return nonNegativeNumber(point[valueKey])
}

export function summarizeTrend(points, {
  label = 'Activity',
  valueKey = 'value',
} = {}) {
  const values = (Array.isArray(points) ? points : [])
    .map((point) => trendPointValue(point, valueKey))
    .filter((value) => value != null)

  if (values.length < 2) {
    return Object.freeze({
      status: 'insufficient',
      direction: 'unknown',
      first: values[0] ?? null,
      last: values[0] ?? null,
      minimum: values[0] ?? null,
      maximum: values[0] ?? null,
      pointCount: values.length,
      text: `${label} trend needs at least two valid points.`,
    })
  }

  const first = values[0]
  const last = values[values.length - 1]
  const minimum = Math.min(...values)
  const maximum = Math.max(...values)
  const direction = last > first ? 'up' : last < first ? 'down' : 'flat'
  const verb = direction === 'up' ? 'rose' : direction === 'down' ? 'fell' : 'stayed flat'
  const movement = direction === 'flat'
    ? `${label} ${verb} at ${formatCompactNumber(last)}`
    : `${label} ${verb} from ${formatCompactNumber(first)} to ${formatCompactNumber(last)}`

  return Object.freeze({
    status: 'available',
    direction,
    first,
    last,
    minimum,
    maximum,
    pointCount: values.length,
    text: `${movement} across ${values.length} points; range ${formatCompactNumber(minimum)}–${formatCompactNumber(maximum)}.`,
  })
}

export function buildHomeSnapshot(input = {}, { nowMs = Date.now() } = {}) {
  const now = finiteNumber(nowMs)
  if (now == null) throw new TypeError('nowMs must be a finite number')
  const source = input && typeof input === 'object' && !Array.isArray(input) ? input : {}
  const status = normaliseState(source.status, 'unavailable')
  const metricEntries = source.metrics && typeof source.metrics === 'object' && !Array.isArray(source.metrics)
    ? Object.entries(source.metrics)
    : []

  const metrics = {}
  for (const [name, metric] of metricEntries) {
    const inheritedStatus = metric && typeof metric === 'object' && metric.status
      ? metric.status
      : status === 'partial'
        ? 'unavailable'
        : status
    metrics[name] = evaluateKpi({
      ...(metric && typeof metric === 'object' ? metric : {}),
      status: inheritedStatus,
    }, { nowMs: now })
  }

  const availableCount = Object.values(metrics).filter((metric) => metric.value != null).length
  const missingCount = Object.keys(metrics).length - availableCount

  return Object.freeze({
    schemaVersion: 'pga-home/v1',
    evaluatedAt: now,
    status,
    metrics: Object.freeze(metrics),
    availableMetricCount: availableCount,
    missingMetricCount: missingCount,
    checkedAt: normaliseTimestamp(source.checkedAt ?? source.checked_at),
    dataThroughAt: normaliseTimestamp(source.dataThroughAt ?? source.data_through_at),
    precision: safeText(source.precision, 40),
    sampled: optionalBooleanFlag(source, 'sampled'),
    source: sourceValue(source.source),
    action: safeText(source.action),
    reason: safeText(source.reason),
  })
}
