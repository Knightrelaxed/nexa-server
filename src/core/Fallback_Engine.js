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
 * Execute AI Prompt with Multi-Tier Fallback (9 Layers)
 * 
 * Tier 1 & 2: Groq Llama 3.3 70B (The Sprinter)
 * Tier 3 & 4: Gemini 2.5 Flash (The Deep Thinkers)
 * Tier 5: Cerebras Llama 3.1 70B (The Backup Sprinter)
 * Tier 6 & 7: Gemini 2.0 Flash (The Infinite Context)
 * Tier 8: Mistral Pixtral 12B (The Mistral)
 * Tier 9: OpenRouter Gemma 2 (The OpenRouter Net)
 */
async function executeWithFallback(prompt, systemInstruction = "", temperature = 0.3, jsonMode = true) {
  // Tier 1: Groq Llama 3.3 70B (Key 1)
  if (groqKeys[0]) {
    try {
      return await callGroq(groqKeys[0], prompt, systemInstruction, temperature, jsonMode);
    } catch (e) { console.warn('[FALLBACK] Tier 1 (Groq Key 1) failed:', e.message); }
  }

  // Tier 2: Groq Llama 3.3 70B (Key 2)
  if (groqKeys[1]) {
    try {
      console.log('[FALLBACK] Switching to Tier 2 (Groq Key 2)...');
      return await callGroq(groqKeys[1], prompt, systemInstruction, temperature, jsonMode);
    } catch (e) { console.warn('[FALLBACK] Tier 2 (Groq Key 2) failed:', e.message); }
  }

  // Tier 3: Gemini 2.5 Flash (Key 1)
  if (geminiClients[0]) {
    try {
      console.log('[FALLBACK] Switching to Tier 3 (Gemini 2.5 Flash Key 1)...');
      return await callGeminiWithRetry(geminiClients[0], 'gemini-2.5-flash', prompt, systemInstruction, temperature, jsonMode);
    } catch (e) { console.warn('[FALLBACK] Tier 3 (Gemini 2.5 Key 1) failed:', e.message); }
  }

  // Tier 4: Gemini 2.5 Flash (Key 2)
  if (geminiClients[1]) {
    try {
      console.log('[FALLBACK] Switching to Tier 4 (Gemini 2.5 Flash Key 2)...');
      return await callGeminiWithRetry(geminiClients[1], 'gemini-2.5-flash', prompt, systemInstruction, temperature, jsonMode);
    } catch (e) { console.warn('[FALLBACK] Tier 4 (Gemini 2.5 Key 2) failed:', e.message); }
  }

  // Tier 5: Cerebras Llama 3.1 70B
  if (env.CEREBRAS_API_KEY) {
    try {
      console.log('[FALLBACK] Switching to Tier 5 (Cerebras Llama 3.1 70B)...');
      return await callCerebras(prompt, systemInstruction, temperature, jsonMode);
    } catch (e) { console.warn('[FALLBACK] Tier 5 (Cerebras) failed:', e.message); }
  }

  // Tier 6: Gemini 2.0 Flash (Key 3)
  if (geminiClients[2]) {
    try {
      console.log('[FALLBACK] Switching to Tier 6 (Gemini 2.0 Flash Key 3)...');
      return await callGeminiWithRetry(geminiClients[2], 'gemini-2.0-flash', prompt, systemInstruction, temperature, jsonMode);
    } catch (e) { console.warn('[FALLBACK] Tier 6 (Gemini 2.0 Key 3) failed:', e.message); }
  }

  // Tier 7: Gemini 2.0 Flash (Key 4)
  if (geminiClients[3]) {
    try {
      console.log('[FALLBACK] Switching to Tier 7 (Gemini 2.0 Flash Key 4)...');
      return await callGeminiWithRetry(geminiClients[3], 'gemini-2.0-flash', prompt, systemInstruction, temperature, jsonMode);
    } catch (e) { console.warn('[FALLBACK] Tier 7 (Gemini 2.0 Key 4) failed:', e.message); }
  }

  // Tier 8: Mistral API (Pixtral 12B)
  if (env.MISTRAL_API_KEY) {
    try {
      console.log('[FALLBACK] Switching to Tier 8 (Mistral Pixtral 12B)...');
      return await callMistral(prompt, systemInstruction, temperature, jsonMode);
    } catch (e) { console.warn('[FALLBACK] Tier 8 (Mistral) failed:', e.message); }
  }

  // Tier 9: OpenRouter (Gemma 2 27B)
  if (env.OPENROUTER_API_KEY) {
    try {
      console.log('[FALLBACK] Switching to Tier 9 (OpenRouter)...');
      return await callOpenRouter(prompt, systemInstruction, temperature, jsonMode);
    } catch (e) { console.warn('[FALLBACK] Tier 9 (OpenRouter) failed:', e.message); }
  }

  // Fallback Final
  console.error('[FALLBACK] ⚠️ All 9 AI layers exhausted. Entering Dumb Mode.');
  return JSON.stringify({
    intent: 'DUMB_MODE',
    extracted_data: null,
    god_mode_trigger: false,
    reply_message: '⚠️ Sistem Otak N.E.X.A (AI Router) mengalami Down Total di semua 9 peladen dunia. Mohon tunggu beberapa saat.'
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
    model: 'llama3.1-70b',
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
