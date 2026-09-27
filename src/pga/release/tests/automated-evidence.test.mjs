import test from 'node:test'
import assert from 'node:assert/strict'

import { acceptanceItem, acceptanceMatrix } from '../acceptance.js'
import {
  AUTOMATED_EVIDENCE_SCHEMA_VERSION,
  automatedEvidenceSuites,
  compileAutomatedEvidence,
} from '../automated-evidence.js'

const REVISION = 'a'.repeat(40)
const NOW = Date.parse('2026-09-10T16:50:00.000Z')
const OBSERVED_AT = new Date(NOW - 1_000).toISOString()
const ENVIRONMENT = 'github-actions-local-fixture'

function receipt(outcome = 'passed', overrides = {}) {
  return {
    outcome,
    observedAt: OBSERVED_AT,
    environment: ENVIRONMENT,
    sourceUrl: 'https://github.com/ruddvz/garba/actions/runs/123?secret=strip-me#job',
    sourceId: 'github-run-123',
    ...overrides,
  }
}

function result(suiteResults, overrides = {}) {
  return compileAutomatedEvidence({
    suiteResults,
    targetRevision: REVISION,
    targetEnvironment: ENVIRONMENT,
    nowMs: NOW,
    ...overrides,
  })
}

function entry(output, id) {
  const found = output.ledger.entries.find((item) => item.id === id)
  assert.ok(found, `missing ledger item ${id}`)
  return found
}

const EXPECTED_MAPPING = {
  'pga-security': [
    'quality.no-admin-secret-public',
    'quality.no-public-indexing',
  ],
  'pga-data-truth': [
    'quality.no-fake-zero',
  ],
  'pga-shell-browser': [
    'env.desktop-chrome',
    'env.narrow-phone',
    'env.keyboard-only',
    'env.reduced-motion',
    'env.increased-forced-contrast',
    'env.auth-expired-denied',
    'env.telemetry-backend-unavailable',
    'journey.recover-network-backend-failure',
    'journey.expire-access-safely',
    'quality.primary-actions-visible',
    'quality.no-horizontal-overflow',
  ],
  'pga-analytics-browser': [
    'env.short-landscape-phone',
    'journey.switch-ranges-views',
    'journey.inspect-audience',
    'journey.inspect-listening',
    'quality.no-critical-console-error',
  ],
  'pga-release-browser-evidence': [
    'env.partial-stale-analytics',
    'journey.inspect-health',
  ],
}

const AUTOMATED_ITEM_COUNT = Object.values(EXPECTED_MAPPING).reduce((sum, itemIds) => sum + itemIds.length, 0)

test('suite mapping is exact, non-overlapping and accepted by the canonical evidence methods', () => {
  const suites = automatedEvidenceSuites()
  assert.equal(suites.length, 5)
  const seen = new Set()

  for (const suite of suites) {
    assert.deepEqual(suite.itemIds, EXPECTED_MAPPING[suite.id])
    assert.ok(['repository_validation', 'browser_automation'].includes(suite.method))
    assert.ok(suite.commands.length > 0)
    for (const itemId of suite.itemIds) {
      assert.equal(seen.has(itemId), false, `${itemId} must have one automated owner`)
      seen.add(itemId)
      assert.ok(acceptanceItem(itemId).allowedMethods.includes(suite.method), `${itemId} rejects ${suite.method}`)
    }
  }

  assert.equal(seen.size, 21)
  assert.equal(AUTOMATED_ITEM_COUNT, 21)
})

