#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { compileTask } from './raas-task.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '..')
const adaptiveConfigPath = path.resolve(repoRoot, '.raas/adaptive-cto.json')
const kernelPath = path.resolve(repoRoot, '.raas/kernel.json')
const kernelRelativePath = '.raas/kernel.json'
const kernelCoveredSources = new Set([
  'AGENTS.md',
  '.raas/RAAS.md',
  '.raas/PROJECT-CONTEXT.md',
  '.raas/EXECUTION.md'
])
const requiredKernelInvariantIds = Object.freeze([
  'source-first-truth',
  'no-invented-catalogue-facts',
  'claim-before-code',
  'canonical-inputs-before-generated',
  'pr-is-not-completion',
  'verified-results-only',
  'client-neutral-truth'
])

export function loadAdaptiveConfig() {
  return JSON.parse(fs.readFileSync(adaptiveConfigPath, 'utf8'))
}

export function loadKernel() {
  return JSON.parse(fs.readFileSync(kernelPath, 'utf8'))
}

function normalize(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
}

function includesAny(text, terms) {
  return terms.some((term) => text.includes(term))
}

function routeIds(task) {
  return task.routes.map((route) => route.id)
}

function repoPath(root, relativePath) {
  const target = path.resolve(root, relativePath)
  const relative = path.relative(root, target)
  if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error(`RAAS kernel source escapes repository root: ${relativePath}`)
  }
  return target
}

export function validateKernel(kernel = loadKernel(), { root = repoRoot } = {}) {
  if (!kernel || typeof kernel !== 'object' || Array.isArray(kernel)) throw new Error('RAAS kernel must be an object')
  if (kernel.schemaVersion !== 'raas-kernel/v1') throw new Error(`Unsupported RAAS kernel schema: ${kernel.schemaVersion || '(missing)'}`)
  if (!Number.isInteger(kernel.version) || kernel.version < 1) throw new Error('RAAS kernel version must be a positive integer')
  if (!Array.isArray(kernel.invariants)) throw new Error('RAAS kernel invariants must be an array')

  const ids = kernel.invariants.map((invariant) => invariant?.id).filter(Boolean)
  if (new Set(ids).size !== ids.length) throw new Error('RAAS kernel invariant IDs must be unique')
  for (const id of requiredKernelInvariantIds) {
    if (!ids.includes(id)) throw new Error(`RAAS kernel missing required invariant: ${id}`)
  }

  const humanContract = String(kernel.humanContract || '').trim()
  if (!humanContract) throw new Error('RAAS kernel humanContract is required')
  const humanPath = repoPath(root, humanContract)
  if (!fs.existsSync(humanPath) || !fs.statSync(humanPath).isFile()) {
    throw new Error(`RAAS kernel human contract is missing: ${humanContract}`)
  }
  const human = fs.readFileSync(humanPath, 'utf8')

  for (const invariant of kernel.invariants) {
    if (!invariant || typeof invariant !== 'object' || Array.isArray(invariant)) throw new Error('RAAS kernel invariant must be an object')
    const id = String(invariant.id || '').trim()
    const source = String(invariant.source || '').trim()
    const anchor = String(invariant.anchor || '').trim()
    const summary = String(invariant.summary || '').trim()
    if (!id || !source || !anchor || !summary) throw new Error(`RAAS kernel invariant is incomplete: ${id || '(missing id)'}`)

    const sourcePath = repoPath(root, source)
    if (!fs.existsSync(sourcePath) || !fs.statSync(sourcePath).isFile()) {
      throw new Error(`RAAS kernel source is missing for ${id}: ${source}`)
    }
    const sourceText = fs.readFileSync(sourcePath, 'utf8')
    if (!sourceText.includes(anchor)) throw new Error(`RAAS kernel anchor drifted for ${id}: ${source}`)
    if (!human.includes(`\`${id}\``) || !human.includes(`\`${source}\``)) {
      throw new Error(`RAAS kernel human contract does not index ${id} -> ${source}`)
    }
  }

  return kernel
}

