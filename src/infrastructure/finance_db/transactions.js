'use strict';
/**
 * finance_db/transactions.js
 * ─────────────────────────────────────────────────────────────────────────────
 * CRUD Transaksi Keuangan Supabase (Nexa Finance)
 * 
 * Tanggung jawab:
 * 1. writeTransaction(): Dual-write insert, normalisasi payment_method, split_group handling
 * 2. readTransactions(): Query riwayat transaksi dengan filter limit, keyword, bulan, tahun
 * 3. updateTransaction(): Patch transaksi berdasarkan UUID
 * 4. deleteTransaction(): Hard delete transaksi berdasarkan UUID
 * ─────────────────────────────────────────────────────────────────────────────
 */

const crypto = require('crypto');
const { supabaseFinance } = require('./client');
const { resolveAccountId, resolveCategoryId } = require('./reference_data');

/**
 * Normalisasi metode pembayaran agar sesuai PostgreSQL CHECK constraint:
 * ('QRIS', 'Transfer bank', 'Kartu Kredit', 'Tunai', 'Direct Debit')
 * Menangani typo (qis, debet, tranfer) serta singkatan/alias (dd, tf, cc, cash, kantong)
 */
function _normalizePaymentMethod(paymentMethod) {
  if (!paymentMethod || typeof paymentMethod !== 'string') return null;
  const s = paymentMethod.toLowerCase().trim();
  if (!s) return null;

  // 1. Direct Debit (debit otomatis / account linking / kantong ekosistem)
  if (
    /\b(direct\s*debit|direct\s*debet|direk\s*debit|direk\s*debet|dd|autodebit|auto\s*debit|autodebet|auto\s*debet|debit|debet|debitt|direk|direct)\b/i.test(s) ||
    /\b(kantong|kantong\s*jago|kantong\s*utama|saku|saku\s*jago)\b/i.test(s) ||
    /\b(debit\s*otomatis|debet\s*otomatis|potong\s*saldo|potong\s*rekening|potong\s*jago)\b/i.test(s) ||
    /\b(linked|link\s*account|akun\s*terhubung|rekening\s*terhubung)\b/i.test(s)
  ) {
    return 'Direct Debit';
  }

  // 2. QRIS (scan barcode / QR / qis typo / transcription variations)
  if (
    /\b(qris|qis|qiss|qriz|kris|kriss|chris|gris|crispy|grisy|quris|qri|qriss|cris|criss|qr|qrcode|barcode|scan|kode\s*qr)\b/i.test(s) ||
    s === 'q-r-i-s' || s === 'q.r.i.s'
  ) {
    return 'QRIS';
  }

  // 3. Kartu Kredit (credit card / cc / cicilan)
  if (
    /\b(kartu\s*kredit|kredit|credit\s*card|credit|cc|k\.kredit|kartucredit|kartu\s*credit|gesek|swipe|cicil|cicilan|visa|mastercard)\b/i.test(s)
  ) {
    return 'Kartu Kredit';
  }

  // 4. Transfer Bank (tf / trf / tranfer / remit / mbanking)
  if (
    /\b(transfer|transfer\s*bank|transfer\s*antar\s*bank|atm|bank\s*transfer|trasnfer|tranfer|trnsfer|tf|trf|kirim|remit|e-banking|internet\s*banking|mobile\s*banking|m-banking|mbanking|bi-fast|bifast)\b/i.test(s)
  ) {
    return 'Transfer bank';
  }

  // 5. Tunai (cash / kas / kontan / uang fisik)
  if (
    /\b(tunai|cash|kontan|kas|uang\s*tunai|uang\s*cash|uang\s*fisik|uang\s*kertas|bayar\s*tunai|bayar\s*cash|cash\s*money)\b/i.test(s) ||
    s === 'uang'
  ) {
    return 'Tunai';
  }

  return null;
}

