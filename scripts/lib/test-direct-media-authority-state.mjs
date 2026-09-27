import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const modulePath = path.join(repoRoot, 'src/playback/direct-media-authority-state.js');
const resolverPath = path.join(repoRoot, 'src/playback/direct-source-resolver.js');

const authority = require(modulePath);
const resolver = require(resolverPath);

const {
  VERSION,
  POSITION_TOLERANCE_SECONDS,
  createInitialState,
  reduceDirectMediaAuthorityState,
  isAuthoritativeMediaEvent,
} = authority;

function canonicalSong(id = 'song-a') {
  return {
    id,
    title: id === 'song-a' ? 'Song A' : 'Song B',
    artist: 'Artist',
    playbackProvider: 'youtube',
    youtubeId: id === 'song-a' ? 'abcdefghijk' : 'zyxwvutsrqp',
    playbackSourceUrl: `https://www.youtube.com/watch?v=${id === 'song-a' ? 'abcdefghijk' : 'zyxwvutsrqp'}`,
    playbackSourceType: 'verified-track-source',
    playbackSearchOnly: false,
  };
}

function directEntry(id = 'song-a') {
  return {
    audioUrl: `https://audio.playgarba.example/${id}/master.m4a`,
    mimeType: 'audio/mp4',
    rights: {
      redistributionAuthorized: true,
      rightsHolder: 'Example Rights Holder',
      licenseName: 'Direct streaming permission',
      proofUrl: `https://rights.playgarba.example/grants/${id}`,
    },
  };
}

function directResolution(id = 'song-a') {
  return resolver.resolvePlaybackSource({
    song: canonicalSong(id),
    directEntry: directEntry(id),
    directSongId: id,
  });
}

function select(state, id, generation) {
  return reduceDirectMediaAuthorityState(state, {
    type: 'select-direct',
    generation,
    songId: id,
    source: directResolution(id),
  });
}

function media(state, type, overrides = {}) {
  return reduceDirectMediaAuthorityState(state, {
    type,
    generation: state.generation,
    songId: state.songId,
    ...overrides,
  });
}

assert.equal(VERSION, 1);
assert.equal(POSITION_TOLERANCE_SECONDS, 0.25);

{
  const state = createInitialState();
  assert.deepEqual(state, {
    version: 1,
    generation: 0,
    songId: null,
    source: null,
    phase: 'idle',
    playbackState: 'none',
    duration: null,
    position: null,
    seek: { active: false, target: null },
    error: null,
  });
  assert.equal(Object.isFrozen(state), true);
  assert.equal(Object.isFrozen(state.seek), true);
}

{
  const initial = createInitialState();
  const source = directResolution('song-a');
  const snapshot = JSON.parse(JSON.stringify(source));
  const state = reduceDirectMediaAuthorityState(initial, {
    type: 'select-direct',
    generation: 1,
    songId: 'song-a',
    source,
  });

  assert.equal(state.generation, 1);
  assert.equal(state.songId, 'song-a');
  assert.equal(state.phase, 'selected');
  assert.equal(state.playbackState, 'none');
  assert.equal(state.source.kind, 'direct');
  assert.equal(state.source.provider, 'direct');
  assert.equal(state.source.backgroundCapable, true);
  assert.equal(state.source.media.url, 'https://audio.playgarba.example/song-a/master.m4a');
  assert.equal(state.source.provenance.proofUrl, 'https://rights.playgarba.example/grants/song-a');
  assert.equal(Object.isFrozen(state), true);
  assert.equal(Object.isFrozen(state.source), true);
  assert.equal(Object.isFrozen(state.source.media), true);
  assert.equal(Object.isFrozen(state.source.provenance), true);
  assert.deepEqual(source, snapshot, 'selection must not mutate the source resolution');
}

{
  const initial = createInitialState();
  const invalidSource = { ...directResolution('song-a'), backgroundCapable: false };
  const result = reduceDirectMediaAuthorityState(initial, {
    type: 'select-direct',
    generation: 1,
    songId: 'song-a',
    source: invalidSource,
  });
  assert.equal(result, initial, 'invalid direct source must fail closed');
}

{
  let state = select(createInitialState(), 'song-a', 1);
  const duplicate = select(state, 'song-a', 1);
  const older = select(state, 'song-b', 0);
  assert.equal(duplicate, state, 'same generation must not replace active identity');
  assert.equal(older, state, 'older generation must not replace active identity');
}

