const { GoogleGenerativeAI } = require('@google/generative-ai');
const axios = require('axios');
const env = require('../config/env');

// ============================================================
// NON-BLOCKING ASYNCHRONOUS LOGGING WRAPPERS
// Memastikan pencetakan log ke stdout tidak menahan Event Loop
// saat eksekusi panggilan jaringan AI atau alur routing berlangsung.
// ============================================================
function asyncLog(...args) {
  setImmediate(() => console.log(...args));
}
function asyncWarn(...args) {
  setImmediate(() => console.warn(...args));
}
function asyncError(...args) {
  setImmediate(() => console.error(...args));
}

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

// ============================================================
// SMART ADAPTIVE CONTEXT ROUTING (SACR) — v1.0
// Memilah beban konteks secara otomatis:
//   MODE LIGHT ⚡ : Cerebras Gemma 4 31B di Tier 1 (chat biasa, perintah rutin, ~1.6 detik)
//   MODE HEAVY 🧠 : Google Gemini 3.6 Flash di Tier 1 (analisis, rekap, dokumen, penalaran berat)
// ============================================================

/** Batas panjang karakter (prompt + systemInstruction) untuk trigger MODE HEAVY */
const SACR_HEAVY_CHAR_THRESHOLD = 1000;

/**
 * Kata kunci pemicu MODE HEAVY — mencakup tugas analitik, keuangan mendalam,
 * pengelolaan kode, pemrosesan dokumen, riset, dan instruksi multi-langkah.
 */
const SACR_HEAVY_KEYWORDS = [
  // --- Keuangan & Akuntansi Berat ---
  'rekap', 'rekapitulasi', 'laporan bulanan', 'laporan tahunan', 'laporan mingguan',
  'laporan keuangan', 'audit keuangan', 'audit pengeluaran', 'audit pemasukan',
  'analisis keuangan', 'analisis pengeluaran', 'analisis pemasukan', 'analisis transaksi',
  'perbandingan bulan', 'perbandingan keuangan', 'evaluasi keuangan', 'evaluasi budget',
  'budget bulanan', 'alokasi budget', 'rekomendasi hemat', 'rencana keuangan',
  'cashflow', 'cash flow', 'neraca', 'saldo akhir bulan', 'ringkasan keuangan',
  'tren pengeluaran', 'tren pemasukan', 'grafik keuangan', 'kategori terbesar',
  // --- Dokumen & Berkas ---
  'ringkasan dokumen', 'ringkas dokumen', 'baca dokumen', 'baca pdf', 'baca file',
  'analisis dokumen', 'ekstrak dokumen', 'isi dokumen', 'konten file', 'resume dokumen',
  'transkrip', 'transkripsi', 'poin penting', 'kesimpulan dari', 'rangkum',
  'rangkuman panjang', 'summary panjang', 'summary dokumen', 'uraikan',
  // --- Penalaran & Riset Mendalam ---
  'analisis mendalam', 'penjelasan rinci', 'jelaskan secara detail', 'jelaskan panjang',
  'riset', 'penelitian', 'investigasi', 'kajian', 'telaah', 'telaah mendalam',
  'bandingkan', 'perbandingan antara', 'perbedaan antara', 'keunggulan dan kelemahan',
  'pro dan kontra', 'pros and cons', 'kelebihan kekurangan', 'evaluasi mendalam',
  'strategi', 'rekomendasi strategis', 'rencana jangka panjang', 'plan mendalam',
  // --- Kode & Teknis ---
  'refactor', 'refactoring', 'perbaiki kode', 'perbaiki fungsi', 'debug panjang',
  'codebase', 'arsitektur sistem', 'arsitektur kode', 'rancang ulang', 'desain sistem',
  'dokumentasi kode', 'buat dokumentasi', 'review kode', 'code review',
  'optimalkan', 'optimasi sistem', 'migrasi database', 'skema database',
  // --- Kalender & Tugas Kompleks ---
  'jadwal minggu ini', 'jadwal bulan ini', 'agenda bulanan', 'rencana minggu',
  'daftar tugas panjang', 'semua tugas', 'seluruh task', 'list lengkap',
  'prioritaskan semua', 'susun ulang jadwal', 'review minggu', 'weekly review',
  // --- Memori & Profil ---
  'semua yang aku', 'semua yang saya', 'seluruh riwayat', 'semua fakta',
  'profil lengkap', 'rekap percakapan', 'ringkasan obrolan', 'apa saja yang sudah',
  // --- Instruksi Multi-Langkah / Kompleks ---
  'langkah demi langkah', 'step by step', 'panduan lengkap', 'tutorial lengkap',
  'buatkan laporan', 'buat analisis', 'susunkan', 'formulasikan', 'rancangkan',
  'berikan rekomendasi lengkap', 'beri penjelasan komprehensif'
];

