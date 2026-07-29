// ============================================================
// N.E.X.A — CLI INTERFACE ADAPTER
// Menangani request dari Remote CLI client (laptop manapun)
// via endpoint POST /webhook/cli
//
// Arsitektur: Bagian dari Multi-Interface N.E.X.A
//   [TELEGRAM] → telegram/adapter.js → AI_Router → Supabase
//   [TASKER]   → tasker/adapter.js   → AI_Router → Supabase
//   [CLI]      → cli/adapter.js      → AI_Router → Supabase  ← (ini)
//
// Log yang muncul di HF Container:
//   [CLI] Received message: halo nexa
//   [CLI] Replying with intent: GREETING (881ms)
// ============================================================
'use strict';

const aiRouter = require('../../core/AI_Router');
const supabaseMemories = require('../../infrastructure/Supabase_Memories');
const anticipatoryEngine = require('../../domain/Anticipatory_Engine');

// ── In-Memory Session Store ──────────────────────────────────
// Menyimpan conversationContext per session_id agar CLI punya
// memori percakapan selama server berjalan (per container uptime).
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

/**
 * Endpoint SSE GET /webhook/cli/stream
 */
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

/**
 * Menyebarkan pesan asinkron ke semua klien CLI yang terhubung.
 */
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

/**
 * Handler utama untuk endpoint POST /webhook/cli
 * Dipanggil dari: src/interfaces/webhook.js
 * Dilindungi oleh: security.cliAuth
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
async function handleCliWebhook(req, res) {
  const { message, session_id = 'cli-default' } = req.body || {};

  // ── Input Validation ────────────────────────────────────────
  if (!message || typeof message !== 'string' || message.trim().length === 0) {
    return res.status(400).json({ ok: false, error: 'Field "message" wajib diisi dan tidak boleh kosong.' });
  }

  const textInput = message.trim();
  const startTime = Date.now();

  // ── Ping Check (setup verification dari CLI client) ─────────
  if (textInput === '__ping__') {
    console.log('[CLI] Ping check received — setup verification');
    return res.status(200).json({ ok: true, reply: 'pong', intent: 'PING', elapsed_ms: 0 });
  }

  // Log ke container HF
  console.log(`[CLI] Received message: ${textInput}`);

  // ── Persist User Message to Supabase Chat Memories ──────────
  await supabaseMemories.saveChatMemory('user', textInput, 'cli').catch((err) => {
    console.error(`[CLI] Warning: Failed to save user chat memory: ${err.message}`);
  });

  try {
    // ── Load Conversation Context ───────────────────────────────
    const conversationContext = cliSessions.get(session_id) || null;

    // ── Route ke AI Router (Otak Utama N.E.X.A) ────────────────
    const routingData = await aiRouter.routeUserMessage(textInput, {
      conversationContext,
      source: 'cli'
    });

    const elapsed = Date.now() - startTime;
    const intent = String(routingData?.intent || 'UNKNOWN').toUpperCase();

    // ── Ekstrak Balasan dari routingData ────────────────────────
    let reply = routingData?.reply_message;
    if (reply && typeof reply === 'object') {
      reply = reply.text || reply.message || JSON.stringify(reply);
    }
    if (!reply || String(reply).trim().length === 0) {
      reply = '(N.E.X.A tidak menghasilkan balasan untuk pesan ini.)';
    }

    // ── Persist Assistant Reply to Supabase Chat Memories ───────
    await supabaseMemories.saveChatMemory('nexa', String(reply).substring(0, 4000), 'cli').catch((err) => {
      console.error(`[CLI] Warning: Failed to save assistant chat memory: ${err.message}`);
    });

    // ── Simpan Context untuk Pesan Berikutnya ──────────────────
    cliSessions.set(session_id, {
      intent,
      extractedData: routingData?.extracted_data || null,
      lastUserText: textInput,
      lastAssistantReply: reply,
      askedAt: Date.now()
    });

    // ── Antisipatory Engine / Overthinking Tracker ──────────────
    const sessionAdviceCount = intent === 'ADVICE'
      ? _trackAdviceSession(session_id)
      : _getAdviceSessionCount(session_id);

    const jakartaHour = new Date(
      new Date().toLocaleString('en-US', { timeZone: 'Asia/Jakarta' })
    ).getHours();

    (async () => {
      try {
        const moodCtx = await anticipatoryEngine.getLatestMoodContext();
        await anticipatoryEngine.runAnticipationPass({
          intent:            intent,
          mood:              routingData?.detected_mood || 'NEUTRAL',
          hour:              jakartaHour,
          mood_7d_trend:     moodCtx.mood_7d_trend,
          mood_7d_variance:  moodCtx.mood_7d_variance,
          sessionAdviceCount
        });
      } catch (_) {}
    })();

    console.log(`[CLI] Replying with intent: ${intent} (${elapsed}ms)`);

    return res.status(200).json({
      ok: true,
      reply,
      intent,
      elapsed_ms: elapsed
    });

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

module.exports = { handleCliWebhook, handleCliStream, pushToCli };
