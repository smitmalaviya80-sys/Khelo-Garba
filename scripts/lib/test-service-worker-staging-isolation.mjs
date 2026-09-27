import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'

const ORIGIN = 'https://playgarba.example/'
const WORKER_URL = `${ORIGIN}sw.js`
const source = fs.readFileSync(new URL('../../sw.js', import.meta.url), 'utf8')
// Follow the worker's own cache generation so a version bump in sw.js keeps this test meaningful
const liveVersion = Number((source.match(/CACHE_NAME = `\$\{CACHE_PREFIX\}v(\d+)`/) || [])[1])
assert.ok(liveVersion > 1, 'sw.js must declare its live cache generation as garba-live-v<N>')
const PREVIOUS_LIVE_CACHE = `garba-live-v${liveVersion - 1}`
const LIVE_CACHE = `garba-live-v${liveVersion}`
const STAGING_CACHE = 'garba-live-staging'
const READY_URL = `${ORIGIN}__garba_staging_ready__`

class MockRequest {
  constructor(input) {
    this.url = new URL(typeof input === 'string' ? input : input.url, ORIGIN).toString()
    this.method = 'GET'
    this.mode = 'same-origin'
    this.destination = ''
  }
}

class MockResponse {
  constructor(body = '', options = {}) {
    this.body = String(body ?? '')
    this.status = options.status ?? 200
    this.ok = this.status >= 200 && this.status < 300
    this.headers = options.headers ?? {}
  }

  clone() {
    return new MockResponse(this.body, { status: this.status, headers: this.headers })
  }

  static error() {
    return new MockResponse('', { status: 500 })
  }
}

function requestUrl(input) {
  return new URL(typeof input === 'string' ? input : input.url, ORIGIN).toString()
}

class MockCache {
  constructor(name, storage) {
    this.name = name
    this.storage = storage
    this.entries = new Map()
  }

  async addAll(requests) {
    this.storage.operations.push(`addAll:start:${this.name}`)
    if (this.storage.failNextAddAll) {
      this.storage.failNextAddAll = false
      if (requests.length) {
        const url = requestUrl(requests[0])
        this.entries.set(url, new MockResponse(`partial:${url}`))
        this.storage.operations.push(`put:${this.name}:${url}`)
      }
      this.storage.operations.push(`addAll:failed:${this.name}`)
      throw new Error('mock addAll failure')
    }

    for (const request of requests) {
      const url = requestUrl(request)
      this.entries.set(url, new MockResponse(`shell:${url}`))
      this.storage.operations.push(`put:${this.name}:${url}`)
    }
    this.storage.operations.push(`addAll:complete:${this.name}`)
  }

  async put(request, response) {
    const url = requestUrl(request)
    if (this.storage.failNextPutCache === this.name) {
      this.storage.failNextPutCache = null
      this.storage.operations.push(`put:failed:${this.name}:${url}`)
      throw new Error('mock put failure')
    }
    this.entries.set(url, response.clone ? response.clone() : response)
    this.storage.operations.push(`put:${this.name}:${url}`)
  }

  async match(request) {
    const value = this.entries.get(requestUrl(request))
    return value?.clone ? value.clone() : value
  }

  async keys() {
    return [...this.entries.keys()].map((url) => new MockRequest(url))
  }
}

class MockCacheStorage {
  constructor() {
    this.caches = new Map()
    this.operations = []
    this.failNextAddAll = false
    this.failNextPutCache = null
  }

  async open(name) {
    if (!this.caches.has(name)) this.caches.set(name, new MockCache(name, this))
    return this.caches.get(name)
  }

  async delete(name) {
    const existed = this.caches.delete(name)
    this.operations.push(`delete:${name}:${existed}`)
    return existed
  }

  async match(request) {
    for (const cache of this.caches.values()) {
      const matched = await cache.match(request)
      if (matched) return matched
    }
    return null
  }

  async keys() {
    return [...this.caches.keys()]
  }

  snapshot(name) {
    const cache = this.caches.get(name)
    if (!cache) return null
    return [...cache.entries.entries()].map(([url, response]) => [url, response.body])
  }
}

