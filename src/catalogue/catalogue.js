import '../../assets/runtime/route-readiness.js';
import { normalizeSearchText, rankSearchRecords } from '../../assets/runtime/search-core.js';

const { routeReadiness } = window.GARBA_ROUTE_READINESS;

function fallbackPlayableFirstOrder(songs, { context = 'browse', getAvailabilityTier } = {}) {
  const source = Array.isArray(songs) ? [...songs] : [];
  if (['selected-release', 'search', 'nonstop', 'continuous', 'queue', 'history', 'user-order'].includes(context)) return source;
  if (typeof getAvailabilityTier !== 'function') return source;
  return source
    .map((song, index) => ({ song, index, tier: Number(getAvailabilityTier(song)) || 0 }))
    .sort((a, b) => a.tier - b.tier || a.index - b.index)
    .map(({ song }) => song);
}

const orderCatalogueSongs = globalThis.PlayGarbaCatalogueOrdering?.orderCatalogueSongs || fallbackPlayableFirstOrder;

const paths = {
  songs: '../data/songs.json',
  releases: '../data/releases.json',
  genres: '../data/genres.json',
  taxonomy: '../data/taxonomy.json',
  catalogueIndex: '../data/catalogue/index.json',
  artwork: '../data/release-artwork.json',
  curation: '../data/catalogue-curation.json',
};

const visualByGenre = {
  traditional: '../assets/backgrounds/library/15-traditional-canopy-courtyard.webp',
  dandiya: '../assets/backgrounds/library/10-dandiya-silhouette-courtyard.webp',
  devotional: '../assets/backgrounds/library/03-devotional-garba-courtyard.webp',
  folk: '../assets/backgrounds/library/14-gujarati-folk-courtyard.webp',
  sanedo: '../assets/backgrounds/library/04-colourful-garba-courtyard-a.webp',
  fusion: '../assets/backgrounds/library/05-fusion-gujarati-neon.webp',
};

const BASE_DOCUMENT_TITLE = 'Explore Gujarati Garba · PlayGarba';
const $ = (id) => document.getElementById(id);
const main = document.querySelector('main');
const els = {
  search: $('catalogueSearch'),
  count: $('catalogueCount'),
  sections: $('catalogueSections'),
  home: $('collectionHome'),
  detail: $('collectionDetail'),
  back: $('backToCollections'),
  share: null,
  status: null,
  detailKicker: $('detailKicker'),
  detailTitle: $('detailTitle'),
  detailDescription: $('detailDescription'),
  detailMeta: $('detailMeta'),
  releaseSection: $('releaseSection'),
  releaseRail: $('releaseRail'),
  showAllSongs: $('showAllSongs'),
  songSectionTitle: $('songSectionTitle'),
  songCount: $('songCount'),
  sort: $('catalogueSort'),
  sortField: $('catalogueSortField'),
  songList: $('catalogueSongList'),
  cardTemplate: $('collectionCardTemplate'),
};

const state = {
  songs: [],
  releases: [],
  genres: [],
  taxonomy: [],
  taxonomyById: new Map(),
  artists: [],
  artwork: {},
  curation: {},
  releaseById: new Map(),
  releaseRedirects: new Map(),
  collections: [],
  active: null,
  activeSongs: [],
  activeReleaseId: null,
  eventsWired: false,
  loadFailed: false,
  returnFocusTarget: null,
  sortMode: 'playable-first',
};

const SONG_BATCH_SIZE = 160;
const RELEASE_BATCH_SIZE = 40;
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const motionBehavior = () => reducedMotion.matches ? 'auto' : 'smooth';

const normalise = (value = '') => String(value)
  .normalize('NFKD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/[^a-z0-9\u0a80-\u0aff]+/g, ' ')
  .trim();

const formatDuration = (seconds) => {
  const total = Number(seconds);
  if (!Number.isFinite(total) || total <= 0) return '';
  return `${Math.floor(total / 60)}:${String(Math.round(total % 60)).padStart(2, '0')}`;
};
const pluralize = (count, singular, plural = `${singular}s`) =>
  `${Number(count || 0).toLocaleString()} ${Number(count) === 1 ? singular : plural}`;

function cleanArtistCredits(credit = '') {
  if (!credit) return '';
  const parts = String(credit).split(/\s*,\s*|\s+&\s+|\s+and\s+/i);
  const seen = new Set();
  const cleaned = [];
  for (const part of parts) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    cleaned.push(trimmed);
  }
  return cleaned.join(', ');
}
const releaseYear = (release) => Number(release?.originalReleaseYear || String(release?.releaseDate || '').slice(0, 4)) || 0;
const displayTitle = (entity) => String(entity?.displayTitle || entity?.title || '').trim();
const aliasesFor = (entity) => Array.isArray(entity?.aliases) ? entity.aliases.filter(Boolean) : [];
const taxonomyIdsForSong = (song) => [...new Set([song?.category, ...(Array.isArray(song?.taxonomyStyles) ? song.taxonomyStyles : [])].filter(Boolean))];
const taxonomyLabel = (id) => state.taxonomyById.get(id)?.label || id || '';
const songHasTaxonomy = (song, ids) => {
  const wanted = ids instanceof Set ? ids : new Set(ids);
  return taxonomyIdsForSong(song).some((id) => wanted.has(id));
};
const browseVisualGenres = (song) => {
  const genres = new Set(song?.genre ? [song.genre] : []);
  taxonomyIdsForSong(song).forEach((id) => {
    const visualGenre = state.taxonomyById.get(id)?.visualGenre;
    if (visualGenre) genres.add(visualGenre);
  });
  return genres;
};
const belongsToVisualGenre = (song, genreId) => browseVisualGenres(song).has(genreId);

const allSongText = (song, release) => normalise([
  song.title,
  song.displayTitle,
  ...aliasesFor(song),
  song.artist,
  song.description,
  song.story,
  song.genre,
  song.category,
  ...taxonomyIdsForSong(song),
  ...(song.styles || []),
  release?.title,
  release?.displayTitle,
  ...aliasesFor(release),
  release?.artist,
  release?.label,
  release?.description,
].filter(Boolean).join(' '));

function songDescription(song, release) {
  const editorial = String(song?.description || song?.story || '').trim();
  if (editorial) return editorial;

  const title = displayTitle(song) || 'This track';
  const artist = String(song?.artist || '').trim();
  const primaryTaxonomy = taxonomyLabel(song?.category);
  const releaseTitle = displayTitle(release);
  const year = releaseYear(release);
  const label = String(release?.label || '').trim();
  const sentences = [];

  if (artist && primaryTaxonomy) sentences.push(`${title} is a ${primaryTaxonomy} catalogue track credited to ${artist}.`);
  else if (artist) sentences.push(`${title} is credited to ${artist}.`);
  else if (primaryTaxonomy) sentences.push(`${title} is catalogued as ${primaryTaxonomy}.`);

  if (releaseTitle) {
    const releaseParts = [year || null, label || null].filter(Boolean).join(' · ');
    sentences.push(`It appears on ${releaseTitle}${releaseParts ? ` (${releaseParts})` : ''}.`);
  }

  const secondary = taxonomyIdsForSong(song).slice(1).map(taxonomyLabel).filter(Boolean);
  if (secondary.length) sentences.push(`Also tagged: ${secondary.join(', ')}.`);
  return sentences.join(' ') || 'Catalogue details are being enriched for this track.';
}

