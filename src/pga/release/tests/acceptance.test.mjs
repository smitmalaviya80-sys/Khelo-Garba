import test from 'node:test'
import assert from 'node:assert/strict'

import {
  ACCEPTANCE_STATES,
  EVIDENCE_METHODS,
  acceptanceItem,
  acceptanceMatrix,
  createAcceptanceLedger,
} from '../acceptance.js'

const NOW = Date.parse('2026-09-10T04:30:00.000Z')
const SHA = 'b'.repeat(40)
const OTHER_SHA = 'c'.repeat(40)
const HOUR = 60 * 60 * 1000

function evidence(method, overrides = {}) {
  return {
    method,
    observedAt: NOW - 1_000,
    revision: SHA,
    environment: 'release-fixture',
    sourceId: 'fixture-evidence-1',
    ...overrides,
  }
}

function verifiedAttempt(id) {
  const matrixItem = acceptanceItem(id)
  return {
    state: 'verified',
    evidence: evidence(matrixItem.allowedMethods[0], { sourceId: `evidence-${id}` }),
  }
}

function entry(ledger, id) {
  return ledger.entries.find((value) => value.id === id)
}

test('canonical matrix exactly covers the four #846 acceptance groups without duplicate IDs', () => {
  const matrix = acceptanceMatrix()
  const counts = matrix.reduce((result, current) => {
    result[current.category] = (result[current.category] || 0) + 1
    return result
  }, {})

  assert.equal(matrix.length, 46)
  assert.deepEqual(counts, {
    environment: 20,
    journey: 9,
    public_regression: 7,
    quality: 10,
  })
  assert.equal(new Set(matrix.map((item) => item.id)).size, matrix.length)
  assert.equal(matrix.every((item) => item.required === true), true)
})

test('item states and evidence methods stay on the stable public contract', () => {
  assert.deepEqual(ACCEPTANCE_STATES, ['verified', 'failed', 'blocked', 'not_inspected'])
  assert.deepEqual(EVIDENCE_METHODS, [
    'browser_automation',
    'physical_device',
    'assistive_technology',
    'manual_interaction',
    'production_probe',
    'performance_measurement',
    'repository_validation',
    'reviewed_external_evidence',
  ])
})

test('a new ledger starts with every release item not inspected', () => {
  const ledger = createAcceptanceLedger({}, { nowMs: NOW, targetRevision: SHA })

  assert.equal(ledger.status, 'incomplete')
  assert.equal(ledger.counts.not_inspected, 46)
  assert.equal(ledger.counts.verified, 0)
  assert.equal(ledger.counts.failed, 0)
  assert.equal(ledger.counts.blocked, 0)
})

test('physical iPhone and installed-PWA checks reject desktop browser automation evidence', () => {
  const ledger = createAcceptanceLedger({
    'env.iphone-safari-browser': {
      state: 'verified',
      evidence: evidence('browser_automation'),
    },
    'env.iphone-installed-pwa': {
      state: 'verified',
      evidence: evidence('browser_automation'),
    },
  }, { nowMs: NOW, targetRevision: SHA })

  assert.equal(entry(ledger, 'env.iphone-safari-browser').state, 'not_inspected')
  assert.equal(entry(ledger, 'env.iphone-safari-browser').reason, 'incompatible_evidence_method')
  assert.equal(entry(ledger, 'env.iphone-installed-pwa').state, 'not_inspected')
})

test('physical device interaction can verify an iPhone release item on the exact revision', () => {
  const ledger = createAcceptanceLedger({
    'env.iphone-safari-browser': {
      state: 'verified',
      evidence: evidence('physical_device', {
        environment: 'iPhone 14 Pro · iOS 26.6 · Safari',
        sourceId: 'manual-run-17',
      }),
    },
  }, { nowMs: NOW, targetRevision: SHA })

  const result = entry(ledger, 'env.iphone-safari-browser')
  assert.equal(result.state, 'verified')
  assert.equal(result.evidence.revision, SHA)
  assert.equal(result.evidence.environment, 'iPhone 14 Pro · iOS 26.6 · Safari')
})

