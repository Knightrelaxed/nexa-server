const { GoogleGenerativeAI } = require('@google/generative-ai');
const axios = require('axios');
const env = require('../config/env');

// ============================================================
// MULTI-KEY AI INITIALIZATION
// ============================================================
const geminiClients = [
  env.GEMINI_API_KEY_1 ? new GoogleGenerativeAI(env.GEMINI_API_KEY_1) : null,
  env.GEMINI_API_KEY_2 ? new GoogleGenerativeAI(env.GEMINI_API_KEY_2) : null,
  env.GEMINI_API_KEY_3 ? new GoogleGenerativeAI(env.GEMINI_API_KEY_3) : null,
  env.GEMINI_API_KEY_4 ? new GoogleGenerativeAI(env.GEMINI_API_KEY_4) : null
];

const groqKeys = [
  env.GROQ_API_KEY_1,
  env.GROQ_API_KEY_2,
  env.GROQ_API_KEY_3,
  env.GROQ_API_KEY_4
];

/**
 * Execute AI Prompt with Multi-Tier Fallback (11 Layers)
 *
 * Tier 1-4 : Groq Llama 3.3 70B Key 1-4  (The Sprinters — fast & cheap)
 * Tier 5-6 : Gemini 2.5 Flash Key 1-2     (The Deep Thinkers)
 * Tier 7   : Cerebras Llama 3.3 70B       (The Backup Sprinter)
 * Tier 8-9 : Gemini 2.0 Flash Key 3-4    (The Infinite Context)
 * Tier 10  : Mistral Pixtral 12B          (The Reliable Closer)
 * Tier 11  : OpenRouter Gemma 2 27B       (The Last Resort)
 */
async function executeWithFallback(prompt, systemInstruction = "", temperature = 0.3, jsonMode = true) {
  // Build tier list dynamically based on available keys
  const tiers = [
    // Tier 1-4: Groq Llama 3.3 70B
    ...groqKeys.map((key, i) => key ? {
      name: `Tier ${i + 1} (Groq Key ${i + 1})`,
      fn: () => callGroq(key, prompt, systemInstruction, temperature, jsonMode)
    } : null).filter(Boolean),

    // Tier 5-6: Gemini 2.5 Flash
    ...(geminiClients[0] ? [{ name: `Tier 5 (Gemini 2.5 Flash Key 1)`, fn: () => callGeminiWithRetry(geminiClients[0], 'gemini-2.5-flash', prompt, systemInstruction, temperature, jsonMode) }] : []),
    ...(geminiClients[1] ? [{ name: `Tier 6 (Gemini 2.5 Flash Key 2)`, fn: () => callGeminiWithRetry(geminiClients[1], 'gemini-2.5-flash', prompt, systemInstruction, temperature, jsonMode) }] : []),

    // Tier 7: Cerebras Llama 3.3 70B
    ...(env.CEREBRAS_API_KEY ? [{ name: `Tier 7 (Cerebras Llama 3.3 70B)`, fn: () => callCerebras(prompt, systemInstruction, temperature, jsonMode) }] : []),

    // Tier 8-9: Gemini 2.0 Flash
    ...(geminiClients[2] ? [{ name: `Tier 8 (Gemini 2.0 Flash Key 3)`, fn: () => callGeminiWithRetry(geminiClients[2], 'gemini-2.0-flash', prompt, systemInstruction, temperature, jsonMode) }] : []),
    ...(geminiClients[3] ? [{ name: `Tier 9 (Gemini 2.0 Flash Key 4)`, fn: () => callGeminiWithRetry(geminiClients[3], 'gemini-2.0-flash', prompt, systemInstruction, temperature, jsonMode) }] : []),

    // Tier 10: Mistral Pixtral 12B
    ...(env.MISTRAL_API_KEY ? [{ name: `Tier 10 (Mistral Pixtral 12B)`, fn: () => callMistral(prompt, systemInstruction, temperature, jsonMode) }] : []),

    // Tier 11: OpenRouter Gemma 2
    ...(env.OPENROUTER_API_KEY ? [{ name: `Tier 11 (OpenRouter)`, fn: () => callOpenRouter(prompt, systemInstruction, temperature, jsonMode) }] : [])
  ];

  // Execute fallback chain
  for (const tier of tiers) {
    try {
      console.log(`[FALLBACK] Trying ${tier.name}...`);
      const result = await tier.fn();
      
      console.log(`[FALLBACK] ✅ ${tier.name} SUCCESS.`);
      console.log(`[FALLBACK] 📄 Response Preview: ${result.substring(0, 500).replace(/\\n/g, ' ')}...`);
      return result;
    } catch (e) {
      console.warn(`[FALLBACK] ❌ ${tier.name} failed:`, e.message);
    }
  }

  // Fallback Final
  console.error('[FALLBACK] ⚠️ All 11 AI layers exhausted. Entering Dumb Mode.');
  return JSON.stringify({
    intent: 'DUMB_MODE',
    extracted_data: null,
    god_mode_trigger: false,
    reply_message: '⚠️ Sistem Otak N.E.X.A (AI Router) mengalami Down Total di semua 11 peladen dunia. Mohon tunggu beberapa saat.'
  });
}

