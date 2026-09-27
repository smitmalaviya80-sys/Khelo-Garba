(function attachDirectSourceCatalogue(root, factory) {
  let resolver = root && root.GARBA_DIRECT_SOURCE_RESOLVER;
  if (!resolver && typeof module === 'object' && module.exports && typeof require === 'function') {
    resolver = require('./direct-source-resolver.js');
  }
  const api = factory(resolver);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.GARBA_DIRECT_SOURCE_CATALOGUE = Object.freeze(api);
})(typeof globalThis !== 'undefined' ? globalThis : this, function createDirectSourceCatalogue(defaultResolver) {
  'use strict';

  const VERSION = 1;
  const MANIFEST_FIELDS = new Set(['version', 'tracks', 'notes']);
  const ROUTE_KINDS = Object.freeze([
    'direct',
    'youtube-foreground',
    'unavailable',
    'direct-invalid',
  ]);

  function isPlainObject(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
  }

  function nonEmptyString(value) {
    return typeof value === 'string' && value.trim().length > 0;
  }

  function validateResolver(resolver) {
    if (!resolver || typeof resolver.resolvePlaybackSource !== 'function') {
      throw new TypeError('direct-source catalogue requires resolvePlaybackSource()');
    }
    return resolver;
  }

  function normaliseManifest(manifest) {
    if (!isPlainObject(manifest)) throw new TypeError('direct-source manifest must be an object');
    const unknown = Object.keys(manifest).filter((key) => !MANIFEST_FIELDS.has(key));
    if (unknown.length > 0) {
      throw new TypeError(`direct-source manifest has unknown field: ${unknown.sort()[0]}`);
    }
    if (!nonEmptyString(manifest.version)) throw new TypeError('direct-source manifest version is required');
    if (!isPlainObject(manifest.tracks)) throw new TypeError('direct-source manifest tracks must be an object');
    if (manifest.notes !== undefined && typeof manifest.notes !== 'string') {
      throw new TypeError('direct-source manifest notes must be a string when present');
    }
    return manifest;
  }

  function canonicalSongMap(songs) {
    if (!Array.isArray(songs)) throw new TypeError('canonical songs must be an array');
    const byId = new Map();
    for (const song of songs) {
      if (!isPlainObject(song) || !nonEmptyString(song.id)) {
        throw new TypeError('every canonical song must have a non-empty id');
      }
      const id = song.id.trim();
      if (byId.has(id)) throw new TypeError(`duplicate canonical song id: ${id}`);
      byId.set(id, song);
    }
    return byId;
  }

  function routeSummary(decisions) {
    const counts = Object.fromEntries(ROUTE_KINDS.map((kind) => [kind, 0]));
    let playable = 0;
    let backgroundCapable = 0;
    for (const decision of decisions) {
      if (Object.prototype.hasOwnProperty.call(counts, decision.kind)) counts[decision.kind] += 1;
      if (decision.playable === true) playable += 1;
      if (decision.backgroundCapable === true) backgroundCapable += 1;
    }
    return Object.freeze({
      total: decisions.length,
      direct: counts.direct,
      youtubeForeground: counts['youtube-foreground'],
      unavailable: counts.unavailable,
      directInvalid: counts['direct-invalid'],
      playable,
      backgroundCapable,
    });
  }

  function diagnosticRows(decisions, orphanDirectSongIds) {
    const rows = [];
    for (const songId of orphanDirectSongIds) {
      rows.push(Object.freeze({
        code: 'orphan-direct-entry',
        songId,
        routeKind: null,
        errors: Object.freeze([]),
      }));
    }
    for (const decision of decisions) {
      if (decision.kind !== 'direct-invalid') continue;
      rows.push(Object.freeze({
        code: 'direct-entry-invalid',
        songId: decision.songId,
        routeKind: decision.kind,
        errors: Object.freeze([...(decision.errors || [])]),
      }));
    }
    rows.sort((left, right) => left.songId.localeCompare(right.songId) || left.code.localeCompare(right.code));
    return Object.freeze(rows);
  }

  function buildDirectSourceCataloguePlan({ songs = [], manifest, resolver = defaultResolver } = {}) {
    const routeResolver = validateResolver(resolver);
    const directManifest = normaliseManifest(manifest);
    const songsById = canonicalSongMap(songs);
    const canonicalIds = [...songsById.keys()].sort((left, right) => left.localeCompare(right));
    const directIds = Object.keys(directManifest.tracks).sort((left, right) => left.localeCompare(right));
    const orphanDirectSongIds = directIds.filter((songId) => !songsById.has(songId));

    const decisions = canonicalIds.map((songId) => {
      const hasDirect = Object.prototype.hasOwnProperty.call(directManifest.tracks, songId);
      return routeResolver.resolvePlaybackSource({
        song: songsById.get(songId),
        directEntry: hasDirect ? directManifest.tracks[songId] : null,
        directSongId: hasDirect ? songId : null,
      });
    });

    const decisionsBySongId = Object.create(null);
    for (const decision of decisions) decisionsBySongId[decision.songId] = decision;

    return Object.freeze({
      version: VERSION,
      manifestVersion: directManifest.version.trim(),
      canonicalSongCount: canonicalIds.length,
      directEntryCount: directIds.length,
      orphanDirectSongIds: Object.freeze(orphanDirectSongIds),
      decisions: Object.freeze(decisions),
      decisionsBySongId: Object.freeze(decisionsBySongId),
      diagnostics: diagnosticRows(decisions, orphanDirectSongIds),
      summary: routeSummary(decisions),
    });
  }

  return {
    VERSION,
    ROUTE_KINDS,
    buildDirectSourceCataloguePlan,
  };
});
