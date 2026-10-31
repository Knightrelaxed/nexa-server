'use strict';
/**
 * tests/multi_bank_email_finance_sync.test.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Comprehensive Test Suite for Multi-Bank Email Finance Sync (Bank Jago & Bank Mandiri)
 *
 * Verifies:
 * 1. Provider detection from email metadata & body
 * 2. Bank Mandiri parser (QRIS, Transfer, Failed transactions)
 * 3. Bank Jago parser (Grab Transport with OVO acquirer, location enrichment, tips, transfers, failed transactions)
 * 4. Dynamic account mapping (Bank Jago & Bank Mandiri) in Supabase reference data
 * 5. Full transaction recording through Finance_Ledger with dynamic accounts
 * ─────────────────────────────────────────────────────────────────────────────
 */

const test = require('node:test');
const assert = require('node:assert');

const {
  _detectProvider,
  _parseMandiriTransaction,
  _parseJagoTransaction,
} = require('../src/domain/finance/Finance_Email_Sync');

const {
  resolveAccountId,
  ensureAccountExists,
  getAccountsList
} = require('../src/infrastructure/finance_db/reference_data');

test('Multi-Bank Provider Detection', async (t) => {
  await t.test('detects Bank Mandiri from from address', () => {
    const email = { from: 'Livin\' <noreply.livin@bankmandiri.co.id>', subject: 'Transfer Berhasil' };
    const provider = _detectProvider(email, 'Berikut detail transfer Anda');
    assert.strictEqual(provider, 'MANDIRI');
  });

  await t.test('detects Bank Mandiri from body text', () => {
    const email = { from: 'no-reply@bank.com', subject: 'Transfer Berhasil' };
    const provider = _detectProvider(email, 'Terima kasih telah menggunakan Livin\' by Mandiri');
    assert.strictEqual(provider, 'MANDIRI');
  });

  await t.test('detects Bank Jago from from address', () => {
    const email = { from: 'Jago <noreply@jago.com>', subject: 'Kamu telah membayar ke GRAB TRANSPORT💸' };
    const provider = _detectProvider(email, 'Terima kasih sudah bertransaksi dengan Jago!');
    assert.strictEqual(provider, 'JAGO');
  });

  await t.test('detects Bank Jago from body text', () => {
    const email = { from: 'alert@notification.com', subject: 'Transfer Berhasil' };
    const provider = _detectProvider(email, 'Halo FAQIH, Terima kasih sudah bertransaksi dengan Jago! Rincian...');
    assert.strictEqual(provider, 'JAGO');
  });
});

test('Bank Mandiri Transaction Parser', async (t) => {
  await t.test('parses successful QRIS transaction with admin fee', () => {
    const email = {
      from: 'noreply.livin@bankmandiri.co.id',
      subject: 'Pembayaran Berhasil'
    };
    const blob = `Pembayaran Berhasil
Berikut adalah detail transaksi Anda dengan QR:
Penerima
KOPI KENANGAN
Jakarta Selatan - ID
Nominal Transaksi Rp 25.000,00
Biaya Transaksi Rp 0,00
Total Transaksi Rp 25.000,00`;

    const parsed = _parseMandiriTransaction(blob, email);
    assert.strictEqual(parsed.provider, 'MANDIRI');
    assert.strictEqual(parsed.account, 'Bank Mandiri');
    assert.strictEqual(parsed.nominal, 25000);
    assert.strictEqual(parsed.destination, 'KOPI KENANGAN');
    assert.strictEqual(parsed.paymentMethod, 'QRIS');
    assert.strictEqual(parsed.isFailed, false);
  });

  await t.test('parses failed BI-Fast transfer', () => {
    const email = {
      from: 'noreply.livin@bankmandiri.co.id',
      subject: 'Transfer BI-Fast Tidak Berhasil'
    };
    const blob = `Transfer dengan BI Fast Tidak Berhasil
Penerima
FAZHIA AULIA
Nominal Transfer Rp 100.000,00`;

    const parsed = _parseMandiriTransaction(blob, email);
    assert.strictEqual(parsed.provider, 'MANDIRI');
    assert.strictEqual(parsed.account, 'Bank Mandiri');
    assert.strictEqual(parsed.nominal, 100000);
    assert.strictEqual(parsed.destination, 'FAZHIA AULIA');
    assert.strictEqual(parsed.paymentMethod, 'Transfer bank');
    assert.strictEqual(parsed.isFailed, true);
  });
});

