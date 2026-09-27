import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  PROVENANCE,
  assertGraphFresh,
  buildGraph,
  checkFreshness,
  classifyPath,
  compileContextPacket,
  edgeCanHardGate,
  impactForSeeds,
} from './raas-graph.mjs';
import {
  buildRepositoryGraph,
  extractModuleSpecifiers,
  ownershipGraphInputs,
  pathMatchesClaim,
} from './raas-graph-repository.mjs';

const base = {
  repository: 'ruddvz/garba',
  baseSha: 'abc123',
  indexedSha: 'abc123',
  branch: 'feature/test',
  workspace: 'worktree-a',
  sourceStateDigest: 'source-a',
  declarationsDigest: 'decl-a',
};

const nodes = [
  { id: 'catalogue:track:t1', kind: 'catalogue-track', domains: ['catalogue'], data: { canonical: true } },
  { id: 'catalogue:playback-route:r1', kind: 'catalogue-playback-route', domains: ['catalogue', 'player'] },
  { id: 'file:youtube-player-runtime.js', kind: 'file', path: 'youtube-player-runtime.js' },
  { id: 'file:player-continuity.js', kind: 'file', path: 'player-continuity.js' },
  { id: 'file:src/catalogue/catalogue.js', kind: 'file', path: 'src/catalogue/catalogue.js' },
  { id: 'file:sw.js', kind: 'file', path: 'sw.js' },
  { id: 'file:simple-runtime.js', kind: 'file', path: 'simple-runtime.js' },
  { id: 'catalogue:track:t2', kind: 'catalogue-track', domains: ['catalogue'], data: { canonical: true } },
];

const declaredEdges = [
  { from: 'catalogue:playback-route:r1', to: 'catalogue:track:t1', type: 'ROUTED_BY', provenance: PROVENANCE.DETERMINISTIC },
  { from: 'file:youtube-player-runtime.js', to: 'catalogue:playback-route:r1', type: 'READS_FROM', provenance: PROVENANCE.DECLARED },
  { from: 'file:player-continuity.js', to: 'file:youtube-player-runtime.js', type: 'DEPENDS_ON', provenance: PROVENANCE.DECLARED },
  { from: 'file:src/catalogue/catalogue.js', to: 'catalogue:track:t1', type: 'PRESENTS_CANONICAL', provenance: PROVENANCE.DETERMINISTIC },
  { from: 'file:sw.js', to: 'file:simple-runtime.js', type: 'PACKAGES', provenance: PROVENANCE.DECLARED },
  { from: 'catalogue:track:t2', to: 'catalogue:track:t1', type: 'MAYBE_RELATED', provenance: PROVENANCE.INFERRED },
];

const graph = buildGraph({ ...base, nodes, declaredEdges });

assert.deepEqual(classifyPath('src/catalogue/catalogue.js'), ['explore']);
assert.deepEqual(classifyPath('youtube-player-runtime.js'), ['player']);
assert.deepEqual(classifyPath('sw.js'), ['pwa']);
assert.deepEqual(classifyPath('scripts/lib/validate-truthful-seek-runtime.mjs'), ['validation']);
assert.equal(edgeCanHardGate({ provenance: PROVENANCE.INFERRED }), false);
assert.equal(edgeCanHardGate({ provenance: PROVENANCE.DECLARED }), true);
assert.equal(edgeCanHardGate({ provenance: PROVENANCE.OBSERVED, data: { current: false } }), false);
assert.equal(edgeCanHardGate({ provenance: PROVENANCE.OBSERVED, data: { current: true } }), true);

const reordered = buildGraph({ ...base, nodes: [...nodes].reverse(), declaredEdges: [...declaredEdges].reverse() });
assert.equal(graph.metadata.fingerprint, reordered.metadata.fingerprint, 'fingerprint must be input-order independent');

const fresh = checkFreshness(graph, base);
assert.equal(fresh.fresh, true);
assert.equal(checkFreshness(graph, { ...base, baseSha: 'new-main' }).fresh, false);
assert.throws(() => assertGraphFresh(graph, { ...base, sourceStateDigest: 'dirty-worktree' }), /stale RAAS graph/);

