/* ══════════════════════════════════════════
   MotoKas — Firebase Integration v2
   firebase.js — Fixed & Synced
══════════════════════════════════════════ */

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, onAuthStateChanged, sendPasswordResetEmail } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getDatabase, ref, set, get, onValue, off } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";

const firebaseConfig = {
  apiKey: "AIzaSyBWpYf60oElN_so1PJAyl0dz0Rn1Qc2QwY",
  authDomain: "dityamotor88-33cf5.firebaseapp.com",
  databaseURL: "https://dityamotor88-33cf5-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "dityamotor88-33cf5",
  storageBucket: "dityamotor88-33cf5.firebasestorage.app",
  messagingSenderId: "1035608933800",
  appId: "1:1035608933800:web:3be62f69743add3e39499d"
};

const app  = initializeApp(firebaseConfig);
const auth = getAuth(app);
const rtdb = getDatabase(app);

window.FB = { auth, rtdb, uid: null, email: null, isOnline: false, isReady: false, listeners: {} };

/* ── EXPOSE off() agar script non-module bisa stop listener manual ── */
window._fbOff = { off };

/* ── INTERNAL FLAGS ── */
let _isSaving       = false;
let _isLoadingCloud = false;
let _lastSavedHash  = '';

// FIX #1 — hash pakai isi konten nyata, bukan sekadar hitungan/jumlah
// Sebelumnya hanya menghitung .length dan total omzet sehingga perubahan
// detail (nama produk, harga, dll) tidak terdeteksi → data tidak tersimpan.
function dataHash() {
  return JSON.stringify({
    p: window.produk          || [],
    l: window.laporan         || {},
    r: (window.riwayat || []).slice(0, 20),
    s: window.pengaturan      || {},
  });
}

function tokoRef(path) {
  if (!window.FB.uid) return null;
  return ref(rtdb, `toko/${window.FB.uid}/${path}`);
}

/* ── BERSIHKAN LOCALSTORAGE DATA (bukan settings/pin) ── */
function clearLocalData() {
  localStorage.removeItem('produk');
  localStorage.removeItem('laporan');
  localStorage.removeItem('riwayat');
  window.produk  = [];
  window.laporan = {};
  window.riwayat = [];
}

/* ── HELPER: panggil fungsi sync yang aman ── */
function syncProduk()  { if (typeof window.syncProdukDariFirebase  === 'function') window.syncProdukDariFirebase(); }
function syncLaporan() { if (typeof window.syncLaporanDariFirebase === 'function') window.syncLaporanDariFirebase(); }
function syncRiwayat() { if (typeof window.syncRiwayatDariFirebase === 'function') window.syncRiwayatDariFirebase(); }

/* ── SYNC BADGE ── */
let _badgeTimeout;
function showSyncBadge(status) {
  let badge = document.getElementById('fbSyncBadge');
  if (!badge) {
    badge = document.createElement('div');
    badge.id = 'fbSyncBadge';
    badge.style.cssText = `position:fixed;top:12px;right:12px;z-index:9999;padding:5px 14px;
      border-radius:20px;font-size:11px;font-weight:700;font-family:'Plus Jakarta Sans',sans-serif;
      display:flex;align-items:center;gap:6px;transition:all 0.3s;pointer-events:none;
      box-shadow:0 2px 10px rgba(0,0,0,0.4);`;
    document.body.appendChild(badge);
  }
  const cfg = {
    online:  { bg: '#22c55e', color: '#fff', icon: '☁️',  text: 'Online' },
    offline: { bg: '#4b5563', color: '#ccc', icon: '📴',  text: 'Offline' },
    syncing: { bg: '#f5c542', color: '#111', icon: '⏳',  text: 'Menyimpan...' },
    synced:  { bg: '#22c55e', color: '#fff', icon: '✅',  text: 'Tersinkron' },
    error:   { bg: '#ef4444', color: '#fff', icon: '⚠️', text: 'Error sync' },
  };
  const c = cfg[status] || cfg.offline;
  badge.style.background = c.bg;
  badge.style.color      = c.color;
  badge.innerHTML        = `${c.icon} <span>${c.text}</span>`;

  clearTimeout(_badgeTimeout);
  if (status === 'synced' || status === 'error') {
    _badgeTimeout = setTimeout(() => showSyncBadge('online'), 2500);
  }
}

