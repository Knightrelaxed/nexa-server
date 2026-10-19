/**
 * ============================================================
 * [N.E.X.A] memories/Memory_Db_Browser.js
 * Operasi CRUD generik untuk database browser
 *
 * Bagian dari modularisasi Supabase_Memories.js (facade: ../Supabase_Memories.js).
 * Kode dipindahkan verbatim oleh scripts/refactor/split_supabase_memories.js;
 * satu-satunya perubahan adalah jalur require relatif (+1 level).
 * ============================================================
 */

const { supabase, SUPABASE_TABLES, resolveAllowedTableName, findMatchingIds } = require('./Memory_Client');

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

module.exports = {
  getDatabaseOverview,
  readDatabaseTable,
  insertDatabaseRow,
  updateDatabaseRows,
  deleteDatabaseRows,
  deleteAllDatabaseRows
};
