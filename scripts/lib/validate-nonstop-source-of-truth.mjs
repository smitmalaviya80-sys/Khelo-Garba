import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { loadDiscoverySets } from './load-discovery-sets.mjs';

const root = path.resolve(import.meta.dirname, '../..');
const readText = (file) => readFile(path.join(root, file), 'utf8');
const readJson = async (file) => JSON.parse(await readText(file));
const failures = [];
const fail = (message) => failures.push(message);

try {
  await access(path.join(root, 'data/nonstop.json'));
  fail('data/nonstop.json exists; Nonstop listening data must live only in discovery sets');
} catch (error) {
  if (error?.code !== 'ENOENT') throw error;
}

const index = await readJson('data/catalogue/index.json');
if (Object.hasOwn(index, 'nonstopSets')) {
  fail('Catalogue manifest still defines nonstopSets; discovery.setsIndex must be the only Nonstop registry pointer');
}
const releaseChunks = await Promise.all((index.releaseChunks || []).map(readJson));
const releases = releaseChunks.flat();
const { sets, setsIndexPath } = await loadDiscoverySets(root, index);
const browserSource = await readText('nonstop-browser.js');
const genreValidatorSource = await readText('scripts/lib/validate-genre-taxonomy.mjs');
const metadataAuditSource = await readText('scripts/lib/audit-catalogue-metadata.mjs');

const setById = new Map();
const videoById = new Map();
const legacyRecordIds = new Set();
let playableYoutubeSets = 0;
let providerEvidenceSets = 0;

for (const set of sets) {
  const id = String(set?.id || '').trim();
  if (!id) {
    fail(`Discovery chunk ${set?.__chunk || '(unknown)'} contains a set without id`);
    continue;
  }
  if (setById.has(id)) fail(`Duplicate discovery Nonstop set id: ${id}`);
  else setById.set(id, set);

  const legacyRecordId = String(set?.legacyRecordId || '').trim();
  if (legacyRecordId) {
    if (legacyRecordIds.has(legacyRecordId)) fail(`Duplicate migrated legacyRecordId: ${legacyRecordId}`);
    legacyRecordIds.add(legacyRecordId);
  }

  const provider = String(set?.source?.provider || '').toLowerCase();
  const videoId = String(set?.source?.videoId || '').trim();
  const playableYoutube = provider === 'youtube' && videoId && set?.source?.embeddable !== false && set?.playbackPolicy !== 'youtube-external-visible';
  if (playableYoutube) {
    playableYoutubeSets += 1;
    const previous = videoById.get(videoId);
    if (previous) fail(`YouTube recording ${videoId} is exposed by multiple Nonstop set IDs: ${previous.id}, ${id}`);
    else videoById.set(videoId, set);
  } else {
    providerEvidenceSets += 1;
  }
}

for (const release of releases) {
  const nonstopSetId = String(release?.nonstopSetId || '').trim();
  if (!nonstopSetId) continue;
  const target = setById.get(nonstopSetId);
  if (!target) {
    fail(`Release ${release.id} points to missing nonstopSetId ${nonstopSetId}`);
    continue;
  }
  const provider = String(target?.source?.provider || '').toLowerCase();
  const videoId = String(target?.source?.videoId || '').trim();
  if (provider !== 'youtube' || !videoId || target?.source?.embeddable === false || target?.playbackPolicy === 'youtube-external-visible') {
    fail(`Release ${release.id} nonstopSetId ${nonstopSetId} must resolve to an embeddable YouTube listening set`);
  }
}

if (!browserSource.includes("data/discovery/sets/index.json")) {
  fail('Nonstop browser must load data/discovery/sets/index.json as its canonical registry');
}
for (const [file, source] of [
  ['scripts/lib/validate-genre-taxonomy.mjs', genreValidatorSource],
  ['scripts/lib/audit-catalogue-metadata.mjs', metadataAuditSource],
]) {
  if (source.includes('data/nonstop.json')) fail(`${file} still depends on retired data/nonstop.json`);
  if (!source.includes('loadDiscoverySets')) fail(`${file} must validate the canonical discovery set registry`);
}

if (setsIndexPath !== 'data/discovery/sets/index.json') {
  fail(`Catalogue manifest points Nonstop discovery at unexpected index ${setsIndexPath}`);
}

if (failures.length) {
  console.error(`Nonstop source-of-truth validation failed with ${failures.length} issue(s):`);
  failures.forEach((message) => console.error(`  ✗ ${message}`));
  process.exit(1);
}

console.log(`✓ ${sets.length} canonical Nonstop/discovery records load from ${setsIndexPath}`);
console.log(`✓ ${playableYoutubeSets} embeddable YouTube listening sets have unique recording identities`);
console.log(`✓ ${providerEvidenceSets} non-playable/provider-evidence discovery records remain separate from listening masters`);
console.log(`✓ ${legacyRecordIds.size} migrated legacy records preserve provenance without a second registry`);
console.log('✓ every release Nonstop handoff resolves to one canonical embeddable YouTube set');
console.log('✓ legacy Nonstop file/manifest pointers are retired and validation/runtime tooling share discovery as the only source');
