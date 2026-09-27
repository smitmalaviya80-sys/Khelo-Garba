import test from 'node:test'
import assert from 'node:assert/strict'

import {
  liveBreakdownSql,
  liveSql,
  liveTrendSql,
} from '../lib/analytics.js'
import { LIVE_EXPIRY_SECONDS } from '../lib/constants.js'

const SECOND = 1000
const MINUTE = 60 * SECOND
const NOW = Date.parse('2026-09-10T04:00:00.000Z')

function liveRows(rows, nowMs = NOW, expiryMs = LIVE_EXPIRY_SECONDS * SECOND) {
  const sessions = new Map()
  for (const row of rows) {
    if (row.internal || row.bot) continue
    if (!Number.isFinite(row.receivedAtMs)) continue
    if (row.receivedAtMs > nowMs || nowMs - row.receivedAtMs > expiryMs) continue

    const candidate = {
      sessionKey: row.sessionKey,
      eventId: String(row.eventId || ''),
      isListening: row.playbackState === 'playing',
      surface: row.surface || '',
      world: row.world || '',
      displayMode: row.displayMode || 'unknown',
      receivedAtMs: row.receivedAtMs,
      sampleInterval: Math.max(1, Number(row.sampleInterval) || 1),
    }
    const prior = sessions.get(row.sessionKey)
    if (
      !prior
      || candidate.receivedAtMs > prior.receivedAtMs
      || (candidate.receivedAtMs === prior.receivedAtMs && candidate.eventId > prior.eventId)
    ) {
      sessions.set(row.sessionKey, candidate)
    }
  }

  let liveNow = 0
  let listeningNow = 0
  let browsingNow = 0
  for (const session of sessions.values()) {
    liveNow += session.sampleInterval
    if (session.isListening) listeningNow += session.sampleInterval
    else browsingNow += session.sampleInterval
  }
  return { liveNow, listeningNow, browsingNow, sessions: [...sessions.values()] }
}

function trendRows(rows, nowMs = NOW, minutes = 30) {
  const boundedMinutes = Math.max(5, Math.min(60, Math.floor(Number(minutes) || 30)))
  const cutoff = nowMs - boundedMinutes * MINUTE
  const latestTabs = new Map()
  for (const row of rows) {
    if (row.internal || row.bot) continue
    if (!Number.isFinite(row.receivedAtMs) || row.receivedAtMs <= cutoff || row.receivedAtMs > nowMs) continue
    const minute = Math.floor(row.receivedAtMs / MINUTE) * MINUTE
    const key = `${minute}|${row.sessionKey}|${row.tabKey}`
    const prior = latestTabs.get(key)
    if (!prior || row.receivedAtMs > prior.receivedAtMs) latestTabs.set(key, { ...row, minute })
  }

  const sessions = new Map()
  for (const row of latestTabs.values()) {
    const key = `${row.minute}|${row.sessionKey}`
    const prior = sessions.get(key)
    const interval = Math.max(1, Number(row.sampleInterval) || 1)
    sessions.set(key, {
      minute: row.minute,
      listening: Boolean(prior?.listening || row.playbackState === 'playing'),
      interval: Math.max(prior?.interval || 1, interval),
    })
  }

  const buckets = new Map()
  for (const row of sessions.values()) {
    const bucket = buckets.get(row.minute) || { minute: row.minute, active: 0, listening: 0, browsing: 0 }
    bucket.active += row.interval
    if (row.listening) bucket.listening += row.interval
    else bucket.browsing += row.interval
    buckets.set(row.minute, bucket)
  }
  return [...buckets.values()].sort((a, b) => a.minute - b.minute)
}

function heartbeat(overrides = {}) {
  return {
    sessionKey: 'session-a',
    tabKey: 'tab-a',
    eventId: 'event-a',
    playbackState: 'none',
    surface: 'player',
    world: '',
    displayMode: 'browser',
    receivedAtMs: NOW - 10 * SECOND,
    sampleInterval: 1,
    internal: false,
    bot: false,
    ...overrides,
  }
}

