import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const runtimePath = new URL('../../youtube-player-runtime.js', import.meta.url);
const source = fs.readFileSync(runtimePath, 'utf8');

assert.match(source, /setInterval\(syncProgress, 350\)/, 'progress truth polling cadence must remain 350 ms');
assert.equal((source.match(/setInterval\(/g) || []).length, 1, 'the optimisation must not add a second polling timer');
assert.match(source, /elapsedTime\.textContent !== elapsedLabel/, 'elapsed text must be guarded against unchanged writes');
assert.match(source, /durationTime\.textContent !== durationLabel/, 'duration text must be guarded against unchanged writes');
assert.match(source, /progress\.style\.getPropertyValue\('--progress'\) !== progressPercent/, 'progress CSS writes must be guarded');
assert.match(source, /miniProgress\.style\.width !== progressPercent/, 'mini progress writes must be guarded');
assert.match(source, /Math\.floor\(position\)/, 'Media Session position work must be bounded to logical seconds');
assert.match(source, /lastMediaSessionPositionKey = ''[\s\S]*?syncProgress\(\)/, 'seeks must invalidate Media Session position cache before synchronising');

const writes = new Map();
const mediaPositions = [];
const storageWrites = [];
const elements = new Map();

function bump(key) {
  writes.set(key, (writes.get(key) || 0) + 1);
}

function makeStyle(id) {
  const values = new Map();
  let width = '';
  return {
    getPropertyValue(name) {
      return values.get(name) || '';
    },
    setProperty(name, value) {
      bump(`${id}.style.${name}`);
      values.set(name, String(value));
    },
    get width() {
      return width;
    },
    set width(value) {
      bump(`${id}.style.width`);
      width = String(value);
    },
  };
}

function makeElement(id) {
  let textContent = '';
  let value = '';
  const element = {
    id,
    dataset: {},
    classList: { toggle() {}, add() {}, remove() {} },
    style: makeStyle(id),
    addEventListener() {},
    setAttribute() {},
    getAttribute() { return ''; },
    append() {},
    replaceChildren() {},
    click() {},
    closest() { return null; },
    get textContent() { return textContent; },
    set textContent(next) {
      bump(`${id}.textContent`);
      textContent = String(next);
    },
    get value() { return value; },
    set value(next) {
      bump(`${id}.value`);
      value = String(next);
    },
  };
  elements.set(id, element);
  return element;
}

for (const id of [
  'audio', 'playButton', 'miniPlay', 'progress', 'elapsedTime', 'durationTime',
  'miniProgress', 'songTitle', 'songArtist', 'app', 'prevButton', 'nextButton',
  'miniPrev', 'miniNext',
]) makeElement(id);

elements.get('app').dataset.genre = 'traditional-garba';

const documentStub = {
  body: { append() {} },
  head: { append() {} },
  getElementById(id) { return elements.get(id) || null; },
  addEventListener() {},
  querySelector() { return null; },
  createElement(tag) { return makeElement(`created-${tag}-${elements.size}`); },
};

class MutationObserverStub {
  observe() {}
  disconnect() {}
}

class ElementStub {}

const mediaSession = {
  playbackState: 'none',
  setActionHandler() {},
  setPositionState(state) {
    mediaPositions.push({ ...state });
  },
};

const context = vm.createContext({
  console,
  URL,
  document: documentStub,
  location: { href: 'https://playgarba.com/', origin: 'https://playgarba.com' },
  navigator: { onLine: true, mediaSession },
  localStorage: {
    getItem() { return '{}'; },
    setItem(key, value) { storageWrites.push([key, value]); },
  },
  MutationObserver: MutationObserverStub,
  Element: ElementStub,
  fetch: async () => ({ ok: true, json: async () => [] }),
  queueMicrotask,
  setInterval: () => 1,
  clearInterval() {},
  setTimeout: () => 1,
  clearTimeout() {},
  requestIdleCallback: () => 1,
  encodeURIComponent,
});

context.window = context;
context.globalThis = context;
context.window.YT = {
  PlayerState: { ENDED: 0, PLAYING: 1, PAUSED: 2, BUFFERING: 3, CUED: 5 },
};
context.window.addEventListener = () => {};
context.window.GARBA_FAST_BOOT = { songs: [] };

const injected = source.replace(/\}\)\(\);\s*$/, `
  globalThis.__GARBA_PROGRESS_TEST__ = {
    syncProgress,
    seekTo,
    configure({ current = 0, total = 100, track = total, base = 0, state = states().PLAYING } = {}) {
      let absoluteCurrent = base + current;
      activeSong = { id: 'fixture-song' };
      baseStart = base;
      trackDuration = track;
      playerState = state;
      lastPersistedSecond = -1;
      lastMediaSessionPositionKey = '';
      advanceLock = true;
      player = {
        getCurrentTime: () => absoluteCurrent,
        getDuration: () => base + total,
        getPlaybackRate: () => 1,
        seekTo: (seconds) => { absoluteCurrent = seconds; },
      };
      return {
        setCurrent(logicalSeconds) { absoluteCurrent = base + logicalSeconds; },
        getCurrent() { return absoluteCurrent - base; },
      };
    },
  };
})();`);

