import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const policyPath = path.join(repoRoot, 'src/playback/media-session-policy.js');
const resolverPath = path.join(repoRoot, 'src/playback/direct-source-resolver.js');
const { buildMediaSessionPolicy } = require(policyPath);
const { resolvePlaybackSource, failDirectPlayback } = require(resolverPath);

function identity(overrides = {}) {
  return {
    songId: 'garba-song-001',
    title: 'Garba Song',
    artist: 'Artist',
    album: 'Garba Album',
    artwork: [
      { src: '/assets/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/assets/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    ...overrides,
  };
}

function playback(state = 'playing', overrides = {}) {
  return {
    state,
    songId: 'garba-song-001',
    generation: 7,
    ...overrides,
  };
}

function song(overrides = {}) {
  return {
    id: 'garba-song-001',
    title: 'Garba Song',
    artist: 'Artist',
    playbackProvider: 'youtube',
    youtubeId: 'abcdefghijk',
    playbackSourceUrl: 'https://www.youtube.com/watch?v=abcdefghijk',
    playbackSourceType: 'verified-track-source',
    playbackSearchOnly: false,
    ...overrides,
  };
}

function directEntry() {
  return {
    audioUrl: 'https://audio.playgarba.example/garba-song-001/stream.m4a',
    mimeType: 'audio/mp4',
    rights: {
      redistributionAuthorized: true,
      rightsHolder: 'Example Rights Holder',
      licenseName: 'Direct streaming permission',
      proofUrl: 'https://rights.playgarba.example/grants/garba-song-001',
    },
  };
}

function directResolution() {
  return resolvePlaybackSource({
    song: song(),
    directSongId: 'garba-song-001',
    directEntry: directEntry(),
  });
}

function youtubeResolution() {
  return resolvePlaybackSource({ song: song() });
}

function fullCapabilities(overrides = {}) {
  return {
    canPlay: true,
    canPause: true,
    canStop: true,
    canSeek: true,
    seekBackwardSeconds: 10,
    seekForwardSeconds: 30,
    canPrevious: true,
    canNext: true,
    ...overrides,
  };
}

function validPosition(overrides = {}) {
  return { duration: 240, position: 62, playbackRate: 1, ...overrides };
}

function buildDirect(overrides = {}) {
  return buildMediaSessionPolicy({
    resolution: directResolution(),
    identity: identity(),
    playback: playback(),
    capabilities: fullCapabilities(),
    position: validPosition(),
    environment: { foreground: false },
    ...overrides,
  });
}

{
  const result = buildDirect();
  assert.equal(result.valid, true);
  assert.equal(result.songId, 'garba-song-001');
  assert.equal(result.generation, 7);
  assert.equal(result.provider, 'direct');
  assert.equal(result.backgroundCapable, true);
  assert.equal(result.playbackState, 'playing');
  assert.deepEqual(result.actions, [
    'play', 'pause', 'stop', 'seekto', 'seekbackward', 'seekforward', 'previoustrack', 'nexttrack',
  ]);
  assert.deepEqual(result.position, { duration: 240, position: 62, playbackRate: 1 });
  assert.deepEqual(result.seekOffsets, { backwardSeconds: 10, forwardSeconds: 30 });
  assert.equal(result.metadata.title, 'Garba Song');
  assert.equal(result.metadata.artist, 'Artist');
  assert.equal(result.metadata.album, 'Garba Album');
  assert.equal(result.metadata.artwork.length, 2);
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.metadata), true);
  assert.equal(Object.isFrozen(result.metadata.artwork), true);
  assert.equal(Object.isFrozen(result.actions), true);
  assert.equal(Object.isFrozen(result.position), true);
}

{
  const paused = buildDirect({ playback: playback('paused') });
  assert.equal(paused.valid, true);
  assert.equal(paused.generation, 7);
  assert.equal(paused.playbackState, 'paused');
  assert.equal(paused.backgroundCapable, true);
  assert.ok(paused.actions.includes('play'));
  assert.ok(paused.actions.includes('pause'));
}

{
  const buffering = buildDirect({ playback: playback('buffering') });
  assert.equal(buffering.valid, true);
  assert.equal(buffering.generation, 7);
  assert.equal(buffering.playbackState, 'none');
  assert.equal(buffering.metadata.songId, undefined);
  assert.ok(buffering.actions.includes('pause'));
}

