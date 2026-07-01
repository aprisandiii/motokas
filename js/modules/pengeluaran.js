// ══════════════════════════════════════════════════════
//  MotoKas — modules/pengeluaran.js
//  Fitur pencatatan pengeluaran harian
// ══════════════════════════════════════════════════════
import { getData, setData }         from './storage.js';
import { toast, fmtRp, tglKey }     from './utils.js';

const KATEGORI = [
  { id: 'stok',       label: '📦 Beli Stok',           warna: '#818cf8' },
  { id: 'operasional',label: '🔌 Operasional',          warna: '#60a5fa' },
  { id: 'gaji',       label: '👷 Gaji Karyawan',        warna: '#34d399' },
  { id: 'lainnya',    label: '📝 Lain-lain',            warna: '#f59e0b' },
];

function getTglKey() { return tglKey(new Date()); }

function getPengeluaranHariIni() {
  const all = getData('pengeluaran', {});
  return all[getTglKey()] || [];
}

export function renderPengeluaran() {
  const list    = getPengeluaranHariIni();
  const sumEl   = document.getElementById('pengeluaran-summary');
  const listEl  = document.getElementById('pengeluaran-list');
  if (!sumEl || !listEl) return;

  const total = list.reduce((s, e) => s + (e.nominal || 0), 0);

  // Summary per kategori
  const perKat = {};
  list.forEach(e => {
    if (!perKat[e.kategori]) perKat[e.kategori] = 0;
    perKat[e.kategori] += e.nominal || 0;
  });

  sumEl.innerHTML = total === 0
    ? `<div class="pengeluaran-kosong">Belum ada pengeluaran hari ini</div>`
    : `<div class="pengeluaran-total-row">
        <span>Total Pengeluaran</span>
        <span class="pengeluaran-total-val">${fmtRp(total)}</span>
       </div>
       <div class="pengeluaran-kat-grid">
        ${KATEGORI.filter(k => perKat[k.id]).map(k => `
          <div class="pengeluaran-kat-chip" style="border-color:${k.warna}20;background:${k.warna}12">
            <span>${k.label}</span>
            <span style="color:${k.warna};font-weight:700">${fmtRp(perKat[k.id])}</span>
          </div>`).join('')}
       </div>`;

  // List item pengeluaran
  listEl.innerHTML = list.length === 0 ? '' : list.slice().reverse().map((e, i) => {
    const kat = KATEGORI.find(k => k.id === e.kategori) || KATEGORI[3];
    const idx = list.length - 1 - i;
    return `
    <div class="pengeluaran-item">
      <div class="pengeluaran-item-left">
        <span class="pengeluaran-kat-badge" style="background:${kat.warna}20;color:${kat.warna}">${kat.label}</span>
        <div class="pengeluaran-keterangan">${escHtml(e.keterangan || '-')}</div>
        <div class="pengeluaran-waktu">${e.waktu || ''}</div>
      </div>
      <div class="pengeluaran-item-right">
        <div class="pengeluaran-nominal">${fmtRp(e.nominal)}</div>
        <button class="btn-hapus-keluar" onclick="window._pengeluaranModule.hapusPengeluaran(${idx})" title="Hapus">🗑</button>
      </div>
    </div>`;
  }).join('');
}

export function bukaFormPengeluaran() {
  document.getElementById('form-pengeluaran-overlay')?.remove();
  const overlay = document.createElement('div');
  overlay.id        = 'form-pengeluaran-overlay';
  overlay.className = 'overlay-fullscreen';
  overlay.innerHTML = `
    <div class="dialog-card">
      <div class="dialog-icon">💸</div>
      <h3>Tambah Pengeluaran</h3>

      <label>Kategori</label>
      <select id="keluar-kategori" class="dialog-input">
        ${KATEGORI.map(k => `<option value="${k.id}">${k.label}</option>`).join('')}
      </select>

      <label style="margin-top:10px">Keterangan</label>
      <input type="text" id="keluar-keterangan" class="dialog-input"
             placeholder="Contoh: Bayar listrik, beli oli...">

      <label style="margin-top:10px">Nominal (Rp)</label>
      <input type="number" id="keluar-nominal" class="dialog-input"
             placeholder="0" min="0">

      <div class="dialog-actions" style="margin-top:14px">
        <button onclick="document.getElementById('form-pengeluaran-overlay').remove()">Batal</button>
        <button style="background:var(--accent);color:#000;font-weight:700;border:none"
                onclick="window._pengeluaranModule.simpanPengeluaran()">Simpan</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
  setTimeout(() => document.getElementById('keluar-keterangan')?.focus(), 100);
}

export function simpanPengeluaran() {
  const kategori    = document.getElementById('keluar-kategori')?.value || 'lainnya';
  const keterangan  = document.getElementById('keluar-keterangan')?.value.trim() || '';
  const nominal     = parseFloat(document.getElementById('keluar-nominal')?.value) || 0;

  if (nominal <= 0) { toast('Masukkan nominal pengeluaran', 'error'); return; }
  if (!keterangan)  { toast('Masukkan keterangan pengeluaran', 'error'); return; }

  const tgl  = getTglKey();
  const all  = getData('pengeluaran', {});
  if (!all[tgl]) all[tgl] = [];

  all[tgl].push({
    kategori,
    keterangan,
    nominal,
    waktu: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }),
  });
  setData('pengeluaran', all);

  document.getElementById('form-pengeluaran-overlay')?.remove();
  toast('Pengeluaran dicatat ✓', 'success');
  renderPengeluaran();
  if (typeof window.renderDashboard === 'function') window.renderDashboard();
}

export function hapusPengeluaran(idx) {
  const tgl = getTglKey();
  const all = getData('pengeluaran', {});
  if (!all[tgl] || !all[tgl][idx]) return;
  if (!confirm('Hapus pengeluaran ini?')) return;
  all[tgl].splice(idx, 1);
  setData('pengeluaran', all);
  toast('Pengeluaran dihapus', 'success');
  renderPengeluaran();
  if (typeof window.renderDashboard === 'function') window.renderDashboard();
}

// Update stat card laba di dashboard — kurangi pengeluaran hari ini
export function updateStatPengeluaran() {
  const list  = getPengeluaranHariIni();
  const total = list.reduce((s, e) => s + (e.nominal || 0), 0);
  const el    = document.getElementById('stat-pengeluaran');
  if (el) el.textContent = fmtRp(total);
}

function escHtml(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

window._pengeluaranModule = {
  bukaFormPengeluaran,
  simpanPengeluaran,
  hapusPengeluaran,
  renderPengeluaran,
  updateStatPengeluaran,
};
