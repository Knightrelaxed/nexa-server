const episodicRecall = require('../src/domain/Episodic_Recall');

async function testGeneralized() {
  console.log('====================================================');
  console.log('🧪 TEST: GENERALIZED DYNAMIC RECALL (ZERO HARDCODING)');
  console.log('====================================================\n');

  const testQueries = [
    "Nex, dulu waktu bulan Mei aku pernah minjemin uang ke siapa ya?",
    "Waktu itu pas makan Magelangan gimana catatannya?",
    "Dulu pas awal-awal Mei kita ngapain aja soal perbaikan kode sistem?",
    "Waktu 17 Mei kita ke mana?"
  ];

  for (const q of testQueries) {
    console.log(`🔎 QUERY: "${q}"`);
    const results = await episodicRecall.searchMemories(q, 2);
    if (results.length > 0) {
      results.forEach(r => {
        console.log(`   ✅ Matched: ${r.narrative_date} (${r.day_name}) -> ${r.narrative.substring(0, 110)}...`);
      });
    } else {
      console.log(`   ❌ No match found.`);
    }
    console.log('');
  }
}

testGeneralized();
