const { executeWithFallback } = require('./Fallback_Engine');
const supabaseMemories = require('../infrastructure/Supabase_Memories');
const { NEXA_PERSONALITY } = require('../config/personality');



// ============================================================
// ADAPTIVE HISTORY — dynamic fetch limit based on context
// Normal: 6 exchanges (12 msg) | Context-ref detected: 10 exchanges (20 msg)
// ============================================================
const CONTEXTUAL_REF_WORDS = [
  'yang tadi', 'sebelumnya', 'lanjut', 'ubah itu', 'yang barusan',
  'tadi bilang', 'hapus yang', 'yang itu', 'edit itu', 'hapus itu',
];
const HISTORY_CHAR_CAP = 10000; // ~2.500 token safety net (pesan N.E.X.A max 4.000 char)

// ============================================================
// PRE-FLIGHT CLASSIFIER — keyword banks untuk calendar gating
// ============================================================
const _CAL_TIME_KWS = [
  'besok', 'lusa', 'kemarin', 'minggu depan', 'hari ini', 'malam ini',
  'sore ini', 'pagi ini', 'senin', 'selasa', 'rabu', 'kamis', 'jumat',
  'sabtu', 'tanggal', 'bulan depan',
];
const _CAL_DOMAIN_KWS = [
  'jadwal', 'kalender', 'meeting', 'rapat', 'event', 'reminder',
  'ingatkan', 'buat jadwal', 'agenda', 'matkul', 'kelas', 'kuliah',
  'jadwal hari'
];

// ============================================================
// PROGRESSIVE FACT INJECTION
// ============================================================
const PROFILE_CORE_COUNT  = 10; // fakta tertua — selalu diinjeksi (cukup 10 karena info dasar sudah di personality.js)
const PROFILE_KW_LIMIT    = 10; // max fakta tambahan dari dynamic word resonance (penting untuk membangun kedekatan)
const IDENTITY_CORE_COUNT = 10; // 10 identitas pokok — selalu diinjeksi (wajib)
const IDENTITY_KW_LIMIT   = 5;  // max kamus log/teknis tambahan dari penyaringan (karena teks identitas cukup panjang)

// ============================================================
// TOKEN BUDGET GUARD — Proteksi agar prompt tidak melebihi batas Groq
// Groq Free Tier: 12.000 TPM. Guard threshold: 10.500 char (~2.625 token).
// Estimasi kasar: 1 token ≈ 4 karakter (konservatif untuk Bahasa Indonesia)
// Jika prompt > GROQ_CHAR_LIMIT, pangkas histori chat dari yang tertua.
// ============================================================
const GROQ_CHAR_LIMIT = 42000; // ~10.500 token × 4 char/token (batas aman sebelum kena 413)

/**
 * Perkirakan jumlah karakter prompt sebelum dikirim ke AI.
 * Jika melebihi GROQ_CHAR_LIMIT, potong histori chat dari yang paling tua
 * hingga total karakter turun di bawah threshold.
 * @param {string} basePrompt - Prompt lengkap sebelum histori dimasukkan
 * @param {string} historyStr - String histori obrolan
 * @param {string} systemPrompt - System prompt
 * @returns {string} - String histori yang sudah dipangkas jika perlu
 */
function _applyTokenBudgetGuard(basePrompt, historyStr, systemPrompt) {
  const totalChars = basePrompt.length + historyStr.length + systemPrompt.length;
  if (totalChars <= GROQ_CHAR_LIMIT) return historyStr; // Aman, tidak perlu dipangkas

  // Pisahkan history per baris dan pangkas dari yang tertua
  const lines = historyStr.split('\n');
  let trimmed = lines;
  let currentTotal = totalChars;

  // Hapus dua baris terlama (1 pasang user/nexa) per iterasi
  while (currentTotal > GROQ_CHAR_LIMIT && trimmed.length > 4) {
    const removed = trimmed.splice(0, 2); // Hapus 2 baris paling atas
    currentTotal -= removed.reduce((s, l) => s + l.length + 1, 0);
  }

  if (trimmed.length < lines.length) {
    console.log(`[ROUTER] Token guard active: history trimmed ${lines.length} → ${trimmed.length} lines. Total ~${Math.round(currentTotal/4)} tokens.`);
  }
  return trimmed.join('\n');
}

// ============================================================
// PERSONAL FACTS CACHE (Module-level — lives as long as server runs)
// Zero overhead after first fetch. Invalidated when new PERSONAL_FACT is saved.
// ============================================================
let _personalFactsCache = null;
let _personalFactsCacheTime = 0;
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes TTL (safety net re-fetch)

/**
 * Load personal facts with smart caching.
 * First call: fetches from Supabase (~15ms).
 * Subsequent calls: returns from RAM (0ms) until cache is invalidated.
 */
async function loadPersonalFactsWithCache() {
  const now = Date.now();
  // Return from cache if still valid
  if (_personalFactsCache !== null && (now - _personalFactsCacheTime) < CACHE_TTL_MS) {
    return _personalFactsCache;
  }
  // Fetch fresh from Supabase
  const facts = await supabaseMemories.getPersonalFacts();
  _personalFactsCache = facts;
  _personalFactsCacheTime = now;
  const count = (facts.userProfile?.length || 0) + (facts.coreIdentity?.length || 0);
  console.log(`[ROUTER] Personal facts cache refreshed. Count: ${count}`);
  return facts;
}

/**
 * Invalidate the personal facts cache.
 * Call this immediately after saving a new PERSONAL_FACT so the next
 * AI response already includes it.
 */
function invalidatePersonalFactsCache() {
  _personalFactsCache = null;
  _personalFactsCacheTime = 0;
  console.log('[ROUTER] Personal facts cache invalidated. Will re-fetch on next message.');
}

// ============================================================
// [PHASE 6] IDENTITY MODEL CACHE
// Cache untuk 7-Layer Identity Model yang sudah terkonfirmasi.
// TTL lebih pendek (15 menit) agar update dari Approve tombol
// Telegram langsung terasa di percakapan berikutnya.
// ============================================================
let _identityModelCache = null;
let _identityModelCacheTime = 0;
const IDENTITY_CACHE_TTL_MS = 15 * 60 * 1000; // 15 menit

/**
 * Load Identity Model (7 Layer) dengan caching.
 * Return-nya: Map dari layer ke array trait objects.
 * Contoh: { HABITS: [{trait_key, trait_value}, ...], PREFERENCES: [...], ... }
 */
async function loadIdentityModelWithCache() {
  const now = Date.now();
  if (_identityModelCache !== null && (now - _identityModelCacheTime) < IDENTITY_CACHE_TTL_MS) {
    return _identityModelCache;
  }

  try {
    const traits = await supabaseMemories.getIdentityModel(); // Ambil semua layer
    // Kelompokkan per layer untuk akses cepat
    const grouped = {};
    for (const trait of (traits || [])) {
      if (!grouped[trait.layer]) grouped[trait.layer] = [];
      grouped[trait.layer].push(trait);
    }
    _identityModelCache = grouped;
    _identityModelCacheTime = now;
    const total = (traits || []).length;
    if (total > 0) {
      console.log(`[ROUTER] Identity Model cache refreshed. ${total} traits across ${Object.keys(grouped).length} layers.`);
    }
  } catch (err) {
    console.warn('[ROUTER] Failed to load Identity Model (table may not exist yet):', err.message);
    _identityModelCache = {}; // Cache kosong agar tidak retry terus-menerus
    _identityModelCacheTime = now;
  }

  return _identityModelCache;
}

/**
 * Invalidate Identity Model cache.
 * Dipanggil dari webhook.js setelah Tuan Faqih menekan APPROVE
 * agar AI langsung menggunakan identitas yang baru dikonfirmasi.
 */
