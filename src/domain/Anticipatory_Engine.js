/**
 * ============================================================
 * [PHASE 7 — M4] ANTICIPATORY ENGINE — Anticipatory_Engine.js
 * ============================================================
 * Modul Kognitif Tertinggi N.E.X.A. — "JARVIS Mode"
 *
 * KONSEP UTAMA:
 *   7 Layer identitas bukan lagi 7 baris terpisah, melainkan node
 *   dalam Directed Influence Graph di mana setiap layer dapat
 *   mempengaruhi layer lain secara kausal.
 *
 *   Contoh relasi yang bisa dideteksi:
 *     WEAKNESSES[overthinking]
 *       → SUPPRESSES → DECISION_STYLE[fast_decision]
 *       → TRIGGERS   → HABITS[late_night_sessions]
 *       → AMPLIFIES  → MOTIVATIONS[deadline_driven]
 *
 * TIGA FUNGSI UTAMA:
 *
 *   1. buildCausalGraph()
 *      Dipanggil mingguan setelah Weekly Identity Inference.
 *      AI menganalisis korelasi behavior log + identity model
 *      dan menyimpulkan edge-edge kausal baru ke nexa_causal_graph.
 *      Edge yang sudah ada akan di-upsert (evidence_count++, strength diperbarui).
 *
 *   2. runAnticipationPass(currentContext)
 *      Dipanggil setiap kali pesan masuk (fire-and-forget).
 *      Membaca konteks aktif (intent, mood, waktu, tren emosi),
 *      menelusuri graph ke depan untuk mendeteksi pola negatif,
 *      dan men-trigger intervensi proaktif jika diperlukan.
 *      Anti-spam: tidak mengirim alert >1x per 6 jam untuk pola yang sama.
 *
 *   3. generateProactiveIntervention(alert)
 *      Menghasilkan pesan intervensi natural berbahasa Indonesia
 *      yang dikirimkan ke Telegram tanpa diminta oleh Tuan Faqih.
 *
 * PRINSIP DESAIN:
 *   - buildCausalGraph() memanggil AI (satu kali per minggu, bukan per pesan)
 *   - runAnticipationPass() adalah PURE HEURISTIK — zero AI call per pesan
 *   - generateProactiveIntervention() memanggil AI hanya saat alert benar-benar fired
 *   - Semua operasi alert adalah non-blocking terhadap respons webhook
 *
 * DIPANGGIL DARI:
 *   - cron.js: buildCausalGraph() setiap Minggu malam setelah weekly inference
 *   - webhook.js: runAnticipationPass() pada setiap pesan masuk (fire-and-forget)
 * ============================================================
 */

'use strict';

const { createClient } = require('@supabase/supabase-js');
const env = require('../config/env');
const { executeWithFallback } = require('../core/Fallback_Engine');

// ── Lazy Supabase client ──────────────────────────────────────────
let _supabase = null;
function _getSupabase() {
  if (_supabase) return _supabase;
  if (!env.SUPABASE_URL || !env.SUPABASE_KEY) return null;
  _supabase = createClient(env.SUPABASE_URL, env.SUPABASE_KEY);
  return _supabase;
}

// ── Konstanta ──────────────────────────────────────────────────────
const VALID_CAUSAL_DIRECTIONS = new Set(['AMPLIFIES', 'SUPPRESSES', 'TRIGGERS', 'COMPENSATES']);
const VALID_LAYERS = new Set([
  'FACTS', 'PREFERENCES', 'HABITS', 'VALUES',
  'DECISION_STYLE', 'WEAKNESSES', 'MOTIVATIONS'
]);

// Cooldown: jangan kirim alert pola yang sama dalam 6 jam
const ALERT_COOLDOWN_MS = 6 * 60 * 60 * 1000;

// Minimum kekuatan edge agar dianggap relevan untuk anticipation
const MIN_EDGE_STRENGTH = 0.40;

// Minimum evidence sebelum edge digunakan untuk anticipation
const MIN_EVIDENCE_COUNT = 2;

