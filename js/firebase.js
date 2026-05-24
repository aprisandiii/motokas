/* ══════════════════════════════════════════
   dityaMotor 88 — Firebase Integration
   firebase.js — Auth + Firestore + Realtime Sync
   
   CARA PASANG:
   1. Tambahkan script ini di index.html SEBELUM app.js
   2. Ganti firebaseConfig di bawah dengan config milikmu
   3. Selesai! Data otomatis sync ke cloud
══════════════════════════════════════════ */

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getAuth,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  updatePassword,
  EmailAuthProvider,
  reauthenticateWithCredential
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  collection,
  addDoc,
  onSnapshot,
  query,
  orderBy,
  serverTimestamp,
  writeBatch,
  deleteDoc
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

/* ══ KONFIGURASI FIREBASE ══
   Ganti dengan config dari Firebase Console-mu!
   (Project Settings → Web App → SDK setup)
*/
const firebaseConfig = {
  apiKey: "AIzaSyBWpYf60oElN_so1PJAyl0dz0Rn1Qc2QwY",
  authDomain: "dityamotor88-33cf5.firebaseapp.com",
  databaseURL: "https://dityamotor88-33cf5-default-rtdb.asia-southeast1.firebaseapp.com",
  projectId: "dityamotor88-33cf5",
  storageBucket: "dityamotor88-33cf5.firebasestorage.app",
  messagingSenderId: "1035608933800",
  appId: "1:1035608933800:web:3be62f69743add3e39499d"
};

/* ══ INIT FIREBASE ══ */
const app  = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db   = getFirestore(app);

/* ══════════════════════════════════════════
   STATE GLOBAL
══════════════════════════════════════════ */
window.FB = {
  auth, db,
  uid: null,          // user id setelah login
  isOnline: false,
  listeners: [],      // untuk unsubscribe realtime listeners
};

/* ══════════════════════════════════════════
   AUTH — LOGIN OWNER
   Halaman login PIN tetap ada untuk kasir biasa.
   Owner bisa login pakai email/password Firebase
   untuk akses mode "Owner" (lihat semua data).
══════════════════════════════════════════ */

/** Login Firebase dengan email & password */
window.fbLogin = async function(email, password) {
  try {
    const cred = await signInWithEmailAndPassword(auth, email, password);
    window.FB.uid = cred.user.uid;
    window.FB.isOnline = true;
    showSyncBadge('online');
    return { ok: true, user: cred.user };
  } catch (e) {
    return { ok: false, error: fbErrMsg(e.code) };
  }
};

/** Logout Firebase */
window.fbLogout = async function() {
  // Unsubscribe semua listeners realtime
  window.FB.listeners.forEach(unsub => unsub());
  window.FB.listeners = [];
  window.FB.uid = null;
  window.FB.isOnline = false;
  showSyncBadge('offline');
  await signOut(auth);
};

/** Pantau status auth otomatis */
onAuthStateChanged(auth, async (user) => {
  if (user) {
    window.FB.uid     = user.uid;
    window.FB.isOnline = true;
    showSyncBadge('online');
    await fbLoadAllData();     // Ambil semua data dari Firestore
    fbListenRealtime();        // Mulai sync realtime
  } else {
    window.FB.uid      = null;
    window.FB.isOnline = false;
    showSyncBadge('offline');
  }
});

/* ══════════════════════════════════════════
   PATH HELPER — semua data per-toko (uid)
══════════════════════════════════════════ */
function tokoDoc(subPath) {
  const uid = window.FB.uid;
  if (!uid) return null;
  return doc(db, `toko/${uid}/${subPath}`);
}
function tokoCol(colName) {
  const uid = window.FB.uid;
  if (!uid) return null;
  return collection(db, `toko/${uid}/${colName}`);
}

