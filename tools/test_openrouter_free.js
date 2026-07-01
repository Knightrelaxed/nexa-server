require('dotenv').config();
const axios = require('axios');

async function testModel(model) {
  try {
    const start = Date.now();
    const res = await axios.post('https://openrouter.ai/api/v1/chat/completions', {
      model,
      messages: [
        { role: 'system', content: 'Anda adalah asisten AI cerdas dan jujur.' },
        { role: 'user', content: 'Jawab 1 kalimat singkat dalam bahasa Indonesia: Apakah kamu berfungsi normal sebagai benteng pertahanan terakhir N.E.X.A di OpenRouter?' }
      ],
      max_tokens: 100
    }, {
      headers: {
        'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://nexa.ai',
        'X-Title': 'NEXA Assistant'
      },
      timeout: 15000
    });
    console.log(`[SUCCESS] ${model} (${Date.now() - start}ms):\n  "${res.data.choices[0].message.content.trim()}"\n`);
  } catch (e) {
    console.log(`[ERROR] ${model}:`, e.response?.data?.error?.message || e.message);
  }
}

async function runTests() {
  console.log("=== TESTING OPENROUTER FREE MODELS ===");
  await testModel('google/gemma-4-31b-it:free');
  await testModel('nvidia/nemotron-nano-9b-v2:free');
  await testModel('liquid/lfm-2.5-1.2b-instruct:free');
  await testModel('poolside/laguna-m.1:free');
  console.log("=== SELESAI ===");
}

runTests();
