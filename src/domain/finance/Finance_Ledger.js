'use strict';
/**
 * Finance_Ledger - Core transaction write path and read queries.
 * Extracted from Finance_Engine.js (finance split). Behaviour is unchanged; Finance_Engine.js remains the public facade.
 */
const supabase = require('../../infrastructure/Supabase_Memories');
const supabaseFinance = require('../../infrastructure/Supabase_Finance');
const { _autoCategorizeMerchant, _formatTxAsCard, _normalizePaymentMethod, _parseFlexibleCurrency, _parseRelativeDateFilter } = require('./Finance_Helpers');

/**
 * Handle a finance transaction (Deduplication & Recording)
 * Called either via GMAIL_POLLING or AI Router Intent (source='TELEGRAM_MANUAL')
 *
 * @param {object} data - { nominal, type, destination, category, description, time }
 * @param {string} source - 'GMAIL_POLLING' | 'TELEGRAM_MANUAL'
 */
async function processTransaction(data, source) {
  // CRITICAL: nominal may arrive as string in various formats (IDR: "3.600.000", plain: 3600000).
  // Always use _parseFlexibleCurrency to handle all formats correctly.
  const nominal = typeof data.nominal === 'number' && !isNaN(data.nominal)
    ? data.nominal
    : _parseFlexibleCurrency(String(data.nominal));
  if (isNaN(nominal) || nominal <= 0) {
    console.error(`[FINANCE] Invalid nominal value: ${data.nominal}`);
    throw new Error(`Nominal tidak valid: "${data.nominal}". Harus berupa angka positif.`);
  }

  const transactionTime = new Date(data.time || new Date().toISOString());

  // Composite dedup key: "NOMINAL_MERCHANT" or explicit compositeKey (e.g. gmail_id)
  const cleanMerchant = (data.destination || 'Unknown').toLowerCase().replace(/[^a-z0-9]/g, '');
  const compositeKey = data.compositeKey || `${nominal}_${cleanMerchant}`;
  console.log(`[FINANCE] Evaluating transaction: ${compositeKey} from ${source}`);

  // Deduplication — only for passive (automated) inputs, not manual Telegram entries
  if (source === 'GMAIL_POLLING') {
    // Pass false to skip pending check if we are already processing it.
    const isDuplicate = await supabase.isDuplicateTransaction(compositeKey, transactionTime, false);
    if (isDuplicate) {
      console.log(`[FINANCE] Zero-Duplication Engine intercepted duplicate entry from ${source}.`);
      return { status: 'DUPLICATE', message: 'Transaction already recorded.' };
    }
  }

  try {
    // Format date in Indonesian locale (e.g. "9 Februari 2026")
    const dateStr = transactionTime.toLocaleDateString('id-ID', {
      timeZone: 'Asia/Jakarta',
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    });

    // Format time as HH.MM (e.g. "14.45")
    const timeStr = transactionTime.toLocaleTimeString('id-ID', {
      timeZone: 'Asia/Jakarta',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    }).replace(':', '.');

    // Normalize type to Indonesian label
    const isIncome = (data.type || '').toUpperCase() === 'INCOME' || data.type === 'Pemasukan';
    const tipeLabel = isIncome ? 'Pemasukan' : 'Pengeluaran';

    // Nominal: positive for Pemasukan, NEGATIVE for Pengeluaran
    const nominalSigned = isIncome ? nominal : -nominal;

    // Apply smart categorization combining both destination and description for maximum context
    const dest = data.destination && data.destination !== 'Unknown' ? data.destination : '';
    const desc = data.description && data.description !== '[Menunggu Detail User]' && data.description !== '-' ? data.description : '';
    const combinedContext = [dest, desc].filter(Boolean).join(' - ') || 'Unknown';
    const smartCategory = await _autoCategorizeMerchant(combinedContext, data.category);

    // Nama akun: gunakan data.account jika ada (dari Telegram manual/AI Router).
    // Jika otomatis dari email Auto-Sync, paksa 'Bank Mandiri'.
    // Jika manual dan kosong, ambil akun aktif pertama dari database.
    let akunName = data.account && String(data.account).trim() ? String(data.account).trim() : null;
    if (!akunName) {
      if (source === 'GMAIL_POLLING') {
        akunName = 'Bank Mandiri';
      } else {
        const accounts = await supabaseFinance.getAccountsList();
        if (accounts && accounts.length > 0) {
          akunName = accounts[0].name;
        } else {
          akunName = 'Tunai'; // Failsafe mutlak
        }
      }
    }
    // ── METODE PEMBAYARAN ───────────────────────────────────────────────────
    // Ekstrak dari data AI Router secara case-insensitive. Jika invalid/kosong, default null.
    const pmRaw = typeof data.payment_method === 'string' ? data.payment_method.toLowerCase().trim() : '';
    const paymentMethod = _normalizePaymentMethod(pmRaw);

    const txDateISO = transactionTime.toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' });
    const txTimeHHMM = transactionTime.toLocaleTimeString('id-ID', {
      timeZone: 'Asia/Jakarta',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    });

    const sfResult = await supabaseFinance.writeTransaction({
      txType:        isIncome ? 'INCOME' : 'EXPENSE',
      nominal,
      categoryName:  smartCategory,
      accountName:   akunName,
      description:   data.description || data.destination || '-',
      dateISO:       txDateISO,
      timeHHMM:      txTimeHHMM,
      paymentMethod: paymentMethod,
    });

    if (sfResult.status !== 'SUCCESS') {
      throw new Error(`Supabase Finance gagal: ${sfResult.reason}`);
    }

    console.log(`[FINANCE] ✅ Transaksi Supabase berhasil disimpan (ID: ${sfResult.id})`);

    // Log composite key to dedup table (prevents cross-channel duplicates)
    await supabase.logTransactionKey(compositeKey, transactionTime, source);

    // [PHASE 6 — Pilar 8.2] Log finance activity for behavioral tracking (fire-and-forget)
    try {
      const behaviorEngine = require('../Behavior_Engine');
      await behaviorEngine.logFinanceRecord({
        type: isIncome ? 'INCOME' : 'EXPENSE',
        nominal,
        // Gunakan smartCategory (hasil AI kategorisasi final) agar log lebih akurat
        category: smartCategory || data.category || 'Lainnya'
      });
    } catch (_) { /* Never let behavior logging crash the finance flow */ }

    // [BUDGET ENGINE] Check limits and alert if exceeding thresholds
    if (!isIncome) {
      try {
        const budgetEngine = require('../Budget_Engine');
        const alertMsg = await budgetEngine.checkAndAlertBudget({
          nominal,
          categoryName: smartCategory,
          description: data.description || data.destination || '-',
          date: transactionTime
        });
        if (alertMsg) {
          const { sendTelegramOutbound } = require('../../interfaces/webhook');
          // Kirim secara asinkron tanpa nge-block response ke user
          sendTelegramOutbound(alertMsg).catch(e => console.error('[BUDGET] Telegram alert failed:', e.message));
        }
      } catch (err) {
        console.error('[FINANCE] Budget check failed (non-fatal):', err.message);
      }
    }

    const nominalFormatted = `Rp${nominal.toLocaleString('id-ID')}`;
    const paymentMethodLine = paymentMethod ? `\n💳 <b>Metode:</b> ${paymentMethod}` : '';
    return {
      status: 'SUCCESS',
      message: `✅ Transaksi <b>${tipeLabel}</b> sebesar <b>${nominalFormatted}</b> berhasil dicatat ke database Supabase (Akun: ${akunName}).${paymentMethodLine}`
    };
  } catch (error) {
    console.error('[FINANCE] Failed to record transaction:', error.message);
    throw error;
  }
}

