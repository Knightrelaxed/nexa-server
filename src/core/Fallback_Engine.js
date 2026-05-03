const { GoogleGenerativeAI } = require('@google/generative-ai');
const axios = require('axios');
const env = require('../config/env');

// Initialize Gemini Clients
const primaryGenAI = env.GEMINI_API_KEY_PRIMARY ? new GoogleGenerativeAI(env.GEMINI_API_KEY_PRIMARY) : null;
const backupGenAI = env.GEMINI_API_KEY_BACKUP ? new GoogleGenerativeAI(env.GEMINI_API_KEY_BACKUP) : null;

/**
 * Execute AI Prompt with Multi-Tier Fallback
 * @param {string} prompt 
 * @param {string} systemInstruction 
 * @param {number} temperature (low for discipline/routing, high for briefing)
 * @param {boolean} jsonMode (true = force JSON response, false = free text)
 */
async function executeWithFallback(prompt, systemInstruction = "", temperature = 0.3, jsonMode = true) {
  // Tier 1: Gemini Primary
  if (primaryGenAI) {
    try {
      return await callGemini(primaryGenAI, prompt, systemInstruction, temperature, jsonMode);
    } catch (e) {
      console.warn('[FALLBACK] Primary Gemini failed:', e.message);
    }
  }

  // Tier 2: Gemini Backup
  if (backupGenAI) {
    try {
      console.log('[FALLBACK] Using Backup Gemini...');
      return await callGemini(backupGenAI, prompt, systemInstruction, temperature, jsonMode);
    } catch (e) {
      console.warn('[FALLBACK] Backup Gemini failed:', e.message);
    }
  }

  // Tier 3: Meta Llama 3.1 via OpenRouter
  if (env.OPENROUTER_API_KEY) {
    try {
      console.log('[FALLBACK] Using OpenRouter Llama 3.1...');
      return await callOpenRouter(prompt, systemInstruction, temperature, jsonMode);
    } catch (e) {
      console.warn('[FALLBACK] OpenRouter Llama failed:', e.message);
    }
  }

  // Tier 4: Dumb Mode
  console.error('[FALLBACK] All AI layers exhausted. Entering Dumb Mode.');
  // Return proper key so webhook.js can send it back to user
  return JSON.stringify({
    intent: 'DUMB_MODE',
    extracted_data: null,
    god_mode_trigger: false,
    reply_message: 'Tuan, sistem otak saya sedang kelebihan beban atau koneksi terputus. Coba lagi dalam beberapa menit.'
  });
}

/**
 * Internal wrapper for Gemini GenAI Call
 */
async function callGemini(client, prompt, systemInstruction, temperature, jsonMode = true) {
  const generationConfig = { temperature };
  if (jsonMode) {
    generationConfig.responseMimeType = 'application/json';
  }
  const model = client.getGenerativeModel({ 
    model: 'gemini-2.0-flash',  // Stable production Flash model
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
