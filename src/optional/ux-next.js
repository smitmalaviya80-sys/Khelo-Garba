import './playback-release-guard.js';
import './ux-input.js';

const $ = (id) => document.getElementById(id);

const app = $('app');
const trackBlock = $('trackBlock');
const songSheet = $('songSheet');
const songList = $('songList');
const searchInput = $('searchInput');
const sheetHandle = $('sheetHandle');
const sheetClose = $('sheetClose');
const browseButton = $('browseButton');
const shareButton = $('shareButton');
const mobileFavourite = $('mobileFavourite');
const songTitle = $('songTitle');
const songArtist = $('songArtist');
const genreEyebrow = $('genreEyebrow');
const toast = $('toast');

const nextState = {
  songs: new Map(),
  taxonomy: new Map(),
  searchTimer: null,
  renderingEnhanced: false,
  lastMediaKey: '',
  detailsKey: '',
  detailsSyncFrame: null,
};

const nowPlayingDetails = {
  button: null,
  panel: null,
  title: null,
  artist: null,
};

const themeByGenre = {
  traditional: '#261b22',
  dandiya: '#211a31',
  devotional: '#291b1a',
  folk: '#1f2228',
  sanedo: '#2a1b25',
  fusion: '#201a31',
};

function announceNext(message) {
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(announceNext.timer);
  announceNext.timer = setTimeout(() => toast.classList.remove('show'), 2200);
}

function normalize(value = '') {
  return String(value)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function formatDuration(seconds) {
  if (!Number.isFinite(seconds) || seconds <= 0) return '—';
  const rounded = Math.round(seconds);
  return `${Math.floor(rounded / 60)}:${String(rounded % 60).padStart(2, '0')}`;
}

function syncThemeColor() {
  const genre = app?.dataset.genre || 'traditional';
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = themeByGenre[genre] || '#15182a';
}

function setTextIfChanged(element, value) {
  if (element && element.textContent !== value) element.textContent = value;
}

function closeNowPlayingDetails({ restoreFocus = false } = {}) {
  const { button, panel } = nowPlayingDetails;
  if (!button || !panel) return;
  const wasOpen = !panel.hidden;
  panel.hidden = true;
  button.setAttribute('aria-expanded', 'false');
  button.setAttribute('aria-label', 'Show full title and artist');
  button.removeAttribute('aria-describedby');
  trackBlock?.classList.remove('track-details-open');
  if (restoreFocus && wasOpen) button.focus({ preventScroll: true });
}

function metadataIsUsable(title) {
  return Boolean(title && !/loading|catalogue unavailable/i.test(title));
}

function elementIsClipped(element) {
  if (!element) return false;
  return element.scrollHeight > element.clientHeight + 1 || element.scrollWidth > element.clientWidth + 1;
}

function syncNowPlayingDetails() {
  const { button, panel, title: detailTitle, artist: detailArtist } = nowPlayingDetails;
  if (!trackBlock || !songTitle || !songArtist || !button || !panel) return;

  const title = String(songTitle.textContent || '').trim();
  const artist = String(songArtist.textContent || '').trim();
  const key = `${title}\u0000${artist}`;

  if (key !== nextState.detailsKey) {
    closeNowPlayingDetails();
    nextState.detailsKey = key;
  }

  setTextIfChanged(detailTitle, title);
  setTextIfChanged(detailArtist, artist);

  if (nextState.detailsSyncFrame) cancelAnimationFrame(nextState.detailsSyncFrame);
  nextState.detailsSyncFrame = requestAnimationFrame(() => {
    nextState.detailsSyncFrame = null;
    const lengthClass = trackBlock.classList.contains('is-long-title')
      || trackBlock.classList.contains('is-very-long-title');
    const needsDetails = metadataIsUsable(title)
      && (lengthClass || elementIsClipped(songTitle) || elementIsClipped(songArtist));

    button.hidden = !needsDetails;
    trackBlock.classList.toggle('has-track-details', needsDetails);
    if (!needsDetails) closeNowPlayingDetails();
  });
}

function ensureNowPlayingDetails() {
  if (!trackBlock || !songTitle || !songArtist || nowPlayingDetails.button) return;

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'track-details-button';
  button.textContent = 'Details';
  button.hidden = true;
  button.setAttribute('aria-expanded', 'false');
  button.setAttribute('aria-controls', 'nowPlayingDetails');
  button.setAttribute('aria-label', 'Show full title and artist');

  const panel = document.createElement('div');
  panel.id = 'nowPlayingDetails';
  panel.className = 'track-details-panel';
  panel.hidden = true;
  panel.setAttribute('role', 'group');
  panel.setAttribute('aria-label', 'Full track details');
  panel.setAttribute('aria-live', 'off');

  const detailTitle = document.createElement('strong');
  detailTitle.className = 'track-details-title';
  const detailArtist = document.createElement('span');
  detailArtist.className = 'track-details-artist';
  panel.append(detailTitle, detailArtist);
  trackBlock.append(button, panel);

  nowPlayingDetails.button = button;
  nowPlayingDetails.panel = panel;
  nowPlayingDetails.title = detailTitle;
  nowPlayingDetails.artist = detailArtist;

  button.addEventListener('click', () => {
    const opening = panel.hidden;
    if (opening) {
      panel.hidden = false;
      button.setAttribute('aria-expanded', 'true');
      button.setAttribute('aria-label', 'Hide full title and artist');
      button.setAttribute('aria-describedby', panel.id);
      trackBlock.classList.add('track-details-open');
    } else {
      closeNowPlayingDetails({ restoreFocus: true });
    }
  });

  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || panel.hidden || event.defaultPrevented) return;
    event.preventDefault();
    event.stopPropagation();
    closeNowPlayingDetails({ restoreFocus: true });
  });

  document.addEventListener('pointerdown', (event) => {
    if (panel.hidden || button.contains(event.target) || panel.contains(event.target)) return;
    closeNowPlayingDetails();
  }, { passive: true });

  window.addEventListener('resize', syncNowPlayingDetails, { passive: true });
  syncNowPlayingDetails();
}

