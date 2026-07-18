require('dotenv').config();
const axios = require('axios');

(async () => {
  const token = process.env.HF_INFERENCE_TOKEN;
  console.log('=== TESTING HOW TO PIN CEREBRAS PROVIDER ON HUGGING FACE ROUTER ===\n');

  const tests = [
    { name: 'Header: x-inference-provider: cerebras', url: 'https://router.huggingface.co/v1/chat/completions', headers: { 'x-inference-provider': 'cerebras' }, body: { model: 'google/gemma-4-31B-it' } },
    { name: 'Header: X-Inference-Provider: cerebras', url: 'https://router.huggingface.co/v1/chat/completions', headers: { 'X-Inference-Provider': 'cerebras' }, body: { model: 'google/gemma-4-31B-it' } },
    { name: 'Header: x-provider: cerebras', url: 'https://router.huggingface.co/v1/chat/completions', headers: { 'x-provider': 'cerebras' }, body: { model: 'google/gemma-4-31B-it' } },
    { name: 'Body: provider: cerebras', url: 'https://router.huggingface.co/v1/chat/completions', headers: {}, body: { model: 'google/gemma-4-31B-it', provider: 'cerebras' } },
    { name: 'URL: /cerebras/v1/chat/completions', url: 'https://router.huggingface.co/cerebras/v1/chat/completions', headers: {}, body: { model: 'google/gemma-4-31B-it' } },
    { name: 'URL: /hf-inference/models/google/gemma-4-31B-it (old router URL)', url: 'https://router.huggingface.co/hf-inference/models/google/gemma-4-31B-it/v1/chat/completions', headers: {}, body: { model: 'google/gemma-4-31B-it' } }
  ];

  for (const t of tests) {
    const start = Date.now();
    try {
      const res = await axios.post(t.url, {
        messages: [{ role: 'user', content: 'Hitung 1+1' }],
        max_tokens: 20,
        ...t.body
      }, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          ...t.headers
        },
        timeout: 10000
      });
      const elapsed = Date.now() - start;
      const providerUsed = res.headers['x-inference-provider'] || res.headers['x-provider'] || 'unknown';
      console.log(`[✓] ${t.name} -> OK (${elapsed}ms) | ACTUAL PROVIDER: ${providerUsed}`);
    } catch (e) {
      console.log(`[✗] ${t.name} -> FAILED (${Date.now() - start}ms): ${e.response?.status || e.message} (${JSON.stringify(e.response?.data || {})})`);
    }
  }
})();
