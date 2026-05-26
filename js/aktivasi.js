// ============================================================
//  MotoKas — Sistem Aktivasi License
//  File: js/aktivasi.js
//  Cara kerja: kode aktivasi di-generate berbasis algoritma
//  HMAC-like sederhana (tanpa server) — cukup aman untuk PWA.
// ============================================================

// ── SECRET SALT (ganti sebelum deploy! jaga kerahasiaan ini) ─
const _SALT = 'SuksesBersamaMotokas#2026!';

// ── TIER ─────────────────────────────────────────────────────
const TIER = {
  STARTER : 'starter',   // gratis, maks 20 produk
  BASIC   : 'basic',     // bayar — produk unlimited, tanpa cloud
  PRO     : 'pro',       // bayar — semua fitur
};

// ── BATAS FITUR PER TIER ──────────────────────────────────────
const TIER_CONFIG = {
  starter : {
    label       : 'Starter',
    emoji       : '🆓',
    maxProduk   : 20,
    sheets      : false,
    cloudSync   : false,
    exportAll   : false,
    color       : '#5a5550',
  },
  basic : {
    label       : 'Basic',
    emoji       : '⭐',
    maxProduk   : Infinity,
    sheets      : false,
    cloudSync   : false,
    exportAll   : true,
    color       : '#f5c542',
  },
  pro : {
    label       : 'Pro',
    emoji       : '🚀',
    maxProduk   : Infinity,
    sheets      : true,
    cloudSync   : true,
    exportAll   : true,
    color       : '#4caf7d',
  },
};

// ── SIMPAN / BACA LICENSE ─────────────────────────────────────
function getLicense() {
  try { return JSON.parse(localStorage.getItem('mk_license')) || { tier: TIER.STARTER, kode: null, aktifSejak: null }; }
  catch { return { tier: TIER.STARTER, kode: null, aktifSejak: null }; }
}
function setLicense(obj) {
  localStorage.setItem('mk_license', JSON.stringify(obj));
}

// ── GENERATOR HASH (djb2 sederhana) ──────────────────────────
function _hash(str) {
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = ((h << 5) + h) ^ str.charCodeAt(i);
  return (h >>> 0).toString(16).toUpperCase().padStart(8, '0');
}

// ── FORMAT KODE: TIER-XXXX-XXXX ──────────────────────────────
// Kode digenerate dari: hash(TIER + EMAIL + SALT)
// Anda generate manual via panel admin di bawah (fungsi generateKode)
function generateKode(tier, email) {
  const raw   = (tier + '|' + email.toLowerCase().trim() + '|' + _SALT);
  const h     = _hash(raw);
  const part1 = h.slice(0, 4);
  const part2 = h.slice(4, 8);
  const prefix = tier === TIER.PRO ? 'PRO' : 'BSC';
  return `${prefix}-${part1}-${part2}`;
}

// ── VALIDASI KODE ─────────────────────────────────────────────
// Kode valid jika cocok dengan email user yang sedang login
function validateKode(kode, email) {
  kode = kode.trim().toUpperCase();
  // Cek prefix untuk deteksi tier
  let tier = null;
  if (kode.startsWith('PRO-')) tier = TIER.PRO;
  else if (kode.startsWith('BSC-')) tier = TIER.BASIC;
  else return { valid: false, tier: null, msg: 'Format kode salah (harus PRO-XXXX-XXXX atau BSC-XXXX-XXXX)' };

  const expected = generateKode(tier, email);
  if (kode === expected) {
    return { valid: true, tier, msg: 'Kode valid ✓' };
  }
  return { valid: false, tier: null, msg: 'Kode tidak valid atau bukan milik akun ini' };
}

// ── GETTER TIER AKTIF ─────────────────────────────────────────
function getTier() {
  return getLicense().tier || TIER.STARTER;
}
function getTierConfig() {
  return TIER_CONFIG[getTier()] || TIER_CONFIG.starter;
}
function isPro()   { return getTier() === TIER.PRO; }
function isBasic() { return getTier() === TIER.BASIC || isPro(); }

// ── CEK BATAS PRODUK ──────────────────────────────────────────
function canAddProduk() {
  const cfg   = getTierConfig();
  const jumlah = (getData('produk', [])).length;
  return jumlah < cfg.maxProduk;
}

// ── CEK AKSES FITUR ──────────────────────────────────────────
function canUseSheets()    { return getTierConfig().sheets; }
function canUseCloudSync() { return getTierConfig().cloudSync; }
function canExportAll()    { return getTierConfig().exportAll; }

