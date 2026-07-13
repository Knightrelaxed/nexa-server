/**
 * ============================================================
 * [PHASE 7 — M2] INTENTION ENGINE — Intention_Engine.js
 * ============================================================
 * Stated-vs-Revealed Reconciler + Decision Journal
 *
 * TUGAS UTAMA:
 *   1. Mendeteksi niat / intensi dari pesan user secara real-time
 *      menggunakan heuristik cepat (tanpa AI call) dan menyimpannya
 *      ke nexa_pending_intentions.
 *   2. Mendeteksi keputusan penting dan menyimpannya ke
 *      nexa_decision_journal untuk dievaluasi 30 hari kemudian.
 *   3. Cron pass harian untuk mengirim gentle friction ke Telegram
 *      jika niat tidak terbukti dalam 14 hari.
 *   4. Cron pass harian untuk menanyakan outcome keputusan.
 *
 * PRINSIP DESAIN:
 *   - Deteksi SELALU menggunakan regex/heuristik lokal. TIDAK memanggil AI.
 *     Ini memastikan zero-latency dan zero-cost tambahan per pesan.
 *   - Semua operasi DB bersifat fire-and-forget (tidak memblokir respons webhook).
 *   - Gentle friction dikirim secara natural, tidak terasa invasif.
 *
 * DIPANGGIL DARI:
 *   - webhook.js: setiap pesan masuk (fire-and-forget)
 *   - cron.js: setiap hari pukul 08:15 WIB
 * ============================================================
 */

'use strict';

const { createClient } = require('@supabase/supabase-js');
const env = require('../config/env');

// ── Lazy Supabase client ────────────────────────────────────────
let _supabase = null;
function _getSupabase() {
  if (_supabase) return _supabase;
  if (!env.SUPABASE_URL || !env.SUPABASE_KEY) return null;
  _supabase = createClient(env.SUPABASE_URL, env.SUPABASE_KEY);
  return _supabase;
}

// ── Konstanta ───────────────────────────────────────────────────
const INTENTION_DEADLINE_DAYS = 14;   // Gentle friction dikirim setelah 14 hari
const DECISION_OUTCOME_DAYS   = 30;   // Outcome check dikirim setelah 30 hari

// ── Pola Regex Deteksi Intensi (Bahasa Indonesia + campuran Inggris) ──────────
// Mendeteksi kalimat yang mengandung niat masa depan.
// Diurutkan dari paling spesifik ke paling umum.
const INTENTION_PATTERNS = [
  // "aku/saya/gue akan/mau/bakal [verb]"
  /\b(aku|saya|gue|kami)\s+(akan|mau|bakal|berencana|hendak|ingin)\s+(?:mulai\s+)?([a-zA-ZÀ-ÿ][a-zA-ZÀ-ÿ\s]{3,40})/i,
  // "rencana[ku] [verb]"
  /\brencana(?:ku|saya|nya)?\s+(?:mau\s+|akan\s+)?([a-zA-ZÀ-ÿ][a-zA-ZÀ-ÿ\s]{3,40})/i,
  // "besok/minggu depan/bulan depan [verb]"
  /\b(besok|minggu depan|bulan depan|pekan depan|next week|setelah ini)\s+(?:aku\s+|saya\s+|gue\s+)?(?:mau\s+|akan\s+|bakal\s+)?([a-zA-ZÀ-ÿ][a-zA-ZÀ-ÿ\s]{3,40})/i,
  // "pengen/pingin [verb]" — lebih lemah, perlu konteks lebih
  /\b(pengen|pingin|niat)\s+(mulai\s+)?([a-zA-ZÀ-ÿ][a-zA-ZÀ-ÿ\s]{3,40})/i,
];

// Kata-kata yang BUKAN intensi asli (filter negatif untuk mengurangi false positive)
const INTENTION_EXCLUSIONS = [
  /\bnexa\b/i,         // Perintah ke N.E.X.A bukan intensi
  /\bkamu\b/i,         // Tentang orang lain bukan intensi diri
  /\bdia\b/i,
  /\bmereka\b/i,
  /\bapakah\b/i,       // Kalimat tanya
  /\bapa\b/i,
  /\bkenapa\b/i,
  /\bgimana\b/i,
  /\bcatat\b/i,        // Perintah catat bukan intensi
  /\bingatkan\b/i,
  /\btolong\b/i,
];

