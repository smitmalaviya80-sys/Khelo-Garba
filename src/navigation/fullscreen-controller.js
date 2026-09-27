'use strict';

const { decideFullscreenControl } = require('./fullscreen-policy.js');

const VERSION = 1;

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function errorName(error) {
  if (!error || typeof error !== 'object') return null;
  const name = String(error.name || '').trim();
  return name || null;
}

function createFullscreenController(options = {}) {
  const documentRef = options.documentRef || null;
  const target = options.target || null;
  const getAppLike = typeof options.getAppLike === 'function'
    ? options.getAppLike
    : () => options.appLike;
  const onChange = typeof options.onChange === 'function'
    ? options.onChange
    : () => {};

  let listening = false;

  function capabilityFacts() {
    let appLike;
    try {
      appLike = getAppLike();
    } catch {
      appLike = undefined;
    }

    return {
      appLike,
      fullscreenEnabled: documentRef?.fullscreenEnabled === true,
      requestFullscreenAvailable: typeof target?.requestFullscreen === 'function',
      fullscreenActive: Boolean(documentRef?.fullscreenElement),
      exitFullscreenAvailable: typeof documentRef?.exitFullscreen === 'function',
    };
  }

  function snapshot() {
    return decideFullscreenControl(capabilityFacts());
  }

  function notify() {
    const current = snapshot();
    onChange(current);
    return current;
  }

  function handleFullscreenChange() {
    notify();
  }

  function start() {
    if (!listening && typeof documentRef?.addEventListener === 'function') {
      documentRef.addEventListener('fullscreenchange', handleFullscreenChange);
      listening = true;
    }
    return deepFreeze({ listening, decision: notify() });
  }

  function stop() {
    if (listening && typeof documentRef?.removeEventListener === 'function') {
      documentRef.removeEventListener('fullscreenchange', handleFullscreenChange);
    }
    listening = false;
    return deepFreeze({ listening, decision: snapshot() });
  }

  async function performAction() {
    const before = snapshot();
    if (!before.visible || !before.action) {
      return deepFreeze({
        version: VERSION,
        status: 'unavailable',
        action: null,
        reason: before.reason || 'fullscreen-action-unavailable',
        errorName: null,
        before,
        after: before,
      });
    }

    const action = before.action;
    try {
      if (action === 'enter') {
        if (typeof target?.requestFullscreen !== 'function') {
          return deepFreeze({
            version: VERSION,
            status: 'unavailable',
            action,
            reason: 'fullscreen-enter-unavailable',
            errorName: null,
            before,
            after: snapshot(),
          });
        }
        await target.requestFullscreen();
      } else if (action === 'exit') {
        if (typeof documentRef?.exitFullscreen !== 'function') {
          return deepFreeze({
            version: VERSION,
            status: 'unavailable',
            action,
            reason: 'fullscreen-exit-unavailable',
            errorName: null,
            before,
            after: snapshot(),
          });
        }
        await documentRef.exitFullscreen();
      } else {
        return deepFreeze({
          version: VERSION,
          status: 'unavailable',
          action: null,
          reason: 'fullscreen-action-invalid',
          errorName: null,
          before,
          after: snapshot(),
        });
      }

      return deepFreeze({
        version: VERSION,
        status: 'fulfilled',
        action,
        reason: null,
        errorName: null,
        before,
        after: snapshot(),
      });
    } catch (error) {
      return deepFreeze({
        version: VERSION,
        status: 'rejected',
        action,
        reason: 'fullscreen-operation-rejected',
        errorName: errorName(error),
        before,
        after: snapshot(),
      });
    }
  }

  return Object.freeze({
    version: VERSION,
    snapshot,
    start,
    stop,
    performAction,
  });
}

module.exports = Object.freeze({
  VERSION,
  createFullscreenController,
});
