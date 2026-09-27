import { LIVE_EXPIRY_SECONDS, RANGE_SECONDS } from './constants.js'
import { hmacPseudonym } from './crypto.js'

function pack(parts) {
  return parts.map((part) => part || '').join('|')
}

export async function normaliseForStorage(event, env, edge, receivedAtMs = Date.now()) {
  const [browserKey, sessionKey, tabKey, searchKey, playbackKey] = await Promise.all([
    hmacPseudonym(env.PGA_HMAC_SECRET, event.browserId, 'browser:'),
    hmacPseudonym(env.PGA_HMAC_SECRET, event.sessionId, 'session:'),
    hmacPseudonym(env.PGA_HMAC_SECRET, event.tabId, 'tab:'),
    hmacPseudonym(env.PGA_HMAC_SECRET, event.searchId, 'search:'),
    hmacPseudonym(env.PGA_HMAC_SECRET, event.playbackId, 'playback:'),
  ])
  const internal = typeof env.INTERNAL_BROWSER_KEYS === 'string'
    ? env.INTERNAL_BROWSER_KEYS.split(',').map((value) => value.trim()).filter(Boolean).includes(browserKey)
    : false
  return {
    ...event,
    browserKey,
    sessionKey,
    tabKey,
    searchKey,
    playbackKey,
    receivedAtMs,
    internal,
    bot: Boolean(edge.bot),
    geo: pack([edge.country, edge.region]),
    client: pack([edge.device, edge.os, edge.browser]),
    acquisition: pack([event.source, event.medium, event.campaign]),
  }
}

export function eventDataPoint(event) {
  return {
    indexes: [event.browserKey],
    blobs: [
      event.eventName,
      event.eventId,
      event.browserKey,
      event.sessionKey,
      event.tabKey,
      event.searchKey,
      event.playbackKey,
      event.surface,
      event.displayMode,
      event.world,
      event.contentType,
      event.contentId,
      event.entryPoint,
      event.referrerHost,
      event.acquisition,
      event.geo,
      event.client,
      event.buildId,
      event.errorCode,
      event.searchTerm,
    ],
    doubles: [
      event.schemaVersion,
      event.occurredAtMs,
      event.receivedAtMs,
      event.eventValue || 0,
      event.internal ? 1 : 0,
      event.bot ? 1 : 0,
    ],
  }
}

export function presenceDataPoint(event) {
  return {
    indexes: [event.sessionKey],
    blobs: [
      event.eventId,
      event.browserKey,
      event.sessionKey,
      event.tabKey,
      event.surface,
      event.playbackState,
      event.world,
      event.contentType,
      event.contentId,
      event.displayMode,
      event.geo,
      event.client,
      event.buildId,
    ],
    doubles: [
      event.schemaVersion,
      event.occurredAtMs,
      event.receivedAtMs,
      event.playedMs || 0,
      event.internal ? 1 : 0,
      event.bot ? 1 : 0,
    ],
  }
}

export async function queryAnalytics(env, sql, fetchImpl = fetch) {
  if (!env.CF_ACCOUNT_ID || !env.ANALYTICS_API_TOKEN) throw new Error('analytics_query_config_missing')
  const response = await fetchImpl(
    `https://api.cloudflare.com/client/v4/accounts/${env.CF_ACCOUNT_ID}/analytics_engine/sql`,
    {
      method: 'POST',
      headers: {
        authorization: `Bearer ${env.ANALYTICS_API_TOKEN}`,
        'content-type': 'text/plain; charset=utf-8',
      },
      body: sql,
    },
  )
  if (!response.ok) throw new Error(`analytics_query_failed:${response.status}`)
  const body = await response.json()
  if (!body || !Array.isArray(body.data)) throw new Error('analytics_query_invalid_response')
  return body.data
}

export function safeRangeSeconds(range) {
  const seconds = RANGE_SECONDS[range]
  if (!seconds) throw new Error('invalid_range')
  return seconds
}

const productionFilter = () => 'double5 = 0 AND double6 = 0'

function dedupedEventCte(dataset, whereClause) {
  return `WITH deduped AS (
  SELECT
    blob2 AS event_id,
    argMax(blob1, double3) AS event_name,
    argMax(blob3, double3) AS browser_key,
    argMax(blob4, double3) AS session_key,
    argMax(blob6, double3) AS search_key,
    argMax(blob7, double3) AS playback_key,
    argMax(blob8, double3) AS surface,
    argMax(blob9, double3) AS display_mode,
    argMax(blob10, double3) AS world,
    argMax(blob11, double3) AS content_type,
    argMax(blob12, double3) AS content_id,
    argMax(blob14, double3) AS referrer_host,
    argMax(blob15, double3) AS acquisition,
    argMax(blob16, double3) AS geo,
    argMax(blob17, double3) AS client,
    argMax(blob19, double3) AS detail_code,
    MAX(double3) AS data_through_ms,
    argMax(_sample_interval, double3) AS sample_interval
  FROM ${dataset}
  WHERE ${productionFilter()} AND ${whereClause}
  GROUP BY event_id
)`
}

