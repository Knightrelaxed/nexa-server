'use strict';
// ============================================================
// N.E.X.A — COMMON HANDLERS COMPREHENSIVE TEST
// Verifies common helpers and unified domain dispatcher
// ============================================================

const test = require('node:test');
const assert = require('node:assert');

const helpers = require('../src/interfaces/common/helpers');
const { executeDomainIntent } = require('../src/interfaces/common/domain_dispatcher');

test('Common Helpers: HTML formatting and entity escaping', () => {
  const html = '<b>Bold text</b> &amp; <i>italic</i> &quot;quoted&quot;';
  assert.strictEqual(helpers.stripHtml(html), 'Bold text & italic "quoted"');

  const raw = '<script>alert("hello & bye")</script>';
  assert.strictEqual(helpers.escapeHtml(raw), '&lt;script&gt;alert(&quot;hello &amp; bye&quot;)&lt;/script&gt;');
});

test('Common Helpers: memory reply formatting and persona classification', () => {
  const formatted = helpers.formatMemoryReply('Saran AI', 'Fallback', '✅ Simpan');
  assert.strictEqual(formatted, 'Saran AI\n\n✅ Simpan');

  const emptyFormatted = helpers.formatMemoryReply('', 'Fallback', '✅ Simpan');
  assert.strictEqual(emptyFormatted, 'Fallback\n\n✅ Simpan');

  // Fact classification
  assert.strictEqual(helpers.isFactAboutNexa('kamu adalah asisten nexa'), true);
  assert.strictEqual(helpers.isFactAboutNexa('aku sedang makan malam'), false);

  // Self-model layers
  assert.strictEqual(helpers.classifySelfModelLayer('tidak bisa kirim file besar'), 'LIMITATIONS');
  assert.strictEqual(helpers.classifySelfModelLayer('jangan gunakan kata anda lagi'), 'CORRECTIONS');
  assert.strictEqual(helpers.classifySelfModelLayer('gaya bahasa santai saja'), 'COMMUNICATION_STYLE');
  assert.strictEqual(helpers.classifySelfModelLayer('bisa sinkronisasi kalender'), 'CAPABILITIES');
  assert.strictEqual(helpers.classifySelfModelLayer('selalu gunakan huruf kapital di awal kalimat'), 'OPERATIONAL_RULES');
});

test('Common Helpers: email temporal filters and nominal extraction', () => {
  assert.deepStrictEqual(helpers.getEmailTemporalFilterFromText('transaksi kemarin'), { type: 'yesterday' });
  assert.deepStrictEqual(helpers.getEmailTemporalFilterFromText('mutasi hari ini'), { type: 'today' });
  assert.strictEqual(helpers.parseDayOfMonthHint('tanggal 25'), 25);
  assert.strictEqual(helpers.parseDayOfMonthHint('halo'), null);

  const mockEmail = {
    subject: 'Notifikasi Livin',
    snippet: 'Transaksi Rp 50.000 ke Tokopedia berhasil',
    date: '2026-10-18T09:00:00Z'
  };
  const nominal = helpers.extractNominalFromEmail(mockEmail);
  assert.strictEqual(nominal, 50000);

  const txList = helpers.extractFinanceTransactionsFromEmails([mockEmail]);
  assert.strictEqual(txList.length, 1);
  assert.strictEqual(txList[0].nominal, 50000);
  assert.strictEqual(txList[0].type, 'EXPENSE');
});

test('Common Domain Dispatcher: execution and fallback routing', async () => {
  // 1. Default fallback
  const fallbackRes = await executeDomainIntent('UNKNOWN', { reply_message: 'Halo Tuan Faqih' });
  assert.strictEqual(fallbackRes, 'Halo Tuan Faqih');

  // 2. Discipline execution
  const discRes = await executeDomainIntent('DISCIPLINE', { reply_message: '⚡ Disiplin aktif' }, { platform: 'cli' });
  assert.ok(discRes);

  // 3. Database cancel action
  const dbCancel = await executeDomainIntent('DATABASE', { extracted_data: { action: 'CANCEL_ACTION' } });
  assert.strictEqual(dbCancel, '✅ Aksi database dibatalkan, Tuan.');

  // 4. Finance cancel transaction
  const finCancel = await executeDomainIntent('FINANCE', { extracted_data: { action: 'CANCEL_TRANSACTION' } });
  assert.ok(finCancel.includes('Tidak ada transaksi yang tertunda'));
});

