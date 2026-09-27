import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const root = path.resolve(import.meta.dirname, '..');
const readJson = async (file) => JSON.parse(await readFile(path.join(root, file), 'utf8'));
const index = await readJson('data/catalogue/index.json');
const ledger = await readJson('data/hosting-rights.json');
const directAudio = await readJson('data/direct-audio.json');
const songs = (await Promise.all(index.songChunks.map(readJson))).flat();
const songIds = new Set(songs.map((song) => song.id));
const directIds = new Set(Object.keys(directAudio?.tracks || {}));
const allowed = new Set(ledger?.allowedStates || []);
const tracks = ledger?.tracks || {};

let failed = false;
const fail = (message) => { console.error(`✗ ${message}`); failed = true; };

const target = Number(ledger?.targetDirectTracks);
if (!Number.isInteger(target) || target < 1 || target > songs.length) {
  fail(`targetDirectTracks must be an integer between 1 and ${songs.length}`);
}

for (const required of ['unreviewed', 'researching', 'contact-rights-holder', 'licence-review', 'cleared', 'blocked']) {
  if (!allowed.has(required)) fail(`allowedStates is missing ${required}`);
}

for (const [songId, record] of Object.entries(tracks)) {
  if (!songIds.has(songId)) fail(`${songId}: hosting-rights record does not match a catalogue song`);
  if (!record || typeof record !== 'object') {
    fail(`${songId}: hosting-rights record must be an object`);
    continue;
  }
  if (!allowed.has(record.state)) fail(`${songId}: invalid state ${JSON.stringify(record.state)}`);
  if (record.state === 'cleared' && !directIds.has(songId)) {
    fail(`${songId}: cleared requires a matching data/direct-audio.json entry`);
  }
  if (record.state === 'blocked' && !String(record.reason || '').trim()) {
    fail(`${songId}: blocked requires a reason`);
  }
  if (record.evidenceUrls != null) {
    if (!Array.isArray(record.evidenceUrls)) fail(`${songId}: evidenceUrls must be an array`);
    else for (const url of record.evidenceUrls) {
      if (!/^https:\/\//i.test(String(url))) fail(`${songId}: evidence URL must be HTTPS`);
    }
  }
  if (record.lastReviewedAt != null && !/^\d{4}-\d{2}-\d{2}$/.test(String(record.lastReviewedAt))) {
    fail(`${songId}: lastReviewedAt must be YYYY-MM-DD`);
  }
}

for (const songId of directIds) {
  if (!songIds.has(songId)) fail(`${songId}: direct-audio entry does not match the catalogue`);
  const state = tracks[songId]?.state;
  if (state && state !== 'cleared') fail(`${songId}: direct-audio entry conflicts with hosting-rights state ${state}`);
}

if (failed) process.exit(1);
console.log(`✓ hosting-rights ledger targets ${target} direct masters across ${songs.length} catalogue songs`);
console.log(`✓ ${Object.keys(tracks).length} reviewed rights records are schema-valid`);
console.log(`✓ ${directIds.size} direct-audio records are compatible with the rights ledger`);
