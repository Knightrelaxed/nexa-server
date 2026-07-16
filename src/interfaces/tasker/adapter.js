// ============================================================
// N.E.X.A — TASKER ADAPTER
// Menangani event dari Android Tasker (SCREEN_TIME_VIOLATION, ALARM_DISMISSED)
// Path lama: src/interfaces/webhook.js (lines 3249-3298)
// Path baru: src/interfaces/tasker/adapter.js
// ============================================================
'use strict';

const env = require('../../config/env');
const godMode = require('../../domain/Discipline_GodMode');
const { sendTelegramOutbound } = require('../telegram/actions');

async function handleTaskerWebhook(req, res) {
  const { type, data } = req.body;

  if (!type) {
    return res.status(400).json({ error: 'Missing event type' });
  }
  if (!data || typeof data !== 'object') {
    return res.status(400).json({ error: 'Missing or invalid data payload' });
  }

  console.log(`[TASKER] Received event type: ${type}`);

  if (type === 'SCREEN_TIME_VIOLATION') {
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
      const intelligenceBrief = require('../../domain/Intelligence_Brief');
      const briefingText = await intelligenceBrief.generateMorningBriefing();
      const safeText = String(briefingText).substring(0, 4000);
      // Tasker-initiated: must use outbound (no webhook response available)
      await sendTelegramOutbound(safeText);

      // [PHASE 6 — Pilar 8.2] Log wake-up event for behavioral tracking (fire-and-forget)
      try {
        const behaviorEngine = require('../../domain/Behavior_Engine');
        await behaviorEngine.logWakeUp();
      } catch (_) { /* Never let behavior logging crash the main briefing flow */ }

      res.status(200).json({ status: 'Briefing sent' });
    } catch (e) {
      console.error('[TASKER] Alarm briefing failed:', e.message);
      res.status(500).json({ error: 'Briefing Failed', detail: e.message });
    }

  } else {
    res.status(400).json({ error: `Unknown event type: ${type}` });
  }
}

module.exports = { handleTaskerWebhook };
