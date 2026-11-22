'use strict';
/**
 * ============================================================
 * N.E.X.A Pulse Monitor — Zero-Overhead Realtime Metrics WebSocket
 * Endpoint: /monitor/ws/metrics
 *
 * - Uses ws.WebSocketServer({ noServer: true }) so it coexists cleanly
 *   with Bridge Gateway (/ws) on the same http.Server without 400 conflicts.
 * - Authenticates strictly at HTTP Upgrade via HttpOnly session cookie
 *   + Origin allowlist (401/403 before upgrade).
 * - ZERO IDLE OVERHEAD: 2-second push timer starts ONLY when clients.size > 0
 *   and is cleared immediately when the last browser tab disconnects.
 * ============================================================
 */

const WebSocket = require('ws');

const METRICS_WS_PATH = '/monitor/ws/metrics';
const DEFAULT_PUSH_INTERVAL_MS = 2000;
const HEARTBEAT_INTERVAL_MS = 30_000;
const MAX_MONITOR_WS_CLIENTS = 4;

function writeUpgradeError(socket, statusCode, statusText) {
  try {
    socket.write(
      `HTTP/1.1 ${statusCode} ${statusText}\r\n` +
      'Connection: close\r\n' +
      'Content-Type: text/plain\r\n' +
      'Content-Length: 0\r\n\r\n'
    );
  } catch (_) {}
  try { socket.destroy(); } catch (_) {}
}

class MonitorMetricsWebSocket {
  /**
   * @param {object} monitor - Monitor facade (metricsCollector, issueTracker, authService)
   * @param {object} [options]
   * @param {number} [options.pushIntervalMs=2000]
   */
  constructor(monitor, options = {}) {
    this.monitor = monitor;
    this.pushIntervalMs = Math.max(200, Number(options.pushIntervalMs) || DEFAULT_PUSH_INTERVAL_MS);
    this.wss = new WebSocket.Server({ noServer: true, maxPayload: 4096 });
    this._pushTimer = null;
    this._heartbeatTimer = null;
    this._upgradeHandler = null;
    this._attachedServer = null;

    this.wss.on('connection', (ws) => this._onConnection(ws));
  }

  get clientCount() {
    return this.wss.clients.size;
  }

  get isPushActive() {
    return this._pushTimer !== null;
  }

  attach(httpServer) {
    if (this._attachedServer === httpServer) return;
    this._attachedServer = httpServer;
    this._upgradeHandler = (req, socket, head) => {
      let pathname = '';
      try {
        pathname = new URL(req.url || '/', 'http://localhost').pathname;
      } catch (_) {
        return;
      }
      if (pathname !== METRICS_WS_PATH) return;

      const auth = this.monitor.authService;
      const origin = String(req.headers.origin || '').trim();
      if (origin && !auth.isAllowedOrigin(origin)) {
        return writeUpgradeError(socket, 403, 'Forbidden');
      }

      const session = auth.getSessionFromCookieHeader(req.headers.cookie);
      if (!session) {
        return writeUpgradeError(socket, 401, 'Unauthorized');
      }

      if (this.wss.clients.size >= MAX_MONITOR_WS_CLIENTS) {
        return writeUpgradeError(socket, 429, 'Too Many Requests');
      }

      this.wss.handleUpgrade(req, socket, head, (ws) => {
        ws._monitorSessionId = session.id;
        this.wss.emit('connection', ws, req);
      });
    };
    httpServer.on('upgrade', this._upgradeHandler);
  }

  _onConnection(ws) {
    ws.isAlive = true;
    ws._monitorPaused = false;

    ws.on('pong', () => {
      ws.isAlive = true;
    });

    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(String(raw || ''));
        if (msg && msg.type === 'PAUSE') ws._monitorPaused = true;
        else if (msg && msg.type === 'RESUME') {
          ws._monitorPaused = false;
          this._sendSingleSnapshot(ws);
        }
      } catch (_) {}
    });

    ws.on('close', () => this._syncTimers());
    ws.on('error', () => this._syncTimers());

    // Push immediate initial snapshot on connect
    this._sendSingleSnapshot(ws);
    this._syncTimers();
  }

  _buildPayload() {
    return JSON.stringify({
      type: 'METRICS_TICK',
      snapshot: this.monitor.metricsCollector.collectSnapshot(),
      issues: this.monitor.issueTracker.getSummary()
    });
  }

  _sendSingleSnapshot(ws) {
    if (ws.readyState !== WebSocket.OPEN) return;
    try {
      ws.send(this._buildPayload());
    } catch (_) {}
  }

  _broadcastTick() {
    if (this.wss.clients.size === 0) {
      this._stopTimers();
      return;
    }

    // Disconnect sockets whose session was revoked or expired
    let activeReceivers = 0;
    for (const ws of this.wss.clients) {
      if (!this.monitor.authService.sessions.has(ws._monitorSessionId)) {
        try { ws.close(4001, 'Session expired'); } catch (_) {}
        continue;
      }
      if (ws.readyState === WebSocket.OPEN && !ws._monitorPaused) {
        activeReceivers += 1;
      }
    }
    if (activeReceivers === 0) return;

    const payload = this._buildPayload();
    for (const ws of this.wss.clients) {
      if (ws.readyState === WebSocket.OPEN && !ws._monitorPaused) {
        try { ws.send(payload); } catch (_) {}
      }
    }
  }

  _syncTimers() {
    if (this.wss.clients.size > 0) {
      if (!this._pushTimer) {
        this._pushTimer = setInterval(() => this._broadcastTick(), this.pushIntervalMs);
        if (typeof this._pushTimer.unref === 'function') this._pushTimer.unref();
      }
      if (!this._heartbeatTimer) {
        this._heartbeatTimer = setInterval(() => {
          for (const ws of this.wss.clients) {
            if (ws.isAlive === false) {
              try { ws.terminate(); } catch (_) {}
              continue;
            }
            ws.isAlive = false;
            try { ws.ping(); } catch (_) {}
          }
          if (this.wss.clients.size === 0) this._stopTimers();
        }, HEARTBEAT_INTERVAL_MS);
        if (typeof this._heartbeatTimer.unref === 'function') this._heartbeatTimer.unref();
      }
    } else {
      this._stopTimers();
    }
  }

  _stopTimers() {
    if (this._pushTimer) {
      clearInterval(this._pushTimer);
      this._pushTimer = null;
    }
    if (this._heartbeatTimer) {
      clearInterval(this._heartbeatTimer);
      this._heartbeatTimer = null;
    }
  }

  close() {
    this._stopTimers();
    if (this._attachedServer && this._upgradeHandler) {
      this._attachedServer.removeListener('upgrade', this._upgradeHandler);
      this._attachedServer = null;
      this._upgradeHandler = null;
    }
    for (const ws of this.wss.clients) {
      try { ws.close(1001, 'Server shutting down'); } catch (_) {}
    }
    try { this.wss.close(); } catch (_) {}
  }
}

module.exports = {
  MonitorMetricsWebSocket,
  METRICS_WS_PATH
};
