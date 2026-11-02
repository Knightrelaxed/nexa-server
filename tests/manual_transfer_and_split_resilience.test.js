'use strict';
/**
 * tests/manual_transfer_and_split_resilience.test.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Comprehensive tests for:
 * 1. Split Engine isSplitIntent precision (no false positives on quantity "dua" or time "jam 9")
 * 2. Natural language Date & Time expression parsing (_parseDateTimeExpression)
 * 3. Date & Time editing in editTransaction & updatePendingTransaction
 * 4. Manual Transfer Antar-Akun routing in handleFinanceIntent
 * ─────────────────────────────────────────────────────────────────────────────
 */

const test = require('node:test');
const assert = require('node:assert');

const { isSplitIntent } = require('../src/domain/Split_Engine');
const { _parseDateTimeExpression } = require('../src/domain/finance/Finance_Helpers');
const financeEngine = require('../src/domain/Finance_Engine');
const { handleFinanceIntent } = require('../src/interfaces/common/handlers/finance_handler');

test('Split_Engine: isSplitIntent rejects false positives on quantity and time', () => {
  // Case from production incident
  assert.strictEqual(
    isSplitIntent('Oiya aku lupa tadi malam jam 9 aku beli es teh dua seharga 9800 pake dd dari shopee pay'),
    false,
    'Should not trigger split when "dua" is quantity and "jam 9" is time with single price 9800'
  );

  // Single purchase with count
  assert.strictEqual(isSplitIntent('beli burger dua seharga 25000'), false);
  assert.strictEqual(isSplitIntent('rokok 2 bungkus seharga 45rb'), false);
  assert.strictEqual(isSplitIntent('beli mie 3 porsi total 30rb'), false);
  assert.strictEqual(isSplitIntent('tadi malam jam 21.00 beli bensin 50rb'), false);
  assert.strictEqual(isSplitIntent('TF dari jago ke shopee pay 10 ribu'), false);

  // Genuine split intents
  assert.strictEqual(isSplitIntent('beli nasi padang 14 ribu dan es teh 6 ribu cash'), true);
  assert.strictEqual(isSplitIntent('beras 100rb sabun 30rb'), true);
  assert.strictEqual(isSplitIntent('split: makan 20rb, minum 5rb'), true);
  assert.strictEqual(isSplitIntent('rincian: bayar wifi 300rb, pulsa 50rb'), true);
});

test('Finance_Helpers: _parseDateTimeExpression parses composite relative and absolute dates', () => {
  const baseDate = new Date('2026-11-03T07:00:00+07:00');

  // Case from production incident: "tadi malam jam 9 tgl 1 nov"
  const res1 = _parseDateTimeExpression('Itu sebenarnya bukan transaksi tadi, itu tadi malam jam 9 tgl 1 nov', baseDate);
  assert.strictEqual(res1.dateISO, '2026-11-01');
  assert.strictEqual(res1.timeHHMM, '21:00');

  // "Edit waktu dan tanggal nya itu jam 9 malam tgl 1 nov"
  const res2 = _parseDateTimeExpression('Edit waktu dan tanggal nya itu jam 9 malam tgl 1 nov', baseDate);
  assert.strictEqual(res2.dateISO, '2026-11-01');
  assert.strictEqual(res2.timeHHMM, '21:00');

  // "kemarin jam 15.30"
  const res3 = _parseDateTimeExpression('kemarin jam 15.30', baseDate);
  assert.strictEqual(res3.dateISO, '2026-11-02');
  assert.strictEqual(res3.timeHHMM, '15:30');

  // "tadi malam" (default hour 21:00)
  const res4 = _parseDateTimeExpression('tadi malam', baseDate);
  assert.strictEqual(res4.dateISO, '2026-11-02');
  assert.strictEqual(res4.timeHHMM, '21:00');

  // Direct ISO string
  const res5 = _parseDateTimeExpression('2026-11-01T21:00:00+07:00', baseDate);
  assert.strictEqual(res5.dateISO, '2026-11-01');
  assert.strictEqual(res5.timeHHMM, '21:00');
});

test('Finance_Confirmations: updatePendingTransaction updates date and time', async () => {
  const txData = {
    nominal: 15000,
    destination: 'Warung Kopi',
    type: 'EXPENSE',
    time: '2026-11-02T10:00:00+07:00'
  };

  const cKey = 'test_update_datetime_pending';
  await financeEngine.requestTransactionConfirmation(txData, 'TEST', cKey);

  // Update date to 2026-11-01 and time to 21:00
  const updatedCard = await financeEngine.updatePendingTransaction(
    'Kopi hitam',
    'Jajan / Ngopi / Kafe',
    null,
    'Bank Jago',
    'QRIS',
    cKey,
    '2026-11-01',
    '21:00'
  );

  assert.ok(updatedCard, 'Updated confirmation card must be returned');
  assert.ok(updatedCard.includes('1 November 2026'), 'Card must reflect updated date');
  assert.ok(updatedCard.includes('21.00'), 'Card must reflect updated time');

  // Clean up pending
  await financeEngine.confirmPendingTransactions(false, null, null, null, null, cKey);
});

test('Finance_Handler: handles manual transfer between accounts as Transfer Pair', async () => {
  const routingData = {
    intent: 'FINANCE',
    extracted_data: {
      action: 'RECORD',
      type: 'TRANSFER',
      nominal: 10000,
      from_account: 'Bank Jago',
      to_account: 'Shopee Pay',
      destination: 'Shopee Pay'
    }
  };

  const reply = await handleFinanceIntent(routingData, { textInput: 'Maksudnya aku TF dari jago ke shopee pay 10 ribu' });
  assert.ok(reply, 'Must return confirmation reply');
  assert.ok(reply.includes('TRANSFER ANTAR-AKUN'), 'Must show TRANSFER ANTAR-AKUN card header');
  assert.ok(reply.includes('Bank Jago'), 'Must show source Bank Jago');
  assert.ok(reply.includes('Shopee Pay'), 'Must show destination Shopee Pay');
  assert.ok(reply.includes('10.000'), 'Must show nominal 10.000');

  // Cancel test pending
  await financeEngine.confirmPendingTransactions(false);
});
