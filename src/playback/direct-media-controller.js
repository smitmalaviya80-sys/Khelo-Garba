(function attachDirectMediaController(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.GARBA_DIRECT_MEDIA_CONTROLLER = Object.freeze(api);
})(typeof globalThis !== 'undefined' ? globalThis : this, function createDirectMediaControllerApi() {
  'use strict';

  const VERSION = 1;
  const MEDIA_EVENTS = Object.freeze([
    'loadstart',
    'loadedmetadata',
    'durationchange',
    'canplay',
    'playing',
    'pause',
    'waiting',
    'timeupdate',
    'seeked',
    'ended',
    'error',
  ]);
  const MEDIA_SESSION_ACTIONS = Object.freeze([
    'play',
    'pause',
    'stop',
    'seekto',
    'seekbackward',
    'seekforward',
    'previoustrack',
    'nexttrack',
  ]);
  const FOREGROUND_EVENTS = new Set(['visible', 'pageshow', 'resume']);
  const BACKGROUND_EVENTS = new Set(['hidden', 'pagehide', 'freeze']);

  function isPlainObject(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
  }

  function nonEmptyString(value) {
    return typeof value === 'string' && value.trim().length > 0;
  }

  function finiteNumber(value) {
    return typeof value === 'number' && Number.isFinite(value);
  }

  function safeCall(fn, fallback = undefined) {
    try {
      return typeof fn === 'function' ? fn() : fallback;
    } catch {
      return fallback;
    }
  }

  function canonicalHttpsUrl(value) {
    if (!nonEmptyString(value)) return null;
    try {
      const parsed = new URL(value);
      return parsed.protocol === 'https:' ? parsed.href : null;
    } catch {
      return null;
    }
  }

  function cloneArtwork(value) {
    if (!Array.isArray(value)) return Object.freeze([]);
    return Object.freeze(value
      .filter((item) => isPlainObject(item) && nonEmptyString(item.src))
      .map((item) => Object.freeze({
        src: item.src.trim(),
        ...(nonEmptyString(item.sizes) ? { sizes: item.sizes.trim() } : {}),
        ...(nonEmptyString(item.type) ? { type: item.type.trim() } : {}),
      })));
  }

  function cloneIdentity(identity, songId) {
    if (!isPlainObject(identity)) return null;
    if (String(identity.songId || '').trim() !== songId) return null;
    if (!nonEmptyString(identity.title) || !nonEmptyString(identity.artist)) return null;
    const copy = {
      songId,
      title: identity.title.trim(),
      artist: identity.artist.trim(),
      artwork: cloneArtwork(identity.artwork),
    };
    if (nonEmptyString(identity.album)) copy.album = identity.album.trim();
    return Object.freeze(copy);
  }

  function cloneCapabilities(capabilities) {
    const source = isPlainObject(capabilities) ? capabilities : {};
    return Object.freeze({
      canPlay: source.canPlay === true,
      canPause: source.canPause === true,
      canStop: source.canStop === true,
      canSeek: source.canSeek === true,
      canPrevious: source.canPrevious === true,
      canNext: source.canNext === true,
      seekBackwardSeconds: finiteNumber(source.seekBackwardSeconds) && source.seekBackwardSeconds > 0
        ? source.seekBackwardSeconds
        : null,
      seekForwardSeconds: finiteNumber(source.seekForwardSeconds) && source.seekForwardSeconds > 0
        ? source.seekForwardSeconds
        : null,
    });
  }

  function playbackStateFromAuthority(state) {
    if (!isPlainObject(state)) return 'unknown';
    if (state.phase === 'playing') return 'playing';
    if (state.phase === 'paused') return 'paused';
    if (state.phase === 'buffering') return 'buffering';
    if (state.phase === 'ended') return 'ended';
    if (state.phase === 'error') return 'error';
    if (state.phase === 'unavailable') return 'unavailable';
    return 'unknown';
  }

  function sourceObserved(mediaElement) {
    const current = String(mediaElement.currentSrc || '').trim();
    if (current) return canonicalHttpsUrl(current);
    return canonicalHttpsUrl(String(mediaElement.src || '').trim());
  }

  function defaultMetadataFactory(metadata) {
    return metadata;
  }

  function createDirectMediaController({
    mediaElement,
    mediaSession = null,
    metadataFactory = defaultMetadataFactory,
    authorityStateApi,
    mediaSessionPolicyApi,
    lifecyclePolicyApi,
    sourceResolverApi,
    commandPlannerApi,
    onPrevious = null,
    onNext = null,
    onStateChange = null,
  } = {}) {
    if (!mediaElement
      || typeof mediaElement.addEventListener !== 'function'
      || typeof mediaElement.removeEventListener !== 'function'
      || typeof mediaElement.play !== 'function'
      || typeof mediaElement.pause !== 'function') {
      throw new TypeError('createDirectMediaController requires one persistent media element');
    }
    if (!authorityStateApi
      || typeof authorityStateApi.createInitialState !== 'function'
      || typeof authorityStateApi.reduceDirectMediaAuthorityState !== 'function') {
      throw new TypeError('direct-media authority reducer API is required');
    }
    if (!mediaSessionPolicyApi || typeof mediaSessionPolicyApi.buildMediaSessionPolicy !== 'function') {
      throw new TypeError('Media Session policy API is required');
    }
    if (!lifecyclePolicyApi || typeof lifecyclePolicyApi.reconcilePlaybackLifecycle !== 'function') {
      throw new TypeError('playback lifecycle policy API is required');
    }
    if (!sourceResolverApi || typeof sourceResolverApi.isBlockedConsumerProviderUrl !== 'function') {
      throw new TypeError('direct-source resolver API is required');
    }
    if (!commandPlannerApi || typeof commandPlannerApi.planDirectMediaCommands !== 'function') {
      throw new TypeError('direct-media command planner API is required');
    }
    if (typeof metadataFactory !== 'function') throw new TypeError('metadataFactory must be a function');

    let state = authorityStateApi.createInitialState();
    let resolution = null;
    let identity = null;
    let capabilities = cloneCapabilities(null);
    let activeUrl = null;
    let boundSongId = null;
    let boundGeneration = null;
    let boundUrl = null;
    let destroyed = false;
    let foreground = true;
    let lifecycleStateClaim = null;
    let lastPolicy = null;
    let lastLifecycleDecision = null;
    const installedActions = new Set();
    const listeners = new Map();

    function notify(reason) {
      if (typeof onStateChange !== 'function') return;
      safeCall(() => onStateChange(Object.freeze({ state, policy: lastPolicy, reason })));
    }

    function bindingFact() {
      if (!nonEmptyString(boundSongId) || !Number.isSafeInteger(boundGeneration) || !boundUrl) return null;
      const assigned = canonicalHttpsUrl(String(mediaElement.src || '').trim());
      if (assigned !== boundUrl) return null;
      return Object.freeze({
        songId: boundSongId,
        generation: boundGeneration,
        sourceUrl: boundUrl,
      });
    }

    function bindingMatches(expected) {
      if (!isPlainObject(expected)) return false;
      const current = bindingFact();
      if (!current) return false;
      return current.songId === expected.songId
        && current.generation === expected.generation
        && current.sourceUrl === canonicalHttpsUrl(expected.sourceUrl);
    }

    function commandTargetsAuthority(command) {
      if (!isPlainObject(command)) return false;
      if (command.songId === null) {
        return state.songId === null && command.generation === state.generation;
      }
      return command.songId === state.songId && command.generation === state.generation;
    }

    function sourceMatchesActive() {
      if (!activeUrl || !state.songId) return false;
      const currentBinding = bindingFact();
      if (!currentBinding
        || currentBinding.songId !== state.songId
        || currentBinding.generation !== state.generation
        || currentBinding.sourceUrl !== activeUrl) return false;
      return sourceObserved(mediaElement) === activeUrl;
    }

    function mediaPosition() {
      return {
        duration: state.duration,
        position: state.position,
        playbackRate: finiteNumber(mediaElement.playbackRate) && mediaElement.playbackRate > 0
          ? mediaElement.playbackRate
          : 1,
      };
    }

    function projectedPlaybackState() {
      if (lifecycleStateClaim === 'playing') return 'playing';
      if (lifecycleStateClaim === 'paused') return 'paused';
      if (lifecycleStateClaim === 'none') return 'unknown';
      return playbackStateFromAuthority(state);
    }

    function clearAction(action) {
      if (!mediaSession || typeof mediaSession.setActionHandler !== 'function') return;
      safeCall(() => mediaSession.setActionHandler(action, null));
      installedActions.delete(action);
    }

    function clearAllActions() {
      for (const action of MEDIA_SESSION_ACTIONS) clearAction(action);
    }

    function actionHandler(action) {
      if (action === 'play') return () => play();
      if (action === 'pause') return () => pause();
      if (action === 'stop') return () => stop();
      if (action === 'seekto') return (details = {}) => seekTo(details.seekTime);
      if (action === 'seekbackward') return (details = {}) => {
        const offset = finiteNumber(details.seekOffset) && details.seekOffset > 0
          ? details.seekOffset
          : capabilities.seekBackwardSeconds;
        return finiteNumber(offset) ? seekRelative(-offset) : false;
      };
      if (action === 'seekforward') return (details = {}) => {
        const offset = finiteNumber(details.seekOffset) && details.seekOffset > 0
          ? details.seekOffset
          : capabilities.seekForwardSeconds;
        return finiteNumber(offset) ? seekRelative(offset) : false;
      };
      if (action === 'previoustrack') return () => safeCall(() => typeof onPrevious === 'function' && onPrevious({ songId: state.songId, generation: state.generation }), false);
      if (action === 'nexttrack') return () => safeCall(() => typeof onNext === 'function' && onNext({ songId: state.songId, generation: state.generation }), false);
      return null;
    }

    function applyActions(actions) {
      if (!mediaSession || typeof mediaSession.setActionHandler !== 'function') return;
      const wanted = new Set(Array.isArray(actions) ? actions : []);
      for (const action of MEDIA_SESSION_ACTIONS) {
        if (!wanted.has(action)) {
          clearAction(action);
          continue;
        }
        const handler = actionHandler(action);
        if (!handler) {
          clearAction(action);
          continue;
        }
        const installed = safeCall(() => {
          mediaSession.setActionHandler(action, handler);
          return true;
        }, false);
        if (installed) installedActions.add(action);
        else installedActions.delete(action);
      }
    }

    function applyPolicy(policy) {
      lastPolicy = policy;
      if (!mediaSession) return true;

      if (!policy || policy.valid !== true) {
        clearAllActions();
        safeCall(() => { mediaSession.metadata = null; });
        safeCall(() => { mediaSession.playbackState = 'none'; });
        safeCall(() => mediaSession.setPositionState());
        return true;
      }

      if (policy.metadata) {
        const metadata = safeCall(() => metadataFactory(policy.metadata), null);
        if (metadata !== null) safeCall(() => { mediaSession.metadata = metadata; });
      } else {
        safeCall(() => { mediaSession.metadata = null; });
      }
      safeCall(() => { mediaSession.playbackState = policy.playbackState || 'none'; });
      if (policy.position && typeof mediaSession.setPositionState === 'function') {
        safeCall(() => mediaSession.setPositionState(policy.position));
      } else if (typeof mediaSession.setPositionState === 'function') {
        safeCall(() => mediaSession.setPositionState());
      }
      applyActions(policy.actions);
      return true;
    }

    function buildMediaSessionPolicy() {
      if (!resolution || !identity || !state.songId || !Number.isSafeInteger(state.generation)) return null;
      return mediaSessionPolicyApi.buildMediaSessionPolicy({
        resolution,
        identity,
        playback: {
          state: projectedPlaybackState(),
          songId: state.songId,
          generation: state.generation,
        },
        capabilities,
        position: mediaPosition(),
        environment: { foreground },
      });
    }

    function executeCommand(command) {
      if (!isPlainObject(command) || !nonEmptyString(command.op)) return { ok: false, value: false };

      if (command.op === 'clear-media-session') {
        return { ok: applyPolicy(null), value: true };
      }
      if (command.op === 'sync-media-session') {
        if (!commandTargetsAuthority(command) || !isPlainObject(command.policy)) return { ok: false, value: false };
        return { ok: applyPolicy(command.policy), value: true };
      }
      if (!commandTargetsAuthority(command)) return { ok: false, value: false };

      if (command.op === 'bind-source') {
        const sourceUrl = canonicalHttpsUrl(command.sourceUrl);
        if (!sourceUrl
          || sourceUrl !== activeUrl
          || !resolution
          || resolution.kind !== 'direct'
          || resolution.songId !== state.songId
          || sourceResolverApi.isBlockedConsumerProviderUrl(sourceUrl)) {
          return { ok: false, value: false };
        }
        const assigned = safeCall(() => {
          mediaElement.src = sourceUrl;
          return canonicalHttpsUrl(String(mediaElement.src || '').trim()) === sourceUrl;
        }, false);
        if (!assigned) return { ok: false, value: false };
        boundSongId = state.songId;
        boundGeneration = state.generation;
        boundUrl = sourceUrl;
        return { ok: true, value: true };
      }

      if (command.op === 'load-media') {
        const current = bindingFact();
        if (!current
          || current.songId !== state.songId
          || current.generation !== state.generation
          || current.sourceUrl !== activeUrl) return { ok: false, value: false };
        const loaded = safeCall(() => {
          if (typeof mediaElement.load === 'function') mediaElement.load();
          return true;
        }, false);
        return { ok: loaded, value: loaded };
      }

      if (command.op === 'request-play') {
        if (!bindingMatches(command.expectedBinding)) return { ok: false, value: false };
        const value = safeCall(() => mediaElement.play(), false);
        return { ok: value !== false, value };
      }

      if (command.op === 'request-pause') {
        if (!bindingMatches(command.expectedBinding)) return { ok: false, value: false };
        const paused = safeCall(() => {
          mediaElement.pause();
          return true;
        }, false);
        return { ok: paused, value: paused };
      }

      if (command.op === 'request-seek') {
        if (!bindingMatches(command.expectedBinding) || !finiteNumber(command.targetSeconds)) {
          return { ok: false, value: false };
        }
        const next = authorityStateApi.reduceDirectMediaAuthorityState(state, {
          type: 'seek-start',
          generation: state.generation,
          songId: state.songId,
          target: command.targetSeconds,
        });
        if (next === state || next.seek?.active !== true) return { ok: false, value: false };
        state = next;
        lifecycleStateClaim = null;
        const written = safeCall(() => {
          mediaElement.currentTime = next.seek.target;
          return true;
        }, false);
        if (!written) return { ok: false, value: false };
        notify('seek-start');
        return { ok: true, value: true };
      }

      if (command.op === 'read-media-state') {
        return { ok: true, value: Object.freeze({
          sourceMatchesActive: sourceMatchesActive(),
          duration: finiteNumber(mediaElement.duration) ? Number(mediaElement.duration) : null,
          currentTime: finiteNumber(mediaElement.currentTime) ? Number(mediaElement.currentTime) : null,
        }) };
      }

      if (command.op === 'clear-media-source') {
        if (!bindingMatches(command.expectedBinding)) return { ok: false, value: false };
        const cleared = safeCall(() => {
          if (typeof mediaElement.removeAttribute === 'function') mediaElement.removeAttribute('src');
          else mediaElement.src = '';
          if (typeof mediaElement.load === 'function') mediaElement.load();
          return true;
        }, false);
        if (!cleared) return { ok: false, value: false };
        boundSongId = null;
        boundGeneration = null;
        boundUrl = null;
        return { ok: true, value: true };
      }

      return { ok: false, value: false };
    }

    function executePlan(plan) {
      if (!isPlainObject(plan) || !Array.isArray(plan.commands)) {
        return { ok: false, accepted: false, value: false };
      }
      let value = true;
      for (const command of plan.commands) {
        const execution = executeCommand(command);
        if (!execution.ok) return { ok: false, accepted: false, value: false };
        if (command.op === 'request-play'
          || command.op === 'request-pause'
          || command.op === 'request-seek') {
          value = execution.value;
        }
      }
      return {
        ok: true,
        accepted: plan.valid === true && plan.intent?.accepted === true,
        value,
      };
    }

    function planAndExecute(intent, {
      lifecycleDecision = lastLifecycleDecision,
      mediaSessionPolicy = buildMediaSessionPolicy(),
    } = {}) {
      const plan = safeCall(() => commandPlannerApi.planDirectMediaCommands({
        authorityState: state,
        binding: bindingFact(),
        intent,
        lifecycleDecision,
        mediaSessionPolicy,
      }), null);
      if (!plan) return { plan: null, ok: false, accepted: false, value: false };
      return { plan, ...executePlan(plan) };
    }

    function syncMediaSessionThroughPlanner() {
      return planAndExecute({ type: 'sync-source', songId: state.songId, generation: state.generation });
    }

    function mediaEventPayload(type) {
      const payload = {
        type: type === 'seeked' ? 'seek-commit' : type,
        generation: state.generation,
        songId: state.songId,
      };
      const duration = Number(mediaElement.duration);
      const currentTime = Number(mediaElement.currentTime);
      if (finiteNumber(duration)) payload.duration = duration;
      if (finiteNumber(currentTime)) payload.currentTime = currentTime;
      if (type === 'error') {
        const mediaError = mediaElement.error;
        const code = isPlainObject(mediaError) && mediaError.code !== undefined
          ? `media-error-${String(mediaError.code)}`
          : 'media-error';
        payload.code = code;
      }
      return payload;
    }

    function handleMediaEvent(type) {
      if (destroyed || !resolution || !state.songId || !sourceMatchesActive()) return false;
      const previous = state;
      const next = authorityStateApi.reduceDirectMediaAuthorityState(state, mediaEventPayload(type));
      if (next === previous) return false;
      state = next;
      lifecycleStateClaim = null;
      lastLifecycleDecision = null;
      syncMediaSessionThroughPlanner();
      notify(type);
      return true;
    }

    function select({ resolution: nextResolution, identity: nextIdentity, generation, capabilities: nextCapabilities } = {}) {
      if (destroyed || !isPlainObject(nextResolution)) return false;
      if (nextResolution.kind !== 'direct' || nextResolution.provider !== 'direct') return false;
      if (nextResolution.playable !== true || nextResolution.backgroundCapable !== true) return false;
      if (!nonEmptyString(nextResolution.songId) || !isPlainObject(nextResolution.media)) return false;
      const mediaUrl = canonicalHttpsUrl(nextResolution.media.url);
      if (!mediaUrl || sourceResolverApi.isBlockedConsumerProviderUrl(mediaUrl)) return false;
      const canonicalIdentity = cloneIdentity(nextIdentity, nextResolution.songId.trim());
      if (!canonicalIdentity) return false;

      const previous = state;
      const next = authorityStateApi.reduceDirectMediaAuthorityState(state, {
        type: 'select-direct',
        generation,
        songId: nextResolution.songId.trim(),
        source: nextResolution,
      });
      if (next === previous || next.songId !== nextResolution.songId.trim() || !next.source) return false;

      state = next;
      resolution = next.source;
      identity = canonicalIdentity;
      capabilities = cloneCapabilities(nextCapabilities);
      activeUrl = next.source.media.url;
      lifecycleStateClaim = null;
      lastLifecycleDecision = null;
      foreground = true;

      const execution = planAndExecute({ type: 'sync-source', songId: state.songId, generation: state.generation });
      if (!execution.ok || !execution.accepted) {
        state = authorityStateApi.reduceDirectMediaAuthorityState(state, {
          type: 'unavailable',
          generation: state.generation,
          songId: state.songId,
          reason: 'media-source-assignment-failed',
        });
        planAndExecute({ type: 'clear', songId: state.songId, generation: state.generation }, { lifecycleDecision: null, mediaSessionPolicy: null });
        notify('source-assignment-failed');
        return false;
      }

      notify('select-direct');
      return true;
    }

    function play() {
      if (destroyed || capabilities.canPlay !== true || !state.songId) return false;
      const execution = planAndExecute({ type: 'play', songId: state.songId, generation: state.generation });
      return execution.ok && execution.accepted ? execution.value : false;
    }

    function pause() {
      if (destroyed || capabilities.canPause !== true || !state.songId) return false;
      const execution = planAndExecute({ type: 'pause', songId: state.songId, generation: state.generation });
      return execution.ok && execution.accepted ? execution.value : false;
    }

    function seekTo(target) {
      if (destroyed || capabilities.canSeek !== true || !state.songId) return false;
      const execution = planAndExecute({
        type: 'seek',
        songId: state.songId,
        generation: state.generation,
        targetSeconds: target,
      });
      return execution.ok && execution.accepted ? execution.value : false;
    }

    function stop() {
      if (destroyed || capabilities.canStop !== true || !state.songId) return false;
      const paused = planAndExecute({ type: 'pause', songId: state.songId, generation: state.generation });
      if (!paused.ok || !paused.accepted) return false;
      if (capabilities.canSeek === true && finiteNumber(state.duration) && state.duration > 0) {
        const seeked = planAndExecute({
          type: 'seek',
          songId: state.songId,
          generation: state.generation,
          targetSeconds: 0,
        });
        if (!seeked.ok || !seeked.accepted) return false;
      }
      return paused.value === false ? false : true;
    }

    function seekRelative(delta) {
      if (!finiteNumber(delta) || delta === 0 || capabilities.canSeek !== true) return false;
      const origin = finiteNumber(state.position) ? state.position : Number(mediaElement.currentTime);
      if (!finiteNumber(origin)) return false;
      const duration = finiteNumber(state.duration) && state.duration > 0 ? state.duration : null;
      const target = duration === null
        ? Math.max(0, origin + delta)
        : Math.min(duration, Math.max(0, origin + delta));
      return seekTo(target);
    }

    function reconcileLifecycle(eventName, evidence = 'fresh') {
      if (destroyed || !resolution || !state.songId || !nonEmptyString(eventName)) return null;
      if (FOREGROUND_EVENTS.has(eventName)) foreground = true;
      else if (BACKGROUND_EVENTS.has(eventName)) foreground = false;

      const decision = lifecyclePolicyApi.reconcilePlaybackLifecycle({
        active: { songId: state.songId, generation: state.generation },
        resolution,
        playback: {
          state: playbackStateFromAuthority(state),
          evidence,
          generation: state.generation,
        },
        lifecycle: { event: eventName, generation: state.generation },
      });
      lastLifecycleDecision = decision;
      lifecycleStateClaim = decision && decision.valid === true ? decision.stateClaim : 'none';
      planAndExecute(
        { type: 'reconcile', songId: state.songId, generation: state.generation },
        { lifecycleDecision: decision, mediaSessionPolicy: buildMediaSessionPolicy() },
      );
      notify(`lifecycle:${eventName}`);
      return decision;
    }

    function markUnavailable(reason = 'direct-media-unavailable') {
      if (destroyed || !resolution || !state.songId) return false;
      const previous = state;
      state = authorityStateApi.reduceDirectMediaAuthorityState(state, {
        type: 'unavailable',
        generation: state.generation,
        songId: state.songId,
        reason,
      });
      if (state === previous) return false;
      lifecycleStateClaim = null;
      lastLifecycleDecision = null;
      const execution = planAndExecute(
        { type: 'clear', songId: state.songId, generation: state.generation },
        { lifecycleDecision: null, mediaSessionPolicy: null },
      );
      notify('unavailable');
      return execution.ok && execution.accepted;
    }

    function reset(generation) {
      if (destroyed) return false;
      const previous = state;
      const next = authorityStateApi.reduceDirectMediaAuthorityState(state, { type: 'reset', generation });
      if (next === previous) return false;
      state = next;
      lifecycleStateClaim = null;
      lastLifecycleDecision = null;
      const execution = planAndExecute(
        { type: 'clear' },
        { lifecycleDecision: null, mediaSessionPolicy: null },
      );
      resolution = null;
      identity = null;
      capabilities = cloneCapabilities(null);
      activeUrl = null;
      boundSongId = null;
      boundGeneration = null;
      boundUrl = null;
      notify('reset');
      return execution.ok && execution.accepted;
    }

    for (const type of MEDIA_EVENTS) {
      const handler = () => handleMediaEvent(type);
      listeners.set(type, handler);
      mediaElement.addEventListener(type, handler);
    }

    function destroy() {
      if (destroyed) return false;
      const intent = state.songId
        ? { type: 'clear', songId: state.songId, generation: state.generation }
        : { type: 'clear' };
      planAndExecute(intent, { lifecycleDecision: null, mediaSessionPolicy: null });
      destroyed = true;
      for (const [type, handler] of listeners) mediaElement.removeEventListener(type, handler);
      listeners.clear();
      return true;
    }

    return Object.freeze({
      version: VERSION,
      select,
      play,
      pause,
      stop,
      seekTo,
      reconcileLifecycle,
      markUnavailable,
      reset,
      destroy,
      getState: () => state,
      getPolicy: () => lastPolicy,
      getLifecycleDecision: () => lastLifecycleDecision,
      getActiveUrl: () => activeUrl,
      isDestroyed: () => destroyed,
    });
  }

  return {
    VERSION,
    MEDIA_EVENTS,
    createDirectMediaController,
  };
});