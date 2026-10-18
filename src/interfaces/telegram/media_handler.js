'use strict';
// ============================================================
// N.E.X.A — TELEGRAM MEDIA HANDLER
// Processes incoming audio notes (speech-to-text) and photos
// (vision model + weekly date calendar anchor).
// ============================================================

const voiceEngine = require('../../core/Voice_Engine');
const visionEngine = require('../../core/Vision_Engine');

/**
 * Build weekly concrete date anchor in WIB (Asia/Jakarta)
 * so the AI router never guesses dates for schedules/rosters.
 */
function buildWeekDateAnchor() {
  const jakartaNow = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Jakarta' }));
  const dayOfWeek = jakartaNow.getDay(); // 0=Sun, 1=Mon, ...
  const weekMonday = new Date(jakartaNow);
  weekMonday.setDate(jakartaNow.getDate() - ((dayOfWeek + 6) % 7));
  weekMonday.setHours(0, 0, 0, 0);

  const hariMap = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
  const weekDates = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(weekMonday);
    d.setDate(weekMonday.getDate() + i);
    const iso = d.toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' });
    const label = d.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Asia/Jakarta' });
    weekDates.push(`  ${hariMap[d.getDay()]}: ${iso} (${label})`);
  }
  return weekDates.join('\n');
}

/**
 * Process Telegram voice note if present.
 * @param {object} message 
 * @param {function} respondToTelegram 
 * @returns {Promise<{ handled: boolean, transcribedText?: string }>}
 */
async function processVoiceNote(message, respondToTelegram) {
  if (!message.voice) return { handled: false };

  try {
    console.log('[TELEGRAM] Voice note received. Transcribing (6-Tier God Mode)...');
    const transcribedText = await voiceEngine.transcribeTelegramVoice(message.voice.file_id);
    console.log('[VOICE] Transcription result:', transcribedText);
    return { handled: true, transcribedText };
  } catch (e) {
    console.error('[VOICE] All 6 Voice Tiers FAILED:', e.message);
    await respondToTelegram('⚠️ Maaf Tuan, seluruh 6 lapisan sistem pendengaran N.E.X.A (4x Groq Whisper + 2x Gemini Native Audio) gagal merespons. Mohon coba kirim ulang pesan suaranya dalam beberapa menit.');
    return { handled: true, error: e.message };
  }
}

/**
 * Process Telegram photo if present.
 * @param {object} message 
 * @param {function} respondToTelegram 
 * @returns {Promise<{ handled: boolean, photoPrompt?: string }>}
 */
async function processPhoto(message, respondToTelegram) {
  if (!message.photo || message.photo.length === 0) return { handled: false };

  try {
    console.log('[TELEGRAM] Photo received. Processing (11-Tier God Mode Vision)...');
    const largestPhoto = message.photo[message.photo.length - 1];
    const visionDescription = await visionEngine.processTelegramImage(largestPhoto.file_id, message.caption || '');
    const weekMapText = buildWeekDateAnchor();

    const photoPrompt = `[SISTEM PENGLIHATAN N.E.X.A TELAH MEMBACA GAMBAR]
Deskripsi Gambar: ${visionDescription}
Konteks/Caption dari Tuan Faqih: "${message.caption || '(Tidak ada caption)'}"

[PETA TANGGAL MINGGU INI — WAJIB DIGUNAKAN UNTUK PENJADWALAN]
Berikut adalah tanggal konkret setiap hari pada minggu yang sedang berjalan (WIB):
${weekMapText}

PERINGATAN KRITIS UNTUK AI ROUTER:
- Jika Tuan Faqih meminta menjadwalkan berdasarkan hari (Senin, Selasa, dll), WAJIB gunakan tanggal ISO dari peta di atas. JANGAN menebak atau menggunakan tanggal lain.
- Jika gambar berupa TABEL JADWAL (piket/roster), ekstrak SETIAP SEL yang berisi nama Tuan secara akurat, petakan ke hari dan tanggal yang benar sesuai kolom tabel.
- Gunakan 'Deskripsi Gambar' di atas sebagai referensi visual untuk menjawab permintaan Tuan secara presisi.`;

    console.log('[VISION] Image analysis result formatted for Router (with week date anchor).');
    return { handled: true, photoPrompt };
  } catch (e) {
    console.error('[VISION] All 11 Vision Tiers FAILED:', e.message);
    await respondToTelegram('⚠️ Maaf Tuan, seluruh 11 lapisan sistem penglihatan N.E.X.A (4x Gemini 2.5 + 4x Groq + 2x Gemini 2.0 + HuggingFace) gagal merespons. Semua provider AI sedang down secara bersamaan.');
    return { handled: true, error: e.message };
  }
}

module.exports = {
  buildWeekDateAnchor,
  processVoiceNote,
  processPhoto
};
