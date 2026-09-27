/**
 * PlayGarba sync correction
 * Shared by 24/7 Live Radio and Garba Circle: given how far this phone's player is from where
 * everyone should be, decide how to get back and learn how this phone behaves.
 *
 * Two things make naive seeking miss:
 * - a seek or a load takes time to land (buffering, decoding, the IFrame message round trip),
 *   so the player resumes behind the target by that delay; and
 * - that delay differs per phone and per network, and jitters from seek to seek.
 *
 * So each phone learns its own load and seek delays from the first clean reading after each one
 * and aims ahead by that much. Large gaps are closed with a seek. Small gaps are closed without
 * a skip, by briefly playing slightly fast or slow, when the player supports playback rates.
 */

export const SYNC_TOLERANCE_SECONDS = 0.03;
const MAX_NUDGE_SECONDS = 0.6;
const NUDGE_MAX_DURATION_SECONDS = 3;
const MAX_LOAD_LEAD_SECONDS = 4;
const MAX_SEEK_LEAD_SECONDS = 2;
// A reading this far off right after a seek means the player stalled, not that seeks are slow.
const MAX_LEARNABLE_SECONDS = 1.5;
const LEAD_GAIN = 0.8;
const SEEK_SETTLE_MS = 2500;
const NUDGE_SETTLE_MS = 900;
const FINE_BUDGET = 5;
const BASE_THRESHOLD_SECONDS = 0.35;
const RATE_THRESHOLD_SECONDS = 0.06;
const BOUNDARY_WINDOW_SECONDS = 1.5;
const WIDEN_WINDOW_MS = 30000;
const MAX_THRESHOLD_SECONDS = 1;

/** Pick the gentlest usable faster and slower rates, if the player offers any. */
export function nudgeRates(available = []) {
  const rates = (available || []).map(Number).filter((rate) => Number.isFinite(rate) && rate > 0);
  const faster = rates.filter((rate) => rate > 1 && rate <= 1.5).sort((a, b) => a - b)[0];
  const slower = rates.filter((rate) => rate < 1 && rate >= 0.5).sort((a, b) => b - a)[0];
  return faster && slower ? { faster, slower } : null;
}

/**
 * Plan one correction. Pure, for tests.
 * @param {{ drift: number, remainingSeconds: number, rates: null | { faster: number, slower: number },
 *   fine: boolean, threshold: number, seekLead: number }} input
 *   `drift` is actual − expected in seconds (negative means this phone is behind).
 */
export function planCorrection({ drift, remainingSeconds, rates = null, fine = false, threshold = BASE_THRESHOLD_SECONDS, seekLead = 0 }) {
  if (!Number.isFinite(drift)) return { action: 'none' };
  const size = Math.abs(drift);
  const limit = fine ? SYNC_TOLERANCE_SECONDS : rates ? Math.min(threshold, RATE_THRESHOLD_SECONDS) : threshold;
  if (size < limit) return { action: 'none', converged: size < SYNC_TOLERANCE_SECONDS || !fine };
  if (rates && size <= MAX_NUDGE_SECONDS) {
    const rate = drift < 0 ? rates.faster : rates.slower;
    const durationSeconds = size / Math.abs(rate - 1);
    if (durationSeconds <= NUDGE_MAX_DURATION_SECONDS && remainingSeconds > durationSeconds + BOUNDARY_WINDOW_SECONDS) {
      return { action: 'nudge', rate, durationSeconds };
    }
  }
  if (remainingSeconds <= BOUNDARY_WINDOW_SECONDS + seekLead) return { action: 'none' };
  return { action: 'seek', lead: seekLead };
}

/**
 * @param {{ player: () => object | null, now: () => number,
 *   setTimer?: typeof setTimeout, clearTimer?: typeof clearTimeout }} options
 */
