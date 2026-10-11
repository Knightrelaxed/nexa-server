/**
 * ============================================================
 * [N.E.X.A v3.3] ASYNCHRONOUS MICRO-REVIEWER — Micro_Reviewer.js
 * ============================================================
 * Adaptasi Background Review Engine Hermes Agent (background_review.py)
 *
 * TUGAS UTAMA:
 *   1. Menganalisis event koreksi di nexa_learning_events yang belum diproses.
 *   2. Memperbarui aturan kerja (nexa_playbooks) secara otomatis (closed learning loop).
 *   3. Menegakkan 4 prinsip Hermes:
 *      - Single-Store Routing (1 fakta/aturan ke 1 playbook).
 *      - Read-Before-Write & Surgical JSON Patching.
 *      - "Do Not Save" Filter (abaikan error sementara/tugas sekali pakai).
 *      - Hard Character Cap (rendered <= 700 karakter).
 *   4. Tiga pemicu ekonomis:
 *      - Idle Trigger (15 menit tanpa aktivitas obrolan).
 *      - Nudge Counter (setiap 10 turn percakapan).
 *      - Daily Evening Pass (23:30 WIB cron).
 *   5. Hard Budget Guard: Maksimal 3 kali evaluasi LLM per 24 jam.
 *   6. Notifikasi Telegram proaktif + opsi rollback instant (/playbook undo).
 * ============================================================
 */

'use strict';

const supabaseMemories = require('../infrastructure/Supabase_Memories');
const playbookEngine = require('./Playbook_Engine');
const fallbackEngine = require('../core/Fallback_Engine');
const { notifyProactive } = require('../core/Notifier');

// ── KONSTANTA & BATASAN KEAMANAN ─────────────────────────────
const MAX_REVIEWS_PER_DAY = 3;
const IDLE_TIMEOUT_MS = 15 * 60 * 1000; // 15 menit
const NUDGE_TURN_THRESHOLD = 10;        // Tiap 10 turn
const MAX_RENDERED_CHARS = 700;

// ── STATE RUNTIME ─────────────────────────────────────────────
let _reviewsTodayCount = 0;
let _lastReviewDateKey = '';
let _hydratedDateKey = ''; // [v3.3.1] day for which the persisted counter was loaded
let _turnCounter = 0;
let _idleTimer = null;
let _isReviewing = false;
// [v3.3 POISON-PILL GUARD] Melacak percobaan gagal agar event error tidak memblokir antrean
const _failedEventAttempts = new Map();
const MAX_EVENT_ATTEMPTS = 3;

/**
 * Sanitasi entitas HTML untuk pesan Telegram
 */
function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Dapatkan tanggal hari ini di Asia/Jakarta (YYYY-MM-DD)
 */
function getTodayDateKeyWib() {
  const now = new Date();
  const jkt = new Date(now.getTime() + 7 * 60 * 60 * 1000);
  return jkt.toISOString().split('T')[0];
}

/**
 * Cek dan update kuota review harian
 */
function checkDailyBudget() {
  const todayKey = getTodayDateKeyWib();
  if (_lastReviewDateKey !== todayKey) {
    _lastReviewDateKey = todayKey;
    _reviewsTodayCount = 0;
  }
  return _reviewsTodayCount < MAX_REVIEWS_PER_DAY;
}

/**
 * [v3.3.1] Load the persisted daily counter once per day (and after every restart) so that a
 * PM2 restart or deploy cannot reset the cap. Retried on the next cycle if the read fails.
 */
async function hydrateDailyBudget() {
  const todayKey = getTodayDateKeyWib();
  if (_hydratedDateKey === todayKey) return;
  const persisted = await supabaseMemories.countMicroReviewRunsToday(todayKey);
  if (typeof persisted === 'number') {
    if (_lastReviewDateKey !== todayKey) {
      _lastReviewDateKey = todayKey;
      _reviewsTodayCount = 0;
    }
    _reviewsTodayCount = Math.max(_reviewsTodayCount, persisted);
    _hydratedDateKey = todayKey;
  }
}

/**
 * Bangun prompt evaluasi mikro Hermes
 */