// ── Pola built-in yang tidak perlu menunggu graph (bootstrap heuristics) ──
// Pola ini aktif dari hari pertama, sebelum ada cukup data untuk buildCausalGraph.
// Didesain berdasarkan psikologi umum dan profil Tuan Faqih dari identity model awal.
const BUILTIN_PATTERNS = [
  {
    name: 'stress_finance_impulse',
    description: 'Stres tinggi meningkatkan risiko keputusan finansial impulsif',
    // Trigger: mood STRESSED + intent FINANCE di malam hari (setelah pukul 20:00)
    trigger: (ctx) =>
      ctx.mood === 'STRESSED' &&
      ctx.intent === 'FINANCE' &&
      ctx.hour >= 20,
    prediction: 'Kemungkinan keputusan finansial yang didorong stres, bukan pertimbangan matang.',
    intervention: '💡 *Sinyal Antisipasi N.E.X.A*\n\nSaya mendeteksi bahwa Tuan sedang dalam kondisi tertekan saat memproses transaksi ini. Penelitian menunjukkan keputusan finansial di bawah stres cenderung lebih disesali 24-48 jam kemudian.\n\nApakah keputusan ini perlu diambil sekarang, atau bisa ditunda hingga kondisi lebih tenang?',
    confidence: 0.72
  },
  {
    name: 'late_night_decision_risk',
    description: 'Keputusan penting di larut malam berisiko lebih tinggi',
    // Trigger: intent ADVICE atau pertanyaan serius di atas jam 23:00
    trigger: (ctx) =>
      ['ADVICE', 'DISCIPLINE'].includes(ctx.intent) &&
      (ctx.hour >= 23 || ctx.hour <= 4),
    prediction: 'Pengambilan keputusan penting di larut malam saat kapasitas kognitif menurun.',
    intervention: '🌙 *Catatan Kognitif N.E.X.A*\n\nIni adalah pertanyaan yang memerlukan penilaian jernih, dan sekarang sudah larut malam. Fungsi prefrontal cortex — pusat penilaian rasional — bekerja suboptimal di jam ini.\n\nSaya tetap bantu menjawab, namun menyarankan untuk mengevaluasi ulang keputusan ini besok pagi dengan perspektif segar.',
    confidence: 0.65
  },
  {
    name: 'late_night_high_stakes_academic',
    description: 'Lembur tugas/jadwal larut malam berpotensi menurunkan retensi memori dan fokus esok hari',
    trigger: (ctx) =>
      ['TASK', 'CALENDAR'].includes(ctx.intent) &&
      (ctx.hour >= 23 || ctx.hour <= 4),
    prediction: 'Lembur larut malam mengerjakan tugas atau penjadwalan menjelang pagi.',
    intervention: '🌙 *Antisipasi Kognitif N.E.X.A*\n\nTuan sedang memproses tugas/jadwal di larut malam. Riset neurosains menunjukkan kerja intensif di atas pukul 23:00 menurunkan konsolidasi memori dan fokus eksekutif esok hari.\n\nSaran saya: Kunci progres terpenting saat ini, lalu luangkan waktu untuk istirahat agar performa puncak Tuan terjaga esok hari.',
    confidence: 0.75
  },
  {
    name: 'overthinking_spiral',
    description: 'Pertanyaan berulang tentang topik yang sama mengindikasikan overthinking',
    // Trigger: intent ADVICE >3x dalam session yang sama (butuh counter dari context)
    trigger: (ctx) =>
      ctx.intent === 'ADVICE' &&
      ctx.sessionAdviceCount >= 3,
    prediction: 'Pola overthinking yang mencari kepastian berlebihan sebelum bertindak.',
    intervention: '🔄 *Observasi Pola N.E.X.A*\n\nSaya perhatikan Tuan sudah menanyakan perspektif yang serupa beberapa kali. Ini bisa menjadi tanda bahwa Tuan sudah memiliki jawaban sendiri tetapi mencari validasi tambahan.\n\nApa keputusan yang *sudah* terasa paling benar bagi Tuan, terlepas dari analisis lebih lanjut?',
    confidence: 0.60
  },
  {
    name: 'post_decision_drift',
    description: 'Keraguan dan pengulangan analisis pasca pengambilan keputusan strategis',
    trigger: (ctx) =>
      ctx.intent === 'ADVICE' &&
      ctx.mood === 'STRESSED' &&
      ctx.sessionAdviceCount >= 2,
    prediction: 'Keraguan pasca pengambilan keputusan strategis.',
    intervention: '🎯 *Fokus Eksekutif N.E.X.A*\n\nSetelah membuat keputusan penting, wajar jika muncul keraguan atau dorongan untuk menganalisis ulang skenario alternatif.\n\nSaran saya: Beri ruang eksekusi minimal 24-48 jam pada langkah pertama sebelum melakukan evaluasi ulang.',
    confidence: 0.70
  },
  {
    name: 'negative_mood_trend_alert',
    description: 'Tren emosi negatif 7 hari yang konsisten (variance LOW, trend DESCENDING)',
    // Trigger: mood_7d_trend DESCENDING + mood_7d_variance LOW (konsisten negatif)
    trigger: (ctx) =>
      ctx.mood_7d_trend === 'DESCENDING' &&
      ctx.mood_7d_variance === 'LOW' &&
      ctx.mood === 'STRESSED',
    prediction: 'Tren emosional negatif yang konsisten — bukan fluktuasi normal tetapi pola berkelanjutan.',
    intervention: '📊 *Analisis Tren Emosi N.E.X.A*\n\nData 7 hari terakhir menunjukkan tren emosional yang terus menurun secara konsisten. Ini berbeda dari fluktuasi normal harian.\n\nSaya ingin bertanya dengan tulus: apakah ada situasi yang menyita pikiran Tuan belakangan ini yang belum sempat diproses?',
    confidence: 0.78
  }
];