function releaseDescription(release, songs = []) {
  const editorial = String(release?.description || '').trim();
  if (editorial) return editorial;
  const title = displayTitle(release) || 'This release';
  const artist = String(release?.artist || '').trim();
  const year = releaseYear(release);
  const label = String(release?.label || '').trim();
  const songCount = songs.length || Number(release?.songCount) || 0;
  const pieces = [];
  if (artist) pieces.push(`${title} is credited to ${artist}.`);
  const metadata = [year || null, label || null, songCount ? `${songCount} ${songCount === 1 ? 'song' : 'songs'}` : null].filter(Boolean);
  if (metadata.length) pieces.push(metadata.join(' · ') + '.');
  if (release?.live?.isLive && release.live.venue) pieces.push(`Live recording venue: ${release.live.venue}.`);
  return pieces.join(' ') || 'Release details are being enriched in the PlayGarba catalogue.';
}

function ensureShareUi() {
  if (!els.detail) return;
  if (!els.status) {
    const status = document.createElement('p');
    status.id = 'catalogueStatus';
    status.className = 'sr-only';
    status.setAttribute('aria-live', 'polite');
    status.setAttribute('aria-atomic', 'true');
    els.detail.before(status);
    els.status = status;
  }
  if (!els.share) {
    const actions = document.createElement('div');
    actions.className = 'detail-actions';
    const share = document.createElement('button');
    share.id = 'shareCollection';
    share.className = 'share-explore-state';
    share.type = 'button';
    share.textContent = 'Share';
    share.setAttribute('aria-label', 'Share this PlayGarba catalogue');
    actions.append(els.back, share);
    els.detail.prepend(actions);
    els.share = share;
  }
}

function announce(message) {
  if (!els.status) return;
  els.status.textContent = '';
  queueMicrotask(() => { els.status.textContent = message; });
}

function collectionCardFor(id) {
  if (!id) return null;
  return [...document.querySelectorAll('.collection-card')].find((card) => card.dataset.collectionId === id) || null;
}

function searchReturnControl() {
  return document.querySelector('.search-explore') || els.search;
}

function focusDetailHeading() {
  queueMicrotask(() => els.detailTitle?.focus({ preventScroll: true }));
}

function restoreExploreFocus(target) {
  if (!(target instanceof HTMLElement) || !target.isConnected) return;
  queueMicrotask(() => target.focus({ preventScroll: false }));
}

function syncShareLabel(label) {
  if (!els.share) return;
  els.share.setAttribute('aria-label', `Share ${label}`);
  els.share.title = `Share ${label}`;
}

function syncCollectionIdentity() {
  if (!state.active || state.active.id === 'search') return;
  const release = state.activeReleaseId ? state.releaseById.get(state.activeReleaseId) : null;
  if (release) {
    const title = displayTitle(release);
    document.title = `${title} · PlayGarba`;
    syncShareLabel(title);
    return;
  }
  document.title = `${state.active.title} · PlayGarba`;
  syncShareLabel(state.active.title);
}

function replaceDetailMeta(values = []) {
  els.detailMeta.replaceChildren();
  values.filter(Boolean).forEach((value) => {
    const item = document.createElement('span');
    item.textContent = String(value);
    els.detailMeta.append(item);
  });
}

function renderCollectionDetailIdentity(collection = state.active) {
  if (!collection || collection.id === 'search') return;
  els.detailKicker.textContent = collection.kicker;
  els.detailTitle.textContent = collection.title;
  els.detailDescription.textContent = collection.description;
  const releaseCount = new Set(collection.songs.map((song)=>song.releaseId).filter(Boolean)).size;
  replaceDetailMeta([
    pluralize(collection.songs.length, 'song'),
    pluralize(releaseCount, 'release'),
  ]);
}

function renderReleaseDetailIdentity(release, songs) {
  if (!state.active || state.active.id === 'search' || !release) return;
  const year = releaseYear(release);
  els.detailKicker.textContent = `${state.active.title} · Release`;
  els.detailTitle.textContent = displayTitle(release);
  els.detailDescription.textContent = releaseDescription(release, songs);
  replaceDetailMeta([
    year ? String(year) : '',
    `${songs.length.toLocaleString()} ${songs.length === 1 ? 'song' : 'songs'}`,
    'Selected release',
  ]);
}

const EXPLORE_PAGE_DATA_KEY = '__PLAYGARBA_EXPLORE_PAGE_DATA_V1__';
const EXPLORE_PAGE_DATA_EVENT = 'playgarba:explore-page-data-ready';

function createExplorePageDataStore() {
  const resolved = new Map();
  const inFlight = new Map();
  const artistPromises = new Map();
  const coreKeys = new Set([paths.songs, paths.releases, paths.catalogueIndex, paths.artwork]);
  let corePromise = null;

  const fetchJsonOnce = (url, fallback = null) => {
    const key = String(url);
    if (resolved.has(key)) return Promise.resolve(resolved.get(key));
    if (inFlight.has(key)) return inFlight.get(key);

    const request = (async () => {
      try {
        const response = await fetch(key, { cache: 'no-store' });
        if (!response.ok) return fallback;
        const value = await response.json();
        resolved.set(key, value);
        return value;
      } catch {
        return fallback;
      }
    })();
    inFlight.set(key, request);
    void request.finally(() => {
      if (inFlight.get(key) === request) inFlight.delete(key);
    });
    return request;
  };

  const loadCore = () => {
    if (!corePromise) {
      const request = Promise.all([
        fetchJsonOnce(paths.songs, []),
        fetchJsonOnce(paths.releases, []),
        fetchJsonOnce(paths.catalogueIndex, {}),
        fetchJsonOnce(paths.artwork, { releases: {} }),
      ]).then(([songs, releases, index, artwork]) => {
        const result = { songs, releases, index, artwork };
        if ([...coreKeys].some((key) => !resolved.has(String(key))) && corePromise === request) corePromise = null;
        return result;
      }, (error) => {
        if (corePromise === request) corePromise = null;
        throw error;
      });
      corePromise = request;
    }
    return corePromise;
  };

  const loadArtists = async (index = null) => {
    const sourceIndex = index || (await loadCore()).index;
    const files = [...new Set((sourceIndex?.discovery?.artists || []).filter(Boolean))];
    if (!files.length) return [];
    const signature = files.join('\n');
    if (artistPromises.has(signature)) return artistPromises.get(signature);

    const request = Promise.all(files.map((file) => fetchJsonOnce(`../${file}`, null))).then((payloads) => {
      const seen = new Set();
      const artists = payloads
        .flatMap((payload) => payload?.artists || [])
        .filter((artist) => artist?.id && !seen.has(artist.id) && seen.add(artist.id));
      if (payloads.some((payload) => payload == null)) artistPromises.delete(signature);
      return artists;
    });
    artistPromises.set(signature, request);
    return request;
  };

  const invalidate = (url) => {
    const key = String(url);
    resolved.delete(key);
    if (coreKeys.has(key)) corePromise = null;
  };

  return Object.freeze({ fetchJson: fetchJsonOnce, loadCore, loadArtists, invalidate });
}

const explorePageData = window[EXPLORE_PAGE_DATA_KEY] || createExplorePageDataStore();
if (!window[EXPLORE_PAGE_DATA_KEY]) {
  Object.defineProperty(window, EXPLORE_PAGE_DATA_KEY, {
    configurable: false,
    enumerable: false,
    writable: false,
    value: explorePageData,
  });
}
window.dispatchEvent(new Event(EXPLORE_PAGE_DATA_EVENT));

async function fetchJson(url, fallback = null) {
  return explorePageData.fetchJson(url, fallback);
}

