// ============================================================
//  MotoKas — modules/onboarding.js  (BARU v5.5)
//  Tutorial interaktif untuk user baru
//  Fitur:
//  - Tour step-by-step dengan highlight elemen
//  - Tooltip posisi otomatis (atas/bawah/kiri/kanan)
//  - Progress bar
//  - Bisa skip kapan saja
//  - Simpan status di localStorage
//  - Bisa diulang dari Pengaturan
// ============================================================
import { getData, setData } from './storage.js';

// ── DEFINISI TOUR STEPS ───────────────────────────────────

const TOUR_STEPS = [
  {
    title:   '👋 Selamat Datang di MotoKas!',
    content: 'Aplikasi kasir digital untuk bengkel motor Anda. Kami akan memandu Anda mengenal fitur-fitur utama. Proses ini hanya butuh 1 menit.',
    target:  null, // full screen intro
    pos:     'center',
  },
  {
    title:   '🏠 Dashboard',
    content: 'Di sini Anda bisa melihat ringkasan omzet, laba, dan transaksi hari ini. Chart 7 hari dan produk terlaris juga tampil di sini.',
    target:  '.nav-item:nth-child(1)',
    pos:     'top',
    action:  () => { document.querySelector('.nav-item:nth-child(1)')?.click(); },
  },
  {
    title:   '📦 Produk',
    content: 'Kelola semua produk dan spare part di sini. Tap tombol ＋ untuk tambah produk baru. Anda bisa set harga modal (HPP), harga jual, dan minimum stok.',
    target:  '.nav-item:nth-child(2)',
    pos:     'top',
    action:  () => { document.querySelector('.nav-item:nth-child(2)')?.click(); },
  },
  {
    title:   '＋ Tambah Produk',
    content: 'Tap tombol kuning ini untuk menambah produk baru. Isi nama, kategori, harga, dan stok awal.',
    target:  '.fab',
    pos:     'top',
    action:  () => { document.querySelector('.nav-item:nth-child(2)')?.click(); },
  },
  {
    title:   '🛒 Kasir',
    content: 'Ini adalah halaman transaksi. Tambah produk dari tab Produk, atau tambah jasa servis langsung di sini. Pilih metode bayar lalu proses checkout.',
    target:  '.nav-item:nth-child(3)',
    pos:     'top',
    action:  () => { document.querySelector('.nav-item:nth-child(3)')?.click(); },
  },
  {
    title:   '🔧 Jasa Servis',
    content: 'Anda bisa tambah jasa servis langsung tanpa produk — isi nama jasa, harga, dan nama mekanik. Laporan per mekanik akan otomatis tercatat.',
    target:  '#jasa-nama',
    pos:     'bottom',
    action:  () => { document.querySelector('.nav-item:nth-child(3)')?.click(); },
  },
  {
    title:   '📊 Laporan',
    content: 'Lihat laporan harian, mingguan, atau bulanan di sini. Gunakan preset periode untuk filter cepat. Data bisa di-export ke CSV atau TXT.',
    target:  '.nav-item:nth-child(4)',
    pos:     'top',
    action:  () => { document.querySelector('.nav-item:nth-child(4)')?.click(); },
  },
  {
    title:   '⚙️ Pengaturan',
    content: 'Isi nama toko, alamat, dan nomor telepon untuk ditampilkan di struk. Anda juga bisa ganti PIN dan mengatur koneksi Google Sheets.',
    target:  '.nav-item:nth-child(5)',
    pos:     'top',
    action:  () => { document.querySelector('.nav-item:nth-child(5)')?.click(); },
  },
  {
    title:   '🔑 Keamanan PIN',
    content: 'Aplikasi terkunci dengan PIN 4 digit. Setelah 5x salah, terkunci 5 menit. Anda bisa reset PIN lewat kode rahasia yang diset di Pengaturan.',
    target:  '#set-kode-rahasia',
    pos:     'bottom',
    action:  () => { document.querySelector('.nav-item:nth-child(5)')?.click(); },
  },
  {
    title:   '☁️ Sinkronisasi Cloud',
    content: 'Data Anda otomatis tersimpan di cloud via Firebase. Jika offline, data tetap tersimpan lokal dan akan disinkronkan saat online kembali.',
    target:  null,
    pos:     'center',
  },
  {
    title:   '✅ Siap Digunakan!',
    content: 'Anda sudah mengenal semua fitur utama MotoKas. Mulai dengan menambahkan produk, lalu coba transaksi pertama Anda!\n\nTips: Anda bisa mengulang tutorial ini kapan saja dari menu Pengaturan.',
    target:  null,
    pos:     'center',
    isLast:  true,
  },
];

// ── STATE ─────────────────────────────────────────────────
let currentStep  = 0;
let overlay      = null;
let spotlight    = null;
let tooltip      = null;
let isRunning    = false;

// ── API ───────────────────────────────────────────────────

/** Mulai tour — dipanggil otomatis jika user baru */
export function startTour(force = false) {
  if (isRunning) return;
  const sudahLihat = getData('_tour_done', false);
  if (sudahLihat && !force) return;
  isRunning    = true;
  currentStep  = 0;
  buildTourDOM();
  showStep(0);
}

/** Cek apakah perlu tampilkan tour (user baru) */
export function cekTourBaru() {
  const sudahLihat = getData('_tour_done', false);
  const produk     = getData('produk', []);
  // Tampilkan jika belum pernah lihat tour DAN belum punya produk
  if (!sudahLihat && produk.length === 0) {
    setTimeout(() => startTour(), 1000);
  }
}

/** Reset tour agar bisa diulang */
export function resetTour() {
  setData('_tour_done', false);
  startTour(true);
}

