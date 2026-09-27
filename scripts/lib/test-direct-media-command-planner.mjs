import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs';

const require = createRequire(import.meta.url);
const {
  VERSION,
  INTENT_TYPES,
  planDirectMediaCommands,
} = require('../../src/playback/direct-media-command-planner.js');

const SOURCE_A = Object.freeze({
  kind: 'direct',
  provider: 'direct',
  playable: true,
  backgroundCapable: true,
  songId: 'song-a',
  media: Object.freeze({
    url: 'https://media.playgarba.com/song-a.mp3',
    mimeType: 'audio/mpeg',
  }),
  provenance: Object.freeze({
    sourceType: 'licensed-direct',
    rightsHolder: 'Rights holder',
    licenseName: 'Explicit licence',
    proofUrl: 'https://rights.example/song-a',
  }),
});

const SOURCE_B = Object.freeze({
  ...SOURCE_A,
  songId: 'song-b',
  media: Object.freeze({
    url: 'https://media.playgarba.com/song-b.mp3',
    mimeType: 'audio/mpeg',
  }),
  provenance: SOURCE_A.provenance,
});

function state(overrides = {}) {
  return {
    version: 1,
    generation: 7,
    songId: 'song-a',
    source: SOURCE_A,
    phase: 'ready',
    playbackState: 'none',
    duration: 180,
    position: 12,
    seek: { active: false, target: null },
    error: null,
    ...overrides,
  };
}

function binding(overrides = {}) {
  return {
    songId: 'song-a',
    generation: 7,
    sourceUrl: SOURCE_A.media.url,
    ...overrides,
  };
}

function intent(type, overrides = {}) {
  return { type, songId: 'song-a', generation: 7, ...overrides };
}

function lifecycle(overrides = {}) {
  return {
    version: 1,
    valid: true,
    decision: 'preserve-authoritative-state',
    reason: 'direct-background-capable',
    songId: 'song-a',
    generation: 7,
    stateClaim: 'none',
    requiresReconciliation: false,
    allowBackgroundContinuation: true,
    allowAutomaticResume: false,
    preserveActiveIdentity: true,
    ...overrides,
  };
}

function sessionPolicy(overrides = {}) {
  return {
    version: 1,
    valid: true,
    reason: null,
    songId: 'song-a',
    generation: 7,
    provider: 'direct',
    backgroundCapable: true,
    playbackState: 'paused',
    metadata: {
      title: 'Song A',
      artist: 'Artist A',
      album: 'Album A',
      artwork: [{ src: 'https://playgarba.com/artwork/song-a.webp', sizes: '512x512', type: 'image/webp' }],
    },
    position: { duration: 180, position: 12, playbackRate: 1 },
    seekOffsets: { backwardSeconds: 10, forwardSeconds: 10 },
    actions: ['play', 'pause', 'seekto'],
    ...overrides,
  };
}

function ops(plan) {
  return plan.commands.map((command) => command.op);
}

function deepFrozen(value) {
  if (!value || typeof value !== 'object') return true;
  return Object.isFrozen(value) && Object.values(value).every(deepFrozen);
}

test('exports one stable pure planner contract', () => {
  assert.equal(VERSION, 1);
  assert.deepEqual([...INTENT_TYPES].sort(), ['clear', 'pause', 'play', 'reconcile', 'seek', 'sync-source'].sort());
  assert.equal(typeof planDirectMediaCommands, 'function');
});

test('selected direct source plus empty binding emits bind then load without implicit Play', () => {
  const plan = planDirectMediaCommands({ authorityState: state(), intent: intent('sync-source') });
  assert.equal(plan.valid, true);
  assert.equal(plan.intent.accepted, true);
  assert.deepEqual(ops(plan), ['bind-source', 'load-media']);
  assert.equal(plan.commands[0].sourceUrl, SOURCE_A.media.url);
  assert.equal(plan.commands[0].songId, 'song-a');
  assert.equal(plan.commands[0].generation, 7);
  assert.equal(ops(plan).includes('request-play'), false);
});

test('matching binding produces no redundant bind or load', () => {
  const plan = planDirectMediaCommands({ authorityState: state(), binding: binding(), intent: intent('sync-source') });
  assert.deepEqual(ops(plan), []);
});

