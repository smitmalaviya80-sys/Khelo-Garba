import assert from 'node:assert/strict'
import { webcrypto } from 'node:crypto'
import { readFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

if (!globalThis.crypto) globalThis.crypto = webcrypto

import { handleAdmin } from '../../src/pga/backend/admin-worker.js'
import { handleIngest } from '../../src/pga/backend/ingest-worker.js'
import { MAX_BODY_BYTES } from '../../src/pga/backend/lib/constants.js'
import { resetJwksCacheForTests, verifyAccessJwt } from '../../src/pga/backend/lib/crypto.js'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const NOW = Date.parse('2026-09-09T20:00:00Z')
const TEXT_EXTENSIONS = new Set(['.html', '.js', '.mjs', '.css', '.json', '.webmanifest', '.txt', '.xml', '.md'])
const SECRET_MARKERS = [
  'PGA_HMAC_SECRET',
  'CF_ACCESS_CLIENT_SECRET',
  'CLOUDFLARE_ACCESS_CLIENT_SECRET',
]

let failed = false
let checks = 0

async function check(name, fn) {
  checks += 1
  try {
    await fn()
    console.log(`✓ ${name}`)
  } catch (error) {
    failed = true
    console.error(`✗ ${name}`)
    console.error(`  ${error instanceof Error ? error.message : String(error)}`)
  }
}

function baseEvent(overrides = {}) {
  return {
    schema_version: 1,
    event_name: 'session_started',
    event_id: 'event-1',
    occurred_at: NOW,
    browser_id: 'browser-1',
    session_id: 'session-1',
    tab_id: 'tab-1',
    surface: 'player',
    display_mode: 'browser',
    entry_point: 'player',
    ...overrides,
  }
}

function base64url(value) {
  return Buffer.from(value).toString('base64url')
}

async function rsaPair() {
  return crypto.subtle.generateKey(
    {
      name: 'RSASSA-PKCS1-v1_5',
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: 'SHA-256',
    },
    true,
    ['sign', 'verify'],
  )
}

async function accessFixture({ payload = {}, signingPair = null, trustedPair = null } = {}) {
  resetJwksCacheForTests()
  const trusted = trustedPair || await rsaPair()
  const signer = signingPair || trusted
  const publicJwk = await crypto.subtle.exportKey('jwk', trusted.publicKey)
  publicJwk.kid = 'pga-security-test-key'
  publicJwk.alg = 'RS256'
  const teamDomain = 'https://example.cloudflareaccess.com'
  const headerPart = base64url(JSON.stringify({ alg: 'RS256', kid: publicJwk.kid, typ: 'JWT' }))
  const payloadPart = base64url(JSON.stringify({
    iss: teamDomain,
    aud: ['pga-aud'],
    exp: Math.floor(NOW / 1000) + 600,
    iat: Math.floor(NOW / 1000),
    sub: 'founder',
    type: 'app',
    ...payload,
  }))
  const signingInput = `${headerPart}.${payloadPart}`
  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    signer.privateKey,
    new TextEncoder().encode(signingInput),
  )
  const token = `${signingInput}.${Buffer.from(signature).toString('base64url')}`
  const env = { TEAM_DOMAIN: teamDomain, POLICY_AUD: 'pga-aud' }
  const fetchImpl = async () => Response.json({ keys: [publicJwk] })
  return { token, env, fetchImpl }
}

function requestWithJwt(token, pathname = '/api/live') {
  return new Request(`https://pga.playgarba.com${pathname}`, {
    headers: { 'cf-access-jwt-assertion': token },
  })
}

function ingestEnv({ rateSuccess = true } = {}) {
  return {
    PGA_HMAC_SECRET: 'test-only-secret',
    EVENTS: { writeDataPoint() {} },
    PRESENCE: { writeDataPoint() {} },
    BROWSER_RATE_LIMITER: { limit: async () => ({ success: rateSuccess }) },
  }
}

function ingestRequest({
  origin = 'https://playgarba.com',
  contentType = 'application/json',
  body = JSON.stringify([baseEvent()]),
  method = 'POST',
} = {}) {
  const headers = { origin }
  if (contentType) headers['content-type'] = contentType
  return new Request('https://events.playgarba.com/v1/events', {
    method,
    headers,
    body: method === 'POST' ? body : undefined,
  })
}

async function walkTextFiles(relativeRoot) {
  const root = path.join(ROOT, relativeRoot)
  const results = []
  async function walk(current) {
    let entries
    try {
      entries = await readdir(current, { withFileTypes: true })
    } catch (error) {
      if (error?.code === 'ENOENT') return
      throw error
    }
    for (const entry of entries) {
      const absolute = path.join(current, entry.name)
      if (entry.isDirectory()) {
        await walk(absolute)
        continue
      }
      if (!entry.isFile() || !TEXT_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) continue
      results.push({
        path: path.relative(ROOT, absolute).split(path.sep).join('/'),
        content: await readFile(absolute, 'utf8'),
      })
    }
  }
  await walk(root)
  return results
}

