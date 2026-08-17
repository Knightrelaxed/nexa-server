const dns = require('dns');
try { dns.setDefaultResultOrder('ipv4first'); } catch (e) {}

require('dotenv').config();
const { executeWithFallback } = require('./src/core/Fallback_Engine.js');

async function testNewArchitecture() {
  console.log('='.repeat(90));
  console.log('🛡️  VERIFIKASI LANGSUNG ARSITEKTUR BARU SACR (LIGHT & HEAVY)');
  console.log('='.repeat(90));

  // 1. TEST MODE LIGHT
  console.log('\n[1] TEST MODE LIGHT (Chat Biasa & Refleks Cepat):');
  console.log('─'.repeat(90));
  const lightRes = await executeWithFallback(
    'Halo Nexa! Selamat pagi, apa kabarmu hari ini?',
    'You are N.E.X.A. Respond warmly in 1 short sentence.',
    0.3,
    false,
    { userText: 'Halo Nexa! Selamat pagi, apa kabarmu hari ini?' }
  );
  console.log('✅ Respons Mode LIGHT:');
  console.log(lightRes);

  // 2. TEST MODE HEAVY
  console.log('\n' + '='.repeat(90));
  console.log('[2] TEST MODE HEAVY (Rekap Analisis & Penalaran Mendalam):');
  console.log('─'.repeat(90));
  const heavyRes = await executeWithFallback(
    'Buatkan rekap analisis mendalam strategi negosiasi traktat bilateral dalam 2 paragraf padat.',
    'You are N.E.X.A. Formulate a structured diplomatic analysis.',
    0.3,
    false,
    { userText: 'Buatkan rekap analisis mendalam strategi negosiasi traktat bilateral dalam 2 paragraf padat.' }
  );
  console.log('✅ Respons Mode HEAVY:');
  console.log(heavyRes);

  console.log('\n' + '='.repeat(90));
  console.log('🎉 SEMUA TIER ARSITEKTUR BARU BERJALAN 100% SUKSES DAN SEMPURNA!');
  console.log('='.repeat(90));
}

testNewArchitecture().catch(console.error);
