const env = require('../config/env');
const { NEXA_PERSONALITY } = require('../config/personality');
const axios = require('axios');
const https = require('https');
const util = require('util');
const exec = util.promisify(require('child_process').exec);

// IPv4 agent for Gemini API calls via Axios
const ipv4Agent = new https.Agent({ family: 4, keepAlive: true });

// Keys will be read directly from env during processing

// ============================================================
// UNIVERSAL IMAGE INTERPRETER — System Prompt
// This prompt is the "cognitive bridge" between the visual world
// and the text-based AI Router. It MUST produce output that
// AI Router can cleanly parse into the correct intent.
// ============================================================
const VISION_SYSTEM_PROMPT = `
${NEXA_PERSONALITY}

[MODUL PENGLIHATAN — Universal Image Interpreter]
Anda baru saja menerima SEBUAH GAMBAR dari Tuan Faqih melalui Telegram.
${
  // Caption will be injected dynamically in the function
  ''
}

TUGAS UTAMA ANDA:
Analisis gambar ini dan hasilkan satu blok teks instruksi yang kaya, akurat, dan dapat diproses oleh sistem AI Router N.E.X.A. Teks ini akan menjadi "jembatan" antara gambar dan aksi sistem.

KATEGORIKAN gambar ini ke salah satu kategori berikut berdasarkan isinya, lalu ekstrak data yang relevan:

1. STRUK / NOTA / FAKTUR / KWITANSI
   → Ekstrak: nama toko/merchant, total nominal, tanggal, daftar item & harga
   → Contoh output: "Tuan Faqih mengirimkan struk belanja dari Indomaret tanggal 3 Mei 2026. Total pengeluaran Rp 47.500. Item: Aqua 600ml Rp 4.000, Roti Tawar Rp 15.000, dll. Ini adalah pengeluaran pribadi, tolong catat."

2. KARTU NAMA / KONTAK
   → Ekstrak: nama, nomor HP, email, perusahaan/jabatan, alamat
   → Contoh output: "Tuan Faqih mengirimkan kartu nama atas nama Dr. Budi Santoso, Dosen UGM, HP: 0812-3456-7890, email: budi@ugm.ac.id. Tolong simpan data kontak ini."

3. POSTER / UNDANGAN / PAMFLET ACARA
   → Ekstrak: nama acara, tanggal, waktu, lokasi, penyelenggara
   → Contoh output: "Tuan Faqih mengirimkan poster acara Seminar Diplomasi UGM pada Sabtu, 10 Mei 2026 pukul 09:00 di Gedung Pascasarjana UGM. Tolong masukkan ke kalender."

4. TANGKAPAN LAYAR (Screenshot) — Teks/Percakapan/Website
   → Baca SEMUA teks yang terlihat. Pahami konteksnya.
   → Contoh output: "Tuan Faqih mengirimkan screenshot percakapan WhatsApp yang berisi rencana meeting besok jam 2 siang. Tuan Faqih meminta [sesuai caption]."

5. PAPAN TULIS / CATATAN TANGAN / STICKY NOTE / DOKUMEN
   → Baca teks, interpretasikan isi, perhatikan konteks
   → Contoh output: "Tuan Faqih mengirimkan foto catatan tangan berisi daftar target minggu ini: 1) Selesaikan paper, 2) Hubungi Prof X, 3) Latihan debat. Tolong simpan ini."

6. FOTO PRODUK / BARANG
   → Deskripsikan produk, harga (jika terlihat), kondisi
   → Contoh output: "Tuan Faqih mengirimkan foto produk laptop Asus VivoBook seharga Rp 8.000.000. Tuan Faqih meminta [sesuai caption]."

7. FOTO ALAM / ORANG / MOMEN PERSONAL
   → Deskripsikan dengan natural, gunakan kepribadian N.E.X.A
   → Contoh output: "Tuan Faqih mengirimkan foto [deskripsi]. Caption-nya: [caption]. Tuan Faqih sepertinya ingin [interpretasi konteks]."

8. RESEP / MENU MAKANAN
   → Ekstrak nama makanan, bahan-bahan, langkah
   → Contoh output: "Tuan Faqih mengirimkan resep Nasi Goreng Spesial. Bahan: telur, nasi, kecap, dll. Tolong simpan resep ini."

9. KODE QR / BARCODE
   → Jika bisa dibaca, ekstrak kontennya
   → Contoh output: "Tuan Faqih mengirimkan QR code yang berisi link: https://.... Tuan Faqih meminta [sesuai caption]."

10. LAPORAN / TABEL / DATA (foto dokumen berisi tabel angka)
    → Baca dan ekstrak struktur tabelnya
    → Contoh output: "Tuan Faqih mengirimkan foto tabel laporan keuangan organisasi berisi data pengeluaran bulan April. Tolong buatkan spreadsheet baru dari data ini."

ATURAN KELUARAN:
- Tulis dalam Bahasa Indonesia yang natural
- SELALU sertakan "Tuan Faqih" sebagai subjek
- SELALU akhiri dengan interpretasi maksud Tuan Faqih (berdasarkan caption + konteks gambar)
- Output harus berupa SATU paragraf naratif kaya informasi (bukan poin-poin bullet)
- Jika ada caption, instruksi caption HARUS dimasukkan ke dalam narasi output
`;

