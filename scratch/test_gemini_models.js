require('dotenv').config();
const { GoogleGenerativeAI } = require('@google/generative-ai');
const axios = require('axios');

(async () => {
  const keys = [
    { name: 'GEMINI_API_KEY_1', key: process.env.GEMINI_API_KEY_1 },
    { name: 'GEMINI_API_KEY_2', key: process.env.GEMINI_API_KEY_2 },
    { name: 'GEMINI_API_KEY_3', key: process.env.GEMINI_API_KEY_3 },
    { name: 'GEMINI_API_KEY_4', key: process.env.GEMINI_API_KEY_4 }
  ].filter(k => k.key);

  console.log(`=== CHECKING GEMMA / GEMINI API KEYS (${keys.length} Keys Configured) ===\n`);

  if (keys.length === 0) {
    console.log('No GEMINI_API_KEY configured in .env!');
    return;
  }

  // 1. Check all available models via REST endpoint /v1beta/models for Key 1
  try {
    console.log('--- 1. Fetching available models list from Google AI Studio REST API ---');
    const res = await axios.get(`https://generativelanguage.googleapis.com/v1beta/models?key=${keys[0].key}`);
    const models = res.data.models || [];
    console.log(`Total models returned: ${models.length}`);
    const flashModels = models.filter(m => m.name.includes('flash'));
    console.log('\nAvailable Gemini Flash models:');
    flashModels.forEach(m => {
      console.log(` - [${m.name.replace('models/', '')}] -> Context Limit: ${m.inputTokenLimit} tokens | Output Limit: ${m.outputTokenLimit} tokens | Supported Methods: ${m.supportedGenerationMethods.join(', ')}`);
    });
  } catch (e) {
    console.error('Error fetching models list:', e.response?.data || e.message);
  }

  // 2. Test live inference speed on gemini-3.6-flash and gemini-2.5-flash using Key 1
  const modelsToTest = ['gemini-3.6-flash', 'gemini-2.5-flash', 'gemini-1.5-flash'];
  console.log('\n--- 2. Live Benchmark Speed on Gemini Models (Key 1) ---');
  
  const genAI = new GoogleGenerativeAI(keys[0].key);
  const prompt = 'Halo Gemini! Siapa namamu dan apa keunggulan modelmu? Jawab dalam 2 kalimat singkat.';

  for (const modelId of modelsToTest) {
    const start = Date.now();
    try {
      const model = genAI.getGenerativeModel({ model: modelId });
      const result = await model.generateContent(prompt);
      const text = result.response.text();
      const elapsed = Date.now() - start;
      const approxTokens = Math.round(text.length / 4);
      const tps = Math.round((approxTokens / (elapsed / 1000)) * 10) / 10;
      console.log(`[✓ SUCCESS] ${modelId}`);
      console.log(`  ⏱️ Latency: ${elapsed}ms (${(elapsed/1000).toFixed(2)} detik) | 🚀 ~${tps} TPS`);
      console.log(`  💬 Output : "${text.replace(/\n/g, ' ')}"\n`);
    } catch (e) {
      console.log(`[✗ FAILED ] ${modelId} -> (${Date.now() - start}ms) Error: ${e.message.substring(0, 200)}\n`);
    }
  }

  // 3. Check health of all 4 configured keys on gemini-3.6-flash (or fallback to 2.5-flash)
  console.log('--- 3. Verifying all 4 Gemini API Keys ---');
  for (const k of keys) {
    const start = Date.now();
    try {
      const client = new GoogleGenerativeAI(k.key);
      const model = client.getGenerativeModel({ model: 'gemini-3.6-flash' });
      await model.generateContent('ping');
      console.log(`[✓ OK] ${k.name} -> Active & Ready on gemini-3.6-flash (${Date.now() - start}ms)`);
    } catch (e1) {
      try {
        const client = new GoogleGenerativeAI(k.key);
        const model = client.getGenerativeModel({ model: 'gemini-2.5-flash' });
        await model.generateContent('ping');
        console.log(`[✓ OK] ${k.name} -> Active on gemini-2.5-flash (${Date.now() - start}ms)`);
      } catch (e2) {
        console.log(`[✗ ERR] ${k.name} -> Failed: ${e2.message.substring(0, 100)}`);
      }
    }
  }
})();
