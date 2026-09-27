import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

import { composeHomeLiveSnapshot } from '../../src/pga/home/live-snapshot.js'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const sourcePath = path.join(repoRoot, 'src/pga/home/live-snapshot.js')
const source = await fs.readFile(sourcePath, 'utf8')

const forbidden = [
  ['network fetch', /\bfetch\s*\(/],
  ['XMLHttpRequest', /\bXMLHttpRequest\b/],
  ['WebSocket', /\bWebSocket\b/],
  ['DOM document access', /\bdocument\s*\./],
  ['window access', /\bwindow\s*\./],
  ['navigator access', /\bnavigator\s*\./],
  ['localStorage access', /\blocalStorage\b/],
  ['sessionStorage access', /\bsessionStorage\b/],
  ['environment secret access', /\bprocess\.env\b/],
]

for (const [label, pattern] of forbidden) {
  assert.ok(!pattern.test(source), `Home + Live composer must remain pure: found ${label}`)
}

assert.match(source, /from '\.\/model\.js'/, 'composer must reuse the canonical Home model')
assert.match(source, /from '\.\.\/presence\/model\.js'/, 'composer must reuse the canonical presence model')
assert.match(source, /buildHomeSnapshot\(/, 'composer must delegate Home state to buildHomeSnapshot')
assert.match(source, /aggregatePresence\(/, 'composer must delegate Live state to aggregatePresence')
assert.match(source, /compareKpis\(/, 'composer must delegate comparison math to compareKpis')
assert.match(source, /summarizeTrend\(/, 'composer must delegate trend semantics to summarizeTrend')

const nowMs = Date.parse('2026-09-10T05:00:00Z')
const snapshot = composeHomeLiveSnapshot({
  home: {
    status: 'available',
    metrics: {
      sessionsToday: { value: 4 },
      playStartsToday: { value: 0 },
    },
  },
  presence: {
    status: 'available',
    heartbeats: [{
      sessionKey: 'session-a',
      eventId: 'event-a',
      acceptedAt: nowMs - 1_000,
      playbackState: 'playing',
      surface: 'player',
      contentType: 'song',
      contentId: 'canonical-song-a',
    }],
  },
  comparisons: {
    sessions: {
      currentMetric: 'sessionsToday',
      prior: { status: 'available', value: 2 },
    },
  },
  trends: {
    activity: { label: 'Activity', points: [1, 2, 3] },
  },
}, { nowMs })

assert.equal(snapshot.schemaVersion, 'pga-home-live/v1')
assert.equal(snapshot.status, 'available')
assert.equal(snapshot.home.metrics.sessionsToday.value, 4)
assert.equal(snapshot.home.metrics.playStartsToday.value, 0)
assert.equal(snapshot.live.metrics.liveNow.value, 1)
assert.equal(snapshot.live.metrics.listeningNow.value, 1)
assert.equal(snapshot.live.metrics.browsingNow.value, 0)
assert.equal(snapshot.comparisons.sessions.percent, 100)
assert.equal(snapshot.trends.activity.direction, 'up')
assert.equal(JSON.stringify(snapshot).includes('NaN'), false)
assert.equal(JSON.stringify(snapshot).includes('Infinity'), false)

console.log('PGA Home + Live composition validation passed.')
process.exitCode = 0
