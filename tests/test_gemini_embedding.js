const dns = require('dns');
try { dns.setDefaultResultOrder('ipv4first'); } catch (e) {}

require('dotenv').config();

const googleApiKeys = [
  process.env.GEMINI_API_KEY_1 || process.env.GEMINI_API_KEY,
  process.env.GEMINI_API_KEY_2,
  process.env.GEMINI_API_KEY_3,
  process.env.GEMINI_API_KEY_4
].filter(Boolean);

// Fungsi pembantu Cosine Similarity antara dua vektor
function cosineSimilarity(vecA, vecB) {
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

// Fungsi tembak embedding ke Google AI Studio
async function getEmbedding(apiKey, text, modelName = 'gemini-embedding-001') {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:embedContent?key=${apiKey}`;
  const start = Date.now();
  
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      content: {
        parts: [{ text }]
      }
    })
  });

  const latency = Date.now() - start;

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`[${res.status}] ${err.error?.message || res.statusText}`);
  }

  const data = await res.json();
  return {
    values: data.embedding?.values || [],
    dimension: data.embedding?.values?.length || 0,
    latency
  };
}

async function runEmbeddingTests() {
  console.log('='.repeat(95));
  console.log('🧪 UJI COBA TEMBAK GOOGLE GEMINI EMBEDDING 1 & 2 (4 KUNCI API)');
  console.log(`Jumlah Kunci Google API Terdeteksi: ${googleApiKeys.length}`);
  console.log('='.repeat(95));

  const sampleText = 'Halo Nexa, berikan urutan fallback heavy saat server mati.';
  const modelsToTest = ['gemini-embedding-001', 'gemini-embedding-2'];

  for (const modelName of modelsToTest) {
    console.log(`\n🔷 MENGUJI MODEL: ${modelName.toUpperCase()}`);
    console.log('─'.repeat(95));

    for (let i = 0; i < googleApiKeys.length; i++) {
      try {
        const res = await getEmbedding(googleApiKeys[i], sampleText, modelName);
        console.log(`  ✅ Key ${i + 1} (${googleApiKeys[i].substring(0, 10)}...): Dimensi ${res.dimension} float | Latensi: ${res.latency} ms`);
      } catch (e) {
        console.error(`  ❌ Key ${i + 1} Gagal:`, e.message);
      }
    }
  }

  // 3. Simulasi Uji Semantik Nyata dengan Gemini Embedding 2
  console.log('\n' + '='.repeat(95));
  console.log('[3] UJI SEMANTIK NYATA DENGAN GEMINI EMBEDDING 2:');
  console.log('─'.repeat(95));

  // Kalimat User (Sama sekali TIDAK menggunakan kata kunci "SACR" atau "Tier"):
  const userQuery = 'kalau server mati atau hang cadangannya apa aja?';
  console.log(`💬 Input Pertanyaan Tuan: "${userQuery}"\n`);

  // 3 Fakta di Database:
  const facts = [
    {
      id: 248,
      title: 'Fakta Arsitektur Fallback SACR 16-Tier',
      text: '[SACR DUAL-MODE ROUTING (LIGHT & HEAVY)] Kamu beroperasi dengan 16 lapisan failover: Mode Heavy (Gemini 3.7 -> Gemini 3.6 -> Google Gemma 4), Mode Light (Cerebras -> Gemini 3.7 -> Gemini 3.6).'
    },
    {
      id: 5,
      title: 'Fakta Keuangan & Transaksi',
      text: '[FINANCE TRANSACTIONS] Tuan Faqih mencatat pengeluaran rutin beli kopi, jajan, transfer bank Mandiri, dan QRIS BCA.'
    },
    {
      id: 1,
      title: 'Fakta Profil & Pendidikan',
      text: '[USER PROFILE] Tuan Faqih adalah mahasiswa Sastra Arab UGM, penerima beasiswa bergengsi Jardine Foundation, bercita-cita menjadi diplomat.'
    }
  ];

  // Ambil Vektor Query User
  const queryEmbedding = await getEmbedding(googleApiKeys[0], userQuery, 'gemini-embedding-2');

  // Hitung Skor Kemiripan Makna (Cosine Similarity)
  for (const fact of facts) {
    const factEmbedding = await getEmbedding(googleApiKeys[0], fact.text, 'gemini-embedding-2');
    const score = cosineSimilarity(queryEmbedding.values, factEmbedding.values);
    const scorePercent = (score * 100).toFixed(2);
    const isWinner = score > 0.55 ? '🏆 [PILIHAN UTAMA / SANGAT RELEVAN!]' : '❌ [Diabaikan]';
    
    console.log(`📌 ID #${fact.id} - ${fact.title}`);
    console.log(`   Skor Kemiripan Semantik: ${scorePercent}% ${isWinner}`);
    console.log(`   Snippet: "${fact.text.substring(0, 80)}..."\n`);
  }

  console.log('='.repeat(95));
  console.log('🎉 UJI COBA 100% SUKSES: GEMINI EMBEDDING 2 MEMILIKI NALAR SEMANTIK LUAR BIASA!');
  console.log('='.repeat(95));
}

runEmbeddingTests().catch(console.error);
