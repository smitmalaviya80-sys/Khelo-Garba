#!/usr/bin/env node

import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  checkFreshness,
  compileContextPacket,
  impactForSeeds,
  stableStringify,
} from './raas-graph.mjs';
import { buildRepositoryGraph } from './raas-graph-repository.mjs';

export const RAAS_GRAPH_CLI_SCHEMA = 'raas-graph-cli/v1';
export const RAAS_GRAPH_COMMANDS = Object.freeze([
  'build',
  'status',
  'context',
  'impact',
  'diff-impact',
  'preflight',
]);

const COMMAND_SET = new Set(RAAS_GRAPH_COMMANDS);
const NODE_PREFIXES = ['file:', 'catalogue:', 'claim:', 'issue:', 'branch:', 'claim-scope:'];

const canonicalJson = (value) => `${stableStringify(value)}\n`;
const sortedUnique = (values = []) => [...new Set(values.filter(Boolean).map(String))].sort();

function normalizeRepoPath(input) {
  const value = String(input ?? '').replaceAll('\\', '/');
  if (!value || value.includes('\0') || path.posix.isAbsolute(value)) {
    throw new TypeError(`invalid repository path: ${value || '(empty)'}`);
  }
  const normalized = path.posix.normalize(value).replace(/^\.\//, '');
  if (normalized === '..' || normalized.startsWith('../')) {
    throw new TypeError(`repository path escapes root: ${value}`);
  }
  return normalized;
}

function normalizeNodeSeed(seed) {
  const value = String(seed ?? '').trim();
  if (!value) throw new TypeError('seed must be a non-empty graph node id');
  if (!NODE_PREFIXES.some((prefix) => value.startsWith(prefix))) {
    throw new TypeError(`seed must use an explicit graph node id prefix: ${value}`);
  }
  return value;
}

function normalizeIssue(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number <= 0) throw new TypeError('issue must be a positive safe integer');
  return number;
}

function normalizeBudget(value = {}) {
  const budget = {};
  for (const key of ['maxNodes', 'maxEdges', 'maxDepth']) {
    if (value[key] === undefined) continue;
    const number = Number(value[key]);
    if (!Number.isSafeInteger(number) || number < 0) throw new TypeError(`${key} must be a non-negative safe integer`);
    budget[key] = number;
  }
  return budget;
}

function ensureGraph(graph) {
  if (!graph || typeof graph !== 'object' || !graph.metadata || !Array.isArray(graph.nodes) || !Array.isArray(graph.edges)) {
    throw new TypeError('graph input must be a RAAS graph object');
  }
  return graph;
}

function freshnessFor(graph, expectedFreshness = {}) {
  const checkedFields = Object.keys(expectedFreshness).filter((key) => expectedFreshness[key] !== undefined).sort();
  return {
    ...checkFreshness(graph, expectedFreshness),
    checkedFields,
  };
}

function packetSummary(packet) {
  return {
    selected: packet?.selected?.length || 0,
    edges: packet?.edges?.length || 0,
    unresolved: packet?.unresolved?.length || 0,
    truncated: packet?.truncated === true,
  };
}

function staleResult(command, graph, freshness) {
  return {
    schemaVersion: RAAS_GRAPH_CLI_SCHEMA,
    command,
    ok: false,
    state: 'stale',
    fingerprint: graph.metadata.fingerprint || null,
    freshness,
    blockers: freshness.reasons.map((reason) => ({ code: 'stale-graph', reason })),
    warnings: [],
  };
}

function ownsClaim(claimNode, targetIssue, targetAgent) {
  if (!claimNode) return false;
  const sameIssue = targetIssue !== null && claimNode.data?.issue === targetIssue;
  const sameAgent = Boolean(targetAgent) && claimNode.label === targetAgent;
  if (targetIssue !== null && targetAgent) return sameIssue && sameAgent;
  if (targetIssue !== null) return sameIssue;
  if (targetAgent) return sameAgent;
  return false;
}

