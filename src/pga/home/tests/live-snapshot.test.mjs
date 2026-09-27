import assert from 'node:assert/strict'
import process from 'node:process'

import { composeHomeLiveSnapshot } from '../live-snapshot.js'

const NOW = Date.parse('2026-09-10T05:00:00Z')

let checks = 0
let failed = false

async function check(name, fn) {
  checks += 1
  try {
    await fn()
    console.log(`✓ ${name}`)
  } catch (error) {
    failed = true
    console.error(`✗ ${name}`)
    console.error(`  ${error instanceof Error ? error.stack || error.message : String(error)}`)
  }
}

function heartbeat(sessionKey, {
  ageMs = 1_000,
  playbackState = 'none',
  surface = 'player',
  world = 'courtyard',
  contentId = null,
  eventId = `event-${sessionKey}`,
} = {}) {
  return {
    sessionKey,
    acceptedAt: NOW - ageMs,
    playbackState,
    surface,
    world,
    contentType: contentId ? 'song' : null,
    contentId,
    eventId,
  }
}

function availableHome(metrics = { sessionsToday: { value: 12 } }) {
  return {
    status: 'available',
    checkedAt: NOW - 500,
    dataThroughAt: NOW - 1_000,
    metrics,
  }
}

await check('both sources available preserves a real zero Live state', () => {
  const snapshot = composeHomeLiveSnapshot({
    home: availableHome({ sessionsToday: { value: 0 } }),
    presence: { status: 'available', heartbeats: [], checkedAt: NOW },
  }, { nowMs: NOW })

  assert.equal(snapshot.status, 'available')
  assert.equal(snapshot.home.metrics.sessionsToday.value, 0)
  assert.equal(snapshot.home.metrics.sessionsToday.zeroData, true)
  assert.equal(snapshot.live.metrics.liveNow.value, 0)
  assert.equal(snapshot.live.metrics.listeningNow.value, 0)
  assert.equal(snapshot.live.metrics.browsingNow.value, 0)
})

await check('available Home plus unavailable Live is partial without fake live zero', () => {
  const snapshot = composeHomeLiveSnapshot({
    home: availableHome(),
    presence: { status: 'unavailable', reason: 'Presence query unavailable.' },
  }, { nowMs: NOW })

  assert.equal(snapshot.status, 'partial')
  assert.equal(snapshot.home.metrics.sessionsToday.value, 12)
  assert.equal(snapshot.live.metrics.liveNow.status, 'unavailable')
  assert.equal(snapshot.live.metrics.liveNow.value, null)
  assert.equal(snapshot.live.metrics.liveNow.displayValue, '—')
})

await check('unavailable Home plus available Live is partial and keeps Live truth', () => {
  const snapshot = composeHomeLiveSnapshot({
    home: { status: 'unavailable', metrics: { sessionsToday: {} } },
    presence: { status: 'available', heartbeats: [heartbeat('a')] },
  }, { nowMs: NOW })

  assert.equal(snapshot.status, 'partial')
  assert.equal(snapshot.home.metrics.sessionsToday.value, null)
  assert.equal(snapshot.live.metrics.liveNow.value, 1)
  assert.equal(snapshot.live.metrics.browsingNow.value, 1)
})

await check('stale Live evidence is surfaced instead of appearing healthy', () => {
  const snapshot = composeHomeLiveSnapshot({
    home: availableHome(),
    presence: { status: 'stale', checkedAt: NOW - 300_000, reason: 'Presence rollup is stale.' },
  }, { nowMs: NOW })

  assert.equal(snapshot.status, 'stale')
  assert.equal(snapshot.live.status, 'stale')
  assert.equal(snapshot.live.metrics.liveNow.status, 'stale')
  assert.equal(snapshot.live.metrics.liveNow.value, null)
})

await check('offline and auth-expired Home states stay action-blocking', () => {
  for (const status of ['offline', 'auth-expired']) {
    const snapshot = composeHomeLiveSnapshot({
      home: { status, metrics: { sessionsToday: {} } },
      presence: { status: 'available', heartbeats: [heartbeat('a')] },
    }, { nowMs: NOW })
    assert.equal(snapshot.status, status)
    assert.equal(snapshot.home.status, status)
    assert.equal(snapshot.live.metrics.liveNow.value, 1)
  }
})

await check('Home error remains explicit even when Live can still be shown', () => {
  const snapshot = composeHomeLiveSnapshot({
    home: { status: 'error', reason: 'Aggregate failed.', metrics: { sessionsToday: {} } },
    presence: { status: 'available', heartbeats: [heartbeat('a')] },
  }, { nowMs: NOW })

  assert.equal(snapshot.status, 'partial')
  assert.equal(snapshot.home.status, 'error')
  assert.equal(snapshot.home.reason, 'Aggregate failed.')
  assert.equal(snapshot.live.metrics.liveNow.value, 1)
})

await check('invalid negative Home metric cannot hide behind available source status', () => {
  const snapshot = composeHomeLiveSnapshot({
    home: availableHome({ sessionsToday: { value: -1 } }),
    presence: { status: 'available', heartbeats: [] },
  }, { nowMs: NOW })

  assert.equal(snapshot.status, 'partial')
  assert.equal(snapshot.home.metrics.sessionsToday.status, 'error')
  assert.equal(snapshot.home.metrics.sessionsToday.value, null)
})

await check('Live counts use latest per-session playback truth', () => {
  const snapshot = composeHomeLiveSnapshot({
    home: availableHome(),
    presence: {
      status: 'available',
      heartbeats: [
        heartbeat('a', { ageMs: 30_000, playbackState: 'playing', eventId: 'a-old' }),
        heartbeat('a', { ageMs: 1_000, playbackState: 'paused', eventId: 'a-new' }),
        heartbeat('b', { playbackState: 'playing', contentId: 'song-b' }),
      ],
    },
  }, { nowMs: NOW })

  assert.equal(snapshot.live.metrics.liveNow.value, 2)
  assert.equal(snapshot.live.metrics.listeningNow.value, 1)
  assert.equal(snapshot.live.metrics.browsingNow.value, 1)
})

