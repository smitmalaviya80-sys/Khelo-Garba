(() => {
  const $ = (id) => document.getElementById(id);
  const audio = $('audio');
  const app = $('app');
  const playButton = $('playButton');
  const miniPlay = $('miniPlay');
  const progress = $('progress');
  const elapsedTime = $('elapsedTime');
  const durationTime = $('durationTime');
  const songTitle = $('songTitle');
  const songArtist = $('songArtist');
  const songSheet = $('songSheet');

  const state = {
    songs: new Map(),
    sources: {},
    sets: [],
    ready: false,
    provider: null,
    player: null,
    playerReady: false,
    currentSongId: null,
    currentVideoId: null,
    requestedPlay: false,
    playing: false,
    duration: 0,
    timer: null,
    ytPromise: null,
    stage: null,
    mount: null,
    note: null,
    suppressMutation: false,
    lastUrlSong: null,
  };

  const sourceRank = {
    'official-artist-channel': 6,
    'artist-channel': 5,
    'verified-label-channel': 4,
    'verified-distributor-channel': 3,
    'official-streaming-catalogue': 3,
    'verified-release-source': 2,
    'community-upload': 1,
  };

  const normalise = (value = '') => String(value)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\u0a80-\u0aff]+/g, ' ')
    .trim();

  function toast(message) {
    const target = $('toast');
    if (!target) return;
    target.textContent = message;
    target.classList.add('show');
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => target.classList.remove('show'), 2400);
  }

  async function fetchJson(path) {
    try {
      const response = await fetch(path, { cache: 'no-store' });
      return response.ok ? await response.json() : null;
    } catch {
      return null;
    }
  }

  function currentSongIdentity() {
    const id = new URLSearchParams(location.search).get('song');
    const mapped = id ? state.songs.get(id) : null;
    return mapped || {
      id,
      title: songTitle?.textContent?.trim() || 'Garba',
      artist: songArtist?.textContent?.trim() || '',
      audioUrl: audio?.getAttribute('src') || null,
    };
  }

  function setPlaying(playing) {
    state.playing = Boolean(playing);
    app?.classList.toggle('is-playing', state.playing);
    playButton?.classList.toggle('is-playing', state.playing);
    miniPlay?.classList.toggle('is-playing', state.playing);
    playButton?.setAttribute('aria-label', state.playing ? 'Pause' : 'Play');
    miniPlay?.setAttribute('aria-label', state.playing ? 'Pause' : 'Play');
    if ('mediaSession' in navigator) {
      try { navigator.mediaSession.playbackState = state.playing ? 'playing' : 'paused'; } catch { /* unsupported */ }
    }
  }

  function setProgress(elapsed, duration) {
    const safeDuration = Number.isFinite(duration) && duration > 0 ? duration : 0;
    const safeElapsed = Number.isFinite(elapsed) && elapsed >= 0 ? elapsed : 0;
    state.duration = safeDuration;
    if (elapsedTime) elapsedTime.textContent = formatTime(safeElapsed);
    if (durationTime && safeDuration) durationTime.textContent = formatTime(safeDuration);
    if (progress && safeDuration) {
      const ratio = Math.min(1, Math.max(0, safeElapsed / safeDuration));
      progress.disabled = false;
      progress.removeAttribute('aria-disabled');
      progress.value = Math.round(ratio * 1000);
      progress.style.setProperty('--progress', `${ratio * 100}%`);
      const miniProgress = $('miniProgress');
      if (miniProgress) miniProgress.style.width = `${ratio * 100}%`;
    }
  }

  function formatTime(seconds = 0) {
    const value = Math.max(0, Math.round(Number(seconds) || 0));
    return `${Math.floor(value / 60)}:${String(value % 60).padStart(2, '0')}`;
  }

  function ensureStage() {
    if (state.stage) return state.stage;
    const stage = document.createElement('section');
    stage.id = 'providerStage';
    stage.className = 'provider-dock';
    stage.setAttribute('aria-label', 'Embedded playback');
    stage.setAttribute('aria-hidden', 'true');
    stage.innerHTML = `
      <div class="provider-media" id="providerMedia"></div>
      <div class="provider-dock-bar">
        <span id="providerDockNote">Playing in GARBA</span>
        <button type="button" id="providerDockStop" aria-label="Stop embedded playback">Stop</button>
      </div>`;
    document.body.append(stage);
    state.stage = stage;
    state.mount = stage.querySelector('#providerMedia');
    state.note = stage.querySelector('#providerDockNote');
    stage.querySelector('#providerDockStop')?.addEventListener('click', stopProvider);
    return stage;
  }

  function showStage(note = 'Playing in GARBA') {
    const stage = ensureStage();
    if (state.note) state.note.textContent = note;
    stage.classList.add('open');
    stage.setAttribute('aria-hidden', 'false');
  }

  function hideStage() {
    if (!state.stage) return;
    state.stage.classList.remove('open', 'needs-tap', 'is-loading', 'is-spotify');
    state.stage.setAttribute('aria-hidden', 'true');
  }

  function stopTimer() {
    clearInterval(state.timer);
    state.timer = null;
  }

  function startTimer() {
    stopTimer();
    state.timer = setInterval(() => {
      if (state.provider !== 'youtube' || !state.playerReady || !state.player) return;
      try {
        const elapsed = state.player.getCurrentTime();
        const duration = state.player.getDuration();
        setProgress(elapsed, duration);
      } catch { /* player changing state */ }
    }, 500);
  }

  function stopProvider() {
    stopTimer();
    state.requestedPlay = false;
    state.playing = false;
    if (state.provider === 'youtube' && state.playerReady && state.player) {
      try { state.player.pauseVideo(); } catch { /* no-op */ }
    }
    state.provider = null;
    setPlaying(false);
    hideStage();
  }

  function loadYouTubeApi() {
    if (window.YT?.Player) return Promise.resolve(window.YT);
    if (state.ytPromise) return state.ytPromise;
    state.ytPromise = new Promise((resolve) => {
      const previous = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => {
        try { previous?.(); } catch { /* keep our resolver alive */ }
        resolve(window.YT);
      };
      if (!document.querySelector('script[data-garba-youtube-api]')) {
        const script = document.createElement('script');
        script.src = 'https://www.youtube.com/iframe_api';
        script.async = true;
        script.dataset.garbaYoutubeApi = 'true';
        document.head.append(script);
      }
      const poll = setInterval(() => {
        if (!window.YT?.Player) return;
        clearInterval(poll);
        resolve(window.YT);
      }, 120);
      setTimeout(() => clearInterval(poll), 10000);
    });
    return state.ytPromise;
  }

  function youtubeEmbedUrl(videoId, startSeconds = 0, autoplay = true) {
    const params = new URLSearchParams({
      enablejsapi: '1',
      origin: location.origin,
      playsinline: '1',
      controls: '0',
      disablekb: '1',
      fs: '0',
      rel: '0',
      iv_load_policy: '3',
      autoplay: autoplay ? '1' : '0',
      start: String(Math.max(0, Number(startSeconds) || 0)),
    });
    return `https://www.youtube.com/embed/${encodeURIComponent(videoId)}?${params.toString()}`;
  }

  async function createYouTubePlayer(source, autoplay = true) {
    showStage('Playing in GARBA');
    state.stage?.classList.add('is-loading');
    state.provider = 'youtube';
    state.currentVideoId = source.videoId;
    state.requestedPlay = autoplay;
    state.playerReady = false;

    const iframe = document.createElement('iframe');
    iframe.id = 'garbaYouTubeFrame';
    iframe.title = 'YouTube playback';
    iframe.allow = 'autoplay; encrypted-media; picture-in-picture';
    iframe.referrerPolicy = 'strict-origin-when-cross-origin';
    iframe.setAttribute('allowfullscreen', '');
    iframe.src = youtubeEmbedUrl(source.videoId, source.startSeconds || 0, autoplay);
    state.mount.replaceChildren(iframe);

    await loadYouTubeApi();
    state.player = new window.YT.Player(iframe, {
      events: {
        onReady: (event) => {
          state.playerReady = true;
          state.stage?.classList.remove('is-loading');
          try {
            state.duration = event.target.getDuration() || state.duration;
            if (state.requestedPlay) event.target.playVideo();
          } catch { /* provider not ready */ }
        },
        onStateChange: (event) => {
          const YTState = window.YT?.PlayerState || {};
          if (event.data === YTState.PLAYING) {
            state.stage?.classList.remove('needs-tap', 'is-loading');
            if (state.note) state.note.textContent = 'Playing in GARBA';
            setPlaying(true);
            startTimer();
          } else if (event.data === YTState.PAUSED || event.data === YTState.CUED) {
            setPlaying(false);
            stopTimer();
          } else if (event.data === YTState.ENDED) {
            setPlaying(false);
            stopTimer();
            setTimeout(() => $('nextButton')?.click(), 120);
          }
        },
        onAutoplayBlocked: () => {
          state.stage?.classList.remove('is-loading');
          state.stage?.classList.add('needs-tap');
          if (state.note) state.note.textContent = 'Tap the video once to allow sound';
          setPlaying(false);
        },
        onError: () => {
          state.stage?.classList.remove('is-loading');
          if (state.note) state.note.textContent = 'This source cannot play here';
          setPlaying(false);
          toast('This recording cannot be embedded. Try another track.');
        },
      },
    });
  }

  async function playYouTube(source) {
    if (!navigator.onLine) {
      toast('You are offline. Provider-backed songs need an internet connection.');
      return;
    }
    audio?.pause();
    showStage('Playing in GARBA');

    if (state.provider === 'youtube' && state.playerReady && state.player && state.currentVideoId === source.videoId) {
      try {
        if (state.playing) state.player.pauseVideo();
        else state.player.playVideo();
      } catch { /* recreate below */ }
      return;
    }

    if (state.provider === 'youtube' && state.playerReady && state.player) {
      try {
        state.provider = 'youtube';
        state.currentVideoId = source.videoId;
        state.requestedPlay = true;
        state.player.loadVideoById({ videoId: source.videoId, startSeconds: Number(source.startSeconds) || 0 });
        return;
      } catch { /* rebuild */ }
    }

    await createYouTubePlayer(source, true);
  }

  function spotifyEmbedUrl(sourceUrl = '') {
    try {
      const url = new URL(sourceUrl);
      const parts = url.pathname.split('/').filter(Boolean).filter((part) => !part.startsWith('intl-'));
      const index = parts.findIndex((part) => ['track', 'album', 'playlist', 'episode', 'show'].includes(part));
      if (index < 0 || !parts[index + 1]) return null;
      return `https://open.spotify.com/embed/${parts[index]}/${parts[index + 1]}?utm_source=generator&theme=0`;
    } catch {
      return null;
    }
  }

  function playSpotify(source) {
    if (!navigator.onLine) {
      toast('You are offline. Provider-backed songs need an internet connection.');
      return;
    }
    const embed = spotifyEmbedUrl(source.sourceUrl);
    if (!embed) {
      toast('This track does not have an in-app stream yet.');
      return;
    }
    stopTimer();
    state.provider = 'spotify';
    state.currentVideoId = null;
    state.playerReady = false;
    state.playing = false;
    setPlaying(false);
    showStage('Tap play once in the embedded player');
    state.stage?.classList.add('is-spotify');
    const iframe = document.createElement('iframe');
    iframe.title = 'Spotify playback';
    iframe.src = embed;
    iframe.allow = 'autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture';
    iframe.loading = 'eager';
    iframe.referrerPolicy = 'strict-origin-when-cross-origin';
    state.mount.replaceChildren(iframe);
  }

  function titleSimilarity(a, b) {
    const aa = new Set(normalise(a).split(/\s+/).filter(Boolean));
    const bb = new Set(normalise(b).split(/\s+/).filter(Boolean));
    if (!aa.size || !bb.size) return 0;
    let shared = 0;
    for (const token of aa) if (bb.has(token)) shared += 1;
    return shared / Math.max(aa.size, bb.size);
  }

  function performanceFallback(song) {
    if (!song?.title) return null;
    const candidates = [];
    for (const set of state.sets) {
      if (set.provider !== 'youtube' || !set.videoId || !Array.isArray(set.segments)) continue;
      for (const segment of set.segments) {
        const score = titleSimilarity(song.title, segment.title);
        if (score < 0.84) continue;
        candidates.push({
          score: score * 100 + (sourceRank[set.sourceType] || 0) * 10,
          provider: 'youtube',
          videoId: set.videoId,
          startSeconds: Number(segment.startSeconds) || 0,
          sourceType: set.sourceType,
        });
      }
    }
    candidates.sort((a, b) => b.score - a.score);
    return candidates[0] || null;
  }

  function resolveSource(song) {
    if (!song) return null;
    const explicit = state.sources[song.id] || null;
    if (explicit?.provider === 'youtube' && explicit.videoId) return explicit;
    if (song.playbackProvider === 'youtube' && song.youtubeId) {
      return { provider: 'youtube', videoId: song.youtubeId, startSeconds: song.youtubeStartSeconds || 0 };
    }
    const performance = performanceFallback(song);
    if (performance) return performance;
    if (explicit?.provider === 'spotify' && explicit.sourceUrl) return explicit;
    if (song.playbackProvider === 'spotify' && song.playbackSourceUrl) {
      return { provider: 'spotify', sourceUrl: song.playbackSourceUrl };
    }
    return explicit;
  }

  async function toggleProviderPlayback() {
    const song = currentSongIdentity();
    if (!song?.id) {
      toast('Choose a song first.');
      return;
    }
    if (song.audioUrl || audio?.getAttribute('src')) return false;
    const source = resolveSource(song);
    if (source?.provider === 'youtube' && source.videoId) {
      state.currentSongId = song.id;
      await playYouTube(source);
      return true;
    }
    if (source?.provider === 'spotify' && source.sourceUrl) {
      state.currentSongId = song.id;
      playSpotify(source);
      return true;
    }
    toast('This track does not have an in-app stream yet.');
    return true;
  }

  function interceptPlay(event) {
    const button = event.target.closest?.('#playButton, #miniPlay');
    if (!button) return;
    const song = currentSongIdentity();
    if (song?.audioUrl || audio?.getAttribute('src')) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    toggleProviderPlayback();
  }

  function interceptSpace(event) {
    if (event.code !== 'Space' || event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement || event.target?.isContentEditable) return;
    const song = currentSongIdentity();
    if (song?.audioUrl || audio?.getAttribute('src')) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    toggleProviderPlayback();
  }

  function interceptSeek(event) {
    if (event.target !== progress || state.provider !== 'youtube' || !state.playerReady || !state.player || !state.duration) return;
    event.stopImmediatePropagation();
    const next = Number(progress.value) / 1000 * state.duration;
    try { state.player.seekTo(next, true); } catch { /* no-op */ }
    setProgress(next, state.duration);
  }

  function syncAfterSongChange() {
    const song = currentSongIdentity();
    if (!song?.id || song.id === state.lastUrlSong) return;
    const previousWasPlaying = state.playing;
    state.lastUrlSong = song.id;
    state.currentSongId = song.id;
    if (!state.provider) return;
    const source = resolveSource(song);
    if (source?.provider === 'youtube' && source.videoId) {
      if (previousWasPlaying) playYouTube(source);
      else stopProvider();
    } else {
      stopProvider();
    }
  }

  async function loadContext() {
    const index = await fetchJson('data/catalogue/index.json');
    const playbackPaths = Array.isArray(index?.playbackSources) ? index.playbackSources : [index?.playbackSources].filter(Boolean);
    const [songs, ...manifests] = await Promise.all([
      fetchJson('data/songs.json'),
      ...playbackPaths.map((path) => fetchJson(path)),
    ]);
    if (Array.isArray(songs)) state.songs = new Map(songs.map((song) => [song.id, song]));
    state.sources = Object.assign({}, ...manifests.map((manifest) => manifest?.songSources || {}));

    const setIndex = await fetchJson('data/discovery/sets/index.json');
    const chunks = await Promise.all((setIndex?.chunks || []).map((chunk) => fetchJson(`data/discovery/sets/${chunk}`)));
    state.sets = chunks.flatMap((chunk) => chunk?.sets || []).map((set) => ({
      provider: set.source?.provider,
      videoId: set.source?.videoId,
      sourceType: set.officiality || set.setType || set.source?.provider,
      segments: set.segments || [],
    }));
    state.ready = true;
    state.lastUrlSong = currentSongIdentity()?.id || null;
  }

  function setupMediaSession() {
    if (!('mediaSession' in navigator)) return;
    const install = () => {
      if (!state.provider) return;
      try { navigator.mediaSession.setActionHandler('play', () => toggleProviderPlayback()); } catch { /* unsupported */ }
      try { navigator.mediaSession.setActionHandler('pause', () => state.player?.pauseVideo?.()); } catch { /* unsupported */ }
      try { navigator.mediaSession.setActionHandler('seekto', (details) => {
        if (state.provider === 'youtube' && state.playerReady && Number.isFinite(details.seekTime)) state.player.seekTo(details.seekTime, true);
      }); } catch { /* unsupported */ }
    };
    document.addEventListener('click', () => setTimeout(install, 0), true);
  }

  function init() {
    ensureStage();
    loadYouTubeApi();
    loadContext();

    document.addEventListener('click', interceptPlay, true);
    document.addEventListener('keydown', interceptSpace, true);
    progress?.addEventListener('input', interceptSeek, true);

    if (songTitle) new MutationObserver(() => setTimeout(syncAfterSongChange, 0)).observe(songTitle, { childList: true, characterData: true, subtree: true });
    window.addEventListener('popstate', () => setTimeout(syncAfterSongChange, 0));
    window.addEventListener('offline', () => {
      if (state.provider) {
        stopProvider();
        toast('Offline. Provider-backed songs pause until you reconnect.');
      }
    });

    if (songSheet) {
      new MutationObserver(() => {
        const open = songSheet.getAttribute('aria-hidden') === 'false';
        if (open && matchMedia('(max-width: 700px)').matches && state.provider === 'youtube' && state.playing) {
          try { state.player?.pauseVideo?.(); } catch { /* no-op */ }
          hideStage();
        } else if (!open && state.provider === 'youtube') {
          showStage(state.playing ? 'Playing in GARBA' : 'Ready to play');
        }
      }).observe(songSheet, { attributes: true, attributeFilter: ['aria-hidden'] });
    }

    setupMediaSession();
  }

  init();
})();
