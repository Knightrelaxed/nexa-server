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
const MAX_REPLAY_ENTRIES = 100;
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
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/?(?:b|strong|i|em|u|code|pre|a|span|div|p)[^>]*>/gi, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
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
  const getLatestTelemetry = () => deps.getLatestTelemetry || require('../mobile_bridge/client').getLatestTelemetry;
  const getFinanceStepUpService = () => deps.financeStepUpService || require('../../../core/auth/finance_stepup_service').getFinanceStepUpService();
  const getVoiceEngine = () => deps.voiceEngine || require('../../../core/Voice_Engine');
  const nowFn = deps.nowFn || (() => Date.now());
  const chunkSize = deps.chunkSize || DEFAULT_CHUNK_SIZE;
  const chunkDelayMs = deps.chunkDelayMs !== undefined ? deps.chunkDelayMs : 12;

  // client_msg_id -> { state: 'RUNNING'|'FINAL'|'ABORTED', chunks: [{seq, chunk}], intent, error, updatedAt, aborted, pendingFrame }
  const replayStore = new Map();
  let lastConversationContext = null;
  const sessionKey = 'mobile-primary';
  const pendingEmail = new Map();
  const pendingCalendar = new Map();
  const pendingDatabase = new Map();
  const pendingVault = new Map();

  const sweepTimer = setInterval(() => {
    const now = nowFn();
    for (const [id, entry] of replayStore.entries()) {
      if (now - entry.updatedAt > REPLAY_TTL_MS) {
        replayStore.delete(id);
      }
    }
  }, 60_000);
  if (typeof sweepTimer.unref === 'function') {
    sweepTimer.unref();
  }

  function pruneReplayCapacity() {
    if (replayStore.size <= MAX_REPLAY_ENTRIES) return;
    const oldestKey = replayStore.keys().next().value;
    if (oldestKey) replayStore.delete(oldestKey);
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
      safeSend(ws, {
        type: 'CHAT_CHUNK',
        client_msg_id: clientMsgId,
        seq: entry.finalSeq,
        status: 'STREAM_FINAL',
        chunk: '',
        intent: entry.intent || 'NORMAL_CHAT'
      });
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

  async function executeAndStreamChat(clientMsgId, entry, content, payload) {
    const replyCtx = extractSanitizedReplyContext(payload);
    const routedInput = buildReplyContextPrompt(content, replyCtx);

    const saveChatMemory = getSaveChatMemory();
    Promise.resolve(saveChatMemory('user', content, 'mobile')).catch(err => {
      console.warn('[BRIDGE-CHAT] Failed saving user chat memory:', err.message);
    });

    const telemetry = payload.device_context || (typeof getLatestTelemetry() === 'function' ? getLatestTelemetry()() : null);
    if (telemetry && typeof telemetry === 'object') {
      try {
        const presenceModel = require('../../../domain/Presence_Model');
        if (typeof presenceModel.updateFromMobileTelemetry === 'function') {
          presenceModel.updateFromMobileTelemetry(telemetry);
        }
      } catch (_) {}
    }
    const aiRouter = getAiRouter();
    const routingData = await aiRouter.routeUserMessage(routedInput, {
      conversationContext: lastConversationContext,
      source: 'mobile',
      deviceContext: telemetry || undefined,
      pendingEmailContext: pendingEmail.get(sessionKey) || null,
      pendingCalendarContext: pendingCalendar.get(sessionKey) || null,
      pendingDatabaseContext: pendingDatabase.get(sessionKey) || null,
      pendingVaultContext: pendingVault.get(sessionKey) || null
    });

    if (entry.aborted) {
      finalizeAborted(clientMsgId, entry, 'Dibatalkan oleh pengguna.');
      return;
    }

    const normIntent = String(routingData?.intent || 'NORMAL_CHAT').toUpperCase();
    entry.intent = normIntent;

    const actions = Array.isArray(routingData?.actions) && routingData.actions.length > 0
      ? routingData.actions
      : [{ intent: normIntent, extracted_data: routingData?.extracted_data || {} }];

    const executeDomainIntent = getDomainDispatcher();
    const replyParts = [];

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

    const rawReply = replyParts.length > 0
      ? replyParts.join('\n\n')
      : (routingData?.reply_message || 'Baik Tuan, pesan sudah saya terima.');

    const cleanReply = stripHtmlForMobile(rawReply);

    // N-H2: Align conversationContext keys with Router_Dispatcher.js
    lastConversationContext = {
      intent: normIntent,
      extractedData: routingData?.extracted_data || {},
      lastAssistantReply: cleanReply.slice(0, 500),
      lastUserText: content.slice(0, 300),
      updatedAt: nowFn()
    };

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
    entry.updatedAt = nowFn();

    safeSend(entry.ws, {
      type: 'CHAT_CHUNK',
      client_msg_id: clientMsgId,
      seq: entry.finalSeq,
      status: 'STREAM_FINAL',
      chunk: '',
      intent: normIntent
    });

    Promise.resolve(saveChatMemory('nexa', cleanReply.slice(0, 4000), 'mobile')).catch(err => {
      console.warn('[BRIDGE-CHAT] Failed saving assistant chat memory:', err.message);
    });
  }

  async function handleChatSend(payload, ws) {
    const clientMsgId = String(payload.client_msg_id || '').trim();
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
    const entry = {
      state: 'RUNNING',
      chunks: [],
      finalSeq: 0,
      intent: 'NORMAL_CHAT',
      error: null,
      aborted: false,
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

    try {
      await executeAndStreamChat(clientMsgId, entry, content, payload);
    } catch (err) {
      console.error('[BRIDGE-CHAT] Error processing CHAT_SEND:', err.message);
      finalizeAborted(clientMsgId, entry, `Gagal memproses pesan: ${err.message}`);
    }
  }

  async function handleChatVoiceSend(payload, ws) {
    const clientMsgId = String(payload.client_msg_id || '').trim();
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
    const entry = {
      state: 'RUNNING',
      chunks: [],
      finalSeq: 0,
      intent: 'NORMAL_CHAT',
      error: null,
      aborted: false,
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

    try {
      const voiceEngine = getVoiceEngine();
      const transcribedText = String(await voiceEngine.transcribeAudioBuffer(audioBuffer, {
        ext: validation.ext,
        mimeType: validation.mimeType
      }) || '').trim();

      if (entry.aborted) {
        finalizeAborted(clientMsgId, entry, 'Dibatalkan oleh pengguna.');
        return;
      }

      if (!transcribedText) {
        finalizeAborted(clientMsgId, entry, 'Suara terlalu pelan atau tidak terdengar jelas. Silakan rekam ulang.');
        return;
      }

      await executeAndStreamChat(clientMsgId, entry, transcribedText, payload);
    } catch (err) {
      console.error('[BRIDGE-CHAT] Error processing CHAT_VOICE_SEND:', err.message);
      finalizeAborted(clientMsgId, entry, `Gagal memproses pesan suara: ${err.message}`);
    }
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
