/* ══════════════════════════════════════════
   MotoKas — Service Worker v4.2
   Perbaikan dari v4.1:
   - SW1. CACHE_NAME diupdate ke v4.2
   - SW2. riwayat_stok adalah data localStorage, bukan file (tidak perlu di LOCAL_ASSETS)
   - SW3. Firebase external domains lebih lengkap dan eksplisit
   - SW4. Strategi cache untuk aktivasi.js & firebase.js dipisah (cache-first)
   - SW5. Versioning hint di response header cache
   - SW6. Message CLEAR_CACHE untuk force refresh dari app
══════════════════════════════════════════ */

const CACHE_NAME = 'dm88-v4.2';

// Aset lokal — di-cache saat install, strategi: cache-first
const LOCAL_ASSETS = [
  './',
  './index.html',
  './css/style.css',
  './js/app.js',
  './js/aktivasi.js',
  './js/firebase.js',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

// Domain eksternal — tidak di-cache, network-only dengan fallback 503
const EXTERNAL_DOMAINS = [
  'firebaseapp.com',
  'firebasedatabase.app',
  'firebaseio.com',
  'googleapis.com',
  'gstatic.com',
  'identitytoolkit.googleapis.com',
  'securetoken.googleapis.com',
  'jsdelivr.net',
  'cdnjs.cloudflare.com',
  'chart.js',
  'sweetalert2'
];

// ── INSTALL: cache semua aset lokal ──
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache =>
      Promise.allSettled(
        LOCAL_ASSETS.map(url =>
          cache.add(url).catch(err =>
            console.warn('[SW] Gagal cache:', url, err)
          )
        )
      )
    )
  );
  self.skipWaiting();
});

// ── ACTIVATE: hapus cache versi lama ──
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
  self.clients.claim();
});

// ── FETCH ──
self.addEventListener('fetch', e => {
  const url = e.request.url;

  // Abaikan request non-GET
  if (e.request.method !== 'GET') return;

  // Domain eksternal — network-only, fallback 503 jika offline
  const isExternal = EXTERNAL_DOMAINS.some(domain => url.includes(domain));
  if (isExternal) {
    e.respondWith(
      fetch(e.request).catch(() =>
        new Response('', {
          status:     503,
          statusText: 'Service Unavailable — Offline'
        })
      )
    );
    return;
  }

  // Aset lokal yang dikenal — cache-first
  const isKnownLocal = LOCAL_ASSETS.some(asset => {
    const assetUrl = new URL(asset, self.location.origin).href;
    return url === assetUrl || url.endsWith(asset.replace('./', '/'));
  });

  if (isKnownLocal) {
    e.respondWith(
      caches.match(e.request).then(cached => {
        if (cached) return cached;
        return fetch(e.request).then(response => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(e.request, clone));
          }
          return response;
        });
      })
    );
    return;
  }

  // Semua request lain — network-first, cache sebagai fallback
  e.respondWith(
    fetch(e.request)
      .then(response => {
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
      .catch(() =>
        caches.match(e.request).then(cached => {
          if (cached) return cached;
          if (e.request.mode === 'navigate') {
            return caches.match('./index.html');
          }
          return new Response('', {
            status:     503,
            statusText: 'Offline - Resource not cached'
          });
        })
      )
  );
});

// ── BACKGROUND SYNC ──
self.addEventListener('sync', e => {
  if (e.tag === 'sync-transaksi') {
    e.waitUntil(
      self.clients.matchAll({ includeUncontrolled: true, type: 'window' }).then(clients => {
        if (clients.length === 0) {
          console.warn('[SW] sync-transaksi: tidak ada client aktif');
          return;
        }
        clients.forEach(client => {
          client.postMessage({ type: 'SYNC_PENDING_TRX' });
        });
      })
    );
  }
});

// ── MESSAGE ──
self.addEventListener('message', e => {
  if (!e.data) return;

  if (e.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }

  // SW6: force clear cache
  if (e.data.type === 'CLEAR_CACHE') {
    caches.keys().then(keys =>
      Promise.all(keys.map(key => caches.delete(key)))
    ).then(() => {
      console.log('[SW] Semua cache dihapus atas permintaan app');
      self.clients.matchAll().then(clients => {
        clients.forEach(c => c.postMessage({ type: 'CACHE_CLEARED' }));
      });
    });
  }
});
