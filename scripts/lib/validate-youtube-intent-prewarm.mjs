import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';

const root = path.resolve(import.meta.dirname, '../..');
const runtime = await readFile(path.join(root, 'youtube-player-runtime.js'), 'utf8');

function blockBetween(startMarker, endMarker) {
  const start = runtime.indexOf(startMarker);
  assert.notEqual(start, -1, `Missing runtime marker: ${startMarker}`);
  const end = runtime.indexOf(endMarker, start + startMarker.length);
  assert.notEqual(end, -1, `Missing runtime marker after ${startMarker}: ${endMarker}`);
  return runtime.slice(start, end);
}

const constrainedBlock = blockBetween(
  '  function constrainedConnection()',
  '\n  function prepareApiFromPlaybackIntent',
);
const prepareBlock = blockBetween(
  '  function prepareApiFromPlaybackIntent(event)',
  '\n  function loadApi()',
);
const loadApiBlock = blockBetween(
  '  function loadApi()',
  '\n  function closeGenericProvider()',
);
const loadHandler = blockBetween(
  "  window.addEventListener('load', () => {",
  '\n  }, { once: true });',
);

assert.ok(
  !loadHandler.includes('loadApi('),
  'Page load must not initialise the YouTube IFrame API',
);
assert.ok(
  !loadHandler.includes('requestIdleCallback'),
  'Page load must not schedule an idle YouTube API warmup',
);
assert.ok(
  runtime.includes("document.addEventListener('pointerdown', prepareApiFromPlaybackIntent, { capture: true, passive: true });"),
  'Playback intent must be observed on pointerdown without blocking the gesture',
);
assert.ok(
  runtime.includes('if (navigator.onLine === false || constrainedConnection()) return;'),
  'Speculative preparation must respect offline and constrained-connection state',
);
assert.ok(
  runtime.includes("if (audio?.getAttribute('src')) return;"),
  'Direct-audio playback must not prewarm the YouTube API',
);
assert.ok(
  runtime.includes('if (apiPromise) return apiPromise;'),
  'The YouTube API loader must remain promise-deduplicated',
);
assert.ok(
  runtime.includes('await loadApi();'),
  'Explicit YouTube playback must retain the authoritative loadApi path',
);

function makeHarness({
  online = true,
  saveData = false,
  effectiveType = '4g',
  directAudio = false,
  controllable = true,
} = {}) {
  const state = { appends: 0, scripts: [] };

  class FakeElement {
    constructor(play = false) {
      this.play = play;
    }

    closest(selector) {
      return this.play && selector === '#playButton, #miniPlay' ? this : null;
    }
  }

  const document = {
    querySelector(selector) {
      if (selector === 'script[data-garba-youtube-api="true"]') {
        return state.scripts.find((script) => script.dataset?.garbaYoutubeApi === 'true') || null;
      }
      return null;
    },
    createElement(tagName) {
      assert.equal(tagName, 'script');
      return {
        dataset: {},
        addEventListener() {},
      };
    },
    head: {
      append(script) {
        state.appends += 1;
        state.scripts.push(script);
      },
    },
  };

  const context = {
    window: {},
    document,
    navigator: {
      onLine: online,
      connection: { saveData, effectiveType },
    },
    audio: {
      getAttribute(name) {
        assert.equal(name, 'src');
        return directAudio ? '/media/authorised-track.mp3' : '';
      },
    },
    currentSafeSong: () => ({ id: 'verified-song', youtubeId: 'abcdefghijk', playbackProvider: 'youtube' }),
    currentBootSong: () => null,
    canControl: () => controllable,
    Element: FakeElement,
    Promise,
    setTimeout: () => 1,
    clearTimeout: () => {},
  };

  vm.createContext(context);
  new vm.Script(`
    let apiPromise = null;
    ${constrainedBlock}
    ${prepareBlock}
    ${loadApiBlock}
    globalThis.__intentTest = { prepareApiFromPlaybackIntent, loadApi };
  `).runInContext(context);

  return {
    context,
    playTarget: new FakeElement(true),
    otherTarget: new FakeElement(false),
    get appends() { return state.appends; },
  };
}

const idle = makeHarness();
assert.equal(idle.appends, 0, 'Idle runtime evaluation must append zero YouTube API scripts');
idle.context.__intentTest.prepareApiFromPlaybackIntent({ target: idle.playTarget });
assert.equal(idle.appends, 1, 'First real Play pointer intent should prepare exactly one YouTube API script');
idle.context.__intentTest.prepareApiFromPlaybackIntent({ target: idle.playTarget });
assert.equal(idle.appends, 1, 'Repeated Play intent must reuse the same in-flight API promise');

const unrelated = makeHarness();
unrelated.context.__intentTest.prepareApiFromPlaybackIntent({ target: unrelated.otherTarget });
assert.equal(unrelated.appends, 0, 'Unrelated pointer activity must not prepare YouTube');

for (const [label, options] of [
  ['offline', { online: false }],
  ['Save-Data', { saveData: true }],
  ['slow-2g', { effectiveType: 'slow-2g' }],
  ['2g', { effectiveType: '2g' }],
  ['direct audio', { directAudio: true }],
  ['non-controllable route', { controllable: false }],
]) {
  const harness = makeHarness(options);
  harness.context.__intentTest.prepareApiFromPlaybackIntent({ target: harness.playTarget });
  assert.equal(harness.appends, 0, `${label} must skip speculative YouTube preparation`);
}

const constrainedExplicitPlay = makeHarness({ saveData: true });
constrainedExplicitPlay.context.__intentTest.loadApi();
assert.equal(
  constrainedExplicitPlay.appends,
  1,
  'An explicit Play path must still be able to initialise YouTube on Save-Data after prewarm was skipped',
);

console.log('✓ idle startup appends zero YouTube IFrame API scripts');
console.log('✓ Play pointer intent prepares exactly one deduplicated API load');
console.log('✓ unrelated pointer activity, direct audio, offline, Save-Data and 2G do not prewarm YouTube');
console.log('✓ explicit playback retains the authoritative loadApi path on constrained connections');
