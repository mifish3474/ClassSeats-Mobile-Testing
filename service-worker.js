const CACHE_NAME = 'classseats-pwa-v1'
const CORE_ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png',
]

const isGoogleRequest = (url) => {
  return (
    url.includes('googleapis.com') ||
    url.includes('googleusercontent.com') ||
    url.includes('accounts.google.com') ||
    url.includes('gstatic.com')
  )
}

const isCloudFunction = (url) => {
  return url.includes('classseats-sync.cloudfunctions.net')
}

const isExternal = (url, origin) => {
  return (
    url.origin !== origin ||
    isGoogleRequest(url.href) ||
    isCloudFunction(url.href)
  )
}


self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(CORE_ASSETS))
      .catch(() => {})
  )
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      )
    )
  )
  self.clients.claim()
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return

  const url = new URL(request.url)

  // Never intercept Google auth/Drive calls, cloud functions, or any external domains.
  if (isExternal(url, self.location.origin)) {
    return
  }

  const isNavRequest = request.mode === 'navigate'
  const isStaticAsset =
    /\.(js|css|png|svg|ico|webmanifest|json)$/.test(url.pathname) ||
    CORE_ASSETS.some((asset) => asset.endsWith(url.pathname))

  if (isNavRequest) {
    // Navigation: cache-first, then network, then fallback to cached shell.
    event.respondWith(
      (async () => {
        const cached = await caches.match('./index.html')
        if (cached) return cached
        try {
          const network = await fetch(request)
          if (network && network.ok) return network
        } catch {
          /* ignore */
        }
        return cached || new Response('Offline', { status: 503, statusText: 'Offline' })
      })()
    )
    return
  }

  if (isStaticAsset) {
    // Static assets: cache-first, then network and cache the result.
    event.respondWith(
      (async () => {
        const cached = await caches.match(request)
        if (cached) return cached
        try {
          const response = await fetch(request)
          if (response && response.status === 200) {
            const clone = response.clone()
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone))
          }
          return response
        } catch {
          return cached || new Response('Offline', { status: 503, statusText: 'Offline' })
        }
      })()
    )
  }
})
