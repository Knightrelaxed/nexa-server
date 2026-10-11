/**
 * ============================================================
 * [N.E.X.A v3.3] DIALECTIC STANCE NOTE GENERATOR — Dialectic_Engine.js
 * ============================================================
 * Adaptasi Dialectic Reasoning (Honcho di Hermes Agent)
 *
 * TUJUAN:
 *   1. Mencegah "Robot Penguntit" & Token Bloat:
 *      Alih-alih menyuntikkan 5-10 baris sifat identitas mentah
 *      (kelemahan, preferensi, nilai), mesin ini merumuskan
 *      1-2 kalimat catatan sikap operasional (stance note)
 *      yang ringkas, kontekstual, dan terkunci ketat (<= 60 token / 250 karakter).
 *   2. Memadukan konteks jam Jakarta (WIB), topik aktif, dan direktif operasional.
 *   3. Cadence Caching: Mempertahankan stance selama 2-3 giliran obrolan
 *      untuk zero-latency dan efisiensi penuh.
 * ============================================================
 */

'use strict';

const MAX_STANCE_CHARS = 250; // Setara ~50-60 token
const DEFAULT_CADENCE_TURNS = 3;

// In-Memory RAM Cache untuk Dialectic Cadence
let _cachedStance = null;
let _cachedTopic = null;
let _turnsRemaining = 0;

/**
 * Tentukan rentang waktu aktif (WIB)
 * @param {number} jktHour - Jam 0-23 di Asia/Jakarta
 */
function resolveTimeWindow(jktHour) {
  const h = typeof jktHour === 'number' ? jktHour : new Date().getUTCHours() + 7;
  const normalizedHour = ((h % 24) + 24) % 24;

  if (normalizedHour >= 23 || normalizedHour < 5) return 'LATE_NIGHT';
  if (normalizedHour >= 5 && normalizedHour < 12) return 'MORNING';
  if (normalizedHour >= 12 && normalizedHour < 18) return 'AFTERNOON';
  return 'EVENING';
}

/**
 * Sintesis catatan sikap operasional berdasarkan topik, jam, dan direktif
 * @param {object} params
 * @param {string} params.topicContext - SCHEDULING, FINANCE, RESEARCH, EMAIL, etc.
 * @param {string} params.timeWindow - MORNING, AFTERNOON, EVENING, LATE_NIGHT
 * @param {Array<string>} [params.directives] - Direktif identitas aktif
 */
function buildStanceNote({ topicContext, timeWindow, directives = [] }) {
  const topic = String(topicContext || 'DEFAULT').toUpperCase().trim();

  // 1. Prioritaskan direktif identitas jika relevan dan spesifik
  let directiveSnippet = '';
  if (Array.isArray(directives) && directives.length > 0) {
    const validDirective = directives.find(d => typeof d === 'string' && d.trim().length > 0);
    if (validDirective) {
      directiveSnippet = validDirective.trim();
    }
  }

  // 2. Evaluasi sikap operasional per topik
  let note = '';
  switch (topic) {
    case 'EMAIL':
    case 'EMAIL_DRAFT':
      note = 'Fokus Email: Draf formal-hangat, langsung ke inti (maks 5 kalimat), tanpa basa-basi pembuka panjang.';
      break;

    case 'FINANCE':
    case 'FINANCE_REPLY':
      note = 'Konteks Keuangan: Sajikan angka riil, sisa anggaran, dan dampak transaksi secara objektif tanpa menggurui.';
      break;

    case 'SCHEDULING':
    case 'CALENDAR':
    case 'TASK':
      note = 'Konteks Agenda: Prioritaskan 1-2 kegiatan terdekat dengan waktu presisi. Berikan rekomendasi aksi konkret.';
      break;

    case 'RESEARCH':
    case 'WEB_SEARCH':
      note = 'Konteks Riset: Sajikan ringkasan eksekutif di awal, diikuti poin penting dan perbandingan berimbang.';
      break;

    case 'BRIEFING_MORNING':
      note = 'Briefing Pagi: Rangkum agenda hari ini & prioritas utama secara padat. Pertahankan nada energetik dan fokus.';
      break;

    case 'DISCIPLINE':
    case 'DISCIPLINE_NUDGE':
      note = 'Pengingat Disiplin: Bersikap asertif tapi suportif. Tawarkan bantuan langkah awal, jangan menghakimi.';
      break;

    case 'CASUAL':
    case 'NORMAL_CHAT':
    default:
      if (timeWindow === 'LATE_NIGHT') {
        note = 'Larut Malam: Respon santai dan ringkas. Jangan membebani dengan analisis rumit; dukung istirahat Tuan Faqih.';
      } else if (timeWindow === 'MORNING') {
        note = 'Waktu Pagi: Respon tangkas dan solutif untuk membangun momentum kerja produktif Tuan Faqih.';
      } else if (timeWindow === 'AFTERNOON') {
        note = 'Waktu Siang: Respon langsung pada sasaran dan utamakan efisiensi penyelesaian target.';
      } else {
        note = 'Waktu Malam: Respon ramah, apresiatif, dan dukung relaksasi atau evaluasi ringan.';
      }
      break;
  }

  // Jika ada direktif khusus yang bisa dipadukan tanpa melebihi batas karakter
  if (directiveSnippet && !note.includes(directiveSnippet)) {
    const combined = `${note} Catatan: ${directiveSnippet}`;
    if (combined.length <= MAX_STANCE_CHARS) {
      note = combined;
    }
  }

  // Enforce batas keras <= 250 karakter
  if (note.length > MAX_STANCE_CHARS) {
    note = note.substring(0, MAX_STANCE_CHARS - 3) + '...';
  }

  return note;
}