test('screen-reader spot check rejects a static repository scan and requires assistive-technology evidence', () => {
  const rejected = createAcceptanceLedger({
    'env.screen-reader-spot-check': {
      state: 'verified',
      evidence: evidence('repository_validation'),
    },
  }, { nowMs: NOW, targetRevision: SHA })
  const accepted = createAcceptanceLedger({
    'env.screen-reader-spot-check': {
      state: 'verified',
      evidence: evidence('assistive_technology', { environment: 'VoiceOver · Safari · macOS' }),
    },
  }, { nowMs: NOW, targetRevision: SHA })

  assert.equal(entry(rejected, 'env.screen-reader-spot-check').state, 'not_inspected')
  assert.equal(entry(accepted, 'env.screen-reader-spot-check').state, 'verified')
})

test('protected production build cannot be verified from source code or compilation alone', () => {
  const rejected = createAcceptanceLedger({
    'quality.protected-production-build': {
      state: 'verified',
      evidence: evidence('repository_validation'),
    },
  }, { nowMs: NOW, targetRevision: SHA })
  const accepted = createAcceptanceLedger({
    'quality.protected-production-build': {
      state: 'verified',
      evidence: evidence('production_probe', {
        environment: 'pga.playgarba.com production',
        sourceUrl: 'https://pga.playgarba.com/health',
        sourceId: null,
      }),
    },
  }, { nowMs: NOW, targetRevision: SHA })

  assert.equal(entry(rejected, 'quality.protected-production-build').state, 'not_inspected')
  assert.equal(entry(accepted, 'quality.protected-production-build').state, 'verified')
})

test('explicit dependency blocker makes the ledger blocked without pretending it failed or passed', () => {
  const ledger = createAcceptanceLedger({
    'journey.inspect-audience': {
      state: 'blocked',
      blocker: { code: 'dependency_active', issue: 843, detail: 'Audience implementation is still active.' },
    },
  }, { nowMs: NOW, targetRevision: SHA })

  assert.equal(entry(ledger, 'journey.inspect-audience').state, 'blocked')
  assert.equal(entry(ledger, 'journey.inspect-audience').blocker.issue, 843)
  assert.equal(ledger.status, 'blocked')
  assert.equal(ledger.counts.failed, 0)
})

test('a required failed item takes precedence over blockers', () => {
  const ledger = createAcceptanceLedger({
    'journey.inspect-audience': {
      state: 'blocked',
      blocker: { issue: 843, code: 'dependency_active' },
    },
    'quality.no-critical-console-error': {
      state: 'failed',
      evidence: evidence('browser_automation', { sourceId: 'console-smoke-3' }),
    },
  }, { nowMs: NOW, targetRevision: SHA })

  assert.equal(ledger.status, 'failed')
  assert.equal(ledger.counts.failed, 1)
  assert.equal(ledger.counts.blocked, 1)
})

test('all required items must have compatible exact-revision evidence before status becomes ready', () => {
  const attempts = Object.fromEntries(acceptanceMatrix().map((matrixItem) => [
    matrixItem.id,
    verifiedAttempt(matrixItem.id),
  ]))

  const ledger = createAcceptanceLedger(attempts, {
    nowMs: NOW,
    targetRevision: SHA,
    targetEnvironment: 'PGA v1 release candidate',
  })

  assert.equal(ledger.status, 'ready')
  assert.equal(ledger.counts.verified, 46)
  assert.equal(ledger.counts.not_inspected, 0)
  assert.equal(ledger.targetEnvironment, 'PGA v1 release candidate')
})

test('stale positive evidence cannot remain verified when its own freshness budget expires', () => {
  const ledger = createAcceptanceLedger({
    'quality.protected-production-build': {
      state: 'verified',
      evidence: evidence('production_probe', {
        observedAt: NOW - 2 * HOUR,
        freshnessBudgetMs: HOUR,
        sourceUrl: 'https://pga.playgarba.com/health',
      }),
    },
  }, { nowMs: NOW, targetRevision: SHA })

  const result = entry(ledger, 'quality.protected-production-build')
  assert.equal(result.state, 'not_inspected')
  assert.equal(result.reason, 'stale_evidence')
  assert.equal(result.evidence.freshnessBudgetMs, HOUR)
})

test('known exact-revision failure remains failed even when old, and is marked stale for review', () => {
  const ledger = createAcceptanceLedger({
    'quality.no-critical-console-error': {
      state: 'failed',
      evidence: evidence('browser_automation', {
        observedAt: NOW - 2 * HOUR,
        freshnessBudgetMs: HOUR,
      }),
    },
  }, { nowMs: NOW, targetRevision: SHA })

  const result = entry(ledger, 'quality.no-critical-console-error')
  assert.equal(result.state, 'failed')
  assert.equal(result.stale, true)
  assert.equal(ledger.status, 'failed')
})

