const supabase = require('../infrastructure/Supabase_Memories');
const googleWorkspace = require('../infrastructure/Google_Workspace');
const gmailClient = require('../infrastructure/Gmail_Client');
// axios removed — all Telegram sends must use sendTelegramOutbound (Cloudflare proxy) not direct api.telegram.org
const env = require('../config/env');

// In-memory cache of pending confirmations (source of truth = Supabase)
// key: compositeKey, value: { tx, timeoutId }
const pendingConfirmations = new Map();

// In-memory cache for deletion confirmations
const pendingDeletions = new Map();

let isPollingLivin = false;

// AUDIT FIX: sendTelegramWithRetry REMOVED — it called api.telegram.org directly which is BLOCKED
// on HF Docker. All Telegram sends from Finance_Engine must use sendTelegramOutbound() from
// webhook.js which routes through the Cloudflare Worker proxy.

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

          const aiRouter = require('../core/AI_Router');
          const tipeStr = tx.type === 'INCOME' ? 'pemasukan' : 'pengeluaran';
          const autoQuery = `catat ${tipeStr} ${tx.nominal} ke ${tx.destination}`;
          const routingData = await aiRouter.routeUserMessage(autoQuery, { last_intent: null });
          tx.category = routingData?.extracted_data?.category || 'Lainnya';
          if (tx.description === '[Menunggu Detail User]') tx.description = `${tipeStr} ke ${tx.destination}`;
          await processTransaction(tx, 'GMAIL_POLLING');
          // processTransaction already calls logTransactionKey, but we
          // delete the pending record immediately after to signal to the
          // Watchdog that this tx is resolved and should not be re-processed.
        } catch (saveErr) {
          console.error(`[FINANCE] Recovery auto-save failed for ${compositeKey}:`, saveErr.message);
        }
        await supabase.deletePendingTransaction(compositeKey);
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
    // Format date in Indonesian locale for the sheet (e.g. "9 Februari 2026")
    const dateStr = transactionTime.toLocaleDateString('id-ID', {
      timeZone: 'Asia/Jakarta',
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    });

    // Format time as HH.MM (e.g. "14.45") to match existing sheet style
    const timeStr = transactionTime.toLocaleTimeString('id-ID', {
      timeZone: 'Asia/Jakarta',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    }).replace(':', '.');

    // Normalize type to Indonesian label used by sheet formulas
    const isIncome = (data.type || '').toUpperCase() === 'INCOME' || data.type === 'Pemasukan';
    const tipeLabel = isIncome ? 'Pemasukan' : 'Pengeluaran';

    // Nominal: positive for Pemasukan, NEGATIVE for Pengeluaran (drives Saldo formula in sheet)
    const nominalSigned = isIncome ? nominal : -nominal;

    // Build the txData object matching appendFinanceRow's expected shape
    const txData = {
      tanggal: dateStr,                                        // B: "9 Februari 2026"
      waktu: timeStr,                                          // C: "14.45"
      tipe: tipeLabel,                                         // D: "Pemasukan" | "Pengeluaran"
      kategori: data.category || 'Lainnya',                    // E: Kategori
      akun: 'Bank Mandiri Livin',                              // F: Akun (fixed for this sheet)
      catatan: data.description || data.destination || '-',    // G: Catatan / Detail
      nominal: nominalSigned                                    // H: Signed nominal
    };

    const result = await googleWorkspace.appendFinanceRow(txData);

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

    console.log(`[FINANCE] Transaction saved → Sheet "${result.sheetName}", Row ${result.rowNumber}, No ${result.noValue}`);

    const nominalFormatted = `Rp${nominal.toLocaleString('id-ID')}`;
    return {
      status: 'SUCCESS',
      message: `✅ Transaksi <b>${tipeLabel}</b> sebesar <b>${nominalFormatted}</b> (${txData.catatan}) berhasil dicatat di baris No. ${result.noValue} — Sheet <i>${result.sheetName}</i>.`
    };
  } catch (error) {
    console.error('[FINANCE] Failed to record transaction:', error.message);
    if (error.message && error.message.includes('Office file')) {
      throw new Error('File buku kas Tuan berformat Excel (.xlsx). N.E.X.A hanya bisa membaca format Google Sheets asli. Silakan buka file tersebut di Google Drive, klik "File > Save as Google Sheets", lalu masukkan ID file yang baru ke konfigurasi sistem Tuan.');
    }
    if (error.message && error.message.includes('Unable to parse range')) {
      throw new Error(`⚠️ <b>Tab Bulan Ini Belum Dibuat!</b>\nN.E.X.A mencoba mencari tab (sheet) dengan nama bulan ini (misal: "Mei 2026"), tetapi tidak menemukannya.\n\n<b>Solusi:</b>\nBuka file Google Sheets Anda, lalu duplikat tab "Februari 2026" (atau tab sebelumnya) dan ubah nama tab hasil duplikatnya menjadi nama bulan ini (contoh: "Mei 2026").`);
    }
    throw error;
  }
}

