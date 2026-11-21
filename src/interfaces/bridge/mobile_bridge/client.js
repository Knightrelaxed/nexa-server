// ============================================================
// N.E.X.A 3.3 — MOBILE BRIDGE CLIENT (ANDROID)
// Dedicated Socket & Command Manager for Samsung Galaxy A33 5G
// ============================================================
'use strict';

const WebSocket = require('ws');
const crypto = require('crypto');
const env = require('../../../config/env');

let activeClient = null;
let latestTelemetry = null;
let telemetryListener = null;
const pendingCommands = new Map();

const ALLOWED_TELEMETRY_KEYS = [
  'type', 'battery_level', 'battery', 'charging', 'battery_charging', 'is_charging',
  'screen_on', 'is_screen_on', 'screenOn', 'screen_state',
  'network_type', 'network_strength', 'motion_state', 'geofence', 'location',
  'timestamp', 'lux', 'ambient_lux', 'light_state'
];

function sanitizeTelemetryPayload(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const clean = {};
  for (const key of ALLOWED_TELEMETRY_KEYS) {
    if (Object.prototype.hasOwnProperty.call(raw, key) && raw[key] !== undefined) {
      clean[key] = raw[key];
    }
  }
  return clean;
}

function updateLatestTelemetry(patch) {
  if (!patch || typeof patch !== 'object') return latestTelemetry;
  const nowIso = new Date().toISOString();
  latestTelemetry = {
    ...(latestTelemetry || {}),
    ...sanitizeTelemetryPayload(patch),
    updated_at: nowIso,
    received_at: (latestTelemetry && latestTelemetry.received_at) ? latestTelemetry.received_at : nowIso
  };
  return latestTelemetry;
}

function signExecuteCommand(commandId, action, timestamp, params) {
  const secret = String(env.NEXA_HMAC_SECRET || process.env.NEXA_HMAC_SECRET || '').trim();
  if (!secret) return null;
  const rawLevel = params && params.level !== undefined ? Number(params.level) : 3;
  const level = Number.isFinite(rawLevel) ? Math.trunc(rawLevel) : 3;
  // Matches Android HmacVerifier.kt v2 format: "${commandId}:${action}:${timestamp}:${level}"
  const message = `${commandId}:${action}:${timestamp}:${level}`;
  return crypto.createHmac('sha256', secret).update(message, 'utf8').digest('hex');
}

function clearPendingCommands(reason = 'Nexa Mobile Bridge disconnected') {
  if (pendingCommands.size === 0) return;
  console.warn(`[BRIDGE-MOBILE] Clearing ${pendingCommands.size} pending mobile command(s): ${reason}`);
  for (const [, { resolve, timer }] of pendingCommands.entries()) {
    clearTimeout(timer);
    resolve({ success: false, status: 'DISCONNECTED', message: reason });
  }
  pendingCommands.clear();
}

/**
 * Register or replace the active mobile client socket.
 * @param {WebSocket} ws 
 */
function setClient(ws) {
  if (activeClient && activeClient !== ws) {
    console.log('[BRIDGE-MOBILE] Replacing existing mobile client connection.');
    // M-2: Fail pending commands sent to the replaced socket immediately instead of hanging until timeout
    clearPendingCommands('Nexa Mobile Bridge socket replaced');
    try { activeClient.terminate(); } catch (_) {}
  }
  activeClient = ws;
  ws.deviceType = 'mobile';

  // Catch-up: deliver proactive messages queued while the phone was offline (coalesced on the client)
  _scheduleProactiveFlush(ws);

  // Immediately rebind active Live Voice Session and in-flight Mobile Chat stream to the new socket
  try {
    const liveVoice = require('../../../core/Live_Voice_Engine');
    liveVoice.rebindClientWs(ws);
  } catch (_) {}
  try {
    const { getMobileChatHandler } = require('./chat_handler');
    const chatHandler = getMobileChatHandler();
    if (chatHandler && typeof chatHandler.rebindClientWs === 'function') {
      chatHandler.rebindClientWs(ws);
    }
  } catch (_) {}
}

/**
 * Get the active mobile client socket.
 * @returns {WebSocket|null}
 */
