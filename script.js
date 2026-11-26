/* ============ KONFIGURASI ============ */
const API_URL = 'https://script.google.com/macros/s/AKfycbxiVQW5ZxiDEG6KYiQV0wD6lc_HPk55LmspL9IxZp1Cc0vi_K4ecxfEIoQLRswF8hsr/exec';

/* ============ STATE & HELPER ============ */
let sesi = { role: '', pw: '', cfg: {} };
let scanner = null, lastScan = 0, posisi = null, gpsWatch = null;
let exportData = { head: [], rows: [] };
let donut = null, bar = null;
const $ = id => document.getElementById(id);
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const BADGE = { 'Masuk': 'badge-success', 'Terlambat': 'badge-warning', 'Izin': 'badge-info', 'Sakit': 'badge-purple', 'Alfa': 'badge-danger', 'Belum Absen': 'badge-gray' };
const STATUS = ['Masuk', 'Terlambat', 'Izin', 'Sakit', 'Alfa'];

async function api(params) {
  try {
    const r = await fetch(API_URL + '?' + new URLSearchParams(params));
    return await r.json();
  } catch (e) { return { ok: false, msg: 'Gagal terhubung ke server' }; }
}

function playClickSound() {
  try {
    const a = new (window.AudioContext || window.webkitAudioContext)();
    const o = a.createOscillator(), g = a.createGain();
    o.connect(g); g.connect(a.destination);
    o.frequency.value = 660; g.gain.value = 0.05;
    o.start(); o.stop(a.currentTime + 0.06);
  } catch (e) {}
}

function showToast(msg) {
  const t = $('toast-notification');
  t.textContent = msg; t.classList.add('show');
  clearTimeout(showToast.t);
  showToast.t = setTimeout(() => t.classList.remove('show'), 3200);
}

function showPage(id) {
  ['login-page', 'student-page', 'teacher-page', 'admin-page', 'qr-page'].forEach(p => $(p).style.display = 'none');
  const el = $(id);
  el.style.display = 'block';
  el.classList.remove('animate-entrance'); void el.offsetWidth; el.classList.add('animate-entrance');
}

function toggleTheme() {
  document.body.dataset.theme = document.body.dataset.theme === 'light' ? 'dark' : 'light';
}

/* Sandi sekarang wajib untuk semua peran */
document.querySelector('label[for="password-input"]').textContent = 'Kata Sandi:';

/* ============ LOGIN ============ */
async function handleLogin() {
  const role = $('role-select').value, pw = $('password-input').value.trim();
  if (!pw) return showToast('⚠️ Masukkan kata sandi dulu');
  if (API_URL.startsWith('GANTI')) return showToast('⚠️ API_URL belum diisi di script.js');
  showToast('⏳ Memeriksa sandi...');
  const r = await api({ action: 'login', role, pw });
  if (!r.ok) return showToast('❌ ' + r.msg);
  sesi = { role, pw, cfg: r };
  $('password-input').value = '';
  $('toast-notification').classList.remove('show');
  if (role === 'siswa') bukaSiswa();
  else if (role === 'guru') bukaGuru();
  else bukaAdmin();
}

async function goBackToLogin() {
  await hentikanScanner();
  if (gpsWatch !== null) { navigator.geolocation.clearWatch(gpsWatch); gpsWatch = null; }
  sesi = { role: '', pw: '', cfg: {} };
  showPage('login-page');
}

