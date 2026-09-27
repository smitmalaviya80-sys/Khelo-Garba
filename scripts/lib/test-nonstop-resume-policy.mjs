import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const policy = require('../../src/playback/nonstop-resume-policy.js');
const {
  VERSION, MAX_ENTRIES, MAX_AGE_MS, createResumeHistory,
  normaliseResumeHistory, recordNonstopObservation, classifyNonstopResume,
} = policy;

const NOW = 2_000_000_000_000;
const currentA = {
  setId: 'set-a', sourceId: 'youtube-master-a', resumeRevision: 'rev-a-1',
  durationSeconds: 7200, available: true, seekable: true,
};
const currentB = {
  setId: 'set-b', sourceId: 'youtube-master-b', resumeRevision: 'rev-b-1',
  durationSeconds: 3600, available: true, seekable: true,
};

function observation(overrides = {}) {
  return {
    setId: 'set-a', sourceId: 'youtube-master-a', resumeRevision: 'rev-a-1',
    positionSeconds: 65, durationSeconds: 7200, observedAtMs: NOW - 1000,
    eventKind: 'pause', authoritative: true, ...overrides,
  };
}

function record(history, obs, currentSet = currentA) {
  return recordNonstopObservation(history, obs, { nowMs: NOW, currentSet });
}

let history = createResumeHistory();
assert.deepEqual(history, { version: VERSION, entries: [] });
assert(Object.isFrozen(history));
assert(Object.isFrozen(history.entries));

const first = record(history, observation());
assert.equal(first.valid, true);
assert.equal(first.changed, true);
assert.equal(first.history.entries[0].positionSeconds, 65);
history = first.history;

const wrongSourceObservation = record(history, observation({ sourceId: 'wrong-source', observedAtMs: NOW - 900 }));
assert.equal(wrongSourceObservation.valid, false);
assert.equal(wrongSourceObservation.reason, 'observation-current-set-mismatch');
assert.equal(wrongSourceObservation.history.entries[0].positionSeconds, 65);

const wrongSetObservation = record(history, observation({
  setId: 'set-b', sourceId: 'youtube-master-b', resumeRevision: 'rev-b-1', observedAtMs: NOW - 900,
}));
assert.equal(wrongSetObservation.valid, false);
assert.equal(wrongSetObservation.reason, 'observation-current-set-mismatch');
assert.equal(wrongSetObservation.history.entries[0].setId, 'set-a');

const resumeA = classifyNonstopResume(history, currentA, { nowMs: NOW });
assert.equal(resumeA.valid, true);
assert.equal(resumeA.decision.reason, 'resume-available');
assert.deepEqual(resumeA.decision.resume, { available: true, positionSeconds: 65, autoplay: false });
assert.deepEqual(resumeA.decision.startOver, { available: true, positionSeconds: 0, autoplay: false });

const noLeakToB = classifyNonstopResume(history, currentB, { nowMs: NOW });
assert.equal(noLeakToB.decision.reason, 'no-record');
assert.equal(noLeakToB.decision.resume.available, false);
assert.equal(noLeakToB.decision.startOver.available, true);

assert.equal(classifyNonstopResume(history, { ...currentA, sourceId: 'youtube-master-a-v2' }, { nowMs: NOW }).decision.reason, 'source-mismatch');
assert.equal(classifyNonstopResume(history, { ...currentA, resumeRevision: 'rev-a-2' }, { nowMs: NOW }).decision.reason, 'revision-mismatch');
assert.equal(classifyNonstopResume(history, { ...currentA, durationSeconds: 7199 }, { nowMs: NOW }).decision.reason, 'duration-mismatch');

const newer = record(history, observation({ positionSeconds: 3661, observedAtMs: NOW - 500 }));
assert.equal(newer.history.entries[0].positionSeconds, 3661);
history = newer.history;
assert.equal(classifyNonstopResume(history, currentA, { nowMs: NOW }).decision.resume.positionSeconds, 3661);

const stale = record(history, observation({ positionSeconds: 5000, observedAtMs: NOW - 600 }));
assert.equal(stale.changed, false);
assert.equal(stale.reason, 'stale-observation');
assert.equal(stale.history.entries[0].positionSeconds, 3661);

