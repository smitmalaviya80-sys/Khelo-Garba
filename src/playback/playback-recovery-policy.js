(function attachPlaybackRecoveryPolicy(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.GARBA_PLAYBACK_RECOVERY_POLICY = Object.freeze(api);
})(typeof globalThis !== 'undefined' ? globalThis : this, function createPlaybackRecoveryPolicy() {
  'use strict';

  const VERSION = 1;
  const MAX_RETRY_ATTEMPTS = 3;
  const KNOWN_FAILURES = new Set([
    'offline',
    'autoplay-blocked',
    'api-timeout',
    'embedding-disabled',
    'removed-or-private',
    'no-route',
    'provider-error',
  ]);
  const RETRYABLE_FAILURES = new Set(['offline', 'api-timeout', 'provider-error']);

  const COPY = Object.freeze({
    'offline': Object.freeze({
      state: 'offline',
      severity: 'warning',
      message: 'You’re offline. Reconnect to play this recording.',
    }),
    'autoplay-blocked': Object.freeze({
      state: 'blocked',
      severity: 'notice',
      message: 'Tap Play to start this recording.',
    }),
    'api-timeout': Object.freeze({
      state: 'error',
      severity: 'warning',
      message: 'Playback is taking too long to start.',
    }),
    'embedding-disabled': Object.freeze({
      state: 'unavailable',
      severity: 'warning',
      message: 'This recording can’t play inside PlayGarba.',
    }),
    'removed-or-private': Object.freeze({
      state: 'unavailable',
      severity: 'warning',
      message: 'This recording is no longer available where it was linked.',
    }),
    'no-route': Object.freeze({
      state: 'unavailable',
      severity: 'notice',
      message: 'This recording is not available to play yet.',
    }),
    'provider-error': Object.freeze({
      state: 'error',
      severity: 'warning',
      message: 'This recording couldn’t start.',
    }),
    'unknown': Object.freeze({
      state: 'error',
      severity: 'warning',
      message: 'This recording couldn’t play right now.',
    }),
  });

  function isPlainObject(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
  }

  function nonEmptyString(value) {
    return typeof value === 'string' && value.trim().length > 0;
  }

  function generationToken(value) {
    if (nonEmptyString(value)) return value.trim();
    if (Number.isSafeInteger(value) && value >= 0) return value;
    return null;
  }

  function deepFreeze(value) {
    if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
    for (const child of Object.values(value)) deepFreeze(child);
    return Object.freeze(value);
  }

  function canonicalContext(context) {
    if (!isPlainObject(context) || !nonEmptyString(context.songId)) return null;
    const generation = generationToken(context.generation);
    if (generation === null) return null;

    const source = isPlainObject(context.source) ? context.source : {};
    return {
      songId: context.songId.trim(),
      generation,
      source: {
        provider: nonEmptyString(source.provider) ? source.provider.trim().toLowerCase() : null,
        kind: nonEmptyString(source.kind) ? source.kind.trim() : null,
        executable: source.executable === true,
      },
    };
  }

  function exactYoutubeWatchUrl(source) {
    if (!isPlainObject(source) || source.youtubeVerifiedExact !== true || !nonEmptyString(source.youtubeWatchUrl)) {
      return null;
    }

    try {
      const parsed = new URL(source.youtubeWatchUrl.trim());
      if (parsed.protocol !== 'https:') return null;
      const host = parsed.hostname.toLowerCase().replace(/^www\./, '');
      if (host === 'youtu.be') {
        const id = parsed.pathname.split('/').filter(Boolean)[0] || '';
        return id ? parsed.href : null;
      }
      if (host === 'youtube.com' || host.endsWith('.youtube.com')) {
        return parsed.pathname === '/watch' && nonEmptyString(parsed.searchParams.get('v'))
          ? parsed.href
          : null;
      }
    } catch {
      return null;
    }
    return null;
  }

  function normaliseFailure(failure) {
    const raw = isPlainObject(failure) && nonEmptyString(failure.kind)
      ? failure.kind.trim().toLowerCase()
      : '';
    return KNOWN_FAILURES.has(raw) ? raw : 'unknown';
  }

  function retryBudget(retry) {
    if (retry === undefined || retry === null) {
      return { attempts: 0, maxAttempts: MAX_RETRY_ATTEMPTS };
    }
    if (!isPlainObject(retry)) {
      return { attempts: MAX_RETRY_ATTEMPTS, maxAttempts: MAX_RETRY_ATTEMPTS };
    }

    const hasAttempts = Object.prototype.hasOwnProperty.call(retry, 'attempts');
    const hasMaxAttempts = Object.prototype.hasOwnProperty.call(retry, 'maxAttempts');
    const attempts = hasAttempts ? retry.attempts : 0;
    const requestedMax = hasMaxAttempts ? retry.maxAttempts : MAX_RETRY_ATTEMPTS;
    if (
      !Number.isSafeInteger(attempts)
      || attempts < 0
      || !Number.isSafeInteger(requestedMax)
      || requestedMax < 0
    ) {
      return { attempts: MAX_RETRY_ATTEMPTS, maxAttempts: MAX_RETRY_ATTEMPTS };
    }

    return {
      attempts,
      maxAttempts: Math.min(requestedMax, MAX_RETRY_ATTEMPTS),
    };
  }

  function action(id, label, context, extra = {}) {
    const result = { id, label, ...extra };
    if (context) {
      result.target = {
        songId: context.songId,
        generation: context.generation,
        provider: context.source.provider,
        sourceKind: context.source.kind,
      };
    }
    return result;
  }

  function buildActions(kind, context, rawSource, retry) {
    const actions = [];
    const youtubeUrl = exactYoutubeWatchUrl(rawSource);
    const budget = retryBudget(retry);

    if (
      kind === 'autoplay-blocked'
      && context
      && context.source.executable === true
      && context.source.provider
      && context.source.kind
    ) {
      actions.push(action('play', 'Play', context, { requiresUserGesture: true }));
    }

    if (
      RETRYABLE_FAILURES.has(kind)
      && context
      && context.source.executable === true
      && context.source.provider
      && context.source.kind
      && budget.attempts < budget.maxAttempts
    ) {
      actions.push(action('retry', 'Try again', context, {
        attempt: budget.attempts + 1,
        maxAttempts: budget.maxAttempts,
      }));
    }

    if (
      youtubeUrl
      && context
      && kind !== 'removed-or-private'
      && kind !== 'offline'
      && kind !== 'autoplay-blocked'
      && kind !== 'unknown'
    ) {
      actions.push(action('open-youtube', 'Open on YouTube', context, { url: youtubeUrl }));
    }

    if (!['offline', 'autoplay-blocked'].includes(kind)) {
      actions.push(action('choose-another', 'Choose another recording', null));
    }

    return actions;
  }

  function buildPlaybackRecovery({ context, failure, retry } = {}) {
    const safeContext = canonicalContext(context);
    const rawSource = isPlainObject(context) && isPlainObject(context.source) ? context.source : null;
    const kind = normaliseFailure(failure);
    const copy = COPY[kind];
    const actions = buildActions(kind, safeContext, rawSource, retry);

    const valid = safeContext !== null && kind !== 'unknown';
    const reason = !safeContext
      ? 'playback-context-invalid'
      : kind === 'unknown'
        ? 'failure-kind-invalid'
        : `playback-${kind}`;

    return deepFreeze({
      version: VERSION,
      valid,
      reason,
      failureKind: kind,
      songId: safeContext ? safeContext.songId : '',
      generation: safeContext ? safeContext.generation : null,
      provider: safeContext ? safeContext.source.provider : null,
      sourceKind: safeContext ? safeContext.source.kind : null,
      playbackState: 'not-playing',
      persistent: true,
      state: copy.state,
      severity: copy.severity,
      message: copy.message,
      actions,
    });
  }

  return {
    VERSION,
    MAX_RETRY_ATTEMPTS,
    buildPlaybackRecovery,
  };
});