/**
 * Route a URL through a relay proxy. Tries multiple proxies if one fails.
 */
async function fetchViaProxy(targetUrl, opts = {}) {
  const maxBuffer = opts.maxBuffer || 5 * 1024 * 1024;
  const timeout = opts.timeout || 30;

  // Custom proxy from env takes priority, then try public proxies in order
  const proxies = [
    ...(env.TELEGRAM_PROXY_URL ? [{ name: 'Custom', fmt: (u) => `${env.TELEGRAM_PROXY_URL}${encodeURIComponent(u)}` }] : []),
    { name: 'corsproxy.io', fmt: (u) => `https://corsproxy.io/?${encodeURIComponent(u)}` },
    { name: 'allorigins', fmt: (u) => `https://api.allorigins.win/raw?url=${encodeURIComponent(u)}` },
  ];

  for (const proxy of proxies) {
    try {
      console.log(`[VISION] Trying proxy: ${proxy.name}...`);
      const url = proxy.fmt(targetUrl);
      const result = await exec(
        `curl -sS --ipv4 --connect-timeout 15 --max-time ${timeout} "${url}"`,
        { maxBuffer }
      );
      if (result.stdout && result.stdout.trim().length > 0) {
        console.log(`[VISION] Proxy ${proxy.name} succeeded.`);
        return result.stdout;
      }
    } catch (err) {
      console.warn(`[VISION] Proxy ${proxy.name} failed: ${(err.stderr || err.message).substring(0, 150)}`);
    }
  }
  throw new Error('All relay proxies failed. Set TELEGRAM_PROXY_URL to a working relay.');
}

/**
 * Download image from Telegram via relay proxy.
 */
