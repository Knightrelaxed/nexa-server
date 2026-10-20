/**
 * Harness karakterisasi untuk AI_Router (golden master). Berjalan identik pada monolit (src/core/AI_Router.js
 * tanpa folder router/) maupun hasil split (facade + src/core/router/*). Semua dependensi eksternal
 * (LLM/Fallback_Engine, Supabase_Memories, modul domain/infrastruktur) diganti stub PEREKAM dengan data
 * kalengan; Date/random dibekukan. Tidak ada jaringan/DB. Yang direkam: nilai kembali, prompt LLM lengkap,
 * dan urutan panggilan dependensi (mis. berapa kali getPersonalFacts dipanggil => perilaku cache).
 */
'use strict';
const Module = require('module');
const path = require('path');
const fs = require('fs');

const ROOT = path.resolve(__dirname, '../..');
const FIXED = Date.parse('2026-10-12T03:00:00.000Z'); // Senin 10:00 WIB

const safe = (v) => { try { return JSON.parse(JSON.stringify(v, (k, x) => (typeof x === 'function' ? '[fn]' : x === undefined ? '[undef]'
  : x instanceof RegExp ? String(x) : x instanceof Set ? { __set: [...x] } : x instanceof Map ? { __map: [...x] }
  : typeof x === 'number' && !Number.isFinite(x) ? String(x) : x))); } catch (e) { return '[unserializable]'; } };

// ── data kalengan ──────────────────────────────────────────────────────────────
const FACTS = {
  userProfile: ['Faqih suka kopi hitam tanpa gula', 'Faqih kuliah Teknik Informatika semester 7', 'Faqih sering lupa makan malam', 'Faqih tinggal di Jawa Barat',
    'Faqih punya skripsi tentang asisten AI', 'Faqih alergi udang', 'Faqih memakai Mandiri dan GoPay'],
  coreIdentity: ['Kamu adalah N.E.X.A, asisten pribadi Faqih', 'Gunakan bahasa Indonesia santai', 'Panggil pengguna Tuan Faqih'],
  vault: ['[KTP] KTP Faqih (Metadata: {"nik":"123"})', '[IDE] Aplikasi kasir UMKM']
};
const IDENTITY = [
  { id: 1, layer: 'WEAKNESSES', trait_key: 'forgetful', directive: 'Sampaikan pengingat dengan nada netral', confidence: 0.8 },
  { id: 2, layer: 'PREFERENCES', trait_key: 'concise', directive: 'Jawab ringkas tanpa bullet', confidence: 0.9 },
  { id: 3, layer: 'DECISION_STYLE', trait_key: 'data_driven', directive: 'Berikan angka sebelum opini', confidence: 0.7 },
  { id: 4, layer: 'MOTIVATIONS', trait_key: 'graduate', directive: 'Kaitkan dengan target lulus', confidence: 0.7 },
  { id: 5, layer: 'HABITS', trait_key: 'night_owl', directive: 'Hindari sapaan pagi terlalu ceria', confidence: 0.6 },
  { id: 6, layer: 'VALUES', trait_key: 'frugal', directive: 'Hargai efisiensi biaya', confidence: 0.6 }
];
const HISTORY = (n, len = 60) => Array.from({ length: n }, (_, i) => ({ role: i % 2 ? 'nexa' : 'user', content: `pesan ${i} ` + 'isi '.repeat(len / 5), created_at: '2026-10-12T02:00:00.000Z' }));
const CANNED_BASE = {
  'Supabase_Memories.getPersonalFacts': FACTS, 'Supabase_Memories.getIdentityModel': IDENTITY,
  'Supabase_Memories.getRecentMemories': HISTORY(6), 'Supabase_Memories.getAllActiveMemories': [{ id: 'm1', content: 'Faqih suka kopi', memory_type: 'FACT', importance: 3 }],
  'Supabase_Memories.getSelfModel': [{ layer: 'CAPABILITIES', trait_key: 'email', content: 'Bisa membaca email' }],
  'Supabase_Memories.saveMemoryWithMeta': { success: true, id: 'm-new' }, 'Supabase_Memories.archiveMemoryById': true, 'Supabase_Memories.reinforceMemoryById': true,
  'gemini_vector_cache.isSnapshotReady': false, 'gemini_vector_cache.getRelevantFacts': [],
  'Presence_Model.toPromptBlock': '[PRESENCE: aktif]', 'Episodic_Recall.searchMemories': [],
  'Playbook_Engine.getPlaybookForIntent': { intent: 'NORMAL_CHAT', version: 1, rendered: 'Jawab natural dan singkat.' },
  'Playbook_Engine.formatPlaybookContextBlock': '[PLAYBOOK] Jawab natural dan singkat.',
  'Dialectic_Engine.getStanceNoteBlock': '[STANCE] tenang', 'Finance_Engine.getRecentTransactions': 'Rp25.000 kopi',
  'Google_Workspace.getTodaysEvents': 'Rapat 09:00', 'Supabase_Finance.getAccountsList': [{ name: 'Mandiri' }], 'Supabase_Finance.getCategoriesList': [{ name: 'Makanan' }],
  'logger.getRecentLogs': '[LOG] server ok'
};
const SYNC = new Set(['Presence_Model.toPromptBlock', 'gemini_vector_cache.isSnapshotReady', 'Dialectic_Engine.getStanceNoteBlock', 'logger.getRecentLogs']);
const ROUTER_JSON = (o) => JSON.stringify({ intent: 'NORMAL_CHAT', extracted_data: {}, reply_message: 'ok', actions: [], ...o });

