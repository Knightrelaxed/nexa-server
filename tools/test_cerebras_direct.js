require('dotenv').config();
const axios = require('axios');

async function testCerebras() {
  const apiKey = process.env.CEREBRAS_API_KEY;
  if (!apiKey) {
    console.log("[SKIP] CEREBRAS_API_KEY tidak ditemukan di .env");
    return;
  }
  console.log(`\n=== Testing Tier 7: CEREBRAS (gemma-4-31b) ===`);
  try {
    const startTime = Date.now();
    const response = await axios.post('https://api.cerebras.ai/v1/chat/completions', {
      model: 'gemma-4-31b',
      messages: [
        { role: 'system', content: 'Anda adalah asisten cerdas dan jujur.' },
        { role: 'user', content: 'Jawab 1 kalimat dalam bahasa Indonesia: Siapa penyedia hardware/cloud kamu dan apakah kecepatan inference kamu normal saat ini?' }
      ],
      temperature: 0.1,
      max_tokens: 100
    }, {
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      timeout: 15000
    });
    const duration = Date.now() - startTime;
    const answer = response.data.choices[0].message.content;
    console.log(`[SUCCESS] (${duration}ms) Response:\n"${answer.trim()}"`);
  } catch (error) {
    const status = error.response?.status || 'NET';
    const msg = error.response?.data ? JSON.stringify(error.response.data) : error.message;
    console.error(`[ERROR] [${status}] ${msg}`);
  }
}

async function testMistral() {
  const apiKey = process.env.MISTRAL_API_KEY;
  if (!apiKey) {
    console.log("\n[SKIP] MISTRAL_API_KEY tidak ditemukan di .env");
    return;
  }
  console.log(`\n=== Testing Tier 10: MISTRAL (pixtral-12b-2409) ===`);
  try {
    const startTime = Date.now();
    const response = await axios.post('https://api.mistral.ai/v1/chat/completions', {
      model: 'pixtral-12b-2409',
      messages: [
        { role: 'system', content: 'Anda adalah asisten cerdas dan jujur.' },
        { role: 'user', content: 'Jawab 1 kalimat dalam bahasa Indonesia: Dari mana asal penyedia AI kamu dan apakah kamu berfungsi normal saat ini?' }
      ],
      temperature: 0.1,
      max_tokens: 100
    }, {
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      timeout: 15000
    });
    const duration = Date.now() - startTime;
    const answer = response.data.choices[0].message.content;
    console.log(`[SUCCESS] (${duration}ms) Response:\n"${answer.trim()}"`);
  } catch (error) {
    const status = error.response?.status || 'NET';
    const msg = error.response?.data ? JSON.stringify(error.response.data) : error.message;
    console.error(`[ERROR] [${status}] ${msg}`);
  }
}

async function testOpenRouter() {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    console.log("\n[SKIP] OPENROUTER_API_KEY tidak ditemukan di .env");
    return;
  }
  console.log(`\n=== Testing Tier 11: OPENROUTER (google/gemma-2-27b-it) ===`);
  try {
    const startTime = Date.now();
    const response = await axios.post('https://openrouter.ai/api/v1/chat/completions', {
      model: 'google/gemma-2-27b-it',
      messages: [
        { role: 'system', content: 'Anda adalah asisten cerdas dan jujur.' },
        { role: 'user', content: 'Jawab 1 kalimat dalam bahasa Indonesia: Apakah sistem agregator OpenRouter untuk model Gemma 2 berjalan normal saat ini?' }
      ],
      temperature: 0.1,
      max_tokens: 100
    }, {
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      timeout: 15000
    });
    const duration = Date.now() - startTime;
    const answer = response.data.choices[0].message.content;
    console.log(`[SUCCESS] (${duration}ms) Response:\n"${answer.trim()}"`);
  } catch (error) {
    const status = error.response?.status || 'NET';
    const msg = error.response?.data ? JSON.stringify(error.response.data) : error.message;
    console.error(`[ERROR] [${status}] ${msg}`);
  }
}

async function runAll() {
  console.log("=== MEMULAI SANDBOX TESTING TIER 7, 10, & 11 ===");
  await testCerebras();
  await testMistral();
  await testOpenRouter();
  console.log(`\n==============================================`);
  console.log("=== SELESAI ===");
}

runAll();
