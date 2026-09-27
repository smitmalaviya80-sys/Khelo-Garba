(function attachPlaybackControllerFacade(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.GARBA_PLAYBACK_CONTROLLER_FACADE = Object.freeze(api);
})(typeof globalThis !== 'undefined' ? globalThis : this, function createPlaybackControllerFacadeApi() {
  'use strict';

  const VERSION = 1;
  const ROUTE_VERSION = 1;
  const COMMAND_TYPES = new Set([
    'play',
    'pause',
    'seek',
    'next',
    'previous',
    'open-stage',
    'stop',
    'retry',
  ]);
  const PLAYABLE_PHASES = new Set(['selected', 'loading', 'ready', 'paused', 'buffering']);
  const PAUSABLE_PHASES = new Set(['playing', 'buffering']);
  const SEEKABLE_PHASES = new Set(['ready', 'playing', 'paused', 'buffering']);
  const RETRYABLE_PHASES = new Set(['unavailable', 'blocked', 'error']);
  const EVIDENCE_TYPES = new Set([
    'loading',
    'ready',
    'playing',
    'paused',
    'buffering',
    'progress',
    'seek-start',
    'seek-commit',
    'ended',
    'unavailable',
    'blocked',
    'error',
    'capabilities',
    'stage',
    'lifecycle',
  ]);

  function isPlainObject(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
  }

  function nonEmptyString(value) {
    return typeof value === 'string' && value.trim().length > 0;
  }

  function finiteNonNegative(value) {
    return Number.isFinite(value) && value >= 0;
  }

  function finitePositive(value) {
    return Number.isFinite(value) && value > 0;
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

  function deepFreeze(value) {
    if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
    for (const child of Object.values(value)) deepFreeze(child);
    return Object.freeze(value);
  }

  function cloneArtwork(value) {
    if (!Array.isArray(value)) return [];
    return value
      .filter((item) => isPlainObject(item) && nonEmptyString(item.src))
      .map((item) => {
        const copy = { src: item.src.trim() };
        if (nonEmptyString(item.sizes)) copy.sizes = item.sizes.trim();
        if (nonEmptyString(item.type)) copy.type = item.type.trim();
        return copy;
      });
  }

  function normaliseIdentity(identity) {
    if (!isPlainObject(identity)) throw new TypeError('selection identity is required');
    const canonicalId = String(identity.canonicalId || '').trim();
    const title = String(identity.title || '').trim();
    const artist = String(identity.artist || '').trim();
    if (!canonicalId || !title || !artist) {
      throw new TypeError('selection identity requires canonicalId, title and artist');
    }
    const copy = {
      canonicalId,
      title,
      artist,
      artwork: cloneArtwork(identity.artwork),
    };
    if (nonEmptyString(identity.album)) copy.album = identity.album.trim();
    return deepFreeze(copy);
  }

  function normaliseRoute(resolution, canonicalId) {
    if (!isPlainObject(resolution) || resolution.version !== ROUTE_VERSION) {
      throw new TypeError('selection requires a versioned resolved playback route');
    }
    if (String(resolution.songId || '').trim() !== canonicalId) {
      throw new TypeError('resolved playback route must match canonical identity');
    }

    const kind = String(resolution.kind || '').trim();
    const provider = resolution.provider === null || resolution.provider === undefined
      ? null
      : String(resolution.provider).trim();
    const playable = resolution.playable === true;
    const backgroundCapable = resolution.backgroundCapable === true;
    const allowed = kind === 'direct'
      || kind === 'youtube-foreground'
      || kind === 'unavailable'
      || kind === 'direct-invalid'
      || kind === 'direct-failed';
    if (!allowed) throw new TypeError('resolved playback route kind is unsupported');
    if (kind === 'direct' && (provider !== 'direct' || !playable || !backgroundCapable)) {
      throw new TypeError('direct playback route is structurally invalid');
    }
    if (kind === 'youtube-foreground' && (provider !== 'youtube' || !playable || backgroundCapable)) {
      throw new TypeError('YouTube foreground route is structurally invalid');
    }
    if ((kind === 'unavailable' || kind === 'direct-invalid' || kind === 'direct-failed') && playable) {
      throw new TypeError('unavailable playback route cannot be marked playable');
    }

    const route = {
      kind,
      provider,
      playable,
      backgroundCapable,
      media: resolution.media ? cloneJsonValue(resolution.media) : null,
      provenance: resolution.provenance ? cloneJsonValue(resolution.provenance) : null,
      reason: nonEmptyString(resolution.reason) ? resolution.reason.trim() : null,
    };
    if (isPlainObject(resolution.failure)) route.failure = cloneJsonValue(resolution.failure);
    return deepFreeze(route);
  }

  function normaliseCapabilities(value, route) {
    const source = isPlainObject(value) ? value : {};
    return deepFreeze({
      canPlay: source.canPlay === true || (source.canPlay === undefined && route.playable === true),
      canPause: source.canPause === true,
      canStop: source.canStop === true,
      canSeek: source.canSeek === true,
      canPrevious: source.canPrevious === true,
      canNext: source.canNext === true,
    });
  }

  function normaliseStage(value) {
    const source = isPlainObject(value) ? value : {};
    const supported = source.supported === true;
    const visible = supported && source.visible === true;
    return deepFreeze({
      supported,
      visible,
      state: supported && nonEmptyString(source.state) ? source.state.trim() : (supported ? 'closed' : 'unsupported'),
    });
  }

  function normaliseLifecycle(value) {
    const source = isPlainObject(value) ? value : {};
    return deepFreeze({
      foreground: typeof source.foreground === 'boolean' ? source.foreground : null,
      certainty: nonEmptyString(source.certainty) ? source.certainty.trim() : 'unknown',
    });
  }

  function idleSnapshot(generation) {
    return deepFreeze({
      version: VERSION,
      generation,
      canonicalId: null,
      identity: null,
      route: null,
      phase: 'idle',
      playbackState: 'none',
      position: null,
      duration: null,
      seek: { active: false, target: null },
      capabilities: {
        canPlay: false,
        canPause: false,
        canStop: false,
        canSeek: false,
        canPrevious: false,
        canNext: false,
      },
      stage: { supported: false, visible: false, state: 'unsupported' },
      error: null,
      lifecycle: { foreground: null, certainty: 'unknown' },
    });
  }

  function nextSnapshot(snapshot, overrides) {
    return deepFreeze({
      version: VERSION,
      generation: snapshot.generation,
      canonicalId: snapshot.canonicalId,
      identity: snapshot.identity,
      route: snapshot.route,
      phase: snapshot.phase,
      playbackState: snapshot.playbackState,
      position: snapshot.position,
      duration: snapshot.duration,
      seek: snapshot.seek,
      capabilities: snapshot.capabilities,
      stage: snapshot.stage,
      error: snapshot.error,
      lifecycle: snapshot.lifecycle,
      ...overrides,
    });
  }

  function normaliseMeasurements(snapshot, evidence) {
    let duration = snapshot.duration;
    let position = snapshot.position;
    if (evidence.duration !== undefined) {
      if (!finitePositive(evidence.duration)) return null;
      duration = evidence.duration;
      if (finiteNonNegative(position) && position > duration) position = duration;
    }
    if (evidence.position !== undefined) {
      if (!finiteNonNegative(evidence.position)) return null;
      position = finitePositive(duration) ? Math.min(evidence.position, duration) : evidence.position;
    }
    return { duration, position };
  }

  function createPlaybackControllerFacade() {
    let snapshot = idleSnapshot(0);
    let commandSequence = 0;
    const subscribers = new Set();

    function emit(reason) {
      for (const subscriber of [...subscribers]) {
        try {
          subscriber(snapshot, reason);
        } catch {
          // View failures cannot mutate or interrupt playback authority.
        }
      }
    }

    function getSnapshot() {
      return snapshot;
    }

    function subscribe(listener) {
      if (typeof listener !== 'function') throw new TypeError('playback subscriber must be a function');
      subscribers.add(listener);
      try {
        listener(snapshot, 'subscribe');
      } catch {
        // Preserve controller authority if a view fails during initial projection.
      }
      return function unsubscribe() {
        subscribers.delete(listener);
      };
    }

    function select({ identity, resolution, capabilities = null, stage = null, lifecycle = null } = {}) {
      const nextIdentity = normaliseIdentity(identity);
      const route = normaliseRoute(resolution, nextIdentity.canonicalId);
      const generation = snapshot.generation + 1;
      if (!Number.isSafeInteger(generation)) throw new RangeError('playback generation exhausted');

      let phase = route.playable ? 'selected' : 'unavailable';
      let error = route.playable ? null : { code: route.reason || 'route-unavailable' };
      if (route.kind === 'direct-failed') {
        phase = 'error';
        error = { code: route.failure && nonEmptyString(route.failure.code)
          ? route.failure.code.trim()
          : (route.reason || 'direct-playback-failed') };
      }

      snapshot = deepFreeze({
        version: VERSION,
        generation,
        canonicalId: nextIdentity.canonicalId,
        identity: nextIdentity,
        route,
        phase,
        playbackState: 'none',
        position: null,
        duration: null,
        seek: { active: false, target: null },
        capabilities: normaliseCapabilities(capabilities, route),
        stage: normaliseStage(stage),
        error: error ? deepFreeze(error) : null,
        lifecycle: normaliseLifecycle(lifecycle),
      });
      emit('select');
      return snapshot;
    }

    function clear() {
      const generation = snapshot.generation + 1;
      if (!Number.isSafeInteger(generation)) throw new RangeError('playback generation exhausted');
      snapshot = idleSnapshot(generation);
      emit('clear');
      return snapshot;
    }

    function rejection(type, reason) {
      return deepFreeze({ accepted: false, type, reason, command: null });
    }

    function command(type, payload = null) {
      if (!COMMAND_TYPES.has(type)) return rejection(type, 'command-unsupported');
      if (!snapshot.canonicalId || !snapshot.route) return rejection(type, 'no-active-selection');

      if (type === 'play') {
        if (!snapshot.route.playable || !snapshot.capabilities.canPlay) return rejection(type, 'play-unavailable');
        if (!PLAYABLE_PHASES.has(snapshot.phase)) return rejection(type, 'phase-not-playable');
      }
      if (type === 'pause') {
        if (!snapshot.capabilities.canPause || !PAUSABLE_PHASES.has(snapshot.phase)) return rejection(type, 'pause-unavailable');
      }
      if (type === 'seek') {
        const targetSeconds = isPlainObject(payload) ? payload.targetSeconds : null;
        if (!snapshot.capabilities.canSeek || !SEEKABLE_PHASES.has(snapshot.phase)) return rejection(type, 'seek-unavailable');
        if (!finiteNonNegative(targetSeconds)) return rejection(type, 'seek-target-invalid');
        if (finitePositive(snapshot.duration) && targetSeconds > snapshot.duration) return rejection(type, 'seek-target-out-of-range');
      }
      if (type === 'previous' && !snapshot.capabilities.canPrevious) return rejection(type, 'previous-unavailable');
      if (type === 'next' && !snapshot.capabilities.canNext) return rejection(type, 'next-unavailable');
      if (type === 'open-stage' && !snapshot.stage.supported) return rejection(type, 'stage-unavailable');
      if (type === 'stop' && !snapshot.capabilities.canStop) return rejection(type, 'stop-unavailable');
      if (type === 'retry' && !RETRYABLE_PHASES.has(snapshot.phase)) return rejection(type, 'retry-unavailable');

      commandSequence += 1;
      if (!Number.isSafeInteger(commandSequence)) throw new RangeError('playback command sequence exhausted');
      const planned = deepFreeze({
        version: VERSION,
        sequence: commandSequence,
        type,
        canonicalId: snapshot.canonicalId,
        generation: snapshot.generation,
        payload: isPlainObject(payload) ? cloneJsonValue(payload) : {},
      });
      return deepFreeze({ accepted: true, type, reason: null, command: planned });
    }

    function evidenceMatchesCurrent(evidence) {
      return isPlainObject(evidence)
        && EVIDENCE_TYPES.has(evidence.type)
        && evidence.generation === snapshot.generation
        && String(evidence.canonicalId || '').trim() === snapshot.canonicalId;
    }

    function acceptEvidence(evidence) {
      if (!snapshot.canonicalId || !evidenceMatchesCurrent(evidence)) return false;
      const measured = normaliseMeasurements(snapshot, evidence);
      if (!measured) return false;

      let next = snapshot;
      switch (evidence.type) {
        case 'loading':
          next = nextSnapshot(snapshot, {
            phase: 'loading', playbackState: 'none', duration: measured.duration, position: measured.position,
            seek: { active: false, target: null }, error: null,
          });
          break;
        case 'ready':
          next = nextSnapshot(snapshot, {
            phase: 'ready', duration: measured.duration, position: measured.position, error: null,
          });
          break;
        case 'playing':
          next = nextSnapshot(snapshot, {
            phase: 'playing', playbackState: 'playing', duration: measured.duration, position: measured.position,
            seek: { active: false, target: null }, error: null,
          });
          break;
        case 'paused':
          next = nextSnapshot(snapshot, {
            phase: 'paused', playbackState: 'paused', duration: measured.duration, position: measured.position,
            seek: { active: false, target: null }, error: null,
          });
          break;
        case 'buffering':
          next = nextSnapshot(snapshot, {
            phase: 'buffering', playbackState: 'none', duration: measured.duration, position: measured.position,
          });
          break;
        case 'progress':
          next = nextSnapshot(snapshot, { duration: measured.duration, position: measured.position });
          break;
        case 'seek-start': {
          if (!finiteNonNegative(evidence.target)) return false;
          if (finitePositive(snapshot.duration) && evidence.target > snapshot.duration) return false;
          next = nextSnapshot(snapshot, { seek: { active: true, target: evidence.target } });
          break;
        }
        case 'seek-commit':
          if (!finiteNonNegative(evidence.position)) return false;
          next = nextSnapshot(snapshot, {
            position: finitePositive(snapshot.duration) ? Math.min(evidence.position, snapshot.duration) : evidence.position,
            seek: { active: false, target: null },
          });
          break;
        case 'ended':
          next = nextSnapshot(snapshot, {
            phase: 'ended', playbackState: 'paused', duration: measured.duration, position: measured.position,
            seek: { active: false, target: null }, error: null,
          });
          break;
        case 'unavailable':
          next = nextSnapshot(snapshot, {
            phase: 'unavailable', playbackState: 'none', seek: { active: false, target: null },
            error: { code: nonEmptyString(evidence.code) ? evidence.code.trim() : 'route-unavailable' },
          });
          break;
        case 'blocked':
          next = nextSnapshot(snapshot, {
            phase: 'blocked', playbackState: 'none', seek: { active: false, target: null },
            error: { code: nonEmptyString(evidence.code) ? evidence.code.trim() : 'playback-blocked' },
          });
          break;
        case 'error':
          next = nextSnapshot(snapshot, {
            phase: 'error', playbackState: 'none', seek: { active: false, target: null },
            error: { code: nonEmptyString(evidence.code) ? evidence.code.trim() : 'playback-error' },
          });
          break;
        case 'capabilities':
          next = nextSnapshot(snapshot, { capabilities: normaliseCapabilities(evidence.capabilities, snapshot.route) });
          break;
        case 'stage':
          next = nextSnapshot(snapshot, { stage: normaliseStage(evidence.stage) });
          break;
        case 'lifecycle':
          next = nextSnapshot(snapshot, { lifecycle: normaliseLifecycle(evidence.lifecycle) });
          break;
        default:
          return false;
      }

      if (next === snapshot) return false;
      snapshot = next;
      emit(`evidence:${evidence.type}`);
      return true;
    }

    return Object.freeze({
      getSnapshot,
      subscribe,
      select,
      clear,
      acceptEvidence,
      play: (context = null) => command('play', context),
      pause: (context = null) => command('pause', context),
      seek: (targetSeconds, context = null) => command('seek', { ...(isPlainObject(context) ? context : {}), targetSeconds }),
      next: (context = null) => command('next', context),
      previous: (context = null) => command('previous', context),
      openStage: (context = null) => command('open-stage', context),
      stop: (context = null) => command('stop', context),
      retry: (context = null) => command('retry', context),
    });
  }

  return Object.freeze({
    VERSION,
    createPlaybackControllerFacade,
  });
});
