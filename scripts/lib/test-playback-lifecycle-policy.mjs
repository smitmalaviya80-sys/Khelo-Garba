import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const policyPath = path.join(repoRoot, 'src/playback/playback-lifecycle-policy.js');
const { reconcilePlaybackLifecycle, VERSION } = require(policyPath);

const SONG_ID = 'garba-song-001';
const GENERATION = 'selection-7';

function directResolution(overrides = {}) {
  return {
    kind: 'direct',
    playable: true,
    backgroundCapable: true,
    songId: SONG_ID,
    provider: 'direct',
    ...overrides,
  };
}

function youtubeResolution(overrides = {}) {
  return {
    kind: 'youtube-foreground',
    playable: true,
    backgroundCapable: false,
    songId: SONG_ID,
    provider: 'youtube',
    ...overrides,
  };
}

function lifecycleInput(overrides = {}) {
  return {
    active: { songId: SONG_ID, generation: GENERATION },
    resolution: directResolution(),
    playback: { state: 'playing', evidence: 'fresh', generation: GENERATION },
    lifecycle: { event: 'visible', generation: GENERATION },
    ...overrides,
  };
}

function evaluate(overrides = {}) {
  return reconcilePlaybackLifecycle(lifecycleInput(overrides));
}

assert.equal(VERSION, 1);

{
  const result = evaluate({ lifecycle: { event: 'hidden', generation: GENERATION } });
  assert.equal(result.valid, true);
  assert.equal(result.decision, 'preserve-authoritative-state');
  assert.equal(result.reason, 'direct-background-capable');
  assert.equal(result.stateClaim, 'playing');
  assert.equal(result.requiresReconciliation, false);
  assert.equal(result.allowBackgroundContinuation, true);
  assert.equal(result.allowAutomaticResume, false);
  assert.equal(result.songId, SONG_ID);
  assert.equal(Object.isFrozen(result), true);
}

{
  const result = evaluate({
    playback: { state: 'paused', evidence: 'fresh', generation: GENERATION },
    lifecycle: { event: 'pagehide', generation: GENERATION },
  });
  assert.equal(result.decision, 'hold-paused-truth');
  assert.equal(result.stateClaim, 'paused');
  assert.equal(result.requiresReconciliation, false);
  assert.equal(result.allowBackgroundContinuation, true);
}

for (const event of ['hidden', 'pagehide', 'freeze']) {
  const result = evaluate({
    resolution: youtubeResolution(),
    lifecycle: { event, generation: GENERATION },
  });
  assert.equal(result.valid, true, event);
  assert.equal(result.decision, 'reconcile-before-claim', event);
  assert.equal(result.stateClaim, 'none', event);
  assert.equal(result.requiresReconciliation, true, event);
  assert.equal(result.allowBackgroundContinuation, false, event);
}

{
  const result = evaluate({
    resolution: youtubeResolution(),
    playback: { state: 'paused', evidence: 'fresh', generation: GENERATION },
    lifecycle: { event: 'hidden', generation: GENERATION },
  });
  assert.equal(result.decision, 'hold-paused-truth');
  assert.equal(result.stateClaim, 'paused');
  assert.equal(result.requiresReconciliation, true);
}

for (const event of ['visible', 'pageshow', 'resume']) {
  const result = evaluate({
    resolution: youtubeResolution(),
    playback: { state: 'playing', evidence: 'stale', generation: GENERATION },
    lifecycle: { event, generation: GENERATION },
  });
  assert.equal(result.decision, 'reconcile-before-claim', event);
  assert.equal(result.stateClaim, 'none', event);
  assert.equal(result.requiresReconciliation, true, event);
}

{
  const result = evaluate({
    resolution: youtubeResolution(),
    playback: { state: 'playing', evidence: 'fresh', generation: GENERATION },
    lifecycle: { event: 'pageshow', generation: GENERATION },
  });
  assert.equal(result.decision, 'preserve-authoritative-state');
  assert.equal(result.stateClaim, 'playing');
  assert.equal(result.requiresReconciliation, false);
}

{
  const result = evaluate({
    playback: { state: 'playing', evidence: 'fresh', generation: GENERATION },
    lifecycle: { event: 'interrupted', generation: GENERATION },
  });
  assert.equal(result.decision, 'clear-stale-playing');
  assert.equal(result.stateClaim, 'none');
  assert.equal(result.requiresReconciliation, true);
  assert.equal(result.allowAutomaticResume, false);
}

{
  const result = evaluate({
    playback: { state: 'paused', evidence: 'fresh', generation: GENERATION },
    lifecycle: { event: 'interrupted', generation: GENERATION },
  });
  assert.equal(result.decision, 'hold-paused-truth');
  assert.equal(result.stateClaim, 'paused');
  assert.equal(result.requiresReconciliation, true);
}

