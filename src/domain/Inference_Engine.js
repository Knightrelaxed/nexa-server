/**
 * ============================================================
 * [PHASE 6] COGNITIVE INFERENCE ENGINE — Inference_Engine.js
 * ============================================================
 * Mesin Penalaran Kognitif N.E.X.A.
 *
 * TUGAS UTAMA:
 *   Setiap Minggu malam, mesin ini membaca seluruh observasi
 *   7 hari terakhir (obrolan, keuangan, check-in biologis, mood),
 *   mensintesisnya dengan AI, dan menghasilkan hipotesis terstruktur
 *   tentang kepribadian & kebiasaan Tuan Faqih (7 Layer Identitas).
 *
 * PIPELINE:
 *   nexa_behavior_log (7 hari) ─┐
 *   nexa_chat_memories (7 hari) ─┤→ AI Synthesis → Hipotesis JSON
 *   nexa_identity_model (saat ini)─┘        ↓
 *                                   Confidence Scoring
 *                                        ↓
 *                      > 85% → PENDING → Kirim ke Telegram (Approve/Reject)
 *                      60-85% → STAGED  → Simpan, konsolidasi minggu depan
 *                      < 60% → Dibuang
 *
 * PRINSIP KEAMANAN:
 *   - Mesin ini TIDAK PERNAH langsung menulis ke nexa_identity_model.
 *   - Semua perubahan WAJIB melalui approveIdentityProposal() yang
 *     dipanggil saat Tuan Faqih menekan tombol APPROVE di Telegram.
 *   - Contradiction Detector: jika perilaku baru bertentangan dengan
 *     identitas lama, mesin mengajukan proposal REVISI bukan menimpa.
 *
 * DIPANGGIL DARI:
 *   - cron.js: setiap Minggu pukul 21:00 WIB
 * ============================================================
 */

'use strict';

const { createClient } = require('@supabase/supabase-js');
const env = require('../config/env');
const { executeWithFallback } = require('../core/Fallback_Engine');

// ── Lazy Supabase client (shared pattern) ─────────────────────
let _supabase = null;
function _getSupabase() {
  if (_supabase) return _supabase;
  if (!env.SUPABASE_URL || !env.SUPABASE_KEY) return null;
  _supabase = createClient(env.SUPABASE_URL, env.SUPABASE_KEY);
  return _supabase;
}

// ── Valid 7 Layer identifiers ──────────────────────────────────
const VALID_LAYERS = new Set([
  'FACTS', 'PREFERENCES', 'HABITS', 'VALUES',
  'DECISION_STYLE', 'WEAKNESSES', 'MOTIVATIONS'
]);

// ── Minimum events threshold ───────────────────────────────────
// Jika data seminggu terlalu sedikit (<10 events), tidak perlu menjalankan inferensi
const MIN_EVENTS_THRESHOLD = 10;

// ── [PHASE 7 — M1] Memory Decay Constants ─────────────────────
// Konstanta λ (lambda) per Layer menggunakan model peluruhan Ebbinghaus:
//   confidence(t) = initial_confidence × e^(−λ × days_since_reinforcement)
// Semakin tinggi λ, semakin cepat trait dianggap kadaluarsa.
const DECAY_LAMBDA_BY_LAYER = {
  'FACTS':          0.005,  // Fakta objektif (tempat lahir, dll) — sangat stabil
  'PREFERENCES':    0.015,  // Preferensi berubah perlahan
  'HABITS':         0.040,  // Kebiasaan paling volatile
  'VALUES':         0.008,  // Nilai fundamental — sangat stabil
  'DECISION_STYLE': 0.020,  // Gaya keputusan berubah moderat
  'WEAKNESSES':     0.035,  // Hambatan bisa diatasi seiring waktu
  'MOTIVATIONS':    0.025,  // Motivasi naik-turun cukup cepat
};

// Threshold confidence di bawah mana N.E.X.A mengirim soft check-in
const CONFIDENCE_DECAY_THRESHOLD = 0.60;

// ── [PHASE 7 — M1] Tiered Approval Thresholds ─────────────────
// Tier 1: Auto-Approve tanpa interaksi user
//   - Trait SUDAH ADA di model + confidence baru naik ≤5% + diperkuat ≥5 observasi
// Tier 2: Soft-Approve (auto-approve setelah 48 jam jika tidak ada respons)
//   - Trait sudah ada + confidence bergeser 5–20%
// Tier 3: Hard-Approve (wajib klik tombol secara eksplisit)
//   - Trait BARU, kontradiksi dengan model lama, atau update pada WEAKNESSES/VALUES
const TIER1_MAX_CONFIDENCE_SHIFT = 0.05;  // ≤5% pergeseran
const TIER2_MAX_CONFIDENCE_SHIFT = 0.20;  // ≤20% pergeseran
const TIER2_SOFT_APPROVE_HOURS   = 48;    // Jam sebelum Tier 2 auto-approved
const TIER1_MIN_OBSERVATIONS     = 5;     // Minimal observasi untuk Tier 1

// ============================================================
// TAHAP 1: DATA COLLECTION — Kumpulkan observasi 7 hari terakhir
// ============================================================

/**
 * Ambil semua behavior log dari 7 hari terakhir
 * @returns {Promise<Array>}
 */
async function _getBehaviorLogs7Days() {
  const sb = _getSupabase();
  if (!sb) return [];

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await sb
    .from('nexa_behavior_log')
    .select('event_type, event_data, hour_of_day, day_of_week, created_at')
    .gte('created_at', sevenDaysAgo)
    .order('created_at', { ascending: true });

  if (error) {
    console.warn('[INFERENCE] Failed to fetch behavior logs:', error.message);
    return [];
  }
  return data || [];
}

/**
 * Ambil ringkasan chat memories 7 hari terakhir
 * (max 200 pesan untuk efisiensi token)
 * @returns {Promise<Array>}
 */
async function _getChatMemories7Days() {
  const sb = _getSupabase();
  if (!sb) return [];

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await sb
    .from('nexa_chat_memories')
    .select('role, content, created_at')
    .gte('created_at', sevenDaysAgo)
    .order('created_at', { ascending: true })
    .limit(200);

  if (error) {
    console.warn('[INFERENCE] Failed to fetch chat memories:', error.message);
    return [];
  }
  return data || [];
}

/**
 * Ambil snapshot Identity Model saat ini
 * Digunakan untuk Contradiction Detector dan dedup hipotesis
 * @returns {Promise<Array>}
 */
async function _getCurrentIdentityModel() {
  const sb = _getSupabase();
  if (!sb) return [];
  const { data, error } = await sb
    .from('nexa_identity_model')
    .select('layer, trait_key, trait_value, confidence')
    .order('layer', { ascending: true });

  if (error) {
    console.warn('[INFERENCE] Failed to fetch identity model:', error.message);
    return [];
  }
  return data || [];
}

