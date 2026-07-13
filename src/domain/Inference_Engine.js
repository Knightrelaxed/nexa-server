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
// TAHAP 5: PERSISTENCE — Simpan proposal ke database
// ============================================================

/**
 * Simpan satu hipotesis yang sudah divalidasi ke nexa_identity_proposals.
 * Jika proposal serupa sudah ada di STAGED (dari minggu lalu),
 * update confidence-nya alih-alih membuat record baru.
 *
 * @param {object} hypothesis - Hipotesis yang sudah divalidasi
 * @param {Array} stagedProposals - Proposal STAGED yang ada saat ini
 * @returns {Promise<{success: boolean, proposalId: number|null, status: string}>}
 */
async function _persistProposal(hypothesis, stagedProposals) {
  const sb = _getSupabase();
  if (!sb) return { success: false, proposalId: null, status: 'NO_DB' };

  const layer = String(hypothesis.layer).toUpperCase();
  const traitKey = String(hypothesis.trait_key).toLowerCase().trim();
  const newConfidence = parseFloat(hypothesis.confidence) || 0;
  const status = newConfidence > 0.85 ? 'PENDING' : 'STAGED';

  // Cek apakah sudah ada proposal STAGED untuk trait yang sama
  const existingStaged = stagedProposals.find(
    p => p.layer === layer && p.trait_key === traitKey
  );

  if (existingStaged) {
    // Update confidence (rata-rata dengan bukti baru) dan reasoning
    const mergedConfidence = Math.min(
      ((existingStaged.confidence + newConfidence) / 2) + 0.05, // Boost sedikit karena ada bukti tambahan
      1.0
    );
    const newStatus = mergedConfidence > 0.85 ? 'PENDING' : 'STAGED';

    const { data, error } = await sb
      .from('nexa_identity_proposals')
      .update({
        confidence: parseFloat(mergedConfidence.toFixed(2)),
        reasoning: `[Diperbarui minggu ini] ${hypothesis.reasoning}`,
        proposed_value: hypothesis.proposed_value, // Update value ke yang terbaru
        status: newStatus
      })
      .eq('id', existingStaged.id)
      .select()
      .single();

    if (error) {
      console.warn(`[INFERENCE] Failed to update staged proposal #${existingStaged.id}:`, error.message);
      return { success: false, proposalId: null, status: 'ERROR' };
    }

    console.log(`[INFERENCE] Updated STAGED proposal #${existingStaged.id} → confidence ${Math.round(mergedConfidence * 100)}% → ${newStatus}`);
    return { success: true, proposalId: existingStaged.id, status: newStatus };
  }

  // Buat proposal baru
  const payload = {
    layer,
    trait_key: traitKey,
    proposed_value: String(hypothesis.proposed_value).trim(),
    old_value: hypothesis.old_value ? String(hypothesis.old_value).trim() : null,
    confidence: parseFloat(newConfidence.toFixed(2)),
    reasoning: String(hypothesis.reasoning).trim(),
    status,
    created_at: new Date().toISOString()
  };

  const { data, error } = await sb
    .from('nexa_identity_proposals')
    .insert([payload])
    .select()
    .single();

  if (error) {
    console.warn('[INFERENCE] Failed to insert new proposal:', error.message);
    return { success: false, proposalId: null, status: 'ERROR' };
  }

  console.log(`[INFERENCE] ✅ New proposal #${data.id} saved: [${layer}] ${traitKey} → "${hypothesis.proposed_value}" (${Math.round(newConfidence * 100)}% → ${status})`);
  return { success: true, proposalId: data.id, status };
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

      // Simpan ke database
      const persistResult = await _persistProposal(hypothesis, stagedProposals);

      if (!persistResult.success) {
        result.skipped++;
        continue;
      }

      result.saved++;

      if (persistResult.status === 'PENDING') {
        pendingToSend.push({ proposalId: persistResult.proposalId });
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
// EXPORTS
// ============================================================
module.exports = {
  runWeeklyIdentityInference,

  // Expose internal helpers untuk unit testing
  _synthesizeBehaviorSummary,
  _synthesizeChatSummary,
  _validateHypothesis,
  _isDuplicate,
};