// ── AKTIVASI KODE ─────────────────────────────────────────────
function aktivasiKode(kode) {
  const email = (window.FB && window.FB.email) ? window.FB.email : '';
  if (!email) {
    toast('Login dulu untuk aktivasi', 'error');
    return false;
  }
  const result = validateKode(kode, email);
  if (!result.valid) {
    toast(result.msg, 'error');
    return false;
  }
  setLicense({ tier: result.tier, kode: kode.trim().toUpperCase(), aktifSejak: new Date().toISOString() });
  toast(`Aktivasi ${result.tier.toUpperCase()} berhasil! 🎉`, 'success');
  renderBadgeTier();
  closeModal('modal-aktivasi');
  return true;
}

// ── RENDER BADGE TIER DI HEADER ───────────────────────────────
function renderBadgeTier() {
  const cfg = getTierConfig();
  const existing = document.getElementById('tier-badge');
  if (existing) existing.remove();

  const badge = document.createElement('span');
  badge.id = 'tier-badge';
  badge.textContent = cfg.emoji + ' ' + cfg.label;
  badge.style.cssText = `
    font-size:10px;font-weight:700;letter-spacing:.5px;
    padding:2px 8px;border-radius:20px;cursor:pointer;
    background:${cfg.color}22;color:${cfg.color};
    border:1px solid ${cfg.color}55;margin-left:6px;
  `;
  badge.title = 'Klik untuk kelola lisensi';
  badge.onclick = () => openModalAktivasi();

  const sub = document.getElementById('hdr-sub');
  if (sub) sub.appendChild(badge);
}

// ── INJECT MODAL AKTIVASI KE DOM ──────────────────────────────
function injectModalAktivasi() {
  if (document.getElementById('modal-aktivasi')) return;

  const html = `
  <div class="modal-overlay" id="modal-aktivasi">
    <div class="modal-sheet">
      <div class="modal-handle"></div>
      <div class="modal-title">🔑 Lisensi MotoKas</div>

      <!-- Status lisensi aktif -->
      <div id="aktivasi-status-card" style="
        border-radius:12px;padding:14px 16px;margin-bottom:16px;
        background:var(--card);border:1px solid var(--border);
      ">
        <div style="display:flex;align-items:center;gap:10px">
          <div id="akt-tier-emoji" style="font-size:28px"></div>
          <div>
            <div id="akt-tier-label" style="font-weight:700;font-size:15px"></div>
            <div id="akt-tier-desc"  style="font-size:12px;color:var(--text3);margin-top:2px"></div>
          </div>
        </div>
        <div id="akt-fitur-list" style="margin-top:12px;display:flex;flex-direction:column;gap:6px;font-size:12px"></div>
      </div>

      <!-- Input kode aktivasi -->
      <div id="aktivasi-form-section">
        <div class="modal-label" style="margin-bottom:6px">Masukkan Kode Aktivasi</div>
        <input class="modal-input" id="input-kode-aktivasi"
          placeholder="Contoh: PRO-A1B2-C3D4"
          style="font-family:monospace;letter-spacing:2px;text-transform:uppercase"
          oninput="this.value=this.value.toUpperCase()">
        <div style="font-size:11px;color:var(--text3);margin-top:6px">
          Beli lisensi via WhatsApp → kode dikirim ke Anda
        </div>
        <button class="btn-primary" style="width:100%;margin-top:12px" onclick="doAktivasi()">
          ✔ Aktifkan Lisensi
        </button>
        <button class="btn-secondary" style="width:100%;margin-top:8px" onclick="beliLisensi()">
          💬 Beli via WhatsApp
        </button>
      </div>

      <!-- Tombol reset (jika sudah aktif) -->
      <div id="aktivasi-reset-section" style="display:none;margin-top:12px">
        <button class="btn-danger" style="width:100%" onclick="resetLisensi()">
          🗑 Hapus Lisensi (kembali ke Starter)
        </button>
      </div>

      <button class="btn-secondary" style="width:100%;margin-top:10px" onclick="closeModal('modal-aktivasi')">
        Tutup
      </button>
    </div>
  </div>`;

  document.body.insertAdjacentHTML('beforeend', html);

  // Klik di luar modal = tutup
  document.getElementById('modal-aktivasi').addEventListener('click', e => {
    if (e.target.id === 'modal-aktivasi') closeModal('modal-aktivasi');
  });
}

