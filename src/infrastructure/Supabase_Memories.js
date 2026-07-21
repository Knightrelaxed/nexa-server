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
  'nexa_2nd_brain',
  'nexa_vault_items',
  'nexa_pending_transactions',
  'nexa_behavior_log',         // [PHASE 6 — Pilar 8.2]
  'nexa_identity_model',       // [PHASE 6 — Cognitive Identity Layer]
  'nexa_identity_proposals'    // [PHASE 6 — Git-Style Proposal Staging]
];

function resolveAllowedTableName(tableName) {
  const normalized = String(tableName || '').trim().toLowerCase();
  if (SUPABASE_TABLES.includes(normalized)) return normalized;
  return null;
}

/**
 * Save user chat memory for Contextual Retrieval
 */
async function saveChatMemory(role, content, platform = 'telegram') {
  if (!supabase) return;
  const { data, error } = await supabase
    .from('nexa_chat_memories')
    .insert([{ role, content, platform: platform || 'telegram', created_at: new Date().toISOString() }]);

  if (error) console.error('[SUPABASE] Error saving chat memory:', error.message);
  return data;
}

/**
 * Get last N chat memories for state awareness (with Historical Null Handling)
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
  return (data || []).reverse().map(m => ({
    ...m,
    platform: m.platform || 'telegram'
  }));
}

/**
 * Check if a financial transaction is a duplicate using Composite Key
 * @param {string} compositeKey - e.g. "50000_Kopi Kenangan"
 * @param {Date} transactionTime 
 */