async function downloadTelegramImageAsBase64(fileId) {
  if (!env.TELEGRAM_BOT_TOKEN) throw new Error('TELEGRAM_BOT_TOKEN is missing');

  // Step 1: Get file path
  const getFileUrl = `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/getFile?file_id=${fileId}`;
  console.log('[VISION] Step 1: Getting file info via relay proxy...');

  const raw = (await fetchViaProxy(getFileUrl)).trim();
  console.log('[VISION] Proxy response (first 200 chars):', raw.substring(0, 200));

  if (!raw.startsWith('{')) {
    throw new Error('Proxy returned non-JSON: ' + raw.substring(0, 200));
  }

  const fileData = JSON.parse(raw);
  if (!fileData.ok) throw new Error('Telegram getFile error: ' + JSON.stringify(fileData));

  const filePath = fileData.result.file_path;

  // Step 2: Download image binary and convert to base64 at shell level
  // CRITICAL: We must pipe through `base64` in the shell, NOT convert in Node.js.
  // exec() captures stdout as a UTF-8 string, which corrupts binary image data.
  const fileUrl = `https://api.telegram.org/file/bot${env.TELEGRAM_BOT_TOKEN}/${filePath}`;
  const proxyBase = env.TELEGRAM_PROXY_URL || 'https://api.allorigins.win/raw?url=';
  const proxiedFileUrl = `${proxyBase}${encodeURIComponent(fileUrl)}`;

  console.log('[VISION] Step 2: Downloading image binary via relay proxy...');
  let imageResult;
  try {
    imageResult = await exec(
      `curl -sS --ipv4 --connect-timeout 15 --max-time 60 "${proxiedFileUrl}" | base64 -w 0`,
      { maxBuffer: 20 * 1024 * 1024 }
    );
  } catch (err) {
    console.error('[VISION] Image download STDERR:', err.stderr || 'no stderr');
    throw new Error(`Image download failed: ${err.stderr || err.message}`);
  }

  const base64Data = imageResult.stdout.trim();
  console.log('[VISION] Image downloaded via proxy. Base64 size:', base64Data.length, 'chars');

  if (base64Data.length < 100) {
    throw new Error('Downloaded image too small — proxy may have returned error page');
  }

  const ext = filePath.split('.').pop().toLowerCase();
  let mimeType = 'image/jpeg';
  if (ext === 'png') mimeType = 'image/png';
  if (ext === 'webp') mimeType = 'image/webp';

  return { mimeType, data: base64Data };
}

/**
 * Internal Vision call with a specific Gemini API key, using Axios.
 */
async function callGeminiVision(apiKey, modelName, imageData, caption, retries = 3) {
  const captionContext = caption
    ? `\n[CAPTION/INSTRUKSI DARI TUAN FAQIH]: "${caption}"\nGunakan caption ini sebagai petunjuk utama apa yang Tuan Faqih inginkan dari gambar ini.`
    : '\n[TIDAK ADA CAPTION]: Tuan Faqih tidak memberikan instruksi teks. Analisis gambar dan interpretasikan konteksnya secara cerdas.';

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;

  const payload = {
    systemInstruction: {
      parts: [{ text: VISION_SYSTEM_PROMPT + captionContext }]
    },
    contents: [{
      parts: [
        { text: 'Analisis gambar ini sekarang dan hasilkan teks instruksi lengkap sesuai sistem prompt.' },
        { inlineData: { mimeType: imageData.mimeType, data: imageData.data } }
      ]
    }],
    generationConfig: { temperature: 0.4 }
  };

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const response = await axios.post(url, payload, {
        headers: { 'Content-Type': 'application/json' },
        maxBodyLength: Infinity,
        maxContentLength: Infinity,
        httpsAgent: ipv4Agent
      });

      if (!response.data.candidates || response.data.candidates.length === 0) {
        throw new Error('Gemini API returned no candidates.');
      }

      return response.data.candidates[0].content.parts[0].text;
    } catch (e) {
      const status = e.response?.status;
      // 503 = temporary overload, worth retrying
      if (status === 503 && attempt < retries) {
        const delay = attempt * 2000; // 2s, 4s...
        console.warn(`[VISION] 503 attempt ${attempt}/${retries}, retry in ${delay}ms...`);
        await new Promise(r => setTimeout(r, delay));
        continue;
      }
      throw e; // Throw for 429 quota limits or other errors to trigger next tier
    }
  }
}

/**
 * Tier 7 Fallback: Groq Vision (Llama 4 Scout 17B)
 * Uses OpenAI-compatible API format. Completely independent from Google.
 */
async function callGroqVision(imageData, caption) {
  const captionContext = caption
    ? `\nCaption dari pengguna: "${caption}". Gunakan ini sebagai petunjuk utama.`
    : '\nTidak ada caption. Analisis gambar secara mandiri.';

  const response = await axios.post('https://api.groq.com/openai/v1/chat/completions', {
    model: 'meta-llama/llama-4-scout-17b-16e-instruct', // Supported Groq model in 2026
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: VISION_SYSTEM_PROMPT + captionContext + '\n\nAnalisis gambar ini sekarang.' },
          { type: 'image_url', image_url: { url: `data:${imageData.mimeType};base64,${imageData.data}` } }
        ]
      }
    ],
    temperature: 0.4,
    max_tokens: 2048
  }, {
    headers: {
      'Authorization': `Bearer ${env.GROQ_API_KEY}`,
      'Content-Type': 'application/json'
    },
    httpsAgent: ipv4Agent,
    maxBodyLength: Infinity,
    maxContentLength: Infinity
  });

  if (!response.data.choices || response.data.choices.length === 0) {
    throw new Error('Groq Vision returned no choices.');
  }

  return response.data.choices[0].message.content;
}

