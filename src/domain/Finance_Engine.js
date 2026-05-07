const supabase = require('../infrastructure/Supabase_Memories');
const googleWorkspace = require('../infrastructure/Google_Workspace');

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

      response += `*No. ${no}* — ${tanggal} ${waktu}\n`;
      response += `${tipeIcon} ${tipe} | 🏷️ ${kategori}\n`;
      response += `📝 ${catatan}\n`;
      response += `💰 ${nominalFmt} | 🏦 Saldo: ${saldoFmt}\n`;
      response += `──────────────\n`;
    });
    return response;
  } catch (err) {
    console.error('[FINANCE] Failed to fetch recent transactions:', err.message);
    if (err.message && err.message.includes('Office file')) {
      return `⚠️ **Gagal mengambil data:** Format dokumen tidak didukung.\n\nTuan, file buku kas saat ini berformat Microsoft Excel (.xlsx). N.E.X.A hanya bisa membaca format Google Sheets asli.\n\n*Cara Perbaikan:*\n1. Buka file tersebut di Google Drive\n2. Klik "File" > "Save as Google Sheets"\n3. Copy ID dari file baru tersebut dan perbarui di setelan (GOOGLE_SHEET_ID).`;
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

    let report = `📊 *Laporan Analitik Keuangan Bulan Ini:*\n\n`;
    report += `🟢 *Total Pemasukan:* ${pemasukanFmt}\n`;
    report += `🔴 *Total Pengeluaran:* ${pengeluaranFmt}\n`;
    report += `──────────────\n`;
    report += `🏦 *SALDO AKHIR:* **${saldoFmt}**\n\n`;
    report += `_Laporan dihitung secara real-time dari rumusan Google Sheets Tuan Faqih._`;

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
    if (newNominal) {
      const nominal = parseFloat(newNominal);
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

module.exports = { processTransaction, getRecentTransactions, getFinanceAnalytics, deleteTransaction, editTransaction };
