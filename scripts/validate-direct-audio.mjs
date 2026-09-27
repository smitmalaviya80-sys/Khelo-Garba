import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const root = path.resolve(import.meta.dirname, '..');
const readJson = async (file) => JSON.parse(await readFile(path.join(root, file), 'utf8'));
const songs = await readJson('data/songs.json');
const manifest = await readJson('data/direct-audio.json');
const songIds = new Set(songs.map((song) => song.id));
const tracks = manifest?.tracks || {};
const blockedProviderHosts = [
  'youtube.com', 'youtu.be', 'music.apple.com', 'itunes.apple.com', 'amazon.',
  'spotify.com', 'soundcloud.com', 'bandcamp.com', 'pixabay.com'
];

let failed = false;
const fail = (message) => { console.error(`✗ ${message}`); failed = true; };
const isLocalAudioPath = (value) => /^\.?\/?assets\/audio\//.test(value);
const isHttps = (value) => /^https:\/\//i.test(value);

for (const [songId, entry] of Object.entries(tracks)) {
  if (!songIds.has(songId)) fail(`${songId}: direct-audio entry does not match a catalogue song`);
  if (!entry || typeof entry !== 'object') {
    fail(`${songId}: direct-audio entry must be an object`);
    continue;
  }

  const audioUrl = String(entry.audioUrl || '').trim();
  const rights = entry.rights || {};
  const proofUrl = String(rights.proofUrl || '').trim();
  const licenseName = String(rights.licenseName || '').trim();
  const rightsHolder = String(rights.rightsHolder || '').trim();
  const sha256 = String(entry.sha256 || '').trim();

  if (!audioUrl) fail(`${songId}: missing audioUrl`);
  if (audioUrl && !isHttps(audioUrl) && !isLocalAudioPath(audioUrl)) {
    fail(`${songId}: audioUrl must be HTTPS or a repository assets/audio path`);
  }
  if (blockedProviderHosts.some((host) => audioUrl.toLowerCase().includes(host))) {
    fail(`${songId}: provider/download page cannot be used as a direct audio master`);
  }
  if (rights.redistributionAuthorized !== true) fail(`${songId}: redistributionAuthorized must be true`);
  if (!rightsHolder) fail(`${songId}: missing rights.rightsHolder`);
  if (!licenseName) fail(`${songId}: missing rights.licenseName`);
  if (!proofUrl || !isHttps(proofUrl)) fail(`${songId}: rights.proofUrl must be an HTTPS evidence URL`);
  if (!String(rights.verifiedAt || '').match(/^\d{4}-\d{2}-\d{2}$/)) fail(`${songId}: rights.verifiedAt must be YYYY-MM-DD`);

  if (!/^[a-f0-9]{64}$/i.test(sha256)) {
    fail(`${songId}: sha256 is required and must be the 64-character digest of the published encoded audio bytes`);
  }
}

if (failed) process.exit(1);
console.log(`✓ ${Object.keys(tracks).length} direct-audio entries have explicit redistribution evidence and encoded-byte checksums`);
console.log('✓ direct audio cannot silently point at YouTube, Apple Music, Amazon, Spotify, SoundCloud, Bandcamp or Pixabay pages');