async function read(relativePath) {
  return readFile(path.join(ROOT, relativePath), 'utf8')
}

function assertPrivateHeaders(response) {
  assert.equal(response.headers.get('cache-control'), 'no-store')
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff')
  assert.equal(response.headers.get('referrer-policy'), 'no-referrer')
  const permissions = response.headers.get('permissions-policy') || ''
  assert.match(permissions, /camera=\(\)/)
  assert.match(permissions, /microphone=\(\)/)
  assert.match(permissions, /geolocation=\(\)/)
}

await check('Access verifier rejects a missing assertion', async () => {
  resetJwksCacheForTests()
  const result = await verifyAccessJwt(new Request('https://pga.playgarba.com/api/live'), {
    TEAM_DOMAIN: 'https://example.cloudflareaccess.com',
    POLICY_AUD: 'pga-aud',
  }, { nowMs: NOW })
  assert.deepEqual(result, { ok: false, reason: 'missing_access_jwt' })
})

await check('Access verifier rejects malformed assertions', async () => {
  resetJwksCacheForTests()
  const request = requestWithJwt('not-a-jwt')
  const result = await verifyAccessJwt(request, {
    TEAM_DOMAIN: 'https://example.cloudflareaccess.com',
    POLICY_AUD: 'pga-aud',
  }, { nowMs: NOW })
  assert.equal(result.ok, false)
  assert.equal(result.reason, 'malformed_access_jwt')
})

await check('Access verifier rejects expired assertions', async () => {
  const fixture = await accessFixture({ payload: { exp: Math.floor(NOW / 1000) - 1 } })
  const result = await verifyAccessJwt(requestWithJwt(fixture.token), fixture.env, {
    nowMs: NOW,
    fetchImpl: fixture.fetchImpl,
  })
  assert.deepEqual(result, { ok: false, reason: 'expired' })
})

await check('Access verifier rejects wrong-audience assertions', async () => {
  const fixture = await accessFixture({ payload: { aud: ['different-app'] } })
  const result = await verifyAccessJwt(requestWithJwt(fixture.token), fixture.env, {
    nowMs: NOW,
    fetchImpl: fixture.fetchImpl,
  })
  assert.deepEqual(result, { ok: false, reason: 'invalid_audience' })
})

await check('Access verifier rejects wrong-issuer assertions', async () => {
  const fixture = await accessFixture({ payload: { iss: 'https://other.cloudflareaccess.com' } })
  const result = await verifyAccessJwt(requestWithJwt(fixture.token), fixture.env, {
    nowMs: NOW,
    fetchImpl: fixture.fetchImpl,
  })
  assert.deepEqual(result, { ok: false, reason: 'invalid_issuer' })
})

await check('Access verifier rejects a forged RS256 signature', async () => {
  const trustedPair = await rsaPair()
  const attackerPair = await rsaPair()
  const fixture = await accessFixture({ trustedPair, signingPair: attackerPair })
  const result = await verifyAccessJwt(requestWithJwt(fixture.token), fixture.env, {
    nowMs: NOW,
    fetchImpl: fixture.fetchImpl,
  })
  assert.equal(result.ok, false)
  assert.equal(result.reason, 'invalid_signature')
})

await check('Admin API denies missing Access auth with private no-store headers', async () => {
  const response = await handleAdmin(new Request('https://pga.playgarba.com/api/live'), {
    TEAM_DOMAIN: 'https://example.cloudflareaccess.com',
    POLICY_AUD: 'pga-aud',
  }, { nowMs: NOW })
  assert.equal(response.status, 401)
  assertPrivateHeaders(response)
})

await check('Admin API accepts a valid assertion and keeps private security headers', async () => {
  const fixture = await accessFixture()
  const response = await handleAdmin(requestWithJwt(fixture.token), fixture.env, {
    nowMs: NOW,
    fetchImpl: fixture.fetchImpl,
    queryAnalytics: async () => [{
      live_now: 3,
      listening_now: 2,
      browsing_now: 1,
      data_through_ms: NOW,
      max_sample_interval: 1,
    }],
  })
  assert.equal(response.status, 200)
  assertPrivateHeaders(response)
  const body = await response.json()
  assert.equal(body.data.liveNow.value, 3)
})

await check('Ingestion rejects a foreign origin without reflecting it through CORS', async () => {
  const response = await handleIngest(ingestRequest({ origin: 'https://evil.example' }), ingestEnv(), { nowMs: NOW })
  assert.equal(response.status, 403)
  assert.equal(response.headers.get('access-control-allow-origin'), null)
})

await check('Ingestion rejects malformed JSON', async () => {
  const response = await handleIngest(ingestRequest({ body: '{not-json' }), ingestEnv(), { nowMs: NOW })
  assert.equal(response.status, 400)
  assert.equal((await response.json()).error, 'invalid_json')
})

await check('Ingestion rejects non-JSON content types', async () => {
  const response = await handleIngest(ingestRequest({ contentType: 'text/plain' }), ingestEnv(), { nowMs: NOW })
  assert.equal(response.status, 415)
  assert.equal((await response.json()).error, 'content_type_required')
})

