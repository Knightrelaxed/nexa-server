// NEXA Finance – Service Worker (PWA) – v2
// Strategi: Cache-first untuk aset statis, Network-only untuk Supabase

// Versi cache otomatis berdasarkan tanggal deploy agar mudah di-invalidate
const CACHE_VERSION = 'nexa-finance-v2'
const STATIC_CACHE = `${CACHE_VERSION}-static`
const RUNTIME_CACHE = `${CACHE_VERSION}-runtime`

// Hanya pre-cache file yang pasti ada dan tidak butuh auth
const PRECACHE_ASSETS = [
  '/manifest.json',
  '/icons/icon-192x192.png',
  '/icons/icon-512x512.png',
  '/icons/icon-maskable.png',
  '/app/icon.png',
]

// ── Install ───────────────────────────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then((cache) => {
        // addAll tanpa menggagalkan install jika satu file error
        return Promise.allSettled(
          PRECACHE_ASSETS.map((url) => cache.add(url).catch(() => { /* silently skip */ }))
        )
      })
      .then(() => self.skipWaiting())
  )
})

// ── Activate: hapus semua cache versi lama ────────────────────────
self.addEventListener('activate', (event) => {
  const currentCaches = [STATIC_CACHE, RUNTIME_CACHE]
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys
          .filter((key) => !currentCaches.includes(key))
          .map((key) => {
            console.log('[NEXA SW] Removing old cache:', key)
            return caches.delete(key)
          })
      ))
      .then(() => self.clients.claim())
  )
})

// ── Fetch: Strategi berlapis ───────────────────────────────────────
self.addEventListener('fetch', (event) => {
  const { request } = event
  const url = new URL(request.url)

  // 1. Abaikan: bukan GET
  if (request.method !== 'GET') return

  // 2. Abaikan: API Supabase → selalu network (data real-time)
  if (url.hostname.includes('supabase.co')) return

  // 3. Abaikan: Analytics, external CDN, dll.
  if (url.hostname !== self.location.hostname) return

  // 4. Abaikan: bukan http(s)
  if (!url.protocol.startsWith('http')) return

  // ── Aset statis Next.js (_next/static) → Cache-First (Immutable) ──
  if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith(
      caches.open(STATIC_CACHE).then(async (cache) => {
        const cached = await cache.match(request)
        if (cached) return cached
        const response = await fetch(request)
        if (response.ok) cache.put(request, response.clone())
        return response
      })
    )
    return
  }

  // ── Ikon & manifest PWA → Cache-First ─────────────────────────────
  if (url.pathname.startsWith('/icons/') || url.pathname === '/manifest.json') {
    event.respondWith(
      caches.open(STATIC_CACHE).then(async (cache) => {
        const cached = await cache.match(request)
        if (cached) return cached
        const response = await fetch(request)
        if (response.ok) cache.put(request, response.clone())
        return response
      })
    )
    return
  }

  // ── Halaman Navigasi (HTML pages) → Network-First + Offline Fallback ──
  if (request.destination === 'document') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          // Simpan versi terbaru halaman ke runtime cache
          const responseClone = response.clone()
          caches.open(RUNTIME_CACHE).then((cache) => {
            cache.put(request, responseClone)
          })
          return response
        })
        .catch(async () => {
          // Offline: coba tampilkan versi halaman yang tersimpan
          const cached = await caches.match(request)
          if (cached) return cached

          // Fallback terakhir: halaman offline yang cantik
          return new Response(
            `<!DOCTYPE html>
            <html lang="id">
            <head>
              <meta charset="utf-8"/>
              <meta name="viewport" content="width=device-width,initial-scale=1"/>
              <title>NEXA Finance – Offline</title>
              <style>
                body{font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#f0fdf4;color:#1e293b}
                .card{text-align:center;padding:2rem;background:white;border-radius:1.5rem;box-shadow:0 4px 24px #10b98122;max-width:380px;width:90%}
                .icon{font-size:3rem;margin-bottom:1rem}
                h1{font-size:1.25rem;font-weight:700;margin:0 0 0.5rem;color:#10b981}
                p{font-size:0.875rem;color:#64748b;margin:0 0 1.5rem}
                button{background:#10b981;color:white;border:none;border-radius:0.75rem;padding:0.75rem 1.5rem;font-size:0.875rem;font-weight:600;cursor:pointer}
                button:hover{background:#059669}
              </style>
            </head>
            <body>
              <div class="card">
                <div class="icon">📡</div>
                <h1>Anda Sedang Offline</h1>
                <p>NEXA Finance memerlukan koneksi internet untuk menampilkan data keuangan terbaru Anda.</p>
                <button onclick="window.location.reload()">Coba Lagi</button>
              </div>
            </body>
            </html>`,
            { headers: { 'Content-Type': 'text/html; charset=utf-8' } }
          )
        })
    )
    return
  }

  // ── Semua request lainnya → Stale-While-Revalidate ─────────────────
  event.respondWith(
    caches.open(RUNTIME_CACHE).then(async (cache) => {
      const cached = await cache.match(request)
      const networkFetch = fetch(request).then((response) => {
        if (response.ok) cache.put(request, response.clone())
        return response
      }).catch(() => cached)

      return cached || networkFetch
    })
  )
})
