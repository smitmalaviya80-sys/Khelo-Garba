/**
 * Pure share URL formatting, timestamp parsing, and execution adapter.
 * Preserves exact listening identity, canonical IDs, and optional timestamps
 * while preventing leakage of private state (queue, volume, session history).
 */

function parseShareTimestamp(value, durationSeconds = null) {
  if (value == null) return null;
  const raw = String(value).trim().replace(/s$/i, '');
  if (!raw) return null;

  let seconds = null;
  if (raw.includes(':')) {
    const parts = raw.split(':').map((p) => Number(p));
    if (parts.some((p) => !Number.isFinite(p) || p < 0)) return null;
    if (parts.length === 2) {
      seconds = (parts[0] * 60) + parts[1];
    } else if (parts.length === 3) {
      seconds = (parts[0] * 3600) + (parts[1] * 60) + parts[2];
    } else {
      return null;
    }
  } else {
    const num = Number(raw);
    if (!Number.isFinite(num) || num <= 0) return null;
    seconds = num;
  }

  if (seconds == null || !Number.isFinite(seconds) || seconds <= 0) return null;
  const rounded = Math.floor(seconds);

  if (durationSeconds != null && Number.isFinite(durationSeconds) && durationSeconds > 0) {
    if (rounded >= Math.floor(durationSeconds)) return null;
  }

  return rounded;
}

function resolveBaseUrl(origin = null) {
  if (origin && typeof origin === 'string') {
    try {
      return new URL('./', origin).href;
    } catch {
      // Fall through to location or canonical origin
    }
  }
  if (typeof location !== 'undefined' && location.origin) {
    return new URL(location.pathname || '/', location.origin).href;
  }
  return 'https://playgarba.com/';
}

function buildSongShareUrl({ songId, timestampSeconds = 0, origin = null } = {}) {
  const cleanId = String(songId || '').trim();
  if (!cleanId) return null;

  const base = resolveBaseUrl(origin);
  const url = new URL(base);
  url.searchParams.set('song', cleanId);

  const t = parseShareTimestamp(timestampSeconds);
  if (t != null && t > 0) {
    url.searchParams.set('t', String(t));
  } else {
    url.searchParams.delete('t');
  }

  url.hash = '';
  return url.toString();
}

function buildNonstopShareUrl({ setId, timestampSeconds = 0, origin = null } = {}) {
  const cleanId = String(setId || '').trim();
  if (!cleanId) return null;

  const base = resolveBaseUrl(origin);
  const url = new URL(base);
  url.searchParams.set('nonstop', cleanId);

  const t = parseShareTimestamp(timestampSeconds);
  if (t != null && t > 0) {
    url.searchParams.set('t', String(t));
  } else {
    url.searchParams.delete('t');
  }

  url.hash = '';
  return url.toString();
}

function formatShareText({ title, artist = '', context = 'song' } = {}) {
  const cleanTitle = String(title || '').trim();
  const cleanArtist = String(artist || '').trim();
  if (context === 'nonstop') {
    return cleanTitle
      ? `${cleanTitle} · Nonstop Garba on PlayGarba`
      : 'Nonstop Garba on PlayGarba';
  }
  if (!cleanTitle) return 'PlayGarba — Gujarati Garba Catalogue';
  return cleanArtist
    ? `Listen to "${cleanTitle}" by ${cleanArtist} on PlayGarba`
    : `Listen to "${cleanTitle}" on PlayGarba`;
}

async function executeShare({ title, text, url, navigatorObj = null } = {}) {
  const nav = navigatorObj || (typeof navigator !== 'undefined' ? navigator : null);
  if (!url) return { status: 'failed', reason: 'missing-url', url: '' };

  if (nav && typeof nav.share === 'function') {
    try {
      await nav.share({
        title: title || 'PlayGarba',
        text: text || '',
        url,
      });
      return { status: 'shared', url };
    } catch {
      // In Safari/iOS/WebKit, closing or cancelling the native share sheet produces AbortError
      // or consumes the user gesture. Once nav.share was attempted, do not fall through to
      // clipboard writeText as that causes a secondary NotAllowedError toast.
      return { status: 'cancelled', url };
    }
  }

  if (nav?.clipboard && typeof nav.clipboard.writeText === 'function') {
    try {
      await nav.clipboard.writeText(url);
      return { status: 'copied', url };
    } catch {
      return { status: 'failed', reason: 'clipboard-denied', url };
    }
  }

  return { status: 'failed', reason: 'unsupported', url };
}

if (typeof window !== 'undefined') {
  window.GARBA_SHARE_INTENT = Object.freeze({
    parseShareTimestamp,
    buildSongShareUrl,
    buildNonstopShareUrl,
    formatShareText,
    executeShare,
  });
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    parseShareTimestamp,
    buildSongShareUrl,
    buildNonstopShareUrl,
    formatShareText,
    executeShare,
  };
}