function getClient() {
  return activeClient;
}

/**
 * Check if mobile device is connected and open.
 * @returns {boolean}
 */
function isConnected() {
  return activeClient !== null && activeClient.readyState === WebSocket.OPEN;
}

/**
 * Send a command to the connected mobile device.
 * @param {string} action
 * @param {object} params
 * @param {object} options
 * @returns {Promise<{ success: boolean, message: string, data: object }>}
 */
function sendCommand(action, params = {}, options = {}) {
  const timeoutMs = options.timeoutMs || 5000;

  return new Promise((resolve) => {
    if (!activeClient || activeClient.readyState !== WebSocket.OPEN) {
      console.warn(`[BRIDGE-MOBILE] Unable to send action '${action}' — Mobile Bridge OFFLINE.`);
      return resolve({ success: false, status: 'OFFLINE', message: 'N.E.X.A Mobile Bridge is offline' });
    }

    // CONCURRENCY GUARD: Do not trigger incoming call if a live voice session is already active
    if (action === 'SIMULATE_INCOMING_CALL' || action === 'incoming_call') {
      try {
        const liveVoice = require('../../../core/Live_Voice_Engine');
        const activeSession = liveVoice.getActiveSessionForClient(activeClient);
        if (activeSession && activeSession.isActive) {
          console.warn('[BRIDGE-MOBILE] ⚠️ Rejecting SIMULATE_INCOMING_CALL: Live Voice session is already active!');
          return resolve({ success: true, message: 'Call already active, ignored duplicate.' });
        }
      } catch (_) {}
    }

    const timestamp = Date.now();
    const commandId = `cmd_${timestamp}_${Math.random().toString(36).substring(2, 8)}`;

    // Phonetic Sanitization: Replace N.E.X.A or all-caps NEXA with Title Case 'Nexa' for natural Android TTS
    if (action === 'SPEAK_TEXT' && params && typeof params.text === 'string') {
      params = { ...params, text: params.text.replace(/N\.?E\.?X\.?A\.?/gi, 'Nexa') };
    }

    const payload = {
      type: 'EXECUTE_COMMAND',
      command_id: commandId,
      action: action,
      params: params,
      timestamp: timestamp
    };

    // C-4: Sign EXECUTE_COMMAND with HMAC-SHA256 when NEXA_HMAC_SECRET is configured
    const sig = signExecuteCommand(commandId, action, timestamp, params);
    if (sig) {
      payload.signature = sig;
    }

    const timer = setTimeout(() => {
      if (pendingCommands.has(commandId)) {
        pendingCommands.delete(commandId);
        resolve({ success: false, status: 'TIMEOUT', message: `Action '${action}' timed out after ${timeoutMs}ms` });
      }
    }, timeoutMs);

    pendingCommands.set(commandId, { resolve, timer });

    try {
      activeClient.send(JSON.stringify(payload));
      console.log(`[BRIDGE-MOBILE] 🚀 Sent EXECUTE_COMMAND '${action}' [${commandId}] to Mobile`);
    } catch (err) {
      clearTimeout(timer);
      pendingCommands.delete(commandId);
      console.error(`[BRIDGE-MOBILE] Send error:`, err.message);
      resolve({ success: false, status: 'ERROR', message: err.message });
    }
  });
}

/**
 * Handle incoming message payload from mobile device.
 * @param {object} payload 
 * @param {WebSocket} ws 
 */
