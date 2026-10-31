// ============================================================
// N.E.X.A 3.3 — ULTRA-LIGHTWEIGHT GEMINI VECTOR RETRIEVAL CACHE
// Powered by Google Gemini Cloud Embedding (gemini-embedding-2)
// 0 MB Model Weights on Disk, 0 MB Neural RAM Overhead on VPS.
// Fully Masked Parallel Execution with In-Memory Snapshot Cache.
// ============================================================

const fs = require('fs');
const path = require('path');
const supabaseMemories = require('../infrastructure/Supabase_Memories');

const SNAPSHOT_PATH = path.resolve(__dirname, '../../data/facts_vectors.json');
const CAPABILITIES_SNAPSHOT_PATH = path.resolve(__dirname, '../../data/capabilities_vectors.json');
const CAPABILITIES_CARDS_PATH = path.resolve(__dirname, '../../data/capabilities_cards.json');

const googleApiKeys = [
  process.env.GEMINI_API_KEY_1 || process.env.GEMINI_API_KEY,
  process.env.GEMINI_API_KEY_2,
  process.env.GEMINI_API_KEY_3,
  process.env.GEMINI_API_KEY_4
].filter(Boolean);

let _keyIndex = 0;
function getNextApiKey() {
  if (googleApiKeys.length === 0) return '';
  const key = googleApiKeys[_keyIndex % googleApiKeys.length];
  _keyIndex = (_keyIndex + 1) % googleApiKeys.length;
  return key;
}

// In-Memory Vector Storage (~300 KB RAM)
let _cachedProfileVectors = [];   // Array of { id, content, vector: float[] }
let _cachedIdentityVectors = [];  // Array of { id, content, vector: float[] }
let _cachedCapabilityVectors = []; // Array of capability objects with vector: float[]
let _isSnapshotLoaded = false;

// Kata kunci rasa ingin tahu arsitektur / mekanisme fitur
const ARCHITECTURE_CURIOSITY_REGEX = /\b(gimana|bagaimana|apa itu|itu apa|apa maksud|cara kerja|sistem kerja|arsitektur|kemampuan(mu)?|bisa (apa|ngapain|lakukan)|fitur (apa|kamu|mu)?|mekanisme|detail teknis|penjelasan teknis|spesifikasi|ngapain aja)\b/i;

// Pola pertanyaan kapabilitas spesifik ("bisa ga...", "apakah bisa...")
const CAPABILITY_QUERY_REGEX = /\b(bisa (nggak|ga|ngga|tidak|kah)|apakah (bisa|kamu bisa)|mampu (nggak|ga|kah)|kamu bisa (apa|ngapain)?)\b/i;

/**
 * Cosine similarity antara dua vektor float.
 */
function cosineSimilarity(vecA, vecB) {
  if (!vecA || !vecB || vecA.length !== vecB.length) return 0;
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dotProduct / denom;
}

/**
 * Muat file snapshot fakta_vectors.json dan capabilities_vectors.json ke RAM saat server boot.
 * Waktu eksekusi: ~1–2 milidetik (0.001 detik).
 */
function loadVectorSnapshot() {
  try {
    if (fs.existsSync(SNAPSHOT_PATH)) {
      const rawData = fs.readFileSync(SNAPSHOT_PATH, 'utf-8');
      const parsed = JSON.parse(rawData);
      _cachedProfileVectors = parsed.profiles || [];
      _cachedIdentityVectors = parsed.identities || [];
    } else {
      console.log('[VECTOR-CACHE] ℹ️ Snapshot vectors belum ada di data/facts_vectors.json. Menjalankan fallback leksikal.');
    }

    // Muat snapshot kapabilitas Tier 1 (jika ada)
    if (fs.existsSync(CAPABILITIES_SNAPSHOT_PATH)) {
      const capData = fs.readFileSync(CAPABILITIES_SNAPSHOT_PATH, 'utf-8');
      _cachedCapabilityVectors = JSON.parse(capData);
    } else if (fs.existsSync(CAPABILITIES_CARDS_PATH)) {
      const cardData = fs.readFileSync(CAPABILITIES_CARDS_PATH, 'utf-8');
      _cachedCapabilityVectors = JSON.parse(cardData).map(c => ({ ...c, vector: [] }));
    }

    _isSnapshotLoaded = true;

    console.log(`[VECTOR-CACHE] ⚡ Snapshot vektor dimuat ke RAM: ${_cachedProfileVectors.length} Profiles + ${_cachedIdentityVectors.length} Identities + ${_cachedCapabilityVectors.length} Capabilities (0.001s).`);
    return true;
  } catch (err) {
    console.warn('[VECTOR-CACHE] ⚠️ Gagal memuat snapshot vektor:', err.message);
    return false;
  }
}

