const { createClient } = require('@supabase/supabase-js');
const env = require('../config/env');

// Initialize only if URL and KEY are provided to avoid crashing on empty .env
const supabase = (env.SUPABASE_URL && env.SUPABASE_KEY) 
  ? createClient(env.SUPABASE_URL, env.SUPABASE_KEY)
  : null;

const SUPABASE_TABLES = [
  'nexa_chat_memories',
  'nexa_finance_dedup',
  'nexa_user_profile',
  'nexa_core_identity',
  'nexa_2nd_brain'
];

function resolveAllowedTableName(tableName) {
  const normalized = String(tableName || '').trim().toLowerCase();
  if (SUPABASE_TABLES.includes(normalized)) return normalized;
  return null;
}

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
 * Save idea to 2nd Brain Vault (Syncs with Docs)
 * @param {string} ideaContent
 */
async function saveIdeaToVault(ideaContent) {
  if (!supabase) return;
  const { data, error } = await supabase
    .from('nexa_2nd_brain')
    .insert([{ content: ideaContent, created_at: new Date().toISOString() }]);

  if (error) {
    console.error('[SUPABASE] Error saving idea:', error.message);
    throw error;
  }
  return data;
}

/**
 * Save fact to User Profile
 */
async function saveUserProfile(content) {
  if (!supabase) return;
  const { error } = await supabase.from('nexa_user_profile').insert([{ content }]);
  if (error) console.error('[SUPABASE] Error saving user profile:', error.message);
}

/**
 * Delete from User Profile
 */
async function deleteFromUserProfile(searchKeyword) {
  if (!supabase || !searchKeyword) return false;
  const { data: rows } = await supabase.from('nexa_user_profile').select('id, content');
  if (!rows || rows.length === 0) return false;
  const targetIds = findMatchingIds(rows, searchKeyword);
  if (targetIds.length === 0) return false;
  const { error } = await supabase.from('nexa_user_profile').delete().in('id', targetIds);
  return !error;
}

/**
 * Save fact to Core Identity
 */
async function saveCoreIdentity(content) {
  if (!supabase) return;
  const { error } = await supabase.from('nexa_core_identity').insert([{ content }]);
  if (error) console.error('[SUPABASE] Error saving core identity:', error.message);
}

/**
 * Delete from Core Identity
 */
async function deleteFromCoreIdentity(searchKeyword) {
  if (!supabase || !searchKeyword) return false;
  const { data: rows } = await supabase.from('nexa_core_identity').select('id, content');
  if (!rows || rows.length === 0) return false;
  const targetIds = findMatchingIds(rows, searchKeyword);
  if (targetIds.length === 0) return false;
  const { error } = await supabase.from('nexa_core_identity').delete().in('id', targetIds);
  return !error;
}

/**
 * Delete idea or personal fact from 2nd Brain Vault by smart matching
 * @param {string} searchKeyword
 */
async function deleteIdeaFromVault(searchKeyword) {
  if (!supabase || !searchKeyword) return { success: false, deletedRows: [] };
  
  const { data: rows } = await supabase.from('nexa_2nd_brain').select('id, content');
  if (!rows || rows.length === 0) return { success: false, deletedRows: [] };

  const targetIds = findMatchingIds(rows, searchKeyword);
  if (targetIds.length === 0) return { success: false, deletedRows: [] };

  const { data, error } = await supabase
    .from('nexa_2nd_brain')
    .delete()
    .in('id', targetIds)
    .select();

  if (error) {
    console.error('[SUPABASE] Error deleting idea:', error.message);
    return { success: false, deletedRows: [] };
  }
  return { success: true, deletedRows: data || [] };
}

/**
 * Edit idea or personal fact in 2nd Brain Vault by smart matching
 * @param {string} searchKeyword
 * @param {string} newContent
 */
