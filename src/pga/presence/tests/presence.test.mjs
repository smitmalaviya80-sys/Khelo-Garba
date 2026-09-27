import test from 'node:test';
import assert from 'node:assert/strict';

import {
  BREAKDOWN_MIN_SESSIONS,
  HEARTBEAT_INTERVAL_MS,
  LIVE_WINDOW_MS,
  LISTENING_BUCKET_MS,
  MAX_HEARTBEAT_PLAYED_MS,
  PRESENCE_STATUSES,
  aggregateListeningTime,
  aggregatePresence,
  buildPresenceTrend,
  isHeartbeatLive,
  normalizeHeartbeat,
} from '../model.js';

const NOW = 1_800_000_000_000;

function heartbeat(sessionKey, ageMs = 0, overrides = {}) {
  return {
    eventId: overrides.eventId ?? `${sessionKey}-${NOW - ageMs}-${overrides.tabKey ?? 'tab'}`,
    sessionKey,
    tabKey: overrides.tabKey ?? 'tab-a',
    acceptedAt: NOW - ageMs,
    surface: overrides.surface ?? 'player',
    world: overrides.world ?? 'traditional',
    playbackState: overrides.playbackState ?? 'none',
    contentType: overrides.contentType ?? null,
    contentId: overrides.contentId ?? null,
    playedMsSincePreviousHeartbeat: overrides.playedMsSincePreviousHeartbeat ?? 0,
  };
}

test('exports the canonical live-presence constants', () => {
  assert.equal(HEARTBEAT_INTERVAL_MS, 45_000);
  assert.equal(LIVE_WINDOW_MS, 120_000);
  assert.equal(BREAKDOWN_MIN_SESSIONS, 3);
  assert.equal(LISTENING_BUCKET_MS, 60_000);
  assert.equal(MAX_HEARTBEAT_PLAYED_MS, 60_000);
});

test('one current browsing session is live but not listening', () => {
  const result = aggregatePresence([heartbeat('s1', 5_000)], { nowMs: NOW });
  assert.equal(result.status, PRESENCE_STATUSES.AVAILABLE);
  assert.equal(result.liveNow, 1);
  assert.equal(result.listeningNow, 0);
  assert.equal(result.browsingNow, 1);
});

test('confirmed playing state distinguishes listening from browsing', () => {
  const result = aggregatePresence([
    heartbeat('s1', 10_000, { playbackState: 'playing' }),
    heartbeat('s2', 10_000, { playbackState: 'paused' }),
    heartbeat('s3', 10_000, { playbackState: 'unknown' }),
  ], { nowMs: NOW });
  assert.equal(result.liveNow, 3);
  assert.equal(result.listeningNow, 1);
  assert.equal(result.browsingNow, 2);
});

test('exact 120-second boundary is live and ages out immediately after it', () => {
  const edge = heartbeat('edge', LIVE_WINDOW_MS);
  assert.equal(isHeartbeatLive(edge, NOW), true);
  assert.equal(aggregatePresence([edge], { nowMs: NOW }).liveNow, 1);
  assert.equal(aggregatePresence([edge], { nowMs: NOW + 1 }).liveNow, 0);
});

test('future accepted heartbeat does not make a session live', () => {
  const future = { ...heartbeat('future'), acceptedAt: NOW + 1 };
  assert.equal(isHeartbeatLive(future, NOW), false);
  assert.equal(aggregatePresence([future], { nowMs: NOW }).liveNow, 0);
});

