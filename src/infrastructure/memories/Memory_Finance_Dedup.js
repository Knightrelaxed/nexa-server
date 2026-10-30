/**
 * ============================================================
 * [N.E.X.A] memories/Memory_Finance_Dedup.js
 * Dedup transaksi keuangan & transaksi pending
 *
 * Bagian dari modularisasi Supabase_Memories.js (facade: ../Supabase_Memories.js).
 * Kode dipindahkan verbatim oleh scripts/refactor/split_supabase_memories.js;
 * satu-satunya perubahan adalah jalur require relatif (+1 level).
 * ============================================================
 */

const { supabase } = require('./Memory_Client');

/**
 * Check if a financial transaction is a duplicate using Composite Key
 * @param {string} compositeKey - e.g. "50000_Kopi Kenangan"
 * @param {Date} transactionTime 
 */
async function isDuplicateTransaction(compositeKey, transactionTime, checkPending = true) {
  if (!supabase) return false;
  
  // ── Gate 1: Check nexa_finance_dedup ─────────────────────────────────────
  // Dedup window: 60 minutes (1 jam). Same nominal+merchant is allowed on different hours.
  // This prevents double-recording from Finance Auto-Sync email re-polling and manual Telegram inputs,
  // but allows Tuan Faqih to record the same purchase (e.g. "Kopi Kenangan, Rp25.000") twice a day.
  const windowStart = new Date(transactionTime.getTime() - 60 * 60 * 1000).toISOString();
  const windowEnd   = new Date(transactionTime.getTime() + 60 * 60 * 1000).toISOString();

  const { data: dedupData, error: dedupError } = await supabase
    .from('nexa_finance_dedup')
    .select('id')
    .eq('composite_key', compositeKey)
    .gte('transaction_time', windowStart)
    .lte('transaction_time', windowEnd);

  if (dedupError) {
    console.error('[SUPABASE] Error checking duplicate:', dedupError.message);
    return false; 
  }

  if (dedupData && dedupData.length > 0) return true;

  if (!checkPending) return false;

  // ── Gate 2: Check nexa_pending_transactions ───────────────────────────────
  // Critical: a pending record exists when Telegram confirmation was queued
  // but the server restarted before the user responded. Without this check,
  // pollFinanceEmails would re-process the same email and write a DUPLICATE row
  // to the database because nexa_finance_dedup is only written AFTER save.
  try {
    const { data: pendingData, error: pendingError } = await supabase
      .from('nexa_pending_transactions')
      .select('composite_key')
      .eq('composite_key', compositeKey)
      .limit(1);

    if (pendingError) {
      console.warn('[SUPABASE] Error checking pending transactions for dedup:', pendingError.message);
    } else if (pendingData && pendingData.length > 0) {
      console.log(`[SUPABASE] Dedup via pending_transactions: ${compositeKey} already awaiting confirmation.`);
      return true;
    }
  } catch (e) {
    console.warn('[SUPABASE] Unexpected error in pending dedup check:', e.message);
  }

  return false;
}

/**
 * Log a new transaction key to prevent future duplicates
 */
function _isSyntheticTestKey(key) {
  if (!key) return false;
  const s = String(key).toLowerCase();
  return s.startsWith('test_') || s.startsWith('mock_') || s.startsWith('audit_test_');
}

async function logTransactionKey(compositeKey, transactionTime, source) {
  if (!supabase) return;
  if (process.env.NODE_ENV === 'test' || _isSyntheticTestKey(compositeKey)) return;
  const { error } = await supabase
    .from('nexa_finance_dedup')
    .insert([{ 
      composite_key: compositeKey, 
      transaction_time: transactionTime.toISOString(),
      source 
    }]);

  if (error) console.error('[SUPABASE] Error logging transaction key:', error.message);
}

/**
 * [AUTOMATIC CLEANUP] Hapus rekaman dedup yang sudah kadaluwarsa (> 7 hari)
 * Karena isDuplicateTransaction hanya mengecek jendela waktu 60 menit,
 * data lama di nexa_finance_dedup sudah tidak diperlukan lagi dan aman dibersihkan.
 * @param {number} daysOld - Batas hari kadaluwarsa (default 7 hari)
 * @returns {Promise<{success: boolean, deletedCount?: number, error?: string}>}
 */
async function cleanupOldFinanceDedup(daysOld = 7) {
  if (!supabase) return { success: false, error: 'Supabase belum dikonfigurasi.' };
  const cutoffDate = new Date(Date.now() - daysOld * 24 * 60 * 60 * 1000).toISOString();

  try {
    const { data, error } = await supabase
      .from('nexa_finance_dedup')
      .delete()
      .lt('transaction_time', cutoffDate)
      .select('id');

    if (error) {
      console.error('[SUPABASE] Error cleaning up old finance dedup rows:', error.message);
      return { success: false, error: error.message };
    }

    const count = data?.length || 0;
    if (count > 0) {
      console.log(`[SUPABASE] 🧹 Bersih-bersih: Berhasil menghapus ${count} baris kadaluwarsa dari nexa_finance_dedup (> ${daysOld} hari).`);
    }
    return { success: true, deletedCount: count };
  } catch (err) {
    console.error('[SUPABASE] Unexpected error cleaning up finance dedup:', err.message);
    return { success: false, error: err.message };
  }
}

/**
 * Save a pending transaction to Supabase (survives server restarts)
 */
async function savePendingTransaction(compositeKey, txData, telegramSent = false) {
  if (!supabase) return;
  if (process.env.NODE_ENV === 'test' || _isSyntheticTestKey(compositeKey)) return;
  const { error } = await supabase
    .from('nexa_pending_transactions')
    .upsert([{
      composite_key: compositeKey,
      tx_data: txData,
      telegram_sent: telegramSent,
      created_at: new Date().toISOString()
    }], { onConflict: 'composite_key' });
  if (error) console.error('[SUPABASE] Error saving pending transaction:', error.message);
}

/**
 * Get all pending transactions (for recovery after server restart)
 */
async function getPendingTransactions() {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('nexa_pending_transactions')
    .select('*')
    .order('created_at', { ascending: true });
  if (error) {
    console.error('[SUPABASE] Error fetching pending transactions:', error.message);
    return [];
  }
  return data || [];
}

/**
 * Delete a resolved/cancelled pending transaction from Supabase
 */
async function deletePendingTransaction(compositeKey) {
  if (!supabase) return;
  const { error } = await supabase
    .from('nexa_pending_transactions')
    .delete()
    .eq('composite_key', compositeKey);
  if (error) console.error('[SUPABASE] Error deleting pending transaction:', error.message);
}

/**
 * Mark a pending transaction as telegram_sent = true
 */
async function markPendingTransactionSent(compositeKey) {
  if (!supabase) return;
  const { error } = await supabase
    .from('nexa_pending_transactions')
    .update({ telegram_sent: true })
    .eq('composite_key', compositeKey);
  if (error) console.error('[SUPABASE] Error marking pending transaction as sent:', error.message);
}

module.exports = {
  isDuplicateTransaction,
  logTransactionKey,
  cleanupOldFinanceDedup,
  savePendingTransaction,
  getPendingTransactions,
  deletePendingTransaction,
  markPendingTransactionSent
};
