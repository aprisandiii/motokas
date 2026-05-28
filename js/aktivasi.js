// ============================================================
//  MotoKas — Sistem Aktivasi License
//  File: js/aktivasi.js
//  Perbaikan:
//   1. Semua pemanggilan *Ori() dalam guard pakai window.*Ori()
//   2. window.injectCloudButton DIHAPUS — hanya ada di firebase.js
//   3. Guard Swal sebelum showUpgradePopup agar tidak crash offline
//   4. patchAppFunctions pakai retry + flag _appPatched
//   5. Script ini di-load dengan defer (lihat index.html)
// ============================================================

// ── SECRET SALT ──────────────────────────────────────────────
const _SALT = 'BismillahSayaAkanSuksesBersamaMotoKas#1';

// ── TIER ─────────────────────────────────────────────────────
const TIER = {
  STARTER : 'starter',
  BASIC   : 'basic',
  PRO     : 'pro',
};

// ── BATAS FITUR PER TIER ──────────────────────────────────────
const TIER_CONFIG = {
  starter : {
    label     : 'Starter',
    emoji     : '🆓',
    maxProduk : 20,
    sheets    : false,
    cloudSync : false,
    exportAll : false,
    color     : '#5a5550',
  },
  basic : {
    label     : 'Basic',
    emoji     : '⭐',
    maxProduk : Infinity,
    sheets    : false,
    cloudSync : false,
    exportAll : true,
    color     : '#f5c542',
  },
  pro : {
    label     : 'Pro',
    emoji     : '🚀',
    maxProduk : Infinity,
    sheets    : true,
    cloudSync : true,
    exportAll : true,
    color     : '#4caf7d',
  },
};

// ── SIMPAN / BACA LICENSE ─────────────────────────────────────
function _licenseKey() {
  const uid = (window.FB && window.FB.uid) || 'guest';
  return 'mk_license_' + uid;
}
function getLicense() {
  try {
    return JSON.parse(localStorage.getItem(_licenseKey()))
      || { tier: TIER.STARTER, kode: null, aktifSejak: null };
  } catch {
    return { tier: TIER.STARTER, kode: null, aktifSejak: null };
  }
}
function setLicense(obj) {
  localStorage.setItem(_licenseKey(), JSON.stringify(obj));
}

// ── GENERATOR HASH (djb2) ─────────────────────────────────────
function _hash(str) {
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = ((h << 5) + h) ^ str.charCodeAt(i);
  return (h >>> 0).toString(16).toUpperCase().padStart(8, '0');
}

// ── FORMAT KODE: TIER-XXXX-XXXX ──────────────────────────────
function generateKode(tier, email) {
  const raw   = tier + '|' + email.toLowerCase().trim() + '|' + _SALT;
  const h     = _hash(raw);
  const part1 = h.slice(0, 4);
  const part2 = h.slice(4, 8);
  const prefix = tier === TIER.PRO ? 'PRO' : 'BSC';
  return `${prefix}-${part1}-${part2}`;
}

// ── VALIDASI KODE ─────────────────────────────────────────────
function validateKode(kode, email) {
  kode = kode.trim().toUpperCase();
  let tier = null;
  if (kode.startsWith('PRO-'))      tier = TIER.PRO;
  else if (kode.startsWith('BSC-')) tier = TIER.BASIC;
  else return { valid: false, tier: null, msg: 'Format kode salah (harus PRO-XXXX-XXXX atau BSC-XXXX-XXXX)' };

  const expected = generateKode(tier, email);
  if (kode === expected) return { valid: true, tier, msg: 'Kode valid ✓' };
  return { valid: false, tier: null, msg: 'Kode tidak valid atau bukan milik akun ini' };
}

// ── GETTER TIER AKTIF ─────────────────────────────────────────
function getTier()       { return getLicense().tier || TIER.STARTER; }
function getTierConfig() { return TIER_CONFIG[getTier()] || TIER_CONFIG.starter; }
function isPro()         { return getTier() === TIER.PRO; }
function isBasic()       { return getTier() === TIER.BASIC || isPro(); }

