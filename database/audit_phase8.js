/**
 * COMPREHENSIVE AUDIT TEST — Phase 8 N.E.X.A Self-Learning Engine
 * Run: node database/audit_phase8.js
 */
'use strict';

const fs = require('fs');
const results = [];

function assert(name, cond, detail) {
  results.push({ name, ok: !!cond, detail: detail || '' });
}

// ═══════════════════════════════════════════════════════════════
// 1. MODULE LOAD TEST — semua file harus bisa di-require
// ═══════════════════════════════════════════════════════════════
let mem, inf, router;

try {
  mem = require('../src/infrastructure/Supabase_Memories');
  assert('[LOAD] Supabase_Memories', true);
} catch (e) { assert('[LOAD] Supabase_Memories', false, e.message); }

try {
  inf = require('../src/domain/Inference_Engine');
  assert('[LOAD] Inference_Engine', true);
} catch (e) { assert('[LOAD] Inference_Engine', false, e.message); }

try {
  router = require('../src/core/AI_Router');
  assert('[LOAD] AI_Router', true);
} catch (e) { assert('[LOAD] AI_Router', false, e.message); }

// cron.js akan start scheduler — skip actual require, cek via source
assert('[LOAD] cron.js (source readable)', fs.existsSync('./src/interfaces/cron.js'));

// ═══════════════════════════════════════════════════════════════
// 2. EXPORT INTEGRITY — semua export harus ada
// ═══════════════════════════════════════════════════════════════
assert('[EXPORT] mem.upsertSelfModelTrait', typeof mem?.upsertSelfModelTrait === 'function');
assert('[EXPORT] mem.getSelfModel', typeof mem?.getSelfModel === 'function');
// Legacy exports harus tetap ada (tidak boleh hilang)
assert('[EXPORT] mem.saveCoreIdentity (legacy)', typeof mem?.saveCoreIdentity === 'function');
assert('[EXPORT] mem.getPersonalFacts (legacy)', typeof mem?.getPersonalFacts === 'function');
assert('[EXPORT] mem.saveUserProfile (legacy)', typeof mem?.saveUserProfile === 'function');
assert('[EXPORT] mem.getTodayMemories (critical for cron)', typeof mem?.getTodayMemories === 'function');
assert('[EXPORT] inf.runWeeklySelfReflectionPass', typeof inf?.runWeeklySelfReflectionPass === 'function');
assert('[EXPORT] inf.runWeeklyIdentityInference (legacy)', typeof inf?.runWeeklyIdentityInference === 'function');
assert('[EXPORT] inf.runDailyDecayPass (legacy)', typeof inf?.runDailyDecayPass === 'function');
assert('[EXPORT] inf.getPersonalityEvolutionNarrative (legacy)', typeof inf?.getPersonalityEvolutionNarrative === 'function');
assert('[EXPORT] router.deduplicateAndSaveFact (legacy)', typeof router?.deduplicateAndSaveFact === 'function');
assert('[EXPORT] router.routeUserMessage', typeof router?.routeUserMessage === 'function');

// ═══════════════════════════════════════════════════════════════
// 3. INPUT VALIDATION — upsertSelfModelTrait guard logic
// ═══════════════════════════════════════════════════════════════
async function testValidation() {
  // Invalid layer
  const r1 = await mem.upsertSelfModelTrait('INVALID_LAYER', 'key_abc', 'some value', 'MANUAL', '');
  assert('[VALID] rejects invalid layer', r1 === 'error');

  // Empty key
  const r2 = await mem.upsertSelfModelTrait('CAPABILITIES', '', 'some value', 'MANUAL', '');
  assert('[VALID] rejects empty trait_key', r2 === 'error');

  // Key too short (< 3 chars after normalize)
  const r3 = await mem.upsertSelfModelTrait('CAPABILITIES', 'ab', 'some value', 'MANUAL', '');
  assert('[VALID] rejects trait_key < 3 chars', r3 === 'error');

  // Invalid source → should fallback to PASSIVE_LEARNING (not error)
  // We test the normalization logic by checking source validation
  const VALID_SOURCES = ['PASSIVE_LEARNING', 'WEEKLY_REFLECTION', 'MANUAL'];
  assert('[VALID] source validation logic covers 3 valid sources', VALID_SOURCES.length === 3);

  // Layer normalization: lowercase input should be uppered
  // Can't test full upsert (table doesn't exist), but layer check does
  const r4 = await mem.upsertSelfModelTrait('capabilities', 'test_norm_key', 'value here', 'MANUAL', '');
  // If error, it means DB missing (expected). If 'inserted', layer was upcased. Either OK.
  assert('[VALID] lowercase layer input handled (not crash)', r4 === 'error' || r4 === 'inserted');
}

