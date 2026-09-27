// Keep the service-worker contract covered by the production browser smoke suite.
const CACHE_PREFIX = 'garba-live-';
const CACHE_NAME = `${CACHE_PREFIX}v38`;
const STAGING_CACHE_NAME = `${CACHE_PREFIX}staging`;
const LEGACY_PREFIX = 'garba-shell-';
const STAGING_READY_URL = new URL('./__garba_staging_ready__', self.location.href).toString();

const CORE_SHELL = [
  './',
  './index.html',
  './styles.css',
  './simple-runtime.js',
  './provider-runtime.js',
  './player-continuity.js',
  './youtube-player-runtime.js',
  './nonstop-browser.js',
  './app.js',
  './explore/',
  './explore/index.html',
  './catalogue/catalogue.css',
  './catalogue/catalogue.js',
  './catalogue/listening-library.js',
  './assets/runtime/explore-search.js',
  './assets/runtime/immersive-atmosphere.js',
  './assets/runtime/immersive-view.js?v=20260926-4',
  './assets/runtime/morphicons.js',
  './assets/runtime/live-station.js',
  './assets/runtime/garba-circle.js',
  './assets/runtime/garba-circle-controller.js',
  './assets/runtime/qr-code.js',
  './assets/runtime/live-sync.js',
  './assets/runtime/sync-correction.js',
  './assets/runtime/playable-order.js',
  './assets/runtime/my-songs.js',
  './assets/audio/courtyard-night.ogg',
  './assets/audio/festival-crowd.ogg',
  './assets/audio/ground-applause.ogg',
  './assets/audio/rhythmic-clapping.ogg',
  './manifest.webmanifest',
  './offline.html',
  './favicon.ico',
  './assets/icons/browserconfig.xml',
  './assets/icons/icon.svg',
  './assets/icons/icon-192.png',
  './assets/icons/icon-512.png',
  './assets/icons/favicon-16.png',
  './assets/icons/favicon-32.png',
  './assets/icons/favicon-48.png',
  './assets/icons/apple-touch-icon.png',
  './assets/icons/apple-touch-icon-152.png',
  './assets/icons/apple-touch-icon-167.png',
  './assets/icons/mstile-150x150.png',
  './assets/icons/mstile-310x310.png',
  './assets/icons/maskable.svg',
  './assets/icons/maskable-192.png',
  './assets/icons/maskable-512.png',
  './assets/backgrounds/traditional.svg',
  './assets/backgrounds/dandiya.svg',
  './assets/backgrounds/devotional.svg',
  './assets/backgrounds/folk.svg',
  './assets/backgrounds/sanedo.svg',
  './assets/backgrounds/fusion.svg',
];

const FRESH_RUNTIME_SUFFIXES = [
  '/index.html',
  '/styles.css',
  '/simple-runtime.js',
  '/provider-runtime.js',
  '/player-continuity.js',
  '/youtube-player-runtime.js',
  '/nonstop-browser.js',
  '/app.js',
  '/catalogue/catalogue.css',
  '/catalogue/catalogue.js',
  '/catalogue/listening-library.js',
  '/assets/runtime/explore-search.js',
  '/assets/runtime/immersive-atmosphere.js',
  '/assets/runtime/immersive-view.js',
  '/assets/runtime/morphicons.js',
  '/assets/runtime/live-station.js',
  '/assets/runtime/garba-circle.js',
  '/assets/runtime/garba-circle-controller.js',
  '/assets/runtime/qr-code.js',
  '/assets/runtime/live-sync.js',
  '/assets/runtime/sync-correction.js',
  '/assets/runtime/playable-order.js',
  '/assets/runtime/my-songs.js',
];

async function stagingCacheExists() {
  return (await caches.keys()).includes(STAGING_CACHE_NAME);
}

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    if (await stagingCacheExists()) {
      const existing = await caches.open(STAGING_CACHE_NAME);
      const ready = await existing.match(STAGING_READY_URL);
      if (ready) throw new Error('A completed staged shell is already waiting for activation');
      throw new Error('An incomplete staged shell already exists; refusing to mutate another installer\'s stage');
    }

    const cache = await caches.open(STAGING_CACHE_NAME);
    try {
      await cache.addAll(CORE_SHELL);
      await cache.put(STAGING_READY_URL, new Response('ready', {
        headers: { 'content-type': 'text/plain; charset=utf-8' },
      }));
    } catch (error) {
      await caches.delete(STAGING_CACHE_NAME);
      throw error;
    }
  })());
});