{
  const noFreshResume = evaluate({
    playback: { state: 'playing', evidence: 'stale', generation: GENERATION },
    lifecycle: { event: 'interruption-ended', generation: GENERATION },
  });
  assert.equal(noFreshResume.decision, 'reconcile-before-claim');
  assert.equal(noFreshResume.stateClaim, 'none');
  assert.equal(noFreshResume.allowAutomaticResume, false);

  const freshResume = evaluate({
    playback: { state: 'playing', evidence: 'fresh', generation: GENERATION },
    lifecycle: { event: 'interruption-ended', generation: GENERATION },
  });
  assert.equal(freshResume.decision, 'preserve-authoritative-state');
  assert.equal(freshResume.stateClaim, 'playing');
  assert.equal(freshResume.allowBackgroundContinuation, true);
  assert.equal(freshResume.allowAutomaticResume, false);
}

for (const state of ['ended', 'error', 'unavailable']) {
  const result = evaluate({
    playback: { state, evidence: 'fresh', generation: GENERATION },
    lifecycle: { event: 'visible', generation: GENERATION },
  });
  assert.equal(result.decision, 'clear-stale-playing', state);
  assert.equal(result.reason, `playback-${state}`, state);
  assert.equal(result.stateClaim, 'none', state);
  assert.equal(result.requiresReconciliation, false, state);
}

for (const resolution of [
  { kind: 'unavailable', playable: false, backgroundCapable: false, songId: SONG_ID, provider: null },
  { kind: 'direct-invalid', playable: false, backgroundCapable: false, songId: SONG_ID, provider: 'direct' },
  { kind: 'direct-failed', playable: false, backgroundCapable: false, songId: SONG_ID, provider: 'direct' },
]) {
  const result = evaluate({ resolution });
  assert.equal(result.decision, 'unavailable', resolution.kind);
  assert.equal(result.stateClaim, 'none', resolution.kind);
  assert.equal(result.allowBackgroundContinuation, false, resolution.kind);
}

{
  const result = evaluate({
    playback: { state: 'playing', evidence: 'fresh', generation: 'selection-6' },
  });
  assert.equal(result.decision, 'ignore-stale-evidence');
  assert.equal(result.reason, 'stale-generation');
  assert.equal(result.stateClaim, null);
  assert.equal(result.requiresReconciliation, false);
  assert.equal(result.songId, SONG_ID);
}

{
  const result = evaluate({
    lifecycle: { event: 'hidden', generation: 'selection-6' },
  });
  assert.equal(result.decision, 'ignore-stale-evidence');
  assert.equal(result.stateClaim, null);
}

{
  const result = evaluate({
    resolution: directResolution({ songId: 'different-song' }),
  });
  assert.equal(result.valid, false);
  assert.equal(result.reason, 'resolution-identity-mismatch');
  assert.equal(result.songId, SONG_ID);
  assert.equal(result.stateClaim, 'none');
}

for (const broken of [
  {},
  { active: null },
  { active: { songId: '', generation: GENERATION } },
  { playback: { state: 'invented', evidence: 'fresh', generation: GENERATION } },
  { playback: { state: 'playing', evidence: 'invented', generation: GENERATION } },
  { lifecycle: { event: 'power-off', generation: GENERATION } },
  { resolution: directResolution({ backgroundCapable: false }) },
  { resolution: youtubeResolution({ backgroundCapable: true }) },
]) {
  const result = reconcilePlaybackLifecycle(
    Object.keys(broken).length === 0 ? undefined : lifecycleInput(broken)
  );
  assert.equal(result.valid, false);
  assert.equal(result.decision, 'unavailable');
  assert.equal(result.allowAutomaticResume, false);
}

{
  const input = lifecycleInput({
    lifecycle: { event: 'hidden', generation: GENERATION },
  });
  const before = JSON.stringify(input);
  const first = reconcilePlaybackLifecycle(input);
  const second = reconcilePlaybackLifecycle(input);
  assert.equal(JSON.stringify(input), before, 'policy must not mutate caller input');
  assert.deepEqual(first, second, 'identical input must produce identical output');
  assert.equal(first.songId, input.active.songId, 'policy must preserve active canonical identity');
  assert.equal(first.generation, input.active.generation, 'policy must preserve active generation');
}

{
  const source = await fs.readFile(policyPath, 'utf8');
  for (const forbidden of [
    'navigator.',
    'document.',
    'window.',
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
    'localStorage',
    'indexedDB',
  ]) {
    assert.equal(source.includes(forbidden), false, `lifecycle policy must stay side-effect free: ${forbidden}`);
  }
  for (const prohibitedPromise of ['youtube background', 'power-off playback', 'device sleep playback']) {
    assert.equal(source.toLowerCase().includes(prohibitedPromise), false);
  }
}

console.log('Playback lifecycle reconciliation policy tests passed.');
