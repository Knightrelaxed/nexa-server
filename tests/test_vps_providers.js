const dns = require('dns');
try { dns.setDefaultResultOrder('ipv4first'); } catch (e) {}

require('dotenv').config();
const axios = require('axios');

async function testProviders() {
  console.log('='.repeat(80));
  console.log('🧪 TESTING AI PROVIDERS DIRECTLY FROM AZURE VPS JAKARTA');
  console.log('='.repeat(80));

  // 1. Mistral AI
  try {
    const start = Date.now();
    const res = await axios.post('https://api.mistral.ai/v1/chat/completions', {
      model: 'pixtral-12b-2409',
      messages: [{ role: 'user', content: 'Hai' }],
      max_tokens: 15
    }, {
      headers: { Authorization: `Bearer ${process.env.MISTRAL_API_KEY}` },
      timeout: 10000
    });
    console.log(`✅ [1] MISTRAL AI: SUCCESS (${Date.now() - start} ms) ->`, res.data.choices[0].message.content.trim());
  } catch (e) {
    console.log('❌ [1] MISTRAL AI FAILED:', e.response?.status, e.message);
  }

  // 2. Puter AI (Free GPT-4o-mini / Claude)
  try {
    const start = Date.now();
    const res = await axios.post('https://api.puter.com/puterai/openai/v1/chat/completions', {
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: 'Hai' }],
      max_tokens: 15
    }, {
      headers: { Authorization: `Bearer ${process.env.PUTER_AUTH_TOKEN}` },
      timeout: 10000
    });
    console.log(`✅ [2] PUTER AI: SUCCESS (${Date.now() - start} ms) ->`, res.data.choices[0].message.content.trim());
  } catch (e) {
    console.log('❌ [2] PUTER AI FAILED:', e.response?.status, e.message);
  }

  // 3. OpenRouter (Gemma 4 31B Free via Global Gateway)
  try {
    const start = Date.now();
    const res = await axios.post('https://openrouter.ai/api/v1/chat/completions', {
      model: 'google/gemma-4-31b-it:free',
      messages: [{ role: 'user', content: 'Hai' }],
      max_tokens: 15
    }, {
      headers: {
        Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
        'HTTP-Referer': 'https://nexa.ai',
        'X-Title': 'NEXA Assistant'
      },
      timeout: 10000
    });
    console.log(`✅ [3] OPENROUTER GEMMA 4 FREE: SUCCESS (${Date.now() - start} ms) ->`, res.data.choices[0].message.content.trim());
  } catch (e) {
    console.log('❌ [3] OPENROUTER GEMMA 4 FAILED:', e.response?.status, e.message);
  }
}

testProviders().catch(console.error);