// ── Pola Regex Deteksi Keputusan Penting ─────────────────────────
// Lebih ketat dari intensi — harus menunjukkan keputusan yang sudah atau akan diambil.
const DECISION_PATTERNS = [
  // "aku memutuskan/sudah memutuskan [verb/noun]"
  /\b(memutuskan|sudah memutuskan|udah mutusin|akhirnya|fix|final)\s+(?:untuk\s+)?([a-zA-ZÀ-ÿ0-9][a-zA-ZÀ-ÿ0-9\s]{5,60})/i,
  // "aku [sudah/baru] beli/bayar/sewa/langganan..."
  /\b(beli|membeli|bayar|membayar|sewa|menyewa|langganan|berlangganan|investasi|berinvestasi)\s+([a-zA-ZÀ-ÿ0-9][a-zA-ZÀ-ÿ0-9\s]{3,50})/i,
  // "aku daftar/mendaftar ke..."
  /\b(daftar|mendaftar|apply|melamar)\s+(?:ke\s+|di\s+)?([a-zA-ZÀ-ÿ][a-zA-ZÀ-ÿ\s]{3,40})/i,
  // "aku resign/keluar/pindah/ikut/gabung"
  /\b(resign|keluar|pindah|ikut|bergabung|gabung|berhenti)\s+(?:dari\s+|ke\s+)?([a-zA-ZÀ-ÿ][a-zA-ZÀ-ÿ\s]{0,40})/i,
];

// Intent yang dianggap bisa mengandung keputusan penting
const DECISION_TRIGGERING_INTENTS = new Set([
  'FINANCE', 'DISCIPLINE', 'CALENDAR', 'ADVICE', 'NORMAL_CHAT'
]);

// ── Stopwords untuk membersihkan niat yang terdeteksi ────────────
const STOPWORDS_ID = new Set([
  'yang', 'dan', 'di', 'ke', 'dari', 'ini', 'itu', 'ada', 'tidak',
  'dengan', 'untuk', 'atau', 'pada', 'dalam', 'juga', 'sudah', 'lagi',
  'bisa', 'agar', 'supaya', 'karena', 'tapi', 'tapi', 'namun',
]);

// ============================================================
// FUNGSI 1: Deteksi Intensi dari teks pesan
// ============================================================

/**
 * Mendeteksi niat / intensi dari teks pesan menggunakan heuristik regex.
 * Mengembalikan string intensi yang bersih atau null jika tidak ada intensi.
 *
 * @param {string} text - Teks pesan Tuan Faqih
 * @returns {string|null} - Teks intensi bersih atau null
 */
function _detectIntention(text) {
  if (!text || text.length < 10) return null;

  // Cek filter negatif dulu — jika ada exclusion keyword, skip
  for (const exclusion of INTENTION_EXCLUSIONS) {
    if (exclusion.test(text)) return null;
  }

  // Coba cocokkan setiap pola intensi
  for (const pattern of INTENTION_PATTERNS) {
    const match = text.match(pattern);
    if (match) {
      // Ambil grup terakhir yang paling relevan (teks niat)
      const intentionText = match[match.length - 1]?.trim() || '';

      // Filter: harus minimal 4 kata atau 15 karakter
      if (intentionText.length < 8) continue;

      // Bersihkan teks intensi dari stopwords di awal/akhir
      const cleaned = intentionText
        .replace(/\s+/g, ' ')
        .replace(/[.,!?;:]+$/, '')
        .trim();

      if (cleaned.length >= 8) {
        return cleaned;
      }
    }
  }

  return null;
}

/**
 * [PHASE 7 — M2] Mendeteksi dan menyimpan intensi dari pesan user.
 * Dipanggil dari webhook.js secara fire-and-forget setelah routing selesai.
 * Menggunakan heuristik lokal — zero AI call, zero latency.
 *
 * @param {string} text - Teks pesan Tuan Faqih
 * @param {object} [routingData] - Data routing dari AI_Router (opsional)
 * @returns {Promise<boolean>} - true jika intensi berhasil disimpan
 */
