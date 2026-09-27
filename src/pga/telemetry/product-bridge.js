import {
  CONTENT_TYPES,
  ENTRY_POINTS,
  ERROR_CODES,
  SURFACES,
  WORLDS,
} from './constants.js'

const ID_RE = /^[A-Za-z0-9._:-]{1,128}$/
const MAX_PLAYBACK_CONTEXTS = 4
const PROVIDER_DEDUPE_WINDOW_MS = 60_000

function safeId(value) {
  return typeof value === 'string' && ID_RE.test(value) ? value : ''
}

function acceptedEventId(value) {
  return safeId(value) || null
}

function enumValue(value, allowed, fallback = '') {
  return typeof value === 'string' && allowed.has(value) ? value : fallback
}

function compact(fields) {
  return Object.fromEntries(Object.entries(fields).filter(([, value]) => value !== '' && value != null))
}

function contextFrom(input = {}, fallback = {}) {
  return {
    surface: enumValue(input.surface, SURFACES, fallback.surface || 'player'),
    world: input.world === '' ? '' : enumValue(input.world, WORLDS, fallback.world || ''),
    entryPoint: enumValue(input.entryPoint, ENTRY_POINTS, fallback.entryPoint || 'unknown'),
  }
}

function contentFrom(input = {}, fallback = {}) {
  return {
    contentType: enumValue(input.contentType, CONTENT_TYPES, fallback.contentType || ''),
    contentId: safeId(input.contentId) || fallback.contentId || '',
  }
}

function contentIsComplete(context) {
  return CONTENT_TYPES.has(context.contentType) && Boolean(safeId(context.contentId))
}

function eventFields(context = {}, extras = {}) {
  return compact({
    surface: context.surface,
    world: context.world,
    entryPoint: context.entryPoint,
    contentType: context.contentType,
    contentId: context.contentId,
    ...extras,
  })
}

export class ProductTelemetryBridge {
  constructor(telemetry) {
    this.telemetry = telemetry || null
    this.context = {
      surface: 'player',
      world: '',
      entryPoint: 'unknown',
    }
    this.activeSearchId = null
    this.latestIntentId = null
    this.confirmedPlaybackId = null
    this.playbacks = new Map()
  }

  correlationId(method) {
    try {
      const factory = this.telemetry?.[method]
      if (typeof factory !== 'function') return null
      return safeId(factory.call(this.telemetry)) || null
    } catch {
      return null
    }
  }

  track(eventName, fields = {}, options = {}) {
    try {
      if (typeof this.telemetry?.track !== 'function') return null
      return acceptedEventId(this.telemetry.track(eventName, fields, options))
    } catch {
      return null
    }
  }

  setPresence(fields = {}) {
    try {
      if (typeof this.telemetry?.setPresenceState !== 'function') return false
      return this.telemetry.setPresenceState(fields) === true
    } catch {
      return false
    }
  }

  commitContext(next) {
    this.context = { ...next }
    return this.setPresence({
      surface: next.surface,
      world: next.world,
      entryPoint: next.entryPoint,
    })
  }

  updatePresenceContext(input = {}) {
    const next = contextFrom(input, this.context)
    return this.commitContext(next)
  }

  surfaceViewed(input = {}) {
    const next = contextFrom(input, this.context)
    this.commitContext(next)
    const eventId = this.track('surface_viewed', compact(next), {
      dedupeKey: `surface:${next.surface}:${next.world}:${next.entryPoint}`,
      dedupeWindowMs: 1_000,
    })
    return Boolean(eventId)
  }

  exploreOpened(input = {}) {
    const next = contextFrom({ ...input, surface: 'explore' }, this.context)
    this.commitContext(next)
    const eventId = this.track('explore_opened', compact(next), {
      dedupeKey: 'explore-opened',
      dedupeWindowMs: 1_000,
    })
    return Boolean(eventId)
  }

