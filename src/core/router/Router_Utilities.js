/**
 * ============================================================
 * [N.E.X.A] router/Router_Utilities.js
 * Helper LLM satu-tugas (callAI, classifier) dan dedup fakta semantik
 *
 * Bagian dari modularisasi AI_Router.js (facade: ../AI_Router.js).
 * Kode dipindahkan verbatim oleh scripts/refactor/split_supabase_memories.js;
 * satu-satunya perubahan adalah jalur require relatif (+1 level).
 * ============================================================
 */

const { executeWithFallback } = require('../Fallback_Engine');
const supabaseMemories = require('../../infrastructure/Supabase_Memories');
const { loadPersonalFactsWithCache, invalidatePersonalFactsCache } = require('./Router_Cache');
const { _cleanEmDashes } = require('./Router_Output');
const { PLAIN_TEXT_SYSTEM_PROMPT } = require('./Router_Prompts');

async function callAI(prompt) {
  const result = await executeWithFallback(prompt, PLAIN_TEXT_SYSTEM_PROMPT, 0.5, false);
  let text = String(result).trim();
  // If the model wrapped its answer in JSON anyway, extract the first string value
  try {
    const parsed = JSON.parse(text);
    const firstVal = Object.values(parsed).find(v => typeof v === 'string');
    if (firstVal) text = firstVal;
  } catch (_) { /* Not JSON, already plain text — good */ }
  return _cleanEmDashes(text);
}

/**
 * Lightweight AI classifier for Finance Interceptor.
 * When there's a pending transaction waiting for user confirmation,
 * this determines the user's INTENT from their reply without regex.
 *
 * Returns one of:
 *   'CONFIRM'      — user wants to save/confirm the transaction
 *   'CANCEL'       — user wants to cancel/discard the transaction
 *   'DESCRIPTION'  — user is providing a new description or category for the transaction
 *   'AMBIGUOUS'    — unclear, ask for clarification
 *
 * @param {string} userText - The raw message from the user
 * @param {object} pendingTx - The pending transaction context { nominal, destination, type }
 * @returns {Promise<'CONFIRM'|'CANCEL'|'DESCRIPTION'|'AMBIGUOUS'>}
 */
async function classifyPendingTransactionIntent(userText, pendingTx = {}) {
  const txSummary = pendingTx.nominal && pendingTx.destination
    ? `Rp${pendingTx.nominal} ke/dari ${pendingTx.destination}`
    : '(transaksi tidak diketahui)';

  const systemPrompt = `Kamu adalah classifier dan parser niat yang sangat akurat.
User baru saja menerima notifikasi transaksi keuangan senilai ${txSummary} yang MENUNGGU KONFIRMASI.
User kemudian membalas dengan pesan singkat. Tugasmu: Tentukan NIAT user dan ekstrak data yang relevan.

Aturan Niat (intent):
- CONFIRM  → user ingin MENYIMPAN / mengkonfirmasi transaksi tersebut.
  Contoh: "ya", "oke", "masukkan", "masukan", "catat", "simpan", "lanjut", "gas", "done", "save", "acc"
- CANCEL   → user ingin MEMBATALKAN / menolak transaksi tersebut.
  Contoh: "batal", "jangan", "tidak", "ga", "gak", "hapus", "cancel", "skip"
- UPDATE   → user memberikan deskripsi, keterangan transaksi, tujuan pengeluaran, metode pembayaran, akun, atau kategori BARU untuk transaksi tersebut. JIKA user hanya merespons dengan kalimat atau frasa pendek (misal: "berangkat ke takom", "beli bensin", "buat bayar utang", "makan siang"), anggap itu sebagai UPDATE untuk diisi ke field "description"!
  Contoh: "untuk beli makan siang", "pake tunai", "bayar qris", "kategori makanan", "bank bca", "berangkat ke takom"
- AMBIGUOUS → sama sekali tidak jelas / tidak relevan.

PENTING: Balas HARUS dengan format JSON valid seperti berikut:
{
  "reasoning": "Tuliskan 1 kalimat analisis mengapa memilih intent ini.",
  "intent": "CONFIRM" | "CANCEL" | "UPDATE" | "AMBIGUOUS",
  "updates": {
    "description": "isi jika user memberi deskripsi/catatan/tujuan pengeluaran (contoh: 'beli rokok dua batang', 'berangkat ke takom')",
    "category": "isi jika user menyebut kategori",
    "payment_method": "isi jika user menyebut metode pembayaran (contoh: 'tunai', 'qris', 'transfer')",
    "account": "isi jika user menyebut nama bank/dompet (contoh: 'bank mandiri', 'bca', 'dana')"
  }
}
Biarkan field di dalam 'updates' bernilai null jika user tidak menyebutkannya.`;

  try {
    const result = await executeWithFallback(userText, systemPrompt, 0.1, true); // jsonMode=true
    let clean = String(result).replace(/```json/gi, '').replace(/```/g, '').trim();
    const parsed = JSON.parse(clean);

    if (!['CONFIRM', 'CANCEL', 'UPDATE', 'AMBIGUOUS'].includes(parsed.intent)) {
      parsed.intent = 'AMBIGUOUS';
    }
    return parsed;
  } catch (e) {
    console.error('[CLASSIFIER] classifyPendingTransactionIntent failed:', e.message);
    return { intent: 'AMBIGUOUS', updates: {} };
  }
}