/**
 * Hitung vektor dari pertanyaan pengguna via Google Gemini Cloud Embedding.
 * Dilengkapi rotasi 4 kunci API dan pelindung timeout ketat (1.5 detik).
 * @param {string} text
 * @param {number} timeoutMs
 * @returns {Promise<number[]>}
 */
async function computeQueryVector(text, timeoutMs = 1500) {
  if (!text || typeof text !== 'string') return [];
  const cleanText = text.trim();
  if (cleanText.length < 3) return [];

  const models = ['gemini-embedding-2', 'gemini-embedding-001'];

  for (let i = 0; i < googleApiKeys.length; i++) {
    const apiKey = getNextApiKey();
    for (const model of models) {
      try {
        const baseUrl = (process.env.GEMINI_BASE_URL || 'https://generativelanguage.googleapis.com').replace(/\/$/, '');
        const url = `${baseUrl}/v1beta/models/${model}:embedContent`;
        const res = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': apiKey
          },
          body: JSON.stringify({
            content: { parts: [{ text: cleanText }] }
          }),
          signal: AbortSignal.timeout(timeoutMs) // Timeout guard
        });

        if (!res.ok) continue;
        const data = await res.json();
        const vals = data.embedding?.values;
        if (Array.isArray(vals) && vals.length > 0) {
          return vals;
        }
      } catch (e) {
        // Coba key/model berikutnya
      }
    }
  }

  if (cleanText.length >= 3) {
    console.warn(`[VECTOR-CACHE] ⚠️ Gagal menghitung embedding query: "${cleanText.substring(0, 30)}..." (Semua key/model embedding gagal atau timeout).`);
  }
  return [];
}

/**
 * Cari kartu detail kapabilitas Tier 1 di RAM secara on-demand.
 * Menerapkan Gating ketat agar 95% chat harian tidak dibebani token ekstra.
 * @param {string} userQuery
 * @param {number[]} [queryVector=null]
 * @param {object} [options]
 * @returns {{ card: object, score: number, reason: string }|null}
 */
function getRelevantCapability(userQuery, queryVector = null, options = {}) {
  if (!_cachedCapabilityVectors || _cachedCapabilityVectors.length === 0 || !userQuery || typeof userQuery !== 'string') {
    return null;
  }

  const cleanQuery = userQuery.trim().toLowerCase();
  if (cleanQuery.length < 3) return null;

  const hasCuriosity = ARCHITECTURE_CURIOSITY_REGEX.test(cleanQuery);
  const hasCapabilityQuery = CAPABILITY_QUERY_REGEX.test(cleanQuery);

  // Jika bukan pertanyaan arsitektur/kapabilitas (misal aksi kas, jadwal normal), jangan buang token
  if (!hasCuriosity && !hasCapabilityQuery) {
    return null;
  }

  let bestCard = null;
  let bestScore = -1;
  let matchReason = '';

  // A. Semantic Vector Matching (Zero extra API cost jika queryVector sudah dihitung)
  if (Array.isArray(queryVector) && queryVector.length > 0) {
    for (const cap of _cachedCapabilityVectors) {
      if (!Array.isArray(cap.vector) || cap.vector.length === 0) continue;
      const sim = cosineSimilarity(queryVector, cap.vector);
      if (sim > bestScore) {
        bestScore = sim;
        bestCard = cap;
        matchReason = 'vector';
      }
    }
  }

  // B. Lexical / Keyword Resonance Matching (Fallback atau Penguat)
  let bestLexicalCard = null;
  let bestLexicalScore = 0;
  for (const cap of _cachedCapabilityVectors) {
    let score = 0;
    const titleLower = (cap.title || '').toLowerCase();
    const domainLower = (cap.domain || '').toLowerCase();

    if (cleanQuery.includes(titleLower)) score += 5;
    if (cleanQuery.includes(domainLower)) score += 2;

    // Check title words (e.g. 'android', 'keuangan', 'jadwal')
    const titleWords = titleLower.split(/[\s,()&]+/).filter(w => w.length >= 4);
    for (const tw of titleWords) {
      if (cleanQuery.includes(tw)) score += 2;
    }

    if (Array.isArray(cap.keywords)) {
      for (const kw of cap.keywords) {
        const kwLower = kw.toLowerCase();
        if (cleanQuery.includes(kwLower)) {
          score += 3;
        } else {
          const parts = kwLower.split(' ').filter(p => p.length >= 3);
          for (const p of parts) {
            if (cleanQuery.includes(p)) score += 1;
          }
        }
      }
    }
    if (score > bestLexicalScore) {
      bestLexicalScore = score;
      bestLexicalCard = cap;
    }
  }

  // Jika sinyal leksikal kuat (keyword spesifik cocok), prioritaskan atau gunakan sebagai baseline
  if (bestLexicalScore >= 3 && (!bestCard || bestScore < 0.60)) {
    bestCard = bestLexicalCard;
    bestScore = Math.max(bestScore, 0.70);
    matchReason = 'keyword';
  }

  // Ambang batas seleksi
  // Curiosity ("gimana cara kerja"): threshold 0.55
  // Pertanyaan kapabilitas ("bisa ga"): threshold 0.65
  const threshold = hasCuriosity ? 0.55 : 0.65;

  if (bestCard && bestScore >= threshold) {
    return {
      card: {
        id: bestCard.id,
        domain: bestCard.domain,
        title: bestCard.title,
        summary: bestCard.summary,
        details: bestCard.details,
        keywords: bestCard.keywords,
        status: bestCard.status
      },
      score: Number(bestScore.toFixed(4)),
      reason: matchReason
    };
  }

  return null;
}

