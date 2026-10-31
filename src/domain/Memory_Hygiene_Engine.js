/**
 * ============================================================
 * [PHASE 9 & v3.4.4] MEMORY HYGIENE ENGINE — Memory_Hygiene_Engine.js
 * ============================================================
 * Autonomous Living Memory Maintenance System
 *
 * Taksonomi 5 Tingkat: CORE, PHASE, PREFERENCE, RULE, EPHEMERAL
 *
 * TUGAS UTAMA:
 *   Menjalankan pipeline pembersihan memori mingguan (Minggu 02:00 WIB)
 *   untuk memastikan nexa_user_profile dan nexa_core_identity selalu:
 *   - Bebas dari fakta sementara yang kadaluarsa (EPHEMERAL dan timed RULE)
 *   - Memantau peluruhan memori musiman/fase hidup (PHASE) sesuai valid_days
 *   - Memantau pergeseran preferensi (PREFERENCE) dengan rumus peluruhan Ebbinghaus
 *   - Menjaga CORE kebal dari peluruhan waktu
 *   - Bebas dari kontradiksi yang terakumulasi tanpa terdeteksi
 *
 * PIPELINE 5 STEP:
 *   Step 1 — runEphemeralSweep()          -> Pure JS, hard expiry EPHEMERAL & timed RULE
 *   Step 2 — runDecayScoreUpdate()         -> Pure JS, Ebbinghaus R = e^(-lambda * t)
 *   Step 3 — runContradictionBatchAudit()  -> 1 AI call (Gemini 3.6 Flash)
 *   Step 4 — reportStagedForPruning()      -> Kirim laporan Telegram + inline buttons
 *   Step 5 — Log Summary                   -> Console & ringkasan
 *
 * DIPANGGIL DARI:
 *   - cron.js: setiap Minggu pukul 02:00 WIB
 * ============================================================
 */

'use strict';

const { createClient } = require('@supabase/supabase-js');
const env = require('../config/env');
const { executeWithFallback } = require('../core/Fallback_Engine');

// Lazy Supabase client
let _supabase = null;
function _getSupabase() {
  if (_supabase) return _supabase;
  if (!env.SUPABASE_URL || !env.SUPABASE_KEY) return null;
  _supabase = createClient(env.SUPABASE_URL, env.SUPABASE_KEY);
  return _supabase;
}

// Laju peluruhan Ebbinghaus per kategori statis
// Catatan: CORE kebal peluruhan waktu. EPHEMERAL kedaluwarsa hard di Step 1.
// PHASE menggunakan lambda dinamis: lambda = -ln(0.60) / valid_days.
const DECAY_LAMBDA = {
  PREFERENCE: 0.010,
  RULE:       0.003,
};

const STAGED_THRESHOLD   = 0.60;
const ARCHIVED_THRESHOLD = 0.30;
const EPHEMERAL_MAX_DAYS = 30;
const EPHEMERAL_GRACE    = 1.5;
const EPHEMERAL_MIN_DAYS = 3;
const PHASE_DEFAULT_DAYS = 120;

// STEP 1 - Hard expiry untuk EPHEMERAL dan timed RULE
async function runEphemeralSweep() {
  const sb = _getSupabase();
  if (!sb) return { archived: 0 };
  console.log('[HYGIENE] Step 1 — Ephemeral Sweep starting...');
  let archived = 0;
  const now = Date.now();

  for (const table of ['nexa_user_profile', 'nexa_core_identity']) {
    const selectCols = table === 'nexa_user_profile'
      ? 'id, content, category_type, valid_days, last_reinforced_at'
      : 'id, content, category_type, last_reinforced_at';

    const { data, error } = await sb.from(table)
      .select(selectCols)
      .in('status', ['ACTIVE', 'STAGED_FOR_PRUNING'])
      .in('category_type', ['EPHEMERAL', 'RULE']);

    if (error || !data || data.length === 0) continue;

    const expiredIds = [];
    for (const r of data) {
      const lastReinforced = r.last_reinforced_at ? new Date(r.last_reinforced_at).getTime() : 0;
      const ageDays = (now - lastReinforced) / (1000 * 60 * 60 * 24);

      if (r.category_type === 'EPHEMERAL') {
        const ttl = r.valid_days
          ? Math.max(EPHEMERAL_MIN_DAYS, r.valid_days * EPHEMERAL_GRACE)
          : EPHEMERAL_MAX_DAYS;
        if (ageDays > ttl) expiredIds.push(r.id);
      } else if (r.category_type === 'RULE' && r.valid_days && ageDays > r.valid_days) {
        expiredIds.push(r.id);
      }
    }

    if (expiredIds.length > 0) {
      const { error: ae } = await sb.from(table).update({ status: 'ARCHIVED' }).in('id', expiredIds);
      if (!ae) {
        archived += expiredIds.length;
        console.log(`[HYGIENE] Step 1 Archived ${expiredIds.length} expired items in [${table}]`);
      }
    }
  }
  console.log(`[HYGIENE] Step 1 complete. Archived: ${archived}`);
  return { archived };
}