/**
 * Lightweight AI binary classifier (YES / NO / AMBIGUOUS).
 * General-purpose: used for deletion confirmation, calendar conflict,
 * task category confirmation, and any other yes/no flow.
 *
 * @param {string} userText      - The raw reply from the user
 * @param {string} contextString - Plain-text description of what is being confirmed
 * @returns {Promise<'YES'|'NO'|'AMBIGUOUS'>}
 */
async function classifyYesNo(userText, contextString = '') {
  const systemPrompt = `Kamu adalah classifier niat biner yang sangat akurat.
Konteks: user baru saja menerima pertanyaan konfirmasi untuk: "${contextString}".
User membalas dengan teks berikut. Tugasmu: tentukan apakah user MENYETUJUI atau MENOLAK.

- YES      → user menyetujui / mengkonfirmasi / mau lanjut.
  Contoh afirmatif: "ya", "iya", "yap", "oke", "ok", "lanjut", "gas", "setuju", "hapus", "benar",
  "lakukan", "siap", "betul", "confirm", "acc", "yoi", "yes", "do it", "lanjutkan", dll.
- NO       → user menolak / membatalkan / tidak mau.
  Contoh negatif: "tidak", "jangan", "batal", "batalkan", "ga", "gak", "nggak", "cancel",
  "skip", "no", "ngga", "tolak", "stop", dll.
- AMBIGUOUS → tidak jelas, pertanyaan baru, atau tidak relevan dengan konfirmasi di atas.

BALAS HANYA dengan satu kata: YES, NO, atau AMBIGUOUS. Tanpa penjelasan apapun.`;

  try {
    const result = await executeWithFallback(userText, systemPrompt, 0.0, false); // jsonMode=false: classifiers return plain text, not JSON
    const clean = String(result).trim().toUpperCase().replace(/[^A-Z]/g, '');
    if (['YES', 'NO', 'AMBIGUOUS'].includes(clean)) return clean;
    console.warn(`[CLASSIFIER] classifyYesNo unexpected result: "${result}". Defaulting to AMBIGUOUS.`);
    return 'AMBIGUOUS';
  } catch (e) {
    console.error('[CLASSIFIER] classifyYesNo failed:', e.message);
    return 'AMBIGUOUS';
  }
}

// ── Mutex sederhana untuk mencegah race condition double-insert ──────────────
// Kunci per (type + newFact) agar dua call paralel tidak menyebabkan dua INSERT.
const _dedupInFlight = new Set();