function handleMessage(payload, ws) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return;
  // M-2: Ignore stale buffered frames from a replaced/closing socket
  if (activeClient && ws && activeClient !== ws) return;
  const pType = String(payload.type || '').toUpperCase();

  // 0. Heartbeat Ping / Pong (also accepts optional screen_on hint for NFR-BAT-01 watchdog)
  if (pType === 'PING') {
    if (typeof payload.screen_on === 'boolean') {
      updateLatestTelemetry({ screen_on: payload.screen_on, is_screen_on: payload.screen_on, screen_state: payload.screen_on ? 'ON' : 'OFF' });
    }
    try {
      ws.send(JSON.stringify({ type: 'PONG', timestamp: Date.now() }));
    } catch (_) {}
    return;
  }

  // 0.5 Hardware-Backed Device Identity, Enrollment & Ed25519 Ticket Spine (FR-AUTH-01..10)
  if (pType === 'TICKET_REQ' || pType === 'CHALLENGE_RESP' || pType === 'ENROLL_SUBMIT') {
    try {
      const { handleWsAuthMessage } = require('../../../core/auth/ws_auth_handler');
      handleWsAuthMessage(payload, ws);
    } catch (e) {
      console.error('[NEXA-AUTH] Auth WS routing error:', e.message);
    }
    return;
  }

  // 0.55 Notification "Mark as read" / chat opened on phone -> record engagement for Notifier analytics
  if (pType === 'CHAT_READ') {
    try {
      const { getNotifier } = require('../../../core/Notifier');
      Promise.resolve(getNotifier().markEngaged('NOTIF_READ')).catch(() => {});
    } catch (e) {
      console.warn('[BRIDGE-MOBILE] CHAT_READ engagement warning:', e.message);
    }
    return;
  }

  // 0.6 Native Mobile AI Chat, Voice Notes & Finance Step-Up over JSON /ws (FR-CHAT-01..19, FR-AUTH-07/08)
  if (pType === 'CHAT_SEND' || pType === 'CHAT_VOICE_SEND' || pType === 'CHAT_RESUME' || pType === 'CHAT_STOP' ||
      pType === 'ACTION_AUTH' || pType === 'ACTION_CANCEL') {
    try {
      const { getMobileChatHandler } = require('./chat_handler');
      getMobileChatHandler().handleMessage(payload, ws);
    } catch (e) {
      console.error('[BRIDGE-CHAT] Chat WS routing error:', e.message);
    }
    return;
  }

  // 1. Tool Call / Command Result
  if (payload.type === 'tool_result' || payload.type === 'COMMAND_RESULT') {
    const cmdId = payload.id || payload.command_id;
    const statusIcon = (payload.success || payload.status === 'SUCCESS') ? '✅' : '❌';
    console.log(`[BRIDGE-MOBILE] ${statusIcon} Tool Result [${cmdId}]: ${payload.message || 'Done'}`);

    if (cmdId && pendingCommands.has(cmdId)) {
      const { resolve, timer } = pendingCommands.get(cmdId);
      clearTimeout(timer);
      pendingCommands.delete(cmdId);
      resolve({
        success: payload.success ?? payload.status === 'SUCCESS',
        message: payload.message || '',
        data: payload.data || payload.result || {}
      });
    }
    return;
  }

  // 2. Telemetry Event Stream (whitelisted fields only, L-4 / R-02)
  if (pType === 'TELEMETRY' || pType === 'TELEMETRY_REPORT') {
    const cleanTel = sanitizeTelemetryPayload(payload);
    const nowIso = new Date().toISOString();
    latestTelemetry = {
      ...(latestTelemetry || {}),
      ...cleanTel,
      received_at: nowIso,
      updated_at: nowIso
    };
    if (typeof telemetryListener === 'function') {
      telemetryListener(latestTelemetry);
    }
    return;
  }

  // 3. High-Level Context Update
  if (payload.type === 'CONTEXT_UPDATE') {
    try {
      const adapter = require('./adapter');
      adapter.handleIncomingContextUpdate(payload);
    } catch (e) {
      console.error('[BRIDGE-MOBILE] Context routing error:', e.message);
    }
    return;
  }

  // 4. Call Interaction Event
  if (payload.type === 'CALL_EVENT') {
    try {
      const adapter = require('./adapter');
      adapter.handleIncomingCallEvent(payload, ws);
    } catch (e) {
      console.error('[BRIDGE-MOBILE] Call event routing error:', e.message);
    }
    return;
  }

  // 4.1 Continuous Live Audio Stream (Gemini Multimodal Live API Relay)
  if (payload.type === 'CALL_AUDIO_STREAM' || payload.type === 'AUDIO_STREAM') {
    try {
      const liveVoice = require('../../../core/Live_Voice_Engine');
      const sid = payload.command_id || payload.sessionId;
      let activeSession = null;
      if (sid) {
        activeSession = liveVoice.getLiveSession(sid);
        if (activeSession && activeSession.clientWs !== ws && activeSession.isActive) {
          liveVoice.rebindClientWs(ws);
        }
      }
      if (!activeSession) {
        activeSession = liveVoice.getActiveSessionForClient(ws);
      }
      if (activeSession && activeSession.isActive) {
        const pcmData = payload.pcm_chunk || payload.pcm || payload.data;
        if (pcmData) {
          activeSession.handleIncomingClientAudio(pcmData);
        }
      } else {
        if (!ws._lastNoSessionWarn || Date.now() - ws._lastNoSessionWarn > 5000) {
          ws._lastNoSessionWarn = Date.now();
          console.warn('[BRIDGE-MOBILE] Audio stream received but no active LiveVoiceSession found for client');
        }
      }
    } catch (e) {
      console.error('[BRIDGE-MOBILE] Audio stream relay error:', e.message);
    }
    return;
  }

  // 4.2 Continuous Live Video Frame Stream (Camera -> Google Gemini Multimodal)
  if (payload.type === 'CALL_VIDEO_FRAME' || payload.type === 'VIDEO_STREAM') {
    try {
      const liveVoice = require('../../../core/Live_Voice_Engine');
      const sid = payload.command_id || payload.sessionId;
      let activeSession = null;
      if (sid) {
        activeSession = liveVoice.getLiveSession(sid);
        if (activeSession && activeSession.clientWs !== ws && activeSession.isActive) {
          liveVoice.rebindClientWs(ws);
        }
      }
      if (!activeSession) {
        activeSession = liveVoice.getActiveSessionForClient(ws);
      }
      if (activeSession && activeSession.isActive) {
        const imageChunk = payload.image_chunk || payload.data;
        if (imageChunk) {
          activeSession.handleIncomingClientVideoFrame(imageChunk);
        }
      } else {
        if (!ws._lastNoVideoSessionWarn || Date.now() - ws._lastNoVideoSessionWarn > 5000) {
          ws._lastNoVideoSessionWarn = Date.now();
          console.warn('[BRIDGE-MOBILE] ⚠️ CALL_VIDEO_FRAME received but no active LiveVoiceSession found for client');
        }
      }
    } catch (e) {
      console.error('[BRIDGE-MOBILE] Video frame relay error:', e.message);
    }
    return;
  }

  // 4.3 Tactile Touch / Somatosensory Feedback
  if (payload.type === 'CALL_TACTILE_EVENT') {
    try {
      const liveVoice = require('../../../core/Live_Voice_Engine');
      const sid = payload.command_id || payload.sessionId;
      let activeSession = sid ? liveVoice.getLiveSession(sid) : null;
      if (!activeSession) {
        activeSession = liveVoice.getActiveSessionForClient(ws);
      }
      if (activeSession && activeSession.isActive) {
        activeSession.handleIncomingTactileEvent(payload);
      }
    } catch (e) {
      console.error('[BRIDGE-MOBILE] Tactile event routing error:', e.message);
    }
    return;
  }

  // 5. App Usage Telemetry
  if (payload.type === 'APP_USAGE_TELEMETRY' || payload.type === 'app_usage') {
    if (latestTelemetry) {
      latestTelemetry.updated_at = new Date().toISOString();
    }
    try {
      const appDiscipline = require('../../../domain/App_Discipline_Engine');
      appDiscipline.evaluateAppUsage(payload).catch((err) => {
        console.warn('[BRIDGE-MOBILE] App discipline evaluation error:', err.message);
      });
    } catch (e) {
      console.error('[BRIDGE-MOBILE] App usage routing error:', e.message);
    }
    return;
  }

  // 6. Device Context Events (Alarm, Screen)
  if (pType === 'ALARM_DISMISSED' || pType === 'ALARM_FIRED') {
    try {
      const adapter = require('./adapter');
      adapter.handleIncomingContextUpdate({ event: pType, ...payload });
    } catch (e) {
      console.error('[BRIDGE-MOBILE] Alarm context routing error:', e.message);
    }
    return;
  }

  if (pType === 'SCREEN_ON' || pType === 'SCREEN_OFF') {
    const isOn = (pType === 'SCREEN_ON');
    updateLatestTelemetry({
      screen_on: isOn,
      is_screen_on: isOn,
      screen_state: isOn ? 'ON' : 'OFF'
    });
    try {
      const presenceModel = require('../../../domain/Presence_Model');
      presenceModel.isScreenOn = isOn;
      const adapter = require('./adapter');
      adapter.handleIncomingContextUpdate({ event: pType, screen_on: isOn, ...payload });
    } catch (e) {
      console.error('[BRIDGE-MOBILE] Screen event routing error:', e.message);
    }
    return;
  }

  const SILENT_ACK_TYPES = new Set([
    'NOTIFICATION_RECEIVED', 'NOTIFICATION_EVENT',
    'BATTERY_LOW', 'BATTERY_OK', 'CHARGING', 'UNPLUGGED',
    'HEADSET_PLUGGED', 'HEADSET_UNPLUGGED'
  ]);
  if (SILENT_ACK_TYPES.has(pType)) {
    if (latestTelemetry) {
      latestTelemetry[`last_${pType.toLowerCase()}`] = new Date().toISOString();
    }
    return;
  }
}

