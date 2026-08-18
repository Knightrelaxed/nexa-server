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

const googleApiKeys = [
  env.GEMINI_API_KEY_1,
  env.GEMINI_API_KEY_2,
  env.GEMINI_API_KEY_3,
  env.GEMINI_API_KEY_4
];

const cerebrasKeys = [
  env.CEREBRAS_API_KEY_1,
  env.CEREBRAS_API_KEY_2,
  env.CEREBRAS_API_KEY_3,
  env.CEREBRAS_API_KEY_4
];

// ============================================================
// SMART ADAPTIVE CONTEXT ROUTING (SACR) — v2.0
// Memilah beban konteks secara otomatis:
//   MODE LIGHT ⚡ : Cerebras (Tier 1-4) -> Gemini 3.7 (Tier 5-8) -> Gemini 3.6 (Tier 9-12)
//   MODE HEAVY 🧠 : Gemini 3.7 (Tier 1-4) -> Gemini 3.6 (Tier 5-8) -> Google Gemma 4 Skip-CoT (Tier 9-12)
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
 * Execute AI Prompt with Smart Adaptive Context Routing (SACR) + 16-Layer Fallback
 *
 * MODE LIGHT ⚡ (Konteks Normal — default):
 *   Tier 1-4  : Cerebras Gemma 4 31B Key 1-4       (The Ultra-Fast WSE-3 Sprinters)
 *   Tier 5-8  : Google Gemini 3.7 Flash Key 1-4    (The Advanced Reasoning Secondary)
 *   Tier 9-12 : Google Gemini 3.6 Flash Key 1-4    (The Rock-Solid Tertiary — 1M Context)
 *
 * MODE HEAVY 🧠 (Konteks Berat & Berpikir Kritis — otomatis jika threshold/keyword terpenuhi):
 *   Tier 1-4  : Google Gemini 3.7 Flash Key 1-4    (1 Juta Token Window, Deep Critical Thinking Priority)
 *   Tier 5-8  : Google Gemini 3.6 Flash Key 1-4    (1 Juta Token Window, 100% Stable Secondary)
 *   Tier 9-12 : Google AI Studio Gemma 4 31B Key 1-4 (Skip-CoT Fast Companion Tertiary)
 *
 * Tier 13 : Hugging Face Gemma 4 31B IT          (The Free Safety Net)
 * Tier 14 : Mistral Pixtral 12B                  (The Reliable European Closer — 937.5K TPM)
 * Tier 15 : Puter AI Multi-Model Pool            (Codestral & GPT-4o)
 * Tier 16 : OpenRouter Multi-Model Free          (The Indestructible Last Resort)
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


// ============================================================
// TOKEN USAGE ACCUMULATOR
// ============================================================
let currentSessionTokenUsage = { input_tokens: 0, output_tokens: 0, total_tokens: 0 };

function resetTokenAccumulator() {
  currentSessionTokenUsage = { input_tokens: 0, output_tokens: 0, total_tokens: 0 };
}

