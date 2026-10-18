/* Northside Physio service worker — hand-written, no build step.
 *
 * - Precaches the offline page and app icons.
 * - Hashed build assets (/_next/static) are cache-first (they're immutable).
 * - Public pages are network-first with a cached fallback, then /offline.
 * - Booking data, manage links, staff pages and APIs are never cached:
 *   availability must always be live, and personal data must not linger on devices.
 */
const VERSION = 'v1'
const STATIC_CACHE = `northside-static-${VERSION}`
const PAGE_CACHE = `northside-pages-${VERSION}`
const PRECACHE = ['/offline', '/icons/192', '/icons/512', '/manifest.webmanifest']
const PUBLIC_PAGES = ['/', '/book']
const NEVER_CACHE = [/^\/api\//, /^\/manage\//, /^\/booking\//, /^\/staff/, /^\/admin/, /^\/login/]

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(STATIC_CACHE).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting()))
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== STATIC_CACHE && k !== PAGE_CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return
  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return
  if (NEVER_CACHE.some((re) => re.test(url.pathname))) {
    if (request.mode === 'navigate') event.respondWith(fetch(request).catch(() => caches.match('/offline')))
    return
  }

  if (url.pathname.startsWith('/_next/static/') || url.pathname.startsWith('/icons/')) {
    event.respondWith(
      caches.match(request).then(
        (hit) =>
          hit ||
          fetch(request).then((res) => {
            if (res.ok) {
              const copy = res.clone()
              caches.open(STATIC_CACHE).then((c) => c.put(request, copy))
            }
            return res
          }),
      ),
    )
    return
  }

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((res) => {
          if (res.ok && PUBLIC_PAGES.includes(url.pathname) && !url.search) {
            const copy = res.clone()
            caches.open(PAGE_CACHE).then((c) => c.put(request, copy))
          }
          return res
        })
        .catch(async () => (await caches.match(request)) || (await caches.match('/offline'))),
    )
  }
})
