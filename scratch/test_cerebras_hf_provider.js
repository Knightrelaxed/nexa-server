require('dotenv').config();
const axios = require('axios');

(async () => {
  const token = process.env.HF_INFERENCE_TOKEN;
  console.log('=== CHECKING MAPPING & PROVIDER CEREBRAS ON HUGGING FACE ===\n');

  // 1. Check what models provider "cerebras" supports on HF Router
  try {
    console.log('--- 1. Fetching models specifically under /cerebras/v1/models ---');
    const res = await axios.get('https://router.huggingface.co/cerebras/v1/models', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    console.log('Models under /cerebras/v1/models:', JSON.stringify(res.data, null, 2));
  } catch (e) {
    console.log('Could not fetch /cerebras/v1/models:', e.response?.status, e.response?.data || e.message);
  }

  // 2. Check full model info for google/gemma-4-31B-it from /v1/models
  try {
    console.log('\n--- 2. Checking full info of google/gemma-4-31B-it providers ---');
    const res = await axios.get('https://router.huggingface.co/v1/models/google/gemma-4-31B-it', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    console.log('Model info:', JSON.stringify(res.data, null, 2));
  } catch (e) {
    console.log('Could not fetch single model info:', e.response?.status, e.response?.data || e.message);
  }

  // 3. Test various ways to call google/gemma-4-31B-it or gemma-4 with Cerebras provider on HF Router
  console.log('\n--- 3. Testing chat completion requests targeting Cerebras on HF ---');
  const attempts = [
    {
      desc: 'URL: /v1/chat/completions + body: { model: "google/gemma-4-31B-it", provider: "cerebras" }',
      url: 'https://router.huggingface.co/v1/chat/completions',
      headers: {},
      body: { model: 'google/gemma-4-31B-it', provider: 'cerebras' }
    },
    {
      desc: 'URL: /cerebras/v1/chat/completions + body: { model: "google/gemma-4-31B-it" }',
      url: 'https://router.huggingface.co/cerebras/v1/chat/completions',
      headers: {},
      body: { model: 'google/gemma-4-31B-it' }
    },
    {
      desc: 'URL: /cerebras/v1/chat/completions + body: { model: "gemma-4-31b" }',
      url: 'https://router.huggingface.co/cerebras/v1/chat/completions',
      headers: {},
      body: { model: 'gemma-4-31b' }
    },
    {
      desc: 'URL: /cerebras/v1/chat/completions + body: { model: "cerebras/Gemma-4-31B-IT" }',
      url: 'https://router.huggingface.co/cerebras/v1/chat/completions',
      headers: {},
      body: { model: 'cerebras/Gemma-4-31B-IT' }
    },
    {
      desc: 'URL: /v1/chat/completions + header: x-use-provider: cerebras + body: { model: "google/gemma-4-31B-it" }',
      url: 'https://router.huggingface.co/v1/chat/completions',
      headers: { 'x-use-provider': 'cerebras' },
      body: { model: 'google/gemma-4-31B-it' }
    },
    {
      desc: 'URL: /v1/chat/completions + header: x-inference-provider: cerebras + body: { model: "google/gemma-4-31B-it" }',
      url: 'https://router.huggingface.co/v1/chat/completions',
      headers: { 'x-inference-provider': 'cerebras' },
      body: { model: 'google/gemma-4-31B-it' }
    },
    {
      desc: 'URL: /v1/chat/completions + body: { model: "google/gemma-4-31B-it:cerebras" }',
      url: 'https://router.huggingface.co/v1/chat/completions',
      headers: {},
      body: { model: 'google/gemma-4-31B-it:cerebras' }
    }
  ];

  for (const a of attempts) {
    const start = Date.now();
    try {
      const res = await axios.post(a.url, {
        messages: [{ role: 'user', content: 'hi' }],
        max_tokens: 15,
        ...a.body
      }, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          ...a.headers
        },
        timeout: 12000
      });
      const elapsed = Date.now() - start;
      const providerUsed = res.headers['x-inference-provider'] || res.headers['x-provider'] || 'unknown';
      console.log(`[✓ SUCCESS] ${a.desc} -> ${elapsed}ms | Actual Provider Header: ${providerUsed}`);
    } catch (e) {
      console.log(`[✗ FAILED ] ${a.desc} -> (${Date.now() - start}ms) Status: ${e.response?.status} | Error: ${JSON.stringify(e.response?.data || e.message)}`);
    }
  }
})();