async function detectAndSaveIntention(text, routingData = {}) {
  const sb = _getSupabase();
  if (!sb || !text) return false;

  const intentionText = _detectIntention(text);
  if (!intentionText) return false;

  const deadlineAt = new Date(Date.now() + INTENTION_DEADLINE_DAYS * 24 * 60 * 60 * 1000).toISOString();

  try {
    // Dedup: cek apakah intensi serupa sudah ada dalam 7 hari terakhir
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { data: existing } = await sb
      .from('nexa_pending_intentions')
      .select('id, intention')
      .eq('status', 'ACTIVE')
      .gte('created_at', sevenDaysAgo)
      .limit(20);

    // Cek kesamaan sederhana (substring match)
    const isDuplicate = (existing || []).some(row => {
      const a = String(row.intention).toLowerCase().trim();
      const b = intentionText.toLowerCase().trim();
      return a.includes(b.substring(0, 20)) || b.includes(a.substring(0, 20));
    });

    if (isDuplicate) {
      console.log(`[INTENTION] Skipped duplicate intention: "${intentionText.substring(0, 50)}"`);
      return false;
    }

    const { error } = await sb
      .from('nexa_pending_intentions')
      .insert([{
        intention:   intentionText,
        source_text: text.substring(0, 500),
        status:      'ACTIVE',
        deadline_at: deadlineAt,
        created_at:  new Date().toISOString()
      }]);

    if (error) {
      console.warn('[INTENTION] Failed to save intention:', error.message);
      return false;
    }

    console.log(`[INTENTION] 📌 Saved intention: "${intentionText.substring(0, 60)}" (due ${deadlineAt.substring(0, 10)})`);
    return true;

  } catch (err) {
    console.warn('[INTENTION] Unexpected error detecting intention:', err.message);
    return false;
  }
}

// ============================================================
// FUNGSI 2: Deteksi Keputusan Penting dari teks pesan
// ============================================================

/**
 * Mendeteksi keputusan penting dari teks pesan dan menyimpannya
 * ke nexa_decision_journal untuk dievaluasi 30 hari kemudian.
 * Dipanggil dari webhook.js secara fire-and-forget.
 *
 * @param {string} text - Teks pesan Tuan Faqih
 * @param {object} [routingData] - Data routing dari AI_Router
 * @param {string} [emotionalState] - State emosional yang terdeteksi
 * @returns {Promise<boolean>} - true jika keputusan berhasil disimpan
 */
async function detectAndSaveDecision(text, routingData = {}, emotionalState = 'NEUTRAL') {
  const sb = _getSupabase();
  if (!sb || !text) return false;

  // Hanya proses intent yang relevan
  const intent = String(routingData.intent || 'NORMAL_CHAT').toUpperCase();
  if (!DECISION_TRIGGERING_INTENTS.has(intent)) return false;

  // Cari pola keputusan
  let decisionText = null;
  for (const pattern of DECISION_PATTERNS) {
    const match = text.match(pattern);
    if (match) {
      decisionText = match[0]?.trim();
      break;
    }
  }

  if (!decisionText || decisionText.length < 10) return false;

  const outcomeCheckAt = new Date(Date.now() + DECISION_OUTCOME_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const now = new Date().toISOString();

  try {
    // Dedup: tidak menyimpan keputusan yang sama persis dalam 24 jam terakhir
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data: existing } = await sb
      .from('nexa_decision_journal')
      .select('id, decision')
      .gte('created_at', oneDayAgo)
      .limit(10);

    const isDuplicate = (existing || []).some(row => {
      const a = String(row.decision).toLowerCase().substring(0, 30);
      const b = decisionText.toLowerCase().substring(0, 30);
      return a === b;
    });

    if (isDuplicate) return false;

    const { error } = await sb
      .from('nexa_decision_journal')
      .insert([{
        decision:        decisionText.substring(0, 300),
        context:         text.substring(0, 500),
        emotional_state: String(emotionalState || 'NEUTRAL').toUpperCase(),
        decision_time:   now,
        intent_trigger:  intent,
        outcome_check_at: outcomeCheckAt,
        created_at:      now
      }]);

    if (error) {
      console.warn('[INTENTION] Failed to save decision:', error.message);
      return false;
    }

    console.log(`[INTENTION] 📋 Saved decision: "${decisionText.substring(0, 60)}" (outcome due ${outcomeCheckAt.substring(0, 10)})`);
    return true;

  } catch (err) {
    console.warn('[INTENTION] Unexpected error detecting decision:', err.message);
    return false;
  }
}

