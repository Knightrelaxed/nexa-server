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

  if (action === 'UNDO_DELETE') {
    const result = await financeEngine.undoDeleteTransaction();
    return result.message;
  }

  if (action === 'CONFIRM_TRANSACTION') {
    const confirmationReply = await financeEngine.confirmPendingTransactions(true, ed.description || null, ed.category || null, null, null, null);
    return confirmationReply || '✅ Tidak ada transaksi yang tertunda. Kemungkinan transaksi telah disimpan otomatis karena melewati batas waktu 5 menit.';
  }

  if (action === 'UPDATE_PENDING') {
    const dtInfo = require('../../../domain/finance/Finance_Helpers')._parseDateTimeExpression(ed.time || ed.date_text || textInput);
    const dateISO = dtInfo?.dateISO || null;
    const timeHHMM = dtInfo?.timeHHMM || null;

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

    // Fallback: If pending confirmation timed out (already saved) or user quoted a previous message, edit committed transaction
    let kw = ed.search_keyword;
    if (!kw || /^(ini|itu|transaksi|kategori|perbaiki|ubah|sesuaikan|yang|saya|\s)*$/i.test(String(kw).trim())) {
      const replyMsgText = context.message?.reply_to_message?.text || null;
      if (replyMsgText) {
        const cMatch = replyMsgText.match(/(?:Deskripsi|Catatan|Tujuan|Merchant)\s*:\s*([^\n\r,]{2,80})/i);
        const nLabelMatch = replyMsgText.match(/Nominal\s*\([Rr][Pp]\)\s*:\s*[Rr][Pp][.\s]*([0-9][0-9.,]+)/i);
        const nRpMatch = replyMsgText.match(/[Rr][Pp]\.?\s*([0-9][0-9.,]+)/);
        if (cMatch && cMatch[1] && cMatch[1].trim().length > 1) {
          kw = cMatch[1].trim();
        } else if (nLabelMatch && nLabelMatch[1]) {
          kw = nLabelMatch[1].replace(/[^0-9]/g, '');
        } else if (nRpMatch && nRpMatch[1]) {
          kw = nRpMatch[1].replace(/[^0-9]/g, '');
        } else {
          kw = 'latest';
        }
      } else {
        kw = 'latest';
      }
    }
    const editRes = await financeEngine.editTransaction(
      kw || 'latest',
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
    return '❌ Tidak ada transaksi yang tertunda atau cocok untuk diubah.';
  }

  if (action === 'CANCEL_TRANSACTION') {
    const confirmationReply = await financeEngine.confirmPendingTransactions(false, null, null, null, null, null);
    return confirmationReply || 'Tidak ada transaksi yang tertunda.';
  }

  if (action === 'EDIT') {
    const dtInfo = require('../../../domain/finance/Finance_Helpers')._parseDateTimeExpression(ed.time || ed.date_text || textInput);
    const dateISO = dtInfo?.dateISO || null;
    const timeHHMM = dtInfo?.timeHHMM || null;

    let kw = ed.search_keyword;
    if (!kw || /^(ini|itu|transaksi|kategori|perbaiki|ubah|sesuaikan|yang|saya|\s)*$/i.test(String(kw).trim())) {
      const replyMsgText = context.message?.reply_to_message?.text || null;
      if (replyMsgText) {
        const cMatch = replyMsgText.match(/(?:Deskripsi|Catatan|Tujuan|Merchant)\s*:\s*([^\n\r,]{2,80})/i);
        const nLabelMatch = replyMsgText.match(/Nominal\s*\([Rr][Pp]\)\s*:\s*[Rr][Pp][.\s]*([0-9][0-9.,]+)/i);
        const nRpMatch = replyMsgText.match(/[Rr][Pp]\.?\s*([0-9][0-9.,]+)/);
        if (cMatch && cMatch[1] && cMatch[1].trim().length > 1) {
          kw = cMatch[1].trim();
        } else if (nLabelMatch && nLabelMatch[1]) {
          kw = nLabelMatch[1].replace(/[^0-9]/g, '');
        } else if (nRpMatch && nRpMatch[1]) {
          kw = nRpMatch[1].replace(/[^0-9]/g, '');
        } else {
          kw = 'latest';
        }
      } else {
        kw = 'latest';
      }
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
      const confirmMsg = await financeEngine.requestTransactionConfirmation(txData, 'PENCATATAN KEUANGAN BARU');
      if (confirmMsg) {
        replies.push(confirmMsg);
        const cleanMerch = (txData.destination || txData.merchant || 'Unknown').toLowerCase().replace(/[^a-z0-9]/g, '');
        const cKey = `${txData.nominal}_${cleanMerch}`;
        supabaseMemories.markPendingTransactionSent(cKey).catch(() => {});
      } else {
        replies.push(`⚠️ Transaksi ${txData.nominal} ke ${txData.destination} tampaknya sudah dicatat atau tertunda.`);
      }
    }
    return replies.join('\n\n---\n\n');
  }

  if (ed.nominal || action === 'RECORD') {
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

    const parsedNominal = typeof ed.nominal === 'number'
      ? ed.nominal
      : (ed.nominal ? require('../../../domain/finance/Finance_Helpers')._parseFlexibleCurrency(String(ed.nominal)) : 0);
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
    const confirmMsg = await financeEngine.requestTransactionConfirmation(txData, cardTitle);
    if (confirmMsg) {
      const cleanMerch = (txData.destination || txData.merchant || 'Unknown').toLowerCase().replace(/[^a-z0-9]/g, '');
      const cKey = `${txData.nominal}_${cleanMerch}`;
      supabaseMemories.markPendingTransactionSent(cKey).catch(() => {});
      return confirmMsg;
    }
    return '⚠️ Transaksi ini tampaknya sudah pernah dicatat sebelumnya (duplikat) atau sedang menunggu konfirmasi.';
  }

  return domainReply;
}

module.exports = {
  handleFinanceIntent
};