async function loadArtists(index) {
  return explorePageData.loadArtists(index);
}

function richerRelease(existing, candidate) {
  if (!existing) return candidate;
  const score = (release) => {
    const artist = String(release?.artist || '');
    return (normalise(artist) !== 'various artists' ? 10 : 0)
      + Math.min(artist.length, 120) / 20
      + (Array.isArray(release?.sources) ? release.sources.length : 0)
      + (release?.label ? 1 : 0)
      + (release?.releaseDate ? 1 : 0);
  };
  return score(candidate) > score(existing) ? candidate : existing;
}

function buildReleaseIndex(rows) {
  const map = new Map();
  rows.forEach((release) => {
    if (!release?.id) return;
    map.set(release.id, richerRelease(map.get(release.id), release));
  });
  return map;
}

function includesTerm(song, release, terms) {
  const text = allSongText(song, release);
  return terms.some((term) => text.includes(normalise(term)));
}

function artistCreditMatches(creditValue, names) {
  const credit = normalise(creditValue);
  if (!credit) return false;
  const paddedCredit = ` ${credit} `;
  return names.some((name) => name && paddedCredit.includes(` ${name} `));
}

function trustedTrackNumber(song) {
  const value = Number(song?.trackNumber);
  return Number.isInteger(value) && value > 0 ? value : null;
}

function trustedReleaseSequence(songs) {
  if (!Array.isArray(songs) || !songs.length) return null;
  const pairs = songs.map((song) => ({ song, trackNumber: trustedTrackNumber(song) }));
  if (pairs.some(({ trackNumber }) => trackNumber == null)) return null;
  const unique = new Set(pairs.map(({ trackNumber }) => trackNumber));
  if (unique.size !== pairs.length) return null;
  return pairs.sort((a, b) => a.trackNumber - b.trackNumber);
}

function orderedReleaseSongs(songs) {
  const sequence = trustedReleaseSequence(songs);
  return sequence ? sequence.map(({ song }) => song) : songs;
}

function currentSongOrderingContext() {
  if (state.activeReleaseId) return 'selected-release';
  if (state.active?.id === 'search') return 'search';
  if (state.active?.id === 'nonstop') return 'nonstop';
  return 'browse';
}

function catalogueAvailabilityTier(song) {
  return routeReadiness(song).executable ? 0 : 1;
}

const CATALOGUE_SORT_DEFAULT = 'playable-first';
const CATALOGUE_SORT_MODES = new Set([CATALOGUE_SORT_DEFAULT, 'newest', 'oldest']);

function normaliseCatalogueSortMode(value) {
  const mode = String(value || '').trim().toLowerCase();
  return CATALOGUE_SORT_MODES.has(mode) ? mode : CATALOGUE_SORT_DEFAULT;
}

function catalogueChronology(song) {
  const release = state.releaseById.get(song?.releaseId);
  return release?.originalReleaseYear || release?.releaseDate || null;
}

function currentCatalogueSortMode() {
  return normaliseCatalogueSortMode(state.sortMode);
}

function orderedSongsForRender(songs) {
  const sortMode = currentCatalogueSortMode();
  if (sortMode === CATALOGUE_SORT_DEFAULT) {
    return fallbackPlayableFirstOrder(songs, {
      context: currentSongOrderingContext(),
      getAvailabilityTier: catalogueAvailabilityTier,
    });
  }
  return orderCatalogueSongs(songs, {
    context: currentSongOrderingContext(),
    mode: sortMode,
    availabilityGate: true,
    getAvailabilityTier: catalogueAvailabilityTier,
    getChronology: catalogueChronology,
  });
}

function syncSortControl() {
  if (!els.sort || !els.sortField) return;
  const visible = Boolean(
    state.active
    && state.active.id !== 'search'
    && state.active.id !== 'nonstop'
    && !state.activeReleaseId
  );
  els.sortField.hidden = !visible;
  els.sort.disabled = !visible;
  els.sort.value = currentCatalogueSortMode();
}

function applyCatalogueSort(value, { updateHistory = true } = {}) {
  const nextMode = normaliseCatalogueSortMode(value);
  const changed = nextMode !== currentCatalogueSortMode();
  state.sortMode = nextMode;
  syncSortControl();
  if (!state.active || state.active.id === 'search' || state.active.id === 'nonstop' || state.activeReleaseId) return;
  renderSongs(state.activeSongs);
  if (updateHistory) {
    const nextState = { collection: state.active.id };
    if (nextMode !== CATALOGUE_SORT_DEFAULT) nextState.sort = nextMode;
    history.replaceState(nextState, '', collectionHash(state.active.id, '', nextMode));
  }
  if (changed) {
    const label = nextMode === CATALOGUE_SORT_DEFAULT ? 'Playable first' : nextMode === 'newest' ? 'Newest' : 'Oldest';
    announce(`Songs sorted by ${label}.`);
  }
}

function fixedCollection({ id, title, kicker, description, visual, test }) {
  return { id, title, kicker, description, visual, test };
}

