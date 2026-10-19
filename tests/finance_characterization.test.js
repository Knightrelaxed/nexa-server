'use strict';
// =====================================================================
// finance_characterization.test.js - golden-master test for Finance_Engine
//
// Purpose: prove that a refactor does not change behaviour. It runs the public Finance_Engine API against
// deterministic stubs (fixed clock, fake database, fake LLM) and compares every result - and every call made to
// the stubs - with a recording made BEFORE the refactor.
//
//   RECORD_GOLDEN=1 node --test tests/finance_characterization.test.js     record (run on the ORIGINAL code)
//   node --test tests/finance_characterization.test.js                     compare (run after the refactor)
//
// Record on YOUR machine: number/date formatting depends on the Node/ICU build, so a recording made elsewhere
// can differ. Without a recording the tests are skipped, never failed.
// =====================================================================
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const FIXTURE = path.join(__dirname, 'fixtures', 'finance_golden.json');
const RECORD = process.env.RECORD_GOLDEN === '1';
const golden = !RECORD && fs.existsSync(FIXTURE) ? JSON.parse(fs.readFileSync(FIXTURE, 'utf8')) : null;

// ---- fixed clock: 2026-10-14 12:00 WIB ----
const FIXED = Date.UTC(2026, 9, 14, 5, 0, 0);
const RealDate = Date;
class FakeDate extends RealDate {
  constructor(...a) { if (a.length === 0) super(FIXED); else super(...a); }
  static now() { return FIXED; }
}

// ---- stubs ----
const calls = [];
const rec = (name, fn) => async (...a) => { calls.push(name); return fn ? fn(...a) : undefined; };
const day = n => `2026-10-${String(n).padStart(2, '0')}`;
const canned = {
  getFinanceAnalytics: { totalIncome: 5000000, totalExpense: 3200000, net: 1800000, balance: 2650000, count: 42, transactionCount: 42,
    income: 5000000, expense: 3200000, savingRate: 36, avgDaily: 106666, incomeCount: 2, expenseCount: 40 },
  getAccountBalances: [{ id: 'a1', name: 'Bank Mandiri', type: 'BANK', balance: 2500000 }, { id: 'a2', name: 'Cash', type: 'CASH', balance: 150000 }],
  getPeriodComparison: { current: { income: 5000000, expense: 3200000, count: 42, total_income: 5000000, total_expense: 3200000 },
                         previous: { income: 4500000, expense: 3600000, count: 38, total_income: 4500000, total_expense: 3600000 } },
  getCategoryBreakdown: [{ name: 'Makan Berat / Makan Luar', total: 900000, percentage: 28, count: 30 },
                         { name: 'Jajan / Ngopi / Kafe', total: 450000, percentage: 14, count: 22 },
                         { name: 'Transportasi Umum', total: 300000, percentage: 9, count: 12 }],
  getTopExpenses: [1, 2, 3].map(i => ({ description: `Belanja ${i}`, merchant: `Toko ${i}`, nominal: i * 150000, amount: i * 150000,
    category: 'Makan Berat / Makan Luar', category_name: 'Makan Berat / Makan Luar', date: day(10 + i), created_at: `${day(10 + i)}T05:00:00Z`, account: 'Cash' })),
  getMonthlySummary: ['2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10']
    .map((month, i) => ({ month, total_income: 4000000 + i * 100000, total_expense: 3000000 + i * 150000 })),
  getDailyTrend: Array.from({ length: 14 }, (_, i) => ({ date: day(i + 1), expense: (i % 4) * 25000, income: i === 0 ? 5000000 : 0 })),
  getDailyBalanceTrend: Array.from({ length: 14 }, (_, i) => ({ date: day(i + 1), day: day(i + 1), running_balance: 2000000 + i * 10000,
    total_income: i === 0 ? 5000000 : 0, total_expense: (i % 4) * 25000 })),
  getAccountsList: [{ name: 'Bank Mandiri', type: 'BANK' }, { name: 'Cash', type: 'CASH' }],
  getCategoriesList: [{ name: 'Makan Berat / Makan Luar' }, { name: 'Jajan / Ngopi / Kafe' }, { name: 'Lainnya' }],
  // Write path: succeed, so processTransaction runs to the end (budget check, behaviour log, Telegram via inline requires).
  writeTransaction: { status: 'SUCCESS', id: 'tx-1' },
  readTransactions: [
    { id: 't1', type: 'expense', amount: 25000, description: 'Kopi Kenangan', transaction_date: '2026-10-14', transaction_time: '09:30',
      categories: { name: 'Jajan / Ngopi / Kafe' }, accounts: { name: 'Cash' }, payment_method: 'Cash' },
    { id: 't2', type: 'expense', amount: 54000, description: 'Netflix', transaction_date: '2026-10-05', transaction_time: '08:00',
      categories: { name: 'Langganan' }, accounts: { name: 'Bank Mandiri' }, payment_method: 'QRIS' },
    { id: 't3', type: 'income', amount: 5000000, description: 'Kiriman bulanan', transaction_date: '2026-10-01', transaction_time: '07:00',
      categories: { name: 'Pemasukan' }, accounts: { name: 'Bank Mandiri' }, payment_method: 'Transfer' }
  ]
};
const supabaseFinanceStub = new Proxy({}, {
  get(_, key) {
    if (typeof key === 'symbol' || key === 'then') return undefined;
    if (key in canned) return async (...a) => { calls.push(`SF.${key}`); return JSON.parse(JSON.stringify(canned[key])); };
    // reads default to an empty list; writes/updates/deletes default to success
    return async () => { calls.push(`SF.${String(key)}`); return /^(get|read|list|find|search|fetch)/.test(String(key)) ? [] : { status: 'SUCCESS' }; };
  }
});
const anyStub = (label) => new Proxy({}, {
  get(_, key) { if (typeof key === 'symbol' || key === 'then') return undefined; return async () => { calls.push(`${label}.${String(key)}`); return { ok: true }; }; }
});
function stubModule(rel, exportsObj) {
  const id = require.resolve(rel);
  require.cache[id] = { id, filename: id, loaded: true, exports: exportsObj, children: [], paths: [] };
}