// ============================================================
// FUNGSI 3: Cron Pass — Gentle Friction untuk Intensi Kedaluarsa
// ============================================================

/**
 * [PHASE 7 — M2] Cek semua intensi ACTIVE yang sudah melewati deadline.
 * Untuk setiap intensi yang ditemukan, kirim pesan "gentle friction" ke Telegram
 * untuk menanyakan perkembangannya, lalu tandai sebagai EXPIRED.
 *
 * Dipanggil oleh cron.js setiap pagi pukul 08:15 WIB.
 *
 * @returns {Promise<{checked: number, sent: number, errors: number}>}
 */
async function runIntentionCheckPass() {
  console.log('[INTENTION] ── Starting Intention Check Pass...');
  const sb = _getSupabase();
  if (!sb) return { checked: 0, sent: 0, errors: 0 };

  const stats = { checked: 0, sent: 0, errors: 0 };
  const nowIso = new Date().toISOString();

  try {
    // Ambil semua intensi ACTIVE yang sudah melewati deadline
    const { data: expiredIntentions, error: fetchError } = await sb
      .from('nexa_pending_intentions')
      .select('*')
      .eq('status', 'ACTIVE')
      .lte('deadline_at', nowIso)
      .order('deadline_at', { ascending: true })
      .limit(5); // Maks 5 pesan per hari agar tidak spam

    if (fetchError) {
      console.warn('[INTENTION] Failed to fetch expired intentions:', fetchError.message);
      return stats;
    }

    if (!expiredIntentions || expiredIntentions.length === 0) {
      console.log('[INTENTION] No expired intentions. Pass complete.');
      return stats;
    }

    // Lazy require webhook untuk kirim Telegram
    let webhookModule;
    try { webhookModule = require('../interfaces/webhook'); } catch (_) {}

    for (const item of expiredIntentions) {
      stats.checked++;
      try {
        // Hitung berapa hari yang lalu niat ini diucapkan
        const daysAgo = Math.round(
          (Date.now() - new Date(item.created_at).getTime()) / (1000 * 60 * 60 * 24)
        );

        // Susun pesan gentle friction yang natural
        const frictionMsg = [
          `🔁 <b>N.E.X.A: Sekilas Kilas Balik</b>`,
          ``,
          `${daysAgo} hari lalu, Tuan sempat menyebut:`,
          `<i>"${item.intention}"</i>`,
          ``,
          `Bagaimana perkembangannya sejauh ini? Saya tidak ingin menggurui — hanya ingin tahu apakah niat ini masih relevan atau sudah terwujud. 😊`
        ].join('\n');

        if (webhookModule?.sendTelegramOutbound) {
          await webhookModule.sendTelegramOutbound(frictionMsg, true);
          stats.sent++;
          console.log(`[INTENTION] Gentle friction sent for: "${item.intention.substring(0, 50)}"`);
        }

        // Tandai sebagai EXPIRED agar tidak terkirim lagi
        await sb
          .from('nexa_pending_intentions')
          .update({ status: 'EXPIRED' })
          .eq('id', item.id);

        // Jeda antar pesan agar tidak terasa spam
        await new Promise(r => setTimeout(r, 1500));

      } catch (itemErr) {
        console.warn(`[INTENTION] Error processing intention #${item.id}:`, itemErr.message);
        stats.errors++;
      }
    }

    console.log(`[INTENTION] ── Intention Pass Done: checked=${stats.checked} sent=${stats.sent} errors=${stats.errors}`);
    return stats;

  } catch (err) {
    console.error('[INTENTION] ❌ Critical error in Intention Check Pass:', err.message);
    return { ...stats, errors: stats.errors + 1 };
  }
}

// ============================================================
// FUNGSI 4: Cron Pass — Outcome Check untuk Decision Journal
// ============================================================

