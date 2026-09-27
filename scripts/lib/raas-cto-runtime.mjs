import {
  compileAdaptiveTask,
  evaluateRunEfficiency,
  shouldParallelize,
  shouldReuseOperation
} from '../raas-adaptive.mjs'

export const RUNTIME_SCHEMA = 'raas-cto-runtime/v1'

const VERIFICATION_STATES = new Set([
  'passed',
  'failed',
  'not-executed',
  'skipped',
  'not-required'
])

const DECISIONS = new Set([
  'stop-success',
  'proceed',
  're-evaluate-tier-or-evidence-plan',
  'repair',
  'block-external-evidence',
  'split-before-mutation'
])

const CONDITIONAL_VISUAL_CHECK = 'browser-manual-when-acceptance-is-visual'
const CURRENT_PROOF_CHECKS = new Set([
  'current-head-proof',
  'live-production-verification'
])
const FRESH_AUTHORITY_CLASSES = new Set([
  'ownership',
  'source-route',
  'rights',
  'current-head',
  'live-production'
])
const BLOCKING_EXPANSION_CODES = new Set([
  'protected-expansion-reason-missing',
  'expansion-not-authorised'
])

function requiredChecks(frontier, { visualAcceptance = false } = {}) {
  const required = []
  const notRequired = []
  for (const check of frontier || []) {
    if (check === 'focused') continue
    if (check === CONDITIONAL_VISUAL_CHECK && !visualAcceptance) {
      notRequired.push(check)
      continue
    }
    required.push(check)
  }
  return { required, notRequired }
}

function normalizeVerification(task, supplied = {}, { visualAcceptance = false } = {}) {
  const { required, notRequired } = requiredChecks(task.verification_frontier, {
    visualAcceptance
  })
  const states = {}

  for (const check of notRequired) states[check] = 'not-required'

  for (const check of required) {
    const state = supplied[check] || 'not-executed'
    if (!VERIFICATION_STATES.has(state)) {
      throw new Error(`Unknown verification state for ${check}: ${state}`)
    }
    if (state === 'not-required') {
      throw new Error(`Required verification cannot be marked not-required: ${check}`)
    }
    states[check] = state
  }

  return { states, required }
}

function taskSummary(task) {
  return {
    tier: task.tier,
    mode: task.mode,
    risk: task.risk,
    blast_radius: task.blast_radius,
    reversibility: task.reversibility,
    uncertainty: task.uncertainty,
    delivery_stop: task.delivery_stop,
    truth_sensitivity: task.truth_sensitivity,
    mutation_allowed: task.mutation_allowed,
    needs_split: task.needs_split,
    routes: (task.routes || []).map((route) => route.id || route)
  }
}

function limitsFromTask(task) {
  const budget = task.budget || {}
  return {
    sources: budget.maxSources ?? Infinity,
    contextChars: budget.contextChars ?? budget.softContextChars ?? Infinity,
    toolCalls: budget.toolCallsBeforeReevaluation ?? Infinity,
    readOnlyAgents: budget.parallelReadOnlyAgents ?? Infinity,
    mutationLanes: budget.parallelMutationLanes ?? 1,
    repairRounds: budget.repairRounds ?? Infinity
  }
}

export function reuseDecision({
  seen = new Set(),
  key,
  authorityClass = 'ordinary',
  stateChanged = false
}) {
  const protectedEvidence = FRESH_AUTHORITY_CLASSES.has(authorityClass)
  const result = shouldReuseOperation({
    seen,
    key,
    protectedEvidence,
    stateChanged
  })

  let reasonCode = 'no-reusable-operation'
  if (protectedEvidence) reasonCode = 'fresh-authority-required'
  else if (stateChanged) reasonCode = 'fingerprint-changed'
  else if (result.reuse) reasonCode = 'fingerprint-valid-reuse'

  return {
    ...result,
    authority_class: authorityClass,
    reason_code: reasonCode
  }
}

export function parallelDecision(input) {
  return shouldParallelize(input)
}

function expansionDecision(task, expansion) {
  if (!expansion) return { receipt: null, codes: [] }

  const category = String(expansion.category || '')
  const ceiling = task.budget?.[category]
  const used = Number(expansion.used)
  if (!Number.isFinite(ceiling)) {
    throw new Error(`Unknown finite RAAS budget category: ${category}`)
  }
  if (!Number.isFinite(used) || used < 0) {
    throw new Error('Expansion used value must be a non-negative finite number')
  }

  const expectedDecisionValue = expansion.expectedDecisionValue === true
  const protectedProof = expansion.protectedProof === true
    || task.tier === 'critical'
    || ['rights', 'deployment'].includes(task.truth_sensitivity)
  const reason = String(expansion.reason || '').trim()
  const atCeiling = used >= ceiling
  const codes = []
  let allowed = true

  if (!expectedDecisionValue) {
    allowed = false
    codes.push('expansion-not-authorised')
  } else if (atCeiling && protectedProof && !reason) {
    allowed = false
    codes.push('protected-expansion-reason-missing')
  } else if (atCeiling && protectedProof) {
    codes.push('protected-expansion-reason-recorded')
  } else if (atCeiling) {
    allowed = false
    codes.push('expansion-not-authorised')
  }

  return {
    receipt: {
      category,
      used,
      ceiling,
      expected_decision_value: expectedDecisionValue,
      protected_proof: protectedProof,
      reason: reason || null,
      allowed
    },
    codes
  }
}

