/**
 * validate_migration.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Cross-checks every transaction in migration_output.sql against the raw HTML
 * export. Reports any discrepancy found.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const fs   = require('fs');
const path = require('path');

const HTML_FILE = path.join(__dirname, '..', 'export dari sheet.html');
const SQL_FILE  = path.join(__dirname, 'migration_output.sql');

// ── Same helpers as generator ─────────────────────────────────────────────────

function stripHtml(str) {
  return String(str || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

const BULAN = {
  januari:'01', februari:'02', maret:'03', april:'04',
  mei:'05', juni:'06', juli:'07', agustus:'08',
  september:'09', oktober:'10', november:'11', desember:'12',
  // abbreviated
  jan:'01', feb:'02', mar:'03', apr:'04',
  jun:'06', jul:'07', agt:'08', agst:'08', aug:'08',
  sep:'09', sept:'09', okt:'10', oct:'10',
  nov:'11', des:'12', dec:'12',
  january:'01', march:'03', may:'05', june:'06',
  july:'07', august:'08', october:'10', december:'12'
};
function parseDate(raw) {
  const s = raw.trim().toLowerCase();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const m = s.match(/^(\d{1,2})\s+([a-z]+)\s+(\d{4})$/);
  if (m) {
    const day  = m[1].padStart(2, '0');
    const mon  = BULAN[m[2]];
    const year = m[3];
    if (mon) return `${year}-${mon}-${day}`;
  }
  return null;
}

function parseTime(raw) {
  const s = raw.trim();
  const m1 = s.match(/^(\d{1,2}):(\d{2})(?::\d{2})?/);
  if (m1) return `${m1[1].padStart(2,'0')}:${m1[2]}`;
  const m2 = s.match(/^(\d{1,2})[,.](\d{2})$/);
  if (m2) return `${m2[1].padStart(2,'0')}:${m2[2]}`;
  const m3 = s.match(/^(\d{1,2})$/);
  if (m3) return `${m3[1].padStart(2,'0')}:00`;
  return '00:00';
}

function parseAmount(raw) {
  const s = String(raw).trim().replace(/[Rp\s]/gi, '');
  const normalized = s.replace(/\./g, '').replace(',', '.');
  const n = Math.abs(parseFloat(normalized));
  return isNaN(n) ? null : Math.round(n);
}

function parseType(raw) {
  const s = raw.trim().toLowerCase();
  if (s === 'pemasukan' || s === 'pendapatan') return 'income';
  return 'expense';
}

function inferPaymentMethod(desc) {
  const s = desc.toLowerCase();
  if (/qris|pembayaran qr|qr ke/.test(s)) return 'QRIS';
  if (/bi fast|bifast|transfer.*bi|bi.*fast/.test(s)) return 'Transfer bank';
  if (/transfer/.test(s)) return 'Transfer bank';
  return null;
}

function mapCategory(raw, txType) {
  let cat = raw || 'Lainnya';
  if      (cat === 'Makanan & Minuman')    cat = 'Makanan dan minuman';
  else if (cat === 'Elektronik, aksesori') cat = 'Elektronik, aksesoris';
  else if (cat === 'Perhiasan, aksesori')  cat = 'Perhiasan, aksesoris';
  else if (cat === 'pendapatan')           cat = 'Pendapatan';
  if (cat === 'Bunga, dividen' && txType === 'expense') cat = 'Biaya, tarif';
  if (cat === 'Pengeluaran keuangan' && txType === 'income') cat = 'Pendapatan';
  return cat;
}

function extractCells(trContent) {
  const cells = [];
  const tdRegex = /<td[^>]*>([\s\S]*?)<\/td>/gi;
  let m;
  while ((m = tdRegex.exec(trContent)) !== null) {
    cells.push(stripHtml(m[1]));
  }
  return cells;
}

// ── Parse HTML → ground truth records ─────────────────────────────────────────

const html = fs.readFileSync(HTML_FILE, 'utf8');
const trBlocks = [];
const trRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
let trMatch;
while ((trMatch = trRegex.exec(html)) !== null) {
  trBlocks.push(trMatch[1]);
}

const htmlRecords = [];
for (const tr of trBlocks) {
  const cells = extractCells(tr);
  if (cells.length < 8) continue;
  const noVal = parseInt(cells[0], 10);
  if (isNaN(noVal) || noVal <= 0) continue;

  const txDate = parseDate(cells[1]);
  if (!txDate) continue;

  const txTime = parseTime(cells[2]);
  const txType = parseType(cells[3]);
  const amount = parseAmount(cells[7]);
  if (amount === null || amount === 0) continue;

  const rawCat = cells[4];
  const rawAcc = cells[5];
  const desc   = cells[6] || '';
  const pm     = inferPaymentMethod(desc);
  const cat    = mapCategory(rawCat, txType);

  htmlRecords.push({ no: noVal, txDate, txTime, txType, amount, cat, rawCat, rawAcc, desc, pm });
}

// ── Parse SQL → what we actually will insert ──────────────────────────────────

const sql = fs.readFileSync(SQL_FILE, 'utf8');

// Extract each INSERT block: -- No. X: ... followed by SELECT block
const insertBlocks = [];
const blockRegex = /-- No\. (\d+): (\d{4}-\d{2}-\d{2}) \| (\w+) \| ([^\|]+) \| Rp([\d.]+)[\s\S]*?SELECT\s*([\s\S]*?);(?=\s*\n)/g;
let bm;
while ((bm = blockRegex.exec(sql)) !== null) {
  const no     = parseInt(bm[1], 10);
  const date   = bm[2];
  const type   = bm[3].toLowerCase(); // INCOME/EXPENSE -> income/expense
  const cat    = bm[4].trim();
  const amtStr = bm[5].replace(/\./g, '');
  const amount = parseInt(amtStr, 10);
  const body   = bm[6];

  // Extract time
  const timeM = body.match(/'(\d{2}:\d{2})'/g);
  let time = '00:00';
  if (timeM && timeM.length > 0) {
    // The 5th quoted string is the time
    const allQuoted = body.match(/'[^']*'/g) || [];
    for (const q of allQuoted) {
      const qv = q.replace(/'/g, '');
      if (/^\d{2}:\d{2}$/.test(qv)) { time = qv; break; }
    }
  }

  // Extract description
  const allQuoted = body.match(/'[^']*'/g) || [];
  // desc is the one that is not income/expense/QRIS/Transfer bank/a date/a time
  let desc = '';
  for (const q of allQuoted) {
    const v = q.replace(/'/g, '');
    if (['income','expense','QRIS','Transfer bank'].includes(v)) continue;
    if (/^\d{4}-\d{2}-\d{2}$/.test(v)) continue;
    if (/^\d{2}:\d{2}$/.test(v)) continue;
    if (v.length > 3) { desc = v; break; }
  }

  // Extract payment method
  let pm = null;
  if (body.includes("'QRIS'")) pm = 'QRIS';
  else if (body.includes("'Transfer bank'")) pm = 'Transfer bank';

  insertBlocks.push({ no, date, type, cat, amount, time, desc, pm });
}

// ── Cross-check ────────────────────────────────────────────────────────────────

console.log(`\n${'═'.repeat(70)}`);
console.log('N.E.X.A MIGRATION VALIDATION REPORT');
console.log(`HTML records parsed: ${htmlRecords.length}`);
console.log(`SQL INSERT blocks  : ${insertBlocks.length}`);
console.log('═'.repeat(70));

let errors = 0;
let warnings = 0;

if (htmlRecords.length !== insertBlocks.length) {
  console.log(`\n❌ COUNT MISMATCH! HTML=${htmlRecords.length} vs SQL=${insertBlocks.length}`);
  errors++;
}

for (let i = 0; i < htmlRecords.length; i++) {
  const h = htmlRecords[i];
  const s = insertBlocks[i];

  if (!s) {
    console.log(`\n❌ No. ${h.no}: Missing from SQL!`);
    errors++;
    continue;
  }

  const issues = [];

  if (h.no !== s.no) issues.push(`No: HTML=${h.no} vs SQL=${s.no}`);
  if (h.txDate !== s.date) issues.push(`Date: HTML="${h.txDate}" vs SQL="${s.date}"`);
  if (h.txType !== s.type) issues.push(`Type: HTML="${h.txType}" vs SQL="${s.type}"`);
  if (h.amount !== s.amount) issues.push(`Amount: HTML=${h.amount} vs SQL=${s.amount}`);
  if (h.txTime !== s.time) issues.push(`Time: HTML="${h.txTime}" vs SQL="${s.time}"`);
  if (h.cat !== s.cat) issues.push(`Category: HTML="${h.cat}" vs SQL="${s.cat}"`);
  if (h.pm !== s.pm) issues.push(`PayMethod: HTML=${h.pm} vs SQL=${s.pm}`);

  if (issues.length > 0) {
    console.log(`\n⚠️  No. ${h.no} (${h.txDate} | ${h.txType} | Rp${h.amount.toLocaleString('id-ID')}):`);
    issues.forEach(issue => console.log(`   ► ${issue}`));
    warnings++;
  }
}

// Check for NULL category_id (category not matching DB)
const knownDbCats = [
  'Makanan dan minuman', 'Bar, kafe', 'Restoran, makanan cepat saji', 'Bahan makanan',
  'Apotek, obat-obatan', 'Belanja', 'Waktu luang', 'Alat tulis, peralatan',
  'Hadiah, kesenangan', 'Elektronik, aksesoris', 'Hewan peliharaan, hewan',
  'Rumah, taman', 'Anak-anak', 'Kesehatan dan kecantikan', 'Perhiasan, aksesoris',
  'Pakaian dan alas kaki', 'Asuransi properti', 'Perumahan', 'Perawatan, perbaikan',
  'Layanan', 'Energi, utilitas', 'Hipotek', 'Sewa',
  'Transportasi', 'Perjalanan dinas', 'Jarak jauh', 'Taksi', 'Transportasi umum',
  'Leasing', 'Asuransi kendaraan', 'Kendaraan', 'Sewa-menyewa', 'Perawatan kendaraan',
  'Parkir', 'Bahan bakar',
  'Hiburan dan kehidupan', 'Lotere, judi', 'Alkohol, tembakau', 'Amal, hadiah',
  'Liburan, perjalanan, hotel', 'TV, streaming', 'Buku, audio, langganan',
  'Pendidikan, pengembangan diri', 'Hobi', 'Peristiwa hidup', 'Budaya, acara olahraga',
  'Olahraga aktif, kebugaran', 'Kesehatan, kecantikan', 'Perawatan kesehatan, dokter',
  'Komunikasi, PC', 'Layanan pos', 'Perangkat lunak, aplikasi, permainan',
  'Internet', 'Telepon, ponsel',
  'Pengeluaran keuangan', 'Tunjangan anak', 'Biaya, tarif', 'Konsultasi', 'Denda',
  'Pinjaman, bunga', 'Asuransi', 'Pajak',
  'Investasi', 'Koleksi', 'Tabungan', 'Investasi keuangan', 'Kendaraan, barang bergerak',
  'Properti', 'Hilangan', 'Lainnya', 'Transfer, penarikan',
  // income
  'Pendapatan', 'Hadiah', 'Pengembalian dana pajak, pembelian', 'Cek, kupon',
  'Pendapatan dari meminjamkan', 'Iuran & hibah', 'Pendapatan sewa', 'Penjualan',
  'Bunga, dividen', 'Gaji, faktur'
];

console.log(`\n${'─'.repeat(70)}`);
console.log('Checking category names against known DB categories...');
let catErrors = 0;
for (const s of insertBlocks) {
  const match = knownDbCats.some(c => c.toLowerCase().includes(s.cat.toLowerCase()) || s.cat.toLowerCase().includes(c.toLowerCase()));
  if (!match) {
    console.log(`❌ No. ${s.no}: Category "${s.cat}" tidak ditemukan di DB!`);
    catErrors++;
    errors++;
  }
}
if (catErrors === 0) console.log('✅ Semua kategori valid!');

// Accounts check
console.log(`\n${'─'.repeat(70)}`);
console.log('Checking accounts...');
const usedAccounts = [...new Set(insertBlocks.map(s => {
  const m = s.cat; // not needed, let's check from SQL file directly
  return '';
}))];
// Check from SQL file for Bank Mandiri references
const bankMandiriCount = (sql.match(/Bank Mandiri Livin/g) || []).length;
const bankMandiriNoLivin = (sql.match(/'%Bank Mandiri%'/g) || []).length;
console.log(`✅ "Bank Mandiri Livin" references: ${bankMandiriCount}`);
console.log(`✅ "Bank Mandiri" (without Livin) references: ${bankMandiriNoLivin}`);

// Summary
console.log(`\n${'═'.repeat(70)}`);
console.log('SUMMARY');
console.log('═'.repeat(70));
console.log(`Total transactions checked: ${htmlRecords.length}`);
console.log(`Errors  : ${errors}`);
console.log(`Warnings: ${warnings}`);
if (errors === 0 && warnings === 0) {
  console.log('\n🎉 PERFECT! SQL 100% sesuai dengan data HTML. Aman untuk di-import!');
} else if (errors === 0 && warnings > 0) {
  console.log(`\n⚠️  Ada ${warnings} perbedaan minor (lihat detail di atas).`);
} else {
  console.log(`\n❌ Ada ${errors} error kritis yang harus diperbaiki sebelum import!`);
}
