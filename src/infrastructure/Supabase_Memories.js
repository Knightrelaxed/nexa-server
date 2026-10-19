/**
 * ============================================================
 * [N.E.X.A] Supabase_Memories.js — FACADE
 * ============================================================
 * Implementasi dipecah ke src/infrastructure/memories/*. File ini hanya mengekspor ulang seluruh simbol
 * dengan NAMA dan URUTAN identik dengan versi monolit (kontrak publik tidak berubah; 69 ekspor).
 * Pemanggil luar tetap memakai:  const supabaseMemories = require('.../Supabase_Memories');
 * ============================================================
 */
const client = require('./memories/Memory_Client');
const living = require('./memories/Memory_Living');
const chat = require('./memories/Memory_Chat');
const financeDedup = require('./memories/Memory_Finance_Dedup');
const vault = require('./memories/Memory_Vault');
const identity = require('./memories/Memory_Identity');
const selfModel = require('./memories/Memory_Self_Model');
const learning = require('./memories/Memory_Learning');
const chrono = require('./memories/Memory_Chrono');
const dbBrowser = require('./memories/Memory_Db_Browser');

module.exports = {
  supabase: client.supabase,
  recordLearningEvent: learning.recordLearningEvent,
  getUnprocessedLearningEvents: learning.getUnprocessedLearningEvents,
  markLearningEventsProcessed: learning.markLearningEventsProcessed,
  buildIdentityTraitPayload: identity.buildIdentityTraitPayload,
  bumpPlaybookCounters: learning.bumpPlaybookCounters,
  incrementLearningEventAttempts: learning.incrementLearningEventAttempts,
  countMicroReviewRunsToday: learning.countMicroReviewRunsToday,
  recordMicroReviewRun: learning.recordMicroReviewRun,
  getActivePlaybook: learning.getActivePlaybook,
  getAllActivePlaybooks: learning.getAllActivePlaybooks,
  upsertPlaybook: learning.upsertPlaybook,
  searchPastChats: chat.searchPastChats,
  saveChatMemory: chat.saveChatMemory,
  getRecentMemories: chat.getRecentMemories,
  getTodayMemories: chat.getTodayMemories,
  getYesterdayMemories: chat.getYesterdayMemories,
  isDuplicateTransaction: financeDedup.isDuplicateTransaction,
  logTransactionKey: financeDedup.logTransactionKey,
  cleanupOldFinanceDedup: financeDedup.cleanupOldFinanceDedup,
  saveIdeaToVault: vault.saveIdeaToVault,
  deleteIdeaFromVault: vault.deleteIdeaFromVault,
  editIdeaInVault: vault.editIdeaInVault,
  saveUserProfile: identity.saveUserProfile,
  deleteFromUserProfile: identity.deleteFromUserProfile,
  saveCoreIdentity: identity.saveCoreIdentity,
  deleteFromCoreIdentity: identity.deleteFromCoreIdentity,
  getPersonalFacts: identity.getPersonalFacts,
  saveMemoryWithMeta: living.saveMemoryWithMeta,
  getAllActiveMemories: living.getAllActiveMemories,
  archiveMemoryById: living.archiveMemoryById,
  bulkArchiveMemories: living.bulkArchiveMemories,
  reinforceMemoryById: living.reinforceMemoryById,
  getStagedForPruning: living.getStagedForPruning,
  getDatabaseOverview: dbBrowser.getDatabaseOverview,
  readDatabaseTable: dbBrowser.readDatabaseTable,
  insertDatabaseRow: dbBrowser.insertDatabaseRow,
  updateDatabaseRows: dbBrowser.updateDatabaseRows,
  deleteDatabaseRows: dbBrowser.deleteDatabaseRows,
  deleteAllDatabaseRows: dbBrowser.deleteAllDatabaseRows,
  saveVaultItem: vault.saveVaultItem,
  updateVaultItemById: vault.updateVaultItemById,
  savePendingTransaction: financeDedup.savePendingTransaction,
  getPendingTransactions: financeDedup.getPendingTransactions,
  deletePendingTransaction: financeDedup.deletePendingTransaction,
  markPendingTransactionSent: financeDedup.markPendingTransactionSent,
  getIdentityModel: identity.getIdentityModel,
  upsertIdentityTrait: identity.upsertIdentityTrait,
  deleteIdentityTrait: identity.deleteIdentityTrait,
  saveIdentityProposal: identity.saveIdentityProposal,
  getPendingIdentityProposals: identity.getPendingIdentityProposals,
  getStagedIdentityProposals: identity.getStagedIdentityProposals,
  setProposalTelegramMessageId: identity.setProposalTelegramMessageId,
  approveIdentityProposal: identity.approveIdentityProposal,
  rejectIdentityProposal: identity.rejectIdentityProposal,
  getIdentityProposalById: identity.getIdentityProposalById,
  upsertSelfModelTrait: selfModel.upsertSelfModelTrait,
  updateSelfModelTraitByKey: selfModel.updateSelfModelTraitByKey,
  getSelfModel: selfModel.getSelfModel,
  getSelfModelByLayer: selfModel.getSelfModelByLayer,
  deleteFromSelfModel: selfModel.deleteFromSelfModel,
  getCandidateDatesToConsolidate: chrono.getCandidateDatesToConsolidate,
  getChatsForDateWib: chrono.getChatsForDateWib,
  saveDailyNarrative: chrono.saveDailyNarrative,
  pruneRawChatsByIds: chrono.pruneRawChatsByIds,
  getDailyNarrativeByDate: chrono.getDailyNarrativeByDate,
  searchDailyNarratives: chrono.searchDailyNarratives,
  searchRawChats: chrono.searchRawChats,
  toWibDateString: chrono.toWibDateString
};