{
  let state = select(createInitialState(), 'song-a', 1);
  state = media(state, 'loadstart');
  assert.equal(state.phase, 'loading');
  assert.equal(state.playbackState, 'none');

  state = media(state, 'loadedmetadata', { duration: 180, currentTime: 0 });
  assert.equal(state.phase, 'ready');
  assert.equal(state.duration, 180);
  assert.equal(state.position, 0);

  state = media(state, 'canplay');
  assert.equal(state.phase, 'ready');

  state = media(state, 'playing', { currentTime: 2.5 });
  assert.equal(state.phase, 'playing');
  assert.equal(state.playbackState, 'playing');
  assert.equal(state.position, 2.5);

  state = media(state, 'timeupdate', { currentTime: 11.25 });
  assert.equal(state.phase, 'playing');
  assert.equal(state.position, 11.25);

  state = media(state, 'waiting', { currentTime: 11.5 });
  assert.equal(state.phase, 'buffering');
  assert.equal(state.playbackState, 'none');
  assert.equal(state.songId, 'song-a');
  assert.equal(state.position, 11.5);

  state = media(state, 'playing', { currentTime: 12 });
  assert.equal(state.phase, 'playing');
  assert.equal(state.playbackState, 'playing');

  state = media(state, 'pause', { currentTime: 15 });
  assert.equal(state.phase, 'paused');
  assert.equal(state.playbackState, 'paused');
  assert.equal(state.position, 15);
}

{
  let state = select(createInitialState(), 'song-a', 1);
  state = media(state, 'loadedmetadata', { duration: 120, currentTime: 10 });
  state = media(state, 'playing');

  state = media(state, 'seek-start', { target: 45 });
  assert.deepEqual(state.seek, { active: true, target: 45 });
  assert.equal(state.position, 10, 'seek intent must not invent a new authoritative position');
  assert.equal(state.playbackState, 'playing', 'seek intent must not invent playback state');

  const invalidCommit = media(state, 'seek-commit', { currentTime: 121 });
  assert.equal(invalidCommit, state, 'invalid seek commit must remain unresolved');

  state = media(state, 'seek-commit', { currentTime: 45.1 });
  assert.deepEqual(state.seek, { active: false, target: null });
  assert.equal(state.position, 45.1);
  assert.equal(state.phase, 'playing');
}

{
  let state = select(createInitialState(), 'song-a', 1);
  state = media(state, 'loadedmetadata', { duration: 100, currentTime: 99.9 });
  const withinTolerance = media(state, 'timeupdate', { currentTime: 100.1 });
  assert.equal(withinTolerance.position, 100, 'rounding tolerance may clamp to finite duration');

  const beyondTolerance = media(withinTolerance, 'timeupdate', { currentTime: 101 });
  assert.equal(beyondTolerance.position, 100, 'out-of-range timeupdate must not overwrite truthful position');

  const invalidDuration = media(beyondTolerance, 'durationchange', { duration: Infinity });
  assert.equal(invalidDuration.duration, 100, 'non-finite duration must be ignored');

  const zeroDuration = media(invalidDuration, 'durationchange', { duration: 0 });
  assert.equal(zeroDuration.duration, 100, 'non-positive duration must be ignored');
}

{
  let state = select(createInitialState(), 'song-a', 1);
  state = media(state, 'loadedmetadata', { duration: 200, currentTime: 150 });
  state = media(state, 'durationchange', { duration: 100 });
  assert.equal(state.duration, 100);
  assert.equal(state.position, null, 'materially impossible old position must be cleared on shorter duration truth');
}

{
  let state = select(createInitialState(), 'song-a', 1);
  state = media(state, 'loadedmetadata', { duration: 180, currentTime: 40 });
  state = media(state, 'playing');
  state = media(state, 'ended', { currentTime: 180 });
  assert.equal(state.phase, 'ended');
  assert.equal(state.playbackState, 'paused');
  assert.equal(state.position, 180);
  assert.equal(state.error, null);
}

