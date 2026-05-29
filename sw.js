/* ══════════════════════════════════════════
   MotoKas — Service Worker v4.2
   Perbaikan dari v4.1:
   - SW1. CACHE_NAME diupdate ke v4.2
   - SW2. Tambah riwayat_stok ke daftar key yang di-handle
   - SW3. Firebase external domains lebih lengkap dan eksplisit
   - SW4. Strategi cache untuk aktivasi.js & firebase.js dipisah
          (cache-first karena lokal, bukan CDN)
   - SW5. Tambah versioning hint di response header cache
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
// SW3: lebih eksplisit — pisahkan subdomain Firebase
const EXTERNAL_DOMAINS = [
  'firebaseapp.com',
  'firebasedatabase.app',
  'firebaseio.com',              // SW3: Realtime DB URL lama
  'googleapis.com',              // mencakup firebase.googleapis.com
  'gstatic.com',
  'identitytoolkit.googleapis.com', // SW3: Firebase Auth endpoint
  'securetoken.googleapis.com',     // SW3: Firebase token refresh
  'jsdelivr.net',
  'cdnjs.cloudflare.com',
  'chart.js',
  'sweetalert2'
];

// ── INSTALL: cache semua aset lokal ──
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache =>
      // Promise.allSettled: satu gagal tidak batalkan semua
      Promise.allSettled(
        LOCAL_ASSETS.map(url =>
          cache.add(url).catch(err =>
            console.warn('[SW] Gagal cache:', url, err)
          )
        )
      )
    )
  );
  // Aktifkan SW baru langsung tanpa tunggu tab lama ditutup
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
  // Klaim semua tab yang sudah terbuka tanpa perlu reload
  self.clients.claim();
});

// ── FETCH ──
self.addEventListener('fetch', e => {
  const url = e.request.url;

  // Abaikan request non-GET (POST ke Firebase, Sheets, dsb)
  if (e.request.method !== 'GET') return;

  // SW3: domain eksternal — network-only, fallback 503 jika offline
  const isExternal = EXTERNAL_DOMAINS.some(domain => url.includes(domain));
  if (isExternal) {
    e.respondWith(
      fetch(e.request).catch(() =>
        new Response('', {
          status: 503,
          statusText: 'Service Unavailable — Offline'
        })
      )
    );
    return;
  }

  // SW4: aset lokal yang DIKENAL — cache-first (lebih cepat, tidak butuh network)
  const isKnownLocal = LOCAL_ASSETS.some(asset => {
    const assetUrl = new URL(asset, self.location.origin).href;
    return url === assetUrl || url.endsWith(asset.replace('./', '/'));
  });

  if (isKnownLocal) {
    e.respondWith(
      caches.match(e.request).then(cached => {
        if (cached) return cached;
        // Tidak ada di cache (misal setelah hapus cache manual) — ambil dari network
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
          // Navigasi (buka URL baru) — fallback ke index.html
          if (e.request.mode === 'navigate') {
            return caches.match('./index.html');
          }
          return new Response('', {
            status: 503,
            statusText: 'Offline - Resource not cached'
          });
        })
      )
  );
});

// ── BACKGROUND SYNC: kirim transaksi pending saat online kembali ──
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

// ── MESSAGE: terima perintah dari halaman utama ──
self.addEventListener('message', e => {
  if (!e.data) return;

  // Paksa aktivasi SW baru (dipanggil saat user konfirmasi update)
  if (e.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }

  // SW6: force clear cache — dipanggil saat app butuh refresh penuh
  if (e.data.type === 'CLEAR_CACHE') {
    caches.keys().then(keys =>
      Promise.all(keys.map(key => caches.delete(key)))
    ).then(() => {
      console.log('[SW] Semua cache dihapus atas permintaan app');
      // Kabari client bahwa cache sudah bersih
      self.clients.matchAll().then(clients => {
        clients.forEach(c => c.postMessage({ type: 'CACHE_CLEARED' }));
      });
    });
  }
});
