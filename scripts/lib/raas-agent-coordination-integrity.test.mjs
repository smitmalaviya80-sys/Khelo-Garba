import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildMutationPlan,
  buildReopenPlan,
  deriveOwnershipState,
  holdClaimBody,
  integrityRecordBody,
  parseCoordinationEvent,
  releaseBody,
} from './raas-agent-coordination-integrity.mjs';

const ownerLogin = 'ruddvz';
const claim = (id, agent = 'agent/a', branch = 'fix/a', files = 'file-a', scope = 'scope a') => ({
  id,
  body: `<!-- agent-claim\nagent: ${agent}\nbranch: ${branch}\nscope: ${scope}\nfiles: ${files}\n-->`,
  user: { login: 'ruddvz', type: 'User' },
});
const release = (id, agent = 'agent/a', branch = 'fix/a') => ({
  id,
  body: `<!-- agent-release\nagent: ${agent}\nbranch: ${branch}\n-->`,
  user: { login: 'ruddvz', type: 'User' },
});
const override = id => ({
  id,
  body: '<!-- agent-claim-override\nreason: owner reconciliation\n-->',
  user: { login: ownerLogin, type: 'User' },
});
const mutated = (comment, updated = '2026-09-12T20:55:00Z') => ({ ...comment, updated_at: updated });

function applyPlan(comments, plan, firstId = 100) {
  const next = [...comments];
  next.push({ id: firstId, body: integrityRecordBody(plan), user: { login: 'github-actions[bot]', type: 'Bot' } });
  let id = firstId + 1;
  if (plan.releaseCurrent) {
    next.push({ id: id++, body: releaseBody(plan.releaseCurrent, plan.key), user: { login: 'github-actions[bot]', type: 'Bot' } });
  }
  next.push({ id, body: holdClaimBody(plan.hold, plan.key), user: { login: 'github-actions[bot]', type: 'Bot' } });
  return next;
}

test('accepted claim edited to another owner fails closed', () => {
  const original = claim(1);
  const edited = mutated(claim(1, 'agent/b', 'fix/b', 'file-b'));
  const plan = buildMutationPlan({
    action: 'edited', issueNumber: 10, sourceComment: edited,
    oldBody: original.body, newBody: edited.body, comments: [edited], ownerLogin,
  });
  assert.ok(plan && !plan.duplicate);
  assert.equal(plan.hold.files, 'file-a');
  const state = deriveOwnershipState(applyPlan([edited], plan), ownerLogin);
  assert.equal(state.active?.agent, 'raas-integrity-hold/10');
  assert.equal(state.active?.files, 'file-a');
});

test('accepted claim deleted cannot expose a later claimant', () => {
  const original = claim(1);
  const later = claim(2, 'agent/b', 'fix/b', 'file-a');
  const source = mutated(original);
  const plan = buildMutationPlan({
    action: 'deleted', issueNumber: 11, sourceComment: source,
    oldBody: original.body, newBody: '', comments: [later], ownerLogin,
  });
  assert.equal(plan.currentState.active?.agent, 'agent/b');
  assert.equal(plan.releaseCurrent?.agent, 'agent/b');
  const state = deriveOwnershipState(applyPlan([later], plan), ownerLogin);
  assert.equal(state.active?.agent, 'raas-integrity-hold/11');
});

test('accepted release edited or deleted cannot silently resurrect ownership', () => {
  const c = claim(1);
  const r = release(2);
  for (const action of ['edited', 'deleted']) {
    const source = mutated(r, `2026-09-12T20:56:0${action === 'edited' ? 1 : 2}Z`);
    const newBody = action === 'edited' ? '<!-- agent-release\nagent: other\nbranch: other\n-->' : '';
    const currentRelease = action === 'edited' ? { ...source, body: newBody } : null;
    const comments = currentRelease ? [c, currentRelease] : [c];
    const plan = buildMutationPlan({ action, issueNumber: 12, sourceComment: source, oldBody: r.body, newBody, comments, ownerLogin });
    assert.ok(plan);
    const state = deriveOwnershipState(applyPlan(comments, plan), ownerLogin);
    assert.equal(state.active?.agent, 'raas-integrity-hold/12');
    assert.equal(state.active?.files, 'file-a');
  }
});

test('accepted owner override mutation fails closed', () => {
  const c = claim(1);
  const o = override(2);
  const source = mutated(o);
  const plan = buildMutationPlan({
    action: 'deleted', issueNumber: 13, sourceComment: source,
    oldBody: o.body, newBody: '', comments: [c], ownerLogin,
  });
  assert.ok(plan);
  const state = deriveOwnershipState(applyPlan([c], plan), ownerLogin);
  assert.equal(state.active?.agent, 'raas-integrity-hold/13');
});