// ── pemasangan stub ────────────────────────────────────────────────────────────
function install(state) {
  const origLoad = Module._load, RealDate = Date, origRandom = Math.random, origConsole = { log: console.log, warn: console.warn, error: console.error, info: console.info };
  const stub = (name) => new Proxy({}, { get(_, prop) {
    if (typeof prop === 'symbol' || prop === 'then' || prop === 'toJSON') return undefined;
    if (name === 'Fallback_Engine' && prop === 'executeWithFallback') return async (prompt, system, temp, json, meta) => {
      state.llm.push(safe({ prompt, system, temp, json, meta }));
      const q = state.llmQueue; const r = q.length > 1 ? q.shift() : q[0];
      const v = typeof r === 'function' ? r({ prompt, system, json }) : r;
      if (v instanceof Error) throw v; return v === undefined ? (json ? ROUTER_JSON({}) : 'ok') : v;
    };
    return (...args) => { state.calls.push([name, String(prop), safe(args)]); const k = `${name}.${String(prop)}`;
      const c = k in state.canned ? state.canned[k] : CANNED_BASE[k];
      const val = typeof c === 'function' ? c(args) : c === undefined ? undefined : JSON.parse(JSON.stringify(c));
      return SYNC.has(k) ? val : Promise.resolve(val); };   // fungsi async asli mengembalikan Promise (kode memanggil .catch)
  } });
  Module._load = function (req, parent, isMain) {
    let rel = null; try { rel = path.relative(ROOT, Module._resolveFilename(req, parent, isMain)).replace(/\\/g, '/'); } catch (_) { /* builtin */ }
    if (rel && (/^src\/core\/Fallback_Engine\.js$/.test(rel) || /^src\/(infrastructure|domain)\//.test(rel) || /^src\/utils\/(gemini_vector_cache|logger)\.js$/.test(rel)))
      return stub(path.basename(rel, '.js'));
    return origLoad.apply(this, arguments);
  };
  global.Date = class extends RealDate { constructor(...a) { super(...(a.length ? a : [state.now])); } static now() { return state.now; } };
  Math.random = () => 0.5; console.log = console.warn = console.error = console.info = () => {};
  return () => { Module._load = origLoad; global.Date = RealDate; Math.random = origRandom; Object.assign(console, origConsole); };
}

function discoverInternals(src) {
  src = src.replace(/\r\n/g, '\n');
  return { fns: [...src.matchAll(/^(?:async )?function (\w+)/gm)].map((m) => m[1]), consts: [...src.matchAll(/^const (\w+) = (?!require\()/gm)].map((m) => m[1]) };
}

function loadRouter(names) {
  const state = { llm: [], llmQueue: [], calls: [], canned: {}, now: FIXED };
  const restore = install(state);
  for (const k of Object.keys(require.cache)) if (/src[\\/]core[\\/](AI_Router|router[\\/])/.test(k)) delete require.cache[k];
  const facadeFile = path.join(ROOT, 'src/core/AI_Router.js'); const routerDir = path.join(ROOT, 'src/core/router');
  try {
    let facade, internals = {}, mode;
    if (fs.existsSync(routerDir)) {
      mode = 'split'; facade = require(facadeFile);
      for (const f of fs.readdirSync(routerDir).filter((x) => /^Router_.*\.js$/.test(x)).sort()) Object.assign(internals, require(path.join(routerDir, f)));
    } else {
      mode = 'monolith'; const d = discoverInternals(fs.readFileSync(facadeFile, 'utf8'));
      const all = [...new Set([...d.fns, ...d.consts])];
      const code = fs.readFileSync(facadeFile, 'utf8').replace(/\r\n/g, '\n') + `\nmodule.exports.__internals = { ${all.join(', ')} };\n`;
      const m = new Module(facadeFile, module); m.filename = facadeFile; m.paths = Module._nodeModulePaths(path.dirname(facadeFile)); m._compile(code, facadeFile);
      internals = m.exports.__internals; facade = m.exports; delete facade.__internals;
    }
    return { facade, internals, state, restore, mode };
  } catch (e) { restore(); throw e; }
}

// ── kasus fungsi murni ─────────────────────────────────────────────────────────
const MSGS = ['halo', 'selamat pagi nexa', 'makasih ya', 'ok', 'oke siap', 'ya', 'tidak', 'beli kopi 25rb pakai gopay', 'catat pengeluaran makan siang 30rb', 'cek saldo mandiri',
  'jadwalkan rapat besok jam 9', 'ingatkan aku minum obat jam 8 malam', 'agenda hari ini apa?', 'buat tugas beli galon', 'cek email dari dosen', 'kirim email ke dosen pembimbing',
  'kunci hp sekarang', 'foto dari kamera depan', 'lokasi kampus terdekat', 'cari berita ai terbaru', 'cek log server', 'ANJIR deadline besok belum kelar!!! tolong cepetan',
  'aku capek banget, males ngapa-ngapain', 'makasih banget bro, kamu keren', 'hapus semua data tabel nexa_core_identity', 'simpan ide: bikin aplikasi kasir',
  'ingat ini mulai sekarang jawab singkat', 'berapa pengeluaran bulan ini dibanding bulan lalu', 'rute ke kampus dari rumah', 'yg tadi itu maksudnya gimana', 'lanjutkan',
  'jangan lupa kalau aku alergi udang', 'x'.repeat(300), '', '😀😀', 'Rp1.250.000,50 transfer ke budi', 'bayar listrik 150rb besok', 'fokus ke skripsi hari ini',
  'selamat malam', 'terima kasih', 'kopi hitam tanpa gula favoritku', 'skripsi semester 7 teknik informatika'];
const TOPICS = ['DEFAULT', 'FINANCE', 'SCHEDULING', 'RESEARCH', 'STRATEGIC', 'CASUAL', 'EMAIL_DRAFT', 'BRIEFING_MORNING', 'DISCIPLINE_NUDGE', 'NORMAL_CHAT', 'ZZZ'];
const GROUPED = IDENTITY.reduce((g, t) => { (g[t.layer] = g[t.layer] || []).push(t); return g; }, {});
const HINTS = [{}, { pendingEmailContext: { lastBatch: [1] } }, { pendingDatabaseContext: { tableName: 'nexa_core_identity' } }, { conversationContext: { intent: 'FINANCE', lastUserText: 'beli kopi' } }, { pendingCalendarContext: { x: 1 } }, { pendingVaultContext: { x: 1 } }];
const eachMsg = (f) => MSGS.map((m) => f(m));
const PURE = {
  _isReflexMessage: () => MSGS.flatMap((m) => HINTS.map((h) => [m, h])),
  _detectCandidateDomains: () => MSGS.flatMap((m) => HINTS.map((h) => [m, h])),
  _detectTopicContext: () => eachMsg((m) => [m]), _detectSentiment: () => eachMsg((m) => [m]), _preflightClassify: () => eachMsg((m) => [m]),
  _extractResonanceTokens: () => eachMsg((m) => [m]),
  _stemIndonesianWord: () => ['makanan', 'memakan', 'dimakan', 'berlari', 'pengeluaran', 'keuangan', 'menjadwalkan', 'terjadwal', 'kopi', 'api', 'ku', 'nya', 'bermain', 'pembayaran', 'kenyamanan', ''].map((w) => [w]),
  _scoreFactRelevance: () => FACTS.userProfile.flatMap((f) => [['kopi', 'hitam'], ['skripsi'], []].map((t) => [f, t])),
  _selectUserProfileFacts: () => MSGS.map((m) => [FACTS.userProfile, m, []]).concat([[FACTS.userProfile, 'apa saja', ['Faqih alergi udang']], [null, 'x', []], [[], 'x', []]]),
  _selectCoreIdentityFacts: () => MSGS.map((m) => [FACTS.coreIdentity, m, []]).concat([[FACTS.coreIdentity, 'x', ['Gunakan bahasa Indonesia santai']], [null, 'x', []]]),
  _selectVaultFacts: () => MSGS.slice(0, 8).map((m) => [FACTS.vault, m]).concat([[null, 'x'], [[], 'x']]),
  _buildIdentityContextBlock: () => TOPICS.flatMap((t) => [[GROUPED, t, []], [{}, t, null], [null, t, []]]),
  buildRouterSystemPrompt: () => [['ALL'], [undefined], [['FINANCE']], [['CALENDAR', 'TASK']], [['EMAIL', 'DATABASE', 'DEVICE_CONTROL']], [[]], ['FINANCE'], [['NOPE']]],
  _applyTokenBudgetGuard: () => [['a'.repeat(100), 'u\nn\n'.repeat(50), 's'.repeat(100)], ['a'.repeat(30000), ('baris riwayat\n').repeat(900), 's'.repeat(8000)],
    ['a'.repeat(100), ('x'.repeat(80) + '\n').repeat(800), 's'.repeat(100)], ['', '', ''], ['a'.repeat(60000), 'h\nh\nh\nh\nh', 's']],
  formatTimeWIB: () => ['2026-10-12T03:00:00.000Z', '2026-10-11T17:30:00.000Z', 'bukan tanggal', '', null, '2026-01-01T00:00:00Z'].map((x) => [x]),
  _cleanEmDashes: () => ['Halo — dunia', 'a – b ‒ c', 'tanpa dash', '— awal', 'akhir —', 'a—b—c', '', null].map((x) => [x]),
  _fixActionDomain: () => [{ intent: 'FINANCE', extracted_data: { action: 'RECORD' } }, { intent: 'NORMAL_CHAT', extracted_data: { action: 'RECORD', nominal: 1 } }, { intent: 'CALENDAR', extracted_data: { action: 'LOCK' } },
    { intent: 'DEVICE_CONTROL', extracted_data: { action: 'READ_LATEST' } }, { intent: 'FINANCE', extracted_data: {} }, { intent: 'TASK' }, {}, null].map((x) => [x]),
  _normalizeRoutingOutput: () => [
    [{ intent: 'FINANCE', extracted_data: { action: 'RECORD', nominal: 25000 }, reply_message: 'Siap — dicatat', actions: [] }, 0, {}],
    [{ intent: 'NORMAL_CHAT', reply_message: 'oke', actions: [{ intent: 'FINANCE', extracted_data: { action: 'RECORD' } }, { intent: 'CALENDAR', extracted_data: { action: 'CREATE' } }] }, 0.8, { hasTime: true, hasCal: true }],
    [{ reply_message: 'tanpa intent' }, 0.2, {}], [{ intent: 'DEVICE_CONTROL', extracted_data: { action: 'LOCK' }, reply_message: 'ok' }, 0.5, { textInput: 'kunci hp' }], [{}, 0, {}], [null, 0, {}]]
};

// ── skenario end-to-end (urutan TETAP; cache dibawa antar skenario secara sengaja) ─────
const VISION = '[SISTEM PENGLIHATAN N.E.X.A - gambar] Konteks/Caption dari Tuan Faqih: "kenapa error ini?"';
const SC = [
  ['reflex-halo', 'routeUserMessage', ['halo'], [ROUTER_JSON({ reply_message: 'Halo Tuan Faqih!' })]],
  ['reflex-thanks', 'routeUserMessage', ['makasih ya'], [ROUTER_JSON({ reply_message: 'Sama-sama!' })]],
  ['finance', 'routeUserMessage', ['beli kopi 25rb pakai gopay'], [ROUTER_JSON({ intent: 'FINANCE', extracted_data: { action: 'RECORD', nominal: 25000, description: 'kopi' }, reply_message: 'Siap Tuan — kopi dicatat.' })]],
  ['schedule', 'routeUserMessage', ['jadwalkan rapat besok jam 9'], [ROUTER_JSON({ intent: 'CALENDAR', extracted_data: { action: 'CREATE', summary: 'Rapat', start: '2026-10-13T09:00' }, reply_message: 'Dijadwalkan.' })]],
  ['multi-action', 'routeUserMessage', ['catat makan siang 30rb dan ingatkan aku minum obat jam 8'], [ROUTER_JSON({ actions: [{ intent: 'FINANCE', extracted_data: { action: 'RECORD', nominal: 30000 } }, { intent: 'NORMAL_CHAT', extracted_data: { action: 'RECORD', nominal: 1 } }, { intent: 'TASK', extracted_data: { action: 'CREATE', title: 'minum obat' } }], reply_message: 'Siap — dua hal.' })]],
  ['malformed-json', 'routeUserMessage', ['tolong bantu aku'], ['ini bukan json {"intent": "NORMAL_CHAT", "reply_message": "setengah']],
  ['llm-throws', 'routeUserMessage', ['tolong bantu aku lagi'], [new Error('LLM down')]],
  ['log-request', 'routeUserMessage', ['cek log server'], ['Analisis: server sehat.']],
  ['vision-input', 'routeUserMessage', [VISION], ['Analisis gambar: ada error.']],
  ['pending-contexts', 'routeUserMessage', ['iya yang itu'], [ROUTER_JSON({ reply_message: 'oke' })], { hints: { pendingEmailContext: { lastBatch: [{ id: 'm1' }] }, pendingDatabaseContext: { tableName: 'nexa_core_identity', awaitingConfirmation: true }, conversationContext: { intent: 'FINANCE', lastUserText: 'beli kopi', lastAssistantReply: 'Dicatat' } } }],
  ['long-history', 'routeUserMessage', ['lanjutkan analisisnya'], [ROUTER_JSON({})], { canned: { 'Supabase_Memories.getRecentMemories': HISTORY(60, 900) } }],
  ['sentiment-stress', 'routeUserMessage', ['ANJIR deadline besok belum kelar!!! tolong banget cepetan'], [ROUTER_JSON({ reply_message: 'Tenang, kita urai satu-satu.' })]],
  ['identity-topic', 'routeUserMessage', ['fokus ke skripsi hari ini, aku malas banget'], [ROUTER_JSON({ reply_message: 'Mulai 10 menit dulu.' })]],
  ['cache-A-hit', 'routeUserMessage', ['cek saldo mandiri'], [ROUTER_JSON({ intent: 'FINANCE', extracted_data: { action: 'ACCOUNT_BALANCES' } })]],
  ['cache-invalidate-then-miss', 'seq', [], [ROUTER_JSON({})], { seq: async (api, state) => { api.invalidatePersonalFactsCache(); api.invalidateIdentityModelCache(); api.invalidateSelfModelCache(); return api.routeUserMessage('cek pengeluaran bulan ini', {}); } }],
  ['cache-ttl-expired', 'seq', [], [ROUTER_JSON({})], { seq: async (api, state) => { state.now += 40 * 60 * 1000; return api.routeUserMessage('cek tagihan listrik', {}); } }],
  ['callAI', 'callAI', ['tulis haiku tentang kopi'], ['jawaban bebas']],
  ['classifyPendingTransactionIntent-confirm', 'classifyPendingTransactionIntent', ['ya benar', { nominal: 25000, description: 'kopi' }], [JSON.stringify({ intent: 'CONFIRM' })]],
  ['classifyPendingTransactionIntent-garbage', 'classifyPendingTransactionIntent', ['hmm', { nominal: 25000 }], ['???']],
  ['classifyYesNo-yes', 'classifyYesNo', ['iya dong', 'hapus data?'], ['YES']],
  ['classifyYesNo-no', 'classifyYesNo', ['enggak', 'hapus data?'], ['NO']],
  ['classifyYesNo-throws', 'classifyYesNo', ['mungkin', ''], [new Error('LLM down')]],
  ['analyzeSystemLogs', 'analyzeSystemLogs', ['kenapa error?', '[ERR] ECONNRESET\n[LOG] retry'], ['Penyebab: koneksi terputus.']],
  ['dedupFact-new', 'deduplicateAndSaveFact', ['Faqih suka mie ayam', 'USER_PROFILE'], ['NEW']],
  ['dedupFact-dup', 'deduplicateAndSaveFact', ['Faqih suka kopi hitam tanpa gula', 'USER_PROFILE'], ['DUPLICATE']],
  ['dedupFact-garbage-core', 'deduplicateAndSaveFact', ['Gunakan nada tenang', 'CORE_IDENTITY'], ['???']],
  ['dedupFact-concurrent', 'seq', [], ['NEW'], { seq: async (api) => Promise.all([api.deduplicateAndSaveFact('Faqih suka sate padang', 'USER_PROFILE'), api.deduplicateAndSaveFact('Faqih suka sate padang', 'USER_PROFILE')]) }],
  ['dedupSelfFact', 'deduplicateAndSaveSelfFact', ['Nexa tidak bisa mengirim email tanpa konfirmasi', 'LIMITATIONS'], ['NEW']]
];

async function runPure(ctx, name) {
  ctx.state.now = FIXED; const out = [];
  for (const args of PURE[name]()) {
    const a = JSON.parse(JSON.stringify(args)); let r, err = null;
    try { r = await ctx.internals[name](...a); } catch (e) { err = String((e && e.message) || e).slice(0, 160); }
    out.push({ out: safe(r === undefined ? '[undef]' : r), after: safe(a), err });   // 'after' menangkap mutasi argumen di tempat
  } return out;
}
function runConsts(ctx, names) { return Object.fromEntries(names.map((n) => [n, safe(ctx.internals[n] === undefined ? '[undef]' : ctx.internals[n])])); }

// Skenario dijalankan berurutan karena cache RAM sengaja dibawa antar skenario.
async function runScenarios(ctx) {
  const res = {}; ctx.state.now = FIXED;
  for (const [id, fn, args, llm, opt = {}] of SC) {
    Object.assign(ctx.state, { llm: [], calls: [], llmQueue: [...llm], canned: opt.canned || {} });
    let out, err = null;
    try {
      const a = JSON.parse(JSON.stringify(args)); if (opt.hints) a.push(opt.hints);
      out = opt.seq ? await opt.seq(ctx.facade, ctx.state) : await ctx.facade[fn](...a);
    } catch (e) { err = String((e && e.message) || e).slice(0, 160); }
    res[id] = { out: safe(out === undefined ? '[undef]' : out), err, llm: ctx.state.llm, calls: safe(ctx.state.calls) };
  } return res;
}

// Pemetaan alias facade -> nama fungsi internal (identitas fungsi). Mendeteksi alias yang tertukar.
function computeAliases(ctx) {
  return Object.fromEntries(Object.keys(ctx.facade).map((k) => [k, Object.keys(ctx.internals).find((n) => ctx.internals[n] === ctx.facade[k]) || null]));
}

async function captureAll(ctx, internalNames) {
  const have = (n) => typeof ctx.internals[n] === 'function';
  const pureNames = Object.keys(PURE).filter(have);
  const out = { version: 1, publicExports: Object.keys(ctx.facade).map((n) => [n, typeof ctx.facade[n]]), aliases: computeAliases(ctx), internals: internalNames,
    pure: {}, consts: runConsts(ctx, internalNames.consts), scenarios: null };
  for (const n of pureNames) out.pure[n] = await runPure(ctx, n);
  out.scenarios = await runScenarios(ctx);
  return out;
}

module.exports = { computeAliases, loadRouter, discoverInternals, captureAll, runPure, runConsts, runScenarios, safe, PURE, SC, ROOT };