test('stale A binding is paused and cleared before B is bound and loaded', () => {
  const authority = state({ generation: 8, songId: 'song-b', source: SOURCE_B });
  const stale = binding();
  const plan = planDirectMediaCommands({
    authorityState: authority,
    binding: stale,
    intent: { type: 'sync-source', songId: 'song-b', generation: 8 },
  });
  assert.deepEqual(ops(plan), ['request-pause', 'clear-media-source', 'bind-source', 'load-media']);
  assert.equal(plan.commands[0].songId, 'song-b');
  assert.equal(plan.commands[0].generation, 8);
  assert.deepEqual(plan.commands[0].expectedBinding, stale);
  assert.equal(plan.commands[2].sourceUrl, SOURCE_B.media.url);
});

test('stale or wrong-song sync-source and clear intents cannot mutate the current direct authority', () => {
  const authority = state({ generation: 8, songId: 'song-b', source: SOURCE_B });
  const currentBinding = {
    songId: 'song-b',
    generation: 8,
    sourceUrl: SOURCE_B.media.url,
  };
  for (const type of ['sync-source', 'clear']) {
    for (const requestedIntent of [
      { type, songId: 'song-b', generation: 7 },
      { type, songId: 'song-a', generation: 8 },
      { type },
    ]) {
      const plan = planDirectMediaCommands({
        authorityState: authority,
        binding: currentBinding,
        intent: requestedIntent,
      });
      assert.equal(plan.intent.accepted, false, `${type} should reject stale/missing identity`);
      assert.equal(plan.intent.reason, 'intent-identity-mismatch');
      assert.deepEqual(ops(plan), []);
    }
  }
});

test('current clear still pauses and clears the exact active binding and Media Session', () => {
  const plan = planDirectMediaCommands({
    authorityState: state({ phase: 'playing', playbackState: 'playing' }),
    binding: binding(),
    intent: intent('clear'),
  });
  assert.equal(plan.intent.accepted, true);
  assert.deepEqual(ops(plan), ['request-pause', 'clear-media-source', 'clear-media-session']);
  assert.deepEqual(plan.commands[0].expectedBinding, binding());
  assert.deepEqual(plan.commands[1].expectedBinding, binding());
  assert.equal(plan.commands[2].reason, 'explicit-clear');
});

test('explicit Play can prepare the active binding then request play but never claims Playing', () => {
  const plan = planDirectMediaCommands({ authorityState: state(), intent: intent('play') });
  assert.deepEqual(ops(plan), ['bind-source', 'load-media', 'request-play']);
  assert.equal(Object.hasOwn(plan, 'playbackState'), false);
  assert.equal(Object.hasOwn(plan.commands[2], 'stateClaim'), false);
});

test('Play while already authoritatively playing is a transport no-op', () => {
  const plan = planDirectMediaCommands({
    authorityState: state({ phase: 'playing', playbackState: 'playing' }),
    binding: binding(),
    intent: intent('play'),
  });
  assert.deepEqual(ops(plan), []);
});

test('Pause while playing requests pause against the exact current binding', () => {
  const plan = planDirectMediaCommands({
    authorityState: state({ phase: 'playing', playbackState: 'playing' }),
    binding: binding(),
    intent: intent('pause'),
  });
  assert.deepEqual(ops(plan), ['request-pause']);
  assert.deepEqual(plan.commands[0].expectedBinding, binding());
  assert.equal(plan.commands[0].reason, 'pause-intent');
});

test('wrong generation Play intent is rejected without transport effects', () => {
  const plan = planDirectMediaCommands({
    authorityState: state(),
    binding: binding(),
    intent: intent('play', { generation: 6 }),
  });
  assert.equal(plan.intent.accepted, false);
  assert.equal(plan.intent.reason, 'intent-identity-mismatch');
  assert.deepEqual(ops(plan), []);
});

test('bounded seek requests exact target only with active binding and finite authoritative duration', () => {
  const plan = planDirectMediaCommands({
    authorityState: state({ phase: 'paused', playbackState: 'paused', duration: 180 }),
    binding: binding(),
    intent: intent('seek', { targetSeconds: 90.5 }),
  });
  assert.deepEqual(ops(plan), ['request-seek']);
  assert.equal(plan.commands[0].targetSeconds, 90.5);
});

