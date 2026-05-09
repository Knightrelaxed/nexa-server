const supabase = require('../infrastructure/Supabase_Memories');
const googleWorkspace = require('../infrastructure/Google_Workspace');
const gmailClient = require('../infrastructure/Gmail_Client');
const axios = require('axios');
const env = require('../config/env');

const pendingConfirmations = new Map();

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

/**
 * Delete a specific transaction matching a keyword (usually description or amount).
 */
async function deleteTransaction(keyword) {
  try {
    const rows = await googleWorkspace.getAllFinanceRows();
    if (!rows || rows.length === 0) return { status: 'FAILED', message: 'Tabel bulan ini masih kosong.' };

    const kw = String(keyword).toLowerCase();
    const indexToDelete = rows.findIndex(r => {
      const cat = (r[6] || '').toLowerCase(); // Catatan
      const nom = (r[7] || '').toLowerCase(); // Nominal
      return cat.includes(kw) || nom.includes(kw);
    });

    if (indexToDelete === -1) {
      return { status: 'FAILED', message: `Tidak ada transaksi yang cocok dengan "${keyword}".` };
    }

    const deletedRow = rows[indexToDelete];
    const cat = deletedRow[6] || '-';
    
    // Remove the row from the array
    rows.splice(indexToDelete, 1);
    
    // Overwrite the sheet to recalculate formulas
    await googleWorkspace.overwriteFinanceSheet(rows);

    return { status: 'SUCCESS', message: `🗑️ Transaksi "${cat}" berhasil dihapus. Semua rumus dan nomor urut telah disesuaikan ulang.` };
  } catch (error) {
    console.error('[FINANCE] Failed to delete transaction:', error.message);
    return { status: 'FAILED', message: `Gagal menghapus transaksi: ${error.message}` };
  }
}

/**
 * Edit a specific transaction matching a keyword.
 */
async function editTransaction(keyword, newNominal, newDescription) {
  try {
    const rows = await googleWorkspace.getAllFinanceRows();
    if (!rows || rows.length === 0) return { status: 'FAILED', message: 'Tabel bulan ini masih kosong.' };

    const kw = String(keyword).toLowerCase();
    const indexToEdit = rows.findIndex(r => {
      const cat = (r[6] || '').toLowerCase();
      const nom = (r[7] || '').toLowerCase();
      return cat.includes(kw) || nom.includes(kw);
    });

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
    
    // Overwrite the sheet
    await googleWorkspace.overwriteFinanceSheet(rows);

    return { status: 'SUCCESS', message: `✏️ Transaksi "${oldCat}" berhasil diubah. Semua rumus dan saldo telah disesuaikan ulang.` };
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
  }

  if (isYes) {
    return `✅ <b>Berhasil dicatat!</b> ${processedCount} transaksi telah dimasukkan ke dalam sheet keuangan Tuan.`;
  } else {
    return `❌ <b>Dibatalkan.</b> ${skippedCount} transaksi Livin' diabaikan dan tidak dimasukkan ke dalam sheet.`;
  }
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
          await axios.post(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
            chat_id: env.TELEGRAM_CHAT_ID,
            text: `⚠️ <b>TRANSFER GAGAL</b>\n\nTujuan: ${destination}\nNominal: ${nominalFmt}\n\n<i>N.E.X.A mengabaikan transaksi ini dan tidak mencatatnya ke dalam buku kas Anda.</i>`,
            parse_mode: 'HTML'
          });
        }
        continue;
      }

      newCount++;

      const tx = {
        nominal,
        type: 'EXPENSE',
        destination,
        category: '[Menunggu Kategori AI/User]',
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
      }
    }
    return newCount;
  } catch (error) {
    console.error('[FINANCE] Auto-poll Livin emails failed:', error.message);
    return 0;
  }
}

