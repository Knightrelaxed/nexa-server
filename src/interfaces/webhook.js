const express = require('express');
const router = express.Router();
const axios = require('axios');
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
// TELEGRAM WEBHOOK (Telegram → N.E.X.A Server)
// ============================================================
router.post('/telegram', security.telegramIdentityLock, async (req, res) => {
  // Always respond 200 OK immediately to avoid Telegram retrying
  res.status(200).send('OK');

  const message = req.body?.message;
  if (!message) return;

  // Helper: send message back to Tuan Faqih via Telegram (with 4000 char safety)
  // Uses Node.js built-in https.request (most low-level, IPv4-forced)
  const sendToTelegram = (text) => new Promise((resolve) => {
    if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID) return resolve();
    const safeText = String(text).substring(0, 4000);
    const botToken = env.TELEGRAM_BOT_TOKEN.trim();
    const chatId = env.TELEGRAM_CHAT_ID.trim();
    const body = JSON.stringify({ chat_id: chatId, text: safeText, parse_mode: 'HTML' });

    const options = {
      hostname: 'api.telegram.org',
      port: 443,
      path: `/bot${botToken}/sendMessage`,
      method: 'POST',
      family: 4, // Force IPv4 — critical for Hugging Face Docker containers
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body)
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        if (res.statusCode !== 200) {
          console.error('[TELEGRAM] API Error:', res.statusCode, data);
        }
        resolve();
      });
    });

    req.on('error', (e) => {
      console.error('[TELEGRAM] https.request Error:', e.code, e.message);
      resolve();
    });

    req.setTimeout(10000, () => {
      console.error('[TELEGRAM] Request timed out after 10s');
      req.destroy();
      resolve();
    });

    req.write(body);
    req.end();
  });


  // Helper: escape dynamic/untrusted strings before embedding in HTML parse_mode messages
  // Prevents Telegram rejecting the message with 400 Bad Request
  const escapeHtml = (str) => String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

  let textInput = message.text;

  // ============================================================
  // LAPISAN 4: BLACK BOX — Emergency Telegram Buffer Parser
  // Triggered when Tasker fails to POST directly to /webhook/tasker
  // (e.g. during server cold start). Tasker sends a structured text
  // message with prefix [BUFFER] as a fallback.
  // Format: [BUFFER] nominal | merchant | ISO_timestamp
  // ============================================================
  if (textInput && textInput.trim().startsWith('[BUFFER]')) {
    console.log('[BUFFER] Emergency buffer message received from Tasker via Telegram.');
    try {
      const bufferContent = textInput.replace('[BUFFER]', '').trim();
      const parts = bufferContent.split('|').map(s => s.trim());

      if (parts.length < 2) {
        await sendToTelegram('⚠️ [BUFFER] Format tidak valid. Gunakan: [BUFFER] nominal | merchant | timestamp');
        return;
      }

      const nominal = parseFloat(parts[0]);
      const merchant = parts[1] || 'Unknown';
      // Timestamp is optional; fall back to now if missing or invalid
      const rawTime = parts[2] || '';
      const parsedTime = rawTime ? new Date(rawTime) : new Date();
      const transactionTime = isNaN(parsedTime.getTime()) ? new Date() : parsedTime;

      if (isNaN(nominal) || nominal <= 0) {
        await sendToTelegram('⚠️ [BUFFER] Nominal tidak valid. Harus berupa angka positif.');
        return;
      }

      // Use TASKER_LIVIN source so deduplication engine is active
      const result = await financeEngine.processTransaction({
        nominal,
        type: 'EXPENSE',
        destination: merchant,
        category: 'Auto-Buffer Recovery',
        description: 'Recovered from Telegram Buffer (Server was starting up)',
        time: transactionTime.toISOString()
      }, 'TASKER_LIVIN');

      if (result.status === 'DUPLICATE') {
        await sendToTelegram(`⚠️ [BUFFER] Transaksi Rp${nominal.toLocaleString('id-ID')} ke ${merchant} sudah tercatat sebelumnya. Duplikasi diabaikan.`);
      } else {
        await sendToTelegram(`✅ [BUFFER] Pulih: Rp${nominal.toLocaleString('id-ID')} ke ${merchant} berhasil dicatat.`);
      }
    } catch (bufferErr) {
      console.error('[BUFFER] Recovery failed:', bufferErr.message);
      await sendToTelegram(`❌ [BUFFER] Gagal memulihkan transaksi: ${bufferErr.message}`);
    }
    return; // STOP — do not pass buffer messages to AI Router
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
      await sendToTelegram('⚠️ Maaf Tuan, sistem pendengaran (Groq Whisper) sedang terganggu. Coba kirim ulang pesan suaranya.');
      return;
    }
  }

  // ============================================================
  // IMAGE / VISION PROCESSING
  // ============================================================
  if (message.photo && message.photo.length > 0) {
    try {
      console.log('[TELEGRAM] Photo received. Processing via Gemini Vision...');
      // Telegram sends multiple sizes, the last one is the largest
      const largestPhoto = message.photo[message.photo.length - 1];
      textInput = await visionEngine.processTelegramImage(largestPhoto.file_id, message.caption || '');
      console.log('[VISION] Image analysis result:', textInput);
    } catch (e) {
      console.error('[VISION] Image processing failed:', e.message);
      await sendToTelegram('⚠️ Maaf Tuan, sistem penglihatan (Vision) sedang terganggu.');
      return;
    }
  } else if (message.caption && !textInput) {
    textInput = message.caption; // fallback if it's a document/video without explicit support
  }

  if (!textInput || textInput.trim() === '') return;

  console.log('[TELEGRAM] Received message:', textInput.substring(0, 100));

  try {
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
          // Override reply if duplicate was detected
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
          // Use the domain result for ALL statuses (SUCCESS and FAILED)
          // This ensures READ results and error messages always reach the user
          if (calResult && calResult.message) {
            domainReply = calResult.status === 'FAILED'
              ? `❌ ${calResult.message}`
              : calResult.message;
          }
        }
        break;

      case '2ND_BRAIN':
        if (routingData.extracted_data && routingData.extracted_data.content) {
          const factType = routingData.extracted_data.type || 'IDEA'; // 'PERSONAL_FACT' or 'IDEA'

          // Save to Supabase vault with correct type
          await supabaseMemories.saveIdeaToVault(
            routingData.extracted_data.content,
            factType
          ).catch(e => console.error('[2ND_BRAIN] Supabase vault save error:', e));

          // If it's a PERSONAL_FACT, invalidate cache immediately so
          // the very next message already knows this fact
          if (factType === 'PERSONAL_FACT') {
            invalidatePersonalFactsCache();
            console.log('[2ND_BRAIN] PERSONAL_FACT saved — cache invalidated.');
          }

          const googleWorkspace = require('../infrastructure/Google_Workspace');
          const docUrl = await googleWorkspace.createIdeaDoc(
            routingData.extracted_data.title || (factType === 'PERSONAL_FACT' ? 'Fakta Personal — N.E.X.A' : 'Ideation N.E.X.A'),
            routingData.extracted_data.content
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

    // Send reply: domain-specific reply takes priority, then AI reply_message
    const finalReply = domainReply || routingData.reply_message;
    if (finalReply) {
      console.log('[TELEGRAM] Replying with intent:', routingData.intent);
      await sendToTelegram(finalReply);
    }
  } catch (error) {
    console.error('[TELEGRAM] Error processing message:', error.message);
    await sendToTelegram(`⚠️ N.E.X.A mengalami gangguan internal:\n<code>${escapeHtml(error.message)}</code>\n\nSilakan cek log server di Hugging Face Space dashboard.`);
  }
});