test('Bank Jago Transaction Parser', async (t) => {
  await t.test('parses real screenshot: Grab Transport payment via OVO acquirer with location', () => {
    const email = {
      from: 'Jago <noreply@jago.com>',
      subject: 'Kamu telah membayar ke GRAB TRANSPORT💸'
    };
    const blob = `Halo FAQIH HIDAYATULLOH,
Terima kasih sudah bertransaksi dengan Jago! Kamu baru saja mengirimkan uang, berikut rinciannya:
Ringkasan transaksi
Dari 101182943827
Ke GRAB TRANSPORT
9360091200022479237
Jumlah Rp 6.500
Tanggal Transaksi 30 October 2026, 10:15 WIB
Status Transaksi Berhasil
Nama Acquirer OVO
Lokasi Merchant Jakarta
ID Terminal 19yyqlRsp7Gn8E55
PAN Nasabah 9360054211182943826
Jumlah Tip Rp 0`;

    const parsed = _parseJagoTransaction(blob, email);
    assert.strictEqual(parsed.provider, 'JAGO');
    assert.strictEqual(parsed.account, 'Bank Jago');
    assert.strictEqual(parsed.nominal, 6500);
    assert.strictEqual(parsed.destination, 'GRAB TRANSPORT Jakarta');
    assert.strictEqual(parsed.paymentMethod, 'QRIS');
    assert.strictEqual(parsed.type, 'EXPENSE');
    assert.strictEqual(parsed.isFailed, false);
  });

  await t.test('parses flattened single-line HTML email with bounded lookaheads', () => {
    const email = {
      from: 'Jago <noreply@jago.com>',
      subject: 'Kamu telah membayar ke GRAB TRANSPORT💸'
    };
    // Simulates Gmail API HTML text stripping where newlines are collapsed into spaces
    const flatBlob = 'Halo FAQIH HIDAYATULLOH, Terima kasih sudah bertransaksi dengan Jago! Kamu baru saja mengirimkan uang, berikut rinciannya: Ringkasan transaksi Dari 101182943827 Ke GRAB TRANSPORT 9360091200022479237 Jumlah Rp 6.500 Tanggal Transaksi 30 October 2026, 10:15 WIB Status Transaksi Berhasil Nama Acquirer OVO Lokasi Merchant Jakarta Selatan ID Terminal 19yyqlRsp7Gn8E55 PAN Nasabah 9360054211182943826 Jumlah Tip Rp 0';

    const parsed = _parseJagoTransaction(flatBlob, email);
    assert.strictEqual(parsed.nominal, 6500);
    assert.strictEqual(parsed.destination, 'GRAB TRANSPORT Jakarta Selatan');
    assert.strictEqual(parsed.paymentMethod, 'QRIS');
    assert.strictEqual(parsed.account, 'Bank Jago');
    assert.strictEqual(parsed.isFailed, false);
  });

  await t.test('parses Jago incoming transfer (Dana Masuk / Income)', () => {
    const email = {
      from: 'Jago <noreply@jago.com>',
      subject: 'Kamu baru saja menerima uang'
    };
    const blob = `Halo FAQIH,
Kamu baru saja menerima uang dari transfer!
Ringkasan transaksi
Dari FAZHIA AULIA
Jumlah Rp 250.000
Status Transaksi Berhasil`;

    const parsed = _parseJagoTransaction(blob, email);
    assert.strictEqual(parsed.nominal, 250000);
    assert.strictEqual(parsed.destination, 'FAZHIA AULIA');
    assert.strictEqual(parsed.type, 'INCOME');
    assert.strictEqual(parsed.account, 'Bank Jago');
    assert.strictEqual(parsed.isFailed, false);
  });

  await t.test('parses Jago payment with driver Tip', () => {
    const email = {
      from: 'Jago <noreply@jago.com>',
      subject: 'Kamu telah membayar ke GOJEK INDONESIA💸'
    };
    const blob = `Ringkasan transaksi
Ke GOJEK INDONESIA
Jumlah Rp 14.000
Nama Acquirer GoPay
Lokasi Merchant Jakarta Selatan
Jumlah Tip Rp 2.000
Status Transaksi Berhasil`;

    const parsed = _parseJagoTransaction(blob, email);
    assert.strictEqual(parsed.nominal, 16000); // 14.000 + 2.000 tip
    assert.strictEqual(parsed.destination, 'GOJEK INDONESIA Jakarta Selatan');
    assert.strictEqual(parsed.paymentMethod, 'QRIS');
    assert.strictEqual(parsed.account, 'Bank Jago');
    assert.strictEqual(parsed.isFailed, false);
  });

  await t.test('parses Jago inter-bank transfer', () => {
    const email = {
      from: 'Jago <noreply@jago.com>',
      subject: 'Transfer Berhasil'
    };
    const blob = `Halo FAQIH,
Rincian transaksi transfer Anda:
Ke DAZATULLOH HIDAYAT
Nominal Rp 50.000
Biaya Transfer Rp 2.500
Status Transaksi Berhasil`;

    const parsed = _parseJagoTransaction(blob, email);
    assert.strictEqual(parsed.nominal, 52500);
    assert.strictEqual(parsed.destination, 'DAZATULLOH HIDAYAT');
    assert.strictEqual(parsed.paymentMethod, 'Transfer bank');
    assert.strictEqual(parsed.account, 'Bank Jago');
    assert.strictEqual(parsed.isFailed, false);
  });

  await t.test('parses Jago failed transaction', () => {
    const email = {
      from: 'Jago <noreply@jago.com>',
      subject: 'Transaksi Tidak Berhasil'
    };
    const blob = `Ringkasan transaksi
Ke TOKOPEDIA
Jumlah Rp 75.000
Status Transaksi Gagal`;

    const parsed = _parseJagoTransaction(blob, email);
    assert.strictEqual(parsed.nominal, 75000);
    assert.strictEqual(parsed.destination, 'TOKOPEDIA');
    assert.strictEqual(parsed.account, 'Bank Jago');
    assert.strictEqual(parsed.isFailed, true);
  });

  await t.test('parses Jago incoming transfer with "sejumlah uang" and sender details', () => {
    const email = {
      from: 'Jago <noreply@jago.com>',
      subject: 'Asik, kamu telah menerima sejumlah uang 💰'
    };
    const blob = `Halo FAQIH HIDAYATULLOH,
Kantong Jago-mu telah menerima sejumlah uang dan berikut rinciannya:

Ringkasan transaksi
Dari VISIONET INTERNASIONAL&#96;PT
Danamon • 003534115336
Ke MA • 101182943827
Jumlah Rp35.000
Tanggal transaksi 31 October 2026 08:16 WIB`;

    const parsed = _parseJagoTransaction(blob, email);
    assert.strictEqual(parsed.nominal, 35000);
    assert.strictEqual(parsed.type, 'INCOME');
    assert.strictEqual(parsed.destination, 'VISIONET INTERNASIONAL PT');
    assert.strictEqual(parsed.paymentMethod, 'Transfer bank');
    assert.strictEqual(parsed.account, 'Bank Jago');
    assert.strictEqual(parsed.isFailed, false);
  });
});