/**
 * Proactive message delivery with bounded offline catch-up queue (N-01 / UC5).
 * - Connected: sent immediately as CHAT_PROACTIVE.
 * - Offline (Doze / network handoff): queued (max 30, TTL 24h, dedupe by client_msg_id) and flushed on reconnect.
 */
const PROACTIVE_QUEUE_MAX = 30;
const PROACTIVE_QUEUE_TTL_MS = 24 * 3600_000;
const PROACTIVE_FLUSH_DELAY_MS = 800;
let pendingProactive = [];
let proactiveFlushTimer = null;

function _proactiveQueuePath() {
  if (process.env.NEXA_PROACTIVE_QUEUE_PATH) return process.env.NEXA_PROACTIVE_QUEUE_PATH;
  if (process.env.NODE_ENV === 'production') {
    return require('path').join(process.cwd(), 'data', 'pending_mobile_proactive.json');
  }
  return null; // persistence disabled in dev/test unless explicitly configured
}

function _persistProactiveQueue() {
  const file = _proactiveQueuePath();
  if (!file) return;
  try {
    const fs = require('fs');
    const tmp = `${file}.tmp.${process.pid}`;
    fs.mkdirSync(require('path').dirname(file), { recursive: true });
    fs.writeFileSync(tmp, JSON.stringify(pendingProactive), { mode: 0o600 });
    fs.renameSync(tmp, file);
  } catch (err) {
    console.warn('[BRIDGE-MOBILE] Failed persisting proactive queue:', err.message);
  }
}