/**
 * [PHASE 7 — M1] Ambil snapshot Identity Model LENGKAP termasuk kolom decay.
 * Digunakan oleh runDailyDecayPass dan _classifyApprovalTier.
 * @returns {Promise<Array>}
 */
async function _getCurrentIdentityModelFull() {
  const sb = _getSupabase();
  if (!sb) return [];
  const { data, error } = await sb
    .from('nexa_identity_model')
    .select('id, layer, trait_key, trait_value, confidence, last_reinforced_at, decay_lambda')
    .order('layer', { ascending: true });

  if (error) {
    console.warn('[INFERENCE] Failed to fetch full identity model:', error.message);
    return [];
  }
  return data || [];
}

/**
 * Ambil proposal yang sudah di-STAGED dari minggu sebelumnya
 * (confidence 60-85%) untuk dikonsolidasi dengan data baru
 * @returns {Promise<Array>}
 */
async function _getStagedProposals() {
  const sb = _getSupabase();
  if (!sb) return [];
  const { data, error } = await sb
    .from('nexa_identity_proposals')
    .select('*')
    .eq('status', 'STAGED')
    .order('created_at', { ascending: true });

  if (error) {
    console.warn('[INFERENCE] Failed to fetch staged proposals:', error.message);
    return [];
  }
  return data || [];
}

// ============================================================
// TAHAP 2: DATA SYNTHESIS — Rangkum data mentah menjadi narasi terstruktur
// ============================================================

/**
 * Merangkum behavior logs 7 hari menjadi narasi ringkas untuk AI
 * @param {Array} logs
 * @returns {string}
 */
function _synthesizeBehaviorSummary(logs) {
  if (!logs || logs.length === 0) return 'Tidak ada data behavior log.';

  const grouped = {};
  for (const log of logs) {
    const key = log.event_type;
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(log);
  }

  const lines = [];

  // ── Wake Up Pattern ────────────────────────────────────────
  const wakeUps = grouped['WAKE_UP'] || [];
  if (wakeUps.length > 0) {
    const hours = wakeUps.map(w => w.event_data?.wake_hour).filter(h => h !== undefined);
    if (hours.length > 0) {
      const avg = Math.round(hours.reduce((a, b) => a + b, 0) / hours.length);
      const min = Math.min(...hours);
      const max = Math.max(...hours);
      lines.push(`WAKE_UP: ${wakeUps.length}x dalam 7 hari. Rata-rata jam ${avg}:00 WIB (rentang ${min}:00-${max}:00 WIB).`);
    }
  }

  // ── Morning Check-In Data (Sleep & Energy Scores) ──────────
  const checkIns = grouped['MORNING_CHECKIN'] || [];
  if (checkIns.length > 0) {
    const sleepScores = checkIns.map(c => c.event_data?.sleep_score).filter(s => s !== undefined);
    const energyScores = checkIns.map(c => c.event_data?.energy_score).filter(s => s !== undefined);
    const focuses = checkIns.map(c => c.event_data?.daily_focus).filter(Boolean);

    if (sleepScores.length > 0) {
      const avgSleep = (sleepScores.reduce((a, b) => a + b, 0) / sleepScores.length).toFixed(1);
      lines.push(`MORNING_CHECKIN: ${checkIns.length}x dalam 7 hari. Rata-rata skor tidur: ${avgSleep}/5. Rata-rata energi: ${(energyScores.reduce((a, b) => a + b, 0) / (energyScores.length || 1)).toFixed(1)}/5.`);
    }
    if (focuses.length > 0) {
      lines.push(`Fokus harian yang disebutkan: ${focuses.slice(0, 5).join('; ')}.`);
    }
  }

  // ── Mood Pattern ───────────────────────────────────────────
  const moods = grouped['MOOD_DETECTED'] || [];
  if (moods.length > 0) {
    const moodCounts = {};
    moods.forEach(m => {
      const mood = m.event_data?.mood || 'UNKNOWN';
      moodCounts[mood] = (moodCounts[mood] || 0) + 1;
    });
    const moodStr = Object.entries(moodCounts)
      .sort((a, b) => b[1] - a[1])
      .map(([m, c]) => `${m}:${c}x`).join(', ');
    lines.push(`MOOD_DETECTED: ${moods.length}x total. Distribusi: ${moodStr}.`);
  }

  // ── [PHASE 7 — M3] Mood Time-Series (Emotional Trend Context) ─────────
  // Baca event MOOD_TIME_SERIES terbaru yang dihitung oleh computeMoodTimeSeries()
  // Jika ada, inject sebagai konteks tren emosional ke prompt AI.
  const moodTimeSeries = grouped['MOOD_TIME_SERIES'] || [];
  if (moodTimeSeries.length > 0) {
    // Ambil yang paling baru
    const latest = moodTimeSeries[moodTimeSeries.length - 1];
    const d = latest.event_data || {};
    const state24h = d.mood_24h_state || 'NEUTRAL';
    const trend7d  = d.mood_7d_trend  || 'STABLE';
    const variance = d.mood_7d_variance || 'LOW';
    lines.push(`MOOD_TIME_SERIES (M3): 24h_state=${state24h} | 7d_trend=${trend7d} | variance=${variance}. Sampel=${d.sample_count || 0} event.`);
  }

  // ── Finance Pattern ────────────────────────────────────────
  const finances = grouped['FINANCE_RECORD'] || [];
  if (finances.length > 0) {
    const expenses = finances.filter(f => f.event_data?.type === 'EXPENSE');
    const totalSpend = expenses.reduce((sum, f) => sum + (f.event_data?.nominal || 0), 0);

    // Jam transaksi paling sering
    const hourCounts = {};
    finances.forEach(f => {
      const h = f.hour_of_day;
      hourCounts[h] = (hourCounts[h] || 0) + 1;
    });
    const peakHour = Object.entries(hourCounts).sort((a, b) => b[1] - a[1])[0]?.[0];

    // Kategori paling sering
    const catCounts = {};
    expenses.forEach(f => {
      const cat = f.event_data?.category || 'Lainnya';
      catCounts[cat] = (catCounts[cat] || 0) + 1;
    });
    const topCats = Object.entries(catCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([c, n]) => `${c}:${n}x`).join(', ');

    lines.push(`FINANCE_RECORD: ${expenses.length} pengeluaran, total Rp${totalSpend.toLocaleString('id-ID')} dalam 7 hari. Jam transaksi tersibuk: ${peakHour}:00 WIB. Kategori teratas: ${topCats}.`);
  }

  // ── Briefing Sent Patterns ─────────────────────────────────
  const morningBriefings = grouped['MORNING_BRIEFING_SENT'] || [];
  const eveningBriefings = grouped['EVENING_BRIEFING_SENT'] || [];
  if (morningBriefings.length > 0 || eveningBriefings.length > 0) {
    lines.push(`Briefing dikirim: Morning=${morningBriefings.length}x, Evening=${eveningBriefings.length}x dari 7 hari.`);
  }

  return lines.length > 0 ? lines.join('\n') : 'Data behavior terbatas.';
}