const replacedCurrent = { ...currentA, sourceId: 'youtube-master-a-v2', resumeRevision: 'rev-a-2' };
const replacedBinding = record(history, observation({
  sourceId: 'youtube-master-a-v2', resumeRevision: 'rev-a-2', positionSeconds: 12, observedAtMs: NOW - 400,
}), replacedCurrent);
assert.equal(replacedBinding.valid, true);
assert.equal(replacedBinding.reason, 'binding-replaced');
assert(replacedBinding.issues.includes('source-revision-replaced'));
assert.equal(replacedBinding.history.entries[0].positionSeconds, 12);
assert.equal(classifyNonstopResume(replacedBinding.history, replacedCurrent, { nowMs: NOW }).decision.resume.positionSeconds, 12);

const zero = record(createResumeHistory(), observation({ positionSeconds: 0 }));
const zeroDecision = classifyNonstopResume(zero.history, currentA, { nowMs: NOW });
assert.equal(zeroDecision.decision.reason, 'no-progress');
assert.equal(zeroDecision.decision.resume.available, false);
assert.equal(zeroDecision.decision.startOver.available, true);

for (const badPosition of [-1, Number.NaN, Number.POSITIVE_INFINITY, 7201]) {
  const result = record(createResumeHistory(), observation({ positionSeconds: badPosition }));
  assert.equal(result.valid, false);
  assert.equal(result.history.entries.length, 0);
}

const missingObservedDuration = record(createResumeHistory(), observation({ durationSeconds: null, positionSeconds: 10 }));
assert.equal(missingObservedDuration.valid, true);
assert.equal(missingObservedDuration.history.entries[0].durationSeconds, 7200);

const durationConflict = record(createResumeHistory(), observation({ durationSeconds: 7000 }));
assert.equal(durationConflict.valid, false);
assert.equal(durationConflict.reason, 'observation-duration-mismatch');

const unavailableObservation = record(createResumeHistory(), observation(), { ...currentA, available: false });
assert.equal(unavailableObservation.valid, false);
assert.equal(unavailableObservation.reason, 'observation-current-set-unavailable');

const nonAuthoritative = record(createResumeHistory(), observation({ eventKind: 'ended', authoritative: false }));
assert.equal(nonAuthoritative.valid, false);
assert.equal(nonAuthoritative.reason, 'observation-not-authoritative');

const ended = record(createResumeHistory(), observation({ eventKind: 'ended', positionSeconds: 7100 }));
assert.equal(ended.history.entries[0].completed, true);
const completedDecision = classifyNonstopResume(ended.history, currentA, { nowMs: NOW });
assert.equal(completedDecision.decision.reason, 'completed');
assert.equal(completedDecision.decision.resume.available, false);
assert.equal(completedDecision.decision.startOver.available, true);

const lateProgressAfterEnd = record(ended.history, observation({ eventKind: 'progress', positionSeconds: 7190, observedAtMs: NOW - 500 }));
assert.equal(lateProgressAfterEnd.changed, false);
assert.equal(lateProgressAfterEnd.reason, 'completed-terminal');
assert.equal(lateProgressAfterEnd.history.entries[0].completed, true);

const restart = record(ended.history, observation({ eventKind: 'restart', positionSeconds: 0, observedAtMs: NOW - 400 }));
assert.equal(restart.history.entries[0].completed, false);
assert.equal(restart.history.entries[0].positionSeconds, 0);
const afterRestart = record(restart.history, observation({ eventKind: 'progress', positionSeconds: 30, observedAtMs: NOW - 300 }));
assert.equal(classifyNonstopResume(afterRestart.history, currentA, { nowMs: NOW }).decision.resume.positionSeconds, 30);

const unavailable = classifyNonstopResume(history, { ...currentA, available: false }, { nowMs: NOW });
assert.equal(unavailable.decision.reason, 'unavailable');
assert.equal(unavailable.decision.resume.available, false);
assert.equal(unavailable.decision.startOver.available, false);
const nonSeekable = classifyNonstopResume(history, { ...currentA, seekable: false }, { nowMs: NOW });
assert.equal(nonSeekable.decision.reason, 'not-seekable');
assert.equal(nonSeekable.decision.resume.available, false);
assert.equal(nonSeekable.decision.startOver.available, true);

