import test from 'node:test'
import assert from 'node:assert/strict'
import { webcrypto } from 'node:crypto'

if (!globalThis.crypto) globalThis.crypto = webcrypto

import {
  BROWSER_STORAGE_KEY,
  BROWSER_TTL_MS,
  HEARTBEAT_INTERVAL_MS,
  MAX_QUEUE_EVENTS,
  QUEUE_STORAGE_KEY,
  QUEUE_TTL_MS,
  SESSION_TTL_MS,
} from '../constants.js'
import {
  getBrowserIdentity,
  getSessionIdentity,
  readActiveSession,
} from '../identity.js'
import {
  acquisitionFromLocation,
  detectDisplayMode,
  sanitiseSearchTerm,
} from '../privacy.js'
import { EventQueue } from '../queue.js'
import { createTelemetry, TelemetryClient } from '../runtime.js'
import { createResilientStorage, MemoryStorage } from '../storage.js'
import { sendEvents } from '../transport.js'
import { validateBatch } from '../../backend/lib/validation.js'

const BASE_NOW = Date.parse('2026-09-09T20:00:00.000Z')

class FakeClock {
  constructor(now = BASE_NOW) {
    this.value = now
  }
  now = () => this.value
  advance(ms) {
    this.value += ms
  }
}

class FakeScheduler {
  constructor() {
    this.nextId = 1
    this.timeouts = new Map()
    this.intervals = new Map()
  }
  setTimeout = (fn, delay) => {
    const id = this.nextId++
    this.timeouts.set(id, { fn, delay })
    return id
  }
  clearTimeout = (id) => this.timeouts.delete(id)
  setInterval = (fn, delay) => {
    const id = this.nextId++
    this.intervals.set(id, { fn, delay })
    return id
  }
  clearInterval = (id) => this.intervals.delete(id)
  timeoutDelays() {
    return [...this.timeouts.values()].map((entry) => entry.delay)
  }
}

function clientOptions(overrides = {}) {
  const clock = overrides.clock || new FakeClock()
  const scheduler = overrides.scheduler || new FakeScheduler()
  return {
    clock,
    scheduler,
    options: {
      autoStart: false,
      clock,
      storage: overrides.storage || new MemoryStorage(),
      cryptoObj: webcrypto,
      navigatorObj: overrides.navigatorObj || { onLine: true },
      documentObj: overrides.documentObj || { visibilityState: 'visible' },
      locationObj: overrides.locationObj || { href: 'https://playgarba.com/' },
      fetchImpl: overrides.fetchImpl || (async () => ({ ok: true, status: 202 })),
      setTimeoutImpl: scheduler.setTimeout,
      clearTimeoutImpl: scheduler.clearTimeout,
      setIntervalImpl: scheduler.setInterval,
      clearIntervalImpl: scheduler.clearInterval,
      ...overrides.options,
    },
  }
}

function queueEvent(id, extra = {}) {
  return {
    schema_version: 1,
    event_name: 'surface_viewed',
    event_id: id,
    occurred_at: BASE_NOW,
    browser_id: 'browser',
    session_id: 'session',
    tab_id: 'tab',
    surface: 'player',
    display_mode: 'browser',
    entry_point: 'player',
    ...extra,
  }
}

test('browser identity is reused inside 180 days and rotates at expiry', () => {
  const storage = new MemoryStorage()
  const first = getBrowserIdentity(storage, BASE_NOW, webcrypto)
  const reused = getBrowserIdentity(storage, BASE_NOW + BROWSER_TTL_MS - 1, webcrypto)
  const rotated = getBrowserIdentity(storage, BASE_NOW + BROWSER_TTL_MS, webcrypto)
  assert.equal(reused.id, first.id)
  assert.equal(reused.isNew, false)
  assert.notEqual(rotated.id, first.id)
  assert.equal(rotated.isNew, true)
})

test('session identity is shared inside 30 minutes and rotates after inactivity', () => {
  const storage = new MemoryStorage()
  const first = getSessionIdentity(storage, BASE_NOW, webcrypto)
  const reused = getSessionIdentity(storage, BASE_NOW + SESSION_TTL_MS - 1, webcrypto)
  const rotated = getSessionIdentity(storage, BASE_NOW + SESSION_TTL_MS, webcrypto)
  assert.equal(reused.id, first.id)
  assert.notEqual(rotated.id, first.id)
})