function buildCollections() {
  const c = [];
  const art = {
    ...visualByGenre,
    bollywood: '../assets/backgrounds/library/01-bollywood-garba-courtyard.webp',
    drumsA: '../assets/backgrounds/library/02-rhythmic-drums-courtyard-a.webp',
    devotional: '../assets/backgrounds/library/03-devotional-garba-courtyard.webp',
    colourfulA: '../assets/backgrounds/library/04-colourful-garba-courtyard-a.webp',
    fusionNeon: '../assets/backgrounds/library/05-fusion-gujarati-neon.webp',
    abstractNeon: '../assets/backgrounds/library/06-fusion-abstract-neon.webp',
    dandiyaPurple: '../assets/backgrounds/library/07-dandiya-purple-courtyard.webp',
    colourfulB: '../assets/backgrounds/library/08-colourful-garba-courtyard-b.webp',
    warmStage: '../assets/backgrounds/library/09-warm-stage-courtyard.webp',
    dandiyaSilhouette: '../assets/backgrounds/library/10-dandiya-silhouette-courtyard.webp',
    masterDark: '../assets/backgrounds/library/11-master-dark-courtyard.webp',
    drumsB: '../assets/backgrounds/library/12-rhythmic-drums-courtyard-b.webp',
    marigold: '../assets/backgrounds/library/13-traditional-marigold-courtyard.webp',
    folkCourtyard: '../assets/backgrounds/library/14-gujarati-folk-courtyard.webp',
    canopy: '../assets/backgrounds/library/15-traditional-canopy-courtyard.webp',
  };
  const essentialReleaseIds = new Set(state.curation?.featuredReleaseIds || []);

  if (essentialReleaseIds.size) {
    c.push(fixedCollection({
      id:'essential-releases',
      title:'Essential releases',
      kicker:'Curated albums',
      description:'A small, intentional shelf of complete Garba releases with verified artwork, with complete release context kept together.',
      visual:art.masterDark,
      test:(song)=>essentialReleaseIds.has(song.releaseId),
    }));
  }

  c.push(
    fixedCollection({ id:'nonstop', title:'Nonstop Garba', kicker:'Continuous energy', description:'Long-form nonstop releases, continuous Garba albums and set-style catalogue entries.', visual:art.canopy, test:(song, release)=>includesTerm(song, release, ['non stop','nonstop']) }),
    fixedCollection({ id:'live', title:'Live Garba', kicker:'On stage', description:'Live Garba performances and event recordings identified by verified live metadata or the Live Garba taxonomy.', visual:art.warmStage, test:(song, release)=>Boolean(release?.live?.isLive)||songHasTaxonomy(song,['live-garba']) }),
    fixedCollection({ id:'current', title:'New generation', kicker:'2020s', description:'Recent Gujarati Garba and folk releases from 2020 onward.', visual:art.fusionNeon, test:(song, release)=>releaseYear(release)>=2020 }),
    fixedCollection({ id:'classics', title:'Garba classics', kicker:'Foundation', description:'Traditional Garba catalogue entries, focused on the core repertoire before modern remixes and crossover styles.', visual:art.marigold, test:(song)=>belongsToVisualGenre(song,'traditional') }),
    fixedCollection({ id:'dandiya-raas', title:'Dandiya & Raas', kicker:'Raas', description:'Dandiya, Raas, Dodhiyu and related repertoire matched from the catalogue taxonomy.', visual:art.dandiyaPurple, test:(song)=>belongsToVisualGenre(song,'dandiya') }),
    fixedCollection({ id:'devotional', title:'Devotional Garba', kicker:'Bhakti', description:'Mataji, Shakti, Krishna and devotional Garba matched from primary and secondary catalogue taxonomy.', visual:art.devotional, test:(song)=>belongsToVisualGenre(song,'devotional') }),
  );

  state.genres.forEach((genre) => {
    c.push(fixedCollection({
      id:`genre-${genre.id}`,
      title:genre.label || genre.name,
      kicker:'By tradition',
      description:`Explore PlayGarba tracks whose primary or secondary catalogue taxonomy maps to ${genre.label || genre.name}.`,
      visual:visualByGenre[genre.id] || art.traditional,
      test:(song)=>belongsToVisualGenre(song,genre.id),
    }));
  });

  const styleCollections = [
    ['krishna-radha','Krishna & Radha','Raas & bhakti',['krishna-garba'],[],art.dandiyaPurple],
    ['mataji-shakti','Mataji & Shakti','Devi Garba',['mataji-devotional'],[],art.devotional],
    ['tran-taali','Tran Taali','Three-clap tradition',['tran-taali'],[],art.marigold],
    ['be-taali','Be Taali','Two-clap tradition',['be-taali'],[],art.drumsB],
    ['dakla','Dakla','Percussive folk',['dakla'],[],art.abstractNeon],
    ['timli','Timli','Regional folk dance',[],['timli'],art.drumsA],
    ['folk-fusion','Folk fusion','New folk',['electronic-fusion'],['folk fusion','folk-fusion'],art.fusionNeon],
    ['filmi-pop','Filmi & pop Garba','Crossover',['bollywood-filmi'],['pop garba'],art.bollywood],
    ['sanedo-style','Sanedo','Call-and-response',['sanedo'],[],art.colourfulB],
  ];
  styleCollections.forEach(([id,title,kicker,taxonomyIds,terms,visual]) => c.push(fixedCollection({
    id,
    title,
    kicker,
    description:`Songs and releases connected to ${title}, using canonical catalogue taxonomy${terms.length ? ' with a limited metadata fallback' : ''}.`,
    visual,
    test:(song,release)=>songHasTaxonomy(song,taxonomyIds)||(terms.length > 0 && includesTerm(song,release,terms)),
  })));

  const decades = [
    [2020,2029,'2020s'],
    [2010,2019,'2010s'],
    [2000,2009,'2000s'],
    [1990,1999,'1990s'],
  ];
  decades.forEach(([from,to,label], index) => c.push(fixedCollection({
    id:`era-${from}`,
    title:label,
    kicker:'By era',
    description:`Garba releases dated from ${from} through ${to}.`,
    visual:[art.fusionNeon,art.warmStage,art.drumsB,art.masterDark][index],
    test:(song,release)=>releaseYear(release)>=from&&releaseYear(release)<=to,
  })));

  state.artists.forEach((artist, index) => {
    const names = [artist.name, ...(artist.aliases || [])].map(normalise).filter(Boolean);
    c.push(fixedCollection({
      id:`artist-${artist.id}`,
      title:`${artist.name} Essentials`,
      kicker:'Artist',
      description:`Songs in PlayGarba credited to ${artist.name}, including catalogue aliases where available.`,
      visual:[art.marigold,art.folkCourtyard,art.dandiyaPurple,art.fusionNeon,art.devotional,art.warmStage,art.drumsA][index % 7],
      test:(song)=>artistCreditMatches(song.artist, names),
    }));
  });

  return c.map((collection) => {
    const songs = state.songs.filter((song) => collection.test(song, state.releaseById.get(song.releaseId)));
    return { ...collection, songs };
  }).filter((collection) => collection.songs.length > 0);
}

function collectionSection(title, description, collections, presentation = 'destination') {
  if (!collections.length) return;
  const presentationKind = ['destination', 'taxonomy', 'artist'].includes(presentation) ? presentation : 'destination';
  const section = document.createElement('section');
  section.className = `catalogue-section collection-section collection-section--${presentationKind}`;
  const head = document.createElement('div');
  head.className = 'section-title-row';
  const heading = document.createElement('h2');
  heading.textContent = title;
  head.append(heading);
  if (description) {
    const copy = document.createElement('p');
    copy.textContent = description;
    head.append(copy);
  }
  const grid = document.createElement('div');
  grid.className = `collection-grid collection-grid--${presentationKind}`;
  collections.forEach((collection) => grid.append(renderCollectionCard(collection, presentationKind)));
  section.append(head, grid);
  els.sections.append(section);
}

const genreIconMap = {
  'genre-traditional': '../assets/genre-icons/traditional.webp',
  'genre-dandiya': '../assets/genre-icons/dandiya.webp',
  'genre-devotional': '../assets/genre-icons/devotional.webp',
  'genre-folk': '../assets/genre-icons/folk-dhol.webp',
  'genre-sanedo': '../assets/genre-icons/sanedo.webp',
  'genre-fusion': '../assets/genre-icons/fusion.webp',
  'krishna-radha': '../assets/genre-icons/dandiya.webp',
  'mataji-shakti': '../assets/genre-icons/devotional.webp',
  'tran-taali': '../assets/genre-icons/traditional.webp',
  'be-taali': '../assets/genre-icons/traditional.webp',
  'dakla': '../assets/genre-icons/fusion.webp',
  'timli': '../assets/genre-icons/folk-dhol.webp',
  'folk-fusion': '../assets/genre-icons/fusion.webp',
  'filmi-pop': '../assets/genre-icons/fusion.webp',
  'sanedo-style': '../assets/genre-icons/sanedo.webp',
};

function renderCollectionCard(collection, presentation = 'destination') {
  const card = els.cardTemplate.content.firstElementChild.cloneNode(true);
  const presentationKind = ['destination', 'taxonomy', 'artist'].includes(presentation) ? presentation : 'destination';
  card.dataset.collectionId = collection.id;
  card.dataset.presentation = presentationKind;
  card.classList.add(`collection-card--${presentationKind}`);
  const image = card.querySelector('.collection-image');
  if (presentationKind === 'artist') {
    image.style.backgroundImage = 'none';
    image.textContent = initials(collection.title.replace(/\s+Essentials$/i, ''));
    image.classList.add('collection-image--monogram');
    image.setAttribute('aria-hidden', 'true');
    card.querySelector('small')?.remove();
  } else if (presentationKind === 'taxonomy' && genreIconMap[collection.id]) {
    image.style.backgroundImage = `url("${genreIconMap[collection.id]}")`;
    image.classList.add('collection-image--genre-icon');
    image.setAttribute('aria-hidden', 'true');
    card.querySelector('small').textContent = collection.kicker;
  } else {
    image.style.backgroundImage = `url("${collection.visual}")`;
    card.querySelector('small').textContent = collection.kicker;
  }
  card.querySelector('strong').textContent = collection.title;
  const releaseCount = new Set(collection.songs.map((song)=>song.releaseId).filter(Boolean)).size;
  card.querySelector('.collection-copy span').textContent = presentationKind === 'artist'
    ? `${pluralize(releaseCount, 'release')} · ${pluralize(collection.songs.length, 'track')}`
    : `${pluralize(collection.songs.length, 'song')} · ${pluralize(releaseCount, 'release')}`;
  card.addEventListener('click', () => openCollection(collection.id,{trigger:card}));
  return card;
}