/**
 * Universally requests transaction confirmation (Email, Text, Voice, Photo).
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

  const transactionTime = new Date(tx.time);
  const cleanMerchant = (tx.destination).toLowerCase().replace(/[^a-z0-9]/g, '');
  const compositeKey = `${nominal}_${cleanMerchant}_${Date.now()}`; // Added Date.now() to ensure manual inputs never collide with existing pending keys

  // Formatting for Telegram
  const dateStr = transactionTime.toLocaleDateString('id-ID', { timeZone: 'Asia/Jakarta', day: 'numeric', month: 'long', year: 'numeric' });
  const timeStr = transactionTime.toLocaleTimeString('id-ID', { timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit', hour12: false }).replace(':', '.');
  
  let currentSaldo = '-';
  try {
    const recentRows = await googleWorkspace.getFinanceSummary(1);
    if (recentRows && recentRows.length > 0) {
      const rawSaldo = recentRows[0][8];
      const saldoNum = parseFloat(String(rawSaldo).replace(/[^0-9.-]/g, ''));
      currentSaldo = isNaN(saldoNum) ? rawSaldo : `Rp${saldoNum.toLocaleString('id-ID')}`;
    }
  } catch (_) {}

  const nominalFmt = `Rp${nominal.toLocaleString('id-ID')}`;
  const tipeStr = tx.type === 'INCOME' ? 'Pemasukan' : 'Pengeluaran';
  const isMissingDesc = tx.description === '[Menunggu Detail User]';
  const displayDesc = isMissingDesc ? `[KOSONG - Tujuan: ${destination}]` : tx.description;

  let proactiveQuestion = '';
  if (isMissingDesc) {
    if (tx.type === 'INCOME') {
      proactiveQuestion = `❓ <b>Terdapat dana masuk dari ${destination}.</b>\n\nKira-kira uang ini masuk dalam rangka apa, Tuan? Mohon berikan detail singkatnya agar saya dapat merapikan laporan pemasukan Anda. <i>(Tanpa balasan, N.E.X.A akan menyimpannya dengan kategori otomatis dalam 5 menit).</i>`;
    } else {
      proactiveQuestion = `❓ <b>N.E.X.A mencatat pengeluaran ke ${destination}.</b>\n\nTuan, uang ini digunakan untuk keperluan apa ya? Mohon arahannya agar saya dapat melengkapi buku kas Anda dengan akurat. <i>(Tanpa balasan, N.E.X.A akan menebak kategorinya dalam 5 menit).</i>`;
    }
  } else {
    proactiveQuestion = `💡 Transaksi ini siap dikunci. Jika ada koreksi tambahan pada detail di atas, silakan balas pesan ini. Jika tidak, N.E.X.A akan meresmikannya ke dalam Sheet secara otomatis dalam 5 menit.`;
  }

  const msg = `💸 <b>${sourceLabel}</b>\n\n` +
              `<b>No:</b> [Auto]\n` +
              `<b>Tanggal:</b> ${dateStr}\n` +
              `<b>Waktu:</b> ${timeStr}\n` +
              `<b>Tipe:</b> ${tipeStr}\n` +
              `<b>Kategori:</b> [Auto-AI]\n` +
              `<b>Akun:</b> Bank Mandiri Livin\n` +
              `<b>Catatan / Detail:</b> ${displayDesc}\n` +
              `<b>Nominal (Rp):</b> ${nominalFmt}\n` +
              `<b>Saldo (Rp) Saat Ini:</b> ${currentSaldo}\n\n` +
              `${proactiveQuestion}`;

  // Auto-save after 5 minutes
  const timeoutId = setTimeout(async () => {
    if (pendingConfirmations.has(compositeKey)) {
      try {
        const aiRouter = require('../core/AI_Router');
        const autoQuery = `catat ${tipeStr.toLowerCase()} ${nominal} ke ${tx.destination} dengan catatan ${tx.description}`;
        const routingData = await aiRouter.routeUserMessage(autoQuery, { last_intent: null });
        
        tx.category = routingData?.extracted_data?.category || 'Lainnya';
        if (tx.description === '[Menunggu Detail User]') {
            tx.description = `${tipeStr} ke ${tx.destination}`;
        }

        await processTransaction(tx, sourceLabel.includes('LIVIN') ? 'GMAIL_POLLING' : 'TELEGRAM_MANUAL');
        pendingConfirmations.delete(compositeKey);
        
        if (env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_CHAT_ID) {
          await axios.post(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
            chat_id: env.TELEGRAM_CHAT_ID,
            text: `⏳ <i>Waktu habis.</i>\nTransaksi <b>${nominalFmt}</b> telah disimpan otomatis.\n\nKategori AI: <b>${tx.category}</b>\nCatatan: <b>${tx.description}</b>`,
            parse_mode: 'HTML'
          });
        }
      } catch (e) {
        console.error('[FINANCE] Auto-save timeout failed:', e.message);
      }
    }
  }, 5 * 60 * 1000);

  pendingConfirmations.set(compositeKey, { tx, timeoutId });
  return msg;
}

module.exports = { processTransaction, getRecentTransactions, getFinanceAnalytics, deleteTransaction, editTransaction, pollLivinEmails, confirmPendingTransactions, requestTransactionConfirmation };
