'use strict';
// ============================================================
// N.E.X.A — CLI ADAPTER & MODULES COMPREHENSIVE TEST
// Verifies all modularized components in src/interfaces/cli:
// 1. Follow-up & Clarification Helpers (Ambiguity, Validation)
// 2. Interceptors & Pending State Machines (HTML stripping, maps)
// 3. Intent Dispatcher (Persona, Self-Model Layers, Email Tx extraction)
// 4. Adapter Webhook (Ping, Input Validation, Session Tracking, SSE)
// ============================================================

const test = require('node:test');
const assert = require('node:assert');

const followUpHelpers = require('../src/interfaces/cli/follow_up_helpers');
const interceptors = require('../src/interfaces/cli/interceptors');
const intentDispatcher = require('../src/interfaces/cli/intent_dispatcher');
const {
  handleCliWebhook,
  pushToCli,
  _trackAdviceSession,
  _getAdviceSessionCount
} = require('../src/interfaces/cli/adapter');

test('CLI Module: follow_up_helpers detection and resolution', () => {
  // 1. Ambiguous follow-up cues
  assert.strictEqual(followUpHelpers.isAmbiguousFollowUp('lanjut'), true);
  assert.strictEqual(followUpHelpers.isAmbiguousFollowUp('hapus itu'), true);
  assert.strictEqual(followUpHelpers.isAmbiguousFollowUp('ubah itu'), true);
  assert.strictEqual(followUpHelpers.isAmbiguousFollowUp('buat jadwal baru besok'), false);

  // 2. Strong new intent cue
  assert.strictEqual(followUpHelpers.hasStrongNewIntentCue('baca email saya'), true);
  assert.strictEqual(followUpHelpers.hasStrongNewIntentCue('cek kalender'), true);
  assert.strictEqual(followUpHelpers.hasStrongNewIntentCue('lanjut'), false);

  // 3. Resolve ambiguous follow-up with context
  const mockContext = {
    intent: 'FINANCE',
    askedAt: Date.now(),
    extractedData: { search_keyword: 'kopi' }
  };
  const resolvedFinance = followUpHelpers.resolveAmbiguousFollowUp('hapus itu', mockContext);
  assert.ok(resolvedFinance, 'Should resolve ambiguous follow-up for FINANCE');
  assert.strictEqual(resolvedFinance.intent, 'FINANCE');
  assert.strictEqual(resolvedFinance.extracted_data.action, 'DELETE');
  assert.strictEqual(resolvedFinance.extracted_data.search_keyword, 'kopi');

  const taskContext = {
    intent: 'TASK',
    askedAt: Date.now(),
    extractedData: { title: 'Tugas Skripsi' }
  };
  const resolvedTask = followUpHelpers.resolveAmbiguousFollowUp('selesaikan itu', taskContext);
  assert.ok(resolvedTask, 'Should resolve ambiguous follow-up for TASK');
  assert.strictEqual(resolvedTask.intent, 'TASK');
  assert.strictEqual(resolvedTask.extracted_data.action, 'COMPLETE');

  // 4. Expired context should return null
  const expiredContext = {
    intent: 'FINANCE',
    askedAt: Date.now() - 15 * 60 * 1000
  };
  assert.strictEqual(followUpHelpers.resolveAmbiguousFollowUp('hapus itu', expiredContext), null);
});

test('CLI Module: getClarificationMessage validation', () => {
  // Missing finance nominal
  const invalidFinance = { intent: 'FINANCE', extracted_data: { action: 'RECORD', nominal: null } };
  assert.ok(followUpHelpers.getClarificationMessage(invalidFinance, 'catat pengeluaran').includes('Nominal transaksi belum valid'));

  // Missing calendar summary
  const invalidCal = { intent: 'CALENDAR', extracted_data: { action: 'CREATE', summary: '' } };
  assert.ok(followUpHelpers.getClarificationMessage(invalidCal, 'buat jadwal').includes('Nama agendanya apa'));

  // Missing task title
  const invalidTask = { intent: 'TASK', extracted_data: { action: 'CREATE', title: '' } };
  assert.ok(followUpHelpers.getClarificationMessage(invalidTask, 'buat tugas').includes('Nama tugas yang ingin dibuat apa'));

  // Valid intent returns null
  const validTask = { intent: 'TASK', extracted_data: { action: 'CREATE', title: 'Belajar Math' } };
  assert.strictEqual(followUpHelpers.getClarificationMessage(validTask, 'tugas baru'), null);
});

