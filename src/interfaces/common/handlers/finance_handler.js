'use strict';
// ============================================================
// N.E.X.A — COMMON FINANCE HANDLER
// Handles all 20+ FINANCE actions across Telegram and CLI
// ============================================================

const financeEngine    = require('../../../domain/Finance_Engine');
const supabaseMemories = require('../../../infrastructure/Supabase_Memories');
const helpers          = require('../helpers');

/**
 * Resolves pending email context from either Telegram or CLI context
 */
function _getPendingEmail(context) {
  if (context.pendingEmailContext) return context.pendingEmailContext;
  if (context.pendingEmail && typeof context.pendingEmail.get === 'function') {
    return context.pendingEmail.get(context.sessionKey);
  }
  return null;
}

/**
 * Detect if textInput contains explicit payment method keywords
 */
function _hasPaymentMethodInText(text) {
  if (!text || typeof text !== 'string') return false;
  const s = text.toLowerCase();
  if (/\b(qris|qis|qriz|kris|chris|gris|scan|kode\s*qr|barcode)\b/i.test(s) || s.includes('q.r.i.s')) return true;
  if (/\b(transfer|tf|trf|tranfer|trasnfer|kirim\s*uang|m-banking|mbanking|bi-fast|bifast|atm|antar\s*bank)\b/i.test(s)) return true;
  if (/\b(kartu\s*kredit|credit\s*card|cc|gesek|swipe|cicil|cicilan|visa|mastercard)\b/i.test(s)) return true;
  if (/\b(tunai|cash|kontan|uang\s*tunai|uang\s*cash|uang\s*fisik|uang\s*kertas|bayar\s*tunai|bayar\s*cash)\b/i.test(s)) return true;
  if (/\b(direct\s*debit|direct\s*debet|dd|autodebit|auto\s*debit|debet|debit|potong\s*saldo|potong\s*rekening)\b/i.test(s)) return true;
  return false;
}

/**
 * Detect if textInput contains explicit account names or aliases
 */
function _hasAccountInText(text, accountsList = []) {
  if (!text || typeof text !== 'string') return false;
  const s = text.toLowerCase();
  const accountAliases = ['mandiri', 'livin', 'jago', 'kantong', 'shopee', 'shopeepay', 'spay', 'gopay', 'gojek', 'dana', 'bca', 'bri', 'bni', 'ovo', 'cash'];
  for (const alias of accountAliases) {
    const regex = new RegExp('\\b' + alias + '\\b', 'i');
    if (regex.test(s)) return true;
  }
  for (const acc of accountsList || []) {
    const rawAccName = (acc.name || '').toLowerCase().replace(/^(bank|dompet)\s+/i, '').trim();
    if (rawAccName.length >= 3) {
      const regex = new RegExp('\\b' + rawAccName + '\\b', 'i');
      if (regex.test(s)) return true;
    }
  }
  return false;
}

/**
 * Detect if textInput contains explicit price or nominal
 */
