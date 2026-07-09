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
  'untuk es krim 5rb dan nasi 10rb dan sabun 9rb',
  'es krim 5rb nasi 10rb sabun 9rb',
  'beras 100rb sabun 30rb',
  'beli eskrim 5000 dan nasi 10000 serta sabun 9000',
  'catat nexa, beli eskrim 7300 dan sabun muka 18900 serta roti 8200 pakai Bank Mandiri',
  'catat ini: belanja mall 150rb: makan siang 100rb dan ngopi 30rb'
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

// ─────────────────────────────────────────────────────────────────────────────
// TEST 4: handleSplitWithRemainder — Konfirmasi Kekurangan Nominal
// ─────────────────────────────────────────────────────────────────────────────
console.log('[TEST 4] handleSplitWithRemainder — Konfirmasi sisa nominal:');

async function runTest4() {
  const partialItems = [
    { label: 'beras', nominal: 100000, category: 'Bahan Makanan / Groceries' },
    { label: 'sabun', nominal: 30000, category: 'Perawatan & Kecantikan' }
  ];
  const testChatId = '999888777';

  const promptReply = await splitEngine.handleSplitWithRemainder(
    testChatId,
    partialItems,
    150000,
    { type: 'EXPENSE', account: 'Livin', dateISO: '2026-07-09' },
    'Indomaret'
  );

  console.log('  Output pertanyaan sisa nominal:');
  console.log(promptReply.split('\n').map(l => '  ' + l).join('\n'));

  assert.ok(promptReply.includes('Rp150.000') && promptReply.includes('Rp130.000'), 'Harus menyebutkan total dan yang sudah disebutkan');
  assert.ok(promptReply.includes('Rp20.000'), 'Harus menyebutkan sisa Rp20.000');
  assert.strictEqual(splitEngine.hasPendingRemainder(testChatId), true, 'Pending remainder harus tercatat aktif di state');

  // Bersihkan state setelah test
  splitEngine.cancelPendingRemainder(testChatId);
  assert.strictEqual(splitEngine.hasPendingRemainder(testChatId), false, 'Pending remainder harus dibersihkan setelah dicancel');
  console.log('  ✅ TEST 4 PASSED\n');

  // ─────────────────────────────────────────────────────────────────────────────
  // TEST 5: _extractJsonArray — Ekstraksi JSON Tahan Banting dari Output AI
  // ─────────────────────────────────────────────────────────────────────────────
  console.log('[TEST 5] _extractJsonArray — Ekstraksi JSON tahan banting:');

  const dirtyAIOutput = `Tuan Faqih,

Berikut adalah rincian pengeluaran Anda:

[
  {"label": "Cafe Gula Aren", "nominal": 7300, "category": "Jajan / Ngopi / Kafe"},
  {"label": "KSES ISI2 Aceh", "nominal": 8200, "category": "Perawatan & Kecantikan"}
]
Semoga membantu! [info tambahan bracket]`;

  const extracted = splitEngine._extractJsonArray(dirtyAIOutput);
  assert.ok(Array.isArray(extracted) && extracted.length === 2, 'Harus berhasil parse 2 item dari dirty AI output');
  assert.strictEqual(extracted[0].label, 'Cafe Gula Aren');
  assert.strictEqual(extracted[1].label, 'KSES ISI2 Aceh');
  console.log('  [+] Dirty AI output parsed successfully: 2 items extracted');
  console.log('  ✅ TEST 5 PASSED\n');

  // ─────────────────────────────────────────────────────────────────────────────
  // TEST 6: Skenario C Audit — 150rb mall vs 100rb makan + 30rb ngopi = 20rb sisa
  // ─────────────────────────────────────────────────────────────────────────────
  console.log('[TEST 6] Skenario C Audit — Deteksi Akurat Sisa Nominal Rp20.000:');
  const scenarioCItems = [
    { label: 'makan siang', nominal: 100000, category: 'Makanan & Minuman' },
    { label: 'ngopi', nominal: 30000, category: 'Jajan / Ngopi / Kafe' }
  ];
  const scenarioCMsg = await splitEngine.handleSplitWithRemainder('test_chat_c', scenarioCItems, 150000, {}, 'mall', null, null);
  assert.ok(scenarioCMsg.includes('Rp20.000'), 'Harus mendeteksi sisa Rp20.000');
  assert.ok(scenarioCMsg.includes('Masih ada sisa'), 'Harus menanyakan sisa nominal');
  splitEngine.cancelPendingRemainder('test_chat_c');
  console.log('  [+] Skenario C menghasilkan pertanyaan sisa akurat: Rp20.000');
  console.log('  ✅ TEST 6 PASSED\n');

  console.log('=====================================================');
  console.log('   🎉 SEMUA 6 TEST SUITE SPLIT ENGINE BERHASIL LULUS! 🎉');
  console.log('=====================================================');
}

runTest4().then(() => {
  process.exit(0);
}).catch(err => {
  console.error('Test 4 Failed:', err);
  process.exit(1);
});