/**
 * Evaluasi apakah konteks tergolong HEAVY Mode.
 *
 * @param {string} prompt - Full prompt termasuk konteks memori dan riwayat obrolan
 * @param {string} systemInstruction - System prompt yang dikirim ke model
 * @param {object} [options] - Opsi tambahan termasuk forceHeavy dan userText
 * @returns {boolean} true = HEAVY mode, false = LIGHT mode
 */
function isHeavyContext(prompt, systemInstruction, options = {}) {
  // [SACR] 1. Cek override eksplisit (misal forceHeavy: true dari Cron Job Kategori A)
  if (options && typeof options.forceHeavy === 'boolean') {
    return options.forceHeavy;
  }

  // [SACR] 2. Ambil pesan MURNI Tuan Faqih — dikirim eksplisit via options.userText dari AI_Router.
  // Evaluasi threshold karakter & kata kunci HANYA pada teks ini,
  // bukan pada total prompt router (yang berisi 30K+ karakter histori + fakta profil).
  const rawUserChat = (options?.userText || '').trim();

  // Cek 1: Pesan murni > 1.000 karakter → HEAVY
  if (rawUserChat.length > SACR_HEAVY_CHAR_THRESHOLD) return true;

  // Cek 2: Mengandung kata kunci kognitif berat → HEAVY
  if (rawUserChat) {
    return SACR_HEAVY_KEYWORDS.some(kw => rawUserChat.toLowerCase().includes(kw));
  }

  // Tidak ada teks murni (dipanggil tanpa userText, misal dari cron non-forceHeavy) → LIGHT
  return false;
}


