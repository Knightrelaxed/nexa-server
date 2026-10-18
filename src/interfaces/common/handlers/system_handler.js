'use strict';
// ============================================================
// N.E.X.A — COMMON SYSTEM & UTILITY HANDLER
// Handles WEB_SEARCH, DEVICE_CONTROL, DIAGNOSE_SYSTEM, DISCIPLINE, LOCATION
// ============================================================

const aiRouter            = require('../../../core/AI_Router');
const godMode             = require('../../../domain/Discipline_GodMode');
const webSearch           = require('../../../infrastructure/Web_Search');
const locationOrchestrator = require('../../../domain/Location_Orchestrator');

async function handleSystemIntent(intent, routingData, context = {}) {
  const ed = routingData?.extracted_data || {};
  const textInput = context.textInput || '';

  // ────────────────────────────────────────────────────────────
  // 1. WEB_SEARCH
  // ────────────────────────────────────────────────────────────
  if (intent === 'WEB_SEARCH') {
    const query = ed.query || textInput;
    const searchType = ed.type || 'search';
    let searchMode = ed.mode || 'fast';

    const isDeepTrigger = /mendalam|kronologi|detail|seluk[-\s]?beluk|lengkap|investigasi|komprehensif|analis|bedah|runtut|asal[-\s]?(usul|muasal)|latar[-\s]?belakang|secara utuh|secara luas|riset|studi kasus|deep|in[-\s]?depth|breakdown|root cause|full context/i.test(textInput);
    if (isDeepTrigger) {
      searchMode = 'deep';
    }

    console.log(`[COMMON-SEARCH] Searching web [Mode: ${searchMode.toUpperCase()}]: "${query}" [type: ${searchType}]`);
    const searchResult = await webSearch.searchWeb(query, searchType, searchMode);
    console.log('[COMMON-SEARCH] Synthesizing response with AI...');

    const prompt = `Sebagai N.E.X.A, asisten AI pribadi Tuan Faqih Hidayatulloh, Anda baru saja melakukan penelusuran web [Mode: ${searchMode.toUpperCase()}] untuk menjawab pernyataannya.\n\nPernyataan/Pertanyaan Tuan Faqih: "${textInput}"\n\nHasil Penelusuran Web:\n${searchResult}\n\nTugas: Jawablah Tuan Faqih secara natural, cerdas, dan luwes berdasarkan hasil penelusuran di atas. Berikan jawaban yang informatif seolah Anda sedang berdiskusi. Jangan sekadar menyalin ulang hasil pencariannya. Berikan kesimpulan atau opini jika relevan.`;
    return await aiRouter.callAI(prompt);
  }

  // ────────────────────────────────────────────────────────────
  // 2. DEVICE_CONTROL (Hardware Bridge)
  // ────────────────────────────────────────────────────────────
  if (intent === 'DEVICE_CONTROL') {
    const deviceControlEngine = require('../../../domain/Device_Control_Engine');
    const devResult = await deviceControlEngine.executeDeviceAction(routingData, {
      sessionId: context.sessionKey,
      chatId: context.chatId || context.sessionKey,
      platform: context.platform || 'cli'
    });

    if (devResult && devResult.photoBase64 && context.platform === 'telegram') {
      try {
        const env = require('../../../config/env');
        const botToken = env.TELEGRAM_BOT_TOKEN?.trim();
        const targetChatId = (context.chatId || env.TELEGRAM_CHAT_ID)?.toString().trim();
        if (botToken && targetChatId) {
          const buffer = Buffer.from(devResult.photoBase64, 'base64');
          const formData = new FormData();
          formData.append('chat_id', targetChatId);
          formData.append('photo', new Blob([buffer], { type: 'image/jpeg' }), 'capture.jpg');
          formData.append('caption', devResult.message || '📸 Tangkapan Kamera / Layar HP');
          formData.append('parse_mode', 'HTML');

          const directUrl = `https://api.telegram.org/bot${botToken}/sendPhoto`;
          const resp = await fetch(directUrl, { method: 'POST', body: formData });
          const photoData = await resp.json().catch(() => ({}));
          if (photoData.ok) {
            console.log('[TELEGRAM] Direct photo send SUCCESS.');
            return null; // Photo already sent directly
          }
        }
      } catch (photoErr) {
        console.error('[TELEGRAM] Failed to send photo buffer:', photoErr.message);
      }
    }
    return devResult?.message || '⚠️ Perintah kontrol perangkat telah diproses.';
  }

  // ────────────────────────────────────────────────────────────
  // 3. DIAGNOSE_SYSTEM
  // ────────────────────────────────────────────────────────────
  if (intent === 'DIAGNOSE_SYSTEM') {
    const logger = require('../../../utils/logger');
    const recentLogs = logger.getRecentLogs();
    if (!recentLogs || recentLogs.trim() === '') {
      return '✅ Sistem berjalan normal. Belum ada log baru yang terekam di memori saat ini.';
    }
    return await aiRouter.analyzeSystemLogs(textInput, recentLogs);
  }

  // ────────────────────────────────────────────────────────────
  // 4. DISCIPLINE (God Mode)
  // ────────────────────────────────────────────────────────────
  if (intent === 'DISCIPLINE') {
    if (routingData.god_mode_trigger) {
      await godMode.triggerGodMode(3, { source: `${context.platform || 'General'} Instruction` });
    }
    try {
      const appDiscipline = require('../../../domain/App_Discipline_Engine');
      if (typeof appDiscipline.handleDisciplineChatIntent === 'function') {
        const discReply = await appDiscipline.handleDisciplineChatIntent(ed, textInput);
        if (discReply) return discReply;
      }
    } catch (_) {}
    return routingData.reply_message || '⚡ Mode disiplin diaktifkan.';
  }

  // ────────────────────────────────────────────────────────────
  // 5. LOCATION
  // ────────────────────────────────────────────────────────────
  if (intent === 'LOCATION') {
    const action = ed.action || 'GET';
    if (typeof locationOrchestrator.handleLocationIntent === 'function') {
      return await locationOrchestrator.handleLocationIntent(ed);
    }
    if (action === 'SEARCH' || ed.query) {
      return await locationOrchestrator.searchLocation(ed.query || textInput);
    }
    return await locationOrchestrator.getCurrentLocation();
  }

  return null;
}

module.exports = {
  handleSystemIntent
};
