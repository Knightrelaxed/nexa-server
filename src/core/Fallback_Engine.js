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
 * Tier 1-2 : Groq Compound Key 1-2            (70k TPM Deep Executive Brain)
 * Tier 3-4 : Groq Compound Mini Key 3-4       (70k TPM Ultra-Fast Router)
 * Tier 5-8 : Gemini 2.5 Flash Key 1-4  (The Deep Thinkers & Infinite Quota)
 * Tier 9   : Cerebras Gemma 4 31B       (The Backup Sprinter)
 * Tier 10  : Mistral Pixtral 12B        (The Reliable Closer)
 * Tier 11  : OpenRouter Multi-Model Free (The Indestructible Last Resort)
 */
const getErrDetails = (e) => {
  const status = e.status || e.response?.status || 'NET';
  const data = e.response?.data ? JSON.stringify(e.response.data) : '';
  return `[${status}] ${e.message} ${data ? '| ' + data : ''}`.substring(0, 500);
};

async function executeWithFallback(prompt, systemInstruction = "", temperature = 0.3, jsonMode = true) {
  // Tier 1: Groq Compound (Key 1 - 70k TPM)
  if (groqKeys[0]) {
    try {
      return await callGroq(groqKeys[0], prompt, systemInstruction, temperature, jsonMode, 3, 'groq/compound');
    } catch (e) { console.warn('[FALLBACK] Tier 1 (Groq Compound Key 1) failed:', getErrDetails(e)); }
  }

  // Tier 2: Groq Compound (Key 2 - 70k TPM)
  if (groqKeys[1]) {
    try {
      console.log('[FALLBACK] Switching to Tier 2 (Groq Compound Key 2)...');
      return await callGroq(groqKeys[1], prompt, systemInstruction, temperature, jsonMode, 3, 'groq/compound');
    } catch (e) { console.warn('[FALLBACK] Tier 2 (Groq Compound Key 2) failed:', getErrDetails(e)); }
  }

  // Tier 3: Groq Compound Mini (Key 3 - 70k TPM)
  if (groqKeys[2]) {
    try {
      console.log('[FALLBACK] Switching to Tier 3 (Groq Compound Mini Key 3)...');
      return await callGroq(groqKeys[2], prompt, systemInstruction, temperature, jsonMode, 3, 'groq/compound-mini');
    } catch (e) { console.warn('[FALLBACK] Tier 3 (Groq Compound Mini Key 3) failed:', getErrDetails(e)); }
  }

  // Tier 4: Groq Compound Mini (Key 4 - 70k TPM)
  if (groqKeys[3]) {
    try {
      console.log('[FALLBACK] Switching to Tier 4 (Groq Compound Mini Key 4)...');
      return await callGroq(groqKeys[3], prompt, systemInstruction, temperature, jsonMode, 3, 'groq/compound-mini');
    } catch (e) { console.warn('[FALLBACK] Tier 4 (Groq Compound Mini Key 4) failed:', getErrDetails(e)); }
  }

  // Tier 5: Gemini 2.5 Flash (Key 1)
  if (geminiClients[0]) {
    try {
      console.log('[FALLBACK] Switching to Tier 5 (Gemini 2.5 Flash Key 1)...');
      return await callGeminiWithRetry(geminiClients[0], 'gemini-2.5-flash', prompt, systemInstruction, temperature, jsonMode);
    } catch (e) { console.warn('[FALLBACK] Tier 5 (Gemini 2.5 Key 1) failed:', getErrDetails(e)); }
  }

  // Tier 6: Gemini 2.5 Flash (Key 2)
  if (geminiClients[1]) {
    try {
      console.log('[FALLBACK] Switching to Tier 6 (Gemini 2.5 Flash Key 2)...');
      return await callGeminiWithRetry(geminiClients[1], 'gemini-2.5-flash', prompt, systemInstruction, temperature, jsonMode);
    } catch (e) { console.warn('[FALLBACK] Tier 6 (Gemini 2.5 Key 2) failed:', getErrDetails(e)); }
  }

  // Tier 7: Gemini 2.5 Flash (Key 3)
  if (geminiClients[2]) {
    try {
      console.log('[FALLBACK] Switching to Tier 7 (Gemini 2.5 Flash Key 3)...');
      return await callGeminiWithRetry(geminiClients[2], 'gemini-2.5-flash', prompt, systemInstruction, temperature, jsonMode);
    } catch (e) { console.warn('[FALLBACK] Tier 7 (Gemini 2.5 Key 3) failed:', getErrDetails(e)); }
  }

  // Tier 8: Gemini 2.5 Flash (Key 4)
  if (geminiClients[3]) {
    try {
      console.log('[FALLBACK] Switching to Tier 8 (Gemini 2.5 Flash Key 4)...');
      return await callGeminiWithRetry(geminiClients[3], 'gemini-2.5-flash', prompt, systemInstruction, temperature, jsonMode);
    } catch (e) { console.warn('[FALLBACK] Tier 8 (Gemini 2.5 Key 4) failed:', getErrDetails(e)); }
  }

  // Tier 9: Cerebras Gemma 4 31B
  if (env.CEREBRAS_API_KEY) {
    try {
      console.log('[FALLBACK] Switching to Tier 9 (Cerebras Gemma 4 31B)...');
      return await callCerebras(prompt, systemInstruction, temperature, jsonMode);
    } catch (e) { console.warn('[FALLBACK] Tier 9 (Cerebras) failed:', getErrDetails(e)); }
  }

  // Tier 10: Mistral API (Pixtral 12B)
  if (env.MISTRAL_API_KEY) {
    try {
      console.log('[FALLBACK] Switching to Tier 10 (Mistral Pixtral 12B)...');
      return await callMistral(prompt, systemInstruction, temperature, jsonMode);
    } catch (e) { console.warn('[FALLBACK] Tier 10 (Mistral) failed:', getErrDetails(e)); }
  }

  // Tier 11: OpenRouter (Gemma 2 27B)
  if (env.OPENROUTER_API_KEY) {
    try {
      console.log('[FALLBACK] Switching to Tier 11 (OpenRouter)...');
      return await callOpenRouter(prompt, systemInstruction, temperature, jsonMode);
    } catch (e) { console.warn('[FALLBACK] Tier 11 (OpenRouter) failed:', getErrDetails(e)); }
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

async function callGroq(apiKey, prompt, systemInstruction, temperature, jsonMode = true, retries = 3, modelName = 'groq/compound') {
  const requestBody = {
    model: modelName,
    messages: [
      { role: 'system', content: systemInstruction },
      { role: 'user', content: prompt }
    ],
    temperature,
    max_tokens: 350
  };
  if (modelName.includes('qwen')) requestBody.reasoning_format = 'hidden';
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
    model: 'gemma-4-31b',  // Updated: Cerebras deprecated llama-3.3-70b and upgraded to gemma-4-31b
    messages: [
      { role: 'system', content: systemInstruction },
      { role: 'user', content: prompt }
    ],
    temperature,
    max_tokens: 1500
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
    temperature,
    max_tokens: 1500
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

async function callOpenRouter(prompt, systemInstruction, temperature, jsonMode = true, retries = 2) {
  const models = [
    'google/gemma-4-31b-it:free',
    'google/gemma-4-26b-a4b-it:free',
    'meta-llama/llama-3.3-70b-instruct:free',
    'qwen/qwen3-next-80b-a3b-instruct:free',
    'liquid/lfm-2.5-1.2b-instruct:free'
  ];

  for (const model of models) {
    const requestBody = {
      model,
      messages: [
        { role: 'system', content: systemInstruction },
        { role: 'user', content: prompt }
      ],
      temperature,
      max_tokens: 1500
    };
    if (jsonMode) requestBody.response_format = { type: 'json_object' };

    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        const response = await axios.post('https://openrouter.ai/api/v1/chat/completions', requestBody, {
          headers: {
            'Authorization': `Bearer ${env.OPENROUTER_API_KEY}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': 'https://nexa.ai',
            'X-Title': 'NEXA Assistant'
          },
          timeout: 15000
        });
        return response.data.choices[0].message.content;
      } catch (e) {
        if (e.response?.status === 503 && attempt < retries) {
          await new Promise(r => setTimeout(r, attempt * 2000));
          continue;
        }
        console.warn(`[FALLBACK] OpenRouter model ${model} failed:`, getErrDetails(e));
        break; // Stop retrying this specific model and jump to the next free model in the list
      }
    }
  }
  throw new Error('All OpenRouter fallback models exhausted.');
}

module.exports = { executeWithFallback };
