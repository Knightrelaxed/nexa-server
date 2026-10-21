// ============================================================
// N.E.X.A 3.3 — WINDOWS BRIDGE CLIENT (DESKTOP)
// Dedicated Socket & Command Manager for Lenovo ThinkPad X380 Yoga
// ============================================================
'use strict';

const WebSocket = require('ws');

let activeClient = null;
let latestTelemetry = null;
let telemetryListener = null;
const pendingCommands = new Map();

/**
 * Register or replace the active desktop client socket.
 * @param {WebSocket} ws 
 */
function setClient(ws) {
  if (activeClient && activeClient !== ws) {
    console.log('[BRIDGE-WINDOWS] Replacing existing Windows desktop client connection.');
    try { activeClient.terminate(); } catch (_) {}
  }
  activeClient = ws;
  ws.deviceType = 'desktop';

  // Immediately rebind active Live Voice Session to the new socket connection
  try {
    const liveVoice = require('../../../core/Live_Voice_Engine');
    liveVoice.rebindClientWs(ws);

    // If there is no active live session for this desktop socket, start a new Live Voice Session!
    let activeSession = liveVoice.getActiveSessionForClient(ws);
    if (!activeSession || !activeSession.isActive) {
      const sessionId = `DESKTOP_${Date.now()}`;
      console.log(`[BRIDGE-WINDOWS] ⚡ Auto-starting Gemini Live Voice Session for Windows Bridge [${sessionId}]`);
      liveVoice.startLiveSession(sessionId, ws);
    }
  } catch (err) {
    console.error('[BRIDGE-WINDOWS] Live voice initialization error:', err.message);
  }
}

/**
 * Get active desktop client socket.
 * @returns {WebSocket|null}
 */
function getClient() {
  return activeClient;
}

/**
 * Check if desktop device is connected and open.
 * @returns {boolean}
 */
function isConnected() {
  return activeClient !== null && activeClient.readyState === WebSocket.OPEN;
}

/**
 * Send a command to the connected Windows desktop companion.
 * @param {string} action - Action name (e.g. DESKTOP_CLICK, HIGHLIGHT_ELEMENT)
 * @param {object} params - Action parameters
 * @param {object} options - Options (timeoutMs)
 * @returns {Promise<{ success: boolean, message: string, data: object }>}
 */
function sendCommand(action, params = {}, options = {}) {
  const timeoutMs = options.timeoutMs || 5000;

  return new Promise((resolve) => {
    if (!activeClient || activeClient.readyState !== WebSocket.OPEN) {
      console.warn(`[BRIDGE-WINDOWS] Unable to send action '${action}' — Desktop Bridge OFFLINE.`);
      return resolve({ success: false, status: 'OFFLINE', message: 'N.E.X.A Desktop Bridge is offline' });
    }

    const timestamp = Date.now();
    const commandId = `win_${timestamp}_${Math.random().toString(36).substring(2, 8)}`;

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
        resolve({ success: false, status: 'TIMEOUT', message: `Desktop action '${action}' timed out after ${timeoutMs}ms` });
      }
    }, timeoutMs);

    pendingCommands.set(commandId, { resolve, timer });

    try {
      activeClient.send(JSON.stringify(payload));
      console.log(`[BRIDGE-WINDOWS] 🚀 Sent EXECUTE_COMMAND '${action}' [${commandId}] to Windows`);
    } catch (err) {
      clearTimeout(timer);
      pendingCommands.delete(commandId);
      console.error(`[BRIDGE-WINDOWS] Send error:`, err.message);
      resolve({ success: false, status: 'ERROR', message: err.message });
    }
  });
}

