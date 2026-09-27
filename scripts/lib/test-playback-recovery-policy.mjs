import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const policyPath = path.join(repoRoot, 'src/playback/playback-recovery-policy.js');
const { buildPlaybackRecovery, MAX_RETRY_ATTEMPTS } = require(policyPath);

function context(overrides = {}) {
  const base = {
    songId: 'garba-song-001',
    generation: 'selection-7',
    source: {
      provider: 'youtube',
      kind: 'youtube-foreground',
      executable: true,
      youtubeVerifiedExact: true,
      youtubeWatchUrl: 'https://www.youtube.com/watch?v=abcdefghijk',
    },
  };
  const next = { ...base, ...overrides };
  next.source = overrides.source === null ? null : { ...base.source, ...(overrides.source || {}) };
  return next;
}

function recovery(kind, overrides = {}) {
  return buildPlaybackRecovery({
    context: context(),
    failure: { kind, internalMessage: 'SECRET stack provider-runtime.js:42 source-map token=abc' },
    retry: { attempts: 0, maxAttempts: 2 },
    ...overrides,
  });
}

{
  const expected = {
    offline: ['retry'],
    'autoplay-blocked': ['play'],
    'api-timeout': ['retry', 'open-youtube', 'choose-another'],
    'embedding-disabled': ['open-youtube', 'choose-another'],
    'removed-or-private': ['choose-another'],
    'no-route': ['open-youtube', 'choose-another'],
    'provider-error': ['retry', 'open-youtube', 'choose-another'],
  };
  for (const [kind, actionIds] of Object.entries(expected)) {
    const result = recovery(kind);
    assert.equal(result.valid, true, kind);
    assert.equal(result.failureKind, kind, kind);
    assert.equal(result.playbackState, 'not-playing', kind);
    assert.equal(result.persistent, true, kind);
    assert.deepEqual(result.actions.map(({ id }) => id), actionIds, kind);
    assert.equal(result.message.includes('provider-runtime'), false, kind);
    assert.equal(result.message.includes('SECRET'), false, kind);
  }
}

{
  const result = recovery('autoplay-blocked');
  assert.equal(result.state, 'blocked');
  assert.equal(result.actions[0].requiresUserGesture, true);
  assert.equal(result.actions[0].target.songId, 'garba-song-001');
  assert.equal(result.actions[0].target.generation, 'selection-7');
  assert.equal(result.actions.some(({ id }) => id === 'retry'), false);
}

{
  const result = recovery('offline');
  assert.equal(result.state, 'offline');
  assert.equal(result.message.includes('unavailable'), false);
  assert.equal(result.actions.some(({ id }) => id === 'open-youtube'), false);
}

for (const kind of ['embedding-disabled', 'removed-or-private', 'no-route']) {
  const result = recovery(kind);
  assert.equal(result.actions.some(({ id }) => id === 'retry'), false, kind);
}

{
  const result = recovery('api-timeout', { retry: { attempts: 1, maxAttempts: 2 } });
  const retry = result.actions.find(({ id }) => id === 'retry');
  assert.equal(retry.attempt, 2);
  assert.equal(retry.maxAttempts, 2);
  assert.deepEqual(retry.target, {
    songId: 'garba-song-001',
    generation: 'selection-7',
    provider: 'youtube',
    sourceKind: 'youtube-foreground',
  });
}

{
  const exhausted = recovery('provider-error', { retry: { attempts: 2, maxAttempts: 2 } });
  assert.equal(exhausted.actions.some(({ id }) => id === 'retry'), false);
  assert.ok(exhausted.actions.some(({ id }) => id === 'choose-another'));
}

{
  const capped = recovery('provider-error', {
    retry: { attempts: MAX_RETRY_ATTEMPTS, maxAttempts: 999 },
  });
  assert.equal(capped.actions.some(({ id }) => id === 'retry'), false);
}

for (const malformedRetry of [
  { attempts: -1, maxAttempts: 2 },
  { attempts: Number.NaN, maxAttempts: 2 },
  { attempts: 0, maxAttempts: -1 },
  { attempts: 0, maxAttempts: Number.POSITIVE_INFINITY },
  'invalid',
]) {
  const result = recovery('provider-error', { retry: malformedRetry });
  assert.equal(result.actions.some(({ id }) => id === 'retry'), false);
}

