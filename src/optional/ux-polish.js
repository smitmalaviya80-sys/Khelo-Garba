const $ = (id) => document.getElementById(id);

const app = $('app');
const songTitle = $('songTitle');
const songArtist = $('songArtist');
const genreEyebrow = $('genreEyebrow');
const trackBlock = $('trackBlock');
const searchButton = $('searchButton');
const searchInput = $('searchInput');
const songSheet = $('songSheet');
const songList = $('songList');
const sheetTitle = $('sheetTitle');
const shareButton = $('shareButton');
const playButton = $('playButton');
const progress = $('progress');
const durationTime = $('durationTime');
const audio = $('audio');
const toast = $('toast');

const state = {
  songs: new Map(),
  sources: {},
  ready: false,
  providerOpen: false,
  providerFocusReturn: null,
};

function announce(message) {
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(announce.timer);
  announce.timer = setTimeout(() => toast.classList.remove('show'), 2200);
}

function ensureMeta(name, attribute = 'name') {
  let meta = document.head.querySelector(`meta[${attribute}="${name}"]`);
  if (!meta) {
    meta = document.createElement('meta');
    meta.setAttribute(attribute, name);
    document.head.append(meta);
  }
  return meta;
}

function currentSongId() {
  return new URLSearchParams(location.search).get('song');
}

function cleanText(value = '') {
  return String(value).replace(/\s+/g, ' ').trim();
}

function currentSong() {
  const id = currentSongId();
  return (id && state.songs.get(id)) || null;
}

function sourceLabel(source) {
  const provider = String(source?.provider || '').toLowerCase();
  if (provider === 'youtube') return 'YouTube source';
  if (provider === 'spotify') return 'Spotify source';
  if (provider === 'bandcamp') return 'Bandcamp source';
  if (provider) return `${provider} source`;
  return '';
}

function ensureSourceBadge() {
  let badge = $('sourceBadge');
  if (badge) return badge;
  badge = document.createElement('span');
  badge.id = 'sourceBadge';
  badge.className = 'source-badge';
  badge.setAttribute('aria-live', 'polite');
  trackBlock?.append(badge);
  return badge;
}

function removeRetryButton() {
  $('retryCatalogueButton')?.remove();
  app?.removeAttribute('data-catalogue-error');
}

function syncDurationTruth() {
  const song = currentSong();
  if (!song || !durationTime || !progress) return;

  const localDuration = Number(audio?.duration);
  const hasLocalDuration = Number.isFinite(localDuration) && localDuration > 0;
  const durationKnown = song.durationSeconds != null || hasLocalDuration;

  if (!durationKnown) {
    durationTime.textContent = '—';
    progress.disabled = true;
    progress.setAttribute('aria-disabled', 'true');
    progress.title = 'Duration not verified';
  } else {
    progress.disabled = false;
    progress.removeAttribute('aria-disabled');
    progress.removeAttribute('title');
  }
}

function syncDocumentMetadata() {
  const song = currentSong();
  const title = cleanText(song?.title || songTitle?.textContent || 'GARBA');
  const artist = cleanText(song?.artist || songArtist?.textContent || '');
  const isPlaceholder = /traditional demo|loading garba|add artist|preparing catalogue|catalogue unavailable|check your connection/i.test(`${title} ${artist}`);

  if (!isPlaceholder && title && title !== 'GARBA') {
    document.title = artist ? `${title} · ${artist} · GARBA` : `${title} · GARBA`;
    const description = artist
      ? `Listen to and discover ${title} by ${artist} in GARBA, the open community-built Garba music catalogue.`
      : `Discover ${title} in GARBA, the open community-built Garba music catalogue.`;
    ensureMeta('description').content = description;
    ensureMeta('og:title', 'property').content = document.title;
    ensureMeta('og:description', 'property').content = description;
    ensureMeta('twitter:title').content = document.title;
    ensureMeta('twitter:description').content = description;
    app?.setAttribute('data-loading', 'false');
    app?.setAttribute('aria-busy', 'false');
    state.ready = true;
    removeRetryButton();
  }

  const badge = ensureSourceBadge();
  const id = currentSongId();
  const source = id ? state.sources[id] : null;
  const label = sourceLabel(source) || sourceLabel(song ? { provider: song.playbackProvider } : null);
  badge.textContent = label;
  badge.classList.toggle('show', Boolean(label));

  if (playButton && label && !playButton.classList.contains('is-playing')) {
    playButton.title = `Play using ${label.replace(' source', '')}`;
  } else if (playButton) {
    playButton.removeAttribute('title');
  }

  syncDurationTruth();
}

