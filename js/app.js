/* ══════════════════════════════════════════
   dityaMotor 88 — Kasir Digital v3.0
   app.js — Main Application Logic
══════════════════════════════════════════ */

/* ── DATA LAYER ── */
const DB_KEY = {
  produk: 'dm88_produk',
  cart: 'dm88_cart',
  laporan: 'dm88_laporan',
  statistik: 'dm88_statistik',
  riwayat: 'dm88_riwayat',
  pengaturan: 'dm88_pengaturan',
  sheets: 'dm88_sheetsUrl',
  pin: 'dm88_pin'
};

function dbGet(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; }
  catch { return fallback; }
}
function dbSet(key, val) {
  try { localStorage.setItem(key, JSON.stringify(val)); } catch {}
}

let produk         = dbGet(DB_KEY.produk, []);
let cart           = dbGet(DB_KEY.cart, []);
let laporan        = dbGet(DB_KEY.laporan, []);
let statistikProduk = dbGet(DB_KEY.statistik, {});
let riwayat        = dbGet(DB_KEY.riwayat, []);
let pengaturan     = dbGet(DB_KEY.pengaturan, {
  namaToko: 'dityaMotor 88',
  alamat: 'Jl.Sariwangi Selatan, Sariwangi, Parongpong',
  telepon: '0855-2444-0968',
  footer1: 'Barang yang sudah dibeli tidak dapat ditukar.',
  footer2: 'Terima kasih sudah berbelanja!'
});
let sheetsUrl      = localStorage.getItem(DB_KEY.sheets) || '';
let lastTrxData    = null;

function simpanData() {
  dbSet(DB_KEY.produk, produk);
  dbSet(DB_KEY.cart, cart);
  dbSet(DB_KEY.laporan, laporan);
  dbSet(DB_KEY.statistik, statistikProduk);
  dbSet(DB_KEY.riwayat, riwayat);
  dbSet(DB_KEY.pengaturan, pengaturan);
  if (sheetsUrl) localStorage.setItem(DB_KEY.sheets, sheetsUrl);
}

/* ══════════════════════════════════════════
   LOGIN PIN
══════════════════════════════════════════ */
let pinBuffer = '';
const DEFAULT_PIN = '1234';

function initLogin() {
  const savedPin = localStorage.getItem(DB_KEY.pin) || DEFAULT_PIN;
  const screen = document.getElementById('loginScreen');
  const app    = document.getElementById('appContent');

  // Already unlocked this session
  if (sessionStorage.getItem('dm88_unlocked') === '1') {
    screen.style.display = 'none';
    app.style.display    = 'block';
    return;
  }

  screen.style.display = 'flex';
  app.style.display    = 'none';

  // Keyboard support
  document.addEventListener('keydown', function onPinKeydown(e) {
    if (sessionStorage.getItem('dm88_unlocked') === '1') {
      document.removeEventListener('keydown', onPinKeydown);
      return;
    }
    if (e.key >= '0' && e.key <= '9') {
      window.pinPress(e.key);
    } else if (e.key === 'Backspace') {
      window.pinDel();
    }
  });

  window.pinPress = function(val) {
    if (pinBuffer.length >= 4) return;
    pinBuffer += val;
    updatePinDots();
    if (pinBuffer.length === 4) {
      setTimeout(() => {
        if (pinBuffer === savedPin) {
          sessionStorage.setItem('dm88_unlocked', '1');
          screen.style.display = 'none';
          app.style.display    = 'block';
          pinBuffer = '';
          updatePinDots();
        } else {
          // Wrong PIN shake
          document.querySelectorAll('.pin-dot').forEach(d => d.classList.add('error'));
          document.getElementById('pinErrorMsg').innerText = 'PIN salah, coba lagi';
          setTimeout(() => {
            document.querySelectorAll('.pin-dot').forEach(d => {
              d.classList.remove('error', 'filled');
            });
            document.getElementById('pinErrorMsg').innerText = '';
            pinBuffer = '';
          }, 900);
        }
      }, 200);
    }
  };

  window.pinDel = function() {
    if (!pinBuffer.length) return;
    pinBuffer = pinBuffer.slice(0, -1);
    updatePinDots();
  };
}

function updatePinDots() {
  document.querySelectorAll('.pin-dot').forEach((dot, i) => {
    dot.classList.toggle('filled', i < pinBuffer.length);
  });
}

function gantiPin() {
  Swal.fire({
    title: 'Ganti PIN',
    html: `
      <div style="text-align:left;font-size:13px;color:#8892a4;margin-bottom:8px">PIN lama:</div>
      <input type="password" id="swal-old-pin" class="swal2-input" maxlength="4" placeholder="PIN saat ini" inputmode="numeric">
      <div style="text-align:left;font-size:13px;color:#8892a4;margin-bottom:8px;margin-top:8px">PIN baru:</div>
      <input type="password" id="swal-new-pin" class="swal2-input" maxlength="4" placeholder="PIN baru (4 angka)" inputmode="numeric">
      <div style="text-align:left;font-size:13px;color:#8892a4;margin-bottom:8px;margin-top:8px">Konfirmasi PIN:</div>
      <input type="password" id="swal-confirm-pin" class="swal2-input" maxlength="4" placeholder="Ulangi PIN baru" inputmode="numeric">
    `,
    background: '#171b24',
    color: '#e8eaf0',
    confirmButtonText: 'Simpan PIN',
    confirmButtonColor: '#f5c542',
    showCancelButton: true,
    cancelButtonText: 'Batal',
    preConfirm: () => {
      const oldPin  = document.getElementById('swal-old-pin').value;
      const newPin  = document.getElementById('swal-new-pin').value;
      const confPin = document.getElementById('swal-confirm-pin').value;
      const saved   = localStorage.getItem(DB_KEY.pin) || DEFAULT_PIN;
      if (oldPin !== saved) { Swal.showValidationMessage('PIN lama tidak benar'); return false; }
      if (newPin.length < 4) { Swal.showValidationMessage('PIN baru harus 4 digit'); return false; }
      if (!/^\d{4}$/.test(newPin)) { Swal.showValidationMessage('PIN hanya boleh angka'); return false; }
      if (newPin !== confPin) { Swal.showValidationMessage('Konfirmasi PIN tidak cocok'); return false; }
      return newPin;
    }
  }).then(result => {
    if (result.isConfirmed) {
      localStorage.setItem(DB_KEY.pin, result.value);
      Swal.fire({ title:'✅ PIN berhasil diubah!', icon:'success', background:'#171b24', color:'#e8eaf0', confirmButtonColor:'#f5c542' });
    }
  });
}

