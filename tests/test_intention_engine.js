const intentionEngine = require('../src/domain/Intention_Engine');

async function runTests() {
  console.log('====================================================');
  console.log('🧪 UNIT TESTS: UPGRADED INTENTION ENGINE');
  console.log('====================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(name, condition, detail = '') {
    if (condition) {
      console.log(`✅ PASSED: ${name}`);
      passed++;
    } else {
      console.error(`❌ FAILED: ${name} — ${detail}`);
      failed++;
    }
  }

  // ── 1. Ephemeral Micro-Actions (Must return null) ───
  const ephemeralQueries = [
    'Aku mau beli makan yaa',
    'Saya mau istirahat dulu bro',
    'Aku mau sholat dulu bentar',
    'Aku mau ngobrol aja denganmu',
    'Aku mau makan siang',
    'Nanti malam aku mau rebahan santai',
    'Oiya aku mau kasih tau sesuatu',
    'aku mau cek fitur lagi'
  ];

  for (const q of ephemeralQueries) {
    const res = intentionEngine._detectIntention(q);
    assert(`Reject ephemeral: "${q}"`, res === null, `Got: "${res}"`);
  }

  // ── 2. Quoted Reference Texts (Must return null) ───
  const quotedQueries = [
    '[KONTEKS_REFERENSI — Menanggapi pesan N.E.X.A: "jadwal kalender Tuan sedang kosong"]\nOke siap',
    '[KONTEKS_REFERENSI — Menanggapi pesan N.E.X.A: "terfokus pada pemulihan kulit pasca"]\nSelesai',
    '[KONTEKS_REFERENSI — Menanggapi pesan N.E.X.A: "Hahaha, tidur dulu supaya besok pagi otaknya segar lagi buat eksekusi desain"]\nIya besok ku selesaikan'
  ];

  for (const q of quotedQueries) {
    const res = intentionEngine._detectIntention(q);
    assert(`Reject quoted/fragment text`, res === null, `Got: "${res}"`);
  }

  // ── 3. Substantive Real Intentions (Must return clean string) ───
  const substantiveQueries = [
    { input: 'Aku mau daftar beasiswa Jardine tahun ini', expectedKeyword: 'beasiswa' },
    { input: 'Bulan depan rencananya aku mau beli motor Beat', expectedKeyword: 'motor' },
    { input: 'Aku mau daftar MUN di kampus', expectedKeyword: 'MUN' },
    { input: 'Niatnya nanti aku mau mulai riset skripsi', expectedKeyword: 'skripsi' },
    { input: 'Besok aku mau periksa ke dokter paha ketarik', expectedKeyword: 'dokter' }
  ];

  for (const item of substantiveQueries) {
    const res = intentionEngine._detectIntention(item.input);
    const isValid = typeof res === 'string' && res.toLowerCase().includes(item.expectedKeyword.toLowerCase());
    assert(`Accept substantive: "${item.input}" -> "${res}"`, isValid, `Expected keyword ${item.expectedKeyword}, got: "${res}"`);
  }

  console.log('\n----------------------------------------------------');
  console.log(`TOTAL: ${passed} PASSED | ${failed} FAILED`);
  console.log('====================================================');
  if (failed > 0) process.exit(1);
}

runTests();
