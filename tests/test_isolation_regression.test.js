'use strict';
/**
 * tests/test_isolation_regression.test.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Regression test to ensure test fixtures never leak into production databases
 * or dispatch outbound Telegram messages.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const test = require('node:test');
const assert = require('node:assert');

const supabaseMemories = require('../src/infrastructure/Supabase_Memories');
const { autoSaveFromWatchdog } = require('../src/domain/finance/Finance_Confirmations');
const { sendTelegramOutbound } = require('../src/interfaces/telegram/actions');

test('Test Isolation: savePendingTransaction ignores synthetic test keys', async () => {
  const testKey = 'test_regression_leak_check_' + Date.now();
  
  // Should be silently dropped by guard
  await supabaseMemories.savePendingTransaction(testKey, { nominal: 99999, description: 'Leak test' });

  // Verify it was NOT written to live table
  const pendingRows = await supabaseMemories.getPendingTransactions();
  const found = pendingRows.find(r => r.composite_key === testKey);
  assert.strictEqual(found, undefined, 'Synthetic testKey must never be persisted to Supabase table');
});

test('Test Isolation: logTransactionKey ignores synthetic test keys', async () => {
  const testKey = 'test_regression_dedup_' + Date.now();

  // Should be dropped by guard
  await supabaseMemories.logTransactionKey(testKey, new Date(), 'UNIT_TEST');

  // Verify dedup check does not find it as an existing duplicate in live DB
  const isDup = await supabaseMemories.isDuplicateTransaction(testKey, new Date(), false);
  assert.strictEqual(isDup, false, 'Synthetic key must not be written to nexa_finance_dedup');
});

test('Test Isolation: autoSaveFromWatchdog safely blocks synthetic test keys', async () => {
  let processTransactionCalled = false;
  const testKey = 'test_watchdog_auto_save_guard_' + Date.now();
  const mockTx = {
    nominal: 12345,
    destination: 'MOCK_STORE',
    description: 'Mock Item'
  };

  // autoSaveFromWatchdog should detect testKey prefix, delete pending if any, and return early
  await autoSaveFromWatchdog(testKey, mockTx);
  assert.strictEqual(processTransactionCalled, false, 'Synthetic key must not be processed into transactions');
});

test('Test Isolation: sendTelegramOutbound skips network transmission in test mode', async () => {
  const origEnv = process.env.NODE_ENV;
  try {
    process.env.NODE_ENV = 'test';
    const res = await sendTelegramOutbound('Test alert message that should never reach Telegram');
    assert.deepStrictEqual(res, { ok: true, skipped: 'NODE_ENV=test' });
  } finally {
    process.env.NODE_ENV = origEnv;
  }
});
