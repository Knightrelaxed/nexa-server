/**
 * ============================================================
 * [N.E.X.A] router/Router_Dispatcher.js
 * Orkestrator utama routeUserMessage: reflex, gating, hidrasi cache, prompt, eksekusi LLM
 *
 * Bagian dari modularisasi AI_Router.js (facade: ../AI_Router.js).
 * Kode dipindahkan verbatim oleh scripts/refactor/split_supabase_memories.js;
 * satu-satunya perubahan adalah jalur require relatif (+1 level).
 * ============================================================
 */

const { executeWithFallback } = require('../Fallback_Engine');
const supabaseMemories = require('../../infrastructure/Supabase_Memories');
const { VERSION, SYSTEM_NAME } = require('../../config/version');
const geminiVectorCache = require('../../utils/gemini_vector_cache');
const presenceModel = require('../../domain/Presence_Model');
const { detectTopicContext: _detectTopicContext } = require('../Topic_Classifier');
const { loadPersonalFactsWithCache, loadIdentityModelWithCache, loadSelfModelWithCache } = require('./Router_Cache');
const { _normalizeRoutingOutput, _cleanEmDashes } = require('./Router_Output');
const { _isReflexMessage, _detectCandidateDomains, _detectSentiment, _preflightClassify } = require('./Router_Classifier');
const { PROFILE_KW_LIMIT, IDENTITY_KW_LIMIT, _selectUserProfileFacts, _selectCoreIdentityFacts, _selectVaultFacts } = require('./Router_Selectors');
const { HISTORY_CHAR_CAP, _applyTokenBudgetGuard, _buildIdentityContextBlock, formatTimeWIB, REFLEX_SYSTEM_PROMPT, buildRouterSystemPrompt } = require('./Router_Prompts');
const { analyzeSystemLogs } = require('./Router_Utilities');

// ============================================================
// ADAPTIVE HISTORY — dynamic fetch limit based on context
// Normal: 6 exchanges (12 msg) | Context-ref detected: 10 exchanges (20 msg)
// ============================================================
const CONTEXTUAL_REF_WORDS = [
  'yang tadi', 'sebelumnya', 'lanjut', 'ubah itu', 'yang barusan',
  'tadi bilang', 'hapus yang', 'yang itu', 'edit itu', 'hapus itu',
];

async function _handleReflexRouting(textInput, runtimeHints = {}) {
  let contextStr = '[Tidak ada riwayat obrolan sebelumnya]';
  try {
    const rawMemories = await supabaseMemories.getRecentMemories(4);
    if (rawMemories && rawMemories.length > 0) {
      contextStr = rawMemories.map(m => {
        const timeStr = formatMemoryTime(m.created_at);
        const platform = (m.platform || 'telegram').toUpperCase();
        return `[${timeStr} | via ${platform}] [${m.role.toUpperCase()}]: ${m.content}`;
      }).join('\n');
    }
  } catch (_) {}

  const _now = new Date();
  const _jkt = new Date(_now.getTime() + 7 * 60 * 60 * 1000);
  const _DAYS = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
  const _MONTHS = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
  const currentJakartaTime =
    `${_DAYS[_jkt.getUTCDay()]}, ${_jkt.getUTCDate()} ${_MONTHS[_jkt.getUTCMonth()]} ${_jkt.getUTCFullYear()} ` +
    `pukul ${String(_jkt.getUTCHours()).padStart(2, '0')}:${String(_jkt.getUTCMinutes()).padStart(2, '0')} WIB`;

  const reflexPresenceContext = presenceModel.toPromptBlock ? presenceModel.toPromptBlock() : '';

  const reflexPrompt = `
[WAKTU SERVER SAAT INI (ASIA/JAKARTA)]
${currentJakartaTime}
${reflexPresenceContext}

[RIWAYAT OBROLAN SINGKAT]
${contextStr}

[PESAN TERBARU TUAN FAQIH]
${textInput}

Berikan respons refleks dalam format JSON!
`;

  const resultJsonStr = await executeWithFallback(reflexPrompt, REFLEX_SYSTEM_PROMPT, 0.3, true, { userText: textInput });
  let cleanStr = resultJsonStr.replace(/```json/gi, '').replace(/```/g, '').trim();
  const firstBrace = cleanStr.indexOf('{');
  const lastBrace = cleanStr.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    cleanStr = cleanStr.substring(firstBrace, lastBrace + 1);
  }

  let routingData = null;
  try {
    routingData = JSON.parse(cleanStr);
  } catch (parseErr) {
    console.warn('[AI_ROUTER] Reflex JSON parse failed, falling back to full router:', parseErr.message);
    return null;
  }

  routingData.intent = 'NORMAL_CHAT';
  routingData.actions = [{ intent: 'NORMAL_CHAT', extracted_data: {} }];
  routingData.mood = (routingData.mood || 'NEUTRAL').toUpperCase();
  routingData.extracted_data = routingData.extracted_data || {};
  routingData.god_mode_trigger = false;
  if (typeof routingData.reply_message === 'string') {
    routingData.reply_message = _cleanEmDashes(routingData.reply_message);
  }
  return routingData;
}