function ensureSearchPrompt() {
  if (!songList) return null;
  let prompt = songList.querySelector('[data-ux-search-prompt]');
  if (!prompt) {
    prompt = document.createElement('div');
    prompt.className = 'search-empty-prompt';
    prompt.dataset.uxSearchPrompt = 'true';
    prompt.innerHTML = '<strong>Search the collection</strong><span>Type a song or artist name to begin.</span>';
    songList.prepend(prompt);
  }
  return prompt;
}

function syncSearchEmptyState() {
  if (!songSheet || !songList || !searchInput) return;
  const awaiting = songSheet.classList.contains('mode-search') && !searchInput.value.trim();
  const prompt = ensureSearchPrompt();
  songSheet.classList.toggle('search-awaiting-query', awaiting);
  if (prompt) prompt.hidden = !awaiting;
}

function syncSheetSummary() {
  const summary = $('sheetSummary');
  if (!summary || !songList) return;
  syncSearchEmptyState();

  if (songSheet?.classList.contains('search-awaiting-query')) {
    summary.textContent = 'Type to search';
    return;
  }

  const count = songList.querySelectorAll('.song-row').length;
  if (count) {
    summary.textContent = `${count.toLocaleString()} ${count === 1 ? 'song' : 'songs'}`;
  } else if (songList.querySelector('.empty-state')) {
    summary.textContent = '0 songs';
  } else {
    summary.textContent = '';
  }
}

function syncNetworkStatus() {
  const status = $('networkStatus');
  if (!status) return;
  const offline = navigator.onLine === false;
  status.textContent = offline ? 'Offline' : '';
  status.classList.toggle('show', offline);
  status.setAttribute('aria-hidden', String(!offline));
}

async function shareCurrentTrack() {
  const title = cleanText(songTitle?.textContent || 'GARBA');
  const artist = cleanText(songArtist?.textContent || '');
  const url = new URL(location.href);
  url.searchParams.delete('source');
  url.searchParams.delete('browse');
  const text = artist ? `${title} by ${artist}` : title;

  try {
    if (navigator.share) {
      await navigator.share({ title: `${title} · GARBA`, text, url: url.toString() });
      return;
    }
    await navigator.clipboard.writeText(url.toString());
    announce('Track link copied.');
  } catch (error) {
    if (error?.name !== 'AbortError') announce('Could not share this track.');
  }
}

function visibleFocusable(root) {
  return [...root.querySelectorAll('a[href], button:not([disabled]), input:not([disabled]), iframe, [tabindex]:not([tabindex="-1"])')]
    .filter((node) => node.getClientRects().length > 0 && !node.closest('[hidden]'));
}

