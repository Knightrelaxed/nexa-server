/**
 * ============================================================
 * [N.E.X.A] memories/Memory_Living.js
 * Living memory & hygiene: simpan dengan metadata, arsip, reinforce, kandidat pruning
 *
 * Bagian dari modularisasi Supabase_Memories.js (facade: ../Supabase_Memories.js).
 * Kode dipindahkan verbatim oleh scripts/refactor/split_supabase_memories.js;
 * satu-satunya perubahan adalah jalur require relatif (+1 level).
 * ============================================================
 */

const { supabase } = require('./Memory_Client');

// ============================================================
// [PHASE 9] LIVING MEMORY — Fungsi-Fungsi Lifecycle Baru
// ============================================================

/**
 * [PHASE 9] Simpan fakta memori BARU dengan metadata lifecycle lengkap.
 * Menggantikan saveUserProfile/saveCoreIdentity untuk penyimpanan cerdas.
 *
 * @param {string} content - Konten fakta yang akan disimpan
 * @param {string} categoryType - 'PERMANENT_FACT'|'PREFERENCE'|'EPHEMERAL'|'RULE'
 * @param {'USER_PROFILE'|'CORE_IDENTITY'} type - Tabel tujuan
 * @returns {Promise<{success: boolean, id: number|null}>}
 */
async function saveMemoryWithMeta(content, categoryType, type = 'USER_PROFILE') {
  if (!supabase || !content) return { success: false, id: null };

  const VALID_CATEGORIES = new Set(['PERMANENT_FACT', 'PREFERENCE', 'EPHEMERAL', 'RULE']);
  const validCat = VALID_CATEGORIES.has(categoryType) ? categoryType : 'PREFERENCE';
  const table = type === 'CORE_IDENTITY' ? 'nexa_core_identity' : 'nexa_user_profile';

  const payload = {
    content: String(content).trim(),
    category_type: validCat,
    last_reinforced_at: new Date().toISOString(),
    evidence_count: 1,
    status: 'ACTIVE'
  };

  const { data, error } = await supabase.from(table).insert([payload]).select('id');
  if (error) {
    console.error(`[LIVING-MEMORY] Error saving memory with meta to ${table}:`, error.message);
    return { success: false, id: null };
  }
  console.log(`[LIVING-MEMORY] ✅ Saved [${validCat}] to ${table}: "${String(content).substring(0, 60)}"`);

  // [AUTO-SYNC VECTOR SNAPSHOT] Sinkronisasi instan ke cache vektor RAM & snapshot disk
  try {
    const { appendFactToVectorCache } = require('../../utils/gemini_vector_cache.js');
    appendFactToVectorCache(content, type).catch(e => console.warn('[VECTOR-CACHE] Auto-sync background failed:', e.message));
  } catch (e) {}

  return { success: true, id: data?.[0]?.id ?? null };
}

/**
 * [PHASE 9] Ambil SEMUA fakta ACTIVE dari tabel (tanpa batasan limit).
 * Digunakan oleh Supersede Engine v2 untuk perbandingan komprehensif.
 *
 * @param {'USER_PROFILE'|'CORE_IDENTITY'} type - Tabel sumber
 * @returns {Promise<Array<{id, content, category_type, evidence_count, last_reinforced_at}>>}
 */
async function getAllActiveMemories(type = 'USER_PROFILE') {
  if (!supabase) return [];
  const table = type === 'CORE_IDENTITY' ? 'nexa_core_identity' : 'nexa_user_profile';

  const { data, error } = await supabase
    .from(table)
    .select('id, content, category_type, evidence_count, last_reinforced_at')
    .eq('status', 'ACTIVE')
    .order('created_at', { ascending: true });

  if (error) {
    console.error(`[LIVING-MEMORY] Error fetching all active memories from ${table}:`, error.message);
    return [];
  }
  return data || [];
}

/**
 * [PHASE 9] Soft-archive fakta berdasarkan ID (ubah status → 'ARCHIVED').
 * TIDAK melakukan hard DELETE — data tetap aman untuk audit & pemulihan.
 *
 * @param {number} id - ID fakta yang akan diarsipkan
 * @param {'USER_PROFILE'|'CORE_IDENTITY'} type - Tabel sumber
 * @returns {Promise<boolean>}
 */
