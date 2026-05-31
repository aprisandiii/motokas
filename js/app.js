// ===================================================
// MotoKas — app.js v4.2
// Perbaikan dari v4.1:
//  F1. renderRiwayat: pakai class .is-void bukan inline style opacity
//  F2. #offline-badge: hapus inline style, pakai CSS class
//  F3. simpanRestok: riwayat_stok lewat setData() agar sync Firebase
//  F4. tglKeyFromLocale: pastikan bulan 1-digit di-pad dengan benar
//  F5. voidTransaksi: fix celah waktu untuk trx dengan id kecil
//  F6. checkout: snapshot diskonMode agar konsisten
//  F7. window.terapkanPengaturan alias ke loadSettings (dibutuhkan firebase.js)
//  F8. pin-store-addr: fallback teks saat alamat kosong
// ===================================================

// ===== STATE =====
let deferredPrompt        = null;
let currentPin            = '';
let pinAttempts           = 0;
let lockUntil             = 0;
let cart                  = [];
let produkFilter          = 'Semua';
let diskonMode            = 'rp';
let paymentMethod         = 'tunai';
let lastNota              = '';
let lastTrx               = null;
let chartInstance         = null;
let _checkoutInProgress   = false;
let _currentTotal         = 0;

// ===== STORAGE =====
function getData(key, def) {
  try { return JSON.parse(localStorage.getItem(key)) ?? def; }
  catch { return def; }
}

function setData(key, val) {
  localStorage.setItem(key, JSON.stringify(val));
  if (key === 'produk')       window.produk       = val;
  if (key === 'laporan')      window.laporan      = val;
  if (key === 'riwayat')      window.riwayat      = val;
  if (key === 'settings')     window.pengaturan   = val;
  if (key === 'riwayat_stok') window.riwayatStok  = val;
  if (['produk', 'laporan', 'riwayat', 'settings', 'riwayat_stok'].includes(key)) {
    clearTimeout(window._fbSaveTimeout);
    window._fbSaveTimeout = setTimeout(() => {
      if (window.FB && window.FB.uid && typeof window.fbSimpanSemua === 'function') {
        window.fbSimpanSemua();
      }
    }, 800);
  }
}

window.getData = getData;
window.setData = setData;

window.produk      = getData('produk',       []);
window.laporan     = getData('laporan',      {});
window.riwayat     = getData('riwayat',      []);
window.pengaturan  = getData('settings',     {});
window.riwayatStok = getData('riwayat_stok', []);
window._pinPassed  = false;

// ===== RESET CART STATE =====
window.resetCartState = function () {
  cart                = [];
  diskonMode          = 'rp';
  paymentMethod       = 'tunai';
  lastNota            = '';
  lastTrx             = null;
  produkFilter        = 'Semua';
  _checkoutInProgress = false;
  _currentTotal       = 0;
  updateCartBadge();
  ['diskon-val', 'uang-bayar', 'mekanik-name', 'jasa-nama', 'jasa-harga', 'jasa-mekanik'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  const kemRow = document.getElementById('kembalian-row');
  if (kemRow) kemRow.style.display = 'none';
};

// ===== FIREBASE SYNC HELPERS =====
window.syncProdukDariFirebase = function () {
  localStorage.setItem('produk', JSON.stringify(window.produk || []));
  renderProduk();
};
window.syncLaporanDariFirebase = function () {
  localStorage.setItem('laporan', JSON.stringify(window.laporan || {}));
  renderLaporan();
  renderRiwayat();
};
window.syncRiwayatDariFirebase = function () {
  localStorage.setItem('riwayat', JSON.stringify(window.riwayat || []));
  renderRiwayat();
};
window.updateDashboard = function () { renderDashboard(); };

// F7: alias terapkanPengaturan → loadSettings (dibutuhkan firebase.js)
window.terapkanPengaturan = function () { loadSettings(); };

// ===== LAYAR =====
function showScreen(name) {
  const screens = {
    auth: document.getElementById('auth-screen'),
    pin:  document.getElementById('pin-screen'),
    app:  document.getElementById('app'),
  };
  Object.values(screens).forEach(el => { if (el) el.style.display = 'none'; });
  if (screens[name]) {
    screens[name].style.display = (name === 'pin' || name === 'auth') ? 'flex' : 'block';
  }
  const banner = document.getElementById('install-banner');
  if (banner) banner.style.zIndex = (name === 'app') ? '1000' : '-1';

  if (name === 'pin' || name === 'auth') {
    document.getElementById('force-pin-overlay')?.remove();
    document.getElementById('reset-confirm-overlay')?.remove();
  }
  if (name === 'pin') {
    currentPin = '';
    updatePinDots();
    showPinStatus('Masukkan PIN');
  }
}

// ===== INIT =====
window.addEventListener('load', () => {
  const sudahLogin = localStorage.getItem('mk_email');
  showScreen(sudahLogin ? 'pin' : 'auth');

  const s = getData('settings', {});
  document.getElementById('pin-store-name').textContent = s.nama   || 'Nama Toko';
  document.getElementById('pin-store-addr').textContent = s.alamat || 'Masukkan PIN untuk membuka kasir';

  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault();
    deferredPrompt = e;
    const banner = document.getElementById('install-banner');
    if (banner) banner.style.display = 'flex';
  });

  const today   = new Date().toISOString().split('T')[0];
  const weekAgo = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString().split('T')[0];
  document.getElementById('date-dari').value   = weekAgo;
  document.getElementById('date-sampai').value = today;

  document.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', e => {
      if (e.target === overlay) overlay.classList.remove('show');
    });
  });

  const savedLock = getData('_pin_lock_until', 0);
  if (savedLock && Date.now() < savedLock) {
    lockUntil   = savedLock;
    pinAttempts = getData('_pin_attempts', 0);
    const sisa  = Math.ceil((savedLock - Date.now()) / 1000);
    showPinStatus(`🔒 Terkunci ${formatSisa(sisa)} lagi`, 'error');
  }

  // P5: background sync — kirim ulang transaksi pending saat online kembali
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('message', e => {
      if (e.data && e.data.type === 'SYNC_PENDING_TRX') {
        const pending = getData('_pending_sync', []);
        if (pending.length > 0 && window.FB && window.FB.uid) {
          if (typeof window.fbSimpanSemua === 'function') {
            window.fbSimpanSemua().then(() => {
              setData('_pending_sync', []);
              toast('✓ Data offline berhasil disinkronkan', 'success');
            });
          }
        }
      }
    });
  }

  // F2: online/offline indicator — pakai CSS class, bukan inline style
  function updateOnlineStatus() {
    const isOnline = navigator.onLine;
    const existing = document.getElementById('offline-badge');
    if (!isOnline) {
      if (!existing) {
        const badge       = document.createElement('div');
        badge.id          = 'offline-badge';
        badge.textContent = '📴 Offline';
        document.body.appendChild(badge);
      }
    } else {
      if (existing) existing.remove();
      if ('serviceWorker' in navigator && 'SyncManager' in window) {
        navigator.serviceWorker.ready.then(sw => {
          sw.sync.register('sync-transaksi').catch(() => {});
        });
      }
    }
  }
  window.addEventListener('online',  updateOnlineStatus);
  window.addEventListener('offline', updateOnlineStatus);
  updateOnlineStatus();

  document.addEventListener('keydown', e => {
    const pinScreen = document.getElementById('pin-screen');
    if (!pinScreen || pinScreen.style.display === 'none') return;
    if (['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName)) return;
    if (e.key >= '0' && e.key <= '9') pinInput(e.key);
    else if (e.key === 'Backspace' || e.key === 'Delete') pinDel();
    else if (e.key === 'Enter' && currentPin.length === 4) checkPin();
  });
});

function formatSisa(detik) {
  const m = Math.floor(detik / 60);
  const d = detik % 60;
  return m > 0 ? `${m}m ${d}d` : `${d}d`;
}

function installPWA() {
  if (deferredPrompt) { deferredPrompt.prompt(); deferredPrompt = null; }
  document.getElementById('install-banner').style.display = 'none';
}

// ===== PIN =====
function pinInput(d) {
  if (currentPin.length >= 4) return;
  const savedLock = getData('_pin_lock_until', 0);
  if (savedLock && Date.now() < savedLock) {
    lockUntil = savedLock;
    const sisa = Math.ceil((savedLock - Date.now()) / 1000);
    showPinStatus(`🔒 Terkunci ${formatSisa(sisa)} lagi`, 'error');
    return;
  }
  currentPin += d;
  updatePinDots();
  if (currentPin.length === 4) setTimeout(checkPin, 200);
}

function pinDel() {
  currentPin = currentPin.slice(0, -1);
  updatePinDots();
}

function updatePinDots() {
  for (let i = 0; i < 4; i++) {
    document.getElementById('d' + i).classList.toggle('filled', i < currentPin.length);
  }
}

function showPinStatus(msg, type = '') {
  const el       = document.getElementById('pinStatus');
  el.textContent = msg;
  el.className   = 'pin-status ' + type;
}

function checkPin() {
  const saved = getData('pin', '1234');
  if (currentPin === saved) {
    showPinStatus('✓ Berhasil', 'success');
    pinAttempts = 0;
    setData('_pin_attempts',   0);
    setData('_pin_lock_until', 0);
    setTimeout(() => {
      showScreen('app');
      window._pinPassed = true;
      initApp();
      checkDefaultPin();
    }, 300);
  } else {
    pinAttempts++;
    setData('_pin_attempts', pinAttempts);
    if (pinAttempts >= 5) {
      lockUntil = Date.now() + 5 * 60 * 1000;
      setData('_pin_lock_until', lockUntil);
      pinAttempts = 0;
      setData('_pin_attempts', 0);
      showPinStatus('🔒 Terkunci 5 menit (5x salah)', 'error');
    } else {
      showPinStatus(`PIN salah (${pinAttempts}/5)`, 'error');
    }
    currentPin = '';
    updatePinDots();
    setTimeout(() => {
      if (Date.now() < getData('_pin_lock_until', 0)) return;
      showPinStatus('Masukkan PIN');
    }, 1500);
  }
}

