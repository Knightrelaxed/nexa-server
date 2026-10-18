'use strict';
// ============================================================
// N.E.X.A — CLI INTERFACE ADAPTER (Modular v3.0)
// Manages CLI Webhook, SSE Connection Streams, and Sessions
// ============================================================

const aiRouter              = require('../../core/AI_Router');
const { invalidatePersonalFactsCache } = aiRouter;
const { resetTokenAccumulator, getAccumulatedTokenUsage } = require('../../core/Fallback_Engine');
const supabaseMemories      = require('../../infrastructure/Supabase_Memories');
const anticipatoryEngine    = require('../../domain/Anticipatory_Engine');

const {
  stripHtml,
  runPendingInterceptors,
  cliPendingCalendar,
  cliPendingConflict,
  cliPendingEmail,
  cliPendingDatabase
} = require('./interceptors');

const {
  isAmbiguousFollowUp,
  hasStrongNewIntentCue,
  resolveAmbiguousFollowUp,
  getClarificationMessage
} = require('../common/follow_up_resolver');

const {
  isFactAboutNexa,
  classifySelfModelLayer,
  dispatchCliIntent
} = require('./intent_dispatcher');

// ── In-Memory Session Store ──────────────────────────────────
// Menyimpan conversationContext per session_id agar CLI punya
// memori percakapan selama server berjalan.
const cliSessions = new Map();

// ── SSE Active Connections ───────────────────────────────────
const activeCliStreams = new Set();

// ── Advice Session Counter (Overthinking Tracker) ─────────────
const _adviceSessionMap = new Map();
const ADVICE_SESSION_TTL_MS = 60 * 60 * 1000; // 1 jam

function _trackAdviceSession(sessionId) {
  const key = String(sessionId || 'cli-default');
  const now = Date.now();
  const session = _adviceSessionMap.get(key);
  if (!session || (now - session.lastAt) > ADVICE_SESSION_TTL_MS) {
    _adviceSessionMap.set(key, { count: 1, lastAt: now });
    return 1;
  }
  const newCount = session.count + 1;
  _adviceSessionMap.set(key, { count: newCount, lastAt: now });
  return newCount;
}

function _getAdviceSessionCount(sessionId) {
  const key = String(sessionId || 'cli-default');
  const now = Date.now();
  const session = _adviceSessionMap.get(key);
  if (!session || (now - session.lastAt) > ADVICE_SESSION_TTL_MS) return 0;
  return session.count;
}

// ── Endpoint SSE GET /webhook/cli/stream ──────────────────────
function handleCliStream(req, res) {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();
  console.log('[CLI-STREAM] Client connected.');
  activeCliStreams.add(res);
  res.write(`data: ${JSON.stringify({ type: 'connected', message: 'SSE Connection Established' })}\n\n`);
  req.on('close', () => {
    console.log('[CLI-STREAM] Client disconnected.');
    activeCliStreams.delete(res);
  });
}

// ── Push Notifikasi ke semua CLI yang terhubung ───────────────
function pushToCli(text) {
  if (activeCliStreams.size === 0) return false;
  const payload = `data: ${JSON.stringify({ type: 'notification', message: text })}\n\n`;
  for (const res of activeCliStreams) {
    try {
      res.write(payload);
    } catch (err) {
      console.error('[CLI-STREAM] Error pushing to client:', err.message);
      activeCliStreams.delete(res);
    }
  }
  return true;
}

