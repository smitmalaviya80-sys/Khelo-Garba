/**
 * PlayGarba Live Radio sync
 * Tunes 24/7 Live Radio into the shared broadcast moment once per join.
 *
 * The broadcast position is a pure function of time (`live-station.js`), so devices agree as long
 * as they agree on the time. Phone clocks do not, so this uses the same server-aligned clock as
 * Garba Circle (the HTTP `Date` header of the site itself), then opens one song at the broadcast
 * position. Once playback starts, the listener's player runs locally without repeated correction.
 */

import { createLiveTimeline } from './live-station.js';
import { measureClockOffset, createDateHeaderProbe } from './garba-circle.js';
import { createSyncCorrector } from './sync-correction.js';

const DRIFT_READS = 10;
const DRIFT_READ_GAP_MS = 50;
const BOUNDARY_WINDOW_SECONDS = 1.5;
// A measured clock is reused for this long before Live Radio measures it again on tune-in.
const CLOCK_TTL_MS = 10 * 60 * 1000;

export const LIVE_SYNC_COPY = Object.freeze({
  together: 'Live Radio plays the same moment for everyone. Turn off Live to choose another song.',
});

const defaultNow = typeof performance !== 'undefined' && Number.isFinite(performance.timeOrigin)
  ? () => performance.timeOrigin + performance.now()
  : () => Date.now();

const defaultSleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Decide what the player should do to match the broadcast, from one snapshot. Pure, for tests.
 * @returns {{ action: 'none' | 'open' | 'wait' | 'hold', waitSeconds?: number }}
 */
export function planLiveStep({ broadcast, activeSongId, ended = false, inSchedule = () => true }) {
  if (!broadcast?.song) return { action: 'none' };
  if (broadcast.song.id !== activeSongId) {
    // Something outside the broadcast owns the player (Nonstop, a circle): leave it alone.
    if (activeSongId && !inSchedule(activeSongId)) return { action: 'none' };
    return { action: 'open' };
  }
  const remaining = broadcast.remainingExactSeconds ?? broadcast.remainingSeconds;
  // At the slot's end, or the recording finished before its broadcast slot: wait for the slot to
  // end, like a radio would, then everyone moves on together.
  if (ended || remaining < BOUNDARY_WINDOW_SECONDS) return { action: 'wait', waitSeconds: remaining };
  return { action: 'hold' };
}

/**
 * @param {{
 *   songs: () => Array,
 *   isLive: () => boolean,
 *   playLiveSong: (song: object, offsetSeconds: number) => Promise<void> | void,
 *   showToast: (message: string) => void,
 *   player?: () => object | null,
 *   now?: () => number,
 *   sleep?: (ms: number) => Promise<void>,
 *   probe?: () => Promise<number>,
 * }} app
 */
