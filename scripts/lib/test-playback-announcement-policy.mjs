import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const policy = require('../../src/accessibility/playback-announcement-policy.js');

const { createAnnouncementState, reducePlaybackAnnouncement, formatSpokenProgress } = policy;

function step(state, event) {
  return reducePlaybackAnnouncement(state, event);
}

function select(state, songId = 'song-a', generation = 1, title = 'Song A') {
  return step(state, { type: 'select', songId, generation, title });
}

function snapshot(state, playbackState, songId = 'song-a', generation = 1) {
  return step(state, { type: 'snapshot', songId, generation, playbackState, authoritative: true });
}

let state = createAnnouncementState();
assert(Object.isFrozen(state));
assert.equal(state.current, null);

const selected = select(state);
assert.equal(selected.valid, true);
assert.equal(selected.announcement.message, 'Selected Song A.');
assert.equal(selected.state.current.songId, 'song-a');
assert(Object.isFrozen(selected));
assert(Object.isFrozen(selected.state));
assert(Object.isFrozen(selected.announcement));
state = selected.state;

const loading = snapshot(state, 'loading');
assert.equal(loading.announcement.message, 'Loading Song A.');
state = loading.state;
const playing = snapshot(state, 'playing');
assert.equal(playing.announcement.message, 'Playing Song A.');
state = playing.state;

const duplicatePlaying = snapshot(state, 'playing');
assert.equal(duplicatePlaying.valid, true);
assert.equal(duplicatePlaying.announcement, null);
assert.equal(duplicatePlaying.reason, 'duplicate-playback-state');

const buffering = snapshot(state, 'buffering');
assert.equal(buffering.announcement.message, 'Buffering Song A.');
state = buffering.state;
const duplicateBuffering = snapshot(state, 'buffering');
assert.equal(duplicateBuffering.announcement, null);

const resumed = snapshot(state, 'playing');
assert.equal(resumed.announcement.message, 'Playing Song A.');
state = resumed.state;
const paused = snapshot(state, 'paused');
assert.equal(paused.announcement.message, 'Paused Song A.');
state = paused.state;
assert.equal(snapshot(state, 'paused').announcement, null);
const ended = snapshot(state, 'ended');
assert.equal(ended.announcement.message, 'Song A ended.');
state = ended.state;
assert.equal(snapshot(state, 'ended').announcement, null);

const untrustedPlaying = step(state, {
  type: 'snapshot', songId: 'song-a', generation: 1, playbackState: 'playing', authoritative: false,
});
assert.equal(untrustedPlaying.valid, false);
assert.equal(untrustedPlaying.announcement, null);
assert.equal(untrustedPlaying.reason, 'snapshot-not-authoritative');

const stale = step(state, {
  type: 'snapshot', songId: 'song-a', generation: 0, playbackState: 'playing', authoritative: true,
});
assert.equal(stale.valid, false);
assert.equal(stale.announcement, null);
assert.equal(stale.reason, 'stale-generation');

const nextSelected = select(state, 'song-b', 2, 'Song B');
assert.equal(nextSelected.announcement.message, 'Selected Song B.');
assert.equal(nextSelected.state.lastFailureKey, null);
assert.equal(nextSelected.state.lastPlaybackState, 'selected');
state = nextSelected.state;

const lateA = step(state, {
  type: 'snapshot', songId: 'song-a', generation: 1, playbackState: 'playing', authoritative: true,
});
assert.equal(lateA.valid, false);
assert.equal(lateA.announcement, null);
assert.equal(lateA.reason, 'stale-generation');

const sameGenerationOtherSong = select(state, 'song-c', 2, 'Song C');
assert.equal(sameGenerationOtherSong.valid, false);
assert.equal(sameGenerationOtherSong.reason, 'generation-identity-collision');
assert.equal(sameGenerationOtherSong.announcement, null);

const failure = step(state, {
  type: 'failure', songId: 'song-b', generation: 2, authoritative: true,
  failureKind: 'provider-failed', listenerMessage: 'This recording could not start. Choose another recording.',
  error: 'INTERNAL_TOKEN=secret', stack: 'Error: secret', providerDiagnostic: 'HTTP 500 private detail',
});
assert.equal(failure.valid, true);
assert.equal(failure.announcement.message, 'This recording could not start. Choose another recording.');
assert(!JSON.stringify(failure).includes('INTERNAL_TOKEN'));
assert(!JSON.stringify(failure).includes('HTTP 500'));
state = failure.state;

const duplicateFailure = step(state, {
  type: 'failure', songId: 'song-b', generation: 2, authoritative: true,
  failureKind: 'provider-failed', listenerMessage: 'A different duplicate message must not chatter.',
});
assert.equal(duplicateFailure.announcement, null);
assert.equal(duplicateFailure.reason, 'duplicate-failure');