test('repeated independent edits create distinct generations, exact redelivery is idempotent', () => {
  const first = claim(1);
  const second = mutated(claim(1, 'agent/a', 'fix/a', 'file-a', 'scope two'), '2026-09-12T21:00:00Z');
  const p1 = buildMutationPlan({ action: 'edited', issueNumber: 14, sourceComment: second, oldBody: first.body, newBody: second.body, comments: [second], ownerLogin });
  const history = applyPlan([second], p1);
  const duplicate = buildMutationPlan({ action: 'edited', issueNumber: 14, sourceComment: second, oldBody: first.body, newBody: second.body, comments: history, ownerLogin });
  assert.equal(duplicate?.duplicate, true);

  const third = mutated(claim(1, 'agent/a', 'fix/a', 'file-a', 'scope three'), '2026-09-12T21:01:00Z');
  const p2 = buildMutationPlan({ action: 'edited', issueNumber: 14, sourceComment: third, oldBody: second.body, newBody: third.body, comments: history.filter(c => c.id !== 1).concat(third), ownerLogin });
  assert.ok(p2 && !p2.duplicate);
  assert.notEqual(p1.key, p2.key);
});

test('editing non-coordination prose without changing event meaning is ignored', () => {
  const original = claim(1);
  const edited = mutated({ ...original, body: `${original.body}\nextra prose` });
  const plan = buildMutationPlan({ action: 'edited', issueNumber: 15, sourceComment: edited, oldBody: original.body, newBody: edited.body, comments: [edited], ownerLogin });
  assert.equal(plan, null);
});

test('rejected later claim mutation does not create a false hold', () => {
  const a = claim(1);
  const b = claim(2, 'agent/b', 'fix/b', 'file-b');
  const bEdited = mutated(claim(2, 'agent/c', 'fix/c', 'file-c'));
  const plan = buildMutationPlan({ action: 'edited', issueNumber: 16, sourceComment: bEdited, oldBody: b.body, newBody: bEdited.body, comments: [a, bEdited], ownerLogin });
  assert.equal(plan, null);
});

test('repository-owner override explicitly resolves an integrity hold', () => {
  const original = claim(1);
  const source = mutated(original);
  const plan = buildMutationPlan({ action: 'deleted', issueNumber: 17, sourceComment: source, oldBody: original.body, newBody: '', comments: [], ownerLogin });
  const held = applyPlan([], plan);
  assert.equal(deriveOwnershipState(held, ownerLogin).active?.agent, 'raas-integrity-hold/17');
  const reconciled = [...held, override(200)];
  assert.equal(deriveOwnershipState(reconciled, ownerLogin).active, null);
});

test('recovery from appended history matches live conservative state', () => {
  const original = claim(1);
  const later = claim(2, 'agent/b', 'fix/b', 'file-a');
  const source = mutated(original);
  const plan = buildMutationPlan({ action: 'deleted', issueNumber: 18, sourceComment: source, oldBody: original.body, newBody: '', comments: [later], ownerLogin });
  const history = applyPlan([later], plan);
  const live = deriveOwnershipState(history, ownerLogin);
  const recovered = deriveOwnershipState(JSON.parse(JSON.stringify(history)), ownerLogin);
  assert.deepEqual(recovered, live);
});

test('ordinary untouched ownership lifecycle remains backward compatible', () => {
  const state = deriveOwnershipState([claim(1), claim(2, 'agent/b', 'fix/b', 'file-b'), release(3)], ownerLogin);
  assert.equal(state.active, null);
  assert.equal(state.conflicts.length, 0);
  assert.equal(parseCoordinationEvent(claim(9))?.type, 'claim');
});

test('close auto-release does not resolve integrity generation and reopen restores hold', () => {
  const original = claim(1, 'agent/a', 'fix/a', 'file-a', 'scope a');
  const edited = mutated(claim(1, 'agent/z', 'fix/z', 'file-z', 'tampered'), '2026-09-12T20:40:00Z');
  const plan = buildMutationPlan({
    action: 'edited', issueNumber: 77, sourceComment: edited,
    oldBody: original.body, newBody: edited.body, comments: [edited], ownerLogin,
  });
  const integrity = { id: 2, body: integrityRecordBody(plan, 'agent'), user: { login: 'github-actions[bot]', type: 'Bot' } };
  const exposedRelease = { id: 3, body: releaseBody(plan.releaseCurrent, plan.key), user: { login: 'github-actions[bot]', type: 'Bot' } };
  const hold = { id: 4, body: holdClaimBody(plan.hold, plan.key), user: { login: 'github-actions[bot]', type: 'Bot' } };
  const autoRelease = { id: 5, body: releaseBody(plan.hold, plan.key), user: { login: 'github-actions[bot]', type: 'Bot' } };
  const history = [edited, integrity, exposedRelease, hold, autoRelease];
  assert.equal(deriveOwnershipState(history, ownerLogin).active, null);
  const reopened = buildReopenPlan({ issueNumber: 77, comments: history, ownerLogin });
  assert.ok(reopened);
  assert.equal(reopened.hold.agent, plan.hold.agent);
  const restored = { id: 6, body: holdClaimBody(reopened.hold, reopened.key), user: { login: 'github-actions[bot]', type: 'Bot' } };
  assert.equal(deriveOwnershipState([...history, restored], ownerLogin).active?.agent, plan.hold.agent);
});