function logout() {
  Swal.fire({
    title: 'Keluar / Kunci Aplikasi?',
    text: 'Anda perlu memasukkan PIN kembali.',
    icon: 'question',
    background: '#171b24',
    color: '#e8eaf0',
    showCancelButton: true,
    confirmButtonText: 'Ya, Kunci',
    confirmButtonColor: '#ef4444',
    cancelButtonText: 'Batal'
  }).then(r => {
    if (r.isConfirmed) {
      sessionStorage.removeItem('dm88_unlocked');
      location.reload();
    }
  });
}

/* ══════════════════════════════════════════
   FORMAT HELPERS
══════════════════════════════════════════ */
function rupiah(n) { return Number(n || 0).toLocaleString('id-ID'); }

function parseRp(str) {
  if (typeof str === 'number') return str;
  return parseInt(String(str).replace(/\./g,'').replace(/[^0-9]/g,'')) || 0;
}

function rpPreview(el, previewId) {
  const num = parseRp(el.value);
  const prev = document.getElementById(previewId);
  if (prev) prev.innerText = num > 0 ? 'Rp ' + rupiah(num) : '';
}

/* ══════════════════════════════════════════
   TABS
══════════════════════════════════════════ */
function switchTab(panelId, btn) {
  const parent = btn.closest('.card');
  parent.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
  parent.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  parent.querySelector('#' + panelId).classList.add('active');
  btn.classList.add('active');
}

/* ══════════════════════════════════════════
   PENGATURAN
══════════════════════════════════════════ */
function terapkanPengaturan() {
  document.getElementById('headerNamaToko').innerText = pengaturan.namaToko;
  document.getElementById('headerAlamat').innerText   = pengaturan.alamat + '  |  Telp: ' + pengaturan.telepon;
}

function bukaModalPengaturan() {
  document.getElementById('setNamaToko').value = pengaturan.namaToko;
  document.getElementById('setAlamat').value   = pengaturan.alamat;
  document.getElementById('setTelepon').value  = pengaturan.telepon;
  document.getElementById('setFooter1').value  = pengaturan.footer1;
  document.getElementById('setFooter2').value  = pengaturan.footer2;
  document.getElementById('modalPengaturan').classList.add('active');
}

function simpanPengaturan() {
  pengaturan.namaToko = document.getElementById('setNamaToko').value.trim() || pengaturan.namaToko;
  pengaturan.alamat   = document.getElementById('setAlamat').value.trim()   || pengaturan.alamat;
  pengaturan.telepon  = document.getElementById('setTelepon').value.trim()  || pengaturan.telepon;
  pengaturan.footer1  = document.getElementById('setFooter1').value.trim()  || pengaturan.footer1;
  pengaturan.footer2  = document.getElementById('setFooter2').value.trim()  || pengaturan.footer2;
  terapkanPengaturan();
  tutupModal('modalPengaturan');
  simpanData();
  showToast('Pengaturan tersimpan ✓', 'success');
}

/* ══════════════════════════════════════════
   DASHBOARD & CHART
══════════════════════════════════════════ */
let salesChart = null;

function updateDashboard() {
  const hari = new Date().toLocaleDateString('id-ID');
  const lh   = laporan.find(l => l.tanggal === hari);
  document.getElementById('dashOmzet').innerText = 'Rp ' + rupiah(lh ? lh.total : 0);
  document.getElementById('dashLaba').innerText  = 'Rp ' + rupiah(lh ? lh.laba  : 0);
  document.getElementById('dashTrx').innerText   = lh ? lh.transaksi : 0;
  const kritis = produk.filter(p => p.stok <= (p.stokMin || 3)).length;
  document.getElementById('dashStokKritis').innerText = kritis;
  updateAlertStok();
  renderChart();
}

function updateAlertStok() {
  const menipis = produk.filter(p => p.stok <= (p.stokMin || 3) && p.stok > 0);
  const habis   = produk.filter(p => p.stok === 0);
  const el = document.getElementById('stokAlert');
  let pesan = '';
  if (habis.length)   pesan += '⛔ Stok habis: ' + habis.map(p => p.nama).join(', ') + '.  ';
  if (menipis.length) pesan += '⚠️ Menipis: ' + menipis.map(p => p.nama + ' (' + p.stok + ')').join(', ');
  el.innerText      = pesan;
  el.style.display  = pesan ? 'block' : 'none';
}

function renderChart() {
  const ctx = document.getElementById('salesChartCanvas');
  if (!ctx) return;

  // Build last 7 days labels & data
  const days  = [];
  const omzet = [];
  const laba  = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const label = d.toLocaleDateString('id-ID', { day:'2-digit', month:'short' });
    const key   = d.toLocaleDateString('id-ID');
    const entry = laporan.find(l => l.tanggal === key);
    days.push(label);
    omzet.push(entry ? entry.total : 0);
    laba.push(entry ? (entry.laba || 0) : 0);
  }

  if (salesChart) {
    salesChart.data.labels      = days;
    salesChart.data.datasets[0].data = omzet;
    salesChart.data.datasets[1].data = laba;
    salesChart.update();
    return;
  }

  salesChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: days,
      datasets: [
        {
          label: 'Omzet',
          data: omzet,
          backgroundColor: 'rgba(34,197,94,0.6)',
          borderColor: '#22c55e',
          borderWidth: 1,
          borderRadius: 5
        },
        {
          label: 'Laba',
          data: laba,
          backgroundColor: 'rgba(245,197,66,0.6)',
          borderColor: '#f5c542',
          borderWidth: 1,
          borderRadius: 5
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      plugins: {
        legend: { labels: { color: '#8892a4', font: { size: 11 } } },
        tooltip: {
          callbacks: {
            label: ctx => ' Rp ' + rupiah(ctx.raw)
          }
        }
      },
      scales: {
        x: { ticks: { color: '#8892a4', font: { size: 10 } }, grid: { color: '#2a3045' } },
        y: { ticks: { color: '#8892a4', font: { size: 10 }, callback: v => 'Rp ' + rupiah(v) }, grid: { color: '#2a3045' } }
      }
    }
  });
}

