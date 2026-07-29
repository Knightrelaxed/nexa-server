'use strict';

const aiRouter        = require('../../core/AI_Router');
const supabaseMemories = require('../../infrastructure/Supabase_Memories');
const anticipatoryEngine = require('../../domain/Anticipatory_Engine');

// ── In-Memory Session Store ──────────────────────────────────
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

// ── Intent Domain Dispatcher ─────────────────────────────────
// Menjalankan logika domain spesifik berdasarkan intent dari AI Router.
// Mirip dengan switch-case di telegram/adapter.js.
async function _dispatchIntent(intent, routingData, textInput) {
  const data = routingData?.extracted_data || {};

  switch (intent) {

    // ── Web Search ──────────────────────────────────────────────
    case 'WEB_SEARCH': {
      const webSearch = require('../../infrastructure/Web_Search');
      const query      = data.query || textInput;
      const searchType = data.type  || 'search';
      console.log(`[CLI-SEARCH] Searching web: "${query}" [type: ${searchType}]`);
      const searchResult = await webSearch.searchWeb(query, searchType);
      const prompt = `Sebagai N.E.X.A, asisten AI pribadi Tuan Faqih Hidayatulloh, Anda baru saja melakukan penelusuran web.\n\nPertanyaan Tuan Faqih: "${textInput}"\n\nHasil Penelusuran Web:\n${searchResult}\n\nTugas: Jawablah secara natural, cerdas, dan luwes berdasarkan hasil penelusuran. Berikan kesimpulan dan opini singkat yang relevan. JANGAN sekadar menyalin ulang hasil. Balas dalam Bahasa Indonesia.`;
      return await aiRouter.callAI(prompt);
    }

    // ── Task Management ─────────────────────────────────────────
    case 'TASK_CREATE': {
      const taskManager = require('../../domain/Task_Manager');
      const result = await taskManager.createTask({
        title:   data.title   || data.task || textInput,
        dueDate: data.due_date,
        listId:  data.list_id,
        notes:   data.notes,
      }).catch(e => ({ success: false, error: e.message }));
      return result.success
        ? `✅ Tugas berhasil dibuat: **${data.title || 'Tugas baru'}**${data.due_date ? ` (Tenggat: ${data.due_date})` : ''}`
        : `❌ Gagal membuat tugas: ${result.error}`;
    }

    case 'TASK_COMPLETE': {
      const taskManager = require('../../domain/Task_Manager');
      const result = await taskManager.completeTask(data.task_id || data.title)
        .catch(e => ({ success: false, error: e.message }));
      return result.success
        ? `✅ Tugas **"${data.title || data.task_id}"** berhasil ditandai selesai.`
        : `❌ Gagal menyelesaikan tugas: ${result.error}`;
    }

    case 'TASK_LIST': {
      const taskManager = require('../../domain/Task_Manager');
      const tasks = await taskManager.listTasks(data.list_id).catch(() => []);
      if (!tasks || tasks.length === 0) return '📋 Tidak ada tugas aktif saat ini.';
      const lines = tasks.slice(0, 15).map((t, i) => `${i + 1}. ${t.title}${t.due ? ` — ${t.due}` : ''}`);
      return `📋 **Daftar Tugas Aktif:**\n\n${lines.join('\n')}`;
    }

    // ── Calendar ────────────────────────────────────────────────
    case 'CALENDAR_CREATE': {
      const googleWorkspace = require('../../infrastructure/Google_Workspace');
      const { getClients } = googleWorkspace;
      const { calendar } = await getClients();
      const result = await googleWorkspace.createCalendarEvent(calendar, {
        summary:    data.summary   || data.title || 'Acara Baru',
        start:      data.start,
        end:        data.end,
        description: data.description,
        location:   data.location,
      }).catch(e => ({ success: false, error: e.message }));
      return result.success
        ? `📅 Acara **"${data.summary || data.title}"** berhasil dibuat di kalender.`
        : `❌ Gagal membuat acara: ${result.error}`;
    }

    case 'CALENDAR_READ': {
      const googleWorkspace = require('../../infrastructure/Google_Workspace');
      const { getClients } = googleWorkspace;
      const { calendar } = await getClients();
      const events = await googleWorkspace.getUpcomingEvents(calendar, data.days || 7)
        .catch(() => []);
      if (!events || events.length === 0) return '📅 Tidak ada acara mendatang dalam 7 hari ke depan.';
      const lines = events.slice(0, 10).map(e => `• ${e.summary} — ${e.start}`);
      return `📅 **Agenda Mendatang:**\n\n${lines.join('\n')}`;
    }

    // ── Finance ─────────────────────────────────────────────────
    case 'FINANCE': {
      const financeEngine = require('../../domain/Finance_Engine');
      const action = data.action || 'RECORD';

      if (action === 'SUMMARY' || action === 'BALANCE') {
        const summary = await financeEngine.getFinanceSummary().catch(e => ({ error: e.message }));
        if (summary.error) return `❌ Gagal mengambil data keuangan: ${summary.error}`;
        return `💰 **Ringkasan Keuangan:**\n\nSaldo: Rp ${(summary.balance || 0).toLocaleString('id-ID')}\nPemasukan: Rp ${(summary.income || 0).toLocaleString('id-ID')}\nPengeluaran: Rp ${(summary.expense || 0).toLocaleString('id-ID')}`;
      }

      // Default: record transaksi
      const result = await financeEngine.recordTransaction({
        amount:      data.amount || data.nominal,
        type:        data.type   || 'EXPENSE',
        category:    data.category,
        merchant:    data.merchant || data.description,
        description: data.description,
      }).catch(e => ({ success: false, error: e.message }));
      return result.success
        ? `✅ Transaksi Rp ${Number(data.amount || 0).toLocaleString('id-ID')} (${data.category || 'Umum'}) berhasil dicatat.`
        : `❌ Gagal mencatat transaksi: ${result.error}`;
    }

    // ── 2nd Brain ────────────────────────────────────────────────
    case '2ND_BRAIN': {
      const googleWorkspace = require('../../infrastructure/Google_Workspace');
      const brainAction = (data.action || 'APPEND').toUpperCase();

      if (brainAction === 'READ') {
        const docContent = await googleWorkspace.readIdeaDoc().catch(e => `Error: ${e.message}`);
        return `📖 **Isi Arsip 2nd Brain:**\n\n${String(docContent).substring(0, 3000)}`;
      }
      // APPEND
      if (data.content) {
        await googleWorkspace.appendToIdeaDoc(data.content).catch(() => {});
        await supabaseMemories.saveIdea({ content: data.content, type: data.fact_type || 'IDEA' }).catch(() => {});
        return `📝 Ide berhasil disimpan ke 2nd Brain: "${data.content.substring(0, 80)}..."`;
      }
      return routingData?.reply_message || '📝 Instruksi 2nd Brain tidak lengkap.';
    }

    // ── Diagnose System ──────────────────────────────────────────
    case 'DIAGNOSE_SYSTEM': {
      // AI Router sudah menyiapkan balasan diagnosa — langsung pakai
      return routingData?.reply_message || '🔍 Tidak ada data diagnostik tersedia saat ini.';
    }

    // ── Learn Fact / Core Identity ───────────────────────────────
    case 'LEARN_FACT':
    case 'CORE_IDENTITY': {
      // Simpan fakta & kembalikan balasan dari router
      return routingData?.reply_message || '🧠 Fakta baru telah dicatat.';
    }

    // ── Normal Chat & semua intent lainnya ──────────────────────
    default:
      return routingData?.reply_message || null;
  }
}

