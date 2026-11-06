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

test('writeTransferPair: creates 3 rows with distinct descriptions and shared split_group_id when adminFee > 0', async () => {
  const { writeTransferPair } = require('../src/infrastructure/finance_db/transactions');
  const { supabaseFinance } = require('../src/infrastructure/finance_db/client');

  let insertedRows = null;
  const originalFrom = supabaseFinance.from;
  supabaseFinance.from = (table) => {
    if (table === 'transactions') {
      return {
        insert: (rows) => {
          insertedRows = rows;
          return {
            select: () => Promise.resolve({
              data: [
                { id: 'tx-out-1', split_label: 'transfer_out' },
                { id: 'tx-in-1', split_label: 'transfer_in' },
                { id: 'tx-admin-1', split_label: 'admin_fee' }
              ],
              error: null
            })
          };
        }
      };
    }
    return originalFrom.call(supabaseFinance, table);
  };

  try {
    const res = await writeTransferPair({
      fromAccountName: 'Bank Mandiri',
      toAccountName: 'Dana',
      nominal: 500000,
      adminFee: 2000,
      description: 'buat bayar kosan',
      dateISO: '2026-11-06',
      timeHHMM: '14:00'
    });

    assert.strictEqual(res.status, 'SUCCESS');
    assert.ok(res.pairId, 'Should return pairId');
    assert.strictEqual(res.outId, 'tx-out-1');
    assert.strictEqual(res.inId, 'tx-in-1');
    assert.strictEqual(res.adminId, 'tx-admin-1');

    assert.ok(Array.isArray(insertedRows), 'Rows must be an array');
    assert.strictEqual(insertedRows.length, 3, 'Must insert exactly 3 rows');

    const rowOut = insertedRows.find(r => r.split_label === 'transfer_out');
    const rowIn = insertedRows.find(r => r.split_label === 'transfer_in');
    const rowAdmin = insertedRows.find(r => r.split_label === 'admin_fee');

    // Verification of amounts
    assert.strictEqual(rowOut.amount, 500000);
    assert.strictEqual(rowIn.amount, 500000);
    assert.strictEqual(rowAdmin.amount, 2000);

    // Verification of types
    assert.strictEqual(rowOut.type, 'transfer');
    assert.strictEqual(rowIn.type, 'transfer');
    assert.strictEqual(rowAdmin.type, 'expense');

    // Verification of atomic split_group_id
    assert.strictEqual(rowOut.split_group_id, res.pairId);
    assert.strictEqual(rowIn.split_group_id, res.pairId);
    assert.strictEqual(rowAdmin.split_group_id, res.pairId);

    // Verification of distinct contextual descriptions
    assert.strictEqual(rowOut.description, 'Transfer ke Dana: buat bayar kosan');
    assert.strictEqual(rowIn.description, 'Transfer dari Bank Mandiri: buat bayar kosan');
    assert.strictEqual(rowAdmin.description, 'Biaya admin transfer ke Dana (buat bayar kosan)');
  } finally {
    supabaseFinance.from = originalFrom;
  }
});

test('deleteTransaction: atomically deletes all sibling transactions in the split_group', async () => {
  const { deleteTransaction } = require('../src/infrastructure/finance_db/transactions');
  const { supabaseFinance } = require('../src/infrastructure/finance_db/client');

  let deletedBySplitGroupId = null;
  const originalFrom = supabaseFinance.from;
  supabaseFinance.from = (table) => {
    if (table === 'transactions') {
      return {
        select: (cols) => ({
          eq: (col, val) => ({
            maybeSingle: () => Promise.resolve({
              data: { id: val, split_group_id: 'pair-uuid-xyz-123' },
              error: null
            })
          })
        }),
        delete: () => ({
          eq: (col, val) => {
            if (col === 'split_group_id') {
              deletedBySplitGroupId = val;
            }
            return Promise.resolve({ error: null });
          }
        })
      };
    }
    return originalFrom.call(supabaseFinance, table);
  };

  try {
    const res = await deleteTransaction('tx-out-1');
    assert.strictEqual(res.status, 'SUCCESS');
    assert.strictEqual(deletedBySplitGroupId, 'pair-uuid-xyz-123', 'Must delete by split_group_id');
  } finally {
    supabaseFinance.from = originalFrom;
  }
});

