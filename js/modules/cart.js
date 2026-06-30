// ============================================================
//  MotoKas — modules/cart.js  (Bug-fix patch)
//  BUG FIX:
//  1. checkout: metode non-tunai (transfer/qris) tidak boleh minta uang bayar
//     tapi tetap harus set bayar = total agar nota benar
//  2. hitungTotal: subtotal 0 tidak menyebabkan NaN di diskon
//  3. renderCart: nama produk dengan karakter HTML tidak XSS
//  4. generateNota: jika metode bukan tunai, tampilkan "Lunas" bukan bayar/kembali
//  5. resetCartState: payment method tidak kembali ke 'tunai' secara visual
//  6. addToCart: auto navigate ke tab kasir setelah tambah produk
// ============================================================
import { getData, setData }                  from './storage.js';
import { toast, openModal, tglKey, fmtRp, fmtRpShort, tglKeyFromLocale } from './utils.js';
import { validasiJasa, validasiCheckout } from './validasi.js';
import { updateKritisCount, renderProduk }   from './produk.js';

let cart                = [];
let diskonMode          = 'rp';
let paymentMethod       = 'tunai';
let isDP                = false;
export let lastNota     = '';
export let lastTrx      = null;
let _checkoutInProgress = false;
let _currentTotal       = 0;

export function getCart()     { return cart; }
export function getTotal()    { return _currentTotal; }
export function getLastNota() { return lastNota; }

// BUG FIX #5: reset visual payment method juga
export function resetCartState() {
  cart                = [];
  diskonMode          = 'rp';
  paymentMethod       = 'tunai';
  isDP                = false;
  lastNota            = '';
  lastTrx             = null;
  _checkoutInProgress = false;
  _currentTotal       = 0;
  updateCartBadge();
  ['diskon-val','uang-bayar','mekanik-name','jasa-nama','jasa-harga','jasa-mekanik','dp-nominal']
    .forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
  const kemRow = document.getElementById('kembalian-row');
  if (kemRow) kemRow.style.display = 'none';
  const dpCheckbox = document.getElementById('dp-checkbox');
  if (dpCheckbox) dpCheckbox.checked = false;
  const dpSection = document.getElementById('dp-section');
  if (dpSection) dpSection.style.display = 'none';
  const sisaDpRow = document.getElementById('sisa-dp-row');
  if (sisaDpRow) sisaDpRow.style.display = 'none';
  // Reset tampilan payment method ke tunai
  document.querySelectorAll('.payment-btn').forEach(b => b.classList.remove('active'));
  document.querySelector('.payment-btn')?.classList.add('active');
  const tunaiSec = document.getElementById('tunai-section');
  if (tunaiSec) tunaiSec.style.display = 'block';
  // Reset diskon toggle
  document.getElementById('diskon-rp')?.classList.add('active');
  document.getElementById('diskon-pct')?.classList.remove('active');
}

// ── DP / PIUTANG ────────────────────────────────────────────
export function toggleDP(checked) {
  isDP = checked;
  const dpSection = document.getElementById('dp-section');
  if (dpSection) dpSection.style.display = checked ? 'block' : 'none';
  if (!checked) {
    const dpInput = document.getElementById('dp-nominal');
    if (dpInput) dpInput.value = '';
    const sisaDpRow = document.getElementById('sisa-dp-row');
    if (sisaDpRow) sisaDpRow.style.display = 'none';
  }
}

export function hitungSisaDP() {
  const total = _currentTotal;
  const dp    = parseFloat(document.getElementById('dp-nominal')?.value) || 0;
  const row   = document.getElementById('sisa-dp-row');
  if (!row) return;
  if (dp > 0) {
    row.style.display = 'flex';
    const sisa = Math.max(0, total - dp);
    const valEl = document.getElementById('sisa-dp-val');
    if (valEl) valEl.textContent = fmtRp(sisa);
  } else {
    row.style.display = 'none';
  }
}

