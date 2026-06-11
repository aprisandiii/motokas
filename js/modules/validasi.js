// ============================================================
//  MotoKas — modules/validasi.js  (BARU)
//  Modul validasi input terpusat
//  Berisi:
//  - Fungsi validasi dengan highlight field merah
//  - Rules validasi per form
//  - Helper: angka positif, panjang teks, format email
// ============================================================

// ── CORE ──────────────────────────────────────────────────

/**
 * Tampilkan error pada field: border merah + pesan di bawah field
 * @param {string} id - element id
 * @param {string} pesan - pesan error
 */
export function fieldError(id, pesan) {
  const el = document.getElementById(id);
  if (!el) return;
  el.style.borderColor = 'var(--red)';
  el.style.boxShadow   = '0 0 0 2px rgba(224,82,82,0.2)';
  // Hapus pesan lama jika ada
  el.parentElement?.querySelector('.field-err-msg')?.remove();
  const msg       = document.createElement('div');
  msg.className   = 'field-err-msg';
  msg.textContent = pesan;
  msg.style.cssText = 'font-size:11px;color:var(--red);margin-top:3px;';
  el.insertAdjacentElement('afterend', msg);
  el.focus();
}

/** Reset semua field error dalam container */
export function clearFieldErrors(containerSelector = 'body') {
  const container = document.querySelector(containerSelector) || document.body;
  container.querySelectorAll('.field-err-msg').forEach(e => e.remove());
  container.querySelectorAll('[style*="borderColor"]').forEach(el => {
    el.style.borderColor = '';
    el.style.boxShadow   = '';
  });
}

/** Reset error satu field saat user mulai mengetik */
export function bindClearOnInput(ids) {
  ids.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('input', () => {
      el.style.borderColor = '';
      el.style.boxShadow   = '';
      el.parentElement?.querySelector('.field-err-msg')?.remove();
    }, { once: false });
  });
}

// ── RULES ────────────────────────────────────────────────

/** Validasi form Tambah/Edit Produk
 * @returns {boolean} true jika valid
 */
export function validasiProduk() {
  clearFieldErrors('#modal-tambah-produk');
  const nama    = document.getElementById('prod-nama')?.value.trim();
  const kat     = document.getElementById('prod-cat')?.value;
  const hpp     = parseFloat(document.getElementById('prod-hpp')?.value);
  const harga   = parseFloat(document.getElementById('prod-harga')?.value);
  const stok    = parseInt(document.getElementById('prod-stok')?.value);
  const minstok = parseInt(document.getElementById('prod-minstok')?.value);
  let valid = true;

  if (!nama || nama.length < 2) {
    fieldError('prod-nama', 'Nama produk minimal 2 karakter');
    valid = false;
  } else if (nama.length > 100) {
    fieldError('prod-nama', 'Nama produk maksimal 100 karakter');
    valid = false;
  }
  if (!kat) {
    fieldError('prod-cat', 'Pilih kategori produk');
    valid = false;
  }
  if (!isNaN(hpp) && hpp < 0) {
    fieldError('prod-hpp', 'Harga modal tidak boleh negatif');
    valid = false;
  }
  if (isNaN(harga) || harga <= 0) {
    fieldError('prod-harga', 'Harga jual harus lebih dari 0');
    valid = false;
  } else if (harga > 999_999_999) {
    fieldError('prod-harga', 'Harga terlalu besar (maks Rp 999 juta)');
    valid = false;
  }
  if (!isNaN(hpp) && hpp > 0 && hpp >= harga) {
    fieldError('prod-hpp', 'Harga modal lebih besar dari harga jual → akan rugi');
    // warning saja, tidak block simpan
  }
  if (isNaN(stok) || stok < 0) {
    fieldError('prod-stok', 'Stok tidak boleh negatif');
    valid = false;
  } else if (stok > 999_999) {
    fieldError('prod-stok', 'Stok terlalu besar (maks 999.999)');
    valid = false;
  }
  if (!isNaN(minstok) && minstok < 0) {
    fieldError('prod-minstok', 'Minimum stok tidak boleh negatif');
    valid = false;
  }
  return valid;
}

/** Validasi form Tambah Jasa */
export function validasiJasa() {
  const nama  = document.getElementById('jasa-nama')?.value.trim();
  const harga = parseFloat(document.getElementById('jasa-harga')?.value);
  let valid   = true;

  // Clear error lama
  ['jasa-nama','jasa-harga'].forEach(id => {
    const el = document.getElementById(id);
    if (el) { el.style.borderColor = ''; el.style.boxShadow = ''; }
    el?.parentElement?.querySelector('.field-err-msg')?.remove();
  });

  if (!nama || nama.length < 2) {
    fieldError('jasa-nama', 'Nama jasa minimal 2 karakter');
    valid = false;
  } else if (nama.length > 80) {
    fieldError('jasa-nama', 'Nama jasa maksimal 80 karakter');
    valid = false;
  }
  if (isNaN(harga) || harga <= 0) {
    fieldError('jasa-harga', 'Harga jasa harus lebih dari 0');
    valid = false;
  } else if (harga > 999_999_999) {
    fieldError('jasa-harga', 'Harga terlalu besar');
    valid = false;
  }
  return valid;
}