test('Supabase Finance Account Provisioning & Resolution', async (t) => {
  await t.test('ensureAccountExists idempotently guarantees Bank Jago existence', async () => {
    const jagoId = await ensureAccountExists('Bank Jago', {
      type: 'bank',
      color: '#f59e0b',
      icon_key: 'landmark'
    });
    assert.ok(jagoId, 'Expected Bank Jago account UUID to exist');
    assert.strictEqual(typeof jagoId, 'string');
    assert.ok(jagoId.length > 10);
  });

  await t.test('resolveAccountId accurately resolves Bank Mandiri and Bank Jago', async () => {
    const mandiriId = await resolveAccountId('Bank Mandiri');
    const jagoId = await resolveAccountId('Bank Jago');
    const jagoFuzzyId = await resolveAccountId('jago');

    assert.ok(mandiriId);
    assert.ok(jagoId);
    assert.notStrictEqual(mandiriId, jagoId, 'Mandiri and Jago must have distinct UUIDs');
    assert.strictEqual(jagoId, jagoFuzzyId, 'Fuzzy "jago" must map to Bank Jago');
  });

  await t.test('getAccountsList includes both Bank Mandiri and Bank Jago', async () => {
    const accounts = await getAccountsList();
    const names = accounts.map(a => a.name);
    assert.ok(names.includes('Bank Mandiri'), 'Expected Bank Mandiri in accounts list');
    assert.ok(names.includes('Bank Jago'), 'Expected Bank Jago in accounts list');
  });
});

