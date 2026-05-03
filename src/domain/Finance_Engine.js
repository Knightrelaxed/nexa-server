const supabase = require('../infrastructure/Supabase_Memories');
const googleWorkspace = require('../infrastructure/Google_Workspace');

/**
 * Handle a finance transaction (Deduplication & Recording)
 * Called either directly via Tasker Webhook OR through AI Router Intent
 * 
 * @param {object} data - { nominal, type, destination, category, description, time }
 * @param {string} source - 'TASKER_LIVIN', 'GMAIL_POLLING', or 'TELEGRAM_MANUAL'
 */
async function processTransaction(data, source) {
  // CRITICAL: nominal may arrive as a string (from Tasker %antext or JSON body).
  // Always coerce to float. If not a valid number, reject immediately.
  const nominal = parseFloat(data.nominal);
  if (isNaN(nominal) || nominal <= 0) {
    console.error(`[FINANCE] Invalid nominal value: ${data.nominal}`);
    throw new Error(`Nominal tidak valid: "${data.nominal}". Harus berupa angka positif.`);
  }

  const transactionTime = new Date(data.time || new Date().toISOString());
  
  // Format Composite Key: "NOMINAL_MERCHANT"
  // Normalize merchant name (lowercase, no spaces) to improve deduplication accuracy
  const cleanMerchant = (data.destination || 'Unknown').toLowerCase().replace(/[^a-z0-9]/g, '');
  const compositeKey = `${nominal}_${cleanMerchant}`;

  console.log(`[FINANCE] Evaluating transaction: ${compositeKey} from ${source}`);

  // Deduplication check is ONLY for passive inputs. Telegram manual input bypasses this.
  if (source === 'TASKER_LIVIN' || source === 'GMAIL_POLLING') {
    const isDuplicate = await supabase.isDuplicateTransaction(compositeKey, transactionTime);
    
    if (isDuplicate) {
      console.log(`[FINANCE] Zero-Duplication Engine intercepted duplicate entry from ${source}.`);
      return { status: 'DUPLICATE', message: 'Transaction already recorded.' };
    }
  }

  // Record to Google Sheets
  try {
    const dateOptions = { timeZone: 'Asia/Jakarta' };
    const dateStr = transactionTime.toLocaleDateString('id-ID', dateOptions);
    const timeStr = transactionTime.toLocaleTimeString('id-ID', dateOptions);
    
    // Columns: Tanggal | Waktu | Tipe Transaksi | Tujuan / Merchant | Kategori | Deskripsi | Nominal | Sumber Data
    await googleWorkspace.appendFinanceRow([
      dateStr,
      timeStr,
      data.type || 'EXPENSE',
      data.destination || 'Unknown',
      data.category || 'Uncategorized',
      data.description || '-',
      nominal,   // Always a float now
      source
    ]);

    // Log the key to dedup table for ALL sources
    // (prevents cross-channel duplicates: e.g. Tasker picks up same tx that was manually entered)
    await supabase.logTransactionKey(compositeKey, transactionTime, source);
    
    console.log(`[FINANCE] Transaction saved to ledger successfully.`);
    return { status: 'SUCCESS', message: `Transaksi ${data.type || 'EXPENSE'} sebesar Rp${nominal.toLocaleString('id-ID')} untuk ${data.destination || 'Unknown'} berhasil dicatat.` };
  } catch (error) {
    console.error('[FINANCE] Failed to record transaction:', error.message);
    throw error;
  }
}

module.exports = { processTransaction };
