import { MAX_BODY_BYTES, PRESENCE_EVENT, SCHEMA_VERSION } from './lib/constants.js'
import { eventDataPoint, normaliseForStorage, presenceDataPoint } from './lib/analytics.js'
import { hmacPseudonym } from './lib/crypto.js'
import { corsHeaders, json } from './lib/http.js'
import { normalizeEdgeDimensions, validateBatch } from './lib/validation.js'

const DEFAULT_ORIGIN = 'https://playgarba.com'
const encoder = new TextEncoder()

function errorResponse(code, status, origin, allowedOrigin) {
  return json(
    { error: code },
    { status, headers: corsHeaders(origin, allowedOrigin) },
  )
}

function edgeRateLimitRequired(env) {
  return String(env.EDGE_RATE_LIMIT_REQUIRED || '').toLowerCase() === 'true'
}

function requiredBindings(env) {
  const edgeLimiterReady = !edgeRateLimitRequired(env) ||
    (env.EDGE_RATE_LIMITER && typeof env.EDGE_RATE_LIMITER.limit === 'function')
  return Boolean(
    env.PGA_HMAC_SECRET &&
    env.EVENTS && typeof env.EVENTS.writeDataPoint === 'function' &&
    env.PRESENCE && typeof env.PRESENCE.writeDataPoint === 'function' &&
    env.BROWSER_RATE_LIMITER && typeof env.BROWSER_RATE_LIMITER.limit === 'function' &&
    edgeLimiterReady,
  )
}

async function readJsonBody(request) {
  const declaredLength = Number(request.headers.get('content-length') || 0)
  if (declaredLength > MAX_BODY_BYTES) throw new Error('body_too_large')

  let text = ''
  if (request.body && typeof request.body.getReader === 'function') {
    const reader = request.body.getReader()
    const decoder = new TextDecoder()
    let received = 0
    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        const bytes = value instanceof Uint8Array ? value : new Uint8Array(value || 0)
        received += bytes.byteLength
        if (received > MAX_BODY_BYTES) {
          try { await reader.cancel('body_too_large') } catch { /* best-effort upstream cancellation */ }
          throw new Error('body_too_large')
        }
        text += decoder.decode(bytes, { stream: true })
      }
      text += decoder.decode()
    } finally {
      try { reader.releaseLock?.() } catch { /* already released or cancelled */ }
    }
  } else {
    text = await request.text()
    if (encoder.encode(text).byteLength > MAX_BODY_BYTES) throw new Error('body_too_large')
  }

  try {
    return JSON.parse(text)
  } catch {
    throw new Error('invalid_json')
  }
}

export async function handleIngest(request, env, options = {}) {
  const url = new URL(request.url)
  const allowedOrigin = env.PUBLIC_ORIGIN || DEFAULT_ORIGIN
  const origin = request.headers.get('origin') || ''

  if (url.pathname !== '/v1/events') return json({ error: 'not_found' }, { status: 404 })

  if (request.method === 'OPTIONS') {
    if (origin !== allowedOrigin) return json({ error: 'origin_not_allowed' }, { status: 403 })
    return new Response(null, { status: 204, headers: corsHeaders(origin, allowedOrigin) })
  }

  if (request.method !== 'POST') return errorResponse('method_not_allowed', 405, origin, allowedOrigin)
  if (origin !== allowedOrigin) return errorResponse('origin_not_allowed', 403, origin, allowedOrigin)
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) {
    return errorResponse('content_type_required', 415, origin, allowedOrigin)
  }
  if (!requiredBindings(env)) return errorResponse('ingestion_config_missing', 503, origin, allowedOrigin)

  const edgeLimiter = env.EDGE_RATE_LIMITER
  const edgeRequired = edgeRateLimitRequired(env)
  const edgeAddress = request.headers.get('cf-connecting-ip')?.trim() || ''
  if (edgeRequired && !edgeAddress) {
    console.error('pga_ingest_edge_identity_missing')
    return errorResponse('edge_identity_missing', 503, origin, allowedOrigin)
  }

  try {
    if (edgeLimiter && edgeAddress) {
      const edgePseudonym = await hmacPseudonym(env.PGA_HMAC_SECRET, edgeAddress, 'ingest-rate-edge:')
      const edgeRate = await edgeLimiter.limit({ key: `edge:${edgePseudonym}` })
      if (!edgeRate?.success) {
        console.warn('pga_ingest_rate_limited', { scope: 'edge' })
        return errorResponse('rate_limited', 429, origin, allowedOrigin)
      }
    }
  } catch {
    console.error('pga_ingest_rate_limit_failed')
    return errorResponse('rate_limit_unavailable', 503, origin, allowedOrigin)
  }

  let body
  let events
  try {
    body = await readJsonBody(request)
    events = validateBatch(body, { nowMs: options.nowMs ?? Date.now() })
  } catch (error) {
    const code = error instanceof Error ? error.message : 'invalid_request'
    const status = code === 'body_too_large' ? 413 : 400
    console.warn('pga_ingest_rejected', { reason: code })
    return errorResponse(code, status, origin, allowedOrigin)
  }

  try {
    const browserRate = await env.BROWSER_RATE_LIMITER.limit({ key: events[0].browserId })
    if (!browserRate?.success) {
      console.warn('pga_ingest_rate_limited', { scope: 'browser' })
      return errorResponse('rate_limited', 429, origin, allowedOrigin)
    }
  } catch {
    console.error('pga_ingest_rate_limit_failed')
    return errorResponse('rate_limit_unavailable', 503, origin, allowedOrigin)
  }

  const edge = normalizeEdgeDimensions(request)
  try {
    for (const event of events) {
      const stored = await normaliseForStorage(event, env, edge, options.nowMs ?? Date.now())
      if (event.eventName === PRESENCE_EVENT) env.PRESENCE.writeDataPoint(presenceDataPoint(stored))
      else env.EVENTS.writeDataPoint(eventDataPoint(stored))
    }
  } catch (error) {
    console.error('pga_ingest_write_failed', {
      reason: error instanceof Error ? error.message : 'unknown',
    })
    return errorResponse('ingestion_unavailable', 503, origin, allowedOrigin)
  }

  return json(
    { accepted: events.length, schemaVersion: SCHEMA_VERSION },
    { status: 202, headers: corsHeaders(origin, allowedOrigin) },
  )
}

export default {
  fetch(request, env) {
    return handleIngest(request, env)
  },
}