let bounded = createResumeHistory();
for (let index = 0; index < 14; index += 1) {
  const setId = `set-${index}`;
  const currentSet = {
    setId, sourceId: `source-${index}`, resumeRevision: `rev-${index}`,
    durationSeconds: 1000, available: true, seekable: true,
  };
  const result = recordNonstopObservation(bounded, {
    setId, sourceId: currentSet.sourceId, resumeRevision: currentSet.resumeRevision,
    positionSeconds: index + 1, durationSeconds: 1000,
    observedAtMs: NOW - (index * 1000), eventKind: 'pause', authoritative: true,
  }, { nowMs: NOW, currentSet });
  assert.equal(result.valid, true);
  bounded = result.history;
}
assert.equal(bounded.entries.length, MAX_ENTRIES);
assert.deepEqual(bounded.entries.map((entry) => entry.setId), Array.from({ length: MAX_ENTRIES }, (_, index) => `set-${index}`));

const exactBoundaryHistory = {
  version: VERSION,
  entries: [{
    setId: 'set-old', sourceId: 'source-old', resumeRevision: 'rev-old',
    positionSeconds: 10, durationSeconds: 100, observedAtMs: NOW - MAX_AGE_MS, completed: false,
  }],
};
const expiredAtBoundary = normaliseResumeHistory(exactBoundaryHistory, { nowMs: NOW });
assert.equal(expiredAtBoundary.valid, true);
assert.equal(expiredAtBoundary.history.entries.length, 0);
assert(expiredAtBoundary.issues.includes('history-entry-expired'));
const insideBoundaryHistory = {
  version: VERSION,
  entries: [{ ...exactBoundaryHistory.entries[0], observedAtMs: NOW - MAX_AGE_MS + 1 }],
};
assert.equal(normaliseResumeHistory(insideBoundaryHistory, { nowMs: NOW }).history.entries.length, 1);

const duplicateHistory = {
  version: VERSION,
  entries: [
    { setId: 'dup', sourceId: 'src', resumeRevision: 'rev', positionSeconds: 1, durationSeconds: 100, observedAtMs: NOW - 1, completed: false },
    { setId: 'dup', sourceId: 'src', resumeRevision: 'rev', positionSeconds: 2, durationSeconds: 100, observedAtMs: NOW - 2, completed: false },
  ],
};
const duplicate = normaliseResumeHistory(duplicateHistory, { nowMs: NOW });
assert.equal(duplicate.valid, false);
assert.equal(duplicate.reason, 'history-duplicate-set');
assert.equal(duplicate.history.entries.length, 0);

for (const malformed of [
  { version: 999, entries: [] },
  { version: VERSION, entries: 'nope' },
  { version: VERSION, entries: [{ setId: 'bad' }] },
]) {
  assert.equal(normaliseResumeHistory(malformed, { nowMs: NOW }).valid, false);
}
assert.equal(normaliseResumeHistory(null, { nowMs: NOW }).valid, true);

const originalHistoryInput = {
  version: VERSION,
  entries: [{
    setId: 'immutable', sourceId: 'immutable-source', resumeRevision: 'immutable-rev',
    positionSeconds: 15, durationSeconds: 100, observedAtMs: NOW - 20, completed: false,
  }],
};
const historyBefore = structuredClone(originalHistoryInput);
const currentOther = {
  setId: 'other', sourceId: 'other-source', resumeRevision: 'other-rev',
  durationSeconds: 7200, available: true, seekable: true,
};
const observationInput = observation({ setId: 'other', sourceId: 'other-source', resumeRevision: 'other-rev' });
const observationBefore = structuredClone(observationInput);
const immutable = recordNonstopObservation(originalHistoryInput, observationInput, { nowMs: NOW, currentSet: currentOther });
assert.deepEqual(originalHistoryInput, historyBefore);
assert.deepEqual(observationInput, observationBefore);
assert(Object.isFrozen(immutable));
assert(Object.isFrozen(immutable.history));
assert(Object.isFrozen(immutable.history.entries));
assert(Object.isFrozen(immutable.history.entries[0]));

for (const decision of [resumeA.decision, noLeakToB.decision, completedDecision.decision, unavailable.decision, nonSeekable.decision]) {
  assert.equal(decision.resume.autoplay, false);
  assert.equal(decision.startOver.autoplay, false);
  assert(Object.isFrozen(decision));
  assert(Object.isFrozen(decision.resume));
  assert(Object.isFrozen(decision.startOver));
}

console.log('nonstop resume policy: ok');
