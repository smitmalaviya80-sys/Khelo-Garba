(function attachCatalogueOrdering(root) {
  'use strict';

  const VALID_MODES = new Set(['popular', 'newest', 'oldest']);
  const PRESERVE_SOURCE_ORDER_CONTEXTS = new Set([
    'release',
    'selected-release',
    'nonstop',
    'continuous',
    'continuous-set',
    'search',
    'queue',
    'history',
    'user',
    'user-defined',
  ]);

  const UNKNOWN_TIER = Number.MAX_SAFE_INTEGER;

  function finiteNumber(value) {
    if (value === null || value === undefined || value === '') return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }

  function normaliseText(value = '') {
    return String(value ?? '')
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9\u0a80-\u0aff]+/g, ' ')
      .trim();
  }

  function canonicalId(song) {
    return String(song?.id || song?.songId || song?.canonicalId || '').trim();
  }

  function stableKey(song, sourceIndex) {
    const title = normaliseText(song?.displayTitle || song?.title || '');
    const artist = normaliseText(song?.artist || '');
    const id = normaliseText(canonicalId(song));
    return [title, artist, id, String(sourceIndex).padStart(8, '0')];
  }

  function compareStableKeys(left, right) {
    const leftKey = left.stableKey;
    const rightKey = right.stableKey;
    for (let index = 0; index < leftKey.length; index += 1) {
      if (leftKey[index] < rightKey[index]) return -1;
      if (leftKey[index] > rightKey[index]) return 1;
    }
    return 0;
  }

  function resolveFromMap(mapLike, song) {
    if (!mapLike) return undefined;
    const id = canonicalId(song);
    if (!id) return undefined;
    if (typeof mapLike?.get === 'function') return mapLike.get(id);
    if (typeof mapLike === 'object') return mapLike[id];
    return undefined;
  }

  function resolveAvailabilityTier(song, options) {
    const fromResolver = typeof options.getAvailabilityTier === 'function'
      ? options.getAvailabilityTier(song)
      : resolveFromMap(options.availabilityTierById, song);
    const tier = finiteNumber(fromResolver);
    return tier === null ? UNKNOWN_TIER : tier;
  }

  function resolvePopularityRank(song, options) {
    const fromResolver = typeof options.getPopularityRank === 'function'
      ? options.getPopularityRank(song)
      : resolveFromMap(options.popularityRankById, song);
    const rank = finiteNumber(fromResolver ?? song?.popularityRank);
    return rank === null ? null : rank;
  }

  function releaseDateValue(value) {
    if (value === null || value === undefined || value === '') return null;

    const direct = finiteNumber(value);
    if (direct !== null) {
      if (Number.isInteger(direct) && direct >= 1000 && direct <= 9999) return direct * 10000;
      return direct;
    }

    const text = String(value).trim();
    const iso = text.match(/^(\d{4})(?:-(\d{2})(?:-(\d{2}))?)?/);
    if (iso) {
      const year = Number(iso[1]);
      const month = Number(iso[2] || 0);
      const day = Number(iso[3] || 0);
      if (month >= 0 && month <= 12 && day >= 0 && day <= 31) {
        return (year * 10000) + (month * 100) + day;
      }
    }

    return null;
  }

  function resolveChronology(song, options) {
    const fromResolver = typeof options.getChronology === 'function'
      ? options.getChronology(song)
      : resolveFromMap(options.chronologyById, song);
    const explicit = releaseDateValue(fromResolver);
    if (explicit !== null) return explicit;

    const originalYear = releaseDateValue(song?.originalReleaseYear);
    if (originalYear !== null) return originalYear;

    return releaseDateValue(song?.releaseDate);
  }

  function decoratedSongs(songs, options) {
    return songs.map((song, sourceIndex) => ({
      song,
      sourceIndex,
      availabilityTier: resolveAvailabilityTier(song, options),
      popularityRank: resolvePopularityRank(song, options),
      chronology: resolveChronology(song, options),
      stableKey: stableKey(song, sourceIndex),
    }));
  }

  function compareAvailability(left, right) {
    return left.availabilityTier - right.availabilityTier;
  }

  function comparePopularity(left, right) {
    const leftKnown = left.popularityRank !== null;
    const rightKnown = right.popularityRank !== null;
    if (leftKnown !== rightKnown) return leftKnown ? -1 : 1;
    if (!leftKnown) return 0;
    return left.popularityRank - right.popularityRank;
  }

  function compareChronology(left, right, direction) {
    const leftKnown = left.chronology !== null;
    const rightKnown = right.chronology !== null;
    if (leftKnown !== rightKnown) return leftKnown ? -1 : 1;
    if (!leftKnown) return 0;
    return direction * (left.chronology - right.chronology);
  }

  function compareByMode(left, right, mode) {
    if (mode === 'popular') return comparePopularity(left, right);
    if (mode === 'newest') return compareChronology(left, right, -1);
    return compareChronology(left, right, 1);
  }

  function orderCatalogueSongs(songs, options = {}) {
    if (!Array.isArray(songs)) {
      throw new TypeError('orderCatalogueSongs expects an array of songs.');
    }

    const context = String(options.context || 'browse').trim().toLowerCase();
    if (PRESERVE_SOURCE_ORDER_CONTEXTS.has(context)) return songs.slice();

    const mode = String(options.mode || 'popular').trim().toLowerCase();
    if (!VALID_MODES.has(mode)) {
      throw new RangeError(`Unsupported catalogue sort mode: ${mode}`);
    }

    const availabilityGate = options.availabilityGate !== false;
    const decorated = decoratedSongs(songs, options);

    decorated.sort((left, right) => {
      if (availabilityGate) {
        const availability = compareAvailability(left, right);
        if (availability) return availability;
      }

      const selectedMode = compareByMode(left, right, mode);
      if (selectedMode) return selectedMode;

      return compareStableKeys(left, right);
    });

    return decorated.map(({ song }) => song);
  }

  root.PlayGarbaCatalogueOrdering = Object.freeze({
    modes: Object.freeze([...VALID_MODES]),
    preserveSourceOrderContexts: Object.freeze([...PRESERVE_SOURCE_ORDER_CONTEXTS]),
    orderCatalogueSongs,
  });
})(typeof globalThis !== 'undefined' ? globalThis : window);