function openEssentialRelease(releaseId, trigger = null) {
  if (!openCollection('essential-releases',{trigger,focusHeading:false})) return;
  filterToRelease(releaseId,{scroll:false});
  focusDetailHeading();
}

function renderEssentialReleases() {
  const ids = state.curation?.featuredReleaseIds || [];
  const items = ids.map((releaseId) => {
    const release = state.releaseById.get(releaseId);
    const artwork = artworkEntry(releaseId);
    const songs = state.songs.filter((song) => song.releaseId === releaseId);
    return { release, artwork, songs };
  }).filter(({ release, artwork, songs }) => release && artwork?.verified === true && artwork?.imageUrl && songs.length);
  if (!items.length) return;

  const section = document.createElement('section');
  section.className = 'catalogue-section essential-release-section';
  const head = document.createElement('div');
  head.className = 'section-title-row';
  const heading = document.createElement('h2');
  heading.textContent = 'Essential releases';
  head.append(heading);

  const rail = document.createElement('div');
  rail.className = 'essential-release-rail';
  rail.setAttribute('role','group');
  rail.setAttribute('aria-label','Essential Garba releases');
  items.forEach(({ release, songs }) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'release-card essential-release-card';
    button.setAttribute('aria-label',`Open ${displayTitle(release)}`);
    button.append(makeCover(release));
    const title = document.createElement('strong');
    title.className = 'release-title';
    title.textContent = displayTitle(release);
    const meta = document.createElement('span');
    meta.className = 'release-meta';
    const year = releaseYear(release);
    meta.textContent = [release.artist, year || null, `${songs.length} ${songs.length===1?'song':'songs'}`].filter(Boolean).join(' · ');
    button.append(title,meta);
    button.addEventListener('click',()=>openEssentialRelease(release.id,button));
    rail.append(button);
  });

  section.append(head,rail);
  els.sections.append(section);
}

function renderCollectionHome() {
  els.sections.replaceChildren();
  const byId = (id) => state.collections.find((collection) => collection.id === id);
  const featuredIds = ['nonstop','live','current','classics','dandiya-raas','devotional'];
  renderEssentialReleases();
  collectionSection('Ways to explore', '', featuredIds.map(byId).filter(Boolean), 'destination');
  const seenTaxonomy = new Set();
  const taxonomyList = state.collections.filter((c) =>
    c.id.startsWith('genre-') || ['krishna-radha','mataji-shakti','tran-taali','be-taali','dakla','timli','folk-fusion','filmi-pop','sanedo-style'].includes(c.id)
  ).filter((c) => {
    const key = c.title.trim().toLowerCase();
    if (seenTaxonomy.has(key)) return false;
    seenTaxonomy.add(key);
    return true;
  });
  collectionSection('Traditions & styles', '', taxonomyList, 'taxonomy');
  collectionSection('Artist essentials', '', state.collections.filter((c)=>c.id.startsWith('artist-') && c.songs.length >= 3), 'artist');
  collectionSection('By era', '', state.collections.filter((c)=>c.id.startsWith('era-')), 'taxonomy');
}

function artworkEntry(releaseId) {
  return state.artwork?.releases?.[releaseId] || null;
}

function makeCover(release, className = 'release-cover') {
  const wrap = document.createElement('span');
  wrap.className = className;
  const entry = artworkEntry(release?.id);
  const palettes = [
    'linear-gradient(135deg, #2a142e 0%, #15141e 100%)',
    'linear-gradient(135deg, #142338 0%, #0d121d 100%)',
    'linear-gradient(135deg, #2d1b14 0%, #161113 100%)',
    'linear-gradient(135deg, #17281f 0%, #0f1614 100%)',
    'linear-gradient(135deg, #28131d 0%, #170e16 100%)',
    'linear-gradient(135deg, #1c1a35 0%, #11101d 100%)',
  ];
  const hash = String(release?.id || release?.title || '')
    .split('')
    .reduce((acc, char) => (acc * 31 + char.charCodeAt(0)) | 0, 0);

  if (entry?.imageUrl && entry?.verified !== false) {
    const img = document.createElement('img');
    img.loading = 'lazy';
    img.decoding = 'async';
    img.alt = `${displayTitle(release) || 'Release'} cover`;
    img.src = entry.imageUrl;
    img.addEventListener('error', () => {
      img.remove();
      wrap.classList.add('fallback');
      wrap.style.background = palettes[Math.abs(hash) % palettes.length];
      const fallback = document.createElement('span');
      fallback.textContent = initials(displayTitle(release));
      wrap.append(fallback);
    }, { once:true });
    wrap.append(img);
  } else {
    wrap.classList.add('fallback');
    wrap.style.background = palettes[Math.abs(hash) % palettes.length];
    const fallback = document.createElement('span');
    fallback.textContent = initials(displayTitle(release));
    wrap.append(fallback);
  }
  return wrap;
}

function initials(value='') {
  const words = String(value).replace(/[^\p{L}\p{N} ]/gu,' ').trim().split(/\s+/).filter(Boolean);
  if (!words.length) return 'PG';
  if (words.length === 1) {
    return (words[0].length >= 2 ? words[0].slice(0, 2) : words[0]).toUpperCase();
  }
  return (words[0][0] + words[1][0]).toUpperCase();
}

function releasesForSongs(songs) {
  const counts = new Map();
  songs.forEach((song)=>{ if (song.releaseId) counts.set(song.releaseId,(counts.get(song.releaseId)||0)+1); });
  return [...counts.entries()].map(([id,count])=>({ release:state.releaseById.get(id), count })).filter((item)=>item.release)
    .sort((a,b)=>releaseYear(b.release)-releaseYear(a.release)||b.count-a.count||displayTitle(a.release).localeCompare(displayTitle(b.release)));
}