function _hasNominalInText(text) {
  if (!text || typeof text !== 'string') return false;
  const s = text.toLowerCase();

  // Explicit currency indicator: 15rb, 50k, rp 5000, 1.5jt
  if (/\b(?:rp\.?|idr)\s*[0-9]+/i.test(s) || /[0-9]+\s*(?:k|rb|ribu|jt|juta|perak)\b/i.test(s)) return true;

  // Explicit price prefix keywords
  if (/\b(?:harga|total|seharga|habis|sebesar|sejumlah|senilai|bayar)\s*(?:total\s*)?(?:rp\.?)?\s*[0-9]+/i.test(s)) return true;

  // Indonesian spelled-out currency words: "lima puluh ribu", "sepuluh ribu"
  if (/\b(?:satu|dua|tiga|empat|lima|enam|tujuh|delapan|sembilan|sepuluh|sebelas|belas|puluh|ratus)\s+(?:ribu|juta)\b/i.test(s)) return true;

  // Clean out dates, times, quantities, years, and phone numbers
  let cleaned = s
    .replace(/\b(?:jam|pukul)\s*\d{1,2}(?:[.:]\d{2})?(?:\s*(?:pagi|siang|sore|malam))?/gi, ' ')
    .replace(/\b\d{1,2}[.:]\d{2}\b/g, ' ')
    .replace(/\b\d{1,2}\s*(?:jan|feb|mar|apr|mei|jun|jul|agu|ags|sep|okt|nov|des)[a-z]*/gi, ' ')
    .replace(/\b(?:tanggal|tgl)\s*\d{1,2}\b/gi, ' ')
    .replace(/\b\d{1,2}[\/\-]\d{1,2}(?:[\/\-]\d{2,4})?\b/g, ' ')
    .replace(/\b202[0-9]\b/g, ' ')
    .replace(/\b\d+\s*(?:batang|bungkus|biji|cup|gelas|porsi|botol|pcs|buah|kotak|pack|pax|lembar|butir|kg|gram|gr|ons|liter|ltr|ekor|x)\b/gi, ' ')
    .replace(/\b(?:08|\+?62)\d{7,13}\b/g, ' ');

  const numMatches = cleaned.match(/\b\d{1,3}(?:[.,]\d{3})+\b|\b\d{3,}\b/g);
  if (numMatches) {
    for (const m of numMatches) {
      const val = parseInt(m.replace(/[.,]/g, ''), 10);
      if (!isNaN(val) && val >= 100) return true;
    }
  }
  return false;
}

/**
 * Extract nominal amount from textInput fallback
 */
function _extractNominalFromText(text) {
  if (!text || typeof text !== 'string') return 0;
  const s = text.toLowerCase();
  
  const mShorthand = s.match(/(?:rp\.?\s*)?([0-9]+(?:[.,][0-9]+)?)\s*(k|rb|ribu|jt|juta)\b/i);
  if (mShorthand) {
    const rawVal = parseFloat(mShorthand[1].replace(',', '.'));
    const unit = mShorthand[2].toLowerCase();
    if (unit === 'k' || unit === 'rb' || unit === 'ribu') return Math.round(rawVal * 1000);
    if (unit === 'jt' || unit === 'juta') return Math.round(rawVal * 1000000);
  }

  const mPrefix = s.match(/(?:harga(?:\s*total)?|seharga|total|habis|sebesar|sejumlah|senilai|bayar)\s*(?:rp\.?\s*)?([0-9][0-9.,]*)/i);
  if (mPrefix) {
    const cleanNum = mPrefix[1].replace(/\./g, '').replace(',', '.');
    const val = parseFloat(cleanNum);
    if (!isNaN(val) && val > 0) return Math.round(val);
  }

  const mRp = s.match(/rp\.?\s*([0-9][0-9.,]*)/i);
  if (mRp) {
    const cleanNum = mRp[1].replace(/\./g, '').replace(',', '.');
    const val = parseFloat(cleanNum);
    if (!isNaN(val) && val > 0) return Math.round(val);
  }

  let cleaned = s
    .replace(/\b(?:jam|pukul)\s*\d{1,2}(?:[.:]\d{2})?(?:\s*(?:pagi|siang|sore|malam))?/gi, ' ')
    .replace(/\b\d{1,2}[.:]\d{2}\b/g, ' ')
    .replace(/\b\d{1,2}\s*(?:jan|feb|mar|apr|mei|jun|jul|agu|ags|sep|okt|nov|des)[a-z]*/gi, ' ')
    .replace(/\b(?:tanggal|tgl)\s*\d{1,2}\b/gi, ' ')
    .replace(/\b\d{1,2}[\/\-]\d{1,2}(?:[\/\-]\d{2,4})?\b/g, ' ')
    .replace(/\b202[0-9]\b/g, ' ')
    .replace(/\b\d+\s*(?:batang|bungkus|biji|cup|gelas|porsi|botol|pcs|buah|kotak|pack|pax|lembar|butir|kg|gram|gr|ons|liter|ltr|ekor|x)\b/gi, ' ')
    .replace(/\b(?:08|\+?62)\d{7,13}\b/g, ' ');

  const numMatches = cleaned.match(/\b\d{1,3}(?:[.,]\d{3})+\b|\b\d{3,}\b/g);
  if (numMatches) {
    for (const m of numMatches) {
      const val = parseInt(m.replace(/[.,]/g, ''), 10);
      if (!isNaN(val) && val >= 100) return val;
    }
  }
  return 0;
}