/**
 * Merangkum chat memories menjadi narasi ringkas untuk AI
 * @param {Array} memories
 * @returns {string}
 */
function _synthesizeChatSummary(memories) {
  if (!memories || memories.length === 0) return 'Tidak ada percakapan dalam 7 hari.';

  // Hanya ambil pesan user (bukan nexa) dan potong panjangnya
  const userMessages = memories
    .filter(m => m.role === 'user')
    .map(m => String(m.content || '').substring(0, 200).trim())
    .filter(m => m.length > 10);

  if (userMessages.length === 0) return 'Tidak ada pesan user dalam 7 hari.';

  // Ambil sampel: awal, tengah, akhir (max 30 pesan)
  const sampled = userMessages.length <= 30
    ? userMessages
    : [
        ...userMessages.slice(0, 10),
        ...userMessages.slice(Math.floor(userMessages.length / 2) - 5, Math.floor(userMessages.length / 2) + 5),
        ...userMessages.slice(-10)
      ];

  return `Total ${userMessages.length} pesan user dalam 7 hari. Sampel:\n` +
    sampled.map((m, i) => `${i + 1}. "${m}"`).join('\n');
}

/**
 * Format Identity Model saat ini untuk disuntikkan ke prompt AI
 * agar Contradiction Detector bisa bekerja
 * @param {Array} identityModel
 * @returns {string}
 */
function _formatCurrentIdentityForPrompt(identityModel) {
  if (!identityModel || identityModel.length === 0) {
    return 'Belum ada identitas yang tersimpan (sistem baru mulai belajar).';
  }

  const grouped = {};
  identityModel.forEach(trait => {
    if (!grouped[trait.layer]) grouped[trait.layer] = [];
    grouped[trait.layer].push(`${trait.trait_key}: "${trait.trait_value}" (confidence: ${Math.round((trait.confidence || 0) * 100)}%)`);
  });

  return Object.entries(grouped)
    .map(([layer, traits]) => `[${layer}]\n${traits.map(t => `  - ${t}`).join('\n')}`)
    .join('\n\n');
}

// ============================================================
// TAHAP 3: AI INFERENCE — Panggil AI untuk menghasilkan hipotesis
// ============================================================

/**
 * Prompt utama Inference Engine — memanggil AI untuk menganalisis
 * seluruh observasi dan menghasilkan array hipotesis terstruktur.
 *
 * @param {string} behaviorSummary - Ringkasan behavior logs 7 hari
 * @param {string} chatSummary - Ringkasan obrolan 7 hari
 * @param {string} currentIdentity - Snapshot identitas yang sudah ada
 * @param {Array} stagedProposals - Proposal staged dari minggu sebelumnya
 * @returns {Promise<Array>} Array of hypothesis objects
 */
async function _runAIInference(behaviorSummary, chatSummary, currentIdentity, stagedProposals) {

  const stagedContext = stagedProposals.length > 0
    ? `\n\nPROPOSAL YANG SUDAH STAGED DARI MINGGU SEBELUMNYA (pertimbangkan jika ada bukti tambahan):\n` +
      stagedProposals.map(p =>
        `- [${p.layer}] ${p.trait_key}: "${p.proposed_value}" (confidence sebelumnya: ${Math.round((p.confidence || 0) * 100)}%, alasan: ${p.reasoning?.substring(0, 100)})`
      ).join('\n')
    : '';

  const systemPrompt = `Anda adalah Cognitive Inference Engine milik N.E.X.A — sistem AI yang bertugas membangun model mental terstruktur tentang Tuan Faqih berdasarkan observasi perilaku nyata.

TUGAS ANDA:
Analisis data observasi 7 hari di bawah ini dan hasilkan hipotesis terstruktur tentang pola kepribadian, kebiasaan, atau perubahan identitas Tuan Faqih.

DEFINISI 7 LAYER IDENTITAS:
- FACTS: Fakta permanen dan statis (pendidikan, tempat tinggal, dll)
- PREFERENCES: Preferensi operasional dan gaya komunikasi
- HABITS: Ritme hidup, rutinitas, pola kebiasaan berulang
- VALUES: Nilai-nilai inti dan prinsip hidup
- DECISION_STYLE: Gaya pengambilan keputusan
- WEAKNESSES: Titik lemah atau blindspot konsisten
- MOTIVATIONS: Hal-hal yang mendorong semangat dan motivasi

ATURAN SANGAT KETAT:
1. Hanya buat hipotesis yang didukung BUKTI NYATA dari data observasi di bawah. JANGAN mengarang.
2. Jika sebuah trait sudah ada di Identity Model saat ini dengan nilai SAMA → JANGAN buat hipotesis baru (sudah terkonfirmasi).
3. Jika sebuah trait sudah ada di Identity Model tetapi DATA BARU BERTENTANGAN → buat hipotesis REVISI dengan tag is_contradiction: true.
4. confidence harus jujur: 0.60–0.85 jika pola hanya terlihat 3-4x, >0.85 jika konsisten hampir setiap hari dalam 7 hari.
5. reasoning harus spesifik menyebut BUKTI dari data (jam, frekuensi, contoh konkret).
6. Jika data minggu ini tidak cukup untuk menyimpulkan apapun yang baru → kembalikan array kosong [].

FORMAT OUTPUT (JSON MURNI, tanpa markdown, tanpa penjelasan):
[
  {
    "layer": "HABITS",
    "trait_key": "work_pattern",
    "proposed_value": "Night Owl (puncak produktivitas pukul 21:00-02:00 WIB)",
    "old_value": null,
    "confidence": 0.88,
    "reasoning": "Dari 7 hari observasi, mayoritas pesan dikirim antara pukul 21:00-01:00 WIB. Check-in pagi menunjukkan energi rendah (rata-rata 2.1/5). Transaksi makan malam konsisten >22:00 WIB.",
    "is_contradiction": false
  }
]`;

  const userPrompt = `=== DATA OBSERVASI 7 HARI TERAKHIR ===

[BEHAVIOR LOG SUMMARY]
${behaviorSummary}

[CHAT ACTIVITY SUMMARY]
${chatSummary}

[IDENTITY MODEL SAAT INI]
${currentIdentity}
${stagedContext}

Analisis data di atas dan hasilkan hipotesis identitas. Ingat: kembalikan [] jika tidak ada yang benar-benar baru dan didukung bukti.`;

  try {
    const rawResult = await executeWithFallback(
      userPrompt,
      systemPrompt,
      0.2, // Temperature rendah untuk konsistensi analitik
      true  // expectJson = true
    );

    // Bersihkan output AI dari markdown jika ada
    let cleanStr = String(rawResult || '').replace(/```json/gi, '').replace(/```/g, '').trim();

    // Cari array JSON
    const firstBracket = cleanStr.indexOf('[');
    const lastBracket = cleanStr.lastIndexOf(']');
    if (firstBracket === -1 || lastBracket <= firstBracket) {
      console.log('[INFERENCE] AI returned no JSON array — treating as empty result.');
      return [];
    }
    cleanStr = cleanStr.substring(firstBracket, lastBracket + 1);

    const parsed = JSON.parse(cleanStr);
    if (!Array.isArray(parsed)) {
      console.warn('[INFERENCE] AI returned non-array JSON. Skipping.');
      return [];
    }

    console.log(`[INFERENCE] AI generated ${parsed.length} raw hypotheses.`);
    return parsed;

  } catch (err) {
    console.error('[INFERENCE] AI inference call failed:', err.message);
    return [];
  }
}

