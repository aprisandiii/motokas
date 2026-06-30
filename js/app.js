// ============================================================
//  MotoKas — app.js v5.2 (Entry Point — ES Module)
//  Bug-fix patch:
//  FIX-A: showPinStatus saat load cek apakah PIN sudah diganti
//  FIX-B: navTo kasir → renderCart agar cart terupdate
//  FIX-C: debounce saveSettings (tidak simpan per karakter)
//  FIX-D: tryFirebaseLoad hentikan jika sudah logout
// ============================================================

import { getData, setData, initGlobalState } from './modules/storage.js';
import { toast, openModal, closeModal, fmtRp, fmtRpShort,
         tglKey, tglDisplay, tglKeyFromLocale, showKonfirmasiHapus } from './modules/utils.js';
import { showScreen, navTo }                  from './modules/screen.js';
import { loadSettings, saveSettings, toggleSetting, setPaperSize } from './modules/settings.js';
import { renderProduk, editProduk, simpanProduk, hapusProduk,
         openRestok, simpanRestok, setFilter, updateKritisCount } from './modules/produk.js';
import { addToCart, tambahJasa, checkout, hitungTotal,
         hitungKembalian, setDiskonMode, setPayment,
         changeQty, removeCart, cetakNotaTerakhir, shareNota,
         renderCart, resetCartState, updateCartBadge, lihatDetailTrx,
         toggleDP, hitungSisaDP } from './modules/cart.js';
import { renderDashboard, renderLaporan, renderRiwayat,
         voidTransaksi, konfirmasiVoid, exportCSV, exportTXT,
         exportJSON, restoreJSON, resetLaporan, resetRiwayat,
         resetAllData, kirimSheets, tesSheets,
         renderTotalAset, renderPiutang, bukaLunasi, konfirmasiLunasi }  from './modules/laporan.js';
import { pinInput, pinDel, checkPin, gantiPIN,
         resetPinPrompt, lockApp, initPinLockState,
         updatePinDots, showPinStatus }          from './modules/pin.js';
import { initApp }                               from './modules/app-init.js';
import { setPreset, renderRingkasanPeriode }    from './modules/laporan-periode.js';
import { startTour, resetTour, cekTourBaru }    from './modules/onboarding.js';
import { validasiLogin, validasiRegister, validasiSettings,
         bindClearOnInput }                            from './modules/validasi.js';

initGlobalState();

// FIX-C: debounce saveSettings
let _saveSettingsTimeout = null;
function saveSettingsDebounced() {
  clearTimeout(_saveSettingsTimeout);
  _saveSettingsTimeout = setTimeout(() => {
    if (validasiSettings()) saveSettings();
  }, 600);
}

Object.assign(window, {
  // Screen / Nav
  // FIX-B: renderCart saat navTo kasir
  navTo: (page, btn) => {
    navTo(page, btn);
    if (page === 'dashboard') renderDashboard();
    if (page === 'kasir')     { renderCart(); hitungTotal(); updateCartBadge(); }
    if (page === 'laporan') {
      renderLaporan(); renderRiwayat();
      const dari   = document.getElementById('date-dari')?.value;
      const sampai = document.getElementById('date-sampai')?.value;
      renderRingkasanPeriode(dari, sampai);
    }
    if (page === 'produk')    renderProduk();
  },
  showScreen, openModal, closeModal,
  // Auth
  authTab, doLogin, doRegister, logoutAkun, lupaPassword,
  // PIN
  pinInput, pinDel, checkPin, gantiPIN, resetPinPrompt, lockApp,
  // Settings — FIX-C: versi debounce diekspos ke HTML
  loadSettings,
  saveSettings: saveSettingsDebounced,
  toggleSetting,
  setPaperSize,
  // Produk
  renderProduk, editProduk, simpanProduk, hapusProduk,
  openRestok, simpanRestok, setFilter,
  // Cart / Kasir
  addToCart, tambahJasa, checkout, hitungTotal, hitungKembalian,
  setDiskonMode, setPayment, changeQty, removeCart,
  toggleDP, hitungSisaDP,
  cetakNotaTerakhir, shareNota, lihatDetailTrx, updateCartBadge,
  // Laporan
  renderDashboard, renderLaporan, renderRiwayat,
  renderTotalAset, renderPiutang, bukaLunasi, konfirmasiLunasi,
  voidTransaksi, konfirmasiVoid,
  exportCSV, exportTXT, exportJSON, restoreJSON,
  resetLaporan, resetRiwayat, kirimSheets, tesSheets,
  resetDateFilter: () => {
    const today   = new Date().toISOString().split('T')[0];
    const weekAgo = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString().split('T')[0];
    const f = document.getElementById('date-dari');   if (f) f.value = weekAgo;
    const t = document.getElementById('date-sampai'); if (t) t.value = today;
    renderLaporan();
  },
  resetAllData: () => resetAllData(() => { initApp(); }),
  fmtRp, fmtRpShort, toast,
  getData, setData,
  // Laporan periode
  setPreset, renderRingkasanPeriode,
  // Tour
  startTour, resetTour,
  resetCartState,
  // Validasi
  checkHPPWarning: () => {
    const hpp   = parseFloat(document.getElementById('prod-hpp')?.value)   || 0;
    const harga = parseFloat(document.getElementById('prod-harga')?.value) || 0;
    const warn  = document.getElementById('hpp-warn');
    if (!warn) return;
    warn.classList.toggle('show', hpp > 0 && harga > 0 && hpp >= harga);
  },
});

