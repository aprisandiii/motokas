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
  // Expose ke window supaya Firebase bisa baca
  if (key === 'produk')  window.produk  = val;
  if (key === 'laporan') window.laporan = val;
  if (key === 'riwayat') window.riwayat = val;
  if (key === 'settings') window.pengaturan = val;
  // Trigger Firebase sync
  if (['produk','laporan','riwayat','settings'].includes(key)) {
    clearTimeout(window._fbSaveTimeout);
    window._fbSaveTimeout = setTimeout(() => {
      if (window.FB && window.FB.uid && typeof window.fbSimpanSemua === 'function') {
        window.fbSimpanSemua();
      }
    }, 800);
  }
}

// Expose data awal dari localStorage ke window
window.produk    = getData('produk', []);
window.laporan   = getData('laporan', {});
window.riwayat   = getData('riwayat', []);
window.pengaturan = getData('settings', {});

// ===== BUGFIX: window.render* wrapper diperbaiki =====
// Sebelumnya window.renderProduk memanggil renderProduk() yang sudah
// di-override oleh window.renderProduk sendiri → infinite recursion.
// Solusi: simpan referensi fungsi lokal SEBELUM di-override, lalu
// panggil referensi tersebut dari dalam wrapper.
// Wrapper ini akan di-assign SETELAH fungsi lokal didefinisikan (di bawah).

// Expose fungsi agar Firebase bisa memanggil setelah sync data
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

// ===== INIT =====
window.addEventListener('load', () => {
  const s = getData('settings', {});
  if (s.nama) document.getElementById('pin-store-name').textContent = s.nama;
  if (s.alamat) document.getElementById('pin-store-addr').textContent = s.alamat;

  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault(); deferredPrompt = e;
    const b = document.getElementById('install-banner');
    b.style.display = 'flex';
  });

  const today = new Date().toISOString().split('T')[0];
  const weekAgo = new Date(Date.now() - 7*24*3600*1000).toISOString().split('T')[0];
  document.getElementById('date-dari').value = weekAgo;
  document.getElementById('date-sampai').value = today;

  document.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', e => {
      if (e.target === overlay) overlay.classList.remove('show');
    });
  });
});

function installPWA() {
  if (deferredPrompt) { deferredPrompt.prompt(); deferredPrompt = null; }
  document.getElementById('install-banner').style.display = 'none';
}

// ===== PIN =====
function pinInput(d) {
  if (currentPin.length >= 4) return;
  if (Date.now() < lockUntil) {
    showPinStatus(`Terkunci ${Math.ceil((lockUntil - Date.now()) / 1000)}d lagi`, 'error');
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
  el.className = 'pin-status ' + type;
}

function checkPin() {
  const saved = getData('pin', '1234');
  if (currentPin === saved) {
    showPinStatus('✓ Berhasil', 'success');
    pinAttempts = 0;
    setTimeout(() => {
      document.getElementById('pin-screen').style.display = 'none';
      document.getElementById('app').style.display = 'block';
      initApp();
    }, 300);
  } else {
    pinAttempts++;
    if (pinAttempts >= 5) {
      lockUntil = Date.now() + 30000;
      showPinStatus('Terkunci 30 detik (5x salah)', 'error');
    } else {
      showPinStatus(`PIN salah (${pinAttempts}/5)`, 'error');
    }
    currentPin = '';
    updatePinDots();
    setTimeout(() => showPinStatus('Masukkan PIN'), 1500);
  }
}

function lockApp() {
  document.getElementById('app').style.display = 'none';
  document.getElementById('pin-screen').style.display = 'flex';
  currentPin = '';
  updatePinDots();
  showPinStatus('Masukkan PIN');
}

function gantiPIN() {
  const lama = document.getElementById('pin-lama').value;
  const baru = document.getElementById('pin-baru').value;
  const konfirm = document.getElementById('pin-konfirm').value;
  const saved = getData('pin', '1234');
  if (lama !== saved) { toast('PIN lama salah', 'error'); return; }
  if (baru.length !== 4 || !/^\d{4}$/.test(baru)) { toast('PIN baru harus 4 digit angka', 'error'); return; }
  if (baru !== konfirm) { toast('Konfirmasi PIN tidak cocok', 'error'); return; }
  setData('pin', baru);
  closeModal('modal-pin');
  toast('PIN berhasil diganti ✓', 'success');
  ['pin-lama', 'pin-baru', 'pin-konfirm'].forEach(id => document.getElementById(id).value = '');
}

function resetPinPrompt() {
  const kode = prompt('Masukkan kode rahasia untuk reset PIN:');
  const s = getData('settings', {});
  const rahasia = s.kode_rahasia || 'MOTOR88';
  if (kode === rahasia) {
    setData('pin', '1234');
    showPinStatus('PIN direset ke 1234 ✓', 'success');
  } else {
    alert('Kode rahasia salah');
  }
}

// ===== APP INIT =====
function initApp() {
  loadSettings();
  renderDashboard();
  renderProduk();
  renderLaporan();
  renderRiwayat();
  if (typeof window.injectCloudButton === 'function') window.injectCloudButton();
}

// ===== NAVIGATION =====
function navTo(page, btn) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.getElementById('page-' + page).classList.add('active');
  btn.classList.add('active');
  if (page === 'dashboard') renderDashboard();
  if (page === 'laporan') { renderLaporan(); renderRiwayat(); }
}