function syncControlLabels() {
  const snap = app?.dataset.sheetSnap || 'closed';
  if (sheetHandle) {
    const label = snap === 'full'
      ? 'Collapse song browser'
      : snap === 'medium'
        ? 'Expand song browser to full height'
        : snap === 'collapsed'
          ? 'Expand song browser'
          : 'Open song browser';
    sheetHandle.setAttribute('aria-label', label);
    sheetHandle.setAttribute('aria-expanded', String(snap === 'full'));
  }

  if (browseButton) {
    const open = snap !== 'closed';
    browseButton.setAttribute('aria-label', open ? 'Close song browser' : 'Browse songs');
  }

  const title = String(songTitle?.textContent || '').trim();
  if (mobileFavourite && title && !/loading|catalogue unavailable/i.test(title)) {
    const pressed = mobileFavourite.getAttribute('aria-pressed') === 'true';
    mobileFavourite.setAttribute('aria-label', `${pressed ? 'Remove' : 'Add'} ${title} ${pressed ? 'from' : 'to'} favourites`);
  }
  if (shareButton && title && !/loading|catalogue unavailable/i.test(title)) {
    shareButton.setAttribute('aria-label', `Share ${title}`);
  }
}

async function copyText(text) {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Fall through for older iOS/webviews and non-secure contexts.
    }
  }

  const field = document.createElement('textarea');
  field.value = text;
  field.setAttribute('readonly', '');
  field.style.position = 'fixed';
  field.style.opacity = '0';
  field.style.pointerEvents = 'none';
  document.body.append(field);
  field.select();
  field.setSelectionRange(0, field.value.length);
  let copied = false;
  try { copied = document.execCommand('copy'); } catch { copied = false; }
  field.remove();
  return copied;
}

async function improvedShare(event) {
  event.preventDefault();
  event.stopImmediatePropagation();

  const title = String(songTitle?.textContent || 'GARBA').trim();
  const artist = String(songArtist?.textContent || '').trim();
  const url = new URL(location.href);
  url.searchParams.delete('source');
  url.searchParams.delete('browse');
  const text = artist ? `${title} by ${artist}` : title;

  try {
    if (navigator.share) {
      await navigator.share({ title: `${title} · GARBA`, text, url: url.toString() });
      return;
    }
    if (await copyText(url.toString())) announceNext('Track link copied.');
    else announceNext('Copy this page link from your browser.');
  } catch (error) {
    if (error?.name !== 'AbortError') announceNext('Could not share this track.');
  }
}