function checkDefaultPin() {
  const saved        = getData('pin', '1234');
  const sudahDiganti = getData('_pin_sudah_diganti', false);
  if (saved === '1234' && !sudahDiganti) showForcePinChangeDialog();
}

function showForcePinChangeDialog() {
  if (document.getElementById('force-pin-overlay')) return;
  const overlay = document.createElement('div');
  overlay.id    = 'force-pin-overlay';
  overlay.style.cssText = `
    position:fixed;inset:0;background:rgba(0,0,0,0.85);
    z-index:99999;display:flex;align-items:center;justify-content:center;`;
  overlay.innerHTML = `
    <div style="background:#1a1a1a;border:2px solid #f5c542;border-radius:16px;
                padding:28px 24px;max-width:340px;width:90%;color:#fff;font-family:inherit">
      <div style="text-align:center;font-size:44px;margin-bottom:12px">🔑</div>
      <h3 style="text-align:center;margin:0 0 8px;color:#f5c542;font-size:17px">Ganti PIN Sekarang</h3>
      <p style="text-align:center;font-size:13px;color:#aaa;margin:0 0 20px;line-height:1.5">
        Anda masih menggunakan <strong style="color:#f5c542">PIN default (1234)</strong>.<br>
        Harap ganti untuk keamanan toko Anda.
      </p>
      <label style="display:block;font-size:12px;color:#888;margin-bottom:5px">PIN Baru (4 digit angka)</label>
      <input id="fp-baru" type="password" inputmode="numeric" maxlength="4" placeholder="••••"
        style="width:100%;box-sizing:border-box;padding:10px;border-radius:8px;border:2px solid #444;
               background:#111;color:#fff;font-size:22px;text-align:center;letter-spacing:8px;
               margin-bottom:12px;outline:none"/>
      <label style="display:block;font-size:12px;color:#888;margin-bottom:5px">Konfirmasi PIN Baru</label>
      <input id="fp-konfirm" type="password" inputmode="numeric" maxlength="4" placeholder="••••"
        style="width:100%;box-sizing:border-box;padding:10px;border-radius:8px;border:2px solid #444;
               background:#111;color:#fff;font-size:22px;text-align:center;letter-spacing:8px;
               margin-bottom:6px;outline:none"/>
      <p id="fp-error" style="color:#e74c3c;font-size:12px;min-height:16px;text-align:center;
                               margin:4px 0 16px"></p>
      <button onclick="saveForcedPin()"
        style="width:100%;padding:12px;border-radius:8px;border:none;
               background:#f5c542;color:#111;font-size:15px;font-weight:700;cursor:pointer">
        💾 Simpan PIN Baru
      </button>
    </div>`;
  document.body.appendChild(overlay);
  ['fp-baru', 'fp-konfirm'].forEach(id => {
    document.getElementById(id).addEventListener('input', function () {
      this.value = this.value.replace(/\D/g, '').slice(0, 4);
    });
  });
  document.getElementById('fp-baru').focus();
}

function saveForcedPin() {
  const baru    = document.getElementById('fp-baru').value.trim();
  const konfirm = document.getElementById('fp-konfirm').value.trim();
  const errEl   = document.getElementById('fp-error');
  if (baru.length !== 4)  { errEl.textContent = 'PIN harus 4 digit angka.'; return; }
  if (baru === '1234')     { errEl.textContent = 'PIN tidak boleh sama dengan default (1234).'; return; }
  if (baru !== konfirm)   { errEl.textContent = 'Konfirmasi PIN tidak cocok.'; return; }
  setData('pin', baru);
  setData('_pin_sudah_diganti', true);
  document.getElementById('force-pin-overlay').remove();
  toast('✓ PIN berhasil diubah! Harap ingat PIN baru Anda.', 'success');
}

function lockApp() {
  window._pinPassed = false;
  try {
    if (window.FB?.listeners && window._fbOff) {
      Object.values(window.FB.listeners).forEach(r => window._fbOff.off(r));
      window.FB.listeners = {};
    }
  } catch (e) { console.warn('lockApp: gagal hentikan listener', e); }

  const el = document.getElementById('uang-bayar');
  if (el) el.value = '';
  const kemRow = document.getElementById('kembalian-row');
  if (kemRow) kemRow.style.display = 'none';

  currentPin          = '';
  _checkoutInProgress = false;
  _currentTotal       = 0;
  updatePinDots();
  showPinStatus('Masukkan PIN');
  showScreen('pin');
}

function gantiPIN() {
  const lama    = document.getElementById('pin-lama').value;
  const baru    = document.getElementById('pin-baru').value;
  const konfirm = document.getElementById('pin-konfirm').value;
  const saved   = getData('pin', '1234');
  if (lama !== saved)                              { toast('PIN lama salah', 'error'); return; }
  if (baru.length !== 4 || !/^\d{4}$/.test(baru)) { toast('PIN baru harus 4 digit angka', 'error'); return; }
  if (baru !== konfirm)                            { toast('Konfirmasi PIN tidak cocok', 'error'); return; }
  setData('pin', baru);
  setData('_pin_sudah_diganti', true);
  closeModal('modal-pin');
  toast('PIN berhasil diganti ✓', 'success');
  ['pin-lama', 'pin-baru', 'pin-konfirm'].forEach(id => {
    document.getElementById(id).value = '';
  });
}

function resetPinPrompt() {
  const kode    = prompt('Masukkan kode rahasia untuk reset PIN:');
  const s       = getData('settings', {});
  const rahasia = s.kode_rahasia || 'MOTOR88';
  if (kode === rahasia) {
    setData('pin', '1234');
    setData('_pin_sudah_diganti', false);
    setData('_pin_lock_until', 0);
    setData('_pin_attempts', 0);
    lockUntil   = 0;
    pinAttempts = 0;
    showPinStatus('PIN direset ke 1234 ✓', 'success');
  } else {
    alert('Kode rahasia salah');
  }
}

// ===== APP INIT =====
function initApp() {
  window.produk      = getData('produk',       []);
  window.laporan     = getData('laporan',      {});
  window.riwayat     = getData('riwayat',      []);
  window.riwayatStok = getData('riwayat_stok', []);
  loadSettings();
  renderDashboard();
  renderProduk();
  renderLaporan();
  renderRiwayat();

  const savedKasir = localStorage.getItem('_last_kasir');
  if (savedKasir) {
    const el = document.getElementById('kasir-name');
    if (el && !el.value) el.value = savedKasir;
  }
  if (typeof window.injectCloudButton === 'function') window.injectCloudButton();

  let _fbRetry = 0;
  function tryFirebaseLoad() {
    if (_fbRetry >= 20) {
      console.warn('MotoKas: Firebase tidak siap setelah 6 detik, skip cloud sync.');
      return;
    }
    _fbRetry++;
    if (!window.FB?.uid) { setTimeout(tryFirebaseLoad, 300); return; }
    if (typeof window.fbLoadAllData === 'function') {
      window.fbLoadAllData().then(() => {
        if (typeof window.fbListenRealtime === 'function') window.fbListenRealtime();
      });
    } else {
      setTimeout(tryFirebaseLoad, 300);
    }
  }
  tryFirebaseLoad();
}

// ===== NAVIGASI =====
function navTo(page, btn) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.getElementById('page-' + page).classList.add('active');
  btn.classList.add('active');
  if (page === 'dashboard') renderDashboard();
  if (page === 'laporan')   { renderLaporan(); renderRiwayat(); }
}

// ===== PENGATURAN =====
function loadSettings() {
  const s = getData('settings', {});
  document.getElementById('set-nama').value         = s.nama         || '';
  document.getElementById('set-alamat').value       = s.alamat       || '';
  document.getElementById('set-telp').value         = s.telp         || '';
  document.getElementById('set-footer1').value      = s.footer1      || 'Terima kasih telah berbelanja!';
  document.getElementById('set-footer2').value      = s.footer2      || 'Barang yang sudah dibeli tidak dapat dikembalikan';
  document.getElementById('set-sheets-url').value   = s.sheets_url   || '';
  document.getElementById('set-kode-rahasia').value = s.kode_rahasia || '';
  document.getElementById('hdr-name').textContent   = s.nama         || 'Nama Toko';
  document.getElementById('hdr-sub').textContent    = (s.alamat ? s.alamat + ' — ' : '') + 'v4.2';
  document.getElementById('pin-store-name').textContent = s.nama  || 'Nama Toko';
  // F8: fallback teks pin-store-addr saat alamat dihapus
  document.getElementById('pin-store-addr').textContent = s.alamat || 'Masukkan PIN untuk membuka kasir';

  const prefs = getData('prefs', { auto_sheets: false, show_laba: false, stok_alert: true });
  setToggleState('toggle-auto-sheets', prefs.auto_sheets);
  setToggleState('toggle-show-laba',   prefs.show_laba);
  setToggleState('toggle-stok-alert',  prefs.stok_alert);
  updateSheetsStatus(!!s.sheets_url);
}

