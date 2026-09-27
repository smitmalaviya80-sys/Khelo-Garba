import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import {
  isCircleEligible,
  buildCircleSchedule,
  scheduleFingerprint,
  encodeCircleCode,
  decodeCircleCode,
  getCirclePosition,
  planDriftCorrection,
  intersectOffsetWindow,
  planProbeTimes,
  measureClockOffset,
  createDateHeaderProbe,
  mulberry32,
} from '../../assets/runtime/garba-circle.js';

const root = path.resolve(import.meta.dirname, '../..');
const pass = (message) => console.log(`✓ ${message}`);

const yt = (id, durationSeconds, extra = {}) => ({
  id,
  title: id,
  genre: 'traditional',
  durationSeconds,
  youtubeId: `v-${id}`,
  playbackProvider: 'youtube',
  playbackSourceUrl: `https://www.youtube.com/watch?v=v-${id}`,
  playbackSourceType: 'verified-label-channel',
  youtubeStartSeconds: 0,
  ...extra,
});

const songs = [
  yt('song-a', 200),
  yt('song-b', 150),
  yt('song-c', 300),
  yt('song-d', 95.5),
  yt('song-e', 240),
  yt('song-f', 61),
  yt('no-duration', null),
  yt('fake-duration', 8),
  yt('reference-only', 210, { playbackSourceType: 'verified-release-track-reference' }),
  yt('unchaptered', 3600, { playbackSourceType: 'verified-unchaptered-youtube-release' }),
  yt('search-only', 200, { playbackSearchOnly: true }),
  yt('alias', 200, { presentationRole: 'catalogue-alias' }),
  { id: 'direct-audio', durationSeconds: 200, audioUrl: 'https://example.com/a.mp3' },
  { id: 'no-route', durationSeconds: 200, playbackProvider: 'spotify', playbackSourceUrl: 'https://open.spotify.com/track/x' },
];
const eligibleIds = ['song-a', 'song-b', 'song-c', 'song-d', 'song-e', 'song-f'];

// Eligibility
assert.deepEqual(songs.filter(isCircleEligible).map((song) => song.id), eligibleIds);
assert.equal(isCircleEligible(yt('url-only', 180, { youtubeId: '', playbackSourceUrl: 'https://youtu.be/abc' })), true);
assert.equal(isCircleEligible(null), false);
pass('eligibility needs a playable YouTube route and a real duration over 10s (no-duration, reference, unchaptered, search-only, alias, direct audio excluded)');

// Schedule determinism and seed variation
const ids = (schedule) => schedule.map((song) => song.id);
const scheduleA = buildCircleSchedule(songs, { seed: 12345 });
assert.deepEqual(ids(scheduleA), ids(buildCircleSchedule(songs, { seed: 12345 })));
assert.deepEqual(ids(scheduleA), ids(buildCircleSchedule([...songs].reverse(), { seed: 12345 })), 'catalogue order must not matter');
assert.deepEqual([...ids(scheduleA)].sort(), eligibleIds);
const orders = new Set(Array.from({ length: 40 }, (_, seed) => ids(buildCircleSchedule(songs, { seed })).join(',')));
assert(orders.size >= 20, `expected seeds to vary the order, got ${orders.size} distinct orders`);
pass(`schedule is deterministic for a seed, independent of catalogue order, and varies across seeds (${orders.size}/40 distinct)`);

// firstSongId placement
for (const first of eligibleIds) {
  const schedule = buildCircleSchedule(songs, { seed: 7, firstSongId: first });
  assert.equal(schedule[0].id, first);
  assert.deepEqual([...ids(schedule)].sort(), eligibleIds);
}
assert.deepEqual(ids(buildCircleSchedule(songs, { seed: 7, firstSongId: 'no-duration' })), ids(buildCircleSchedule(songs, { seed: 7 })));
assert.deepEqual(ids(buildCircleSchedule(songs, { seed: 7, firstSongId: 'missing' })), ids(buildCircleSchedule(songs, { seed: 7 })));
assert.deepEqual(buildCircleSchedule([], { seed: 1 }), []);
pass('host song is placed first when eligible; ineligible or unknown first songs leave the shuffle untouched');