// STEP 2 - Ebbinghaus Decay untuk PHASE, PREFERENCE, dan untimed RULE
// CORE kebal terhadap peluruhan waktu. EPHEMERAL ditangani di Step 1.
async function runDecayScoreUpdate() {
  const sb = _getSupabase();
  if (!sb) return { staged: 0, autoArchived: 0 };
  console.log('[HYGIENE] Step 2 — Decay Score Update starting...');
  let staged = 0, autoArchived = 0;
  const now = Date.now();

  for (const table of ['nexa_user_profile', 'nexa_core_identity']) {
    const selectCols = table === 'nexa_user_profile'
      ? 'id, content, category_type, valid_days, last_reinforced_at, status'
      : 'id, content, category_type, last_reinforced_at, status';

    const { data, error } = await sb.from(table).select(selectCols)
      .in('status', ['ACTIVE', 'STAGED_FOR_PRUNING'])
      .in('category_type', ['PHASE', 'PREFERENCE', 'RULE']);

    if (error || !data) continue;

    for (const row of data) {
      if (row.category_type === 'RULE' && row.valid_days) continue;

      let lambda;
      if (row.category_type === 'PHASE') {
        const vd = row.valid_days > 0 ? row.valid_days : PHASE_DEFAULT_DAYS;
        lambda = -Math.log(STAGED_THRESHOLD) / vd;
      } else {
        lambda = DECAY_LAMBDA[row.category_type] || DECAY_LAMBDA.PREFERENCE;
      }

      if (!(lambda > 0)) continue;

      const lastReinforced = row.last_reinforced_at ? new Date(row.last_reinforced_at).getTime() : 0;
      const daysSince = (now - lastReinforced) / (1000 * 60 * 60 * 24);
      const confidence = Math.exp(-lambda * daysSince);

      if (confidence < ARCHIVED_THRESHOLD) {
        await sb.from(table).update({ status: 'ARCHIVED' }).eq('id', row.id);
        autoArchived++;
        console.log(`[HYGIENE] Step 2 Auto-archived (conf=${confidence.toFixed(2)}) ID:${row.id} "${String(row.content).substring(0, 50)}"`);
      } else if (confidence < STAGED_THRESHOLD && row.status === 'ACTIVE') {
        await sb.from(table).update({ status: 'STAGED_FOR_PRUNING' }).eq('id', row.id);
        staged++;
        console.log(`[HYGIENE] Step 2 Staged (conf=${confidence.toFixed(2)}) ID:${row.id} "${String(row.content).substring(0, 50)}"`);
      }
    }
  }
  console.log(`[HYGIENE] Step 2 complete. Staged: ${staged} | Auto-archived: ${autoArchived}`);
  return { staged, autoArchived };
}

