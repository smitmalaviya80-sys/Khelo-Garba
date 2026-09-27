(function attachDirectSourceResolver(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.GARBA_DIRECT_SOURCE_RESOLVER = Object.freeze(api);
})(typeof globalThis !== 'undefined' ? globalThis : this, function createDirectSourceResolver() {
  'use strict';

  const VERSION = 1;
  const TRACK_FIELDS = new Set(['audioUrl', 'mimeType', 'rights']);
  const RIGHTS_FIELDS = new Set([
    'redistributionAuthorized',
    'rightsHolder',
    'licenseName',
    'proofUrl',
  ]);
  const ALLOWED_AUDIO_MIME_TYPES = new Set([
    'audio/aac',
    'audio/flac',
    'audio/mp4',
    'audio/mpeg',
    'audio/ogg',
    'audio/wav',
    'audio/webm',
    'audio/x-flac',
  ]);
  const BLOCKED_PROVIDER_HOST_SUFFIXES = [
    'youtube.com',
    'youtu.be',
    'googlevideo.com',
    'spotify.com',
    'scdn.co',
    'music.apple.com',
    'mzstatic.com',
    'soundcloud.com',
    'sndcdn.com',
    'bandcamp.com',
    'bcbits.com',
    'qobuz.com',
    'gaana.com',
    'jiosaavn.com',
    'music.amazon.com',
    'music.amazon.ca',
    'music.amazon.in',
    'music.amazon.co.uk',
  ];

  function isPlainObject(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
  }

  function nonEmptyString(value) {
    return typeof value === 'string' && value.trim().length > 0;
  }

  function isFiniteNonNegativeNumber(value) {
    return typeof value === 'number' && Number.isFinite(value) && value >= 0;
  }

  function parseHttpsUrl(value) {
    if (!nonEmptyString(value)) return null;
    try {
      const parsed = new URL(value);
      return parsed.protocol === 'https:' ? parsed : null;
    } catch {
      return null;
    }
  }

  function sameHttpResourceIgnoringFragment(left, right) {
    if (!left || !right) return false;
    const leftUrl = new URL(left.href);
    const rightUrl = new URL(right.href);
    leftUrl.hash = '';
    rightUrl.hash = '';
    return leftUrl.href === rightUrl.href;
  }

  function hostMatches(hostname, suffix) {
    const host = String(hostname || '').toLowerCase().replace(/\.$/, '').replace(/^www\./, '');
    const target = suffix.toLowerCase();
    return host === target || host.endsWith(`.${target}`);
  }

  function isBlockedConsumerProviderUrl(value) {
    const parsed = parseHttpsUrl(value);
    if (!parsed) return false;
    return BLOCKED_PROVIDER_HOST_SUFFIXES.some((suffix) => hostMatches(parsed.hostname, suffix));
  }

  function unknownFields(value, allowed) {
    if (!isPlainObject(value)) return [];
    return Object.keys(value).filter((key) => !allowed.has(key));
  }

  function freezeDecision(decision) {
    for (const key of ['media', 'provenance', 'failure']) {
      if (isPlainObject(decision[key])) Object.freeze(decision[key]);
    }
    if (Array.isArray(decision.errors)) Object.freeze(decision.errors);
    return Object.freeze(decision);
  }

  function baseDecision(songId, kind, playable, backgroundCapable) {
    return {
      version: VERSION,
      kind,
      playable,
      backgroundCapable,
      songId,
    };
  }

  function validateDirectEntry(songId, directSongId, entry) {
    const errors = [];
    const add = (message) => errors.push(message);

    if (!nonEmptyString(songId)) add('canonical song id is required');
    if (!nonEmptyString(directSongId)) add('direct song id is required');
    if (nonEmptyString(songId) && nonEmptyString(directSongId) && songId !== directSongId) {
      add('direct song id does not match canonical song id');
    }
    if (!isPlainObject(entry)) {
      add('direct entry must be an object');
      return errors;
    }

    for (const field of unknownFields(entry, TRACK_FIELDS)) add(`unknown direct field: ${field}`);

    const audio = parseHttpsUrl(entry.audioUrl);
    if (!audio) add('direct audio URL must be absolute HTTPS');
    else if (isBlockedConsumerProviderUrl(audio.href)) add('consumer/provider URL cannot be direct media');

    const mimeType = String(entry.mimeType || '').trim().toLowerCase();
    if (!ALLOWED_AUDIO_MIME_TYPES.has(mimeType)) add('direct audio MIME type is not allowed');

    if (!isPlainObject(entry.rights)) {
      add('direct rights must be an object');
      return errors;
    }

    for (const field of unknownFields(entry.rights, RIGHTS_FIELDS)) add(`unknown rights field: ${field}`);

    const rights = entry.rights;
    if (rights.redistributionAuthorized !== true) add('redistribution authorisation must be exactly true');
    if (!nonEmptyString(rights.rightsHolder)) add('rights holder or authorised licensor is required');
    if (!nonEmptyString(rights.licenseName)) add('licence or explicit permission is required');

    const proof = parseHttpsUrl(rights.proofUrl);
    if (!proof) add('rights proof URL must be absolute HTTPS');
    else if (audio && sameHttpResourceIgnoringFragment(proof, audio)) add('rights proof URL cannot be the media URL');

    return errors;
  }

  function youtubeSourceIdentity(value) {
    const raw = String(value || '').trim();
    if (!raw) return { isYoutube: false, videoId: '', href: '' };
    try {
      const parsed = new URL(raw);
      const host = parsed.hostname.toLowerCase().replace(/^www\./, '');
      if (host === 'youtu.be') {
        return {
          isYoutube: true,
          videoId: parsed.pathname.split('/').filter(Boolean)[0] || '',
          href: parsed.href,
        };
      }
      if (host === 'youtube.com' || host.endsWith('.youtube.com')) {
        const parts = parsed.pathname.split('/').filter(Boolean);
        if (parts.length === 1 && parts[0] === 'watch') {
          return {
            isYoutube: true,
            videoId: String(parsed.searchParams.get('v') || '').trim(),
            href: parsed.href,
          };
        }
        if ((parts[0] === 'embed' || parts[0] === 'shorts') && parts.length >= 2) {
          return {
            isYoutube: true,
            videoId: String(parts[1] || '').trim(),
            href: parsed.href,
          };
        }
        return { isYoutube: true, videoId: '', href: parsed.href };
      }
      return { isYoutube: false, videoId: '', href: parsed.href };
    } catch {
      return { isYoutube: false, videoId: '', href: '' };
    }
  }

  function youtubeVideoId(song) {
    const explicit = String(song && song.youtubeId || '').trim();
    if (explicit) return explicit;
    return youtubeSourceIdentity(song && song.playbackSourceUrl).videoId;
  }

  function youtubeSourceUrl(song, videoId) {
    const source = youtubeSourceIdentity(song && song.playbackSourceUrl);
    if (source.isYoutube && source.videoId === videoId) return source.href;
    return `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`;
  }

  function isExecutableYoutube(song) {
    if (!isPlainObject(song)) return false;
    if (song.playbackSearchOnly === true) return false;
    if (song.playbackSourceType === 'verified-release-track-reference') return false;
    if (song.playbackSourceType === 'verified-unchaptered-youtube-release') return false;
    if (
      song.playbackSourceType === 'verified-performance-chapter'
      && !isFiniteNonNegativeNumber(song.youtubeStartSeconds)
    ) return false;

    const explicit = String(song.youtubeId || '').trim();
    const source = youtubeSourceIdentity(song.playbackSourceUrl);
    if (explicit) {
      if (source.isYoutube && (!source.videoId || source.videoId !== explicit)) return false;
      return true;
    }
    return Boolean(source.videoId);
  }

  function directDecision(songId, entry) {
    const rights = entry.rights;
    return freezeDecision({
      ...baseDecision(songId, 'direct', true, true),
      provider: 'direct',
      media: {
        url: new URL(entry.audioUrl).href,
        mimeType: String(entry.mimeType).trim().toLowerCase(),
      },
      provenance: {
        sourceType: 'licensed-direct',
        rightsHolder: rights.rightsHolder.trim(),
        licenseName: rights.licenseName.trim(),
        proofUrl: new URL(rights.proofUrl).href,
      },
    });
  }

  function invalidDirectDecision(songId, errors) {
    return freezeDecision({
      ...baseDecision(songId, 'direct-invalid', false, false),
      provider: 'direct',
      reason: 'direct-entry-invalid',
      errors: [...errors],
      media: null,
      provenance: null,
    });
  }

  function youtubeDecision(song) {
    const videoId = youtubeVideoId(song);
    const startSeconds = isFiniteNonNegativeNumber(song.youtubeStartSeconds)
      ? song.youtubeStartSeconds
      : 0;
    return freezeDecision({
      ...baseDecision(song.id.trim(), 'youtube-foreground', true, false),
      provider: 'youtube',
      media: null,
      provenance: {
        sourceType: String(song.playbackSourceType || 'youtube').trim() || 'youtube',
        sourceUrl: youtubeSourceUrl(song, videoId),
        videoId,
        startSeconds,
      },
    });
  }

  function unavailableDecision(songId, reason) {
    return freezeDecision({
      ...baseDecision(songId, 'unavailable', false, false),
      provider: null,
      reason,
      media: null,
      provenance: null,
    });
  }

  function resolvePlaybackSource({ song, directEntry = null, directSongId = null } = {}) {
    if (!isPlainObject(song) || !nonEmptyString(song.id)) {
      return unavailableDecision('', 'canonical-song-invalid');
    }

    const songId = song.id.trim();
    const hasDirectEntry = directEntry !== null && directEntry !== undefined;
    if (hasDirectEntry) {
      const errors = validateDirectEntry(songId, directSongId, directEntry);
      if (errors.length > 0) return invalidDirectDecision(songId, errors);
      return directDecision(songId, directEntry);
    }

    if (isExecutableYoutube(song)) return youtubeDecision({ ...song, id: songId });
    return unavailableDecision(songId, 'no-executable-source');
  }

  function failDirectPlayback(resolution, code = 'direct-playback-failed') {
    if (!isPlainObject(resolution) || resolution.kind !== 'direct' || resolution.provider !== 'direct') {
      throw new TypeError('failDirectPlayback requires a direct playback resolution');
    }
    const safeCode = nonEmptyString(code) ? code.trim() : 'direct-playback-failed';
    return freezeDecision({
      ...baseDecision(resolution.songId, 'direct-failed', false, false),
      provider: 'direct',
      reason: 'direct-playback-failed',
      media: resolution.media,
      provenance: resolution.provenance,
      failure: { code: safeCode },
    });
  }

  return {
    VERSION,
    resolvePlaybackSource,
    failDirectPlayback,
    isExecutableYoutube,
    isBlockedConsumerProviderUrl,
  };
});
