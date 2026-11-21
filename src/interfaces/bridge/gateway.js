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
  // N-L3: Strict CLI isolation - /ws accepts only device/bridge secrets (never NEXA_CLI_SECRET)
  const validSecrets = [
    env.NEXA_DEVICE_SECRET,
    env.NEXA_BRIDGE_SECRET,
  ].filter(Boolean).map(s => String(s).trim());

  wss = new WebSocket.Server({
    server,
    path: '/ws',
    maxPayload: 2 * 1024 * 1024, // 2MB payload ceiling (accommodates up to 3-min OGG Opus voice note base64)
    verifyClient: (info, cb) => {
      // Handshake Authentication at HTTP Upgrade stage
      const authHeader = info.req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ') || validSecrets.length === 0) {
        console.warn('[BRIDGE-GATEWAY] ⚠️ Unauthorized handshake attempt rejected at HTTP upgrade.');
        return cb(false, 401, 'Unauthorized');
      }

      const token = authHeader.slice('Bearer '.length).trim();
      const aBuf = Buffer.from(token, 'utf8');

      const isAuthorized = validSecrets.some(secret => {
        const bBuf = Buffer.from(secret, 'utf8');
        return aBuf.length === bBuf.length && crypto.timingSafeEqual(aBuf, bBuf);
      });

      if (!isAuthorized) {
        console.warn('[BRIDGE-GATEWAY] ⚠️ Forbidden handshake attempt (token mismatch).');
        return cb(false, 403, 'Forbidden');
      }

      cb(true);
    }
  });

  // N-M6: Adaptive Keepalive Watchdog aligned with NFR-BAT-01 (60s screen-on / 120s screen-off)
  const watchdogIntervalMs = Math.max(15000, Number(env.NEXA_WS_WATCHDOG_MS || 60000));
  if (!heartbeatInterval) {
    heartbeatInterval = setInterval(() => {
      if (!wss) return;
      const now = Date.now();
      const mobileTelemetry = typeof mobileClient.getLatestTelemetry === 'function'
        ? mobileClient.getLatestTelemetry()
        : null;
      const mobileScreenOff = mobileTelemetry && mobileTelemetry.screen_on === false;

      wss.clients.forEach((ws) => {
        const lastSeen = ws.lastActivityAt || now;
        const idleMs = now - lastSeen;
        const isMobile = ws.deviceType === 'mobile';
        const pingThresholdMs = (isMobile && mobileScreenOff) ? 115000 : Math.max(55000, watchdogIntervalMs - 5000);
        const deadThresholdMs = (isMobile && mobileScreenOff) ? 260000 : Math.max(130000, watchdogIntervalMs * 2 + 10000);

        if (idleMs > deadThresholdMs) {
          console.warn(`[BRIDGE-GATEWAY] ⚠️ Dead socket detected on ${ws.deviceType || 'unknown'} by watchdog (idle ${Math.round(idleMs / 1000)}s). Terminating...`);
          return ws.terminate();
        }
        if (idleMs >= pingThresholdMs) {
          ws.isAlive = false;
          try {
            ws.ping();
          } catch (_) {}
        }
      });
    }, watchdogIntervalMs);
    if (typeof heartbeatInterval.unref === 'function') {
      heartbeatInterval.unref();
    }
  }

  wss.on('connection', (ws, req) => {
    ws.isAlive = true;
    ws.lastActivityAt = Date.now();
    const xff = req && req.headers ? req.headers['x-forwarded-for'] : null;
    ws.clientIp = (typeof xff === 'string' && xff.trim())
      ? xff.split(',')[0].trim()
      : (req && req.socket && req.socket.remoteAddress ? req.socket.remoteAddress : 'unknown');

    ws.on('pong', () => {
      ws.isAlive = true;
      ws.lastActivityAt = Date.now();
    });

    const deviceType = resolveDeviceType(req);
    ws.deviceType = deviceType;

    const deviceIcon = (deviceType === 'desktop') ? '💻' : '📱';
    const deviceLabel = (deviceType === 'desktop') ? 'Windows Bridge (ThinkPad)' : 'Nexa Bridge Android';
    console.log(`[BRIDGE-GATEWAY] ${deviceIcon} ${deviceLabel} connected successfully (ip=${ws.clientIp}, authenticated via verifyClient).`);

    // Register into device-specific client manager
    if (deviceType === 'desktop') {
      windowsClient.setClient(ws);
    } else {
      mobileClient.setClient(ws);
    }

    // Message routing
    ws.on('message', (data, isBinary) => {
      ws.isAlive = true; // Mark socket alive on every incoming packet (audio chunk, video frame, or JSON control)
      ws.lastActivityAt = Date.now();

      // Direct binary PCM audio stream handling (Live Gemini Multimodal voice session)
      // Only binary WebSocket frames (opcode 2, isBinary === true) are treated as raw audio chunks.
      if (isBinary) {
        try {
          const buf = Buffer.isBuffer(data) ? data
                    : Array.isArray(data) ? Buffer.concat(data)
                    : Buffer.from(data);
          if (buf.length < 2) return;
          const liveVoice = require('../../core/Live_Voice_Engine');
          let activeSession = liveVoice.getActiveSessionForClient(ws);
          if (!activeSession && ws.deviceType === 'desktop') {
            const sid = `DESKTOP_LAZY_${Date.now()}`;
            console.log(`[BRIDGE-GATEWAY] ⚡ Auto-starting Gemini Live Voice Session on binary audio for desktop [${sid}]`);
            activeSession = liveVoice.startLiveSession(sid, ws);
          }
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

      // N-C3: Reject null, primitive, or array JSON payloads before dispatching
      if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
        console.warn('[BRIDGE-GATEWAY] Non-object JSON payload ignored.');
        return;
      }

      // Route to appropriate device manager inside crash-proof try/catch
      try {
        if (ws.deviceType === 'desktop') {
          windowsClient.handleMessage(payload, ws);
        } else {
          mobileClient.handleMessage(payload, ws);
        }
      } catch (dispatchErr) {
        console.error(`[BRIDGE-GATEWAY] Unhandled message dispatch error on [${ws.deviceType}]:`, dispatchErr.message);
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
    // N-M7: Close all active WS clients cleanly so http.Server.close() drains immediately
    wss.clients.forEach((client) => {
      try { client.close(1001, 'Server shutting down'); } catch (_) {}
      try { client.terminate(); } catch (_) {}
    });
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
