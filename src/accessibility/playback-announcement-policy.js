(function attachPlaybackAnnouncementPolicy(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.GARBA_PLAYBACK_ANNOUNCEMENT_POLICY = Object.freeze(api);
})(typeof globalThis !== 'undefined' ? globalThis : this, function createPlaybackAnnouncementPolicy() {
  'use strict';

  const VERSION = 1;
  const PLAYBACK_STATES = new Set([
    'selected', 'loading', 'cued', 'playing', 'paused', 'buffering',
    'ended', 'unavailable', 'blocked', 'error',
  ]);
  const FAILURE_LABELS = Object.freeze({
    offline: 'Playback needs an internet connection.',
    'api-timeout': 'The player could not start. Try again.',
    unavailable: 'This recording is not available to play yet.',
    removed: 'This recording is no longer available from its verified source.',
    private: 'This recording is not available from its verified source.',
    'embedding-disabled': 'This recording cannot play in the embedded player.',
    'autoplay-blocked': 'Playback needs a tap or key press to start.',
    'provider-failed': 'This recording could not play here.',
    'route-failed': 'This recording could not play from its verified source.',
    unknown: 'Playback could not continue.',
  });

  function isPlainObject(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
  }

  function deepFreeze(value) {
    if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
    for (const child of Object.values(value)) deepFreeze(child);
    return Object.freeze(value);
  }

  function nonEmptyString(value) {
    return typeof value === 'string' && value.trim().length > 0;
  }

  function cleanText(value, maxLength = 240) {
    if (!nonEmptyString(value)) return null;
    const cleaned = value.replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim();
    if (!cleaned) return null;
    return cleaned.slice(0, maxLength);
  }

  function validGeneration(value) {
    return Number.isSafeInteger(value) && value >= 0;
  }

  function validIdentity(songId, generation) {
    return nonEmptyString(songId) && validGeneration(generation);
  }

  function identityKey(identity) {
    return identity ? `${identity.songId}::${identity.generation}` : null;
  }

  function createAnnouncementState() {
    return deepFreeze({
      version: VERSION,
      current: null,
      lastPlaybackState: null,
      lastFailureKey: null,
      transitionSequence: 0,
    });
  }

  function normalisePrevious(previous) {
    if (!isPlainObject(previous) || previous.version !== VERSION) return createAnnouncementState();
    const current = previous.current;
    if (current !== null) {
      if (!isPlainObject(current) || !validIdentity(current.songId, current.generation)) return createAnnouncementState();
    }
    return deepFreeze({
      version: VERSION,
      current: current ? {
        songId: current.songId.trim(),
        generation: current.generation,
        title: cleanText(current.title, 180),
      } : null,
      lastPlaybackState: PLAYBACK_STATES.has(previous.lastPlaybackState) ? previous.lastPlaybackState : null,
      lastFailureKey: nonEmptyString(previous.lastFailureKey) ? previous.lastFailureKey : null,
      transitionSequence: Number.isSafeInteger(previous.transitionSequence) && previous.transitionSequence >= 0
        ? previous.transitionSequence
        : 0,
    });
  }

  function result(state, announcement = null, reason = null, valid = true) {
    return deepFreeze({ version: VERSION, valid, reason, state, announcement });
  }

  function invalid(previous, reason) {
    return result(previous, null, reason, false);
  }

  function announcement(action, message, identity, reason) {
    return deepFreeze({
      action,
      reason,
      politeness: 'polite',
      songId: identity?.songId || null,
      generation: identity?.generation ?? null,
      message,
    });
  }

  function titleSuffix(identity) {
    return identity?.title ? ` ${identity.title}` : '';
  }

  function playbackMessage(playbackState, identity) {
    const suffix = titleSuffix(identity);
    switch (playbackState) {
      case 'selected': return identity?.title ? `Selected ${identity.title}.` : 'Recording selected.';
      case 'loading': return identity?.title ? `Loading ${identity.title}.` : 'Loading recording.';
      case 'cued': return identity?.title ? `${identity.title} is ready.` : 'Recording ready.';
      case 'playing': return `Playing${suffix}.`;
      case 'paused': return `Paused${suffix}.`;
      case 'buffering': return `Buffering${suffix}.`;
      case 'ended': return identity?.title ? `${identity.title} ended.` : 'Recording ended.';
      case 'unavailable': return FAILURE_LABELS.unavailable;
      case 'blocked': return 'Playback needs your action.';
      case 'error': return FAILURE_LABELS.unknown;
      default: return null;
    }
  }

  function selectIdentity(previous, event) {
    if (!validIdentity(event.songId, event.generation)) return invalid(previous, 'identity-invalid');
    const songId = event.songId.trim();
    const generation = event.generation;
    const title = cleanText(event.title, 180);
    const current = previous.current;

    if (current) {
      if (generation < current.generation) return invalid(previous, 'stale-generation');
      if (generation === current.generation && current.songId !== songId) {
        return invalid(previous, 'generation-identity-collision');
      }
      if (generation === current.generation && current.songId === songId) {
        return result(previous, null, 'duplicate-selection');
      }
    }

    const nextIdentity = { songId, generation, title };
    const next = deepFreeze({
      version: VERSION,
      current: nextIdentity,
      lastPlaybackState: 'selected',
      lastFailureKey: null,
      transitionSequence: previous.transitionSequence + 1,
    });
    return result(
      next,
      announcement('announce-playback-state', playbackMessage('selected', nextIdentity), nextIdentity, 'identity-selected'),
      'identity-selected',
    );
  }

  function matchesCurrent(previous, event) {
    if (!previous.current) return { ok: false, reason: 'no-current-identity' };
    if (!validIdentity(event.songId, event.generation)) return { ok: false, reason: 'identity-invalid' };
    if (event.generation !== previous.current.generation) return { ok: false, reason: 'stale-generation' };
    if (event.songId.trim() !== previous.current.songId) return { ok: false, reason: 'stale-song' };
    return { ok: true };
  }

  function applySnapshot(previous, event) {
    if (event.authoritative !== true) return invalid(previous, 'snapshot-not-authoritative');
    const match = matchesCurrent(previous, event);
    if (!match.ok) return invalid(previous, match.reason);
    const playbackState = nonEmptyString(event.playbackState) ? event.playbackState.trim().toLowerCase() : '';
    if (!PLAYBACK_STATES.has(playbackState)) return invalid(previous, 'playback-state-invalid');

    if (playbackState === previous.lastPlaybackState) return result(previous, null, 'duplicate-playback-state');

    const next = deepFreeze({
      ...previous,
      lastPlaybackState: playbackState,
      lastFailureKey: ['playing', 'paused', 'ended', 'cued'].includes(playbackState) ? null : previous.lastFailureKey,
      transitionSequence: previous.transitionSequence + 1,
    });
    const message = playbackMessage(playbackState, previous.current);
    return result(
      next,
      message ? announcement('announce-playback-state', message, previous.current, `state-${playbackState}`) : null,
      `state-${playbackState}`,
    );
  }

  function applyFailure(previous, event) {
    if (event.authoritative !== true) return invalid(previous, 'failure-not-authoritative');
    const match = matchesCurrent(previous, event);
    if (!match.ok) return invalid(previous, match.reason);
    const failureKind = nonEmptyString(event.failureKind) ? event.failureKind.trim().toLowerCase() : 'unknown';
    if (!Object.prototype.hasOwnProperty.call(FAILURE_LABELS, failureKind)) return invalid(previous, 'failure-kind-invalid');
    const failureKey = `${identityKey(previous.current)}::${failureKind}`;
    if (previous.lastFailureKey === failureKey) return result(previous, null, 'duplicate-failure');

    const listenerMessage = cleanText(event.listenerMessage, 300);
    const message = listenerMessage || FAILURE_LABELS[failureKind];
    const next = deepFreeze({
      ...previous,
      lastPlaybackState: failureKind === 'autoplay-blocked' ? 'blocked' : 'error',
      lastFailureKey: failureKey,
      transitionSequence: previous.transitionSequence + 1,
    });
    return result(
      next,
      announcement('announce-playback-failure', message, previous.current, `failure-${failureKind}`),
      `failure-${failureKind}`,
    );
  }

  function applyRecovery(previous, event) {
    const match = matchesCurrent(previous, event);
    if (!match.ok) return invalid(previous, match.reason);
    const next = deepFreeze({
      ...previous,
      lastFailureKey: null,
      transitionSequence: previous.transitionSequence + 1,
    });
    return result(next, null, event.type === 'retry' ? 'retry-reset' : 'recovery-reset');
  }

  function formatClock(seconds) {
    if (!Number.isFinite(seconds) || seconds < 0) return null;
    const rounded = Math.floor(seconds);
    const hours = Math.floor(rounded / 3600);
    const minutes = Math.floor((rounded % 3600) / 60);
    const secs = rounded % 60;
    return hours > 0
      ? `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
      : `${minutes}:${String(secs).padStart(2, '0')}`;
  }

  function formatSpokenProgress({ currentTime, duration = null } = {}) {
    if (!Number.isFinite(currentTime) || currentTime < 0) return null;
    if (duration !== null && duration !== undefined && (!Number.isFinite(duration) || duration < 0)) return null;
    const knownDuration = Number.isFinite(duration) && duration > 0;
    const safeCurrent = knownDuration ? Math.min(currentTime, duration) : currentTime;
    const currentLabel = formatClock(safeCurrent);
    if (!currentLabel) return null;
    if (!knownDuration) return `${currentLabel} elapsed`;
    const durationLabel = formatClock(duration);
    return durationLabel ? `${currentLabel} of ${durationLabel}` : null;
  }

  function applyProgressRead(previous, event) {
    const match = matchesCurrent(previous, event);
    if (!match.ok) return invalid(previous, match.reason);
    const message = formatSpokenProgress({ currentTime: event.currentTime, duration: event.duration });
    if (!message) return invalid(previous, 'progress-invalid');
    return result(
      previous,
      announcement('announce-progress', message, previous.current, 'explicit-progress-read'),
      'explicit-progress-read',
    );
  }

  function reducePlaybackAnnouncement(previousState, event) {
    const previous = normalisePrevious(previousState);
    if (!isPlainObject(event) || !nonEmptyString(event.type)) return invalid(previous, 'event-invalid');
    const type = event.type.trim().toLowerCase();

    switch (type) {
      case 'select': return selectIdentity(previous, event);
      case 'snapshot': return applySnapshot(previous, event);
      case 'failure': return applyFailure(previous, event);
      case 'retry':
      case 'recovery': return applyRecovery(previous, { ...event, type });
      case 'progress-read': return applyProgressRead(previous, event);
      case 'progress-poll': {
        const match = matchesCurrent(previous, event);
        return match.ok ? result(previous, null, 'progress-poll-silent') : invalid(previous, match.reason);
      }
      default: return invalid(previous, 'event-type-invalid');
    }
  }

  return {
    VERSION,
    PLAYBACK_STATES: Object.freeze([...PLAYBACK_STATES]),
    FAILURE_KINDS: Object.freeze(Object.keys(FAILURE_LABELS)),
    createAnnouncementState,
    reducePlaybackAnnouncement,
    formatSpokenProgress,
  };
});
