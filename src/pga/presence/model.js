export const HEARTBEAT_INTERVAL_MS = 45_000;
export const LIVE_WINDOW_MS = 120_000;
export const BREAKDOWN_MIN_SESSIONS = 3;
export const LISTENING_BUCKET_MS = 60_000;
export const MAX_HEARTBEAT_PLAYED_MS = 60_000;

export const PRESENCE_STATUSES = Object.freeze({
  AVAILABLE: 'available',
  UNAVAILABLE: 'unavailable',
  STALE: 'stale',
  ERROR: 'error',
});

const PLAYBACK_STATES = new Set(['playing', 'paused', 'none', 'unknown']);

function finiteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function boundedString(value, max = 160) {
  const text = String(value ?? '').trim();
  return text ? text.slice(0, max) : null;
}

function normalizePlaybackState(value) {
  const state = boundedString(value, 24)?.toLowerCase() || 'unknown';
  return PLAYBACK_STATES.has(state) ? state : 'unknown';
}

function stableTieKey(heartbeat) {
  return [
    boundedString(heartbeat.eventId ?? heartbeat.event_id, 128) || '',
    boundedString(heartbeat.tabKey ?? heartbeat.tab_key, 128) || '',
    normalizePlaybackState(heartbeat.playbackState ?? heartbeat.playback_state),
    boundedString(heartbeat.surface, 64) || '',
    boundedString(heartbeat.world, 64) || '',
    boundedString(heartbeat.contentType ?? heartbeat.content_type, 64) || '',
    boundedString(heartbeat.contentId ?? heartbeat.content_id, 160) || '',
    String(Math.max(0, Math.min(MAX_HEARTBEAT_PLAYED_MS, finiteNumber(heartbeat.playedMsSincePreviousHeartbeat ?? heartbeat.played_ms_since_previous_heartbeat) ?? 0))),
  ].join('\u001f');
}

export function normalizeHeartbeat(heartbeat) {
  if (!heartbeat || typeof heartbeat !== 'object') return null;
  const sessionKey = boundedString(heartbeat.sessionKey ?? heartbeat.session_key, 160);
  const acceptedAt = finiteNumber(
    heartbeat.acceptedAt
      ?? heartbeat.accepted_at
      ?? heartbeat.receivedAt
      ?? heartbeat.received_at,
  );
  if (!sessionKey || acceptedAt === null) return null;

  return Object.freeze({
    sessionKey,
    acceptedAt,
    eventId: boundedString(heartbeat.eventId ?? heartbeat.event_id, 128),
    tabKey: boundedString(heartbeat.tabKey ?? heartbeat.tab_key, 128),
    surface: boundedString(heartbeat.surface, 64),
    world: boundedString(heartbeat.world, 64),
    playbackState: normalizePlaybackState(heartbeat.playbackState ?? heartbeat.playback_state),
    contentType: boundedString(heartbeat.contentType ?? heartbeat.content_type, 64),
    contentId: boundedString(heartbeat.contentId ?? heartbeat.content_id, 160),
    playedMsSincePreviousHeartbeat: Math.max(
      0,
      Math.min(
        MAX_HEARTBEAT_PLAYED_MS,
        finiteNumber(heartbeat.playedMsSincePreviousHeartbeat ?? heartbeat.played_ms_since_previous_heartbeat) ?? 0,
      ),
    ),
    tieKey: stableTieKey(heartbeat),
  });
}

function newestBySession(heartbeats, { nowMs = Infinity } = {}) {
  const latest = new Map();
  for (const raw of Array.isArray(heartbeats) ? heartbeats : []) {
    const heartbeat = normalizeHeartbeat(raw);
    if (!heartbeat || heartbeat.acceptedAt > nowMs) continue;
    const previous = latest.get(heartbeat.sessionKey);
    if (
      !previous
      || heartbeat.acceptedAt > previous.acceptedAt
      || (heartbeat.acceptedAt === previous.acceptedAt && heartbeat.tieKey > previous.tieKey)
    ) {
      latest.set(heartbeat.sessionKey, heartbeat);
    }
  }
  return latest;
}

export function isHeartbeatLive(heartbeat, nowMs) {
  const normalized = normalizeHeartbeat(heartbeat);
  const now = finiteNumber(nowMs);
  if (!normalized || now === null || normalized.acceptedAt > now) return false;
  return now - normalized.acceptedAt <= LIVE_WINDOW_MS;
}