/**
 * Cari fakta paling relevan di RAM berdasarkan vektor query pengguna.
 * @param {string} userQuery
 * @param {object} options
 * @returns {Promise<{profileFacts: string[], identityFacts: string[], capabilityCard: object|null, stats: object}>}
 */
async function getRelevantFacts(userQuery, options = {}) {
  const {
    topKProfile = 6,
    topKIdentity = 6,
    minScore = 0.58 // Ambang batas kemiripan semantik Google Gemini
  } = options;

  if (!_isSnapshotLoaded || !userQuery || typeof userQuery !== 'string') {
    return { profileFacts: [], identityFacts: [], capabilityCard: null, stats: { available: false } };
  }

  const startTime = process.hrtime.bigint();

  try {
    // 1. Ambil vektor query via Google Cloud Embedding (~200-800 ms)
    const queryVector = await computeQueryVector(userQuery, 2500);
    if (!queryVector || queryVector.length === 0) {
      return { profileFacts: [], identityFacts: [], capabilityCard: null, stats: { available: false } };
    }

    // 2. Hitung kemiripan terhadap Profil Pengguna di RAM (~0.1 ms)
    const matchedProfiles = _cachedProfileVectors
      .map(item => ({
        content: item.content,
        score: cosineSimilarity(queryVector, item.vector)
      }))
      .filter(item => item.score >= minScore)
      .sort((a, b) => b.score - a.score)
      .slice(0, topKProfile)
      .map(item => item.content);

    // 3. Hitung kemiripan terhadap Core Identity di RAM (~0.1 ms)
    const matchedIdentities = _cachedIdentityVectors
      .map(item => ({
        content: item.content,
        score: cosineSimilarity(queryVector, item.vector)
      }))
      .filter(item => item.score >= minScore)
      .sort((a, b) => b.score - a.score)
      .slice(0, topKIdentity)
      .map(item => item.content);

    // 4. Hitung kemiripan kapabilitas arsitektur Tier 1 di RAM (~0.05 ms)
    const capabilityMatch = getRelevantCapability(userQuery, queryVector, options);
    const capabilityCard = capabilityMatch ? capabilityMatch.card : null;

    const endTime = process.hrtime.bigint();
    const latencyMs = Number(endTime - startTime) / 1000000;

    return {
      profileFacts: matchedProfiles,
      identityFacts: matchedIdentities,
      capabilityCard,
      stats: {
        available: true,
        latencyMs: Number(latencyMs.toFixed(2)),
        matchedProfileCount: matchedProfiles.length,
        matchedIdentityCount: matchedIdentities.length,
        matchedCapability: capabilityCard ? capabilityCard.id : null
      }
    };
  } catch (err) {
    return { profileFacts: [], identityFacts: [], capabilityCard: null, stats: { available: false, error: err.message } };
  }
}