test('all passing automated suites verify exactly twenty-one items and keep the release incomplete', () => {
  const suites = Object.fromEntries(automatedEvidenceSuites().map((suite) => [suite.id, receipt()]))
  const output = result(suites)

  assert.equal(output.schemaVersion, AUTOMATED_EVIDENCE_SCHEMA_VERSION)
  assert.equal(output.ledger.schemaVersion, 'pga-release-acceptance/v1')
  assert.equal(output.ledger.status, 'incomplete')
  assert.equal(output.ledger.counts.verified, 21)
  assert.equal(output.ledger.counts.failed, 0)
  assert.equal(output.ledger.counts.blocked, 0)
  assert.equal(output.ledger.counts.not_inspected, acceptanceMatrix().length - 21)
  assert.equal(output.executedSuites.length, 5)
  assert.equal(output.ignoredReceiptCount, 0)

  for (const suite of automatedEvidenceSuites()) {
    for (const itemId of suite.itemIds) {
      const verified = entry(output, itemId)
      assert.equal(verified.state, 'verified')
      assert.equal(verified.evidence.method, suite.method)
      assert.equal(verified.evidence.revision, REVISION)
      assert.equal(verified.evidence.environment, ENVIRONMENT)
      assert.equal(verified.evidence.sourceUrl, 'https://github.com/ruddvz/garba/actions/runs/123')
      assert.match(verified.evidence.sourceId, new RegExp(`${suite.id}$`))
    }
  }
})

test('stronger evidence classes and unexercised browser states stay not inspected', () => {
  const suites = Object.fromEntries(automatedEvidenceSuites().map((suite) => [suite.id, receipt()]))
  const output = result(suites)
  const forbiddenAutomatedClaims = [
    'env.iphone-safari-browser',
    'env.iphone-installed-pwa',
    'env.android-chrome-browser',
    'env.android-installed-pwa',
    'env.ipad-portrait',
    'env.ipad-landscape',
    'env.desktop-safari',
    'env.screen-reader-spot-check',
    'env.zoom-200',
    'env.offline-flaky-network',
    'env.cold-start-warm-return',
    'journey.authenticate-enter-pga',
    'journey.install-relaunch-pga',
    'public.player-cold-start',
    'public.pwa-install-update-offline',
    'quality.safe-area',
    'quality.no-excessive-motion',
    'quality.protected-production-build',
  ]

  for (const itemId of forbiddenAutomatedClaims) {
    assert.equal(entry(output, itemId).state, 'not_inspected', `${itemId} must not be fabricated by CI`)
  }
})

test('focused release browser suite owns only partial/stale analytics and Health', () => {
  const passed = result({ 'pga-release-browser-evidence': receipt('passed') })
  assert.equal(passed.ledger.counts.verified, 2)
  assert.equal(passed.ledger.counts.failed, 0)
  assert.equal(entry(passed, 'env.partial-stale-analytics').state, 'verified')
  assert.equal(entry(passed, 'journey.inspect-health').state, 'verified')
  assert.equal(entry(passed, 'env.offline-flaky-network').state, 'not_inspected')
  assert.equal(entry(passed, 'journey.inspect-audience').state, 'not_inspected')

  const failed = result({ 'pga-release-browser-evidence': receipt('failed') })
  assert.equal(failed.ledger.counts.verified, 0)
  assert.equal(failed.ledger.counts.failed, 2)
  assert.equal(entry(failed, 'env.partial-stale-analytics').state, 'failed')
  assert.equal(entry(failed, 'journey.inspect-health').state, 'failed')
  assert.equal(entry(failed, 'quality.no-critical-console-error').state, 'not_inspected')

  const malformed = result({ 'pga-release-browser-evidence': { outcome: 'maybe' } })
  assert.equal(malformed.ignoredReceiptCount, 1)
  assert.equal(entry(malformed, 'env.partial-stale-analytics').state, 'not_inspected')
  assert.equal(entry(malformed, 'journey.inspect-health').state, 'not_inspected')
})