const retry = step(state, { type: 'retry', songId: 'song-b', generation: 2 });
assert.equal(retry.announcement, null);
assert.equal(retry.state.lastFailureKey, null);
state = retry.state;
const failureAfterRetry = step(state, {
  type: 'failure', songId: 'song-b', generation: 2, authoritative: true, failureKind: 'provider-failed',
});
assert.equal(failureAfterRetry.announcement.message, 'This recording could not play here.');
state = failureAfterRetry.state;
const recovery = step(state, { type: 'recovery', songId: 'song-b', generation: 2 });
assert.equal(recovery.announcement, null);
assert.equal(recovery.state.lastFailureKey, null);
state = recovery.state;

const blocked = step(state, {
  type: 'failure', songId: 'song-b', generation: 2, authoritative: true, failureKind: 'autoplay-blocked',
});
assert.equal(blocked.announcement.message, 'Playback needs a tap or key press to start.');
assert.equal(blocked.state.lastPlaybackState, 'blocked');
assert.equal(blocked.announcement.politeness, 'polite');
state = blocked.state;

const rawOnlyFailure = step(state, {
  type: 'failure', songId: 'song-b', generation: 2, authoritative: true, failureKind: 'api-timeout',
  error: 'Provider stack trace should never be copied',
});
assert.equal(rawOnlyFailure.announcement.message, 'The player could not start. Try again.');
assert(!rawOnlyFailure.announcement.message.includes('Provider'));

assert.equal(formatSpokenProgress({ currentTime: 0, duration: 200 }), '0:00 of 3:20');
assert.equal(formatSpokenProgress({ currentTime: 65, duration: 200 }), '1:05 of 3:20');
assert.equal(formatSpokenProgress({ currentTime: 3661, duration: 7322 }), '1:01:01 of 2:02:02');
assert.equal(formatSpokenProgress({ currentTime: 88 }), '1:28 elapsed');
assert.equal(formatSpokenProgress({ currentTime: 250, duration: 200 }), '3:20 of 3:20');
for (const bad of [-1, Number.NaN, Number.POSITIVE_INFINITY]) {
  assert.equal(formatSpokenProgress({ currentTime: bad, duration: 200 }), null);
}
assert.equal(formatSpokenProgress({ currentTime: 10, duration: -1 }), null);
assert.equal(formatSpokenProgress({ currentTime: 10, duration: Number.NaN }), null);

const explicitProgress = step(state, {
  type: 'progress-read', songId: 'song-b', generation: 2, currentTime: 65, duration: 200,
});
assert.equal(explicitProgress.announcement.message, '1:05 of 3:20');
assert.equal(explicitProgress.announcement.action, 'announce-progress');

let pollState = state;
for (let tick = 0; tick < 60; tick += 1) {
  const polled = step(pollState, {
    type: 'progress-poll', songId: 'song-b', generation: 2, currentTime: tick * 0.35, duration: 200,
  });
  assert.equal(polled.valid, true);
  assert.equal(polled.announcement, null);
  assert.equal(polled.reason, 'progress-poll-silent');
  pollState = polled.state;
}

const malformedSnapshot = step(state, { type: 'snapshot', songId: '', generation: 2, playbackState: 'playing', authoritative: true });
assert.equal(malformedSnapshot.valid, false);
assert.equal(malformedSnapshot.announcement, null);

const invalidState = step(state, {
  type: 'snapshot', songId: 'song-b', generation: 2, playbackState: 'teleporting', authoritative: true,
});
assert.equal(invalidState.valid, false);
assert.equal(invalidState.announcement, null);

const eventInput = {
  type: 'failure', songId: 'song-b', generation: 2, authoritative: true,
  failureKind: 'offline', listenerMessage: 'You are offline. Reconnect to continue.',
};
const eventBefore = structuredClone(eventInput);
const stateBefore = structuredClone(state);
const immutable = step(state, eventInput);
assert.deepEqual(eventInput, eventBefore);
assert.deepEqual(state, stateBefore);
assert(Object.isFrozen(immutable));
assert(Object.isFrozen(immutable.state));
assert(Object.isFrozen(immutable.state.current));
assert(Object.isFrozen(immutable.announcement));

const malformedPrevious = { version: 1, current: { songId: '', generation: -1 } };
const malformedPreviousResult = step(malformedPrevious, { type: 'progress-poll', songId: 'song-b', generation: 2 });
assert.equal(malformedPreviousResult.valid, false);
assert.equal(malformedPreviousResult.announcement, null);
assert.equal(malformedPreviousResult.reason, 'no-current-identity');

console.log('playback announcement policy: ok');