function invalidateIdentityModelCache() {
  _identityModelCache = null;
  _identityModelCacheTime = 0;
  console.log('[ROUTER] Identity Model cache invalidated. Will re-fetch on next message.');
}

// ============================================================
// [PHASE 6] TARGETED IDENTITY LAYER INJECTOR
// Memilih HANYA layer yang relevan berdasarkan konteks percakapan.
// Prinsip: hemat token, tajam, tidak boros.
//
// Mapping Intent → Layer yang diinjeksi:
//   CALENDAR/TASK        → HABITS (ritme waktu kerja) + WEAKNESSES (sering lupa)
//   FINANCE              → WEAKNESSES (kebiasaan finansial) + VALUES
//   NORMAL_CHAT          → PREFERENCES (gaya komunikasi) + MOTIVATIONS
//   EMAIL/WEB_SEARCH     → DECISION_STYLE (gaya riset) + PREFERENCES
//   STRATEGIC/DISCIPLINE → VALUES + DECISION_STYLE + MOTIVATIONS
//   Default (semua)      → PREFERENCES saja (aman, tidak invasif)
// ============================================================

/**
 * Deteksi konteks topik dari teks pesan (heuristic, zero-token).
 * Return: kategori konteks ('SCHEDULING', 'FINANCE', 'CASUAL', 'RESEARCH', 'STRATEGIC', 'DEFAULT')
 */
function _detectTopicContext(text) {
  if (!text) return 'DEFAULT';
  const t = String(text).toLowerCase();

  // SCHEDULING: Topik waktu, jadwal, tugas
  if (/\b(jadwal|kalender|deadline|tugas|besok|hari ini|meeting|kelas|matkul|reminder|alarm|bangun)\b/.test(t)) {
    return 'SCHEDULING';
  }
  // FINANCE: Topik keuangan
  if (/\b(beli|bayar|transfer|saldo|dompet|keuangan|uang|pengeluaran|tabungan|budget|qris|tagihan)\b/.test(t)) {
    return 'FINANCE';
  }
  // RESEARCH: Pencarian, riset, baca
  if (/\b(cari|cek|googling|research|artikel|baca|informasi|berita|email|inbox)\b/.test(t)) {
    return 'RESEARCH';
  }
  // STRATEGIC: Keputusan, rencana besar, pilihan penting
  if (/\b(rencana|strategi|pilihan|memilih|keputusan|planning|prioritas|tujuan|target|goals|skripsi|karir)\b/.test(t)) {
    return 'STRATEGIC';
  }
  // CASUAL: Obrolan santai
  if (/\b(halo|hai|apa kabar|gimana|bagaimana|cerita|curhat|lagi ngapain)\b/.test(t)) {
    return 'CASUAL';
  }
  return 'DEFAULT';
}

/**
 * Pilih layer identitas yang relevan dan format menjadi string prompt.
 * @param {object} identityModel - Map layer → [{trait_key, trait_value}]
 * @param {string} topicContext - Hasil dari _detectTopicContext()
 * @returns {string} - String siap diinjeksi ke prompt, atau '' jika kosong
 */
function _buildIdentityContextBlock(identityModel, topicContext) {
  if (!identityModel || Object.keys(identityModel).length === 0) return '';

  // Mapping konteks → layer yang akan diinjeksi
  const CONTEXT_TO_LAYERS = {
    SCHEDULING : ['HABITS', 'WEAKNESSES', 'PREFERENCES'],
    FINANCE    : ['WEAKNESSES', 'VALUES', 'HABITS'],
    RESEARCH   : ['DECISION_STYLE', 'PREFERENCES'],
    STRATEGIC  : ['VALUES', 'DECISION_STYLE', 'MOTIVATIONS'],
    CASUAL     : ['PREFERENCES', 'MOTIVATIONS'],
    DEFAULT    : ['PREFERENCES'],
  };

  const targetLayers = CONTEXT_TO_LAYERS[topicContext] || CONTEXT_TO_LAYERS['DEFAULT'];
  const lines = [];

  for (const layer of targetLayers) {
    const traits = identityModel[layer];
    if (!traits || traits.length === 0) continue;

    const emoji = {
      FACTS: '📌', PREFERENCES: '💬', HABITS: '🔁',
      VALUES: '⚖️', DECISION_STYLE: '🧠', WEAKNESSES: '⚡', MOTIVATIONS: '🚀'
    }[layer] || '•';

    const traitLines = traits.map(t => `  - ${t.trait_key}: ${t.trait_value}`).join('\n');
    lines.push(`${emoji} ${layer}:\n${traitLines}`);
  }

  if (lines.length === 0) return '';

  return `\n[COGNITIVE IDENTITY MODEL — PEMAHAMAN MENDALAM TUAN FAQIH (Phase 6)]\n` +
         `Gunakan pemahaman ini untuk merespons dengan sangat kontekstual dan personal:\n` +
         lines.join('\n\n') + '\n';
}