test('evidence for a different revision cannot verify or fail the current release candidate', () => {
  const ledger = createAcceptanceLedger({
    'env.desktop-chrome': {
      state: 'verified',
      evidence: evidence('browser_automation', { revision: OTHER_SHA }),
    },
    'public.nonstop': {
      state: 'failed',
      evidence: evidence('browser_automation', { revision: OTHER_SHA }),
    },
  }, { nowMs: NOW, targetRevision: SHA })

  assert.equal(entry(ledger, 'env.desktop-chrome').state, 'not_inspected')
  assert.equal(entry(ledger, 'env.desktop-chrome').reason, 'revision_mismatch')
  assert.equal(entry(ledger, 'public.nonstop').state, 'not_inspected')
  assert.equal(ledger.counts.failed, 0)
})

test('verified and failed attempts require exact environment, time and source evidence', () => {
  const ledger = createAcceptanceLedger({
    'env.desktop-chrome': {
      state: 'verified',
      evidence: evidence('browser_automation', { environment: '' }),
    },
    'public.explore-search': {
      state: 'failed',
      evidence: evidence('browser_automation', { observedAt: null }),
    },
    'quality.no-fake-zero': {
      state: 'verified',
      evidence: evidence('repository_validation', { sourceId: null, sourceUrl: null }),
    },
  }, { nowMs: NOW, targetRevision: SHA })

  assert.equal(entry(ledger, 'env.desktop-chrome').reason, 'environment_required')
  assert.equal(entry(ledger, 'public.explore-search').reason, 'evidence_time_required')
  assert.equal(entry(ledger, 'quality.no-fake-zero').reason, 'evidence_source_required')
})

test('source URL evidence strips credentials, query strings and fragments before retention', () => {
  const withQuery = createAcceptanceLedger({
    'quality.protected-production-build': {
      state: 'verified',
      evidence: evidence('production_probe', {
        sourceId: null,
        sourceUrl: 'https://pga.playgarba.com/health?token=DO_NOT_KEEP#private',
      }),
    },
  }, { nowMs: NOW, targetRevision: SHA })
  const withCredentials = createAcceptanceLedger({
    'quality.protected-production-build': {
      state: 'verified',
      evidence: evidence('production_probe', {
        sourceId: null,
        sourceUrl: 'https://user:password@pga.playgarba.com/health',
      }),
    },
  }, { nowMs: NOW, targetRevision: SHA })

  assert.equal(entry(withQuery, 'quality.protected-production-build').state, 'verified')
  assert.equal(entry(withQuery, 'quality.protected-production-build').evidence.sourceUrl, 'https://pga.playgarba.com/health')
  assert.equal(JSON.stringify(withQuery).includes('DO_NOT_KEEP'), false)
  assert.equal(entry(withCredentials, 'quality.protected-production-build').state, 'not_inspected')
  assert.equal(entry(withCredentials, 'quality.protected-production-build').reason, 'evidence_source_required')
})

test('arbitrary attempt payload fields are not echoed into the release record', () => {
  const ledger = createAcceptanceLedger({
    'env.desktop-chrome': {
      state: 'verified',
      rawListenerTelemetry: 'DO_NOT_ECHO_LISTENER',
      accessAssertion: 'DO_NOT_ECHO_ACCESS',
      evidence: {
        ...evidence('browser_automation'),
        rawResponse: 'DO_NOT_ECHO_RESPONSE',
      },
    },
    'unknown.future-item': {
      state: 'verified',
      secret: 'DO_NOT_ECHO_UNKNOWN',
    },
  }, { nowMs: NOW, targetRevision: SHA })

  const serialized = JSON.stringify(ledger)
  assert.equal(serialized.includes('DO_NOT_ECHO_LISTENER'), false)
  assert.equal(serialized.includes('DO_NOT_ECHO_ACCESS'), false)
  assert.equal(serialized.includes('DO_NOT_ECHO_RESPONSE'), false)
  assert.equal(serialized.includes('DO_NOT_ECHO_UNKNOWN'), false)
  assert.deepEqual(ledger.unknownItemIds, ['unknown.future-item'])
})