export function createLiveSync(app) {
  const player = app.player || (() => window.GARBA_YOUTUBE_PLAYER || null);
  const localNow = app.now || defaultNow;
  const sleep = app.sleep || defaultSleep;
  const probe = app.probe || createDateHeaderProbe({ url: './robots.txt' });
  const corrector = createSyncCorrector({
    player,
    now: localNow,
    setTimer: app.setTimer || ((fn, ms) => setTimeout(fn, ms)),
    clearTimer: app.clearTimer || ((id) => clearTimeout(id)),
  });

  const sync = {
    active: false,
    clock: null,
    clockAt: 0,
    clockPromise: null,
    timeline: null,
    timelineSongs: null,
    boundaryTimer: null,
    measuring: false,
    wasPlaying: false,
    lastDriftSeconds: null,
    generation: 0,
  };

  const syncedNow = () => localNow() + (sync.clock?.offsetMs || 0);

  function timeline() {
    const songs = app.songs();
    if (songs !== sync.timelineSongs) {
      sync.timelineSongs = songs;
      sync.timeline = createLiveTimeline(songs);
    }
    return sync.timeline;
  }

  const broadcastAt = (at = syncedNow()) => timeline()?.at(at) || null;
  const inSchedule = (songId) => Boolean(timeline()?.segments.some((segment) => segment.songId === songId));

  function syncClock() {
    if (sync.clockPromise) return sync.clockPromise;
    sync.clockPromise = measureClockOffset({ probe, now: localNow, sleep })
      .then((clock) => {
        // Keep an earlier reliable clock over an unreliable re-measurement.
        if (clock.reliable || !sync.clock?.reliable) {
          sync.clock = clock;
          sync.clockAt = localNow();
        }
        return sync.clock;
      })
      .catch(() => sync.clock)
      .finally(() => { sync.clockPromise = null; });
    return sync.clockPromise;
  }

  function clearTimers() {
    clearTimeout(sync.boundaryTimer);
    sync.boundaryTimer = null;
  }

  function stillLive() {
    if (sync.active && !app.isLive()) stop();
    return sync.active;
  }

  /** Open the broadcast song at the broadcast position. */
  function goLive() {
    if (!stillLive()) return null;
    clearTimeout(sync.boundaryTimer);
    sync.boundaryTimer = null;
    const now = broadcastAt();
    if (!now?.song) return null;
    const remaining = now.remainingExactSeconds ?? now.remainingSeconds;
    // Aim ahead by how late this phone usually lands after opening a recording.
    const offset = Math.min(now.offsetSeconds + corrector.loadLead, Math.max(0, now.offsetSeconds + remaining - 0.5));
    corrector.loaded();
    Promise.resolve(app.playLiveSong(now.song, offset)).catch(() => {});
    return now;
  }

  function waitForBoundary(seconds) {
    clearTimeout(sync.boundaryTimer);
    sync.boundaryTimer = setTimeout(() => {
      sync.boundaryTimer = null;
      goLive();
    }, Math.max(0, seconds * 1000) + 60);
  }

  async function measureDrift(songId) {
    // The IFrame API updates its time in steps, so a single read can be stale.
    // Over a ~450 ms window the largest reading is the freshest.
    let drift = -Infinity;
    let first = null;
    let last = null;
    for (let i = 0; i < DRIFT_READS; i += 1) {
      const actual = player()?.elapsedSeconds;
      const now = broadcastAt();
      if (!Number.isFinite(actual) || now?.song?.id !== songId || player()?.activeSongId !== songId) return null;
      drift = Math.max(drift, actual - now.offsetSeconds);
      last = { actual, expected: now.offsetSeconds };
      first ??= last;
      if (i < DRIFT_READS - 1) await sleep(DRIFT_READ_GAP_MS);
    }
    // Skip readings taken while the player is stalled: its clock is not advancing.
    const advanced = last.actual - first.actual;
    const elapsed = last.expected - first.expected;
    return elapsed > 0 && advanced >= elapsed * 0.5 ? drift : null;
  }


  async function alignOnce() {
    if (!stillLive() || sync.measuring) return;
    const yt = player();
    if (!yt?.playing) return;
    const now = broadcastAt();
    const step = planLiveStep({ broadcast: now, activeSongId: yt.activeSongId, ended: yt.ended, inSchedule });
    if (step.action === 'open') {
      if (!sync.boundaryTimer) goLive();
      return;
    }
    if (step.action !== 'hold' || corrector.busy()) return;

    sync.measuring = true;
    try {
      const drift = await measureDrift(now.song.id);
      if (drift == null || !stillLive()) return;
      sync.lastDriftSeconds = drift;
      const fresh = broadcastAt();
      if (fresh?.song?.id !== now.song.id) return;
      corrector.correct({
        drift,
        remainingSeconds: fresh.remainingExactSeconds ?? fresh.remainingSeconds,
        expectedSeconds: () => broadcastAt()?.offsetSeconds ?? fresh.offsetSeconds,
        seekTo: (seconds) => player()?.seekTo?.(seconds),
      });
    } finally {
      sync.measuring = false;
    }
  }

  /**
   * Join the broadcast once. When the clock is stale, measure it before opening the player so a
   * clock correction never causes a second load or seek over already-playing audio.
   */
  async function start() {
    if (sync.active) return null;
    sync.active = true;
    sync.wasPlaying = false;
    sync.lastDriftSeconds = null;
    const generation = ++sync.generation;
    const fresh = sync.clock?.reliable && localNow() - sync.clockAt < CLOCK_TTL_MS;
    if (!fresh) {
      await syncClock();
    }
    if (generation !== sync.generation || !stillLive()) return null;
    corrector.discardPending();
    corrector.resumed();
    return goLive();
  }

  function stop() {
    if (!sync.active) return;
    sync.active = false;
    sync.generation += 1;
    clearTimers();
    corrector.reset();
  }

  /**
   * Next/Previous and the YouTube auto-advance while live: follow the broadcast instead of
   * skipping, wait for the slot to end when a recording finishes early, or explain.
   */
  function handleChangeSong() {
    if (!stillLive()) return false;
    const yt = player();
    const step = planLiveStep({
      broadcast: broadcastAt(),
      activeSongId: yt?.activeSongId || null,
      ended: yt?.ended === true,
      inSchedule,
    });
    if (step.action === 'open' || (step.action === 'none' && yt?.activeSongId)) goLive();
    else if (step.action === 'wait') waitForBoundary(step.waitSeconds);
    else if (step.action === 'hold') app.showToast(LIVE_SYNC_COPY.together);
    return true;
  }

  return Object.freeze({
    get active() { return sync.active; },
    start,
    stop,
    handleChangeSong,
    alignOnce,
    broadcastAt,
    diagnostics: () => ({
      active: sync.active,
      clock: sync.clock,
      syncedNow: syncedNow(),
      broadcast: sync.active ? broadcastAt() : null,
      lastDriftSeconds: sync.lastDriftSeconds,
      loadLeadSeconds: corrector.loadLead,
      seekLeadSeconds: corrector.seekLead,
      nudging: corrector.nudging,
      fineCorrections: corrector.fine,
    }),
  });
}