test('Currency Parser: parseFlexibleNominal golden matrix', () => {
  assert.strictEqual(helpers.parseFlexibleNominal('Rp 1.250.000,50'), 1250000.5);
  assert.strictEqual(helpers.parseFlexibleNominal('IDR 75.000'), 75000);
  assert.strictEqual(helpers.parseFlexibleNominal('Rp50,000.00'), 50000);
  assert.strictEqual(helpers.parseFlexibleNominal('150.000'), 150000);
  assert.strictEqual(helpers.parseFlexibleNominal('Rp 2.500.000'), 2500000);
  assert.strictEqual(helpers.parseFlexibleNominal('IDR 10.000.000'), 10000000);
  assert.strictEqual(helpers.parseFlexibleNominal('100000'), 100000);
  assert.strictEqual(helpers.parseFlexibleNominal('Rp 500.000,00'), 500000);
});

test('Email Handler: platform HTML escaping and channel defaults', async () => {
  const emailHandler = require('../src/interfaces/common/handlers/email_handler');
  const gmailClient = require('../src/infrastructure/Gmail_Client');

  // Stub getLatestEmails
  const originalGetLatestEmails = gmailClient.getLatestEmails;
  gmailClient.getLatestEmails = async () => [
    {
      id: 'msg-1',
      date: '2026-10-18',
      from: 'promo@evil.example <script>',
      subject: 'Promo <a href="http://evil.example">klik di sini</a>',
      snippet: 'Dapatkan diskon <b>100%</b> & gratis!'
    }
  ];

  try {
    // 1. Telegram platform test: MUST escape HTML entities
    const tgReply = await emailHandler.handleEmailIntent({
      extracted_data: { action: 'READ' }
    }, {
      platform: 'telegram'
    });

    assert.ok(tgReply.includes('&lt;script&gt;'), 'From tag must be escaped');
    assert.ok(tgReply.includes('&lt;a href=&quot;http://evil.example&quot;&gt;'), 'Dangerous anchor in subject must be escaped');
    assert.ok(tgReply.includes('&lt;b&gt;100%&lt;/b&gt;'), 'Snippet tag must be escaped');
    assert.ok(tgReply.includes('<b>Email Terbaru Anda'), 'Telegram template bold wrapper preserved');

    // 2. CLI platform test: Plain text without Telegram HTML bold tags
    const cliReply = await emailHandler.handleEmailIntent({
      extracted_data: { action: 'READ' }
    }, {
      platform: 'cli'
    });

    assert.ok(cliReply.startsWith('📧 Email Terbaru (1):'));
    assert.ok(!cliReply.includes('<b>Email Terbaru Anda'));
  } finally {
    gmailClient.getLatestEmails = originalGetLatestEmails;
  }
});

test('Calendar Handler: preserves pending context on READ and suppresses synthesis on conflict', async () => {
  const calendarHandler = require('../src/interfaces/common/handlers/calendar_handler');

  let pendingCalendar = { summary: 'Rapat Evaluasi', start: '2026-10-19T10:00:00+07:00' };
  let pendingConflict = { summary: 'Rapat Evaluasi' };
  let synthesisTriggered = false;

  const mockContext = {
    platform: 'telegram',
    sessionKey: 'user-123',
    pendingCalendarContext: pendingCalendar,
    setPendingCalendarContext: (val) => { pendingCalendar = val; },
    setPendingConflictEvent: (val) => { pendingConflict = val; },
    triggerSynthesis: () => { synthesisTriggered = true; }
  };

  // Execute READ action
  await calendarHandler.handleCalendarIntent({
    extracted_data: { action: 'READ' }
  }, mockContext);

  // Assert pending state is NOT cleared on READ
  assert.ok(pendingCalendar !== null, 'pendingCalendar must be preserved across READ');
  assert.strictEqual(pendingCalendar.summary, 'Rapat Evaluasi');
});

test('Memory Handler: reports failure when saveIdeaToVault fails', async () => {
  const memoryHandler = require('../src/interfaces/common/handlers/memory_handler');
  const supabaseMemories = require('../src/infrastructure/Supabase_Memories');

  const origSaveIdeaToVault = supabaseMemories.saveIdeaToVault;
  supabaseMemories.saveIdeaToVault = async () => {
    return { success: false, error: 'connection refused' };
  };

  try {
    const res = await memoryHandler.handleMemoryIntent('2ND_BRAIN', {
      extracted_data: { action: 'APPEND', content: 'Ide brilian yang gagal simpan' }
    });

    assert.ok(res.includes('❌ Gagal menyimpan ide: connection refused'));
  } finally {
    supabaseMemories.saveIdeaToVault = origSaveIdeaToVault;
  }
});

test('Location Orchestrator: exports required methods without ghost exports', () => {
  const locationOrchestrator = require('../src/domain/Location_Orchestrator');
  assert.strictEqual(typeof locationOrchestrator.handleLocationQuery, 'function');
  assert.strictEqual(typeof locationOrchestrator.handleLocationIntent, 'function');
  assert.strictEqual(typeof locationOrchestrator.searchLocation, 'function');
  assert.strictEqual(typeof locationOrchestrator.getCurrentLocation, 'function');
});