// ── BUKA MODAL AKTIVASI ───────────────────────────────────────
function openModalAktivasi() {
  injectModalAktivasi();
  const lic = getLicense();
  const cfg = getTierConfig();

  document.getElementById('akt-tier-emoji').textContent = cfg.emoji;
  document.getElementById('akt-tier-label').textContent = 'Paket ' + cfg.label;

  const since = lic.aktifSejak ? new Date(lic.aktifSejak).toLocaleDateString('id-ID') : '-';
  document.getElementById('akt-tier-desc').textContent  =
    lic.tier === TIER.STARTER ? 'Gratis · Maks 20 produk' : `Aktif sejak ${since}`;

  // Daftar fitur
  const fiturList = [
    { label: `Produk (maks ${cfg.maxProduk === Infinity ? '∞' : cfg.maxProduk})`, ok: true },
    { label: 'Export CSV / TXT',  ok: cfg.exportAll },
    { label: 'Google Sheets',     ok: cfg.sheets },
    { label: 'Cloud Sync',        ok: cfg.cloudSync },
  ];
  document.getElementById('akt-fitur-list').innerHTML = fiturList.map(f => `
    <div style="display:flex;align-items:center;gap:8px">
      <span style="color:${f.ok ? 'var(--green)' : '#5a5550'}">${f.ok ? '✓' : '✗'}</span>
      <span style="color:${f.ok ? 'var(--text1)' : 'var(--text3)'}">${f.label}</span>
    </div>`).join('');

  // Tampilkan / sembunyikan reset
  document.getElementById('aktivasi-reset-section').style.display =
    lic.tier !== TIER.STARTER ? 'block' : 'none';

  openModal('modal-aktivasi');
}

function doAktivasi() {
  const kode = document.getElementById('input-kode-aktivasi').value;
  if (!kode) { toast('Masukkan kode aktivasi', 'error'); return; }
  if (aktivasiKode(kode)) {
    // Refresh modal konten
    setTimeout(openModalAktivasi, 300);
  }
}

function resetLisensi() {
  if (!confirm('Yakin ingin menghapus lisensi? Fitur Pro/Basic akan dinonaktifkan.')) return;
  setLicense({ tier: TIER.STARTER, kode: null, aktifSejak: null });
  renderBadgeTier();
  toast('Lisensi dihapus, kembali ke Starter');
  openModalAktivasi();
}

function beliLisensi() {
  const email = (window.FB && window.FB.email) ? window.FB.email : 'email-anda';
  const wa = `https://wa.me/6281234567890?text=Halo%2C%20saya%20mau%20beli%20lisensi%20MotoKas.%0AEmail%3A%20${encodeURIComponent(email)}`;
  window.open(wa, '_blank');
}

// ── POPUP UPGRADE ─────────────────────────────────────────────
function showUpgradePopup(fitur = '') {
  const pesan = {
    produk    : '💡 Paket Starter hanya mendukung hingga 20 produk.',
    sheets    : '📊 Google Sheets hanya tersedia di paket Pro.',
    cloudSync : '☁️ Cloud Sync hanya tersedia di paket Pro.',
    export    : '📤 Export lengkap tersedia di paket Basic & Pro.',
  };
  const msg = pesan[fitur] || '🔒 Fitur ini memerlukan upgrade paket.';

  Swal.fire({
    title       : 'Upgrade Diperlukan',
    html        : `<p style="color:#aaa;font-size:14px">${msg}</p>
                   <p style="color:#aaa;font-size:13px;margin-top:8px">
                   Beli kode aktivasi via WhatsApp dan unlock semua fitur!</p>`,
    icon        : 'warning',
    background  : '#1a1a1a',
    color       : '#f0ece6',
    confirmButtonColor : '#f5c542',
    confirmButtonText  : '💬 Beli Sekarang',
    showCancelButton   : true,
    cancelButtonText   : 'Nanti',
    cancelButtonColor  : '#333',
  }).then(r => { if (r.isConfirmed) beliLisensi(); });
}

// ── GUARD FUNCTIONS (dipanggil dari app.js) ───────────────────

// Guard tambah produk
const _oriSimpanProduk = window.simpanProdukOri || null;
function guardSimpanProduk() {
  const editId = parseInt(document.getElementById('edit-produk-id').value) || 0;
  if (!editId && !canAddProduk()) {
    closeModal('modal-tambah-produk');
    showUpgradePopup('produk');
    return;
  }
  simpanProdukOri();
}

// Guard Sheets
function guardKirimSheets(trxData) {
  if (!canUseSheets()) { showUpgradePopup('sheets'); return; }
  kirimSheetsOri(trxData);
}
function guardTesSheets() {
  if (!canUseSheets()) { showUpgradePopup('sheets'); return; }
  tesSheetsOri();
}

// Guard Export
function guardExportCSV() {
  if (!canExportAll()) { showUpgradePopup('export'); return; }
  exportCSVOri();
}
function guardExportTXT() {
  if (!canExportAll()) { showUpgradePopup('export'); return; }
  exportTXTOri();
}

