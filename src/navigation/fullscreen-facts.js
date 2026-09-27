'use strict';

const VERSION = 1;
const APP_LIKE_DISPLAY_MODES = Object.freeze([
  'fullscreen',
  'standalone',
  'minimal-ui',
]);

function safeGet(target, key, fallback = undefined) {
  if (target === null || target === undefined) return fallback;
  try {
    const value = target[key];
    return value === undefined ? fallback : value;
  } catch {
    return fallback;
  }
}

function safelyMatches(matchMedia, query) {
  if (typeof matchMedia !== 'function') return false;
  try {
    const result = matchMedia(query);
    return safeGet(result, 'matches', false) === true;
  } catch {
    return false;
  }
}

function isAppLikeSurface(matchMedia, navigatorLike) {
  if (safeGet(navigatorLike, 'standalone', false) === true) return true;

  return APP_LIKE_DISPLAY_MODES.some((mode) =>
    safelyMatches(matchMedia, `(display-mode: ${mode})`)
  );
}

function readFullscreenFacts(environment = {}) {
  const documentLike = safeGet(environment, 'document', null);
  const root = safeGet(environment, 'root', null);
  const matchMedia = safeGet(environment, 'matchMedia', null);
  const navigatorLike = safeGet(environment, 'navigator', null);

  const facts = {
    appLike: isAppLikeSurface(matchMedia, navigatorLike),
    fullscreenEnabled: safeGet(documentLike, 'fullscreenEnabled', false) === true,
    requestFullscreenAvailable: typeof safeGet(root, 'requestFullscreen', null) === 'function',
    fullscreenActive: Boolean(
      root && safeGet(documentLike, 'fullscreenElement', null) === root
    ),
    exitFullscreenAvailable: typeof safeGet(documentLike, 'exitFullscreen', null) === 'function',
  };

  return Object.freeze(facts);
}

module.exports = Object.freeze({
  VERSION,
  APP_LIKE_DISPLAY_MODES,
  readFullscreenFacts,
});