/* ══════════════════════════════════════════
   PRODUK
══════════════════════════════════════════ */
function tambahProduk() {
  const nama       = document.getElementById('namaProduk').value.trim();
  const kategori   = document.getElementById('kategoriProduk').value;
  const hargaModal = parseRp(document.getElementById('hargaModalProduk').value);
  const harga      = parseRp(document.getElementById('hargaProduk').value);
  const stok       = parseInt(document.getElementById('stokProduk').value) || 0;
  const stokMin    = parseInt(document.getElementById('stokMinProduk').value) || 3;

  if (!nama) { showToast('Nama produk wajib diisi', 'error'); return; }
  if (harga <= 0) { showToast('Harga jual harus lebih dari 0', 'error'); return; }
  if (produk.find(p => p.nama.toLowerCase() === nama.toLowerCase())) {
    showToast('Produk dengan nama tersebut sudah ada', 'error'); return;
  }
  produk.push({ nama, kategori, hargaModal, harga, stok, stokMin });
  ['namaProduk','hargaModalProduk','hargaProduk','stokProduk'].forEach(id => document.getElementById(id).value = '');
  ['prevModal','prevJual'].forEach(id => document.getElementById(id).innerText = '');
  document.getElementById('stokMinProduk').value  = '3';
  document.getElementById('kategoriProduk').value = '';
  renderProduk(); simpanData(); updateDashboard();
  showToast('Produk berhasil ditambahkan ✓', 'success');
}

function renderProduk() {
  const list = document.getElementById('produkList');
  const q    = document.getElementById('searchProduk').value.toLowerCase();
  const kat  = document.getElementById('filterKategori').value;
  const filtered = produk.filter(item =>
    item.nama.toLowerCase().includes(q) && (!kat || item.kategori === kat)
  );
  if (!filtered.length) {
    list.innerHTML = `<tr><td colspan="4"><div class="empty-state"><div class="icon">📦</div>Tidak ada produk</div></td></tr>`;
    return;
  }
  list.innerHTML = filtered.map(item => {
    const idx = produk.indexOf(item);
    const low = item.stok <= (item.stokMin || 3);
    const stokBadge = low
      ? `<span class="stok-num badge badge-low">${item.stok}</span>`
      : `<span class="stok-num" style="color:var(--green)">${item.stok}</span>`;
    return `<tr>
      <td>
        <div style="font-weight:600;font-size:13px">${item.nama}</div>
        ${item.kategori ? `<span class="badge badge-cat">${item.kategori}</span>` : ''}
      </td>
      <td style="font-family:'JetBrains Mono',monospace;font-size:12px;color:var(--gold)">Rp ${rupiah(item.harga)}</td>
      <td>${stokBadge}</td>
      <td style="white-space:nowrap">
        <button class="btn btn-primary btn-xs" onclick="tambahCart(${idx})">+</button>
        <button class="btn btn-ghost btn-xs" onclick="bukaEditProduk(${idx})">✏️</button>
        <button class="btn btn-danger btn-xs" onclick="hapusProduk(${idx})">🗑</button>
      </td>
    </tr>`;
  }).join('');
  updateAlertStok();
}

function bukaEditProduk(index) {
  const p = produk[index];
  document.getElementById('editIndex').value      = index;
  document.getElementById('editNama').value        = p.nama;
  document.getElementById('editKategori').value    = p.kategori || '';
  document.getElementById('editHargaModal').value  = rupiah(p.hargaModal || 0);
  document.getElementById('editHarga').value       = rupiah(p.harga);
  document.getElementById('editStok').value        = p.stok;
  document.getElementById('editStokMin').value     = p.stokMin || 3;
  document.getElementById('editPrevModal').innerText = p.hargaModal ? 'Rp ' + rupiah(p.hargaModal) : '';
  document.getElementById('editPrevJual').innerText  = 'Rp ' + rupiah(p.harga);
  document.getElementById('editProdukModal').classList.add('active');
}

function simpanEditProduk() {
  const idx       = parseInt(document.getElementById('editIndex').value);
  const nama      = document.getElementById('editNama').value.trim();
  const kategori  = document.getElementById('editKategori').value;
  const hargaModal = parseRp(document.getElementById('editHargaModal').value);
  const harga     = parseRp(document.getElementById('editHarga').value);
  const stok      = parseInt(document.getElementById('editStok').value) || 0;
  const stokMin   = parseInt(document.getElementById('editStokMin').value) || 3;
  if (!nama || harga <= 0) { showToast('Data tidak valid', 'error'); return; }
  produk[idx] = { ...produk[idx], nama, kategori, hargaModal, harga, stok, stokMin };
  tutupModal('editProdukModal');
  renderProduk(); updateDashboard(); simpanData();
  showToast('Produk diperbarui ✓', 'success');
}

function hapusProduk(index) {
  if (cart.find(c => c.nama === produk[index].nama)) {
    showToast('Produk masih di keranjang', 'error'); return;
  }
  Swal.fire({
    title: `Hapus "${produk[index].nama}"?`,
    text: 'Data produk akan dihapus permanen.',
    icon: 'warning',
    background: '#171b24',
    color: '#e8eaf0',
    showCancelButton: true,
    confirmButtonText: 'Ya, Hapus',
    confirmButtonColor: '#ef4444',
    cancelButtonText: 'Batal'
  }).then(r => {
    if (r.isConfirmed) {
      produk.splice(index, 1);
      renderProduk(); updateDashboard(); simpanData();
      showToast('Produk dihapus', 'success');
    }
  });
}

