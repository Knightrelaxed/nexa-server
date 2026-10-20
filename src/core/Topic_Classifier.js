/**
 * ============================================================
 * [N.E.X.A v3.4] TOPIC CLASSIFIER — Topic_Classifier.js
 * ============================================================
 * Heuristik zero-token untuk memilih topik/playbook dari teks pesan.
 * Modul murni (tanpa dependensi) agar mudah dites secara terisolasi.
 *
 * PRINSIP URUTAN (first-match-wins):
 *   1. Aturan SPESIFIK dulu (verba aksi jadwal, draf/baca email, briefing, disiplin).
 *   2. Kata benda DOMAIN KUAT (keuangan, jadwal) sebelum kata kerja GENERIK.
 *   3. Kata kerja generik ("cek", "baca", "cari") baru menentukan RESEARCH
 *      jika tidak ada domain yang lebih spesifik.
 *   4. Emosi/curhat/keluh kesah ("capek hari ini", "lelah") menentukan CASUAL
 *      agar kata waktu lemah tidak membajak ke SCHEDULING kaku.
 *   5. Kata waktu LEMAH ("besok", "hari ini") hanya menentukan SCHEDULING
 *      jika tidak ada perasaan/curhat dan setelah STRATEGIC.
 *
 * Kasus uji emas ada di tests/topic_classifier.test.js. Setiap kali
 * menambah/menggeser aturan, jalankan test itu.
 * ============================================================
 */

'use strict';

const AMOUNT_RE = /\b\d+\s*(rb|k|ribu|rupiah|jt|juta)\b/;
const TIME_UNIT_RE = /\b(jam|pukul|menit|detik)\b/;

const SCHEDULE_ACTION_VERBS_RE = /\b(jadwalkan|agendakan|ingatkan|remind|set\s+alarm|buat\s+jadwal|atur\s+jadwal)\b/;
const FINANCE_STOP_FOR_SCHEDULE_RE = /\b(pengeluaran|tabungan|saldo|mutasi|qris|transfer)\b/;

const EMAIL_DRAFT_RE = /\b(draf\s+email|balas\s+email|kirim\s+email|tulis\s+email|buat\s+email)\b/;
const EMAIL_READ_RE = /\b(cek\s+inbox|baca\s+email|ringkas\s+email|cek\s+email|inbox)\b/;

const BRIEFING_RE = /\b(briefing|morning\s+briefing|ringkasan\s+pagi|update\s+pagi|agenda\s+pagi)\b/;
const DISCIPLINE_RE = /\b(jangan\s+menunda|prokrastinasi|disiplin|god\s+mode|blokir\s+sosmed|terdistraksi|susah\s+fokus|malas\s+gerak)\b/;

const FINANCE_NOUN_RE = /\b(bayar|transfer|saldo|dompet|keuangan|uang|pengeluaran|tabungan|budget|qris|tagihan|ongkir|mutasi)\b/;
const FINANCE_SPEND_VERB_RE = /\b(beli|belanja|makan\s+(siang|malam|pagi)|jajan)\b/;

// Kata benda jadwal yang KUAT (jelas urusan agenda)
const SCHEDULE_STRONG_RE = /\b(jadwal|kalender|deadline|tugas|agenda|meeting|rapat|kelas|matkul|kuis|ujian|reminder|alarm)\b/;

// Rasa, emosi, atau curhat (agar curhat seperti "capek abis kelas" atau "hari ini lelah" tidak tertelan ke SCHEDULING)
const FEELINGS_CASUAL_RE = /\b(lelah|capek|ngantuk|pusing|stres|penat|letih|bosan|bosen|jenuh|santai|rebahan|istirahat|tidur|cerita|curhat|senang|bahagia|kecewa|galau|kesal|kesel|kacau|sedih|males|malas|bete|badmood)\b/;

// Kata waktu yang LEMAH (muncul di banyak jenis kalimat)
const SCHEDULE_WEAK_RE = /\b(besok|hari\s+ini|lusa|bangun)\b/;

const RESEARCH_GENERIC_RE = /\b(cari|cek|googling|research|artikel|baca|informasi|berita)\b/;
const STRATEGIC_RE = /\b(rencana|strategi|pilihan|memilih|keputusan|planning|prioritas|tujuan|target|goals|skripsi|karir)\b/;
const CASUAL_RE = /\b(halo|hai|selamat\s+(pagi|siang|sore|malam)|morning|pagi|apa kabar|gimana|bagaimana|cerita|curhat|lagi ngapain)\b/;

/**
 * Deteksi konteks topik dari teks pesan (heuristic, zero-token).
 * @param {string} text
 * @returns {'SCHEDULING'|'EMAIL_DRAFT'|'RESEARCH'|'BRIEFING_MORNING'|'DISCIPLINE_NUDGE'|'FINANCE'|'STRATEGIC'|'CASUAL'|'DEFAULT'}
 */
function detectTopicContext(text) {
  if (!text) return 'DEFAULT';
  const t = String(text).toLowerCase().trim();
  if (!t) return 'DEFAULT';

  // 1. Verba aksi penjadwalan (kecuali jelas urusan uang)
  if (SCHEDULE_ACTION_VERBS_RE.test(t) && !FINANCE_STOP_FOR_SCHEDULE_RE.test(t)) return 'SCHEDULING';

  // 2-3. Email: menulis (draf) vs membaca (inbox)
  if (EMAIL_DRAFT_RE.test(t)) return 'EMAIL_DRAFT';
  if (EMAIL_READ_RE.test(t)) return 'RESEARCH';

  // 4-5. Briefing & disiplin (eksplisit)
  if (BRIEFING_RE.test(t)) return 'BRIEFING_MORNING';
  if (DISCIPLINE_RE.test(t)) return 'DISCIPLINE_NUDGE';

  // 6. FINANCE: kata benda keuangan, atau belanja + nominal, atau nominal tanpa satuan waktu
  if (
    FINANCE_NOUN_RE.test(t) ||
    (FINANCE_SPEND_VERB_RE.test(t) && AMOUNT_RE.test(t)) ||
    (AMOUNT_RE.test(t) && !TIME_UNIT_RE.test(t))
  ) {
    return 'FINANCE';
  }

  // 7. FEELINGS & CASUAL SHARING (Prioritas sebelum kata benda jadwal, agar "capek abis kelas" atau "pusing tugas" diakui sebagai curhat)
  if (FEELINGS_CASUAL_RE.test(t)) return 'CASUAL';

  // 8. SCHEDULING (kata benda kuat) — sebelum "cek/baca/cari" generik
  if (SCHEDULE_STRONG_RE.test(t)) return 'SCHEDULING';

  // 9. RESEARCH generik
  if (RESEARCH_GENERIC_RE.test(t)) return 'RESEARCH';

  // 10. STRATEGIC
  if (STRATEGIC_RE.test(t)) return 'STRATEGIC';

  // 11. SCHEDULING (kata waktu lemah)
  if (SCHEDULE_WEAK_RE.test(t)) return 'SCHEDULING';

  // 12. CASUAL
  if (CASUAL_RE.test(t)) return 'CASUAL';

  return 'DEFAULT';
}

module.exports = { detectTopicContext };