function detectDeliveryStop(text) {
  if (includesAny(text, ['production', 'deploy it', 'deploy this', 'go live', 'live site', 'ship it live'])) return 'production-verification'
  if (includesAny(text, ['merge the pr', 'merge this', 'merge it', 'through merge'])) return 'merge'
  if (includesAny(text, ['open a pr', 'create a pr', 'pull request', 'through pr'])) return 'pull-request'

  const planSignals = ['plan only', 'just plan', 'make a plan', 'create a plan', 'plan this', 'strategy only']
  const executeAfterPlanSignals = ['then implement', 'and implement', 'then fix', 'start fixing', 'execute the plan', 'implement it after']
  if (includesAny(text, planSignals) && !includesAny(text, executeAfterPlanSignals)) return 'plan'

  const implementationSignals = ['implement', 'fix', 'change', 'update', 'edit', 'add', 'remove', 'build', 'code']
  const hasImplementationSignal = includesAny(text, implementationSignals)
  if (includesAny(text, ['explain', 'what is', 'what are', 'why ', 'how does', 'how do ', 'tell me']) && !hasImplementationSignal) return 'answer'
  return 'local-change'
}

function detectMode(text, deliveryStop, task) {
  if (includesAny(text, ['outage', 'incident', 'production broken', 'site is down', 'emergency fix'])) return 'incident'
  if (deliveryStop === 'production-verification' || routeIds(task).includes('deployment') || includesAny(text, ['deploy it', 'deploy this', 'go live', 'ship it live'])) return 'release'
  if (deliveryStop === 'plan') return 'plan'
  if (deliveryStop === 'answer') return 'answer'
  if (includesAny(text, ['audit', 'review', 'inspect', 'critique', 'check all'])) return 'audit'
  if (includesAny(text, ['research', 'find sources', 'search for', 'verify source', 'investigate']) && !includesAny(text, ['implement', 'fix', 'change', 'update'])) return 'research'

  const routes = routeIds(task)
  const metadataSignals = ['description', 'metadata', 'title', 'copy', 'wording', 'label']
  if (routes.length <= 1 && routes.every((route) => ['catalogue', 'content-seo'].includes(route)) && includesAny(text, metadataSignals)) return 'metadata-content-change'
  return 'implementation'
}

function detectTruthSensitivity(task) {
  const routes = new Set(routeIds(task))
  if (routes.has('rights')) return 'rights'
  if (routes.has('deployment')) return 'deployment'
  if (routes.has('playback')) return 'playback-source'
  if (routes.has('pwa')) return 'public-runtime'
  if (routes.has('catalogue')) return 'catalogue-identity'
  if (routes.has('content-seo')) return 'public-claims'
  return 'ordinary-code'
}

function detectUncertainty(text) {
  if (includesAny(text, ['owner decision required', 'owner approval required', 'blocked by owner', 'waiting on owner'])) return 'owner-blocked'
  if (includesAny(text, ['unknown', 'unclear', 'ambiguous', 'missing evidence', 'cannot verify', 'not verified'])) return 'evidence-missing'
  if (includesAny(text, ['verify', 'audit', 'research', 'investigate', 'find exact', 'find source'])) return 'resolvable'
  return 'known'
}

function detectBlastRadius(task, truthSensitivity) {
  const routes = new Set(routeIds(task))
  if (truthSensitivity === 'deployment') return 'production'
  if (routes.has('pwa')) return 'pwa-public-site'
  if (routes.has('catalogue')) return 'persistent-generated-catalogue'
  if (routes.has('playback')) return 'player-catalogue-subsystem'
  if (routes.has('content-seo')) return 'public-site'
  if (routes.has('explore') || routes.has('visual-ui')) return 'feature'
  return 'record-local'
}

