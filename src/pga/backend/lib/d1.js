import { SCHEMA_VERSION } from './constants.js'

function asIso(ms) {
  const value = ms === undefined ? Date.now() : ms
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new Error('invalid_rollup_time')
  }
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) throw new Error('invalid_rollup_time')
  return date.toISOString()
}

function finiteMetricValue(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error('invalid_metric_value')
  }
  return value
}

function optionalDataThroughMs(value) {
  if (value == null) return null
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new Error('invalid_data_through_ms')
  }
  return value
}

function readDataThroughMs(row) {
  if (!Object.prototype.hasOwnProperty.call(row, 'data_through_ms') || row.data_through_ms === null) {
    return null
  }
  if (typeof row.data_through_ms !== 'number' || !Number.isFinite(row.data_through_ms) || row.data_through_ms < 0) {
    throw new Error('invalid_data_through_ms')
  }
  return row.data_through_ms
}

function sampledFromD1(value) {
  if (value === 0) return false
  if (value === 1) return true
  throw new Error('invalid_sampled_value')
}

function metricRow(dayIst, metric, value, meta, dataThroughMs, dimensionType = '', dimensionValue = '') {
  return {
    dayIst,
    metric,
    dimensionType,
    dimensionValue,
    value: finiteMetricValue(value),
    precision: meta.precision || 'unknown',
    sampled: meta.sampled ? 1 : 0,
    dataThroughMs,
    schemaVersion: meta.schemaVersion || SCHEMA_VERSION,
    updatedAt: meta.updatedAt || asIso(),
  }
}

export async function replaceDailyMetrics(db, dayIst, metrics, meta = {}) {
  const entries = Object.entries(metrics)
  if (!entries.length) throw new Error('rollup_has_no_metrics')

  const dataThroughMs = optionalDataThroughMs(meta.dataThroughMs)
  const rows = entries.map(([metric, value]) => metricRow(dayIst, metric, value, meta, dataThroughMs))

  const deleteStatement = db.prepare('DELETE FROM daily_metrics WHERE day_ist = ?').bind(dayIst)
  const insert = db.prepare(`INSERT INTO daily_metrics (
    day_ist, metric, dimension_type, dimension_value, value, precision, sampled,
    data_through_ms, schema_version, updated_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
  const statements = [deleteStatement]
  for (const row of rows) {
    statements.push(insert.bind(
      row.dayIst,
      row.metric,
      row.dimensionType,
      row.dimensionValue,
      row.value,
      row.precision,
      row.sampled,
      row.dataThroughMs,
      row.schemaVersion,
      row.updatedAt,
    ))
  }
  await db.batch(statements)
  return rows.length
}

export async function setRollupRun(db, dayIst, state, options = {}) {
  const dataThroughMs = optionalDataThroughMs(options.dataThroughMs)
  const now = asIso(options.nowMs)
  const completedAt = state === 'complete' || state === 'failed' ? now : null
  const startedAt = options.startedAt || now
  await db.prepare(`INSERT INTO rollup_runs (
    day_ist, status, started_at, completed_at, error_code, data_through_ms, schema_version, updated_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(day_ist) DO UPDATE SET
    status = excluded.status,
    started_at = excluded.started_at,
    completed_at = excluded.completed_at,
    error_code = excluded.error_code,
    data_through_ms = excluded.data_through_ms,
    schema_version = excluded.schema_version,
    updated_at = excluded.updated_at`).bind(
    dayIst,
    state,
    startedAt,
    completedAt,
    options.errorCode || null,
    dataThroughMs,
    options.schemaVersion || SCHEMA_VERSION,
    now,
  ).run()
}

export async function getLifetimeMetrics(db) {
  const result = await db.prepare(`SELECT metric,
    SUM(value) AS value,
    MAX(sampled) AS sampled,
    MAX(data_through_ms) AS data_through_ms
  FROM daily_metrics
  WHERE dimension_type = '' AND dimension_value = ''
    AND metric IN ('sessions','confirmed_play_starts','surface_views','listening_ms')
  GROUP BY metric`).all()
  const data = {}
  let dataThroughMs = null
  for (const row of result.results || []) {
    const sampled = sampledFromD1(row.sampled)
    const value = finiteMetricValue(row.value)
    const rowDataThroughMs = readDataThroughMs(row)
    data[row.metric] = {
      value,
      sampled,
      precision: sampled ? 'estimated' : 'exact',
    }
    if (rowDataThroughMs !== null) {
      dataThroughMs = dataThroughMs === null ? rowDataThroughMs : Math.max(dataThroughMs, rowDataThroughMs)
    }
  }
  return { data, dataThroughMs }
}

export async function getDailySeries(db, metric, days = 30) {
  const boundedDays = Math.max(1, Math.min(366, Number(days) || 30))
  const result = await db.prepare(`SELECT day_ist, value, precision, sampled, data_through_ms
    FROM daily_metrics
    WHERE metric = ? AND dimension_type = '' AND dimension_value = ''
    ORDER BY day_ist DESC
    LIMIT ?`).bind(metric, boundedDays).all()
  return (result.results || []).reverse().map((row) => ({
    day: row.day_ist,
    value: finiteMetricValue(row.value),
    precision: row.precision,
    sampled: sampledFromD1(row.sampled),
    dataThroughMs: readDataThroughMs(row),
  }))
}

export async function getRollupHealth(db) {
  return db.prepare(`SELECT day_ist, status, completed_at, error_code, data_through_ms, schema_version, updated_at
    FROM rollup_runs
    ORDER BY day_ist DESC
    LIMIT 14`).all().then((result) => result.results || [])
}
