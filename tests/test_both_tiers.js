const episodicRecall = require('../src/domain/Episodic_Recall');

async function testBothTiers() {
  console.log('====================================================');
  console.log('🧪 TEST: DUAL-TIER SEAMLESS RECALL (0-90 HARI & >90 HARI)');
  console.log('====================================================\n');

  const testCases = [
    { label: "TIER 1 (>90 hari / Mei 2026)", q: "Nex, dulu waktu 17 Mei kita ke mana?" },
    { label: "TIER 2 (0-90 hari / Juni 2026)", q: "Nex, pas 1 Juni kemarin aku sempat beli apa?" },
    { label: "TIER 2 (0-90 hari / Agustus 2026)", q: "Pas 16 Agustus kemarin aku minta setel volume apa ke HP?" }
  ];

  for (const tc of testCases) {
    console.log(`📌 [${tc.label}]`);
    console.log(`💬 User: "${tc.q}"`);
    const results = await episodicRecall.searchMemories(tc.q, 1);
    if (results && results.length > 0) {
      const r = results[0];
      console.log(`   ✅ Sumber Data: ${r.is_raw_buffer ? 'nexa_chat_memories (0-90 hari buffer)' : 'nexa_daily_narratives (>90 hari arsip)'}`);
      console.log(`   📅 Tanggal: ${r.narrative_date} (${r.day_name})`);
      console.log(`   📜 Isi Memori: ${r.narrative}`);
    } else {
      console.log(`   ❌ Tidak ditemukan.`);
    }
    console.log('----------------------------------------------------\n');
  }
}

testBothTiers();