/* ══════════════════════════════════════════
   LOAD DATA DARI FIRESTORE (satu kali saat login)
══════════════════════════════════════════ */
window.fbLoadAllData = async function() {
  if (!window.FB.uid) return;
  showSyncBadge('syncing');

  try {
    // 1. Pengaturan toko
    const setSnap = await getDoc(tokoDoc('config/pengaturan'));
    if (setSnap.exists()) {
      window.pengaturan = { ...window.pengaturan, ...setSnap.data() };
      if (typeof window.terapkanPengaturan === 'function') window.terapkanPengaturan();
    }

    // 2. Produk
    const produkSnap = await getDoc(tokoDoc('config/produk'));
    if (produkSnap.exists() && produkSnap.data().list) {
      window.produk = produkSnap.data().list;
      if (typeof window.renderProduk === 'function') window.renderProduk();
    }

    // 3. Laporan
    const lapSnap = await getDoc(tokoDoc('config/laporan'));
    if (lapSnap.exists() && lapSnap.data().list) {
      window.laporan = lapSnap.data().list;
      if (typeof window.renderLaporan === 'function') window.renderLaporan();
    }

    // 4. Statistik produk
    const statSnap = await getDoc(tokoDoc('config/statistik'));
    if (statSnap.exists()) {
      window.statistikProduk = statSnap.data().data || {};
    }

    // 5. Riwayat (ambil 100 terakhir)
    const riwSnap = await getDoc(tokoDoc('config/riwayat'));
    if (riwSnap.exists() && riwSnap.data().list) {
      window.riwayat = riwSnap.data().list;
      if (typeof window.renderRiwayat === 'function') window.renderRiwayat();
    }

    if (typeof window.updateDashboard === 'function') window.updateDashboard();
    showSyncBadge('online');
    showFbToast('✅ Data berhasil dimuat dari cloud', 'success');
  } catch(e) {
    console.error('fbLoadAllData error:', e);
    showSyncBadge('error');
    showFbToast('⚠️ Gagal memuat data cloud: ' + e.message, 'error');
  }
};

/* ══════════════════════════════════════════
   REALTIME LISTENER — otomatis update jika
   ada perubahan dari perangkat lain
══════════════════════════════════════════ */
window.fbListenRealtime = function() {
  if (!window.FB.uid) return;

  // Unsubscribe listener lama
  window.FB.listeners.forEach(u => u());
  window.FB.listeners = [];

  // Listener: Produk
  const unsubProduk = onSnapshot(
    tokoDoc('config/produk'),
    (snap) => {
      if (snap.exists() && snap.data().list) {
        // Hindari update jika datanya sama (dari diri sendiri)
        const newList = snap.data().list;
        if (JSON.stringify(newList) !== JSON.stringify(window.produk)) {
          window.produk = newList;
          if (typeof window.renderProduk === 'function') window.renderProduk();
          if (typeof window.updateDashboard === 'function') window.updateDashboard();
          showSyncBadge('synced');
        }
      }
    },
    (err) => console.error('produk listener error:', err)
  );

  // Listener: Laporan
  const unsubLaporan = onSnapshot(
    tokoDoc('config/laporan'),
    (snap) => {
      if (snap.exists() && snap.data().list) {
        const newList = snap.data().list;
        if (JSON.stringify(newList) !== JSON.stringify(window.laporan)) {
          window.laporan = newList;
          if (typeof window.renderLaporan === 'function') window.renderLaporan();
          if (typeof window.updateDashboard === 'function') window.updateDashboard();
        }
      }
    },
    (err) => console.error('laporan listener error:', err)
  );

  // Listener: Riwayat
  const unsubRiwayat = onSnapshot(
    tokoDoc('config/riwayat'),
    (snap) => {
      if (snap.exists() && snap.data().list) {
        const newList = snap.data().list;
        if (JSON.stringify(newList) !== JSON.stringify(window.riwayat)) {
          window.riwayat = newList;
          if (typeof window.renderRiwayat === 'function') window.renderRiwayat();
        }
      }
    },
    (err) => console.error('riwayat listener error:', err)
  );

  // Listener: Pengaturan
  const unsubPengaturan = onSnapshot(
    tokoDoc('config/pengaturan'),
    (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        if (JSON.stringify(data) !== JSON.stringify(window.pengaturan)) {
          window.pengaturan = { ...window.pengaturan, ...data };
          if (typeof window.terapkanPengaturan === 'function') window.terapkanPengaturan();
        }
      }
    },
    (err) => console.error('pengaturan listener error:', err)
  );

  window.FB.listeners.push(unsubProduk, unsubLaporan, unsubRiwayat, unsubPengaturan);
};

/* ══════════════════════════════════════════
   SIMPAN KE FIRESTORE
   Menggantikan / melengkapi simpanData() di app.js
══════════════════════════════════════════ */

/** Simpan produk ke Firestore */
window.fbSimpanProduk = async function() {
  if (!window.FB.uid) return;
  try {
    await setDoc(tokoDoc('config/produk'), {
      list: window.produk,
      updatedAt: serverTimestamp()
    });
  } catch(e) { console.error('fbSimpanProduk:', e); }
};

