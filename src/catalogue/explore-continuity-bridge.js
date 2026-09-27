const BRIDGE_TYPE = 'playgarba:explore-continuity';
const BRIDGE_VERSION = 1;
const PARENT_CONTRACT_KEY = '__PLAYGARBA_EXPLORE_CONTINUITY_PARENT__';
const EXPLORE_PAGE_DATA_KEY = '__PLAYGARBA_EXPLORE_PAGE_DATA_V1__';

function sameOriginParent() {
  if (window.parent === window) return null;
  try {
    if (window.parent.location.origin !== window.location.origin) return null;
    const contract = window.parent[PARENT_CONTRACT_KEY];
    return contract?.version === BRIDGE_VERSION ? window.parent : null;
  } catch {
    return null;
  }
}

function postParentIntent(action, payload = undefined) {
  const parent = sameOriginParent();
  if (!parent) return false;
  const message = {
    type: BRIDGE_TYPE,
    version: BRIDGE_VERSION,
    action,
  };
  if (payload && Object.keys(payload).length) message.payload = payload;
  parent.postMessage(message, window.location.origin);
  return true;
}

function plainPrimaryNavigation(event) {
  return event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey;
}

function playerDestination(link) {
  try {
    const destination = new URL(link.href, window.location.href);
    if (destination.origin !== window.location.origin) return null;
    const songId = String(destination.searchParams.get('song') || '').trim();
    return songId ? { destination, songId } : null;
  } catch {
    return null;
  }
}

function selectedReleaseId() {
  const detail = document.getElementById('collectionDetail');
  if (!(detail instanceof HTMLElement) || detail.hidden) return '';
  const active = document.querySelector('#releaseRail .release-card.active[data-release-id]');
  return active instanceof HTMLElement ? String(active.dataset.releaseId || '').trim() : '';
}

function releaseTrackNumberForHandoff(song) {
  const value = Number(song?.trackNumber);
  return Number.isFinite(value) && value > 0 ? value : null;
}

async function validatedListenPayload(link) {
  const parsed = playerDestination(link);
  if (!parsed) return null;

  const { destination, songId } = parsed;
  const selectedRelease = selectedReleaseId();
  const hrefRelease = String(destination.searchParams.get('release') || '').trim();
  const releaseId = selectedRelease || hrefRelease;
  if (!releaseId) return { songId };

  const store = window[EXPLORE_PAGE_DATA_KEY];
  if (!store || typeof store.loadCore !== 'function') return { songId };

  try {
    const { songs } = await store.loadCore();
    const song = Array.isArray(songs) ? songs.find((row) => row?.id === songId) : null;
    if (song?.releaseId === releaseId && releaseTrackNumberForHandoff(song) != null) {
      return { songId, releaseId };
    }
  } catch {
    // Release context is optional. The parent will still validate the canonical song intent.
  }
  return { songId };
}

function announceReady() {
  postParentIntent('ready');
}

document.addEventListener('click', (event) => {
  if (!plainPrimaryNavigation(event)) return;
  if (!sameOriginParent()) return;

  const target = event.target instanceof Element ? event.target : null;
  const close = target?.closest('a.close-explore[href]');
  if (close && !close.target && !close.hasAttribute('download')) {
    event.preventDefault();
    event.stopImmediatePropagation();
    if (!postParentIntent('close')) window.location.assign(close.href);
    return;
  }

  const link = target?.closest('a.play-link[href], a.personal-listening-card[href]');
  if (!link || link.target || link.hasAttribute('download') || !playerDestination(link)) return;

  event.preventDefault();
  event.stopImmediatePropagation();
  void validatedListenPayload(link).then((payload) => {
    if (payload && postParentIntent('listen', payload)) return;
    window.location.assign(link.href);
  });
}, true);

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', announceReady, { once: true });
} else {
  queueMicrotask(announceReady);
}
window.addEventListener('pageshow', announceReady);