assert.notEqual(injected, source, 'test hook injection must match runtime closure');
new vm.Script(injected, { filename: 'youtube-player-runtime.js' }).runInContext(context);

const test = context.__GARBA_PROGRESS_TEST__;
assert.ok(test, 'runtime progress test hook should be available');

function count(key) {
  return writes.get(key) || 0;
}

const ordinary = test.configure({ current: 10.2, total: 100, track: 100 });
test.syncProgress();
assert.equal(count('elapsedTime.textContent'), 1, 'first progress sync renders elapsed text');
assert.equal(count('durationTime.textContent'), 1, 'first progress sync renders duration text');
assert.equal(count('progress.value'), 1, 'first progress sync renders range progress');
assert.equal(count('progress.style.--progress'), 1, 'first progress sync renders progress CSS');
assert.equal(count('miniProgress.style.width'), 1, 'first progress sync renders mini progress');
assert.equal(mediaPositions.length, 1, 'first progress sync publishes Media Session position');

ordinary.setCurrent(10.4);
test.syncProgress();
assert.equal(count('elapsedTime.textContent'), 1, 'elapsed text is not rewritten while its displayed value is unchanged');
assert.equal(count('durationTime.textContent'), 1, 'duration text is not rewritten on each poll');
assert.equal(mediaPositions.length, 1, 'Media Session is not rewritten multiple times inside the same logical second');

const progressWritesAfterMovement = count('progress.value');
const progressStyleWritesAfterMovement = count('progress.style.--progress');
const miniWritesAfterMovement = count('miniProgress.style.width');
test.syncProgress();
assert.equal(count('progress.value'), progressWritesAfterMovement, 'identical progress range state is not rewritten');
assert.equal(count('progress.style.--progress'), progressStyleWritesAfterMovement, 'identical progress CSS state is not rewritten');
assert.equal(count('miniProgress.style.width'), miniWritesAfterMovement, 'identical mini progress state is not rewritten');

ordinary.setCurrent(11.2);
test.syncProgress();
assert.equal(count('elapsedTime.textContent'), 2, 'elapsed text updates when its displayed value changes');
assert.equal(count('durationTime.textContent'), 1, 'duration stays stable while playback advances');
assert.equal(mediaPositions.length, 2, 'Media Session advances on a new logical second');

const mediaBeforeSeek = mediaPositions.length;
assert.equal(test.seekTo(42.25), true, 'seek remains available');
assert.equal(ordinary.getCurrent(), 42.25, 'seek preserves exact logical target');
assert.equal(mediaPositions.length, mediaBeforeSeek + 1, 'seek forces an immediate Media Session position refresh');
assert.equal(mediaPositions.at(-1).position, 42.25, 'Media Session reports the exact post-seek position');

const beforeChapterDurationWrites = count('durationTime.textContent');
const beforeChapterMediaWrites = mediaPositions.length;
const chapter = test.configure({ current: 30.1, total: 600, track: 600, base: 120 });
test.syncProgress();
chapter.setCurrent(30.3);
test.syncProgress();
assert.equal(count('durationTime.textContent'), beforeChapterDurationWrites + 1, 'chapter/set duration renders once for a new logical source');
assert.equal(mediaPositions.length, beforeChapterMediaWrites + 1, 'chapter/set polling is also bounded within one logical second');
assert.ok(Math.abs(mediaPositions.at(-1).position - 30.1) < 1e-9, 'chapter Media Session position stays logical rather than absolute video time');
assert.equal(mediaPositions.at(-1).duration, 600, 'chapter Media Session duration stays the logical track/set duration');

assert.ok(storageWrites.length >= 1, 'existing bounded session-position persistence still executes');
console.log('YouTube progress write validation passed.');
