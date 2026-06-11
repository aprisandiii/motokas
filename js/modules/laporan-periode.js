// ============================================================
//  MotoKas — modules/laporan-periode.js  (BARU v5.4)
//  Laporan periode custom: harian, mingguan, bulanan, tahunan
//  + ringkasan statistik + chart per periode
// ============================================================
import { getData }                        from './storage.js';
import { tglKey, tglDisplay, fmtRp,
         fmtRpShort, downloadFile }       from './utils.js';

// ── HELPER ────────────────────────────────────────────────

function isoToDate(iso) {
  return new Date(iso + 'T00:00:00');
}

/** Ambil semua entri laporan dalam rentang tanggal */
function getEntriesInRange(dari, sampai) {
  const laporan = getData('laporan', {});
  return Object.entries(laporan).map(([tgl, data]) => {
    let iso;
    if (tgl.includes('-')) {
      iso = tgl;
    } else {
      const parts = tgl.split('/');
      if (parts.length === 3 && parts[2].length === 4)
        iso = `${parts[2]}-${parts[1].padStart(2,'0')}-${parts[0].padStart(2,'0')}`;
    }
    return iso ? { iso, ...data } : null;
  }).filter(e => e && (!dari || e.iso >= dari) && (!sampai || e.iso <= sampai));
}

/** Hitung ringkasan dari array entries */
function hitungRingkasan(entries) {
  return entries.reduce((acc, e) => ({
    omzet: acc.omzet + (e.omzet || 0),
    laba:  acc.laba  + (e.laba  || 0),
    trx:   acc.trx   + (e.trx   || 0),
  }), { omzet: 0, laba: 0, trx: 0 });
}

/** Hitung terlaris dari array entries */
function hitungTerlaris(entries) {
  const map = {};
  entries.forEach(e => {
    Object.values(e.terlaris || {}).forEach(val => {
      const nama = typeof val === 'object' ? val.nama : String(val);
      const qty  = typeof val === 'object' ? val.qty  : 1;
      const key  = nama.toLowerCase().trim();
      if (!map[key]) map[key] = { nama, qty: 0 };
      map[key].qty += qty;
    });
  });
  return Object.values(map).sort((a, b) => b.qty - a.qty).slice(0, 5);
}

// ── PRESET RANGE ──────────────────────────────────────────

