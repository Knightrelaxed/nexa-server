require('dotenv').config();
const axios = require('axios');

async function testGroqKey(keyName, apiKey) {
  if (!apiKey) {
    console.log(`[SKIP] ${keyName}: Key not found in .env`);
    return;
  }
  console.log(`\n=== Testing ${keyName} (qwen/qwen3.6-27b) ===`);
  try {
    const startTime = Date.now();
    const response = await axios.post('https://api.groq.com/openai/v1/chat/completions', {
      model: 'qwen/qwen3.6-27b',
      messages: [
        { role: 'system', content: 'You are a concise assistant.' },
        { role: 'user', content: 'Jawab dengan singkat: Apakah sistem model qwen/qwen3.6-27b berjalan normal saat ini?' }
      ],
      temperature: 0.1,
      max_tokens: 100
    }, {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      timeout: 10000
    });
    const duration = Date.now() - startTime;
    console.log(`[SUCCESS] (${duration}ms) Response:`, response.data.choices[0].message.content.trim());
  } catch (error) {
    const status = error.response?.status || 'NET';
    const msg = error.response?.data?.error?.message || error.message;
    console.error(`[ERROR] [${status}] ${msg}`);
  }
}

async function runAllTests() {
  console.log("=== MEMULAI SANDBOX TESTING GROQ API KEYS ===");
  await testGroqKey("GROQ_API_KEY_1 (Tier 1)", process.env.GROQ_API_KEY_1);
  await testGroqKey("GROQ_API_KEY_2 (Tier 2)", process.env.GROQ_API_KEY_2);
  await testGroqKey("GROQ_API_KEY_3 (Tier 3)", process.env.GROQ_API_KEY_3);
  await testGroqKey("GROQ_API_KEY_4 (Tier 4)", process.env.GROQ_API_KEY_4);
  console.log("\n=== SELESAI ===");
}

runAllTests();