{
  let state = select(createInitialState(), 'song-a', 1);
  state = media(state, 'playing', { currentTime: 5 });
  state = media(state, 'error', { code: 'decode-error' });
  assert.equal(state.phase, 'error');
  assert.equal(state.playbackState, 'none');
  assert.deepEqual(state.error, { code: 'decode-error' });
  assert.equal(state.songId, 'song-a');
  assert.equal(state.source.provenance.rightsHolder, 'Example Rights Holder');

  state = media(state, 'unavailable', { reason: 'rights-revoked' });
  assert.equal(state.phase, 'unavailable');
  assert.equal(state.playbackState, 'none');
  assert.deepEqual(state.error, { code: 'rights-revoked' });
}

{
  let state = select(createInitialState(), 'song-a', 1);
  state = media(state, 'loadedmetadata', { duration: 90, currentTime: 89 });
  state = media(state, 'playing');
  state = media(state, 'ended', { currentTime: 90 });
  const terminal = state;

  for (const [type, overrides] of [
    ['playing', { currentTime: 1 }],
    ['canplay', {}],
    ['pause', { currentTime: 90 }],
    ['loadstart', {}],
    ['waiting', {}],
    ['timeupdate', { currentTime: 5 }],
    ['seek-start', { target: 10 }],
    ['seek-commit', { currentTime: 10 }],
  ]) {
    assert.equal(media(state, type, overrides), terminal, `late ${type} must not resurrect ended authority`);
  }
  assert.equal(Object.isFrozen(terminal), true);
}

{
  let state = select(createInitialState(), 'song-a', 1);
  state = media(state, 'playing', { currentTime: 5 });
  state = media(state, 'error', { code: 'decode-error' });
  const terminal = state;

  for (const [type, overrides] of [
    ['playing', { currentTime: 6 }],
    ['canplay', {}],
    ['pause', { currentTime: 6 }],
    ['loadstart', {}],
    ['waiting', {}],
    ['timeupdate', { currentTime: 6 }],
    ['seek-start', { target: 10 }],
    ['seek-commit', { currentTime: 10 }],
  ]) {
    assert.equal(media(state, type, overrides), terminal, `late ${type} must not resurrect error authority`);
  }

  state = media(state, 'unavailable', { reason: 'rights-revoked' });
  assert.equal(state.phase, 'unavailable', 'error may escalate to stronger unavailable evidence');
  assert.deepEqual(state.error, { code: 'rights-revoked' });
}

{
  let state = select(createInitialState(), 'song-a', 1);
  state = media(state, 'playing', { currentTime: 5 });
  state = media(state, 'unavailable', { reason: 'rights-revoked' });
  const terminal = state;

  for (const [type, overrides] of [
    ['playing', { currentTime: 6 }],
    ['canplay', {}],
    ['pause', { currentTime: 6 }],
    ['loadstart', {}],
    ['waiting', {}],
    ['timeupdate', { currentTime: 6 }],
    ['seek-start', { target: 10 }],
    ['seek-commit', { currentTime: 10 }],
    ['error', { code: 'late-media-error' }],
  ]) {
    assert.equal(media(state, type, overrides), terminal, `late ${type} must not resurrect or weaken unavailable authority`);
  }
}

{
  for (const terminalType of ['ended', 'error', 'unavailable']) {
    let state = select(createInitialState(), 'song-a', 1);
    state = media(state, 'playing', { currentTime: 5 });
    if (terminalType === 'ended') state = media(state, 'ended', { currentTime: 5 });
    if (terminalType === 'error') state = media(state, 'error', { code: 'decode-error' });
    if (terminalType === 'unavailable') state = media(state, 'unavailable', { reason: 'rights-revoked' });

    const nextGeneration = select(state, 'song-b', 2);
    assert.equal(nextGeneration.phase, 'selected', `${terminalType} must allow newer-generation selection`);
    assert.equal(nextGeneration.songId, 'song-b');
    assert.equal(nextGeneration.generation, 2);
    assert.equal(nextGeneration.error, null);

    const reset = reduceDirectMediaAuthorityState(state, { type: 'reset', generation: 2 });
    assert.equal(reset.phase, 'idle', `${terminalType} must allow newer-generation reset`);
    assert.equal(reset.generation, 2);
    assert.equal(reset.songId, null);
  }
}