const ROUTER_SYSTEM_PROMPT = `
${NEXA_PERSONALITY}

[COGNITIVE & ROUTING TASKS]
Analyze the user's message, chat history, and context. Determine the ABSOLUTE INTENT and output ONLY valid JSON without markdown wrapping.

CRITICAL ROUTING RULES:
1. FINANCE: NEVER use INCOMPLETE_INFO. If details missing, use action RECORD with description '-'. Let backend ask.
2. FINANCE UPDATE_PENDING: ONLY output fields explicitly mentioned (e.g. payment_method, account). Leave others null. DO NOT overwrite with empty strings.
3. CONTEXT INFERENCE: For short follow-ups ("iya", "lanjut", "ubah harganya", "hapus itu"), strictly use "Intent Sebelumnya" and "Data Aktif Terakhir" from [STATUS AKTIF] to infer the action. DO NOT default to NORMAL_CHAT.
4. DATABASE: STRICTLY for Supabase tables. NEVER use for "Buku kas"/"Tabel keuangan" (Use FINANCE). DO NOT invent actions (No "DELETE_ROWS").
5. PASSIVE LEARNING — CRITICAL SEPARATION:
   - "learned_user_facts": ONLY facts about TUAN FAQIH (the human user). e.g. his hobbies, habits, goals, preferences, daily life, health. CRITICAL: ALSO capture UPDATES and LIFE CHANGES. If Tuan mentions something that CONTRADICTS or UPDATES a previous state (e.g. "sudah berhenti merokok", "sudah lulus", "pindah ke Jakarta", "sekarang olahraga rutin"), EXTRACT it as a learned_user_fact so the system can replace/update the old record. Empty [] if nothing new or changed.
   - "learned_core_identities": ONLY facts about N.E.X.A ITSELF (the AI). Capture ALL of the following types:
       * Explicit capabilities:  "kamu bisa baca PDF", "N.E.X.A sudah bisa analisis emosi"
       * Explicit limitations:   "kamu sering lupa konteks panjang", "kamu belum bisa akses internet langsung"
       * Corrections from Tuan:  "ingat ya, jangan pakai poin", "tolong jangan terlalu panjang", "kamu salah tadi soal format"
       * Operational rules:      "kamu harus konfirmasi dulu sebelum hapus data", "sebaiknya kamu ringkas jawaban"
       * Style observations:     "responsmu terlalu formal", "gaya bahasamu sudah enak", "kamu sudah lebih singkat"
     Empty [] if nothing new about N.E.X.A.
   - NEVER mix them. "Kamu diciptakan pada X" → learned_core_identities. "Aku suka kopi" → learned_user_facts.
6. ISO DATES: 'start' & 'end' MUST be ISO 8601 +07:00 (e.g., "2026-05-07T19:00:00+07:00").
7. LANGUAGE: Output JSON keys/values in English, EXCEPT "reply_message" MUST be in natural, elegant Indonesian based on NEXA_PERSONALITY. CRITICAL: If greeting, STRICTLY match the time of day provided in [WAKTU SERVER SAAT INI].
8. PROACTIVE MEMORY INITIATIVE (NORMAL_CHAT): In NORMAL_CHAT, intelligently synthesize [FAKTA PERMANEN TENTANG TUAN FAQIH] with his current activity and [WAKTU SERVER SAAT INI]. When he mentions daily routines, study sessions, fatigue, or plans, naturally weave in his recorded habits and proactively offer ONE relevant executive assistance (e.g., focus timer, calendar reminder, expense logging, literature search) ONLY when it feels 100% natural, empathetic, and genuinely helpful. If it is merely casual banter or a brief greeting, remain warm and conversational without forcing features.
9. REPLY LABELS: [KONTEKS_AKSI] = user wants to act on the referenced item, determine action from their words. [KONTEKS_REFERENSI] = quoted message is reference only, route by user's own words (usually NORMAL_CHAT).
10. SEMANTIC CATEGORY MAPPING (FINANCE):
    WAJIB DAN HARUS HANYA MENGGUNAKAN nama kategori yang terdaftar pada blok [KATEGORI TRANSAKSI AKTIF] di bawah nanti. DILARANG KERAS mengarang atau menggunakan nama kategori lain.
11. Payment Method Extraction (Infer if obvious, else null):
    - "pakai QRIS/scan QR/qris" -> "QRIS"
    - "transfer/TF/via BCA/Mandiri" -> "Transfer bank"
    - "kartu kredit/gesek/cicil/cc" -> "Kartu Kredit"
    - "tunai/cash/uang fisik" -> "Tunai"
12. TELEGRAM FORMATTING RULE: DILARANG menyebar karakter asterisk/bintang (*) berlebihan dalam reply_message. Gunakan bahasa Indonesia natural yang bersih, atau tag HTML <b>teks</b> jika ingin penekanan kata.

13. MOOD EXTRACTION (EMPATHY & INTENSITY SENSITIVITY):
    WAJIB evaluasi nada emosi dari pesan Tuan Faqih. Pilih 1 dari: "HAPPY|EXCITED|MOTIVATED|FOCUSED|POSITIVE|NEUTRAL|CALM|TIRED|BORED|STRESSED|NEGATIVE|ANXIOUS|ANGRY|SAD".
    - Jika Tuan Faqih mengeluh error/bug, protes, bingung, atau frustrasi ("argh", "ga sesuai", "kok gini", "looping", "perbaiki"), pilih STRESSED, ANGRY, atau NEGATIVE.
    - Jika sedang bekerja/coding/riset/deploy, pilih FOCUSED atau MOTIVATED.
    - Jika lelah/ngantuk/minta istirahat, pilih TIRED.

OUTPUT JSON FORMAT:
{
  "reasoning": "1-2 sentences of logical analysis binding context and intent.",
  "intent": "FINANCE|CALENDAR|TASK|EMAIL|DATABASE|WEB_SEARCH|DISCIPLINE|2ND_BRAIN|USER_PROFILE|CORE_IDENTITY|DIAGNOSE_SYSTEM|INCOMPLETE_INFO|NORMAL_CHAT",
  "mood": "HAPPY|EXCITED|MOTIVATED|FOCUSED|POSITIVE|NEUTRAL|CALM|TIRED|BORED|STRESSED|NEGATIVE|ANXIOUS|ANGRY|SAD",
  "reply_message": "Natural, warm conversational Indonesian response addressing user as Tuan Faqih (MANDATORY for NORMAL_CHAT, INCOMPLETE_INFO, DISCIPLINE, USER_PROFILE, CORE_IDENTITY).",
  "learned_user_facts": ["New permanent facts ABOUT TUAN FAQIH (the human), or empty []"],
  "learned_core_identities": ["New permanent facts ABOUT N.E.X.A ITSELF (the AI), or empty []"],
  "extracted_data": {
    // FINANCE: { action: "RECORD|RECORD_MULTIPLE|READ_LATEST|READ_ANALYTICS|EDIT|DELETE|UNDO_DELETE|IMPORT_FROM_EMAIL|CONFIRM_TRANSACTION|UPDATE_PENDING|CANCEL_TRANSACTION|CATEGORY_BREAKDOWN|PERIOD_COMPARISON|TOP_EXPENSES|ACCOUNT_BALANCES|DAILY_TREND|SMART_SUMMARY|MONTHLY_SUMMARY|SAVING_RATE|BALANCE_TREND", nominal: number, type: "INCOME|EXPENSE", destination: string, category: string, description: string, time: "ISO+07:00", account: string, payment_method: string, search_keyword: string, date_text: string, limit: number, transactions: [],
    //   is_split: boolean (true jika pengeluaran mengandung BEBERAPA item dengan kategori berbeda),
    //   store_name: string (nama toko/merchant jika disebutkan, e.g. "Indomaret", "Alfamart"),
    //   items: [{label: string, nominal: number, category: string}] (array rincian item split, WAJIB diisi jika is_split=true)
    //   SPLIT DETECTION RULES: Set is_split=true jika user menyebut beberapa item dengan kategori berbeda dalam satu perintah.
    //   Contoh split: "belanja indomaret 50rb: beras 20rb, sabun 15rb, es krim 15rb" → is_split=true, items=[{beras,20000,Bahan Makanan},{sabun,15000,Perawatan},{es krim,15000,Jajan}]
    //   Contoh BUKAN split: "beli nasi goreng 15rb" → is_split=false (satu kategori, RECORD biasa)
    //   - EDIT/DELETE last tx: set search_keyword="LATEST" (Triggers: "hapus yang tadi", "ubah yang barusan").
    // CALENDAR: { action: "CREATE|DELETE|UPDATE|READ|READ_TODAY|READ_TOMORROW|READ_UPCOMING", summary, start: "ISO+07:00", end: "ISO+07:00", description, eventId, location, reminder_minutes: [], recurrence: "RRULE...", color_id }
    //   - Triggers: "jadwal hari ini" -> READ_TODAY, "jadwal besok" -> READ_TOMORROW, "jadwal minggu ini" -> READ_UPCOMING, "jadwal tgl X" -> READ (with start/end date of tgl X).
    //   - For READ / READ_TODAY / READ_TOMORROW / READ_UPCOMING: 'summary' MUST be null or omitted unless user explicitly searched for a specific event title keyword (e.g., "jadwal rapat" -> summary="rapat"). NEVER put date strings, explanations, or sentences like "HARI BESOK ADALAH..." or "TIDAK ADA JADWAL" in summary!
    // TASK: { action: "CREATE|CREATE_SUBTASK|CREATE_MULTIPLE|READ|READ_LIST|READ_LISTS|READ_TODAY|READ_TOMORROW|READ_UPCOMING|READ_OVERDUE|READ_DONE|COMPLETE|DELETE|EDIT|MOVE|CLEAR_DONE|SET_PRIORITY", title, due_date: "ISO+07:00|null", notes, search_keyword, list_name, parent_task_keyword, priority: "HIGH|NORMAL", duration_minutes: number|null, tasks: [], sync_calendar: true|false|null, calendar_start_time: "ISO+07:00|null" }
    //   CRITICAL TASK FIELD RULES:
    //   - due_date: STRICTLY the task DEADLINE (kapan tugas harus selesai). Contoh: "deadline 2 hari lagi" → due_date = lusa. BUKAN waktu mulai pengerjaan.
    //   - calendar_start_time: Waktu MULAI BLOK KERJA di kalender (kapan user akan mengerjakan). Contoh: "besok jam 8 malam" → calendar_start_time = besok 20:00. BUKAN due_date.
    //   - sync_calendar: true jika user SECARA EKSPLISIT menyebutkan waktu/jam pengerjaan ATAU meminta sinkronisasi kalender. false jika user SECARA EKSPLISIT menolak sinkronisasi. null jika user TIDAK menyebutkan sama sekali soal kalender/waktu pengerjaan (akan ditanya oleh sistem).
    //   - duration_minutes: Durasi blok kerja di kalender dalam menit. Ekstrak jika user menyebutkan (contoh: "2 jam" → 120, "45 menit" → 45). null jika tidak disebutkan (default 60 menit akan dipakai sistem).
    //   - Contoh instruksi lengkap: "catat besok saya harus mengerjakan makalah jam 8 malam, deadlinenya tinggal 2 hari" → title="Mengerjakan makalah", calendar_start_time="besok T20:00+07:00", due_date="lusa ISO", sync_calendar=true, duration_minutes=null
    //   - COMPLETE Trigger: "tandai tugas essay sebagai selesai"
    //   - DELETE Trigger: "hapus tugas essay Arab"
    //   - EDIT Trigger: "ubah deadline tugas essay jadi Senin"
    //   - MOVE Trigger: "pindahkan tugas essay ke list Tugas Kuliah"
    // EMAIL: { action: "READ|SEND|DELETE", search_keyword, max_results, to, subject, content }
    // DATABASE: { action: "LIST_TABLES|READ_TABLE|INSERT_ROW|UPDATE_ROW|DELETE_ROW|DELETE_ALL_ROWS|DELETE_ALL_ROWS_CONFIRMED|CANCEL_ACTION", table_name, row_id, search_keyword, max_results, row_data: {}, update_data: {} }
    //   - DELETE_ALL_ROWS Triggers: "hapus riwayat chat" (table: nexa_chat_memories), "bersihkan vault" (table: nexa_vault_items)
    // 2ND_BRAIN: { action: "APPEND|READ|EDIT|DELETE", title, content, search_keyword }
    // USER_PROFILE: Facts about TUAN FAQIH (the human user). { action: "APPEND|READ|DELETE", content, search_keyword }
    //   - APPEND Triggers: "ingat ya aku suka kopi", "aku punya kebiasaan X", "cita-citaku adalah..."
    //   - READ Triggers: "apa yang kamu ingat tentangku", "kamu tahu apa tentang diriku"
    //   - DELETE Triggers: "hapus ingatanmu tentang kopi"
    // CORE_IDENTITY: Facts about N.E.X.A ITSELF (the AI). { action: "APPEND|READ|DELETE", content, search_keyword }
    //   - APPEND Triggers: "kamu diciptakan pada X", "namamu adalah...", "kemampuanmu adalah...", "simpan ke memori kamu tentang dirimu"
    //   - READ Triggers: "kamu itu siapa", "kamu diciptakan kapan", "apa kemampuanmu"
    //   - DELETE Triggers: "hapus aturan identitasmu tentang X"
    //   CRITICAL: If a message states a fact about N.E.X.A (uses "kamu"/"Nex"/"N.E.X.A" as the subject), it MUST be intent CORE_IDENTITY, NOT USER_PROFILE.
    // WEB_SEARCH: { query, type: "search|news" }
    //   - Triggers: "cari informasi tentang X", "googling X", "coba cari X", "berita terbaru X", "apa itu X", "baca tentang X", "info X", "terbaru dari X"
    //   - CRITICAL QUERY RULE: 'query' MUST be extracted STRICTLY from the user's own words. DO NOT add context words like "dari lampiran", "dari sistem", "analisis konten" unless the user explicitly mentioned them.
    //   - type: "news" jika user menyebut "berita"/"terbaru"/"hari ini". "search" untuk pertanyaan umum/riset.
    //   - EXAMPLE CORRECT: User says "coba baca tentang apa yang terbaru" → query="berita terbaru", type="news"
    //   - EXAMPLE WRONG: query="analisis konten terbaru dari lampiran" (DO NOT add words not spoken by user)
    // DIAGNOSE_SYSTEM: { action: "READ_LOGS", search_keyword: string }
    //   - Triggers: "cek log", "apa yang kamu lakukan tadi", "kenapa error", "baca log sistem"
  },
  "god_mode_trigger": false
}
`;

