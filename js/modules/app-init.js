// ============================================================
//  MotoKas — modules/app-init.js  (Bug-fix patch)
//  FIX: tryFirebaseLoad hentikan jika user sudah logout / lock
//  FIX: renderCart dipanggil saat initApp agar state sinkron
// ============================================================
import { getData, setData }                from './storage.js';
import { loadSettings }                    from './settings.js';
import { renderProduk, updateKritisCount } from './produk.js';
import { renderDashboard, renderLaporan, renderRiwayat } from './laporan.js';
import { renderCart, updateCartBadge }     from './cart.js';

export function initApp() {
  window.produk      = getData('produk',       []);
  window.laporan     = getData('laporan',      {});
  window.riwayat     = getData('riwayat',      []);
  window.riwayatStok = getData('riwayat_stok', []);

  loadSettings();
  renderDashboard();
  renderProduk();
  renderLaporan();
  renderRiwayat();
  renderCart();        // FIX: sinkronkan tampilan cart
  updateCartBadge();

  // Pulihkan nama kasir terakhir
  const savedKasir = localStorage.getItem('_last_kasir');
  if (savedKasir) {
    const el = document.getElementById('kasir-name');
    if (el && !el.value) el.value = savedKasir;
  }

  if (typeof window.injectCloudButton === 'function') window.injectCloudButton();

  // Cek tour untuk user baru (delay agar UI sudah selesai render)
  setTimeout(() => {
    if (typeof window._cekTourBaru === 'function') window._cekTourBaru();
  }, 1500);

  // FIX: tryFirebaseLoad berhenti jika app di-lock atau user logout
  let _fbRetry = 0;
  function tryFirebaseLoad() {
    // Berhenti jika sudah logout/lock
    if (!window._pinPassed) return;
    if (_fbRetry >= 25) {
      console.warn('MotoKas: Firebase tidak siap setelah 25 retry, skip cloud sync.');
      return;
    }
    _fbRetry++;
    if (!window.FB?.uid) {
      setTimeout(tryFirebaseLoad, 400);
      return;
    }
    if (typeof window.fbLoadAllData === 'function') {
      window.fbLoadAllData().then(() => {
        if (!window._pinPassed) return; // sudah di-lock saat loading
        if (typeof window.fbListenRealtime === 'function') window.fbListenRealtime();
      });
    } else {
      setTimeout(tryFirebaseLoad, 400);
    }
  }
  tryFirebaseLoad();
}

// Alias untuk firebase.js
window.terapkanPengaturan = () => loadSettings();

// Sync dari Firebase ke UI
window.syncProdukDariFirebase  = () => {
  localStorage.setItem('produk',  JSON.stringify(window.produk  || []));
  renderProduk();
  updateKritisCount();
};
window.syncLaporanDariFirebase = () => {
  localStorage.setItem('laporan', JSON.stringify(window.laporan || {}));
  renderLaporan();
  renderRiwayat();
};
window.syncRiwayatDariFirebase = () => {
  localStorage.setItem('riwayat', JSON.stringify(window.riwayat || []));
  renderRiwayat();
};
window.updateDashboard = () => renderDashboard();

window._appInit = initApp;
