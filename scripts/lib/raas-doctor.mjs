import { execFile as execFileCallback } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { pathMatchesClaim } from './raas-graph-repository.mjs';

const execFile = promisify(execFileCallback);

export const DOCTOR_SCHEMA = 'raas-doctor/v1';
export const NEXT_ACTIONS = Object.freeze([
  'REFRESH', 'WAIT', 'NARROW', 'CLAIM', 'REBASE', 'IMPLEMENT',
  'TEST', 'OPEN PR', 'REVIEW', 'RELEASE', 'DONE',
]);

const VALID_ACTIONS = new Set(NEXT_ACTIONS);
const VALID_CLAIM = new Set(['accepted', 'missing', 'released', 'unknown']);
const VALID_LOCAL = new Set(['pass', 'fail', 'pending', 'unknown', 'not-run']);
const VALID_CI = new Set(['pass', 'fail', 'pending', 'cancelled', 'rate-limited', 'unknown', 'not-run']);
const REMOTE_MAX_AGE_MS = 5 * 60 * 1000;
const STATE_MAX_BYTES = 1024 * 1024;

const sortedStrings = (values) => [...new Set((values || []).filter((value) => typeof value === 'string' && value))].sort();
const nonNegative = (value) => Number.isSafeInteger(value) && value >= 0 ? value : 0;

function positiveInteger(value, label) {
  const parsed = typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : value;
  if (!Number.isSafeInteger(parsed) || parsed <= 0) throw new TypeError(`${label} must be a positive integer`);
  return parsed;
}

function conflict(value) {
  if (!value) return null;
  if (typeof value === 'string') return { issue: null, agent: null, branch: null, message: value };
  if (typeof value !== 'object' || Array.isArray(value)) throw new TypeError('conflict must be a string or object');
  return {
    issue: Number.isSafeInteger(value.issue) ? value.issue : null,
    agent: typeof value.agent === 'string' ? value.agent : null,
    branch: typeof value.branch === 'string' ? value.branch : null,
    message: typeof value.message === 'string' ? value.message : null,
  };
}

function normalizeClaim(input = {}) {
  const status = input.status || 'unknown';
  if (!VALID_CLAIM.has(status)) throw new TypeError(`unsupported claim status: ${status}`);
  const fileConflicts = (Array.isArray(input.fileConflicts) ? input.fileConflicts : []).map((item) => {
    if (typeof item === 'string') return { path: item, issue: null, agent: null, message: null };
    if (!item || typeof item !== 'object') throw new TypeError('file conflict must be a string or object');
    return {
      path: typeof item.path === 'string' ? item.path : null,
      issue: Number.isSafeInteger(item.issue) ? item.issue : null,
      agent: typeof item.agent === 'string' ? item.agent : null,
      message: typeof item.message === 'string' ? item.message : null,
    };
  }).sort((a, b) => `${a.path || ''}:${a.issue || ''}:${a.agent || ''}`.localeCompare(`${b.path || ''}:${b.issue || ''}:${b.agent || ''}`));
  return {
    status,
    branch: typeof input.branch === 'string' ? input.branch : null,
    files: sortedStrings(input.files),
    sameIssueConflict: conflict(input.sameIssueConflict),
    branchConflict: conflict(input.branchConflict),
    fileConflicts,
  };
}

function normalizeValidation(input = {}) {
  const local = input.local || 'unknown';
  const ci = input.ci || 'unknown';
  if (!VALID_LOCAL.has(local)) throw new TypeError(`unsupported local validation state: ${local}`);
  if (!VALID_CI.has(ci)) throw new TypeError(`unsupported CI state: ${ci}`);
  return {
    required: sortedStrings(input.required),
    local,
    localHeadSha: typeof input.localHeadSha === 'string' ? input.localHeadSha : null,
    ci,
    ciHeadSha: typeof input.ciHeadSha === 'string' ? input.ciHeadSha : null,
    failedChecks: sortedStrings(input.failedChecks),
  };
}

function normalizeGraph(input = {}) {
  return {
    available: input.available === true,
    fresh: input.fresh === true,
    fingerprint: typeof input.fingerprint === 'string' ? input.fingerprint : null,
    blastRadius: sortedStrings(input.blastRadius),
    warnings: sortedStrings(input.warnings),
  };
}

