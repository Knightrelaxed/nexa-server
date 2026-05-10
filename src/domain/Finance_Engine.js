const supabase = require('../infrastructure/Supabase_Memories');
const googleWorkspace = require('../infrastructure/Google_Workspace');
const gmailClient = require('../infrastructure/Gmail_Client');
const axios = require('axios');
const env = require('../config/env');

// In-memory cache of pending confirmations (source of truth = Supabase)
// key: compositeKey, value: { tx, timeoutId }
const pendingConfirmations = new Map();

/**
 * Send Telegram message with retry logic (3 attempts)
 */
async function sendTelegramWithRetry(msg, retries = 3) {
  for (let i = 1; i <= retries; i++) {
    try {
      await axios.post(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
        chat_id: env.TELEGRAM_CHAT_ID,
        text: msg,
        parse_mode: 'HTML'
      }, { timeout: 10000 });
      return true;
    } catch (e) {
      console.warn(`[FINANCE] Telegram send attempt ${i}/${retries} failed: ${e.message}`);
      if (i < retries) await new Promise(r => setTimeout(r, 2000 * i));
    }
  }
  return false;
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
          const aiRouter = require('../core/AI_Router');
          const tipeStr = tx.type === 'INCOME' ? 'pemasukan' : 'pengeluaran';
          const autoQuery = `catat ${tipeStr} ${tx.nominal} ke ${tx.destination}`;
          const routingData = await aiRouter.routeUserMessage(autoQuery, { last_intent: null });
          tx.category = routingData?.extracted_data?.category || 'Lainnya';
          if (tx.description === '[Menunggu Detail User]') tx.description = `${tipeStr} ke ${tx.destination}`;
          await processTransaction(tx, 'GMAIL_POLLING');
        } catch (_) {}
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
  // CRITICAL: nominal may arrive as string. Always coerce to float. Reject if invalid.
  const nominal = parseFloat(data.nominal);
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
    const isDuplicate = await supabase.isDuplicateTransaction(compositeKey, transactionTime);
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

    console.log(`[FINANCE] Transaction saved → Sheet "${result.sheetName}", Row ${result.rowNumber}, No ${result.noValue}`);

    const nominalFormatted = `Rp${nominal.toLocaleString('id-ID')}`;
    return {
      status: 'SUCCESS',
      message: `✅ Transaksi **${tipeLabel}** sebesar **${nominalFormatted}** (${txData.catatan}) berhasil dicatat di baris No. ${result.noValue} — Sheet *${result.sheetName}*.`
    };
  } catch (error) {
    console.error('[FINANCE] Failed to record transaction:', error.message);
    if (error.message && error.message.includes('Office file')) {
      throw new Error('File buku kas Tuan berformat Excel (.xlsx). N.E.X.A hanya bisa membaca format Google Sheets asli. Silakan buka file tersebut di Google Drive, klik "File > Save as Google Sheets", lalu masukkan ID file yang baru ke konfigurasi sistem Tuan.');
    }
    if (error.message && error.message.includes('Unable to parse range')) {
      throw new Error(`⚠️ **Tab Bulan Ini Belum Dibuat!**\nN.E.X.A mencoba mencari tab (sheet) dengan nama bulan ini (misal: "Mei 2026"), tetapi tidak menemukannya.\n\n*Solusi:*\nBuka file Google Sheets Anda, lalu duplikat tab "Februari 2026" (atau tab sebelumnya) dan ubah nama tab hasil duplikatnya menjadi nama bulan ini (contoh: "Mei 2026").`);
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

    let response = `💸 *${rows.length} Transaksi Terakhir (Sheet Bulan Ini):*\n\n`;
    rows.forEach(row => {
      // Columns: A(No) B(Tanggal) C(Waktu) D(Tipe) E(Kategori) F(Akun) G(Catatan) H(Nominal) I(Saldo) J(Nominal+)
      const no       = row[0] || '-';
      const tanggal  = row[1] || '-';
      const waktu    = row[2] || '';
      const tipe     = row[3] || '-';
      const kategori = row[4] || '-';
      const catatan  = row[6] || '-';
      const nominal  = row[7] || '0';
      const saldo    = row[8] || '-';

      const nominalNum = parseFloat(String(nominal).replace(/[^0-9.-]/g, ''));
      const nominalFmt = isNaN(nominalNum) ? nominal : `Rp${Math.abs(nominalNum).toLocaleString('id-ID')}`;
      const saldoNum = parseFloat(String(saldo).replace(/[^0-9.-]/g, ''));
      const saldoFmt = isNaN(saldoNum) ? saldo : `Rp${saldoNum.toLocaleString('id-ID')}`;
      const tipeIcon = tipe === 'Pemasukan' ? '🟢' : '🔴';

      response += `<b>No. ${no}</b> — ${tanggal} ${waktu}\n`;
      response += `${tipeIcon} ${tipe} | 🏷️ ${kategori}\n`;
      response += `📝 <i>${catatan}</i>\n`;
      response += `💰 ${nominalFmt} | 🏦 Saldo: ${saldoFmt}\n`;
      response += `──────────────\n`;
    });
    return response;
  } catch (err) {
    console.error('[FINANCE] Failed to fetch recent transactions:', err.message);
    if (err.message && err.message.includes('Office file')) {
      return `⚠️ <b>Gagal mengambil data:</b> Format dokumen tidak didukung.\n\nTuan, file buku kas saat ini berformat Microsoft Excel (.xlsx). N.E.X.A hanya bisa membaca format Google Sheets asli.\n\n<b>Cara Perbaikan:</b>\n1. Buka file tersebut di Google Drive\n2. Klik "File" > "Save as Google Sheets"\n3. Copy ID dari file baru tersebut dan perbarui di setelan (GOOGLE_SHEET_ID).`;
    }
    if (err.message && err.message.includes('Unable to parse range')) {
      return `⚠️ **Tab Bulan Ini Belum Dibuat!**\nN.E.X.A tidak dapat menemukan tab (sheet) dengan nama bulan ini di Google Sheets Tuan. Silakan buat atau duplikat tab sebelumnya, dan beri nama sesuai bulan ini (contoh: "Mei 2026").`;
    }
    return `⚠️ Gagal mengambil data keuangan: ${err.message}`;
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
      const num = parseFloat(String(val).replace(/[^0-9.-]/g, ''));
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
      return `⚠️ **Gagal membaca analitik:** File buku kas Tuan berformat Excel (.xlsx). Silakan ubah ke format Google Sheets (File > Save as Google Sheets) dan perbarui ID filenya.`;
    }
    if (err.message && err.message.includes('Unable to parse range')) {
      return `⚠️ **Tab Bulan Ini Belum Dibuat!**\nN.E.X.A tidak dapat menemukan tab bulan ini untuk membaca analitik. Silakan buat/duplikat tab di Google Sheets Anda dengan nama bulan ini (contoh: "Mei 2026").`;
    }
    return `⚠️ Gagal membaca tabel analitik: ${err.message}`;
  }
}