export function startReceipt(input, {
  repositoryFingerprint,
  sourceFingerprint = '',
  claimFingerprint = '',
  visualAcceptance = false
} = {}) {
  const task = typeof input === 'string' ? compileAdaptiveTask(input) : input
  const verification = normalizeVerification(task, {}, { visualAcceptance })

  return {
    schema: RUNTIME_SCHEMA,
    phase: 'start',
    task: taskSummary(task),
    repository_fingerprint: repositoryFingerprint || '',
    source_fingerprint: sourceFingerprint,
    claim_fingerprint: claimFingerprint,
    limits: limitsFromTask(task),
    actual: {},
    verification_frontier: task.verification_frontier,
    required_verification: verification.required,
    verification: verification.states,
    duplicate_operations_suppressed: 0,
    duplicate_operations_executed: 0,
    expansion: null,
    decision: task.needs_split && task.mutation_allowed
      ? 'split-before-mutation'
      : 'proceed',
    reason_codes: task.needs_split && task.mutation_allowed
      ? ['broad-request-requires-owned-child-lanes']
      : ['classified', 'bounded-work-authorised']
  }
}

export function runtimeReceipt(task, {
  phase,
  repositoryFingerprint,
  sourceFingerprint = '',
  claimFingerprint = '',
  usage = {},
  verification = {},
  acceptanceProven = false,
  sourceTruthBroken = false,
  ownershipConflict = false,
  visualAcceptance = false,
  expansion = null
} = {}) {
  if (!['checkpoint', 'finish'].includes(phase)) {
    throw new Error('RAAS runtime phase must be checkpoint or finish')
  }

  const normalized = normalizeVerification(task, verification, { visualAcceptance })
  const failed = normalized.required.filter((check) => normalized.states[check] === 'failed')
  const unavailable = normalized.required.filter((check) =>
    ['not-executed', 'skipped'].includes(normalized.states[check])
  )
  const missingCurrentProof = unavailable.filter((check) => CURRENT_PROOF_CHECKS.has(check))
  const requiredVerificationPassed = normalized.required.every(
    (check) => normalized.states[check] === 'passed'
  )

  const baseUsage = {
    ...usage,
    requiredVerificationPassed,
    unresolvedHighRiskFinding: usage.unresolvedHighRiskFinding === true,
    sourceTruthBroken,
    ownershipConflict,
    acceptanceProven
  }
  const efficiency = evaluateRunEfficiency(task, baseUsage)
  const expansionResult = expansionDecision(task, expansion)
  const blockingExpansion = expansionResult.codes.some((code) =>
    BLOCKING_EXPANSION_CODES.has(code)
  )

  const duplicateExecuted = Number(usage.duplicateOperationsExecuted || 0)
  const reasonCodes = []

  if (task.needs_split && task.mutation_allowed) {
    reasonCodes.push('broad-request-requires-owned-child-lanes')
  }
  if (sourceTruthBroken) reasonCodes.push('source-truth-broken')
  if (ownershipConflict) reasonCodes.push('ownership-conflict')
  if (failed.length > 0) reasonCodes.push('executed-verification-failed')
  if (unavailable.length > 0) reasonCodes.push('required-verification-not-executed')
  if (missingCurrentProof.length > 0) reasonCodes.push('current-or-live-proof-unavailable')
  if (efficiency.exceeded.length > 0) reasonCodes.push('budget-ceiling-exceeded')
  if (duplicateExecuted > 0) reasonCodes.push('duplicate-work-executed')
  reasonCodes.push(...expansionResult.codes)

  let decision
  if (sourceTruthBroken || ownershipConflict) {
    decision = 'repair'
  } else if (task.needs_split && task.mutation_allowed) {
    decision = 'split-before-mutation'
  } else if (failed.length > 0) {
    decision = 'repair'
  } else if (unavailable.length > 0) {
    decision = 'block-external-evidence'
  } else if (blockingExpansion) {
    decision = 're-evaluate-tier-or-evidence-plan'
  } else if (efficiency.exceeded.length > 0 || duplicateExecuted > 0) {
    decision = 're-evaluate-tier-or-evidence-plan'
  } else if (phase === 'finish' && acceptanceProven && efficiency.quality_green) {
    decision = 'stop-success'
    reasonCodes.push('acceptance-proven')
  } else {
    decision = 'proceed'
    reasonCodes.push('more-work-still-has-acceptance-value')
  }

  if (!DECISIONS.has(decision)) throw new Error(`Unexpected RAAS runtime decision: ${decision}`)

  return {
    schema: RUNTIME_SCHEMA,
    phase,
    task: taskSummary(task),
    repository_fingerprint: repositoryFingerprint || '',
    source_fingerprint: sourceFingerprint,
    claim_fingerprint: claimFingerprint,
    limits: efficiency.limits,
    actual: efficiency.actual,
    verification_frontier: task.verification_frontier,
    required_verification: normalized.required,
    verification: normalized.states,
    quality_green: efficiency.quality_green,
    within_budget: efficiency.within_budget,
    efficient: decision === 'stop-success'
      && efficiency.within_budget
      && !efficiency.duplicate_waste_detected,
    duplicate_operations_suppressed: Number(usage.duplicateOperationsSuppressed || 0),
    duplicate_operations_executed: duplicateExecuted,
    expansion: expansionResult.receipt,
    decision,
    reason_codes: [...new Set(reasonCodes)]
  }
}
