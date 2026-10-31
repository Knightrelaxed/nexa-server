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

const { supabaseFinance } = require('./client');
const { resolveAccountId, resolveCategoryId } = require('./reference_data');

/**
 * Normalisasi metode pembayaran agar sesuai PostgreSQL CHECK constraint:
 * ('QRIS', 'Transfer bank', 'Kartu Kredit', 'Tunai', 'Direct Debit')
 */
function _normalizePaymentMethod(paymentMethod) {
  if (!paymentMethod) return null;
  const pmLower = String(paymentMethod).toLowerCase().trim();
  if (pmLower.includes('qris') || pmLower.includes('qr') || pmLower.includes('kris')) {
    return 'QRIS';
  } else if (pmLower.includes('direct') || pmLower.includes('debit') || pmLower.includes('autodebit') || pmLower.includes('auto debit') || pmLower.includes('kantong')) {
    return 'Direct Debit';
  } else if (pmLower.includes('transfer') || pmLower.includes('tf') || pmLower.includes('bank') || pmLower.includes('atm')) {
    return 'Transfer bank';
  } else if (pmLower.includes('kredit') || pmLower.includes('credit') || pmLower.includes('cc')) {
    return 'Kartu Kredit';
  } else if (pmLower.includes('tunai') || pmLower.includes('cash') || pmLower.includes('kontan')) {
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

  const dbType = txType.toUpperCase() === 'INCOME' ? 'income' : 'expense';

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
async function readTransactions({ limit = 5, keyword = '', txType = null, month = null, year = null } = {}) {
  if (!supabaseFinance) return [];

  let query = supabaseFinance
    .from('transactions')
    .select(`
      id,
      amount,
      type,
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
    query = query.eq('type', txType.toUpperCase() === 'INCOME' ? 'income' : 'expense');
  }

  // Filter bulan & tahun
  if (year) {
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
  if (patchData.txType !== undefined) payload.type = patchData.txType.toUpperCase() === 'INCOME' ? 'income' : 'expense';
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

module.exports = {
  writeTransaction,
  readTransactions,
  updateTransaction,
  deleteTransaction,
  _normalizePaymentMethod
};
