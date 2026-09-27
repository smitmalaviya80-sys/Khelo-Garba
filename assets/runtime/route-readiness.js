const YOUTUBE_HOST_RE = /(^|\.)youtube\.com$|(^|\.)youtu\.be$/i;

function youtubeVideoId(song) {
  const explicit = String(song?.youtubeId || '').trim();
  if (explicit) return explicit;
  try {
    const url = new URL(String(song?.playbackSourceUrl || ''));
    if (!YOUTUBE_HOST_RE.test(url.hostname)) return '';
    if (url.hostname.toLowerCase().endsWith('youtu.be')) return url.pathname.split('/').filter(Boolean)[0] || '';
    const queryId = url.searchParams.get('v');
    if (queryId) return queryId.trim();
    const parts = url.pathname.split('/').filter(Boolean);
    const marker = parts.findIndex((part) => part === 'embed' || part === 'shorts');
    return marker >= 0 ? String(parts[marker + 1] || '').trim() : '';
  } catch {
    return '';
  }
}

function routeReadiness(song, { temporarilyFailed = false } = {}) {
  if (!song) return { status: 'missing', executable: false, videoId: '' };
  if (temporarilyFailed) return { status: 'temporary-failure', executable: false, videoId: youtubeVideoId(song) };
  if (song.audioUrl) return { status: 'blocked-policy', executable: false, videoId: '' };

  const sourceType = String(song.playbackSourceType || '');
  if (song.playbackSearchOnly || sourceType === 'verified-release-track-reference') {
    return { status: 'reference-only', executable: false, videoId: youtubeVideoId(song) };
  }
  if (sourceType === 'verified-unchaptered-youtube-release') {
    return { status: 'reference-only', executable: false, videoId: youtubeVideoId(song) };
  }

  const provider = String(song.playbackProvider || '').toLowerCase();
  const sourceUrl = String(song.playbackSourceUrl || '');
  const videoId = youtubeVideoId(song);
  const youtubeCandidate = Boolean(
    String(song.youtubeId || '').trim()
    || provider === 'youtube'
    || /youtu(?:\.be|be\.com)/i.test(sourceUrl)
  );
  if (youtubeCandidate && videoId) return { status: 'exact-mapped', executable: true, videoId };
  return { status: 'missing', executable: false, videoId: '' };
}

const canExecuteSong = (song, options) => routeReadiness(song, options).executable;

if (typeof window !== 'undefined') {
  window.GARBA_ROUTE_READINESS = Object.freeze({ routeReadiness, canExecuteSong, youtubeVideoId });
}
