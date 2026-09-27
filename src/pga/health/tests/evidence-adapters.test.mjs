import assert from 'node:assert/strict'
import test from 'node:test'

import {
  deploymentBuildEvidence,
  productionProbeEvidence,
  requiredChecksEvidence,
} from '../evidence-adapters.js'

const NOW = '2026-09-09T22:00:00Z'
const SHA_A = 'a'.repeat(40)
const SHA_B = 'b'.repeat(40)

function buildInfo(overrides = {}) {
  return {
    schemaVersion: 1,
    generatedAt: '2026-09-09T21:59:30Z',
    build: {
      revision: SHA_A,
      workflowRunId: '12345',
      ...(overrides.build || {}),
    },
    deployment: {
      origin: 'https://playgarba.com',
      ...(overrides.deployment || {}),
    },
    catalogue: {
      version: '2026-09-09',
      activeSongs: 1673,
      ordinaryListeningSongs: 1600,
      ...(overrides.catalogue || {}),
    },
    playback: {
      youtubePlayable: 900,
      migrationBacklog: 773,
      ...(overrides.playback || {}),
    },
    ...overrides.root,
  }
}

function run({
  id,
  name,
  status = 'completed',
  conclusion = 'success',
  completedAt = '2026-09-09T21:59:00Z',
} = {}) {
  return {
    id,
    name,
    status,
    conclusion,
    completed_at: completedAt,
    details_url: `https://github.com/ruddvz/garba/actions/runs/${id}`,
  }
}

test('production probe distinguishes success, failure and absent evidence', () => {
  const healthy = productionProbeEvidence({
    completed: true,
    ok: true,
    statusCode: 200,
    checkedAt: NOW,
  })
  assert.equal(healthy.status, 'healthy')
  assert.equal(healthy.details.statusCode, 200)

  const failed = productionProbeEvidence({
    completed: true,
    ok: false,
    statusCode: 503,
    checkedAt: NOW,
  })
  assert.equal(failed.status, 'failed')
  assert.match(failed.reason, /503/)

  const unknown = productionProbeEvidence({ checkedAt: NOW })
  assert.equal(unknown.status, 'unknown')
  assert.equal(Object.hasOwn(unknown.details, 'statusCode'), false)
})

test('production probe accepts only explicit integer HTTP status evidence', () => {
  for (const statusCode of [undefined, null]) {
    const evidence = productionProbeEvidence({
      completed: true,
      ok: true,
      statusCode,
      checkedAt: NOW,
    })
    assert.equal(evidence.status, 'healthy')
    assert.equal(Object.hasOwn(evidence.details, 'statusCode'), false)
    assert.equal(evidence.source.id, null)
  }

  for (const [statusCode, expectedStatus] of [
    [100, 'failed'],
    [200, 'healthy'],
    [302, 'healthy'],
    [503, 'failed'],
    [599, 'failed'],
  ]) {
    const evidence = productionProbeEvidence({
      completed: true,
      ok: true,
      statusCode,
      checkedAt: NOW,
    })
    assert.equal(evidence.status, expectedStatus, `unexpected status for HTTP ${statusCode}`)
    assert.equal(evidence.details.statusCode, statusCode)
    assert.equal(evidence.source.id, `http-${statusCode}`)
  }

  for (const statusCode of [
    '200',
    '',
    false,
    true,
    200.5,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    Number.NEGATIVE_INFINITY,
    -1,
    0,
    99,
    600,
    700,
  ]) {
    const evidence = productionProbeEvidence({
      completed: true,
      ok: true,
      statusCode,
      checkedAt: NOW,
    })
    assert.equal(evidence.status, 'unknown', `malformed ${String(statusCode)} must not become healthy`)
    assert.equal(Object.hasOwn(evidence.details, 'statusCode'), false)
    assert.equal(evidence.source.id, null)
    assert.match(evidence.reason, /integer from 100 to 599/)
  }
})