async function isDuplicateTransaction(compositeKey, transactionTime, checkPending = true) {
  if (!supabase) return false;
  
  // ── Gate 1: Check nexa_finance_dedup ─────────────────────────────────────
  // Dedup window: 60 minutes (1 jam). Same nominal+merchant is allowed on different hours.
  // This prevents double-recording from Finance Auto-Sync email re-polling and manual Telegram inputs,
  // but allows Tuan Faqih to record the same purchase (e.g. "Kopi Kenangan, Rp25.000") twice a day.
  const windowStart = new Date(transactionTime.getTime() - 60 * 60 * 1000).toISOString();
  const windowEnd   = new Date(transactionTime.getTime() + 60 * 60 * 1000).toISOString();

  const { data: dedupData, error: dedupError } = await supabase
    .from('nexa_finance_dedup')
    .select('id')
    .eq('composite_key', compositeKey)
    .gte('transaction_time', windowStart)
    .lte('transaction_time', windowEnd);

  if (dedupError) {
    console.error('[SUPABASE] Error checking duplicate:', dedupError.message);
    return false; 
  }

  if (dedupData && dedupData.length > 0) return true;

  if (!checkPending) return false;

  // ── Gate 2: Check nexa_pending_transactions ───────────────────────────────
  // Critical: a pending record exists when Telegram confirmation was queued
  // but the server restarted before the user responded. Without this check,
  // pollFinanceEmails would re-process the same email and write a DUPLICATE row
  // to the database because nexa_finance_dedup is only written AFTER save.
  try {
    const { data: pendingData, error: pendingError } = await supabase
      .from('nexa_pending_transactions')
      .select('composite_key')
      .eq('composite_key', compositeKey)
      .limit(1);

    if (pendingError) {
      console.warn('[SUPABASE] Error checking pending transactions for dedup:', pendingError.message);
    } else if (pendingData && pendingData.length > 0) {
      console.log(`[SUPABASE] Dedup via pending_transactions: ${compositeKey} already awaiting confirmation.`);
      return true;
    }
  } catch (e) {
    console.warn('[SUPABASE] Unexpected error in pending dedup check:', e.message);
  }

  return false;
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

  // 2. Check if it's a range like "10 sampai 16" or "10-16" anywhere in the text
  const rangeMatch = sk.match(/(\d+)\s*(sampai|-|to)\s*(\d+)/);
  if (rangeMatch) {
    const start = parseInt(rangeMatch[1], 10);
    const end = parseInt(rangeMatch[3], 10);
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
    // Use JSON.stringify so it works across all tables, even if they don't have a 'content' column
    const rowText = typeof r === 'object' ? JSON.stringify(r) : String(r);
    const contentLower = rowText.toLowerCase();
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
  if (!supabase) return { userProfile: [], coreIdentity: [], vaultItems: [] };
  
  const [profileRes, identityRes, vaultRes] = await Promise.all([
    supabase.from('nexa_user_profile').select('content').order('created_at', { ascending: true }),
    supabase.from('nexa_core_identity').select('content').order('created_at', { ascending: true }),
    supabase.from('nexa_vault_items').select('file_name, category, metadata_json, drive_web_view_link, status').order('created_at', { ascending: false }).limit(30)
  ]);

  const vaultItems = (vaultRes.data || []).map(item => {
    let metaStr = '';
    if (item.metadata_json && typeof item.metadata_json === 'object') {
      metaStr = Object.entries(item.metadata_json)
        .map(([k, v]) => `${k}: ${v}`)
        .join(', ');
    } else if (item.metadata_json) {
      metaStr = String(item.metadata_json);
    }
    return `[${item.category || 'ARSIP'} | Status: ${item.status || 'DRAFT'}] ${item.file_name || 'Dokumen'} — Metadata: ${metaStr || 'Tidak ada spesifik detail'} (Link Drive: ${item.drive_web_view_link || '-'})`;
  });

  return {
    userProfile: profileRes.data ? profileRes.data.map(r => r.content) : [],
    coreIdentity: identityRes.data ? identityRes.data.map(r => r.content) : [],
    vaultItems
  };
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
    payload.platform = String(rowData.platform || 'telegram').slice(0, 50);
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
    if (updateData.platform !== undefined) {
      patch.platform = updateData.platform ? String(updateData.platform).slice(0, 50) : null;
    }
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
  const combinedKeyword = String(searchKeyword || '').trim() || String(rowId || '').trim();
  if (combinedKeyword) {
    // USE SMART MATCHER FOR EVERYTHING
    const { data: rows } = await supabase.from(table).select('*');
    const targetIds = findMatchingIds(rows || [], combinedKeyword);
    if (targetIds.length === 0) return { success: false, error: 'Tidak ada baris yang cocok.' };
    query = query.in('id', targetIds);
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
  const combinedKeyword = String(searchKeyword || '').trim() || String(rowId || '').trim();
  if (combinedKeyword) {
    // USE SMART MATCHER FOR EVERYTHING
    const { data: rows } = await supabase.from(table).select('*');
    const targetIds = findMatchingIds(rows || [], combinedKeyword);
    if (targetIds.length === 0) return { success: false, error: 'Tidak ada baris yang cocok.' };
    query = query.in('id', targetIds);
  } else {
    return { success: false, error: 'Untuk delete, berikan row_id atau search_keyword.' };
  }

  const { data, error } = await query;
  if (error) return { success: false, error: error.message };
  return { success: true, table, deletedRows: data || [] };
}

async function deleteAllDatabaseRows(tableName) {
  if (!supabase) return { success: false, error: 'Supabase belum dikonfigurasi.' };
  const table = resolveAllowedTableName(tableName);
  if (!table) return { success: false, error: 'Nama tabel tidak valid atau tidak diizinkan.' };

  // To delete all rows safely, we can do a .neq('id', 0) since IDs are generally > 0
  // Or we can just use .not('id', 'is', null)
  const { data, error } = await supabase.from(table).delete().not('id', 'is', null).select();
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
    status: item.status ? String(item.status) : 'DRAFT',
    metadata_json: item.metadata_json || null,
    ocr_text: item.ocr_text ? String(item.ocr_text) : null,
    confirmed_at: item.confirmed_at || null,
    created_at: new Date().toISOString()
  };

  const { data, error } = await supabase.from('nexa_vault_items').insert([payload]).select();
  if (error) return { success: false, error: error.message };
  return { success: true, row: data?.[0] || null };
}

async function updateVaultItemById(id, patch = {}) {
  if (!supabase) return { success: false, error: 'Supabase belum dikonfigurasi.' };
  const idNum = parseInt(id, 10);
  if (isNaN(idNum) || idNum <= 0) return { success: false, error: 'ID vault tidak valid.' };

  const safePatch = {};
  if (patch.file_name !== undefined) safePatch.file_name = patch.file_name ? String(patch.file_name) : null;
  if (patch.category !== undefined) safePatch.category = patch.category ? String(patch.category) : null;
  if (patch.status !== undefined) safePatch.status = String(patch.status);
  if (patch.metadata_json !== undefined) safePatch.metadata_json = patch.metadata_json;
  if (patch.ocr_text !== undefined) safePatch.ocr_text = patch.ocr_text ? String(patch.ocr_text) : null;
  if (patch.confirmed_at !== undefined) safePatch.confirmed_at = patch.confirmed_at;

  if (Object.keys(safePatch).length === 0) return { success: false, error: 'Patch kosong.' };

  const { data, error } = await supabase
    .from('nexa_vault_items')
    .update(safePatch)
    .eq('id', idNum)
    .select();

  if (error) return { success: false, error: error.message };
  return { success: true, row: data?.[0] || null };
}

/**
 * Save a pending transaction to Supabase (survives server restarts)
 */
async function savePendingTransaction(compositeKey, txData, telegramSent = false) {
  if (!supabase) return;
  const { error } = await supabase
    .from('nexa_pending_transactions')
    .upsert([{
      composite_key: compositeKey,
      tx_data: txData,
      telegram_sent: telegramSent,
      created_at: new Date().toISOString()
    }], { onConflict: 'composite_key' });
  if (error) console.error('[SUPABASE] Error saving pending transaction:', error.message);
}

/**
 * Get all pending transactions (for recovery after server restart)
 */
async function getPendingTransactions() {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('nexa_pending_transactions')
    .select('*')
    .order('created_at', { ascending: true });
  if (error) {
    console.error('[SUPABASE] Error fetching pending transactions:', error.message);
    return [];
  }
  return data || [];
}

/**
 * Delete a resolved/cancelled pending transaction from Supabase
 */
async function deletePendingTransaction(compositeKey) {
  if (!supabase) return;
  const { error } = await supabase
    .from('nexa_pending_transactions')
    .delete()
    .eq('composite_key', compositeKey);
  if (error) console.error('[SUPABASE] Error deleting pending transaction:', error.message);
}

/**
 * Mark a pending transaction as telegram_sent = true
 */
async function markPendingTransactionSent(compositeKey) {
  if (!supabase) return;
  const { error } = await supabase
    .from('nexa_pending_transactions')
    .update({ telegram_sent: true })
    .eq('composite_key', compositeKey);
  if (error) console.error('[SUPABASE] Error marking pending transaction as sent:', error.message);
}

// ============================================================
// PHASE 6 — COGNITIVE IDENTITY ENGINE: Identity Model CRUD
// ============================================================

/**
 * Mengambil seluruh identitas yang sudah terkonfirmasi dari nexa_identity_model.
 * Dapat difilter per layer, atau ambil semua.
 * @param {string|null} layer - Opsional. Jika diisi, hanya ambil layer tersebut.
 * @returns {Promise<Array>} Array of identity trait objects.
 */
async function getIdentityModel(layer = null) {
  if (!supabase) return [];
  let query = supabase
    .from('nexa_identity_model')
    .select('*')
    .order('layer', { ascending: true })
    .order('updated_at', { ascending: false });

  if (layer) {
    query = query.eq('layer', layer.toUpperCase());
  }

  const { data, error } = await query;
  if (error) {
    console.error('[IDENTITY] Error fetching identity model:', error.message);
    return [];
  }
  return data || [];
}

/**
 * Menyimpan atau memperbarui satu trait di nexa_identity_model.
 * Menggunakan UPSERT agar trait_key yang sama per layer tidak duplikat.
 * Dipanggil HANYA saat Tuan Faqih menekan tombol APPROVE pada proposal.
 * @param {object} trait - { layer, trait_key, trait_value, confidence, inferred_from_summary }
 */
async function upsertIdentityTrait(trait) {
  if (!supabase) return { success: false, error: 'Supabase belum dikonfigurasi.' };
  if (!trait.layer || !trait.trait_key || !trait.trait_value) {
    return { success: false, error: 'Field layer, trait_key, dan trait_value wajib diisi.' };
  }

  const payload = {
    layer: String(trait.layer).toUpperCase(),
    trait_key: String(trait.trait_key).toLowerCase().trim(),
    trait_value: String(trait.trait_value).trim(),
    confidence: parseFloat(trait.confidence) || 0.90,
    inferred_from_summary: trait.inferred_from_summary ? String(trait.inferred_from_summary) : null,
    last_reinforced_at: trait.last_reinforced_at || new Date().toISOString(), // [PHASE 7 M1] Reset decay clock
    updated_at: new Date().toISOString()
  };

  const { data, error } = await supabase
    .from('nexa_identity_model')
    .upsert([payload], { onConflict: 'layer,trait_key' })
    .select();

  if (error) {
    console.error('[IDENTITY] Error upserting identity trait:', error.message);
    return { success: false, error: error.message };
  }
  return { success: true, row: data?.[0] || null };
}

/**
 * Menghapus satu trait dari nexa_identity_model berdasarkan layer dan trait_key.
 * @param {string} layer
 * @param {string} traitKey
 */
async function deleteIdentityTrait(layer, traitKey) {
  if (!supabase) return { success: false, error: 'Supabase belum dikonfigurasi.' };

  const { error } = await supabase
    .from('nexa_identity_model')
    .delete()
    .eq('layer', String(layer).toUpperCase())
    .eq('trait_key', String(traitKey).toLowerCase().trim());

  if (error) {
    console.error('[IDENTITY] Error deleting identity trait:', error.message);
    return { success: false, error: error.message };
  }
  return { success: true };
}

// ============================================================
// PHASE 6 — COGNITIVE IDENTITY ENGINE: Identity Proposals CRUD
// ============================================================

/**
 * Menyimpan satu proposal hipotesis baru dari Inference Engine ke staging.
 * Status awal: 'STAGED' jika confidence 60-85%, 'PENDING' jika >85%.
 * @param {object} proposal - { layer, trait_key, proposed_value, old_value, confidence, reasoning }
 * @returns {Promise<{success: boolean, row: object|null, error?: string}>}
 */
async function saveIdentityProposal(proposal) {
  if (!supabase) return { success: false, error: 'Supabase belum dikonfigurasi.' };
  if (!proposal.layer || !proposal.trait_key || !proposal.proposed_value || !proposal.reasoning) {
    return { success: false, error: 'Field layer, trait_key, proposed_value, dan reasoning wajib diisi.' };
  }

  const confidence = parseFloat(proposal.confidence) || 0.0;
  // Tentukan status awal berdasarkan confidence threshold
  const status = confidence > 0.85 ? 'PENDING' : 'STAGED';

  const payload = {
    layer: String(proposal.layer).toUpperCase(),
    trait_key: String(proposal.trait_key).toLowerCase().trim(),
    proposed_value: String(proposal.proposed_value).trim(),
    old_value: proposal.old_value ? String(proposal.old_value).trim() : null,
    confidence,
    reasoning: String(proposal.reasoning).trim(),
    status,
    created_at: new Date().toISOString()
  };

  const { data, error } = await supabase
    .from('nexa_identity_proposals')
    .insert([payload])
    .select();

  if (error) {
    console.error('[IDENTITY] Error saving identity proposal:', error.message);
    return { success: false, error: error.message };
  }
  return { success: true, row: data?.[0] || null, status };
}

/**
 * Mengambil semua proposal yang sedang berstatus PENDING (sudah dikirim ke Telegram).
 * @returns {Promise<Array>}
 */
async function getPendingIdentityProposals() {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('nexa_identity_proposals')
    .select('*')
    .eq('status', 'PENDING')
    .order('created_at', { ascending: true });

  if (error) {
    console.error('[IDENTITY] Error fetching pending proposals:', error.message);
    return [];
  }
  return data || [];
}

/**
 * Mengambil semua proposal yang sedang berstatus STAGED (confidence 60-85%).
 * Digunakan Inference Engine untuk mengkonsolidasi proposal lama saat ada bukti tambahan.
 * @returns {Promise<Array>}
 */
async function getStagedIdentityProposals() {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('nexa_identity_proposals')
    .select('*')
    .eq('status', 'STAGED')
    .order('created_at', { ascending: true });

  if (error) {
    console.error('[IDENTITY] Error fetching staged proposals:', error.message);
    return [];
  }
  return data || [];
}

/**
 * Menyimpan Telegram message_id ke proposal agar bisa diedit setelah tombol ditekan.
 * @param {number} proposalId
 * @param {number} telegramMessageId
 */
async function setProposalTelegramMessageId(proposalId, telegramMessageId) {
  if (!supabase) return;
  const { error } = await supabase
    .from('nexa_identity_proposals')
    .update({ telegram_message_id: telegramMessageId })
    .eq('id', proposalId);

  if (error) console.error('[IDENTITY] Error setting telegram_message_id:', error.message);
}

/**
 * Menyetujui proposal: Ubah status jadi APPROVED dan otomatis commit ke nexa_identity_model.
 * Ini adalah fungsi inti yang dipanggil saat Tuan Faqih menekan tombol APPROVE.
 *
 * [PHASE 7 — M3] Juga menulis delta perubahan ke nexa_identity_history untuk
 * melacak evolusi kepribadian (shift_velocity, shift_trigger).
 *
 * @param {number} proposalId - ID baris di nexa_identity_proposals
 * @returns {Promise<{success: boolean, identityRow: object|null, error?: string}>}
 */
async function approveIdentityProposal(proposalId) {
  if (!supabase) return { success: false, error: 'Supabase belum dikonfigurasi.' };

  // 1. Ambil data proposal
  const { data: proposalData, error: fetchError } = await supabase
    .from('nexa_identity_proposals')
    .select('*')
    .eq('id', proposalId)
    .single();

  if (fetchError || !proposalData) {
    return { success: false, error: fetchError?.message || 'Proposal tidak ditemukan.' };
  }

  // [IDEMPOTENCY GUARD] Jika proposal sudah APPROVED sebelumnya, jangan proses ulang
  // Ini mencegah duplikat di nexa_identity_history jika approval dipanggil dua kali
  if (proposalData.status === 'APPROVED') {
    console.warn(`[IDENTITY] Proposal #${proposalId} sudah berstatus APPROVED. Idempotency guard aktif — proses dihentikan.`);
    return { success: true, alreadyApproved: true };
  }

  // 2. Update status proposal jadi APPROVED
  const { error: updateError } = await supabase
    .from('nexa_identity_proposals')
    .update({ status: 'APPROVED' })
    .eq('id', proposalId);

  if (updateError) {
    console.error('[IDENTITY] Error updating proposal status to APPROVED:', updateError.message);
    return { success: false, error: updateError.message };
  }

  // [PHASE 7 — M3] Baca nilai LAMA dari identity_model sebelum di-upsert
  // untuk menghitung shift_velocity dan menulis version history
  let traitOldValue     = null;
  let confidenceOld     = null;
  let lastReinforcedAt  = null;

  try {
    const { data: oldTrait } = await supabase
      .from('nexa_identity_model')
      .select('trait_value, confidence, last_reinforced_at')
      .eq('layer', proposalData.layer)
      .eq('trait_key', proposalData.trait_key)
      .single();

    if (oldTrait) {
      traitOldValue    = oldTrait.trait_value;
      confidenceOld    = parseFloat(oldTrait.confidence) || null;
      lastReinforcedAt = oldTrait.last_reinforced_at;
    }
  } catch (_) {
    // Trait belum ada di model (baru) — tidak apa-apa
  }

  // 3. Commit ke nexa_identity_model menggunakan upsertIdentityTrait
  const result = await upsertIdentityTrait({
    layer: proposalData.layer,
    trait_key: proposalData.trait_key,
    trait_value: proposalData.proposed_value,
    confidence: proposalData.confidence,
    inferred_from_summary: proposalData.reasoning,
    last_reinforced_at: new Date().toISOString()  // [PHASE 7 M1] Reset decay clock saat approve
  });

  if (!result.success) {
    console.error('[IDENTITY] Error committing proposal to identity model:', result.error);
    return { success: false, error: result.error };
  }

  // [PHASE 7 — M3] Tulis perubahan ke nexa_identity_history
  try {
    const confidenceNew = parseFloat(proposalData.confidence) || 0;

    // Hitung shift_velocity: poin confidence per hari sejak last_reinforced_at
    let shiftVelocity = null;
    if (confidenceOld !== null && lastReinforcedAt) {
      const daysSinceReinforced = Math.max(
        0.5, // Minimum 0.5 hari agar tidak divide-by-zero
        (Date.now() - new Date(lastReinforcedAt).getTime()) / (1000 * 60 * 60 * 24)
      );
      shiftVelocity = parseFloat(
        ((confidenceNew - confidenceOld) / daysSinceReinforced).toFixed(4)
      );
    }

    await supabase
      .from('nexa_identity_history')
      .insert([{
        layer:            proposalData.layer,
        trait_key:        proposalData.trait_key,
        trait_value_old:  traitOldValue,
        trait_value_new:  proposalData.proposed_value,
        confidence_old:   confidenceOld,
        confidence_new:   parseFloat(confidenceNew.toFixed(2)),
        shift_velocity:   shiftVelocity,
        shift_trigger:    proposalData.reasoning
          ? String(proposalData.reasoning).substring(0, 500)
          : null,
        approved_at:      new Date().toISOString()
      }]);

    console.log(`[IDENTITY] 📖 History recorded: [${proposalData.layer}] ${proposalData.trait_key} | velocity=${shiftVelocity?.toFixed(4) || 'N/A'}`);
  } catch (histErr) {
    // Non-blocking: kegagalan tulis history tidak boleh membatalkan approval
    console.warn('[IDENTITY] Failed to write identity history (non-blocking):', histErr.message);
  }

  console.log(`[IDENTITY] ✅ Proposal #${proposalId} APPROVED & COMMITTED: ${proposalData.layer}.${proposalData.trait_key} = "${proposalData.proposed_value}"`);
  return { success: true, identityRow: result.row };
}

/**
 * Menolak proposal: Ubah status jadi REJECTED dan simpan alasan dari Tuan Faqih.
 * Dipanggil saat Tuan Faqih menekan tombol REJECT, atau membalas alasan penolakan.
 * @param {number} proposalId - ID baris di nexa_identity_proposals
 * @param {string|null} rejectionReason - Alasan penolakan dari user (opsional)
 * @returns {Promise<{success: boolean, error?: string}>}
 */
async function rejectIdentityProposal(proposalId, rejectionReason = null) {
  if (!supabase) return { success: false, error: 'Supabase belum dikonfigurasi.' };

  const patch = { status: 'REJECTED' };
  if (rejectionReason) patch.rejection_reason = String(rejectionReason).trim();

  const { error } = await supabase
    .from('nexa_identity_proposals')
    .update(patch)
    .eq('id', proposalId);

  if (error) {
    console.error('[IDENTITY] Error rejecting proposal:', error.message);
    return { success: false, error: error.message };
  }

  console.log(`[IDENTITY] ❌ Proposal #${proposalId} REJECTED. Alasan: ${rejectionReason || '(tidak diisi)'}`);
  return { success: true };
}

/**
 * Mengambil satu proposal berdasarkan ID-nya.
 * Digunakan webhook.js untuk mencocokkan callback_query dengan proposal yang ada.
 * @param {number} proposalId
 * @returns {Promise<object|null>}
 */
async function getIdentityProposalById(proposalId) {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('nexa_identity_proposals')
    .select('*')
    .eq('id', proposalId)
    .single();

  if (error) {
    console.error('[IDENTITY] Error fetching proposal by ID:', error.message);
    return null;
  }
  return data || null;
}

module.exports = {
  supabase,
  // ── Chat & Memory ──────────────────────────────────────────
  saveChatMemory,
  getRecentMemories,
  getTodayMemories,
  // ── Finance & Dedup ────────────────────────────────────────
  isDuplicateTransaction,
  logTransactionKey,
  // ── 2nd Brain Vault ────────────────────────────────────────
  saveIdeaToVault,
  deleteIdeaFromVault,
  editIdeaInVault,
  // ── Legacy Profile & Identity ──────────────────────────────
  saveUserProfile,
  deleteFromUserProfile,
  saveCoreIdentity,
  deleteFromCoreIdentity,
  getPersonalFacts,
  // ── Generic Database Operations ────────────────────────────
  getDatabaseOverview,
  readDatabaseTable,
  insertDatabaseRow,
  updateDatabaseRows,
  deleteDatabaseRows,
  deleteAllDatabaseRows,
  // ── Vault Items ────────────────────────────────────────────
  saveVaultItem,
  updateVaultItemById,
  // ── Pending Transactions ───────────────────────────────────
  savePendingTransaction,
  getPendingTransactions,
  deletePendingTransaction,
  markPendingTransactionSent,
  // ── [PHASE 6] Cognitive Identity Model ────────────────────
  getIdentityModel,
  upsertIdentityTrait,
  deleteIdentityTrait,
  // ── [PHASE 6] Identity Proposals (Git-Style Commit) ───────
  saveIdentityProposal,
  getPendingIdentityProposals,
  getStagedIdentityProposals,
  setProposalTelegramMessageId,
  approveIdentityProposal,
  rejectIdentityProposal,
  getIdentityProposalById
};

/**
 * Fetch all chat memories from today (WIB timezone) for Memory Consolidation cron.
 * Returns messages since midnight today Asia/Jakarta.
 */
async function getTodayMemories() {
  if (!supabase) return [];
  // Midnight WIB (UTC+7) = 17:00 UTC previous day
  const nowUtc = new Date();
  const jakartaOffset = 7 * 60 * 60 * 1000;
  const jakartaNow = new Date(nowUtc.getTime() + jakartaOffset);
  const midnightJakarta = new Date(
    Date.UTC(jakartaNow.getUTCFullYear(), jakartaNow.getUTCMonth(), jakartaNow.getUTCDate())
    - jakartaOffset
  );

  const { data, error } = await supabase
    .from('nexa_chat_memories')
    .select('role, content, created_at, platform')
    .gte('created_at', midnightJakarta.toISOString())
    .order('created_at', { ascending: true });

  if (error) {
    console.error('[SUPABASE] Error fetching today memories:', error.message);
    return [];
  }
  return (data || []).map(m => ({
    ...m,
    platform: m.platform || 'telegram'
  }));
}
