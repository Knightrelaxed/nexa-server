'use strict';
/**
 * finance_db/index.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Public API for Supabase Finance Subsystem
 * Aggregates client, reference cache/resolvers, transactions, analytics,
 * budgets, and recurring rules.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const { supabaseFinance } = require('./client');
const referenceData = require('./reference_data');
const transactions = require('./transactions');
const analytics = require('./analytics');
const budgets = require('./budgets');
const recurring = require('./recurring');

module.exports = {
  // Client
  supabaseFinance,

  // Reference Data & Resolvers
  ...referenceData,

  // Transactions CRUD
  ...transactions,

  // Analytics & Reports
  ...analytics,

  // Budgets
  ...budgets,

  // Recurring Rules
  ...recurring,

  // Backwards compatibility helper for Split_Engine
  _getClient: () => supabaseFinance,
};
