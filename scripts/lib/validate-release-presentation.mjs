import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const root = path.resolve(import.meta.dirname, '../..');
const readJson = async (file) => JSON.parse(await readFile(path.join(root, file), 'utf8'));
const readText = (file) => readFile(path.join(root, file), 'utf8');
const index = await readJson('data/catalogue/index.json');

async function merge(files = []) {
  return (await Promise.all(files.map(readJson))).flat();
}

const [sourceSongs, releases, runtimeSongs, setsIndex, appSource, exploreSource] = await Promise.all([
  merge(index.songChunks),
  merge(index.releaseChunks),
  readJson(index.generatedFiles?.songs || 'data/songs.json'),
  readJson(index.discovery?.setsIndex || 'data/discovery/sets/index.json'),
  readText('app.js'),
  readText('src/catalogue/catalogue.js'),
]);

const setsBase = path.posix.dirname(index.discovery?.setsIndex || 'data/discovery/sets/index.json');
const setPayloads = await Promise.all((setsIndex.chunks || []).map((chunk) => readJson(path.posix.join(setsBase, chunk))));
const discoverySets = setPayloads.flatMap((payload) => Array.isArray(payload?.sets) ? payload.sets : []);
const setById = new Map(discoverySets.map((set) => [set.id, set]));
const releaseById = new Map(releases.map((release) => [release.id, release]));
const sourceSongsByRelease = new Map();
for (const song of sourceSongs) {
  const list = sourceSongsByRelease.get(song.releaseId) || [];
  list.push(song);
  sourceSongsByRelease.set(song.releaseId, list);
}
const runtimeById = new Map(runtimeSongs.map((song) => [song.id, song]));
const normalise = (value = '') => String(value)
  .normalize('NFKD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/[^a-z0-9\u0a80-\u0aff]+/g, ' ')
  .trim();
const sequence = (releaseId) => (sourceSongsByRelease.get(releaseId) || [])
  .slice()
  .sort((a, b) => Number(a.trackNumber || 0) - Number(b.trackNumber || 0) || String(a.id).localeCompare(String(b.id)))
  .map((song) => normalise(song.title));

const allowedRoles = new Set(['catalogue', 'catalogue-alias', 'nonstop-only', 'source-only']);
const hiddenRoles = new Set(['catalogue-alias', 'nonstop-only', 'source-only']);
const issues = [];
const hiddenReleases = [];
let aliasCount = 0;
let nonstopCount = 0;
let sourceOnlyCount = 0;

for (const release of releases) {
  const role = String(release.presentationRole || 'catalogue');
  if (!allowedRoles.has(role)) {
    issues.push(`release ${release.id}: unknown presentationRole ${JSON.stringify(role)}`);
    continue;
  }
  if (!hiddenRoles.has(role)) {
    if (release.canonicalReleaseId) issues.push(`release ${release.id}: normal catalogue release must not declare canonicalReleaseId`);
    continue;
  }

  hiddenReleases.push(release);
  if (role === 'catalogue-alias') aliasCount += 1;
  if (role === 'nonstop-only') nonstopCount += 1;
  if (role === 'source-only') sourceOnlyCount += 1;

  const canonicalId = String(release.canonicalReleaseId || '').trim();
  const canonical = releaseById.get(canonicalId);
  if (!canonicalId) issues.push(`release ${release.id}: ${role} requires canonicalReleaseId`);
  else if (canonicalId === release.id) issues.push(`release ${release.id}: canonicalReleaseId cannot point to itself`);
  else if (!canonical) issues.push(`release ${release.id}: canonical release ${canonicalId} does not exist`);
  else if (String(canonical.presentationRole || 'catalogue') !== 'catalogue') issues.push(`release ${release.id}: canonical target ${canonicalId} must be a normal catalogue release`);

  const hiddenSongs = sourceSongsByRelease.get(release.id) || [];
  if (!hiddenSongs.length) issues.push(`release ${release.id}: hidden presentation has no source songs`);

  if (role === 'catalogue-alias' && canonical) {
    if (normalise(release.title) !== normalise(canonical.title)) {
      issues.push(`release ${release.id}: catalogue alias title differs from canonical ${canonical.id}`);
    }
    const sourceSequence = sequence(release.id);
    const canonicalSequence = sequence(canonical.id);
    const identical = sourceSequence.length === canonicalSequence.length
      && sourceSequence.every((title, i) => title === canonicalSequence[i]);
    if (!identical) issues.push(`release ${release.id}: catalogue alias track sequence is not identical to ${canonical.id}`);
  }

  if (role === 'nonstop-only') {
    if (!String(release.entryType || '').includes('continuous')) {
      issues.push(`release ${release.id}: nonstop-only release must be a continuous entryType`);
    }
    const setId = String(release.nonstopSetId || '').trim();
    const set = setById.get(setId);
    if (!setId) issues.push(`release ${release.id}: nonstop-only requires nonstopSetId`);
    else if (!set) issues.push(`release ${release.id}: nonstop set ${setId} does not exist`);
    else {
      const source = set.source || {};
      if (String(source.provider || '').toLowerCase() !== 'youtube' || !source.videoId || source.embeddable === false || set.playbackPolicy === 'youtube-external-visible') {
        issues.push(`release ${release.id}: nonstop set ${setId} is not an embeddable YouTube listening set`);
      }
      if (set.linkedReleaseId && ![release.id, canonicalId].includes(set.linkedReleaseId)) {
        issues.push(`release ${release.id}: nonstop set ${setId} links unrelated release ${set.linkedReleaseId}`);
      }
    }
  }

  for (const sourceSong of hiddenSongs) {
    const runtime = runtimeById.get(sourceSong.id);
    if (!runtime) {
      issues.push(`song ${sourceSong.id}: missing generated runtime row`);
      continue;
    }
    if (runtime.presentationRole !== role) issues.push(`song ${sourceSong.id}: runtime presentationRole does not match ${release.id}`);
    if (runtime.canonicalReleaseId !== canonicalId) issues.push(`song ${sourceSong.id}: runtime canonicalReleaseId does not match ${release.id}`);
    if (!runtime.canonicalSongId) issues.push(`song ${sourceSong.id}: runtime canonicalSongId is missing`);
    else {
      const canonicalSong = runtimeById.get(runtime.canonicalSongId);
      if (!canonicalSong) issues.push(`song ${sourceSong.id}: canonicalSongId ${runtime.canonicalSongId} does not exist`);
      else if (canonicalSong.releaseId !== canonicalId) issues.push(`song ${sourceSong.id}: canonicalSongId does not belong to ${canonicalId}`);
      else if (role === 'source-only') {
        const title = normalise(sourceSong.title);
        const exactTitleMatches = (sourceSongsByRelease.get(canonicalId) || [])
          .filter((candidate) => normalise(candidate.title) === title);
        if (title && exactTitleMatches.length === 1 && canonicalSong.id !== exactTitleMatches[0].id) {
          issues.push(`song ${sourceSong.id}: source-only redirect must prefer unique title match ${exactTitleMatches[0].id}`);
        }
      }
    }
    if (role === 'nonstop-only' && runtime.nonstopSetId !== release.nonstopSetId) {
      issues.push(`song ${sourceSong.id}: runtime nonstopSetId does not match ${release.id}`);
    }
  }
}

const sourceContracts = [
  [appSource, "presentationRedirects", 'main player keeps hidden release redirects'],
  [appSource, "role === 'catalogue'", 'main player filters ordinary listening to catalogue rows'],
  [appSource, "pendingNonstopSetId", 'main player redirects nonstop-only deep links'],
  [exploreSource, "presentationRole || 'catalogue'", 'Explore filters hidden release rows'],
  [exploreSource, 'canonicalReleaseId || releaseId', 'Explore resolves legacy release aliases'],
];
for (const [source, marker, description] of sourceContracts) {
  if (!source.includes(marker)) issues.push(`runtime contract missing: ${description}`);
}

if (!hiddenReleases.length) issues.push('No hidden release presentation roles are configured; duplicate/continuous presentation guard is ineffective');

if (issues.length) {
  console.error(`Release presentation validation failed with ${issues.length} issue(s):`);
  issues.slice(0, 80).forEach((issue) => console.error(`  ✗ ${issue}`));
  if (issues.length > 80) console.error(`  … ${issues.length - 80} more`);
  process.exit(1);
}

console.log(`✓ ${hiddenReleases.length} non-canonical release presentations are preserved as metadata but hidden from ordinary listening`);
console.log(`✓ ${aliasCount} true duplicate album aliases resolve to richer canonical releases`);
console.log(`✓ ${nonstopCount} continuous editions hand off to verified YouTube Nonstop sets`);
console.log(`✓ ${sourceOnlyCount} distinct provider/source editions remain provenance-only instead of becoming duplicate audio objects`);
console.log('✓ legacy song/release links resolve to canonical listening objects without deleting source evidence');