// ── PATCH APP.JS FUNCTIONS ────────────────────────────────────
// Rename fungsi asli, lalu ganti dengan guard.
// Dipanggil sekali setelah app.js selesai load.
function patchAppFunctions() {
  // Tambah produk
  if (typeof simpanProduk === 'function') {
    window.simpanProdukOri = simpanProduk;
    window.simpanProduk    = guardSimpanProduk;
  }
  // Kirim Sheets
  if (typeof kirimSheets === 'function') {
    window.kirimSheetsOri = kirimSheets;
    window.kirimSheets    = guardKirimSheets;
  }
  // Tes koneksi Sheets
  if (typeof tesSheets === 'function') {
    window.tesSheetsOri = tesSheets;
    window.tesSheets    = guardTesSheets;
  }
  // Export
  if (typeof exportCSV === 'function') {
    window.exportCSVOri = exportCSV;
    window.exportCSV    = guardExportCSV;
  }
  if (typeof exportTXT === 'function') {
    window.exportTXTOri = exportTXT;
    window.exportTXT    = guardExportTXT;
  }
}

// ── INJECT TOMBOL AKTIVASI DI SETTINGS ───────────────────────
function injectAktivasiSettings() {
  const settingsPage = document.getElementById('page-settings');
  if (!settingsPage || document.getElementById('section-aktivasi')) return;

  const section = document.createElement('div');
  section.id = 'section-aktivasi';
  section.innerHTML = `
    <div class="section-title">🔑 Lisensi & Aktivasi</div>
    <div class="settings-section">
      <div class="settings-toggle-row">
        <div class="toggle-info">
          <div class="toggle-title" id="akt-settings-label">Paket Starter</div>
          <div class="toggle-desc" id="akt-settings-desc">Gratis · Maks 20 produk</div>
        </div>
        <button class="btn-primary" onclick="openModalAktivasi()">Kelola</button>
      </div>
    </div>`;

  // Sisipkan sebelum "Zona Berbahaya"
  const danger = settingsPage.querySelector('.section-title:last-of-type');
  if (danger) {
    const dangerSection = danger.nextElementSibling;
    settingsPage.insertBefore(section, danger);
  } else {
    settingsPage.appendChild(section);
  }
  updateAktivasiSettingsLabel();
}

function updateAktivasiSettingsLabel() {
  const cfg = getTierConfig();
  const el1 = document.getElementById('akt-settings-label');
  const el2 = document.getElementById('akt-settings-desc');
  if (el1) el1.textContent = `${cfg.emoji} Paket ${cfg.label}`;
  if (el2) {
    const lic = getLicense();
    el2.textContent = lic.tier === TIER.STARTER
      ? 'Gratis · Maks 20 produk'
      : `Aktif sejak ${new Date(lic.aktifSejak).toLocaleDateString('id-ID')}`;
  }
}

// ── CLOUD SYNC GUARD ─────────────────────────────────────────
// Dipanggil dari firebase.js sebelum sync
window.canUseCloudSync = canUseCloudSync;

// ── INJECT TOMBOL CLOUD DI HEADER (dipanggil dari initApp) ───
window.injectCloudButton = function() {
  if (document.getElementById('btn-cloud')) return;
  const btn = document.createElement('button');
  btn.id = 'btn-cloud';
  btn.className = 'icon-btn';
  btn.title = 'Cloud Sync';
  btn.textContent = '☁️';
  btn.onclick = () => {
    if (!canUseCloudSync()) { showUpgradePopup('cloudSync'); return; }
    toast('Cloud sync aktif ✓');
  };
  const actions = document.querySelector('.header-actions');
  if (actions) actions.insertBefore(btn, actions.firstChild);
};

// ── INIT ──────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  // Patch dilakukan setelah semua script selesai
  setTimeout(() => {
    patchAppFunctions();
    renderBadgeTier();
    injectAktivasiSettings();
  }, 100);
});

// ============================================================
//  PANEL ADMIN — GENERATOR KODE (untuk Anda sebagai pemilik)
//  Buka konsol browser → ketik: generateKodeAdmin('pro','user@email.com')
// ============================================================
window.generateKodeAdmin = function(tier, email) {
  if (!['basic','pro'].includes(tier)) { console.error('tier harus "basic" atau "pro"'); return; }
  const kode = generateKode(tier, email);
  console.log(`%c🔑 Kode Aktivasi MotoKas`, 'font-size:16px;font-weight:bold;color:#f5c542');
  console.log(`%cTier  : ${tier.toUpperCase()}`, 'color:#4caf7d');
  console.log(`%cEmail : ${email}`, 'color:#aaa');
  console.log(`%cKode  : ${kode}`, 'font-size:18px;font-weight:bold;color:#f5c542;letter-spacing:2px');
  return kode;
};
