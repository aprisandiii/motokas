// ============================================================
//  MotoKas — modules/laporan.js  (Bug-fix patch)
//  BUG FIX:
//  1. renderLaporan: filter tanggal tidak ikut timezone offset
//  2. renderRiwayat: void 24 jam gagal jika id lama (bukan timestamp ms)
//  3. voidTransaksi: stok void dikembalikan ke produk dengan benar
//  4. resetAllData: chartInstance harus dihancurkan sebelum reset
//  5. exportCSV: tanda koma dalam nama produk menyebabkan CSV rusak
//  6. renderTerlaris: produk dengan nama sama dari hari berbeda digabung benar
// ============================================================
import { getData, setData, removeData }              from './storage.js';
import { toast, openModal, tglKey, tglDisplay,
         tglKeyFromLocale, fmtRp, fmtRpShort,
         downloadFile, showKonfirmasiHapus }          from './utils.js';
import { updateKritisCount, renderProduk }            from './produk.js';
import { generateNota }                               from './cart.js';

let chartInstance = null;

// ── DASHBOARD ─────────────────────────────────────────────
export function renderDashboard() {
  const laporan = getData('laporan', {});
  const tgl     = tglKey();
  const hari    = laporan[tgl] || { omzet: 0, laba: 0, trx: 0 };
  const setText = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
  setText('stat-omzet', fmtRpShort(hari.omzet));
  setText('stat-laba',  fmtRpShort(hari.laba));
  setText('stat-trx',   hari.trx);
  // FIX: warna laba minus merah
  const labaEl = document.getElementById('stat-laba');
  if (labaEl) labaEl.dataset.minus = hari.laba < 0 ? 'true' : 'false';
  updateKritisCount();
  renderTotalAset();
  renderChart();
  renderTerlaris();
}

export function renderTotalAset() {
  const produk = getData('produk', []);
  let modalTotal = 0;
  let jualTotal  = 0;
  produk.forEach(p => {
    const stok = p.stok || 0;
    modalTotal += (p.hpp   || 0) * stok;
    jualTotal  += (p.harga || 0) * stok;
  });
  const setVal = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
  setVal('stat-aset-modal', fmtRpShort(modalTotal));
  setVal('stat-aset-jual',  fmtRpShort(jualTotal));
  // Potensi laba stok
  const potensi = jualTotal - modalTotal;
  const potensiEl = document.getElementById('stat-aset-potensi');
  if (potensiEl) {
    potensiEl.textContent = fmtRpShort(potensi);
    potensiEl.dataset.minus = potensi < 0 ? 'true' : 'false';
  }
}

export function renderChart() {
  if (typeof Chart === 'undefined') {
    const canvas = document.getElementById('chartOmzet');
    if (canvas) {
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#5a5550'; ctx.font = '12px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('Chart tidak tersedia (offline)', canvas.width / 2, 60);
    }
    return;
  }
  const laporan = getData('laporan', {});
  const days = [], omzetData = [], labaData = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(Date.now() - i * 24 * 3600 * 1000);
    days.push(d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' }));
    const tgl = tglKey(d);
    omzetData.push(laporan[tgl]?.omzet || 0);
    labaData.push(laporan[tgl]?.laba   || 0);
  }
  const canvas = document.getElementById('chartOmzet');
  if (!canvas) return;
  if (chartInstance) { chartInstance.destroy(); chartInstance = null; }
  chartInstance = new Chart(canvas.getContext('2d'), {
    type: 'bar',
    data: {
      labels: days,
      datasets: [
        { label: 'Omzet', data: omzetData, backgroundColor: 'rgba(245,197,66,0.7)', borderRadius: 4 },
        { label: 'Laba',  data: labaData,  backgroundColor: 'rgba(76,175,125,0.7)', borderRadius: 4 },
      ],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { grid: { color: '#2e2e2e' }, ticks: { color: '#5a5550', font: { size: 10 } } },
        y: { grid: { color: '#2e2e2e' }, ticks: { color: '#5a5550', font: { size: 10 },
          callback: v => fmtRpShort(v) } },
      },
    },
  });
}