function trapTab(event, root) {
  if (event.key !== 'Tab') return;
  const focusable = visibleFocusable(root);
  if (!focusable.length) return;
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

function setupProviderAccessibility(overlay) {
  if (!overlay || overlay.dataset.uxPolished === 'true') return;
  overlay.dataset.uxPolished = 'true';
  const panel = overlay.querySelector('.provider-panel');
  if (panel) panel.setAttribute('tabindex', '-1');

  const observer = new MutationObserver(() => {
    const open = overlay.classList.contains('open');
    if (open === state.providerOpen) return;
    state.providerOpen = open;

    if (open) {
      state.providerFocusReturn = document.activeElement instanceof HTMLElement ? document.activeElement : playButton;
      app?.setAttribute('inert', '');
      requestAnimationFrame(() => overlay.querySelector('.provider-close')?.focus({ preventScroll: true }));
    } else {
      app?.removeAttribute('inert');
      const target = state.providerFocusReturn?.isConnected ? state.providerFocusReturn : playButton;
      state.providerFocusReturn = null;
      requestAnimationFrame(() => target?.focus?.({ preventScroll: true }));
    }
  });
  observer.observe(overlay, { attributes: true, attributeFilter: ['class'] });

  overlay.addEventListener('keydown', (event) => {
    if (overlay.classList.contains('open')) trapTab(event, overlay);
  });
}

function showCatalogueFailure() {
  if (!app || app.dataset.loading !== 'true' || state.ready) return;
  app.dataset.loading = 'false';
  app.dataset.catalogueError = 'true';
  app.setAttribute('aria-busy', 'false');
  if (genreEyebrow) genreEyebrow.textContent = 'Could not load songs';
  if (songTitle) songTitle.textContent = 'Catalogue unavailable';
  if (songArtist) songArtist.textContent = navigator.onLine === false ? 'You appear to be offline' : 'Check your connection and retry';

  if (trackBlock && !$('retryCatalogueButton')) {
    const retry = document.createElement('button');
    retry.id = 'retryCatalogueButton';
    retry.className = 'retry-catalogue';
    retry.type = 'button';
    retry.textContent = 'Retry';
    retry.addEventListener('click', () => location.reload());
    trackBlock.append(retry);
  }
}

function setupObservers() {
  if (trackBlock) {
    new MutationObserver(syncDocumentMetadata).observe(trackBlock, { subtree: true, childList: true, characterData: true });
  }
  if (songList) {
    new MutationObserver(syncSheetSummary).observe(songList, { childList: true, subtree: false });
  }
  if (songSheet) {
    new MutationObserver(syncSheetSummary).observe(songSheet, { attributes: true, attributeFilter: ['aria-hidden', 'class'] });
  }

  const bodyObserver = new MutationObserver(() => {
    const overlay = $('providerOverlay');
    if (overlay) setupProviderAccessibility(overlay);
  });
  bodyObserver.observe(document.body, { childList: true });
  setupProviderAccessibility($('providerOverlay'));
}

function setupKeyboardPolish() {
  document.addEventListener('keydown', (event) => {
    if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return;
    const target = event.target;
    const typing = target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target?.isContentEditable;
    if (typing) return;

    if (event.key === '/') {
      event.preventDefault();
      searchButton?.click();
      return;
    }
    if (event.key.toLowerCase() === 's' && event.shiftKey) {
      event.preventDefault();
      shareCurrentTrack();
    }
  }, { capture: true });
}

async function loadCatalogueContext() {
  try {
    const [songsResponse, sourceA, sourceB] = await Promise.all([
      fetch('data/songs.json', { cache: 'no-store' }),
      fetch('data/playback-sources.json', { cache: 'no-store' }).catch(() => null),
      fetch('data/playback-sources-current.json', { cache: 'no-store' }).catch(() => null),
    ]);

    if (songsResponse?.ok) {
      const songs = await songsResponse.json();
      state.songs = new Map(songs.map((song) => [song.id, song]));
    }

    const manifests = await Promise.all(
      [sourceA, sourceB].map((response) => (response?.ok ? response.json() : null))
    );
    for (const manifest of manifests) {
      if (manifest) Object.assign(state.sources, manifest.songSources || {});
    }
  } catch {
    // The timeout below provides a truthful retry state if the shell remains stuck.
  } finally {
    syncDocumentMetadata();
    syncDurationTruth();
  }
}

function init() {
  shareButton?.addEventListener('click', shareCurrentTrack);
  window.addEventListener('online', () => { syncNetworkStatus(); if (app?.dataset.catalogueError === 'true') announce('Back online. Retry the catalogue.'); });
  window.addEventListener('offline', syncNetworkStatus);
  window.addEventListener('popstate', () => requestAnimationFrame(syncDocumentMetadata));
  searchInput?.setAttribute('placeholder', 'Search songs or artists');
  searchInput?.addEventListener('input', () => setTimeout(syncSheetSummary, 90));
  audio?.addEventListener('loadedmetadata', syncDurationTruth);

  setupObservers();
  setupKeyboardPolish();
  syncNetworkStatus();
  syncSheetSummary();
  syncDocumentMetadata();
  loadCatalogueContext();

  setTimeout(showCatalogueFailure, 9000);
}

init();
