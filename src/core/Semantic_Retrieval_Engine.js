// ============================================================
// N.E.X.A 3.0 — LOCAL ONNX SEMANTIC RETRIEVAL ENGINE
// Powered by Hugging Face Transformers.js (Xenova/multilingual-e5-small)
// Runs 100% locally on CPU (AMD EPYC) inside Node.js runtime.
// Zero External API dependency, Zero token cost, ~11ms latency.
// ============================================================

const path = require('path');
const { pipeline, env } = require('@xenova/transformers');
const supabaseMemories = require('../infrastructure/Supabase_Memories');

// Arahkan cache model ke folder lokal server
env.cacheDir = path.resolve(__dirname, '../../.cache/models');

let _extractor = null;
let _isInitializing = false;
let _isReady = false;

// In-Memory Vector Cache
let _cachedProfileVectors = [];   // Array of { id, content, vector: float[] }
let _cachedIdentityVectors = [];  // Array of { id, content, vector: float[] }
let _lastSyncTimestamp = 0;

/**
 * Cosine similarity antara dua vektor yang sudah dinormalisasi (Unit Vectors).
 * Untuk vektor normalisasi, Cosine Similarity identik dengan Dot Product (O(N)).
 */
function cosineSimilarity(vecA, vecB) {
  if (!vecA || !vecB || vecA.length !== vecB.length) return 0;
  let dotProduct = 0;
  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
  }
  return dotProduct;
}

/**
 * Inisialisasi Model AI Lokal & In-Memory Vector Cache saat server boot.
 * Dijalankan sekali saat server start (asynchronous, non-blocking).
 */
async function initSemanticEngine() {
  if (_isReady) return true;
  if (_isInitializing) return false;

  _isInitializing = true;
  const startTime = Date.now();
  console.log('[SEMANTIC-ENGINE] 🧠 Menginisialisasi Local ONNX Embedding Model (multilingual-e5-small)...');

  try {
    // 1. Load INT8 Quantized Model (~40 MB)
    _extractor = await pipeline('feature-extraction', 'Xenova/multilingual-e5-small', {
      quantized: true
    });
    console.log(`[SEMANTIC-ENGINE] ✅ Model AI lokal berhasil dimuat ke RAM (${Date.now() - startTime} ms).`);

    // 2. Sinkronkan dan hitung vektor untuk seluruh fakta di database
    await syncAllMemoryVectors();

    _isReady = true;
    _isInitializing = false;
    console.log(`[SEMANTIC-ENGINE] 🚀 Engine siap melayani penelusuran semantik real-time (Total ${Date.now() - startTime} ms).`);
    return true;
  } catch (err) {
    _isInitializing = false;
    console.error('[SEMANTIC-ENGINE] ❌ Gagal menginisialisasi Semantic Engine:', err.message);
    return false;
  }
}

/**
 * Komputasi vektor embedding untuk sebuah string teks.
 * @param {string} text
 * @returns {Promise<number[]>} Vektor float 384 dimensi
 */
async function computeEmbedding(text) {
  if (!_extractor || !text) return [];
  // e5-small merekomendasikan prefiks "query: " atau "passage: " untuk hasil optimal
  const formattedText = String(text).trim();
  const output = await _extractor(formattedText, { pooling: 'mean', normalize: true });
  return Array.from(output.data);
}

/**
 * Mengambil semua fakta ACTIVE dari database dan menghitung vektornya di RAM.
 */
