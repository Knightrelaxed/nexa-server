require('dotenv').config();
const axios = require('axios');

(async () => {
  const prompt = 'Jelaskan mengapa model bahasa besar (LLM) dengan arsitektur transformer sangat efektif dalam memahami konteks kalimat bahasa Indonesia dalam 2 paragraf padat.';
  const sys = 'Anda adalah asisten AI N.E.X.A yang cerdas dan analitis.';

  console.log('=== BENCHMARK: CEREBRAS OFFICIAL vs HUGGING FACE (GEMMA 4 31B) ===\n');

  async function testModel(name, url, key, modelId) {
    if (!key) {
      console.log(`[✗] ${name} (${modelId}) -> SKIPPED (No API Key/Token configured)\n`);
      return null;
    }
    const start = Date.now();
    try {
      const res = await axios.post(url, {
        model: modelId,
        messages: [
          { role: 'system', content: sys },
          { role: 'user', content: prompt }
        ],
        max_tokens: 300,
        temperature: 0.3
      }, {
        headers: {
          'Authorization': `Bearer ${key}`,
          'Content-Type': 'application/json'
        },
        timeout: 25000
      });
      const elapsed = Date.now() - start;
      const text = res.data.choices[0].message.content;
      const tokens = res.data.usage ? res.data.usage.completion_tokens : Math.round(text.length / 4);
      const tps = Math.round((tokens / (elapsed / 1000)) * 10) / 10;
      console.log(`[✓] ${name} (${modelId})`);
      console.log(`  ⏱️ Waktu Total  : ${elapsed}ms (${(elapsed/1000).toFixed(2)} detik)`);
      console.log(`  📝 Output Tokens: ~${tokens} tokens`);
      console.log(`  🚀 Kecepatan    : ~${tps} tokens/detik`);
      console.log(`  💬 Cuplikan     : "${text.substring(0, 100).replace(/\n/g, ' ')}..."\n`);
      return { name, modelId, elapsed, tokens, tps };
    } catch (e) {
      const errDetail = e.response?.data?.error?.message || e.response?.data || e.message;
      console.log(`[✗] ${name} (${modelId}) -> FAILED (${Date.now() - start}ms): ${typeof errDetail === 'object' ? JSON.stringify(errDetail) : errDetail}\n`);
      return { name, modelId, elapsed: 99999, tokens: 0, tps: 0 };
    }
  }

  const c = await testModel(
    'Official Cerebras WSE-3',
    'https://api.cerebras.ai/v1/chat/completions',
    process.env.CEREBRAS_API_KEY_1,
    'gemma-4-31b'
  );

  const hf1 = await testModel(
    'Hugging Face Router (Google)',
    'https://router.huggingface.co/v1/chat/completions',
    process.env.HF_INFERENCE_TOKEN,
    'google/gemma-4-31B-it'
  );

  const hf2 = await testModel(
    'Hugging Face Router (Cerebras Repo)',
    'https://router.huggingface.co/v1/chat/completions',
    process.env.HF_INFERENCE_TOKEN,
    'cerebras/gemma-4-31b-it'
  );

  console.log('=== KESIMPULAN PERBANDINGAN ===');
  const results = [c, hf1, hf2].filter(Boolean).sort((a,b) => a.elapsed - b.elapsed);
  results.forEach((r, idx) => {
    if (r.elapsed !== 99999) {
      console.log(`${idx+1}. ${r.name} (${r.modelId}) -> ${r.elapsed}ms | 🚀 ${r.tps} tokens/sec`);
    } else {
      console.log(`${idx+1}. ${r.name} (${r.modelId}) -> FAILED/UNAVAILABLE`);
    }
  });
})();
