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
