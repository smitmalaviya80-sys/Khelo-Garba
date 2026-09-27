import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const resolver = require('../../src/playback/direct-source-resolver.js')
const catalogue = require('../../src/playback/direct-source-catalogue.js')
const { buildDirectSourceCataloguePlan } = catalogue

const DIRECT = Object.freeze({
  audioUrl: 'https://media.playgarba.com/audio/song-a.mp3',
  mimeType: 'audio/mpeg',
  rights: Object.freeze({
    redistributionAuthorized: true,
    rightsHolder: 'Fixture Rights Holder',
    licenseName: 'Fixture PlayGarba streaming permission',
    proofUrl: 'https://rights.playgarba.com/proofs/song-a',
  }),
})

function manifest(tracks = {}) {
  return { version: '1.0.0', tracks, notes: 'Test fixture only.' }
}

function song(id, extra = {}) {
  return { id, title: id, artist: 'Fixture Artist', ...extra }
}

let checks = 0
let failed = false

async function check(name, fn) {
  checks += 1
  try {
    await fn()
    console.log(`✓ ${name}`)
  } catch (error) {
    failed = true
    console.error(`✗ ${name}`)
    console.error(`  ${error instanceof Error ? error.stack || error.message : String(error)}`)
  }
}

await check('valid authorised direct media wins for the exact canonical song id', () => {
  const plan = buildDirectSourceCataloguePlan({
    songs: [song('song-a', { youtubeId: 'youtube-a' })],
    manifest: manifest({ 'song-a': DIRECT }),
  })

  const route = plan.decisionsBySongId['song-a']
  assert.equal(route.kind, 'direct')
  assert.equal(route.songId, 'song-a')
  assert.equal(route.backgroundCapable, true)
  assert.equal(route.media.url, DIRECT.audioUrl)
  assert.equal(route.provenance.rightsHolder, DIRECT.rights.rightsHolder)
  assert.deepEqual(plan.summary, {
    total: 1,
    direct: 1,
    youtubeForeground: 0,
    unavailable: 0,
    directInvalid: 0,
    playable: 1,
    backgroundCapable: 1,
  })
})

await check('no direct record preserves truthful YouTube foreground decision', () => {
  const plan = buildDirectSourceCataloguePlan({
    songs: [song('song-y', { youtubeId: 'abcdefghijk', playbackProvider: 'youtube' })],
    manifest: manifest(),
  })
  const route = plan.decisionsBySongId['song-y']
  assert.equal(route.kind, 'youtube-foreground')
  assert.equal(route.playable, true)
  assert.equal(route.backgroundCapable, false)
  assert.equal(route.provenance.videoId, 'abcdefghijk')
})

await check('no direct or executable YouTube source stays unavailable', () => {
  const plan = buildDirectSourceCataloguePlan({
    songs: [song('song-u')],
    manifest: manifest(),
  })
  assert.equal(plan.decisionsBySongId['song-u'].kind, 'unavailable')
  assert.equal(plan.decisionsBySongId['song-u'].playable, false)
})

await check('invalid direct record fails closed instead of falling back to available YouTube', () => {
  const invalid = {
    ...DIRECT,
    rights: { ...DIRECT.rights, redistributionAuthorized: false },
  }
  const plan = buildDirectSourceCataloguePlan({
    songs: [song('song-a', { youtubeId: 'abcdefghijk' })],
    manifest: manifest({ 'song-a': invalid }),
  })
  const route = plan.decisionsBySongId['song-a']
  assert.equal(route.kind, 'direct-invalid')
  assert.equal(route.playable, false)
  assert.equal(plan.summary.youtubeForeground, 0)
  assert.equal(plan.summary.directInvalid, 1)
  assert.equal(plan.diagnostics[0].code, 'direct-entry-invalid')
  assert.equal(plan.diagnostics[0].songId, 'song-a')
})

await check('consumer provider URL in a direct record remains invalid at runtime boundary', () => {
  const providerEntry = { ...DIRECT, audioUrl: 'https://open.spotify.com/track/fixture' }
  const plan = buildDirectSourceCataloguePlan({
    songs: [song('song-a')],
    manifest: manifest({ 'song-a': providerEntry }),
  })
  assert.equal(plan.decisionsBySongId['song-a'].kind, 'direct-invalid')
  assert.ok(plan.decisionsBySongId['song-a'].errors.some((message) => message.includes('consumer/provider')))
})

await check('orphan direct manifest ids are surfaced and never attached to another song', () => {
  const plan = buildDirectSourceCataloguePlan({
    songs: [song('song-a')],
    manifest: manifest({ 'orphan-song': DIRECT }),
  })
  assert.deepEqual(plan.orphanDirectSongIds, ['orphan-song'])
  assert.equal(plan.decisionsBySongId['song-a'].kind, 'unavailable')
  assert.equal(plan.diagnostics[0].code, 'orphan-direct-entry')
  assert.equal(plan.diagnostics[0].songId, 'orphan-song')
})