// BUG FIX #6: gabung terlaris berdasarkan nama (case-insensitive)
export function renderTerlaris() {
  const laporan = getData('laporan', {});
  const now     = new Date();
  const bulan   = now.getMonth();
  const tahun   = now.getFullYear();
  const totalTerjual = {};

  Object.entries(laporan).forEach(([tgl, data]) => {
    let d;
    if (tgl.includes('-')) { d = new Date(tgl + 'T00:00:00'); }
    else {
      const parts = tgl.split('/');
      if (parts.length === 3) d = new Date(parts[2], parts[1] - 1, parts[0]);
    }
    if (d && d.getMonth() === bulan && d.getFullYear() === tahun) {
      Object.values(data.terlaris || {}).forEach(val => {
        const nama = typeof val === 'object' ? val.nama : String(val);
        const qty  = typeof val === 'object' ? val.qty  : 1;
        const key  = nama.toLowerCase().trim();
        if (!totalTerjual[key]) totalTerjual[key] = { nama, qty: 0 };
        totalTerjual[key].qty += qty;
      });
    }
  });

  const sorted = Object.values(totalTerjual).sort((a, b) => b.qty - a.qty).slice(0, 5);
  const el     = document.getElementById('terlaris-list');
  if (!el) return;
  if (sorted.length === 0) {
    el.innerHTML = '<div class="empty-state"><div class="empty-icon">📦</div>Belum ada data penjualan</div>';
    return;
  }
  el.innerHTML = sorted.map((item, i) => `
    <div class="kritis-item" style="margin-bottom:8px">
      <div class="kritis-name">${i + 1}. ${escHtml(item.nama)}</div>
      <span style="font-size:13px;font-weight:700;color:var(--accent)">${item.qty} unit</span>
    </div>`).join('');
}

// ── LAPORAN HARIAN ────────────────────────────────────────
// BUG FIX #1: parse tanggal dengan T00:00:00 agar tidak kena timezone offset
export function renderLaporan() {
  const laporan = getData('laporan', {});
  const dari    = document.getElementById('date-dari')?.value;
  const sampai  = document.getElementById('date-sampai')?.value;

  const entries = Object.entries(laporan).map(([tgl, data]) => {
    let iso, display;
    if (tgl.includes('-')) {
      iso     = tgl;
      display = tglDisplay(tgl);
    } else {
      const parts = tgl.split('/');
      if (parts.length === 3 && parts[2].length === 4) {
        iso     = `${parts[2]}-${parts[1].padStart(2,'0')}-${parts[0].padStart(2,'0')}`;
        display = tgl;
      } else { iso = null; display = tgl; }
    }
    return { tgl: display, iso, ...data };
  }).filter(e => {
    if (!e.iso) return false;
    return (!dari || e.iso >= dari) && (!sampai || e.iso <= sampai);
  }).sort((a, b) => b.iso.localeCompare(a.iso));

  const tbody = document.getElementById('laporan-tbody');
  if (!tbody) return;
  if (entries.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--text3);padding:20px">Belum ada laporan</td></tr>';
    return;
  }
  tbody.innerHTML = entries.map(e => {
    const terlarisArr = Object.entries(e.terlaris || {})
      .map(([k, v]) => [
        typeof v === 'object' ? v.nama : k.replace(/_/g,' '),
        typeof v === 'object' ? v.qty  : v,
      ]).sort((a, b) => b[1] - a[1]);
    const terlaris = terlarisArr[0];
    return `<tr>
      <td>${e.tgl}</td>
      <td style="color:var(--accent)">${fmtRpShort(e.omzet)}</td>
      <td style="color:var(--green)">${fmtRpShort(e.laba)}</td>
      <td>${e.trx}</td>
      <td style="color:var(--text2)">${terlaris ? escHtml(terlaris[0]) : '-'}</td>
    </tr>`;
  }).join('');
  renderLaporanMekanik();
  // Update ringkasan periode (gunakan nilai yang sudah ada di atas)
  if (typeof window.renderRingkasanPeriode === 'function') {
    window.renderRingkasanPeriode(dari, sampai);
  }
}