// ============================================================
// TAHAP 4: VALIDATION — Validasi dan filter hipotesis dari AI
// ============================================================

/**
 * Validasi satu hipotesis dari AI.
 * Memastikan semua field wajib ada dan nilainya masuk akal.
 * @param {object} hypothesis
 * @returns {{ valid: boolean, reason?: string }}
 */
function _validateHypothesis(hypothesis) {
  if (!hypothesis || typeof hypothesis !== 'object') {
    return { valid: false, reason: 'bukan object' };
  }

  const { layer, trait_key, proposed_value, confidence, reasoning } = hypothesis;

  if (!layer || !VALID_LAYERS.has(String(layer).toUpperCase())) {
    return { valid: false, reason: `layer tidak valid: "${layer}"` };
  }
  if (!trait_key || typeof trait_key !== 'string' || trait_key.trim().length === 0) {
    return { valid: false, reason: 'trait_key kosong atau tidak valid' };
  }
  if (!proposed_value || typeof proposed_value !== 'string' || proposed_value.trim().length === 0) {
    return { valid: false, reason: 'proposed_value kosong' };
  }
  if (typeof confidence !== 'number' || confidence < 0.01 || confidence > 1.0) {
    return { valid: false, reason: `confidence tidak valid: ${confidence}` };
  }
  if (!reasoning || typeof reasoning !== 'string' || reasoning.trim().length < 20) {
    return { valid: false, reason: 'reasoning terlalu pendek atau kosong' };
  }
  // Tolak hipotesis dengan confidence terlalu rendah (di bawah 60%)
  if (confidence < 0.60) {
    return { valid: false, reason: `confidence terlalu rendah: ${Math.round(confidence * 100)}% (minimum 60%)` };
  }

  return { valid: true };
}

/**
 * Periksa apakah hipotesis adalah duplikat dari identitas yang sudah ada
 * atau dari proposal yang sudah pernah diajukan sebelumnya.
 * @param {object} hypothesis
 * @param {Array} currentIdentity
 * @returns {boolean} true jika DUPLIKAT (harus dibuang)
 */
function _isDuplicate(hypothesis, currentIdentity) {
  const layer = String(hypothesis.layer).toUpperCase();
  const key = String(hypothesis.trait_key).toLowerCase().trim();
  const value = String(hypothesis.proposed_value).toLowerCase().trim();

  // Cek apakah SAMA PERSIS dengan yang sudah ada di identity model
  const existingTrait = currentIdentity.find(
    t => t.layer === layer && t.trait_key === key
  );

  if (existingTrait) {
    const existingValue = String(existingTrait.trait_value).toLowerCase().trim();
    // Jika nilai sama persis (atau saling mencakup) → duplikat
    if (existingValue === value ||
        existingValue.includes(value) ||
        value.includes(existingValue)) {
      // Kecuali jika ini adalah contradiction (revisi)
      if (!hypothesis.is_contradiction) {
        return true;
      }
    }
  }

  return false;
}

// ============================================================
// [PHASE 7 — M1] TIER CLASSIFIER — Tentukan tingkat persetujuan proposal
// ============================================================

/**
 * Mengklasifikasikan proposal ke dalam 3 Tier persetujuan berdasarkan:
 * 1. Apakah trait SUDAH ADA di model identitas saat ini
 * 2. Seberapa besar pergeseran confidence
 * 3. Apakah layer termasuk yang sensitif (WEAKNESSES / VALUES)
 * 4. Apakah ini proposal kontradiksi (revisi trait lama)
 *
 * Tier 1 — Auto-Approve (tidak perlu interaksi user):
 *   - Trait sudah ada + confidence naik ≤5% + bukan layer sensitif
 * Tier 2 — Soft-Approve (auto-approve setelah 48 jam):
 *   - Trait sudah ada + confidence bergeser 5–20%
 * Tier 3 — Hard-Approve (wajib klik tombol eksplisit):
 *   - Trait BARU, kontradiksi, atau update pada layer WEAKNESSES/VALUES
 *
 * @param {object} hypothesis - Hipotesis yang sudah divalidasi
 * @param {Array} currentIdentityFull - Snapshot identity model dengan kolom decay
 * @returns {{tier: number, existingTrait: object|null, confidenceShift: number}}
 */
function _classifyApprovalTier(hypothesis, currentIdentityFull) {
  const layer = String(hypothesis.layer).toUpperCase();
  const key   = String(hypothesis.trait_key).toLowerCase().trim();
  const newConf = parseFloat(hypothesis.confidence) || 0;

  // Layer yang selalu memerlukan Hard-Approve karena sangat sensitif
  const SENSITIVE_LAYERS = new Set(['WEAKNESSES', 'VALUES']);

  // Cari trait yang sudah ada di model
  const existingTrait = currentIdentityFull.find(
    t => t.layer === layer && t.trait_key === key
  );

  // Trait BARU → selalu Tier 3
  if (!existingTrait) {
    return { tier: 3, existingTrait: null, confidenceShift: newConf };
  }

  // Kontradiksi (revisi) → selalu Tier 3
  if (hypothesis.is_contradiction) {
    return { tier: 3, existingTrait, confidenceShift: newConf };
  }

  // Layer sensitif → selalu Tier 3
  if (SENSITIVE_LAYERS.has(layer)) {
    return { tier: 3, existingTrait, confidenceShift: Math.abs(newConf - existingTrait.confidence) };
  }

  const confidenceShift = Math.abs(newConf - parseFloat(existingTrait.confidence) || 0);

  // Pergeseran sangat kecil (≤5%) → Tier 1 Auto-Approve
  if (confidenceShift <= TIER1_MAX_CONFIDENCE_SHIFT) {
    return { tier: 1, existingTrait, confidenceShift };
  }

  // Pergeseran moderat (5–20%) → Tier 2 Soft-Approve
  if (confidenceShift <= TIER2_MAX_CONFIDENCE_SHIFT) {
    return { tier: 2, existingTrait, confidenceShift };
  }

  // Pergeseran besar (>20%) → Tier 3 Hard-Approve
  return { tier: 3, existingTrait, confidenceShift };
}

// ============================================================
// TAHAP 5: PERSISTENCE — Simpan proposal ke database
// ============================================================

