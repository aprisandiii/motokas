/* ══════════════════════════════════════════
   dityaMotor 88 — Firebase Integration
   firebase.js — Realtime Database Version
   ✅ GRATIS — tidak butuh billing!
══════════════════════════════════════════ */

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getAuth,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  getDatabase,
  ref,
  set,
  get,
  onValue,
  off
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";

/* ══ KONFIGURASI FIREBASE ══ */
const firebaseConfig = {
  apiKey: "AIzaSyBWpYf60oElN_so1PJAyl0dz0Rn1Qc2QwY",
  authDomain: "dityamotor88-33cf5.firebaseapp.com",
  databaseURL: "https://dityamotor88-33cf5-default-rtdb.asia-southeast1.firebaseapp.com",
  projectId: "dityamotor88-33cf5",
  storageBucket: "dityamotor88-33cf5.firebasestorage.app",
  messagingSenderId: "1035608933800",
  appId: "1:1035608933800:web:3be62f69743add3e39499d"
};

/* ══ INIT ══ */
const app  = initializeApp(firebaseConfig);
const auth = getAuth(app);
const rtdb = getDatabase(app);

window.FB = { auth, rtdb, uid: null, isOnline: false, listeners: {} };

/* ══════════════════════════════════════════
   PATH HELPER
══════════════════════════════════════════ */
function tokoRef(path) {
  const uid = window.FB.uid;
  if (!uid) return null;
  return ref(rtdb, `toko/${uid}/${path}`);
}