export function homeWindowSql(dataset, startMs, endMs) {
  return `${dedupedEventCte(dataset, `double2 >= ${startMs} AND double2 < ${endMs}`)}
SELECT
  COUNT(DISTINCT browser_key) AS unique_browsers,
  SUM(CASE WHEN event_name = 'session_started' THEN sample_interval ELSE 0 END) AS sessions,
  SUM(CASE WHEN event_name = 'browser_created' THEN sample_interval ELSE 0 END) AS browser_ids_created,
  SUM(CASE WHEN event_name = 'playback_started' THEN sample_interval ELSE 0 END) AS confirmed_play_starts,
  SUM(CASE WHEN event_name = 'surface_viewed' THEN sample_interval ELSE 0 END) AS surface_views,
  MAX(data_through_ms) AS data_through_ms,
  MAX(sample_interval) AS max_sample_interval
FROM deduped`
}

export function audienceSummarySql(dataset, range = '7d') {
  const seconds = safeRangeSeconds(range)
  return `${dedupedEventCte(dataset, `timestamp > NOW() - INTERVAL '${seconds}' SECOND`)}
SELECT
  COUNT(DISTINCT browser_key) AS unique_browsers,
  SUM(CASE WHEN event_name = 'session_started' THEN sample_interval ELSE 0 END) AS sessions,
  SUM(CASE WHEN event_name = 'browser_created' THEN sample_interval ELSE 0 END) AS new_browser_ids,
  MAX(data_through_ms) AS data_through_ms,
  MAX(sample_interval) AS max_sample_interval
FROM deduped`
}

export function audienceSql(dataset, range = '7d') {
  const seconds = safeRangeSeconds(range)
  return `${dedupedEventCte(dataset, `timestamp > NOW() - INTERVAL '${seconds}' SECOND`)}
SELECT client, geo, referrer_host, acquisition, display_mode,
  SUM(sample_interval) AS sessions,
  MAX(data_through_ms) AS data_through_ms,
  MAX(sample_interval) AS max_sample_interval
FROM deduped
WHERE event_name = 'session_started'
GROUP BY client, geo, referrer_host, acquisition, display_mode
ORDER BY sessions DESC
LIMIT 250`
}

export function listeningSql(dataset, range = '7d') {
  const seconds = safeRangeSeconds(range)
  return `${dedupedEventCte(dataset, `timestamp > NOW() - INTERVAL '${seconds}' SECOND`)}
SELECT event_name, surface, world, content_type, content_id, detail_code,
  SUM(sample_interval) AS weighted_events,
  MAX(data_through_ms) AS data_through_ms,
  MAX(sample_interval) AS max_sample_interval
FROM deduped
WHERE event_name IN (
  'play_intent','playback_started','playback_paused','next_requested','previous_requested','skip_requested',
  'playback_unavailable','playback_error','search_submitted','search_zero_results','search_result_selected'
)
GROUP BY event_name, surface, world, content_type, content_id, detail_code
ORDER BY weighted_events DESC
LIMIT 500`
}

function liveReceivedWindow() {
  return `toDateTime(double3 / 1000) >= NOW() - INTERVAL '${LIVE_EXPIRY_SECONDS}' SECOND
    AND toDateTime(double3 / 1000) <= NOW()`
}

function livePresenceCtes(dataset, whereClause) {
  return `WITH same_time_sessions AS (
  SELECT
    blob3 AS session_key,
    double3 AS received_at_ms,
    argMax(blob6, blob1) AS playback_state,
    argMax(blob5, blob1) AS surface,
    argMax(blob7, blob1) AS world,
    argMax(blob10, blob1) AS display_mode,
    argMax(_sample_interval, blob1) AS sample_interval
  FROM ${dataset}
  WHERE ${productionFilter()} AND ${whereClause}
  GROUP BY session_key, received_at_ms
), latest_sessions AS (
  SELECT
    session_key,
    argMax(playback_state, received_at_ms) AS playback_state,
    argMax(surface, received_at_ms) AS surface,
    argMax(world, received_at_ms) AS world,
    argMax(display_mode, received_at_ms) AS display_mode,
    MAX(received_at_ms) AS data_through_ms,
    argMax(sample_interval, received_at_ms) AS sample_interval
  FROM same_time_sessions
  GROUP BY session_key
)`
}

