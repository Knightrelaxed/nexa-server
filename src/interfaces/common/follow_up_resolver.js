'use strict';
// ============================================================
// N.E.X.A — COMMON FOLLOW-UP RESOLVER
// Unified multi-turn conversation resolver shared across all
// ingress channels (Telegram, CLI, and future adapters).
//
// Previously split across:
//   - src/interfaces/telegram/email_helpers.js  (removed)
//   - src/interfaces/cli/follow_up_helpers.js   (removed)
//
// Responsibilities:
//   1. Detect ambiguous short-form follow-ups ("hapus itu", "lanjut")
//   2. Detect strong new-intent signals to break follow-up context
//   3. Detect email-history-specific follow-ups ("yang kemarin")
//   4. Detect generic continuations ("lagi", "berikutnya")
//   5. Resolve ambiguous follow-ups against previous context
//   6. Validate intent completeness & return clarification prompts
// ============================================================

/**
 * Returns true if the text is an ambiguous short-form follow-up
 * that needs context resolution (e.g. "hapus itu", "lanjut").
 * Superset of both Telegram and CLI patterns.
 */
function isAmbiguousFollowUp(text) {
  const norm = String(text || '').toLowerCase().trim();
  if (!norm) return false;

  // Generic continuation words
  if (/^(lanjut|lanjutkan|teruskan|next|berikutnya|ada lagi|cek lagi|lihat lagi)$/.test(norm)) return true;

  // Referential short phrases (CLI + Telegram combined)
  if (/^(yang tadi|yang itu|itu|itu aja|itu saja|sebelumnya|sebelum itu|lagi)$/.test(norm)) return true;

  // Action + referential object patterns
  if (/^(hapus|delete|selesai|selesaikan|complete|done|ubah|edit|update|ganti|batal|cancel)\s*(itu|ini|tadi|tersebut)?$/.test(norm)) return true;

  // Compound patterns: "hapus itu", "ubah itu", etc.
  if (/^(hapus|delete|ubah|edit|update|ganti)\s+(itu|yang itu|yang tadi)$/.test(norm)) return true;

  return false;
}

/**
 * Returns true if the text contains a strong, explicit domain keyword
 * indicating a new distinct intent — should NOT be treated as follow-up.
 * Superset of both Telegram and CLI detectors.
 */
function hasStrongNewIntentCue(text) {
  const norm = String(text || '').toLowerCase();
  if (!norm) return false;

  return /\b(email|gmail|database|supabase|kalender|agenda|jadwal|task|tugas|keuangan|pengeluaran|pemasukan|saldo|rekap|search|cari|berita|dokumen|2nd brain|profil|identitas|briefing|evaluasi|audit|buat|tambah|catat|ingatkan|jadwalkan|kirim)\b/.test(norm);
}

/**
 * Returns true if the text is specifically a request to continue reading
 * a previously-displayed email thread (e.g. "email sebelumnya").
 * Only relevant when pendingEmailContext is active.
 */
function isEmailHistoryFollowUp(text) {
  const norm = String(text || '').toLowerCase().trim();
  if (!norm) return false;
  return /sebelumnya|email sebelumnya|sebelum itu|yang kemarin|sebelum tanggal/.test(norm);
}

/**
 * Returns true if the text is a generic "show me more" continuation
 * without a specific domain signal (e.g. "lagi", "lanjut").
 */
function isGenericContinuation(text) {
  const norm = String(text || '').toLowerCase().trim();
  if (!norm) return false;
  return /^(lagi|lanjut|berikutnya|next|ada lagi|cek lagi|lihat lagi|yang lain)$/.test(norm);
}

/**
 * Resolves an ambiguous follow-up input against the previous conversation context.
 * Returns synthetic routingData if successfully resolved, or null if not resolvable.
 *
 * @param {string} textInput - The raw user input
 * @param {object} conversationContext - Previous turn's context { intent, askedAt, extractedData, lastUserText }
 * @returns {object|null} routingData or null
 */