function preflightConflicts(graph, changedPaths, targetIssue, targetAgent) {
  const nodes = new Map(graph.nodes.map((node) => [node.id, node]));
  const conflicts = [];
  const missing = [];

  for (const repoPath of changedPaths) {
    const fileId = `file:${repoPath}`;
    if (!nodes.has(fileId)) {
      missing.push(repoPath);
      continue;
    }
    for (const edge of graph.edges) {
      if (edge.from !== fileId || edge.type !== 'CLAIMED_BY' || edge.provenance !== 'observed' || edge.data?.current !== true) continue;
      const claim = nodes.get(edge.to);
      if (!claim || claim.kind !== 'claim' || ownsClaim(claim, targetIssue, targetAgent)) continue;
      conflicts.push({
        path: repoPath,
        issue: claim.data?.issue ?? null,
        agent: claim.label || null,
        branch: claim.data?.branch || null,
        pattern: edge.data?.pattern || null,
      });
    }
  }

  conflicts.sort((a, b) => stableStringify(a).localeCompare(stableStringify(b)));
  return { conflicts, missing };
}

export async function executeGraphCommand({
  command,
  graph = null,
  root = process.cwd(),
  repository = 'ruddvz/garba',
  baseSha,
  indexedSha = baseSha,
  branch = 'main',
  workspace = branch,
  filePaths = [],
  catalogueIndexPath = 'data/catalogue/index.json',
  ownershipSnapshot = null,
  ownershipFreshness = {},
  limits = {},
  expectedFreshness = {},
  seeds = [],
  changedPaths = [],
  targetIssue = null,
  targetAgent = null,
  buildGraph = buildRepositoryGraph,
} = {}) {
  if (!COMMAND_SET.has(command)) throw new TypeError(`unsupported RAAS graph command: ${command || '(missing)'}`);

  if (command === 'build') {
    if (!baseSha) throw new TypeError('build requires baseSha');
    const built = await buildGraph({
      root,
      repository,
      baseSha,
      indexedSha,
      branch,
      workspace,
      filePaths: sortedUnique(filePaths.map(normalizeRepoPath)),
      catalogueIndexPath: normalizeRepoPath(catalogueIndexPath),
      ownershipSnapshot,
      ownershipFreshness,
      limits,
    });
    return {
      schemaVersion: RAAS_GRAPH_CLI_SCHEMA,
      command,
      ok: true,
      state: 'built',
      fingerprint: built.metadata.fingerprint,
      summary: {
        nodes: built.nodes.length,
        edges: built.edges.length,
        unresolved: built.unresolved.length,
        extraction: built.extraction || null,
      },
      graph: built,
      blockers: [],
      warnings: built.unresolved.length ? [{ code: 'unresolved-graph-records', count: built.unresolved.length }] : [],
    };
  }

  const currentGraph = ensureGraph(graph);
  const freshness = freshnessFor(currentGraph, expectedFreshness);

  if (command === 'status') {
    return {
      schemaVersion: RAAS_GRAPH_CLI_SCHEMA,
      command,
      ok: freshness.fresh,
      state: freshness.fresh ? 'fresh' : 'stale',
      fingerprint: currentGraph.metadata.fingerprint || null,
      freshness,
      summary: {
        nodes: currentGraph.nodes.length,
        edges: currentGraph.edges.length,
        unresolved: currentGraph.unresolved?.length || 0,
        extraction: currentGraph.extraction || null,
      },
      blockers: freshness.fresh ? [] : freshness.reasons.map((reason) => ({ code: 'stale-graph', reason })),
      warnings: currentGraph.unresolved?.length ? [{ code: 'unresolved-graph-records', count: currentGraph.unresolved.length }] : [],
    };
  }

  if (!freshness.fresh) return staleResult(command, currentGraph, freshness);
  const budget = normalizeBudget(limits);

  if (command === 'context') {
    const normalizedSeeds = sortedUnique(seeds.map(normalizeNodeSeed));
    if (!normalizedSeeds.length) throw new TypeError('context requires at least one seed');
    const packet = compileContextPacket(currentGraph, normalizedSeeds, { budget });
    return {
      schemaVersion: RAAS_GRAPH_CLI_SCHEMA,
      command,
      ok: true,
      state: packet.truncated ? 'bounded' : 'complete',
      fingerprint: currentGraph.metadata.fingerprint || null,
      freshness,
      seeds: normalizedSeeds,
      summary: packetSummary(packet),
      packet,
      blockers: [],
      warnings: packet.truncated ? [{ code: 'budget-truncated' }] : [],
    };
  }

  if (command === 'impact' || command === 'diff-impact') {
    const normalizedPaths = command === 'diff-impact' ? sortedUnique(changedPaths.map(normalizeRepoPath)) : [];
    const normalizedSeeds = command === 'diff-impact'
      ? normalizedPaths.map((repoPath) => `file:${repoPath}`)
      : sortedUnique(seeds.map(normalizeNodeSeed));
    if (!normalizedSeeds.length) throw new TypeError(`${command} requires at least one ${command === 'diff-impact' ? 'changed path' : 'seed'}`);
    const packet = impactForSeeds(currentGraph, normalizedSeeds, { budget });
    return {
      schemaVersion: RAAS_GRAPH_CLI_SCHEMA,
      command,
      ok: true,
      state: packet.truncated ? 'bounded' : 'complete',
      fingerprint: currentGraph.metadata.fingerprint || null,
      freshness,
      seeds: normalizedSeeds,
      changedPaths: normalizedPaths,
      summary: {
        ...packetSummary(packet),
        hard: packet.hard.length,
        advisory: packet.advisory.length,
      },
      impact: packet,
      blockers: [],
      warnings: packet.truncated ? [{ code: 'budget-truncated' }] : [],
    };
  }

  const normalizedPaths = sortedUnique(changedPaths.map(normalizeRepoPath));
  if (!normalizedPaths.length) throw new TypeError('preflight requires at least one changed path');
  const issue = normalizeIssue(targetIssue);
  const agent = targetAgent ? String(targetAgent) : null;
  const normalizedSeeds = normalizedPaths.map((repoPath) => `file:${repoPath}`);
  const impact = impactForSeeds(currentGraph, normalizedSeeds.filter((seed) => currentGraph.nodes.some((node) => node.id === seed)), { budget });
  const { conflicts, missing } = preflightConflicts(currentGraph, normalizedPaths, issue, agent);
  const blockers = [
    ...missing.map((repoPath) => ({ code: 'path-not-indexed', path: repoPath })),
    ...conflicts.map((conflict) => ({ code: 'active-file-claim', ...conflict })),
  ];
  const warnings = [];
  if (impact.truncated) warnings.push({ code: 'budget-truncated' });
  if (impact.advisory.length) warnings.push({ code: 'advisory-impact', count: impact.advisory.length });
  if (currentGraph.unresolved?.length) warnings.push({ code: 'unresolved-graph-records', count: currentGraph.unresolved.length });

  return {
    schemaVersion: RAAS_GRAPH_CLI_SCHEMA,
    command,
    ok: blockers.length === 0,
    state: blockers.length ? 'blocked' : 'clear',
    fingerprint: currentGraph.metadata.fingerprint || null,
    freshness,
    target: { issue, agent },
    changedPaths: normalizedPaths,
    summary: {
      ...packetSummary(impact),
      hard: impact.hard.length,
      advisory: impact.advisory.length,
      directClaimConflicts: conflicts.length,
      unindexedPaths: missing.length,
    },
    impact,
    blockers,
    warnings,
  };
}