function syncMediaArtwork() {
  if (!('mediaSession' in navigator) || typeof MediaMetadata === 'undefined') return;
  const title = String(songTitle?.textContent || '').trim();
  if (!title || /loading|catalogue unavailable/i.test(title)) return;
  const artist = String(songArtist?.textContent || '').trim();
  const album = String(genreEyebrow?.textContent || 'GARBA').trim();
  const key = `${title}\u0000${artist}\u0000${album}`;
  if (key === nextState.lastMediaKey) return;
  nextState.lastMediaKey = key;

  try {
    navigator.mediaSession.metadata = new MediaMetadata({
      title,
      artist,
      album,
      artwork: [
        { src: 'assets/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
        { src: 'assets/icons/icon.svg', sizes: 'any', type: 'image/svg+xml' },
      ],
    });
  } catch {
    // Some embedded browsers expose Media Session without accepting artwork.
  }
}

function categoryTerms(song) {
  const ids = [song.category, ...(Array.isArray(song.styles) ? song.styles : [])].filter(Boolean);
  const terms = [];
  for (const id of ids) {
    const category = nextState.taxonomy.get(id);
    if (!category) {
      terms.push(id);
      continue;
    }
    terms.push(category.id, category.label, ...(category.aliases || []));
  }
  return terms;
}

function searchScore(song, query) {
  const q = normalize(query);
  if (!q) return 0;
  const terms = q.split(/\s+/).filter(Boolean);
  const title = normalize(song.title);
  const artist = normalize(song.artist);
  const categories = normalize(categoryTerms(song).join(' '));
  const release = normalize(song.releaseId || '');
  const haystack = `${title} ${artist} ${categories} ${release}`;
  if (!terms.every((term) => haystack.includes(term))) return 0;

  let score = 1;
  if (title === q) score += 120;
  else if (title.startsWith(q)) score += 90;
  else if (title.includes(q)) score += 70;
  if (artist === q) score += 80;
  else if (artist.startsWith(q)) score += 60;
  else if (artist.includes(q)) score += 45;
  if (categories.includes(q)) score += 40;
  if (release.includes(q)) score += 10;
  if (song.playbackReady || song.audioUrl || song.youtubeId) score += 4;
  return score;
}

function navigateToSong(song) {
  const url = new URL(location.href);
  url.searchParams.set('genre', song.genre || 'traditional');
  url.searchParams.set('song', song.id);
  url.searchParams.delete('browse');
  url.searchParams.delete('source');
  location.assign(url.toString());
}

function renderEnhancedSearch() {
  if (nextState.renderingEnhanced || !songList || !searchInput || !songSheet?.classList.contains('mode-search')) return;
  const query = searchInput.value.trim();
  if (query.length < 2) return;

  const nativeRows = [...songList.querySelectorAll('.song-row:not(.enhanced-search-row)')];
  if (nativeRows.length) return;
  if (songList.querySelector('.enhanced-search-row')) return;

  const matches = [...nextState.songs.values()]
    .map((song) => ({ song, score: searchScore(song, query) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || String(a.song.title).localeCompare(String(b.song.title)))
    .slice(0, 80);
  if (!matches.length) return;

  nextState.renderingEnhanced = true;
  songList.innerHTML = '';
  const note = document.createElement('div');
  note.className = 'enhanced-search-note';
  note.textContent = 'Matched across titles, artists and Garba styles';
  songList.append(note);

  const fragment = document.createDocumentFragment();
  matches.forEach(({ song }, index) => {
    const row = document.createElement('div');
    row.className = 'song-row enhanced-search-row';
    row.setAttribute('role', 'listitem');

    const number = document.createElement('span');
    number.className = 'song-index';
    number.textContent = String(index + 1).padStart(2, '0');

    const copy = document.createElement('button');
    copy.type = 'button';
    copy.className = 'song-copy';
    copy.setAttribute('aria-label', `Open ${song.title} by ${song.artist}`);
    const title = document.createElement('strong');
    title.textContent = song.title;
    const details = document.createElement('small');
    const category = nextState.taxonomy.get(song.category);
    details.textContent = category?.label ? `${song.artist} · ${category.label}` : song.artist;
    copy.append(title, details);
    copy.addEventListener('click', () => navigateToSong(song));

    const duration = document.createElement('span');
    duration.className = 'song-duration';
    duration.textContent = formatDuration(song.durationSeconds);

    const arrow = document.createElement('span');
    arrow.className = 'enhanced-search-arrow';
    arrow.textContent = '→';
    arrow.setAttribute('aria-hidden', 'true');

    row.append(number, copy, duration, arrow);
    fragment.append(row);
  });
  songList.append(fragment);
  nextState.renderingEnhanced = false;
}

function scheduleEnhancedSearch() {
  clearTimeout(nextState.searchTimer);
  nextState.searchTimer = setTimeout(renderEnhancedSearch, 140);
}

function syncSearchEmptyCopy() {
  if (!songSheet?.classList.contains('mode-search') || !searchInput?.value.trim()) return;
  const empty = songList?.querySelector('.empty-state');
  if (!empty) return;
  const copy = empty.querySelector('span');
  if (copy) copy.textContent = 'Try another spelling, artist name, or a broader Garba term.';
}

function scrollCurrentRowIntoView() {
  if (songSheet?.getAttribute('aria-hidden') !== 'false' || searchInput?.value.trim()) return;
  const current = songList?.querySelector('.song-row.current');
  current?.scrollIntoView({ block: 'nearest', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
}

function applyDataSaverState() {
  const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  if (!app || !connection) return;
  const constrained = Boolean(connection.saveData || /(^|-)2g$/.test(connection.effectiveType || ''));
  app.dataset.saveData = String(constrained);
}

async function loadNextContext() {
  try {
    const [songsResponse, taxonomyResponse] = await Promise.all([
      fetch('data/songs.json', { cache: 'no-store' }),
      fetch('data/taxonomy.json', { cache: 'no-store' }),
    ]);
    if (songsResponse.ok) {
      const songs = await songsResponse.json();
      nextState.songs = new Map(songs.map((song) => [song.id, song]));
    }
    if (taxonomyResponse.ok) {
      const taxonomy = await taxonomyResponse.json();
      nextState.taxonomy = new Map(taxonomy.map((entry) => [entry.id, entry]));
    }
  } catch {
    // Core catalogue handling remains authoritative when this enhancement cannot load.
  } finally {
    scheduleEnhancedSearch();
  }
}

function initNext() {
  shareButton?.addEventListener('click', improvedShare, { capture: true });
  ensureNowPlayingDetails();

  searchInput?.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    event.stopPropagation();
    if (searchInput.value) {
      event.preventDefault();
      searchInput.value = '';
      searchInput.dispatchEvent(new Event('input', { bubbles: true }));
    } else {
      event.preventDefault();
      sheetClose?.click();
    }
  });
  searchInput?.addEventListener('input', scheduleEnhancedSearch);

  if (app) {
    new MutationObserver(() => {
      syncThemeColor();
      syncControlLabels();
      if (app.dataset.sheetSnap !== 'closed') {
        closeNowPlayingDetails();
        setTimeout(scrollCurrentRowIntoView, 240);
      }
    }).observe(app, { attributes: true, attributeFilter: ['data-genre', 'data-sheet-snap'] });
  }

  if (songTitle?.parentElement) {
    new MutationObserver(() => {
      syncControlLabels();
      syncMediaArtwork();
      syncNowPlayingDetails();
    }).observe(songTitle.parentElement, { childList: true, subtree: true, characterData: true });
  }

  if (songList) {
    new MutationObserver(() => {
      if (nextState.renderingEnhanced) return;
      syncSearchEmptyCopy();
      scheduleEnhancedSearch();
    }).observe(songList, { childList: true, subtree: false });
  }

  if (songSheet) {
    new MutationObserver(() => {
      if (songSheet.getAttribute('aria-hidden') === 'false') setTimeout(scrollCurrentRowIntoView, 220);
    }).observe(songSheet, { attributes: true, attributeFilter: ['aria-hidden'] });
  }

  document.addEventListener('visibilitychange', () => app?.classList.toggle('page-hidden', document.hidden));
  const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  connection?.addEventListener?.('change', applyDataSaverState);

  syncThemeColor();
  syncControlLabels();
  syncMediaArtwork();
  syncNowPlayingDetails();
  applyDataSaverState();
  loadNextContext();
}

initNext();
