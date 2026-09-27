const CANONICAL_ID_RE = /^[A-Za-z0-9._:-]{1,128}$/;
const WORLDS = new Set(['traditional', 'dandiya', 'devotional', 'folk', 'sanedo', 'fusion']);
const SEARCH_SETTLE_MS = 550;

const cleanQuery = (value = '') => String(value).trim();
const safeId = (value) => typeof value === 'string' && CANONICAL_ID_RE.test(value) ? value : '';
const safeWorld = (value) => typeof value === 'string' && WORLDS.has(value) ? value : '';

async function loadProductionBridge() {
  try {
    const [{ createTelemetry }, { createProductTelemetryBridge }] = await Promise.all([
      import('../pga/telemetry/index.js'),
      import('../pga/telemetry/product-bridge.js'),
    ]);
    const telemetry = createTelemetry({ initialSurface: 'explore' });
    return createProductTelemetryBridge(telemetry);
  } catch {
    return null;
  }
}

export function createExploreTelemetryAdapter({ loadBridge = loadProductionBridge } = {}) {
  let bridge = null;
  let bridgePromise = null;
  let surfaceAttempted = false;
  let searchGeneration = 0;
  let lastInputQuery = '';
  let lastSettledQuery = '';
  let activeSearch = null;

  function ensureBridge() {
    if (bridge) return Promise.resolve(bridge);
    if (!bridgePromise) {
      bridgePromise = Promise.resolve()
        .then(() => loadBridge())
        .then((value) => {
          bridge = value && typeof value === 'object' ? value : null;
          return bridge;
        })
        .catch(() => null);
    }
    return bridgePromise;
  }

  async function warm() {
    const ready = await ensureBridge();
    if (!ready || surfaceAttempted) return Boolean(ready);
    surfaceAttempted = true;
    try {
      ready.surfaceViewed?.({ surface: 'explore', entryPoint: 'unknown' });
    } catch {
      // Analytics must never break Explore.
    }
    return true;
  }

  function beginSearchInput(query) {
    const next = cleanQuery(query);
    if (next === lastInputQuery) return searchGeneration;
    lastInputQuery = next;
    searchGeneration += 1;
    activeSearch = null;
    if (!next) lastSettledQuery = '';
    return searchGeneration;
  }

  async function settleSearch({ query, resultCount, generation } = {}) {
    const next = cleanQuery(query);
    if (!next || generation !== searchGeneration || next !== lastInputQuery) return null;
    if (next === lastSettledQuery) return activeSearch?.query === next ? activeSearch.id : null;

    const ready = await ensureBridge();
    if (!ready || generation !== searchGeneration || next !== lastInputQuery) return null;

    let searchId = null;
    try {
      searchId = safeId(ready.searchSubmitted?.({ searchTerm: next }));
    } catch {
      searchId = null;
    }
    if (!searchId || generation !== searchGeneration || next !== lastInputQuery) return null;

    lastSettledQuery = next;
    activeSearch = { id: searchId, query: next, generation };
    if (Number(resultCount) === 0) {
      try {
        ready.searchZeroResults?.({ searchId });
      } catch {
        // Analytics must never break Explore.
      }
    }
    return searchId;
  }

  function recordSongSelection({ songId, world, fromSearch = false, searchQuery = '' } = {}) {
    const canonicalSongId = safeId(songId);
    if (!bridge || !canonicalSongId) return false;

    try {
      if (fromSearch) {
        const query = cleanQuery(searchQuery);
        if (!activeSearch || activeSearch.query !== query || activeSearch.generation !== searchGeneration) return false;
        return bridge.searchResultSelected?.({
          searchId: activeSearch.id,
          contentType: 'song',
          contentId: canonicalSongId,
          world: safeWorld(world),
        }) === true;
      }
      return bridge.collectionSelected?.({
        contentType: 'song',
        contentId: canonicalSongId,
        world: safeWorld(world),
      }) === true;
    } catch {
      return false;
    }
  }

  function recordReleaseSelection({ releaseId, fromSearch = false } = {}) {
    const canonicalReleaseId = safeId(releaseId);
    if (!bridge || !canonicalReleaseId || fromSearch) return false;
    try {
      return bridge.collectionSelected?.({
        contentType: 'release',
        contentId: canonicalReleaseId,
      }) === true;
    } catch {
      return false;
    }
  }

  return {
    warm,
    beginSearchInput,
    settleSearch,
    recordSongSelection,
    recordReleaseSelection,
    get activeSearch() {
      return activeSearch ? { ...activeSearch } : null;
    },
  };
}

