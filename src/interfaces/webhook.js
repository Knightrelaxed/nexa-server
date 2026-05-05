const express = require('express');
const router = express.Router();
const https = require('https');
const env = require('../config/env');
const security = require('../utils/security');
const aiRouter = require('../core/AI_Router');
const { invalidatePersonalFactsCache } = aiRouter;
const financeEngine = require('../domain/Finance_Engine');
const godMode = require('../domain/Discipline_GodMode');
const voiceEngine = require('../core/Voice_Engine');
const visionEngine = require('../core/Vision_Engine');
const spreadsheetManager = require('../domain/Spreadsheet_Manager');
const supabaseMemories = require('../infrastructure/Supabase_Memories');

// ============================================================
// OUTBOUND TELEGRAM SENDER (FALLBACK ONLY)
// Uses raw https.request for cases where webhook response is
// already consumed (Tasker, Cron, or secondary messages).
// May fail on HF Docker free tier — that's acceptable because
// the PRIMARY reply uses Webhook Response Method (zero outbound).
// ============================================================
function sendTelegramOutbound(text) {
  return new Promise((resolve) => {
    if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID) return resolve();
    const botToken = env.TELEGRAM_BOT_TOKEN.trim();
    const chatId = env.TELEGRAM_CHAT_ID.trim();
    const safeText = String(text).substring(0, 4000);
    const body = JSON.stringify({ chat_id: chatId, text: safeText, parse_mode: 'HTML' });

    const req = https.request({
      hostname: 'api.telegram.org',
      port: 443,
      path: `/bot${botToken}/sendMessage`,
      method: 'POST',
      family: 4,
      rejectUnauthorized: false,
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body)
      }
    }, (res) => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        if (res.statusCode !== 200) console.error('[TELEGRAM-OUTBOUND] API error:', res.statusCode, d);
        resolve();
      });
    });

    req.setTimeout(10000, () => { req.destroy(); resolve(); });
    req.on('error', (e) => { console.error('[TELEGRAM-OUTBOUND] Error:', e.message); resolve(); });
    req.write(body);
    req.end();
  });
}

