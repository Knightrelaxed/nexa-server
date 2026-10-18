'use strict';
// ============================================================
// N.E.X.A — TELEGRAM COMMAND HANDLER
// Intercepts and executes direct slash commands without LLM overhead:
// /call, /wa_login, /wa_logout, /trigger_weekly, /playbook, /search
// ============================================================

const supabaseMemories = require('../../infrastructure/Supabase_Memories');

const escapeHtml = (str) => String(str || '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

/**
 * Handle direct slash commands.
 * @param {string} textInput 
 * @param {object} helpers - { respondToTelegram, deliverWebhookReply }
 * @returns {Promise<boolean>} true if handled as a command, false otherwise
 */
async function handleDirectCommand(textInput, { respondToTelegram, deliverWebhookReply }) {
  if (!textInput || typeof textInput !== 'string') return false;
  const trimmed = textInput.trim();

  // 1. Direct Call Interceptor (/call, /telepon, /callnexa, /panggilan)
  if (/^(\/call|\/telepon|\/callnexa|\/panggilan)\b/i.test(trimmed)) {
    console.log('[TELEGRAM-CMD] Menerima perintah direct call:', trimmed);
    const mobileBridge = require('../mobile_bridge/adapter');
    if (!mobileBridge.isConnected()) {
      await respondToTelegram(
        '<b>Panggilan Tidak Dapat Terhubung</b>\n\nNexa Bridge pada HP Samsung A33 5G sedang offline atau belum terhubung ke WebSocket server. Pastikan aplikasi Nexa Bridge aktif di HP dan terhubung ke internet.'
      );
      deliverWebhookReply();
      return true;
    }

    await respondToTelegram('Menghubungi HP Tuan Faqih...');
    deliverWebhookReply();

    mobileBridge.simulateIncomingCall('N.E.X.A Chief of Staff', 'Panggilan langsung dari perintah Telegram.', true).catch(err => {
      console.error('[TELEGRAM-CMD] Error saat simulateIncomingCall:', err.message);
    });
    return true;
  }

  // 2. WhatsApp Login (/wa_login, /walogin, /login_wa)
  if (/^(\/wa_login|\/walogin|\/login_wa)\b/i.test(trimmed)) {
    console.log('[TELEGRAM-CMD] Menerima perintah /wa_login dari Telegram');
    await respondToTelegram(
      '🚀 <b>Memulai Sesi Baru WhatsApp (Pintu 2)...</b>\n\nSedang memutuskan sesi lama dan merender QR Code baru. Mohon tunggu beberapa detik, foto QR akan segera dikirim ke obrolan ini...'
    );
    deliverWebhookReply();
    const waAdapter = require('../whatsapp/adapter');
    waAdapter.startWhatsAppSocket({ forceNewSession: true }).catch(err => {
      console.error('[TELEGRAM-CMD] Error saat startWhatsAppSocket:', err.message);
    });
    return true;
  }

  // 3. WhatsApp Logout (/wa_logout, /walogout, /logout_wa)
  if (/^(\/wa_logout|\/walogout|\/logout_wa)\b/i.test(trimmed)) {
    console.log('[TELEGRAM-CMD] Menerima perintah /wa_logout dari Telegram');
    const waAdapter = require('../whatsapp/adapter');
    await waAdapter.logoutWhatsAppSession();
    await respondToTelegram(
      '🛑 <b>Sesi WhatsApp Berhasil Dihapus</b>\n\nPintu 2 (WhatsApp) telah diputuskan dan data kredensial di cloud telah dibersihkan. Anda bisa mengetik /wa_login kapan saja untuk scan nomor baru.'
    );
    deliverWebhookReply();
    return true;
  }

  // 4. Trigger Weekly Inference (/trigger_weekly, /force_weekly, /weekly_inference)
  if (/^(\/trigger_weekly|\/force_weekly|\/weekly_inference)\b/i.test(trimmed)) {
    console.log('[TELEGRAM-CMD] Menerima perintah /trigger_weekly dari Telegram');
    await respondToTelegram(
      '🚀 <b>Memulai Weekly Cognitive Sunday Pass...</b>\n\nSedang menganalisis observasi perilaku 7 hari terakhir dan memanggil 15 Tier AI. Hasil proposal dan ringkasan akan dikirim ke obrolan ini dalam beberapa detik...'
    );
    deliverWebhookReply();

    (async () => {
      try {
        const inferenceEngine = require('../../domain/Inference_Engine');
        const { sendTelegramOutbound } = require('../webhook');

        const result = await inferenceEngine.runWeeklyIdentityInference();
        console.log(`[TELEGRAM-CMD] Weekly Inference done: saved=${result.saved} pendingSent=${result.pendingSent} staged=${result.staged}`);

        if (result.success && result.saved > 0) {
          const summaryMsg = [
            `🧠 <b>Weekly Identity Inference Selesai</b>`,
            `<i>(Siklus Pemahaman Mingguan N.E.X.A — Manual Trigger)</i>`,
            '',
            `📊 Hipotesis yang dianalisis : <b>${result.totalHypotheses}</b>`,
            `✅ Proposal baru tersimpan   : <b>${result.saved}</b>`,
            `📨 Dikirim untuk review      : <b>${result.pendingSent}</b>`,
            `📂 Di-stage (bukti kurang)   : <b>${result.staged}</b>`,
            `⚡ Diabaikan (duplikat/lemah): <b>${result.skipped}</b>`,
            '',
            result.pendingSent > 0
              ? `💡 Silakan review proposal identitas di atas, Tuan.`
              : `📝 Semua hipotesis minggu ini di-stage untuk observasi lanjutan.`
          ].join('\n');
          await sendTelegramOutbound(summaryMsg, true);
        } else {
          await sendTelegramOutbound(`🧠 <b>Weekly Identity Inference Selesai</b>\n\nTidak ada hipotesis baru minggu ini (atau data observasi belum cukup). Model identitas stabil.`, true);
        }
      } catch (e) {
        console.error('[TELEGRAM-CMD] Error saat trigger weekly inference:', e.message);
      }
    })();
    return true;
  }

  // 5. Playbook Procedural Memory (/playbook)
  if (/^\/playbook\b/i.test(trimmed)) {
    console.log('[TELEGRAM-CMD] Menerima perintah /playbook:', trimmed);
    const playbookEngine = require('../../domain/Playbook_Engine');
    const parts = trimmed.split(/\s+/);

    let replyText = '';
    if (parts.length === 1) {
      replyText = await playbookEngine.formatPlaybooksSummary();
    } else if (parts[1].toLowerCase() === 'undo') {
      const targetIntent = parts[2] || '';
      if (!targetIntent) {
        replyText = '⚠️ Format salah. Gunakan: <code>/playbook undo &lt;INTENT&gt;</code> (contoh: <code>/playbook undo EMAIL</code>)';
      } else {
        const undoRes = await playbookEngine.undoPlaybook(targetIntent);
        replyText = undoRes.message;
      }
    } else {
      const targetIntent = parts[1];
      replyText = await playbookEngine.formatPlaybookDetail(targetIntent);
    }

    await respondToTelegram(replyText, false);
    deliverWebhookReply();
    return true;
  }

  // 6. Full-Text Search Past Chats (/search)
  if (/^\/search\b/i.test(trimmed)) {
    const query = trimmed.replace(/^\/search\s*/i, '').trim();
    if (!query) {
      await respondToTelegram('🔍 Format: <code>/search &lt;kata kunci&gt;</code>\nContoh: <code>/search VPS</code> atau <code>/search anggaran kopi</code>', false);
      deliverWebhookReply();
      return true;
    }

    console.log(`[TELEGRAM-CMD] FTS Search query: "${query}"`);
    const results = await supabaseMemories.searchPastChats(query, 5);
    let replyText = '';
    if (!results || results.length === 0) {
      replyText = `🔍 Tidak ditemukan riwayat percakapan untuk kata kunci: "<b>${escapeHtml(query)}</b>".`;
    } else {
      const lines = results.map(r => {
        const dt = new Date(r.created_at).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' });
        const roleLabel = (r.role || 'user').toLowerCase() === 'user' ? 'Tuan Faqih' : 'N.E.X.A';
        return `• <b>[${dt} WIB] ${roleLabel}:</b>\n  <i>"${escapeHtml(String(r.content || '').substring(0, 150))}${String(r.content || '').length > 150 ? '...' : ''}"</i>`;
      });
      replyText = `🔍 <b>Hasil Pencarian Riwayat: "${escapeHtml(query)}"</b>\n\n${lines.join('\n\n')}`;
    }

    await respondToTelegram(replyText, false);
    deliverWebhookReply();
    return true;
  }

  return false;
}

module.exports = {
  handleDirectCommand
};