export function resetDateFilter() {
  const today   = new Date().toISOString().split('T')[0];
  const weekAgo = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString().split('T')[0];
  const fromEl  = document.getElementById('date-dari');
  const toEl    = document.getElementById('date-sampai');
  if (fromEl) fromEl.value = weekAgo;
  if (toEl)   toEl.value   = today;
  renderLaporan();
}

export function renderLaporanMekanik() {
  const riwayat = getData('riwayat', []);
  const now     = new Date();
  const bulan   = now.getMonth();
  const tahun   = now.getFullYear();
  const data    = {};

  riwayat.forEach(trx => {
    if (trx.status === 'void') return;
    const tgl = tglKeyFromLocale(trx.waktu);
    if (!tgl) return;
    const d = new Date(tgl + 'T00:00:00');
    if (d.getMonth() !== bulan || d.getFullYear() !== tahun) return;
    trx.items.forEach(item => {
      if (!item.isJasa || !item.mekanik) return;
      const m = item.mekanik;
      if (!data[m]) data[m] = { nama: m, totalJasa: 0, jumlah: 0 };
      data[m].totalJasa += item.harga * item.qty;
      data[m].jumlah++;
    });
  });

  const el = document.getElementById('laporan-mekanik-list');
  if (!el) return;
  const sorted = Object.values(data).sort((a, b) => b.totalJasa - a.totalJasa);
  if (sorted.length === 0) {
    el.innerHTML = '<div class="empty-state"><div class="empty-icon">🔧</div>Belum ada data jasa bulan ini</div>';
    return;
  }
  el.innerHTML = sorted.map(m => `
    <div class="kritis-item" style="margin-bottom:8px">
      <div>
        <div class="kritis-name">🔧 ${escHtml(m.nama)}</div>
        <div style="font-size:11px;color:var(--text3)">${m.jumlah} pekerjaan</div>
      </div>
      <div style="text-align:right">
        <div style="font-size:14px;font-weight:700;color:var(--accent)">${fmtRp(m.totalJasa)}</div>
      </div>
    </div>`).join('');
}

// ── RIWAYAT ────────────────────────────────────────────────
export function renderRiwayat() {
  const riwayat   = getData('riwayat', []);
  const filterPay = document.getElementById('filter-payment')?.value || '';
  const filterMek = (document.getElementById('filter-mekanik')?.value || '').toLowerCase().trim();
  let filtered = filterPay ? riwayat.filter(r => r.metode === filterPay) : riwayat;
  if (filterMek) {
    filtered = filtered.filter(r =>
      r.items.some(i => i.isJasa && i.mekanik && i.mekanik.toLowerCase().includes(filterMek))
    );
  }
  const el = document.getElementById('riwayat-list');
  if (!el) return;
  if (filtered.length === 0) {
    el.innerHTML = '<div class="empty-state"><div class="empty-icon">🧾</div>Belum ada transaksi</div>';
    return;
  }
  el.innerHTML = filtered.map(r => {
    const isVoid    = r.status === 'void';
    const voidBadge = isVoid ? `<span class="badge-void">VOID</span>` : '';
    const voidInfo  = isVoid
      ? `<div class="void-info">Dibatalkan: ${escHtml(r.void_alasan || '-')}</div>` : '';
    const voidBtn   = !isVoid
      ? `<button class="btn-void" onclick="event.stopPropagation();window._laporanModule.voidTransaksi(${r.id})">🚫 Void</button>` : '';
    return `
    <div class="riwayat-item${isVoid ? ' is-void' : ''}"
         onclick="window._cartModule.lihatDetailTrx(${r.id})" style="cursor:pointer">
      <div class="riwayat-header">
        <div>
          <div style="font-size:13px;font-weight:600">${escHtml(r.kasir || '-')}${voidBadge}</div>
          <div class="riwayat-waktu">${r.waktu}</div>
        </div>
        <div style="text-align:right">
          <div class="riwayat-total ${isVoid ? 'voided' : ''}">${fmtRp(r.total)}</div>
          <span class="badge-payment ${r.metode}">${r.metode.toUpperCase()}</span>
        </div>
      </div>
      <div class="riwayat-detail">
        ${r.items.map(i => `${escHtml(i.nama)} ×${i.qty}`).join(' · ')}
        ${r.diskon > 0 ? `<br>Diskon: ${fmtRp(r.diskon)}` : ''}
      </div>
      ${voidInfo}${voidBtn}
    </div>`;
  }).join('');
}

