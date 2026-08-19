const env = require('../config/env');
const { NEXA_PERSONALITY } = require('../config/personality');
const axios = require('axios');
const https = require('https');
const { downloadProxyToBase64, downloadRelayB64ToBase64, fetchProxyJSON } = require('../utils/telegram_proxy.js');
const { buildProxyChain, postToRelay } = require('../utils/telegram_network');

// IPv4 agent — forces Gemini API calls over IPv4 to avoid Hugging Face routing issues
const ipv4Agent = new https.Agent({ family: 4 });

// ============================================================
// MULTI-KEY POOL — Built at startup, null slots are skipped
// ============================================================
const GEMINI_25_KEYS = [
  env.GEMINI_API_KEY_1,
  env.GEMINI_API_KEY_2,
  env.GEMINI_API_KEY_3,
  env.GEMINI_API_KEY_4,
].filter(Boolean);

const GEMINI_20_KEYS = [
  env.GEMINI_API_KEY_1,
  env.GEMINI_API_KEY_2,
].filter(Boolean);

const GROQ_KEYS = [
  env.GROQ_API_KEY_1,
  env.GROQ_API_KEY_2,
  env.GROQ_API_KEY_3,
  env.GROQ_API_KEY_4,
].filter(Boolean);

const CEREBRAS_VISION_KEYS = [
  env.CEREBRAS_API_KEY_4, // D
  env.CEREBRAS_API_KEY_3, // C
  env.CEREBRAS_API_KEY_1, // A
  env.CEREBRAS_API_KEY_2, // B
].filter(Boolean);

// ============================================================
// UNIVERSAL IMAGE INTERPRETER — System Prompt
// ============================================================
const VISION_SYSTEM_PROMPT = `
${NEXA_PERSONALITY}

[MODUL PENGLIHATAN — Universal Image Interpreter]
Anda baru saja menerima SEBUAH GAMBAR dari Tuan Faqih melalui Telegram.

TUGAS UTAMA ANDA:
Bertindaklah sebagai mata cerdas N.E.X.A. Analisis gambar ini secara komprehensif, dinamis, dan tanpa batasan kategori kaku. Pahami secara mendalam apa yang ada di dalam gambar, lalu hasilkan deskripsi naratif yang kaya, akurat, dan sangat mendetail. 

PANDUAN ANALISIS DINAMIS:
- Jika gambar mengandung TEKS (dokumen, surat, tulisan tangan, screenshot), BACA dan EKSTRAK semua informasi krusialnya ke dalam narasi. Jangan lewatkan nama, angka penting, tanggal, nominal, kontak, atau nomor referensi.
- Jika gambar berupa DATA / TABEL / JADWAL / STRUK (tabel piket, roster mingguan, KRS kuliah, jadwal sholat, grafik, tiket), EKSTRAK seluruh baris, kolom, tanggal, jenis tugas/acara, dan nama petugas secara LENGKAP dan TERSTRUKTUR agar AI downstream dapat memetakan setiap sel dengan presisi 100%.
- Jika gambar adalah OBJEK/MOMEN/PRODUK (foto alam, orang, makanan, barang), DESKRIPSIKAN dengan natural, detail, dan gunakan kepribadian N.E.X.A.
- Jadilah PROAKTIF. Pahami *mengapa* gambar ini dikirimkan berdasarkan konteks visualnya.

ATURAN KELUARAN WAJIB:
- Tulis dalam Bahasa Indonesia yang natural dan jelas.
- SELALU sebut "Tuan Faqih" sebagai subjek (contoh: "Tuan Faqih mengirimkan gambar jadwal piket...").
- Untuk foto umum/objek, gunakan narasi mengalir. Namun KHUSUS untuk TABEL/JADWAL/STRUK, sertakan rincian data per baris/kolom atau teks tabel yang lengkap dan terstruktur.
- Jika ada caption dari pengguna, instruksi/konteks caption tersebut HARUS menjadi fokus utama dari arah narasimu, dan sertakan interpretasi maksud Tuan Faqih di bagian akhir.
`;

// ============================================================
// PROXY HELPER
// ============================================================
// Proxy list untuk JSON (getFile API) - Custom Relay cocok untuk ini
function getProxyList(targetUrl) {
  return buildProxyChain(targetUrl);
}