test('readActiveSession never creates a new session for an idle heartbeat', () => {
  const storage = new MemoryStorage()
  const first = getSessionIdentity(storage, BASE_NOW, webcrypto)
  assert.equal(readActiveSession(storage, BASE_NOW + 1)?.id, first.id)
  assert.equal(readActiveSession(storage, BASE_NOW + SESSION_TTL_MS), null)
})

test('corrupt identity storage self-recovers with a random browser ID', () => {
  const storage = new MemoryStorage({ [BROWSER_STORAGE_KEY]: '{broken' })
  const identity = getBrowserIdentity(storage, BASE_NOW, webcrypto)
  assert.equal(identity.isNew, true)
  assert.match(identity.id, /^[A-Za-z0-9-]+$/)
})

test('storage exceptions degrade to a working in-memory store', () => {
  const primary = {
    getItem() { throw new Error('denied') },
    setItem() { throw new Error('denied') },
    removeItem() { throw new Error('denied') },
  }
  const storage = createResilientStorage(primary)
  storage.setItem('x', '1')
  assert.equal(storage.getItem('x'), '1')
  storage.removeItem('x')
  assert.equal(storage.getItem('x'), null)
})

test('queue discards corrupt JSON instead of throwing into the product', () => {
  const storage = new MemoryStorage({ [QUEUE_STORAGE_KEY]: '{broken' })
  const queue = new EventQueue(storage)
  assert.deepEqual(queue.load(BASE_NOW), [])
  assert.equal(storage.getItem(QUEUE_STORAGE_KEY), null)
})

test('queue evicts oldest events above the 100-event bound', () => {
  const queue = new EventQueue(new MemoryStorage())
  for (let i = 0; i < MAX_QUEUE_EVENTS + 8; i += 1) {
    queue.enqueue(queueEvent(`e-${i}`), BASE_NOW + i)
  }
  const events = queue.peek(BASE_NOW + MAX_QUEUE_EVENTS + 8, MAX_QUEUE_EVENTS)
  assert.equal(queue.size(BASE_NOW + MAX_QUEUE_EVENTS + 8), MAX_QUEUE_EVENTS)
  assert.equal(events[0].event_id, 'e-8')
})

test('queue enforces the byte bound by dropping oldest events', () => {
  const queue = new EventQueue(new MemoryStorage(), { maxBytes: 800, maxEvents: 100 })
  for (let i = 0; i < 8; i += 1) {
    queue.enqueue(queueEvent(`big-${i}`, { search_term: `term-${i}-${'x'.repeat(180)}` }), BASE_NOW + i)
  }
  const size = queue.size(BASE_NOW + 8)
  assert.ok(size > 0)
  assert.ok(size < 8)
})

test('queue expires events older than 24 hours', () => {
  const queue = new EventQueue(new MemoryStorage())
  queue.enqueue(queueEvent('old'), BASE_NOW)
  assert.equal(queue.size(BASE_NOW + QUEUE_TTL_MS + 1), 0)
})

test('presence heartbeats are never persisted in the retry queue', () => {
  const queue = new EventQueue(new MemoryStorage())
  const accepted = queue.enqueue(queueEvent('presence', { event_name: 'presence_heartbeat' }), BASE_NOW)
  assert.equal(accepted, false)
  assert.equal(queue.size(BASE_NOW), 0)
})

test('search sanitiser removes common PII shapes before queueing', () => {
  assert.equal(sanitiseSearchTerm('me@example.com'), '')
  assert.equal(sanitiseSearchTerm('+91 98765 43210'), '')
  assert.equal(sanitiseSearchTerm('https://example.com/private'), '')
  assert.equal(sanitiseSearchTerm('  nonstop   garba '), 'nonstop garba')
})

test('acquisition keeps only bounded UTM fields and referrer hostname', () => {
  const result = acquisitionFromLocation(
    { href: 'https://playgarba.com/?utm_source=instagram&utm_medium=social&utm_campaign=navratri&secret=do-not-store' },
    { referrer: 'https://www.google.com/search?q=private-query' },
  )
  assert.deepEqual(result, {
    source: 'instagram',
    medium: 'social',
    campaign: 'navratri',
    referrerHost: 'www.google.com',
  })
  assert.equal(JSON.stringify(result).includes('private-query'), false)
  assert.equal(JSON.stringify(result).includes('do-not-store'), false)
})

test('display-mode detection recognises iOS standalone without collecting device fingerprint data', () => {
  assert.equal(detectDisplayMode(null, { standalone: true }), 'standalone')
  assert.equal(detectDisplayMode({ matchMedia: () => ({ matches: false }) }, {}), 'browser')
})

