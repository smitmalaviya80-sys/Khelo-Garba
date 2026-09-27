import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  createNonstopResumeStore,
  DEFAULT_NONSTOP_RESUME_LIMIT,
  NONSTOP_RESUME_STORAGE_KEY,
  NONSTOP_RESUME_STORE_VERSION,
} from '../../src/playback/nonstop-resume-store.js';

function createMemoryStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(key, String(value)); },
    removeItem(key) { values.delete(key); },
    dump(key) { return values.get(key) ?? null; },
  };
}

let nowMs = 1_000;
const storage = createMemoryStorage();
const store = createNonstopResumeStore({ storage, now: () => nowMs });

const firstWrite = store.write({
  setId: 'set-a',
  sourceIdentity: 'youtube:video-a',
  positionSeconds: 1_450,
  durationSeconds: 3_000,
});
assert.equal(firstWrite.status, 'stored');
assert.deepEqual(store.read('set-a', 'youtube:video-a'), {
  status: 'found',
  record: {
    setId: 'set-a',
    sourceIdentity: 'youtube:video-a',
    positionSeconds: 1_450,
    durationSeconds: 3_000,
    updatedAtMs: 1_000,
  },
});
assert.equal(store.read('set-b', 'youtube:video-a').status, 'missing', 'set A must never leak into set B');

const persisted = JSON.parse(storage.dump(NONSTOP_RESUME_STORAGE_KEY));
assert.equal(persisted.version, NONSTOP_RESUME_STORE_VERSION);
assert.equal(persisted.entries.length, 1);

nowMs += 100;
store.write({ setId: 'set-b', sourceIdentity: 'youtube:video-b', positionSeconds: 90 });
assert.equal(store.read('set-a', 'youtube:video-new').status, 'source-changed');
assert.equal(store.read('set-a', 'youtube:video-a').status, 'missing', 'source change must invalidate stale position');
assert.equal(store.read('set-b', 'youtube:video-b').status, 'found', 'source invalidation must stay scoped to the matching set');

nowMs += 100;
store.write({ setId: 'set-complete', sourceIdentity: 'youtube:complete', positionSeconds: 2_900, durationSeconds: 3_000 });
const completed = store.write({
  setId: 'set-complete',
  sourceIdentity: 'youtube:complete',
  positionSeconds: 3_000,
  durationSeconds: 3_000,
  completed: true,
});
assert.equal(completed.status, 'completed-cleared');
assert.equal(store.read('set-complete', 'youtube:complete').status, 'missing');

nowMs += 100;
store.write({ setId: 'set-b', sourceIdentity: 'youtube:video-b', positionSeconds: 120 });
assert.equal(store.list().records.filter((record) => record.setId === 'set-b').length, 1, 'same set must update rather than duplicate');
assert.equal(store.read('set-b', 'youtube:video-b').record.positionSeconds, 120);

assert.equal(
  store.write({ setId: 'set-b', sourceIdentity: 'youtube:stale-source', positionSeconds: 200 }).status,
  'source-mismatch',
  'late writes from an old source must not replace the active source record',
);
assert.equal(
  store.write({ setId: 'set-b', sourceIdentity: 'youtube:stale-source', positionSeconds: 200, completed: true }).status,
  'source-mismatch',
  'late completion from an old source must not clear the active source record',
);
assert.equal(store.read('set-b', 'youtube:video-b').record.positionSeconds, 120);

assert.equal(store.read('set-b', 'youtube:video-c').status, 'source-changed');
assert.equal(store.write({ setId: 'set-b', sourceIdentity: 'youtube:video-c', positionSeconds: 15 }).status, 'stored');
assert.equal(store.read('set-b', 'youtube:video-c').record.positionSeconds, 15);
assert.equal(
  store.write({ setId: 'set-b', sourceIdentity: 'youtube:video-b', positionSeconds: 125 }).status,
  'source-mismatch',
  'stale source callbacks must stay blocked after deliberate source migration',
);

for (const positionSeconds of [-1, Number.NaN, Number.POSITIVE_INFINITY]) {
  assert.equal(store.write({ setId: 'bad', sourceIdentity: 'youtube:bad', positionSeconds }).status, 'invalid');
}
assert.equal(store.write({ setId: 'bad', sourceIdentity: 'youtube:bad', positionSeconds: 1, durationSeconds: 0 }).status, 'invalid');
assert.equal(store.read('', 'youtube:x').status, 'invalid');
assert.equal(store.read('set-a', ' ').status, 'invalid');

const boundedStorage = createMemoryStorage();
let boundedNow = 10_000;
const bounded = createNonstopResumeStore({
  storage: boundedStorage,
  maxEntries: 3,
  now: () => boundedNow++,
});
for (const setId of ['set-1', 'set-2', 'set-3', 'set-4']) {
  assert.equal(bounded.write({ setId, sourceIdentity: `youtube:${setId}`, positionSeconds: 10 }).status, 'stored');
}
assert.deepEqual(bounded.list().records.map((record) => record.setId), ['set-4', 'set-3', 'set-2']);
assert.equal(bounded.read('set-1', 'youtube:set-1').status, 'missing');