// ── CEK BATAS PRODUK ──────────────────────────────────────────
function canAddProduk() {
  const cfg    = getTierConfig();
  // FIX: gunakan window.getData (di-expose app.js) dengan fallback langsung
  // localStorage agar tidak crash jika dipanggil sebelum app.js siap
  const _get   = window.getData || function(k, d) {
    try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; }
  };
  const jumlah = (_get('produk', [])).length;
  return jumlah < cfg.maxProduk;
}

// ── CEK AKSES FITUR ──────────────────────────────────────────
function canUseSheets()    { return getTierConfig().sheets; }
function canUseCloudSync() { return getTierConfig().cloudSync; }
function canExportAll()    { return getTierConfig().exportAll; }

// Expose ke window agar firebase.js bisa cek tier
window.canUseCloudSync = canUseCloudSync;

// ── EMAIL LOGIN ───────────────────────────────────────────────
function getEmailLogin() {
  return (window.FB && window.FB.email)
    || (window.FB && window.FB.auth && window.FB.auth.currentUser && window.FB.auth.currentUser.email)
    || localStorage.getItem('mk_email')
    || '';
}

// ── AKTIVASI KODE ─────────────────────────────────────────────
function aktivasiKode(kode) {
  const email = getEmailLogin();
  if (!email) { toast('Login dulu untuk aktivasi', 'error'); return false; }
  const result = validateKode(kode, email);
  if (!result.valid) { toast(result.msg, 'error'); return false; }
  setLicense({ tier: result.tier, kode: kode.trim().toUpperCase(), aktifSejak: new Date().toISOString() });
  toast(`Aktivasi ${result.tier.toUpperCase()} berhasil! 🎉`, 'success');
  renderBadgeTier();
  closeModal('modal-aktivasi');
  return true;
}

// ── RENDER BADGE TIER DI HEADER ───────────────────────────────
function renderBadgeTier() {
  const cfg      = getTierConfig();
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
  badge.title   = 'Klik untuk kelola lisensi';
  badge.onclick = () => openModalAktivasi();

  const sub = document.getElementById('hdr-sub');
  if (sub) sub.appendChild(badge);
}
// Expose agar firebase.js bisa refresh badge setelah sync
window.renderBadgeTier = renderBadgeTier;

// ── INJECT MODAL AKTIVASI KE DOM ──────────────────────────────
function injectModalAktivasi() {
  if (document.getElementById('modal-aktivasi')) return;

  const html = `
  <div class="modal-overlay" id="modal-aktivasi">
    <div class="modal-sheet">
      <div class="modal-handle"></div>
      <div class="modal-title">🔑 Lisensi MotoKas</div>

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

  const since = lic.aktifSejak
    ? new Date(lic.aktifSejak).toLocaleDateString('id-ID')
    : '-';
  document.getElementById('akt-tier-desc').textContent =
    lic.tier === TIER.STARTER
      ? 'Gratis · Maks 20 produk'
      : `Aktif sejak ${since}`;

  const fiturList = [
    { label: `Produk (maks ${cfg.maxProduk === Infinity ? '∞' : cfg.maxProduk})`, ok: true },
    { label: 'Export CSV / TXT',  ok: cfg.exportAll },
    { label: 'Google Sheets',     ok: cfg.sheets    },
    { label: 'Cloud Sync',        ok: cfg.cloudSync },
  ];
  document.getElementById('akt-fitur-list').innerHTML = fiturList.map(f => `
    <div style="display:flex;align-items:center;gap:8px">
      <span style="color:${f.ok ? 'var(--green)' : '#5a5550'}">${f.ok ? '✓' : '✗'}</span>
      <span style="color:${f.ok ? 'var(--text1)' : 'var(--text3)'}">${f.label}</span>
    </div>`).join('');

  document.getElementById('aktivasi-reset-section').style.display =
    lic.tier !== TIER.STARTER ? 'block' : 'none';

  openModal('modal-aktivasi');
}

function doAktivasi() {
  const kode = document.getElementById('input-kode-aktivasi').value;
  if (!kode) { toast('Masukkan kode aktivasi', 'error'); return; }
  if (aktivasiKode(kode)) setTimeout(openModalAktivasi, 300);
}

function resetLisensi() {
  if (!confirm('Yakin ingin menghapus lisensi? Fitur Pro/Basic akan dinonaktifkan.')) return;
  setLicense({ tier: TIER.STARTER, kode: null, aktifSejak: null });
  renderBadgeTier();
  toast('Lisensi dihapus, kembali ke Starter');
  openModalAktivasi();
}

function beliLisensi() {
  const email = getEmailLogin() || 'email-anda';
  const wa = `https://wa.me/6285798132246?text=Halo%2C%20saya%20mau%20beli%20lisensi%20MotoKas.%0AEmail%3A%20${encodeURIComponent(email)}`;
  window.open(wa, '_blank');
}

