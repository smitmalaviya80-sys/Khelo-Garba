(() => {
  const API_SRC = 'https://www.youtube.com/iframe_api';
  const WATCHDOG_MS = 7000;
  let requested = false;

  function constrainedConnection() {
    const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    return Boolean(connection?.saveData || /(^|-)2g$/.test(connection?.effectiveType || ''));
  }

  function ensureYouTubeApi() {
    if (window.YT?.Player || document.querySelector('script[data-garba-youtube-api]')) return;
    const script = document.createElement('script');
    script.src = API_SRC;
    script.async = true;
    script.dataset.garbaYoutubeApi = 'true';
    script.addEventListener('error', () => {
      document.documentElement.dataset.youtubeApi = 'failed';
    }, { once: true });
    document.head.append(script);
    requested = true;
  }

  function prewarmAfterFirstPaint() {
    if (!navigator.onLine || constrainedConnection()) return;
    const run = () => ensureYouTubeApi();
    if ('requestIdleCallback' in window) requestIdleCallback(run, { timeout: 2500 });
    else setTimeout(run, 1200);
  }

  function armProviderWatchdog(stage) {
    if (!stage || stage.dataset.watchdogArmed === 'true') return;
    stage.dataset.watchdogArmed = 'true';

    const clearIfReady = () => {
      if (!stage.classList.contains('is-loading')) {
        stage.dataset.watchdogArmed = 'false';
        return true;
      }
      return false;
    };

    const iframe = stage.querySelector('.provider-media iframe');
    iframe?.addEventListener('load', () => {
      setTimeout(() => {
        if (clearIfReady()) return;
        stage.classList.remove('is-loading');
        stage.classList.add('needs-tap');
        const note = stage.querySelector('#providerDockNote');
        if (note) note.textContent = 'Tap play once if sound has not started';
        stage.dataset.watchdogArmed = 'false';
      }, 1800);
    }, { once: true });

    setTimeout(() => {
      if (clearIfReady()) return;
      stage.classList.remove('is-loading');
      stage.classList.add('needs-tap');
      const note = stage.querySelector('#providerDockNote');
      if (note) {
        note.textContent = document.documentElement.dataset.youtubeApi === 'failed'
          ? 'YouTube player could not load. Check your connection.'
          : 'Tap play once in the video';
      }
      stage.dataset.watchdogArmed = 'false';
    }, WATCHDOG_MS);
  }

  function observeProvider() {
    const observer = new MutationObserver(() => {
      const stage = document.getElementById('providerStage');
      if (!stage) return;
      if (stage.classList.contains('is-loading')) armProviderWatchdog(stage);
    });
    observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
  }

  // Warm the provider API after the interface is already visible. On the first
  // Play gesture, request it immediately if it has not been warmed yet. This
  // materially shortens the iOS path where an asynchronous API fetch otherwise
  // consumes the user gesture before playVideo can run.
  window.addEventListener('load', prewarmAfterFirstPaint, { once: true });
  document.addEventListener('pointerdown', (event) => {
    if (!event.target.closest('#playButton, #miniPlay, .song-row')) return;
    if (!requested && !window.YT?.Player) ensureYouTubeApi();
  }, { capture: true, passive: true });

  observeProvider();
})();