function detectReversibility(truthSensitivity, blastRadius) {
  if (truthSensitivity === 'deployment' || truthSensitivity === 'rights') return 'hard-to-reverse'
  if (['persistent-generated-catalogue', 'player-catalogue-subsystem', 'pwa-public-site'].includes(blastRadius)) return 'compensable'
  return 'reversible'
}

function detectRisk(task, truthSensitivity, mode) {
  const routes = new Set(routeIds(task))
  if (mode === 'incident' || ['rights', 'deployment'].includes(truthSensitivity)) return 'critical'
  if (routes.has('pwa') || truthSensitivity === 'playback-source') return 'high'
  if (routes.has('catalogue') || routes.has('explore') || routes.has('visual-ui') || routes.has('content-seo')) return 'moderate'
  return 'low'
}

function isMetadataOnly(text, task) {
  const routes = routeIds(task)
  if (routes.length !== 1 || !['catalogue', 'content-seo'].includes(routes[0])) return false
  const metadataSignals = ['description', 'metadata', 'title', 'copy', 'wording', 'label']
  const identitySignals = ['youtube', 'playback', 'provider', 'rights', 'license', 'identity', 'duplicate', 'merge release', 'tracklist', 'taxonomy']
  return includesAny(text, metadataSignals) && !includesAny(text, identitySignals)
}

function selectTier({ task, text, risk, deliveryStop }) {
  const routes = new Set(routeIds(task))
  if (risk === 'critical' || deliveryStop === 'production-verification') return 'critical'
  if (task.needs_split || routes.size >= 3 || routes.has('pwa') || (routes.has('playback') && routes.has('catalogue'))) return 'deep'
  if (isMetadataOnly(text, task)) return 'fast'
  if (risk === 'high' || risk === 'moderate' || routes.size > 0) return 'standard'
  return 'fast'
}

function escalationReasons({ task, risk, truthSensitivity, deliveryStop, tier }) {
  const reasons = []
  if (task.needs_split) reasons.push('request spans multiple reviewable lanes')
  if (risk === 'critical') reasons.push('critical risk or protected truth surface')
  if (risk === 'high') reasons.push('high-risk runtime/source surface')
  if (truthSensitivity !== 'ordinary-code') reasons.push(`truth sensitivity: ${truthSensitivity}`)
  if (deliveryStop === 'production-verification') reasons.push('requested delivery stop includes production verification')
  if (tier === 'fast' && reasons.length === 0) reasons.push('bounded low-risk lane with focused proof')
  return reasons
}

function verificationFrontier(task, tier, deliveryStop) {
  const routes = new Set(routeIds(task))
  const frontier = ['focused']
  if (['standard', 'deep', 'critical'].includes(tier)) frontier.push('affected-subsystem')
  if (['deep', 'critical'].includes(tier)) frontier.push('repository-ci')
  if (tier === 'critical') frontier.push('current-head-proof')
  if ((routes.has('visual-ui') || routes.has('explore') || routes.has('pwa')) && !['answer', 'plan'].includes(deliveryStop)) frontier.push('browser-manual-when-acceptance-is-visual')
  if (routes.has('catalogue')) frontier.push('canonical-source-generated-output-check')
  if (routes.has('playback')) frontier.push('exact-source-runtime-route-check')
  if (routes.has('rights')) frontier.push('rights-provenance-check')
  if (deliveryStop === 'production-verification') frontier.push('live-production-verification')
  return [...new Set(frontier)]
}

function stopConditions(task, deliveryStop) {
  const conditions = [
    'Stop consuming context or tools when another operation has low expected decision value.',
    'Stop blind repair when the same failure repeats without new diagnosis or evidence.',
    'Stop and split before mutation when the request cannot remain one reviewable owned lane.',
    'Stop at the requested delivery point once required evidence is green.'
  ]
  if (task.needs_split) conditions.unshift('Do not implement the broad request directly; split/select child issues first.')
  if (deliveryStop === 'plan') conditions.push('Do not mutate repository state merely to complete a plan-only request.')
  if (deliveryStop === 'answer') conditions.push('Do not claim or mutate an implementation lane for an answer-only request.')
  return conditions
}