async function archiveMemoryById(id, type = 'USER_PROFILE') {
  if (!supabase || !id) return false;
  const table = type === 'CORE_IDENTITY' ? 'nexa_core_identity' : 'nexa_user_profile';

  const { error } = await supabase
    .from(table)
    .update({ status: 'ARCHIVED' })
    .eq('id', id);

  if (error) {
    console.error(`[LIVING-MEMORY] Error archiving memory ID ${id} in ${table}:`, error.message);
    return false;
  }
  console.log(`[LIVING-MEMORY] 📦 Archived memory ID ${id} in ${table}.`);
  return true;
}

/**
 * [PHASE 9] Batch soft-archive banyak fakta sekaligus berdasarkan array of IDs.
 * Dipanggil setelah Tuan menekan tombol [Arsipkan Semua] di Telegram.
 *
 * @param {number[]} ids - Array ID fakta yang akan diarsipkan
 * @param {'USER_PROFILE'|'CORE_IDENTITY'} type - Tabel sumber
 * @returns {Promise<{success: boolean, archived: number}>}
 */
async function bulkArchiveMemories(ids, type = 'USER_PROFILE') {
  if (!supabase || !ids || ids.length === 0) return { success: false, archived: 0 };
  const table = type === 'CORE_IDENTITY' ? 'nexa_core_identity' : 'nexa_user_profile';

  const { error } = await supabase
    .from(table)
    .update({ status: 'ARCHIVED' })
    .in('id', ids);

  if (error) {
    console.error(`[LIVING-MEMORY] Error bulk archiving in ${table}:`, error.message);
    return { success: false, archived: 0 };
  }
  console.log(`[LIVING-MEMORY] 📦 Bulk archived ${ids.length} memories in ${table}.`);
  return { success: true, archived: ids.length };
}

/**
 * [PHASE 9] Naikkan evidence_count dan perbarui last_reinforced_at untuk fakta yang ditegaskan ulang.
 * Dipanggil oleh Supersede Engine v2 saat keputusan AI adalah 'REINFORCE'.
 *
 * @param {number} id - ID fakta yang akan di-reinforce
 * @param {'USER_PROFILE'|'CORE_IDENTITY'} type - Tabel sumber
 * @returns {Promise<boolean>}
 */
async function reinforceMemoryById(id, type = 'USER_PROFILE') {
  if (!supabase || !id) return false;
  const table = type === 'CORE_IDENTITY' ? 'nexa_core_identity' : 'nexa_user_profile';

  // Ambil evidence_count saat ini untuk di-increment (Supabase tidak punya atomic increment via update)
  const { data: current } = await supabase.from(table).select('evidence_count').eq('id', id).single();
  const newCount = (current?.evidence_count || 1) + 1;

  const { error } = await supabase
    .from(table)
    .update({
      evidence_count: newCount,
      last_reinforced_at: new Date().toISOString()
    })
    .eq('id', id);

  if (error) {
    console.error(`[LIVING-MEMORY] Error reinforcing memory ID ${id} in ${table}:`, error.message);
    return false;
  }
  console.log(`[LIVING-MEMORY] ⚡ Reinforced memory ID ${id} in ${table} (evidence: ${newCount}).`);
  return true;
}

/**
 * [PHASE 9] Ambil semua fakta berstatus STAGED_FOR_PRUNING dari kedua tabel.
 * Digunakan oleh Memory Hygiene Engine untuk menyusun laporan review ke Telegram.
 *
 * @returns {Promise<{userProfile: Array, coreIdentity: Array}>}
 */
async function getStagedForPruning() {
  if (!supabase) return { userProfile: [], coreIdentity: [] };

  const [profileRes, identityRes] = await Promise.all([
    supabase
      .from('nexa_user_profile')
      .select('id, content, category_type, evidence_count, last_reinforced_at')
      .eq('status', 'STAGED_FOR_PRUNING')
      .order('last_reinforced_at', { ascending: true }),
    supabase
      .from('nexa_core_identity')
      .select('id, content, category_type, evidence_count, last_reinforced_at')
      .eq('status', 'STAGED_FOR_PRUNING')
      .order('last_reinforced_at', { ascending: true })
  ]);

  return {
    userProfile: profileRes.data || [],
    coreIdentity: identityRes.data || []
  };
}

module.exports = {
  saveMemoryWithMeta,
  getAllActiveMemories,
  archiveMemoryById,
  bulkArchiveMemories,
  reinforceMemoryById,
  getStagedForPruning
};
