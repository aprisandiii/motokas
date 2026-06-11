// ============================================================
//  MotoKas — modules/produk.js  (Bug-fix patch)
//  BUG FIX:
//  1. renderProduk: tombol + pada produk stok=0 tidak boleh punya onclick kosong
//     (menyebabkan error "Uncaught SyntaxError" di beberapa browser)
//  2. simpanProduk: setelah simpan, reset form & editId secara eksplisit
//  3. hapusProduk: gunakan id bertipe number bukan string (parseInt sudah ada, tapi
//     perlu juga handle kasus editId kosong)
//  4. openRestok: input HPP tidak kehapus setelah simpan (sekarang bersih)
//  5. updateKritisCount: stok = 0 tapi minstok juga 0 → tidak tampil kritis (fix logika)
// ============================================================
import { getData, setData }            from './storage.js';
import { toast, openModal, closeModal, getCatIcon } from './utils.js';
import { validasiProduk, validasiRestok, bindClearOnInput } from './validasi.js';

let produkFilter = 'Semua';
export function getProdukFilter() { return produkFilter; }

export function setFilter(el) {
  document.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
  el.classList.add('active');
  produkFilter = el.dataset.cat;
  renderProduk();
}

export function renderProduk() {
  const produk   = getData('produk', []);
  const q        = (document.getElementById('search-produk')?.value || '').toLowerCase();
  const filtered = produk.filter(p =>
    (produkFilter === 'Semua' || p.kategori === produkFilter) &&
    (!q || p.nama.toLowerCase().includes(q) || (p.sku || '').toLowerCase().includes(q))
  );
  const list = document.getElementById('produk-list');
  if (!list) return;
  if (filtered.length === 0) {
    list.innerHTML = `<div class="empty-state">
      <div class="empty-icon">📦</div>Belum ada produk.<br>
      <small>Tap ＋ untuk tambah produk.</small></div>`;
    return;
  }
  list.innerHTML = filtered.map(p => {
    const isLow = p.stok <= (p.minstok ?? 5);
    // BUG FIX #1: onclick kosong diganti disabled class + cursor not-allowed
    const addBtn = p.stok > 0
      ? `<button class="btn-add-cart" onclick="window._cartModule.addToCart(${p.id})">＋</button>`
      : `<button class="btn-add-cart disabled" disabled title="Stok habis">＋</button>`;
    return `<div class="produk-card">
      <div class="produk-icon">${getCatIcon(p.kategori)}</div>
      <div class="produk-info">
        <div class="produk-name">${escHtml(p.nama)}</div>
        <div class="produk-meta">
          <span class="produk-price">Rp ${Math.round(p.harga).toLocaleString('id-ID')}</span>
          <span class="produk-cat">${escHtml(p.kategori)}</span>
          <span class="produk-stok ${isLow ? 'low' : ''}">Stok: ${p.stok}${p.sku ? ' · ' + escHtml(p.sku) : ''}</span>
        </div>
      </div>
      <div class="produk-actions">
        <button class="btn-edit-prod" title="Edit"       onclick="window._produkModule.editProduk(${p.id})">✏️</button>
        <button class="btn-edit-prod" title="Stok masuk" onclick="window._produkModule.openRestok(${p.id})">📦+</button>
        ${addBtn}
      </div>
    </div>`;
  }).join('');
}

export function editProduk(id) {
  const p = getData('produk', []).find(x => x.id === id);
  if (!p) return;
  document.getElementById('modal-produk-title').textContent = 'Edit Produk';
  document.getElementById('edit-produk-id').value  = id;
  document.getElementById('prod-nama').value        = p.nama;
  document.getElementById('prod-cat').value         = p.kategori;
  document.getElementById('prod-hpp').value         = p.hpp    || '';
  document.getElementById('prod-harga').value       = p.harga;
  document.getElementById('prod-stok').value        = p.stok;
  document.getElementById('prod-minstok').value     = p.minstok ?? '';
  document.getElementById('prod-sku').value         = p.sku    || '';
  document.getElementById('edit-delete-row').style.display = 'block';
  // FIX: tambahkan show + pastikan backdrop listener aktif
  const modalEl = document.getElementById('modal-tambah-produk');
  if (modalEl) {
    modalEl.classList.add('show');
    // Pasang backdrop listener jika belum ada
    if (!modalEl._backdropBound) {
      modalEl.addEventListener('click', e => {
        if (e.target === modalEl) {
          modalEl.classList.remove('show');
          const editIdEl = document.getElementById('edit-produk-id');
          if (editIdEl) editIdEl.value = '';
        }
      });
      modalEl._backdropBound = true;
    }
  }
}

export function simpanProduk() {
  const nama     = document.getElementById('prod-nama')?.value.trim();
  const kategori = document.getElementById('prod-cat')?.value;
  const hpp      = parseFloat(document.getElementById('prod-hpp')?.value)    || 0;
  const harga    = parseFloat(document.getElementById('prod-harga')?.value)  || 0;
  const stok     = parseInt(document.getElementById('prod-stok')?.value)     || 0;
  const minstok  = parseInt(document.getElementById('prod-minstok')?.value);
  const minStokFinal = isNaN(minstok) ? 5 : minstok;
  const sku      = document.getElementById('prod-sku')?.value.trim()  || '';
  const editIdRaw = document.getElementById('edit-produk-id')?.value;
  const editId   = editIdRaw ? Number(editIdRaw) : 0;

  if (!validasiProduk()) return;

  let produk = getData('produk', []);
  if (editId) {
    produk = produk.map(p => p.id === editId
      ? { ...p, nama, kategori, hpp, harga, stok, minstok: minStokFinal, sku }
      : p
    );
    toast('Produk diperbarui ✓', 'success');
  } else {
    const newId = Date.now() * 1000 + Math.floor(Math.random() * 1000);
    produk.push({ id: newId, nama, kategori, hpp, harga, stok, minstok: minStokFinal, sku, terjual: 0 });
    toast('Produk ditambahkan ✓', 'success');
  }
  setData('produk', produk);

  // BUG FIX #2: reset edit-produk-id setelah simpan
  const editIdEl = document.getElementById('edit-produk-id');
  if (editIdEl) editIdEl.value = '';

  closeModal('modal-tambah-produk');
  renderProduk();
  updateKritisCount();
}