// ============================================================
// CROSS-DOMAIN FUSION & SENTIMENT HELPERS
// ============================================================

/**
 * Pure heuristic sentiment detection from text style (Zero Latency).
 * Returns 'STRESSED', 'CASUAL', or 'NEUTRAL'.
 */
function _detectSentiment(text) {
  if (!text) return 'NEUTRAL';
  const str = text.toLowerCase();
  
  const matchAny = (words) => words.some(w => new RegExp(`\\b${w.replace(/ /g, '\\s+')}\\b`, 'i').test(str));

  // 1. STRESSED / FRUSTRATED — Kepanikan, Ketergesaan, Darurat, Frustrasi Teknis
  const rushWords = [
    "panik", "darurat", "buru-buru", "keburu", "mepet", "gawat",
    "urgent", "buruan", "cepetan", "ngebut", "kepepet", "sos",
    "emergency", "last minute", "ga sempet", "hampir telat",
    "dikejar waktu", "waktunya abis", "tolong cepat",
    "butuh bantuan segera", "sekarang juga", "telat parah",
    "kerjaan numpuk", "tugas numpuk", "ga ada waktu",
    "deg deg ser", "takut telat", "gelagapan", "keteteran",
    "pusing pala", "puyeng", "overwhelmed", "stres banget",
    "panik banget", "ngejar deadline", "deadline besok",
    "waktu mepet", "mepet banget", "dikejar-kejar",
    "mampus telat", "kacau banget", "berantakan semua",
    "argh", "arghh", "bingung", "ga sesuai", "kok gini",
    "malah balik", "looping", "ngeloop", "kenapa sih",
    "kok salah", "perbaiki", "benerin", "error terus",
    "ga jalan", "ga mau", "rusak", "kacau", "pusing parah"
  ];
  const hasExclamation = (text.match(/!/g) || []).length >= 2;
  const isAllCaps = text.length > 5 && text === text.toUpperCase();
  if (matchAny(rushWords) || hasExclamation || isAllCaps) return 'STRESSED';

  // 2. ANGRY — Kemarahan, Frustrasi Berat, Kekesalan
  const angryWords = [
    "anjing", "ajg", "brengsek", "sialan", "keparat", "bangsat",
    "goblok", "tolol", "nyebelin", "bikin emosi", "bikin kesel",
    "frustrasi", "jengkel", "gondok", "muak", "sebel", "marah",
    "ngamuk", "kesal", "dongkol", "ngeselin", "bete parah",
    "eneg", "kampret", "bedebah", "jahanam", "najis",
    "bikin naik darah", "ngegas", "emosi jiwa", "nyolot",
    "kesel parah", "marah banget", "emosi parah", "setan",
    "menyebalkan", "kesel banget", "gondok banget",
    "capek ngurusin", "males banget ngurusin", "sebel parah",
    "naik pitam", "bodoh", "parah banget", "cacat"
  ];
  if (matchAny(angryWords)) return 'ANGRY';

  // 3. FOCUSED / MOTIVATED — Fokus Kerja, Riset, Coding, Produktivitas
  const focusedWords = [
    "riset", "coding", "deploy", "server", "commit", "push",
    "github", "vercel", "supabase", "database", "fokus",
    "mengerjakan", "selesaikan", "project", "analisis",
    "bedah", "pelajari", "simulasikan", "investigasi",
    "eksekusi", "target", "produktivitas", "kerjaan"
  ];
  if (matchAny(focusedWords)) return 'FOCUSED';

  // 4. TIRED / BORED — Lelah, Ngantuk, Jenuh
  const tiredWords = [
    "ngantuk", "lelah", "capek", "istirahat", "tidur",
    "cape banget", "lemas", "bosen", "jenuh", "penat",
    "letih", "lesu", "rebahan dulu", "capek fisik"
  ];
  if (matchAny(tiredWords)) return 'TIRED';

  // 5. SAD — Kesedihan, Demotivasi, Putus Asa, Sakit
  const sadWords = [
    "sedih", "nangis", "galau", "hopeless", "sakit hati",
    "mati rasa", "putus asa", "depresi", "down", "nelangsa",
    "patah hati", "kehilangan", "kecewa", "hancur", "hampa",
    "terpuruk", "kesepian", "ga semangat", "demotivasi",
    "nyesel", "remuk", "murung", "nestapa", "merana",
    "capek hidup", "ngerasa gagal", "gak ada harapan",
    "mau nyerah", "pengen nangis", "sakit banget", "terluka",
    "ditinggal", "dikhianati", "ngerasa sendiri", "sedih banget",
    "nangis bombay", "hancur lebur", "drop banget",
    "hidup hampa", "males hidup", "ga ada motivasi"
  ];
  if (matchAny(sadWords)) return 'SAD';

  // 6. HAPPY / EXCITED — Kegembiraan, Kepuasan, Antusiasme
  const happyWords = [
    "seneng", "bahagia", "mantul", "yeay", "asik",
    "gembira", "happy", "semangat", "excited", "girang",
    "pecah", "keren banget", "mantap", "yess", "berhasil",
    "sukses", "bangga", "alhamdulillah", "seru banget",
    "puas banget", "hepi", "luar biasa", "amazing",
    "gila keren", "wohoo", "asyik banget", "juara",
    "top banget", "gokil abis", "legend", "epic",
    "kece", "sip banget", "senangnya", "bahagia banget",
    "excited parah", "ga sabar nunggu", "hore",
    "mantap jiwa", "suka banget", "terharu bahagia",
    "jos gandos", "top markotop", "anjay keren"
  ];
  if (matchAny(happyWords)) return 'HAPPY';

  // 7. CASUAL — Santai, Candaan, Tidak Terburu-buru
  const casualWords = [
    "wkwk", "haha", "santai", "gabut", "mager", "bercanda",
    "becanda", "ngakak", "lol", "hehe", "iseng", "slow",
    "peace", "kwkw", "xixi", "ngetroll", "ngeledek",
    "btw", "fyi", "ngobrol", "nongkrong",
    "rebahan", "healing", "receh", "gaje",
    "garing", "random", "asal ngomong",
    "hmm", "gabut parah",
    "mager banget", "otw", "ntar", "besok aja",
    "santuy", "gengs", "bestie", "chill",
    "gausah buru-buru", "pelan-pelan aja", "yaudah",
    "gitu deh", "ngalir aja"
  ];
  if (matchAny(casualWords)) return 'CASUAL';

  return 'NEUTRAL';
}

