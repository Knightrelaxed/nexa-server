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
 * Execute AI Prompt with Multi-Tier Fallback (5 Layers)
 * 
 * Tier 1: Gemini 1.5 Flash — PRIMARY key (1,500 RPD)
 * Tier 2: Gemini 1.5 Flash — BACKUP key (1,500 RPD, different quota pool)
 * Tier 3: Gemini 1.5 Flash — TERTIARY key (1,500 RPD, different quota pool)
 * Tier 4: Llama 3.1 via OpenRouter (independent provider)
 * Tier 5: Dumb Mode (static response — server stays alive)
 * 
 * @param {string} prompt 
 * @param {string} systemInstruction 
 * @param {number} temperature (low for discipline/routing, high for briefing)
 * @param {boolean} jsonMode (true = force JSON response, false = free text)
 */
async function executeWithFallback(prompt, systemInstruction = "", temperature = 0.3, jsonMode = true) {
  // Tier 1: Gemini 1.5 Flash — PRIMARY KEY (1,500 RPD)
  if (primaryGenAI) {
    try {
      return await callGemini(primaryGenAI, 'gemini-1.5-flash', prompt, systemInstruction, temperature, jsonMode);
    } catch (e) {
      console.warn('[FALLBACK] Tier 1 (Gemini 1.5 PRIMARY) failed:', e.message);
    }
  }

  // Tier 2: Gemini 1.5 Flash — BACKUP KEY (stable model, high quota)
  if (backupGenAI) {
    try {
      console.log('[FALLBACK] Switching to Tier 2 (Gemini 1.5 BACKUP key)...');
      return await callGemini(backupGenAI, 'gemini-1.5-flash', prompt, systemInstruction, temperature, jsonMode);
    } catch (e) {
      console.warn('[FALLBACK] Tier 2 (Gemini 1.5 BACKUP) failed:', e.message);
    }
  }

  // Tier 3: Gemini 1.5 Flash — TERTIARY KEY (1,500 RPD)
  if (tertiaryGenAI) {
    try {
      console.log('[FALLBACK] Switching to Tier 3 (Gemini 1.5 TERTIARY key)...');
      return await callGemini(tertiaryGenAI, 'gemini-1.5-flash', prompt, systemInstruction, temperature, jsonMode);
    } catch (e) {
      console.warn('[FALLBACK] Tier 3 (Gemini 1.5 TERTIARY) failed:', e.message);
    }
  }

  // Tier 4: Meta Llama 3.1 via OpenRouter (completely independent provider)
  if (env.OPENROUTER_API_KEY) {
    try {
      console.log('[FALLBACK] Switching to Tier 4 (OpenRouter Llama 3.1)...');
      return await callOpenRouter(prompt, systemInstruction, temperature, jsonMode);
    } catch (e) {
      console.warn('[FALLBACK] Tier 4 (OpenRouter Llama) failed:', e.message);
    }
  }

  // Tier 5: Dumb Mode — ALL AI layers exhausted
  console.error('[FALLBACK] ⚠️ All 4 AI layers exhausted. Entering Dumb Mode.');
  return JSON.stringify({
    intent: 'DUMB_MODE',
    extracted_data: null,
    god_mode_trigger: false,
    reply_message: 'Tuan, seluruh jalur otak saya sedang kehabisan kuota atau terputus. Sistem akan pulih otomatis dalam beberapa menit. Coba lagi sebentar lagi.'
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

module.exports = { executeWithFallback };
