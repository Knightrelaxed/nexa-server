require('dotenv').config();
const axios = require('axios');

async function testOpenRouterJson() {
  console.log("=== TESTING OPENROUTER TIER 11 MULTI-MODEL FALLBACK IN JSON MODE ===");
  const models = [
    'google/gemma-4-31b-it:free',
    'meta-llama/llama-3.3-70b-instruct:free',
    'google/gemma-4-26b-a4b-it:free',
    'qwen/qwen3-next-80b-a3b-instruct:free',
    'liquid/lfm-2.5-1.2b-instruct:free'
  ];

  for (const model of models) {
    console.log(`\n--- Mencoba model: ${model} ---`);
    try {
      const start = Date.now();
      const res = await axios.post('https://openrouter.ai/api/v1/chat/completions', {
        model,
        messages: [
          { role: 'system', content: 'You are N.E.X.A, an AI assistant. Output strictly in JSON format.' },
          { role: 'user', content: 'Generate a JSON object with keys "status", "tier", "model", and "message" in Indonesian stating that OpenRouter Tier 11 is functioning normally.' }
        ],
        response_format: { type: 'json_object' },
        max_tokens: 200
      }, {
        headers: {
          'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://nexa.ai',
          'X-Title': 'NEXA Assistant'
        },
        timeout: 15000
      });
      
      const duration = Date.now() - start;
      const content = res.data.choices[0].message.content;
      console.log(`[SUCCESS] (${duration}ms) Response: ${content.trim()}`);
      
      const parsed = JSON.parse(content);
      console.log(`[VERIFIED JSON] status: ${parsed.status}, model: ${parsed.model}`);
      return; // Berhenti setelah sukses pertama
    } catch (e) {
      console.log(`[FAILED] ${model}: ${e.response?.data?.error?.message || e.message}`);
    }
  }
  console.log("\n[ALL MODELS FAILED]");
}

testOpenRouterJson();
