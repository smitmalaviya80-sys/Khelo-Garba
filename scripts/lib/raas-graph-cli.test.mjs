import assert from 'node:assert/strict';
import { PROVENANCE, buildGraph } from './raas-graph.mjs';
import {
  RAAS_GRAPH_CLI_SCHEMA,
  executeGraphCommand,
  parseCliArgs,
  renderHuman,
} from './raas-graph-cli.mjs';

const base = {
  repository: 'ruddvz/garba',
  baseSha: 'main-a',
  indexedSha: 'main-a',
  branch: 'feature/test',
  workspace: 'worktree-test',
  sourceStateDigest: 'source-a',
  declarationsDigest: 'decl-a',
};

const graph = buildGraph({
  ...base,
  files: [
    { path: 'src/a.js', imports: [] },
    { path: 'src/b.js', imports: [] },
    { path: 'src/c.js', imports: [] },
  ],
  nodes: [
    {
      id: 'claim:42:chatgpt%2Fother',
      kind: 'claim',
      label: 'chatgpt/other',
      domains: ['raas'],
      provenance: PROVENANCE.OBSERVED,
      data: { issue: 42, branch: 'feature/other' },
    },
  ],
  declaredEdges: [
    {
      from: 'file:src/b.js',
      to: 'file:src/a.js',
      type: 'DEPENDS_ON',
      provenance: PROVENANCE.DECLARED,
    },
    {
      from: 'file:src/c.js',
      to: 'file:src/a.js',
      type: 'MAYBE_DEPENDS_ON',
      provenance: PROVENANCE.INFERRED,
    },
    {
      from: 'file:src/a.js',
      to: 'claim:42:chatgpt%2Fother',
      type: 'CLAIMED_BY',
      provenance: PROVENANCE.OBSERVED,
      source: 'github:issue-364',
      data: { current: true, pattern: 'src/a.js', observedAt: '2026-09-10T22:00:00Z' },
    },
  ],
});

const freshStatus = await executeGraphCommand({
  command: 'status',
  graph,
  expectedFreshness: base,
});
assert.equal(freshStatus.schemaVersion, RAAS_GRAPH_CLI_SCHEMA);
assert.equal(freshStatus.ok, true);
assert.equal(freshStatus.state, 'fresh');
assert.deepEqual(freshStatus.freshness.checkedFields, Object.keys(base).sort());

const staleStatus = await executeGraphCommand({
  command: 'status',
  graph,
  expectedFreshness: { baseSha: 'main-b' },
});
assert.equal(staleStatus.ok, false);
assert.equal(staleStatus.state, 'stale');
assert(staleStatus.blockers.some((item) => item.code === 'stale-graph'));

const staleContext = await executeGraphCommand({
  command: 'context',
  graph,
  expectedFreshness: { sourceStateDigest: 'dirty' },
  seeds: ['file:src/a.js'],
});
assert.equal(staleContext.ok, false);
assert.equal(staleContext.state, 'stale');
assert.equal('packet' in staleContext, false, 'stale context must fail closed before traversal');

const context = await executeGraphCommand({
  command: 'context',
  graph,
  seeds: ['file:src/a.js'],
  limits: { maxDepth: 2, maxNodes: 10, maxEdges: 10 },
});
assert.equal(context.ok, true);
assert(context.packet.selected.some((entry) => entry.node.id === 'file:src/a.js'));
assert(context.packet.selected.some((entry) => entry.node.id === 'file:src/b.js'));

const impact = await executeGraphCommand({
  command: 'impact',
  graph,
  seeds: ['file:src/a.js'],
  limits: { maxDepth: 2, maxNodes: 10, maxEdges: 10 },
});
assert(impact.impact.hard.some((entry) => entry.node.id === 'file:src/b.js'));
assert(impact.impact.advisory.some((entry) => entry.node.id === 'file:src/c.js'));
assert.equal(impact.summary.hard >= 2, true, 'impact includes the hard seed and hard dependent');

const diffImpact = await executeGraphCommand({
  command: 'diff-impact',
  graph,
  changedPaths: ['src/a.js'],
});
assert.deepEqual(diffImpact.changedPaths, ['src/a.js']);
assert.deepEqual(diffImpact.seeds, ['file:src/a.js']);
assert(diffImpact.impact.hard.some((entry) => entry.node.id === 'file:src/b.js'));