// ── VOID ──────────────────────────────────────────────────
// BUG FIX #2: cek 24 jam pakai waktu di trx, bukan trx.id
export function voidTransaksi(trxId) {
  const riwayat = getData('riwayat', []);
  const trx     = riwayat.find(r => r.id === trxId);
  if (!trx)                  { toast('Transaksi tidak ditemukan', 'error'); return; }
  if (trx.status === 'void') { toast('Transaksi sudah dibatalkan', 'error'); return; }

  const tglStr   = tglKeyFromLocale(trx.waktu);
  const jamMatch = trx.waktu?.match(/(\d{1,2})[.:](\d{2})/g);
  let waktuTrx   = 0;
  if (tglStr) {
    if (jamMatch && jamMatch.length >= 2) {
      const jamParts = jamMatch[1].replace('.', ':').split(':');
      waktuTrx = new Date(`${tglStr}T${jamParts[0].padStart(2,'0')}:${jamParts[1] || '00'}:00`).getTime();
    } else {
      waktuTrx = new Date(tglStr + 'T00:00:00').getTime();
    }
  } else if (trx.id > 1e12) {
    waktuTrx = trx.id;
  }

  if (waktuTrx && (Date.now() - waktuTrx) / 3600000 > 24) {
    toast('Void hanya bisa dilakukan dalam 24 jam setelah transaksi', 'error'); return;
  }

  document.getElementById('void-overlay')?.remove();
  const overlay = document.createElement('div');
  overlay.id        = 'void-overlay';
  overlay.className = 'overlay-fullscreen';
  overlay.innerHTML = `
    <div class="dialog-card dialog-danger">
      <div class="dialog-icon">🚫</div>
      <h3>Batalkan Transaksi</h3>
      <p>Total: <strong>${fmtRp(trx.total)}</strong><br>
         Waktu: ${trx.waktu}<br>Stok produk akan dikembalikan.</p>
      <label>Alasan void *</label>
      <input id="void-alasan" type="text" class="dialog-input" placeholder="contoh: Salah input qty">
      <div class="dialog-actions">
        <button onclick="document.getElementById('void-overlay').remove()">Batal</button>
        <button class="btn-danger-solid" data-active="0"
                onclick="window._laporanModule.konfirmasiVoid(${trxId})">Batalkan Trx</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
  // Aktifkan tombol jika alasan diisi
  const input = overlay.querySelector('#void-alasan');
  const btn   = overlay.querySelector('.btn-danger-solid');
  input.addEventListener('input', () => {
    const ok = input.value.trim().length > 0;
    btn.disabled      = !ok;
    btn.dataset.active = ok ? '1' : '0';
  });
  btn.disabled = true;
  input.focus();
}

export function konfirmasiVoid(trxId) {
  const alasan = document.getElementById('void-alasan')?.value.trim();
  if (!alasan) { toast('Isi alasan void', 'error'); return; }

  let riwayat = getData('riwayat', []);
  const idx   = riwayat.findIndex(r => r.id === trxId);
  if (idx < 0)                        { toast('Transaksi tidak ditemukan', 'error'); return; }
  if (riwayat[idx].status === 'void') { toast('Sudah dibatalkan', 'error');          return; }

  const trx  = riwayat[idx];
  // BUG FIX #3: kembalikan stok dengan benar
  let produk = getData('produk', []);
  trx.items.forEach(item => {
    if (item.isJasa) return;
    const pidx = produk.findIndex(p => p.id === item.id);
    if (pidx >= 0) {
      produk[pidx].stok    = (produk[pidx].stok    || 0) + item.qty;
      produk[pidx].terjual = Math.max(0, (produk[pidx].terjual || 0) - item.qty);
    }
  });
  setData('produk', produk);

  // Kurangi laporan harian
  const tglTrx = tglKeyFromLocale(trx.waktu);
  if (tglTrx) {
    const laporan = getData('laporan', {});
    if (laporan[tglTrx]) {
      laporan[tglTrx].omzet = Math.max(0, (laporan[tglTrx].omzet || 0) - trx.total);
      laporan[tglTrx].laba  = (laporan[tglTrx].laba  || 0) - (trx.laba || 0);
      laporan[tglTrx].trx   = Math.max(0, (laporan[tglTrx].trx   || 1) - 1);
    }
    setData('laporan', laporan);
  }

  riwayat[idx] = {
    ...trx,
    status:      'void',
    void_alasan: alasan,
    void_waktu:  new Date().toLocaleString('id-ID'),
  };
  setData('riwayat', riwayat);

  document.getElementById('void-overlay')?.remove();
  renderRiwayat(); renderProduk(); renderDashboard();
  toast('Transaksi berhasil dibatalkan ✓', 'success');
}

// ── EXPORT ────────────────────────────────────────────────
// BUG FIX #5: escape koma & kutip di CSV
function csvEsc(str) {
  const s = String(str || '');
  if (s.includes(',') || s.includes('"') || s.includes('\n'))
    return '"' + s.replace(/"/g, '""') + '"';
  return s;
}

export function exportCSV() {
  const laporan = getData('laporan', {});
  let csv = 'Tanggal,Omzet,Laba,Transaksi,Terlaris\n';
  Object.entries(laporan)
    .sort(([a], [b]) => b.localeCompare(a))
    .forEach(([tgl, d]) => {
      const terlarisArr = Object.entries(d.terlaris || {})
        .map(([k, v]) => [
          typeof v === 'object' ? v.nama : k.replace(/_/g,' '),
          typeof v === 'object' ? v.qty  : v,
        ]).sort((a, b) => b[1] - a[1]);
      const terlarisNama = terlarisArr.length ? terlarisArr[0][0] : '-';
      csv += `${csvEsc(tgl)},${d.omzet},${d.laba},${d.trx},${csvEsc(terlarisNama)}\n`;
    });
  downloadFile(`laporan-${tglKey()}.csv`, csv, 'text/csv;charset=utf-8');
  toast('Export CSV ✓');
}

export function exportTXT() {
  const laporan = getData('laporan', {});
  let txt = 'LAPORAN PENJUALAN\n' + '='.repeat(32) + '\n\n';
  Object.entries(laporan)
    .sort(([a], [b]) => b.localeCompare(a))
    .forEach(([tgl, d]) => {
      txt += `${tgl}\nOmzet: ${fmtRp(d.omzet)} | Laba: ${fmtRp(d.laba)} | Trx: ${d.trx}\n\n`;
    });
  downloadFile(`laporan-${tglKey()}.txt`, txt, 'text/plain;charset=utf-8');
  toast('Export TXT ✓');
}

export function exportJSON() {
  const data = {
    produk:      getData('produk',       []),
    laporan:     getData('laporan',      {}),
    riwayat:     getData('riwayat',      []),
    settings:    getData('settings',     {}),
    riwayat_stok: getData('riwayat_stok', []),
    backup_date: new Date().toISOString(),
    version:     '5.0',
  };
  downloadFile(`backup-${tglKey()}.json`, JSON.stringify(data, null, 2), 'application/json');
  toast('Backup JSON ✓');
}

export function restoreJSON(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = ev => {
    try {
      const data = JSON.parse(ev.target.result);
      if (!data.produk && !data.laporan && !data.riwayat) {
        toast('File backup tidak valid atau kosong', 'error'); return;
      }
      if (data.produk)       setData('produk',       data.produk);
      if (data.laporan)      setData('laporan',       data.laporan);
      if (data.riwayat)      setData('riwayat',       data.riwayat);
      if (data.settings)     setData('settings',      data.settings);
      if (data.riwayat_stok) setData('riwayat_stok',  data.riwayat_stok);
      toast('Data berhasil direstore ✓', 'success');
      window._appInit?.();
    } catch { toast('File tidak valid atau rusak', 'error'); }
  };
  reader.readAsText(file);
  e.target.value = '';
}

export function resetLaporan() {
  showKonfirmasiHapus(
    'Reset Laporan Harian',
    'Semua data laporan harian akan dihapus permanen.',
    'RESET LAPORAN',
    () => { setData('laporan', {}); renderLaporan(); renderDashboard(); toast('Laporan direset'); }
  );
}

export function resetRiwayat() {
  showKonfirmasiHapus(
    'Hapus Riwayat Transaksi',
    'Semua riwayat transaksi akan dihapus permanen.',
    'HAPUS RIWAYAT',
    () => { setData('riwayat', []); renderRiwayat(); toast('Riwayat dihapus'); }
  );
}

// BUG FIX #4: hancurkan chart sebelum reset
export function resetAllData(onDone) {
  showKonfirmasiHapus(
    'ZONA BERBAHAYA — Hapus Semua Data',
    'Semua <strong>produk</strong>, <strong>laporan</strong>, dan <strong>riwayat transaksi</strong> akan dihapus permanen.',
    'HAPUS SEMUA',
    () => {
      if (chartInstance) { chartInstance.destroy(); chartInstance = null; }
      removeData('produk','laporan','riwayat','riwayat_stok','prefs','_last_kasir','_pending_sync');
      window.produk = []; window.laporan = {}; window.riwayat = []; window.riwayatStok = [];
      window._cartModule?.resetCartState?.();
      onDone?.();
      toast('Semua data dihapus', 'error');
    }
  );
}

// ── GOOGLE SHEETS ─────────────────────────────────────────
export async function kirimSheets(trxData) {
  const s = getData('settings', {});
  if (!s.sheets_url) { toast('URL Sheets belum diset', 'error'); return; }
  const controller = new AbortController();
  const timer      = setTimeout(() => controller.abort(), 10000);
  try {
    const data = trxData || getData('riwayat', [])[0];
    if (!data) { toast('Tidak ada data transaksi', 'error'); return; }
    await fetch(s.sheets_url, {
      method: 'POST',
      body:   JSON.stringify({ action: 'addTransaction', data }),
      signal: controller.signal,
    });
    toast('Terkirim ke Sheets ✓', 'success');
  } catch (err) {
    toast(err.name === 'AbortError' ? 'Kirim ke Sheets timeout' : 'Gagal kirim ke Sheets', 'error');
  } finally { clearTimeout(timer); }
}

export async function tesSheets() {
  const url = document.getElementById('set-sheets-url')?.value;
  if (!url) { toast('URL belum diisi', 'error'); return; }
  const controller = new AbortController();
  const timer      = setTimeout(() => controller.abort(), 10000);
  try {
    toast('Menghubungkan...');
    await fetch(url, {
      method: 'POST',
      body:   JSON.stringify({ action: 'ping' }),
      signal: controller.signal,
    });
    toast('Koneksi berhasil ✓', 'success');
    const { updateSheetsStatus } = await import('./settings.js');
    updateSheetsStatus(true);
  } catch (err) {
    toast(err.name === 'AbortError' ? 'Koneksi timeout' : 'Gagal terhubung', 'error');
  } finally { clearTimeout(timer); }
}

function escHtml(str) {
  return String(str)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

window._laporanModule = {
  renderDashboard, renderLaporan, renderRiwayat, renderChart,
  voidTransaksi, konfirmasiVoid,
  exportCSV, exportTXT, exportJSON, restoreJSON,
  resetLaporan, resetRiwayat, resetAllData,
  kirimSheets, tesSheets,
};
window.kirimSheets = kirimSheets;
