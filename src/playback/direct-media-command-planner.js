'use strict';

const VERSION = 1;
const AUTHORITY_VERSION = 1;
const LIFECYCLE_VERSION = 1;
const MEDIA_SESSION_VERSION = 1;
const INTENT_TYPES = new Set(['sync-source', 'play', 'pause', 'seek', 'reconcile', 'clear']);
const PLAYABLE_PHASES = new Set(['selected', 'loading', 'ready', 'paused', 'buffering']);
const SEEKABLE_PHASES = new Set(['ready', 'playing', 'paused', 'buffering']);

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function nonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function validGeneration(value) {
  return Number.isSafeInteger(value) && value >= 0;
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

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function cloneJsonValue(value) {
  if (Array.isArray(value)) return value.map(cloneJsonValue);
  if (isPlainObject(value)) {
    const copy = {};
    for (const [key, child] of Object.entries(value)) copy[key] = cloneJsonValue(child);
    return copy;
  }
  return value;
}

function authorityView(state) {
  if (!isPlainObject(state) || state.version !== AUTHORITY_VERSION || !validGeneration(state.generation)) {
    return { kind: 'invalid', reason: 'authority-invalid' };
  }

  const idle = state.songId === null
    && state.source === null
    && state.phase === 'idle'
    && state.playbackState === 'none';
  if (idle) {
    return {
      kind: 'idle',
      songId: null,
      generation: state.generation,
      phase: 'idle',
      playbackState: 'none',
      duration: null,
    };
  }

  if (!nonEmptyString(state.songId) || !isPlainObject(state.source)) {
    return { kind: 'invalid', reason: 'authority-identity-invalid' };
  }

  const songId = state.songId.trim();
  const source = state.source;
  const mediaUrl = isPlainObject(source.media) ? parseHttpsUrl(source.media.url) : null;
  const mimeType = isPlainObject(source.media) && nonEmptyString(source.media.mimeType)
    ? source.media.mimeType.trim().toLowerCase()
    : '';
  const direct = source.kind === 'direct'
    && source.provider === 'direct'
    && source.playable === true
    && source.backgroundCapable === true
    && source.songId === songId
    && mediaUrl
    && mimeType;

  if (!direct) {
    return {
      kind: 'non-direct',
      reason: 'authority-source-not-direct',
      songId,
      generation: state.generation,
      phase: nonEmptyString(state.phase) ? state.phase.trim() : 'unknown',
      playbackState: nonEmptyString(state.playbackState) ? state.playbackState.trim() : 'none',
    };
  }

  const duration = Number.isFinite(state.duration) && state.duration > 0 ? state.duration : null;
  return {
    kind: 'direct',
    songId,
    generation: state.generation,
    phase: nonEmptyString(state.phase) ? state.phase.trim() : 'unknown',
    playbackState: nonEmptyString(state.playbackState) ? state.playbackState.trim() : 'none',
    duration,
    media: { url: mediaUrl, mimeType },
  };
}

function bindingView(binding) {
  if (binding === null || binding === undefined) return { kind: 'empty' };
  if (!isPlainObject(binding)) return { kind: 'invalid' };

  const hasIdentity = binding.songId !== undefined
    || binding.generation !== undefined
    || binding.sourceUrl !== undefined;
  if (!hasIdentity) return { kind: 'empty' };

  const sourceUrl = parseHttpsUrl(binding.sourceUrl);
  if (!nonEmptyString(binding.songId) || !validGeneration(binding.generation) || !sourceUrl) {
    return { kind: 'invalid' };
  }
  return {
    kind: 'bound',
    songId: binding.songId.trim(),
    generation: binding.generation,
    sourceUrl,
  };
}

function sameBinding(authority, binding) {
  return authority.kind === 'direct'
    && binding.kind === 'bound'
    && binding.songId === authority.songId
    && binding.generation === authority.generation
    && binding.sourceUrl === authority.media.url;
}

function intentView(intent) {
  if (!isPlainObject(intent) || !nonEmptyString(intent.type)) {
    return { valid: false, type: null, reason: 'intent-invalid' };
  }
  const type = intent.type.trim().toLowerCase();
  if (!INTENT_TYPES.has(type)) return { valid: false, type, reason: 'intent-unsupported' };
  return { valid: true, type, raw: intent };
}

function intentMatchesAuthority(intent, authority) {
  if (authority.kind !== 'direct') return false;
  return nonEmptyString(intent.songId)
    && intent.songId.trim() === authority.songId
    && intent.generation === authority.generation;
}

function lifecycleView(decision, authority) {
  if (decision === null || decision === undefined) return { kind: 'absent' };
  if (!isPlainObject(decision) || decision.version !== LIFECYCLE_VERSION || decision.valid !== true) {
    return { kind: 'invalid' };
  }
  if (authority.kind !== 'direct') return { kind: 'mismatch' };
  if (decision.songId !== authority.songId || decision.generation !== authority.generation) {
    return { kind: 'mismatch' };
  }
  return {
    kind: 'current',
    decision: nonEmptyString(decision.decision) ? decision.decision.trim() : '',
    requiresReconciliation: decision.requiresReconciliation === true,
    stateClaim: decision.stateClaim === 'playing' || decision.stateClaim === 'paused'
      ? decision.stateClaim
      : 'none',
  };
}

function cloneMediaSessionPolicy(policy) {
  const copy = {
    version: policy.version,
    valid: true,
    reason: policy.reason ?? null,
    songId: policy.songId,
    generation: policy.generation,
    provider: policy.provider,
    backgroundCapable: policy.backgroundCapable === true,
    playbackState: policy.playbackState,
    metadata: policy.metadata ? cloneJsonValue(policy.metadata) : null,
    position: policy.position ? cloneJsonValue(policy.position) : null,
    seekOffsets: policy.seekOffsets ? cloneJsonValue(policy.seekOffsets) : null,
    actions: Array.isArray(policy.actions) ? policy.actions.map((action) => String(action)) : [],
  };
  return deepFreeze(copy);
}

function mediaSessionView(policy, authority, lifecycle) {
  if (policy === null || policy === undefined) return { kind: 'absent' };
  if (!isPlainObject(policy) || policy.version !== MEDIA_SESSION_VERSION || policy.valid !== true) {
    return { kind: 'clear', reason: 'media-session-policy-invalid' };
  }
  if (authority.kind !== 'direct'
    || policy.songId !== authority.songId
    || !validGeneration(policy.generation)
    || policy.generation !== authority.generation
    || policy.provider !== 'direct'
    || policy.backgroundCapable !== true) {
    return { kind: 'clear', reason: 'media-session-policy-mismatch' };
  }
  if (lifecycle.kind === 'current' && lifecycle.requiresReconciliation) {
    return { kind: 'clear', reason: 'media-session-reconciliation-required' };
  }
  return { kind: 'sync', policy: cloneMediaSessionPolicy(policy) };
}

function expectedBinding(binding) {
  if (binding.kind !== 'bound') return null;
  return deepFreeze({
    songId: binding.songId,
    generation: binding.generation,
    sourceUrl: binding.sourceUrl,
  });
}

function command(op, authority, extra = {}) {
  const base = {
    op,
    songId: authority && nonEmptyString(authority.songId) ? authority.songId : null,
    generation: authority && validGeneration(authority.generation) ? authority.generation : null,
    ...extra,
  };
  return deepFreeze(base);
}

function clearBoundMedia(commands, authority, binding) {
  if (binding.kind !== 'bound') return;
  const guard = expectedBinding(binding);
  commands.push(command('request-pause', authority, { expectedBinding: guard, reason: 'replace-stale-binding' }));
  commands.push(command('clear-media-source', authority, { expectedBinding: guard }));
}

function bindActiveSource(commands, authority) {
  commands.push(command('bind-source', authority, {
    sourceUrl: authority.media.url,
    mimeType: authority.media.mimeType,
  }));
  commands.push(command('load-media', authority));
}

function ensureActiveBinding(commands, authority, binding) {
  if (sameBinding(authority, binding)) return;
  clearBoundMedia(commands, authority, binding);
  bindActiveSource(commands, authority);
}

function pushMediaSession(commands, authority, mediaSession, clearReason = null) {
  if (clearReason) {
    commands.push(command('clear-media-session', authority, { reason: clearReason }));
    return;
  }
  if (mediaSession.kind === 'sync') {
    commands.push(command('sync-media-session', authority, { policy: mediaSession.policy }));
  } else if (mediaSession.kind === 'clear') {
    commands.push(command('clear-media-session', authority, { reason: mediaSession.reason }));
  }
}

function result({ valid, reason = null, authority, intent, intentAccepted, intentReason = null, commands }) {
  return deepFreeze({
    version: VERSION,
    valid,
    reason,
    songId: authority && nonEmptyString(authority.songId) ? authority.songId : null,
    generation: authority && validGeneration(authority.generation) ? authority.generation : null,
    intent: deepFreeze({
      type: intent && intent.type ? intent.type : null,
      accepted: intentAccepted === true,
      reason: intentReason,
    }),
    commands,
  });
}

function planDirectMediaCommands({
  authorityState,
  binding = null,
  intent,
  lifecycleDecision = null,
  mediaSessionPolicy = null,
} = {}) {
  const authority = authorityView(authorityState);
  const bindingState = bindingView(binding);
  const requested = intentView(intent);
  const commands = [];

  if (authority.kind === 'invalid') {
    if (mediaSessionPolicy !== null && mediaSessionPolicy !== undefined) {
      commands.push(command('clear-media-session', null, { reason: 'authority-invalid' }));
    }
    return result({
      valid: false,
      reason: authority.reason,
      authority,
      intent: requested,
      intentAccepted: false,
      intentReason: requested.reason || 'authority-invalid',
      commands,
    });
  }

  if (!requested.valid) {
    const lifecycle = lifecycleView(lifecycleDecision, authority);
    const mediaSession = mediaSessionView(mediaSessionPolicy, authority, lifecycle);
    pushMediaSession(commands, authority, mediaSession);
    return result({
      valid: true,
      authority,
      intent: requested,
      intentAccepted: false,
      intentReason: requested.reason,
      commands,
    });
  }

  if (bindingState.kind === 'invalid' && requested.type !== 'clear') {
    const lifecycle = lifecycleView(lifecycleDecision, authority);
    const mediaSession = mediaSessionView(mediaSessionPolicy, authority, lifecycle);
    pushMediaSession(commands, authority, mediaSession);
    return result({
      valid: true,
      authority,
      intent: requested,
      intentAccepted: false,
      intentReason: 'binding-invalid',
      commands,
    });
  }

  const lifecycle = lifecycleView(lifecycleDecision, authority);
  const mediaSession = mediaSessionView(mediaSessionPolicy, authority, lifecycle);

  if (authority.kind !== 'direct') {
    if (requested.type === 'clear' || requested.type === 'sync-source') {
      clearBoundMedia(commands, authority, bindingState);
      if (requested.type === 'clear' || mediaSessionPolicy !== null) {
        pushMediaSession(commands, authority, mediaSession, 'no-active-direct-source');
      }
      return result({
        valid: true,
        authority,
        intent: requested,
        intentAccepted: true,
        commands,
      });
    }
    pushMediaSession(commands, authority, mediaSession);
    return result({
      valid: true,
      authority,
      intent: requested,
      intentAccepted: false,
      intentReason: 'no-active-direct-source',
      commands,
    });
  }

  if (!intentMatchesAuthority(requested.raw, authority)) {
    pushMediaSession(commands, authority, mediaSession);
    return result({
      valid: true,
      authority,
      intent: requested,
      intentAccepted: false,
      intentReason: 'intent-identity-mismatch',
      commands,
    });
  }

  if (lifecycle.kind === 'mismatch' || lifecycle.kind === 'invalid') {
    pushMediaSession(commands, authority, mediaSession, 'lifecycle-evidence-not-current');
    return result({
      valid: true,
      authority,
      intent: requested,
      intentAccepted: false,
      intentReason: 'lifecycle-evidence-not-current',
      commands,
    });
  }

  switch (requested.type) {
    case 'sync-source':
      ensureActiveBinding(commands, authority, bindingState);
      break;

    case 'play':
      if (lifecycle.kind === 'current' && lifecycle.requiresReconciliation) {
        commands.push(command('read-media-state', authority));
        pushMediaSession(commands, authority, mediaSession);
        return result({
          valid: true,
          authority,
          intent: requested,
          intentAccepted: false,
          intentReason: 'reconciliation-required-before-play',
          commands,
        });
      }
      if (authority.playbackState === 'playing' || authority.phase === 'playing') break;
      if (!PLAYABLE_PHASES.has(authority.phase)) {
        pushMediaSession(commands, authority, mediaSession);
        return result({
          valid: true,
          authority,
          intent: requested,
          intentAccepted: false,
          intentReason: 'authority-not-playable',
          commands,
        });
      }
      ensureActiveBinding(commands, authority, bindingState);
      commands.push(command('request-play', authority, { expectedBinding: expectedBinding({
        kind: 'bound', songId: authority.songId, generation: authority.generation, sourceUrl: authority.media.url,
      }) }));
      break;

    case 'pause':
      if (bindingState.kind === 'bound') {
        const meaningful = authority.playbackState === 'playing' || authority.phase === 'playing' || authority.phase === 'buffering';
        if (meaningful || !sameBinding(authority, bindingState)) {
          commands.push(command('request-pause', authority, {
            expectedBinding: expectedBinding(bindingState),
            reason: sameBinding(authority, bindingState) ? 'pause-intent' : 'stale-binding',
          }));
        }
      }
      break;

    case 'seek': {
      if (lifecycle.kind === 'current' && lifecycle.requiresReconciliation) {
        commands.push(command('read-media-state', authority));
        pushMediaSession(commands, authority, mediaSession);
        return result({
          valid: true,
          authority,
          intent: requested,
          intentAccepted: false,
          intentReason: 'reconciliation-required-before-seek',
          commands,
        });
      }
      const target = requested.raw.targetSeconds;
      if (!sameBinding(authority, bindingState)) {
        pushMediaSession(commands, authority, mediaSession);
        return result({
          valid: true,
          authority,
          intent: requested,
          intentAccepted: false,
          intentReason: 'binding-not-active',
          commands,
        });
      }
      if (!SEEKABLE_PHASES.has(authority.phase)
        || authority.duration === null
        || !Number.isFinite(target)
        || target < 0
        || target > authority.duration) {
        pushMediaSession(commands, authority, mediaSession);
        return result({
          valid: true,
          authority,
          intent: requested,
          intentAccepted: false,
          intentReason: 'seek-target-invalid',
          commands,
        });
      }
      commands.push(command('request-seek', authority, {
        expectedBinding: expectedBinding(bindingState),
        targetSeconds: target,
      }));
      break;
    }

    case 'reconcile':
      if (lifecycle.kind === 'current' && lifecycle.decision === 'ignore-stale-evidence') break;
      commands.push(command('read-media-state', authority));
      break;

    case 'clear':
      clearBoundMedia(commands, authority, bindingState);
      pushMediaSession(commands, authority, mediaSession, 'explicit-clear');
      return result({
        valid: true,
        authority,
        intent: requested,
        intentAccepted: true,
        commands,
      });

    default:
      return result({
        valid: true,
        authority,
        intent: requested,
        intentAccepted: false,
        intentReason: 'intent-unsupported',
        commands,
      });
  }

  pushMediaSession(commands, authority, mediaSession);
  return result({
    valid: true,
    authority,
    intent: requested,
    intentAccepted: true,
    commands,
  });
}

const api = deepFreeze({
  VERSION,
  INTENT_TYPES: [...INTENT_TYPES],
  planDirectMediaCommands,
});

if (typeof module === 'object' && module.exports) module.exports = api;