  nonstopOpened(input = {}) {
    const next = contextFrom({ ...input, surface: 'nonstop', entryPoint: 'nonstop_browser' }, this.context)
    this.commitContext(next)
    const eventId = this.track('nonstop_opened', compact(next), {
      dedupeKey: 'nonstop-opened',
      dedupeWindowMs: 1_000,
    })
    return Boolean(eventId)
  }

  searchSubmitted({ searchTerm, world } = {}) {
    const next = contextFrom({ surface: 'explore', world, entryPoint: 'explore_search' }, this.context)
    this.commitContext(next)

    const searchId = this.correlationId('searchId')
    if (!searchId) return null
    const eventId = this.track('search_submitted', compact({
      ...next,
      searchId,
      searchTerm,
    }))
    if (!eventId) return null

    this.activeSearchId = searchId
    return searchId
  }

  searchZeroResults({ searchId } = {}) {
    const canonical = safeId(searchId)
    if (!canonical || canonical !== this.activeSearchId) return false
    return Boolean(this.track('search_zero_results', eventFields(this.context, { searchId: canonical }), {
      dedupeKey: `search-zero:${canonical}`,
      dedupeWindowMs: 60_000,
    }))
  }

  searchResultSelected({ searchId, contentType, contentId, world } = {}) {
    const canonical = safeId(searchId)
    if (!canonical || canonical !== this.activeSearchId) return false

    const context = {
      ...contextFrom({ surface: 'explore', world, entryPoint: 'explore_search' }, this.context),
      ...contentFrom({ contentType, contentId }),
    }
    if (!contentIsComplete(context)) return false

    return Boolean(this.track('search_result_selected', eventFields(context, { searchId: canonical })))
  }

  collectionSelected({ contentType, contentId, world } = {}) {
    const context = {
      ...contextFrom({ surface: 'explore', world, entryPoint: 'explore_collection' }, this.context),
      ...contentFrom({ contentType, contentId }),
    }
    if (!contentIsComplete(context)) return false
    return Boolean(this.track('collection_selected', eventFields(context)))
  }

  rememberPlayback(playback) {
    this.playbacks.set(playback.id, playback)
    while (this.playbacks.size > MAX_PLAYBACK_CONTEXTS) {
      const oldestId = this.playbacks.keys().next().value
      if (oldestId === this.confirmedPlaybackId) {
        const current = this.playbacks.get(oldestId)
        this.playbacks.delete(oldestId)
        this.playbacks.set(oldestId, current)
        continue
      }
      this.playbacks.delete(oldestId)
    }
  }

  playIntent({ contentType, contentId, world, entryPoint, surface } = {}) {
    const content = contentFrom({ contentType, contentId })
    if (!contentIsComplete(content)) return null

    const playbackId = this.correlationId('playbackId')
    if (!playbackId) return null

    const context = {
      ...contextFrom({ surface, world, entryPoint }, this.context),
      ...content,
    }
    const eventId = this.track('play_intent', eventFields(context, { playbackId }))
    if (!eventId) return null

    this.latestIntentId = playbackId
    this.rememberPlayback({
      id: playbackId,
      ...context,
      started: false,
      ended: false,
      playbackState: 'none',
    })
    return playbackId
  }

  playbackFor(playbackId) {
    const canonical = safeId(playbackId)
    return canonical ? this.playbacks.get(canonical) || null : null
  }

  providerPlaybackStarted({ playbackId, confirmed } = {}) {
    if (confirmed !== true) return false
    const playback = this.playbackFor(playbackId)
    if (!playback || playback.started || playback.ended) return false

    const eventId = this.track('playback_started', eventFields(playback, { playbackId: playback.id }), {
      dedupeKey: `provider-start:${playback.id}`,
      dedupeWindowMs: PROVIDER_DEDUPE_WINDOW_MS,
    })
    if (!eventId) return false

    const previous = this.confirmedPlaybackId && this.playbacks.get(this.confirmedPlaybackId)
    if (previous && previous.id !== playback.id) previous.playbackState = 'none'

    playback.started = true
    playback.playbackState = 'playing'
    this.confirmedPlaybackId = playback.id
    this.context = contextFrom(playback, this.context)
    this.setPresence({
      ...eventFields(playback, { playbackId: playback.id }),
      playbackState: 'playing',
    })
    return true
  }

