import assert from 'node:assert/strict'
import {
  RUNTIME_SCHEMA,
  parallelDecision,
  reuseDecision,
  runtimeReceipt,
  startReceipt
} from './raas-cto-runtime.mjs'

const budgets = {
  fast: {
    maxSources: 4,
    contextChars: 10000,
    toolCallsBeforeReevaluation: 8,
    parallelReadOnlyAgents: 1,
    parallelMutationLanes: 1,
    repairRounds: 2
  },
  standard: {
    maxSources: 10,
    contextChars: 30000,
    toolCallsBeforeReevaluation: 20,
    parallelReadOnlyAgents: 2,
    parallelMutationLanes: 1,
    repairRounds: 3
  },
  critical: {
    maxSources: 30,
    softContextChars: 100000,
    toolCallsBeforeReevaluation: 50,
    parallelReadOnlyAgents: 3,
    parallelMutationLanes: 1,
    repairRounds: 5
  }
}

function task(overrides = {}) {
  const tier = overrides.tier || 'fast'
  return {
    tier,
    mode: 'implementation',
    risk: 'low',
    blast_radius: 'record-local',
    reversibility: 'reversible',
    uncertainty: 'known',
    delivery_stop: 'local-change',
    truth_sensitivity: 'ordinary-code',
    mutation_allowed: true,
    needs_split: false,
    routes: [],
    budget: budgets[tier],
    verification_frontier: ['focused'],
    ...overrides,
    budget: overrides.budget || budgets[tier]
  }
}

function usage(overrides = {}) {
  return {
    sources: 1,
    contextChars: 2000,
    toolCalls: 2,
    readOnlyAgents: 0,
    mutationLanes: 1,
    repairRounds: 0,
    duplicateOperationsSuppressed: 1,
    duplicateOperationsExecuted: 0,
    ...overrides
  }
}

function passingVerification(currentTask) {
  return Object.fromEntries(
    currentTask.verification_frontier
      .filter((check) => check !== 'focused' && check !== 'browser-manual-when-acceptance-is-visual')
      .map((check) => [check, 'passed'])
  )
}

{
  const result = startReceipt(task(), {
    repositoryFingerprint: 'repo-a',
    sourceFingerprint: 'source-a',
    claimFingerprint: 'claim-a'
  })
  assert.equal(result.schema, RUNTIME_SCHEMA)
  assert.equal(result.phase, 'start')
  assert.equal(result.decision, 'proceed')
  assert.equal(result.task.tier, 'fast')
}

{
  const currentTask = task()
  const result = runtimeReceipt(currentTask, {
    phase: 'finish',
    repositoryFingerprint: 'repo-a',
    usage: usage(),
    verification: passingVerification(currentTask),
    acceptanceProven: true
  })
  assert.equal(result.decision, 'stop-success')
  assert.equal(result.quality_green, true)
  assert.equal(result.efficient, true)
}

{
  const currentTask = task()
  const result = runtimeReceipt(currentTask, {
    phase: 'checkpoint',
    repositoryFingerprint: 'repo-a',
    usage: usage(),
    verification: passingVerification(currentTask)
  })
  assert.equal(result.decision, 'proceed')
  assert.equal(result.efficient, false)
}

{
  const broadTask = task({
    tier: 'standard',
    needs_split: true,
    routes: [{ id: 'catalogue' }, { id: 'playback' }, { id: 'pwa' }],
    budget: budgets.standard,
    verification_frontier: ['focused', 'affected-subsystem']
  })
  const result = startReceipt(broadTask, { repositoryFingerprint: 'repo-a' })
  assert.equal(result.decision, 'split-before-mutation')
}

{
  const currentTask = task()
  const result = runtimeReceipt(currentTask, {
    phase: 'checkpoint',
    repositoryFingerprint: 'repo-a',
    usage: usage({ sources: 5 }),
    verification: passingVerification(currentTask)
  })
  assert.equal(result.decision, 're-evaluate-tier-or-evidence-plan')
  assert.ok(result.reason_codes.includes('budget-ceiling-exceeded'))
}

{
  const currentTask = task()
  const result = runtimeReceipt(currentTask, {
    phase: 'finish',
    repositoryFingerprint: 'repo-a',
    usage: usage({ duplicateOperationsExecuted: 1 }),
    verification: passingVerification(currentTask),
    acceptanceProven: true
  })
  assert.equal(result.decision, 're-evaluate-tier-or-evidence-plan')
  assert.equal(result.efficient, false)
  assert.ok(result.reason_codes.includes('duplicate-work-executed'))
}

{
  const currentTask = task({
    tier: 'standard',
    budget: budgets.standard,
    verification_frontier: ['focused', 'affected-subsystem']
  })
  const result = runtimeReceipt(currentTask, {
    phase: 'checkpoint',
    repositoryFingerprint: 'repo-a',
    usage: usage(),
    verification: { 'affected-subsystem': 'failed' }
  })
  assert.equal(result.decision, 'repair')
  assert.ok(result.reason_codes.includes('executed-verification-failed'))
}

{
  const currentTask = task({
    tier: 'standard',
    budget: budgets.standard,
    verification_frontier: ['focused', 'affected-subsystem']
  })
  const result = runtimeReceipt(currentTask, {
    phase: 'checkpoint',
    repositoryFingerprint: 'repo-a',
    usage: usage(),
    verification: { 'affected-subsystem': 'not-executed' }
  })
  assert.equal(result.decision, 'block-external-evidence')
  assert.ok(result.reason_codes.includes('required-verification-not-executed'))
  assert.ok(!result.reason_codes.includes('executed-verification-failed'))
}