/** Validasi form Restok */
export function validasiRestok() {
  const qty     = parseInt(document.getElementById('restok-qty')?.value);
  const hppBaru = parseFloat(document.getElementById('restok-hpp')?.value);
  let valid     = true;

  ['restok-qty','restok-hpp'].forEach(id => {
    const el = document.getElementById(id);
    if (el) { el.style.borderColor = ''; el.style.boxShadow = ''; }
    el?.parentElement?.querySelector('.field-err-msg')?.remove();
  });

  if (isNaN(qty) || qty <= 0) {
    fieldError('restok-qty', 'Jumlah masuk harus lebih dari 0');
    valid = false;
  } else if (qty > 99_999) {
    fieldError('restok-qty', 'Jumlah terlalu besar (maks 99.999)');
    valid = false;
  }
  if (!isNaN(hppBaru) && hppBaru < 0) {
    fieldError('restok-hpp', 'HPP tidak boleh negatif');
    valid = false;
  }
  return valid;
}

/** Validasi form Checkout */
export function validasiCheckout(paymentMethod, total) {
  const kasir = document.getElementById('kasir-name')?.value.trim();
  let valid   = true;

  if (kasir && kasir.length > 50) {
    fieldError('kasir-name', 'Nama kasir maksimal 50 karakter');
    valid = false;
  }
  if (paymentMethod === 'tunai') {
    const bayar = parseFloat(document.getElementById('uang-bayar')?.value);
    const el    = document.getElementById('uang-bayar');
    if (el) { el.style.borderColor = ''; el.style.boxShadow = ''; }
    el?.parentElement?.querySelector('.field-err-msg')?.remove();

    if (isNaN(bayar) || bayar <= 0) {
      fieldError('uang-bayar', 'Masukkan jumlah uang yang dibayar');
      valid = false;
    } else if (bayar < total) {
      fieldError('uang-bayar', `Kurang ${new Intl.NumberFormat('id-ID').format(total - bayar)}`);
      valid = false;
    } else if (bayar > total * 10) {
      fieldError('uang-bayar', 'Jumlah bayar terlalu besar, cek kembali');
      valid = false;
    }
  }
  return valid;
}

/** Validasi form Pengaturan */
export function validasiSettings() {
  const nama  = document.getElementById('set-nama')?.value.trim();
  const telp  = document.getElementById('set-telp')?.value.trim();
  const url   = document.getElementById('set-sheets-url')?.value.trim();
  let valid   = true;

  ['set-nama','set-telp','set-sheets-url'].forEach(id => {
    const el = document.getElementById(id);
    if (el) { el.style.borderColor = ''; el.style.boxShadow = ''; }
    el?.parentElement?.querySelector('.field-err-msg')?.remove();
  });

  if (nama && nama.length > 60) {
    fieldError('set-nama', 'Nama toko maksimal 60 karakter');
    valid = false;
  }
  if (telp && !/^[0-9\-\+\s()]{6,20}$/.test(telp)) {
    fieldError('set-telp', 'Format nomor telepon tidak valid');
    valid = false;
  }
  if (url && !url.startsWith('https://')) {
    fieldError('set-sheets-url', 'URL harus diawali https://');
    valid = false;
  }
  return valid;
}

/** Validasi Register */
export function validasiRegister() {
  const nama     = document.getElementById('reg-nama')?.value.trim();
  const email    = document.getElementById('reg-email')?.value.trim();
  const password = document.getElementById('reg-password')?.value;
  let valid      = true;

  ['reg-nama','reg-email','reg-password'].forEach(id => {
    const el = document.getElementById(id);
    if (el) { el.style.borderColor = ''; el.style.boxShadow = ''; }
  });

  if (!nama || nama.length < 2) {
    fieldError('reg-nama', 'Nama toko minimal 2 karakter');
    valid = false;
  }
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    fieldError('reg-email', 'Format email tidak valid');
    valid = false;
  }
  if (!password || password.length < 6) {
    fieldError('reg-password', 'Password minimal 6 karakter');
    valid = false;
  } else if (password.length > 128) {
    fieldError('reg-password', 'Password terlalu panjang');
    valid = false;
  }
  return valid;
}

/** Validasi Login */
export function validasiLogin() {
  const email    = document.getElementById('login-email')?.value.trim();
  const password = document.getElementById('login-password')?.value;
  let valid      = true;

  ['login-email','login-password'].forEach(id => {
    const el = document.getElementById(id);
    if (el) { el.style.borderColor = ''; el.style.boxShadow = ''; }
  });

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    fieldError('login-email', 'Format email tidak valid');
    valid = false;
  }
  if (!password || password.length < 1) {
    fieldError('login-password', 'Password wajib diisi');
    valid = false;
  }
  return valid;
}

/** Validasi Ganti PIN */
export function validasiGantiPIN() {
  const lama    = document.getElementById('pin-lama')?.value;
  const baru    = document.getElementById('pin-baru')?.value;
  const konfirm = document.getElementById('pin-konfirm')?.value;
  let valid     = true;

  ['pin-lama','pin-baru','pin-konfirm'].forEach(id => {
    const el = document.getElementById(id);
    if (el) { el.style.borderColor = ''; el.style.boxShadow = ''; }
    el?.parentElement?.querySelector('.field-err-msg')?.remove();
  });

  if (!lama || lama.length !== 4) {
    fieldError('pin-lama', 'Masukkan PIN lama (4 digit)');
    valid = false;
  }
  if (!baru || !/^\d{4}$/.test(baru)) {
    fieldError('pin-baru', 'PIN baru harus 4 digit angka');
    valid = false;
  } else if (baru === '1234') {
    fieldError('pin-baru', 'PIN tidak boleh 1234 (terlalu mudah)');
    valid = false;
  }
  if (baru && konfirm && baru !== konfirm) {
    fieldError('pin-konfirm', 'Konfirmasi PIN tidak cocok');
    valid = false;
  }
  return valid;
}