function suppressedBreakdown(values, minimum = BREAKDOWN_MIN_SESSIONS) {
  const counts = new Map();
  for (const value of values) {
    if (!value) continue;
    counts.set(value, (counts.get(value) || 0) + 1);
  }

  const rows = [];
  let suppressedSessions = 0;
  for (const [key, count] of [...counts.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    if (count >= minimum) rows.push(Object.freeze({ key, count }));
    else suppressedSessions += count;
  }

  rows.sort((left, right) => right.count - left.count || left.key.localeCompare(right.key));
  return Object.freeze({
    minimum,
    rows: Object.freeze(rows),
    suppressedSessions,
    hasSuppressed: suppressedSessions > 0,
  });
}

function sourceState(input) {
  if (Array.isArray(input)) {
    return {
      status: PRESENCE_STATUSES.AVAILABLE,
      heartbeats: input,
      checkedAt: null,
      dataThroughAt: null,
      source: null,
      reason: null,
    };
  }

  if (!input || typeof input !== 'object') {
    return {
      status: PRESENCE_STATUSES.UNAVAILABLE,
      heartbeats: [],
      checkedAt: null,
      dataThroughAt: null,
      source: null,
      reason: 'Presence evidence is unavailable.',
    };
  }

  const requestedStatus = boundedString(input.status, 32)?.toLowerCase();
  const status = Object.values(PRESENCE_STATUSES).includes(requestedStatus)
    ? requestedStatus
    : Array.isArray(input.heartbeats)
      ? PRESENCE_STATUSES.AVAILABLE
      : PRESENCE_STATUSES.UNAVAILABLE;

  return {
    status,
    heartbeats: Array.isArray(input.heartbeats) ? input.heartbeats : [],
    checkedAt: finiteNumber(input.checkedAt ?? input.checked_at),
    dataThroughAt: finiteNumber(input.dataThroughAt ?? input.data_through_at),
    source: boundedString(input.source, 240),
    reason: boundedString(input.reason, 240),
  };
}

function unavailableResult(source) {
  return Object.freeze({
    status: source.status,
    liveNow: null,
    listeningNow: null,
    browsingNow: null,
    liveSessions: Object.freeze([]),
    breakdowns: null,
    checkedAt: source.checkedAt,
    dataThroughAt: source.dataThroughAt,
    source: source.source,
    reason: source.reason || `Presence source status is ${source.status}.`,
  });
}

export function aggregatePresence(input, { nowMs = Date.now() } = {}) {
  const now = finiteNumber(nowMs);
  if (now === null) throw new TypeError('nowMs must be a finite number');

  const source = sourceState(input);
  if (source.status !== PRESENCE_STATUSES.AVAILABLE) return unavailableResult(source);

  const latestBySession = newestBySession(source.heartbeats, { nowMs: now });
  const liveSessions = [...latestBySession.values()]
    .filter((heartbeat) => now - heartbeat.acceptedAt <= LIVE_WINDOW_MS)
    .sort((left, right) => left.sessionKey.localeCompare(right.sessionKey));

  const listening = liveSessions.filter((heartbeat) => heartbeat.playbackState === 'playing');
  const surfaceValues = liveSessions.map((heartbeat) => heartbeat.surface);
  const worldValues = liveSessions.map((heartbeat) => heartbeat.world);
  const contentValues = listening
    .filter((heartbeat) => heartbeat.contentType && heartbeat.contentId)
    .map((heartbeat) => `${heartbeat.contentType}:${heartbeat.contentId}`);

  return Object.freeze({
    status: PRESENCE_STATUSES.AVAILABLE,
    liveNow: liveSessions.length,
    listeningNow: listening.length,
    browsingNow: liveSessions.length - listening.length,
    liveSessions: Object.freeze(liveSessions),
    breakdowns: Object.freeze({
      surface: suppressedBreakdown(surfaceValues),
      world: suppressedBreakdown(worldValues),
      content: suppressedBreakdown(contentValues),
    }),
    checkedAt: source.checkedAt,
    dataThroughAt: source.dataThroughAt,
    source: source.source,
    reason: source.reason,
  });
}

function heartbeatIdentity(heartbeat) {
  if (heartbeat.eventId) return `event:${heartbeat.eventId}`;
  return [
    heartbeat.sessionKey,
    heartbeat.acceptedAt,
    heartbeat.tabKey || '',
    heartbeat.tieKey,
  ].join('\u001f');
}

export function aggregateListeningTime(heartbeats) {
  const seen = new Set();
  const buckets = new Map();

  for (const raw of Array.isArray(heartbeats) ? heartbeats : []) {
    const heartbeat = normalizeHeartbeat(raw);
    if (!heartbeat || heartbeat.playedMsSincePreviousHeartbeat <= 0) continue;
    const identity = heartbeatIdentity(heartbeat);
    if (seen.has(identity)) continue;
    seen.add(identity);

    const minuteBucket = Math.floor(heartbeat.acceptedAt / LISTENING_BUCKET_MS);
    const bucketKey = `${heartbeat.sessionKey}:${minuteBucket}`;
    const current = buckets.get(bucketKey) || 0;
    buckets.set(
      bucketKey,
      Math.min(MAX_HEARTBEAT_PLAYED_MS, current + heartbeat.playedMsSincePreviousHeartbeat),
    );
  }

  const bySession = new Map();
  let totalMs = 0;
  for (const [bucketKey, milliseconds] of buckets) {
    const split = bucketKey.lastIndexOf(':');
    const sessionKey = bucketKey.slice(0, split);
    bySession.set(sessionKey, (bySession.get(sessionKey) || 0) + milliseconds);
    totalMs += milliseconds;
  }

  return Object.freeze({
    totalMs,
    bySession: Object.freeze(
      [...bySession.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([sessionKey, milliseconds]) => Object.freeze({ sessionKey, milliseconds })),
    ),
    bucketCount: buckets.size,
  });
}

export function buildPresenceTrend(heartbeats, {
  startMs,
  endMs,
  stepMs = LISTENING_BUCKET_MS,
} = {}) {
  const start = finiteNumber(startMs);
  const end = finiteNumber(endMs);
  const step = finiteNumber(stepMs);
  if (start === null || end === null || step === null || step <= 0 || end < start) {
    throw new TypeError('Presence trend requires finite startMs/endMs and positive stepMs');
  }

  const points = [];
  for (let at = start; at <= end; at += step) {
    const state = aggregatePresence(heartbeats, { nowMs: at });
    points.push(Object.freeze({
      at,
      liveNow: state.liveNow,
      listeningNow: state.listeningNow,
      browsingNow: state.browsingNow,
    }));
  }
  return Object.freeze(points);
}
