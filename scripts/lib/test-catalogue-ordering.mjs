import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const orderingPath = path.join(root, 'src/catalogue/catalogue-ordering.js');
const source = await readFile(orderingPath, 'utf8');
const sandbox = {};
vm.runInNewContext(source, sandbox, { filename: orderingPath });
const { orderCatalogueSongs } = sandbox.PlayGarbaCatalogueOrdering;

const songs = [
  { id: 'song-a', title: 'Aavo Re', artist: 'Artist A', originalReleaseYear: 2024 },
  { id: 'song-b', title: 'Bole Re', artist: 'Artist B', originalReleaseYear: 2026 },
  { id: 'song-c', title: 'Chalo Re', artist: 'Artist C', originalReleaseYear: 2025 },
  { id: 'song-d', title: 'Dhol Re', artist: 'Artist D' },
  { id: 'song-e', title: 'Ektaal', artist: 'Artist E', originalReleaseYear: 2023 },
];

const availabilityTierById = {
  'song-a': 0,
  'song-b': 2,
  'song-c': 0,
  'song-d': 0,
  'song-e': 1,
};

const popularityRankById = new Map([
  ['song-a', 3],
  ['song-b', 1],
  ['song-d', 1],
  ['song-e', 2],
]);

const ids = (items) => items.map((song) => song.id);

const playableFirst = orderCatalogueSongs(songs, {
  mode: 'popular',
  availabilityTierById,
  popularityRankById,
});
assert.deepEqual(ids(playableFirst), ['song-d', 'song-a', 'song-c', 'song-e', 'song-b']);

const popularWithoutGate = orderCatalogueSongs(songs, {
  mode: 'popular',
  availabilityGate: false,
  popularityRankById,
});
assert.deepEqual(ids(popularWithoutGate), ['song-b', 'song-d', 'song-e', 'song-a', 'song-c']);

const newest = orderCatalogueSongs(songs, {
  mode: 'newest',
  availabilityGate: false,
});
assert.deepEqual(ids(newest), ['song-b', 'song-c', 'song-a', 'song-e', 'song-d']);

const oldest = orderCatalogueSongs(songs, {
  mode: 'oldest',
  availabilityGate: false,
});
assert.deepEqual(ids(oldest), ['song-e', 'song-a', 'song-c', 'song-b', 'song-d']);

const chronologyById = {
  'song-a': '2021-10-01',
  'song-b': '2022-09-01',
};
assert.deepEqual(
  ids(orderCatalogueSongs(songs.slice(0, 2), {
    mode: 'newest',
    availabilityGate: false,
    chronologyById,
  })),
  ['song-b', 'song-a'],
);

const mixedChronology = [
  { id: 'newer-year', title: 'Newer year', originalReleaseYear: 2026 },
  { id: 'dated', title: 'Dated', releaseDate: '2025-09-01' },
  { id: 'year-only', title: 'Year only', originalReleaseYear: 2025 },
  { id: 'older-year', title: 'Older year', originalReleaseYear: 2024 },
];
assert.deepEqual(
  ids(orderCatalogueSongs(mixedChronology, { mode: 'newest', availabilityGate: false })),
  ['newer-year', 'dated', 'year-only', 'older-year'],
);
assert.deepEqual(
  ids(orderCatalogueSongs(mixedChronology, { mode: 'oldest', availabilityGate: false })),
  ['older-year', 'year-only', 'dated', 'newer-year'],
);

const missingReadiness = [
  { id: 'known-playable', title: 'Known playable' },
  { id: 'unknown-readiness', title: 'Unknown readiness' },
];
assert.deepEqual(
  ids(orderCatalogueSongs(missingReadiness, {
    mode: 'popular',
    availabilityTierById: { 'known-playable': 0, 'unknown-readiness': null },
  })),
  ['known-playable', 'unknown-readiness'],
);

const sameTitle = [
  { id: 'recording-z', title: 'Maa No Garbo', artist: 'Same Artist' },
  { id: 'recording-a', title: 'Maa No Garbo', artist: 'Same Artist' },
];
assert.deepEqual(
  ids(orderCatalogueSongs(sameTitle, { mode: 'popular', availabilityGate: false })),
  ['recording-a', 'recording-z'],
);

const originalOrder = ids(songs);
const sortedCopy = orderCatalogueSongs(songs, {
  mode: 'newest',
  availabilityGate: false,
});
assert.notStrictEqual(sortedCopy, songs);
assert.deepEqual(ids(songs), originalOrder);

for (const context of ['release', 'selected-release', 'nonstop', 'continuous', 'continuous-set', 'search', 'queue', 'history', 'user', 'user-defined']) {
  const reversed = [...songs].reverse();
  const preserved = orderCatalogueSongs(reversed, {
    context,
    mode: 'newest',
    availabilityTierById,
  });
  assert.deepEqual(ids(preserved), ids(reversed), `${context} must preserve source order`);
}

const resolverOrder = orderCatalogueSongs(songs.slice(0, 3), {
  mode: 'popular',
  getAvailabilityTier: (song) => ({ 'song-a': 1, 'song-b': 0, 'song-c': 0 })[song.id],
  getPopularityRank: (song) => ({ 'song-a': 1, 'song-b': 5, 'song-c': 2 })[song.id],
});
assert.deepEqual(ids(resolverOrder), ['song-c', 'song-b', 'song-a']);

assert.throws(
  () => orderCatalogueSongs(songs, { mode: 'recent-ish' }),
  /Unsupported catalogue sort mode/,
);
assert.throws(
  () => orderCatalogueSongs(null),
  /expects an array/,
);

console.log('Catalogue ordering regression fixtures passed.');