/**
 * Handle incoming message payload from Windows bridge.
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
    console.log(`[BRIDGE-WINDOWS] ${statusIcon} Tool Result [${cmdId}]: ${payload.message || 'Done'}`);

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

  // 1.5 Call Event Handling (CALL_ACCEPTED / CALL_FINISHED / START_SESSION / END_SESSION)
  if (pType === 'CALL_EVENT') {
    try {
      const liveVoice = require('../../../core/Live_Voice_Engine');
      const eventName = String(payload.event || '').toUpperCase();
      if (eventName === 'CALL_ACCEPTED' || eventName === 'START_SESSION') {
        let activeSession = liveVoice.getActiveSessionForClient(ws);
        if (!activeSession || !activeSession.isActive) {
          const sessionId = payload.command_id || `DESKTOP_${Date.now()}`;
          console.log(`[BRIDGE-WINDOWS] ⚡ Starting Gemini Live Voice Session on CALL_ACCEPTED [${sessionId}]`);
          liveVoice.startLiveSession(sessionId, ws);
        }
      } else if (eventName === 'CALL_FINISHED' || eventName === 'CALL_REJECTED' || eventName === 'END_SESSION') {
        const sid = payload.command_id || '';
        if (sid) {
          liveVoice.closeLiveSession(sid);
        }
        const session = liveVoice.getActiveSessionForClient(ws);
        if (session) session.close();
      }
    } catch (e) {
      console.error('[BRIDGE-WINDOWS] Call event processing error:', e.message);
    }
    return;
  }

  // 1.6 User Barge-In / Interruption Signal from Desktop
  if (pType === 'CALL_AUDIO_INTERRUPTED' || pType === 'INTERRUPT') {
    try {
      const liveVoice = require('../../../core/Live_Voice_Engine');
      const activeSession = liveVoice.getActiveSessionForClient(ws);
      if (activeSession && activeSession.isActive) {
        if (typeof activeSession.handleClientInterrupt === 'function') {
          activeSession.handleClientInterrupt();
        }
      }
    } catch (e) {
      console.error('[BRIDGE-WINDOWS] Barge-in dispatch error:', e.message);
    }
    return;
  }

  // 2. Realtime Continuous Audio Stream (WASAPI Duplex Audio -> Gemini Live API)
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
      if (!activeSession) {
        const autoSid = sid || `DESKTOP_LAZY_${Date.now()}`;
        console.log(`[BRIDGE-WINDOWS] ⚡ Auto-starting Gemini Live Voice Session on audio stream [${autoSid}]`);
        activeSession = liveVoice.startLiveSession(autoSid, ws);
      }
      if (activeSession && activeSession.isActive) {
        const pcmData = payload.pcm_chunk || payload.pcm || payload.data;
        if (pcmData) {
          activeSession.handleIncomingClientAudio(pcmData);
        }
      } else {
        if (!ws._lastNoSessionWarn || Date.now() - ws._lastNoSessionWarn > 5000) {
          ws._lastNoSessionWarn = Date.now();
          console.warn('[BRIDGE-WINDOWS] Audio stream received but no active LiveVoiceSession found for desktop client');
        }
      }
    } catch (e) {
      console.error('[BRIDGE-WINDOWS] Audio stream relay error:', e.message);
    }
    return;
  }

  // 3. Realtime Continuous Screen Sharing Frames (Direct3D 11 Capture -> Gemini Live API)
  if (payload.type === 'CALL_VIDEO_FRAME' || payload.type === 'DESKTOP_FRAME' || payload.type === 'VIDEO_STREAM') {
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
        const frameData = payload.image_chunk || payload.frame_base64 || payload.data;
        if (frameData) {
          activeSession.handleIncomingClientVideoFrame(frameData);
        }
      }
    } catch (err) {
      console.error('[BRIDGE-WINDOWS] Video frame dispatch error:', err.message);
    }
    return;
  }

  // 4. Desktop Telemetry & System Metrics
  if (pType === 'DESKTOP_TELEMETRY' || pType === 'SYSTEM_METRICS' || pType === 'TELEMETRY') {
    latestTelemetry = {
      ...payload,
      received_at: new Date().toISOString()
    };
    if (typeof telemetryListener === 'function') {
      telemetryListener(latestTelemetry);
    }
    return;
  }

  // 5. Power & Window Events
  if (pType === 'POWER_EVENT') {
    console.log(`[BRIDGE-WINDOWS] ⚡ Power Event Received:`, payload.event || payload);
    return;
  }
}

/**
 * Handle Windows socket disconnect.
 * @param {WebSocket} ws 
 */
function handleDisconnect(ws) {
  // Grace-period handling: allow transient disconnects without destroying active live session
  try {
    const liveVoice = require('../../../core/Live_Voice_Engine');
    liveVoice.handleClientDisconnect(ws, 15000);
  } catch (err) {
    console.warn('[BRIDGE-WINDOWS] Live voice disconnect handler warning:', err.message);
  }

  if (activeClient === ws) {
    activeClient = null;
    console.log('[BRIDGE-WINDOWS] Active Windows desktop client unregistered.');

    if (pendingCommands.size > 0) {
      console.warn(`[BRIDGE-WINDOWS] ⚠️ Clearing ${pendingCommands.size} pending desktop command(s) on disconnect.`);
      for (const [cmdId, { resolve, timer }] of pendingCommands.entries()) {
        clearTimeout(timer);
        resolve({ success: false, status: 'DISCONNECTED', message: 'Nexa Windows Bridge disconnected' });
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

module.exports = {
  setClient,
  getClient,
  isConnected,
  sendCommand,
  handleMessage,
  handleDisconnect,
  setOnTelemetryListener,
  getLatestTelemetry
};
