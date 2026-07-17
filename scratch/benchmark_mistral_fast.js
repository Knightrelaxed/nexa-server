require('dotenv').config();
const axios = require('axios');

(async () => {
  const prompt = 'Tuliskan 3 tips singkat manajemen waktu dan produktivitas dalam bahasa Indonesia.';
  const sys = 'Anda adalah asisten AI N.E.X.A yang cepat dan ringkas.';
  const models = [
    'ministral-3b-latest',
    'ministral-8b-latest',
    'mistral-tiny-latest',
    'open-mistral-nemo',
    'mistral-small-latest',
    'magistral-small-latest',
    'codestral-latest',
    'pixtral-12b-2409'
  ];

  console.log('=== BENCHMARK KECEPATAN KILAT SELURUH MODEL MISTRAL ===\n');
  const results = [];

  for (const modelId of models) {
    const start = Date.now();
    try {
      const res = await axios.post('https://api.mistral.ai/v1/chat/completions', {
        model: modelId,
        messages: [
          { role: 'system', content: sys },
          { role: 'user', content: prompt }
        ],
        max_tokens: 180,
        temperature: 0.2
      }, {
        headers: {
          'Authorization': `Bearer ${process.env.MISTRAL_API_KEY}`,
          'Content-Type': 'application/json'
        },
        timeout: 15000
      });
      const elapsed = Date.now() - start;
      const text = res.data.choices[0].message.content;
      const tokens = res.data.usage ? res.data.usage.completion_tokens : Math.round(text.length / 4);
      const tps = Math.round((tokens / (elapsed / 1000)) * 10) / 10;
      console.log(`[✓] ${modelId.padEnd(23)} -> ${elapsed}ms | ~${tokens} tokens | 🚀 ${tps} tokens/sec`);
      results.push({ modelId, elapsed, tokens, tps });
    } catch (e) {
      console.log(`[✗] ${modelId.padEnd(23)} -> FAILED (${e.response?.status || e.message})`);
    }
  }

  console.log('\n=== PERINGKAT MISTRAL TERCEPAT (Berdasarkan TPS & Waktu) ===');
  results.sort((a,b) => b.tps - a.tps);
  results.forEach((r, idx) => {
    console.log(`${idx+1}. ${r.modelId.padEnd(23)} : ${r.tps} tokens/sec (Selesai dalam ${r.elapsed}ms untuk ~${r.tokens} token)`);
  });
})();