test('Finance_Handler & Confirmations: transfer with admin fee preview and confirmation flow', async () => {
  const routingData = {
    intent: 'FINANCE',
    extracted_data: {
      action: 'RECORD',
      type: 'TRANSFER',
      nominal: 500000,
      admin_fee: 2000,
      from_account: 'Bank Mandiri',
      to_account: 'Dana',
      destination: 'Dana'
    }
  };

  const preview = await handleFinanceIntent(routingData, {
    textInput: 'aku transfer 500.000 dari Bank Mandiri ke Dana dengan admin 2.000'
  });

  assert.ok(preview, 'Must return confirmation reply');
  assert.ok(preview.includes('TRANSFER ANTAR-AKUN'), 'Must show TRANSFER header');
  assert.ok(preview.includes('Nominal Transfer (Rp):</b> Rp500.000'), 'Must show nominal transfer');
  assert.ok(preview.includes('Biaya Admin (Rp):</b> Rp2.000'), 'Must show admin fee');
  assert.ok(preview.includes('Total Terpotong (Rp):</b> Rp502.000'), 'Must show total terpotong 502.000');
  assert.ok(preview.includes('Biaya admin transfer ke Dana (Biaya Admin / Layanan)'), 'Must mention admin fee note and category');

  // Test updating admin fee via updatePendingTransaction
  const updated = await financeEngine.updatePendingTransaction('adminnya 2500');
  assert.ok(updated.includes('Biaya Admin (Rp):</b> Rp2.500'), 'Admin fee should be updated to 2.500');
  assert.ok(updated.includes('Total Terpotong (Rp):</b> Rp502.500'), 'Total terpotong should update to 502.500');

  // Cancel test pending
  await financeEngine.confirmPendingTransactions(false);
});

test('writeTransferPair: safely parses IDR dot-thousands string for nominal and adminFee', async () => {
  const { writeTransferPair } = require('../src/infrastructure/finance_db/transactions');
  const { supabaseFinance } = require('../src/infrastructure/finance_db/client');

  let capturedRows = null;
  const originalFrom = supabaseFinance.from;
  supabaseFinance.from = (table) => {
    if (table === 'transactions') {
      return {
        insert: (rows) => {
          capturedRows = rows;
          return {
            select: () => Promise.resolve({
              data: [
                { id: 'tx-out-dot', split_label: 'transfer_out' },
                { id: 'tx-in-dot', split_label: 'transfer_in' },
                { id: 'tx-adm-dot', split_label: 'admin_fee' }
              ],
              error: null
            })
          };
        }
      };
    }
    return originalFrom.call(supabaseFinance, table);
  };

  try {
    // Pass strings with dot-thousands formatting: "500.000" and "2.000"
    const res = await writeTransferPair({
      fromAccountName: 'Bank Mandiri',
      toAccountName: 'Dana',
      nominal: '500.000',
      adminFee: '2.000'
    });

    assert.strictEqual(res.status, 'SUCCESS');
    assert.strictEqual(capturedRows[0].amount, 500000, 'Nominal must parse to 500000, not 500');
    assert.strictEqual(capturedRows[1].amount, 500000, 'Nominal must parse to 500000, not 500');
    assert.strictEqual(capturedRows[2].amount, 2000, 'Admin fee must parse to 2000, not 2');
  } finally {
    supabaseFinance.from = originalFrom;
  }
});

test('updatePendingTransaction: correctly switches from transfer to expense and zeroes adminFee when user cancels transfer intent', async () => {
  const txData = {
    nominal: 500000,
    adminFee: 2000,
    type: 'TRANSFER',
    isSelfTransfer: true,
    fromAccount: 'Bank Mandiri',
    account: 'Dana',
    destination: 'Dana'
  };

  const cKey = 'test_cancel_transfer_switch_key';
  await financeEngine.requestTransactionConfirmation(txData, 'TRANSFER ANTAR-AKUN', cKey);

  // User says "bukan transfer tapi beli tiket pesawat"
  const reply = await financeEngine.updatePendingTransaction('bukan transfer tapi beli tiket pesawat', null, null, null, null, cKey);
  assert.ok(reply, 'Must return card reply');
  assert.ok(!reply.includes('TRANSFER ANTAR-AKUN'), 'Must no longer be transfer card');
  assert.ok(reply.includes('Pengeluaran'), 'Must be classified as Pengeluaran');

  // Cancel test pending
  await financeEngine.confirmPendingTransactions(false, null, null, null, null, cKey);
});

