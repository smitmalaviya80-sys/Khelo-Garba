import test from 'node:test'
import assert from 'node:assert/strict'

import { createProductTelemetryBridge } from '../product-bridge.js'

function clone(value) {
  return JSON.parse(JSON.stringify(value))
}

class FakeTelemetry {
  constructor() {
    this.events = []
    this.presence = []
    this.searchCounter = 0
    this.playbackCounter = 0
    this.eventCounter = 0
    this.rejectEvents = new Set()
    this.throwEvents = new Set()
    this.rejectPresence = false
    this.throwPresence = false
    this.throwCorrelations = new Set()
  }

  searchId() {
    if (this.throwCorrelations.has('searchId')) throw new Error('search id unavailable')
    this.searchCounter += 1
    return `search-${this.searchCounter}`
  }

  playbackId() {
    if (this.throwCorrelations.has('playbackId')) throw new Error('playback id unavailable')
    this.playbackCounter += 1
    return `playback-${this.playbackCounter}`
  }

  track(eventName, fields = {}, options = {}) {
    if (this.throwEvents.has(eventName)) throw new Error(`track failed: ${eventName}`)
    if (this.rejectEvents.has(eventName)) return null
    this.eventCounter += 1
    this.events.push({ eventName, fields: clone(fields), options: clone(options) })
    return `event-${this.eventCounter}`
  }

  setPresenceState(fields = {}) {
    if (this.throwPresence) throw new Error('presence failed')
    if (this.rejectPresence) return false
    this.presence.push(clone(fields))
    return true
  }
}

function eventNames(fake) {
  return fake.events.map((event) => event.eventName)
}

function eventsNamed(fake, name) {
  return fake.events.filter((event) => event.eventName === name)
}

test('surface, Explore and Nonstop methods emit bounded semantic events without inventing a Nonstop world', () => {
  const fake = new FakeTelemetry()
  const bridge = createProductTelemetryBridge(fake)

  assert.equal(bridge.surfaceViewed({ surface: 'player', world: 'traditional', entryPoint: 'player' }), true)
  assert.equal(bridge.exploreOpened({ world: 'folk' }), true)
  assert.equal(bridge.nonstopOpened({ world: '' }), true)

  assert.deepEqual(eventNames(fake), ['surface_viewed', 'explore_opened', 'nonstop_opened'])
  const nonstop = fake.events.at(-1)
  assert.equal(nonstop.fields.surface, 'nonstop')
  assert.equal(nonstop.fields.entryPoint, 'nonstop_browser')
  assert.equal(Object.prototype.hasOwnProperty.call(nonstop.fields, 'world'), false)
  assert.equal(fake.presence.at(-1).surface, 'nonstop')
  assert.equal(fake.presence.at(-1).world, '')
})

test('new search correlation replaces the prior search and cannot cross-link old results', () => {
  const fake = new FakeTelemetry()
  const bridge = createProductTelemetryBridge(fake)

  const first = bridge.searchSubmitted({ searchTerm: 'maa garba', world: 'devotional' })
  assert.equal(first, 'search-1')
  assert.equal(bridge.searchZeroResults({ searchId: first }), true)

  const second = bridge.searchSubmitted({ searchTerm: 'dandiya', world: 'dandiya' })
  assert.equal(second, 'search-2')
  assert.equal(bridge.searchResultSelected({
    searchId: first,
    contentType: 'song',
    contentId: 'old-result',
  }), false)
  assert.equal(bridge.searchResultSelected({
    searchId: second,
    contentType: 'song',
    contentId: 'new-result',
    world: 'dandiya',
  }), true)

  const selections = eventsNamed(fake, 'search_result_selected')
  assert.equal(selections.length, 1)
  assert.equal(selections[0].fields.searchId, second)
  assert.equal(selections[0].fields.contentId, 'new-result')
})

test('rejected search submission does not replace the last accepted correlation', () => {
  const fake = new FakeTelemetry()
  const bridge = createProductTelemetryBridge(fake)

  const first = bridge.searchSubmitted({ searchTerm: 'folk' })
  fake.rejectEvents.add('search_submitted')
  const rejected = bridge.searchSubmitted({ searchTerm: 'sanedo' })

  assert.equal(first, 'search-1')
  assert.equal(rejected, null)
  assert.equal(bridge.searchZeroResults({ searchId: first }), true)
  assert.equal(bridge.searchZeroResults({ searchId: 'search-2' }), false)
})