function buildHermesReviewPrompt(playbook, events) {
  const systemInstruction = `Anda adalah Evaluator Memori Prosedural N.E.X.A (Adaptasi Hermes Closed Learning Loop).
Tugas Anda: Menganalisis catatan koreksi / sinyal dari Tuan Faqih terhadap Playbook aktif saat ini, lalu memutuskan apakah aturan eksekusi (Playbook) perlu diperbarui.

PRINSIP EVALUASI KETAT:
1. SINGLE-STORE ROUTING: Aturan hanya berlaku untuk kelas Playbook ini (${playbook.intent}). Jangan mencampuradukkan aturan antar kelas tugas.
2. READ-BEFORE-WRITE & SURGICAL PATCH: Jangan merombak seluruh aturan jika tidak perlu. Perbarui atau tambahkan poin yang dikoreksi secara minimalis.
3. DAFTAR JANGAN DISIMPAN ("DO NOT SAVE" LIST):
   - JANGAN simpan kegagalan jaringan atau error server sementara sebagai aturan.
   - JANGAN simpan instruksi sekali pakai (one-off ad-hoc tasks) sebagai kebiasaan permanen.
   - JANGAN simpan keluhan sesaat yang bukan preferensi format atau gaya komunikasi.
   - HANYA SIMPAN preferensi format, panjang respon, nada bicara, struktur, atau pantangan ("pitfalls") yang konsisten.
4. HARD CHARACTER CAP: Teks "rendered" WAJIB SANGAT PADAT dan TIDAK BOLEH lebih dari 700 karakter (maksimal ~150 token).

Keluarkan output HANYA dalam format JSON valid:
{
  "should_update": true,
  "reason": "Alasan singkat 1 kalimat mengapa aturan diubah",
  "patch": {
    "rules": {
      "length": "...",
      "format": ["..."],
      "tone": ["..."],
      "pitfalls": ["..."]
    },
    "rendered": "Panduan ringkas padat siap injeksi ke prompt (MAKS 700 KARAKTER)"
  }
}`;

  const eventsSummary = events.map((e, idx) => {
    return `${idx + 1}. [Tipe: ${e.event_type}] Sinyal: ${JSON.stringify(e.signal || {})}` +
      (e.user_turn_excerpt ? ` | Kutipan Tuan: "${e.user_turn_excerpt}"` : '');
  }).join('\n');

  const userPrompt = `[PLAYBOOK SAAT INI: ${playbook.intent} (v${playbook.version})]
Aturan saat ini:
${JSON.stringify(playbook.rules || {}, null, 2)}

Panduan Rendered saat ini:
"${playbook.rendered || ''}"

[EVENT KOREKSI TERBARU DARI TUAN FAQIH]
${eventsSummary}

Tentukan apakah Playbook perlu diperbarui, dan berikan JSON patch jika ya.`;

  return { systemInstruction, userPrompt };
}

/**
 * Panggil LLM via Fallback_Engine untuk evaluasi playbook
 */
async function callReviewLLM(playbook, events) {
  const { systemInstruction, userPrompt } = buildHermesReviewPrompt(playbook, events);

  try {
    const rawResult = await fallbackEngine.executeWithFallback(
      userPrompt,
      systemInstruction,
      0.2, // Low temperature for deterministic rules
      true, // JSON Mode
      { forceHeavy: false } // Prefer lightweight/fast model (Groq / Gemini Flash)
    );

    let parsed = null;
    if (typeof rawResult === 'object' && rawResult !== null) {
      parsed = rawResult;
    } else if (typeof rawResult === 'string') {
      const validJsonStr = fallbackEngine.validateResponseJson(rawResult, true);
      parsed = JSON.parse(validJsonStr);
    }

    if (!parsed || typeof parsed.should_update !== 'boolean') {
      return { success: false, should_update: false, reason: 'Output LLM tidak memenuhi skema valid.' };
    }

    return { success: true, ...parsed };
  } catch (err) {
    console.warn(`[MICRO-REVIEWER] LLM review call failed for ${playbook.intent}:`, err.message);
    return { success: false, should_update: false, reason: `Gagal memanggil model evaluasi: ${err.message}` };
  }
}

