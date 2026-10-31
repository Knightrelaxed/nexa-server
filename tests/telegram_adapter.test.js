'use strict';
// ============================================================
// N.E.X.A — TELEGRAM ADAPTER & MODULES COMPREHENSIVE TEST
// Verifies all modularized components:
// 1. Adapter Webhook & Deduplication
// 2. Command Handler (/call, /search, /playbook, etc.)
// 3. Callback Handler (Identity, Hygiene, Recurring, Discipline)
// 4. Email Helpers (Dates, Filtering, Follow-ups)
// 5. Vault Handler (Metadata Normalization & KV Sweep)
// 6. Intent Dispatcher (Persona Classification & Layer Detection)
// ============================================================

const test = require('node:test');
const assert = require('node:assert');

const { handleTelegramWebhook } = require('../src/interfaces/telegram/adapter');
const commandHandler = require('../src/interfaces/telegram/command_handler');
const callbackHandler = require('../src/interfaces/telegram/callback_handler');
const followUpResolver = require('../src/interfaces/common/follow_up_resolver');
const vaultHandler = require('../src/interfaces/telegram/vault_handler');
const intentDispatcher = require('../src/interfaces/telegram/intent_dispatcher');

test('Telegram Module: follow_up_resolver detection and routing', () => {
  // 1. Nominal extraction (canonical source: common/helpers)
  const commonHelpers = require('../src/interfaces/common/helpers');
  const emailObj = {
    subject: 'Notifikasi Livin Mandiri',
    snippet: 'Transaksi QRIS berhasil sebesar Rp 75.000 di Kopi Kenangan'
  };
  const nominal = commonHelpers.extractNominalFromEmail(emailObj);
  assert.strictEqual(nominal, 75000, 'Nominal must be extracted correctly as 75000');

  // 2. Temporal filter parsing (canonical source: common/helpers)
  assert.deepStrictEqual(commonHelpers.getEmailTemporalFilterFromText('email hari ini'), { type: 'today' });
  assert.deepStrictEqual(commonHelpers.getEmailTemporalFilterFromText('cek mutasi kemarin'), { type: 'yesterday' });
  assert.deepStrictEqual(commonHelpers.getEmailTemporalFilterFromText('transaksi minggu lalu'), { type: 'last_week' });
  assert.strictEqual(commonHelpers.getEmailTemporalFilterFromText('halo nexa'), null);

  // 3. Day of month hint (canonical source: common/helpers)
  assert.strictEqual(commonHelpers.parseDayOfMonthHint('transaksi tanggal 15'), 15);
  assert.strictEqual(commonHelpers.parseDayOfMonthHint('tgl 3'), 3);
  assert.strictEqual(commonHelpers.parseDayOfMonthHint('halo'), null);

  // 4. Follow-up intent detection (canonical source: follow_up_resolver)
  assert.strictEqual(followUpResolver.isAmbiguousFollowUp('hapus itu'), true);
  assert.strictEqual(followUpResolver.isAmbiguousFollowUp('selesai'), true);
  assert.strictEqual(followUpResolver.isAmbiguousFollowUp('buat jadwal baru'), false);

  const followUpRouting = followUpResolver.buildGlobalFollowUpRouting('hapus itu', {
    intent: 'FINANCE',
    askedAt: Date.now()
  });
  assert.strictEqual(followUpRouting?.intent, 'FINANCE');
  assert.strictEqual(followUpRouting?.extracted_data?.action, 'DELETE');
});

test('Telegram Module: vault_handler metadata parsing and normalization', () => {
  // 1. Vault edit command parser
  const editStr = 'edit judul: KTP Faqih; nik: 3301234567890001; kategori: IDENTITAS';
  const parsedEdit = vaultHandler.parseVaultEditCommand(editStr);
  assert.strictEqual(parsedEdit?.judul, 'KTP Faqih');
  assert.strictEqual(parsedEdit?.nik, '3301234567890001');
  assert.strictEqual(parsedEdit?.kategori, 'IDENTITAS');

  // 2. Metadata formatter
  const formatted = vaultHandler.formatVaultMetadata({
    nomor_polisi: 'B 1234 XYZ',
    judul: 'STNK Motor'
  });
  assert.ok(formatted.includes('STNK Motor'), 'Formatted string must include title');
  assert.ok(formatted.includes('B 1234 XYZ'), 'Formatted string must include plate');

  // 3. Narrative detector
  assert.strictEqual(vaultHandler.looksNarrative('nik', '3301234567890001'), false);
  assert.strictEqual(vaultHandler.looksNarrative('status', 'aku dan kamu mau pergi ke sana dan makan di warung bersama teman'), true);
  assert.strictEqual(vaultHandler.looksNarrative('status', 'Deskripsi panjang '.repeat(20)), true);

  // 4. Metadata normalization
  const normalized = vaultHandler.normalizeVaultMetadata({
    field_1: '3301234567890001',
    nama_lengkap: 'Faqih Hidayatulloh'
  }, '', 'ktp.jpg');
  assert.strictEqual(normalized.nik, '3301234567890001', 'Generic field_1 with 16 digits should be renamed to nik');
  assert.strictEqual(normalized.nama_lengkap, 'Faqih Hidayatulloh');
  assert.strictEqual(normalized.judul, 'ktp.jpg');
});

