// ===== STATE =====
let deferredPrompt = null;
let currentPin = '';
let pinAttempts = 0;
let lockUntil = 0;
let cart = [];
let produkFilter = 'Semua';
let diskonMode = 'rp';
let paymentMethod = 'tunai';
let lastNota = '';
let chartInstance = null;

// ===== STORAGE =====
function getData(key, def) {
  try { return JSON.parse(localStorage.getItem(key)) ?? def; }
  catch { return def; }
}
function setData(key, val) {
  localStorage.setItem(key, JSON.stringify(val));
  if (key === 'produk')   window.produk     = val;
  if (key === 'laporan')  window.laporan    = val;
  if (key === 'riwayat')  window.riwayat    = val;
  if (key === 'settings') window.pengaturan = val;
  if (['produk','laporan','riwayat','settings'].includes(key)) {
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

window.produk     = getData('produk', []);
window.laporan    = getData('laporan', {});
window.riwayat    = getData('riwayat', []);
window.pengaturan = getData('settings', {});

window._pinPassed = false;

window.resetCartState = function() {
  cart          = [];
  diskonMode    = 'rp';
  paymentMethod = 'tunai';
  lastNota      = '';
  produkFilter  = 'Semua';
  updateCartBadge();
  ['diskon-val','uang-bayar','kasir-name'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  const kemRow = document.getElementById('kembalian-row');
  if (kemRow) kemRow.style.display = 'none';
};

window.syncProdukDariFirebase = function() {
  const produk = window.produk || [];
  if (produk.length) localStorage.setItem('produk', JSON.stringify(produk));
  renderProduk();
};
window.syncLaporanDariFirebase = function() {
  const laporan = window.laporan || {};
  if (Object.keys(laporan).length) localStorage.setItem('laporan', JSON.stringify(laporan));
  renderLaporan(); renderRiwayat();
};
window.syncRiwayatDariFirebase = function() {
  const riwayat = window.riwayat || [];
  if (riwayat.length) localStorage.setItem('riwayat', JSON.stringify(riwayat));
  renderRiwayat();
};
window.updateDashboard = function() { renderDashboard(); };

// ===== HELPER: tampilkan layar secara eksklusif =====
function showScreen(name) {
  const screens = {
    auth: document.getElementById('auth-screen'),
    pin:  document.getElementById('pin-screen'),
    app:  document.getElementById('app'),
  };

  Object.values(screens).forEach(el => { if (el) el.style.display = 'none'; });

  if (screens[name]) {
    screens[name].style.display = name === 'pin' || name === 'auth' ? 'flex' : 'block';
  }

  const banner = document.getElementById('install-banner');
  if (banner) {
    banner.style.zIndex = (name === 'app') ? '1000' : '-1';
  }

  if (name === 'pin' || name === 'auth') {
    const staleOverlay = document.getElementById('force-pin-overlay');
    if (staleOverlay) staleOverlay.remove();
    const resetOverlay = document.getElementById('reset-confirm-overlay');
    if (resetOverlay) resetOverlay.remove();
  }

  if (name === 'pin') {
    currentPin = '';
    updatePinDots();
    showPinStatus('Masukkan PIN');
  }
}

// ===== INIT =====
window.addEventListener('load', () => {
  showScreen('pin');

  const s = getData('settings', {});
  if (s.nama)   document.getElementById('pin-store-name').textContent = s.nama;
  if (s.alamat) document.getElementById('pin-store-addr').textContent = s.alamat;

  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault(); deferredPrompt = e;
    const banner = document.getElementById('install-banner');
    if (banner) banner.style.display = 'flex';
  });

  const today   = new Date().toISOString().split('T')[0];
  const weekAgo = new Date(Date.now() - 7*24*3600*1000).toISOString().split('T')[0];
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
    const mnt   = Math.floor(sisa / 60);
    const dtk   = sisa % 60;
    showPinStatus(`🔒 Terkunci ${mnt > 0 ? mnt + 'm ' : ''}${dtk}d lagi`, 'error');
  }

  document.addEventListener('keydown', function(e) {
    const pinScreen = document.getElementById('pin-screen');
    if (!pinScreen || pinScreen.style.display === 'none') return;
    if (document.activeElement && ['INPUT','TEXTAREA'].includes(document.activeElement.tagName)) return;
    if (e.key >= '0' && e.key <= '9') {
      pinInput(e.key);
    } else if (e.key === 'Backspace' || e.key === 'Delete') {
      pinDel();
    } else if (e.key === 'Enter' && currentPin.length === 4) {
      checkPin();
    }
  });
});

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
    const sisaDetik = Math.ceil((savedLock - Date.now()) / 1000);
    const mnt   = Math.floor(sisaDetik / 60);
    const dtk   = sisaDetik % 60;
    const label = mnt > 0 ? `${mnt}m ${dtk}d` : `${dtk}d`;
    showPinStatus(`🔒 Terkunci ${label} lagi`, 'error');
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
  const el = document.getElementById('pinStatus');
  el.textContent = msg;
  el.className   = 'pin-status ' + type;
}

