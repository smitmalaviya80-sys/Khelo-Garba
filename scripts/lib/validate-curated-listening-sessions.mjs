import assert from 'node:assert/strict';
import fs from 'node:fs';

const sourcePath = 'data/discovery/sets/sets-36-legacy-full-set-migration.json';
const contractPath = 'docs/product/prototypes/curated-listening-sessions.json';
const prototypePath = 'docs/product/prototypes/curated-listening-sessions.html';

const source = JSON.parse(fs.readFileSync(sourcePath, 'utf8'));
const contract = JSON.parse(fs.readFileSync(contractPath, 'utf8'));
const prototype = fs.readFileSync(prototypePath, 'utf8');

assert.equal(contract.version, 1, 'Curated-session contract version must remain explicit');
assert.equal(contract.issue, 455, 'Prototype contract must remain scoped to issue #455');
assert.equal(contract.status, 'prototype-only', 'Curated sessions must not imply production rollout');
assert.equal(contract.sourceFile, sourcePath, 'Prototype must name the canonical continuous-set source it validates against');
assert.ok(Array.isArray(contract.sessions), 'Prototype contract must expose a sessions array');
assert.equal(contract.sessions.length, 4, 'Issue #455 experiment intentionally tests exactly four session choices');

const sourceById = new Map(source.sets.map((set) => [set.id, set]));
const seenSessionIds = new Set();
const seenSetIds = new Set();

function formatDuration(seconds) {
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return `${minutes}:${String(remainder).padStart(2, '0')}`;
}

function durationBand(seconds) {
  if (seconds < 1800) return 'under 30 min';
  if (seconds <= 3600) return '30–60 min';
  return '60+ min';
}

for (const session of contract.sessions) {
  assert.ok(session.id && !seenSessionIds.has(session.id), `Session id must be unique: ${session.id}`);
  seenSessionIds.add(session.id);

  assert.ok(session.setId && !seenSetIds.has(session.setId), `One canonical set may back only one prototype choice: ${session.setId}`);
  seenSetIds.add(session.setId);

  const canonical = sourceById.get(session.setId);
  assert.ok(canonical, `Prototype set must exist in canonical continuous-set data: ${session.setId}`);
  assert.equal(session.title, canonical.title, `${session.id} title must match canonical set truth`);
  assert.deepEqual(session.artists, canonical.artists, `${session.id} artists must match canonical set truth`);
  assert.equal(session.year, canonical.year, `${session.id} year must match canonical set truth`);
  assert.deepEqual(session.categories, canonical.categories, `${session.id} categories must match canonical set truth`);
  assert.equal(session.durationSeconds, canonical.durationSeconds, `${session.id} durationSeconds must match canonical set truth`);

  if (canonical.durationSeconds == null) {
    assert.equal(session.durationLabel, 'Duration not verified', `${session.id} must expose unknown duration honestly`);
    assert.equal(session.durationBand, null, `${session.id} must not invent a duration band`);
  } else {
    assert.equal(session.durationLabel, formatDuration(canonical.durationSeconds), `${session.id} duration label must be derived from canonical seconds`);
    assert.equal(session.durationBand, durationBand(canonical.durationSeconds), `${session.id} duration band must be derived from canonical seconds`);
  }

  for (const forbidden of ['bpm', 'popularity', 'gapless', 'adFree']) {
    assert.equal(Object.hasOwn(session, forbidden), false, `${session.id} must not invent ${forbidden}`);
  }
}

const bySessionId = new Map(contract.sessions.map((session) => [session.id, session]));
const gentle = bySessionId.get('gentle-start');
const twoTaali = bySessionId.get('two-taali-practice');
const dandiya = bySessionId.get('festive-dandiya');
const devotional = bySessionId.get('devotional-listening');

assert.ok(gentle, 'Gentle-start editorial experiment must remain present');
assert.equal(gentle.editorial, true, 'Gentle-start must remain labelled as editorial judgement');
assert.equal(gentle.reviewStatus, 'pending-cultural-review', 'Gentle-start requires cultural review before production');

