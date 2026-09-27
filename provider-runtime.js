(() => {
  const $ = (id) => document.getElementById(id);
  const upstreamFetch = window.fetch.bind(window);
  const fastBoot = window.GARBA_FAST_BOOT;
  let safeSongs = [];
  let refreshPromise = null;
  let youtubeApi = null;
  let toastTimer = null;

  function requestPath(input) {
    try {
      const raw = typeof input === 'string' ? input : input?.url;
      return raw ? new URL(raw, location.href).pathname : '';
    } catch {
      return '';
    }
  }

  function youtubeVideoId(song) {
    if (song?.youtubeId) return String(song.youtubeId).trim();
    try {
      const url = new URL(String(song?.playbackSourceUrl || ''));
      if (url.hostname === 'youtu.be') return url.pathname.split('/').filter(Boolean)[0] || '';
      if (url.hostname.includes('youtube.com')) {
        if (url.searchParams.get('v')) return url.searchParams.get('v');
        const parts = url.pathname.split('/').filter(Boolean);
        const marker = parts.findIndex((part) => part === 'embed' || part === 'shorts');
        return marker >= 0 ? parts[marker + 1] || '' : '';
      }
    } catch {
      // Invalid/non-YouTube URLs are migration references only.
    }
    return '';
  }

  function isExactYoutube(song) {
    if (!song) return false;
    if (song.playbackSearchOnly) return false;
    if (song.playbackSourceType === 'verified-release-track-reference') return false;
    if (song.playbackSourceType === 'verified-unchaptered-youtube-release') return false;
    return Boolean(youtubeVideoId(song));
  }

  function applyYoutubeOnlyPolicy(song) {
    const safe = { ...song };
    const originalProvider = String(song?.playbackProvider || '').trim();
    const originalUrl = String(song?.playbackSourceUrl || '').trim();
    const originalAudio = String(song?.audioUrl || '').trim();

    // PlayGarba playback is currently YouTube-first. Direct audio and commercial-provider
    // URLs may remain as catalogue evidence, but they are never executable routes here.
    delete safe.audioUrl;

    if (isExactYoutube(song)) {
      safe.playbackProvider = 'youtube';
      if (!safe.playbackSourceUrl || !/youtu(?:\.be|be\.com)/i.test(safe.playbackSourceUrl)) {
        safe.playbackSourceUrl = `https://www.youtube.com/watch?v=${encodeURIComponent(youtubeVideoId(song))}`;
      }
      return safe;
    }

    const referenceUrl = String(song?.playbackReferenceUrl || originalUrl || originalAudio || '').trim();
    if (referenceUrl) safe.playbackReferenceUrl = referenceUrl;
    if (originalProvider && originalProvider !== 'youtube') safe.migrationSourceProvider = originalProvider;
    safe.playbackProvider = 'youtube';
    safe.playbackSourceUrl = '';
    safe.playbackSearchOnly = true;
    if (song?.playbackSourceType !== 'verified-unchaptered-youtube-release') {
      safe.playbackSourceType = 'youtube-migration-pending';
    }
    return safe;
  }

  function sanitiseSongs(songs) {
    return Array.isArray(songs) ? songs.map(applyYoutubeOnlyPolicy) : [];
  }

  function jsonResponse(data, original) {
    const headers = new Headers(original?.headers || undefined);
    headers.set('Content-Type', 'application/json; charset=utf-8');
    return new Response(JSON.stringify(data), {
      status: Number(original?.status) || 200,
      statusText: original?.statusText || 'OK',
      headers,
    });
  }

  window.fetch = async (input, init) => {
    const response = await upstreamFetch(input, init);
    if (!requestPath(input).endsWith('/data/songs.json') || !response?.ok) return response;
    try {
      const songs = await response.clone().json();
      safeSongs = sanitiseSongs(songs);
      return jsonResponse(safeSongs, response);
    } catch {
      return response;
    }
  };

  function seedFastBoot() {
    if (!Array.isArray(fastBoot?.songs)) return;
    const sanitised = sanitiseSongs(fastBoot.songs);
    fastBoot.songs.splice(0, fastBoot.songs.length, ...sanitised);
    safeSongs = sanitised;
  }

  async function refreshSafeSongs() {
    if (refreshPromise) return refreshPromise;
    refreshPromise = window.fetch('data/songs.json', { cache: 'no-store' })
      .then((response) => response.ok ? response.json() : safeSongs)
      .then((songs) => {
        safeSongs = Array.isArray(songs) ? songs : safeSongs;
        return safeSongs;
      })
      .catch(() => safeSongs)
      .finally(() => { refreshPromise = null; });
    return refreshPromise;
  }

  function currentSong() {
    const id = new URL(location.href).searchParams.get('song');
    if (id) {
      const byId = safeSongs.find((song) => song.id === id);
      if (byId) return byId;
    }
    const title = String($('songTitle')?.textContent || '').trim();
    const artist = String($('songArtist')?.textContent || '').trim();
    return safeSongs.find((song) => song.title === title && song.artist === artist) || null;
  }

  function announce(message) {
    const toast = $('toast');
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('show'), 2800);
  }

  function observeYoutubeStage() {
    const stage = $('youtubeStage');
    if (!stage || stage.dataset.youtubeOnlyObserved === 'true') return;
    stage.dataset.youtubeOnlyObserved = 'true';

    // The embedded YouTube surface is persistent. Ordinary page clicks never act as
    // dismissal. Playback is controlled by the main transport; Stop remains explicit.
    const stop = $('youtubeDockStop');
    if (stop) {
      stop.textContent = 'Stop';
      stop.setAttribute('aria-label', 'Stop YouTube playback');
      stop.title = 'Stop YouTube playback';
    }
    const open = $('youtubeDockOpen');
    if (open) open.textContent = 'YouTube';
  }

  try {
    Object.defineProperty(window, 'GARBA_YOUTUBE_PLAYER', {
      configurable: true,
      get() { return youtubeApi; },
      set(api) { youtubeApi = api; },
    });
  } catch {
    // Extremely old WebViews can reject redefining globals. The player runtime can
    // still own the main Play button directly in those environments.
  }

  function interceptUnavailablePlay(event) {
    const target = event.target instanceof Element ? event.target : null;
    if (!target?.closest('#playButton, #miniPlay')) return;
    const song = currentSong();
    if (!song || isExactYoutube(song)) return;

    event.preventDefault();
    event.stopImmediatePropagation();
    announce('YouTube source not mapped yet. This track still needs a verified YouTube route.');
  }

  function interceptUnavailableSpace(event) {
    if (event.code !== 'Space') return;
    const target = event.target instanceof Element ? event.target : null;
    if (target?.closest('button, a[href], input, textarea, select, iframe, [contenteditable]:not([contenteditable="false"])')) return;
    const song = currentSong();
    if (!song || isExactYoutube(song)) return;

    event.preventDefault();
    event.stopImmediatePropagation();
    announce('YouTube source not mapped yet.');
  }

  function loadAtmosphereRuntime() {
    if (window.GARBA_ATMOSPHERE || document.getElementById('garbaAtmosphereRuntime')) return;
    const script = document.createElement('script');
    script.id = 'garbaAtmosphereRuntime';
    script.src = 'assets/runtime/immersive-atmosphere.js';
    script.async = false;
    script.addEventListener('error', () => console.warn('Garba Atmosphere runtime could not load.'));
    document.head.append(script);
  }

  function loadLocalBackgroundRuntime() {
    if (window.GARBA_LOCAL_BACKGROUND || document.getElementById('garbaLocalBackgroundRuntime')) return;
    const script = document.createElement('script');
    script.id = 'garbaLocalBackgroundRuntime';
    script.src = 'assets/runtime/local-background.js';
    script.async = false;
    script.addEventListener('error', () => console.warn('Local background runtime could not load.'));
    document.head.append(script);
  }

  seedFastBoot();
  loadAtmosphereRuntime();
  loadLocalBackgroundRuntime();

  // Exact mapped songs deliberately fall through to youtube-player-runtime.js so the
  // normal Play/Space controls initialise and control playback in one user action.
  // No secondary YouTube button is injected and unrelated page clicks are not close actions.
  document.addEventListener('click', interceptUnavailablePlay, { capture: true });
  document.addEventListener('keydown', interceptUnavailableSpace, { capture: true });
  new MutationObserver(() => observeYoutubeStage()).observe(document.body, { childList: true });

  window.addEventListener('garba:catalogue-ready', () => queueMicrotask(refreshSafeSongs));

  window.GARBA_YOUTUBE_ONLY_POLICY = {
    isExactYoutube,
    sanitiseSongs,
    refresh: refreshSafeSongs,
    get currentSong() { return currentSong(); },
  };
})();