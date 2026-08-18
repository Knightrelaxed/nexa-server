const dns = require('dns');
try { dns.setDefaultResultOrder('ipv4first'); } catch (e) {}

require('dotenv').config();

const googleApiKeys = [
  process.env.GEMINI_API_KEY_1 || process.env.GEMINI_API_KEY,
  process.env.GEMINI_API_KEY_2,
  process.env.GEMINI_API_KEY_3,
  process.env.GEMINI_API_KEY_4
].filter(Boolean);

// Cosine Similarity
function cosineSimilarity(vecA, vecB) {
  if (!vecA || !vecB || vecA.length !== vecB.length) return 0;
  let dotProduct = 0, normA = 0, normB = 0;
  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dotProduct / denom;
}

// 1. Single Query Embedding via Google AI Studio
async function getSingleEmbedding(text, apiKey = googleApiKeys[0], model = 'gemini-embedding-2') {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:embedContent?key=${apiKey}`;
  const start = Date.now();
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      content: { parts: [{ text }] }
    })
  });
  const latency = Date.now() - start;
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`[${res.status}] ${err.error?.message || res.statusText}`);
  }
  const data = await res.json();
  return {
    vector: data.embedding?.values || [],
    dimension: data.embedding?.values?.length || 0,
    latency
  };
}

// 2. Batch Embedding (Meng-embed puluhan fakta sekaligus dalam 1 kali request HTTP!)
async function getBatchEmbeddings(textArray, apiKey = googleApiKeys[0], model = 'gemini-embedding-2') {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:batchEmbedContents?key=${apiKey}`;
  const start = Date.now();
  
  const requests = textArray.map(t => ({
    model: `models/${model}`,
    content: { parts: [{ text: t }] }
  }));

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ requests })
  });

  const latency = Date.now() - start;
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`[${res.status}] ${err.error?.message || res.statusText}`);
  }

  const data = await res.json();
  const embeddings = (data.embeddings || []).map(e => e.values || []);
  return {
    embeddings,
    count: embeddings.length,
    latency
  };
}

async function runGeminiEmbeddingSuite() {
  console.log('='.repeat(95));
  console.log('☁️  UJI COBA GOOGLE GEMINI CLOUD EMBEDDING (BATCH & SINGLE QUERY)');
  console.log(`Jumlah Kunci Google API: ${googleApiKeys.length}`);
  console.log('='.repeat(95));

  // 1. Uji Single Query (Menghitung Vektor Pertanyaan User)
  console.log('\n[1] Menguji Latensi Single Query (Pertanyaan Tuan):');
  const userQuery = 'kalau server mati atau hang cadangannya apa aja?';
  const queryRes = await getSingleEmbedding(userQuery);
  console.log(`  💬 Query: "${userQuery}"`);
  console.log(`  ⚡ Latensi Tembak Google API: ${queryRes.latency} ms | Dimensi Vektor: ${queryRes.dimension} float`);

  // 2. Uji BATCH EMBEDDING (Meng-embed 10 Fakta Sekaligus dalam 1 Request HTTP!)
  console.log('\n' + '='.repeat(95));
  console.log('[2] Menguji Fitur BATCH EMBEDDING (10 Fakta Sekaligus dalam 1 Request):');
  console.log('─'.repeat(95));

  const sampleFacts = [
    { id: 248, title: 'SACR 16-Tier Fallback', text: '[SACR DUAL-MODE ROUTING] Kamu beroperasi dengan 16 lapisan failover saat server down.' },
    { id: 215, title: 'Azure VPS Architecture', text: '[AZURE VPS JAKARTA] Server N.E.X.A berjalan di VM Ubuntu 24.04 data center Jakarta.' },
    { id: 5,   title: 'Finance Mandiri QRIS', text: '[FINANCE TRANSACTIONS] Tuan Faqih mencatat pengeluaran rutin via QRIS BCA dan Mandiri.' },
    { id: 1,   title: 'UGM & Beasiswa Jardine', text: '[USER PROFILE] Tuan Faqih mahasiswa Sastra Arab UGM penerima beasiswa Jardine diplomat.' },
    { id: 12,  title: 'Target Tabungan Motor', text: '[GOALS] Tabungan untuk membeli motor Beat saat ini sedang dikumpulkan.' },
    { id: 19,  title: 'Laptop Crash & Desain', text: '[DEVICE] Laptop ThinkPad Tuan Faqih sempat mati mendadak saat mendesain.' },
    { id: 45,  title: 'Uptime Watchdog', text: '[WATCHDOG] Sistem UptimeRobot memantau health check /health setiap 90 detik.' },
    { id: 88,  title: 'Supabase Database', text: '[DATABASE] Supabase PostgreSQL menyimpan seluruh memori dan histori transaksi.' },
    { id: 99,  title: 'Jadwal Kuliah', text: '[ACADEMIC] Masuk kuliah semester 3 pertengahan Agustus 2026.' },
    { id: 105, title: 'Kebiasaan Makan', text: '[HABITS] Tuan Faqih menyukai es teh, es jeruk, nasi telur, dan ayam krispi.' }
  ];

  const batchTexts = sampleFacts.map(f => f.text);
  const batchRes = await getBatchEmbeddings(batchTexts);
  console.log(`  📦 Berhasil meng-embed ${batchRes.count} fakta sekaligus dalam ${batchRes.latency} ms!`);
  console.log(`  ⏱️ Rata-rata per fakta: ${(batchRes.latency / batchRes.count).toFixed(1)} ms/fakta (Super Efisien!)`);

  // 3. Uji Ranking Kecocokan Semantik
  console.log('\n' + '='.repeat(95));
  console.log('[3] HASIL RANKING KECOCOKAN SEMANTIK TERHADAP PERTANYAAN:');
  console.log(`💬 "${userQuery}"`);
  console.log('─'.repeat(95));

  const scoredFacts = sampleFacts.map((f, i) => ({
    ...f,
    score: cosineSimilarity(queryRes.vector, batchRes.embeddings[i])
  })).sort((a, b) => b.score - a.score);

  scoredFacts.forEach((f, idx) => {
    const isWinner = idx === 0 ? '🏆 [COCOK PERSIS / TOP #1]' : idx < 3 ? '🥈 [Relevan]' : '   [Diabaikan]';
    console.log(`  ${idx + 1}. ID #${f.id} (${(f.score * 100).toFixed(2)}%) - ${f.title} ${isWinner}`);
  });

  console.log('\n' + '='.repeat(95));
  console.log('🎉 PENGUJIAN GEMINI CLOUD EMBEDDING BERHASIL 100% TANPA BEBAN RAM/DISK DI SERVER!');
  console.log('='.repeat(95));
}

runGeminiEmbeddingSuite().catch(console.error);
