'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const crypto = require('crypto');
const express = require('express');
const WebSocket = require('ws');

const { hashPassword, verifyPasswordHash, COOKIE_NAME } = require('../src/monitor/auth_service');
const { createMonitor } = require('../src/monitor');
const { TicketService } = require('../src/core/auth/ticket_service');

function httpRequest(port, method, reqPath, { headers = {}, body = null } = {}) {
  return new Promise((resolve, reject) => {
    const payload = body !== null ? JSON.stringify(body) : null;
    const reqHeaders = { ...headers };
    if (payload !== null) {
      reqHeaders['Content-Type'] = 'application/json';
      reqHeaders['Content-Length'] = Buffer.byteLength(payload);
    }
    const req = http.request({
      hostname: '127.0.0.1',
      port,
      path: reqPath,
      method,
      agent: false,
      headers: reqHeaders
    }, (res) => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        const raw = Buffer.concat(chunks).toString('utf8');
        let json = null;
        try { json = JSON.parse(raw); } catch (_) {}
        resolve({ status: res.statusCode, headers: res.headers, raw, json });
      });
    });
    req.on('error', reject);
    if (payload !== null) req.write(payload);
    req.end();
  });
}

test('scrypt hashPassword and verifyPasswordHash validate accurately and reject malformed hashes', () => {
  const hash = hashPassword('SuperSecretPass!2026');
  assert.ok(hash.startsWith('scrypt$16384$8$1$'));
  assert.equal(verifyPasswordHash('SuperSecretPass!2026', hash), true);
  assert.equal(verifyPasswordHash('WrongPassword!2026', hash), false);
  assert.equal(verifyPasswordHash('SuperSecretPass!2026', 'invalid-hash-format'), false);
  assert.equal(verifyPasswordHash('SuperSecretPass!2026', 'scrypt$9999999$8$1$aa$bb'), false);
});