// Proxy list untuk BINARY download (gambar/audio)
// Worker v3.0: Custom Relay menggunakan mode b64=true (JSON) agar lolos HF egress firewall
function getBinaryProxyList(targetUrl) {
  const proxies = [];
  const relayBase = env.NEXA_VERCEL_RELAY_URL || env.TELEGRAM_PROXY_URL;
  if (relayBase) {
    proxies.push({
      name: 'Vercel Relay B64',
      url: relayBase.replace(/\?url=$/, '').replace(/\/+$/, ''),
      targetUrl,
      useB64: true,
    });
  }
  proxies.push({
    name: 'AllOrigins',
    url: `https://api.allorigins.win/raw?url=${encodeURIComponent(targetUrl)}`,
    useB64: false,
  });
  return proxies;
}

async function fetchJsonWithFailover(targetUrl, opts = {}) {
  const timeoutMs = (opts.timeout || 30) * 1000;
  const proxies = getProxyList(targetUrl);

  for (const proxy of proxies) {
    try {
      console.log(`[VISION] Getting JSON via: ${proxy.name}...`);
      const parsed = await fetchProxyJSON(proxy.url, timeoutMs, 3, proxy.headers);
      if (parsed.ok !== undefined) {
        console.log(`[VISION] ${proxy.name} JSON fetch succeeded.`);
        return parsed;
      }
    } catch (err) {
      console.warn(`[VISION] ${proxy.name} JSON fetch failed: [${err.code || 'NO_CODE'}] ${err.message}`);
    }
  }
  throw new Error('All download paths failed to retrieve valid JSON from Telegram.');
}

// ============================================================
// STEP 1: Download image as base64 via failover
// ============================================================
async function downloadTelegramImageAsBase64(fileId) {
  if (!env.TELEGRAM_BOT_TOKEN) throw new Error('TELEGRAM_BOT_TOKEN is missing');

  const getFileUrl = `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/getFile?file_id=${fileId}`;
  console.log('[VISION] Step 1: Getting file info...');

  const fileData = await fetchJsonWithFailover(getFileUrl);
  if (!fileData.ok) throw new Error('Telegram getFile error: ' + JSON.stringify(fileData));
  const filePath = fileData.result.file_path;

  // Mengunduh biner secara murni menggunakan Native Node.js
  const fileUrl = `https://api.telegram.org/file/bot${env.TELEGRAM_BOT_TOKEN}/${filePath}`;
  // Gunakan getBinaryProxyList - Custom Relay dilewati karena Cloudflare Worker timeout saat stream file besar
  const proxies = getBinaryProxyList(fileUrl);

  console.log('[VISION] Step 2: Downloading image binary...');
  let base64Data = '';
  
  for (const proxy of proxies) {
    try {
      console.log(`[VISION] Downloading binary via: ${proxy.name}...`);
      
      let b64;
      if (proxy.useB64) {
        // Mode B64: Cloudflare Worker encode biner jadi JSON (bypass HF egress firewall)
        b64 = await downloadRelayB64ToBase64(proxy.url, proxy.targetUrl, 20 * 1024 * 1024);
      } else {
        // Mode normal
        b64 = await downloadProxyToBase64(proxy.url, 20 * 1024 * 1024);
      }
      
      if (b64 && b64.length > 100) {
        base64Data = b64;
        console.log(`[VISION] Image downloaded via ${proxy.name}. Base64 size:`, base64Data.length, 'chars');
        break;
      }
    } catch (err) {
      console.warn(`[VISION] ${proxy.name} binary download failed: [${err.code || 'NO_CODE'}] ${err.message}`);
    }
  }

  if (!base64Data) {
    throw new Error('Image download failed across all proxies. Proxy may be timing out or blocked.');
  }

  const ext = filePath.split('.').pop().toLowerCase();
  let mimeType = 'image/jpeg';
  if (ext === 'png') mimeType = 'image/png';
  if (ext === 'webp') mimeType = 'image/webp';

  return { mimeType, data: base64Data };
}

