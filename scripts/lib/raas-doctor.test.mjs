import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  DOCTOR_SCHEMA,
  NEXT_ACTIONS,
  evaluateDoctor,
  inspectLocalRepository,
  parseArgs,
  renderHuman,
  renderJson,
  runDoctorCli,
} from './raas-doctor.mjs';

const NOW = Date.parse('2026-09-10T22:50:00Z');
const config = {
  routes: [
    {
      id: 'playback',
      label: 'Playback and provider routing',
      truthSources: ['docs/catalogue/rights.md', 'package.json'],
      likelyFiles: ['app.js', 'assets/runtime/**'],
      risks: ['wrong recording identity', 'provider-state divergence'],
    },
    {
      id: 'deployment',
      label: 'Hosting, deployment and canonical domain',
      truthSources: ['docs/operations/**', 'CNAME'],
      likelyFiles: ['CNAME', '.github/workflows/**'],
      risks: ['deployment drift'],
    },
  ],
};

function fixture(overrides = {}) {
  const value = {
    repository: {
      slug: 'ruddvz/garba',
      mainSha: 'main123',
      headSha: 'head123',
      branch: 'raas/test',
      ahead: 0,
      behind: 0,
      dirty: false,
      dirtyFiles: [],
      driftKnown: true,
      remoteState: 'fresh',
      remoteObservedAt: '2026-09-10T22:49:00Z',
    },
    target: { issue: 761, agentId: 'chatgpt/test', route: 'deployment' },
    claim: { status: 'accepted', branch: 'raas/test', files: ['src/a.js'] },
    scope: { modified: [] },
    graph: { available: true, fresh: true, blastRadius: [] },
    validation: { local: 'unknown', ci: 'unknown', required: ['node test.mjs'] },
    pr: { status: 'none' },
    hardPrerequisites: [],
    completionSatisfied: false,
  };
  for (const [key, patch] of Object.entries(overrides)) {
    value[key] = patch && typeof patch === 'object' && !Array.isArray(patch)
      ? { ...(value[key] || {}), ...patch }
      : patch;
  }
  return value;
}

const cases = [
  ['REFRESH', { repository: { remoteState: 'stale' } }],
  ['WAIT', { claim: { sameIssueConflict: { issue: 999, agent: 'other/agent' } } }],
  ['NARROW', { scope: { modified: ['src/b.js'] } }],
  ['CLAIM', { claim: { status: 'missing', branch: null, files: [] } }],
  ['REBASE', { repository: { behind: 2 } }],
  ['IMPLEMENT', {}],
  ['TEST', { scope: { modified: ['src/a.js'] }, validation: { local: 'not-run', ci: 'not-run' } }],
  ['OPEN PR', { scope: { modified: ['src/a.js'] }, validation: { local: 'pass', localHeadSha: 'head123', ci: 'not-run' } }],
  ['REVIEW', { scope: { modified: ['src/a.js'] }, validation: { local: 'pass', localHeadSha: 'head123', ci: 'pending' }, pr: { status: 'open', number: 100, current: true } }],
  ['RELEASE', { scope: { modified: ['src/a.js'] }, validation: { local: 'pass', localHeadSha: 'head123', ci: 'pass' }, pr: { status: 'merged', number: 100 } }],
  ['DONE', { claim: { status: 'released', branch: null, files: [] }, pr: { status: 'merged', number: 100 }, completionSatisfied: true }],
];

const snapshots = [];
for (const [expected, patch] of cases) {
  const state = evaluateDoctor(fixture(patch), { now: NOW, config });
  assert.equal(state.nextAction.code, expected, `${expected} precedence fixture`);
  assert.match(renderHuman(state), new RegExp(`^RAAS doctor: ${expected}\\n`));
  snapshots.push({
    action: state.nextAction.code,
    blockers: state.blockers.map((item) => item.code),
    warnings: state.warnings.map((item) => item.code),
  });
}
assert.deepEqual([...new Set(cases.map(([action]) => action))], NEXT_ACTIONS, 'fixtures must cover every next action exactly once');
assert.deepEqual(snapshots.map((item) => item.action), NEXT_ACTIONS, 'state snapshots must preserve action precedence order');

const ciFailure = evaluateDoctor(fixture({
  scope: { modified: ['src/a.js'] },
  validation: { local: 'pass', localHeadSha: 'head123', ci: 'fail', failedChecks: ['Validate GARBA'] },
  pr: { status: 'open', number: 100 },
}), { now: NOW, config });
assert.equal(ciFailure.nextAction.code, 'REVIEW');
assert(ciFailure.blockers.some((item) => item.code === 'CI_FAILED'));

