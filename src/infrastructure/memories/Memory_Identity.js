/**
 * ============================================================
 * [N.E.X.A] memories/Memory_Identity.js
 * Profil pengguna, identitas kognitif, dan proposal identitas
 *
 * Bagian dari modularisasi Supabase_Memories.js (facade: ../Supabase_Memories.js).
 * Kode dipindahkan verbatim oleh scripts/refactor/split_supabase_memories.js;
 * satu-satunya perubahan adalah jalur require relatif (+1 level).
 * ============================================================
 */

const { sanitizeDirective } = require('../../utils/directive_utils');
const { supabase, findMatchingIds } = require('./Memory_Client');
const { saveMemoryWithMeta } = require('./Memory_Living');

/**
 * Save fact to User Profile (Legacy — dipertahankan untuk kompatibilitas).
 * Untuk penyimpanan baru yang lebih cerdas, gunakan saveMemoryWithMeta().
 */
async function saveUserProfile(content) {
  if (!supabase) return;
  return await saveMemoryWithMeta(content, 'PREFERENCE', 'USER_PROFILE');
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
 * Save fact to Core Identity (Legacy — dipertahankan untuk kompatibilitas).
 * Untuk penyimpanan baru yang lebih cerdas, gunakan saveMemoryWithMeta().
 */
async function saveCoreIdentity(content) {
  if (!supabase) return;
  return await saveMemoryWithMeta(content, 'RULE', 'CORE_IDENTITY');
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
 * Fetch all PERSONAL_FACT entries from the vault.
 * Used by AI_Router to inject long-term personal context.
 * Now fetches from BOTH nexa_user_profile and nexa_core_identity.
 * @returns {Promise<string[]>} Array of fact strings
 */
async function getPersonalFacts() {
  if (!supabase) return { userProfile: [], coreIdentity: [], vaultItems: [] };

  // [PHASE 9] Filter: hanya ambil fakta ACTIVE agar fakta ARCHIVED/STAGED tidak
  // mengotori system prompt AI. Ini adalah pintu gerbang utama Living Memory.
  const [profileRes, identityRes, vaultRes] = await Promise.all([
    supabase.from('nexa_user_profile')
      .select('content')
      .eq('status', 'ACTIVE')                           // [PHASE 9] Filter ACTIVE only
      .order('created_at', { ascending: true }),
    supabase.from('nexa_core_identity')
      .select('content')
      .eq('status', 'ACTIVE')                           // [PHASE 9] Filter ACTIVE only
      .order('created_at', { ascending: true }),
    supabase.from('nexa_vault_items')
      .select('file_name, category, metadata_json, drive_web_view_link, status')
      .order('created_at', { ascending: false })
      .limit(30)
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

  const payload = buildIdentityTraitPayload(trait); // [v3.3.2] only the fields that were actually provided

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
  // [v3.3.2] Carry the operational directive through approval. Before this, every approval upserted
  // directive: null and silently erased any directive the trait had. WEAKNESSES are always private.
  const approvedSensitivity = String(proposalData.layer).toUpperCase() === 'WEAKNESSES' ? 'private' : undefined;
  const approvedDirective = sanitizeDirective(proposalData.directive, {
    traitValue: proposalData.proposed_value,
    sensitivity: approvedSensitivity || 'normal'
  });
  const valueChanged = traitOldValue !== null &&
    String(traitOldValue).trim() !== String(proposalData.proposed_value).trim();

  const result = await upsertIdentityTrait({
    layer: proposalData.layer,
    trait_key: proposalData.trait_key,
    trait_value: proposalData.proposed_value,
    confidence: proposalData.confidence,
    inferred_from_summary: proposalData.reasoning,
    last_reinforced_at: new Date().toISOString(),  // [PHASE 7 M1] Reset decay clock saat approve
    ...(approvedDirective ? { directive: approvedDirective } : (valueChanged ? { clearDirective: true } : {})),
    ...(approvedSensitivity ? { sensitivity: approvedSensitivity } : {})
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

/**
 * [v3.3.2] Build the identity-model upsert payload. directive / scope / sensitivity are written ONLY when
 * the caller provides them, so reinforcing a trait can no longer erase its directive or reset its privacy flag
 * (new rows get the column defaults: scope 'global', sensitivity 'normal').
 */
function buildIdentityTraitPayload(trait) {
  const payload = {
    layer: String(trait.layer).toUpperCase(),
    trait_key: String(trait.trait_key).toLowerCase().trim(),
    trait_value: String(trait.trait_value).trim(),
    confidence: parseFloat(trait.confidence) || 0.90,
    inferred_from_summary: trait.inferred_from_summary ? String(trait.inferred_from_summary) : null,
    last_reinforced_at: trait.last_reinforced_at || new Date().toISOString(), // [PHASE 7 M1] Reset decay clock
    updated_at: new Date().toISOString()
  };
  if (trait.directive !== undefined) payload.directive = trait.directive ? String(trait.directive).slice(0, 160) : null;
  if (trait.clearDirective) payload.directive = null;
  if (trait.scope !== undefined) payload.scope = trait.scope || 'global';
  if (trait.sensitivity !== undefined) payload.sensitivity = trait.sensitivity || 'normal';
  return payload;
}

module.exports = {
  saveUserProfile,
  deleteFromUserProfile,
  saveCoreIdentity,
  deleteFromCoreIdentity,
  getPersonalFacts,
  getIdentityModel,
  upsertIdentityTrait,
  deleteIdentityTrait,
  saveIdentityProposal,
  getPendingIdentityProposals,
  getStagedIdentityProposals,
  setProposalTelegramMessageId,
  approveIdentityProposal,
  rejectIdentityProposal,
  getIdentityProposalById,
  buildIdentityTraitPayload
};
