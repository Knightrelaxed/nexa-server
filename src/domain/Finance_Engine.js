const supabase = require('../infrastructure/Supabase_Memories');
const supabaseFinance = require('../infrastructure/Supabase_Finance');
const gmailClient = require('../infrastructure/Gmail_Client');
// axios removed — all Telegram sends must use sendTelegramOutbound (Cloudflare proxy) not direct api.telegram.org
const env = require('../config/env');

// In-memory cache of pending confirmations (source of truth = Supabase)
// key: compositeKey, value: { tx, timeoutId }
const pendingConfirmations = new Map();

// Lock to prevent race conditions during auto-save
const processingKeys = new Set();

// In-memory cache for deletion confirmations
const pendingDeletions = new Map();

let isPollingLivin = false;

// AUDIT FIX: sendTelegramWithRetry REMOVED — it called api.telegram.org directly which is BLOCKED
// on HF Docker. All Telegram sends from Finance_Engine must use sendTelegramOutbound() from
// webhook.js which routes through the Cloudflare Worker proxy.

// VALID_FINANCE_CATEGORIES statis telah dihapus. Daftar ditarik dinamis dari DB.

async function _autoCategorizeMerchant(merchantName, currentCategory) {
  // If user/AI Router already chose a valid specific category, keep it.
  // MUST also treat placeholder strings as "needs categorization".
  const INVALID_CATEGORIES = ['Lainnya', 'Livin Email', '[Menunggu Kategori AI/User]', 'Uncategorized'];
  if (currentCategory && !INVALID_CATEGORIES.includes(currentCategory) && currentCategory.trim() !== '' && !currentCategory.startsWith('[')) {
    return currentCategory;
  }

  // 100% AI-driven categorization — no rigid regex rules
  try {
    const { callAI } = require('../core/AI_Router');
    const supabaseFinance = require('../infrastructure/Supabase_Finance');
    const categories = await supabaseFinance.getCategoriesList();
    const validCatNames = categories.map(c => c.name);

    const prompt = `Kamu adalah mesin kategorisasi transaksi keuangan. Analisa tujuan/catatan transaksi berikut dan pilih SATU kategori yang paling tepat.

Transaksi: "${merchantName}"

Daftar kategori (pilih SATU saja, tulis PERSIS):
${validCatNames.map(c => `- ${c}`).join('\n')}

ATURAN:
1. Gunakan inferensi cerdas. Contoh: "kopi latte" → "Kafe/Bar", "kopi" → "Kafe/Bar", "starbucks" → "Kafe/Bar", "GRAB FOOD" → "Restoran, makanan cepat saji", "GRAB TRANSPORT" → "Taksi", "nge gym" → "Olahraga aktif, kebugaran", "Waroeng Emdje" → "Restoran, makanan cepat saji", "Bakmi Jowo" → "Restoran, makanan cepat saji", "Amira Fotocopy" → "Alat tulis, peralatan", "Bisnis Kab. Sumenep" → "Layanan", "nieta kitchen" → "Restoran, makanan cepat saji", "nasi Padang" → "Restoran, makanan cepat saji", "beli Ades" → "Makanan dan minuman", "Indomaret" → "Belanja", "Shopee" → "Belanja online", "Menghutangi aji" → "Pinjaman, bunga".
2. KHUSUS kategori "Lainnya": HANYA gunakan JIKA deskripsinya kosong/tidak ada ATAU informasinya hanyalah singkatan/nama orang yang sangat ambigu (misal: "Budi", "Agus"). JIKA ada catatan atau deskripsi tujuan (sekecil apapun petunjuknya, misal "beli es teh", "ongkos", "pulsa"), JANGAN PERNAH memilih "Lainnya"! Kamu HARUS pintar menebak kategori yang paling mendekati deskripsi tersebut.
3. HANYA balas nama kategori. Tanpa penjelasan, tanpa tanda kutip.`;
    const aiResp = await callAI(prompt);
    let cat = aiResp.trim();
    // Strip quotes/whitespace if AI wraps the answer
    cat = cat.replace(/^["'`](.*)["'`]$/, '$1').trim();
    // Strip trailing period/punctuation
    cat = cat.replace(/[.!]+$/, '').trim();

    if (validCatNames.includes(cat)) {
      console.log(`[FINANCE] AI categorized "${merchantName}" → "${cat}"`);
      return cat;
    }
    // Fuzzy match: AI might return slightly different casing
    const fuzzy = validCatNames.find(v => v.toLowerCase() === cat.toLowerCase());
    if (fuzzy) {
      console.log(`[FINANCE] AI categorized (fuzzy) "${merchantName}" → "${fuzzy}"`);
      return fuzzy;
    }
    console.warn(`[FINANCE] AI returned invalid category "${cat}" for "${merchantName}". Falling back to Lainnya.`);
  } catch (e) {
    console.error('[FINANCE] AI Categorization failed:', e.message);
  }

  return 'Lainnya';
}


/**
 * On startup: recover any pending transactions from Supabase that were
 * never sent to Telegram (e.g. server crashed mid-send).
 * Re-registers their 5-min timeout from remaining time.
 */
async function recoverPendingTransactions() {
  try {
    const rows = await supabase.getPendingTransactions();
    if (!rows || rows.length === 0) return;
    console.log(`[FINANCE] Recovering ${rows.length} pending transaction(s) from Supabase...`);

    for (const row of rows) {
      const tx = row.tx_data;
      const compositeKey = row.composite_key;
      const createdAt = new Date(row.created_at);
      const ageMs = Date.now() - createdAt.getTime();
      const TIMEOUT_MS = 5 * 60 * 1000;

      // If already older than 5 minutes — auto-save immediately
      if (ageMs >= TIMEOUT_MS) {
        console.log(`[FINANCE] Recovered tx ${compositeKey} is expired. Auto-saving now...`);
        try {
          // DEDUP GUARD: Check dedup tables before saving to prevent
          // race condition with Watchdog cron (which also runs every 90s).
          // We pass checkPending=false because this is already a pending transaction.
          const alreadySaved = await supabase.isDuplicateTransaction(compositeKey, createdAt, false);
          if (alreadySaved) {
            console.log(`[FINANCE] Recovery: ${compositeKey} already saved or pending. Deleting stale pending record.`);
            await supabase.deletePendingTransaction(compositeKey);
            continue;
          }

          const tipeStr = tx.type === 'INCOME' ? 'pemasukan' : 'pengeluaran';
          tx.category = await _autoCategorizeMerchant(tx.destination, tx.category);
          if (tx.description === '[Menunggu Detail User]') tx.description = `${tipeStr} ke ${tx.destination}`;
          await processTransaction(tx, 'GMAIL_POLLING');
          // processTransaction already calls logTransactionKey, but we
          // delete the pending record immediately after to signal to the
          // Watchdog that this tx is resolved and should not be re-processed.
        } catch (saveErr) {
          console.error(`[FINANCE] Recovery auto-save failed for ${compositeKey}:`, saveErr.message);
        } finally {
          try { await supabase.deletePendingTransaction(compositeKey); } catch (e) {
            console.error(`[FINANCE] Failed to delete recovered tx ${compositeKey}:`, e.message);
          }
        }
        continue;
      }

      // Register in-memory map
      const remaining = TIMEOUT_MS - ageMs;
      const timeoutId = setTimeout(async () => {
        if (pendingConfirmations.has(compositeKey)) {
          await _autoSavePending(compositeKey, tx);
        }
      }, remaining);
      pendingConfirmations.set(compositeKey, { tx, timeoutId });

      // If Telegram was never sent — resend now via curl+proxy (proven to work on HF)
      if (!row.telegram_sent) {
        console.log(`[FINANCE] Resending unsent Telegram alert for: ${compositeKey}`);
        const msg = await _buildConfirmationMessage(tx);
        try {
          const { sendTelegramOutbound } = require('../interfaces/webhook');
          await sendTelegramOutbound(msg);
          await supabase.markPendingTransactionSent(compositeKey);
        } catch (e) {
          console.warn(`[FINANCE] Recovery resend failed for ${compositeKey}:`, e.message);
        }
      }
    }
  } catch (e) {
    console.error('[FINANCE] Recovery failed:', e.message);
  }
}

/**
 * Handle a finance transaction (Deduplication & Recording)
 * Called either via Tasker Webhook (source='TASKER_LIVIN') or AI Router Intent (source='TELEGRAM_MANUAL')
 *
 * @param {object} data - { nominal, type, destination, category, description, time }
 * @param {string} source - 'TASKER_LIVIN' | 'GMAIL_POLLING' | 'TELEGRAM_MANUAL'
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

  // Composite dedup key: "NOMINAL_MERCHANT"
  const cleanMerchant = (data.destination || 'Unknown').toLowerCase().replace(/[^a-z0-9]/g, '');
  const compositeKey = `${nominal}_${cleanMerchant}`;
  console.log(`[FINANCE] Evaluating transaction: ${compositeKey} from ${source}`);

  // Deduplication — only for passive (automated) inputs, not manual Telegram entries
  if (source === 'TASKER_LIVIN' || source === 'GMAIL_POLLING') {
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
    // Jika otomatis dari Livin, paksa 'Bank Mandiri Livin'.
    // Jika manual dan kosong, ambil akun aktif pertama dari database.
    let akunName = data.account && String(data.account).trim() ? String(data.account).trim() : null;
    if (!akunName) {
      if (source === 'TASKER_LIVIN' || source === 'GMAIL_POLLING') {
        akunName = 'Bank Mandiri Livin';
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
    let paymentMethod = null;
    if (pmRaw === 'qris') paymentMethod = 'QRIS';
    else if (pmRaw === 'transfer bank') paymentMethod = 'Transfer bank';
    else if (pmRaw === 'kartu kredit') paymentMethod = 'Kartu Kredit';
    else if (pmRaw === 'tunai') paymentMethod = 'Tunai';

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
      const behaviorEngine = require('./Behavior_Engine');
      await behaviorEngine.logFinanceRecord({
        type: isIncome ? 'INCOME' : 'EXPENSE',
        nominal,
        category: data.category || 'Lainnya'
      });
    } catch (_) { /* Never let behavior logging crash the finance flow */ }

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
 * Safely parse localized currency strings into numbers (handles thousands separators).
 */
function _parseFlexibleCurrency(val) {
  if (typeof val === 'number') return val;
  const str = String(val).trim();
  if (!str || str === '-') return NaN;
  
  const dots = (str.match(/\./g) || []).length;
  const commas = (str.match(/,/g) || []).length;
  
  let cleaned = str;
  if (dots > 0 && commas === 1) {
    cleaned = str.replace(/\./g, '').replace(',', '.'); // IDR with decimal
  } else if (commas > 0 && dots === 1) {
    cleaned = str.replace(/,/g, ''); // USD with decimal
  } else if (dots > 0 && commas === 0) {
    cleaned = str.replace(/\./g, ''); // IDR thousands only
  } else if (commas > 0 && dots === 0) {
    cleaned = str.replace(/,/g, ''); // USD thousands only
  } else {
    cleaned = str.replace(/,/g, '.'); // fallback
  }
  
  cleaned = cleaned.replace(/[^0-9.-]/g, '');
  return parseFloat(cleaned);
}

/**
 * Parse relative date text to an actual Date object (WIB).
 * Supports: "kemarin", "hari ini", "tanggal 14", "14 mei", day names.
 */
function _parseRelativeDateFilter(text) {
  if (!text) return null;
  const lower = text.toLowerCase().trim();
  const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Jakarta' }));
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  if (lower.includes('hari ini') || lower.includes('today')) return today;
  if (lower.includes('kemarin') || lower.includes('yesterday')) {
    const d = new Date(today); d.setDate(d.getDate() - 1); return d;
  }
  // "tanggal 14", "tgl 14"
  const tglMatch = lower.match(/(?:tanggal|tgl)\s*(\d{1,2})/);
  if (tglMatch) {
    const d = new Date(today); d.setDate(parseInt(tglMatch[1])); return d;
  }
  // "14/5" or "14-5"
  const slashMatch = lower.match(/(\d{1,2})[\/\-](\d{1,2})/);
  if (slashMatch) {
    const d = new Date(today);
    // BUG FIX: Passing day as second argument prevents JS Date wrap-around 
    // if today's date exceeds the days in the target month (e.g. today is 31st, target is Feb)
    d.setMonth(parseInt(slashMatch[2]) - 1, parseInt(slashMatch[1]));
    return d;
  }
  // ISO Date from AI_Router (e.g., "2026-05-13T00:00:00")
  const isoMatch = lower.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) {
    return new Date(parseInt(isoMatch[1]), parseInt(isoMatch[2]) - 1, parseInt(isoMatch[3]));
  }
  // Fallback for standalone day number (e.g., "13")
  const numMatch = lower.match(/^(\d{1,2})$/);
  if (numMatch) {
    const d = new Date(today); d.setDate(parseInt(numMatch[1])); return d;
  }
  return null;
}