const cancelled = evaluateDoctor(fixture({
  scope: { modified: ['src/a.js'] },
  validation: { local: 'pass', localHeadSha: 'head123', ci: 'cancelled' },
  pr: { status: 'open', number: 100 },
}), { now: NOW, config });
assert.equal(cancelled.nextAction.code, 'REVIEW');
assert(cancelled.warnings.some((item) => item.code === 'CI_CANCELLED'));
assert(!cancelled.blockers.some((item) => item.code === 'CI_FAILED'));

const staleGraph = evaluateDoctor(fixture({ graph: { available: true, fresh: false, blastRadius: ['file:app.js'] } }), { now: NOW, config });
assert.equal(staleGraph.nextAction.code, 'IMPLEMENT');
assert(staleGraph.warnings.some((item) => item.code === 'GRAPH_STALE'));

const playback = evaluateDoctor(fixture({ target: { issue: 761, agentId: 'chatgpt/test', route: 'playback' } }), { now: NOW, config });
assert.deepEqual(playback.truth.truthSources, ['docs/catalogue/rights.md', 'package.json']);
assert(playback.warnings.some((item) => item.code === 'TRUTH_SENSITIVE'));

const globClaim = evaluateDoctor(fixture({
  claim: { status: 'accepted', branch: 'raas/test', files: ['src/**'] },
  scope: { modified: ['src/feature/a.js'] },
  validation: { local: 'not-run', ci: 'not-run' },
}), { now: NOW, config });
assert.equal(globClaim.nextAction.code, 'TEST');
assert.deepEqual(globClaim.scope.outOfClaim, []);

const oldRemote = evaluateDoctor(fixture({ repository: { remoteState: 'fresh', remoteObservedAt: '2026-09-10T22:40:00Z' } }), { now: NOW, config });
assert.equal(oldRemote.nextAction.code, 'REFRESH');
const unknownDrift = evaluateDoctor(fixture({ repository: { driftKnown: false } }), { now: NOW, config });
assert.equal(unknownDrift.nextAction.code, 'REFRESH');
assert(unknownDrift.blockers.some((item) => item.code === 'DRIFT_UNKNOWN'));

const staleLocalProof = evaluateDoctor(fixture({
  scope: { modified: ['src/a.js'] },
  validation: { local: 'pass', localHeadSha: 'old-head', ci: 'not-run' },
}), { now: NOW, config });
assert.equal(staleLocalProof.nextAction.code, 'TEST', 'local pass must be bound to current head');

const stalePr = evaluateDoctor(fixture({
  scope: { modified: ['src/a.js'] },
  validation: { local: 'pass', localHeadSha: 'head123', ci: 'pending' },
  pr: { status: 'open', number: 100, headSha: 'older-head' },
}), { now: NOW, config });
assert.equal(stalePr.nextAction.code, 'REBASE', 'PR head mismatch must not be treated as current review evidence');

assert.throws(() => evaluateDoctor(fixture({ target: { issue: 0, agentId: 'x' } }), { now: NOW, config }), /positive integer/);
assert.throws(() => evaluateDoctor(fixture({ target: { issue: 761, agentId: '', route: null } }), { now: NOW, config }), /agentId is required/);
assert.throws(() => evaluateDoctor(fixture({ target: { issue: 761, agentId: 'x', route: 'unknown' } }), { now: NOW, config }), /unknown RAAS route/);
assert.throws(() => evaluateDoctor(fixture({ validation: { local: 'green' } }), { now: NOW, config }), /unsupported local validation state/);