/** Simpan laporan ke Firestore */
window.fbSimpanLaporan = async function() {
  if (!window.FB.uid) return;
  try {
    await setDoc(tokoDoc('config/laporan'), {
      list: window.laporan,
      updatedAt: serverTimestamp()
    });
  } catch(e) { console.error('fbSimpanLaporan:', e); }
};

/** Simpan riwayat ke Firestore */
window.fbSimpanRiwayat = async function() {
  if (!window.FB.uid) return;
  try {
    await setDoc(tokoDoc('config/riwayat'), {
      list: window.riwayat,
      updatedAt: serverTimestamp()
    });
  } catch(e) { console.error('fbSimpanRiwayat:', e); }
};

/** Simpan statistik ke Firestore */
window.fbSimpanStatistik = async function() {
  if (!window.FB.uid) return;
  try {
    await setDoc(tokoDoc('config/statistik'), {
      data: window.statistikProduk,
      updatedAt: serverTimestamp()
    });
  } catch(e) { console.error('fbSimpanStatistik:', e); }
};

/** Simpan pengaturan ke Firestore */
window.fbSimpanPengaturan = async function() {
  if (!window.FB.uid) return;
  try {
    await setDoc(tokoDoc('config/pengaturan'), {
      ...window.pengaturan,
      updatedAt: serverTimestamp()
    });
  } catch(e) { console.error('fbSimpanPengaturan:', e); }
};

/** Simpan semua data sekaligus (batch) */
window.fbSimpanSemua = async function() {
  if (!window.FB.uid) return;
  showSyncBadge('syncing');
  try {
    const batch = writeBatch(db);
    batch.set(tokoDoc('config/produk'),     { list: window.produk, updatedAt: serverTimestamp() });
    batch.set(tokoDoc('config/laporan'),    { list: window.laporan, updatedAt: serverTimestamp() });
    batch.set(tokoDoc('config/riwayat'),    { list: window.riwayat, updatedAt: serverTimestamp() });
    batch.set(tokoDoc('config/statistik'),  { data: window.statistikProduk, updatedAt: serverTimestamp() });
    batch.set(tokoDoc('config/pengaturan'), { ...window.pengaturan, updatedAt: serverTimestamp() });
    await batch.commit();
    showSyncBadge('synced');
  } catch(e) {
    console.error('fbSimpanSemua:', e);
    showSyncBadge('error');
  }
};

/* ══════════════════════════════════════════
   SYNC BADGE UI
══════════════════════════════════════════ */
function showSyncBadge(status) {
  let badge = document.getElementById('fbSyncBadge');
  if (!badge) {
    badge = document.createElement('div');
    badge.id = 'fbSyncBadge';
    badge.style.cssText = `
      position:fixed; top:12px; right:12px; z-index:9999;
      padding:5px 12px; border-radius:20px; font-size:11px;
      font-weight:700; font-family:'Plus Jakarta Sans',sans-serif;
      display:flex; align-items:center; gap:6px;
      transition: all 0.3s ease; pointer-events:none;
      box-shadow: 0 2px 8px rgba(0,0,0,0.3);
    `;
    document.body.appendChild(badge);
  }

  const cfg = {
    online:  { bg: '#22c55e', color: '#fff', icon: '☁️', text: 'Online' },
    offline: { bg: '#4b5563', color: '#ccc', icon: '📴', text: 'Offline' },
    syncing: { bg: '#f5c542', color: '#111', icon: '⏳', text: 'Menyimpan...' },
    synced:  { bg: '#22c55e', color: '#fff', icon: '✅', text: 'Tersinkron' },
    error:   { bg: '#ef4444', color: '#fff', icon: '⚠️', text: 'Error sync' },
  };

  const c = cfg[status] || cfg.offline;
  badge.style.background = c.bg;
  badge.style.color      = c.color;
  badge.innerHTML        = `${c.icon} <span>${c.text}</span>`;

  // Auto-hide "synced" setelah 3 detik
  if (status === 'synced') {
    clearTimeout(badge._t);
    badge._t = setTimeout(() => showSyncBadge('online'), 3000);
  }
}

/* ══════════════════════════════════════════
   TOAST FIREBASE (terpisah dari app.js)
══════════════════════════════════════════ */
function showFbToast(msg, type) {
  // Gunakan showToast dari app.js kalau ada
  if (typeof window.showToast === 'function') {
    window.showToast(msg, type);
  } else {
    console.log('[FB Toast]', msg);
  }
}

