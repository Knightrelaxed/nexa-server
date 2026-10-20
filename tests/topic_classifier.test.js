/**
 * ============================================================
 * [N.E.X.A v3.4] GOLDEN TESTS — tests/topic_classifier.test.js
 * ============================================================
 * Tabel kasus uji emas untuk Topic_Classifier. Tambahkan baris baru
 * setiap kali menemukan salah-klasifikasi di log produksi.
 * Format: [kalimat, topik yang diharapkan]
 * ============================================================
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { detectTopicContext } = require('../src/core/Topic_Classifier');

const GOLDEN = [
  // ── Verba aksi jadwal harus menang atas kata benda belanja/makan ──
  ['jadwalkan makan siang dengan dosen besok', 'SCHEDULING'],
  ['ingatkan aku beli galon besok', 'SCHEDULING'],
  ['remind aku bayar kos tanggal 1', 'SCHEDULING'],

  // ── Keuangan: kata kerja generik tidak boleh mengalahkan domain ──
  ['cek saldo', 'FINANCE'],
  ['cek pengeluaran bulan ini', 'FINANCE'],
  ['cek tagihan listrik', 'FINANCE'],
  ['baca mutasi hari ini', 'FINANCE'],
  ['target tabungan bulan ini', 'FINANCE'],
  ['rencana pengeluaran bulan depan', 'FINANCE'],
  ['beli kopi 20rb', 'FINANCE'],
  ['beli kopi 20k tadi pagi', 'FINANCE'],
  ['bayar listrik 150rb', 'FINANCE'],
  ['catat pengeluaran 25rb makan siang', 'FINANCE'],
  ['ingatkan aku transfer ke ibu besok', 'FINANCE'],

  // ── Jadwal: kata benda kuat mengalahkan "cek/baca" ──
  ['cek jadwal besok', 'SCHEDULING'],
  ['cek tugas hari ini', 'SCHEDULING'],
  ['deadline skripsi minggu depan', 'SCHEDULING'],
  ['prioritas tugas hari ini', 'SCHEDULING'],
  ['tugas skripsi besok jam 10', 'SCHEDULING'],
  ['selamat pagi, jadwal hari ini apa?', 'SCHEDULING'],
  ['besok bangun jam 5', 'SCHEDULING'],

  // ── Email: menulis vs membaca ──
  ['tulis draf email konfirmasi', 'EMAIL_DRAFT'],
  ['balas email dosen pembimbing', 'EMAIL_DRAFT'],
  ['cek inbox ada apa hari ini', 'RESEARCH'],
  ['tolong ringkas email dari dosen', 'RESEARCH'],

  // ── Research generik ──
  ['cari berita tentang AI', 'RESEARCH'],
  ['baca artikel ini dan jelaskan', 'RESEARCH'],

  // ── Strategic: kata waktu lemah tidak boleh menelan ──
  ['fokus ke skripsi hari ini', 'STRATEGIC'],
  ['bantu aku memilih karir', 'STRATEGIC'],

  // ── Briefing & disiplin eksplisit ──
  ['kirim morning briefing sekarang', 'BRIEFING_MORNING'],
  ['aku prokrastinasi terus seharian, tolong aktifkan god mode', 'DISCIPLINE_NUDGE'],

  // ── Sapaan & Curhat/Emosi (waktu lemah tidak boleh membajak ke SCHEDULING) ──
  ['selamat pagi nexa', 'CASUAL'],
  ['halo nexa apa kabar', 'CASUAL'],
  ['aku lelah banget hari ini', 'CASUAL'],
  ['hari ini kacau nex', 'CASUAL'],
  ['besok pengen istirahat aja', 'CASUAL'],
  ['tadi pagi bangun kesiangan pusing pala', 'CASUAL'],

  // ── Tidak ada sinyal ──
  ['', 'DEFAULT'],
  ['hmm oke', 'DEFAULT']
];

for (const [text, expected] of GOLDEN) {
  test(`Topic_Classifier: "${text}" => ${expected}`, () => {
    assert.equal(detectTopicContext(text), expected);
  });
}

test('Topic_Classifier: handles null/undefined/non-string input safely', () => {
  assert.equal(detectTopicContext(null), 'DEFAULT');
  assert.equal(detectTopicContext(undefined), 'DEFAULT');
  assert.equal(detectTopicContext('   '), 'DEFAULT');
});