test('matching deployment build evidence preserves supplied diagnostic details', () => {
  const evidence = deploymentBuildEvidence({
    buildInfo: buildInfo(),
    expectedRevision: SHA_A.toUpperCase(),
    checkedAt: NOW,
  })

  assert.equal(evidence.status, 'healthy')
  assert.equal(evidence.details.expectedBuildId, SHA_A)
  assert.equal(evidence.details.deployedBuildId, SHA_A)
  assert.equal(evidence.details.catalogueVersion, '2026-09-09')
  assert.equal(evidence.details.activeSongs, 1673)
  assert.equal(evidence.details.youtubePlayable, 900)
})

test('deployment mismatch remains degraded and actionable', () => {
  const evidence = deploymentBuildEvidence({
    buildInfo: buildInfo(),
    expectedRevision: SHA_B,
    checkedAt: NOW,
  })
  assert.equal(evidence.status, 'degraded')
  assert.match(evidence.reason, /Expected/)
  assert.match(evidence.action, /deployment/i)
})

test('malformed and off-origin build diagnostics fail closed as unknown', () => {
  const malformed = deploymentBuildEvidence({
    buildInfo: 'not-an-object',
    expectedRevision: SHA_A,
    checkedAt: NOW,
  })
  assert.equal(malformed.status, 'unknown')
  assert.match(malformed.reason, /not supplied as an object/i)

  const offOrigin = deploymentBuildEvidence({
    buildInfo: buildInfo({ deployment: { origin: 'https://example.com' } }),
    expectedRevision: SHA_A,
    checkedAt: NOW,
  })
  assert.equal(offOrigin.status, 'unknown')
  assert.match(offOrigin.reason, /playgarba\.com/i)
})

test('deployment evidence never invents absent optional numeric details', () => {
  const info = buildInfo()
  delete info.catalogue.activeSongs
  delete info.catalogue.ordinaryListeningSongs
  delete info.playback.youtubePlayable
  delete info.playback.migrationBacklog

  const evidence = deploymentBuildEvidence({
    buildInfo: info,
    expectedRevision: SHA_A,
    checkedAt: NOW,
  })

  assert.equal(Object.hasOwn(evidence.details, 'activeSongs'), false)
  assert.equal(Object.hasOwn(evidence.details, 'ordinaryListeningSongs'), false)
  assert.equal(Object.hasOwn(evidence.details, 'youtubePlayable'), false)
  assert.equal(Object.hasOwn(evidence.details, 'migrationBacklog'), false)
})

test('required CI checks are healthy only when every required check passes', () => {
  const payload = {
    check_runs: [
      run({ id: 1, name: 'Validate GARBA' }),
      run({ id: 2, name: 'Agent claim guard' }),
    ],
  }
  const evidence = requiredChecksEvidence({
    checkRunsPayload: payload,
    requiredChecks: ['Validate GARBA', 'Agent claim guard'],
    checkedAt: NOW,
    sourceUrl: 'https://github.com/ruddvz/garba/actions',
  })
  assert.equal(evidence.status, 'healthy')
  assert.equal(evidence.details.checks.length, 2)
  assert.ok(evidence.details.checks.every((check) => check.evidenceStatus === 'healthy'))
})

test('a completed required CI failure produces failed evidence', () => {
  const evidence = requiredChecksEvidence({
    checkRunsPayload: {
      check_runs: [
        run({ id: 3, name: 'Validate GARBA', conclusion: 'failure' }),
        run({ id: 4, name: 'Agent claim guard' }),
      ],
    },
    requiredChecks: ['Validate GARBA', 'Agent claim guard'],
    checkedAt: NOW,
  })
  assert.equal(evidence.status, 'failed')
  assert.match(evidence.reason, /Validate GARBA/)
})

test('pending, cancelled and missing required CI checks remain unknown', () => {
  for (const candidate of [
    run({ id: 5, name: 'Validate GARBA', status: 'in_progress', conclusion: null }),
    run({ id: 6, name: 'Validate GARBA', status: 'completed', conclusion: 'cancelled' }),
  ]) {
    const evidence = requiredChecksEvidence({
      checkRunsPayload: { check_runs: [candidate] },
      requiredChecks: ['Validate GARBA'],
      checkedAt: NOW,
    })
    assert.equal(evidence.status, 'unknown')
  }

  const missing = requiredChecksEvidence({
    checkRunsPayload: { check_runs: [] },
    requiredChecks: ['Validate GARBA'],
    checkedAt: NOW,
  })
  assert.equal(missing.status, 'unknown')
  assert.equal(missing.details.checks[0].status, 'missing')
})

