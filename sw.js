/* ══════════════════════════════════════════
   dityaMotor 88 — Service Worker
   sw.js — Permanent Auto-Update
══════════════════════════════════════════ */

const LOCAL_ASSETS = [
  './',
  './index.html',
  './css/style.css',
  './js/app.js',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open('dm88-dynamic').then(cache =>
      Promise.allSettled(LOCAL_ASSETS.map(url => cache.add(url).catch(() => {})))
    )
  );
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  // Tidak perlu hapus cache lama karena nama cache selalu sama
  // Cache diperbarui otomatis lewat network-first di fetch
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  const url = e.request.url;

  const isExternal = [
    'firebaseapp.com', 'firebasedatabase.app', 'googleapis.com',
    'gstatic.com', 'jsdelivr.net', 'sheetjs.com', 'sweetalert2'
  ].some(domain => url.includes(domain));

  if (isExternal) {
    e.respondWith(fetch(e.request).catch(() => new Response('', { status: 503 })));
    return;
  }

  // ✅ Network-first: selalu ambil dari server dulu, cache sebagai fallback
  e.respondWith(
    fetch(e.request).then(response => {
      if (response && response.status === 200 && response.type === 'basic') {
        const clone = response.clone();
        caches.open('dm88-dynamic').then(cache => cache.put(e.request, clone));
      }
      return response;
    }).catch(() => {
      // Offline: ambil dari cache
      return caches.match(e.request).then(cached => {
        if (cached) return cached;