function createWorker(caches, fetchImpl = async () => new MockResponse('network')) {
  const handlers = new Map()
  const state = { skipWaitingCalls: 0, claimCalls: 0 }
  const self = {
    location: { href: WORKER_URL, origin: ORIGIN.slice(0, -1) },
    addEventListener(type, handler) {
      handlers.set(type, handler)
    },
    async skipWaiting() {
      state.skipWaitingCalls += 1
    },
    clients: {
      async claim() {
        state.claimCalls += 1
      },
    },
  }

  vm.runInNewContext(source, {
    self,
    caches,
    URL,
    Response: MockResponse,
    fetch: fetchImpl,
    console,
    Promise,
    setTimeout,
    clearTimeout,
  }, { filename: 'sw.js' })

  return { handlers, state }
}

async function dispatch(handler, event = {}) {
  let pending = null
  handler({
    ...event,
    waitUntil(value) {
      pending = Promise.resolve(value)
    },
  })
  if (pending) await pending
}

async function install(worker) {
  return dispatch(worker.handlers.get('install'))
}

async function activate(worker) {
  return dispatch(worker.handlers.get('activate'))
}

{
  const caches = new MockCacheStorage()
  const previousLive = await caches.open(PREVIOUS_LIVE_CACHE)
  await previousLive.put('./previous-shell.js', new MockResponse('previous-live'))
  const beforePreviousLive = caches.snapshot(PREVIOUS_LIVE_CACHE)

  const first = createWorker(caches)
  await install(first)

  const staged = caches.snapshot(STAGING_CACHE)
  assert.ok(staged && staged.length > 2, 'first install should stage the complete shell plus readiness')
  assert.ok(staged.some(([url]) => url === READY_URL), 'readiness sentinel must exist after successful precache')
  assert.deepEqual(caches.snapshot(PREVIOUS_LIVE_CACHE), beforePreviousLive, 'install must not mutate the active live generation')

  const addAllComplete = caches.operations.indexOf(`addAll:complete:${STAGING_CACHE}`)
  const readinessPut = caches.operations.indexOf(`put:${STAGING_CACHE}:${READY_URL}`)
  assert.ok(addAllComplete >= 0 && readinessPut > addAllComplete, 'readiness sentinel must be written only after addAll succeeds')

  const beforeSecondInstall = caches.snapshot(STAGING_CACHE)
  const second = createWorker(caches)
  await assert.rejects(() => install(second), /completed staged shell is already waiting/i)
  assert.deepEqual(caches.snapshot(STAGING_CACHE), beforeSecondInstall, 'a later installer must not delete or overwrite a completed stage')

  const stagedShellCount = beforeSecondInstall.filter(([url]) => url !== READY_URL).length
  await activate(first)
  assert.equal(caches.snapshot(STAGING_CACHE), null, 'staging cache should be removed only after promotion completes')
  const live = caches.snapshot(LIVE_CACHE)
  assert.equal(live.length, stagedShellCount, 'activation should promote every staged shell entry')
  assert.ok(!live.some(([url]) => url === READY_URL), 'readiness sentinel must never be copied into the live cache')
  assert.equal(caches.snapshot(PREVIOUS_LIVE_CACHE), null, 'previous live generation should retire only after successful promotion')
  const lastLivePut = caches.operations.reduce((last, operation, index) => operation.startsWith(`put:${LIVE_CACHE}:`) ? index : last, -1)
  const previousDelete = caches.operations.indexOf(`delete:${PREVIOUS_LIVE_CACHE}:true`)
  assert.ok(lastLivePut >= 0 && previousDelete > lastLivePut, 'previous live generation must not be deleted before the incoming generation is complete')
  assert.equal(first.state.claimCalls, 1, 'successful activation should claim clients')

  const third = createWorker(caches)
  await install(third)
  assert.ok(caches.snapshot(STAGING_CACHE).some(([url]) => url === READY_URL), 'a later worker may stage after activation removes the previous stage')
}

{
  const caches = new MockCacheStorage()
  caches.failNextAddAll = true
  const worker = createWorker(caches)
  await assert.rejects(() => install(worker), /mock addAll failure/)
  assert.equal(caches.snapshot(STAGING_CACHE), null, 'failed precache must clean its incomplete staging cache')
}

