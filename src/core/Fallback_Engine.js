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
 * Tier 1-4 : Groq Llama 4 Scout 17B Key 1-4  (The Sprinters — fast & high TPM)
 * Tier 5-6 : Gemini 2.5 Flash Key 1-2     (The Deep Thinkers)
 * Tier 7   : Cerebras Llama 3.3 70B       (The Backup Sprinter)
 * Tier 8-9 : Gemini 2.5 Flash Key 3-4    (The Infinite Context / Backup Thinkers)
 * Tier 10  : Mistral Pixtral 12B          (The Reliable Closer)
 * Tier 11  : OpenRouter Gemma 2 27B       (The Last Resort)
 */
const getErrDetails = (e) => {
  const status = e.status || e.response?.status || 'NET';
  const data = e.response?.data ? JSON.stringify(e.response.data) : '';
  return `[${status}] ${e.message} ${data ? '| ' + data : ''}`.substring(0, 500);
};

async function executeWithFallback(prompt, systemInstruction = "", temperature = 0.3, jsonMode = true) {
  // Tier 1: Groq Llama 4 Scout 17B (Key 1)
  if (groqKeys[0]) {
    try {
      return await callGroq(groqKeys[0], prompt, systemInstruction, temperature, jsonMode);
    } catch (e) { console.warn('[FALLBACK] Tier 1 (Groq Key 1) failed:', getErrDetails(e)); }
  }

  // Tier 2: Groq Llama 4 Scout 17B (Key 2)
  if (groqKeys[1]) {
    try {
      console.log('[FALLBACK] Switching to Tier 2 (Groq Key 2)...');
      return await callGroq(groqKeys[1], prompt, systemInstruction, temperature, jsonMode);
    } catch (e) { console.warn('[FALLBACK] Tier 2 (Groq Key 2) failed:', getErrDetails(e)); }
  }

  // Tier 3: Groq Llama 4 Scout 17B (Key 3)
  if (groqKeys[2]) {
    try {
      console.log('[FALLBACK] Switching to Tier 3 (Groq Key 3)...');
      return await callGroq(groqKeys[2], prompt, systemInstruction, temperature, jsonMode);
    } catch (e) { console.warn('[FALLBACK] Tier 3 (Groq Key 3) failed:', getErrDetails(e)); }
  }

  // Tier 4: Groq Llama 4 Scout 17B (Key 4)
  if (groqKeys[3]) {
    try {
      console.log('[FALLBACK] Switching to Tier 4 (Groq Key 4)...');
      return await callGroq(groqKeys[3], prompt, systemInstruction, temperature, jsonMode);
    } catch (e) { console.warn('[FALLBACK] Tier 4 (Groq Key 4) failed:', getErrDetails(e)); }
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

  // Tier 7: Cerebras Llama 3.3 70B
  if (env.CEREBRAS_API_KEY) {
    try {
      console.log('[FALLBACK] Switching to Tier 7 (Cerebras Llama 3.3 70B)...');
      return await callCerebras(prompt, systemInstruction, temperature, jsonMode);
    } catch (e) { console.warn('[FALLBACK] Tier 7 (Cerebras) failed:', getErrDetails(e)); }
  }

  // Tier 8: Gemini 2.5 Flash (Key 3)
  if (geminiClients[2]) {
    try {
      console.log('[FALLBACK] Switching to Tier 8 (Gemini 2.5 Flash Key 3)...');
      return await callGeminiWithRetry(geminiClients[2], 'gemini-2.5-flash', prompt, systemInstruction, temperature, jsonMode);
    } catch (e) { console.warn('[FALLBACK] Tier 8 (Gemini 2.5 Key 3) failed:', getErrDetails(e)); }
  }

  // Tier 9: Gemini 2.5 Flash (Key 4)
  if (geminiClients[3]) {
    try {
      console.log('[FALLBACK] Switching to Tier 9 (Gemini 2.5 Flash Key 4)...');
      return await callGeminiWithRetry(geminiClients[3], 'gemini-2.5-flash', prompt, systemInstruction, temperature, jsonMode);
    } catch (e) { console.warn('[FALLBACK] Tier 9 (Gemini 2.5 Key 4) failed:', getErrDetails(e)); }
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

async function callGroq(apiKey, prompt, systemInstruction, temperature, jsonMode = true, retries = 3) {
  const requestBody = {
    model: 'meta-llama/llama-4-scout-17b-16e-instruct',
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

async function callOpenRouter(prompt, systemInstruction, temperature, jsonMode = true, retries = 3) {
  const requestBody = {
    model: 'google/gemma-2-27b-it',
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