const waitState = evaluateDoctor(fixture({
  claim: { status: 'accepted', branch: 'feature/mobile', files: ['app.js'], sameIssueConflict: { issue: 437, agent: 'chatgpt/playable' } },
  graph: { available: false, fresh: false },
}), { now: NOW, config });
assert.equal(renderHuman(waitState), `RAAS doctor: WAIT\nIssue #761 · chatgpt/test · feature/mobile\n\nBLOCKER  another accepted claim owns this issue\nWARNING  graph context is unavailable; direct ownership checks remain authoritative\nWARNING  CI state is unknown\n\nNext: Another accepted owner or hard prerequisite blocks safe progress.\n`);
assert(!/\u001b\[/.test(renderHuman(waitState)), 'human output must not rely on ANSI escapes');
const json = JSON.parse(renderJson(waitState));
assert.equal(json.schemaVersion, DOCTOR_SCHEMA);
assert.equal(json.nextAction.code, 'WAIT');

assert.deepEqual(parseArgs(['--issue', '761', '--agent', 'chatgpt/x', '--route', 'deployment', '--json', '--verbose']), {
  json: true,
  verbose: true,
  statePath: null,
  issue: 761,
  agentId: 'chatgpt/x',
  route: 'deployment',
  root: process.cwd(),
});
assert.throws(() => parseArgs(['--issue', '761']), /--agent is required/);
assert.throws(() => parseArgs(['--issue', '761', '--agent', 'x', '--wat']), /unknown argument/);

const repo = await mkdtemp(path.join(os.tmpdir(), 'raas-doctor-git-'));
execFileSync('git', ['init', '-b', 'main'], { cwd: repo, stdio: 'ignore' });
execFileSync('git', ['config', 'user.name', 'RAAS Test'], { cwd: repo });
execFileSync('git', ['config', 'user.email', 'raas@example.invalid'], { cwd: repo });
await mkdir(path.join(repo, 'src'), { recursive: true });
await writeFile(path.join(repo, 'src', 'a.js'), 'export const a = 1;\n');
execFileSync('git', ['add', '.'], { cwd: repo });
execFileSync('git', ['commit', '-m', 'base'], { cwd: repo, stdio: 'ignore' });
const mainSha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repo, encoding: 'utf8' }).trim();
execFileSync('git', ['switch', '-c', 'feature/doctor'], { cwd: repo, stdio: 'ignore' });
await writeFile(path.join(repo, 'src', 'a.js'), 'export const a = 2;\n');
execFileSync('git', ['add', '.'], { cwd: repo });
execFileSync('git', ['commit', '-m', 'feature'], { cwd: repo, stdio: 'ignore' });
const inspected = await inspectLocalRepository(repo, { mainSha });
assert.equal(inspected.branch, 'feature/doctor');
assert.equal(inspected.ahead, 1);
assert.equal(inspected.behind, 0);
assert.equal(inspected.driftKnown, true);
assert.deepEqual(inspected.modified, ['src/a.js']);

const cliRepo = await mkdtemp(path.join(os.tmpdir(), 'raas-doctor-cli-'));
execFileSync('git', ['init', '-b', 'main'], { cwd: cliRepo, stdio: 'ignore' });
execFileSync('git', ['config', 'user.name', 'RAAS Test'], { cwd: cliRepo });
execFileSync('git', ['config', 'user.email', 'raas@example.invalid'], { cwd: cliRepo });
await mkdir(path.join(cliRepo, '.raas'), { recursive: true });
await mkdir(path.join(cliRepo, 'scripts', 'lib'), { recursive: true });
await writeFile(path.join(cliRepo, '.raas', 'config.json'), JSON.stringify(config));
await writeFile(path.join(cliRepo, 'scripts', 'lib', 'raas-doctor.mjs'), '// claimed file fixture\n');
execFileSync('git', ['add', '.'], { cwd: cliRepo });
execFileSync('git', ['commit', '-m', 'base'], { cwd: cliRepo, stdio: 'ignore' });
const cliMain = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: cliRepo, encoding: 'utf8' }).trim();
execFileSync('git', ['switch', '-c', 'feature/doctor'], { cwd: cliRepo, stdio: 'ignore' });
const stateDir = await mkdtemp(path.join(os.tmpdir(), 'raas-doctor-state-'));
const statePath = path.join(stateDir, 'doctor-state.json');
await writeFile(statePath, JSON.stringify({
  repository: { slug: 'ruddvz/garba', mainSha: cliMain, remoteState: 'fresh', remoteObservedAt: '2026-09-10T22:49:00Z' },
  claim: { status: 'accepted', branch: 'feature/doctor', files: ['scripts/lib/raas-doctor.mjs'] },
  graph: { available: false, fresh: false },
  validation: { local: 'unknown', ci: 'unknown' },
  pr: { status: 'none' },
}));
let stdoutText = '';
let stderrText = '';
const result = await runDoctorCli([
  '--issue', '761', '--agent', 'chatgpt/test', '--route', 'deployment', '--root', cliRepo, '--state', statePath, '--json',
], {
  now: NOW,
  stdout: { write(value) { stdoutText += value; } },
  stderr: { write(value) { stderrText += value; } },
});
assert.equal(result.code, 0);
assert.equal(stderrText, '');
assert.equal(JSON.parse(stdoutText).nextAction.code, 'IMPLEMENT');

console.log('✓ RAAS doctor: all eleven next-action state snapshots');
console.log('✓ RAAS doctor: blockers, warnings, stale and cancelled semantics');
console.log('✓ RAAS doctor: source-truth routing and shared ownership matcher');
console.log('✓ RAAS doctor: deterministic human and versioned JSON output');
console.log('✓ RAAS doctor: current-head validation, local git drift and CLI execution');
