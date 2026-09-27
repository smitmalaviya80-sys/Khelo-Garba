import {
  CONTENT_TYPES,
  DEFAULT_ENDPOINT,
  DISPLAY_MODES,
  ENTRY_POINTS,
  ERROR_CODES,
  EVENT_NAMES,
  HEARTBEAT_INTERVAL_MS,
  MAX_HEARTBEAT_PLAYED_MS,
  PLAYBACK_STATES,
  RETRY_DELAYS_MS,
  SCHEMA_VERSION,
  SURFACES,
  WORLDS,
} from './constants.js'
import {
  getBrowserIdentity,
  getSessionIdentity,
  randomId,
  readActiveSession,
  sessionIsActive,
  touchSession,
} from './identity.js'
import { EventQueue } from './queue.js'
import {
  acquisitionFromLocation,
  detectDisplayMode,
  sanitiseSearchTerm,
  sanitiseToken,
} from './privacy.js'
import { createResilientStorage } from './storage.js'
import { sendEvents } from './transport.js'

const ID_RE = /^[A-Za-z0-9._:-]{1,128}$/

function nowFrom(clock) {
  return typeof clock?.now === 'function' ? clock.now() : Date.now()
}

function safeId(value) {
  return typeof value === 'string' && ID_RE.test(value) ? value : ''
}

function enumOr(value, allowed, fallback = '') {
  return typeof value === 'string' && allowed.has(value) ? value : fallback
}

function finiteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function createDisabledTelemetry(reason = 'disabled') {
  const noop = () => null
  return {
    disabled: true,
    reason,
    track: noop,
    searchId: noop,
    playbackId: noop,
    setPresenceState: noop,
    start: noop,
    stop: noop,
    destroy: noop,
    flush: async () => false,
    heartbeat: async () => false,
    queueSize: () => 0,
  }
}

export class TelemetryClient {
  constructor(options = {}) {
    this.clock = options.clock || { now: Date.now }
    this.cryptoObj = options.cryptoObj || globalThis.crypto
    this.windowObj = options.windowObj || globalThis.window || null
    this.documentObj = options.documentObj || globalThis.document || null
    this.navigatorObj = options.navigatorObj || globalThis.navigator || null
    this.locationObj = options.locationObj || this.windowObj?.location || globalThis.location || null
    this.fetchImpl = options.fetchImpl || globalThis.fetch
    this.endpoint = options.endpoint || DEFAULT_ENDPOINT
    this.storage = createResilientStorage(options.storage || this.windowObj?.localStorage || null)
    this.queue = new EventQueue(this.storage, options.queueOptions)
    this.scheduler = {
      setTimeout: options.setTimeoutImpl || globalThis.setTimeout,
      clearTimeout: options.clearTimeoutImpl || globalThis.clearTimeout,
      setInterval: options.setIntervalImpl || globalThis.setInterval,
      clearInterval: options.clearIntervalImpl || globalThis.clearInterval,
    }
    this.displayMode = detectDisplayMode(this.windowObj, this.navigatorObj)
    this.acquisition = acquisitionFromLocation(this.locationObj, this.documentObj)
    this.current = {
      surface: enumOr(options.initialSurface, SURFACES, 'player'),
      playbackState: 'none',
      world: '',
      contentType: '',
      contentId: '',
      entryPoint: 'unknown',
      buildId: safeId(options.buildId),
    }
    this.tabId = randomId(this.cryptoObj)
    this.dedupe = new Map()
    this.flushTimer = null
    this.flushDueAt = null
    this.heartbeatTimer = null
    this.retryIndex = 0
    this.flushing = null
    this.started = false
    this.accumulatedPlayedMs = 0
    this.playingSinceMs = null
    this.boundOnline = () => this.scheduleFlush(0)
    this.boundPageHide = () => { void this.flush({ preferBeacon: true }) }
    this.boundVisibility = () => {
      if (this.documentObj?.visibilityState === 'visible') {
        this.scheduleFlush(0)
        void this.heartbeat()
      }
    }

    this.browser = getBrowserIdentity(this.storage, this.now(), this.cryptoObj)
    this.session = getSessionIdentity(this.storage, this.now(), this.cryptoObj, this.browser.isNew)
    this.queueBootstrap(this.browser.isNew, this.session.isNew)

    if (options.autoStart !== false) this.start()
  }