/**
 * Zero-latency pre-flight domain classifier.
 * Detects whether the user message contains time/date references
 * or calendar-specific keywords.
 */
function _preflightClassify(text) {
  const t = (typeof text === 'string' ? text : String(text || '')).toLowerCase();
  const hasTime = _CAL_TIME_KWS.some(kw => t.includes(kw)) || /\d{1,2}:\d{2}/.test(text || '');
  const hasCal  = _CAL_DOMAIN_KWS.some(kw => t.includes(kw));
  return { hasTime, hasCal };
}

/**
 * Progressive userProfile fact injection with Dynamic Word Resonance (No rigid regex)
 */
function _selectUserProfileFacts(userProfile, userMessage) {
  if (!userProfile || !Array.isArray(userProfile) || userProfile.length === 0) return [];

  const core      = userProfile.slice(0, PROFILE_CORE_COUNT);
  const remaining = userProfile.slice(PROFILE_CORE_COUNT);
  if (remaining.length === 0) return core;

  const stopWords = new Set(['yang', 'akan', 'bisa', 'dari', 'pada', 'untuk', 'dengan', 'dalam', 'tidak', 'sudah', 'telah', 'agar', 'atau', 'saat', 'mau', 'ini', 'itu', 'karena', 'kalau', 'jika', 'kemudian', 'mengapa', 'bagaimana', 'nexa', 'tuan', 'faqih', 'sistem', 'adalah', 'yaitu', 'merupakan', 'oleh', 'sebagai', 'harus', 'wajib', 'juga', 'lagi', 'saja', 'tadi', 'baru', 'banyak']);
  const msgStr = typeof userMessage === 'string' ? userMessage : String(userMessage || '');
  const words = msgStr.toLowerCase().replace(/[^a-z0-9]/g, ' ').split(/\s+/).filter(w => w.length >= 4 && !stopWords.has(w));

  if (words.length === 0) return core;

  const relevant = remaining.filter(fact => {
    if (typeof fact !== 'string' || !fact) return false;
    const fLower = fact.toLowerCase();
    return words.some(w => fLower.includes(w));
  });

  return [...core, ...relevant.slice(0, PROFILE_KW_LIMIT)];
}

/**
 * Progressive coreIdentity fact injection with Dynamic Word Resonance
 */
function _selectCoreIdentityFacts(coreIdentity, userMessage) {
  if (!coreIdentity || !Array.isArray(coreIdentity) || coreIdentity.length === 0) return [];

  const core      = coreIdentity.slice(0, IDENTITY_CORE_COUNT);
  const remaining = coreIdentity.slice(IDENTITY_CORE_COUNT);
  if (remaining.length === 0) return core;

  const stopWords = new Set(['yang', 'akan', 'bisa', 'dari', 'pada', 'untuk', 'dengan', 'dalam', 'tidak', 'sudah', 'telah', 'agar', 'atau', 'saat', 'mau', 'ini', 'itu', 'karena', 'kalau', 'jika', 'kemudian', 'mengapa', 'bagaimana', 'nexa', 'tuan', 'faqih', 'sistem', 'adalah', 'yaitu', 'merupakan', 'oleh', 'sebagai', 'harus', 'wajib', 'juga', 'lagi', 'saja', 'tadi', 'baru', 'banyak']);
  const msgStr = typeof userMessage === 'string' ? userMessage : String(userMessage || '');
  const words = msgStr.toLowerCase().replace(/[^a-z0-9]/g, ' ').split(/\s+/).filter(w => w.length >= 4 && !stopWords.has(w));

  if (words.length === 0) return core;

  const relevant = remaining.filter(fact => {
    if (typeof fact !== 'string' || !fact) return false;
    const fLower = fact.toLowerCase();
    return words.some(w => fLower.includes(w));
  });

  return [...core, ...relevant.slice(0, IDENTITY_KW_LIMIT)];
}

/**
 * Progressive vault item fact injection with Dynamic Keyword Matching
 */
function _selectVaultFacts(vaultItems, userMessage) {
  if (!vaultItems || !Array.isArray(vaultItems) || vaultItems.length === 0) return [];

  // Always include top 3 latest vault items so N.E.X.A knows recent uploads/metadata immediately
  const core = vaultItems.slice(0, 3);
  const remaining = vaultItems.slice(3);
  if (remaining.length === 0) return core;

  const stopWords = new Set(['yang', 'akan', 'bisa', 'dari', 'pada', 'untuk', 'dengan', 'dalam', 'tidak', 'sudah', 'telah', 'agar', 'atau', 'saat', 'mau', 'ini', 'itu', 'karena', 'kalau', 'jika', 'kemudian', 'mengapa', 'bagaimana', 'nexa', 'tuan', 'faqih', 'sistem', 'adalah', 'yaitu', 'merupakan', 'oleh', 'sebagai', 'harus', 'wajib', 'juga', 'lagi', 'saja', 'tadi', 'baru', 'banyak', 'berikan', 'tolong', 'bukakan', 'bacakan', 'nomor', 'apakah']);
  const msgStr = typeof userMessage === 'string' ? userMessage : String(userMessage || '');
  const words = msgStr.toLowerCase().replace(/[^a-z0-9]/g, ' ').split(/\s+/).filter(w => w.length >= 2 && !stopWords.has(w));

  if (words.length === 0) return core;

  const relevant = remaining.filter(fact => {
    if (typeof fact !== 'string' || !fact) return false;
    const fLower = fact.toLowerCase();
    return words.some(w => fLower.includes(w));
  });

  return [...core, ...relevant.slice(0, 7)];
}

