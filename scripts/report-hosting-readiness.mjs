import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const root = path.resolve(import.meta.dirname, '..');
const readJson = async (file) => JSON.parse(await readFile(path.join(root, file), 'utf8'));

const index = await readJson('data/catalogue/index.json');
const rightsLedger = await readJson('data/hosting-rights.json');
const directAudio = await readJson('data/direct-audio.json');
const songParts = await Promise.all(index.songChunks.map(readJson));
const songs = songParts.flat();
const directTracks = directAudio?.tracks || {};
const rightsTracks = rightsLedger?.tracks || {};
const target = Number(rightsLedger?.targetDirectTracks || 700);

const stateCounts = new Map();
const candidateArtistCredits = new Map();
let knownDurationSeconds = 0;
let knownDurationTracks = 0;

for (const song of songs) {
  const state = directTracks[song.id]
    ? 'cleared'
    : rightsTracks[song.id]?.state || 'unreviewed';
  stateCounts.set(state, (stateCounts.get(state) || 0) + 1);

  if (state !== 'cleared' && state !== 'blocked') {
    const credit = String(song.artist || 'Unknown artist').trim() || 'Unknown artist';
    candidateArtistCredits.set(credit, (candidateArtistCredits.get(credit) || 0) + 1);
  }

  const duration = Number(song.durationSeconds);
  if (Number.isFinite(duration) && duration > 0) {
    knownDurationSeconds += duration;
    knownDurationTracks += 1;
  }
}

const cleared = Object.keys(directTracks).filter((songId) => songs.some((song) => song.id === songId)).length;
const remainingToTarget = Math.max(0, target - cleared);
const averageDurationSeconds = knownDurationTracks ? knownDurationSeconds / knownDurationTracks : 300;
const estimateGb = (kbps) => Number((target * averageDurationSeconds * kbps * 1000 / 8 / 1_000_000_000).toFixed(2));
const topArtistCredits = [...candidateArtistCredits.entries()]
  .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
  .slice(0, 25)
  .map(([artistCredit, tracks]) => ({ artistCredit, tracks }));

const summary = {
  catalogueVersion: index.version,
  catalogueSongs: songs.length,
  targetDirectTracks: target,
  directTracksCleared: cleared,
  remainingToTarget,
  progressPercent: Number(((cleared / Math.max(1, target)) * 100).toFixed(1)),
  rightsStates: Object.fromEntries([...stateCounts.entries()].sort((a, b) => a[0].localeCompare(b[0]))),
  knownDurationTracks,
  averageDurationSeconds: Number(averageDurationSeconds.toFixed(1)),
  estimatedPublicStorageGbAtTarget: {
    aac160: estimateGb(160),
    aac192: estimateGb(192),
    opus96: estimateGb(96),
    opus128: estimateGb(128),
    aac160PlusOpus96: Number((estimateGb(160) + estimateGb(96)).toFixed(2)),
  },
  topUnclearedArtistCredits: topArtistCredits,
};

if (process.argv.includes('--json')) {
  console.log(JSON.stringify(summary, null, 2));
  process.exit(0);
}

console.log(`GARBA hosting readiness · catalogue ${summary.catalogueVersion}`);
console.log(`Catalogue: ${summary.catalogueSongs} songs`);
console.log(`Direct-host target: ${target}`);
console.log(`Cleared direct masters: ${cleared}`);
console.log(`Remaining to target: ${remainingToTarget}`);
console.log(`Progress: ${summary.progressPercent}%`);
console.log(`Average known track duration: ${(summary.averageDurationSeconds / 60).toFixed(2)} min across ${knownDurationTracks} tracks`);
console.log(`Estimated 700-track public storage: AAC 160 ${summary.estimatedPublicStorageGbAtTarget.aac160} GB, AAC 192 ${summary.estimatedPublicStorageGbAtTarget.aac192} GB, Opus 96 ${summary.estimatedPublicStorageGbAtTarget.opus96} GB, AAC 160 + Opus 96 ${summary.estimatedPublicStorageGbAtTarget.aac160PlusOpus96} GB`);
console.log(`Rights states: ${Object.entries(summary.rightsStates).map(([state, count]) => `${state} ${count}`).join(', ')}`);
console.log('Top uncleared artist-credit batches:');
for (const entry of topArtistCredits.slice(0, 15)) console.log(`  ${entry.tracks.toString().padStart(3, ' ')}  ${entry.artistCredit}`);