await check('Ingestion rejects oversized request bodies', async () => {
  const response = await handleIngest(ingestRequest({ body: 'x'.repeat(MAX_BODY_BYTES + 1) }), ingestEnv(), { nowMs: NOW })
  assert.equal(response.status, 413)
  assert.equal((await response.json()).error, 'body_too_large')
})

await check('Ingestion rejects unknown event fields', async () => {
  const body = JSON.stringify([baseEvent({ secret_extra: 'reject-me' })])
  const response = await handleIngest(ingestRequest({ body }), ingestEnv(), { nowMs: NOW })
  assert.equal(response.status, 400)
  assert.match((await response.json()).error, /^unknown_key:/)
})

await check('Ingestion fails closed when browser rate limiting rejects the request', async () => {
  const response = await handleIngest(ingestRequest(), ingestEnv({ rateSuccess: false }), { nowMs: NOW })
  assert.equal(response.status, 429)
  assert.equal((await response.json()).error, 'rate_limited')
})

await check('PGA shell is explicitly noindex, nofollow and noarchive', async () => {
  const html = await read('src/pga/app/index.html')
  const robots = html.match(/<meta\s+name=["']robots["']\s+content=["']([^"']+)["']/i)?.[1] || ''
  const tokens = new Set(robots.toLowerCase().split(',').map((token) => token.trim()).filter(Boolean))
  for (const token of ['noindex', 'nofollow', 'noarchive']) assert.ok(tokens.has(token), `missing robots token ${token}`)
})

await check('PGA shell contains no inline executable config or server-secret markers', async () => {
  const files = await walkTextFiles('src/pga/app')
  const html = files.find((file) => file.path === 'src/pga/app/index.html')?.content || ''
  const inlineScripts = [...html.matchAll(/<script\b(?![^>]*\bsrc\s*=)[^>]*>([\s\S]*?)<\/script>/gi)]
  assert.equal(inlineScripts.filter((match) => match[1].trim()).length, 0, 'PGA index contains an inline executable script')
  for (const file of files) {
    for (const marker of SECRET_MARKERS) {
      assert.ok(!file.content.includes(marker), `${file.path} exposes server marker ${marker}`)
    }
    assert.ok(!/sourceMappingURL/i.test(file.content), `${file.path} references a source map`)
  }
})

await check('PGA browser scripts avoid unreviewed raw-HTML injection primitives', async () => {
  const files = (await walkTextFiles('src/pga/app')).filter((file) => /\.m?js$/i.test(file.path))
  const prohibited = [
    [/\.innerHTML\s*=/, 'innerHTML assignment'],
    [/insertAdjacentHTML\s*\(/, 'insertAdjacentHTML'],
    [/document\.write\s*\(/, 'document.write'],
  ]
  for (const file of files) {
    for (const [pattern, label] of prohibited) {
      assert.ok(!pattern.test(file.content), `${file.path} uses ${label}`)
    }
  }
})

await check('Public PlayGarba assets do not advertise PGA or expose PGA server-secret markers', async () => {
  const roots = ['public-site', 'assets/runtime', 'src/catalogue']
  const files = []
  for (const root of roots) files.push(...await walkTextFiles(root))
  for (const relative of [
    'index.html',
    'app.js',
    'simple-runtime.js',
    'provider-runtime.js',
    'player-continuity.js',
    'youtube-player-runtime.js',
    'nonstop-browser.js',
    'manifest.webmanifest',
    'robots.txt',
    'sitemap.xml',
  ]) {
    try {
      files.push({ path: relative, content: await read(relative) })
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error
    }
  }
  for (const file of files) {
    assert.ok(!/pga\.playgarba\.com/i.test(file.content), `${file.path} exposes the private PGA hostname`)
    for (const marker of SECRET_MARKERS) {
      assert.ok(!file.content.includes(marker), `${file.path} exposes server marker ${marker}`)
    }
  }
})

await check('Public sitemap and robots files do not publish a PGA route', async () => {
  for (const relative of ['sitemap.xml', 'robots.txt']) {
    const content = await read(relative)
    assert.ok(!/pga\.playgarba\.com/i.test(content), `${relative} exposes the PGA hostname`)
    assert.ok(!/(?:^|[\s"'>])\/pga(?:\/|[\s"'<]|$)/im.test(content), `${relative} publishes a /pga route`)
  }
})

await check('Security contract preserves the external-verification boundary and emergency procedure', async () => {
  const security = await read('src/pga/security/SECURITY.md')
  for (const marker of [
    'Repository-verified controls',
    'external / blocked',
    'Emergency lockout and revocation',
    'Deployment verification checklist',
    'Dependency / supply-chain statement',
  ]) {
    assert.ok(security.includes(marker), `security contract missing ${marker}`)
  }
})

if (failed) {
  console.error(`\nPGA security validation failed (${checks} checks).`)
  process.exit(1)
}

console.log(`\nPGA security validation passed (${checks} checks).`)
console.log('Repository controls are verified; Cloudflare Access/DNS/production header configuration remains external until live-tested.')