// ============================================================
// FUNGSI 1: buildCausalGraph() — Weekly AI Analysis
// ============================================================

/**
 * [PHASE 7 — M4] Membangun atau memperbarui Causal Knowledge Graph.
 * Memanggil AI untuk menganalisis korelasi antara trait di identity_model
 * dan pola di behavior_log, lalu menyimpan edge-edge kausal baru ke nexa_causal_graph.
 *
 * Dipanggil SEKALI SEMINGGU dari cron.js setelah runWeeklyIdentityInference selesai.
 *
 * @returns {Promise<{newEdges: number, updatedEdges: number, errors: number}>}
 */
async function buildCausalGraph() {
  const sb = _getSupabase();
  if (!sb) return { newEdges: 0, updatedEdges: 0, errors: 0 };

  console.log('[CAUSAL] ── Starting weekly Causal Graph build...');
  const stats = { newEdges: 0, updatedEdges: 0, errors: 0 };

  try {
    // 1. Ambil snapshot identity model saat ini
    const { data: identityModel, error: imError } = await sb
      .from('nexa_identity_model')
      .select('layer, trait_key, trait_value, confidence')
      .order('layer', { ascending: true });

    if (imError || !identityModel || identityModel.length === 0) {
      console.warn('[CAUSAL] Identity model empty — cannot build causal graph yet.');
      return stats;
    }

    // 2. Ambil identity history 30 hari (pola pergeseran)
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const { data: identityHistory } = await sb
      .from('nexa_identity_history')
      .select('layer, trait_key, trait_value_old, trait_value_new, shift_velocity, approved_at')
      .gte('approved_at', thirtyDaysAgo)
      .order('approved_at', { ascending: false })
      .limit(30);

    // 3. Ambil mood time-series terbaru dari behavior log
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { data: moodSeries } = await sb
      .from('nexa_behavior_log')
      .select('event_data, created_at')
      .eq('event_type', 'MOOD_TIME_SERIES')
      .gte('created_at', sevenDaysAgo)
      .order('created_at', { ascending: false })
      .limit(7);

    // 4. Ambil existing edges agar AI tidak membuat duplikat
    const { data: existingEdges } = await sb
      .from('nexa_causal_graph')
      .select('from_layer, from_trait_key, to_layer, to_trait_key, causal_direction, strength, evidence_count');

    // ── Bangun context string untuk AI ───────────────────────────────────
    const identityStr = identityModel
      .map(t => `[${t.layer}] ${t.trait_key}: "${t.trait_value}" (conf: ${t.confidence})`)
      .join('\n');

    const historyStr = (identityHistory || []).length > 0
      ? (identityHistory || [])
          .map(h => `[${h.layer}] ${h.trait_key}: "${h.trait_value_old || 'NEW'}" → "${h.trait_value_new}" (velocity: ${h.shift_velocity || 'N/A'})`)
          .join('\n')
      : 'Belum ada riwayat perubahan.';

    const moodStr = (moodSeries || []).length > 0
      ? (moodSeries || [])[0].event_data
          ? `24h=${(moodSeries||[])[0].event_data.mood_24h_state} | 7d_trend=${(moodSeries||[])[0].event_data.mood_7d_trend} | variance=${(moodSeries||[])[0].event_data.mood_7d_variance}`
          : 'Tidak ada data'
      : 'Tidak ada data mood time-series.';

    const existingStr = (existingEdges || []).length > 0
      ? `EXISTING EDGES (jangan duplikasi — hanya perbarui jika evidence baru mendukung):\n` +
        (existingEdges || [])
          .slice(0, 20)
          .map(e => `  ${e.from_layer}.${e.from_trait_key} →[${e.causal_direction}]→ ${e.to_layer}.${e.to_trait_key} (strength=${e.strength}, evidence=${e.evidence_count})`)
          .join('\n')
      : 'Belum ada edge kausal yang tersimpan.';

    // 5. Panggil AI untuk inferensi kausal
    const systemPrompt = `Kamu adalah sistem analisis kausal kognitif untuk N.E.X.A — asisten AI personal milik Tuan Faqih.

Tugasmu adalah menganalisis data identity model dan pola perilaku untuk menyimpulkan RELASI KAUSAL antara trait-trait kepribadian.

DEFINISI RELASI:
- AMPLIFIES  : Trait sumber memperkuat atau memperparah trait target
- SUPPRESSES : Trait sumber melemahkan atau menghambat trait target  
- TRIGGERS   : Kehadiran/aktivasi trait sumber sering memicu pola trait target
- COMPENSATES: Trait sumber berfungsi sebagai mekanisme kompensasi untuk trait target

ATURAN KETAT:
1. Hanya buat edge yang BENAR-BENAR didukung oleh data yang diberikan
2. Jangan membuat edge berdasarkan asumsi psikologi umum tanpa bukti dari data
3. Setiap edge harus memiliki reasoning yang menjelaskan MENGAPA relasi ini ada berdasarkan data
4. strength harus mencerminkan seberapa kuat buktinya (0.40-0.60 = lemah, 0.61-0.80 = sedang, 0.81-1.00 = kuat)
5. Jika tidak ada bukti yang cukup untuk edge baru, kembalikan array kosong []
6. TIDAK BOLEH membuat self-loop (from dan to tidak boleh identik)
7. Layer valid: FACTS, PREFERENCES, HABITS, VALUES, DECISION_STYLE, WEAKNESSES, MOTIVATIONS

FORMAT OUTPUT (JSON murni, tanpa markdown):
[
  {
    "from_layer": "WEAKNESSES",
    "from_trait_key": "overthinking",
    "to_layer": "DECISION_STYLE",
    "to_trait_key": "analysis_paralysis",
    "causal_direction": "AMPLIFIES",
    "strength": 0.75,
    "reasoning": "Data menunjukkan..."
  }
]`;

    const userPrompt = `=== IDENTITY MODEL SAAT INI ===
${identityStr}

=== RIWAYAT PERUBAHAN IDENTITAS (30 HARI) ===
${historyStr}

=== TREN EMOSIONAL TERKINI ===
${moodStr}

${existingStr}

Analisis data di atas dan identifikasi maksimal 5 relasi kausal baru yang paling kuat didukung bukti.
Kembalikan [] jika tidak ada relasi baru yang bisa disimpulkan dengan confidence yang cukup.`;

    const rawResult = await executeWithFallback(
      userPrompt,
      systemPrompt,
      0.15, // Temperature sangat rendah untuk analisis kausal
      true,  // expectJson
      { forceHeavy: true } // [SACR] Kategori A — Selalu Gemini 3.6 Flash (Causal Knowledge Graph)
    );

    // 6. Parse hasil AI
    let cleanStr = String(rawResult || '').replace(/```json/gi, '').replace(/```/g, '').trim();
    const firstBracket = cleanStr.indexOf('[');
    const lastBracket = cleanStr.lastIndexOf(']');
    if (firstBracket === -1 || lastBracket <= firstBracket) {
      console.log('[CAUSAL] AI returned no causal edges. Graph up to date.');
      return stats;
    }
    cleanStr = cleanStr.substring(firstBracket, lastBracket + 1);

    let edges;
    try { edges = JSON.parse(cleanStr); }
    catch (_) {
      console.warn('[CAUSAL] Failed to parse AI causal graph JSON.');
      return { ...stats, errors: 1 };
    }

    if (!Array.isArray(edges) || edges.length === 0) {
      console.log('[CAUSAL] No new causal edges to save.');
      return stats;
    }

    // 7. Validasi dan simpan setiap edge
    for (const edge of edges) {
      try {
        // Validasi struktur
        if (
          !VALID_LAYERS.has(edge.from_layer) ||
          !VALID_LAYERS.has(edge.to_layer) ||
          !VALID_CAUSAL_DIRECTIONS.has(edge.causal_direction) ||
          !edge.from_trait_key || !edge.to_trait_key ||
          // Cegah self-loop dengan normalisasi case
          (edge.from_layer === edge.to_layer && String(edge.from_trait_key).toLowerCase().trim() === String(edge.to_trait_key).toLowerCase().trim())
        ) {
          console.warn(`[CAUSAL] Invalid edge skipped: ${JSON.stringify(edge).substring(0, 100)}`);
          stats.errors++;
          continue;
        }

        const strength = Math.min(1.0, Math.max(0.0, parseFloat(edge.strength) || 0.50));
        const normFromKey = String(edge.from_trait_key).toLowerCase().trim();
        const normToKey = String(edge.to_trait_key).toLowerCase().trim();

        // Cek apakah edge sudah ada dengan key yang ternormalisasi
        const existingEdge = (existingEdges || []).find(e =>
          e.from_layer === edge.from_layer &&
          e.from_trait_key === normFromKey &&
          e.to_layer === edge.to_layer &&
          e.to_trait_key === normToKey
        );

        if (existingEdge) {
          // Update edge yang sudah ada: tingkatkan evidence_count dan rata-rata strength
          const newStrength = parseFloat(
            (((existingEdge.strength * existingEdge.evidence_count) + strength) /
              (existingEdge.evidence_count + 1)).toFixed(2)
          );

          await sb
            .from('nexa_causal_graph')
            .update({
              strength: newStrength,
              evidence_count: existingEdge.evidence_count + 1,
              reasoning: edge.reasoning ? String(edge.reasoning).substring(0, 500) : existingEdge.reasoning,
              last_observed_at: new Date().toISOString()
            })
            .eq('from_layer', edge.from_layer)
            .eq('from_trait_key', normFromKey)
            .eq('to_layer', edge.to_layer)
            .eq('to_trait_key', normToKey);

          stats.updatedEdges++;
          console.log(`[CAUSAL] Updated edge: ${edge.from_layer}.${normFromKey} →[${edge.causal_direction}]→ ${edge.to_layer}.${normToKey} (strength=${newStrength})`);

        } else {
          // Simpan edge baru
          await sb
            .from('nexa_causal_graph')
            .insert([{
              from_layer:       edge.from_layer,
              from_trait_key:   normFromKey,
              to_layer:         edge.to_layer,
              to_trait_key:     normToKey,
              causal_direction: edge.causal_direction,
              strength,
              evidence_count:   1,
              reasoning:        edge.reasoning ? String(edge.reasoning).substring(0, 500) : null,
              last_observed_at: new Date().toISOString(),
              created_at:       new Date().toISOString()
            }]);

          stats.newEdges++;
          console.log(`[CAUSAL] New edge: ${edge.from_layer}.${normFromKey} →[${edge.causal_direction}]→ ${edge.to_layer}.${normToKey} (strength=${strength})`);
        }

      } catch (edgeErr) {
        console.warn('[CAUSAL] Error saving edge:', edgeErr.message);
        stats.errors++;
      }
    }

    console.log(`[CAUSAL] ── Graph build done: new=${stats.newEdges} updated=${stats.updatedEdges} errors=${stats.errors}`);
    return stats;

  } catch (err) {
    console.error('[CAUSAL] ❌ Critical error in buildCausalGraph:', err.message);
    return { newEdges: 0, updatedEdges: 0, errors: 1 };
  }
}