/**
 * [PHASE 9] Supersede Engine v2 — Smart 4-Way Memory Deduplication
 *
 * Menggantikan sistem 2-way lama (NEW/DUPLICATE) dengan 4-way decision:
 *   NEW       → Fakta belum ada. INSERT dengan category_type hasil klasifikasi AI.
 *   REINFORCE → Fakta sudah ada & ditegaskan ulang. Naikkan evidence_count saja.
 *   SUPERSEDE → Fakta baru menggantikan yang lama. Soft-archive lama, INSERT baru.
 *   DUPLICATE → Makna sama persis. No-op (abaikan).
 *
 * Menghapus batasan slice(-40) — kini membaca SEMUA fakta aktif (Gemini 1M token).
 * Dilindungi oleh in-flight mutex untuk mencegah race condition double-insert.
 */
async function deduplicateAndSaveFact(newFact, type = 'USER_PROFILE') {
  const lockKey = `${type}::${newFact}`;
  if (_dedupInFlight.has(lockKey)) {
    console.log(`[SUPERSEDE] In-flight skip - ${newFact.substring(0, 60)}`);
    return false;
  }
  _dedupInFlight.add(lockKey);

  try {
    // [PHASE 9] Ambil SEMUA fakta aktif — bukan lagi slice(-40)
    const existingFacts = await supabaseMemories.getAllActiveMemories(type);

    // Kasus pertama: belum ada fakta sama sekali → langsung INSERT
    if (!existingFacts || existingFacts.length === 0) {
      const catType = await _classifyMemoryCategory(newFact);
      await supabaseMemories.saveMemoryWithMeta(newFact, catType, type);
      invalidatePersonalFactsCache();
      console.log(`[SUPERSEDE] FIRST FACT (${type}) saved [${catType}]: ${newFact.substring(0, 60)}`);
      return true;
    }

    // Susun prompt perbandingan dengan ID nyata dari database
    const factsStr = existingFacts
      .map(f => `[ID:${f.id}|${f.category_type || 'PREFERENCE'}] ${f.content}`)
      .join('\n');

    const prompt = `EXISTING FACTS IN MEMORY (${type}):\n${factsStr}\n\nNEW FACT: "${newFact}"\n\nTASK: Compare NEW FACT against ALL existing facts above. Apply these rules strictly:\n1. "REINFORCE [ID]" — If NEW FACT essentially means the same thing as an existing fact (even if worded differently). This reinforces the existing memory.\n2. "SUPERSEDE [ID]" — If NEW FACT CONTRADICTS, REVERSES, UPDATES, or REFINES an existing fact. Old fact should be replaced.\n3. "DUPLICATE" — If NEW FACT is identical in content and no meaningful new information.\n4. "NEW" — Only if NEW FACT introduces information genuinely absent from all existing facts.\n\nReply ONLY with one of:\n- NEW\n- REINFORCE [ID]\n- SUPERSEDE [ID]\n- DUPLICATE`;

    const result = await executeWithFallback(prompt, 'Reply strictly in the exact format shown. Do not add explanations.', 0.1, false);
    const decision = String(result || '').trim().toUpperCase();

    if (decision.startsWith('NEW')) {
      // INSERT fakta baru dengan kategori yang diklasifikasikan AI
      const catType = await _classifyMemoryCategory(newFact);
      await supabaseMemories.saveMemoryWithMeta(newFact, catType, type);
      invalidatePersonalFactsCache();
      console.log(`[SUPERSEDE] NEW (${type}) [${catType}]: ${newFact.substring(0, 60)}`);
      return true;

    } else if (decision.startsWith('REINFORCE')) {
      // Naikkan evidence_count + perbarui last_reinforced_at, tidak INSERT baru
      const match = decision.match(/REINFORCE\s*[\[\(:#]?\s*(\d+)/i);
      if (match) {
        const id = parseInt(match[1], 10);
        const reinforced = await supabaseMemories.reinforceMemoryById(id, type);
        if (reinforced) {
          console.log(`[SUPERSEDE] REINFORCE (${type}) ID:${id} — evidence naik.`);
          return false; // Tidak ada record baru, cache tidak perlu di-invalidate
        }
      }
      // Fallback jika ID tidak valid: simpan sebagai NEW
      console.warn(`[SUPERSEDE] REINFORCE id invalid, saving as NEW: ${newFact.substring(0, 60)}`);
      const catType = await _classifyMemoryCategory(newFact);
      await supabaseMemories.saveMemoryWithMeta(newFact, catType, type);
      invalidatePersonalFactsCache();
      return true;

    } else if (decision.startsWith('SUPERSEDE')) {
      // [PHASE 9] Soft-archive fakta lama, INSERT fakta baru
      const match = decision.match(/SUPERSEDE\s*[\[\(:#]?\s*(\d+)/i);
      if (match) {
        const id = parseInt(match[1], 10);
        const oldFact = existingFacts.find(f => f.id === id);

        // Arsipkan yang lama (bukan hard delete!)
        await supabaseMemories.archiveMemoryById(id, type);

        // INSERT fakta baru dengan kategori yang sesuai
        // Pertahankan category_type dari fakta lama jika ada, agar hierarki terjaga
        const catType = oldFact?.category_type || await _classifyMemoryCategory(newFact);
        await supabaseMemories.saveMemoryWithMeta(newFact, catType, type);
        invalidatePersonalFactsCache();
        console.log(`[SUPERSEDE] SUPERSEDED (${type}) ID:${id} → "${newFact.substring(0, 60)}" [${catType}]`);
        return true;
      }
      // Fallback: ID tidak valid → simpan sebagai NEW
      console.warn(`[SUPERSEDE] SUPERSEDE id invalid, saving as NEW: ${newFact.substring(0, 60)}`);
      const catType = await _classifyMemoryCategory(newFact);
      await supabaseMemories.saveMemoryWithMeta(newFact, catType, type);
      invalidatePersonalFactsCache();
      return true;

    } else {
      // DUPLICATE — abaikan sepenuhnya
      console.log(`[SUPERSEDE] DUPLICATE skip (${type}): ${newFact.substring(0, 60)}`);
      return false;
    }

  } catch (err) {
    console.error('[SUPERSEDE] deduplicateAndSaveFact error:', err.message);
    return false;
  } finally {
    _dedupInFlight.delete(lockKey);
  }
}

/**
 * [PHASE 9] Klasifikasi kategori fakta menggunakan AI.
 * Menentukan apakah fakta bersifat PERMANENT_FACT, PREFERENCE, EPHEMERAL, atau RULE.
 * Temperature 0.0 untuk hasil yang konsisten dan deterministik.
 *
 * @param {string} fact - Fakta yang akan diklasifikasikan
 * @returns {Promise<'PERMANENT_FACT'|'PREFERENCE'|'EPHEMERAL'|'RULE'>}
 */
async function _classifyMemoryCategory(fact) {
  const prompt = `Classify this personal fact into ONE category:\n\nFACT: "${fact}"\n\nCategories:\n- PERMANENT_FACT: Unchanging objective facts (birth date, blood type, allergies, religion, hometown)\n- PREFERENCE: Personal tastes and habits that may evolve over time (favorite food, preferred style, hobbies)\n- EPHEMERAL: Temporary states that will definitely change (current project, current illness, current mood, this week's focus)\n- RULE: Operational rules for how N.E.X.A should behave (response format rules, how to address the user, restrictions)\n\nReply ONLY with one word: PERMANENT_FACT, PREFERENCE, EPHEMERAL, or RULE`;

  try {
    const result = await executeWithFallback(prompt, 'Reply with exactly one word from the given options.', 0.0, false);
    const clean = String(result || '').trim().toUpperCase().replace(/[^A-Z_]/g, '');
    const VALID = new Set(['PERMANENT_FACT', 'PREFERENCE', 'EPHEMERAL', 'RULE']);
    return VALID.has(clean) ? clean : 'PREFERENCE';
  } catch (_) {
    return 'PREFERENCE'; // Default aman jika AI gagal
  }
}

/**
 * [PHASE 8] Deduplication engine untuk nexa_self_model.
 * Sebelum menyimpan fakta baru tentang N.E.X.A ke Self-Model, fungsi ini:
 *   1. Mengambil semua baris existing di layer yang sama.
 *   2. Meminta AI membandingkan: NEW / UPDATE [trait_key] / DUPLICATE.
 *   3. Jika UPDATE → update in-place via updateSelfModelTraitByKey.
 *   4. Jika NEW    → upsert baris baru dengan trait_key dari teks.
 *   5. Jika DUPLICATE → skip (tidak disimpan).
 *
 * @param {string} newFact - Fakta baru tentang N.E.X.A
 * @param {string} layer   - 'CAPABILITIES'|'LIMITATIONS'|'OPERATIONAL_RULES'|'CORRECTIONS'|'COMMUNICATION_STYLE'
 * @param {string} [source='PASSIVE_LEARNING']
 * @param {string} [inferredFrom='']
 * @returns {Promise<'inserted'|'updated'|'duplicate'|'error'>}
 */
async function deduplicateAndSaveSelfFact(newFact, layer, source = 'PASSIVE_LEARNING', inferredFrom = '') {
  if (!newFact || typeof newFact !== 'string' || newFact.trim().length < 5) return 'error';

  const lockKey = `SELF_MODEL::${layer}::${newFact}`;
  if (_dedupInFlight.has(lockKey)) {
    console.log(`[SELF-MODEL] Dedup: In-flight skip - ${newFact.substring(0, 60)}`);
    return 'duplicate';
  }
  _dedupInFlight.add(lockKey);

  try {
    const supabaseMem = require('../../infrastructure/Supabase_Memories');

    // Ambil semua baris di layer yang sama untuk dibandingkan
    const existing = await supabaseMem.getSelfModelByLayer(layer);

    // Jika belum ada baris → langsung insert
    if (!existing || existing.length === 0) {
      const newKey = newFact.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').substring(0, 50);
      const result = await supabaseMem.upsertSelfModelTrait(layer, newKey, newFact, source, inferredFrom);
      return result === 'error' ? 'error' : 'inserted';
    }

    // Bangun prompt untuk AI dedup check
    const existingList = existing.map((r, i) => `[${r.trait_key}] ${r.trait_value}`).join('\n');
    const prompt = `EXISTING SELF-KNOWLEDGE FACTS (layer: ${layer}):\n${existingList}\n\nNEW FACT: "${newFact}"\n\nTASK: Compare NEW FACT against EXISTING facts. Consider these reasons to UPDATE:\n1. NEW FACT is MORE DETAILED or more complete than an existing fact.\n2. NEW FACT CONTRADICTS or REVERSES an existing fact.\n3. NEW FACT represents a STATUS CHANGE of something recorded.\n4. NEW FACT is a CORRECTION or revision of a prior belief.\n\nReply ONLY with:\n- "NEW": Totally new, no related existing fact.\n- "UPDATE [trait_key]": Replace the fact with that exact trait_key (e.g. UPDATE avoid_bullet_format).\n- "DUPLICATE": Same meaning, skip it.`;

    const result = await executeWithFallback(prompt, 'Reply strictly in the requested format.', 0.1, false);
    const decision = String(result || '').trim();
    const decisionUp = decision.toUpperCase();

    if (decisionUp.startsWith('DUPLICATE')) {
      console.log(`[SELF-MODEL] Dedup: DUPLICATE skip - ${newFact.substring(0, 60)}`);
      return 'duplicate';
    } else if (decisionUp.startsWith('UPDATE')) {
      // Extract trait_key dari response (bisa uppercase atau lowercase)
      const keyMatch = decision.match(/UPDATE\s*[\[\(:#]?\s*([a-zA-Z0-9_]+)/i);
      if (keyMatch) {
        const oldKey = keyMatch[1].toLowerCase();
        const updated = await supabaseMem.updateSelfModelTraitByKey(oldKey, newFact, source);
        if (updated) {
          console.log(`[SELF-MODEL] Dedup: UPDATED [${oldKey}] → "${newFact.substring(0, 60)}"`);
          return 'updated';
        }
      }
      // Fallback: UPDATE gagal parse trait_key → insert sebagai baru
      console.warn(`[SELF-MODEL] Dedup: UPDATE key not found, inserting as NEW - ${newFact.substring(0, 60)}`);
      const newKey = newFact.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').substring(0, 50);
      await supabaseMem.upsertSelfModelTrait(layer, newKey, newFact, source, inferredFrom);
      return 'inserted';
    } else {
      // NEW
      const newKey = newFact.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').substring(0, 50);
      const r = await supabaseMem.upsertSelfModelTrait(layer, newKey, newFact, source, inferredFrom);
      console.log(`[SELF-MODEL] Dedup: NEW inserted - ${newFact.substring(0, 60)}`);
      return r === 'error' ? 'error' : 'inserted';
    }
  } catch (err) {
    console.error('[SELF-MODEL] deduplicateAndSaveSelfFact error:', err.message);
    return 'error';
  } finally {
    _dedupInFlight.delete(lockKey);
  }
}

/**
 * Analyzes the recent system logs for diagnostic purposes
 */
async function analyzeSystemLogs(userQuestion, logText) {
  const personalFacts = await loadPersonalFactsWithCache();

  // Tuan Faqih's Optimization: Smart Scoring Algorithm for absolute priority
  // Skip the 10 core personality facts (slice 10)
  const questionWords = userQuestion.toLowerCase().split(/\s+/).filter(w => w.length > 3);

  // Extract common error codes/keywords from the log to boost relevant facts
  const errorKeywords = ['503', '429', '401', '403', 'timeout', 'failed', 'error', 'exception', 'crash'];
  const logTextLower = logText.toLowerCase();
  const activeErrorKeywords = errorKeywords.filter(ek => logTextLower.includes(ek));

  const scoredIdentities = (personalFacts.coreIdentity || []).slice(10).map(fact => {
    let score = 0;
    const factLower = fact.toLowerCase();

    // 1. Log Prefix Matching (Score +100 - Absolute Priority)
    const match = fact.match(/\[([A-Z0-9_-]+)\]/);
    if (match && match[0] && logText.includes(match[0])) {
      score += 100;
    }

    // 2. Log Error Keyword Matching (Score +50)
    // e.g. If log contains "503", facts discussing "503" get boosted.
    activeErrorKeywords.forEach(ek => {
      if (factLower.includes(ek)) score += 50;
    });

    // 3. User Question Keyword Matching (Score +10 per word)
    questionWords.forEach(w => {
      if (factLower.includes(w)) score += 10;
    });

    return { fact, score };
  });

  // Filter out zero scores, sort descending by score, and take top 20
  const relevantIdentities = scoredIdentities
    .filter(item => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 20)
    .map(item => item.fact);

  const coreIdentityStr = relevantIdentities
    .map(fact => `- ${fact}`)
    .join('\n');

  const prompt = `You are a System Administrator for an AI assistant named N.E.X.A.
The user (Tuan Faqih) is asking about the current system status or recent logs.

[N.E.X.A CORE SYSTEM ARCHITECTURE & IDENTITY]
${coreIdentityStr || "No specific architecture context provided."}

Read the terminal log snippet below and provide a concise, relaxed analysis or answer (in Indonesian).
Explain technically but make it easy to understand what just happened behind the scenes, using your CORE SYSTEM ARCHITECTURE to contextualize the log events.

USER QUESTION: "${userQuestion}"

[LATEST SYSTEM LOGS]
${logText}

Rules:
1. Get straight to the point, maximum 3-4 sentences.
2. If there is an error, state the cause and whether it has been handled by the fallback system.
3. Never leak full API Keys/Tokens if they happen to be recorded in the logs.`;

  return await executeWithFallback(prompt, "Jawab dengan bahasa Indonesia santai namun teknis.", 0.3, false);
}

module.exports = {
  callAI,
  classifyPendingTransactionIntent,
  classifyYesNo,
  _dedupInFlight,
  deduplicateAndSaveFact,
  _classifyMemoryCategory,
  deduplicateAndSaveSelfFact,
  analyzeSystemLogs
};
