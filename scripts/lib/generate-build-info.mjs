import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const thisFile = fileURLToPath(import.meta.url);
const root = path.resolve(path.dirname(thisFile), '../..');

const readJson = async (file) => JSON.parse(await readFile(path.resolve(root, file), 'utf8'));

async function mergeJson(paths = []) {
  return (await Promise.all(paths.map(readJson))).flat();
}

function resolveRevision(explicitRevision = '') {
  const supplied = String(explicitRevision || process.env.GITHUB_SHA || '').trim().toLowerCase();
  if (/^[0-9a-f]{40}$/.test(supplied)) return supplied;
  try {
    const revision = execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim().toLowerCase();
    if (/^[0-9a-f]{40}$/.test(revision)) return revision;
  } catch {
    // The explicit error below is more useful than the git failure itself.
  }
  throw new Error('Build identity requires a full 40-character Git commit SHA.');
}

function youtubeCoverageReport() {
  const output = execFileSync(process.execPath, [path.resolve(root, 'scripts/report-youtube-first-coverage.mjs')], {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  return JSON.parse(output);
}

const ordinaryListeningRow = (row) => String(row?.presentationRole || 'catalogue') === 'catalogue';
const hasSourceEvidence = (song) => Boolean(
  song?.audioUrl
  || song?.youtubeId
  || String(song?.playbackProvider || '').trim()
  || String(song?.playbackSourceUrl || '').trim(),
);

async function sha256(file) {
  const bytes = await readFile(file);
  return createHash('sha256').update(bytes).digest('hex');
}

async function artifactDigests(artifactDir) {
  if (!artifactDir) return null;
  const absolute = path.resolve(root, artifactDir);
  const targets = [
    'index.html',
    'app.js',
    'styles.css',
    'data/songs.json',
    'explore/index.html',
    'explore/catalogue.js',
    'sw.js',
    'manifest.webmanifest',
  ];
  const entries = await Promise.all(targets.map(async (relative) => [relative, await sha256(path.join(absolute, relative))]));
  return Object.fromEntries(entries);
}

export async function createBuildInfo({ revision, artifactDir } = {}) {
  const [index, pkg, songs, releases] = await Promise.all([
    readJson('data/catalogue/index.json'),
    readJson('package.json'),
    readJson('data/songs.json'),
    readJson('data/releases.json'),
  ]);
  const [rawSongs, rawReleases] = await Promise.all([
    mergeJson(index.songChunks),
    mergeJson(index.releaseChunks),
  ]);
  const coverage = youtubeCoverageReport();
  const resolvedRevision = resolveRevision(revision);
  const digests = await artifactDigests(artifactDir);

  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    app: {
      name: 'PlayGarba',
      packageVersion: pkg.version,
    },
    build: {
      revision: resolvedRevision,
      shortRevision: resolvedRevision.slice(0, 12),
      repository: process.env.GITHUB_REPOSITORY || 'ruddvz/garba',
      workflowRunId: process.env.GITHUB_RUN_ID || null,
      workflowRunAttempt: process.env.GITHUB_RUN_ATTEMPT || null,
    },
    deployment: {
      origin: 'https://playgarba.com',
      artifact: 'single-github-pages',
      routes: {
        player: '/',
        explore: '/explore/',
        legacyExploreAlias: '/catalogue/',
        diagnostic: '/build-info.json',
      },
      artifactDigestsSha256: digests,
    },
    catalogue: {
      version: index.version,
      rawSourceSongs: rawSongs.length,
      retiredSongs: Array.isArray(index.retiredSongIds) ? index.retiredSongIds.length : 0,
      activeSongs: songs.length,
      ordinaryListeningSongs: songs.filter(ordinaryListeningRow).length,
      rawSourceReleases: rawReleases.length,
      retiredReleases: Array.isArray(index.retiredReleaseIds) ? index.retiredReleaseIds.length : 0,
      activeReleases: releases.length,
      ordinaryListeningReleases: releases.filter(ordinaryListeningRow).length,
      taxonomyCategories: Number(index.categoryCount || 0),
      freeAccessResources: Number(index.freeSourceCount || 0),
    },
    playback: {
      sourceEvidenceMapped: songs.filter(hasSourceEvidence).length,
      youtubePlayable: coverage.youtubePlayable,
      youtubePlayableCoveragePercent: coverage.youtubePlayableCoveragePercent,
      youtubeChaptered: coverage.youtubeChaptered,
      youtubeUntimestamped: coverage.youtubeUntimestamped,
      migrationBacklog: coverage.migrationBacklog,
      referenceOrManualBacklog: coverage.youtubeReferenceOnly + coverage.youtubeUnchapteredManual,
      sessionPlayableCount: null,
      sessionPlayableReason: 'Runtime-dependent: an exact YouTube route must also load and remain usable in the current browser/network/embed session.',
    },
    definitions: {
      rawSourceSongs: 'All indexed source-song rows before retired IDs are removed.',
      activeSongs: 'Generated non-retired catalogue rows in data/songs.json, including provenance-only presentation rows.',
      ordinaryListeningSongs: 'Active rows whose presentationRole is catalogue; hidden aliases, source-only editions and Nonstop-only handoffs are excluded.',
      sourceEvidenceMapped: 'Active rows carrying retained source evidence. This is not executable-playback coverage.',
      youtubePlayable: 'Active rows classified by the repository YouTube coverage report as exact controllable YouTube routes.',
      sessionPlayableCount: 'Never asserted at build time; current-session playability also depends on browser, network, embed availability and runtime state.',
    },
  };
}

async function main() {
  const output = process.argv[2] || 'build-info.json';
  const revision = process.argv[3] || '';
  const artifactDir = process.argv[4] || '';
  const info = await createBuildInfo({ revision, artifactDir });
  const absoluteOutput = path.resolve(root, output);
  await writeFile(absoluteOutput, `${JSON.stringify(info, null, 2)}\n`);
  console.log(`Generated ${path.relative(root, absoluteOutput)} for ${info.build.shortRevision} · catalogue ${info.catalogue.version} · YouTube ${info.playback.youtubePlayable}/${info.catalogue.activeSongs}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === thisFile) {
  await main();
}
