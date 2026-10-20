/**
 * ============================================================
 * [N.E.X.A] router/Router_Selectors.js
 * Seleksi fakta relevan (stemming, token resonansi, skor) untuk profil/identitas/vault
 *
 * Bagian dari modularisasi AI_Router.js (facade: ../AI_Router.js).
 * Kode dipindahkan verbatim oleh scripts/refactor/split_supabase_memories.js;
 * satu-satunya perubahan adalah jalur require relatif (+1 level).
 * ============================================================
 */

// ============================================================
// PROGRESSIVE FACT INJECTION
// ============================================================
const PROFILE_CORE_COUNT = 10;

// fakta tertua — selalu diinjeksi (cukup 10 karena info dasar sudah di personality.js)
const PROFILE_KW_LIMIT = 10;

// max fakta tambahan dari dynamic word resonance (penting untuk membangun kedekatan)
const IDENTITY_CORE_COUNT = 10;

// 10 identitas pokok — selalu diinjeksi (wajib)
const IDENTITY_KW_LIMIT = 5;

// ============================================================
// SEMANTIC KEYWORD & DOMAIN CLUSTERS FOR RESONANCE
// ============================================================
const SHORT_TECH_ALLOWLIST = new Set([
  'hp', 'gps', 'tts', 'dnd', 'app', 'wa', 'pin', 'sim', 'cam', 'ui', 'vn', 'api', 'os', 'ai', 'qris', 'bca', 'bri', 'rek', 'id'
]);

const DOMAIN_KEYWORD_SYNONYMS = {
  // Mobile & Hardware Peripherals
  'hp': ['hp', 'ponsel', 'samsung', 'perangkat', 'android', 'bridge', 'device', 'mobile'],
  'ponsel': ['hp', 'ponsel', 'samsung', 'perangkat', 'android', 'bridge', 'device', 'mobile'],
  'senter': ['senter', 'flashlight', 'lampu'],
  'kamera': ['kamera', 'foto', 'photo', 'camera', 'swafoto', 'take_photo'],
  'foto': ['kamera', 'foto', 'photo', 'camera', 'swafoto', 'take_photo', 'gambar'],
  'screenshot': ['screenshot', 'tangkapan layar', 'capture', 'layar'],
  'layar': ['layar', 'screen', 'hierarchy', 'ui', 'dump_ui_hierarchy', 'screenshot', 'kunci'],
  'baterai': ['baterai', 'battery', 'daya', 'charging', 'telemetri'],
  'volume': ['volume', 'suara', 'speaker', 'audio', 'set_volume'],
  'dnd': ['dnd', 'jangan ganggu', 'force_dnd'],

  // Voice & Real-Time Call Interaction
  'telepon': ['telepon', 'call', 'panggilan', 'dering', 'ringtone', 'fakecallactivity', 'simulate_incoming_call'],
  'call': ['telepon', 'call', 'panggilan', 'dering', 'ringtone', 'fakecallactivity', 'simulate_incoming_call'],
  'panggilan': ['telepon', 'call', 'panggilan', 'dering', 'ringtone', 'fakecallactivity', 'simulate_incoming_call'],
  'suara': ['suara', 'voice', 'audio', 'tts', 'whisper', 'pcm', 'bicara', 'speak_text', 'transkripsi'],
  'rekam': ['rekam', 'suara', 'audio', 'recording', 'pcm', 'mic', 'mikrofon'],

  // Spatial & OpenStreetMap Navigation
  'lokasi': ['lokasi', 'gps', 'posisi', 'koordinat', 'get_location', 'geofence', 'spatial', 'tempat', 'terdekat'],
  'gps': ['lokasi', 'gps', 'posisi', 'koordinat', 'get_location', 'geofence', 'spatial', 'tempat', 'terdekat'],
  'tempat': ['lokasi', 'tempat', 'terdekat', 'spbu', 'bensin', 'pom', 'cafe', 'warkop', 'resto', 'atm', 'nominatim', 'photon', 'osrm'],
  'rute': ['rute', 'arah', 'jarak', 'osrm', 'navigasi', 'maps'],
  'bensin': ['spbu', 'pertamina', 'pom bensin', 'bensin', 'lokasi'],
  'spbu': ['spbu', 'pertamina', 'pom bensin', 'bensin', 'lokasi'],

  // Hands & Accessibility Gestures
  'klik': ['klik', 'click', 'accessibility', 'accessibility_click', 'sentuh', 'tombol'],
  'ketik': ['ketik', 'input', 'input_text', 'accessibility', 'formulir'],
  'scroll': ['scroll', 'gulir', 'accessibility', 'accessibility_scroll'],
  'clipboard': ['clipboard', 'papan klip', 'salin', 'copy', 'paste', 'get_clipboard', 'set_clipboard'],
  'buka': ['launch_app', 'open_intent', 'buka', 'aplikasi', 'app'],

  // Banking & Financial Shield
  'bank': ['bank', 'perbankan', 'm-banking', 'mbankingshieldmanager', 'bca', 'livin', 'brimo', 'pin', 'keamanan', 'aksesibilitas'],
  'pin': ['pin', 'password', 'keamanan', 'm-banking', 'mbankingshieldmanager'],

  // Temporal & Time Awareness (UTC+7 WIB)
  'waktu': ['waktu', 'jam', 'hari', 'tanggal', 'bulan', 'tahun', 'temporal', 'utc+7', 'wib', 'jakarta', 'sapaan'],
  'jam': ['waktu', 'jam', 'hari', 'tanggal', 'bulan', 'tahun', 'temporal', 'utc+7', 'wib', 'jakarta', 'sapaan'],
  'hari': ['waktu', 'jam', 'hari', 'tanggal', 'bulan', 'tahun', 'temporal', 'utc+7', 'wib', 'jakarta', 'kalender'],
  'tanggal': ['waktu', 'jam', 'hari', 'tanggal', 'bulan', 'tahun', 'temporal', 'utc+7', 'wib', 'jakarta', 'iso'],

  // SACR & AI Fallback Architecture (Selective On-Demand Injection)
  'fallback': ['fallback', 'tier', 'sacr', 'failover', 'arsitektur', 'cerebras', 'gemini', 'gemma', 'heavy', 'light', 'mode'],
  'tier': ['fallback', 'tier', 'sacr', 'failover', 'cerebras', 'gemini', 'gemma', 'heavy', 'light'],
  'sacr': ['sacr', 'fallback', 'tier', 'cerebras', 'gemini', 'gemma', 'heavy', 'light'],
  'heavy': ['heavy', 'sacr', 'fallback', 'tier', 'mode'],
  'light': ['light', 'sacr', 'fallback', 'tier', 'mode'],
  'urutan': ['urutan', 'fallback', 'tier', 'sacr', 'mode', 'heavy', 'light']
};