/* ══════════════════════════════════════════
   CART
══════════════════════════════════════════ */
function tambahCart(index) {
  if (produk[index].stok <= 0) { showToast('Stok habis!', 'error'); return; }
  produk[index].stok -= 1;
  const ex = cart.find(i => i.nama === produk[index].nama);
  if (ex) ex.qty += 1;
  else cart.push({ nama: produk[index].nama, harga: produk[index].harga, hargaModal: produk[index].hargaModal || 0, qty: 1 });
  renderProduk(); renderCart(); simpanData();
}

function kurangiCart(index) {
  const item = cart[index];
  const pi   = produk.findIndex(p => p.nama === item.nama);
  if (pi !== -1) produk[pi].stok += 1;
  if (cart[index].qty > 1) cart[index].qty -= 1;
  else cart.splice(index, 1);
  renderProduk(); renderCart(); simpanData();
}

function tambahCartDariCart(index) {
  const item = cart[index];
  const pi   = produk.findIndex(p => p.nama === item.nama);
  if (pi === -1 || produk[pi].stok <= 0) { showToast('Stok habis!', 'error'); return; }
  produk[pi].stok -= 1;
  cart[index].qty += 1;
  renderProduk(); renderCart(); simpanData();
}

function hapusCart(index) {
  const item = cart[index];
  const pi   = produk.findIndex(p => p.nama === item.nama);
  if (pi !== -1) produk[pi].stok += item.qty;
  cart.splice(index, 1);
  renderProduk(); renderCart(); simpanData();
}

function kosongkanCart() {
  if (!cart.length) return;
  Swal.fire({
    title: 'Kosongkan keranjang?',
    icon: 'question',
    background: '#171b24',
    color: '#e8eaf0',
    showCancelButton: true,
    confirmButtonText: 'Ya',
    confirmButtonColor: '#ef4444',
    cancelButtonText: 'Batal'
  }).then(r => {
    if (r.isConfirmed) {
      cart.forEach(item => {
        const pi = produk.findIndex(p => p.nama === item.nama);
        if (pi !== -1) produk[pi].stok += item.qty;
      });
      cart = [];
      document.getElementById('diskonNilai').value = '';
      document.getElementById('bayar').value        = '';
      document.getElementById('prevBayar').innerText = '';
      renderProduk(); renderCart(); simpanData();
    }
  });
}

function renderCart() {
  const list  = document.getElementById('cartList');
  const empty = document.getElementById('cartEmpty');
  if (!cart.length) {
    list.innerHTML = '';
    empty.style.display = 'block';
    document.getElementById('totalSubtotal').innerText     = 'Rp 0';
    document.getElementById('totalAkhirDisplay').innerText = 'Rp 0';
    document.getElementById('diskonRow').style.display     = 'none';
    return;
  }
  empty.style.display = 'none';
  let total = 0;
  list.innerHTML = cart.map((item, i) => {
    const sub = item.harga * item.qty;
    total += sub;
    return `<tr>
      <td style="font-size:12px;font-weight:600">${item.nama}</td>
      <td style="font-size:11px;font-family:'JetBrains Mono',monospace;color:var(--text2)">Rp ${rupiah(item.harga)}</td>
      <td>
        <div class="qty-ctrl">
          <button onclick="kurangiCart(${i})">−</button>
          <span>${item.qty}</span>
          <button onclick="tambahCartDariCart(${i})">+</button>
        </div>
      </td>
      <td style="font-size:12px;font-family:'JetBrains Mono',monospace;color:var(--gold)">Rp ${rupiah(sub)}</td>
      <td><button class="btn btn-danger btn-xs" onclick="hapusCart(${i})">✕</button></td>
    </tr>`;
  }).join('');
  document.getElementById('totalSubtotal').innerText = 'Rp ' + rupiah(total);
  hitungDiskon();
}

function hitungDiskon() {
  const total    = cart.reduce((s, i) => s + i.harga * i.qty, 0);
  const nilaiRaw = parseRp(document.getElementById('diskonNilai').value);
  const tipe     = document.getElementById('diskonTipe').value;
  let diskon     = tipe === 'persen' ? Math.round(total * nilaiRaw / 100) : nilaiRaw;
  if (diskon > total) diskon = total;
  const akhir = total - diskon;
  document.getElementById('totalSubtotal').innerText     = 'Rp ' + rupiah(total);
  document.getElementById('totalAkhirDisplay').innerText = 'Rp ' + rupiah(akhir);
  if (diskon > 0) {
    document.getElementById('diskonRow').style.display = 'flex';
    document.getElementById('diskonAmt').innerText     = '- Rp ' + rupiah(diskon);
  } else {
    document.getElementById('diskonRow').style.display = 'none';
  }
}

