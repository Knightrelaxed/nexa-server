'use strict';
// ============================================================
// N.E.X.A — CENTRAL COMMON DOMAIN DISPATCHER
// Unified intent execution router for Telegram, CLI, and Mobile
// ============================================================

const { handleFinanceIntent }  = require('./handlers/finance_handler');
const { handleCalendarIntent } = require('./handlers/calendar_handler');
const { handleTaskIntent }     = require('./handlers/task_handler');
const { handleMemoryIntent }   = require('./handlers/memory_handler');
const { handleDatabaseIntent } = require('./handlers/database_handler');
const { handleEmailIntent }    = require('./handlers/email_handler');
const { handleSystemIntent }   = require('./handlers/system_handler');

/**
 * Executes domain intent using shared common handlers
 * @param {string} intent 
 * @param {object} routingData 
 * @param {object} context 
 * @returns {Promise<string|null>}
 */
async function executeDomainIntent(intent, routingData, context = {}) {
  const normIntent = String(intent || routingData?.intent || 'UNKNOWN').toUpperCase();

  switch (normIntent) {
    case 'FINANCE':
      return await handleFinanceIntent(routingData, context);

    case 'EDIT': {
      // Fallback edit intent redirected to finance handler
      const editRouting = {
        ...routingData,
        extracted_data: {
          action: 'EDIT',
          ...(routingData?.extracted_data || {})
        }
      };
      return await handleFinanceIntent(editRouting, context);
    }

    case 'CALENDAR':
      return await handleCalendarIntent(routingData, context);

    case 'TASK':
      return await handleTaskIntent(routingData, context);

    case '2ND_BRAIN':
    case 'USER_PROFILE':
    case 'CORE_IDENTITY':
      return await handleMemoryIntent(normIntent, routingData, context);

    case 'DATABASE':
      return await handleDatabaseIntent(routingData, context);

    case 'EMAIL':
      return await handleEmailIntent(routingData, context);

    case 'WEB_SEARCH':
    case 'DEVICE_CONTROL':
    case 'DIAGNOSE_SYSTEM':
    case 'DISCIPLINE':
    case 'LOCATION':
      return await handleSystemIntent(normIntent, routingData, context);

    default:
      return routingData?.reply_message || null;
  }
}

module.exports = {
  executeDomainIntent,
  dispatchDomainIntent: executeDomainIntent
};