function _loadProactiveQueue() {
  const file = _proactiveQueuePath();
  if (!file) return;
  try {
    const fs = require('fs');
    if (!fs.existsSync(file)) return;
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (Array.isArray(parsed)) {
      const now = Date.now();
      pendingProactive = parsed
        .filter(m => m && typeof m.client_msg_id === 'string' && typeof m.content === 'string' && now - Number(m.ts || 0) < PROACTIVE_QUEUE_TTL_MS)
        .slice(-PROACTIVE_QUEUE_MAX);
    }
  } catch (err) {
    console.warn('[BRIDGE-MOBILE] Failed loading proactive queue (starting empty):', err.message);
    pendingProactive = [];
  }
}

function _prunePendingProactive() {
  const now = Date.now();
  pendingProactive = pendingProactive.filter(m => now - m.ts < PROACTIVE_QUEUE_TTL_MS);
  while (pendingProactive.length > PROACTIVE_QUEUE_MAX) pendingProactive.shift();
}

function _sendProactiveFrame(frame) {
  if (!activeClient || activeClient.readyState !== WebSocket.OPEN) return false;
  try {
    activeClient.send(JSON.stringify(frame));
    return true;
  } catch (err) {
    console.warn('[BRIDGE-MOBILE] Failed pushing CHAT_PROACTIVE:', err.message);
    return false;
  }
}

/**
 * Push a proactive N.E.X.A message to the phone, queueing it while offline.
 * @param {{ text: string, kind?: string, priority?: string, clientMsgId?: string }} msg
 * @returns {{ status: 'SENT'|'QUEUED'|'DROPPED', id: string }}
 */