test('malformed or out-of-range seeks fail closed instead of clamping', () => {
  for (const targetSeconds of [-1, 181, Number.NaN, Number.POSITIVE_INFINITY, '90']) {
    const plan = planDirectMediaCommands({
      authorityState: state({ phase: 'paused', playbackState: 'paused', duration: 180 }),
      binding: binding(),
      intent: intent('seek', { targetSeconds }),
    });
    assert.equal(plan.intent.accepted, false);
    assert.equal(plan.intent.reason, 'seek-target-invalid');
    assert.deepEqual(ops(plan), []);
  }
});

test('lifecycle reconciliation blocks Play and requests only an authoritative media read', () => {
  const plan = planDirectMediaCommands({
    authorityState: state({ phase: 'paused', playbackState: 'paused' }),
    binding: binding(),
    intent: intent('play'),
    lifecycleDecision: lifecycle({
      decision: 'reconcile-before-claim',
      requiresReconciliation: true,
      stateClaim: 'none',
    }),
  });
  assert.equal(plan.intent.accepted, false);
  assert.equal(plan.intent.reason, 'reconciliation-required-before-play');
  assert.deepEqual(ops(plan), ['read-media-state']);
  assert.equal(ops(plan).includes('request-play'), false);
});

test('preserve-authoritative-state lifecycle output never manufactures transport', () => {
  const plan = planDirectMediaCommands({
    authorityState: state(),
    binding: binding(),
    intent: intent('reconcile'),
    lifecycleDecision: lifecycle({ decision: 'ignore-stale-evidence', requiresReconciliation: false }),
  });
  assert.deepEqual(ops(plan), []);
});

test('stale lifecycle generation cannot trigger Play and clears supplied Media Session presentation', () => {
  const plan = planDirectMediaCommands({
    authorityState: state(),
    binding: binding(),
    intent: intent('play'),
    lifecycleDecision: lifecycle({ generation: 6 }),
    mediaSessionPolicy: sessionPolicy(),
  });
  assert.equal(plan.intent.accepted, false);
  assert.equal(plan.intent.reason, 'lifecycle-evidence-not-current');
  assert.deepEqual(ops(plan), ['clear-media-session']);
});

test('idle authority with old binding requests guarded pause and clear only', () => {
  const idle = {
    version: 1,
    generation: 9,
    songId: null,
    source: null,
    phase: 'idle',
    playbackState: 'none',
    duration: null,
    position: null,
    seek: { active: false, target: null },
    error: null,
  };
  const plan = planDirectMediaCommands({ authorityState: idle, binding: binding(), intent: { type: 'clear' } });
  assert.deepEqual(ops(plan), ['request-pause', 'clear-media-source', 'clear-media-session']);
  assert.equal(ops(plan).includes('bind-source'), false);
  assert.equal(ops(plan).includes('request-play'), false);
});

test('matching valid direct Media Session policy is passed through as one immutable sync command', () => {
  const policy = sessionPolicy();
  const plan = planDirectMediaCommands({
    authorityState: state({ phase: 'paused', playbackState: 'paused' }),
    binding: binding(),
    intent: intent('sync-source'),
    mediaSessionPolicy: policy,
  });
  assert.deepEqual(ops(plan), ['sync-media-session']);
  assert.equal(plan.commands[0].policy.songId, 'song-a');
  assert.equal(plan.commands[0].policy.generation, 7);
  assert.deepEqual(plan.commands[0].policy.actions, ['play', 'pause', 'seekto']);
  assert.notEqual(plan.commands[0].policy, policy);
});

test('same-song stale Media Session generation clears presentation instead of syncing it', () => {
  const authority = state({ generation: 8 });
  const currentBinding = binding({ generation: 8 });
  const plan = planDirectMediaCommands({
    authorityState: authority,
    binding: currentBinding,
    intent: intent('sync-source', { generation: 8 }),
    mediaSessionPolicy: sessionPolicy({ generation: 7 }),
  });
  assert.deepEqual(ops(plan), ['clear-media-session']);
  assert.equal(plan.commands[0].reason, 'media-session-policy-mismatch');
});

