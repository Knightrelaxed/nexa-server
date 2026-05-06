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
    return `⚠️ Gagal mengambil data keuangan: ${err.message}`;
  }
}

module.exports = { processTransaction, getRecentTransactions };
