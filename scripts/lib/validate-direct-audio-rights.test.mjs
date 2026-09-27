import assert from 'node:assert/strict'
import process from 'node:process'

import { validateDirectAudioManifest, validateDirectAudioRights } from './validate-direct-audio-rights.mjs'

const canonical = new Set(['song-1', 'song-2'])

function validEntry(overrides = {}) {
  return {
    audioUrl: 'https://media.playgarba.com/audio/song-1.mp3',
    mimeType: 'audio/mpeg',
    rights: {
      redistributionAuthorized: true,
      rightsHolder: 'Example Rights Holder',
      licenseName: 'Written PlayGarba streaming and redistribution permission',
      proofUrl: 'https://rights.playgarba.com/proofs/example-contract',
    },
    ...overrides,
  }
}

function validManifest(entry = validEntry()) {
  return {
    version: '1.0.0',
    tracks: { 'song-1': entry },
    notes: 'Fixture only. No real media or permission is asserted.',
  }
}

let checks = 0
let failed = false

function check(name, fn) {
  checks += 1
  try {
    fn()
    console.log(`✓ ${name}`)
  } catch (error) {
    failed = true
    console.error(`✗ ${name}`)
    console.error(`  ${error instanceof Error ? error.message : String(error)}`)
  }
}

function errorsFor(manifest) {
  return validateDirectAudioManifest(manifest, canonical)
}

function expectError(manifest, fragment) {
  const errors = errorsFor(manifest)
  assert.ok(errors.some((error) => error.includes(fragment)), `expected error containing ${JSON.stringify(fragment)}; got ${JSON.stringify(errors)}`)
}

check('empty production-shaped manifest is valid', () => {
  assert.deepEqual(errorsFor({ version: '1.0.0', tracks: {}, notes: 'No rights-cleared tracks yet.' }), [])
})

check('fully evidenced authorised direct media is valid', () => {
  assert.deepEqual(errorsFor(validManifest()), [])
})

check('unknown manifest fields fail closed', () => {
  expectError({ ...validManifest(), executableByDefault: true }, 'unknown field "executableByDefault"')
})

check('track must reference a canonical song id', () => {
  const manifest = validManifest()
  manifest.tracks = { 'unknown-song': validEntry() }
  expectError(manifest, 'song ID does not exist in the canonical catalogue')
})

check('unknown track fields fail closed', () => {
  expectError(validManifest(validEntry({ autoplay: true })), 'unknown field "autoplay"')
})

check('media URL must use HTTPS', () => {
  expectError(validManifest(validEntry({ audioUrl: 'http://media.playgarba.com/song.mp3' })), 'absolute HTTPS URL')
})

for (const [name, url] of [
  ['YouTube', 'https://www.youtube.com/watch?v=abc'],
  ['YouTube CDN', 'https://rr1---sn.example.googlevideo.com/videoplayback?id=abc'],
  ['Spotify', 'https://open.spotify.com/track/abc'],
  ['Apple Music', 'https://music.apple.com/in/song/example/123'],
  ['SoundCloud', 'https://soundcloud.com/example/song'],
  ['JioSaavn', 'https://www.jiosaavn.com/song/example/abc'],
  ['Amazon Music', 'https://music.amazon.in/albums/abc'],
]) {
  check(`${name} consumer URL cannot become executable direct media`, () => {
    expectError(validManifest(validEntry({ audioUrl: url })), 'consumer/provider stream URLs are not executable direct media')
  })
}

check('MIME type must be an allowed audio type', () => {
  expectError(validManifest(validEntry({ mimeType: 'video/mp4' })), 'must be one of:')
})

check('redistribution permission must be exactly true', () => {
  const entry = validEntry()
  entry.rights.redistributionAuthorized = false
  expectError(validManifest(entry), 'must be exactly true')
})

check('missing rights holder fails closed', () => {
  const entry = validEntry()
  entry.rights.rightsHolder = '  '
  expectError(validManifest(entry), 'must name the rights holder')
})

check('missing licence or permission identity fails closed', () => {
  const entry = validEntry()
  entry.rights.licenseName = ''
  expectError(validManifest(entry), 'must identify the licence or explicit permission')
})

check('proof URL must use HTTPS', () => {
  const entry = validEntry()
  entry.rights.proofUrl = 'mailto:rights@example.com'
  expectError(validManifest(entry), 'absolute HTTPS evidence URL')
})

check('unknown rights fields fail closed', () => {
  const entry = validEntry()
  entry.rights.assumedPermission = true
  expectError(validManifest(entry), 'unknown field "assumedPermission"')
})

check('media URL cannot be reused as its own proof', () => {
  const entry = validEntry()
  entry.rights.proofUrl = entry.audioUrl
  expectError(validManifest(entry), 'must be rights evidence, not the media URL itself')
})

check('one media asset cannot silently map to two canonical recordings', () => {
  const first = validEntry()
  const second = validEntry({
    rights: { ...validEntry().rights, proofUrl: 'https://rights.playgarba.com/proofs/song-2' },
  })
  const manifest = { version: '1.0.0', tracks: { 'song-1': first, 'song-2': second } }
  expectError(manifest, 'duplicates direct media already assigned to song-1')
})

check('shared proof may cover multiple tracks when the rights contract is consistent', () => {
  const first = validEntry()
  const second = validEntry({ audioUrl: 'https://media.playgarba.com/audio/song-2.mp3' })
  const manifest = { version: '1.0.0', tracks: { 'song-1': first, 'song-2': second } }
  assert.deepEqual(errorsFor(manifest), [])
})

check('shared proof with conflicting rights claims is rejected', () => {
  const first = validEntry()
  const second = validEntry({
    audioUrl: 'https://media.playgarba.com/audio/song-2.mp3',
    rights: { ...validEntry().rights, rightsHolder: 'Different Rights Holder' },
  })
  const manifest = { version: '1.0.0', tracks: { 'song-1': first, 'song-2': second } }
  expectError(manifest, 'conflicting rights-holder/licence claims')
})

check('malformed tracks container fails closed', () => {
  expectError({ version: '1.0.0', tracks: [] }, 'must be an object keyed by canonical song ID')
})


check('validateDirectAudioRights - true when redistributionAuthorized is true and no territory restrictions', () => {
  assert.equal(validateDirectAudioRights(validEntry().rights, 'US'), true)
})

check('validateDirectAudioRights - true when requestTerritory is in territories', () => {
  const rights = { ...validEntry().rights, territories: ['US', 'CA'] }
  assert.equal(validateDirectAudioRights(rights, 'US'), true)
})

check('validateDirectAudioRights - false when requestTerritory is not in territories', () => {
  const rights = { ...validEntry().rights, territories: ['US', 'CA'] }
  assert.equal(validateDirectAudioRights(rights, 'GB'), false)
})

check('validateDirectAudioRights - true when no requestTerritory is provided', () => {
  const rights = { ...validEntry().rights, territories: ['US', 'CA'] }
  assert.equal(validateDirectAudioRights(rights, null), true)
})

check('validateDirectAudioRights - false when redistributionAuthorized is false', () => {
  const rights = { ...validEntry().rights, redistributionAuthorized: false }
  assert.equal(validateDirectAudioRights(rights, 'US'), false)
})

check('validateDirectAudioRights - false when rights is missing', () => {
  assert.equal(validateDirectAudioRights(null, 'US'), false)
})


if (failed) process.exitCode = 1
else console.log(`Direct-audio rights tests passed (${checks} checks).`)
