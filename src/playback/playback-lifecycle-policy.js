(function attachPlaybackLifecyclePolicy(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.GARBA_PLAYBACK_LIFECYCLE_POLICY = Object.freeze(api);
})(typeof globalThis !== 'undefined' ? globalThis : this, function createPlaybackLifecyclePolicy() {
  'use strict';

  const VERSION = 1;
  const SOURCE_KINDS = new Set([
    'direct',
    'youtube-foreground',
    'unavailable',
    'direct-invalid',
    'direct-failed',
  ]);
  const PLAYBACK_STATES = new Set([
    'playing',
    'paused',
    'buffering',
    'ended',
    'error',
    'unavailable',
    'unknown',
  ]);
  const EVIDENCE_STATES = new Set(['fresh', 'stale', 'unknown']);
  const LIFECYCLE_EVENTS = new Set([
    'visible',
    'hidden',
    'pagehide',
    'pageshow',
    'freeze',
    'resume',
    'interrupted',
    'interruption-ended',
  ]);
  const BACKGROUND_EVENTS = new Set(['hidden', 'pagehide', 'freeze']);
  const FOREGROUND_EVENTS = new Set(['visible', 'pageshow', 'resume']);
  const TERMINAL_STATES = new Set(['ended', 'error', 'unavailable']);

  function isPlainObject(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
  }

  function nonEmptyString(value) {
    return typeof value === 'string' && value.trim().length > 0;
  }

  function validGeneration(value) {
    return nonEmptyString(value)
      || (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0);
  }

  function freezeDecision(decision) {
    return Object.freeze(decision);
  }

  function invalid(reason, songId = '', generation = null) {
    return freezeDecision({
      version: VERSION,
      valid: false,
      decision: 'unavailable',
      reason,
      songId,
      generation,
      stateClaim: 'none',
      requiresReconciliation: true,
      allowBackgroundContinuation: false,
      allowAutomaticResume: false,
      preserveActiveIdentity: true,
    });
  }

  function decision({
    name,
    reason,
    songId,
    generation,
    stateClaim,
    requiresReconciliation,
    allowBackgroundContinuation = false,
  }) {
    return freezeDecision({
      version: VERSION,
      valid: true,
      decision: name,
      reason,
      songId,
      generation,
      stateClaim,
      requiresReconciliation,
      allowBackgroundContinuation,
      allowAutomaticResume: false,
      preserveActiveIdentity: true,
    });
  }

  function sourceShapeValid(resolution) {
    if (!isPlainObject(resolution) || !SOURCE_KINDS.has(resolution.kind)) return false;
    const provider = String(resolution.provider || '').trim().toLowerCase();
    if (resolution.kind === 'direct') {
      return resolution.playable === true
        && resolution.backgroundCapable === true
        && provider === 'direct';
    }
    if (resolution.kind === 'youtube-foreground') {
      return resolution.playable === true
        && resolution.backgroundCapable !== true
        && provider === 'youtube';
    }
    if (resolution.kind === 'direct-invalid' || resolution.kind === 'direct-failed') {
      return resolution.playable !== true && provider === 'direct';
    }
    return resolution.kind === 'unavailable' && resolution.playable !== true;
  }

  function playbackStateClaim(state) {
    if (state === 'playing') return 'playing';
    if (state === 'paused') return 'paused';
    return 'none';
  }

  function reconcilePlaybackLifecycle({
    active,
    resolution,
    playback,
    lifecycle,
  } = {}) {
    if (!isPlainObject(active) || !nonEmptyString(active.songId) || !validGeneration(active.generation)) {
      return invalid('active-identity-invalid');
    }

    const songId = active.songId.trim();
    const generation = active.generation;

    if (!isPlainObject(resolution) || !nonEmptyString(resolution.songId)) {
      return invalid('resolution-invalid', songId, generation);
    }
    if (resolution.songId.trim() !== songId) {
      return invalid('resolution-identity-mismatch', songId, generation);
    }
    if (!sourceShapeValid(resolution)) {
      return invalid('resolution-source-shape-invalid', songId, generation);
    }

    if (!isPlainObject(playback)
      || !PLAYBACK_STATES.has(playback.state)
      || !EVIDENCE_STATES.has(playback.evidence)
      || !validGeneration(playback.generation)) {
      return invalid('playback-evidence-invalid', songId, generation);
    }

    if (!isPlainObject(lifecycle)
      || !LIFECYCLE_EVENTS.has(lifecycle.event)
      || !validGeneration(lifecycle.generation)) {
      return invalid('lifecycle-evidence-invalid', songId, generation);
    }

    if (playback.generation !== generation || lifecycle.generation !== generation) {
      return decision({
        name: 'ignore-stale-evidence',
        reason: 'stale-generation',
        songId,
        generation,
        stateClaim: null,
        requiresReconciliation: false,
        allowBackgroundContinuation: resolution.kind === 'direct',
      });
    }

    if (resolution.kind === 'unavailable'
      || resolution.kind === 'direct-invalid'
      || resolution.kind === 'direct-failed') {
      return decision({
        name: 'unavailable',
        reason: `source-${resolution.kind}`,
        songId,
        generation,
        stateClaim: 'none',
        requiresReconciliation: false,
      });
    }

    if (TERMINAL_STATES.has(playback.state)) {
      return decision({
        name: 'clear-stale-playing',
        reason: `playback-${playback.state}`,
        songId,
        generation,
        stateClaim: 'none',
        requiresReconciliation: false,
      });
    }

    const event = lifecycle.event;
    const fresh = playback.evidence === 'fresh';

    if (event === 'interrupted') {
      if (fresh && playback.state === 'paused') {
        return decision({
          name: 'hold-paused-truth',
          reason: 'interruption-paused',
          songId,
          generation,
          stateClaim: 'paused',
          requiresReconciliation: true,
        });
      }
      return decision({
        name: 'clear-stale-playing',
        reason: 'interruption-requires-reconciliation',
        songId,
        generation,
        stateClaim: 'none',
        requiresReconciliation: true,
      });
    }

    if (event === 'interruption-ended') {
      if (!fresh || playback.state === 'unknown' || playback.state === 'buffering') {
        return decision({
          name: 'reconcile-before-claim',
          reason: 'interruption-ended-without-fresh-source-truth',
          songId,
          generation,
          stateClaim: 'none',
          requiresReconciliation: true,
        });
      }
      if (playback.state === 'paused') {
        return decision({
          name: 'hold-paused-truth',
          reason: 'interruption-ended-paused',
          songId,
          generation,
          stateClaim: 'paused',
          requiresReconciliation: false,
        });
      }
      return decision({
        name: 'preserve-authoritative-state',
        reason: 'interruption-ended-fresh-source-truth',
        songId,
        generation,
        stateClaim: playbackStateClaim(playback.state),
        requiresReconciliation: false,
        allowBackgroundContinuation: resolution.kind === 'direct' && playback.state === 'playing',
      });
    }

    if (resolution.kind === 'youtube-foreground' && BACKGROUND_EVENTS.has(event)) {
      return decision({
        name: playback.state === 'paused' && fresh ? 'hold-paused-truth' : 'reconcile-before-claim',
        reason: 'youtube-foreground-only-background-transition',
        songId,
        generation,
        stateClaim: playback.state === 'paused' && fresh ? 'paused' : 'none',
        requiresReconciliation: true,
      });
    }

    if (FOREGROUND_EVENTS.has(event)) {
      if (!fresh || playback.state === 'unknown' || playback.state === 'buffering') {
        return decision({
          name: 'reconcile-before-claim',
          reason: 'foreground-transition-needs-fresh-source-truth',
          songId,
          generation,
          stateClaim: 'none',
          requiresReconciliation: true,
        });
      }
      if (playback.state === 'paused') {
        return decision({
          name: 'hold-paused-truth',
          reason: 'foreground-fresh-paused',
          songId,
          generation,
          stateClaim: 'paused',
          requiresReconciliation: false,
        });
      }
      return decision({
        name: 'preserve-authoritative-state',
        reason: 'foreground-fresh-source-truth',
        songId,
        generation,
        stateClaim: playbackStateClaim(playback.state),
        requiresReconciliation: false,
      });
    }

    if (resolution.kind === 'direct' && BACKGROUND_EVENTS.has(event)) {
      if (!fresh || playback.state === 'unknown') {
        return decision({
          name: 'reconcile-before-claim',
          reason: 'direct-background-without-fresh-media-truth',
          songId,
          generation,
          stateClaim: 'none',
          requiresReconciliation: true,
          allowBackgroundContinuation: true,
        });
      }
      if (playback.state === 'paused') {
        return decision({
          name: 'hold-paused-truth',
          reason: 'direct-background-paused',
          songId,
          generation,
          stateClaim: 'paused',
          requiresReconciliation: false,
          allowBackgroundContinuation: true,
        });
      }
      return decision({
        name: 'preserve-authoritative-state',
        reason: 'direct-background-capable',
        songId,
        generation,
        stateClaim: playbackStateClaim(playback.state),
        requiresReconciliation: false,
        allowBackgroundContinuation: true,
      });
    }

    return invalid('lifecycle-state-unhandled', songId, generation);
  }

  return {
    VERSION,
    reconcilePlaybackLifecycle,
  };
});