/**
 * Simpan satu hipotesis yang sudah divalidasi ke nexa_identity_proposals.
 * Jika proposal serupa sudah ada di STAGED (dari minggu lalu),
 * update confidence-nya alih-alih membuat record baru.
 *
 * Terintegrasi dengan sistem Tiered Approval (Phase 7 M1):
 * - Tier 1: Langsung auto-approve ke identity_model tanpa ke proposals
 * - Tier 2: Simpan ke proposals dengan soft_approve_after (48 jam)
 * - Tier 3: Simpan ke proposals dengan status PENDING (mekanisme lama)
 *
 * @param {object} hypothesis - Hipotesis yang sudah divalidasi
 * @param {Array} stagedProposals - Proposal STAGED yang ada saat ini
 * @param {Array} currentIdentityFull - Full identity model dengan kolom decay
 * @returns {Promise<{success: boolean, proposalId: number|null, status: string, tier: number}>}
 */
async function _persistProposal(hypothesis, stagedProposals, currentIdentityFull = []) {
  const sb = _getSupabase();
  if (!sb) return { success: false, proposalId: null, status: 'NO_DB', tier: 3 };

  const layer = String(hypothesis.layer).toUpperCase();
  const traitKey = String(hypothesis.trait_key).toLowerCase().trim();
  const newConfidence = parseFloat(hypothesis.confidence) || 0;

  // ── [PHASE 7 — M1] Klasifikasikan tier persetujuan ────────────
  const { tier, existingTrait, confidenceShift } = _classifyApprovalTier(hypothesis, currentIdentityFull);
  console.log(`[INFERENCE] [${layer}] ${traitKey} → Tier ${tier} | shift=${(confidenceShift * 100).toFixed(1)}%`);

  // ── TIER 1: AUTO-APPROVE — Langsung commit ke identity_model ──
  if (tier === 1 && existingTrait) {
    const { error } = await sb
      .from('nexa_identity_model')
      .update({
        trait_value:        String(hypothesis.proposed_value).trim(),
        confidence:         parseFloat(newConfidence.toFixed(2)),
        inferred_from_summary: String(hypothesis.reasoning).trim(),
        last_reinforced_at: new Date().toISOString(),
        updated_at:         new Date().toISOString()
      })
      .eq('layer', layer)
      .eq('trait_key', traitKey);

    if (error) {
      console.warn(`[INFERENCE] Tier 1 auto-approve failed for [${layer}] ${traitKey}:`, error.message);
      return { success: false, proposalId: null, status: 'ERROR', tier: 1 };
    }

    console.log(`[INFERENCE] ⚡ TIER 1 AUTO-APPROVED: [${layer}] ${traitKey} = "${hypothesis.proposed_value}"`);
    return { success: true, proposalId: null, status: 'AUTO_APPROVED', tier: 1 };
  }

  // ── Cek apakah sudah ada proposal STAGED untuk trait yang sama ─
  const existingStaged = stagedProposals.find(
    p => p.layer === layer && p.trait_key === traitKey
  );

  if (existingStaged) {
    // Update confidence (rata-rata dengan bukti baru) dan reasoning
    const mergedConfidence = Math.min(
      ((existingStaged.confidence + newConfidence) / 2) + 0.05,
      1.0
    );
    const mergedTier = Math.max(existingStaged.approval_tier || 3, tier);
    const newStatus = mergedConfidence > 0.85 ? 'PENDING' : 'STAGED';
    const softApproveAfter = mergedTier === 2
      ? new Date(Date.now() + TIER2_SOFT_APPROVE_HOURS * 60 * 60 * 1000).toISOString()
      : null;

    const { data, error } = await sb
      .from('nexa_identity_proposals')
      .update({
        confidence:         parseFloat(mergedConfidence.toFixed(2)),
        reasoning:          `[Diperbarui minggu ini] ${hypothesis.reasoning}`,
        proposed_value:     hypothesis.proposed_value,
        status:             newStatus,
        approval_tier:      mergedTier,
        soft_approve_after: softApproveAfter
      })
      .eq('id', existingStaged.id)
      .select()
      .single();

    if (error) {
      console.warn(`[INFERENCE] Failed to update staged proposal #${existingStaged.id}:`, error.message);
      return { success: false, proposalId: null, status: 'ERROR', tier };
    }

    console.log(`[INFERENCE] Updated STAGED proposal #${existingStaged.id} → ${Math.round(mergedConfidence * 100)}% → ${newStatus} (Tier ${mergedTier})`);
    return { success: true, proposalId: existingStaged.id, status: newStatus, tier: mergedTier };
  }

  // ── Buat proposal BARU ─────────────────────────────────────────
  const status = newConfidence > 0.85 ? 'PENDING' : 'STAGED';
  const softApproveAfter = tier === 2 && status === 'PENDING'
    ? new Date(Date.now() + TIER2_SOFT_APPROVE_HOURS * 60 * 60 * 1000).toISOString()
    : null;

  const payload = {
    layer,
    trait_key:          traitKey,
    proposed_value:     String(hypothesis.proposed_value).trim(),
    old_value:          hypothesis.old_value ? String(hypothesis.old_value).trim() : null,
    confidence:         parseFloat(newConfidence.toFixed(2)),
    reasoning:          String(hypothesis.reasoning).trim(),
    status,
    approval_tier:      tier,
    soft_approve_after: softApproveAfter,
    created_at:         new Date().toISOString()
  };

  const { data, error } = await sb
    .from('nexa_identity_proposals')
    .insert([payload])
    .select()
    .single();

  if (error) {
    console.warn('[INFERENCE] Failed to insert new proposal:', error.message);
    return { success: false, proposalId: null, status: 'ERROR', tier };
  }

  console.log(`[INFERENCE] ✅ New proposal #${data.id} saved: [${layer}] ${traitKey} → "${hypothesis.proposed_value}" (${Math.round(newConfidence * 100)}% → ${status}, Tier ${tier})`);
  return { success: true, proposalId: data.id, status, tier };
}

// ============================================================
// TAHAP 6: NOTIFICATION — Kirim proposal PENDING ke Telegram
// ============================================================

/**
 * Kirim semua proposal yang berstatus PENDING ke Telegram
 * dengan tombol Inline Keyboard Approve/Reject.
 * @param {Array<{proposalId: number}>} pendingIds - List ID proposal yang baru saja PENDING
 */