test('a failed shell suite fails only its browser-owned items', () => {
  const output = result({
    'pga-security': receipt('passed'),
    'pga-data-truth': receipt('passed'),
    'pga-shell-browser': receipt('failed'),
    'pga-analytics-browser': receipt('passed'),
    'pga-release-browser-evidence': receipt('passed'),
  })

  assert.equal(output.ledger.status, 'failed')
  assert.equal(output.ledger.counts.verified, 10)
  assert.equal(output.ledger.counts.failed, 11)
  assert.equal(output.ledger.counts.not_inspected, acceptanceMatrix().length - 21)

  for (const itemId of EXPECTED_MAPPING['pga-shell-browser']) {
    assert.equal(entry(output, itemId).state, 'failed')
  }
  assert.equal(entry(output, 'env.offline-flaky-network').state, 'not_inspected')
  assert.equal(entry(output, 'quality.no-public-indexing').state, 'verified')
  assert.equal(entry(output, 'journey.inspect-listening').state, 'verified')
  assert.equal(entry(output, 'journey.inspect-health').state, 'verified')
  assert.equal(entry(output, 'env.iphone-safari-browser').state, 'not_inspected')
})

test('an omitted suite produces no attempt and remains not inspected', () => {
  const output = result({
    'pga-security': receipt(),
    'pga-data-truth': receipt(),
    'pga-shell-browser': receipt(),
    'pga-release-browser-evidence': receipt(),
  })

  assert.equal(output.ledger.counts.verified, 16)
  for (const itemId of EXPECTED_MAPPING['pga-analytics-browser']) {
    assert.equal(entry(output, itemId).state, 'not_inspected')
  }
})

test('unknown and malformed suite receipts are ignored rather than trusted', () => {
  const output = result({
    'pga-security': { outcome: true, arbitraryItemId: 'env.iphone-installed-pwa', secret: 'DO_NOT_ECHO' },
    'pga-data-truth': receipt(),
    'totally-unknown-suite': receipt('passed', { arbitraryItemId: 'quality.protected-production-build' }),
  })
  const serialized = JSON.stringify(output)

  assert.equal(output.ignoredReceiptCount, 2)
  assert.deepEqual(output.executedSuites, [{ id: 'pga-data-truth', outcome: 'passed' }])
  assert.equal(entry(output, 'quality.no-fake-zero').state, 'verified')
  assert.equal(entry(output, 'quality.no-admin-secret-public').state, 'not_inspected')
  assert.equal(entry(output, 'env.iphone-installed-pwa').state, 'not_inspected')
  assert.equal(entry(output, 'quality.protected-production-build').state, 'not_inspected')
  assert.doesNotMatch(serialized, /DO_NOT_ECHO|arbitraryItemId|totally-unknown-suite/)
})

test('canonical ledger rejects missing evidence time or environment instead of upgrading it', () => {
  const noTime = result({ 'pga-security': receipt('passed', { observedAt: null }) })
  assert.equal(entry(noTime, 'quality.no-public-indexing').state, 'not_inspected')
  assert.equal(entry(noTime, 'quality.no-public-indexing').reason, 'evidence_time_required')

  const noEnvironment = compileAutomatedEvidence({
    suiteResults: { 'pga-security': receipt('passed', { environment: null }) },
    targetRevision: REVISION,
    targetEnvironment: null,
    nowMs: NOW,
  })
  assert.equal(entry(noEnvironment, 'quality.no-public-indexing').state, 'not_inspected')
  assert.equal(entry(noEnvironment, 'quality.no-public-indexing').reason, 'environment_required')
})

test('invalid target revision cannot become verified evidence', () => {
  const output = result({ 'pga-security': receipt() }, { targetRevision: 'not-a-sha' })
  assert.equal(output.targetRevision, null)
  assert.equal(entry(output, 'quality.no-public-indexing').state, 'not_inspected')
  assert.equal(entry(output, 'quality.no-public-indexing').reason, 'target_revision_required')
})

test('suite definitions returned to callers are copies', () => {
  const first = automatedEvidenceSuites()
  first[0].itemIds.push('env.iphone-installed-pwa')
  first[0].commands[0].push('--invented')
  const second = automatedEvidenceSuites()

  assert.deepEqual(second[0].itemIds, EXPECTED_MAPPING['pga-security'])
  assert.deepEqual(second[0].commands[0], ['scripts/lib/validate-pga-security.mjs'])
})