test('Pulse Monitor API enforces 401 gate, CSRF, brute-force lockout + alert, Ed25519 logs ticket, and Live Call restart guard', async () => {
  const passHash = hashPassword('NexaSecurePass2026!');
  const alerts = [];
  let activeCalls = 0;

  // Generate ephemeral Ed25519 keypair to verify real logs ticket signatures
  const { publicKey: edPub, privateKey: edPriv } = crypto.generateKeyPairSync('ed25519');
  const ticketService = new TicketService({
    serverPrivKey: edPriv,
    deviceStore: { getDevice: () => null, listDevices: () => [] }
  });

  let fakeNow = 1_760_600_000_000;
  const mon = createMonitor({
    memoryOnly: true,
    username: 'faqih',
    passwordHash: passHash,
    allowedOrigins: ['https://nexa.example.com', 'http://127.0.0.1:3000'],
    nowFn: () => fakeNow,
    notifyFn: async (p) => { alerts.push(p); },
    domainStatsProvider: () => ({
      mobile: { connected: true, rttMs: 32, uptimeSec: 500, pendingProactive: 0 },
      windows: { connected: false, rttMs: null, uptimeSec: 0 },
      activeLiveCalls: activeCalls,
      enrolledDevices: 1
    })
  });

  const app = express();
  app.use(express.json());
  app.use('/monitor/api', mon.createRouter({
    getTicketService: () => ticketService,
    restartDelayMs: 0
  }));

  const server = http.createServer(app);
  const wsMetrics = mon.attachMetricsWebSocket(server, { pushIntervalMs: 250 });

  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;

  try {
    // 1. Unauthenticated /auth/status exposes ZERO server metadata & sets hardened headers
    const statusUnauth = await httpRequest(port, 'GET', '/monitor/api/auth/status');
    assert.equal(statusUnauth.status, 200);
    assert.deepEqual(statusUnauth.json, { authenticated: false, configured: true });
    assert.match(String(statusUnauth.headers['cache-control']), /no-store/);
    assert.equal(statusUnauth.headers['x-robots-tag'], 'noindex, nofollow');

    // 2. Protected endpoints return 401 without session cookie
    for (const ep of ['/monitor/api/overview', '/monitor/api/metrics/history', '/monitor/api/issues', '/monitor/api/controls']) {
      const r = await httpRequest(port, 'GET', ep);
      assert.equal(r.status, 401, `Expected 401 on ${ep}`);
    }

    // 3. CSRF guard rejects missing X-Nexa-Monitor header & untrusted Origin
    const noCsrf = await httpRequest(port, 'POST', '/monitor/api/auth/login', {
      body: { username: 'faqih', password: 'NexaSecurePass2026!' }
    });
    assert.equal(noCsrf.status, 403);

    const badOrigin = await httpRequest(port, 'POST', '/monitor/api/auth/login', {
      headers: { 'X-Nexa-Monitor': '1', Origin: 'https://evil.attacker.test' },
      body: { username: 'faqih', password: 'NexaSecurePass2026!' }
    });
    assert.equal(badOrigin.status, 403);

    // 4. Brute-force lockout after 5 failures triggers 429 + P0 security alert
    const bruteHeaders = { 'X-Nexa-Monitor': '1', Origin: 'https://nexa.example.com', 'X-Forwarded-For': '203.0.113.55' };
    for (let i = 0; i < 4; i++) {
      const failRes = await httpRequest(port, 'POST', '/monitor/api/auth/login', {
        headers: bruteHeaders,
        body: { username: 'faqih', password: `wrong-${i}` }
      });
      assert.equal(failRes.status, 401);
    }
    const fifthFail = await httpRequest(port, 'POST', '/monitor/api/auth/login', {
      headers: bruteHeaders,
      body: { username: 'faqih', password: 'wrong-final' }
    });
    assert.equal(fifthFail.status, 429);
    assert.ok(Number(fifthFail.headers['retry-after']) > 0);
    assert.equal(alerts.length, 1);
    assert.match(alerts[0].text, /brute-force blocked/i);

    // Locked IP is blocked even with valid password
    const blockedValid = await httpRequest(port, 'POST', '/monitor/api/auth/login', {
      headers: bruteHeaders,
      body: { username: 'faqih', password: 'NexaSecurePass2026!' }
    });
    assert.equal(blockedValid.status, 429);

    // 5. Valid login from clean IP succeeds and issues HttpOnly SameSite=Strict cookie
    const goodHeaders = { 'X-Nexa-Monitor': '1', Origin: 'https://nexa.example.com', 'X-Forwarded-For': '198.51.100.10' };
    const loginRes = await httpRequest(port, 'POST', '/monitor/api/auth/login', {
      headers: goodHeaders,
      body: { username: 'faqih', password: 'NexaSecurePass2026!' }
    });
    assert.equal(loginRes.status, 200);
    assert.equal(loginRes.json.authenticated, true);
    const setCookie = Array.isArray(loginRes.headers['set-cookie'])
      ? loginRes.headers['set-cookie'][0]
      : loginRes.headers['set-cookie'];
    assert.ok(setCookie.includes(`${COOKIE_NAME}=`));
    assert.ok(setCookie.includes('HttpOnly'));
    assert.ok(setCookie.includes('SameSite=Strict'));
    const cookiePair = setCookie.split(';')[0];

    const authedHeaders = { ...goodHeaders, Cookie: cookiePair };

    // 6. Authenticated Overview, History, Issues, Controls, Reset Monit
    mon.recordIssue('HTTP-5XX', new Error('Test 502 error'));
    const ov = await httpRequest(port, 'GET', '/monitor/api/overview', { headers: { Cookie: cookiePair } });
    assert.equal(ov.status, 200);
    assert.ok(ov.json.snapshot.memory.rssMb > 0);
    assert.equal(ov.json.issues.unresolved, 1);

    const hist = await httpRequest(port, 'GET', '/monitor/api/metrics/history?range=24h', { headers: { Cookie: cookiePair } });
    assert.equal(hist.status, 200);
    assert.equal(hist.json.range, '24h');

    const issuesRes = await httpRequest(port, 'GET', '/monitor/api/issues?status=unresolved', { headers: { Cookie: cookiePair } });
    assert.equal(issuesRes.status, 200);
    const fp = issuesRes.json.issues[0].fingerprint;
    const resIssue = await httpRequest(port, 'POST', `/monitor/api/issues/${fp}/resolve`, { headers: authedHeaders });
    assert.equal(resIssue.status, 200);
    assert.equal(resIssue.json.status, 'resolved');

    const toggleAlert = await httpRequest(port, 'POST', '/monitor/api/controls/alerts/http_5xx_spike', {
      headers: authedHeaders,
      body: { enabled: true }
    });
    assert.equal(toggleAlert.status, 200);
    assert.equal(toggleAlert.json.enabled, true);

    const resetRes = await httpRequest(port, 'POST', '/monitor/api/actions/reset-metrics', { headers: authedHeaders });
    assert.equal(resetRes.status, 200);
    assert.equal(resetRes.json.ok, true);

    // 7. Single-use Ed25519 logs ticket minting & cryptographic signature check
    const ticketRes = await httpRequest(port, 'POST', '/monitor/api/logs/ticket', { headers: authedHeaders });
    assert.equal(ticketRes.status, 200);
    assert.equal(ticketRes.json.scope, 'logs');
    assert.equal(ticketRes.json.protocol, 'nexa-io-v1');
    const [payloadB64, sigB64] = ticketRes.json.ticket.split('.');
    const payloadBuf = Buffer.from(payloadB64, 'base64url');
    const sigBuf = Buffer.from(sigB64, 'base64url');
    assert.equal(crypto.verify(null, payloadBuf, edPub, sigBuf), true);
    const claims = JSON.parse(payloadBuf.toString('utf8'));
    assert.equal(claims.scope, 'logs');
    assert.ok(claims.dev.startsWith('web-monitor-'));
    assert.ok(claims.jti.length >= 12);

    // 8. Restart guard blocks 409 when Live Voice Call is active unless force=true
    activeCalls = 1;
    const restartBlocked = await httpRequest(port, 'POST', '/monitor/api/actions/restart', { headers: authedHeaders, body: {} });
    assert.equal(restartBlocked.status, 409);
    assert.equal(restartBlocked.json.code, 'LIVE_CALL_ACTIVE');
    activeCalls = 0;

    // 8b. Paket B endpoints: editable alert thresholds, cooldown, test alert, reset-breakers
    const editRuleRes = await httpRequest(port, 'POST', '/monitor/api/controls/alerts/high_rss', {
      headers: authedHeaders,
      body: { enabled: true, thresholdMb: 350, sustainedMinutes: 4 }
    });
    assert.equal(editRuleRes.status, 200);
    assert.equal(editRuleRes.json.thresholdMb, 350);
    assert.equal(editRuleRes.json.sustainedMinutes, 4);

    const cdRes = await httpRequest(port, 'POST', '/monitor/api/controls/alerts-settings', {
      headers: authedHeaders,
      body: { cooldownMinutes: 25 }
    });
    assert.equal(cdRes.status, 200);
    assert.equal(cdRes.json.cooldownMinutes, 25);

    const testAlertRes = await httpRequest(port, 'POST', '/monitor/api/controls/alerts/test', {
      headers: authedHeaders,
      body: {}
    });
    assert.equal(testAlertRes.status, 200);
    assert.equal(testAlertRes.json.ok, true);

    const resetBrkRes = await httpRequest(port, 'POST', '/monitor/api/actions/reset-breakers', {
      headers: authedHeaders,
      body: {}
    });
    assert.equal(resetBrkRes.status, 200);
    assert.equal(resetBrkRes.json.ok, true);

    // 9. Realtime Metrics WebSocket (/monitor/ws/metrics): 401 without cookie, zero idle timer
    assert.equal(wsMetrics.isPushActive, false);
    await assert.rejects(() => new Promise((resolve, reject) => {
      const wsBad = new WebSocket(`ws://127.0.0.1:${port}/monitor/ws/metrics`);
      wsBad.on('open', () => { wsBad.close(); resolve(); });
      wsBad.on('unexpected-response', (_req, res) => reject(new Error(`HTTP_${res.statusCode}`)));
      wsBad.on('error', reject);
    }), /HTTP_401/);
    assert.equal(wsMetrics.isPushActive, false);

    // Authenticated WS receives initial METRICS_TICK and clears timer on close
    const firstMsg = await new Promise((resolve, reject) => {
      const wsOk = new WebSocket(`ws://127.0.0.1:${port}/monitor/ws/metrics`, {
        headers: { Cookie: cookiePair, Origin: 'https://nexa.example.com' }
      });
      wsOk.on('message', (data) => {
        const parsed = JSON.parse(data.toString());
        assert.equal(wsMetrics.isPushActive, true);
        wsOk.close();
        wsOk.once('close', () => resolve(parsed));
      });
      wsOk.on('error', reject);
    });
    assert.equal(firstMsg.type, 'METRICS_TICK');
    assert.ok(firstMsg.snapshot.memory.rssMb > 0);

    // Wait one tick for close event cleanup
    await new Promise(r => setTimeout(r, 30));
    assert.equal(wsMetrics.clientCount, 0);
    assert.equal(wsMetrics.isPushActive, false, 'Push timer MUST stop immediately when 0 browser tabs are connected');

    // 10. Logout invalidates session cookie
    const logoutRes = await httpRequest(port, 'POST', '/monitor/api/auth/logout', { headers: authedHeaders });
    assert.equal(logoutRes.status, 200);
    const afterLogout = await httpRequest(port, 'GET', '/monitor/api/overview', { headers: { Cookie: cookiePair } });
    assert.equal(afterLogout.status, 401);
  } finally {
    ticketService.destroy();
    mon.destroy();
    if (typeof server.closeAllConnections === 'function') server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
});