test('Telegram Module: intent_dispatcher persona and layer classification', () => {
  // 1. User facts vs Nexa facts
  assert.strictEqual(intentDispatcher.isFactAboutNexa('Tuan Faqih suka minum kopi americano dingin tanpa gula'), false);
  assert.strictEqual(intentDispatcher.isFactAboutNexa('Aku suka belajar coding setiap malam'), false);
  assert.strictEqual(intentDispatcher.isFactAboutNexa('Kamu adalah asisten eksekutif bernama N.E.X.A'), true);
  assert.strictEqual(intentDispatcher.isFactAboutNexa('Nexa tidak boleh menggunakan bullet points'), true);
  assert.strictEqual(intentDispatcher.isFactAboutNexa('Ingat ya, jangan terlalu panjang saat menjawab'), true);

  // 2. Self-model layer classification
  assert.strictEqual(intentDispatcher.classifySelfModelLayer('Belum bisa mengontrol lampu pintar'), 'LIMITATIONS');
  assert.strictEqual(intentDispatcher.classifySelfModelLayer('Jangan pernah berasumsi nominal transaksi'), 'CORRECTIONS');
  assert.strictEqual(intentDispatcher.classifySelfModelLayer('Gunakan gaya bahasa santai dan ramah'), 'COMMUNICATION_STYLE');
  assert.strictEqual(intentDispatcher.classifySelfModelLayer('Mampu mengelola jadwal Google Calendar'), 'CAPABILITIES');
});

test('Telegram Module: command_handler intercepts direct slash commands', async () => {
  let replyText = null;
  const mockRespond = async (txt) => { replyText = txt; };
  const mockDeliver = () => {};

  // Direct Call test
  const callHandled = await commandHandler.handleDirectCommand('/call', {
    respondToTelegram: mockRespond,
    deliverWebhookReply: mockDeliver
  });
  assert.strictEqual(callHandled, true, '/call command must be intercepted');
  assert.ok(replyText.includes('Panggilan') || replyText.includes('Menghubungi'), 'Reply must mention call status');

  // Search without query
  const searchHandled = await commandHandler.handleDirectCommand('/search', {
    respondToTelegram: mockRespond,
    deliverWebhookReply: mockDeliver
  });
  assert.strictEqual(searchHandled, true, '/search command must be intercepted');
  assert.ok(replyText.includes('Format'), 'Empty /search should show usage format');

  // Capabilities command test
  const capHandled = await commandHandler.handleDirectCommand('/capabilities', {
    respondToTelegram: mockRespond,
    deliverWebhookReply: mockDeliver
  });
  assert.strictEqual(capHandled, true, '/capabilities command must be intercepted');
  assert.ok(replyText.includes('KAPABILITAS RESMI N.E.X.A'), 'Reply must show capabilities header');
  assert.ok(replyText.includes('FINANCE') && replyText.includes('DEVICE_CONTROL'), 'Reply must contain core domains');

  // Non-command
  const nonCommand = await commandHandler.handleDirectCommand('Halo apa kabar?', {
    respondToTelegram: mockRespond,
    deliverWebhookReply: mockDeliver
  });
  assert.strictEqual(nonCommand, false, 'Regular chat should not be intercepted as a command');
});

test('Telegram Module: adapter webhook deduplication and callback handling', async () => {
  // 1. Deduplication test
  let resStatus = null;
  let resBody = null;
  const mockRes = {
    status(s) { resStatus = s; return this; },
    send(b) { resBody = b; return this; },
    json(j) { resBody = j; return this; }
  };

  const req1 = { body: { update_id: 99887766 } };
  await handleTelegramWebhook(req1, mockRes);
  assert.strictEqual(resStatus, 200);

  // Send exact same update_id
  let secondResStatus = null;
  let secondResBody = null;
  const mockRes2 = {
    status(s) { secondResStatus = s; return this; },
    send(b) { secondResBody = b; return this; }
  };
  await handleTelegramWebhook(req1, mockRes2);
  assert.strictEqual(secondResStatus, 200, 'Duplicate update_id must be acknowledged with 200');
  assert.strictEqual(secondResBody, 'OK');

  // 2. Callback query handling test
  let cbHandled = false;
  let passedContextOps = null;
  const originalHandleCallbackQuery = callbackHandler.handleCallbackQuery;
  callbackHandler.handleCallbackQuery = async (cbQuery, contextOps) => {
    cbHandled = true;
    passedContextOps = contextOps;
    return true;
  };

  try {
    let cbResStatus = null;
    let cbResBody = null;
    const mockCbRes = {
      status(s) { cbResStatus = s; return this; },
      send(b) { cbResBody = b; return this; }
    };
    const cbReq = {
      body: {
        callback_query: {
          id: 'cb_test_1',
          data: 'HYGIENE_HOLD_ALL',
          message: { message_id: 12345, chat: { id: 111 } }
        }
      }
    };
    await handleTelegramWebhook(cbReq, mockCbRes);
    assert.strictEqual(cbResStatus, 200, 'Callback query must be acknowledged with 200 immediately');
    assert.strictEqual(cbHandled, true, 'Callback handler must be invoked');
    assert.strictEqual(typeof passedContextOps?.setConversationContext, 'function');
  } finally {
    callbackHandler.handleCallbackQuery = originalHandleCallbackQuery;
  }
});
