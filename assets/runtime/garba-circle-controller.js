/**
 * PlayGarba Garba Circle controller
 * Connects the pure circle model to the app, the YouTube runtime and the Circle dialog.
 * The YouTube player stays the playback engine; this module only decides what should be
 * playing, where, and nudges the player back when it drifts.
 */

import {
  isCircleEligible,
  buildCircleSchedule,
  scheduleFingerprint,
  encodeCircleCode,
  decodeCircleCode,
  getCirclePosition,
  measureClockOffset,
  createDateHeaderProbe,
} from './garba-circle.js';
import { qrSvg } from './qr-code.js';
import { createSyncCorrector } from './sync-correction.js';

const DRIFT_INTERVAL_MS = 2000;
const DRIFT_READS = 10;
const SETTLE_AFTER_PLAY_MS = 700;
const BOUNDARY_WINDOW_SECONDS = 1.5;
// YouTube errors that mean the video cannot play here at all (removed, embedding disabled).
const UNPLAYABLE_ERRORS = new Set([100, 101, 150]);

const COPY = {
  lede: 'Everyone who opens this link hears the same song at the same moment. Use earbuds for a silent garba.',
  joinLede: 'You have been invited to a Garba Circle. Everyone in it hears the same song at the same moment. Use earbuds for a silent garba.',
  syncing: 'Matching this phone’s clock…',
  ineligible: 'Garba Circle needs a YouTube recording with a known length. Choose another song to start one.',
  moveTogether: 'Everyone in the circle hears the same song. Leave the circle to choose another.',
  unplayable: 'This recording can’t play here, so the circle continues with the next song.',
  left: 'Left the circle.',
  invalid: 'This circle link is incomplete. Ask for the link again.',
  mismatch: 'This circle was started on a different version of PlayGarba. Reload to update, then open the link again.',
  empty: 'The circle has no songs it can play on this version of PlayGarba.',
  copied: 'Link copied.',
  copyFailed: 'Could not copy the link. Select it and copy it instead.',
  shareText: 'Join my Garba Circle on PlayGarba',
};

const localNow = typeof performance !== 'undefined' && Number.isFinite(performance.timeOrigin)
  ? () => performance.timeOrigin + performance.now()
  : () => Date.now();

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function randomSeed() {
  const values = new Uint32Array(1);
  globalThis.crypto.getRandomValues(values);
  return values[0];
}

function formatClock(clock) {
  if (!clock?.reliable) return 'Could not check the clock. Sync depends on this phone’s time setting.';
  return `Clock matched to ±${Math.max(1, Math.round(clock.uncertaintyMs))} ms.`;
}

/**
 * @param {{
 *   songs: () => Array,
 *   currentSong: () => object | null,
 *   hostElapsedSeconds: () => number,
 *   playCircleSong: (song: object, offsetSeconds: number) => Promise<void> | void,
 *   showToast: (message: string) => void,
 *   onChange: () => void,
 *   trigger: () => HTMLElement | null,
 * }} app
 */