/**
 * Tulis satu transaksi ke tabel `transactions` di Supabase Nexa Finance.
 *
 * @param {object} params
 * @param {string} params.txType
 * @param {number} params.nominal
 * @param {string} params.categoryName
 * @param {string} params.accountName
 * @param {string} params.description
 * @param {string} params.dateISO
 * @param {string} params.timeHHMM
 * @param {string} params.paymentMethod
 * @param {string|null} params.splitGroupId
 * @param {string|null} params.splitLabel
 * @returns {Promise<{status: 'SUCCESS'|'SKIPPED'|'ERROR', id?: string, reason?: string}>}
 */
async function writeTransaction({ txType, nominal, categoryName, accountName, description, dateISO, timeHHMM, paymentMethod, splitGroupId = null, splitLabel = null }) {
  if (!supabaseFinance) {
    return { status: 'SKIPPED', reason: 'Supabase Finance tidak dikonfigurasi' };
  }

  // Resolve secara paralel untuk efisiensi
  const [accountId, categoryId] = await Promise.all([
    resolveAccountId(accountName),
    resolveCategoryId(categoryName, txType)
  ]);

  if (!accountId) {
    return {
      status: 'SKIPPED',
      reason: `Akun "${accountName}" tidak ditemukan di database. Buat akun terlebih dahulu di Nexa Finance Web.`
    };
  }

  if (!categoryId) {
    return {
      status: 'SKIPPED',
      reason: `Kategori "${categoryName}" tidak dapat dipetakan ke database.`
    };
  }

  let dbType = 'expense';
  if (txType.toUpperCase() === 'INCOME') dbType = 'income';
  else if (txType.toUpperCase() === 'TRANSFER') dbType = 'transfer';

  // Normalize payment_method to strictly match PostgreSQL check constraint:
  // ('QRIS', 'Transfer bank', 'Kartu Kredit', 'Tunai', 'Direct Debit')
  const cleanPaymentMethod = _normalizePaymentMethod(paymentMethod);

  // Build row data
  const rowData = {
    account_id:       accountId,
    category_id:      categoryId,
    amount:           Math.abs(nominal),
    type:             dbType,
    transaction_date: dateISO,
    transaction_time: timeHHMM ? timeHHMM.replace(/\./g, ':') : null,
    description:      description || null,
    payment_method:   cleanPaymentMethod,
  };
  if (splitGroupId) rowData.split_group_id = splitGroupId;
  if (splitLabel)   rowData.split_label   = splitLabel;

  let { data, error } = await supabaseFinance
    .from('transactions')
    .insert(rowData)
    .select('id')
    .single();

  // Self-healing fallback backward compatibility
  if (error && (error.message.includes('split_group_id') || error.message.includes('split_label'))) {
    console.warn('[SUPABASE_FINANCE] Kolom split_group_id belum ada di Supabase. Menggunakan fallback backward-compatible...');
    delete rowData.split_group_id;
    delete rowData.split_label;
    if (splitLabel && !String(rowData.description || '').includes(`[Split:`)) {
      rowData.description = `[Split: ${splitLabel}] ${rowData.description || ''}`.trim();
    }
    const fallbackRes = await supabaseFinance
      .from('transactions')
      .insert(rowData)
      .select('id')
      .single();
    data = fallbackRes.data;
    error = fallbackRes.error;
  }

  if (error) {
    console.error('[SUPABASE_FINANCE] writeTransaction INSERT error:', error.message);
    return { status: 'ERROR', reason: error.message };
  }

  return { status: 'SUCCESS', id: data.id };
}

/**
 * Membaca data transaksi dari Supabase dengan berbagai opsi filter.
 * 
 * @param {object} options
 * @param {number} options.limit
 * @param {string} options.keyword
 * @param {string} options.txType
 * @param {number} options.month
 * @param {number} options.year
 * @returns {Promise<Array>}
 */
