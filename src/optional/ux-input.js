const playButton = document.getElementById('playButton');
const prevButton = document.getElementById('prevButton');
const nextButton = document.getElementById('nextButton');
const progress = document.getElementById('progress');
const elapsedTime = document.getElementById('elapsedTime');
const durationTime = document.getElementById('durationTime');
const audio = document.getElementById('audio');
const songTitle = document.getElementById('songTitle');
const app = document.getElementById('app');

function isInteractiveTarget(target) {
  return target instanceof Element && Boolean(target.closest(
    'button, a[href], input, textarea, select, summary, iframe, [contenteditable="true"], [role="button"], [role="link"]'
  ));
}

function stopGlobalSpaceOnInteractive(container) {
  if (!container || container.dataset.spaceGuard === 'true') return;
  container.dataset.spaceGuard = 'true';
  container.addEventListener('keydown', (event) => {
    if (event.code === 'Space' && isInteractiveTarget(event.target)) {
      // Keep Space with the focused control. The event's default action remains
      // intact, but document-level playback shortcuts never see it.
      event.stopPropagation();
    }
  });
}

function setupProviderSpaceGuard() {
  const bind = () => {
    const overlay = document.getElementById('providerOverlay');
    if (!overlay || overlay.dataset.providerSpaceGuard === 'true') return;
    overlay.dataset.providerSpaceGuard = 'true';
    overlay.addEventListener('keydown', (event) => {
      if (event.code === 'Space') event.stopPropagation();
    });
  };
  bind();
  new MutationObserver(bind).observe(document.body, { childList: true });
}

function parseClock(value = '') {
  const parts = String(value).trim().split(':').map(Number);
  if (!parts.length || parts.some((part) => !Number.isFinite(part))) return 0;
  return parts.reduce((total, part) => total * 60 + part, 0);
}

function mediaDuration() {
  if (Number.isFinite(audio?.duration) && audio.duration > 0) return audio.duration;
  return parseClock(durationTime?.textContent || '');
}

function mediaElapsed() {
  if (Number.isFinite(audio?.currentTime) && audio.currentTime >= 0 && !audio.paused) return audio.currentTime;
  return parseClock(elapsedTime?.textContent || '');
}

function seekToSeconds(seconds) {
  const duration = mediaDuration();
  if (!progress || !Number.isFinite(duration) || duration <= 0 || !Number.isFinite(seconds)) return;
  const next = Math.max(0, Math.min(duration, seconds));
  progress.value = String(Math.round((next / duration) * 1000));
  progress.dispatchEvent(new Event('input', { bubbles: true }));
}

function setMediaAction(action, handler) {
  try {
    navigator.mediaSession.setActionHandler(action, handler);
  } catch {
    // Media Session support differs between Safari, Chromium and webviews.
  }
}

function installMediaSessionHandlers() {
  if (!('mediaSession' in navigator) || !playButton) return;

  // All hardware/lock-screen transport commands use the same DOM controls as
  // pointer and keyboard input. That keeps direct audio, YouTube, Spotify,
  // Apple Music and verified release routing on one authoritative path.
  setMediaAction('play', () => playButton.click());
  setMediaAction('pause', () => {
    if (playButton.classList.contains('is-playing')) {
      playButton.click();
      return;
    }
    if (audio && !audio.paused) audio.pause();
  });
  setMediaAction('previoustrack', () => prevButton?.click());
  setMediaAction('nexttrack', () => nextButton?.click());
  setMediaAction('seekto', (details) => {
    if (Number.isFinite(details?.seekTime)) seekToSeconds(details.seekTime);
  });
  setMediaAction('seekbackward', (details) => {
    const offset = Number.isFinite(details?.seekOffset) ? details.seekOffset : 10;
    seekToSeconds(mediaElapsed() - offset);
  });
  setMediaAction('seekforward', (details) => {
    const offset = Number.isFinite(details?.seekOffset) ? details.seekOffset : 10;
    seekToSeconds(mediaElapsed() + offset);
  });
  setMediaAction('stop', () => {
    const providerStop = document.querySelector('#providerStage.open #providerDockStop');
    if (providerStop) {
      providerStop.click();
      return;
    }
    if (playButton.classList.contains('is-playing')) playButton.click();
    else if (audio && !audio.paused) {
      audio.pause();
      try { audio.currentTime = 0; } catch { /* non-seekable source */ }
    }
  });
}

function setupPlaybackInputParity() {
  // This window-level guard runs before the older document transport handlers.
  // It prevents Space on provider controls, buttons or links from becoming a
  // second global Play command while preserving the control's native action.
  window.addEventListener('keydown', (event) => {
    if (event.code === 'Space' && isInteractiveTarget(event.target)) event.stopPropagation();
  }, { capture: true });

  document.addEventListener('keydown', (event) => {
    if (event.code !== 'Space' || event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return;
    if (document.getElementById('providerOverlay')?.classList.contains('open')) return;
    if (isInteractiveTarget(event.target)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    playButton?.click();
  }, { capture: true });

  stopGlobalSpaceOnInteractive(app);
  setupProviderSpaceGuard();
  installMediaSessionHandlers();

  // playback-bridge.js may install provider-specific handlers after a click.
  // Reinstall the universal DOM-control handlers one task later so there is no
  // stale YouTube pause/seek handler after switching to Spotify or Apple Music.
  document.addEventListener('click', () => setTimeout(installMediaSessionHandlers, 0), { capture: true });
  if (songTitle) {
    new MutationObserver(() => setTimeout(installMediaSessionHandlers, 0))
      .observe(songTitle, { childList: true, characterData: true, subtree: true });
  }
}

setupPlaybackInputParity();
