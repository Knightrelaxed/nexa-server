'use strict';
/**
 * ============================================================
 * N.E.X.A Server - Native Mobile Chat Handler (/ws JSON)
 * Implements FR-CHAT-04, 05, 08, 09, 10, 12, 19:
 * - JSON text frames over Connection A (/ws) -> zero collision with Live Voice PCM
 * - Idempotent client_msg_id deduplication (reconnect retries never re-run LLM/tools)
 * - Sequential chunking (seq = 1..N) + 10-minute replay buffer for CHAT_RESUME
 * - Reuses AI_Router + common domain_dispatcher.js and persists history as platform='mobile'
 * - intent_hint from client is treated as UI hint only, never a security gate (FR-CHAT-19)
 * ============================================================
 */

const REPLAY_TTL_MS = 10 * 60 * 1000; // 10 minutes retention for CHAT_RESUME
const CONTEXT_TTL_MS = 15 * 60 * 1000; // 15 minutes TTL so Reflex Fast-Path & Domain Gating stay active (R-03)
const MAX_REPLAY_ENTRIES = 100;
const MAX_CHAT_CONTENT_LEN = 16 * 1024; // 16 KiB max text input (H-10)
const MAX_CLIENT_MSG_ID_LEN = 128;
const TURN_TIMEOUT_MS = 120 * 1000; // 120s hard ceiling per turn (L-02)
const DEFAULT_CHUNK_SIZE = 64;
const MIN_VOICE_AUDIO_BYTES = 128;
const MAX_VOICE_AUDIO_BYTES = 1500 * 1024; // 1.5 MB raw ceiling (comfortably fits 3-min 24kbps OGG/Opus)
const MAX_VOICE_DURATION_MS = 185 * 1000; // 3 min + 5s grace margin

const BASE64_PATTERN = /^[A-Za-z0-9+/]+={0,2}$/;

function decodeStrictBase64(raw) {
  const cleaned = String(raw || '').replace(/\s+/g, '');
  if (!cleaned || cleaned.length % 4 !== 0 || !BASE64_PATTERN.test(cleaned)) {
    return null;
  }
  return Buffer.from(cleaned, 'base64');
}

function validateVoiceAudioBuffer(audioBuf, mimeType) {
  if (!Buffer.isBuffer(audioBuf) || audioBuf.length < MIN_VOICE_AUDIO_BYTES) {
    return { ok: false, error: 'Audio suara terlalu singkat atau rusak.' };
  }
  if (audioBuf.length > MAX_VOICE_AUDIO_BYTES) {
    return { ok: false, error: 'Ukuran pesan suara melebihi batas maksimal 1.5 MB.' };
  }
  const cleanMime = String(mimeType || 'audio/ogg').split(';')[0].trim().toLowerCase();
  if (cleanMime === 'audio/ogg') {
    // OGG container always begins with ASCII "OggS"
    if (audioBuf.length < 4 || audioBuf.subarray(0, 4).toString('ascii') !== 'OggS') {
      return { ok: false, error: 'Format audio OGG tidak valid.' };
    }
    return { ok: true, ext: 'ogg', mimeType: 'audio/ogg' };
  }
  if (cleanMime === 'audio/mp4' || cleanMime === 'audio/m4a') {
    // ISO BMFF / MP4 container has ASCII "ftyp" at bytes 4..8
    if (audioBuf.length < 8 || audioBuf.subarray(4, 8).toString('ascii') !== 'ftyp') {
      return { ok: false, error: 'Format audio MP4/M4A tidak valid.' };
    }
    return { ok: true, ext: 'm4a', mimeType: 'audio/mp4' };
  }
  if (cleanMime === 'audio/webm') {
    // EBML / WebM container begins with 0x1A 0x45 0xDF 0xA3
    if (
      audioBuf.length < 4 ||
      audioBuf[0] !== 0x1a ||
      audioBuf[1] !== 0x45 ||
      audioBuf[2] !== 0xdf ||
      audioBuf[3] !== 0xa3
    ) {
      return { ok: false, error: 'Format audio WebM tidak valid.' };
    }
    return { ok: true, ext: 'webm', mimeType: 'audio/webm' };
  }
  if (cleanMime === 'audio/wav') {
    // RIFF/WAVE header: "RIFF" at 0..4 and "WAVE" at 8..12
    if (
      audioBuf.length < 12 ||
      audioBuf.subarray(0, 4).toString('ascii') !== 'RIFF' ||
      audioBuf.subarray(8, 12).toString('ascii') !== 'WAVE'
    ) {
      return { ok: false, error: 'Format audio WAV tidak valid.' };
    }
    return { ok: true, ext: 'wav', mimeType: 'audio/wav' };
  }
  return { ok: false, error: `Format audio tidak didukung: ${cleanMime}` };
}

function stripHtmlForMobile(text) {
  return String(text || '')
    // F-06: Preserve Google Maps, Google Meet, and other <a href="..."> URLs before stripping HTML tags
    .replace(/<a\s+[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, (_, url, label) => {
      const cleanLabel = String(label || '').replace(/<[^>]+>/g, '').trim();
      const cleanUrl = String(url || '').trim();
      if (!cleanUrl) return cleanLabel;
      if (!cleanLabel || cleanLabel === cleanUrl) return cleanUrl;
      return `${cleanLabel} (${cleanUrl})`;
    })
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/?(?:b|strong|i|em|u|s|del|code|pre|a|span|div|p)[^>]*>/gi, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&amp;/g, '&')
    .trim();
}

/**
 * Split a reply string into natural word/newline-bounded chunks for smooth UI batching
 * and deterministic seq-based CHAT_RESUME recovery.
 * @param {string} text
 * @param {number} [maxChunkSize]
 * @returns {string[]}
 */
function splitIntoStreamChunks(text, maxChunkSize = DEFAULT_CHUNK_SIZE) {
  const clean = String(text || '');
  if (!clean) return [];
  const chunks = [];
  let pos = 0;

  while (pos < clean.length) {
    let end = Math.min(pos + maxChunkSize, clean.length);
    if (end < clean.length) {
      // Prefer breaking on whitespace or newline within the second half of the window
      const slice = clean.slice(pos, end);
      const lastBreak = Math.max(slice.lastIndexOf('\n'), slice.lastIndexOf(' '));
      if (lastBreak > Math.floor(maxChunkSize * 0.4)) {
        end = pos + lastBreak + 1;
      }
    }
    chunks.push(clean.slice(pos, end));
    pos = end;
  }
  return chunks;
}

function safeSend(ws, obj) {
  if (!ws || typeof ws.send !== 'function') return false;
  if (ws.readyState !== undefined && ws.readyState !== 1) return false;
  try {
    ws.send(JSON.stringify(obj));
    return true;
  } catch (err) {
    console.warn('[BRIDGE-CHAT] Failed sending WS chat frame:', err.message);
    return false;
  }
}

