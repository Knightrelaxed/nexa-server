'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  redactSecrets,
  detectCategory,
  detectCategories,
  formatLine
} = require('../src/utils/logger');
const {
  buildAllowedOrigins,
  normalizeOrigin
} = require('../src/utils/cors_config');
const ecosystem = require('../ecosystem.config');

test('redactSecrets masks Bearer tokens, JWTs, query params, and provider API keys', () => {
  const sample = [
    'Authorization: Bearer super_secret_token_991122',
    'jwt=eyJhbGciOiJFZERTQSJ9.eyJzdWIiOiJ0dWFuIn0.c2lnbmF0dXJlMTIzNA',
    'url=https://nexa.example/ws?token=abc12345&secret=xyz987&mode=live',
    'gemini=AIzaSyDummyKeyValue1234567890abcdef',
    'groq=gsk_1234567890abcdefghijklmnop',
    'hf=hf_abcdefghijklmnopqrstuvwxyz1234'
  ].join(' | ');

  const out = redactSecrets(sample);
  assert.doesNotMatch(out, /super_secret_token_991122/);
  assert.doesNotMatch(out, /eyJhbGciOiJFZERTQSJ9/);
  assert.doesNotMatch(out, /abc12345/);
  assert.doesNotMatch(out, /xyz987/);
  assert.doesNotMatch(out, /AIzaSyDummyKeyValue/);
  assert.doesNotMatch(out, /gsk_1234567890/);
  assert.doesNotMatch(out, /hf_abcdefghij/);
  assert.match(out, /Bearer \[REDACTED\]/);
  assert.match(out, /\[JWT-REDACTED\]/);
  assert.match(out, /mode=live/);
});

test('redactSecrets masks JSON secrets, PEM private keys, bank accounts, and OTPs', () => {
  const jsonLog = '{"hmac_secret":"top-secret-hmac","auth_token":"tok_999","user":"tuan"}';
  const redactedJson = redactSecrets(jsonLog);
  assert.doesNotMatch(redactedJson, /top-secret-hmac/);
  assert.doesNotMatch(redactedJson, /tok_999/);
  assert.match(redactedJson, /"user":"tuan"/);

  const pemLog = 'Loaded -----BEGIN PRIVATE KEY-----\nMC4CAQAwBQYDK2VwBCIEI...\n-----END PRIVATE KEY----- ok';
  const redactedPem = redactSecrets(pemLog);
  assert.doesNotMatch(redactedPem, /MC4CAQAw/);
  assert.match(redactedPem, /\[PRIVATE-KEY-REDACTED\]/);

  const financeLog = 'Mutasi rekening 1370001234882 berhasil, OTP: 849201';
  const redactedFinance = redactSecrets(financeLog);
  assert.doesNotMatch(redactedFinance, /1370001234882/);
  assert.doesNotMatch(redactedFinance, /849201/);
  assert.match(redactedFinance, /\[ACC-\*\*\*\*4882\]/);
  assert.match(redactedFinance, /\[OTP-REDACTED\]/);
});

test('detectCategory and formatLine attach canonical [cat=...] tags and optional syslog priority', () => {
  assert.equal(detectCategory('[SUPABASE_FINANCE] Mutasi Rp500.000 berhasil'), 'FINANCE');
  assert.equal(detectCategory('[NEXA-ADAPTER-MOBILE] Samsung A33 terhubung'), 'BRIDGE');
  assert.equal(detectCategory('[NEXA-AUTH] Tiket diterbitkan scope=logs'), 'AUTH');
  assert.equal(detectCategory('[cat=FINANCE] Explicit tag kept'), 'FINANCE');
  assert.equal(detectCategory('Generic boot log line'), null);

  const formattedPlain = formatLine('INFO', '[SUPABASE_FINANCE] Mutasi rekening 1370001234882', {
    useSyslogPrefix: false
  });
  assert.equal(formattedPlain.category, 'FINANCE');
  assert.equal(formattedPlain.outputLine, '[cat=FINANCE] [SUPABASE_FINANCE] Mutasi rekening [ACC-****4882]');

  const formattedJournal = formatLine('WARN', '[NEXA-AUTH] Replay nonce detected', {
    useSyslogPrefix: true
  });
  assert.equal(formattedJournal.outputLine, '<4>[cat=AUTH] [NEXA-AUTH] Replay nonce detected');

  // Does not duplicate explicit [cat=...]
  const explicitLine = formatLine('ERROR', '[cat=BRIDGE] Socket closed', {
    useSyslogPrefix: true
  });
  assert.equal(explicitLine.outputLine, '<3>[cat=BRIDGE] Socket closed');
});

