import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { loadDiscoverySets } from './load-discovery-sets.mjs';

const root = path.resolve(import.meta.dirname, '../..');
const read = (file) => readFile(path.join(root, file), 'utf8');
const readJson = async (file) => JSON.parse(await read(file));
const index = await readJson('data/catalogue/index.json');

async function merge(files = []) {
  const payloads = await Promise.all(files.map(readJson));
  return payloads.flat();
}

const [songs, releases, taxonomy, genres] = await Promise.all([
  merge(index.songChunks),
  merge(index.releaseChunks),
  readJson('data/taxonomy.json'),
  readJson('data/genres.json'),
]);
const { sets: nonstop } = await loadDiscoverySets(root, index);

const releaseById = new Map(releases.map((release) => [release.id, release]));
const taxonomyById = new Map(taxonomy.map((entry) => [entry.id, entry]));
const visualIds = new Set(genres.map((genre) => genre.id));
const issues = [];
const warnings = [];

const compact = (value = '') => String(value).replace(/\s+/g, ' ').trim();
const normalise = (value = '') => compact(value)
  .normalize('NFKD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/[^a-z0-9\u0a80-\u0aff]+/g, ' ')
  .trim();
const optionalText = (entity, field, kind) => {
  if (entity[field] == null) return false;
  if (typeof entity[field] !== 'string' || !entity[field].trim()) {
    issues.push(`${kind} ${entity.id}: ${field} must be a non-empty string when present`);
    return false;
  }
  return true;
};
const validateAliases = (entity, kind) => {
  if (entity.aliases == null) return 0;
  if (!Array.isArray(entity.aliases)) {
    issues.push(`${kind} ${entity.id}: aliases must be an array when present`);
    return 0;
  }
  const values = entity.aliases.map(compact).filter(Boolean);
  if (values.length !== entity.aliases.length) issues.push(`${kind} ${entity.id}: aliases must not contain empty values`);
  if (new Set(values.map(normalise)).size !== values.length) issues.push(`${kind} ${entity.id}: aliases must be unique after normalisation`);
  if (values.some((value) => normalise(value) === normalise(entity.title))) issues.push(`${kind} ${entity.id}: aliases must not repeat the canonical title`);
  return values.length;
};
const titleQa = (entity, kind) => {
  const title = String(entity.title || '');
  if (!title.trim()) issues.push(`${kind} ${entity.id || '(missing id)'}: title is missing`);
  if (title !== title.trim() || /\s{2,}/.test(title)) issues.push(`${kind} ${entity.id}: title has unstable whitespace: ${JSON.stringify(title)}`);
  if (/\bnon[ -]?stop\b/i.test(title) && !/\bNonstop\b/.test(title)) {
    warnings.push(`${kind} ${entity.id}: consider displayTitle using “Nonstop” for consistent presentation (${title})`);
  }
};

let songDescriptions = 0;
let songStories = 0;
let songDisplayTitles = 0;
let songAliases = 0;
let releaseDescriptions = 0;
let releaseDisplayTitles = 0;
let releaseAliases = 0;
let nonstopDescriptions = 0;
let nonstopDisplayTitles = 0;
let nonstopAliases = 0;

const songIdentity = new Map();
const songsByRelease = new Map();
const trackNumbersByRelease = new Map();
for (const song of songs) {
  titleQa(song, 'song');
  if (!song.id) issues.push('song: missing stable id');
  if (!releaseById.has(song.releaseId)) issues.push(`song ${song.id}: releaseId ${JSON.stringify(song.releaseId)} does not resolve`);
  if (!visualIds.has(song.genre)) issues.push(`song ${song.id}: unknown visual genre ${JSON.stringify(song.genre)}`);
  if (!taxonomyById.has(song.category)) issues.push(`song ${song.id}: unknown primary taxonomy ${JSON.stringify(song.category)}`);
  if (optionalText(song, 'displayTitle', 'song')) songDisplayTitles += 1;
  if (optionalText(song, 'description', 'song')) songDescriptions += 1;
  if (optionalText(song, 'story', 'song')) songStories += 1;
  songAliases += validateAliases(song, 'song');

  const key = [normalise(song.title), normalise(song.artist), song.releaseId || ''].join('|');
  const previous = songIdentity.get(key);
  if (previous && previous !== song.id) warnings.push(`possible duplicate song identity: ${previous} / ${song.id}`);
  else songIdentity.set(key, song.id);

  if (song.releaseId) {
    songsByRelease.set(song.releaseId, (songsByRelease.get(song.releaseId) || 0) + 1);
    const trackNumber = Number(song.trackNumber);
    if (Number.isInteger(trackNumber) && trackNumber > 0) {
      let releaseTracks = trackNumbersByRelease.get(song.releaseId);
      if (!releaseTracks) {
        releaseTracks = new Map();
        trackNumbersByRelease.set(song.releaseId, releaseTracks);
      }
      const ids = releaseTracks.get(trackNumber) || [];
      ids.push(song.id);
      releaseTracks.set(trackNumber, ids);
    }
  }
}

for (const release of releases) {
  titleQa(release, 'release');
  if (optionalText(release, 'displayTitle', 'release')) releaseDisplayTitles += 1;
  if (optionalText(release, 'description', 'release')) releaseDescriptions += 1;
  releaseAliases += validateAliases(release, 'release');
  const imported = songsByRelease.get(release.id) || 0;
  const declared = Number(release.songCount);
  if (release.trackImportComplete === true) {
    if (!Number.isInteger(declared) || declared < 0) {
      issues.push(`release ${release.id}: trackImportComplete requires a non-negative integer songCount`);
    } else if (declared !== imported) {
      issues.push(`release ${release.id}: trackImportComplete songCount=${declared}, but ${imported} imported songs resolve to this release`);
    }
    const releaseTracks = trackNumbersByRelease.get(release.id) || new Map();
    for (const [trackNumber, ids] of releaseTracks) {
      if (ids.length > 1) {
        issues.push(`release ${release.id}: duplicate trackNumber ${trackNumber} across ${ids.join(', ')}`);
      }
    }
  }
}

for (const set of nonstop) {
  titleQa(set, 'nonstop');
  if (optionalText(set, 'displayTitle', 'nonstop')) nonstopDisplayTitles += 1;
  if (optionalText(set, 'description', 'nonstop')) nonstopDescriptions += 1;
  nonstopAliases += validateAliases(set, 'nonstop');
  for (const genre of Array.isArray(set.genres) ? set.genres : []) {
    if (!visualIds.has(genre)) issues.push(`nonstop ${set.id}: unknown visual genre ${JSON.stringify(genre)}`);
  }
  for (const style of Array.isArray(set.styles) ? set.styles : []) {
    if (!taxonomyById.has(style)) issues.push(`nonstop ${set.id}: unknown taxonomy style ${JSON.stringify(style)}`);
  }
  for (const category of Array.isArray(set.categories) ? set.categories : []) {
    if (!visualIds.has(category) && !taxonomyById.has(category)) issues.push(`nonstop ${set.id}: unknown discovery category ${JSON.stringify(category)}`);
  }
}

const expandedGenreCounts = Object.fromEntries(genres.map((genre) => [genre.id, 0]));
const primaryGenreCounts = Object.fromEntries(genres.map((genre) => [genre.id, 0]));
for (const song of songs) {
  if (primaryGenreCounts[song.genre] != null) primaryGenreCounts[song.genre] += 1;
  const memberships = new Set(song.genre ? [song.genre] : []);
  for (const id of [song.category, ...(Array.isArray(song.taxonomyStyles) ? song.taxonomyStyles : [])]) {
    const visualGenre = taxonomyById.get(id)?.visualGenre;
    if (visualGenre) memberships.add(visualGenre);
  }
  memberships.forEach((genre) => {
    if (expandedGenreCounts[genre] != null) expandedGenreCounts[genre] += 1;
  });
}

console.log(`Catalogue metadata audit: ${songs.length} songs · ${releases.length} release records · ${nonstop.length} canonical discovery Nonstop sets`);
console.log(`Song editorial metadata: ${songDescriptions} descriptions · ${songStories} stories · ${songDisplayTitles} display titles · ${songAliases} aliases`);
console.log(`Release editorial metadata: ${releaseDescriptions} descriptions · ${releaseDisplayTitles} display titles · ${releaseAliases} aliases`);
console.log(`Nonstop editorial metadata: ${nonstopDescriptions} descriptions · ${nonstopDisplayTitles} display titles · ${nonstopAliases} aliases`);
console.log('Explore visual-world membership (primary only -> primary + secondary taxonomy):');
for (const genre of genres) console.log(`  ${genre.id}: ${primaryGenreCounts[genre.id]} -> ${expandedGenreCounts[genre.id]}`);

if (warnings.length) {
  console.log(`\n${warnings.length} metadata warnings:`);
  warnings.slice(0, 80).forEach((warning) => console.log(`  ! ${warning}`));
  if (warnings.length > 80) console.log(`  … ${warnings.length - 80} more warnings`);
}

if (issues.length) {
  console.error(`\n${issues.length} metadata integrity errors:`);
  issues.slice(0, 100).forEach((issue) => console.error(`  ✗ ${issue}`));
  if (issues.length > 100) console.error(`  … ${issues.length - 100} more errors`);
  process.exit(1);
}

console.log('\n✓ Canonical catalogue identities, complete-release track counts/numbers, discovery Nonstop metadata, optional editorial metadata shapes and Explore taxonomy membership are internally consistent.');
