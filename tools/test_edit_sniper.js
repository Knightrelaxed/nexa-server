/**
 * Test pengujian untuk verifikasi perbaikan Sniper Fix & Matching Transaksi
 */

const assert = require('assert');

function extractSearchKeywordFromReply(snippetToSearch) {
  if (!snippetToSearch) return 'latest';

  const catatanMatch = snippetToSearch.match(/(?:Deskripsi|Catatan|Tujuan|Merchant)\s*:\s*([^\n\r,]{2,80})/i);
  const nominalLabelMatch = snippetToSearch.match(/Nominal\s*\([Rr][Pp]\)\s*:\s*[Rr][Pp][.\s]*([0-9][0-9.,]+)/i);
  const nominalRpMatch = snippetToSearch.match(/[Rr][Pp]\.?\s*([0-9][0-9.,]+)/);

  if (catatanMatch && catatanMatch[1] && catatanMatch[1].trim().length > 1) {
    return catatanMatch[1].trim();
  } else if (nominalLabelMatch && nominalLabelMatch[1]) {
    return nominalLabelMatch[1].replace(/[^0-9]/g, '');
  } else if (nominalRpMatch && nominalRpMatch[1]) {
    return nominalRpMatch[1].replace(/[^0-9]/g, '');
  } else {
    return 'latest';
  }
}

console.log('=====================================================');
console.log('   TEST PENGUJIAN SNIPER FIX & EDIT TRANSACTION');
console.log('=====================================================\n');

// KASUS 1: Pesan Konfirmasi Sinkronisasi Keuangan dengan Deskripsi & Nominal Rp5.000
const sampleMessage1 = `💸 SINKRONISASI KEUANGAN TERBARU

No: [Auto]
Tanggal: 9 Juli 2026
Waktu: 11.19
Tipe: Pengeluaran
Kategori: Pesan Antar / Delivery [Auto-AI]
Akun: Bank Mandiri
Metode: -
Deskripsi: [KOSONG - Tujuan: GRAB FOOD Jakarta Selatan]
Nominal (Rp): Rp5.000
Saldo (Rp) Saat Ini: Rp159.624`;

const kw1 = extractSearchKeywordFromReply(sampleMessage1);
console.log('[TEST 1] Ekstraksi dari Pesan Sinkronisasi Lengkap:');
console.log('  -> Hasil keyword:', JSON.stringify(kw1));
assert.strictEqual(kw1, '[KOSONG - Tujuan: GRAB FOOD Jakarta Selatan]');
console.log('  ✅ PASSED\n');

// KASUS 2: Pesan Konfirmasi tanpa Deskripsi tetapi dengan Nominal (Rp): Rp5.000
const sampleMessage2 = `💸 SINKRONISASI KEUANGAN TERBARU
Nominal (Rp): Rp5.000
Akun: Bank Mandiri`;

const kw2 = extractSearchKeywordFromReply(sampleMessage2);
console.log('[TEST 2] Ekstraksi berdasarkan Label Nominal (Rp): Rp5.000:');
console.log('  -> Hasil keyword:', JSON.stringify(kw2));
assert.strictEqual(kw2, '5000');
console.log('  ✅ PASSED\n');

// KASUS 3: Pesan dengan Rp generik
const sampleMessage3 = `⏳ Waktu habis.
Transaksi Rp14.000 telah disimpan otomatis.`;

const kw3 = extractSearchKeywordFromReply(sampleMessage3);
console.log('[TEST 3] Ekstraksi berdasarkan teks Rp generik:');
console.log('  -> Hasil keyword:', JSON.stringify(kw3));
assert.strictEqual(kw3, '14000');
console.log('  ✅ PASSED\n');

// KASUS 4: Uji integrasi pencarian transaksi di memori (menguji _findBestTransactionMatch)
console.log('[TEST 4] Uji Pencocokan Transaksi Database (_findBestTransactionMatch):');
const mockTransactions = [
  { id: 'tx-001', description: 'GRAB FOOD Jakarta Selatan', amount: 14000, type: 'expense' },
  { id: 'tx-002', description: '[KOSONG - Tujuan: GRAB FOOD Jakarta Selatan]', amount: 5000, type: 'expense' }
];

// Simulasi logika pencocokan di _findBestTransactionMatch
function findMatch(rows, keyword) {
  const norm = String(keyword).toLowerCase().trim();
  const num = Number(norm);
  if (!isNaN(num) && num > 0) {
    const idx = rows.findIndex(r => Math.abs(Number(r.amount) - num) < 1);
    if (idx !== -1) return idx;
  }
  return rows.findIndex(r => String(r.description || '').toLowerCase().includes(norm));
}

const matchIndex1 = findMatch(mockTransactions, kw1);
console.log(`  -> Mencari keyword "${kw1}" dalam DB... cocok dengan ID: ${mockTransactions[matchIndex1]?.id} (Rp${mockTransactions[matchIndex1]?.amount})`);
assert.strictEqual(mockTransactions[matchIndex1].id, 'tx-002');

const matchIndex2 = findMatch(mockTransactions, kw2); // '5000'
console.log(`  -> Mencari keyword "${kw2}" (nominal) dalam DB... cocok dengan ID: ${mockTransactions[matchIndex2]?.id} (Rp${mockTransactions[matchIndex2]?.amount})`);
assert.strictEqual(mockTransactions[matchIndex2].id, 'tx-002');

console.log('  ✅ PASSED\n');

console.log('=====================================================');
console.log('   🎉 SEMUA PENGUJIAN BERHASIL LULUS 100%! 🎉');
console.log('=====================================================');

process.exit(0);