const impact = impactForSeeds(graph, ['catalogue:track:t1'], { budget: { maxDepth: 4, maxNodes: 20, maxEdges: 30 } });
const hardIds = impact.hard.map((entry) => entry.node.id);
const advisoryIds = impact.advisory.map((entry) => entry.node.id);
assert(hardIds.includes('catalogue:playback-route:r1'), 'track change must reach its explicit playback route');
assert(hardIds.includes('file:youtube-player-runtime.js'), 'route impact must reach player transport');
assert(hardIds.includes('file:player-continuity.js'), 'player transport impact must reach continuity');
assert(hardIds.includes('file:src/catalogue/catalogue.js'), 'canonical track impact must reach Explore presentation');
assert(advisoryIds.includes('catalogue:track:t2'), 'inferred neighbouring identity must remain advisory');
assert(!hardIds.includes('catalogue:track:t2'), 'inferred relationship must never become hard impact');

const pwaImpact = impactForSeeds(graph, ['file:simple-runtime.js'], { budget: { maxDepth: 2 } });
assert(pwaImpact.hard.some((entry) => entry.node.id === 'file:sw.js'), 'runtime packaging impact must reach PWA service worker');

const cycleGraph = buildGraph({
  ...base,
  nodes: [
    { id: 'file:a.js', kind: 'file', path: 'a.js' },
    { id: 'file:b.js', kind: 'file', path: 'b.js' },
  ],
  declaredEdges: [
    { from: 'file:a.js', to: 'file:b.js', type: 'DEPENDS_ON', provenance: PROVENANCE.DECLARED },
    { from: 'file:b.js', to: 'file:a.js', type: 'DEPENDS_ON', provenance: PROVENANCE.DECLARED },
  ],
});
const cyclePacket = compileContextPacket(cycleGraph, ['file:a.js'], { budget: { maxDepth: 8, maxNodes: 8, maxEdges: 8 } });
assert.equal(cyclePacket.selected.length, 2, 'cycle traversal must terminate without duplicate nodes');

const bounded = compileContextPacket(graph, ['catalogue:track:t1'], { budget: { maxDepth: 8, maxNodes: 2, maxEdges: 2 } });
assert.equal(bounded.truncated, true, 'budget overflow must be explicit');
assert(bounded.selected.length <= 2);
assert(bounded.edges.length <= 2);

const unresolved = compileContextPacket(graph, ['track:t1', 'catalogue:track:t1']);
assert(unresolved.unresolved.some((item) => item.seed === 'track:t1' && item.reason === 'exact-seed-not-found'));
assert(unresolved.selected.some((entry) => entry.node.id === 'catalogue:track:t1'));

const graphOtherWorktree = buildGraph({ ...base, workspace: 'worktree-b', sourceStateDigest: 'source-b', nodes, declaredEdges });
assert.notEqual(graph.metadata.fingerprint, graphOtherWorktree.metadata.fingerprint, 'worktree/source-state changes require a distinct fingerprint');
assert.equal(graph.metadata.workspace, 'worktree-a');
assert.equal(graphOtherWorktree.metadata.workspace, 'worktree-b');

const explicitCatalogue = buildGraph({
  ...base,
  catalogueRecords: [
    {
      id: 'release-1',
      kind: 'release',
      sourcePath: 'data/catalogue/releases/releases-01.json',
      links: [],
    },
    {
      id: 'track-1',
      kind: 'track',
      sourcePath: 'data/catalogue/songs/songs-01.json',
      links: [
        {
          type: 'BELONGS_TO_RELEASE',
          to: 'catalogue:release:release-1',
          provenance: PROVENANCE.DETERMINISTIC,
        },
      ],
    },
  ],
});
assert(explicitCatalogue.edges.some((edge) => edge.type === 'BELONGS_TO_RELEASE'));
assert.throws(
  () => buildGraph({
    ...base,
    catalogueRecords: [{ id: 'track-x', kind: 'track', links: [{ type: 'MAYBE', to: 'release-guess' }] }],
  }),
  /must target an explicit catalogue node id/,
  'catalogue relationships must never be created from ambiguous shorthand',
);

