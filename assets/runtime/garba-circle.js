/**
 * PlayGarba Garba Circle
 * Pure scheduling, link-code and clock-sync logic for listening together without a backend.
 *
 * A circle is fully described by its link code: a seed, a start instant on the server clock,
 * the song it started from and a fingerprint of the resulting schedule. Every phone rebuilds
 * the same schedule from its own catalogue and reads its position from a clock that has been
 * aligned to the HTTP `Date` header of the site it was served from.
 */

import { isLivePlayable } from './live-station.js';

export const CIRCLE_CODE_VERSION = '1';
export const DEFAULT_DRIFT_THRESHOLD_SECONDS = 0.35;

const MIN_SONG_SECONDS = 10;
const UINT32_MAX = 0xffffffff;
// Start instants outside this range are treated as corrupt links.
const MIN_START_MS = Date.UTC(2024, 0, 1);
const MAX_START_MS = Date.UTC(2100, 0, 1);
const SONG_ID_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const MAX_SONG_ID_LENGTH = 120;
const CHECK_SPACE = 36 ** 3;

/**
 * True when a song can be played in a circle: it has a playable YouTube route (same rule as
 * 24/7 Live Radio) and a real catalogue duration. Live Radio's 180s default is never used here,
 * because a guessed duration would move every later song boundary.
 */
export function isCircleEligible(song) {
  if (!isLivePlayable(song)) return false;
  if (song.presentationRole && song.presentationRole !== 'catalogue') return false;
  const duration = Number(song.durationSeconds);
  return Number.isFinite(duration) && duration > MIN_SONG_SECONDS;
}