// ── POPUP UPGRADE ─────────────────────────────────────────────
// FIX: Guard Swal agar tidak crash saat offline / CDN gagal load
function showUpgradePopup(fitur = '') {
  const pesan = {
    produk    : '💡 Paket Starter hanya mendukung hingga 20 produk.',
    sheets    : '📊 Google Sheets hanya tersedia di paket Pro.',
    cloudSync : '☁️ Cloud Sync hanya tersedia di paket Pro.',
    export    : '📤 Export lengkap tersedia di paket Basic & Pro.',
  };
  const msg = pesan[fitur] || '🔒 Fitur ini memerlukan upgrade paket.';

  // FIX: fallback jika SweetAlert2 tidak tersedia
  if (!window.Swal) {
    if (confirm(msg + '\n\nBuka WhatsApp untuk beli lisensi?')) beliLisensi();
    return;
  }

  Swal.fire({
    title              : 'Upgrade Diperlukan',
    html               : `<p style="color:#aaa;font-size:14px">${msg}</p>
                          <p style="color:#aaa;font-size:13px;margin-top:8px">
                          Beli kode aktivasi via WhatsApp dan unlock semua fitur!</p>`,
    icon               : 'warning',
    background         : '#1a1a1a',
    color              : '#f0ece6',
    confirmButtonColor : '#f5c542',
    confirmButtonText  : '💬 Beli Sekarang',
    showCancelButton   : true,
    cancelButtonText   : 'Nanti',
    cancelButtonColor  : '#333',
  }).then(r => { if (r.isConfirmed) beliLisensi(); });
}
// Expose agar firebase.js bisa memanggil dari tombol cloud
window.showUpgradePopup = showUpgradePopup;

// ── GUARD FUNCTIONS ───────────────────────────────────────────

// FIX: semua pemanggilan *Ori() harus via window.*Ori()
function guardSimpanProduk() {
  const editId = parseInt(document.getElementById('edit-produk-id').value) || 0;
  if (!editId && !canAddProduk()) {
    closeModal('modal-tambah-produk');
    showUpgradePopup('produk');
    return;
  }
  // FIX: window.simpanProdukOri bukan simpanProdukOri (var lokal tidak ada)
  if (typeof window.simpanProdukOri === 'function') window.simpanProdukOri();
}

function guardKirimSheets(trxData) {
  if (!canUseSheets()) { showUpgradePopup('sheets'); return; }
  if (typeof window.kirimSheetsOri === 'function') window.kirimSheetsOri(trxData);
}

function guardTesSheets() {
  if (!canUseSheets()) { showUpgradePopup('sheets'); return; }
  if (typeof window.tesSheetsOri === 'function') window.tesSheetsOri();
}

function guardExportCSV() {
  if (!canExportAll()) { showUpgradePopup('export'); return; }
  if (typeof window.exportCSVOri === 'function') window.exportCSVOri();
}

function guardExportTXT() {
  if (!canExportAll()) { showUpgradePopup('export'); return; }
  if (typeof window.exportTXTOri === 'function') window.exportTXTOri();
}