const authorityUpgradeGraph = buildGraph({
  ...base,
  nodes: [
    { id: 'file:seed.js', kind: 'file', path: 'seed.js' },
    { id: 'file:bridge.js', kind: 'file', path: 'bridge.js' },
    { id: 'file:downstream.js', kind: 'file', path: 'downstream.js' },
    { id: 'file:advisory-first.js', kind: 'file', path: 'advisory-first.js' },
  ],
  declaredEdges: [
    { from: 'file:advisory-first.js', to: 'file:seed.js', type: 'MAYBE_DEPENDS_ON', provenance: PROVENANCE.INFERRED },
    { from: 'file:bridge.js', to: 'file:seed.js', type: 'DEPENDS_ON', provenance: PROVENANCE.DECLARED },
    { from: 'file:downstream.js', to: 'file:bridge.js', type: 'DEPENDS_ON', provenance: PROVENANCE.DECLARED },
    { from: 'file:downstream.js', to: 'file:advisory-first.js', type: 'MAYBE_DEPENDS_ON', provenance: PROVENANCE.INFERRED },
  ],
});
const upgradedImpact = impactForSeeds(authorityUpgradeGraph, ['file:seed.js'], { budget: { maxDepth: 4, maxNodes: 10, maxEdges: 20 } });
assert(upgradedImpact.hard.some((entry) => entry.node.id === 'file:downstream.js'), 'a later hard route must upgrade and propagate authority through descendants');

const unresolvedHeavyGraph = buildGraph({
  ...base,
  files: Array.from({ length: 8 }, (_, index) => ({ path: `src/u${index}.js`, imports: [`./missing-${index}.js`] })),
});
const boundedUnresolved = compileContextPacket(unresolvedHeavyGraph, ['file:src/u0.js'], { budget: { maxNodes: 3, maxEdges: 3, maxDepth: 1 } });
assert.equal(boundedUnresolved.unresolved.length, 3, 'context packets must bound unresolved output');
assert.equal(boundedUnresolved.truncated, true, 'unresolved truncation must be explicit');

assert.throws(
  () => buildGraph({ ...base, nodes: [{ id: 'bad', provenance: 'guessed' }] }),
  /unsupported node provenance/,
  'unknown provenance must fail closed',
);

const filesA = [
  { path: 'src/feature/a.js', imports: ['./b.js'] },
  { path: 'src/feature/b.js', imports: [] },
];
const filesB = [...filesA].reverse();
const importGraphA = buildGraph({ ...base, files: filesA });
const importGraphB = buildGraph({ ...base, files: filesB });
assert.equal(importGraphA.metadata.fingerprint, importGraphB.metadata.fingerprint);
assert(importGraphA.edges.some((edge) => edge.type === 'IMPORTS' && edge.from === 'file:src/feature/a.js' && edge.to === 'file:src/feature/b.js'));

console.log('✓ RAAS graph core: deterministic fingerprints');
console.log('✓ RAAS graph core: strict freshness and worktree isolation');
console.log('✓ RAAS graph core: bounded cycle-safe context');
console.log('✓ RAAS graph core: provider/player/Explore/PWA impact');
console.log('✓ RAAS graph core: source-first catalogue and advisory inference boundaries');

assert.deepEqual(
  extractModuleSpecifiers("import x from './x.js';\nexport { y } from './y.mjs';\nconst z = import('./z.js');"),
  ['./x.js', './y.mjs', './z.js'],
  'repository extractor must deterministically capture static/export/dynamic relative module specifiers',
);
assert.equal(pathMatchesClaim('data/catalogue/songs/songs-01.json', 'data/catalogue/**'), true);
assert.equal(pathMatchesClaim('app.js', 'data/catalogue/**'), false);

const repoRoot = await mkdtemp(path.join(tmpdir(), 'raas-graph-repo-'));
const put = async (repoPath, value) => {
  const absolute = path.join(repoRoot, repoPath);
  await mkdir(path.dirname(absolute), { recursive: true });
  await writeFile(absolute, typeof value === 'string' ? value : JSON.stringify(value), 'utf8');
};