/**
 * Execute AI Prompt with Smart Adaptive Context Routing (SACR) + 15-Layer Fallback
 *
 * MODE LIGHT ⚡ (Konteks Normal — default):
 *   Tier 1-4  : Cerebras Gemma 4 31B Key 1-4    (The Ultra-Fast WSE-3 Sprinters)
 *   Tier 5-8  : Groq Llama 3.3 70B Versatile Key 1-4 (The Secondary Sprinters)
 *   Tier 9-12 : Gemini 3.6 Flash Key 1-4         (The Deep Thinkers — Fallback)
 *
 * MODE HEAVY 🧠 (Konteks Berat — otomatis jika threshold/keyword terpenuhi):
 *   Tier 1-4  : Gemini 3.6 Flash Key 1-4         (1 Juta Token Window, Deep Reasoning)
 *   Tier 5-8  : Groq Llama 3.3 70B Versatile Key 1-4 (The Secondary Sprinters)
 *   Tier 9-12 : Cerebras Gemma 4 31B Key 1-4    (The Ultra-Fast WSE-3 — Fallback)
 *
 * Tier 13 : Hugging Face Gemma 4 31B IT          (The Free Safety Net)
 * Tier 14 : Mistral Pixtral 12B                  (The Reliable European Closer — 937.5K TPM)
 * Tier 15 : OpenRouter Multi-Model Free          (The Indestructible Last Resort)
 *
 * Trigger HEAVY otomatis:
 *   a) Pesan MURNI Tuan Faqih > 1.000 karakter
 *   b) Mengandung kata kunci: rekap, audit, analisis, dokumen, refactor, dll.
 *
 * Override manual: options.forceHeavy = true | false
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


async function executeWithFallback(prompt, systemInstruction = "", temperature = 0.3, jsonMode = true, options = {}) {
  // --- SMART ADAPTIVE CONTEXT ROUTING (SACR) ---
  // options.forceHeavy = true  → paksa HEAVY mode
  // options.forceHeavy = false → paksa LIGHT mode
  // options.forceHeavy = undefined → deteksi otomatis via isHeavyContext()
  const heavy = options.forceHeavy === true
    ? true
    : options.forceHeavy === false
      ? false
      : isHeavyContext(prompt, systemInstruction, options);

  const sacrMode = heavy ? 'HEAVY 🧠 [Gemini 3.6 Flash Priority]' : 'LIGHT ⚡ [Cerebras Priority]';
  asyncLog(`[SACR] Mode: ${sacrMode} | Total chars: ${(prompt?.length || 0) + (systemInstruction?.length || 0)}`);

  // --- Bangun blok tier Cerebras dan Gemini secara terpisah ---
  const cerebrasBlock = cerebrasKeys
    .filter(Boolean)
    .map((key, i) => ({
      name: `Tier X (Cerebras Key ${i + 1})`,
      fn: () => callCerebras(key, prompt, systemInstruction, temperature, jsonMode)
    }));

  const geminiBlock = geminiClients
    .filter(Boolean)
    .map((client, i) => ({
      name: `Tier X (Gemini 3.6 Key ${i + 1})`,
      fn: () => callGeminiWithRetry(client, 'gemini-3.6-flash', prompt, systemInstruction, temperature, jsonMode)
    }));

  // Primary  = Tier 1-4  (Cerebras jika LIGHT, Gemini 3.6 jika HEAVY)
  // Secondary = Tier 9-12 (Gemini 3.6 jika LIGHT, Cerebras jika HEAVY)
  const primaryBlock   = (heavy ? geminiBlock   : cerebrasBlock);
  const secondaryBlock = (heavy ? cerebrasBlock  : geminiBlock);

  const tiers = [
    // Tier 1-4: Primary AI (dibalik berdasarkan SACR mode)
    ...primaryBlock.map((t, i) => ({ ...t, name: t.name.replace('Tier X', `Tier ${i + 1}`) })),
    // Tier 5-8: Groq Llama 3.3 70B Versatile (selalu di tengah sebagai Secondary Sprinter)
    ...groqKeys.filter(Boolean).map((key, i) => ({
      name: `Tier ${i + 5} (Groq Key ${i + 1})`,
      fn: () => callGroq(key, prompt, systemInstruction, temperature, jsonMode)
    })),
    // Tier 9-12: Secondary AI (kebalikan dari primary)
    ...secondaryBlock.map((t, i) => ({ ...t, name: t.name.replace('Tier X', `Tier ${i + 9}`) })),
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
    // Tier 15: OpenRouter Multi-Model Free Pool
    ...(env.OPENROUTER_API_KEY ? [{
      name: 'Tier 15 (OpenRouter)',
      fn: () => callOpenRouter(prompt, systemInstruction, temperature, jsonMode)
    }] : [])
  ];

  for (const tier of tiers) {
    try {
      asyncLog(`[FALLBACK] Trying ${tier.name}...`);
      const rawRes = await tier.fn();
      return validateResponseJson(rawRes, jsonMode);
    } catch (e) {
      asyncWarn(`[FALLBACK] ${tier.name} failed:`, getErrDetails(e));
    }
  }

  // Fallback Final
  asyncError('[FALLBACK] ⚠️ All 15 AI layers exhausted. Entering Dumb Mode.');
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
    generationConfig,
    // Gemini berjalan di arsitektur Google TPU dengan penalaran mendalam & konteks 1M token.
    // Diberi batas waktu 12.000ms (12 detik) agar cukup waktu untuk memproses beban berat.
    requestOptions: { timeout: 12000 }
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
        // Groq berjalan di arsitektur LPU (Language Processing Unit) super cepat.
        // Timeout dibatas 4000ms (4 detik) agar cepat pindah jika terjadi antrean.
        timeout: 4000
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
        // Cerebras berjalan di arsitektur WSE-3 ultrafast (~1000 token/detik).
        // Jika dalam 3.000ms (3 detik) tidak respons, berarti antrean penuh/overload. Pindah tier kilat!
        timeout: 3000
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
        timeout: 8000
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
        timeout: 8000
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
          timeout: 7000
        });
        return response.data.choices[0].message.content;
      } catch (e) {
        if (e.response?.status === 503 && attempt < retries) {
          await new Promise(r => setTimeout(r, attempt * 2000));
          continue;
        }
        asyncWarn(`[FALLBACK] OpenRouter model ${model} failed:`, getErrDetails(e));
        break; // Stop retrying this specific model and jump to the next free model in the list
      }
    }
  }
  throw new Error('All OpenRouter fallback models exhausted.');
}

module.exports = { executeWithFallback };