test('Live SQL resolves same-time rows before one latest session state and sample-weights estimates', () => {
  const sql = liveSql('playgarba_presence_v1')
  assert.match(sql, /GROUP BY session_key, received_at_ms/)
  assert.match(sql, /argMax\(playback_state, received_at_ms\)/)
  assert.match(sql, /argMax\(blob6, blob1\) AS playback_state/)
  assert.match(sql, /GROUP BY session_key/)
  assert.match(sql, /SUM\(sample_interval\) AS live_now/)
  assert.match(sql, /SUM\(CASE WHEN playback_state = 'playing' THEN sample_interval ELSE 0 END\) AS listening_now/)
  assert.match(sql, /INTERVAL '120' SECOND/)
  assert.match(sql, /toDateTime\(double3 \/ 1000\) <= NOW\(\)/)
  assert.match(sql, /double5 = 0 AND double6 = 0/)
  assert.doesNotMatch(sql, /COUNT\(\) AS live_now/)
})

test('A newer browsing sibling heartbeat replaces an older playing session state', () => {
  const result = liveRows([
    heartbeat({ tabKey: 'playing-tab', eventId: 'event-playing', playbackState: 'playing', world: 'traditional', receivedAtMs: NOW - 40 * SECOND }),
    heartbeat({ tabKey: 'browse-tab', eventId: 'event-browse', playbackState: 'none', surface: 'explore', receivedAtMs: NOW - 5 * SECOND }),
  ])
  assert.deepEqual(
    { liveNow: result.liveNow, listeningNow: result.listeningNow, browsingNow: result.browsingNow },
    { liveNow: 1, listeningNow: 0, browsingNow: 1 },
  )
  assert.equal(result.sessions[0].world, '')
  assert.equal(result.sessions[0].surface, 'explore')
})

test('Multiple tabs count one shared session and the latest accepted heartbeat wins across tabs', () => {
  const result = liveRows([
    heartbeat({ tabKey: 'tab-a', eventId: 'event-1', playbackState: 'playing', receivedAtMs: NOW - 70 * SECOND }),
    heartbeat({ tabKey: 'tab-a', eventId: 'event-2', playbackState: 'paused', receivedAtMs: NOW - 20 * SECOND }),
    heartbeat({ tabKey: 'tab-b', eventId: 'event-3', playbackState: 'none', receivedAtMs: NOW - 10 * SECOND }),
  ])
  assert.equal(result.liveNow, 1)
  assert.equal(result.listeningNow, 0)
  assert.equal(result.browsingNow, 1)
})

test('Same-time session heartbeats resolve deterministically by event ID', () => {
  const result = liveRows([
    heartbeat({ tabKey: 'tab-a', eventId: 'event-a', playbackState: 'playing', receivedAtMs: NOW - 10 * SECOND }),
    heartbeat({ tabKey: 'tab-b', eventId: 'event-z', playbackState: 'none', surface: 'explore', receivedAtMs: NOW - 10 * SECOND }),
  ])
  assert.equal(result.liveNow, 1)
  assert.equal(result.listeningNow, 0)
  assert.equal(result.browsingNow, 1)
  assert.equal(result.sessions[0].eventId, 'event-z')
  assert.equal(result.sessions[0].surface, 'explore')
})

test('Exact expiry boundary remains live while older, future, internal and bot heartbeats do not', () => {
  const result = liveRows([
    heartbeat({ sessionKey: 'boundary', eventId: 'boundary', receivedAtMs: NOW - 120 * SECOND }),
    heartbeat({ sessionKey: 'expired', eventId: 'expired', receivedAtMs: NOW - 121 * SECOND }),
    heartbeat({ sessionKey: 'future', eventId: 'future', receivedAtMs: NOW + SECOND }),
    heartbeat({ sessionKey: 'internal', eventId: 'internal', internal: true }),
    heartbeat({ sessionKey: 'bot', eventId: 'bot', bot: true }),
    heartbeat({ sessionKey: 'real', eventId: 'real', playbackState: 'playing' }),
  ])
  assert.equal(result.liveNow, 2)
  assert.equal(result.listeningNow, 1)
  assert.equal(result.browsingNow, 1)
})