{
  let state = select(createInitialState(), 'song-a', 1);
  state = media(state, 'playing', { currentTime: 20 });
  const aPlaying = state;

  state = select(state, 'song-b', 2);
  assert.equal(state.songId, 'song-b');
  assert.equal(state.phase, 'selected');
  assert.equal(state.position, null);
  assert.equal(state.playbackState, 'none');

  const stalePause = reduceDirectMediaAuthorityState(state, {
    type: 'pause',
    generation: 1,
    songId: 'song-a',
    currentTime: 21,
  });
  assert.equal(stalePause, state, 'A pause must not overwrite selected B');

  const staleError = reduceDirectMediaAuthorityState(state, {
    type: 'error',
    generation: 1,
    songId: 'song-a',
    code: 'late-a-error',
  });
  assert.equal(staleError, state, 'A error must not overwrite selected B');

  const wrongSongSameGeneration = reduceDirectMediaAuthorityState(state, {
    type: 'playing',
    generation: 2,
    songId: 'song-a',
  });
  assert.equal(wrongSongSameGeneration, state, 'wrong-song evidence must be ignored even at active generation');

  const bPlaying = media(state, 'playing', { currentTime: 1 });
  assert.equal(bPlaying.songId, 'song-b');
  assert.equal(bPlaying.phase, 'playing');
  assert.equal(bPlaying.playbackState, 'playing');
  assert.equal(aPlaying.songId, 'song-a');
}

{
  let state = select(createInitialState(), 'song-a', 7);
  assert.equal(isAuthoritativeMediaEvent(state, {
    type: 'playing', generation: 7, songId: 'song-a',
  }), true);
  assert.equal(isAuthoritativeMediaEvent(state, {
    type: 'playing', generation: 6, songId: 'song-a',
  }), false);
  assert.equal(isAuthoritativeMediaEvent(state, {
    type: 'playing', generation: 7, songId: 'song-b',
  }), false);
  assert.equal(isAuthoritativeMediaEvent(state, {
    type: 'select-direct', generation: 7, songId: 'song-a',
  }), false);
}

{
  let state = select(createInitialState(), 'song-a', 3);
  state = media(state, 'playing', { currentTime: 8 });
  const before = JSON.stringify(state);

  for (const malformed of [
    null,
    {},
    { type: '' },
    { type: 'unknown-event', generation: 3, songId: 'song-a' },
    { type: 'playing', generation: NaN, songId: 'song-a' },
    { type: 'playing', generation: 3, songId: '' },
  ]) {
    const result = reduceDirectMediaAuthorityState(state, malformed);
    assert.equal(result, state, `malformed event must fail closed: ${JSON.stringify(malformed)}`);
  }
  assert.equal(JSON.stringify(state), before, 'malformed events must not mutate current state');
}

{
  let state = select(createInitialState(), 'song-a', 5);
  state = media(state, 'playing', { currentTime: 9 });
  const old = state;
  const reset = reduceDirectMediaAuthorityState(state, { type: 'reset', generation: 6 });
  assert.equal(reset.phase, 'idle');
  assert.equal(reset.generation, 6);
  assert.equal(reset.songId, null);
  assert.equal(reset.source, null);
  assert.equal(reset.playbackState, 'none');

  const staleAfterReset = reduceDirectMediaAuthorityState(reset, {
    type: 'playing', generation: 5, songId: 'song-a', currentTime: 10,
  });
  assert.equal(staleAfterReset, reset);
  assert.equal(old.phase, 'playing');
}

{
  const state = select(createInitialState(), 'song-a', 1);
  const event = {
    type: 'loadedmetadata',
    generation: 1,
    songId: 'song-a',
    duration: 90,
    currentTime: 4,
  };
  const snapshot = JSON.stringify(event);
  const first = reduceDirectMediaAuthorityState(state, event);
  const second = reduceDirectMediaAuthorityState(state, event);
  assert.deepEqual(first, second, 'identical inputs must produce identical output');
  assert.equal(JSON.stringify(event), snapshot, 'event input must not be mutated');
}

{
  const source = await fs.readFile(modulePath, 'utf8');
  for (const forbidden of [
    'fetch(',
    'XMLHttpRequest',
    'sendBeacon',
    'document.',
    'navigator.',
    'localStorage',
    'sessionStorage',
    'setTimeout(',
    'setInterval(',
    'new Audio(',
    '.play()',
    '.pause()',
  ]) {
    assert.equal(source.includes(forbidden), false, `authority reducer must stay side-effect free: ${forbidden}`);
  }
}

console.log('Direct-media authority state tests passed.');