/**
 * Fast Indonesian Stemmer & Morphological Root Extractor (0ms CPU)
 * Cleans affixes: me-, men-, meng-, mem-, meny-, di-, ke-, pe-, pem-, pen-, peng-, peny-, ber-, ter-, se-
 * Suffixes: -kan, -an, -i, -nya, -ku, -mu, -lah, -kah
 */
function _stemIndonesianWord(word) {
  if (!word || word.length < 4) return word;
  let w = word.toLowerCase();

  // Suffix stripping
  w = w.replace(/(?:lah|kah|pun|tah|ku|mu|nya)$/, '');
  w = w.replace(/(?:kan|an|i)$/, '');

  // Prefix stripping
  if (w.startsWith('meng') || w.startsWith('peng')) {
    w = w.replace(/^(?:meng|peng)/, '');
  } else if (w.startsWith('meny') || w.startsWith('peny')) {
    w = 's' + w.replace(/^(?:meny|peny)/, '');
  } else if (w.startsWith('mem') || w.startsWith('pem')) {
    w = w.replace(/^(?:mem|pem)/, '');
  } else if (w.startsWith('men') || w.startsWith('pen')) {
    w = w.replace(/^(?:men|pen)/, '');
  } else if (w.startsWith('ber') || w.startsWith('ter') || w.startsWith('per')) {
    w = w.replace(/^(?:ber|ter|per)/, '');
  } else if (w.startsWith('di') || w.startsWith('ke') || w.startsWith('se')) {
    w = w.replace(/^(?:di|ke|se)/, '');
  }

  return w.length >= 3 ? w : word;
}

/**
 * Universal token extraction: extracts raw words, Indonesian stemmed roots, tech acronyms, and semantic clusters.
 */
function _extractResonanceTokens(userMessage) {
  if (!userMessage) return [];
  const stopWords = new Set(['yang', 'akan', 'bisa', 'dari', 'pada', 'untuk', 'dengan', 'dalam', 'tidak', 'sudah', 'telah', 'agar', 'atau', 'saat', 'mau', 'ini', 'itu', 'karena', 'kalau', 'jika', 'kemudian', 'mengapa', 'bagaimana', 'nexa', 'tuan', 'faqih', 'sistem', 'adalah', 'yaitu', 'merupakan', 'oleh', 'sebagai', 'harus', 'wajib', 'juga', 'lagi', 'saja', 'tadi', 'baru', 'banyak', 'coba', 'tolong', 'apakah']);
  const msgStr = typeof userMessage === 'string' ? userMessage.toLowerCase() : String(userMessage || '').toLowerCase();
  const rawWords = msgStr.replace(/[^a-z0-9]/g, ' ').split(/\s+/).filter(Boolean);

  const tokens = new Set();
  for (const w of rawWords) {
    if (stopWords.has(w)) continue;
    if (w.length >= 3 || SHORT_TECH_ALLOWLIST.has(w)) {
      tokens.add(w);
      const stem = _stemIndonesianWord(w);
      if (stem && stem.length >= 3 && !stopWords.has(stem)) {
        tokens.add(stem);
      }
      if (DOMAIN_KEYWORD_SYNONYMS[w]) {
        for (const syn of DOMAIN_KEYWORD_SYNONYMS[w]) {
          tokens.add(syn);
        }
      }
      if (stem && DOMAIN_KEYWORD_SYNONYMS[stem]) {
        for (const syn of DOMAIN_KEYWORD_SYNONYMS[stem]) {
          tokens.add(syn);
        }
      }
    }
  }
  return Array.from(tokens);
}

