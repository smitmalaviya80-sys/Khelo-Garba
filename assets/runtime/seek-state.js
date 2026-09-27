(() => {
  const progress = document.getElementById('progress');
  const audio = document.getElementById('audio');
  const durationTime = document.getElementById('durationTime');
  if (!progress || !audio) return;

  const defaultLabel = progress.getAttribute('aria-label') || 'Seek';
  let scheduled = false;
  let youtubeStage = null;
  let youtubeStageObserver = null;
  let stageMountObserver = null;

  function durationTextIsKnown() {
    const text = String(durationTime?.textContent || '').trim();
    return Boolean(text && text !== '--:--' && text !== '—' && text !== '0:00');
  }

  function directAudioSeekable() {
    const hasSource = Boolean(audio.currentSrc || audio.getAttribute('src'));
    const duration = Number(audio.duration);
    return hasSource && Number.isFinite(duration) && duration > 0;
  }

  function youtubeSeekable() {
    if (!youtubeStage?.classList.contains('open')) return false;
    if (youtubeStage.classList.contains('is-loading')) return false;
    if (youtubeStage.getAttribute('aria-hidden') === 'true') return false;
    return Boolean(window.GARBA_YOUTUBE_PLAYER?.activeSongId && durationTextIsKnown());
  }

  function sync() {
    scheduled = false;
    const seekable = directAudioSeekable() || youtubeSeekable();
    if (progress.disabled === seekable) progress.disabled = !seekable;
    progress.setAttribute('aria-disabled', String(!seekable));
    progress.setAttribute('aria-label', seekable ? defaultLabel : 'Seek unavailable for this playback source');
    progress.title = seekable ? defaultLabel : 'Seeking is unavailable for this playback source';
    progress.dataset.seekAvailable = seekable ? 'true' : 'false';
  }

  function scheduleSync() {
    if (scheduled) return;
    scheduled = true;
    queueMicrotask(sync);
  }

  function bindYoutubeStage(stage) {
    if (!stage || stage === youtubeStage) return false;
    youtubeStageObserver?.disconnect();
    youtubeStage = stage;
    youtubeStageObserver = new MutationObserver(scheduleSync);
    youtubeStageObserver.observe(youtubeStage, {
      attributes: true,
      attributeFilter: ['class', 'aria-hidden'],
    });
    stageMountObserver?.disconnect();
    stageMountObserver = null;
    scheduleSync();
    return true;
  }

  function observeYoutubeStageMount() {
    if (bindYoutubeStage(document.getElementById('youtubeStage'))) return;
    if (!document.body) return;
    stageMountObserver = new MutationObserver((records, observer) => {
      for (const record of records) {
        for (const node of record.addedNodes) {
          if (node?.nodeType !== 1 || node.id !== 'youtubeStage') continue;
          observer.disconnect();
          bindYoutubeStage(node);
          return;
        }
      }
    });
    stageMountObserver.observe(document.body, { childList: true });
  }

  for (const eventName of ['loadedmetadata', 'durationchange', 'emptied', 'abort', 'error']) {
    audio.addEventListener(eventName, scheduleSync);
  }

  if (durationTime) {
    new MutationObserver(scheduleSync).observe(durationTime, {
      subtree: true,
      childList: true,
      characterData: true,
    });
  }

  observeYoutubeStageMount();
  window.addEventListener('garba:catalogue-ready', scheduleSync);
  window.addEventListener('pageshow', scheduleSync);
  scheduleSync();

  window.GARBA_SEEK_STATE_RUNTIME = { sync: scheduleSync };
})();

import(new URL('assets/runtime/visual-world-state.js', document.baseURI).href)
  .catch((error) => console.warn('GARBA 2K visual world runtime failed to load; SVG fallbacks remain active.', error));
