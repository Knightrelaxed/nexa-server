const { executeWithFallback } = require('./Fallback_Engine');
const supabaseMemories = require('../infrastructure/Supabase_Memories');
const { NEXA_PERSONALITY } = require('../config/personality');



// ============================================================
// ADAPTIVE HISTORY — dynamic fetch limit based on context
// Normal: 6 exchanges (12 msg) | Context-ref detected: 8 exchanges (16 msg)
// ============================================================
const CONTEXTUAL_REF_WORDS = [
  'yang tadi', 'sebelumnya', 'lanjut', 'ubah itu', 'yang barusan',
  'tadi bilang', 'hapus yang', 'yang itu', 'edit itu', 'hapus itu',
];
const HISTORY_CHAR_CAP = 5000; // ~1.200 token safety net

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
  'tugas hari ini', 'deadline', 'jadwal hari'
];

// ============================================================
// PROGRESSIVE FACT INJECTION
// ============================================================
const PROFILE_CORE_COUNT  = 10; // 10 fakta profil tetap — selalu diinjeksi
const PROFILE_KW_LIMIT    = 15; // max fakta tambahan dari dynamic word resonance
const IDENTITY_CORE_COUNT = 10; // 10 identitas pokok — selalu diinjeksi
const IDENTITY_KW_LIMIT   = 15; // max kamus log/teknis tambahan dari penyaringan

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