// ============================================================
// GEMINI VISION CALLER — with 503 Smart Retry
// ============================================================
async function callGeminiVision(apiKey, modelName, imageData, caption, retries = 3, systemPromptOverride = '') {
  const captionContext = caption
    ? `\n[CAPTION/INSTRUKSI DARI TUAN FAQIH]: "${caption}"\nGunakan caption ini sebagai petunjuk utama apa yang Tuan Faqih inginkan dari gambar ini.`
    : '\n[TIDAK ADA CAPTION]: Tuan Faqih tidak memberikan instruksi teks. Analisis gambar dan interpretasikan konteksnya secara cerdas.';

  const finalSystemPrompt = systemPromptOverride || (VISION_SYSTEM_PROMPT + captionContext);

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;
  const payload = {
    systemInstruction: { parts: [{ text: finalSystemPrompt }] },
    contents: [{
      parts: [
        { text: systemPromptOverride ? 'Lakukan ekstraksi metadata sesuai system prompt.' : 'Analisis gambar ini sekarang dan hasilkan teks instruksi lengkap sesuai sistem prompt.' },
        { inlineData: { mimeType: imageData.mimeType, data: imageData.data } }
      ]
    }],
    generationConfig: { temperature: systemPromptOverride ? 0.1 : 0.4 } // Lower temperature for JSON extraction
  };

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const response = await axios.post(url, payload, {
        headers: { 'Content-Type': 'application/json' },
        maxBodyLength: Infinity,
        maxContentLength: Infinity,
        httpsAgent: ipv4Agent,
        timeout: 30000
      });

      if (!response.data.candidates || response.data.candidates.length === 0) {
        throw new Error('Gemini API returned no candidates.');
      }
      return response.data.candidates[0].content.parts[0].text;
    } catch (e) {
      const status = e.response?.status;
      if (status === 503 && attempt < retries) {
        const delay = attempt * 2000;
        console.warn(`[VISION] 503 attempt ${attempt}/${retries}, retry in ${delay}ms...`);
        await new Promise(r => setTimeout(r, delay));
        continue;
      }
      throw e;
    }
  }
}

// ============================================================
// GROQ VISION CALLER (Llama 3.2 90B Vision) — with 503 Smart Retry
// ============================================================
async function callGroqVision(apiKey, imageData, caption, retries = 3, systemPromptOverride = '') {
  const captionContext = caption
    ? `\nCaption dari pengguna: "${caption}". Gunakan ini sebagai petunjuk utama.`
    : '\nTidak ada caption. Analisis gambar secara mandiri.';

  const finalSystemPrompt = systemPromptOverride || (VISION_SYSTEM_PROMPT + captionContext);

  const requestBody = {
    model: 'llama-3.2-90b-vision-preview',
    messages: [{
      role: 'user',
      content: [
        { type: 'text', text: finalSystemPrompt + (systemPromptOverride ? '' : '\n\nAnalisis gambar ini sekarang.') },
        { type: 'image_url', image_url: { url: `data:${imageData.mimeType};base64,${imageData.data}` } }
      ]
    }],
    temperature: systemPromptOverride ? 0.1 : 0.4,
    max_tokens: 2048
  };

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const response = await axios.post('https://api.groq.com/openai/v1/chat/completions', requestBody, {
        headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        httpsAgent: ipv4Agent,
        maxBodyLength: Infinity,
        maxContentLength: Infinity,
        timeout: 25000
      });

      if (!response.data.choices || response.data.choices.length === 0) {
        throw new Error('Groq Vision returned no choices.');
      }
      return response.data.choices[0].message.content;
    } catch (e) {
      const status = e.response?.status;
      if (status === 503 && attempt < retries) {
        const delay = attempt * 2000;
        console.warn(`[VISION] Groq 503 attempt ${attempt}/${retries}, retry in ${delay}ms...`);
        await new Promise(r => setTimeout(r, delay));
        continue;
      }
      throw e;
    }
  }
}

// ============================================================
// CEREBRAS VISION CALLER (gemma-4-31b) — Ultra-Fast WSE-3 Vision
// ============================================================
async function callCerebrasVision(apiKey, imageData, caption, retries = 2, systemPromptOverride = '') {
  if (!apiKey) throw new Error('No Cerebras API key provided');
  const captionContext = caption
    ? `\nCaption dari pengguna: "${caption}". Gunakan ini sebagai petunjuk utama.`
    : '\nTidak ada caption. Analisis gambar secara mandiri.';
  const finalSystemPrompt = systemPromptOverride || (VISION_SYSTEM_PROMPT + captionContext);

  const requestBody = {
    model: 'gemma-4-31b',
    messages: [
      { role: 'system', content: finalSystemPrompt },
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Analisis gambar ini secara mendetail sesuai instruksi sistem.' },
          { type: 'image_url', image_url: { url: `data:${imageData.mimeType};base64,${imageData.data}` } }
        ]
      }
    ],
    max_tokens: 1200
  };

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const response = await axios.post('https://api.cerebras.ai/v1/chat/completions', requestBody, {
        headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        timeout: 25000
      });
      return response.data.choices[0].message.content;
    } catch (e) {
      if (e.response?.status === 404 || e.response?.status === 429 || e.response?.status === 400) throw e;
      if (attempt === retries) throw e;
    }
  }
}