test('External Transfer with Admin Fee: routes to 2-block expense and handles admin fee updates', async () => {
  const routingData = {
    intent: 'FINANCE',
    extracted_data: {
      action: 'RECORD',
      type: 'TRANSFER',
      nominal: 150000,
      admin_fee: 2500,
      from_account: 'Bank Mandiri',
      to_account: 'Budi',
      destination: 'Budi'
    }
  };

  const preview = await handleFinanceIntent(routingData, {
    textInput: 'aku transfer 150.000 ke Budi dari Bank Mandiri admin 2.500'
  });

  assert.ok(preview, 'Must return confirmation reply');
  assert.ok(preview.includes('PENGELUARAN TRANSFER DENGAN BIAYA ADMIN'), 'Must show external transfer header');
  assert.ok(preview.includes('Nominal Transfer (Rp):</b> Rp150.000'), 'Must show nominal transfer 150.000');
  assert.ok(preview.includes('Biaya Admin (Rp):</b> Rp2.500'), 'Must show admin fee 2.500');
  assert.ok(preview.includes('Total Terpotong (Rp):</b> Rp152.500'), 'Must show total terpotong 152.500');
  assert.ok(preview.includes('N.E.X.A akan mencatat 2 blok mutasi terpisah:'), 'Must explain 2 separate blocks');
  assert.ok(preview.includes('Biaya admin transfer ke Budi'), 'Must display admin note for Budi');

  // Test updating admin fee on external transfer
  const updated = await financeEngine.updatePendingTransaction('adminnya 3000');
  assert.ok(updated.includes('Biaya Admin (Rp):</b> Rp3.000'), 'Admin fee should be updated to 3.000');
  assert.ok(updated.includes('Total Terpotong (Rp):</b> Rp153.000'), 'Total terpotong should update to 153.000');

  // Test removing admin fee
  const noAdmin = await financeEngine.updatePendingTransaction('tanpa admin');
  assert.ok(!noAdmin.includes('Biaya Admin (Rp):'), 'Admin fee should be removed');
  assert.ok(noAdmin.includes('Nominal (Rp):</b> Rp150.000'), 'Nominal should stay 150.000');

  // Cancel test pending
  await financeEngine.confirmPendingTransactions(false);
});

test('Finance_Ledger processTransaction: saves 2 linked rows in Supabase for expense with admin fee', async () => {
  const { processTransaction } = require('../src/domain/finance/Finance_Ledger');
  const supabaseFinance = require('../src/infrastructure/Supabase_Finance');

  const writtenRows = [];
  const originalWrite = supabaseFinance.writeTransaction;
  supabaseFinance.writeTransaction = async (params) => {
    writtenRows.push(params);
    return { status: 'SUCCESS', id: `mock-tx-${writtenRows.length}` };
  };

  try {
    const txData = {
      nominal: 150000,
      adminFee: 2500,
      type: 'EXPENSE',
      destination: 'Budi',
      account: 'Bank Mandiri',
      category: 'Keluarga',
      description: 'Transfer ke Budi'
    };

    const res = await processTransaction(txData, 'TEST_SOURCE');
    assert.strictEqual(res.status, 'SUCCESS');
    assert.strictEqual(writtenRows.length, 2, 'Must write exactly 2 rows');

    // Row 1: Main transfer to Budi
    assert.strictEqual(writtenRows[0].nominal, 150000);
    assert.strictEqual(writtenRows[0].txType, 'EXPENSE');
    assert.strictEqual(writtenRows[0].accountName, 'Bank Mandiri');
    assert.strictEqual(writtenRows[0].description, 'Transfer ke Budi');
    assert.ok(writtenRows[0].splitGroupId, 'Must have splitGroupId');

    // Row 2: Admin fee
    assert.strictEqual(writtenRows[1].nominal, 2500);
    assert.strictEqual(writtenRows[1].txType, 'EXPENSE');
    assert.strictEqual(writtenRows[1].accountName, 'Bank Mandiri');
    assert.strictEqual(writtenRows[1].categoryName, 'Biaya Admin / Layanan');
    assert.strictEqual(writtenRows[1].description, 'Biaya admin transfer ke Budi');
    assert.strictEqual(writtenRows[1].splitGroupId, writtenRows[0].splitGroupId, 'Must share identical splitGroupId');
    assert.strictEqual(writtenRows[1].splitLabel, 'admin_fee', 'Must have splitLabel admin_fee');
  } finally {
    supabaseFinance.writeTransaction = originalWrite;
  }
});