async function syncAllMemoryVectors() {
  if (!_extractor) return;
  const syncStart = Date.now();

  try {
    const facts = await supabaseMemories.getPersonalFacts();
    const userProfile = facts.userProfile || [];
    const coreIdentity = facts.coreIdentity || [];

    const newProfileVectors = [];
    for (let i = 0; i < userProfile.length; i++) {
      const content = userProfile[i];
      if (!content || typeof content !== 'string') continue;
      const vector = await computeEmbedding(content);
      newProfileVectors.push({ id: i + 1, content, vector });
    }

    const newIdentityVectors = [];
    for (let i = 0; i < coreIdentity.length; i++) {
      const content = coreIdentity[i];
      if (!content || typeof content !== 'string') continue;
      const vector = await computeEmbedding(content);
      newIdentityVectors.push({ id: i + 1, content, vector });
    }

    _cachedProfileVectors = newProfileVectors;
    _cachedIdentityVectors = newIdentityVectors;
    _lastSyncTimestamp = Date.now();

    console.log(`[SEMANTIC-ENGINE] 📊 Vektor RAM dimutakhirkan: ${_cachedProfileVectors.length} User Profile + ${_cachedIdentityVectors.length} Core Identity (${Date.now() - syncStart} ms).`);
  } catch (err) {
    console.warn('[SEMANTIC-ENGINE] ⚠️ Gagal sinkronisasi vektor memori:', err.message);
  }
}

/**
 * Cari fakta yang paling relevan secara semantik berdasarkan pesan input pengguna.
 * @param {string} userQuery - Pesan mentah dari pengguna
 * @param {object} options - { topKProfile, topKIdentity, minScore }
 * @returns {Promise<{profileFacts: string[], identityFacts: string[], stats: object}>}
 */
async function retrieveRelevantFacts(userQuery, options = {}) {
  const {
    topKProfile = 6,
    topKIdentity = 6,
    minScore = 0.75 // Ambang batas relevansi semantik (0.0 - 1.0)
  } = options;

  if (!_isReady || !_extractor || !userQuery || typeof userQuery !== 'string') {
    return { profileFacts: [], identityFacts: [], stats: { available: false } };
  }

  const queryStart = process.hrtime.bigint();

  try {
    // 1. Ekstrak vektor pertanyaan pengguna (~10 ms)
    const queryVector = await computeEmbedding(userQuery);
    if (!queryVector || queryVector.length === 0) {
      return { profileFacts: [], identityFacts: [], stats: { available: false } };
    }

    // 2. Hitung Cosine Similarity terhadap User Profile di RAM (~0.1 ms)
    const scoredProfiles = _cachedProfileVectors
      .map(item => ({
        content: item.content,
        score: cosineSimilarity(queryVector, item.vector)
      }))
      .filter(item => item.score >= minScore)
      .sort((a, b) => b.score - a.score)
      .slice(0, topKProfile)
      .map(item => item.content);

    // 3. Hitung Cosine Similarity terhadap Core Identity di RAM (~0.1 ms)
    const scoredIdentities = _cachedIdentityVectors
      .map(item => ({
        content: item.content,
        score: cosineSimilarity(queryVector, item.vector)
      }))
      .filter(item => item.score >= minScore)
      .sort((a, b) => b.score - a.score)
      .slice(0, topKIdentity)
      .map(item => item.content);

    const queryEnd = process.hrtime.bigint();
    const latencyMs = Number(queryEnd - queryStart) / 1000000;

    return {
      profileFacts: scoredProfiles,
      identityFacts: scoredIdentities,
      stats: {
        available: true,
        latencyMs: Number(latencyMs.toFixed(2)),
        matchedProfileCount: scoredProfiles.length,
        matchedIdentityCount: scoredIdentities.length
      }
    };
  } catch (err) {
    console.warn('[SEMANTIC-ENGINE] ⚠️ Error during semantic retrieval:', err.message);
    return { profileFacts: [], identityFacts: [], stats: { available: false, error: err.message } };
  }
}

/**
 * Invalidate dan hitung ulang vektor di RAM saat ada fakta baru disimpan.
 */
function invalidateSemanticCache() {
  console.log('[SEMANTIC-ENGINE] 🔄 Invalidate RAM vector cache...');
  syncAllMemoryVectors().catch(e => console.warn('[SEMANTIC-ENGINE] Background sync failed:', e.message));
}

function isSemanticEngineReady() {
  return _isReady;
}

module.exports = {
  initSemanticEngine,
  retrieveRelevantFacts,
  computeEmbedding,
  syncAllMemoryVectors,
  invalidateSemanticCache,
  isSemanticEngineReady
};