function saveSettings() {
  const s = {
    nama:         document.getElementById('set-nama').value,
    alamat:       document.getElementById('set-alamat').value,
    telp:         document.getElementById('set-telp').value,
    footer1:      document.getElementById('set-footer1').value,
    footer2:      document.getElementById('set-footer2').value,
    sheets_url:   document.getElementById('set-sheets-url').value,
    kode_rahasia: document.getElementById('set-kode-rahasia').value || 'MOTOR88',
  };
  setData('settings', s);
  document.getElementById('hdr-name').textContent = s.nama || 'Nama Toko';
  document.getElementById('hdr-sub').textContent  = (s.alamat ? s.alamat + ' — ' : '') + 'v4.2';
  // F8: sinkronkan juga ke pin screen saat settings berubah
  document.getElementById('pin-store-name').textContent = s.nama   || 'Nama Toko';
  document.getElementById('pin-store-addr').textContent = s.alamat || 'Masukkan PIN untuk membuka kasir';
  updateSheetsStatus(!!s.sheets_url);
  toast('Pengaturan disimpan ✓', 'success');
}

function toggleSetting(key, btn) {
  const prefs = getData('prefs', { auto_sheets: false, show_laba: false, stok_alert: true });
  prefs[key]  = !prefs[key];
  setData('prefs', prefs);
  setToggleState(btn.id, prefs[key]);
}

function setToggleState(id, on) {
  const el = document.getElementById(id);
  if (el) el.classList.toggle('on', on);
}

function updateSheetsStatus(connected) {
  const dot  = document.getElementById('sheets-dot');
  const text = document.getElementById('sheets-status-text');
  if (dot)  dot.classList.toggle('connected', connected);
  if (text) text.textContent = connected ? 'Terhubung' : 'Belum terhubung';
}

// ===== PRODUK =====
function getCatIcon(cat) {
  const icons = {
    'Oli': '🛢️', 'Spare Part': '⚙️', 'Aksesoris': '🔩',
    'Ban': '🔄', 'Aki': '🔋', 'Lainnya': '📦', 'Jasa Servis': '🔧',
  };
  return icons[cat] || '📦';
}

function renderProduk() {
  const produk   = getData('produk', []);
  const q        = (document.getElementById('search-produk').value || '').toLowerCase();
  const filtered = produk.filter(p =>
    (produkFilter === 'Semua' || p.kategori === produkFilter) &&
    (!q || p.nama.toLowerCase().includes(q) || (p.sku || '').toLowerCase().includes(q))
  );
  const list = document.getElementById('produk-list');
  if (filtered.length === 0) {
    list.innerHTML = '<div class="empty-state"><div class="empty-icon">📦</div>Belum ada produk.<br>Tap ＋ untuk tambah produk.</div>';
    return;
  }
  list.innerHTML = filtered.map(p => {
    const isLow = p.stok <= (p.minstok || 5);
    return `<div class="produk-card">
      <div class="produk-icon">${getCatIcon(p.kategori)}</div>
      <div class="produk-info">
        <div class="produk-name">${p.nama}</div>
        <div class="produk-meta">
          <span class="produk-price">${fmtRp(p.harga)}</span>
          <span class="produk-cat">${p.kategori}</span>
          <span class="produk-stok ${isLow ? 'low' : ''}">Stok: ${p.stok}${p.sku ? ' · ' + p.sku : ''}</span>
        </div>
      </div>
      <div class="produk-actions">
        <button class="btn-edit-prod" onclick="editProduk(${p.id})">✏️</button>
        <button class="btn-edit-prod" onclick="openRestok(${p.id})" title="Tambah stok masuk">📦+</button>
        <button class="btn-add-cart ${p.stok <= 0 ? 'disabled' : ''}"
          onclick="${p.stok > 0 ? `addToCart(${p.id})` : ''}">＋</button>
      </div>
    </div>`;
  }).join('');
}

function setFilter(el) {
  document.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
  el.classList.add('active');
  produkFilter = el.dataset.cat;
  renderProduk();
}

function openModal(id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.classList.add('show');
  if (id === 'modal-tambah-produk') {
    const editId = document.getElementById('edit-produk-id').value;
    if (!editId) {
      document.getElementById('modal-produk-title').textContent = 'Tambah Produk';
      ['prod-nama', 'prod-hpp', 'prod-harga', 'prod-stok', 'prod-minstok', 'prod-sku']
        .forEach(i => document.getElementById(i).value = '');
      document.getElementById('prod-cat').value = '';
      document.getElementById('edit-delete-row').style.display = 'none';
    }
  }
}

function closeModal(id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.classList.remove('show');
  if (id === 'modal-tambah-produk') {
    document.getElementById('edit-produk-id').value = '';
  }
}

function editProduk(id) {
  const p = getData('produk', []).find(x => x.id === id);
  if (!p) return;
  document.getElementById('modal-produk-title').textContent = 'Edit Produk';
  document.getElementById('edit-produk-id').value  = id;
  document.getElementById('prod-nama').value        = p.nama;
  document.getElementById('prod-cat').value         = p.kategori;
  document.getElementById('prod-hpp').value         = p.hpp || '';
  document.getElementById('prod-harga').value       = p.harga;
  document.getElementById('prod-stok').value        = p.stok;
  document.getElementById('prod-minstok').value     = p.minstok || '';
  document.getElementById('prod-sku').value         = p.sku || '';
  document.getElementById('edit-delete-row').style.display = 'block';
  openModal('modal-tambah-produk');
}

function simpanProduk() {
  const nama     = document.getElementById('prod-nama').value.trim();
  const kategori = document.getElementById('prod-cat').value;
  const hpp      = parseFloat(document.getElementById('prod-hpp').value)   || 0;
  const harga    = parseFloat(document.getElementById('prod-harga').value) || 0;
  const stok     = parseInt(document.getElementById('prod-stok').value)    || 0;
  const minstok  = parseInt(document.getElementById('prod-minstok').value) || 5;
  const sku      = document.getElementById('prod-sku').value.trim();
  const editId   = parseInt(document.getElementById('edit-produk-id').value) || 0;

  if (!nama)      { toast('Nama produk wajib diisi', 'error'); return; }
  if (!kategori)  { toast('Pilih kategori', 'error'); return; }
  if (harga <= 0) { toast('Harga jual harus diisi', 'error'); return; }

  let produk = getData('produk', []);
  if (editId) {
    produk = produk.map(p => p.id === editId
      ? { ...p, nama, kategori, hpp, harga, stok, minstok, sku }
      : p
    );
    toast('Produk diperbarui ✓', 'success');
  } else {
    const newId = Date.now() * 1000 + Math.floor(Math.random() * 1000);
    produk.push({ id: newId, nama, kategori, hpp, harga, stok, minstok, sku, terjual: 0 });
    toast('Produk ditambahkan ✓', 'success');
  }
  setData('produk', produk);
  closeModal('modal-tambah-produk');
  renderProduk();
  updateKritisCount();
}

// P1: hapusProduk dengan cek cart aktif
function hapusProduk() {
  const id         = parseInt(document.getElementById('edit-produk-id').value);
  const adaDiCart  = cart.some(c => c.id === id);
  if (adaDiCart) {
    toast('Produk ada di keranjang, hapus dari cart dulu', 'error');
    return;
  }
  if (!confirm('Yakin hapus produk ini?')) return;
  setData('produk', getData('produk', []).filter(p => p.id !== id));
  closeModal('modal-tambah-produk');
  renderProduk();
  toast('Produk dihapus');
}

// ===== RESTOK =====
function openRestok(id) {
  const p = getData('produk', []).find(x => x.id === id);
  if (!p) return;
  document.getElementById('restok-overlay')?.remove();

  const overlay = document.createElement('div');
  overlay.id    = 'restok-overlay';
  overlay.style.cssText = `
    position:fixed;inset:0;background:rgba(0,0,0,0.75);
    z-index:99998;display:flex;align-items:flex-end;justify-content:center;`;
  overlay.innerHTML = `
    <div style="background:#1a1a1a;border-radius:20px 20px 0 0;width:100%;max-width:480px;
                padding:24px 20px 32px;color:#fff;font-family:inherit">
      <div style="width:40px;height:4px;background:#444;border-radius:2px;margin:0 auto 20px"></div>
      <h3 style="margin:0 0 4px;font-size:16px;color:#f0ece6">📦 Stok Masuk</h3>
      <p style="font-size:13px;color:#888;margin:0 0 18px">
        ${p.nama} · Stok sekarang: <strong style="color:#f5c542">${p.stok}</strong>
      </p>
      <label style="display:block;font-size:12px;color:#888;margin-bottom:5px">Jumlah Masuk *</label>
      <input id="restok-qty" type="number" min="1" placeholder="contoh: 10"
        style="width:100%;box-sizing:border-box;padding:10px;border-radius:8px;border:2px solid #333;
               background:#111;color:#fff;font-size:16px;margin-bottom:12px;outline:none"/>
      <label style="display:block;font-size:12px;color:#888;margin-bottom:5px">Harga Modal Baru (HPP) — opsional</label>
      <input id="restok-hpp" type="number" min="0" placeholder="Kosongkan jika tidak berubah"
        style="width:100%;box-sizing:border-box;padding:10px;border-radius:8px;border:2px solid #333;
               background:#111;color:#fff;font-size:16px;margin-bottom:12px;outline:none"
        value="${p.hpp || ''}"/>
      <label style="display:block;font-size:12px;color:#888;margin-bottom:5px">Catatan — opsional</label>
      <input id="restok-catatan" type="text" placeholder="contoh: Beli dari Supplier A"
        style="width:100%;box-sizing:border-box;padding:10px;border-radius:8px;border:2px solid #333;
               background:#111;color:#fff;font-size:14px;margin-bottom:18px;outline:none"/>
      <button onclick="simpanRestok(${p.id})"
        style="width:100%;padding:12px;border-radius:8px;border:none;
               background:#f5c542;color:#111;font-size:15px;font-weight:700;cursor:pointer;margin-bottom:8px">
        💾 Simpan Stok Masuk
      </button>
      <button onclick="document.getElementById('restok-overlay').remove()"
        style="width:100%;padding:10px;border-radius:8px;border:1px solid #333;
               background:transparent;color:#888;font-size:14px;cursor:pointer">
        Batal
      </button>
    </div>`;
  document.body.appendChild(overlay);
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
  document.getElementById('restok-qty').focus();
}