function queryFromHash(locationObj) {
  try {
    return cleanQuery(new URLSearchParams(String(locationObj?.hash || '').replace(/^#/, '')).get('search') || '');
  } catch {
    return '';
  }
}

function songIdentityFromLink(link, locationObj) {
  try {
    const url = new URL(link.getAttribute('href') || '', locationObj?.href || undefined);
    if (locationObj?.origin && url.origin !== locationObj.origin) return null;
    const songId = safeId(url.searchParams.get('song'));
    if (!songId) return null;
    return {
      songId,
      world: safeWorld(url.searchParams.get('genre')),
    };
  } catch {
    return null;
  }
}

export function installExploreTelemetry({
  documentObj = globalThis.document,
  windowObj = globalThis.window,
  adapter = createExploreTelemetryAdapter(),
  settleMs = SEARCH_SETTLE_MS,
} = {}) {
  if (!documentObj || !windowObj) return null;
  const input = documentObj.getElementById('catalogueSearch');
  const songList = documentObj.getElementById('catalogueSongList');
  if (!input || !songList) return null;

  let searchTimer = 0;

  const scheduleWarm = () => {
    if (documentObj.visibilityState === 'hidden') return;
    const run = () => { void adapter.warm(); };
    if (typeof windowObj.requestIdleCallback === 'function') {
      windowObj.requestIdleCallback(run, { timeout: 1_500 });
    } else {
      windowObj.setTimeout(run, 0);
    }
  };

  if (documentObj.readyState === 'complete') scheduleWarm();
  else windowObj.addEventListener('load', scheduleWarm, { once: true });
  documentObj.addEventListener('visibilitychange', () => {
    if (documentObj.visibilityState === 'visible') scheduleWarm();
  }, { passive: true });

  input.addEventListener('input', (event) => {
    if (event.isTrusted !== true) return;
    const query = cleanQuery(input.value);
    const generation = adapter.beginSearchInput(query);
    windowObj.clearTimeout(searchTimer);
    searchTimer = 0;
    if (!query) return;

    searchTimer = windowObj.setTimeout(() => {
      if (cleanQuery(input.value) !== query) return;
      const resultCount = songList.querySelector('.song-row') ? 1 : 0;
      void adapter.settleSearch({ query, resultCount, generation });
    }, settleMs);
  }, { passive: true });

  documentObj.addEventListener('click', (event) => {
    if (event.isTrusted !== true) return;
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;

    const playLink = target.closest('a.play-link[href]');
    if (playLink) {
      const identity = songIdentityFromLink(playLink, windowObj.location);
      if (!identity) return;
      const hashQuery = queryFromHash(windowObj.location);
      adapter.recordSongSelection({
        ...identity,
        fromSearch: Boolean(hashQuery),
        searchQuery: cleanQuery(input.value),
      });
      return;
    }

    const releaseCard = target.closest('.release-card[data-release-id]');
    if (releaseCard) {
      adapter.recordReleaseSelection({
        releaseId: releaseCard.dataset.releaseId || '',
        fromSearch: Boolean(queryFromHash(windowObj.location)),
      });
    }
  }, { capture: true, passive: true });

  return adapter;
}

if (typeof document !== 'undefined' && typeof window !== 'undefined') {
  installExploreTelemetry();
}
