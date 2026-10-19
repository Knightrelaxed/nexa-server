'use strict';
/**
 * Finance_State - Shared in-memory state for pending confirmations (single source of truth).
 * Extracted from Finance_Engine.js (finance split). Behaviour is unchanged; Finance_Engine.js remains the public facade.
 */


// In-memory cache of pending confirmations (source of truth = Supabase)
// key: compositeKey, value: { tx, timeoutId }
const pendingConfirmations = new Map();

// Lock to prevent race conditions during auto-save
const processingKeys = new Set();

module.exports = {
  pendingConfirmations,
  processingKeys,
};
