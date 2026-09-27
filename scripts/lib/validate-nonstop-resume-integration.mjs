import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import {
  createNonstopResumeStore,
  NONSTOP_RESUME_STORAGE_KEY,
  NONSTOP_RESUME_STORE_VERSION,
} from '../../src/playback/nonstop-resume-store.js';

const root = path.resolve(import.meta.dirname, '../..');

// 1. Structural checks on modified files
const nonstopBrowserSrc = await readFile(path.join(root, 'nonstop-browser.js'), 'utf8');
const ytRuntimeSrc = await readFile(path.join(root, 'youtube-player-runtime.js'), 'utf8');
const listeningLibrarySrc = await readFile(path.join(root, 'src/catalogue/listening-library.js'), 'utf8');
const resumeStoreSrc = await readFile(path.join(root, 'src/playback/nonstop-resume-store.js'), 'utf8');

let failed = false;
const fail = (msg) => {
  console.error(`✗ ${msg}`);
  failed = true;
};

// nonstop-browser.js checks
for (const marker of [
  'createResumeAdapter',
  'showResumePrompt',
  'hideResumePrompt',
  'nonstop-resume-prompt',
  'Resume at',
  'Start from beginning',
  'reload: true',
  'autoplay: false, resume: false',
  'get resumeStore()',
]) {
  if (!nonstopBrowserSrc.includes(marker)) {
    fail(`nonstop-browser.js missing contract marker: "${marker}"`);
  }
}

// youtube-player-runtime.js checks
for (const marker of [
  'persistNonstopResume',
  'garba:nonstop-resume:v1',
  'const sourceIdentity = `youtube:${video}`;',
  'persistNonstopResume(elapsed(), true);',
  'restoreElapsed',
]) {
  if (!ytRuntimeSrc.includes(marker)) {
    fail(`youtube-player-runtime.js missing contract marker: "${marker}"`);
  }
}

// src/catalogue/listening-library.js checks
for (const marker of [
  "const NONSTOP_RESUME_KEY = 'garba:nonstop-resume:v1'",
  'makeNonstopCard',
  'Saved on this device',
  'NONSTOP_RESUME_KEY',
]) {
  if (!listeningLibrarySrc.includes(marker)) {
    fail(`src/catalogue/listening-library.js missing contract marker: "${marker}"`);
  }
}

// src/playback/nonstop-resume-store.js checks
for (const marker of [
  'title',
  'artist',
  'NONSTOP_RESUME_STORAGE_KEY',
  'NONSTOP_RESUME_STORE_VERSION',
  'createNonstopResumeStore',
]) {
  if (!resumeStoreSrc.includes(marker)) {
    fail(`src/playback/nonstop-resume-store.js missing contract marker: "${marker}"`);
  }
}

// 2. Functional behavioral verification
function createMockStorage(init = {}) {
  const store = new Map(Object.entries(init));
  return {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
    dump: (k) => store.get(k) ?? null,
  };
}

// A: Set A reload offers resume at truthful position
const storageA = createMockStorage();
const storeA = createNonstopResumeStore({ storage: storageA, now: () => 1000 });
storeA.write({
  setId: 'set-hemant-2023',
  sourceIdentity: 'youtube:vid-123',
  positionSeconds: 1250,
  durationSeconds: 3600,
  title: 'Hemant Chauhan Nonstop 2023',
  artist: 'Hemant Chauhan',
});
const readA = storeA.read('set-hemant-2023', 'youtube:vid-123');
assert.equal(readA.status, 'found');
assert.equal(readA.record.positionSeconds, 1250);
assert.equal(readA.record.artist, 'Hemant Chauhan');

// B: Opening Set B never inherits Set A's position
const readB = storeA.read('set-kinjal-2024', 'youtube:vid-123');
assert.equal(readB.status, 'missing', 'Set B must never inherit Set A position even with same video id');
const readB2 = storeA.read('set-kinjal-2024', 'youtube:vid-456');
assert.equal(readB2.status, 'missing');

// C: Completed set clears position
storeA.write({
  setId: 'set-hemant-2023',
  sourceIdentity: 'youtube:vid-123',
  positionSeconds: 3600,
  durationSeconds: 3600,
  completed: true,
});
const readCompleted = storeA.read('set-hemant-2023', 'youtube:vid-123');
assert.equal(readCompleted.status, 'missing', 'Completed set must clear resume position');

// D: Changed source identity invalidates stale position
storeA.write({
  setId: 'set-geeta-2022',
  sourceIdentity: 'youtube:old-video-id',
  positionSeconds: 500,
  durationSeconds: 2000,
});
const readChanged = storeA.read('set-geeta-2022', 'youtube:new-remastered-video-id');
assert.equal(readChanged.status, 'source-changed', 'Source identity change must invalidate stale position');

// E: Storage unavailable or corrupt handled gracefully
const corruptStorage = createMockStorage({ [NONSTOP_RESUME_STORAGE_KEY]: 'NOT_JSON{[' });
const corruptStore = createNonstopResumeStore({ storage: corruptStorage });
assert.equal(corruptStore.read('set-x', 'youtube:x').status, 'corrupt');

const throwingStorage = {
  getItem: () => { throw new Error('QuotaExceeded / AccessDenied'); },
  setItem: () => { throw new Error('QuotaExceeded / AccessDenied'); },
  removeItem: () => { throw new Error('QuotaExceeded / AccessDenied'); },
};
const deniedStore = createNonstopResumeStore({ storage: throwingStorage });
assert.equal(deniedStore.read('set-x', 'youtube:x').status, 'unavailable');
assert.equal(deniedStore.write({ setId: 'set-x', sourceIdentity: 'youtube:x', positionSeconds: 10 }).status, 'unavailable');

if (failed) {
  process.exit(1);
}

console.log('✓ All nonstop resume integration checks and behavioral contracts passed.');