/**
 * Handle FINANCE intent actions
 * @param {object} routingData 
 * @param {object} context 
 * @returns {Promise<string|null>}
 */
async function handleFinanceIntent(routingData, context = {}) {
  const ed = routingData?.extracted_data || {};
  const action = ed.action;
  const textInput = context.textInput || '';
  let domainReply = null;

  if (action === 'IMPORT_FROM_EMAIL') {
    const gmailClient = require('../../../infrastructure/Gmail_Client');
    const pendingEmail = _getPendingEmail(context);
    const candidateEmails = pendingEmail?.lastBatch?.length
      ? pendingEmail.lastBatch
      : await gmailClient.getLatestEmails('(from:noreply.livin@bankmandiri.co.id OR from:noreply@jago.com OR livin) newer_than:7d', 30);

    const temporalHint = helpers.getEmailTemporalFilterFromText(textInput);
    const dayHint = helpers.parseDayOfMonthHint(textInput);
    let scopedEmails = helpers.filterEmailsByTemporalHint(candidateEmails, temporalHint);
    if (dayHint) scopedEmails = helpers.filterEmailsByDayOfMonth(scopedEmails, dayHint);

    const txRows = helpers.extractFinanceTransactionsFromEmails(scopedEmails);
    if (txRows.length === 0) {
      return '📭 Data transaksi keuangan otomatis tidak ditemukan di email yang dianalisis. Coba sebutkan rentang waktu yang lebih jelas, Tuan.';
    }

    let success = 0;
    let duplicate = 0;
    for (const tx of txRows.slice(0, 20)) {
      try {
        const result = await financeEngine.processTransaction(tx, 'GMAIL_POLLING');
        if (result?.status === 'DUPLICATE') duplicate++;
        else success++;
      } catch (_) {}
    }
    return `✅ Sinkronisasi Keuangan selesai.\n- Berhasil dicatat: ${success}\n- Duplikasi diabaikan: ${duplicate}\n- Sumber dianalisis: ${txRows.length} transaksi email`;
  }

  if (action === 'READ_LATEST') {
    let resolvedType = ed.type || null;
    if (!resolvedType && routingData.user_message) {
      const msg = routingData.user_message.toLowerCase();
      if (/\b(pengeluaran|beli apa|belanja apa|habis berapa|keluar berapa)\b/i.test(msg)) {
        resolvedType = 'EXPENSE';
      } else if (/\b(pemasukan|dapat apa|uang masuk)\b/i.test(msg)) {
        resolvedType = 'INCOME';
      }
    }

    const hasFilter = ed.date_text || ed.search_keyword || resolvedType || ed.category;
    if (hasFilter) {
      return await financeEngine.searchTransactions({
        date_text: ed.date_text || ed.time || null,
        keyword: ed.search_keyword || null,
        type: resolvedType,
        category: ed.category || null,
        limit: ed.limit || 50
      });
    }
    return await financeEngine.getRecentTransactions(5);
  }

  if (action === 'READ_ANALYTICS') {
    const analyticsData = await financeEngine.getFinanceAnalytics(ed.date_text);
    return (routingData.reply_message ? routingData.reply_message + '\n\n' : '') + analyticsData;
  }

  if (action === 'DELETE') {
    const result = await financeEngine.deleteTransaction(ed.search_keyword);
    return result.message;
  }

  if (action === 'UNDO_DELETE' || action === 'UNDO') {
    const result = await financeEngine.undoDeleteTransaction();
    return result.message;
  }

  if (action === 'CONFIRM_TRANSACTION') {
    const confirmationReply = await financeEngine.confirmPendingTransactions(true, ed.description || null, ed.category || null, null, null, null);
    return confirmationReply || '✅ Tidak ada transaksi yang tertunda. Kemungkinan transaksi telah disimpan otomatis karena melewati batas waktu 5 menit.';
  }

  if (action === 'UPDATE_PENDING') {
    const cleanUserText = textInput.replace(/\[KONTEKS_[A-Z]+[\s\S]*?"\s*\]\s*/gi, '').replace(/\[KONTEKS_[^\]]*\]/gi, '').trim();
    let dateISO = null;
    let timeHHMM = null;
    if (ed.time || ed.date_text || /(?:tanggal|tgl|kemarin|tadi malam|hari ini|jam|pukul|\d{1,2}[\/\-]\d{1,2})/i.test(cleanUserText)) {
      const dtInfo = require('../../../domain/finance/Finance_Helpers')._parseDateTimeExpression(ed.time || ed.date_text || cleanUserText);
      dateISO = dtInfo?.dateISO || null;
      timeHHMM = dtInfo?.timeHHMM || null;
    }

    const updatedMsg = await financeEngine.updatePendingTransaction(
      ed.description || null,
      ed.category || null,
      ed.nominal || null,
      ed.account || null,
      ed.payment_method || null,
      null,
      dateISO,
      timeHHMM
    );
    if (updatedMsg) return updatedMsg;

    // Fallback: ONLY if user quoted a previous message or provided search_keyword
    let kw = ed.search_keyword;
    const replyMsgText = context.message?.reply_to_message?.text ||
      (textInput.match(/\[KONTEKS_AKSI[\s\S]*?Menanggapi[\s\S]*?"([\s\S]+?)"\s*\]/)?.[1] || null);

    if (replyMsgText && (!kw || /^(ini|itu|transaksi|kategori|perbaiki|ubah|sesuaikan|yang|saya|latest|\s)*$/i.test(String(kw).trim()))) {
      const idMatch = replyMsgText.match(/(?:No|ID)\s*:\s*(?:#)?([a-f0-9\-]{4,36}|\d+)/i);
      const cMatch = replyMsgText.match(/(?:Deskripsi|Catatan|Tujuan|Merchant)\s*:\s*([^\n\r,]{2,80})/i);
      const nLabelMatch = replyMsgText.match(/Nominal\s*\([Rr][Pp]\)\s*:\s*[Rr][Pp][.\s]*([0-9][0-9.,]+)/i);
      const nRpMatch = replyMsgText.match(/[Rr][Pp]\.?\s*([0-9][0-9.,]+)/);

      if (idMatch && idMatch[1] && idMatch[1].toLowerCase() !== 'auto') {
        kw = idMatch[1].trim();
      } else if (cMatch && cMatch[1] && cMatch[1].trim().length > 1 && !cMatch[1].startsWith('[')) {
        kw = cMatch[1].trim();
      } else if (nLabelMatch && nLabelMatch[1]) {
        kw = nLabelMatch[1].replace(/[^0-9]/g, '');
      } else if (nRpMatch && nRpMatch[1]) {
        kw = nRpMatch[1].replace(/[^0-9]/g, '');
      }
    }

    if (!kw || /^(ini|itu|transaksi|kategori|perbaiki|ubah|sesuaikan|yang|saya|\s)*$/i.test(String(kw).trim())) {
      return '⚠️ Tidak ada transaksi yang sedang menunggu konfirmasi untuk diubah.';
    }

    const editRes = await financeEngine.editTransaction(
      kw,
      ed.nominal,
      ed.description || ed.destination,
      ed.category,
      ed.account,
      ed.payment_method,
      ed.type || null,
      dateISO,
      timeHHMM
    );
    if (editRes && editRes.status === 'SUCCESS') {
      return editRes.message;
    }
    return '❌ Tidak ada transaksi yang cocok untuk diubah.';
  }

  if (action === 'CANCEL_TRANSACTION') {
    const confirmationReply = await financeEngine.confirmPendingTransactions(false, null, null, null, null, null);
    return confirmationReply || 'Tidak ada transaksi yang tertunda.';
  }

  if (action === 'EDIT') {
    const cleanUserText = textInput.replace(/\[KONTEKS_[A-Z]+[\s\S]*?"\s*\]\s*/gi, '').replace(/\[KONTEKS_[^\]]*\]/gi, '').trim();
    let dateISO = null;
    let timeHHMM = null;
    if (ed.time || ed.date_text || /(?:tanggal|tgl|kemarin|tadi malam|hari ini|jam|pukul|\d{1,2}[\/\-]\d{1,2})/i.test(cleanUserText)) {
      const dtInfo = require('../../../domain/finance/Finance_Helpers')._parseDateTimeExpression(ed.time || ed.date_text || cleanUserText);
      dateISO = dtInfo?.dateISO || null;
      timeHHMM = dtInfo?.timeHHMM || null;
    }

    let kw = ed.search_keyword;
    const replyMsgText = context.message?.reply_to_message?.text ||
      (textInput.match(/\[KONTEKS_AKSI[\s\S]*?Menanggapi[\s\S]*?"([\s\S]+?)"\s*\]/)?.[1] || null);

    if (replyMsgText && (!kw || /^(ini|itu|transaksi|kategori|perbaiki|ubah|sesuaikan|yang|saya|latest|\s)*$/i.test(String(kw).trim()))) {
      const idMatch = replyMsgText.match(/(?:No|ID)\s*:\s*(?:#)?([a-f0-9\-]{4,36}|\d+)/i);
      const cMatch = replyMsgText.match(/(?:Deskripsi|Catatan|Tujuan|Merchant)\s*:\s*([^\n\r,]{2,80})/i);
      const nLabelMatch = replyMsgText.match(/Nominal\s*\([Rr][Pp]\)\s*:\s*[Rr][Pp][.\s]*([0-9][0-9.,]+)/i);
      const nRpMatch = replyMsgText.match(/[Rr][Pp]\.?\s*([0-9][0-9.,]+)/);

      if (idMatch && idMatch[1] && idMatch[1].toLowerCase() !== 'auto') {
        kw = idMatch[1].trim();
      } else if (cMatch && cMatch[1] && cMatch[1].trim().length > 1 && !cMatch[1].startsWith('[')) {
        kw = cMatch[1].trim();
      } else if (nLabelMatch && nLabelMatch[1]) {
        kw = nLabelMatch[1].replace(/[^0-9]/g, '');
      } else if (nRpMatch && nRpMatch[1]) {
        kw = nRpMatch[1].replace(/[^0-9]/g, '');
      } else {
        kw = 'latest';
      }
    } else if (!kw || /^(ini|itu|transaksi|kategori|perbaiki|ubah|sesuaikan|yang|saya|\s)*$/i.test(String(kw).trim())) {
      const hasEditIntent = /\b(ubah|edit|ganti|ralat|perbaiki|koreksi|sesuaikan|terakhir|tadi)\b/i.test(cleanUserText);
      if (!hasEditIntent && !replyMsgText) {
        return '❓ Transaksi mana yang ingin diedit, Tuan? Mohon sebutkan nama merchant, nomor transaksi, atau balas langsung pada pesan transaksinya.';
      }
      kw = 'latest';
    }
    const result = await financeEngine.editTransaction(
      kw,
      ed.nominal,
      ed.description || ed.destination,
      ed.category,
      ed.account,
      ed.payment_method,
      ed.type || null,
      dateISO,
      timeHHMM
    );
    return result.message;
  }

  if (action === 'CATEGORY_BREAKDOWN') {
    return await financeEngine.getCategoryInsight(ed.date_text || null);
  }

  if (action === 'PERIOD_COMPARISON') {
    return await financeEngine.getPeriodComparisonReport(ed.date_text || null);
  }

  if (action === 'TOP_EXPENSES') {
    return await financeEngine.getTopExpensesReport(ed.date_text || null, ed.limit || 5);
  }

  if (action === 'ACCOUNT_BALANCES') {
    return await financeEngine.getAccountBalancesReport();
  }

  if (action === 'DAILY_TREND') {
    return await financeEngine.getDailyTrendReport(ed.date_text || null);
  }

  if (action === 'SMART_SUMMARY') {
    return await financeEngine.getSmartFinanceSummary(ed.date_text || null);
  }

  if (action === 'MONTHLY_SUMMARY') {
    return await financeEngine.getMonthlySummaryReport();
  }

  if (action === 'SAVING_RATE') {
    return await financeEngine.getSavingRateReport(ed.date_text || null);
  }

  if (action === 'BALANCE_TREND') {
    return await financeEngine.getDailyBalanceTrendReport(ed.date_text || null);
  }

  if (action === 'RECORD_MULTIPLE' && Array.isArray(ed.transactions)) {
    const replies = [];
    for (const tx of ed.transactions) {
      const txData = {
        nominal: tx.nominal,
        type: tx.type || 'EXPENSE',
        destination: tx.destination || tx.merchant || 'Unknown',
        category: tx.category || 'Uncategorized',
        description: tx.description || '-',
        time: tx.time || new Date().toISOString(),
        account: tx.account || null,
        payment_method: tx.payment_method || null
      };
      const confirmMsg = await financeEngine.requestTransactionConfirmation(txData, 'PENCATATAN KEUANGAN BARU', null, { telegramSent: true });
      if (confirmMsg) {
        replies.push(confirmMsg);
        const cleanMerch = (txData.destination || txData.merchant || 'Unknown').toLowerCase().replace(/[^a-z0-9]/g, '');
        const cKey = `${txData.nominal}_${cleanMerch}`;
        await supabaseMemories.markPendingTransactionSent(cKey).catch(() => {});
      } else {
        replies.push(`⚠️ Transaksi ${txData.nominal} ke ${txData.destination} tampaknya sudah dicatat atau tertunda.`);
      }
    }
    return replies.join('\n\n---\n\n');
  }

  if (ed.nominal || action === 'RECORD') {
    // 1. Strict Anti-Hallucination Guardrail for Nominal:
    // Verify whether user actually stated a price/nominal in their message.
    let parsedNominal = typeof ed.nominal === 'number'
      ? ed.nominal
      : (ed.nominal ? require('../../../domain/finance/Finance_Helpers')._parseFlexibleCurrency(String(ed.nominal)) : 0);

    const hasNominal = _hasNominalInText(textInput);
    if ((!parsedNominal || parsedNominal <= 0) && hasNominal) {
      parsedNominal = _extractNominalFromText(textInput);
    }

    if (!hasNominal || !parsedNominal || parsedNominal <= 0) {
      const descHint = ed.description && ed.description !== '-' && ed.description !== '[Menunggu Detail User]'
        ? `<b>${ed.description}</b>`
        : (ed.destination && ed.destination !== 'Unknown' ? `ke <b>${ed.destination}</b>` : 'ini');
      return `❓ <b>Berapa nominal atau harga untuk transaksi ${descHint}, Tuan?</b>\n\n<i>(Mohon sebutkan nominalnya, contoh: "5rb", "15.000", atau "harga 20 ribu").</i>`;
    }

    // 2. Strict Anti-Hallucination Guardrail for Payment Method & Account:
    // If user did NOT explicitly mention payment_method or account in textInput, reset them to null!
    const supabaseFinance = require('../../../infrastructure/Supabase_Finance');
    let accountsList = [];
    try {
      accountsList = await supabaseFinance.getAccountsList();
    } catch (_) {}

    if (ed.payment_method && !_hasPaymentMethodInText(textInput)) {
      ed.payment_method = null;
    }
    if (ed.account && !_hasAccountInText(textInput, accountsList)) {
      ed.account = null;
    }

    const isTransfer = String(ed.type || '').toUpperCase() === 'TRANSFER' ||
      action === 'TRANSFER' ||
      !!(ed.from_account && ed.to_account) ||
      /\b(?:tf|transfer|pindah\s*saldo|kirim|top\s*up)\s+(?:dari\s+[a-z0-9\s]+\s+ke|ke\s+[a-z0-9\s]+\s+dari)\b/i.test(textInput);

    let fromAccName = ed.from_account || null;
    let toAccName = ed.to_account || null;
    let adminFee = (ed.admin_fee !== undefined && ed.admin_fee !== null)
      ? ed.admin_fee
      : ((ed.adminFee !== undefined && ed.adminFee !== null) ? ed.adminFee : 0);

    // Regex fallback extraction for admin fee if AI missed it (applicable to ANY transfer/expense)
    if (!adminFee) {
      const mAdmin = textInput.match(/(?:biaya\s*admin(?:nya)?|biaya\s*transfer|admin(?:nya)?|biaya|adm|fee)\s*(?:sebesar|sejumlah|rp\.?)?\s*([0-9][0-9\.\,]*\s*(?:k|rb|ribu)?)/i);
      if (mAdmin && mAdmin[1]) {
        const parsedAdmin = require('../../../domain/finance/Finance_Helpers')._parseFlexibleCurrency(mAdmin[1]);
        if (!isNaN(parsedAdmin) && parsedAdmin > 0) {
          adminFee = parsedAdmin;
        }
      }
    }

    let isSelfTransfer = false;
    let fromAccountResolved = null;
    let toAccountResolved = null;

    if (isTransfer) {
      if (!fromAccName && ed.account) fromAccName = ed.account;
      if (!toAccName && ed.destination) toAccName = ed.destination;

      // Heuristic extraction from textInput if AI missed from/to
      if (!fromAccName || !toAccName) {
        const mFromTo = textInput.match(/(?:tf|transfer|pindah\s*saldo|kirim|top\s*up)\s+(?:dari\s+)?([a-z0-9\s]+?)\s+ke\s+([a-z0-9\s]+?)(?:\s+\d+|\s+sebesar|\s+sejumlah|\s*$)/i);
        if (mFromTo) {
          if (!fromAccName) fromAccName = mFromTo[1].trim();
          if (!toAccName) toAccName = mFromTo[2].trim();
        }
      }

      // Canonical account resolution via Supabase finance
      const supabaseFinance = require('../../../infrastructure/Supabase_Finance');
      const accountsList = await supabaseFinance.getAccountsList();

      const matchAccountStrict = (name) => {
        if (!name || typeof name !== 'string') return null;
        const raw = name.toLowerCase().trim();
        for (const acc of accountsList || []) {
          const accName = acc.name.toLowerCase();
          const cleanAccName = accName.replace(/^(bank|dompet)\s+/i, '').trim();
          if (raw === accName || raw === cleanAccName) return acc.name;
          if (cleanAccName.length >= 3 && (raw.includes(cleanAccName) || cleanAccName.includes(raw))) return acc.name;
        }
        return null;
      };

      if (fromAccName) fromAccountResolved = matchAccountStrict(fromAccName);
      if (toAccName) toAccountResolved = matchAccountStrict(toAccName);

      // Self-transfer antar-wallet pribadi HANYA berlaku jika akun asal dan akun tujuan keduanya adalah akun terdaftar milik Tuan dan berbeda
      if (fromAccountResolved && toAccountResolved && fromAccountResolved !== toAccountResolved) {
        isSelfTransfer = true;
      }
    }

    const parsedAdminFee = typeof adminFee === 'number'
      ? adminFee
      : (adminFee ? require('../../../domain/finance/Finance_Helpers')._parseFlexibleCurrency(String(adminFee)) : 0);

    let txData;
    let cardTitle;

    if (isSelfTransfer) {
      txData = {
        nominal: parsedNominal,
        adminFee: parsedAdminFee > 0 ? parsedAdminFee : 0,
        type: 'TRANSFER',
        destination: toAccountResolved || 'Transfer Antar-Akun',
        category: 'Pengeluaran tidak tercatat ',
        description: ed.description && ed.description !== '-'
          ? ed.description
          : `Transfer dari ${fromAccountResolved || 'Akun'} ke ${toAccountResolved || 'Tujuan'}`,
        time: ed.time || new Date().toISOString(),
        account: toAccountResolved || null,
        suggestedAccount: toAccountResolved || null,
        fromAccount: fromAccountResolved || null,
        isSelfTransfer: true,
        payment_method: ed.payment_method || 'Transfer bank'
      };
      cardTitle = 'TRANSFER ANTAR-AKUN';
    } else if (isTransfer) {
      // Transfer ke orang lain / pihak eksternal (toAccName bukan akun wallet milik Tuan)
      const externalDest = toAccName || ed.destination || ed.merchant || 'Pihak Luar';
      const sourceAccount = fromAccountResolved || fromAccName || ed.account || null;
      const desc = ed.description && ed.description !== '-'
        ? ed.description
        : `Transfer ke ${externalDest}`;

      txData = {
        nominal: parsedNominal,
        adminFee: parsedAdminFee > 0 ? parsedAdminFee : 0,
        type: 'EXPENSE',
        destination: externalDest,
        category: ed.category || 'Uncategorized',
        description: desc,
        time: ed.time || new Date().toISOString(),
        account: sourceAccount,
        suggestedAccount: null,
        fromAccount: sourceAccount,
        isSelfTransfer: false,
        payment_method: ed.payment_method || 'Transfer bank'
      };
      cardTitle = parsedAdminFee > 0 ? 'PENGELUARAN TRANSFER DENGAN BIAYA ADMIN' : 'PENCATATAN KEUANGAN BARU';
    } else {
      // Transaksi pengeluaran/pemasukan biasa (opsional dengan biaya admin)
      txData = {
        nominal: parsedNominal,
        adminFee: parsedAdminFee > 0 ? parsedAdminFee : 0,
        type: ed.type || 'EXPENSE',
        destination: ed.destination || ed.merchant || 'Unknown',
        category: ed.category || 'Uncategorized',
        description: ed.description && ed.description !== '-' ? ed.description : '-',
        time: ed.time || new Date().toISOString(),
        account: ed.account || null,
        suggestedAccount: null,
        fromAccount: null,
        isSelfTransfer: false,
        payment_method: ed.payment_method || (parsedAdminFee > 0 ? 'Transfer bank' : null)
      };
      cardTitle = (parsedAdminFee > 0 && txData.type === 'EXPENSE')
        ? 'PENGELUARAN DENGAN BIAYA ADMIN'
        : 'PENCATATAN KEUANGAN BARU';
    }
    const confirmMsg = await financeEngine.requestTransactionConfirmation(txData, cardTitle, null, { telegramSent: true });
    if (confirmMsg) {
      const cleanMerch = (txData.destination || txData.merchant || 'Unknown').toLowerCase().replace(/[^a-z0-9]/g, '');
      const cKey = `${txData.nominal}_${cleanMerch}`;
      await supabaseMemories.markPendingTransactionSent(cKey).catch(() => {});
      return confirmMsg;
    }
    return '⚠️ Transaksi ini tampaknya sudah pernah dicatat sebelumnya (duplikat) atau sedang menunggu konfirmasi.';
  }

  return domainReply;
}

module.exports = {
  handleFinanceIntent
};