// PWA Install
let deferredPrompt = null;
window.installPWA = function() {
  if (deferredPrompt) { deferredPrompt.prompt(); deferredPrompt = null; }
  document.getElementById('install-banner').style.display = 'none';
};

// Online / Offline badge
function updateOnlineStatus() {
  const isOnline = navigator.onLine;
  const existing = document.getElementById('offline-badge');
  if (!isOnline) {
    if (!existing) {
      const badge = document.createElement('div');
      badge.id          = 'offline-badge';
      badge.textContent = '📴 Offline';
      document.body.appendChild(badge);
    }
  } else {
    existing?.remove();
    if ('serviceWorker' in navigator && 'SyncManager' in window) {
      navigator.serviceWorker.ready.then(sw => {
        sw.sync.register('sync-transaksi').catch(() => {});
      });
    }
  }
}

// ── AUTH FUNCTIONS ──────────────────────────────────────────
function authTab(tab) {
  document.getElementById('form-login').style.display    = tab === 'login'    ? 'block' : 'none';
  document.getElementById('form-register').style.display = tab === 'register' ? 'block' : 'none';
  document.getElementById('tab-login').classList.toggle('active',    tab === 'login');
  document.getElementById('tab-register').classList.toggle('active', tab === 'register');
  document.getElementById('login-error').textContent = '';
  document.getElementById('reg-error').textContent   = '';
}

async function doLogin() {
  const email    = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;
  const errEl    = document.getElementById('login-error');
  if (!validasiLogin()) return;
  // Disable tombol agar tidak double submit
  const btn = document.querySelector('#form-login .auth-btn');
  if (btn) { btn.disabled = true; btn.textContent = '⏳ Memproses...'; }
  errEl.textContent = '';
  try {
    const result = await window.fbLogin(email, password);
    if (result.ok) showScreen('pin');
    else {
      errEl.textContent = result.error;
      if (btn) { btn.disabled = false; btn.textContent = '🔑 Masuk'; }
    }
  } catch {
    errEl.textContent = 'Terjadi kesalahan, coba lagi';
    if (btn) { btn.disabled = false; btn.textContent = '🔑 Masuk'; }
  }
}

async function doRegister() {
  const nama     = document.getElementById('reg-nama').value.trim();
  const email    = document.getElementById('reg-email').value.trim();
  const password = document.getElementById('reg-password').value;
  const errEl    = document.getElementById('reg-error');
  if (!validasiRegister()) return;

  const btn = document.querySelector('#form-register .auth-btn');
  if (btn) { btn.disabled = true; btn.textContent = '⏳ Mendaftarkan...'; }
  errEl.textContent = '';
  try {
    const result = await window.fbRegister(email, password);
    if (result.ok) {
      const s = { nama, footer1: 'Terima kasih telah berbelanja!', footer2: '' };
      window.pengaturan  = s;
      window.riwayatStok = [];
      setData('settings', s);
      setData('riwayat_stok', []);
      await window.fbSimpanSemua?.();
      showScreen('pin');
      const nameEl = document.getElementById('pin-store-name');
      if (nameEl) nameEl.textContent = nama;
      toast('Akun berhasil dibuat! Selamat datang 🎉', 'success');
    } else {
      errEl.textContent = result.error;
      if (btn) { btn.disabled = false; btn.textContent = '📝 Daftar Sekarang'; }
    }
  } catch {
    errEl.textContent = 'Terjadi kesalahan, coba lagi';
    if (btn) { btn.disabled = false; btn.textContent = '📝 Daftar Sekarang'; }
  }
}

function logoutAkun() {
  if (!confirm('Yakin ingin logout dari akun?')) return;
  window._pinPassed = false;
  if (window.FB && typeof window.fbLogout === 'function') window.fbLogout();
  const KEYS = ['produk','laporan','riwayat','settings','prefs','pin',
    '_pin_sudah_diganti','_pin_attempts','_pin_lock_until',
    '_last_kasir','riwayat_stok','_pending_sync','mk_email'];
  KEYS.forEach(k => localStorage.removeItem(k));
  window.produk = []; window.laporan = {}; window.riwayat = [];
  window.pengaturan = {}; window.riwayatStok = [];
  resetCartState();
  ['login-email','login-password'].forEach(id => {
    const el = document.getElementById(id); if (el) el.value = '';
  });
  // Reset tombol login jika pernah di-disable
  const btn = document.querySelector('#form-login .auth-btn');
  if (btn) { btn.disabled = false; btn.textContent = '🔑 Masuk'; }
  document.getElementById('login-error').textContent = '';
  showScreen('auth');
  toast('Berhasil logout ✓');
}