function sendProactiveMessage({ text, kind = 'PROACTIVE', priority = 'P1', clientMsgId = '' }) {
  const cleanText = String(text || '').trim();
  const id = clientMsgId || `proactive_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
  if (!cleanText) return { status: 'DROPPED', id };

  const frame = {
    type: 'CHAT_PROACTIVE',
    client_msg_id: id,
    kind: String(kind || 'PROACTIVE'),
    priority: String(priority || 'P1'),
    content: cleanText.slice(0, 4000),
    ts: Date.now()
  };

  if (_sendProactiveFrame(frame)) return { status: 'SENT', id };

  _prunePendingProactive();
  if (!pendingProactive.some(m => m.client_msg_id === id)) {
    pendingProactive.push(frame);
    _prunePendingProactive();
    _persistProactiveQueue();
  }
  return { status: 'QUEUED', id };
}

function isProactivePending(clientMsgId) {
  return pendingProactive.some(m => m.client_msg_id === clientMsgId);
}

/** Remove a queued proactive message (e.g. already delivered via Telegram fallback). */
function dropPendingProactive(clientMsgId) {
  const before = pendingProactive.length;
  pendingProactive = pendingProactive.filter(m => m.client_msg_id !== clientMsgId);
  if (pendingProactive.length !== before) _persistProactiveQueue();
  return before !== pendingProactive.length;
}

function getPendingProactiveCount() {
  return pendingProactive.length;
}

function _scheduleProactiveFlush(ws) {
  if (proactiveFlushTimer) clearTimeout(proactiveFlushTimer);
  if (pendingProactive.length === 0) return;
  proactiveFlushTimer = setTimeout(() => {
    proactiveFlushTimer = null;
    if (activeClient !== ws || !activeClient || activeClient.readyState !== WebSocket.OPEN) return;
    _prunePendingProactive();
    const batch = pendingProactive.slice();
    let delivered = 0;
    for (const frame of batch) {
      if (_sendProactiveFrame({ ...frame, caught_up: true })) {
        delivered += 1;
        pendingProactive = pendingProactive.filter(m => m.client_msg_id !== frame.client_msg_id);
      } else {
        break;
      }
    }
    if (delivered > 0) {
      console.log(`[BRIDGE-MOBILE] Flushed ${delivered} queued proactive message(s) after reconnect.`);
      _persistProactiveQueue();
    }
  }, PROACTIVE_FLUSH_DELAY_MS);
  if (typeof proactiveFlushTimer.unref === 'function') proactiveFlushTimer.unref();
}

_loadProactiveQueue();

/**
 * Handle mobile socket disconnect.
 * @param {WebSocket} ws 
 */
function handleDisconnect(ws) {
  // Grace-period handling: allow transient disconnects (screen rotate / network handoff) without aborting live session
  try {
    const liveVoice = require('../../../core/Live_Voice_Engine');
    liveVoice.handleClientDisconnect(ws, 15000);
  } catch (err) {
    console.warn('[BRIDGE-MOBILE] Live voice disconnect handler warning:', err.message);
  }

  if (activeClient === ws) {
    activeClient = null;
    latestTelemetry = null;
    console.log('[BRIDGE-MOBILE] Active mobile client unregistered.');
    clearPendingCommands('Nexa Mobile Bridge disconnected');
  }
}

function setOnTelemetryListener(callback) {
  telemetryListener = callback;
}

function getLatestTelemetry() {
  return latestTelemetry;
}

function requestOverlay(title, message, buttons = [], timeoutMs = 15000) {
  return sendCommand('notification.show', {
    title,
    message,
    overlay: true,
    buttons,
    timeout: timeoutMs
  }, { timeoutMs });
}

module.exports = {
  setClient,
  getClient,
  isConnected,
  sendCommand,
  sendProactiveMessage,
  isProactivePending,
  dropPendingProactive,
  getPendingProactiveCount,
  signExecuteCommand,
  handleMessage,
  handleDisconnect,
  setOnTelemetryListener,
  getLatestTelemetry,
  updateLatestTelemetry,
  requestOverlay
};
