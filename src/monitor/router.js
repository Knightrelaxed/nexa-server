'use strict';
/**
 * ============================================================
 * N.E.X.A Pulse Monitor — Express API Router (/monitor/api/*)
 *
 * Security hardening:
 * - Cache-Control: no-store + X-Robots-Tag: noindex, nofollow on all routes
 * - Zero infrastructure fingerprinting on unauthenticated /auth/status
 * - All operational endpoints require valid HttpOnly session cookie (401 otherwise)
 * - All mutations require CSRF header (X-Nexa-Monitor: 1) + trusted Origin
 * ============================================================
 */

const express = require('express');
const { resolveTrustedClientIp } = require('../interfaces/bridge/gateway');

const RANGE_TO_SEC = Object.freeze({
  '1h': 3600,
  '6h': 6 * 3600,
  '24h': 24 * 3600,
  '7d': 7 * 24 * 3600
});

function createMonitorRouter(monitor, options = {}) {
  const router = express.Router();
  const auth = monitor.authService;
  const ticketServiceProvider = typeof options.getTicketService === 'function'
    ? options.getTicketService
    : () => require('../core/auth/ticket_service').getTicketService();
  const restartDelayMs = Number.isFinite(options.restartDelayMs) ? options.restartDelayMs : 150;

  // Hardened response headers on every /monitor/api/* endpoint
  router.use((req, res, next) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('X-Robots-Tag', 'noindex, nofollow');
    next();
  });

  // ============================================================
  // 1. PUBLIC AUTH ENDPOINTS (Zero infrastructure fingerprinting)
  // ============================================================
  router.get('/auth/status', (req, res) => {
    const session = auth.getSessionFromCookieHeader(req.headers.cookie);
    if (!session) {
      return res.status(200).json({
        authenticated: false,
        configured: auth.isConfigured()
      });
    }
    return res.status(200).json({
      authenticated: true,
      configured: true,
      session: auth._publicSession(session, session.id)
    });
  });

  router.post('/auth/login', auth.requireCsrf(), (req, res) => {
    const ip = resolveTrustedClientIp(req);
    const { username, password } = req.body || {};
    const result = auth.login(username, password, {
      ip,
      userAgent: req.headers['user-agent'] || ''
    });

    if (!result.ok) {
      if (result.retryAfterSec) {
        res.setHeader('Retry-After', String(result.retryAfterSec));
      }
      return res.status(result.status).json({
        error: result.message,
        code: result.code,
        retryAfterSec: result.retryAfterSec || undefined
      });
    }

    res.setHeader('Set-Cookie', auth.buildSetCookieHeader(result.sessionId, auth.isSecureRequest(req)));
    return res.status(200).json({
      authenticated: true,
      session: result.session
    });
  });

  router.post('/auth/logout', auth.requireCsrf(), (req, res) => {
    const session = auth.getSessionFromCookieHeader(req.headers.cookie);
    if (session) {
      auth.logout(session.id, { ip: resolveTrustedClientIp(req) });
    }
    res.setHeader('Set-Cookie', auth.buildClearCookieHeader(auth.isSecureRequest(req)));
    return res.status(200).json({ ok: true });
  });

  // ============================================================
  // AUTH GATE — Everything below strictly requires a valid session
  // ============================================================
  router.use(auth.requireAuth());

  // 2. OVERVIEW
  router.get('/overview', async (req, res) => {
    try {
      const overview = await monitor.getOverview();
      return res.status(200).json(overview);
    } catch (err) {
      return res.status(500).json({ error: 'Failed to collect overview telemetry' });
    }
  });

  // 3. HISTORICAL METRICS
  router.get('/metrics/history', (req, res) => {
    const rangeKey = String(req.query.range || '1h').trim().toLowerCase();
    const rangeSec = RANGE_TO_SEC[rangeKey] || RANGE_TO_SEC['1h'];
    const maxPoints = Math.min(360, Math.max(10, Number(req.query.maxPoints) || 180));
    const points = monitor.historyStore.queryRange(rangeSec, maxPoints);
    const current = monitor.metricsCollector.collectSnapshot();
    return res.status(200).json({
      range: RANGE_TO_SEC[rangeKey] ? rangeKey : '1h',
      rangeSec,
      count: points.length,
      points,
      current
    });
  });

  // 4. ISSUES (LIST, DETAIL, RESOLVE, REOPEN, CLEAR)
  router.get('/issues', (req, res) => {
    const status = String(req.query.status || 'all').toLowerCase();
    const subsystem = req.query.subsystem ? String(req.query.subsystem) : '';
    const search = req.query.search ? String(req.query.search) : '';
    return res.status(200).json({
      summary: monitor.issueTracker.getSummary(),
      issues: monitor.issueTracker.listIssues({ status, subsystem, search })
    });
  });

  router.get('/issues/:fingerprint', (req, res) => {
    const detail = monitor.issueTracker.getIssue(req.params.fingerprint);
    if (!detail) return res.status(404).json({ error: 'Issue not found' });
    return res.status(200).json(detail);
  });

  router.post('/issues/:fingerprint/resolve', auth.requireCsrf(), (req, res) => {
    const updated = monitor.issueTracker.resolveIssue(req.params.fingerprint);
    if (!updated) return res.status(404).json({ error: 'Issue not found' });
    auth.recordAudit('ISSUE_RESOLVED', `Resolved issue ${updated.fingerprint}`, { ip: resolveTrustedClientIp(req) });
    return res.status(200).json(updated);
  });

  router.post('/issues/:fingerprint/reopen', auth.requireCsrf(), (req, res) => {
    const updated = monitor.issueTracker.reopenIssue(req.params.fingerprint);
    if (!updated) return res.status(404).json({ error: 'Issue not found' });
    return res.status(200).json(updated);
  });

  router.post('/issues/clear-resolved', auth.requireCsrf(), (req, res) => {
    const removed = monitor.issueTracker.clearResolved();
    auth.recordAudit('ISSUES_CLEARED', `Cleared ${removed} resolved issue(s)`, { ip: resolveTrustedClientIp(req) });
    return res.status(200).json({ ok: true, removed });
  });

  // 5. SINGLE-USE ED25519 TICKET FOR BROWSER /io/logs STREAMING
  router.post('/logs/ticket', auth.requireCsrf(), (req, res) => {
    const ip = resolveTrustedClientIp(req);
    const session = req.monitorSession;
    const operatorDev = `web-monitor-${session.id.slice(0, 8)}`;
    const ticketService = ticketServiceProvider();
    const minted = ticketService.issueInternalLogsTicket(operatorDev, { clientIp: ip });
    if (!minted.ok) {
      const status = minted.code === 'RATE_LIMITED' ? 429 : 503;
      return res.status(status).json({ error: minted.message, code: minted.code });
    }
    auth.recordAudit('TICKET_MINTED', `scope=logs dev=${operatorDev} ttl=45s`, { ip });
    return res.status(200).json({
      ticket: minted.ticket,
      scope: 'logs',
      exp: minted.exp,
      protocol: 'nexa-io-v1'
    });
  });

  // 6. CONTROLS & SECURITY
  let lastTestAlertAt = 0;

  router.get('/controls', async (req, res) => {
    try {
      const snap = monitor.metricsCollector.collectSnapshot();
      const services = await monitor.systemdInspector.getServicesStatus({
        rssMb: snap.memory.rssMb,
        cpuPct: snap.cpu.processPct,
        uptimeSec: snap.runtime.uptimeSec
      });
      const mobileConnected = Boolean(snap.domain && snap.domain.mobile && snap.domain.mobile.connected);
      const telegramConfigured = Boolean(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID);
      return res.status(200).json({
        services,
        activeLiveCalls: snap.domain ? snap.domain.activeLiveCalls : 0,
        aiHealth: (snap.domain && snap.domain.aiHealth) || { groups: [], keysCoolingDown: [], openCount: 0, halfOpenCount: 0, coolingKeysCount: 0 },
        alerts: monitor.alertEngine.getRules(),
        alertCooldownMinutes: monitor.alertEngine.getCooldownMinutes(),
        alertChannel: {
          mobileConnected,
          telegramConfigured,
          activeRoute: mobileConnected ? 'Mobile Bridge' : (telegramConfigured ? 'Telegram Fallback' : 'Not configured')
        },
        auth: {
          username: req.monitorSession.username,
          sessions: auth.listSessions(req.monitorSession.id)
        },
        auditLog: auth.getAuditLog()
      });
    } catch (err) {
      return res.status(500).json({ error: 'Failed to load controls state' });
    }
  });

  router.post('/controls/alerts-settings', auth.requireCsrf(), (req, res) => {
    const mins = Number(req.body && req.body.cooldownMinutes);
    if (!Number.isFinite(mins)) {
      return res.status(400).json({ error: 'cooldownMinutes must be a number (1..120).' });
    }
    const saved = monitor.alertEngine.setCooldownMinutes(mins);
    auth.recordAudit('ALERT_SETTINGS_UPDATED', `Global alert cooldown -> ${saved}m`, { ip: resolveTrustedClientIp(req) });
    return res.status(200).json({ ok: true, cooldownMinutes: saved });
  });

  router.post('/controls/alerts/test', auth.requireCsrf(), async (req, res) => {
    const now = Date.now();
    if ((now - lastTestAlertAt) < 10_000) {
      return res.status(429).json({ error: 'Please wait 10 seconds before sending another test alert.' });
    }
    lastTestAlertAt = now;
    const snap = monitor.metricsCollector.collectSnapshot();
    const mobileConnected = Boolean(snap.domain && snap.domain.mobile && snap.domain.mobile.connected);
    const result = await monitor.alertEngine.sendTestAlert({ mobileConnected });
    auth.recordAudit('ALERT_TEST_SENT', `channel=${result.channel} ok=${result.ok}`, {
      ip: resolveTrustedClientIp(req),
      severity: result.ok ? 'info' : 'warn'
    });
    return res.status(result.ok ? 200 : 502).json(result);
  });

  router.post('/controls/alerts/:ruleId', auth.requireCsrf(), (req, res) => {
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const patch = {};
    if (typeof body.enabled === 'boolean') patch.enabled = body.enabled;
    if (body.thresholdMb !== undefined) patch.thresholdMb = body.thresholdMb;
    if (body.thresholdMs !== undefined) patch.thresholdMs = body.thresholdMs;
    if (body.thresholdCount !== undefined) patch.thresholdCount = body.thresholdCount;
    if (body.threshold !== undefined) patch.threshold = body.threshold;
    if (body.sustainedMinutes !== undefined) patch.sustainedMinutes = body.sustainedMinutes;

    const updated = monitor.alertEngine.updateRule(req.params.ruleId, patch);
    if (!updated) return res.status(404).json({ error: 'Unknown alert rule' });
    const summary = Object.entries(patch).map(([k, v]) => `${k}=${v}`).join(' ');
    auth.recordAudit('ALERT_RULE_UPDATED', `${updated.id} (${summary || 'updated'})`, { ip: resolveTrustedClientIp(req) });
    return res.status(200).json(updated);
  });

  router.post('/actions/reset-breakers', auth.requireCsrf(), (req, res) => {
    const cleared = monitor.resetAiBreakers();
    const snap = monitor.metricsCollector.collectSnapshot();
    auth.recordAudit('BREAKERS_RESET', `Cleared ${cleared.clearedGroups} group(s) & ${cleared.clearedKeys} key cooldown(s)`, {
      ip: resolveTrustedClientIp(req),
      severity: 'warn'
    });
    return res.status(200).json({
      ok: true,
      ...cleared,
      aiHealth: (snap.domain && snap.domain.aiHealth) || { groups: [], keysCoolingDown: [], openCount: 0, halfOpenCount: 0, coolingKeysCount: 0 }
    });
  });

  router.post('/actions/reset-metrics', auth.requireCsrf(), (req, res) => {
    const result = monitor.metricsCollector.resetMonit();
    auth.recordAudit('METRICS_RESET', 'In-memory HTTP & Event Loop histograms reset', { ip: resolveTrustedClientIp(req) });
    return res.status(200).json({ ok: true, ...result });
  });

  router.post('/actions/restart', auth.requireCsrf(), async (req, res) => {
    const ip = resolveTrustedClientIp(req);
    const snap = monitor.metricsCollector.collectSnapshot();
    const activeLiveCalls = snap.domain ? Number(snap.domain.activeLiveCalls || 0) : 0;
    const force = Boolean(req.body && req.body.force === true);

    if (activeLiveCalls > 0 && !force) {
      return res.status(409).json({
        error: `Active Live Voice Call in progress (${activeLiveCalls}). Pass { force: true } to confirm restart.`,
        code: 'LIVE_CALL_ACTIVE',
        activeLiveCalls
      });
    }

    // Flush history & issues cleanly before restart
    try { monitor.historyStore.flush(); } catch (_) {}
    try { monitor.issueTracker.flushSync(); } catch (_) {}

    if (restartDelayMs <= 0) {
      const outcome = await monitor.systemdInspector.restartNexaServer();
      auth.recordAudit('SERVICE_RESTART', `nexa-server.service (${outcome.code})`, {
        ip,
        severity: outcome.ok ? 'warn' : 'error'
      });
      return res.status(outcome.ok ? 202 : 400).json(outcome);
    }

    // Pre-check capability before responding 202
    const status = await monitor.systemdInspector.getServicesStatus({ rssMb: snap.memory.rssMb });
    if (!status.canPolkitRestart) {
      return res.status(400).json({
        ok: false,
        code: 'SYSTEMD_UNIT_NOT_ACTIVE',
        message: 'Polkit restart is only active after migrating nexa-server to systemd (Phase 5E).'
      });
    }

    auth.recordAudit('SERVICE_RESTART', 'Scheduled graceful SIGTERM restart via Polkit', { ip, severity: 'warn' });
    const t = setTimeout(() => {
      monitor.systemdInspector.restartNexaServer().catch(() => {});
    }, restartDelayMs);
    if (typeof t.unref === 'function') t.unref();

    return res.status(202).json({
      ok: true,
      code: 'RESTART_SCHEDULED',
      message: 'Graceful restart scheduled via systemd Polkit.'
    });
  });

  router.post('/auth/sessions/revoke-all', auth.requireCsrf(), (req, res) => {
    const revoked = auth.revokeAllSessions({ ip: resolveTrustedClientIp(req) });
    res.setHeader('Set-Cookie', auth.buildClearCookieHeader(auth.isSecureRequest(req)));
    return res.status(200).json({ ok: true, revoked });
  });

  return router;
}

module.exports = {
  createMonitorRouter,
  RANGE_TO_SEC
};
