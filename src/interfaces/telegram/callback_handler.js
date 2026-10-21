'use strict';
// ============================================================
// N.E.X.A — TELEGRAM CALLBACK QUERY HANDLER
// Menangani seluruh respons tombol interaktif Telegram Inline Keyboard:
// 1. Level 2 Discipline Feedback Loop (d:ok, d:no, d:ext)
// 2. Identity Model Proposal (IDENTITY_APPROVE, IDENTITY_REJECT)
// 3. Memory Hygiene Actions (HYGIENE_ARCHIVE_ALL, HYGIENE_HOLD_ALL, HYGIENE_SELECT_MANUAL)
// 4. Recurring Subscription Rules (REC_OK, REC_NO)
// ============================================================

const { createClient } = require('@supabase/supabase-js');
const env = require('../../config/env');
const godMode = require('../../domain/Discipline_GodMode');
const aiRouter = require('../../core/AI_Router');
const supabaseMemories = require('../../infrastructure/Supabase_Memories');
const { editTelegramMessage: actionEditMessage, answerCallbackQuery, sendTelegramOutbound } = require('./actions');
const { sendTelegramMessage } = require('../../utils/telegram_network');

let _supabase = null;
function getSupabase() {
  if (_supabase) return _supabase;
  if (!env.SUPABASE_URL || !env.SUPABASE_KEY) return null;
  _supabase = createClient(env.SUPABASE_URL, env.SUPABASE_KEY);
  return _supabase;
}

/**
 * Menangani callback query khusus event disiplin (prefix "d:")
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
  const sessionKey = parts.slice(2).join(':'); // Rebuild session_key

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
    await supabase.from('nexa_discipline_state').update({
      pending_callback: false,
      current_level:    0
    }).eq('session_key', sessionKey);

    await answerCallbackQuery(cbId, '✅ Diterima. Semangat risetnya, Tuan Faqih!');
    await actionEditMessage(msgId,
      '✅ <b>N.E.X.A mencatat ini sebagai sesi riset yang valid.</b>\nLanjutkan — dan pastikan hasilnya dicatat dengan baik.'
    );

  } else if (action === 'no') {
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
    await actionEditMessage(msgId,
      '🚫 <b>Surgical Force diaktifkan.</b>\nTuan Faqih memilih akuntabilitas. Respect.'
    );

  } else if (action === 'ext') {
    const usedCount = session.ten_min_used_count || 0;

    if (usedCount >= 2) {
      await answerCallbackQuery(cbId, '⛔ Opsi perpanjangan 10 menit sudah habis hari ini (maks 2x).', true);
      
      await supabase.from('nexa_discipline_state').update({
        pending_callback: false,
        current_level:    3
      }).eq('session_key', sessionKey);

      await godMode.triggerGodMode(3, {
        violation_app: session.app_name,
        message_tone:  session.message_tone,
        session_key:   sessionKey
      });
      await actionEditMessage(msgId,
        '⛔ <b>Batas perpanjangan tercapai.</b>\nLevel 3 diaktifkan secara tegas. Waktunya fokus.'
      );

    } else {
      const newUsedCount = usedCount + 1;
      const extensionUntil = new Date(Date.now() + 10 * 60 * 1000).toISOString();

      await supabase.from('nexa_discipline_state').update({
        pending_callback:    false,
        current_level:       1,
        extension_until:     extensionUntil,
        ten_min_used_count:  newUsedCount
      }).eq('session_key', sessionKey);

      const sisaOpsi = 2 - newUsedCount;
      await answerCallbackQuery(cbId, `⏳ +10 menit diberikan. Sisa perpanjangan: ${sisaOpsi}x hari ini.`);
      await actionEditMessage(msgId,
        `⏳ <b>Perpanjangan 10 menit aktif.</b>\nSelesaikan yang sedang dibuka, lalu segera kembali.\n<i>(Sisa toleransi hari ini: ${sisaOpsi}x)</i>`
      );
    }
  }

  return true;
}

/**
 * Master dispatcher untuk seluruh Telegram callback query (tombol keyboard).
 * @param {object} callbackQuery 
 * @param {object} contextOps - { setConversationContext }
 * @returns {Promise<boolean>}
 */
