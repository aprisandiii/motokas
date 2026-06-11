/* ══════════════════════════════════════════
   MotoKas — Service Worker v5.5
   Perubahan dari v4.2:
   - CACHE_NAME diupdate ke v5.5
   - LOCAL_ASSETS mencakup semua modul ES di js/modules/
   - Tidak ada perubahan strategi cache — tetap cache-first lokal
══════════════════════════════════════════ */

const CACHE_NAME = 'dm88-v5.5';

const LOCAL_ASSETS = [
  './',
  './index.html',
  './css/style.css',
  './js/app.js',
  './js/firebase.js',
  './js/aktivasi.js',
  './js/modules/storage.js',
  './js/modules/utils.js',
  './js/modules/screen.js',
  './js/modules/settings.js',
  './js/modules/pin.js',
  './js/modules/produk.js',
  './js/modules/cart.js',
  './js/modules/laporan.js',
  './js/modules/app-init.js',
  './js/modules/validasi.js',
  './js/modules/laporan-periode.js',
  './js/modules/onboarding.js',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

const EXTERNAL_DOMAINS = [
  'firebaseapp.com',
  'firebasedatabase.app',
  'firebaseio.com',
  'googleapis.com',
  'gstatic.com',
  'identitytoolkit.googleapis.com',
  'securetoken.googleapis.com',
  'cdnjs.cloudflare.com',
];

// ── INSTALL ──────────────────────────────────────────────────
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
  self.skipWaiting();
});

// ── ACTIVATE ─────────────────────────────────────────────────
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(key => key !== CACHE_NAME).map(key => {
          console.log('[SW] Hapus cache lama:', key);
          return caches.delete(key);
        })
      )
    )
  );
  self.clients.claim();
});

// ── FETCH ─────────────────────────────────────────────────────
self.addEventListener('fetch', e => {
  const url = e.request.url;
  if (e.request.method !== 'GET') return;

  // Domain eksternal — network-only
  if (EXTERNAL_DOMAINS.some(d => url.includes(d))) {
    e.respondWith(
      fetch(e.request).catch(() =>
        new Response('', { status: 503, statusText: 'Service Unavailable — Offline' })
      )
    );
    return;
  }

  // Aset lokal — cache-first
  const isKnownLocal = LOCAL_ASSETS.some(asset => {
    const assetUrl = new URL(asset, self.location.origin).href;
    return url === assetUrl || url.endsWith(asset.replace('./', '/'));
  });

  if (isKnownLocal) {
    e.respondWith(
      caches.match(e.request).then(cached => {
        if (cached) return cached;
        return fetch(e.request).then(response => {
          if (response?.status === 200) {
            caches.open(CACHE_NAME).then(cache => cache.put(e.request, response.clone()));
          }
          return response;
        });
      })
    );
    return;
  }

  // Request lain — network-first, cache sebagai fallback
  e.respondWith(
    fetch(e.request)
      .then(response => {
        if (response?.status === 200 && ['basic','cors'].includes(response.type)) {
          caches.open(CACHE_NAME).then(cache => cache.put(e.request, response.clone()));
        }
        return response;
      })
      .catch(() =>
        caches.match(e.request).then(cached => {
          if (cached) return cached;
          if (e.request.mode === 'navigate') return caches.match('./index.html');
          return new Response('', { status: 503, statusText: 'Offline - Resource not cached' });
        })
      )
  );
});

// ── BACKGROUND SYNC ──────────────────────────────────────────
self.addEventListener('sync', e => {
  if (e.tag === 'sync-transaksi') {
    e.waitUntil(
      self.clients.matchAll({ includeUncontrolled: true, type: 'window' }).then(clients => {
        clients.forEach(client => client.postMessage({ type: 'SYNC_PENDING_TRX' }));
      })
    );
  }
});

// ── MESSAGE ──────────────────────────────────────────────────
self.addEventListener('message', e => {
  if (!e.data) return;
  if (e.data.type === 'SKIP_WAITING') self.skipWaiting();
  if (e.data.type === 'CLEAR_CACHE') {
    caches.keys()
      .then(keys => Promise.all(keys.map(k => caches.delete(k))))
      .then(() => {
        self.clients.matchAll().then(clients =>
          clients.forEach(c => c.postMessage({ type: 'CACHE_CLEARED' }))
        );
      });
  }
});