/* ── ERROR MESSAGES ── */
function fbErrMsg(code) {
  const map = {
    'auth/user-not-found':         'Email tidak ditemukan',
    'auth/wrong-password':         'Password salah',
    'auth/invalid-email':          'Format email tidak valid',
    'auth/too-many-requests':      'Terlalu banyak percobaan, coba lagi nanti',
    'auth/network-request-failed': 'Tidak ada koneksi internet',
    'auth/invalid-credential':     'Email atau password salah',
    'auth/email-already-in-use':   'Email sudah terdaftar, silakan login',
    'auth/weak-password':          'Password minimal 6 karakter',
  };
  return map[code] || 'Error: ' + code;
}

/* ── LOGIN / LOGOUT ── */
window.fbLogin = async function(email, password) {
  try {
    const cred = await signInWithEmailAndPassword(auth, email, password);
    window.FB.uid      = cred.user.uid;
    window.FB.email    = cred.user.email;
    window.FB.isOnline = true;
    window.FB.isReady  = true;
    localStorage.setItem('mk_email', cred.user.email);
    return { ok: true, user: cred.user };
  } catch(e) {
    return { ok: false, error: fbErrMsg(e.code) };
  }
};

window.fbResetPassword = async function(email) {
  try {
    await sendPasswordResetEmail(auth, email);
    return { ok: true };
  } catch(e) {
    return { ok: false, error: fbErrMsg(e.code) };
  }
};

// FIX #3 — fbLogout tidak boleh hapus data lokal toko.
// Sebelumnya clearLocalData() + hapus settings & pin saat logout,
// akibatnya data hilang dari device setelah logout meski belum tersimpan ke cloud.
// Sekarang hanya hapus credentials auth (mk_email), data toko tetap aman di lokal.
window.fbLogout = async function() {
  Object.values(window.FB.listeners).forEach(r => off(r));
  window.FB.listeners = {};

  // Hanya hapus kredensial login, BUKAN data toko
  localStorage.removeItem('mk_email');

  window.FB.uid      = null;
  window.FB.email    = null;
  window.FB.isOnline = false;
  window.FB.isReady  = false;
  window._pinPassed  = false;
  _lastSavedHash     = '';

  if (typeof window.resetCartState === 'function') window.resetCartState();

  showSyncBadge('offline');
  await signOut(auth);
};

/* ── LOAD DATA ── */
// FIX #2 — fbLoadAllData tidak boleh clearLocalData() di awal.
// Sebelumnya data lokal dihapus dulu sebelum cloud selesai dimuat.
// Kalau cloud kosong atau koneksi lambat/gagal → data tampil kosong.
// Sekarang: data lokal hanya diganti kalau cloud benar-benar punya data.
// Kalau cloud kosong → upload data lokal yang ada ke cloud (misal pindah device pertama kali).
// Kalau cloud error → data lokal tetap aman, tidak dihapus.
window.fbLoadAllData = async function() {
  if (!window.FB.uid || _isLoadingCloud) return;
  _isLoadingCloud = true;
  showSyncBadge('syncing');

  try {
    const snap = await get(tokoRef('data'));
    if (snap.exists()) {
      // Cloud punya data → replace lokal per-key
      const data = snap.val();
      if (data.produk) {
        window.produk = data.produk;
        localStorage.setItem('produk', JSON.stringify(data.produk));
        syncProduk();
      }
      if (data.laporan) {
        window.laporan = data.laporan;
        localStorage.setItem('laporan', JSON.stringify(data.laporan));
        syncLaporan();
      }
      if (data.riwayat) {
        window.riwayat = data.riwayat;
        localStorage.setItem('riwayat', JSON.stringify(data.riwayat));
        syncRiwayat();
      }
      if (data.statistik)  window.statistikProduk = data.statistik;
      if (data.pengaturan) {
        window.pengaturan = { ...window.pengaturan, ...data.pengaturan };
        localStorage.setItem('settings', JSON.stringify(window.pengaturan));
        if (typeof window.terapkanPengaturan === 'function') window.terapkanPengaturan();
      }
      _lastSavedHash = dataHash();
    } else {
      // Cloud kosong (akun baru / pertama kali pindah device) →
      // upload data lokal yang ada supaya tidak hilang
      syncProduk();
      syncLaporan();
      syncRiwayat();
      _lastSavedHash = ''; // paksa fbSimpanSemua jalan
      if (typeof window.fbSimpanSemua === 'function') {
        await window.fbSimpanSemua();
      }
    }

    if (typeof window.updateDashboard === 'function') window.updateDashboard();
    if (typeof window.renderBadgeTier === 'function') window.renderBadgeTier();
    showSyncBadge('synced');
  } catch(e) {
    // Error jaringan → jangan hapus data lokal, cukup tampilkan error
    console.error('fbLoadAllData:', e);
    showSyncBadge('error');
  } finally {
    _isLoadingCloud = false;
  }
};

