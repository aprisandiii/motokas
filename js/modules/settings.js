// ============================================================
//  MotoKas — modules/settings.js  (Bug-fix patch)
//  FIX: saveSettings tidak toast jika dipanggil dari debounce oninput
//       (toast hanya muncul jika dipanggil manual / dari tombol simpan)
//  FIX: versi header diambil dari konstanta, bukan hardcode
// ============================================================
import { getData, setData } from './storage.js';
import { toast }             from './utils.js';
import { validasiSettings }  from './validasi.js';

const APP_VERSION = 'v5.2';

export function loadSettings() {
  const s = getData('settings', {});
  const set = (id, val) => { const el = document.getElementById(id); if (el) el.value = val; };
  set('set-nama',         s.nama         || '');
  set('set-alamat',       s.alamat       || '');
  set('set-telp',         s.telp         || '');
  set('set-footer1',      s.footer1      || 'Terima kasih telah berbelanja!');
  set('set-footer2',      s.footer2      || 'Barang yang sudah dibeli tidak dapat dikembalikan');
  set('set-sheets-url',   s.sheets_url   || '');
  set('set-kode-rahasia', s.kode_rahasia || '');

  updateHeader(s);
  updatePinScreen(s);

  const prefs = getData('prefs', { auto_sheets: false, show_laba: false, stok_alert: true, paper_size: '80mm' });
  setToggleState('toggle-auto-sheets', prefs.auto_sheets);
  setToggleState('toggle-show-laba',   prefs.show_laba);
  setToggleState('toggle-stok-alert',  prefs.stok_alert);
  // Set active paper size button
  const ps = prefs.paper_size || '80mm';
  document.querySelectorAll('.paper-btn').forEach(b => b.classList.toggle('active', b.dataset.size === ps));
  applyPaperSize(ps);
  updateSheetsStatus(!!s.sheets_url);
}

// FIX: saveSettings menerima parameter showToast (default false saat debounce)
export function saveSettings(showToast = false) {
  if (!validasiSettings()) return;
  const val = id => document.getElementById(id)?.value || '';
  const s = {
    nama:         val('set-nama'),
    alamat:       val('set-alamat'),
    telp:         val('set-telp'),
    footer1:      val('set-footer1'),
    footer2:      val('set-footer2'),
    sheets_url:   val('set-sheets-url'),
    kode_rahasia: val('set-kode-rahasia') || 'MOTOR88',
  };
  setData('settings', s);
  updateHeader(s);
  updatePinScreen(s);
  updateSheetsStatus(!!s.sheets_url);
  if (showToast) toast('Pengaturan disimpan ✓', 'success');
}

export function toggleSetting(key, btn) {
  const prefs = getData('prefs', { auto_sheets: false, show_laba: false, stok_alert: true });
  prefs[key]  = !prefs[key];
  setData('prefs', prefs);
  setToggleState(btn.id, prefs[key]);
  toast(`${key === 'auto_sheets' ? 'Auto Sheets' : key === 'show_laba' ? 'Tampilkan Laba' : 'Alert Stok'} ${prefs[key] ? 'aktif' : 'nonaktif'}`);
}

export function setPaperSize(size, btn) {
  const prefs = getData('prefs', { auto_sheets: false, show_laba: false, stok_alert: true, paper_size: '80mm' });
  prefs.paper_size = size;
  setData('prefs', prefs);
  document.querySelectorAll('.paper-btn').forEach(b => b.classList.toggle('active', b.dataset.size === size));
  applyPaperSize(size);
  toast(`Ukuran kertas ${size} dipilih ✓`);
}

export function applyPaperSize(size) {
  // Inject or update a <style> tag for @page and print widths
  let styleEl = document.getElementById('print-size-style');
  if (!styleEl) {
    styleEl = document.createElement('style');
    styleEl.id = 'print-size-style';
    document.head.appendChild(styleEl);
  }
  const contentWidth = size === '58mm' ? '50mm' : '72mm';
  styleEl.textContent = `
    @page { size: ${size} auto; margin: 0; }
    @media print {
      html, body { width: ${size} !important; }
      .nota-area { width: ${contentWidth} !important; }
    }
  `;
}

function updateHeader(s) {
  const name = document.getElementById('hdr-name');
  const sub  = document.getElementById('hdr-sub');
  if (name) name.textContent = s.nama || 'Nama Toko';
  if (sub)  sub.textContent  = (s.alamat ? s.alamat + ' — ' : '') + APP_VERSION;
}

function updatePinScreen(s) {
  const nameEl = document.getElementById('pin-store-name');
  const addrEl = document.getElementById('pin-store-addr');
  if (nameEl) nameEl.textContent = s.nama   || 'Nama Toko';
  if (addrEl) addrEl.textContent = s.alamat || 'Masukkan PIN untuk membuka kasir';
}

export function setToggleState(id, on) {
  document.getElementById(id)?.classList.toggle('on', on);
}

export function updateSheetsStatus(connected) {
  document.getElementById('sheets-dot')?.classList.toggle('connected', connected);
  const text = document.getElementById('sheets-status-text');
  if (text) text.textContent = connected ? 'Terhubung' : 'Belum terhubung';
}