// F3: simpanRestok — riwayat_stok lewat setData() agar ter-sync ke Firebase
function simpanRestok(id) {
  const qtyEl     = document.getElementById('restok-qty');
  const hppEl     = document.getElementById('restok-hpp');
  const catatanEl = document.getElementById('restok-catatan');
  const qty       = parseInt(qtyEl.value)   || 0;
  const hppBaru   = parseFloat(hppEl.value) || 0;
  const catatan   = catatanEl.value.trim();

  if (qty <= 0) { toast('Jumlah masuk harus lebih dari 0', 'error'); qtyEl.focus(); return; }

  let produk = getData('produk', []);
  const idx  = produk.findIndex(p => p.id === id);
  if (idx < 0) { toast('Produk tidak ditemukan', 'error'); return; }

  const stokLama = produk[idx].stok;
  produk[idx].stok += qty;
  if (hppBaru > 0) produk[idx].hpp = hppBaru;
  setData('produk', produk);

  // F3: pakai setData() bukan localStorage langsung — agar sync Firebase
  const riwayatStok = getData('riwayat_stok', []);
  riwayatStok.unshift({
    id:           Date.now(),
    produk_id:    id,
    nama:         produk[idx].nama,
    qty,
    stok_sebelum: stokLama,
    stok_sesudah: produk[idx].stok,
    hpp_baru:     hppBaru || null,
    catatan,
    waktu:        new Date().toLocaleString('id-ID'),
  });
  setData('riwayat_stok', riwayatStok.slice(0, 200));

  document.getElementById('restok-overlay').remove();
  renderProduk();
  updateKritisCount();
  toast(`Stok +${qty} berhasil dicatat ✓`, 'success');
}

// ===== CART =====
function addToCart(id) {
  const p = getData('produk', []).find(x => x.id === id);
  if (!p || p.stok <= 0) { toast('Stok habis', 'error'); return; }
  const existing = cart.find(c => c.id === id);
  if (existing) {
    if (existing.qty >= p.stok) { toast('Stok tidak cukup', 'error'); return; }
    existing.qty++;
    existing.maxStok = p.stok;
  } else {
    cart.push({ id, nama: p.nama, harga: p.harga, hpp: p.hpp || 0, qty: 1, maxStok: p.stok });
  }
  updateCartBadge();
  renderCart();
  hitungTotal();
  toast(`${p.nama} ditambahkan ✓`);
}

function tambahJasa() {
  const nama    = document.getElementById('jasa-nama').value.trim();
  const harga   = parseFloat(document.getElementById('jasa-harga').value) || 0;
  const mekanik = document.getElementById('jasa-mekanik').value.trim();

  if (!nama)      { toast('Nama jasa wajib diisi', 'error'); return; }
  if (harga <= 0) { toast('Harga jasa harus diisi', 'error'); return; }

  cart.push({
    id:      'jasa-' + Date.now(),
    nama:    nama + (mekanik ? ` (${mekanik})` : ''),
    harga,
    hpp:     0,
    qty:     1,
    maxStok: 999,
    isJasa:  true,
    mekanik,
  });

  document.getElementById('jasa-nama').value    = '';
  document.getElementById('jasa-harga').value   = '';
  document.getElementById('jasa-mekanik').value = '';

  updateCartBadge();
  renderCart();
  hitungTotal();
  toast(`Jasa "${nama}" ditambahkan ✓`);
}

function updateCartBadge() {
  const total = cart.reduce((s, c) => s + c.qty, 0);
  const badge = document.getElementById('cart-badge');
  if (!badge) return;
  badge.style.display = total > 0 ? 'flex' : 'none';
  badge.textContent   = total;
}

function renderCart() {
  const list  = document.getElementById('cart-list');
  const empty = document.getElementById('cart-empty');
  if (!list || !empty) return;

  if (cart.length === 0) {
    list.style.display  = 'none';
    empty.style.display = 'block';
    const btn = document.getElementById('btn-checkout');
    if (btn) btn.disabled = true;
    return;
  }

  const produkTerbaru = getData('produk', []);
  cart.forEach(c => {
    const p = produkTerbaru.find(x => x.id === c.id);
    if (p) c.maxStok = p.stok;
  });

  list.style.display  = 'flex';
  empty.style.display = 'none';
  const btn = document.getElementById('btn-checkout');
  if (btn) btn.disabled = false;

  list.innerHTML = cart.map((c, i) => `
    <div class="cart-item">
      <div style="flex:1">
        <div class="cart-item-name">${c.nama}</div>
        <div class="cart-item-price">${fmtRp(c.harga)} × ${c.qty}</div>
      </div>
      <div class="cart-qty-ctrl">
        <button class="qty-btn" onclick="changeQty(${i},-1)">−</button>
        <span class="qty-val">${c.qty}</span>
        <button class="qty-btn" onclick="changeQty(${i},1)">+</button>
      </div>
      <div class="cart-sub">${fmtRp(c.harga * c.qty)}</div>
      <button class="btn-rm" onclick="removeCart(${i})">✕</button>
    </div>`).join('');
}

function changeQty(i, d) {
  cart[i].qty = Math.max(1, Math.min(cart[i].maxStok, cart[i].qty + d));
  renderCart();
  hitungTotal();
}

function removeCart(i) {
  cart.splice(i, 1);
  updateCartBadge();
  renderCart();
  hitungTotal();
}

function hitungDiskon(subtotal, mode) {
  // F6: terima mode sebagai parameter agar konsisten saat checkout
  const dv = parseFloat(document.getElementById('diskon-val').value) || 0;
  const m  = mode || diskonMode;
  if (m === 'pct') return Math.round(subtotal * Math.min(100, Math.max(0, dv)) / 100);
  return Math.min(dv, subtotal);
}

function hitungTotal() {
  const subtotal = cart.reduce((s, c) => s + c.harga * c.qty, 0);
  const diskon   = hitungDiskon(subtotal);
  const total    = Math.max(0, subtotal - diskon);

  _currentTotal = total;

  const coSub  = document.getElementById('co-subtotal');
  const coDis  = document.getElementById('co-diskon');
  const coTot  = document.getElementById('co-total');
  if (coSub)  coSub.textContent  = fmtRp(subtotal);
  if (coDis)  coDis.textContent  = '- ' + fmtRp(diskon);
  if (coTot)  coTot.textContent  = fmtRp(total);

  const labaEstimasi = cart.reduce((s, c) => s + (c.harga - c.hpp) * c.qty, 0) - diskon;
  const labaWarn     = document.getElementById('laba-warn');
  if (labaWarn) {
    labaWarn.style.display = labaEstimasi < 0 ? 'block' : 'none';
    labaWarn.textContent   = `⚠️ Estimasi laba minus: ${fmtRp(labaEstimasi)}`;
  }
  hitungKembalian();
}

function setDiskonMode(mode) {
  diskonMode = mode;
  document.getElementById('diskon-rp').classList.toggle('active',  mode === 'rp');
  document.getElementById('diskon-pct').classList.toggle('active', mode === 'pct');
  hitungTotal();
}