/* ── REALTIME LISTENER ── */
window.fbListenRealtime = function() {
  if (!window.FB.uid) return;

  Object.values(window.FB.listeners).forEach(r => off(r));
  window.FB.listeners = {};

  const dataRef = tokoRef('data');
  window.FB.listeners.data = dataRef;

  onValue(dataRef, (snap) => {
    if (_isSaving || _isLoadingCloud) return;
    if (!snap.exists()) return;

    const data  = snap.val();
    let berubah = false;

    if (data.produk && JSON.stringify(data.produk) !== JSON.stringify(window.produk)) {
      window.produk = data.produk;
      localStorage.setItem('produk', JSON.stringify(data.produk));
      syncProduk();
      if (typeof window.updateDashboard === 'function') window.updateDashboard();
      berubah = true;
    }
    if (data.laporan && JSON.stringify(data.laporan) !== JSON.stringify(window.laporan)) {
      window.laporan = data.laporan;
      localStorage.setItem('laporan', JSON.stringify(data.laporan));
      syncLaporan();
      if (typeof window.updateDashboard === 'function') window.updateDashboard();
      berubah = true;
    }
    if (data.riwayat && JSON.stringify(data.riwayat) !== JSON.stringify(window.riwayat)) {
      window.riwayat = data.riwayat;
      localStorage.setItem('riwayat', JSON.stringify(data.riwayat));
      syncRiwayat();
      berubah = true;
    }
    if (data.pengaturan && JSON.stringify(data.pengaturan) !== JSON.stringify(window.pengaturan)) {
      window.pengaturan = { ...window.pengaturan, ...data.pengaturan };
      localStorage.setItem('settings', JSON.stringify(window.pengaturan));
      if (typeof window.terapkanPengaturan === 'function') window.terapkanPengaturan();
      berubah = true;
    }

    if (berubah) _lastSavedHash = dataHash();

  }, (err) => {
    console.error('Realtime listener error:', err);
    showSyncBadge('error');
  });
};

/* ── SIMPAN KE FIREBASE ── */
window.fbSimpanSemua = async function() {
  if (!window.FB.uid) return;
  if (_isSaving || _isLoadingCloud) return;

  const currentHash = dataHash();
  if (currentHash === _lastSavedHash) return;

  _isSaving = true;
  showSyncBadge('syncing');

  try {
    await set(tokoRef('data'), {
      produk:     window.produk          || [],
      laporan:    window.laporan         || {},
      riwayat:    window.riwayat         || [],
      statistik:  window.statistikProduk || {},
      pengaturan: window.pengaturan      || {},
      updatedAt:  Date.now()
    });
    _lastSavedHash = currentHash;
    showSyncBadge('synced');
  } catch(e) {
    console.error('fbSimpanSemua:', e);
    showSyncBadge('error');
  } finally {
    setTimeout(() => { _isSaving = false; }, 1000);
  }
};
   window.fbForceSave = async function() {
  _isSaving       = false;
  _isLoadingCloud = false;
  _lastSavedHash  = '';
  await window.fbSimpanSemua();
};

