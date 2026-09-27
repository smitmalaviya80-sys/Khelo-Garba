(() => {
  const audio = document.getElementById('audio');
  const playButton = document.getElementById('playButton');
  const miniPlay = document.getElementById('miniPlay');
  const trackBlock = document.getElementById('trackBlock');
  const songTitle = document.getElementById('songTitle');
  const songSheet = document.getElementById('songSheet');
  const toast = document.getElementById('toast');

  const PROVIDER_NAMES = {
    youtube: 'YouTube',
    spotify: 'Spotify',
    'apple-music': 'Apple Music',
    'amazon-music': 'Amazon Music',
    qobuz: 'Qobuz',
    bandcamp: 'Bandcamp',
    soundcloud: 'SoundCloud',
  };

  const state = {
    sources: {},
    ready: false,
    loading: null,
    activeFallback: null,
  };

  async function fetchJson(path) {
    try {
      const response = await fetch(path, { cache: 'no-store' });
      return response.ok ? await response.json() : null;
    } catch {
      return null;
    }
  }

  function announce(message) {
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add('show');
    clearTimeout(announce.timer);
    announce.timer = setTimeout(() => toast.classList.remove('show'), 2400);
  }

  function currentSongId() {
    return new URLSearchParams(location.search).get('song');
  }

  function providerName(provider = '') {
    const key = String(provider).toLowerCase();
    return PROVIDER_NAMES[key] || key.replace(/(^|-)([a-z])/g, (_, prefix, letter) => `${prefix ? ' ' : ''}${letter.toUpperCase()}`) || 'Provider';
  }

  function presentation(source) {
    if (!source) return null;
    const provider = providerName(source.provider);
    const type = String(source.sourceType || '').toLowerCase();
    const release = type === 'verified-release-source';
    const official = type.includes('official');
    const verified = type.includes('verified');
    return {
      provider,
      kind: release ? 'release' : official ? 'official' : verified ? 'verified' : 'provider',
      label: release
        ? `Verified release · ${provider}`
        : `${official ? 'Official' : verified ? 'Verified' : 'Provider'} source · ${provider}`,
      description: release
        ? `Verified release source on ${provider}. This may open the release rather than a song-specific stream.`
        : `${official ? 'Official' : verified ? 'Verified' : 'Provider'} playback source mapped to this catalogue entry.`,
    };
  }

  function ensureStatus() {
    let badge = document.getElementById('playbackStatus');
    if (badge || !trackBlock) return badge;
    badge = document.createElement('span');
    badge.id = 'playbackStatus';
    badge.className = 'playback-status';
    badge.setAttribute('aria-live', 'polite');
    trackBlock.append(badge);
    return badge;
  }

  function syncStatus() {
    const badge = ensureStatus();
    const source = state.sources[currentSongId()] || null;
    const info = presentation(source);
    const hasDirectAudio = Boolean(audio?.getAttribute('src'));
    const title = String(songTitle?.textContent || '').trim();

    if (badge) {
      if (hasDirectAudio) {
        badge.textContent = 'Direct audio';
        badge.title = 'This track has a direct audio source.';
        badge.dataset.kind = 'direct';
        badge.classList.add('show');
      } else if (info) {
        badge.textContent = info.label;
        badge.title = info.description;
        badge.dataset.kind = info.kind;
        badge.classList.add('show');
      } else {
        badge.textContent = '';
        badge.removeAttribute('title');
        delete badge.dataset.kind;
        badge.classList.remove('show');
      }
    }

    for (const button of [playButton, miniPlay]) {
      if (!button || button.classList.contains('is-playing')) continue;
      if (hasDirectAudio) {
        button.title = 'Play direct audio';
        delete button.dataset.playbackProvider;
        delete button.dataset.playbackKind;
      } else if (info) {
        button.title = `${info.kind === 'release' ? 'Open' : 'Play via'} ${info.provider}${title && !/loading/i.test(title) ? `: ${title}` : ''}`;
        button.dataset.playbackProvider = info.provider;
        button.dataset.playbackKind = info.kind;
      }
    }
  }

  function stageParts() {
    const stage = document.getElementById('providerStage');
    const media = document.getElementById('providerMedia');
    const note = document.getElementById('providerDockNote');
    const stop = document.getElementById('providerDockStop');
    return stage && media ? { stage, media, note, stop } : null;
  }

  function resetStageClasses(stage) {
    stage.classList.remove(
      'is-loading', 'needs-tap', 'is-spotify', 'is-apple', 'is-external',
      'is-release', 'is-youtube-release'
    );
  }

  function openStage(kind, noteText) {
    const parts = stageParts();
    if (!parts) return null;
    resetStageClasses(parts.stage);
    parts.stage.classList.add('open', kind);
    parts.stage.setAttribute('aria-hidden', 'false');
    if (parts.note) parts.note.textContent = noteText;
    if (parts.stop) {
      parts.stop.textContent = 'Close';
      parts.stop.setAttribute('aria-label', 'Close provider source');
    }
    state.activeFallback = kind;
    return parts;
  }

  function restoreStageStop(parts) {
    if (!parts?.stop) return;
    parts.stop.textContent = 'Stop';
    parts.stop.setAttribute('aria-label', 'Stop embedded playback');
  }

  function appleMusicEmbedUrl(sourceUrl = '') {
    try {
      const url = new URL(sourceUrl);
      if (url.hostname !== 'music.apple.com') return null;
      url.hostname = 'embed.music.apple.com';
      return url.toString();
    } catch {
      return null;
    }
  }

  function openAppleMusic(source) {
    if (!navigator.onLine) {
      announce('You are offline. Apple Music needs an internet connection.');
      return;
    }
    const embed = appleMusicEmbedUrl(source.sourceUrl);
    if (!embed) return openExternalSource(source);
    audio?.pause();
    const info = presentation(source);
    const parts = openStage('is-apple', info?.label || 'Apple Music');
    if (!parts) return;

    const iframe = document.createElement('iframe');
    iframe.title = 'Apple Music playback';
    iframe.src = embed;
    iframe.allow = 'autoplay *; encrypted-media *; fullscreen *';
    iframe.loading = 'eager';
    iframe.referrerPolicy = 'strict-origin-when-cross-origin';
    iframe.setAttribute('sandbox', 'allow-forms allow-popups allow-same-origin allow-scripts allow-storage-access-by-user-activation allow-top-navigation-by-user-activation');
    parts.media.replaceChildren(iframe);
  }

  function openExternalSource(source) {
    if (!navigator.onLine) {
      announce('You are offline. Verified provider sources need an internet connection.');
      return;
    }
    if (!source?.sourceUrl) return delegateToCore(playButton);
    audio?.pause();
    const info = presentation(source);
    const name = providerName(source.provider);
    const parts = openStage('is-external', info?.label || `${name} source`);
    if (!parts) return;

    const card = document.createElement('div');
    card.className = 'provider-external';
    const heading = document.createElement('strong');
    heading.textContent = source.sourceType === 'verified-release-source'
      ? `Verified release on ${name}`
      : `Verified source on ${name}`;
    const copy = document.createElement('span');
    copy.textContent = source.sourceType === 'verified-release-source'
      ? 'This catalogue entry is verified at release level. Open the provider and choose this track there.'
      : 'Open the verified provider source to continue playback.';
    const action = document.createElement('a');
    action.className = 'provider-external-action';
    action.href = source.sourceUrl;
    action.target = '_blank';
    action.rel = 'noopener';
    action.textContent = `Open ${name}`;
    card.append(heading, copy, action);
    parts.media.replaceChildren(card);
  }

  function hideFallbackStage() {
    if (!state.activeFallback) return false;
    const parts = stageParts();
    if (!parts) {
      state.activeFallback = null;
      return false;
    }
    parts.stage.classList.remove('open', 'is-apple', 'is-external');
    parts.stage.setAttribute('aria-hidden', 'true');
    // Removing the iframe is essential: simply hiding an Apple Music embed can
    // leave audio playing invisibly after the user presses Close or goes offline.
    parts.media.replaceChildren();
    restoreStageStop(parts);
    state.activeFallback = null;
    return true;
  }

  function delegateToCore(button) {
    if (!button) return;
    button.dataset.garbaRouteBypass = '1';
    button.click();
  }

  async function routeButton(button) {
    await state.loading;
    const source = state.sources[currentSongId()] || null;
    if (source?.provider === 'apple-music' && source.sourceUrl) {
      openAppleMusic(source);
      return;
    }
    if (source && !['youtube', 'spotify'].includes(source.provider) && source.sourceUrl) {
      openExternalSource(source);
      return;
    }
    delegateToCore(button);
  }

  function interceptPlay(event) {
    const button = event.target.closest?.('#playButton, #miniPlay');
    if (!button || audio?.getAttribute('src')) return;
    if (button.dataset.garbaRouteBypass === '1') {
      delete button.dataset.garbaRouteBypass;
      return;
    }
    event.preventDefault();
    event.stopImmediatePropagation();
    routeButton(button);
  }

  function interceptSpace(event) {
    if (event.code !== 'Space' || event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return;
    if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement || event.target?.isContentEditable) return;
    if (audio?.getAttribute('src')) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    routeButton(playButton);
  }

  function interceptProviderStop(event) {
    if (!state.activeFallback || !event.target.closest?.('#providerDockStop')) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    hideFallbackStage();
  }

  async function loadRoutes() {
    const index = await fetchJson('data/catalogue/index.json');
    const configured = index?.playbackSources || [
      'data/playback-sources-generated.json',
      'data/playback-sources.json',
      'data/playback-sources-current.json',
    ];
    const paths = Array.isArray(configured) ? configured : [configured];
    const manifests = await Promise.all(paths.filter(Boolean).map((path) => fetchJson(path)));
    state.sources = Object.assign({}, ...manifests.map((manifest) => manifest?.songSources || {}));
    state.ready = true;
    syncStatus();
  }

  window.addEventListener('click', interceptProviderStop, true);
  document.addEventListener('click', interceptPlay, true);
  document.addEventListener('keydown', interceptSpace, true);

  if (songTitle) {
    new MutationObserver(() => {
      hideFallbackStage();
      queueMicrotask(syncStatus);
    }).observe(songTitle, { childList: true, characterData: true, subtree: true });
  }

  if (audio) {
    new MutationObserver(syncStatus).observe(audio, { attributes: true, attributeFilter: ['src'] });
    audio.addEventListener('play', syncStatus);
    audio.addEventListener('pause', syncStatus);
  }

  if (songSheet) {
    new MutationObserver(() => {
      if (songSheet.getAttribute('aria-hidden') === 'false' && matchMedia('(max-width: 700px)').matches) hideFallbackStage();
    }).observe(songSheet, { attributes: true, attributeFilter: ['aria-hidden'] });
  }

  window.addEventListener('offline', () => {
    if (hideFallbackStage()) announce('Offline. Provider playback paused until you reconnect.');
  });

  state.loading = loadRoutes().catch(() => { state.ready = true; syncStatus(); });
  window.GARBA_PLAYBACK_ROUTES = {
    get ready() { return state.ready; },
    sourceFor(songId) { return state.sources[songId] || null; },
    refresh: syncStatus,
    closeActive: hideFallbackStage,
    routeCurrent() { return routeButton(playButton); },
  };

  ensureStatus();
  syncStatus();
})();
