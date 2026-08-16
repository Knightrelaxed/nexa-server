// ============================================================
// N.E.X.A 3.0 — MOBILE BRIDGE WEBSOCKET SERVER
// Clean, Production-Grade Realtime Device Gateway for Nexa Bridge Android App.
// Protocol: Nexa Protocol v3.0 (Strict Zero-Dirty Code Standard)
// ============================================================
'use strict';

const WebSocket = require('ws');
const crypto = require('crypto');
const env = require('../../config/env');

let wss = null;
let activeClient = null; // Single-device connection (Samsung Galaxy A33 5G)
let latestTelemetry = null;
let heartbeatInterval = null;

// Map tracking active async command promises: commandId -> { resolve, timer }
const pendingCommands = new Map();
let telemetryListener = null;

/**
 * Initialize WebSocket Server, mounted directly on Express http.Server instance.
 * @param {import('http').Server} server 
 */
function initWebSocket(server) {
  wss = new WebSocket.Server({ server, path: '/ws' });

  // Active Keepalive Watchdog (Runs every 25 seconds to prevent NAT / Proxy timeout)
  if (!heartbeatInterval) {
    heartbeatInterval = setInterval(() => {
      if (!wss) return;
      wss.clients.forEach((ws) => {
        if (ws.isAlive === false) {
          console.warn('[NEXA-BRIDGE-WS] ⚠️ Dead socket detected by watchdog (No Pong). Terminating...');
          if (activeClient === ws) {
            activeClient = null;
          }
          return ws.terminate();
        }
        ws.isAlive = false;
        try {
          ws.ping();
        } catch (_) {}
      });
    }, 25000);
  }

  wss.on('connection', (ws, req) => {
    ws.isAlive = true;
    ws.on('pong', () => {
      ws.isAlive = true;
    });

    // 1. Handshake Authentication (Bearer Token with constant-time equality)
    const authHeader = req.headers.authorization;
    const configuredSecret = String(env.NEXA_DEVICE_SECRET || env.NEXA_GODMODE_SECRET || '').trim();

    let isAuthorized = false;
    if (authHeader && authHeader.startsWith('Bearer ') && configuredSecret.length > 0) {
      const token = authHeader.slice('Bearer '.length).trim();
      const aBuf = Buffer.from(token, 'utf8');
      const bBuf = Buffer.from(configuredSecret, 'utf8');
      if (aBuf.length === bBuf.length && crypto.timingSafeEqual(aBuf, bBuf)) {
        isAuthorized = true;
      }
    }

    if (!isAuthorized) {
      console.warn('[NEXA-BRIDGE-WS] ⚠️ Unauthorized handshake attempt rejected.');
      ws.close(4001, 'Unauthorized');
      return;
    }

    console.log('[NEXA-BRIDGE-WS] 📱 Nexa Bridge Android connected successfully.');

    // 2. Single-Device Connection Binding (Instantly terminate old socket if reconnected)
    if (activeClient && activeClient !== ws) {
      console.log('[NEXA-BRIDGE-WS] Replacing existing client connection (instant termination).');
      try { activeClient.terminate(); } catch (_) {}
    }
    activeClient = ws;

    // 3. Message Listener (Nexa Protocol 3.0)
    ws.on('message', (rawMessage) => {
      try {
        const payload = JSON.parse(rawMessage);

        // A. Heartbeat Ping / Pong
        if (payload.type === 'PING' || payload.type === 'ping') {
          ws.send(JSON.stringify({ type: 'PONG', timestamp: Date.now() }));
          return;
        }

        // B. Telemetry Event Stream
        if (payload.type === 'telemetry' || payload.type === 'TELEMETRY_REPORT') {
          latestTelemetry = {
            ...payload,
            received_at: new Date().toISOString()
          };
          if (typeof telemetryListener === 'function') {
            telemetryListener(latestTelemetry);
          }
          return;
        }

        // C. Tool Call Result
        if (payload.type === 'tool_result' || payload.type === 'COMMAND_RESULT') {
          const cmdId = payload.id || payload.command_id;
          const statusIcon = (payload.success || payload.status === 'SUCCESS') ? '✅' : '❌';
          console.log(`[NEXA-BRIDGE-WS] ${statusIcon} Tool Result [${cmdId}]: ${payload.message || 'Done'}`);

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

        // D. High-Level Context Update (Sensor / Geofence / Routine Engine)
        if (payload.type === 'CONTEXT_UPDATE') {
          try {
            const adapter = require('./adapter');
            adapter.handleIncomingContextUpdate(payload);
          } catch (e) {
            console.error('[NEXA-BRIDGE-WS] Context routing error:', e.message);
          }
          return;
        }

        // E. Call Interaction Event (FakeCallActivity v2.0)
        if (payload.type === 'CALL_EVENT') {
          try {
            const adapter = require('./adapter');
            adapter.handleIncomingCallEvent(payload);
          } catch (e) {
            console.error('[NEXA-BRIDGE-WS] Call event routing error:', e.message);
          }
          return;
        }

        console.log('[NEXA-BRIDGE-WS] Unhandled payload type:', payload.type);
      } catch (err) {
        console.error('[NEXA-BRIDGE-WS] Failed to parse incoming JSON:', err.message);
      }
    });

    // 4. Socket Disconnect & Safety Cleanup
    ws.on('close', (code, reason) => {
      console.log(`[NEXA-BRIDGE-WS] Client disconnected: ${code} - ${reason}`);
      if (activeClient === ws) {
        activeClient = null;
      }
      // Purge all pending command promises so event loop never deadlocks
      if (pendingCommands.size > 0) {
        console.warn(`[NEXA-BRIDGE-WS] ⚠️ Clearing ${pendingCommands.size} pending command(s) on disconnect.`);
        for (const [cmdId, { resolve, timer }] of pendingCommands.entries()) {
          clearTimeout(timer);
          resolve({ success: false, status: 'DISCONNECTED', message: 'Nexa Bridge disconnected' });
        }
        pendingCommands.clear();
      }
    });

    ws.on('error', (err) => {
      console.error('[NEXA-BRIDGE-WS] Socket error:', err.message);
    });
  });
}

/**
 * Send a tool call command to the connected Nexa Bridge Android App.
 * Returns a Promise that resolves when Nexa Bridge returns a tool_result or times out.
 * 
 * @param {string} tool - Tool name (e.g. 'flashlight.on', 'volume.set', 'notification.show')
 * @param {object} args - Tool arguments object
 * @param {object} options - Options: { timeoutMs: 5000 }
 * @returns {Promise<{ success: boolean, message: string, data: object }>}
 */
function sendCommand(action, params = {}, options = {}) {
  const timeoutMs = options.timeoutMs || 5000;

  return new Promise((resolve) => {
    if (!activeClient || activeClient.readyState !== WebSocket.OPEN) {
      console.warn(`[NEXA-BRIDGE-WS] Unable to send action '${action}' — Nexa Bridge OFFLINE.`);
      return resolve({ success: false, status: 'OFFLINE', message: 'Nexa Bridge is offline' });
    }

    const timestamp = Date.now();
    const commandId = `cmd_${timestamp}_${Math.random().toString(36).substring(2, 8)}`;

    // Phonetic Sanitization: Replace N.E.X.A with NEXA so Android TTS speaks "Nexa" naturally (not "en-e-ex-a")
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
      console.log(`[NEXA-BRIDGE-WS] 🚀 Sent EXECUTE_COMMAND '${action}' [${commandId}]`);
    } catch (err) {
      clearTimeout(timer);
      pendingCommands.delete(commandId);
      console.error(`[NEXA-BRIDGE-WS] Send error:`, err.message);
      resolve({ success: false, status: 'ERROR', message: err.message });
    }
  });
}

/**
 * Register a telemetry update listener callback.
 */
function setOnTelemetryListener(callback) {
  telemetryListener = callback;
}

/**
 * Get the latest telemetry state reported by Nexa Bridge.
 */
function getLatestTelemetry() {
  return latestTelemetry;
}

/**
 * Helper to request a System Overlay Screen or Heads-Up Notification Dialog.
 */
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
  initWebSocket,
  sendCommand,
  setOnTelemetryListener,
  getLatestTelemetry,
  requestOverlay
};
