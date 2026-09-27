import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { compileTask } from './raas-task.mjs'

const cliPath = fileURLToPath(new URL('./raas-task.mjs', import.meta.url))

function routeIds(task) {
  return task.routes.map((route) => route.id)
}

function runCli(args, input) {
  const result = spawnSync(process.execPath, [cliPath, ...args], {
    encoding: 'utf8',
    input
  })
  assert.equal(result.status, 0, result.stderr || `RAAS task CLI exited ${result.status}`)
  return result.stdout
}

function runJsonCli(args, input) {
  return JSON.parse(runCli(['--json', ...args], input))
}

{
  const task = compileTask('Fix the mobile player so verified YouTube playback opens correctly and next song continuity still works.')
  assert.equal(task.needs_split, false)
  assert.ok(routeIds(task).includes('playback'))
  assert.ok(routeIds(task).includes('visual-ui'))
  assert.ok(task.risks.includes('wrong recording identity'))
  assert.equal(task.client_contract, '.raas/BOOTSTRAP.md')
}

{
  const task = compileTask('Correct duplicate release metadata and the track list for one Ramzat album without guessing missing facts.')
  assert.equal(task.needs_split, false)
  assert.ok(routeIds(task).includes('catalogue'))
  assert.ok(task.truth_sources.includes('data/catalogue/index.json'))
  assert.ok(task.non_goals.some((item) => item.includes('Do not invent catalogue')))
}

{
  const task = compileTask('Make the Explore mobile layout cleaner and improve the search controls without changing playback.')
  assert.equal(task.needs_split, false)
  assert.ok(routeIds(task).includes('explore'))
  assert.ok(routeIds(task).includes('visual-ui'))
  assert.ok(task.validation.some((item) => item.includes('browser/manual verification')))
}

{
  const task = compileTask('Improve the SEO title, meta description and public copy for the Explore page.')
  assert.equal(task.needs_split, false)
  assert.ok(routeIds(task).includes('content-seo'))
  assert.equal(task.language_context, '.raas/LANGUAGE.md')
  assert.ok(task.truth_sources.includes('.raas/LANGUAGE.md'))
}

{
  const task = compileTask('Fix all issues across the player, catalogue, PWA, SEO and deployment and make everything perfect.')
  assert.equal(task.needs_split, true)
  assert.ok(task.split_reasons.length > 0)
  assert.ok(routeIds(task).length >= 3)
  assert.match(task.scope, /child implementation issues/i)
}

{
  const task = compileTask('Document the repository contribution workflow for one bounded internal issue.')
  assert.equal(task.needs_split, false)
  assert.equal(task.client_contract, '.raas/BOOTSTRAP.md')
  assert.ok(task.truth_sources.includes('AGENTS.md'))
  assert.ok(task.completion.some((item) => item.includes('claim is released')))
}

{
  const task = runJsonCli([
    '--text',
    'Add a concise description to the Ochhav release.'
  ])
  assert.equal(task.tier, 'fast')
  assert.equal(task.mode, 'metadata-content-change')
  assert.equal(task.delivery_stop, 'local-change')
  assert.equal(task.mutation_allowed, true)
  assert.ok(Array.isArray(task.verification_frontier))
  assert.equal(task.base_task.input, 'Add a concise description to the Ochhav release.')
}

{
  const task = runJsonCli([
    '--base',
    '--text',
    'Add a concise description to the Ochhav release.'
  ])
  assert.equal(task.input, 'Add a concise description to the Ochhav release.')
  assert.ok(Array.isArray(task.routes))
  assert.equal('tier' in task, false)
  assert.equal('delivery_stop' in task, false)
  assert.equal('verification_frontier' in task, false)
}

{
  const task = runJsonCli([
    '--text',
    'Create a plan for improving the player controls, but do not implement it.'
  ])
  assert.equal(task.mode, 'plan')
  assert.equal(task.delivery_stop, 'plan')
  assert.equal(task.mutation_allowed, false)
}

{
  const task = runJsonCli([
    '--text',
    'Fix everything across the player, Explore, PWA and catalogue.'
  ])
  assert.equal(task.needs_split, true)
  assert.equal(task.mutation_allowed, true)
  assert.ok(task.stop_conditions.some((item) => /split/i.test(item)))
  assert.equal(task.base_task.needs_split, true)
}

{
  const task = runJsonCli([], 'Add a concise description to the Ochhav release.')
  assert.equal(task.tier, 'fast')
  assert.equal(task.mode, 'metadata-content-change')
}

{
  const help = runCli(['--help'])
  assert.match(help, /adaptive CTO compiler by default/i)
  assert.match(help, /--base/)
}

console.log('RAAS task compiler tests passed')
