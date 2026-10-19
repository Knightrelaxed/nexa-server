'use strict';
/**
 * Finance_Corrections - Edit, delete (with confirmation) and undo of recorded transactions.
 * Extracted from Finance_Engine.js (finance split). Behaviour is unchanged; Finance_Engine.js remains the public facade.
 */
const supabaseFinance = require('../../infrastructure/Supabase_Finance');
const { _autoCategorizeMerchant, _parseFlexibleCurrency } = require('./Finance_Helpers');

// In-memory cache for deletion confirmations
const pendingDeletions = new Map();

// In-memory undo cache: { deletedRow, deletedIndex, expireTimerId }
let lastDeletedTransaction = null;

/**
 * Finds the best matching transaction row based on robust multi-attribute token scoring.
 * Works with Supabase transaction objects.
 */
function _findBestTransactionMatch(rows, keyword) {
  const kw = keyword ? String(keyword).toLowerCase().trim() : '';
  
  if (kw === '' || kw === 'latest') {
    return 0; // Supabase results are ordered newest first, so index 0 is newest
  }
  
  const tokens = kw.split(/\s+/).filter(t => t.length > 2 || /^\d+$/.test(t));
  if (tokens.length === 0) tokens.push(kw);

  let bestIndex = -1;
  let maxScore = 0;

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    
    const tanggal = (r.transaction_date || '').toLowerCase();
    const waktu = (r.transaction_time || '').toLowerCase();
    const kategori = (r.categories?.name || '').toLowerCase();
    const desc = (r.description || '').toLowerCase();
    const nominalRaw = String(r.amount || '');
    const nominalKw = kw.replace(/[^0-9]/g, '');

    let score = 0;
    
    if (nominalKw && nominalRaw && nominalRaw === nominalKw) score += 50;
    else if (nominalKw && nominalKw.length > 3 && nominalRaw.includes(nominalKw)) score += 20;

    if (desc === kw) score += 100;
    
    for (const t of tokens) {
      if (desc.includes(t)) score += 10;
      if (kategori.includes(t)) score += 5;
      if (tanggal.includes(t) || waktu.includes(t)) score += 5;
    }

    // BUG FIX 7: Prevent fuzzy match from deleting wrong transactions
    // Require a minimum score of 15 (e.g. full description match = 100, exact nominal = 50, etc.)
    if (score > maxScore && score >= 15) {
      maxScore = score;
      bestIndex = i;
    }
  }

  return bestIndex;
}

function getPendingDeletionsContext() {
  return pendingDeletions.size > 0 ? pendingDeletions : null;
}

/**
 * Initiates a deletion request. Finds the transaction from Supabase and stores it in pendingDeletions.
 */
async function requestDeleteConfirmation(keyword) {
  try {
    const rows = await supabaseFinance.readTransactions({ limit: 50 });
    if (!rows || rows.length === 0) return { status: 'FAILED', message: 'Tabel database saat ini masih kosong.' };

    const indexToDelete = _findBestTransactionMatch(rows, keyword);

    if (indexToDelete === -1) {
      return { status: 'FAILED', message: `Tidak ada transaksi yang cocok dengan "${keyword}".` };
    }

    const tx = rows[indexToDelete];
    const uuidShort = tx.id ? tx.id.substring(0, 8) : 'N/A';
    const tanggal = tx.transaction_date || '-';
    const waktu = tx.transaction_time || '-';
    const tipe = tx.type === 'income' ? 'Pemasukan' : 'Pengeluaran';
    const kategori = tx.categories?.name || '-';
    const catatan = tx.description || '-';
    const nominalFmt = `Rp${Math.abs(tx.amount || 0).toLocaleString('id-ID')}`;

    // Store in pending deletions with a 3-minute timeout
    const delKey = `del_${Date.now()}`;
    const timeoutId = setTimeout(() => {
      pendingDeletions.delete(delKey);
    }, 3 * 60 * 1000);
    
    pendingDeletions.set(delKey, { uuid: tx.id, txData: tx, timeoutId });

    const msg = `⚠️ <b>KONFIRMASI PENGHAPUSAN TRANSAKSI</b>\n\n` +
      `N.E.X.A menemukan data berikut di Supabase:\n` +
      `<b>ID:</b> ${uuidShort}\n` +
      `<b>Tanggal:</b> ${tanggal} ${waktu}\n` +
      `<b>Tipe/Kategori:</b> ${tipe} - ${kategori}\n` +
      `<b>Catatan:</b> ${catatan}\n` +
      `<b>Nominal:</b> ${nominalFmt}\n\n` +
      `❓ Apakah ini transaksi yang ingin Tuan hapus? (Balas <b>ya/hapus</b> atau <b>batal</b>)`;

    return { status: 'SUCCESS', message: msg };
  } catch (error) {
    console.error('[FINANCE] Failed to request delete:', error.message);
    return { status: 'FAILED', message: `Gagal mencari transaksi: ${error.message}` };
  }
}

