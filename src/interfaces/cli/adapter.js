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

// ── In-Memory Session Store ──────────────────────────────────
// Menyimpan conversationContext per session_id agar CLI punya
// memori percakapan selama server berjalan (per container uptime).
const cliSessions = new Map();

/**
 * Handler utama untuk endpoint POST /webhook/cli
 * Dipanggil dari: src/interfaces/webhook.js
 * Dilindungi oleh: security.webhookAuth (Bearer + NEXA_GODMODE_SECRET)
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
  // Saat pertama kali setup, CLI mengirim __ping__ untuk verifikasi koneksi.
  // Langsung return tanpa memanggil AI Router agar tidak buang token.
  if (textInput === '__ping__') {
    console.log('[CLI] Ping check received — setup verification');
    return res.status(200).json({ ok: true, reply: 'pong', intent: 'PING', elapsed_ms: 0 });
  }

  // Log ke container HF — inilah yang membuat CLI setara dengan Telegram
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

    // ── Ekstrak Balasan dari routingData ────────────────────────
    let reply = routingData?.reply_message;

    if (reply && typeof reply === 'object') {
      reply = reply.text || reply.message || JSON.stringify(reply);
    }

    if (!reply || String(reply).trim().length === 0) {
      reply = '(N.E.X.A tidak menghasilkan balasan untuk pesan ini.)';
    }

    const intent = String(routingData?.intent || 'UNKNOWN');

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

module.exports = { handleCliWebhook };
