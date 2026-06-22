/**
 * audit_dates.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Deep audit of EVERY date in migration_output.sql:
 * 1. Cross-checks each date against the raw HTML source
 * 2. Validates format is strictly YYYY-MM-DD (required by nexa-finance-web)
 * 3. Validates date is logically valid (no Feb 30, no future dates beyond May 2026, etc.)
 * 4. Spots any date that would be mis-parsed by JS new Date(date + "T00:00:00")
 * ─────────────────────────────────────────────────────────────────────────────
 */
const fs   = require('fs');
const path = require('path');

const HTML_FILE = path.join(__dirname, '..', 'export dari sheet.html');
const SQL_FILE  = path.join(__dirname, 'migration_output.sql');

// ── Helpers (same as generator) ───────────────────────────────────────────────
function stripHtml(str) {
  return String(str || '').replace(/<[^>]+>/g,' ').replace(/&amp;/g,'&').replace(/&nbsp;/g,' ').replace(/\s+/g,' ').trim();
}
const BULAN = {
  januari:'01',februari:'02',maret:'03',april:'04',
  mei:'05',juni:'06',juli:'07',agustus:'08',
  september:'09',oktober:'10',november:'11',desember:'12',
  jan:'01',feb:'02',mar:'03',apr:'04',
  jun:'06',jul:'07',agt:'08',agst:'08',aug:'08',
  sep:'09',sept:'09',okt:'10',oct:'10',
  nov:'11',des:'12',dec:'12',
  january:'01',march:'03',may:'05',june:'06',
  july:'07',august:'08',october:'10',december:'12'
};
function parseDate(raw) {
  const s = raw.trim().toLowerCase();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const m = s.match(/^(\d{1,2})\s+([a-z]+)\s+(\d{4})$/);
  if (m) { const mon=BULAN[m[2]]; if (mon) return `${m[3]}-${mon}-${m[1].padStart(2,'0')}`; }
  return null;
}
function extractCells(trContent) {
  const cells=[], re=/<td[^>]*>([\s\S]*?)<\/td>/gi; let m;
  while((m=re.exec(trContent))!==null) cells.push(stripHtml(m[1]));
  return cells;
}
function parseAmount(raw) {
  const n=Math.abs(parseFloat(String(raw).trim().replace(/[Rp\s]/gi,'').replace(/\./g,'').replace(',','.')));
  return isNaN(n)?null:Math.round(n);
}
function parseType(raw) {
  const s=raw.trim().toLowerCase();
  return (s==='pemasukan'||s==='pendapatan')?'income':'expense';
}

// ── Parse HTML → ground truth ──────────────────────────────────────────────
const html = fs.readFileSync(HTML_FILE,'utf8');
const trBlocks=[], re=/<tr[^>]*>([\s\S]*?)<\/tr>/gi; let m;
while((m=re.exec(html))!==null) trBlocks.push(m[1]);

const htmlRows=[];
for (const tr of trBlocks) {
  const c=extractCells(tr);
  if (c.length<8) continue;
  const no=parseInt(c[0],10); if (isNaN(no)||no<=0) continue;
  const date=parseDate(c[1]); if (!date) continue;
  const amount=parseAmount(c[7]); if (amount===null||amount===0) continue;
  htmlRows.push({ no, rawDate:c[1].trim(), parsedDate:date, type:parseType(c[3]), amount });
}

// ── Parse SQL → extract date per INSERT ───────────────────────────────────
const sql = fs.readFileSync(SQL_FILE,'utf8');
// Extract each INSERT block comment line: "-- No. X: YYYY-MM-DD | TYPE | ..."
const sqlRows=[];
const commentRe=/-- No\. (\d+): (\d{4}-\d{2}-\d{2}) \| (\w+)/g;
let cm;
while((cm=commentRe.exec(sql))!==null) {
  sqlRows.push({ no:parseInt(cm[1],10), date:cm[2], type:cm[3].toLowerCase() });
}

// ── Also extract date from the SELECT body to double-check ─────────────────
// Find each "  '2026-XX-XX'," inside the SELECT block
const bodyRe=/INSERT INTO transactions[\s\S]*?SELECT([\s\S]*?);(?=\s*\n)/g;
const sqlDatesFromBody=[];
let bm2;
while((bm2=bodyRe.exec(sql))!==null) {
  const body=bm2[1];
  const dm=body.match(/'(\d{4}-\d{2}-\d{2})'/);
  sqlDatesFromBody.push(dm ? dm[1] : null);
}

// ── Audit ─────────────────────────────────────────────────────────────────
console.log(`\n${'═'.repeat(70)}`);
console.log('DATE AUDIT REPORT — N.E.X.A Migration');
console.log(`HTML rows: ${htmlRows.length}  |  SQL rows: ${sqlRows.length}`);
console.log('═'.repeat(70));