// In-memory undo cache: { deletedRow, deletedIndex, expireTimerId }
let lastDeletedTransaction = null;

/**
 * Delete a specific transaction matching a keyword (usually description or amount).
 * Search priority: (1) Exact match on transaction No (column 0), (2) Exact match on description,
 * (3) Partial match on description/nominal. This prevents "299" from matching "604091793299".
 * Stores the deleted row for 10-minute undo window.
 */
async function deleteTransaction(keyword) {
  try {
    const rows = await googleWorkspace.getAllFinanceRows();
    if (!rows || rows.length === 0) return { status: 'FAILED', message: 'Tabel bulan ini masih kosong.' };

    const kw = String(keyword).toLowerCase().trim();
    let indexToDelete = -1;

    // Priority 1: Exact match on transaction number (column 0 = "No")
    if (/^\d+$/.test(kw)) {
      indexToDelete = rows.findIndex(r => String(r[0]).trim() === kw);
    }

    // Priority 2: Exact match on description (column 6)
    if (indexToDelete === -1) {
      indexToDelete = rows.findIndex(r => (r[6] || '').toLowerCase().trim() === kw);
    }

    // Priority 3: Partial match on description or nominal (last resort)
    if (indexToDelete === -1) {
      indexToDelete = rows.findIndex(r => {
        const cat = (r[6] || '').toLowerCase();
        const nom = (r[7] || '').toLowerCase();
        return cat.includes(kw) || nom.includes(kw);
      });
    }

    if (indexToDelete === -1) {
      return { status: 'FAILED', message: `Tidak ada transaksi yang cocok dengan "${keyword}".` };
    }

    const deletedRow = [...rows[indexToDelete]]; // clone

    // Extract details for confirmation message
    const no = deletedRow[0] || '-';
    const tanggal = deletedRow[1] || '-';
    const waktu = deletedRow[2] || '-';
    const tipe = deletedRow[3] || '-';
    const kategori = deletedRow[4] || '-';
    const akun = deletedRow[5] || '-';
    const catatan = deletedRow[6] || '-';
    const nominalRaw = parseFloat(String(deletedRow[7]).replace(/[^0-9.-]/g, ''));
    const nominalFmt = isNaN(nominalRaw) ? deletedRow[7] : `Rp${Math.abs(nominalRaw).toLocaleString('id-ID')}`;

    // Remove the row from the array
    rows.splice(indexToDelete, 1);
    
    // Overwrite the sheet to recalculate formulas
    await googleWorkspace.overwriteFinanceSheet(rows);

    // Store for undo (10-minute window)
    if (lastDeletedTransaction?.expireTimerId) clearTimeout(lastDeletedTransaction.expireTimerId);
    const expireTimerId = setTimeout(() => {
      lastDeletedTransaction = null;
      console.log('[FINANCE] Undo window expired (10 min). Deleted transaction can no longer be restored.');
    }, 10 * 60 * 1000);
    lastDeletedTransaction = { deletedRow, deletedIndex: indexToDelete, expireTimerId };

    const msg = `🗑️ <b>TRANSAKSI DIHAPUS</b>\n\n` +
      `<b>No:</b> ${no}\n` +
      `<b>Tanggal:</b> ${tanggal}\n` +
      `<b>Waktu:</b> ${waktu}\n` +
      `<b>Tipe:</b> ${tipe}\n` +
      `<b>Kategori:</b> ${kategori}\n` +
      `<b>Akun:</b> ${akun}\n` +
      `<b>Catatan / Detail:</b> ${catatan}\n` +
      `<b>Nominal (Rp):</b> ${nominalFmt}\n\n` +
      `💡 <i>Anda bisa membatalkan penghapusan ini dalam 10 menit ke depan dengan berkata "batalkan hapus" atau "undo".</i>`;

    return { status: 'SUCCESS', message: msg };
  } catch (error) {
    console.error('[FINANCE] Failed to delete transaction:', error.message);
    return { status: 'FAILED', message: `Gagal menghapus transaksi: ${error.message}` };
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
    const nominalRaw = parseFloat(String(deletedRow[7]).replace(/[^0-9.-]/g, ''));
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

    const kw = String(keyword).toLowerCase().trim();
    let indexToEdit = -1;

    // Priority 1: Exact match on transaction number (column 0 = "No")
    if (/^\d+$/.test(kw)) {
      indexToEdit = rows.findIndex(r => String(r[0]).trim() === kw);
    }

    // Priority 2: Exact match on description (column 6)
    if (indexToEdit === -1) {
      indexToEdit = rows.findIndex(r => (r[6] || '').toLowerCase().trim() === kw);
    }

    // Priority 3: Partial match on description or nominal (last resort)
    if (indexToEdit === -1) {
      indexToEdit = rows.findIndex(r => {
        const cat = (r[6] || '').toLowerCase();
        const nom = (r[7] || '').toLowerCase();
        return cat.includes(kw) || nom.includes(kw);
      });
    }

    if (indexToEdit === -1) {
      return { status: 'FAILED', message: `Tidak ada transaksi yang cocok dengan "${keyword}".` };
    }

    const oldRow = rows[indexToEdit];
    const oldCat = oldRow[6] || '-';
    
    // Update nominal if provided
    if (newNominal !== undefined && newNominal !== null && String(newNominal).trim() !== '') {
      const nominal = parseFloat(newNominal);
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

    return { status: 'SUCCESS', message: `✏️ Transaksi "${oldCat}" berhasil diubah. Semua rumus dan data telah disesuaikan ulang.` };
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

  for (const [key, pending] of pendingConfirmations.entries()) {
    clearTimeout(pending.timeoutId);
    if (isYes) {
      try {
        if (customDescription) pending.tx.description = customDescription;
        if (customCategory) pending.tx.category = customCategory;
        
        // If it's still uncategorized but has a user description, auto-categorize it via AI Router
        if (!customCategory && pending.tx.description !== '[Menunggu Detail User]') {
          const aiRouter = require('../core/AI_Router');
          const autoQuery = `catat pengeluaran ${pending.tx.nominal} untuk ${pending.tx.description} di ${pending.tx.destination}`;
          const routingData = await aiRouter.routeUserMessage(autoQuery, { last_intent: null });
          pending.tx.category = routingData?.extracted_data?.category || 'Lainnya';
        }

        await processTransaction(pending.tx, 'GMAIL_POLLING');
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
    return `✅ <b>Berhasil dicatat!</b> ${processedCount} transaksi telah dimasukkan ke dalam sheet keuangan Tuan.`;
  } else {
    return `❌ <b>Dibatalkan.</b> ${skippedCount} transaksi Livin' diabaikan dan tidak dimasukkan ke dalam sheet.`;
  }
}

/**
 * Updates a pending transaction with new details/category and re-sends a confirmation prompt.
 * Does NOT save to Google Sheets yet.
 */
async function updatePendingTransaction(customDescription = null, customCategory = null) {
  if (pendingConfirmations.size === 0) return null;

  let msg = '';
  for (const [key, pending] of pendingConfirmations.entries()) {
    if (customDescription) pending.tx.description = customDescription;
    if (customCategory) pending.tx.category = customCategory;

    // Reset the 5-minute timeout because user interacted
    clearTimeout(pending.timeoutId);
    
    // Update Supabase
    await supabase.savePendingTransaction(key, pending.tx, true);

    const newTimeoutId = setTimeout(async () => {
      if (pendingConfirmations.has(key)) {
        await _autoSavePending(key, pending.tx);
      }
    }, 5 * 60 * 1000);
    pending.timeoutId = newTimeoutId;

    msg = await _buildConfirmationMessage(pending.tx, 'KOREKSI TRANSAKSI TERTUNDA');
    break; // only handle the first one (usually there's only 1 pending at a time)
  }

  return msg;
}

/**
 * Automatically poll Gmail for new Livin' transaction emails, parse them, and record them.
 * Relies on Zero-Duplication Engine to prevent duplicate entries across polls.
 */
async function pollLivinEmails() {
  try {
    console.log('[FINANCE] Polling for new Livin emails...');
    const emails = await gmailClient.getLatestEmails('from:noreply.livin@bankmandiri.co.id', 15);
    if (!emails || emails.length === 0) return 0;

    let newCount = 0;
    for (const e of emails) {
      const blob = `${e.subject || ''}\n${e.body || ''}\n${e.snippet || ''}`;
      
      // Extract Nominal
      const nominalMatch = blob.match(/(?:nominal transaksi|jumlah transfer|nominal|rp)\s*(?:transaksi|transfer)?\s*rp?\s*([0-9][0-9\.\,]+)/i);
      if (!nominalMatch) continue;
      const nominal = parseFloat(String(nominalMatch[1]).replace(/\./g, '').replace(',', '.'));
      if (isNaN(nominal) || nominal <= 0) continue;

      // Check for failed transactions
      const isFailed = blob.toLowerCase().includes('tidak berhasil') || blob.toLowerCase().includes('gagal');

      // Extract Merchant/Destination
      let destination = 'Livin Transaction';
      const merchantMatch = blob.match(/penerima\s+([a-z0-9\s\&\.\-]+)/i);
      if (merchantMatch?.[1]) {
        destination = merchantMatch[1].replace(/&nbsp;/ig, ' ').replace(/\s+/g, ' ').trim().substring(0, 80);
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
        // Just notify the user and don't process it further
        if (env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_CHAT_ID) {
          const nominalFmt = `Rp${nominal.toLocaleString('id-ID')}`;
          const failedMsg = `⚠️ <b>TRANSFER GAGAL</b>\n\nTujuan: ${destination}\nNominal: ${nominalFmt}\n\n<i>N.E.X.A mengabaikan transaksi ini dan tidak mencatatnya ke dalam buku kas Anda.</i>`;
          await axios.post(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
            chat_id: env.TELEGRAM_CHAT_ID,
            text: failedMsg,
            parse_mode: 'HTML'
          });
          try { await supabase.saveChatMemory('assistant', failedMsg); } catch(e) {}
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

      const msg = await requestTransactionConfirmation(tx, 'TRANSAKSI LIVIN TERBARU');
      if (msg && env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_CHAT_ID) {
        await axios.post(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
          chat_id: env.TELEGRAM_CHAT_ID,
          text: msg,
          parse_mode: 'HTML'
        });
        try { await supabase.saveChatMemory('assistant', msg); } catch(e) {}
      }
    }
    return newCount;
  } catch (error) {
    console.error('[FINANCE] Auto-poll Livin emails failed:', error.message);
    return 0;
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
  const nominalFmt = `Rp${tx.nominal.toLocaleString('id-ID')}`;
  const tipeStr = tx.type === 'INCOME' ? 'Pemasukan' : 'Pengeluaran';
  const isMissingDesc = tx.description === '[Menunggu Detail User]';
  const displayDesc = isMissingDesc ? `[KOSONG - Tujuan: ${tx.destination}]` : tx.description;

  let currentSaldo = '-';
  try {
    const recentRows = await googleWorkspace.getFinanceSummary(1);
    if (recentRows && recentRows.length > 0) {
      const rawSaldo = recentRows[0][8];
      const saldoNum = parseFloat(String(rawSaldo).replace(/[^0-9.-]/g, ''));
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

  return `💸 <b>${sourceLabel}</b>\n\n` +
    `<b>No:</b> [Auto]\n` +
    `<b>Tanggal:</b> ${dateStr}\n` +
    `<b>Waktu:</b> ${timeStr}\n` +
    `<b>Tipe:</b> ${tipeStr}\n` +
    `<b>Kategori:</b> ${tx.category} [Auto-AI]\n` +
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
    const tipeStr = tx.type === 'INCOME' ? 'pemasukan' : 'pengeluaran';
    const aiRouter = require('../core/AI_Router');
    const autoQuery = `catat ${tipeStr} ${tx.nominal} ke ${tx.destination}`;
    const routingData = await aiRouter.routeUserMessage(autoQuery, { last_intent: null });
    tx.category = routingData?.extracted_data?.category || 'Lainnya';
    if (tx.description === '[Menunggu Detail User]') tx.description = `${tipeStr} ke ${tx.destination}`;
    await processTransaction(tx, 'GMAIL_POLLING');
    pendingConfirmations.delete(compositeKey);
    await supabase.deletePendingTransaction(compositeKey);
    const nominalFmt = `Rp${tx.nominal.toLocaleString('id-ID')}`;
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

module.exports = {
  processTransaction,
  getRecentTransactions,
  getFinanceAnalytics,
  deleteTransaction,
  undoDeleteTransaction,
  editTransaction,
  pollLivinEmails,
  confirmPendingTransactions,
  updatePendingTransaction,
  requestTransactionConfirmation,
  recoverPendingTransactions,
  // Exposed for Watchdog cron (cron.js)
  buildConfirmationMessage: _buildConfirmationMessage,
  autoSaveFromWatchdog
};


