const { GoogleGenerativeAI } = require('@google/generative-ai');
const axios = require('axios');
const env = require('../config/env');

// ============================================================
// MULTI-KEY GEMINI INITIALIZATION
// Each key belongs to a DIFFERENT Google project, giving each
// its own independent quota pool. When one key is exhausted,
// the next key still has full quota available.
// ============================================================
const primaryGenAI = env.GEMINI_API_KEY_PRIMARY ? new GoogleGenerativeAI(env.GEMINI_API_KEY_PRIMARY) : null;
const backupGenAI = env.GEMINI_API_KEY_BACKUP ? new GoogleGenerativeAI(env.GEMINI_API_KEY_BACKUP) : null;
const tertiaryGenAI = env.GEMINI_API_KEY_TERTIARY ? new GoogleGenerativeAI(env.GEMINI_API_KEY_TERTIARY) : null;

/**
 * Execute AI Prompt with Multi-Tier Fallback
 *
 * Tier 1: Groq — Llama 3.3 70B (generous quota, very fast, most reliable)
 * Tier 2: Gemini 2.5 Flash — PRIMARY key (20 RPD, smart but limited)
 * Tier 3: Gemini 2.5 Flash — BACKUP key
 * Tier 4: Gemini 2.5 Flash — TERTIARY key
 * Tier 5: Gemini 2.0 Flash Lite — BACKUP key
 * Tier 6: Gemini 2.0 Flash Lite — TERTIARY key
 * Tier 7: OpenRouter Llama 3.1 (independent provider)
 * Tier 8: Dumb Mode
 */
async function executeWithFallback(prompt, systemInstruction = "", temperature = 0.3, jsonMode = true) {
  // Tier 1: Groq Llama 3.3 70B — most reliable, no daily RPD cap
  if (env.GROQ_API_KEY) {
    try {
      return await callGroq(prompt, systemInstruction, temperature, jsonMode);
    } catch (e) {
      console.warn('[FALLBACK] Tier 1 (Groq Llama 3.3) failed:', e.message);
    }
  }

  // Tier 2-4: Gemini 2.5 Flash — tries all 3 keys
  const geminiClients = [
    { client: primaryGenAI, name: 'Tier 2 (Gemini 2.5 PRIMARY)' },
    { client: backupGenAI, name: 'Tier 3 (Gemini 2.5 BACKUP)' },
    { client: tertiaryGenAI, name: 'Tier 4 (Gemini 2.5 TERTIARY)' },
  ].filter(t => t.client);

  for (const { client, name } of geminiClients) {
    try {
      console.log(`[FALLBACK] Switching to ${name}...`);
      return await callGemini(client, 'gemini-2.5-flash', prompt, systemInstruction, temperature, jsonMode);
    } catch (e) {
      const status = e.status || e.response?.status || '';
      // 429 = quota exhausted for the day — no point logging full error
      if (String(e.message).includes('429') || status === 429) {
        console.warn(`[FALLBACK] ${name} skipped: quota exhausted (429).`);
      } else {
        console.warn(`[FALLBACK] ${name} failed:`, e.message);
      }
    }
  }

  // Tier 5-6: Gemini 2.0 Flash Lite — separate model quota pool
  const gemini20Clients = [
    { client: backupGenAI, name: 'Tier 5 (Gemini 2.0 BACKUP)' },
    { client: tertiaryGenAI, name: 'Tier 6 (Gemini 2.0 TERTIARY)' },
  ].filter(t => t.client);

  for (const { client, name } of gemini20Clients) {
    try {
      console.log(`[FALLBACK] Switching to ${name}...`);
      return await callGemini(client, 'gemini-2.0-flash-lite', prompt, systemInstruction, temperature, jsonMode);
    } catch (e) {
      console.warn(`[FALLBACK] ${name} failed:`, e.message);
    }
  }

  // Tier 7: OpenRouter Llama 3.1
  if (env.OPENROUTER_API_KEY) {
    try {
      console.log('[FALLBACK] Switching to Tier 7 (OpenRouter Llama 3.1)...');
      return await callOpenRouter(prompt, systemInstruction, temperature, jsonMode);
    } catch (e) {
      console.warn('[FALLBACK] Tier 7 (OpenRouter) failed:', e.message);
    }
  }

  // Tier 8: Dumb Mode — ALL AI layers exhausted
  console.error('[FALLBACK] ⚠️ All AI layers exhausted. Entering Dumb Mode.');
  return JSON.stringify({
    intent: 'DUMB_MODE',
    extracted_data: null,
    god_mode_trigger: false,
    reply_message: 'Tuan, semua layanan AI sedang tidak tersedia sementara. Sistem akan pulih otomatis. Coba lagi nanti.'
  });
}

/**
 * Internal wrapper for Gemini GenAI Call
 */
async function callGemini(client, modelName, prompt, systemInstruction, temperature, jsonMode = true) {
  const generationConfig = { temperature };
  if (jsonMode) {
    generationConfig.responseMimeType = 'application/json';
  }
  const model = client.getGenerativeModel({
    model: modelName,
    systemInstruction: systemInstruction,
    generationConfig
  });
  const response = await model.generateContent(prompt);
  return response.response.text();
}

/**
 * Internal wrapper for OpenRouter (Llama 3.1)
 */
async function callOpenRouter(prompt, systemInstruction, temperature, jsonMode = true) {
  const requestBody = {
    model: 'meta-llama/llama-3.1-8b-instruct',
    messages: [
      { role: 'system', content: systemInstruction },
      { role: 'user', content: prompt }
    ],
    temperature
  };
  // Only force JSON mode for routing calls, not for free text like briefings
  if (jsonMode) {
    requestBody.response_format = { type: 'json_object' };
  }
  const response = await axios.post('https://openrouter.ai/api/v1/chat/completions', requestBody, {
    headers: {
      'Authorization': `Bearer ${env.OPENROUTER_API_KEY}`,
      'Content-Type': 'application/json'
    }
  });

  return response.data.choices[0].message.content;
}

/**
 * Internal wrapper for Groq (Llama 3.3 70B Versatile)
 */
async function callGroq(prompt, systemInstruction, temperature, jsonMode = true) {
  const requestBody = {
    model: 'llama-3.3-70b-versatile',
    messages: [
      { role: 'system', content: systemInstruction },
      { role: 'user', content: prompt }
    ],
    temperature
  };
  if (jsonMode) {
    requestBody.response_format = { type: 'json_object' };
  }
  const response = await axios.post('https://api.groq.com/openai/v1/chat/completions', requestBody, {
    headers: {
      'Authorization': `Bearer ${env.GROQ_API_KEY}`,
      'Content-Type': 'application/json'
    }
  });

  return response.data.choices[0].message.content;
}

module.exports = { executeWithFallback };