test('collection selection requires canonical content identity before telemetry is attempted', () => {
  const fake = new FakeTelemetry()
  const bridge = createProductTelemetryBridge(fake)

  assert.equal(bridge.collectionSelected({ contentType: 'release', contentId: '' }), false)
  assert.equal(bridge.collectionSelected({ contentType: 'not-a-content-type', contentId: 'release-1' }), false)
  assert.equal(bridge.collectionSelected({
    contentType: 'release',
    contentId: 'release-1',
    world: 'traditional',
  }), true)

  assert.equal(eventsNamed(fake, 'collection_selected').length, 1)
})

test('play intent never emits playback_started and provider confirmation is mandatory', () => {
  const fake = new FakeTelemetry()
  const bridge = createProductTelemetryBridge(fake)

  const playbackId = bridge.playIntent({
    contentType: 'song',
    contentId: 'song-1',
    world: 'traditional',
    entryPoint: 'player',
  })

  assert.equal(playbackId, 'playback-1')
  assert.deepEqual(eventNames(fake), ['play_intent'])
  assert.equal(fake.presence.some((value) => value.playbackState === 'playing'), false)

  assert.equal(bridge.providerPlaybackStarted({ playbackId, confirmed: false }), false)
  assert.deepEqual(eventNames(fake), ['play_intent'])

  assert.equal(bridge.providerPlaybackStarted({ playbackId, confirmed: true }), true)
  assert.deepEqual(eventNames(fake), ['play_intent', 'playback_started'])
  assert.equal(fake.presence.at(-1).playbackState, 'playing')
  assert.equal(fake.presence.at(-1).contentId, 'song-1')
})

test('duplicate provider-start callback cannot double-count one playback instance', () => {
  const fake = new FakeTelemetry()
  const bridge = createProductTelemetryBridge(fake)
  const playbackId = bridge.playIntent({ contentType: 'song', contentId: 'song-1' })

  assert.equal(bridge.providerPlaybackStarted({ playbackId, confirmed: true }), true)
  assert.equal(bridge.providerPlaybackStarted({ playbackId, confirmed: true }), false)
  assert.equal(eventsNamed(fake, 'playback_started').length, 1)
})

test('rejected play intent never becomes a valid provider-start correlation', () => {
  const fake = new FakeTelemetry()
  const bridge = createProductTelemetryBridge(fake)
  fake.rejectEvents.add('play_intent')

  const playbackId = bridge.playIntent({ contentType: 'song', contentId: 'song-rejected' })
  assert.equal(playbackId, null)
  assert.equal(bridge.providerPlaybackStarted({ playbackId: 'playback-1', confirmed: true }), false)
  assert.equal(eventsNamed(fake, 'playback_started').length, 0)
})

test('older confirmed playback can still pause after a newer intent until the newer provider start is confirmed', () => {
  const fake = new FakeTelemetry()
  const bridge = createProductTelemetryBridge(fake)

  const first = bridge.playIntent({ contentType: 'song', contentId: 'song-a', world: 'folk' })
  assert.equal(bridge.providerPlaybackStarted({ playbackId: first, confirmed: true }), true)

  const second = bridge.playIntent({ contentType: 'song', contentId: 'song-b', world: 'dandiya' })
  assert.equal(second, 'playback-2')
  assert.equal(bridge.playbackPaused({ playbackId: first }), true)
  assert.equal(fake.presence.at(-1).contentId, 'song-a')
  assert.equal(fake.presence.at(-1).playbackState, 'paused')

  assert.equal(bridge.providerPlaybackStarted({ playbackId: second, confirmed: true }), true)
  assert.equal(fake.presence.at(-1).contentId, 'song-b')
  assert.equal(fake.presence.at(-1).playbackState, 'playing')

  assert.equal(bridge.playbackResumed({ playbackId: first }), false)
  assert.equal(eventsNamed(fake, 'playback_resumed').length, 0)
})

