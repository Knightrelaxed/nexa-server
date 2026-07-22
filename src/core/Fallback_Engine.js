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

const cerebrasKeys = [
  env.CEREBRAS_API_KEY_1,
  env.CEREBRAS_API_KEY_2,
  env.CEREBRAS_API_KEY_3,
  env.CEREBRAS_API_KEY_4
];

/**
 * Execute AI Prompt with Multi-Tier Fallback (15 Layers)
 *
 * Tier 1-4 : Cerebras Gemma 4 31B Key 1-4     (The Ultra-Fast WSE-3 Sprinters — ABCD order)
 * Tier 5-8 : Groq Llama 3.3 70B Versatile Key 1-4 (The Secondary Sprinters)
 * Tier 9-12: Gemini 3.6 Flash Key 1-4           (The Deep Thinkers)
 * Tier 13  : Hugging Face Gemma 4 31B IT        (The Free Safety Net)
 * Tier 14  : Mistral Pixtral 12B                (The Reliable European Closer — 937.5K TPM)
 * Tier 15  : OpenRouter Multi-Model Free        (The Indestructible Last Resort)
 */
const getErrDetails = (e) => {
  const status = e.status || e.response?.status || 'NET';
  const data = e.response?.data ? JSON.stringify(e.response.data) : '';
  return `[${status}] ${e.message} ${data ? '| ' + data : ''}`.substring(0, 500);
};

function validateResponseJson(str, jsonMode) {
  if (!jsonMode) return str;
  if (!str || typeof str !== 'string') throw new Error('Empty response string');
  let cleanStr = str.replace(/```json/gi, '').replace(/```/g, '').trim();

  // Cari bracket pembuka pertama — bisa array [ atau object {
  const firstBracket = cleanStr.indexOf('[');
  const firstBrace = cleanStr.indexOf('{');

  // Pilih yang lebih awal muncul di string
  let startChar, endChar;
  if (firstBracket !== -1 && (firstBrace === -1 || firstBracket < firstBrace)) {
    startChar = '[';
    endChar = ']';
  } else if (firstBrace !== -1) {
    startChar = '{';
    endChar = '}';
  } else {
    throw new Error('No JSON bracket found in response');
  }

  const startIdx = cleanStr.indexOf(startChar);
  const endIdx = cleanStr.lastIndexOf(endChar);
  if (startIdx !== -1 && endIdx > startIdx) {
    cleanStr = cleanStr.substring(startIdx, endIdx + 1);
  }

  JSON.parse(cleanStr); // validate — throw jika malformed
  return str;
}


async function executeWithFallback(prompt, systemInstruction = "", temperature = 0.3, jsonMode = true) {
  const tiers = [
    // Tier 1-4: Cerebras Gemma 4 31B (ABCD order)
    ...cerebrasKeys.map((key, i) => ({
      name: `Tier ${i + 1} (Cerebras Key ${i + 1})`,
      fn: () => callCerebras(key, prompt, systemInstruction, temperature, jsonMode)
    })),
    // Tier 5-8: Groq Llama 3.3 70B Versatile
    ...groqKeys.map((key, i) => ({
      name: `Tier ${i + 5} (Groq Key ${i + 1})`,
      fn: () => callGroq(key, prompt, systemInstruction, temperature, jsonMode)
    })),
    // Tier 9-12: Gemini 3.6 Flash
    ...geminiClients.map((client, i) => ({
      name: `Tier ${i + 9} (Gemini 3.6 Key ${i + 1})`,
      fn: () => callGeminiWithRetry(client, 'gemini-3.6-flash', prompt, systemInstruction, temperature, jsonMode)
    })),
    // Tier 13: Hugging Face Gemma 4 31B
    ...(env.HF_INFERENCE_TOKEN ? [{
      name: 'Tier 13 (Hugging Face Gemma 4 31B)',
      fn: () => callHuggingFaceInference(prompt, systemInstruction, temperature, jsonMode)
    }] : []),
    // Tier 14: Mistral Pixtral 12B
    ...(env.MISTRAL_API_KEY ? [{
      name: 'Tier 14 (Mistral Pixtral 12B)',
      fn: () => callMistral(prompt, systemInstruction, temperature, jsonMode, 'pixtral-12b-2409')
    }] : []),
    // Tier 15: OpenRouter
    ...(env.OPENROUTER_API_KEY ? [{
      name: 'Tier 15 (OpenRouter)',
      fn: () => callOpenRouter(prompt, systemInstruction, temperature, jsonMode)
    }] : [])
  ];

  for (const tier of tiers) {
    try {
      console.log(`[FALLBACK] Trying ${tier.name}...`);
      const rawRes = await tier.fn();
      return validateResponseJson(rawRes, jsonMode);
    } catch (e) {
      console.warn(`[FALLBACK] ${tier.name} failed:`, getErrDetails(e));
    }
  }

  // Fallback Final
  console.error('[FALLBACK] ⚠️ All 15 AI layers exhausted. Entering Dumb Mode.');
  return JSON.stringify({
    intent: 'DUMB_MODE',
    extracted_data: null,
    god_mode_trigger: false,
    reply_message: '⚠️ Sistem Otak N.E.X.A (AI Router) mengalami Down Total di semua 15 peladen dunia. Mohon tunggu beberapa saat.'
  });
}

