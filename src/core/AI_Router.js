/**
 * ============================================================
 * [N.E.X.A] AI_Router.js — FACADE
 * ============================================================
 * Implementasi dipecah ke src/core/router/*. File ini hanya mengekspor ulang seluruh simbol
 * dengan NAMA dan URUTAN identik dengan versi monolit, termasuk alias seperti selectUserProfileFacts (kontrak publik tidak berubah; 18 ekspor).
 * Pemanggil luar tetap memakai:  const aiRouter = require('.../AI_Router');
 * ============================================================
 */
const { detectTopicContext: _detectTopicContext } = require('./Topic_Classifier');
const cache = require('./router/Router_Cache');
const output = require('./router/Router_Output');
const classifier = require('./router/Router_Classifier');
const selectors = require('./router/Router_Selectors');
const prompts = require('./router/Router_Prompts');
const utilities = require('./router/Router_Utilities');
const dispatcher = require('./router/Router_Dispatcher');

module.exports = {
  routeUserMessage: dispatcher.routeUserMessage,
  invalidatePersonalFactsCache: cache.invalidatePersonalFactsCache,
  invalidateIdentityModelCache: cache.invalidateIdentityModelCache,
  invalidateSelfModelCache: cache.invalidateSelfModelCache,
  deduplicateAndSaveFact: utilities.deduplicateAndSaveFact,
  deduplicateAndSaveSelfFact: utilities.deduplicateAndSaveSelfFact,
  callAI: utilities.callAI,
  classifyPendingTransactionIntent: utilities.classifyPendingTransactionIntent,
  classifyYesNo: utilities.classifyYesNo,
  analyzeSystemLogs: utilities.analyzeSystemLogs,
  selectUserProfileFacts: selectors._selectUserProfileFacts,
  selectCoreIdentityFacts: selectors._selectCoreIdentityFacts,
  selectVaultFacts: selectors._selectVaultFacts,
  detectTopicContext: _detectTopicContext,
  buildIdentityContextBlock: prompts._buildIdentityContextBlock,
  buildRouterSystemPrompt: prompts.buildRouterSystemPrompt,
  detectCandidateDomains: classifier._detectCandidateDomains,
  isReflexMessage: classifier._isReflexMessage
};