// ============================================================
// HF VISION CALLER (Qwen2-VL-7B-Instruct) — Final Safety Net
// ============================================================
async function callHuggingFaceVision(imageData, caption, systemPromptOverride = '') {
  if (!env.HF_TOKEN) throw new Error('HF_TOKEN not configured');

  const captionContext = caption
    ? `Caption dari pengguna: "${caption}". ` : '';

  const finalPrompt = systemPromptOverride 
    ? systemPromptOverride
    : `${captionContext}Analisis gambar ini sekarang. ${VISION_SYSTEM_PROMPT.substring(0, 300)}`;

  const prompt = finalPrompt;

  const response = await axios.post(
    'https://api-inference.huggingface.co/models/Qwen/Qwen2-VL-7B-Instruct',
    {
      inputs: {
        image: imageData.data,
        question: prompt
      }
    },
    {
      headers: {
        'Authorization': `Bearer ${env.HF_INFERENCE_TOKEN}`,
        'Content-Type': 'application/json'
      },
      timeout: 60000
    }
  );

  const output = response.data;
  if (Array.isArray(output) && output[0]?.generated_text) return output[0].generated_text;
  if (typeof output === 'string') return output;
  throw new Error('Unexpected HF response format: ' + JSON.stringify(output).substring(0, 200));
}

// ============================================================
// TIER 0: WORKER VISION — The Game Changer
// Worker mendownload gambar DAN memanggil Gemini langsung dari Cloudflare.
// N.E.X.A hanya menerima JSON kecil berisi teks deskripsi.
// TIDAK ADA file biner besar yang perlu diunduh oleh HF container!
// ============================================================
async function callWorkerVision(fileId, caption = '', systemPromptOverride = '') {
  const relayBase = env.NEXA_VERCEL_RELAY_URL || env.TELEGRAM_PROXY_URL;
  if (!relayBase || !env.TELEGRAM_BOT_TOKEN) {
    throw new Error('Vercel relay URL or Bot Token not configured');
  }

  const getFileUrl = `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/getFile?file_id=${fileId}`;
  const proxies = getProxyList(getFileUrl);

  console.log('[VISION-W0] Getting file path via relay...');
  let fileData = null;
  for (const proxy of proxies) {
    try {
      fileData = await fetchProxyJSON(proxy.url, 30000, 2, proxy.headers);
      if (fileData?.ok) break;
    } catch (e) {
      console.warn(`[VISION-W0] getFile via ${proxy.name} failed: ${e.message}`);
    }
  }
  if (!fileData?.ok || !fileData.result?.file_path) {
    throw new Error(`Telegram getFile error: ${JSON.stringify(fileData).substring(0, 100)}`);
  }
  const filePath = fileData.result.file_path;

  if (GEMINI_25_KEYS.length === 0) throw new Error('No Gemini 2.5 API keys configured');
  const geminiKey = GEMINI_25_KEYS[Math.floor(Math.random() * GEMINI_25_KEYS.length)];

  const captionContext = caption
    ? `\nCaption dari pengguna: "${caption}". Gunakan ini sebagai petunjuk utama.`
    : '\nTidak ada caption. Analisis gambar secara mandiri.';
  const finalSystemPrompt = systemPromptOverride || (VISION_SYSTEM_PROMPT + captionContext);

  console.log('[VISION-W0] Requesting Vercel relay to process vision...');
  const result = await postToRelay('/api/vision', {
    file_path: filePath,
    bot_token: env.TELEGRAM_BOT_TOKEN,
    gemini_key: geminiKey,
    prompt: 'Analisis gambar ini sekarang.',
    system_prompt: finalSystemPrompt,
  });

  if (!result.ok || !result.description) {
    throw new Error(`Relay vision failed: ${result.error || 'empty result'}`);
  }

  console.log('[VISION-W0] Relay vision SUCCESS! Length:', result.description.length);
  return result.description;
}

