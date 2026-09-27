const encoder = new TextEncoder()

function base64UrlToBytes(value) {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/')
  const padded = normalized + '='.repeat((4 - (normalized.length % 4 || 4)) % 4)
  const binary = atob(padded)
  return Uint8Array.from(binary, (char) => char.charCodeAt(0))
}
function bytesToHex(bytes) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
}
function decodeJwtPart(value) {
  return JSON.parse(new TextDecoder().decode(base64UrlToBytes(value)))
}
export async function hmacPseudonym(secret, value, prefix = '') {
  if (!secret || typeof secret !== 'string') throw new Error('PGA_HMAC_SECRET is required')
  if (!value || typeof value !== 'string') return null
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const signed = await crypto.subtle.sign('HMAC', key, encoder.encode(`${prefix}${value}`))
  return bytesToHex(new Uint8Array(signed)).slice(0, 32)
}
let jwksCache = null
let jwksCacheAt = 0
const JWKS_TTL_MS = 5 * 60 * 1000
async function getJwks(teamDomain, fetchImpl, nowMs) {
  if (jwksCache && nowMs - jwksCacheAt < JWKS_TTL_MS) return jwksCache
  const response = await fetchImpl(`${teamDomain.replace(/\/$/, '')}/cdn-cgi/access/certs`, { headers: { accept: 'application/json' } })
  if (!response.ok) throw new Error(`Access JWKS fetch failed: ${response.status}`)
  const body = await response.json()
  if (!body || !Array.isArray(body.keys)) throw new Error('Access JWKS response is invalid')
  jwksCache = body.keys
  jwksCacheAt = nowMs
  return jwksCache
}
function audienceMatches(aud, expected) {
  return Array.isArray(aud) ? aud.includes(expected) : aud === expected
}
export async function verifyAccessJwt(request, env, options = {}) {
  const token = request.headers.get('cf-access-jwt-assertion')
  if (!token) return { ok: false, reason: 'missing_access_jwt' }
  if (!env.TEAM_DOMAIN || !env.POLICY_AUD) return { ok: false, reason: 'access_config_missing' }
  const parts = token.split('.')
  if (parts.length !== 3) return { ok: false, reason: 'malformed_access_jwt' }
  let header, payload
  try {
    header = decodeJwtPart(parts[0])
    payload = decodeJwtPart(parts[1])
  } catch {
    return { ok: false, reason: 'malformed_access_jwt' }
  }
  if (header.alg !== 'RS256' || !header.kid) return { ok: false, reason: 'unsupported_access_jwt' }
  const nowMs = options.nowMs ?? Date.now()
  const nowSec = Math.floor(nowMs / 1000)
  const expectedIssuer = env.TEAM_DOMAIN.replace(/\/$/, '')
  if (payload.iss !== expectedIssuer) return { ok: false, reason: 'invalid_issuer' }
  if (!audienceMatches(payload.aud, env.POLICY_AUD)) return { ok: false, reason: 'invalid_audience' }
  if (payload.type !== 'app') return { ok: false, reason: 'invalid_token_type' }
  if (typeof payload.exp !== 'number' || payload.exp <= nowSec) return { ok: false, reason: 'expired' }
  if (typeof payload.nbf === 'number' && payload.nbf > nowSec + 30) return { ok: false, reason: 'not_yet_valid' }
  try {
    const fetchImpl = options.fetchImpl ?? fetch
    const keys = await getJwks(expectedIssuer, fetchImpl, nowMs)
    const jwk = keys.find((key) => key.kid === header.kid)
    if (!jwk) return { ok: false, reason: 'unknown_signing_key' }
    const publicKey = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify'])
    const valid = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', publicKey, base64UrlToBytes(parts[2]), encoder.encode(`${parts[0]}.${parts[1]}`))
    return valid ? { ok: true, payload } : { ok: false, reason: 'invalid_signature' }
  } catch {
    return { ok: false, reason: 'access_verification_failed' }
  }
}
export function resetJwksCacheForTests() {
  jwksCache = null
  jwksCacheAt = 0
}
