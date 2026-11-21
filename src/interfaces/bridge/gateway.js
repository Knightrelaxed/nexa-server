// ============================================================
// N.E.X.A 3.3 — UNIFIED BRIDGE GATEWAY
// Centralized /ws WebSocket Server & Device Multiplexer
// Dispatches sockets between Mobile (Android) and Windows (Desktop)
// ============================================================
'use strict';

const WebSocket = require('ws');
const crypto = require('crypto');
const net = require('net');
const env = require('../../config/env');
const { sanitizeLogToken } = require('../../utils/logger');
const mobileClient = require('./mobile_bridge/client');
const windowsClient = require('./windows_bridge/client');

let wss = null;
let heartbeatInterval = null;

const WS_UPGRADE_RATE_WINDOW_MS = 60_000;
const WS_UPGRADE_MAX_PER_MIN = 30;
const WS_UPGRADE_MAX_BUCKETS = 512;
const upgradeRateBuckets = new Map();

function isLoopbackAddress(addr) {
  const clean = String(addr || '').trim();
  return clean === '127.0.0.1' || clean === '::1' || clean === '::ffff:127.0.0.1';
}

/**
 * Resolve trusted client IP without trusting spoofable leftmost X-Forwarded-For (H-2).
 * Only trusts XFF when the immediate TCP peer is loopback (local Caddy reverse proxy),
 * and reads the rightmost hop added by Caddy.
 */
function resolveTrustedClientIp(req) {
  const remote = String(req && req.socket && req.socket.remoteAddress ? req.socket.remoteAddress : '').trim();
  if (isLoopbackAddress(remote) && req && req.headers && typeof req.headers['x-forwarded-for'] === 'string') {
    const hops = req.headers['x-forwarded-for']
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);
    for (let i = hops.length - 1; i >= 0; i--) {
      const candidate = hops[i].replace(/^\[|\]$/g, '');
      if (net.isIP(candidate)) {
        return candidate;
      }
    }
  }
  return remote || 'unknown';
}

function checkUpgradeRateLimit(ip) {
  const now = Date.now();
  const key = ip || 'unknown';
  const prev = upgradeRateBuckets.get(key) || [];
  const active = prev.filter(ts => now - ts < WS_UPGRADE_RATE_WINDOW_MS);
  if (active.length >= WS_UPGRADE_MAX_PER_MIN) {
    upgradeRateBuckets.set(key, active);
    return false;
  }
  active.push(now);
  if (upgradeRateBuckets.size >= WS_UPGRADE_MAX_BUCKETS && !upgradeRateBuckets.has(key)) {
    for (const [k, list] of upgradeRateBuckets.entries()) {
      if (list.every(ts => now - ts >= WS_UPGRADE_RATE_WINDOW_MS)) upgradeRateBuckets.delete(k);
    }
    while (upgradeRateBuckets.size >= WS_UPGRADE_MAX_BUCKETS) {
      const oldest = upgradeRateBuckets.keys().next().value;
      if (oldest === undefined) break;
      upgradeRateBuckets.delete(oldest);
    }
  }
  upgradeRateBuckets.set(key, active);
  return true;
}

function safeTokenEqual(token, secret) {
  if (!token || !secret) return false;
  const aBuf = Buffer.from(token, 'utf8');
  const bBuf = Buffer.from(secret, 'utf8');
  return aBuf.length > 0 && aBuf.length === bBuf.length && crypto.timingSafeEqual(aBuf, bBuf);
}

/**
 * Determine device type from handshake request.
 * @param {import('http').IncomingMessage} req 
 * @returns {'desktop'|'mobile'}
 */