  now() {
    return nowFrom(this.clock)
  }

  searchId() {
    return randomId(this.cryptoObj)
  }

  playbackId() {
    return randomId(this.cryptoObj)
  }

  refreshIdentity(nowMs, meaningfulActivity = true) {
    const browser = getBrowserIdentity(this.storage, nowMs, this.cryptoObj)
    const browserChanged = !this.browser || browser.id !== this.browser.id
    const session = getSessionIdentity(this.storage, nowMs, this.cryptoObj, browserChanged)
    const sessionChanged = !this.session || session.id !== this.session.id
    this.browser = browser
    this.session = session
    if (browser.isNew || browserChanged || session.isNew || sessionChanged) {
      this.queueBootstrap(browser.isNew || browserChanged, session.isNew || sessionChanged)
    }
    if (meaningfulActivity) this.session = touchSession(this.storage, this.session, nowMs)
    return { browser: this.browser, session: this.session }
  }

  queueBootstrap(browserCreated, sessionStarted) {
    const nowMs = this.now()
    if (browserCreated) {
      const event = this.buildEvent('browser_created', {}, nowMs)
      if (event) this.queue.enqueue(event, nowMs)
    }
    if (sessionStarted) {
      const event = this.buildEvent('session_started', {}, nowMs)
      if (event) this.queue.enqueue(event, nowMs)
    }
    if ((browserCreated || sessionStarted) && this.started) this.scheduleFlush(0)
  }

  buildEvent(eventName, fields = {}, nowMs = this.now()) {
    if (!EVENT_NAMES.has(eventName)) return null
    const surface = enumOr(fields.surface, SURFACES, this.current.surface)
    if (!surface) return null

    const event = {
      schema_version: SCHEMA_VERSION,
      event_name: eventName,
      event_id: randomId(this.cryptoObj),
      occurred_at: nowMs,
      browser_id: this.browser.id,
      session_id: this.session.id,
      tab_id: this.tabId,
      surface,
      display_mode: enumOr(fields.displayMode, DISPLAY_MODES, this.displayMode || 'unknown'),
      entry_point: enumOr(fields.entryPoint, ENTRY_POINTS, this.current.entryPoint || 'unknown'),
    }

    const searchId = safeId(fields.searchId)
    const playbackId = safeId(fields.playbackId)
    const world = enumOr(fields.world, WORLDS, this.current.world)
    const contentType = enumOr(fields.contentType, CONTENT_TYPES, this.current.contentType)
    const contentId = safeId(fields.contentId || this.current.contentId)
    const errorCode = enumOr(fields.errorCode, ERROR_CODES)
    const buildId = safeId(fields.buildId || this.current.buildId)
    const searchTerm = sanitiseSearchTerm(fields.searchTerm)
    const eventValue = finiteNumber(fields.eventValue)

    if (searchId) event.search_id = searchId
    if (playbackId) event.playback_instance_id = playbackId
    if (world) event.world = world
    if (contentType) event.content_type = contentType
    if (contentId) event.content_id = contentId
    if (errorCode) event.error_code = errorCode
    if (buildId) event.build_id = buildId
    if (searchTerm) event.search_term = searchTerm
    if (eventValue != null) event.event_value = eventValue

    const source = sanitiseToken(fields.source ?? this.acquisition.source)
    const medium = sanitiseToken(fields.medium ?? this.acquisition.medium)
    const campaign = sanitiseToken(fields.campaign ?? this.acquisition.campaign)
    if (source) event.source = source
    if (medium) event.medium = medium
    if (campaign) event.campaign = campaign
    if (this.acquisition.referrerHost) event.referrer_host = this.acquisition.referrerHost

    if (eventName.startsWith('search_') && !searchId) return null
    if (['play_intent', 'playback_started', 'playback_resumed', 'playback_paused', 'playback_ended'].includes(eventName) && !playbackId) return null
    if (eventName === 'playback_error' && !errorCode) return null

    if (eventName === 'presence_heartbeat') {
      event.playback_state = enumOr(fields.playbackState, PLAYBACK_STATES, this.current.playbackState || 'unknown')
      event.played_ms_since_previous_heartbeat = Math.max(0, Math.min(MAX_HEARTBEAT_PLAYED_MS, finiteNumber(fields.playedMs) || 0))
    }
    return event
  }