// ============================================================
// FUNGSI 2: runAnticipationPass() — Per-Message Pattern Detection
// ============================================================

/**
 * [PHASE 7 — M4] Memeriksa konteks pesan saat ini terhadap pola kausal yang diketahui.
 * Jika pola negatif terdeteksi, kirim intervensi proaktif ke Telegram.
 *
 * DESAIN: Pure heuristic — ZERO AI call. Hanya traversal graph sederhana.
 * Dipanggil fire-and-forget dari webhook.js.
 *
 * @param {object} context - Konteks pesan saat ini
 * @param {string} context.intent - Intent yang terdeteksi
 * @param {string} context.mood - Mood yang terdeteksi
 * @param {number} context.hour - Jam saat ini (Jakarta time)
 * @param {string} [context.mood_7d_trend] - Tren 7 hari dari MOOD_TIME_SERIES terbaru
 * @param {string} [context.mood_7d_variance] - Variance dari MOOD_TIME_SERIES terbaru
 * @param {number} [context.sessionAdviceCount] - Jumlah pesan ADVICE dalam session
 * @returns {Promise<boolean>} - true jika intervensi dikirim
 */
async function runAnticipationPass(context) {
  const sb = _getSupabase();
  if (!sb) return false;

  try {
    const ctx = {
      intent:            String(context.intent || 'NORMAL_CHAT').toUpperCase(),
      mood:              String(context.mood || 'NEUTRAL').toUpperCase(),
      hour:              context.hour ?? new Date().getHours(),
      mood_7d_trend:     String(context.mood_7d_trend || 'STABLE').toUpperCase(),
      mood_7d_variance:  String(context.mood_7d_variance || 'LOW').toUpperCase(),
      sessionAdviceCount: context.sessionAdviceCount || 0,
    };

    // ── TAHAP 1: Cek pola built-in (bootstrap, selalu aktif) ──────────────
    let firedPattern = null;
    for (const pattern of BUILTIN_PATTERNS) {
      if (pattern.trigger(ctx)) {
        firedPattern = pattern;
        break;
      }
    }

    // ── TAHAP 2: Cek pola dari causal graph database (jika ada edge yang cukup kuat) ─
    if (!firedPattern) {
      firedPattern = await _checkGraphPatterns(sb, ctx);
    }

    if (!firedPattern) return false;

    // ── TAHAP 3: Anti-spam check — jangan kirim pola yang sama dalam 6 jam ──
    const spamCheck = await _isAlertOnCooldown(sb, firedPattern.name);
    if (spamCheck) {
      console.log(`[ANTICIPATORY] Pattern "${firedPattern.name}" on cooldown. Skipping.`);
      return false;
    }

    // ── TAHAP 4: Kirim intervensi proaktif ───────────────────────────────
    return await _fireIntervention(sb, firedPattern, ctx);

  } catch (err) {
    console.warn('[ANTICIPATORY] Error in runAnticipationPass:', err.message);
    return false;
  }
}

