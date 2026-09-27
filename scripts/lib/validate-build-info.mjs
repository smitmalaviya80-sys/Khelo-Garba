import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createBuildInfo } from './generate-build-info.mjs';

const thisFile = fileURLToPath(import.meta.url);
const root = path.resolve(path.dirname(thisFile), '../..');
const readText = (file) => readFile(path.resolve(root, file), 'utf8');
const readJson = async (file) => JSON.parse(await readText(file));
const hasText = (document, needle) => String(document).toLowerCase().includes(String(needle).toLowerCase());

function fail(message) {
  console.error(`Build identity validation failed: ${message}`);
  process.exitCode = 1;
}

function assert(condition, message) {
  if (!condition) fail(message);
}

function validateInfo(info, expectedRevision = '') {
  assert(info?.schemaVersion === 1, 'schemaVersion must be 1');
  assert(/^[0-9a-f]{40}$/.test(String(info?.build?.revision || '')), 'build.revision must be a full Git SHA');
  if (expectedRevision) assert(info.build.revision === expectedRevision.toLowerCase(), 'build.revision does not match the deployment revision');
  assert(info?.deployment?.origin === 'https://playgarba.com', 'deployment origin must be the canonical apex');
  assert(info?.deployment?.artifact === 'single-github-pages', 'deployment artifact must identify the single Pages build');
  assert(info?.deployment?.routes?.diagnostic === '/build-info.json', 'diagnostic route must be /build-info.json');

  const catalogue = info?.catalogue || {};
  assert(Number.isInteger(catalogue.rawSourceSongs) && catalogue.rawSourceSongs > 0, 'rawSourceSongs must be a positive integer');
  assert(Number.isInteger(catalogue.activeSongs) && catalogue.activeSongs > 0, 'activeSongs must be a positive integer');
  assert(catalogue.rawSourceSongs === catalogue.activeSongs + catalogue.retiredSongs, 'raw source-song count must equal active + retired songs');
  assert(catalogue.rawSourceReleases === catalogue.activeReleases + catalogue.retiredReleases, 'raw source-release count must equal active + retired releases');
  assert(catalogue.ordinaryListeningSongs <= catalogue.activeSongs, 'ordinary listening songs cannot exceed active songs');
  assert(catalogue.ordinaryListeningReleases <= catalogue.activeReleases, 'ordinary listening releases cannot exceed active releases');

  const playback = info?.playback || {};
  assert(Number.isInteger(playback.sourceEvidenceMapped) && playback.sourceEvidenceMapped <= catalogue.activeSongs, 'sourceEvidenceMapped must be bounded by activeSongs');
  assert(Number.isInteger(playback.youtubePlayable) && playback.youtubePlayable <= catalogue.activeSongs, 'youtubePlayable must be bounded by activeSongs');
  assert(playback.youtubePlayable + playback.migrationBacklog === catalogue.activeSongs, 'YouTube playable + migration backlog must equal active songs');
  assert(playback.sessionPlayableCount === null, 'sessionPlayableCount must remain null at build time');
  assert(String(playback.sessionPlayableReason || '').includes('Runtime-dependent'), 'session playability must explain its runtime dependency');

  const digests = info?.deployment?.artifactDigestsSha256;
  if (digests !== null && digests !== undefined) {
    const keys = ['index.html', 'app.js', 'styles.css', 'data/songs.json', 'explore/index.html', 'explore/catalogue.js', 'sw.js', 'manifest.webmanifest'];
    for (const key of keys) assert(/^[0-9a-f]{64}$/.test(String(digests[key] || '')), `missing or invalid SHA-256 for ${key}`);
  }
}

async function main() {
  const artifactPath = process.argv[2] || '';
  const expectedRevision = String(process.argv[3] || '').trim().toLowerCase();
  const [index, workflow, readme, statusDoc, roadmapDoc, playbackDoc, runtimeCoverageDoc, uxPolishDoc] = await Promise.all([
    readJson('data/catalogue/index.json'),
    readText('.github/workflows/pages.yml'),
    readText('README.md'),
    readText('docs/catalogue/status.md'),
    readText('docs/project/roadmap.md'),
    readText('docs/product/youtube-first-playback.md'),
    readText('docs/product/playback-runtime-coverage.md'),
    readText('docs/product/ux-polish-pass.md'),
  ]);

  const info = artifactPath
    ? await readJson(artifactPath)
    : await createBuildInfo({ revision: expectedRevision || undefined });
  validateInfo(info, expectedRevision);

  assert(info.catalogue.version === index.version, 'build-info catalogue version must match data/catalogue/index.json');
  assert(info.catalogue.activeSongs === index.songCount, 'build-info activeSongs must match index.songCount');
  assert(info.catalogue.activeReleases === index.releaseCount, 'build-info activeReleases must match index.releaseCount');

  assert(workflow.includes('node scripts/lib/generate-build-info.mjs _site/build-info.json "$GITHUB_SHA" _site'), 'Pages workflow must generate build-info.json from the assembled artifact');
  assert(workflow.includes('node scripts/lib/validate-build-info.mjs _site/build-info.json "$GITHUB_SHA"'), 'Pages workflow must validate the emitted build identity');
  assert(workflow.includes("test -f _site/build-info.json"), 'Pages workflow must require build-info.json in the artifact');

  for (const [name, doc] of [
    ['README', readme],
    ['catalogue status', statusDoc],
    ['roadmap', roadmapDoc],
    ['YouTube playback policy', playbackDoc],
    ['playback runtime coverage', runtimeCoverageDoc],
    ['historical UX polish note', uxPolishDoc],
  ]) {
    assert(doc.includes('/build-info.json'), `${name} must point auditors to /build-info.json`);
  }

  assert(hasText(readme, 'Executable music playback is YouTube-only'), 'README must state the YouTube-only executable playback policy');
  assert(!hasText(readme, 'Spotify and Apple Music embeds where supported'), 'README still advertises non-YouTube executable playback');
  assert(!hasText(statusDoc, '585 verified song records'), 'catalogue status still contains the obsolete 585-song claim');
  assert(!hasText(statusDoc, "Spotify's embedded player"), 'catalogue status still describes Spotify as executable playback');
  assert(!hasText(roadmapDoc, 'Decide and implement authorised playback provider(s)'), 'roadmap still treats the playback provider decision as open');
  assert(!hasText(playbackDoc, 'the user clicks the YouTube button;'), 'playback policy still prescribes the retired second-step YouTube-button gate');
  assert(hasText(runtimeCoverageDoc, 'source evidence'), 'runtime coverage doc must distinguish source evidence from executable playback');
  assert(hasText(runtimeCoverageDoc, 'YouTube-only'), 'runtime coverage doc must state the executable YouTube-only policy');
  assert(hasText(uxPolishDoc, 'Status: historical implementation note'), 'UX polish pass must remain explicitly historical');
  assert(!hasText(uxPolishDoc, 'Spotify provider playback;'), 'historical UX note still asks release QA to exercise Spotify playback');

  if (process.exitCode) return;
  console.log(`✓ deployed build identity is regression-guarded at /build-info.json`);
  console.log(`✓ catalogue ${info.catalogue.version}: ${info.catalogue.activeSongs} active songs, ${info.catalogue.ordinaryListeningSongs} ordinary-listening songs`);
  console.log(`✓ YouTube-only coverage is reported separately: ${info.playback.youtubePlayable}/${info.catalogue.activeSongs}; session playability remains runtime-dependent`);
  console.log('✓ README, status, roadmap and playback docs no longer compete with current source/deployment contracts');
}

await main();