function resolveDeviceType(req) {
  if (req && req._nexaBoundDeviceType) {
    return req._nexaBoundDeviceType;
  }
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
  // C-2 & N-L3: Trim secrets BEFORE filtering so whitespace-only env vars can never match empty Bearer tokens
  const deviceSecret = String(env.NEXA_DEVICE_SECRET || '').trim();
  const bridgeSecret = String(env.NEXA_BRIDGE_SECRET || '').trim();
  const validSecrets = [deviceSecret, bridgeSecret].filter(Boolean);

  wss = new WebSocket.Server({
    server,
    path: '/ws',
    maxPayload: 2 * 1024 * 1024, // 2MB payload ceiling (accommodates up to 3-min OGG Opus voice note base64)
    verifyClient: (info, cb) => {
      const clientIp = resolveTrustedClientIp(info.req);
      const safeIp = sanitizeLogToken(clientIp, 64);

      // H-1 / FR-SRV-08: Rate-limit /ws HTTP Upgrade handshakes per IP
      if (!checkUpgradeRateLimit(clientIp)) {
        console.warn(`[BRIDGE-GATEWAY] Rate limit exceeded on /ws upgrade ip=${safeIp}`);
        return cb(false, 429, 'Too Many Requests');
      }

      // Handshake Authentication at HTTP Upgrade stage
      const authHeader = info.req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ') || validSecrets.length === 0) {
        console.warn(`[BRIDGE-GATEWAY] Unauthorized handshake attempt rejected at HTTP upgrade ip=${safeIp}`);
        return cb(false, 401, 'Unauthorized');
      }

      const token = authHeader.slice('Bearer '.length).trim();
      if (!token) {
        console.warn(`[BRIDGE-GATEWAY] Unauthorized empty Bearer token rejected at HTTP upgrade ip=${safeIp}`);
        return cb(false, 401, 'Unauthorized');
      }

      const matchedDevice = safeTokenEqual(token, deviceSecret);
      const matchedBridge = safeTokenEqual(token, bridgeSecret);
      if (!matchedDevice && !matchedBridge) {
        console.warn(`[BRIDGE-GATEWAY] Forbidden handshake attempt (token mismatch) ip=${safeIp}`);
        return cb(false, 403, 'Forbidden');
      }

      // H-12: If both secrets are configured distinctly, a desktop-only bridge secret cannot hijack the mobile slot
      if (deviceSecret && bridgeSecret && deviceSecret !== bridgeSecret && matchedBridge && !matchedDevice) {
        info.req._nexaBoundDeviceType = 'desktop';
      }

      cb(true);
    }
  });

  // H-11 & N-M6 / M-1: Adaptive Keepalive Watchdog aligned with NFR-BAT-01 (60s screen-on / up to 300s screen-off)
  const rawWatchdog = Number(env.NEXA_WS_WATCHDOG_MS);
  const watchdogIntervalMs = Number.isFinite(rawWatchdog) ? Math.max(15000, rawWatchdog) : 60000;
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
        const deadThresholdMs = (isMobile && mobileScreenOff) ? 320000 : Math.max(130000, watchdogIntervalMs * 2 + 10000);

        // M-1: Enforce unanswered server ping termination (half-open detection)
        if (ws.isAlive === false && ws._pingSentAt && (now - ws._pingSentAt) >= Math.max(25000, watchdogIntervalMs - 5000)) {
          console.warn(`[BRIDGE-GATEWAY] Dead half-open socket on ${ws.deviceType || 'unknown'} (no pong after ping). Terminating...`);
          return ws.terminate();
        }
        if (idleMs > deadThresholdMs) {
          console.warn(`[BRIDGE-GATEWAY] Dead socket detected on ${ws.deviceType || 'unknown'} by watchdog (idle ${Math.round(idleMs / 1000)}s). Terminating...`);
          return ws.terminate();
        }
        if (idleMs >= pingThresholdMs && ws.isAlive !== false) {
          ws.isAlive = false;
          ws._pingSentAt = now;
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
    ws._pingSentAt = 0;
    ws.lastActivityAt = Date.now();
    ws.clientIp = resolveTrustedClientIp(req);

    ws.on('pong', () => {
      ws.isAlive = true;
      ws._pingSentAt = 0;
      ws.lastActivityAt = Date.now();
    });

    // M-1: Refresh activity on client-initiated RFC 6455 protocol PING frames (OkHttp)
    ws.on('ping', () => {
      ws.isAlive = true;
      ws._pingSentAt = 0;
      ws.lastActivityAt = Date.now();
    });

    const deviceType = resolveDeviceType(req);
    ws.deviceType = deviceType;

    const deviceIcon = (deviceType === 'desktop') ? '💻' : '📱';
    const deviceLabel = (deviceType === 'desktop') ? 'Windows Bridge (ThinkPad)' : 'Nexa Bridge Android';
    console.log(`[BRIDGE-GATEWAY] ${deviceIcon} ${deviceLabel} connected successfully (ip=${sanitizeLogToken(ws.clientIp, 64)}, authenticated via verifyClient).`);

    // Register into device-specific client manager
    if (deviceType === 'desktop') {
      windowsClient.setClient(ws);
    } else {
      mobileClient.setClient(ws);
    }

    // Message routing
    ws.on('message', (data, isBinary) => {
      ws.isAlive = true; // Mark socket alive on every incoming packet (audio chunk, video frame, or JSON control)
      ws._pingSentAt = 0;
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
    // M-2: Allow Close(1001) frame to flush cleanly before force-terminating remaining sockets
    const closingClients = Array.from(wss.clients);
    closingClients.forEach((client) => {
      try { client.close(1001, 'Server shutting down'); } catch (_) {}
    });
    if (closingClients.length > 0) {
      setTimeout(() => {
        closingClients.forEach((client) => {
          try {
            if (client.readyState !== WebSocket.CLOSED) client.terminate();
          } catch (_) {}
        });
      }, 300).unref();
    }
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
  resolveDeviceType,
  resolveTrustedClientIp
};