function setPayment(btn, method) {
  paymentMethod = method;
  document.querySelectorAll('.payment-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  const tunaiSection = document.getElementById('tunai-section');
  if (tunaiSection) tunaiSection.style.display = method === 'tunai' ? 'block' : 'none';
}

function hitungKembalian() {
  const total = _currentTotal;
  const bayar = parseFloat(document.getElementById('uang-bayar').value) || 0;
  const row   = document.getElementById('kembalian-row');
  if (!row) return;
  if (bayar > 0) {
    row.style.display = 'flex';
    const kembalian   = bayar - total;
    const valEl       = document.getElementById('kembalian-val');
    if (!valEl) return;
    if (kembalian < 0) {
      valEl.textContent = '- ' + fmtRp(Math.abs(kembalian)) + ' ⚠️';
      valEl.style.color = 'var(--red)';
    } else {
      valEl.textContent = fmtRp(kembalian);
      valEl.style.color = 'var(--green)';
    }
  } else {
    row.style.display = 'none';
  }
}

function checkout() {
  if (cart.length === 0) return;
  if (_checkoutInProgress) { toast('Sedang memproses...'); return; }
  _checkoutInProgress = true;

  // F6: snapshot diskonMode saat tombol checkout ditekan agar konsisten
  const snapshotDiskonMode = diskonMode;

  const subtotal = cart.reduce((s, c) => s + c.harga * c.qty, 0);
  const diskon   = hitungDiskon(subtotal, snapshotDiskonMode);
  const total    = Math.max(0, subtotal - diskon);
  const kasir    = document.getElementById('kasir-name').value   || 'Kasir';
  const mekanik  = document.getElementById('mekanik-name').value || '';
  const bayar    = parseFloat(document.getElementById('uang-bayar').value) || 0;

  if (paymentMethod === 'tunai') {
    if (bayar <= 0) {
      toast('Masukkan jumlah uang bayar', 'error');
      _checkoutInProgress = false;
      return;
    }
    if (bayar < total) {
      toast(`Uang bayar kurang ${fmtRp(total - bayar)}!`, 'error');
      const el = document.getElementById('uang-bayar');
      if (el) {
        el.focus();
        el.style.outline = '2px solid var(--red)';
        setTimeout(() => { el.style.outline = ''; }, 2000);
      }
      _checkoutInProgress = false;
      return;
    }
  }

  let produk = getData('produk', []);
  for (const c of cart) {
    if (c.isJasa) continue;
    const p = produk.find(x => x.id === c.id);
    if (!p || p.stok < c.qty) {
      toast(`Stok ${c.nama} tidak cukup (tersisa ${p ? p.stok : 0})`, 'error');
      _checkoutInProgress = false;
      return;
    }
  }

  cart.forEach(c => {
    if (c.isJasa) return;
    const idx = produk.findIndex(p => p.id === c.id);
    if (idx >= 0) {
      produk[idx].stok    = Math.max(0, produk[idx].stok - c.qty);
      produk[idx].terjual = (produk[idx].terjual || 0) + c.qty;
    }
  });
  setData('produk', produk);

  const now = new Date();
  const trx = {
    id:        Date.now(),
    waktu:     now.toLocaleString('id-ID'),
    items:     cart.map(c => ({ ...c })),
    subtotal, diskon, total,
    metode:    paymentMethod,
    bayar:     paymentMethod === 'tunai' ? bayar : total,
    kembalian: paymentMethod === 'tunai' ? Math.max(0, bayar - total) : 0,
    kasir,
    mekanik,
    laba:      cart.reduce((s, c) => s + (c.harga - c.hpp) * c.qty, 0) - diskon,
    status:    'selesai',
  };

  const riwayat = getData('riwayat', []);
  riwayat.unshift(trx);
  setData('riwayat', riwayat);

  const tgl     = tglKey(now);
  const laporan = getData('laporan', {});
  if (!laporan[tgl]) laporan[tgl] = { omzet: 0, laba: 0, trx: 0, terlaris: {} };
  laporan[tgl].omzet += total;
  laporan[tgl].laba  += trx.laba;
  laporan[tgl].trx++;
  cart.forEach(c => {
    const safeKey = c.nama.replace(/[.#$\/\[\]\s]/g, '_');
    if (!laporan[tgl].terlaris[safeKey]) laporan[tgl].terlaris[safeKey] = { nama: c.nama, qty: 0 };
    laporan[tgl].terlaris[safeKey].qty += c.qty;
  });
  setData('laporan', laporan);

  lastTrx  = trx;
  lastNota = generateNota(trx);
  const notaContent = document.getElementById('nota-content');
  if (notaContent) notaContent.textContent = lastNota;

  const prefs = getData('prefs', {});
  if (prefs.auto_sheets) kirimSheets(trx);

  if (!navigator.onLine) {
    const pending = getData('_pending_sync', []);
    pending.push(trx.id);
    setData('_pending_sync', pending);
  }

  localStorage.setItem('_last_kasir', kasir);

  cart                = [];
  _checkoutInProgress = false;
  _currentTotal       = 0;
  updateCartBadge();
  renderCart();
  hitungTotal();
  const diskonVal = document.getElementById('diskon-val');
  const uangBayar = document.getElementById('uang-bayar');
  if (diskonVal) diskonVal.value = '';
  if (uangBayar) uangBayar.value = '';

  toast('✓ Transaksi berhasil!', 'success');
  openModal('modal-nota');
  renderProduk();
  updateKritisCount();

  const prefs2 = getData('prefs', { stok_alert: true });
  if (prefs2.stok_alert) cekStokKritisPaskaCheckout(trx.items);
}

function cekStokKritisPaskaCheckout(items) {
  const produk = getData('produk', []);
  const kritis = [];
  items.forEach(item => {
    if (item.isJasa) return;
    const p = produk.find(x => x.id === item.id);
    if (p && p.stok <= (p.minstok || 5)) kritis.push(`${p.nama} (sisa ${p.stok})`);
  });
  if (kritis.length > 0) {
    setTimeout(() => toast(`⚠️ Stok kritis: ${kritis.join(', ')}`, 'error'), 1000);
  }
}

// ===== VOID =====
function voidTransaksi(trxId) {
  const riwayat = getData('riwayat', []);
  const trx     = riwayat.find(r => r.id === trxId);
  if (!trx)                    { toast('Transaksi tidak ditemukan', 'error'); return; }
  if (trx.status === 'void')   { toast('Transaksi sudah dibatalkan', 'error'); return; }

  // F5: selalu gunakan trx.id sebagai timestamp (semua id baru > 1e12)
  let waktuTrx;
  if (trx.id > 1e12) {
    waktuTrx = trx.id;
  } else {
    const parsed = tglKeyFromLocale(trx.waktu);
    if (parsed) {
      const jamMatch = trx.waktu.match(/(\d{2})\.(\d{2})/);
      if (jamMatch) {
        const [, jam, menit] = jamMatch;
        waktuTrx = new Date(`${parsed}T${jam}:${menit}:00`).getTime();
      } else {
        waktuTrx = new Date(parsed).getTime();
      }
    } else {
      toast('Waktu transaksi tidak valid, void tidak bisa dilakukan', 'error');
      return;
    }
  }

  const selisihJam = (Date.now() - waktuTrx) / (1000 * 3600);
  if (selisihJam > 24) {
    toast('Void hanya bisa dilakukan dalam 24 jam setelah transaksi', 'error');
    return;
  }

  const overlay = document.createElement('div');
  overlay.id    = 'void-overlay';
  overlay.style.cssText = `
    position:fixed;inset:0;background:rgba(0,0,0,0.8);
    z-index:99999;display:flex;align-items:center;justify-content:center;`;
  overlay.innerHTML = `
    <div style="background:#1a1a1a;border:2px solid #e74c3c;border-radius:16px;
                padding:24px;max-width:340px;width:90%;color:#fff;font-family:inherit">
      <div style="text-align:center;font-size:36px;margin-bottom:12px">🚫</div>
      <h3 style="text-align:center;margin:0 0 8px;color:#e74c3c;font-size:16px">Batalkan Transaksi</h3>
      <p style="font-size:13px;color:#aaa;text-align:center;margin:0 0 12px;line-height:1.5">
        Total: <strong style="color:#f5c542">${fmtRp(trx.total)}</strong><br>
        Waktu: ${trx.waktu}<br>Stok produk akan dikembalikan.
      </p>
      <label style="display:block;font-size:12px;color:#888;margin-bottom:5px">Alasan void *</label>
      <input id="void-alasan" type="text" placeholder="contoh: Salah input qty"
        style="width:100%;box-sizing:border-box;padding:10px;border-radius:8px;border:2px solid #444;
               background:#111;color:#fff;font-size:14px;margin-bottom:16px;outline:none"/>
      <div style="display:flex;gap:8px">
        <button onclick="document.getElementById('void-overlay').remove()"
          style="flex:1;padding:10px;border-radius:8px;border:1px solid #444;
                 background:transparent;color:#888;font-size:14px;cursor:pointer">Batal</button>
        <button onclick="konfirmasiVoid(${trxId})"
          style="flex:1;padding:10px;border-radius:8px;border:none;
                 background:#e74c3c;color:#fff;font-size:14px;font-weight:700;cursor:pointer">
          Batalkan Trx
        </button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
  document.getElementById('void-alasan').focus();
}

function konfirmasiVoid(trxId) {
  const alasan = document.getElementById('void-alasan').value.trim();
  if (!alasan) { toast('Isi alasan void', 'error'); return; }

  let riwayat = getData('riwayat', []);
  const idx   = riwayat.findIndex(r => r.id === trxId);
  if (idx < 0)                        { toast('Transaksi tidak ditemukan', 'error'); return; }
  if (riwayat[idx].status === 'void') { toast('Sudah dibatalkan', 'error'); return; }

  const trx    = riwayat[idx];
  let produk   = getData('produk', []);
  trx.items.forEach(item => {
    const pidx = produk.findIndex(p => p.id === item.id);
    if (pidx >= 0) {
      produk[pidx].stok    = (produk[pidx].stok    || 0) + item.qty;
      produk[pidx].terjual = Math.max(0, (produk[pidx].terjual || 0) - item.qty);
    }
  });
  setData('produk', produk);

  const tglTrx = tglKeyFromLocale(trx.waktu);
  if (tglTrx) {
    const laporan = getData('laporan', {});
    if (laporan[tglTrx]) {
      laporan[tglTrx].omzet = Math.max(0, laporan[tglTrx].omzet - trx.total);
      laporan[tglTrx].laba  = laporan[tglTrx].laba - trx.laba;
      laporan[tglTrx].trx   = Math.max(0, laporan[tglTrx].trx - 1);
    }
    setData('laporan', laporan);
  }

  riwayat[idx] = {
    ...trx,
    status:      'void',
    void_alasan: alasan,
    void_waktu:  new Date().toLocaleString('id-ID'),
  };
  setData('riwayat', riwayat);

  document.getElementById('void-overlay').remove();
  renderRiwayat();
  renderProduk();
  renderDashboard();
  toast('Transaksi berhasil dibatalkan ✓', 'success');
}

// F4: tglKeyFromLocale — pad bulan dan hari secara konsisten
function tglKeyFromLocale(waktuStr) {
  try {
    // Format id-ID: "29/5/2026, 14.30.00" atau "29/05/2026"
    const match = waktuStr.match(/(\d{1,2})[\/\.](\d{1,2})[\/\.](\d{4})/);
    if (match) {
      const [, dd, mm, yyyy] = match;
      return `${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`;
    }
  } catch (e) { /* */ }
  return null;
}

// ===== NOTA =====
function generateNota(trx) {
  const s     = getData('settings', {});
  const prefs = getData('prefs', { show_laba: false });
  const w     = 32;
  const center = str => ' '.repeat(Math.max(0, Math.floor((w - str.length) / 2))) + str;
  const line   = '================================';
  const dash   = '--------------------------------';
  let n = '';
  n += center(s.nama  || 'MotoKas') + '\n';
  if (s.alamat) n += center(s.alamat) + '\n';
  if (s.telp)   n += center('Telp: ' + s.telp) + '\n';
  n += line + '\n';
  n += `Waktu  : ${trx.waktu}\n`;
  n += `Kasir  : ${trx.kasir}\n`;
  if (trx.mekanik) n += `Mekanik: ${trx.mekanik}\n`;
  n += `Metode : ${trx.metode.toUpperCase()}\n`;
  n += dash + '\n';
  trx.items.forEach(i => {
    const namaShort = i.nama.length > 30 ? i.nama.substring(0, 30) + '..' : i.nama;
    n += `${namaShort}\n`;
    n += `  ${i.qty} x ${fmtRp(i.harga)}\n`;
    n += `  = ${fmtRp(i.harga * i.qty)}\n`;
  });
  n += dash + '\n';
  n += `Subtotal: ${fmtRp(trx.subtotal)}\n`;
  if (trx.diskon > 0) n += `Diskon  : -${fmtRp(trx.diskon)}\n`;
  n += `TOTAL   : ${fmtRp(trx.total)}\n`;
  if (trx.metode === 'tunai') {
    n += `Bayar   : ${fmtRp(trx.bayar)}\n`;
    n += `Kembali : ${fmtRp(trx.kembalian)}\n`;
  }
  if (prefs.show_laba && trx.laba !== undefined) {
    n += dash + '\n';
    n += `Laba    : ${fmtRp(trx.laba)}\n`;
  }
  n += center(s.footer1 || 'Terima kasih!') + '\n';
  if (s.footer2) {
    const words = s.footer2.split(' ');
    let baris = '';
    words.forEach(word => {
      if ((baris + ' ' + word).trim().length > 30) {
        n += center(baris.trim()) + '\n';
        baris = word;
      } else {
        baris = (baris + ' ' + word).trim();
      }
    });
    if (baris) n += center(baris.trim()) + '\n';
  }
  return n;
}

function lihatDetailTrx(trxId) {
  const riwayat = getData('riwayat', []);
  const trx     = riwayat.find(r => r.id === trxId);
  if (!trx) { toast('Transaksi tidak ditemukan', 'error'); return; }
  const nota = generateNota(trx);
  const notaContent = document.getElementById('nota-content');
  if (notaContent) notaContent.textContent = nota;
  openModal('modal-nota');
}

function cetakNotaTerakhir() {
  if (!lastNota) { toast('Belum ada transaksi', 'error'); return; }
  openModal('modal-nota');
}

async function shareNota() {
  if (navigator.share) {
    try { await navigator.share({ title: 'Struk Transaksi', text: lastNota }); } catch (e) { /* */ }
  } else {
    navigator.clipboard.writeText(lastNota).then(() => toast('Struk disalin ke clipboard ✓'));
  }
}

// ===== DASHBOARD =====
function renderDashboard() {
  const laporan = getData('laporan', {});
  const tgl     = tglKey();
  const hari    = laporan[tgl] || { omzet: 0, laba: 0, trx: 0 };
  const statOmz = document.getElementById('stat-omzet');
  const statLab = document.getElementById('stat-laba');
  const statTrx = document.getElementById('stat-trx');
  if (statOmz) statOmz.textContent = fmtRpShort(hari.omzet);
  if (statLab) statLab.textContent = fmtRpShort(hari.laba);
  if (statTrx) statTrx.textContent = hari.trx;
  updateKritisCount();
  renderChart();
  renderTerlaris();
}

function updateKritisCount() {
  const produk = getData('produk', []);
  const kritis = produk.filter(p => p.stok <= (p.minstok || 5));
  const statKr = document.getElementById('stat-kritis');
  if (statKr) statKr.textContent = kritis.length;
  const list = document.getElementById('kritis-list');
  if (!list) return;
  if (kritis.length === 0) {
    list.innerHTML = '<div class="empty-state"><div class="empty-icon">✅</div>Semua stok aman</div>';
    return;
  }
  list.innerHTML = kritis.map(p => `
    <div class="kritis-item">
      <div>
        <div class="kritis-name">${p.nama}</div>
        <div class="kritis-stok">${p.stok} unit tersisa</div>
      </div>
      <div style="display:flex;align-items:center;gap:8px">
        <span class="badge-kritis">${p.stok <= 0 ? 'HABIS' : 'KRITIS'}</span>
        <button onclick="openRestok(${p.id})"
          style="padding:4px 8px;border-radius:6px;border:1px solid #f5c542;
                 background:transparent;color:#f5c542;font-size:11px;cursor:pointer">
          +Stok
        </button>
      </div>
    </div>`).join('');
}

function renderChart() {
  if (typeof Chart === 'undefined') {
    console.warn('MotoKas: Chart.js belum loaded, skip renderChart');
    const canvas = document.getElementById('chartOmzet');
    if (canvas) {
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle   = '#5a5550';
      ctx.font        = '12px sans-serif';
      ctx.textAlign   = 'center';
      ctx.fillText('Chart tidak tersedia (offline)', canvas.width / 2, 60);
    }
    return;
  }

  const laporan  = getData('laporan', {});
  const days = [], omzetData = [], labaData = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(Date.now() - i * 24 * 3600 * 1000);
    days.push(d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' }));
    const tgl = tglKey(d);
    omzetData.push(laporan[tgl]?.omzet || 0);
    labaData.push(laporan[tgl]?.laba   || 0);
  }
  const canvas = document.getElementById('chartOmzet');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (chartInstance) chartInstance.destroy();
  chartInstance = new Chart(ctx, {
    type: 'bar',
    data: {
      labels:   days,
      datasets: [
        { label: 'Omzet', data: omzetData, backgroundColor: 'rgba(245,197,66,0.7)',  borderRadius: 4 },
        { label: 'Laba',  data: labaData,  backgroundColor: 'rgba(76,175,125,0.7)',  borderRadius: 4 },
      ],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { grid: { color: '#2e2e2e' }, ticks: { color: '#5a5550', font: { size: 10 } } },
        y: {
          grid:  { color: '#2e2e2e' },
          ticks: { color: '#5a5550', font: { size: 10 }, callback: v => fmtRpShort(v) },
        },
      },
    },
  });
}

function renderTerlaris() {
  const laporan      = getData('laporan', {});
  const now          = new Date();
  const bulan        = now.getMonth();
  const tahun        = now.getFullYear();
  const totalTerjual = {};

  Object.entries(laporan).forEach(([tgl, data]) => {
    let d;
    if (tgl.includes('-')) {
      d = new Date(tgl);
    } else {
      const parts = tgl.split('/');
      if (parts.length === 3) d = new Date(parts[2], parts[1] - 1, parts[0]);
    }
    if (d && d.getMonth() === bulan && d.getFullYear() === tahun) {
      Object.entries(data.terlaris || {}).forEach(([, val]) => {
        const nama = typeof val === 'object' ? val.nama : String(val);
        const qty  = typeof val === 'object' ? val.qty  : 1;
        totalTerjual[nama] = (totalTerjual[nama] || 0) + qty;
      });
    }
  });

  const sorted = Object.entries(totalTerjual).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const el     = document.getElementById('terlaris-list');
  if (!el) return;
  if (sorted.length === 0) {
    el.innerHTML = '<div class="empty-state"><div class="empty-icon">📦</div>Belum ada data penjualan</div>';
    return;
  }
  el.innerHTML = sorted.map(([nama, qty], i) => `
    <div class="kritis-item" style="margin-bottom:8px">
      <div class="kritis-name">${i + 1}. ${nama}</div>
      <span style="font-size:13px;font-weight:700;color:var(--accent)">${qty} unit</span>
    </div>`).join('');
}

// ===== LAPORAN =====
function renderLaporan() {
  const laporan = getData('laporan', {});
  const dari    = document.getElementById('date-dari').value;
  const sampai  = document.getElementById('date-sampai').value;

  const entries = Object.entries(laporan).map(([tgl, data]) => {
    let iso, display;
    if (tgl.includes('-')) {
      iso     = tgl;
      display = tglDisplay(tgl);
    } else {
      const parts = tgl.split('/');
      if (parts.length === 3 && parts[2].length === 4) {
        iso     = `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
        display = tgl;
      } else {
        iso     = null;
        display = tgl;
      }
    }
    return { tgl: display, iso, ...data };
  }).filter(e => {
    if (!e.iso) return false;
    return (!dari || e.iso >= dari) && (!sampai || e.iso <= sampai);
  }).sort((a, b) => b.iso.localeCompare(a.iso));

  const tbody = document.getElementById('laporan-tbody');
  if (!tbody) return;
  if (entries.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--text3);padding:20px">Belum ada laporan</td></tr>';
    return;
  }
  tbody.innerHTML = entries.map(e => {
    const terlarisArr = Object.entries(e.terlaris || {})
      .map(([k, v]) => [
        typeof v === 'object' ? v.nama : k.replace(/_/g, ' '),
        typeof v === 'object' ? v.qty  : v,
      ])
      .sort((a, b) => b[1] - a[1]);
    const terlaris = terlarisArr[0];
    return `<tr>
      <td>${e.tgl}</td>
      <td style="color:var(--accent)">${fmtRpShort(e.omzet)}</td>
      <td style="color:var(--green)">${fmtRpShort(e.laba)}</td>
      <td>${e.trx}</td>
      <td style="color:var(--text2)">${terlaris ? terlaris[0] : '-'}</td>
    </tr>`;
  }).join('');
  renderLaporanMekanik();
}