/**
 * Eksekusi siklus Micro-Review
 * @param {string} triggerReason - IDLE_TRIGGER | NUDGE_TRIGGER | CRON_DAILY | MANUAL
 */
async function runMicroReview(triggerReason = 'MANUAL') {
  if (_isReviewing) {
    console.log(`[MICRO-REVIEWER] Sesi review sedang berjalan. Melewati pemicu ${triggerReason}.`);
    return { reviewed: false, reason: 'ALREADY_RUNNING' };
  }

  // 1. Periksa batas harian (maks 3 per hari)
  await hydrateDailyBudget();
  if (!checkDailyBudget()) {
    console.log(`[MICRO-REVIEWER] Batas harian (${MAX_REVIEWS_PER_DAY}/hari) tercapai. Melewati ${triggerReason}.`);
    return { reviewed: false, reason: 'DAILY_BUDGET_EXCEEDED' };
  }

  _isReviewing = true;
  try {
    // 2. Ambil event pembelajaran yang belum diproses
    const rawEvents = await supabaseMemories.getUnprocessedLearningEvents(30);
    if (!rawEvents || rawEvents.length === 0) {
      return { reviewed: false, reason: 'NO_UNPROCESSED_EVENTS' };
    }

    // 3. Filter event yang berbobot (koreksi, rephrase, override, explicit remember, over-citation)
    const ACTIONABLE_TYPES = ['CORRECTION', 'REPHRASE', 'OVERRIDE', 'EXPLICIT_REMEMBER', 'OVER_CITATION'];
    const actionableEvents = rawEvents.filter(e => ACTIONABLE_TYPES.includes(e.event_type));

    // Jika semua event hanya pasif (misal: ACCEPT atau IGNORED tanpa koreksi), tandai selesai
    if (actionableEvents.length === 0) {
      const allIds = rawEvents.map(e => e.id);
      await supabaseMemories.markLearningEventsProcessed(allIds);
      return { reviewed: false, reason: 'NO_ACTIONABLE_EVENTS_MARKED_PROCESSED', processedCount: allIds.length };
    }

    // 4. Kelompokkan event berdasarkan target intent
    const eventsByIntent = new Map();
    for (const ev of actionableEvents) {
      let targetIntent = null;
      if (ev.injected_refs && ev.injected_refs.playbook) {
        // e.g. "EMAIL_DRAFT@1" -> "EMAIL_DRAFT"
        targetIntent = String(ev.injected_refs.playbook).split('@')[0];
      }
      if (!targetIntent) {
        targetIntent = playbookEngine.resolvePlaybookIntent(ev.intent || ev.topic);
      }
      targetIntent = playbookEngine.resolvePlaybookIntent(targetIntent);

      if (!eventsByIntent.has(targetIntent)) {
        eventsByIntent.set(targetIntent, []);
      }
      eventsByIntent.get(targetIntent).push(ev);
    }

    const updatedPlaybooks = [];
    const processedEventIds = [];
    let llmCallsAttempted = false;

    // 5. Evaluasi tiap kelompok intent
    for (const [intentClass, groupEvents] of eventsByIntent.entries()) {
      const currentPlaybook = await playbookEngine.getPlaybookForIntent(intentClass);
      if (!currentPlaybook) continue;

      const groupEventIds = groupEvents.map(e => e.id);

      // [v3.3 POISON-PILL FIX #1] Cek status PINNED SEBELUM memanggil LLM!
      // Playbook yang diproteksi Tuan Faqih (pinned: true) tidak boleh dimodifikasi otomatis.
      // Langsung tandai event selesai agar tidak membakar token dan tidak memblokir antrean.
      if (currentPlaybook.pinned) {
        console.log(`[MICRO-REVIEWER] 🔒 Playbook ${intentClass} berstatus PINNED. Modifikasi diabaikan dan ${groupEventIds.length} event ditandai selesai.`);
        await supabaseMemories.markLearningEventsProcessed(groupEventIds);
        processedEventIds.push(...groupEventIds);
        continue;
      }

      console.log(`[MICRO-REVIEWER] Meninjau playbook ${intentClass} (v${currentPlaybook.version}) dengan ${groupEvents.length} event...`);
      llmCallsAttempted = true;
      const reviewResult = await callReviewLLM(currentPlaybook, groupEvents);

      // JIKA PANGGILAN LLM GAGAL (karena error jaringan, 429, atau format invalid):
      // Lacak kegagalan via attempt guard. Jika gagal berulang kali (>= 3x), drop event agar tidak macet (Poison Pill).
      if (!reviewResult || reviewResult.success === false) {
        console.warn(`[MICRO-REVIEWER] ⚠️ Review LLM gagal untuk ${intentClass}: ${reviewResult?.reason || 'Unknown error'}.`);
        // [v3.3.1] Attempts are persisted on the event row; in-memory is only the fallback.
        const dbAttempts = await supabaseMemories.incrementLearningEventAttempts(groupEventIds);
        for (const evId of groupEventIds) {
          const attempts = (dbAttempts && dbAttempts[evId]) || ((_failedEventAttempts.get(evId) || 0) + 1);
          _failedEventAttempts.set(evId, attempts);
          if (attempts >= MAX_EVENT_ATTEMPTS) {
            console.warn(`[MICRO-REVIEWER] 🗑️ [POISON-PILL DROP] Event #${evId} gagal ${attempts}x berturut-turut. Ditandai selesai agar antrean tidak macet.`);
            await supabaseMemories.markLearningEventsProcessed([evId]);
            processedEventIds.push(evId);
            _failedEventAttempts.delete(evId);
          }
        }
        continue;
      }

      if (reviewResult.should_update && reviewResult.patch) {
        const patch = reviewResult.patch;
        let renderedText = String(patch.rendered || currentPlaybook.rendered).trim();

        // Enforce batas keras <= 700 karakter
        if (renderedText.length > MAX_RENDERED_CHARS) {
          renderedText = renderedText.substring(0, MAX_RENDERED_CHARS - 3) + '...';
        }

        const newVersionPayload = {
          intent: currentPlaybook.intent,
          version: (currentPlaybook.version || 1) + 1,
          status: 'ACTIVE',
          rules: patch.rules || currentPlaybook.rules || {},
          rendered: renderedText,
          evidence_event_ids: groupEventIds,
          parent_id: currentPlaybook.id || null,
          pinned: currentPlaybook.pinned || false,
          isReviewer: true
        };

        const upsertRes = await supabaseMemories.upsertPlaybook(newVersionPayload, true);
        if (upsertRes && upsertRes.success) {
          updatedPlaybooks.push({
            intent: currentPlaybook.intent,
            oldVersion: currentPlaybook.version,
            newVersion: newVersionPayload.version,
            reason: reviewResult.reason,
            rendered: renderedText
          });

          // Tandai event telah diproses dan bersihkan attempt tracker
          await supabaseMemories.markLearningEventsProcessed(groupEventIds);
          processedEventIds.push(...groupEventIds);
          for (const evId of groupEventIds) _failedEventAttempts.delete(evId);

          // Invalidate cache RAM Playbook Engine
          playbookEngine.invalidatePlaybooksCache();

          // Kirim notifikasi informatif ke Telegram
          try {
            const notifText =
              `💡 <b>N.E.X.A Closed Learning Loop</b>\n` +
              `Playbook <b>${escapeHtml(currentPlaybook.intent)}</b> diperbarui ke <b>v${newVersionPayload.version}</b>:\n` +
              `<i>\"${escapeHtml(renderedText)}\"</i>\n\n` +
              `<b>Alasan:</b> ${escapeHtml(reviewResult.reason || 'Koreksi gaya kerja Tuan Faqih')}\n` +
              `━━━━━━━━━━━━━━━━━━━━\n` +
              `💡 <i>Ketik <code>/playbook undo ${escapeHtml(currentPlaybook.intent)}</code> jika ingin membatalkan perubahan ini.</i>`;

            await notifyProactive({
              kind: 'learning',
              priority: 'P1',
              dedupeKey: `playbook_update:${currentPlaybook.intent}:v${newVersionPayload.version}`,
              text: notifText
            });
          } catch (notifErr) {
            console.warn('[MICRO-REVIEWER] Gagal mengirim notifikasi Telegram:', notifErr.message);
          }
        } else {
          console.warn(`[MICRO-REVIEWER] Upsert playbook ditolak atau gagal untuk ${intentClass}:`, upsertRes?.error);
          // Tandai event selesai agar tidak terjadi pengulangan tak berujung
          await supabaseMemories.markLearningEventsProcessed(groupEventIds);
          processedEventIds.push(...groupEventIds);
          for (const evId of groupEventIds) _failedEventAttempts.delete(evId);
        }
      } else {
        // LLM sukses dievaluasi dan memutuskan tidak ada perubahan yang diperlukan
        await supabaseMemories.markLearningEventsProcessed(groupEventIds);
        processedEventIds.push(...groupEventIds);
        for (const evId of groupEventIds) _failedEventAttempts.delete(evId);
        console.log(`[MICRO-REVIEWER] Playbook ${intentClass} tidak memerlukan update. Alasan: ${reviewResult.reason}`);
      }
    }

    if (llmCallsAttempted) {
      _reviewsTodayCount++;
      supabaseMemories.recordMicroReviewRun(getTodayDateKeyWib()).catch(() => {});
    }
    console.log(`[MICRO-REVIEWER] Siklus review selesai (${triggerReason}). ${updatedPlaybooks.length} playbook diupdate, kuota hari ini: ${_reviewsTodayCount}/${MAX_REVIEWS_PER_DAY}.`);

    return {
      reviewed: true,
      triggerReason,
      updatedPlaybooks,
      processedEventsCount: processedEventIds.length,
      reviewsToday: _reviewsTodayCount
    };
  } catch (err) {
    console.error('[MICRO-REVIEWER] Unhandled error during micro-review:', err.message);
    return { reviewed: false, error: err.message };
  } finally {
    _isReviewing = false;
  }
}

