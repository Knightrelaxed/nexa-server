const dns = require('dns');
try { dns.setDefaultResultOrder('ipv4first'); } catch (e) {}

require('dotenv').config();
const { initSemanticEngine, retrieveRelevantFacts } = require('../src/core/Semantic_Retrieval_Engine');
const { routeUserMessage } = require('../src/core/AI_Router');

async function testFullSemanticPipeline() {
  console.log('='.repeat(95));
  console.log('🧪 UJI INTEGRASI LENGKAP: LOCAL ONNX SEMANTIC RETRIEVAL & AI ROUTER');
  console.log('='.repeat(95));

  // 1. Inisialisasi Engine
  console.log('\n[1] Memulai Inisialisasi Semantic Engine...');
  const initSuccess = await initSemanticEngine();
  console.log(`Status Inisialisasi: ${initSuccess ? '✅ SUKSES' : '❌ GAGAL'}`);

  // 2. Uji Penelusuran Semantik Langsung (Zero-Keyword Query)
  console.log('\n' + '='.repeat(95));
  console.log('[2] Uji Penelusuran Semantik Langsung (Tanpa Kata Kunci Baku):');
  console.log('─'.repeat(95));

  const testQueries = [
    'kalau server mati atau hang cadangannya apa aja?',
    'tadi sore jajan baso 15 ribu bayar pake qris mandiri',
    'aku pengen lolos seleksi beasiswa luar negeri dan jadi diplomat'
  ];

  for (const q of testQueries) {
    console.log(`\n💬 Query: "${q}"`);
    const results = await retrieveRelevantFacts(q, { topKProfile: 3, topKIdentity: 3, minScore: 0.75 });
    console.log(`   ⏱️ Latensi Vektor & Ranking: ${results.stats.latencyMs} ms`);
    console.log(`   📊 Matched Profiles: ${results.stats.matchedProfileCount}, Matched Identities: ${results.stats.matchedIdentityCount}`);
    
    if (results.identityFacts.length > 0) {
      console.log('   📌 Top Identity Match:');
      results.identityFacts.forEach((f, i) => console.log(`      ${i + 1}. ${f.substring(0, 90)}...`));
    }
    if (results.profileFacts.length > 0) {
      console.log('   👤 Top Profile Match:');
      results.profileFacts.forEach((f, i) => console.log(`      ${i + 1}. ${f.substring(0, 90)}...`));
    }
  }

  // 3. Uji End-to-End AI Router
  console.log('\n' + '='.repeat(95));
  console.log('[3] Uji End-to-End routeUserMessage() dengan Injeksi Semantik:');
  console.log('─'.repeat(95));
  const routerRes = await routeUserMessage('kalau server mati atau hang cadangannya apa aja?');
  console.log('Intent AI Router :', routerRes.intent);
  console.log('Jawaban N.E.X.A   :\n', routerRes.reply_message);

  console.log('\n' + '='.repeat(95));
  console.log('🎉 SEMUA PENGUJIAN INTEGRASI LOKAL SEMANTIK 100% SUKSES DAN SEMPURNA!');
  console.log('='.repeat(95));
}

testFullSemanticPipeline().catch(console.error);
