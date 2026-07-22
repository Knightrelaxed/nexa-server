'use strict';
const assert = require('assert');

console.log('');
console.log('╔══════════════════════════════════════════════════════════════════════╗');
console.log('║       N.E.X.A PHASE 9 — LIVE MEMORY FULL AUDIT & LOGIC TEST         ║');
console.log('╚══════════════════════════════════════════════════════════════════════╝');
console.log('');

async function runTest() {
  let passed = 0;
  let failed = 0;
  const issues = [];

  // ─────────────────────────────────────────────────────────────
  // BAGIAN A: AUDIT KODE — Verifikasi Logika Setiap Fungsi
  // ─────────────────────────────────────────────────────────────
  console.log('══ BAGIAN A: AUDIT LOGIKA KODE (Baca Baris per Baris) ═════════════════');

  // A1: saveUserProfile — harus delegate ke saveMemoryWithMeta, bukan raw insert
  console.log('\n[A1] saveUserProfile → delegate to saveMemoryWithMeta?');
  try {
    const src = require('fs').readFileSync('./src/infrastructure/Supabase_Memories.js', 'utf8');
    assert.ok(src.includes("return await saveMemoryWithMeta(content, 'PREFERENCE', 'USER_PROFILE')"), 'saveUserProfile harus delegate ke saveMemoryWithMeta');
    // Pastikan tidak ada raw insert lagi di dalam fungsi saveUserProfile
    const fnBlock = src.match(/async function saveUserProfile[\s\S]*?\n\}/)?.[0] || '';
    assert.ok(!fnBlock.includes("supabase.from('nexa_user_profile').insert"), 'saveUserProfile tidak boleh lagi raw insert langsung');
    console.log("  ✔ Line 190-193: delegate → saveMemoryWithMeta(content, 'PREFERENCE', 'USER_PROFILE') — NO raw insert");
    passed++;
  } catch(e) { console.error('  ✘', e.message); failed++; issues.push('A1'); }

  // A2: saveCoreIdentity — harus delegate ke saveMemoryWithMeta
  console.log('\n[A2] saveCoreIdentity → delegate to saveMemoryWithMeta?');
  try {
    const src = require('fs').readFileSync('./src/infrastructure/Supabase_Memories.js', 'utf8');
    assert.ok(src.includes("return await saveMemoryWithMeta(content, 'RULE', 'CORE_IDENTITY')"), 'saveCoreIdentity harus delegate');
    const fnBlock = src.match(/async function saveCoreIdentity[\s\S]*?\n\}/)?.[0] || '';
    assert.ok(!fnBlock.includes("supabase.from('nexa_core_identity').insert"), 'saveCoreIdentity tidak boleh raw insert');
    console.log("  ✔ Line 212-215: delegate → saveMemoryWithMeta(content, 'RULE', 'CORE_IDENTITY') — NO raw insert");
    passed++;
  } catch(e) { console.error('  ✘', e.message); failed++; issues.push('A2'); }

  // A3: saveMemoryWithMeta — validasi payload lengkap
  console.log('\n[A3] saveMemoryWithMeta: payload memiliki semua 5 field Phase 9?');
  try {
    const src = require('fs').readFileSync('./src/infrastructure/Supabase_Memories.js', 'utf8');
    assert.ok(src.includes("content: String(content).trim()"), 'payload.content harus di-trim');
    assert.ok(src.includes("category_type: validCat"), 'payload harus punya category_type');
    assert.ok(src.includes("last_reinforced_at: new Date().toISOString()"), 'payload harus set last_reinforced_at');
    assert.ok(src.includes("evidence_count: 1"), 'payload harus evidence_count: 1');
    assert.ok(src.includes("status: 'ACTIVE'"), 'payload harus status ACTIVE');
    console.log("  ✔ Line 250-256: payload = {content, category_type, last_reinforced_at, evidence_count:1, status:'ACTIVE'}");
    passed++;
  } catch(e) { console.error('  ✘', e.message); failed++; issues.push('A3'); }

  // A4: getAllActiveMemories — filter status ACTIVE, pilih kolom yang benar
  console.log('\n[A4] getAllActiveMemories: filter ACTIVE, select kolom lengkap?');
  try {
    const src = require('fs').readFileSync('./src/infrastructure/Supabase_Memories.js', 'utf8');
    assert.ok(src.includes(".select('id, content, category_type, evidence_count, last_reinforced_at')"), 'select harus ambil semua kolom Phase 9');
    assert.ok(src.includes(".eq('status', 'ACTIVE')"), 'harus filter ACTIVE saja');
    console.log("  ✔ Line 278-282: select(id,content,category_type,evidence_count,last_reinforced_at).eq(status,ACTIVE)");
    passed++;
  } catch(e) { console.error('  ✘', e.message); failed++; issues.push('A4'); }

  // A5: cron.js — consolidation malam pakai deduplicateAndSaveFact
  console.log('\n[A5] cron.js: overnight consolidation → aiRouter.deduplicateAndSaveFact?');
  try {
    const src = require('fs').readFileSync('./src/interfaces/cron.js', 'utf8');
    assert.ok(src.includes("aiRouter.deduplicateAndSaveFact(fact.trim(), 'USER_PROFILE')"), 'harus pakai deduplicateAndSaveFact');
    assert.ok(!src.includes("supabaseMemories.saveUserProfile(fact.trim())"), 'saveUserProfile langsung tidak boleh ada di consolidation');
    console.log("  ✔ Line 607: aiRouter.deduplicateAndSaveFact(fact.trim(),'USER_PROFILE') — 4-Way Supersede Engine aktif di consolidation");
    passed++;
  } catch(e) { console.error('  ✘', e.message); failed++; issues.push('A5'); }

  // A6: Hygiene Step 1 — EPHEMERAL + 30-day cutoff
  console.log('\n[A6] Hygiene Step 1: EPHEMERAL sweep — filter dan cutoff tepat?');
  try {
    const src = require('fs').readFileSync('./src/domain/Memory_Hygiene_Engine.js', 'utf8');
    assert.ok(src.includes("EPHEMERAL_MAX_DAYS = 30"), 'max hari harus 30');
    assert.ok(src.includes(".eq('status', 'ACTIVE').eq('category_type', 'EPHEMERAL').lt('last_reinforced_at', cutoffDate)"), 'filter harus ACTIVE+EPHEMERAL+lt cutoff');
    assert.ok(src.includes("update({ status: 'ARCHIVED' }).in('id', ids)"), 'harus batch update ke ARCHIVED');
    console.log("  ✔ Line 58-70: cutoff=30 hari, filter ACTIVE+EPHEMERAL+lt(cutoffDate), batch ARCHIVED — benar");
    passed++;
  } catch(e) { console.error('  ✘', e.message); failed++; issues.push('A6'); }

  // A7: Hygiene Step 2 — PERMANENT_FACT & RULE dikecualikan, threshold benar
  console.log('\n[A7] Hygiene Step 2: PERMANENT_FACT & RULE aman dari decay?');
  try {
    const src = require('fs').readFileSync('./src/domain/Memory_Hygiene_Engine.js', 'utf8');
    assert.ok(src.includes("STAGED_THRESHOLD   = 0.60"), 'STAGED threshold harus 0.60');
    assert.ok(src.includes("ARCHIVED_THRESHOLD = 0.30"), 'ARCHIVED threshold harus 0.30');
    assert.ok(src.includes(".neq('category_type', 'PERMANENT_FACT').neq('category_type', 'RULE')"), 'PERMANENT_FACT & RULE harus dikecualikan');
    assert.ok(src.includes("const confidence = Math.exp(-lambda * daysSince)"), 'rumus Ebbinghaus harus dipakai');
    console.log("  ✔ Line 83-100: threshold STAGED=0.60, ARCHIVED=0.30, Ebbinghaus C=e^(-λt), PERMANENT_FACT&RULE excluded");
    passed++;
  } catch(e) { console.error('  ✘', e.message); failed++; issues.push('A7'); }

  // A8: Supersede Engine — race condition guard + category preservation
  console.log('\n[A8] Supersede Engine: mutex guard + category inheritance?');
  try {
    const src = require('fs').readFileSync('./src/core/AI_Router.js', 'utf8');
    // Mutex
    assert.ok(src.includes('_dedupInFlight.has(lockKey)'), 'in-flight check harus ada');
    assert.ok(/finally\s*\{[\s\S]*?_dedupInFlight\.delete\(lockKey\)/.test(src), 'cleanup harus di finally');
    // Category inheritance saat SUPERSEDE
    assert.ok(src.includes("const catType = oldFact?.category_type || await _classifyMemoryCategory(newFact)"), 'category harus inherit dari fakta lama');
    // Fallback jika ID tidak valid
    assert.ok(src.includes('REINFORCE id invalid, saving as NEW'), 'REINFORCE fallback harus ada');
    assert.ok(src.includes('SUPERSEDE id invalid, saving as NEW'), 'SUPERSEDE fallback harus ada');
    console.log("  ✔ Line 1030-1122: mutex=_dedupInFlight, catType=oldFact.category||AI, fallback NEW pada ID invalid");
    passed++;
  } catch(e) { console.error('  ✘', e.message); failed++; issues.push('A8'); }

  // A9: HYGIENE callbacks — ARCHIVE_ALL dan HOLD_ALL benar
  console.log('\n[A9] adapter.js: HYGIENE_ARCHIVE_ALL & HYGIENE_HOLD_ALL logika?');
  try {
    const src = require('fs').readFileSync('./src/interfaces/telegram/adapter.js', 'utf8');
    // ARCHIVE_ALL — harus getStagedForPruning lalu bulkArchiveMemories
    assert.ok(src.includes("const staged = await supabaseMemories.getStagedForPruning()"), 'ARCHIVE_ALL harus query staged dulu');
    assert.ok(src.includes("supabaseMemories.bulkArchiveMemories(upIds, 'USER_PROFILE')"), 'ARCHIVE_ALL harus bulk archive UP');
    assert.ok(src.includes("supabaseMemories.bulkArchiveMemories(ciIds, 'CORE_IDENTITY')"), 'ARCHIVE_ALL harus bulk archive CI');
    assert.ok(src.includes("aiRouter.invalidatePersonalFactsCache()"), 'ARCHIVE_ALL harus invalidate cache setelah arsip');
    // HOLD_ALL — harus reset STAGED → ACTIVE
    assert.ok(src.includes("update({ status: 'ACTIVE' }).eq('status', 'STAGED_FOR_PRUNING')"), 'HOLD_ALL harus reset STAGED→ACTIVE');
    console.log("  ✔ Line 666-720: ARCHIVE_ALL=getStagedForPruning→bulkArchive→invalidateCache, HOLD_ALL=STAGED→ACTIVE");
    passed++;
  } catch(e) { console.error('  ✘', e.message); failed++; issues.push('A9'); }

  // A10: runFullHygienePipeline — 4 step independen, invalidate cache setelah selesai
  console.log('\n[A10] runFullHygienePipeline: 4 step independen, cache invalidated?');
  try {
    const src = require('fs').readFileSync('./src/domain/Memory_Hygiene_Engine.js', 'utf8');
    assert.ok(src.includes("await runEphemeralSweep()"), 'Step 1 harus ada');
    assert.ok(src.includes("await runDecayScoreUpdate()"), 'Step 2 harus ada');
    assert.ok(src.includes("await runContradictionBatchAudit()"), 'Step 3 harus ada');
    assert.ok(src.includes("await reportStagedForPruning(sendTelegramOutbound, stats)"), 'Step 4 harus ada');
    assert.ok(src.includes("aiRouter.invalidatePersonalFactsCache()"), 'cache harus di-invalidate setelah pipeline');
    const tryBlocks = (src.match(/try \{[^}]+await run/g) || []).length;
    console.log(`  ✔ Line 183-194: 4 steps berjalan, cache invalidated, ${tryBlocks} independent try blocks`);
    passed++;
  } catch(e) { console.error('  ✘', e.message); failed++; issues.push('A10'); }

  // ─────────────────────────────────────────────────────────────
  // BAGIAN B: LIVE MEMORY TEST — Database Real
  // ─────────────────────────────────────────────────────────────
  console.log('');
  console.log('══ BAGIAN B: LIVE MEMORY TEST (Database Real Supabase) ════════════════');

  // B1: getAllActiveMemories — data lengkap dari live DB
  console.log('\n[B1] getAllActiveMemories: query live Supabase USER_PROFILE?');
  try {
    const sbMem = require('../src/infrastructure/Supabase_Memories');
    const facts = await sbMem.getAllActiveMemories('USER_PROFILE');
    assert.ok(Array.isArray(facts) && facts.length > 0, 'Harus return array tidak kosong');
    const sample = facts[0];
    assert.ok('id' in sample && 'content' in sample && 'category_type' in sample && 'evidence_count' in sample && 'last_reinforced_at' in sample, 'Harus punya semua 5 kolom Phase 9');
    const validCats = ['PERMANENT_FACT','PREFERENCE','EPHEMERAL','RULE'];
    const invalidRows = facts.filter(f => !validCats.includes(f.category_type));
    assert.strictEqual(invalidRows.length, 0, `Ada ${invalidRows.length} baris dengan category_type tidak valid`);
    console.log(`  ✔ ${facts.length} fakta aktif, semua kolom ada, 0 kategori invalid`);
    console.log(`  ↳ Sample ID:${sample.id} [${sample.category_type}] evidence:${sample.evidence_count} — "${String(sample.content).substring(0, 55)}"`);
    passed++;
  } catch(e) { console.error('  ✘', e.message); failed++; issues.push('B1'); }

  // B2: getAllActiveMemories CORE_IDENTITY
  console.log('\n[B2] getAllActiveMemories: query live Supabase CORE_IDENTITY?');
  try {
    const sbMem = require('../src/infrastructure/Supabase_Memories');
    const facts = await sbMem.getAllActiveMemories('CORE_IDENTITY');
    assert.ok(Array.isArray(facts) && facts.length > 0, 'Harus return array tidak kosong');
    const invalidRows = facts.filter(f => !['PERMANENT_FACT','PREFERENCE','EPHEMERAL','RULE'].includes(f.category_type));
    assert.strictEqual(invalidRows.length, 0, `Ada ${invalidRows.length} kategori invalid`);
    console.log(`  ✔ ${facts.length} fakta core identity aktif, 0 kategori invalid`);
    passed++;
  } catch(e) { console.error('  ✘', e.message); failed++; issues.push('B2'); }

  // B3: getStagedForPruning — struktur return benar
  console.log('\n[B3] getStagedForPruning: return {userProfile, coreIdentity}?');
  try {
    const sbMem = require('../src/infrastructure/Supabase_Memories');
    const staged = await sbMem.getStagedForPruning();
    assert.ok('userProfile' in staged && 'coreIdentity' in staged, 'Harus punya kedua key');
    assert.ok(Array.isArray(staged.userProfile) && Array.isArray(staged.coreIdentity), 'Keduanya harus array');
    console.log(`  ✔ {userProfile: ${staged.userProfile.length}, coreIdentity: ${staged.coreIdentity.length}} — saat ini ${staged.userProfile.length + staged.coreIdentity.length} fakta staged`);
    passed++;
  } catch(e) { console.error('  ✘', e.message); failed++; issues.push('B3'); }

  // B4: Hygiene Pipeline Step 1 + 2 live
  console.log('\n[B4] Memory Hygiene Step 1 & 2 live execution?');
  try {
    const hyg = require('../src/domain/Memory_Hygiene_Engine');
    const s1 = await hyg.runEphemeralSweep();
    const s2 = await hyg.runDecayScoreUpdate();
    assert.ok(typeof s1.archived === 'number', 'Step 1 harus return {archived:number}');
    assert.ok(typeof s2.staged === 'number' && typeof s2.autoArchived === 'number', 'Step 2 harus return {staged,autoArchived}');
    console.log(`  ✔ Step 1: archived=${s1.archived} (0=semua EPHEMERAL masih baru <30 hari)`);
    console.log(`  ✔ Step 2: staged=${s2.staged}, autoArchived=${s2.autoArchived} (0=semua confidence masih tinggi)`);
    passed++;
  } catch(e) { console.error('  ✘', e.message); failed++; issues.push('B4'); }

  // B5: _classifyMemoryCategory — test via callAI 4 kategori representatif
  console.log('\n[B5] AI Classification: 4 fakta representatif diklasifikasikan benar?');
  try {
    const { callAI } = require('../src/core/AI_Router');
    const classify = async (fact) => {
      const prompt = `Classify this personal fact into ONE category:\n\nFACT: "${fact}"\n\nCategories:\n- PERMANENT_FACT: Unchanging objective facts (birth date, blood type, allergies, religion, hometown)\n- PREFERENCE: Personal tastes and habits that may evolve\n- EPHEMERAL: Temporary states that will definitely change\n- RULE: Operational rules for N.E.X.A behavior\n\nReply ONLY with one word: PERMANENT_FACT, PREFERENCE, EPHEMERAL, or RULE`;
      const r = await callAI(prompt, 'Reply with exactly one word from the given options.', 0.0);
      return String(r || '').trim().toUpperCase().replace(/[^A-Z_]/g, '');
    };

    const tests = [
      { fact: 'Tuan Faqih lahir di Banjarnegara dan beragama Islam', expected: 'PERMANENT_FACT' },
      { fact: 'Tuan Faqih menyukai cappuccino dengan gula terpisah', expected: 'PREFERENCE' },
      { fact: 'Tuan Faqih sedang fokus mengerjakan desain ID card minggu ini', expected: 'EPHEMERAL' },
      { fact: 'N.E.X.A harus selalu memanggil pengguna dengan sebutan Tuan', expected: 'RULE' },
    ];

    let correct = 0;
    for (const { fact, expected } of tests) {
      const result = await classify(fact);
      const ok = result === expected;
      if (ok) correct++;
      console.log(`  ${ok ? '✔' : '⚠'} [${result}] ${ok ? '== TEPAT' : `≠ expected ${expected}`} — "${fact.substring(0, 52)}"`);
    }
    assert.ok(correct >= 3, `Minimal 3/4 harus benar, dapat ${correct}/4`);
    console.log(`  ✔ ${correct}/4 klasifikasi tepat oleh AI`);
    passed++;
  } catch(e) { console.error('  ✘', e.message); failed++; issues.push('B5'); }

  // ─────────────────────────────────────────────────────────────
  // RINGKASAN AKHIR
  // ─────────────────────────────────────────────────────────────
  console.log('');
  console.log('╔══════════════════════════════════════════════════════════════════════╗');
  console.log(`║  AUDIT SELESAI: ${passed}/${passed+failed} PASSED | ${failed} FAILED`);
  if (issues.length > 0) {
    console.log('║  ISU DITEMUKAN:');
    issues.forEach(i => console.log(`║    ✘ ${i}`));
  } else {
    console.log('║  STATUS: 100% SEMPURNA — TIDAK ADA ISU DITEMUKAN.                   ║');
  }
  console.log('╚══════════════════════════════════════════════════════════════════════╝');
  if (failed > 0) process.exit(1);
}

runTest().catch(e => { console.error('FATAL:', e.stack); process.exit(1); });