/* ══════════════════════════════════════════
   ERROR MESSAGE HELPER
══════════════════════════════════════════ */
function fbErrMsg(code) {
  const map = {
    'auth/user-not-found':      'Email tidak ditemukan',
    'auth/wrong-password':      'Password salah',
    'auth/invalid-email':       'Format email tidak valid',
    'auth/too-many-requests':   'Terlalu banyak percobaan, coba lagi nanti',
    'auth/network-request-failed': 'Tidak ada koneksi internet',
    'auth/invalid-credential':  'Email atau password salah',
  };
  return map[code] || 'Error: ' + code;
}

/* ══════════════════════════════════════════
   MODAL LOGIN FIREBASE (untuk Owner)
   Muncul sebagai tombol tambahan di topbar
══════════════════════════════════════════ */
window.bukaLoginFirebase = function() {
  if (!window.Swal) return;

  if (window.FB.uid) {
    // Sudah login — tawarkan logout
    Swal.fire({
      title: '☁️ Keluar dari Cloud?',
      html: `<p style="color:#8892a4;font-size:13px">Data tetap tersimpan lokal.<br>Realtime sync akan berhenti.</p>`,
      icon: 'question',
      background: '#171b24', color: '#e8eaf0',
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
        Login dengan akun Firebase untuk sinkronisasi data antar perangkat.
      </p>
      <input type="email" id="fb-email" class="swal2-input"
        placeholder="Email owner" autocomplete="email">
      <input type="password" id="fb-password" class="swal2-input"
        placeholder="Password" autocomplete="current-password">
    `,
    background: '#171b24', color: '#e8eaf0',
    confirmButtonText: '🔑 Login',
    confirmButtonColor: '#f5c542',
    showCancelButton: true,
    cancelButtonText: 'Batal',
    preConfirm: async () => {
      const email    = document.getElementById('fb-email').value.trim();
      const password = document.getElementById('fb-password').value;
      if (!email || !password) {
        Swal.showValidationMessage('Email dan password wajib diisi');
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
    if (r.isConfirmed) {
      showFbToast('✅ Login berhasil! Data cloud sedang dimuat...', 'success');
    }
  });
};

/* ══════════════════════════════════════════
   PATCH simpanData() di app.js
   Setelah simpan lokal, juga simpan ke Firebase
   (dipanggil otomatis karena di-patch di sini)
══════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', () => {
  // Tunggu app.js selesai init, lalu patch simpanData
  setTimeout(() => {
    const originalSimpanData = window.simpanData;
    if (typeof originalSimpanData === 'function') {
      window.simpanData = function() {
        // 1. Simpan ke localStorage (seperti biasa)
        originalSimpanData.call(this);
        // 2. Simpan ke Firebase (jika online)
        if (window.FB.uid) {
          window.fbSimpanSemua();
        }
      };
    }

    // Tambah tombol Cloud ke topbar
    injectCloudButton();
  }, 500);
});

/* ══════════════════════════════════════════
   INJECT TOMBOL CLOUD KE TOPBAR
══════════════════════════════════════════ */
function injectCloudButton() {
  const topbarActions = document.querySelector('.topbar-actions');
  if (!topbarActions) return;

  const btn = document.createElement('button');
  btn.id = 'btnCloudLogin';
  btn.onclick = window.bukaLoginFirebase;
  btn.innerHTML = `☁️ <span class="btn-label">Cloud</span>`;
  btn.style.cssText = `
    background: rgba(99,102,241,0.15);
    border-color: rgba(99,102,241,0.4);
    color: #818cf8;
  `;

  // Sisipkan sebelum tombol Sheets
  const sheetsBtn = topbarActions.querySelector('button:last-child');
  topbarActions.insertBefore(btn, sheetsBtn);

  // Update tampilan tombol berdasarkan status auth
  onAuthStateChanged(auth, (user) => {
    if (user) {
      btn.innerHTML = `✅ <span class="btn-label">Cloud</span>`;
      btn.style.background   = 'rgba(34,197,94,0.15)';
      btn.style.borderColor  = 'rgba(34,197,94,0.4)';
      btn.style.color        = '#22c55e';
      btn.title = 'Login sebagai: ' + (user.email || user.uid);
    } else {
      btn.innerHTML = `☁️ <span class="btn-label">Cloud</span>`;
      btn.style.background  = 'rgba(99,102,241,0.15)';
      btn.style.borderColor = 'rgba(99,102,241,0.4)';
      btn.style.color       = '#818cf8';
      btn.title = 'Login untuk sinkronisasi cloud';
    }
  });
}

/* ══════════════════════════════════════════
   EXPORT untuk diakses dari app.js jika perlu
══════════════════════════════════════════ */
export { auth, db, firebaseConfig };
