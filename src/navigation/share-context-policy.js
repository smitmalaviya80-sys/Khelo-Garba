'use strict';

const VERSION = 1;
const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/;
const ALLOWED_PROTOCOLS = new Set(['http:', 'https:']);
const SHARE_PARAM_NAMES = Object.freeze(['song', 'genre', 'release', 'nonstop', 't', 'chapter']);

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function safeId(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return ID_PATTERN.test(trimmed) ? trimmed : null;
}

function finiteNonNegative(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function normalisePath(value) {
  if (typeof value !== 'string' || !value.trim()) return '/';
  try {
    const parsed = new URL(value, 'https://playgarba.invalid');
    let path = parsed.pathname || '/';
    if (!path.startsWith('/')) path = `/${path}`;
    if (path.length > 1 && path.endsWith('/')) path = path.slice(0, -1);
    return path;
  } catch {
    return null;
  }
}

function parseUrl(value) {
  try {
    const url = value instanceof URL ? new URL(value.toString()) : new URL(String(value));
    return ALLOWED_PROTOCOLS.has(url.protocol) ? url : null;
  } catch {
    return null;
  }
}

function normaliseAliases(raw, knownIds) {
  if (raw == null) return { aliases: new Map() };
  if (!isPlainObject(raw)) return { error: 'authority-aliases-invalid' };
  const aliases = new Map();
  for (const [rawFrom, rawTo] of Object.entries(raw)) {
    const from = safeId(rawFrom);
    const to = safeId(rawTo);
    if (!from || !to || from === to) return { error: 'authority-alias-invalid' };
    aliases.set(from, to);
  }
  for (const from of aliases.keys()) {
    let cursor = from;
    const seen = new Set();
    for (let depth = 0; depth < 8; depth += 1) {
      if (seen.has(cursor)) return { error: 'authority-alias-cycle' };
      seen.add(cursor);
      const next = aliases.get(cursor);
      if (!next) {
        if (!knownIds.has(cursor)) return { error: 'authority-alias-target-unknown' };
        break;
      }
      cursor = next;
      if (depth === 7) return { error: 'authority-alias-depth' };
    }
  }
  return { aliases };
}

function normaliseSong(raw) {
  if (!isPlainObject(raw)) return { error: 'authority-song-invalid' };
  const id = safeId(raw.id);
  if (!id) return { error: 'authority-song-id-invalid' };
  const genre = raw.genre == null ? null : safeId(raw.genre);
  if (raw.genre != null && !genre) return { error: 'authority-song-genre-invalid' };

  const releases = new Set();
  if (raw.releaseId != null) {
    const idValue = safeId(raw.releaseId);
    if (!idValue) return { error: 'authority-song-release-invalid' };
    releases.add(idValue);
  }
  if (raw.releaseIds != null) {
    if (!Array.isArray(raw.releaseIds)) return { error: 'authority-song-releases-invalid' };
    for (const rawRelease of raw.releaseIds) {
      const releaseId = safeId(rawRelease);
      if (!releaseId) return { error: 'authority-song-release-invalid' };
      releases.add(releaseId);
    }
  }

  let durationSeconds = null;
  if (raw.durationSeconds != null) {
    if (!finiteNonNegative(raw.durationSeconds)) return { error: 'authority-song-duration-invalid' };
    durationSeconds = raw.durationSeconds;
  }

  return {
    value: {
      id,
      genre,
      releaseIds: releases,
      durationSeconds,
      seekable: raw.seekable === true,
    },
  };
}

function normaliseSet(raw) {
  if (!isPlainObject(raw)) return { error: 'authority-set-invalid' };
  const id = safeId(raw.id);
  if (!id) return { error: 'authority-set-id-invalid' };
  const sourceId = raw.sourceId == null ? null : safeId(raw.sourceId);
  if (raw.sourceId != null && !sourceId) return { error: 'authority-set-source-invalid' };

  let durationSeconds = null;
  if (raw.durationSeconds != null) {
    if (!finiteNonNegative(raw.durationSeconds)) return { error: 'authority-set-duration-invalid' };
    durationSeconds = raw.durationSeconds;
  }

  const chapters = new Map();
  if (raw.chapters != null) {
    if (!Array.isArray(raw.chapters)) return { error: 'authority-chapters-invalid' };
    for (const chapter of raw.chapters) {
      if (!isPlainObject(chapter)) return { error: 'authority-chapter-invalid' };
      const chapterId = safeId(chapter.id);
      if (!chapterId || chapters.has(chapterId)) return { error: 'authority-chapter-id-invalid' };
      if (!finiteNonNegative(chapter.startSeconds)) return { error: 'authority-chapter-start-invalid' };
      const chapterSourceId = chapter.sourceId == null ? sourceId : safeId(chapter.sourceId);
      if (chapter.sourceId != null && !chapterSourceId) return { error: 'authority-chapter-source-invalid' };
      if (sourceId && chapterSourceId && chapterSourceId !== sourceId) return { error: 'authority-chapter-source-mismatch' };
      chapters.set(chapterId, {
        id: chapterId,
        startSeconds: chapter.startSeconds,
        sourceId: chapterSourceId,
      });
    }
  }

  return {
    value: {
      id,
      sourceId,
      durationSeconds,
      seekable: raw.seekable === true,
      chapters,
    },
  };
}

function normaliseAuthority(raw) {
  if (!isPlainObject(raw)) return { error: 'authority-invalid' };
  const songs = new Map();
  const sets = new Map();
  const rawSongs = raw.songs == null ? [] : raw.songs;
  const rawSets = raw.sets == null ? [] : raw.sets;
  if (!Array.isArray(rawSongs) || !Array.isArray(rawSets)) return { error: 'authority-collections-invalid' };

  for (const rawSong of rawSongs) {
    const parsed = normaliseSong(rawSong);
    if (parsed.error) return parsed;
    if (songs.has(parsed.value.id)) return { error: 'authority-song-duplicate' };
    songs.set(parsed.value.id, parsed.value);
  }
  for (const rawSet of rawSets) {
    const parsed = normaliseSet(rawSet);
    if (parsed.error) return parsed;
    if (sets.has(parsed.value.id)) return { error: 'authority-set-duplicate' };
    sets.set(parsed.value.id, parsed.value);
  }

  const songAliases = normaliseAliases(raw.songAliases, new Set(songs.keys()));
  if (songAliases.error) return songAliases;
  const setAliases = normaliseAliases(raw.setAliases, new Set(sets.keys()));
  if (setAliases.error) return setAliases;

  return { songs, sets, songAliases: songAliases.aliases, setAliases: setAliases.aliases };
}

function resolveId(rawId, records, aliases) {
  const requested = safeId(rawId);
  if (!requested) return { error: 'identity-invalid' };
  if (records.has(requested)) return { id: requested, aliasedFrom: null };
  let cursor = requested;
  const seen = new Set();
  for (let depth = 0; depth < 8; depth += 1) {
    if (seen.has(cursor)) return { error: 'identity-alias-cycle' };
    seen.add(cursor);
    const next = aliases.get(cursor);
    if (!next) return { error: 'identity-unknown' };
    cursor = next;
    if (records.has(cursor)) return { id: cursor, aliasedFrom: requested };
  }
  return { error: 'identity-alias-depth' };
}

function validStart(rawStart, record) {
  if (rawStart == null) return { value: null };
  if (!finiteNonNegative(rawStart)) return { issue: 'start-invalid' };
  if (!record.seekable) return { issue: 'start-not-seekable' };
  if (record.durationSeconds != null && rawStart > record.durationSeconds) return { issue: 'start-over-duration' };
  return { value: Math.floor(rawStart) };
}

function parseStart(rawStart, record) {
  if (rawStart == null) return { value: null };
  if (typeof rawStart !== 'string' || !/^\d+$/.test(rawStart)) return { issue: 'start-invalid' };
  const value = Number(rawStart);
  if (!Number.isSafeInteger(value) || value < 0) return { issue: 'start-invalid' };
  return validStart(value, record);
}

function baseContract(baseUrl, canonicalOrigin, playerPath) {
  const base = parseUrl(baseUrl);
  if (!base) return { error: 'base-url-invalid' };
  let origin = base.origin;
  if (canonicalOrigin != null) {
    const canonical = parseUrl(canonicalOrigin);
    if (!canonical) return { error: 'canonical-origin-invalid' };
    origin = canonical.origin;
  }
  const path = normalisePath(playerPath == null ? '/' : playerPath);
  if (!path) return { error: 'player-path-invalid' };
  return { origin, path };
}

function emptyContext() {
  return {
    kind: null,
    songId: null,
    nonstopSetId: null,
    genre: null,
    releaseId: null,
    startSeconds: null,
    chapterId: null,
  };
}

function fail(reason, issues = []) {
  return deepFreeze({
    version: VERSION,
    valid: false,
    reason,
    url: null,
    context: emptyContext(),
    issues: [...issues],
  });
}

function success(url, context, issues = [], extra = {}) {
  return deepFreeze({
    version: VERSION,
    valid: true,
    reason: null,
    url,
    context,
    issues: [...issues],
    ...extra,
  });
}

function serializeShareContext({ baseUrl, canonicalOrigin = null, playerPath = '/', context, authority } = {}) {
  const auth = normaliseAuthority(authority);
  if (auth.error) return fail(auth.error);
  const contract = baseContract(baseUrl, canonicalOrigin, playerPath);
  if (contract.error) return fail(contract.error);
  if (!isPlainObject(context)) return fail('context-invalid');

  const rawSong = context.songId;
  const rawSet = context.nonstopSetId ?? context.setId;
  if (rawSong != null && rawSet != null) return fail('identity-conflict');
  if (rawSong == null && rawSet == null) return fail('identity-missing');

  const issues = [];
  const output = emptyContext();
  const url = new URL(contract.path, `${contract.origin}/`);
  url.search = '';
  url.hash = '';

  if (rawSong != null) {
    const resolved = resolveId(rawSong, auth.songs, auth.songAliases);
    if (resolved.error) return fail(resolved.error);
    const song = auth.songs.get(resolved.id);
    output.kind = 'song';
    output.songId = song.id;
    output.genre = song.genre;
    url.searchParams.set('song', song.id);
    if (song.genre) url.searchParams.set('genre', song.genre);
    if (resolved.aliasedFrom) issues.push('song-alias-resolved');
    if (context.genre != null && context.genre !== song.genre) issues.push('genre-mismatch');

    if (context.releaseId != null) {
      const releaseId = safeId(context.releaseId);
      if (releaseId && song.releaseIds.has(releaseId)) {
        output.releaseId = releaseId;
        url.searchParams.set('release', releaseId);
      } else {
        issues.push('release-mismatch');
      }
    }

    if (context.chapterId != null) issues.push('chapter-incompatible');
    const start = validStart(context.startSeconds, song);
    if (start.issue) issues.push(start.issue);
    else if (start.value != null) {
      output.startSeconds = start.value;
      url.searchParams.set('t', String(start.value));
    }
  } else {
    const resolved = resolveId(rawSet, auth.sets, auth.setAliases);
    if (resolved.error) return fail(resolved.error);
    const set = auth.sets.get(resolved.id);
    output.kind = 'nonstop';
    output.nonstopSetId = set.id;
    url.searchParams.set('nonstop', set.id);
    if (resolved.aliasedFrom) issues.push('set-alias-resolved');

    if (context.releaseId != null) issues.push('release-incompatible');
    if (context.genre != null) issues.push('genre-incompatible');

    if (context.chapterId != null) {
      const chapterId = safeId(context.chapterId);
      const chapter = chapterId ? set.chapters.get(chapterId) : null;
      if (chapter) {
        output.chapterId = chapter.id;
        url.searchParams.set('chapter', chapter.id);
      } else {
        issues.push('chapter-unverified');
      }
    }

    const start = validStart(context.startSeconds, set);
    if (start.issue) issues.push(start.issue);
    else if (start.value != null) {
      output.startSeconds = start.value;
      url.searchParams.set('t', String(start.value));
    }
  }

  return success(url.toString(), output, issues);
}

function parseShareContext({ url: rawUrl, canonicalOrigin, playerPath = '/', authority } = {}) {
  const auth = normaliseAuthority(authority);
  if (auth.error) return fail(auth.error);
  const parsed = parseUrl(rawUrl);
  if (!parsed) return fail('url-invalid');
  const contract = baseContract(parsed.toString(), canonicalOrigin ?? parsed.origin, playerPath);
  if (contract.error) return fail(contract.error);
  if (parsed.origin !== contract.origin) return fail('origin-mismatch');
  const parsedPath = normalisePath(parsed.pathname);
  if (parsedPath !== contract.path) return fail('path-mismatch');

  for (const name of SHARE_PARAM_NAMES) {
    if (parsed.searchParams.getAll(name).length > 1) return fail('parameter-duplicate');
  }

  const songParam = parsed.searchParams.get('song');
  const setParam = parsed.searchParams.get('nonstop');
  if (songParam != null && setParam != null) return fail('identity-conflict');
  if (songParam == null && setParam == null) return fail('identity-missing');

  const issues = [];
  const allowed = new Set(SHARE_PARAM_NAMES);
  for (const key of new Set(parsed.searchParams.keys())) {
    if (!allowed.has(key)) issues.push('transient-param-ignored');
  }
  if (parsed.hash) issues.push('fragment-ignored');
  const output = emptyContext();

  if (songParam != null) {
    const resolved = resolveId(songParam, auth.songs, auth.songAliases);
    if (resolved.error) return fail(resolved.error, issues);
    const song = auth.songs.get(resolved.id);
    output.kind = 'song';
    output.songId = song.id;
    output.genre = song.genre;
    if (resolved.aliasedFrom) issues.push('song-alias-resolved');

    const requestedGenre = parsed.searchParams.get('genre');
    if (requestedGenre != null && requestedGenre !== song.genre) issues.push('genre-mismatch');

    const releaseParam = parsed.searchParams.get('release');
    if (releaseParam != null) {
      const releaseId = safeId(releaseParam);
      if (releaseId && song.releaseIds.has(releaseId)) output.releaseId = releaseId;
      else issues.push('release-mismatch');
    }

    if (parsed.searchParams.has('chapter')) issues.push('chapter-incompatible');
    const start = parseStart(parsed.searchParams.get('t'), song);
    if (start.issue) issues.push(start.issue);
    else output.startSeconds = start.value;
  } else {
    const resolved = resolveId(setParam, auth.sets, auth.setAliases);
    if (resolved.error) return fail(resolved.error, issues);
    const set = auth.sets.get(resolved.id);
    output.kind = 'nonstop';
    output.nonstopSetId = set.id;
    if (resolved.aliasedFrom) issues.push('set-alias-resolved');

    if (parsed.searchParams.has('release')) issues.push('release-incompatible');
    if (parsed.searchParams.has('genre')) issues.push('genre-incompatible');

    const chapterParam = parsed.searchParams.get('chapter');
    if (chapterParam != null) {
      const chapterId = safeId(chapterParam);
      const chapter = chapterId ? set.chapters.get(chapterId) : null;
      if (chapter) output.chapterId = chapter.id;
      else issues.push('chapter-unverified');
    }

    const start = parseStart(parsed.searchParams.get('t'), set);
    if (start.issue) issues.push(start.issue);
    else output.startSeconds = start.value;
  }

  return success(null, output, issues);
}

module.exports = Object.freeze({
  VERSION,
  SHARE_PARAM_NAMES,
  serializeShareContext,
  parseShareContext,
});