{
  const caches = new MockCacheStorage()
  const previousLive = await caches.open(PREVIOUS_LIVE_CACHE)
  await previousLive.put('./preserve-me.js', new MockResponse('live-before'))
  const staged = await caches.open(STAGING_CACHE)
  await staged.put('./partial.js', new MockResponse('partial-stage'))
  const beforePreviousLive = caches.snapshot(PREVIOUS_LIVE_CACHE)

  const worker = createWorker(caches)
  await assert.rejects(() => activate(worker), /incomplete staged shell/i)
  assert.deepEqual(caches.snapshot(PREVIOUS_LIVE_CACHE), beforePreviousLive, 'activation without readiness must preserve the active live generation')
  assert.equal(caches.snapshot(LIVE_CACHE), null, 'activation without readiness must not create the incoming live generation')
  assert.ok(caches.snapshot(STAGING_CACHE), 'incomplete stage must remain intact when activation fails closed')
  assert.equal(worker.state.claimCalls, 0)
}

{
  const caches = new MockCacheStorage()
  const previousLive = await caches.open(PREVIOUS_LIVE_CACHE)
  await previousLive.put('./preserve-a.js', new MockResponse('live-a'))
  await previousLive.put('./preserve-b.js', new MockResponse('live-b'))
  const beforePreviousLive = caches.snapshot(PREVIOUS_LIVE_CACHE)

  const worker = createWorker(caches)
  await install(worker)
  const beforeStage = caches.snapshot(STAGING_CACHE)
  caches.failNextPutCache = LIVE_CACHE

  await assert.rejects(() => activate(worker), /mock put failure/)
  assert.deepEqual(caches.snapshot(PREVIOUS_LIVE_CACHE), beforePreviousLive, 'failed promotion must leave the active live generation byte-for-byte intact')
  assert.equal(caches.snapshot(LIVE_CACHE), null, 'failed promotion must remove the partial incoming live generation')
  assert.deepEqual(caches.snapshot(STAGING_CACHE), beforeStage, 'failed promotion must preserve the complete staged shell for diagnosis or retry')
  assert.equal(worker.state.claimCalls, 0, 'failed promotion must not claim clients')
}

{
  const caches = new MockCacheStorage()
  const worker = createWorker(caches)
  await install(worker)
  assert.equal(worker.state.skipWaitingCalls, 0, 'install must never call skipWaiting')
  await dispatch(worker.handlers.get('message'), { data: { type: 'SKIP_WAITING' } })
  assert.equal(worker.state.skipWaitingCalls, 1, 'SKIP_WAITING remains explicit-message-only')
}

{
  const caches = new MockCacheStorage()
  const previousLive = await caches.open(PREVIOUS_LIVE_CACHE)
  await previousLive.put('./already-live.js', new MockResponse('keep-me'))
  const beforePreviousLive = caches.snapshot(PREVIOUS_LIVE_CACHE)

  const worker = createWorker(caches)
  await install(worker)
  assert.deepEqual(caches.snapshot(PREVIOUS_LIVE_CACHE), beforePreviousLive, 'install must not mutate active live-cache contents')
}

async function dispatchFetch(worker, request) {
  let responsePromise = null
  const handler = worker.handlers.get('fetch')
  if (!handler) return null
  handler({
    request,
    respondWith(promise) {
      responsePromise = Promise.resolve(promise)
    },
  })
  return responsePromise
}

{
  const caches = new MockCacheStorage()
  const live = await caches.open(LIVE_CACHE)
  await live.put('./offline.html', new MockResponse('offline-shell-content'))
  const worker = createWorker(caches, async () => { throw new Error('offline') })
  const request = new MockRequest('https://playgarba.example/unknown-path')
  request.mode = 'navigate'
  const response = await dispatchFetch(worker, request)
  assert.ok(response, 'navigation under network and shell-cache failure must respond')
  assert.equal(response.body, 'offline-shell-content', 'navigation request must fallback to offline.html when network and primary shell miss')
}

{
  const caches = new MockCacheStorage()
  const live = await caches.open(LIVE_CACHE)
  await live.put('./offline.html', new MockResponse('offline-catalogue-fallback'))
  const worker = createWorker(caches, async () => { throw new Error('offline') })
  const request = new MockRequest('https://playgarba.example/explore/')
  request.mode = 'navigate'
  const response = await dispatchFetch(worker, request)
  assert.ok(response, 'catalogue navigation under network and shell-cache failure must respond')
  assert.equal(response.body, 'offline-catalogue-fallback', 'catalogue navigation must fallback to offline.html when network and explore shell miss')
}

console.log('service-worker staging isolation: ok')