function explicitRepoPaths(input) {
  const values = []
  const accept = (candidate) => {
    const value = String(candidate || '').trim().replace(/[),.;:]+$/, '')
    if (!value || /^https?:\/\//i.test(value) || value.includes(' ') || !value.includes('/')) return
    if (value.startsWith('/') || value.startsWith('../') || value.includes('/../')) return
    if (!/^[A-Za-z0-9._*\-/]+$/.test(value)) return
    values.push(value)
  }
  for (const match of String(input || '').matchAll(/`([^`]+)`/g)) accept(match[1])
  for (const match of String(input || '').matchAll(/\b(?:[A-Za-z0-9._-]+\/)+(?:[A-Za-z0-9._*-]+)\b/g)) accept(match[0])
  return [...new Set(values)]
}

function contextQueryKey(query) {
  return [query.kind, query.target, query.purpose].map(normalize).join('|')
}

function dedupeContextQueries(queries) {
  const seen = new Set()
  return queries.filter((query) => {
    const key = contextQueryKey(query)
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function sourceQueries(task, maxSources) {
  const sources = task.truth_sources.filter((source) => !kernelCoveredSources.has(source))
  const bounded = Number.isFinite(maxSources) ? sources.slice(0, Math.max(0, maxSources)) : sources
  return bounded.map((source, index) => ({
    id: `source-${index + 1}`,
    kind: 'source',
    target: source,
    purpose: 'Load this route-specific authority only if it can change the bounded task decision.',
    required: true,
    freshness: 'repository-revision'
  }))
}

function exactIdentityQuery(task) {
  const routes = new Set(routeIds(task))
  if (routes.has('rights')) {
    return {
      id: 'exact-rights-evidence',
      kind: 'evidence',
      target: 'exact recording, rights holder, licence scope and durable provenance for the named asset',
      purpose: 'Prove redistribution/streaming authority for the exact recording before any executable rights change.',
      required: true,
      freshness: 'current-source-evidence'
    }
  }
  if (routes.has('playback')) {
    return {
      id: 'exact-playback-identity',
      kind: 'evidence',
      target: 'exact canonical recording plus current playback manifest route and authoritative provider recording evidence',
      purpose: 'Prove that the executable provider route matches the intended recording/release and current canonical ID.',
      required: true,
      freshness: 'current-source-evidence'
    }
  }
  if (routes.has('catalogue')) {
    return {
      id: 'exact-catalogue-identity',
      kind: 'evidence',
      target: 'exact named canonical catalogue record plus direct source evidence controlling the requested facts',
      purpose: 'Resolve the owning shard and source-backed identity before editing catalogue metadata or relationships.',
      required: true,
      freshness: 'current-source-evidence'
    }
  }
  return null
}

function buildContextQueries({ task, input, budget, mutationAllowed, verification }) {
  const queries = [{
    id: 'compact-kernel',
    kind: 'kernel',
    target: kernelRelativePath,
    purpose: 'Load compact cross-cutting invariants and canonical source pointers without preloading full doctrine.',
    required: true,
    freshness: 'repository-revision'
  }]

  if (task.needs_split) {
    queries.push({
      id: 'split-preflight',
      kind: 'github',
      target: 'current target/master issue, recent comments, issue #364 and open child/overlap PRs',
      purpose: 'Select one bounded unowned child lane before loading implementation-domain context.',
      required: true,
      freshness: 'current'
    })
    return dedupeContextQueries(queries)
  }

  if (mutationAllowed) {
    queries.push({
      id: 'ownership-preflight',
      kind: 'github',
      target: 'target implementation issue, recent comments, issue #364 and overlapping open PRs',
      purpose: 'Refresh current issue, branch and file ownership before repository mutation.',
      required: true,
      freshness: 'current'
    })
  }

  const explicitPaths = explicitRepoPaths(input)
  if (explicitPaths.length > 0) {
    queries.push({
      id: 'explicit-targets',
      kind: 'repository',
      target: explicitPaths.join('; '),
      purpose: 'Inspect the exact named files/symbol-adjacent sources before any broader repository read.',
      required: true,
      freshness: 'repository-revision'
    })
  } else if (task.routes.length > 0) {
    queries.push({
      id: 'resolve-exact-target',
      kind: 'repository',
      target: `exact current file/record/symbol inside the ${task.routes.map((route) => route.label).join(' + ')} lane`,
      purpose: 'Resolve the smallest owning source from the request and issue before reading broad likely-file globs.',
      required: true,
      freshness: 'repository-revision'
    })
  }

  queries.push(...sourceQueries(task, budget.maxSources ?? null))

  const identityQuery = exactIdentityQuery(task)
  if (identityQuery) queries.push(identityQuery)

  if (verification.includes('browser-manual-when-acceptance-is-visual')) {
    queries.push({
      id: 'visual-browser-evidence',
      kind: 'browser-evidence',
      target: 'current affected interaction/layout at the required viewport/browser states',
      purpose: 'Capture browser evidence only because the acceptance criterion is visual or interaction behavior.',
      required: true,
      freshness: 'current-head'
    })
  }

  return dedupeContextQueries(queries)
}

export function compileAdaptiveTask(text, config = loadAdaptiveConfig()) {
  const input = String(text || '').trim()
  const normalized = normalize(input)
  const task = compileTask(input)
  const deliveryStop = detectDeliveryStop(normalized)
  const mode = detectMode(normalized, deliveryStop, task)
  const truthSensitivity = detectTruthSensitivity(task)
  const uncertainty = detectUncertainty(normalized)
  const blastRadius = detectBlastRadius(task, truthSensitivity)
  const reversibility = detectReversibility(truthSensitivity, blastRadius)
  const risk = detectRisk(task, truthSensitivity, mode)
  const tier = selectTier({ task, text: normalized, risk, deliveryStop })
  const budget = config.tiers[tier]
  const mutationAllowed = !['answer', 'plan'].includes(deliveryStop)
  const verification = verificationFrontier(task, tier, deliveryStop)
  const kernel = validateKernel()
  const contextQueries = buildContextQueries({ task, input, budget, mutationAllowed, verification })

  return {
    version: config.version,
    input,
    mode,
    risk,
    blast_radius: blastRadius,
    reversibility,
    uncertainty,
    delivery_stop: deliveryStop,
    truth_sensitivity: truthSensitivity,
    tier,
    budget,
    budget_is_ceiling_not_target: true,
    mutation_allowed: mutationAllowed,
    needs_split: task.needs_split,
    routes: task.routes,
    scope: task.scope,
    truth_sources: task.truth_sources,
    likely_files: task.likely_files,
    risks: task.risks,
    compact_kernel: {
      path: kernelRelativePath,
      human: kernel.humanContract,
      schema_version: kernel.schemaVersion,
      version: kernel.version,
      invariant_ids: kernel.invariants.map((invariant) => invariant.id)
    },
    context_queries: contextQueries,
    escalation_reasons: escalationReasons({ task, risk, truthSensitivity, deliveryStop, tier }),
    verification_frontier: verification,
    parallelism_policy: {
      read_only_agents_max: budget.parallelReadOnlyAgents,
      mutation_lanes_max: budget.parallelMutationLanes,
      rule: 'Parallelise only independently verifiable work. Converge shared evidence before mutation and cancel redundant lanes once decisive evidence exists.'
    },
    context_policy: {
      order: config.contextOrder,
      max_sources: budget.maxSources ?? null,
      context_chars: budget.contextChars ?? budget.softContextChars ?? null,
      rule: 'Prefer exact current authority and fingerprinted reuse. Deduplicate repeated doctrine and expand only when additional context can change the result.'
    },
    value_of_information: config.valueOfInformation,
    stop_conditions: stopConditions(task, deliveryStop),
    base_task: task
  }
}

export function operationFingerprint({ kind, target = '', sourceFingerprint = '', purpose = '' }) {
  return [kind, target, sourceFingerprint, purpose]
    .map((value) => normalize(value))
    .join('|')
}

export function shouldReuseOperation({ seen = new Set(), key, protectedEvidence = false, stateChanged = false }) {
  if (!key) throw new Error('operation key is required')
  if (protectedEvidence || stateChanged) return { reuse: false, reason: protectedEvidence ? 'protected evidence requires current proof' : 'source or repository state changed' }
  if (seen.has(key)) return { reuse: true, reason: 'identical current operation already produced reusable evidence' }
  return { reuse: false, reason: 'no current reusable operation found' }
}

export function selectCapabilityClass({ task, deterministic = false, independentReview = false, visualAcceptance = false }) {
  const sensitivity = task.truth_sensitivity
  if (deterministic) return 'deterministic-local'
  if (independentReview) return 'independent-review'
  if (visualAcceptance) return 'visual-browser-verification'
  if (['rights', 'playback-source'].includes(sensitivity)) return 'source-rights-evidence'
  if (['deep', 'critical'].includes(task.tier) || task.uncertainty !== 'known') return 'architecture-high-uncertainty'
  return 'routine-coding-reasoning'
}

export function shouldParallelize({ independent, sharedDecision = false, sharedMutation = false, duplicatedContext = false, decisiveEvidenceAlreadyFound = false }) {
  if (decisiveEvidenceAlreadyFound) return { parallel: false, reason: 'cancel redundant lane because decisive evidence already exists' }
  if (!independent) return { parallel: false, reason: 'work is not independently verifiable' }
  if (sharedDecision) return { parallel: false, reason: 'lanes depend on one unresolved shared decision' }
  if (sharedMutation) return { parallel: false, reason: 'shared mutation must remain one owned lane' }
  if (duplicatedContext) return { parallel: false, reason: 'parallelism would duplicate context discovery rather than reduce work' }
  return { parallel: true, reason: 'independent bounded work can converge without shared mutation' }
}

export function evaluateRunEfficiency(task, usage = {}) {
  const budget = task.budget
  const limits = {
    sources: budget.maxSources ?? Infinity,
    contextChars: budget.contextChars ?? budget.softContextChars ?? Infinity,
    toolCalls: budget.toolCallsBeforeReevaluation ?? Infinity,
    readOnlyAgents: budget.parallelReadOnlyAgents ?? Infinity,
    mutationLanes: budget.parallelMutationLanes ?? 1,
    repairRounds: budget.repairRounds ?? Infinity
  }
  const actual = {
    sources: usage.sources ?? 0,
    contextChars: usage.contextChars ?? 0,
    toolCalls: usage.toolCalls ?? 0,
    readOnlyAgents: usage.readOnlyAgents ?? 0,
    mutationLanes: usage.mutationLanes ?? 0,
    repairRounds: usage.repairRounds ?? 0,
    duplicateOperationsSuppressed: usage.duplicateOperationsSuppressed ?? 0,
    duplicateOperationsExecuted: usage.duplicateOperationsExecuted ?? 0
  }
  const exceeded = Object.entries(limits)
    .filter(([key, limit]) => Number.isFinite(limit) && actual[key] > limit)
    .map(([key]) => key)
  const qualityGreen = usage.requiredVerificationPassed === true
    && usage.unresolvedHighRiskFinding !== true
    && usage.sourceTruthBroken !== true
    && usage.ownershipConflict !== true
  const duplicateWaste = actual.duplicateOperationsExecuted > 0
  const shouldStop = qualityGreen && usage.acceptanceProven === true
  return {
    tier: task.tier,
    limits,
    actual,
    exceeded,
    within_budget: exceeded.length === 0,
    quality_green: qualityGreen,
    duplicate_waste_detected: duplicateWaste,
    efficient: qualityGreen && exceeded.length === 0 && !duplicateWaste,
    decision: shouldStop ? 'stop-success' : exceeded.length > 0 ? 're-evaluate-or-escalate' : qualityGreen ? 'continue-only-if-acceptance-not-yet-proven' : 'repair-or-block'
  }
}

export function formatAdaptiveMarkdown(result) {
  const lines = [
    '# RAAS adaptive CTO brief',
    '',
    `**Mode:** ${result.mode}`,
    `**Tier:** ${result.tier}`,
    `**Risk:** ${result.risk}`,
    `**Blast radius:** ${result.blast_radius}`,
    `**Reversibility:** ${result.reversibility}`,
    `**Uncertainty:** ${result.uncertainty}`,
    `**Delivery stop:** ${result.delivery_stop}`,
    `**Truth sensitivity:** ${result.truth_sensitivity}`,
    `**Mutation allowed:** ${result.mutation_allowed ? 'yes' : 'no'}`,
    `**Needs split:** ${result.needs_split ? 'yes' : 'no'}`,
    `**Compact kernel:** ${result.compact_kernel.path} (${result.compact_kernel.schema_version})`,
    '',
    '## Context queries',
    ...result.context_queries.map((query) => `- [${query.kind}] \`${query.target}\`: ${query.purpose}`),
    '',
    '## Budget ceiling',
    '```json',
    JSON.stringify(result.budget, null, 2),
    '```',
    '',
    '## Escalation reasons',
    ...result.escalation_reasons.map((item) => `- ${item}`),
    '',
    '## Verification frontier',
    ...result.verification_frontier.map((item) => `- ${item}`),
    '',
    '## Stop conditions',
    ...result.stop_conditions.map((item) => `- ${item}`),
    '',
    `Value-of-information gate: ${result.value_of_information.question}`
  ]
  return `${lines.join('\n')}\n`
}