test('transport failure resolves false instead of rejecting', async () => {
  const result = await sendEvents([queueEvent('one')], {
    fetchImpl: async () => { throw new Error('offline') },
    navigatorObj: { onLine: true },
  })
  assert.equal(result, false)
})

test('page-exit transport uses sendBeacon when accepted', async () => {
  let calls = 0
  const result = await sendEvents([queueEvent('one')], {
    preferBeacon: true,
    navigatorObj: { sendBeacon() { calls += 1; return true } },
    fetchImpl: async () => { throw new Error('fetch should not run') },
  })
  assert.equal(result, true)
  assert.equal(calls, 1)
})

test('runtime starts with truthful browser-created and session-started events', () => {
  const { options, clock } = clientOptions()
  const client = new TelemetryClient(options)
  const events = client.queue.peek(clock.now())
  assert.deepEqual(events.map((event) => event.event_name), ['browser_created', 'session_started'])
})

test('runtime events are accepted by the merged backend v1 validator', () => {
  const { options, clock } = clientOptions()
  const client = new TelemetryClient(options)
  client.track('surface_viewed', { surface: 'player' }, { flushDelayMs: 60_000 })
  const events = client.queue.peek(clock.now())
  assert.equal(validateBatch(events, { nowMs: clock.now() }).length, events.length)
})

test('playback lifecycle events require an explicit playback correlation ID', () => {
  const { options, clock } = clientOptions()
  const client = new TelemetryClient(options)
  client.queue.clear()
  assert.equal(client.track('play_intent', { contentType: 'song', contentId: 'song-1' }), null)
  const playbackId = client.playbackId()
  assert.ok(client.track('play_intent', { playbackId, contentType: 'song', contentId: 'song-1' }))
  assert.equal(client.queue.size(clock.now()), 1)
})

test('search event does not retain an email-like query locally', () => {
  const { options, clock } = clientOptions()
  const client = new TelemetryClient(options)
  client.queue.clear()
  client.track('search_submitted', { searchId: client.searchId(), searchTerm: 'me@example.com' })
  const [event] = client.queue.peek(clock.now())
  assert.equal('search_term' in event, false)
})

test('dedupe key suppresses provider/state churn only inside its requested window', () => {
  const { options, clock } = clientOptions()
  const client = new TelemetryClient(options)
  client.queue.clear()
  const first = client.track('surface_viewed', {}, { dedupeKey: 'player-visible', dedupeWindowMs: 1_000 })
  const second = client.track('surface_viewed', {}, { dedupeKey: 'player-visible', dedupeWindowMs: 1_000 })
  clock.advance(1_001)
  const third = client.track('surface_viewed', {}, { dedupeKey: 'player-visible', dedupeWindowMs: 1_000 })
  assert.ok(first)
  assert.equal(second, null)
  assert.ok(third)
})

test('meaningful activity after 30 minutes starts a new session before the event', () => {
  const { options, clock } = clientOptions()
  const client = new TelemetryClient(options)
  const firstSession = client.session.id
  client.queue.clear()
  clock.advance(SESSION_TTL_MS)
  client.track('surface_viewed', {})
  assert.notEqual(client.session.id, firstSession)
  const names = client.queue.peek(clock.now()).map((event) => event.event_name)
  assert.deepEqual(names, ['session_started', 'surface_viewed'])
})

test('hidden paused tabs stop emitting presence when the session is inactive', async () => {
  let requests = 0
  const clock = new FakeClock()
  const { options } = clientOptions({
    clock,
    documentObj: { visibilityState: 'hidden' },
    fetchImpl: async () => { requests += 1; return { ok: true } },
  })
  const client = new TelemetryClient(options)
  client.queue.clear()
  client.setPresenceState({ playbackState: 'paused' })
  clock.advance(SESSION_TTL_MS)
  assert.equal(await client.heartbeat(), false)
  assert.equal(requests, 0)
})

test('hidden confirmed playback can emit presence and counts only elapsed playing time', async () => {
  const bodies = []
  const clock = new FakeClock()
  const { options } = clientOptions({
    clock,
    documentObj: { visibilityState: 'hidden' },
    fetchImpl: async (_url, init) => { bodies.push(JSON.parse(init.body)); return { ok: true } },
  })
  const client = new TelemetryClient(options)
  client.queue.clear()
  client.setPresenceState({ playbackState: 'playing', contentType: 'song', contentId: 'song-1' })
  clock.advance(HEARTBEAT_INTERVAL_MS)
  assert.equal(await client.heartbeat(), true)
  assert.equal(bodies.length, 1)
  assert.equal(bodies[0][0].event_name, 'presence_heartbeat')
  assert.equal(bodies[0][0].played_ms_since_previous_heartbeat, HEARTBEAT_INTERVAL_MS)
})

