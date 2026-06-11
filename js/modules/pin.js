// ============================================================
//  MotoKas — modules/pin.js  (Bug-fix patch)
//  FIX-1: lockUntil countdown timer berjalan di layar PIN (update tiap detik)
//  FIX-2: resetPinPrompt — kode rahasia default seharusnya dari settings
//  FIX-3: gantiPIN — tombol Simpan PIN hanya digit angka
//  FIX-4: checkDefaultPin — tidak muncul ulang jika overlay sudah ada
//  FIX-5: lockApp — hentikan realtime listener dengan benar
// ============================================================
import { getData, setData }       from './storage.js';
import { validasiGantiPIN }         from './validasi.js';
import { toast, closeModal, formatSisa } from './utils.js';
import { showScreen }             from './screen.js';

let currentPin  = '';
let pinAttempts = 0;
let lockUntil   = 0;
let _lockTimer  = null; // FIX-1: timer countdown

export function getPinState()  { return { currentPin, pinAttempts, lockUntil }; }
export function getPinLength() { return currentPin.length; }

export function pinInput(d) {
  if (currentPin.length >= 4) return;
  if (lockUntil && Date.now() < lockUntil) {
    showPinStatus(`🔒 Terkunci ${formatSisa(Math.ceil((lockUntil - Date.now()) / 1000))} lagi`, 'error');
    return;
  }
  currentPin += d;
  updatePinDots();
  if (currentPin.length === 4) setTimeout(checkPin, 200);
}

export function pinDel() {
  if (lockUntil && Date.now() < lockUntil) return;
  currentPin = currentPin.slice(0, -1);
  updatePinDots();
}

export function updatePinDots() {
  for (let i = 0; i < 4; i++) {
    document.getElementById('d' + i)?.classList.toggle('filled', i < currentPin.length);
  }
}

export function showPinStatus(msg, type = '') {
  const el = document.getElementById('pinStatus');
  if (!el) return;
  el.textContent = msg;
  el.className   = 'pin-status ' + type;
}

export function checkPin() {
  const saved = getData('pin', '1234');
  if (currentPin === saved) {
    showPinStatus('✓ Berhasil', 'success');
    pinAttempts = 0;
    setData('_pin_attempts',   0);
    setData('_pin_lock_until', 0);
    lockUntil = 0;
    stopLockTimer();
    setTimeout(() => {
      showScreen('app');
      window._pinPassed = true;
      if (typeof window._appInit === 'function') window._appInit();
      checkDefaultPin();
    }, 300);
  } else {
    pinAttempts++;
    setData('_pin_attempts', pinAttempts);
    const sisaCoba = 5 - pinAttempts;
    if (pinAttempts >= 5) {
      lockUntil = Date.now() + 5 * 60 * 1000;
      setData('_pin_lock_until', lockUntil);
      pinAttempts = 0;
      setData('_pin_attempts', 0);
      startLockTimer(); // FIX-1: mulai countdown
      showPinStatus('🔒 Terkunci 5 menit (5× salah)', 'error');
    } else {
      showPinStatus(`PIN salah — ${sisaCoba} kesempatan lagi`, 'error');
      // Shake animasi dots
      const dots = document.getElementById('pinDots');
      if (dots) {
        dots.style.animation = 'shake 0.4s ease';
        setTimeout(() => { dots.style.animation = ''; }, 400);
      }
    }
    currentPin = '';
    updatePinDots();
  }
}

// FIX-1: countdown timer
function startLockTimer() {
  stopLockTimer();
  _lockTimer = setInterval(() => {
    const sisa = Math.ceil((lockUntil - Date.now()) / 1000);
    if (sisa <= 0) {
      stopLockTimer();
      lockUntil   = 0;
      pinAttempts = 0;
      setData('_pin_lock_until', 0);
      showPinStatus('Masukkan PIN Anda');
    } else {
      showPinStatus(`🔒 Terkunci ${formatSisa(sisa)} lagi`, 'error');
    }
  }, 1000);
}

function stopLockTimer() {
  if (_lockTimer) { clearInterval(_lockTimer); _lockTimer = null; }
}

// FIX-4: cegah overlay dobel
export function checkDefaultPin() {
  if (document.getElementById('force-pin-overlay')) return;
  const saved        = getData('pin', '1234');
  const sudahDiganti = getData('_pin_sudah_diganti', false);
  if (saved === '1234' && !sudahDiganti) showForcePinChangeDialog();
}