const supabaseMemoriesStub = new Proxy({}, {
  get(_, key) {
    if (typeof key === 'symbol' || key === 'then') return undefined;
    if (key === 'isDuplicateTransaction') return async () => { calls.push('SM.isDuplicateTransaction'); return false; };
    if (key === 'getPendingTransactions') return async () => {
      calls.push('SM.getPendingTransactions');
      return [
        {
          composite_key: 'test_recovered_key',
          created_at: new Date(FIXED - 6 * 60 * 1000).toISOString(),
          tx_data: {
            nominal: 18200,
            type: 'EXPENSE',
            destination: 'GRAB FOOD',
            description: '[Menunggu Detail User]',
            category: 'Lainnya',
            time: new Date(FIXED - 6 * 60 * 1000).toISOString(),
            isAutoSyncEmail: true
          }
        }
      ];
    };
    if (key === 'savePendingTransaction') return async () => { calls.push('SM.savePendingTransaction'); return { status: 'SUCCESS' }; };
    if (key === 'deletePendingTransaction') return async () => { calls.push('SM.deletePendingTransaction'); return { status: 'SUCCESS' }; };
    if (key === 'logTransactionKey') return async () => { calls.push('SM.logTransactionKey'); return { status: 'SUCCESS' }; };
    if (key === 'markPendingTransactionSent') return async () => { calls.push('SM.markPendingTransactionSent'); return { status: 'SUCCESS' }; };
    return async () => { calls.push(`SM.${String(key)}`); return { status: 'SUCCESS' }; };
  }
});

