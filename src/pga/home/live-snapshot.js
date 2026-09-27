import {
  buildHomeSnapshot,
  compareKpis,
  evaluateKpi,
  summarizeTrend,
} from './model.js'
import { aggregatePresence } from '../presence/model.js'

const BLOCKING_HOME_STATES = new Set(['auth-expired', 'offline'])
const LIVE_METRIC_NAMES = Object.freeze(['liveNow', 'listeningNow', 'browsingNow'])

function finiteNonNegative(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null
}

function liveMetricEvidence(presence, name) {
  const value = finiteNonNegative(presence?.[name])
  const evidence = {
    status: presence?.status || 'unavailable',
    checkedAt: presence?.checkedAt ?? null,
    dataThroughAt: presence?.dataThroughAt ?? null,
    reason: presence?.reason ?? null,
  }

  if (presence?.source) {
    evidence.source = {
      kind: 'presence',
      id: String(presence.source),
    }
  }
  if (value != null) evidence.value = value
  return evidence
}

function composeLive(presence, nowMs) {
  const metrics = {}
  for (const name of LIVE_METRIC_NAMES) {
    metrics[name] = evaluateKpi(liveMetricEvidence(presence, name), { nowMs })
  }

  return Object.freeze({
    status: presence.status,
    metrics: Object.freeze(metrics),
    breakdowns: presence.breakdowns ?? null,
    checkedAt: presence.checkedAt ?? null,
    dataThroughAt: presence.dataThroughAt ?? null,
    source: presence.source ?? null,
    reason: presence.reason ?? null,
  })
}

function sourceMetrics(source) {
  return Object.values(source.metrics || {})
}

function sourceHasUsableValues(source) {
  return sourceMetrics(source).some((metric) => metric?.value != null)
}

function sourceIsComplete(source) {
  const metrics = sourceMetrics(source)
  return source.status === 'available'
    && metrics.length > 0
    && metrics.every((metric) => metric?.status === 'available' && metric.value != null)
}

function deriveOverallStatus(home, live) {
  if (BLOCKING_HOME_STATES.has(home.status)) return home.status

  const homeUsable = sourceHasUsableValues(home)
  const liveUsable = sourceHasUsableValues(live)

  if (home.status === 'stale' || live.status === 'stale') return 'stale'
  if (home.status === 'loading' && !homeUsable) return liveUsable ? 'partial' : 'loading'
  if (home.status === 'error') return liveUsable ? 'partial' : 'error'
  if (live.status === 'error') return homeUsable ? 'partial' : 'error'
  if (home.status === 'partial') return 'partial'

  if (sourceIsComplete(home) && sourceIsComplete(live)) return 'available'
  if (homeUsable || liveUsable) return 'partial'
  return 'unavailable'
}

function resolveComparisonValue(pair, side, home) {
  const metricKey = pair?.[`${side}Metric`]
  if (typeof metricKey === 'string' && metricKey.trim()) {
    return home.metrics[metricKey] || { status: 'unavailable' }
  }
  if (pair && Object.prototype.hasOwnProperty.call(pair, side)) return pair[side]
  return { status: 'unavailable' }
}

function composeComparisons(input, home, nowMs) {
  const comparisons = {}
  const entries = input && typeof input === 'object' && !Array.isArray(input)
    ? Object.entries(input).sort(([left], [right]) => left.localeCompare(right))
    : []

  for (const [name, pair] of entries) {
    comparisons[name] = compareKpis(
      resolveComparisonValue(pair, 'current', home),
      resolveComparisonValue(pair, 'prior', home),
      { nowMs },
    )
  }
  return Object.freeze(comparisons)
}

function composeTrends(input) {
  const trends = {}
  const entries = input && typeof input === 'object' && !Array.isArray(input)
    ? Object.entries(input).sort(([left], [right]) => left.localeCompare(right))
    : []

  for (const [name, specification] of entries) {
    const spec = Array.isArray(specification)
      ? { points: specification }
      : specification && typeof specification === 'object'
        ? specification
        : { points: [] }
    trends[name] = summarizeTrend(spec.points, {
      label: spec.label || name,
      valueKey: spec.valueKey || 'value',
    })
  }
  return Object.freeze(trends)
}

export function composeHomeLiveSnapshot(input = {}, { nowMs = Date.now() } = {}) {
  const now = typeof nowMs === 'number' && Number.isFinite(nowMs) ? nowMs : null
  if (now == null) throw new TypeError('nowMs must be a finite number')

  const source = input && typeof input === 'object' && !Array.isArray(input) ? input : {}
  const home = buildHomeSnapshot(source.home || {}, { nowMs: now })
  const presence = aggregatePresence(source.presence, { nowMs: now })
  const live = composeLive(presence, now)

  return Object.freeze({
    schemaVersion: 'pga-home-live/v1',
    evaluatedAt: now,
    status: deriveOverallStatus(home, live),
    home,
    live,
    comparisons: composeComparisons(source.comparisons, home, now),
    trends: composeTrends(source.trends),
  })
}
