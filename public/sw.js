const CACHE = 'command-center-v2'

/**
 * Offline cache for hashed static files only.
 *
 * v1 cached `/` (the signed-in HTML page) and intercepted every navigation.
 * After Clerk login the worker then served a stale page or a handshake
 * redirect, so the tab spun forever. Incognito had no worker, so it worked.
 *
 * Page loads, Clerk handshake query strings, RSC, and `/api/` always hit the
 * network. Failed JS/CSS must never fall back to the HTML app shell.
 */
const STATIC_EXT = /\.(?:js|css|woff2?|ttf|ico|svg|png|webp|gif|jpe?g|webmanifest)$/i

self.addEventListener('install', () => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys()
      const hadLegacy = keys.some((key) => key !== CACHE)
      await Promise.all(keys.map((key) => caches.delete(key)))
      await self.clients.claim()
      // Reload tabs that were stuck on the old worker's cached login page.
      if (!hadLegacy) return
      const windows = await self.clients.matchAll({ type: 'window' })
      await Promise.all(
        windows.map((client) =>
          'navigate' in client ? client.navigate(client.url) : Promise.resolve(),
        ),
      )
    })(),
  )
})

function bypass(request, url) {
  if (request.method !== 'GET') return true
  if (url.origin !== self.location.origin) return true
  if (request.mode === 'navigate' || request.destination === 'document') return true
  if (url.pathname === '/sw.js' || url.pathname.startsWith('/api/')) return true
  if (url.pathname.includes('__clerk') || url.search.includes('__clerk')) return true
  if (request.headers.has('RSC') || request.headers.has('Next-Router-State-Tree')) return true
  return false
}

function cacheable(url) {
  return STATIC_EXT.test(url.pathname) || url.pathname.startsWith('/_next/static/')
}

self.addEventListener('fetch', (event) => {
  const request = event.request
  const url = new URL(request.url)
  if (bypass(request, url) || !cacheable(url)) return

  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok && response.type === 'basic') {
          const copy = response.clone()
          void caches.open(CACHE).then((cache) => cache.put(request, copy))
        }
        return response
      })
      .catch(async () => {
        const cached = await caches.match(request)
        return cached || Response.error()
      }),
  )
})
