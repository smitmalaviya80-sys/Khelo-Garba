import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { performanceArtistIdentity } from './artist-identity.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const readJson = async (path) => JSON.parse(await readFile(resolve(root, path), 'utf8'));
const index = await readJson('data/catalogue/index.json');

async function merge(paths) {
  const chunks = await Promise.all(paths.map(readJson));
  return chunks.flat();
}

const sourceSongs = await merge(index.songChunks);
const retiredSongIds = new Set(index.retiredSongIds || []);
const songs = sourceSongs.filter((song) => !retiredSongIds.has(song.id));
const songById = new Map(songs.map((song) => [song.id, song]));

const setsIndex = await readJson(index.discovery.setsIndex);
const setsBase = dirname(index.discovery.setsIndex);
const setChunks = await Promise.all((setsIndex.chunks || []).map((chunk) => readJson(`${setsBase}/${chunk}`)));
const sets = setChunks.flatMap((chunk) => chunk.sets || []);
const setById = new Map(sets.map((set) => [set.id, set]));

const generated = await readJson(index.generatedFiles.releasePlayback);
const routes = Object.entries(generated.songSources || {})
  .filter(([, route]) => route?.sourceType === 'verified-performance-chapter');

let failed = false;
let sameArtist = 0;
let collaborationCompatible = 0;
let releaseLinked = 0;
let aliasMatched = 0;
const failures = [];

for (const [songId, route] of routes) {
  const song = songById.get(songId);
  const set = setById.get(route.performanceSetId);
  if (!song) {
    failures.push(`${songId}: generated performance route references a missing canonical song`);
    continue;
  }
  if (!set) {
    failures.push(`${songId}: performance set ${route.performanceSetId || '(missing)'} does not exist`);
    continue;
  }
  const segment = (set.segments || []).find((entry) => Number(entry.startSeconds) === Number(route.startSeconds)
    && String(entry.title || '') === String(route.segmentTitle || '')) || null;
  if (!segment) {
    failures.push(`${songId}: generated route does not resolve to its declared segment in ${set.id}`);
    continue;
  }

  const identity = performanceArtistIdentity(song, set, segment);
  if (!identity.compatible) {
    failures.push(`${songId}: ${song.artist || '(unknown artist)'} -> ${set.id} is ${identity.status}`);
    continue;
  }
  if (route.performanceArtistMatch !== identity.status) {
    failures.push(`${songId}: stored artist match ${route.performanceArtistMatch || '(missing)'} does not equal ${identity.status}`);
    continue;
  }
  const storedShared = new Set(route.performanceMatchedArtists || []);
  if (!identity.shared.every((artist) => storedShared.has(artist))) {
    failures.push(`${songId}: generated route is missing matched performer identity metadata`);
    continue;
  }

  if (identity.status === 'same-artist') sameArtist += 1;
  else collaborationCompatible += 1;
  if (identity.releaseMatch) releaseLinked += 1;
  if ((route.performanceMatchedArtists || []).some((artist) => !String(song.artist || '').toLowerCase().includes(artist))) aliasMatched += 1;
}

if (failures.length) {
  failed = true;
  for (const failure of failures.slice(0, 30)) console.error(`✗ ${failure}`);
  if (failures.length > 30) console.error(`✗ ...and ${failures.length - 30} more performance identity failures`);
}

if (!routes.length) {
  failed = true;
  console.error('✗ No generated performance chapters were found to validate');
}

if (failed) process.exit(1);
console.log(`✓ ${routes.length} generated performance chapters are artist-compatible`);
console.log(`✓ identity inventory: ${sameArtist} same-artist, ${collaborationCompatible} collaboration-compatible, ${releaseLinked} linked-release, ${aliasMatched} alias-normalised`);
console.log('✓ same-title different/unknown performer routes fail closed before generated playback');