test('heartbeat timestamps require finite JavaScript numbers without coercion', () => {
  assert.equal(normalizeHeartbeat({ sessionKey: 'epoch', acceptedAt: 0 })?.acceptedAt, 0);

  for (const acceptedAt of [String(NOW), '', false, true, null, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
    const candidate = { ...heartbeat('invalid-time'), acceptedAt };
    assert.equal(normalizeHeartbeat(candidate), null, `acceptedAt ${String(acceptedAt)} must fail closed`);
  }

  assert.equal(
    aggregatePresence([{ ...heartbeat('string-live'), acceptedAt: String(NOW) }], { nowMs: NOW }).liveNow,
    0,
    'numeric-string acceptedAt must not make a session live',
  );
});

test('duplicate and multi-tab heartbeats deduplicate by session key', () => {
  const duplicate = heartbeat('same', 10_000, { eventId: 'duplicate', tabKey: 'tab-a' });
  const result = aggregatePresence([
    duplicate,
    { ...duplicate },
    heartbeat('same', 5_000, { eventId: 'newer', tabKey: 'tab-b', playbackState: 'playing' }),
  ], { nowMs: NOW });
  assert.equal(result.liveNow, 1);
  assert.equal(result.listeningNow, 1);
  assert.equal(result.liveSessions[0].tabKey, 'tab-b');
});

test('latest heartbeat changes current surface and playback state', () => {
  const result = aggregatePresence([
    heartbeat('s1', 40_000, { surface: 'explore', playbackState: 'none' }),
    heartbeat('s1', 5_000, { surface: 'nonstop', playbackState: 'playing' }),
  ], { nowMs: NOW });
  assert.equal(result.liveSessions[0].surface, 'nonstop');
  assert.equal(result.liveSessions[0].playbackState, 'playing');
  assert.equal(result.listeningNow, 1);
});

test('out-of-order older heartbeat cannot overwrite newer session state', () => {
  const newer = heartbeat('s1', 5_000, { eventId: 'newer', playbackState: 'playing' });
  const older = heartbeat('s1', 50_000, { eventId: 'older', playbackState: 'paused' });
  const forward = aggregatePresence([newer, older], { nowMs: NOW });
  const reverse = aggregatePresence([older, newer], { nowMs: NOW });
  assert.equal(forward.listeningNow, 1);
  assert.equal(reverse.listeningNow, 1);
  assert.equal(forward.liveSessions[0].eventId, 'newer');
  assert.equal(reverse.liveSessions[0].eventId, 'newer');
});

test('same-timestamp collisions resolve deterministically independent of input order', () => {
  const paused = heartbeat('s1', 5_000, {
    eventId: 'a-event',
    tabKey: 'tab-a',
    playbackState: 'paused',
    surface: 'explore',
  });
  const playing = heartbeat('s1', 5_000, {
    eventId: 'z-event',
    tabKey: 'tab-z',
    playbackState: 'playing',
    surface: 'player',
  });

  const first = aggregatePresence([paused, playing], { nowMs: NOW });
  const second = aggregatePresence([playing, paused], { nowMs: NOW });
  assert.deepEqual(first.liveSessions, second.liveSessions);
  assert.equal(first.listeningNow, second.listeningNow);
});

test('breakdowns suppress one/two-session groups and expose groups at three', () => {
  const result = aggregatePresence([
    heartbeat('s1', 1_000, { surface: 'player', world: 'traditional' }),
    heartbeat('s2', 2_000, { surface: 'player', world: 'traditional' }),
    heartbeat('s3', 3_000, { surface: 'player', world: 'traditional' }),
    heartbeat('s4', 4_000, { surface: 'explore', world: 'folk' }),
    heartbeat('s5', 5_000, { surface: 'explore', world: 'folk' }),
  ], { nowMs: NOW });

  assert.deepEqual(result.breakdowns.surface.rows, [{ key: 'player', count: 3 }]);
  assert.equal(result.breakdowns.surface.suppressedSessions, 2);
  assert.deepEqual(result.breakdowns.world.rows, [{ key: 'traditional', count: 3 }]);
  assert.equal(result.breakdowns.world.suppressedSessions, 2);
});

test('content breakdown requires confirmed playing plus canonical identity', () => {
  const result = aggregatePresence([
    heartbeat('s1', 1_000, { playbackState: 'playing', contentType: 'song', contentId: 'song-a' }),
    heartbeat('s2', 1_000, { playbackState: 'playing', contentType: 'song', contentId: 'song-a' }),
    heartbeat('s3', 1_000, { playbackState: 'playing', contentType: 'song', contentId: 'song-a' }),
    heartbeat('s4', 1_000, { playbackState: 'paused', contentType: 'song', contentId: 'song-b' }),
    heartbeat('s5', 1_000, { playbackState: 'playing', contentType: 'song', contentId: null }),
  ], { nowMs: NOW });

  assert.deepEqual(result.breakdowns.content.rows, [{ key: 'song:song-a', count: 3 }]);
  assert.equal(result.breakdowns.content.suppressedSessions, 0);
});

test('fake clock moves a session live -> expired -> recovered with new evidence', () => {
  const first = heartbeat('s1', 0, { eventId: 'first' });
  assert.equal(aggregatePresence([first], { nowMs: NOW }).liveNow, 1);
  assert.equal(aggregatePresence([first], { nowMs: NOW + LIVE_WINDOW_MS + 1 }).liveNow, 0);

  const recovered = {
    ...heartbeat('s1', 0, { eventId: 'recovered', playbackState: 'playing' }),
    acceptedAt: NOW + LIVE_WINDOW_MS + 2,
  };
  const result = aggregatePresence([first, recovered], { nowMs: NOW + LIVE_WINDOW_MS + 2 });
  assert.equal(result.liveNow, 1);
  assert.equal(result.listeningNow, 1);
});

test('unavailable/stale/error source evidence returns null metrics, never fake zero', () => {
  for (const status of ['unavailable', 'stale', 'error']) {
    const result = aggregatePresence({
      status,
      heartbeats: [],
      checkedAt: NOW,
      dataThroughAt: NOW - 10_000,
      source: 'analytics-engine',
      reason: 'fixture state',
    }, { nowMs: NOW });
    assert.equal(result.status, status);
    assert.equal(result.liveNow, null);
    assert.equal(result.listeningNow, null);
    assert.equal(result.browsingNow, null);
    assert.equal(result.source, 'analytics-engine');
    assert.equal(result.reason, 'fixture state');
  }
});

test('source timing metadata rejects coercible non-number values', () => {
  const result = aggregatePresence({
    status: 'unavailable',
    heartbeats: [],
    checkedAt: '123',
    dataThroughAt: false,
  }, { nowMs: NOW });
  assert.equal(result.checkedAt, null);
  assert.equal(result.dataThroughAt, null);
});

test('available empty evidence is a truthful zero', () => {
  const result = aggregatePresence({ status: 'available', heartbeats: [], checkedAt: NOW }, { nowMs: NOW });
  assert.equal(result.liveNow, 0);
  assert.equal(result.listeningNow, 0);
  assert.equal(result.browsingNow, 0);
});

test('missing evidence is unavailable rather than zero', () => {
  const result = aggregatePresence(undefined, { nowMs: NOW });
  assert.equal(result.status, 'unavailable');
  assert.equal(result.liveNow, null);
});

test('aggregate clock rejects coercible non-number values', () => {
  for (const nowMs of ['123', '', false, true, null, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
    assert.throws(
      () => aggregatePresence([], { nowMs }),
      /nowMs must be a finite number/,
      `nowMs ${String(nowMs)} must fail closed`,
    );
  }
});

test('same-session same-minute listening contribution is capped at 60 seconds', () => {
  const minuteStart = Math.floor(NOW / LISTENING_BUCKET_MS) * LISTENING_BUCKET_MS;
  const rows = [
    { ...heartbeat('s1', 0, { eventId: 'a', playedMsSincePreviousHeartbeat: 40_000 }), acceptedAt: minuteStart + 10_000 },
    { ...heartbeat('s1', 0, { eventId: 'b', tabKey: 'tab-b', playedMsSincePreviousHeartbeat: 40_000 }), acceptedAt: minuteStart + 50_000 },
  ];
  const result = aggregateListeningTime(rows);
  assert.equal(result.totalMs, 60_000);
  assert.deepEqual(result.bySession, [{ sessionKey: 's1', milliseconds: 60_000 }]);
  assert.equal(result.bucketCount, 1);
});

test('duplicate heartbeat evidence does not double listening time', () => {
  const row = heartbeat('s1', 0, { eventId: 'one-event', playedMsSincePreviousHeartbeat: 15_000 });
  const result = aggregateListeningTime([row, { ...row }]);
  assert.equal(result.totalMs, 15_000);
});

test('coercible played-millisecond evidence cannot fabricate listening time', () => {
  const malformed = ['15000', '', false, true, null, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]
    .map((playedMsSincePreviousHeartbeat, index) => ({
      ...heartbeat(`bad-played-${index}`, 0, { eventId: `bad-played-${index}` }),
      playedMsSincePreviousHeartbeat,
    }));
  const result = aggregateListeningTime(malformed);
  assert.equal(result.totalMs, 0);
  assert.deepEqual(result.bySession, []);
  assert.equal(result.bucketCount, 0);
});

test('listening time can accumulate across minute buckets while each bucket remains capped', () => {
  const minuteStart = Math.floor(NOW / LISTENING_BUCKET_MS) * LISTENING_BUCKET_MS;
  const result = aggregateListeningTime([
    { ...heartbeat('s1', 0, { eventId: 'm1a', playedMsSincePreviousHeartbeat: 50_000 }), acceptedAt: minuteStart + 1_000 },
    { ...heartbeat('s1', 0, { eventId: 'm1b', playedMsSincePreviousHeartbeat: 50_000 }), acceptedAt: minuteStart + 40_000 },
    { ...heartbeat('s1', 0, { eventId: 'm2', playedMsSincePreviousHeartbeat: 30_000 }), acceptedAt: minuteStart + 61_000 },
  ]);
  assert.equal(result.totalMs, 90_000);
  assert.deepEqual(result.bySession, [{ sessionKey: 's1', milliseconds: 90_000 }]);
  assert.equal(result.bucketCount, 2);
});

test('per-heartbeat played milliseconds are clamped to canonical maximum', () => {
  const result = aggregateListeningTime([
    heartbeat('s1', 0, { eventId: 'oversized', playedMsSincePreviousHeartbeat: 500_000 }),
  ]);
  assert.equal(result.totalMs, MAX_HEARTBEAT_PLAYED_MS);
});

test('short trend uses the same deterministic live/listening semantics', () => {
  const base = NOW - 180_000;
  const rows = [
    { ...heartbeat('s1', 0, { eventId: 's1', playbackState: 'none' }), acceptedAt: base },
    { ...heartbeat('s2', 0, { eventId: 's2', playbackState: 'playing' }), acceptedAt: base + 60_000 },
  ];
  const trend = buildPresenceTrend(rows, {
    startMs: base,
    endMs: base + 180_001,
    stepMs: 60_000,
  });

  assert.deepEqual(trend.slice(0, 4), [
    { at: base, liveNow: 1, listeningNow: 0, browsingNow: 1 },
    { at: base + 60_000, liveNow: 2, listeningNow: 1, browsingNow: 1 },
    { at: base + 120_000, liveNow: 2, listeningNow: 1, browsingNow: 1 },
    { at: base + 180_000, liveNow: 1, listeningNow: 1, browsingNow: 0 },
  ]);
});

test('trend boundaries reject coercible non-number values', () => {
  for (const [field, value] of [['startMs', '0'], ['endMs', '1'], ['stepMs', '1']]) {
    const options = { startMs: 0, endMs: 1, stepMs: 1, [field]: value };
    assert.throws(
      () => buildPresenceTrend([], options),
      /Presence trend requires finite startMs\/endMs and positive stepMs/,
      `${field} must reject numeric strings`,
    );
  }
});