/**
 * Fetch recent transactions from Supabase
 * @param {number} limit - how many recent rows to show
 */
async function getRecentTransactions(limit = 5) {
  try {
    const rows = await supabaseFinance.readTransactions({ limit });
    if (!rows || rows.length === 0) return '📭 Tidak ada transaksi yang tercatat di Supabase bulan ini.';

    let response = `💸 <b>${rows.length} Transaksi Terakhir (Supabase):</b>\n\n`;
    // Membalik urutan agar tampil dari yang terlama ke yang terbaru (kronologis)
    const cards = [...rows].reverse().map(row => _formatTxAsCard(row)).join('\n──────────────\n');
    response += cards + '\n──────────────';
    return response;
  } catch (err) {
    console.error('[FINANCE] Failed to fetch recent transactions:', err.message);
    return `⚠️ Gagal mengambil data keuangan: ${err.message}`;
  }
}

/**
 * Search and display transactions with precise multi-attribute filtering from Supabase.
 * @param {Object} filters
 * @param {string} [filters.date_text]
 * @param {string} [filters.keyword]
 * @param {string} [filters.type]
 * @param {string} [filters.category]
 * @param {number} [filters.limit]
 */
async function searchTransactions(filters = {}) {
  try {
    const targetDate = filters.date_text ? _parseRelativeDateFilter(filters.date_text) : null;
    let month = null, year = null;
    if (targetDate) {
      month = targetDate.getMonth() + 1;
      year = targetDate.getFullYear();
    }

    const typeLower = filters.type ? filters.type.toLowerCase().trim() : null;
    let txType = null;
    if (typeLower) {
      if (typeLower.includes('masuk') || typeLower === 'pemasukan' || typeLower === 'income') txType = 'INCOME';
      if (typeLower.includes('keluar') || typeLower === 'pengeluaran' || typeLower === 'expense') txType = 'EXPENSE';
    }

    // Gabungkan keyword dan category menjadi keyword umum untuk pencarian Supabase
    const keywordParts = [];
    if (filters.keyword) keywordParts.push(filters.keyword);
    if (filters.category) keywordParts.push(filters.category);
    const searchKeyword = keywordParts.join(' ');

    const rows = await supabaseFinance.readTransactions({
      limit: filters.limit || 20,
      keyword: searchKeyword,
      txType,
      month,
      year
    });

    if (!rows || rows.length === 0) {
      let desc = 'transaksi';
      if (filters.date_text) desc += ` pada ${filters.date_text}`;
      if (filters.keyword)   desc += ` dengan kata kunci "${filters.keyword}"`;
      if (filters.type)      desc += ` (${filters.type})`;
      return `📭 Tidak ada ${desc} yang ditemukan di database.`;
    }

    const _formatDateLabel = (dt) => {
      if (!dt) return null;
      const isoMatch = dt.match(/^(\d{4})-(\d{2})-(\d{2})/);
      if (isoMatch) {
        const d = new Date(parseInt(isoMatch[1]), parseInt(isoMatch[2]) - 1, parseInt(isoMatch[3]));
        return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
      }
      return dt;
    };
    let header = `🔍 <b>Ditemukan ${rows.length} transaksi`;
    if (filters.date_text) header += ` pada ${_formatDateLabel(filters.date_text)}`;
    if (filters.type)      header += ` (${filters.type})`;
    if (filters.keyword)   header += ` — "${filters.keyword}"`;
    header += `:</b>\n\n`;

    // Membalik urutan agar tampil dari yang terlama ke yang terbaru (kronologis)
    const cards = [...rows].reverse().map(tx => _formatTxAsCard(tx)).join('\n──────────────\n');
    return header + cards;
  } catch (err) {
    console.error('[FINANCE] searchTransactions failed:', err.message);
    return `⚠️ Gagal mencari data transaksi: ${err.message}`;
  }
}

module.exports = {
  processTransaction,
  getRecentTransactions,
  searchTransactions,
};