/* ══════════════════════════════════════════
   CHECKOUT
══════════════════════════════════════════ */
function checkout() {
  if (!cart.length) { showToast('Keranjang masih kosong!', 'error'); return; }
  const total       = cart.reduce((s, i) => s + i.harga * i.qty, 0);
  const diskonNilai = parseRp(document.getElementById('diskonNilai').value);
  const diskonTipe  = document.getElementById('diskonTipe').value;
  let diskon        = diskonTipe === 'persen' ? Math.round(total * diskonNilai / 100) : diskonNilai;
  if (diskon > total) diskon = total;
  const totalAkhir = total - diskon;
  const metode     = document.getElementById('metodeBayar').value;
  const kasir      = document.getElementById('namaKasir').value.trim() || 'Admin';
  let bayar        = parseRp(document.getElementById('bayar').value) || 0;

  if (metode === 'Tunai') {
    if (bayar < totalAkhir) { showToast(`Bayar kurang! Total: Rp ${rupiah(totalAkhir)}`, 'error'); return; }
  } else { bayar = totalAkhir; }

  const kembalian = metode === 'Tunai' ? bayar - totalAkhir : 0;
  const tanggal   = new Date().toLocaleDateString('id-ID');
  const waktu     = new Date().toLocaleString('id-ID');
  const noTrx     = 'TRX-' + Date.now().toString().slice(-8);
  let laba        = cart.reduce((s, item) => s + (item.harga - (item.hargaModal || 0)) * item.qty, 0) - diskon;

  cart.forEach(item => { statistikProduk[item.nama] = (statistikProduk[item.nama] || 0) + item.qty; });
  const produkTerlaris = Object.keys(statistikProduk).length
    ? Object.keys(statistikProduk).reduce((a, b) => statistikProduk[a] > statistikProduk[b] ? a : b)
    : '-';

  const existing = laporan.find(l => l.tanggal === tanggal);
  if (existing) { existing.total += totalAkhir; existing.laba += laba; existing.transaksi += 1; existing.terlaris = produkTerlaris; }
  else laporan.push({ tanggal, total: totalAkhir, laba, transaksi: 1, terlaris: produkTerlaris });

  const trxData = {
    noTrx, waktu, tanggal, total: totalAkhir, metode, kasir, bayar,
    kembalian: metode === 'Tunai' ? kembalian : 0,
    diskon, subtotal: total,
    items: cart.map(i => ({ nama: i.nama, qty: i.qty, harga: i.harga, subtotal: i.harga * i.qty })),
    detail: cart.map(i => `${i.nama} x${i.qty}`).join(', ')
  };
  riwayat.unshift(trxData);
  lastTrxData = { action: 'transaksi', ...trxData, laba, toko: pengaturan.namaToko };

  const struHtml = buildStruk({ noTrx, tanggal, waktu, kasir, metode, items: cart, subtotal: total, diskon, totalAkhir, bayar, kembalian });
  document.getElementById('receipt').innerHTML    = struHtml;
  document.getElementById('receipt').style.display = 'block';
  document.getElementById('btnCetak').style.display = 'block';

  const syncStatus = document.getElementById('syncStatus');
  const btnSheets  = document.getElementById('btnKirimSheets');
  syncStatus.className = 'sync-status'; syncStatus.style.display = 'none';
  btnSheets.style.display = 'block';
  btnSheets.innerText     = '📤 Kirim ke Google Sheets';
  btnSheets.disabled      = false;
  if (sheetsUrl) kirimKeSheets();

  cart = [];
  document.getElementById('diskonNilai').value   = '';
  document.getElementById('bayar').value          = '';
  document.getElementById('prevBayar').innerText  = '';
  renderCart(); renderLaporan(); renderRiwayat(); updateDashboard(); simpanData();

  // SweetAlert2 checkout success
  Swal.fire({
    title: '✅ Checkout Berhasil!',
    html: `
      <div style="font-family:'JetBrains Mono',monospace;font-size:14px;margin:12px 0">
        <div style="display:flex;justify-content:space-between;margin:4px 0"><span>Total</span><span style="color:#f5c542">Rp ${rupiah(totalAkhir)}</span></div>
        ${metode==='Tunai' ? `<div style="display:flex;justify-content:space-between;margin:4px 0"><span>Bayar</span><span>Rp ${rupiah(bayar)}</span></div>
        <div style="display:flex;justify-content:space-between;margin:4px 0"><span style="color:#22c55e;font-weight:700">Kembalian</span><span style="color:#22c55e;font-weight:700">Rp ${rupiah(kembalian)}</span></div>` : ''}
        <div style="display:flex;justify-content:space-between;margin:4px 0"><span>Metode</span><span>${metode}</span></div>
        <div style="display:flex;justify-content:space-between;margin:4px 0"><span>No Transaksi</span><span style="font-size:11px">${noTrx}</span></div>
      </div>
    `,
    icon: 'success',
    background: '#171b24',
    color: '#e8eaf0',
    confirmButtonText: '🖨 Cetak Nota',
    confirmButtonColor: '#f5c542',
    showCancelButton: true,
    cancelButtonText: 'Tutup'
  }).then(r => {
    if (r.isConfirmed) cetakStruklangsung();
  });
}

/* ══════════════════════════════════════════
   BUILD STRUK
══════════════════════════════════════════ */
function buildStruk({ noTrx, tanggal, waktu, kasir, metode, items, subtotal, diskon, totalAkhir, bayar, kembalian }, ulang = false) {
  const itemsHtml = items.map(item => `
    <div class="rrow">
      <span class="rn">${item.nama}</span>
      <span class="rq">${item.qty}x${rupiah(item.harga)}</span>
      <span class="rp">Rp ${rupiah(item.harga * item.qty)}</span>
    </div>`).join('');
  return `
    <div class="rh">
      <h3>${pengaturan.namaToko}</h3>
      <p>${pengaturan.alamat}</p>
      <p>Telp: ${pengaturan.telepon}</p>
    </div>
    <hr>
    <div class="rno">No: ${noTrx}</div>
    <div class="rrow"><span>Tanggal</span><span>${tanggal}</span></div>
    <div class="rrow"><span>Waktu</span><span>${waktu}</span></div>
    <div class="rrow"><span>Kasir</span><span>${kasir}</span></div>
    <div class="rrow"><span>Pembayaran</span><span>${metode}</span></div>
    <hr>
    <div class="rrow" style="font-weight:bold;font-size:10px;color:#666">
      <span class="rn">ITEM</span><span class="rq">QTY</span><span class="rp">SUBTOTAL</span>
    </div>
    <hr>
    ${itemsHtml}
    <hr>
    <div class="rsum"><span>Subtotal</span><span>Rp ${rupiah(subtotal)}</span></div>
    ${diskon > 0 ? `<div class="rsum"><span>Diskon</span><span>- Rp ${rupiah(diskon)}</span></div>` : ''}
    <hr>
    <div class="rtotal"><span>TOTAL</span><span>Rp ${rupiah(totalAkhir)}</span></div>
    <div class="rsum"><span>${metode}</span><span>Rp ${rupiah(bayar)}</span></div>
    ${metode === 'Tunai' ? `<div class="rsum" style="font-weight:bold"><span>Kembalian</span><span>Rp ${rupiah(kembalian)}</span></div>` : ''}
    <hr>
    ${ulang ? '<div style="text-align:center;font-size:10px;color:#888;margin-bottom:4px">*** CETAK ULANG ***</div>' : ''}
    <div class="rfooter">
      <p>${pengaturan.footer1}</p>
      <p>${pengaturan.footer2}</p>
    </div>`;
}