test('If the playing heartbeat expires but a browsing sibling remains fresh, the session becomes browsing', () => {
  const result = liveRows([
    heartbeat({ tabKey: 'old-playing', eventId: 'old-playing', playbackState: 'playing', receivedAtMs: NOW - 121 * SECOND }),
    heartbeat({ tabKey: 'fresh-browse', eventId: 'fresh-browse', playbackState: 'none', receivedAtMs: NOW - 3 * SECOND }),
  ])
  assert.deepEqual(
    { liveNow: result.liveNow, listeningNow: result.listeningNow, browsingNow: result.browsingNow },
    { liveNow: 1, listeningNow: 0, browsingNow: 1 },
  )
})

test('Sampled sessions use the surviving latest session sample interval instead of raw row count', () => {
  const result = liveRows([
    heartbeat({ sessionKey: 'sampled', tabKey: 'one', eventId: 'sampled-old', playbackState: 'none', sampleInterval: 8, receivedAtMs: NOW - 20 * SECOND }),
    heartbeat({ sessionKey: 'sampled', tabKey: 'two', eventId: 'sampled-new', playbackState: 'playing', sampleInterval: 8, receivedAtMs: NOW - 5 * SECOND }),
    heartbeat({ sessionKey: 'exact', tabKey: 'one', eventId: 'exact', playbackState: 'none', sampleInterval: 1 }),
  ])
  assert.equal(result.liveNow, 9)
  assert.equal(result.listeningNow, 8)
  assert.equal(result.browsingNow, 1)
})

test('Live breakdown exposes only coarse product context and weighted aggregate counts', () => {
  const sql = liveBreakdownSql('playgarba_presence_v1')
  assert.match(sql, /surface/)
  assert.match(sql, /world/)
  assert.match(sql, /display_mode/)
  assert.match(sql, /SUM\(sample_interval\) AS sessions/)
  assert.match(sql, /listening_sessions/)
  assert.match(sql, /browsing_sessions/)
  assert.match(sql, /GROUP BY surface, world, display_mode/)
  assert.doesNotMatch(sql, /geo/)
  assert.doesNotMatch(sql, /content_id/)
  assert.doesNotMatch(sql, /browser_key/)
})

test('Thirty-minute trend collapses tabs per shared session within each minute', () => {
  const rows = trendRows([
    heartbeat({ sessionKey: 'one', tabKey: 'a', playbackState: 'playing', receivedAtMs: NOW - 65 * SECOND }),
    heartbeat({ sessionKey: 'one', tabKey: 'b', playbackState: 'none', receivedAtMs: NOW - 55 * SECOND }),
    heartbeat({ sessionKey: 'two', tabKey: 'a', playbackState: 'none', receivedAtMs: NOW - 55 * SECOND }),
  ])
  assert.equal(rows.length, 2)
  assert.deepEqual(rows[0], {
    minute: Math.floor((NOW - 65 * SECOND) / MINUTE) * MINUTE,
    active: 1,
    listening: 1,
    browsing: 0,
  })
  assert.deepEqual(rows[1], {
    minute: Math.floor((NOW - 55 * SECOND) / MINUTE) * MINUTE,
    active: 2,
    listening: 0,
    browsing: 2,
  })
})

test('Trend SQL is bounded to 5-60 minutes and keeps sample-aware tab/session collapse', () => {
  const normal = liveTrendSql('playgarba_presence_v1', 30)
  assert.match(normal, /INTERVAL '30' MINUTE/)
  assert.match(normal, /GROUP BY minute_bucket, session_key, tab_key/)
  assert.match(normal, /GROUP BY minute_bucket, session_key/)
  assert.match(normal, /SUM\(sample_interval\) AS active_sessions/)
  assert.match(normal, /ORDER BY minute_bucket ASC/)

  assert.match(liveTrendSql('playgarba_presence_v1', 1), /INTERVAL '5' MINUTE/)
  assert.match(liveTrendSql('playgarba_presence_v1', 999), /INTERVAL '60' MINUTE/)
  assert.match(liveTrendSql('playgarba_presence_v1', 'not-a-number'), /INTERVAL '30' MINUTE/)
})

test('Live expiry remains two minutes so a missed 45-second heartbeat can recover without long ghost sessions', () => {
  assert.equal(LIVE_EXPIRY_SECONDS, 120)
})
