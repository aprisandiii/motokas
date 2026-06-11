// ============================================================
//  MotoKas — modules/screen.js
//  Manajemen tampilan layar (auth, pin, app) dan navigasi tab
// ============================================================
import { getData } from './storage.js';

const SCREEN_IDS = { auth: 'auth-screen', pin: 'pin-screen', app: 'app' };

export function showScreen(name) {
  Object.entries(SCREEN_IDS).forEach(([key, id]) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.style.display = key === name
      ? (name === 'app' ? 'block' : 'flex')
      : 'none';
  });
  // Atur z-index install banner
  const banner = document.getElementById('install-banner');
  if (banner) banner.style.zIndex = name === 'app' ? '1000' : '-1';
  // Bersihkan overlay jika pindah ke auth/pin
  if (name === 'pin' || name === 'auth') {
    document.getElementById('force-pin-overlay')?.remove();
    document.getElementById('reset-confirm-overlay')?.remove();
  }
  if (name === 'pin') {
    // Reset state PIN — dilakukan di pin.js via initPinLockState()
    const s = getData('settings', {});
    if (document.getElementById('pin-store-name'))
      document.getElementById('pin-store-name').textContent = s.nama || 'Nama Toko';
    if (document.getElementById('pin-store-addr'))
      document.getElementById('pin-store-addr').textContent = s.alamat || 'Masukkan PIN untuk membuka kasir';
  }
}

export function navTo(page, btn) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.getElementById('page-' + page)?.classList.add('active');
  btn?.classList.add('active');
}