// ============================================================
// TELEGRAM WEBHOOK — Webhook Response Method
// ============================================================
// ARCHITECTURE: Instead of making outbound HTTP calls to
// api.telegram.org (which HF Docker BLOCKS), we embed the reply
// DIRECTLY in the HTTP response body. Telegram reads it and
// delivers the message. Zero outbound connections needed.
// Docs: https://core.telegram.org/bots/api#making-requests-when-getting-updates
// ============================================================
router.post('/telegram', security.telegramIdentityLock, async (req, res) => {
  const message = req.body?.message;
  if (!message) {
    return res.status(200).send('OK');
  }

  // Helper: escape untrusted strings for HTML parse_mode
  const escapeHtml = (str) => String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

  // ============================================================
  // CORE: Webhook Response — reply via HTTP response body
  // First call sends the reply. Subsequent calls use outbound fallback.
  // ============================================================
  let hasResponded = false;

  const respondToTelegram = (text) => {
    if (hasResponded) {
      // Already used the webhook response slot — use outbound fallback
      return sendTelegramOutbound(text);
    }
    hasResponded = true;
    const safeText = String(text).substring(0, 4000);
    console.log('[TELEGRAM] Sending reply via Webhook Response Method.');
    return res.status(200).json({
      method: 'sendMessage',
      chat_id: env.TELEGRAM_CHAT_ID,
      text: safeText,
      parse_mode: 'HTML'
    });
  };

  // Safety timeout: if processing takes > 25s, send empty 200 to prevent Telegram retry
  const safetyTimer = setTimeout(() => {
    if (!hasResponded) {
      hasResponded = true;
      console.warn('[TELEGRAM] Safety timeout (25s) — sending empty 200 OK.');
      res.status(200).send('OK');
    }
  }, 25000);

  let textInput = message.text;

  try {
    // ============================================================
    // LAPISAN 4: BLACK BOX — Emergency Telegram Buffer Parser
    // ============================================================
    if (textInput && textInput.trim().startsWith('[BUFFER]')) {
      console.log('[BUFFER] Emergency buffer message received from Tasker via Telegram.');
      try {
        const bufferContent = textInput.replace('[BUFFER]', '').trim();
        const parts = bufferContent.split('|').map(s => s.trim());

        if (parts.length < 2) {
          await respondToTelegram('⚠️ [BUFFER] Format tidak valid. Gunakan: [BUFFER] nominal | merchant | timestamp');
          clearTimeout(safetyTimer);
          return;
        }

        const nominal = parseFloat(parts[0]);
        const merchant = parts[1] || 'Unknown';
        const rawTime = parts[2] || '';
        const parsedTime = rawTime ? new Date(rawTime) : new Date();
        const transactionTime = isNaN(parsedTime.getTime()) ? new Date() : parsedTime;

        if (isNaN(nominal) || nominal <= 0) {
          await respondToTelegram('⚠️ [BUFFER] Nominal tidak valid. Harus berupa angka positif.');
          clearTimeout(safetyTimer);
          return;
        }

        const result = await financeEngine.processTransaction({
          nominal,
          type: 'EXPENSE',
          destination: merchant,
          category: 'Auto-Buffer Recovery',
          description: 'Recovered from Telegram Buffer (Server was starting up)',
          time: transactionTime.toISOString()
        }, 'TASKER_LIVIN');

        if (result.status === 'DUPLICATE') {
          await respondToTelegram(`⚠️ [BUFFER] Transaksi Rp${nominal.toLocaleString('id-ID')} ke ${merchant} sudah tercatat sebelumnya. Duplikasi diabaikan.`);
        } else {
          await respondToTelegram(`✅ [BUFFER] Pulih: Rp${nominal.toLocaleString('id-ID')} ke ${merchant} berhasil dicatat.`);
        }
      } catch (bufferErr) {
        console.error('[BUFFER] Recovery failed:', bufferErr.message);
        await respondToTelegram(`❌ [BUFFER] Gagal memulihkan transaksi: ${bufferErr.message}`);
      }
      clearTimeout(safetyTimer);
      return;
    }

    // ============================================================
    // VOICE NOTE PROCESSING
    // ============================================================
    if (message.voice) {
      try {
        console.log('[TELEGRAM] Voice note received. Transcribing via Groq Whisper...');
        textInput = await voiceEngine.transcribeTelegramVoice(message.voice.file_id);
        console.log('[VOICE] Transcription result:', textInput);
      } catch (e) {
        console.error('[VOICE] Transcription failed:', e.message);
        await respondToTelegram('⚠️ Maaf Tuan, sistem pendengaran (Groq Whisper) sedang terganggu. Coba kirim ulang pesan suaranya.');
        clearTimeout(safetyTimer);
        return;
      }
    }

    // ============================================================
    // IMAGE / VISION PROCESSING
    // ============================================================
    if (message.photo && message.photo.length > 0) {
      try {
        console.log('[TELEGRAM] Photo received. Processing via Gemini Vision...');
        const largestPhoto = message.photo[message.photo.length - 1];
        textInput = await visionEngine.processTelegramImage(largestPhoto.file_id, message.caption || '');
        console.log('[VISION] Image analysis result:', textInput);
      } catch (e) {
        console.error('[VISION] Image processing failed:', e.message);
        await respondToTelegram('⚠️ Maaf Tuan, sistem penglihatan (Vision) sedang terganggu.');
        clearTimeout(safetyTimer);
        return;
      }
    } else if (message.caption && !textInput) {
      textInput = message.caption;
    }

    if (!textInput || textInput.trim() === '') {
      clearTimeout(safetyTimer);
      if (!hasResponded) {
        hasResponded = true;
        res.status(200).send('OK');
      }
      return;
    }

    console.log('[TELEGRAM] Received message:', textInput.substring(0, 100));

    // Send to AI Router
    const routingData = await aiRouter.routeUserMessage(textInput);
    console.log('[ROUTER] Intent identified:', routingData.intent);

    // Execute Domain Logic based on Intent
    let domainReply = null;

    switch (routingData.intent) {
      case 'FINANCE':
        if (routingData.extracted_data && routingData.extracted_data.nominal) {
          const result = await financeEngine.processTransaction({
            nominal: routingData.extracted_data.nominal,
            type: routingData.extracted_data.type || 'EXPENSE',
            destination: routingData.extracted_data.destination || routingData.extracted_data.merchant || 'Unknown',
            category: routingData.extracted_data.category || 'Uncategorized',
            description: routingData.extracted_data.description || '-',
            time: routingData.extracted_data.time || new Date().toISOString()
          }, 'TELEGRAM_MANUAL');
          if (result && result.status === 'DUPLICATE') {
            domainReply = '⚠️ Transaksi ini tampaknya sudah pernah dicatat sebelumnya. Tidak ada duplikasi yang dieksekusi.';
          }
        }
        break;

      case 'DISCIPLINE':
        if (routingData.god_mode_trigger) {
          await godMode.triggerGodMode(3, { source: 'Telegram Instruction' });
        }
        break;

      case 'CALENDAR':
        if (routingData.extracted_data) {
          const agendaManager = require('../domain/Agenda_Manager');
          const calResult = await agendaManager.handleCalendarIntent(routingData.extracted_data);
          if (calResult && calResult.message) {
            domainReply = calResult.status === 'FAILED'
              ? `❌ ${calResult.message}`
              : calResult.message;
          }
        }
        break;

      case '2ND_BRAIN':
        if (routingData.extracted_data && routingData.extracted_data.content) {
          const factType = routingData.extracted_data.type || 'IDEA';

          await supabaseMemories.saveIdeaToVault(
            routingData.extracted_data.content,
            factType
          ).catch(e => console.error('[2ND_BRAIN] Supabase vault save error:', e));

          if (factType === 'PERSONAL_FACT') {
            invalidatePersonalFactsCache();
            console.log('[2ND_BRAIN] PERSONAL_FACT saved — cache invalidated.');
          }

          const googleWorkspace = require('../infrastructure/Google_Workspace');
          const docUrl = await googleWorkspace.appendToIdeaDoc(
            routingData.extracted_data.title || (factType === 'PERSONAL_FACT' ? 'Fakta Personal — N.E.X.A' : 'Ideation N.E.X.A'),
            routingData.extracted_data.content,
            factType
          ).catch(e => { console.error('[2ND_BRAIN] Google Doc error:', e); return null; });

          if (docUrl) {
            domainReply = factType === 'PERSONAL_FACT'
              ? `✅ Fakta personal tersimpan dan akan selalu saya ingat, Tuan.\n📄 Arsip: ${docUrl}`
              : `✅ Ide berhasil disimpan ke arsip dan Google Docs:\n${docUrl}`;
          }
          console.log(`[2ND_BRAIN] Saved as ${factType} to Supabase and Google Docs.`);
        }
        break;

      case 'SPREADSHEET':
        if (routingData.extracted_data) {
          const result = await spreadsheetManager.processSpreadsheetIntent(routingData.extracted_data);
          if (result && result.message) {
            domainReply = result.message;
          }
        }
        break;
    }

    // Send reply via Webhook Response Method (ZERO outbound needed)
    const finalReply = domainReply || routingData.reply_message;
    if (finalReply) {
      console.log('[TELEGRAM] Replying with intent:', routingData.intent);
      await respondToTelegram(finalReply);
    }

  } catch (error) {
    console.error('[TELEGRAM] Error processing message:', error.message);
    await respondToTelegram(`⚠️ N.E.X.A mengalami gangguan internal:\n<code>${escapeHtml(error.message)}</code>\n\nSilakan cek log server di Hugging Face Space dashboard.`);
  } finally {
    clearTimeout(safetyTimer);
    // Ensure Telegram always gets a response to prevent retries
    if (!hasResponded) {
      hasResponded = true;
      res.status(200).send('OK');
    }
  }
});