// STEP 3 - Contradiction & Redundancy Batch Audit
async function runContradictionBatchAudit() {
  const sb = _getSupabase();
  if (!sb) return { merged: 0, errors: 0 };
  console.log('[HYGIENE] Step 3 — Contradiction Batch Audit starting...');
  let merged = 0, errors = 0;
  for (const table of ['nexa_user_profile', 'nexa_core_identity']) {
    const { data: facts, error } = await sb.from(table).select('id, content, category_type')
      .eq('status', 'ACTIVE').order('created_at', { ascending: true });
    if (error || !facts || facts.length < 2) continue;
    const factsStr = facts.map(f => `[ID:${f.id}|${f.category_type}] ${f.content}`).join('\n');
    const systemPrompt = `You are the Master Memory Auditor for N.E.X.A.
Your critical task is to analyze ACTIVE personal facts and identify:
1. CONTRADICTIONS: Two or more facts that directly oppose each other.
2. REDUNDANCIES: Facts that mean the exact same thing or overlap heavily.

RULES:
- Return ONLY a valid JSON array of objects. Absolutely NO markdown or backticks (\`\`\`).
- If no contradictions or redundancies are found, return exactly: []
- For each group of conflicting/redundant facts, provide a SINGLE comprehensively merged resolution sentence that preserves all important details.
- Ensure the new merged_fact is written from the perspective of an AI describing the user (e.g. "Tuan Faqih suka...").

JSON FORMAT:
[
  {
    "archive_ids": [12, 45],
    "merged_fact": "The perfect, updated single sentence that replaces them.",
    "category_type": "PREFERENCE"
  }
]`;
    const userPrompt = `=== ACTIVE MEMORY FACTS (${table}) ===\n${factsStr}\n\nExecute audit and return JSON array.`;
    try {
      const rawResult = await executeWithFallback(userPrompt, systemPrompt, 0.15, true, { forceHeavy: true });
      let cleanStr = String(rawResult || '').replace(/```json/gi, '').replace(/```/g, '').trim();
      const fb = cleanStr.indexOf('['), lb = cleanStr.lastIndexOf(']');
      if (fb === -1 || lb <= fb) { console.log(`[HYGIENE] Step 3 ${table}: No contradictions.`); continue; }
      const pairs = JSON.parse(cleanStr.substring(fb, lb + 1));
      if (!Array.isArray(pairs) || pairs.length === 0) { console.log(`[HYGIENE] Step 3 ${table}: Clean.`); continue; }
      for (const pair of pairs) {
        try {
          const idsToArchive = Array.isArray(pair.archive_ids) ? pair.archive_ids : [];
          const mergedFact = String(pair.merged_fact || '').trim();
          const catType = pair.category_type || 'PREFERENCE';
          if (!mergedFact || idsToArchive.length === 0) continue;
          for (const archiveId of idsToArchive) {
            await sb.from(table).update({ status: 'ARCHIVED' }).eq('id', archiveId);
            console.log(`[HYGIENE] Step 3 Archived conflicting ID:${archiveId} in ${table}`);
          }
          await sb.from(table).insert([{ content: mergedFact, category_type: catType, last_reinforced_at: new Date().toISOString(), evidence_count: idsToArchive.length, status: 'ACTIVE' }]);
          merged++;
          console.log(`[HYGIENE] Step 3 Merged: "${mergedFact.substring(0, 60)}"`);
        } catch (pe) { console.warn('[HYGIENE] Step 3 pair error:', pe.message); errors++; }
      }
    } catch (aiErr) { console.error(`[HYGIENE] Step 3 AI failed for ${table}:`, aiErr.message); errors++; }
  }
  console.log(`[HYGIENE] Step 3 complete. Merged: ${merged} | Errors: ${errors}`);
  return { merged, errors };
}