test('Multi-Bank Common Helpers & Intent Integration', async (t) => {
  const helpers = require('../src/interfaces/common/helpers');

  await t.test('extractFinanceTransactionsFromEmails extracts Bank Jago vs Bank Mandiri', () => {
    const jagoEmail = {
      from: 'noreply@jago.com',
      subject: 'Kamu telah membayar ke GRAB TRANSPORT💸',
      snippet: 'Ringkasan transaksi Dari 101182943827 Ke GRAB TRANSPORT Jumlah Rp 6.500 Tanggal Transaksi 30 October 2026',
      date: '2026-10-30T10:15:00Z'
    };
    const mandiriEmail = {
      from: 'noreply.livin@bankmandiri.co.id',
      subject: 'Pembayaran Berhasil',
      snippet: 'Pembayaran Berhasil Penerima KOPI KENANGAN Nominal Transaksi Rp 25.000',
      date: '2026-10-30T09:00:00Z'
    };

    const results = helpers.extractFinanceTransactionsFromEmails([jagoEmail, mandiriEmail]);
    assert.strictEqual(results.length, 2);

    // Jago assertions
    assert.strictEqual(results[0].account, 'Bank Jago');
    assert.strictEqual(results[0].nominal, 6500);
    assert.strictEqual(results[0].type, 'EXPENSE');

    // Mandiri assertions
    assert.strictEqual(results[1].account, 'Bank Mandiri');
    assert.strictEqual(results[1].nominal, 25000);
    assert.strictEqual(results[1].type, 'EXPENSE');
  });
});

test('Telegram Confirmation Card Multi-Bank Format & Proactive Prompts', async (t) => {
  const { _buildConfirmationMessage } = require('../src/domain/finance/Finance_Confirmations');

  await t.test('renders Bank Jago confirmation card with dynamic account and proactive question', async () => {
    const tx = {
      nominal: 6500,
      type: 'EXPENSE',
      destination: 'GRAB TRANSPORT Jakarta',
      category: 'Ojek / Taksi Online',
      description: '[Menunggu Detail User]',
      time: '2026-10-30T10:15:00Z',
      account: 'Bank Jago',
      payment_method: 'QRIS'
    };

    const card = await _buildConfirmationMessage(tx, 'SINKRONISASI KEUANGAN TERBARU');
    assert.ok(card.includes('💸 <b>SINKRONISASI KEUANGAN TERBARU</b>'));
    assert.ok(card.includes('<b>Tipe:</b> Pengeluaran'));
    assert.ok(card.includes('<b>Kategori:</b> Ojek / Taksi Online [Auto-AI]'));
    assert.ok(card.includes('<b>Akun:</b> Bank Jago'));
    assert.ok(card.includes('<b>Metode:</b> QRIS'));
    assert.ok(card.includes('<b>Deskripsi:</b> [KOSONG - Tujuan: GRAB TRANSPORT Jakarta]'));
    assert.ok(card.includes('<b>Nominal (Rp):</b> Rp6.500'));
    assert.ok(card.includes('❓ <b>N.E.X.A mencatat pengeluaran ke GRAB TRANSPORT Jakarta.</b>'));
    assert.ok(card.includes('Tuan, uang ini digunakan untuk keperluan apa ya?'));
  });

  await t.test('renders Bank Mandiri confirmation card with dynamic account', async () => {
    const tx = {
      nominal: 25000,
      type: 'EXPENSE',
      destination: 'KOPI KENANGAN',
      category: 'Jajan / Ngopi / Kafe',
      description: '[Menunggu Detail User]',
      time: '2026-10-30T09:00:00Z',
      account: 'Bank Mandiri',
      payment_method: 'QRIS'
    };

    const card = await _buildConfirmationMessage(tx, 'SINKRONISASI KEUANGAN TERBARU');
    assert.ok(card.includes('<b>Akun:</b> Bank Mandiri'));
    assert.ok(card.includes('<b>Nominal (Rp):</b> Rp25.000'));
    assert.ok(card.includes('<b>Deskripsi:</b> [KOSONG - Tujuan: KOPI KENANGAN]'));
    assert.ok(card.includes('❓ <b>N.E.X.A mencatat pengeluaran ke KOPI KENANGAN.</b>'));
  });

  await t.test('renders Income confirmation card for Bank Jago transfer', async () => {
    const tx = {
      nominal: 500000,
      type: 'INCOME',
      destination: 'FAZHIA AULIA',
      category: 'Pemasukan',
      description: '[Menunggu Detail User]',
      time: '2026-10-30T08:00:00Z',
      account: 'Bank Jago',
      payment_method: 'Transfer bank'
    };

    const card = await _buildConfirmationMessage(tx, 'SINKRONISASI KEUANGAN TERBARU');
    assert.ok(card.includes('<b>Tipe:</b> Pemasukan'));
    assert.ok(card.includes('<b>Akun:</b> Bank Jago'));
    assert.ok(card.includes('<b>Nominal (Rp):</b> Rp500.000'));
    assert.ok(card.includes('<b>Deskripsi:</b> [KOSONG - Sumber: FAZHIA AULIA]'), 'Income card should display [KOSONG - Sumber: ...] instead of Tujuan:');
    assert.ok(card.includes('❓ <b>Terdapat dana masuk dari FAZHIA AULIA.</b>'));
  });
});

