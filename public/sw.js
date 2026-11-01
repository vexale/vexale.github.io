const CACHE_NAME = 'vexale-shell-v2'
const SHELL_ASSETS = [
  './',
  './index.html',
  './en/',
  './en/index.html',
  './manifest.webmanifest',
  './landing.css',
  './logo.png',
  './vexale-favicon.png',
  './vexale-favicon.svg',
  './apple-touch-icon.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
]
const SHELL_URL = new URL('./index.html', self.registration.scope).href
const ENGLISH_SHELL_URL = new URL('./en/index.html', self.registration.scope).href
const ENGLISH_PATH = new URL('./en/', self.registration.scope).pathname
const STATIC_DESTINATIONS = new Set(['script', 'style', 'image', 'font', 'manifest', 'worker'])
const STATIC_EXTENSION = /\.(?:m?js|css|png|jpe?g|webp|svg|ico|woff2?|ttf|otf|wasm)$/i

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(SHELL_ASSETS.map(asset => new URL(asset, self.registration.scope).href)))
  )
})

self.addEventListener('message', event => {
  if (event.data?.type === 'SKIP_WAITING') event.waitUntil(self.skipWaiting())
})

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key.startsWith('vexale-shell-') && key !== CACHE_NAME).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', event => {
  const request = event.request
  if (request.method !== 'GET') return

  if (request.mode === 'navigate') {
    const path = new URL(request.url).pathname
    const fallbackUrl = path === ENGLISH_PATH || path === `${ENGLISH_PATH}index.html` ? ENGLISH_SHELL_URL : SHELL_URL
    event.respondWith(
      fetch(request).catch(async () => (await caches.match(request)) || (await caches.match(fallbackUrl)) || Response.error())
    )
    return
  }

  const url = new URL(request.url)
  if (url.origin !== self.location.origin || (!STATIC_DESTINATIONS.has(request.destination) && !STATIC_EXTENSION.test(url.pathname))) return

  event.respondWith(
    caches.match(request).then(cached => cached || fetch(request).then(response => {
      const cacheControl = response.headers.get('cache-control') ?? ''
      if (response.ok && response.type === 'basic' && !/no-store|private/i.test(cacheControl)) {
        void caches.open(CACHE_NAME).then(cache => cache.put(request, response.clone()))
      }
      return response
    }))
  )
})