{
  const sourceTask = task({
    tier: 'standard',
    risk: 'high',
    truth_sensitivity: 'playback-source',
    budget: budgets.standard,
    verification_frontier: ['focused', 'affected-subsystem', 'exact-source-runtime-route-check']
  })
  const result = runtimeReceipt(sourceTask, {
    phase: 'finish',
    repositoryFingerprint: 'repo-a',
    usage: usage(),
    verification: {
      'affected-subsystem': 'passed',
      'exact-source-runtime-route-check': 'not-executed'
    },
    acceptanceProven: true
  })
  assert.equal(result.decision, 'block-external-evidence')
}

{
  const rightsTask = task({
    tier: 'critical',
    risk: 'critical',
    truth_sensitivity: 'rights',
    budget: budgets.critical,
    verification_frontier: ['focused', 'repository-ci', 'current-head-proof', 'rights-provenance-check']
  })
  const verification = passingVerification(rightsTask)
  verification['rights-provenance-check'] = 'not-executed'
  const result = runtimeReceipt(rightsTask, {
    phase: 'finish',
    repositoryFingerprint: 'repo-a',
    usage: usage(),
    verification,
    acceptanceProven: true
  })
  assert.equal(result.decision, 'block-external-evidence')
}

{
  const criticalTask = task({
    tier: 'critical',
    risk: 'critical',
    truth_sensitivity: 'deployment',
    budget: budgets.critical,
    verification_frontier: ['focused', 'repository-ci', 'current-head-proof']
  })
  const verification = passingVerification(criticalTask)
  verification['current-head-proof'] = 'not-executed'
  const result = runtimeReceipt(criticalTask, {
    phase: 'finish',
    repositoryFingerprint: 'repo-a',
    usage: usage(),
    verification,
    acceptanceProven: true
  })
  assert.equal(result.decision, 'block-external-evidence')
  assert.ok(result.reason_codes.includes('current-or-live-proof-unavailable'))
}

{
  const productionTask = task({
    tier: 'critical',
    risk: 'critical',
    delivery_stop: 'production-verification',
    truth_sensitivity: 'deployment',
    budget: budgets.critical,
    verification_frontier: [
      'focused',
      'repository-ci',
      'current-head-proof',
      'live-production-verification'
    ]
  })
  const verification = passingVerification(productionTask)
  verification['live-production-verification'] = 'not-executed'
  const result = runtimeReceipt(productionTask, {
    phase: 'finish',
    repositoryFingerprint: 'repo-a',
    usage: usage(),
    verification,
    acceptanceProven: true
  })
  assert.equal(result.decision, 'block-external-evidence')
}

{
  const currentTask = task()
  const result = runtimeReceipt(currentTask, {
    phase: 'finish',
    repositoryFingerprint: 'repo-a',
    usage: usage(),
    verification: passingVerification(currentTask),
    acceptanceProven: true,
    ownershipConflict: true
  })
  assert.equal(result.decision, 'repair')
  assert.equal(result.efficient, false)
  assert.ok(result.reason_codes.includes('ownership-conflict'))
}

{
  const currentTask = task()
  const result = runtimeReceipt(currentTask, {
    phase: 'finish',
    repositoryFingerprint: 'repo-a',
    usage: usage(),
    verification: passingVerification(currentTask),
    acceptanceProven: true,
    sourceTruthBroken: true
  })
  assert.equal(result.decision, 'repair')
  assert.ok(result.reason_codes.includes('source-truth-broken'))
}

{
  const key = 'github-read|claim|sha-a|ownership'
  const result = reuseDecision({
    seen: new Set([key]),
    key,
    authorityClass: 'ownership'
  })
  assert.equal(result.reuse, false)
  assert.equal(result.reason_code, 'fresh-authority-required')
}

{
  const key = 'read|catalogue-record|sha-a|impact'
  const result = reuseDecision({
    seen: new Set([key]),
    key,
    stateChanged: true
  })
  assert.equal(result.reuse, false)
  assert.equal(result.reason_code, 'fingerprint-changed')
}

{
  const currentTask = task({
    tier: 'critical',
    risk: 'critical',
    truth_sensitivity: 'rights',
    budget: budgets.critical
  })
  const result = runtimeReceipt(currentTask, {
    phase: 'checkpoint',
    repositoryFingerprint: 'repo-a',
    usage: usage(),
    verification: passingVerification(currentTask),
    expansion: {
      category: 'maxSources',
      used: 30,
      expectedDecisionValue: true,
      protectedProof: true
    }
  })
  assert.equal(result.decision, 're-evaluate-tier-or-evidence-plan')
  assert.ok(result.reason_codes.includes('protected-expansion-reason-missing'))
}

{
  const currentTask = task({
    tier: 'critical',
    risk: 'critical',
    truth_sensitivity: 'rights',
    budget: budgets.critical
  })
  const result = runtimeReceipt(currentTask, {
    phase: 'checkpoint',
    repositoryFingerprint: 'repo-a',
    usage: usage(),
    verification: passingVerification(currentTask),
    expansion: {
      category: 'maxSources',
      used: 30,
      expectedDecisionValue: true,
      protectedProof: true,
      reason: 'one current rights source is required to settle redistribution authority'
    }
  })
  assert.equal(result.decision, 'proceed')
  assert.ok(result.reason_codes.includes('protected-expansion-reason-recorded'))
}

{
  const result = parallelDecision({
    independent: true,
    decisiveEvidenceAlreadyFound: true
  })
  assert.equal(result.parallel, false)
  assert.match(result.reason, /decisive evidence/i)
}

console.log('RAAS CTO runtime tests: PASS')
