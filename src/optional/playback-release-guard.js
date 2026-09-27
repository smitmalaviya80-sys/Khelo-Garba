(() => {
  const audio = document.getElementById('audio');
  const playButton = document.getElementById('playButton');
  const songTitle = document.getElementById('songTitle');
  const songSheet = document.getElementById('songSheet');
  const toast = document.getElementById('toast');

  const providerNames = {
    youtube: 'YouTube',
    spotify: 'Spotify',
    'apple-music': 'Apple Music',
    'amazon-music': 'Amazon Music',
    qobuz: 'Qobuz',
    bandcamp: 'Bandcamp',
    soundcloud: 'SoundCloud',
    external: 'provider',
  };

  const state = {
    // Seed the release guard from the six-song boot map. This makes the first
    // tap synchronous instead of waiting for the full playback manifest graph.
    sources: { ...(window.GARBA_BOOT_PLAYBACK || {}) },
    ready: false,
    loading: null,
    active: false,
  };

  async function fetchJson(path) {
    try {
      const response = await fetch(path, { cache: 'no-store' });
      return response.ok ? await response.json() : null;
    } catch {
      return null;
    }
  }

  function currentSongId() {
    return new URLSearchParams(location.search).get('song');
  }

  function currentSource() {
    return state.sources[currentSongId()] || window.GARBA_BOOT_PLAYBACK?.[currentSongId()] || null;
  }

  function isReleaseFallback(source) {
    return String(source?.sourceType || '').toLowerCase() === 'verified-release-source';
  }

  function isInteractiveTarget(target) {
    return target instanceof Element && Boolean(target.closest(
      'button, a[href], input, textarea, select, summary, iframe, [contenteditable="true"], [role="button"], [role="link"]'
    ));
  }

  function providerName(provider = '') {
    const key = String(provider).toLowerCase();
    return providerNames[key] || key.replace(/(^|-)([a-z])/g, (_, prefix, letter) => `${prefix ? ' ' : ''}${letter.toUpperCase()}`) || 'provider';
  }

  function announce(message) {
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add('show');
    clearTimeout(announce.timer);
    announce.timer = setTimeout(() => toast.classList.remove('show'), 2400);
  }

  function ensureStage() {
    let stage = document.getElementById('providerStage');
    if (stage) return stage;

    stage = document.createElement('section');
    stage.id = 'providerStage';
    stage.className = 'provider-dock';
    stage.setAttribute('aria-label', 'Verified provider source');
    stage.setAttribute('aria-hidden', 'true');
    stage.innerHTML = `
      <div class="provider-media" id="providerMedia"></div>
      <div class="provider-dock-bar">
        <span id="providerDockNote">Verified release</span>
        <button type="button" id="providerDockStop" aria-label="Close provider source">Close</button>
      </div>`;
    document.body.append(stage);
    return stage;
  }

  function releaseEmbed(source) {
    const provider = String(source?.provider || '').toLowerCase();
    const sourceUrl = String(source?.sourceUrl || '');

    try {
      if (provider === 'spotify' && sourceUrl) {
        const url = new URL(sourceUrl);
        const parts = url.pathname.split('/').filter(Boolean).filter((part) => !part.startsWith('intl-'));
        const index = parts.findIndex((part) => ['track', 'album', 'playlist', 'episode', 'show'].includes(part));
        if (index >= 0 && parts[index + 1]) {
          return {
            src: `https://open.spotify.com/embed/${parts[index]}/${parts[index + 1]}?utm_source=generator&theme=0`,
            title: 'Spotify verified release',
            className: 'is-spotify',
            allow: 'autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture',
          };
        }
      }

      if (provider === 'apple-music' && sourceUrl) {
        const url = new URL(sourceUrl);
        if (url.hostname === 'music.apple.com' || url.hostname.endsWith('.music.apple.com')) {
          url.hostname = 'embed.music.apple.com';
          return {
            src: url.toString(),
            title: 'Apple Music verified release',
            className: 'is-apple',
            allow: 'autoplay *; encrypted-media *; fullscreen *',
          };
        }
      }

      if (provider === 'youtube' && source?.videoId) {
        const params = new URLSearchParams({ playsinline: '1', controls: '1', rel: '0' });
        return {
          src: `https://www.youtube-nocookie.com/embed/${encodeURIComponent(source.videoId)}?${params.toString()}`,
          title: 'YouTube verified release',
          className: 'is-youtube-release',
          allow: 'autoplay; encrypted-media; picture-in-picture',
        };
      }
    } catch {
      return null;
    }

    return null;
  }

  function restoreStageStop(stage) {
    const stop = stage?.querySelector('#providerDockStop');
    if (!stop) return;
    stop.textContent = 'Stop';
    stop.setAttribute('aria-label', 'Stop embedded playback');
  }

  function closeRelease() {
    if (!state.active) return false;
    const stage = document.getElementById('providerStage');
    const media = document.getElementById('providerMedia');
    stage?.classList.remove('open', 'is-release', 'is-spotify', 'is-apple', 'is-youtube-release', 'is-external');
    stage?.setAttribute('aria-hidden', 'true');
    media?.replaceChildren();
    restoreStageStop(stage);
    state.active = false;
    return true;
  }

  function openRelease(source) {
    if (!navigator.onLine) {
      announce('You are offline. Verified release sources need an internet connection.');
      return;
    }

    audio?.pause();
    const stage = ensureStage();
    const media = stage.querySelector('#providerMedia');
    const note = stage.querySelector('#providerDockNote');
    const stop = stage.querySelector('#providerDockStop');
    const name = providerName(source.provider);
    const title = String(songTitle?.textContent || 'this track').trim();

    stage.classList.remove('is-spotify', 'is-apple', 'is-youtube-release', 'is-external');
    stage.classList.add('open', 'is-release');
    stage.setAttribute('aria-hidden', 'false');
    if (note) note.textContent = `Verified release on ${name} · select “${title}”`;
    if (stop) {
      stop.textContent = 'Close';
      stop.setAttribute('aria-label', 'Close verified release source');
    }

    const embed = releaseEmbed(source);
    if (embed) {
      stage.classList.add(embed.className);
      const iframe = document.createElement('iframe');
      iframe.title = embed.title;
      iframe.src = embed.src;
      iframe.allow = embed.allow;
      iframe.loading = 'eager';
      iframe.referrerPolicy = 'strict-origin-when-cross-origin';
      if (String(source.provider).toLowerCase() === 'youtube') iframe.setAttribute('allowfullscreen', '');
      media.replaceChildren(iframe);
    } else {
      stage.classList.add('is-external');
      const card = document.createElement('div');
      card.className = 'provider-external';
      const heading = document.createElement('strong');
      heading.textContent = `Verified release on ${name}`;
      const copy = document.createElement('span');
      copy.textContent = `GARBA has verified the release containing “${title}”, but not a song-specific stream. Open the provider and select the track there.`;
      card.append(heading, copy);
      if (source.sourceUrl) {
        const action = document.createElement('a');
        action.className = 'provider-external-action';
        action.href = source.sourceUrl;
        action.target = '_blank';
        action.rel = 'noopener';
        action.textContent = `Open ${name}`;
        card.append(action);
      }
      media.replaceChildren(card);
    }

    state.active = true;
  }

  function routeRelease(source = currentSource()) {
    if (audio?.getAttribute('src')) return false;
    if (!isReleaseFallback(source)) return false;
    openRelease(source);
    return true;
  }

  function interceptPlay(event) {
    const button = event.target.closest?.('#playButton, #miniPlay');
    if (!button || audio?.getAttribute('src')) return;

    const source = currentSource();

    // Crucial first-tap rule: never swallow a Play gesture merely because the
    // full source manifests are still hydrating. Boot routes already tell us
    // whether the current song is a release fallback. Non-release and unknown
    // routes pass straight through to the normal in-app playback bridge.
    if (!isReleaseFallback(source)) return;

    event.preventDefault();
    event.stopImmediatePropagation();
    routeRelease(source);
  }

  function interceptSpace(event) {
    if (event.code !== 'Space' || event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return;
    if (isInteractiveTarget(event.target)) return;
    if (audio?.getAttribute('src')) return;

    const source = currentSource();
    if (!isReleaseFallback(source)) return;

    event.preventDefault();
    event.stopImmediatePropagation();
    routeRelease(source);
  }

  function interceptProviderStop(event) {
    if (!state.active || !event.target.closest?.('#providerDockStop')) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    closeRelease();
  }

  async function loadSources() {
    const index = await fetchJson('data/catalogue/index.json');
    const configured = index?.playbackSources || [
      'data/playback-sources-generated.json',
      'data/playback-sources.json',
      'data/playback-sources-current.json',
    ];
    const paths = Array.isArray(configured) ? configured : [configured];
    const manifests = await Promise.all(paths.filter(Boolean).map(fetchJson));
    state.sources = {
      ...(window.GARBA_BOOT_PLAYBACK || {}),
      ...Object.assign({}, ...manifests.map((manifest) => manifest?.songSources || {})),
    };
    state.ready = true;
  }

  window.addEventListener('click', interceptProviderStop, true);
  window.addEventListener('click', interceptPlay, true);
  window.addEventListener('keydown', interceptSpace, true);

  if (songTitle) {
    new MutationObserver(closeRelease).observe(songTitle, { childList: true, characterData: true, subtree: true });
  }
  if (songSheet) {
    new MutationObserver(() => {
      if (songSheet.getAttribute('aria-hidden') === 'false' && matchMedia('(max-width: 700px)').matches) closeRelease();
    }).observe(songSheet, { attributes: true, attributeFilter: ['aria-hidden'] });
  }
  window.addEventListener('offline', () => {
    if (closeRelease()) announce('Offline. Verified release playback paused until you reconnect.');
  });

  state.loading = loadSources().catch(() => { state.ready = true; });
  window.GARBA_RELEASE_GUARD = {
    get ready() { return state.ready; },
    sourceFor(songId) { return state.sources[songId] || window.GARBA_BOOT_PLAYBACK?.[songId] || null; },
    isReleaseFallback,
    closeActive: closeRelease,
    routeCurrent() { return routeRelease(currentSource()); },
  };
})();