test('invalid state, missing target revision and implausibly future evidence never become verified', () => {
  const invalidState = createAcceptanceLedger({
    'env.desktop-chrome': { state: 'passed', evidence: evidence('browser_automation') },
  }, { nowMs: NOW, targetRevision: SHA })
  const missingRevision = createAcceptanceLedger({
    'env.desktop-chrome': { state: 'verified', evidence: evidence('browser_automation') },
  }, { nowMs: NOW })
  const future = createAcceptanceLedger({
    'env.desktop-chrome': {
      state: 'verified',
      evidence: evidence('browser_automation', { observedAt: NOW + 10 * 60 * 1000 }),
    },
  }, { nowMs: NOW, targetRevision: SHA })

  assert.equal(entry(invalidState, 'env.desktop-chrome').reason, 'invalid_state')
  assert.equal(entry(missingRevision, 'env.desktop-chrome').reason, 'target_revision_required')
  assert.equal(entry(future, 'env.desktop-chrome').reason, 'future_evidence_time')
})

test('invalid evaluation time is rejected instead of producing an invalid acceptance timestamp', () => {
  assert.throws(() => createAcceptanceLedger({}, { nowMs: Number.NaN, targetRevision: SHA }), /invalid_acceptance_time/)
})

test('evaluation clock accepts numeric zero and rejects explicit coercible or non-finite values', () => {
  const zeroClock = createAcceptanceLedger({}, { nowMs: 0, targetRevision: SHA })
  assert.equal(zeroClock.evaluatedAt, '1970-01-01T00:00:00.000Z')

  for (const invalid of [null, '0', '', true, false, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
    assert.throws(
      () => createAcceptanceLedger({}, { nowMs: invalid, targetRevision: SHA }),
      /invalid_acceptance_time/,
    )
  }
})

test('freshness budgets accept numeric zero and reject coercible, non-finite or negative values for verified and failed evidence', () => {
  const zeroBudget = createAcceptanceLedger({
    'quality.protected-production-build': {
      state: 'verified',
      evidence: evidence('production_probe', {
        observedAt: NOW,
        freshnessBudgetMs: 0,
        sourceUrl: 'https://pga.playgarba.com/health',
      }),
    },
  }, { nowMs: NOW, targetRevision: SHA })

  const accepted = entry(zeroBudget, 'quality.protected-production-build')
  assert.equal(accepted.state, 'verified')
  assert.equal(accepted.evidence.freshnessBudgetMs, 0)

  const invalidBudgets = [
    null,
    '3600000',
    '',
    true,
    false,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    Number.NEGATIVE_INFINITY,
    -1,
  ]

  for (const freshnessBudgetMs of invalidBudgets) {
    for (const state of ['verified', 'failed']) {
      const ledger = createAcceptanceLedger({
        'quality.no-critical-console-error': {
          state,
          evidence: evidence('browser_automation', { freshnessBudgetMs }),
        },
      }, { nowMs: NOW, targetRevision: SHA })

      const result = entry(ledger, 'quality.no-critical-console-error')
      assert.equal(result.state, 'not_inspected')
      assert.equal(result.reason, 'invalid_freshness_budget')
    }
  }
})

test('blocker issue identity accepts only positive integer numbers without coercion', () => {
  for (const issue of ['843', true, false, null, 0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
    const ledger = createAcceptanceLedger({
      'journey.inspect-audience': {
        state: 'blocked',
        blocker: { issue },
      },
    }, { nowMs: NOW, targetRevision: SHA })

    const result = entry(ledger, 'journey.inspect-audience')
    assert.equal(result.state, 'not_inspected')
    assert.equal(result.reason, 'blocker_evidence_required')
  }

  const withCode = createAcceptanceLedger({
    'journey.inspect-audience': {
      state: 'blocked',
      blocker: { issue: '843', code: 'dependency_active' },
    },
  }, { nowMs: NOW, targetRevision: SHA })
  assert.equal(entry(withCode, 'journey.inspect-audience').state, 'blocked')
  assert.equal(entry(withCode, 'journey.inspect-audience').blocker.issue, null)
  assert.equal(entry(withCode, 'journey.inspect-audience').blocker.code, 'dependency_active')

  const validIssue = createAcceptanceLedger({
    'journey.inspect-audience': {
      state: 'blocked',
      blocker: { issue: 843 },
    },
  }, { nowMs: NOW, targetRevision: SHA })
  assert.equal(entry(validIssue, 'journey.inspect-audience').state, 'blocked')
  assert.equal(entry(validIssue, 'journey.inspect-audience').blocker.issue, 843)
})