// Fingerprint
const fp = scheduleFingerprint(scheduleA);
assert.match(fp, /^[0-9a-z]{1,7}$/);
assert.equal(fp, scheduleFingerprint(buildCircleSchedule(songs, { seed: 12345 })));
const variants = {
  seed: buildCircleSchedule(songs, { seed: 12346 }),
  duration: buildCircleSchedule(songs.map((song) => (song.id === 'song-c' ? { ...song, durationSeconds: 301 } : song)), { seed: 12345 }),
  video: buildCircleSchedule(songs.map((song) => (song.id === 'song-c' ? { ...song, youtubeId: 'other' } : song)), { seed: 12345 }),
  chapter: buildCircleSchedule(songs.map((song) => (song.id === 'song-c' ? { ...song, youtubeStartSeconds: 30 } : song)), { seed: 12345 }),
  added: buildCircleSchedule([...songs, yt('song-g', 180)], { seed: 12345 }),
  removed: buildCircleSchedule(songs.filter((song) => song.id !== 'song-f'), { seed: 12345 }),
};
for (const [name, schedule] of Object.entries(variants)) {
  assert.notEqual(scheduleFingerprint(schedule), fp, `fingerprint must change when ${name} changes`);
}
assert.equal(scheduleFingerprint(scheduleA), scheduleFingerprint(scheduleA.map((song) => ({ ...song, title: 'Renamed' }))));
pass('fingerprint is stable, ignores presentation-only fields, and changes with seed, duration, video, chapter start, added or removed songs');

// Real catalogue: the shipped schedule must be usable and the link must fit the QR encoder
const catalogue = JSON.parse(await readFile(path.join(root, 'data/songs.json'), 'utf8'))
  .filter((song) => String(song?.presentationRole || 'catalogue') === 'catalogue');
