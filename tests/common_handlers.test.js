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