/**
 * Confirms or cancels a pending deletion in Supabase.
 */
async function confirmDeleteTransaction(isYes) {
  if (pendingDeletions.size === 0) return null;

  for (const [key, pending] of pendingDeletions.entries()) {
    clearTimeout(pending.timeoutId);
    pendingDeletions.delete(key);

    if (isYes) {
      try {
        const result = await supabaseFinance.deleteTransaction(pending.uuid);
        
        if (result.status !== 'SUCCESS') {
          return `❌ Transaksi gagal dihapus dari database: ${result.reason}`;
        }

        // Simpan data lengkap untuk undo
        if (lastDeletedTransaction?.expireTimerId) clearTimeout(lastDeletedTransaction.expireTimerId);
        const expireTimerId = setTimeout(() => {
          lastDeletedTransaction = null;
        }, 10 * 60 * 1000);
        lastDeletedTransaction = { deletedTx: pending.txData, expireTimerId };

        const catatan = pending.txData.description || '-';
        const nominalFmt = `Rp${Math.abs(pending.txData.amount || 0).toLocaleString('id-ID')}`;

        return `🗑️ <b>TRANSAKSI DIHAPUS DARI DATABASE</b>\n\n"${catatan}" sebesar ${nominalFmt} telah dihapus sepenuhnya.\n\n💡 <i>Anda bisa membatalkan penghapusan ini dalam 10 menit ke depan dengan berkata "batalkan hapus" atau "undo".</i>`;
      } catch (error) {
        return `❌ Gagal menghapus transaksi dari database: ${error.message}`;
      }
    } else {
      return `✅ Penghapusan dibatalkan. Data tetap aman.`;
    }
  }
}

/**
 * Undo the last deleted transaction (within 10-minute window).
 * Re-inserts the transaction to Supabase.
 */
async function undoDeleteTransaction() {
  if (!lastDeletedTransaction) {
    return { status: 'FAILED', message: '⚠️ Tidak ada transaksi yang bisa di-undo. Mungkin sudah lebih dari 10 menit atau belum ada penghapusan.' };
  }

  try {
    const { deletedTx, expireTimerId } = lastDeletedTransaction;
    clearTimeout(expireTimerId);
    
    // Tulis ulang ke Supabase
    const sfResult = await supabaseFinance.writeTransaction({
      txType:       deletedTx.type.toUpperCase(),
      nominal:      deletedTx.amount,
      categoryName: deletedTx.categories?.name || 'Lainnya',
      accountName:  deletedTx.accounts?.name || 'Bank Mandiri',
      description:  deletedTx.description,
      dateISO:      deletedTx.transaction_date,
      timeHHMM:     deletedTx.transaction_time,
    });

    if (sfResult.status !== 'SUCCESS') {
      return { status: 'FAILED', message: `⚠️ Gagal memulihkan ke database: ${sfResult.reason}` };
    }

    const catatan = deletedTx.description || '-';
    const nominalFmt = `Rp${Math.abs(deletedTx.amount || 0).toLocaleString('id-ID')}`;

    lastDeletedTransaction = null; // Clear undo cache

    return { status: 'SUCCESS', message: `↩️ <b>Transaksi dikembalikan!</b>\n\n"${catatan}" sebesar <b>${nominalFmt}</b> telah dipulihkan ke database Supabase.` };
  } catch (error) {
    console.error('[FINANCE] Failed to undo delete:', error.message);
    return { status: 'FAILED', message: `Gagal mengembalikan transaksi: ${error.message}` };
  }
}

/**
 * Edit a specific transaction matching a keyword in Supabase.
 */