const realSchedule = buildCircleSchedule(catalogue, { seed: 0xdeadbeef });
assert(realSchedule.length > 50, `expected a real circle schedule, got ${realSchedule.length}`);
assert(realSchedule.every((song) => song.durationSeconds > 10));
const longestId = catalogue.reduce((max, song) => Math.max(max, song.id.length), 0);
const longestCode = encodeCircleCode({ seed: 0xffffffff, startMs: Date.UTC(2099, 11, 31), fingerprint: 'zzzzzz', firstSongId: 'a'.repeat(longestId) });
assert(longestCode && `https://playgarba.com/?circle=${longestCode}`.length <= 213, 'longest circle link must fit QR version 10-M');
pass(`real catalogue yields ${realSchedule.length} circle songs; the longest possible link is ${`https://playgarba.com/?circle=${longestCode}`.length} characters`);

// Code encode / decode
const circle = { seed: 3141592653, startMs: Date.UTC(2026, 8, 25, 18, 30, 0, 123), firstSongId: 'song-c', fingerprint: fp };
const code = encodeCircleCode(circle);
assert.match(code, /^1\.[0-9a-z]+\.[0-9a-z]+\.[0-9a-z]+\.[0-9a-z]{3}\.song-c$/);
assert.deepEqual(decodeCircleCode(code), circle);
assert.equal(new URLSearchParams(`circle=${code}`).get('circle'), code, 'code must survive a query string unescaped');
assert.equal(encodeURIComponent(code), code, 'code must be URL-safe without escaping');
for (const seed of [0, 1, 35, 36, 0xffffffff]) {
  const value = { ...circle, seed };
  assert.deepEqual(decodeCircleCode(encodeCircleCode(value)), value);
}
pass(`code round-trips (${code.length} chars: ${code})`);

const [version, seed36, start36, fp36, check, first] = code.split('.');
const flipped = (text, index = 0) => text.slice(0, index) + (text[index] === '1' ? '2' : '1') + text.slice(index + 1);
const malformed = [
  '', 'garbage', null, undefined, 42, {}, `${code}.extra`, code.slice(0, -1), code.toUpperCase(),
  ['2', seed36, start36, fp36, check, first].join('.'),
  [version, flipped(seed36), start36, fp36, check, first].join('.'),
  [version, seed36, flipped(start36, start36.length - 1), fp36, check, first].join('.'),
  [version, seed36, start36, flipped(fp36), check, first].join('.'),
  [version, seed36, start36, fp36, flipped(check), first].join('.'),
  [version, seed36, start36, fp36, check, 'song-d'].join('.'),
  [version, `0${seed36}`, start36, fp36, check, first].join('.'),
  [version, seed36, start36, fp36, check, 'Song_C'].join('.'),
  [version, seed36, start36, fp36, check, ''].join('.'),
  [version, 'zzzzzzz', start36, fp36, check, first].join('.'),
  `${code}\n`,
  ` ${code}`,
  code.replace('.song-c', '.song-c%20'),
  'x'.repeat(500),
];
for (const value of malformed) assert.equal(decodeCircleCode(value), null, `must reject ${JSON.stringify(value)}`);
assert.equal(encodeCircleCode({ ...circle, seed: -1 }), null);
assert.equal(encodeCircleCode({ ...circle, seed: 1.5 }), null);
assert.equal(encodeCircleCode({ ...circle, startMs: 0 }), null);
assert.equal(encodeCircleCode({ ...circle, firstSongId: 'bad id' }), null);
assert.equal(encodeCircleCode({ ...circle, fingerprint: 'TOOLONGFP' }), null);
pass(`decoder rejects ${malformed.length} malformed, tampered, truncated or non-canonical codes; encoder rejects invalid fields`);

// Position math
const posSchedule = [yt('p1', 100), yt('p2', 50.5), yt('p3', 200)];
const total = 350.5;
const start = Date.UTC(2026, 8, 25, 12);
const at = (seconds) => getCirclePosition(posSchedule, start, start + seconds * 1000);
const near = (actual, expected, label) => assert(Math.abs(actual - expected) < 1e-6, `${label}: ${actual} != ${expected}`);
const cases = [
  [0, 'p1', 0, 100, 'p2'],
  [99.999, 'p1', 99.999, 0.001, 'p2'],
  [100, 'p2', 0, 50.5, 'p3'],
  [150.25, 'p2', 50.25, 0.25, 'p3'],
  [150.5, 'p3', 0, 200, 'p1'],
  [350.4, 'p3', 199.9, 0.1, 'p1'],
  [total, 'p1', 0, 100, 'p2'],
  [total * 3 + 120, 'p2', 20, 30.5, 'p3'],
];
for (const [seconds, songId, offset, remaining, nextId] of cases) {
  const position = at(seconds);
  assert.equal(position.song.id, songId, `song at ${seconds}s`);
  near(position.offsetSeconds, offset, `offset at ${seconds}s`);
  near(position.remainingSeconds, remaining, `remaining at ${seconds}s`);
  assert.equal(position.nextSong.id, nextId, `next at ${seconds}s`);
  assert.equal(position.started, true);
}
assert.equal(at(total * 3 + 120).cycle, 3);
const early = at(-12.5);
assert.equal(early.started, false);
assert.equal(early.song.id, 'p1');
assert.equal(early.offsetSeconds, 0);
near(early.startsInSeconds, 12.5, 'startsIn');
assert.equal(getCirclePosition([], start, start), null);
assert.equal(getCirclePosition(posSchedule, NaN, start), null);
assert.equal(getCirclePosition([yt('bad', 0)], start, start), null);
const single = getCirclePosition([yt('only', 60)], start, start + 61000);
assert.equal(single.song.id, 'only');
near(single.offsetSeconds, 1, 'single-song loop');
assert.equal(single.nextSong.id, 'only');
pass('position math is exact across song boundaries, loop wrap, multiple cycles, single-song loops and before the start');

// Unplayable songs: their slot is filled by the following playable songs, from the slot start
const withUnplayable = (seconds, ids) => getCirclePosition(posSchedule, start, start + seconds * 1000, { unplayable: new Set(ids) });
{
  const sub = withUnplayable(110, ['p2']);
  assert.equal(sub.song.id, 'p3');
  assert.equal(sub.substituteFor, 'p2');
  near(sub.offsetSeconds, 10, 'substitute offset');
  near(sub.remainingSeconds, 40.5, 'substitute ends with the slot');
  const resumed = withUnplayable(155.5, ['p2']);
  assert.equal(resumed.song.id, 'p3');
  assert.equal(resumed.substituteFor, null);
  near(resumed.offsetSeconds, 5, 'schedule resumes after the slot');
  const skipTwo = withUnplayable(110, ['p2', 'p3']);
  assert.equal(skipTwo.song.id, 'p1');
  near(skipTwo.offsetSeconds, 10, 'skips every unplayable song');
  const chained = withUnplayable(70, ['p1']);
  assert.equal(chained.song.id, 'p3', 'a short substitute hands over to the next one');
  near(chained.offsetSeconds, 19.5, 'chained substitute offset');
  near(chained.remainingSeconds, 30, 'chained substitute ends with the slot');
  const none = withUnplayable(20, ['p1', 'p2', 'p3']);
  assert.equal(none.song, null);
  assert.equal(none.substituteFor, 'p1');
  near(none.remainingSeconds, 80, 'silent slot still reports when it ends');
  assert.deepEqual(withUnplayable(20, []), at(20));
  assert.equal(at(20).substituteFor, null);
}
pass('unplayable songs are filled deterministically by the following playable songs until their slot ends');

// Drift planning
assert.deepEqual(planDriftCorrection({ expectedSeconds: 50, actualSeconds: 50.2 }), { action: 'none', targetSeconds: null, driftSeconds: planDriftCorrection({ expectedSeconds: 50, actualSeconds: 50.2 }).driftSeconds });
assert.equal(planDriftCorrection({ expectedSeconds: 50, actualSeconds: 49.7 }).action, 'none');
const behind = planDriftCorrection({ expectedSeconds: 50, actualSeconds: 49 });
assert.equal(behind.action, 'seek');
near(behind.targetSeconds, 50, 'behind target');
near(behind.driftSeconds, -1, 'behind drift');
const ahead = planDriftCorrection({ expectedSeconds: 50, actualSeconds: 50.5 });
assert.equal(ahead.action, 'seek');
near(ahead.driftSeconds, 0.5, 'ahead drift');
near(planDriftCorrection({ expectedSeconds: 50, actualSeconds: 45, leadSeconds: 0.2 }).targetSeconds, 50.2, 'lead');
near(planDriftCorrection({ expectedSeconds: 50, actualSeconds: 45, leadSeconds: -3 }).targetSeconds, 50, 'negative lead ignored');
assert.equal(planDriftCorrection({ expectedSeconds: 50, actualSeconds: 50.5, thresholdSeconds: 0.8 }).action, 'none');
assert.equal(planDriftCorrection({ expectedSeconds: NaN, actualSeconds: 1 }).action, 'none');
pass('drift planning seeks only past the threshold, in both directions, with an optional non-negative lead');

// Offset window intersection
const window1 = intersectOffsetWindow([{ sentAt: 1000, receivedAt: 1100, serverMs: 5400 }]);
assert.equal(window1.lo, 5000 - 1100);
assert.equal(window1.hi, 6000 - 1000);
assert.equal(window1.consistent, true);
assert.equal(intersectOffsetWindow([]), null);
assert.equal(intersectOffsetWindow([{ sentAt: NaN, receivedAt: 1, serverMs: 1 }]), null);
const inconsistent = intersectOffsetWindow([
  { sentAt: 1000, receivedAt: 1050, serverMs: 5000 },
  { sentAt: 1100, receivedAt: 1150, serverMs: 9000 },
]);
assert.equal(inconsistent.consistent, false);
assert.equal(inconsistent.uncertaintyMs, Infinity);
pass('offset window intersection is exact, ignores invalid samples and flags contradictions');

const plan = planProbeTimes({ lo: -500, hi: 300, oneWayMs: 40, afterMs: 10_000, count: 3 });
assert.equal(plan.length, 3);
assert(plan.every((time) => time >= 10_000));
for (const [index, time] of plan.entries()) {
  const target = -500 + ((3 - index) * 800) / 4;
  assert.equal((time + 40 + target) % 1000, 0, 'each probe must aim a server second boundary at its target offset');
}
assert.deepEqual(planProbeTimes({ lo: 5, hi: 5, afterMs: 0 }), []);
pass('probe planner aims each probe at a server second boundary inside the window');

// Simulated clock sync with virtual time
function createVirtualClock(start = 1_000_000) {
  let current = start;
  const timers = [];
  let sequence = 0;
  const schedule = (delay, resolve) => timers.push({ at: current + Math.max(0, delay), resolve, order: sequence += 1 });
  return {
    now: () => current,
    sleep: (ms) => new Promise((resolve) => schedule(ms, resolve)),
    after: (ms, value) => new Promise((resolve) => schedule(ms, () => resolve(value))),
    async run(promise) {
      let done = false;
      let result;
      let failure;
      promise.then((value) => { done = true; result = value; }, (error) => { done = true; failure = error; });
      while (!done) {
        await new Promise((resolve) => setImmediate(resolve));
        if (done) break;
        if (!timers.length) throw new Error('virtual clock stalled');
        timers.sort((a, b) => a.at - b.at || a.order - b.order);
        const next = timers.shift();
        current = next.at;
        next.resolve();
      }
      if (failure) throw failure;
      return result;
    },
  };
}

function simulatedServer(clock, { offsetMs, random, upMs, downMs, stale = null }) {
  return async () => {
    const up = upMs(random);
    const down = downMs(random);
    await clock.after(up);
    const serverNow = clock.now() + offsetMs;
    const stamped = stale ? stale(serverNow) : serverNow;
    // Date headers carry whole seconds.
    const header = new Date(Math.floor(stamped / 1000) * 1000).toUTCString();
    await clock.after(down);
    return Date.parse(header);
  };
}

const uniform = (min, max) => (random) => min + random() * (max - min);
const scenarios = [];
for (const offsetMs of [-3700, 12345, 0, 999, -1, 500]) {
  for (const [label, upMs, downMs, limit] of [
    ['wide asymmetric 20-400ms', uniform(10, 300), uniform(10, 100), null],
    ['wide 20-400ms', uniform(10, 200), uniform(10, 200), null],
    ['modest 20-80ms', uniform(10, 40), uniform(10, 40), 150],
  ]) {
    for (let run = 0; run < 25; run += 1) scenarios.push({ offsetMs, label, upMs, downMs, limit, seed: run * 7919 + offsetMs });
  }
}
const stats = new Map();
for (const scenario of scenarios) {
  const clock = createVirtualClock(1_000_000 + (scenario.seed % 997) * 13);
  const random = mulberry32(scenario.seed >>> 0);
  const probe = simulatedServer(clock, { offsetMs: scenario.offsetMs, random, upMs: scenario.upMs, downMs: scenario.downMs });
  const startedAt = clock.now();
  const result = await clock.run(measureClockOffset({ probe, now: clock.now, sleep: clock.sleep }));
  const elapsed = clock.now() - startedAt;
  const error = Math.abs(result.offsetMs - scenario.offsetMs);
  assert.equal(result.reliable, true, `${scenario.label} offset ${scenario.offsetMs} must be reliable`);
  assert(error <= result.uncertaintyMs, `${scenario.label} offset ${scenario.offsetMs}: error ${error}ms exceeds reported ±${result.uncertaintyMs}ms`);
  if (scenario.limit) assert(result.uncertaintyMs < scenario.limit, `${scenario.label}: uncertainty ${result.uncertaintyMs}ms is not below ${scenario.limit}ms`);
  assert(result.probes <= 12, `too many probes: ${result.probes}`);
  assert(elapsed < 4500, `sync took ${elapsed}ms`);
  const entry = stats.get(scenario.label) || { runs: 0, maxError: 0, maxUncertainty: 0, sumUncertainty: 0, maxElapsed: 0, maxProbes: 0 };
  entry.runs += 1;
  entry.maxError = Math.max(entry.maxError, error);
  entry.maxUncertainty = Math.max(entry.maxUncertainty, result.uncertaintyMs);
  entry.sumUncertainty += result.uncertaintyMs;
  entry.maxElapsed = Math.max(entry.maxElapsed, elapsed);
  entry.maxProbes = Math.max(entry.maxProbes, result.probes);
  stats.set(scenario.label, entry);
}
for (const [label, entry] of stats) {
  pass(`clock sync, ${label}, offsets −3700/0/+12345/±edge ms, ${entry.runs} runs: truth always inside ±uncertainty; max error ${entry.maxError.toFixed(1)}ms, mean ±${(entry.sumUncertainty / entry.runs).toFixed(1)}ms, worst ±${entry.maxUncertainty.toFixed(1)}ms, ≤${entry.maxProbes} probes, ≤${entry.maxElapsed.toFixed(0)}ms`);
}

// Inconsistent server (clock jumps between probes) falls back instead of trusting a bad window
{
  const clock = createVirtualClock();
  let calls = 0;
  const probe = async () => {
    calls += 1;
    await clock.after(30);
    const jump = calls % 2 ? 0 : 60_000;
    const value = Math.floor((clock.now() + jump) / 1000) * 1000;
    await clock.after(30);
    return value;
  };
  const result = await clock.run(measureClockOffset({ probe, now: clock.now, sleep: clock.sleep }));
  assert.equal(result.reliable, false);
  assert.equal(result.reason, 'inconsistent');
  assert.equal(result.offsetMs, 0);
  assert.equal(result.uncertaintyMs, Infinity);
  pass(`contradictory Date headers are detected, retried once, then reported as unreliable (offset 0, ${calls} probes)`);
}

// A server that is inconsistent only once recovers on retry
{
  const clock = createVirtualClock();
  let calls = 0;
  const probe = async () => {
    calls += 1;
    await clock.after(25);
    const value = Math.floor((clock.now() + 2500 + (calls === 2 ? 30_000 : 0)) / 1000) * 1000;
    await clock.after(25);
    return value;
  };
  const result = await clock.run(measureClockOffset({ probe, now: clock.now, sleep: clock.sleep }));
  assert.equal(result.reliable, true);
  assert(Math.abs(result.offsetMs - 2500) <= result.uncertaintyMs);
  pass(`one contradictory probe triggers a clean retry that still measures the true offset (±${result.uncertaintyMs.toFixed(1)}ms)`);
}

// Failing probes
{
  const clock = createVirtualClock();
  const probe = async () => { await clock.after(20); throw new Error('offline'); };
  const result = await clock.run(measureClockOffset({ probe, now: clock.now, sleep: clock.sleep, maxProbes: 4 }));
  assert.equal(result.reliable, false);
  assert.equal(result.reason, 'no-date-header');
  assert.equal(result.offsetMs, 0);
  pass('probes that never return a Date header fall back to offset 0 and are flagged unreliable');
}

// Browser probe adapter
{
  const calls = [];
  const probe = createDateHeaderProbe({
    url: './robots.txt',
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return { headers: new Map([['date', 'Fri, 25 Sep 2026 18:30:05 GMT']]) };
    },
  });
  assert.equal(await probe(), Date.UTC(2026, 8, 25, 18, 30, 5));
  assert.match(calls[0].url, /^\.\/robots\.txt\?circle-clock=[0-9a-z]+$/);
  assert.deepEqual(calls[0].options, { method: 'HEAD', cache: 'no-store' });
  const missing = createDateHeaderProbe({ fetchImpl: async () => ({ headers: new Map() }) });
  await assert.rejects(missing());
  pass('browser probe sends an uncached HEAD with a unique query and parses the Date header');
}

console.log('garba circle tests passed');