test('a delayed playing heartbeat is conservatively capped at 60 seconds', async () => {
  let sent
  const clock = new FakeClock()
  const { options } = clientOptions({
    clock,
    documentObj: { visibilityState: 'hidden' },
    fetchImpl: async (_url, init) => { sent = JSON.parse(init.body)[0]; return { ok: true } },
  })
  const client = new TelemetryClient(options)
  client.setPresenceState({ playbackState: 'playing' })
  clock.advance(2 * 60_000)
  await client.heartbeat()
  assert.equal(sent.played_ms_since_previous_heartbeat, 60_000)
})

test('offline presence is dropped instead of entering the retry queue', async () => {
  const clock = new FakeClock()
  const { options } = clientOptions({ clock, navigatorObj: { onLine: false } })
  const client = new TelemetryClient(options)
  client.queue.clear()
  client.setPresenceState({ playbackState: 'playing' })
  clock.advance(HEARTBEAT_INTERVAL_MS)
  assert.equal(await client.heartbeat(), false)
  assert.equal(client.queue.size(clock.now()), 0)
})

test('failed presence is not replayed into the next successful heartbeat', async () => {
  const sent = []
  let fail = true
  const clock = new FakeClock()
  const { options } = clientOptions({
    clock,
    fetchImpl: async (_url, init) => {
      const event = JSON.parse(init.body)[0]
      sent.push(event)
      if (fail) throw new Error('offline')
      return { ok: true }
    },
  })
  const client = new TelemetryClient(options)
  client.setPresenceState({ playbackState: 'playing' })
  clock.advance(HEARTBEAT_INTERVAL_MS)
  assert.equal(await client.heartbeat(), false)
  fail = false
  clock.advance(HEARTBEAT_INTERVAL_MS)
  assert.equal(await client.heartbeat(), true)
  assert.equal(sent[0].played_ms_since_previous_heartbeat, HEARTBEAT_INTERVAL_MS)
  assert.equal(sent[1].played_ms_since_previous_heartbeat, HEARTBEAT_INTERVAL_MS)
})

test('successful flush removes only the batch that was accepted', async () => {
  const clock = new FakeClock()
  const { options } = clientOptions({ clock })
  const client = new TelemetryClient(options)
  client.queue.clear()
  for (let i = 0; i < 30; i += 1) client.queue.enqueue(queueEvent(`q-${i}`), clock.now() + i)
  clock.advance(31)
  assert.equal(await client.flush(), true)
  assert.equal(client.queue.size(clock.now()), 5)
})

test('failed flush retains events and schedules bounded retry', async () => {
  const clock = new FakeClock()
  const scheduler = new FakeScheduler()
  const { options } = clientOptions({
    clock,
    scheduler,
    fetchImpl: async () => { throw new Error('offline') },
  })
  const client = new TelemetryClient(options)
  client.queue.clear()
  const event = client.buildEvent('surface_viewed', {}, clock.now())
  client.queue.enqueue(event, clock.now())
  assert.equal(await client.flush(), false)
  assert.equal(client.queue.size(clock.now()), 1)
  assert.ok(scheduler.timeoutDelays().includes(5_000))
})

test('an earlier requested flush replaces a later retry timer', () => {
  const clock = new FakeClock()
  const scheduler = new FakeScheduler()
  const { options } = clientOptions({ clock, scheduler })
  const client = new TelemetryClient(options)
  client.scheduleFlush(60_000)
  assert.deepEqual(scheduler.timeoutDelays(), [60_000])
  client.scheduleFlush(25)
  assert.deepEqual(scheduler.timeoutDelays(), [25])
})

test('auto-start registers one 45-second heartbeat interval', () => {
  const scheduler = new FakeScheduler()
  const { options } = clientOptions({ scheduler, options: { autoStart: true } })
  const client = new TelemetryClient({ ...options, autoStart: true })
  assert.equal(scheduler.intervals.size, 1)
  assert.equal([...scheduler.intervals.values()][0].delay, HEARTBEAT_INTERVAL_MS)
  client.stop()
  assert.equal(scheduler.intervals.size, 0)
})

test('runtime disables itself instead of throwing when secure randomness is unavailable', () => {
  const telemetry = createTelemetry({ cryptoObj: {}, autoStart: false })
  assert.equal(telemetry.disabled, true)
  assert.equal(telemetry.track('surface_viewed'), null)
})