/* ============ SISWA: GPS + SCANNER ============ */
function jarak(la1, lo1, la2, lo2) {
  const R = 6371000, r = Math.PI / 180;
  const a = Math.sin((la2 - la1) * r / 2) ** 2 + Math.cos(la1 * r) * Math.cos(la2 * r) * Math.sin((lo2 - lo1) * r / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function updateGpsBox() {
  const box = $('gps-status'), c = sesi.cfg;
  if (!posisi) return;
  if (c.lat && c.lng) {
    const d = Math.round(jarak(+c.lat, +c.lng, posisi.latitude, posisi.longitude));
    const ok = d <= (+c.radius || 150);
    box.textContent = ok ? '✅ Di area sekolah (' + d + ' m dari titik)' : '⚠️ Di luar area sekolah (' + d + ' m)';
    box.style.color = ok ? '#10b981' : '#ef4444';
    box.style.borderColor = ok ? '#10b981' : '#ef4444';
    box.style.background = ok ? 'rgba(16,185,129,.15)' : 'rgba(239,68,68,.15)';
  } else box.textContent = '📡 GPS aktif';
}

function mulaiGPS() {
  if (!navigator.geolocation) { $('gps-status').textContent = '❌ Perangkat tidak mendukung GPS'; return; }
  gpsWatch = navigator.geolocation.watchPosition(
    p => { posisi = p.coords; updateGpsBox(); },
    () => { $('gps-status').textContent = '❌ Izin lokasi ditolak / GPS mati'; },
    { enableHighAccuracy: true, maximumAge: 5000 }
  );
}

function bukaSiswa() {
  showPage('student-page');
  $('result').textContent = 'Menunggu pemindaian QR...';
  mulaiGPS();
  mulaiScanner();
  isiDaftarKelas();
}

async function hentikanScanner() {
  if (scanner) {
    try { if (scanner.isScanning) await scanner.stop(); scanner.clear(); } catch (e) {}
    scanner = null;
  }
}

async function mulaiScanner() {
  await hentikanScanner();
  scanner = new Html5Qrcode('reader');
  try {
    await scanner.start({ facingMode: $('camera-select').value }, { fps: 10, qrbox: { width: 220, height: 220 } }, onScanSukses, () => {});
  } catch (e) { $('result').textContent = '❌ Kamera tidak bisa dibuka (izinkan akses kamera & gunakan HTTPS)'; }
}

function switchCameraMode() { mulaiScanner(); }

async function onScanSukses(text) {
  const now = Date.now();
  if (now - lastScan < 4000) return;
  lastScan = now;
  $('result').textContent = '⏳ Memproses...';
  const r = await api({ action: 'scan', pw: sesi.pw, nisn: text.trim(), lat: posisi ? posisi.latitude : '', lng: posisi ? posisi.longitude : '' });
  if (r.ok) {
    $('result').innerHTML = '✅ <b>' + esc(r.nama) + '</b> (' + esc(r.kelas) + ')<br>' + esc(r.status) + ' • ' + esc(r.jam);
    showToast('✨ Absensi ' + r.status + ' tercatat!');
  } else $('result').innerHTML = '❌ ' + esc(r.msg);
}

/* ============ FILTER KELAS (dari spreadsheet) ============ */
async function opsiKelasHTML() {
  const r = await api({ action: 'kelas', pw: sesi.pw });
  const daftar = r.ok ? r.kelas : [];
  return '<option value="semua">📂 Semua Siswa</option><option value="X">Kelas X</option><option value="XI">Kelas XI</option><option value="XII">Kelas XII</option>' +
    (daftar.length ? '<optgroup label="Per Kelas">' + daftar.map(k => '<option value="' + esc(k) + '">' + esc(k) + '</option>').join('') + '</optgroup>' : '');
}

/* ============ GURU ============ */
async function bukaGuru() {
  showPage('teacher-page');
  $('filter-kelas').innerHTML = await opsiKelasHTML();
  muatGuru();
}
function gantiPeriodeRekap() { muatGuru(); }
function filterDataKelas() { muatGuru(); }

async function muatGuru() {
  const periode = $('filter-periode').value, kelas = $('filter-kelas').value;
  const thead = document.querySelector('#tabel-absensi thead'), tbody = document.querySelector('#tabel-absensi tbody');
  tbody.innerHTML = '<tr><td colspan="8">⏳ Memuat data...</td></tr>';

  if (periode === 'harian') {
    const r = await api({ action: 'list', pw: sesi.pw, kelas });
    if (!r.ok) { tbody.innerHTML = '<tr><td colspan="8">❌ ' + esc(r.msg) + '</td></tr>'; return; }
    thead.innerHTML = '<tr><th>No</th><th>Nama Siswa</th><th>Kelas</th><th>Status</th><th>Ubah Status</th></tr>';
    exportData = { head: ['No', 'NISN', 'Nama', 'Kelas', 'Status', 'Keterangan', 'Jam'], rows: [] };
    tbody.innerHTML = r.rows.map((s, i) => {
      exportData.rows.push([i + 1, s.nisn, s.nama, s.kelas, s.status, s.ket, s.jam]);
      const opsi = (s.status === 'Belum Absen' ? '<option value="" disabled selected>Belum Absen</option>' : '') +
        STATUS.map(x => '<option value="' + x + '"' + (x === s.status ? ' selected' : '') + '>' + x + '</option>').join('');
      return '<tr data-nisn="' + esc(s.nisn) + '"><td>' + String(i + 1).padStart(2, '0') + '</td><td><strong>' + esc(s.nama) + '</strong></td><td>' + esc(s.kelas) +
        '</td><td><span class="badge ' + (BADGE[s.status] || 'badge-gray') + '">' + esc(s.status) + '</span>' + (s.ket ? '<span class="ket-text">' + esc(s.ket) + '</span>' : '') +
        '</td><td><select class="select-sm" onchange="playClickSound(); ubahStatus(this, \'' + esc(s.nama).replace(/&#39;/g, '') + '\');">' + opsi + '</select></td></tr>';
    }).join('') || '<tr><td colspan="5">Tidak ada siswa</td></tr>';
  } else {
    const r = await api({ action: 'rekapSiswa', pw: sesi.pw, kelas, periode });
    if (!r.ok) { tbody.innerHTML = '<tr><td colspan="8">❌ ' + esc(r.msg) + '</td></tr>'; return; }
    thead.innerHTML = '<tr><th>No</th><th>Nama Siswa</th><th>Kelas</th><th>Masuk</th><th>Telat</th><th>Izin</th><th>Sakit</th><th>Alfa</th></tr>';
    exportData = { head: ['No', 'NISN', 'Nama', 'Kelas', 'Masuk', 'Terlambat', 'Izin', 'Sakit', 'Alfa'], rows: [] };
    tbody.innerHTML = r.rows.map((s, i) => {
      const c = s.c;
      exportData.rows.push([i + 1, s.nisn, s.nama, s.kelas, c.Masuk, c.Terlambat, c.Izin, c.Sakit, c.Alfa]);
      return '<tr><td>' + String(i + 1).padStart(2, '0') + '</td><td><strong>' + esc(s.nama) + '</strong></td><td>' + esc(s.kelas) + '</td><td>' + c.Masuk + '</td><td>' + c.Terlambat + '</td><td>' + c.Izin + '</td><td>' + c.Sakit + '</td><td>' + c.Alfa + '</td></tr>';
    }).join('') || '<tr><td colspan="8">Tidak ada siswa</td></tr>';
  }
}

async function ubahStatus(sel, nama) {
  const nisn = sel.closest('tr').dataset.nisn, status = sel.value;
  let ket = '';
  if (status === 'Izin' || status === 'Sakit') {
    const a = prompt('Alasan ' + status + ' untuk ' + nama + ':', '');
    if (a === null) { muatGuru(); return; }
    ket = a.trim();
  }
  const r = await api({ action: 'setStatus', pw: sesi.pw, nisn, status, ket });
  showToast(r.ok ? '✅ ' + nama + ' → ' + status : '❌ ' + r.msg);
  muatGuru();
}

function exportToExcel() {
  if (!exportData.rows.length) return showToast('⚠️ Belum ada data untuk diunduh');
  const ws = XLSX.utils.aoa_to_sheet([exportData.head].concat(exportData.rows));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Rekap');
  const nama = 'Rekap_' + $('filter-periode').value + '_' + $('filter-kelas').value.replace(/\s+/g, '') + '_' + new Date().toISOString().slice(0, 10) + '.xlsx';
  XLSX.writeFile(wb, nama);
}

/* ============ ADMIN ============ */
async function bukaAdmin() {
  showPage('admin-page');
  if (!$('admin-kelas-select')) {
    const g = document.createElement('div');
    g.className = 'form-group'; g.style.marginBottom = '10px';
    g.innerHTML = '<label for="admin-kelas-select">Filter Kelas:</label><select id="admin-kelas-select" onchange="playClickSound(); updateAdminRekap();"></select>';
    $('admin-periode-select').parentElement.after(g);
  }
  $('admin-kelas-select').innerHTML = await opsiKelasHTML();
  updateAdminRekap();
}

async function updateAdminRekap() {
  const periode = $('admin-periode-select').value, kelas = $('admin-kelas-select').value;
  const nm = { harian: 'Harian (Real-time)', mingguan: 'Mingguan', bulanan: 'Bulanan', tahunan: 'Tahunan' };
  $('label-periode-admin').textContent = 'Memuat...';
  const r = await api({ action: 'rekap', pw: sesi.pw, periode, kelas });
  if (!r.ok) { $('label-periode-admin').textContent = '❌ ' + r.msg; return; }
  $('label-periode-admin').textContent = 'Rekapitulasi: ' + nm[periode] + ' • ' + (kelas === 'semua' ? 'Semua Siswa' : kelas.startsWith('X') && !kelas.includes(' ') ? 'Kelas ' + kelas : kelas) +
    ' • ' + r.range.start + (r.range.start !== r.range.end ? ' s/d ' + r.range.end : '');
  const c = r.counts;
  $('stat-total').textContent = r.total;
  $('stat-hadir').textContent = c.Masuk;
  $('stat-telat').textContent = c.Terlambat;
  $('stat-pulang').textContent = '-';
  $('stat-izin').textContent = c.Izin;
  $('stat-sakit').textContent = c.Sakit;
  $('stat-alfa').textContent = c.Alfa;
  $('stat-persen').textContent = r.persen + '%';

  const data = [c.Masuk, c.Terlambat, c.Izin, c.Sakit, c.Alfa];
  const labels = ['Masuk', 'Terlambat', 'Izin', 'Sakit', 'Alfa'];
  const warna = ['#10b981', '#f59e0b', '#3b82f6', '#8b5cf6', '#ef4444'];
  if (donut) donut.destroy();
  if (bar) bar.destroy();
  donut = new Chart($('donutChart'), { type: 'doughnut', data: { labels, datasets: [{ data, backgroundColor: warna, borderWidth: 0 }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'right', labels: { boxWidth: 10, font: { size: 9 } } } } } });
  bar = new Chart($('barChart'), { type: 'bar', data: { labels, datasets: [{ data, backgroundColor: warna, borderRadius: 6 }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { precision: 0, font: { size: 9 } } }, x: { ticks: { font: { size: 9 } } } } } });

  const medal = ['🥇 1', '🥈 2', '🥉 3'];
  $('admin-page').querySelector('.leaderboard-list').innerHTML = r.top.length
    ? r.top.map((t, i) => '<div class="lb-item"><span class="lb-rank">' + medal[i] + '</span><span class="lb-name">' + esc(t.nama) + ' (' + esc(t.kelas) + ')</span><span class="lb-score">' + t.skor + '% Tepat Waktu</span></div>').join('')
    : '<div class="lb-item">Belum ada data bulan ini</div>';
}

/* ============ GENERATOR QR ============ */
let semuaSiswa = [];

function buatQr(el, nisn, ukuran) {
  el.innerHTML = '';
  new QRCode(el, { text: String(nisn), width: ukuran, height: ukuran, colorDark: '#000000', colorLight: '#ffffff', correctLevel: QRCode.CorrectLevel.M });
}

/* Siswa: buat kartu QR milik sendiri dari NISN */
async function buatKartuSaya() {
  const nisn = $('nisn-input').value.replace(/\s+/g, '');
  if (!/^\d{10}$/.test(nisn)) return showToast('⚠️ NISN harus 10 digit angka');
  showToast('⏳ Memeriksa data...');
  // Server: kalau NISN sudah ada -> pakai data lama (tidak disimpan ulang). Kalau belum -> disimpan sekali.
  const r = await api({ action: 'daftar', pw: sesi.pw, nisn, nama: $('nama-input').value, kelas: $('kelas-input').value });
  if (!r.ok) return showToast('❌ ' + r.msg);
  $('card-nama').textContent = r.nama;
  $('card-nisn').textContent = 'NISN: ' + r.nisn;
  $('card-kelas').textContent = 'Kelas: ' + r.kelas;
  $('nama-input').value = r.nama;
  $('kelas-input').value = r.kelas;
  buatQr($('my-qr'), r.nisn, 80);
  showToast(r.baru ? '✅ Siswa baru tersimpan! Kartu QR siap dicetak' : '✨ Data sudah ada, kartu ditampilkan (tidak dobel)');
}

async function isiDaftarKelas() {
  const r = await api({ action: 'kelas', pw: sesi.pw });
  if (r.ok) $('daftar-kelas').innerHTML = r.kelas.map(k => '<option value="' + esc(k) + '">').join('');
}

/* Guru/Admin: generator QR semua siswa */
async function bukaQrPage() {
  showPage('qr-page');
  $('qr-grid').innerHTML = '';
  $('qr-info').textContent = '⏳ Memuat data siswa...';
  const r = await api({ action: 'siswa', pw: sesi.pw });
  if (!r.ok) { $('qr-info').textContent = '❌ ' + r.msg; return; }
  semuaSiswa = r.siswa;
  const kelas = [...new Set(semuaSiswa.map(s => s.kelas))].sort();
  $('qr-kelas').innerHTML = '<option value="semua">📂 Semua Siswa</option><option value="X">Kelas X</option><option value="XI">Kelas XI</option><option value="XII">Kelas XII</option>' +
    (kelas.length ? '<optgroup label="Per Kelas">' + kelas.map(k => '<option value="' + esc(k) + '">' + esc(k) + '</option>').join('') + '</optgroup>' : '');
  renderQr();
}

function renderQr() {
  const kf = $('qr-kelas').value, q = $('qr-cari').value.trim().toLowerCase();
  const list = semuaSiswa.filter(s =>
    (kf === 'semua' || s.kelas === kf || s.kelas.split(/\s+/)[0] === kf) &&
    (!q || s.nama.toLowerCase().includes(q) || s.nisn.includes(q)));
  $('qr-info').textContent = 'Menampilkan ' + list.length + ' dari ' + semuaSiswa.length + ' siswa';
  const grid = $('qr-grid');
  grid.innerHTML = '';
  list.forEach(s => {
    const c = document.createElement('div');
    c.className = 'qr-card';
    c.innerHTML = '<div class="qr-head">SMKN 1 GUNUNG SINDUR</div><div class="qr-img"></div>' +
      '<div class="qr-nama">' + esc(s.nama) + '</div><div class="qr-info">NISN: ' + esc(s.nisn) + '</div><div class="qr-info">Kelas: ' + esc(s.kelas) + '</div>';
    grid.appendChild(c);
    buatQr(c.querySelector('.qr-img'), s.nisn, 110);
  });
}

function cetakQr() {
  if (!$('qr-grid').children.length) return showToast('⚠️ Belum ada QR untuk dicetak');
  document.body.classList.add('print-qr');
  window.print();
}
window.addEventListener('afterprint', () => document.body.classList.remove('print-qr'));

function tutupQrPage() { showPage(sesi.role === 'admin' ? 'admin-page' : 'teacher-page'); }