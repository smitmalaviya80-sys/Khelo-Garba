import assert from 'node:assert/strict'
import test from 'node:test'

import { evaluateHealth } from '../model.js'
import {
  playbackSmokeEvidence,
  pwaUpdateEvidence,
  rollupHealthEvidence,
  telemetryHealthEvidence,
} from '../operational-adapters.js'

const NOW = Date.parse('2026-09-10T04:00:00Z')
const MINUTE = 60_000

const common = {
  checkedAt: '2026-09-10T04:00:00Z',
  freshnessBudgetMs: 10 * MINUTE,
}

test('PWA observation remains unknown until it completes', () => {
  const evidence = pwaUpdateEvidence({
    ...common,
    completed: false,
    controlled: true,
    activeVersion: 'v16',
    expectedVersion: 'v16',
  })
  assert.equal(evidence.status, 'unknown')
})

test('PWA is healthy only when controlled active and expected versions match', () => {
  const evidence = pwaUpdateEvidence({
    ...common,
    completed: true,
    state: 'success',
    controlled: true,
    activeVersion: 'v16',
    expectedVersion: 'v16',
  })
  assert.equal(evidence.status, 'healthy')
  assert.equal(evidence.details.activeVersion, 'v16')
  assert.equal(evidence.details.expectedVersion, 'v16')
})

test('waiting PWA update is degraded rather than falsely healthy', () => {
  const evidence = pwaUpdateEvidence({
    ...common,
    completed: true,
    state: 'success',
    controlled: true,
    activeVersion: 'v16',
    expectedVersion: 'v16',
    waitingVersion: 'v17',
  })
  assert.equal(evidence.status, 'degraded')
  assert.match(evidence.summary, /waiting/i)
})

test('PWA version mismatch is degraded and actionable', () => {
  const evidence = pwaUpdateEvidence({
    ...common,
    completed: true,
    state: 'success',
    controlled: true,
    activeVersion: 'v15',
    expectedVersion: 'v16',
  })
  assert.equal(evidence.status, 'degraded')
  assert.match(evidence.reason, /Expected v16 but observed v15/)
})

test('hard PWA failure remains failed', () => {
  const evidence = pwaUpdateEvidence({
    ...common,
    completed: true,
    state: 'failure',
    controlled: false,
    failureCode: 'registration_failed',
  })
  assert.equal(evidence.status, 'failed')
  assert.equal(evidence.details.failureCode, 'registration_failed')
})

test('missing PWA versions are not invented', () => {
  const evidence = pwaUpdateEvidence({
    ...common,
    completed: true,
    state: 'success',
    controlled: true,
  })
  assert.equal(evidence.status, 'unknown')
  assert.equal(Object.hasOwn(evidence.details, 'activeVersion'), false)
  assert.equal(Object.hasOwn(evidence.details, 'expectedVersion'), false)
})

test('canonical playback smoke passes only with start and control evidence', () => {
  const evidence = playbackSmokeEvidence({
    ...common,
    completed: true,
    state: 'success',
    confirmedStart: true,
    controlsResponsive: true,
    contentId: 'song-123',
    sourceUrl: 'https://github.com/ruddvz/garba/actions/runs/1',
  })
  assert.equal(evidence.status, 'healthy')
  assert.equal(evidence.criticality, 'critical')
  assert.equal(evidence.details.contentId, 'song-123')
})

test('completed blocking playback failure is failed', () => {
  const evidence = playbackSmokeEvidence({
    ...common,
    completed: true,
    state: 'failure',
    confirmedStart: false,
    controlsResponsive: true,
    contentId: 'song-123',
    failureCode: 'youtube_embed_unavailable',
  })
  assert.equal(evidence.status, 'failed')
  assert.equal(evidence.details.failureCode, 'youtube_embed_unavailable')
})

test('pending playback smoke remains unknown', () => {
  const evidence = playbackSmokeEvidence({
    ...common,
    completed: true,
    state: 'in progress',
    confirmedStart: true,
    controlsResponsive: true,
  })
  assert.equal(evidence.status, 'unknown')
})