test('mismatched, malformed-generation or invalid Media Session policy clears stale presentation rather than syncing it', () => {
  for (const policy of [
    sessionPolicy({ songId: 'song-b' }),
    sessionPolicy({ generation: 6 }),
    sessionPolicy({ generation: '7' }),
    sessionPolicy({ generation: -1 }),
    sessionPolicy({ generation: undefined }),
    sessionPolicy({ provider: 'youtube', backgroundCapable: false }),
    sessionPolicy({ valid: false, reason: 'playback-error' }),
  ]) {
    const plan = planDirectMediaCommands({
      authorityState: state(),
      binding: binding(),
      intent: intent('sync-source'),
      mediaSessionPolicy: policy,
    });
    assert.deepEqual(ops(plan), ['clear-media-session']);
  }
});

test('reconciliation-required lifecycle prevents stale Playing Media Session policy from surviving', () => {
  const plan = planDirectMediaCommands({
    authorityState: state({ phase: 'buffering', playbackState: 'none' }),
    binding: binding(),
    intent: intent('reconcile'),
    lifecycleDecision: lifecycle({ decision: 'reconcile-before-claim', requiresReconciliation: true }),
    mediaSessionPolicy: sessionPolicy({ playbackState: 'playing' }),
  });
  assert.deepEqual(ops(plan), ['read-media-state', 'clear-media-session']);
  assert.equal(plan.commands[1].reason, 'media-session-reconciliation-required');
});

test('non-direct authority emits no direct transport commands', () => {
  const youtube = state({
    source: {
      kind: 'youtube-foreground',
      provider: 'youtube',
      playable: true,
      backgroundCapable: false,
      songId: 'song-a',
    },
  });
  const plan = planDirectMediaCommands({ authorityState: youtube, intent: intent('play') });
  assert.equal(plan.intent.accepted, false);
  assert.equal(plan.intent.reason, 'no-active-direct-source');
  assert.deepEqual(ops(plan), []);
});

test('malformed binding fails closed instead of issuing unguarded transport', () => {
  const plan = planDirectMediaCommands({
    authorityState: state(),
    binding: { songId: 'song-a', generation: 7, sourceUrl: 'javascript:bad' },
    intent: intent('play'),
  });
  assert.equal(plan.intent.accepted, false);
  assert.equal(plan.intent.reason, 'binding-invalid');
  assert.deepEqual(ops(plan), []);
});

test('output is deterministic, deeply frozen and inputs are not mutated', () => {
  const authorityState = state({ phase: 'paused', playbackState: 'paused' });
  const mediaBinding = binding();
  const requestedIntent = intent('play');
  const life = lifecycle();
  const policy = sessionPolicy();
  const before = JSON.stringify({ authorityState, mediaBinding, requestedIntent, life, policy });

  const first = planDirectMediaCommands({
    authorityState,
    binding: mediaBinding,
    intent: requestedIntent,
    lifecycleDecision: life,
    mediaSessionPolicy: policy,
  });
  const second = planDirectMediaCommands({
    authorityState,
    binding: mediaBinding,
    intent: requestedIntent,
    lifecycleDecision: life,
    mediaSessionPolicy: policy,
  });

  assert.deepEqual(first, second);
  assert.equal(deepFrozen(first), true);
  assert.equal(JSON.stringify({ authorityState, mediaBinding, requestedIntent, life, policy }), before);
});

test('planner source contains no browser/media/network/storage/timer execution', () => {
  const source = fs.readFileSync(new URL('../../src/playback/direct-media-command-planner.js', import.meta.url), 'utf8');
  for (const forbidden of [
    'navigator.mediaSession',
    'document.',
    'window.',
    '.play()',
    '.pause()',
    '.load()',
    'fetch(',
    'XMLHttpRequest',
    'localStorage',
    'sessionStorage',
    'indexedDB',
    'setTimeout(',
    'setInterval(',
  ]) {
    assert.equal(source.includes(forbidden), false, `planner must not execute ${forbidden}`);
  }
});