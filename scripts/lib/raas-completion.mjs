#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

function text(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function bool(value) {
  return value === true
}

function issueClosed(issue) {
  const state = text(issue?.state).toLowerCase()
  return state === 'closed' || state === 'completed'
}

function validationSatisfied(validation) {
  const status = text(validation?.status).toLowerCase()
  if (status === 'passed' || status === 'success') return true
  if (status === 'not_applicable' || status === 'not-applicable') {
    return Boolean(text(validation?.reason))
  }
  return false
}

function productionSatisfied(production) {
  if (production?.applicable === true) return production.verified === true
  if (production?.applicable === false) return Boolean(text(production.reason))
  return false
}

function prSatisfied(pr) {
  if (pr?.required === false) return Boolean(text(pr.reason))
  return pr?.required !== false && pr?.merged === true && text(pr?.state).toLowerCase() === 'closed'
}

function claimSatisfied(claim) {
  return claim?.active === false && claim?.released === true
}

export function evaluateCompletion(record = {}) {
  const reasons = []
  const blockers = Array.isArray(record.blockers)
    ? record.blockers.map((item) => text(typeof item === 'string' ? item : item?.reason)).filter(Boolean)
    : []

  if (!issueClosed(record.issue)) reasons.push('implementation issue is not closed/completed')
  if (!claimSatisfied(record.claim)) reasons.push('agent claim is still active or has not been released')
  if (!validationSatisfied(record.validation)) reasons.push('final validation has not passed or lacks a reasoned not-applicable state')
  if (!prSatisfied(record.pr)) reasons.push('required pull request is not both merged and closed, or PR exemption lacks a reason')
  if (!productionSatisfied(record.production)) {
    if (record.production?.applicable === true) reasons.push('production verification is required but not verified')
    else reasons.push('production applicability is unresolved or a not-applicable reason is missing')
  }

  if (blockers.length) reasons.push(...blockers.map((item) => `blocker: ${item}`))

  let status = 'incomplete'
  if (reasons.length === 0) status = 'complete'
  else if (blockers.length > 0) status = 'blocked'

  return {
    status,
    complete: status === 'complete',
    issue_number: Number.isInteger(record.issue?.number) ? record.issue.number : null,
    reasons,
    gates: {
      issue_closed: issueClosed(record.issue),
      claim_released: claimSatisfied(record.claim),
      validation_satisfied: validationSatisfied(record.validation),
      pr_satisfied: prSatisfied(record.pr),
      production_satisfied: productionSatisfied(record.production),
      blockers_clear: blockers.length === 0
    }
  }
}

function exclusionReasons(candidate) {
  const reasons = []
  if (text(candidate?.state).toLowerCase() !== 'open') reasons.push('issue is not open')
  if (candidate?.coordination_only === true) reasons.push('coordination/master issue')
  if (candidate?.actionable === false) reasons.push('not currently actionable')
  if (candidate?.blocked === true) reasons.push('blocked')
  if (candidate?.active_claim === true) reasons.push('active claim exists')
  if (candidate?.open_pr_overlap === true) reasons.push('overlapping open PR exists')
  return reasons
}

function issueNumber(candidate) {
  return Number.isInteger(candidate?.number) ? candidate.number : Number.MAX_SAFE_INTEGER
}

function priority(candidate) {
  return Number.isFinite(candidate?.priority) ? candidate.priority : 0
}

export function selectNextIssues(snapshot = {}) {
  const input = Array.isArray(snapshot.candidates) ? snapshot.candidates : []
  const eligible = []
  const excluded = []

  for (const candidate of input) {
    const reasons = exclusionReasons(candidate)
    const summary = {
      number: Number.isInteger(candidate?.number) ? candidate.number : null,
      title: text(candidate?.title) || null,
      priority: priority(candidate)
    }

    if (reasons.length) excluded.push({ ...summary, reasons })
    else eligible.push(summary)
  }

  eligible.sort((a, b) => (
    b.priority - a.priority
    || (a.number ?? Number.MAX_SAFE_INTEGER) - (b.number ?? Number.MAX_SAFE_INTEGER)
  ))

  excluded.sort((a, b) => (
    (a.number ?? Number.MAX_SAFE_INTEGER) - (b.number ?? Number.MAX_SAFE_INTEGER)
  ))

  return {
    recommended: eligible[0] ?? null,
    eligible,
    excluded,
    auto_claimed: false,
    instruction: eligible.length
      ? 'Refresh the recommended issue and open PR overlap again, then post a fresh RAAS claim before implementation.'
      : 'No safe candidate is present in this supplied snapshot. Refresh GitHub state or resolve blockers before starting another lane.'
  }
}

function usage() {
  return `RAAS completion evaluator\n\nUsage:\n  node scripts/lib/raas-completion.mjs evaluate --file completion.json\n  node scripts/lib/raas-completion.mjs evaluate --json --file completion.json\n  node scripts/lib/raas-completion.mjs candidates --file candidates.json\n  node scripts/lib/raas-completion.mjs candidates --json --file candidates.json\n`
}

function parseArgs(argv) {
  const args = { command: argv[0], file: null, json: false }
  for (let i = 1; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--file') args.file = argv[++i] ?? null
    else if (arg === '--json') args.json = true
    else if (arg === '--help' || arg === '-h') args.help = true
  }
  return args
}

function formatEvaluation(result) {
  const lines = [`RAAS completion: ${result.status}`]
  if (result.issue_number != null) lines.push(`Issue: #${result.issue_number}`)
  for (const [gate, passed] of Object.entries(result.gates)) {
    lines.push(`${passed ? 'PASS' : 'FAIL'} ${gate}`)
  }
  if (result.reasons.length) {
    lines.push('Reasons:')
    for (const reason of result.reasons) lines.push(`- ${reason}`)
  }
  return `${lines.join('\n')}\n`
}

function formatCandidates(result) {
  const lines = []
  if (result.recommended) {
    lines.push(`RAAS next candidate: #${result.recommended.number}${result.recommended.title ? ` ${result.recommended.title}` : ''}`)
  } else {
    lines.push('RAAS next candidate: none')
  }
  if (result.eligible.length) {
    lines.push('Eligible:')
    for (const item of result.eligible) lines.push(`- #${item.number} priority=${item.priority}${item.title ? ` ${item.title}` : ''}`)
  }
  if (result.excluded.length) {
    lines.push('Excluded:')
    for (const item of result.excluded) lines.push(`- #${item.number}: ${item.reasons.join('; ')}`)
  }
  lines.push(result.instruction)
  return `${lines.join('\n')}\n`
}

function readJsonFile(file) {
  if (!file) throw new Error('Missing --file input')
  return JSON.parse(fs.readFileSync(path.resolve(process.cwd(), file), 'utf8'))
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.help || !['evaluate', 'candidates'].includes(args.command)) {
    process.stdout.write(usage())
    if (!args.help) process.exitCode = 2
    return
  }

  const input = readJsonFile(args.file)
  const result = args.command === 'evaluate' ? evaluateCompletion(input) : selectNextIssues(input)
  if (args.json) process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
  else process.stdout.write(args.command === 'evaluate' ? formatEvaluation(result) : formatCandidates(result))

  if (args.command === 'evaluate' && result.status !== 'complete') process.exitCode = 1
}

const invokedDirectly = process.argv[1]
  && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href

if (invokedDirectly) {
  main().catch((error) => {
    process.stderr.write(`${error.stack || error.message}\n`)
    process.exitCode = 2
  })
}