async function _sendPendingProposalsToTelegram(pendingIds) {
  if (!pendingIds || pendingIds.length === 0) return;

  const sb = _getSupabase();
  if (!sb) return;

  // Lazy require untuk menghindari circular dependency
  let webhookModule;
  try {
    webhookModule = require('../interfaces/webhook');
  } catch (e) {
    console.error('[INFERENCE] Cannot require webhook module:', e.message);
    return;
  }

  const sendFn = webhookModule.sendIdentityProposalToTelegram;
  if (typeof sendFn !== 'function') {
    console.error('[INFERENCE] sendIdentityProposalToTelegram is not a function.');
    return;
  }

  for (const { proposalId } of pendingIds) {
    try {
      // Ambil data proposal dari database
      const { data: proposal, error } = await sb
        .from('nexa_identity_proposals')
        .select('*')
        .eq('id', proposalId)
        .single();

      if (error || !proposal) {
        console.warn(`[INFERENCE] Proposal #${proposalId} not found for Telegram send.`);
        continue;
      }

      // Kirim ke Telegram dengan tombol Approve/Reject
      await sendFn(proposal);

      // Jeda antar pengiriman agar tidak spam
      await new Promise(resolve => setTimeout(resolve, 1500));

    } catch (err) {
      console.error(`[INFERENCE] Failed to send proposal #${proposalId} to Telegram:`, err.message);
    }
  }
}

// ============================================================
// MAIN ORCHESTRATOR: runWeeklyIdentityInference()
// ============================================================

/**
 * Fungsi utama Inference Engine.
 * Mengorkestrasi seluruh pipeline dari pengumpulan data sampai notifikasi Telegram.
 *
 * Dipanggil dari cron.js setiap Minggu pukul 21:00 WIB.
 *
 * @returns {Promise<{
 *   success: boolean,
 *   totalHypotheses: number,
 *   saved: number,
 *   pendingSent: number,
 *   staged: number,
 *   skipped: number,
 *   error?: string
 * }>}
 */
async function runWeeklyIdentityInference() {
  console.log('[INFERENCE] ════════════════════════════════════════');
  console.log('[INFERENCE] 🧠 Starting Weekly Identity Inference...');
  console.log('[INFERENCE] ════════════════════════════════════════');

  const result = {
    success: false,
    totalHypotheses: 0,
    saved: 0,
    pendingSent: 0,
    staged: 0,
    skipped: 0,
  };

  try {
    // ── Step 1: Kumpulkan data ─────────────────────────────────
    console.log('[INFERENCE] Step 1: Collecting 7-day observations...');
    const [behaviorLogs, chatMemories, currentIdentity, stagedProposals] = await Promise.all([
      _getBehaviorLogs7Days(),
      _getChatMemories7Days(),
      _getCurrentIdentityModel(),
      _getStagedProposals()
    ]);

    const totalObservations = behaviorLogs.length + chatMemories.length;
    console.log(`[INFERENCE] Collected: ${behaviorLogs.length} behavior logs, ${chatMemories.length} chat memories, ${stagedProposals.length} staged proposals.`);

    // ── Step 2: Cek threshold minimum data ────────────────────
    if (totalObservations < MIN_EVENTS_THRESHOLD) {
      console.log(`[INFERENCE] ⚠️ Not enough data (${totalObservations} < ${MIN_EVENTS_THRESHOLD} minimum). Skipping inference this week.`);
      return { ...result, success: true, skipped: totalObservations };
    }

    // ── Step 3: Synthesize data menjadi narasi ringkas ─────────
    console.log('[INFERENCE] Step 2: Synthesizing raw data into narratives...');
    const behaviorSummary = _synthesizeBehaviorSummary(behaviorLogs);
    const chatSummary = _synthesizeChatSummary(chatMemories);
    const currentIdentityStr = _formatCurrentIdentityForPrompt(currentIdentity);

    console.log('[INFERENCE] Behavior summary length:', behaviorSummary.length, 'chars');
    console.log('[INFERENCE] Chat summary length:', chatSummary.length, 'chars');

    // ── Step 4: Jalankan AI Inference ─────────────────────────
    console.log('[INFERENCE] Step 3: Running AI synthesis (temperature=0.2)...');
    const hypotheses = await _runAIInference(
      behaviorSummary, chatSummary, currentIdentityStr, stagedProposals
    );

    result.totalHypotheses = hypotheses.length;
    console.log(`[INFERENCE] Step 3 complete: ${hypotheses.length} raw hypotheses generated.`);

    if (hypotheses.length === 0) {
      console.log('[INFERENCE] No new hypotheses this week. Identity model is stable.');
      return { ...result, success: true };
    }

    // ── Step 5: Validasi, filter, dan simpan proposal ──────────
    console.log('[INFERENCE] Step 4: Validating, filtering & persisting proposals...');
    const pendingToSend = [];

    // [PHASE 7 — M1] Ambil full identity model untuk Tier Classifier
    const currentIdentityFull = await _getCurrentIdentityModelFull();

    for (const hypothesis of hypotheses) {
      // Validasi struktur
      const validation = _validateHypothesis(hypothesis);
      if (!validation.valid) {
        console.log(`[INFERENCE] ❌ Skipped (invalid: ${validation.reason}): [${hypothesis.layer}] ${hypothesis.trait_key}`);
        result.skipped++;
        continue;
      }

      // Cek duplikat terhadap identitas yang sudah ada
      if (_isDuplicate(hypothesis, currentIdentity)) {
        console.log(`[INFERENCE] ⚡ Skipped (duplicate of existing): [${hypothesis.layer}] ${hypothesis.trait_key}`);
        result.skipped++;
        continue;
      }

      // Simpan ke database (dengan Tiered Approval classifier)
      const persistResult = await _persistProposal(hypothesis, stagedProposals, currentIdentityFull);

      if (!persistResult.success) {
        result.skipped++;
        continue;
      }

      result.saved++;

      // Tier 1 auto-approved: tidak perlu dikirim ke Telegram
      if (persistResult.status === 'AUTO_APPROVED') {
        console.log(`[INFERENCE] ⚡ Tier 1 auto-approved — no Telegram notification.`);
        continue;
      }

      // Tier 2 & 3 dengan status PENDING: kirim ke Telegram
      if (persistResult.status === 'PENDING' && persistResult.proposalId) {
        pendingToSend.push({ proposalId: persistResult.proposalId, tier: persistResult.tier });
        result.pendingSent++;
      } else {
        result.staged++;
      }
    }

    // ── Step 6: Kirim proposal PENDING ke Telegram ─────────────
    if (pendingToSend.length > 0) {
      console.log(`[INFERENCE] Step 5: Sending ${pendingToSend.length} PENDING proposal(s) to Telegram...`);
      await _sendPendingProposalsToTelegram(pendingToSend);
    } else {
      console.log('[INFERENCE] Step 5: No PENDING proposals to send (all STAGED or skipped).');
    }

    result.success = true;

    console.log('[INFERENCE] ════════════════════════════════════════');
    console.log(`[INFERENCE] ✅ Weekly Inference Complete:`);
    console.log(`[INFERENCE]    Total hypotheses generated : ${result.totalHypotheses}`);
    console.log(`[INFERENCE]    Saved to proposals         : ${result.saved}`);
    console.log(`[INFERENCE]    Sent to Telegram (PENDING) : ${result.pendingSent}`);
    console.log(`[INFERENCE]    Staged for next week       : ${result.staged}`);
    console.log(`[INFERENCE]    Skipped (invalid/duplicate): ${result.skipped}`);
    console.log('[INFERENCE] ════════════════════════════════════════');

    return result;

  } catch (err) {
    console.error('[INFERENCE] ❌ Critical error in Weekly Identity Inference:', err.message, err.stack);
    return { ...result, success: false, error: err.message };
  }
}