// STEP 4 - Review Report to Telegram
async function reportStagedForPruning(sendTelegramFn, stats = {}) {
  const sb = _getSupabase();
  if (!sb) return;
  console.log('[HYGIENE] Step 4 — Preparing Telegram Review Report...');
  const supabaseMem = require('../infrastructure/Supabase_Memories');
  const staged = await supabaseMem.getStagedForPruning();
  const totalStaged = (staged.userProfile?.length || 0) + (staged.coreIdentity?.length || 0);
  const totalAutoArchived = (stats.ephemeralArchived || 0) + (stats.decayAutoArchived || 0);
  const allStaged = [...(staged.userProfile || []).map(r => ({ ...r, table: 'USER_PROFILE' })), ...(staged.coreIdentity || []).map(r => ({ ...r, table: 'CORE_IDENTITY' }))];
  const now = Date.now();
  const stagedLines = allStaged.map((r, i) => {
    const daysSince = r.last_reinforced_at ? Math.round((now - new Date(r.last_reinforced_at).getTime()) / (1000 * 60 * 60 * 24)) : '?';
    return `${i + 1}. <i>"${String(r.content).substring(0, 80)}"</i>\n   Terakhir relevan: ${daysSince} hari lalu`;
  }).join('\n\n');
  let msg = `🧹 <b>Memory Hygiene N.E.X.A</b>\n\n`;
  if (totalAutoArchived > 0) msg += `📦 Diarsipkan otomatis: <b>${totalAutoArchived}</b> fakta kadaluarsa\n`;
  if (stats.merged > 0) msg += `🧩 Kontradiksi di-merge: <b>${stats.merged}</b> pasang\n`;
  if (msg.includes('📦') || msg.includes('🧩')) msg += '\n';
  if (totalStaged === 0) {
    msg += `✅ Tidak ada fakta yang perlu dikonfirmasi.\n\nMemori N.E.X.A <b>100% bersih</b> minggu ini!`;
    try { await sendTelegramFn(msg, true); } catch (_) {}
    return;
  }
  msg += `⚠️ <b>${totalStaged} Fakta Memudar — Perlu Konfirmasi Tuan:</b>\n<i>(Lama tidak dibicarakan, mungkin sudah tidak relevan)</i>\n\n${stagedLines}\n\n<i>Apakah fakta-fakta ini masih relevan?</i>`;
  const botToken = env.TELEGRAM_BOT_TOKEN?.trim();
  const chatId = env.TELEGRAM_CHAT_ID;
  if (!botToken || !chatId) { console.warn('[HYGIENE] Step 4: Telegram not configured.'); return; }
  try {
    const axios = require('axios');
    await axios.post(`https://api.telegram.org/bot${botToken}/sendMessage`, { chat_id: chatId, text: msg, parse_mode: 'HTML', reply_markup: { inline_keyboard: [[{ text: '✅ Arsipkan Semua', callback_data: 'HYGIENE_ARCHIVE_ALL' }, { text: '❌ Tahan Semua', callback_data: 'HYGIENE_HOLD_ALL' }], [{ text: '🔍 Pilih Manual', callback_data: 'HYGIENE_SELECT_MANUAL' }]] } });
    console.log('[HYGIENE] Step 4 Review card sent to Telegram.');
  } catch (err) { console.error('[HYGIENE] Step 4 Telegram error:', err.message); }
}

// ORCHESTRATOR
async function runFullHygienePipeline() {
  console.log('[HYGIENE] Memory Hygiene Pipeline starting...');
  const startTime = Date.now();
  const stats = { ephemeralArchived: 0, decayAutoArchived: 0, decayStaged: 0, merged: 0, errors: 0 };
  try { const s1 = await runEphemeralSweep(); stats.ephemeralArchived = s1.archived; } catch (e) { console.error('[HYGIENE] Step 1 failed:', e.message); }
  try { const s2 = await runDecayScoreUpdate(); stats.decayAutoArchived = s2.autoArchived; stats.decayStaged = s2.staged; } catch (e) { console.error('[HYGIENE] Step 2 failed:', e.message); }
  try { const s3 = await runContradictionBatchAudit(); stats.merged = s3.merged; stats.errors = s3.errors; } catch (e) { console.error('[HYGIENE] Step 3 failed:', e.message); }
  try { const { sendTelegramOutbound } = require('../interfaces/webhook'); await reportStagedForPruning(sendTelegramOutbound, stats); } catch (e) { console.error('[HYGIENE] Step 4 failed:', e.message); }
  try { const aiRouter = require('../core/AI_Router'); aiRouter.invalidatePersonalFactsCache(); } catch (_) {}
  const elapsed = Math.round((Date.now() - startTime) / 1000);
  console.log(`[HYGIENE] Pipeline complete in ${elapsed}s. Ephemeral:${stats.ephemeralArchived} | AutoArchived:${stats.decayAutoArchived} | Staged:${stats.decayStaged} | Merged:${stats.merged} | Errors:${stats.errors}`);
}

module.exports = {
  runFullHygienePipeline,
  runEphemeralSweep,
  runDecayScoreUpdate,
  runContradictionBatchAudit,
  reportStagedForPruning
};