// ── RENDER ────────────────────────────────────────────────

function buildTourDOM() {
  // Hapus tour lama jika ada
  destroyTour();

  // Overlay gelap
  overlay = document.createElement('div');
  overlay.id        = 'tour-overlay';
  overlay.className = 'tour-overlay';

  // Spotlight (lubang transparan)
  spotlight = document.createElement('div');
  spotlight.id        = 'tour-spotlight';
  spotlight.className = 'tour-spotlight';

  // Tooltip
  tooltip = document.createElement('div');
  tooltip.id        = 'tour-tooltip';
  tooltip.className = 'tour-tooltip';

  document.body.appendChild(overlay);
  document.body.appendChild(spotlight);
  document.body.appendChild(tooltip);

  // Klik overlay = skip
  overlay.addEventListener('click', skipTour);
}

function showStep(index) {
  if (!isRunning || index >= TOUR_STEPS.length) {
    finishTour(); return;
  }
  currentStep  = index;
  const step   = TOUR_STEPS[index];
  const total  = TOUR_STEPS.length;
  const pct    = Math.round(((index) / (total - 1)) * 100);

  // Jalankan action step (pindah halaman)
  if (step.action) {
    try { step.action(); } catch { /* ignore */ }
  }

  // Highlight target
  if (step.target) {
    setTimeout(() => positionSpotlight(step), 300);
  } else {
    hideSpotlight();
  }

  // Render tooltip
  tooltip.innerHTML = `
    <div class="tour-progress-bar">
      <div class="tour-progress-fill" style="width:${pct}%"></div>
    </div>
    <div class="tour-step-count">${index + 1} / ${total}</div>
    <div class="tour-title">${step.title}</div>
    <div class="tour-content">${step.content.replace(/\n/g, '<br>')}</div>
    <div class="tour-actions">
      <button class="tour-btn-skip" onclick="window._tourModule.skipTour()">
        ${step.isLast ? '' : 'Lewati Tour'}
      </button>
      <div style="display:flex;gap:8px">
        ${index > 0
          ? `<button class="tour-btn-prev" onclick="window._tourModule.prevStep()">← Kembali</button>`
          : ''}
        <button class="tour-btn-next" onclick="window._tourModule.nextStep()">
          ${step.isLast ? '🎉 Mulai Pakai!' : 'Lanjut →'}
        </button>
      </div>
    </div>`;

  // Posisi tooltip
  if (step.pos === 'center' || !step.target) {
    tooltip.className = 'tour-tooltip tour-tooltip-center';
  } else {
    tooltip.className = 'tour-tooltip';
    setTimeout(() => positionTooltip(step), 350);
  }

  // Animasi masuk
  tooltip.style.opacity = '0';
  tooltip.style.transform = 'scale(0.92)';
  requestAnimationFrame(() => {
    tooltip.style.transition = 'opacity 0.25s ease, transform 0.25s ease';
    tooltip.style.opacity    = '1';
    tooltip.style.transform  = 'scale(1)';
  });
}

function positionSpotlight(step) {
  const el = document.querySelector(step.target);
  if (!el) { hideSpotlight(); return; }

  const rect    = el.getBoundingClientRect();
  const pad     = 8;
  spotlight.style.cssText = `
    display: block;
    top:    ${rect.top    - pad + window.scrollY}px;
    left:   ${rect.left   - pad}px;
    width:  ${rect.width  + pad * 2}px;
    height: ${rect.height + pad * 2}px;
    border-radius: 10px;
  `;
}

function hideSpotlight() {
  if (spotlight) spotlight.style.display = 'none';
}

function positionTooltip(step) {
  const el = document.querySelector(step.target);
  if (!el) {
    tooltip.className = 'tour-tooltip tour-tooltip-center'; return;
  }
  const rect     = el.getBoundingClientRect();
  const tRect    = tooltip.getBoundingClientRect();
  const vw       = window.innerWidth;
  const vh       = window.innerHeight;
  const pad      = 12;
  let top, left;

  if (step.pos === 'top' && rect.top > tRect.height + pad * 2) {
    // Atas elemen
    top  = rect.top - tRect.height - pad + window.scrollY;
    left = Math.max(pad, Math.min(rect.left + rect.width / 2 - tRect.width / 2, vw - tRect.width - pad));
    tooltip.dataset.arrow = 'bottom';
  } else {
    // Bawah elemen
    top  = rect.bottom + pad + window.scrollY;
    left = Math.max(pad, Math.min(rect.left + rect.width / 2 - tRect.width / 2, vw - tRect.width - pad));
    tooltip.dataset.arrow = 'top';
  }
  tooltip.style.top  = `${top}px`;
  tooltip.style.left = `${left}px`;
  tooltip.style.transform = 'none';
}

// ── NAVIGASI ──────────────────────────────────────────────

export function nextStep() {
  if (currentStep < TOUR_STEPS.length - 1) showStep(currentStep + 1);
  else finishTour();
}

export function prevStep() {
  if (currentStep > 0) showStep(currentStep - 1);
}

export function skipTour() {
  finishTour();
}

function finishTour() {
  isRunning = false;
  setData('_tour_done', true);
  destroyTour();
  // Kembali ke dashboard
  const dashBtn = document.querySelector('.nav-item:nth-child(1)');
  if (dashBtn) dashBtn.click();
}

function destroyTour() {
  document.getElementById('tour-overlay')?.remove();
  document.getElementById('tour-spotlight')?.remove();
  document.getElementById('tour-tooltip')?.remove();
  overlay = spotlight = tooltip = null;
}

window._tourModule = { startTour, nextStep, prevStep, skipTour, resetTour, cekTourBaru };