// ----------------------------------------------------
// API WRAPPERS WITH 503 SMART RETRY
// ----------------------------------------------------

async function callGeminiWithRetry(client, modelName, prompt, systemInstruction, temperature, jsonMode = true, retries = 3) {
  const generationConfig = { temperature };
  if (jsonMode) generationConfig.responseMimeType = 'application/json';
  
  const model = client.getGenerativeModel({
    model: modelName,
    systemInstruction: systemInstruction,
    generationConfig
  });

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const response = await model.generateContent(prompt);
      return response.response.text();
    } catch (e) {
      if (e.message.includes('503') && attempt < retries) {
        const delay = attempt * 2000;
        console.warn(`[FALLBACK] Gemini 503 attempt ${attempt}/${retries}, retry in ${delay}ms...`);
        await new Promise(r => setTimeout(r, delay));
        continue;
      }
      throw e;
    }
  }
}

async function callGroq(apiKey, prompt, systemInstruction, temperature, jsonMode = true, retries = 3) {
  const requestBody = {
    model: 'llama-3.3-70b-versatile',
    messages: [
      { role: 'system', content: systemInstruction },
      { role: 'user', content: prompt }
    ],
    temperature
  };
  if (jsonMode) requestBody.response_format = { type: 'json_object' };

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const response = await axios.post('https://api.groq.com/openai/v1/chat/completions', requestBody, {
        headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        timeout: 15000
      });
      return response.data.choices[0].message.content;
    } catch (e) {
      if (e.response?.status === 503 && attempt < retries) {
        await new Promise(r => setTimeout(r, attempt * 2000));
        continue;
      }
      throw e;
    }
  }
}

async function callCerebras(prompt, systemInstruction, temperature, jsonMode = true, retries = 3) {
  const requestBody = {
    model: 'llama-3.3-70b',  // Updated: Cerebras renamed model from 'llama3.1-70b' to 'llama-3.3-70b'
    messages: [
      { role: 'system', content: systemInstruction },
      { role: 'user', content: prompt }
    ],
    temperature
  };
  if (jsonMode) requestBody.response_format = { type: 'json_object' };

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const response = await axios.post('https://api.cerebras.ai/v1/chat/completions', requestBody, {
        headers: { 'Authorization': `Bearer ${env.CEREBRAS_API_KEY}`, 'Content-Type': 'application/json' },
        timeout: 15000
      });
      return response.data.choices[0].message.content;
    } catch (e) {
      // Fail fast on 404 (wrong model/endpoint) or 429 (rate limit) — no point retrying
      if (e.response?.status === 404 || e.response?.status === 429) throw e;
      if (e.response?.status === 503 && attempt < retries) {
        await new Promise(r => setTimeout(r, attempt * 2000));
        continue;
      }
      throw e;
    }
  }
}

async function callMistral(prompt, systemInstruction, temperature, jsonMode = true, retries = 3) {
  const requestBody = {
    model: 'pixtral-12b-2409',
    messages: [
      { role: 'system', content: systemInstruction },
      { role: 'user', content: prompt }
    ],
    temperature
  };
  if (jsonMode) requestBody.response_format = { type: 'json_object' };

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const response = await axios.post('https://api.mistral.ai/v1/chat/completions', requestBody, {
        headers: { 'Authorization': `Bearer ${env.MISTRAL_API_KEY}`, 'Content-Type': 'application/json' },
        timeout: 15000
      });
      return response.data.choices[0].message.content;
    } catch (e) {
      if (e.response?.status === 503 && attempt < retries) {
        await new Promise(r => setTimeout(r, attempt * 2000));
        continue;
      }
      throw e;
    }
  }
}

async function callOpenRouter(prompt, systemInstruction, temperature, jsonMode = true, retries = 3) {
  const requestBody = {
    model: 'google/gemma-2-27b-it',
    messages: [
      { role: 'system', content: systemInstruction },
      { role: 'user', content: prompt }
    ],
    temperature
  };
  if (jsonMode) requestBody.response_format = { type: 'json_object' };

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const response = await axios.post('https://openrouter.ai/api/v1/chat/completions', requestBody, {
        headers: { 'Authorization': `Bearer ${env.OPENROUTER_API_KEY}`, 'Content-Type': 'application/json' },
        timeout: 15000
      });
      return response.data.choices[0].message.content;
    } catch (e) {
      if (e.response?.status === 503 && attempt < retries) {
        await new Promise(r => setTimeout(r, attempt * 2000));
        continue;
      }
      throw e;
    }
  }
}

module.exports = { executeWithFallback };
