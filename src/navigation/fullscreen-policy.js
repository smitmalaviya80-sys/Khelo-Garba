'use strict';

const VERSION = 1;

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function hidden(reason, capabilities) {
  return deepFreeze({
    version: VERSION,
    visible: false,
    action: null,
    label: null,
    reason,
    capabilities,
  });
}

function visible(action, label, capabilities) {
  return deepFreeze({
    version: VERSION,
    visible: true,
    action,
    label,
    reason: null,
    capabilities,
  });
}

function decideFullscreenControl(facts = {}) {
  const keys = [
    'appLike',
    'fullscreenEnabled',
    'requestFullscreenAvailable',
    'fullscreenActive',
    'exitFullscreenAvailable',
  ];

  if (!facts || typeof facts !== 'object' || Array.isArray(facts)) {
    return hidden('capability-facts-invalid', deepFreeze({
      appLike: false,
      canEnter: false,
      active: false,
      canExit: false,
    }));
  }

  for (const key of keys) {
    if (typeof facts[key] !== 'boolean') {
      return hidden('capability-facts-invalid', deepFreeze({
        appLike: false,
        canEnter: false,
        active: false,
        canExit: false,
      }));
    }
  }

  const capabilities = deepFreeze({
    appLike: facts.appLike,
    canEnter: facts.fullscreenEnabled && facts.requestFullscreenAvailable,
    active: facts.fullscreenActive,
    canExit: facts.exitFullscreenAvailable,
  });

  if (!capabilities.appLike) {
    return hidden('surface-not-app-like', capabilities);
  }

  if (capabilities.active) {
    if (!capabilities.canExit) {
      return hidden('fullscreen-exit-unavailable', capabilities);
    }
    return visible('exit', 'Exit fullscreen', capabilities);
  }

  if (!capabilities.canEnter) {
    return hidden('fullscreen-enter-unavailable', capabilities);
  }

  return visible('enter', 'Enter fullscreen', capabilities);
}

module.exports = Object.freeze({
  VERSION,
  decideFullscreenControl,
});