export function liveSql(dataset) {
  return `${livePresenceCtes(dataset, liveReceivedWindow())}
SELECT
  SUM(sample_interval) AS live_now,
  SUM(CASE WHEN playback_state = 'playing' THEN sample_interval ELSE 0 END) AS listening_now,
  SUM(CASE WHEN playback_state != 'playing' THEN sample_interval ELSE 0 END) AS browsing_now,
  MAX(data_through_ms) AS data_through_ms,
  MAX(sample_interval) AS max_sample_interval
FROM latest_sessions`
}

export function liveBreakdownSql(dataset) {
  return `${livePresenceCtes(dataset, liveReceivedWindow())}
SELECT
  surface,
  world,
  display_mode,
  SUM(sample_interval) AS sessions,
  SUM(CASE WHEN playback_state = 'playing' THEN sample_interval ELSE 0 END) AS listening_sessions,
  SUM(CASE WHEN playback_state != 'playing' THEN sample_interval ELSE 0 END) AS browsing_sessions,
  MAX(data_through_ms) AS data_through_ms,
  MAX(sample_interval) AS max_sample_interval
FROM latest_sessions
GROUP BY surface, world, display_mode
ORDER BY sessions DESC
LIMIT 100`
}

export function liveTrendSql(dataset, minutes = 30) {
  const boundedMinutes = Math.max(5, Math.min(60, Math.floor(Number(minutes) || 30)))
  return `WITH minute_tabs AS (
  SELECT
    intDiv(toUInt32(timestamp), 60) * 60 AS minute_bucket,
    blob3 AS session_key,
    blob4 AS tab_key,
    argMax(blob6, double3) AS playback_state,
    MAX(double3) AS data_through_ms,
    argMax(_sample_interval, double3) AS sample_interval
  FROM ${dataset}
  WHERE ${productionFilter()} AND timestamp > NOW() - INTERVAL '${boundedMinutes}' MINUTE
  GROUP BY minute_bucket, session_key, tab_key
), minute_sessions AS (
  SELECT
    minute_bucket,
    session_key,
    MAX(if(playback_state = 'playing', 1, 0)) AS is_listening,
    MAX(data_through_ms) AS data_through_ms,
    MAX(sample_interval) AS sample_interval
  FROM minute_tabs
  GROUP BY minute_bucket, session_key
)
SELECT
  minute_bucket,
  SUM(sample_interval) AS active_sessions,
  SUM(CASE WHEN is_listening = 1 THEN sample_interval ELSE 0 END) AS listening_sessions,
  SUM(CASE WHEN is_listening = 0 THEN sample_interval ELSE 0 END) AS browsing_sessions,
  MAX(data_through_ms) AS data_through_ms,
  MAX(sample_interval) AS max_sample_interval
FROM minute_sessions
GROUP BY minute_bucket
ORDER BY minute_bucket ASC`
}

function listeningTimeQuery(dataset, whereClause) {
  return `WITH deduped AS (
  SELECT blob1 AS event_id,
    argMax(blob3, double3) AS session_key,
    argMax(blob6, double3) AS playback_state,
    argMax(double4, double3) AS played_ms,
    argMax(double2, double3) AS occurred_at_ms,
    MAX(double3) AS data_through_ms,
    argMax(_sample_interval, double3) AS sample_interval
  FROM ${dataset}
  WHERE ${productionFilter()} AND ${whereClause}
  GROUP BY event_id
), minute_totals AS (
  SELECT session_key,
    intDiv(occurred_at_ms, 60000) AS minute_bucket,
    SUM(CASE WHEN playback_state = 'playing' THEN played_ms * sample_interval ELSE 0 END) AS raw_played_ms,
    MAX(data_through_ms) AS data_through_ms,
    MAX(sample_interval) AS max_sample_interval
  FROM deduped
  GROUP BY session_key, minute_bucket
)
SELECT
  SUM(CASE WHEN raw_played_ms > 60000 THEN 60000 ELSE raw_played_ms END) AS played_ms,
  MAX(data_through_ms) AS data_through_ms,
  MAX(max_sample_interval) AS max_sample_interval
FROM minute_totals`
}

export function listeningTimeWindowSql(dataset, startMs, endMs) {
  return listeningTimeQuery(dataset, `double2 >= ${startMs} AND double2 < ${endMs}`)
}

export function listeningTimeSql(dataset, range = '24h') {
  const seconds = safeRangeSeconds(range)
  return listeningTimeQuery(dataset, `timestamp > NOW() - INTERVAL '${seconds}' SECOND`)
}

function sampleIntervalFromRow(row) {
  const value = row?.max_sample_interval
  if (value == null) return 1
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 1) {
    throw new Error('analytics_precision_invalid_sample_interval')
  }
  return value
}

export function precisionFromRows(rows) {
  const sampleIntervals = rows.map(sampleIntervalFromRow)
  const sampled = sampleIntervals.some((value) => value > 1)
  return { sampled, precision: sampled ? 'estimated' : 'exact' }
}