const tieStorage = createMemoryStorage();
const tie = createNonstopResumeStore({ storage: tieStorage, maxEntries: 2, now: () => 42 });
tie.write({ setId: 'set-b', sourceIdentity: 'youtube:b', positionSeconds: 1 });
tie.write({ setId: 'set-a', sourceIdentity: 'youtube:a', positionSeconds: 1 });
tie.write({ setId: 'set-c', sourceIdentity: 'youtube:c', positionSeconds: 1 });
assert.deepEqual(tie.list().records.map((record) => record.setId), ['set-c', 'set-a'], 'equal timestamps must preserve write recency deterministically');

const deniedStorage = {
  getItem() { throw new Error('denied'); },
  setItem() { throw new Error('denied'); },
  removeItem() { throw new Error('denied'); },
};
const denied = createNonstopResumeStore({ storage: deniedStorage });
assert.equal(denied.read('set-a', 'youtube:a').status, 'unavailable');
assert.equal(denied.write({ setId: 'set-a', sourceIdentity: 'youtube:a', positionSeconds: 1 }).status, 'unavailable');
assert.equal(denied.remove('set-a').status, 'unavailable');
assert.equal(denied.list().status, 'unavailable');

const noStorage = createNonstopResumeStore();
assert.equal(noStorage.read('set-a', 'youtube:a').status, 'unavailable');

const corruptStorage = createMemoryStorage({ [NONSTOP_RESUME_STORAGE_KEY]: '{not-json' });
const corrupt = createNonstopResumeStore({ storage: corruptStorage, now: () => 88 });
assert.equal(corrupt.read('set-a', 'youtube:a').status, 'corrupt');
assert.equal(corrupt.write({ setId: 'set-a', sourceIdentity: 'youtube:a', positionSeconds: 8 }).status, 'stored-after-corrupt-reset');
assert.equal(corrupt.read('set-a', 'youtube:a').status, 'found');

for (const malformed of [
  { version: 999, entries: [] },
  { version: NONSTOP_RESUME_STORE_VERSION, entries: {} },
  { version: NONSTOP_RESUME_STORE_VERSION, entries: [{ setId: 'set-a' }] },
  {
    version: NONSTOP_RESUME_STORE_VERSION,
    entries: [
      { setId: 'set-a', sourceIdentity: 'youtube:a', positionSeconds: 1, durationSeconds: null, updatedAtMs: 1 },
      { setId: 'set-a', sourceIdentity: 'youtube:a', positionSeconds: 2, durationSeconds: null, updatedAtMs: 2 },
    ],
  },
  {
    version: NONSTOP_RESUME_STORE_VERSION,
    entries: [
      { setId: 'set-a', sourceIdentity: 'youtube:a', positionSeconds: 1, durationSeconds: null, updatedAtMs: 1 },
      { setId: ' set-a ', sourceIdentity: 'youtube:b', positionSeconds: 2, durationSeconds: null, updatedAtMs: 2 },
    ],
  },
]) {
  const malformedStorage = createMemoryStorage({ [NONSTOP_RESUME_STORAGE_KEY]: JSON.stringify(malformed) });
  assert.equal(createNonstopResumeStore({ storage: malformedStorage }).read('set-a', 'youtube:a').status, 'corrupt');
}

const completionOnCorruptStorage = createMemoryStorage({ [NONSTOP_RESUME_STORAGE_KEY]: 'broken' });
const completionOnCorrupt = createNonstopResumeStore({ storage: completionOnCorruptStorage });
assert.equal(completionOnCorrupt.write({
  setId: 'set-a', sourceIdentity: 'youtube:a', positionSeconds: 10, completed: true,
}).status, 'completed-cleared');
assert.deepEqual(JSON.parse(completionOnCorruptStorage.dump(NONSTOP_RESUME_STORAGE_KEY)), {
  version: NONSTOP_RESUME_STORE_VERSION,
  entries: [],
});

const metaStorage = createMemoryStorage();
const metaStore = createNonstopResumeStore({ storage: metaStorage, now: () => 5000 });
metaStore.write({
  setId: 'set-meta',
  sourceIdentity: 'youtube:meta',
  positionSeconds: 120,
  durationSeconds: 1800,
  title: 'Ochhav Live',
  artist: 'Aditya Gadhvi',
});
assert.deepEqual(metaStore.read('set-meta', 'youtube:meta'), {
  status: 'found',
  record: {
    setId: 'set-meta',
    sourceIdentity: 'youtube:meta',
    positionSeconds: 120,
    durationSeconds: 1800,
    updatedAtMs: 5000,
    title: 'Ochhav Live',
    artist: 'Aditya Gadhvi',
  },
});

assert.equal(DEFAULT_NONSTOP_RESUME_LIMIT, 8);
assert.equal(Object.isFrozen(store), true);
assert.equal(Object.isFrozen(store.read('set-b', 'youtube:video-c')), true);
assert.equal(Object.isFrozen(store.read('set-b', 'youtube:video-c').record), true);

const sourcePath = fileURLToPath(new URL('../../src/playback/nonstop-resume-store.js', import.meta.url));
const source = fs.readFileSync(sourcePath, 'utf8');
for (const [label, pattern] of [
  ['network fetch', /\bfetch\s*\(/],
  ['XMLHttpRequest', /\bXMLHttpRequest\b/],
  ['DOM document access', /\bdocument\b/],
  ['browser window access', /\bwindow\b/],
  ['autoplay call', /\.play\s*\(/],
  ['seek mutation', /\bseek(?:To)?\s*\(/i],
]) {
  assert.doesNotMatch(source, pattern, `resume store must not contain ${label}`);
}

console.log('nonstop-resume-store: all tests passed');