/* ── MODAL LOGIN CLOUD ── */
window.bukaLoginFirebase = function() {
  if (!window.Swal) {
    alert('Library SweetAlert2 belum dimuat. Pastikan koneksi internet aktif.');
    return;
  }

  if (window.FB.uid) {
    const ov = document.createElement('div');
    ov.style.cssText = `position:fixed;inset:0;background:rgba(0,0,0,0.8);
      z-index:999999;display:flex;align-items:center;justify-content:center;`;
    ov.innerHTML = `
      <div style="background:#171b24;border:1px solid #2e3748;border-radius:16px;
                  padding:24px;max-width:320px;width:90%;text-align:center;color:#e8eaf0;font-family:inherit">
        <div style="font-size:36px;margin-bottom:12px">☁️</div>
        <h3 style="margin:0 0 8px;font-size:16px">Keluar dari Cloud?</h3>
        <p style="font-size:13px;color:#8892a4;margin:0 0 20px;line-height:1.5">
          Realtime sync akan berhenti.<br>Data lokal tetap aman.
        </p>
        <div style="display:flex;gap:8px">
          <button id="ov-batal"
            style="flex:1;padding:10px;border-radius:8px;border:1px solid #333;
                   background:transparent;color:#aaa;font-size:14px;cursor:pointer">
            Batal
          </button>
          <button id="ov-keluar"
            style="flex:1;padding:10px;border-radius:8px;border:none;
                   background:#ef4444;color:#fff;font-size:14px;font-weight:700;cursor:pointer">
            Ya, Keluar
          </button>
        </div>
      </div>`;
    document.body.appendChild(ov);
    ov.querySelector('#ov-batal').onclick  = () => ov.remove();
    ov.querySelector('#ov-keluar').onclick = () => { ov.remove(); window.fbLogout(); };
    ov.addEventListener('click', e => { if (e.target === ov) ov.remove(); });
    return;
  }

  Swal.fire({
    title: '☁️ Login Cloud Sync',
    html: `
      <p style="color:#8892a4;font-size:12px;margin-bottom:12px">
        Login untuk sinkronisasi data antar perangkat secara realtime.
      </p>
      <input type="email" id="fb-email" class="swal2-input"
        placeholder="Email owner" autocomplete="email">
      <input type="password" id="fb-password" class="swal2-input"
        placeholder="Password" autocomplete="current-password">
    `,
    background: '#171b24', color: '#e8eaf0',
    confirmButtonText: '🔑 Login', confirmButtonColor: '#f5c542',
    showCancelButton: true, cancelButtonText: 'Batal',
    preConfirm: async () => {
      const email    = document.getElementById('fb-email').value.trim();
      const password = document.getElementById('fb-password').value;
      if (!email || !password) {
        Swal.showValidationMessage('Email & password wajib diisi'); return false;
      }
      Swal.showLoading();
      const result = await window.fbLogin(email, password);
      if (!result.ok) {
        Swal.showValidationMessage(result.error); return false;
      }
      return result;
    }
  }).then(r => {
    if (r.isConfirmed && typeof window.showToast === 'function')
      window.showToast('✅ Login berhasil! Memuat data cloud...', 'success');
  });
};

/* ── isAppActive ── */
function isAppActive() {
  return window._pinPassed === true;
}

/* ── AUTO AUTH STATE ── */
onAuthStateChanged(auth, async (user) => {
  const btn = document.getElementById('btnCloudLogin');
  if (user) {
    window.FB.uid      = user.uid;
    window.FB.email    = user.email;
    window.FB.isOnline = true;
    window.FB.isReady  = true;
    localStorage.setItem('mk_email', user.email);

    if (isAppActive()) {
      showSyncBadge('online');
      await window.fbLoadAllData();
      window.fbListenRealtime();
    } else {
      showSyncBadge('online');
    }

    if (btn) {
      btn.innerHTML         = `✅ <span class="btn-label">Cloud</span>`;
      btn.style.background  = 'rgba(34,197,94,0.15)';
      btn.style.borderColor = 'rgba(34,197,94,0.4)';
      btn.style.color       = '#22c55e';
    }
  } else {
    window.FB.uid      = null;
    window.FB.email    = null;
    window.FB.isOnline = false;
    window.FB.isReady  = false;
    showSyncBadge('offline');
    if (btn) {
      btn.innerHTML         = `☁️ <span class="btn-label">Cloud</span>`;
      btn.style.background  = 'rgba(99,102,241,0.15)';
      btn.style.borderColor = 'rgba(99,102,241,0.4)';
      btn.style.color       = '#818cf8';
    }
  }
});

/* ── REGISTER ── */
window.fbRegister = async function(email, password) {
  try {
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    window.FB.uid      = cred.user.uid;
    window.FB.email    = cred.user.email;
    window.FB.isOnline = true;
    window.FB.isReady  = true;
    localStorage.setItem('mk_email', cred.user.email);
    return { ok: true, user: cred.user };
  } catch(e) {
    return { ok: false, error: fbErrMsg(e.code) };
  }
};

/* ── INJECT TOMBOL CLOUD ── */
window.injectCloudButton = function() {
  const topbarActions = document.querySelector('.header-actions');
  if (topbarActions && !document.getElementById('btnCloudLogin')) {
    const btn     = document.createElement('button');
    btn.id        = 'btnCloudLogin';
    btn.onclick   = () => {
      if (!window.FB.uid && typeof window.canUseCloudSync === 'function' && !window.canUseCloudSync()) {
        if (typeof window.showUpgradePopup === 'function') window.showUpgradePopup('cloudSync');
        return;
      }
      window.bukaLoginFirebase();
    };
    btn.innerHTML = `☁️ <span class="btn-label">Cloud</span>`;
    btn.style.cssText = `background:rgba(99,102,241,0.15);border:1px solid rgba(99,102,241,0.4);
      color:#818cf8;padding:6px 12px;border-radius:8px;font-size:12px;cursor:pointer;`;
    topbarActions.insertBefore(btn, topbarActions.lastElementChild);
  }
};