// ============================================================
// [PHASE 7 — M1] DAILY DECAY PASS
// ============================================================

/**
 * Jalankan peluruhan memori harian menggunakan fungsi Ebbinghaus:
 *   confidence(t) = initial × e^(−λ × days_since_reinforcement)
 *
 * Dipanggil oleh cron.js setiap malam pukul 23:30 WIB.
 * Jika confidence turun di bawah CONFIDENCE_DECAY_THRESHOLD (0.60),
 * kirim soft check-in ke Telegram untuk mengkonfirmasi ulang trait.
 *
 * @returns {Promise<{processed: number, decayed: number, checkins: number, errors: number}>}
 */
async function runDailyDecayPass() {
  console.log('[DECAY] ── Starting Daily Memory Decay Pass...');
  const sb = _getSupabase();
  if (!sb) {
    console.warn('[DECAY] Supabase not configured. Skipping decay pass.');
    return { processed: 0, decayed: 0, checkins: 0, errors: 0 };
  }

  const stats = { processed: 0, decayed: 0, checkins: 0, errors: 0 };
  const now = Date.now();
  const checkinsToSend = [];

  try {
    const traits = await _getCurrentIdentityModelFull();
    if (!traits || traits.length === 0) {
      console.log('[DECAY] No traits in identity model. Skipping.');
      return stats;
    }

    for (const trait of traits) {
      stats.processed++;
      try {
        // Hitung hari sejak terakhir diperkuat
        const lastReinforced = trait.last_reinforced_at
          ? new Date(trait.last_reinforced_at).getTime()
          : new Date(0).getTime();
        const daysSince = Math.max(0, (now - lastReinforced) / (1000 * 60 * 60 * 24));

        // Gunakan λ dari kolom database, fallback ke konstanta default per layer
        const lambda = parseFloat(trait.decay_lambda)
          || DECAY_LAMBDA_BY_LAYER[trait.layer]
          || 0.020;

        const currentConf = parseFloat(trait.confidence) || 0;

        // Hitung confidence baru menggunakan Ebbinghaus decay
        const decayedConf = parseFloat(
          (currentConf * Math.exp(-lambda * daysSince)).toFixed(4)
        );

        // Hanya update jika ada penurunan yang signifikan (>0.001 poin)
        if (currentConf - decayedConf < 0.001) continue;

        // Update confidence di database
        const { error: updateError } = await sb
          .from('nexa_identity_model')
          .update({ confidence: parseFloat(decayedConf.toFixed(2)) })
          .eq('layer', trait.layer)
          .eq('trait_key', trait.trait_key);

        if (updateError) {
          console.warn(`[DECAY] Failed to decay [${trait.layer}] ${trait.trait_key}:`, updateError.message);
          stats.errors++;
          continue;
        }

        stats.decayed++;
        console.log(`[DECAY] [${trait.layer}] ${trait.trait_key}: ${(currentConf * 100).toFixed(1)}% → ${(decayedConf * 100).toFixed(1)}% (λ=${lambda}, Δ${daysSince.toFixed(1)} hari)`);

        // Jika confidence jatuh di bawah threshold → antrekan soft check-in
        if (decayedConf < CONFIDENCE_DECAY_THRESHOLD && currentConf >= CONFIDENCE_DECAY_THRESHOLD) {
          checkinsToSend.push({
            layer: trait.layer,
            trait_key: trait.trait_key,
            trait_value: trait.trait_value,
            confidence: decayedConf
          });
        }
      } catch (traitErr) {
        console.warn(`[DECAY] Error processing trait [${trait.layer}] ${trait.trait_key}:`, traitErr.message);
        stats.errors++;
      }
    }

    // Kirim soft check-in ke Telegram jika ada trait yang decay melewati threshold
    if (checkinsToSend.length > 0) {
      let webhookModule;
      try { webhookModule = require('../interfaces/webhook'); } catch (_) {}

      for (const item of checkinsToSend) {
        try {
          const msg = [
            `🔄 <b>Soft Check-In Memori N.E.X.A</b>`,
            ``,
            `Saya belum mengamati pola berikut dalam waktu yang cukup lama, sehingga tingkat keyakinan saya menurun:`,
            ``,
            `<b>${item.layer}</b> → <code>${item.trait_key}</code>`,
            `<i>"${item.trait_value}"</i>`,
            `Keyakinan sekarang: <b>${(item.confidence * 100).toFixed(0)}%</b>`,
            ``,
            `Apakah profil ini masih relevan dan akurat tentang Anda, Tuan?`
          ].join('\n');

          if (webhookModule?.sendTelegramOutbound) {
            await webhookModule.sendTelegramOutbound(msg, true);
            stats.checkins++;
            await new Promise(r => setTimeout(r, 1000));
          }
        } catch (sendErr) {
          console.warn('[DECAY] Failed to send soft check-in:', sendErr.message);
        }
      }
    }

    console.log(`[DECAY] ── Decay Pass Complete: processed=${stats.processed} decayed=${stats.decayed} checkins=${stats.checkins} errors=${stats.errors}`);
    return stats;

  } catch (err) {
    console.error('[DECAY] ❌ Critical error in Daily Decay Pass:', err.message);
    return { ...stats, errors: stats.errors + 1 };
  }
}

// ============================================================
// [PHASE 7 — M1] TIER 2 SOFT-APPROVE PASS
// ============================================================

/**
 * Cek proposal Tier 2 yang sudah melewati batas waktu soft_approve_after.
 * Jika sudah lebih dari 48 jam tanpa respons user, auto-approve proposal tersebut.
 *
 * Dipanggil oleh cron.js setiap pagi pukul 08:15 WIB.
 *
 * @returns {Promise<{checked: number, autoApproved: number, errors: number}>}
 */
