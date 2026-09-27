import { lstat, readFile } from 'node:fs/promises';
import path from 'node:path';
import {
  PROVENANCE,
  buildGraph,
  sha256,
  stableStringify,
} from './raas-graph.mjs';

export const REPOSITORY_EXTRACTOR_VERSION = 'raas-repository-graph/v1';
export const DEFAULT_REPOSITORY_LIMITS = Object.freeze({
  maxFiles: 320,
  maxBytes: 24 * 1024 * 1024,
  maxCatalogueRecords: 5000,
  maxPlaybackRoutes: 5000,
});

const normalizeRepoPath = (input) => {
  const value = String(input ?? '').replaceAll('\\', '/');
  if (!value || value.includes('\0') || path.posix.isAbsolute(value)) {
    throw new TypeError(`invalid repository path: ${value || '(empty)'}`);
  }
  const normalized = path.posix.normalize(value).replace(/^\.\//, '');
  if (normalized === '..' || normalized.startsWith('../')) {
    throw new TypeError(`repository path escapes root: ${value}`);
  }
  return normalized;
};

const uniqueSorted = (values) => [...new Set(values.filter(Boolean).map(normalizeRepoPath))].sort();
const sortedStrings = (values) => [...new Set((values || []).filter((value) => typeof value === 'string' && value))].sort();

export function extractModuleSpecifiers(source) {
  const found = new Set();
  const text = String(source ?? '');
  const staticPattern = /(?:^|[;\n]\s*)(?:import|export)\s+(?:[^'";\n]*?\s+from\s*)?['"]([^'"]+)['"]/gm;
  const dynamicPattern = /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
  for (const pattern of [staticPattern, dynamicPattern]) {
    let match;
    while ((match = pattern.exec(text))) found.add(match[1]);
  }
  return [...found].sort();
}

function makeReader(root, limits) {
  const absoluteRoot = path.resolve(root);
  const cache = new Map();
  let bytes = 0;

  const read = async (repoPath) => {
    const normalized = normalizeRepoPath(repoPath);
    if (cache.has(normalized)) return cache.get(normalized);
    if (cache.size >= limits.maxFiles) throw new Error(`repository graph file budget exceeded (${limits.maxFiles})`);

    const absolute = path.resolve(absoluteRoot, normalized);
    const relative = path.relative(absoluteRoot, absolute);
    if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error(`repository path escapes root: ${normalized}`);
    const info = await lstat(absolute);
    if (info.isSymbolicLink()) throw new Error(`repository graph refuses symlink input: ${normalized}`);
    if (!info.isFile()) throw new Error(`repository graph input is not a regular file: ${normalized}`);
    if (bytes + info.size > limits.maxBytes) throw new Error(`repository graph byte budget exceeded (${limits.maxBytes})`);

    const content = await readFile(absolute, 'utf8');
    bytes += Buffer.byteLength(content);
    const value = {
      path: normalized,
      content,
      digest: sha256(content),
      bytes: Buffer.byteLength(content),
    };
    cache.set(normalized, value);
    return value;
  };

  return {
    read,
    snapshot() {
      return {
        files: [...cache.values()]
          .map(({ path: repoPath, digest, bytes: size }) => ({ path: repoPath, digest, bytes: size }))
          .sort((a, b) => a.path.localeCompare(b.path)),
        bytes,
      };
    },
  };
}

const parseJson = (file) => {
  try {
    return JSON.parse(file.content);
  } catch (error) {
    throw new Error(`invalid JSON in ${file.path}: ${error.message}`);
  }
};

const creditId = (credit) => `catalogue:artist-credit:${sha256(credit).slice(0, 20)}`;
const genreId = (genre) => `catalogue:genre:${encodeURIComponent(genre)}`;
const categoryId = (category) => `catalogue:category:${encodeURIComponent(category)}`;
const playbackRouteId = (songId, manifestPath) => `catalogue:playback-route:${encodeURIComponent(songId)}:${sha256(manifestPath).slice(0, 12)}`;

function pushNode(nodeMap, node) {
  const existing = nodeMap.get(node.id);
  if (existing && stableStringify(existing) !== stableStringify(node)) {
    throw new Error(`conflicting repository graph node: ${node.id}`);
  }
  nodeMap.set(node.id, node);
}

function canonicalManifestPaths(index) {
  return uniqueSorted([
    ...(index.songChunks || []),
    ...(index.releaseChunks || []),
    ...(index.freeSourceChunks || []),
    ...(index.playbackSources || []),
    ...Object.values(index.generatedFiles || {}),
    index.taxonomy,
    index.nonstopSets,
    ...(index.discovery?.artists || []),
    ...(index.discovery?.recommendations || []),
    index.discovery?.setsIndex,
  ]);
}

async function collectCatalogue(reader, indexPath, limits) {
  const indexFile = await reader.read(indexPath);
  const index = parseJson(indexFile);
  const sourcePaths = canonicalManifestPaths(index);
  const songPaths = uniqueSorted(index.songChunks || []);
  const releasePaths = uniqueSorted(index.releaseChunks || []);
  const playbackPaths = uniqueSorted(index.playbackSources || []);
  const nodes = new Map();
  const catalogueRecords = [];
  const declaredEdges = [];
  const releaseIds = new Set();
  let catalogueCount = 0;
  let playbackRouteCount = 0;

  const sourceFiles = new Map([[indexFile.path, indexFile]]);
  for (const repoPath of sourcePaths) sourceFiles.set(repoPath, await reader.read(repoPath));

  for (const repoPath of releasePaths) {
    const rows = parseJson(sourceFiles.get(repoPath));
    if (!Array.isArray(rows)) throw new Error(`release shard must be an array: ${repoPath}`);
    for (const row of rows) {
      if (!row?.id) throw new Error(`release shard contains record without id: ${repoPath}`);
      catalogueCount += 1;
      if (catalogueCount > limits.maxCatalogueRecords) throw new Error(`catalogue record budget exceeded (${limits.maxCatalogueRecords})`);
      releaseIds.add(row.id);
      const links = [];
      if (row.artist) {
        const id = creditId(row.artist);
        pushNode(nodes, {
          id,
          kind: 'catalogue-artist-credit',
          label: row.artist,
          domains: ['catalogue'],
          provenance: PROVENANCE.DETERMINISTIC,
          data: { identity: false, canonicalField: 'artist' },
        });
        links.push({ to: id, type: 'CREDITS', provenance: PROVENANCE.DETERMINISTIC });
      }
      for (const category of sortedStrings(row.categories || [])) {
        const id = categoryId(category);
        pushNode(nodes, {
          id,
          kind: 'catalogue-category',
          label: category,
          domains: ['catalogue'],
          provenance: PROVENANCE.DETERMINISTIC,
          data: {},
        });
        links.push({ to: id, type: 'CATEGORIZED_AS', provenance: PROVENANCE.DETERMINISTIC });
      }
      if (row.visualGenre) {
        const id = genreId(row.visualGenre);
        pushNode(nodes, {
          id,
          kind: 'catalogue-genre',
          label: row.visualGenre,
          domains: ['catalogue'],
          provenance: PROVENANCE.DETERMINISTIC,
          data: {},
        });
        links.push({ to: id, type: 'PRESENTS_GENRE', provenance: PROVENANCE.DETERMINISTIC });
      }
      catalogueRecords.push({
        id: row.id,
        kind: 'release',
        label: row.displayTitle || row.title || row.id,
        sourcePath: repoPath,
        links,
      });
      declaredEdges.push({
        from: `catalogue:release:${row.id}`,
        to: `file:${repoPath}`,
        type: 'DEFINED_IN',
        provenance: PROVENANCE.DETERMINISTIC,
        source: repoPath,
      });
    }
  }

  const generatedFiles = Object.fromEntries(
    Object.entries(index.generatedFiles || {}).filter(([, value]) => typeof value === 'string' && value).map(([key, value]) => [key, normalizeRepoPath(value)]),
  );

  const generatedInputs = {
    songs: songPaths,
    releases: releasePaths,
    freeSources: uniqueSorted(index.freeSourceChunks || []),
    releasePlayback: playbackPaths.filter((repoPath) => repoPath !== generatedFiles.releasePlayback),
    playbackCoverage: uniqueSorted([...songPaths, ...playbackPaths]),
  };
  for (const [key, outputPath] of Object.entries(generatedFiles).sort(([a], [b]) => a.localeCompare(b))) {
    const inputs = generatedInputs[key] || [indexFile.path];
    for (const inputPath of inputs) {
      if (outputPath === inputPath) continue;
      declaredEdges.push({
        from: `file:${outputPath}`,
        to: `file:${inputPath}`,
        type: 'GENERATED_FROM',
        provenance: PROVENANCE.DETERMINISTIC,
        source: indexFile.path,
        data: { generatedKey: key },
      });
    }
  }

  for (const repoPath of songPaths) {
    const rows = parseJson(sourceFiles.get(repoPath));
    if (!Array.isArray(rows)) throw new Error(`song shard must be an array: ${repoPath}`);
    for (const row of rows) {
      if (!row?.id) throw new Error(`song shard contains record without id: ${repoPath}`);
      catalogueCount += 1;
      if (catalogueCount > limits.maxCatalogueRecords) throw new Error(`catalogue record budget exceeded (${limits.maxCatalogueRecords})`);
      const links = [];
      if (row.releaseId) links.push({
        to: `catalogue:release:${row.releaseId}`,
        type: 'BELONGS_TO_RELEASE',
        provenance: PROVENANCE.DETERMINISTIC,
        data: { targetKnownInManifest: releaseIds.has(row.releaseId) },
      });
      if (row.artist) {
        const id = creditId(row.artist);
        pushNode(nodes, {
          id,
          kind: 'catalogue-artist-credit',
          label: row.artist,
          domains: ['catalogue'],
          provenance: PROVENANCE.DETERMINISTIC,
          data: { identity: false, canonicalField: 'artist' },
        });
        links.push({ to: id, type: 'CREDITS', provenance: PROVENANCE.DETERMINISTIC });
      }
      if (row.genre) {
        const id = genreId(row.genre);
        pushNode(nodes, {
          id,
          kind: 'catalogue-genre',
          label: row.genre,
          domains: ['catalogue'],
          provenance: PROVENANCE.DETERMINISTIC,
          data: {},
        });
        links.push({ to: id, type: 'PRESENTS_GENRE', provenance: PROVENANCE.DETERMINISTIC });
      }
      if (row.category) {
        const id = categoryId(row.category);
        pushNode(nodes, {
          id,
          kind: 'catalogue-category',
          label: row.category,
          domains: ['catalogue'],
          provenance: PROVENANCE.DETERMINISTIC,
          data: {},
        });
        links.push({ to: id, type: 'CATEGORIZED_AS', provenance: PROVENANCE.DETERMINISTIC });
      }
      catalogueRecords.push({
        id: row.id,
        kind: 'track',
        label: row.displayTitle || row.title || row.id,
        sourcePath: repoPath,
        links,
      });
      declaredEdges.push({
        from: `catalogue:track:${row.id}`,
        to: `file:${repoPath}`,
        type: 'DEFINED_IN',
        provenance: PROVENANCE.DETERMINISTIC,
        source: repoPath,
      });
    }
  }

  for (const repoPath of playbackPaths) {
    const payload = parseJson(sourceFiles.get(repoPath));
    const songSources = payload?.songSources;
    if (songSources === undefined) continue;
    if (!songSources || typeof songSources !== 'object' || Array.isArray(songSources)) {
      throw new Error(`playback manifest songSources must be an object: ${repoPath}`);
    }
    for (const songId of Object.keys(songSources).sort()) {
      const source = songSources[songId];
      if (!source || typeof source !== 'object' || Array.isArray(source)) continue;
      playbackRouteCount += 1;
      if (playbackRouteCount > limits.maxPlaybackRoutes) throw new Error(`playback route budget exceeded (${limits.maxPlaybackRoutes})`);
      const routeId = playbackRouteId(songId, repoPath);
      pushNode(nodes, {
        id: routeId,
        kind: 'catalogue-playback-route',
        label: `${songId} via ${source.provider || 'unknown'}`,
        domains: ['catalogue', 'player'],
        provenance: PROVENANCE.DETERMINISTIC,
        data: {
          songId,
          provider: source.provider || null,
          sourceType: source.sourceType || null,
          evidenceType: source.evidenceType || null,
          manifest: repoPath,
        },
      });
      declaredEdges.push({
        from: routeId,
        to: `catalogue:track:${songId}`,
        type: 'ROUTED_BY',
        provenance: PROVENANCE.DETERMINISTIC,
        source: repoPath,
      });
      declaredEdges.push({
        from: routeId,
        to: `file:${repoPath}`,
        type: 'DEFINED_IN',
        provenance: PROVENANCE.DETERMINISTIC,
        source: repoPath,
      });
    }
  }

  return {
    index,
    nodes: [...nodes.values()].sort((a, b) => a.id.localeCompare(b.id)),
    catalogueRecords: catalogueRecords.sort((a, b) => `${a.kind}:${a.id}`.localeCompare(`${b.kind}:${b.id}`)),
    declaredEdges,
    sourceFiles: [...sourceFiles.values()],
    counts: {
      releases: releaseIds.size,
      catalogueRecords: catalogueCount,
      playbackRoutes: playbackRouteCount,
      manifestFiles: sourcePaths.length + 1,
    },
  };
}

const globToRegExp = (pattern) => {
  const normalized = normalizeRepoPath(pattern);
  let expression = '^';
  for (let index = 0; index < normalized.length; index += 1) {
    const character = normalized[index];
    if (character === '*' && normalized[index + 1] === '*') {
      expression += '.*';
      index += 1;
    } else if (character === '*') expression += '[^/]*';
    else if (character === '?') expression += '[^/]';
    else expression += character.replace(/[|\\{}()[\]^$+?.]/g, '\\$&');
  }
  expression += '$';
  return new RegExp(expression);
};

export function pathMatchesClaim(repoPath, pattern) {
  return globToRegExp(pattern).test(normalizeRepoPath(repoPath));
}

export function ownershipGraphInputs(snapshot, filePaths, { now = Date.now(), maxAgeMs = 5 * 60 * 1000 } = {}) {
  if (!snapshot || typeof snapshot !== 'object') return { nodes: [], edges: [], digest: sha256('no-ownership-snapshot') };
  const observedAtMs = Date.parse(snapshot.observedAt);
  if (!Number.isFinite(observedAtMs)) throw new TypeError('ownership snapshot requires a valid observedAt timestamp');
  const age = now - observedAtMs;
  if (age < -60_000 || age > maxAgeMs) throw new Error(`stale ownership snapshot: age=${age}ms max=${maxAgeMs}ms`);
  if (!Array.isArray(snapshot.claims)) throw new TypeError('ownership snapshot claims must be an array');

  const nodes = new Map();
  const edges = [];
  const paths = uniqueSorted(filePaths || []);
  const source = snapshot.source || 'github:issue-364';
  const claims = [...snapshot.claims]
    .filter((claim) => claim?.status === undefined || claim.status === 'active')
    .map((claim) => ({ ...claim, files: Array.isArray(claim.files) ? uniqueSorted(claim.files) : claim.files }))
    .sort((a, b) => `${a.issue}:${a.agent}:${a.branch}`.localeCompare(`${b.issue}:${b.agent}:${b.branch}`));

  for (const claim of claims) {
    if (!Number.isInteger(claim.issue) || claim.issue <= 0) throw new TypeError('ownership claim issue must be a positive integer');
    if (!claim.agent || !claim.branch || !Array.isArray(claim.files)) throw new TypeError(`ownership claim #${claim.issue} requires agent, branch and files[]`);
    const claimId = `claim:${claim.issue}:${encodeURIComponent(claim.agent)}`;
    const issueId = `issue:${claim.issue}`;
    const branchId = `branch:${encodeURIComponent(claim.branch)}`;
    for (const node of [
      { id: claimId, kind: 'claim', label: claim.agent, domains: ['raas'], provenance: PROVENANCE.OBSERVED, data: { issue: claim.issue, branch: claim.branch } },
      { id: issueId, kind: 'issue', label: `#${claim.issue}`, domains: ['raas'], provenance: PROVENANCE.OBSERVED, data: {} },
      { id: branchId, kind: 'branch', label: claim.branch, domains: ['raas'], provenance: PROVENANCE.OBSERVED, data: {} },
    ]) pushNode(nodes, node);

    const observationData = { current: true, observedAt: snapshot.observedAt, source };
    edges.push({ from: claimId, to: issueId, type: 'OBSERVED_IN', provenance: PROVENANCE.OBSERVED, source, data: observationData });
    edges.push({ from: branchId, to: claimId, type: 'OWNED_BY', provenance: PROVENANCE.OBSERVED, source, data: observationData });

    for (const pattern of uniqueSorted(claim.files)) {
      const scopeId = `claim-scope:${claim.issue}:${sha256(pattern).slice(0, 16)}`;
      pushNode(nodes, {
        id: scopeId,
        kind: 'claim-scope',
        label: pattern,
        domains: ['raas'],
        provenance: PROVENANCE.OBSERVED,
        data: { pattern },
      });
      edges.push({ from: scopeId, to: claimId, type: 'CLAIMED_BY', provenance: PROVENANCE.OBSERVED, source, data: observationData });
      for (const repoPath of paths) {
        if (!pathMatchesClaim(repoPath, pattern)) continue;
        edges.push({ from: `file:${repoPath}`, to: claimId, type: 'CLAIMED_BY', provenance: PROVENANCE.OBSERVED, source, data: { ...observationData, pattern } });
      }
    }
  }

  return {
    nodes: [...nodes.values()].sort((a, b) => a.id.localeCompare(b.id)),
    edges: edges.sort((a, b) => stableStringify(a).localeCompare(stableStringify(b))),
    digest: sha256(stableStringify({ observedAt: snapshot.observedAt, source, claims })),
  };
}

export async function buildRepositoryGraph({
  root,
  repository = 'ruddvz/garba',
  baseSha,
  indexedSha = baseSha,
  branch = 'main',
  workspace = branch,
  filePaths = [],
  catalogueIndexPath = 'data/catalogue/index.json',
  ownershipSnapshot = null,
  ownershipFreshness = {},
  limits: requestedLimits = {},
} = {}) {
  if (!root) throw new TypeError('root is required');
  const limits = { ...DEFAULT_REPOSITORY_LIMITS, ...requestedLimits };
  for (const [key, value] of Object.entries(limits)) {
    if (!Number.isInteger(value) || value <= 0) throw new TypeError(`${key} must be a positive integer`);
  }

  const reader = makeReader(root, limits);
  const catalogue = await collectCatalogue(reader, normalizeRepoPath(catalogueIndexPath), limits);
  for (const repoPath of uniqueSorted(filePaths)) await reader.read(repoPath);

  const readerState = reader.snapshot();
  const fileInputs = [];
  for (const source of readerState.files) {
    const file = await reader.read(source.path);
    const extension = path.posix.extname(source.path);
    fileInputs.push({
      path: source.path,
      imports: extension === '.js' || extension === '.mjs' ? extractModuleSpecifiers(file.content) : [],
    });
  }

  const ownership = ownershipGraphInputs(ownershipSnapshot, readerState.files.map((file) => file.path), ownershipFreshness);
  const sourceStateDigest = sha256(stableStringify(readerState.files.map(({ path: repoPath, digest }) => ({ path: repoPath, digest }))));
  const declarationsDigest = sha256(stableStringify({
    catalogueIndexPath: normalizeRepoPath(catalogueIndexPath),
    ownership: ownership.digest,
    limits,
  }));

  const graph = buildGraph({
    repository,
    baseSha,
    indexedSha,
    branch,
    workspace,
    sourceStateDigest,
    declarationsDigest,
    extractorVersion: REPOSITORY_EXTRACTOR_VERSION,
    files: fileInputs,
    nodes: [...catalogue.nodes, ...ownership.nodes],
    catalogueRecords: catalogue.catalogueRecords,
    declaredEdges: [...catalogue.declaredEdges, ...ownership.edges],
  });

  return {
    ...graph,
    extraction: {
      files: readerState.files.length,
      bytes: readerState.bytes,
      catalogue: catalogue.counts,
      ownershipClaims: ownershipSnapshot?.claims?.filter((claim) => claim?.status === undefined || claim.status === 'active').length || 0,
    },
  };
}
