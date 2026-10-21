// ============================================================
// N.E.X.A 3.3 — MOBILE BRIDGE CLIENT (ANDROID)
// Dedicated Socket & Command Manager for Samsung Galaxy A33 5G
// ============================================================
'use strict';

const WebSocket = require('ws');

let activeClient = null;
let latestTelemetry = null;
let telemetryListener = null;
const pendingCommands = new Map();

/**
 * Register or replace the active mobile client socket.
 * @param {WebSocket} ws 
 */
function setClient(ws) {
  if (activeClient && activeClient !== ws) {
    console.log('[BRIDGE-MOBILE] Replacing existing mobile client connection.');
    try { activeClient.terminate(); } catch (_) {}
  }
  activeClient = ws;
  ws.deviceType = 'mobile';

  // Immediately rebind active Live Voice Session to the new socket connection
  try {
    const liveVoice = require('../../../core/Live_Voice_Engine');
    liveVoice.rebindClientWs(ws);
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

    // Phonetic Sanitization: Replace N.E.X.A with NEXA for Android TTS
    if (action === 'SPEAK_TEXT' && params && typeof params.text === 'string') {
      params = { ...params, text: params.text.replace(/N\.E\.X\.A\.?/gi, 'NEXA') };
    }

    const payload = {
      type: 'EXECUTE_COMMAND',
      command_id: commandId,
      action: action,
      params: params,
      timestamp: timestamp
    };

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
  const pType = String(payload.type || '').toUpperCase();

  // 0. Heartbeat Ping / Pong
  if (pType === 'PING') {
    try {
      ws.send(JSON.stringify({ type: 'PONG', timestamp: Date.now() }));
    } catch (_) {}
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

  // 2. Telemetry Event Stream
  if (pType === 'TELEMETRY' || pType === 'TELEMETRY_REPORT') {
    latestTelemetry = {
      ...payload,
      received_at: new Date().toISOString()
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
    if (latestTelemetry) {
      latestTelemetry.screen_on = isOn;
      latestTelemetry.is_screen_on = isOn;
      latestTelemetry.screen_state = isOn ? 'ON' : 'OFF';
      latestTelemetry.updated_at = new Date().toISOString();
    }
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
    console.log('[BRIDGE-MOBILE] Active mobile client unregistered.');

    if (pendingCommands.size > 0) {
      console.warn(`[BRIDGE-MOBILE] ⚠️ Clearing ${pendingCommands.size} pending mobile command(s) on disconnect.`);
      for (const [cmdId, { resolve, timer }] of pendingCommands.entries()) {
        clearTimeout(timer);
        resolve({ success: false, status: 'DISCONNECTED', message: 'Nexa Mobile Bridge disconnected' });
      }
      pendingCommands.clear();
    }
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
  handleMessage,
  handleDisconnect,
  setOnTelemetryListener,
  getLatestTelemetry,
  requestOverlay
};