function renderReleases(songs, { limit = RELEASE_BATCH_SIZE } = {}) {
  els.releaseRail.replaceChildren();
  const items = releasesForSongs(songs);
  els.releaseSection.hidden = items.length === 0;
  const activeIndex = state.activeReleaseId ? items.findIndex(({ release }) => release.id === state.activeReleaseId) : -1;
  const resolvedLimit = activeIndex >= 0 ? Math.max(limit, activeIndex + 1) : limit;
  const visible = items.slice(0, resolvedLimit);
  visible.forEach(({release,count})=>{
    const active = state.activeReleaseId===release.id;
    const titleText = displayTitle(release);
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `release-card${active?' active':''}`;
    button.dataset.releaseId = release.id;
    button.setAttribute('aria-label', active ? `${titleText}, current release filter` : `Filter songs to ${titleText}`);
    button.append(makeCover(release));
    const title = document.createElement('strong');
    title.className = 'release-title';
    title.textContent = titleText;
    const meta = document.createElement('span');
    meta.className = 'release-meta';
    const year = releaseYear(release);
    meta.textContent = [release.artist, year || null, `${count} ${count===1?'song':'songs'}`].filter(Boolean).join(' · ');
    button.append(title,meta);
    button.addEventListener('click',()=>filterToRelease(release.id));
    els.releaseRail.append(button);
  });

  if (visible.length < items.length) {
    const more = document.createElement('button');
    more.type = 'button';
    more.className = 'release-more';
    const remaining = items.length - visible.length;
    more.innerHTML = `<strong>More releases</strong><span>Showing ${visible.length.toLocaleString()} of ${items.length.toLocaleString()} · load ${Math.min(RELEASE_BATCH_SIZE, remaining).toLocaleString()} more</span>`;
    more.addEventListener('click', () => {
      if (resolvedLimit === limit) {
        renderReleases(songs, { limit: limit + RELEASE_BATCH_SIZE });
      } else {
        renderReleases(songs, { limit: resolvedLimit + RELEASE_BATCH_SIZE });
      }
    });
    els.releaseRail.append(more);
  }
}

function songArtwork(song) {
  const release = state.releaseById.get(song.releaseId);
  const cover = makeCover(release, 'song-art');
  if (cover.classList.contains('fallback')) {
    cover.replaceChildren();
    cover.textContent = initials(displayTitle(release) || displayTitle(song));
  }
  return cover;
}

function makeSongContext(song, release) {
  const details = document.createElement('details');
  details.className = 'song-context';
  const summary = document.createElement('summary');
  summary.textContent = 'About';
  summary.setAttribute('aria-label', `About ${displayTitle(song)}`);
  const description = document.createElement('p');
  description.className = 'song-context-copy';
  description.textContent = songDescription(song, release);
  const meta = document.createElement('div');
  meta.className = 'song-context-meta';
  const labels = taxonomyIdsForSong(song).map(taxonomyLabel).filter(Boolean);
  const year = releaseYear(release);
  [song.genre ? `World: ${song.genre}` : null, ...labels, year ? String(year) : null].filter(Boolean).forEach((text) => {
    const item = document.createElement('span');
    item.textContent = text;
    meta.append(item);
  });
  details.append(summary, description);
  if (meta.childElementCount) details.append(meta);
  return details;
}

function renderSongs(songs, title='All songs', { limit = SONG_BATCH_SIZE } = {}) {
  syncSortControl();
  els.songList.replaceChildren();
  els.songSectionTitle.textContent = title;

  const isArtistCollection = Boolean(state.active?.id?.startsWith('artist-') && !state.activeReleaseId);
  if (isArtistCollection) {
    const items = releasesForSongs(songs);
    const standaloneSongs = songs.filter((s) => !s.releaseId);
    const totalCount = items.length + standaloneSongs.length;
    els.songCount.textContent = `${totalCount.toLocaleString()} ${totalCount === 1 ? 'recording' : 'recordings'}`;
    const fragment = document.createDocumentFragment();

    items.forEach(({ release, count }) => {
      const row = document.createElement('div');
      row.className = 'song-row artist-release-row';
      row.setAttribute('role', 'listitem');
      row.dataset.releaseId = release.id;
      row.append(makeCover(release, 'song-art'));

      const copy = document.createElement('div');
      copy.className = 'song-copy';
      const titleEl = document.createElement('strong');
      titleEl.textContent = displayTitle(release);
      const artist = document.createElement('span');
      const year = releaseYear(release);
      artist.textContent = [cleanArtistCredits(release.artist), year || null, `${count} ${count === 1 ? 'track' : 'chapters / tracks'}`].filter(Boolean).join(' · ');
      copy.append(titleEl, artist);

      const releaseEl = document.createElement('span');
      releaseEl.className = 'song-release';
      releaseEl.textContent = count > 1 ? `${count} tracks` : 'Single';

      const action = document.createElement('button');
      action.type = 'button';
      action.className = 'play-link';
      action.textContent = count > 1 ? `View chapters (${count})` : 'Listen';
      action.setAttribute('aria-label', `View chapters for ${displayTitle(release)}`);
      action.addEventListener('click', (e) => {
        e.stopPropagation();
        filterToRelease(release.id);
      });

      row.addEventListener('click', () => filterToRelease(release.id));
      row.style.cursor = 'pointer';

      row.append(copy, releaseEl, action);
      fragment.append(row);
    });

    standaloneSongs.forEach((song) => {
      const songTitle = displayTitle(song);
      const readiness = routeReadiness(song);
      const row = document.createElement('div');
      row.className = 'song-row';
      row.setAttribute('role', 'listitem');
      row.dataset.songId = song.id;
      row.append(songArtwork(song));

      const displayArtist = cleanArtistCredits(song.artist);
      const copy = document.createElement('div');
      copy.className = 'song-copy';
      const titleEl = document.createElement('strong');
      titleEl.textContent = songTitle;
      const artist = document.createElement('span');
      artist.textContent = [displayArtist, formatDuration(song.durationSeconds), readiness.executable ? null : 'Unplayable'].filter(Boolean).join(' · ');
      copy.append(titleEl, artist);

      const releaseEl = document.createElement('span');
      releaseEl.className = 'song-release';
      releaseEl.textContent = 'Single';

      const action = document.createElement(readiness.executable ? 'a' : 'span');
      action.className = `play-link${readiness.executable ? '' : ' unavailable'}`;
      if (readiness.executable) {
        action.textContent = 'Listen';
        action.href = `../?genre=${encodeURIComponent(song.genre || 'traditional')}&song=${encodeURIComponent(song.id)}`;
        action.setAttribute('aria-label', `Open ${songTitle} by ${displayArtist} in the PlayGarba player`);
      } else {
        action.textContent = 'Unavailable';
        action.setAttribute('aria-disabled', 'true');
      }
      row.append(copy, releaseEl, action);
      fragment.append(row);
    });

    els.songList.append(fragment);
    return;
  }

  const orderedSongs = orderedSongsForRender(songs);
  const releaseSequence = state.activeReleaseId ? trustedReleaseSequence(orderedSongs) : null;
  const trackNumberBySongId = releaseSequence
    ? new Map(releaseSequence.map(({ song, trackNumber }) => [song.id, trackNumber]))
    : null;
  const visible = orderedSongs.slice(0, limit);
  els.songCount.textContent = visible.length < orderedSongs.length
    ? `Showing ${visible.length.toLocaleString()} of ${orderedSongs.length.toLocaleString()} songs`
    : `${orderedSongs.length.toLocaleString()} ${orderedSongs.length===1?'song':'songs'}`;
  if (!orderedSongs.length) {
    const empty = document.createElement('div');
    empty.className = 'empty';
    const emptyQuery = state.active?.id === 'search' ? els.search.value.trim() : '';
    empty.textContent = emptyQuery
      ? `No songs found for “${emptyQuery}”. Try another artist, song or release.`
      : 'No songs match this catalogue yet.';
    els.songList.append(empty);
    return;
  }
  const fragment = document.createDocumentFragment();
  visible.forEach((song)=>{
    const release = state.releaseById.get(song.releaseId);
    const songTitle = displayTitle(song);
    const readiness = routeReadiness(song);
    const row = document.createElement('div');
    row.className = 'song-row';
    row.setAttribute('role','listitem');
    row.dataset.songId = song.id;
    row.dataset.playbackStatus = readiness.status;
    const trackNumber = trackNumberBySongId?.get(song.id);
    if (trackNumber != null) {
      const sequence = document.createElement('span');
      sequence.className = 'song-art fallback song-track-number';
      sequence.textContent = String(trackNumber).padStart(2, '0');
      sequence.setAttribute('aria-hidden', 'true');
      row.dataset.trackNumber = String(trackNumber);
      row.append(sequence);
    } else {
      row.append(songArtwork(song));
    }
    const displayArtist = cleanArtistCredits(song.artist);
    const copy = document.createElement('div');
    copy.className = 'song-copy';
    const titleEl = document.createElement('strong');
    titleEl.textContent = songTitle;
    const artist = document.createElement('span');
    artist.textContent = [displayArtist, formatDuration(song.durationSeconds), readiness.executable ? null : 'Unplayable'].filter(Boolean).join(' · ');
    copy.append(titleEl,artist,makeSongContext(song,release));
    const releaseEl = document.createElement('span');
    releaseEl.className = 'song-release';
    releaseEl.textContent = displayTitle(release);
    const action = document.createElement(readiness.executable ? 'a' : 'span');
    action.className = `play-link${readiness.executable ? '' : ' unavailable'}`;
    if (readiness.executable) {
      action.textContent = 'Listen';
      action.href = `../?genre=${encodeURIComponent(song.genre || 'traditional')}&song=${encodeURIComponent(song.id)}`;
      action.setAttribute('aria-label',`Open ${songTitle} by ${displayArtist} in the PlayGarba player`);
    } else {
      action.textContent = 'Unavailable';
      action.setAttribute('aria-disabled','true');
      action.setAttribute('aria-label',`${songTitle} by ${displayArtist} is not currently available to play`);
    }
    row.append(copy,releaseEl,action);
    fragment.append(row);
  });

  if (visible.length < orderedSongs.length) {
    const remaining = orderedSongs.length - visible.length;
    const more = document.createElement('button');
    more.type = 'button';
    more.className = 'song-more';
    more.textContent = `Show ${Math.min(SONG_BATCH_SIZE, remaining).toLocaleString()} more songs`;
    more.setAttribute('aria-label', `Show more songs. ${remaining.toLocaleString()} remaining.`);
    more.addEventListener('click', () => renderSongs(songs, title, { limit: limit + SONG_BATCH_SIZE }));
    fragment.append(more);
  }

  els.songList.append(fragment);
}