/**
 * Menelusuri causal graph dari node yang aktif saat ini ke depan
 * untuk mendeteksi pola negatif yang mungkin terpicu.
 *
 * @param {object} sb - Supabase client
 * @param {object} ctx - Konteks saat ini
 * @returns {Promise<object|null>} - Pattern yang terdeteksi atau null
 */
async function _checkGraphPatterns(sb, ctx) {
  try {
    // Map intent ke layer yang paling relevan untuk forward traversal
    const INTENT_TO_LAYER = {
      'FINANCE':    'DECISION_STYLE',
      'DISCIPLINE': 'HABITS',
      'ADVICE':     'WEAKNESSES',
      'CALENDAR':   'HABITS',
    };

    const relevantLayer = INTENT_TO_LAYER[ctx.intent];
    if (!relevantLayer) return null;

    // Ambil edges yang kuat dari layer yang relevan
    const { data: edges } = await sb
      .from('nexa_causal_graph')
      .select('from_layer, from_trait_key, to_layer, to_trait_key, causal_direction, strength, evidence_count, reasoning')
      .eq('from_layer', relevantLayer)
      .in('causal_direction', ['SUPPRESSES', 'TRIGGERS'])
      .gte('strength', MIN_EDGE_STRENGTH)
      .gte('evidence_count', MIN_EVIDENCE_COUNT)
      .order('strength', { ascending: false })
      .limit(5);

    if (!edges || edges.length === 0) return null;

    // Ambil trait yang ada di identity model untuk layer ini
    const { data: traits } = await sb
      .from('nexa_identity_model')
      .select('layer, trait_key, trait_value, confidence')
      .eq('layer', relevantLayer)
      .gte('confidence', 0.65); // Hanya trait yang cukup confident

    if (!traits || traits.length === 0) return null;

    // Cek apakah ada edge yang source-nya cocok dengan trait aktif
    for (const edge of edges) {
      const sourceTraitExists = traits.some(t =>
        t.layer === edge.from_layer && t.trait_key === edge.from_trait_key
      );

      if (sourceTraitExists && edge.causal_direction === 'SUPPRESSES' && ctx.mood === 'STRESSED') {
        // Pola SUPPRESSES + STRESSED = potensi hambatan serius
        return {
          name:         `graph_suppress_${edge.from_trait_key}_${edge.to_trait_key}`,
          description:  `Graph pattern: ${edge.from_layer}.${edge.from_trait_key} suppresses ${edge.to_layer}.${edge.to_trait_key}`,
          prediction:   `Trait "${edge.from_trait_key}" sedang aktif dan menekan "${edge.to_trait_key}" di kondisi stres saat ini.`,
          intervention: `🔍 *Pola Kognitif Terdeteksi*\n\nBerdasarkan model identitas Tuan, saat kondisi seperti ini, ada kecenderungan "${edge.from_trait_key}" menghambat "${edge.to_trait_key}".\n\nApakah ada yang bisa saya bantu untuk memperlancar proses ini?`,
          confidence:   parseFloat(Math.min(edge.strength + 0.10, 1.0).toFixed(2))
        };
      }
    }

    return null;

  } catch (err) {
    console.warn('[ANTICIPATORY] Error checking graph patterns:', err.message);
    return null;
  }
}