export function hapusProduk() {
  // BUG FIX #3: validasi editId sebelum hapus
  const editIdRaw = document.getElementById('edit-produk-id')?.value;
  if (!editIdRaw) { toast('Tidak ada produk yang dipilih', 'error'); return; }
  const id   = Number(editIdRaw);
  const cart = window._cartModule?.getCart() || [];
  if (cart.some(c => c.id === id)) {
    toast('Produk ada di keranjang, hapus dari cart dulu', 'error'); return;
  }
  if (!confirm('Yakin hapus produk ini?')) return;
  setData('produk', getData('produk', []).filter(p => p.id !== id));
  closeModal('modal-tambah-produk');
  renderProduk();
  toast('Produk dihapus');
}

export function openRestok(id) {
  const p = getData('produk', []).find(x => x.id === id);
  if (!p) return;
  document.getElementById('restok-overlay')?.remove();

  const overlay = document.createElement('div');
  overlay.id        = 'restok-overlay';
  overlay.className = 'overlay-sheet';
  overlay.innerHTML = `
    <div class="sheet-card">
      <div class="sheet-handle"></div>
      <h3>📦 Stok Masuk</h3>
      <p class="sheet-sub">${escHtml(p.nama)} · Stok sekarang: <strong>${p.stok}</strong></p>
      <label>Jumlah Masuk *</label>
      <input id="restok-qty"     type="number" min="1"  placeholder="contoh: 10"               class="sheet-input">
      <label>Harga Modal Baru (HPP) — opsional</label>
      <input id="restok-hpp"     type="number" min="0"  placeholder="Kosongkan jika tidak berubah"
             class="sheet-input" value="${p.hpp || ''}">
      <label>Catatan — opsional</label>
      <input id="restok-catatan" type="text"             placeholder="contoh: Beli dari Supplier A" class="sheet-input">
      <button class="btn-primary   sheet-btn" onclick="window._produkModule.simpanRestok(${p.id})">💾 Simpan Stok Masuk</button>
      <button class="btn-secondary sheet-btn" onclick="document.getElementById('restok-overlay').remove()">Batal</button>
    </div>`;
  document.body.appendChild(overlay);
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
  document.getElementById('restok-qty').focus();
  bindClearOnInput(['restok-qty','restok-hpp','restok-catatan']);
}

export function simpanRestok(id) {
  const qty     = parseInt(document.getElementById('restok-qty')?.value)    || 0;
  const hppBaru = parseFloat(document.getElementById('restok-hpp')?.value)  || 0;
  const catatan = document.getElementById('restok-catatan')?.value.trim()   || '';

  if (!validasiRestok()) return;

  let produk = getData('produk', []);
  const idx  = produk.findIndex(p => p.id === id);
  if (idx < 0) { toast('Produk tidak ditemukan', 'error'); return; }

  const stokLama        = produk[idx].stok;
  produk[idx].stok     += qty;
  if (hppBaru > 0) produk[idx].hpp = hppBaru;
  setData('produk', produk);

  const riwayatStok = getData('riwayat_stok', []);
  riwayatStok.unshift({
    id: Date.now(), produk_id: id, nama: produk[idx].nama,
    qty, stok_sebelum: stokLama, stok_sesudah: produk[idx].stok,
    hpp_baru: hppBaru || null, catatan,
    waktu: new Date().toLocaleString('id-ID'),
  });
  setData('riwayat_stok', riwayatStok.slice(0, 200));

  // BUG FIX #4: bersihkan form restok setelah simpan
  ['restok-qty','restok-hpp','restok-catatan'].forEach(i => {
    const e = document.getElementById(i); if (e) e.value = '';
  });

  document.getElementById('restok-overlay')?.remove();
  renderProduk();
  updateKritisCount();
  toast(`Stok +${qty} berhasil dicatat ✓`, 'success');
}

// BUG FIX #5: stok 0 dengan minstok 0 tidak dianggap kritis
export function updateKritisCount() {
  const produk = getData('produk', []);
  const kritis = produk.filter(p => {
    const min = p.minstok ?? 5;
    // Kritis jika stok ≤ minstok, TAPI jika minstok = 0, hanya kritis jika stok = 0
    if (min === 0) return p.stok === 0;
    return p.stok <= min;
  });
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
        <div class="kritis-name">${escHtml(p.nama)}</div>
        <div class="kritis-stok">${p.stok} unit tersisa</div>
      </div>
      <div style="display:flex;align-items:center;gap:8px">
        <span class="badge-kritis">${p.stok <= 0 ? 'HABIS' : 'KRITIS'}</span>
        <button class="btn-stok-kritis" onclick="window._produkModule.openRestok(${p.id})">+Stok</button>
      </div>
    </div>`).join('');
}

function escHtml(str) {
  return String(str)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

window._produkModule = {
  editProduk, simpanProduk, hapusProduk,
  openRestok, simpanRestok, renderProduk,
  setFilter, updateKritisCount,
};
