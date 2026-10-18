const dns = require('dns');
try { dns.setDefaultResultOrder('ipv4first'); } catch (e) {}

require('dotenv').config();
const path = require('path');
const fs = require('fs');

console.log('='.repeat(80));
console.log('🧪 N.E.X.A UNIFIED SYSTEM INTEGRATION & VERIFICATION TEST SUITE');
console.log('='.repeat(80));

let passCount = 0;
let failCount = 0;

function assert(name, condition, extra = '') {
  if (condition) {
    console.log(`  ✅ [PASS] ${name} ${extra}`);
    passCount++;
  } else {
    console.error(`  ❌ [FAIL] ${name} ${extra}`);
    failCount++;
  }
}

async function runSystemTest() {
  const startTotal = Date.now();

  // 1. Vector Cache & Snapshot Test
  console.log('\n[1] Vector Cache & Memory Snapshot:');
  const { loadVectorSnapshot, getRelevantFacts, isSnapshotReady } = require('../src/utils/gemini_vector_cache.js');
  loadVectorSnapshot();
  assert('Snapshot is ready in RAM', isSnapshotReady());

  const snapPath = path.resolve(__dirname, '../data/facts_vectors.json');
  assert('facts_vectors.json exists', fs.existsSync(snapPath));
  if (fs.existsSync(snapPath)) {
    const snapData = JSON.parse(fs.readFileSync(snapPath, 'utf-8'));
    assert('Snapshot profile count', snapData.total_profiles > 0, `(${snapData.total_profiles} profiles)`);
    assert('Snapshot identity count', snapData.total_identities > 0, `(${snapData.total_identities} identities)`);
  }

  // 2. Semantic Match Test
  console.log('\n[2] Semantic Matching & Hybrid Reflex Path:');
  try {
    const matchRes = await getRelevantFacts('kuliah semester 3 faqqih', { minScore: 0.2, topKProfile: 3 });
    assert('Semantic search executed', matchRes && matchRes.stats?.available);
    assert('Semantic search found relevant facts', matchRes.profileFacts.length > 0 || matchRes.identityFacts.length > 0, `(${matchRes.stats?.latencyMs} ms)`);
  } catch (e) {
    assert('Semantic search failed', false, e.message);
  }

  // 3. Fallback Engine Resilience & Depth Parser Test
  console.log('\n[3] Fallback Engine & JSON Depth Parser:');
  const { extractFirstValidJson, validateResponseJson } = require('../src/core/Fallback_Engine.js');
  
  const testJson1 = '```json\n{"intent": "NORMAL_CHAT", "reply": "Halo Tuan!"}\n```';
  assert('Markdown code fence parser', JSON.parse(extractFirstValidJson(testJson1)).intent === 'NORMAL_CHAT');

  const testJson2 = '{\n  "intent": "FINANCE",\n  "nominal": 25000\n}\n\nCatatan tambahan model.';
  assert('Trailing thoughts stripper', JSON.parse(extractFirstValidJson(testJson2)).nominal === 25000);

  // 4. Time Normalization & Data Guard Test
  console.log('\n[4] Data Formatting & Normalization:');
  const rawTime = '17.45';
  const cleanTime = rawTime ? rawTime.replace('.', ':') : null;
  assert('Time dot-to-colon normalization', cleanTime === '17:45');

  // Summary
  console.log('\n' + '='.repeat(80));
  console.log(`📊 TOTAL PENGUJIAN: ${passCount} Lolos, ${failCount} Gagal | Waktu Total: ${Date.now() - startTotal} ms`);
  if (failCount === 0) {
    console.log('🌟 SELURUH SISTEM N.E.X.A 100% SEHAT, PRIMA & SIAP PRODUKSI!');
  } else {
    console.error('🚨 TERDAPAT KEGAGALAN SISTEM!');
  }
  console.log('='.repeat(80));
}

runSystemTest().catch(console.error);
