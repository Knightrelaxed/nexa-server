'use strict';
// ============================================================
// N.E.X.A — TELEGRAM INTENT DISPATCHER (Modular & Unified)
// Delegates domain execution to src/interfaces/common/
// ============================================================

const { executeDomainIntent }            = require('../common/domain_dispatcher');
const helpers                            = require('../common/helpers');
const emailHelpers                       = require('./email_helpers');
const { triggerConversationalSynthesis } = require('./interceptors');

/**
 * Dispatch single routing intent to appropriate domain logic.
 * @param {object} routingData 
 * @param {object} context 
 * @returns {Promise<string|null>}
 */
async function dispatchSingleIntent(routingData, context) {
  const { textInput } = context;

  const clarificationMessage = emailHelpers.getClarificationMessage(routingData, textInput);
  if (clarificationMessage) {
    return clarificationMessage;
  }

  const unifiedContext = {
    ...context,
    platform: 'telegram',
    sessionKey: context.chatId,
    triggerSynthesis: triggerConversationalSynthesis
  };

  return await executeDomainIntent(routingData.intent, routingData, unifiedContext);
}

module.exports = {
  isFactAboutNexa: helpers.isFactAboutNexa,
  classifySelfModelLayer: helpers.classifySelfModelLayer,
  extractFinanceTransactionsFromEmails: helpers.extractFinanceTransactionsFromEmails,
  dispatchSingleIntent,
  _isFactAboutNexa: helpers.isFactAboutNexa,
  _classifySelfModelLayer: helpers.classifySelfModelLayer,
  _extractFinanceTxFromEmails: helpers.extractFinanceTransactionsFromEmails
};