// ============================================================
// TASKER WEBHOOK (Android → N.E.X.A Server)
// ============================================================
router.post('/tasker', security.webhookAuth, async (req, res) => {
  const { type, data } = req.body;

  if (!type) {
    return res.status(400).json({ error: 'Missing event type' });
  }
  if (!data || typeof data !== 'object') {
    return res.status(400).json({ error: 'Missing or invalid data payload' });
  }

  console.log(`[TASKER] Received event type: ${type}`);

  if (type === 'FINANCE_PUSH') {
    try {
      const result = await financeEngine.processTransaction({
        nominal: data.nominal,
        type: 'EXPENSE',
        destination: data.merchant || 'Unknown',
        category: 'Uncategorized',
        description: 'Auto-captured from Push Notification',
        time: data.timestamp
      }, 'TASKER_LIVIN');
      res.status(200).json(result);
    } catch (e) {
      console.error('[TASKER] Finance push failed:', e.message);
      res.status(500).json({ error: 'Internal Server Error' });
    }

  } else if (type === 'SCREEN_TIME_VIOLATION') {
    try {
      await godMode.triggerGodMode(3, { violation_app: data.app_name, session_id: 'auto' });
      res.status(200).json({ status: 'God Mode Activated' });
    } catch (e) {
      console.error('[TASKER] God mode trigger failed:', e.message);
      res.status(500).json({ error: 'God Mode Failed to Execute' });
    }

  } else if (type === 'ALARM_DISMISSED') {
    if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID) {
      console.error('[TASKER] ALARM_DISMISSED: Telegram credentials not configured.');
      return res.status(500).json({ error: 'Telegram not configured on server' });
    }
    try {
      const intelligenceBrief = require('../domain/Intelligence_Brief');
      const briefingText = await intelligenceBrief.generateMorningBriefing();
      const safeText = String(briefingText).substring(0, 4000);
      // Tasker-initiated: must use outbound (no webhook response available)
      await sendTelegramOutbound(safeText);
      res.status(200).json({ status: 'Briefing sent' });
    } catch (e) {
      console.error('[TASKER] Alarm briefing failed:', e.message);
      res.status(500).json({ error: 'Briefing Failed', detail: e.message });
    }

  } else if (type === 'WATCHDOG_PING') {
    const uptimeSeconds = Math.floor(process.uptime());
    res.status(200).json({
      status: 'ALIVE',
      uptime_human: `${Math.floor(uptimeSeconds / 3600)}h ${Math.floor((uptimeSeconds % 3600) / 60)}m`,
      timestamp_jakarta: new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' }),
      memory_mb: Math.round(process.memoryUsage().rss / 1024 / 1024)
    });

  } else {
    res.status(400).json({ error: `Unknown event type: ${type}` });
  }
});

module.exports = router;