test('nominal success without explicit playback control proof remains unknown', () => {
  const evidence = playbackSmokeEvidence({
    ...common,
    completed: true,
    state: 'success',
    confirmedStart: true,
  })
  assert.equal(evidence.status, 'unknown')
})

test('telemetry envelope maps complete partial and unavailable truthfully', () => {
  const healthy = telemetryHealthEvidence({
    ...common,
    payload: {
      status: 'complete',
      generatedAt: '2026-09-10T03:59:30Z',
      dataThrough: '2026-09-10T03:59:00Z',
      sources: [{ name: 'analytics-engine', status: 'complete', sampled: false }],
      data: { shouldNotBeCopied: 'raw' },
    },
  })
  assert.equal(healthy.status, 'healthy')
  assert.equal(Object.hasOwn(healthy.details, 'data'), false)

  const partial = telemetryHealthEvidence({
    ...common,
    payload: {
      status: 'partial',
      dataThrough: '2026-09-10T03:59:00Z',
      sources: [{ name: 'analytics-engine', status: 'complete' }],
    },
  })
  assert.equal(partial.status, 'degraded')

  const failed = telemetryHealthEvidence({
    ...common,
    payload: {
      status: 'unavailable',
      sources: [{ name: 'analytics-engine', status: 'unavailable' }],
    },
  })
  assert.equal(failed.status, 'failed')
})

test('completed telemetry envelope with a failed source is failed', () => {
  const evidence = telemetryHealthEvidence({
    ...common,
    payload: {
      status: 'complete',
      sources: [
        { name: 'analytics-engine', status: 'complete' },
        { name: 'presence', status: 'unavailable' },
      ],
    },
  })
  assert.equal(evidence.status, 'failed')
})

test('telemetry freshness flows into the existing Health stale state', () => {
  const evidence = telemetryHealthEvidence({
    checkedAt: '2026-09-10T04:00:00Z',
    freshnessBudgetMs: 10 * MINUTE,
    payload: {
      status: 'complete',
      dataThrough: '2026-09-10T03:40:00Z',
      sources: [{ name: 'analytics-engine', status: 'complete' }],
    },
  })
  const result = evaluateHealth({ telemetry: evidence }, { nowMs: NOW })
  assert.equal(result.status, 'stale')
  assert.equal(result.subsystems[0].status, 'stale')
})

test('rollup health is healthy only with a complete envelope and latest complete run', () => {
  const evidence = rollupHealthEvidence({
    ...common,
    payload: {
      status: 'complete',
      generatedAt: '2026-09-10T03:59:30Z',
      dataThrough: '2026-09-10T03:55:00Z',
      sources: [{ name: 'd1-rollups', status: 'complete' }],
      data: {
        rollups: [
          {
            run_id: 'rollup-42',
            status: 'complete',
            data_through_ms: NOW - 5 * MINUTE,
            completed_at: '2026-09-10T03:56:00Z',
            secret_internal: 'must-not-copy',
          },
        ],
      },
    },
  })
  assert.equal(evidence.status, 'healthy')
  assert.equal(evidence.details.latestRunId, 'rollup-42')
  assert.equal(evidence.details.latestStatus, 'complete')
  assert.equal(Object.hasOwn(evidence.details, 'secret_internal'), false)
})

test('partial or incomplete rollup state is degraded', () => {
  const partial = rollupHealthEvidence({
    ...common,
    payload: {
      status: 'partial',
      sources: [{ name: 'd1-rollups', status: 'complete' }],
      data: { rollups: [{ run_id: 'rollup-43', status: 'complete' }] },
    },
  })
  assert.equal(partial.status, 'degraded')

  const incomplete = rollupHealthEvidence({
    ...common,
    payload: {
      status: 'complete',
      sources: [{ name: 'd1-rollups', status: 'complete' }],
      data: { rollups: [{ run_id: 'rollup-44', status: 'partial' }] },
    },
  })
  assert.equal(incomplete.status, 'degraded')
})