/**
 * Handler utama untuk endpoint POST /webhook/cli
 */
async function handleCliWebhook(req, res) {
  const { message, session_id = 'cli-default' } = req.body || {};

  if (!message || typeof message !== 'string' || message.trim().length === 0) {
    return res.status(400).json({ ok: false, error: 'Field "message" wajib diisi dan tidak boleh kosong.' });
  }

  const textInput = message.trim();
  const startTime = Date.now();

  if (textInput === '__ping__') {
    console.log('[CLI] Ping check received — setup verification');
    return res.status(200).json({ ok: true, reply: 'pong', intent: 'PING', elapsed_ms: 0 });
  }

  console.log(`[CLI] Received message: ${textInput}`);

  await supabaseMemories.saveChatMemory('user', textInput, 'cli').catch((err) => {
    console.error(`[CLI] Warning: Failed to save user chat memory: ${err.message}`);
  });

  try {
    const conversationContext = cliSessions.get(session_id) || null;

    const routingData = await aiRouter.routeUserMessage(textInput, {
      conversationContext,
      source: 'cli'
    });

    const intent = String(routingData?.intent || 'UNKNOWN').toUpperCase();

    // ── Intent Domain Dispatcher ──────────────────────────────
    let reply = await _dispatchIntent(intent, routingData, textInput);

    // Fallback jika dispatcher tidak menghasilkan balasan
    if (reply && typeof reply === 'object') {
      reply = reply.text || reply.message || JSON.stringify(reply);
    }
    if (!reply || String(reply).trim().length === 0) {
      reply = routingData?.reply_message || '(N.E.X.A tidak menghasilkan balasan untuk pesan ini.)';
    }

    const elapsed = Date.now() - startTime;

    await supabaseMemories.saveChatMemory('nexa', String(reply).substring(0, 4000), 'cli').catch((err) => {
      console.error(`[CLI] Warning: Failed to save assistant chat memory: ${err.message}`);
    });

    cliSessions.set(session_id, {
      intent,
      extractedData: routingData?.extracted_data || null,
      lastUserText: textInput,
      lastAssistantReply: reply,
      askedAt: Date.now()
    });

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

module.exports = { handleCliWebhook, handleCliStream, pushToCli };