function parseArgs(argv) {
  const args = { json: false, text: null, file: null }
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--json') args.json = true
    else if (arg === '--text') args.text = argv[++i] ?? ''
    else if (arg === '--file') args.file = argv[++i] ?? ''
    else if (arg === '--help' || arg === '-h') args.help = true
    else if (!args.text && !args.file) args.text = arg
  }
  return args
}

function usage() {
  return `RAAS adaptive CTO compiler\n\nUsage:\n  node scripts/raas-adaptive.mjs --text "<request or issue text>"\n  node scripts/raas-adaptive.mjs --file path/to/issue.txt\n  printf '%s' "<request>" | node scripts/raas-adaptive.mjs\n  node scripts/raas-adaptive.mjs --json --text "<request>"\n`
}

async function readInput(args) {
  if (args.text != null) return args.text
  if (args.file) return fs.readFileSync(path.resolve(process.cwd(), args.file), 'utf8')
  if (!process.stdin.isTTY) {
    let data = ''
    for await (const chunk of process.stdin) data += chunk
    return data
  }
  return ''
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.help) {
    process.stdout.write(usage())
    return
  }
  const input = await readInput(args)
  if (!input.trim()) {
    process.stderr.write(`${usage()}\nError: provide request/issue text with --text, --file or stdin.\n`)
    process.exitCode = 2
    return
  }
  const result = compileAdaptiveTask(input)
  process.stdout.write(args.json ? `${JSON.stringify(result, null, 2)}\n` : formatAdaptiveMarkdown(result))
}

const invokedDirectly = process.argv[1]
  && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href

if (invokedDirectly) {
  main().catch((error) => {
    process.stderr.write(`${error.stack || error.message}\n`)
    process.exitCode = 1
  })
}