/**
 * Menghitung bobot relevansi fakta secara universal (Exact substring + Word overlap).
 */
function _scoreFactRelevance(fact, tokens) {
  if (!fact || typeof fact !== 'string') return 0;
  const factLower = fact.toLowerCase();
  let score = 0;

  for (const token of tokens) {
    if (factLower.includes(token)) {
      score += 10;
      // Bonus jika token muncul sebagai kata utuh
      const regex = new RegExp(`\\b${token}\\b`, 'i');
      if (regex.test(factLower)) {
        score += 5;
      }
    }
  }
  return score;
}

/**
 * Dynamic Progressive userProfile Fact Injection with Semantic Resonance & Multi-Word Scoring
 */
function _selectUserProfileFacts(userProfile, userMessage, semanticMatches = []) {
  if (!userProfile || !Array.isArray(userProfile) || userProfile.length === 0) return [];

  const coreBase = userProfile.slice(0, PROFILE_CORE_COUNT);

  // Jika ada temuan semantik berkecepatan tinggi dari Google Gemini Vector Cache, utamakan temuan tersebut
  if (Array.isArray(semanticMatches) && semanticMatches.length > 0) {
    return Array.from(new Set([...semanticMatches.slice(0, PROFILE_KW_LIMIT), ...coreBase]));
  }

  const tokens = _extractResonanceTokens(userMessage);
  if (tokens.length === 0) {
    return coreBase;
  }

  // Fallback ke pencocokan leksikal jika semantik tidak aktif
  const scored = userProfile.map(fact => ({
    fact,
    score: _scoreFactRelevance(fact, tokens)
  }));

  const resonant = scored
    .filter(s => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .map(s => s.fact);

  return Array.from(new Set([...resonant.slice(0, PROFILE_KW_LIMIT), ...coreBase]));
}

/**
 * Dynamic Progressive coreIdentity Fact Injection with Semantic Resonance & Domain Trigger Scoring
 */
function _selectCoreIdentityFacts(coreIdentity, userMessage, semanticMatches = []) {
  if (!coreIdentity || !Array.isArray(coreIdentity) || coreIdentity.length === 0) return [];

  const coreBase = coreIdentity.slice(0, IDENTITY_CORE_COUNT);

  // Jika ada temuan semantik berkecepatan tinggi dari Google Gemini Vector Cache, utamakan temuan tersebut
  if (Array.isArray(semanticMatches) && semanticMatches.length > 0) {
    return Array.from(new Set([...semanticMatches.slice(0, IDENTITY_KW_LIMIT), ...coreBase]));
  }

  const tokens = _extractResonanceTokens(userMessage);
  if (tokens.length === 0) {
    return coreBase;
  }

  // Fallback ke pencocokan leksikal jika semantik tidak aktif
  const scored = coreIdentity.map(fact => ({
    fact,
    score: _scoreFactRelevance(fact, tokens)
  }));

  const resonant = scored
    .filter(s => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .map(s => s.fact);

  return Array.from(new Set([...resonant.slice(0, IDENTITY_KW_LIMIT), ...coreBase]));
}

/**
 * Lightweight Vault Document Manifest Generator.
 * Injects ONLY document titles and categories (~15 tokens) into AI Router prompt,
 * rather than dumping full 2.790 chars of raw NIK/BPJS/address JSON on casual chats.
 * Full content is retrieved on-demand by domain handlers when user queries documents.
 */
function _selectVaultFacts(vaultItems, userMessage) {
  if (!vaultItems || !Array.isArray(vaultItems) || vaultItems.length === 0) return [];

  // Generate lightweight manifest of stored files (title & category only)
  const manifest = vaultItems.slice(0, 8).map(item => {
    const match = String(item).match(/^\[([^\]]+)\]\s*([^\(\[]+)/);
    if (match) {
      return `[${match[1]}] ${match[2].trim()}`;
    }
    return String(item).replace(/\s*\(Metadata:.*?\)/i, '').substring(0, 60);
  });

  return manifest;
}

module.exports = {
  PROFILE_CORE_COUNT,
  PROFILE_KW_LIMIT,
  IDENTITY_CORE_COUNT,
  IDENTITY_KW_LIMIT,
  SHORT_TECH_ALLOWLIST,
  DOMAIN_KEYWORD_SYNONYMS,
  _stemIndonesianWord,
  _extractResonanceTokens,
  _scoreFactRelevance,
  _selectUserProfileFacts,
  _selectCoreIdentityFacts,
  _selectVaultFacts
};
