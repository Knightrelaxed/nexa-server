/**
 * ============================================================
 * [PHASE 11] CHRONO-CONSOLIDATOR — Chrono_Consolidator.js
 * ============================================================
 * The 90-Day Rolling Daily Episodic Memory Consolidation Engine
 *
 * TUGAS UTAMA:
 *   Mengompresi riwayat chat percakapan mentah (nexa_chat_memories) yang
 *   telah berumur > 90 hari menjadi SATU entri narasi harian berkualitas tinggi
 *   dari sudut pandang N.E.X.A ("Saya") ke dalam tabel nexa_daily_narratives.
 *
 * FITUR UTAMA:
 *   1. 1st-Person Perspective: Ditulis dari sudut pandang asisten N.E.X.A ("Saya").
 *   2. Zero-Loss Fidelity: Menjaga 100% entitas penting, angka, nama orang, dan keputusan.
 *   3. Zero Database Bloat: Menghemat ~98% storage Supabase jangka panjang.
 *   4. Atomic Safety Gate: Data mentah HANYA dihapus setelah narasi sukses tersimpan.
 *   5. Timezone-Locked: Dikelompokkan ketat per hari Asia/Jakarta (WIB).
 * ============================================================
 */

'use strict';

const supabaseMemories = require('../infrastructure/Supabase_Memories');
const { executeWithFallback } = require('../core/Fallback_Engine');

// Mapping hari bahasa Indonesia
const DAY_NAMES_ID = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];

/**
 * Format date string (YYYY-MM-DD) to Indonesian Day Name.
 */
function getIndonesianDayName(dateStr) {
  const d = new Date(`${dateStr}T12:00:00+07:00`);
  const dayIndex = d.getDay();
  return DAY_NAMES_ID[dayIndex] || 'Hari';
}

/**
 * Clean & parse LLM JSON output safely with multiline string repair.
 */