await check('privacy-suppressed presence breakdowns pass through unchanged', () => {
  const snapshot = composeHomeLiveSnapshot({
    home: availableHome(),
    presence: {
      status: 'available',
      heartbeats: [heartbeat('a'), heartbeat('b')],
    },
  }, { nowMs: NOW })

  assert.deepEqual(snapshot.live.breakdowns.surface.rows, [])
  assert.equal(snapshot.live.breakdowns.surface.suppressedSessions, 2)
  assert.equal(snapshot.live.breakdowns.surface.hasSuppressed, true)
})

await check('comparison reuses Home KPI math for normal percentage delta', () => {
  const snapshot = composeHomeLiveSnapshot({
    home: availableHome({ sessionsToday: { value: 15 } }),
    presence: { status: 'available', heartbeats: [] },
    comparisons: {
      sessions: {
        currentMetric: 'sessionsToday',
        prior: { status: 'available', value: 10 },
      },
    },
  }, { nowMs: NOW })

  assert.equal(snapshot.comparisons.sessions.status, 'comparable')
  assert.equal(snapshot.comparisons.sessions.percent, 50)
  assert.equal(snapshot.comparisons.sessions.direction, 'up')
})

await check('comparison keeps prior-zero new activity finite and explicit', () => {
  const snapshot = composeHomeLiveSnapshot({
    home: availableHome({ sessionsToday: { value: 3 } }),
    presence: { status: 'available', heartbeats: [] },
    comparisons: {
      sessions: {
        currentMetric: 'sessionsToday',
        prior: { status: 'available', value: 0 },
      },
    },
  }, { nowMs: NOW })

  assert.equal(snapshot.comparisons.sessions.status, 'new-activity')
  assert.equal(snapshot.comparisons.sessions.percent, null)
  assert.equal(snapshot.comparisons.sessions.label, 'New activity')
})

await check('missing prior evidence suppresses comparison instead of fabricating delta', () => {
  const snapshot = composeHomeLiveSnapshot({
    home: availableHome({ sessionsToday: { value: 3 } }),
    presence: { status: 'available', heartbeats: [] },
    comparisons: { sessions: { currentMetric: 'sessionsToday' } },
  }, { nowMs: NOW })

  assert.equal(snapshot.comparisons.sessions.status, 'unavailable')
  assert.equal(snapshot.comparisons.sessions.percent, null)
  assert.equal(snapshot.comparisons.sessions.delta, null)
})

await check('trend summaries reuse text-first rising, falling, flat and insufficient semantics', () => {
  const snapshot = composeHomeLiveSnapshot({
    home: availableHome(),
    presence: { status: 'available', heartbeats: [] },
    trends: {
      rising: { label: 'Live sessions', points: [{ live: 1 }, { live: 4 }], valueKey: 'live' },
      falling: [5, 2],
      flat: [3, 3],
      insufficient: [1],
    },
  }, { nowMs: NOW })

  assert.equal(snapshot.trends.rising.direction, 'up')
  assert.match(snapshot.trends.rising.text, /rose from 1 to 4/)
  assert.equal(snapshot.trends.falling.direction, 'down')
  assert.equal(snapshot.trends.flat.direction, 'flat')
  assert.equal(snapshot.trends.insufficient.status, 'insufficient')
})

await check('expired heartbeat is not retained as a ghost live session', () => {
  const snapshot = composeHomeLiveSnapshot({
    home: availableHome(),
    presence: {
      status: 'available',
      heartbeats: [heartbeat('expired', { ageMs: 120_001 })],
    },
  }, { nowMs: NOW })

  assert.equal(snapshot.status, 'available')
  assert.equal(snapshot.live.metrics.liveNow.value, 0)
})

await check('comparison and trend keys are emitted deterministically', () => {
  const input = {
    home: availableHome({ alpha: { value: 1 }, beta: { value: 2 } }),
    presence: { status: 'available', heartbeats: [] },
    comparisons: {
      zeta: { currentMetric: 'beta', prior: { status: 'available', value: 1 } },
      alpha: { currentMetric: 'alpha', prior: { status: 'available', value: 1 } },
    },
    trends: { zeta: [1, 2], alpha: [2, 1] },
  }

  const first = composeHomeLiveSnapshot(input, { nowMs: NOW })
  const second = composeHomeLiveSnapshot(input, { nowMs: NOW })
  assert.deepEqual(first, second)
  assert.deepEqual(Object.keys(first.comparisons), ['alpha', 'zeta'])
  assert.deepEqual(Object.keys(first.trends), ['alpha', 'zeta'])
  assert.equal(first.schemaVersion, 'pga-home-live/v1')
})

await check('real numeric zero is accepted as a finite snapshot clock', () => {
  const snapshot = composeHomeLiveSnapshot({
    home: { status: 'available', metrics: {} },
    presence: { status: 'available', heartbeats: [] },
  }, { nowMs: 0 })
  assert.equal(snapshot.evaluatedAt, 0)
})

await check('coercible and non-finite snapshot clocks fail closed', () => {
  for (const nowMs of ['123', '', false, true, null, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
    assert.throws(
      () => composeHomeLiveSnapshot({}, { nowMs }),
      /nowMs must be a finite number/,
      `nowMs ${String(nowMs)} must fail closed`,
    )
  }
})

if (failed) process.exitCode = 1
else console.log(`PGA Home + Live snapshot tests passed (${checks} checks).`)
