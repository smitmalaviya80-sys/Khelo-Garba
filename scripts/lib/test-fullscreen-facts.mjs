import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  VERSION,
  APP_LIKE_DISPLAY_MODES,
  readFullscreenFacts,
} = require('../../src/navigation/fullscreen-facts.js');

function createEnvironment({
  modes = [],
  legacyStandalone = false,
  fullscreenEnabled = true,
  active = false,
} = {}) {
  const calls = {
    enter: 0,
    exit: 0,
    media: [],
  };
  const root = {
    requestFullscreen() {
      calls.enter += 1;
    },
  };
  const documentLike = {
    fullscreenEnabled,
    fullscreenElement: active ? root : null,
    exitFullscreen() {
      calls.exit += 1;
    },
  };
  const matchMedia = (query) => {
    calls.media.push(query);
    return {
      matches: modes.some((mode) => query === `(display-mode: ${mode})`),
    };
  };

  return {
    environment: {
      document: documentLike,
      root,
      matchMedia,
      navigator: { standalone: legacyStandalone },
    },
    calls,
    root,
    documentLike,
  };
}

assert.equal(VERSION, 1);
assert.deepEqual(APP_LIKE_DISPLAY_MODES, ['fullscreen', 'standalone', 'minimal-ui']);
assert.equal(Object.isFrozen(APP_LIKE_DISPLAY_MODES), true);

{
  const result = readFullscreenFacts();
  assert.deepEqual(result, {
    appLike: false,
    fullscreenEnabled: false,
    requestFullscreenAvailable: false,
    fullscreenActive: false,
    exitFullscreenAvailable: false,
  });
  assert.equal(Object.isFrozen(result), true);
}

{
  const { environment, calls } = createEnvironment();
  const result = readFullscreenFacts(environment);
  assert.deepEqual(result, {
    appLike: false,
    fullscreenEnabled: true,
    requestFullscreenAvailable: true,
    fullscreenActive: false,
    exitFullscreenAvailable: true,
  });
  assert.equal(calls.enter, 0, 'fact reads must never request fullscreen');
  assert.equal(calls.exit, 0, 'fact reads must never exit fullscreen');
}

for (const mode of APP_LIKE_DISPLAY_MODES) {
  const { environment } = createEnvironment({ modes: [mode] });
  assert.equal(readFullscreenFacts(environment).appLike, true, `${mode} should be app-like`);
}

{
  const { environment } = createEnvironment({ legacyStandalone: true });
  const result = readFullscreenFacts(environment);
  assert.equal(result.appLike, true);
}

{
  const { environment, root } = createEnvironment({ active: true });
  const result = readFullscreenFacts(environment);
  assert.equal(result.fullscreenActive, true);
  assert.equal(environment.document.fullscreenElement, root);
}

{
  const { environment } = createEnvironment();
  environment.document.fullscreenElement = { id: 'provider-fullscreen-element' };
  const result = readFullscreenFacts(environment);
  assert.equal(result.fullscreenActive, false, 'unrelated fullscreen must not masquerade as app fullscreen');
}

{
  const { environment } = createEnvironment({ fullscreenEnabled: false });
  delete environment.root.requestFullscreen;
  delete environment.document.exitFullscreen;
  const result = readFullscreenFacts(environment);
  assert.equal(result.fullscreenEnabled, false);
  assert.equal(result.requestFullscreenAvailable, false);
  assert.equal(result.exitFullscreenAvailable, false);
}

{
  const { environment } = createEnvironment();
  environment.matchMedia = () => {
    throw new Error('display mode unavailable');
  };
  assert.equal(readFullscreenFacts(environment).appLike, false);
}

{
  const { environment } = createEnvironment();
  environment.matchMedia = () => ({
    get matches() {
      throw new Error('matches unavailable');
    },
  });
  assert.equal(readFullscreenFacts(environment).appLike, false);
}

{
  const throwingDocument = {};
  Object.defineProperties(throwingDocument, {
    fullscreenEnabled: {
      get() {
        throw new Error('fullscreenEnabled unavailable');
      },
    },
    fullscreenElement: {
      get() {
        throw new Error('fullscreenElement unavailable');
      },
    },
    exitFullscreen: {
      get() {
        throw new Error('exitFullscreen unavailable');
      },
    },
  });
  const throwingRoot = {};
  Object.defineProperty(throwingRoot, 'requestFullscreen', {
    get() {
      throw new Error('requestFullscreen unavailable');
    },
  });
  const throwingNavigator = {};
  Object.defineProperty(throwingNavigator, 'standalone', {
    get() {
      throw new Error('standalone unavailable');
    },
  });

  assert.deepEqual(readFullscreenFacts({
    document: throwingDocument,
    root: throwingRoot,
    matchMedia: null,
    navigator: throwingNavigator,
  }), {
    appLike: false,
    fullscreenEnabled: false,
    requestFullscreenAvailable: false,
    fullscreenActive: false,
    exitFullscreenAvailable: false,
  });
}

{
  const throwingEnvironment = {};
  for (const key of ['document', 'root', 'matchMedia', 'navigator']) {
    Object.defineProperty(throwingEnvironment, key, {
      get() {
        throw new Error(`${key} unavailable`);
      },
    });
  }
  assert.deepEqual(readFullscreenFacts(throwingEnvironment), {
    appLike: false,
    fullscreenEnabled: false,
    requestFullscreenAvailable: false,
    fullscreenActive: false,
    exitFullscreenAvailable: false,
  });
}

{
  const source = await readFile(new URL('../../src/navigation/fullscreen-facts.js', import.meta.url), 'utf8');
  for (const pattern of [/\buserAgent\b/, /\bplatform\b/]) {
    assert.equal(pattern.test(source), false, `fullscreen facts must not sniff platform identity: ${pattern}`);
  }
}

console.log('fullscreen facts: ok');