assert.ok(twoTaali, '2 Taali practice choice must remain present');
assert.match(twoTaali.title, /2 Taali/i, '2 Taali intent must be supported by the canonical set title');
assert.ok(twoTaali.categories.includes('be-taali'), '2 Taali intent must be supported by the canonical be-taali category');
assert.equal(twoTaali.editorial, false, '2 Taali intent is source-backed rather than an invented energy label');

assert.ok(dandiya, 'Dandiya choice must remain present');
assert.match(dandiya.title, /Dandiya/i, 'Dandiya intent must be supported by the canonical set title');
assert.ok(dandiya.categories.includes('raas-dandiya'), 'Dandiya intent must be supported by canonical raas-dandiya category data');
assert.equal(dandiya.editorial, true, 'Festive wording must remain explicitly editorial');
assert.equal(dandiya.reviewStatus, 'pending-cultural-review', 'Festive wording requires cultural review before production');

assert.ok(devotional, 'Devotional listening choice must remain present');
assert.ok(devotional.categories.includes('devotional'), 'Devotional intent must be supported by canonical category data');
assert.equal(devotional.durationSeconds, null, 'Devotional prototype candidate has no verified duration in current source data');
assert.equal(devotional.durationLabel, 'Duration not verified', 'Unknown devotional duration must stay visible as unknown');

assert.equal(contract.studyPlan?.status, 'required-before-production', 'Usability study must remain a production prerequisite');
assert.ok(contract.studyPlan?.tasks?.length >= 3, 'Prototype study plan must cover choice, expectation and escape-route tasks');
assert.ok(contract.studyPlan?.record?.length >= 3, 'Prototype study plan must record confidence and label trust rather than inventing success metrics');
assert.ok(contract.shipGate?.some((item) => /cultural review/i.test(item)), 'Ship gate must require human cultural review');
assert.ok(contract.shipGate?.some((item) => /usability evidence/i.test(item)), 'Ship gate must require actual usability evidence');
assert.ok(contract.shipGate?.some((item) => /canonical Nonstop selection/i.test(item)), 'Any later production work must reuse the canonical Nonstop selection path');

for (const principle of [
  /one verified continuous recording/i,
  /duration bands only when durationSeconds is known/i,
  /gentle and festive as editorial judgement/i,
  /direct Search and Nonstop browsing/i,
]) {
  assert.ok(contract.principles.some((item) => principle.test(item)), `Prototype truth principle missing: ${principle}`);
}

assert.match(prototype, /fetch\('\.\/curated-listening-sessions\.json'/, 'Prototype UI must render from the adjacent source-truth contract');
assert.match(prototype, /aria-live="polite"/, 'Prototype must expose selection/status changes to assistive technology');
assert.match(prototype, /prefers-reduced-motion:\s*reduce/, 'Prototype must respect reduced-motion preference');
assert.match(prototype, /data-alternative="search"/, 'Prototype must keep direct Search visible as an escape route');
assert.match(prototype, /data-alternative="nonstop"/, 'Prototype must keep full Nonstop browsing visible as an escape route');
assert.match(prototype, /No media is embedded in this prototype/, 'Prototype must state that it does not execute playback');
assert.match(prototype, /no analytics or playback action was sent/i, 'Prototype choice must not pretend to send analytics or playback intent');
assert.doesNotMatch(prototype, /<iframe\b/i, 'Prototype must not embed a provider player');
assert.doesNotMatch(prototype, /<audio\b|<video\b/i, 'Prototype must not create a parallel media playback path');
assert.doesNotMatch(prototype, /youtube\.com|youtu\.be/i, 'Prototype must not hard-code provider routes instead of canonical set identity');
assert.doesNotMatch(prototype, /window\.open\(/, 'Prototype must not open external provider windows');

console.log('✓ curated session identities, artists, years, categories and durations match canonical continuous-set data');
console.log('✓ 2 Taali and devotional intents are source-backed while gentle/festive remain explicit editorial hypotheses');
console.log('✓ unknown duration remains unknown and no BPM/popularity/gapless/ad-free claims are introduced');
console.log('✓ prototype preserves Search/Nonstop exits and does not create a second playback/provider path');
console.log('✓ cultural review and usability evidence remain required before any production rollout');