async function handleCallbackQuery(callbackQuery, { setConversationContext } = {}) {
  if (!callbackQuery) return false;

  try {
    const { getNotifier } = require('../../core/Notifier');
    getNotifier().markEngaged('BUTTON_TAP').catch(() => {});
  } catch (_) {}

  const cbData = callbackQuery.data || '';
  const cbChatId = callbackQuery.message?.chat?.id || env.TELEGRAM_CHAT_ID;
  const cbMessageId = callbackQuery.message?.message_id;
  const botToken = env.TELEGRAM_BOT_TOKEN?.trim();

  const editTelegramMessage = async (newText) => {
    try {
      await sendTelegramMessage(newText, cbChatId, botToken, {
        method: 'editMessageText',
        message_id: cbMessageId,
        parse_mode: 'HTML',
      });
    } catch (_) {
      if (cbChatId && botToken) {
        await sendTelegramMessage(newText, cbChatId, botToken, { parse_mode: 'HTML' }).catch(() => {});
      } else {
        await sendTelegramOutbound(newText, true).catch(() => {});
      }
    }
  };

  // 1. IDENTITY PROPOSAL: APPROVE
  if (cbData.startsWith('IDENTITY_APPROVE:')) {
    const proposalId = parseInt(cbData.split(':')[1], 10);
    console.log(`[IDENTITY] User clicked APPROVE for proposal #${proposalId}`);

    const result = await supabaseMemories.approveIdentityProposal(proposalId).catch(e => ({
      success: false, error: e.message
    }));

    if (result.success) {
      const row = result.identityRow;
      const traitDisplay = row ? `<b>${row.layer}</b> → ${row.trait_value}` : `Proposal #${proposalId}`;
      await editTelegramMessage(
        `✅ <b>Committed to Identity Model.</b>\n\nTerima kasih, Tuan. Saya telah menyimpan:\n${traitDisplay}\n\nPemahaman saya tentang Anda telah diperbarui dan akan langsung berlaku pada percakapan berikutnya.`
      );
      if (typeof aiRouter.invalidatePersonalFactsCache === 'function') {
        aiRouter.invalidatePersonalFactsCache();
      }
      if (typeof aiRouter.invalidateIdentityModelCache === 'function') {
        aiRouter.invalidateIdentityModelCache();
      }
    } else {
      await editTelegramMessage(
        `❌ <b>Gagal menyimpan perubahan.</b>\n\nMaaf Tuan, terjadi kesalahan teknis: <code>${result.error}</code>`
      );
    }
    return true;
  }

  // 2. IDENTITY PROPOSAL: REJECT
  if (cbData.startsWith('IDENTITY_REJECT:')) {
    const proposalId = parseInt(cbData.split(':')[1], 10);
    console.log(`[IDENTITY] User clicked REJECT for proposal #${proposalId}`);

    await supabaseMemories.rejectIdentityProposal(proposalId, null).catch(() => {});

    await editTelegramMessage(
      `❌ <b>Proposal Dibatalkan.</b>\n\nBaik Tuan, saya tidak akan menambahkan profil tersebut ke Identity Model.\n\n🤔 Boleh saya tahu di bagian mana kesimpulan saya kurang tepat?\n(Misalnya: "karena minggu lalu hanya kebetulan ada tugas mendadak")\n\nAtau balas <b>"Tidak apa-apa"</b> jika tidak ingin menjelaskan — saya akan lebih berhati-hati di observasi berikutnya.`
    );
    if (typeof setConversationContext === 'function') {
      setConversationContext({
        intent: 'AWAITING_IDENTITY_REJECTION_REASON',
        extractedData: { proposalId },
        askedAt: Date.now()
      });
    }
    return true;
  }

  // 3. DISCIPLINE FEEDBACK LOOP (Level 2: d:ok, d:no, d:ext)
  if (await handleDisciplineCallback(callbackQuery)) {
    return true;
  }

  // 4. MEMORY HYGIENE: ARSIPKAN SEMUA
  if (cbData === 'HYGIENE_ARCHIVE_ALL') {
    console.log('[HYGIENE-CB] Tuan menekan: Arsipkan Semua staged facts.');
    try {
      const staged = await supabaseMemories.getStagedForPruning();
      const upIds = (staged.userProfile || []).map(r => r.id);
      const ciIds = (staged.coreIdentity || []).map(r => r.id);
      let totalArchived = 0;

      if (upIds.length > 0) {
        const res = await supabaseMemories.bulkArchiveMemories(upIds, 'USER_PROFILE');
        totalArchived += res.archived;
      }
      if (ciIds.length > 0) {
        const res = await supabaseMemories.bulkArchiveMemories(ciIds, 'CORE_IDENTITY');
        totalArchived += res.archived;
      }

      if (typeof aiRouter.invalidatePersonalFactsCache === 'function') {
        aiRouter.invalidatePersonalFactsCache();
      }

      await editTelegramMessage(
        `✅ <b>Selesai. ${totalArchived} fakta berhasil diarsipkan.</b>\n\n` +
        `Memori N.E.X.A kini lebih bersih dan relevan.\n` +
        `<i>(Fakta yang diarsipkan tidak dihapus permanen — masih tersimpan aman di database.)</i>`
      );
    } catch (e) {
      console.error('[HYGIENE-CB] ARCHIVE_ALL error:', e.message);
      await editTelegramMessage(`❌ <b>Gagal mengarsipkan.</b>\n<code>${e.message}</code>`);
    }
    return true;
  }

  // 5. MEMORY HYGIENE: TAHAN SEMUA
  if (cbData === 'HYGIENE_HOLD_ALL') {
    console.log('[HYGIENE-CB] Tuan menekan: Tahan Semua — reset staged ke ACTIVE.');
    try {
      const sb = supabaseMemories.supabase;
      if (sb) {
        await sb.from('nexa_user_profile').update({ status: 'ACTIVE' }).eq('status', 'STAGED_FOR_PRUNING');
        await sb.from('nexa_core_identity').update({ status: 'ACTIVE' }).eq('status', 'STAGED_FOR_PRUNING');
      }

      await editTelegramMessage(
        `❌ <b>Ditahan.</b> Semua fakta dikembalikan ke status Aktif.\n\n` +
        `Saya tidak akan mengarsipkan apapun minggu ini.\n` +
        `<i>Fakta-fakta tersebut akan dievaluasi kembali minggu depan.</i>`
      );
    } catch (e) {
      console.error('[HYGIENE-CB] HOLD_ALL error:', e.message);
      await editTelegramMessage(`❌ <b>Gagal mempertahankan fakta.</b>\n<code>${e.message}</code>`);
    }
    return true;
  }

  // 6. MEMORY HYGIENE: PILIH MANUAL
  if (cbData === 'HYGIENE_SELECT_MANUAL') {
    console.log('[HYGIENE-CB] Tuan menekan: Pilih Manual.');
    await editTelegramMessage(
      `🔍 <b>Pilih Manual (Tersedia Penuh di Phase 10)</b>\n\n` +
      `Sistem UI pemilihan memori per baris sedang dalam tahap pengembangan akhir.\n\n` +
      `💡 <i>Sementara itu, Anda dapat membalas pesan ini langsung dengan perintah seperti:\n"Hapus memori user profile ID 5"\natau gunakan tombol <b>Arsipkan Semua / Tahan Semua</b> untuk eksekusi kilat.</i>`
    );
    return true;
  }

  // 7. RECURRING RULES: APPROVE / REJECT
  if (cbData.startsWith('REC_OK:') || cbData.startsWith('REC_NO:')) {
    const isApprove = cbData.startsWith('REC_OK:');
    const ruleId = cbData.split(':')[1];
    try {
      const supabaseFinance = require('../../infrastructure/Supabase_Finance');
      const newStatus = isApprove ? 'ACTIVE' : 'REJECTED';
      const ok = await supabaseFinance.updateRecurringRuleStatus(ruleId, newStatus);
      if (ok) {
        await editTelegramMessage(
          isApprove
            ? `✅ <b>Langganan Rutin Disetujui (ACTIVE)!</b>\nAturan ini kini aktif dan akan dihitung dalam proyeksi tagihan.`
            : `❌ <b>Langganan Rutin Ditolak (REJECTED).</b>\nAturan ini telah dinonaktifkan dan tidak akan ditagihkan lagi.`
        );
      } else {
        await editTelegramMessage(`⚠️ Gagal memperbarui status aturan langganan.`);
      }
    } catch (e) {
      console.error('[REC-CB] Error updating rule:', e.message);
      await editTelegramMessage(`❌ Error: ${e.message}`);
    }
    return true;
  }

  console.log(`[WEBHOOK] Unknown callback_query data: ${cbData}`);
  return false;
}

module.exports = {
  handleDisciplineCallback,
  handleCallbackQuery
};
