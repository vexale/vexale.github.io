const CACHE_NAME = 'vexale-shell-__PRECACHE_VERSION__'
const PRECACHE_ASSETS = __PRECACHE_ASSETS__
const REMOTE_PRECACHE = __REMOTE_PRECACHE__
const APP_SHELL_URL = new URL('/app/index.html', self.location.origin).href
const STATIC_DESTINATIONS = new Set(['script', 'style', 'image', 'font', 'manifest', 'worker'])
const STATIC_EXTENSION = /\.(?:m?js|css|png|jpe?g|webp|svg|ico|woff2?|ttf|otf|wasm)$/i
const HASHED_ASSET = /-[a-z0-9_-]{8,}\.(?:m?js|css|png|jpe?g|webp|svg|ico|woff2?|ttf|otf|wasm)$/i

async function storeSafeResponse(cache, request, response) {
  if (!response || !response.ok || response.type === 'opaque' && new URL(request.url).origin === self.location.origin) return
  const responseCopy = response.clone()
  await cache.put(request, responseCopy)
}

async function cacheRemoteResource(cache, url) {
  const request = new Request(url, { mode: 'cors', credentials: 'omit' })
  const response = await fetch(request, { cache: 'reload' })
  if (!response.ok) throw new Error(`Could not precache ${url}`)
  const isFontCss = new URL(url).hostname === 'fonts.googleapis.com'
  const css = isFontCss ? await response.clone().text() : ''
  await storeSafeResponse(cache, request, response)
  if (!css) return
  const fontUrls = [...css.matchAll(/url\((['"]?)(https:\/\/[^)'"\s]+)\1\)/g)]
    .map(match => match[2])
    .filter(fontUrl => new URL(fontUrl).hostname === 'fonts.gstatic.com')
  await Promise.allSettled(fontUrls.map(fontUrl => cacheRemoteResource(cache, fontUrl)))
}

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME)
    await cache.addAll(PRECACHE_ASSETS)
    await Promise.allSettled(REMOTE_PRECACHE.map(url => cacheRemoteResource(cache, url)))
  })())
})

self.addEventListener('message', event => {
  if (event.data?.type === 'SKIP_WAITING') event.waitUntil(self.skipWaiting())
})

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys()
    await Promise.all(keys.filter(key => key.startsWith('vexale-shell-') && key !== CACHE_NAME).map(key => caches.delete(key)))
    await self.clients.claim()
  })())
})

async function networkFirstHtml(request) {
  try {
    const response = await fetch(request)
    if (response.ok && response.type === 'basic') {
      const cache = await caches.open(CACHE_NAME)
      await storeSafeResponse(cache, request, response)
    }
    return response
  } catch {
    return (await caches.match(request)) || (await caches.match(APP_SHELL_URL)) || Response.error()
  }
}

async function cacheFirst(request) {
  const cached = await caches.match(request)
  if (cached) return cached
  const response = await fetch(request)
  if (response.ok && response.type !== 'opaque') {
    const cache = await caches.open(CACHE_NAME)
    await storeSafeResponse(cache, request, response)
  }
  return response
}

self.addEventListener('fetch', event => {
  const request = event.request
  if (request.method !== 'GET') return
  const url = new URL(request.url)
  const isNavigation = request.mode === 'navigate'
  const isHtml = isNavigation || (url.origin === self.location.origin && (request.destination === 'document' || /\.html$/i.test(url.pathname)))
  if (isHtml) {
    event.respondWith(networkFirstHtml(request))
    return
  }

  const isKnownRemote = REMOTE_PRECACHE.includes(url.href)
  const isRemoteFont = url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com'
  if (isKnownRemote || isRemoteFont) {
    event.respondWith(cacheFirst(request))
    return
  }

  const isLocalStatic = url.origin === self.location.origin && (STATIC_DESTINATIONS.has(request.destination) || STATIC_EXTENSION.test(url.pathname))
  if (!isLocalStatic) return
  if (HASHED_ASSET.test(url.pathname) || PRECACHE_ASSETS.includes(url.pathname)) {
    event.respondWith(cacheFirst(request))
    return
  }
  event.respondWith(cacheFirst(request))
})