await check('duplicate canonical song ids fail closed rather than last-write-wins', () => {
  assert.throws(() => buildDirectSourceCataloguePlan({
    songs: [song('song-a'), song('song-a', { title: 'Different recording' })],
    manifest: manifest(),
  }), /duplicate canonical song id: song-a/)
})

await check('malformed manifest shapes fail closed', () => {
  assert.throws(() => buildDirectSourceCataloguePlan({ songs: [], manifest: null }), /must be an object/)
  assert.throws(() => buildDirectSourceCataloguePlan({ songs: [], manifest: { version: '1', tracks: [] } }), /tracks must be an object/)
  assert.throws(() => buildDirectSourceCataloguePlan({ songs: [], manifest: { version: '1', tracks: {}, executable: true } }), /unknown field: executable/)
  assert.throws(() => buildDirectSourceCataloguePlan({ songs: [], manifest: { tracks: {} } }), /version is required/)
})

await check('input order cannot alter route identity, diagnostics or summary', () => {
  const songsA = [
    song('song-z', { youtubeId: 'zzzzzzzzzzz' }),
    song('song-a'),
    song('song-m', { youtubeId: 'mmmmmmmmmmm' }),
  ]
  const songsB = [...songsA].reverse()
  const tracksA = { orphan: DIRECT, 'song-a': { ...DIRECT } }
  const tracksB = { 'song-a': { ...DIRECT }, orphan: DIRECT }
  const first = buildDirectSourceCataloguePlan({ songs: songsA, manifest: manifest(tracksA) })
  const second = buildDirectSourceCataloguePlan({ songs: songsB, manifest: manifest(tracksB) })

  assert.deepEqual(first.decisions, second.decisions)
  assert.deepEqual(first.diagnostics, second.diagnostics)
  assert.deepEqual(first.summary, second.summary)
  assert.deepEqual(Object.keys(first.decisionsBySongId), ['song-a', 'song-m', 'song-z'])
})

await check('planner delegates exactly once per canonical id with only same-id direct entry', () => {
  const calls = []
  const spyResolver = {
    resolvePlaybackSource(input) {
      calls.push(input)
      return resolver.resolvePlaybackSource(input)
    },
  }
  const plan = buildDirectSourceCataloguePlan({
    songs: [song('song-b'), song('song-a')],
    manifest: manifest({ 'song-a': DIRECT }),
    resolver: spyResolver,
  })

  assert.equal(plan.decisions.length, 2)
  assert.deepEqual(calls.map((call) => call.song.id), ['song-a', 'song-b'])
  assert.equal(calls[0].directSongId, 'song-a')
  assert.equal(calls[0].directEntry, DIRECT)
  assert.equal(calls[1].directSongId, null)
  assert.equal(calls[1].directEntry, null)
})

await check('missing or invalid resolver fails closed', () => {
  assert.throws(() => buildDirectSourceCataloguePlan({ songs: [], manifest: manifest(), resolver: null }), /requires resolvePlaybackSource/)
  assert.throws(() => buildDirectSourceCataloguePlan({ songs: [], manifest: manifest(), resolver: {} }), /requires resolvePlaybackSource/)
})

await check('planner is immutable at its public routing boundaries', () => {
  const plan = buildDirectSourceCataloguePlan({ songs: [song('song-a')], manifest: manifest() })
  assert.equal(Object.isFrozen(plan), true)
  assert.equal(Object.isFrozen(plan.decisions), true)
  assert.equal(Object.isFrozen(plan.decisionsBySongId), true)
  assert.equal(Object.isFrozen(plan.summary), true)
  assert.equal(Object.isFrozen(plan.diagnostics), true)
})

await check('production module stays side-effect free', async () => {
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
  const source = await fs.readFile(path.join(repoRoot, 'src/playback/direct-source-catalogue.js'), 'utf8')
  const forbidden = [
    /\bfetch\s*\(/,
    /\bXMLHttpRequest\b/,
    /\bWebSocket\b/,
    /\bdocument\s*\./,
    /\blocalStorage\b/,
    /\bsessionStorage\b/,
    /\bnavigator\.mediaSession\b/,
    /\.play\s*\(/,
    /\.pause\s*\(/,
  ]
  for (const pattern of forbidden) assert.equal(pattern.test(source), false, `forbidden side effect matched ${pattern}`)
  assert.match(source, /resolvePlaybackSource\(/)
})

if (failed) process.exitCode = 1
else console.log(`Direct-source catalogue tests passed (${checks} checks).`)
