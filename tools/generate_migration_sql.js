/**
 * generate_migration_sql.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Parses the Google Sheets HTML export and generates a SQL file ready to run
 * in the Supabase SQL Editor.
 *
 * Usage: node tools/generate_migration_sql.js
 * Output: tools/migration_output.sql
 * ─────────────────────────────────────────────────────────────────────────────
 */

const fs   = require('fs');
const path = require('path');

const HTML_FILE = path.join(__dirname, '..', 'export dari sheet.html');
const OUT_FILE  = path.join(__dirname, 'migration_output.sql');

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Strip all HTML tags from a string */
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

/** "9 Februari 2026" → "2026-02-09" */
const BULAN = {
  // Full Indonesian month names
  januari: '01', februari: '02', maret: '03', april: '04',
  mei: '05', juni: '06', juli: '07', agustus: '08',
  september: '09', oktober: '10', november: '11', desember: '12',
  // Abbreviated (used by Google Sheets HTML export for later months)
  jan: '01', feb: '02', mar: '03', apr: '04',
  jun: '06', jul: '07', agt: '08', agst: '08', aug: '08',
  sep: '09', sept: '09', okt: '10', oct: '10',
  nov: '11', des: '12', dec: '12',
  // English full names (just in case)
  january: '01', march: '03', may: '05', june: '06',
  july: '07', august: '08', october: '10', december: '12'
};
function parseDate(raw) {
  const s = raw.trim().toLowerCase();
  // Already YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  // "DD Month YYYY" or "DD Mon YYYY"
  const m = s.match(/^(\d{1,2})\s+([a-z]+)\s+(\d{4})$/);
  if (m) {
    const day  = m[1].padStart(2, '0');
    const mon  = BULAN[m[2]];
    const year = m[3];
    if (mon) return `${year}-${mon}-${day}`;
  }
  return null;
}


/** "14,45" or "14.45" or "23:30:35 WIB" → "14:45" */
function parseTime(raw) {
  const s = raw.trim();
  // "HH:MM:SS WIB" or "HH:MM:SS"
  const m1 = s.match(/^(\d{1,2}):(\d{2})(?::\d{2})?/);
  if (m1) return `${m1[1].padStart(2,'0')}:${m1[2]}`;
  // "14,45" or "14.45"
  const m2 = s.match(/^(\d{1,2})[,.](\d{2})$/);
  if (m2) return `${m2[1].padStart(2,'0')}:${m2[2]}`;
  // Single number like "16" → "16:00"
  const m3 = s.match(/^(\d{1,2})$/);
  if (m3) return `${m3[1].padStart(2,'0')}:00`;
  return '00:00';
}

/** "3.600.000,00" or "-3.900.000,00" or "-2500" → absolute integer */
function parseAmount(raw) {
  const s = String(raw).trim().replace(/[Rp\s]/gi, '');
  // Remove thousand separators (dots) and replace comma decimal with dot
  const normalized = s.replace(/\./g, '').replace(',', '.');
  const n = Math.abs(parseFloat(normalized));
  return isNaN(n) ? null : Math.round(n);
}

/** "Pemasukan"/"Pendapatan" → 'income', else → 'expense' */
function parseType(raw) {
  const s = raw.trim().toLowerCase();
  if (s === 'pemasukan' || s === 'pendapatan') return 'income';
  return 'expense';
}

/** Infer payment method from description */
function inferPaymentMethod(desc) {
  const s = desc.toLowerCase();
  if (/qris|pembayaran qr|qr ke/.test(s)) return 'QRIS';
  if (/bi fast|bifast|transfer.*bi|bi.*fast/.test(s)) return 'Transfer bank';
  if (/transfer/.test(s)) return 'Transfer bank';
  return null;
}

