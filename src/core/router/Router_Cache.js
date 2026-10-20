/**
 * ============================================================
 * [N.E.X.A] router/Router_Cache.js
 * Cache RAM (personal facts, identity model, self-model): SATU-SATUNYA pemilik state mutable
 *
 * Bagian dari modularisasi AI_Router.js (facade: ../AI_Router.js).
 * Kode dipindahkan verbatim oleh scripts/refactor/split_supabase_memories.js;
 * satu-satunya perubahan adalah jalur require relatif (+1 level).
 * ============================================================
 */

const supabaseMemories = require('../../infrastructure/Supabase_Memories');

// ============================================================
// PERSONAL FACTS CACHE (Module-level — lives as long as server runs)
// Zero overhead after first fetch. Invalidated when new PERSONAL_FACT is saved.
// ============================================================
let _personalFactsCache = null;

let _personalFactsCacheTime = 0;

const CACHE_TTL_MS = 30 * 60 * 1000;

// 30 minutes TTL (safety net re-fetch)

/**
 * Load personal facts with smart caching.
 * First call: fetches from Supabase (~15ms).
 * Subsequent calls: returns from RAM (0ms) until cache is invalidated.
 */
async function loadPersonalFactsWithCache() {
  const now = Date.now();
  // Return from cache if still valid
  if (_personalFactsCache !== null && (now - _personalFactsCacheTime) < CACHE_TTL_MS) {
    return _personalFactsCache;
  }
  // Fetch fresh from Supabase
  const facts = await supabaseMemories.getPersonalFacts();
  _personalFactsCache = facts;
  _personalFactsCacheTime = now;
  const count = (facts.userProfile?.length || 0) + (facts.coreIdentity?.length || 0);
  console.log(`[ROUTER] Personal facts cache refreshed. Count: ${count}`);
  return facts;
}

/**
 * Invalidate the personal facts cache.
 * Call this immediately after saving a new PERSONAL_FACT so the next
 * AI response already includes it.
 */
function invalidatePersonalFactsCache() {
  _personalFactsCache = null;
  _personalFactsCacheTime = 0;
  console.log('[ROUTER] Personal facts cache invalidated. Will re-fetch on next message.');
}

// ============================================================
// [PHASE 6] IDENTITY MODEL CACHE
// Cache untuk 7-Layer Identity Model yang sudah terkonfirmasi.
// TTL lebih pendek (15 menit) agar update dari Approve tombol
// Telegram langsung terasa di percakapan berikutnya.
// ============================================================
let _identityModelCache = null;

let _identityModelCacheTime = 0;

const IDENTITY_CACHE_TTL_MS = 15 * 60 * 1000;

// 15 menit

/**
 * Load Identity Model (7 Layer) dengan caching.
 * Return-nya: Map dari layer ke array trait objects.
 * Contoh: { HABITS: [{trait_key, trait_value}, ...], PREFERENCES: [...], ... }
 */
async function loadIdentityModelWithCache() {
  const now = Date.now();
  if (_identityModelCache !== null && (now - _identityModelCacheTime) < IDENTITY_CACHE_TTL_MS) {
    return _identityModelCache;
  }

  try {
    const traits = await supabaseMemories.getIdentityModel(); // Ambil semua layer
    // Kelompokkan per layer untuk akses cepat
    const grouped = {};
    for (const trait of (traits || [])) {
      if (!grouped[trait.layer]) grouped[trait.layer] = [];
      grouped[trait.layer].push(trait);
    }
    _identityModelCache = grouped;
    _identityModelCacheTime = now;
    const total = (traits || []).length;
    if (total > 0) {
      console.log(`[ROUTER] Identity Model cache refreshed. ${total} traits across ${Object.keys(grouped).length} layers.`);
    }
  } catch (err) {
    console.warn('[ROUTER] Failed to load Identity Model (table may not exist yet):', err.message);
    _identityModelCache = {}; // Cache kosong agar tidak retry terus-menerus
    _identityModelCacheTime = now;
  }

  return _identityModelCache;
}

/**
 * Invalidate Identity Model cache.
 * Dipanggil dari webhook.js setelah Tuan Faqih menekan APPROVE
 * agar AI langsung menggunakan identitas yang baru dikonfirmasi.
 */
function invalidateIdentityModelCache() {
  _identityModelCache = null;
  _identityModelCacheTime = 0;
  console.log('[ROUTER] Identity Model cache invalidated. Will re-fetch on next message.');
}

// ============================================================
// [PHASE 8] SELF MODEL CACHE
// Cache untuk Top-5 Self Model traits dari nexa_self_model.
// Menghilangkan live database query di setiap pesan masuk.
// ============================================================
let _selfModelCache = null;

let _selfModelCacheTime = 0;

const SELF_MODEL_CACHE_TTL_MS = 15 * 60 * 1000;

// 15 menit

async function loadSelfModelWithCache(limit = 5) {
  const now = Date.now();
  if (_selfModelCache !== null && (now - _selfModelCacheTime) < SELF_MODEL_CACHE_TTL_MS) {
    return _selfModelCache;
  }
  try {
    const supabaseMem = require('../../infrastructure/Supabase_Memories');
    const data = await supabaseMem.getSelfModel(limit);
    _selfModelCache = data || [];
    _selfModelCacheTime = now;
    return _selfModelCache;
  } catch (e) {
    console.warn('[ROUTER] Failed to load Self Model cache:', e.message);
    _selfModelCache = [];
    _selfModelCacheTime = now;
    return [];
  }
}

function invalidateSelfModelCache() {
  _selfModelCache = null;
  _selfModelCacheTime = 0;
  console.log('[ROUTER] Self Model cache invalidated. Will re-fetch on next message.');
}

module.exports = {
  CACHE_TTL_MS,
  loadPersonalFactsWithCache,
  invalidatePersonalFactsCache,
  IDENTITY_CACHE_TTL_MS,
  loadIdentityModelWithCache,
  invalidateIdentityModelCache,
  SELF_MODEL_CACHE_TTL_MS,
  loadSelfModelWithCache,
  invalidateSelfModelCache
};