/* ══════════════════════════════════════════
   CETAK NOTA
══════════════════════════════════════════ */
function cetakStruklangsung() {
  const struHtml = document.getElementById('receipt').innerHTML;
  if (!struHtml) return;
  const pa = document.getElementById('printArea');
  pa.innerHTML = `<div style="font-family:'Courier New',monospace;font-size:12px;padding:10px;max-width:80mm;color:#000">${struHtml}</div>`;
  window.print();
}

function cetakUlang(index) {
  const item = riwayat[index]; if (!item) return;
  const items = item.items && item.items.length
    ? item.items : [{ nama: item.detail || '-', qty: 1, harga: item.total }];
  const struHtml = buildStruk({
    noTrx: item.noTrx || '-', tanggal: item.tanggal || item.waktu, waktu: item.waktu,
    kasir: item.kasir || 'Admin', metode: item.metode || 'Tunai', items,
    subtotal: item.subtotal || item.total, diskon: item.diskon || 0,
    totalAkhir: item.total, bayar: item.bayar || item.total, kembalian: item.kembalian || 0
  }, true);
  const pa = document.getElementById('printArea');
  pa.innerHTML = `<div style="font-family:'Courier New',monospace;font-size:12px;padding:10px;max-width:80mm;color:#000">${struHtml}</div>`;
  document.getElementById('receipt').innerHTML    = struHtml;
  document.getElementById('receipt').style.display = 'block';
  document.getElementById('btnCetak').style.display = 'block';
  setTimeout(() => window.print(), 300);
}

/* ══════════════════════════════════════════
   LAPORAN & RIWAYAT
══════════════════════════════════════════ */
function renderLaporan() {
  const list = document.getElementById('laporanList');
  // Filter
  const filterFrom = document.getElementById('filterLaporanDari') ? document.getElementById('filterLaporanDari').value : '';
  const filterTo   = document.getElementById('filterLaporanSampai') ? document.getElementById('filterLaporanSampai').value : '';

  let data = [...laporan].reverse();

  if (filterFrom) {
    const from = new Date(filterFrom);
    data = data.filter(item => {
      const [d, m, y] = item.tanggal.split('/');
      return new Date(`${y}-${m}-${d}`) >= from;
    });
  }
  if (filterTo) {
    const to = new Date(filterTo);
    data = data.filter(item => {
      const [d, m, y] = item.tanggal.split('/');
      return new Date(`${y}-${m}-${d}`) <= to;
    });
  }

  if (!data.length) {
    list.innerHTML = `<tr><td colspan="5"><div class="empty-state"><div class="icon">📊</div>Belum ada laporan</div></td></tr>`;
    return;
  }
  list.innerHTML = data.map(item => `
    <tr>
      <td style="font-size:12px">${item.tanggal}</td>
      <td style="font-family:'JetBrains Mono',monospace;font-size:12px;color:var(--green)">Rp ${rupiah(item.total)}</td>
      <td style="font-family:'JetBrains Mono',monospace;font-size:12px;color:var(--gold)">Rp ${rupiah(item.laba || 0)}</td>
      <td style="font-weight:700">${item.transaksi}</td>
      <td style="font-size:12px;color:var(--text2)">${item.terlaris || '-'}</td>
    </tr>`).join('');
}

function renderRiwayat() {
  const list = document.getElementById('riwayatList');
  const filterMetode = document.getElementById('filterRiwayatMetode') ? document.getElementById('filterRiwayatMetode').value : '';
  const filterCari   = document.getElementById('filterRiwayatCari') ? document.getElementById('filterRiwayatCari').value.toLowerCase() : '';

  let data = [...riwayat];
  if (filterMetode) data = data.filter(i => i.metode === filterMetode);
  if (filterCari)   data = data.filter(i => (i.detail || '').toLowerCase().includes(filterCari) || (i.noTrx || '').toLowerCase().includes(filterCari));

  if (!data.length) {
    list.innerHTML = `<tr><td colspan="5"><div class="empty-state"><div class="icon">🧾</div>Belum ada riwayat</div></td></tr>`;
    return;
  }
  list.innerHTML = data.map((item, i) => `
    <tr>
      <td style="font-size:11px;color:var(--text2)">${item.waktu}</td>
      <td style="font-family:'JetBrains Mono',monospace;font-size:12px;color:var(--gold)">Rp ${rupiah(item.total)}</td>
      <td><span class="badge badge-metode-${item.metode || 'Tunai'}">${item.metode || 'Tunai'}</span></td>
      <td style="font-size:11px;color:var(--text2);max-width:140px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${item.detail || '-'}</td>
      <td><button class="btn btn-ghost btn-xs" onclick="cetakUlang(${riwayat.indexOf(item)})">🖨</button></td>
    </tr>`).join('');
}

/* ══════════════════════════════════════════
   RESET
══════════════════════════════════════════ */
function resetLaporan() {
  Swal.fire({
    title: 'Reset semua laporan harian?',
    icon: 'warning',
    background: '#171b24',
    color: '#e8eaf0',
    showCancelButton: true,
    confirmButtonText: 'Ya, Reset',
    confirmButtonColor: '#ef4444',
    cancelButtonText: 'Batal'
  }).then(r => {
    if (r.isConfirmed) {
      laporan = []; statistikProduk = {};
      renderLaporan(); updateDashboard(); simpanData();
      showToast('Laporan direset', 'success');
    }
  });
}

