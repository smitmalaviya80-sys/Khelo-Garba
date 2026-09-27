import { readFile } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '../..');
const readJson = async (file) => JSON.parse(await readFile(path.join(root, file), 'utf8'));
const catalogueIndex = await readJson('data/catalogue/index.json');
const setsIndexPath = catalogueIndex.discovery?.setsIndex;

if (!setsIndexPath) {
  console.error('✗ catalogue discovery manifest does not define setsIndex');
  process.exit(1);
}

const setsIndex = await readJson(setsIndexPath);
const setsDir = path.posix.dirname(setsIndexPath);
const supportedChapterStatuses = new Set([
  'published-complete',
  'source-no-published-chapters',
  'source-tracklist-no-timestamps',
  'full-set-only-no-chapter-evidence',
]);
const supportedSourceStatuses = new Set(['youtube-migration-required']);

const unresolved = [];
const invalidMigrationStates = [];
let setCount = 0;
let youtubeSetCount = 0;
let timestamped = 0;
let explicitlyContinuous = 0;
let tracklistOnly = 0;
let fullSetOnly = 0;
let migrationRequired = 0;

// Chapter completion is only meaningful once a trustworthy YouTube master exists.
// Provider-only discovery evidence must stay visibly separate as migration backlog.
for (const chunkName of setsIndex.chunks || []) {
  const chunkPath = path.posix.join(setsDir, chunkName);
  const payload = await readJson(chunkPath);
  for (const set of payload.sets || []) {
    setCount += 1;
    const segments = Array.isArray(set.segments) ? set.segments : [];
    const chapterStatus = String(set.chapterStatus || '').trim();
    const sourceStatus = String(set.sourceStatus || '').trim();
    const provider = String(set.source?.provider || '').trim().toLowerCase();
    const isYoutube = provider === 'youtube' && Boolean(String(set.source?.videoId || '').trim());

    if (!isYoutube) {
      if (segments.length > 0 || supportedChapterStatuses.has(chapterStatus)) {
        invalidMigrationStates.push({ id: set.id, title: set.title, provider, chunk: chunkName });
        continue;
      }
      if (!supportedSourceStatuses.has(sourceStatus)) {
        unresolved.push({ id: set.id, title: set.title, provider: provider || '(none)', videoId: '(no YouTube master)', chunk: chunkName });
        continue;
      }
      migrationRequired += 1;
      continue;
    }

    youtubeSetCount += 1;
    if (sourceStatus) {
      invalidMigrationStates.push({ id: set.id, title: set.title, provider, chunk: chunkName });
      continue;
    }

    if (segments.length > 0) {
      timestamped += 1;
      continue;
    }

    if (!supportedChapterStatuses.has(chapterStatus)) {
      unresolved.push({ id: set.id, title: set.title, provider, videoId: set.source?.videoId || '(no video id)', chunk: chunkName });
      continue;
    }

    if (chapterStatus === 'source-tracklist-no-timestamps') tracklistOnly += 1;
    else if (chapterStatus === 'full-set-only-no-chapter-evidence') fullSetOnly += 1;
    else explicitlyContinuous += 1;
  }
}

if (invalidMigrationStates.length) {
  console.error(`✗ ${invalidMigrationStates.length} Nonstop sets conflate provider migration with YouTube chapter completion:`);
  for (const set of invalidMigrationStates) console.error(`  - ${set.id} | ${set.title} | ${set.provider} | ${set.chunk}`);
}

if (unresolved.length) {
  console.error(`✗ ${unresolved.length} Nonstop sets still need either YouTube chapter evidence or an explicit YouTube migration state:`);
  for (const set of unresolved) {
    console.error(`  - ${set.id} | ${set.title} | ${set.provider} | ${set.videoId} | ${set.chunk}`);
  }
}

if (invalidMigrationStates.length || unresolved.length) process.exit(1);

console.log(`✓ global Nonstop evidence resolution: ${setCount}/${setCount} sets classified`);
console.log(`✓ ${youtubeSetCount} sets have YouTube masters`);
console.log(`✓ ${timestamped} YouTube sets have timestamped chapters`);
console.log(`✓ ${explicitlyContinuous} YouTube sets explicitly document sources with no published chapter starts`);
console.log(`✓ ${tracklistOnly} YouTube sets preserve source tracklists without fabricated timestamps`);
console.log(`✓ ${fullSetOnly} migrated YouTube sets are explicitly full-set-only with no carried chapter evidence`);
console.log(`△ ${migrationRequired} discovery sets remain explicitly classified as YouTube migration required`);