function collectionHash(collectionId, releaseId = '', sortMode = currentCatalogueSortMode()) {
  const params = new URLSearchParams();
  params.set('collection', collectionId);
  if (releaseId) params.set('release', releaseId);
  const normalisedSort = normaliseCatalogueSortMode(sortMode);
  if (normalisedSort !== CATALOGUE_SORT_DEFAULT) params.set('sort', normalisedSort);
  return `#${params.toString()}`;
}

function syncBackLabel() {
  els.back.textContent = state.activeReleaseId ? '← Collection' : '← All catalogues';
}

function openCollection(id, { updateHash = true, trigger = null, focusHeading = true } = {}) {
  const collection = state.collections.find((item)=>item.id===id);
  if (!collection) return false;
  if (trigger instanceof HTMLElement) state.returnFocusTarget = trigger;
  else if (!state.returnFocusTarget) state.returnFocusTarget = collectionCardFor(id);
  state.active = collection;
  state.activeSongs = collection.songs;
  state.activeReleaseId = null;
  syncBackLabel();
  els.home.hidden = true;
  els.detail.hidden = false;
  renderCollectionDetailIdentity(collection);
  syncCollectionIdentity();
  renderReleases(collection.songs);
  renderSongs(collection.songs);
  if (updateHash) history.pushState({collection:id},'',collectionHash(id));
  window.scrollTo({top:0,behavior:motionBehavior()});
  if (focusHeading) focusDetailHeading();
  return true;
}

function filterToRelease(releaseId, { updateHistory = true, scroll = true } = {}) {
  if (!state.active || state.active.id === 'search') return false;
  const requestedRelease = state.releaseById.get(releaseId);
  const resolvedReleaseId = requestedRelease?.canonicalReleaseId || releaseId;
  const release = state.releaseById.get(resolvedReleaseId);
  const songs = orderedReleaseSongs(state.activeSongs.filter((song)=>song.releaseId===resolvedReleaseId));
  if (!release || !songs.length) return false;
  state.activeReleaseId = resolvedReleaseId;
  syncBackLabel();
  syncCollectionIdentity();
  renderReleaseDetailIdentity(release, songs);
  renderReleases(state.activeSongs);
  renderSongs(songs, displayTitle(release) || 'Release songs');
  if (updateHistory) {
    const nextState = { collection:state.active.id, release:resolvedReleaseId };
    const nextHash = collectionHash(state.active.id, resolvedReleaseId);
    if (history.state?.collection === state.active.id && history.state?.release === resolvedReleaseId) {
      history.replaceState(nextState,'',nextHash);
    } else {
      history.pushState(nextState,'',nextHash);
    }
  }
  if (scroll) document.querySelector('.songs-section')?.scrollIntoView({behavior:motionBehavior(),block:'start'});
  return true;
}

function showAllSongs({ updateHistory = true } = {}) {
  if (!state.active || state.active.id === 'search') return;
  state.activeReleaseId = null;
  syncBackLabel();
  syncCollectionIdentity();
  renderCollectionDetailIdentity(state.active);
  renderReleases(state.activeSongs);
  renderSongs(state.activeSongs);
  if (updateHistory) history.pushState({collection:state.active.id},'',collectionHash(state.active.id));
}

function closeCollection({ updateHash = true, restoreFocus = true } = {}) {
  const activeId = state.active?.id;
  const focusTarget = state.returnFocusTarget
    || (activeId && activeId !== 'search' ? collectionCardFor(activeId) : null)
    || (activeId === 'search' ? searchReturnControl() : null);
  const hadActiveState = Boolean(state.active);
  state.active = null;
  state.activeSongs = [];
  state.activeReleaseId = null;
  state.returnFocusTarget = null;
  syncBackLabel();
  els.detail.hidden = true;
  els.home.hidden = false;
  document.title = BASE_DOCUMENT_TITLE;
  if (updateHash) history.replaceState({},'',`${location.pathname}${location.search}`);
  if (restoreFocus && focusTarget) restoreExploreFocus(focusTarget);
  else if (hadActiveState) window.scrollTo({top:0,behavior:motionBehavior()});
}

function returnToCollections() {
  els.search.value = '';
  if (history.state?.release) {
    history.back();
    return;
  }
  if (history.state?.collection || history.state?.search) {
    history.back();
    return;
  }
  closeCollection();
}

function exploreSearchRecord(song) {
  const release = state.releaseById.get(song.releaseId);
  return {
    id: song.id,
    title: [song.title, song.displayTitle].filter(Boolean),
    titleAliases: song.aliases,
    artist: song.artist,
    artistAliases: song.artistAliases,
    taxonomyTerms: [
      song.genre,
      song.category,
      ...(song.styles || []),
      ...(song.taxonomyStyles || []),
    ],
    releaseTerms: [
      release?.title,
      release?.displayTitle,
      ...aliasesFor(release),
      release?.artist,
      release?.label,
    ],
    song,
  };
}

function rankExploreSongs(songs, query) {
  return rankSearchRecords(songs.map(exploreSearchRecord), query)
    .map(({ record }) => record.song);
}