// ----------------------------------------------------
// API WRAPPERS WITH 503 SMART RETRY
// ----------------------------------------------------

async function callGeminiWithRetry(client, modelName, prompt, systemInstruction, temperature, jsonMode = true, retries = 1) {
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
      if (attempt === retries) throw e;
    }
  }
}

async function callGroq(apiKey, prompt, systemInstruction, temperature, jsonMode = true, retries = 1) {
  const requestBody = {
    model: 'llama-3.3-70b-versatile',
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
        timeout: 8000
      });
      return response.data.choices[0].message.content;
    } catch (e) {
      if (attempt === retries) throw e;
    }
  }
}

async function callCerebras(apiKey, prompt, systemInstruction, temperature, jsonMode = true, retries = 1) {
  if (!apiKey) throw new Error('No Cerebras API key provided');
  const requestBody = {
    model: 'gemma-4-31b',  // Restored: Gemma 4 31B for natural human warmth and empathy
    messages: [
      { role: 'system', content: systemInstruction },
      { role: 'user', content: prompt }
    ],
    temperature,
    max_tokens: 2500
  };
  // Note: Avoid response_format={type:'json_object'} on gemma-4-31b as Cerebras grammar parser truncates nested arrays

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const response = await axios.post('https://api.cerebras.ai/v1/chat/completions', requestBody, {
        headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        // Cerebras WSE-3 seharusnya ultrafast (<2s). Jika >5s = server sedang overload/down.
        // Diturunkan dari 8000ms → 5000ms untuk mempersingkat waktu tunggu saat server tidak responsif.
        timeout: 5000
      });
      return response.data.choices[0].message.content;
    } catch (e) {
      if (attempt === retries) throw e;
    }
  }
}

async function callHuggingFaceInference(prompt, systemInstruction, temperature, jsonMode = true, retries = 2) {
  const token = env.HF_INFERENCE_TOKEN;
  if (!token) throw new Error('No HF_INFERENCE_TOKEN configured');

  const requestBody = {
    model: 'google/gemma-4-31B-it',
    messages: [
      { role: 'system', content: systemInstruction },
      { role: 'user', content: prompt }
    ],
    temperature,
    top_p: 0.9,
    max_tokens: 1500
  };
  if (jsonMode) requestBody.response_format = { type: 'json_object' };

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const response = await axios.post('https://router.huggingface.co/v1/chat/completions', requestBody, {
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        timeout: 15000
      });
      return response.data.choices[0].message.content;
    } catch (e) {
      if (attempt < retries && e.response?.status !== 400 && e.response?.status !== 404) {
        await new Promise(r => setTimeout(r, attempt * 1500));
        continue;
      }
      throw e;
    }
  }
}

async function callMistral(prompt, systemInstruction, temperature, jsonMode = true, modelId = 'pixtral-12b-2409', retries = 3) {
  const requestBody = {
    model: modelId,
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