async function _fetchRecentFinanceSummary(limit) {
  try {
    const financeEngine = require('../../domain/Finance_Engine');
    const summary = await financeEngine.getRecentTransactions(limit);
    if (!summary || summary.includes('(Tidak ada transaksi')) return null;
    return summary;
  } catch (e) {
    return null;
  }
}

async function _fetchUpcomingEventsSummary(limit = 3) {
  try {
    const googleWorkspace = require('../../infrastructure/Google_Workspace');
    const items = await googleWorkspace.getTodaysEvents();
    if (!Array.isArray(items) || items.length === 0) return null;

    const nowMs = Date.now();
    const futureOrOngoing = items
      .filter(ev => {
        const endStr = ev.end?.dateTime || ev.end?.date;
        return endStr ? new Date(endStr).getTime() >= nowMs : true;
      })
      .slice(0, limit);

    if (futureOrOngoing.length === 0) return null;
    return futureOrOngoing.map(e => e.summary || '(Tanpa Judul)').join(', ');
  } catch (e) {
    return null;
  }
}

async function _fetchTodaysRawEvents() {
  try {
    const googleWorkspace = require('../../infrastructure/Google_Workspace');
    const items = await googleWorkspace.getTodaysEvents();
    return Array.isArray(items) ? items : [];
  } catch (_) {
    return [];
  }
}

/**
 * Route incoming natural language (text) from user
 */