try {
  await put('data/catalogue/index.json', {
    version: 'test',
    songChunks: ['data/catalogue/songs/songs-01.json'],
    releaseChunks: ['data/catalogue/releases/releases-01.json'],
    freeSourceChunks: ['data/catalogue/free-sources/free-01.json'],
    playbackSources: ['data/playback-sources-test.json'],
    taxonomy: 'data/taxonomy.json',
    nonstopSets: 'data/nonstop-sets.json',
    generatedFiles: {
      songs: 'data/songs.json',
      releases: 'data/releases.json',
      freeSources: 'data/free-audio-sources.json',
      releasePlayback: 'data/playback-sources-generated.json',
      playbackCoverage: 'data/playback-coverage.json',
    },
    discovery: {
      artists: ['data/discovery/artists-test.json'],
      recommendations: ['data/discovery/recommendations-test.json'],
      setsIndex: 'data/discovery/sets/index.json',
    },
  });
  await put('data/catalogue/releases/releases-01.json', [
    {
      id: 'release-1',
      title: 'Release One',
      artist: 'Artist One & Artist Two',
      categories: ['traditional-garba'],
      visualGenre: 'traditional',
    },
  ]);
  await put('data/catalogue/songs/songs-01.json', [
    {
      id: 'track-1',
      title: 'Track One',
      artist: 'Artist One & Artist Two',
      releaseId: 'release-1',
      genre: 'traditional',
      category: 'traditional-garba',
    },
    {
      id: 'track-orphan',
      title: 'Orphan Track',
      artist: 'Artist Three',
      releaseId: 'missing-release',
      genre: 'folk',
      category: 'folk-lokgeet',
    },
  ]);
  await put('data/playback-sources-test.json', {
    songSources: {
      'track-1': {
        provider: 'youtube',
        videoId: 'verified-id',
        sourceType: 'official-artist-channel',
      },
      'unknown-track': {
        provider: 'youtube',
        videoId: 'unknown-id',
        sourceType: 'official-artist-channel',
      },
    },
  });
  await put('data/catalogue/free-sources/free-01.json', []);
  await put('data/songs.json', []);
  await put('data/releases.json', []);
  await put('data/free-audio-sources.json', []);
  await put('data/playback-sources-generated.json', { songSources: {} });
  await put('data/playback-coverage.json', {});
  await put('data/taxonomy.json', { version: 1 });
  await put('data/nonstop-sets.json', []);
  await put('data/discovery/artists-test.json', []);
  await put('data/discovery/recommendations-test.json', []);
  await put('data/discovery/sets/index.json', { sets: [] });
  await put('player-continuity.js', "import './youtube-player-runtime.js';\n");
  await put('youtube-player-runtime.js', 'export const player = true;\n');

  const observedAt = '2026-09-10T22:30:00.000Z';
  const ownershipSnapshot = {
    observedAt,
    source: 'github:issue-364',
    claims: [
      {
        issue: 437,
        agent: 'chatgpt/player-437',
        branch: 'player/437',
        files: ['player-continuity.js', 'data/catalogue/**'],
        status: 'active',
      },
    ],
  };

  const repositoryGraph = await buildRepositoryGraph({
    root: repoRoot,
    baseSha: 'repo-sha-1',
    indexedSha: 'repo-sha-1',
    branch: 'feature/test',
    workspace: 'fixture-a',
    filePaths: ['youtube-player-runtime.js', 'player-continuity.js'],
    ownershipSnapshot,
    ownershipFreshness: { now: Date.parse(observedAt) + 1_000, maxAgeMs: 5_000 },
  });

  const ids = new Set(repositoryGraph.nodes.map((node) => node.id));
  assert(ids.has('catalogue:release:release-1'));
  assert(ids.has('catalogue:track:track-1'));
  assert(ids.has('catalogue:genre:traditional'));
  assert([...ids].some((id) => id.startsWith('catalogue:artist-credit:')), 'artist credit must remain a source field node rather than inferred person identities');
  assert(repositoryGraph.edges.some((edge) => edge.from === 'catalogue:track:track-1' && edge.to === 'catalogue:release:release-1' && edge.type === 'BELONGS_TO_RELEASE'));
  assert(repositoryGraph.edges.some((edge) => edge.from.startsWith('catalogue:playback-route:track-1:') && edge.to === 'catalogue:track:track-1' && edge.type === 'ROUTED_BY'));
  assert(repositoryGraph.edges.some((edge) => edge.from === 'file:player-continuity.js' && edge.to === 'file:youtube-player-runtime.js' && edge.type === 'IMPORTS'));
  assert(repositoryGraph.edges.some((edge) => edge.from === 'file:data/songs.json' && edge.to === 'file:data/catalogue/songs/songs-01.json' && edge.type === 'GENERATED_FROM'), 'canonical song shard impact must reach the generated song aggregate');

  const claimId = 'claim:437:chatgpt%2Fplayer-437';
  const claimEdge = repositoryGraph.edges.find((edge) => edge.from === 'file:player-continuity.js' && edge.to === claimId && edge.type === 'CLAIMED_BY');
  assert(claimEdge, 'current normalized ownership observation must join matching files read-only');
  assert.equal(claimEdge.provenance, PROVENANCE.OBSERVED);
  assert.equal(claimEdge.data.current, true);
  assert(repositoryGraph.edges.some((edge) => edge.from === 'file:data/catalogue/songs/songs-01.json' && edge.to === claimId && edge.type === 'CLAIMED_BY'));

  assert(!ids.has('catalogue:track:unknown-track'), 'playback manifests must not manufacture a canonical track');
  assert(repositoryGraph.unresolved.some((item) => item.seed.includes('unknown-track') && item.reason === 'edge-node-not-indexed'), 'unknown playback identities must remain unresolved');
  assert(repositoryGraph.unresolved.some((item) => item.seed.includes('missing-release') && item.reason === 'edge-node-not-indexed'), 'missing release identity must remain unresolved');
  assert.equal(repositoryGraph.extraction.catalogue.catalogueRecords, 3);
  assert.equal(repositoryGraph.extraction.catalogue.playbackRoutes, 2);
  assert.equal(repositoryGraph.extraction.ownershipClaims, 1);

  const repositoryGraphReordered = await buildRepositoryGraph({
    root: repoRoot,
    baseSha: 'repo-sha-1',
    indexedSha: 'repo-sha-1',
    branch: 'feature/test',
    workspace: 'fixture-a',
    filePaths: ['player-continuity.js', 'youtube-player-runtime.js'],
    ownershipSnapshot: { ...ownershipSnapshot, claims: ownershipSnapshot.claims.map((claim) => ({ ...claim, files: [...claim.files].reverse() })).reverse() },
    ownershipFreshness: { now: Date.parse(observedAt) + 1_000, maxAgeMs: 5_000 },
  });
  assert.equal(repositoryGraph.metadata.fingerprint, repositoryGraphReordered.metadata.fingerprint, 'repository extraction must be input-order deterministic');

  await put('youtube-player-runtime.js', 'export const player = false;\n');
  const changedSourceGraph = await buildRepositoryGraph({
    root: repoRoot,
    baseSha: 'repo-sha-1',
    indexedSha: 'repo-sha-1',
    branch: 'feature/test',
    workspace: 'fixture-a',
    filePaths: ['player-continuity.js', 'youtube-player-runtime.js'],
    ownershipSnapshot,
    ownershipFreshness: { now: Date.parse(observedAt) + 1_000, maxAgeMs: 5_000 },
  });
  assert.notEqual(repositoryGraph.metadata.fingerprint, changedSourceGraph.metadata.fingerprint, 'source content drift must invalidate the repository graph fingerprint');

  assert.throws(
    () => ownershipGraphInputs(ownershipSnapshot, ['player-continuity.js'], { now: Date.parse(observedAt) + 60_000, maxAgeMs: 5_000 }),
    /stale ownership snapshot/,
    'ownership joins must fail closed when observations are stale',
  );

  await assert.rejects(
    () => buildRepositoryGraph({
      root: repoRoot,
      baseSha: 'repo-sha-1',
      filePaths: ['../escape.js'],
    }),
    /escapes root/,
  );

  await assert.rejects(
    () => buildRepositoryGraph({
      root: repoRoot,
      baseSha: 'repo-sha-1',
      limits: { maxCatalogueRecords: 2 },
    }),
    /catalogue record budget exceeded/,
  );

  await symlink(path.join(repoRoot, 'youtube-player-runtime.js'), path.join(repoRoot, 'symlink-runtime.js'));
  await assert.rejects(
    () => buildRepositoryGraph({
      root: repoRoot,
      baseSha: 'repo-sha-1',
      filePaths: ['symlink-runtime.js'],
    }),
    /refuses symlink input/,
  );
} finally {
  await rm(repoRoot, { recursive: true, force: true });
}

console.log('✓ RAAS repository graph: canonical catalogue/playback extraction');
console.log('✓ RAAS repository graph: bounded deterministic source-state fingerprints');
console.log('✓ RAAS repository graph: fresh read-only ownership joins');
console.log('✓ RAAS repository graph: unknown identities remain unresolved');