  isDuplicate(eventName, key, nowMs, windowMs) {
    if (!key) return false
    const dedupeKey = `${eventName}:${String(key).slice(0, 160)}`
    const prior = this.dedupe.get(dedupeKey)
    if (prior != null && nowMs - prior < windowMs) return true
    this.dedupe.set(dedupeKey, nowMs)
    if (this.dedupe.size > 500) {
      for (const [entry, at] of this.dedupe) {
        if (nowMs - at > 60_000) this.dedupe.delete(entry)
      }
    }
    return false
  }

  track(eventName, fields = {}, options = {}) {
    try {
      if (eventName === 'presence_heartbeat') return null
      const nowMs = this.now()
      this.refreshIdentity(nowMs, true)
      const dedupeWindowMs = Math.max(0, Math.min(60_000, Number(options.dedupeWindowMs ?? 1_000)))
      if (this.isDuplicate(eventName, options.dedupeKey, nowMs, dedupeWindowMs)) return null
      const event = this.buildEvent(eventName, fields, nowMs)
      if (!event) return null
      if (!this.queue.enqueue(event, nowMs)) return null
      this.scheduleFlush(options.flushDelayMs ?? 25)
      return event.event_id
    } catch {
      return null
    }
  }

  accruePlaying(nowMs) {
    if (this.current.playbackState === 'playing' && this.playingSinceMs != null) {
      this.accumulatedPlayedMs += Math.max(0, nowMs - this.playingSinceMs)
      this.playingSinceMs = nowMs
    }
  }

  setPresenceState(next = {}) {
    try {
      const nowMs = this.now()
      this.accruePlaying(nowMs)
      const previousPlayback = this.current.playbackState
      this.current = {
        ...this.current,
        surface: enumOr(next.surface, SURFACES, this.current.surface),
        playbackState: enumOr(next.playbackState, PLAYBACK_STATES, this.current.playbackState),
        world: enumOr(next.world, WORLDS, next.world === '' ? '' : this.current.world),
        contentType: enumOr(next.contentType, CONTENT_TYPES, next.contentType === '' ? '' : this.current.contentType),
        contentId: next.contentId === '' ? '' : safeId(next.contentId) || this.current.contentId,
        entryPoint: enumOr(next.entryPoint, ENTRY_POINTS, this.current.entryPoint),
        buildId: safeId(next.buildId) || this.current.buildId,
      }
      if (this.current.playbackState === 'playing') {
        if (previousPlayback !== 'playing' || this.playingSinceMs == null) this.playingSinceMs = nowMs
      } else {
        this.playingSinceMs = null
      }
      return true
    } catch {
      return false
    }
  }

  shouldSendPresence(nowMs) {
    if (this.current.playbackState === 'playing') return true
    const sharedSession = readActiveSession(this.storage, nowMs)
    if (sharedSession) this.session = sharedSession
    const visible = !this.documentObj || this.documentObj.visibilityState === 'visible'
    return visible && sessionIsActive(this.session, nowMs)
  }

  async heartbeat() {
    try {
      const nowMs = this.now()
      this.accruePlaying(nowMs)
      const playedMs = Math.min(MAX_HEARTBEAT_PLAYED_MS, Math.max(0, this.accumulatedPlayedMs))
      this.accumulatedPlayedMs = 0
      if (this.current.playbackState === 'playing') this.refreshIdentity(nowMs, true)
      if (!this.shouldSendPresence(nowMs)) return false
      if (this.navigatorObj?.onLine === false) return false

      const event = this.buildEvent('presence_heartbeat', {
        surface: this.current.surface,
        playbackState: this.current.playbackState,
        playedMs,
        world: this.current.world,
        contentType: this.current.contentType,
        contentId: this.current.contentId,
        entryPoint: this.current.entryPoint,
        buildId: this.current.buildId,
      }, nowMs)
      if (!event) return false
      return await sendEvents([event], {
        endpoint: this.endpoint,
        navigatorObj: this.navigatorObj,
        fetchImpl: this.fetchImpl,
      })
    } catch {
      return false
    }
  }