function showForcePinChangeDialog() {
  const overlay = document.createElement('div');
  overlay.id        = 'force-pin-overlay';
  overlay.className = 'overlay-fullscreen';
  overlay.innerHTML = `
    <div class="dialog-card dialog-warn">
      <div class="dialog-icon">🔑</div>
      <h3>Ganti PIN Sekarang</h3>
      <p>Anda masih menggunakan <strong>PIN default (1234)</strong>.<br>
         Harap ganti untuk keamanan toko Anda.</p>
      <label>PIN Baru (4 digit angka)</label>
      <input id="fp-baru"   type="password" inputmode="numeric"
             maxlength="4" placeholder="••••" class="dialog-input">
      <label>Konfirmasi PIN Baru</label>
      <input id="fp-konfirm" type="password" inputmode="numeric"
             maxlength="4" placeholder="••••" class="dialog-input">
      <p id="fp-error" class="error-text"></p>
      <button class="btn-primary" style="width:100%"
              onclick="window._pinModule.saveForcedPin()">💾 Simpan PIN Baru</button>
    </div>`;
  document.body.appendChild(overlay);

  // Filter angka saja
  ['fp-baru','fp-konfirm'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('input', function() {
      this.value = this.value.replace(/\D/g, '').slice(0, 4);
    });
    el.addEventListener('keydown', e => {
      if (e.key === 'Enter') saveForcedPin();
    });
  });
  document.getElementById('fp-baru')?.focus();
}

export function saveForcedPin() {
  const baru    = document.getElementById('fp-baru')?.value.trim();
  const konfirm = document.getElementById('fp-konfirm')?.value.trim();
  const errEl   = document.getElementById('fp-error');
  if (!baru || baru.length !== 4 || !/^\d{4}$/.test(baru)) {
    if (errEl) errEl.textContent = 'PIN harus tepat 4 digit angka.'; return;
  }
  if (baru === '1234') {
    if (errEl) errEl.textContent = 'PIN tidak boleh sama dengan default (1234).'; return;
  }
  if (baru !== konfirm) {
    if (errEl) errEl.textContent = 'Konfirmasi PIN tidak cocok.'; return;
  }
  setData('pin', baru);
  setData('_pin_sudah_diganti', true);
  document.getElementById('force-pin-overlay')?.remove();
  toast('✓ PIN berhasil diubah! Harap ingat PIN baru Anda.', 'success');
}

// FIX-3: validasi angka saja + length check
export function gantiPIN() {
  const lama    = document.getElementById('pin-lama')?.value;
  const baru    = document.getElementById('pin-baru')?.value;
  const konfirm = document.getElementById('pin-konfirm')?.value;
  const saved   = getData('pin', '1234');
  if (!validasiGantiPIN()) return;
  if (lama !== saved) { toast('PIN lama salah', 'error'); return; }
  setData('pin', baru);
  setData('_pin_sudah_diganti', true);
  closeModal('modal-pin');
  toast('PIN berhasil diganti ✓', 'success');
  ['pin-lama','pin-baru','pin-konfirm'].forEach(id => {
    const el = document.getElementById(id); if (el) el.value = '';
  });
}

// FIX-2: kode rahasia diambil dari settings
export function resetPinPrompt() {
  const kode    = prompt('Masukkan kode rahasia untuk reset PIN:');
  if (kode === null) return; // user cancel
  const s       = getData('settings', {});
  const rahasia = s.kode_rahasia || 'MOTOR88';
  if (kode.trim() === rahasia) {
    setData('pin', '1234');
    setData('_pin_sudah_diganti', false);
    setData('_pin_lock_until',    0);
    setData('_pin_attempts',      0);
    lockUntil   = 0;
    pinAttempts = 0;
    stopLockTimer();
    currentPin = '';
    updatePinDots();
    showPinStatus('PIN direset ke 1234 ✓', 'success');
  } else {
    toast('Kode rahasia salah', 'error');
  }
}

// FIX-5: hentikan semua listener Firebase saat lock
export function lockApp() {
  window._pinPassed = false;
  stopLockTimer();
  // Hentikan realtime listener Firebase
  try {
    if (window.FB?.listeners && typeof window._fbOffAll === 'function') {
      window._fbOffAll();
    }
    if (window.FB) {
      window.FB.uid      = null;
      window.FB.isReady  = false;
    }
  } catch (e) { console.warn('lockApp FB:', e); }
  currentPin = '';
  updatePinDots();
  showScreen('pin');
  // Reload auth state setelah lock
  setTimeout(() => {
    initPinLockState();
    const pinSudahDiganti = getData('_pin_sudah_diganti', false);
    const savedPin        = getData('pin', '1234');
    if (!pinSudahDiganti && savedPin === '1234') {
      showPinStatus('PIN default: 1234 — harap ganti!');
    } else {
      showPinStatus('Masukkan PIN Anda');
    }
  }, 50);
}

export function initPinLockState() {
  const savedLock = getData('_pin_lock_until', 0);
  pinAttempts     = getData('_pin_attempts',   0);
  if (savedLock && Date.now() < savedLock) {
    lockUntil = savedLock;
    startLockTimer();
  } else {
    lockUntil = 0;
    setData('_pin_lock_until', 0);
  }
}

window._pinModule = {
  saveForcedPin, pinInput, pinDel, checkPin,
  gantiPIN, resetPinPrompt, lockApp, getPinLength,
};