/** 32-bit FNV-1a hash of a string. */
export function fnv1a(text) {
  let hash = 0x811c9dc5;
  const value = String(text);
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

/** Deterministic PRNG returning floats in [0, 1). */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Build the shared song order. Eligible songs are sorted by id (so catalogue load order does not
 * matter), shuffled with the circle seed, and the host's song is moved to the front.
 * @param {Array} songs Catalogue songs
 * @param {{ seed: number, firstSongId?: string }} options
 */
export function buildCircleSchedule(songs = [], { seed = 0, firstSongId = null } = {}) {
  const byId = new Map();
  for (const song of songs || []) {
    if (isCircleEligible(song) && !byId.has(song.id)) byId.set(song.id, song);
  }
  const ordered = [...byId.values()].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const random = mulberry32(seed);
  for (let i = ordered.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [ordered[i], ordered[j]] = [ordered[j], ordered[i]];
  }
  const firstIndex = firstSongId ? ordered.findIndex((song) => song.id === firstSongId) : -1;
  if (firstIndex > 0) ordered.unshift(...ordered.splice(firstIndex, 1));
  return ordered;
}

/**
 * Short stable hash of everything that decides what a listener hears and when: song order,
 * durations, video ids and chapter starts. Two phones with different catalogue versions
 * produce different fingerprints.
 */
export function scheduleFingerprint(schedule = []) {
  const lines = (schedule || []).map((song) => [
    song.id,
    Number(song.durationSeconds),
    String(song.youtubeId || song.playbackSourceUrl || ''),
    Number(song.youtubeStartSeconds || 0),
  ].join('|'));
  return fnv1a(lines.join('\n')).toString(36);
}

function codeCheck(body) {
  return (fnv1a(body) % CHECK_SPACE).toString(36).padStart(3, '0');
}

/**
 * Encode a circle into a compact, URL-safe code:
 * `1.<seed36>.<start36>.<fingerprint>.<check>.<firstSongId>`.
 * The check characters catch truncated or mistyped links before they are mistaken for a
 * catalogue mismatch.
 */
export function encodeCircleCode({ seed, startMs, firstSongId, fingerprint } = {}) {
  if (!Number.isInteger(seed) || seed < 0 || seed > UINT32_MAX) return null;
  if (!Number.isInteger(startMs) || startMs < MIN_START_MS || startMs > MAX_START_MS) return null;
  const id = String(firstSongId || '');
  if (!SONG_ID_RE.test(id) || id.length > MAX_SONG_ID_LENGTH) return null;
  const fp = String(fingerprint || '');
  if (!/^[0-9a-z]{1,7}$/.test(fp) || parseInt(fp, 36) > UINT32_MAX) return null;
  const body = [CIRCLE_CODE_VERSION, seed.toString(36), startMs.toString(36), fp].join('.');
  return `${body}.${codeCheck(`${body}.${id}`)}.${id}`;
}

/**
 * Decode a circle code. Returns null for anything that is not exactly what
 * `encodeCircleCode` would produce.
 */
export function decodeCircleCode(value) {
  if (typeof value !== 'string' || value.length > 220) return null;
  const parts = value.split('.');
  if (parts.length !== 6 || parts[0] !== CIRCLE_CODE_VERSION) return null;
  const [, seed36, start36, fingerprint, check, firstSongId] = parts;
  if (!/^[0-9a-z]{1,7}$/.test(seed36) || !/^[0-9a-z]{1,11}$/.test(start36) || !/^[0-9a-z]{3}$/.test(check)) return null;
  const decoded = {
    seed: parseInt(seed36, 36),
    startMs: parseInt(start36, 36),
    fingerprint,
    firstSongId,
  };
  return encodeCircleCode(decoded) === value ? decoded : null;
}

/**
 * Where the circle is at `nowMs` (server-aligned milliseconds). The schedule loops.
 * Before the start instant the circle waits at the top of its first song.
 *
 * `unplayable` holds song ids that YouTube refuses to play here (embedding disabled, removed).
 * Every phone hits the same refusal, so each fills that song's slot the same way: the following
 * playable songs, laid out from the slot's start. When the slot ends the schedule resumes as usual.
 */
export function getCirclePosition(schedule, startMs, nowMs, { unplayable = null } = {}) {
  if (!Array.isArray(schedule) || !schedule.length || !Number.isFinite(startMs) || !Number.isFinite(nowMs)) return null;
  const durations = schedule.map((song) => Number(song.durationSeconds));
  if (durations.some((duration) => !(duration > 0))) return null;
  const total = durations.reduce((sum, duration) => sum + duration, 0);
  const elapsedSeconds = (nowMs - startMs) / 1000;

  if (elapsedSeconds < 0) {
    return {
      song: schedule[0],
      index: 0,
      offsetSeconds: 0,
      remainingSeconds: durations[0],
      nextSong: schedule[1 % schedule.length],
      cycle: 0,
      started: false,
      startsInSeconds: -elapsedSeconds,
    };
  }

  const cycle = Math.floor(elapsedSeconds / total);
  let t = elapsedSeconds - cycle * total;
  let index = 0;
  while (index < durations.length - 1 && t >= durations[index]) {
    t -= durations[index];
    index += 1;
  }
  const offsetSeconds = Math.min(t, durations[index]);
  const position = {
    song: schedule[index],
    index,
    offsetSeconds,
    remainingSeconds: durations[index] - offsetSeconds,
    nextSong: schedule[(index + 1) % schedule.length],
    cycle,
    started: true,
    startsInSeconds: 0,
    substituteFor: null,
  };
  return unplayable?.has(position.song.id) ? substitutePosition(schedule, durations, position, unplayable) : position;
}

function substitutePosition(schedule, durations, slot, unplayable) {
  const slotRemaining = slot.remainingSeconds;
  let t = slot.offsetSeconds;
  for (let step = 1; step < schedule.length; step += 1) {
    const index = (slot.index + step) % schedule.length;
    if (unplayable.has(schedule[index].id)) continue;
    if (t < durations[index]) {
      return {
        ...slot,
        song: schedule[index],
        index,
        offsetSeconds: t,
        remainingSeconds: Math.min(durations[index] - t, slotRemaining),
        substituteFor: slot.song.id,
      };
    }
    t -= durations[index];
  }
  return { ...slot, song: null, substituteFor: slot.song.id };
}

/**
 * Decide whether the local player should seek to rejoin the circle.
 * `leadSeconds` compensates for the time a seek itself takes to resume audio.
 */
export function planDriftCorrection({
  expectedSeconds,
  actualSeconds,
  thresholdSeconds = DEFAULT_DRIFT_THRESHOLD_SECONDS,
  leadSeconds = 0,
} = {}) {
  if (!Number.isFinite(expectedSeconds) || !Number.isFinite(actualSeconds)) {
    return { action: 'none', targetSeconds: null, driftSeconds: null };
  }
  const driftSeconds = actualSeconds - expectedSeconds;
  if (Math.abs(driftSeconds) < thresholdSeconds) return { action: 'none', targetSeconds: null, driftSeconds };
  return { action: 'seek', targetSeconds: Math.max(0, expectedSeconds + Math.max(0, leadSeconds)), driftSeconds };
}

/* ---------------------------------------------------------------------------------------------
 * Clock sync from the HTTP Date header.
 *
 * The header only has one-second resolution, but it is still exact: the server stamped a time
 * T with floor(T / 1000) * 1000 = S, somewhere between the local send and receive instants.
 * So the true offset (server − local) lies in (S − receivedAt, S + 1000 − sentAt). Intersecting
 * those intervals across probes, and timing probes so a server second boundary is predicted to
 * land inside the current window, narrows the window to roughly one round trip.
 * ------------------------------------------------------------------------------------------- */

/**
 * Intersect the offset intervals implied by probe samples.
 * @param {Array<{ sentAt: number, receivedAt: number, serverMs: number }>} samples
 * @returns {null | { lo: number, hi: number, offsetMs: number, uncertaintyMs: number, consistent: boolean, count: number, minRttMs: number }}
 */
export function intersectOffsetWindow(samples = []) {
  let lo = -Infinity;
  let hi = Infinity;
  let count = 0;
  let minRttMs = Infinity;
  for (const sample of samples || []) {
    const { sentAt, receivedAt, serverMs } = sample || {};
    if (![sentAt, receivedAt, serverMs].every(Number.isFinite) || receivedAt < sentAt) continue;
    const second = Math.floor(serverMs / 1000) * 1000;
    lo = Math.max(lo, second - receivedAt);
    hi = Math.min(hi, second + 1000 - sentAt);
    minRttMs = Math.min(minRttMs, receivedAt - sentAt);
    count += 1;
  }
  if (!count) return null;
  const consistent = lo < hi;
  return {
    lo,
    hi,
    offsetMs: (lo + hi) / 2,
    uncertaintyMs: consistent ? (hi - lo) / 2 : Infinity,
    consistent,
    count,
    minRttMs,
  };
}

/**
 * Local send times for the next probes. Each probe aims a server second boundary at one of
 * `count` evenly spaced offsets inside [lo, hi], so the replies split the window into
 * `count + 1` parts. All probes target the first boundary reachable after `afterMs`.
 */
export function planProbeTimes({ lo, hi, oneWayMs = 0, afterMs, count = 1 }) {
  if (![lo, hi, afterMs].every(Number.isFinite) || !(hi > lo) || count < 1) return [];
  const targets = Array.from({ length: count }, (_, j) => lo + ((j + 1) * (hi - lo)) / (count + 1));
  const latest = targets[targets.length - 1];
  const boundary = Math.ceil((afterMs + oneWayMs + latest) / 1000) * 1000;
  return targets.map((offset) => boundary - offset - oneWayMs).sort((a, b) => a - b);
}

/**
 * Measure the offset between the local clock and the server clock.
 * @param {{ probe: () => Promise<number>, now: () => number, sleep: (ms: number) => Promise<void>,
 *   maxProbes?: number, probesPerRound?: number, maxDurationMs?: number, targetUncertaintyMs?: number }} options
 *   `probe` resolves with the server time parsed from a Date header (ms).
 * @returns {Promise<{ offsetMs: number, uncertaintyMs: number, reliable: boolean, probes: number, reason?: string }>}
 */
export async function measureClockOffset({
  probe,
  now,
  sleep,
  maxProbes = 10,
  probesPerRound = 3,
  maxDurationMs = 4000,
  targetUncertaintyMs = 15,
} = {}) {
  let probes = 0;

  const attempt = async () => {
    const startedAt = now();
    const samples = [];
    const runProbe = async () => {
      probes += 1;
      const sentAt = now();
      try {
        const serverMs = await probe();
        const receivedAt = now();
        if (Number.isFinite(serverMs)) samples.push({ sentAt, receivedAt, serverMs });
      } catch {
        // A failed probe only costs one attempt.
      }
    };

    let used = 1;
    await runProbe();
    while (used < maxProbes && now() - startedAt < maxDurationMs) {
      const window = intersectOffsetWindow(samples);
      if (!window) {
        used += 1;
        await runProbe();
        continue;
      }
      if (!window.consistent || window.uncertaintyMs <= targetUncertaintyMs) break;
      const count = Math.min(probesPerRound, maxProbes - used);
      const times = planProbeTimes({ lo: window.lo, hi: window.hi, oneWayMs: window.minRttMs / 2, afterMs: now() + 5, count });
      // Stop when the round could not finish inside the time budget.
      if (times[times.length - 1] + 2 * window.minRttMs - startedAt > maxDurationMs) break;
      used += count;
      await Promise.all(times.map(async (at) => {
        const wait = at - now();
        if (wait > 0) await sleep(wait);
        await runProbe();
      }));
    }
    return intersectOffsetWindow(samples);
  };

  let window = await attempt();
  if (window && !window.consistent) window = await attempt();
  if (!window) return { offsetMs: 0, uncertaintyMs: Infinity, reliable: false, probes, reason: 'no-date-header' };
  if (!window.consistent) return { offsetMs: 0, uncertaintyMs: Infinity, reliable: false, probes, reason: 'inconsistent' };
  return { offsetMs: window.offsetMs, uncertaintyMs: window.uncertaintyMs, reliable: true, probes };
}

/**
 * Browser probe: a HEAD request that bypasses every cache and returns the server Date (ms).
 */
export function createDateHeaderProbe({ fetchImpl = globalThis.fetch?.bind(globalThis), url = './robots.txt' } = {}) {
  return async () => {
    const token = Math.random().toString(36).slice(2, 10);
    const response = await fetchImpl(`${url}?circle-clock=${token}`, { method: 'HEAD', cache: 'no-store' });
    const serverMs = Date.parse(response.headers.get('date') || '');
    if (!Number.isFinite(serverMs)) throw new Error('Response has no Date header');
    return serverMs;
  };
}

if (typeof window !== 'undefined') {
  window.GARBA_CIRCLE = Object.freeze({
    isCircleEligible,
    buildCircleSchedule,
    scheduleFingerprint,
    encodeCircleCode,
    decodeCircleCode,
    getCirclePosition,
    planDriftCorrection,
    intersectOffsetWindow,
    planProbeTimes,
    measureClockOffset,
    createDateHeaderProbe,
  });
}
