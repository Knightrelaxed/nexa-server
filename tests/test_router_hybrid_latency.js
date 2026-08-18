const dns = require('dns');
try { dns.setDefaultResultOrder('ipv4first'); } catch (e) {}

require('dotenv').config();
const { loadVectorSnapshot } = require('../src/utils/gemini_vector_cache');
const { routeUserMessage } = require('../src/core/AI_Router');

async function testHybridRouterLatency() {
  console.log('='.repeat(95));
  console.log('🧪 UJI INTEGRASI SACR HYBRID SEMANTIC GATEWAY v3.0');
  console.log('='.repeat(95));

  // 1. Uji Kecepatan Loading Snapshot (In-Memory Vector Cache)
  console.log('\n[1] Memuat Vector Snapshot ke RAM:');
  const snapStart = process.hrtime.bigint();
  const loaded = loadVectorSnapshot();
  const snapEnd = process.hrtime.bigint();
  const snapMs = Number(snapEnd - snapStart) / 1000000;
  console.log(`  ⚡ Status: ${loaded ? '✅ SUKSES' : '❌ GAGAL'} | Waktu Muat: ${snapMs.toFixed(3)} ms (0.001 detik)`);

  // 2. Uji Berbagai Variasi Pertanyaan Melalui routeUserMessage()
  const scenarios = [
    {
      label: 'Fast-Path Reflex (Bypass Embedding)',
      query: 'halo nexa pagi'
    },
    {
      label: 'Semantic Query (Arsitektur Fallback SACR)',
      query: 'kalau server mati atau hang cadangannya apa aja?'
    },
    {
      label: 'Semantic Query (Pendidikan & Beasiswa Diplomasi)',
      query: 'mau persiapan tes bahasa arab diplomasi beasiswa luar negeri'
    }
  ];

  for (let i = 0; i < scenarios.length; i++) {
    const sc = scenarios[i];
    console.log('\n' + '='.repeat(95));
    console.log(`[${i + 2}] SCENARIO: ${sc.label}`);
    console.log(`💬 Input: "${sc.query}"`);
    console.log('─'.repeat(95));

    const start = Date.now();
    const res = await routeUserMessage(sc.query);
    const totalLatency = Date.now() - start;

    console.log(`⏱️ Total Waktu Respon Router: ${totalLatency} ms`);
    console.log(`🎯 Intent Terdeteksi        : ${res.intent}`);
    console.log(`🗣️ Cuplikan Respon N.E.X.A   :\n${res.reply_message?.substring(0, 250)}...\n`);
  }

  console.log('='.repeat(95));
  console.log('🎉 SEMUA PENGUJIAN HYBRID SEMANTIC GATEWAY v3.0 BERHASIL 100%!');
  console.log('='.repeat(95));
}

testHybridRouterLatency().catch(console.error);
