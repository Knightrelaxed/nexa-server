require('dotenv').config();
const axios = require('axios');

const promptLogic = `Tuan Faqih memiliki uang Rp 500.000 di Dompet Cash dan Rp 1.000.000 di Bank Mandiri. Hari ini ia membayar tagihan listrik sebesar Rp 300.000 menggunakan Mandiri, lalu meminjamkan uang ke temannya Budi sebesar Rp 200.000 dari Dompet Cash. Temannya Budi langsung membayar hutang tersebut sebagian sebesar Rp 50.000 melalui transfer ke Mandiri.
Pertanyaan:
1. Berapa total saldo akhir di Dompet Cash (angka integer tanpa titik/Rp)?
2. Berapa total saldo akhir di Bank Mandiri (angka integer tanpa titik/Rp)?
3. Berapa sisa piutang (utang teman) yang belum dibayar Budi (angka integer tanpa titik/Rp)?
4. Kategori apa yang paling cocok untuk pengeluaran tagihan listrik?
Jawab HANYA dalam format JSON dengan key: 'saldo_cash', 'saldo_mandiri', 'piutang_budi', 'kategori_listrik', dan 'alasan_logika' (berisi penjelasan singkat langkah perhitungannya dalam bahasa Indonesia).`;

async function testModelLogic(modelName, apiKey) {
  console.log(`\n======================================================`);
  console.log(`=== MENGUJI LOGIKA: ${modelName} ===`);
  console.log(`======================================================`);
  try {
    const startTime = Date.now();
    const response = await axios.post('https://api.groq.com/openai/v1/chat/completions', {
      model: modelName,
      messages: [
        { role: 'system', content: 'Anda adalah asisten keuangan cerdas yang memiliki kemampuan matematika dan logika sempurna. Selalu jawab dalam format JSON yang valid.' },
        { role: 'user', content: promptLogic }
      ],
      temperature: 0.1,
      reasoning_format: 'hidden',
      response_format: { type: 'json_object' }
    }, {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      timeout: 20000
    });
    const duration = Date.now() - startTime;
    console.log(`[SUCCESS] Waktu Eksekusi: ${duration}ms`);
    console.log(`[OUTPUT JSON]:\n`, JSON.stringify(JSON.parse(response.data.choices[0].message.content), null, 2));
  } catch (error) {
    const status = error.response?.status || 'NET';
    const msg = error.response?.data?.error?.message || error.message;
    console.error(`[ERROR] [${status}] ${msg}`);
  }
}

async function runLogicBenchmark() {
  const apiKey = process.env.GROQ_API_KEY_1;
  if (!apiKey) {
    console.error("GROQ_API_KEY_1 tidak ditemukan di .env");
    return;
  }
  
  console.log("=== MEMULAI BENCHMARK LOGIKA KEUANGAN N.E.X.A ===");
  // Test Model Baru (Qwen 3.6 27B)
  await testModelLogic("qwen/qwen3.6-27b", apiKey);
  
  console.log(`\n======================================================`);
  console.log("=== SELESAI ===");
}

runLogicBenchmark();
