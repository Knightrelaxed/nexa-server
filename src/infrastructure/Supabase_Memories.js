const { createClient } = require('@supabase/supabase-js');
const env = require('../config/env');

// Initialize only if URL and KEY are provided to avoid crashing on empty .env
const supabase = (env.SUPABASE_URL && env.SUPABASE_KEY) 
  ? createClient(env.SUPABASE_URL, env.SUPABASE_KEY)
  : null;

/**
 * Save user chat memory for Contextual Retrieval
 */
async function saveChatMemory(role, content) {
  if (!supabase) return;
  const { data, error } = await supabase
    .from('nexa_chat_memories')
    .insert([{ role, content, created_at: new Date().toISOString() }]);

  if (error) console.error('[SUPABASE] Error saving chat memory:', error.message);
  return data;
}

/**
 * Get last N chat memories for state awareness
 */
async function getRecentMemories(limit = 10) {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('nexa_chat_memories')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('[SUPABASE] Error fetching memories:', error.message);
    return [];
  }
  return data.reverse();
}

/**
 * Check if a financial transaction is a duplicate using Composite Key
 * @param {string} compositeKey - e.g. "50000_Kopi Kenangan"
 * @param {Date} transactionTime 
 */
async function isDuplicateTransaction(compositeKey, transactionTime) {
  if (!supabase) return false;
  
  const timeMinus10 = new Date(transactionTime.getTime() - 10 * 60000).toISOString();
  const timePlus10 = new Date(transactionTime.getTime() + 10 * 60000).toISOString();

  const { data, error } = await supabase
    .from('nexa_finance_dedup')
    .select('id')
    .eq('composite_key', compositeKey)
    .gte('transaction_time', timeMinus10)
    .lte('transaction_time', timePlus10);

  if (error) {
    console.error('[SUPABASE] Error checking duplicate:', error.message);
    return false; 
  }

  return data && data.length > 0;
}

/**
 * Log a new transaction key to prevent future duplicates
 */
async function logTransactionKey(compositeKey, transactionTime, source) {
  if (!supabase) return;
  const { error } = await supabase
    .from('nexa_finance_dedup')
    .insert([{ 
      composite_key: compositeKey, 
      transaction_time: transactionTime.toISOString(),
      source 
    }]);

  if (error) console.error('[SUPABASE] Error logging transaction key:', error.message);
}

/**
 * Save idea or personal fact to 2nd Brain Vault
 * @param {string} ideaContent
 * @param {'IDEA'|'PERSONAL_FACT'} type
 */
async function saveIdeaToVault(ideaContent, type = 'IDEA') {
  if (!supabase) return;
  const { data, error } = await supabase
    .from('nexa_2nd_brain')
    .insert([{ content: ideaContent, type, created_at: new Date().toISOString() }]);

  if (error) {
    console.error('[SUPABASE] Error saving idea:', error.message);
    throw error;
  }
  return data;
}

/**
 * Delete idea or personal fact from 2nd Brain Vault by smart matching
 * @param {string} searchKeyword
 */
async function deleteIdeaFromVault(searchKeyword) {
  if (!supabase || !searchKeyword) return false;
  
  const { data: rows } = await supabase.from('nexa_2nd_brain').select('id, content');
  if (!rows || rows.length === 0) return false;

  const targetIds = findMatchingIds(rows, searchKeyword);
  if (targetIds.length === 0) return false;

  const { error } = await supabase
    .from('nexa_2nd_brain')
    .delete()
    .in('id', targetIds);

  if (error) {
    console.error('[SUPABASE] Error deleting idea:', error.message);
    return false;
  }
  return true;
}

/**
 * Edit idea or personal fact in 2nd Brain Vault by smart matching
 * @param {string} searchKeyword
 * @param {string} newContent
 */
async function editIdeaInVault(searchKeyword, newContent) {
  if (!supabase || !searchKeyword || !newContent) return false;

  const { data: rows } = await supabase.from('nexa_2nd_brain').select('id, content');
  if (!rows || rows.length === 0) return false;

  const targetIds = findMatchingIds(rows, searchKeyword);
  if (targetIds.length === 0) return false;

  // Edit the first matched row (or all, but usually we just want to edit one)
  const { error } = await supabase
    .from('nexa_2nd_brain')
    .update({ content: newContent })
    .in('id', targetIds);

  if (error) {
    console.error('[SUPABASE] Error editing idea:', error.message);
    return false;
  }
  return true;
}

/**
 * Smart matcher for IDs, ranges, or keywords
 */
function findMatchingIds(rows, searchKeyword) {
  const sk = String(searchKeyword).toLowerCase().trim();
  const targetIds = new Set();

  // 1. Check if it's an exact ID number
  if (!isNaN(sk)) {
    targetIds.add(parseInt(sk));
    return Array.from(targetIds);
  }

  // 2. Check if it's a range like "10 sampai 16" or "10-16"
  const rangeMatch = sk.match(/^(\d+)\s*(sampai|-|to)\s*(\d+)$/);
  if (rangeMatch) {
    const start = parseInt(rangeMatch[1]);
    const end = parseInt(rangeMatch[3]);
    for (let i = Math.min(start, end); i <= Math.max(start, end); i++) {
      targetIds.add(i);
    }
    return Array.from(targetIds);
  }
  
  // 3. Fallback: Check if it mentions "id 18" or "nomor 18"
  const idMatch = sk.match(/(?:id|nomor|no)\s*(\d+)/);
  if (idMatch) {
    targetIds.add(parseInt(idMatch[1]));
    return Array.from(targetIds);
  }

  // 4. Fallback: Keyword splitting
  const keywords = sk.split(' ').filter(w => w.length > 2);
  rows.forEach(r => {
    const contentLower = (r.content || '').toLowerCase();
    if (keywords.length > 0 && keywords.every(kw => contentLower.includes(kw))) {
      targetIds.add(r.id);
    }
  });

  return Array.from(targetIds);
}

/**
 * Fetch all PERSONAL_FACT entries from the vault.
 * Used by AI_Router to inject long-term personal context.
 * @returns {Promise<string[]>} Array of fact strings
 */
async function getPersonalFacts() {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('nexa_2nd_brain')
    .select('content')
    .eq('type', 'PERSONAL_FACT')
    .order('created_at', { ascending: true });

  if (error) {
    console.error('[SUPABASE] Error fetching personal facts:', error.message);
    return [];
  }
  return (data || []).map(row => row.content);
}

module.exports = {
  supabase,
  saveChatMemory,
  getRecentMemories,
  isDuplicateTransaction,
  logTransactionKey,
  saveIdeaToVault,
  deleteIdeaFromVault,
  editIdeaInVault,
  getPersonalFacts
};