/** Escape single quotes for SQL */
function sqlStr(s) {
  return String(s || '').replace(/'/g, "''");
}

// ── Parse HTML ────────────────────────────────────────────────────────────────

console.log('Reading HTML file...');
const html = fs.readFileSync(HTML_FILE, 'utf8');

// Extract all <tr> blocks
const trBlocks = [];
const trRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
let trMatch;
while ((trMatch = trRegex.exec(html)) !== null) {
  trBlocks.push(trMatch[1]);
}

console.log(`Found ${trBlocks.length} rows total (including header rows).`);

// Extract <td> cells from each row
function extractCells(trContent) {
  const cells = [];
  // Match <td ...>...</td> including nested tags
  const tdRegex = /<td[^>]*>([\s\S]*?)<\/td>/gi;
  let m;
  while ((m = tdRegex.exec(trContent)) !== null) {
    cells.push(stripHtml(m[1]));
  }
  return cells;
}

// ── Build records ─────────────────────────────────────────────────────────────
// Header row (row 4 in sheet) has: No | Tanggal | Waktu | Tipe | Kategori | Akun | Catatan/Detail | Nominal | Saldo | ...
// Data starts from row 5 onwards (index in trBlocks where cells[0] is a number)

const records = [];
let skipped = 0;

for (const tr of trBlocks) {
  const cells = extractCells(tr);
  if (cells.length < 8) continue;

  // cells[0] = No (must be a positive integer)
  const noVal = parseInt(cells[0], 10);
  if (isNaN(noVal) || noVal <= 0) continue;

  const tanggalRaw = cells[1];
  const waktuRaw   = cells[2];
  const tipeRaw    = cells[3];
  const kategoriRaw= cells[4];
  const akunRaw    = cells[5];
  const catatanRaw = cells[6];
  const nominalRaw = cells[7];

  const txDate = parseDate(tanggalRaw);
  if (!txDate) { skipped++; continue; }

  const txTime   = parseTime(waktuRaw);
  const txType   = parseType(tipeRaw);
  const amount   = parseAmount(nominalRaw);
  if (amount === null || amount === 0) { skipped++; continue; }

  let category = kategoriRaw || 'Lainnya';
  
  // -- Auto-mapping untuk kategori yang namanya sedikit berbeda di DB --
  if      (category === 'Makanan & Minuman')    category = 'Makanan dan minuman';
  else if (category === 'Elektronik, aksesori') category = 'Elektronik, aksesoris';
  else if (category === 'Perhiasan, aksesori')  category = 'Perhiasan, aksesoris';
  else if (category === 'pendapatan')           category = 'Pendapatan'; // normalisasi huruf kecil
  
  // 'Bunga, dividen' di sheet = biaya admin (expense). Di DB hanya ada sebagai income.
  // Map ke 'Biaya, tarif' yang memang expense.
  if (category === 'Bunga, dividen' && txType === 'expense') {
    category = 'Biaya, tarif';
  }
  
  // 'Pengeluaran keuangan' di sheet kadang di-tag sebagai income (koreksi saldo manual).
  // Di DB, kategori ini hanya ada sebagai expense. Map ke 'Pendapatan' jika typenya income.
  if (category === 'Pengeluaran keuangan' && txType === 'income') {
    category = 'Pendapatan';
  }
  
  // Semua transaksi dipaksa menggunakan satu akun "Bank Mandiri"
  const account  = 'Bank Mandiri';
  const desc     = catatanRaw  || '';
  const pm       = inferPaymentMethod(desc);

  records.push({ no: noVal, txDate, txTime, txType, amount, category, account, desc, pm });
}

console.log(`Parsed ${records.length} valid transactions. Skipped ${skipped} invalid/header rows.`);

// ── Collect unique categories & accounts ──────────────────────────────────────
const uniqueCategories = [...new Set(records.map(r => r.category))].sort();
const uniqueAccounts   = [...new Set(records.map(r => r.account))].sort();

console.log('\nUnique categories found:');
uniqueCategories.forEach(c => console.log(' -', c));
console.log('\nUnique accounts found:');
uniqueAccounts.forEach(a => console.log(' -', a));

// ── Generate SQL ──────────────────────────────────────────────────────────────

const lines = [];

lines.push(`-- ═══════════════════════════════════════════════════════════════════`);
lines.push(`-- N.E.X.A Finance Migration: Google Sheets → Supabase`);
lines.push(`-- Generated: ${new Date().toISOString()}`);
lines.push(`-- Total transactions: ${records.length}`);
lines.push(`-- ═══════════════════════════════════════════════════════════════════`);
lines.push(``);
lines.push(`-- STEP 1: Run this FIRST to preview (no data changed)`);
lines.push(`-- STEP 2: If preview looks correct, remove the ROLLBACK at the bottom and run again`);
lines.push(``);
lines.push(`BEGIN;`);
lines.push(``);

// ── Category reference comment ─────────────────────────────────────────────
lines.push(`-- ─── Kategori yang dibutuhkan (pastikan sudah ada di tabel categories) ───`);
for (const cat of uniqueCategories) {
  lines.push(`-- ${cat}`);
}
lines.push(``);

// ── Account reference comment ──────────────────────────────────────────────
lines.push(`-- ─── Akun yang dibutuhkan (pastikan sudah ada di tabel accounts) ───`);
for (const acc of uniqueAccounts) {
  lines.push(`-- ${acc}`);
}
lines.push(``);

// ── INSERT statements ──────────────────────────────────────────────────────
lines.push(`-- ─── INSERT Transactions ───────────────────────────────────────────────`);
lines.push(``);

for (const r of records) {
  const pmSql = r.pm ? `'${r.pm}'` : 'NULL';
  const timeSql = r.txTime ? `'${r.txTime}'` : 'NULL';

  lines.push(`-- No. ${r.no}: ${r.txDate} | ${r.txType.toUpperCase()} | ${r.category} | Rp${r.amount.toLocaleString('id-ID')}`);
  lines.push(`INSERT INTO transactions (account_id, category_id, amount, type, transaction_date, transaction_time, description, payment_method)`);
  lines.push(`SELECT`);
  lines.push(`  (SELECT id FROM accounts    WHERE lower(name) LIKE lower('%${sqlStr(r.account)}%')  LIMIT 1),`);
  lines.push(`  (SELECT id FROM categories  WHERE lower(name) LIKE lower('%${sqlStr(r.category)}%') AND type = '${r.txType}' LIMIT 1),`);
  lines.push(`  ${r.amount},`);
  lines.push(`  '${r.txType}',`);
  lines.push(`  '${r.txDate}',`);
  lines.push(`  ${timeSql},`);
  lines.push(`  '${sqlStr(r.desc)}',`);
  lines.push(`  ${pmSql};`);
  lines.push(``);
}

lines.push(`-- ─── Preview hasil insert ──────────────────────────────────────────────`);
lines.push(`SELECT count(*) as total_inserted FROM transactions;`);
lines.push(``);
lines.push(`-- HAPUS baris ROLLBACK di bawah ini jika hasilnya sudah benar, lalu run ulang`);
lines.push(`ROLLBACK;`);
lines.push(``);
lines.push(`-- Jika sudah yakin, ganti ROLLBACK dengan:`);
lines.push(`-- COMMIT;`);

// ── Write output ──────────────────────────────────────────────────────────────
fs.writeFileSync(OUT_FILE, lines.join('\n'), 'utf8');
console.log(`\n✅ SQL file written to: ${OUT_FILE}`);
console.log(`   Total INSERT statements: ${records.length}`);