function resetRiwayat() {
  Swal.fire({
    title: 'Reset semua riwayat?',
    icon: 'warning',
    background: '#171b24',
    color: '#e8eaf0',
    showCancelButton: true,
    confirmButtonText: 'Ya, Reset',
    confirmButtonColor: '#ef4444',
    cancelButtonText: 'Batal'
  }).then(r => {
    if (r.isConfirmed) {
      riwayat = []; renderRiwayat(); simpanData();
      showToast('Riwayat direset', 'success');
    }
  });
}

/* ══════════════════════════════════════════
   EXPORT — TXT / CSV / JSON / EXCEL
══════════════════════════════════════════ */
function exportLaporanTxt() {
  if (!laporan.length) { showToast('Belum ada laporan', 'error'); return; }
  let text = `LAPORAN HARIAN ${pengaturan.namaToko}\n${'='.repeat(36)}\n\n`;
  laporan.forEach(item => {
    text += `Tanggal   : ${item.tanggal}\nOmzet     : Rp ${rupiah(item.total)}\nLaba      : Rp ${rupiah(item.laba||0)}\nTransaksi : ${item.transaksi}\nTerlaris  : ${item.terlaris||'-'}\n${'-'.repeat(36)}\n`;
  });
  unduh(text, `laporan_dityaMotor88_${tanggalNama()}.txt`, 'text/plain');
}

function exportLaporanCsv() {
  if (!laporan.length) { showToast('Belum ada laporan', 'error'); return; }
  let csv = 'Tanggal,Omzet,Laba,Transaksi,Produk Terlaris\n';
  laporan.forEach(item => {
    csv += `${item.tanggal},${item.total},${item.laba||0},${item.transaksi},"${item.terlaris||'-'}"\n`;
  });
  unduh(csv, `laporan_dityaMotor88_${tanggalNama()}.csv`, 'text/csv');
}

function exportExcel() {
  if (!laporan.length && !riwayat.length) { showToast('Belum ada data', 'error'); return; }

  // Build workbook using SheetJS (if available) or fallback CSV with .xls header
  if (typeof XLSX !== 'undefined') {
    const wb = XLSX.utils.book_new();

    // Sheet 1: Laporan Harian
    const laporanData = [['Tanggal','Omzet','Laba','Transaksi','Produk Terlaris']];
    laporan.forEach(item => laporanData.push([item.tanggal, item.total, item.laba||0, item.transaksi, item.terlaris||'-']));
    const ws1 = XLSX.utils.aoa_to_sheet(laporanData);
    XLSX.utils.book_append_sheet(wb, ws1, 'Laporan Harian');

    // Sheet 2: Riwayat Transaksi
    const riwayatData = [['No Transaksi','Waktu','Tanggal','Total','Laba','Metode','Kasir','Diskon','Item']];
    riwayat.forEach(item => riwayatData.push([
      item.noTrx||'-', item.waktu, item.tanggal, item.total,
      item.laba||0, item.metode||'-', item.kasir||'-',
      item.diskon||0, item.detail||'-'
    ]));
    const ws2 = XLSX.utils.aoa_to_sheet(riwayatData);
    XLSX.utils.book_append_sheet(wb, ws2, 'Riwayat Transaksi');

    // Sheet 3: Produk
    const produkData = [['Nama','Kategori','Harga Modal','Harga Jual','Stok','Min. Stok']];
    produk.forEach(p => produkData.push([p.nama, p.kategori||'-', p.hargaModal||0, p.harga, p.stok, p.stokMin||3]));
    const ws3 = XLSX.utils.aoa_to_sheet(produkData);
    XLSX.utils.book_append_sheet(wb, ws3, 'Produk');

    XLSX.writeFile(wb, `dityaMotor88_${tanggalNama()}.xlsx`);
    showToast('✅ Excel berhasil diekspor!', 'success');
  } else {
    showToast('Library Excel belum dimuat', 'error');
  }
}

function backupData() {
  const data = { produk, laporan, riwayat, statistikProduk, pengaturan };
  unduh(JSON.stringify(data, null, 2), `backup_dityaMotor88_${tanggalNama()}.json`, 'application/json');
}

function restoreBackup(event) {
  const file = event.target.files[0]; if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    try {
      const data = JSON.parse(e.target.result);
      Swal.fire({
        title: 'Restore backup?',
        text: 'Akan mengganti semua data saat ini.',
        icon: 'warning',
        background: '#171b24',
        color: '#e8eaf0',
        showCancelButton: true,
        confirmButtonText: 'Ya, Restore',
        confirmButtonColor: '#f5c542',
        cancelButtonText: 'Batal'
      }).then(r => {
        if (r.isConfirmed) {
          if (data.produk) produk = data.produk;
          if (data.laporan) laporan = data.laporan;
          if (data.riwayat) riwayat = data.riwayat;
          if (data.statistikProduk) statistikProduk = data.statistikProduk;
          if (data.pengaturan) { pengaturan = data.pengaturan; terapkanPengaturan(); }
          simpanData(); renderProduk(); renderCart(); renderLaporan(); renderRiwayat(); updateDashboard();
          showToast('Backup berhasil direstore ✓', 'success');
        }
      });
    } catch { showToast('File tidak valid', 'error'); }
  };
  reader.readAsText(file);
  event.target.value = '';
}

function unduh(konten, namaFile, tipe) {
  const blob = new Blob([konten], { type: tipe });
  const link = document.createElement('a');
  link.href  = URL.createObjectURL(blob);
  link.download = namaFile; link.click();
}

