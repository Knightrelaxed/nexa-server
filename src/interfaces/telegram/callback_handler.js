// ============================================================
// N.E.X.A — TELEGRAM CALLBACK QUERY HANDLER
// Menangani respons dari tombol interaktif Telegram Inline Keyboard
// khususnya untuk Level 2 Discipline Feedback Loop (d:ok, d:no, d:ext)
// ============================================================
'use strict';

const { createClient } = require('@supabase/supabase-js');
const env = require('../../config/env');
const godMode = require('../../domain/Discipline_GodMode');
const { editTelegramMessage, answerCallbackQuery } = require('./actions');

let _supabase = null;
function getSupabase() {
  if (_supabase) return _supabase;
  if (!env.SUPABASE_URL || !env.SUPABASE_KEY) return null;
  _supabase = createClient(env.SUPABASE_URL, env.SUPABASE_KEY);
  return _supabase;
}

/**
 * Menangani callback query khusus event disiplin (prefix "d:")
 * 
 * @param {object} callbackQuery - Objek callback_query dari webhook Telegram
 * @returns {Promise<boolean>} true jika berhasil ditangani oleh handler ini, false jika bukan event disiplin
 */
async function handleDisciplineCallback(callbackQuery) {
  const data  = callbackQuery?.data || '';
  const msgId = callbackQuery?.message?.message_id;
  const cbId  = callbackQuery?.id;

  const parts = data.split(':');
  if (parts[0] !== 'd' || parts.length < 3) {
    return false; // Bukan callback disiplin N.E.X.A
  }

  const action     = parts[1]; // 'ok' | 'no' | 'ext'
  const sessionKey = parts.slice(2).join(':'); // Rebuild session_key karena bisa mengandung ':'

  const supabase = getSupabase();
  if (!supabase) {
    await answerCallbackQuery(cbId, '⚠️ Koneksi database tidak aktif.', true);
    return true;
  }

  const { data: session } = await supabase
    .from('nexa_discipline_state')
    .select('*')
    .eq('session_key', sessionKey)
    .maybeSingle();

  if (!session || !session.pending_callback) {
    await answerCallbackQuery(cbId, '⚠️ Sesi sudah tidak aktif atau waktu telah habis.', true);
    return true;
  }

  if (action === 'ok') {
    // User konfirmasi riset penting — reset level ke 0 dan tutup pending
    await supabase.from('nexa_discipline_state').update({
      pending_callback: false,
      current_level:    0
    }).eq('session_key', sessionKey);

    await answerCallbackQuery(cbId, '✅ Diterima. Semangat risetnya, Tuan Faqih!');
    await editTelegramMessage(msgId,
      '✅ <b>N.E.X.A mencatat ini sebagai sesi riset yang valid.</b>\nLanjutkan — dan pastikan hasilnya dicatat dengan baik.'
    );

  } else if (action === 'no') {
    // User mengakui penundaan — eskalasi ke Level 3 segera
    await supabase.from('nexa_discipline_state').update({
      pending_callback: false,
      current_level:    3
    }).eq('session_key', sessionKey);

    await godMode.triggerGodMode(3, {
      violation_app: session.app_name,
      message_tone:  session.message_tone,
      session_key:   sessionKey
    });
    await answerCallbackQuery(cbId, '💪 Level 3 diaktifkan. Kembali ke meja kerja!');
    await editTelegramMessage(msgId,
      '🚫 <b>Surgical Force diaktifkan.</b>\nTuan Faqih memilih akuntabilitas. Respect.'
    );

  } else if (action === 'ext') {
    const usedCount = session.ten_min_used_count || 0;

    if (usedCount >= 2) {
      // Opsi +10 menit dikunci setelah 2x penggunaan per hari
      await answerCallbackQuery(cbId, '⛔ Opsi perpanjangan 10 menit sudah habis hari ini (maks 2x).', true);
      
      // Langsung eskalasi ke Level 3 karena sudah mencoba memanfaatkan toleransi
      await supabase.from('nexa_discipline_state').update({
        pending_callback: false,
        current_level:    3
      }).eq('session_key', sessionKey);

      await godMode.triggerGodMode(3, {
        violation_app: session.app_name,
        message_tone:  session.message_tone,
        session_key:   sessionKey
      });
      await editTelegramMessage(msgId,
        '🚫 <b>+10 Menit sudah digunakan 2x hari ini.</b>\nLevel 3 diaktifkan otomatis demi kedisiplinan Anda.'
      );
    } else {
      // Berikan perpanjangan 10 menit + reset timer callback (13 menit total dari sekarang)
      const newExpiry = new Date(Date.now() + 13 * 60 * 1000).toISOString();
      await supabase.from('nexa_discipline_state').update({
        callback_expires_at: newExpiry,
        ten_min_used_count:  usedCount + 1
      }).eq('session_key', sessionKey);

      await answerCallbackQuery(cbId, `⏰ +10 menit diberikan (${usedCount + 1}/2 penggunaan hari ini).`);
      await editTelegramMessage(msgId,
        `⏰ <b>+10 menit dikabulkan (${usedCount + 1}/2).</b>\nN.E.X.A menunggu. Buktikan waktu ini benar-benar diperlukan.`
      );
    }
  }

  return true;
}

module.exports = { handleDisciplineCallback };