/**
 * [PHASE 7 — M2] Cek semua keputusan yang sudah waktunya dievaluasi
 * (outcome_check_at terlewati, outcome_result masih NULL).
 * Kirim pertanyaan outcome ke Telegram secara natural.
 *
 * Dipanggil oleh cron.js setiap pagi pukul 08:15 WIB.
 *
 * @returns {Promise<{checked: number, sent: number, errors: number}>}
 */
async function runOutcomeCheckPass() {
  console.log('[INTENTION] ── Starting Outcome Check Pass...');
  const sb = _getSupabase();
  if (!sb) return { checked: 0, sent: 0, errors: 0 };

  const stats = { checked: 0, sent: 0, errors: 0 };
  const nowIso = new Date().toISOString();

  try {
    // Ambil keputusan yang sudah waktunya dievaluasi (outcome_result IS NULL)
    const { data: pendingOutcomes, error: fetchError } = await sb
      .from('nexa_decision_journal')
      .select('*')
      .is('outcome_result', null)
      .lte('outcome_check_at', nowIso)
      .order('outcome_check_at', { ascending: true })
      .limit(3); // Maks 3 pertanyaan outcome per hari

    if (fetchError) {
      console.warn('[INTENTION] Failed to fetch pending outcomes:', fetchError.message);
      return stats;
    }

    if (!pendingOutcomes || pendingOutcomes.length === 0) {
      console.log('[INTENTION] No pending outcomes. Pass complete.');
      return stats;
    }

    let webhookModule;
    try { webhookModule = require('../interfaces/webhook'); } catch (_) {}

    for (const item of pendingOutcomes) {
      stats.checked++;
      try {
        const daysAgo = Math.round(
          (Date.now() - new Date(item.decision_time).getTime()) / (1000 * 60 * 60 * 24)
        );

        // Konteks emosi saat keputusan dibuat
        const emotionLabel = {
          'STRESSED': 'dalam kondisi tertekan',
          'EXCITED':  'dalam kondisi semangat tinggi',
          'CASUAL':   'secara santai',
          'NEUTRAL':  '',
        }[item.emotional_state] || '';

        const outcomeMsg = [
          `📋 <b>N.E.X.A: Decision Journal — Outcome Check</b>`,
          ``,
          `${daysAgo} hari lalu${emotionLabel ? ' ' + emotionLabel : ''}, Tuan sempat membuat keputusan:`,
          `<i>"${item.decision}"</i>`,
          ``,
          `Apakah keputusan ini terbukti tepat? Bagaimana hasilnya sejauh ini?`,
          ``,
          `_(Tidak perlu panjang — satu kalimat pun sudah cukup untuk membantu saya memahami pola pengambilan keputusan Tuan)_`
        ].join('\n');

        if (webhookModule?.sendTelegramOutbound) {
          await webhookModule.sendTelegramOutbound(outcomeMsg, true);
          stats.sent++;
          console.log(`[INTENTION] Outcome check sent for decision: "${item.decision.substring(0, 50)}"`);
        }

        // Update outcome_received_at sebagai sinyal bahwa pertanyaan sudah dikirim
        // outcome_result dibiarkan NULL sampai user membalas
        await sb
          .from('nexa_decision_journal')
          .update({ outcome_received_at: new Date().toISOString() })
          .eq('id', item.id);

        await new Promise(r => setTimeout(r, 1500));

      } catch (itemErr) {
        console.warn(`[INTENTION] Error processing decision #${item.id}:`, itemErr.message);
        stats.errors++;
      }
    }

    console.log(`[INTENTION] ── Outcome Pass Done: checked=${stats.checked} sent=${stats.sent} errors=${stats.errors}`);
    return stats;

  } catch (err) {
    console.error('[INTENTION] ❌ Critical error in Outcome Check Pass:', err.message);
    return { ...stats, errors: stats.errors + 1 };
  }
}

// ============================================================
// EXPORTS
// ============================================================
module.exports = {
  detectAndSaveIntention,
  detectAndSaveDecision,
  runIntentionCheckPass,
  runOutcomeCheckPass,

  // Expose internal helper untuk unit testing
  _detectIntention,
};