function normalizePr(input = {}) {
  const status = input.status || 'none';
  if (!['none', 'open', 'merged', 'closed'].includes(status)) throw new TypeError(`unsupported PR status: ${status}`);
  return {
    status,
    number: Number.isSafeInteger(input.number) ? input.number : null,
    headSha: typeof input.headSha === 'string' ? input.headSha : null,
    current: input.current !== false,
  };
}

function normalizeRemote(input = {}, now, maxAgeMs) {
  let state = input.remoteState || 'unknown';
  const observedAt = typeof input.remoteObservedAt === 'string' ? input.remoteObservedAt : null;
  if (state === 'fresh') {
    if (!observedAt) state = 'unknown';
    else {
      const stamp = Date.parse(observedAt);
      const age = now - stamp;
      if (!Number.isFinite(stamp)) state = 'unknown';
      else if (age < -60_000 || age > maxAgeMs) state = 'stale';
    }
  }
  if (!['fresh', 'stale', 'unknown', 'local-only'].includes(state)) throw new TypeError(`unsupported remote state: ${state}`);
  return { state, observedAt };
}

function resolveRoute(config, routeId) {
  if (!routeId) return null;
  const route = (Array.isArray(config?.routes) ? config.routes : []).find((candidate) => candidate?.id === routeId);
  if (!route) throw new TypeError(`unknown RAAS route: ${routeId}`);
  return {
    id: route.id,
    label: route.label || route.id,
    truthSources: sortedStrings(route.truthSources),
    likelyFiles: sortedStrings(route.likelyFiles),
    risks: sortedStrings(route.risks),
  };
}

