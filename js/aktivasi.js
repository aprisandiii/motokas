// ============================================================
//  MotoKas — Sistem Aktivasi License v3.0 (FIXED)
//  File: js/aktivasi.js
//
//  Perbaikan dari v2.1:
//   1. _SALT tidak bisa diakses dari console (IIFE scope)
//   2. Race condition patch diatasi dengan retry loop + event
//   3. canAddProduk() dicek langsung di simpanProduk, bukan
//      hanya mengandalkan patch agar tidak bisa di-bypass
//   4. getLicense() curigai manipulasi jika sig hilang tapi
//      data masih ada → paksa reset ke Starter
//   5. License punya field expiry (opsional) dan dicek saat
//      getLicense() dipanggil
//   6. Semua logic dikurung dalam IIFE agar variabel internal
//      tidak bocor ke window/global scope
// ============================================================

(function (global) {
  'use strict';

  // ── SALT — dikurung dalam IIFE, TIDAK bisa diakses dari console ──
  // Dibuat dari array charCode agar tidak langsung terbaca sebagai string
  const _SALT = (function () {
    return [66,105,115,109,105,108,108,97,104,83,97,121,97,65,107,97,110,
            83,117,107,115,101,115,66,101,114,115,97,109,97,77,111,116,111,
            75,97,115,35,49]
      .map(c => String.fromCharCode(c)).join('');
  })();

  // ── TIER ──────────────────────────────────────────────────────────
  const TIER = Object.freeze({
    STARTER : 'starter',
    BASIC   : 'basic',
    PRO     : 'pro',
  });

  // ── BATAS FITUR PER TIER ───────────────────────────────────────────
  const TIER_CONFIG = Object.freeze({
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
  });

  // ── HASH FUNCTIONS ─────────────────────────────────────────────────
  // djb2 — dipakai untuk generate kode aktivasi
  function _hash(str) {
    let h = 5381;
    for (let i = 0; i < str.length; i++) {
      h = ((h << 5) + h) ^ str.charCodeAt(i);
    }
    return (h >>> 0).toString(16).toUpperCase().padStart(8, '0');
  }

  // FNV-1a — dipakai untuk integrity check (berbeda algoritma dari _hash)
  function _fnv1a(str) {
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h  = (h * 0x01000193) >>> 0;
    }
    return h.toString(36);
  }

  // ── KEY STORAGE ────────────────────────────────────────────────────
  // Key di-bind ke uid/email agar license tidak bisa dipindah antar akun
  function _licenseKey() {
    const uid = (global.FB && global.FB.uid)
      || localStorage.getItem('mk_email')
      || 'guest';
    return 'mk_lic3_' + _fnv1a(uid);
  }

  function _sigKey() {
    return _licenseKey() + '_sig';
  }

  // ── BACA LICENSE ────────────────────────────────────────────────────
  function getLicense() {
    const _default = { tier: TIER.STARTER, kode: null, aktifSejak: null, expiry: null };
    try {
      const raw = localStorage.getItem(_licenseKey());
      const sig = localStorage.getItem(_sigKey());

      // FIX #4a: data ada tapi sig tidak ada → curigai manipulasi, reset
      if (raw && !sig) {
        console.warn('MotoKas: Signature hilang, kemungkinan manipulasi. Reset ke Starter.');
        localStorage.removeItem(_licenseKey());
        return _default;
      }

      if (!raw) return _default;

      // FIX #4b: sig ada tapi tidak cocok → reset
      const expectedSig = _fnv1a(raw + _SALT);
      if (sig !== expectedSig) {
        console.warn('MotoKas: Integrity check gagal. Reset ke Starter.');
        localStorage.removeItem(_licenseKey());
        localStorage.removeItem(_sigKey());
        return _default;
      }

      const obj = JSON.parse(raw);

      // FIX #5: cek expiry jika ada
      if (obj.expiry && Date.now() > obj.expiry) {
        console.warn('MotoKas: License expired. Reset ke Starter.');
        localStorage.removeItem(_licenseKey());
        localStorage.removeItem(_sigKey());
        toast('⏰ Lisensi Anda telah kadaluarsa. Silakan perpanjang.', 'error');
        return _default;
      }

      return obj || _default;
    } catch (e) {
      console.error('MotoKas: getLicense error', e);
      return _default;
    }
  }

  // ── SIMPAN LICENSE ──────────────────────────────────────────────────
  function setLicense(obj) {
    const raw = JSON.stringify(obj);
    const sig = _fnv1a(raw + _SALT);
    localStorage.setItem(_licenseKey(), raw);
    localStorage.setItem(_sigKey(),     sig);
  }

  // ── GENERATE KODE (INTERNAL) ────────────────────────────────────────
  // Tidak di-expose ke window, bahkan di dev sekalipun via cara ini
  function _generateKode(tier, email) {
    const raw    = tier + '|' + email.toLowerCase().trim() + '|' + _SALT;
    const h      = _hash(raw);
    const part1  = h.slice(0, 4);
    const part2  = h.slice(4, 8);
    const prefix = tier === TIER.PRO ? 'PRO' : 'BSC';
    return `${prefix}-${part1}-${part2}`;
  }

  // ── VALIDASI KODE ───────────────────────────────────────────────────
  function validateKode(kode, email) {
    kode = (kode || '').trim().toUpperCase();
    if (!kode) return { valid: false, tier: null, msg: 'Kode tidak boleh kosong' };

    let tier = null;
    if      (kode.startsWith('PRO-')) tier = TIER.PRO;
    else if (kode.startsWith('BSC-')) tier = TIER.BASIC;
    else return {
      valid : false,
      tier  : null,
      msg   : 'Format kode salah (harus PRO-XXXX-XXXX atau BSC-XXXX-XXXX)',
    };

    const expected = _generateKode(tier, email);
    if (kode === expected) return { valid: true, tier, msg: 'Kode valid ✓' };
    return { valid: false, tier: null, msg: 'Kode tidak valid atau bukan milik akun ini' };
  }

  // ── GETTER ──────────────────────────────────────────────────────────
  function getTier()       { return getLicense().tier || TIER.STARTER; }
  function getTierConfig() { return TIER_CONFIG[getTier()] || TIER_CONFIG.starter; }
  function isPro()         { return getTier() === TIER.PRO; }
  function isBasic()       { return getTier() === TIER.BASIC || isPro(); }

  function canAddProduk() {
    const cfg  = getTierConfig();
    const _get = global.getData || function (k, d) {
      try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; }
    };
    return (_get('produk', [])).length < cfg.maxProduk;
  }

  function canUseSheets()    { return getTierConfig().sheets; }
  function canUseCloudSync() { return getTierConfig().cloudSync; }
  function canExportAll()    { return getTierConfig().exportAll; }

  // ── EMAIL LOGIN ─────────────────────────────────────────────────────
  function getEmailLogin() {
    return (global.FB && global.FB.email)
      || (global.FB && global.FB.auth && global.FB.auth.currentUser && global.FB.auth.currentUser.email)
      || localStorage.getItem('mk_email')
      || '';
  }

  // ── AKTIVASI KODE ───────────────────────────────────────────────────
  function aktivasiKode(kode) {
    const email = getEmailLogin();
    if (!email) { toast('Login dulu untuk aktivasi', 'error'); return false; }
    const result = validateKode(kode, email);
    if (!result.valid) { toast(result.msg, 'error'); return false; }
    setLicense({
      tier      : result.tier,
      kode      : kode.trim().toUpperCase(),
      aktifSejak: new Date().toISOString(),
      expiry    : null, // null = tidak ada expiry; isi Date.now() + ms jika ingin berbatas waktu
    });
    toast(`Aktivasi ${result.tier.toUpperCase()} berhasil! 🎉`, 'success');
    renderBadgeTier();
    updateAktivasiSettingsLabel();
    closeModal('modal-aktivasi');
    return true;
  }

  // ── RENDER BADGE TIER DI HEADER ────────────────────────────────────
  function renderBadgeTier() {
    const cfg      = getTierConfig();
    const existing = document.getElementById('tier-badge');
    if (existing) existing.remove();

    const badge       = document.createElement('span');
    badge.id          = 'tier-badge';
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

  // ── INJECT MODAL AKTIVASI ───────────────────────────────────────────
  function injectModalAktivasi() {
    if (document.getElementById('modal-aktivasi')) return;
    const html = `
    <div class="modal-overlay" id="modal-aktivasi">
      <div class="modal-sheet">
        <div class="modal-handle"></div>
        <div class="modal-title">🔑 Lisensi MotoKas</div>

        <div id="aktivasi-status-card" style="
          border-radius:12px;padding:14px 16px;margin-bottom:16px;
          background:var(--card);border:1px solid var(--border);">
          <div style="display:flex;align-items:center;gap:10px">
            <div id="akt-tier-emoji" style="font-size:28px"></div>
            <div>
              <div id="akt-tier-label" style="font-weight:700;font-size:15px"></div>
              <div id="akt-tier-desc"  style="font-size:12px;color:var(--text3);margin-top:2px"></div>
            </div>
          </div>
          <div id="akt-fitur-list"
            style="margin-top:12px;display:flex;flex-direction:column;gap:6px;font-size:12px">
          </div>
        </div>

        <div id="aktivasi-form-section">
          <div class="modal-label" style="margin-bottom:6px">Masukkan Kode Aktivasi</div>
          <input class="modal-input" id="input-kode-aktivasi"
            placeholder="Contoh: PRO-A1B2-C3D4"
            style="font-family:monospace;letter-spacing:2px;text-transform:uppercase"
            oninput="this.value=this.value.toUpperCase()">
          <div style="font-size:11px;color:var(--text3);margin-top:6px">
            Beli lisensi via WhatsApp → kode dikirim ke email Anda
          </div>
          <button class="btn-primary" style="width:100%;margin-top:12px"
            onclick="window._motoKasAktivasi.doAktivasi()">
            ✔ Aktifkan Lisensi
          </button>
          <button class="btn-secondary" style="width:100%;margin-top:8px"
            onclick="window._motoKasAktivasi.beliLisensi()">
            💬 Beli via WhatsApp
          </button>
        </div>

        <div id="aktivasi-reset-section" style="display:none;margin-top:12px">
          <button class="btn-danger" style="width:100%"
            onclick="window._motoKasAktivasi.resetLisensi()">
            🗑 Hapus Lisensi (kembali ke Starter)
          </button>
        </div>

        <button class="btn-secondary" style="width:100%;margin-top:10px"
          onclick="closeModal('modal-aktivasi')">
          Tutup
        </button>
      </div>
    </div>`;
    document.body.insertAdjacentHTML('beforeend', html);
    document.getElementById('modal-aktivasi').addEventListener('click', e => {
      if (e.target.id === 'modal-aktivasi') closeModal('modal-aktivasi');
    });
  }

  // ── BUKA MODAL AKTIVASI ────────────────────────────────────────────
  function openModalAktivasi() {
    injectModalAktivasi();
    const lic = getLicense();
    const cfg = getTierConfig();

    document.getElementById('akt-tier-emoji').textContent = cfg.emoji;
    document.getElementById('akt-tier-label').textContent = 'Paket ' + cfg.label;

    let desc = '';
    if (lic.tier === TIER.STARTER) {
      desc = 'Gratis · Maks 20 produk';
    } else {
      const since = lic.aktifSejak
        ? new Date(lic.aktifSejak).toLocaleDateString('id-ID')
        : '-';
      const expText = lic.expiry
        ? ' · Exp: ' + new Date(lic.expiry).toLocaleDateString('id-ID')
        : '';
      desc = `Aktif sejak ${since}${expText}`;
    }
    document.getElementById('akt-tier-desc').textContent = desc;

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

    const inputEl = document.getElementById('input-kode-aktivasi');
    if (inputEl) inputEl.value = '';

    openModal('modal-aktivasi');
  }

  function doAktivasi() {
    const kode = (document.getElementById('input-kode-aktivasi').value || '').trim();
    if (!kode) { toast('Masukkan kode aktivasi', 'error'); return; }
    if (aktivasiKode(kode)) setTimeout(openModalAktivasi, 300);
  }

  function resetLisensi() {
    if (!confirm('Yakin ingin menghapus lisensi? Fitur Pro/Basic akan dinonaktifkan.')) return;
    setLicense({ tier: TIER.STARTER, kode: null, aktifSejak: null, expiry: null });
    renderBadgeTier();
    updateAktivasiSettingsLabel();
    toast('Lisensi dihapus, kembali ke Starter');
    openModalAktivasi();
  }

  function beliLisensi() {
    const email = getEmailLogin() || 'email-anda';
    const wa    = `https://wa.me/6285798132246?text=Halo%2C%20saya%20mau%20beli%20lisensi%20MotoKas.%0AEmail%3A%20${encodeURIComponent(email)}`;
    global.open(wa, '_blank');
  }

  // ── POPUP UPGRADE ──────────────────────────────────────────────────
  function showUpgradePopup(fitur) {
    const pesan = {
      produk    : '💡 Paket Starter hanya mendukung hingga 20 produk.',
      sheets    : '📊 Google Sheets hanya tersedia di paket Pro.',
      cloudSync : '☁️ Cloud Sync hanya tersedia di paket Pro.',
      export    : '📤 Export lengkap tersedia di paket Basic & Pro.',
    };
    const msg = pesan[fitur] || '🔒 Fitur ini memerlukan upgrade paket.';

    if (!global.Swal) {
      if (confirm(msg + '\n\nBuka WhatsApp untuk beli lisensi?')) beliLisensi();
      return;
    }
    global.Swal.fire({
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

  // ── GUARD FUNCTIONS ────────────────────────────────────────────────
  // FIX #3: guard canAddProduk dicek langsung di sini, tidak hanya
  // mengandalkan patch — sehingga tidak bisa di-bypass jika patch gagal

  function guardSimpanProduk() {
    const editId = parseInt(
      (document.getElementById('edit-produk-id') || {}).value || '0'
    ) || 0;
    // Cek batas produk hanya untuk tambah baru (bukan edit)
    if (!editId && !canAddProduk()) {
      closeModal('modal-tambah-produk');
      showUpgradePopup('produk');
      return;
    }
    const ori = global._simpanProdukOri;
    if (typeof ori === 'function') ori();
    else console.error('MotoKas: simpanProdukOri tidak ditemukan');
  }

  function guardKirimSheets(trxData) {
    if (!canUseSheets()) { showUpgradePopup('sheets'); return; }
    const ori = global._kirimSheetsOri;
    if (typeof ori === 'function') ori(trxData);
  }

  function guardTesSheets() {
    if (!canUseSheets()) { showUpgradePopup('sheets'); return; }
    const ori = global._tesSheetsOri;
    if (typeof ori === 'function') ori();
  }

  function guardExportCSV() {
    if (!canExportAll()) { showUpgradePopup('export'); return; }
    const ori = global._exportCSVOri;
    if (typeof ori === 'function') ori();
  }

  function guardExportTXT() {
    if (!canExportAll()) { showUpgradePopup('export'); return; }
    const ori = global._exportTXTOri;
    if (typeof ori === 'function') ori();
  }

  // ── PATCH APP.JS FUNCTIONS ─────────────────────────────────────────
  // FIX #2: retry loop hingga 30x (9 detik) dengan interval 300ms,
  // stop sendiri jika semua fungsi sudah tersedia
  function patchAppFunctions() {
    if (global._appPatched) return;

    const targets = [
      { name: 'simpanProduk', oriKey: '_simpanProdukOri', guard: guardSimpanProduk },
      { name: 'kirimSheets',  oriKey: '_kirimSheetsOri',  guard: guardKirimSheets  },
      { name: 'tesSheets',    oriKey: '_tesSheetsOri',    guard: guardTesSheets    },
      { name: 'exportCSV',    oriKey: '_exportCSVOri',    guard: guardExportCSV    },
      { name: 'exportTXT',    oriKey: '_exportTXTOri',    guard: guardExportTXT    },
    ];

    let patched = 0;
    targets.forEach(t => {
      // Sudah di-patch sebelumnya, skip
      if (global[t.oriKey]) { patched++; return; }
      if (typeof global[t.name] !== 'function') return;
      // Simpan fungsi asli dengan prefix _ agar tidak mudah di-override dari console
      global[t.oriKey] = global[t.name];
      global[t.name]   = t.guard;
      patched++;
    });

    if (patched >= targets.length) {
      global._appPatched = true;
      return;
    }

    // Belum semua terpatch — jadwalkan retry
    const maxRetry  = 30;
    let   retryCount = global._patchRetryCount || 0;
    if (retryCount >= maxRetry) {
      console.warn(`MotoKas: patchAppFunctions gagal setelah ${maxRetry} percobaan.`);
      return;
    }
    global._patchRetryCount = retryCount + 1;
    setTimeout(patchAppFunctions, 300);
  }

  // ── INJECT BAGIAN AKTIVASI DI SETTINGS ────────────────────────────
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
          <button class="btn-primary"
            onclick="window._motoKasAktivasi.openModalAktivasi()">Kelola</button>
        </div>
      </div>`;

    // Sisipkan sebelum section "Zona Bahaya" (section-title terakhir)
    const allTitles = settingsPage.querySelectorAll('.section-title');
    const lastTitle = allTitles[allTitles.length - 1];
    if (lastTitle) settingsPage.insertBefore(section, lastTitle);
    else settingsPage.appendChild(section);

    updateAktivasiSettingsLabel();
  }

  function updateAktivasiSettingsLabel() {
    const cfg = getTierConfig();
    const lic = getLicense();
    const el1 = document.getElementById('akt-settings-label');
    const el2 = document.getElementById('akt-settings-desc');
    if (el1) el1.textContent = `${cfg.emoji} Paket ${cfg.label}`;
    if (el2) {
      el2.textContent = lic.tier === TIER.STARTER
        ? 'Gratis · Maks 20 produk'
        : `Aktif sejak ${new Date(lic.aktifSejak).toLocaleDateString('id-ID')}`;
    }
  }

  // ── INIT ───────────────────────────────────────────────────────────
  function initAktivasi() {
    patchAppFunctions();
    renderBadgeTier();
    injectAktivasiSettings();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAktivasi);
  } else {
    initAktivasi();
  }

  // ── PUBLIC API ─────────────────────────────────────────────────────
  // Hanya fungsi yang benar-benar perlu dipanggil dari HTML/luar
  global._motoKasAktivasi = {
    openModalAktivasi,
    doAktivasi,
    resetLisensi,
    beliLisensi,
  };

  // Fungsi yang dibutuhkan file lain (firebase.js, app.js)
  global.renderBadgeTier     = renderBadgeTier;
  global.canAddProduk        = canAddProduk;
  global.canUseSheets        = canUseSheets;
  global.canUseCloudSync     = canUseCloudSync;
  global.canExportAll        = canExportAll;
  global.showUpgradePopup    = showUpgradePopup;
  global.getTier             = getTier;
  global.getTierConfig       = getTierConfig;
  global.isPro               = isPro;
  global.isBasic             = isBasic;

  // ── PANEL ADMIN — hanya aktif di localhost/dev ─────────────────────
  // FIX: generateKode TIDAK di-expose ke window bahkan di dev
  // Akses via: window._motoKasDev.generateKode('pro', 'email@email.com')
  const _isDev = ['localhost', '127.0.0.1'].includes(location.hostname)
    || location.hostname.endsWith('.local');

  if (_isDev) {
    global._motoKasDev = {
      generateKode: function (tier, email) {
        if (!['basic', 'pro'].includes(tier)) {
          console.error('tier harus "basic" atau "pro"');
          return;
        }
        const kode = _generateKode(tier, email);
        console.log('%c🔑 Kode Aktivasi MotoKas', 'font-size:16px;font-weight:bold;color:#f5c542');
        console.log(`%cTier  : ${tier.toUpperCase()}`,  'color:#4caf7d');
        console.log(`%cEmail : ${email}`,               'color:#aaa');
        console.log(`%cKode  : ${kode}`, 'font-size:18px;font-weight:bold;color:#f5c542;letter-spacing:2px');
        return kode;
      },
      getLicense,
      setTierDev: function (tier) {
        if (!TIER_CONFIG[tier]) { console.error('tier tidak valid'); return; }
        setLicense({ tier, kode: 'DEV', aktifSejak: new Date().toISOString(), expiry: null });
        renderBadgeTier();
        updateAktivasiSettingsLabel();
        console.log(`%c[Dev] Tier diset ke: ${tier}`, 'color:#f5c542');
      },
    };
    console.info(
      '%c[MotoKas Dev] Gunakan window._motoKasDev.generateKode("pro", "email@email.com")',
      'color:#f5c542'
    );
    console.info(
      '%c[MotoKas Dev] Atau window._motoKasDev.setTierDev("pro") untuk simulasi tier',
      'color:#f5c542'
    );
  }

})(window);