function getAccumulatedTokenUsage() {
  return { ...currentSessionTokenUsage };
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

  const inputChars = (prompt?.length || 0) + (systemInstruction?.length || 0);
  // [SACR v2.1 DUAL-MODE ROUTING MATRIX]
  // Prioritas Utama: Google Gemma 4 (Anti-CoT) dengan kuota 14.4K RPD x 4 Keys = 57.600 Request/Hari!
  asyncLog(`[SACR] Mode: ${heavy ? 'HEAVY 🧠' : 'LIGHT ⚡'} [Google Gemma 4 -> Gemini 3.7 -> Gemini 3.6] | Total chars: ${inputChars}`);

  // 1. Google AI Studio Gemma 4 31B (Anti-CoT) (4 Keys - 57.6K RPD Free Quota)
  const googleGemmaBlock = googleApiKeys
    .filter(Boolean)
    .map((key, i) => ({
      name: `Tier X (Google Gemma 4 Key ${i + 1} [Anti-CoT])`,
      fn: () => callGoogleGemma(key, prompt, systemInstruction, temperature, jsonMode, 1)
    }));

  // 2. Gemini 3.7 Flash (4 Keys)
  const gemini37Block = googleApiKeys
    .filter(Boolean)
    .map((key, i) => ({
      name: `Tier X (Gemini 3.7 Flash Key ${i + 1})`,
      fn: () => callGeminiWithRetry(key, 'gemini-3.7-flash', prompt, systemInstruction, temperature, jsonMode, 1)
    }));

  // 3. Gemini 3.6 Flash (4 Keys)
  const gemini36Block = googleApiKeys
    .filter(Boolean)
    .map((key, i) => ({
      name: `Tier X (Gemini 3.6 Flash Key ${i + 1})`,
      fn: () => callGeminiWithRetry(key, 'gemini-3.6-flash', prompt, systemInstruction, temperature, jsonMode, 1)
    }));

  // 4. Cerebras Gemma 4 31B (4 Keys - PayGo / Fallback)
  const cerebrasBlock = cerebrasKeys
    .filter(Boolean)
    .map((key, i) => ({
      name: `Tier X (Cerebras Gemma 4 Key ${i + 1})`,
      fn: () => callCerebras(key, prompt, systemInstruction, temperature, jsonMode)
    }));

  // Penataan Top 12 Tiers Sesuai SACR v2.1:
  // Tier 1-4: Google Gemma 4 31B Anti-CoT
  // Tier 5-8: Gemini 3.7 Flash
  // Tier 9-12: Gemini 3.6 Flash
  const top12Block = [...googleGemmaBlock, ...gemini37Block, ...gemini36Block];

  const tiers = [
    // Tier 1-12 Top Engine
    ...top12Block.map((t, i) => ({ ...t, name: t.name.replace('Tier X', `Tier ${i + 1}`) })),
    // Tier 13: Cerebras Gemma 4 31B (PayGo Fallback)
    ...(cerebrasBlock.length > 0 ? [{
      name: 'Tier 13 (Cerebras Gemma 4 Pool)',
      fn: () => cerebrasBlock[0].fn()
    }] : []),
    // Tier 14: Mistral Pixtral 12B
    ...(env.MISTRAL_API_KEY ? [{
      name: 'Tier 14 (Mistral Pixtral 12B)',
      fn: () => callMistral(prompt, systemInstruction, temperature, jsonMode, 'pixtral-12b-2409')
    }] : []),
    // Tier 15: Puter AI Multi-Model Pool (Codestral -> GPT-4o -> Mistral-Large -> Gemma 4 31B)
    ...(env.PUTER_AUTH_TOKEN ? [{
      name: 'Tier 15 (Puter AI Pool - Codestral & GPT-4o)',
      fn: () => callPuter(prompt, systemInstruction, temperature, jsonMode, 'codestral-latest')
    }] : []),
    // Tier 16: OpenRouter Multi-Model Free Pool
    ...(env.OPENROUTER_API_KEY ? [{
      name: 'Tier 16 (OpenRouter)',
      fn: () => callOpenRouter(prompt, systemInstruction, temperature, jsonMode)
    }] : [])
  ];

  for (const tier of tiers) {
    try {
      asyncLog(`[FALLBACK] Trying ${tier.name}...`);
      const rawRes = await tier.fn();
      const validated = validateResponseJson(rawRes, jsonMode);

      // Accumulate token usage (1 token ≈ 3.8 chars in Indonesian/English mix)
      const outputChars = validated?.length || 0;
      const inTok = Math.ceil(inputChars / 3.8);
      const outTok = Math.ceil(outputChars / 3.8);
      currentSessionTokenUsage.input_tokens += inTok;
      currentSessionTokenUsage.output_tokens += outTok;
      currentSessionTokenUsage.total_tokens += (inTok + outTok);

      return validated;
    } catch (e) {
      asyncWarn(`[FALLBACK] ${tier.name} failed:`, getErrDetails(e));
    }
  }

  // Fallback Final
  asyncError('[FALLBACK] ⚠️ All 16 AI layers exhausted. Entering Dumb Mode.');
  return JSON.stringify({
    intent: 'DUMB_MODE',
    extracted_data: null,
    god_mode_trigger: false,
    reply_message: '⚠️ Sistem Otak N.E.X.A (AI Router) mengalami Down Total di semua 16 peladen dunia. Mohon tunggu beberapa saat.'
  });
}

// ----------------------------------------------------
// API WRAPPERS WITH 503 SMART RETRY
// ----------------------------------------------------

function cleanGemmaOutput(rawText, jsonMode = false) {
  if (!rawText) return '';
  let text = rawText.trim();

  if (jsonMode) {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) return jsonMatch[0];
    return text;
  }

  // Jika Gemma mengeluarkan format thought list "* User: ... * Greeting: ...", ambil pesan percakapan terakhir
  const quoteMatch = text.match(/"([^"]{10,})"/g);
  if (quoteMatch && quoteMatch.length > 0) {
    const lastQuote = quoteMatch[quoteMatch.length - 1].replace(/^"|"$/g, '');
    if (lastQuote.length > 15) return lastQuote;
  }

  // Bersihkan bullet points monolog internal jika ada
  const lines = text.split('\n');
  const cleanLines = lines.filter(l => !l.trim().startsWith('*   User:') && !l.trim().startsWith('*   Persona:') && !l.trim().startsWith('*   Constraint:') && !l.trim().startsWith('*   Greeting:'));
  return cleanLines.join('\n').trim();
}

