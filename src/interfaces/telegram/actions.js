// ============================================================
// N.E.X.A — TELEGRAM ACTIONS
// Fungsi pengiriman pesan keluar (Outbound) ke Telegram via Vercel Relay.
// Dipanggil oleh: adapter.js, cron.js, domain engines (Finance, Inference, dll.)
// ============================================================
const { sendTelegramMessage, sendTelegramPhoto, formatTelegramHtml } = require('../../utils/telegram_network');
const env = require('../../config/env');
const supabaseMemories = require('../../infrastructure/Supabase_Memories');

// ============================================================
// Helper: Strip accidental wrapping quotes from AI responses
// ============================================================
const stripSurroundingQuotes = (str) => {
  if (typeof str !== 'string') return str;
  let cleaned = str.trim();
  while (cleaned.length > 2 && (
    (cleaned.startsWith('"') && cleaned.endsWith('"')) ||
    (cleaned.startsWith('\u201c') && cleaned.endsWith('\u201d')) ||
    (cleaned.startsWith("'") && cleaned.endsWith("'"))
  )) {
    cleaned = cleaned.slice(1, -1).trim();
  }
  return cleaned;
};

// ============================================================
// sendTelegramOutbound
// Routes through Vercel Relay because HuggingFace
// blocks ALL outbound connections to api.telegram.org.
// Used when webhook response is already consumed (timeout, cron).
// ============================================================
async function sendTelegramOutbound(text, skipMemory = false, platform = 'telegram') {
  try {
    const cleanText = stripSurroundingQuotes(String(text));
    if (!skipMemory) {
      await supabaseMemories.saveChatMemory('nexa', cleanText.substring(0, 4000), platform).catch(() => { });
    }

    if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID) return;
    const botToken = env.TELEGRAM_BOT_TOKEN.trim();
    const chatId = env.TELEGRAM_CHAT_ID.trim();

    const result = await sendTelegramMessage(cleanText, chatId, botToken);
    console.log('[TELEGRAM-OUTBOUND] Sent via relay:', JSON.stringify(result).substring(0, 200));
  } catch (e) {
    console.error('[TELEGRAM-OUTBOUND] Error:', e.message);
    throw e;
  }
}

// ============================================================
// [PHASE 6] sendIdentityProposalToTelegram
// Mengirim proposal perubahan identitas ke Telegram dengan
// tombol Inline Keyboard [ ✅ APPROVE & COMMIT ] [ ❌ REJECT ]
// Dipanggil oleh Inference_Engine.js setiap Minggu malam.
// ============================================================
async function sendIdentityProposalToTelegram(proposal) {
  try {
    const botToken = env.TELEGRAM_BOT_TOKEN?.trim();
    const chatId = env.TELEGRAM_CHAT_ID?.trim();
    if (!botToken || !chatId) {
      console.error('[IDENTITY] Cannot send proposal: Telegram credentials missing.');
      return null;
    }

    const layerEmoji = {
      FACTS: '📌', PREFERENCES: '💬', HABITS: '🔁',
      VALUES: '⚖️', DECISION_STYLE: '🧠', WEAKNESSES: '⚡', MOTIVATIONS: '🚀'
    };
    const emoji = layerEmoji[proposal.layer] || '💡';
    const confidencePct = Math.round((parseFloat(proposal.confidence) || 0) * 100);
    const isUpdate = !!proposal.old_value;

    const messageText = [
      `💡 <b>PROPOSAL ${isUpdate ? 'REVISI' : 'BARU'} IDENTITAS N.E.X.A</b>`,
      `Observasi Minggu Ini (Confidence: <b>${confidencePct}%</b>):`,
      `<i>"${proposal.reasoning}"</i>`,
      '',
      `${emoji} <b>${proposal.layer}</b>: <code>${proposal.trait_key}</code>`,
      isUpdate ? `└ Nilai lama: <s>${proposal.old_value}</s>` : '',
      `└ Nilai baru: <b>${proposal.proposed_value}</b>`,
      '',
      'Apakah Anda menyetujui pembaruan model pemahaman ini?'
    ].filter(Boolean).join('\n');

    const telegramPayload = {
      chat_id: chatId,
      text: messageText,
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: [[
          { text: '✅ APPROVE & COMMIT', callback_data: `IDENTITY_APPROVE:${proposal.id}` },
          { text: '❌ REJECT', callback_data: `IDENTITY_REJECT:${proposal.id}` }
        ]]
      }
    };

    const result = await sendTelegramMessage(messageText, chatId, botToken, telegramPayload);
    console.log(`[IDENTITY] Proposal #${proposal.id} sent to Telegram.`);

    if (result?.result?.message_id) {
      try {
        await supabaseMemories.setProposalTelegramMessageId(proposal.id, result.result.message_id);
      } catch (_) {}
    }

    const { supabase } = supabaseMemories;
    if (supabase) {
      try {
        await supabase.from('nexa_identity_proposals')
          .update({ status: 'PENDING' })
          .eq('id', proposal.id);
      } catch (_) {}
    }

    return result;
  } catch (err) {
    console.error('[IDENTITY] Failed to send proposal to Telegram:', err.message);
    return null;
  }
}

// ============================================================
// [PHASE 6] sendEveningBriefing
// Mengirim Evening Reflective Diary via outbound Telegram.
// Dipanggil dari cron.js setiap malam.
// ============================================================
async function sendEveningBriefing() {
  try {
    const intelligenceBrief = require('../../domain/Intelligence_Brief');
    const briefText = await intelligenceBrief.generateEveningBriefing();
    await sendTelegramOutbound(briefText);
    console.log('[INTELLIGENCE] Evening Briefing sent successfully.');
  } catch (err) {
    console.error('[INTELLIGENCE] Failed to send Evening Briefing:', err.message);
  }
}