// BUG FIX #6: setelah tambah, pindah ke tab kasir otomatis
export function addToCart(id) {
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

export function tambahJasa() {
  const nama    = document.getElementById('jasa-nama')?.value.trim();
  const harga   = parseFloat(document.getElementById('jasa-harga')?.value) || 0;
  const mekanik = document.getElementById('jasa-mekanik')?.value.trim() || '';
  if (!validasiJasa()) return;
  cart.push({
    id: 'jasa-' + Date.now(),
    nama: nama + (mekanik ? ` (${mekanik})` : ''),
    harga, hpp: 0, qty: 1, maxStok: 999, isJasa: true, mekanik,
  });
  ['jasa-nama','jasa-harga','jasa-mekanik'].forEach(id => {
    const el = document.getElementById(id); if (el) el.value = '';
  });
  updateCartBadge(); renderCart(); hitungTotal();
  toast(`Jasa "${nama}" ditambahkan ✓`);
}

export function updateCartBadge() {
  const total = cart.reduce((s, c) => s + c.qty, 0);
  const badge = document.getElementById('cart-badge');
  if (!badge) return;
  badge.style.display = total > 0 ? 'flex' : 'none';
  badge.textContent   = total;
}

// BUG FIX #3: escHtml pada nama produk di cart
export function renderCart() {
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
        <div class="cart-item-name">${escHtml(c.nama)}</div>
        <div class="cart-item-price">${fmtRp(c.harga)} × ${c.qty}</div>
      </div>
      <div class="cart-qty-ctrl">
        <button class="qty-btn" onclick="window._cartModule.changeQty(${i},-1)">−</button>
        <span class="qty-val">${c.qty}</span>
        <button class="qty-btn" onclick="window._cartModule.changeQty(${i},1)">+</button>
      </div>
      <div class="cart-sub">${fmtRp(c.harga * c.qty)}</div>
      <button class="btn-rm" onclick="window._cartModule.removeCart(${i})">✕</button>
    </div>`).join('');
}

export function changeQty(i, d) {
  if (!cart[i]) return;
  cart[i].qty = Math.max(1, Math.min(cart[i].maxStok, cart[i].qty + d));
  renderCart(); hitungTotal();
}

export function removeCart(i) {
  cart.splice(i, 1);
  updateCartBadge(); renderCart(); hitungTotal();
}

// BUG FIX #2: guard subtotal 0
export function hitungDiskon(subtotal, mode) {
  if (!subtotal || subtotal <= 0) return 0;
  const dv = parseFloat(document.getElementById('diskon-val')?.value) || 0;
  const m  = mode || diskonMode;
  if (m === 'pct') return Math.round(subtotal * Math.min(100, Math.max(0, dv)) / 100);
  return Math.min(dv, subtotal);
}

export function hitungTotal() {
  const subtotal = cart.reduce((s, c) => s + c.harga * c.qty, 0);
  const diskon   = hitungDiskon(subtotal);
  const total    = Math.max(0, subtotal - diskon);
  _currentTotal  = total;

  const setText = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
  setText('co-subtotal', fmtRp(subtotal));
  setText('co-diskon',   '- ' + fmtRp(diskon));
  setText('co-total',    fmtRp(total));

  const labaEstimasi = cart.reduce((s, c) => s + (c.harga - c.hpp) * c.qty, 0) - diskon;
  const labaWarn = document.getElementById('laba-warn');
  if (labaWarn) {
    labaWarn.style.display = labaEstimasi < 0 ? 'block' : 'none';
    labaWarn.textContent   = `⚠️ Estimasi laba minus: ${fmtRp(labaEstimasi)}`;
  }
  hitungKembalian();
}

export function setDiskonMode(mode) {
  diskonMode = mode;
  document.getElementById('diskon-rp')?.classList.toggle('active',  mode === 'rp');
  document.getElementById('diskon-pct')?.classList.toggle('active', mode === 'pct');
  hitungTotal();
}

export function setPayment(btn, method) {
  paymentMethod = method;
  document.querySelectorAll('.payment-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  const tunaiSection = document.getElementById('tunai-section');
  if (tunaiSection) tunaiSection.style.display = method === 'tunai' ? 'block' : 'none';
  // Reset kembalian jika bukan tunai
  if (method !== 'tunai') {
    const row = document.getElementById('kembalian-row');
    if (row) row.style.display = 'none';
  }
}

export function hitungKembalian() {
  if (paymentMethod !== 'tunai') return;
  const total = _currentTotal;
  const bayar = parseFloat(document.getElementById('uang-bayar')?.value) || 0;
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

// ── CHECKOUT ──────────────────────────────────────────────────
export function checkout() {
  if (cart.length === 0) return;
  if (_checkoutInProgress) { toast('Sedang memproses...'); return; }
  _checkoutInProgress = true;

  const snapshotDiskonMode = diskonMode;
  const subtotal = cart.reduce((s, c) => s + c.harga * c.qty, 0);
  const diskon   = hitungDiskon(subtotal, snapshotDiskonMode);
  const total    = Math.max(0, subtotal - diskon);
  const kasir    = document.getElementById('kasir-name')?.value.trim()   || 'Kasir';
  const mekanik  = document.getElementById('mekanik-name')?.value.trim() || '';
  const bayar    = parseFloat(document.getElementById('uang-bayar')?.value) || 0;
  const dpNominal = isDP ? (parseFloat(document.getElementById('dp-nominal')?.value) || 0) : 0;

  // Validasi checkout terpusat
  if (!validasiCheckout(paymentMethod, total, isDP)) {
    _checkoutInProgress = false; return;
  }

  // Validasi stok
  let produk = getData('produk', []);
  for (const c of cart) {
    if (c.isJasa) continue;
    const p = produk.find(x => x.id === c.id);
    if (!p || p.stok < c.qty) {
      toast(`Stok ${c.nama} tidak cukup (tersisa ${p ? p.stok : 0})`, 'error');
      _checkoutInProgress = false; return;
    }
  }

  // Kurangi stok
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
    no_invoice: 'INV-' + Date.now().toString().slice(-8),
    waktu:     now.toLocaleString('id-ID'),
    items:     cart.map(c => ({ ...c })),
    subtotal, diskon, total,
    metode:    paymentMethod,
    bayar:     isDP ? dpNominal : (paymentMethod === 'tunai' ? bayar : total),
    kembalian: isDP ? 0 : (paymentMethod === 'tunai' ? Math.max(0, bayar - total) : 0),
    kasir, mekanik,
    laba:   cart.reduce((s, c) => s + (c.harga - c.hpp) * c.qty, 0) - diskon,
    status: isDP ? 'piutang' : 'selesai',
    sisa_tagihan: isDP ? Math.max(0, total - dpNominal) : 0,
  };

  const riwayat = getData('riwayat', []);
  riwayat.unshift(trx);
  // FIX: limit riwayat 500 entry agar localStorage tidak penuh
  if (riwayat.length > 500) riwayat.splice(500);
  setData('riwayat', riwayat);

  const tgl     = tglKey(now);
  const laporan = getData('laporan', {});
  if (!laporan[tgl]) laporan[tgl] = { omzet: 0, laba: 0, trx: 0, terlaris: {} };
  // Untuk piutang/DP: omzet yang dicatat hanya sebesar DP yang diterima.
  // Laba & terlaris tetap dicatat penuh karena barang/jasa sudah keluar.
  laporan[tgl].omzet += isDP ? dpNominal : total;
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
  if (prefs.auto_sheets) window.kirimSheets?.(trx);

  if (!navigator.onLine) {
    const pending = getData('_pending_sync', []);
    pending.push(trx.id);
    setData('_pending_sync', pending);
  }

  localStorage.setItem('_last_kasir', kasir);

  const cartItems   = [...cart];
  const wasDP       = isDP;
  cart = []; _checkoutInProgress = false; _currentTotal = 0; isDP = false;
  // FIX: flag sudah di-reset di sini, try-finally di bawah sebagai safety net
  updateCartBadge(); renderCart(); hitungTotal();
  ['diskon-val','uang-bayar','dp-nominal'].forEach(id => {
    const el = document.getElementById(id); if (el) el.value = '';
  });
  const dpCheckbox = document.getElementById('dp-checkbox');
  if (dpCheckbox) dpCheckbox.checked = false;
  const dpSection = document.getElementById('dp-section');
  if (dpSection) dpSection.style.display = 'none';

  toast(wasDP ? '✓ DP berhasil dicatat!' : '✓ Transaksi berhasil!', 'success');
  openModal('modal-nota');
  renderProduk();
  updateKritisCount();
  if (typeof window.renderRiwayat === 'function') window.renderRiwayat();
  if (typeof window._laporanModule?.renderPiutang === 'function') window._laporanModule.renderPiutang();

  const prefs2 = getData('prefs', { stok_alert: true });
  if (prefs2.stok_alert) cekStokKritisPaskaCheckout(cartItems);
}

function cekStokKritisPaskaCheckout(items) {
  const produk = getData('produk', []);
  const kritis = [];
  items.forEach(item => {
    if (item.isJasa) return;
    const p = produk.find(x => x.id === item.id);
    if (p && p.stok <= (p.minstok ?? 5)) kritis.push(`${p.nama} (sisa ${p.stok})`);
  });
  if (kritis.length > 0) {
    setTimeout(() => toast(`⚠️ Stok kritis: ${kritis.join(', ')}`, 'error'), 1200);
  }
}

// ── NOTA ────────────────────────────────────────────────────
export function generateNota(trx) {
  const s     = getData('settings', {});
  const prefs = getData('prefs', { show_laba: false });
  const w     = 32;
  const center = str => ' '.repeat(Math.max(0, Math.floor((w - str.length) / 2))) + str;
  // FIX: rata kanan nominal biar rapi kayak struk toko pada umumnya
  const rightAlign = (left, right) => {
    const spasi = Math.max(1, w - left.length - right.length);
    return left + ' '.repeat(spasi) + right;
  };
  const line   = '================================';
  const dash   = '--------------------------------';
  let n = '';
  n += center(s.nama  || 'MotoKas') + '\n';
  if (s.alamat) n += center(s.alamat) + '\n';
  if (s.telp)   n += center('Telp: ' + s.telp) + '\n';
  n += line + '\n';
  n += `Waktu  : ${trx.waktu}\n`;
  n += `No     : ${trx.no_invoice || trx.id.toString().slice(-8)}\n`;
  n += `Kasir  : ${trx.kasir}\n`;
  if (trx.mekanik) n += `Mekanik: ${trx.mekanik}\n`;
  n += `Metode : ${trx.metode.toUpperCase()}\n`;
  n += dash + '\n';
  trx.items.forEach(i => {
    const namaShort = i.nama.length > 30 ? i.nama.substring(0, 30) + '..' : i.nama;
    n += `${namaShort}\n`;
    n += rightAlign(`  ${i.qty} x ${fmtRp(i.harga)}`, fmtRp(i.harga * i.qty)) + '\n';
  });
  n += dash + '\n';
  n += rightAlign('Subtotal :', fmtRp(trx.subtotal)) + '\n';
  if (trx.diskon > 0) n += rightAlign('Diskon :', '-' + fmtRp(trx.diskon)) + '\n';
  n += rightAlign('TOTAL :', fmtRp(trx.total)) + '\n';
  // BUG FIX #4: tampilkan info pembayaran sesuai metode
  if (trx.status === 'piutang') {
    n += rightAlign('DP Dibayar :', fmtRp(trx.bayar)) + '\n';
    n += rightAlign('Sisa Tagihan :', fmtRp(trx.sisa_tagihan)) + '\n';
    n += rightAlign('Status :', 'BELUM LUNAS') + '\n';
  } else if (trx.metode === 'tunai') {
    n += rightAlign('Bayar :', fmtRp(trx.bayar)) + '\n';
    n += rightAlign('Kembali :', fmtRp(trx.kembalian)) + '\n';
  } else {
    n += rightAlign('Status :', `LUNAS (${trx.metode.toUpperCase()})`) + '\n';
  }
  if (prefs.show_laba && trx.laba !== undefined) {
    n += dash + '\n';
    n += rightAlign('Laba :', fmtRp(trx.laba)) + '\n';
  }
  n += line + '\n';
  n += center(s.footer1 || 'Terima kasih!') + '\n';
  if (s.footer2) {
    const words = s.footer2.split(' ');
    let baris = '';
    words.forEach(word => {
      if ((baris + ' ' + word).trim().length > 30) {
        n += center(baris.trim()) + '\n'; baris = word;
      } else { baris = (baris + ' ' + word).trim(); }
    });
    if (baris) n += center(baris.trim()) + '\n';
  }
  return n;
}

export function lihatDetailTrx(trxId) {
  const riwayat = getData('riwayat', []);
  const trx     = riwayat.find(r => r.id === trxId);
  if (!trx) { toast('Transaksi tidak ditemukan', 'error'); return; }
  const nota = generateNota(trx);
  const notaContent = document.getElementById('nota-content');
  if (notaContent) notaContent.textContent = nota;
  openModal('modal-nota');
}

export function cetakNotaTerakhir() {
  if (!lastNota) { toast('Belum ada transaksi', 'error'); return; }
  const notaContent = document.getElementById('nota-content');
  if (notaContent) notaContent.textContent = lastNota;
  openModal('modal-nota');
}

export async function shareNota() {
  const nota = lastNota;
  if (!nota) { toast('Belum ada transaksi', 'error'); return; }
  if (navigator.share) {
    try { await navigator.share({ title: 'Struk Transaksi', text: nota }); } catch { /* ignore */ }
  } else {
    navigator.clipboard.writeText(nota)
      .then(() => toast('Struk disalin ke clipboard ✓'))
      .catch(() => toast('Gagal menyalin, coba manual', 'error'));
  }
}

function escHtml(str) {
  return String(str)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

window._cartModule = {
  addToCart, tambahJasa, changeQty, removeCart, checkout,
  getCart, setPayment, setDiskonMode, hitungTotal, hitungKembalian,
  lihatDetailTrx, cetakNotaTerakhir, shareNota, resetCartState,
  toggleDP, hitungSisaDP,
};