async function readTransactions({ limit = 20, keyword = '', txType = null, month = null, year = null, dateISO = null } = {}) {
  if (!supabaseFinance) return [];

  let query = supabaseFinance
    .from('transactions')
    .select(`
      id,
      amount,
      type,
      split_label,
      split_group_id,
      transaction_date,
      transaction_time,
      description,
      payment_method,
      created_at,
      no,
      categories ( name ),
      accounts ( name )
    `)
    .order('transaction_date', { ascending: false })
    .order('transaction_time', { ascending: false });

  if (limit) query = query.limit(limit);

  if (txType) {
    const t = txType.toUpperCase();
    if (t === 'INCOME') query = query.eq('type', 'income');
    else if (t === 'TRANSFER') query = query.eq('type', 'transfer');
    else query = query.eq('type', 'expense');
  }

  // Filter tanggal spesifik (dateISO) atau rentang bulan & tahun
  if (dateISO) {
    query = query.eq('transaction_date', dateISO);
  } else if (year) {
    const startDate = new Date(year, (month || 1) - 1, 1);
    const endDate = month ? new Date(year, month, 0) : new Date(year, 11, 31);
    
    const startStr = startDate.toISOString().split('T')[0];
    const endStr = endDate.toISOString().split('T')[0];
    
    query = query.gte('transaction_date', startStr).lte('transaction_date', endStr);
  }

  const { data, error } = await query;
  if (error) {
    console.error('[SUPABASE_FINANCE] readTransactions error:', error.message);
    return [];
  }

  let results = data;
  if (keyword) {
    const kw = keyword.toLowerCase();
    results = data.filter(tx => 
      (tx.description && tx.description.toLowerCase().includes(kw)) ||
      (tx.categories?.name && tx.categories.name.toLowerCase().includes(kw)) ||
      (tx.accounts?.name && tx.accounts.name.toLowerCase().includes(kw)) ||
      (tx.amount.toString().includes(kw))
    );
  }

  return results;
}

/**
 * Mengupdate transaksi berdasarkan UUID
 * @param {string} uuid
 * @param {object} patchData
 */
async function updateTransaction(uuid, patchData) {
  if (!supabaseFinance) return { status: 'ERROR', reason: 'Supabase tidak dikonfigurasi' };
  
  const payload = {};
  
  if (patchData.nominal !== undefined) payload.amount = Math.abs(patchData.nominal);
  if (patchData.description !== undefined) payload.description = patchData.description;
  if (patchData.txType !== undefined) {
    const t = patchData.txType.toUpperCase();
    if (t === 'INCOME') payload.type = 'income';
    else if (t === 'TRANSFER') payload.type = 'transfer';
    else payload.type = 'expense';
  }
  if (patchData.dateISO !== undefined) payload.transaction_date = patchData.dateISO;
  if (patchData.timeHHMM !== undefined) payload.transaction_time = patchData.timeHHMM ? String(patchData.timeHHMM).replace(/\./g, ':') : null;
  if (patchData.paymentMethod !== undefined) {
    payload.payment_method = _normalizePaymentMethod(patchData.paymentMethod);
  }
  
  // Resolve relations if provided
  if (patchData.accountName) {
    const accId = await resolveAccountId(patchData.accountName);
    if (accId) payload.account_id = accId;
  }
  
  if (patchData.categoryName) {
    const typeToResolve = patchData.txType || 'EXPENSE';
    const catId = await resolveCategoryId(patchData.categoryName, typeToResolve);
    if (catId) payload.category_id = catId;
  }

  if (Object.keys(payload).length === 0) return { status: 'SUCCESS' };

  const { error } = await supabaseFinance
    .from('transactions')
    .update(payload)
    .eq('id', uuid);

  if (error) {
    console.error('[SUPABASE_FINANCE] updateTransaction error:', error.message);
    return { status: 'ERROR', reason: error.message };
  }
  
  return { status: 'SUCCESS' };
}

/**
 * Menghapus transaksi berdasarkan UUID
 * @param {string} uuid
 */
async function deleteTransaction(uuid) {
  if (!supabaseFinance) return { status: 'ERROR', reason: 'Supabase tidak dikonfigurasi' };
  
  const { error } = await supabaseFinance
    .from('transactions')
    .delete()
    .eq('id', uuid);

  if (error) {
    console.error('[SUPABASE_FINANCE] deleteTransaction error:', error.message);
    return { status: 'ERROR', reason: error.message };
  }
  
  return { status: 'SUCCESS' };
}