function resolveFollowUp(textInput, conversationContext) {
  if (!conversationContext || !conversationContext.intent) return null;
  if (!isAmbiguousFollowUp(textInput) || hasStrongNewIntentCue(textInput)) return null;

  const ctxAgeMs = Date.now() - (conversationContext.askedAt || 0);
  if (ctxAgeMs >= 10 * 60 * 1000) return null; // context expired after 10 minutes

  const norm = textInput.toLowerCase().trim();
  const ctx = conversationContext;

  // Extract keyword from previous context for reuse
  const fbKw = ctx.extractedData?.search_keyword
    || ctx.extractedData?.summary
    || ctx.extractedData?.title
    || ctx.extractedData?.destination
    || ctx.extractedData?.query
    || '';

  // Strip action verbs to isolate any object keyword the user may have specified
  const inputKw = norm
    .replace(/^(hapus|delete|ubah|edit|update|ganti|selesaikan|complete)\s*/g, '')
    .replace(/^(itu|yang itu|yang tadi)\s*/g, '')
    .trim();

  const mergedKw = inputKw || fbKw;

  let result = null;

  if (ctx.intent === 'FINANCE') {
    if (/(hapus|delete)/.test(norm)) {
      result = { intent: 'FINANCE', extracted_data: { action: 'DELETE', search_keyword: mergedKw }, reply_message: '', god_mode_trigger: false };
    } else if (/(ubah|edit|update|ganti)/.test(norm)) {
      result = { intent: 'FINANCE', extracted_data: { action: 'EDIT', search_keyword: mergedKw }, reply_message: '', god_mode_trigger: false };
    } else {
      result = { intent: 'FINANCE', extracted_data: { action: 'READ_LATEST' }, reply_message: '', god_mode_trigger: false };
    }
  } else if (ctx.intent === 'TASK') {
    if (/(hapus|delete)/.test(norm)) {
      result = { intent: 'TASK', extracted_data: { action: 'DELETE', search_keyword: mergedKw }, reply_message: '', god_mode_trigger: false };
    } else if (/(selesai|selesaikan|complete|done)/.test(norm)) {
      result = { intent: 'TASK', extracted_data: { action: 'COMPLETE', search_keyword: mergedKw }, reply_message: '', god_mode_trigger: false };
    } else if (/(ubah|edit|update|ganti)/.test(norm)) {
      result = { intent: 'TASK', extracted_data: { action: 'EDIT', search_keyword: mergedKw }, reply_message: '', god_mode_trigger: false };
    } else {
      result = { intent: 'TASK', extracted_data: { action: 'READ' }, reply_message: '', god_mode_trigger: false };
    }
  } else if (ctx.intent === 'CALENDAR') {
    if (/(hapus|delete)/.test(norm)) {
      result = { intent: 'CALENDAR', extracted_data: { action: 'DELETE', event_id: 'latest', summary: mergedKw }, reply_message: '', god_mode_trigger: false };
    } else if (/(ubah|edit|update|ganti)/.test(norm)) {
      result = { intent: 'CALENDAR', extracted_data: { action: 'UPDATE', event_id: 'latest', summary: mergedKw }, reply_message: '', god_mode_trigger: false };
    } else {
      result = { intent: 'CALENDAR', extracted_data: { action: 'READ' }, reply_message: '', god_mode_trigger: false };
    }
  } else if (['2ND_BRAIN', 'USER_PROFILE', 'CORE_IDENTITY'].includes(ctx.intent)) {
    if (/(hapus|delete)/.test(norm)) {
      result = { intent: ctx.intent, extracted_data: { action: 'DELETE', search_keyword: mergedKw }, reply_message: '', god_mode_trigger: false };
    }
  } else if (ctx.intent === 'WEB_SEARCH') {
    result = {
      intent: 'WEB_SEARCH',
      extracted_data: { query: ctx.extractedData?.query || ctx.lastUserText || '', type: ctx.extractedData?.type || 'search', continuation: true },
      reply_message: '',
      god_mode_trigger: false
    };
  }

  if (result) {
    console.log(`[FOLLOW-UP] Ambiguous follow-up resolved: "${textInput}" → ${result.intent} (${result.extracted_data?.action || 'continuation'})`);
  }

  return result;
}

/**
 * Validates that the routing intent has sufficient data to execute.
 * Returns a clarification prompt string if incomplete, or null if ready.
 * Superset of both Telegram and CLI validation rules.
 *
 * @param {object} routingData
 * @param {string} textInput
 * @returns {string|null}
 */
