import test from 'node:test'
import assert from 'node:assert/strict'

import { eventDataPoint } from '../lib/analytics.js'

test('eventDataPoint correctly packs event properties into Analytics Engine format', () => {
  const event = {
    browserKey: 'browser_123',
    sessionKey: 'session_456',
    tabKey: 'tab_789',
    searchKey: 'search_012',
    playbackKey: 'playback_345',
    eventName: 'test_event',
    eventId: 'event_999',
    surface: 'home',
    displayMode: 'standalone',
    world: 'exploration',
    contentType: 'album',
    contentId: 'album_1',
    entryPoint: 'direct',
    referrerHost: 'google.com',
    acquisition: 'source|medium|campaign',
    geo: 'US|CA',
    client: 'Mobile|iOS|Safari',
    buildId: 'build_xyz',
    errorCode: 'err_500',
    searchTerm: 'garba',
    schemaVersion: 2,
    occurredAtMs: 1600000000000,
    receivedAtMs: 1600000000100,
    eventValue: 42,
    internal: true,
    bot: false,
  }

  const expected = {
    indexes: ['browser_123'],
    blobs: [
      'test_event',
      'event_999',
      'browser_123',
      'session_456',
      'tab_789',
      'search_012',
      'playback_345',
      'home',
      'standalone',
      'exploration',
      'album',
      'album_1',
      'direct',
      'google.com',
      'source|medium|campaign',
      'US|CA',
      'Mobile|iOS|Safari',
      'build_xyz',
      'err_500',
      'garba',
    ],
    doubles: [
      2,
      1600000000000,
      1600000000100,
      42,
      1,
      0,
    ],
  }

  const result = eventDataPoint(event)
  assert.deepEqual(result, expected)
})

test('eventDataPoint handles falsy values and missing optional fields', () => {
  const event = {
    browserKey: 'browser_123',
    internal: false,
    bot: true,
  }

  const expected = {
    indexes: ['browser_123'],
    blobs: [
      undefined,
      undefined,
      'browser_123',
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
    ],
    doubles: [
      undefined,
      undefined,
      undefined,
      0, // eventValue fallback
      0, // internal ? 1 : 0
      1, // bot ? 1 : 0
    ],
  }

  const result = eventDataPoint(event)
  assert.deepEqual(result, expected)
})
