const { pipeline, env } = require('@xenova/transformers');
env.cacheDir = './.cache/models';

function cosineSimilarity(vecA, vecB) {
  let dotProduct = 0, normA = 0, normB = 0;
  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

async function testMultilingualModel(modelName) {
  console.log('\n' + '='.repeat(95));
  console.log(`🌐 MENGUJI MODEL MULTILINGUAL: ${modelName}`);
  console.log('='.repeat(95));

  const startLoad = Date.now();
  const extractor = await pipeline('feature-extraction', modelName, { quantized: true });
  console.log(`✅ Model dimuat dalam ${Date.now() - startLoad} ms`);

  async function computeVector(text) {
    const start = process.hrtime.bigint();
    const output = await extractor(text, { pooling: 'mean', normalize: true });
    const end = process.hrtime.bigint();
    return {
      vector: Array.from(output.data),
      latencyMs: Number(end - start) / 1000000
    };
  }

  const facts = [
    {
      id: 248,
      title: 'Arsitektur Fallback SACR 16-Tier',
      text: '[SACR DUAL-MODE ROUTING (LIGHT & HEAVY)] Kamu beroperasi dengan 16 lapisan failover: Mode Heavy (Gemini 3.7 -> Gemini 3.6 -> Google Gemma 4), Mode Light (Cerebras -> Gemini 3.7 -> Gemini 3.6).'
    },
    {
      id: 5,
      title: 'Catatan Keuangan & Transaksi QRIS',
      text: '[FINANCE TRANSACTIONS] Tuan Faqih mencatat pengeluaran rutin beli kopi, jajan makanan, transfer bank Mandiri, dan pembayaran via QRIS BCA.'
    },
    {
      id: 1,
      title: 'Pendidikan Sastra Arab UGM & Beasiswa Jardine',
      text: '[USER PROFILE] Tuan Faqih adalah mahasiswa Sastra Arab UGM, penerima beasiswa bergengsi Jardine Foundation, bercita-cita menjadi diplomat.'
    }
  ];

  const embeddedFacts = [];
  for (const f of facts) {
    const v = await computeVector(f.text);
    embeddedFacts.push({ ...f, vector: v.vector });
  }

  const testQueries = [
    { q: 'kalau server mati atau hang cadangannya apa aja?', expected: 248 },
    { q: 'tadi sore jajan baso 15 ribu bayar pake qris mandiri', expected: 5 },
    { q: 'aku pengen lolos seleksi beasiswa luar negeri dan jadi diplomat', expected: 1 }
  ];

  for (const item of testQueries) {
    console.log(`\n💬 Pertanyaan User: "${item.q}"`);
    const qVec = await computeVector(item.q);
    console.log(`   ⏱️ Kecepatan: ${qVec.latencyMs.toFixed(2)} ms`);

    const ranked = embeddedFacts.map(f => ({
      id: f.id,
      title: f.title,
      score: cosineSimilarity(qVec.vector, f.vector)
    })).sort((a, b) => b.score - a.score);

    ranked.forEach((r, idx) => {
      const isExpected = r.id === item.expected ? '🏆 [COCOK PERSIS!]' : '   [Lainnya]';
      console.log(`     ${idx + 1}. ID #${r.id} (${(r.score * 100).toFixed(2)}%) - ${r.title} ${isExpected}`);
    });
  }
}

async function runAll() {
  await testMultilingualModel('Xenova/paraphrase-multilingual-MiniLM-L12-v2');
  await testMultilingualModel('Xenova/multilingual-e5-small');
}

runAll().catch(console.error);
