/* ══════════════════════════════════════════
   dityaMotor 88 — Firebase Integration v2
   firebase.js — Fixed  Realtime Sync
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

window.FB = { auth, rtdb, uid: null, email: null, isOnline: false, listeners: {} };

/* ── INTERNAL FLAGS ── */
let _isSaving       = false;
let _isLoadingCloud = false;
let _lastSavedHash  = '';

function dataHash() {
  const laporan = window.laporan || {};
  const d = {
    p: (window.produk||[]).length,
    l: Object.keys(laporan).length,
    r: (window.riwayat||[]).length,
    t: Object.values(laporan).reduce((s,i)=>s+(i.omzet||0),0)
  };
  return JSON.stringify(d);
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
function syncProduk() {
  if (typeof window.syncProdukDariFirebase === 'function') window.syncProdukDariFirebase();
}
function syncLaporan() {
  if (typeof window.syncLaporanDariFirebase === 'function') window.syncLaporanDariFirebase();
}
function syncRiwayat() {
  if (typeof window.syncRiwayatDariFirebase === 'function') window.syncRiwayatDariFirebase();
}

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
    online:  { bg:'#22c55e', color:'#fff', icon:'☁️',  text:'Online' },
    offline: { bg:'#4b5563', color:'#ccc', icon:'📴',  text:'Offline' },
    syncing: { bg:'#f5c542', color:'#111', icon:'⏳',  text:'Menyimpan...' },
    synced:  { bg:'#22c55e', color:'#fff', icon:'✅',  text:'Tersinkron' },
    error:   { bg:'#ef4444', color:'#fff', icon:'⚠️', text:'Error sync' },
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
    window.FB.uid    = cred.user.uid;
    window.FB.email  = cred.user.email;
    window.FB.isOnline = true;
    // Simpan email ke localStorage supaya aktivasi.js bisa baca
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

window.fbLogout = async function() {
  // Hentikan semua listener realtime
  Object.values(window.FB.listeners).forEach(r => off(r));
  window.FB.listeners = {};

  // Bersihkan data akun lama dari localStorage & memory
  clearLocalData();
  localStorage.removeItem('settings');
  localStorage.removeItem('prefs');
  localStorage.removeItem('pin');
  localStorage.removeItem('mk_email'); // FIX: hapus email saat logout

  window.FB.uid      = null;
  window.FB.email    = null;
  window.FB.isOnline = false;
  _lastSavedHash     = '';
  showSyncBadge('offline');
  await signOut(auth);
};

/* ── LOAD DATA ── */
window.fbLoadAllData = async function() {
  if (!window.FB.uid || _isLoadingCloud) return;
  _isLoadingCloud = true;
  showSyncBadge('syncing');

  // Bersihkan data lama sebelum load data akun baru
  clearLocalData();

  try {
    const snap = await get(tokoRef('data'));
    if (snap.exists()) {
      const data = snap.val();
      if (data.produk)  {
        window.produk  = data.produk;
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
    } else {
      // Akun baru — tidak ada data di Firebase, pastikan tampil kosong
      syncProduk();
      syncLaporan();
      syncRiwayat();
    }

    if (typeof window.updateDashboard === 'function') window.updateDashboard();
    if (typeof window.renderBadgeTier === 'function') window.renderBadgeTier();
    _lastSavedHash = dataHash();
    showSyncBadge('synced');
  } catch(e) {
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

    const data = snap.val();
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

/* ── MODAL LOGIN CLOUD ── */
window.bukaLoginFirebase = function() {
  if (!window.Swal) {
    alert('Library Swal belum dimuat.');
    return;
  }

  if (window.FB.uid) {
    Swal.fire({
      title: '☁️ Keluar dari Cloud?',
      html: `<p style="color:#8892a4;font-size:13px">Realtime sync akan berhenti.<br>Data lokal tetap aman.</p>`,
      icon: 'question', background:'#171b24', color:'#e8eaf0',
      showCancelButton: true, confirmButtonText: 'Ya, Keluar',
      confirmButtonColor: '#ef4444', cancelButtonText: 'Batal'
    }).then(r => { if (r.isConfirmed) window.fbLogout(); });
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
    background:'#171b24', color:'#e8eaf0',
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

/* ── HELPER: cek apakah app sudah melewati PIN (sudah di dalam app) ── */
function isAppActive() {
  const app = document.getElementById('app');
  return app && app.style.display !== 'none' && app.style.display !== '';
}

/* ── AUTO AUTH STATE ── */
onAuthStateChanged(auth, async (user) => {
  const btn = document.getElementById('btnCloudLogin');
  if (user) {
    window.FB.uid      = user.uid;
    window.FB.email    = user.email;
    window.FB.isOnline = true;
    // FIX: simpan email ke localStorage supaya aktivasi.js bisa baca meski page refresh
    localStorage.setItem('mk_email', user.email);

    // Hanya load data & tampilkan badge jika app sudah aktif (sudah lewat PIN)
    if (isAppActive()) {
      showSyncBadge('online');
      await window.fbLoadAllData();
      window.fbListenRealtime();
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
    showSyncBadge('offline');
    if (btn) {
      btn.innerHTML         = `☁️ <span class="btn-label">Cloud</span>`;
      btn.style.background  = 'rgba(99,102,241,0.15)';
      btn.style.borderColor = 'rgba(99,102,241,0.4)';
      btn.style.color       = '#818cf8';
    }
  }

  // FIX #1: dispatch event 'firebaseReady' setelah auth state diketahui
  // Ini memicu aktivasi.js untuk diload (dari index.html)
  if (!window._firebaseReadyDispatched) {
    window._firebaseReadyDispatched = true;
    window.dispatchEvent(new Event('firebaseReady'));
  }
});

/* ── REGISTER ── */
window.fbRegister = async function(email, password) {
  try {
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    window.FB.uid   = cred.user.uid;
    window.FB.email = cred.user.email;
    window.FB.isOnline = true;
    // FIX: simpan email saat register juga
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
    const btn = document.createElement('button');
    btn.id        = 'btnCloudLogin';
    btn.onclick   = window.bukaLoginFirebase;
    btn.innerHTML = `☁️ <span class="btn-label">Cloud</span>`;
    btn.style.cssText = `background:rgba(99,102,241,0.15);border:1px solid rgba(99,102,241,0.4);
      color:#818cf8;padding:6px 12px;border-radius:8px;font-size:12px;cursor:pointer;`;
    topbarActions.insertBefore(btn, topbarActions.lastElementChild);
  }

  const ori = window.simpanData;
  if (typeof ori === 'function' && !ori._patched) {
    window.simpanData = function() {
      ori.apply(this, arguments);
      clearTimeout(window._fbSaveTimeout);
      window._fbSaveTimeout = setTimeout(() => {
        if (window.FB.uid) window.fbSimpanSemua();
      }, 800);
    };
    window.simpanData._patched = true;
  }
};
