/**
 * debug_parser.js — diagnose why rows are being skipped
 */
const fs = require('fs');
const path = require('path');

const HTML_FILE = path.join(__dirname, '..', 'export dari sheet.html');
const html = fs.readFileSync(HTML_FILE, 'utf8');

function stripHtml(str) {
  return String(str || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
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

const BULAN = {
  januari:'01', februari:'02', maret:'03', april:'04',
  mei:'05', juni:'06', juli:'07', agustus:'08',
  september:'09', oktober:'10', november:'11', desember:'12'
};
function parseDate(raw) {
  const s = raw.trim().toLowerCase();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const m = s.match(/^(\d{1,2})\s+([a-z]+)\s+(\d{4})$/);
  if (m) {
    const mon = BULAN[m[2]];
    if (mon) return `${m[3]}-${mon}-${m[1].padStart(2,'0')}`;
  }
  return null;
}
function parseAmount(raw) {
  const s = String(raw).trim().replace(/[Rp\s]/gi, '');
  const n = Math.abs(parseFloat(s.replace(/\./g,'').replace(',','.')));
  return isNaN(n) ? null : Math.round(n);
}

// Count TR blocks
const trBlocks = [];
const trRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
let m;
while ((m = trRegex.exec(html)) !== null) trBlocks.push(m[1]);

console.log(`Total <tr> blocks found: ${trBlocks.length}`);

// Categorize each block
let passedCount = 0;
let skipFewerThan8 = 0;
let skipNoNumber = 0;
let skipNoDate = 0;
let skipZeroAmount = 0;

const maxNo = { val: 0 };

for (const tr of trBlocks) {
  const cells = extractCells(tr);
  if (cells.length < 8) { skipFewerThan8++; continue; }

  const noVal = parseInt(cells[0], 10);
  if (isNaN(noVal) || noVal <= 0) { skipNoNumber++; continue; }

  const txDate = parseDate(cells[1]);
  if (!txDate) { skipNoDate++; continue; }

  const amount = parseAmount(cells[7]);
  if (amount === null || amount === 0) { skipZeroAmount++; continue; }

  passedCount++;
  if (noVal > maxNo.val) maxNo.val = noVal;
}

console.log(`\nBreakdown of ${trBlocks.length} rows:`);
console.log(`  ✅ Passed (valid transactions) : ${passedCount}`);
console.log(`  ❌ < 8 cells (header/empty rows) : ${skipFewerThan8}`);
console.log(`  ❌ No. column not a number       : ${skipNoNumber}`);
console.log(`  ❌ Date could not be parsed      : ${skipNoDate}`);
console.log(`  ❌ Amount = 0 or null            : ${skipZeroAmount}`);
console.log(`\n  Highest transaction No. found: ${maxNo.val}`);

// Now show EVERY skipped row that has a valid number in col A (these are suspicious)
console.log(`\n━━━ SUSPICIOUS: rows with valid No. but skipped due to date/amount ━━━`);
let suspCount = 0;
for (const tr of trBlocks) {
  const cells = extractCells(tr);
  if (cells.length < 8) continue;
  const noVal = parseInt(cells[0], 10);
  if (isNaN(noVal) || noVal <= 0) continue;

  const txDate = parseDate(cells[1]);
  const amount = parseAmount(cells[7]);

  if (!txDate || amount === null || amount === 0) {
    suspCount++;
    console.log(`  No.${noVal}: date="${cells[1]}" amount="${cells[7]}" cells=${cells.length}`);
    if (suspCount >= 20) { console.log('  ... (truncated, showing first 20)'); break; }
  }
}
if (suspCount === 0) console.log('  None found.');

// Show the last 5 valid rows to verify continuity
console.log(`\n━━━ Last 10 valid transactions found ━━━`);
const validRows = [];
for (const tr of trBlocks) {
  const cells = extractCells(tr);
  if (cells.length < 8) continue;
  const noVal = parseInt(cells[0], 10);
  if (isNaN(noVal) || noVal <= 0) continue;
  const txDate = parseDate(cells[1]);
  if (!txDate) continue;
  const amount = parseAmount(cells[7]);
  if (amount === null || amount === 0) continue;
  validRows.push({ no: noVal, date: txDate, cat: cells[4], amount });
}
validRows.slice(-10).forEach(r => {
  console.log(`  No.${r.no}: ${r.date} | ${r.cat} | Rp${r.amount.toLocaleString('id-ID')}`);
});