function createMobileChatHandler(deps = {}) {
  const getAiRouter = () => deps.aiRouter || require('../../../core/AI_Router');
  const getDomainDispatcher = () => deps.executeDomainIntent || require('../../common/domain_dispatcher').executeDomainIntent;
  const getSaveChatMemory = () => deps.saveChatMemory || require('../../../infrastructure/Supabase_Memories').saveChatMemory;
  const getLatestTelemetry = () => deps.getLatestTelemetry || require('./client').getLatestTelemetry;
  const getFinanceStepUpService = () => deps.financeStepUpService || require('../../../core/auth/finance_stepup_service').getFinanceStepUpService();
  const getVoiceEngine = () => deps.voiceEngine || require('../../../core/Voice_Engine');
  const nowFn = deps.nowFn || (() => Date.now());
  const chunkSize = deps.chunkSize || DEFAULT_CHUNK_SIZE;
  const chunkDelayMs = deps.chunkDelayMs !== undefined ? deps.chunkDelayMs : 12;

  // client_msg_id -> { state: 'RUNNING'|'FINAL'|'ABORTED', chunks: [{seq, chunk}], intent, error, updatedAt, aborted, abortController, pendingFrame }
  const replayStore = new Map();
  let lastConversationContext = null;
  let activeVoiceInFlight = 0;
  let sessionTurnQueue = Promise.resolve();
  const sessionKey = 'mobile-primary';
  const pendingEmail = new Map();
  const pendingCalendar = new Map();
  const pendingDatabase = new Map();
  const pendingVault = new Map();
  let pendingConflictEvent = null;
  let pendingProactiveTasks = null;
  const activeCardIds = {
    conflict: null,
    financeDelete: null,
    taskConfirm: null,
    proactiveTasks: null
  };

  try {
    const cardHandler = deps.cardHandler || require('./card_handler');
    if (typeof cardHandler.registerSessionHooks === 'function') {
      cardHandler.registerSessionHooks({
        clearPendingConflict: () => {
          pendingConflictEvent = null;
          activeCardIds.conflict = null;
        },
        clearPendingProactiveTasks: () => {
          pendingProactiveTasks = null;
          activeCardIds.proactiveTasks = null;
        }
      });
    }
  } catch (_) {}

  function emitCardResolvedFromText(ws, slot, badge, detail) {
    const cid = activeCardIds[slot];
    if (!cid) return;
    activeCardIds[slot] = null;
    safeSend(ws, {
      type: 'CARD_UPDATE',
      card_id: cid,
      status: 'RESOLVED',
      resolved_badge: badge,
      resolved_detail: String(detail || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim().slice(0, 160),
      ts: nowFn()
    });
  }

  function getFreshMapEntry(map) {
    const entry = map.get(sessionKey);
    if (!entry) return null;
    const ts = entry.askedAt || entry.updatedAt || entry.createdAt || 0;
    if (ts > 0 && (nowFn() - ts) > CONTEXT_TTL_MS) {
      map.delete(sessionKey);
      return null;
    }
    return entry;
  }

  function getFreshConversationContext() {
    if (!lastConversationContext) return null;
    const ts = lastConversationContext.askedAt || lastConversationContext.updatedAt || 0;
    if (ts > 0 && (nowFn() - ts) > CONTEXT_TTL_MS) {
      lastConversationContext = null;
      return null;
    }
    return lastConversationContext;
  }

  function rebindClientWs(newWs) {
    if (!newWs) return;
    for (const entry of replayStore.values()) {
      if (entry.state === 'RUNNING') {
        entry.ws = newWs;
      }
    }
  }

  const sweepTimer = setInterval(() => {
    const now = nowFn();
    for (const [id, entry] of replayStore.entries()) {
      // V-01 / H-10: Never evict RUNNING turns or entries holding an unexpired Finance Step-Up frame
      if (entry.state === 'RUNNING') continue;
      if (entry.pendingFrame && entry.pendingFrame.exp > now) continue;
      if (now - entry.updatedAt > REPLAY_TTL_MS) {
        replayStore.delete(id);
      }
    }
  }, 60_000);
  if (typeof sweepTimer.unref === 'function') {
    sweepTimer.unref();
  }

  function pruneReplayCapacity() {
    if (replayStore.size < MAX_REPLAY_ENTRIES) return;
    const now = nowFn();
    for (const [key, entry] of replayStore.entries()) {
      if (replayStore.size < MAX_REPLAY_ENTRIES) break;
      if (entry.state === 'RUNNING') continue;
      if (entry.pendingFrame && entry.pendingFrame.exp > now) continue;
      replayStore.delete(key);
    }
  }

  function enqueueSessionTurn(fn) {
    const next = sessionTurnQueue.then(fn, fn);
    sessionTurnQueue = next.catch(() => {});
    return next;
  }

  function sanitizeClientError(err, fallbackMsg) {
    try {
      const { redactSecrets } = require('../../../utils/logger');
      const raw = redactSecrets(String(err && err.message ? err.message : ''));
      if (!raw || /ENOENT|ENOSPC|EACCES|ECONNREFUSED|All voice transcription tiers|\/tmp\//i.test(raw)) {
        return fallbackMsg;
      }
      return fallbackMsg;
    } catch (_) {
      return fallbackMsg;
    }
  }

  function replayFromSeq(ws, clientMsgId, entry, lastSeq) {
    for (const item of entry.chunks) {
      if (item.seq > lastSeq) {
        safeSend(ws, {
          type: 'CHAT_CHUNK',
          client_msg_id: clientMsgId,
          seq: item.seq,
          status: 'STREAMING_CHUNK',
          chunk: item.chunk
        });
      }
    }
    if (entry.state === 'FINAL') {
      const finalFrame = {
        type: 'CHAT_CHUNK',
        client_msg_id: clientMsgId,
        seq: entry.finalSeq,
        status: 'STREAM_FINAL',
        chunk: '',
        intent: entry.intent || 'NORMAL_CHAT'
      };
      if (entry.card && typeof entry.card === 'object') {
        finalFrame.card = entry.card;
      }
      safeSend(ws, finalFrame);
    } else if (entry.state === 'ABORTED') {
      safeSend(ws, {
        type: 'CHAT_CHUNK',
        client_msg_id: clientMsgId,
        seq: entry.finalSeq,
        status: 'ERROR_ABORT',
        chunk: '',
        error: entry.error || 'Stream dibatalkan.'
      });
    }

    // N-M4: Replay unexpired Finance Step-Up pending frame on reconnect with recalculated ttl_sec
    if (entry.pendingFrame && entry.pendingFrame.exp > nowFn()) {
      const remainingSec = Math.max(1, Math.ceil((entry.pendingFrame.exp - nowFn()) / 1000));
      safeSend(ws, {
        ...entry.pendingFrame,
        ttl_sec: remainingSec
      });
    }
  }

  function extractSanitizedReplyContext(payload) {
    const replyTo = payload && payload.reply_to && typeof payload.reply_to === 'object'
      ? payload.reply_to
      : null;
    if (!replyTo) return null;
    const preview = String(replyTo.preview || '')
      .replace(/[\u0000-\u001f\u007f]/g, ' ')
      .replace(/[\[\]"]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 360);
    if (!preview) return null;
    const role = String(replyTo.role || '').toLowerCase() === 'assistant' ? 'assistant' : 'user';
    const messageId = String(replyTo.message_id || '').trim().slice(0, 128);
    return { messageId, role, preview };
  }

  function buildReplyContextPrompt(content, replyCtx) {
    if (!replyCtx) return content;
    const senderLabel = replyCtx.role === 'assistant' ? 'N.E.X.A' : 'Tuan';
    return `[Membalas pesan ${senderLabel}: "${replyCtx.preview}"]\n${content}`;
  }

  async function tryHandleDirectSlashCommand(rawText) {
    const trimmed = String(rawText || '').trim();
    if (!trimmed.startsWith('/')) return null;

    // 1. /search <query>
    if (/^\/search\b/i.test(trimmed)) {
      const query = trimmed.replace(/^\/search\s*/i, '').trim();
      if (!query) {
        return {
          intent: 'COMMAND_SEARCH',
          reply: 'Format: `/search <kata kunci>`\nContoh: `/search VPS` atau `/search anggaran kopi`'
        };
      }
      const supabaseMemories = deps.supabaseMemories || require('../../../infrastructure/Supabase_Memories');
      const results = await supabaseMemories.searchPastChats(query, 5);
      if (!results || results.length === 0) {
        return {
          intent: 'COMMAND_SEARCH',
          reply: `Tidak ditemukan riwayat percakapan untuk kata kunci: "${query}".`
        };
      }
      const lines = results.map(r => {
        const dt = new Date(r.created_at).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' });
        const roleLabel = (r.role || 'user').toLowerCase() === 'user' ? 'Tuan' : 'N.E.X.A';
        const snippet = String(r.content || '').substring(0, 160);
        return `- **[${dt} WIB] ${roleLabel}:**\n  "${snippet}${String(r.content || '').length > 160 ? '...' : ''}"`;
      });
      return {
        intent: 'COMMAND_SEARCH',
        reply: `**Hasil Pencarian Riwayat: "${query}"**\n\n${lines.join('\n\n')}`
      };
    }

    // 2. /playbook [intent | undo <intent>]
    if (/^\/playbook\b/i.test(trimmed)) {
      const playbookEngine = deps.playbookEngine || require('../../../domain/Playbook_Engine');
      const parts = trimmed.split(/\s+/);
      let htmlReply = '';
      if (parts.length === 1) {
        htmlReply = await playbookEngine.formatPlaybooksSummary();
      } else if (parts[1].toLowerCase() === 'undo') {
        const targetIntent = parts[2] || '';
        if (!targetIntent) {
          htmlReply = 'Format salah. Gunakan: `/playbook undo <INTENT>` (contoh: `/playbook undo EMAIL`)';
        } else {
          const undoRes = await playbookEngine.undoPlaybook(targetIntent);
          htmlReply = undoRes && undoRes.message ? undoRes.message : 'Playbook diperbarui.';
        }
      } else {
        htmlReply = await playbookEngine.formatPlaybookDetail(parts[1]);
      }
      return { intent: 'COMMAND_PLAYBOOK', reply: stripHtmlForMobile(htmlReply) };
    }

    // 3. /capabilities (/fitur, /bisaapa, /kemampuan)
    if (/^(\/capabilities|\/fitur|\/bisaapa|\/kemampuan)\b/i.test(trimmed)) {
      const { CAPABILITIES_REGISTRY } = require('../../../config/capabilities_registry');
      const { VERSION } = require('../../../config/version');
      const lines = [`**KAPABILITAS RESMI N.E.X.A v${VERSION}**`, ''];
      const domains = {};
      for (const cap of CAPABILITIES_REGISTRY) {
        if (!domains[cap.domain]) domains[cap.domain] = [];
        domains[cap.domain].push(cap);
      }
      for (const [dom, list] of Object.entries(domains)) {
        lines.push(`**${dom}:**`);
        for (const item of list) {
          lines.push(`- **${item.title}**: ${item.summary}`);
        }
        lines.push('');
      }
      lines.push('Tuan dapat menanyakan detail teknis fitur apa pun secara langsung.');
      return { intent: 'COMMAND_CAPABILITIES', reply: lines.join('\n') };
    }

    // 4. /trigger_weekly (/force_weekly, /weekly_inference)
    if (/^(\/trigger_weekly|\/force_weekly|\/weekly_inference)\b/i.test(trimmed)) {
      const inferenceEngine = deps.inferenceEngine || require('../../../domain/Inference_Engine');
      const { notifyProactive } = require('../../../core/Notifier');
      setImmediate(async () => {
        try {
          const result = await inferenceEngine.runWeeklyIdentityInference();
          const summaryMsg = (result && result.success && result.saved > 0)
            ? [
                `Weekly Identity Inference Selesai (Manual Trigger)`,
                ``,
                `Hipotesis dianalisis: ${result.totalHypotheses}`,
                `Proposal baru tersimpan: ${result.saved}`,
                `Dikirim untuk review: ${result.pendingSent}`,
                `Di-stage (bukti kurang): ${result.staged}`,
                `Diabaikan: ${result.skipped}`
              ].join('\n')
            : 'Weekly Identity Inference selesai. Tidak ada hipotesis baru minggu ini; model identitas stabil.';
          await notifyProactive({
            kind: 'SCHEDULED_WEEKLY_INFERENCE',
            priority: 'P1',
            isScheduled: true,
            bypassQuietHours: true,
            text: summaryMsg
          });
        } catch (err) {
          console.error('[BRIDGE-CMD] Error running weekly inference:', err.message);
        }
      });
      return {
        intent: 'COMMAND_WEEKLY_INFERENCE',
        reply: 'Memulai Weekly Cognitive Pass sekarang. Hasil analisis dan kartu proposal akan dikirim otomatis ke chat ini begitu selesai.'
      };
    }

    // 5. /briefing (/morning, /evening) -> Rich Executive Briefing Card + full briefing narrative
    if (/^(\/briefing|\/morning|\/evening)\b/i.test(trimmed)) {
      const intelligenceBrief = deps.intelligenceBrief || require('../../../domain/Intelligence_Brief');
      const cardHandlerMod = deps.cardHandler || require('./card_handler');
      const isEvening = /^\/evening\b/i.test(trimmed) || /\bevening\b|\bmalam\b/i.test(trimmed);
      if (isEvening) {
        const res = typeof intelligenceBrief.generateEveningBriefingStructured === 'function'
          ? await intelligenceBrief.generateEveningBriefingStructured()
          : { text: await intelligenceBrief.generateEveningBriefing(), summary: {} };
        const card = cardHandlerMod.buildBriefingCard('EVENING', res.summary || {});
        return {
          intent: 'COMMAND_BRIEFING',
          reply: stripHtmlForMobile(res.text || 'Refleksi malam siap, Tuan.'),
          card
        };
      }
      const res = typeof intelligenceBrief.generateMorningBriefingStructured === 'function'
        ? await intelligenceBrief.generateMorningBriefingStructured()
        : { text: await intelligenceBrief.generateMorningBriefing(), summary: {} };
      const card = cardHandlerMod.buildBriefingCard('MORNING', res.summary || {});
      return {
        intent: 'COMMAND_BRIEFING',
        reply: stripHtmlForMobile(res.text || 'Executive Morning Briefing siap, Tuan.'),
        card
      };
    }

    // 6. /budget [weekly|monthly] (/anggaran, /rekap) -> Rich Budget Recap Card with progress bars
    if (/^(\/budget|\/anggaran|\/rekap)\b/i.test(trimmed)) {
      const budgetEngine = deps.budgetEngine || require('../../../domain/Budget_Engine');
      const cardHandlerMod = deps.cardHandler || require('./card_handler');
      const wantWeekly = /\b(week|weekly|minggu|mingguan)\b/i.test(trimmed);
      const period = wantWeekly ? 'weekly' : 'monthly';
      const structured = typeof budgetEngine.generatePeriodicRecapStructured === 'function'
        ? await budgetEngine.generatePeriodicRecapStructured(period)
        : null;
      if (!structured) {
        const fallbackPeriod = wantWeekly ? 'monthly' : 'weekly';
        const alt = typeof budgetEngine.generatePeriodicRecapStructured === 'function'
          ? await budgetEngine.generatePeriodicRecapStructured(fallbackPeriod)
          : null;
        if (!alt) {
          return {
            intent: 'COMMAND_BUDGET',
            reply: 'Belum ada anggaran aktif yang diatur di sistem saat ini, Tuan.'
          };
        }
        return {
          intent: 'COMMAND_BUDGET',
          reply: stripHtmlForMobile(alt.text),
          card: cardHandlerMod.buildBudgetRecapCard(alt)
        };
      }
      return {
        intent: 'COMMAND_BUDGET',
        reply: stripHtmlForMobile(structured.text),
        card: cardHandlerMod.buildBudgetRecapCard(structured)
      };
    }

    // 7. /vault -> Latest DRAFT (or latest Vault item) as native editable VAULT_METADATA card
    if (/^\/vault\b/i.test(trimmed)) {
      const memoryVault = deps.memoryVault || require('../../../infrastructure/memories/Memory_Vault');
      const cardHandlerMod = deps.cardHandler || require('./card_handler');
      const items = typeof memoryVault.getLatestVaultItems === 'function'
        ? await memoryVault.getLatestVaultItems(8)
        : [];
      if (!items || items.length === 0) {
        return {
          intent: 'COMMAND_VAULT',
          reply: 'Belum ada dokumen di Arsip Vault saat ini, Tuan.'
        };
      }
      const target = items.find(i => String(i.status || '').toUpperCase() === 'DRAFT') || items[0];
      const card = cardHandlerMod.buildVaultMetadataCard(target);
      const isDraft = String(target.status || '').toUpperCase() !== 'CONFIRMED';
      return {
        intent: 'COMMAND_VAULT',
        reply: isDraft
          ? `Draft dokumen Vault menunggu konfirmasi. Tuan bisa langsung tap Edit Fields atau Confirm & Save pada kartu di bawah.`
          : `Menampilkan arsip Vault terbaru (${card.title}). Tuan dapat meninjau atau menyunting field metadata langsung lewat kartu di bawah.`,
        card
      };
    }

    return null;
  }

  async function executeAndStreamChat(clientMsgId, entry, content, payload) {
    const replyCtx = extractSanitizedReplyContext(payload);
    const routedInput = buildReplyContextPrompt(content, replyCtx);

    // N-01: Record user engagement on Mobile Chat so Notifier closed-loop engagement stays accurate
    try {
      const { getNotifier } = require('../../../core/Notifier');
      Promise.resolve(getNotifier().markEngaged('REPLY')).catch(() => {});
    } catch (_) {}

    const saveChatMemory = getSaveChatMemory();
    Promise.resolve(saveChatMemory('user', content, 'mobile')).catch(err => {
      console.warn('[BRIDGE-CHAT] Failed saving user chat memory:', err.message);
    });

    // Direct Slash Commands (/briefing, /budget, /vault, /search, /playbook, /capabilities, /trigger_weekly)
    try {
      const slashRes = await tryHandleDirectSlashCommand(content);
      if (slashRes) {
        await streamFinalReply(clientMsgId, entry, content, slashRes.reply, slashRes.intent, saveChatMemory, slashRes.card || null);
        return;
      }
    } catch (cmdErr) {
      console.warn('[BRIDGE-CHAT] Slash command error:', cmdErr.message);
    }

    const telemetry = payload.device_context || (typeof getLatestTelemetry() === 'function' ? getLatestTelemetry()() : null);
    if (telemetry && typeof telemetry === 'object') {
      try {
        const presenceModel = require('../../../domain/Presence_Model');
        if (typeof presenceModel.updateFromMobileTelemetry === 'function') {
          presenceModel.updateFromMobileTelemetry(telemetry);
        }
      } catch (_) {}
    }

    // Phase 2: Full conversational interceptor parity (text/voice fallback alongside native Quick Action Chips)
    const interceptors = deps.interceptors || require('../../telegram/interceptors');
    const cardHandler = deps.cardHandler || require('./card_handler');
    const financeEngine = deps.financeEngine || require('../../../domain/Finance_Engine');
    const taskManager = deps.taskManager || require('../../../domain/Task_Manager');
    const splitEngine = deps.splitEngine || require('../../../domain/Split_Engine');
    const supabaseFinance = deps.supabaseFinance || require('../../../infrastructure/Supabase_Finance');

    const getPendingFinMap = () => {
      if (deps.pendingConfirmations && typeof deps.pendingConfirmations.entries === 'function') {
        return deps.pendingConfirmations;
      }
      if (typeof financeEngine.getPendingConfirmationsMap === 'function') {
        return financeEngine.getPendingConfirmationsMap();
      }
      try {
        return require('../../../domain/finance/Finance_State').pendingConfirmations;
      } catch (_) {
        return null;
      }
    };

    const snapshotPendingFin = () => {
      const snap = new Map();
      const m = getPendingFinMap();
      if (m && typeof m.entries === 'function') {
        for (const [k, v] of m.entries()) {
          try {
            snap.set(k, JSON.stringify((v && v.tx) || {}));
          } catch (_) {
            snap.set(k, '');
          }
        }
      }
      return snap;
    };

    const loadFinanceCategories = async () => {
      try {
        if (supabaseFinance && typeof supabaseFinance.getCategoriesList === 'function') {
          const cats = await supabaseFinance.getCategoriesList();
          if (Array.isArray(cats)) return cats;
        }
      } catch (_) {}
      return [];
    };

    const syncFinanceCardsAfterMutation = async (ws, prevSnap, replyText) => {
      if (!prevSnap || prevSnap.size === 0) return;
      const currMap = getPendingFinMap();
      const cleanDetail = String(replyText || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim().slice(0, 160);
      for (const [oldKey, oldTxJson] of prevSnap.entries()) {
        if (!currMap || !currMap.has(oldKey)) {
          const wasCancelled = /dibatalkan/i.test(replyText);
          safeSend(ws, {
            type: 'CARD_UPDATE',
            card_id: `fin_${oldKey}`,
            status: 'RESOLVED',
            resolved_badge: wasCancelled ? 'Cancelled' : 'Recorded',
            resolved_detail: cleanDetail,
            ts: nowFn()
          });
        } else {
          const currEntry = currMap.get(oldKey);
          let currJson = '';
          try { currJson = JSON.stringify((currEntry && currEntry.tx) || {}); } catch (_) {}
          if (currEntry && currEntry.tx && currJson !== oldTxJson) {
            const categories = await loadFinanceCategories();
            const updatedCard = cardHandler.buildFinanceTxCard(currEntry.tx, oldKey, {
              categories,
              expiresAtMs: currEntry.expiresAtMs
            });
            safeSend(ws, {
              type: 'CARD_UPDATE',
              card_id: `fin_${oldKey}`,
              status: 'PENDING',
              updated_card: updatedCard,
              resolved_detail: cleanDetail,
              ts: nowFn()
            });
          }
        }
      }
    };

    let interceptedReplies = [];
    const collectInterceptorReply = async (msg) => {
      if (msg) interceptedReplies.push(String(msg));
    };
    const noopDeliver = async () => {};

    // 1. Morning Check-in & Detail Drill-down (O(1) in-memory check)
    try {
      const checkInHandled = await interceptors.handleMorningCheckIn(content, {
        respondToTelegram: collectInterceptorReply,
        deliverWebhookReply: noopDeliver
      });
      if (checkInHandled && interceptedReplies.length > 0) {
        const replyText = stripHtmlForMobile(interceptedReplies.join('\n\n'));
        await streamFinalReply(clientMsgId, entry, content, replyText, 'MORNING_CHECKIN', saveChatMemory);
        return;
      }
    } catch (e) {
      console.warn('[BRIDGE-CHAT] Morning check-in interceptor warning:', e.message);
    }

    // 2. Pending Calendar Duration (O(1) map check)
    const activePendingCal = getFreshMapEntry(pendingCalendar);
    if (activePendingCal) {
      interceptedReplies = [];
      try {
        const calPendingRes = await interceptors.handlePendingCalendar(content, activePendingCal, {
          respondToTelegram: collectInterceptorReply
        });
        if (calPendingRes.handled) {
          if (calPendingRes.updatedPendingCalendar) {
            pendingCalendar.set(sessionKey, calPendingRes.updatedPendingCalendar);
          } else {
            pendingCalendar.delete(sessionKey);
          }
          let conflictCard = null;
          if (calPendingRes.newConflict) {
            pendingConflictEvent = { ...calPendingRes.newConflict, createdAt: nowFn() };
            conflictCard = cardHandler.buildCalendarConflictCard(pendingConflictEvent);
            activeCardIds.conflict = conflictCard.card_id;
          }
          const replyText = stripHtmlForMobile(interceptedReplies.join('\n\n') || 'Jadwal diperbarui.');
          await streamFinalReply(clientMsgId, entry, content, replyText, 'CALENDAR', saveChatMemory, conflictCard);
          return;
        }
      } catch (e) {
        console.warn('[BRIDGE-CHAT] Pending calendar interceptor warning:', e.message);
      }
    }

    // 3. Pending Finance Deletion Confirmation (O(1) in-memory map check)
    const pendingDelMap = typeof financeEngine.getPendingDeletionsContext === 'function'
      ? financeEngine.getPendingDeletionsContext()
      : null;
    if (pendingDelMap && pendingDelMap.size > 0) {
      interceptedReplies = [];
      try {
        const delHandled = await interceptors.handlePendingDeletions(content, {
          respondToTelegram: collectInterceptorReply
        });
        if (delHandled) {
          const replyText = stripHtmlForMobile(interceptedReplies.join('\n\n') || 'Status penghapusan diperbarui.');
          const stillPending = financeEngine.getPendingDeletionsContext();
          if (!stillPending || stillPending.size === 0) {
            const wasDeleted = /DIHAPUS/i.test(replyText);
            emitCardResolvedFromText(entry.ws, 'financeDelete', wasDeleted ? 'Deleted' : 'Kept', replyText);
          }
          await streamFinalReply(clientMsgId, entry, content, replyText, 'FINANCE', saveChatMemory);
          return;
        }
      } catch (e) {
        console.warn('[BRIDGE-CHAT] Pending deletion interceptor warning:', e.message);
      }
    }

    // 4. Pending Split Remainder (O(1) in-memory map check)
    if (typeof splitEngine.hasPendingRemainder === 'function' && splitEngine.hasPendingRemainder(sessionKey)) {
      interceptedReplies = [];
      try {
        const splitHandled = await interceptors.handlePendingSplitRemainder(sessionKey, content, {
          respondToTelegram: collectInterceptorReply
        });
        if (splitHandled) {
          const replyText = stripHtmlForMobile(interceptedReplies.join('\n\n') || 'Split diperbarui.');
          await streamFinalReply(clientMsgId, entry, content, replyText, 'FINANCE', saveChatMemory);
          return;
        }
      } catch (e) {
        console.warn('[BRIDGE-CHAT] Split remainder interceptor warning:', e.message);
      }
    }

    // 5. Pending Finance Confirmation (O(1) in-memory count check -> supports text "ya"/"batal"/edit/split alongside card buttons)
    const pendingFinCount = typeof financeEngine.getPendingConfirmationsCount === 'function'
      ? financeEngine.getPendingConfirmationsCount()
      : 0;
    if (pendingFinCount > 0) {
      interceptedReplies = [];
      const prevFinSnap = snapshotPendingFin();
      try {
        const msgShim = replyCtx ? { reply_to_message: { text: replyCtx.preview } } : {};
        const finHandled = await interceptors.handlePendingFinanceConfirmation(msgShim, content, sessionKey, {
          respondToTelegram: collectInterceptorReply
        });
        if (finHandled) {
          const replyText = stripHtmlForMobile(interceptedReplies.join('\n\n') || 'Konfirmasi transaksi diproses.');
          await syncFinanceCardsAfterMutation(entry.ws, prevFinSnap, replyText);
          await streamFinalReply(clientMsgId, entry, content, replyText, 'FINANCE', saveChatMemory);
          return;
        }
      } catch (e) {
        console.warn('[BRIDGE-CHAT] Pending finance interceptor warning:', e.message);
      }
    }

    // 6. Pending Task Confirmation (CONFIRM_SYNC / CONFIRM_DURATION / CONFIRM_LIST)
    if (taskManager.pendingTaskCategories && taskManager.pendingTaskCategories.has(sessionKey)) {
      interceptedReplies = [];
      try {
        const taskHandled = await interceptors.handlePendingTasks(sessionKey, content, {
          respondToTelegram: collectInterceptorReply
        });
        if (taskHandled) {
          const replyText = stripHtmlForMobile(interceptedReplies.join('\n\n') || 'Tugas diperbarui.');
          if (!taskManager.pendingTaskCategories.has(sessionKey)) {
            const wasCancelled = /dibatalkan/i.test(replyText);
            emitCardResolvedFromText(entry.ws, 'taskConfirm', wasCancelled ? 'Cancelled' : 'Saved', replyText);
          }
          await streamFinalReply(clientMsgId, entry, content, replyText, 'TASK', saveChatMemory);
          return;
        }
      } catch (e) {
        console.warn('[BRIDGE-CHAT] Pending task interceptor warning:', e.message);
      }
    }

    // 7. Pending Calendar Conflict Confirmation (uses googleWorkspace.createCalendarEvent via shared interceptor)
    if (pendingConflictEvent && (nowFn() - (pendingConflictEvent.createdAt || pendingConflictEvent.askedAt || 0)) <= CONTEXT_TTL_MS) {
      interceptedReplies = [];
      try {
        const conflictObj = { ...pendingConflictEvent, askedAt: pendingConflictEvent.askedAt || pendingConflictEvent.createdAt || nowFn() };
        const confRes = await interceptors.handlePendingConflict(content, conflictObj, {
          respondToTelegram: collectInterceptorReply
        });
        if (confRes.handled) {
          pendingConflictEvent = confRes.updatedConflict;
          const replyText = stripHtmlForMobile(interceptedReplies.join('\n\n') || 'Konfirmasi jadwal selesai.');
          const wasCancelled = /dibatalkan/i.test(replyText);
          emitCardResolvedFromText(entry.ws, 'conflict', wasCancelled ? 'Cancelled' : 'Added to Calendar', replyText);
          await streamFinalReply(clientMsgId, entry, content, replyText, 'CALENDAR', saveChatMemory);
          return;
        }
      } catch (confErr) {
        console.warn('[BRIDGE-CHAT] Calendar conflict confirm error:', confErr.message);
      }
    } else {
      pendingConflictEvent = null;
    }

    // 8. Pending Proactive Prep Tasks Confirmation (now fully wired for text + native checklist card)
    if (pendingProactiveTasks && (nowFn() - (pendingProactiveTasks.createdAt || pendingProactiveTasks.askedAt || 0)) <= 15 * 60 * 1000) {
      interceptedReplies = [];
      try {
        const proObj = { ...pendingProactiveTasks, askedAt: pendingProactiveTasks.askedAt || pendingProactiveTasks.createdAt || nowFn() };
        const proRes = await interceptors.handlePendingProactiveTasks(content, proObj, sessionKey, {
          respondToTelegram: collectInterceptorReply
        });
        if (proRes.handled) {
          pendingProactiveTasks = proRes.updatedProactiveTasks;
          const replyText = stripHtmlForMobile(interceptedReplies.join('\n\n') || 'Tugas persiapan diproses.');
          const wasSkipped = /dilewatkan/i.test(replyText);
          emitCardResolvedFromText(entry.ws, 'proactiveTasks', wasSkipped ? 'Skipped' : 'Tasks Added', replyText);
          await streamFinalReply(clientMsgId, entry, content, replyText, 'TASK', saveChatMemory);
          return;
        }
      } catch (proErr) {
        console.warn('[BRIDGE-CHAT] Proactive tasks confirm error:', proErr.message);
      }
    } else {
      pendingProactiveTasks = null;
    }

    const aiRouter = getAiRouter();
    const routingData = await aiRouter.routeUserMessage(routedInput, {
      conversationContext: getFreshConversationContext(),
      source: 'mobile',
      deviceContext: telemetry || undefined,
      pendingEmailContext: getFreshMapEntry(pendingEmail),
      pendingCalendarContext: getFreshMapEntry(pendingCalendar),
      pendingDatabaseContext: getFreshMapEntry(pendingDatabase),
      pendingVaultContext: getFreshMapEntry(pendingVault)
    });

    if (entry.aborted) {
      finalizeAborted(clientMsgId, entry, 'Dibatalkan oleh pengguna.');
      return;
    }

    const normIntent = String(routingData?.intent || 'NORMAL_CHAT').toUpperCase();
    entry.intent = normIntent;

    // F-04: Run shared clarification gate before executing destructive actions (e.g. EMAIL DELETE without keyword)
    let clarificationMsg = null;
    try {
      const followUpResolver = require('../../common/follow_up_resolver');
      if (typeof followUpResolver.getClarificationMessage === 'function') {
        clarificationMsg = followUpResolver.getClarificationMessage(routingData, content);
      }
    } catch (_) {}

    const actions = Array.isArray(routingData?.actions) && routingData.actions.length > 0
      ? routingData.actions
      : [{ intent: normIntent, extracted_data: routingData?.extracted_data || {} }];

    // Snapshot pending state before domain execution so we attach Quick Action Chips / Cards cleanly
    const prevConflictRef = pendingConflictEvent;
    const prevProactiveRef = pendingProactiveTasks;
    const prevFinSnap = snapshotPendingFin();
    const prevDelKeys = new Set(
      (typeof financeEngine.getPendingDeletionsContext === 'function' && financeEngine.getPendingDeletionsContext())
        ? Array.from(financeEngine.getPendingDeletionsContext().keys())
        : []
    );
    const prevTaskRef = (taskManager.pendingTaskCategories && taskManager.pendingTaskCategories.get(sessionKey)) || null;

    const executeDomainIntent = getDomainDispatcher();
    const replyParts = [];

    if (clarificationMsg) {
      replyParts.push(clarificationMsg);
    } else {
      for (const act of actions) {
        if (entry.aborted) {
          finalizeAborted(clientMsgId, entry, 'Dibatalkan oleh pengguna.');
          return;
        }
        const actIntent = String(act?.intent || normIntent).toUpperCase();
        if (actIntent === 'NORMAL_CHAT' || actIntent === 'UNKNOWN') {
          if (routingData?.reply_message) replyParts.push(routingData.reply_message);
          continue;
        }
        const resText = await executeDomainIntent(actIntent, {
          ...routingData,
          intent: actIntent,
          extracted_data: act.extracted_data || routingData?.extracted_data || {}
        }, {
          source: 'mobile',
          platform: 'mobile',
          sessionKey,
          pendingEmail,
          pendingCalendar,
          pendingDatabase,
          pendingVault,
          emailDefaults: { defaultQuery: '', defaultFetch: 30 }, // F-07: General inbox parity with Telegram
          pendingConflict: pendingConflictEvent,
          setPendingConflictEvent: (val) => {
            pendingConflictEvent = val ? { ...val, createdAt: nowFn() } : null;
          },
          setPendingProactiveTasks: (val) => {
            pendingProactiveTasks = val ? { ...val, createdAt: nowFn() } : null;
          },
          notifyClient: (msg) => {
            const clean = stripHtmlForMobile(msg);
            if (!clean) return;
            if (entry.state === 'RUNNING') {
              safeSend(entry.ws, {
                type: 'CHAT_ACK',
                client_msg_id: clientMsgId,
                status: 'THINKING',
                stage: clean.slice(0, 120),
                ts: nowFn()
              });
            } else {
              // Background 5-minute auto-confirm timer fired after the turn already finalized
              emitCardResolvedFromText(entry.ws, 'taskConfirm', 'Auto-saved', clean);
              try {
                const mobileClient = require('./client');
                if (mobileClient && typeof mobileClient.sendProactiveMessage === 'function' && mobileClient.getClient()) {
                  mobileClient.sendProactiveMessage({
                    text: clean,
                    kind: 'TASK_AUTOSAVE',
                    priority: 'P1'
                  });
                  return;
                }
              } catch (_) {}
              safeSend(entry.ws, {
                type: 'CHAT_PROACTIVE',
                client_msg_id: `proactive_task_auto_${nowFn()}`,
                content: clean,
                kind: 'TASK_AUTOSAVE',
                priority: 'P1',
                caught_up: false,
                ts: nowFn()
              });
            }
          },
          clientMsgId,
          textInput: content,
          replyTo: replyCtx || undefined,
          message: replyCtx ? { reply_to_message: { text: replyCtx.preview } } : undefined,
          deviceContext: telemetry || null,
          financeStepUpService: getFinanceStepUpService(),
          onStepUpRequired: (pendingFrame) => {
            entry.pendingFrame = pendingFrame;
            safeSend(entry.ws, pendingFrame);
          }
        });
        if (resText) replyParts.push(resText);
      }
    }

    const rawReply = replyParts.length > 0
      ? replyParts.join('\n\n')
      : (routingData?.reply_message || 'Baik Tuan, pesan sudah saya terima.');

    const cleanReply = stripHtmlForMobile(rawReply);

    // Sync any existing FINANCE_TX cards that were confirmed, cancelled, or updated during domain execution
    await syncFinanceCardsAfterMutation(entry.ws, prevFinSnap, cleanReply);

    // Auto-attach Interactive Cards / Quick Action Chips if domain execution created a new pending confirmation
    let attachedCard = null;
    if (pendingConflictEvent && pendingConflictEvent !== prevConflictRef) {
      attachedCard = cardHandler.buildCalendarConflictCard(pendingConflictEvent);
      activeCardIds.conflict = attachedCard.card_id;
    } else if (pendingProactiveTasks && pendingProactiveTasks !== prevProactiveRef &&
        Array.isArray(pendingProactiveTasks.tasks) && pendingProactiveTasks.tasks.length > 0) {
      attachedCard = cardHandler.buildProactiveTasksCard(pendingProactiveTasks);
      activeCardIds.proactiveTasks = attachedCard.card_id;
    } else {
      // Check if a new manual FINANCE_TX confirmation was registered in pendingConfirmations
      const currFinMap = getPendingFinMap();
      if (currFinMap && currFinMap.size > 0) {
        for (const [finKey, finEntry] of currFinMap.entries()) {
          if (!prevFinSnap.has(finKey) && finEntry && finEntry.tx) {
            const categories = await loadFinanceCategories();
            attachedCard = cardHandler.buildFinanceTxCard(finEntry.tx, finKey, {
              categories,
              expiresAtMs: finEntry.expiresAtMs
            });
            break;
          }
        }
      }
      if (!attachedCard) {
        const currDelMap = typeof financeEngine.getPendingDeletionsContext === 'function'
          ? financeEngine.getPendingDeletionsContext()
          : null;
        if (currDelMap && currDelMap.size > 0) {
          for (const [delKey, delEntry] of currDelMap.entries()) {
            if (!prevDelKeys.has(delKey)) {
              attachedCard = cardHandler.buildFinanceDeleteCard(delKey, delEntry && delEntry.txData);
              activeCardIds.financeDelete = attachedCard.card_id;
              break;
            }
          }
        }
      }
      if (!attachedCard && taskManager.pendingTaskCategories) {
        const currTaskRef = taskManager.pendingTaskCategories.get(sessionKey) || null;
        if (currTaskRef && currTaskRef !== prevTaskRef) {
          attachedCard = cardHandler.buildTaskConfirmCard(currTaskRef, sessionKey);
          activeCardIds.taskConfirm = attachedCard.card_id;
        }
      }
    }

    // N-H2 / R-03: Align conversationContext keys with Router_Dispatcher.js + follow_up_resolver.js (askedAt)
    const nowTs = nowFn();
    lastConversationContext = {
      intent: normIntent,
      extractedData: routingData?.extracted_data || {},
      lastAssistantReply: cleanReply.slice(0, 500),
      lastUserText: content.slice(0, 300),
      askedAt: nowTs,
      updatedAt: nowTs
    };

    await streamFinalReply(clientMsgId, entry, content, cleanReply, normIntent, saveChatMemory, attachedCard);
  }

  async function streamFinalReply(clientMsgId, entry, _userContent, cleanReply, normIntent, saveChatMemory, card = null) {
    const chunks = splitIntoStreamChunks(cleanReply, chunkSize);
    let seq = 0;

    for (const chunkText of chunks) {
      if (entry.aborted) {
        finalizeAborted(clientMsgId, entry, 'Dibatalkan oleh pengguna.');
        return;
      }
      seq += 1;
      entry.chunks.push({ seq, chunk: chunkText });
      entry.updatedAt = nowFn();

      safeSend(entry.ws, {
        type: 'CHAT_CHUNK',
        client_msg_id: clientMsgId,
        seq,
        status: 'STREAMING_CHUNK',
        chunk: chunkText
      });

      if (chunkDelayMs > 0 && seq < chunks.length) {
        await new Promise(resolve => setTimeout(resolve, chunkDelayMs));
      }
    }

    if (entry.aborted) {
      finalizeAborted(clientMsgId, entry, 'Dibatalkan oleh pengguna.');
      return;
    }

    entry.finalSeq = seq + 1;
    entry.state = 'FINAL';
    entry.card = card || null;
    entry.updatedAt = nowFn();

    const finalFrame = {
      type: 'CHAT_CHUNK',
      client_msg_id: clientMsgId,
      seq: entry.finalSeq,
      status: 'STREAM_FINAL',
      chunk: '',
      intent: normIntent
    };
    if (card && typeof card === 'object') {
      finalFrame.card = card;
    }
    safeSend(entry.ws, finalFrame);

    Promise.resolve(saveChatMemory('nexa', cleanReply.slice(0, 4000), 'mobile')).catch(err => {
      console.warn('[BRIDGE-CHAT] Failed saving assistant chat memory:', err.message);
    });
  }

  async function handleChatSend(payload, ws) {
    const clientMsgId = String(payload.client_msg_id || '').trim().slice(0, MAX_CLIENT_MSG_ID_LEN);
    const content = String(payload.content || '').trim();

    if (!clientMsgId || !content) {
      safeSend(ws, {
        type: 'CHAT_CHUNK',
        client_msg_id: clientMsgId || 'invalid',
        seq: 1,
        status: 'ERROR_ABORT',
        chunk: '',
        error: 'client_msg_id dan content wajib diisi.'
      });
      return;
    }

    if (content.length > MAX_CHAT_CONTENT_LEN) {
      safeSend(ws, {
        type: 'CHAT_CHUNK',
        client_msg_id: clientMsgId,
        seq: 1,
        status: 'ERROR_ABORT',
        chunk: '',
        error: 'Pesan teks terlalu panjang (maksimal 16 KB).'
      });
      return;
    }

    // FR-CHAT-08 / FR-CHAT-09: Idempotent deduplication by client_msg_id (allow clean retry after ABORTED)
    const existing = replayStore.get(clientMsgId);
    if (existing) {
      if (existing.state === 'ABORTED') {
        replayStore.delete(clientMsgId);
      } else {
        console.log(`[BRIDGE-CHAT] Idempotent replay for client_msg_id=${clientMsgId} (state=${existing.state})`);
        existing.ws = ws;
        if (existing.state === 'RUNNING') {
          safeSend(ws, { type: 'CHAT_ACK', client_msg_id: clientMsgId, status: 'THINKING' });
          replayFromSeq(ws, clientMsgId, existing, 0);
        } else {
          replayFromSeq(ws, clientMsgId, existing, 0);
        }
        return;
      }
    }

    pruneReplayCapacity();
    const abortController = new AbortController();
    const entry = {
      state: 'RUNNING',
      chunks: [],
      finalSeq: 0,
      intent: 'NORMAL_CHAT',
      error: null,
      aborted: false,
      abortController,
      ws,
      updatedAt: nowFn()
    };
    replayStore.set(clientMsgId, entry);

    // Immediate THINKING ACK so mobile avatar switches state right away
    safeSend(ws, {
      type: 'CHAT_ACK',
      client_msg_id: clientMsgId,
      status: 'THINKING',
      ts: nowFn()
    });

    await enqueueSessionTurn(async () => {
      if (entry.aborted) {
        finalizeAborted(clientMsgId, entry, 'Dibatalkan oleh pengguna.');
        return;
      }
      const turnTimer = setTimeout(() => {
        if (entry.state === 'RUNNING') {
          entry.aborted = true;
          try { abortController.abort(); } catch (_) {}
          finalizeAborted(clientMsgId, entry, 'Batas waktu pemrosesan pesan habis. Silakan coba lagi.');
        }
      }, TURN_TIMEOUT_MS);
      if (typeof turnTimer.unref === 'function') turnTimer.unref();

      try {
        await executeAndStreamChat(clientMsgId, entry, content, payload);
      } catch (err) {
        console.error('[BRIDGE-CHAT] Error processing CHAT_SEND:', err.message);
        finalizeAborted(clientMsgId, entry, sanitizeClientError(err, 'Gagal memproses pesan saat ini. Silakan coba lagi.'));
      } finally {
        clearTimeout(turnTimer);
      }
    });
  }

  async function handleChatVoiceSend(payload, ws) {
    const clientMsgId = String(payload.client_msg_id || '').trim().slice(0, MAX_CLIENT_MSG_ID_LEN);
    const audioB64 = typeof payload.audio_b64 === 'string' ? payload.audio_b64.trim() : '';
    const rawMime = String(payload.audio_mime || 'audio/ogg').trim();
    const durationMs = Number.isFinite(Number(payload.duration_ms)) ? Math.max(0, Number(payload.duration_ms)) : 0;

    if (!clientMsgId || !audioB64) {
      safeSend(ws, {
        type: 'CHAT_CHUNK',
        client_msg_id: clientMsgId || 'invalid',
        seq: 1,
        status: 'ERROR_ABORT',
        chunk: '',
        error: 'client_msg_id dan audio_b64 wajib diisi.'
      });
      return;
    }

    if (durationMs > MAX_VOICE_DURATION_MS) {
      safeSend(ws, {
        type: 'CHAT_CHUNK',
        client_msg_id: clientMsgId,
        seq: 1,
        status: 'ERROR_ABORT',
        chunk: '',
        error: 'Durasi pesan suara melebihi batas maksimal 3 menit.'
      });
      return;
    }

    // Idempotent deduplication by client_msg_id (allow clean retry after ABORTED)
    const existing = replayStore.get(clientMsgId);
    if (existing) {
      if (existing.state === 'ABORTED') {
        replayStore.delete(clientMsgId);
      } else {
        console.log(`[BRIDGE-CHAT] Idempotent voice replay for client_msg_id=${clientMsgId} (state=${existing.state})`);
        existing.ws = ws;
        if (existing.state === 'RUNNING') {
          safeSend(ws, { type: 'CHAT_ACK', client_msg_id: clientMsgId, status: 'THINKING' });
          replayFromSeq(ws, clientMsgId, existing, 0);
        } else {
          replayFromSeq(ws, clientMsgId, existing, 0);
        }
        return;
      }
    }

    // H-10: Cap concurrent in-flight voice note decoding/STT to protect 892 MB VPS memory
    if (activeVoiceInFlight >= 2) {
      safeSend(ws, {
        type: 'CHAT_CHUNK',
        client_msg_id: clientMsgId,
        seq: 1,
        status: 'ERROR_ABORT',
        chunk: '',
        error: 'Pesan suara sebelumnya masih diproses. Tunggu sebentar lalu coba lagi.'
      });
      return;
    }

    const audioBuffer = decodeStrictBase64(audioB64);
    if (!audioBuffer) {
      safeSend(ws, {
        type: 'CHAT_CHUNK',
        client_msg_id: clientMsgId,
        seq: 1,
        status: 'ERROR_ABORT',
        chunk: '',
        error: 'Data audio base64 tidak valid.'
      });
      return;
    }

    const validation = validateVoiceAudioBuffer(audioBuffer, rawMime);
    if (!validation.ok) {
      safeSend(ws, {
        type: 'CHAT_CHUNK',
        client_msg_id: clientMsgId,
        seq: 1,
        status: 'ERROR_ABORT',
        chunk: '',
        error: validation.error
      });
      return;
    }

    pruneReplayCapacity();
    const abortController = new AbortController();
    const entry = {
      state: 'RUNNING',
      chunks: [],
      finalSeq: 0,
      intent: 'NORMAL_CHAT',
      error: null,
      aborted: false,
      abortController,
      ws,
      updatedAt: nowFn()
    };
    replayStore.set(clientMsgId, entry);

    console.log(`[BRIDGE-CHAT] Voice note received client_msg_id=${clientMsgId} mime=${validation.mimeType} bytes=${audioBuffer.length} duration_ms=${durationMs}`);

    // Immediate THINKING ACK marks mobile bubble as SENT and switches visor avatar right away
    safeSend(ws, {
      type: 'CHAT_ACK',
      client_msg_id: clientMsgId,
      status: 'THINKING',
      stage: 'TRANSCRIBING',
      ts: nowFn()
    });

    activeVoiceInFlight += 1;
    await enqueueSessionTurn(async () => {
      const turnTimer = setTimeout(() => {
        if (entry.state === 'RUNNING') {
          entry.aborted = true;
          try { abortController.abort(); } catch (_) {}
          finalizeAborted(clientMsgId, entry, 'Waktu pemrosesan pesan suara habis. Silakan coba lagi.');
        }
      }, TURN_TIMEOUT_MS);
      if (typeof turnTimer.unref === 'function') turnTimer.unref();

      try {
        if (entry.aborted) {
          finalizeAborted(clientMsgId, entry, 'Dibatalkan oleh pengguna.');
          return;
        }
        const voiceEngine = getVoiceEngine();
        const transcribedText = String(await voiceEngine.transcribeAudioBuffer(audioBuffer, {
          ext: validation.ext,
          mimeType: validation.mimeType,
          signal: abortController.signal
        }) || '').trim();

        if (entry.aborted) {
          finalizeAborted(clientMsgId, entry, 'Dibatalkan oleh pengguna.');
          return;
        }

        if (!transcribedText) {
          finalizeAborted(clientMsgId, entry, 'Suara terlalu pelan atau tidak terdengar jelas. Silakan rekam ulang.');
          return;
        }

        // V-03: Surface transcribed text back to Android via non-breaking CHAT_ACK stage
        safeSend(entry.ws, {
          type: 'CHAT_ACK',
          client_msg_id: clientMsgId,
          status: 'THINKING',
          stage: 'TRANSCRIBED',
          transcript: transcribedText,
          ts: nowFn()
        });

        await executeAndStreamChat(clientMsgId, entry, transcribedText, payload);
      } catch (err) {
        if (entry.aborted) {
          finalizeAborted(clientMsgId, entry, 'Dibatalkan oleh pengguna.');
          return;
        }
        console.error('[BRIDGE-CHAT] Error processing CHAT_VOICE_SEND:', err.message);
        finalizeAborted(clientMsgId, entry, sanitizeClientError(err, 'Gagal mengenali pesan suara saat ini. Silakan rekam ulang.'));
      } finally {
        clearTimeout(turnTimer);
        activeVoiceInFlight = Math.max(0, activeVoiceInFlight - 1);
      }
    });
  }

  function finalizeAborted(clientMsgId, entry, errorMsg) {
    if (entry.state === 'ABORTED' || entry.state === 'FINAL') return;
    entry.state = 'ABORTED';
    entry.error = errorMsg;
    entry.finalSeq = entry.chunks.length + 1;
    entry.updatedAt = nowFn();
    safeSend(entry.ws, {
      type: 'CHAT_CHUNK',
      client_msg_id: clientMsgId,
      seq: entry.finalSeq,
      status: 'ERROR_ABORT',
      chunk: '',
      error: errorMsg
    });
  }

  function handleChatResume(payload, ws) {
    const clientMsgId = String(payload.client_msg_id || '').trim();
    const lastSeq = Number.isFinite(Number(payload.last_seq)) ? Math.max(0, Number(payload.last_seq)) : 0;
    const entry = replayStore.get(clientMsgId);

    if (!entry) {
      safeSend(ws, {
        type: 'CHAT_RESUME_MISS',
        client_msg_id: clientMsgId
      });
      return;
    }

    entry.ws = ws;
    entry.updatedAt = nowFn();
    console.log(`[BRIDGE-CHAT] CHAT_RESUME client_msg_id=${clientMsgId} from last_seq=${lastSeq} (state=${entry.state})`);
    replayFromSeq(ws, clientMsgId, entry, lastSeq);
  }

  function handleChatStop(payload) {
    const clientMsgId = String(payload.client_msg_id || '').trim();
    const entry = replayStore.get(clientMsgId);
    if (entry && entry.state === 'RUNNING') {
      entry.aborted = true;
      if (entry.abortController && typeof entry.abortController.abort === 'function') {
        try { entry.abortController.abort(); } catch (_) {}
      }
      console.log(`[BRIDGE-CHAT] CHAT_STOP received for client_msg_id=${clientMsgId}`);
    }
  }

  async function handleActionAuth(payload, ws) {
    try {
      const stepUpService = getFinanceStepUpService();
      const res = await stepUpService.verifyAndExecuteAction({
        actionId: payload.action_id,
        deviceId: payload.device_id,
        nonce: payload.nonce,
        signatureDerB64: payload.sig || payload.signature_b64 || payload.signature_der_b64
      });

      const cleanMessage = stripHtmlForMobile(res.message);

      if (res.clientMsgId && replayStore.has(res.clientMsgId)) {
        replayStore.get(res.clientMsgId).pendingFrame = null;
      }

      safeSend(ws, {
        type: 'ACTION_RESULT',
        action_id: res.actionId,
        client_msg_id: res.clientMsgId || '',
        status: res.status,
        ok: Boolean(res.ok),
        code: res.code || 'OK',
        daily_remaining: res.dailyRemaining !== undefined ? res.dailyRemaining : stepUpService.getDailyRemaining(),
        formatted_daily_remaining: res.formattedDailyRemaining || '',
        message: cleanMessage
      });

      if (res.ok) {
        const saveChatMemory = getSaveChatMemory();
        Promise.resolve(saveChatMemory('nexa', cleanMessage.slice(0, 4000), 'mobile')).catch(() => {});
      }
    } catch (err) {
      console.error('[BRIDGE-CHAT] Unhandled error in handleActionAuth:', err.message);
      safeSend(ws, {
        type: 'ACTION_RESULT',
        action_id: String(payload && payload.action_id || ''),
        client_msg_id: '',
        status: 'ERROR',
        ok: false,
        code: 'ACTION_AUTH_ERROR',
        message: `Gagal memproses otorisasi aksi: ${err.message}`
      });
    }
  }

  function handleActionCancel(payload, ws) {
    try {
      const stepUpService = getFinanceStepUpService();
      const reason = String(payload.reason || '').toUpperCase();
      const res = stepUpService.cancelPendingAction({
        actionId: payload.action_id,
        deviceId: payload.device_id,
        reason
      });
      if (res.clientMsgId && replayStore.has(res.clientMsgId)) {
        replayStore.get(res.clientMsgId).pendingFrame = null;
      }
      // N-L6: Suppress duplicate chat text when local client timeout already informed user
      const isLocalTimeout = reason === 'TIMEOUT';
      if (!res.found && isLocalTimeout) {
        return;
      }
      safeSend(ws, {
        type: 'ACTION_RESULT',
        action_id: res.actionId,
        client_msg_id: res.clientMsgId || '',
        status: isLocalTimeout ? 'EXPIRED' : 'CANCELLED',
        ok: false,
        code: isLocalTimeout ? 'ACTION_EXPIRED' : 'USER_CANCELLED',
        message: isLocalTimeout ? '' : res.message
      });
    } catch (err) {
      console.error('[BRIDGE-CHAT] Unhandled error in handleActionCancel:', err.message);
    }
  }

  function handleMessage(payload, ws) {
    const pType = String(payload && payload.type ? payload.type : '').toUpperCase();
    if (pType === 'CHAT_SEND') {
      handleChatSend(payload, ws).catch((err) => {
        console.error('[BRIDGE-CHAT] Async handleChatSend rejection:', err.message);
      });
      return true;
    }
    if (pType === 'CHAT_VOICE_SEND') {
      handleChatVoiceSend(payload, ws).catch((err) => {
        console.error('[BRIDGE-CHAT] Async handleChatVoiceSend rejection:', err.message);
      });
      return true;
    }
    if (pType === 'CHAT_RESUME') {
      handleChatResume(payload, ws);
      return true;
    }
    if (pType === 'CHAT_STOP') {
      handleChatStop(payload);
      return true;
    }
    if (pType === 'ACTION_AUTH') {
      handleActionAuth(payload, ws).catch((err) => {
        console.error('[BRIDGE-CHAT] Async handleActionAuth rejection:', err.message);
      });
      return true;
    }
    if (pType === 'ACTION_CANCEL') {
      handleActionCancel(payload, ws);
      return true;
    }
    return false;
  }

  function destroy() {
    clearInterval(sweepTimer);
    replayStore.clear();
  }

  return {
    handleMessage,
    handleChatSend,
    handleChatVoiceSend,
    handleChatResume,
    handleChatStop,
    handleActionAuth,
    handleActionCancel,
    rebindClientWs,
    destroy,
    _replayStore: replayStore
  };
}

let singleton = null;
function getMobileChatHandler() {
  if (!singleton) {
    singleton = createMobileChatHandler();
  }
  return singleton;
}

module.exports = {
  createMobileChatHandler,
  getMobileChatHandler,
  splitIntoStreamChunks,
  stripHtmlForMobile
};
