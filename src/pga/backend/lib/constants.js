export const SCHEMA_VERSION = 1

export const EVENT_NAMES = new Set([
  'browser_created','session_started','surface_viewed','explore_opened','nonstop_opened',
  'search_submitted','search_zero_results','search_result_selected','collection_selected',
  'play_intent','playback_started','playback_resumed','playback_paused','playback_ended',
  'next_requested','previous_requested','skip_requested','playback_unavailable','playback_error',
  'presence_heartbeat',
])
export const PRESENCE_EVENT = 'presence_heartbeat'
export const SURFACES = new Set(['player','explore','nonstop','editorial'])
export const DISPLAY_MODES = new Set(['browser','standalone','minimal-ui','unknown'])
export const WORLDS = new Set(['traditional','dandiya','devotional','folk','sanedo','fusion'])
export const CONTENT_TYPES = new Set(['song','release','nonstop_set','chapter'])
export const PLAYBACK_STATES = new Set(['playing','paused','none','unknown'])
export const ENTRY_POINTS = new Set(['player','explore_search','explore_collection','nonstop_browser','deep_link','editorial','unknown'])
export const ERROR_CODES = new Set(['route_unavailable','provider_unavailable','provider_rejected','player_init_failed','playback_start_timeout','network','unknown'])

export const MAX_BATCH_EVENTS = 25
export const MAX_BODY_BYTES = 32 * 1024
export const MAX_STRING = 128
export const MAX_SEARCH_TERM = 80
export const MAX_TIMESTAMP_SKEW_MS = 24 * 60 * 60 * 1000
export const LIVE_EXPIRY_SECONDS = 120
export const RANGE_SECONDS = {
  '24h': 24 * 60 * 60,
  '7d': 7 * 24 * 60 * 60,
  '30d': 30 * 24 * 60 * 60,
  '90d': 90 * 24 * 60 * 60,
}