for (const state of ['ended', 'error', 'unavailable']) {
  const result = buildDirect({ playback: playback(state) });
  assert.equal(result.valid, false, state);
  assert.equal(result.generation, 7, state);
  assert.equal(result.playbackState, 'none', state);
  assert.equal(result.metadata, null, state);
  assert.equal(result.position, null, state);
  assert.deepEqual(result.actions, [], state);
  assert.equal(result.reason, `playback-${state}`, state);
}

for (const state of ['selected', 'loading', 'cued', 'unknown']) {
  const result = buildDirect({ playback: playback(state) });
  assert.equal(result.valid, true, state);
  assert.equal(result.reason, 'playback-inactive', state);
  assert.equal(result.generation, 7, state);
  assert.equal(result.playbackState, 'none', state);
  assert.equal(result.metadata.title, 'Garba Song', state);
  assert.equal(result.position, null, state);
  assert.deepEqual(result.actions, [], state);
}

{
  const result = buildMediaSessionPolicy({
    resolution: youtubeResolution(),
    identity: identity(),
    playback: playback('playing'),
    capabilities: fullCapabilities(),
    position: validPosition(),
    environment: { foreground: true },
  });
  assert.equal(result.valid, true);
  assert.equal(result.generation, 7);
  assert.equal(result.provider, 'youtube');
  assert.equal(result.backgroundCapable, false);
  assert.equal(result.playbackState, 'playing');
  assert.ok(result.actions.includes('pause'));
}

{
  const hiddenYoutube = buildMediaSessionPolicy({
    resolution: youtubeResolution(),
    identity: identity(),
    playback: playback('playing'),
    capabilities: fullCapabilities(),
    position: validPosition(),
    environment: { foreground: false },
  });
  assert.equal(hiddenYoutube.valid, false);
  assert.equal(hiddenYoutube.reason, 'foreground-required');
  assert.equal(hiddenYoutube.generation, 7);
  assert.equal(hiddenYoutube.backgroundCapable, false);
  assert.equal(hiddenYoutube.playbackState, 'none');
  assert.equal(hiddenYoutube.metadata, null);
  assert.equal(hiddenYoutube.position, null);
  assert.deepEqual(hiddenYoutube.actions, []);
}

{
  const missingEnvironment = buildMediaSessionPolicy({
    resolution: youtubeResolution(),
    identity: identity(),
    playback: playback('paused'),
    capabilities: fullCapabilities(),
    position: validPosition(),
  });
  assert.equal(missingEnvironment.valid, false);
  assert.equal(missingEnvironment.reason, 'foreground-required');
}

{
  const unavailable = resolvePlaybackSource({
    song: song({ youtubeId: null, playbackSourceUrl: '', playbackProvider: 'youtube' }),
  });
  const result = buildMediaSessionPolicy({
    resolution: unavailable,
    identity: identity(),
    playback: playback('playing'),
    capabilities: fullCapabilities(),
    position: validPosition(),
    environment: { foreground: true },
  });
  assert.equal(result.valid, false);
  assert.equal(result.reason, 'source-not-usable');
  assert.equal(result.generation, null);
  assert.equal(result.metadata, null);
  assert.deepEqual(result.actions, []);
}

{
  const failed = failDirectPlayback(directResolution(), 'network-error');
  const result = buildMediaSessionPolicy({
    resolution: failed,
    identity: identity(),
    playback: playback('playing'),
    capabilities: fullCapabilities(),
    position: validPosition(),
    environment: { foreground: false },
  });
  assert.equal(result.valid, false);
  assert.equal(result.reason, 'source-not-usable');
  assert.equal(result.playbackState, 'none');
  assert.equal(result.metadata, null);
  assert.equal(result.position, null);
  assert.deepEqual(result.actions, []);
}

{
  const mismatch = buildDirect({ identity: identity({ songId: 'different-song' }) });
  assert.equal(mismatch.valid, false);
  assert.equal(mismatch.reason, 'identity-mismatch');
  assert.equal(mismatch.songId, 'garba-song-001');
  assert.equal(mismatch.metadata, null);
  assert.deepEqual(mismatch.actions, []);
}

for (const brokenIdentity of [
  identity({ title: '' }),
  identity({ artist: '' }),
  null,
]) {
  const result = buildDirect({ identity: brokenIdentity });
  assert.equal(result.valid, false);
  assert.equal(result.reason, 'identity-mismatch');
}