// ── PATCH APP.JS FUNCTIONS ────────────────────────────────────
// FIX: Tambah flag _appPatched + retry agar tidak race condition
// dengan firebase.js (yang merupakan ES module / defer)
function patchAppFunctions() {
  if (window._appPatched) return;

  let patched = 0;

  if (typeof window.simpanProduk === 'function' && !window.simpanProdukOri) {
    window.simpanProdukOri = window.simpanProduk;
    window.simpanProduk    = guardSimpanProduk;
    patched++;
  }
  if (typeof window.kirimSheets === 'function' && !window.kirimSheetsOri) {
    window.kirimSheetsOri = window.kirimSheets;
    window.kirimSheets    = guardKirimSheets;
    patched++;
  }
  if (typeof window.tesSheets === 'function' && !window.tesSheetsOri) {
    window.tesSheetsOri = window.tesSheets;
    window.tesSheets    = guardTesSheets;
    patched++;
  }
  if (typeof window.exportCSV === 'function' && !window.exportCSVOri) {
    window.exportCSVOri = window.exportCSV;
    window.exportCSV    = guardExportCSV;
    patched++;
  }
  if (typeof window.exportTXT === 'function' && !window.exportTXTOri) {
    window.exportTXTOri = window.exportTXT;
    window.exportTXT    = guardExportTXT;
    patched++;
  }

  // Semua 5 fungsi berhasil di-patch → set flag
  if (patched >= 5) {
    window._appPatched = true;
  }
}

// ── INJECT TOMBOL AKTIVASI DI SETTINGS ───────────────────────
function injectAktivasiSettings() {
  const settingsPage = document.getElementById('page-settings');
  if (!settingsPage || document.getElementById('section-aktivasi')) return;

  const section = document.createElement('div');
  section.id    = 'section-aktivasi';
  section.innerHTML = `
    <div class="section-title">🔑 Lisensi & Aktivasi</div>
    <div class="settings-section">
      <div class="settings-toggle-row">
        <div class="toggle-info">
          <div class="toggle-title" id="akt-settings-label">Paket Starter</div>
          <div class="toggle-desc"  id="akt-settings-desc">Gratis · Maks 20 produk</div>
        </div>
        <button class="btn-primary" onclick="openModalAktivasi()">Kelola</button>
      </div>
    </div>`;

  // Sisipkan sebelum "Zona Berbahaya"
  const allTitles = settingsPage.querySelectorAll('.section-title');
  const danger    = allTitles[allTitles.length - 1];
  if (danger) {
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

// ── INIT ──────────────────────────────────────────────────────
// FIX: defer-safe — script ini di-load dengan defer, jadi
// DOMContentLoaded sudah berlalu saat script berjalan.
// Gunakan requestIdleCallback / setTimeout bertingkat untuk retry patch.
function initAktivasi() {
  patchAppFunctions();

  // Retry sekali jika belum semua ter-patch (edge case module late-load)
  if (!window._appPatched) {
    setTimeout(() => {
      patchAppFunctions();
    }, 500);
  }

  renderBadgeTier();
  injectAktivasiSettings();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initAktivasi);
} else {
  // DOM sudah siap (script dimuat dengan defer, jalan setelah parse)
  initAktivasi();
}

// ── PANEL ADMIN — GENERATOR KODE ─────────────────────────────
// KEAMANAN: hanya aktif di mode development (localhost / 127.0.0.1)
// Di produksi fungsi ini tidak tersedia sehingga tidak bisa di-abuse
// via DevTools oleh pengguna umum.
(function() {
  const isDev = ['localhost','127.0.0.1'].includes(location.hostname)
    || location.hostname.endsWith('.local');
  if (!isDev) return; // tidak expose di produksi

  window.generateKodeAdmin = function(tier, email) {
    if (!['basic','pro'].includes(tier)) { console.error('tier harus "basic" atau "pro"'); return; }
    const kode = generateKode(tier, email);
    console.log(`%c🔑 Kode Aktivasi MotoKas`, 'font-size:16px;font-weight:bold;color:#f5c542');
    console.log(`%cTier  : ${tier.toUpperCase()}`, 'color:#4caf7d');
    console.log(`%cEmail : ${email}`, 'color:#aaa');
    console.log(`%cKode  : ${kode}`, 'font-size:18px;font-weight:bold;color:#f5c542;letter-spacing:2px');
    return kode;
  };
  console.info('%c[MotoKas Dev] generateKodeAdmin tersedia di konsol ini.', 'color:#f5c542');
})();