function resetDateFilter() {
  const today   = new Date().toISOString().split('T')[0];
  const weekAgo = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString().split('T')[0];
  document.getElementById('date-dari').value   = weekAgo;
  document.getElementById('date-sampai').value = today;
  renderLaporan();
}

// F1: renderRiwayat — pakai class .is-void bukan inline style opacity
function renderRiwayat() {
  const riwayat   = getData('riwayat', []);
  const filterPay = (document.getElementById('filter-payment')?.value) || '';
  const filterMek = (document.getElementById('filter-mekanik')?.value || '').toLowerCase().trim();
  let filtered    = filterPay ? riwayat.filter(r => r.metode === filterPay) : riwayat;
  if (filterMek) {
    filtered = filtered.filter(r =>
      r.items.some(i => i.isJasa && i.mekanik && i.mekanik.toLowerCase().includes(filterMek))
    );
  }
  const el = document.getElementById('riwayat-list');
  if (!el) return;
  if (filtered.length === 0) {
    el.innerHTML = '<div class="empty-state"><div class="empty-icon">🧾</div>Belum ada transaksi</div>';
    return;
  }
  el.innerHTML = filtered.map(r => {
    const isVoid    = r.status === 'void';
    const voidBadge = isVoid
      ? `<span style="font-size:10px;background:#e74c3c22;color:#e74c3c;padding:2px 6px;
                      border-radius:4px;margin-left:6px">VOID</span>` : '';
    const voidInfo  = isVoid
      ? `<div style="font-size:11px;color:#e74c3c;margin-top:4px">Dibatalkan: ${r.void_alasan || '-'}</div>` : '';
    const voidBtn   = !isVoid
      ? `<button onclick="event.stopPropagation();voidTransaksi(${r.id})"
           style="font-size:11px;padding:3px 8px;border-radius:5px;border:1px solid #e74c3c55;
                  background:transparent;color:#e74c3c;cursor:pointer;margin-top:6px">
           🚫 Void
         </button>` : '';
    // F1: pakai class .is-void, bukan inline style opacity
    return `
    <div class="riwayat-item${isVoid ? ' is-void' : ''}" onclick="lihatDetailTrx(${r.id})" style="cursor:pointer">
      <div class="riwayat-header">
        <div>
          <div style="font-size:13px;font-weight:600">${r.kasir}${voidBadge}</div>
          <div class="riwayat-waktu">${r.waktu}</div>
        </div>
        <div style="text-align:right">
          <div class="riwayat-total"
            style="${isVoid ? 'text-decoration:line-through;color:var(--text3)' : ''}">${fmtRp(r.total)}</div>
          <span class="badge-payment ${r.metode}">${r.metode.toUpperCase()}</span>
        </div>
      </div>
      <div class="riwayat-detail">
        ${r.items.map(i => `${i.nama} ×${i.qty}`).join(' · ')}
        ${r.diskon > 0 ? `<br>Diskon: ${fmtRp(r.diskon)}` : ''}
      </div>
      ${voidInfo}${voidBtn}
    </div>`;
  }).join('');
  renderLaporanMekanik();
}