test('duplicate check names select the newest applicable run deterministically', () => {
  const evidence = requiredChecksEvidence({
    checkRunsPayload: {
      check_runs: [
        run({
          id: 10,
          name: 'Validate GARBA',
          conclusion: 'failure',
          completedAt: '2026-09-09T21:30:00Z',
        }),
        run({
          id: 11,
          name: 'Validate GARBA',
          conclusion: 'success',
          completedAt: '2026-09-09T21:45:00Z',
        }),
      ],
    },
    requiredChecks: ['Validate GARBA'],
    checkedAt: NOW,
  })

  assert.equal(evidence.status, 'healthy')
  assert.equal(evidence.details.checks[0].id, 11)
  assert.equal(evidence.details.checks[0].conclusion, 'success')
})

test('equal-timestamp duplicate checks use only real numeric run IDs as identity', () => {
  const completedAt = '2026-09-09T21:45:00Z'
  const evidence = requiredChecksEvidence({
    checkRunsPayload: {
      check_runs: [
        run({ id: 11, name: 'Validate GARBA', conclusion: 'failure', completedAt }),
        run({ id: 12, name: 'Validate GARBA', conclusion: 'success', completedAt }),
      ],
    },
    requiredChecks: ['Validate GARBA'],
    checkedAt: NOW,
  })

  assert.equal(evidence.status, 'healthy')
  assert.equal(evidence.details.checks[0].id, 12)
})

test('coercible or malformed run IDs cannot outrank a valid equal-timestamp run', () => {
  const completedAt = '2026-09-09T21:45:00Z'
  const malformedIds = [
    '999',
    true,
    false,
    11.5,
    0,
    -1,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    Number.NEGATIVE_INFINITY,
    null,
  ]

  for (const malformedId of malformedIds) {
    const evidence = requiredChecksEvidence({
      checkRunsPayload: {
        check_runs: [
          run({ id: 11, name: 'Validate GARBA', conclusion: 'success', completedAt }),
          run({ id: malformedId, name: 'Validate GARBA', conclusion: 'failure', completedAt }),
        ],
      },
      requiredChecks: ['Validate GARBA'],
      checkedAt: NOW,
    })

    assert.equal(evidence.status, 'healthy', `malformed run ID ${String(malformedId)} must not outrank numeric ID 11`)
    assert.equal(evidence.details.checks[0].id, 11)
  }
})

test('selected malformed run identity is reported as null without changing check truth', () => {
  const evidence = requiredChecksEvidence({
    checkRunsPayload: {
      check_runs: [run({ id: 'not-a-run-id', name: 'Validate GARBA', conclusion: 'success' })],
    },
    requiredChecks: ['Validate GARBA'],
    checkedAt: NOW,
  })

  assert.equal(evidence.status, 'healthy')
  assert.equal(evidence.details.checks[0].id, null)
})

test('equal-timestamp runs with no valid IDs keep deterministic input-order fallback', () => {
  const completedAt = '2026-09-09T21:45:00Z'
  const evidence = requiredChecksEvidence({
    checkRunsPayload: {
      check_runs: [
        run({ id: 'old', name: 'Validate GARBA', conclusion: 'failure', completedAt }),
        run({ id: 'new', name: 'Validate GARBA', conclusion: 'success', completedAt }),
      ],
    },
    requiredChecks: ['Validate GARBA'],
    checkedAt: NOW,
  })

  assert.equal(evidence.status, 'healthy')
  assert.equal(evidence.details.checks[0].id, null)
  assert.equal(evidence.details.checks[0].conclusion, 'success')
})

test('empty required-check configuration stays unknown', () => {
  const evidence = requiredChecksEvidence({
    checkRunsPayload: { check_runs: [] },
    requiredChecks: [],
    checkedAt: NOW,
  })
  assert.equal(evidence.status, 'unknown')
  assert.deepEqual(evidence.details.requiredChecks, [])
})