export function setPreset(preset) {
  const now     = new Date();
  const today   = tglKey(now);
  let dari, sampai;

  switch(preset) {
    case 'hari-ini':
      dari = today; sampai = today; break;

    case 'kemarin': {
      const kemarin = new Date(now - 86400000);
      dari = sampai = tglKey(kemarin); break;
    }
    case 'minggu-ini': {
      const day  = now.getDay(); // 0=minggu
      const diff = day === 0 ? 6 : day - 1; // senin = awal minggu
      const senin = new Date(now - diff * 86400000);
      dari = tglKey(senin); sampai = today; break;
    }
    case 'minggu-lalu': {
      const day  = now.getDay();
      const diff = day === 0 ? 6 : day - 1;
      const seninIni    = new Date(now - diff * 86400000);
      const seninLalu   = new Date(seninIni - 7 * 86400000);
      const mingguLalu  = new Date(seninIni - 1);
      dari = tglKey(seninLalu); sampai = tglKey(mingguLalu); break;
    }
    case '7-hari': {
      const tujuhHariLalu = new Date(now - 6 * 86400000);
      dari = tglKey(tujuhHariLalu); sampai = today; break;
    }
    case '30-hari': {
      const tigaPuluhLalu = new Date(now - 29 * 86400000);
      dari = tglKey(tigaPuluhLalu); sampai = today; break;
    }
    case 'bulan-ini':
      dari   = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-01`;
      sampai = today; break;

    case 'bulan-lalu': {
      const bl = new Date(now.getFullYear(), now.getMonth(), 0);
      const al = new Date(now.getFullYear(), now.getMonth()-1, 1);
      dari   = tglKey(al);
      sampai = tglKey(bl); break;
    }
    case 'tahun-ini':
      dari   = `${now.getFullYear()}-01-01`;
      sampai = today; break;

    case 'tahun-lalu':
      dari   = `${now.getFullYear()-1}-01-01`;
      sampai = `${now.getFullYear()-1}-12-31`; break;

    default: return;
  }

  const fromEl = document.getElementById('date-dari');
  const toEl   = document.getElementById('date-sampai');
  if (fromEl) fromEl.value = dari;
  if (toEl)   toEl.value   = sampai;

  renderRingkasanPeriode(dari, sampai);
  if (typeof window.renderLaporan === 'function') window.renderLaporan();
}

// ── RINGKASAN PERIODE ─────────────────────────────────────

export function renderRingkasanPeriode(dari, sampai) {
  const el = document.getElementById('ringkasan-periode');
  if (!el) return;

  if (!dari || !sampai) {
    el.style.display = 'none'; return;
  }

  const entries    = getEntriesInRange(dari, sampai);
  const ringkasan  = hitungRingkasan(entries);
  const terlaris   = hitungTerlaris(entries);
  const hariCount  = entries.length;
  const avgOmzet   = hariCount > 0 ? ringkasan.omzet / hariCount : 0;
  const avgTrx     = hariCount > 0 ? ringkasan.trx   / hariCount : 0;
  const marginPct  = ringkasan.omzet > 0
    ? ((ringkasan.laba / ringkasan.omzet) * 100).toFixed(1) : '0.0';

  // Hitung hari terbaik
  let bestDay = null, bestOmzet = 0;
  entries.forEach(e => {
    if (e.omzet > bestOmzet) { bestOmzet = e.omzet; bestDay = e.iso; }
  });

  el.style.display = 'block';
  el.innerHTML = `
    <div class="periode-header">
      <span class="periode-title">📊 Ringkasan</span>
      <span class="periode-range">${formatRange(dari, sampai)}</span>
    </div>
    <div class="periode-stats">
      <div class="periode-stat">
        <div class="periode-stat-label">Total Omzet</div>
        <div class="periode-stat-val accent">${fmtRp(ringkasan.omzet)}</div>
      </div>
      <div class="periode-stat">
        <div class="periode-stat-label">Total Laba</div>
        <div class="periode-stat-val ${ringkasan.laba < 0 ? 'red' : 'green'}">${fmtRp(ringkasan.laba)}</div>
      </div>
      <div class="periode-stat">
        <div class="periode-stat-label">Total Transaksi</div>
        <div class="periode-stat-val blue">${ringkasan.trx}</div>
      </div>
      <div class="periode-stat">
        <div class="periode-stat-label">Margin Laba</div>
        <div class="periode-stat-val ${parseFloat(marginPct) < 0 ? 'red' : 'accent'}">${marginPct}%</div>
      </div>
      <div class="periode-stat">
        <div class="periode-stat-label">Rata-rata/Hari</div>
        <div class="periode-stat-val">${fmtRpShort(avgOmzet)}</div>
      </div>
      <div class="periode-stat">
        <div class="periode-stat-label">Rata-rata Trx/Hari</div>
        <div class="periode-stat-val">${avgTrx.toFixed(1)}</div>
      </div>
    </div>
    ${bestDay ? `
    <div class="periode-best">
      🏆 Hari terbaik: <strong>${tglDisplay(bestDay)}</strong> — ${fmtRp(bestOmzet)}
    </div>` : ''}
    ${terlaris.length > 0 ? `
    <div class="periode-terlaris">
      <div class="periode-terlaris-title">🥇 Terlaris Periode Ini</div>
      ${terlaris.map((p, i) => `
        <div class="periode-terlaris-item">
          <span>${i+1}. ${escHtml(p.nama)}</span>
          <span class="periode-terlaris-qty">${p.qty} unit</span>
        </div>`).join('')}
    </div>` : ''}
    <div class="periode-actions">
      <button class="export-btn" onclick="window._periodeModule.exportPeriodeCSV()">
        <span class="exp-icon">📊</span>Export CSV
      </button>
      <button class="export-btn" onclick="window._periodeModule.exportPeriodePDF()">
        <span class="exp-icon">📄</span>Export TXT
      </button>
    </div>`;
}

// ── EXPORT PERIODE ────────────────────────────────────────

export function exportPeriodeCSV() {
  const dari   = document.getElementById('date-dari')?.value;
  const sampai = document.getElementById('date-sampai')?.value;
  if (!dari || !sampai) return;

  const entries   = getEntriesInRange(dari, sampai);
  const ringkasan = hitungRingkasan(entries);
  let csv = `Laporan Periode: ${formatRange(dari, sampai)}\n`;
  csv += `Total Omzet,${ringkasan.omzet}\n`;
  csv += `Total Laba,${ringkasan.laba}\n`;
  csv += `Total Transaksi,${ringkasan.trx}\n\n`;
  csv += `Tanggal,Omzet,Laba,Transaksi\n`;
  entries.sort((a,b) => b.iso.localeCompare(a.iso)).forEach(e => {
    csv += `${tglDisplay(e.iso)},${e.omzet||0},${e.laba||0},${e.trx||0}\n`;
  });
  downloadFile(`laporan-${dari}-sd-${sampai}.csv`, csv, 'text/csv;charset=utf-8');
}

export function exportPeriodePDF() {
  const dari   = document.getElementById('date-dari')?.value;
  const sampai = document.getElementById('date-sampai')?.value;
  if (!dari || !sampai) return;

  const entries   = getEntriesInRange(dari, sampai);
  const ringkasan = hitungRingkasan(entries);
  const terlaris  = hitungTerlaris(entries);
  const line      = '='.repeat(36);

  let txt = `LAPORAN PENJUALAN\n${line}\n`;
  txt += `Periode : ${formatRange(dari, sampai)}\n`;
  txt += `${line}\n\n`;
  txt += `RINGKASAN\n`;
  txt += `Total Omzet       : ${fmtRp(ringkasan.omzet)}\n`;
  txt += `Total Laba        : ${fmtRp(ringkasan.laba)}\n`;
  txt += `Total Transaksi   : ${ringkasan.trx}\n`;
  txt += `Hari Aktif        : ${entries.length} hari\n`;
  if (ringkasan.omzet > 0) {
    const margin = ((ringkasan.laba / ringkasan.omzet) * 100).toFixed(1);
    txt += `Margin Laba       : ${margin}%\n`;
  }
  txt += `\n${line}\nDETAIL HARIAN\n${line}\n`;
  entries.sort((a,b) => b.iso.localeCompare(a.iso)).forEach(e => {
    txt += `${tglDisplay(e.iso).padEnd(12)} Omzet: ${fmtRp(e.omzet||0).padEnd(14)} Trx: ${e.trx||0}\n`;
  });
  if (terlaris.length > 0) {
    txt += `\n${line}\nPRODUK TERLARIS\n${line}\n`;
    terlaris.forEach((p, i) => {
      txt += `${i+1}. ${p.nama} — ${p.qty} unit\n`;
    });
  }
  downloadFile(`laporan-${dari}-sd-${sampai}.txt`, txt, 'text/plain;charset=utf-8');
}

// ── HELPERS ───────────────────────────────────────────────

function formatRange(dari, sampai) {
  if (dari === sampai) return tglDisplay(dari);
  return `${tglDisplay(dari)} — ${tglDisplay(sampai)}`;
}

function escHtml(str) {
  return String(str)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

window._periodeModule = {
  setPreset, renderRingkasanPeriode,
  exportPeriodeCSV, exportPeriodePDF,
};