async function routeUserMessage(textInput, runtimeHints = {}) {
  // ── Sentiment Detection (Empathy Layer) ──────────────────────────────────
  // Silently score user's stress/urgency from writing style.
  // We do NOT call AI for this — it's pure heuristic (zero latency).
  const situationalSynthesizer = require('../../domain/Situational_Synthesizer');
  const rawSentiment = _detectSentiment(textInput);
  if (rawSentiment && rawSentiment !== 'NEUTRAL') {
    situationalSynthesizer.recordTurnEmotion(rawSentiment, textInput);
  }
  const activeInertia = situationalSynthesizer.getActiveEmotionalInertia();
  const _sentimentScore = (rawSentiment === 'NEUTRAL' || !rawSentiment) && activeInertia
    ? activeInertia.mood
    : rawSentiment;

  // ── Pre-flight Domain Classifier (0 tokens, 0ms) ─────────────────────────
  const { hasTime, hasCal } = _preflightClassify(textInput);
  const _hasContextRef = CONTEXTUAL_REF_WORDS.some(kw => textInput.toLowerCase().includes(kw));

  // ── Log Analysis Intent Detection (Universal — works on all interfaces) ───
  const isVisionInput = textInput.includes('[SISTEM PENGLIHATAN N.E.X.A');
  const textToCheck = isVisionInput
    ? (textInput.match(/Konteks\/Caption dari Tuan Faqih:\s*"([^"]*)"/i)?.[1] || '')
    : textInput;

  // Strict log diagnosis regex with word boundaries \b to avoid matching "logo", "dialog", "katalog", "teknologi"
  const isLogRequest = !isVisionInput && (
    /\b(?:cek|analisis|lihat|baca|periksa|diagnosa|mana)\s+(?:system\s+|server\s+)?(?:log|logs|telemetri|telemetry)\b/i.test(textToCheck) ||
    (/\b(?:log|logs)\b/i.test(textToCheck) && /\b(?:server|sistem|kontainer|space|crash|error|telemetri)\b/i.test(textToCheck))
  );

  if (isLogRequest) {
    console.log('[ROUTER] 🔍 Log Analysis Intent Detected (DIAGNOSE_SYSTEM)');
    const logger = require('../../utils/logger');
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

  // ── Reflex Fast-Path (Instant Micro-Prompt for Greetings/Acknowledgements) ──
  const _isReflex = _isReflexMessage(textInput, runtimeHints);
  if (_isReflex) {
    console.log('[ROUTER] ⚡ Reflex Fast-Path triggered for:', JSON.stringify(textInput));
    try {
      const reflexResult = await _handleReflexRouting(textInput, runtimeHints);
      if (reflexResult) {
        return reflexResult;
      }
    } catch (reflexErr) {
      console.warn('[ROUTER] Reflex Fast-Path error, falling back to full router:', reflexErr.message);
      // Fail-open: continue to standard routing
    }
  }

  // ── Candidate Domains Detection (Fail-Open Union Gating) ──
  const _candidateDomains = _detectCandidateDomains(textInput, runtimeHints);
  const _loadFinanceContext = _candidateDomains === 'ALL' || _candidateDomains.has('FINANCE');
  const _loadCalendarContext = _candidateDomains === 'ALL' || _candidateDomains.has('CALENDAR') || hasCal;

  // 1. Load personal facts (from cache: zero overhead after first call)
  const personalFacts = await loadPersonalFactsWithCache();

  // [PHASE 6] 1.5. Load Identity Model (from cache: zero overhead after first call)
  // Berjalan paralel dengan langkah berikutnya untuk efisiensi maksimal
  const [_, identityModel] = await Promise.allSettled([
    Promise.resolve(), // placeholder
    loadIdentityModelWithCache()
  ]);
  const _identityModel = identityModel.status === 'fulfilled' ? (identityModel.value || {}) : {};

  // 2. Contextual & Semantic Retrieval: Masked Parallel Execution (Step 3: Zero Added Latency)
  const _fetchLimit = _hasContextRef ? 20 : 12;

  const [_rawMemories, semanticMatches] = await Promise.all([
    supabaseMemories.getRecentMemories(_fetchLimit).catch(e => {
      console.error('[ROUTER] Memory fetch error:', e.message);
      return [];
    }),
    geminiVectorCache.isSnapshotReady()
      ? geminiVectorCache.getRelevantFacts(textInput, {
        topKProfile: PROFILE_KW_LIMIT,
        topKIdentity: IDENTITY_KW_LIMIT,
        minScore: 0.58
      }).catch(e => {
        console.warn('[ROUTER] Semantic retrieval warning:', e.message);
        return { profileFacts: [], identityFacts: [] };
      })
      : Promise.resolve({ profileFacts: [], identityFacts: [] })
  ]);

  if (semanticMatches?.stats?.matchedProfileCount > 0 || semanticMatches?.stats?.matchedIdentityCount > 0) {
    console.log(`[ROUTER] 🎯 Gemini Semantic matched: ${semanticMatches.stats.matchedProfileCount} profiles, ${semanticMatches.stats.matchedIdentityCount} identities (${semanticMatches.stats.latencyMs} ms parallel).`);
  }

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
      } else { continue; }
    }
    if (_kept.length > 0 && _kept[0].role === 'nexa') _kept.shift();
    _memories = _kept;
    console.log(`[ROUTER] History trimmed by char cap: ${_rawMemories.length}msg/${_totalHistChars}ch → ${_memories.length}msg/${_chars}ch`);
  }

  // Helper untuk formatting waktu WIB dan isolasi temporal riwayat obrolan
  const formatMemoryTime = (isoStr) => {
    if (!isoStr) return 'Unknown Time';
    try {
      const d = new Date(isoStr);
      if (isNaN(d.getTime())) return 'Unknown Time';
      const tzDate = new Date(d.getTime() + 7 * 60 * 60 * 1000);
      const DD = String(tzDate.getUTCDate()).padStart(2, '0');
      const MM = String(tzDate.getUTCMonth() + 1).padStart(2, '0');
      const HH = String(tzDate.getUTCHours()).padStart(2, '0');
      const MIN = String(tzDate.getUTCMinutes()).padStart(2, '0');
      const nowJkt = new Date(Date.now() + 7 * 60 * 60 * 1000);
      const nowDayNum = Math.floor(nowJkt.getTime() / 86400000);
      const msgDayNum = Math.floor(tzDate.getTime() / 86400000);
      const dayDiff = nowDayNum - msgDayNum;
      if (dayDiff <= 0) {
        return `HARI INI ${HH}:${MIN} WIB`;
      } else if (dayDiff === 1) {
        return `KEMARIN (${DD}/${MM}) ${HH}:${MIN} WIB`;
      } else {
        return `MASA LALU — ${dayDiff} HARI LALU (${DD}/${MM}) ${HH}:${MIN} WIB`;
      }
    } catch (_) {
      return 'Unknown Time';
    }
  };

  const contextStr = _memories.length > 0
    ? _memories.map(m => {
      const timeStr = formatTimeWIB(m.created_at);
      const platform = (m.platform || 'telegram').toUpperCase();
      return `[${timeStr} | via ${platform}] [${m.role.toUpperCase()}]: ${m.content}`;
    }).join('\n')
    : '[Tidak ada riwayat obrolan sebelumnya]';

  // 3. Build personal facts context block (Step 4: Progressive userProfile injection)
  let factsContext = '';
  const _selectedProfile = _selectUserProfileFacts(personalFacts.userProfile, textInput, semanticMatches?.profileFacts);
  if (_selectedProfile.length > 0) {
    factsContext += `\n[FAKTA PERMANEN TENTANG TUAN FAQIH — SELALU INGAT INI]\n${_selectedProfile.map((f, i) => `${i + 1}. ${f}`).join('\n')}\n`;
  }
  if (personalFacts.coreIdentity && personalFacts.coreIdentity.length > 0) {
    const _selectedIdentity = _selectCoreIdentityFacts(personalFacts.coreIdentity, textInput, semanticMatches?.identityFacts);
    factsContext += `\n[CORE IDENTITY & ATURAN SIKAP N.E.X.A — PATUHI INI]\n${_selectedIdentity.map((f, i) => `${i + 1}. ${f}`).join('\n')}\n`;
  }

  // [PHASE 8] Inject top 5 N.E.X.A Self-Model facts dari RAM Cache (0 ms)
  try {
    const _selfModelFacts = await loadSelfModelWithCache(5);
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
      factsContext += `\n[ARSIP DOKUMEN DIGITAL TERSIMPAN (KATALOG RINGKAS — DETAIL DIMUAT ON-DEMAND)]\n${_selectedVault.map((f, i) => `${i + 1}. ${f}`).join('\n')}\n`;
    }
  }

  // [PHASE 11] Episodic Memory Context Injection (>90 hari)
  try {
    const episodicRecall = require('../../domain/Episodic_Recall');
    // Universal Retrospective Query Pattern: Retrospective markers, natural dates (12 months), relative time, or nostalgic questions
    const RETROSPECTIVE_QUERY_REGEX = /\b(dulu|waktu itu|kala itu|tempo hari|lampau|masa lalu|sebelumnya|pernah|ingat|inget|kenang|riwayat|catatan lama|arsip|obrolan lama|chat lama|percakapan lama|bulan lalu|tahun lalu|minggu lalu|kemarin lusa|waktu kita|pas kita|waktu aku|pas aku|kapan kita|kapan aku)\b|\b\d{1,2}\s+(januari|februari|maret|april|mei|juni|juli|agustus|september|oktober|november|desember|jan|feb|mar|apr|may|jun|jul|ags|agu|sep|okt|nov|des)\b|\b\d+\s+(hari|minggu|bulan|tahun)\s+(lalu|kemarin|yang lalu)\b|\b(202\d-\d{2}-\d{2})\b/i;
    
    if (RETROSPECTIVE_QUERY_REGEX.test(textInput)) {
      const recalled = await episodicRecall.searchMemories(textInput, 3);
      if (recalled && recalled.length > 0) {
        const recLines = recalled.map(r => `• [${r.narrative_date} (${r.day_name})]: ${r.narrative}`);
        factsContext += `\n[ARSIP MEMORI EPISODIK MASA LALU (>90 HARI) — GUNAKAN UNTUK MENJAWAB PERTANYAAN MASA LALU]\n${recLines.join('\n\n')}\n`;
        console.log(`[ROUTER] Injected ${recalled.length} episodic memory narrative(s) for query: "${textInput.substring(0, 40)}"`);
      }
    }
  } catch (epErr) {
    // Non-blocking
  }

  // [PHASE 6] 3.5. Build Targeted Identity Layer Injection
  // Deteksi konteks topik dari pesan user dan pilih layer identitas yang paling relevan.
  // Prinsip: injeksi selektif — hanya layer yang dibutuhkan, bukan semua 7 layer sekaligus.
  const _topicContext = _detectTopicContext(textInput);
  const _injectedTraitsList = [];
  const _identityContextBlock = _buildIdentityContextBlock(_identityModel, _topicContext, _injectedTraitsList);
  if (_identityContextBlock) {
    factsContext += _identityContextBlock;
    console.log(`[ROUTER] Identity injection: context=${_topicContext}, layers=${Object.keys(_identityModel).filter(l => _identityContextBlock.includes(l)).join(',')}`);
  }

  // [v3.3] 3.6. Inject Procedural Playbook per Intent/Topic (Memori Prosedural)
  let _activePlaybook = null;
  let _playbookBlock = '';
  try {
    const playbookEngine = require('../../domain/Playbook_Engine');
    _activePlaybook = await playbookEngine.getPlaybookForIntent(_topicContext);
    if (_activePlaybook && _activePlaybook.rendered) {
      _playbookBlock = await playbookEngine.formatPlaybookContextBlock(_topicContext);
      if (_playbookBlock) {
        console.log(`[ROUTER] Playbook injected: intent=${_activePlaybook.intent} (v${_activePlaybook.version})`);
        playbookEngine.recordPlaybookUse(_activePlaybook); // [v3.3.2] fire-and-forget usage counter
      }
    }
  } catch (_pbErr) {
    // Non-blocking
  }

  // 3.5. Inject Current Jakarta Time — 100% pure UTC+7 math (immune to OS/HuggingFace timezone bugs)
  const _now = new Date();
  const _jkt = new Date(_now.getTime() + 7 * 60 * 60 * 1000); // Shift to WIB
  const _DAYS = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
  const _MONTHS = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];

  const _jktYear = _jkt.getUTCFullYear();
  const _jktMonth = _jkt.getUTCMonth();
  const _jktDate = _jkt.getUTCDate();
  const _jktDay = _jkt.getUTCDay();
  const _jktHour = _jkt.getUTCHours();
  const _jktMin = _jkt.getUTCMinutes();

  const currentJakartaTime =
    `${_DAYS[_jktDay]}, ${_jktDate} ${_MONTHS[_jktMonth]} ${_jktYear} ` +
    `pukul ${String(_jktHour).padStart(2, '0')}:${String(_jktMin).padStart(2, '0')} WIB`;
  // ISO date string in Jakarta (for AI date arithmetic in TASK/CALENDAR intents)
  const currentJakartaISO = `${_jktYear}-${String(_jktMonth + 1).padStart(2, '0')}-${String(_jktDate).padStart(2, '0')}`;

  // [v3.3] 3.7. Inject Dialectic Stance Note (Honcho Dialectic adaptation, <= 60 tokens)
  let _stanceBlock = '';
  try {
    const dialecticEngine = require('../../domain/Dialectic_Engine');
    const _activeDirectives = (_injectedTraitsList || []).map(t => t.directive).filter(Boolean);
    _stanceBlock = dialecticEngine.getStanceNoteBlock({
      topicContext: _topicContext,
      jktHour: _jktHour,
      directives: _activeDirectives
    });
  } catch (_stanceErr) {
    // Non-blocking
  }

  // Build mini-calendar: conditionally gated by pre-flight classifier and domain
  const _calDays = _loadCalendarContext ? (hasCal ? 7 : (hasTime ? 3 : 0)) : 0;
  const _miniCal = [];
  for (let i = 0; i <= _calDays; i++) {
    const d = new Date(_jkt.getTime() + i * 86400000);
    const ds = `${_jktYear === d.getUTCFullYear() ? '' : d.getUTCFullYear() + '-'}${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
    const dayFull = `${_DAYS[d.getUTCDay()]}, ${d.getUTCDate()} ${_MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
    _miniCal.push(`  +${i} hari: ${dayFull} (ISO: ${ds})`);
  }
  const miniCalStr = _miniCal.join('\n');

  // ── Cross-Domain Fusion + Accounts Context ─────────────────────────────────
  // Silently pull recent finance + upcoming calendar data + active accounts list.
  // Runs in parallel: zero sequential latency penalty.
  let crossDomainBlock = '';
  let activeAccountsBlock = '';
  let activeCategoriesBlock = '';
  let rawEventsResult = null;
  try {
    const results = await Promise.allSettled([
      _fetchRecentFinanceSummary(3),
      _fetchUpcomingEventsSummary(3),
      _fetchTodaysRawEvents(),
      // Load daftar akun aktif dari Supabase Finance (hanya jika domain finance aktif)
      _loadFinanceContext ? (async () => {
        try {
          const supabaseFinance = require('../../infrastructure/Supabase_Finance');
          return await supabaseFinance.getAccountsList();
        } catch (_) { return []; }
      })() : Promise.resolve([]),
      // Load daftar kategori aktif dari Supabase Finance (hanya jika domain finance aktif)
      _loadFinanceContext ? (async () => {
        try {
          const supabaseFinance = require('../../infrastructure/Supabase_Finance');
          return await supabaseFinance.getCategoriesList();
        } catch (_) { return []; }
      })() : Promise.resolve([])
    ]);
    const recentTxResult = results[0];
    const upcomingEvResult = results[1];
    rawEventsResult = results[2];
    const accountsResult = results[3];
    const categoriesResult = results[4];
    const finLines = [];
    if (recentTxResult.status === 'fulfilled' && recentTxResult.value) {
      finLines.push(`Keuangan Terkini (3 terakhir): ${recentTxResult.value}`);
    }
    if (upcomingEvResult.status === 'fulfilled' && upcomingEvResult.value) {
      finLines.push(`Jadwal Mendatang: ${upcomingEvResult.value}`);
    }
    if (finLines.length > 0) {
      crossDomainBlock = `\n[DATA LINTAS DOMAIN: GUNAKAN UNTUK KONEKSI KONTEKS CERDAS]\n${finLines.join('\n')}\n`;
    }

    // Bangun blok akun aktif jika ada data
    if (accountsResult.status === 'fulfilled' && accountsResult.value && accountsResult.value.length > 0) {
      const accountLines = accountsResult.value.map(a => `- ${a.name} (${a.type})`).join('\n');
      activeAccountsBlock = `\n[AKUN KEUANGAN AKTIF: PAKAI NAMA PERSIS INI UNTUK FIELD "account" DI FINANCE]\n${accountLines}\nCatatan: Jika user menyebut nama akun/dompet/bank yang mirip salah satu di atas, petakan ke nama yang paling cocok.\n`;
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

      activeCategoriesBlock = `\n[ACTIVE TRANSACTION CATEGORIES: ABSOLUTE LIST FOR FINANCE "category" FIELD]\n${_catLines.join('\n')}\n\n[SUPER STRICT CATEGORY SELECTION GUIDELINES]\n1. EXACT CHARACTER MATCHING: You MUST copy EXACTLY one category name from the list above (case-sensitive, spaces, symbols). IT IS STRICTLY FORBIDDEN to hallucinate or invent categories that are not on the list (e.g., do not use "Makanan & Minuman" or "Perawatan & Kecantikan" if they are not listed).\n2. SEMANTIC REASONING: Ask "What is the SUBSTANCE/OBJECT being purchased?" then find the closest match ONLY in the active list.\n- Food/Drinks: If buying nasi, ayam, sate, dll, use "Makan Berat / Makan Luar". If buying camilan, kopi, boba, dll, use "Jajan / Ngopi / Kafe".\n- Services: If paying for laundry/cuci baju, use "Jasa Laundry".\n- Shopping: If buying sabun, beras at a minimarket, use "Bahan Makanan / Groceries".\n- Transportation: For Grab/Gojek, use "Ojek / Taksi Online" or "Transportasi Umum".\n- If there is absolutely no specific category that matches, use "Lainnya" (if available in the list).\n`;
    }
  } catch (_) { /* Non-critical: never crash routing */ }

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
    sentimentBlock = `\n[DETEKSI EMOSI TUAN FAQIH: WAJIB DIPATUHI]\nAnalisis gaya penulisan menunjukkan Tuan sedang TERBURU-BURU atau STRES. Respons N.E.X.A harus: (1) SUPER SINGKAT: max 3 kalimat, (2) Tidak ada basa-basi panjang, (3) Langsung ke inti, (4) Nada hangat dan suportif.\n`;
  } else if (_sentimentScore === 'CASUAL') {
    sentimentBlock = `\n[DETEKSI EMOSI TUAN FAQIH]\nTuan sedang santai. Boleh sedikit lebih hangat dan conversational dalam respons.\n`;
  }

  // ── Compile Selective System Prompt based on Candidate Domains ──────────
  const routerSystemPrompt = buildRouterSystemPrompt(_candidateDomains);
  let situationalBlock = '';
  const rawEvents = rawEventsResult && rawEventsResult.status === 'fulfilled' && Array.isArray(rawEventsResult.value)
    ? rawEventsResult.value
    : [];

  try {
    situationalBlock = situationalSynthesizer.buildSituationalPromptBlock({
      calendarEvents: rawEvents,
      nowMs: Date.now()
    });
  } catch (_) {}
  const presenceBlock = situationalBlock || (presenceModel.toPromptBlock ? presenceModel.toPromptBlock() : '');
  const _dynamicOperationalBlock = `${_playbookBlock || ''}${_stanceBlock || ''}`.trim();

  // [v3.3 CACHING & SALIENCE OPTIMIZATION]
  // Letakkan referensi stabil (kategori, akun, profil) dan riwayat obrolan di atas
  // agar prefix teks tetap stabil untuk implicit caching (Gemini / Groq).
  // Komponen temporal (waktu, kalender dinamis, playbook, stance) ditaruh di bawah tepat sebelum pesan user.
  const prompt = `
${activeAccountsBlock}${activeCategoriesBlock}
${factsContext}
[RIWAYAT KONTEKS RUNTIME]
${runtimeContextBlock || '[Tidak ada konteks runtime tambahan]'}

[RIWAYAT OBROLAN]
${_applyTokenBudgetGuard(factsContext + activeAccountsBlock + activeCategoriesBlock + sentimentBlock + crossDomainBlock + runtimeContextBlock, contextStr, routerSystemPrompt)}
(Catatan: Rujukan jadwal dan waktu hari ini adalah [TIMELINE AGENDA TUAN HARI INI]. Catatan berlabel [MASA LALU] adalah riwayat obrolan arsip dan dilarang dijadikan rujukan jadwal hari ini.)

[WAKTU SERVER SAAT INI (ASIA/JAKARTA)]
${currentJakartaTime}
ISO Date Hari Ini: ${currentJakartaISO}

[STATUS & VERSI SISTEM N.E.X.A SAAT INI]
Entitas: ${SYSTEM_NAME}
Versi Aktif: v${VERSION}
(Jika Tuan bertanya mengenai versimu saat ini, jawablah secara lugas bahwa kamu berada di versi v${VERSION}.)
${presenceBlock}${miniCalStr ? `
[KALENDER REFERENSI${hasCal ? ' (7 HARI KE DEPAN)' : ''}]
${miniCalStr}
(Gunakan tabel di atas sebagai acuan mutlak. Jika user menyebut nama hari seperti "Jumat" atau "Senin depan", cocokkan dengan baris yang tepat.)` : ''}${sentimentBlock}${crossDomainBlock}
${_dynamicOperationalBlock ? `\n[PANDUAN OPERASIONAL & SIKAP SAAT INI (PLAYBOOK & STANCE)]\n${_dynamicOperationalBlock}\n` : ''}
[PESAN TERBARU TUAN FAQIH]
${textInput}

Tentukan intent dan ekstrak data!
`;

  console.log(`[ROUTER] 🎯 Gated domains: ${_candidateDomains === 'ALL' ? 'ALL (Fail-Open)' : Array.from(_candidateDomains).join(', ')} | System: ${routerSystemPrompt.length}ch | Prompt: ${prompt.length}ch`);

  // 4. Execute Cognitive Routing (Medium Temperature = 0.3)
  let resultJsonStr = await executeWithFallback(prompt, routerSystemPrompt, 0.3, true, { userText: textInput });


  // Clean markdown block if GenAI decides to return it despite instructions
  let cleanStr = resultJsonStr.replace(/```json/gi, '').replace(/```/g, '').trim();
  const firstBrace = cleanStr.indexOf('{');
  const lastBrace = cleanStr.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    cleanStr = cleanStr.substring(firstBrace, lastBrace + 1);
  }

  try {
    const rawData = JSON.parse(cleanStr);
    return _normalizeRoutingOutput(rawData, _sentimentScore, {
      injectedTraits: _injectedTraitsList,
      injectedPlaybook: _activePlaybook,
      topicContext: _topicContext
    });
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
        const rawData = JSON.parse(repaired);
        console.log('[ROUTER] Smart JSON Repair SUCCESS after trailing garbage');
        return _normalizeRoutingOutput(rawData, _sentimentScore, {
          injectedTraits: _injectedTraitsList,
          injectedPlaybook: _activePlaybook,
          topicContext: _topicContext
        });
      }
    } catch (_) { }

    console.error('[ROUTER] JSON Parse Error:', err.message, resultJsonStr);
    return {
      intent: 'ERROR',
      actions: [{ intent: 'ERROR', extracted_data: {} }],
      reply_message: 'Maaf Tuan, saya mengalami disonansi kognitif saat memproses instruksi tersebut.',
      mood: _sentimentScore,
      _injectedTraits: _injectedTraitsList || [],
      _injectedPlaybook: _activePlaybook || null,
      _topicContext: _topicContext || 'DEFAULT'
    };
  }
}

module.exports = {
  CONTEXTUAL_REF_WORDS,
  _handleReflexRouting,
  _fetchRecentFinanceSummary,
  _fetchUpcomingEventsSummary,
  _fetchTodaysRawEvents,
  routeUserMessage
};
