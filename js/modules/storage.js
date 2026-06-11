// ============================================================
//  MotoKas — modules/storage.js
//  Modul pengelolaan localStorage + sinkronisasi Firebase
// ============================================================

export function getData(key, def) {
  try { return JSON.parse(localStorage.getItem(key)) ?? def; }
  catch { return def; }
}

export function setData(key, val) {
  localStorage.setItem(key, JSON.stringify(val));
  // Sinkronkan ke variabel global
  if (key === 'produk')       window.produk       = val;
  if (key === 'laporan')      window.laporan      = val;
  if (key === 'riwayat')      window.riwayat      = val;
  if (key === 'settings')     window.pengaturan   = val;
  if (key === 'riwayat_stok') window.riwayatStok  = val;
  // Jadwalkan simpan ke Firebase
  const FB_KEYS = ['produk', 'laporan', 'riwayat', 'settings', 'riwayat_stok'];
  if (FB_KEYS.includes(key)) {
    clearTimeout(window._fbSaveTimeout);
    window._fbSaveTimeout = setTimeout(() => {
      // FIX: hanya sync ke Firebase jika user sudah login dan PIN sudah dimasukkan
      if (window._pinPassed && window.FB?.uid && typeof window.fbSimpanSemua === 'function') {
        window.fbSimpanSemua();
      }
    }, 800);
  }
}

export function removeData(...keys) {
  keys.forEach(k => localStorage.removeItem(k));
}

// Inisialisasi state global dari localStorage
export function initGlobalState() {
  window.produk      = getData('produk',       []);
  window.laporan     = getData('laporan',      {});
  window.riwayat     = getData('riwayat',      []);
  window.pengaturan  = getData('settings',     {});
  window.riwayatStok = getData('riwayat_stok', []);
  window._pinPassed  = false;
}