function renderLaporanMekanik() {
  const riwayat = getData('riwayat', []);
  const now     = new Date();
  const bulan   = now.getMonth();
  const tahun   = now.getFullYear();
  const data    = {};

  riwayat.forEach(trx => {
    if (trx.status === 'void') return;
    const tgl = tglKeyFromLocale(trx.waktu);
    if (!tgl) return;
    const d = new Date(tgl);
    if (d.getMonth() !== bulan || d.getFullYear() !== tahun) return;

    trx.items.forEach(item => {
      if (!item.isJasa || !item.mekanik) return;
      const m = item.mekanik;
      if (!data[m]) data[m] = { nama: m, totalJasa: 0, jumlah: 0 };
      data[m].totalJasa += item.harga * item.qty;
      data[m].jumlah++;
    });
  });

  const el     = document.getElementById('laporan-mekanik-list');
  if (!el) return;
  const sorted = Object.values(data).sort((a, b) => b.totalJasa - a.totalJasa);

  if (sorted.length === 0) {
    el.innerHTML = '<div class="empty-state"><div class="empty-icon">🔧</div>Belum ada data jasa bulan ini</div>';
    return;
  }

  el.innerHTML = sorted.map(m => `
    <div class="kritis-item" style="margin-bottom:8px">
      <div>
        <div class="kritis-name">🔧 ${m.nama}</div>
        <div style="font-size:11px;color:var(--text3)">${m.jumlah} pekerjaan</div>
      </div>
      <div style="text-align:right">
        <div style="font-size:14px;font-weight:700;color:var(--accent)">${fmtRp(m.totalJasa)}</div>
      </div>
    </div>`).join('');
}

// ===== EXPORT =====
function exportCSV() {
  const laporan = getData('laporan', {});
  let csv = 'Tanggal,Omzet,Laba,Transaksi,Terlaris\n';
  Object.entries(laporan).forEach(([tgl, d]) => {
    const terlarisArr = Object.entries(d.terlaris || {})
      .map(([k, v]) => [typeof v === 'object' ? v.nama : k.replace(/_/g, ' '), typeof v === 'object' ? v.qty : v])
      .sort((a, b) => b[1] - a[1]);
    const terlarisNama = terlarisArr.length ? terlarisArr[0][0] : '-';
    csv += `${tgl},${d.omzet},${d.laba},${d.trx},"${terlarisNama}"\n`;
  });
  downloadFile('laporan.csv', csv, 'text/csv');
  toast('Export CSV ✓');
}

function exportTXT() {
  const laporan = getData('laporan', {});
  let txt = 'LAPORAN PENJUALAN\n' + '='.repeat(32) + '\n\n';
  Object.entries(laporan).forEach(([tgl, d]) => {
    txt += `${tgl}\nOmzet: ${fmtRp(d.omzet)} | Laba: ${fmtRp(d.laba)} | Trx: ${d.trx}\n\n`;
  });
  downloadFile('laporan.txt', txt, 'text/plain');
  toast('Export TXT ✓');
}

function exportJSON() {
  const data = {
    produk:      getData('produk',   []),
    laporan:     getData('laporan',  {}),
    riwayat:     getData('riwayat',  []),
    settings:    getData('settings', {}),
    backup_date: new Date().toISOString(),
  };
  downloadFile('backup-kasir.json', JSON.stringify(data, null, 2), 'application/json');
  toast('Backup JSON ✓');
}

function restoreJSON(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = ev => {
    try {
      const data = JSON.parse(ev.target.result);
      if (!data.produk && !data.laporan && !data.riwayat) {
        toast('File backup tidak valid atau kosong', 'error');
        return;
      }
      if (data.produk)   setData('produk',   data.produk);
      if (data.laporan)  setData('laporan',  data.laporan);
      if (data.riwayat)  setData('riwayat',  data.riwayat);
      if (data.settings) setData('settings', data.settings);
      toast('Data berhasil direstore ✓', 'success');
      initApp();
    } catch { toast('File tidak valid atau rusak', 'error'); }
  };
  reader.readAsText(file);
  e.target.value = '';
}

