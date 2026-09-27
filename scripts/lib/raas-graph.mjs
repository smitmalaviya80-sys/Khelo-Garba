import { createHash } from 'node:crypto';
import path from 'node:path';

export const GRAPH_SCHEMA = 'raas-graph/v1';
export const EXTRACTOR_VERSION = 'raas-graph-core/v1';
export const PROVENANCE = Object.freeze({
  DETERMINISTIC: 'deterministic',
  DECLARED: 'declared',
  OBSERVED: 'observed',
  INFERRED: 'inferred',
});

const HARD_PROVENANCE = new Set([
  PROVENANCE.DETERMINISTIC,
  PROVENANCE.DECLARED,
  PROVENANCE.OBSERVED,
]);
const VALID_PROVENANCE = new Set(Object.values(PROVENANCE));
const DEFAULT_BUDGET = Object.freeze({ maxNodes: 32, maxEdges: 96, maxDepth: 2 });

const canonicalize = (value) => {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, canonicalize(value[key])]),
  );
};

export const stableStringify = (value) => JSON.stringify(canonicalize(value));
export const sha256 = (value) => createHash('sha256').update(String(value)).digest('hex');

const normalizeRepoPath = (input = '') => path.posix.normalize(String(input).replaceAll('\\', '/')).replace(/^\.\//, '');

const isTestLike = (repoPath) =>
  /(^|\/)(tests?|__tests__)(\/|$)/.test(repoPath) ||
  /(^|\/)(test-|validate-|.*\.test\.mjs$)/.test(repoPath) ||
  repoPath.startsWith('.github/browser/');

export function classifyPath(input) {
  const repoPath = normalizeRepoPath(input);
  const domains = new Set();

  if (repoPath.startsWith('.raas/') || repoPath.includes('/raas-')) domains.add('raas');
  if (repoPath.startsWith('data/catalogue/')) domains.add('catalogue');
  if (
    repoPath.startsWith('data/discovery/') ||
    repoPath.startsWith('src/catalogue/') ||
    repoPath === 'assets/runtime/explore-search.js'
  ) domains.add('explore');
  if (
    ['app.js', 'simple-runtime.js', 'player-continuity.js', 'provider-runtime.js', 'youtube-player-runtime.js', 'nonstop-browser.js'].includes(repoPath) ||
    repoPath.startsWith('assets/runtime/seek-state') ||
    repoPath.startsWith('assets/runtime/continuous-set-state') ||
    repoPath.startsWith('assets/runtime/route-readiness')
  ) domains.add('player');
  if (
    repoPath === 'sw.js' ||
    repoPath === 'manifest.webmanifest' ||
    repoPath === 'offline.html' ||
    repoPath.includes('runtime-packaging') ||
    repoPath.includes('responsive-pwa')
  ) domains.add('pwa');
  if (
    repoPath.startsWith('assets/backgrounds/') ||
    repoPath === 'data/release-artwork.json' ||
    repoPath.includes('visual-library')
  ) domains.add('artwork');
  if (repoPath.startsWith('public-site/') || repoPath === 'robots.txt' || repoPath === 'sitemap.xml') domains.add('public');
  if (repoPath.startsWith('.github/workflows/')) domains.add('ci');
  if (isTestLike(repoPath)) domains.add('validation');

  return [...domains].sort();
}

function normalizeNode(node) {
  if (!node || typeof node !== 'object') throw new TypeError('graph node must be an object');
  if (!node.id || typeof node.id !== 'string') throw new TypeError('graph node id must be a non-empty string');
  return {
    id: node.id,
    kind: node.kind || 'unknown',
    label: node.label || node.id,
    path: node.path ? normalizeRepoPath(node.path) : null,
    domains: [...new Set(node.domains || (node.path ? classifyPath(node.path) : []))].sort(),
    provenance: (() => {
      const provenance = node.provenance || PROVENANCE.DETERMINISTIC;
      if (!VALID_PROVENANCE.has(provenance)) throw new TypeError(`unsupported node provenance: ${provenance}`);
      return provenance;
    })(),
    data: canonicalize(node.data || {}),
  };
}

function normalizeEdge(edge) {
  if (!edge || typeof edge !== 'object') throw new TypeError('graph edge must be an object');
  if (!edge.from || !edge.to || !edge.type) throw new TypeError('graph edge requires from, to and type');
  const provenance = edge.provenance || PROVENANCE.DETERMINISTIC;
  if (!VALID_PROVENANCE.has(provenance)) throw new TypeError(`unsupported edge provenance: ${provenance}`);
  return {
    from: edge.from,
    to: edge.to,
    type: edge.type,
    provenance,
    source: edge.source || null,
    data: canonicalize(edge.data || {}),
  };
}

const edgeKey = (edge) => [edge.from, edge.type, edge.to, edge.provenance, edge.source || '', stableStringify(edge.data || {})].join('\u0000');

function resolveImport(fromPath, specifier) {
  if (typeof specifier !== 'string' || !specifier.startsWith('.')) return null;
  const base = path.posix.dirname(fromPath);
  const resolved = normalizeRepoPath(path.posix.join(base, specifier));
  return path.posix.extname(resolved) ? resolved : `${resolved}.js`;
}

function buildIndexes(nodes, edges) {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const outgoing = new Map();
  const incoming = new Map();
  for (const edge of edges) {
    if (!outgoing.has(edge.from)) outgoing.set(edge.from, []);
    if (!incoming.has(edge.to)) incoming.set(edge.to, []);
    outgoing.get(edge.from).push(edge);
    incoming.get(edge.to).push(edge);
  }
  for (const list of [...outgoing.values(), ...incoming.values()]) list.sort((a, b) => edgeKey(a).localeCompare(edgeKey(b)));
  return { byId, outgoing, incoming };
}

export function edgeCanHardGate(edge) {
  if (!HARD_PROVENANCE.has(edge?.provenance) || edge?.provenance === PROVENANCE.INFERRED) return false;
  if (edge.provenance === PROVENANCE.OBSERVED) return edge.data?.current === true;
  return true;
}

export function buildGraph({
  repository = 'ruddvz/garba',
  baseSha,
  indexedSha = baseSha,
  branch = 'main',
  workspace = branch,
  sourceStateDigest,
  declarationsDigest = '',
  extractorVersion = EXTRACTOR_VERSION,
  files = [],
  nodes: explicitNodes = [],
  declaredEdges = [],
  catalogueRecords = [],
} = {}) {
  if (!baseSha || !indexedSha || !sourceStateDigest) {
    throw new TypeError('baseSha, indexedSha and sourceStateDigest are required');
  }

  const nodeMap = new Map();
  const addNode = (candidate) => {
    const node = normalizeNode(candidate);
    if (nodeMap.has(node.id) && stableStringify(nodeMap.get(node.id)) !== stableStringify(node)) {
      throw new Error(`conflicting graph node definition: ${node.id}`);
    }
    nodeMap.set(node.id, node);
  };

  for (const file of files) {
    const repoPath = normalizeRepoPath(file.path);
    addNode({
      id: `file:${repoPath}`,
      kind: 'file',
      label: repoPath,
      path: repoPath,
      provenance: PROVENANCE.DETERMINISTIC,
      data: { imports: [...new Set(file.imports || [])].sort() },
    });
  }
  for (const node of explicitNodes) addNode(node);
  for (const record of catalogueRecords) {
    if (!record?.id || !record?.kind) throw new TypeError('catalogue record requires id and kind');
    addNode({
      id: `catalogue:${record.kind}:${record.id}`,
      kind: `catalogue-${record.kind}`,
      label: record.label || record.id,
      path: record.sourcePath || null,
      domains: ['catalogue'],
      provenance: PROVENANCE.DETERMINISTIC,
      data: { canonical: true },
    });
  }

  const edges = [];
  const addEdge = (candidate) => edges.push(normalizeEdge(candidate));
  const filePathSet = new Set(files.map((file) => normalizeRepoPath(file.path)));
  const unresolved = [];

  for (const file of files) {
    const fromPath = normalizeRepoPath(file.path);
    for (const specifier of [...new Set(file.imports || [])].sort()) {
      const targetPath = resolveImport(fromPath, specifier);
      if (!targetPath) continue;
      if (!filePathSet.has(targetPath)) {
        unresolved.push({ seed: `${fromPath} -> ${specifier}`, reason: 'import-target-not-indexed' });
        continue;
      }
      addEdge({
        from: `file:${fromPath}`,
        to: `file:${targetPath}`,
        type: 'IMPORTS',
        provenance: PROVENANCE.DETERMINISTIC,
        source: fromPath,
      });
    }
  }

  for (const record of catalogueRecords) {
    const from = `catalogue:${record.kind}:${record.id}`;
    for (const link of record.links || []) {
      if (!link?.to || !link?.type) throw new TypeError(`catalogue link from ${record.id} requires to and type`);
      if (!String(link.to).startsWith('catalogue:')) {
        throw new Error(`catalogue link from ${record.id} must target an explicit catalogue node id`);
      }
      addEdge({
        from,
        to: link.to,
        type: link.type,
        provenance: link.provenance || PROVENANCE.DETERMINISTIC,
        source: record.sourcePath || null,
        data: link.data || {},
      });
    }
  }
  for (const edge of declaredEdges) addEdge(edge);

  const nodes = [...nodeMap.values()].sort((a, b) => a.id.localeCompare(b.id));
  const seenEdges = new Map();
  for (const edge of edges) {
    if (!nodeMap.has(edge.from) || !nodeMap.has(edge.to)) {
      unresolved.push({ seed: `${edge.from} -> ${edge.to}`, reason: 'edge-node-not-indexed' });
      continue;
    }
    seenEdges.set(edgeKey(edge), edge);
  }
  const normalizedEdges = [...seenEdges.values()].sort((a, b) => edgeKey(a).localeCompare(edgeKey(b)));

  const metadata = canonicalize({
    schemaVersion: GRAPH_SCHEMA,
    extractorVersion,
    repository,
    baseSha,
    indexedSha,
    branch,
    workspace,
    sourceStateDigest,
    declarationsDigest,
  });
  const fingerprint = sha256(stableStringify({ metadata, nodes, edges: normalizedEdges }));

  return {
    metadata: { ...metadata, fingerprint },
    nodes,
    edges: normalizedEdges,
    unresolved: unresolved.sort((a, b) => stableStringify(a).localeCompare(stableStringify(b))),
  };
}

export function checkFreshness(graph, expected = {}) {
  const reasons = [];
  const actual = graph?.metadata || {};
  for (const field of ['repository', 'baseSha', 'indexedSha', 'branch', 'workspace', 'sourceStateDigest', 'declarationsDigest', 'extractorVersion']) {
    if (expected[field] !== undefined && actual[field] !== expected[field]) {
      reasons.push(`${field}: expected ${expected[field]}, found ${actual[field] ?? '(missing)'}`);
    }
  }
  if (actual.schemaVersion !== GRAPH_SCHEMA) reasons.push(`schemaVersion: expected ${GRAPH_SCHEMA}, found ${actual.schemaVersion ?? '(missing)'}`);
  return { fresh: reasons.length === 0, reasons };
}

export function assertGraphFresh(graph, expected = {}) {
  const result = checkFreshness(graph, expected);
  if (!result.fresh) throw new Error(`stale RAAS graph: ${result.reasons.join('; ')}`);
  return graph;
}

function normalizeBudget(budget = {}) {
  const merged = { ...DEFAULT_BUDGET, ...budget };
  for (const key of ['maxNodes', 'maxEdges', 'maxDepth']) {
    if (!Number.isInteger(merged[key]) || merged[key] < 0) throw new TypeError(`${key} must be a non-negative integer`);
  }
  return merged;
}

function traverse(graph, seeds, { direction = 'both', budget = {}, expectedFreshness } = {}) {
  if (expectedFreshness) assertGraphFresh(graph, expectedFreshness);
  const limits = normalizeBudget(budget);
  const { byId, outgoing, incoming } = buildIndexes(graph.nodes, graph.edges);
  const selected = new Map();
  const traversedEdges = new Map();
  const unresolved = [];
  const queue = [];

  for (const seed of [...new Set(seeds || [])].sort()) {
    if (!byId.has(seed)) {
      unresolved.push({ seed, reason: 'exact-seed-not-found' });
      continue;
    }
    if (!selected.has(seed) && selected.size < limits.maxNodes) {
      selected.set(seed, { node: byId.get(seed), depth: 0, reasons: ['seed'], authority: 'hard' });
      queue.push({ id: seed, depth: 0, authority: 'hard' });
    }
  }

  let truncated = selected.size < (seeds || []).filter((seed) => byId.has(seed)).length;
  while (queue.length) {
    const current = queue.shift();
    if (current.depth >= limits.maxDepth) continue;
    const candidates = [];
    if (direction === 'both' || direction === 'outgoing') {
      for (const edge of outgoing.get(current.id) || []) candidates.push({ edge, next: edge.to, relation: 'dependency' });
    }
    if (direction === 'both' || direction === 'incoming') {
      for (const edge of incoming.get(current.id) || []) candidates.push({ edge, next: edge.from, relation: 'dependent' });
    }
    candidates.sort((a, b) => `${edgeKey(a.edge)}\u0000${a.relation}`.localeCompare(`${edgeKey(b.edge)}\u0000${b.relation}`));

    for (const candidate of candidates) {
      if (traversedEdges.size >= limits.maxEdges) {
        truncated = true;
        break;
      }
      traversedEdges.set(edgeKey(candidate.edge), candidate.edge);
      if (!byId.has(candidate.next)) continue;
      const nextAuthority = current.authority === 'hard' && edgeCanHardGate(candidate.edge) ? 'hard' : 'advisory';
      const reason = `${candidate.relation}:${candidate.edge.type}:${current.id}`;
      const existing = selected.get(candidate.next);
      if (existing) {
        if (!existing.reasons.includes(reason)) existing.reasons.push(reason);
        const nextDepth = current.depth + 1;
        if (nextDepth < existing.depth) existing.depth = nextDepth;
        if (existing.authority === 'advisory' && nextAuthority === 'hard') {
          existing.authority = 'hard';
          queue.push({ id: candidate.next, depth: existing.depth, authority: 'hard' });
        }
        continue;
      }
      if (selected.size >= limits.maxNodes) {
        truncated = true;
        continue;
      }
      const entry = {
        node: byId.get(candidate.next),
        depth: current.depth + 1,
        reasons: [reason],
        authority: nextAuthority,
      };
      selected.set(candidate.next, entry);
      queue.push({ id: candidate.next, depth: current.depth + 1, authority: nextAuthority });
    }
  }

  const entries = [...selected.values()]
    .map((entry) => ({ ...entry, reasons: [...entry.reasons].sort() }))
    .sort((a, b) => a.depth - b.depth || a.node.id.localeCompare(b.node.id));
  const provenance = Object.fromEntries(Object.values(PROVENANCE).map((value) => [value, 0]));
  for (const edge of traversedEdges.values()) provenance[edge.provenance] += 1;

  const allUnresolved = [...graph.unresolved, ...unresolved].sort((a, b) => stableStringify(a).localeCompare(stableStringify(b)));
  const boundedUnresolved = allUnresolved.slice(0, limits.maxNodes);
  if (boundedUnresolved.length < allUnresolved.length) truncated = true;

  return {
    fingerprint: graph.metadata.fingerprint,
    selected: entries,
    edges: [...traversedEdges.values()].sort((a, b) => edgeKey(a).localeCompare(edgeKey(b))),
    unresolved: boundedUnresolved,
    provenance,
    truncated,
    budget: limits,
  };
}

export function compileContextPacket(graph, seeds, options = {}) {
  return traverse(graph, seeds, { ...options, direction: 'both' });
}

export function impactForSeeds(graph, seeds, options = {}) {
  const result = traverse(graph, seeds, { ...options, direction: 'incoming' });
  return {
    ...result,
    hard: result.selected.filter((entry) => entry.authority === 'hard'),
    advisory: result.selected.filter((entry) => entry.authority === 'advisory'),
  };
}
