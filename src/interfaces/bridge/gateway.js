// ============================================================
// N.E.X.A 3.3 — UNIFIED BRIDGE GATEWAY
// Centralized /ws WebSocket Server & Device Multiplexer
// Dispatches sockets between Mobile (Android) and Windows (Desktop)
// ============================================================
'use strict';

const WebSocket = require('ws');
const crypto = require('crypto');
const env = require('../../config/env');
const mobileClient = require('./mobile_bridge/client');
const windowsClient = require('./windows_bridge/client');

let wss = null;
let heartbeatInterval = null;

/**
 * Determine device type from handshake request.
 * @param {import('http').IncomingMessage} req 
 * @returns {'desktop'|'mobile'}
 */
function resolveDeviceType(req) {
  const headerDev = String(req && req.headers ? (req.headers['x-device-type'] || '') : '').toLowerCase().trim();
  let queryDev = '';
  try {
    const url = new URL(req.url, 'http://localhost');
    queryDev = String(url.searchParams.get('device_type') || url.searchParams.get('device') || '').toLowerCase().trim();
  } catch (_) {}

  const rawDev = `${headerDev} ${queryDev}`;
  if (rawDev.includes('windows') || rawDev.includes('desktop') || rawDev.includes('thinkpad')) {
    return 'desktop';
  }
  return 'mobile';
}

/**
 * Initialize WebSocket Server mounted directly on Express http.Server instance.
 * @param {import('http').Server} server 
 */
function initWebSocket(server) {
  const configuredSecret = String(env.NEXA_DEVICE_SECRET || env.NEXA_BRIDGE_SECRET || '').trim();

  wss = new WebSocket.Server({
    server,
    path: '/ws',
    maxPayload: 1024 * 1024, // 1MB payload ceiling (Security Harden)
    verifyClient: (info, cb) => {
      // Handshake Authentication at HTTP Upgrade stage
      const authHeader = info.req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ') || !configuredSecret) {
        console.warn('[BRIDGE-GATEWAY] ⚠️ Unauthorized handshake attempt rejected at HTTP upgrade.');
        return cb(false, 401, 'Unauthorized');
      }

      const token = authHeader.slice('Bearer '.length).trim();
      const aBuf = Buffer.from(token, 'utf8');
      const bBuf = Buffer.from(configuredSecret, 'utf8');
      if (aBuf.length !== bBuf.length || !crypto.timingSafeEqual(aBuf, bBuf)) {
        console.warn('[BRIDGE-GATEWAY] ⚠️ Forbidden handshake attempt (token mismatch).');
        return cb(false, 403, 'Forbidden');
      }

      cb(true);
    }
  });

  // Active Keepalive Watchdog (Runs every 25 seconds to prevent NAT / Proxy timeout)
  if (!heartbeatInterval) {
    heartbeatInterval = setInterval(() => {
      if (!wss) return;
      wss.clients.forEach((ws) => {
        if (ws.isAlive === false) {
          console.warn(`[BRIDGE-GATEWAY] ⚠️ Dead socket detected on ${ws.deviceType || 'unknown'} by watchdog (No Pong). Terminating...`);
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

    const deviceType = resolveDeviceType(req);
    ws.deviceType = deviceType;

    const deviceIcon = (deviceType === 'desktop') ? '💻' : '📱';
    const deviceLabel = (deviceType === 'desktop') ? 'Windows Bridge (ThinkPad)' : 'Nexa Bridge Android';
    console.log(`[BRIDGE-GATEWAY] ${deviceIcon} ${deviceLabel} connected successfully (authenticated via verifyClient).`);

    // Register into device-specific client manager
    if (deviceType === 'desktop') {
      windowsClient.setClient(ws);
    } else {
      mobileClient.setClient(ws);
    }

    // Message routing
    ws.on('message', (data, isBinary) => {
      ws.isAlive = true; // Mark socket alive on every incoming packet (audio chunk, video frame, or JSON control)

      // Direct binary PCM audio stream handling (Live Gemini Multimodal voice session)
      // Only binary WebSocket frames (opcode 2, isBinary === true) are treated as raw audio chunks.
      if (isBinary) {
        try {
          const buf = Buffer.isBuffer(data) ? data
                    : Array.isArray(data) ? Buffer.concat(data)
                    : Buffer.from(data);
          if (buf.length < 2) return;
          const liveVoice = require('../../core/Live_Voice_Engine');
          const activeSession = liveVoice.getActiveSessionForClient(ws);
          if (activeSession && activeSession.isActive) {
            activeSession.handleIncomingClientAudio(buf.toString('base64'));
          }
        } catch (e) {
          console.error('[BRIDGE-GATEWAY] Binary audio dispatch error:', e.message);
        }
        return;
      }

      // JSON Control & Telemetry Payload handling (Text frames, isBinary === false)
      let payload;
      try {
        payload = JSON.parse(data.toString());
      } catch (err) {
        console.warn('[BRIDGE-GATEWAY] Invalid JSON packet received:', data.toString().substring(0, 100));
        return;
      }

      // Route to appropriate device manager
      if (ws.deviceType === 'desktop') {
        windowsClient.handleMessage(payload, ws);
      } else {
        mobileClient.handleMessage(payload, ws);
      }
    });

    ws.on('close', (code, reason) => {
      const reasonStr = reason ? reason.toString() : 'No reason';
      console.log(`[BRIDGE-GATEWAY] Client disconnected: [${ws.deviceType}] code=${code}, reason=${reasonStr}`);
      if (ws.deviceType === 'desktop') {
        windowsClient.handleDisconnect(ws);
      } else {
        mobileClient.handleDisconnect(ws);
      }
    });

    ws.on('error', (err) => {
      console.error(`[BRIDGE-GATEWAY] Socket error on [${ws.deviceType}]:`, err.message);
    });
  });

  console.log('[BRIDGE-GATEWAY] ✅ Unified WebSocket Bridge Gateway initialized at /ws (Mobile & Desktop).');
  return wss;
}

/**
 * Terminate WebSocket server and cleanup intervals.
 */
function closeWebSocket() {
  if (heartbeatInterval) {
    clearInterval(heartbeatInterval);
    heartbeatInterval = null;
  }
  if (wss) {
    wss.close();
    wss = null;
    console.log('[BRIDGE-GATEWAY] Unified WebSocket Bridge Gateway closed.');
  }
}

function getWss() {
  return wss;
}

module.exports = {
  initWebSocket,
  closeWebSocket,
  getWss,
  resolveDeviceType
};