test('late start for an older intent does not prevent the newer pending intent from starting afterward', () => {
  const fake = new FakeTelemetry()
  const bridge = createProductTelemetryBridge(fake)

  const first = bridge.playIntent({ contentType: 'song', contentId: 'song-old', world: 'folk' })
  const second = bridge.playIntent({ contentType: 'song', contentId: 'song-new', world: 'fusion' })

  assert.equal(bridge.providerPlaybackStarted({ playbackId: first, confirmed: true }), true)
  assert.equal(fake.presence.at(-1).contentId, 'song-old')
  assert.equal(bridge.providerPlaybackStarted({ playbackId: second, confirmed: true }), true)
  assert.equal(fake.presence.at(-1).contentId, 'song-new')
  assert.equal(eventsNamed(fake, 'playback_started').length, 2)
})

test('pause, resume and end require the currently confirmed playback and update presence only after accepted events', () => {
  const fake = new FakeTelemetry()
  const bridge = createProductTelemetryBridge(fake)
  const playbackId = bridge.playIntent({ contentType: 'song', contentId: 'song-life' })
  bridge.providerPlaybackStarted({ playbackId, confirmed: true })

  assert.equal(bridge.playbackPaused({ playbackId }), true)
  assert.equal(fake.presence.at(-1).playbackState, 'paused')
  assert.equal(bridge.playbackPaused({ playbackId }), false)

  fake.rejectEvents.add('playback_resumed')
  assert.equal(bridge.playbackResumed({ playbackId }), false)
  assert.equal(fake.presence.at(-1).playbackState, 'paused')

  fake.rejectEvents.delete('playback_resumed')
  assert.equal(bridge.playbackResumed({ playbackId }), true)
  assert.equal(fake.presence.at(-1).playbackState, 'playing')

  assert.equal(bridge.playbackEnded({ playbackId }), true)
  assert.equal(fake.presence.at(-1).playbackState, 'none')
  assert.equal(fake.presence.at(-1).contentType, '')
  assert.equal(fake.presence.at(-1).contentId, '')
  assert.equal(bridge.playbackEnded({ playbackId }), false)
})

test('next, previous and skip requests are tied to confirmed playback only', () => {
  const fake = new FakeTelemetry()
  const bridge = createProductTelemetryBridge(fake)

  assert.equal(bridge.nextRequested(), false)
  const playbackId = bridge.playIntent({ contentType: 'song', contentId: 'song-transport' })
  assert.equal(bridge.nextRequested(), false)
  bridge.providerPlaybackStarted({ playbackId, confirmed: true })

  assert.equal(bridge.nextRequested(), true)
  assert.equal(bridge.previousRequested(), true)
  assert.equal(bridge.skipRequested(), true)

  const transport = fake.events.slice(-3)
  assert.deepEqual(transport.map((value) => value.eventName), [
    'next_requested',
    'previous_requested',
    'skip_requested',
  ])
  assert.equal(transport.every((value) => value.fields.playbackId === playbackId), true)
})

test('unavailable and error evidence never fabricate playback success', () => {
  const fake = new FakeTelemetry()
  const bridge = createProductTelemetryBridge(fake)
  const playbackId = bridge.playIntent({ contentType: 'song', contentId: 'song-unavailable' })

  assert.equal(bridge.playbackUnavailable({ playbackId, errorCode: 'route_unavailable' }), true)
  assert.equal(bridge.playbackError({ playbackId, errorCode: 'embed_error' }), true)
  assert.equal(eventsNamed(fake, 'playback_started').length, 0)
  assert.equal(fake.presence.some((value) => value.playbackState === 'playing'), false)
})

test('playback_error requires a canonical bounded error code', () => {
  const fake = new FakeTelemetry()
  const bridge = createProductTelemetryBridge(fake)
  const playbackId = bridge.playIntent({ contentType: 'song', contentId: 'song-error' })

  assert.equal(bridge.playbackError({ playbackId, errorCode: 'arbitrary-provider-message' }), false)
  assert.equal(bridge.playbackError({ playbackId, errorCode: 'network' }), true)
  assert.equal(eventsNamed(fake, 'playback_error').length, 1)
  assert.equal(eventsNamed(fake, 'playback_error')[0].fields.errorCode, 'network')
})

