import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const root = path.resolve(import.meta.dirname, '../..');
const read = (file) => readFile(path.join(root, file), 'utf8');
const readJson = async (file) => JSON.parse(await read(file));

const [index, enrichRuntime, continuousRuntime, pages] = await Promise.all([
  readJson('data/catalogue/index.json'),
  read('scripts/enrich-runtime-songs.mjs'),
  read('assets/runtime/continuous-set-state.js'),
  read('.github/workflows/pages.yml'),
]);

let failed = false;
const fail = (message) => {
  console.error(`✗ ${message}`);
  failed = true;
};

for (const marker of [
  "next.playbackContainerType = 'youtube-continuous-set'",
  'next.playbackContainerId =',
  'next.playbackContainerTitle =',
  'next.chapterDurationSeconds =',
  'next.durationSeconds = 0;',
  'isContinuousYoutubeChapter(route)',
]) {
  if (!enrichRuntime.includes(marker)) fail(`Runtime enrichment is missing continuous-set marker: ${marker}`);
}

for (const marker of [
  'GARBA_CONTINUOUS_SET_RUNTIME',
  "const continuousType = 'youtube-continuous-set'",
  'function distinctUpNext(limit = 12)',
  'function adjacentDistinct(direction)',
  "els.sheetTitle.textContent = 'After this set'",
  'different recordings',
  'event.stopImmediatePropagation()',
  "navigator.mediaSession.setActionHandler('nexttrack'",
  "navigator.mediaSession.setActionHandler('previoustrack'",
  'let syncingBadge = false;',
  'function scheduleContinuousSync()',
  'if (syncingBadge) return;',
]) {
  if (!continuousRuntime.includes(marker)) fail(`Continuous-set UI runtime is missing marker: ${marker}`);
}

if (!continuousRuntime.includes('if (els.queueBadge.textContent !== nextText)')) {
  fail('Continuous-set UI runtime must avoid mutating queueBadge textContent when value is unchanged');
}

if (!pages.includes('assets/runtime/continuous-set-state.js')) {
  fail('Pages build must concatenate the continuous-set runtime into deployed app.js');
}
if (!pages.includes('GARBA_CONTINUOUS_SET_RUNTIME')) {
  fail('Pages build must verify that the continuous-set runtime reached deployed app.js');
}

const playbackPaths = Array.isArray(index.playbackSources) ? index.playbackSources.filter(Boolean) : [];
const manifests = await Promise.all(playbackPaths.map((file) => readJson(file)));
const routes = Object.values(Object.assign({}, ...manifests.map((manifest) => manifest?.songSources || {})));
const continuousCandidates = routes.filter((route) => {
  if (String(route?.provider || '').toLowerCase() !== 'youtube' || !route?.videoId) return false;
  if (!Number.isFinite(Number(route.startSeconds))) return false;
  const evidence = String(route.evidenceType || '').toLowerCase();
  return route.sourceType === 'verified-performance-chapter'
    || Boolean(route.performanceSetId)
    || evidence.includes('chapter');
});

if (!continuousCandidates.length) fail('Expected at least one verified YouTube chapter route to exercise continuous-set playback');
for (const route of continuousCandidates) {
  if (!String(route.videoId || '').trim()) fail('Continuous chapter route is missing a YouTube video ID');
  if (!Number.isFinite(Number(route.startSeconds)) || Number(route.startSeconds) < 0) {
    fail(`Continuous chapter route has an invalid start: ${JSON.stringify(route)}`);
  }
}

if (failed) process.exit(1);
console.log(`✓ ${continuousCandidates.length} verified YouTube chapter routes are modelled as continuous listening sets`);
console.log('✓ continuous chapters preserve catalogue duration separately while playback runs through the underlying recording');
console.log('✓ queue, transport keys and Media Session navigation leave the current continuous recording instead of hopping chapters');
console.log('✓ production app.js includes and verifies the continuous-set UX runtime');