function searchCatalogue(query, { updateHistory = true } = {}) {
  const q = normalizeSearchText(query);
  if (!q) {
    if (updateHistory && history.state?.search) history.back();
    else closeCollection({ updateHash: updateHistory });
    return;
  }
  const songs = rankExploreSongs(state.songs, query);
  if (state.active?.id !== 'search') state.returnFocusTarget = searchReturnControl();
  state.active = { id:'search', title:`Search: ${query.trim()}`, kicker:'Search results', description:'Matching songs, artists, reviewed aliases, styles and releases from the PlayGarba catalogue.', songs };
  state.activeSongs = songs;
  state.activeReleaseId = null;
  syncBackLabel();
  els.home.hidden = true;
  els.detail.hidden = false;
  els.detailKicker.textContent = 'Search results';
  els.detailTitle.textContent = query.trim();
  els.detailDescription.textContent = 'Matching songs, artists, reviewed aliases, styles and releases from the PlayGarba catalogue.';
  document.title = `Search “${query.trim()}” · PlayGarba`;
  syncShareLabel(`search results for ${query.trim()}`);
  replaceDetailMeta([`${songs.length.toLocaleString()} matches`]);
  renderReleases(songs);
  renderSongs(songs,'Matching songs');
  if (updateHistory) {
    const nextUrl = `#search=${encodeURIComponent(query.trim())}`;
    if (history.state?.search) history.replaceState({search:q},'',nextUrl);
    else history.pushState({search:q},'',nextUrl);
  }
}

function copyLinkFallback(text) {
  const area = document.createElement('textarea');
  area.value = text;
  area.setAttribute('readonly','');
  area.style.position = 'fixed';
  area.style.opacity = '0';
  document.body.append(area);
  area.select();
  const copied = document.execCommand('copy');
  area.remove();
  return copied;
}

async function shareExploreState() {
  if (!state.active) return;
  const query = els.search.value.trim();
  const release = state.activeReleaseId ? state.releaseById.get(state.activeReleaseId) : null;
  const releaseTitle = displayTitle(release);
  const title = state.active.id === 'search'
    ? `Search “${query}” · PlayGarba`
    : release
      ? `${releaseTitle} · PlayGarba`
      : `${state.active.title} · PlayGarba`;
  const text = state.active.id === 'search'
    ? `PlayGarba search results for ${query}.`
    : release
      ? releaseDescription(release, state.activeSongs.filter((song)=>song.releaseId===release.id))
      : state.active.description;
  const payload = { title, text, url: location.href };

  if (typeof navigator.share === 'function') {
    try {
      await navigator.share(payload);
      announce('Share completed.');
      return;
    } catch (error) {
      if (error?.name === 'AbortError') return;
    }
  }

  try {
    if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(payload.url);
    else if (!copyLinkFallback(payload.url)) throw new Error('Copy failed');
    announce('Explore link copied.');
  } catch {
    announce('Could not copy this link. Use the browser address bar instead.');
  }
}

function wireEvents() {
  if (state.eventsWired) return;
  state.eventsWired = true;
  ensureShareUi();
  let timer = null;
  els.search.addEventListener('input',()=>{
    clearTimeout(timer);
    timer = setTimeout(()=>searchCatalogue(els.search.value),90);
  });
  els.back.addEventListener('click',returnToCollections);
  els.share?.addEventListener('click',()=>{ void shareExploreState(); });
  els.sort?.addEventListener('change',()=>applyCatalogueSort(els.sort.value));
  els.showAllSongs.addEventListener('click',()=>showAllSongs());
  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || els.detail.hidden) return;
    event.preventDefault();
    returnToCollections();
  });
  window.addEventListener('popstate',applyHashState);
}

function applyHashState() {
  const params = new URLSearchParams(location.hash.replace(/^#/,''));
  const id = params.get('collection');
  const releaseId = params.get('release');
  const search = params.get('search');
  state.sortMode = normaliseCatalogueSortMode(params.get('sort'));
  if (els.sort) els.sort.value = currentCatalogueSortMode();
  if (id && openCollection(id,{updateHash:false,focusHeading:false})) {
    if (releaseId) filterToRelease(releaseId,{updateHistory:false,scroll:false});
    focusDetailHeading();
  } else if (search) {
    if (!state.returnFocusTarget) state.returnFocusTarget = searchReturnControl();
    els.search.value=search;
    searchCatalogue(search,{updateHistory:false});
  } else {
    els.search.value='';
    closeCollection({updateHash:false,restoreFocus:Boolean(state.active)});
  }
}

function setLoading(loading) {
  main?.setAttribute('aria-busy', loading ? 'true' : 'false');
  els.search.disabled = loading;
  if (els.share) els.share.disabled = loading;
}

async function init() {
  els.count.textContent = 'Loading catalogue…';
  const [core,genres,taxonomy,curation] = await Promise.all([
    explorePageData.loadCore(),
    fetchJson(paths.genres,[]),
    fetchJson(paths.taxonomy,[]),
    fetchJson(paths.curation,{featuredReleaseIds:[]}),
  ]);
  const { songs, releases, index, artwork } = core;
  if (!songs.length) {
    explorePageData.invalidate(paths.songs);
    throw new Error('Song catalogue unavailable');
  }
  state.songs = songs.filter((song) => String(song?.presentationRole || 'catalogue') === 'catalogue');
  state.releases = releases;
  state.releaseRedirects = new Map(releases.filter((release) => release?.canonicalReleaseId).map((release) => [release.id, release.canonicalReleaseId]));
  state.genres = genres;
  state.taxonomy = taxonomy;
  state.taxonomyById = new Map(taxonomy.map((entry)=>[entry.id,entry]));
  state.artwork = artwork || {releases:{}};
  state.curation = curation || {featuredReleaseIds:[]};
  state.releaseById = buildReleaseIndex(releases);
  state.artists = await loadArtists(index);
  state.collections = buildCollections();
  state.loadFailed = false;
  const visibleReleaseCount = new Set(state.songs.map((song) => song.releaseId).filter(Boolean)).size;
  els.count.textContent = state.songs.length.toLocaleString() + ' songs · ' + visibleReleaseCount.toLocaleString() + ' releases · ' + state.collections.length.toLocaleString() + ' catalogues';
  renderCollectionHome();
  wireEvents();
  applyHashState();
}

function renderLoadFailure(error) {
  console.error(error);
  state.loadFailed = true;
  els.count.textContent = navigator.onLine ? 'Catalogue temporarily unavailable.' : 'Offline · catalogue not cached on this device yet.';
  els.home.hidden = false;
  els.detail.hidden = true;
  const errorState = document.createElement('div');
  errorState.className = 'catalogue-error';
  errorState.setAttribute('role','alert');
  const title = document.createElement('strong');
  title.textContent = navigator.onLine ? 'Explore could not load' : 'Explore needs one online visit first';
  const copy = document.createElement('p');
  copy.textContent = navigator.onLine
    ? 'The catalogue data did not arrive. Retry without leaving this page.'
    : 'Reconnect and retry. After a successful visit, PlayGarba can reuse the catalogue data offline.';
  const retry = document.createElement('button');
  retry.type = 'button';
  retry.className = 'retry-button';
  retry.textContent = 'Retry catalogue';
  retry.addEventListener('click', () => {
    retry.disabled = true;
    retry.textContent = 'Retrying…';
    void start();
  });
  errorState.append(title,copy,retry);
  els.sections.replaceChildren(errorState);
}

async function start() {
  setLoading(true);
  try {
    await init();
  } catch (error) {
    renderLoadFailure(error);
  } finally {
    setLoading(false);
  }
}

window.addEventListener('online', () => {
  if (state.loadFailed) void start();
});

void start();