{
  const noExecutableSource = recovery('api-timeout', {
    context: context({ source: { executable: false } }),
  });
  assert.equal(noExecutableSource.actions.some(({ id }) => id === 'retry'), false);
}

for (const source of [
  { youtubeVerifiedExact: false, youtubeWatchUrl: 'https://www.youtube.com/watch?v=abcdefghijk' },
  { youtubeVerifiedExact: true, youtubeWatchUrl: 'http://www.youtube.com/watch?v=abcdefghijk' },
  { youtubeVerifiedExact: true, youtubeWatchUrl: 'https://example.com/watch?v=abcdefghijk' },
  { youtubeVerifiedExact: true, youtubeWatchUrl: 'https://www.youtube.com/watch' },
]) {
  const result = recovery('provider-error', { context: context({ source }) });
  assert.equal(result.actions.some(({ id }) => id === 'open-youtube'), false);
}

{
  const short = recovery('provider-error', {
    context: context({
      source: { youtubeVerifiedExact: true, youtubeWatchUrl: 'https://youtu.be/abcdefghijk?t=20' },
    }),
  });
  assert.equal(short.actions.find(({ id }) => id === 'open-youtube').url, 'https://youtu.be/abcdefghijk?t=20');
}

{
  const invalidIdentityWithYoutube = recovery('provider-error', {
    context: context({ songId: '' }),
  });
  assert.equal(invalidIdentityWithYoutube.actions.some(({ id }) => id === 'open-youtube'), false);
}

{
  const missingSourceIdentity = recovery('api-timeout', {
    context: context({ source: { provider: '', kind: '', executable: true } }),
  });
  assert.equal(missingSourceIdentity.actions.some(({ id }) => id === 'retry'), false);
}

{
  const blockedWithoutExecutableSource = recovery('autoplay-blocked', {
    context: context({ source: { executable: false } }),
  });
  assert.deepEqual(blockedWithoutExecutableSource.actions, []);
}

{
  const unknown = recovery('totally-new-provider-failure');
  assert.equal(unknown.valid, false);
  assert.equal(unknown.failureKind, 'unknown');
  assert.equal(unknown.reason, 'failure-kind-invalid');
  assert.equal(unknown.message, 'This recording couldn’t play right now.');
  assert.deepEqual(unknown.actions.map(({ id }) => id), ['choose-another']);
}

for (const badContext of [null, {}, context({ songId: '' }), context({ generation: null }), context({ generation: -1 })]) {
  const result = buildPlaybackRecovery({
    context: badContext,
    failure: { kind: 'provider-error', internalMessage: 'password=secret' },
  });
  assert.equal(result.valid, false);
  assert.equal(result.reason, 'playback-context-invalid');
  assert.equal(result.songId, '');
  assert.equal(result.generation, null);
  assert.equal(result.actions.some(({ id }) => id === 'retry'), false);
}

{
  const input = {
    context: context(),
    failure: { kind: 'provider-error', internalMessage: 'token=should-never-surface' },
    retry: { attempts: 0, maxAttempts: 2 },
  };
  const before = structuredClone(input);
  const result = buildPlaybackRecovery(input);
  assert.deepEqual(input, before);
  assert.equal(JSON.stringify(result).includes('should-never-surface'), false);
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.actions), true);
  assert.equal(Object.isFrozen(result.actions[0]), true);
  assert.equal(Object.isFrozen(result.actions[0].target), true);
}

{
  const first = recovery('provider-error');
  const second = recovery('provider-error');
  assert.deepEqual(first, second);
}

{
  const source = await fs.readFile(policyPath, 'utf8');
  for (const forbidden of [
    'navigator.', 'document.', 'window.', 'fetch(', 'XMLHttpRequest', 'sendBeacon',
    'localStorage', 'sessionStorage', 'indexedDB', 'setTimeout(', 'setInterval(', '.play()', '.pause()',
  ]) {
    assert.equal(source.includes(forbidden), false, `policy must stay pure: ${forbidden}`);
  }
  const listenerMessages = [
    'offline', 'autoplay-blocked', 'api-timeout', 'embedding-disabled',
    'removed-or-private', 'no-route', 'provider-error',
  ].map((kind) => recovery(kind).message);
  for (const forbiddenCopy of ['provider-runtime', 'source-map', 'credential', 'token=', 'stack']) {
    assert.equal(listenerMessages.some((message) => message.includes(forbiddenCopy)), false);
  }
}

console.log('Playback recovery policy tests passed.');
