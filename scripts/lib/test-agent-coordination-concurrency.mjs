import fs from 'node:fs';
import assert from 'node:assert/strict';

const mixed = [
  ['.github/workflows/agent-file-claim-conflicts.yml', 'agent-file-claim-conflicts'],
  ['.github/workflows/agent-branch-claim-uniqueness.yml', 'agent-branch-claim-uniqueness'],
  ['.github/workflows/agent-branch-drift.yml', 'agent-pre-pr-branch-drift'],
  ['.github/workflows/agent-claim-hygiene.yml', 'agent-claim-hygiene'],
];

function groupFor(prefix, eventName, action, prNumber) {
  const prScoped = eventName === 'pull_request' && action !== 'closed';
  return `${prefix}-${prScoped ? prNumber : 'global'}`;
}

for (const [path, prefix] of mixed) {
  const source = fs.readFileSync(path, 'utf8');
  const expectedGroup = "group: " + prefix + "-" + "$" + "{{ github.event_name == 'pull_request' && github.event.action != 'closed' && github.event.pull_request.number || 'global' }}";
  assert.ok(source.includes(expectedGroup), `${path} must use PR-specific concurrency with a global fallback`);
  assert.match(source, /cancel-in-progress:\s*false/, `${path} must not cancel a running check`);
}

const interleavedPrs = Array.from({ length: 10 }, (_, index) => index + 101);
for (const pr of interleavedPrs) {
  for (const [, prefix] of mixed) {
    assert.equal(groupFor(prefix, 'pull_request', 'opened', pr), `${prefix}-${pr}`);
    assert.equal(groupFor(prefix, 'pull_request', 'synchronize', pr), `${prefix}-${pr}`);
    assert.equal(groupFor(prefix, 'pull_request', 'edited', pr), `${prefix}-${pr}`);
  }
}

for (const [, prefix] of mixed) {
  const groups = new Set(interleavedPrs.map(pr => groupFor(prefix, 'pull_request', 'opened', pr)));
  assert.equal(groups.size, 10, `${prefix}: unrelated PRs must have independent pending slots`);
  assert.equal(groupFor(prefix, 'pull_request', 'closed', 101), `${prefix}-global`);
  assert.equal(groupFor(prefix, 'issue_comment', 'created', null), `${prefix}-global`);
  assert.equal(groupFor(prefix, 'issues', 'closed', null), `${prefix}-global`);
  assert.equal(groupFor(prefix, 'schedule', null, null), `${prefix}-global`);
  assert.equal(groupFor(prefix, 'workflow_dispatch', null, null), `${prefix}-global`);
}

const drift = fs.readFileSync('.github/workflows/agent-branch-drift.yml', 'utf8');
const hygiene = fs.readFileSync('.github/workflows/agent-claim-hygiene.yml', 'utf8');
for (const [name, source, mutationAnchor] of [
  ['branch drift', drift, 'await ensureDriftLabel();'],
  ['claim hygiene', hygiene, 'await ensureReviewLabel();'],
]) {
  const guard = "if (context.eventName === 'pull_request' && context.payload.action !== 'closed')";
  assert.ok(source.includes(guard), `${name}: missing non-closed PR read-only guard`);
  assert.ok(source.indexOf(guard) < source.indexOf(mutationAnchor), `${name}: PR guard must precede first mutation boundary`);
}

const fileConflicts = fs.readFileSync('.github/workflows/agent-file-claim-conflicts.yml', 'utf8');
assert.ok(
  fileConflicts.indexOf("if (context.eventName === 'pull_request' && context.payload.action !== 'closed')") <
    fileConflicts.indexOf('await ensureConflictLabel();'),
  'file conflicts: PR gate must return before label/board writes',
);

const branchUniqueness = fs.readFileSync('.github/workflows/agent-branch-claim-uniqueness.yml', 'utf8');
assert.ok(
  branchUniqueness.indexOf("if (context.eventName === 'pull_request' && context.payload.action !== 'closed')") <
    branchUniqueness.indexOf('await ensureConflictLabel();'),
  'branch uniqueness: PR gate must return before label/status writes',
);

const registry = fs.readFileSync('.github/workflows/agent-claim-registry.yml', 'utf8');
assert.match(registry, /concurrency:\s*\n\s*group:\s*agent-claim-registry\s*\n\s*cancel-in-progress:\s*false/, 'global claim registry must remain one serialized writer');
assert.doesNotMatch(registry, /agent-claim-registry-\$\{\{/, 'issue #990 must not make the global registry PR-scoped');
assert.match(registry, /\*\*Same-issue claim conflicts:\*\*/, 'claim registry status must label issue-local claim conflicts explicitly');
assert.doesNotMatch(registry, /\*\*Conflicts:\*\*/, 'claim registry status must not use an ambiguous generic conflict label');
assert.ok(
  registry.includes('**Cross-issue file ownership:** See the separate cross-issue file-ownership status on this issue.'),
  'claim registry status must direct readers to the separate cross-issue file-ownership guard',
);

console.log('agent coordination concurrency regression: PASS');
