const env = require('../config/env');
const { NEXA_PERSONALITY } = require('../config/personality');
const axios = require('axios');
const https = require('https');
const { downloadProxyToBase64, fetchProxyJSON } = require('../utils/telegram_proxy.js');

// IPv4 agent — forces Gemini API calls over IPv4 to avoid Hugging Face routing issues
const ipv4Agent = new https.Agent({ family: 4, keepAlive: true });

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
- Jika gambar berupa DATA (tabel, grafik, struk belanja, tiket), EKSTRAK intisari dan nilai-nilai utamanya (misal: nama tempat, total harga, daftar barang, jadwal).
- Jika gambar adalah OBJEK/MOMEN/PRODUK (foto alam, orang, makanan, barang), DESKRIPSIKAN dengan natural, detail, dan gunakan kepribadian N.E.X.A.
- Jadilah PROAKTIF. Pahami *mengapa* gambar ini dikirimkan berdasarkan konteks visualnya.

ATURAN KELUARAN WAJIB:
- Tulis dalam Bahasa Indonesia yang natural dan mengalir.
- SELALU sebut "Tuan Faqih" sebagai subjek (contoh: "Tuan Faqih mengirimkan gambar...").
- Output HANYA boleh berupa SATU paragraf naratif yang kaya informasi. DILARANG KERAS menggunakan format poin-poin (bullet points).
- Jika ada caption dari pengguna, instruksi/konteks caption tersebut HARUS menjadi fokus utama dari arah narasimu, dan sertakan interpretasi maksud Tuan Faqih di bagian akhir.
`;

// Build a list of proxy URLs for a given target URL
function getProxyUrls(targetUrl) {
  const urls = [];
  // Priority 1: Custom Cloudflare Relay
  if (env.TELEGRAM_PROXY_URL) {
    urls.push(`${env.TELEGRAM_PROXY_URL}${encodeURIComponent(targetUrl)}`);
  } else {
    // Only fallback to AllOrigins if Custom Relay is missing, because AllOrigins is currently extremely slow/dead
    urls.push(`https://api.allorigins.win/raw?url=${encodeURIComponent(targetUrl)}`);
  }
  return urls;
}

// For backwards compatibility
function getProxyList(targetUrl) {
  return getProxyUrls(targetUrl).map((url, i) => ({
    name: i === 0 && env.TELEGRAM_PROXY_URL ? 'Custom Relay' : 'AllOrigins',
    url
  }));
}

// ============================================================
// STEP 1: Download image as base64 via failover
// ============================================================
async function downloadTelegramImageAsBase64(fileId) {
  if (!env.TELEGRAM_BOT_TOKEN) throw new Error('TELEGRAM_BOT_TOKEN is missing');

  const getFileUrl = `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/getFile?file_id=${fileId}`;
  console.log('[VISION] Step 1: Getting file info...');

  // Race all proxies in parallel for maximum speed
  const proxyUrls = getProxyUrls(getFileUrl);
  const fileData = await fetchProxyJSON(proxyUrls, 20000, 3);
  if (!fileData || !fileData.ok) throw new Error('Telegram getFile error: ' + JSON.stringify(fileData));
  const filePath = fileData.result.file_path;
  console.log('[VISION] Step 1 complete. File path acquired.');

  const fileUrl = `https://api.telegram.org/file/bot${env.TELEGRAM_BOT_TOKEN}/${filePath}`;
  const downloadProxyUrls = getProxyUrls(fileUrl);

  console.log('[VISION] Step 2: Downloading image binary (parallel race)...');
  const base64Data = await downloadProxyToBase64(downloadProxyUrls, 20 * 1024 * 1024);
  console.log('[VISION] Image ready. Base64 size:', base64Data.length, 'chars');

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
// GROQ VISION CALLER (Llama 4 Scout 17B) — with 503 Smart Retry
// ============================================================
async function callGroqVision(apiKey, imageData, caption, retries = 3, systemPromptOverride = '') {
  const captionContext = caption
    ? `\nCaption dari pengguna: "${caption}". Gunakan ini sebagai petunjuk utama.`
    : '\nTidak ada caption. Analisis gambar secara mandiri.';

  const finalSystemPrompt = systemPromptOverride || (VISION_SYSTEM_PROMPT + captionContext);

  const requestBody = {
    model: 'meta-llama/llama-4-scout-17b-16e-instruct',
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
        'Authorization': `Bearer ${env.HF_TOKEN}`,
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
// MAIN ENTRY POINT — 11-TIER GOD MODE VISION FALLBACK
// ============================================================
async function processTelegramImage(fileId, caption = '', systemPromptOverride = '') {
  // Download image ONCE — reused across ALL tiers
  console.log('[VISION] Downloading image from Telegram...');
  const imageData = await downloadTelegramImageAsBase64(fileId);
  console.log('[VISION] Image ready. Base64 size:', imageData.data.length, 'chars');

  // Build tier list dynamically from available keys
  const tiers = [
    // Tier 1-4: Gemini 2.5 Flash (Premium Quality, 4 Keys)
    ...GEMINI_25_KEYS.map((key, i) => ({
      name: `Tier${i + 1} (Gemini 2.5 Flash Key ${i + 1})`,
      fn: () => callGeminiVision(key, 'gemini-2.5-flash', imageData, caption, 3, systemPromptOverride)
    })),
    // Tier 5-8: Groq Llama 4 Scout 17B (Balanced, 4 Keys)
    ...GROQ_KEYS.map((key, i) => ({
      name: `Tier${GEMINI_25_KEYS.length + i + 1} (Groq Llama4-Scout Key ${i + 1})`,
      fn: () => callGroqVision(key, imageData, caption, 3, systemPromptOverride)
    })),
    // Tier 9-10: Gemini 2.0 Flash (Generous Quota, 2 Keys)
    ...GEMINI_20_KEYS.map((key, i) => ({
      name: `Tier${GEMINI_25_KEYS.length + GROQ_KEYS.length + i + 1} (Gemini 2.0 Flash Key ${i + 1})`,
      fn: () => callGeminiVision(key, 'gemini-2.0-flash', imageData, caption, 3, systemPromptOverride)
    })),
    // Tier 11: Hugging Face Qwen2-VL (Safety Net — No daily quota)
    {
      name: `Tier${GEMINI_25_KEYS.length + GROQ_KEYS.length + GEMINI_20_KEYS.length + 1} (HuggingFace Qwen2-VL)`,
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

      // 500ms cooling before trying next tier
      await new Promise(r => setTimeout(r, 500));
    }
  }

  // FALLBACK FINAL — All tiers exhausted, alert user via Telegram
  throw new Error('⚠️ VISION DOWN TOTAL: Semua 11 Tier Vision Engine gagal (4x Gemini 2.5 + 4x Groq + 2x Gemini 2.0 + HuggingFace).');
}

module.exports = { processTelegramImage };
