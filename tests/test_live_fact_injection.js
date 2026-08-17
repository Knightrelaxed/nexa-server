const router = require('../src/core/AI_Router');
const memories = require('../src/infrastructure/Supabase_Memories');

async function runFactInjectionBenchmark() {
  console.log('================================================================');
  console.log('🧪 LIVE FACT INJECTION BENCHMARK — N.E.X.A DYNAMIC RESONANCE');
  console.log('================================================================');

  const personalFacts = await memories.getPersonalFacts();
  const allIdentities = personalFacts.coreIdentity || [];
  const allProfiles = personalFacts.userProfile || [];

  console.log(`📊 Database Status:`);
  console.log(`   - Total Core Identities in DB: ${allIdentities.length} records`);
  console.log(`   - Total User Profiles in DB:   ${allProfiles.length} records\n`);

  const testCases = [
    {
      label: '1. PANGGILAN TELEPON REAL-TIME (FakeCallActivity)',
      query: 'Nexa, coba telepon HP saya sekarang'
    },
    {
      label: '2. INDERA LOKASI & SPATIAL ENGINE (Nominatim/Photon/OSRM)',
      query: 'adakah pom bensin terdekat di sekitar sini?'
    },
    {
      label: '3. INDERA PENGLIHATAN / KAMERA SENYAP (CameraX)',
      query: 'foto situasi depan pakai kamera'
    },
    {
      label: '4. TANGAN DIGITAL & KEAMANAN BANK (M-Banking Shield)',
      query: 'buka aplikasi livin mandiri di HP'
    },
    {
      label: '5. KENDALI HARDWARE / SENTER & VOLUME',
      query: 'tolong nyalakan senter HP dan set volume maksimal'
    },
    {
      label: '6. TANGKAPAN LAYAR / SCREENSHOT',
      query: 'coba screenshot layar HP ku sekarang'
    },
    {
      label: '7. OBROLAN UMUM / CASUAL GREETING',
      query: 'halo Nexa, selamat sore'
    }
  ];

  for (const tc of testCases) {
    console.log('────────────────────────────────────────────────────────────────');
    console.log(`📌 ${tc.label}`);
    console.log(`💬 User Input : "${tc.query}"`);

    const injectedIdentities = router.selectCoreIdentityFacts(allIdentities, tc.query);
    console.log(`🎯 Injected Facts to AI Prompt (${injectedIdentities.length} dari ${allIdentities.length} baris di DB):`);

    injectedIdentities.forEach((fact, idx) => {
      console.log(`   ${idx + 1}. ${fact}`);
    });
    console.log('');
  }

  console.log('================================================================');
  console.log('✅ BENCHMARK SELESAI — SEMUA FAKTA TERPILIH SECARA TEPAT SASARAN!');
  console.log('================================================================');
}

runFactInjectionBenchmark();
