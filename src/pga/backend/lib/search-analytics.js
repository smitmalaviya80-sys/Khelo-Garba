import { safeRangeSeconds } from './analytics.js'

function dedupedSearchCte(dataset, seconds) {
  return `WITH deduped AS (
  SELECT blob2 AS event_id,
    argMax(blob1, double3) AS event_name,
    argMax(blob6, double3) AS search_key,
    argMax(blob20, double3) AS search_term,
    MAX(double3) AS data_through_ms,
    argMax(_sample_interval, double3) AS sample_interval
  FROM ${dataset}
  WHERE double5 = 0 AND double6 = 0
    AND timestamp > NOW() - INTERVAL '${seconds}' SECOND
  GROUP BY event_id
)`
}

export function searchDemandSql(dataset, range = '30d') {
  const seconds = safeRangeSeconds(range)
  return `${dedupedSearchCte(dataset, seconds)}
SELECT search_term,
  SUM(CASE WHEN event_name = 'search_submitted' THEN sample_interval ELSE 0 END) AS searches,
  SUM(CASE WHEN event_name = 'search_zero_results' THEN sample_interval ELSE 0 END) AS zero_results,
  MAX(data_through_ms) AS data_through_ms,
  MAX(sample_interval) AS max_sample_interval
FROM deduped
WHERE search_term != ''
GROUP BY search_term
HAVING searches >= 3
ORDER BY zero_results DESC, searches DESC
LIMIT 100`
}

export function searchFunnelSql(dataset, range = '30d') {
  const seconds = safeRangeSeconds(range)
  return `${dedupedSearchCte(dataset, seconds)}, per_search AS (
  SELECT search_key,
    MAX(CASE WHEN event_name = 'search_submitted' THEN 1 ELSE 0 END) AS submitted,
    MAX(CASE WHEN event_name = 'search_result_selected' THEN 1 ELSE 0 END) AS selected,
    MAX(CASE WHEN event_name = 'playback_started' THEN 1 ELSE 0 END) AS played,
    MAX(CASE WHEN event_name = 'search_zero_results' THEN 1 ELSE 0 END) AS zero_result,
    MAX(data_through_ms) AS data_through_ms,
    MAX(sample_interval) AS max_sample_interval
  FROM deduped
  WHERE search_key != ''
  GROUP BY search_key
)
SELECT
  SUM(submitted) AS searches,
  SUM(selected) AS selected_searches,
  SUM(played) AS searches_with_confirmed_play,
  SUM(zero_result) AS zero_result_searches,
  MAX(data_through_ms) AS data_through_ms,
  MAX(max_sample_interval) AS max_sample_interval
FROM per_search`
}
