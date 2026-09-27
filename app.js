import './assets/runtime/route-readiness.js';
import './assets/runtime/share-intent.js';
import './assets/runtime/morphicons.js';
import './assets/runtime/live-station.js';
import { normalizeSearchText, rankSearchRecords } from './assets/runtime/search-core.js';
import { initMorphicons } from './assets/runtime/morphicons.js';
import { getNextLiveTrack } from './assets/runtime/live-station.js';
import { createCircleController } from './assets/runtime/garba-circle-controller.js';
import { createLiveSync } from './assets/runtime/live-sync.js';
import { createPlayableOrder, PLAYABLE_TIER } from './assets/runtime/playable-order.js';
import {
  createMySongs,
  parseYouTubeLink,
  parseYouTubePlaylist,
  resolveYouTubePlaylist,
  makeUserSong,
  cleanVideoTitle,
  fetchVideoDetails,
} from './assets/runtime/my-songs.js';
const { routeReadiness, canExecuteSong, youtubeVideoId } = window.GARBA_ROUTE_READINESS;
const {
  parseShareTimestamp,
  buildSongShareUrl,
  formatShareText,
  executeShare,
} = window.GARBA_SHARE_INTENT || {};

const storage = {
  get(key, fallback) {
    try {
      const value = localStorage.getItem(key);
      return value == null ? fallback : JSON.parse(value);
    } catch (err) {
      console.warn('localStorage get failed:', err);
      return fallback;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (err) {
      console.warn('localStorage set failed:', err);
    }
  },
};

const RECENT_SONGS_KEY = 'garba:recentSongs';
const RECENT_STARTERS_KEY = 'garba:recentInitialSongs';
const MAX_RECENT_HISTORY = 150;

function getRecentPlayedSongs() {
  const list = storage.get(RECENT_SONGS_KEY, storage.get(RECENT_STARTERS_KEY, []));
  return Array.isArray(list) ? list.filter((id) => typeof id === 'string') : [];
}

function recordRecentPlayedSong(songId) {
  if (!songId || typeof songId !== 'string') return;
  const current = getRecentPlayedSongs();
  const next = [...current.filter((id) => id !== songId), songId].slice(-MAX_RECENT_HISTORY);
  storage.set(RECENT_SONGS_KEY, next);
  storage.set(RECENT_STARTERS_KEY, next);
}

const state = {
  genres: [],
  songs: [],
  genreId: 'traditional',
  songId: null,
  favourites: new Set(storage.get('garba:favourites', [])),
  manualQueue: [...new Set(storage.get('garba:queue', []).filter((id) => typeof id === 'string'))].slice(0, 30),
  listeningHistory: [],
  playContextGenreId: 'traditional',
  playContextSongId: null,
  releaseContextId: null,
  releaseContextSongId: null,
  playlist: null,
  releaseContextConsumedIds: new Set(),
  playing: false,
  elapsed: 0,
  duration: 0,
  sheetFilter: 'traditional',
  sheetMode: 'all',
  sheetSnap: 'closed',
  sheetMatchCount: 0,
  toastTimer: null,
  transitionToken: 0,
  installPrompt: null,
  reducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  lastPersistedElapsed: -1,
  catalogueSignature: '',
  catalogueLoadedAt: 0,
  pendingSongId: null,
  sheetTrigger: null,
  searchFocusTimer: null,
  presentationRedirects: new Map(),
  hasExplicitNavigation: false,
  shuffleMode: storage.get('garba:shuffle', false),
  liveMode: false,
  morphs: null,
};

const $ = (id) => document.getElementById(id);
const els = {
  app: $('app'),
  worldA: $('worldA'),
  worldB: $('worldB'),
  worldAmbient: $('worldAmbient'),
  trackBlock: $('trackBlock'),
  genreEyebrow: $('genreEyebrow'),
  songTitle: $('songTitle'),
  songArtist: $('songArtist'),
  playButton: $('playButton'),
  shuffleButton: $('shuffleButton'),
  liveStationButton: $('liveStationButton'),
  circleButton: $('circleButton'),
  prevButton: $('prevButton'),
  nextButton: $('nextButton'),
  progress: $('progress'),
  elapsedTime: $('elapsedTime'),
  durationTime: $('durationTime'),
  genreStrip: $('genreStrip'),
  browseButton: $('browseButton'),
  songSheet: $('songSheet'),
  sheetHandle: $('sheetHandle'),
  sheetTitle: $('sheetTitle'),
  sheetSummary: $('sheetSummary'),
  sheetClose: $('sheetClose'),
  sheetBackdrop: $('sheetBackdrop'),
  sheetGenreStrip: $('sheetGenreStrip'),
  songList: $('songList'),
  searchButton: $('searchButton'),
  shareButton: $('shareButton'),
  favouritesButton: $('favouritesButton'),
  queueButton: $('queueButton'),
  queueBadge: $('queueBadge'),
  searchInput: $('searchInput'),
  mobileFavourite: $('mobileFavourite'),
  miniTitle: $('miniTitle'),
  miniArtist: $('miniArtist'),
  miniProgress: $('miniProgress'),
  miniPlay: $('miniPlay'),
  miniPrev: $('miniPrev'),
  miniNext: $('miniNext'),
  audio: $('audio'),
  toast: $('toast'),
  installBanner: $('installBanner'),
  installTitle: $('installTitle'),
  installText: $('installText'),
  installButton: $('installButton'),
  installDismiss: $('installDismiss'),
  linkSongButton: $('linkSongButton'),
  linkSongCard: $('linkSongCard'),
  linkSongClose: $('linkSongClose'),
  linkSongForm: $('linkSongForm'),
  linkSongInput: $('linkSongInput'),
  linkSongStatus: $('linkSongStatus'),
};

const mobileQuery = window.matchMedia('(max-width: 700px)');
const standaloneQuery = window.matchMedia('(display-mode: standalone)');
const SEARCH_RESULT_LIMIT = 160;

const formatTime = (seconds = 0) => {
  const safe = Number.isFinite(seconds) ? Math.max(0, Math.round(seconds)) : 0;
  return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, '0')}`;
};

const formatDuration = (seconds) => {
  if (!Number.isFinite(seconds) || seconds <= 0) return '--:--';
  return formatTime(seconds);
};

const currentSong = () => state.songs.find((song) => song.id === state.songId) || null;
const currentGenre = () => state.genres.find((genre) => genre.id === state.genreId) || null;
const songsForGenre = (genreId) => state.songs.filter((song) => song.genre === genreId);

// Playable-first ordering, rebuilt whenever the song list itself changes.
let playableOrderCache = { songs: null, order: null };
function playableOrder() {
  if (playableOrderCache.songs !== state.songs) {
    playableOrderCache = {
      songs: state.songs,
      order: createPlayableOrder(state.songs, { canExecute: canExecuteSong, videoIdOf: youtubeVideoId }),
    };
  }
  return playableOrderCache.order;
}

// Songs a listener added from YouTube live on this device only and sit after the catalogue.
// A link to a video the catalogue already has as a complete song plays the catalogue song instead.
let catalogueSongs = [];
function withMySongs(songs, { reload = false } = {}) {
  catalogueSongs = songs;
  const mine = reload ? mySongs.load(new Set(state.genres.map((genre) => genre.id))) : mySongs.songs;
  const catalogueOrder = createPlayableOrder(songs, { canExecute: canExecuteSong, videoIdOf: youtubeVideoId });
  const catalogueVideos = new Set(songs.filter((song) => catalogueOrder.tier(song) === PLAYABLE_TIER.FULL).map(youtubeVideoId));
  return [...songs, ...mine.filter((song) => !catalogueVideos.has(song.youtubeId))];
}

function findSongByVideoId(videoId) {
  return state.songs.find((song) => song.userAdded && song.youtubeId === videoId)
    || state.songs.find((song) => youtubeVideoId(song) === videoId && playableOrder().tier(song) === PLAYABLE_TIER.FULL)
    || null;
}

const numericTrackNumber = (song) => {
  const value = Number(song?.trackNumber);
  return Number.isFinite(value) && value > 0 ? value : null;
};

function orderedReleaseSongs(releaseId) {
  if (!releaseId) return [];
  const byId = new Map();
  for (const song of state.songs) {
    if (!song?.id || song.releaseId !== releaseId || numericTrackNumber(song) == null) continue;
    byId.set(song.id, song);
  }
  return [...byId.values()].sort((left, right) => {
    const trackDelta = numericTrackNumber(left) - numericTrackNumber(right);
    return trackDelta || left.id.localeCompare(right.id);
  });
}

function releaseContextMatch(releaseId, songId) {
  const ordered = orderedReleaseSongs(releaseId);
  if (ordered.length < 2 || !songId) return null;
  return ordered.some((song) => song.id === songId) ? { releaseId, songId, ordered } : null;
}

function clearReleaseContext() {
  state.releaseContextId = null;
  state.releaseContextSongId = null;
  state.releaseContextConsumedIds.clear();
}

function setReleaseContext(releaseId, songId) {
  const match = releaseContextMatch(releaseId, songId);
  if (!match) {
    clearReleaseContext();
    return false;
  }
  state.releaseContextId = match.releaseId;
  state.releaseContextSongId = match.songId;
  state.releaseContextConsumedIds.clear();
  return true;
}

function songBelongsToActiveRelease(song) {
  return Boolean(
    song?.id
    && state.releaseContextId
    && song.releaseId === state.releaseContextId
    && numericTrackNumber(song) != null
    && orderedReleaseSongs(state.releaseContextId).some((entry) => entry.id === song.id)
  );
}

function releaseContinuationSongs(limit = Infinity) {
  const match = releaseContextMatch(state.releaseContextId, state.releaseContextSongId);
  if (!match) return [];
  const index = match.ordered.findIndex((song) => song.id === state.releaseContextSongId);
  const remaining = index >= 0
    ? match.ordered.slice(index + 1).filter((song) => (
      !state.releaseContextConsumedIds.has(song.id) && canExecuteSong(song)
    ))
    : [];
  return Number.isFinite(limit) ? remaining.slice(0, Math.max(0, limit)) : remaining;
}

function automaticGenreContinuation(limit = 12, {
  genreId = state.playContextGenreId || state.genreId,
  anchorId = state.playContextSongId || state.songId,
  excludeIds = new Set(),
} = {}) {
  const list = songsForGenre(genreId);
  if (!list.length || limit <= 0) return [];
  const excluded = excludeIds instanceof Set ? excludeIds : new Set(excludeIds || []);
  const anchorIndex = list.findIndex((song) => song.id === anchorId);
  const ordered = anchorIndex < 0
    ? [...list]
    : [...list.slice(anchorIndex + 1), ...list.slice(0, anchorIndex)];
  const seen = new Set();
  const result = [];
  for (const song of ordered) {
    if (!song?.id || song.id === state.songId || excluded.has(song.id) || seen.has(song.id) || !canExecuteSong(song)) continue;
    seen.add(song.id);
    result.push(song);
    if (result.length >= limit) break;
  }
  return result;
}

function persistFavourites() {
  storage.set('garba:favourites', [...state.favourites]);
}

function reconcilePresentationFavourites() {
  const visibleIds = new Set(state.songs.map((song) => song.id));
  const next = new Set();
  let changed = false;
  for (const id of state.favourites) {
    const redirect = state.presentationRedirects.get(id);
    const mapped = redirect?.canonicalSongId || id;
    if (visibleIds.has(mapped)) next.add(mapped);
    if (mapped !== id || !visibleIds.has(id)) changed = true;
  }
  if (changed || next.size !== state.favourites.size) {
    state.favourites = next;
    persistFavourites();
  }
}

function persistManualQueue() {
  storage.set('garba:queue', state.manualQueue);
}

function sanitiseManualQueue() {
  const byId = new Map(state.songs.map((song) => [song.id, song]));
  const next = [];
  const seen = new Set();
  for (const id of state.manualQueue) {
    const song = byId.get(id);
    if (!song || !canExecuteSong(song) || id === state.songId || seen.has(id)) continue;
    seen.add(id);
    next.push(id);
    if (next.length >= 30) break;
  }
  const changed = next.length !== state.manualQueue.length || next.some((id, index) => id !== state.manualQueue[index]);
  state.manualQueue = next;
  if (changed) persistManualQueue();
}

function persistSession() {
  storage.set('garba:session', {
    genreId: state.genreId,
    songId: state.songId,
    elapsed: Math.round(state.elapsed || 0),
  });
}

function showToast(message) {
  els.toast.textContent = message;
  els.toast.classList.add('show');
  clearTimeout(state.toastTimer);
  state.toastTimer = setTimeout(() => els.toast.classList.remove('show'), 2500);
}

function setAccent(accent) {
  document.documentElement.style.setProperty('--accent', accent || '#d6b06f');
}

function setPlaying(playing) {
  state.playing = playing;
  els.app.classList.toggle('is-playing', playing);
  els.playButton.classList.toggle('is-playing', playing);
  els.miniPlay.classList.toggle('is-playing', playing);
  els.playButton.setAttribute('aria-label', playing ? 'Pause' : 'Play');
  els.miniPlay.setAttribute('aria-label', playing ? 'Pause' : 'Play');
  state.morphs?.get('play')?.morphTo(playing ? 'pause' : 'play');
  state.morphs?.get('miniPlay')?.morphTo(playing ? 'pause' : 'play');
  if ('mediaSession' in navigator) navigator.mediaSession.playbackState = playing ? 'playing' : 'paused';
}

function setPlayPending() {
  els.playButton.classList.add('is-playing');
  els.miniPlay.classList.add('is-playing');
  state.morphs?.get('play')?.morphTo('pause');
  state.morphs?.get('miniPlay')?.morphTo('pause');
}

function configureGenreButton(button, genre, activeId, onSelect) {
  if (button.dataset.genreBound !== 'true') {
    button.dataset.genreBound = 'true';
    button.addEventListener('click', () => {
      if (typeof button._garbaGenreSelect === 'function') button._garbaGenreSelect(button.dataset.genre);
    });
  }

  button._garbaGenreSelect = onSelect;
  button.classList.add('genre-button');
  button.classList.toggle('active', genre.id === activeId);
  button.type = 'button';
  button.dataset.genre = genre.id;

  let iconFrame = button.querySelector(':scope > .genre-icon-frame');
  let label = button.querySelector(':scope > .genre-label');
  if (!iconFrame || !label) {
    button.replaceChildren();
    iconFrame = document.createElement('span');
    iconFrame.className = 'genre-icon-frame';
    iconFrame.setAttribute('aria-hidden', 'true');
    const iconImg = document.createElement('span');
    iconImg.className = 'genre-icon-img';
    iconFrame.appendChild(iconImg);
    label = document.createElement('span');
    label.className = 'genre-label';
    label.textContent = genre.name;
    button.appendChild(iconFrame);
    button.appendChild(label);
  } else if (label.textContent !== genre.name) {
    label.textContent = genre.name;
  }

  if (genre.id === activeId) button.setAttribute('aria-current', 'true');
  else button.removeAttribute('aria-current');
}

function reconcileGenreButtons(container, activeId, onSelect) {
  if (!container) return;
  const previousScrollLeft = Math.max(0, container.scrollLeft || 0);
  const focusedGenre = container.contains(document.activeElement) ? document.activeElement?.dataset?.genre : null;
  const desiredIds = new Set(state.genres.map((genre) => genre.id));
  const existing = new Map(
    [...container.querySelectorAll(':scope > .genre-button[data-genre]')]
      .map((button) => [button.dataset.genre, button])
  );

  const desiredButtons = state.genres.map((genre) => {
    const button = existing.get(genre.id) || document.createElement('button');
    configureGenreButton(button, genre, activeId, onSelect);
    existing.delete(genre.id);
    return button;
  });

  existing.forEach((button, genreId) => {
    if (!desiredIds.has(genreId)) button.remove();
  });

  const nonstop = container.querySelector(':scope > #nonstopButton');
  if (nonstop && container.firstElementChild !== nonstop) container.insertBefore(nonstop, container.firstElementChild);
  const offset = nonstop ? 1 : 0;
  desiredButtons.forEach((button, index) => {
    const slot = container.children[offset + index] || null;
    if (slot !== button) container.insertBefore(button, slot);
  });

  const maxLeft = Math.max(0, container.scrollWidth - container.clientWidth);
  container.scrollLeft = Math.min(previousScrollLeft, maxLeft);
  container.scrollTop = 0;

  if (focusedGenre && !container.contains(document.activeElement)) {
    container.querySelector(`[data-genre="${CSS.escape(focusedGenre)}"]`)?.focus({ preventScroll: true });
  }
}

function revealGenreHorizontally(strip, button, { smooth = true } = {}) {
  if (!strip || !button) return;
  const stripRect = strip.getBoundingClientRect();
  const buttonRect = button.getBoundingClientRect();
  const edgeInset = Math.min(28, Math.max(16, strip.clientWidth * .055));
  const safeLeft = stripRect.left + edgeInset;
  const safeRight = stripRect.right - edgeInset;
  let delta = 0;

  if (buttonRect.left < safeLeft) delta = buttonRect.left - safeLeft;
  else if (buttonRect.right > safeRight) delta = buttonRect.right - safeRight;

  strip.scrollTop = 0;
  if (Math.abs(delta) < 1) return;

  const maxLeft = Math.max(0, strip.scrollWidth - strip.clientWidth);
  const left = Math.min(maxLeft, Math.max(0, strip.scrollLeft + delta));
  const behavior = smooth && !state.reducedMotion ? 'smooth' : 'auto';
  if (typeof strip.scrollTo === 'function') strip.scrollTo({ left, top: 0, behavior });
  else strip.scrollLeft = left;
}

function syncGenreStrips({ smooth = true } = {}) {
  reconcileGenreButtons(els.genreStrip, state.genreId, selectGenre);
  syncSheetGenresOnly();

  requestAnimationFrame(() => {
    revealGenreHorizontally(els.genreStrip, els.genreStrip.querySelector('.active'), { smooth });
    revealGenreHorizontally(els.sheetGenreStrip, els.sheetGenreStrip.querySelector('.active'), { smooth });
  });
}

function syncSheetGenresOnly() {
  reconcileGenreButtons(els.sheetGenreStrip, state.sheetFilter, (genreId) => {
    state.sheetFilter = genreId;
    state.sheetMode = 'all';
    renderSheet();
  });
}

function updateUrl() {
  if (!state.hasExplicitNavigation && !location.search && !location.hash) {
    return;
  }
  const url = new URL(location.href);
  const songId = state.pendingSongId || state.songId;
  const song = state.songs.find((entry) => entry.id === songId) || null;

  if (songId) {
    url.searchParams.set('song', songId);
    url.searchParams.delete('genre');
  } else {
    url.searchParams.delete('song');
    if (state.genreId && state.genreId !== 'traditional') {
      url.searchParams.set('genre', state.genreId);
    } else {
      url.searchParams.delete('genre');
    }
  }

  if (
    state.releaseContextId
    && song?.releaseId === state.releaseContextId
    && numericTrackNumber(song) != null
  ) url.searchParams.set('release', state.releaseContextId);
  else url.searchParams.delete('release');

  url.searchParams.delete('browse');
  url.searchParams.delete('source');
  url.searchParams.delete('library');

  // A circle link is the whole listening context: it replaces the song, genre and time.
  if (circle.code) {
    for (const key of ['song', 'genre', 'release', 't']) url.searchParams.delete(key);
    url.searchParams.set('circle', circle.code);
  } else url.searchParams.delete('circle');

  const search = url.searchParams.toString();
  const next = `${url.pathname}${search ? `?${search}` : ''}${url.hash}`;
  const current = `${location.pathname}${location.search}${location.hash}`;
  if (next !== current) {
    history.replaceState(history.state, '', next);
  }
}

function updateFavouriteUI() {
  const song = currentSong();
  const active = song ? state.favourites.has(song.id) : false;
  els.mobileFavourite?.classList.toggle('active', active);
  els.mobileFavourite?.setAttribute('aria-pressed', String(active));
  els.favouritesButton?.classList.toggle('active', active);
  els.favouritesButton?.setAttribute('aria-pressed', String(active));
  state.morphs?.get('favourites')?.morphTo(active ? 'heartFilled' : 'heartOutline');
  state.morphs?.get('mobileFavourite')?.morphTo(active ? 'heartFilled' : 'heartOutline');
}

function automaticUpNextSongs(limit = 12) {
  if (state.releaseContextId) {
    const releaseSongs = orderedReleaseSongs(state.releaseContextId);
    const releaseIds = new Set(releaseSongs.map((song) => song.id));
    const remaining = releaseContinuationSongs(limit);
    if (remaining.length >= limit) return remaining;
    const anchorId = state.releaseContextSongId || state.songId;
    const anchorSong = state.songs.find((song) => song.id === anchorId) || null;
    const generic = automaticGenreContinuation(limit - remaining.length, {
      genreId: anchorSong?.genre || state.playContextGenreId || state.genreId,
      anchorId,
      excludeIds: releaseIds,
    });
    return [...remaining, ...generic].slice(0, limit);
  }
  return automaticGenreContinuation(limit);
}

function manualQueueSongs() {
  sanitiseManualQueue();
  const byId = new Map(state.songs.map((song) => [song.id, song]));
  return state.manualQueue.map((id) => byId.get(id)).filter(Boolean);
}

function getUpNextSongs() {
  const queued = manualQueueSongs();
  const queuedIds = new Set(queued.map((song) => song.id));
  const automatic = automaticUpNextSongs(12).filter((song) => song.id !== state.songId && !queuedIds.has(song.id));
  return [...queued, ...automatic].slice(0, Math.max(12, queued.length + Math.min(8, automatic.length)));
}

function queueSong(songId) {
  if (!songId || songId === state.songId) {
    showToast('That song is already playing.');
    return;
  }
  const queuedSong = state.songs.find((song) => song.id === songId);
  if (!queuedSong) return;
  if (!canExecuteSong(queuedSong)) {
    showToast('This recording is not available to play yet.');
    return;
  }
  if (state.manualQueue.includes(songId)) {
    showToast('Already in Up next.');
    return;
  }
  state.manualQueue.push(songId);
  state.manualQueue = state.manualQueue.slice(0, 30);
  persistManualQueue();
  updateQueueBadge();
  if (state.sheetMode === 'queue') renderSheet();
  showToast('Added to Up next.');
}

// Moves a song to the front of Up next, so it plays after the current one.
function queueSongNext(songId) {
  if (!songId || songId === state.songId) return false;
  const song = state.songs.find((item) => item.id === songId);
  if (!song || !canExecuteSong(song)) return false;
  state.manualQueue = [songId, ...state.manualQueue.filter((id) => id !== songId)].slice(0, 30);
  persistManualQueue();
  updateQueueBadge();
  if (state.sheetMode === 'queue') renderSheet();
  return true;
}

function removeQueuedSong(songId, { announce = true } = {}) {
  const before = state.manualQueue.length;
  state.manualQueue = state.manualQueue.filter((id) => id !== songId);
  if (state.manualQueue.length === before) return false;
  persistManualQueue();
  updateQueueBadge();
  if (state.sheetMode === 'queue') renderSheet();
  if (announce) showToast('Removed from Up next.');
  return true;
}

function clearManualQueue() {
  if (!state.manualQueue.length) return;
  state.manualQueue = [];
  persistManualQueue();
  updateQueueBadge();
  if (state.sheetMode === 'queue') renderSheet();
  showToast('Up next cleared.');
}

function updateQueueBadge() {
  const manualCount = manualQueueSongs().length;
  const count = getUpNextSongs().length;
  els.queueBadge.textContent = manualCount ? (manualCount > 9 ? '9+' : String(manualCount)) : (count > 9 ? '9+' : String(count));
  els.queueBadge.classList.toggle('show', count > 0 && !mobileQuery.matches);
  els.queueButton.dataset.manualCount = String(manualCount);
}

function updateMediaSession() {
  const song = currentSong();
  const genre = currentGenre();
  if (!song || !('mediaSession' in navigator)) return;

  try {
    navigator.mediaSession.metadata = new MediaMetadata({
      title: song.title,
      artist: song.artist,
      album: genre?.label || 'GARBA',
      artwork: [
        { src: 'assets/icons/icon.svg', sizes: 'any', type: 'image/svg+xml' },
      ],
    });
  } catch { /* MediaMetadata may be unavailable inside some webviews */ }
}

function updateMediaPositionState() {
  if (!('mediaSession' in navigator) || !state.duration || !Number.isFinite(state.duration)) return;
  try {
    navigator.mediaSession.setPositionState({
      duration: Math.max(1, state.duration),
      playbackRate: els.audio.playbackRate || 1,
      position: Math.min(Math.max(0, state.elapsed), state.duration),
    });
  } catch { /* Not supported in every browser */ }
}

function renderPlayer() {
  const song = currentSong();
  const genre = currentGenre();
  if (!song || !genre) return;

  if (state.liveMode) {
    els.genreEyebrow.textContent = '🔴 LIVE 24/7 · Global Radio';
    els.app.dataset.liveMode = 'true';
    els.liveStationButton?.setAttribute('aria-pressed', 'true');
  } else {
    els.genreEyebrow.textContent = circle.active ? circle.eyebrow() : genre.label;
    els.app.removeAttribute('data-live-mode');
    els.liveStationButton?.setAttribute('aria-pressed', 'false');
  }
  if (circle.active) els.app.dataset.circleMode = 'true';
  else els.app.removeAttribute('data-circle-mode');
  els.circleButton?.setAttribute('aria-pressed', String(circle.active));
  els.shuffleButton?.setAttribute('aria-pressed', String(state.shuffleMode));
  els.songTitle.textContent = song.title;
  els.songTitle.dataset.songId = song.id;
  const titleLength = [...song.title].length;
  els.trackBlock.classList.toggle('is-long-title', titleLength > 28);
  els.trackBlock.classList.toggle('is-very-long-title', titleLength > 44);
  els.songArtist.textContent = song.artist;
  els.miniTitle.textContent = song.title;
  els.miniArtist.textContent = song.artist;
  els.durationTime.textContent = formatDuration(state.duration || song.durationSeconds);
  els.elapsedTime.textContent = formatTime(state.elapsed);

  const readiness = routeReadiness(song);
  els.app.dataset.playbackReady = String(readiness.executable);
  for (const button of [els.playButton, els.miniPlay]) {
    button.disabled = !readiness.executable;
    button.setAttribute('aria-disabled', String(!readiness.executable));
    if (!readiness.executable) button.title = 'This recording is not available to play yet';
    else if (!state.playing) button.title = 'Play';
  }

  const ratio = state.duration ? Math.min(1, Math.max(0, state.elapsed / state.duration)) : 0;
  els.progress.value = Math.round(ratio * 1000);
  els.progress.style.setProperty('--progress', `${ratio * 100}%`);
  els.miniProgress.style.width = `${ratio * 100}%`;

  updateFavouriteUI();
  updateQueueBadge();
  updateMediaPositionState();
  if (els.shareButton) {
    const shareLabel = song ? `Share ${song.title} by ${song.artist}` : 'Share current song';
    els.shareButton.setAttribute('aria-label', shareLabel);
    els.shareButton.title = shareLabel;
  }
}

async function animateTrackSwap(update) {
  const token = ++state.transitionToken;
  if (state.reducedMotion || !els.trackBlock.animate) {
    update();
    return;
  }

  const out = els.trackBlock.animate(
    [
      { opacity: 1, transform: 'translateY(0)' },
      { opacity: 0, transform: 'translateY(-12px)' },
    ],
    { duration: 170, easing: 'cubic-bezier(.3,.7,.3,1)', fill: 'forwards' }
  );

  try { await out.finished; } catch { /* animation cancelled */ }
  if (token !== state.transitionToken) return;
  update();
  out.cancel();

  els.trackBlock.animate(
    [
      { opacity: 0, transform: 'translateY(12px)' },
      { opacity: 1, transform: 'translateY(0)' },
    ],
    { duration: 230, easing: 'cubic-bezier(.2,.75,.2,1)' }
  );
}

function configureAudio(song, restoreElapsed = 0) {
  els.audio.pause();
  els.audio.removeAttribute('src');
  els.audio.load();
  setPlaying(false);

  state.elapsed = 0;
  state.duration = song.durationSeconds || 0;

  if (song.audioUrl) {
    els.audio.src = song.audioUrl;
    els.audio.load();
    if (restoreElapsed > 0) {
      const setTime = () => {
        els.audio.currentTime = Math.min(restoreElapsed, Number.isFinite(els.audio.duration) ? els.audio.duration : restoreElapsed);
        els.audio.removeEventListener('loadedmetadata', setTime);
      };
      els.audio.addEventListener('loadedmetadata', setTime);
    }
  } else if (restoreElapsed > 0) {
    state.elapsed = Math.min(restoreElapsed, state.duration || restoreElapsed);
  }
}

async function selectSong(songId, options = {}) {
  const song = state.songs.find((entry) => entry.id === songId);
  if (!song) return;

  if (!options.initial) state.pendingSongId = null;
  if (!options.preserveReleaseContext && !options.initial) clearReleaseContext();
  if (options.liveMode) state.liveMode = true;
  else if (!options.preserveContext && !options.initial) state.liveMode = false;
  if (options.circleMode) state.liveMode = false;
  else if (!options.initial) circle.leave();
  if (!state.liveMode) liveSync.stop();

  const previousSongId = state.songId;
  if (previousSongId && previousSongId !== song.id && !options.initial && !options.fromHistory) {
    state.listeningHistory.push(previousSongId);
    state.listeningHistory = state.listeningHistory.slice(-60);
  }
  recordRecentPlayedSong(song.id);
  if (options.consumeQueued) removeQueuedSong(song.id, { announce: false });

  const genre = state.genres.find((entry) => entry.id === song.genre);
  if (!genre) return;

  const wasPlaying = state.playing || els.app?.classList.contains('is-playing') || (window.GARBA_YOUTUBE_PLAYER?.playing === true);
  const genreChanged = song.genre !== state.genreId;
  const restoreElapsed = options.restoreElapsed || 0;

  if (genreChanged) {
    state.genreId = song.genre;
    state.sheetFilter = song.genre;
    els.app.dataset.genre = song.genre;
    setAccent(genre.accent);
  }

  const apply = () => {
    state.songId = song.id;
    state.genreId = song.genre;
    state.sheetFilter = song.genre;
    if (!options.preserveContext) {
      state.playContextGenreId = song.genre;
      state.playContextSongId = song.id;
    }
    if ((options.releaseContextAdvance || options.syncReleaseAnchor) && songBelongsToActiveRelease(song)) {
      state.releaseContextSongId = song.id;
    }
    if (options.consumeQueued && songBelongsToActiveRelease(song)) {
      state.releaseContextConsumedIds.add(song.id);
    }
    configureAudio(song, restoreElapsed);
    renderPlayer();
    updateMediaSession();
    syncGenreStrips({ smooth: !options.initial });
    renderSheet();
    persistSession();
    if (!options.initial) {
      state.hasExplicitNavigation = true;
      updateUrl();
    }
  };

  if (options.animate === false || options.initial) apply();
  else await animateTrackSwap(apply);

  const shouldPlay = Boolean(options.forceAutoplay || state.liveMode || wasPlaying);

  if (wasPlaying && song.audioUrl && options.preservePlayback !== false) {
    if (typeof navigator.onLine === 'boolean' && !navigator.onLine) {
      setPlaying(false);
      showToast('You’re offline. Catalogue browsing is available, but music playback requires an internet connection.');
    } else {
      try { await els.audio.play(); } catch { /* browser can block autoplay after async transitions */ }
    }
  } else if (shouldPlay && options.preservePlayback !== false && canExecuteSong(song)) {
    if (window.GARBA_YOUTUBE_PLAYER?.open) {
      const startSec = Number(options.restoreElapsed || 0);
      window.GARBA_YOUTUBE_PLAYER.open(song, {
        autoplay: true,
        resume: startSec > 0,
        startSeconds: startSec,
      }).catch(() => {});
    }
  }

  if (!options.keepSheet && mobileQuery.matches && state.sheetSnap !== 'closed') setSheetSnap('collapsed');
}

function selectGenre(genreId) {
  state.hasExplicitNavigation = true;
  const genre = state.genres.find((entry) => entry.id === genreId);
  if (!genre) return;
  if (genreId === state.genreId) {
    clearReleaseContext();
    const song = currentSong();
    if (song) {
      state.playContextGenreId = song.genre;
      state.playContextSongId = song.id;
    }
    state.sheetFilter = genreId;
    syncGenreStrips();
    updateQueueBadge();
    updateUrl();
    // Tapping the genre that is already playing shows its songs.
    if (state.sheetSnap === 'closed' || state.sheetSnap === 'collapsed') openSheet('all', { trigger: els.genreStrip });
    return;
  }

  // A genre tap starts playing straight away: a complete song not heard recently, when there is one.
  const next = playableOrder().pickFresh(songsForGenre(genreId), { recentIds: getRecentPlayedSongs().slice(-40) });
  if (next) selectSong(next.id, { keepSheet: true, preservePlayback: true, forceAutoplay: true });
  else {
    state.genreId = genreId;
    state.sheetFilter = genreId;
    els.app.dataset.genre = genreId;
    setAccent(genre.accent);
    syncGenreStrips();
    renderSheet();
    updateUrl();
  }
}

function playerSearchRecord(song) {
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
    song,
  };
}

function rankPlayerSongs(songs, query) {
  return rankSearchRecords(songs.map(playerSearchRecord), query)
    .map(({ record }) => record.song);
}

function getSheetSongs() {
  const rawQuery = els.searchInput.value.trim();
  const query = normalizeSearchText(rawQuery);
  let songs;

  if (state.sheetMode === 'favourites') {
    songs = state.songs.filter((song) => state.favourites.has(song.id) || song.userAdded);
  } else if (state.sheetMode === 'queue') {
    songs = getUpNextSongs();
  } else if (state.sheetMode === 'search') {
    if (!query) {
      state.sheetMatchCount = state.songs.length;
      return [];
    }
    songs = state.songs;
  } else {
    songs = state.songs.filter((song) => song.genre === state.sheetFilter);
  }

  if (query) songs = rankPlayerSongs(songs, rawQuery);
  // Songs that can play right now come first (complete songs, then chapters), in every list but the queue.
  if (state.sheetMode !== 'queue') songs = playableOrder().order(songs);
  state.sheetMatchCount = songs.length;
  if (state.sheetMode === 'search' && songs.length > SEARCH_RESULT_LIMIT) return songs.slice(0, SEARCH_RESULT_LIMIT);
  return songs;
}

function renderSheet() {
  els.songSheet.classList.toggle('mode-favourites', state.sheetMode === 'favourites');
  els.songSheet.classList.toggle('mode-queue', state.sheetMode === 'queue');
  els.songSheet.classList.toggle('mode-search', state.sheetMode === 'search');
  els.sheetTitle.textContent = state.sheetMode === 'favourites' ? 'My Garba' : state.sheetMode === 'queue' ? 'Up next' : state.sheetMode === 'search' ? 'Search' : 'Songs';

  syncSheetGenresOnly();

  if (state.sheetSnap === 'closed') {
    els.songList.replaceChildren();
    if (els.sheetSummary) els.sheetSummary.textContent = '';
    return;
  }

  const query = els.searchInput.value.trim();
  const songs = getSheetSongs();
  els.songList.innerHTML = '';
  if (state.sheetMode === 'all' || state.sheetMode === 'favourites') {
    const add = document.createElement('button');
    add.type = 'button';
    add.className = 'add-song-row';
    add.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"></path></svg><span></span>';
    add.querySelector('span').textContent = 'Add a song from YouTube';
    add.addEventListener('click', () => mySongs.open({ genre: state.sheetMode === 'all' ? state.sheetFilter : state.genreId }));
    els.songList.append(add);
  }

  if (els.sheetSummary) {
    if (state.sheetMode === 'search') {
      if (!query) els.sheetSummary.textContent = `${state.songs.length.toLocaleString()} songs`;
      else if (state.sheetMatchCount > songs.length) els.sheetSummary.textContent = `Showing ${songs.length} of ${state.sheetMatchCount.toLocaleString()}`;
      else els.sheetSummary.textContent = `${state.sheetMatchCount.toLocaleString()} ${state.sheetMatchCount === 1 ? 'match' : 'matches'}`;
    } else if (state.sheetMode === 'queue') {
      const queued = manualQueueSongs().length;
      const continuing = Math.max(0, songs.length - queued);
      els.sheetSummary.textContent = queued ? `${queued} queued · ${continuing} continue` : `${continuing} continue`;
    } else {
      els.sheetSummary.textContent = `${state.sheetMatchCount.toLocaleString()} ${state.sheetMatchCount === 1 ? 'song' : 'songs'}`;
    }
  }

  if (!songs.length) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    const strong = document.createElement('strong');
    const copy = document.createElement('span');
    if (state.sheetMode === 'favourites') {
      strong.textContent = 'My Garba is empty';
      copy.textContent = 'Tap the heart beside a song to save it here.';
    } else if (state.sheetMode === 'queue') {
      strong.textContent = 'Nothing up next';
      copy.textContent = 'Choose a genre or another song to continue listening.';
    } else if (state.sheetMode === 'search' && !query) {
      strong.textContent = `Search ${state.songs.length.toLocaleString()} songs`;
      copy.textContent = 'Type a song, artist, genre or style to see matching results.';
    } else {
      strong.textContent = 'No songs found';
      copy.textContent = query ? 'Try a different search.' : 'This genre is waiting for catalogue data.';
    }
    empty.append(strong, copy);
    els.songList.append(empty);
    return;
  }

  const fragment = document.createDocumentFragment();
  const queuedIds = new Set(state.manualQueue);
  let continuationLabelAdded = false;
  let unavailableLabelAdded = false;
  if (state.sheetMode === 'queue' && state.manualQueue.length) {
    const toolbar = document.createElement('div');
    toolbar.className = 'queue-toolbar';
    const label = document.createElement('span');
    label.textContent = 'Queued';
    const clear = document.createElement('button');
    clear.type = 'button';
    clear.className = 'queue-clear';
    clear.textContent = 'Clear';
    clear.addEventListener('click', clearManualQueue);
    toolbar.append(label, clear);
    fragment.append(toolbar);
  }
  songs.forEach((song, index) => {
    const queued = state.sheetMode === 'queue' && queuedIds.has(song.id);
    if (state.sheetMode === 'queue' && state.manualQueue.length && !queued && !continuationLabelAdded) {
      continuationLabelAdded = true;
      const label = document.createElement('div');
      label.className = 'queue-section-label';
      label.textContent = 'Continue playing';
      fragment.append(label);
    }
    const unavailable = state.sheetMode !== 'queue' && playableOrder().tier(song) === PLAYABLE_TIER.UNAVAILABLE;
    if (unavailable && !unavailableLabelAdded) {
      unavailableLabelAdded = true;
      const label = document.createElement('div');
      label.className = 'queue-section-label song-section-unavailable';
      label.textContent = 'Not playable here yet';
      fragment.append(label);
    }
    const row = document.createElement('div');
    row.className = `song-row${song.id === state.songId ? ' current' : ''}${unavailable ? ' song-row--unavailable' : ''}`;
    row.role = 'listitem';

    const idx = document.createElement('span');
    idx.className = 'song-index';
    idx.textContent = String(index + 1).padStart(2, '0');

    const copy = document.createElement('button');
    copy.type = 'button';
    copy.className = 'song-copy';
    copy.setAttribute('aria-label', `Play ${song.title} by ${song.artist}`);
    const title = document.createElement('strong');
    title.textContent = song.title;
    const artist = document.createElement('small');
    artist.textContent = song.userAdded && song.artist !== 'Added by you' ? `${song.artist} · Added by you` : song.artist;
    copy.append(title, artist);
    const releaseContinuation = state.sheetMode === 'queue'
      && !queued
      && releaseContinuationSongs().some((entry) => entry.id === song.id);
    copy.addEventListener('click', () => selectSong(song.id, {
      keepSheet: true,
      preserveContext: queued || releaseContinuation,
      preserveReleaseContext: queued || releaseContinuation,
      releaseContextAdvance: releaseContinuation,
      consumeQueued: queued,
      preservePlayback: true,
      forceAutoplay: true,
    }));

    const duration = document.createElement('span');
    duration.className = 'song-duration';
    duration.textContent = formatDuration(song.durationSeconds);

    const queuePlayable = Boolean(song.youtubeId);
    const queueAction = document.createElement('button');
    queueAction.type = 'button';
    queueAction.className = 'song-queue-action';
    queueAction.hidden = !queuePlayable || song.id === state.songId;
    queueAction.disabled = !queuePlayable || song.id === state.songId;
    queueAction.setAttribute('aria-label', queued ? `Remove ${song.title} from Up next` : `Play ${song.title} next`);
    queueAction.title = queued ? 'Remove from Up next' : 'Play next';
    queueAction.innerHTML = queued
      ? '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 7l10 10M17 7 7 17"></path></svg>'
      : '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7h8M5 12h8M5 17h5"></path><path d="M17 8v9M13.5 13.5 17 17l3.5-3.5"></path></svg>';
    queueAction.addEventListener('click', () => queued ? removeQueuedSong(song.id) : queueSong(song.id));

    const favourite = document.createElement('button');
    favourite.type = 'button';
    favourite.className = `heart-button song-favourite${state.favourites.has(song.id) ? ' active' : ''}`;
    favourite.setAttribute('aria-label', state.favourites.has(song.id) ? `Remove ${song.title} from My Garba` : `Save ${song.title} to My Garba`);
    favourite.setAttribute('aria-pressed', String(state.favourites.has(song.id)));
    favourite.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.8 4.9a5.5 5.5 0 0 0-7.8 0L12 5.9l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.3 1-1a5.5 5.5 0 0 0 0-7.8Z"></path></svg>';
    favourite.addEventListener('click', () => toggleFavourite(song.id));

    row.classList.toggle('manually-queued', queued);
    row.append(idx, copy, duration, queueAction, favourite);
    fragment.append(row);
  });

  if (state.sheetMode === 'search' && state.sheetMatchCount > songs.length) {
    const hint = document.createElement('div');
    hint.className = 'search-result-hint';
    hint.setAttribute('role', 'status');
    hint.textContent = `Showing the first ${songs.length} of ${state.sheetMatchCount.toLocaleString()} matches. Keep typing to narrow the list.`;
    fragment.append(hint);
  }

  els.songList.append(fragment);
}

function toggleFavourite(songId = state.songId) {
  if (!songId) return;
  const willAdd = !state.favourites.has(songId);
  if (willAdd) state.favourites.add(songId);
  else state.favourites.delete(songId);
  persistFavourites();
  updateFavouriteUI();
  renderSheet();
  showToast(willAdd ? 'Saved to My Garba.' : 'Removed from My Garba.');
}

function cancelPendingSearchFocus() {
  if (state.searchFocusTimer == null) return;
  clearTimeout(state.searchFocusTimer);
  state.searchFocusTimer = null;
}

function placeFavourite() {
  // #mobileFavourite lives permanently inside .controls (after #nextButton).
  // Nothing moves it — it is always visible there on both mobile and desktop.
}


function syncSheetChrome() {
  const snap = state.sheetSnap || 'closed';
  const modal = mobileQuery.matches && (snap === 'medium' || snap === 'full');
  if (els.sheetBackdrop) {
    els.sheetBackdrop.hidden = !modal;
    els.sheetBackdrop.setAttribute('aria-hidden', String(!modal));
  }
  els.songSheet?.setAttribute('aria-modal', String(modal));
  if (els.sheetClose) {
    els.sheetClose.title = 'Close song browser';
    els.sheetClose.setAttribute('aria-label', 'Close song browser');
  }
}

function closeProviderOutside(event) {
  const stage = document.querySelector('#providerStage.open[aria-hidden="false"]');
  if (!stage || !(event.target instanceof Element)) return;
  if (stage.contains(event.target) || els.playButton?.contains(event.target) || $('miniPlay')?.contains(event.target)) return;
  stage.querySelector('#providerDockStop')?.click();
}

function setSheetSnap(snap) {
  const allowed = ['closed', 'collapsed', 'medium', 'full'];
  state.sheetSnap = allowed.includes(snap) ? snap : 'closed';
  els.songSheet.dataset.snap = state.sheetSnap;
  els.app.dataset.sheetSnap = state.sheetSnap;
  const open = state.sheetSnap !== 'closed';
  els.songSheet.setAttribute('aria-hidden', String(!open));
  if (els.browseButton?.hasAttribute('aria-controls')) els.browseButton.setAttribute('aria-expanded', String(open));
  if (!open) {
    cancelPendingSearchFocus();
    els.songSheet.classList.remove('searching');
    els.searchInput.blur();
  }
  syncSheetChrome();
}

function preferredOpenSnap(mode) {
  if (!mobileQuery.matches) return 'full';
  if (mode === 'search') return 'full';
  return 'medium';
}

function openSheet(mode = 'all', options = {}) {
  cancelPendingSearchFocus();
  const wasClosed = state.sheetSnap === 'closed';
  if (wasClosed && options.trigger instanceof HTMLElement) state.sheetTrigger = options.trigger;
  state.sheetMode = mode;
  if (state.sheetMode === 'all') state.sheetFilter = state.genreId;
  if (state.sheetMode !== 'search') els.searchInput.value = '';
  const snap = options.snap || preferredOpenSnap(mode);
  setSheetSnap(snap);
  renderSheet();

  if (wasClosed && options.history !== false) {
    history.pushState({ ...(history.state || {}), garbaSheet: true }, '', location.href);
  }

  if (mode === 'search') {
    els.songSheet.classList.add('searching');
    state.searchFocusTimer = setTimeout(() => {
      state.searchFocusTimer = null;
      if (state.sheetMode !== 'search' || state.sheetSnap === 'closed') return;
      if (els.songSheet.getAttribute('aria-hidden') !== 'false') return;
      if (!els.songSheet.classList.contains('searching')) return;
      els.searchInput.focus({ preventScroll: true });
    }, state.reducedMotion ? 0 : (mobileQuery.matches ? 150 : 450));
  }
}

function closeSheet({ fromHistory = false } = {}) {
  cancelPendingSearchFocus();
  if (!fromHistory && history.state?.garbaSheet) {
    history.back();
    return;
  }
  setSheetSnap('closed');
  const trigger = state.sheetTrigger;
  state.sheetTrigger = null;
  if (trigger?.isConnected) {
    if (state.reducedMotion) trigger.focus({ preventScroll: true });
    else setTimeout(() => trigger.focus({ preventScroll: true }), 0);
  }
}

async function togglePlay() {
  const song = currentSong();
  if (!song) return;

  if (window.GARBA_YOUTUBE_PLAYER?.canPlay?.(song)) {
    if (!state.playing) {
      setPlaying(true);
    }
    window.GARBA_YOUTUBE_PLAYER.toggle(song);
    return;
  }

  if (state.playing) {
    els.audio.pause();
    return;
  }

  if (typeof navigator.onLine === 'boolean' && !navigator.onLine) {
    showToast('Playback needs an internet connection. Reconnect to play.');
    return;
  }

  if (song.audioUrl) {
    try { await els.audio.play(); }
    catch { showToast('Playback could not start. Check the approved audio source.'); }
    return;
  }

  showToast('Add an approved audio source for this track before publishing.');
}

function toggleShuffle() {
  state.shuffleMode = !state.shuffleMode;
  storage.set('garba:shuffle', state.shuffleMode);
  els.shuffleButton?.setAttribute('aria-pressed', String(state.shuffleMode));
  state.morphs?.get('shuffle')?.morphTo(state.shuffleMode ? 'shuffleActive' : 'shuffleInactive');
  showToast(state.shuffleMode ? 'Shuffle turned on.' : 'Shuffle turned off.');
}

async function toggleLiveStation() {
  if (state.liveMode) {
    state.liveMode = false;
    liveSync.stop();
    els.app.removeAttribute('data-live-mode');
    els.liveStationButton?.setAttribute('aria-pressed', 'false');
    renderPlayer();
    showToast('Exited 24/7 Live Radio.');
    return;
  }

  const liveState = liveSync.broadcastAt();
  if (!liveState || !liveState.song) {
    showToast('24/7 Live Radio is tuning in...');
    return;
  }
  circle.leave({ quiet: true });

  state.liveMode = true;
  els.app.dataset.liveMode = 'true';
  els.liveStationButton?.setAttribute('aria-pressed', 'true');
  state.morphs?.get('live')?.pulse();
  showToast('Tuning into 24/7 Live Garba Radio...');

  // Tune once after the server clock is measured; playback then progresses locally without
  // repeated broadcast seeks or nudges.
  liveSync.start().then((joinedState) => {
    if (state.liveMode && joinedState?.song) {
      showToast(`Tuned into 24/7 Live Garba Radio · ${joinedState.song.title}`);
    }
  });
}

function changeSong(direction) {
  if (circle.active) {
    circle.handleChangeSong();
    return;
  }

  if (state.liveMode) {
    if (direction < 0) {
      showToast('24/7 Live Radio follows its song order. Turn off Live to choose another song.');
      return;
    }
    const nextLive = getNextLiveTrack(state.songs, state.songId);
    if (nextLive) selectSong(nextLive.id, { keepSheet: true, preservePlayback: true, liveMode: true });
    return;
  }

  if (direction < 0 && state.listeningHistory.length) {
    const previousId = state.listeningHistory.pop();
    if (previousId) {
      selectSong(previousId, {
        keepSheet: true,
        preservePlayback: true,
        preserveContext: true, fromHistory: true,
        preserveReleaseContext: true,
        syncReleaseAnchor: true,
      });
      return;
    }
  }

  if (direction > 0) {
    sanitiseManualQueue();
    const queuedId = state.manualQueue.shift();
    if (queuedId) {
      persistManualQueue();
      selectSong(queuedId, {
        keepSheet: true,
        preservePlayback: true,
        preserveContext: true,
        preserveReleaseContext: true,
        consumeQueued: true,
      });
      return;
    }
  }

  // A pasted playlist plays through in its own order; picking a song outside it leaves the playlist
  if (direction > 0 && state.playlist) {
    const at = state.playlist.ids.indexOf(state.songId);
    const nextId = at >= 0 ? state.playlist.ids[at + 1] : null;
    if (nextId && state.songs.some((song) => song.id === nextId)) {
      selectSong(nextId, { keepSheet: true, preservePlayback: true, preserveContext: true });
      return;
    }
    state.playlist = null;
  }

  if (direction > 0 && state.releaseContextId) {
    const nextReleaseSong = releaseContinuationSongs(1)[0];
    if (nextReleaseSong) {
      selectSong(nextReleaseSong.id, {
        keepSheet: true,
        preservePlayback: true,
        preserveContext: true,
        preserveReleaseContext: true,
        releaseContextAdvance: true,
      });
      return;
    }

    const releaseSongs = orderedReleaseSongs(state.releaseContextId);
    const releaseIds = new Set(releaseSongs.map((song) => song.id));
    const anchorId = state.releaseContextSongId || state.songId;
    const anchorSong = state.songs.find((song) => song.id === anchorId) || null;
    const nextGeneric = automaticGenreContinuation(1, {
      genreId: anchorSong?.genre || state.playContextGenreId || state.genreId,
      anchorId,
      excludeIds: releaseIds,
    })[0];
    clearReleaseContext();
    if (nextGeneric) {
      selectSong(nextGeneric.id, { keepSheet: true, preservePlayback: true });
      return;
    }
    updateQueueBadge();
    renderSheet();
    updateUrl();
    return;
  }

  const genreId = state.playContextGenreId || state.genreId;
  const list = songsForGenre(genreId).filter(canExecuteSong);
  if (!list.length) return;

  if (state.shuffleMode && direction > 0) {
    const recentHistory = [...getRecentPlayedSongs(), ...state.listeningHistory];
    const minBuffer = Math.min(5, Math.max(1, list.length - 1));
    let candidates = [];
    for (const count of [80, 50, 35, 20, 10, 5, 2, 1, 0]) {
      const excludeSet = new Set(recentHistory.slice(-count));
      excludeSet.add(state.songId);
      const filtered = list.filter((song) => !excludeSet.has(song.id));
      if (filtered.length >= minBuffer || (count === 0 && filtered.length > 0)) {
        candidates = filtered;
        break;
      }
    }
    const pool = candidates.length ? candidates : list.filter((song) => song.id !== state.songId);
    if (pool.length) {
      const randomSong = pool[Math.floor(Math.random() * pool.length)];
      selectSong(randomSong.id, { keepSheet: true, preservePlayback: true });
      return;
    }
  }

  const anchorId = state.playContextSongId || state.songId;
  let index = list.findIndex((song) => song.id === anchorId);
  index = index < 0 ? 0 : (index + direction + list.length) % list.length;
  selectSong(list[index].id, { keepSheet: true, preservePlayback: true });
}

// Circle playback: position the YouTube player first, then switch the visible song in the same
// synchronous turn (no swap animation). The YouTube runtime reopens whatever song the title shows
// when the title re-renders, so the two must never disagree, even for one animation frame.
async function playCircleSong(song, offsetSeconds) {
  window.GARBA_YOUTUBE_PLAYER?.openAt?.(song, offsetSeconds).catch(() => {});
  if (song.id === state.songId) {
    state.elapsed = offsetSeconds;
    renderPlayer();
    return;
  }
  await selectSong(song.id, { circleMode: true, keepSheet: true, preservePlayback: false, restoreElapsed: offsetSeconds, animate: false });
}

// Live Radio playback: same ordering rule as playCircleSong, so the title never disagrees with the player.
async function playLiveSong(song, offsetSeconds) {
  window.GARBA_YOUTUBE_PLAYER?.openAt?.(song, offsetSeconds).catch(() => {});
  if (song.id === state.songId) {
    state.elapsed = offsetSeconds;
    renderPlayer();
    return;
  }
  await selectSong(song.id, { liveMode: true, keepSheet: true, preservePlayback: false, restoreElapsed: offsetSeconds, animate: false });
}

/* ----------------------------- Explore overlay ----------------------------- */
// The full Explore page (/explore/) opens in a frame over the player, so playback keeps going.
// It talks back through explore-continuity-bridge.js (version 1): ready, close and listen.
const EXPLORE_BRIDGE_TYPE = 'playgarba:explore-continuity';
const EXPLORE_BRIDGE_VERSION = 1;
window.__PLAYGARBA_EXPLORE_CONTINUITY_PARENT__ = Object.freeze({ version: EXPLORE_BRIDGE_VERSION });
const exploreOverlay = { open: false, root: null, frame: null, trigger: null };

function buildExploreOverlay() {
  const root = document.createElement('div');
  root.className = 'explore-overlay';
  root.id = 'exploreOverlay';
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  root.setAttribute('aria-label', 'Explore PlayGarba');
  root.hidden = true;
  const frame = document.createElement('iframe');
  frame.className = 'explore-frame';
  frame.title = 'Explore PlayGarba';
  root.append(frame);
  document.body.append(root);
  root.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closeExplore();
  });
  exploreOverlay.root = root;
  exploreOverlay.frame = frame;
}

function openExplore() {
  if (!exploreOverlay.root) buildExploreOverlay();
  if (exploreOverlay.open) return;
  const href = els.browseButton?.getAttribute('href') || './explore/';
  const target = new URL(href, location.href);
  // Load once and keep the page (scroll, open collection) between visits.
  if (!exploreOverlay.frame.src) exploreOverlay.frame.src = target.toString();
  exploreOverlay.trigger = document.activeElement instanceof HTMLElement ? document.activeElement : els.browseButton;
  exploreOverlay.open = true;
  exploreOverlay.root.hidden = false;
  document.documentElement.classList.add('explore-open');
  els.browseButton?.setAttribute('aria-expanded', 'true');
  const entry = { ...(history.state || {}), garbaSheet: false, garbaExplore: true };
  if (history.state?.garbaSheet) history.replaceState(entry, '', location.href);
  else history.pushState(entry, '', location.href);
  exploreOverlay.frame.focus({ preventScroll: true });
}

function closeExplore({ fromHistory = false, restoreFocus = true } = {}) {
  if (!exploreOverlay.open) return Promise.resolve();
  exploreOverlay.open = false;
  exploreOverlay.root.hidden = true;
  document.documentElement.classList.remove('explore-open');
  els.browseButton?.setAttribute('aria-expanded', 'false');
  const leaving = !fromHistory && history.state?.garbaExplore;
  if (restoreFocus && exploreOverlay.trigger?.isConnected) exploreOverlay.trigger.focus({ preventScroll: true });
  if (!leaving) return Promise.resolve();
  // Resolve once the Explore history entry is gone, so the next URL update lands on the right entry.
  return new Promise((resolve) => {
    const done = () => {
      clearTimeout(timer);
      window.removeEventListener('popstate', done);
      resolve();
    };
    const timer = setTimeout(done, 400);
    window.addEventListener('popstate', done);
    history.back();
  });
}

async function playFromExplore({ songId, releaseId } = {}) {
  const song = state.songs.find((entry) => entry.id === songId);
  if (!song) return;
  await closeExplore({ restoreFocus: false });
  const inRelease = typeof releaseId === 'string' && releaseId && setReleaseContext(releaseId, song.id);
  selectSong(song.id, {
    preservePlayback: true,
    forceAutoplay: true,
    preserveReleaseContext: Boolean(inRelease),
    syncReleaseAnchor: Boolean(inRelease),
  });
}

window.addEventListener('message', (event) => {
  if (event.origin !== location.origin || !exploreOverlay.frame || event.source !== exploreOverlay.frame.contentWindow) return;
  const message = event.data;
  if (!message || message.type !== EXPLORE_BRIDGE_TYPE || message.version !== EXPLORE_BRIDGE_VERSION) return;
  if (message.action === 'close') closeExplore();
  else if (message.action === 'listen') playFromExplore(message.payload || {});
});

function circleHostElapsedSeconds() {
  const player = window.GARBA_YOUTUBE_PLAYER;
  const elapsed = player?.activeSongId === state.songId ? player.elapsedSeconds : null;
  return Number.isFinite(elapsed) ? elapsed : state.elapsed;
}

function cycleSheetSnap(direction = 1) {
  if (!mobileQuery.matches) return;
  const order = ['collapsed', 'medium', 'full'];
  if (state.sheetSnap === 'closed') {
    setSheetSnap('medium');
    renderSheet();
    return;
  }
  const index = order.indexOf(state.sheetSnap);
  const next = Math.max(0, Math.min(order.length - 1, index + direction));
  setSheetSnap(order[next]);
}

function setupSheetGestures() {
  let startY = null;
  let pointerId = null;
  let suppressClick = false;

  const start = (event) => {
    if (!mobileQuery.matches) return;
    pointerId = event.pointerId;
    startY = event.clientY;
    els.sheetHandle.setPointerCapture?.(pointerId);
  };

  const end = (event) => {
    if (startY == null || event.pointerId !== pointerId) return;
    const delta = event.clientY - startY;
    if (Math.abs(delta) > 48) {
      suppressClick = true;
      if (delta > 0) {
        if (state.sheetSnap === 'full') setSheetSnap('medium');
        else if (state.sheetSnap === 'medium') setSheetSnap('collapsed');
        else closeSheet();
      } else {
        if (state.sheetSnap === 'collapsed') setSheetSnap('medium');
        else setSheetSnap('full');
      }
    }
    startY = null;
    pointerId = null;
  };

  els.sheetHandle.addEventListener('pointerdown', start);
  els.sheetHandle.addEventListener('pointerup', end);
  els.sheetHandle.addEventListener('pointercancel', () => { startY = null; pointerId = null; suppressClick = false; });
  els.sheetHandle.addEventListener('click', () => {
    if (!mobileQuery.matches) return;
    if (suppressClick) {
      suppressClick = false;
      return;
    }
    if (state.sheetSnap === 'collapsed') setSheetSnap('medium');
    else if (state.sheetSnap === 'medium') setSheetSnap('full');
    else if (state.sheetSnap === 'full') setSheetSnap('medium');
  });
}

function setupMediaSessionActions() {
  if (!('mediaSession' in navigator)) return;
  const pauseActive = () => {
    if (window.GARBA_YOUTUBE_PLAYER?.canPlay?.(currentSong())) {
      window.GARBA_YOUTUBE_PLAYER.toggle(currentSong());
    } else {
      els.audio.pause();
    }
  };
  const seekToPosition = (targetSec) => {
    const song = currentSong();
    if (window.GARBA_YOUTUBE_PLAYER?.canPlay?.(song)) {
      window.GARBA_YOUTUBE_PLAYER.seekTo?.(targetSec);
    } else if (els.audio.src) {
      els.audio.currentTime = targetSec;
    } else {
      state.elapsed = targetSec;
      renderPlayer();
    }
  };

  const actions = {
    play: () => togglePlay(),
    pause: () => pauseActive(),
    stop: () => pauseActive(),
    previoustrack: () => changeSong(-1),
    nexttrack: () => changeSong(1),
    seekbackward: (details) => {
      if (!state.duration) return;
      const next = Math.max(0, state.elapsed - (details.seekOffset || 10));
      seekToPosition(next);
    },
    seekforward: (details) => {
      if (!state.duration) return;
      const next = Math.min(state.duration, state.elapsed + (details.seekOffset || 10));
      seekToPosition(next);
    },
    seekto: (details) => {
      if (typeof details.seekTime === 'number') seekToPosition(details.seekTime);
    },
  };

  Object.entries(actions).forEach(([action, handler]) => {
    try { navigator.mediaSession.setActionHandler(action, handler); } catch { /* action not supported */ }
  });
}

function isStandalone() {
  return standaloneQuery.matches || window.navigator.standalone === true;
}

function installDismissedRecently() {
  const dismissedAt = storage.get('garba:install-dismissed', 0);
  return Date.now() - Number(dismissedAt || 0) < 7 * 24 * 60 * 60 * 1000;
}

function installSurfaceIsBusy() {
  if (state.sheetSnap !== 'closed') return true;
  return Boolean(document.querySelector([
    '#providerStage.open[aria-hidden="false"]',
    '#youtubeStage.open[aria-hidden="false"]',
    'dialog[open]',
    '[role="dialog"][aria-modal="true"]:not([aria-hidden="true"]):not([hidden])',
  ].join(', ')));
}

function showInstallBanner({ ios = false } = {}) {
  if (isStandalone() || installDismissedRecently() || installSurfaceIsBusy()) {
    els.installBanner.hidden = true;
    return false;
  }
  if (ios) {
    els.installTitle.textContent = 'Add GARBA to Home Screen';
    els.installText.textContent = 'In Safari, use Share → Add to Home Screen.';
    els.installButton.textContent = 'Got it';
    els.installButton.dataset.mode = 'ios';
  } else {
    els.installTitle.textContent = 'Install GARBA';
    els.installText.textContent = 'Keep the full-screen player one tap away.';
    els.installButton.textContent = 'Install';
    els.installButton.dataset.mode = 'prompt';
  }
  els.installBanner.hidden = false;
  return true;
}

function setupPwaInstall() {
  const LISTENING_VALUE_MS = 15000;
  const LISTENING_VALUE_KEY = 'garba:install-listening-value';
  const ua = navigator.userAgent;
  const isIpadDesktopUa = navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
  const isIos = (/iPad|iPhone|iPod/.test(ua) || isIpadDesktopUa) && !window.MSStream;
  const isSafari = /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS/.test(ua);
  const canOfferIosGuidance = isIos && isSafari && !isStandalone();
  let hasListeningValue = storage.get(LISTENING_VALUE_KEY, false) === true;
  let listeningValueTimer = null;

  const currentInstallMode = () => {
    if (canOfferIosGuidance) return 'ios';
    return state.installPrompt ? 'prompt' : null;
  };

  const maybeShowInstallBanner = () => {
    if (!hasListeningValue) {
      els.installBanner.hidden = true;
      return;
    }
    const mode = currentInstallMode();
    if (!mode) {
      els.installBanner.hidden = true;
      return;
    }
    showInstallBanner({ ios: mode === 'ios' });
  };

  const markListeningValue = () => {
    if (hasListeningValue) return;
    hasListeningValue = true;
    storage.set(LISTENING_VALUE_KEY, true);
    maybeShowInstallBanner();
  };

  const reconcileListeningValue = () => {
    if (hasListeningValue) {
      maybeShowInstallBanner();
      return;
    }
    const confirmedPlaying = els.app?.classList.contains('is-playing') === true;
    if (!confirmedPlaying) {
      clearTimeout(listeningValueTimer);
      listeningValueTimer = null;
      return;
    }
    if (listeningValueTimer != null) return;
    listeningValueTimer = setTimeout(() => {
      listeningValueTimer = null;
      if (els.app?.classList.contains('is-playing')) markListeningValue();
    }, LISTENING_VALUE_MS);
  };

  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    state.installPrompt = event;
    maybeShowInstallBanner();
  });

  window.addEventListener('appinstalled', () => {
    state.installPrompt = null;
    els.installBanner.hidden = true;
    showToast('GARBA installed.');
  });

  els.installDismiss.addEventListener('click', () => {
    storage.set('garba:install-dismissed', Date.now());
    els.installBanner.hidden = true;
  });

  els.installButton.addEventListener('click', async () => {
    if (els.installButton.dataset.mode === 'ios') {
      storage.set('garba:install-dismissed', Date.now());
      els.installBanner.hidden = true;
      showToast('Use Safari Share, then Add to Home Screen.');
      return;
    }
    if (!state.installPrompt) return;
    await state.installPrompt.prompt();
    await state.installPrompt.userChoice.catch(() => null);
    state.installPrompt = null;
    els.installBanner.hidden = true;
  });

  if (els.app && 'MutationObserver' in window) {
    const playingObserver = new MutationObserver(reconcileListeningValue);
    playingObserver.observe(els.app, { attributes: true, attributeFilter: ['class'] });
  }

  if ('MutationObserver' in window) {
    const blockerObserver = new MutationObserver(maybeShowInstallBanner);
    const blockers = [
      els.songSheet,
      document.getElementById('providerStage'),
      document.getElementById('youtubeStage'),
      ...document.querySelectorAll('dialog, [role="dialog"]'),
    ].filter((node, index, nodes) => node && nodes.indexOf(node) === index);
    blockers.forEach((node) => blockerObserver.observe(node, {
      attributes: true,
      attributeFilter: ['class', 'aria-hidden', 'hidden', 'open'],
    }));
  }

  document.addEventListener('click', () => setTimeout(maybeShowInstallBanner, 0));
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') setTimeout(maybeShowInstallBanner, 0);
  });

  reconcileListeningValue();
  maybeShowInstallBanner();
}

let updateApplied = false;

function registerServiceWorker() {
  if (!('serviceWorker' in navigator) || location.protocol === 'file:') return;

  const isActivelyPlaying = () => state.playing || els.app?.classList.contains('is-playing') === true;

  window.addEventListener('load', async () => {
    try {
      const registration = await navigator.serviceWorker.register('./sw.js');

      const handleWaitingWorker = (worker) => {
        if (!worker || updateApplied) return;

        if (isActivelyPlaying()) {
          showToast('Update available. It will apply when playback is paused.');

          const onPlaybackIdle = () => {
            if (updateApplied) return;
            if (!isActivelyPlaying()) {
              updateApplied = true;
              persistSession();
              worker.postMessage({ type: 'SKIP_WAITING' });
            }
          };

          els.audio?.addEventListener('pause', onPlaybackIdle, { once: true });
          els.audio?.addEventListener('ended', onPlaybackIdle, { once: true });

          if (els.app && 'MutationObserver' in window) {
            const idleObserver = new MutationObserver(() => {
              if (!isActivelyPlaying()) {
                idleObserver.disconnect();
                onPlaybackIdle();
              }
            });
            idleObserver.observe(els.app, { attributes: true, attributeFilter: ['class'] });
          }
        } else {
          updateApplied = true;
          persistSession();
          worker.postMessage({ type: 'SKIP_WAITING' });
        }
      };

      if (registration.waiting && navigator.serviceWorker.controller) {
        handleWaitingWorker(registration.waiting);
      }

      registration.addEventListener('updatefound', () => {
        const installing = registration.installing;
        if (!installing) return;

        installing.addEventListener('statechange', () => {
          if (installing.state === 'installed' && navigator.serviceWorker.controller) {
            handleWaitingWorker(installing);
          }
        });
      });
    } catch (error) {
      console.warn('Service worker registration failed', error);
    }
  });

  const hadControllerOnLoad = Boolean(navigator.serviceWorker.controller);
  let refreshing = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadControllerOnLoad || !updateApplied || refreshing) return;
    if (isActivelyPlaying()) return;
    const lastReload = Number(sessionStorage.getItem('garba:sw-reload-at') || 0);
    if (Date.now() - lastReload < 10000) return;
    sessionStorage.setItem('garba:sw-reload-at', String(Date.now()));
    refreshing = true;
    persistSession();
    window.location.reload();
  });
}


async function handleShareCurrentSong() {
  if (window.GARBA_NONSTOP?.activeSet) {
    if (typeof window.GARBA_NONSTOP.share === 'function') {
      return window.GARBA_NONSTOP.share();
    }
  }
  const song = currentSong();
  if (!song) return null;

  const elapsed = Math.round(state.elapsed || 0);
  const duration = Math.round(state.duration || song.durationSeconds || 0);
  const includeTimestamp = elapsed > 5 && (duration > 0 ? elapsed < duration - 5 : true);
  const timestampSeconds = includeTimestamp ? elapsed : 0;

  const url = buildSongShareUrl?.({
    songId: song.id,
    timestampSeconds,
  }) || `${location.origin}/?song=${encodeURIComponent(song.id)}${timestampSeconds > 0 ? `&t=${timestampSeconds}` : ''}`;

  const title = song.title || 'PlayGarba';
  const text = formatShareText?.({ title: song.title, artist: song.artist, context: 'song' })
    || `Listen to "${title}" on PlayGarba`;

  if (executeShare) {
    const result = await executeShare({ title, text, url });
    if (result?.status === 'copied') showToast('Link copied to clipboard');
    else if (result?.status === 'failed') showToast('Unable to copy link');
    return result;
  }
  return null;
}

function openLinkSongCard() {
  if (!els.linkSongCard || !els.linkSongButton) return;
  const moreCard = $('moreCard');
  if (moreCard && !moreCard.hidden) {
    const moreClose = document.querySelector('[data-more-close]');
    moreClose?.click();
  }
  els.linkSongCard.hidden = false;
  els.linkSongButton.setAttribute('aria-expanded', 'true');
  if (els.linkSongStatus) els.linkSongStatus.textContent = '';
  setTimeout(() => els.linkSongInput?.focus(), 30);
}

function closeLinkSongCard(restore = true) {
  if (!els.linkSongCard || !els.linkSongButton || els.linkSongCard.hidden) return;
  els.linkSongCard.hidden = true;
  els.linkSongButton.setAttribute('aria-expanded', 'false');
  if (els.linkSongInput) els.linkSongInput.value = '';
  if (els.linkSongStatus) els.linkSongStatus.textContent = '';
  if (restore) els.linkSongButton.focus({ preventScroll: true });
}

// A pasted playlist plays in order: its videos join the listener's songs on this device, the linked video (or the
// first) starts, and Next walks the playlist. Titles fill in from YouTube as they arrive.
async function playYouTubePlaylist(listId, startVideoId) {
  const say = (text) => { if (els.linkSongStatus) els.linkSongStatus.textContent = text; };
  say('Opening your playlist…');
  const videoIds = await resolveYouTubePlaylist(listId);
  if (!videoIds.length) {
    if (startVideoId) { say(''); return playYouTubeUrl(startVideoId); }
    say('That playlist could not be opened. It may be private or empty.');
    showToast('That playlist could not be opened. It may be private or empty.');
    return false;
  }
  say('');
  closeLinkSongCard();
  let saved = [];
  try { saved = JSON.parse(localStorage.getItem('garba:my-songs:v1') || '[]'); } catch {}
  if (!Array.isArray(saved)) saved = [];
  const known = new Map(saved.filter((entry) => entry?.videoId).map((entry) => [entry.videoId, entry]));
  const genre = state.genreId || 'traditional';
  const now = Date.now();
  const entries = videoIds.map((videoId, index) => known.get(videoId)
    || { videoId, title: `Playlist track ${index + 1}`, artist: 'Your playlist', genre, addedAt: now - index, placeholder: true });
  const inList = new Set(videoIds);
  try {
    const stored = [...entries, ...saved.filter((entry) => !inList.has(entry?.videoId))].slice(0, 200)
      .map(({ placeholder, ...entry }) => entry);
    localStorage.setItem('garba:my-songs:v1', JSON.stringify(stored));
  } catch {}
  state.songs = withMySongs(catalogueSongs, { reload: true });
  const ids = videoIds.map((videoId) => findSongByVideoId(videoId)?.id).filter(Boolean);
  if (!ids.length) {
    showToast('That playlist could not be opened. It may be private or empty.');
    return false;
  }
  const startSong = startVideoId ? findSongByVideoId(startVideoId) : null;
  const startId = startSong && ids.includes(startSong.id) ? startSong.id : ids[0];
  state.playlist = { id: listId, ids };
  showToast(`Playing your playlist · ${ids.length} ${ids.length === 1 ? 'song' : 'songs'}`);
  await selectSong(startId, { preservePlayback: true, forceAutoplay: true });

  // Real titles from YouTube, a few at a time, for the tracks that don't have one yet
  const pending = entries.filter((entry) => entry.placeholder).map((entry) => entry.videoId);
  const fill = async () => {
    while (pending.length) {
      const videoId = pending.shift();
      const details = await fetchVideoDetails(videoId).catch(() => null);
      if (!details?.title) continue;
      const clean = cleanVideoTitle(details.title, details.channel);
      const song = state.songs.find((item) => item.userAdded && item.youtubeId === videoId);
      if (song) { song.title = clean.title || details.title; if (clean.artist) song.artist = clean.artist; }
      try {
        const list = JSON.parse(localStorage.getItem('garba:my-songs:v1') || '[]');
        const entry = Array.isArray(list) ? list.find((item) => item?.videoId === videoId) : null;
        if (entry) {
          entry.title = clean.title || details.title;
          if (clean.artist) entry.artist = clean.artist;
          localStorage.setItem('garba:my-songs:v1', JSON.stringify(list));
        }
      } catch {}
      if (song && state.songId === song.id) renderPlayer();
    }
  };
  Promise.all([fill(), fill(), fill()]).then(() => renderSheet()).catch(() => {});
  return true;
}

async function playYouTubeUrl(value) {
  const listId = parseYouTubePlaylist(value);
  if (listId) return playYouTubePlaylist(listId, parseYouTubeLink(value));
  const videoId = parseYouTubeLink(value);
  if (!videoId) {
    if (els.linkSongStatus) els.linkSongStatus.textContent = 'Please enter a valid YouTube link or video ID.';
    return false;
  }
  if (els.linkSongStatus) els.linkSongStatus.textContent = '';
  closeLinkSongCard();

  const existing = findSongByVideoId(videoId);
  if (existing) {
    showToast(`Playing “${existing.title}”`);
    await selectSong(existing.id, { preservePlayback: true, forceAutoplay: true });
    return true;
  }

  const newSong = makeUserSong({
    videoId,
    title: 'YouTube Track',
    artist: 'Custom track',
    genre: state.genreId || 'traditional',
    addedAt: Date.now(),
  });

  if (!newSong) {
    showToast('Could not load track from YouTube link.');
    return false;
  }

  try {
    const raw = localStorage.getItem('garba:my-songs:v1') || '[]';
    const list = JSON.parse(raw);
    const updated = [
      { videoId: newSong.youtubeId, title: newSong.title, artist: newSong.artist, genre: newSong.genre, addedAt: newSong.addedAt },
      ...list.filter((entry) => entry?.videoId !== newSong.youtubeId),
    ].slice(0, 200);
    localStorage.setItem('garba:my-songs:v1', JSON.stringify(updated));
  } catch {}

  state.songs = withMySongs(catalogueSongs, { reload: true });
  if (!state.songs.some((s) => s.id === newSong.id)) {
    state.songs = [...state.songs, newSong];
  }

  showToast('Playing YouTube track');
  await selectSong(newSong.id, { preservePlayback: true, forceAutoplay: true });

  fetchVideoDetails(videoId).then((details) => {
    if (details?.title) {
      const clean = cleanVideoTitle(details.title, details.channel);
      newSong.title = clean.title || details.title;
      if (clean.artist) newSong.artist = clean.artist;
      try {
        const raw = localStorage.getItem('garba:my-songs:v1') || '[]';
        const list = JSON.parse(raw);
        const entry = list.find((e) => e?.videoId === videoId);
        if (entry) {
          entry.title = newSong.title;
          entry.artist = newSong.artist;
          localStorage.setItem('garba:my-songs:v1', JSON.stringify(list));
        }
      } catch {}
      if (state.songId === newSong.id) renderPlayer();
      renderSheet();
    }
  }).catch(() => {});

  return true;
}

function wireEvents() {
  let searchTimer = null;
  els.playButton.addEventListener('click', togglePlay);
  els.miniPlay.addEventListener('click', togglePlay);
  els.prevButton.addEventListener('click', () => changeSong(-1));
  els.nextButton.addEventListener('click', () => changeSong(1));
  els.miniPrev.addEventListener('click', () => changeSong(-1));
  els.miniNext.addEventListener('click', () => changeSong(1));

  els.browseButton?.addEventListener('click', (event) => {
    // Explore is its own page (/explore/). While music is playing, a plain click opens that page over
    // the player instead, so the song keeps going; otherwise the link navigates as usual.
    // Modified clicks (new tab, new window) always keep the ordinary link behaviour.
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const playing = state.playing || window.GARBA_YOUTUBE_PLAYER?.playing === true || els.app?.classList.contains('is-playing');
    if (!playing) return;
    event.preventDefault();
    // Hand the song sheet's history entry to Explore instead of racing a Back navigation.
    if (state.sheetSnap !== 'closed') closeSheet({ fromHistory: true });
    openExplore();
  });
  els.sheetClose.addEventListener('click', closeSheet);
  els.sheetBackdrop?.addEventListener('click', () => closeSheet());
  els.mobileFavourite.addEventListener('click', () => toggleFavourite());
  els.favouritesButton.addEventListener('click', () => openSheet('favourites', { trigger: els.favouritesButton }));
  els.queueButton.addEventListener('click', () => openSheet('queue', { trigger: els.queueButton }));
  els.searchButton.addEventListener('click', () => openSheet('search', { trigger: els.searchButton }));
  els.linkSongButton?.addEventListener('click', (event) => {
    event.stopPropagation();
    if (els.linkSongCard && !els.linkSongCard.hidden) closeLinkSongCard(true);
    else openLinkSongCard();
  });
  els.linkSongClose?.addEventListener('click', () => closeLinkSongCard(true));
  els.linkSongForm?.addEventListener('submit', (event) => {
    event.preventDefault();
    playYouTubeUrl(els.linkSongInput?.value);
  });
  els.shareButton?.addEventListener('click', handleShareCurrentSong);

  els.searchInput.addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(renderSheet, 70);
  });
  els.searchInput.addEventListener('focus', () => {
    els.songSheet.classList.add('searching');
    if (mobileQuery.matches && state.sheetSnap !== 'full') setSheetSnap('full');
  });

  els.progress.addEventListener('input', () => {
    if (!state.duration) return;
    const next = Number(els.progress.value) / 1000 * state.duration;
    if (els.audio.src) els.audio.currentTime = next;
    else state.elapsed = next;
    renderPlayer();
  });

  els.audio.addEventListener('play', () => { setPlaying(true); renderPlayer(); });
  els.audio.addEventListener('pause', () => { setPlaying(false); renderPlayer(); persistSession(); });
  els.audio.addEventListener('loadedmetadata', () => {
    state.duration = els.audio.duration || currentSong()?.durationSeconds || 0;
    renderPlayer();
  });
  els.audio.addEventListener('timeupdate', () => {
    state.elapsed = els.audio.currentTime;
    state.duration = els.audio.duration || state.duration;
    renderPlayer();
    const rounded = Math.round(state.elapsed);
    if (rounded % 5 === 0 && rounded !== state.lastPersistedElapsed) {
      state.lastPersistedElapsed = rounded;
      persistSession();
    }
  });
  els.audio.addEventListener('ended', () => changeSong(1));

  els.shuffleButton?.addEventListener('click', toggleShuffle);
  els.liveStationButton?.addEventListener('click', toggleLiveStation);
  els.circleButton?.addEventListener('click', () => circle.toggle());

  document.addEventListener('keydown', (event) => {
    if (event.target instanceof HTMLInputElement) return;
    if (event.key === '/') {
      event.preventDefault();
      openSheet('search', { trigger: els.searchButton });
      return;
    }
    if (event.code === 'Space') { event.preventDefault(); togglePlay(); }
    if (event.code === 'ArrowRight') changeSong(1);
    if (event.code === 'ArrowLeft') changeSong(-1);
    if (event.key === 's' || event.key === 'S') { event.preventDefault(); toggleShuffle(); }
    if (event.key === 'l' || event.key === 'L') { event.preventDefault(); toggleLiveStation(); }
    if (event.code === 'Escape' || event.key === 'Escape') {
      if (els.linkSongCard && !els.linkSongCard.hidden) {
        event.preventDefault();
        closeLinkSongCard(true);
        return;
      }
      const stage = document.querySelector('#providerStage.open[aria-hidden="false"]');
      if (stage) {
        event.preventDefault();
        stage.querySelector('#providerDockStop')?.click();
        return;
      }
      if (els.songSheet.classList.contains('searching')) {
        cancelPendingSearchFocus();
        els.songSheet.classList.remove('searching');
        els.searchInput.blur();
      } else closeSheet();
      return;
    }
    if (event.key.toLowerCase() === 'f') toggleFavourite();
  });

  document.addEventListener('click', closeProviderOutside);
  document.addEventListener('click', (event) => {
    if (els.linkSongCard && !els.linkSongCard.hidden && !els.linkSongCard.contains(event.target) && event.target !== els.linkSongButton && !els.linkSongButton?.contains(event.target)) {
      closeLinkSongCard(false);
    }
  });

  window.addEventListener('offline', () => showToast('You’re offline. Catalogue browsing is available, but music playback requires an internet connection.'));
  window.addEventListener('online', () => {
    showToast('Back online.');
    refreshCatalogue({ quiet: true });
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && Date.now() - state.catalogueLoadedAt > 5 * 60 * 1000) refreshCatalogue({ quiet: true });
  });
  window.addEventListener('popstate', () => {
    if (exploreOverlay.open) {
      closeExplore({ fromHistory: true });
      return;
    }
    if (state.sheetSnap !== 'closed') {
      closeSheet({ fromHistory: true });
    }
  });
  window.addEventListener('pagehide', persistSession);

  mobileQuery.addEventListener?.('change', () => {
    if (!mobileQuery.matches && state.sheetSnap !== 'closed') setSheetSnap('full');
    placeFavourite();
    syncSheetChrome();
    syncGenreStrips({ smooth: false });
  });

  window.addEventListener('pageshow', () => {
    placeFavourite();
    syncSheetChrome();
  });

  window.addEventListener('garba:catalogue-ready', () => {
    refreshCatalogue({ quiet: true });
  });

  setupSheetGestures();
}

async function fetchCatalogue() {
  if (window.GARBA_FAST_BOOT?.hydrate && !window.GARBA_FAST_BOOT.hydrated) {
    try { await window.GARBA_FAST_BOOT.hydrate(); } catch {}
  }
  const [genresResponse, songsResponse] = await Promise.all([
    fetch('data/genres.json', { cache: 'no-store' }),
    fetch('data/songs.json', { cache: 'no-store' }),
  ]);
  if (!genresResponse.ok || !songsResponse.ok) throw new Error('Failed to load catalogue');
  const [genres, allSongs] = await Promise.all([genresResponse.json(), songsResponse.json()]);
  const songs = [];
  const presentationRedirects = new Map();
  for (const song of allSongs) {
    const role = String(song?.presentationRole || 'catalogue');
    if (role === 'catalogue') songs.push(song);
    else if (song?.id) presentationRedirects.set(song.id, song);
  }
  return { genres, songs, presentationRedirects };
}

function makeCatalogueSignature(genres, songs) {
  return JSON.stringify({
    genres: genres.map((genre) => [genre.id, genre.label, genre.background, genre.accent]),
    songs: songs.map((song) => [song.id, song.title, song.artist, song.genre, song.releaseId, song.trackNumber, song.durationSeconds, song.audioUrl, song.youtubeId]),
  });
}

async function refreshCatalogue({ quiet = false } = {}) {
  try {
    const next = await fetchCatalogue();
    const signature = makeCatalogueSignature(next.genres, next.songs);
    const changed = state.catalogueSignature && signature !== state.catalogueSignature;
    state.genres = next.genres;
    state.songs = withMySongs(next.songs, { reload: true });
    state.presentationRedirects = next.presentationRedirects;
    if (state.releaseContextId && !releaseContextMatch(state.releaseContextId, state.releaseContextSongId || state.songId)) {
      clearReleaseContext();
    }
    reconcilePresentationFavourites();
    sanitiseManualQueue();
    state.catalogueSignature = signature;
    state.catalogueLoadedAt = Date.now();

    if (state.pendingSongId) {
      const pendingSong = state.songs.find((entry) => entry.id === state.pendingSongId);
      state.pendingSongId = null;
      if (pendingSong) {
        await selectSong(pendingSong.id, { initial: true, animate: false, keepSheet: true });
        updateUrl();
        if (changed && !quiet) showToast('Song catalogue updated.');
        return;
      }
    }

    let song = currentSong();
    let genre = currentGenre();
    if (!genre) {
      genre = state.genres.find((entry) => entry.id === 'traditional') || state.genres[0];
      state.genreId = genre?.id || state.genreId;
    }
    if (!song) {
      song = state.songs.find((entry) => entry.genre === state.genreId) || state.songs[0];
      if (song) {
        state.songId = song.id;
        state.genreId = song.genre;
        state.sheetFilter = song.genre;
        state.duration = song.durationSeconds || 0;
        state.elapsed = 0;
      }
    }

    const activeGenre = currentGenre();
    if (activeGenre) setAccent(activeGenre.accent);
    renderPlayer();
    syncGenreStrips({ smooth: false });
    renderSheet();
    if (changed && !quiet) showToast('Song catalogue updated.');
  } catch (error) {
    if (!quiet) console.warn('Catalogue refresh failed', error);
  }
}

function resolveInitialState() {
  const params = new URLSearchParams(location.search);
  const requestedSong = params.get('song');
  const requestedGenre = params.get('genre');
  const requestedRelease = params.get('release');
  const hasInitialExplicitSong = Boolean(requestedSong || requestedRelease || params.get('nonstop'));
  const hasInitialExplicitNavigation = Boolean(
    hasInitialExplicitSong
    || requestedGenre
    || params.get('library')
    || params.get('browse')
  );
  const session = storage.get('garba:session', {});
  let targetSongId = requestedSong;
  const redirect = targetSongId ? state.presentationRedirects.get(targetSongId) : null;
  let pendingNonstopSetId = null;
  if (redirect?.presentationRole === 'nonstop-only' && redirect.nonstopSetId) {
    pendingNonstopSetId = redirect.nonstopSetId;
    const url = new URL(location.href);
    url.searchParams.delete('song');
    url.searchParams.set('nonstop', pendingNonstopSetId);
    history.replaceState(history.state, '', url.pathname + url.search + url.hash);
    targetSongId = redirect.canonicalSongId || null;
  } else if (redirect?.canonicalSongId) {
    targetSongId = redirect.canonicalSongId;
  }
  const pendingSongId = targetSongId && !state.songs.some((entry) => entry.id === targetSongId) ? targetSongId : null;

  let song = targetSongId ? state.songs.find((entry) => entry.id === targetSongId) : null;
  let pickedByShuffle = false;
  let genre = requestedGenre ? state.genres.find((entry) => entry.id === requestedGenre) : null;

  // Shuffle starter on reload or initial direct visit (when no specific song was explicitly requested)
  if (!hasInitialExplicitSong && !song && !pendingSongId) {
    const recentHistory = getRecentPlayedSongs();
    const playableSongs = state.songs.filter(canExecuteSong);

    if (genre) {
      // Case A: User explicitly opened a genre link (e.g. ?genre=dandiya) -> shuffle fresh song within that genre
      const genrePlayable = playableSongs.filter((entry) => entry.genre === genre.id);
      if (genrePlayable.length) {
        const maxExclude = Math.max(0, genrePlayable.length - Math.min(genrePlayable.length, 5));
        const excludeSet = new Set(recentHistory.slice(-maxExclude));
        const freshInGenre = genrePlayable.filter((entry) => !excludeSet.has(entry.id));
        const pool = freshInGenre.length ? freshInGenre : genrePlayable;
        song = pool[Math.floor(Math.random() * pool.length)];
        pickedByShuffle = true;
      }
    } else {
      // Case B: General visit / reload (playgarba.com) -> draw freely from the ENTIRE pool of playable songs across all genres
      // Exclude recently heard songs (up to 100+ songs) so each reload gives a fresh song and never repeats songs heard a few clicks/reloads ago
      const maxExclude = Math.max(0, playableSongs.length - 100);
      const excludeSet = new Set(recentHistory.slice(-maxExclude));
      const freshPool = playableSongs.filter((entry) => !excludeSet.has(entry.id));
      const pool = freshPool.length ? freshPool : playableSongs;
      song = pool[Math.floor(Math.random() * pool.length)];
      if (song) {
        genre = state.genres.find((entry) => entry.id === song.genre) || state.genres[0];
        pickedByShuffle = true;
      }
    }

    if (song) {
      recordRecentPlayedSong(song.id);
    }
  }

  const preserveRequestedIdentity = Boolean(song && targetSongId && song.id === targetSongId);
  const preserveRestoredIdentity = Boolean(song && !targetSongId && session.songId && song.id === session.songId && hasInitialExplicitNavigation);

  if (!genre && song) genre = state.genres.find((entry) => entry.id === song.genre);
  if (!genre && session.genreId && hasInitialExplicitNavigation) genre = state.genres.find((entry) => entry.id === session.genreId);
  if (!genre) genre = state.genres.find((entry) => entry.id === 'traditional') || state.genres[0];

  if (!song || (!pickedByShuffle && !(preserveRequestedIdentity || preserveRestoredIdentity) && song.genre !== genre.id)) {
    song = state.songs.find((entry) => entry.genre === genre.id && canExecuteSong(entry))
      || state.songs.find((entry) => entry.genre === genre.id)
      || state.songs.find(canExecuteSong)
      || state.songs[0];
  }
  const releaseContext = requestedRelease
    && requestedSong
    && song?.id === requestedSong
    && !pendingNonstopSetId
    ? releaseContextMatch(requestedRelease, requestedSong)
    : null;
  const requestedTimestamp = parseShareTimestamp?.(params.get('t'), song?.durationSeconds) ?? null;
  const elapsed = requestedTimestamp != null && requestedTimestamp > 0
    ? requestedTimestamp
    : Number(session.elapsed || 0);
  return {
    genre,
    song,
    pendingSongId,
    releaseContextId: releaseContext?.releaseId || null,
    elapsed,
    browse: params.get('browse') === '1',
    myGarba: params.get('library') === 'my-garba',
    pendingNonstopSetId,
    hasInitialExplicitNavigation,
  };
}

async function init() {
  try {
    const catalogue = await fetchCatalogue();
    state.genres = catalogue.genres;
    state.songs = withMySongs(catalogue.songs, { reload: true });
    state.presentationRedirects = catalogue.presentationRedirects;
    reconcilePresentationFavourites();
    sanitiseManualQueue();
    state.catalogueSignature = makeCatalogueSignature(state.genres, catalogue.songs);
    state.catalogueLoadedAt = Date.now();
    const initial = resolveInitialState();
    const circleCode = new URLSearchParams(location.search).get('circle');
    const circleStart = circleCode ? circle.prepareJoin(circleCode) : null;
    if (circleCode) initial.hasInitialExplicitNavigation = true;
    if (circleStart) {
      initial.song = circleStart.song;
      initial.genre = state.genres.find((entry) => entry.id === circleStart.song.genre) || initial.genre;
      initial.elapsed = circleStart.offsetSeconds;
      initial.releaseContextId = null;
    }
    state.hasExplicitNavigation = initial.hasInitialExplicitNavigation;

    state.genreId = initial.genre.id;
    state.sheetFilter = initial.genre.id;
    state.songId = initial.song?.id || null;
    state.duration = initial.song?.durationSeconds || 0;
    els.app.dataset.genre = initial.genre.id;
    setAccent(initial.genre.accent);

    if (els.favouritesButton) {
      els.favouritesButton.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z"></path></svg>';
    }

    state.morphs = initMorphicons(els);
    els.shuffleButton?.setAttribute('aria-pressed', String(state.shuffleMode));
    state.morphs?.get('shuffle')?.morphTo(state.shuffleMode ? 'shuffleActive' : 'shuffleInactive', { instant: true });

    if (initial.song) await selectSong(initial.song.id, { initial: true, animate: false, restoreElapsed: initial.elapsed, keepSheet: true });
    else {
      renderPlayer();
      syncGenreStrips({ smooth: false });
      renderSheet();
    }

    if (initial.releaseContextId && initial.song) {
      setReleaseContext(initial.releaseContextId, initial.song.id);
      renderPlayer();
      renderSheet();
    } else clearReleaseContext();

    state.pendingSongId = initial.pendingSongId;
    if (initial.pendingNonstopSetId) {
      setTimeout(() => window.GARBA_NONSTOP?.play?.(initial.pendingNonstopSetId, { quiet: true }), 0);
    }
    if (initial.myGarba) openSheet('favourites', { snap: 'full', history: false });
    else if (initial.browse) openSheet('all', { snap: 'full', history: false });
    updateUrl();
  } catch (error) {
    console.error(error);
    showToast('Catalogue could not load. The app shell is ready, but song data is unavailable.');
  }
}

function applyExploreHandoff() {
  const params = new URLSearchParams(location.search);
  const requestedSong = params.get('song');
  if (!requestedSong) return;

  let handoff = null;
  try { handoff = JSON.parse(sessionStorage.getItem('playgarba:route-handoff') || 'null'); } catch { return; }
  if (!handoff || handoff.v !== 1 || handoff.songId !== requestedSong || Date.now() - Number(handoff.at || 0) > 15000) return;
  try { sessionStorage.removeItem('playgarba:route-handoff'); } catch { /* storage can be unavailable */ }

  const genreMeta = {
    traditional: { label: 'Traditional Garba', background: 'assets/backgrounds/traditional.svg', accent: '#d6b06f' },
    dandiya: { label: 'Dandiya Raas', background: 'assets/backgrounds/dandiya.svg', accent: '#a77ad6' },
    devotional: { label: 'Devotional Garba', background: 'assets/backgrounds/devotional.svg', accent: '#c78372' },
    folk: { label: 'Gujarati Folk', background: 'assets/backgrounds/folk.svg', accent: '#9a9fc7' },
    sanedo: { label: 'Sanedo', background: 'assets/backgrounds/sanedo.svg', accent: '#c99872' },
    fusion: { label: 'Modern Fusion Garba', background: 'assets/backgrounds/fusion.svg', accent: '#a78bc4' },
  };
  const genreId = genreMeta[handoff.genre] ? handoff.genre : 'traditional';
  const genre = genreMeta[genreId];
  const root = document.documentElement;

  root.dataset.songHandoff = 'true';
  root.style.setProperty('--accent', genre.accent);
  if (els.app) els.app.dataset.genre = genreId;
  if (els.worldA) els.worldA.style.backgroundImage = `url("${genre.background}")`;
  if (els.songTitle && handoff.title) els.songTitle.textContent = handoff.title;
  if (els.songArtist && handoff.artist) els.songArtist.textContent = handoff.artist;
  if (els.genreEyebrow) els.genreEyebrow.textContent = genre.label;
  if (els.miniTitle && handoff.title) els.miniTitle.textContent = handoff.title;
  if (els.miniArtist && handoff.artist) els.miniArtist.textContent = handoff.artist;
  document.querySelectorAll('[data-static-genre="true"]').forEach((button) => {
    const active = button.dataset.genre === genreId;
    button.classList.toggle('active', active);
    if (active) button.setAttribute('aria-current', 'true');
    else button.removeAttribute('aria-current');
  });

  const clear = () => { delete root.dataset.songHandoff; };
  window.setTimeout(clear, 1100);
  window.addEventListener('pagereveal', (event) => {
    if (event.viewTransition) event.viewTransition.finished.catch(() => {}).finally(clear);
  }, { once: true });
}

let dandiyaAudioCtx = null;

function playDandiyaTap() {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    if (!dandiyaAudioCtx || dandiyaAudioCtx.state === 'closed') {
      dandiyaAudioCtx = new AudioCtx();
    }
    if (dandiyaAudioCtx.state === 'suspended') {
      dandiyaAudioCtx.resume();
    }
    const t = dandiyaAudioCtx.currentTime;

    // Body resonance of the Dandiya wooden stick
    const bodyOsc = dandiyaAudioCtx.createOscillator();
    const bodyGain = dandiyaAudioCtx.createGain();
    const bodyFilter = dandiyaAudioCtx.createBiquadFilter();

    bodyFilter.type = 'bandpass';
    bodyFilter.frequency.setValueAtTime(820, t);
    bodyFilter.Q.setValueAtTime(1.8, t);

    bodyOsc.type = 'triangle';
    bodyOsc.frequency.setValueAtTime(880, t);
    bodyOsc.frequency.exponentialRampToValueAtTime(520, t + 0.045);

    bodyGain.gain.setValueAtTime(0.68, t);
    bodyGain.gain.exponentialRampToValueAtTime(0.001, t + 0.065);

    bodyOsc.connect(bodyFilter);
    bodyFilter.connect(bodyGain);
    bodyGain.connect(dandiyaAudioCtx.destination);

    // High snap transient of stick contact
    const snapOsc = dandiyaAudioCtx.createOscillator();
    const snapGain = dandiyaAudioCtx.createGain();
    snapOsc.type = 'sine';
    snapOsc.frequency.setValueAtTime(1750, t);
    snapOsc.frequency.exponentialRampToValueAtTime(980, t + 0.025);

    snapGain.gain.setValueAtTime(0.32, t);
    snapGain.gain.exponentialRampToValueAtTime(0.001, t + 0.028);

    snapOsc.connect(snapGain);
    snapGain.connect(dandiyaAudioCtx.destination);

    bodyOsc.start(t);
    bodyOsc.stop(t + 0.07);
    snapOsc.start(t);
    snapOsc.stop(t + 0.035);
  } catch {
    // Non-blocking tactile feedback
  }
}

function setupMicroBeatFeedback() {
  let lastTapTime = 0;
  const triggerTap = (event) => {
    const now = Date.now();
    if (now - lastTapTime < 60) return;
    const target = event.target;
    if (target instanceof Element && target.closest('button, a, input[type="range"], [role="button"], .genre-button, #nonstopButton, .browse-button, .live-station-button')) {
      lastTapTime = now;
      playDandiyaTap();
    }
  };
  if (window.PointerEvent) {
    document.addEventListener('pointerdown', triggerTap, { capture: true, passive: true });
  } else {
    document.addEventListener('click', triggerTap, { capture: true, passive: true });
  }
}

function setupInteractionHardening() {
  document.addEventListener('contextmenu', (event) => {
    if (!event.target.closest('input, textarea')) {
      event.preventDefault();
    }
  }, { capture: true });

  document.addEventListener('dragstart', (event) => {
    if (!event.target.closest('input, textarea')) {
      event.preventDefault();
    }
  }, { capture: true });
}

window.addEventListener('garba:playback-state-change', (event) => {
  // While a recording is still loading, the buttons answer the tap straight away, but the player
  // only counts as playing once YouTube confirms it (playback atomicity contract).
  if (event.detail?.loading) {
    setPlayPending();
    return;
  }
  setPlaying(Boolean(event.detail?.playing));
  if (event.detail?.playing) hideResumePrompt();
});

/* ----------------------------- Continue after the phone paused ----------------------------- */
// Phones pause the YouTube player when the browser goes to the background or the screen locks,
// and a web page cannot keep it playing. When the listener comes back, offer one tap to continue
// (never resume on our own), and a link to the same recording in the YouTube app.
const resumeState = { left: null, el: null, timer: null };

function formatResumeTime(seconds) {
  const safe = Math.max(0, Math.floor(Number(seconds) || 0));
  const h = Math.floor(safe / 3600);
  const m = Math.floor((safe % 3600) / 60);
  const sec = String(safe % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
}

function hideResumePrompt() {
  clearTimeout(resumeState.timer);
  if (resumeState.el) resumeState.el.hidden = true;
}

function showResumePrompt(song) {
  const player = window.GARBA_YOUTUBE_PLAYER;
  if (!resumeState.el) {
    const el = document.createElement('div');
    el.className = 'resume-prompt';
    el.setAttribute('role', 'status');
    el.hidden = true;
    el.innerHTML = '<span class="resume-copy"></span><button type="button" class="resume-continue"></button><a class="resume-youtube" target="_blank" rel="noopener noreferrer">Open in YouTube</a><button type="button" class="resume-close" aria-label="Dismiss"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"></path></svg></button>';
    el.querySelector('.resume-close').addEventListener('click', hideResumePrompt);
    el.querySelector('.resume-continue').addEventListener('click', () => {
      hideResumePrompt();
      const current = currentSong();
      if (current && window.GARBA_YOUTUBE_PLAYER?.toggle) window.GARBA_YOUTUBE_PLAYER.toggle(current);
      else togglePlay();
    });
    document.body.append(el);
    resumeState.el = el;
  }
  const elapsed = player?.activeSongId === song.id && Number.isFinite(player.elapsedSeconds) ? player.elapsedSeconds : state.elapsed;
  const shared = state.liveMode ? 'Live Radio' : circle.active ? 'the circle' : '';
  resumeState.el.querySelector('.resume-copy').textContent = shared ? 'Your phone paused the music.' : `Paused at ${formatResumeTime(elapsed)} when you left.`;
  resumeState.el.querySelector('.resume-continue').textContent = shared ? `Rejoin ${shared}` : 'Continue';
  const videoId = youtubeVideoId(song);
  const link = resumeState.el.querySelector('.resume-youtube');
  link.hidden = !videoId;
  if (videoId) {
    const at = Math.floor(Number(song.youtubeStartSeconds || 0) + Number(elapsed || 0));
    link.href = `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}${at > 0 ? `&t=${at}s` : ''}`;
  }
  resumeState.el.hidden = false;
  clearTimeout(resumeState.timer);
  resumeState.timer = setTimeout(hideResumePrompt, 60000);
}

document.addEventListener('visibilitychange', () => {
  const player = window.GARBA_YOUTUBE_PLAYER;
  if (document.visibilityState === 'hidden') {
    const song = currentSong();
    resumeState.left = song && (state.playing || player?.playing) ? { songId: song.id } : null;
    return;
  }
  const left = resumeState.left;
  resumeState.left = null;
  if (!left) return;
  // Give the player a moment to report its real state after the page wakes up.
  setTimeout(() => {
    const song = currentSong();
    if (!song || window.GARBA_YOUTUBE_PLAYER?.playing) return;
    if (song.id !== left.songId && !state.liveMode && !circle.active) return;
    showResumePrompt(song);
  }, 900);
});

const circle = createCircleController({
  songs: () => state.songs,
  currentSong,
  hostElapsedSeconds: circleHostElapsedSeconds,
  playCircleSong,
  showToast,
  onChange: () => {
    if (circle.code) state.hasExplicitNavigation = true;
    renderPlayer();
    updateUrl();
  },
  trigger: () => els.circleButton,
});

const mySongs = createMySongs({
  genres: () => state.genres,
  findByVideoId: findSongByVideoId,
  onChange: () => {
    const playing = currentSong();
    state.songs = withMySongs(catalogueSongs);
    // A removed song that is still playing stays until the listener moves on.
    if (playing?.userAdded && !state.songs.includes(playing)) state.songs = [...state.songs, playing];
    renderSheet();
  },
  play: (song) => selectSong(song.id, { preservePlayback: true, forceAutoplay: true }),
  showToast,
});

const liveSync = createLiveSync({
  songs: () => state.songs,
  isLive: () => state.liveMode,
  playLiveSong,
  showToast,
});

applyExploreHandoff();
placeFavourite();
syncSheetChrome();
wireEvents();
setupMediaSessionActions();
setupMicroBeatFeedback();
setupInteractionHardening();
setupPwaInstall();
registerServiceWorker();
init();

window.GARBA_APP = Object.freeze({
  getCurrentSong: () => currentSong(),
  getState: () => state,
  getCircle: () => circle.diagnostics(),
  getLiveSync: () => liveSync.diagnostics(),
});

// A small same-page contract for the isolated Garbo prototype. Playback stays owned by this app;
// the prototype receives a read-only snapshot and sends actions back through existing controls.
window.GARBA_IMMERSIVE_PLAYER = Object.freeze({
  async syncCatalogue() {
    await refreshCatalogue({ quiet: true });
    return this.snapshot({ includeCatalogue: true });
  },
  async loadNonstopCatalogue() {
    const listSets = window.GARBA_NONSTOP?.list;
    if (typeof listSets !== 'function') throw new Error('Nonstop catalogue is unavailable');
    const sets = await listSets();
    if (!Array.isArray(sets)) throw new Error('Nonstop catalogue is invalid');
    return sets.map((set) => {
      const segments = Array.isArray(set.segments) ? set.segments : [];
      const chapters = segments
        .filter((segment) => typeof segment?.title === 'string'
          && segment.title.trim()
          && Number.isFinite(segment.startSeconds)
          && segment.startSeconds >= 0)
        .map((segment) => ({ title: segment.title, startSeconds: segment.startSeconds }));
      const lastEnd = segments.reduce((duration, segment) => (
        Number.isFinite(segment?.endSeconds) && segment.endSeconds > duration ? segment.endSeconds : duration
      ), 0);
      const durationSeconds = Number.isFinite(set.durationSeconds) && set.durationSeconds > 0
        ? set.durationSeconds
        : lastEnd;
      return {
        id: set.id,
        title: set.title,
        artists: Array.isArray(set.artists) ? set.artists : [],
        year: Number.isFinite(set.year) ? set.year : null,
        durationSeconds: durationSeconds || null,
        chapters,
      };
    }).filter((set) => typeof set.id === 'string' && set.id && typeof set.title === 'string' && set.chapters.length);
  },
  snapshot({ includeCatalogue = false } = {}) {
    const song = currentSong();
    const player = window.GARBA_YOUTUBE_PLAYER;
    const circleState = circle.diagnostics();
    const snapshot = {
      song: song ? {
        id: song.id,
        title: song.title,
        artist: song.artist,
        genre: song.genre,
        durationSeconds: song.durationSeconds || null,
        playable: canExecuteSong(song),
      } : null,
      genreId: state.genreId,
      playing: Boolean(state.playing || player?.playing),
      elapsedSeconds: Number.isFinite(player?.elapsedSeconds) ? player.elapsedSeconds : state.elapsed,
      durationSeconds: state.duration || song?.durationSeconds || null,
      shuffle: state.shuffleMode,
      live: state.liveMode,
      favourite: song ? state.favourites.has(song.id) : false,
      circle: Boolean(circleState?.active),
      catalogueSignature: state.catalogueSignature,
      // What plays after this song: the songs the listener queued, then the automatic continuation
      upNext: getUpNextSongs().slice(0, 10).map((item) => ({
        id: item.id,
        title: item.title,
        artist: item.artist,
        durationSeconds: Number.isFinite(item.durationSeconds) ? item.durationSeconds : null,
        queued: state.manualQueue.includes(item.id),
      })),
      nonstop: window.GARBA_NONSTOP?.activeSet ? {
        id: window.GARBA_NONSTOP.activeSet.id,
        title: window.GARBA_NONSTOP.activeSet.title,
      } : null,
    };
    if (includeCatalogue) {
      snapshot.genres = state.genres.map(({ id, name, label }) => ({ id, name, label }));
      const order = playableOrder();
      const ordered = order ? order.order(state.songs) : state.songs;
      snapshot.songs = ordered.map((item) => {
        const vid = youtubeVideoId(item);
        const tier = order ? order.tier(item) : PLAYABLE_TIER.UNAVAILABLE;
        return {
          id: item.id,
          title: item.title,
          artist: item.artist,
          genre: item.genre,
          durationSeconds: Number.isFinite(item.durationSeconds) ? item.durationSeconds : null,
          playable: canExecuteSong(item),
          videoId: vid || null,
          startSeconds: Number(item.youtubeStartSeconds || 0) || 0,
          isChapter: tier === PLAYABLE_TIER.CHAPTER,
        };
      });
    }
    return snapshot;
  },
  action(name, value) {
    switch (name) {
      case 'play': els.playButton?.click(); return true;
      case 'previous': els.prevButton?.click(); return true;
      case 'next': els.nextButton?.click(); return true;
      case 'shuffle': els.shuffleButton?.click(); return true;
      case 'favourite': els.mobileFavourite?.click(); return true;
      case 'live': els.liveStationButton?.click(); return true;
      case 'circle': els.circleButton?.click(); return true;
      case 'explore': els.browseButton?.click(); return true;
      case 'seek': {
        if (!Number.isFinite(value) || !state.duration) return false;
        els.progress.value = String(Math.round(Math.max(0, Math.min(1, value)) * 1000));
        els.progress.dispatchEvent(new Event('input', { bubbles: true }));
        return true;
      }
      case 'genre': {
        if (value === 'nonstop') {
          const button = document.getElementById('nonstopButton');
          button?.click();
          return Boolean(button);
        }
        const button = [...document.querySelectorAll('#genreStrip [data-genre]')].find((item) => item.dataset.genre === value);
        if (!button) return false;
        button.click();
        return true;
      }
      case 'song': {
        const song = state.songs.find((item) => item.id === value);
        if (!song || !canExecuteSong(song)) return false;
        selectSong(song.id, { preservePlayback: state.playing, keepSheet: true });
        return true;
      }
      case 'queue-add':
        if (typeof value !== 'string' || !value) return false;
        queueSong(value);
        return state.manualQueue.includes(value);
      case 'queue-next':
        return typeof value === 'string' && queueSongNext(value);
      case 'queue-remove':
        return typeof value === 'string' && removeQueuedSong(value, { announce: false });
      case 'nonstop':
        if (typeof value !== 'string' || !value) return false;
        return Boolean(window.GARBA_NONSTOP?.play?.(value));
      case 'play-youtube':
        if (typeof value === 'string' && value.trim()) {
          playYouTubeUrl(value.trim());
          return true;
        }
        return false;
      default: return false;
    }
  },
});

window.GARBA_SHARE = Object.freeze({
  shareCurrent: handleShareCurrentSong,
});