// ===== SETTINGS =====
function loadSettings() {
  const s = getData('settings', {});
  document.getElementById('set-nama').value = s.nama || '';
  document.getElementById('set-alamat').value = s.alamat || '';
  document.getElementById('set-telp').value = s.telp || '';
  document.getElementById('set-footer1').value = s.footer1 || 'Terima kasih telah berbelanja!';
  document.getElementById('set-footer2').value = s.footer2 || 'Barang yang sudah dibeli tidak dapat dikembalikan';
  document.getElementById('set-sheets-url').value = s.sheets_url || '';
  document.getElementById('set-kode-rahasia').value = s.kode_rahasia || '';
  document.getElementById('hdr-name').textContent = s.nama || 'Nama Toko';
  document.getElementById('hdr-sub').textContent = (s.alamat ? s.alamat + ' — ' : '') + 'v4.0';
  document.getElementById('pin-store-name').textContent = s.nama || 'Nama Toko';
  if (s.alamat) document.getElementById('pin-store-addr').textContent = s.alamat;

  const prefs = getData('prefs', { auto_sheets: false, show_laba: false, stok_alert: true });
  setToggleState('toggle-auto-sheets', prefs.auto_sheets);
  setToggleState('toggle-show-laba', prefs.show_laba);
  setToggleState('toggle-stok-alert', prefs.stok_alert);
  updateSheetsStatus(!!s.sheets_url);
}

function saveSettings() {
  const s = {
    nama: document.getElementById('set-nama').value,
    alamat: document.getElementById('set-alamat').value,
    telp: document.getElementById('set-telp').value,
    footer1: document.getElementById('set-footer1').value,
    footer2: document.getElementById('set-footer2').value,
    sheets_url: document.getElementById('set-sheets-url').value,
    kode_rahasia: document.getElementById('set-kode-rahasia').value || 'MOTOR88',
  };
  setData('settings', s);
  document.getElementById('hdr-name').textContent = s.nama || 'Nama Toko';
  document.getElementById('hdr-sub').textContent = (s.alamat ? s.alamat + ' — ' : '') + 'v4.0';
  updateSheetsStatus(!!s.sheets_url);
}

function toggleSetting(key, btn) {
  const prefs = getData('prefs', { auto_sheets: false, show_laba: false, stok_alert: true });
  prefs[key] = !prefs[key];
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
  const icons = { 'Oli': '🛢️', 'Spare Part': '⚙️', 'Aksesoris': '🔩', 'Ban': '🔄', 'Aki': '🔋', 'Lainnya': '📦' };
  return icons[cat] || '📦';
}