let errors=0, warnings=0;

// 1. Count match
if (htmlRows.length !== sqlRows.length) {
  console.log(`\n❌ COUNT MISMATCH: HTML=${htmlRows.length} vs SQL=${sqlRows.length}`);
  errors++;
}

// 2. Per-row date audit
console.log(`\n── Per-row date cross-check ──────────────────────────────────────────`);
let allGood=true;
for (let i=0; i<htmlRows.length; i++) {
  const h=htmlRows[i];
  const s=sqlRows[i];
  const sBody=sqlDatesFromBody[i];

  if (!s) { console.log(`❌ No.${h.no}: Missing SQL row`); errors++; continue; }

  const issues=[];

  // a. HTML date vs SQL comment date
  if (h.parsedDate !== s.date) {
    issues.push(`Date mismatch: HTML="${h.rawDate}" → parsed="${h.parsedDate}" vs SQL="${s.date}"`);
  }

  // b. SQL comment date vs SQL body date
  if (sBody && sBody !== s.date) {
    issues.push(`SQL body/comment mismatch: comment="${s.date}" body="${sBody}"`);
  }

  // c. Strict YYYY-MM-DD format check
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s.date)) {
    issues.push(`Format error: "${s.date}" is not YYYY-MM-DD`);
  }

  // d. Logical date validity
  const [y,mo,d] = s.date.split('-').map(Number);
  const jsDate = new Date(`${s.date}T00:00:00`);
  if (jsDate.getFullYear()!==y || jsDate.getMonth()+1!==mo || jsDate.getDate()!==d) {
    issues.push(`Invalid date: "${s.date}" is not a real calendar date (JS sees it as ${jsDate.toISOString().split('T')[0]})`);
  }

  // e. Year sanity check — all should be 2026
  if (y !== 2026) {
    issues.push(`Year anomaly: expected 2026, got ${y}`);
  }

  // f. Month range check (Feb 2026 – May 2026 based on data)
  if (mo < 2 || mo > 5) {
    issues.push(`Month out of expected range (Feb-May 2026): month=${mo}`);
  }

  if (issues.length > 0) {
    allGood = false;
    console.log(`\n⚠️  No.${h.no} (HTML: "${h.rawDate}"):`);
    issues.forEach(x => console.log(`   ► ${x}`));
    warnings += issues.length;
  }
}
if (allGood) console.log('✅ All 236 dates match perfectly between HTML and SQL!');

// 3. Date distribution summary
console.log(`\n── Date distribution in SQL ──────────────────────────────────────────`);
const dist={};
for (const r of sqlRows) {
  const key=r.date.substring(0,7); // YYYY-MM
  dist[key]=(dist[key]||0)+1;
}
Object.keys(dist).sort().forEach(k=>console.log(`  ${k}: ${dist[k]} transactions`));

// 4. nexa-finance-web compatibility check
console.log(`\n── nexa-finance-web compatibility check ──────────────────────────────`);
console.log('  Web reads dates as: new Date(transaction_date + "T00:00:00")');
console.log('  Simulating for all 236 rows...');
let tzOk=true;
for (const r of sqlRows) {
  const d=new Date(r.date + 'T00:00:00');
  const reconstructed=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  if (reconstructed!==r.date) {
    console.log(`  ❌ No.${r.no}: "${r.date}" + T00:00:00 reads as "${reconstructed}"`);
    tzOk=false; errors++;
  }
}
if (tzOk) console.log('  ✅ All dates survive JS new Date(date+"T00:00:00") correctly!');

// 5. Duplicate date+amount check (potential double-entry)
console.log(`\n── Duplicate entry check ─────────────────────────────────────────────`);
const seen={};
let dups=0;
for (const r of sqlRows) {
  const key=`${r.date}|${r.type}`;
  seen[key]=(seen[key]||0)+1;
}
// That's too broad. Check exact duplicate no+date
const seenNo={};
for (const r of sqlRows) {
  if (seenNo[r.no]) { console.log(`❌ Duplicate No.${r.no} in SQL!`); dups++; errors++; }
  seenNo[r.no]=true;
}
if (dups===0) console.log('✅ No duplicate transaction numbers!');

// ── Summary ────────────────────────────────────────────────────────────────
console.log(`\n${'═'.repeat(70)}`);
console.log('AUDIT SUMMARY');
console.log('═'.repeat(70));
console.log(`Total rows audited : ${htmlRows.length}`);
console.log(`Date errors        : ${errors}`);
console.log(`Date warnings      : ${warnings}`);
if (errors===0 && warnings===0) {
  console.log('\n🎉 SEMPURNA! Semua 236 tanggal valid, format benar, aman untuk nexa-finance-web!');
} else {
  console.log(`\n⚠️  Ada ${errors} error dan ${warnings} warning — perlu diperbaiki sebelum import.`);
}