test('unavailable or explicitly failed rollup state is failed', () => {
  const unavailable = rollupHealthEvidence({
    ...common,
    payload: {
      status: 'unavailable',
      sources: [{ name: 'd1-rollups', status: 'unavailable' }],
      data: null,
    },
  })
  assert.equal(unavailable.status, 'failed')

  const failedRun = rollupHealthEvidence({
    ...common,
    payload: {
      status: 'complete',
      sources: [{ name: 'd1-rollups', status: 'complete' }],
      data: { rollups: [{ run_id: 'rollup-45', status: 'failed' }] },
    },
  })
  assert.equal(failedRun.status, 'failed')
})

test('malformed or empty rollup payload remains unknown', () => {
  assert.equal(rollupHealthEvidence({ ...common }).status, 'unknown')
  assert.equal(rollupHealthEvidence({
    ...common,
    payload: { status: 'complete', data: { rollups: [] } },
  }).status, 'unknown')
})

test('critical playback failure can lead overall Health to failed without fabricating other subsystems', () => {
  const playback = playbackSmokeEvidence({
    ...common,
    completed: true,
    state: 'failure',
    confirmedStart: false,
    controlsResponsive: false,
    contentId: 'song-123',
  })
  const telemetry = telemetryHealthEvidence({
    ...common,
    payload: { status: 'complete', dataThrough: '2026-09-10T03:59:00Z' },
  })
  const result = evaluateHealth({ playback, telemetry }, { nowMs: NOW })
  assert.equal(result.status, 'failed')
  assert.equal(result.leadingSubsystem, 'playback')
  assert.equal(result.subsystems.find((item) => item.name === 'telemetry').status, 'healthy')
})

test('operational source summaries preserve absent and boolean sampling truth', () => {
  const absent = telemetryHealthEvidence({
    ...common,
    payload: {
      status: 'complete',
      sources: [{ name: 'analytics-engine', status: 'complete' }],
    },
  })
  assert.equal(absent.status, 'healthy')
  assert.equal(Object.hasOwn(absent.details.sources[0], 'sampled'), false)

  for (const sampled of [false, true]) {
    const telemetry = telemetryHealthEvidence({
      ...common,
      payload: {
        status: 'complete',
        sources: [{ name: 'analytics-engine', status: 'complete', sampled }],
      },
    })
    assert.equal(telemetry.status, 'healthy')
    assert.equal(telemetry.details.sources[0].sampled, sampled)

    const rollup = rollupHealthEvidence({
      ...common,
      payload: {
        status: 'complete',
        sources: [{ name: 'd1-rollups', status: 'complete', sampled }],
        data: { rollups: [{ run_id: 'rollup-sampling', status: 'complete' }] },
      },
    })
    assert.equal(rollup.status, 'healthy')
    assert.equal(rollup.details.sources[0].sampled, sampled)
  }
})

test('malformed source sampling stays unknown without changing Health classification', () => {
  const malformed = ['false', '0', 0, 1, null, {}, [], Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]

  for (const sampled of malformed) {
    const telemetry = telemetryHealthEvidence({
      ...common,
      payload: {
        status: 'complete',
        sources: [{ name: 'analytics-engine', status: 'complete', sampled }],
      },
    })
    assert.equal(telemetry.status, 'healthy', `telemetry status changed for ${String(sampled)}`)
    assert.equal(telemetry.details.sources[0].sampled, null, `telemetry sampled ${String(sampled)} must be unknown`)

    const rollup = rollupHealthEvidence({
      ...common,
      payload: {
        status: 'complete',
        sources: [{ name: 'd1-rollups', status: 'complete', sampled }],
        data: { rollups: [{ run_id: 'rollup-malformed-sampling', status: 'complete' }] },
      },
    })
    assert.equal(rollup.status, 'healthy', `rollup status changed for ${String(sampled)}`)
    assert.equal(rollup.details.sources[0].sampled, null, `rollup sampled ${String(sampled)} must be unknown`)
  }
})
