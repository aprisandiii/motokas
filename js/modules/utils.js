// ============================================================
//  MotoKas — modules/utils.js  (Bug-fix patch)
//  BUG FIX:
//  1. toast: class di-reset dulu sebelum set baru (biar animasi muncul ulang)
//  2. openModal: reset edit-produk-id saat buka modal tambah baru
//  3. closeModal: selalu bersihkan edit-produk-id saat tutup modal produk
//  4. fmtRpShort: nilai negatif tidak crash
//  5. showKonfirmasiHapus: overlay bisa di-stack tanpa id collision
// ============================================================

export function fmtRp(n) {
  return 'Rp ' + Math.round(n || 0).toLocaleString('id-ID');
}

export function fmtRpShort(n) {
  n = Math.round(n || 0);
  const abs = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  if (abs >= 1_000_000) return sign + 'Rp ' + (abs / 1_000_000).toFixed(1) + 'jt';
  if (abs >= 1_000)     return sign + 'Rp ' + Math.floor(abs / 1_000) + 'rb';
  return sign + 'Rp ' + abs;
}

export function tglKey(date) {
  return (date || new Date()).toISOString().split('T')[0];
}

export function tglDisplay(isoKey) {
  const [y, m, dd] = isoKey.split('-');
  return `${parseInt(dd)}/${parseInt(m)}/${y}`;
}

export function tglKeyFromLocale(waktuStr) {
  if (!waktuStr) return null;
  try {
    const match = waktuStr.match(/(\d{1,2})[\/.](\d{1,2})[\/.](\d{4})/);
    if (match) {
      const [, dd, mm, yyyy] = match;
      return `${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`;
    }
  } catch { /* ignore */ }
  return null;
}

// BUG FIX #1: reset class dulu supaya animasi re-trigger setiap kali dipanggil
export function toast(msg, type = '') {
  const el = document.getElementById('toast');
  if (!el) return;
  el.className = 'toast'; // reset
  void el.offsetWidth;    // force reflow
  el.textContent = msg;
  el.className   = 'toast show ' + type;
  clearTimeout(window._toastTimeout);
  window._toastTimeout = setTimeout(() => { el.className = 'toast'; }, 2800);
}

// BUG FIX #2: reset field & edit-produk-id saat buka modal tambah baru
export function openModal(id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.classList.add('show');
  if (id === 'modal-tambah-produk') {
    const editIdEl = document.getElementById('edit-produk-id');
    const editId   = editIdEl?.value;
    if (!editId) {
      if (editIdEl) editIdEl.value = '';
      document.getElementById('modal-produk-title').textContent = 'Tambah Produk';
      ['prod-nama','prod-hpp','prod-harga','prod-stok','prod-minstok','prod-sku']
        .forEach(i => { const e = document.getElementById(i); if (e) e.value = ''; });
      const cat = document.getElementById('prod-cat');
      if (cat) cat.value = '';
      const delRow = document.getElementById('edit-delete-row');
      if (delRow) delRow.style.display = 'none';
    }
  }
}

// BUG FIX #3: selalu clear edit-produk-id saat modal ditutup
export function closeModal(id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.classList.remove('show');
  if (id === 'modal-tambah-produk') {
    const editId = document.getElementById('edit-produk-id');
    if (editId) editId.value = '';
  }
}

export function showKonfirmasiHapus(judul, pesan, katakunci, onKonfirm) {
  // BUG FIX #5: hapus overlay lama jika ada (cegah duplikasi)
  document.getElementById('konfirm-hapus-overlay')?.remove();

  const overlay = document.createElement('div');
  overlay.id        = 'konfirm-hapus-overlay';
  overlay.className = 'overlay-fullscreen';
  overlay.innerHTML = `
    <div class="dialog-card dialog-danger">
      <div class="dialog-icon">⚠️</div>
      <h3>${judul}</h3>
      <p>${pesan}</p>
      <p class="konfirm-hint">Ketik <strong>${katakunci}</strong> untuk konfirmasi:</p>
      <input id="konfirm-hapus-input" type="text" class="dialog-input"
             placeholder="Ketik di sini..." autocomplete="off">
      <div class="dialog-actions">
        <button id="konfirm-hapus-cancel">Batal</button>
        <button id="konfirm-hapus-ok" class="btn-danger-solid" disabled>Konfirmasi</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);

  const input     = overlay.querySelector('#konfirm-hapus-input');
  const okBtn     = overlay.querySelector('#konfirm-hapus-ok');
  const cancelBtn = overlay.querySelector('#konfirm-hapus-cancel');

  input.addEventListener('input', () => {
    const valid = input.value.trim() === katakunci;
    okBtn.disabled          = !valid;
    okBtn.dataset.active    = valid ? '1' : '';
  });
  okBtn.addEventListener('click',     () => { overlay.remove(); onKonfirm(); });
  cancelBtn.addEventListener('click', () => overlay.remove());
  overlay.addEventListener('click',   e  => { if (e.target === overlay) overlay.remove(); });
  setTimeout(() => input.focus(), 100);
}

export function formatSisa(detik) {
  const m = Math.floor(detik / 60);
  const d = detik % 60;
  return m > 0 ? `${m}m ${d}d` : `${d}d`;
}

export function getCatIcon(cat) {
  const icons = {
    'Oli': '🛢️', 'Spare Part': '⚙️', 'Aksesoris': '🔩',
    'Ban': '🔄', 'Aki': '🔋', 'Lainnya': '📦', 'Jasa Servis': '🔧',
  };
  return icons[cat] || '📦';
}

export function downloadFile(name, content, type) {
  const a    = document.createElement('a');
  a.href     = URL.createObjectURL(new Blob([content], { type }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
