import { CONTENT_TYPES, DISPLAY_MODES, ENTRY_POINTS, ERROR_CODES, EVENT_NAMES, MAX_BATCH_EVENTS, MAX_SEARCH_TERM, MAX_STRING, MAX_TIMESTAMP_SKEW_MS, PLAYBACK_STATES, PRESENCE_EVENT, SCHEMA_VERSION, SURFACES, WORLDS } from './constants.js'

const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i
const PHONE_RE = /(?:\+?\d[\d\s().-]{7,}\d)/
const URL_RE = /\b(?:https?:\/\/|www\.)\S+/i
const ID_RE = /^[A-Za-z0-9._:-]{1,128}$/
const COUNTRY_RE = /^[A-Z]{2}$/

function cleanString(value, max = MAX_STRING) {
  if (value == null || value === '') return ''
  if (typeof value !== 'string') throw new Error('expected_string')
  return value.normalize('NFKC').trim().slice(0, max)
}
function enumValue(value, allowed, fallback = '') {
  const cleaned = cleanString(value)
  if (!cleaned) return fallback
  if (!allowed.has(cleaned)) throw new Error('invalid_enum')
  return cleaned
}
function cleanId(value, required = false) {
  const cleaned = cleanString(value)
  if (!cleaned && !required) return ''
  if (!cleaned || !ID_RE.test(cleaned)) throw new Error('invalid_id')
  return cleaned
}
function cleanHost(value) {
  const cleaned = cleanString(value, 255).toLowerCase()
  if (!cleaned) return ''
  if (cleaned.includes('/') || cleaned.includes('?') || cleaned.includes('#') || cleaned.includes('@')) throw new Error('invalid_referrer_host')
  if (!/^[a-z0-9.-]+$/.test(cleaned)) throw new Error('invalid_referrer_host')
  return cleaned
}
function cleanToken(value, max = 64) {
  const cleaned = cleanString(value, max)
  if (!cleaned) return ''
  if (!/^[A-Za-z0-9._ -]+$/.test(cleaned)) return ''
  return cleaned
}
export function sanitizeSearchTerm(value) {
  const cleaned = cleanString(value, MAX_SEARCH_TERM).replace(/\s+/g, ' ')
  if (!cleaned) return ''
  if (EMAIL_RE.test(cleaned) || PHONE_RE.test(cleaned) || URL_RE.test(cleaned)) return ''
  return cleaned
}
function finiteNumber(value, fallback = 0) {
  if (value == null) return fallback
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error('invalid_number')
  return value
}
export function validateEvent(raw, options = {}) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('invalid_event')
  const allowedKeys = new Set([
    'schema_version','event_name','event_id','occurred_at','browser_id','session_id','tab_id','search_id',
    'playback_instance_id','surface','display_mode','world','content_type','content_id','entry_point',
    'referrer_host','source','medium','campaign','search_term','event_value','error_code','build_id',
    'playback_state','played_ms_since_previous_heartbeat',
  ])
  for (const key of Object.keys(raw)) if (!allowedKeys.has(key)) throw new Error(`unknown_key:${key}`)
  if (raw.schema_version !== SCHEMA_VERSION) throw new Error('unsupported_schema_version')
  const eventName = cleanString(raw.event_name)
  if (!EVENT_NAMES.has(eventName)) throw new Error('invalid_event_name')
  const nowMs = options.nowMs ?? Date.now()
  const occurredAtMs = typeof raw.occurred_at === 'number' ? raw.occurred_at : Date.parse(raw.occurred_at)
  if (!Number.isFinite(occurredAtMs)) throw new Error('invalid_occurred_at')
  if (Math.abs(nowMs - occurredAtMs) > MAX_TIMESTAMP_SKEW_MS) throw new Error('timestamp_out_of_bounds')
  const event = {
    schemaVersion: SCHEMA_VERSION,
    eventName,
    eventId: cleanId(raw.event_id, true),
    occurredAtMs,
    browserId: cleanId(raw.browser_id, true),
    sessionId: cleanId(raw.session_id, true),
    tabId: cleanId(raw.tab_id),
    searchId: cleanId(raw.search_id),
    playbackId: cleanId(raw.playback_instance_id),
    surface: enumValue(raw.surface, SURFACES),
    displayMode: enumValue(raw.display_mode, DISPLAY_MODES, 'unknown'),
    world: enumValue(raw.world, WORLDS),
    contentType: enumValue(raw.content_type, CONTENT_TYPES),
    contentId: cleanId(raw.content_id),
    entryPoint: enumValue(raw.entry_point, ENTRY_POINTS, 'unknown'),
    referrerHost: cleanHost(raw.referrer_host),
    source: cleanToken(raw.source),
    medium: cleanToken(raw.medium),
    campaign: cleanToken(raw.campaign),
    searchTerm: sanitizeSearchTerm(raw.search_term),
    eventValue: finiteNumber(raw.event_value),
    errorCode: enumValue(raw.error_code, ERROR_CODES),
    buildId: cleanId(raw.build_id),
    playbackState: '',
    playedMs: 0,
  }
  if (!event.surface) throw new Error('surface_required')
  if (eventName === PRESENCE_EVENT) {
    event.playbackState = enumValue(raw.playback_state, PLAYBACK_STATES, 'unknown')
    event.playedMs = Math.max(0, Math.min(60_000, finiteNumber(raw.played_ms_since_previous_heartbeat)))
  }
  if (eventName.startsWith('search_') && !event.searchId) throw new Error('search_id_required')
  if (['play_intent','playback_started','playback_resumed','playback_paused','playback_ended'].includes(eventName) && !event.playbackId) {
    throw new Error('playback_instance_id_required')
  }
  if (eventName === 'playback_error' && !event.errorCode) throw new Error('error_code_required')
  return event
}
export function validateBatch(body, options = {}) {
  const rawEvents = Array.isArray(body) ? body : body?.events
  if (!Array.isArray(rawEvents)) throw new Error('events_array_required')
  if (rawEvents.length < 1 || rawEvents.length > MAX_BATCH_EVENTS) throw new Error('invalid_batch_size')
  const events = rawEvents.map((raw) => validateEvent(raw, options))
  const browserId = events[0].browserId
  if (events.some((event) => event.browserId !== browserId)) throw new Error('mixed_browser_batch')
  return events
}
export function normalizeEdgeDimensions(request) {
  const cf = request.cf || {}
  const countryRaw = typeof cf.country === 'string' ? cf.country.toUpperCase() : ''
  const country = COUNTRY_RE.test(countryRaw) ? countryRaw : 'ZZ'
  const region = cleanToken(typeof cf.regionCode === 'string' ? cf.regionCode : '', 32) || 'unknown'
  const ua = (request.headers.get('user-agent') || '').toLowerCase()
  const device = /ipad|tablet/.test(ua) ? 'tablet' : /iphone|android|mobile/.test(ua) ? 'mobile' : ua ? 'desktop' : 'unknown'
  const os = /iphone|ipad|ios/.test(ua) ? 'iOS' : /android/.test(ua) ? 'Android' : /mac os|macintosh/.test(ua) ? 'macOS' : /windows/.test(ua) ? 'Windows' : /linux/.test(ua) ? 'Linux' : 'unknown'
  const browser = /edg\//.test(ua) ? 'Edge' : /firefox\//.test(ua) ? 'Firefox' : /chrome\//.test(ua) ? 'Chrome' : /safari\//.test(ua) ? 'Safari' : 'unknown'
  return { country, region, device, os, browser, bot: /bot|crawler|spider|headless/.test(ua) }
}