const blockedPreflight = await executeGraphCommand({
  command: 'preflight',
  graph,
  changedPaths: ['src/a.js'],
  targetIssue: 99,
  targetAgent: 'chatgpt/current',
});
assert.equal(blockedPreflight.ok, false);
assert.equal(blockedPreflight.state, 'blocked');
assert.deepEqual(blockedPreflight.blockers[0], {
  code: 'active-file-claim',
  path: 'src/a.js',
  issue: 42,
  agent: 'chatgpt/other',
  branch: 'feature/other',
  pattern: 'src/a.js',
});
assert(blockedPreflight.warnings.some((item) => item.code === 'advisory-impact'));

const ownPreflight = await executeGraphCommand({
  command: 'preflight',
  graph,
  changedPaths: ['src/a.js'],
  targetIssue: 42,
  targetAgent: 'chatgpt/other',
});
assert.equal(ownPreflight.ok, true);
assert.equal(ownPreflight.state, 'clear');
assert.equal(ownPreflight.summary.directClaimConflicts, 0);

const wrongAgentSameIssue = await executeGraphCommand({
  command: 'preflight',
  graph,
  changedPaths: ['src/a.js'],
  targetIssue: 42,
  targetAgent: 'chatgpt/different',
});
assert.equal(wrongAgentSameIssue.ok, false, 'same issue must not hide a different accepted owner when agent identity is supplied');

const missingPath = await executeGraphCommand({
  command: 'preflight',
  graph,
  changedPaths: ['src/not-indexed.js'],
  targetIssue: 42,
  targetAgent: 'chatgpt/other',
});
assert.equal(missingPath.ok, false);
assert.deepEqual(missingPath.blockers, [{ code: 'path-not-indexed', path: 'src/not-indexed.js' }]);

await assert.rejects(
  () => executeGraphCommand({ command: 'context', graph, seeds: ['src/a.js'] }),
  /explicit graph node id prefix/,
  'ambiguous shorthand seeds must fail closed',
);
await assert.rejects(
  () => executeGraphCommand({ command: 'diff-impact', graph, changedPaths: ['../escape.js'] }),
  /escapes root/,
  'diff paths must not escape repository root',
);

const fakeBuiltGraph = { ...graph, extraction: { files: 3, bytes: 30, catalogue: {}, ownershipClaims: 1 } };
let buildArgs = null;
const buildResult = await executeGraphCommand({
  command: 'build',
  root: '/repo',
  baseSha: 'main-a',
  branch: 'feature/test',
  workspace: 'worktree-test',
  filePaths: ['src/b.js', 'src/a.js', 'src/a.js'],
  buildGraph: async (args) => {
    buildArgs = args;
    return fakeBuiltGraph;
  },
});
assert.equal(buildResult.ok, true);
assert.deepEqual(buildArgs.filePaths, ['src/a.js', 'src/b.js']);
assert.equal(buildResult.summary.nodes, graph.nodes.length);

assert.deepEqual(
  parseCliArgs(['impact', '--graph', 'graph.json', '--seed', 'file:b.js', '--seed', 'file:a.js', '--json']),
  {
    command: 'impact',
    json: true,
    graph: 'graph.json',
    seed: ['file:b.js', 'file:a.js'],
  },
);
assert.throws(() => parseCliArgs(['unknown']), /first argument must be one of/);
assert.throws(() => parseCliArgs(['status', 'extra']), /unexpected positional argument/);

for (const result of [freshStatus, staleStatus, context, impact, diffImpact, blockedPreflight, ownPreflight, buildResult]) {
  const output = renderHuman(result);
  assert.equal(typeof output, 'string');
  assert(output.startsWith('RAAS graph'));
  assert.equal(output.includes('\u001b'), false, 'human output must not rely on ANSI semantics');
}

console.log('✓ RAAS graph CLI: versioned status and strict freshness');
console.log('✓ RAAS graph CLI: bounded context, impact and diff-impact');
console.log('✓ RAAS graph CLI: read-only claim-aware preflight');
console.log('✓ RAAS graph CLI: deterministic explicit inputs and human output');
