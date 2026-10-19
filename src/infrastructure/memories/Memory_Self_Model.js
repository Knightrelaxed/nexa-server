/**
 * ============================================================
 * [N.E.X.A] memories/Memory_Self_Model.js
 * Self-learning model N.E.X.A (capabilities, limitations, rules, corrections)
 *
 * Bagian dari modularisasi Supabase_Memories.js (facade: ../Supabase_Memories.js).
 * Kode dipindahkan verbatim oleh scripts/refactor/split_supabase_memories.js;
 * satu-satunya perubahan adalah jalur require relatif (+1 level).
 * ============================================================
 */

const { supabase, findMatchingIds } = require('./Memory_Client');

/**
 * Delete from Self-Learning Model (`nexa_self_model`)
 */
async function deleteFromSelfModel(searchKeyword) {
  if (!supabase || !searchKeyword) return false;
  const { data: rows } = await supabase.from('nexa_self_model').select('id, trait_key, trait_value');
  if (!rows || rows.length === 0) return false;
  const targetIds = findMatchingIds(rows, searchKeyword);
  if (targetIds.length === 0) return false;
  const { error } = await supabase.from('nexa_self_model').delete().in('id', targetIds);
  return !error;
}

// ============================================================
// [PHASE 8 — SELF-LEARNING ENGINE] nexa_self_model
// ============================================================

/**
 * Simpan atau perbarui fakta tentang N.E.X.A ke tabel nexa_self_model.
 * Menggunakan UPSERT pada kolom UNIQUE (trait_key) sehingga:
 *   - Jika trait_key BARU  → INSERT baris baru
 *   - Jika trait_key SUDAH ADA → UPDATE in-place (anti-kontradiksi)
 *
 * @param {string} layer - 'CAPABILITIES'|'LIMITATIONS'|'OPERATIONAL_RULES'|'CORRECTIONS'|'COMMUNICATION_STYLE'
 * @param {string} traitKey - Kunci unik snake_case (mis: 'context_window_limit')
 * @param {string} traitValue - Teks fakta yang diobservasi
 * @param {string} [source='PASSIVE_LEARNING'] - 'PASSIVE_LEARNING'|'WEEKLY_REFLECTION'|'MANUAL'
 * @param {string} [inferredFrom=''] - Kalimat asli yang memicu pembelajaran ini
 * @returns {Promise<'inserted'|'updated'|'error'>}
 */
async function upsertSelfModelTrait(layer, traitKey, traitValue, source = 'PASSIVE_LEARNING', inferredFrom = '') {
  if (!supabase) return 'error';

  const VALID_LAYERS = new Set(['CAPABILITIES', 'LIMITATIONS', 'OPERATIONAL_RULES', 'CORRECTIONS', 'COMMUNICATION_STYLE']);
  if (!VALID_LAYERS.has(String(layer || '').toUpperCase())) {
    console.warn(`[SELF-MODEL] Invalid layer: "${layer}". Skipped.`);
    return 'error';
  }

  const normalizedKey = String(traitKey || '').trim().toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
  if (!normalizedKey || normalizedKey.length < 3) {
    console.warn(`[SELF-MODEL] trait_key terlalu pendek atau kosong: "${traitKey}". Skipped.`);
    return 'error';
  }

  const payload = {
    layer:         String(layer).toUpperCase(),
    trait_key:     normalizedKey,
    trait_value:   String(traitValue || '').trim(),
    source:        ['PASSIVE_LEARNING', 'WEEKLY_REFLECTION', 'MANUAL'].includes(source) ? source : 'PASSIVE_LEARNING',
    inferred_from: String(inferredFrom || '').substring(0, 300),
    updated_at:    new Date().toISOString()
  };

  const { data, error } = await supabase
    .from('nexa_self_model')
    .upsert(payload, { onConflict: 'trait_key', returning: 'minimal' });

  if (error) {
    console.error('[SELF-MODEL] upsertSelfModelTrait error:', error.message);
    return 'error';
  }

  console.log(`[SELF-MODEL] ✅ Upserted [${payload.layer}] ${normalizedKey}: "${String(traitValue).substring(0, 60)}" (source: ${payload.source})`);
  return 'inserted'; // Supabase upsert tidak membedakan insert vs update tanpa returning count
}

/**
 * Update trait_value secara in-place berdasarkan trait_key yang sudah ada.
 * Digunakan oleh deduplication engine saat mendeteksi kontradiksi atau revisi.
 *
 * @param {string} oldTraitKey - trait_key baris lama yang akan diupdate
 * @param {string} newTraitValue - nilai baru yang menggantikan
 * @param {string} [source='PASSIVE_LEARNING']
 * @returns {Promise<boolean>} true jika berhasil
 */
async function updateSelfModelTraitByKey(oldTraitKey, newTraitValue, source = 'PASSIVE_LEARNING') {
  if (!supabase || !oldTraitKey) return false;
  const { error } = await supabase
    .from('nexa_self_model')
    .update({
      trait_value: String(newTraitValue || '').trim(),
      source: ['PASSIVE_LEARNING', 'WEEKLY_REFLECTION', 'MANUAL'].includes(source) ? source : 'PASSIVE_LEARNING',
      updated_at: new Date().toISOString()
    })
    .eq('trait_key', String(oldTraitKey).trim().toLowerCase());

  if (error) {
    console.error('[SELF-MODEL] updateSelfModelTraitByKey error:', error.message);
    return false;
  }
  console.log(`[SELF-MODEL] ✅ Updated in-place [${oldTraitKey}]: "${String(newTraitValue).substring(0, 60)}"`);
  return true;
}

/**
 * Ambil top N fakta dari nexa_self_model, diurutkan berdasarkan updated_at DESC.
 * Digunakan oleh AI_Router.js untuk menyuntikkan max 5 fakta ke prompt.
 *
 * @param {number} [limit=5] - Jumlah fakta yang diambil
 * @returns {Promise<Array<{layer, trait_key, trait_value, confidence, source, updated_at}>>}
 */
async function getSelfModel(limit = 5) {
  if (!supabase) return [];

  const { data, error } = await supabase
    .from('nexa_self_model')
    .select('layer, trait_key, trait_value, confidence, source, updated_at')
    .order('updated_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('[SELF-MODEL] getSelfModel error:', error.message);
    return [];
  }
  return data || [];
}

/**
 * Ambil SEMUA fakta dari nexa_self_model berdasarkan layer tertentu.
 * Digunakan oleh deduplicateAndSaveSelfFact untuk membandingkan fakta baru.
 *
 * @param {string} layer - 'CAPABILITIES'|'LIMITATIONS'|'OPERATIONAL_RULES'|'CORRECTIONS'|'COMMUNICATION_STYLE'
 * @returns {Promise<Array<{id, layer, trait_key, trait_value, updated_at}>>}
 */
async function getSelfModelByLayer(layer) {
  if (!supabase || !layer) return [];
  const { data, error } = await supabase
    .from('nexa_self_model')
    .select('id, layer, trait_key, trait_value, updated_at')
    .eq('layer', String(layer).toUpperCase())
    .order('updated_at', { ascending: false });

  if (error) {
    console.error('[SELF-MODEL] getSelfModelByLayer error:', error.message);
    return [];
  }
  return data || [];
}

module.exports = {
  deleteFromSelfModel,
  upsertSelfModelTrait,
  updateSelfModelTraitByKey,
  getSelfModel,
  getSelfModelByLayer
};