async function _fetchRecentFinanceSummary(limit) {
  try {
    const financeEngine = require('../domain/Finance_Engine');
    const summary = await financeEngine.getRecentTransactions(limit);
    if (!summary || summary.includes('(Tidak ada transaksi')) return null;
    return summary;
  } catch (e) {
    return null;
  }
}

async function _fetchUpcomingEventsSummary(limit) {
  try {
    const googleWorkspace = require('../infrastructure/Google_Workspace');
    // Using getTodaysEvents and taking the next 'limit' events
    const todayStr = await googleWorkspace.getTodaysEvents();
    if (!todayStr || todayStr.includes('Tidak ada jadwal')) return null;
    
    // Just parse the first few lines
    const lines = todayStr.split('\n').filter(l => l.trim().length > 0);
    // Take up to `limit` lines that look like events (ignoring the header)
    const eventLines = lines.slice(1, limit + 1);
    if (eventLines.length === 0) return null;
    return eventLines.join(', ');
  } catch (e) {
    return null;
  }
}

/**
 * Route incoming natural language (text) from user
 */
async function routeUserMessage(textInput, runtimeHints = {}) {
  // ── Sentiment Detection (Empathy Layer) ──────────────────────────────────
  // Silently score user's stress/urgency from writing style.
  // We do NOT call AI for this — it's pure heuristic (zero latency).
  const _sentimentScore = _detectSentiment(textInput);

  // ── Pre-flight Domain Classifier (0 tokens, 0ms) ─────────────────────────
  const { hasTime, hasCal } = _preflightClassify(textInput);
  const _hasContextRef = CONTEXTUAL_REF_WORDS.some(kw => textInput.toLowerCase().includes(kw));

  // ── Log Analysis Intent Detection (Universal — works on all interfaces) ───
  const isLogRequest = /(?:cek|analisis|lihat|baca|periksa|mana)\s*(?:log|logs|telemetri|kontainer|space|server)/i.test(textInput) ||
                       (/(?:log|logs)/i.test(textInput) && /(?:mana|analisis|cek|baca|periksa|lihat|kontainer|space)/i.test(textInput));

  if (isLogRequest) {
    console.log('[ROUTER] 🔍 Log Analysis Intent Detected (DIAGNOSE_SYSTEM)');
    const logger = require('../utils/logger');
    let recentLogs = logger.getRecentLogs();
    if (!recentLogs || recentLogs.trim().length === 0) {
      recentLogs = '[SYSTEM] Log in-memory saat ini: Server running, fallback active. (Tidak ada error kritis di terminal lokal).';
    }
    const logAnalysisText = await analyzeSystemLogs(textInput, recentLogs);
    return {
      intent: 'DIAGNOSE_SYSTEM',
      reply_message: logAnalysisText,
      god_mode_trigger: false,
      extracted_data: { log_length: recentLogs.length }
    };
  }

  // 1. Load personal facts (from cache — zero overhead after first call)
  const personalFacts = await loadPersonalFactsWithCache();

  // [PHASE 6] 1.5. Load Identity Model (from cache — zero overhead after first call)
  // Berjalan paralel dengan langkah berikutnya untuk efisiensi maksimal
  const [_, identityModel] = await Promise.allSettled([
    Promise.resolve(), // placeholder
    loadIdentityModelWithCache()
  ]);
  const _identityModel = identityModel.status === 'fulfilled' ? (identityModel.value || {}) : {};

  // 2. Contextual Retrieval — dynamic limit (Step 3: Adaptive History)
  const _fetchLimit = _hasContextRef ? 20 : 12;
  const _rawMemories = await supabaseMemories.getRecentMemories(_fetchLimit);

  // Character safety net — trim oldest messages if total exceeds HISTORY_CHAR_CAP.
  let _memories = _rawMemories;
  const _totalHistChars = _rawMemories.reduce((s, m) => s + (m.content || '').length, 0);
  if (_totalHistChars > HISTORY_CHAR_CAP) {
    let _chars = 0;
    const _kept = [];
    for (let i = _rawMemories.length - 1; i >= 0; i--) {
      const _len = (_rawMemories[i].content || '').length;
      if (_chars + _len <= HISTORY_CHAR_CAP) {
        _kept.unshift(_rawMemories[i]);
        _chars += _len;
      } else { continue; } // FIX BUG 2: Menggunakan continue agar tidak membuang pesan pendek yang lebih lama
    }
    // Pastikan tidak mulai dengan pesan 'nexa' tanpa pasangan user-nya
    if (_kept.length > 0 && _kept[0].role === 'nexa') _kept.shift();
    _memories = _kept;
    console.log(`[ROUTER] History trimmed by char cap: ${_rawMemories.length}msg/${_totalHistChars}ch → ${_memories.length}msg/${_chars}ch`);
  }

  const contextStr = _memories.length > 0
    ? _memories.map(m => `[${m.role.toUpperCase()}]: ${m.content}`).join('\n')
    : '[Tidak ada riwayat obrolan sebelumnya]';

  // 3. Build personal facts context block (Step 4: Progressive userProfile injection)
  let factsContext = '';
  const _selectedProfile = _selectUserProfileFacts(personalFacts.userProfile, textInput);
  if (_selectedProfile.length > 0) {
    factsContext += `\n[FAKTA PERMANEN TENTANG TUAN FAQIH — SELALU INGAT INI]\n${_selectedProfile.map((f, i) => `${i + 1}. ${f}`).join('\n')}\n`;
  }
  if (personalFacts.coreIdentity && personalFacts.coreIdentity.length > 0) {
    const _selectedIdentity = _selectCoreIdentityFacts(personalFacts.coreIdentity, textInput);
    factsContext += `\n[CORE IDENTITY & ATURAN SIKAP N.E.X.A — PATUHI INI]\n${_selectedIdentity.map((f, i) => `${i + 1}. ${f}`).join('\n')}\n`;
  }

  // [PHASE 8] Inject top 5 N.E.X.A Self-Model facts dari nexa_self_model
  try {
    const _supabaseMem = require('../infrastructure/Supabase_Memories');
    const _selfModelFacts = await _supabaseMem.getSelfModel(5);
    if (_selfModelFacts && _selfModelFacts.length > 0) {
      const _selfLines = _selfModelFacts.map((f, i) => `${i + 1}. [${f.layer}] ${f.trait_value}`);
      factsContext += `\n[PEMAHAMAN DIRI N.E.X.A (TOP 5 — DIPELAJARI DARI PENGALAMAN)]\n${_selfLines.join('\n')}\n`;
    }
  } catch (_selfErr) {
    // Non-critical — jangan crash routing jika tabel belum ada
  }
  if (personalFacts.vaultItems && personalFacts.vaultItems.length > 0) {
    const _selectedVault = _selectVaultFacts(personalFacts.vaultItems, textInput);
    if (_selectedVault.length > 0) {
      factsContext += `\n[ARSIP & DOKUMEN VAULT TERSIMPAN TENTANG TUAN FAQIH (TERMASUK METADATA/NIK/DLL)]\n${_selectedVault.map((f, i) => `${i + 1}. ${f}`).join('\n')}\n`;
    }
  }

  // [PHASE 6] 3.5. Build Targeted Identity Layer Injection
  // Deteksi konteks topik dari pesan user dan pilih layer identitas yang paling relevan.
  // Prinsip: injeksi selektif — hanya layer yang dibutuhkan, bukan semua 7 layer sekaligus.
  const _topicContext = _detectTopicContext(textInput);
  const _identityContextBlock = _buildIdentityContextBlock(_identityModel, _topicContext);
  if (_identityContextBlock) {
    factsContext += _identityContextBlock;
    console.log(`[ROUTER] [Phase 6] Identity injection: context=${_topicContext}, layers=${Object.keys(_identityModel).filter(l => _identityContextBlock.includes(l)).join(',')}`);
  }

  // 3.5. Inject Current Jakarta Time — manually built to be runtime-safe on any Node/Bun version
  const _now = new Date();
  // Offset UTC→WIB (+7h) using en-US locale (guaranteed to work everywhere)
  const _jkt = new Date(_now.toLocaleString('en-US', { timeZone: 'Asia/Jakarta' }));
  const _DAYS = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
  const _MONTHS = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
  const currentJakartaTime =
    `${_DAYS[_jkt.getDay()]}, ${_jkt.getDate()} ${_MONTHS[_jkt.getMonth()]} ${_jkt.getFullYear()} ` +
    `pukul ${String(_jkt.getHours()).padStart(2, '0')}:${String(_jkt.getMinutes()).padStart(2, '0')} WIB`;
  // ISO date string in Jakarta (for AI date arithmetic in TASK/CALENDAR intents)
  const currentJakartaISO = `${_jkt.getFullYear()}-${String(_jkt.getMonth() + 1).padStart(2, '0')}-${String(_jkt.getDate()).padStart(2, '0')}`;

  // Build mini-calendar — conditionally gated by pre-flight classifier (Step 2)
  const _calDays = hasCal ? 7 : (hasTime ? 3 : 0);
  const _miniCal = [];
  for (let i = 0; i <= _calDays; i++) {
    const d = new Date(_jkt.getTime() + i * 86400000);
    const ds = `${_jkt.getFullYear() === d.getFullYear() ? '' : d.getFullYear() + '-'}${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const dayFull = `${_DAYS[d.getDay()]}, ${d.getDate()} ${_MONTHS[d.getMonth()]} ${d.getFullYear()}`;
    _miniCal.push(`  +${i} hari: ${dayFull} (ISO: ${ds})`);
  }
  const miniCalStr = _miniCal.join('\n');

  // ── Cross-Domain Fusion + Accounts Context ─────────────────────────────────
  // Silently pull recent finance + upcoming calendar data + active accounts list.
  // Runs in parallel — zero sequential latency penalty.
  let crossDomainBlock = '';
  let activeAccountsBlock = '';
  let activeCategoriesBlock = '';
  try {
    const [recentTxResult, upcomingEvResult, accountsResult, categoriesResult] = await Promise.allSettled([
      _fetchRecentFinanceSummary(3),
      _fetchUpcomingEventsSummary(3),
      // Load daftar akun aktif dari Supabase Finance (dengan cache)
      (async () => {
        try {
          const supabaseFinance = require('../infrastructure/Supabase_Finance');
          return await supabaseFinance.getAccountsList();
        } catch (_) { return []; }
      })(),
      // Load daftar kategori aktif dari Supabase Finance
      (async () => {
        try {
          const supabaseFinance = require('../infrastructure/Supabase_Finance');
          return await supabaseFinance.getCategoriesList();
        } catch (_) { return []; }
      })()
    ]);
    const finLines = [];
    if (recentTxResult.status === 'fulfilled' && recentTxResult.value) {
      finLines.push(`Keuangan Terkini (3 terakhir): ${recentTxResult.value}`);
    }
    if (upcomingEvResult.status === 'fulfilled' && upcomingEvResult.value) {
      finLines.push(`Jadwal Mendatang: ${upcomingEvResult.value}`);
    }
    if (finLines.length > 0) {
      crossDomainBlock = `\n[DATA LINTAS DOMAIN — GUNAKAN UNTUK KONEKSI KONTEKS CERDAS]\n${finLines.join('\n')}\n`;
    }

    // Bangun blok akun aktif jika ada data
    if (accountsResult.status === 'fulfilled' && accountsResult.value && accountsResult.value.length > 0) {
      const accountLines = accountsResult.value.map(a => `- ${a.name} (${a.type})`).join('\n');
      activeAccountsBlock = `\n[AKUN KEUANGAN AKTIF — PAKAI NAMA PERSIS INI UNTUK FIELD "account" DI FINANCE]\n${accountLines}\nCatatan: Jika user menyebut nama akun/dompet/bank yang mirip salah satu di atas, petakan ke nama yang paling cocok.\n`;
    }

    // Bangun blok kategori aktif jika ada data
    if (categoriesResult.status === 'fulfilled' && categoriesResult.value && categoriesResult.value.length > 0) {
      const _cats = categoriesResult.value;
      const _catLines = [];
      
      const buildGroupedString = (typeLabel, filterType) => {
        const filtered = _cats.filter(c => c.type === filterType);
        if (filtered.length === 0) return '';
        const groups = {};
        filtered.forEach(c => {
          const g = c.group_name || 'Lainnya';
          if (!groups[g]) groups[g] = [];
          groups[g].push(c.name);
        });
        const lines = [`${typeLabel}:`];
        for (const [g, names] of Object.entries(groups)) {
          lines.push(`  - [${g}]: ${names.join(', ')}`);
        }
        return lines.join('\n');
      };
      
      const _incomeStr = buildGroupedString('PEMASUKAN', 'income');
      const _expenseStr = buildGroupedString('PENGELUARAN', 'expense');
      
      if (_incomeStr) _catLines.push(_incomeStr);
      if (_expenseStr) _catLines.push(_expenseStr);
      
      activeCategoriesBlock = `\n[ACTIVE TRANSACTION CATEGORIES — ABSOLUTE LIST FOR FINANCE "category" FIELD]\n${_catLines.join('\n')}\n\n[SUPER STRICT CATEGORY SELECTION GUIDELINES]\n1. EXACT CHARACTER MATCHING: You MUST copy EXACTLY one category name from the list above (case-sensitive, spaces, symbols). IT IS STRICTLY FORBIDDEN to hallucinate or invent categories that are not on the list (e.g., do not use "Makanan & Minuman" or "Perawatan & Kecantikan" if they are not listed).\n2. SEMANTIC REASONING: Ask "What is the SUBSTANCE/OBJECT being purchased?" then find the closest match ONLY in the active list.\n- Food/Drinks: If buying nasi, ayam, sate, dll, use "Makan Berat / Makan Luar". If buying camilan, kopi, boba, dll, use "Jajan / Ngopi / Kafe".\n- Services: If paying for laundry/cuci baju, use "Jasa Laundry".\n- Shopping: If buying sabun, beras at a minimarket, use "Bahan Makanan / Groceries".\n- Transportation: For Grab/Gojek, use "Ojek / Taksi Online" or "Transportasi Umum".\n- If there is absolutely no specific category that matches, use "Lainnya" (if available in the list).\n`;
    }
  } catch (_) { /* Non-critical — never crash routing */ }

  let runtimeContextBlock = '';
  if (runtimeHints && Object.keys(runtimeHints).length > 0) {
    const lines = [];
    if (runtimeHints.pendingEmailContext) {
      lines.push(`- Status: Sedang membaca kotak masuk Email Finance. Kata kunci: "${runtimeHints.pendingEmailContext.searchKeyword || 'Semua'}".`);
    }
    if (runtimeHints.pendingDatabaseContext) {
      lines.push(`- Status: Sedang memanipulasi tabel database Supabase "${runtimeHints.pendingDatabaseContext.tableName}". Aksi terakhir: ${runtimeHints.pendingDatabaseContext.lastAction}.`);
    }
    if (runtimeHints.pendingCalendarContext) {
      lines.push(`- Status: Sedang memproses pembuatan jadwal kalender "${runtimeHints.pendingCalendarContext.summary}".`);
    }
    if (runtimeHints.pendingVaultContext) {
      lines.push(`- Status: Sedang memproses unggahan dokumen/gambar ke 2nd Brain Vault.`);
    }
    if (runtimeHints.conversationContext) {
      const ctx = runtimeHints.conversationContext;
      if (ctx.intent) lines.push(`- Intent Sebelumnya: ${ctx.intent}`);
      if (ctx.extractedData) {
        const miniData = JSON.stringify(ctx.extractedData);
        if (miniData.length < 500) lines.push(`- Data Aktif Terakhir: ${miniData}`);
      }
      if (ctx.lastAssistantReply) {
        lines.push(`- Pesan terakhir N.E.X.A: "${ctx.lastAssistantReply}"`);
      }
    }
    if (lines.length > 0) {
      runtimeContextBlock = `\n[STATUS AKTIF N.E.X.A SAAT INI (SANGAT PENTING UNTUK FOLLOW-UP)]\n${lines.join('\n')}\n`;
    }
  }

  // ── Build Sentiment Instruction Block ─────────────────────────────────────
  let sentimentBlock = '';
  if (_sentimentScore === 'STRESSED') {
    sentimentBlock = `\n[DETEKSI EMOSI TUAN FAQIH — WAJIB DIPATUHI]\nAnalisis gaya penulisan menunjukkan Tuan sedang TERBURU-BURU atau STRES. Respons N.E.X.A harus: (1) SUPER SINGKAT — max 3 kalimat, (2) Tidak ada basa-basi panjang, (3) Langsung ke inti, (4) Nada hangat dan suportif.\n`;
  } else if (_sentimentScore === 'CASUAL') {
    sentimentBlock = `\n[DETEKSI EMOSI TUAN FAQIH]\nTuan sedang santai. Boleh sedikit lebih hangat dan conversational dalam respons.\n`;
  }

  const prompt = `
[WAKTU SERVER SAAT INI (ASIA/JAKARTA)]
${currentJakartaTime}
ISO Date Hari Ini: ${currentJakartaISO}
${miniCalStr ? `
[KALENDER REFERENSI${hasCal ? ' — 7 HARI KE DEPAN' : ''}]
${miniCalStr}
(Gunakan tabel di atas sebagai acuan mutlak. Jika user menyebut nama hari seperti "Jumat" atau "Senin depan", cocokkan dengan baris yang tepat.)
` : ''}
${factsContext}${activeAccountsBlock}${activeCategoriesBlock}${sentimentBlock}${crossDomainBlock}
[RIWAYAT KONTEKS RUNTIME]
${runtimeContextBlock || '[Tidak ada konteks runtime tambahan]'}

[RIWAYAT OBROLAN]
${_applyTokenBudgetGuard(factsContext + activeAccountsBlock + activeCategoriesBlock + sentimentBlock + crossDomainBlock + runtimeContextBlock, contextStr, ROUTER_SYSTEM_PROMPT)}

[PESAN TERBARU TUAN FAQIH]
${textInput}

Tentukan intent dan ekstrak data!
`;

  // 4. Execute Cognitive Routing (Medium Temperature = 0.3)
  let resultJsonStr = await executeWithFallback(prompt, ROUTER_SYSTEM_PROMPT, 0.3, true, { userText: textInput });


  // Clean markdown block if GenAI decides to return it despite instructions
  let cleanStr = resultJsonStr.replace(/```json/gi, '').replace(/```/g, '').trim();
  const firstBrace = cleanStr.indexOf('{');
  const lastBrace = cleanStr.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    cleanStr = cleanStr.substring(firstBrace, lastBrace + 1);
  }

  try {
    const routingData = JSON.parse(cleanStr);
    const detectedMood = (_sentimentScore !== 'NEUTRAL') ? _sentimentScore : (routingData.mood || 'NEUTRAL');
    routingData.mood = String(detectedMood).toUpperCase();
    return routingData;
  } catch (err) {
    // Smart repair: try extracting the first complete balanced JSON object ignoring trailing junk
    try {
      let depth = 0, inString = false, escape = false, endIdx = -1;
      for (let i = firstBrace; i < cleanStr.length; i++) {
        const c = cleanStr[i];
        if (escape) { escape = false; continue; }
        if (c === '\\') { escape = true; continue; }
        if (c === '"') { inString = !inString; continue; }
        if (!inString) {
          if (c === '{') depth++;
          else if (c === '}') {
            depth--;
            if (depth === 0) { endIdx = i; break; }
          }
        }
      }
      if (endIdx !== -1) {
        const repaired = cleanStr.substring(firstBrace, endIdx + 1);
        const routingData = JSON.parse(repaired);
        const detectedMood = (_sentimentScore !== 'NEUTRAL') ? _sentimentScore : (routingData.mood || 'NEUTRAL');
        routingData.mood = String(detectedMood).toUpperCase();
        console.log('[ROUTER] Smart JSON Repair SUCCESS after trailing garbage');
        return routingData;
      }
    } catch (_) {}

    console.error('[ROUTER] JSON Parse Error:', err.message, resultJsonStr);
    return {
      intent: 'ERROR',
      reply_message: 'Maaf Tuan, saya mengalami disonansi kognitif saat memproses instruksi tersebut.',
      mood: _sentimentScore
    };
  }
}

/**
 * Lightweight one-shot AI call for synthesis tasks (non-JSON).
 * Used by: cron.js (Midday Pulse, Evening Debrief, Tomorrow Prep, Weekly Review),
 * and any module that needs a plain-text AI response.
 * @param {string} prompt - The task/user prompt
 * @returns {Promise<string>} - Plain text response from AI
 */
const PLAIN_TEXT_SYSTEM_PROMPT = `You are N.E.X.A, the personal AI executive assistant to Tuan Faqih Hidayatulloh.
MANDATORY ADDRESS RULE: ALWAYS address and refer to the user strictly as "Tuan" or "Tuan Faqih". STRICTLY FORBIDDEN to address or refer to him as "Bapak", "Mas", or "Anda" in any context!
Communicate in natural, elegant, warm, and sophisticated Indonesian (Jarvis-style executive aide).
Reply ONLY in plain text. DO NOT use JSON formatting. DO NOT use markdown **bold** or *italic*.
Keep responses informative, concise, and high-signal.`;

async function callAI(prompt) {
  const result = await executeWithFallback(prompt, PLAIN_TEXT_SYSTEM_PROMPT, 0.5, false);
  let text = String(result).trim();
  // If the model wrapped its answer in JSON anyway, extract the first string value
  try {
    const parsed = JSON.parse(text);
    const firstVal = Object.values(parsed).find(v => typeof v === 'string');
    if (firstVal) text = firstVal;
  } catch (_) { /* Not JSON, already plain text — good */ }
  return text;
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
      const match = decision.match(/REINFORCE\s+(\d+)/i);
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
      const match = decision.match(/SUPERSEDE\s+(\d+)/i);
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
    const supabaseMem = require('../infrastructure/Supabase_Memories');

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
      const keyMatch = decision.match(/UPDATE\s+([a-zA-Z0-9_]+)/i);
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
  routeUserMessage,
  // ── Cache Management ─────────────────────────────────────────
  invalidatePersonalFactsCache,
  invalidateIdentityModelCache,      // [PHASE 6] Dipanggil dari webhook.js setelah Approve
  // ── AI Utilities ─────────────────────────────────────────────
  deduplicateAndSaveFact,
  deduplicateAndSaveSelfFact,        // [PHASE 8] Dedup engine untuk nexa_self_model
  callAI,
  classifyPendingTransactionIntent,
  classifyYesNo,
  analyzeSystemLogs,
  // ── Selectors (untuk testing / external use) ─────────────────
  selectUserProfileFacts: _selectUserProfileFacts,
  selectCoreIdentityFacts: _selectCoreIdentityFacts,
  selectVaultFacts: _selectVaultFacts,
  // [PHASE 6] Identity helpers (untuk testing)
  detectTopicContext: _detectTopicContext,
  buildIdentityContextBlock: _buildIdentityContextBlock,
};
