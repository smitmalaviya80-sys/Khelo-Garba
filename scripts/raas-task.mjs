#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const configPath = path.resolve(__dirname, '../.raas/config.json')

export function loadConfig() {
  return JSON.parse(fs.readFileSync(configPath, 'utf8'))
}

function normalize(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
}

function unique(items) {
  return [...new Set(items)]
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function containsKeyword(haystack, keyword) {
  const pattern = normalize(keyword)
    .split(' ')
    .map(escapeRegex)
    .join('\\s+')
  return new RegExp(`(^|[^a-z0-9])${pattern}(?=$|[^a-z0-9])`, 'i').test(haystack)
}

function isNegatedKeyword(haystack, keyword) {
  const key = normalize(keyword)
  const negations = [
    `without ${key}`,
    `without changing ${key}`,
    `without touching ${key}`,
    `do not change ${key}`,
    `don't change ${key}`,
    `not change ${key}`,
    `avoid changing ${key}`,
    `leave ${key} unchanged`
  ]
  return negations.some((phrase) => haystack.includes(phrase))
}

function matchRoute(text, route) {
  const haystack = normalize(text)
  const matchedKeywords = route.keywords.filter((keyword) => (
    containsKeyword(haystack, keyword) && !isNegatedKeyword(haystack, keyword)
  ))
  return matchedKeywords.length > 0 ? { ...route, matchedKeywords } : null
}

function detectBroadRequest(text, config) {
  const haystack = normalize(text)
  const matchedPatterns = config.broadRequestPatterns.filter((pattern) => haystack.includes(normalize(pattern)))
  return matchedPatterns
}

function inferLanguageContext(text, matchedRoutes, config) {
  const haystack = normalize(text)
  const languageSignals = [
    'copy', 'text', 'wording', 'label', 'description', 'seo', 'aeo', 'geo', 'content',
    'title', 'metadata presentation', 'onboarding', 'public page', 'social preview', 'open graph'
  ]

  const needsLanguage = languageSignals.some((signal) => containsKeyword(haystack, signal))
    || matchedRoutes.some((route) => route.id === 'content-seo')

  return needsLanguage ? config.languageContext : null
}

function buildOutcome(text, matchedRoutes) {
  const cleaned = String(text || '').trim().replace(/\s+/g, ' ')
  if (!cleaned) return 'Clarify the requested PlayGarba outcome before implementation.'

  const routeLabels = matchedRoutes.map((route) => route.label)
  if (routeLabels.length === 0) {
    return `Improve the requested PlayGarba behaviour without expanding beyond a single reviewable lane: ${cleaned}`
  }

  return `Deliver the requested ${routeLabels.join(' + ')} improvement as the smallest reviewable PlayGarba lane that satisfies: ${cleaned}`
}

function buildNonGoals(matchedRoutes, needsSplit) {
  const defaults = [
    'Do not invent catalogue, artist, release, rights or provider facts.',
    'Do not touch files outside the accepted GitHub claim without updating ownership first.',
    'Do not treat an open PR as completion.'
  ]

  if (needsSplit) {
    defaults.push('Do not implement all detected domains in one branch. Split independent work into child issues before coding.')
  }

  if (!matchedRoutes.some((route) => route.id === 'deployment')) {
    defaults.push('Do not change hosting, DNS or deployment configuration unless the claimed issue explicitly requires it.')
  }

  return defaults
}

function buildValidation(matchedRoutes) {
  const checks = [
    'Fetch current remote main and re-check issue #364, target comments and open PR overlap before implementation.',
    'Run the narrow validators for every changed domain using the current repository scripts.',
    'Reconcile against current main before opening or materially updating the PR.'
  ]

  if (matchedRoutes.some((route) => ['playback', 'explore', 'visual-ui', 'pwa'].includes(route.id))) {
    checks.push('Perform browser/manual verification for the changed interaction or layout when the environment supports it.')
  }

  if (matchedRoutes.some((route) => route.id === 'catalogue')) {
    checks.push('Rebuild generated catalogue/runtime outputs from canonical inputs and validate source identity.')
  }

  if (matchedRoutes.some((route) => route.id === 'deployment')) {
    checks.push('Verify the merged change on the intended production domain after deployment.')
  }

  return checks
}

export function compileTask(text, config = loadConfig()) {
  const input = String(text || '').trim()
  const matchedRoutes = config.routes
    .map((route) => matchRoute(input, route))
    .filter(Boolean)

  const broadPatterns = detectBroadRequest(input, config)
  const routeIds = matchedRoutes.map((route) => route.id)
  const needsSplit = broadPatterns.length > 0 || matchedRoutes.length >= 3
  const languageContext = inferLanguageContext(input, matchedRoutes, config)

  const truthSources = unique([
    ...config.entrypoints,
    ...(languageContext ? [languageContext] : []),
    ...matchedRoutes.flatMap((route) => route.truthSources)
  ])

  const likelyFiles = unique(matchedRoutes.flatMap((route) => route.likelyFiles))
  const risks = unique([
    'duplicate or conflicting active work',
    ...matchedRoutes.flatMap((route) => route.risks)
  ])

  return {
    version: config.version,
    input,
    outcome: buildOutcome(input, matchedRoutes),
    routes: matchedRoutes.map((route) => ({
      id: route.id,
      label: route.label,
      matched_keywords: route.matchedKeywords
    })),
    needs_split: needsSplit,
    split_reasons: [
      ...broadPatterns.map((pattern) => `broad request pattern: ${pattern}`),
      ...(matchedRoutes.length >= 3 ? [`multiple independent domains detected: ${routeIds.join(', ')}`] : [])
    ],
    scope: needsSplit
      ? 'Create/select bounded child implementation issues before coding; compile each child separately.'
      : matchedRoutes.length > 0
        ? `One reviewable lane focused on: ${matchedRoutes.map((route) => route.label).join(' + ')}.`
        : 'One bounded implementation lane derived from the target issue and repository evidence.',
    non_goals: buildNonGoals(matchedRoutes, needsSplit),
    truth_sources: truthSources,
    likely_files: likelyFiles,
    risks,
    validation: buildValidation(matchedRoutes),
    completion: [
      'Implementation matches the accepted issue claim.',
      'Relevant validation ran on the final reconciled branch state.',
      'Reviewable PR includes Agent-Claim and Agent-ID metadata.',
      'PR is merged before the lane is reported complete.',
      'Production-facing work is verified live after merge; repository-internal work states why live verification is not applicable.',
      'Issue state is reconciled and the active agent claim is released.',
      'If ongoing backlog work was requested, start a fresh preflight before selecting the next issue.'
    ],
    language_context: languageContext,
    client_contract: '.raas/BOOTSTRAP.md'
  }
}

export function formatMarkdown(task) {
  const lines = []
  lines.push('# RAAS task brief')
  lines.push('')
  lines.push(`**Outcome:** ${task.outcome}`)
  lines.push(`**Needs split:** ${task.needs_split ? 'yes' : 'no'}`)
  lines.push(`**Scope:** ${task.scope}`)

  if (task.routes.length) {
    lines.push('')
    lines.push('## Routed domains')
    for (const route of task.routes) {
      lines.push(`- ${route.label}: ${route.matched_keywords.join(', ')}`)
    }
  }

  if (task.split_reasons.length) {
    lines.push('')
    lines.push('## Split reasons')
    for (const reason of task.split_reasons) lines.push(`- ${reason}`)
  }

  lines.push('')
  lines.push('## Non-goals')
  for (const item of task.non_goals) lines.push(`- ${item}`)

  lines.push('')
  lines.push('## Truth sources')
  for (const item of task.truth_sources) lines.push(`- \`${item}\``)

  if (task.likely_files.length) {
    lines.push('')
    lines.push('## Likely files')
    for (const item of task.likely_files) lines.push(`- \`${item}\``)
  }

  lines.push('')
  lines.push('## Risks')
  for (const item of task.risks) lines.push(`- ${item}`)

  lines.push('')
  lines.push('## Validation')
  for (const item of task.validation) lines.push(`- ${item}`)

  lines.push('')
  lines.push('## Completion gate')
  for (const item of task.completion) lines.push(`- ${item}`)

  if (task.language_context) {
    lines.push('')
    lines.push(`Load language context: \`${task.language_context}\``)
  }

  lines.push('')
  lines.push(`Client/bootstrap contract: \`${task.client_contract}\``)
  return `${lines.join('\n')}\n`
}

function parseArgs(argv) {
  const args = { json: false, base: false, text: null, file: null }

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--json') args.json = true
    else if (arg === '--base') args.base = true
    else if (arg === '--text') args.text = argv[++i] ?? ''
    else if (arg === '--file') args.file = argv[++i] ?? ''
    else if (arg === '--help' || arg === '-h') args.help = true
    else if (!args.text && !args.file) args.text = arg
  }

  return args
}

function usage() {
  return `RAAS task compiler\n\nDirect CLI output uses the adaptive CTO compiler by default. Use --base only when the legacy/base task brief is explicitly required.\n\nUsage:\n  node scripts/raas-task.mjs --text "<request or issue text>"\n  node scripts/raas-task.mjs --file path/to/issue.txt\n  printf '%s' "<request>" | node scripts/raas-task.mjs\n  node scripts/raas-task.mjs --json --text "<request>"\n  node scripts/raas-task.mjs --base --json --text "<request>"\n`
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

  if (args.base) {
    const task = compileTask(input)
    process.stdout.write(args.json ? `${JSON.stringify(task, null, 2)}\n` : formatMarkdown(task))
    return
  }

  const { compileAdaptiveTask, formatAdaptiveMarkdown } = await import('./raas-adaptive.mjs')
  const task = compileAdaptiveTask(input)
  process.stdout.write(args.json ? `${JSON.stringify(task, null, 2)}\n` : formatAdaptiveMarkdown(task))
}

const invokedDirectly = process.argv[1]
  && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href

if (invokedDirectly) {
  main().catch((error) => {
    process.stderr.write(`${error.stack || error.message}\n`)
    process.exitCode = 1
  })
}
