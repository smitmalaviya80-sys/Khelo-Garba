import { readFile } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '../..');
const readJson = async (file) => JSON.parse(await readFile(path.join(root, file), 'utf8'));

const [index, taxonomy, releases] = await Promise.all([
  readJson('data/catalogue/index.json'),
  readJson('data/taxonomy.json'),
  readJson('data/releases.json'),
]);

const taxonomyById = new Map(taxonomy.map((entry) => [entry.id, entry]));
const releaseById = new Map(releases.map((release) => [release.id, release]));
const rows = [];

for (const sourceChunk of index.songChunks || []) {
  const songs = await readJson(sourceChunk);
  for (const song of songs) {
    const taxonomyEntry = song.category ? taxonomyById.get(song.category) : null;
    const expectedGenre = taxonomyEntry?.visualGenre || null;
    if (!expectedGenre || expectedGenre === song.genre) continue;
    const release = releaseById.get(song.releaseId) || null;
    rows.push({
      id: song.id,
      title: song.title || '',
      artist: song.artist || '',
      releaseId: song.releaseId || '',
      releaseTitle: release?.title || '',
      sourceChunk,
      category: song.category,
      currentGenre: song.genre,
      expectedGenre,
    });
  }
}

const grouped = new Map();
for (const row of rows) {
  const key = `${row.sourceChunk}\u0000${row.releaseId}`;
  if (!grouped.has(key)) {
    grouped.set(key, {
      sourceChunk: row.sourceChunk,
      releaseId: row.releaseId,
      releaseTitle: row.releaseTitle,
      mismatchCount: 0,
      transitions: {},
      songs: [],
    });
  }
  const group = grouped.get(key);
  group.mismatchCount += 1;
  const transition = `${row.category}:${row.currentGenre}->${row.expectedGenre}`;
  group.transitions[transition] = (group.transitions[transition] || 0) + 1;
  group.songs.push(row);
}

const groups = [...grouped.values()].sort((a, b) =>
  b.mismatchCount - a.mismatchCount
  || a.sourceChunk.localeCompare(b.sourceChunk)
  || a.releaseId.localeCompare(b.releaseId)
);

console.log(`Genre/taxonomy audit: ${rows.length} mismatches across ${groups.length} release groups`);
for (const group of groups) {
  console.log(`\n### ${group.releaseTitle || group.releaseId || 'Unknown release'} · ${group.mismatchCount}`);
  console.log(`source: ${group.sourceChunk}`);
  console.log(`release: ${group.releaseId}`);
  console.log(`transitions: ${Object.entries(group.transitions).map(([key, count]) => `${key} (${count})`).join(', ')}`);
  for (const song of group.songs) {
    console.log(`- ${song.id} | ${song.title} | ${song.category} | ${song.currentGenre} -> ${song.expectedGenre}`);
  }
}