function dedupe(items) {
  const seen = new Set();
  return items.filter((item) => {
    const key = `${item.code}\u0000${item.message}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function determineNextAction(state) {
  const { repository: repo, claim, validation, pr } = state;
  if (repo.remoteState !== 'fresh' || repo.driftKnown === false || claim.status === 'unknown') {
    return { code: 'REFRESH', reason: 'Remote, drift, or canonical ownership state is missing or stale.' };
  }
  if (state.hardPrerequisites.length || claim.sameIssueConflict || claim.branchConflict) {
    return { code: 'WAIT', reason: 'Another accepted owner or hard prerequisite blocks safe progress.' };
  }
  if (claim.fileConflicts.length || state.scope.outOfClaim.length || state.scope.exceedsClaim) {
    return { code: 'NARROW', reason: 'The direct modification scope overlaps ownership or exceeds the accepted claim.' };
  }
  if (pr.status === 'merged' || pr.status === 'closed') {
    if (claim.status === 'accepted') return { code: 'RELEASE', reason: 'Implementation is no longer open but the accepted claim is still held.' };
    if (state.completionSatisfied) return { code: 'DONE', reason: 'Completion requirements are satisfied and no active claim remains.' };
  }
  if (claim.status === 'missing' || claim.status === 'released') {
    if (state.completionSatisfied) return { code: 'DONE', reason: 'Completion requirements are satisfied and no active claim remains.' };
    return { code: 'CLAIM', reason: 'The issue is actionable but has no accepted current claim.' };
  }
  if (repo.branchMissing || repo.mergeConflict || repo.behind > 0 || pr.current === false) {
    return { code: 'REBASE', reason: 'The accepted implementation branch is missing, conflicted, stale, or behind current main.' };
  }
  if (!state.scope.modified.length) {
    return { code: 'IMPLEMENT', reason: 'The accepted claim is current and conflict-free, with no implementation diff yet.' };
  }
  if (validation.local !== 'pass' || validation.localHeadSha !== repo.headSha) {
    return { code: 'TEST', reason: 'Implementation changes exist but required local validation has not passed on the current head.' };
  }
  if (pr.status === 'none') return { code: 'OPEN PR', reason: 'Current-head validation is green and no matching pull request exists.' };
  if (pr.status === 'open') {
    const failed = state.blockers.some((item) => item.code === 'CI_FAILED');
    return { code: 'REVIEW', reason: failed ? 'The pull request has a real validation failure that needs review.' : 'A matching pull request exists and still needs checks, review, or merge.' };
  }
  throw new Error('doctor could not determine a next action');
}

export function evaluateDoctor(input = {}, { now = Date.now(), config = null } = {}) {
  const issue = positiveInteger(input.target?.issue, 'target.issue');
  const agentId = typeof input.target?.agentId === 'string' && input.target.agentId.trim() ? input.target.agentId.trim() : null;
  if (!agentId) throw new TypeError('target.agentId is required');

  const claim = normalizeClaim(input.claim);
  const validation = normalizeValidation(input.validation);
  const graph = normalizeGraph(input.graph);
  const pr = normalizePr(input.pr);
  const route = resolveRoute(config, input.target?.route || null);
  const remote = normalizeRemote(input.repository || {}, now, input.remoteMaxAgeMs || REMOTE_MAX_AGE_MS);
  const repository = {
    slug: input.repository?.slug || 'ruddvz/garba',
    mainSha: typeof input.repository?.mainSha === 'string' ? input.repository.mainSha : null,
    headSha: typeof input.repository?.headSha === 'string' ? input.repository.headSha : null,
    branch: typeof input.repository?.branch === 'string' ? input.repository.branch : null,
    dirty: input.repository?.dirty === true,
    dirtyFiles: sortedStrings(input.repository?.dirtyFiles),
    ahead: nonNegative(input.repository?.ahead),
    behind: nonNegative(input.repository?.behind),
    branchMissing: input.repository?.branchMissing === true,
    mergeConflict: input.repository?.mergeConflict === true,
    driftKnown: input.repository?.driftKnown !== false,
    remoteState: remote.state,
    remoteObservedAt: remote.observedAt,
  };
  if (pr.status === 'open' && pr.headSha && repository.headSha && pr.headSha !== repository.headSha) pr.current = false;

  const modified = sortedStrings(input.scope?.modified);
  const derivedOutOfClaim = claim.status === 'accepted' && claim.files.length
    ? modified.filter((repoPath) => !claim.files.some((pattern) => pathMatchesClaim(repoPath, pattern)))
    : [];
  const scope = {
    modified,
    directFiles: sortedStrings(input.scope?.directFiles?.length ? input.scope.directFiles : claim.files),
    outOfClaim: sortedStrings(input.scope?.outOfClaim?.length ? input.scope.outOfClaim : derivedOutOfClaim),
    exceedsClaim: input.scope?.exceedsClaim === true,
  };
  const hardPrerequisites = sortedStrings(input.hardPrerequisites);
  const blockers = [];
  const warnings = [];

  if (repository.remoteState !== 'fresh') blockers.push({ code: 'REMOTE_STALE', message: `remote state is ${repository.remoteState}; refresh before trusting ownership or drift` });
  if (!repository.driftKnown) blockers.push({ code: 'DRIFT_UNKNOWN', message: 'current main/head drift could not be established locally' });
  if (claim.status === 'unknown') blockers.push({ code: 'CLAIM_UNKNOWN', message: 'canonical claim state is unknown' });
  if (claim.sameIssueConflict) blockers.push({ code: 'SAME_ISSUE_CONFLICT', message: claim.sameIssueConflict.message || 'another accepted claim owns this issue' });
  if (claim.branchConflict) blockers.push({ code: 'BRANCH_CONFLICT', message: claim.branchConflict.message || 'the claimed branch is owned by another issue or agent' });
  for (const item of claim.fileConflicts) blockers.push({ code: 'FILE_CONFLICT', message: item.message || `${item.path || 'a requested file'} is owned by another active claim` });
  for (const item of hardPrerequisites) blockers.push({ code: 'PREREQUISITE', message: item });
  if (scope.outOfClaim.length) blockers.push({ code: 'OUT_OF_CLAIM', message: `modified paths outside claim: ${scope.outOfClaim.join(', ')}` });
  if (scope.exceedsClaim) blockers.push({ code: 'SCOPE_EXCEEDS_CLAIM', message: 'requested direct modification scope exceeds the accepted claim' });
  if (validation.local === 'fail') blockers.push({ code: 'LOCAL_VALIDATION_FAILED', message: 'required local validation failed on the implementation branch' });
  if (validation.ci === 'fail') blockers.push({ code: 'CI_FAILED', message: validation.failedChecks.length ? `CI failed: ${validation.failedChecks.join(', ')}` : 'CI has a real validation failure' });

  if (!graph.available) warnings.push({ code: 'GRAPH_UNAVAILABLE', message: 'graph context is unavailable; direct ownership checks remain authoritative' });
  else if (!graph.fresh) warnings.push({ code: 'GRAPH_STALE', message: 'graph context is stale and is advisory only' });
  for (const message of graph.warnings) warnings.push({ code: 'GRAPH_WARNING', message });
  if (validation.ci === 'cancelled') warnings.push({ code: 'CI_CANCELLED', message: 'CI was cancelled; canonical ownership truth is unchanged' });
  if (validation.ci === 'rate-limited') warnings.push({ code: 'CI_RATE_LIMITED', message: 'CI status is rate-limited/unknown; canonical ownership truth is unchanged' });
  if (validation.ci === 'unknown') warnings.push({ code: 'CI_UNKNOWN', message: 'CI state is unknown' });
  if (validation.ciHeadSha && repository.headSha && validation.ciHeadSha !== repository.headSha) warnings.push({ code: 'CI_STALE_HEAD', message: 'CI evidence belongs to a different head SHA' });
  if (repository.dirty) warnings.push({ code: 'DIRTY_WORKTREE', message: 'worktree has local modifications' });
  if (route && ['catalogue', 'playback', 'rights'].includes(route.id)) warnings.push({ code: 'TRUTH_SENSITIVE', message: `${route.label} work must stay grounded in its listed source-truth and rights evidence` });

  const state = {
    schemaVersion: DOCTOR_SCHEMA,
    repository,
    target: { issue, agentId, route: route?.id || null },
    claim,
    scope,
    graph,
    truth: { truthSources: route?.truthSources || [], likelyFiles: route?.likelyFiles || [], risks: route?.risks || [] },
    validation,
    pr,
    hardPrerequisites,
    completionSatisfied: input.completionSatisfied === true,
    blockers: dedupe(blockers),
    warnings: dedupe(warnings),
  };
  state.nextAction = determineNextAction(state);
  if (!VALID_ACTIONS.has(state.nextAction.code)) throw new Error(`invalid next action: ${state.nextAction.code}`);
  return state;
}

export function renderHuman(state, { verbose = false } = {}) {
  const lines = [`RAAS doctor: ${state.nextAction.code}`];
  lines.push([`Issue #${state.target.issue}`, state.target.agentId, state.claim.branch || state.repository.branch].filter(Boolean).join(' · '), '');
  for (const item of state.blockers) lines.push(`BLOCKER  ${item.message}`);
  for (const item of state.warnings) lines.push(`WARNING  ${item.message}`);
  if (!state.blockers.length && !state.warnings.length) lines.push('STATUS   no blockers or warnings');
  if (verbose) {
    lines.push('');
    lines.push(`REPO     ${state.repository.branch || '(detached)'} @ ${state.repository.headSha || '(unknown)'} · main ${state.repository.mainSha || '(unknown)'} · +${state.repository.ahead}/-${state.repository.behind}`);
    lines.push(`CLAIM    ${state.claim.status} · ${state.scope.directFiles.length} direct file(s)`);
    lines.push(`GRAPH    ${state.graph.available ? (state.graph.fresh ? 'fresh' : 'stale') : 'unavailable'} · ${state.graph.blastRadius.length} review node(s)`);
    lines.push(`CHECKS   local ${state.validation.local} · ci ${state.validation.ci}`);
    if (state.truth.truthSources.length) lines.push(`TRUTH    ${state.truth.truthSources.join(', ')}`);
  }
  lines.push('', `Next: ${state.nextAction.reason}`);
  return `${lines.join('\n')}\n`;
}

export const renderJson = (state) => `${JSON.stringify(state, null, 2)}\n`;

async function git(root, args, { allowFailure = false } = {}) {
  try {
    const { stdout } = await execFile('git', ['-C', root, ...args], { encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 });
    return stdout.trim();
  } catch (error) {
    if (allowFailure) return null;
    throw new Error(`git ${args.join(' ')} failed: ${error.stderr?.trim() || error.message}`);
  }
}

const statusPaths = (output) => sortedStrings((output || '').split('\n').filter(Boolean).map((line) => line.length > 3 ? line.slice(3).trim() : line.trim()));

export async function inspectLocalRepository(root = process.cwd(), { mainSha = null } = {}) {
  const repoRoot = await git(root, ['rev-parse', '--show-toplevel']);
  const headSha = await git(repoRoot, ['rev-parse', 'HEAD']);
  const branch = await git(repoRoot, ['symbolic-ref', '--quiet', '--short', 'HEAD'], { allowFailure: true });
  const localMainSha = mainSha
    || await git(repoRoot, ['rev-parse', '--verify', 'refs/remotes/origin/main'], { allowFailure: true })
    || await git(repoRoot, ['rev-parse', '--verify', 'refs/heads/main'], { allowFailure: true });
  const mainAvailable = Boolean(localMainSha) && await git(repoRoot, ['cat-file', '-e', `${localMainSha}^{commit}`], { allowFailure: true }) !== null;
  let ahead = 0;
  let behind = 0;
  let modified = [];
  if (mainAvailable) {
    const counts = await git(repoRoot, ['rev-list', '--left-right', '--count', `${localMainSha}...${headSha}`]);
    const [behindText, aheadText] = counts.split(/\s+/);
    behind = Number(behindText) || 0;
    ahead = Number(aheadText) || 0;
    modified = sortedStrings((await git(repoRoot, ['diff', '--name-only', `${localMainSha}...${headSha}`])).split('\n').filter(Boolean));
  }
  const dirtyFiles = statusPaths(await git(repoRoot, ['status', '--porcelain=v1', '--untracked-files=all']));
  return {
    root: repoRoot,
    headSha,
    mainSha: localMainSha,
    branch: branch || '(detached)',
    dirty: dirtyFiles.length > 0,
    dirtyFiles,
    ahead,
    behind,
    driftKnown: mainAvailable,
    modified: sortedStrings([...modified, ...dirtyFiles]),
  };
}

async function loadJson(filePath) {
  const info = await stat(filePath);
  if (!info.isFile()) throw new TypeError(`JSON input is not a regular file: ${filePath}`);
  if (info.size > STATE_MAX_BYTES) throw new Error(`JSON input exceeds ${STATE_MAX_BYTES} bytes: ${filePath}`);
  return JSON.parse(await readFile(filePath, 'utf8'));
}

export function parseArgs(argv) {
  const result = { json: false, verbose: false, statePath: null, issue: null, agentId: null, route: null, root: process.cwd() };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--json') result.json = true;
    else if (arg === '--verbose') result.verbose = true;
    else if (['--issue', '--agent', '--route', '--state', '--root'].includes(arg)) {
      const value = argv[index + 1];
      if (!value || value.startsWith('--')) throw new TypeError(`${arg} requires a value`);
      index += 1;
      if (arg === '--issue') result.issue = positiveInteger(value, '--issue');
      else if (arg === '--agent') result.agentId = value;
      else if (arg === '--route') result.route = value;
      else if (arg === '--state') result.statePath = value;
      else result.root = value;
    } else throw new TypeError(`unknown argument: ${arg}`);
  }
  if (!result.issue) throw new TypeError('--issue is required');
  if (!result.agentId) throw new TypeError('--agent is required');
  return result;
}

export async function runDoctorCli(argv = process.argv.slice(2), { stdout = process.stdout, stderr = process.stderr, now = Date.now() } = {}) {
  try {
    const args = parseArgs(argv);
    const root = path.resolve(args.root);
    const harness = args.statePath ? await loadJson(path.resolve(args.statePath)) : {};
    const config = await loadJson(path.join(root, '.raas', 'config.json'));
    const local = await inspectLocalRepository(root, { mainSha: harness.repository?.mainSha || null });
    const merged = {
      ...harness,
      target: { ...(harness.target || {}), issue: args.issue, agentId: args.agentId, route: args.route || harness.target?.route || null },
      repository: {
        ...(harness.repository || {}),
        headSha: local.headSha,
        mainSha: harness.repository?.mainSha || local.mainSha,
        branch: local.branch,
        dirty: local.dirty,
        dirtyFiles: local.dirtyFiles,
        ahead: local.ahead,
        behind: local.behind,
        driftKnown: local.driftKnown,
      },
      scope: { ...(harness.scope || {}), modified: local.modified },
    };
    const state = evaluateDoctor(merged, { now, config });
    stdout.write(args.json ? renderJson(state) : renderHuman(state, { verbose: args.verbose }));
    return { code: state.nextAction.code === 'REFRESH' ? 2 : 0, state };
  } catch (error) {
    stderr.write(`RAAS doctor error: ${error.message}\n`);
    return { code: 3, error };
  }
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : null;
if (invokedPath === import.meta.url) {
  const result = await runDoctorCli();
  process.exitCode = result.code;
}
