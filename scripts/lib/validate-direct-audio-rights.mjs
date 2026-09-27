import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const MANIFEST_FIELDS = new Set(['version', 'tracks', 'notes'])
const TRACK_FIELDS = new Set(['audioUrl', 'mimeType', 'rights'])
const RIGHTS_FIELDS = new Set([
  'territories',
  'redistributionAuthorized',
  'rightsHolder',
  'licenseName',
  'proofUrl',
])


export function validateDirectAudioRights(rights, requestTerritory) {
  if (!rights || rights.redistributionAuthorized !== true) {
    return false;
  }
  if (!requestTerritory) {
    return true;
  }
  if (Array.isArray(rights.territories)) {
    return rights.territories.includes(requestTerritory);
  }
  return true;
}


const ALLOWED_AUDIO_MIME_TYPES = new Set([
  'audio/aac',
  'audio/flac',
  'audio/mp4',
  'audio/mpeg',
  'audio/ogg',
  'audio/wav',
  'audio/webm',
  'audio/x-flac',
])

const BLOCKED_PROVIDER_HOST_SUFFIXES = [
  'youtube.com',
  'youtu.be',
  'googlevideo.com',
  'spotify.com',
  'scdn.co',
  'music.apple.com',
  'mzstatic.com',
  'soundcloud.com',
  'sndcdn.com',
  'bandcamp.com',
  'bcbits.com',
  'qobuz.com',
  'gaana.com',
  'jiosaavn.com',
  'music.amazon.com',
  'music.amazon.ca',
  'music.amazon.in',
  'music.amazon.co.uk',
]

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function nonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0
}

function unknownFields(value, allowed) {
  if (!isPlainObject(value)) return []
  return Object.keys(value).filter((key) => !allowed.has(key))
}

function parseHttpsUrl(value) {
  if (!nonEmptyString(value)) return null
  try {
    const parsed = new URL(value)
    return parsed.protocol === 'https:' ? parsed : null
  } catch {
    return null
  }
}

function sameHttpResourceIgnoringFragment(left, right) {
  if (!left || !right) return false
  const leftUrl = new URL(left.href)
  const rightUrl = new URL(right.href)
  leftUrl.hash = ''
  rightUrl.hash = ''
  return leftUrl.href === rightUrl.href
}

function hostMatches(hostname, suffix) {
  const host = String(hostname || '').toLowerCase().replace(/\.$/, '').replace(/^www\./, '')
  const target = suffix.toLowerCase()
  return host === target || host.endsWith(`.${target}`)
}

export function isBlockedConsumerProviderUrl(value) {
  const parsed = parseHttpsUrl(value)
  if (!parsed) return false
  return BLOCKED_PROVIDER_HOST_SUFFIXES.some((suffix) => hostMatches(parsed.hostname, suffix))
}