async function lupaPassword() {
  const email = document.getElementById('login-email')?.value.trim();
  const errEl = document.getElementById('login-error');
  if (!email) { errEl.textContent = 'Masukkan email dulu sebelum reset password'; return; }
  errEl.style.color = '';
  errEl.textContent = 'Mengirim email reset...';
  try {
    const result      = await window.fbResetPassword(email);
    errEl.style.color = result.ok ? 'var(--green)' : 'var(--red)';
    errEl.textContent = result.ok
      ? '✓ Email reset password sudah dikirim, cek inbox kamu'
      : result.error;
  } catch {
    errEl.style.color = 'var(--red)';
    errEl.textContent = 'Gagal mengirim email reset';
  }
}

// ── LOAD EVENT ───────────────────────────────────────────────
window.addEventListener('load', () => {
  const sudahLogin = localStorage.getItem('mk_email');
  showScreen(sudahLogin ? 'pin' : 'auth');

  const s = getData('settings', {});
  const nameEl = document.getElementById('pin-store-name');
  const addrEl = document.getElementById('pin-store-addr');
  if (nameEl) nameEl.textContent = s.nama   || 'Nama Toko';
  if (addrEl) addrEl.textContent = s.alamat || 'Masukkan PIN untuk membuka kasir';

  // PWA
  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault();
    deferredPrompt = e;
    const banner = document.getElementById('install-banner');
    if (banner) banner.style.display = 'flex';
  });

  // Date filter default
  const today   = new Date().toISOString().split('T')[0];
  const weekAgo = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString().split('T')[0];
  const fromEl  = document.getElementById('date-dari');
  const toEl    = document.getElementById('date-sampai');
  if (fromEl) fromEl.value = weekAgo;
  if (toEl)   toEl.value   = today;

  // Tutup modal klik backdrop
  document.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', e => {
      if (e.target === overlay) overlay.classList.remove('show');
    });
  });

  // PIN state
  initPinLockState();
  updatePinDots();

  // Apply paper size on load
  const _prefs = getData('prefs', { paper_size: '80mm' });
  import('./modules/settings.js').then(m => m.applyPaperSize(_prefs.paper_size || '80mm'));
  // FIX-A: tampilkan pesan sesuai kondisi PIN
  const pinSudahDiganti = getData('_pin_sudah_diganti', false);
  const savedPin        = getData('pin', '1234');
  if (!pinSudahDiganti && savedPin === '1234') {
    showPinStatus('PIN default: 1234 — harap ganti!');
  } else {
    showPinStatus('Masukkan PIN Anda');
  }

  // Bind clear error saat user mulai ketik
  bindClearOnInput([
    'prod-nama','prod-hpp','prod-harga','prod-stok','prod-minstok',
    'jasa-nama','jasa-harga','uang-bayar','kasir-name',
    'set-nama','set-telp','set-sheets-url',
    'login-email','login-password','reg-nama','reg-email','reg-password',
    'pin-lama','pin-baru','pin-konfirm',
  ]);

  // FIX: input PIN di modal hanya terima angka
  ['pin-lama','pin-baru','pin-konfirm'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('input', function() {
      this.value = this.value.replace(/\D/g, '').slice(0, 4);
    });
  });

  // Online/offline
  window.addEventListener('online',  updateOnlineStatus);
  window.addEventListener('offline', updateOnlineStatus);
  updateOnlineStatus();

  // SW background sync
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('message', e => {
      if (e.data?.type === 'SYNC_PENDING_TRX') {
        const pending = getData('_pending_sync', []);
        if (pending.length > 0 && window.FB?.uid && typeof window.fbSimpanSemua === 'function') {
          window.fbSimpanSemua().then(() => {
            setData('_pending_sync', []);
            toast('✓ Data offline berhasil disinkronkan', 'success');
          });
        }
      }
    });
  }

  // Cek tour user baru — dipanggil setelah app siap via _appInit
  window._cekTourBaru = cekTourBaru;

  // Keyboard shortcut PIN
  document.addEventListener('keydown', e => {
    const pinScreen = document.getElementById('pin-screen');
    if (!pinScreen || pinScreen.style.display === 'none') return;
    if (['INPUT','TEXTAREA'].includes(document.activeElement?.tagName)) return;
    if (e.key >= '0' && e.key <= '9') pinInput(e.key);
    else if (e.key === 'Backspace' || e.key === 'Delete') pinDel();
    else if (e.key === 'Enter' && window._pinModule?.getPinLength?.() === 4) checkPin();
  });

  // Enter di form login/register
  document.getElementById('login-password')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') doLogin();
  });
  document.getElementById('reg-password')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') doRegister();
  });
});
