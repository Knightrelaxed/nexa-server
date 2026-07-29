// ============================================================
// N.E.X.A — CLI REMOTE ADAPTER
// Menangani request dari Universal Remote CLI (nexa-cli)
// Berjalan di Server HF, memproses pesan, dan mengembalikan teks.
// ============================================================
'use strict';

const aiRouter = require('../../core/AI_Router');
const behaviorEngine = require('../../domain/Behavior_Engine');
const intentionEngine = require('../../domain/Intention_Engine');

/**
 * Endpoint handler untuk POST /webhook/cli
 * Body yang diharapkan: { "message": "halo", "session_id": "cli-default" }
 */
async function handleCliWebhook(req, res) {
  try {
    const textInput = req.body?.message || req.body?.text || '';
    const sessionId = req.body?.session_id || 'cli-default';

    if (!textInput || textInput.trim().length === 0) {
      return res.status(400).json({ error: 'Pesan kosong.' });
    }

    console.log(`\n[CLI] 📥 Received message from Remote Terminal: "${textInput}"`);

    // 1. Eksekusi ke Universal Router
    const startTime = Date.now();
    const routingData = await aiRouter.routeUserMessage(textInput, {
      source: 'remote_cli',
      sessionId: sessionId
    });
    const elapsedMs = Date.now() - startTime;

    // 2. Logging Perilaku (Sama seperti Telegram)
    if (routingData.intent) {
      console.log(`[CLI] 🤖 Replying with intent: ${routingData.intent} (${elapsedMs}ms)`);
      behaviorEngine.logUserInteraction(routingData.intent, textInput, routingData.mood || 'NEUTRAL').catch(() => {});
      
      const DECISION_INTENTS = new Set(['FINANCE', 'DISCIPLINE', 'CALENDAR', 'ADVICE', 'NORMAL_CHAT']);
      if (DECISION_INTENTS.has(String(routingData.intent).toUpperCase())) {
         intentionEngine.detectAndSaveIntention(textInput, routingData).catch(() => {});
      }
    }

    // 3. Format Balasan
    let replyText = routingData.reply_message || routingData.text || '';
    if (typeof replyText === 'object') {
      replyText = replyText.text || JSON.stringify(replyText);
    }

    // 4. Kirim Balasan ke Remote CLI Client
    return res.status(200).json({
      ok: true,
      reply: replyText,
      intent: routingData.intent || 'UNKNOWN',
      elapsed_ms: elapsedMs
    });

  } catch (error) {
    console.error('[CLI-ADAPTER] Error processing message:', error.message);
    return res.status(500).json({
      ok: false,
      error: error.message,
      reply: `⚠️ [N.E.X.A SYSTEM FAULT]\nInternal Error: ${error.message}`
    });
  }
}

module.exports = {
  handleCliWebhook
};