export function createSyncCorrector({ player, now, setTimer = setTimeout, clearTimer = clearTimeout }) {
  const state = {
    loadLead: 0,
    seekLead: 0,
    pending: null, // 'load' | 'seek' | null: the next clean reading measures that action
    settleUntil: 0,
    nudgeTimer: null,
    nudging: false,
    fine: 0,
    seekTimes: [],
    lastDrift: null,
  };

  function stopNudge({ restore = true } = {}) {
    clearTimer(state.nudgeTimer);
    state.nudgeTimer = null;
    if (state.nudging && restore) player()?.setPlaybackRate?.(1);
    state.nudging = false;
  }

  function threshold() {
    const cutoff = now() - WIDEN_WINDOW_MS;
    state.seekTimes = state.seekTimes.filter((at) => at > cutoff);
    const repeats = Math.max(0, state.seekTimes.length - 2);
    return Math.min(MAX_THRESHOLD_SECONDS, BASE_THRESHOLD_SECONDS * 1.5 ** repeats);
  }

  return {
    /** Seconds to aim ahead when opening a recording at a position. */
    get loadLead() { return state.loadLead; },
    get seekLead() { return state.seekLead; },
    get lastDrift() { return state.lastDrift; },
    get fine() { return state.fine; },
    get nudging() { return state.nudging; },

    /** True while a correction is still landing; readings taken now would be misleading. */
    busy() {
      return state.nudging || now() < state.settleUntil;
    },

    /** A recording was just opened at (target + loadLead). */
    loaded() {
      stopNudge({ restore: false });
      state.pending = 'load';
      state.fine = FINE_BUDGET;
      state.settleUntil = now() + SEEK_SETTLE_MS;
    },

    /** Playback just (re)started after a pause or stall: refine soon. */
    resumed() {
      state.fine = FINE_BUDGET;
      state.settleUntil = 0;
    },

    /** Forget any in-flight correction (song change, leaving, measured clock changed). */
    reset({ keepLearning = true } = {}) {
      stopNudge();
      state.pending = null;
      state.settleUntil = 0;
      state.fine = 0;
      if (!keepLearning) {
        state.loadLead = 0;
        state.seekLead = 0;
      }
    },

    /** Forget the pending load measurement (for example, the clock it used was wrong). */
    discardPending() {
      state.pending = null;
    },

    /**
     * Feed one clean drift reading (actual − expected, seconds) and correct.
     * `seekTo(targetSeconds)` performs the seek; `expectedSeconds()` returns where everyone is now.
     * Returns the action taken.
     */
    correct({ drift, remainingSeconds, expectedSeconds, seekTo }) {
      if (!Number.isFinite(drift)) return { action: 'none' };
      state.lastDrift = drift;
      // Learn how far this phone lands behind after a load or a seek.
      if (state.pending === 'load') {
        state.loadLead = Math.min(MAX_LOAD_LEAD_SECONDS, Math.max(0, state.loadLead - drift * LEAD_GAIN));
      } else if (state.pending === 'seek' && Math.abs(drift) < MAX_LEARNABLE_SECONDS) {
        state.seekLead = Math.min(MAX_SEEK_LEAD_SECONDS, Math.max(0, state.seekLead - drift * LEAD_GAIN));
      }
      state.pending = null;

      const yt = player();
      const rates = typeof yt?.setPlaybackRate === 'function' ? nudgeRates(yt.getAvailablePlaybackRates?.()) : null;
      const plan = planCorrection({
        drift,
        remainingSeconds,
        rates,
        fine: state.fine > 0,
        threshold: threshold(),
        seekLead: state.seekLead,
      });

      if (plan.action === 'none') {
        if (plan.converged) state.fine = 0;
        return plan;
      }
      if (plan.action === 'nudge') {
        if (yt.setPlaybackRate(plan.rate) === false) return { action: 'none' };
        state.nudging = true;
        state.fine = Math.max(0, state.fine - 1);
        state.nudgeTimer = setTimer(() => {
          state.nudgeTimer = null;
          state.nudging = false;
          player()?.setPlaybackRate?.(1);
          state.settleUntil = now() + NUDGE_SETTLE_MS;
        }, plan.durationSeconds * 1000);
        return plan;
      }
      // Seek: aim ahead by the learned delay so the player resumes on target.
      const wasFine = state.fine > 0;
      seekTo(Math.max(0, expectedSeconds() + state.seekLead));
      state.pending = 'seek';
      state.settleUntil = now() + SEEK_SETTLE_MS;
      if (wasFine) state.fine -= 1;
      else {
        state.seekTimes.push(now());
        state.fine = 2;
      }
      return plan;
    },
  };
}