function renderProduk() {
  const produk = getData('produk', []);
  const q = (document.getElementById('search-produk').value || '').toLowerCase();
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
    document.getElementById('modal-produk-title').textContent = 'Tambah Produk';
    document.getElementById('edit-produk-id').value = '';
    ['prod-nama', 'prod-hpp', 'prod-harga', 'prod-stok', 'prod-minstok', 'prod-sku'].forEach(i => document.getElementById(i).value = '');
    document.getElementById('prod-cat').value = '';
    document.getElementById('edit-delete-row').style.display = 'none';
  }
}

function closeModal(id) {
  document.getElementById(id).classList.remove('show');
}

function editProduk(id) {
  const p = getData('produk', []).find(x => x.id === id);
  if (!p) return;
  document.getElementById('modal-produk-title').textContent = 'Edit Produk';
  document.getElementById('edit-produk-id').value = id;
  document.getElementById('prod-nama').value = p.nama;
  document.getElementById('prod-cat').value = p.kategori;
  document.getElementById('prod-hpp').value = p.hpp || '';
  document.getElementById('prod-harga').value = p.harga;
  document.getElementById('prod-stok').value = p.stok;
  document.getElementById('prod-minstok').value = p.minstok || '';
  document.getElementById('prod-sku').value = p.sku || '';
  document.getElementById('edit-delete-row').style.display = 'block';
  openModal('modal-tambah-produk');
}

function simpanProduk() {
  const nama = document.getElementById('prod-nama').value.trim();
  const kategori = document.getElementById('prod-cat').value;
  const hpp = parseFloat(document.getElementById('prod-hpp').value) || 0;
  const harga = parseFloat(document.getElementById('prod-harga').value) || 0;
  const stok = parseInt(document.getElementById('prod-stok').value) || 0;
  const minstok = parseInt(document.getElementById('prod-minstok').value) || 5;
  const sku = document.getElementById('prod-sku').value.trim();
  const editId = parseInt(document.getElementById('edit-produk-id').value) || 0;

  if (!nama) { toast('Nama produk wajib diisi', 'error'); return; }
  if (!kategori) { toast('Pilih kategori', 'error'); return; }
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
  badge.textContent = total;
}