test('Live Tool & Voice Normalization Multi-Bank Support', async (t) => {
  const liveTools = require('../src/core/Live_Tool_Registry');

  await t.test('normalizes voice variations of Bank Jago', () => {
    assert.strictEqual(liveTools._normalizeAccountName('pake bank jago'), 'Bank Jago');
    assert.strictEqual(liveTools._normalizeAccountName('kantong jago'), 'Bank Jago');
    assert.strictEqual(liveTools._normalizeAccountName('jago'), 'Bank Jago');
  });

  await t.test('normalizes voice variations of Bank Mandiri', () => {
    assert.strictEqual(liveTools._normalizeAccountName('mandiri'), 'Bank Mandiri');
    assert.strictEqual(liveTools._normalizeAccountName('livin'), 'Bank Mandiri');
    assert.strictEqual(liveTools._normalizeAccountName('livin by mandiri'), 'Bank Mandiri');
  });
});

test('Interactive Account Updates on Pending Transactions', async (t) => {
  const { pendingConfirmations } = require('../src/domain/finance/Finance_State');
  const { updatePendingTransaction } = require('../src/domain/finance/Finance_Confirmations');
  const supabase = require('../src/infrastructure/Supabase_Memories');

  const testKey = 'test_multi_bank_key_001';
  const savedPendingCalls = [];
  const origSave = supabase.savePendingTransaction;
  const origDelete = supabase.deletePendingTransaction;
  supabase.savePendingTransaction = async (k, tx, sent) => {
    savedPendingCalls.push({ k, tx, sent });
  };
  supabase.deletePendingTransaction = async (k) => {};

  pendingConfirmations.set(testKey, {
    tx: {
      nominal: 15000,
      type: 'EXPENSE',
      destination: 'INDOMARET',
      account: 'Bank Mandiri',
      category: 'Belanja',
      description: 'Camilan sore'
    },
    timeoutId: setTimeout(() => {}, 100000)
  });

  try {
    // 1. User updates account to Jago
    await updatePendingTransaction(null, null, null, 'jago', null, testKey);
    const updated = pendingConfirmations.get(testKey);
    assert.strictEqual(updated.tx.account, 'Bank Jago', 'Account should be updated to Bank Jago');
    assert.ok(savedPendingCalls.length > 0, 'Should have invoked savePendingTransaction mock');

    // 2. User updates account back to Mandiri
    await updatePendingTransaction(null, null, null, 'mandiri', null, testKey);
    assert.strictEqual(updated.tx.account, 'Bank Mandiri', 'Account should be updated to Bank Mandiri');

    // 3. User provides unknown account (e.g. PayPal) -> should return warning and keep existing account
    const resUnknown = await updatePendingTransaction(null, null, null, 'paypal', null, testKey);
    assert.ok(resUnknown.includes('tidak ditemukan'), 'Should notify user of unknown account');
    assert.strictEqual(updated.tx.account, 'Bank Mandiri', 'Account should not be overwritten by unknown account');
  } finally {
    supabase.savePendingTransaction = origSave;
    supabase.deletePendingTransaction = origDelete;
    clearTimeout(pendingConfirmations.get(testKey)?.timeoutId);
    pendingConfirmations.delete(testKey);
  }
});