async function callGoogleGemma(apiKey, prompt, systemInstruction = '', temperature = 0.3, jsonMode = true, retries = 1) {
  const baseUrl = (process.env.GEMINI_BASE_URL || 'https://generativelanguage.googleapis.com').replace(/\/$/, '');
  const url = `${baseUrl}/v1beta/models/gemma-4-31b-it:generateContent?key=${apiKey}`;

  // Injeksi Instruksi Anti-CoT (Mematikan Monolog Internal & Draf)
  let optimizedSys = systemInstruction || '';
  if (jsonMode) {
    optimizedSys += '\n[IMPORTANT: Output ONLY pure raw JSON starting with { and ending with }. Absolutely NO thinking notes, no markdown codeblocks, no thought analysis.]';
  } else {
    optimizedSys += '\n[CRITICAL: Speak directly as N.E.X.A in natural Indonesian. Output ONLY the final conversational message. DO NOT output drafts, internal thoughts, bulleted analysis, notes, or English meta-commentary.]';
  }

  const userPayload = jsonMode 
    ? `[RESPOND ONLY IN JSON. NO THINKING]\n\n${prompt}`
    : `[SPEAK DIRECTLY IN INDONESIAN. NO THINKING]\n\n${prompt}`;

  const body = {
    contents: [{
      role: 'user',
      parts: [{ text: userPayload }]
    }],
    systemInstruction: { parts: [{ text: optimizedSys }] },
    generationConfig: {
      temperature,
      maxOutputTokens: jsonMode ? 1500 : 1000
    }
  };

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(15000)
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(`Google Gemma error: ${res.status} - ${err.error?.message || res.statusText}`);
      }

      const resJson = await res.json();
      const rawText = resJson.candidates?.[0]?.content?.parts?.[0]?.text || '';
      return cleanGemmaOutput(rawText, jsonMode);
    } catch (e) {
      if (attempt === retries) throw e;
      await new Promise(r => setTimeout(r, 1500 * attempt));
    }
  }
}

async function callGeminiWithRetry(apiKey, modelName, prompt, systemInstruction, temperature, jsonMode = true, retries = 1) {
  const baseUrl = (process.env.GEMINI_BASE_URL || 'https://generativelanguage.googleapis.com').replace(/\/$/, '');
  const url = `${baseUrl}/v1beta/models/${modelName}:generateContent?key=${apiKey}`;

  const body = {
    contents: [{
      role: 'user',
      parts: [{ text: prompt }]
    }],
    generationConfig: {
      temperature,
      maxOutputTokens: 1500
    }
  };

  if (systemInstruction) {
    body.systemInstruction = { parts: [{ text: systemInstruction }] };
  }

  if (jsonMode) {
    body.generationConfig.responseMimeType = 'application/json';
  }

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(15000)
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(`Gemini error: ${res.status} - ${err.error?.message || res.statusText}`);
      }

      const data = await res.json();
      return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    } catch (e) {
      if (attempt === retries) throw e;
      await new Promise(resolve => setTimeout(resolve, 1500 * attempt));
    }
  }
}

async function callGroq(apiKey, prompt, systemInstruction, temperature, jsonMode = true, retries = 1) {
  const safeSysInst = (jsonMode && !/json/i.test(systemInstruction + prompt))
    ? `${systemInstruction}\nRespond in valid json format.`
    : systemInstruction;

  const requestBody = {
    model: 'llama-3.3-70b-versatile',
    messages: [
      { role: 'system', content: safeSysInst },
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
    model: 'gemma-4-31b',  // Restored: Gemma 4 31B (128k context window, unlike ZAI GLM 4.7's 8k limit)
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
        // Timeout 5.000ms (5 detik) memberikan toleransi lebih saat antrean server sedang tinggi.
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

async function callPuter(prompt, systemInstruction, temperature, jsonMode = true, primaryModelId = 'codestral-latest', retries = 1) {
  const token = env.PUTER_AUTH_TOKEN;
  if (!token) throw new Error('No PUTER_AUTH_TOKEN configured');

  // Pool model aktif terverifikasi di Puter AI (diurutkan berdasar kecepatan benchmark real-time)
  const puterModels = [
    primaryModelId,
    'gpt-4o',
    'mistral-large-latest',
    'google/gemma-4-31b-it'
  ].filter((v, i, a) => a.indexOf(v) === i); // deduplicate

  const messages = [];
  if (systemInstruction) {
    messages.push({ role: 'system', content: systemInstruction });
  }
  messages.push({ role: 'user', content: prompt });

  for (const modelId of puterModels) {
    const requestBody = {
      model: modelId,
      messages: messages,
      temperature,
      max_tokens: 1500
    };
    if (jsonMode) requestBody.response_format = { type: 'json_object' };

    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        const response = await axios.post('https://api.puter.com/puterai/openai/v1/chat/completions', requestBody, {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          timeout: 6000
        });
        return response.data.choices[0].message.content;
      } catch (e) {
        if (attempt < retries) {
          await new Promise(r => setTimeout(r, 1000));
          continue;
        }
        asyncWarn(`[FALLBACK] Puter AI model ${modelId} failed:`, getErrDetails(e));
        break; // Pindah ke model berikutnya dalam pool Puter AI
      }
    }
  }

  throw new Error('All Puter AI pool models exhausted.');
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

module.exports = { executeWithFallback, resetTokenAccumulator, getAccumulatedTokenUsage };
