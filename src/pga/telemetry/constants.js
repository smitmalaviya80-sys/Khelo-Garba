export const SCHEMA_VERSION = 1
export const DEFAULT_ENDPOINT = 'https://events.playgarba.com/v1/events'

export const BROWSER_TTL_MS = 180 * 24 * 60 * 60 * 1000
export const SESSION_TTL_MS = 30 * 60 * 1000
export const HEARTBEAT_INTERVAL_MS = 45 * 1000
export const MAX_HEARTBEAT_PLAYED_MS = 60 * 1000

export const MAX_QUEUE_EVENTS = 100
export const MAX_QUEUE_BYTES = 64 * 1024
export const QUEUE_TTL_MS = 24 * 60 * 60 * 1000
export const MAX_BATCH_EVENTS = 25

export const BROWSER_STORAGE_KEY = 'playgarba:pga:browser:v1'
export const SESSION_STORAGE_KEY = 'playgarba:pga:session:v1'
export const QUEUE_STORAGE_KEY = 'playgarba:pga:queue:v1'

export const EVENT_NAMES = new Set([
  'browser_created',
  'session_started',
  'surface_viewed',
  'explore_opened',
  'nonstop_opened',
  'search_submitted',
  'search_zero_results',
  'search_result_selected',
  'collection_selected',
  'play_intent',
  'playback_started',
  'playback_resumed',
  'playback_paused',
  'playback_ended',
  'next_requested',
  'previous_requested',
  'skip_requested',
  'playback_unavailable',
  'playback_error',
  'presence_heartbeat',
])

export const SURFACES = new Set(['player', 'explore', 'nonstop', 'editorial'])
export const DISPLAY_MODES = new Set(['browser', 'standalone', 'minimal-ui', 'unknown'])
export const WORLDS = new Set(['traditional', 'dandiya', 'devotional', 'folk', 'sanedo', 'fusion'])
export const CONTENT_TYPES = new Set(['song', 'release', 'nonstop_set', 'chapter'])
export const PLAYBACK_STATES = new Set(['playing', 'paused', 'none', 'unknown'])
export const ENTRY_POINTS = new Set(['player', 'explore_search', 'explore_collection', 'nonstop_browser', 'deep_link', 'unknown'])
export const ERROR_CODES = new Set([
  'provider_unavailable',
  'embed_error',
  'autoplay_blocked',
  'route_unavailable',
  'network',
  'runtime',
  'unknown',
])

export const RETRY_DELAYS_MS = [5_000, 15_000, 60_000, 5 * 60_000]