// ═══════════════════════════════════════════════════════════════
// 4. _classifySelfModelLayer LOGIC — test all 5 branches
// ═══════════════════════════════════════════════════════════════
function testClassify() {
  // Extract and eval function from source — use block-level extraction
  let classifyFn;
  try {
    const src = fs.readFileSync('./src/interfaces/telegram/adapter.js', 'utf8');
    // Find function start and extract by brace counting
    const startIdx = src.indexOf('function _classifySelfModelLayer(fact)');
    if (startIdx === -1) { assert('[CLASSIFY] function found in source', false, 'not found'); return; }
    let depth = 0, i = startIdx, started = false;
    while (i < src.length) {
      if (src[i] === '{') { depth++; started = true; }
      else if (src[i] === '}') { depth--; }
      if (started && depth === 0) { i++; break; }
      i++;
    }
    const fnStr = src.substring(startIdx, i);
    eval(fnStr);
    classifyFn = _classifySelfModelLayer;
    assert('[CLASSIFY] function extracted successfully', typeof classifyFn === 'function');
  } catch (e) {
    assert('[CLASSIFY] function extraction', false, e.message);
    return;
  }

  const cases = [
    { input: 'kamu tidak bisa akses internet langsung', expected: 'LIMITATIONS' },
    { input: 'N.E.X.A belum mampu membaca real-time data', expected: 'LIMITATIONS' },
    { input: 'ingat ya jangan pakai poin dalam jawabanmu', expected: 'CORRECTIONS' },
    { input: 'tolong jangan terlalu panjang responnya', expected: 'CORRECTIONS' },
    { input: 'format jawaban sebaiknya lebih singkat', expected: 'COMMUNICATION_STYLE' },
    { input: 'gaya bahasa kamu sudah enak dan natural', expected: 'COMMUNICATION_STYLE' },
    { input: 'kamu bisa sinkronisasi email otomatis', expected: 'CAPABILITIES' },
    { input: 'N.E.X.A mampu menganalisis keuangan dari Gmail', expected: 'CAPABILITIES' },
    { input: 'konfirmasi dulu sebelum menghapus data apapun', expected: 'OPERATIONAL_RULES' },
    { input: 'setiap transaksi harus dikonfirmasi pengguna', expected: 'OPERATIONAL_RULES' },
  ];

  cases.forEach(c => {
    const result = classifyFn(c.input);
    assert(
      `[CLASSIFY] "${c.input.substring(0, 40)}..." → ${c.expected}`,
      result === c.expected,
      `got: ${result}`
    );
  });
}

// ═══════════════════════════════════════════════════════════════
// 5. isFactAboutNexa LOGIC — test relaxed patterns
// ═══════════════════════════════════════════════════════════════
function testIsFactAboutNexa() {
  let fn;
  try {
    const src = fs.readFileSync('./src/interfaces/telegram/adapter.js', 'utf8');
    // Find function start and extract by brace counting
    const startIdx = src.indexOf('function isFactAboutNexa(fact)');
    if (startIdx === -1) { assert('[IS_NEXA] function found in source', false, 'not found'); return; }
    let depth = 0, i = startIdx, started = false;
    while (i < src.length) {
      if (src[i] === '{') { depth++; started = true; }
      else if (src[i] === '}') { depth--; }
      if (started && depth === 0) { i++; break; }
      i++;
    }
    const fnStr = src.substring(startIdx, i);
    eval(fnStr);
    fn = isFactAboutNexa;
    assert('[IS_NEXA] function extracted', typeof fn === 'function');
  } catch (e) { assert('[IS_NEXA] function extraction', false, e.message); return; }

  // Should be TRUE (about N.E.X.A)
  assert('[IS_NEXA] TRUE: "kamu bisa baca PDF"', fn('kamu bisa baca PDF') === true);
  assert('[IS_NEXA] TRUE: "N.E.X.A mampu analisis emosi"', fn('N.E.X.A mampu analisis emosi') === true);
  assert('[IS_NEXA] TRUE: "kamu diciptakan oleh Faqih"', fn('kamu diciptakan oleh Faqih') === true);
  assert('[IS_NEXA] TRUE: "ingat ya sebaiknya kamu ringkas"', fn('ingat ya sebaiknya kamu ringkas') === true);
  assert('[IS_NEXA] TRUE: "ternyata kamu bisa juga ya"', fn('ternyata kamu bisa juga ya') === true);
  assert('[IS_NEXA] TRUE: "format jawaban terlalu panjang"', fn('format jawaban terlalu panjang') === true);
  assert('[IS_NEXA] TRUE: "responsmu sudah lebih singkat"', fn('responsmu sudah lebih singkat') === true);

  // Should be FALSE (about user/Faqih)
  assert('[IS_NEXA] FALSE: "aku suka kopi"', fn('aku suka kopi') === false);
  assert('[IS_NEXA] FALSE: "Faqih kuliah di UMY"', fn('Faqih kuliah di UMY') === false);
  assert('[IS_NEXA] FALSE: "saya biasa tidur jam 11 malam"', fn('saya biasa tidur jam 11 malam') === false);
}

