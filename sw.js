/* ══════════════════════════════════════════
   dityaMotor 88 — Service Worker v3.1
   sw.js — Fixed: no external URL cache error
══════════════════════════════════════════ */
const CACHE_NAME = 'dm88-v3.1';

// Hanya cache file lokal — jangan cache URL eksternal!
const LOCAL_ASSETS = [
  './',
  './index.html',
  './css/style.css',
  './js/app.js',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

/* ── INSTALL: cache file lokal saja ── */
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      // allSettled supaya satu file gagal tidak block semua
      return Promise.allSettled(
        LOCAL_ASSETS.map(url => cache.add(url).catch(() => {}))
      );
    })
  );
  self.skipWaiting();
});

/* ── ACTIVATE: hapus cache lama ── */
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

/* ── FETCH: strategi berbeda per jenis request ── */
self.addEventListener('fetch', e => {
  const url = e.request.url;

  // Jangan intercept Firebase, Google APIs, CDN eksternal
  const isExternal = [
    'firebaseapp.com', 'firebasedatabase.app', 'googleapis.com',
    'gstatic.com', 'jsdelivr.net', 'sheetjs.com', 'sweetalert2'
  ].some(domain => url.includes(domain));

  if (isExternal) {
    // Langsung fetch dari network, tidak cache
    e.respondWith(fetch(e.request).catch(() => new Response('', { status: 503 })));
    return;
  }

  // File lokal: cache-first, fallback ke network
  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached;
      return fetch(e.request).then(response => {
        // Hanya cache response yang valid (status 200, bukan opaque)
        if (response && response.status === 200 && response.type === 'basic') {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(e.request, clone));
        }
        return response;
      }).catch(() => {
        // Offline fallback ke index.html untuk navigasi
        if (e.request.mode === 'navigate') {
          return caches.match('./index.html');
        }
        return new Response('', { status: 503 });
      });
    })
  );
});