  playbackPaused({ playbackId } = {}) {
    const playback = this.playbackFor(playbackId)
    if (!playback || this.confirmedPlaybackId !== playback.id || playback.playbackState !== 'playing') return false

    const eventId = this.track('playback_paused', eventFields(playback, { playbackId: playback.id }), {
      dedupeKey: `provider-pause:${playback.id}`,
      dedupeWindowMs: 1_000,
    })
    if (!eventId) return false

    playback.playbackState = 'paused'
    this.setPresence({
      ...eventFields(playback, { playbackId: playback.id }),
      playbackState: 'paused',
    })
    return true
  }

  playbackResumed({ playbackId } = {}) {
    const playback = this.playbackFor(playbackId)
    if (!playback || this.confirmedPlaybackId !== playback.id || playback.playbackState !== 'paused') return false

    const eventId = this.track('playback_resumed', eventFields(playback, { playbackId: playback.id }), {
      dedupeKey: `provider-resume:${playback.id}`,
      dedupeWindowMs: 1_000,
    })
    if (!eventId) return false

    playback.playbackState = 'playing'
    this.setPresence({
      ...eventFields(playback, { playbackId: playback.id }),
      playbackState: 'playing',
    })
    return true
  }

  playbackEnded({ playbackId } = {}) {
    const playback = this.playbackFor(playbackId)
    if (!playback || this.confirmedPlaybackId !== playback.id || !playback.started || playback.ended) return false

    const eventId = this.track('playback_ended', eventFields(playback, { playbackId: playback.id }), {
      dedupeKey: `provider-end:${playback.id}`,
      dedupeWindowMs: PROVIDER_DEDUPE_WINDOW_MS,
    })
    if (!eventId) return false

    playback.ended = true
    playback.playbackState = 'none'
    this.confirmedPlaybackId = null
    this.setPresence({
      surface: playback.surface,
      world: playback.world,
      entryPoint: playback.entryPoint,
      playbackState: 'none',
      contentType: '',
      contentId: '',
    })
    return true
  }

  playbackUnavailable({ playbackId, errorCode } = {}) {
    const playback = this.playbackFor(playbackId)
    if (!playback || playback.ended) return false
    const code = enumValue(errorCode, ERROR_CODES)
    const eventId = this.track('playback_unavailable', eventFields(playback, {
      playbackId: playback.id,
      errorCode: code,
    }), {
      dedupeKey: `unavailable:${playback.id}:${code}`,
      dedupeWindowMs: 5_000,
    })
    if (!eventId) return false
    if (!playback.started && this.latestIntentId === playback.id) this.latestIntentId = null
    return true
  }

  playbackError({ playbackId, errorCode } = {}) {
    const playback = this.playbackFor(playbackId)
    const code = enumValue(errorCode, ERROR_CODES)
    if (!playback || playback.ended || !code) return false
    return Boolean(this.track('playback_error', eventFields(playback, {
      playbackId: playback.id,
      errorCode: code,
    }), {
      dedupeKey: `playback-error:${playback.id}:${code}`,
      dedupeWindowMs: 5_000,
    }))
  }

  transportRequest(eventName) {
    const playback = this.confirmedPlaybackId ? this.playbacks.get(this.confirmedPlaybackId) : null
    if (!playback || playback.ended) return false
    return Boolean(this.track(eventName, eventFields(playback, { playbackId: playback.id }), {
      dedupeKey: `${eventName}:${playback.id}`,
      dedupeWindowMs: 250,
    }))
  }

  nextRequested() {
    return this.transportRequest('next_requested')
  }

  previousRequested() {
    return this.transportRequest('previous_requested')
  }

  skipRequested() {
    return this.transportRequest('skip_requested')
  }
}

export function createProductTelemetryBridge(telemetry) {
  try {
    return new ProductTelemetryBridge(telemetry)
  } catch {
    return new ProductTelemetryBridge(null)
  }
}