// ============================================================
// TASKER WEBHOOK (Android → N.E.X.A Server)
// ============================================================
router.post('/tasker', security.webhookAuth, async (req, res) => {
  const { type, data } = req.body;

  // Guard: ensure 'type' and 'data' fields exist to prevent null access crash
  if (!type) {
    return res.status(400).json({ error: 'Missing event type' });
  }
  if (!data || typeof data !== 'object') {
    return res.status(400).json({ error: 'Missing or invalid data payload' });
  }

  console.log(`[TASKER] Received event type: ${type}`);

  if (type === 'FINANCE_PUSH') {
    // Tasker captured Livin' push notification
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
    // God Mode trigger from screen-time monitoring
    try {
      await godMode.triggerGodMode(3, { violation_app: data.app_name, session_id: 'auto' });
      res.status(200).json({ status: 'God Mode Activated' });
    } catch (e) {
      console.error('[TASKER] God mode trigger failed:', e.message);
      res.status(500).json({ error: 'God Mode Failed to Execute' });
    }

  } else if (type === 'ALARM_DISMISSED') {
    // Morning briefing triggered exactly when Tuan Faqih turns off alarm
    // Guard: Telegram credentials must exist before attempting to send
    if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID) {
      console.error('[TASKER] ALARM_DISMISSED: Telegram credentials not configured.');
      return res.status(500).json({ error: 'Telegram not configured on server' });
    }
    try {
      const intelligenceBrief = require('../domain/Intelligence_Brief');
      const briefingText = await intelligenceBrief.generateMorningBriefing();
      // Truncate to Telegram's 4096-char limit and send as plain text
      // (briefing is narrative text, NOT HTML — avoid parse_mode HTML)
      const safeText = String(briefingText).substring(0, 4000);
      await axios.post(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
        chat_id: env.TELEGRAM_CHAT_ID,
        text: safeText
        // Intentionally NO parse_mode: Morning briefing is plain narrative text
      });
      res.status(200).json({ status: 'Briefing sent' });
    } catch (e) {
      console.error('[TASKER] Alarm briefing failed:', e.message);
      res.status(500).json({ error: 'Briefing Failed', detail: e.message });
    }

  } else if (type === 'WATCHDOG_PING') {
    // ============================================================
    // LAPISAN 3: ANDROID WATCHDOG — Tasker health ping
    // Tasker sends this every 2 hours. Server replies with vital signs.
    // Tasker uses the response to confirm server is healthy.
    // ============================================================
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