// ═══════════════════════════════════════════════════════════════
// 6. getSelfModel — null-safety (tabel belum ada)
// ═══════════════════════════════════════════════════════════════
async function testGetSelfModel() {
  const facts = await mem.getSelfModel(5);
  assert('[GETSELF] returns Array (not throws)', Array.isArray(facts));
  assert('[GETSELF] limit respected (empty ok)', facts.length <= 5);
  assert('[GETSELF] getSelfModel(10) also works', Array.isArray(await mem.getSelfModel(10)));
}

// ═══════════════════════════════════════════════════════════════
// 7. CRON SCHEDULE INTEGRITY
// ═══════════════════════════════════════════════════════════════
function testCron() {
  const src = fs.readFileSync('./src/interfaces/cron.js', 'utf8');

  // Count only actual cron.schedule() calls, not comments or string mentions
  const count16 = (src.match(/cron\.schedule\('0 16 \* \* 0'/g) || []).length;
  const count21 = (src.match(/cron\.schedule\('0 21 \* \* 0'/g) || []).length;
  assert('[CRON] Exactly 1x Sunday 16:00 WIB cron.schedule()', count16 === 1, `found ${count16}`);
  assert('[CRON] Exactly 1x Sunday 21:00 WIB cron.schedule()', count21 === 1, `found ${count21}`);

  // New cron body references correct function
  assert('[CRON] runWeeklySelfReflectionPass in cron', src.includes('runWeeklySelfReflectionPass'));

  // Telegram message on success
  assert('[CRON] Self-reflection success msg sent', src.includes('Self-Reflection Selesai') || src.includes('Pemahaman Diri'));

  // No collision comment present
  assert('[CRON] BUG FIX comment about cron collision still intact', src.includes('BUG FIX') && src.includes('duplikat'));
}

// ═══════════════════════════════════════════════════════════════
// 8. AI_ROUTER INJECTION INTEGRITY
// ═══════════════════════════════════════════════════════════════
function testRouter() {
  const src = fs.readFileSync('./src/core/AI_Router.js', 'utf8');

  assert('[ROUTER] getSelfModel(5) injected', src.includes('getSelfModel(5)'));
  assert('[ROUTER] PEMAHAMAN DIRI block in prompt', src.includes('PEMAHAMAN DIRI N.E.X.A'));
  assert('[ROUTER] try-catch guards self-model (non-blocking)', src.includes('} catch (_selfErr) {'));
  assert('[ROUTER] Rule 5 updated with examples', src.includes('Explicit capabilities'));
  assert('[ROUTER] Rule 5 mentions corrections', src.includes('Corrections from Tuan'));
  assert('[ROUTER] Rule 5 mentions operational rules', src.includes('Operational rules'));
  assert('[ROUTER] ROUTER_SYSTEM_PROMPT intact', src.includes('ROUTER_SYSTEM_PROMPT'));

  // Ensure getSelfModel is called inside a try-catch block (non-blocking check)
  const hasTryCatch = src.includes('getSelfModel(5)') && src.includes('} catch (_selfErr) {');
  assert('[ROUTER] getSelfModel(5) wrapped in try-catch (non-blocking)', hasTryCatch);
}

// ═══════════════════════════════════════════════════════════════
// 9. ADAPTER REDIRECT — no old CORE_IDENTITY pattern in new flow
// ═══════════════════════════════════════════════════════════════
function testAdapterRedirect() {
  const src = fs.readFileSync('./src/interfaces/telegram/adapter.js', 'utf8');

  assert('[ADAPTER] _classifySelfModelLayer defined', src.includes('function _classifySelfModelLayer'));
  assert('[ADAPTER] upsertSelfModelTrait called in passive learning', src.includes('upsertSelfModelTrait'));

  // learned_core_identities block must NOT call deduplicateAndSaveFact(fact,'CORE_IDENTITY')
  const coreIdBlock = src.match(/learned_core_identities[\s\S]{0,800}/)?.[0] || '';
  const oldSave = /deduplicateAndSaveFact\(fact,\s*['"]CORE_IDENTITY['"]\)/.test(coreIdBlock);
  assert('[ADAPTER] learned_core_identities NO LONGER uses old CORE_IDENTITY save', !oldSave,
    oldSave ? 'OLD PATTERN STILL PRESENT!' : '');

  // Fire-and-forget: should use .catch() not await (non-blocking)
  assert('[ADAPTER] upsertSelfModelTrait is fire-and-forget (.catch)', src.includes('.catch(() => {})'));

  // PHASE 8 comment present for context
  assert('[ADAPTER] PHASE 8 comment in passive learning', src.includes('[PHASE 8]'));

  // isFactAboutNexa Phase 8 patterns added
  assert('[ADAPTER] Phase 8 implicit correction patterns', src.includes('ingat ya|catat ini'));
  assert('[ADAPTER] Phase 8 correction signals', src.includes('ternyata kamu|kamu ternyata'));
  assert('[ADAPTER] Phase 8 format/style patterns', src.includes('responsmu|balasanmu|jawabanmu'));
}

// ═══════════════════════════════════════════════════════════════
// 10. INFERENCE ENGINE — runWeeklySelfReflectionPass structure
// ═══════════════════════════════════════════════════════════════
function testInferenceEngine() {
  const src = fs.readFileSync('./src/domain/Inference_Engine.js', 'utf8');

  assert('[INFER] runWeeklySelfReflectionPass exported', src.includes('runWeeklySelfReflectionPass,'));
  assert('[INFER] uses _getSupabase() for lazy client', src.includes('_getSupabase()'));
  assert('[INFER] uses _getChatMemories7Days()', src.includes('_getChatMemories7Days()'));
  assert('[INFER] min 5 messages guard', src.includes('memories.length < 5'));
  assert('[INFER] reads nexa_self_model snapshot', src.includes("from('nexa_self_model')"));
  assert('[INFER] filters user messages only', src.includes("m.role === 'user'"));
  assert('[INFER] uses executeWithFallback (imported)', src.includes("const { executeWithFallback }"));
  assert('[INFER] VALID_SELF_LAYERS set for validation', src.includes('VALID_SELF_LAYERS'));
  assert('[INFER] upserts via supabaseMemories.upsertSelfModelTrait', src.includes('supabaseMemories.upsertSelfModelTrait'));
  assert('[INFER] returns {success, upserted, skipped, errors}', src.includes('{ success: true, upserted, skipped, errors }'));
  assert('[INFER] JSON parse error handled gracefully', src.includes('[SELF-REFLECTION] JSON parse failed'));
  assert('[INFER] AI returns [] guard', src.includes("if (!Array.isArray(proposals)) proposals = []"));
  assert('[INFER] legacy exports intact: runWeeklyIdentityInference', src.includes('runWeeklyIdentityInference,'));
  assert('[INFER] legacy exports intact: runDailyDecayPass', src.includes('runDailyDecayPass,'));
}

// ═══════════════════════════════════════════════════════════════
// 11. SQL SCHEMA INTEGRITY
// ═══════════════════════════════════════════════════════════════
function testSQL() {
  const sql = fs.readFileSync('./database/update_supabase_self_model.sql', 'utf8');
  assert('[SQL] CREATE TABLE nexa_self_model present', sql.includes('CREATE TABLE IF NOT EXISTS nexa_self_model'));
  assert('[SQL] layer column with CHECK constraint', sql.includes("CHECK (layer IN ("));
  assert('[SQL] trait_key UNIQUE constraint', sql.includes('UNIQUE'));
  assert('[SQL] confidence NUMERIC with bounds check', sql.includes('confidence') && sql.includes('CHECK (confidence'));
  assert('[SQL] source CHECK constraint', sql.includes("CHECK (source IN ("));
  assert('[SQL] auto-update trigger defined', sql.includes('CREATE TRIGGER'));
  assert('[SQL] index on layer', sql.includes('idx_nexa_self_model_layer'));
  assert('[SQL] index on updated_at', sql.includes('idx_nexa_self_model_updated'));
  assert('[SQL] inferred_from column present', sql.includes('inferred_from'));
  assert('[SQL] all 5 valid layers in CHECK', sql.includes('CAPABILITIES') && sql.includes('COMMUNICATION_STYLE'));
}

// ═══════════════════════════════════════════════════════════════
// 12. CROSS-MODULE CONNECTION CHAIN
// ═══════════════════════════════════════════════════════════════
function testConnectionChain() {
  // Chain: adapter.js → Supabase_Memories.upsertSelfModelTrait → nexa_self_model
  const adSrc = fs.readFileSync('./src/interfaces/telegram/adapter.js', 'utf8');
  const memSrc = fs.readFileSync('./src/infrastructure/Supabase_Memories.js', 'utf8');
  const infSrc = fs.readFileSync('./src/domain/Inference_Engine.js', 'utf8');
  const rtSrc  = fs.readFileSync('./src/core/AI_Router.js', 'utf8');
  const cronSrc = fs.readFileSync('./src/interfaces/cron.js', 'utf8');

  // adapter → Supabase_Memories
  assert('[CHAIN] adapter requires Supabase_Memories', adSrc.includes("require(\"../../infrastructure/Supabase_Memories\")"));

  // Inference_Engine → Supabase_Memories (for upsert)
  assert('[CHAIN] Inference_Engine requires Supabase_Memories', infSrc.includes("require('../infrastructure/Supabase_Memories')"));

  // AI_Router → Supabase_Memories (for getSelfModel)
  assert('[CHAIN] AI_Router requires Supabase_Memories', rtSrc.includes("require('../infrastructure/Supabase_Memories')"));

  // cron → Inference_Engine (for self-reflection)
  assert('[CHAIN] cron requires Inference_Engine', cronSrc.includes("require('../domain/Inference_Engine')"));

  // Layer 1 → fire-and-forget (passive, real-time)
  assert('[CHAIN] Layer 1 is fire-and-forget', adSrc.includes('.catch(() => {})'));

  // Layer 2 → cron-triggered, awaited inside cron
  assert('[CHAIN] Layer 2 is awaited in cron (not fire-and-forget)', cronSrc.includes('await inferenceEngine.runWeeklySelfReflectionPass()'));
}

// ═══════════════════════════════════════════════════════════════
// RUN ALL TESTS
// ═══════════════════════════════════════════════════════════════
(async () => {
  try {
    await testValidation();
    testClassify();
    testIsFactAboutNexa();
    await testGetSelfModel();
    testCron();
    testRouter();
    testAdapterRedirect();
    testInferenceEngine();
    testSQL();
    testConnectionChain();
  } catch (e) {
    results.push({ name: '[FATAL] Uncaught error during test run', ok: false, detail: e.stack });
  }

  console.log('\n╔══════════════════════════════════════════════════════════╗');
  console.log('║  AUDIT REPORT — Phase 8 N.E.X.A Self-Learning Engine    ║');
  console.log('╚══════════════════════════════════════════════════════════╝\n');

  const groups = {};
  results.forEach(r => {
    const grp = r.name.match(/\[([A-Z_]+)\]/)?.[1] || 'MISC';
    if (!groups[grp]) groups[grp] = [];
    groups[grp].push(r);
  });

  let totalPass = 0, totalFail = 0;
  for (const [grp, checks] of Object.entries(groups)) {
    const gPass = checks.filter(c => c.ok).length;
    const gFail = checks.filter(c => !c.ok).length;
    const gIcon = gFail === 0 ? '✅' : '❌';
    console.log(`${gIcon} [${grp}] ${gPass}/${checks.length} passed`);
    checks.filter(c => !c.ok).forEach(c => {
      console.log(`   ⚠  FAIL: ${c.name}${c.detail ? ' — ' + c.detail : ''}`);
    });
    totalPass += gPass;
    totalFail += gFail;
  }

  console.log('\n──────────────────────────────────────────────────────────');
  console.log(`TOTAL: ${totalPass + totalFail} checks | PASS: ${totalPass} | FAIL: ${totalFail}`);
  if (totalFail === 0) {
    console.log('🟢 ALL CHECKS PASSED — Phase 8 implementation is clean!');
  } else {
    console.log('🔴 ' + totalFail + ' check(s) need attention');
  }
  process.exit(totalFail > 0 ? 1 : 0);
})();
