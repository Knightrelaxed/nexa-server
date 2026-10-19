/**
 * ============================================================
 * [N.E.X.A] memories/Memory_Vault.js
 * 2nd Brain vault: ide dan item vault
 *
 * Bagian dari modularisasi Supabase_Memories.js (facade: ../Supabase_Memories.js).
 * Kode dipindahkan verbatim oleh scripts/refactor/split_supabase_memories.js;
 * satu-satunya perubahan adalah jalur require relatif (+1 level).
 * ============================================================
 */

const { supabase, findMatchingIds } = require('./Memory_Client');

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

module.exports = {
  saveIdeaToVault,
  deleteIdeaFromVault,
  editIdeaInVault,
  saveVaultItem,
  updateVaultItemById
};