// ============================================================
// [PHASE 4] sendTelegramQrDelivery
// Mengirimkan QR Code login WhatsApp Pintu 2 dalam bentuk foto
// langsung ke obrolan Telegram, disertai fallback teks monospasi.
// ============================================================
async function sendTelegramQrDelivery(qrString) {
  try {
    if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID) return;
    const botToken = env.TELEGRAM_BOT_TOKEN.trim();
    const chatId = env.TELEGRAM_CHAT_ID.trim();

    // 1. Kirim foto QR Code melalui API publik beresolusi tinggi (api.qrserver.com)
    const encodedQr = encodeURIComponent(qrString);
    const photoUrl = `https://api.qrserver.com/v1/create-qr-code/?size=512x512&data=${encodedQr}`;
    const caption = '📱 <b>QR Code Login WhatsApp Pintu 2</b>\n\nSilakan scan QR di atas dari HP sekunder Anda (WhatsApp &gt; Tautkan Perangkat) dalam batas waktu <b>60 detik</b>.\n\n⚡ <i>Tips: Jika gambar lambat dimuat, gunakan string QR di pesan berikutnya pada web generator QR.</i>';

    console.log('[WHATSAPP-QR] Mengirim foto QR Code ke obrolan Telegram...');
    await sendTelegramPhoto(photoUrl, caption, chatId, botToken);

    // 2. Kirim fallback string monospasi (copyable) untuk kenyamanan Tuan Faqih
    const copyableText = `📋 <b>String QR Code (Salin jika perlu generator manual):</b>\n\n<code>${formatTelegramHtml(qrString)}</code>`;
    await sendTelegramMessage(copyableText, chatId, botToken);

    console.log('[WHATSAPP-QR] ✅ Foto QR Code & fallback berhasil dikirim ke Telegram.');
  } catch (err) {
    console.error('[WHATSAPP-QR] Gagal mengirim foto QR ke Telegram, mencoba fallback teks tunggal:', err.message);
    await sendTelegramOutbound(
      `⚠️ Gagal memuat gambar QR secara langsung. Silakan salin string QR berikut dan generate di web generator QR:\n\n\`\`\`\n${qrString}\n\`\`\``,
      true
    ).catch(() => {});
  }
}

// ============================================================
// [PHASE 8] sendTelegramWithKeyboard
// Mengirim pesan dengan Inline Keyboard (Level 2 Intervention)
// ============================================================
async function sendTelegramWithKeyboard(text, replyMarkup) {
  try {
    if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID) return null;
    const botToken = env.TELEGRAM_BOT_TOKEN.trim();
    const chatId = env.TELEGRAM_CHAT_ID.trim();
    const cleanText = stripSurroundingQuotes(String(text));

    const payload = {
      chat_id: chatId,
      text: cleanText,
      parse_mode: 'HTML',
      reply_markup: replyMarkup
    };

    const result = await sendTelegramMessage(cleanText, chatId, botToken, payload);
    return result?.result || result;
  } catch (e) {
    console.error('[TELEGRAM-KEYBOARD] Error:', e.message);
    return null;
  }
}

// ============================================================
// [PHASE 8] editTelegramMessage
// Mengedit pesan Telegram yang sudah ada (untuk update status tombol)
// ============================================================
async function editTelegramMessage(messageId, newText, newReplyMarkup = null) {
  try {
    if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID || !messageId) return null;
    const botToken = env.TELEGRAM_BOT_TOKEN.trim();
    const chatId = env.TELEGRAM_CHAT_ID.trim();

    const payload = {
      method: 'editMessageText',
      chat_id: chatId,
      message_id: messageId,
      text: formatTelegramHtml(String(newText).substring(0, 4000)),
      parse_mode: 'HTML'
    };
    if (newReplyMarkup) {
      payload.reply_markup = newReplyMarkup;
    }

    const result = await sendTelegramMessage(newText, chatId, botToken, payload);
    return result?.result || result;
  } catch (e) {
    console.error('[TELEGRAM-EDIT] Error:', e.message);
    return null;
  }
}

// ============================================================
// [PHASE 8] answerCallbackQuery
// Menjawab callback query agar loading spinner pada tombol di Telegram hilang
// ============================================================
async function answerCallbackQuery(callbackQueryId, text = '', showAlert = false) {
  try {
    if (!env.TELEGRAM_BOT_TOKEN || !callbackQueryId) return null;
    const botToken = env.TELEGRAM_BOT_TOKEN.trim();
    const chatId = env.TELEGRAM_CHAT_ID?.trim() || '';

    const payload = {
      method: 'answerCallbackQuery',
      callback_query_id: callbackQueryId,
      text: String(text || '').substring(0, 200),
      show_alert: !!showAlert
    };

    const result = await sendTelegramMessage('', chatId, botToken, payload);
    return result?.result || result;
  } catch (e) {
    console.error('[TELEGRAM-ANSWER-CB] Error:', e.message);
    return null;
  }
}

module.exports = {
  sendTelegramOutbound,
  sendIdentityProposalToTelegram,
  sendEveningBriefing,
  sendTelegramQrDelivery,
  sendTelegramWithKeyboard,
  editTelegramMessage,
  answerCallbackQuery,
  stripSurroundingQuotes,
};
