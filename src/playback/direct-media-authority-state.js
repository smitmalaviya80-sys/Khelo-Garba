(function attachDirectMediaAuthorityState(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.GARBA_DIRECT_MEDIA_AUTHORITY_STATE = Object.freeze(api);
})(typeof globalThis !== 'undefined' ? globalThis : this, function createDirectMediaAuthorityState() {
  'use strict';

  const VERSION = 1;
  const POSITION_TOLERANCE_SECONDS = 0.25;
  const AUTHORITATIVE_EVENT_TYPES = new Set([
    'loadstart',
    'loadedmetadata',
    'durationchange',
    'canplay',
    'playing',
    'pause',
    'waiting',
    'timeupdate',
    'seek-start',
    'seek-commit',
    'ended',
    'error',
    'unavailable',
  ]);
  const TERMINAL_EVENT_TYPES = new Set(['ended', 'error', 'unavailable']);

  function isPlainObject(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
  }

  function nonEmptyString(value) {
    return typeof value === 'string' && value.trim().length > 0;
  }

  function isGeneration(value) {
    return Number.isSafeInteger(value) && value >= 0;
  }

  function isFinitePositive(value) {
    return Number.isFinite(value) && value > 0;
  }

  function isFiniteNonNegative(value) {
    return Number.isFinite(value) && value >= 0;
  }

  function parseHttpsUrl(value) {
    if (!nonEmptyString(value)) return null;
    try {
      const parsed = new URL(value);
      return parsed.protocol === 'https:' ? parsed.href : null;
    } catch {
      return null;
    }
  }

  function freezeState(state) {
    if (isPlainObject(state.source)) {
      if (isPlainObject(state.source.media)) Object.freeze(state.source.media);
      if (isPlainObject(state.source.provenance)) Object.freeze(state.source.provenance);
      Object.freeze(state.source);
    }
    if (isPlainObject(state.seek)) Object.freeze(state.seek);
    if (isPlainObject(state.error)) Object.freeze(state.error);
    return Object.freeze(state);
  }

  function makeIdleState(generation) {
    return freezeState({
      version: VERSION,
      generation,
      songId: null,
      source: null,
      phase: 'idle',
      playbackState: 'none',
      duration: null,
      position: null,
      seek: { active: false, target: null },
      error: null,
    });
  }

  function createInitialState() {
    return makeIdleState(0);
  }

  function cloneDirectSource(source) {
    if (!isPlainObject(source)) return null;
    if (source.kind !== 'direct' || source.provider !== 'direct') return null;
    if (source.playable !== true || source.backgroundCapable !== true) return null;
    if (!nonEmptyString(source.songId)) return null;
    if (!isPlainObject(source.media) || !isPlainObject(source.provenance)) return null;

    const mediaUrl = parseHttpsUrl(source.media.url);
    const proofUrl = parseHttpsUrl(source.provenance.proofUrl);
    const mimeType = String(source.media.mimeType || '').trim().toLowerCase();
    const sourceType = String(source.provenance.sourceType || '').trim();
    const rightsHolder = String(source.provenance.rightsHolder || '').trim();
    const licenseName = String(source.provenance.licenseName || '').trim();

    if (!mediaUrl || !proofUrl || !mimeType || sourceType !== 'licensed-direct') return null;
    if (!rightsHolder || !licenseName) return null;
    if (mediaUrl === proofUrl) return null;

    return {
      kind: 'direct',
      provider: 'direct',
      playable: true,
      backgroundCapable: true,
      songId: source.songId.trim(),
      media: {
        url: mediaUrl,
        mimeType,
      },
      provenance: {
        sourceType,
        rightsHolder,
        licenseName,
        proofUrl,
      },
    };
  }

  function selectDirectSource(state, event) {
    if (!isPlainObject(event) || event.type !== 'select-direct') return state;
    if (!isGeneration(event.generation) || event.generation <= state.generation) return state;

    const source = cloneDirectSource(event.source);
    if (!source) return state;
    if (event.songId !== undefined && String(event.songId || '').trim() !== source.songId) return state;

    return freezeState({
      version: VERSION,
      generation: event.generation,
      songId: source.songId,
      source,
      phase: 'selected',
      playbackState: 'none',
      duration: null,
      position: null,
      seek: { active: false, target: null },
      error: null,
    });
  }

  function resetAuthority(state, event) {
    if (!isPlainObject(event) || event.type !== 'reset') return state;
    if (!isGeneration(event.generation) || event.generation <= state.generation) return state;
    return makeIdleState(event.generation);
  }

  function isAuthoritativeMediaEvent(state, event) {
    if (!isPlainObject(state) || !isPlainObject(event)) return false;
    if (!AUTHORITATIVE_EVENT_TYPES.has(event.type)) return false;
    if (!nonEmptyString(state.songId) || !isGeneration(state.generation)) return false;
    return event.generation === state.generation && String(event.songId || '').trim() === state.songId;
  }

  function terminalTransitionAllowed(state, event) {
    if (state.phase === 'unavailable') return event.type === 'unavailable';
    if (state.phase === 'error') return event.type === 'error' || event.type === 'unavailable';
    if (state.phase === 'ended') return TERMINAL_EVENT_TYPES.has(event.type);
    return true;
  }

  function normaliseMeasurements(state, event) {
    let duration = state.duration;
    let position = state.position;

    if (event.duration !== undefined && isFinitePositive(event.duration)) {
      duration = event.duration;
      if (isFiniteNonNegative(position)) {
        if (position > duration + POSITION_TOLERANCE_SECONDS) position = null;
        else if (position > duration) position = duration;
      }
    }

    if (event.currentTime !== undefined && isFiniteNonNegative(event.currentTime)) {
      const candidate = event.currentTime;
      if (!isFinitePositive(duration) || candidate <= duration + POSITION_TOLERANCE_SECONDS) {
        position = isFinitePositive(duration) && candidate > duration ? duration : candidate;
      }
    }

    return { duration, position };
  }

  function validTarget(target, duration) {
    if (!isFiniteNonNegative(target)) return false;
    return !isFinitePositive(duration) || target <= duration + POSITION_TOLERANCE_SECONDS;
  }

  function nextState(state, overrides) {
    return freezeState({
      version: VERSION,
      generation: state.generation,
      songId: state.songId,
      source: state.source,
      phase: state.phase,
      playbackState: state.playbackState,
      duration: state.duration,
      position: state.position,
      seek: state.seek,
      error: state.error,
      ...overrides,
    });
  }

  function reduceAuthoritativeEvent(state, event) {
    if (!isAuthoritativeMediaEvent(state, event)) return state;
    if (!terminalTransitionAllowed(state, event)) return state;

    const measured = normaliseMeasurements(state, event);

    switch (event.type) {
      case 'loadstart':
        return nextState(state, {
          phase: 'loading',
          playbackState: 'none',
          duration: measured.duration,
          position: measured.position,
          seek: { active: false, target: null },
          error: null,
        });
      case 'loadedmetadata':
      case 'durationchange':
        return nextState(state, {
          phase: state.phase === 'selected' || state.phase === 'loading' ? 'ready' : state.phase,
          duration: measured.duration,
          position: measured.position,
        });
      case 'canplay':
        return nextState(state, {
          phase: state.phase === 'playing' || state.phase === 'paused' ? state.phase : 'ready',
          duration: measured.duration,
          position: measured.position,
          error: null,
        });
      case 'playing':
        return nextState(state, {
          phase: 'playing',
          playbackState: 'playing',
          duration: measured.duration,
          position: measured.position,
          seek: { active: false, target: null },
          error: null,
        });
      case 'pause':
        return nextState(state, {
          phase: 'paused',
          playbackState: 'paused',
          duration: measured.duration,
          position: measured.position,
          seek: { active: false, target: null },
        });
      case 'waiting':
        return nextState(state, {
          phase: 'buffering',
          playbackState: 'none',
          duration: measured.duration,
          position: measured.position,
        });
      case 'timeupdate':
        return nextState(state, {
          duration: measured.duration,
          position: measured.position,
        });
      case 'seek-start': {
        if (!validTarget(event.target, state.duration)) return state;
        const target = isFinitePositive(state.duration) && event.target > state.duration
          ? state.duration
          : event.target;
        return nextState(state, {
          seek: { active: true, target },
        });
      }
      case 'seek-commit': {
        if (!isFiniteNonNegative(event.currentTime)) return state;
        if (!validTarget(event.currentTime, state.duration)) return state;
        const position = isFinitePositive(state.duration) && event.currentTime > state.duration
          ? state.duration
          : event.currentTime;
        return nextState(state, {
          position,
          seek: { active: false, target: null },
        });
      }
      case 'ended':
        return nextState(state, {
          phase: 'ended',
          playbackState: 'paused',
          duration: measured.duration,
          position: measured.position,
          seek: { active: false, target: null },
          error: null,
        });
      case 'error': {
        const code = nonEmptyString(event.code) ? event.code.trim() : 'media-error';
        return nextState(state, {
          phase: 'error',
          playbackState: 'none',
          duration: measured.duration,
          position: measured.position,
          seek: { active: false, target: null },
          error: { code },
        });
      }
      case 'unavailable': {
        const reason = nonEmptyString(event.reason) ? event.reason.trim() : 'direct-media-unavailable';
        return nextState(state, {
          phase: 'unavailable',
          playbackState: 'none',
          duration: measured.duration,
          position: measured.position,
          seek: { active: false, target: null },
          error: { code: reason },
        });
      }
      default:
        return state;
    }
  }

  function reduceDirectMediaAuthorityState(currentState, event) {
    const state = isPlainObject(currentState) && currentState.version === VERSION
      ? currentState
      : createInitialState();
    if (!isPlainObject(event) || !nonEmptyString(event.type)) return state;
    if (event.type === 'select-direct') return selectDirectSource(state, event);
    if (event.type === 'reset') return resetAuthority(state, event);
    return reduceAuthoritativeEvent(state, event);
  }

  return {
    VERSION,
    POSITION_TOLERANCE_SECONDS,
    createInitialState,
    reduceDirectMediaAuthorityState,
    isAuthoritativeMediaEvent,
  };
});
