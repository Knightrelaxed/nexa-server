require('dotenv').config();
const axios = require('axios');

(async () => {
  const prompt = 'Jelaskan mengapa arsitektur wafer-scale engine dari Cerebras bisa jauh lebih cepat daripada GPU tradisional dalam 2 paragraf singkat bahasa Indonesia.';
  const sys = 'Anda adalah asisten AI N.E.X.A.';
  console.log('=== BENCHMARK HEAD-TO-HEAD: CEREBRAS vs MISTRAL vs GROQ ===\n');

  async function testModel(name, url, key, modelId) {
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
        timeout: 20000
      });
      const elapsed = Date.now() - start;
      const text = res.data.choices[0].message.content;
      const tokens = res.data.usage ? res.data.usage.completion_tokens : Math.round(text.length / 4);
      const tps = Math.round((tokens / (elapsed / 1000)) * 10) / 10;
      console.log(`[${name}] (${modelId})`);
      console.log(`  ⏱️ Waktu Total  : ${elapsed}ms (${(elapsed/1000).toFixed(2)} detik)`);
      console.log(`  📝 Output Tokens: ~${tokens} tokens`);
      console.log(`  🚀 Kecepatan    : ~${tps} tokens/detik`);
      console.log(`  💬 Cuplikan     : "${text.substring(0, 100).replace(/\n/g, ' ')}..."\n`);
      return { name, elapsed, tps, tokens };
    } catch (e) {
      console.log(`[${name}] FAILED (${Date.now() - start}ms): ${e.response?.data?.error?.message || e.message}\n`);
      return { name, elapsed: 99999, tps: 0, tokens: 0 };
    }
  }

  const c = await testModel('Cerebras WSE-3', 'https://api.cerebras.ai/v1/chat/completions', process.env.CEREBRAS_API_KEY_1, 'gemma-4-31b');
  const m1 = await testModel('Mistral Pixtral', 'https://api.mistral.ai/v1/chat/completions', process.env.MISTRAL_API_KEY, 'pixtral-12b-2409');
  const m2 = await testModel('Mistral Ministral', 'https://api.mistral.ai/v1/chat/completions', process.env.MISTRAL_API_KEY, 'ministral-8b-latest');
  const g = await testModel('Groq LPU', 'https://api.groq.com/openai/v1/chat/completions', process.env.GROQ_API_KEY_1, 'llama-3.3-70b-versatile');

  console.log('=== KESIMPULAN PERBANDINGAN ===');
  const results = [c, m1, m2, g].sort((a,b) => a.elapsed - b.elapsed);
  results.forEach((r, idx) => {
    if (r.elapsed !== 99999) {
      console.log(`${idx+1}. ${r.name} -> ${r.elapsed}ms (${r.tps} tokens/sec | ~${r.tokens} tokens generated)`);
    }
  });
})();
