require('dotenv').config();
const axios = require('axios');

(async () => {
  const token = process.env.HF_INFERENCE_TOKEN;
  console.log('=== CHECKING HUGGING FACE ROUTER MODELS & PROVIDERS FOR GEMMA 4 31B ===\n');

  try {
    const res = await axios.get('https://router.huggingface.co/v1/models', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const models = res.data.data || res.data;
    console.log(`Total models returned from HF Router: ${models.length}`);
    const gemmaModels = models.filter(m => JSON.stringify(m).toLowerCase().includes('gemma') || JSON.stringify(m).toLowerCase().includes('cerebras') || JSON.stringify(m).toLowerCase().includes('31b'));
    console.log('\nMatching models (Gemma / Cerebras / 31B):');
    gemmaModels.forEach(m => console.log(JSON.stringify(m, null, 2)));
  } catch (e) {
    console.error('Error fetching /v1/models:', e.response?.data || e.message);
  }

  // Let's also test calling HF Router with x-use-provider header or provider param or different model ID casing!
  const testCases = [
    { name: 'google/gemma-4-31B-it (default provider)', model: 'google/gemma-4-31B-it', headers: {} },
    { name: 'google/gemma-4-31B-it (provider: cerebras header)', model: 'google/gemma-4-31B-it', headers: { 'x-use-provider': 'cerebras' } },
    { name: 'google/gemma-4-31B-it (provider: together header)', model: 'google/gemma-4-31B-it', headers: { 'x-use-provider': 'together' } },
    { name: 'google/gemma-4-31B-it (provider: fireworks header)', model: 'google/gemma-4-31B-it', headers: { 'x-use-provider': 'fireworks' } }
  ];

  for (const tc of testCases) {
    const start = Date.now();
    try {
      const res = await axios.post('https://router.huggingface.co/v1/chat/completions', {
        model: tc.model,
        messages: [{ role: 'user', content: 'hi' }],
        max_tokens: 10
      }, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          ...tc.headers
        },
        timeout: 10000
      });
      const elapsed = Date.now() - start;
      const providerUsed = res.headers['x-compute-type'] || res.headers['x-compute-provider'] || res.headers['x-provider'] || 'unknown';
      console.log(`\n[✓] ${tc.name} -> OK (${elapsed}ms) | Provider Header: ${providerUsed} | Headers: ${JSON.stringify(res.headers)}`);
    } catch (e) {
      console.log(`\n[✗] ${tc.name} -> FAILED (${Date.now() - start}ms): ${JSON.stringify(e.response?.data || e.message)}`);
    }
  }
})();
