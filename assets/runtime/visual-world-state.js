(() => {
  const base = 'assets/backgrounds/library/';
  const library = Object.freeze({
    traditional: Object.freeze([
      '11-master-dark-courtyard.webp',
      '15-traditional-canopy-courtyard.webp',
      '13-traditional-marigold-courtyard.webp',
      '09-warm-stage-courtyard.webp',
    ]),
    dandiya: Object.freeze([
      '10-dandiya-silhouette-courtyard.webp',
      '07-dandiya-purple-courtyard.webp',
    ]),
    devotional: Object.freeze([
      '03-devotional-garba-courtyard.webp',
    ]),
    folk: Object.freeze([
      '14-gujarati-folk-courtyard.webp',
      '02-rhythmic-drums-courtyard-a.webp',
      '12-rhythmic-drums-courtyard-b.webp',
    ]),
    sanedo: Object.freeze([
      '08-colourful-garba-courtyard-b.webp',
      '04-colourful-garba-courtyard-a.webp',
    ]),
    fusion: Object.freeze([
      '05-fusion-gujarati-neon.webp',
      '06-fusion-abstract-neon.webp',
      '01-bollywood-garba-courtyard.webp',
    ]),
  });

  // Inventory metadata only. Artwork is fetched by syncNow() when it becomes the
  // selected visual world; enumerating this list must never imply preloading it.
  const allAssets = Object.freeze(
    Object.values(library).flat().map((filename) => `${base}${filename}`)
  );
  const loaded = new Set();
  const loading = new Map();
  let syncToken = 0;
  let syncScheduled = false;

  function hash(value = '') {
    let result = 2166136261;
    for (let index = 0; index < value.length; index += 1) {
      result ^= value.charCodeAt(index);
      result = Math.imul(result, 16777619);
    }
    return result >>> 0;
  }

  function currentGenreId() {
    const appGenre = document.getElementById('app')?.dataset.genre;
    if (appGenre && library[appGenre]) return appGenre;
    const queryGenre = new URLSearchParams(location.search).get('genre');
    return queryGenre && library[queryGenre] ? queryGenre : 'traditional';
  }

  function currentSongSeed() {
    const params = new URLSearchParams(location.search);
    const songId = String(params.get('song') || '').trim();
    if (songId) return songId;

    const title = String(document.getElementById('songTitle')?.textContent || '').trim();
    const artist = String(document.getElementById('songArtist')?.textContent || '').trim();
    return title ? `${title}|${artist}` : '';
  }

  function candidateFor(genreId = currentGenreId(), songSeed = currentSongSeed()) {
    const candidates = library[genreId] || [];
    if (!candidates.length) return null;
    const index = songSeed ? hash(`${genreId}:${songSeed}`) % candidates.length : 0;
    return `${base}${candidates[index]}`;
  }

  function fallbackFor(genreId) {
    return `assets/backgrounds/${genreId}.svg`;
  }

  function loadImage(url, { highPriority = false } = {}) {
    if (!url) return Promise.resolve(false);
    if (loaded.has(url)) return Promise.resolve(true);
    if (loading.has(url)) return loading.get(url);

    const promise = new Promise((resolve) => {
      const image = new Image();
      image.decoding = 'async';
      if ('fetchPriority' in image) image.fetchPriority = highPriority ? 'high' : 'auto';
      image.onload = async () => {
        try { await image.decode?.(); } catch { /* loaded pixels are already usable */ }
        loaded.add(url);
        loading.delete(url);
        resolve(true);
      };
      image.onerror = () => {
        loading.delete(url);
        resolve(false);
      };
      image.src = url;
    });

    loading.set(url, promise);
    return promise;
  }

  function visibleWorldLayer() {
    return document.querySelector('.world-layer.is-visible') || document.getElementById('worldA');
  }

  async function syncNow() {
    syncScheduled = false;
    const token = ++syncToken;
    const genreId = currentGenreId();
    const candidate = candidateFor(genreId);
    if (!candidate) return;

    // Only the artwork selected for the current state is fetched eagerly. A new
    // candidate is requested after a real genre/song/navigation change, so the
    // 15-image 2K library is never warmed speculatively in the background.
    const ready = await loadImage(candidate, { highPriority: true });
    if (!ready || token !== syncToken) return;

    // The player can cross-fade world layers one frame after a genre change.
    // Wait through that frame, then write only to whichever layer is truly visible.
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    if (token !== syncToken || genreId !== currentGenreId()) return;

    const layer = visibleWorldLayer();
    if (!layer) return;

    const fallback = fallbackFor(genreId);
    layer.style.setProperty(
      'background-image',
      `url("${candidate}"), url("${fallback}")`,
      'important'
    );
    layer.style.setProperty('background-size', 'cover', 'important');
    layer.style.setProperty('background-position', 'center center', 'important');
    layer.style.setProperty('background-repeat', 'no-repeat', 'important');
    layer.dataset.backgroundQuality = '2k-webp';
    layer.dataset.backgroundAsset = candidate.slice(base.length);
  }

  function scheduleSync() {
    if (syncScheduled) return;
    syncScheduled = true;
    queueMicrotask(syncNow);
  }

  function patchHistory() {
    for (const method of ['replaceState', 'pushState']) {
      const original = history[method];
      if (typeof original !== 'function' || original.__garbaVisualWrapped) continue;
      const wrapped = function (...args) {
        const result = original.apply(this, args);
        scheduleSync();
        return result;
      };
      Object.defineProperty(wrapped, '__garbaVisualWrapped', { value: true });
      history[method] = wrapped;
    }
  }

  function observePlayer() {
    const app = document.getElementById('app');
    if (app) {
      new MutationObserver(scheduleSync).observe(app, {
        attributes: true,
        attributeFilter: ['data-genre'],
      });
    }

    const world = document.querySelector('.world');
    if (world) {
      new MutationObserver(scheduleSync).observe(world, {
        subtree: true,
        attributes: true,
        attributeFilter: ['class'],
      });
    }

    for (const id of ['songTitle', 'songArtist']) {
      const node = document.getElementById(id);
      if (!node) continue;
      new MutationObserver(scheduleSync).observe(node, {
        childList: true,
        characterData: true,
        subtree: true,
      });
    }
  }

  window.GARBA_VISUAL_WORLDS = Object.freeze({
    base,
    library,
    allAssets,
    candidateFor,
    sync: scheduleSync,
  });

  patchHistory();
  observePlayer();
  window.addEventListener('popstate', scheduleSync);
  window.addEventListener('pageshow', scheduleSync);
  window.addEventListener('garba:catalogue-ready', scheduleSync);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') scheduleSync();
  });

  scheduleSync();
})();