async function editTransaction(keyword, newNominal, newDescription, newCategory, newAccount, newPaymentMethod) {
  try {
    const rows = await supabaseFinance.readTransactions({ limit: 50 });
    if (!rows || rows.length === 0) return { status: 'FAILED', message: 'Tabel database saat ini masih kosong.' };

    const indexToEdit = _findBestTransactionMatch(rows, keyword);

    if (indexToEdit === -1) {
      return { status: 'FAILED', message: `Tidak ada transaksi yang cocok dengan "${keyword}".` };
    }

    const tx = rows[indexToEdit];
    const oldCatatan = tx.description || '-';
    const oldKategori = tx.categories?.name || '-';
    
    const patchData = {};
    
    // Update nominal if provided
    if (newNominal !== undefined && newNominal !== null && String(newNominal).trim() !== '') {
      const nominal = _parseFlexibleCurrency(String(newNominal));
      if (isNaN(nominal) || nominal <= 0) {
        return { status: 'FAILED', message: `Nominal baru tidak valid: "${newNominal}". Harus berupa angka positif.` };
      }
      patchData.nominal = nominal;
    }
    
    // Update description if provided
    if (newDescription) {
      patchData.description = newDescription;
    }

    // Update category if provided, OR auto-categorize using AI if user asks to fix category without giving a name!
    if (newCategory && newCategory !== 'Uncategorized' && newCategory !== 'Lainnya' && newCategory.toLowerCase() !== 'auto') {
      patchData.categoryName = newCategory;
      patchData.txType = tx.type; // Penting untuk resolveCategoryId agar tidak default ke EXPENSE
    } else if (
      (newCategory === 'Lainnya' || newCategory === 'auto' || (!newCategory || newCategory === 'Uncategorized')) &&
      (tx.categories?.name === 'Lainnya' || (keyword && /kategori|perbaiki|sesuaikan|ubah/i.test(keyword)))
    ) {
      console.log(`[FINANCE] Auto-recategorizing transaction "${tx.description}" during edit...`);
      const autoCat = await _autoCategorizeMerchant(tx.description || tx.account_name || keyword);
      if (autoCat && autoCat !== 'Lainnya') {
        patchData.categoryName = autoCat;
        patchData.txType = tx.type;
      }
    }

    // Update account if provided
    if (newAccount) {
      patchData.accountName = newAccount;
    }

    // Update payment method if provided
    if (newPaymentMethod) {
      patchData.paymentMethod = newPaymentMethod;
    }
    
    // Update the Supabase record
    const result = await supabaseFinance.updateTransaction(tx.id, patchData);

    if (result.status !== 'SUCCESS') {
      return { status: 'FAILED', message: `Gagal mengedit transaksi di database: ${result.reason}` };
    }

    const finalNominal = patchData.nominal !== undefined ? patchData.nominal : Math.abs(tx.amount || 0);
    const finalDescription = patchData.description !== undefined ? patchData.description : (tx.description || '-');
    const finalCategory = patchData.categoryName !== undefined ? patchData.categoryName : (tx.categories?.name || '-');
    const finalAccount = patchData.accountName !== undefined ? patchData.accountName : (tx.accounts?.name || '-');
    const finalPaymentMethod = patchData.paymentMethod !== undefined ? patchData.paymentMethod : (tx.payment_method || 'QRIS');
    const tipeLabel = tx.type === 'income' ? 'Pemasukan' : 'Pengeluaran';
    const akunName = finalAccount;
    
    const nominalFmt = `Rp${finalNominal.toLocaleString('id-ID')}`;

    let editedFields = [];
    if (patchData.nominal !== undefined) editedFields.push(`Nominal (dari Rp${Math.abs(tx.amount || 0).toLocaleString('id-ID')} menjadi ${nominalFmt})`);
    if (patchData.description !== undefined) editedFields.push(`Catatan (dari "${oldCatatan}" menjadi "${finalDescription}")`);
    if (patchData.categoryName !== undefined) editedFields.push(`Kategori (dari "${oldKategori}" menjadi "${finalCategory}")`);
    if (patchData.accountName !== undefined) editedFields.push(`Akun (menjadi "${finalAccount}")`);
    if (patchData.paymentMethod !== undefined) editedFields.push(`Metode Pembayaran (menjadi "${finalPaymentMethod}")`);

    const message = `💸 <b>TRANSAKSI DIEDIT</b>\n\n` +
      `<b>No:</b> ${tx.id.substring(0,8)}\n` +
      `<b>Tanggal:</b> ${tx.transaction_date || '-'}\n` +
      `<b>Waktu:</b> ${tx.transaction_time ? tx.transaction_time.slice(0,5) : '-'}\n` +
      `<b>Tipe:</b> ${tipeLabel}\n` +
      `<b>Kategori:</b> ${finalCategory}\n` +
      `<b>Akun:</b> ${akunName}\n` +
      `<b>Deskripsi:</b> ${finalDescription}\n` +
      `<b>Nominal (Rp):</b> ${nominalFmt}\n` +
      `<b>Saldo (Rp) Saat Ini:</b> -\n\n` +
      `Yang saya edit adalah:\n- ${editedFields.join('\n- ')}\n\n` +
      `Apakah ada hal lain yang mau diedit, Tuan?`;

    return { status: 'SUCCESS', message };
  } catch (error) {
    console.error('[FINANCE] Failed to edit transaction:', error.message);
    return { status: 'FAILED', message: `Gagal mengubah transaksi: ${error.message}` };
  }
}

module.exports = {
  pendingDeletions,
  _findBestTransactionMatch,
  getPendingDeletionsContext,
  requestDeleteConfirmation,
  confirmDeleteTransaction,
  undoDeleteTransaction,
  editTransaction,
};
