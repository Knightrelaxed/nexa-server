/**
 * ============================================================
 * [N.E.X.A] memories/Memory_Living.js
 * Living memory & hygiene: simpan dengan metadata, arsip, reinforce, kandidat pruning
 *
 * Mendukung taksonomi 5 tingkat: CORE, PHASE, PREFERENCE, RULE, EPHEMERAL
 * Serta siklus hidup: contingency reasoning, active chapters, dan supersession guardrails.
 * ============================================================
 */

const { supabase } = require('./Memory_Client');

// ============================================================
// LIVING MEMORY — Fungsi-Fungsi Lifecycle Baru
// ============================================================

/**
 * Simpan fakta memori BARU dengan metadata lifecycle lengkap.
 * Mendukung taksonomi baru: CORE | PHASE | PREFERENCE | RULE | EPHEMERAL
 *
 * @param {string} content - Konten fakta yang akan disimpan
 * @param {string|object} categoryOrMeta - Kategori string atau objek dari Memory_Classifier
 * @param {'USER_PROFILE'|'CORE_IDENTITY'} type - Tabel tujuan
 * @returns {Promise<{success: boolean, id: number|null}>}
 */
async function saveMemoryWithMeta(content, categoryOrMeta, type = 'USER_PROFILE') {
  if (!supabase || !content) return { success: false, id: null };

  let validCat = 'PREFERENCE';
  let validDays = null;
  let chapter = null;
  let endEvent = null;

  if (typeof categoryOrMeta === 'object' && categoryOrMeta !== null) {
    validCat = categoryOrMeta.label || categoryOrMeta.category_type || 'PREFERENCE';
    validDays = categoryOrMeta.valid_days ?? null;
    chapter = categoryOrMeta.chapter ?? null;
    endEvent = categoryOrMeta.end_event ?? null;
  } else if (typeof categoryOrMeta === 'string') {
    validCat = categoryOrMeta;
  }

  // Normalisasi alias legacy
  if (validCat === 'PERMANENT_FACT') validCat = 'CORE';
  const VALID_CATEGORIES = new Set(['CORE', 'PHASE', 'PREFERENCE', 'RULE', 'EPHEMERAL']);
  if (!VALID_CATEGORIES.has(validCat)) validCat = 'PREFERENCE';

  const table = type === 'CORE_IDENTITY' ? 'nexa_core_identity' : 'nexa_user_profile';

  const payload = {
    content: String(content).trim(),
    category_type: validCat,
    last_reinforced_at: new Date().toISOString(),
    evidence_count: 1,
    status: 'ACTIVE'
  };

  // Hanya nexa_user_profile yang memiliki kolom metadata fase/bab
  if (table === 'nexa_user_profile') {
    if (validDays !== null && validDays !== undefined) payload.valid_days = validDays;
    if (chapter) payload.chapter = String(chapter).trim();
    if (endEvent) payload.end_event = String(endEvent).trim();
  }

  const { data, error } = await supabase.from(table).insert([payload]).select('id');
  if (error) {
    console.error(`[LIVING-MEMORY] Error saving memory with meta to ${table}:`, error.message);
    return { success: false, id: null };
  }
  console.log(`[LIVING-MEMORY] ✅ Saved [${validCat}] to ${table}: "${String(content).substring(0, 60)}"`);

  // Auto-sync ke cache vektor RAM & snapshot disk
  try {
    const { appendFactToVectorCache } = require('../../utils/gemini_vector_cache.js');
    appendFactToVectorCache(content, type).catch(e => console.warn('[VECTOR-CACHE] Auto-sync background failed:', e.message));
  } catch (e) {}

  return { success: true, id: data?.[0]?.id ?? null };
}

/**
 * Ambil SEMUA fakta ACTIVE dari tabel (tanpa batasan limit).
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
 * Soft-archive fakta berdasarkan ID (ubah status → 'ARCHIVED').
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
 * Batch soft-archive banyak fakta sekaligus berdasarkan array of IDs.
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
 * Naikkan evidence_count dan perbarui last_reinforced_at untuk fakta yang ditegaskan ulang.
 *
 * @param {number} id - ID fakta yang akan di-reinforce
 * @param {'USER_PROFILE'|'CORE_IDENTITY'} type - Tabel sumber
 * @returns {Promise<boolean>}
 */