/**
 * Cek apakah alert untuk pattern tertentu sudah dalam cooldown period.
 *
 * @param {object} sb - Supabase client
 * @param {string} patternName - Nama pattern
 * @returns {Promise<boolean>} - true jika masih cooldown
 */
async function _isAlertOnCooldown(sb, patternName) {
  const cooldownStart = new Date(Date.now() - ALERT_COOLDOWN_MS).toISOString();
  try {
    const { data } = await sb
      .from('nexa_anticipatory_alerts')
      .select('id')
      .eq('pattern_name', patternName)
      .gte('fired_at', cooldownStart)
      .is('resolved_at', null)
      .limit(1);

    return !!(data && data.length > 0);
  } catch (_) {
    return false; // Jika gagal cek, izinkan fire
  }
}

/**
 * Men-fire intervensi: kirim ke Telegram dan simpan ke nexa_anticipatory_alerts.
 *
 * @param {object} sb - Supabase client
 * @param {object} pattern - Pola yang terdeteksi
 * @param {object} ctx - Konteks saat ini
 * @returns {Promise<boolean>}
 */
async function _fireIntervention(sb, pattern, ctx) {
  try {
    const interventionText = pattern.intervention;
    const now = new Date().toISOString();

    // Simpan ke database
    await sb
      .from('nexa_anticipatory_alerts')
      .insert([{
        pattern_name: pattern.name,
        trigger_node: `${ctx.intent}.${ctx.mood}`,
        prediction:   pattern.prediction.substring(0, 500),
        intervention: interventionText.substring(0, 1000),
        confidence:   parseFloat(pattern.confidence) || 0.60,
        context_data: {
          intent:    ctx.intent,
          mood:      ctx.mood,
          hour:      ctx.hour,
          trend_7d:  ctx.mood_7d_trend,
          variance:  ctx.mood_7d_variance
        },
        fired_at:     now,
        resolved_at:  null
      }]);

    // Kirim ke Telegram (lazy require untuk menghindari circular dependency)
    let webhookModule;
    try { webhookModule = require('../interfaces/webhook'); } catch (_) {}

    if (webhookModule?.sendTelegramOutbound) {
      await webhookModule.sendTelegramOutbound(interventionText, true);
    }

    console.log(`[ANTICIPATORY] 🚨 Fired intervention: "${pattern.name}" (confidence=${pattern.confidence})`);
    return true;

  } catch (err) {
    console.warn('[ANTICIPATORY] Failed to fire intervention:', err.message);
    return false;
  }
}