/**
 * Dapatkan catatan sikap dengan mekanisme Cadence Caching (default 3 turn)
 * @param {object} options
 * @param {string} [options.topicContext='DEFAULT']
 * @param {number} [options.jktHour]
 * @param {Array<string>} [options.directives]
 * @param {boolean} [options.forceRefresh=false]
 */
function getStanceNote(options = {}) {
  const {
    topicContext = 'DEFAULT',
    jktHour,
    directives = [],
    forceRefresh = false
  } = options;

  const topic = String(topicContext || 'DEFAULT').toUpperCase().trim();

  // Cek cache jika valid dan topik sama
  if (!forceRefresh && _cachedStance && _cachedTopic === topic && _turnsRemaining > 0) {
    _turnsRemaining--;
    return _cachedStance;
  }

  // Generate stance baru
  const timeWindow = resolveTimeWindow(jktHour);
  const stance = buildStanceNote({ topicContext: topic, timeWindow, directives });

  // Simpan ke cache
  _cachedStance = stance;
  _cachedTopic = topic;
  _turnsRemaining = DEFAULT_CADENCE_TURNS - 1;

  return stance;
}

/**
 * Format string blok Stance Note untuk diinjeksi ke System Prompt
 * @param {string} stance - String catatan sikap
 */
function formatStanceNoteBlock(stance) {
  if (!stance || typeof stance !== 'string' || stance.trim().length === 0) {
    return '';
  }
  return `\n[OPERATIONAL STANCE NOTE]\n• ${stance.trim()}\n`;
}

/**
 * Ambil blok stance siap injeksi langsung (helper terpadu)
 */
function getStanceNoteBlock(options = {}) {
  const stance = getStanceNote(options);
  return formatStanceNoteBlock(stance);
}

/**
 * Reset cache RAM (untuk testing atau pergantian sesi)
 */
function resetStanceCache() {
  _cachedStance = null;
  _cachedTopic = null;
  _turnsRemaining = 0;
}

/**
 * Inspeksi status cache saat ini (untuk debugging/testing)
 */
function getCacheStatus() {
  return {
    cachedStance: _cachedStance,
    cachedTopic: _cachedTopic,
    turnsRemaining: _turnsRemaining
  };
}

module.exports = {
  resolveTimeWindow,
  buildStanceNote,
  getStanceNote,
  formatStanceNoteBlock,
  getStanceNoteBlock,
  resetStanceCache,
  getCacheStatus,
  MAX_STANCE_CHARS,
  DEFAULT_CADENCE_TURNS
};