async function reinforceMemoryById(id, type = 'USER_PROFILE') {
  if (!supabase || !id) return false;
  const table = type === 'CORE_IDENTITY' ? 'nexa_core_identity' : 'nexa_user_profile';

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
 * Ambil semua fakta berstatus STAGED_FOR_PRUNING dari kedua tabel.
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

/**
 * Daftar chapter aktif untuk mencegah drift nama slug.
 *
 * @param {number} limit
 * @param {'USER_PROFILE'|'CORE_IDENTITY'} type
 * @returns {Promise<string[]>}
 */
async function getActiveChapters(limit = 15, type = 'USER_PROFILE') {
  if (!supabase) return [];
  const table = type === 'CORE_IDENTITY' ? 'nexa_core_identity' : 'nexa_user_profile';
  if (table !== 'nexa_user_profile') return [];

  const { data, error } = await supabase.from(table)
    .select('chapter')
    .not('chapter', 'is', null)
    .in('status', ['ACTIVE', 'STAGED_FOR_PRUNING'])
    .limit(500);

  if (error) {
    console.error(`[LIVING-MEMORY] Error fetching active chapters from ${table}:`, error.message);
    return [];
  }
  return [...new Set((data || []).map(r => r.chapter).filter(Boolean))].slice(0, limit);
}

/**
 * Falsifikasi/penggantian fakta lama oleh fakta baru.
 * CORE tidak diarsipkan diam-diam, melainkan di-stage untuk konfirmasi pengguna.
 *
 * @param {number[]} oldIds
 * @param {number} newId
 * @param {'USER_PROFILE'|'CORE_IDENTITY'} type
 * @returns {Promise<{archived: number[], conflicts: number[]}>}
 */
async function supersedeMemories(oldIds, newId, type = 'USER_PROFILE') {
  if (!supabase || !oldIds?.length) return { archived: [], conflicts: [] };
  const table = type === 'CORE_IDENTITY' ? 'nexa_core_identity' : 'nexa_user_profile';

  const { data, error } = await supabase.from(table)
    .select('id, category_type')
    .in('id', oldIds)
    .in('status', ['ACTIVE', 'STAGED_FOR_PRUNING'])
    .neq('id', newId);

  if (error) {
    console.error(`[LIVING-MEMORY] Error in supersedeMemories for ${table}:`, error.message);
    return { archived: [], conflicts: [] };
  }

  const core = (data || []).filter(r => r.category_type === 'CORE').map(r => r.id);
  const rest = (data || []).filter(r => r.category_type !== 'CORE').map(r => r.id);

  if (rest.length > 0) {
    await supabase.from(table).update({ status: 'ARCHIVED', superseded_by: newId }).in('id', rest);
  }
  if (core.length > 0) {
    await supabase.from(table).update({ status: 'STAGED_FOR_PRUNING', superseded_by: newId }).in('id', core);
  }

  return { archived: rest, conflicts: core };
}

/**
 * Konfirmasi supersesi fakta CORE oleh pengguna.
 *
 * @param {number} oldId
 * @param {boolean} accept
 * @param {'USER_PROFILE'|'CORE_IDENTITY'} type
 * @returns {Promise<boolean>}
 */
async function confirmSupersession(oldId, accept, type = 'USER_PROFILE') {
  if (!supabase || !oldId) return false;
  const table = type === 'CORE_IDENTITY' ? 'nexa_core_identity' : 'nexa_user_profile';

  const patch = accept
    ? { status: 'ARCHIVED' }
    : { status: 'ACTIVE', superseded_by: null };

  const { error } = await supabase.from(table).update(patch).eq('id', oldId);
  if (error) {
    console.error(`[LIVING-MEMORY] Error confirming supersession for ID ${oldId}:`, error.message);
    return false;
  }
  return true;
}

/**
 * Penutupan satu bab hidup secara tuntas (lulus kuliah, pindah domisili permanen, dsb).
 * Mengarsipkan fakta PHASE dan EPHEMERAL pada chapter tersebut.
 *
 * @param {string} chapter
 * @param {number} closingFactId
 * @param {'USER_PROFILE'|'CORE_IDENTITY'} type
 * @returns {Promise<number[]>}
 */
async function closeChapter(chapter, closingFactId, type = 'USER_PROFILE') {
  if (!supabase || !chapter) return [];
  const table = type === 'CORE_IDENTITY' ? 'nexa_core_identity' : 'nexa_user_profile';
  if (table !== 'nexa_user_profile') return [];

  const { data, error } = await supabase.from(table)
    .update({ status: 'ARCHIVED', superseded_by: closingFactId })
    .eq('chapter', chapter)
    .in('category_type', ['PHASE', 'EPHEMERAL'])
    .in('status', ['ACTIVE', 'STAGED_FOR_PRUNING'])
    .neq('id', closingFactId)
    .select('id');

  if (error) {
    console.error(`[LIVING-MEMORY] Error closing chapter "${chapter}" in ${table}:`, error.message);
    return [];
  }
  const ids = (data || []).map(r => r.id);
  console.log(`[LIVING-MEMORY] Chapter "${chapter}" closed by #${closingFactId}: archived ${ids.length}`);
  return ids;
}

/**
 * Menjalankan efek siklus hidup lanjutan dari hasil klasifikasi fakta baru.
 *
 * @param {number} newId
 * @param {object} cls
 * @param {'USER_PROFILE'|'CORE_IDENTITY'} type
 * @returns {Promise<{archived: number[], conflicts: number[], chapterClosed: number[]}>}
 */
async function applyLifecycleEffects(newId, cls, type = 'USER_PROFILE') {
  const out = { archived: [], conflicts: [], chapterClosed: [] };
  if (cls?.supersedes?.length) {
    const res = await supersedeMemories(cls.supersedes, newId, type);
    out.archived = res.archived;
    out.conflicts = res.conflicts;
  }
  if (cls?.closes_chapter) {
    out.chapterClosed = await closeChapter(cls.closes_chapter, newId, type);
  }
  return out;
}

module.exports = {
  saveMemoryWithMeta,
  getAllActiveMemories,
  archiveMemoryById,
  bulkArchiveMemories,
  reinforceMemoryById,
  getStagedForPruning,
  getActiveChapters,
  supersedeMemories,
  confirmSupersession,
  closeChapter,
  applyLifecycleEffects
};