function downloadFile(name, content, type) {
  const a    = document.createElement('a');
  a.href     = URL.createObjectURL(new Blob([content], { type }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

async function kirimSheets(trxData) {
  const s = getData('settings', {});
  if (!s.sheets_url) { toast('URL Sheets belum diset', 'error'); return; }
  const controller = new AbortController();
  const timer      = setTimeout(() => controller.abort(), 10000);
  try {
    const data = trxData || getData('riwayat', [])[0];
    if (!data) { toast('Tidak ada data transaksi', 'error'); return; }
    await fetch(s.sheets_url, {
      method: 'POST',
      body:   JSON.stringify({ action: 'addTransaction', data }),
      signal: controller.signal,
    });
    toast('Terkirim ke Sheets ✓', 'success');
  } catch (err) {
    if (err.name === 'AbortError') toast('Kirim ke Sheets timeout (>10 detik)', 'error');
    else toast('Gagal kirim ke Sheets', 'error');
  } finally {
    clearTimeout(timer);
  }
}

async function tesSheets() {
  const url = document.getElementById('set-sheets-url').value;
  if (!url) { toast('URL belum diisi', 'error'); return; }
  const controller = new AbortController();
  const timer      = setTimeout(() => controller.abort(), 10000);
  try {
    toast('Menghubungkan...');
    await fetch(url, {
      method: 'POST',
      body:   JSON.stringify({ action: 'ping' }),
      signal: controller.signal,
    });
    toast('Koneksi berhasil ✓', 'success');
    updateSheetsStatus(true);
  } catch (err) {
    if (err.name === 'AbortError') toast('Koneksi timeout (>10 detik)', 'error');
    else toast('Gagal terhubung', 'error');
  } finally {
    clearTimeout(timer);
  }
}

function resetLaporan() {
  showKonfirmasiHapus(
    'Reset Laporan Harian',
    'Semua data laporan harian akan dihapus permanen.',
    'RESET LAPORAN',
    () => {
      setData('laporan', {});
      renderLaporan();
      renderDashboard();
      toast('Laporan direset');
    }
  );
}

function resetRiwayat() {
  showKonfirmasiHapus(
    'Hapus Riwayat Transaksi',
    'Semua riwayat transaksi akan dihapus permanen.',
    'HAPUS RIWAYAT',
    () => {
      setData('riwayat', []);
      renderRiwayat();
      toast('Riwayat dihapus');
    }
  );
}

function showKonfirmasiHapus(judul, pesan, katakunci, onKonfirm) {
  const overlay = document.createElement('div');
  overlay.style.cssText = `
    position:fixed;inset:0;background:rgba(0,0,0,0.8);
    z-index:99999;display:flex;align-items:center;justify-content:center;`;
  overlay.innerHTML = `
    <div style="background:#1a1a1a;border:2px solid #e74c3c;border-radius:16px;
                padding:24px;max-width:340px;width:90%;text-align:center;color:#fff;font-family:inherit">
      <div style="font-size:36px;margin-bottom:10px">⚠️</div>
      <h3 style="margin:0 0 8px;color:#e74c3c;font-size:16px">${judul}</h3>
      <p style="font-size:13px;color:#ccc;margin:0 0 14px;line-height:1.5">${pesan}</p>
      <p style="font-size:12px;color:#aaa;margin:0 0 8px">
        Ketik <strong style="color:#f5c542">${katakunci}</strong> untuk konfirmasi:
      </p>
      <input id="konfirm-input" type="text" placeholder="Ketik di sini..."
        style="width:100%;box-sizing:border-box;padding:9px;border-radius:8px;border:2px solid #555;
               background:#111;color:#fff;font-size:13px;text-align:center;outline:none;margin-bottom:14px"/>
      <div style="display:flex;gap:8px">
        <button id="konfirm-cancel"
          style="flex:1;padding:10px;border-radius:8px;border:none;
                 background:#444;color:#fff;font-size:13px;cursor:pointer">Batal</button>
        <button id="konfirm-ok" disabled
          style="flex:1;padding:10px;border-radius:8px;border:none;
                 background:#666;color:#aaa;font-size:13px;cursor:not-allowed">Konfirmasi</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);

  const input     = overlay.querySelector('#konfirm-input');
  const okBtn     = overlay.querySelector('#konfirm-ok');
  const cancelBtn = overlay.querySelector('#konfirm-cancel');

  input.addEventListener('input', () => {
    const valid            = input.value.trim() === katakunci;
    okBtn.disabled         = !valid;
    okBtn.style.background = valid ? '#e74c3c' : '#666';
    okBtn.style.color      = valid ? '#fff'    : '#aaa';
    okBtn.style.cursor     = valid ? 'pointer' : 'not-allowed';
  });
  okBtn.addEventListener('click',     () => { overlay.remove(); onKonfirm(); });
  cancelBtn.addEventListener('click', () => overlay.remove());
  overlay.addEventListener('click',   e => { if (e.target === overlay) overlay.remove(); });
  setTimeout(() => input.focus(), 100);
}

function resetAllData() {
  const overlay = document.createElement('div');
  overlay.id    = 'reset-confirm-overlay';
  overlay.style.cssText = `
    position:fixed;inset:0;background:rgba(0,0,0,0.8);
    z-index:99999;display:flex;align-items:center;justify-content:center;`;
  overlay.innerHTML = `
    <div style="background:#1a1a1a;border:2px solid #e74c3c;border-radius:16px;
                padding:28px 24px;max-width:340px;width:90%;text-align:center;
                color:#fff;font-family:inherit">
      <div style="font-size:48px;margin-bottom:12px">⚠️</div>
      <h3 style="margin:0 0 8px;color:#e74c3c;font-size:18px">ZONA BERBAHAYA</h3>
      <p style="font-size:13px;color:#ccc;margin:0 0 16px;line-height:1.5">
        Semua <strong>produk</strong>, <strong>laporan</strong>, dan
        <strong>riwayat transaksi</strong> akan
        <span style="color:#e74c3c;font-weight:700">dihapus permanen</span>.
      </p>
      <p style="font-size:13px;color:#aaa;margin:0 0 10px">
        Ketik <strong style="color:#f5c542">HAPUS SEMUA</strong> untuk konfirmasi:
      </p>
      <input id="reset-confirm-input" type="text" placeholder="Ketik: HAPUS SEMUA"
        style="width:100%;box-sizing:border-box;padding:10px;border-radius:8px;
               border:2px solid #555;background:#111;color:#fff;font-size:14px;
               text-align:center;outline:none;margin-bottom:16px"/>
      <div style="display:flex;gap:10px">
        <button id="reset-cancel-btn"
          style="flex:1;padding:10px;border-radius:8px;border:none;
                 background:#444;color:#fff;font-size:14px;cursor:pointer;font-weight:600">
          Batal
        </button>
        <button id="reset-confirm-btn" disabled
          style="flex:1;padding:10px;border-radius:8px;border:none;
                 background:#666;color:#aaa;font-size:14px;cursor:not-allowed;font-weight:600">
          Hapus Semua
        </button>
      </div>
    </div>`;
  document.body.appendChild(overlay);

  const input      = document.getElementById('reset-confirm-input');
  const confirmBtn = document.getElementById('reset-confirm-btn');
  const cancelBtn  = document.getElementById('reset-cancel-btn');

  input.addEventListener('input', () => {
    const valid                 = input.value.trim() === 'HAPUS SEMUA';
    confirmBtn.disabled         = !valid;
    confirmBtn.style.background = valid ? '#e74c3c' : '#666';
    confirmBtn.style.color      = valid ? '#fff'    : '#aaa';
    confirmBtn.style.cursor     = valid ? 'pointer' : 'not-allowed';
  });
  confirmBtn.addEventListener('click', () => {
    overlay.remove();
    if (chartInstance) { chartInstance.destroy(); chartInstance = null; }
    ['produk', 'laporan', 'riwayat', 'riwayat_stok', 'prefs', '_last_kasir', '_pending_sync']
      .forEach(k => localStorage.removeItem(k));
    window.produk      = [];
    window.laporan     = {};
    window.riwayat     = [];
    window.riwayatStok = [];
    cart                = [];
    _checkoutInProgress = false;
    _currentTotal       = 0;
    updateCartBadge();
    renderCart();
    initApp();
    toast('Semua data dihapus', 'error');
  });
  cancelBtn.addEventListener('click',  () => overlay.remove());
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
  setTimeout(() => input.focus(), 100);
}

// ===== AUTH =====
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
  if (!email || !password) { errEl.textContent = 'Email & password wajib diisi'; return; }
  errEl.textContent = 'Memproses...';
  const result = await window.fbLogin(email, password);
  if (result.ok) showScreen('pin');
  else errEl.textContent = result.error;
}

async function doRegister() {
  const nama     = document.getElementById('reg-nama').value.trim();
  const email    = document.getElementById('reg-email').value.trim();
  const password = document.getElementById('reg-password').value;
  const errEl    = document.getElementById('reg-error');
  if (!nama)     { errEl.textContent = 'Nama toko wajib diisi';  return; }
  if (!email)    { errEl.textContent = 'Email wajib diisi';       return; }
  if (!password) { errEl.textContent = 'Password wajib diisi';    return; }
  errEl.textContent = 'Mendaftarkan...';
  const result = await window.fbRegister(email, password);
  if (result.ok) {
    const s = { nama, footer1: 'Terima kasih telah berbelanja!', footer2: '' };
    window.pengaturan = s;
    setData('settings', s);
    await window.fbSimpanSemua();
    showScreen('pin');
    document.getElementById('pin-store-name').textContent = nama;
    toast('Akun berhasil dibuat! Selamat datang 🎉', 'success');
  } else {
    errEl.textContent = result.error;
  }
}

function logoutAkun() {
  if (!confirm('Yakin ingin logout dari akun?')) return;
  window._pinPassed = false;
  if (window.FB && typeof window.fbLogout === 'function') window.fbLogout();

  [
    'produk', 'laporan', 'riwayat', 'settings', 'prefs',
    'pin', '_pin_sudah_diganti', '_pin_attempts', '_pin_lock_until',
    '_last_kasir', 'riwayat_stok', '_pending_sync',
  ].forEach(k => localStorage.removeItem(k));

  window.produk      = [];
  window.laporan     = {};
  window.riwayat     = [];
  window.pengaturan  = {};
  window.riwayatStok = [];

  cart                = [];
  diskonMode          = 'rp';
  paymentMethod       = 'tunai';
  lastNota            = '';
  lastTrx             = null;
  produkFilter        = 'Semua';
  _checkoutInProgress = false;
  _currentTotal       = 0;
  updateCartBadge();
  renderCart();

  ['diskon-val', 'uang-bayar', 'kasir-name', 'mekanik-name'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  const kemRow = document.getElementById('kembalian-row');
  if (kemRow) kemRow.style.display = 'none';

  document.getElementById('login-email').value       = '';
  document.getElementById('login-password').value    = '';
  document.getElementById('login-error').textContent = '';
  showScreen('auth');
  toast('Berhasil logout ✓');
}

async function lupaPassword() {
  const email = document.getElementById('login-email').value.trim();
  const errEl = document.getElementById('login-error');
  if (!email) { errEl.textContent = 'Masukkan email dulu sebelum reset password'; return; }
  errEl.textContent  = 'Mengirim email reset...';
  const result       = await window.fbResetPassword(email);
  errEl.style.color  = result.ok ? 'var(--green)' : 'var(--red)';
  errEl.textContent  = result.ok
    ? '✓ Email reset password sudah dikirim, cek inbox kamu'
    : result.error;
}

// ===== UTILS =====
function tglKey(date) {
  return (date || new Date()).toISOString().split('T')[0];
}
function tglDisplay(isoKey) {
  const [y, m, dd] = isoKey.split('-');
  return `${parseInt(dd)}/${parseInt(m)}/${y}`;
}
function fmtRp(n) {
  return 'Rp ' + Math.round(n || 0).toLocaleString('id-ID');
}
function fmtRpShort(n) {
  n = Math.round(n || 0);
  if (n >= 1000000) return 'Rp ' + (n / 1000000).toFixed(1) + 'jt';
  if (n >= 1000)    return 'Rp ' + Math.floor(n / 1000) + 'rb';
  return 'Rp ' + n;
}
function toast(msg, type = '') {
  const el       = document.getElementById('toast');
  if (!el) return;
  el.textContent = msg;
  el.className   = 'toast show ' + type;
  clearTimeout(window._toastTimeout);
  window._toastTimeout = setTimeout(() => { el.className = 'toast'; }, 2500);
}