export function renderHuman(result) {
  const fingerprint = result.fingerprint ? `\nFingerprint: ${result.fingerprint}` : '';
  if (result.command === 'build') {
    return `RAAS graph build: ${result.summary.nodes} nodes · ${result.summary.edges} edges\nUnresolved: ${result.summary.unresolved}${fingerprint}`;
  }
  if (result.command === 'status') {
    const label = result.state.toUpperCase();
    const reasons = result.freshness.reasons.length ? `\nReasons: ${result.freshness.reasons.join('; ')}` : '';
    return `RAAS graph status: ${label}\nNodes: ${result.summary.nodes} · edges: ${result.summary.edges} · unresolved: ${result.summary.unresolved}${fingerprint}${reasons}`;
  }
  if (result.command === 'context') {
    return `RAAS graph context: ${result.state.toUpperCase()}\nSelected: ${result.summary.selected} · edges: ${result.summary.edges} · unresolved: ${result.summary.unresolved}${fingerprint}`;
  }
  if (result.command === 'impact' || result.command === 'diff-impact') {
    return `RAAS graph ${result.command}: ${result.state.toUpperCase()}\nHard: ${result.summary.hard} · advisory: ${result.summary.advisory} · unresolved: ${result.summary.unresolved}${fingerprint}`;
  }
  const blockers = result.blockers.length
    ? `\nBlockers:\n${result.blockers.map((item) => `- ${item.code}${item.path ? `: ${item.path}` : ''}${item.issue ? ` (#${item.issue})` : ''}`).join('\n')}`
    : '';
  const warnings = result.warnings.length
    ? `\nWarnings: ${result.warnings.map((item) => item.code).join(', ')}`
    : '';
  return `RAAS graph preflight: ${result.state.toUpperCase()}\nHard impact: ${result.summary.hard} · advisory: ${result.summary.advisory} · claim conflicts: ${result.summary.directClaimConflicts}${fingerprint}${blockers}${warnings}`;
}