/**
 * Tulis sepasang transaksi transfer antar-akun (transfer_out dan transfer_in)
 * yang saling terikat dengan split_group_id yang sama ke Supabase Nexa Finance.
 *
 * @param {object} params
 * @param {string} params.fromAccountName - Akun sumber pengirim (e.g. 'Dana')
 * @param {string} params.toAccountName   - Akun tujuan penerima (e.g. 'Bank Jago')
 * @param {number} params.nominal         - Nominal transfer (angka positif)
 * @param {string} [params.description]   - Deskripsi transfer
 * @param {string} [params.dateISO]       - Tanggal transaksi (YYYY-MM-DD)
 * @param {string} [params.timeHHMM]      - Jam transaksi (HH:MM / HH.MM)
 * @param {string} [params.categoryName]  - Kategori transfer (default: 'Pengeluaran tidak tercatat ')
 * @returns {Promise<{status: 'SUCCESS'|'SKIPPED'|'ERROR', pairId?: string, outId?: string, inId?: string, reason?: string}>}
 */
async function writeTransferPair({
  fromAccountName,
  toAccountName,
  nominal,
  description,
  dateISO,
  timeHHMM,
  categoryName = 'Pengeluaran tidak tercatat '
}) {
  if (!supabaseFinance) {
    return { status: 'SKIPPED', reason: 'Supabase Finance tidak dikonfigurasi' };
  }

  const [fromAccountId, toAccountId, categoryId] = await Promise.all([
    resolveAccountId(fromAccountName),
    resolveAccountId(toAccountName),
    resolveCategoryId(categoryName, 'EXPENSE')
  ]);

  if (!fromAccountId) {
    return { status: 'SKIPPED', reason: `Akun asal "${fromAccountName}" tidak ditemukan di database.` };
  }
  if (!toAccountId) {
    return { status: 'SKIPPED', reason: `Akun tujuan "${toAccountName}" tidak ditemukan di database.` };
  }
  if (fromAccountId === toAccountId) {
    return { status: 'SKIPPED', reason: `Akun asal dan akun tujuan tidak boleh sama (${fromAccountName}).` };
  }
  if (!categoryId) {
    return { status: 'SKIPPED', reason: `Kategori "${categoryName}" tidak ditemukan di database.` };
  }

  const cleanDate = dateISO || new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' });
  const cleanTime = timeHHMM
    ? String(timeHHMM).replace(/\./g, ':')
    : new Date().toLocaleTimeString('id-ID', {
        timeZone: 'Asia/Jakarta',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
      });
  const pairId = crypto.randomUUID();
  const desc = description || `Transfer dari ${fromAccountName} ke ${toAccountName}`;

  const rows = [
    {
      account_id:       fromAccountId,
      category_id:      categoryId,
      amount:           Math.abs(nominal),
      type:             'transfer',
      split_label:      'transfer_out',
      split_group_id:   pairId,
      transaction_date: cleanDate,
      transaction_time: cleanTime,
      description:      desc,
      payment_method:   'Transfer bank',
    },
    {
      account_id:       toAccountId,
      category_id:      categoryId,
      amount:           Math.abs(nominal),
      type:             'transfer',
      split_label:      'transfer_in',
      split_group_id:   pairId,
      transaction_date: cleanDate,
      transaction_time: cleanTime,
      description:      desc,
      payment_method:   'Transfer bank',
    }
  ];

  const { data, error } = await supabaseFinance
    .from('transactions')
    .insert(rows)
    .select('id, split_label');

  if (error) {
    console.error('[SUPABASE_FINANCE] writeTransferPair error:', error.message);
    return { status: 'ERROR', reason: error.message };
  }

  const outRow = data?.find(r => r.split_label === 'transfer_out');
  const inRow = data?.find(r => r.split_label === 'transfer_in');

  return {
    status: 'SUCCESS',
    pairId,
    outId: outRow?.id,
    inId: inRow?.id
  };
}

module.exports = {
  writeTransaction,
  writeTransferPair,
  readTransactions,
  updateTransaction,
  deleteTransaction,
  _normalizePaymentMethod
};
