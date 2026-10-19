'use strict';
/**
 * Finance_Engine - public facade. The implementation now lives in ./finance/:
 *   Finance_State.js           Shared in-memory state for pending confirmations (single source of truth).
 *   Finance_Helpers.js         Pure parsing/formatting helpers and the AI merchant categoriser.
 *   Finance_Ledger.js          Core transaction write path and read queries.
 *   Finance_Analytics.js       Financial reports: KPIs, period comparison, trends, saving rate.
 *   Finance_Corrections.js     Edit, delete (with confirmation) and undo of recorded transactions.
 *   Finance_Confirmations.js   Pending-confirmation lifecycle: request, edit, confirm, auto-save, recovery.
 *   Finance_Email_Sync.js      Gmail (Mandiri) mutation email polling and import.
 * The export surface below is unchanged, so no caller needs to change.
 */
const { getRecentTransactions, processTransaction, searchTransactions } = require('./finance/Finance_Ledger');
const { getAccountBalancesReport, getCategoryInsight, getDailyBalanceTrendReport, getDailyTrendReport, getFinanceAnalytics, getMonthlySummaryReport, getPeriodComparisonReport, getSavingRateReport, getSmartFinanceSummary, getTopExpensesReport } = require('./finance/Finance_Analytics');
const { _findBestTransactionMatch, confirmDeleteTransaction, editTransaction, getPendingDeletionsContext, requestDeleteConfirmation, undoDeleteTransaction } = require('./finance/Finance_Corrections');
const { pollFinanceEmails } = require('./finance/Finance_Email_Sync');
const { _buildConfirmationMessage, autoSaveFromWatchdog, confirmPendingTransactions, getPendingConfirmationsContext, recoverPendingTransactions, requestTransactionConfirmation, resolveTargetKeyFromSnippet, updatePendingTransaction } = require('./finance/Finance_Confirmations');
const { _autoCategorizeMerchant, _parseFlexibleCurrency } = require('./finance/Finance_Helpers');
const { pendingConfirmations } = require('./finance/Finance_State');

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
  pollFinanceEmails,
  confirmPendingTransactions,
  updatePendingTransaction,
  requestTransactionConfirmation,
  recoverPendingTransactions,
  _parseFlexibleCurrency,
  _autoCategorizeMerchant,
  // Exposed for Watchdog cron (cron.js)
  buildConfirmationMessage: _buildConfirmationMessage,
  autoSaveFromWatchdog,
  getPendingConfirmationsContext,
  resolveTargetKeyFromSnippet,
  // Exposed for Split_Engine & webhook.js split feature
  getPendingConfirmationsCount: () => pendingConfirmations.size,
  _findBestTransactionMatch,
};