function pushOption(options, key, value) {
  if (!options[key]) options[key] = [];
  options[key].push(value);
}

export function parseCliArgs(argv = []) {
  const [command, ...rest] = argv;
  if (!COMMAND_SET.has(command)) throw new TypeError(`first argument must be one of: ${RAAS_GRAPH_COMMANDS.join(', ')}`);
  const options = { command, json: false };
  const booleans = new Set(['json']);
  const repeated = new Set(['file', 'seed', 'path']);

  for (let index = 0; index < rest.length; index += 1) {
    const token = rest[index];
    if (!token.startsWith('--')) throw new TypeError(`unexpected positional argument: ${token}`);
    const key = token.slice(2);
    if (booleans.has(key)) {
      options[key] = true;
      continue;
    }
    const value = rest[index + 1];
    if (value === undefined || value.startsWith('--')) throw new TypeError(`missing value for --${key}`);
    index += 1;
    if (repeated.has(key)) pushOption(options, key, value);
    else options[key] = value;
  }
  return options;
}

function cliBudget(options) {
  return normalizeBudget({
    maxNodes: options['max-nodes'],
    maxEdges: options['max-edges'],
    maxDepth: options['max-depth'],
  });
}

function cliFreshness(options) {
  return Object.fromEntries([
    ['repository', options.repository],
    ['baseSha', options['base-sha']],
    ['indexedSha', options['indexed-sha']],
    ['branch', options.branch],
    ['workspace', options.workspace],
    ['sourceStateDigest', options['source-state-digest']],
    ['declarationsDigest', options['declarations-digest']],
    ['extractorVersion', options['extractor-version']],
  ].filter(([, value]) => value !== undefined));
}

async function readJsonFile(filePath, label) {
  try {
    return JSON.parse(await readFile(filePath, 'utf8'));
  } catch (error) {
    throw new Error(`cannot read ${label} JSON from ${filePath}: ${error.message}`);
  }
}

export async function runCli(argv = process.argv.slice(2), io = {}) {
  const options = parseCliArgs(argv);
  const graph = options.graph ? await readJsonFile(options.graph, 'graph') : null;
  const ownershipSnapshot = options.ownership ? await readJsonFile(options.ownership, 'ownership') : null;
  const limits = cliBudget(options);
  const result = await executeGraphCommand({
    command: options.command,
    graph,
    root: options.root || process.cwd(),
    repository: options.repository || 'ruddvz/garba',
    baseSha: options['base-sha'],
    indexedSha: options['indexed-sha'] || options['base-sha'],
    branch: options.branch || 'main',
    workspace: options.workspace || options.branch || 'main',
    filePaths: options.file || [],
    catalogueIndexPath: options['catalogue-index'] || 'data/catalogue/index.json',
    ownershipSnapshot,
    ownershipFreshness: options['ownership-max-age-ms'] === undefined
      ? {}
      : { maxAgeMs: Number(options['ownership-max-age-ms']) },
    limits,
    expectedFreshness: cliFreshness(options),
    seeds: options.seed || [],
    changedPaths: options.path || [],
    targetIssue: options.issue ?? null,
    targetAgent: options.agent ?? null,
  });

  if (options.command === 'build' && options.output) await writeFile(options.output, canonicalJson(result.graph), 'utf8');
  const output = options.json ? canonicalJson(result) : `${renderHuman(result)}\n`;
  (io.stdout || process.stdout).write(output);
  return result.ok ? 0 : 2;
}

const invokedDirectly = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (invokedDirectly) {
  runCli().then(
    (code) => { process.exitCode = code; },
    (error) => {
      process.stderr.write(`RAAS graph CLI error: ${error.message}\n`);
      process.exitCode = 1;
    },
  );
}
