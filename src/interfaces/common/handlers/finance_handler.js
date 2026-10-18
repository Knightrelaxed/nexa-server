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
      : await gmailClient.getLatestEmails('livin OR from:noreply.livin@bankmandiri.co.id', 30);

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
    const hasFilter = ed.date_text || ed.search_keyword || ed.type || ed.category;
    if (hasFilter) {
      return await financeEngine.searchTransactions({
        date_text: ed.date_text || ed.time || null,
        keyword: ed.search_keyword || null,
        type: ed.type || null,
        category: ed.category || null,
        limit: ed.limit || 30
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
    const updatedMsg = await financeEngine.updatePendingTransaction(ed.description || null, ed.category || null, ed.nominal || null, ed.account || null, ed.payment_method || null, null);
    return updatedMsg || '❌ Tidak ada transaksi yang tertunda untuk diubah.';
  }

  if (action === 'CANCEL_TRANSACTION') {
    const confirmationReply = await financeEngine.confirmPendingTransactions(false, null, null, null, null, null);
    return confirmationReply || 'Tidak ada transaksi yang tertunda.';
  }

  if (action === 'EDIT') {
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
    const result = await financeEngine.editTransaction(kw, ed.nominal, ed.description || ed.destination, ed.category, ed.account, ed.payment_method);
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
    const txData = {
      nominal: ed.nominal,
      type: ed.type || 'EXPENSE',
      destination: ed.destination || ed.merchant || 'Unknown',
      category: ed.category || 'Uncategorized',
      description: ed.description || '-',
      time: ed.time || new Date().toISOString(),
      account: ed.account || null,
      payment_method: ed.payment_method || null
    };
    const confirmMsg = await financeEngine.requestTransactionConfirmation(txData, 'PENCATATAN KEUANGAN BARU');
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