function checkPin() {
  const saved = getData('pin', '1234');
  if (currentPin === saved) {
    showPinStatus('✓ Berhasil', 'success');
    pinAttempts = 0;
    setData('_pin_attempts', 0);
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
      const stillLocked = getData('_pin_lock_until', 0);
      if (Date.now() < stillLocked) return;
      showPinStatus('Masukkan PIN');
    }, 1500);
  }
}

function checkDefaultPin() {
  const saved        = getData('pin', '1234');
  const sudahDiganti = getData('_pin_sudah_diganti', false);
  if (saved === '1234' && !sudahDiganti) {
    showForcePinChangeDialog();
  }
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
      <p id="fp-error" style="color:#e74c3c;font-size:12px;min-height:16px;text-align:center;margin:4px 0 16px"></p>
      <button onclick="saveForcedPin()"
        style="width:100%;padding:12px;border-radius:8px;border:none;
               background:#f5c542;color:#111;font-size:15px;font-weight:700;cursor:pointer">
        💾 Simpan PIN Baru
      </button>
    </div>`;
  document.body.appendChild(overlay);
  ['fp-baru','fp-konfirm'].forEach(id => {
    document.getElementById(id).addEventListener('input', function() {
      this.value = this.value.replace(/\D/g,'').slice(0,4);
    });
  });
  document.getElementById('fp-baru').focus();
}

function saveForcedPin() {
  const baru    = document.getElementById('fp-baru').value.trim();
  const konfirm = document.getElementById('fp-konfirm').value.trim();
  const errEl   = document.getElementById('fp-error');
  if (baru.length !== 4)  { errEl.textContent = 'PIN harus 4 digit angka.'; return; }
  if (baru === '1234')    { errEl.textContent = 'PIN tidak boleh sama dengan default (1234).'; return; }
  if (baru !== konfirm)   { errEl.textContent = 'Konfirmasi PIN tidak cocok.'; return; }
  setData('pin', baru);
  setData('_pin_sudah_diganti', true);
  document.getElementById('force-pin-overlay').remove();
  toast('✓ PIN berhasil diubah! Harap ingat PIN baru Anda.', 'success');
}

function lockApp() {
  window._pinPassed = false;

  if (window.FB && window.FB.listeners && window._fbOff) {
    try {
      Object.values(window.FB.listeners).forEach(r => window._fbOff.off(r));
      window.FB.listeners = {};
    } catch(e) { console.warn('lockApp: gagal hentikan listener', e); }
  }

  ['uang-bayar','kasir-name'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  const kemRow = document.getElementById('kembalian-row');
  if (kemRow) kemRow.style.display = 'none';

  currentPin = '';
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
  ['pin-lama','pin-baru','pin-konfirm'].forEach(id => document.getElementById(id).value = '');
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
// FIX: retry loop agar tidak race condition dengan firebase.js ES module
function initApp() {
  loadSettings();
  renderDashboard();
  renderProduk();
  renderLaporan();
  renderRiwayat();
  if (typeof window.injectCloudButton === 'function') window.injectCloudButton();

  // FIX: tunggu window.FB siap sebelum load data & listen realtime
  // firebase.js adalah ES module sehingga bisa belum selesai saat initApp jalan
  let _fbRetry = 0;
  function tryFirebaseLoad() {
    // Batas retry 10x (3 detik total)
    if (_fbRetry >= 10) {
      console.warn('MotoKas: Firebase module tidak siap setelah 3 detik, skip cloud sync.');
      return;
    }
    _fbRetry++;

    // FB module belum dimuat sama sekali → coba lagi
    if (!window.FB) {
      setTimeout(tryFirebaseLoad, 300);
      return;
    }

    // User belum login → tidak perlu load data cloud
    if (!window.FB.uid) return;

    // FB siap & user sudah login → load data lalu aktifkan listener
    if (typeof window.fbLoadAllData === 'function') {
      window.fbLoadAllData().then(() => {
        if (typeof window.fbListenRealtime === 'function') {
          window.fbListenRealtime();
        }
      });
    } else {
      // fbLoadAllData belum ter-expose → retry
      setTimeout(tryFirebaseLoad, 300);
    }
  }
  tryFirebaseLoad();
}

// ===== NAVIGATION =====
function navTo(page, btn) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.getElementById('page-' + page).classList.add('active');
  btn.classList.add('active');
  if (page === 'dashboard') renderDashboard();
  if (page === 'laporan')   { renderLaporan(); renderRiwayat(); }
}

// ===== SETTINGS =====
function loadSettings() {
  const s = getData('settings', {});
  document.getElementById('set-nama').value         = s.nama    || '';
  document.getElementById('set-alamat').value       = s.alamat  || '';
  document.getElementById('set-telp').value         = s.telp    || '';
  document.getElementById('set-footer1').value      = s.footer1 || 'Terima kasih telah berbelanja!';
  document.getElementById('set-footer2').value      = s.footer2 || 'Barang yang sudah dibeli tidak dapat dikembalikan';
  document.getElementById('set-sheets-url').value   = s.sheets_url   || '';
  document.getElementById('set-kode-rahasia').value = s.kode_rahasia || '';
  document.getElementById('hdr-name').textContent   = s.nama    || 'Nama Toko';
  document.getElementById('hdr-sub').textContent    = (s.alamat ? s.alamat + ' — ' : '') + 'v4.0';
  document.getElementById('pin-store-name').textContent = s.nama || 'Nama Toko';
  if (s.alamat) document.getElementById('pin-store-addr').textContent = s.alamat;

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
  document.getElementById('hdr-sub').textContent  = (s.alamat ? s.alamat + ' — ' : '') + 'v4.0';
  updateSheetsStatus(!!s.sheets_url);
}

function toggleSetting(key, btn) {
  const prefs = getData('prefs', { auto_sheets: false, show_laba: false, stok_alert: true });
  prefs[key]  = !prefs[key];
  setData('prefs', prefs);
  setToggleState(btn.id, prefs[key]);
}

function setToggleState(id, on) {
  document.getElementById(id).classList.toggle('on', on);
}

function updateSheetsStatus(connected) {
  document.getElementById('sheets-dot').classList.toggle('connected', connected);
  document.getElementById('sheets-status-text').textContent = connected ? 'Terhubung' : 'Belum terhubung';
}

// ===== PRODUK =====
function getCatIcon(cat) {
  const icons = { 'Oli':'🛢️','Spare Part':'⚙️','Aksesoris':'🔩','Ban':'🔄','Aki':'🔋','Lainnya':'📦' };
  return icons[cat] || '📦';
}

function renderProduk() {
  const produk = getData('produk', []);
  const q      = (document.getElementById('search-produk').value || '').toLowerCase();
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
        <button class="btn-add-cart ${p.stok <= 0 ? 'disabled' : ''}" onclick="${p.stok > 0 ? `addToCart(${p.id})` : ''}">＋</button>
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
  document.getElementById(id).classList.add('show');
  if (id === 'modal-tambah-produk') {
    const editId = document.getElementById('edit-produk-id').value;
    if (!editId) {
      document.getElementById('modal-produk-title').textContent = 'Tambah Produk';
      ['prod-nama','prod-hpp','prod-harga','prod-stok','prod-minstok','prod-sku'].forEach(i => document.getElementById(i).value = '');
      document.getElementById('prod-cat').value = '';
      document.getElementById('edit-delete-row').style.display = 'none';
    }
  }
}

function closeModal(id) {
  document.getElementById(id).classList.remove('show');
  if (id === 'modal-tambah-produk') {
    document.getElementById('edit-produk-id').value = '';
  }
}

function editProduk(id) {
  const p = getData('produk', []).find(x => x.id === id);
  if (!p) return;
  document.getElementById('modal-produk-title').textContent = 'Edit Produk';
  document.getElementById('edit-produk-id').value  = id;
  document.getElementById('prod-nama').value       = p.nama;
  document.getElementById('prod-cat').value        = p.kategori;
  document.getElementById('prod-hpp').value        = p.hpp || '';
  document.getElementById('prod-harga').value      = p.harga;
  document.getElementById('prod-stok').value       = p.stok;
  document.getElementById('prod-minstok').value    = p.minstok || '';
  document.getElementById('prod-sku').value        = p.sku || '';
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
    produk = produk.map(p => p.id === editId ? { ...p, nama, kategori, hpp, harga, stok, minstok, sku } : p);
    toast('Produk diperbarui ✓', 'success');
  } else {
    produk.push({ id: Date.now(), nama, kategori, hpp, harga, stok, minstok, sku, terjual: 0 });
    toast('Produk ditambahkan ✓', 'success');
  }
  setData('produk', produk);
  closeModal('modal-tambah-produk');
  renderProduk();
  updateKritisCount();
}

function hapusProduk() {
  const id = parseInt(document.getElementById('edit-produk-id').value);
  if (!confirm('Yakin hapus produk ini?')) return;
  setData('produk', getData('produk', []).filter(p => p.id !== id));
  closeModal('modal-tambah-produk');
  renderProduk();
  toast('Produk dihapus');
}

// ===== CART =====
function addToCart(id) {
  const p = getData('produk', []).find(x => x.id === id);
  if (!p || p.stok <= 0) { toast('Stok habis', 'error'); return; }
  const existing = cart.find(c => c.id === id);
  if (existing) {
    if (existing.qty >= p.stok) { toast('Stok tidak cukup', 'error'); return; }
    existing.qty++;
  } else {
    cart.push({ id, nama: p.nama, harga: p.harga, hpp: p.hpp || 0, qty: 1, maxStok: p.stok });
  }
  updateCartBadge();
  renderCart();
  hitungTotal();
  toast(`${p.nama} ditambahkan ✓`);
}

function updateCartBadge() {
  const total = cart.reduce((s, c) => s + c.qty, 0);
  const badge = document.getElementById('cart-badge');
  badge.style.display = total > 0 ? 'flex' : 'none';
  badge.textContent   = total;
}

function renderCart() {
  const list  = document.getElementById('cart-list');
  const empty = document.getElementById('cart-empty');
  if (cart.length === 0) {
    list.style.display  = 'none';
    empty.style.display = 'block';
    document.getElementById('btn-checkout').disabled = true;
    return;
  }
  list.style.display  = 'flex';
  empty.style.display = 'none';
  document.getElementById('btn-checkout').disabled = false;
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

function hitungDiskon(subtotal) {
  const dv = parseFloat(document.getElementById('diskon-val').value) || 0;
  if (diskonMode === 'pct') {
    return Math.round(subtotal * Math.min(100, Math.max(0, dv)) / 100);
  } else {
    return Math.min(dv, subtotal);
  }
}

function hitungTotal() {
  const subtotal = cart.reduce((s, c) => s + c.harga * c.qty, 0);
  const diskon   = hitungDiskon(subtotal);
  const total    = Math.max(0, subtotal - diskon);
  document.getElementById('co-subtotal').textContent = fmtRp(subtotal);
  document.getElementById('co-diskon').textContent   = '- ' + fmtRp(diskon);
  document.getElementById('co-total').textContent    = fmtRp(total);
  hitungKembalian();
}

function setDiskonMode(mode) {
  diskonMode = mode;
  document.getElementById('diskon-rp').classList.toggle('active', mode === 'rp');
  document.getElementById('diskon-pct').classList.toggle('active', mode === 'pct');
  hitungTotal();
}

function setPayment(btn, method) {
  paymentMethod = method;
  document.querySelectorAll('.payment-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById('tunai-section').style.display = method === 'tunai' ? 'block' : 'none';
}

function hitungKembalian() {
  const totalText = (document.getElementById('co-total').textContent || '0').replace(/\D/g, '');
  const total = parseInt(totalText) || 0;
  const bayar = parseFloat(document.getElementById('uang-bayar').value) || 0;
  const row   = document.getElementById('kembalian-row');
  if (bayar > 0) {
    row.style.display = 'flex';
    const kembalian   = bayar - total;
    const valEl       = document.getElementById('kembalian-val');
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
  const subtotal = cart.reduce((s, c) => s + c.harga * c.qty, 0);
  const diskon   = hitungDiskon(subtotal);
  const total    = Math.max(0, subtotal - diskon);
  const kasir    = document.getElementById('kasir-name').value || 'Kasir';
  const bayar    = parseFloat(document.getElementById('uang-bayar').value) || 0;

  if (paymentMethod === 'tunai') {
    if (bayar <= 0) { toast('Masukkan jumlah uang bayar', 'error'); return; }
    if (bayar < total) {
      toast(`Uang bayar kurang ${fmtRp(total - bayar)}!`, 'error');
      const el = document.getElementById('uang-bayar');
      el.focus();
      el.style.outline = '2px solid var(--red)';
      setTimeout(() => { el.style.outline = ''; }, 2000);
      return;
    }
  }

  let produk = getData('produk', []);
  cart.forEach(c => {
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
    laba: cart.reduce((s, c) => s + (c.harga - c.hpp) * c.qty, 0) - diskon,
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

  lastNota = generateNota(trx);
  document.getElementById('nota-content').textContent = lastNota;

  const prefs = getData('prefs', {});
  if (prefs.auto_sheets) kirimSheets(trx);

  cart = [];
  updateCartBadge();
  renderCart();
  hitungTotal();
  document.getElementById('diskon-val').value = '';
  document.getElementById('uang-bayar').value = '';
  document.getElementById('kasir-name').value = '';

  toast('✓ Transaksi berhasil!', 'success');
  openModal('modal-nota');
  renderProduk();
  updateKritisCount();
}

function generateNota(trx) {
  const s      = getData('settings', {});
  const w      = 32;
  const center = str => ' '.repeat(Math.max(0, Math.floor((w - str.length) / 2))) + str;
  const line   = '─'.repeat(w);
  let n = '';
  n += center(s.nama || 'dityaMotor 88') + '\n';
  if (s.alamat) n += center(s.alamat) + '\n';
  if (s.telp)   n += center('Telp: ' + s.telp) + '\n';
  n += line + '\n';
  n += `Waktu : ${trx.waktu}\nKasir : ${trx.kasir}\nMetode: ${trx.metode.toUpperCase()}\n`;
  n += line + '\n';
  trx.items.forEach(i => { n += `${i.nama}\n  ${i.qty} × ${fmtRp(i.harga)} = ${fmtRp(i.harga * i.qty)}\n`; });
  n += line + '\n';
  n += `Subtotal : ${fmtRp(trx.subtotal)}\n`;
  if (trx.diskon > 0) n += `Diskon   : - ${fmtRp(trx.diskon)}\n`;
  n += `TOTAL    : ${fmtRp(trx.total)}\n`;
  if (trx.metode === 'tunai') { n += `Bayar    : ${fmtRp(trx.bayar)}\nKembali  : ${fmtRp(trx.kembalian)}\n`; }
  n += line + '\n';
  n += center(s.footer1 || 'Terima kasih telah berbelanja!') + '\n';
  if (s.footer2) n += center(s.footer2) + '\n';
  return n;
}

function cetakNotaTerakhir() {
  if (!lastNota) { toast('Belum ada transaksi', 'error'); return; }
  openModal('modal-nota');
}

async function shareNota() {
  if (navigator.share) {
    try { await navigator.share({ title: 'Struk Transaksi', text: lastNota }); } catch (e) { }
  } else {
    navigator.clipboard.writeText(lastNota).then(() => toast('Struk disalin ke clipboard ✓'));
  }
}

// ===== DASHBOARD =====
function renderDashboard() {
  const laporan = getData('laporan', {});
  const tgl     = tglKey();
  const hari    = laporan[tgl] || { omzet: 0, laba: 0, trx: 0 };
  document.getElementById('stat-omzet').textContent = fmtRpShort(hari.omzet);
  document.getElementById('stat-laba').textContent  = fmtRpShort(hari.laba);
  document.getElementById('stat-trx').textContent   = hari.trx;
  updateKritisCount();
  renderChart();
  renderTerlaris();
}

function updateKritisCount() {
  const produk = getData('produk', []);
  const kritis = produk.filter(p => p.stok <= (p.minstok || 5));
  document.getElementById('stat-kritis').textContent = kritis.length;
  const list = document.getElementById('kritis-list');
  if (kritis.length === 0) {
    list.innerHTML = '<div class="empty-state"><div class="empty-icon">✅</div>Semua stok aman</div>';
  } else {
    list.innerHTML = kritis.map(p => `
      <div class="kritis-item">
        <div><div class="kritis-name">${p.nama}</div><div class="kritis-stok">${p.stok} unit tersisa</div></div>
        <span class="badge-kritis">${p.stok <= 0 ? 'HABIS' : 'KRITIS'}</span>
      </div>`).join('');
  }
}

function renderChart() {
  const laporan = getData('laporan', {});
  const days = [], omzetData = [], labaData = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(Date.now() - i * 24 * 3600 * 1000);
    days.push(d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' }));
    const tgl = tglKey(d);
    omzetData.push(laporan[tgl]?.omzet || 0);
    labaData.push(laporan[tgl]?.laba   || 0);
  }
  const ctx = document.getElementById('chartOmzet').getContext('2d');
  if (chartInstance) chartInstance.destroy();
  chartInstance = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: days,
      datasets: [
        { label: 'Omzet', data: omzetData, backgroundColor: 'rgba(245,197,66,0.7)', borderRadius: 4 },
        { label: 'Laba',  data: labaData,  backgroundColor: 'rgba(76,175,125,0.7)',  borderRadius: 4 }
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { grid: { color: '#2e2e2e' }, ticks: { color: '#5a5550', font: { size: 10 } } },
        y: { grid: { color: '#2e2e2e' }, ticks: { color: '#5a5550', font: { size: 10 }, callback: v => fmtRpShort(v) } }
      }
    }
  });
}

function renderTerlaris() {
  const laporan = getData('laporan', {});
  const now     = new Date();
  const bulan   = now.getMonth(), tahun = now.getFullYear();
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
      Object.entries(data.terlaris || {}).forEach(([key, val]) => {
        const nama = (typeof val === 'object') ? val.nama : key.replace(/_/g, ' ');
        const qty  = (typeof val === 'object') ? val.qty  : val;
        totalTerjual[nama] = (totalTerjual[nama] || 0) + qty;
      });
    }
  });
  const sorted = Object.entries(totalTerjual).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const el     = document.getElementById('terlaris-list');
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
      iso     = parts.length === 3 ? `${parts[2]}-${parts[1].padStart(2,'0')}-${parts[0].padStart(2,'0')}` : '';
      display = tgl;
    }
    return { tgl: display, iso, ...data };
  }).filter(e => (!dari || e.iso >= dari) && (!sampai || e.iso <= sampai))
    .sort((a, b) => b.iso.localeCompare(a.iso));

  const tbody = document.getElementById('laporan-tbody');
  if (entries.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--text3);padding:20px">Belum ada laporan</td></tr>';
    return;
  }
  tbody.innerHTML = entries.map(e => {
    const terlarisEntries = Object.entries(e.terlaris || {});
    const terlaris = terlarisEntries
      .map(([k, v]) => [(typeof v === 'object') ? v.nama : k.replace(/_/g,' '), (typeof v === 'object') ? v.qty : v])
      .sort((a, b) => b[1] - a[1])[0];
    return `<tr>
      <td>${e.tgl}</td>
      <td style="color:var(--accent)">${fmtRpShort(e.omzet)}</td>
      <td style="color:var(--green)">${fmtRpShort(e.laba)}</td>
      <td>${e.trx}</td>
      <td style="color:var(--text2)">${terlaris ? terlaris[0] : '-'}</td>
    </tr>`;
  }).join('');
}

function resetDateFilter() {
  const today   = new Date().toISOString().split('T')[0];
  const weekAgo = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString().split('T')[0];
  document.getElementById('date-dari').value   = weekAgo;
  document.getElementById('date-sampai').value = today;
  renderLaporan();
}

function renderRiwayat() {
  const riwayat   = getData('riwayat', []);
  const filterPay = document.getElementById('filter-payment').value;
  const filtered  = filterPay ? riwayat.filter(r => r.metode === filterPay) : riwayat;
  const el        = document.getElementById('riwayat-list');
  if (filtered.length === 0) {
    el.innerHTML = '<div class="empty-state"><div class="empty-icon">🧾</div>Belum ada transaksi</div>';
    return;
  }
  el.innerHTML = filtered.map(r => `
    <div class="riwayat-item">
      <div class="riwayat-header">
        <div>
          <div style="font-size:13px;font-weight:600">${r.kasir}</div>
          <div class="riwayat-waktu">${r.waktu}</div>
        </div>
        <div style="text-align:right">
          <div class="riwayat-total">${fmtRp(r.total)}</div>
          <span class="badge-payment ${r.metode}">${r.metode.toUpperCase()}</span>
        </div>
      </div>
      <div class="riwayat-detail">${r.items.map(i => `${i.nama} ×${i.qty}`).join(' · ')}${r.diskon > 0 ? `<br>Diskon: ${fmtRp(r.diskon)}` : ''}</div>
    </div>`).join('');
}

// ===== EXPORT =====
function exportCSV() {
  const laporan = getData('laporan', {});
  let csv = 'Tanggal,Omzet,Laba,Transaksi,Terlaris\n';
  Object.entries(laporan).forEach(([tgl, d]) => {
    const terlarisArr = Object.entries(d.terlaris || {})
      .map(([k, v]) => [(typeof v === 'object') ? v.nama : k.replace(/_/g,' '), (typeof v === 'object') ? v.qty : v])
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
    produk:      getData('produk', []),
    laporan:     getData('laporan', {}),
    riwayat:     getData('riwayat', []),
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
      if (data.produk)   setData('produk',   data.produk);
      if (data.laporan)  setData('laporan',  data.laporan);
      if (data.riwayat)  setData('riwayat',  data.riwayat);
      if (data.settings) setData('settings', data.settings);
      toast('Data berhasil direstore ✓', 'success');
      initApp();
    } catch { toast('File tidak valid', 'error'); }
  };
  reader.readAsText(file);
  e.target.value = '';
}

function downloadFile(name, content, type) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([content], { type }));
  a.download = name;
  a.click();
}

async function kirimSheets(trxData) {
  const s = getData('settings', {});
  if (!s.sheets_url) { toast('URL Sheets belum diset', 'error'); return; }
  try {
    const data = trxData || getData('riwayat', [])[0];
    if (!data) { toast('Tidak ada data transaksi', 'error'); return; }
    await fetch(s.sheets_url, { method: 'POST', body: JSON.stringify({ action: 'addTransaction', data }) });
    toast('Terkirim ke Sheets ✓', 'success');
  } catch { toast('Gagal kirim ke Sheets', 'error'); }
}

async function tesSheets() {
  const url = document.getElementById('set-sheets-url').value;
  if (!url) { toast('URL belum diisi', 'error'); return; }
  try {
    toast('Menghubungkan...');
    await fetch(url, { method: 'POST', body: JSON.stringify({ action: 'ping' }) });
    toast('Koneksi berhasil ✓', 'success');
    updateSheetsStatus(true);
  } catch { toast('Gagal terhubung', 'error'); }
}

function resetLaporan() {
  if (!confirm('Reset semua laporan harian?')) return;
  setData('laporan', {});
  renderLaporan();
  renderDashboard();
  toast('Laporan direset');
}

function resetRiwayat() {
  if (!confirm('Hapus semua riwayat transaksi?')) return;
  setData('riwayat', []);
  renderRiwayat();
  toast('Riwayat dihapus');
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
    const valid             = input.value.trim() === 'HAPUS SEMUA';
    confirmBtn.disabled     = !valid;
    confirmBtn.style.background = valid ? '#e74c3c' : '#666';
    confirmBtn.style.color      = valid ? '#fff'    : '#aaa';
    confirmBtn.style.cursor     = valid ? 'pointer' : 'not-allowed';
  });

  confirmBtn.addEventListener('click', () => {
    overlay.remove();
    ['produk','laporan','riwayat'].forEach(k => localStorage.removeItem(k));
    window.produk  = [];
    window.laporan = {};
    window.riwayat = [];
    cart = [];
    updateCartBadge();
    renderCart();
    initApp();
    toast('Semua data dihapus', 'error');
  });
  cancelBtn.addEventListener('click',  () => overlay.remove());
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
  setTimeout(() => input.focus(), 100);
}

// ===== UTILS =====
function tglKey(date) {
  const d = date || new Date();
  return d.toISOString().split('T')[0];
}
function tglDisplay(isoKey) {
  const [y, m, dd] = isoKey.split('-');
  return `${parseInt(dd)}/${parseInt(m)}/${y}`;
}

function fmtRp(n) { return 'Rp ' + Math.round(n || 0).toLocaleString('id-ID'); }
function fmtRpShort(n) {
  n = Math.round(n || 0);
  if (n >= 1000000) return 'Rp ' + (n / 1000000).toFixed(1) + 'jt';
  if (n >= 1000)    return 'Rp ' + Math.floor(n / 1000) + 'rb';
  return 'Rp ' + n;
}

function toast(msg, type = '') {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className   = 'toast show ' + type;
  setTimeout(() => el.className = 'toast', 2500);
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
  if (result.ok) {
    showScreen('pin');
  } else {
    errEl.textContent = result.error;
  }
}

async function doRegister() {
  const nama     = document.getElementById('reg-nama').value.trim();
  const email    = document.getElementById('reg-email').value.trim();
  const password = document.getElementById('reg-password').value;
  const errEl    = document.getElementById('reg-error');
  if (!nama)     { errEl.textContent = 'Nama toko wajib diisi'; return; }
  if (!email)    { errEl.textContent = 'Email wajib diisi'; return; }
  if (!password) { errEl.textContent = 'Password wajib diisi'; return; }
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

  cart          = [];
  diskonMode    = 'rp';
  paymentMethod = 'tunai';
  lastNota      = '';
  produkFilter  = 'Semua';
  updateCartBadge();
  ['diskon-val','uang-bayar','kasir-name'].forEach(id => {
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
  errEl.textContent = 'Mengirim email reset...';
  const result = await window.fbResetPassword(email);
  if (result.ok) {
    errEl.style.color = 'var(--green)';
    errEl.textContent = '✓ Email reset password sudah dikirim, cek inbox kamu';
  } else {
    errEl.style.color = 'var(--red)';
    errEl.textContent = result.error;
  }
}