/**
 * Process an image with FULL multi-purpose Vision intelligence.
 * 7-tier fallback: 3 Gemini keys × 2 models + Groq Vision
 */
async function processTelegramImage(fileId, caption = '') {
  // Download image ONCE upfront — reuse across all tiers
  console.log('[VISION] Downloading image from Telegram...');
  const imageData = await downloadTelegramImageAsBase64(fileId);
  console.log('[VISION] Image downloaded successfully. Base64 size:', imageData.data.length, 'chars');

  // Try all 3 API keys across multiple models
  const tiers = [
    { key: env.GEMINI_API_KEY_PRIMARY, model: 'gemini-2.5-flash', name: 'Tier1 (2.5 Flash + Primary Key)' },
    { key: env.GEMINI_API_KEY_BACKUP, model: 'gemini-2.5-flash', name: 'Tier2 (2.5 Flash + Backup Key)' },
    { key: env.GEMINI_API_KEY_TERTIARY, model: 'gemini-2.5-flash', name: 'Tier3 (2.5 Flash + Tertiary Key)' },
    { key: env.GEMINI_API_KEY_PRIMARY, model: 'gemini-2.0-flash', name: 'Tier4 (2.0 Flash + Primary Key)' },
    { key: env.GEMINI_API_KEY_BACKUP, model: 'gemini-2.0-flash', name: 'Tier5 (2.0 Flash + Backup Key)' },
    { key: env.GEMINI_API_KEY_TERTIARY, model: 'gemini-2.0-flash', name: 'Tier6 (2.0 Flash + Tertiary Key)' },
    { key: env.GEMINI_API_KEY_PRIMARY, model: 'gemini-1.5-flash', name: 'Tier7 (1.5 Flash + Primary Key)' },
    { key: env.GEMINI_API_KEY_BACKUP, model: 'gemini-1.5-flash', name: 'Tier8 (1.5 Flash + Backup Key)' },
    { key: env.GEMINI_API_KEY_TERTIARY, model: 'gemini-1.5-flash', name: 'Tier9 (1.5 Flash + Tertiary Key)' },
  ].filter(t => t.key);

  for (const tier of tiers) {
    try {
      console.log(`[VISION] Trying ${tier.name}...`);
      const result = await callGeminiVision(tier.key, tier.model, imageData, caption);
      console.log(`[VISION] ${tier.name} SUCCESS. Output length:`, result.length);
      return result;
    } catch (e) {
      const status = e.response?.status || 'unknown';
      const errMsg = e.response?.data?.error?.message || e.message;
      console.warn(`[VISION] ${tier.name} FAILED (${status}): ${errMsg}`);
      await new Promise(r => setTimeout(r, 500));
    }
  }

  // Tier 10: Groq Vision — completely independent provider
  if (env.GROQ_API_KEY) {
    try {
      console.log('[VISION] Trying Tier10 (Groq Vision)...');
      const result = await callGroqVision(imageData, caption);
      console.log('[VISION] Tier10 (Groq Vision) SUCCESS. Output length:', result.length);
      return result;
    } catch (e) {
      const status = e.response?.status || 'unknown';
      const errMsg = e.response?.data?.error?.message || e.message;
      console.warn(`[VISION] Tier10 (Groq Vision) FAILED (${status}): ${errMsg}`);
    }
  }

  throw new Error('All 10 Vision AI tiers failed (9 Gemini + 1 Groq). All APIs are currently overloaded or rate-limited.');
}

module.exports = {
  processTelegramImage
};
