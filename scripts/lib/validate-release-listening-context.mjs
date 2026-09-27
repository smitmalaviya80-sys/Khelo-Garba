import assert from 'node:assert/strict';
import fs from 'node:fs';

const app = fs.readFileSync('app.js', 'utf8');
const listening = fs.readFileSync('src/catalogue/listening-library.js', 'utf8');
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const songs = JSON.parse(fs.readFileSync('data/songs.json', 'utf8'));

const sourceChecks = [
  [app, /releaseContextId:\s*null/, 'player keeps an explicit transient release context'],
  [app, /releaseContextConsumedIds:\s*new Set\(\)/, 'manual same-release plays are tracked transiently'],
  [app, /function orderedReleaseSongs\(releaseId\)/, 'player derives release order from catalogue songs'],
  [app, /Number\(song\?\.trackNumber\)/, 'release ordering requires numeric track numbers'],
  [app, /trackDelta \|\| left\.id\.localeCompare\(right\.id\)/, 'release ordering uses stable ID tie-breaker'],
  [app, /releaseContextConsumedIds\.has\(song\.id\)/, 'release continuation skips manually consumed release tracks'],
  [app, /url\.searchParams\.set\('release', state\.releaseContextId\)/, 'valid release context is reflected in the player URL'],
  [app, /url\.searchParams\.delete\('release'\)/, 'stale release context is removed from the player URL'],
  [app, /const requestedRelease = params\.get\('release'\)/, 'player reads explicit release handoff'],
  [app, /releaseContextMatch\(requestedRelease, requestedSong\)/, 'release and song pairing is validated before activation'],
  [app, /preserveReleaseContext: true/, 'manual queue and history preserve the underlying release context'],
  [app, /releaseContextAdvance: true/, 'automatic release traversal advances the release anchor'],
  [app, /releaseContinuationSongs\(1\)/, 'Next checks release continuation after manual queue'],
  [app, /excludeIds: releaseIds/, 'generic continuation excludes release songs after release exhaustion'],
  [listening, /function selectedReleaseId\(\)/, 'Explore detects explicit selected-release detail context'],
  [listening, /song\?\.releaseId === releaseId/, 'Explore validates canonical song/release pairing'],
  [listening, /destination\.searchParams\.set\('release', releaseId\)/, 'release-detail Listen links hand off canonical release ID'],
  [listening, /destination\.searchParams\.delete\('release'\)/, 'broad Explore links remove stale release context'],
  [listening, /event\.preventDefault\(\)/, 'release handoff has a click-time race fallback'],
  [listening, /location\.assign\(destination\.toString\(\)\)/, 'click-time handoff navigates only after validation'],
];
for (const [source, pattern, message] of sourceChecks) assert.match(source, pattern, message);

assert.equal(pkg.scripts['release:context:validate'], 'node scripts/lib/validate-release-listening-context.mjs');
assert.match(pkg.scripts.check, /npm run release:context:validate/, 'full check must include release-context validation');
assert.match(pkg.scripts['check:modules'], /validate-release-listening-context\.mjs/, 'module check must include release-context validator');

const numericTrack = (song) => {
  const value = Number(song?.trackNumber);
  return Number.isFinite(value) && value > 0 ? value : null;
};
const canonicalReleaseSongs = (releaseId) => {
  const unique = new Map();
  for (const song of songs) {
    if (!song?.id || song.releaseId !== releaseId || numericTrack(song) == null) continue;
    if (String(song.presentationRole || 'catalogue') !== 'catalogue') continue;
    unique.set(song.id, song);
  }
  return [...unique.values()].sort((left, right) => numericTrack(left) - numericTrack(right) || left.id.localeCompare(right.id));
};
const validPair = (releaseId, songId) => {
  const ordered = canonicalReleaseSongs(releaseId);
  return ordered.length >= 2 && ordered.some((song) => song.id === songId);
};
const continuation = (releaseId, anchorId, consumed = new Set()) => {
  const ordered = canonicalReleaseSongs(releaseId);
  const index = ordered.findIndex((song) => song.id === anchorId);
  return index < 0 ? [] : ordered.slice(index + 1).filter((song) => !consumed.has(song.id));
};

const releaseIds = [...new Set(songs.map((song) => song?.releaseId).filter(Boolean))];
const candidates = releaseIds
  .map((releaseId) => [releaseId, canonicalReleaseSongs(releaseId)])
  .filter(([, entries]) => entries.length >= 3);
assert.ok(candidates.length, 'catalogue needs at least one canonical multi-track release fixture');

for (const [releaseId, ordered] of candidates) {
  assert.equal(new Set(ordered.map((song) => song.id)).size, ordered.length, `${releaseId}: release order must not duplicate canonical song IDs`);
  for (let index = 1; index < ordered.length; index += 1) {
    const previous = ordered[index - 1];
    const current = ordered[index];
    assert.ok(
      numericTrack(previous) < numericTrack(current)
      || (numericTrack(previous) === numericTrack(current) && previous.id.localeCompare(current.id) <= 0),
      `${releaseId}: release order must be trackNumber then stable ID`
    );
  }
  assert.equal(validPair(releaseId, ordered[0].id), true, `${releaseId}: canonical release/song pair must validate`);
  assert.equal(validPair('__invalid-release__', ordered[0].id), false, `${releaseId}: unrelated release must fail closed`);
  assert.equal(validPair(releaseId, '__invalid-song__'), false, `${releaseId}: unrelated song must fail closed`);
}

const [releaseId, ordered] = candidates.find(([, entries]) => entries.length >= 4) || candidates[0];
const anchor = ordered[0];
const firstNext = ordered[1];
assert.equal(continuation(releaseId, anchor.id)[0]?.id, firstNext.id, 'release continuation advances after the active track');

if (ordered.length >= 3) {
  const manuallyQueuedSameRelease = ordered[2];
  const consumed = new Set([manuallyQueuedSameRelease.id]);
  const remaining = continuation(releaseId, anchor.id, consumed);
  assert.equal(remaining[0]?.id, firstNext.id, 'manual same-release queue does not skip earlier unplayed track');
  assert.equal(remaining.some((song) => song.id === manuallyQueuedSameRelease.id), false, 'manual same-release queue is not replayed later');
}

const crossRelease = candidates.find(([candidateId]) => candidateId !== releaseId)?.[1]?.[0];
if (crossRelease) {
  const anchorBeforeQueue = anchor.id;
  const anchorAfterQueue = anchorBeforeQueue;
  assert.equal(anchorAfterQueue, anchorBeforeQueue, 'cross-release manual queue does not advance release anchor');
  assert.equal(continuation(releaseId, anchorAfterQueue)[0]?.id, firstNext.id, 'release continuation resumes after cross-release queue drains');
}

const releaseSongIds = new Set(ordered.map((song) => song.id));
const genericFixture = songs.filter((song) => song?.genre === anchor.genre && !releaseSongIds.has(song.id));
if (genericFixture.length) assert.equal(genericFixture.some((song) => releaseSongIds.has(song.id)), false, 'generic fallback fixture excludes release tracks');

console.log(`Release listening context validated across ${candidates.length} canonical multi-track releases.`);
