import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buildCatalogueIdentityIndex,
  enrichListeningRows,
  loadCatalogueIdentityIndex,
  parseCatalogueAliases,
  resetCatalogueIdentityCacheForTests,
  resolveCatalogueIdentity,
} from '../lib/catalogue.js'

const songs = [
  { id: 'song-current', title: 'Aavo Maadi', artist: 'Artist One', releaseId: 'release-current' },
  { id: 'song-presentation', title: 'Aavo Maadi', artist: 'Artist One', releaseId: 'release-presentation', canonicalSongId: 'song-current', canonicalReleaseId: 'release-current', nonstopSetId: 'set-presentation' },
]

const releases = [
  { id: 'release-current', title: 'Current Release', artist: 'Artist One' },
  { id: 'release-presentation', title: 'Presentation Release', artist: 'Artist One', canonicalReleaseId: 'release-current' },
]

test('canonical identity collapses presentation and configured legacy IDs', () => {
  const index = buildCatalogueIdentityIndex(songs, releases, {
    song: { 'song-legacy': 'song-current' },
    release: { 'release-legacy': 'release-current' },
  })

  assert.equal(resolveCatalogueIdentity(index, 'song', 'song-current').contentId, 'song-current')
  assert.equal(resolveCatalogueIdentity(index, 'song', 'song-presentation').contentId, 'song-current')
  assert.equal(resolveCatalogueIdentity(index, 'song', 'song-legacy').contentId, 'song-current')
  assert.equal(resolveCatalogueIdentity(index, 'release', 'release-presentation').contentId, 'release-current')
  assert.equal(resolveCatalogueIdentity(index, 'release', 'release-legacy').contentId, 'release-current')
  assert.equal(resolveCatalogueIdentity(index, 'nonstop_set', 'set-presentation').label, 'Presentation Release')
})

test('listening enrichment keeps measured counts while exposing canonical labels', () => {
  const index = buildCatalogueIdentityIndex(songs, releases, { song: { 'song-legacy': 'song-current' } })
  const rows = enrichListeningRows([
    { event_name: 'playback_started', content_type: 'song', content_id: 'song-presentation', weighted_events: 2 },
    { event_name: 'playback_started', content_type: 'song', content_id: 'song-legacy', weighted_events: 3 },
    { event_name: 'playback_started', content_type: 'song', content_id: 'missing-song', weighted_events: 1 },
  ], index)

  assert.equal(rows[0].canonical_id, 'song-current')
  assert.equal(rows[0].content_label, 'Aavo Maadi')
  assert.equal(rows[1].canonical_id, 'song-current')
  assert.equal(rows[2].canonical_id, 'missing-song')
  assert.equal(rows[2].content_label, null)
  assert.equal(rows[2].identity_status, 'unresolved')
})

test('invalid alias configuration fails closed to an empty alias map', () => {
  assert.deepEqual(parseCatalogueAliases('{not-json'), { song: {}, release: {} })
  assert.deepEqual(parseCatalogueAliases({ song: { old: 'new', same: 'same' }, release: null }), {
    song: { old: 'new' },
    release: {},
  })
})

test('catalogue loader reads public generated truth and applies explicit aliases', async () => {
  resetCatalogueIdentityCacheForTests()
  const requests = []
  const fakeFetch = async (url) => {
    requests.push(String(url))
    if (String(url).endsWith('/data/songs.json')) return Response.json(songs)
    if (String(url).endsWith('/data/releases.json')) return Response.json(releases)
    return new Response('missing', { status: 404 })
  }

  const index = await loadCatalogueIdentityIndex({
    PUBLIC_ORIGIN: 'https://playgarba.com/',
    CATALOGUE_ID_ALIASES_JSON: JSON.stringify({ song: { 'song-old': 'song-current' } }),
  }, { nowMs: 1000, catalogueFetchImpl: fakeFetch })

  assert.deepEqual(requests, [
    'https://playgarba.com/data/songs.json',
    'https://playgarba.com/data/releases.json',
  ])
  assert.equal(resolveCatalogueIdentity(index, 'track', 'song-old').contentId, 'song-current')
})