function getClarificationMessage(routingData, textInput) {
  if (!routingData || !routingData.intent) return null;
  const data = routingData.extracted_data || {};
  const it = String(routingData.intent || '').toUpperCase();

  if (it === 'INCOMPLETE_INFO') {
    return routingData.reply_message || '❓ Instruksi belum lengkap, Tuan. Mohon tambahkan detailnya.';
  }

  if (it === 'FINANCE') {
    if (data.action === 'RECORD' && (isNaN(parseFloat(data.nominal)) || parseFloat(data.nominal) <= 0)) {
      return '❓ Nominal transaksi belum valid. Mohon sebutkan angka positifnya, Tuan.';
    }
    if (data.action === 'DELETE' && !data.search_keyword && !data.nominal) {
      return '❓ Transaksi mana yang ingin dihapus? Mohon sebutkan nominal atau nama merchant-nya.';
    }
  }

  if (it === 'CALENDAR') {
    if (data.action === 'CREATE') {
      if (!data.summary) return '❓ Nama agendanya apa, Tuan?';
      if (!data.start) return `❓ Jadwal "${data.summary}" dimulai kapan, Tuan?`;
    }
    if (data.action === 'DELETE' && !data.event_id && !data.summary && !data.search_keyword) {
      return '❓ Jadwal mana yang ingin dibatalkan atau dihapus, Tuan?';
    }
  }

  if (it === 'TASK') {
    if (data.action === 'CREATE' && !data.title) return '❓ Nama tugas yang ingin dibuat apa, Tuan?';
    if (['DELETE', 'COMPLETE', 'EDIT'].includes(data.action) && !data.search_keyword && !data.title && !data.task_id) {
      return '❓ Tugas mana yang dimaksud, Tuan? Sebutkan kata kunci judulnya.';
    }
  }

  if (it === 'EMAIL') {
    if (data.action === 'SEND' && (!data.to || !data.subject || !data.content)) {
      return '❓ Untuk kirim email, mohon lengkapi penerima, subjek, dan isi emailnya, Tuan.';
    }
    if (data.action === 'DELETE' && !data.search_keyword) {
      return '❓ Email mana yang ingin dihapus, Tuan? Beri kata kunci subjek/pengirim.';
    }
  }

  if (it === '2ND_BRAIN') {
    const action = data.action || 'READ';
    if (['EDIT', 'DELETE'].includes(action) && !data.search_keyword && !data.item_id) {
      return '❓ Arsip mana yang dimaksud, Tuan? Mohon beri kata kunci.';
    }
    if (['APPEND', 'EDIT'].includes(action) && !data.content) {
      return '❓ Konten arsip yang ingin disimpan/diubah belum ada, Tuan.';
    }
  }

  if (['USER_PROFILE', 'CORE_IDENTITY'].includes(it)) {
    const action = data.action || (data.content ? 'APPEND' : 'READ');
    if (action === 'APPEND' && !data.content) return '❓ Fakta/aturan yang ingin ditambahkan apa, Tuan?';
    if (action === 'DELETE' && !data.search_keyword && !data.item_id) return '❓ Item mana yang ingin dihapus dari memori, Tuan?';
  }

  return null;
}

// ── Backward-Compatibility Aliases ────────────────────────────
// resolveAmbiguousFollowUp is the old CLI name for resolveFollowUp.
// buildGlobalFollowUpRouting is the old Telegram name for resolveFollowUp.
const resolveAmbiguousFollowUp = resolveFollowUp;
const buildGlobalFollowUpRouting = resolveFollowUp;

module.exports = {
  isAmbiguousFollowUp,
  hasStrongNewIntentCue,
  isEmailHistoryFollowUp,
  isGenericContinuation,
  resolveFollowUp,
  // Backward-compat aliases (adapters can migrate gradually)
  resolveAmbiguousFollowUp,
  buildGlobalFollowUpRouting,
  getClarificationMessage,
  // Underscore aliases used in existing tests
  _isAmbiguousFollowUp: isAmbiguousFollowUp,
  _hasStrongNewIntentCue: hasStrongNewIntentCue,
  _getClarificationMessage: getClarificationMessage
};
