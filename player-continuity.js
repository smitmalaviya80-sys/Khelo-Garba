(() => {
  const $ = (id) => document.getElementById(id);
  const songTitle = $('songTitle');
  const playButton = $('playButton');
  const catalogueFetch = window.fetch.bind(window);
  const requestedSongId = new URL(location.href).searchParams.get('song');
  const fastBoot = window.GARBA_FAST_BOOT;
  const mobileQuery = window.matchMedia('(max-width: 700px)');
  const needsFullCatalogueForDeepLink = Boolean(
    requestedSongId
    && Array.isArray(fastBoot?.songs)
    && !fastBoot.songs.some((song) => song.id === requestedSongId)
  );

  let playAfterSelection = false;
  let continueProviderAfterNavigation = false;
  let safeSongs = [];
  let deepLinkHydrationPromise = null;
  let catalogueReadyOnlinePulse = false;

  const PROVIDER_NAMES = {
    youtube: 'YouTube',
    spotify: 'Spotify',
    'apple-music': 'Apple Music',
    'amazon-music': 'Amazon Music',
    soundcloud: 'SoundCloud',
    bandcamp: 'Bandcamp',
    qobuz: 'Qobuz',
    external: 'source provider',
  };

  function requestPath(input) {
    try {
      const raw = typeof input === 'string' ? input : input?.url;
      return raw ? new URL(raw, location.href).pathname : '';
    } catch {
      return '';
    }
  }

  function deepLinkControls() {
    return [
      $('playButton'), $('prevButton'), $('nextButton'),
      $('miniPlay'), $('miniPrev'), $('miniNext'), $('progress'),
    ].filter(Boolean);
  }

  function clearTransientMediaMetadata() {
    if (!('mediaSession' in navigator)) return;
    try { navigator.mediaSession.metadata = null; } catch { /* unsupported metadata setter */ }
  }

  function setDeepLinkUi(status) {
    if (!needsFullCatalogueForDeepLink) return;
    const app = $('app');
    const loading = status === 'loading';
    const failed = status === 'failed';

    app?.setAttribute('aria-busy', loading ? 'true' : 'false');
    if (app) app.dataset.loading = loading ? 'true' : 'false';

    for (const control of deepLinkControls()) {
      const disabled = loading || failed;
      control.disabled = disabled;
      control.setAttribute('aria-disabled', disabled ? 'true' : 'false');
    }

    if (status === 'loading') {
      clearTransientMediaMetadata();
      if ($('genreEyebrow')) $('genreEyebrow').textContent = 'PlayGarba';
      if (songTitle) songTitle.textContent = 'Loading requested song…';
      if ($('songArtist')) $('songArtist').textContent = 'Opening the requested track';
      if ($('durationTime')) $('durationTime').textContent = '—';
      if ($('miniTitle')) $('miniTitle').textContent = 'Loading song…';
      if ($('miniArtist')) $('miniArtist').textContent = 'Opening requested track';
      return;
    }

    if (failed) {
      clearTransientMediaMetadata();
      if ($('genreEyebrow')) $('genreEyebrow').textContent = 'PlayGarba';
      if (songTitle) songTitle.textContent = 'Requested song unavailable';
      if ($('songArtist')) $('songArtist').textContent = 'Could not load the full catalogue. Check your connection and try again.';
      if ($('durationTime')) $('durationTime').textContent = '—';
      if ($('miniTitle')) $('miniTitle').textContent = 'Song unavailable';
      if ($('miniArtist')) $('miniArtist').textContent = 'Reconnect to load this track';
    }
  }

  function unavailableCatalogueResponse() {
    return new Response(JSON.stringify({ error: 'Full catalogue required for requested song' }), {
      status: 503,
      statusText: 'Catalogue unavailable',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
    });
  }

  async function ensureDeepLinkCatalogue() {
    if (!needsFullCatalogueForDeepLink || window.GARBA_CATALOGUE_READY) {
      setDeepLinkUi('ready');
      return true;
    }

    if (!deepLinkHydrationPromise) {
      setDeepLinkUi('loading');
      deepLinkHydrationPromise = Promise.resolve(fastBoot?.hydrate?.())
        .then((ready) => {
          const resolved = Boolean(ready || window.GARBA_CATALOGUE_READY);
          setDeepLinkUi(resolved ? 'ready' : 'failed');
          return resolved;
        })
        .catch(() => {
          setDeepLinkUi('failed');
          return false;
        });
    }
    return deepLinkHydrationPromise;
  }

  function canonicalSourceUrl(raw = '') {
    try {
      const url = new URL(raw);
      url.hash = '';
      for (const key of [...url.searchParams.keys()]) {
        if (/^(?:utm_|si$|ref$|source$)/i.test(key)) url.searchParams.delete(key);
      }
      return url.toString();
    } catch {
      return String(raw || '').trim();
    }
  }

  function providerSearchUrl(song) {
    const query = `${song?.title || ''} ${song?.artist || ''}`.trim();
    const encoded = encodeURIComponent(query);
    switch (song?.playbackProvider) {
      case 'spotify': return `https://open.spotify.com/search/${encoded}`;
      case 'apple-music': return `https://music.apple.com/us/search?term=${encoded}`;
      case 'amazon-music': return `https://music.amazon.com/search/${encoded}`;
      case 'youtube': return `https://www.youtube.com/results?search_query=${encoded}`;
      case 'soundcloud': return `https://soundcloud.com/search?q=${encoded}`;
      default: return String(song?.playbackSourceUrl || '').trim();
    }
  }

  function sanitisePlaybackRoutes(songs) {
    if (!Array.isArray(songs)) return [];
    const cloned = songs.map((song) => ({ ...song }));
    const exactByUrl = new Map();

    for (const song of cloned) {
      if (song.playbackSourceType !== 'verified-track-source' || !song.playbackSourceUrl) continue;
      const key = `${song.playbackProvider || ''}|${canonicalSourceUrl(song.playbackSourceUrl)}`;
      const group = exactByUrl.get(key) || [];
      group.push(song);
      exactByUrl.set(key, group);
    }

    const unsafeIds = new Set();
    for (const group of exactByUrl.values()) {
      const signatures = new Set(group.map((song) => `${song.title || ''}\u0000${song.artist || ''}`));
      if (signatures.size > 1) group.forEach((song) => unsafeIds.add(song.id));
    }

    for (const song of cloned) {
      const releaseReference = song.playbackSourceType === 'verified-release-track-reference';
      const duplicateExact = unsafeIds.has(song.id);
      if (!releaseReference && !duplicateExact) continue;

      const referenceUrl = String(song.playbackReferenceUrl || song.playbackSourceUrl || '').trim();
      song.playbackReferenceUrl = referenceUrl;
      song.playbackSourceType = 'verified-release-track-reference';
      song.playbackSearchOnly = true;
      song.playbackSourceUrl = providerSearchUrl(song) || referenceUrl;
      delete song.youtubeStartSeconds;
    }

    return cloned;
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
    const path = requestPath(input);
    const catalogueRequest = path.endsWith('/data/songs.json') || path.endsWith('/data/genres.json');
    if (catalogueRequest && needsFullCatalogueForDeepLink && !window.GARBA_CATALOGUE_READY) {
      const ready = await ensureDeepLinkCatalogue();
      if (!ready) return unavailableCatalogueResponse();
    }

    const response = await catalogueFetch(input, init);
    if (!path.endsWith('/data/songs.json')) return response;
    if (!response?.ok) return response;

    try {
      const songs = await response.clone().json();
      safeSongs = sanitisePlaybackRoutes(songs);
      return jsonResponse(safeSongs, response);
    } catch {
      return response;
    }
  };

  function currentSafeSong() {
    const id = new URL(location.href).searchParams.get('song');
    if (id) {
      const byId = safeSongs.find((song) => song.id === id);
      if (byId) return byId;
    }
    const title = String(songTitle?.textContent || '').trim();
    const artist = String($('songArtist')?.textContent || '').trim();
    return safeSongs.find((song) => song.title === title && song.artist === artist) || null;
  }

  function providerName(provider = '') {
    const key = String(provider || '').toLowerCase();
    return PROVIDER_NAMES[key] || key.replace(/(^|-)([a-z])/g, (_, prefix, letter) => `${prefix ? ' ' : ''}${letter.toUpperCase()}`) || 'provider';
  }

  function guardReferenceOnlyProvider() {
    const stage = document.querySelector('#providerStage');
    if (!stage) return;
    if (stage.getAttribute('aria-hidden') === 'true' || !stage.classList.contains('open')) {
      delete stage.dataset.routeTruthSong;
      return;
    }

    const song = currentSafeSong();
    if (!song?.playbackSearchOnly || song.playbackSourceType !== 'verified-release-track-reference') return;
    if (stage.dataset.routeTruthSong === song.id) return;

    const name = providerName(song.playbackProvider);
    const searchUrl = providerSearchUrl(song) || song.playbackSourceUrl || song.playbackReferenceUrl;
    const media = stage.querySelector('#providerMedia');
    const note = stage.querySelector('#providerDockNote');
    const open = stage.querySelector('#providerDockOpen');
    const card = document.createElement('div');
    card.className = 'provider-external';

    const heading = document.createElement('strong');
    heading.textContent = 'Exact track source not mapped';
    const copy = document.createElement('span');
    copy.textContent = `The release evidence points to one ${name} track, but GARBA has not verified that it is ${song.title}. The wrong recording will not be autoplayed.`;
    const action = document.createElement('a');
    action.className = 'provider-external-action';
    action.href = searchUrl;
    action.target = '_blank';
    action.rel = 'noopener noreferrer';
    action.textContent = `Search ${name}`;
    card.append(heading, copy, action);

    stage.classList.remove('is-spotify', 'is-apple', 'is-soundcloud', 'is-youtube-release');
    stage.classList.add('is-external');
    media?.replaceChildren(card);
    if (note) note.textContent = 'Release reference only · exact selected song not verified';
    if (open) {
      open.href = searchUrl;
      open.textContent = `Search ${name}`;
      open.setAttribute('aria-label', `Search for ${song.title} on ${name}`);
    }
    stage.dataset.routeTruthSong = song.id || 'reference';
  }

  function observeProviderStage() {
    const stage = document.querySelector('#providerStage');
    if (!stage) return false;

    guardReferenceOnlyProvider();
    new MutationObserver(guardReferenceOnlyProvider)
      .observe(stage, { attributes: true, attributeFilter: ['class', 'aria-hidden'] });
    return true;
  }

  function providerIsOpen() {
    return Boolean(document.querySelector('#providerStage.open[aria-hidden="false"]'));
  }

  function closeMobileSongBrowserAfterSelection() {
    if (!mobileQuery.matches) return;
    const sheet = $('songSheet');
    if (!sheet || sheet.dataset.snap === 'closed') return;
    $('sheetClose')?.click();
  }

  function rememberPlaybackIntent(event) {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;

    if (target.closest('.song-copy')) {
      playAfterSelection = true;
      continueProviderAfterNavigation = false;
      return;
    }

    if (providerIsOpen() && target.closest('#prevButton, #nextButton, #miniPrev, #miniNext')) {
      continueProviderAfterNavigation = true;
      playAfterSelection = false;
    }
  }

  function resumeSelectedProviderIfNeeded() {
    const shouldStartSelectedSong = playAfterSelection;
    const shouldContinueProvider = continueProviderAfterNavigation;
    playAfterSelection = false;
    continueProviderAfterNavigation = false;

    if (!shouldStartSelectedSong && !shouldContinueProvider) return;

    queueMicrotask(() => {
      if (shouldStartSelectedSong) closeMobileSongBrowserAfterSelection();
      if (!playButton?.isConnected) return;
      const selected = currentSafeSong();
      const executable = window.GARBA_ROUTE_READINESS?.canExecuteSong?.(selected)
        ?? Boolean(selected?.youtubeId && !selected?.playbackSearchOnly);
      if (!executable || playButton.disabled) return;
      playButton.click();
    });
  }

  function guardInteractiveShortcuts(event) {
    const shortcut = event.key === '/'
      || event.code === 'Space'
      || event.code === 'ArrowLeft'
      || event.code === 'ArrowRight'
      || String(event.key || '').toLowerCase() === 'f';
    if (!shortcut) return;

    const target = event.target instanceof Element ? event.target : null;
    const interactive = target?.closest(
      'button, a[href], input, textarea, select, iframe, [contenteditable]:not([contenteditable="false"]), [role="button"], [role="link"]'
    );
    if (interactive) event.stopImmediatePropagation();
  }

  function suppressHydrationOnlineToast(event) {
    if (!catalogueReadyOnlinePulse || event.isTrusted) return;
    queueMicrotask(() => {
      const toast = $('toast');
      if (toast?.textContent === 'Back online.') {
        toast.classList.remove('show');
        toast.textContent = '';
      }
    });
  }

  window.addEventListener('garba:catalogue-ready', () => {
    catalogueReadyOnlinePulse = true;
    queueMicrotask(() => { catalogueReadyOnlinePulse = false; });
  });
  window.addEventListener('online', (event) => {
    suppressHydrationOnlineToast(event);
    if (event.isTrusted && needsFullCatalogueForDeepLink && !window.GARBA_CATALOGUE_READY) {
      deepLinkHydrationPromise = null;
      void ensureDeepLinkCatalogue();
    }
  });
  document.addEventListener('keydown', guardInteractiveShortcuts);
  document.addEventListener('click', rememberPlaybackIntent, { capture: true });

  if (needsFullCatalogueForDeepLink) {
    setDeepLinkUi('loading');
    void ensureDeepLinkCatalogue();
  }

  if (songTitle) {
    new MutationObserver(resumeSelectedProviderIfNeeded)
      .observe(songTitle, { childList: true, characterData: true, subtree: true });
  }

  if (!observeProviderStage()) {
    const providerStageMountObserver = new MutationObserver((records, observer) => {
      const mounted = records.some((record) => [...record.addedNodes]
        .some((node) => node instanceof Element && node.id === 'providerStage'));
      if (!mounted) return;
      observer.disconnect();
      observeProviderStage();
    });
    providerStageMountObserver.observe(document.body, { childList: true });
  }
})();