  async flush(options = {}) {
    if (this.flushing) return this.flushing
    this.flushing = this.performFlush(options).finally(() => { this.flushing = null })
    return this.flushing
  }

  async performFlush(options = {}) {
    const nowMs = this.now()
    if (this.navigatorObj?.onLine === false && !options.preferBeacon) return false
    const events = this.queue.peek(nowMs)
    if (!events.length) {
      this.retryIndex = 0
      return true
    }
    const success = await sendEvents(events, {
      endpoint: this.endpoint,
      navigatorObj: this.navigatorObj,
      fetchImpl: this.fetchImpl,
      preferBeacon: Boolean(options.preferBeacon),
    })
    if (success) {
      this.queue.remove(events.map((event) => event.event_id), this.now())
      this.retryIndex = 0
      if (this.queue.size(this.now()) > 0) this.scheduleFlush(0)
      return true
    }
    if (!options.preferBeacon) {
      const delay = RETRY_DELAYS_MS[Math.min(this.retryIndex, RETRY_DELAYS_MS.length - 1)]
      this.retryIndex = Math.min(this.retryIndex + 1, RETRY_DELAYS_MS.length - 1)
      this.scheduleFlush(delay)
    }
    return false
  }

  scheduleFlush(delayMs = 0) {
    if (typeof this.scheduler.setTimeout !== 'function') return
    const bounded = Math.max(0, Math.min(5 * 60_000, Number(delayMs) || 0))
    const dueAt = this.now() + bounded
    if (this.flushTimer != null) {
      if (this.flushDueAt != null && this.flushDueAt <= dueAt) return
      if (typeof this.scheduler.clearTimeout === 'function') this.scheduler.clearTimeout(this.flushTimer)
      this.flushTimer = null
      this.flushDueAt = null
    }
    this.flushDueAt = dueAt
    this.flushTimer = this.scheduler.setTimeout(() => {
      this.flushTimer = null
      this.flushDueAt = null
      void this.flush()
    }, bounded)
  }

  start() {
    if (this.started) return
    this.started = true
    if (typeof this.scheduler.setInterval === 'function') {
      this.heartbeatTimer = this.scheduler.setInterval(() => { void this.heartbeat() }, HEARTBEAT_INTERVAL_MS)
    }
    this.windowObj?.addEventListener?.('online', this.boundOnline)
    this.windowObj?.addEventListener?.('pagehide', this.boundPageHide)
    this.documentObj?.addEventListener?.('visibilitychange', this.boundVisibility)
    this.scheduleFlush(0)
  }

  stop() {
    if (!this.started) return
    this.started = false
    if (this.heartbeatTimer != null && typeof this.scheduler.clearInterval === 'function') {
      this.scheduler.clearInterval(this.heartbeatTimer)
      this.heartbeatTimer = null
    }
    if (this.flushTimer != null && typeof this.scheduler.clearTimeout === 'function') {
      this.scheduler.clearTimeout(this.flushTimer)
      this.flushTimer = null
      this.flushDueAt = null
    }
    this.windowObj?.removeEventListener?.('online', this.boundOnline)
    this.windowObj?.removeEventListener?.('pagehide', this.boundPageHide)
    this.documentObj?.removeEventListener?.('visibilitychange', this.boundVisibility)
  }

  destroy() {
    this.stop()
    this.dedupe.clear()
  }

  queueSize() {
    try {
      return this.queue.size(this.now())
    } catch {
      return 0
    }
  }
}

export function createTelemetry(options = {}) {
  try {
    return new TelemetryClient(options)
  } catch (error) {
    return createDisabledTelemetry(error instanceof Error ? error.message : 'initialisation_failed')
  }
}
