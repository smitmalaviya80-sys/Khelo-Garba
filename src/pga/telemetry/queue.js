import {
  MAX_BATCH_EVENTS,
  MAX_QUEUE_BYTES,
  MAX_QUEUE_EVENTS,
  QUEUE_STORAGE_KEY,
  QUEUE_TTL_MS,
} from './constants.js'

const encoder = new TextEncoder()

function byteLength(value) {
  return encoder.encode(value).byteLength
}

function validQueuedItem(item) {
  return Boolean(
    item &&
    typeof item === 'object' &&
    Number.isFinite(item.queuedAtMs) &&
    item.event &&
    typeof item.event === 'object' &&
    typeof item.event.event_id === 'string' &&
    item.event.event_name !== 'presence_heartbeat'
  )
}

export class EventQueue {
  constructor(storage, options = {}) {
    this.storage = storage
    this.key = options.key || QUEUE_STORAGE_KEY
    this.maxEvents = options.maxEvents || MAX_QUEUE_EVENTS
    this.maxBytes = options.maxBytes || MAX_QUEUE_BYTES
    this.ttlMs = options.ttlMs || QUEUE_TTL_MS
  }

  load(nowMs) {
    let items = []
    try {
      const raw = this.storage.getItem(this.key)
      if (raw) items = JSON.parse(raw)
      if (!Array.isArray(items)) throw new Error('queue_not_array')
    } catch {
      this.storage.removeItem(this.key)
      return []
    }

    const minimumTime = nowMs - this.ttlMs
    const cleaned = items.filter((item) => validQueuedItem(item) && item.queuedAtMs >= minimumTime && item.queuedAtMs <= nowMs)
    if (cleaned.length !== items.length) this.save(cleaned)
    return cleaned
  }

  save(items) {
    try {
      this.storage.setItem(this.key, JSON.stringify(items))
      return true
    } catch {
      return false
    }
  }

  enqueue(event, nowMs) {
    if (!event || event.event_name === 'presence_heartbeat') return false
    const items = this.load(nowMs)
    if (items.some((item) => item.event.event_id === event.event_id)) return true
    items.push({ queuedAtMs: nowMs, event })

    while (items.length > this.maxEvents) items.shift()
    while (items.length && byteLength(JSON.stringify(items)) > this.maxBytes) items.shift()
    this.save(items)
    return items.some((item) => item.event.event_id === event.event_id)
  }

  peek(nowMs, limit = MAX_BATCH_EVENTS) {
    return this.load(nowMs).slice(0, Math.max(1, Math.min(MAX_BATCH_EVENTS, limit))).map((item) => item.event)
  }

  remove(eventIds, nowMs) {
    const ids = new Set(eventIds)
    const items = this.load(nowMs).filter((item) => !ids.has(item.event.event_id))
    this.save(items)
    return items.length
  }

  size(nowMs) {
    return this.load(nowMs).length
  }

  clear() {
    this.storage.removeItem(this.key)
  }
}
