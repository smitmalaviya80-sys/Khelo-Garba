const DEFAULT_PUBLIC_ORIGIN = 'https://playgarba.com'
const CACHE_TTL_MS = 5 * 60 * 1000
const MAX_ALIAS_HOPS = 8

let cached = null

function cleanOrigin(value) {
  const input = String(value || DEFAULT_PUBLIC_ORIGIN).trim()
  try {
    const url = new URL(input)
    return `${url.protocol}//${url.host}`
  } catch {
    return DEFAULT_PUBLIC_ORIGIN
  }
}

function cleanAliasMap(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  const output = {}
  for (const [from, to] of Object.entries(value)) {
    const source = String(from || '').trim()
    const target = String(to || '').trim()
    if (source && target && source !== target) output[source] = target
  }
  return output
}

export function parseCatalogueAliases(value) {
  let input = value
  if (typeof value === 'string') {
    try { input = JSON.parse(value) } catch { return { song: {}, release: {} } }
  }
  if (!input || typeof input !== 'object' || Array.isArray(input)) return { song: {}, release: {} }
  return {
    song: cleanAliasMap(input.song),
    release: cleanAliasMap(input.release),
  }
}

function resolveAlias(map, id) {
  let current = String(id || '').trim()
  if (!current) return null
  const seen = new Set()
  for (let hop = 0; hop < MAX_ALIAS_HOPS; hop += 1) {
    if (seen.has(current)) return current
    seen.add(current)
    const next = map[current]
    if (!next) return current
    current = next
  }
  return current
}

function canonicalReleaseId(release, aliases) {
  const authored = String(release?.canonicalReleaseId || release?.id || '').trim()
  return resolveAlias(aliases.release, authored)
}

function canonicalSongId(song, aliases) {
  const authored = String(song?.canonicalSongId || song?.id || '').trim()
  return resolveAlias(aliases.song, authored)
}

export function buildCatalogueIdentityIndex(songs = [], releases = [], aliasInput = {}) {
  const aliases = parseCatalogueAliases(aliasInput)
  const rawSongs = new Map((Array.isArray(songs) ? songs : []).filter((song) => song?.id).map((song) => [String(song.id), song]))
  const rawReleases = new Map((Array.isArray(releases) ? releases : []).filter((release) => release?.id).map((release) => [String(release.id), release]))
  const song = new Map()
  const release = new Map()
  const nonstopSet = new Map()

  for (const item of rawReleases.values()) {
    const canonicalId = canonicalReleaseId(item, aliases)
    const canonical = rawReleases.get(canonicalId) || rawReleases.get(String(item.canonicalReleaseId || '')) || item
    const identity = {
      contentType: 'release',
      contentId: canonicalId,
      label: canonical.title || item.title || canonicalId,
      artist: canonical.artist || item.artist || null,
    }
    release.set(String(item.id), identity)
    release.set(canonicalId, identity)
  }

  for (const [legacyId, targetId] of Object.entries(aliases.release)) {
    const resolvedTarget = resolveAlias(aliases.release, targetId)
    const identity = release.get(resolvedTarget)
    if (identity) release.set(legacyId, identity)
  }

  for (const item of rawSongs.values()) {
    const canonicalId = canonicalSongId(item, aliases)
    const canonical = rawSongs.get(canonicalId) || rawSongs.get(String(item.canonicalSongId || '')) || item
    const authoredReleaseId = String(canonical.canonicalReleaseId || canonical.releaseId || item.canonicalReleaseId || item.releaseId || '').trim()
    const resolvedReleaseId = resolveAlias(aliases.release, authoredReleaseId)
    const releaseIdentity = release.get(resolvedReleaseId) || release.get(authoredReleaseId) || null
    const identity = {
      contentType: 'song',
      contentId: canonicalId,
      label: canonical.title || item.title || canonicalId,
      artist: canonical.artist || item.artist || null,
      releaseId: releaseIdentity?.contentId || resolvedReleaseId || null,
      releaseTitle: releaseIdentity?.label || null,
    }
    song.set(String(item.id), identity)
    song.set(canonicalId, identity)

    const nonstopSetId = String(item.nonstopSetId || '').trim()
    if (nonstopSetId && !nonstopSet.has(nonstopSetId)) {
      const sourceRelease = rawReleases.get(String(item.releaseId || '')) || null
      nonstopSet.set(nonstopSetId, {
        contentType: 'nonstop_set',
        contentId: nonstopSetId,
        label: sourceRelease?.title || releaseIdentity?.label || nonstopSetId,
        artist: sourceRelease?.artist || identity.artist || null,
        releaseId: releaseIdentity?.contentId || null,
        releaseTitle: releaseIdentity?.label || null,
      })
    }
  }

  for (const [legacyId, targetId] of Object.entries(aliases.song)) {
    const resolvedTarget = resolveAlias(aliases.song, targetId)
    const identity = song.get(resolvedTarget)
    if (identity) song.set(legacyId, identity)
  }

  return { song, release, nonstopSet, aliases }
}

export function resolveCatalogueIdentity(index, contentType, contentId) {
  if (!contentId) return null
  const type = String(contentType || '').toLowerCase()
  if (type === 'song' || type === 'track') return index?.song?.get(String(contentId)) || null
  if (type === 'release' || type === 'album') return index?.release?.get(String(contentId)) || null
  if (type === 'nonstop_set' || type === 'set') return index?.nonstopSet?.get(String(contentId)) || null
  if (type === 'chapter') return index?.song?.get(String(contentId)) || index?.nonstopSet?.get(String(contentId)) || null
  return null
}

export function enrichListeningRows(rows = [], index) {
  return (Array.isArray(rows) ? rows : []).map((row) => {
    const identity = resolveCatalogueIdentity(index, row.content_type, row.content_id)
    return {
      ...row,
      canonical_id: identity?.contentId || row.content_id || null,
      content_label: identity?.label || null,
      artist: identity?.artist || null,
      release_title: identity?.releaseTitle || null,
      identity_status: identity ? 'resolved' : (row.content_id ? 'unresolved' : 'not-applicable'),
    }
  })
}

async function fetchJson(fetchImpl, url) {
  const response = await fetchImpl(url, { headers: { accept: 'application/json' }, cache: 'no-store' })
  if (!response.ok) throw new Error(`catalogue_fetch_${response.status}`)
  const value = await response.json()
  if (!Array.isArray(value)) throw new Error('catalogue_payload_invalid')
  return value
}

export async function loadCatalogueIdentityIndex(env = {}, options = {}) {
  const nowMs = options.nowMs ?? Date.now()
  const origin = cleanOrigin(env.PUBLIC_ORIGIN || options.publicOrigin)
  const aliases = parseCatalogueAliases(options.aliases ?? env.CATALOGUE_ID_ALIASES_JSON)
  const aliasKey = JSON.stringify(aliases)
  if (cached && cached.origin === origin && cached.aliasKey === aliasKey && cached.expiresAt > nowMs) return cached.index

  const fetchImpl = options.catalogueFetchImpl || options.fetchImpl || fetch
  const [songs, releases] = await Promise.all([
    fetchJson(fetchImpl, `${origin}/data/songs.json`),
    fetchJson(fetchImpl, `${origin}/data/releases.json`),
  ])
  const index = buildCatalogueIdentityIndex(songs, releases, aliases)
  cached = { origin, aliasKey, expiresAt: nowMs + (options.cacheTtlMs ?? CACHE_TTL_MS), index }
  return index
}

export function resetCatalogueIdentityCacheForTests() {
  cached = null
}