const ROUTER_SYSTEM_PROMPT = `
${NEXA_PERSONALITY}

[COGNITIVE & ROUTING TASKS]
Analyze user message, chat history, and context. Determine ABSOLUTE INTENT and output ONLY valid JSON.

RULES:
1. FINANCE: NEVER use INCOMPLETE_INFO. If missing details, use action RECORD with description '-'.
2. FINANCE UPDATE_PENDING: ONLY output fields explicitly mentioned. Leave others null.
3. CONTEXT INFERENCE: For follow-ups ("iya", "lanjut", "ubah harganya", "hapus itu"), infer action from [STATUS AKTIF]. DO NOT default to NORMAL_CHAT.
4. DATABASE: STRICTLY for Supabase tables. NEVER use for "Buku kas" (use FINANCE).
5. PASSIVE LEARNING:
   - "learned_user_facts": ONLY facts about TUAN FAQIH (hobbies, habits, preferences).
   - "learned_core_identities": ONLY facts about N.E.X.A ITSELF (creation date, rules, capabilities).
6. ISO DATES: 'start' & 'end' MUST be ISO 8601 +07:00.
7. LANGUAGE: Output JSON keys/values in English, EXCEPT "reply_message" MUST be in natural Indonesian addressing Tuan Faqih.
8. PROACTIVE MEMORY (NORMAL_CHAT): Weave Tuan Faqih's facts naturally and offer relevant assistance when appropriate.
9. REPLY LABELS: [KONTEKS_AKSI] = act on referenced item. [KONTEKS_REFERENSI] = reference only.
10. SEMANTIC CATEGORY MAPPING (FINANCE): WAJIB gunakan kategori terdaftar pada blok [KATEGORI TRANSAKSI AKTIF].
11. Payment Method Extraction: "QRIS", "Transfer bank", "Kartu Kredit", "Tunai", or null.

OUTPUT JSON FORMAT:
{
  "reasoning": "1 sentence logical analysis.",
  "intent": "FINANCE|CALENDAR|TASK|EMAIL|DATABASE|WEB_SEARCH|DISCIPLINE|2ND_BRAIN|USER_PROFILE|CORE_IDENTITY|DIAGNOSE_SYSTEM|INCOMPLETE_INFO|NORMAL_CHAT",
  "reply_message": "Natural Indonesian response (mandatory for NORMAL_CHAT, INCOMPLETE_INFO, DISCIPLINE).",
  "learned_user_facts": [],
  "learned_core_identities": [],
  "extracted_data": {
    // FINANCE: { action: "RECORD|RECORD_MULTIPLE|READ_LATEST|READ_ANALYTICS|EDIT|DELETE|UNDO_DELETE|IMPORT_FROM_EMAIL|CONFIRM_TRANSACTION|UPDATE_PENDING|CANCEL_TRANSACTION|CATEGORY_BREAKDOWN|PERIOD_COMPARISON|TOP_EXPENSES|ACCOUNT_BALANCES|DAILY_TREND|SMART_SUMMARY|MONTHLY_SUMMARY|SAVING_RATE|BALANCE_TREND", nominal: number, type: "INCOME|EXPENSE", destination: string, category: string, description: string, time: "ISO+07:00", account: string, payment_method: string, search_keyword: string, date_text: string, limit: number, is_split: boolean, store_name: string, items: [] }
    // CALENDAR: { action: "CREATE|DELETE|UPDATE|READ|READ_TODAY|READ_TOMORROW|READ_UPCOMING", summary, start: "ISO+07:00", end: "ISO+07:00", description, eventId, location }
    // TASK: { action: "CREATE|CREATE_SUBTASK|CREATE_MULTIPLE|READ|READ_LIST|READ_TODAY|COMPLETE|DELETE|EDIT|MOVE", title, due_date: "ISO+07:00|null", calendar_start_time: "ISO+07:00|null", sync_calendar: boolean|null, duration_minutes: number|null }
    // EMAIL: { action: "READ|SEND|DELETE", search_keyword, to, subject, content }
    // DATABASE: { action: "LIST_TABLES|READ_TABLE|INSERT_ROW|UPDATE_ROW|DELETE_ROW|DELETE_ALL_ROWS|CANCEL_ACTION", table_name, row_id, search_keyword }
    // 2ND_BRAIN: { action: "APPEND|READ|EDIT|DELETE", title, content, search_keyword }
    // USER_PROFILE: { action: "APPEND|READ|DELETE", content, search_keyword }
    // CORE_IDENTITY: { action: "APPEND|READ|DELETE", content, search_keyword }
    // WEB_SEARCH: { query, type: "search|news" }
    // DIAGNOSE_SYSTEM: { action: "READ_LOGS", search_keyword }
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
  // If it contains rush words, lots of typos (heuristic: repeated letters/caps), or exclamation marks
  const rushWords = ['cepet', 'buruan', 'darurat', 'penting', 'sekarang', 'urgent', 'gawat'];
  const hasRush = rushWords.some(w => str.includes(w));
  const hasExclamation = (text.match(/!/g) || []).length >= 2;
  const isAllCaps = text.length > 5 && text === text.toUpperCase();

  if (hasRush || hasExclamation || isAllCaps) return 'STRESSED';

  const casualWords = ['santai', 'nggak buru', 'nanti aja', 'kalo sempet', 'haha', 'wkwk'];
  const isCasual = casualWords.some(w => str.includes(w));
  if (isCasual) return 'CASUAL';

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

  // 1. Load personal facts (from cache — zero overhead after first call)
  const personalFacts = await loadPersonalFactsWithCache();

  // 2. Contextual Retrieval — dynamic limit (Step 3: Adaptive History)
  const _fetchLimit = _hasContextRef ? 16 : 12;
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
${contextStr}

[PESAN TERBARU TUAN FAQIH]
${textInput}

Tentukan intent dan ekstrak data!
`;

  // 4. Execute Cognitive Routing (Medium Temperature = 0.3)
  let resultJsonStr = await executeWithFallback(prompt, ROUTER_SYSTEM_PROMPT, 0.3);

  // Clean markdown block if GenAI decides to return it despite instructions
  let cleanStr = resultJsonStr.replace(/```json/gi, '').replace(/```/g, '').trim();
  const firstBrace = cleanStr.indexOf('{');
  const lastBrace = cleanStr.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    cleanStr = cleanStr.substring(firstBrace, lastBrace + 1);
  }

  try {
    const routingData = JSON.parse(cleanStr);

    // 5. Save new memory ONLY after successful parse (symmetric context)
    // We only save the user's input here. The final reply (domainReply or reply_message)
    // will be saved by the caller (e.g. webhook.js) to ensure we don't save duplicate "draft" messages.

    return routingData;
  } catch (err) {
    console.error('[ROUTER] JSON Parse Error:', err.message, resultJsonStr);
    return {
      intent: 'ERROR',
      reply_message: 'Maaf Tuan, saya mengalami disonansi kognitif saat memproses instruksi tersebut.'
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

/**
 * Smart Deduplication System
 * Compares newFact with existing facts.
 */
async function deduplicateAndSaveFact(newFact, type = 'USER_PROFILE') {
  const existingFactsObj = await loadPersonalFactsWithCache();
  const existingFacts = type === 'USER_PROFILE' ? existingFactsObj.userProfile : existingFactsObj.coreIdentity;
  
  if (!existingFacts || existingFacts.length === 0) {
    if (type === 'USER_PROFILE') await supabaseMemories.saveUserProfile(newFact);
    else await supabaseMemories.saveCoreIdentity(newFact);
    return true;
  }

  const prompt = `EXISTING FACTS:\n${existingFacts.map((f, i) => `[${i}] ${f}`).join('\n')}\n\nNEW FACT: "${newFact}"\n\nTASK: Compare NEW FACT against EXISTING FACTS. Reply ONLY with:\n- "NEW": If totally new.\n- "UPDATE [ID]": If more detailed/complete than fact [ID].\n- "DUPLICATE": If exact match or less detailed.`;

  const result = await executeWithFallback(prompt, "Reply strictly in requested format.", 0.1, false);
  const decision = String(result).trim().toUpperCase();

  if (decision.startsWith('NEW')) {
    if (type === 'USER_PROFILE') await supabaseMemories.saveUserProfile(newFact);
    else await supabaseMemories.saveCoreIdentity(newFact);
    return true;
  } else if (decision.startsWith('UPDATE')) {
    const match = decision.match(/UPDATE\s+(\d+)/);
    if (match) {
      const idx = parseInt(match[1], 10);
      if (existingFacts[idx]) {
        if (type === 'USER_PROFILE') {
          await supabaseMemories.deleteFromUserProfile(existingFacts[idx]);
          await supabaseMemories.saveUserProfile(newFact);
        } else {
          await supabaseMemories.deleteFromCoreIdentity(existingFacts[idx]);
          await supabaseMemories.saveCoreIdentity(newFact);
        }
        return true;
      }
    }
    // Fallback if regex fails
    if (type === 'USER_PROFILE') await supabaseMemories.saveUserProfile(newFact);
    else await supabaseMemories.saveCoreIdentity(newFact);
    return true;
  } else {
    console.log(`[ROUTER] Deduplication: Skipped duplicate fact - ${newFact}`);
    return false;
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

module.exports = { routeUserMessage, invalidatePersonalFactsCache,
  deduplicateAndSaveFact, callAI, classifyPendingTransactionIntent, classifyYesNo, analyzeSystemLogs,
  selectUserProfileFacts: _selectUserProfileFacts,
  selectCoreIdentityFacts: _selectCoreIdentityFacts
};
