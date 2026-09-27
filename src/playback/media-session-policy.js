(function attachMediaSessionPolicy(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.GARBA_MEDIA_SESSION_POLICY = Object.freeze(api);
})(typeof globalThis !== 'undefined' ? globalThis : this, function createMediaSessionPolicy() {
  'use strict';

  const VERSION = 1;
  const ACTIVE_PLAYBACK_STATES = new Set(['playing', 'paused', 'buffering']);
  const TERMINAL_PLAYBACK_STATES = new Set(['ended', 'error', 'unavailable']);
  const ACTION_ORDER = [
    'play',
    'pause',
    'stop',
    'seekto',
    'seekbackward',
    'seekforward',
    'previoustrack',
    'nexttrack',
  ];

  function isPlainObject(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
  }

  function nonEmptyString(value) {
    return typeof value === 'string' && value.trim().length > 0;
  }

  function finiteNumber(value) {
    return typeof value === 'number' && Number.isFinite(value);
  }

  function validGeneration(value) {
    return Number.isSafeInteger(value) && value >= 0;
  }

  function cloneArtwork(artwork) {
    if (!Array.isArray(artwork)) return Object.freeze([]);
    const safe = artwork
      .filter((item) => isPlainObject(item) && nonEmptyString(item.src))
      .map((item) => {
        const copy = { src: item.src.trim() };
        if (nonEmptyString(item.sizes)) copy.sizes = item.sizes.trim();
        if (nonEmptyString(item.type)) copy.type = item.type.trim();
        return Object.freeze(copy);
      });
    return Object.freeze(safe);
  }

  function freezePolicy(policy) {
    if (isPlainObject(policy.metadata)) {
      if (Array.isArray(policy.metadata.artwork)) Object.freeze(policy.metadata.artwork);
      Object.freeze(policy.metadata);
    }
    if (isPlainObject(policy.position)) Object.freeze(policy.position);
    if (isPlainObject(policy.seekOffsets)) Object.freeze(policy.seekOffsets);
    if (Array.isArray(policy.actions)) Object.freeze(policy.actions);
    return Object.freeze(policy);
  }

  function emptyPolicy(reason, songId = '', generation = null) {
    return freezePolicy({
      version: VERSION,
      valid: false,
      reason,
      songId,
      generation,
      provider: null,
      backgroundCapable: false,
      playbackState: 'none',
      metadata: null,
      position: null,
      seekOffsets: null,
      actions: [],
    });
  }

  function canonicalIdentity(identity, resolution) {
    if (!isPlainObject(identity) || !isPlainObject(resolution)) return null;
    const identitySongId = nonEmptyString(identity.songId) ? identity.songId.trim() : '';
    const resolutionSongId = nonEmptyString(resolution.songId) ? resolution.songId.trim() : '';
    if (!identitySongId || !resolutionSongId || identitySongId !== resolutionSongId) return null;
    if (!nonEmptyString(identity.title) || !nonEmptyString(identity.artist)) return null;

    const metadata = {
      title: identity.title.trim(),
      artist: identity.artist.trim(),
      artwork: cloneArtwork(identity.artwork),
    };
    if (nonEmptyString(identity.album)) metadata.album = identity.album.trim();
    return metadata;
  }

  function sourceUsable(resolution) {
    if (!isPlainObject(resolution) || resolution.playable !== true || !nonEmptyString(resolution.songId)) return false;
    const provider = String(resolution.provider || '').trim().toLowerCase();
    if (resolution.kind === 'direct') {
      return provider === 'direct' && resolution.backgroundCapable === true;
    }
    if (resolution.kind === 'youtube-foreground') {
      return provider === 'youtube' && resolution.backgroundCapable !== true;
    }
    return false;
  }

  function sourceForegroundEligible(resolution, environment) {
    if (resolution.kind !== 'youtube-foreground') return true;
    return isPlainObject(environment) && environment.foreground === true;
  }

  function positionState(position, canSeek) {
    if (canSeek !== true || !isPlainObject(position)) return null;
    const duration = position.duration;
    const current = position.position;
    const playbackRate = position.playbackRate === undefined ? 1 : position.playbackRate;
    if (!finiteNumber(duration) || duration <= 0) return null;
    if (!finiteNumber(current) || current < 0 || current > duration) return null;
    if (!finiteNumber(playbackRate) || playbackRate <= 0) return null;
    return { duration, position: current, playbackRate };
  }

  function positiveOffset(value) {
    return finiteNumber(value) && value > 0 ? value : null;
  }

  function playbackPresentationState(playbackState) {
    if (playbackState === 'playing') return 'playing';
    if (playbackState === 'paused') return 'paused';
    return 'none';
  }

  function buildActions(capabilities, position, playbackState) {
    const flags = isPlainObject(capabilities) ? capabilities : {};
    const active = ACTIVE_PLAYBACK_STATES.has(playbackState);
    if (!active) return { actions: [], seekOffsets: null };

    const allowed = new Set();
    if (flags.canPlay === true) allowed.add('play');
    if (flags.canPause === true) allowed.add('pause');
    if (flags.canStop === true) allowed.add('stop');

    const truthfulPosition = positionState(position, flags.canSeek === true);
    let seekOffsets = null;
    if (truthfulPosition) {
      allowed.add('seekto');
      const backward = positiveOffset(flags.seekBackwardSeconds);
      const forward = positiveOffset(flags.seekForwardSeconds);
      if (backward !== null) allowed.add('seekbackward');
      if (forward !== null) allowed.add('seekforward');
      if (backward !== null || forward !== null) {
        seekOffsets = {};
        if (backward !== null) seekOffsets.backwardSeconds = backward;
        if (forward !== null) seekOffsets.forwardSeconds = forward;
      }
    }

    if (flags.canPrevious === true) allowed.add('previoustrack');
    if (flags.canNext === true) allowed.add('nexttrack');

    return {
      actions: ACTION_ORDER.filter((action) => allowed.has(action)),
      seekOffsets,
    };
  }

  function buildMediaSessionPolicy({
    resolution,
    identity,
    playback,
    capabilities,
    position,
    environment,
  } = {}) {
    if (!isPlainObject(resolution) || !nonEmptyString(resolution.songId)) {
      return emptyPolicy('resolution-invalid');
    }

    const songId = resolution.songId.trim();
    if (!sourceUsable(resolution)) return emptyPolicy('source-not-usable', songId);

    const metadata = canonicalIdentity(identity, resolution);
    if (!metadata) return emptyPolicy('identity-mismatch', songId);

    if (!isPlainObject(playback)
      || !nonEmptyString(playback.songId)
      || playback.songId.trim() !== songId
      || !validGeneration(playback.generation)) {
      return emptyPolicy('playback-identity-invalid', songId);
    }
    const generation = playback.generation;
    const state = nonEmptyString(playback.state)
      ? playback.state.trim().toLowerCase()
      : 'unknown';

    if (TERMINAL_PLAYBACK_STATES.has(state)) return emptyPolicy(`playback-${state}`, songId, generation);
    if (!sourceForegroundEligible(resolution, environment)) {
      return emptyPolicy('foreground-required', songId, generation);
    }

    const active = ACTIVE_PLAYBACK_STATES.has(state);
    if (!active) {
      return freezePolicy({
        version: VERSION,
        valid: true,
        reason: 'playback-inactive',
        songId,
        generation,
        provider: String(resolution.provider || '').trim() || null,
        backgroundCapable: resolution.kind === 'direct',
        playbackState: 'none',
        metadata,
        position: null,
        seekOffsets: null,
        actions: [],
      });
    }

    const actionPolicy = buildActions(capabilities, position, state);
    const truthfulPosition = actionPolicy.actions.includes('seekto')
      ? positionState(position, true)
      : null;

    return freezePolicy({
      version: VERSION,
      valid: true,
      reason: null,
      songId,
      generation,
      provider: String(resolution.provider || '').trim() || null,
      backgroundCapable: resolution.kind === 'direct',
      playbackState: playbackPresentationState(state),
      metadata,
      position: truthfulPosition,
      seekOffsets: actionPolicy.seekOffsets,
      actions: actionPolicy.actions,
    });
  }

  return {
    VERSION,
    buildMediaSessionPolicy,
  };
});
