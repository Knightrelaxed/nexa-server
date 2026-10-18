'use strict';
// ============================================================
// N.E.X.A — CLI INTENT DISPATCHER (Modular & Unified)
// Delegates domain execution to src/interfaces/common/
// ============================================================

const { executeDomainIntent } = require('../common/domain_dispatcher');
const helpers                 = require('../common/helpers');
const {
  cliPendingCalendar,
  cliPendingConflict,
  cliPendingEmail,
  cliPendingDatabase,
  triggerConversationalSynthesis
} = require('./interceptors');

const pushToCli = (msg) => {
  try {
    const adapter = require('./adapter');
    if (typeof adapter.pushToCli === 'function') {
      return adapter.pushToCli(msg);
    }
  } catch (_) {}
  return false;
};

/**
 * Dispatches intent routing to common domain services for CLI
 * @param {string} intent 
 * @param {object} routingData 
 * @param {string} textInput 
 * @param {string} sessionId 
 * @returns {Promise<string|null>}
 */
async function dispatchCliIntent(intent, routingData, textInput, sessionId) {
  const context = {
    textInput,
    sessionKey: sessionId,
    platform: 'cli',
    pendingCalendar: cliPendingCalendar,
    pendingConflict: cliPendingConflict,
    pendingEmail: cliPendingEmail,
    pendingDatabase: cliPendingDatabase,
    notifyClient: pushToCli,
    triggerSynthesis: triggerConversationalSynthesis,
    emailDefaults: {
      defaultQuery: 'livin OR from:noreply.livin@bankmandiri.co.id',
      defaultFetch: 20
    }
  };

  return await executeDomainIntent(intent, routingData, context);
}

module.exports = {
  stripHtml: helpers.stripHtml,
  isFactAboutNexa: helpers.isFactAboutNexa,
  classifySelfModelLayer: helpers.classifySelfModelLayer,
  extractFinanceTxFromEmails: helpers.extractFinanceTransactionsFromEmails,
  dispatchCliIntent,
  _isFactAboutNexa: helpers.isFactAboutNexa,
  _classifySelfModelLayer: helpers.classifySelfModelLayer,
  _extractFinanceTxFromEmails: helpers.extractFinanceTransactionsFromEmails,
  _dispatchIntent: dispatchCliIntent,
  _stripHtml: helpers.stripHtml
};