test('a fresh playback instance can start normally after an earlier instance ends', () => {
  const fake = new FakeTelemetry()
  const bridge = createProductTelemetryBridge(fake)

  const first = bridge.playIntent({ contentType: 'song', contentId: 'song-1' })
  bridge.providerPlaybackStarted({ playbackId: first, confirmed: true })
  bridge.playbackEnded({ playbackId: first })

  const second = bridge.playIntent({ contentType: 'song', contentId: 'song-2' })
  assert.equal(bridge.providerPlaybackStarted({ playbackId: second, confirmed: true }), true)
  assert.equal(eventsNamed(fake, 'playback_started').length, 2)
  assert.equal(fake.presence.at(-1).contentId, 'song-2')
})

test('invalid or out-of-order correlation IDs fail closed without telemetry events', () => {
  const fake = new FakeTelemetry()
  const bridge = createProductTelemetryBridge(fake)

  assert.equal(bridge.searchZeroResults({ searchId: 'unknown-search' }), false)
  assert.equal(bridge.providerPlaybackStarted({ playbackId: 'unknown-playback', confirmed: true }), false)
  assert.equal(bridge.playbackPaused({ playbackId: 'unknown-playback' }), false)
  assert.equal(bridge.playbackEnded({ playbackId: 'unknown-playback' }), false)
  assert.deepEqual(fake.events, [])
})

test('disabled or throwing telemetry remains fail-open for listener product paths', () => {
  const disabled = createProductTelemetryBridge({ disabled: true })
  assert.doesNotThrow(() => disabled.surfaceViewed({ surface: 'player' }))
  assert.equal(disabled.searchSubmitted({ searchTerm: 'garba' }), null)
  assert.equal(disabled.playIntent({ contentType: 'song', contentId: 'song-1' }), null)

  const throwing = new FakeTelemetry()
  throwing.throwCorrelations.add('searchId')
  throwing.throwCorrelations.add('playbackId')
  throwing.throwEvents.add('surface_viewed')
  throwing.throwPresence = true
  const bridge = createProductTelemetryBridge(throwing)

  assert.equal(bridge.surfaceViewed({ surface: 'player' }), false)
  assert.equal(bridge.updatePresenceContext({ surface: 'explore' }), false)
  assert.equal(bridge.searchSubmitted({ searchTerm: 'garba' }), null)
  assert.equal(bridge.playIntent({ contentType: 'song', contentId: 'song-1' }), null)
})

test('presence context remains fail-open and explicit world clearing is forwarded to the telemetry core', () => {
  const fake = new FakeTelemetry()
  const bridge = createProductTelemetryBridge(fake)

  fake.rejectPresence = true
  assert.equal(bridge.updatePresenceContext({ surface: 'explore', world: 'folk' }), false)

  fake.rejectPresence = false
  assert.equal(bridge.updatePresenceContext({ surface: 'nonstop', world: '', entryPoint: 'nonstop_browser' }), true)
  assert.deepEqual(fake.presence.at(-1), {
    surface: 'nonstop',
    world: '',
    entryPoint: 'nonstop_browser',
  })
})

test('provider state-churn events carry deterministic dedupe keys scoped to the playback instance', () => {
  const fake = new FakeTelemetry()
  const bridge = createProductTelemetryBridge(fake)
  const playbackId = bridge.playIntent({ contentType: 'song', contentId: 'song-dedupe' })
  bridge.providerPlaybackStarted({ playbackId, confirmed: true })
  bridge.playbackPaused({ playbackId })
  bridge.playbackResumed({ playbackId })
  bridge.playbackEnded({ playbackId })

  const started = eventsNamed(fake, 'playback_started')[0]
  const paused = eventsNamed(fake, 'playback_paused')[0]
  const resumed = eventsNamed(fake, 'playback_resumed')[0]
  const ended = eventsNamed(fake, 'playback_ended')[0]

  assert.equal(started.options.dedupeKey, `provider-start:${playbackId}`)
  assert.equal(paused.options.dedupeKey, `provider-pause:${playbackId}`)
  assert.equal(resumed.options.dedupeKey, `provider-resume:${playbackId}`)
  assert.equal(ended.options.dedupeKey, `provider-end:${playbackId}`)
})