/**
 * Fetch recent transactions from the current month's sheet (columns A-J).
 * @param {number} limit - how many recent rows to show
 */
async function getRecentTransactions(limit = 5) {
  try {
    const rows = await googleWorkspace.getFinanceSummary(limit);
    if (!rows || rows.length === 0) return '📭 Tidak ada transaksi yang tercatat di sheet bulan ini.';

    let response = `💸 <b>${rows.length} Transaksi Terakhir (Sheet Bulan Ini):</b>\n\n`;
    // BUG FIX #6: Use _formatRowAsCard for consistent formatting with searchTransactions
    const cards = rows.map(row => _formatRowAsCard(row)).join('\n──────────────\n');
    response += cards + '\n──────────────';
    return response;
  } catch (err) {
    console.error('[FINANCE] Failed to fetch recent transactions:', err.message);
    if (err.message && err.message.includes('Office file')) {
      return `⚠️ <b>Gagal mengambil data:</b> Format dokumen tidak didukung.\n\nTuan, file buku kas saat ini berformat Microsoft Excel (.xlsx). N.E.X.A hanya bisa membaca format Google Sheets asli.\n\n<b>Cara Perbaikan:</b>\n1. Buka file tersebut di Google Drive\n2. Klik "File" > "Save as Google Sheets"\n3. Copy ID dari file baru tersebut dan perbarui di setelan (GOOGLE_SHEET_ID).`;
    }
    if (err.message && err.message.includes('Unable to parse range')) {
      return `⚠️ <b>Tab Bulan Ini Belum Dibuat!</b>\nN.E.X.A tidak dapat menemukan tab (sheet) dengan nama bulan ini di Google Sheets Tuan. Silakan buat atau duplikat tab sebelumnya, dan beri nama sesuai bulan ini (contoh: "Mei 2026").`;
    }
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
 * Format a single row as a rich card for Telegram.
 * Columns: A(No) B(Tanggal) C(Waktu) D(Tipe) E(Kategori) F(Akun) G(Catatan) H(Nominal) I(Saldo)
 */
function _formatRowAsCard(row) {
  const no       = row[0] || '-';
  const tanggal  = row[1] || '-';
  const waktu    = row[2] || '-';
  const tipe     = row[3] || '-';
  const kategori = row[4] || '-';
  const akun     = row[5] || 'Bank Mandiri Livin';
  const catatan  = row[6] || '-';
  const nominal  = row[7] || '0';
  const saldo    = row[8] || '-';

  const nominalNum = _parseFlexibleCurrency(nominal);
  const nominalFmt = isNaN(nominalNum) ? nominal : `Rp${Math.abs(nominalNum).toLocaleString('id-ID')}`;
  const saldoNum   = _parseFlexibleCurrency(saldo);
  const saldoFmt   = isNaN(saldoNum) ? saldo : `Rp${saldoNum.toLocaleString('id-ID')}`;
  const tipeIcon   = tipe === 'Pemasukan' ? '🟢' : '🔴';

  return `${tipeIcon} <b>No. ${no}</b>\n` +
    `<b>Tanggal:</b> ${tanggal}\n` +
    `<b>Waktu:</b> ${waktu}\n` +
    `<b>Tipe:</b> ${tipe}\n` +
    `<b>Kategori:</b> ${kategori}\n` +
    `<b>Akun:</b> ${akun}\n` +
    `<b>Catatan / Detail:</b> ${catatan}\n` +
    `<b>Nominal (Rp):</b> ${nominalFmt}\n` +
    `<b>Saldo yang Anda punya:</b> ${saldoFmt}`;
}

/**
 * Search and display transactions with precise multi-attribute filtering.
 * @param {Object} filters
 * @param {string} [filters.date_text]  - "kemarin", "hari ini", "tanggal 14", etc.
 * @param {string} [filters.keyword]    - description / merchant keyword (e.g. "jardine")
 * @param {string} [filters.type]       - "Pemasukan" or "Pengeluaran"
 * @param {string} [filters.category]   - category keyword
 * @param {number} [filters.limit]      - max results (default 20)
 */
async function searchTransactions(filters = {}) {
  try {
    const rows = await googleWorkspace.getAllFinanceRows();
    if (!rows || rows.length === 0) return '📭 Tidak ada transaksi yang tercatat di sheet bulan ini.';

    const targetDate = filters.date_text ? _parseRelativeDateFilter(filters.date_text) : null;
    const kwLower    = filters.keyword   ? filters.keyword.toLowerCase().trim()  : null;
    const typeLower  = filters.type      ? filters.type.toLowerCase().trim()     : null;
    const catLower   = filters.category  ? filters.category.toLowerCase().trim() : null;
    const limit      = filters.limit || 20;

    const matched = [];
    // Scan from newest to oldest
    for (let i = rows.length - 1; i >= 0; i--) {
      if (matched.length >= limit) break;
      const row = rows[i];
      if (!row || row.length < 7) continue;

      // Date filter
      if (targetDate) {
        const cellDate = _parseIndonesianDateString(String(row[1] || ''));
        if (!cellDate) continue;
        if (cellDate.getFullYear() !== targetDate.getFullYear() ||
            cellDate.getMonth()    !== targetDate.getMonth()    ||
            cellDate.getDate()     !== targetDate.getDate()) continue;
      }

      // Type filter  
      if (typeLower) {
        const cellType = (row[3] || '').toLowerCase();
        const wantIncome  = typeLower.includes('masuk') || typeLower === 'pemasukan' || typeLower === 'income';
        const wantExpense = typeLower.includes('keluar') || typeLower === 'pengeluaran' || typeLower === 'expense';
        if (wantIncome  && cellType !== 'pemasukan') continue;
        if (wantExpense && cellType !== 'pengeluaran') continue;
      }

      // Category filter
      if (catLower) {
        const cellCat = (row[4] || '').toLowerCase();
        if (!cellCat.includes(catLower)) continue;
      }

      // Keyword filter: search description (col 6) and category (col 4)
      if (kwLower) {
        const cellDesc = (row[6] || '').toLowerCase();
        const cellCat2 = (row[4] || '').toLowerCase();
        const kwTokens = kwLower.split(/\s+/).filter(t => t.length > 2);
        const match = kwTokens.some(t => cellDesc.includes(t) || cellCat2.includes(t))
                      || cellDesc.includes(kwLower);
        if (!match) continue;
      }

      matched.push(row);
    }

    // Reverse to chronological order for display
    matched.reverse();

    if (matched.length === 0) {
      let desc = 'transaksi';
      if (filters.date_text) desc += ` pada ${filters.date_text}`;
      if (filters.keyword)   desc += ` dengan kata kunci "${filters.keyword}"`;
      if (filters.type)      desc += ` (${filters.type})`;
      return `📭 Tidak ada ${desc} yang ditemukan di sheet bulan ini.`;
    }

    // Build header — BUG FIX #4: format date_text humanely (avoid raw ISO string in output)
    const _formatDateLabel = (dt) => {
      if (!dt) return null;
      const isoMatch = dt.match(/^(\d{4})-(\d{2})-(\d{2})/);
      if (isoMatch) {
        const d = new Date(parseInt(isoMatch[1]), parseInt(isoMatch[2]) - 1, parseInt(isoMatch[3]));
        return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
      }
      return dt; // Return as-is for natural language ("kemarin", "hari ini", etc.)
    };
    let header = `🔍 <b>Ditemukan ${matched.length} transaksi`;
    if (filters.date_text) header += ` pada ${_formatDateLabel(filters.date_text)}`;
    if (filters.type)      header += ` (${filters.type})`;
    if (filters.keyword)   header += ` — "${filters.keyword}"`;
    header += `:</b>\n\n`;

    const cards = matched.map(row => _formatRowAsCard(row)).join('\n──────────────\n');
    return header + cards;
  } catch (err) {
    console.error('[FINANCE] searchTransactions failed:', err.message);
    return `⚠️ Gagal mencari data transaksi: ${err.message}`;
  }
}

/**
 * Fetch and format the Analytics Table (L5:S9) from the current month's sheet.
 */
async function getFinanceAnalytics() {
  try {
    const rows = await googleWorkspace.getFinanceAnalytics();
    if (!rows || rows.length === 0) return '📭 Data analitik belum tersedia di sheet bulan ini.';

    // The range is L5:S9. 
    // Row indices: L5 is 0, L6 is 1, L7 is 2, L8 is 3.
    // Col indices: L is 0 ... S is 7.
    // Based on user spec: S6 = Pemasukan, S7 = Pengeluaran, S8 = Saldo
    
    // Safely extract values, fallback to 0 if undefined
    const rawPemasukan = rows[1] && rows[1][7] ? rows[1][7] : 0;
    const rawPengeluaran = rows[2] && rows[2][7] ? rows[2][7] : 0;
    const rawSaldo = rows[3] && rows[3][7] ? rows[3][7] : 0;

    // Helper to format currency
    const formatRp = (val) => {
      const num = _parseFlexibleCurrency(val);
      return isNaN(num) ? val : `Rp${Math.abs(num).toLocaleString('id-ID')}`;
    };

    const pemasukanFmt = formatRp(rawPemasukan);
    const pengeluaranFmt = formatRp(rawPengeluaran);
    const saldoFmt = formatRp(rawSaldo);

    let report = `📊 <b>Laporan Analitik Keuangan Bulan Ini:</b>\n\n`;
    report += `🟢 <b>Total Pemasukan:</b> ${pemasukanFmt}\n`;
    report += `🔴 <b>Total Pengeluaran:</b> ${pengeluaranFmt}\n`;
    report += `──────────────\n`;
    report += `🏦 <b>SALDO AKHIR:</b> <b>${saldoFmt}</b>\n\n`;
    report += `<i>Laporan dihitung secara real-time dari rumusan Google Sheets Tuan Faqih.</i>`;

    return report;
  } catch (err) {
    console.error('[FINANCE] Failed to fetch analytics:', err.message);
    if (err.message && err.message.includes('Office file')) {
      return `⚠️ <b>Gagal membaca analitik:</b> File buku kas Tuan berformat Excel (.xlsx). Silakan ubah ke format Google Sheets (File > Save as Google Sheets) dan perbarui ID filenya.`;
    }
    if (err.message && err.message.includes('Unable to parse range')) {
      return `⚠️ <b>Tab Bulan Ini Belum Dibuat!</b>\nN.E.X.A tidak dapat menemukan tab bulan ini untuk membaca analitik. Silakan buat/duplikat tab di Google Sheets Anda dengan nama bulan ini (contoh: "Mei 2026").`;
    }
    return `⚠️ Gagal membaca tabel analitik: ${err.message}`;
  }
}

// In-memory undo cache: { deletedRow, deletedIndex, expireTimerId }
let lastDeletedTransaction = null;

/**
 * Finds the best matching transaction row based on robust multi-attribute token scoring.
 */
function _findBestTransactionMatch(rows, keyword) {
  const kw = String(keyword).toLowerCase().trim();
  
  if (kw === '' || /^(barusan|tadi|terakhir|terbaru|sebelumnya)$/.test(kw) || /transaksi (barusan|tadi|terakhir|terbaru)/.test(kw)) {
    return rows.length - 1;
  }
  
  if (/^\d+$/.test(kw)) {
    const idx = rows.findIndex(r => String(r[0]).trim() === kw);
    if (idx !== -1) return idx;
  }

  const tokens = kw.split(/\s+/).filter(t => t.length > 2 || /^\d+$/.test(t));
  if (tokens.length === 0) tokens.push(kw);

  let bestIndex = -1;
  let maxScore = 0;

  for (let i = rows.length - 1; i >= 0; i--) {
    const r = rows[i];
    if (!r || r.length < 8) continue;
    
    const tanggal = (r[1] || '').toLowerCase();
    const waktu = (r[2] || '').toLowerCase();
    const kategori = (r[4] || '').toLowerCase();
    const desc = (r[6] || '').toLowerCase();
    const nominalRaw = String(r[7] || '').replace(/[^0-9]/g, '');
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

    if (score > maxScore && score > 0) {
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
 * Initiates a deletion request. Finds the transaction and stores it in pendingDeletions.
 */
async function requestDeleteConfirmation(keyword) {
  try {
    const rows = await googleWorkspace.getAllFinanceRows();
    if (!rows || rows.length === 0) return { status: 'FAILED', message: 'Tabel bulan ini masih kosong.' };

    const indexToDelete = _findBestTransactionMatch(rows, keyword);

    if (indexToDelete === -1) {
      return { status: 'FAILED', message: `Tidak ada transaksi yang cocok dengan "${keyword}".` };
    }

    const row = rows[indexToDelete];
    const no = row[0] || '-';
    const tanggal = row[1] || '-';
    const waktu = row[2] || '-';
    const tipe = row[3] || '-';
    const kategori = row[4] || '-';
    const catatan = row[6] || '-';
    const nominalRaw = _parseFlexibleCurrency(row[7]);
    const nominalFmt = isNaN(nominalRaw) ? row[7] : `Rp${Math.abs(nominalRaw).toLocaleString('id-ID')}`;

    // Store in pending deletions with a 3-minute timeout
    const delKey = `del_${Date.now()}`;
    const timeoutId = setTimeout(() => {
      pendingDeletions.delete(delKey);
    }, 3 * 60 * 1000);
    
    pendingDeletions.set(delKey, { index: indexToDelete, rowData: row, timeoutId });

    const msg = `⚠️ <b>KONFIRMASI PENGHAPUSAN TRANSAKSI</b>\n\n` +
      `N.E.X.A menemukan data berikut:\n` +
      `<b>No:</b> ${no}\n` +
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
 * Confirms or cancels a pending deletion.
 */
async function confirmDeleteTransaction(isYes) {
  if (pendingDeletions.size === 0) return null;

  for (const [key, pending] of pendingDeletions.entries()) {
    clearTimeout(pending.timeoutId);
    pendingDeletions.delete(key);

    if (isYes) {
      try {
        const rows = await googleWorkspace.getAllFinanceRows();
        // Recalculate index just in case rows shifted, match by No (col 0)
        const noToDel = pending.rowData[0];
        const actualIndex = rows.findIndex(r => r[0] === noToDel);
        
        if (actualIndex === -1) {
          return `❌ Transaksi tidak ditemukan di sheet. Mungkin sudah terhapus.`;
        }

        const deletedRow = rows.splice(actualIndex, 1)[0];
        await googleWorkspace.overwriteFinanceSheet(rows);

        // Store for undo (10-minute window)
        if (lastDeletedTransaction?.expireTimerId) clearTimeout(lastDeletedTransaction.expireTimerId);
        const expireTimerId = setTimeout(() => {
          lastDeletedTransaction = null;
        }, 10 * 60 * 1000);
        lastDeletedTransaction = { deletedRow, deletedIndex: actualIndex, expireTimerId };

        const nominalRaw = _parseFlexibleCurrency(deletedRow[7]);
        const nominalFmt = isNaN(nominalRaw) ? deletedRow[7] : `Rp${Math.abs(nominalRaw).toLocaleString('id-ID')}`;

        return `🗑️ <b>TRANSAKSI DIHAPUS</b>\n\n"${deletedRow[6] || '-'}" sebesar ${nominalFmt} telah dihapus dari sheet keuangan.\n\n💡 <i>Anda bisa membatalkan penghapusan ini dalam 10 menit ke depan dengan berkata "batalkan hapus" atau "undo".</i>`;
      } catch (error) {
        return `❌ Gagal menghapus transaksi dari sheet: ${error.message}`;
      }
    } else {
      return `✅ Penghapusan dibatalkan. Data tetap aman.`;
    }
  }
}

/**
 * Undo the last deleted transaction (within 10-minute window).
 * Re-inserts the row at its original position and rewrites the sheet.
 */
async function undoDeleteTransaction() {
  if (!lastDeletedTransaction) {
    return { status: 'FAILED', message: '⚠️ Tidak ada transaksi yang bisa di-undo. Mungkin sudah lebih dari 10 menit atau belum ada penghapusan.' };
  }

  try {
    const { deletedRow, deletedIndex, expireTimerId } = lastDeletedTransaction;
    clearTimeout(expireTimerId);

    const rows = await googleWorkspace.getAllFinanceRows();
    
    // Re-insert at original position (or end if sheet shrunk)
    const insertAt = Math.min(deletedIndex, rows.length);
    rows.splice(insertAt, 0, deletedRow);

    await googleWorkspace.overwriteFinanceSheet(rows);

    const catatan = deletedRow[6] || '-';
    const nominalRaw = _parseFlexibleCurrency(deletedRow[7]);
    const nominalFmt = isNaN(nominalRaw) ? deletedRow[7] : `Rp${Math.abs(nominalRaw).toLocaleString('id-ID')}`;

    lastDeletedTransaction = null; // Clear undo cache

    return { status: 'SUCCESS', message: `↩️ <b>Transaksi dikembalikan!</b>\n\n"${catatan}" sebesar <b>${nominalFmt}</b> telah dipulihkan ke sheet keuangan Tuan. Semua nomor urut telah disesuaikan kembali.` };
  } catch (error) {
    console.error('[FINANCE] Failed to undo delete:', error.message);
    return { status: 'FAILED', message: `Gagal mengembalikan transaksi: ${error.message}` };
  }
}


/**
 * Edit a specific transaction matching a keyword.
 * Same search priority as deleteTransaction: No column → exact desc → partial match.
 */
async function editTransaction(keyword, newNominal, newDescription, newCategory) {
  try {
    const rows = await googleWorkspace.getAllFinanceRows();
    if (!rows || rows.length === 0) return { status: 'FAILED', message: 'Tabel bulan ini masih kosong.' };

    const indexToEdit = _findBestTransactionMatch(rows, keyword);

    if (indexToEdit === -1) {
      return { status: 'FAILED', message: `Tidak ada transaksi yang cocok dengan "${keyword}".` };
    }

    const oldRow = rows[indexToEdit];
    // BUG FIX #3: Corrected variable naming — row[6] is Catatan (notes), row[4] is Kategori
    const oldCatatan = oldRow[6] || '-';
    const oldKategori = oldRow[4] || '-';
    
    // Update nominal if provided
    if (newNominal !== undefined && newNominal !== null && String(newNominal).trim() !== '') {
      // AUDIT FIX (CRITICAL): Use _parseFlexibleCurrency so IDR formats like "50.000" or
      // "1.500.000" are parsed correctly instead of being truncated by bare parseFloat.
      const nominal = _parseFlexibleCurrency(String(newNominal));
      if (isNaN(nominal) || nominal <= 0) {
        return { status: 'FAILED', message: `Nominal baru tidak valid: "${newNominal}". Harus berupa angka positif.` };
      }
      const isIncome = (oldRow[3] || '') === 'Pemasukan';
      oldRow[7] = isIncome ? nominal : -nominal;
    }
    
    // Update description if provided
    if (newDescription) {
      oldRow[6] = newDescription;
    }

    // Update category if provided
    if (newCategory && newCategory !== 'Uncategorized') {
      oldRow[4] = newCategory;
    }
    
    // Overwrite the sheet
    await googleWorkspace.overwriteFinanceSheet(rows);

    return { status: 'SUCCESS', message: `✏️ <b>Transaksi berhasil diubah!</b>\nCatatan: "${oldCatatan}" | Kategori: "${oldKategori}"\n\nSemua rumus dan data telah disesuaikan ulang.` };
  } catch (error) {
    console.error('[FINANCE] Failed to edit transaction:', error.message);
    return { status: 'FAILED', message: `Gagal mengubah transaksi: ${error.message}` };
  }
}

/**
 * Resolves a pending transaction confirmation.
 * Returns a reply message to send to the user, or null if no pending transactions.
 */
async function confirmPendingTransactions(isYes, customDescription = null, customCategory = null) {
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
        
        // BUG FIX #7: Use correct type (INCOME/EXPENSE) when inferring category
        if (!customCategory && pending.tx.description !== '[Menunggu Detail User]') {
          const aiRouter = require('../core/AI_Router');
          const tipeStr = pending.tx.type === 'INCOME' ? 'pemasukan' : 'pengeluaran';
          const autoQuery = `catat ${tipeStr} ${pending.tx.nominal} untuk ${pending.tx.description} dari/ke ${pending.tx.destination}`;
          const routingData = await aiRouter.routeUserMessage(autoQuery, { last_intent: null });
          pending.tx.category = routingData?.extracted_data?.category || 'Lainnya';
        }

        const res = await processTransaction(pending.tx, 'GMAIL_POLLING');
        if (res && res.message) successMessages.push(res.message);
        processedCount++;
      } catch (e) {
        console.error(`[FINANCE] Failed to save confirmed tx:`, e.message);
      }
    } else {
      skippedCount++;
      try {
        // Log to Supabase so it doesn't get re-polled as a new transaction
        await supabase.logTransactionKey(key, new Date(pending.tx.time || Date.now()), 'CANCELLED');
      } catch (e) {
        console.error(`[FINANCE] Failed to log cancelled tx:`, e.message);
      }
    }
    pendingConfirmations.delete(key);
    // Clean up Supabase persistent store
    try { await supabase.deletePendingTransaction(key); } catch (_) {}
  }

  if (isYes) {
    if (successMessages.length > 0) return successMessages.join('\n\n');
    return `✅ <b>Berhasil dicatat!</b> ${processedCount} transaksi telah dimasukkan ke dalam sheet keuangan Tuan.`;
  } else {
    return `❌ <b>Dibatalkan.</b> ${skippedCount} transaksi Livin' diabaikan dan tidak dimasukkan ke dalam sheet.`;
  }
}

/**
 * Updates a pending transaction with new details/category/nominal and re-sends a confirmation prompt.
 * Smart auto-detection: pass raw user text and it will figure out what to update.
 * Does NOT save to Google Sheets yet.
 */
async function updatePendingTransaction(rawUserText = null, customCategory = null, customNominal = null) {
  if (pendingConfirmations.size === 0) return null;

  let msg = '';
  for (const [key, pending] of pendingConfirmations.entries()) {
    if (rawUserText) {
      const lower = rawUserText.toLowerCase().trim();

      // 1. Detect explicit category keyword ("kategorinya amal", "kategori: makanan")
      const catMatch = lower.match(/kategori(?:nya)?[:\s]+(.+)/);
      if (catMatch) {
        pending.tx.category = catMatch[1].trim();
      } else {
        // 2. Everything else → treat as description/purpose text
        pending.tx.description = rawUserText.trim();
        // Attempt AI-based category inference from the description + destination
        try {
          const aiRouter = require('../core/AI_Router');
          const inferQuery = `catat pengeluaran ke ${pending.tx.destination} untuk ${rawUserText}`;
          const r = await aiRouter.routeUserMessage(inferQuery, { last_intent: null });
          if (r && r.extracted_data && r.extracted_data.category && r.extracted_data.category !== 'Lainnya') {
            pending.tx.category = r.extracted_data.category;
          }
        } catch (_) {}
      }
    }

    // Apply explicit overrides if provided directly
    if (customCategory) pending.tx.category = customCategory;
    if (customNominal) {
      const parsed = _parseFlexibleCurrency(customNominal);
      if (!isNaN(parsed)) pending.tx.nominal = parsed;
    }

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
      
      // BUG FIX #2: Extract Nominal using _parseFlexibleCurrency for robustness
      const nominalMatch = blob.match(/(?:nominal transaksi|jumlah transfer|nominal|rp)\s*(?:transaksi|transfer)?\s*rp?\s*([0-9][0-9\.\,]+)/i);
      if (!nominalMatch) continue;
      const nominal = _parseFlexibleCurrency(nominalMatch[1]);
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
          const failedMsg = `⚠️ <b>TRANSFER GAGAL</b>\n\nTujuan: ${destination}\nNominal: ${nominalFmt}\n\n<i>N.E.X.A mengabaikan transaksi ini dan tidak mencatatnya ke dalam buku kas Anda.</i>`;
          const { sendTelegramOutbound } = require('../interfaces/webhook');
          await sendTelegramOutbound(failedMsg);
          try { await supabase.saveChatMemory('assistant', failedMsg); } catch (_e) {}
        } catch (_sendErr) {
          console.warn('[FINANCE] Failed transfer alert could not be sent:', _sendErr.message);
        }
        continue;
      }

      newCount++;

      // Let AI make an initial guess for the category based on the destination name
      let guessedCategory = '[Menunggu Kategori AI/User]';
      try {
        const aiRouter = require('../core/AI_Router');
        const autoQuery = `catat pengeluaran ${nominal} ke ${destination}`;
        const routingData = await aiRouter.routeUserMessage(autoQuery, { last_intent: null });
        if (routingData?.extracted_data?.category && routingData.extracted_data.category !== 'Uncategorized') {
          guessedCategory = routingData.extracted_data.category;
        }
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
          try { await supabase.saveChatMemory('assistant', msg); } catch (_e) {}
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
    const recentRows = await googleWorkspace.getFinanceSummary(1);
    if (recentRows && recentRows.length > 0) {
      const recent = recentRows[0];
      const lastCat = recent[6] || '-';
      const rawSaldo = recent[8] || 0;
      const saldoNum = _parseFlexibleCurrency(rawSaldo);
      currentSaldo = isNaN(saldoNum) ? rawSaldo : `Rp${saldoNum.toLocaleString('id-ID')}`;
    }
  } catch (_) {}

  let proactiveQuestion = '';
  if (isMissingDesc) {
    proactiveQuestion = tx.type === 'INCOME'
      ? `❓ <b>Terdapat dana masuk dari ${tx.destination}.</b>\n\nKira-kira uang ini masuk dalam rangka apa, Tuan? <i>(Tanpa balasan, N.E.X.A akan menyimpannya dengan kategori otomatis dalam 5 menit).</i>`
      : `❓ <b>N.E.X.A mencatat pengeluaran ke ${tx.destination}.</b>\n\nTuan, uang ini digunakan untuk keperluan apa ya? <i>(Tanpa balasan, N.E.X.A akan menebak kategorinya dalam 5 menit).</i>`;
  } else {
    proactiveQuestion = `💡 Transaksi ini siap dikunci. Jika ada koreksi tambahan, silakan balas pesan ini. Jika tidak, N.E.X.A akan meresmikannya dalam 5 menit.`;
  }

  const displayCategory = tx.category === '[Menunggu Kategori AI/User]' ? '[Auto-AI]' : `${tx.category} [Auto-AI]`;

  return `💸 <b>${sourceLabel}</b>\n\n` +
    `<b>No:</b> [Auto]\n` +
    `<b>Tanggal:</b> ${dateStr}\n` +
    `<b>Waktu:</b> ${timeStr}\n` +
    `<b>Tipe:</b> ${tipeStr}\n` +
    `<b>Kategori:</b> ${displayCategory}\n` +
    `<b>Akun:</b> Bank Mandiri Livin\n` +
    `<b>Catatan / Detail:</b> ${displayDesc}\n` +
    `<b>Nominal (Rp):</b> ${nominalFmt}\n` +
    `<b>Saldo (Rp) Saat Ini:</b> ${currentSaldo}\n\n` +
    `${proactiveQuestion}`;
}

/**
 * Auto-save a pending transaction (called by timeout or recovery).
 */
async function _autoSavePending(compositeKey, tx) {
  try {
    // DEDUP GUARD: Check before saving to prevent double-save race
    // between setTimeout (5-min auto-save) and Watchdog cron (90s interval).
    // We pass false for checkPending because this transaction is pending itself.
    const txTime = new Date(tx.time || Date.now());
    const alreadySaved = await supabase.isDuplicateTransaction(compositeKey, txTime, false);
    if (alreadySaved) {
      console.log(`[FINANCE] _autoSavePending: ${compositeKey} already saved. Skipping.`);
      pendingConfirmations.delete(compositeKey);
      try { await supabase.deletePendingTransaction(compositeKey); } catch (_) {}
      return;
    }

    const tipeStr = tx.type === 'INCOME' ? 'pemasukan' : 'pengeluaran';
    const aiRouter = require('../core/AI_Router');
    const autoQuery = `catat ${tipeStr} ${tx.nominal} ke ${tx.destination}`;
    const routingData = await aiRouter.routeUserMessage(autoQuery, { last_intent: null });
    tx.category = routingData?.extracted_data?.category || 'Lainnya';
    if (tx.description === '[Menunggu Detail User]') tx.description = `${tipeStr} ke ${tx.destination}`;
    await processTransaction(tx, 'GMAIL_POLLING');
    pendingConfirmations.delete(compositeKey);
    await supabase.deletePendingTransaction(compositeKey);
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

  const tx = {
    nominal,
    type: txData.type || 'EXPENSE',
    destination,
    category: txData.category && txData.category !== 'Uncategorized' ? txData.category : '[Menunggu Kategori AI/User]',
    description: txData.description && txData.description !== '-' ? txData.description : '[Menunggu Detail User]',
    time: txData.time || new Date().toISOString()
  };

  const cleanMerchant = tx.destination.toLowerCase().replace(/[^a-z0-9]/g, '');
  const compositeKey = `${nominal}_${cleanMerchant}`;

  // Idempotency: if this key is already pending in memory, don't re-register
  if (pendingConfirmations.has(compositeKey)) {
    console.log(`[FINANCE] Transaction ${compositeKey} is already pending. Skipping.`);
    return null;
  }

  // 1. Persist to Supabase FIRST (telegram_sent = false)
  await supabase.savePendingTransaction(compositeKey, tx, false);

  // 2. Build message
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

module.exports = {
  processTransaction,
  getRecentTransactions,
  searchTransactions,
  getFinanceAnalytics,
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
  // Exposed for Watchdog cron (cron.js)
  buildConfirmationMessage: _buildConfirmationMessage,
  autoSaveFromWatchdog,
  getPendingConfirmationsContext
};