// ============================================================
// FUNGSI 3: Utility — Ambil konteks mood dari DB untuk inject ke runAnticipationPass
// ============================================================

/**
 * Mengambil konteks emosional terbaru dari nexa_behavior_log
 * untuk digunakan sebagai enrichment context di runAnticipationPass.
 * Dipanggil dari webhook.js bersamaan dengan context-building.
 *
 * @returns {Promise<{mood_7d_trend: string, mood_7d_variance: string}>}
 */
async function getLatestMoodContext() {
  const sb = _getSupabase();
  if (!sb) return { mood_7d_trend: 'STABLE', mood_7d_variance: 'LOW' };

  try {
    // [BUG FIX #6] Window diperluas dari 24h ke 36h.
    // computeMoodTimeSeries berjalan pukul 23:30 WIB. Dengan window 24 jam,
    // antara pukul 00:00-23:29 WIB keesokan harinya (hampir seharian penuh),
    // tidak ada data terbaru dalam window \u2014 sehingga mood_7d_trend selalu 'STABLE'
    // dan pola negative_mood_trend_alert tidak pernah aktif siang hari.
    // 36 jam memastikan data dari run 23:30 kemarin selalu tersedia.
    const thirtyFourHoursAgo = new Date(Date.now() - 36 * 60 * 60 * 1000).toISOString();
    const { data } = await sb
      .from('nexa_behavior_log')
      .select('event_data')
      .eq('event_type', 'MOOD_TIME_SERIES')
      .gte('created_at', thirtyFourHoursAgo)
      .order('created_at', { ascending: false })
      .limit(1);


    if (data && data.length > 0 && data[0].event_data) {
      return {
        mood_7d_trend:    data[0].event_data.mood_7d_trend    || 'STABLE',
        mood_7d_variance: data[0].event_data.mood_7d_variance || 'LOW',
      };
    }
  } catch (_) {}

  return { mood_7d_trend: 'STABLE', mood_7d_variance: 'LOW' };
}

// ============================================================
// EXPORTS
// ============================================================
module.exports = {
  buildCausalGraph,
  runAnticipationPass,
  getLatestMoodContext,

  // Expose internal helpers untuk unit testing
  _checkGraphPatterns,
  _isAlertOnCooldown,
  BUILTIN_PATTERNS,
};