test('CLI Module: interceptors utilities and pending state', () => {
  // HTML Stripping
  const rawHtml = '<b>Halo</b> &amp; selamat &lt;pagi&gt; &quot;Tuan&quot;';
  const clean = interceptors.stripHtml(rawHtml);
  assert.strictEqual(clean, 'Halo & selamat <pagi> "Tuan"');

  // Pending maps integrity
  assert.ok(interceptors.cliPendingCalendar instanceof Map);
  assert.ok(interceptors.cliPendingConflict instanceof Map);
  assert.ok(interceptors.cliPendingEmail instanceof Map);
  assert.ok(interceptors.cliPendingDatabase instanceof Map);
});

test('CLI Module: intent_dispatcher classification and email extraction', () => {
  // 1. isFactAboutNexa
  assert.strictEqual(intentDispatcher.isFactAboutNexa('kamu adalah asisten cerdas nexa'), true);
  assert.strictEqual(intentDispatcher.isFactAboutNexa('aku suka minum kopi tanpa gula'), false);

  // 2. classifySelfModelLayer
  assert.strictEqual(intentDispatcher.classifySelfModelLayer('kamu tidak bisa memutar audio'), 'LIMITATIONS');
  assert.strictEqual(intentDispatcher.classifySelfModelLayer('tolong jangan gunakan sapaan Anda'), 'CORRECTIONS');
  assert.strictEqual(intentDispatcher.classifySelfModelLayer('gaya bahasa kamu harus lebih santai'), 'COMMUNICATION_STYLE');
  assert.strictEqual(intentDispatcher.classifySelfModelLayer('kamu mampu sinkronisasi kalender'), 'CAPABILITIES');

  // 3. extractFinanceTxFromEmails
  const mockEmails = [
    {
      subject: 'Pembayaran QRIS',
      body: 'Nominal transaksi Rp 45.000 penerima Kopi Kenangan berhasil',
      snippet: 'Rp 45.000 ke Kopi Kenangan',
      date: '2026-10-18T09:00:00Z'
    }
  ];
  const txList = intentDispatcher.extractFinanceTxFromEmails(mockEmails);
  assert.strictEqual(txList.length, 1);
  assert.strictEqual(txList[0].nominal, 45000);
  assert.strictEqual(txList[0].type, 'EXPENSE');
  assert.ok(txList[0].destination.includes('Kopi Kenangan'));
});

test('CLI Module: adapter ping, validation, session tracking, and SSE push', async () => {
  // 1. Ping check
  let pingStatusCode = null;
  let pingResult = null;
  const pingReq = { body: { message: '__ping__' } };
  const pingRes = {
    status(code) { pingStatusCode = code; return this; },
    json(data) { pingResult = data; return this; }
  };
  await handleCliWebhook(pingReq, pingRes);
  assert.strictEqual(pingStatusCode, 200);
  assert.strictEqual(pingResult.reply, 'pong');
  assert.strictEqual(pingResult.intent, 'PING');

  // 2. Empty message validation
  let errStatusCode = null;
  let errResult = null;
  const emptyReq = { body: { message: '   ' } };
  const emptyRes = {
    status(code) { errStatusCode = code; return this; },
    json(data) { errResult = data; return this; }
  };
  await handleCliWebhook(emptyReq, emptyRes);
  assert.strictEqual(errStatusCode, 400);
  assert.strictEqual(errResult.ok, false);

  // 3. Advice session tracking
  const sessionId = 'test-session-' + Date.now();
  const c1 = _trackAdviceSession(sessionId);
  assert.strictEqual(c1, 1);
  const c2 = _trackAdviceSession(sessionId);
  assert.strictEqual(c2, 2);
  assert.strictEqual(_getAdviceSessionCount(sessionId), 2);

  // 4. pushToCli with no connected clients
  const pushed = pushToCli('test notification');
  assert.strictEqual(pushed, false);
});