// ============================================================
// MAIN ENTRY POINT — 12-TIER GOD MODE VISION FALLBACK
// Tier 0:   Worker Vision (Cloudflare does everything)
// Tier 1-4: Gemini 2.5 Flash (Premium Quality, 4 Keys) + local file
// Tier 5-8: Groq Llama 3.2 90B Vision (Balanced, 4 Keys) + local file
// Tier 9-10: Gemini 2.0 Flash (Generous Quota, 2 Keys) + local file
// Tier 11: Hugging Face Qwen2-VL (Safety Net) + local file
// ============================================================
async function processTelegramImage(fileId, caption = '', systemPromptOverride = '') {
  // ============================================================
  // TIER 0: Coba Worker Vision DULU (no binary download!)
  // ============================================================
  try {
    const workerResult = await callWorkerVision(fileId, caption, systemPromptOverride);
    return workerResult;
  } catch (workerErr) {
    console.warn(`[VISION-W0] Worker Vision FAILED: ${workerErr.message}. Falling back to local download...`);
  }

  // ============================================================
  // TIER 1-13: Download image ONCE, then try all AI providers
  // ============================================================
  console.log('[VISION] Downloading image from Telegram...');
  const imageData = await downloadTelegramImageAsBase64(fileId);
  console.log('[VISION] Image ready. Base64 size:', imageData.data.length, 'chars');

  // Build tier list dynamically from available keys
  const tiers = [
    // Tier 1-4: Cerebras Gemma 4 31B Vision (Ultra-Fast WSE-3, DCAB order)
    ...CEREBRAS_VISION_KEYS.map((key, i) => ({
      name: `Tier${i + 1} (Cerebras Gemma 4 Vision Key ${i + 1})`,
      fn: () => callCerebrasVision(key, imageData, caption, 2, systemPromptOverride)
    })),
    // Tier 5-8: Gemini 3.6 Flash (Premium Quality, 4 Keys)
    ...GEMINI_25_KEYS.map((key, i) => ({
      name: `Tier${CEREBRAS_VISION_KEYS.length + i + 1} (Gemini 3.6 Flash Key ${i + 1})`,
      fn: () => callGeminiVision(key, 'gemini-3.6-flash', imageData, caption, 3, systemPromptOverride)
    })),
    // Tier 9-12: Groq Vision (Balanced, 4 Keys)
    ...GROQ_KEYS.map((key, i) => ({
      name: `Tier${CEREBRAS_VISION_KEYS.length + GEMINI_25_KEYS.length + i + 1} (Groq Vision Key ${i + 1})`,
      fn: () => callGroqVision(key, imageData, caption, 3, systemPromptOverride)
    })),
    // Tier 13: Hugging Face Qwen2-VL (Safety Net — No daily quota)
    {
      name: `Tier${CEREBRAS_VISION_KEYS.length + GEMINI_25_KEYS.length + GROQ_KEYS.length + 1} (HuggingFace Qwen2-VL)`,
      fn: () => callHuggingFaceVision(imageData, caption, systemPromptOverride)
    }
  ];

  for (const tier of tiers) {
    try {
      console.log(`[VISION] Trying ${tier.name}...`);
      const result = await tier.fn();
      if (!result || result.trim().length < 10) throw new Error('Response too short or empty');
      console.log(`[VISION] ${tier.name} SUCCESS. Output length:`, result.length);
      return result;
    } catch (e) {
      const status = e.status || e.response?.status || 'NET';
      const apiData = e.response?.data ? JSON.stringify(e.response.data) : '';
      const errMsg = e.response?.data?.error?.message || e.message || 'Unknown error';
      console.warn(`[VISION] ${tier.name} FAILED (${status}): ${errMsg} ${apiData ? '| ' + apiData : ''}`.substring(0, 500));
    }
  }

  // FALLBACK FINAL — All tiers exhausted, alert user via Telegram
  throw new Error('⚠️ VISION DOWN TOTAL: Semua 12 Tier Vision Engine gagal (Worker + 4x Gemini 2.5 + 4x Groq + 2x Gemini 2.0 + HuggingFace).');
}

module.exports = { processTelegramImage };