for (const brokenPlayback of [
  playback('playing', { songId: 'different-song' }),
  playback('playing', { songId: '' }),
  { state: 'playing', songId: 'garba-song-001' },
  playback('playing', { generation: '7' }),
  playback('playing', { generation: -1 }),
  playback('playing', { generation: 1.5 }),
  playback('playing', { generation: Number.NaN }),
  playback('playing', { generation: Number.POSITIVE_INFINITY }),
  null,
]) {
  const result = buildDirect({ playback: brokenPlayback });
  assert.equal(result.valid, false);
  assert.equal(result.reason, 'playback-identity-invalid');
  assert.equal(result.songId, 'garba-song-001');
  assert.equal(result.generation, null);
  assert.equal(result.metadata, null);
  assert.deepEqual(result.actions, []);
}

{
  const nextGeneration = buildDirect({ playback: playback('paused', { generation: 8 }) });
  assert.equal(nextGeneration.valid, true);
  assert.equal(nextGeneration.generation, 8);
  assert.equal(nextGeneration.playbackState, 'paused');
}

for (const brokenPosition of [
  { duration: 0, position: 0, playbackRate: 1 },
  { duration: 240, position: -1, playbackRate: 1 },
  { duration: 240, position: 241, playbackRate: 1 },
  { duration: 240, position: 10, playbackRate: 0 },
  { duration: Number.NaN, position: 10, playbackRate: 1 },
]) {
  const result = buildDirect({ position: brokenPosition });
  assert.equal(result.position, null);
  assert.equal(result.actions.includes('seekto'), false);
  assert.equal(result.actions.includes('seekbackward'), false);
  assert.equal(result.actions.includes('seekforward'), false);
  assert.ok(result.actions.includes('play'));
  assert.ok(result.actions.includes('nexttrack'));
}

{
  const notSeekable = buildDirect({ capabilities: fullCapabilities({ canSeek: false }) });
  assert.equal(notSeekable.position, null);
  assert.equal(notSeekable.seekOffsets, null);
  assert.equal(notSeekable.actions.includes('seekto'), false);
  assert.equal(notSeekable.actions.includes('seekbackward'), false);
  assert.equal(notSeekable.actions.includes('seekforward'), false);
}

{
  const seekToOnly = buildDirect({
    capabilities: fullCapabilities({ seekBackwardSeconds: null, seekForwardSeconds: null }),
  });
  assert.ok(seekToOnly.actions.includes('seekto'));
  assert.equal(seekToOnly.actions.includes('seekbackward'), false);
  assert.equal(seekToOnly.actions.includes('seekforward'), false);
  assert.equal(seekToOnly.seekOffsets, null);
}

{
  const noAdjacent = buildDirect({ capabilities: fullCapabilities({ canPrevious: false, canNext: false }) });
  assert.equal(noAdjacent.actions.includes('previoustrack'), false);
  assert.equal(noAdjacent.actions.includes('nexttrack'), false);
}

{
  const noStop = buildDirect({ capabilities: fullCapabilities({ canStop: false }) });
  assert.equal(noStop.actions.includes('stop'), false);
}

{
  const noPlayPause = buildDirect({ capabilities: fullCapabilities({ canPlay: false, canPause: false }) });
  assert.equal(noPlayPause.actions.includes('play'), false);
  assert.equal(noPlayPause.actions.includes('pause'), false);
}

{
  const noRateSpecified = buildDirect({ position: { duration: 100, position: 10 } });
  assert.deepEqual(noRateSpecified.position, { duration: 100, position: 10, playbackRate: 1 });
}

{
  const malformedResolution = buildMediaSessionPolicy({
    resolution: null,
    identity: identity(),
    playback: playback('playing'),
  });
  assert.equal(malformedResolution.valid, false);
  assert.equal(malformedResolution.reason, 'resolution-invalid');
  assert.equal(malformedResolution.songId, '');
  assert.equal(malformedResolution.generation, null);
}

{
  const source = await fs.readFile(policyPath, 'utf8');
  for (const forbidden of [
    'navigator.',
    'document.',
    'fetch(',
    'XMLHttpRequest',
    'sendBeacon',
    'setActionHandler',
    'setPositionState',
    'new Audio(',
    '.play()',
    '.pause()',
    'setTimeout(',
    'setInterval(',
  ]) {
    assert.equal(source.includes(forbidden), false, `policy must stay declarative and side-effect free: ${forbidden}`);
  }
}

console.log('Media Session capability policy tests passed.');
