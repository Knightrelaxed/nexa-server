'use strict';
/**
 * tests/supabase_finance_characterization.test.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Characterization & Contract Tests for Supabase_Finance and finance_db/ Subsystem
 * 
 * Memastikan:
 * 1. Facade Supabase_Finance.js tetap mengekspor 25 interface publik yang identik.
 * 2. Modul finance_db/index.js mengekspor fungsi-fungsi yang kompatibel.
 * 3. Logika internal fuzzy scoring, normalisasi, dan validasi status tetap utuh.
 * 4. Fungsi-fungsi aman dan gracefully handled saat offline / null client.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const test = require('node:test');
const assert = require('node:assert');

const facade = require('../src/infrastructure/Supabase_Finance');
const financeDb = require('../src/infrastructure/finance_db');
const referenceData = require('../src/infrastructure/finance_db/reference_data');
const recurring = require('../src/infrastructure/finance_db/recurring');

const EXPECTED_EXPORTS = [
  'writeTransaction',
  'readTransactions',
  'updateTransaction',
  'deleteTransaction',
  'getFinanceAnalytics',
  'getCategoryBreakdown',
  'getTopExpenses',
  'getAccountBalances',
  'getPeriodComparison',
  'getDailyTrend',
  'getMonthlySummary',
  'getDailyBalanceTrend',
  'resolveAccountId',
  'resolveCategoryId',
  'getAccountsList',
  'getCategoriesList',
  'invalidateCache',
  'getBudgetGroups',
  'getBudgets',
  'getExpenseSumByCategories',
  'getRecurringRules',
  'upsertRecurringRules',
  'updateRecurringRuleStatus',
  'getAllTransactionsForAnalysis',
  '_getClient'
];

test('Supabase_Finance: Public API Contract Integrity', () => {
  for (const expName of EXPECTED_EXPORTS) {
    assert.ok(
      expName in facade,
      `Expected export "${expName}" to be present on Supabase_Finance facade`
    );
    assert.strictEqual(
      typeof facade[expName],
      'function',
      `Expected export "${expName}" to be a function on Supabase_Finance facade`
    );
  }
});

test('finance_db/index.js: Parity with Facade', () => {
  for (const expName of EXPECTED_EXPORTS) {
    assert.ok(
      expName in financeDb,
      `Expected export "${expName}" to be present on finance_db/index.js`
    );
  }
  assert.strictEqual(typeof facade._getClient, 'function');
  assert.strictEqual(facade._getClient(), financeDb.supabaseFinance);
});

test('reference_data: _normalize text utility', () => {
  const { _normalize } = referenceData;
  assert.strictEqual(_normalize('  BCA Syariah!! '), 'bca syariah');
  assert.strictEqual(_normalize('GoPay / QRIS @ 2026'), 'gopay qris 2026');
  assert.strictEqual(_normalize(''), '');
  assert.strictEqual(_normalize(null), '');
});

test('reference_data: _fuzzyScore matching', () => {
  const { _fuzzyScore } = referenceData;
  // Exact match
  assert.strictEqual(_fuzzyScore('gopay', 'GOPAY'), 100);
  assert.strictEqual(_fuzzyScore('BCA', 'bca'), 100);

  // Substring match
  assert.strictEqual(_fuzzyScore('bca', 'Bank BCA'), 80);
  assert.strictEqual(_fuzzyScore('Bank Mandiri', 'Mandiri'), 70);

  // Token match
  const score = _fuzzyScore('makanan restoran', 'Restoran dan Makanan Cepat Saji');
  assert.ok(score >= 40, `Expected token score >= 40, got ${score}`);

  // No match
  assert.strictEqual(_fuzzyScore('asuransi', 'hiburan'), 0);
});

test('recurring: VALID_RECURRING_STATUSES integrity', () => {
  assert.deepStrictEqual(
    recurring.VALID_RECURRING_STATUSES,
    ['CANDIDATE', 'ACTIVE', 'REJECTED', 'ENDED']
  );
});

test('finance_db: invalidateCache executes safely', () => {
  assert.doesNotThrow(() => {
    facade.invalidateCache();
    financeDb.invalidateCache();
  });
});

test('finance_db: graceful handling when unconfigured or query on null client', async () => {
  // If no live DB connection, functions should return safe fallback shapes
  if (!financeDb.supabaseFinance) {
    const analytics = await facade.getFinanceAnalytics(new Date('2026-01-01'), new Date('2026-01-31'));
    assert.deepStrictEqual(analytics, {
      totalIncome: 0,
      totalExpense: 0,
      balance: 0,
      savingsRate: 0,
      avgDailyExpense: 0,
      daysPassed: 31,
      totalTransactions: 0
    });

    const budgets = await facade.getBudgets();
    assert.deepStrictEqual(budgets, []);

    const groups = await facade.getBudgetGroups();
    assert.deepStrictEqual(groups, []);

    const recurringRules = await facade.getRecurringRules();
    assert.deepStrictEqual(recurringRules, []);

    const dailyTrend = await facade.getDailyTrend(new Date('2026-01-01'), new Date('2026-01-02'));
    assert.strictEqual(Array.isArray(dailyTrend), true);

    const writeRes = await facade.writeTransaction({
      txType: 'EXPENSE',
      nominal: 50000,
      categoryName: 'Makan',
      accountName: 'BCA',
      description: 'Makan siang',
      dateISO: '2026-10-26',
      timeHHMM: '12:00',
      paymentMethod: 'QRIS'
    });
    assert.strictEqual(writeRes.status, 'SKIPPED');
  }
});
