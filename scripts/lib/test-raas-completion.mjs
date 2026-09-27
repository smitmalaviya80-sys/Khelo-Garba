import assert from 'node:assert/strict'
import { evaluateCompletion, selectNextIssues } from './raas-completion.mjs'

function completeRecord(overrides = {}) {
  return {
    issue: { number: 484, state: 'closed' },
    claim: { active: false, released: true, agent: 'chatgpt/test', branch: 'harness/test' },
    validation: { status: 'passed', evidence: ['Validate GARBA: success'] },
    pr: { required: true, number: 500, state: 'closed', merged: true, head_branch: 'harness/test' },
    production: { applicable: false, verified: false, reason: 'Repository-internal harness change' },
    blockers: [],
    ...overrides
  }
}

{
  const result = evaluateCompletion(completeRecord())
  assert.equal(result.status, 'complete')
  assert.equal(result.complete, true)
  assert.equal(result.reasons.length, 0)
  assert.equal(result.gates.claim_released, true)
}

{
  const result = evaluateCompletion(completeRecord({
    pr: { required: true, number: 500, state: 'open', merged: false }
  }))
  assert.equal(result.status, 'incomplete')
  assert.equal(result.complete, false)
  assert.ok(result.reasons.some((reason) => reason.includes('pull request')))
}

{
  const result = evaluateCompletion(completeRecord({
    production: { applicable: true, verified: false }
  }))
  assert.equal(result.status, 'incomplete')
  assert.equal(result.gates.production_satisfied, false)
  assert.ok(result.reasons.some((reason) => reason.includes('production verification')))
}

{
  const result = evaluateCompletion(completeRecord({
    claim: { active: true, released: false, agent: 'chatgpt/test', branch: 'harness/test' }
  }))
  assert.equal(result.status, 'incomplete')
  assert.equal(result.gates.claim_released, false)
  assert.ok(result.reasons.some((reason) => reason.includes('claim')))
}

{
  const result = evaluateCompletion(completeRecord({
    validation: { status: 'not_applicable', reason: 'Research-only evidence note had no executable code path' }
  }))
  assert.equal(result.status, 'complete')
}

{
  const result = evaluateCompletion(completeRecord({
    validation: { status: 'not_applicable' }
  }))
  assert.equal(result.status, 'incomplete')
  assert.equal(result.gates.validation_satisfied, false)
}

{
  const result = evaluateCompletion(completeRecord({
    blockers: ['Owner decision required for canonical domain']
  }))
  assert.equal(result.status, 'blocked')
  assert.ok(result.reasons.some((reason) => reason.includes('Owner decision')))
}

{
  const result = selectNextIssues({
    candidates: [
      { number: 600, title: 'Claimed issue', state: 'open', actionable: true, active_claim: true, priority: 100 },
      { number: 601, title: 'Safe lower priority', state: 'open', actionable: true, active_claim: false, open_pr_overlap: false, blocked: false, coordination_only: false, priority: 20 },
      { number: 602, title: 'Safe higher priority', state: 'open', actionable: true, active_claim: false, open_pr_overlap: false, blocked: false, coordination_only: false, priority: 50 },
      { number: 603, title: 'PR overlap', state: 'open', actionable: true, active_claim: false, open_pr_overlap: true, priority: 90 },
      { number: 604, title: 'Master programme', state: 'open', coordination_only: true, priority: 200 },
      { number: 605, title: 'Closed issue', state: 'closed', actionable: true, priority: 300 }
    ]
  })

  assert.equal(result.recommended.number, 602)
  assert.deepEqual(result.eligible.map((item) => item.number), [602, 601])
  assert.equal(result.auto_claimed, false)
  assert.ok(result.excluded.find((item) => item.number === 600)?.reasons.includes('active claim exists'))
  assert.ok(result.excluded.find((item) => item.number === 603)?.reasons.includes('overlapping open PR exists'))
  assert.ok(result.instruction.includes('fresh RAAS claim'))
}

{
  const result = selectNextIssues({ candidates: [] })
  assert.equal(result.recommended, null)
  assert.equal(result.auto_claimed, false)
  assert.match(result.instruction, /No safe candidate/i)
}

console.log('RAAS completion evaluator tests passed')