// ============================================================
// ── HANDLER UTAMA POST /webhook/cli ──────────────────────────
// ============================================================
async function handleCliWebhook(req, res) {
  resetTokenAccumulator();
  const _origJson = res.json.bind(res);
  res.json = function(data) {
    if (data && data.ok && !data.tokens) {
      data.tokens = getAccumulatedTokenUsage();
    }
    return _origJson(data);
  };

  const { message, session_id = 'cli-default' } = req.body || {};

  if (!message || typeof message !== 'string' || message.trim().length === 0) {
    return res.status(400).json({ ok: false, error: 'Field "message" wajib diisi dan tidak boleh kosong.' });
  }

  const textInput = message.trim();
  const startTime = Date.now();

  // ── Ping Check ───────────────────────────────────────────
  if (textInput === '__ping__') {
    console.log('[CLI] Ping check received — setup verification');
    return res.status(200).json({ ok: true, reply: 'pong', intent: 'PING', elapsed_ms: 0 });
  }

  console.log(`[CLI] Received message: ${textInput}`);

  // ── Persist User Message ─────────────────────────────────
  await supabaseMemories.saveChatMemory('user', textInput, 'cli').catch(err => {
    console.error(`[CLI] Warning: Failed to save user chat memory: ${err.message}`);
  });

  try {
    // ── Load Conversation Context ────────────────────────────
    const conversationContext = cliSessions.get(session_id) || null;

    // ── Check Pending Interceptors (Deletions, Finance, Calendar, Tasks) ──
    const intercepted = await runPendingInterceptors(textInput, session_id);
    if (intercepted && intercepted.handled) {
      const reply = intercepted.reply || '';
      await supabaseMemories.saveChatMemory('nexa', reply.substring(0, 4000), 'cli').catch(() => {});
      return res.status(200).json({
        ok: true,
        reply,
        intent: intercepted.intent || 'UNKNOWN',
        elapsed_ms: Date.now() - startTime
      });
    }

    // ── Ambiguous Follow-up Context Resolution ────────────────
    const earlyRoutingData = resolveAmbiguousFollowUp(textInput, conversationContext);

    // ── Route ke AI Router ───────────────────────────────────
    const routingData = earlyRoutingData || await aiRouter.routeUserMessage(textInput, {
      conversationContext,
      source: 'cli'
    });

    const intent = String(routingData?.intent || 'UNKNOWN').toUpperCase();

    // ── Intent Clarification Check ────────────────────────────
    const clarificationMsg = !earlyRoutingData ? getClarificationMessage(routingData, textInput) : null;
    if (clarificationMsg) {
      console.log(`[CLI CLARIFICATION] Intent ${intent} needs more info.`);
      await supabaseMemories.saveChatMemory('nexa', clarificationMsg.substring(0, 4000), 'cli').catch(() => {});
      return res.status(200).json({
        ok: true,
        reply: clarificationMsg,
        intent,
        elapsed_ms: Date.now() - startTime
      });
    }

    // ── Execute Dispatched Actions ────────────────────────────
    const actionsToExecute = (Array.isArray(routingData?.actions) && routingData.actions.length > 0)
      ? routingData.actions
      : [{ intent, extracted_data: routingData?.extracted_data || {} }];

    let collectedCliReplies = [];
    for (const act of actionsToExecute) {
      if (act.intent === 'NORMAL_CHAT') continue;
      const actPayload = {
        ...routingData,
        intent: act.intent,
        extracted_data: act.extracted_data || {}
      };
      let actReply = await dispatchCliIntent(act.intent, actPayload, textInput, session_id);
      if (actReply && typeof actReply === 'object') {
        actReply = actReply.text || actReply.message || JSON.stringify(actReply);
      }
      if (actReply && String(actReply).trim().length > 0) {
        collectedCliReplies.push(String(actReply).trim());
      }
    }

    let reply = collectedCliReplies.length > 0
      ? collectedCliReplies.join('\n\n━━━━━━━━━━━━━━━━━━━━\n\n')
      : null;

    // Fallback jika dispatcher tidak menghasilkan balasan
    if (!reply || String(reply).trim().length === 0) {
      reply = routingData?.reply_message || '(N.E.X.A tidak menghasilkan balasan untuk pesan ini.)';
    }

    // Strip HTML tags untuk output terminal CLI
    reply = stripHtml(String(reply));

    const elapsed = Date.now() - startTime;

    // ── Persist Assistant Reply ──────────────────────────────
    await supabaseMemories.saveChatMemory('nexa', String(reply).substring(0, 4000), 'cli').catch(err => {
      console.error(`[CLI] Warning: Failed to save assistant chat memory: ${err.message}`);
    });

    // ── Update Session Context ───────────────────────────────
    cliSessions.set(session_id, {
      intent,
      actions: routingData?.actions || null,
      extractedData: routingData?.extracted_data || null,
      lastUserText: textInput,
      lastAssistantReply: reply,
      askedAt: Date.now()
    });

    // ── [PHASE 6] Log perilaku interaksi user & fakta ─────────
    const behaviorEngine = require('../../domain/Behavior_Engine');
    behaviorEngine.logUserInteraction(intent, textInput, routingData?.mood || 'NEUTRAL').catch(() => {});
    if (routingData?.mood && routingData.mood !== 'NEUTRAL') {
      behaviorEngine.logMood(routingData.mood, textInput).catch(() => {});
    }

    // ── [PHASE 8] Passive Background Learning (Auto-Extraction) 
    // Fakta tentang Tuan Faqih → disimpan ke nexa_user_profile
    // Fakta tentang N.E.X.A    → DIALIHKAN senyap ke nexa_self_model
    if (routingData?.learned_user_facts && Array.isArray(routingData.learned_user_facts) && routingData.learned_user_facts.length > 0) {
      for (const fact of routingData.learned_user_facts) {
        if (typeof fact === 'string' && fact.trim().length > 0) {
          if (isFactAboutNexa(fact)) {
            console.log('[CLI SELF-MODEL] Passive Learning → Self-Model:', fact.substring(0, 80));
            const selfLayer = classifySelfModelLayer(fact);
            aiRouter.deduplicateAndSaveSelfFact(fact, selfLayer, 'PASSIVE_LEARNING', fact).catch(() => {});
          } else {
            console.log('[CLI ROUTER] Passive Learning - User Fact:', fact);
            aiRouter.deduplicateAndSaveFact(fact, 'USER_PROFILE').catch(() => {});
            behaviorEngine.logPassiveLearning(fact, 'USER_PROFILE').catch(() => {});
          }
        }
      }
      invalidatePersonalFactsCache();
    }

    if (routingData?.learned_core_identities && Array.isArray(routingData.learned_core_identities) && routingData.learned_core_identities.length > 0) {
      for (const fact of routingData.learned_core_identities) {
        if (typeof fact === 'string' && fact.trim().length > 0) {
          console.log('[CLI SELF-MODEL] Passive Learning (core):', fact.substring(0, 80));
          const coreLayer = classifySelfModelLayer(fact);
          aiRouter.deduplicateAndSaveSelfFact(fact, coreLayer, 'PASSIVE_LEARNING', fact).catch(() => {});
        }
      }
    }

    // ── [PHASE 7 — M2] Intention Engine (Decision & Intention) ─
    if (textInput && textInput.length >= 10) {
      const intentionEngine = require('../../domain/Intention_Engine');
      intentionEngine.detectAndSaveIntention(textInput, routingData).catch(() => {});
      const DECISION_INTENTS = new Set(['FINANCE', 'DISCIPLINE', 'CALENDAR', 'ADVICE', 'NORMAL_CHAT']);
      if (DECISION_INTENTS.has(intent)) {
        intentionEngine.detectAndSaveDecision(textInput, routingData, routingData?.detected_mood || 'NEUTRAL').catch(() => {});
      }
    }

    // ── Anticipatory Engine ──────────────────────────────────
    const sessionAdviceCount = intent === 'ADVICE'
      ? _trackAdviceSession(session_id)
      : _getAdviceSessionCount(session_id);

    const jakartaHour = new Date(new Date().getTime() + 7 * 60 * 60 * 1000).getUTCHours();

    (async () => {
      try {
        const moodCtx = await anticipatoryEngine.getLatestMoodContext();
        await anticipatoryEngine.runAnticipationPass({
          intent,
          mood:             routingData?.detected_mood || 'NEUTRAL',
          hour:             jakartaHour,
          mood_7d_trend:    moodCtx.mood_7d_trend,
          mood_7d_variance: moodCtx.mood_7d_variance,
          sessionAdviceCount
        });
      } catch (_) {}
    })();

    console.log(`[CLI] Replying with intent: ${intent} (${elapsed}ms)`);
    return res.status(200).json({ ok: true, reply, intent, elapsed_ms: elapsed });

  } catch (error) {
    const elapsed = Date.now() - startTime;
    console.error(`[CLI] Error processing message: ${error.message}`);
    return res.status(500).json({
      ok: false,
      error: `N.E.X.A mengalami gangguan internal: ${error.message}`,
      elapsed_ms: elapsed
    });
  }
}

module.exports = {
  handleCliWebhook,
  handleCliStream,
  pushToCli,
  cliSessions,
  cliPendingCalendar,
  cliPendingConflict,
  cliPendingEmail,
  cliPendingDatabase,
  _stripHtml: stripHtml,
  _trackAdviceSession,
  _getAdviceSessionCount
};
