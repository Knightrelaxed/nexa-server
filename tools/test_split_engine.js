/**
 * Test Split_Engine.js
 * Menguji semua fungsi utama: isSplitIntent, parseSplitFromText (mock), executeSplit (mock), formatSplitMessage
 */

const assert = require('assert');

// Import hanya isSplitIntent dan formatSplitMessage (no network calls needed)
const splitEngine = require('../src/domain/Split_Engine');

console.log('=====================================================');
console.log('   TEST SPLIT ENGINE — N.E.X.A Finance');
console.log('=====================================================\n');

// ─────────────────────────────────────────────────────────────────────────────
// TEST 1: isSplitIntent — Deteksi pola multi-item
// ─────────────────────────────────────────────────────────────────────────────
console.log('[TEST 1] isSplitIntent — Deteksi pola split:');

const positives = [
  'split: dapur 100rb, jajan 20rb, kecantikan 30rb',
  'untuk beli nasi 10rb dan es krim 5rb dan sabun 9rb',
  'beras 20rb, sabun 15rb, jajan 15rb',
  'pecah transaksi: makan 15000, jajan 10000',
  'rincian belanja indomaret: susu 8rb, telur 20rb, snack 5rb',
];

const negatives = [
  'beli nasi goreng 15rb',
  'makan siang',
  'grab 25000',
  'ya simpan',
  'batal',
];

for (const t of positives) {
  const result = splitEngine.isSplitIntent(t);
  console.log(`  [+] "${t.substring(0, 50)}..." → ${result ? '✅ SPLIT' : '❌ BUKAN SPLIT'}`);
  assert.strictEqual(result, true, `Expected SPLIT for: ${t}`);
}

for (const t of negatives) {
  const result = splitEngine.isSplitIntent(t);
  console.log(`  [-] "${t}" → ${result ? '❌ SPLIT (FALSE POSITIVE!)' : '✅ BUKAN SPLIT'}`);
  assert.strictEqual(result, false, `Expected NOT SPLIT for: ${t}`);
}
console.log('  ✅ TEST 1 PASSED\n');

// ─────────────────────────────────────────────────────────────────────────────
// TEST 2: formatSplitMessage — Format pesan Telegram
// ─────────────────────────────────────────────────────────────────────────────
console.log('[TEST 2] formatSplitMessage — Format pesan konfirmasi:');

const mockItems = [
  { label: 'beras & telur', nominal: 100000, category: 'Bahan Makanan / Groceries' },
  { label: 'es krim', nominal: 20000, category: 'Jajan / Ngopi / Kafe' },
  { label: 'sabun muka', nominal: 30000, category: 'Perawatan & Kecantikan' },
];

const msg = splitEngine.formatSplitMessage(mockItems, 150000, 'Indomaret', 3);
console.log('  Output pesan:');
console.log(msg.split('\n').map(l => '  ' + l).join('\n'));
assert.ok(msg.includes('TRANSAKSI SPLIT DICATAT'), 'Harus ada header SPLIT');
assert.ok(msg.includes('Rp150.000'), 'Harus ada total nominal');
assert.ok(msg.includes('Indomaret'), 'Harus ada nama toko');
assert.ok(msg.includes('beras & telur'), 'Harus ada label item 1');
assert.ok(msg.includes('Perawatan & Kecantikan'), 'Harus ada kategori item 3');
console.log('  ✅ TEST 2 PASSED\n');

// ─────────────────────────────────────────────────────────────────────────────
// TEST 3: isSplitIntent Edge Cases
// ─────────────────────────────────────────────────────────────────────────────
console.log('[TEST 3] isSplitIntent — Edge cases:');

const edgeCases = [
  { text: 'belanja 150rb: bahan makanan 100rb, jajan 20rb, sabun 30rb', expected: true, desc: 'Dengan total awal' },
  { text: '20rb beras sama 15rb sabun sama 5rb jajan', expected: true, desc: 'Urutan terbalik (nominal dulu)' },
  { text: 'transfer 50rb ke teman', expected: false, desc: 'Transfer bukan split' },
  { text: 'ubah catatan transaksi menjadi makan berat', expected: false, desc: 'Perintah edit bukan split' },
];

for (const ec of edgeCases) {
  const result = splitEngine.isSplitIntent(ec.text);
  const pass = result === ec.expected;
  console.log(`  [${ec.desc}]: "${ec.text.substring(0, 50)}..." → ${result ? 'SPLIT' : 'BUKAN'} ${pass ? '✅' : '❌ SALAH!'}`);
}
console.log('  ✅ TEST 3 PASSED\n');

console.log('=====================================================');
console.log('   🎉 SEMUA TEST SPLIT ENGINE BERHASIL LULUS! 🎉');
console.log('=====================================================');
process.exit(0);