let engine = null;
let mockEmails = [];
const savedConsole = {};
const realTimers = { setTimeout: global.setTimeout, setInterval: global.setInterval };
test.before(() => {
  global.Date = FakeDate;
  // Engine timers (e.g. the 5-minute auto-save of a pending confirmation) must not keep the test process alive.
  global.setTimeout = (...a) => { const h = realTimers.setTimeout(...a); if (h && h.unref) h.unref(); return h; };
  global.setInterval = (...a) => { const h = realTimers.setInterval(...a); if (h && h.unref) h.unref(); return h; };
  for (const k of ['log', 'warn', 'error', 'info']) { savedConsole[k] = console[k]; console[k] = () => {}; }
  stubModule('../src/infrastructure/Supabase_Finance', supabaseFinanceStub);
  stubModule('../src/infrastructure/Supabase_Memories', supabaseMemoriesStub);
  stubModule('../src/infrastructure/Gmail_Client', { getLatestEmails: async () => { calls.push('Gmail.getLatestEmails'); return mockEmails; }, deleteEmail: async () => {}, sendEmail: async () => {}, watchMailbox: async () => {}, resetGmailClient: () => {} });
  stubModule('../src/core/AI_Router', { callAI: async () => { calls.push('AI.callAI'); return 'Jajan / Ngopi / Kafe'; } });
  stubModule('../src/interfaces/webhook', { sendTelegramOutbound: async () => { calls.push('webhook.sendTelegramOutbound'); return { ok: true }; } });
  stubModule('../src/utils/telegram_network', { sendTelegramMessage: async () => { calls.push('net.sendTelegramMessage'); return { ok: true }; } });
  stubModule('../src/domain/Behavior_Engine', anyStub('Behavior'));
  stubModule('../src/domain/Budget_Engine', anyStub('Budget'));
  engine = require('../src/domain/Finance_Engine');
});
test.after(() => {
  global.Date = RealDate;
  global.setTimeout = realTimers.setTimeout;
  global.setInterval = realTimers.setInterval;
  for (const k of Object.keys(savedConsole)) console[k] = savedConsole[k];
  if (RECORD) {
    fs.mkdirSync(path.dirname(FIXTURE), { recursive: true });
    fs.writeFileSync(FIXTURE, JSON.stringify(recorded, null, 2) + '\n');
  }
});