/* ══════════════════════════════════════════
   SYNC BADGE
══════════════════════════════════════════ */
function showSyncBadge(status) {
  let badge = document.getElementById('fbSyncBadge');
  if (!badge) {
    badge = document.createElement('div');
    badge.id = 'fbSyncBadge';
    badge.style.cssText = `
      position:fixed;top:12px;right:12px;z-index:9999;
      padding:5px 14px;border-radius:20px;font-size:11px;font-weight:700;
      font-family:'Plus Jakarta Sans',sans-serif;display:flex;align-items:center;
      gap:6px;transition:all 0.3s;pointer-events:none;
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
  if (status === 'synced') {
    clearTimeout(badge._t);
    badge._t = setTimeout(() => showSyncBadge('online'), 3000);
  }
}

/* ══════════════════════════════════════════
   ERROR MESSAGE
══════════════════════════════════════════ */
function fbErrMsg(code) {
  const map = {
    'auth/user-not-found':         'Email tidak ditemukan',
    'auth/wrong-password':         'Password salah',
    'auth/invalid-email':          'Format email tidak valid',
    'auth/too-many-requests':      'Terlalu banyak percobaan, coba lagi nanti',
    'auth/network-request-failed': 'Tidak ada koneksi internet',
    'auth/invalid-credential':     'Email atau password salah',
  };
  return map[code] || 'Error: ' + code;
}

/* ══════════════════════════════════════════
   AUTH
══════════════════════════════════════════ */
window.fbLogin = async function(email, password) {
  try {
    const cred = await signInWithEmailAndPassword(auth, email, password);
    window.FB.uid      = cred.user.uid;
    window.FB.isOnline = true;
    showSyncBadge('online');
    return { ok: true, user: cred.user };
  } catch (e) {
    return { ok: false, error: fbErrMsg(e.code) };
  }
};

window.fbLogout = async function() {
  // Matikan semua realtime listeners
  Object.values(window.FB.listeners).forEach(r => off(r));
  window.FB.listeners = {};
  window.FB.uid       = null;
  window.FB.isOnline  = false;
  showSyncBadge('offline');
  await signOut(auth);
};

/* ══════════════════════════════════════════
   LOAD DATA (sekali saat login)
══════════════════════════════════════════ */
window.fbLoadAllData = async function() {
  if (!window.FB.uid) return;
  showSyncBadge('syncing');
  try {
    const snap = await get(tokoRef('data'));
    if (snap.exists()) {
      const data = snap.val();
      if (data.produk)         { window.produk          = data.produk;         if (typeof window.renderProduk    === 'function') window.renderProduk(); }
      if (data.laporan)        { window.laporan         = data.laporan;        if (typeof window.renderLaporan   === 'function') window.renderLaporan(); }
      if (data.riwayat)        { window.riwayat         = data.riwayat;        if (typeof window.renderRiwayat   === 'function') window.renderRiwayat(); }
      if (data.statistik)        window.statistikProduk = data.statistik;
      if (data.pengaturan)     { window.pengaturan      = { ...window.pengaturan, ...data.pengaturan }; if (typeof window.terapkanPengaturan === 'function') window.terapkanPengaturan(); }
    }
    if (typeof window.updateDashboard === 'function') window.updateDashboard();
   showSyncBadge('synced');

   setTimeout(() => {
   showSyncBadge('online');
}, 2000);

if (typeof window.showToast === 'function')
  window.showToast('✅ Data cloud berhasil dimuat!', 'success');
  } catch(e) {
    console.error('fbLoadAllData:', e);
    showSyncBadge('error');
    if (typeof window.showToast === 'function') window.showToast('⚠️ Gagal muat data: ' + e.message, 'error');
  }
};

/* ══════════════════════════════════════════
   REALTIME LISTENER
   Otomatis update jika ada perubahan dari
   perangkat lain
══════════════════════════════════════════ */
window.fbListenRealtime = function() {
  if (!window.FB.uid) return;

  // Matikan listener lama
  Object.values(window.FB.listeners).forEach(r => off(r));
  window.FB.listeners = {};

  const dataRef = tokoRef('data');
  window.FB.listeners.data = dataRef;

  onValue(dataRef, (snap) => {
    if (!snap.exists()) return;
    const data = snap.val();

    if (data.produk && JSON.stringify(data.produk) !== JSON.stringify(window.produk)) {
      window.produk = data.produk;
      if (typeof window.renderProduk    === 'function') window.renderProduk();
      if (typeof window.updateDashboard === 'function') window.updateDashboard();
    }
    if (data.laporan && JSON.stringify(data.laporan) !== JSON.stringify(window.laporan)) {
      window.laporan = data.laporan;
      if (typeof window.renderLaporan   === 'function') window.renderLaporan();
      if (typeof window.updateDashboard === 'function') window.updateDashboard();
    }
    if (data.riwayat && JSON.stringify(data.riwayat) !== JSON.stringify(window.riwayat)) {
      window.riwayat = data.riwayat;
      if (typeof window.renderRiwayat   === 'function') window.renderRiwayat();
    }
    if (data.pengaturan && JSON.stringify(data.pengaturan) !== JSON.stringify(window.pengaturan)) {
      window.pengaturan = { ...window.pengaturan, ...data.pengaturan };
      if (typeof window.terapkanPengaturan === 'function') window.terapkanPengaturan();
    }
  }, (err) => {
    console.error('Realtime listener error:', err);
    showSyncBadge('error');
  });
};

/* ══════════════════════════════════════════
   SIMPAN KE REALTIME DATABASE
══════════════════════════════════════════ */
window.fbSimpanSemua = async function() {
   console.log('fbSimpanSemua DIPANGGIL');
   if (!window.FB.uid) return;

  showSyncBadge('syncing');

  try {

    await set(tokoRef('data'), {
      produk:     window.produk || [],
      laporan:    window.laporan || [],
      riwayat:    window.riwayat || [],
      statistik:  window.statistikProduk || {},
      pengaturan: window.pengaturan || {},
      updatedAt:  Date.now()
    });

    showSyncBadge('synced');

    setTimeout(() => {
      showSyncBadge('online');
    }, 2000);

  } catch(e) {

    console.error('fbSimpanSemua:', e);

    showSyncBadge('error');

  }
};

/* ══════════════════════════════════════════
   MODAL LOGIN CLOUD
══════════════════════════════════════════ */
window.bukaLoginFirebase = function() {
  if (!window.Swal) return;

  if (window.FB.uid) {
    Swal.fire({
      title: '☁️ Keluar dari Cloud?',
      html: `<p style="color:#8892a4;font-size:13px">Realtime sync akan berhenti.<br>Data lokal tetap aman.</p>`,
      icon: 'question', background:'#171b24', color:'#e8eaf0',
      showCancelButton: true,
      confirmButtonText: 'Ya, Keluar',
      confirmButtonColor: '#ef4444',
      cancelButtonText: 'Batal'
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
    confirmButtonText: '🔑 Login',
    confirmButtonColor: '#f5c542',
    showCancelButton: true,
    cancelButtonText: 'Batal',
    preConfirm: async () => {
      const email    = document.getElementById('fb-email').value.trim();
      const password = document.getElementById('fb-password').value;
      if (!email || !password) {
        Swal.showValidationMessage('Email & password wajib diisi');
        return false;
      }
      Swal.showLoading();
      const result = await window.fbLogin(email, password);
      if (!result.ok) {
        Swal.showValidationMessage(result.error);
        return false;
      }
      return result;
    }
  }).then(r => {
    if (r.isConfirmed && typeof window.showToast === 'function')
      window.showToast('✅ Login berhasil! Memuat data cloud...', 'success');
  });
};

/* ══════════════════════════════════════════
   AUTO AUTH STATE
══════════════════════════════════════════ */
onAuthStateChanged(auth, async (user) => {
  const btn = document.getElementById('btnCloudLogin');
  if (user) {
    window.FB.uid      = user.uid;
    window.FB.isOnline = true;
    showSyncBadge('online');
    await window.fbLoadAllData();
    window.fbListenRealtime();
    if (btn) {
      btn.innerHTML             = `✅ <span class="btn-label">Cloud</span>`;
      btn.style.background      = 'rgba(34,197,94,0.15)';
      btn.style.borderColor     = 'rgba(34,197,94,0.4)';
      btn.style.color           = '#22c55e';
    }
  } else {
    window.FB.uid      = null;
    window.FB.isOnline = false;
    showSyncBadge('offline');
    if (btn) {
      btn.innerHTML         = `☁️ <span class="btn-label">Cloud</span>`;
      btn.style.background  = 'rgba(99,102,241,0.15)';
      btn.style.borderColor = 'rgba(99,102,241,0.4)';
      btn.style.color       = '#818cf8';
    }
  }
});

/* ══════════════════════════════════════════
   INJECT TOMBOL + PATCH simpanData()
══════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', () => {
  setTimeout(() => {
    // Tombol Cloud di topbar
    const topbarActions = document.querySelector('.topbar-actions');
    if (topbarActions && !document.getElementById('btnCloudLogin')) {
      const btn = document.createElement('button');
      btn.id        = 'btnCloudLogin';
      btn.onclick   = window.bukaLoginFirebase;
      btn.innerHTML = `☁️ <span class="btn-label">Cloud</span>`;
      btn.style.cssText = `background:rgba(99,102,241,0.15);border-color:rgba(99,102,241,0.4);color:#818cf8;`;
      topbarActions.insertBefore(btn, topbarActions.lastElementChild);
    }

    // Patch simpanData() agar auto-sync ke Firebase
    const ori = window.simpanData;
    if (typeof ori === 'function') {
      window.simpanData = function() {
        ori.call(this);                                          // simpan lokal dulu
        if (window.FB && window.FB.uid) window.fbSimpanSemua(); // lalu ke cloud
      };
    }
  }, 600);
});
