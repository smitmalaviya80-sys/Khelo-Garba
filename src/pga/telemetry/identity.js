import {
  BROWSER_STORAGE_KEY,
  BROWSER_TTL_MS,
  SESSION_STORAGE_KEY,
  SESSION_TTL_MS,
} from './constants.js'

function parseRecord(storage, key) {
  try {
    const raw = storage.getItem(key)
    if (!raw) return null
    const value = JSON.parse(raw)
    return value && typeof value === 'object' ? value : null
  } catch {
    storage.removeItem(key)
    return null
  }
}

function validId(value) {
  return typeof value === 'string' && /^[A-Za-z0-9._:-]{1,128}$/.test(value)
}

export function randomId(cryptoObj = globalThis.crypto) {
  if (!cryptoObj) throw new Error('crypto_unavailable')
  if (typeof cryptoObj.randomUUID === 'function') return cryptoObj.randomUUID()
  if (typeof cryptoObj.getRandomValues !== 'function') throw new Error('crypto_unavailable')
  const bytes = new Uint8Array(16)
  cryptoObj.getRandomValues(bytes)
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
}

export function getBrowserIdentity(storage, nowMs, cryptoObj = globalThis.crypto) {
  const existing = parseRecord(storage, BROWSER_STORAGE_KEY)
  if (
    existing &&
    validId(existing.id) &&
    Number.isFinite(existing.createdAtMs) &&
    nowMs >= existing.createdAtMs &&
    nowMs - existing.createdAtMs < BROWSER_TTL_MS
  ) {
    return { id: existing.id, createdAtMs: existing.createdAtMs, isNew: false }
  }

  const record = { id: randomId(cryptoObj), createdAtMs: nowMs }
  storage.setItem(BROWSER_STORAGE_KEY, JSON.stringify(record))
  return { ...record, isNew: true }
}

export function readActiveSession(storage, nowMs) {
  const existing = parseRecord(storage, SESSION_STORAGE_KEY)
  if (!sessionIsActive(existing, nowMs)) return null
  return { id: existing.id, lastActivityMs: existing.lastActivityMs, isNew: false }
}

export function getSessionIdentity(storage, nowMs, cryptoObj = globalThis.crypto, forceNew = false) {
  const existing = forceNew ? null : readActiveSession(storage, nowMs)
  if (existing) return existing

  const record = { id: randomId(cryptoObj), lastActivityMs: nowMs }
  storage.setItem(SESSION_STORAGE_KEY, JSON.stringify(record))
  return { ...record, isNew: true }
}

export function touchSession(storage, session, nowMs) {
  const touched = { id: session.id, lastActivityMs: nowMs, isNew: false }
  storage.setItem(SESSION_STORAGE_KEY, JSON.stringify({ id: touched.id, lastActivityMs: nowMs }))
  return touched
}

export function sessionIsActive(session, nowMs) {
  return Boolean(
    session &&
    validId(session.id) &&
    Number.isFinite(session.lastActivityMs) &&
    nowMs >= session.lastActivityMs &&
    nowMs - session.lastActivityMs < SESSION_TTL_MS
  )
}