const recorded = { exports: {}, cases: {} };
const periods = [null, 'hari ini', 'minggu ini', 'bulan ini', 'bulan lalu'];
const CASES = {
  'parse: flexible currency': () => ['25rb', 'Rp 1.250.000', '1,5jt', '2.5 juta', '50k', '$12.50', 'abc', ''].map(s => engine._parseFlexibleCurrency(s)),
  'categorize: valid category is kept': () => engine._autoCategorizeMerchant('Warung', 'Makan Berat / Makan Luar'),
  'categorize: AI path (Lainnya)': () => engine._autoCategorizeMerchant('Kopi Kenangan', 'Lainnya'),
  'ledger: processTransaction (expense)': () => engine.processTransaction({ type: 'EXPENSE', nominal: 25000, destination: 'Warung Bu Tini', description: 'Makan siang', category: 'Makan Berat / Makan Luar', account: 'Cash', time: '2026-10-14T05:00:00Z' }, 'TEXT'),
  'ledger: processTransaction (invalid nominal)': () => engine.processTransaction({ nominal: 'abc', destination: 'X' }, 'TEXT'),
  'ledger: processTransaction (email duplicate path)': () => engine.processTransaction({ type: 'EXPENSE', nominal: 54000, destination: 'Netflix', time: '2026-10-14T05:00:00Z' }, 'GMAIL_POLLING'),
  'ledger: getRecentTransactions': () => engine.getRecentTransactions(3),
  'ledger: searchTransactions': () => engine.searchTransactions({ keyword: 'kopi', period: 'bulan ini' }),
  'confirm: pending context (empty)': () => engine.getPendingConfirmationsContext(),
  'confirm: pending count': () => engine.getPendingConfirmationsCount(),
  'confirm: confirmPendingTransactions(true) with nothing pending': () => engine.confirmPendingTransactions(true),
  'confirm: resolveTargetKeyFromSnippet': () => engine.resolveTargetKeyFromSnippet('Kopi 25rb'),
  'confirm: requestTransactionConfirmation': () => engine.requestTransactionConfirmation({ type: 'EXPENSE', nominal: 18000, destination: 'Kopi Kenangan', category: null, account: 'Cash' }, 'TEST', 'test-key-1'),
  'confirm: pending count after request': () => engine.getPendingConfirmationsCount(),
  'confirm: pending context after request': () => engine.getPendingConfirmationsContext(),
  'confirm: updatePendingTransaction': () => engine.updatePendingTransaction('Es kopi susu', 'Jajan / Ngopi / Kafe', 20000),
  'confirm: confirmPendingTransactions(true)': () => engine.confirmPendingTransactions(true),
  'confirm: pending count after confirm': () => engine.getPendingConfirmationsCount(),
  'confirm: autoSaveFromWatchdog (unknown key)': () => engine.autoSaveFromWatchdog('no-such-key', { type: 'EXPENSE', nominal: 1000, destination: 'X' }),
  'confirm: recoverPendingTransactions': () => engine.recoverPendingTransactions(),
  'corrections: pending deletions context (empty)': () => engine.getPendingDeletionsContext(),
  'corrections: undoDeleteTransaction with nothing deleted': () => engine.undoDeleteTransaction(),
  'corrections: confirmDeleteTransaction(true) with nothing pending': () => engine.confirmDeleteTransaction(true),
  'corrections: deleteTransaction (no match)': () => engine.deleteTransaction('kopi'),
  'corrections: deleteTransaction latest (request)': () => engine.deleteTransaction('latest'),
  'corrections: pending deletions context (after request)': () => engine.getPendingDeletionsContext(),
  'corrections: confirmDeleteTransaction(true)': () => engine.confirmDeleteTransaction(true),
  'corrections: undoDeleteTransaction (after delete)': () => engine.undoDeleteTransaction(),
  'corrections: editTransaction latest nominal': () => engine.editTransaction('latest', 30000, null, null, null, null),
  'corrections: editTransaction (no match)': () => engine.editTransaction('kopi', 30000, null, null, null, null),
  'email: pollFinanceEmails (empty inbox)': () => { mockEmails = []; return engine.pollFinanceEmails(); },
  'email: pollFinanceEmails (real Mandiri QRIS & failed BI Fast emails)': () => {
    mockEmails = [
      {
        id: 'email_mandiri_qris_001',
        subject: 'Pembayaran Berhasil!',
        date: '2026-10-14T04:10:00Z',
        snippet: 'Pembayaran Berhasil Penerima GRAB FOOD Jakarta - ID Nominal Transaksi Rp 18.200,00',
        body: `Pembayaran Berhasil
Halo FAQIH HIDAYATULLOH,
Berikut adalah detail transaksi Anda dengan QR.
Penerima
GRAB FOOD
Jakarta - ID
Tanggal 14 Okt 2026
Jam 11:10:56 WIB
Nominal Transaksi Rp 18.200,00
No. Referensi 2607251122578063197
No. Ref. QRIS 607658866079`
      },
      {
        id: 'email_mandiri_fail_002',
        subject: 'Transfer dengan BI Fast Tidak Berhasil',
        date: '2026-10-14T03:04:00Z',
        snippet: 'Transfer dengan BI Fast Tidak Berhasil Penerima DNID FAQXX HIDXXXXXXXXX Nominal Transfer Rp 10.000,00',
        body: `Transfer dengan BI Fast Tidak Berhasil
Halo FAQIH HIDAYATULLOH,
Berikut adalah detail transaksi Anda
Penerima
DNID FAQXX HIDXXXXXXXXX
Tanggal 14 Okt 2026
Jam 10:04:25 WIB
Nominal Transfer Rp 10.000,00
Tujuan Transaksi Lainnya
No. Referensi BI Fast 20260730BMRIIDJA010O0224750379`
      }
    ];
    return engine.pollFinanceEmails();
  },
  ...Object.fromEntries(['getFinanceAnalytics', 'getCategoryInsight', 'getPeriodComparisonReport', 'getTopExpensesReport', 'getDailyTrendReport',
    'getSmartFinanceSummary', 'getSavingRateReport', 'getDailyBalanceTrendReport'].flatMap(fn =>
    periods.map(p => [`analytics: ${fn}(${JSON.stringify(p)})`, () => engine[fn](p)]))),
  'analytics: getAccountBalancesReport': () => engine.getAccountBalancesReport(),
  'analytics: getMonthlySummaryReport': () => engine.getMonthlySummaryReport()
};

test('export surface is unchanged (names and types, in order)', (t) => {
  const actual = Object.fromEntries(Object.keys(engine).map(k => [k, typeof engine[k]]));
  recorded.exports = actual;
  if (RECORD) return;
  if (!golden) return t.skip('no golden recording; run with RECORD_GOLDEN=1 on the original code first');
  assert.deepStrictEqual(Object.keys(actual), Object.keys(golden.exports));
  assert.deepStrictEqual(actual, golden.exports);
});

for (const [name, fn] of Object.entries(CASES)) {
  test(name, async (t) => {
    calls.length = 0;
    let outcome;
    try { outcome = { ok: await Promise.resolve(fn()) }; } catch (e) { outcome = { threw: String(e && e.message) }; }
    const entry = JSON.parse(JSON.stringify({ outcome, stubCalls: [...calls] }));
    recorded.cases[name] = entry;
    if (RECORD) return;
    if (!golden) return t.skip('no golden recording; run with RECORD_GOLDEN=1 on the original code first');
    assert.ok(name in golden.cases, `case missing from the recording: ${name}`);
    assert.deepStrictEqual(entry, golden.cases[name]);
  });
}