self.addEventListener('message', (event) => {
  if (!event.data || event.data.type !== 'SKIP_WAITING') return;
  event.waitUntil((async () => {
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    if (!(await stagingCacheExists())) {
      throw new Error('Cannot activate without a staged shell');
    }

    const staged = await caches.open(STAGING_CACHE_NAME);
    const ready = await staged.match(STAGING_READY_URL);
    if (!ready) {
      throw new Error('Cannot activate an incomplete staged shell');
    }

    const stagedRequests = await staged.keys();
    const promotableRequests = stagedRequests.filter((request) => request.url !== STAGING_READY_URL);

    // CACHE_NAME is a new generation for this worker. Build it completely while
    // the previous worker's live generation remains available. If promotion
    // fails, remove only this incomplete incoming generation and keep staging
    // intact so the active worker never loses its complete offline shell.
    await caches.delete(CACHE_NAME);
    const live = await caches.open(CACHE_NAME);
    try {
      await Promise.all(promotableRequests.map(async (request) => {
        const response = await staged.match(request);
        if (response) await live.put(request, response);
      }));
    } catch (error) {
      await caches.delete(CACHE_NAME);
      throw error;
    }

    await caches.delete(STAGING_CACHE_NAME);

    const keys = await caches.keys();
    await Promise.all(keys
      .filter((key) => (key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME) || key.startsWith(LEGACY_PREFIX))
      .map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});

async function cacheFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) cache.put(request, response.clone());
  return response;
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);
  const network = fetch(request)
    .then((response) => {
      if (response.ok) cache.put(request, response.clone());
      return response;
    })
    .catch(() => null);
  return cached || await network || Response.error();
}

async function networkFirst(request, fallback = null) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const response = await fetch(request);
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch {
    const cached = await cache.match(request);
    if (cached) return cached;
    if (fallback) {
      const fallbackResponse = await cache.match(fallback);
      if (fallbackResponse) return fallbackResponse;
    }
    const offlineFallback = await cache.match('./offline.html') || (typeof caches.match === 'function' ? await caches.match('./offline.html') : null);
    if (offlineFallback) return offlineFallback;
    return Response.error();
  }
}

async function catalogueNavigation(request, fallback) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request) || await cache.match(fallback);
  const refresh = fetch(request)
    .then((response) => {
      if (response.ok) cache.put(request, response.clone());
      return response;
    })
    .catch(() => null);
  const offlineFallback = async () => await cache.match('./offline.html') || (typeof caches.match === 'function' ? await caches.match('./offline.html') : null);
  return cached || await refresh || await offlineFallback() || Response.error();
}

const isFreshRuntime = (pathname) => FRESH_RUNTIME_SUFFIXES.some((suffix) => pathname.endsWith(suffix));
const isCatalogueNavigation = (pathname) => pathname.endsWith('/catalogue/') || pathname.endsWith('/catalogue/index.html') || pathname.endsWith('/explore/') || pathname.endsWith('/explore/index.html');
const isJsonData = (pathname) => pathname.includes('/data/') && pathname.endsWith('.json');

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    const fallback = isCatalogueNavigation(url.pathname) ? './explore/index.html' : './index.html';
    if (isCatalogueNavigation(url.pathname)) {
      event.respondWith(catalogueNavigation(request, fallback));
      return;
    }
    event.respondWith(networkFirst(request, fallback));
    return;
  }

  if (isFreshRuntime(url.pathname)) {
    event.respondWith(networkFirst(request));
    return;
  }

  if (isJsonData(url.pathname)) {
    event.respondWith(networkFirst(request));
    return;
  }

  if (url.pathname.includes('/assets/backgrounds/library/') && url.pathname.endsWith('.webp')) {
    event.respondWith(cacheFirst(request));
    return;
  }

  if (['script', 'style', 'image', 'font'].includes(request.destination)) {
    event.respondWith(staleWhileRevalidate(request));
  }
});