/**
 * Hook post-turn untuk mencatat turn counter & me-reset timer idle
 * @param {object} params
 */
function handlePostTurn(params = {}) {
  _turnCounter++;

  // 1. Evaluasi Nudge Counter (setiap 10 turn)
  if (_turnCounter >= NUDGE_TURN_THRESHOLD) {
    _turnCounter = 0;
    setImmediate(() => {
      runMicroReview('NUDGE_TRIGGER').catch(err => {
        console.warn('[MICRO-REVIEWER] Nudge review error:', err.message);
      });
    });
  }

  // 2. Reset Idle Timer (15 menit tanpa aktivitas)
  if (_idleTimer) {
    clearTimeout(_idleTimer);
  }

  _idleTimer = setTimeout(() => {
    console.log('[MICRO-REVIEWER] Idle timeout 15 menit tercapai. Memeriksa event koreksi pending...');
    runMicroReview('IDLE_TRIGGER').catch(err => {
      console.warn('[MICRO-REVIEWER] Idle review error:', err.message);
    });
  }, IDLE_TIMEOUT_MS);

  // Jangan tahan event loop Node.js jika process ingin exit (misal saat running test)
  if (_idleTimer && typeof _idleTimer.unref === 'function') {
    _idleTimer.unref();
  }
}

/**
 * Reset runtime state untuk testing
 */
function resetReviewerState() {
  _reviewsTodayCount = 0;
  _lastReviewDateKey = '';
  _hydratedDateKey = '';
  _turnCounter = 0;
  if (_idleTimer) {
    clearTimeout(_idleTimer);
    _idleTimer = null;
  }
  _isReviewing = false;
  _failedEventAttempts.clear();
}

/**
 * Inspeksi status runtime reviewer
 */
function getReviewerStatus() {
  return {
    reviewsTodayCount: _reviewsTodayCount,
    lastReviewDateKey: _lastReviewDateKey,
    turnCounter: _turnCounter,
    hasActiveIdleTimer: _idleTimer !== null,
    isReviewing: _isReviewing,
    maxReviewsPerDay: MAX_REVIEWS_PER_DAY
  };
}

module.exports = {
  runMicroReview,
  handlePostTurn,
  buildHermesReviewPrompt,
  callReviewLLM,
  resetReviewerState,
  getReviewerStatus,
  MAX_REVIEWS_PER_DAY,
  IDLE_TIMEOUT_MS,
  NUDGE_TURN_THRESHOLD,
  MAX_RENDERED_CHARS
};