test('buildAllowedOrigins supports custom NEXA_DOMAIN and multi-origin cutover list', () => {
  assert.equal(normalizeOrigin('nexa.tuan.id/'), 'https://nexa.tuan.id');
  assert.equal(normalizeOrigin('https://custom.nexa.dev///'), 'https://custom.nexa.dev');

  const origins = buildAllowedOrigins({
    NEXA_DOMAIN: 'nexa.tuan.id',
    NEXA_ALLOWED_ORIGINS: 'https://staging.tuan.id, http://192.168.1.5:3000'
  });

  assert.ok(origins.includes('https://nexa.tuan.id'));
  assert.ok(origins.includes('https://staging.tuan.id'));
  assert.ok(origins.includes('http://192.168.1.5:3000'));
  assert.ok(origins.includes('https://nexa-server.indonesiacentral.cloudapp.azure.com'));
  assert.ok(origins.includes('http://localhost:3000'));
});

test('ecosystem.config.js enforces calibrated V8 heap, PM2 memory guard, and syslog priority prefix', () => {
  assert.equal(ecosystem.apps.length, 1);
  const app = ecosystem.apps[0];
  assert.equal(app.name, 'nexa-server');
  assert.equal(app.script, 'src/app.js');
  assert.equal(app.node_args, '--max-old-space-size=320');
  assert.equal(app.max_memory_restart, '420M');
  assert.equal(app.env.NEXA_SYSLOG_PREFIX, '1');
});

test('log filtering coverage: budget/dedup/step-up carry FINANCE, live-tool carries BRIDGE, multi-tag works', () => {
  assert.equal(detectCategory('[BUDGET_ENGINE] checkAndAlertBudget error: timeout'), 'FINANCE');
  assert.equal(detectCategory('[BUDGET] Telegram alert failed: 429'), 'FINANCE');
  assert.equal(detectCategory('[SUPABASE] Error saving pending transaction: ECONNRESET'), 'FINANCE');
  assert.equal(detectCategory('[LIVE-TOOL] Execution error in controlDeviceHardware: timeout'), 'BRIDGE');

  const stepUpCats = detectCategories('[cat=AUTH] [NEXA-AUTH] ACTION_PENDING created action_id=act-1 amount=350000');
  assert.deepEqual(stepUpCats, ['FINANCE', 'AUTH']);

  const formattedStepUp = formatLine(
    'INFO',
    '[cat=AUTH] [NEXA-AUTH] ACTION_PENDING created action_id=act-1 amount=350000',
    { useSyslogPrefix: true }
  );
  assert.equal(
    formattedStepUp.outputLine,
    '<6>[cat=FINANCE][cat=AUTH] [NEXA-AUTH] ACTION_PENDING created action_id=act-1 amount=350000'
  );

  // WARN line under PM2 with NEXA_SYSLOG_PREFIX=1 preserves <4> priority distinct from <3> ERROR
  const formattedWarn = formatLine('WARN', '[FINANCE] Recovery resend failed', { useSyslogPrefix: true });
  assert.equal(formattedWarn.outputLine, '<4>[cat=FINANCE] [FINANCE] Recovery resend failed');
});