async function editIdeaInVault(searchKeyword, newContent) {
  if (!supabase || !searchKeyword || !newContent) return { success: false, editedRows: [] };

  const { data: rows } = await supabase.from('nexa_2nd_brain').select('id, content');
  if (!rows || rows.length === 0) return { success: false, editedRows: [] };

  const targetIds = findMatchingIds(rows, searchKeyword);
  if (targetIds.length === 0) return { success: false, editedRows: [] };

  const oldRows = rows.filter(r => targetIds.includes(r.id));

  // Edit the first matched row (or all, but usually we just want to edit one)
  const { data, error } = await supabase
    .from('nexa_2nd_brain')
    .update({ content: newContent })
    .in('id', targetIds)
    .select();

  if (error) {
    console.error('[SUPABASE] Error editing idea:', error.message);
    return { success: false, editedRows: [] };
  }
  return { success: true, editedRows: oldRows }; // Return the old rows so Docs can find and replace the OLD text
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
 * Now fetches from BOTH nexa_user_profile and nexa_core_identity.
 * @returns {Promise<string[]>} Array of fact strings
 */
async function getPersonalFacts() {
  if (!supabase) return [];
  
  const [profileRes, identityRes] = await Promise.all([
    supabase.from('nexa_user_profile').select('content').order('created_at', { ascending: true }),
    supabase.from('nexa_core_identity').select('content').order('created_at', { ascending: true })
  ]);

  const facts = [];
  if (profileRes.data) profileRes.data.forEach(r => facts.push(r.content));
  if (identityRes.data) identityRes.data.forEach(r => facts.push(r.content));

  return facts;
}

async function getDatabaseOverview() {
  if (!supabase) return { success: false, error: 'Supabase belum dikonfigurasi.' };

  const counts = {};
  for (const table of SUPABASE_TABLES) {
    const { count, error } = await supabase
      .from(table)
      .select('*', { count: 'exact', head: true });
    if (error) {
      counts[table] = { error: error.message };
    } else {
      counts[table] = { count: count || 0 };
    }
  }

  return { success: true, tables: SUPABASE_TABLES, counts };
}

async function readDatabaseTable(tableName, { limit = 5, searchKeyword = '' } = {}) {
  if (!supabase) return { success: false, error: 'Supabase belum dikonfigurasi.' };
  const table = resolveAllowedTableName(tableName);
  if (!table) return { success: false, error: 'Nama tabel tidak valid atau tidak diizinkan.' };

  const cappedLimit = Math.min(Math.max(parseInt(limit, 10) || 5, 1), 20);
  let query = supabase
    .from(table)
    .select('*')
    .order('created_at', { ascending: false })
    .limit(cappedLimit);

  const keyword = String(searchKeyword || '').trim();
  if (keyword) {
    if (table === 'nexa_chat_memories') {
      query = query.or(`content.ilike.%${keyword}%,role.ilike.%${keyword}%`);
    } else if (table === 'nexa_finance_dedup') {
      query = query.or(`composite_key.ilike.%${keyword}%,source.ilike.%${keyword}%`);
    } else {
      query = query.ilike('content', `%${keyword}%`);
    }
  }

  const { data, error } = await query;
  if (error) return { success: false, error: error.message };
  return { success: true, table, rows: data || [] };
}

async function insertDatabaseRow(tableName, rowData = {}) {
  if (!supabase) return { success: false, error: 'Supabase belum dikonfigurasi.' };
  const table = resolveAllowedTableName(tableName);
  if (!table) return { success: false, error: 'Nama tabel tidak valid atau tidak diizinkan.' };

  const payload = {};
  if (table === 'nexa_chat_memories') {
    payload.role = String(rowData.role || 'user').slice(0, 50);
    payload.content = String(rowData.content || '').trim();
    payload.created_at = new Date().toISOString();
    if (!payload.content) return { success: false, error: 'Field content wajib diisi.' };
  } else if (table === 'nexa_finance_dedup') {
    payload.composite_key = String(rowData.composite_key || '').trim();
    payload.transaction_time = rowData.transaction_time || new Date().toISOString();
    payload.source = String(rowData.source || 'MANUAL');
    if (!payload.composite_key) return { success: false, error: 'Field composite_key wajib diisi.' };
  } else {
    payload.content = String(rowData.content || '').trim();
    payload.created_at = new Date().toISOString();
    if (!payload.content) return { success: false, error: 'Field content wajib diisi.' };
  }

  const { data, error } = await supabase.from(table).insert([payload]).select();
  if (error) return { success: false, error: error.message };
  return { success: true, table, row: data?.[0] || null };
}

async function updateDatabaseRows(tableName, updateData = {}, { rowId, searchKeyword } = {}) {
  if (!supabase) return { success: false, error: 'Supabase belum dikonfigurasi.' };
  const table = resolveAllowedTableName(tableName);
  if (!table) return { success: false, error: 'Nama tabel tidak valid atau tidak diizinkan.' };

  const patch = {};
  if (table === 'nexa_chat_memories') {
    if (updateData.role) patch.role = String(updateData.role).slice(0, 50);
    if (updateData.content !== undefined) patch.content = String(updateData.content).trim();
  } else if (table === 'nexa_finance_dedup') {
    if (updateData.composite_key !== undefined) patch.composite_key = String(updateData.composite_key).trim();
    if (updateData.transaction_time !== undefined) patch.transaction_time = updateData.transaction_time;
    if (updateData.source !== undefined) patch.source = String(updateData.source);
  } else if (updateData.content !== undefined) {
    patch.content = String(updateData.content).trim();
  }

  if (Object.keys(patch).length === 0) {
    return { success: false, error: 'Tidak ada field update yang valid.' };
  }

  let query = supabase.from(table).update(patch).select();
  const idNum = parseInt(rowId, 10);
  if (!isNaN(idNum) && idNum > 0) {
    query = query.eq('id', idNum);
  } else if (searchKeyword) {
    const keyword = String(searchKeyword).trim();
    if (table === 'nexa_chat_memories') {
      query = query.or(`content.ilike.%${keyword}%,role.ilike.%${keyword}%`);
    } else if (table === 'nexa_finance_dedup') {
      query = query.or(`composite_key.ilike.%${keyword}%,source.ilike.%${keyword}%`);
    } else {
      query = query.ilike('content', `%${keyword}%`);
    }
  } else {
    return { success: false, error: 'Untuk update, berikan row_id atau search_keyword.' };
  }

  const { data, error } = await query;
  if (error) return { success: false, error: error.message };
  return { success: true, table, updatedRows: data || [] };
}

async function deleteDatabaseRows(tableName, { rowId, searchKeyword } = {}) {
  if (!supabase) return { success: false, error: 'Supabase belum dikonfigurasi.' };
  const table = resolveAllowedTableName(tableName);
  if (!table) return { success: false, error: 'Nama tabel tidak valid atau tidak diizinkan.' };

  let query = supabase.from(table).delete().select();
  const idNum = parseInt(rowId, 10);
  if (!isNaN(idNum) && idNum > 0) {
    query = query.eq('id', idNum);
  } else if (searchKeyword) {
    const keyword = String(searchKeyword).trim();
    if (table === 'nexa_chat_memories') {
      query = query.or(`content.ilike.%${keyword}%,role.ilike.%${keyword}%`);
    } else if (table === 'nexa_finance_dedup') {
      query = query.or(`composite_key.ilike.%${keyword}%,source.ilike.%${keyword}%`);
    } else {
      query = query.ilike('content', `%${keyword}%`);
    }
  } else {
    return { success: false, error: 'Untuk delete, berikan row_id atau search_keyword.' };
  }

  const { data, error } = await query;
  if (error) return { success: false, error: error.message };
  return { success: true, table, deletedRows: data || [] };
}

async function saveVaultItem(item) {
  if (!supabase) return { success: false, error: 'Supabase belum dikonfigurasi.' };
  if (!item || !item.drive_file_id) return { success: false, error: 'drive_file_id wajib.' };

  const payload = {
    drive_file_id: String(item.drive_file_id),
    drive_web_view_link: item.drive_web_view_link ? String(item.drive_web_view_link) : null,
    file_name: item.file_name ? String(item.file_name) : null,
    mime_type: item.mime_type ? String(item.mime_type) : null,
    category: item.category ? String(item.category) : null,
    telegram_file_id: item.telegram_file_id ? String(item.telegram_file_id) : null,
    source: item.source ? String(item.source) : 'TELEGRAM',
    ocr_text: item.ocr_text ? String(item.ocr_text) : null,
    created_at: new Date().toISOString()
  };

  const { data, error } = await supabase.from('nexa_vault_items').insert([payload]).select();
  if (error) return { success: false, error: error.message };
  return { success: true, row: data?.[0] || null };
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
  saveUserProfile,
  deleteFromUserProfile,
  saveCoreIdentity,
  deleteFromCoreIdentity,
  getPersonalFacts,
  getDatabaseOverview,
  readDatabaseTable,
  insertDatabaseRow,
  updateDatabaseRows,
  deleteDatabaseRows,
  saveVaultItem
};