export function createCircleController(app) {
  const player = () => window.GARBA_YOUTUBE_PLAYER || null;
  const probe = createDateHeaderProbe({ url: './robots.txt' });
  const corrector = createSyncCorrector({ player, now: localNow });

  const circle = {
    status: 'idle', // idle | starting | ready | active | invalid | mismatch
    role: null,
    message: '',
    code: null,
    startMs: 0,
    schedule: [],
    unplayable: new Set(),
    clock: null,
    clockPromise: null,
    wasPlaying: false,
    pendingLoadSongId: null,
    boundaryTimer: null,
    settleTimer: null,
    driftTimer: null,
    measuring: false,
    lastDriftSeconds: null,
  };

  let dialog = null;
  let lastEyebrow = '';
  const parts = {};

  const syncedNow = () => localNow() + (circle.clock?.offsetMs || 0);
  const position = (at = syncedNow()) => getCirclePosition(circle.schedule, circle.startMs, at, { unplayable: circle.unplayable });
  const linkUrl = () => {
    const url = new URL(location.pathname || '/', location.origin);
    url.searchParams.set('circle', circle.code);
    return url.toString();
  };

  function eyebrow() {
    if (circle.status !== 'active') return '';
    if (circle.pendingLoadSongId || circle.lastDriftSeconds == null) return 'Garba Circle · syncing';
    return player()?.playing ? 'Garba Circle · in sync' : 'Garba Circle · paused';
  }

  // Tell the app to re-render (eyebrow, button state, URL) only when something it shows changed.
  function notify() {
    const next = `${circle.status}|${circle.code}|${eyebrow()}`;
    if (next === lastEyebrow) return;
    lastEyebrow = next;
    app.onChange();
  }

  function syncClock() {
    circle.clockPromise = measureClockOffset({ probe, now: localNow, sleep })
      .then((clock) => {
        circle.clock = clock;
        return clock;
      })
      .finally(() => { circle.clockPromise = null; });
    return circle.clockPromise;
  }

  async function clockReady() {
    if (circle.clockPromise) return circle.clockPromise;
    if (circle.clock) return circle.clock;
    return syncClock();
  }

  /* ----------------------------- playback alignment ----------------------------- */

  function clearTimers() {
    clearTimeout(circle.boundaryTimer);
    clearTimeout(circle.settleTimer);
    clearInterval(circle.driftTimer);
    circle.boundaryTimer = null;
    circle.settleTimer = null;
    circle.driftTimer = null;
  }

  const inSchedule = (songId) => circle.schedule.some((song) => song.id === songId);

  function goToCircle() {
    const now = position();
    if (!now || circle.status !== 'active') return;
    clearTimeout(circle.boundaryTimer);
    circle.boundaryTimer = null;
    if (!now.song) {
      // Nothing in the circle can play right now: wait for the next slot.
      waitForBoundary(now.remainingSeconds);
      return;
    }
    // Aim ahead by how late this phone usually lands after opening a recording.
    const offset = Math.min(now.offsetSeconds + corrector.loadLead, Math.max(0, now.remainingSeconds + now.offsetSeconds - 0.5));
    circle.pendingLoadSongId = now.song.id;
    corrector.loaded();
    Promise.resolve(app.playCircleSong(now.song, offset)).catch(() => {});
    renderDialog();
  }

  function waitForBoundary(remainingSeconds) {
    clearTimeout(circle.boundaryTimer);
    circle.boundaryTimer = setTimeout(() => {
      circle.boundaryTimer = null;
      goToCircle();
    }, Math.max(0, remainingSeconds * 1000) + 60);
  }

  async function measureDrift(songId) {
    // The IFrame API reports time through postMessage and may update it in steps of a few hundred
    // ms, so a single read can be stale. Over a ~450 ms window the largest reading is the freshest.
    let drift = -Infinity;
    let first = null;
    let last = null;
    for (let i = 0; i < DRIFT_READS; i += 1) {
      const actual = player()?.elapsedSeconds;
      const now = position();
      if (!Number.isFinite(actual) || now?.song?.id !== songId || player()?.activeSongId !== songId) return null;
      drift = Math.max(drift, actual - now.offsetSeconds);
      last = { actual, expected: now.offsetSeconds };
      first ??= last;
      if (i < DRIFT_READS - 1) await sleep(50);
    }
    // Skip readings taken while the player is stalled (buffering): its clock is not advancing.
    const advanced = last.actual - first.actual;
    const elapsed = last.expected - first.expected;
    return elapsed > 0 && advanced >= elapsed * 0.5 ? drift : null;
  }


  async function alignOnce() {
    if (circle.status !== 'active' || circle.measuring) return;
    const yt = player();
    if (!yt?.playing) return;
    const now = position();
    if (!now?.song) return;
    if (now.song.id !== yt.activeSongId) {
      // Another mode (for example Nonstop) took over the player: the listener left the circle.
      if (!inSchedule(yt.activeSongId)) leave();
      else if (!circle.boundaryTimer) goToCircle();
      return;
    }
    if (corrector.busy()) return;

    circle.measuring = true;
    try {
      const drift = await measureDrift(now.song.id);
      if (drift == null || circle.status !== 'active') return;
      circle.lastDriftSeconds = drift;
      circle.pendingLoadSongId = null;
      const fresh = position();
      if (fresh?.song?.id !== now.song.id) return;
      // Learns this phone's load and seek delays, then seeks (aiming ahead) or briefly changes
      // the playback rate to close small gaps without an audible skip.
      corrector.correct({
        drift,
        remainingSeconds: fresh.remainingSeconds,
        expectedSeconds: () => position()?.offsetSeconds ?? fresh.offsetSeconds,
        seekTo: (seconds) => player()?.seekTo?.(seconds),
      });
    } finally {
      circle.measuring = false;
      renderStatus();
      notify();
    }
  }

  function startDriftLoop() {
    clearInterval(circle.driftTimer);
    circle.driftTimer = setInterval(alignOnce, DRIFT_INTERVAL_MS);
  }

  function onPlaybackStateChange(event) {
    if (circle.status !== 'active' || event.detail?.loading) return;
    const playing = Boolean(event.detail?.playing) && player()?.playing === true;
    if (playing && !circle.wasPlaying) {
      // First frames after a load, seek or resume: measure soon, then keep the regular loop.
      clearTimeout(circle.settleTimer);
      corrector.resumed();
      circle.settleTimer = setTimeout(alignOnce, SETTLE_AFTER_PLAY_MS);
    }
    circle.wasPlaying = playing;
    notify();
    renderStatus();
  }

  function onPlayerError(event) {
    const { code, songId } = event.detail || {};
    if (circle.status !== 'active' || !UNPLAYABLE_ERRORS.has(code) || !inSchedule(songId)) return;
    circle.unplayable.add(songId);
    app.showToast(COPY.unplayable);
    goToCircle();
  }

  async function resync() {
    if (circle.status !== 'active') return;
    await syncClock().catch(() => null);
    if (circle.status !== 'active') return;
    corrector.resumed();
    alignOnce();
    renderStatus();
  }

  /* ----------------------------- lifecycle ----------------------------- */

  function activate(role) {
    circle.status = 'active';
    circle.role = role;
    circle.wasPlaying = false;
    startDriftLoop();
    notify();
  }

  async function start() {
    const song = app.currentSong();
    if (!isCircleEligible(song)) {
      app.showToast(COPY.ineligible);
      return false;
    }
    circle.status = 'starting';
    circle.role = 'host';
    openDialog();

    const clock = await clockReady().catch(() => null);
    if (circle.status !== 'starting') return false;
    circle.clock = clock || { offsetMs: 0, uncertaintyMs: Infinity, reliable: false };

    const seed = randomSeed();
    const schedule = buildCircleSchedule(app.songs(), { seed, firstSongId: song.id });
    const yt = player();
    const alreadyPlaying = yt?.playing && yt.activeSongId === song.id;
    const elapsed = Math.max(0, Number(app.hostElapsedSeconds()) || 0);
    circle.schedule = schedule;
    circle.startMs = Math.round(syncedNow() - elapsed * 1000);
    circle.code = encodeCircleCode({ seed, startMs: circle.startMs, firstSongId: song.id, fingerprint: scheduleFingerprint(schedule) });
    activate('host');
    if (alreadyPlaying) circle.wasPlaying = true;
    else goToCircle();
    renderDialog({ focus: true });
    return true;
  }

  /**
   * Read a `?circle=` code on load. Returns the circle's current song so the player can show it
   * before the listener taps Join, or null when the link cannot be joined.
   */
  function prepareJoin(code) {
    const decoded = decodeCircleCode(code);
    const schedule = decoded
      ? buildCircleSchedule(app.songs(), { seed: decoded.seed, firstSongId: decoded.firstSongId })
      : [];
    circle.role = 'guest';
    circle.code = code;
    if (!decoded) {
      circle.status = 'invalid';
      circle.message = COPY.invalid;
    } else if (!schedule.length) {
      circle.status = 'invalid';
      circle.message = COPY.empty;
    } else if (scheduleFingerprint(schedule) !== decoded.fingerprint || schedule[0].id !== decoded.firstSongId) {
      circle.status = 'mismatch';
      circle.message = COPY.mismatch;
    } else {
      circle.status = 'ready';
      circle.schedule = schedule;
      circle.startMs = decoded.startMs;
      syncClock().catch(() => null).finally(renderDialog);
    }
    openDialog();
    if (circle.status !== 'ready') return null;
    const now = getCirclePosition(schedule, decoded.startMs, Date.now());
    return now ? { song: now.song, offsetSeconds: now.offsetSeconds } : null;
  }

  async function join() {
    if (circle.status !== 'ready') return;
    parts.join.disabled = true;
    parts.join.textContent = 'Joining…';
    const clock = await clockReady().catch(() => null);
    if (circle.status !== 'ready') return;
    circle.clock = clock || { offsetMs: 0, uncertaintyMs: Infinity, reliable: false };
    activate('guest');
    goToCircle();
    renderDialog();
  }

  function leave({ quiet = false } = {}) {
    if (circle.status === 'idle') return;
    const wasActive = circle.status === 'active';
    clearTimers();
    corrector.reset();
    Object.assign(circle, {
      status: 'idle', role: null, message: '', code: null, startMs: 0, schedule: [], unplayable: new Set(), pendingLoadSongId: null, lastDriftSeconds: null,
    });
    closeDialog();
    notify();
    if (wasActive && !quiet) app.showToast(COPY.left);
  }

  /**
   * Next/Previous and the YouTube auto-advance while in a circle: go where the circle is,
   * wait for its boundary at the end of a song, or explain why the song cannot change.
   */
  function handleChangeSong() {
    const now = position();
    const yt = player();
    if (!now?.song) return;
    if (now.song.id !== yt?.activeSongId) goToCircle();
    else if (now.remainingSeconds < BOUNDARY_WINDOW_SECONDS || yt?.ended) waitForBoundary(now.remainingSeconds);
    else app.showToast(COPY.moveTogether);
  }

  /* ----------------------------- dialog ----------------------------- */

  function buildDialog() {
    dialog = document.createElement('dialog');
    dialog.className = 'circle-dialog';
    dialog.id = 'circleDialog';
    dialog.setAttribute('aria-labelledby', 'circleTitle');
    dialog.setAttribute('aria-describedby', 'circleLede');
    dialog.innerHTML = `
      <div class="circle-sheet">
        <header class="circle-header">
          <h2 id="circleTitle">Garba Circle</h2>
          <button class="icon-button circle-close" type="button" data-circle="close" aria-label="Close Garba Circle"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"></path></svg></button>
        </header>
        <p class="circle-lede" id="circleLede"></p>
        <p class="circle-message" data-circle="message" role="alert" hidden></p>
        <button class="circle-primary" type="button" data-circle="join" hidden>Join circle</button>
        <div class="circle-invite" data-circle="invite" hidden>
          <div class="circle-qr" data-circle="qr"></div>
          <p class="circle-link"><span class="visually-hidden">Circle link: </span><span data-circle="link"></span></p>
          <div class="circle-actions">
            <button class="circle-primary" type="button" data-circle="copy">Copy link</button>
            <button class="circle-secondary" type="button" data-circle="share" hidden>Share</button>
          </div>
        </div>
        <p class="circle-status" data-circle="status" role="status" aria-live="polite"></p>
        <p class="visually-hidden" data-circle="announce" aria-live="polite"></p>
        <p class="circle-next" data-circle="next" hidden></p>
        <button class="circle-leave" type="button" data-circle="leave" hidden>Leave circle</button>
      </div>`;
    document.body.append(dialog);
    for (const node of dialog.querySelectorAll('[data-circle]')) parts[node.dataset.circle] = node;
    parts.lede = dialog.querySelector('#circleLede');

    parts.close.addEventListener('click', closeDialog);
    parts.join.addEventListener('click', join);
    parts.copy.addEventListener('click', copyLink);
    parts.share.addEventListener('click', shareLink);
    parts.leave.addEventListener('click', () => leave());
    dialog.addEventListener('click', (event) => { if (event.target === dialog) closeDialog(); });
    dialog.addEventListener('cancel', (event) => { event.preventDefault(); closeDialog(); });
    dialog.addEventListener('close', () => {
      if (circle.status === 'invalid' || circle.status === 'mismatch') leaveUnjoined();
      const trigger = app.trigger();
      if (trigger?.isConnected) trigger.focus({ preventScroll: true });
    });
    // Keys inside the dialog belong to the dialog, not to the player's global shortcuts
    // (the YouTube runtime closes playback on Escape).
    window.addEventListener('keydown', (event) => {
      if (!dialog?.open) return;
      event.stopPropagation();
      if (event.key === 'Escape') {
        event.preventDefault();
        closeDialog();
      }
    }, { capture: true });
  }

  function leaveUnjoined() {
    Object.assign(circle, { status: 'idle', role: null, message: '', code: null, schedule: [] });
    notify();
  }

  function openDialog() {
    if (!dialog) buildDialog();
    const opening = !dialog.open;
    if (opening) dialog.showModal();
    renderDialog({ focus: opening });
  }

  function closeDialog() {
    if (dialog?.open) dialog.close();
  }

  function toggle() {
    if (circle.status === 'idle') return start();
    if (dialog?.open) closeDialog();
    else openDialog();
    return true;
  }

  function renderStatus() {
    if (!dialog) return;
    const yt = player();
    const now = circle.status === 'active' ? position() : null;
    let text = '';
    if (circle.status === 'starting' || (circle.status === 'ready' && !circle.clock)) text = COPY.syncing;
    else if (circle.status === 'ready') text = formatClock(circle.clock);
    else if (circle.status === 'active') {
      if (!yt?.playing) text = `Paused. Press Play to rejoin the circle where it is now. ${formatClock(circle.clock)}`;
      else if (circle.lastDriftSeconds == null) text = `${circle.role === 'host' ? 'Starting the circle…' : 'Joining the circle…'} ${formatClock(circle.clock)}`;
      else text = `In sync. ${formatClock(circle.clock)}`;
    }
    if (parts.status.textContent !== text) parts.status.textContent = text;
    const nextTitle = now && !now.substituteFor ? now.nextSong?.title || '' : '';
    parts.next.hidden = !nextTitle;
    const nextText = nextTitle ? `Up next in the circle: ${nextTitle}` : '';
    if (parts.next.textContent !== nextText) parts.next.textContent = nextText;
  }

  function renderDialog({ focus = false } = {}) {
    if (!dialog) return;
    const { status } = circle;
    const active = status === 'active';
    dialog.dataset.state = status;
    parts.lede.textContent = circle.role === 'guest' && !active ? COPY.joinLede : COPY.lede;
    parts.message.hidden = !circle.message;
    parts.message.textContent = circle.message;
    parts.join.hidden = status !== 'ready';
    if (status === 'ready') {
      parts.join.disabled = false;
      parts.join.textContent = 'Join circle';
    }
    parts.invite.hidden = !active;
    parts.leave.hidden = !active;
    parts.share.hidden = !(active && typeof navigator.share === 'function');
    if (active && parts.link.textContent !== linkUrl()) {
      const url = linkUrl();
      parts.link.textContent = url;
      parts.qr.innerHTML = qrSvg(url, { title: 'QR code for the Garba Circle link' });
    }
    renderStatus();
    // Focus the action that matters in this state; also rescue focus from a control that was hidden.
    const focusTarget = status === 'ready' ? parts.join : active ? parts.copy : parts.close;
    const lost = !dialog.contains(document.activeElement) || document.activeElement?.hidden;
    if (dialog.open && (focus || lost)) focusTarget.focus({ preventScroll: true });
  }

  // Toasts sit below a modal dialog, so feedback is given inside it.
  let feedbackTimer = null;
  function feedback(message) {
    parts.announce.textContent = message;
    parts.copy.textContent = message === COPY.copied ? 'Link copied' : 'Copy link';
    clearTimeout(feedbackTimer);
    feedbackTimer = setTimeout(() => {
      parts.copy.textContent = 'Copy link';
      parts.announce.textContent = '';
    }, 2200);
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(linkUrl());
      feedback(COPY.copied);
    } catch {
      const range = document.createRange();
      range.selectNodeContents(parts.link);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
      feedback(COPY.copyFailed);
    }
  }

  async function shareLink() {
    const result = await window.GARBA_SHARE_INTENT?.executeShare?.({ title: 'Garba Circle', text: COPY.shareText, url: linkUrl() });
    if (result?.status === 'copied') feedback(COPY.copied);
    else if (result?.status === 'failed') feedback(COPY.copyFailed);
  }

  /* ----------------------------- wiring ----------------------------- */

  window.addEventListener('garba:playback-state-change', onPlaybackStateChange);
  window.addEventListener('garba:youtube-error', onPlayerError);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') resync(); });
  window.addEventListener('online', resync);

  return Object.freeze({
    get active() { return circle.status === 'active'; },
    // The link code stays in the address bar while the circle is joinable or active.
    get code() { return circle.status === 'idle' ? null : circle.code; },
    eyebrow,
    start,
    prepareJoin,
    join,
    leave,
    toggle,
    handleChangeSong,
    // Read-only diagnostics for tests and support.
    diagnostics: () => ({
      status: circle.status,
      role: circle.role,
      code: circle.code,
      clock: circle.clock,
      startMs: circle.startMs,
      syncedNow: syncedNow(),
      position: circle.status === 'active' ? position() : null,
      lastDriftSeconds: circle.lastDriftSeconds,
      seekLeadSeconds: corrector.seekLead,
      loadLeadSeconds: corrector.loadLead,
      nudging: corrector.nudging,
      fineCorrections: corrector.fine,
    }),
  });
}