test('Deep Audit: Edge Cases & Semantic Consistency', async (t) => {
  const { _parseJagoTransaction } = require('../src/domain/finance/Finance_Email_Sync');
  const { pendingConfirmations } = require('../src/domain/finance/Finance_State');
  const { _resolveTargetKeyFromSnippet, confirmPendingTransactions } = require('../src/domain/finance/Finance_Confirmations');
  const supabaseFinance = require('../src/infrastructure/finance_db');

  await t.test('parses Jago refund / pengembalian dana as INCOME and Transfer bank', () => {
    const email = {
      from: 'Jago <noreply@jago.com>',
      subject: 'Uang telah dikembalikan'
    };
    const blob = 'Halo FAQIH HIDAYATULLOH, Pengiriman uangmu sebesar Rp Rp20.338 ke ORACLE SINGAPORE telah dikembalikan ke Kantong Utama kamu.';
    const parsed = _parseJagoTransaction(blob, email);

    assert.strictEqual(parsed.provider, 'JAGO');
    assert.strictEqual(parsed.account, 'Bank Jago');
    assert.strictEqual(parsed.nominal, 20338);
    assert.strictEqual(parsed.type, 'INCOME', 'Refund must be parsed as INCOME');
    assert.strictEqual(parsed.paymentMethod, 'Transfer bank', 'Refund must be Transfer bank, not QRIS');
    assert.strictEqual(parsed.isFailed, false);
  });

  await t.test('resolves target key disambiguation when multiple pending share identical nominal', () => {
    const key1 = '25000_kopikenangan';
    const key2 = '25000_indomaret';

    pendingConfirmations.set(key1, {
      tx: { nominal: 25000, destination: 'KOPI KENANGAN', description: '[Menunggu Detail User]' }
    });
    pendingConfirmations.set(key2, {
      tx: { nominal: 25000, destination: 'INDOMARET', description: '[Menunggu Detail User]' }
    });

    try {
      // Snippet mentions indomaret
      const resolvedKeyIndo = _resolveTargetKeyFromSnippet('25000 indomaret tadi beli sabun');
      assert.strictEqual(resolvedKeyIndo, key2, 'Should pick INDOMARET based on destination in snippet');

      // Snippet mentions kopi
      const resolvedKeyKopi = _resolveTargetKeyFromSnippet('25.000 buat kopi kenangan');
      assert.strictEqual(resolvedKeyKopi, key1, 'Should pick KOPI KENANGAN based on destination in snippet');
    } finally {
      pendingConfirmations.delete(key1);
      pendingConfirmations.delete(key2);
    }
  });

  await t.test('confirmPendingTransactions ensures placeholder description never persists', async () => {
    const testKey = 'audit_test_placeholder_key';
    let capturedTx = null;

    // Intercept writeTransaction temporarily
    const originalWrite = supabaseFinance.writeTransaction;
    supabaseFinance.writeTransaction = async (data) => {
      capturedTx = data;
      return { status: 'SUCCESS', id: 'mock-tx-123' };
    };

    const webhook = require('../src/interfaces/webhook');
    const actions = require('../src/interfaces/telegram/actions');
    const origWebhookOutbound = webhook.sendTelegramOutbound;
    const origActionsOutbound = actions.sendTelegramOutbound;
    webhook.sendTelegramOutbound = async () => ({ ok: true });
    actions.sendTelegramOutbound = async () => ({ ok: true });

    const supabase = require('../src/infrastructure/Supabase_Memories');
    const origLogKey = supabase.logTransactionKey;
    const origDeletePending = supabase.deletePendingTransaction;
    supabase.logTransactionKey = async () => {};
    supabase.deletePendingTransaction = async () => {};

    try {
      pendingConfirmations.set(testKey, {
        tx: {
          nominal: 35000,
          type: 'EXPENSE',
          destination: 'CHATIME',
          category: 'Jajan / Minuman',
          description: '[Menunggu Detail User]',
          account: 'Bank Jago',
          payment_method: 'QRIS',
          time: '2026-10-30T11:00:00Z'
        },
        timeoutId: setTimeout(() => {}, 100000)
      });

      // User confirms with "ya" without new description
      await confirmPendingTransactions(true, null, null, null, null, testKey);

      assert.ok(capturedTx, 'Expected writeTransaction to be called');
      assert.notStrictEqual(capturedTx.description, '[Menunggu Detail User]', 'Description must not be placeholder');
      assert.strictEqual(capturedTx.description, 'pengeluaran ke CHATIME', 'Default description should be semantic');
      assert.strictEqual(capturedTx.accountName, 'Bank Jago');
    } finally {
      supabaseFinance.writeTransaction = originalWrite;
      webhook.sendTelegramOutbound = origWebhookOutbound;
      actions.sendTelegramOutbound = origActionsOutbound;
      supabase.logTransactionKey = origLogKey;
      supabase.deletePendingTransaction = origDeletePending;
      clearTimeout(pendingConfirmations.get(testKey)?.timeoutId);
      pendingConfirmations.delete(testKey);
    }
  });
});
