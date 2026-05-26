/* ══════════════════════════════════════════
   dityaMotor 88 — Service Worker v4.0
   Network-first strategy, auto-update
══════════════════════════════════════════ */

const CACHE_NAME = 'dm88-v4';

const LOCAL_ASSETS = [
  './',
  './index.html',
  './css/style.css',
  './js/app.js',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

const EXTERNAL_DOMAINS = [
  'firebaseapp.com',
  'firebasedatabase.app',
  'googleapis.com',
  'gstatic.com',
  'jsdelivr.net',
  'cdnjs.cloudflare.com',
  'sheetjs.com',
  'sweetalert2'
];

// ── INSTALL: cache semua aset lokal ──
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache =>
      Promise.allSettled(
        LOCAL_ASSETS.map(url =>
          cache.add(url).catch(err => console.warn('[SW] Gagal cache:', url, err))
        )
      )
    )
  );
  self.skipWaiting(); // Langsung aktif, tidak tunggu tab lama ditutup
});

// ── ACTIVATE: hapus cache lama ──
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(key => key !== CACHE_NAME)
          .map(key => {
            console.log('[SW] Hapus cache lama:', key);
            return caches.delete(key);
          })
      )
    )
  );
  self.clients.claim(); // Langsung kontrol semua tab yang terbuka
});

// ── FETCH: network-first, cache sebagai fallback ──
self.addEventListener('fetch', e => {
  const url = e.request.url;

  // Skip request non-GET
  if (e.request.method !== 'GET') return;

  // External domain: langsung ke network, tidak di-cache
  const isExternal = EXTERNAL_DOMAINS.some(domain => url.includes(domain));
  if (isExternal) {
    e.respondWith(
      fetch(e.request).catch(() =>
        new Response('', { status: 503, statusText: 'Service Unavailable' })
      )
    );
    return;
  }

  // Network-first untuk semua aset lokal
  e.respondWith(
    fetch(e.request)
      .then(response => {
        // Simpan ke cache kalau response valid
        if (
          response &&
          response.status === 200 &&
          (response.type === 'basic' || response.type === 'cors')
        ) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(e.request, clone));
        }
        return response;
      })
      .catch(() => {
        // Offline: ambil dari cache
        return caches.match(e.request).then(cached => {
          if (cached) return cached;

          // Fallback untuk navigasi halaman
          if (e.request.mode === 'navigate') {
            return caches.match('./index.html');
          }

          // Tidak ada di cache dan offline
          return new Response('', {
            status: 503,
            statusText: 'Offline - Resource not cached'
          });
        });
      })
  );
});
