require('dotenv').config();
const axios = require('axios');

async function checkCerebrasLimits() {
  const apiKey = process.env.CEREBRAS_API_KEY;
  if (!apiKey) return console.log("[SKIP] CEREBRAS_API_KEY not found");
  
  console.log("\n========================================================");
  console.log("=== CHECKING CEREBRAS (gemma-4-31b) RATE LIMITS & USAGE ===");
  console.log("========================================================");
  try {
    const startTime = Date.now();
    const response = await axios.post('https://api.cerebras.ai/v1/chat/completions', {
      model: 'gemma-4-31b',
      messages: [
        { role: 'system', content: 'You are N.E.X.A, an AI assistant.' },
        { role: 'user', content: 'Hitung 5 + 5 dan jelaskan singkat dalam bahasa Indonesia.' }
      ],
      max_tokens: 100
    }, {
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' }
    });
    
    console.log(`[SUCCESS] Duration: ${Date.now() - startTime}ms`);
    console.log(`[USAGE METRICS]:`, JSON.stringify(response.data.usage, null, 2));
    
    console.log(`[RATE LIMIT HEADERS]:`);
    const headers = response.headers;
    for (const key of Object.keys(headers)) {
      if (key.toLowerCase().includes('limit') || key.toLowerCase().includes('quota') || key.toLowerCase().includes('remaining') || key.toLowerCase().includes('reset') || key.toLowerCase().includes('request') || key.toLowerCase().includes('token')) {
        console.log(`  ${key}: ${headers[key]}`);
      }
    }
  } catch (error) {
    console.error(`[ERROR]`, error.response?.data || error.message);
    if (error.response?.headers) {
      console.log(`[ERROR HEADERS]:`, JSON.stringify(error.response.headers, null, 2));
    }
  }
}

async function checkMistralLimits() {
  const apiKey = process.env.MISTRAL_API_KEY;
  if (!apiKey) return console.log("[SKIP] MISTRAL_API_KEY not found");
  
  console.log("\n========================================================");
  console.log("=== CHECKING MISTRAL (pixtral-12b-2409) RATE LIMITS & USAGE ===");
  console.log("========================================================");
  try {
    const startTime = Date.now();
    const response = await axios.post('https://api.mistral.ai/v1/chat/completions', {
      model: 'pixtral-12b-2409',
      messages: [
        { role: 'system', content: 'You are N.E.X.A, an AI assistant.' },
        { role: 'user', content: 'Hitung 10 + 10 dan jelaskan singkat dalam bahasa Indonesia.' }
      ],
      max_tokens: 100
    }, {
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' }
    });
    
    console.log(`[SUCCESS] Duration: ${Date.now() - startTime}ms`);
    console.log(`[USAGE METRICS]:`, JSON.stringify(response.data.usage, null, 2));
    
    console.log(`[RATE LIMIT HEADERS]:`);
    const headers = response.headers;
    for (const key of Object.keys(headers)) {
      if (key.toLowerCase().includes('limit') || key.toLowerCase().includes('quota') || key.toLowerCase().includes('remaining') || key.toLowerCase().includes('reset') || key.toLowerCase().includes('ratelimit')) {
        console.log(`  ${key}: ${headers[key]}`);
      }
    }
  } catch (error) {
    console.error(`[ERROR]`, error.response?.data || error.message);
    if (error.response?.headers) {
      console.log(`[ERROR HEADERS]:`, JSON.stringify(error.response.headers, null, 2));
    }
  }
}

async function runBenchmark() {
  console.log("=== STARTING TPM/RPM & TOKEN CALCULATION BENCHMARK ===");
  await checkCerebrasLimits();
  await checkMistralLimits();
  console.log("\n========================================================");
  console.log("=== BENCHMARK COMPLETED ===");
}

runBenchmark();