/**
 * Batch Embedding Generator untuk sinkronisasi snapshot file.
 */
async function generateAndSaveSnapshot() {
  console.log('[VECTOR-CACHE] 🔄 Memulai pembuatan snapshot vektor dari Supabase...');
  const start = Date.now();

  const facts = await supabaseMemories.getPersonalFacts();
  const userProfile = facts.userProfile || [];
  const coreIdentity = facts.coreIdentity || [];

  async function batchEmbedList(list) {
    const results = [];
    const chunkSize = 25; // Kirim per 25 fakta sekaligus dalam 1 request HTTP
    for (let i = 0; i < list.length; i += chunkSize) {
      const chunk = list.slice(i, i + chunkSize);
      const requests = chunk.map(text => ({
        model: 'models/gemini-embedding-2',
        content: { parts: [{ text }] }
      }));

      const apiKey = getNextApiKey();
      const baseUrl = (process.env.GEMINI_BASE_URL || 'https://generativelanguage.googleapis.com').replace(/\/$/, '');
      const url = `${baseUrl}/v1beta/models/gemini-embedding-2:batchEmbedContents`;
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey
        },
        body: JSON.stringify({ requests })
      });

      if (!res.ok) {
        throw new Error(`Batch embed failed: ${res.statusText}`);
      }

      const data = await res.json();
      const embeddings = data.embeddings || [];
      chunk.forEach((content, idx) => {
        results.push({
          id: i + idx + 1,
          content,
          vector: embeddings[idx]?.values || []
        });
      });
    }
    return results;
  }

  const profileVectors = await batchEmbedList(userProfile);
  const identityVectors = await batchEmbedList(coreIdentity);

  const dataDir = path.dirname(SNAPSHOT_PATH);
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  const payload = {
    generated_at: new Date().toISOString(),
    total_profiles: profileVectors.length,
    total_identities: identityVectors.length,
    profiles: profileVectors,
    identities: identityVectors
  };

  atomicWriteJsonSync(SNAPSHOT_PATH, payload);
  console.log(`[VECTOR-CACHE] ✅ Snapshot berhasil disimpan secara atomik ke ${SNAPSHOT_PATH} (${Date.now() - start} ms).`);
  loadVectorSnapshot();
  return payload;
}

function atomicWriteJsonSync(targetPath, data) {
  const tmpPath = `${targetPath}.${Date.now()}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify(data), 'utf-8');
  fs.renameSync(tmpPath, targetPath);
}

function isSnapshotReady() {
  return _isSnapshotLoaded;
}

/**
 * Tambahkan fakta baru ke cache RAM & perbarui snapshot di disk secara asinkron (Auto-Sync)
 * @param {string} content
 * @param {'USER_PROFILE'|'CORE_IDENTITY'} type
 */
async function appendFactToVectorCache(content, type = 'USER_PROFILE') {
  if (!content || typeof content !== 'string') return;
  try {
    const vec = await computeQueryVector(content, 3000);
    if (!vec || vec.length === 0) return;

    const newItem = {
      id: Date.now(),
      content: content.trim(),
      vector: vec
    };

    if (type === 'CORE_IDENTITY') {
      _cachedIdentityVectors.push(newItem);
    } else {
      _cachedProfileVectors.push(newItem);
    }

    // Tulis snapshot baru ke disk
    const payload = {
      generated_at: new Date().toISOString(),
      total_profiles: _cachedProfileVectors.length,
      total_identities: _cachedIdentityVectors.length,
      profiles: _cachedProfileVectors,
      identities: _cachedIdentityVectors
    };
    atomicWriteJsonSync(SNAPSHOT_PATH, payload);
    console.log(`[VECTOR-CACHE] ⚡ Fakta baru otomatis ter-embed & masuk ke snapshot (${type}): "${content.substring(0, 50)}..."`);
  } catch (e) {
    console.warn('[VECTOR-CACHE] Gagal auto-embed fakta baru:', e.message);
  }
}

module.exports = {
  loadVectorSnapshot,
  computeQueryVector,
  getRelevantFacts,
  getRelevantCapability,
  ARCHITECTURE_CURIOSITY_REGEX,
  CAPABILITY_QUERY_REGEX,
  getCachedCapabilityVectors: () => _cachedCapabilityVectors,
  generateAndSaveSnapshot,
  isSnapshotReady,
  appendFactToVectorCache
};