function tanggalNama() {
  return new Date().toLocaleDateString('id-ID').replace(/\//g,'-');
}

/* ══════════════════════════════════════════
   MODAL HELPERS
══════════════════════════════════════════ */
function tutupModal(id) { document.getElementById(id).classList.remove('active'); }
window.onclick = function(e) {
  ['modalPengaturan','editProdukModal','modalSheets'].forEach(id => {
    const el = document.getElementById(id);
    if (e.target === el) el.classList.remove('active');
  });
};

/* ══════════════════════════════════════════
   GOOGLE SHEETS
══════════════════════════════════════════ */
function bukaModalSheets() {
  document.getElementById('sheetsUrl').value = sheetsUrl;
  document.getElementById('sheetsTestStatus').className  = 'sync-status';
  document.getElementById('sheetsTestStatus').style.display = 'none';
  document.getElementById('modalSheets').classList.add('active');
}
function simpanSheetsUrl() {
  const url = document.getElementById('sheetsUrl').value.trim();
  if (url && !url.startsWith('https://script.google.com')) {
    showToast('URL tidak valid! Harus URL Google Apps Script', 'error'); return;
  }
  sheetsUrl = url;
  localStorage.setItem(DB_KEY.sheets, sheetsUrl);
  tutupModal('modalSheets');
  showToast(sheetsUrl ? '✅ URL Google Sheets tersimpan!' : '❌ URL dikosongkan', 'success');
}
function kirimGET(payload) {
  return new Promise((resolve, reject) => {
    const url     = sheetsUrl + '?data=' + encodeURIComponent(JSON.stringify(payload));
    const timeout = setTimeout(() => resolve({ status: 'ok' }), 8000);
    fetch(url, { method: 'GET', mode: 'no-cors' })
      .then(() => { clearTimeout(timeout); resolve({ status: 'ok' }); })
      .catch(err => { clearTimeout(timeout); reject(err); });
  });
}
async function tesKoneksi() {
  const url = document.getElementById('sheetsUrl').value.trim();
  if (!url) { showToast('Masukkan URL dulu', 'error'); return; }
  const statusEl = document.getElementById('sheetsTestStatus');
  statusEl.className  = 'sync-status loading';
  statusEl.innerText  = '⏳ Mencoba koneksi...';
  statusEl.style.display = 'block';
  const saved = sheetsUrl; sheetsUrl = url;
  try {
    await kirimGET({ action: 'ping', toko: pengaturan.namaToko });
    statusEl.className = 'sync-status success';
    statusEl.innerText = '✅ Koneksi berhasil!';
  } catch(e) {
    statusEl.className = 'sync-status error';
    statusEl.innerText = '❌ Gagal: ' + e.message;
    sheetsUrl = saved;
  }
}
async function kirimKeSheets() {
  if (!sheetsUrl) { bukaModalSheets(); return; }
  if (!lastTrxData) { showToast('Tidak ada data transaksi', 'error'); return; }
  const statusEl = document.getElementById('syncStatus');
  const btnEl    = document.getElementById('btnKirimSheets');
  statusEl.className  = 'sync-status loading';
  statusEl.innerText  = '⏳ Mengirim ke Google Sheets...';
  statusEl.style.display = 'block';
  btnEl.disabled = true;
  try {
    await kirimGET(lastTrxData);
    statusEl.className = 'sync-status success';
    statusEl.innerText = '✅ Berhasil dikirim!';
    btnEl.innerText    = '✅ Sudah Terkirim';
  } catch(e) {
    statusEl.className = 'sync-status error';
    statusEl.innerText = '❌ Gagal: ' + e.message;
    btnEl.disabled = false;
  }
}
async function kirimLaporanKeSheets() {
  if (!sheetsUrl) { bukaModalSheets(); return; }
  if (!laporan.length) { showToast('Belum ada laporan', 'error'); return; }
  showToast('⏳ Mengirim laporan...', '');
  try {
    await kirimGET({ action: 'laporan', laporan, toko: pengaturan.namaToko });
    showToast('✅ Laporan berhasil dikirim ke Google Sheets!', 'success');
  } catch(e) { showToast('❌ Gagal: ' + e.message, 'error'); }
}

/* ══════════════════════════════════════════
   TOAST NOTIFICATION
══════════════════════════════════════════ */
let toastEl;
function showToast(msg, type) {
  if (!toastEl) {
    toastEl = document.createElement('div');
    toastEl.style.cssText = `position:fixed;bottom:20px;left:50%;transform:translateX(-50%);padding:10px 20px;border-radius:10px;font-size:13px;font-weight:600;z-index:999;pointer-events:none;transition:opacity .3s;font-family:'Plus Jakarta Sans',sans-serif;max-width:90vw;text-align:center`;
    document.body.appendChild(toastEl);
  }
  toastEl.innerText     = msg;
  toastEl.style.opacity = '1';
  if (type === 'error')        { toastEl.style.background = '#ef4444'; toastEl.style.color = '#fff'; }
  else if (type === 'success') { toastEl.style.background = '#22c55e'; toastEl.style.color = '#fff'; }
  else                         { toastEl.style.background = '#f5c542'; toastEl.style.color = '#111'; }
  clearTimeout(toastEl._t);
  toastEl._t = setTimeout(() => { toastEl.style.opacity = '0'; }, 2800);
}

/* ══════════════════════════════════════════
   PWA — Service Worker & Install Prompt
══════════════════════════════════════════ */
let deferredPrompt = null;

function initPWA() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }

  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault();
    deferredPrompt = e;
    const banner = document.getElementById('pwaInstallBanner');
    if (banner) banner.classList.add('show');
  });

  window.addEventListener('appinstalled', () => {
    const banner = document.getElementById('pwaInstallBanner');
    if (banner) banner.classList.remove('show');
    deferredPrompt = null;
    showToast('✅ App berhasil diinstall!', 'success');
  });
}

function installPWA() {
  if (!deferredPrompt) return;
  deferredPrompt.prompt();
  deferredPrompt.userChoice.then(() => { deferredPrompt = null; });
}

function dismissPWA() {
  const banner = document.getElementById('pwaInstallBanner');
  if (banner) banner.classList.remove('show');
}

/* ══════════════════════════════════════════
   INIT
══════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', () => {
  initLogin();
  initPWA();
  terapkanPengaturan();
  renderProduk();
  renderCart();
  renderLaporan();
  renderRiwayat();
  updateDashboard();
});