function renderCart() {
  const list = document.getElementById('cart-list');
  const empty = document.getElementById('cart-empty');
  if (cart.length === 0) {
    list.style.display = 'none';
    empty.style.display = 'block';
    document.getElementById('btn-checkout').disabled = true;
    return;
  }
  list.style.display = 'flex';
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

function hitungTotal() {
  const subtotal = cart.reduce((s, c) => s + c.harga * c.qty, 0);
  const dv = parseFloat(document.getElementById('diskon-val').value) || 0;
  const diskon = diskonMode === 'pct' ? Math.round(subtotal * dv / 100) : dv;
  const total = Math.max(0, subtotal - diskon);
  document.getElementById('co-subtotal').textContent = fmtRp(subtotal);
  document.getElementById('co-diskon').textContent = '- ' + fmtRp(diskon);
  document.getElementById('co-total').textContent = fmtRp(total);
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
  const total = parseInt((document.getElementById('co-total').textContent || '0').replace(/\D/g, '')) || 0;
  const bayar = parseFloat(document.getElementById('uang-bayar').value) || 0;
  const row = document.getElementById('kembalian-row');
  if (bayar > 0) {
    row.style.display = 'flex';
    const kembalian = bayar - total;
    document.getElementById('kembalian-val').textContent = fmtRp(Math.max(0, kembalian));
    document.getElementById('kembalian-val').style.color = kembalian < 0 ? 'var(--red)' : 'var(--green)';
  } else {
    row.style.display = 'none';
  }
}

function checkout() {
  if (cart.length === 0) return;
  const subtotal = cart.reduce((s, c) => s + c.harga * c.qty, 0);
  const dv = parseFloat(document.getElementById('diskon-val').value) || 0;
  const diskon = diskonMode === 'pct' ? Math.round(subtotal * dv / 100) : dv;
  const total = Math.max(0, subtotal - diskon);
  const kasir = document.getElementById('kasir-name').value || 'Kasir';
  const bayar = parseFloat(document.getElementById('uang-bayar').value) || total;

  if (paymentMethod === 'tunai' && bayar < total) { toast('Uang bayar kurang!', 'error'); return; }

  let produk = getData('produk', []);
  cart.forEach(c => {
    const idx = produk.findIndex(p => p.id === c.id);
    if (idx >= 0) {
      produk[idx].stok = Math.max(0, produk[idx].stok - c.qty);
      produk[idx].terjual = (produk[idx].terjual || 0) + c.qty;
    }
  });
  setData('produk', produk);

  const now = new Date();
  const trx = {
    id: Date.now(),
    waktu: now.toLocaleString('id-ID'),
    items: cart.map(c => ({ ...c })),
    subtotal, diskon, total,
    metode: paymentMethod,
    bayar, kembalian: Math.max(0, bayar - total),
    kasir,
    laba: cart.reduce((s, c) => s + (c.harga - c.hpp) * c.qty, 0) - diskon,
  };

  const riwayat = getData('riwayat', []);
  riwayat.unshift(trx);
  setData('riwayat', riwayat);

  const tgl = tglKey(now); // format YYYY-MM-DD (aman untuk Firebase key)
  const laporan = getData('laporan', {});
  if (!laporan[tgl]) laporan[tgl] = { omzet: 0, laba: 0, trx: 0, terlaris: {} };
  laporan[tgl].omzet += total;
  laporan[tgl].laba += trx.laba;
  laporan[tgl].trx++;
  cart.forEach(c => {
    // Gunakan key aman untuk Firebase (tanpa spasi & karakter terlarang)
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
  const s = getData('settings', {});
  const w = 32;
  const center = str => ' '.repeat(Math.max(0, Math.floor((w - str.length) / 2))) + str;
  const line = '─'.repeat(w);
  let n = '';
  n += center(s.nama || 'dityaMotor 88') + '\n';
  if (s.alamat) n += center(s.alamat) + '\n';
  if (s.telp) n += center('Telp: ' + s.telp) + '\n';
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
  const tgl = tglKey(); // YYYY-MM-DD
  const hari = laporan[tgl] || { omzet: 0, laba: 0, trx: 0 };
  document.getElementById('stat-omzet').textContent = fmtRpShort(hari.omzet);
  document.getElementById('stat-laba').textContent = fmtRpShort(hari.laba);
  document.getElementById('stat-trx').textContent = hari.trx;
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
    const tgl = tglKey(d); // YYYY-MM-DD
    omzetData.push(laporan[tgl]?.omzet || 0);
    labaData.push(laporan[tgl]?.laba || 0);
  }
  const ctx = document.getElementById('chartOmzet').getContext('2d');
  if (chartInstance) chartInstance.destroy();
  chartInstance = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: days,
      datasets: [
        { label: 'Omzet', data: omzetData, backgroundColor: 'rgba(245,197,66,0.7)', borderRadius: 4 },
        { label: 'Laba', data: labaData, backgroundColor: 'rgba(76,175,125,0.7)', borderRadius: 4 }
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
  const now = new Date();
  const bulan = now.getMonth(), tahun = now.getFullYear();
  const totalTerjual = {};
  Object.entries(laporan).forEach(([tgl, data]) => {
    // Support both format lama (DD/M/YYYY) dan format baru (YYYY-MM-DD)
    let d;
    if (tgl.includes('-')) {
      d = new Date(tgl); // format baru YYYY-MM-DD
    } else {
      const parts = tgl.split('/');
      if (parts.length === 3) d = new Date(parts[2], parts[1] - 1, parts[0]);
    }
    if (d && d.getMonth() === bulan && d.getFullYear() === tahun) {
      Object.entries(data.terlaris || {}).forEach(([key, val]) => {
        // Support format baru {nama, qty} dan format lama angka langsung
        const nama = (typeof val === 'object') ? val.nama : key.replace(/_/g, ' ');
        const qty  = (typeof val === 'object') ? val.qty  : val;
        totalTerjual[nama] = (totalTerjual[nama] || 0) + qty;
      });
    }
  });
  const sorted = Object.entries(totalTerjual).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const el = document.getElementById('terlaris-list');
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
  const dari = document.getElementById('date-dari').value;
  const sampai = document.getElementById('date-sampai').value;
  const entries = Object.entries(laporan).map(([tgl, data]) => {
    // Support format lama DD/M/YYYY dan format baru YYYY-MM-DD
    let iso, display;
    if (tgl.includes('-')) {
      iso = tgl; // sudah YYYY-MM-DD
      display = tglDisplay(tgl); // tampilkan DD/M/YYYY
    } else {
      const parts = tgl.split('/');
      iso = parts.length === 3 ? `${parts[2]}-${parts[1].padStart(2,'0')}-${parts[0].padStart(2,'0')}` : '';
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
  const today = new Date().toISOString().split('T')[0];
  const weekAgo = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString().split('T')[0];
  document.getElementById('date-dari').value = weekAgo;
  document.getElementById('date-sampai').value = today;
  renderLaporan();
}

function renderRiwayat() {
  const riwayat = getData('riwayat', []);
  const filterPay = document.getElementById('filter-payment').value;
  const filtered = filterPay ? riwayat.filter(r => r.metode === filterPay) : riwayat;
  const el = document.getElementById('riwayat-list');
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
    const terlaris = Object.entries(d.terlaris || {}).sort((a, b) => b[1] - a[1])[0];
    csv += `${tgl},${d.omzet},${d.laba},${d.trx},${terlaris ? terlaris[0] : '-'}\n`;
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
    produk: getData('produk', []),
    laporan: getData('laporan', {}),
    riwayat: getData('riwayat', []),
    settings: getData('settings', {}),
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
      if (data.produk)   setData('produk', data.produk);
      if (data.laporan)  setData('laporan', data.laporan);
      if (data.riwayat)  setData('riwayat', data.riwayat);
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
  const konfirm = prompt('Ketik "HAPUS SEMUA" untuk konfirmasi:');
  if (konfirm !== 'HAPUS SEMUA') { toast('Dibatalkan'); return; }
  ['produk', 'laporan', 'riwayat'].forEach(k => localStorage.removeItem(k));
  window.produk  = [];
  window.laporan = {};
  window.riwayat = [];
  cart = [];
  updateCartBadge();
  renderCart();
  initApp();
  toast('Semua data dihapus', 'error');
}

// ===== UTILS =====
// Format tanggal aman untuk Firebase key (tidak boleh ada "/")
// Gunakan YYYY-MM-DD sebagai key, tampilkan DD/MM/YYYY di UI
function tglKey(date) {
  const d = date || new Date();
  return d.toISOString().split('T')[0]; // "2026-05-26"
}
function tglDisplay(isoKey) {
  // "2026-05-26" → "26/5/2026"
  const [y, m, dd] = isoKey.split('-');
  return `${parseInt(dd)}/${parseInt(m)}/${y}`;
}

function fmtRp(n) { return 'Rp ' + Math.round(n || 0).toLocaleString('id-ID'); }
function fmtRpShort(n) {
  n = Math.round(n || 0);
  if (n >= 1000000) return 'Rp ' + (n / 1000000).toFixed(1) + 'jt';
  if (n >= 1000) return 'Rp ' + (n / 1000).toFixed(0) + 'rb';
  return 'Rp ' + n;
}
function toast(msg, type = '') {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = 'toast show ' + type;
  setTimeout(() => el.className = 'toast', 2500);
}