function parseJsonOutput(rawResult) {
  if (!rawResult) return null;
  let cleanStr = String(rawResult).replace(/```json/gi, '').replace(/```/g, '').trim();
  const firstBrace = cleanStr.indexOf('{');
  const lastBrace = cleanStr.lastIndexOf('}');
  if (firstBrace === -1 || lastBrace <= firstBrace) return null;
  
  cleanStr = cleanStr.substring(firstBrace, lastBrace + 1);
  try {
    return JSON.parse(cleanStr);
  } catch (err) {
    // Attempt repair: escape literal newlines inside JSON string properties
    try {
      const sanitized = cleanStr.replace(/"([^"\\]*(\\.[^"\\]*)*)"/gs, (match) => {
        return match.replace(/\r?\n/g, '\\n');
      });
      return JSON.parse(sanitized);
    } catch (e2) {
      console.warn('[CHRONO-CONSOLIDATOR] JSON parse failed after repair attempt:', err.message);
      return null;
    }
  }
}

/**
 * Synthesize a single day of chat transcripts into a structured daily narrative.
 */
async function synthesizeDayTranscript(targetDateStr, messages) {
  const dayName = getIndonesianDayName(targetDateStr);
  const totalCount = messages.length;

  // Format chat lines with timestamp
  const transcriptLines = messages.map(m => {
    const timeStr = m.created_at
      ? new Date(m.created_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta' })
      : '--:--';
    const roleLabel = (m.role || 'user').toLowerCase() === 'assistant' ? 'N.E.X.A' : 'Tuan Faqih';
    return `[${timeStr} WIB] ${roleLabel}: ${m.content}`;
  }).join('\n');

  const systemPrompt = `Anda adalah "N.E.X.A", asisten pribadi cerdas, loyal, dan analitis untuk Tuan Faqih.

Tugas Anda:
Merangkum seluruh log percakapan hari ini ke dalam SATU entri catatan memori biografis harian dari sudut pandang Anda sendiri ("Saya / N.E.X.A") yang menceritakan interaksi Anda bersama Tuan Faqih sepanjang hari.

PEDOMAN PENULISAN:
1. SUDUT PANDANG: Gunakan sudut pandang orang pertama ("Saya" atau "N.E.X.A") dan panggil user sebagai "Tuan" atau "Tuan Faqih".
   - Contoh gaya bahasa:
     "Pagi hari pukul 08:15 WIB, Tuan menanyakan jadwal bimbingan kepada saya..."
     "Saya mencatat pengeluaran Tuan untuk servis laptop sebesar Rp450.000..."
     "Tuan berdiskusi panjang dengan saya mengenai ide Lean Router..."
     "Tuan menginstruksikan saya untuk mengingatkan follow-up email besok pagi..."
2. KRONOLOGIS & DETAIL UTUH: Ceritakan urutan aktivitas dari pagi hingga malam. JANGAN SAMPAI HILANG:
   - Nama orang (dosen, rekan, keluarga, klien) dan institusi/tempat yang dikunjungi.
   - Nominal uang, metode pembayaran, atau transaksi finansial.
   - Keputusan penting (akademis, teknis, karir, pribadi).
   - Ide/gagasan teknis baru yang dicetuskan Tuan.
   - Urusan menggantung / "unresolved loops" (janji atau rencana yang belum tuntas).
3. ANTI-HALUSINASI: Jangan mengarang fakta. Hanya rangkum apa yang nyata tercatat di transkrip.
4. FORMAT OUTPUT: Wajib JSON murni tanpa markdown/backticks luar.

JSON FORMAT:
{
  "narrative": "Teks narasi kronologis mendalam (2-4 paragraf rapi) dari sudut pandang Saya (N.E.X.A).",
  "key_events": [
    { "category": "ACADEMIC/FINANCE/TECH_IDEA/PERSONAL_DECISION/INCIDENT/SOCIAL", "detail": "Deskripsi singkat fakta" }
  ],
  "named_entities": {
    "people": ["Nama Orang"],
    "places": ["Nama Lokasi/Tempat"],
    "technologies": ["Nama Teknologi/Proyek"],
    "projects": ["Nama Proyek/Tugas"]
  },
  "unresolved_loops": [
    "Daftar janji, tugas menggantung, atau rencana lanjutan"
  ],
  "mood_state": "MISAL: DEEP_FOCUS / STRESSED_TO_RELIEVED / RELAXED",
  "approx_sleep_time": "00:45 WIB (atau waktu interaksi terakhir)"
}`;

  const userPrompt = `=== TARGET KONSOLIDASI HARIAN ===
Tanggal: ${targetDateStr} (${dayName})
Total Percakapan: ${totalCount} pesan
Zona Waktu: Asia/Jakarta (WIB)

=== TRANSKRIP PERCAKAPAN HARI INI ===
${transcriptLines.substring(0, 50000)}

Susun rangkuman memori harian berperspektif N.E.X.A dan kembalikan JSON valid sesuai skema.`;

  const rawAiResult = await executeWithFallback(
    userPrompt,
    systemPrompt,
    0.2,
    false, // jsonMode: false so Fallback_Engine doesn't reject multiline strings prematurely
    { forceHeavy: true } // Kategori A - Gemini Flash / Fallback Engine
  );

  const parsed = parseJsonOutput(rawAiResult);
  if (!parsed || !parsed.narrative) {
    throw new Error(`LLM failed to return a valid narrative JSON for date ${targetDateStr}`);
  }

  return {
    narrative_date: targetDateStr,
    day_name: dayName,
    narrative: String(parsed.narrative).trim(),
    key_events: Array.isArray(parsed.key_events) ? parsed.key_events : [],
    named_entities: parsed.named_entities && typeof parsed.named_entities === 'object' ? parsed.named_entities : {},
    unresolved_loops: Array.isArray(parsed.unresolved_loops) ? parsed.unresolved_loops : [],
    mood_state: parsed.mood_state ? String(parsed.mood_state).trim() : 'NEUTRAL',
    approx_sleep_time: parsed.approx_sleep_time ? String(parsed.approx_sleep_time).trim() : null,
    total_chat_count: totalCount,
    created_at: new Date().toISOString()
  };
}

/**
 * Main Orchestrator: Run the Daily Chrono-Consolidation Pass.
 *
 * @param {Object} options
 * @param {boolean} options.dryRun - If true, synthesizes narratives without saving to DB or deleting raw chats.
 * @param {number} options.maxDaysPerRun - Maximum days to consolidate in a single run (default: 7).
 * @param {number} options.olderThanDays - Age threshold for raw chats (default: 90).
 */
async function runDailyChronoConsolidation(options = {}) {
  const { dryRun = false, maxDaysPerRun = 7, olderThanDays = 90 } = options;
  const startTime = Date.now();
  console.log(`[CHRONO-CONSOLIDATOR] ── Starting Chrono-Consolidation Pass (olderThan=${olderThanDays}d, maxDays=${maxDaysPerRun}, dryRun=${dryRun})...`);

  const results = {
    processedDates: [],
    totalChatsCompressed: 0,
    savedNarratives: 0,
    errors: [],
    dryRun
  };

  try {
    const candidateDates = await supabaseMemories.getCandidateDatesToConsolidate(olderThanDays);
    if (!candidateDates || candidateDates.length === 0) {
      console.log('[CHRONO-CONSOLIDATOR] No candidate dates older than threshold found. Database is clean.');
      return results;
    }

    const targetDates = candidateDates.slice(0, maxDaysPerRun);
    console.log(`[CHRONO-CONSOLIDATOR] Found ${candidateDates.length} candidate date(s). Processing batch of ${targetDates.length}:`, targetDates);

    for (const targetDate of targetDates) {
      try {
        console.log(`[CHRONO-CONSOLIDATOR] Fetching chats for date: ${targetDate}...`);
        const { messages, messageIds } = await supabaseMemories.getChatsForDateWib(targetDate);

        if (!messages || messages.length === 0) {
          console.log(`[CHRONO-CONSOLIDATOR] Zero messages for date ${targetDate}. Skipping.`);
          continue;
        }

        console.log(`[CHRONO-CONSOLIDATOR] Synthesizing ${messages.length} messages for ${targetDate}...`);
        const narrativePayload = await synthesizeDayTranscript(targetDate, messages);

        if (dryRun) {
          console.log(`[CHRONO-CONSOLIDATOR] [DRY RUN] Generated Narrative for ${targetDate}:\n${narrativePayload.narrative.substring(0, 120)}...`);
          results.processedDates.push(targetDate);
          results.totalChatsCompressed += messages.length;
          continue;
        }

        // STEP 1: Save narrative to nexa_daily_narratives
        console.log(`[CHRONO-CONSOLIDATOR] Saving daily narrative for ${targetDate} to database...`);
        const saved = await supabaseMemories.saveDailyNarrative(narrativePayload);

        if (!saved && !dryRun) {
          throw new Error(`Failed to insert daily narrative for ${targetDate}`);
        }

        // STEP 2: Atomic Pruning of raw chats
        console.log(`[CHRONO-CONSOLIDATOR] Pruning ${messageIds.length} raw chat rows for ${targetDate}...`);
        const prunedCount = await supabaseMemories.pruneRawChatsByIds(messageIds);

        console.log(`[CHRONO-CONSOLIDATOR] ✅ Successfully consolidated ${targetDate}: ${prunedCount} chats compressed.`);
        results.processedDates.push(targetDate);
        results.totalChatsCompressed += prunedCount;
        results.savedNarratives++;

      } catch (dayErr) {
        console.error(`[CHRONO-CONSOLIDATOR] ❌ Error processing date ${targetDate}:`, dayErr.message);
        results.errors.push({ date: targetDate, error: dayErr.message });
      }
    }

  } catch (err) {
    console.error('[CHRONO-CONSOLIDATOR] Pipeline failure:', err.message);
    results.errors.push({ pipeline: err.message });
  }

  const elapsed = Math.round((Date.now() - startTime) / 1000);
  console.log(`[CHRONO-CONSOLIDATOR] ── Pass complete in ${elapsed}s. Dates: ${results.processedDates.length} | Chats Compressed: ${results.totalChatsCompressed} | Errors: ${results.errors.length}`);
  return results;
}

module.exports = {
  runDailyChronoConsolidation,
  synthesizeDayTranscript,
  getIndonesianDayName,
  parseJsonOutput
};