async function runTier2SoftApprovePass() {
  console.log('[TIER2] ── Starting Tier 2 Soft-Approve Pass...');
  const sb = _getSupabase();
  if (!sb) return { checked: 0, autoApproved: 0, errors: 0 };

  const stats = { checked: 0, autoApproved: 0, errors: 0 };
  const nowIso = new Date().toISOString();

  try {
    // Ambil semua proposal Tier 2 yang sudah melewati batas waktu soft_approve
    const { data: expiredProposals, error: fetchError } = await sb
      .from('nexa_identity_proposals')
      .select('*')
      .eq('status', 'PENDING')
      .eq('approval_tier', 2)
      .lte('soft_approve_after', nowIso);

    if (fetchError) {
      console.warn('[TIER2] Failed to fetch expired Tier 2 proposals:', fetchError.message);
      return stats;
    }

    if (!expiredProposals || expiredProposals.length === 0) {
      console.log('[TIER2] No expired Tier 2 proposals. Pass complete.');
      return stats;
    }

    // Lazy require Supabase_Memories untuk fungsi approveIdentityProposal
    const supabaseMemories = require('../infrastructure/Supabase_Memories');
    let webhookModule;
    try { webhookModule = require('../interfaces/webhook'); } catch (_) {}

    for (const proposal of expiredProposals) {
      stats.checked++;
      try {
        console.log(`[TIER2] Auto-approving proposal #${proposal.id}: [${proposal.layer}] ${proposal.trait_key}`);

        const result = await supabaseMemories.approveIdentityProposal(proposal.id);

        if (result.success) {
          stats.autoApproved++;
          console.log(`[TIER2] ✅ Auto-approved proposal #${proposal.id}`);

          // Kirim notifikasi ringkas ke Telegram
          if (webhookModule?.sendTelegramOutbound) {
            const notif = [
              `⚡ <b>Tier 2 Auto-Approved</b>`,
              `Tidak ada respons dalam 48 jam — proposal berikut telah otomatis dikunci:`,
              `<b>${proposal.layer}</b> → <code>${proposal.trait_key}</code>`,
              `<i>"${proposal.proposed_value}"</i>`
            ].join('\n');
            await webhookModule.sendTelegramOutbound(notif, true).catch(() => {});
          }

          await new Promise(r => setTimeout(r, 800));
        } else {
          console.warn(`[TIER2] Auto-approve failed for #${proposal.id}:`, result.error);
          stats.errors++;
        }
      } catch (approveErr) {
        console.warn(`[TIER2] Error auto-approving proposal #${proposal.id}:`, approveErr.message);
        stats.errors++;
      }
    }

    console.log(`[TIER2] ── Pass Complete: checked=${stats.checked} autoApproved=${stats.autoApproved} errors=${stats.errors}`);
    return stats;

  } catch (err) {
    console.error('[TIER2] ❌ Critical error in Tier 2 Soft-Approve Pass:', err.message);
    return { ...stats, errors: stats.errors + 1 };
  }
}

// ============================================================
// [PHASE 7 — M3] PERSONALITY EVOLUTION NARRATIVE
// ============================================================

/**
 * Membaca nexa_identity_history (30 hari terakhir) dan menghasilkan narasi
 * ringkas tentang pola perubahan kepribadian Tuan Faqih.
 *
 * Dipanggil oleh cron.js setiap Minggu sebagai bagian dari Weekly Strategic Review,
 * dan ditambahkan ke laporan mingguan sebagai seksi "Evolusi Identitas".
 *
 * Format output: string HTML Telegram-ready (menggunakan <b> dan <i>)
 *
 * @param {number} [daysBack=30] - Berapa hari ke belakang yang dianalisis
 * @returns {Promise<string>} - Narasi evolusi atau pesan fallback jika belum ada data
 */
async function getPersonalityEvolutionNarrative(daysBack = 30) {
  const sb = _getSupabase();
  if (!sb) return '📖 Data evolusi kepribadian belum tersedia.';

  const daysAgo = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000).toISOString();

  try {
    const { data: history, error } = await sb
      .from('nexa_identity_history')
      .select('layer, trait_key, trait_value_old, trait_value_new, confidence_old, confidence_new, shift_velocity, approved_at')
      .gte('approved_at', daysAgo)
      .order('approved_at', { ascending: false })
      .limit(20);

    if (error) {
      console.warn('[INFERENCE] Failed to fetch identity history:', error.message);
      return '📖 Gagal membaca data evolusi kepribadian.';
    }

    if (!history || history.length === 0) {
      return `📖 <b>Evolusi Kepribadian</b>\nBelum ada perubahan identitas yang disetujui dalam ${daysBack} hari terakhir.`;
    }

    // Kelompokkan perubahan berdasarkan layer
    const byLayer = {};
    for (const h of history) {
      if (!byLayer[h.layer]) byLayer[h.layer] = [];
      byLayer[h.layer].push(h);
    }

    const layerEmoji = {
      FACTS: '📌', PREFERENCES: '💬', HABITS: '🔁',
      VALUES: '⚖️', DECISION_STYLE: '🧠', WEAKNESSES: '⚡', MOTIVATIONS: '🚀'
    };

    // Identifikasi trait dengan pergeseran tercepat (absolute velocity terbesar)
    const fastestShift = [...history]
      .filter(h => h.shift_velocity !== null)
      .sort((a, b) => Math.abs(b.shift_velocity) - Math.abs(a.shift_velocity))[0];

    let narrative = `📖 <b>Evolusi Identitas — ${daysBack} Hari Terakhir</b>\n`;
    narrative += `<i>(${history.length} perubahan tercatat)</i>\n\n`;

    // Ringkasan per layer
    for (const [layer, changes] of Object.entries(byLayer)) {
      const emoji = layerEmoji[layer] || '💡';
      narrative += `${emoji} <b>${layer}</b> (${changes.length}x berubah)\n`;
      // Tampilkan maksimal 2 perubahan terbaru per layer
      for (const c of changes.slice(0, 2)) {
        const confDelta = (c.confidence_new !== null && c.confidence_old !== null)
          ? (c.confidence_new - c.confidence_old > 0 ? '↑' : '↓')
          : '';
        narrative += `  • <code>${c.trait_key}</code> ${confDelta}\n`;
        if (c.trait_value_old) {
          narrative += `    <s>${String(c.trait_value_old).substring(0, 50)}</s> → `;
        } else {
          narrative += `    [baru] → `;
        }
        narrative += `<i>${String(c.trait_value_new).substring(0, 60)}</i>\n`;
      }
      narrative += '\n';
    }

    // Sorot trait dengan pergeseran kepercayaan tercepat
    if (fastestShift) {
      const direction = fastestShift.shift_velocity > 0 ? 'meningkat' : 'menurun';
      narrative += `⚡ <b>Pergeseran Tercepat:</b>\n`;
      narrative += `  <b>${fastestShift.layer}</b> › <code>${fastestShift.trait_key}</code> — confidence ${direction} ${Math.abs(fastestShift.shift_velocity).toFixed(3)} poin/hari\n`;
    }

    return narrative;

  } catch (err) {
    console.error('[INFERENCE] Error generating personality narrative:', err.message);
    return '📖 Gagal menghasilkan narasi evolusi kepribadian.';
  }
}

// ============================================================
// EXPORTS
// ============================================================
module.exports = {
  runWeeklyIdentityInference,
  runDailyDecayPass,
  runTier2SoftApprovePass,
  getPersonalityEvolutionNarrative,  // [PHASE 7 — M3]

  // Expose internal helpers untuk unit testing
  _synthesizeBehaviorSummary,
  _synthesizeChatSummary,
  _validateHypothesis,
  _isDuplicate,
  _classifyApprovalTier,
};
