import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  BREAKDOWN_MIN_SESSIONS,
  HEARTBEAT_INTERVAL_MS,
  LIVE_WINDOW_MS,
  LISTENING_BUCKET_MS,
  MAX_HEARTBEAT_PLAYED_MS,
  aggregateListeningTime,
  aggregatePresence,
} from '../../src/pga/presence/model.js';

const modelPath = new URL('../../src/pga/presence/model.js', import.meta.url);
const readmePath = new URL('../../src/pga/presence/README.md', import.meta.url);
const workflowPath = new URL('../../.github/workflows/pga-presence-validate.yml', import.meta.url);

const modelSource = fs.readFileSync(modelPath, 'utf8');
const readme = fs.readFileSync(readmePath, 'utf8');
const workflow = fs.readFileSync(workflowPath, 'utf8');

assert.equal(HEARTBEAT_INTERVAL_MS, 45_000, 'canonical heartbeat cadence changed');
assert.equal(LIVE_WINDOW_MS, 120_000, 'canonical live expiry changed');
assert.equal(BREAKDOWN_MIN_SESSIONS, 3, 'canonical privacy threshold changed');
assert.equal(LISTENING_BUCKET_MS, 60_000, 'canonical listening bucket changed');
assert.equal(MAX_HEARTBEAT_PLAYED_MS, 60_000, 'canonical listening cap changed');

const now = 2_000_000_000_000;
const available = aggregatePresence([
  { sessionKey: 'a', acceptedAt: now - 1_000, playbackState: 'playing', surface: 'player' },
  { sessionKey: 'a', acceptedAt: now - 500, playbackState: 'paused', surface: 'explore' },
  { sessionKey: 'b', acceptedAt: now - 120_000, playbackState: 'playing', surface: 'player' },
  { sessionKey: 'expired', acceptedAt: now - 120_001, playbackState: 'playing', surface: 'player' },
], { nowMs: now });
assert.equal(available.liveNow, 2, 'latest-per-session dedupe/expiry contract changed');
assert.equal(available.listeningNow, 1, 'confirmed-listening contract changed');
assert.equal(available.browsingNow, 1, 'browsing contract changed');

const unavailable = aggregatePresence({ status: 'error', heartbeats: [] }, { nowMs: now });
assert.equal(unavailable.liveNow, null, 'failed presence evidence must not become fake zero');
assert.equal(unavailable.listeningNow, null, 'failed listening evidence must not become fake zero');

const privacy = aggregatePresence([
  { sessionKey: '1', acceptedAt: now, surface: 'player' },
  { sessionKey: '2', acceptedAt: now, surface: 'player' },
  { sessionKey: '3', acceptedAt: now, surface: 'player' },
  { sessionKey: '4', acceptedAt: now, surface: 'explore' },
], { nowMs: now });
assert.deepEqual(privacy.breakdowns.surface.rows, [{ key: 'player', count: 3 }]);
assert.equal(privacy.breakdowns.surface.suppressedSessions, 1);

const listened = aggregateListeningTime([
  { sessionKey: 'one', acceptedAt: now, eventId: '1', playedMsSincePreviousHeartbeat: 45_000 },
  { sessionKey: 'one', acceptedAt: now + 20_000, eventId: '2', playedMsSincePreviousHeartbeat: 45_000 },
]);
assert.equal(listened.totalMs, 60_000, 'same-session minute listening cap changed');

const forbidden = [
  /\bfetch\s*\(/,
  /XMLHttpRequest/,
  /localStorage/,
  /sessionStorage/,
  /document\./,
  /window\./,
  /process\.env/,
  /CLOUDFLARE[_A-Z]*SECRET/i,
  /ACCESS[_A-Z]*SECRET/i,
  /ANALYTICS[_A-Z]*TOKEN/i,
  /D1[_A-Z]*TOKEN/i,
];
for (const pattern of forbidden) {
  assert.doesNotMatch(modelSource, pattern, `pure presence model contains forbidden side effect/secret marker: ${pattern}`);
}

for (const marker of [
  '45 seconds',
  '120 seconds',
  '3 sessions',
  'Live now',
  'Listening now',
  'Browsing now',
  'null',
  'admin-worker.js',
  '#840',
]) {
  assert.match(readme, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'), `presence README missing contract marker: ${marker}`);
}

assert.match(workflow, /node --test src\/pga\/presence\/tests\/presence\.test\.mjs/, 'workflow must run presence fixtures');
assert.match(workflow, /node scripts\/lib\/validate-pga-presence\.mjs/, 'workflow must run presence contract validator');
assert.match(workflow, /node-version:\s*22/, 'workflow must pin Node 22');

console.log('PGA presence contract validation passed.');