/**
 * Parse Indonesian date string to Date object.
 * Handles: "14 Mei 2026", "14 May 2026"
 */
function _parseIndonesianDateString(str) {
  if (!str) return null;
  const MONTHS = {
    januari:0, februari:1, maret:2, april:3, mei:4, juni:5,
    juli:6, agustus:7, september:8, oktober:9, november:10, desember:11,
    january:0, february:1, march:2, april:3, may:4, june:5,
    july:6, august:7, september:8, october:9, november:10, december:11
  };
  const m = str.toLowerCase().match(/(\d{1,2})\s+([a-z]+)\s+(\d{4})/);
  if (m) {
    const day   = parseInt(m[1]);
    const month = MONTHS[m[2]];
    const year  = parseInt(m[3]);
    if (month !== undefined && !isNaN(day) && !isNaN(year)) {
      return new Date(year, month, day);
    }
  }
  const iso = str.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return new Date(parseInt(iso[1]), parseInt(iso[2])-1, parseInt(iso[3]));
  return null;
}

/**
 * Format a single transaction as a rich card for Telegram.
 */
function _formatTxAsCard(tx) {
  const tanggal  = tx.transaction_date || '-';
  const waktu    = tx.transaction_time || '-';
  const tipe     = tx.type === 'income' ? 'Pemasukan' : 'Pengeluaran';
  const kategori = tx.categories?.name || '-';
  const akun     = tx.accounts?.name || '-';
  const catatan  = tx.description || '-';
  const nominal  = tx.amount || 0;

  const nominalFmt = `Rp${Math.abs(nominal).toLocaleString('id-ID')}`;
  const tipeIcon   = tipe === 'Pemasukan' ? '🟢' : '🔴';
  
  // Gunakan no jika ada, jika tidak fallback ke UUID pendek
  const displayId = tx.no ? `#${tx.no}` : (tx.id ? tx.id.substring(0, 8) : 'N/A');

  return `${tipeIcon} <b>ID: ${displayId}</b>\n` +
    `<b>Tanggal:</b> ${tanggal}\n` +
    `<b>Waktu:</b> ${waktu}\n` +
    `<b>Tipe:</b> ${tipe}\n` +
    `<b>Kategori:</b> ${kategori}\n` +
    `<b>Akun:</b> ${akun}\n` +
    `<b>Catatan / Detail:</b> ${catatan}\n` +
    `<b>Nominal (Rp):</b> ${nominalFmt}`;
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

/**
 * Fetch and format the Analytics Table from Supabase.
 */
async function getFinanceAnalytics(dateText = null) {
  try {
    let startDate = new Date();
    let endDate = new Date();
    let timeLabel = 'Bulan Ini';

    if (dateText) {
      const lowerDate = dateText.toLowerCase();
      if (lowerDate.includes('minggu')) {
        timeLabel = 'Minggu Ini';
        const day = startDate.getDay();
        const diff = startDate.getDate() - day + (day === 0 ? -6 : 1);
        startDate.setDate(diff);
        endDate = new Date(startDate);
        endDate.setDate(startDate.getDate() + 6);
      } else if (lowerDate.includes('tahun')) {
        timeLabel = 'Tahun Ini';
        startDate = new Date(startDate.getFullYear(), 0, 1);
        endDate = new Date(startDate.getFullYear(), 11, 31);
      } else if (lowerDate.includes('hari')) {
        timeLabel = 'Hari Ini';
      } else {
        startDate = new Date(startDate.getFullYear(), startDate.getMonth(), 1);
        endDate = new Date(startDate.getFullYear(), startDate.getMonth() + 1, 0);
      }
    } else {
      startDate = new Date(startDate.getFullYear(), startDate.getMonth(), 1);
      endDate = new Date(startDate.getFullYear(), startDate.getMonth() + 1, 0);
    }

    const analytics = await supabaseFinance.getFinanceAnalytics(startDate, endDate);
    if (!analytics || (analytics.totalIncome === 0 && analytics.totalExpense === 0)) {
      return `📭 Data analitik belum tersedia untuk ${timeLabel}.`;
    }

    const formatRp = (val) => `Rp${Math.abs(val).toLocaleString('id-ID')}`;

    let report = `📊 <b>Laporan Analitik Keuangan ${timeLabel}:</b>\n\n`;
    report += `🟢 <b>Total Pemasukan:</b> ${formatRp(analytics.totalIncome)}\n`;
    report += `🔴 <b>Total Pengeluaran:</b> ${formatRp(analytics.totalExpense)}\n`;
    report += `──────────────\n`;
    report += `🏦 <b>SALDO BERSIH ${timeLabel.toUpperCase()}:</b> <b>${formatRp(analytics.balance)}</b>\n\n`;
    report += `<i>Laporan dihitung secara real-time dari database Supabase Nexa Finance Web.</i>`;

    return report;
  } catch (err) {
    console.error('[FINANCE] Failed to fetch analytics:', err.message);
    return `⚠️ Gagal membaca tabel analitik: ${err.message}`;
  }
}

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
      accountName:  deletedTx.accounts?.name || 'Bank Mandiri Livin',
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

    // Update category if provided
    if (newCategory && newCategory !== 'Uncategorized') {
      patchData.categoryName = newCategory;
      patchData.txType = tx.type; // Penting untuk resolveCategoryId agar tidak default ke EXPENSE
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
      `<b>Catatan / Detail:</b> ${finalDescription}\n` +
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

/**
 * Resolves a pending transaction confirmation.
 * Returns a reply message to send to the user, or null if no pending transactions.
 */
async function confirmPendingTransactions(isYes, customDescription = null, customCategory = null, customAccount = null, customPaymentMethod = null) {
  if (pendingConfirmations.size === 0) return null;

  let processedCount = 0;
  let skippedCount = 0;
  let successMessages = [];

  for (const [key, pending] of pendingConfirmations.entries()) {
    clearTimeout(pending.timeoutId);
    if (isYes) {
      try {
        if (customDescription) pending.tx.description = customDescription;
        if (customCategory) pending.tx.category = customCategory;
        if (customAccount) pending.tx.account = customAccount;
        if (customPaymentMethod) pending.tx.payment_method = customPaymentMethod;
        
        // Use lightweight AI categorizer instead of full routing
        if (!customCategory) {
          const dest = pending.tx.destination && pending.tx.destination !== 'Unknown' ? pending.tx.destination : '';
          const desc = pending.tx.description && pending.tx.description !== '[Menunggu Detail User]' && pending.tx.description !== '-' ? pending.tx.description : '';
          const combinedContext = [dest, desc].filter(Boolean).join(' - ') || 'Unknown';
          
          pending.tx.category = await _autoCategorizeMerchant(
            combinedContext, pending.tx.category
          );
        }

        // Use TELEGRAM_MANUAL for non-email transactions to avoid strict email dedup
        const source = pending.tx.isLivinEmail ? 'GMAIL_POLLING' : 'TELEGRAM_MANUAL';
        const res = await processTransaction(pending.tx, source);
        if (res && res.message) successMessages.push(res.message);
        processedCount++;
        
        // BUG FIX 5: Only delete from memory if SUCCESSFUL
        pendingConfirmations.delete(key);
        try { await supabase.deletePendingTransaction(key); } catch (_) {}
      } catch (e) {
        console.error(`[FINANCE] Failed to save confirmed tx:`, e.message);
        successMessages.push(`❌ Gagal menyimpan transaksi Rp${pending.tx.nominal}: ${e.message}`);
        // Do NOT delete from pending confirmations so user can try again (e.g. with different account)
      }
    } else {
      skippedCount++;
      try {
        // Log to Supabase so it doesn't get re-polled as a new transaction
        await supabase.logTransactionKey(key, new Date(pending.tx.time || Date.now()), 'CANCELLED');
      } catch (e) {
        console.error(`[FINANCE] Failed to log cancelled tx:`, e.message);
      }
      
      pendingConfirmations.delete(key);
      try { await supabase.deletePendingTransaction(key); } catch (_) {}
    }
  }

  if (isYes) {
    if (successMessages.length > 0) return successMessages.join('\n\n');
    return `✅ <b>Berhasil dicatat!</b> ${processedCount} transaksi telah dimasukkan ke dalam database keuangan Tuan.`;
  } else {
    return `❌ <b>Dibatalkan.</b> ${skippedCount} transaksi Livin' diabaikan dan tidak dimasukkan ke dalam database.`;
  }
}

/**
 * Updates a pending transaction with new details (description/category/nominal/account/paymentMethod).
 */
async function updatePendingTransaction(newDescription = null, newCategory = null, newNominal = null, newAccount = null, newPaymentMethod = null) {
  if (pendingConfirmations.size === 0) return null;

  let msg = '';
  for (const [key, pending] of pendingConfirmations.entries()) {
    if (newDescription) pending.tx.description = newDescription;
    if (newCategory) pending.tx.category = newCategory;
    if (newNominal) {
      const parsed = _parseFlexibleCurrency(newNominal);
      if (!isNaN(parsed)) pending.tx.nominal = parsed;
    }

    // ── VALIDASI AKUN ──────────────────────────────────────────────────────────
    // Jika user menyebutkan nama akun, verifikasi dulu ke database.
    // Jika tidak ditemukan, JANGAN update pending.tx.account dan balas dengan
    // pesan konfirmasi yang menyebutkan daftar akun aktif.
    if (newAccount) {
      const accounts = await supabaseFinance.getAccountsList();
      const normalizedInput = newAccount.toLowerCase().replace(/\s+/g, '');

      // Cari akun yang paling cocok (fuzzy match sederhana berbasis includes)
      const matched = accounts.find(a => {
        const normalizedName = a.name.toLowerCase().replace(/\s+/g, '');
        return normalizedName.includes(normalizedInput) || normalizedInput.includes(normalizedName);
      });

      if (matched) {
        // Akun ditemukan — gunakan nama resmi dari database
        pending.tx.account = matched.name;
      } else {
        // Akun TIDAK ditemukan — jangan update, dan balas dengan konfirmasi
        const accountList = accounts.map(a => `• ${a.name} (${a.type})`).join('\n');
        const unknownAccountMsg =
          `⚠️ <b>Akun "${newAccount}" tidak ditemukan</b> di daftar akun aktif Tuan.\n\n` +
          `Berikut akun yang terdaftar:\n${accountList}\n\n` +
          `❓ Silakan pilih salah satu dari daftar di atas, atau abaikan agar disimpan ke akun default dalam 5 menit.`;

        // Reset timeout karena user sudah berinteraksi
        clearTimeout(pending.timeoutId);
        const newTimeoutId = setTimeout(async () => {
          if (pendingConfirmations.has(key)) await _autoSavePending(key, pending.tx);
        }, 5 * 60 * 1000);
        pending.timeoutId = newTimeoutId;

        return unknownAccountMsg;
      }
    }

    if (newPaymentMethod) pending.tx.payment_method = newPaymentMethod;

    // Reset the 5-minute timeout because user interacted
    clearTimeout(pending.timeoutId);

    // Update Supabase
    await supabase.savePendingTransaction(key, pending.tx, true);

    const newTimeoutId = setTimeout(async () => {
      if (pendingConfirmations.has(key)) await _autoSavePending(key, pending.tx);
    }, 5 * 60 * 1000);
    pending.timeoutId = newTimeoutId;

    msg = await _buildConfirmationMessage(pending.tx, 'DETAIL TRANSAKSI DIPERBARUI ✏️');
    break; // only handle the first one
  }

  return msg;
}

/**
 * Automatically poll Gmail for new Livin' transaction emails, parse them, and record them.
 * Relies on Zero-Duplication Engine to prevent duplicate entries across polls.
 */
async function pollLivinEmails() {
  if (isPollingLivin) {
    console.log('[FINANCE] Polling skipped: Another instance is already polling.');
    return 0;
  }
  isPollingLivin = true;
  try {
    console.log('[FINANCE] Polling for new Livin emails...');
    const emails = await gmailClient.getLatestEmails('from:noreply.livin@bankmandiri.co.id', 15);
    if (!emails || emails.length === 0) return 0;

    let newCount = 0;
    for (const e of emails) {
      const blob = `${e.subject || ''}\n${e.body || ''}\n${e.snippet || ''}`;
      
      // Extract Nominal (Including Admin Fees / Biaya Transfer)
      let nominal = 0;
      
      // Try to find "Total Transaksi" first
      const totalMatch = blob.match(/(?:total transaksi|total pembayaran|total)\s*rp\.?\s*([0-9][0-9\.\,]+)/i);
      if (totalMatch) {
        nominal = _parseFlexibleCurrency(totalMatch[1]);
      } else {
        // Fallback: Find nominal and add admin fee if exists
        const nominalMatch = blob.match(/(?:nominal transaksi|jumlah transfer|nominal|rp)\s*(?:transaksi|transfer)?\s*rp\.?\s*([0-9][0-9\.\,]+)/i);
        if (nominalMatch) {
          nominal = _parseFlexibleCurrency(nominalMatch[1]);
        }
        
        const adminMatch = blob.match(/(?:biaya transfer|biaya admin|biaya)\s*rp\.?\s*([0-9][0-9\.\,]+)/i);
        if (adminMatch && !isNaN(nominal)) {
          const adminFee = _parseFlexibleCurrency(adminMatch[1]);
          if (!isNaN(adminFee)) {
            nominal += adminFee;
          }
        }
      }

      if (isNaN(nominal) || nominal <= 0) continue;

      // Check for failed transactions
      const isFailed = blob.toLowerCase().includes('tidak berhasil') || blob.toLowerCase().includes('gagal');

      // Extract Merchant/Destination
      let destination = 'Livin Transaction';
      const merchantMatch = blob.match(/penerima\s+([a-z0-9\s\&\.\-]+)/i);
      if (merchantMatch?.[1]) {
        let rawDest = merchantMatch[1].split('\n')[0]; // Take only the first line
        rawDest = rawDest.replace(/&nbsp;/ig, ' ');
        rawDest = rawDest.replace(/&\w+;/g, ' '); // Strip other HTML entities
        rawDest = rawDest.replace(/\s*-?\s*ID\s+Tanggal.*$/i, ''); // Strip trailing ID Tanggal
        rawDest = rawDest.replace(/\s*-?\s*Tanggal.*$/i, ''); // Strip trailing Tanggal
        destination = rawDest.replace(/\s+/g, ' ').trim().substring(0, 80);
      }

      // Date parsing
      let dateIso = new Date().toISOString();
      const transactionTime = e.date ? new Date(e.date) : new Date();
      if (!isNaN(transactionTime.getTime())) dateIso = transactionTime.toISOString();

      const cleanMerchant = destination.toLowerCase().replace(/[^a-z0-9]/g, '');
      const compositeKey = `${nominal}_${cleanMerchant}`;

      // Check if already pending or duplicated
      if (pendingConfirmations.has(compositeKey)) continue;
      const isDuplicate = await supabase.isDuplicateTransaction(compositeKey, transactionTime);
      if (isDuplicate) continue;

      if (isFailed) {
        // Log to Supabase so we don't notify again
        await supabase.logTransactionKey(compositeKey, transactionTime, 'FAILED_TRANSFER');
        // AUDIT FIX (CRITICAL): Use sendTelegramOutbound (Cloudflare proxy) — direct axios.post to
        // api.telegram.org is BLOCKED on HF Docker. Failed-transfer alerts had NO Watchdog recovery
        // path, so they were permanently silently lost. Now routed through the proxy.
        try {
          const nominalFmt = `Rp${nominal.toLocaleString('id-ID')}`;
          const failedMsg = `⚠️ <b>TRANSFER GAGAL</b>\n\nTujuan: ${destination}\nNominal: ${nominalFmt}\n\n<i>N.E.X.A mengabaikan transaksi ini dan tidak mencatatnya ke dalam catatan keuangan Anda.</i>`;
          const { sendTelegramOutbound } = require('../interfaces/webhook');
          await sendTelegramOutbound(failedMsg);
        } catch (_sendErr) {
          console.warn('[FINANCE] Failed transfer alert could not be sent:', _sendErr.message);
        }
        continue;
      }

      newCount++;

      // Let AI make an initial guess for the category based on the destination name.
      // Uses _autoCategorizeMerchant (lightweight, dedicated AI categorizer)
      // instead of the expensive routeUserMessage (full routing engine).
      let guessedCategory = 'Lainnya';
      try {
        guessedCategory = await _autoCategorizeMerchant(destination, null);
      } catch (e) {
        console.warn('[FINANCE] Pre-categorization failed:', e.message);
      }

      const tx = {
        nominal,
        type: 'EXPENSE',
        destination,
        category: guessedCategory,
        description: '[Menunggu Detail User]',
        time: dateIso
      };

      try {
        const msg = await requestTransactionConfirmation(tx, 'TRANSAKSI LIVIN TERBARU');
        if (msg) {
          // AUDIT FIX: Use sendTelegramOutbound (Cloudflare proxy) instead of direct axios.post.
          // Direct calls to api.telegram.org are BLOCKED on HF Docker. Previously relied on
          // 90-second Watchdog retry as a workaround. Now sends immediately via proxy.
          const { sendTelegramOutbound } = require('../interfaces/webhook');
          await sendTelegramOutbound(msg);
          // Mark as sent so Watchdog doesn't redundantly resend 90s later
          await supabase.markPendingTransactionSent(compositeKey);
        }
      } catch (err) {
        console.error('[FINANCE] Confirmation send failed (Watchdog will retry in 90s):', err.message);
      }
    }

    return newCount;
  } catch (error) {
    console.error('[FINANCE] Polling failed:', error.message);
    return 0;
  } finally {
    isPollingLivin = false;
  }
}

/**
 * Build the Telegram confirmation message text for a pending transaction.
 * Extracted as a shared helper so recovery and new confirmations use the same format.
 */
async function _buildConfirmationMessage(tx, sourceLabel = 'TRANSAKSI LIVIN TERBARU') {
  const transactionTime = new Date(tx.time);
  const dateStr = transactionTime.toLocaleDateString('id-ID', { timeZone: 'Asia/Jakarta', day: 'numeric', month: 'long', year: 'numeric' });
  const timeStr = transactionTime.toLocaleTimeString('id-ID', { timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit', hour12: false }).replace(':', '.');
  // BUG FIX #5: Safely parse nominal whether it comes as number or string (e.g., from Supabase recovery)
  const nominalNum = typeof tx.nominal === 'number' ? tx.nominal : _parseFlexibleCurrency(String(tx.nominal));
  const nominalFmt = isNaN(nominalNum) ? String(tx.nominal) : `Rp${nominalNum.toLocaleString('id-ID')}`;
  const tipeStr = tx.type === 'INCOME' ? 'Pemasukan' : 'Pengeluaran';
  const isMissingDesc = tx.description === '[Menunggu Detail User]';
  const displayDesc = isMissingDesc ? `[KOSONG - Tujuan: ${tx.destination}]` : tx.description;

  let currentSaldo = '-';
  try {
    const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Jakarta' }));
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    const analytics = await supabaseFinance.getFinanceAnalytics(startOfMonth, endOfMonth);
    if (analytics) {
      const saldoNum = analytics.balance;
      currentSaldo = isNaN(saldoNum) ? '-' : `Rp${Math.abs(saldoNum).toLocaleString('id-ID')}`;
    }
  } catch (_) {}

  let proactiveQuestion = '';
  if (isMissingDesc) {
    const outContext = tx.destination === 'Unknown' ? `sebesar ${nominalFmt}` : `ke ${tx.destination}`;
    const inContext = tx.destination === 'Unknown' ? `sebesar ${nominalFmt}` : `dari ${tx.destination}`;
    proactiveQuestion = tx.type === 'INCOME'
      ? `❓ <b>Terdapat dana masuk ${inContext}.</b>\n\nKira-kira uang ini masuk dalam rangka apa, Tuan? <i>(Tanpa balasan, N.E.X.A akan menyimpannya dengan kategori otomatis dalam 5 menit).</i>`
      : `❓ <b>N.E.X.A mencatat pengeluaran ${outContext}.</b>\n\nTuan, uang ini digunakan untuk keperluan apa ya? <i>(Tanpa balasan, N.E.X.A akan menebak kategorinya dalam 5 menit).</i>`;
  } else if (!tx.account || !tx.payment_method) {
    const missingItems = [];
    if (!tx.account) missingItems.push("akun yang digunakan");
    if (!tx.payment_method) missingItems.push("metode pembayarannya (QRIS/Transfer/Tunai/Kredit)");
    
    if (sourceLabel.includes('DIPERBARUI')) {
      proactiveQuestion = `✏️ <b>Detail catatan diperbarui!</b>\n\nSatu hal lagi Tuan, mohon informasikan ${missingItems.join(" dan ")} untuk transaksi ini.`;
    } else {
      proactiveQuestion = `❓ <b>Satu hal lagi Tuan.</b>\n\nMohon informasikan ${missingItems.join(" dan ")} untuk transaksi ini. <i>(Atau abaikan jika ingin disimpan otomatis ke akun default dalam 5 menit).</i>`;
    }
  } else {
    proactiveQuestion = `💡 Transaksi ini siap dikunci. Jika ada koreksi tambahan, silakan balas pesan ini. Jika tidak, N.E.X.A akan meresmikannya dalam 5 menit.`;
  }

  const displayCategory = (tx.category && tx.category !== 'Lainnya' && tx.category !== '[Menunggu Kategori AI/User]') ? `${tx.category} [Auto-AI]` : 'Lainnya [Auto-AI]';

  return `💸 <b>${sourceLabel}</b>\n\n` +
    `<b>No:</b> [Auto]\n` +
    `<b>Tanggal:</b> ${dateStr}\n` +
    `<b>Waktu:</b> ${timeStr}\n` +
    `<b>Tipe:</b> ${tipeStr}\n` +
    `<b>Kategori:</b> ${displayCategory}\n` +
    `<b>Akun:</b> ${tx.account || 'Belum dipilih'}\n` +
    `<b>Metode:</b> ${tx.payment_method || '-'}\n` +
    `<b>Catatan / Detail:</b> ${displayDesc}\n` +
    `<b>Nominal (Rp):</b> ${nominalFmt}\n` +
    `<b>Saldo (Rp) Saat Ini:</b> ${currentSaldo}\n\n` +
    `${proactiveQuestion}`;
}

/**
 * Auto-save a pending transaction (called by timeout or recovery).
 */
async function _autoSavePending(compositeKey, tx) {
  // BUG FIX 1: Race Condition & Lock Check
  // Node.js is single threaded, so we use a dedicated Set to lock processing.
  // We CANNOT use pendingConfirmations.has() because after a server restart,
  // Watchdog recovers transactions that are not in the map!
  if (processingKeys.has(compositeKey)) {
    return; // Already handled by another concurrent process
  }
  processingKeys.add(compositeKey);
  
  try {
    pendingConfirmations.delete(compositeKey);
    try { await supabase.deletePendingTransaction(compositeKey); } catch (_) {}

    const txTime = new Date(tx.time || Date.now());
    const alreadySaved = await supabase.isDuplicateTransaction(compositeKey, txTime, false);
    if (alreadySaved) {
      console.log(`[FINANCE] _autoSavePending: ${compositeKey} already saved. Skipping.`);
      return;
    }

    const tipeStr = tx.type === 'INCOME' ? 'pemasukan' : 'pengeluaran';
    // Use lightweight AI categorizer (category may already be set from requestTransactionConfirmation)
    tx.category = await _autoCategorizeMerchant(tx.destination, tx.category);
    if (tx.description === '[Menunggu Detail User]') tx.description = `${tipeStr} ke ${tx.destination}`;
    try {
      // Use 'TELEGRAM_MANUAL' to bypass strict email duplicate checks for user-initiated saves
      const source = tx.isLivinEmail ? 'GMAIL_POLLING' : 'TELEGRAM_MANUAL';
      await processTransaction(tx, source);
    } catch (e) {
      // BUG FIX 5: Notify user of silent failures
      console.error('[FINANCE] Auto-save processTransaction failed:', e.message);
      const { sendTelegramOutbound } = require('../interfaces/webhook');
      await sendTelegramOutbound(`⚠️ <b>Gagal Menyimpan Transaksi Otomatis</b>\n\nNominal: Rp${tx.nominal}\nTujuan: ${tx.destination}\nAlasan: ${e.message}\n\n<i>Transaksi dibatalkan.</i>`);
      return;
    }
    
    // AUDIT FIX (CRITICAL): Use _parseFlexibleCurrency — the old replace(/[^0-9]/g,'') stripped
    // the decimal point, so "50000.50" became 5000050. _parseFlexibleCurrency handles all formats.
    const nominalNum = typeof tx.nominal === 'number' ? tx.nominal : _parseFlexibleCurrency(String(tx.nominal));
    const nominalFmt = isNaN(nominalNum) ? String(tx.nominal) : `Rp${nominalNum.toLocaleString('id-ID')}`;
    const timeoutMsg = `⏳ <i>Waktu habis.</i>\nTransaksi <b>${nominalFmt}</b> telah disimpan otomatis.\n\nKategori AI: <b>${tx.category}</b>\nCatatan: <b>${tx.description}</b>`;
    try {
      const { sendTelegramOutbound } = require('../interfaces/webhook');
      await sendTelegramOutbound(timeoutMsg);
    } catch (_) {}
  } catch (e) {
    console.error('[FINANCE] Auto-save failed:', e.message);
  } finally {
    processingKeys.delete(compositeKey);
  }
}

/**
 * Universally requests transaction confirmation (Email, Text, Voice, Photo).
 * Persists to Supabase FIRST, returns message for the caller to send.
 * Does NOT send to Telegram itself — the caller (webhook.js) handles delivery.
 * Waits 5 minutes before auto-saving.
 */
async function requestTransactionConfirmation(txData, sourceLabel = 'PENCATATAN KEUANGAN BARU') {
  const nominal = txData.nominal;
  const destination = txData.destination || 'Unknown';

  // AI auto-categorize IMMEDIATELY so the confirmation message shows the real category
  const aiCategory = await _autoCategorizeMerchant(destination, txData.category);

  const tx = {
    nominal,
    type: txData.type || 'EXPENSE',
    destination,
    category: aiCategory,
    description: txData.description && txData.description !== '-' ? txData.description : '[Menunggu Detail User]',
    time: txData.time || new Date().toISOString(),
    payment_method: txData.payment_method || null,
    account: txData.account || null
  };

  const cleanMerchant = tx.destination.toLowerCase().replace(/[^a-z0-9]/g, '');
  const compositeKey = `${nominal}_${cleanMerchant}`;

  // Idempotency: if this key is already pending in memory, don't re-register
  if (pendingConfirmations.has(compositeKey)) {
    console.log(`[FINANCE] Transaction ${compositeKey} is already pending. Skipping.`);
    return null;
  }

  // 1. Auto-assign akun tunggal jika belum diisi dan hanya ada 1 akun aktif
  if (!tx.account) {
    try {
      const accounts = await supabaseFinance.getAccountsList();
      if (accounts && accounts.length === 1) {
        tx.account = accounts[0].name;
        console.log(`[FINANCE] Auto-assigned sole account: ${tx.account}`);
      }
    } catch (_) {}
  }

  // 2. Persist to Supabase FIRST (telegram_sent = false)
  await supabase.savePendingTransaction(compositeKey, tx, false);

  // 3. Build message
  const msg = await _buildConfirmationMessage(tx, sourceLabel);

  // 3. Auto-save timeout
  const timeoutId = setTimeout(async () => {
    if (pendingConfirmations.has(compositeKey)) {
      await _autoSavePending(compositeKey, tx);
    }
  }, 5 * 60 * 1000);

  pendingConfirmations.set(compositeKey, { tx, timeoutId });

  // 4. Return message — caller (webhook.js) will send it via the proven webhook response method
  //    and call markPendingTransactionSent() after successful delivery.
  return msg;
}

/**
 * Public alias used by the Watchdog cron to auto-save an expired pending tx.
 */
async function autoSaveFromWatchdog(compositeKey, tx) {
  return _autoSavePending(compositeKey, tx);
}

/**
 * Expose pending confirmations context.
 * ASYNC: checks in-memory map first, falls back to Supabase if empty
 * (handles server restarts where in-memory map is wiped).
 */
async function getPendingConfirmationsContext() {
  // 1. Check in-memory map first (fast path)
  if (pendingConfirmations.size > 0) {
    let contextStr = "STATUS FINANCE TERTUNDA (MENUNGGU RESPON USER):\n";
    for (const [key, pending] of pendingConfirmations.entries()) {
      const tx = pending.tx;
      contextStr += `- Ada transaksi tertunda: ${tx.type === 'INCOME' ? 'Pemasukan' : 'Pengeluaran'} Rp${tx.nominal} ke/dari ${tx.destination}.\n`;
      if (tx.description === '[Menunggu Detail User]' || tx.category === '[Menunggu Kategori AI/User]') {
        contextStr += `  User mungkin sedang mencoba memberi tahu rincian/kategori untuk transaksi ini!\n`;
      }
    }
    return contextStr;
  }

  // 2. Fallback: check Supabase (handles server restart scenario)
  try {
    const rows = await supabase.getPendingTransactions();
    const fresh = rows.filter(r => {
      const ageMs = Date.now() - new Date(r.created_at).getTime();
      return ageMs < 5 * 60 * 1000; // only still-active ones
    });
    if (fresh.length === 0) return null;

    // Re-register recovered transactions into in-memory map so future calls are fast
    for (const row of fresh) {
      const tx = row.tx_data;
      const key = row.composite_key;
      if (!pendingConfirmations.has(key)) {
        const ageMs = Date.now() - new Date(row.created_at).getTime();
        const remaining = Math.max(1000, (5 * 60 * 1000) - ageMs); // Guard: never negative/zero
        const timeoutId = setTimeout(async () => {
          if (pendingConfirmations.has(key)) await _autoSavePending(key, tx);
        }, remaining);
        pendingConfirmations.set(key, { tx, timeoutId });
        console.log(`[FINANCE] Re-registered pending tx from Supabase (post-restart): ${key}`);
      }
    }

    let contextStr = "STATUS FINANCE TERTUNDA (MENUNGGU RESPON USER — dipulihkan dari Supabase setelah restart):\n";
    for (const row of fresh) {
      const tx = row.tx_data;
      contextStr += `- Ada transaksi tertunda: ${tx.type === 'INCOME' ? 'Pemasukan' : 'Pengeluaran'} Rp${tx.nominal} ke/dari ${tx.destination}.\n`;
    }
    return contextStr;
  } catch (e) {
    console.error('[FINANCE] getPendingConfirmationsContext Supabase fallback failed:', e.message);
    return null;
  }
}
// ═══════════════════════════════════════════════════════════════
// FINANCE INTELLIGENCE LAYER — Advanced Analytics for Telegram
// ═══════════════════════════════════════════════════════════════

/**
 * Parse dateText to {startDate, endDate, timeLabel, prevStart, prevEnd}
 * Supports: minggu ini, bulan ini, tahun ini, hari ini, kemarin, bulan lalu, minggu lalu
 */
function _parseAnalyticsPeriod(dateText = null) {
  const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Jakarta' }));
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const lower = (dateText || '').toLowerCase();

  let startDate, endDate, prevStart, prevEnd, timeLabel;

  if (lower.includes('kemarin')) {
    startDate = new Date(today); startDate.setDate(today.getDate() - 1);
    endDate = new Date(startDate);
    prevStart = new Date(startDate); prevStart.setDate(startDate.getDate() - 1);
    prevEnd = new Date(prevStart);
    timeLabel = 'Kemarin';
  } else if (lower.includes('hari ini') || lower.includes('today') || lower.includes('hari')) {
    startDate = new Date(today);
    endDate = new Date(today);
    prevStart = new Date(today); prevStart.setDate(today.getDate() - 1);
    prevEnd = new Date(prevStart);
    timeLabel = 'Hari Ini';
  } else if (lower.includes('minggu lalu')) {
    const day = today.getDay();
    const diffToThisMonday = day === 0 ? -6 : 1 - day;
    const thisMonday = new Date(today); thisMonday.setDate(today.getDate() + diffToThisMonday);
    startDate = new Date(thisMonday); startDate.setDate(thisMonday.getDate() - 7);
    endDate = new Date(thisMonday); endDate.setDate(thisMonday.getDate() - 1);
    prevStart = new Date(startDate); prevStart.setDate(startDate.getDate() - 7);
    prevEnd = new Date(endDate); prevEnd.setDate(endDate.getDate() - 7);
    timeLabel = 'Minggu Lalu';
  } else if (lower.includes('minggu')) {
    const day = today.getDay();
    const diff = today.getDate() - day + (day === 0 ? -6 : 1);
    startDate = new Date(today); startDate.setDate(diff);
    endDate = new Date(startDate); endDate.setDate(startDate.getDate() + 6);
    prevStart = new Date(startDate); prevStart.setDate(startDate.getDate() - 7);
    prevEnd = new Date(endDate); prevEnd.setDate(endDate.getDate() - 7);
    timeLabel = 'Minggu Ini';
  } else if (lower.includes('bulan lalu')) {
    startDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    endDate = new Date(now.getFullYear(), now.getMonth(), 0);
    prevStart = new Date(now.getFullYear(), now.getMonth() - 2, 1);
    prevEnd = new Date(now.getFullYear(), now.getMonth() - 1, 0);
    timeLabel = 'Bulan Lalu';
  } else if (lower.includes('tahun')) {
    startDate = new Date(now.getFullYear(), 0, 1);
    endDate = new Date(now.getFullYear(), 11, 31);
    prevStart = new Date(now.getFullYear() - 1, 0, 1);
    prevEnd = new Date(now.getFullYear() - 1, 11, 31);
    timeLabel = 'Tahun Ini';
  } else {
    // Default: bulan ini
    startDate = new Date(now.getFullYear(), now.getMonth(), 1);
    endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    prevStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    prevEnd = new Date(now.getFullYear(), now.getMonth(), 0);
    timeLabel = 'Bulan Ini';
  }

  return { startDate, endDate, prevStart, prevEnd, timeLabel };
}

// Category emoji map
const CATEGORY_EMOJI = {
  'Makanan dan minuman': '🍽️', 'Bar, kafe': '☕', 'Restoran, makanan cepat saji': '🍔',
  'Bahan makanan': '🛒', 'Transportasi': '🚗', 'Taksi': '🚕', 'Transportasi umum': '🚌',
  'Bahan bakar': '⛽', 'Parkir': '🅿️', 'Belanja': '🛍️', 'Pakaian dan alas kaki': '👗',
  'Elektronik, aksesoris': '📱', 'Kesehatan dan kecantikan': '💊', 'Apotek, obat-obatan': '💊',
  'Perawatan kesehatan, dokter': '🏥', 'Pendidikan, pengembangan diri': '📚',
  'Hiburan dan kehidupan': '🎉', 'Hobi': '🎮', 'Olahraga aktif, kebugaran': '💪',
  'TV, streaming': '📺', 'Internet': '🌐', 'Telepon, ponsel': '📞',
  'Investasi': '📈', 'Tabungan': '🏦', 'Amal, hadiah': '🎁',
  'Liburan, perjalanan, hotel': '✈️', 'Layanan': '🔧', 'Sewa': '🏠',
  'Lainnya': '🔖'
};
function _catEmoji(name) { return CATEGORY_EMOJI[name] || '💳'; }

/**
 * Breakdown pengeluaran per kategori.
 */
async function getCategoryInsight(dateText = null) {
  try {
    const { startDate, endDate, timeLabel } = _parseAnalyticsPeriod(dateText);
    const breakdown = await supabaseFinance.getCategoryBreakdown(startDate, endDate);

    if (!breakdown || breakdown.length === 0) {
      return `📭 Tidak ada data pengeluaran untuk ${timeLabel}.`;
    }

    const formatRp = v => `Rp${Math.abs(v).toLocaleString('id-ID')}`;
    let msg = `📊 <b>Breakdown Pengeluaran — ${timeLabel}</b>\n\n`;

    const top = breakdown.slice(0, 8);
    top.forEach((cat, i) => {
      const bar = '█'.repeat(Math.round(cat.percentage / 10)) + '░'.repeat(10 - Math.round(cat.percentage / 10));
      msg += `<b>${i + 1}. ${_catEmoji(cat.name)} ${cat.name}</b>\n`;
      msg += `   ${formatRp(cat.total)} · ${cat.percentage.toFixed(1)}% · ${cat.count} transaksi\n`;
      msg += `   <code>${bar}</code>\n\n`;
    });

    if (breakdown.length > 8) {
      const rest = breakdown.slice(8).reduce((s, c) => s + c.total, 0);
      msg += `🔖 <i>+${breakdown.length - 8} kategori lainnya: ${formatRp(rest)}</i>\n`;
    }

    return msg.trim();
  } catch (err) {
    return `⚠️ Gagal mengambil breakdown kategori: ${err.message}`;
  }
}

/**
 * Perbandingan periode ini vs periode sebelumnya.
 */
async function getPeriodComparisonReport(dateText = null) {
  try {
    const { startDate, endDate, prevStart, prevEnd, timeLabel } = _parseAnalyticsPeriod(dateText);
    const { current, previous } = await supabaseFinance.getPeriodComparison(startDate, endDate, prevStart, prevEnd);

    const formatRp = v => `Rp${Math.abs(v).toLocaleString('id-ID')}`;
    const delta = (curr, prev) => {
      if (prev === 0) return curr > 0 ? '(baru)' : '';
      const pct = ((curr - prev) / prev * 100);
      return pct > 0 ? `📈 +${pct.toFixed(0)}%` : `📉 ${pct.toFixed(0)}%`;
    };

    const prevLabel = timeLabel.replace('Ini', 'Lalu').replace('Kemarin', '2 Hari Lalu').replace('Hari Ini', 'Kemarin');

    let msg = `📊 <b>Perbandingan Periode</b>\n\n`;
    msg += `<b>Periode:</b> ${timeLabel} vs ${prevLabel}\n\n`;
    msg += `<b>💰 Pengeluaran</b>\n`;
    msg += `  ${timeLabel}: ${formatRp(current.totalExpense)}\n`;
    msg += `  ${prevLabel}: ${formatRp(previous.totalExpense)} ${delta(current.totalExpense, previous.totalExpense)}\n\n`;
    msg += `<b>🟢 Pemasukan</b>\n`;
    msg += `  ${timeLabel}: ${formatRp(current.totalIncome)}\n`;
    msg += `  ${prevLabel}: ${formatRp(previous.totalIncome)} ${delta(current.totalIncome, previous.totalIncome)}\n\n`;
    msg += `<b>🏦 Saldo Bersih</b>\n`;
    msg += `  ${timeLabel}: ${formatRp(current.balance)}\n`;
    msg += `  ${prevLabel}: ${formatRp(previous.balance)} ${delta(current.balance, previous.balance)}`;

    return msg;
  } catch (err) {
    return `⚠️ Gagal membuat laporan perbandingan: ${err.message}`;
  }
}

/**
 * N pengeluaran terbesar dalam periode.
 */
async function getTopExpensesReport(dateText = null, limit = 5) {
  try {
    const { startDate, endDate, timeLabel } = _parseAnalyticsPeriod(dateText);
    const rows = await supabaseFinance.getTopExpenses(startDate, endDate, limit);

    if (!rows || rows.length === 0) {
      return `📭 Tidak ada data pengeluaran untuk ${timeLabel}.`;
    }

    const formatRp = v => `Rp${Math.abs(v).toLocaleString('id-ID')}`;
    let msg = `💸 <b>Top ${rows.length} Pengeluaran — ${timeLabel}</b>\n\n`;

    rows.forEach((tx, i) => {
      const cat = tx.categories?.name || '-';
      const desc = tx.description || cat;
      msg += `<b>${i + 1}. ${_catEmoji(cat)} ${desc}</b>\n`;
      msg += `   ${formatRp(tx.amount)} · ${tx.transaction_date}\n\n`;
    });

    return msg.trim();
  } catch (err) {
    return `⚠️ Gagal mengambil top pengeluaran: ${err.message}`;
  }
}

/**
 * Saldo semua akun real-time.
 */
async function getAccountBalancesReport() {
  try {
    const balances = await supabaseFinance.getAccountBalances();

    if (!balances || balances.length === 0) {
      return `📭 Tidak ada akun keuangan yang terdaftar di Nexa Finance Web.`;
    }

    const formatRp = v => `Rp${Math.abs(v).toLocaleString('id-ID')}`;
    const typeLabel = { bank: 'Rekening', cash: 'Tunai', 'e-wallet': 'E-Wallet' };

    let msg = `🏦 <b>Saldo Per Akun (Real-time)</b>\n\n`;
    let grandTotal = 0;

    for (const acc of balances) {
      const icon = acc.type === 'bank' ? '🏦' : acc.type === 'cash' ? '💵' : '📱';
      const tLabel = typeLabel[acc.type] || acc.type;
      msg += `${icon} <b>${acc.name}</b> <i>(${tLabel})</i>\n`;
      msg += `   Saldo: <b>${formatRp(acc.balance)}</b>\n`;
      msg += `   Masuk: +${formatRp(acc.totalIncome)} · Keluar: -${formatRp(acc.totalExpense)}\n\n`;
      grandTotal += acc.balance;
    }

    msg += `──────────────\n`;
    msg += `💰 <b>Total Kekayaan Bersih: ${formatRp(grandTotal)}</b>`;
    return msg;
  } catch (err) {
    return `⚠️ Gagal mengambil saldo akun: ${err.message}`;
  }
}

/**
 * Tren pengeluaran harian dalam periode — narasi + data hari termahal.
 */
async function getDailyTrendReport(dateText = null) {
  try {
    const { startDate, endDate, timeLabel } = _parseAnalyticsPeriod(dateText);
    const trend = await supabaseFinance.getDailyTrend(startDate, endDate);

    if (!trend || trend.length === 0) {
      return `📭 Tidak ada data tren harian untuk ${timeLabel}.`;
    }

    const formatRp = v => `Rp${Math.abs(v).toLocaleString('id-ID')}`;
    const expenseDays = trend.filter(d => d.expense > 0);
    const totalExpense = expenseDays.reduce((s, d) => s + d.expense, 0);
    const avgDaily = expenseDays.length > 0 ? totalExpense / expenseDays.length : 0;
    const maxDay = expenseDays.sort((a, b) => b.expense - a.expense)[0];
    const minDay = [...expenseDays].sort((a, b) => a.expense - b.expense)[0];

    // Narasi tren: apakah meningkat, menurun, atau stabil?
    const firstHalf = trend.slice(0, Math.floor(trend.length / 2));
    const secondHalf = trend.slice(Math.floor(trend.length / 2));
    const avgFirst = firstHalf.reduce((s, d) => s + d.expense, 0) / (firstHalf.length || 1);
    const avgSecond = secondHalf.reduce((s, d) => s + d.expense, 0) / (secondHalf.length || 1);
    let trendNarasi;
    if (avgSecond > avgFirst * 1.1) trendNarasi = '📈 Meningkat di akhir periode';
    else if (avgSecond < avgFirst * 0.9) trendNarasi = '📉 Menurun di akhir periode';
    else trendNarasi = '↔️ Relatif stabil sepanjang periode';

    let msg = `📈 <b>Tren Pengeluaran Harian — ${timeLabel}</b>\n\n`;
    msg += `<b>Pola:</b> ${trendNarasi}\n`;
    msg += `<b>Rata-rata harian:</b> ${formatRp(avgDaily)}\n`;
    if (maxDay) msg += `<b>Hari termahal:</b> ${maxDay.date} (${formatRp(maxDay.expense)})\n`;
    if (minDay && minDay.date !== maxDay?.date) msg += `<b>Hari terhemat:</b> ${minDay.date} (${formatRp(minDay.expense)})\n`;
    msg += `<b>Hari ada transaksi:</b> ${expenseDays.length} hari\n\n`;

    // Mini chart ASCII tren per hari (max 14 hari terakhir)
    const chartDays = trend.slice(-14);
    if (chartDays.length > 0) {
      const maxExp = Math.max(...chartDays.map(d => d.expense), 1);
      msg += `<b>Grafik Pengeluaran:</b>\n<code>`;
      for (const d of chartDays) {
        const bars = Math.round((d.expense / maxExp) * 8);
        const bar = '█'.repeat(bars) + '░'.repeat(8 - bars);
        const label = d.date.slice(5); // MM-DD
        msg += `${label} ${bar} ${formatRp(d.expense)}\n`;
      }
      msg += `</code>`;
    }

    return msg.trim();
  } catch (err) {
    return `⚠️ Gagal mengambil tren harian: ${err.message}`;
  }
}

/**
 * Ringkasan keuangan cerdas ALL-IN-ONE dengan insight AI.
 */
async function getSmartFinanceSummary(dateText = null) {
  try {
    const { startDate, endDate, prevStart, prevEnd, timeLabel } = _parseAnalyticsPeriod(dateText);

    const [analytics, breakdown, comparison, accountBals] = await Promise.all([
      supabaseFinance.getFinanceAnalytics(startDate, endDate),
      supabaseFinance.getCategoryBreakdown(startDate, endDate),
      supabaseFinance.getPeriodComparison(startDate, endDate, prevStart, prevEnd),
      supabaseFinance.getAccountBalances()
    ]);

    const formatRp = v => `Rp${Math.abs(v).toLocaleString('id-ID')}`;

    let msg = `💡 <b>Ringkasan Keuangan Cerdas — ${timeLabel}</b>\n\n`;

    // Summary
    msg += `📊 <b>Ringkasan:</b>\n`;
    msg += `  💰 Pengeluaran: ${formatRp(analytics.totalExpense)}\n`;
    msg += `  🟢 Pemasukan:   ${formatRp(analytics.totalIncome)}\n`;
    msg += `  🏦 Saldo Bersih: <b>${formatRp(analytics.balance)}</b>\n\n`;

    // Top 3 kategori
    if (breakdown.length > 0) {
      msg += `🏆 <b>Top Kategori Pengeluaran:</b>\n`;
      breakdown.slice(0, 3).forEach((cat, i) => {
        msg += `  ${i + 1}. ${_catEmoji(cat.name)} ${cat.name}: ${formatRp(cat.total)} (${cat.percentage.toFixed(0)}%)\n`;
      });
      msg += '\n';
    }

    // Perbandingan vs periode sebelumnya
    if (comparison.previous.totalExpense > 0) {
      const pct = ((analytics.totalExpense - comparison.previous.totalExpense) / comparison.previous.totalExpense * 100);
      const icon = pct > 5 ? '📈' : pct < -5 ? '📉' : '↔️';
      msg += `${icon} <b>vs Periode Sebelumnya:</b>\n`;
      msg += `  Pengeluaran ${pct > 0 ? 'naik' : 'turun'} ${Math.abs(pct).toFixed(0)}% (dari ${formatRp(comparison.previous.totalExpense)})\n\n`;
    }

    // Saldo akun
    if (accountBals.length > 0) {
      msg += `💳 <b>Saldo Akun:</b>\n`;
      for (const acc of accountBals) {
        const icon = acc.type === 'bank' ? '🏦' : acc.type === 'cash' ? '💵' : '📱';
        msg += `  ${icon} ${acc.name}: <b>${formatRp(acc.balance)}</b>\n`;
      }
      msg += '\n';
    }

    // AI insight singkat
    try {
      const { callAI } = require('../core/AI_Router');
      const topCat = breakdown[0]?.name || 'Lainnya';
      const balDir = analytics.balance >= 0 ? 'positif' : 'negatif';
      const insightPrompt = `Kamu adalah analis keuangan pribadi yang cerdas dan hangat. Berikan insight singkat (2-3 kalimat, casual dan personal, dalam bahasa Indonesia) untuk Tuan Faqih berdasarkan data berikut:\n- Periode: ${timeLabel}\n- Total Pengeluaran: ${formatRp(analytics.totalExpense)}\n- Total Pemasukan: ${formatRp(analytics.totalIncome)}\n- Saldo Bersih: ${formatRp(analytics.balance)} (${balDir})\n- Kategori pengeluaran terbesar: ${topCat}\nBerikan: 1 apresiasi/saran singkat dan 1 tips konkret. Jangan gunakan format JSON. Langsung teks.`;
      const insight = await callAI(insightPrompt);
      if (insight) msg += `🧠 <b>Insight AI:</b>\n<i>${insight.trim()}</i>`;
    } catch (_) { /* Non-fatal */ }

    return msg.trim();
  } catch (err) {
    return `⚠️ Gagal mengambil ringkasan cerdas: ${err.message}`;
  }
}

/**
 * Ringkasan bulanan 7 bulan terakhir (sama persis dengan chart bar di Web).
 */
async function getMonthlySummaryReport() {
  try {
    const data = await supabaseFinance.getMonthlySummary(7);
    if (!data || data.length === 0) return '📭 Tidak ada data ringkasan bulanan.';

    const formatRp = v => `Rp${Math.abs(v).toLocaleString('id-ID')}`;
    const MONTHS_ID = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Ags','Sep','Okt','Nov','Des'];

    let msg = `📅 <b>Tren Keuangan 7 Bulan Terakhir</b>\n\n`;
    const maxVal = Math.max(...data.map(d => Math.max(d.total_income, d.total_expense)), 1);

    for (const row of data) {
      const [y, m] = row.month.split('-');
      const label = `${MONTHS_ID[parseInt(m) - 1]} ${y}`;
      const incBars = Math.round((row.total_income / maxVal) * 8);
      const expBars = Math.round((row.total_expense / maxVal) * 8);
      const net = row.total_income - row.total_expense;
      const netIcon = net >= 0 ? '✅' : '🔴';
      msg += `<b>${label}</b> ${netIcon}\n`;
      msg += `<code>  🟢 ${'█'.repeat(incBars)}${'░'.repeat(8 - incBars)} ${formatRp(row.total_income)}\n`;
      msg += `  🔴 ${'█'.repeat(expBars)}${'░'.repeat(8 - expBars)} ${formatRp(row.total_expense)}</code>\n\n`;
    }

    return msg.trim();
  } catch (err) {
    return `⚠️ Gagal mengambil ringkasan bulanan: ${err.message}`;
  }
}

/**
 * Saving rate (tingkat tabungan) untuk periode tertentu.
 */
async function getSavingRateReport(dateText = null) {
  try {
    const { startDate, endDate, timeLabel } = _parseAnalyticsPeriod(dateText);
    const analytics = await supabaseFinance.getFinanceAnalytics(startDate, endDate);

    const formatRp = v => `Rp${Math.abs(v).toLocaleString('id-ID')}`;

    if (analytics.totalIncome === 0 && analytics.totalExpense === 0) {
      return `📭 Tidak ada data keuangan untuk ${timeLabel}.`;
    }

    const savingsRate = analytics.totalIncome > 0
      ? ((analytics.totalIncome - analytics.totalExpense) / analytics.totalIncome * 100)
      : 0;
    const tabungan = analytics.totalIncome - analytics.totalExpense;

    let ratingIcon, ratingText;
    if (savingsRate >= 30) { ratingIcon = '🏆'; ratingText = 'Sangat Baik! Hemat sekali.'; }
    else if (savingsRate >= 20) { ratingIcon = '✅'; ratingText = 'Baik. Finansial sehat.'; }
    else if (savingsRate >= 10) { ratingIcon = '⚠️'; ratingText = 'Cukup. Bisa lebih hemat.'; }
    else if (savingsRate > 0) { ratingIcon = '🔴'; ratingText = 'Perlu perhatian. Pengeluaran hampir sama dengan pemasukan.'; }
    else { ratingIcon = '❌'; ratingText = 'Defisit! Pengeluaran melebihi pemasukan.'; }

    let msg = `💰 <b>Tingkat Tabungan — ${timeLabel}</b>\n\n`;
    msg += `<b>Pemasukan:</b>   ${formatRp(analytics.totalIncome)}\n`;
    msg += `<b>Pengeluaran:</b> ${formatRp(analytics.totalExpense)}\n`;
    msg += `<b>Sisa/Tabungan:</b> <b>${formatRp(tabungan)}</b>\n`;
    msg += `──────────────\n`;
    msg += `<b>Saving Rate: ${savingsRate.toFixed(1)}%</b>\n`;
    msg += `${ratingIcon} <i>${ratingText}</i>`;

    return msg;
  } catch (err) {
    return `⚠️ Gagal menghitung saving rate: ${err.message}`;
  }
}

/**
 * Tren saldo harian untuk akun pertama (sama persis dengan Area Chart di Web).
 */
async function getDailyBalanceTrendReport(dateText = null) {
  try {
    const { startDate, endDate, timeLabel } = _parseAnalyticsPeriod(dateText);
    const accounts = await supabaseFinance.getAccountsList();

    if (!accounts || accounts.length === 0) {
      return '📭 Tidak ada akun yang terdaftar.';
    }

    // Use getAccountBalances to get the first account with its id
    const balances = await supabaseFinance.getAccountBalances();
    if (!balances || balances.length === 0) return '📭 Tidak ada saldo akun.';

    const formatRp = v => `Rp${Math.abs(v).toLocaleString('id-ID')}`;
    let msg = `📈 <b>Tren Saldo Harian — ${balances[0].name} (${timeLabel})</b>\n\n`;

    const startStr = startDate.toISOString().split('T')[0];
    const endStr = endDate.toISOString().split('T')[0];
    const trend = await supabaseFinance.getDailyBalanceTrend(balances[0].id, startStr, endStr);

    if (!trend || trend.length === 0) return `📭 Tidak ada data tren saldo untuk ${timeLabel}.`;

    const maxVal = Math.max(...trend.map(d => Math.abs(d.running_balance)), 1);
    msg += `<code>`;
    for (const d of trend.slice(-10)) {
      const bars = Math.round((Math.abs(d.running_balance) / maxVal) * 8);
      const label = d.day.slice(5); // MM-DD
      msg += `${label} ${'█'.repeat(bars)}${'░'.repeat(8 - bars)} ${formatRp(d.running_balance)}\n`;
    }
    msg += `</code>\n`;
    msg += `<b>Saldo akhir periode:</b> ${formatRp(trend[trend.length - 1].running_balance)}`;

    return msg.trim();
  } catch (err) {
    return `⚠️ Gagal mengambil tren saldo: ${err.message}`;
  }
}

module.exports = {
  processTransaction,
  getRecentTransactions,
  searchTransactions,
  getFinanceAnalytics,
  getCategoryInsight,
  getPeriodComparisonReport,
  getTopExpensesReport,
  getAccountBalancesReport,
  getDailyTrendReport,
  getSmartFinanceSummary,
  getMonthlySummaryReport,
  getSavingRateReport,
  getDailyBalanceTrendReport,
  deleteTransaction: requestDeleteConfirmation,
  confirmDeleteTransaction,
  getPendingDeletionsContext,
  undoDeleteTransaction,
  editTransaction,
  pollLivinEmails,
  confirmPendingTransactions,
  updatePendingTransaction,
  requestTransactionConfirmation,
  recoverPendingTransactions,
  _parseFlexibleCurrency,
  _autoCategorizeMerchant,
  // Exposed for Watchdog cron (cron.js)
  buildConfirmationMessage: _buildConfirmationMessage,
  autoSaveFromWatchdog,
  getPendingConfirmationsContext
};
