const fs = require('fs');
const path = require('path');

const code = `/**
 * ============================================================
 * INTENTION ENGINE — Intention_Engine.js
 * ============================================================
 * Stated-vs-Revealed Reconciler + Decision Journal
 *
 * TUGAS UTAMA:
 *   1. Mendeteksi niat / rencana strategis (SUBSTANTIF) dari pesan user
 *      secara real-time (tanpa AI call overhead) dan menyimpannya ke
 *      nexa_pending_intentions.
 *   2. Mengabaikan 100% aktivitas instan harian (makan, tidur, sholat, ngobrol)
 *      dan teks kutipan N.E.X.A ([KONTEKS_REFERENSI]).
 *   3. Menutup loop kognitif secara otomatis (auto-reconcile) jika Tuan
 *      menyebutkan bahwa rencana tersebut sudah selesai/terwujud di chat berikutnya.
 *   4. Cron pass harian pagi (08:15 WIB) dengan STRICT RATE LIMIT (maksimal 1 follow-up/hari)
 *      menggunakan bahasa santai, hangat, dan tanpa em-dash.
 *
 * PRINSIP DESAIN:
 *   - Zero-latency: Evaluasi regex cepat, operasi DB fire-and-forget.
 *   - High Signal-to-Noise: Hanya melacak tujuan berbobot (akademik, karir,
 *     proyek besar, pembelian aset penting, pemeriksaan medis).
 *   - Anti-Spam: Tidak ada rentetan notifikasi ganda di menit yang sama.
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
const INTENTION_DEADLINE_DAYS = 14;   // Follow-up dikirim setelah 14 hari
const DECISION_OUTCOME_DAYS   = 30;   // Outcome check dikirim setelah 30 hari
const MAX_INTENTIONS_PER_PASS = 1;    // MAKSIMAL 1 notifikasi per pagi (Anti-Spam Mutlak)
const MAX_OUTCOMES_PER_PASS   = 1;    // MAKSIMAL 1 outcome check per pagi

// ── 1. Pembersihan Teks Masukan (Strip Context & Quotes) ─────────
function _cleanUserText(rawText) {
  if (!rawText || typeof rawText !== 'string') return '';
  // Buang blok kutipan Telegram seperti [KONTEKS_REFERENSI ...] atau [KONTEKS_AKSI ...]
  let text = rawText.replace(/\\[KONTEKS_[A-Z]+[\\s\\S]*?\\]/gi, '').trim();
  return text;
}

// ── 2. Filter Negatif Mutlak (Exclusions) ────────────────────────
const INTENTION_EXCLUSIONS = [
  /\\bnexa\\b/i,         // Perintah ke N.E.X.A bukan niat
  /\\bkamu\\b/i,         // Tentang orang lain
  /\\bdia\\b/i,
  /\\bmereka\\b/i,
  /\\bapakah\\b/i,       // Kalimat tanya
  /\\bapa\\b/i,
  /\\bkenapa\\b/i,
  /\\bgimana\\b/i,
  /\\b\\?\\s*$/m,         // Kalimat tanya dengan tanda tanya
  /\\bcatat\\b/i,        // Perintah catat bukan niat
  /\\bingatkan\\b/i,
  /\\btolong\\b/i,
  /\\bhapus\\b/i,
  /\\bcek\\b/i,
];

// Kata kerja & aktivitas rutin instan (EPHEMERAL MICRO-ACTIONS)
// Ini adalah aktivitas berdurasi < 2 jam yang TIDAK BOLEH ditagih 14 hari kemudian!
const EPHEMERAL_EXCLUSIONS = [
  /\\b(makan|minum|sarapan|maksi|makan siang|makan malam|jajan|ngemil|beli makan)\\b/i,
  /\\b(tidur|istirahat|rebahan|merem|tidur siang|bobo|rehat)\\b/i,
  /\\b(sholat|shalat|solat|jumatan|mengaji|tpa)\\b/i,
  /\\b(mandi|cuci|bebersih|nyapu|ngepel)\\b/i,
  /\\b(ngobrol|chat|curhat|bicara|tanya|nanya|kasih tau|ngasih tau|bilang|dengar)\\b/i,
  /\\b(nongkrong|jalan-jalan|keluar sebentar|pulang|cabut|berangkat|otw|balik)\\b/i,
  /\\b(cek|periksa fitur|coba|nyoba|tes|testing|login|logout|buka|tutup)\\b/i,
  /\\b(santai|rebahan dulu|istirahat dulu|ngopi)\\b/i,
  /\\b(nonton|main game|scrolling|tiktok|yt|youtube)\\b/i,
  /\\b(jadwal kalender|jadwalnya|hari ini|besok senin|besok selasa|besok rabu|besok kamis|besok jumat|besok sabtu|besok minggu)\\b/i,
];

// ── 3. Syarat Domain Substantif (Significant Goal Requirement) ───
// Niat yang layak disimpan untuk 14 hari wajib menyentuh salah satu domain nyata ini:
const SUBSTANTIVE_DOMAIN_REGEX = /\\b(beasiswa|skripsi|tesis|makalah|penelitian|riset|jurnal|kuliah|matkul|dosen|kampus|ugm|sastra arab|pkm|lomba|mun|model un|toefl|ielts|magang|internship|kerja|lamar|apply|lowongan|portofolio|cv|kemenlu|diplomat|organisasi|komunitas|kepanitiaan|motor|mobil|laptop|pc|komputer|hp|ipad|tablet|kamera|nabung|menabung|investasi|tabungan|buka rekening|kartu debit|kartu kredit|oracle cloud|vps|server baru|proyek|project|aplikasi|website|web|fitur|periksa ke dokter|ke rumah sakit|ke klinik|spesialis|cek darah|terapi|gym|fitness|olahraga rutin|diet)\\b/i;

// Pola struktur niat
const INTENTION_PATTERNS = [
  /\\b(aku|saya|gue|kami)\\s+(akan|mau|bakal|berencana|hendak|ingin)\\s+(?:mulai\\s+)?([a-zA-ZÀ-ÿ0-9][a-zA-ZÀ-ÿ0-9\\s]{4,60})/i,
  /\\brencana(?:ku|saya|nya)?\\s+(?:mau\\s+|akan\\s+)?([a-zA-ZÀ-ÿ0-9][a-zA-ZÀ-ÿ0-9\\s]{4,60})/i,
  /\\b(pengen|pingin|niat(?:nya)?)\\s+(?:mulai\\s+|nanti\\s+)?([a-zA-ZÀ-ÿ0-9][a-zA-ZÀ-ÿ0-9\\s]{4,60})/i,
];

// ── 4. Pola Keputusan Penting ───────────────────────────────────
const DECISION_PATTERNS = [
  /\\b(memutuskan|sudah memutuskan|udah mutusin|akhirnya fix|keputusan final)\\s+(?:untuk\\s+)?([a-zA-ZÀ-ÿ0-9][a-zA-ZÀ-ÿ0-9\\s]{5,60})/i,
  /\\b(ambil beasiswa|resign|keluar dari|pindah jurusan|daftar magang|beli motor|beli laptop|investasi)\\s+([a-zA-ZÀ-ÿ0-9][a-zA-ZÀ-ÿ0-9\\s]{3,50})/i,
];

const FINANCE_TRANSACTION_EXCLUSIONS = [
  /\\bcatat\\b/i,
  /\\bstruk\\b/i,
  /\\bnota\\b/i,
  /\\btransfer\\b/i,
  /\\blivin\\b/i,
  /^split\\b/i,
  /\\bgofood\\b|\\bshopee\\b|\\btokopedia\\b|\\bqris\\b/i,
  /\\bbensin\\b|\\bobat\\b|\\bmakanan\\b|\\bnescafe\\b|\\bpulsa\\b/i,
];

// ============================================================
// FUNGSI 1: Deteksi Intensi Substantif dari Teks
// ============================================================
function _detectIntention(rawText, routingData = {}) {
  const text = _cleanUserText(rawText);
  if (!text || text.length < 12) return null;

  // 1. Cek intent jika tersedia: jangan proses intent transaksi atau diagnosa
  const intent = String(routingData.intent || '').toUpperCase();
  if (['FINANCE', 'CALENDAR', 'TASK', 'DATABASE', 'DIAGNOSE_SYSTEM'].includes(intent)) {
    return null;
  }

  // 2. Filter kalimat tanya atau perintah ke N.E.X.A
  for (const exclusion of INTENTION_EXCLUSIONS) {
    if (exclusion.test(text)) return null;
  }

  // 3. Filter aktivitas rutin instan (makan, tidur, sholat, dll.)
  for (const eph of EPHEMERAL_EXCLUSIONS) {
    if (eph.test(text)) return null;
  }

  // 4. WAJIB memenuhi domain substantif
  if (!SUBSTANTIVE_DOMAIN_REGEX.test(text)) {
    return null;
  }

  // 5. Cocokkan pola niat
  for (const pattern of INTENTION_PATTERNS) {
    const match = text.match(pattern);
    if (match) {
      let intentionText = match[match.length - 1]?.trim() || '';

      // Bersihkan kata sambung/filler di awal
      intentionText = intentionText
        .replace(/^(?:kan|tapi|itu|ya|deng|oh iya|nah|jadi|sebenernya|aslinya|dulu)\\s+/i, '')
        .replace(/[.,!?;:]+$/, '')
        .trim();

      // Validasi panjang: minimal 2 kata dan >= 8 karakter
      const wordCount = intentionText.split(/\\s+/).length;
      if (wordCount >= 2 && intentionText.length >= 8) {
        return intentionText.charAt(0).toUpperCase() + intentionText.slice(1);
      }
    }
  }

  return null;
}

/**
 * Mendeteksi dan menyimpan intensi substantif dari pesan user.
 */
async function detectAndSaveIntention(rawText, routingData = {}) {
  const sb = _getSupabase();
  if (!sb || !rawText) return false;

  const intentionText = _detectIntention(rawText, routingData);
  if (!intentionText) return false;

  const deadlineAt = new Date(Date.now() + INTENTION_DEADLINE_DAYS * 24 * 60 * 60 * 1000).toISOString();

  try {
    // Dedup 7 hari terakhir
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { data: existing } = await sb
      .from('nexa_pending_intentions')
      .select('id, intention')
      .eq('status', 'ACTIVE')
      .gte('created_at', sevenDaysAgo)
      .limit(10);

    const isDuplicate = (existing || []).some(row => {
      const a = String(row.intention).toLowerCase().trim();
      const b = intentionText.toLowerCase().trim();
      return a.includes(b.substring(0, 15)) || b.includes(a.substring(0, 15));
    });

    if (isDuplicate) {
      console.log(\`[INTENTION] Skipped duplicate intention: "\${intentionText}"\`);
      return false;
    }

    const { error } = await sb
      .from('nexa_pending_intentions')
      .insert([{
        intention:   intentionText,
        source_text: _cleanUserText(rawText).substring(0, 500),
        status:      'ACTIVE',
        deadline_at: deadlineAt,
        created_at:  new Date().toISOString()
      }]);

    if (error) {
      console.warn('[INTENTION] Failed to save intention:', error.message);
      return false;
    }

    console.log(\`[INTENTION] 🎯 Saved substantive intention: "\${intentionText}" (due \${deadlineAt.substring(0, 10)})\`);
    return true;
  } catch (err) {
    console.warn('[INTENTION] Unexpected error saving intention:', err.message);
    return false;
  }
}

// ============================================================
// FUNGSI 2: Deteksi Keputusan Penting
// ============================================================
async function detectAndSaveDecision(rawText, routingData = {}, emotionalState = 'NEUTRAL') {
  const sb = _getSupabase();
  if (!sb || !rawText) return false;

  const text = _cleanUserText(rawText);
  if (!text || text.length < 15) return false;

  const intent = String(routingData.intent || 'NORMAL_CHAT').toUpperCase();
  if (!['DISCIPLINE', 'CALENDAR', 'ADVICE', 'NORMAL_CHAT'].includes(intent)) return false;

  for (const excludePattern of INTENTION_EXCLUSIONS) {
    if (excludePattern.test(text)) return false;
  }
  for (const excludePattern of FINANCE_TRANSACTION_EXCLUSIONS) {
    if (excludePattern.test(text)) return false;
  }

  let decisionText = null;
  for (const pattern of DECISION_PATTERNS) {
    const match = text.match(pattern);
    if (match) {
      decisionText = match[0]?.trim();
      break;
    }
  }

  if (!decisionText || decisionText.length < 12) return false;

  const outcomeCheckAt = new Date(Date.now() + DECISION_OUTCOME_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const now = new Date().toISOString();

  try {
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data: existing } = await sb
      .from('nexa_decision_journal')
      .select('id, decision')
      .gte('created_at', oneDayAgo)
      .limit(10);

    const isDuplicate = (existing || []).some(row => {
      return String(row.decision).toLowerCase().includes(decisionText.toLowerCase().substring(0, 20));
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

    console.log(\`[INTENTION] 📋 Saved decision: "\${decisionText}" (outcome due \${outcomeCheckAt.substring(0, 10)})\`);
    return true;
  } catch (err) {
    console.warn('[INTENTION] Unexpected error detecting decision:', err.message);
    return false;
  }
}

// ============================================================
// FUNGSI 3: Auto-Reconciliation (Closing the Cognitive Loop)
// ============================================================
/**
 * Memeriksa apakah pesan baru Tuan secara alami mengindikasikan bahwa
 * suatu niat aktif telah selesai/terwujud. Jika ya, ubah status jadi FULFILLED.
 */
async function autoReconcileIntentions(rawText) {
  const sb = _getSupabase();
  if (!sb || !rawText) return;

  const text = _cleanUserText(rawText).toLowerCase();
  if (text.length < 8) return;

  const completionRegex = /\\b(sudah|udah|tadi udah|alhamdulillah udah|selesai|beres|kelar|cair|keterima|lolos|kebeli|terwujud|lunas|jadi daftar|berhasil daftar)\\b/i;
  if (!completionRegex.test(text)) return;

  try {
    const { data: activeIntentions } = await sb
      .from('nexa_pending_intentions')
      .select('id, intention')
      .eq('status', 'ACTIVE')
      .limit(10);

    if (!activeIntentions || activeIntentions.length === 0) return;

    for (const item of activeIntentions) {
      const keywords = item.intention
        .toLowerCase()
        .split(/\\s+/)
        .filter(w => w.length >= 4 && !['akan', 'mau', 'ingin', 'bakal', 'rencananya'].includes(w));

      const matched = keywords.some(k => text.includes(k));
      if (matched) {
        await sb
          .from('nexa_pending_intentions')
          .update({
            status: 'FULFILLED',
            reconciled_at: new Date().toISOString()
          })
          .eq('id', item.id);

        console.log(\`[INTENTION] 🟢 Cognitive Loop Closed: "\${item.intention}" auto-reconciled as FULFILLED.\`);
        break;
      }
    }
  } catch (err) {
    console.warn('[INTENTION] Auto-reconcile error:', err.message);
  }
}

// ============================================================
// FUNGSI 4: Cron Pass — Gentle Follow-up (Rate Limit: MAX 1)
// ============================================================
async function runIntentionCheckPass() {
  console.log('[INTENTION] ── Starting Intention Check Pass (Strict Rate Limit: 1/day)...');
  const sb = _getSupabase();
  if (!sb) return { checked: 0, sent: 0, errors: 0 };

  const stats = { checked: 0, sent: 0, errors: 0 };
  const nowIso = new Date().toISOString();

  try {
    // Ambil HANYA 1 item terlama yang sudah melewati deadline
    const { data: expiredIntentions, error: fetchError } = await sb
      .from('nexa_pending_intentions')
      .select('*')
      .eq('status', 'ACTIVE')
      .lte('deadline_at', nowIso)
      .order('deadline_at', { ascending: true })
      .limit(MAX_INTENTIONS_PER_PASS);

    if (fetchError || !expiredIntentions || expiredIntentions.length === 0) {
      console.log('[INTENTION] No expired intentions to process today. Pass complete.');
      return stats;
    }

    let webhookModule;
    try { webhookModule = require('../interfaces/webhook'); } catch (_) {}

    const item = expiredIntentions[0];
    stats.checked++;

    try {
      const daysAgo = Math.round(
        (Date.now() - new Date(item.created_at).getTime()) / (1000 * 60 * 60 * 24)
      );

      // Susun pesan ramah, manusiawi, dan tanpa em-dash
      const frictionMsg = [
        \`🔁 <b>Kilas Balik Rencana</b>\`,
        \`\`,
        \`Sekitar \${daysAgo} hari lalu, Tuan sempat berencana:\`,
        \`<i>"\${item.intention}"</i>\`,
        \`\`,
        \`Bagaimana perkembangannya sekarang, Tuan? Apakah rencana ini masih berjalan atau sudah terwujud?\`
      ].join('\\n');

      if (webhookModule?.sendTelegramOutbound) {
        await webhookModule.sendTelegramOutbound(frictionMsg, true);
        stats.sent++;
        console.log(\`[INTENTION] Follow-up sent for: "\${item.intention}"\`);
      }

      await sb
        .from('nexa_pending_intentions')
        .update({ status: 'EXPIRED' })
        .eq('id', item.id);

    } catch (itemErr) {
      console.warn(\`[INTENTION] Error processing intention #\${item.id}:\`, itemErr.message);
      stats.errors++;
    }

    console.log(\`[INTENTION] ── Intention Pass Done: sent=\${stats.sent}\`);
    return stats;
  } catch (err) {
    console.error('[INTENTION] Critical error in Intention Pass:', err.message);
    return { ...stats, errors: stats.errors + 1 };
  }
}

// ============================================================
// FUNGSI 5: Cron Pass — Outcome Check untuk Keputusan
// ============================================================
async function runOutcomeCheckPass() {
  console.log('[INTENTION] ── Starting Outcome Check Pass (Strict Rate Limit: 1/day)...');
  const sb = _getSupabase();
  if (!sb) return { checked: 0, sent: 0, errors: 0 };

  const stats = { checked: 0, sent: 0, errors: 0 };
  const nowIso = new Date().toISOString();

  try {
    const { data: pendingOutcomes, error: fetchError } = await sb
      .from('nexa_decision_journal')
      .select('*')
      .is('outcome_result', null)
      .is('outcome_received_at', null)
      .lte('outcome_check_at', nowIso)
      .order('outcome_check_at', { ascending: true })
      .limit(MAX_OUTCOMES_PER_PASS);

    if (fetchError || !pendingOutcomes || pendingOutcomes.length === 0) {
      console.log('[INTENTION] No pending outcomes today. Pass complete.');
      return stats;
    }

    let webhookModule;
    try { webhookModule = require('../interfaces/webhook'); } catch (_) {}

    const item = pendingOutcomes[0];
    stats.checked++;

    try {
      const daysAgo = Math.round(
        (Date.now() - new Date(item.decision_time).getTime()) / (1000 * 60 * 60 * 24)
      );

      const outcomeMsg = [
        \`📋 <b>Catatan Keputusan</b>\`,
        \`\`,
        \`Sekitar \${daysAgo} hari lalu, Tuan sempat memutuskan:\`,
        \`<i>"\${item.decision}"</i>\`,
        \`\`,
        \`Apakah keputusan tersebut sudah terasa hasilnya, Tuan? Satu kalimat singkat pun sudah cukup untuk catatan kita.\`
      ].join('\\n');

      if (webhookModule?.sendTelegramOutbound) {
        await webhookModule.sendTelegramOutbound(outcomeMsg, true);
        stats.sent++;
        console.log(\`[INTENTION] Outcome check sent for: "\${item.decision}"\`);
      }

      await sb
        .from('nexa_decision_journal')
        .update({ outcome_received_at: new Date().toISOString() })
        .eq('id', item.id);

    } catch (itemErr) {
      console.warn(\`[INTENTION] Error processing decision #\${item.id}:\`, itemErr.message);
      stats.errors++;
    }

    return stats;
  } catch (err) {
    console.error('[INTENTION] Critical error in Outcome Pass:', err.message);
    return { ...stats, errors: stats.errors + 1 };
  }
}

// ============================================================
// EXPORTS
// ============================================================
module.exports = {
  detectAndSaveIntention,
  detectAndSaveDecision,
  autoReconcileIntentions,
  runIntentionCheckPass,
  runOutcomeCheckPass,

  // Helpers for testing
  _detectIntention,
  _cleanUserText,
};
`;

fs.writeFileSync(path.join(__dirname, '../src/domain/Intention_Engine.js'), code, 'utf8');
console.log('✅ Successfully rewritten Intention_Engine.js');