export function validateDirectAudioManifest(manifest, canonicalSongIds = new Set()) {
  const errors = []
  const add = (location, message) => errors.push(`${location}: ${message}`)

  if (!isPlainObject(manifest)) return ['manifest: must be an object']

  for (const field of unknownFields(manifest, MANIFEST_FIELDS)) {
    add('manifest', `unknown field ${JSON.stringify(field)}`)
  }

  if (!nonEmptyString(manifest.version)) add('manifest.version', 'must be a non-empty string')
  if (!isPlainObject(manifest.tracks)) {
    add('manifest.tracks', 'must be an object keyed by canonical song ID')
    return errors
  }
  if (manifest.notes !== undefined && typeof manifest.notes !== 'string') {
    add('manifest.notes', 'must be a string when present')
  }

  const mediaOwners = new Map()
  const proofContracts = new Map()

  for (const [songId, entry] of Object.entries(manifest.tracks)) {
    const at = `manifest.tracks.${songId}`

    if (!nonEmptyString(songId)) {
      add(at, 'track key must be a non-empty canonical song ID')
      continue
    }
    if (!(canonicalSongIds instanceof Set) || !canonicalSongIds.has(songId)) {
      add(at, 'song ID does not exist in the canonical catalogue')
    }
    if (!isPlainObject(entry)) {
      add(at, 'must be an object')
      continue
    }

    for (const field of unknownFields(entry, TRACK_FIELDS)) {
      add(at, `unknown field ${JSON.stringify(field)}`)
    }

    const audio = parseHttpsUrl(entry.audioUrl)
    if (!audio) {
      add(`${at}.audioUrl`, 'must be an absolute HTTPS URL')
    } else {
      if (isBlockedConsumerProviderUrl(entry.audioUrl)) {
        add(`${at}.audioUrl`, 'consumer/provider stream URLs are not executable direct media')
      }
      const normalisedAudio = audio.href
      const previousSong = mediaOwners.get(normalisedAudio)
      if (previousSong && previousSong !== songId) {
        add(`${at}.audioUrl`, `duplicates direct media already assigned to ${previousSong}`)
      } else {
        mediaOwners.set(normalisedAudio, songId)
      }
    }

    if (!ALLOWED_AUDIO_MIME_TYPES.has(String(entry.mimeType || '').toLowerCase())) {
      add(`${at}.mimeType`, `must be one of: ${[...ALLOWED_AUDIO_MIME_TYPES].join(', ')}`)
    }

    if (!isPlainObject(entry.rights)) {
      add(`${at}.rights`, 'must be an object')
      continue
    }

    for (const field of unknownFields(entry.rights, RIGHTS_FIELDS)) {
      add(`${at}.rights`, `unknown field ${JSON.stringify(field)}`)
    }

    const rights = entry.rights
    if (rights.redistributionAuthorized !== true) {
      add(`${at}.rights.redistributionAuthorized`, 'must be exactly true')
    }
    if (!nonEmptyString(rights.rightsHolder)) {
      add(`${at}.rights.rightsHolder`, 'must name the rights holder or authorised licensor')
    }
    if (!nonEmptyString(rights.licenseName)) {
      add(`${at}.rights.licenseName`, 'must identify the licence or explicit permission')
    }

    const proof = parseHttpsUrl(rights.proofUrl)
    if (!proof) {
      add(`${at}.rights.proofUrl`, 'must be an absolute HTTPS evidence URL')
    } else {
      if (audio && sameHttpResourceIgnoringFragment(proof, audio)) {
        add(`${at}.rights.proofUrl`, 'must be rights evidence, not the media URL itself')
      }
      const contract = `${String(rights.rightsHolder || '').trim()}\u0000${String(rights.licenseName || '').trim()}`
      const previousContract = proofContracts.get(proof.href)
      if (previousContract && previousContract !== contract) {
        add(`${at}.rights.proofUrl`, 'reuses one proof URL with conflicting rights-holder/licence claims')
      } else if (contract !== '\u0000') {
        proofContracts.set(proof.href, contract)
      }
    }
  }

  return errors
}

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, 'utf8'))
}

export async function loadCanonicalSongIds(repoRoot) {
  const indexPath = path.join(repoRoot, 'data/catalogue/index.json')
  const index = await readJson(indexPath)
  if (!Array.isArray(index.songChunks) || index.songChunks.length === 0) {
    throw new Error('data/catalogue/index.json has no songChunks')
  }

  const ids = new Set()
  for (const relativePath of index.songChunks) {
    if (!nonEmptyString(relativePath)) throw new Error('catalogue song chunk path is invalid')
    const chunk = await readJson(path.join(repoRoot, relativePath))
    if (!Array.isArray(chunk)) throw new Error(`${relativePath} must contain a song array`)
    for (const song of chunk) {
      if (!isPlainObject(song) || !nonEmptyString(song.id)) {
        throw new Error(`${relativePath} contains a song without a stable id`)
      }
      if (ids.has(song.id)) throw new Error(`duplicate canonical song id: ${song.id}`)
      ids.add(song.id)
    }
  }
  return ids
}

export async function validateProductionDirectAudio(repoRoot) {
  const [manifest, songIds] = await Promise.all([
    readJson(path.join(repoRoot, 'data/direct-audio.json')),
    loadCanonicalSongIds(repoRoot),
  ])
  return validateDirectAudioManifest(manifest, songIds)
}

async function main() {
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
  const errors = await validateProductionDirectAudio(repoRoot)
  if (errors.length > 0) {
    console.error(`Direct-audio rights validation failed (${errors.length} error${errors.length === 1 ? '' : 's'}):`)
    for (const error of errors) console.error(`- ${error}`)
    process.exitCode = 1
    return
  }
  console.log('Direct-audio rights validation passed.')
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`Direct-audio rights validation crashed: ${error instanceof Error ? error.message : String(error)}`)
    process.exitCode = 1
  })
}
