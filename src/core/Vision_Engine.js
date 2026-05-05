const env = require('../config/env');
const { NEXA_PERSONALITY } = require('../config/personality');
const axios = require('axios');
const https = require('https');

// Create a dedicated IPv4 agent to bypass Hugging Face network bugs
const ipv4Agent = new https.Agent({
  family: 4,
  keepAlive: true,
  keepAliveMsecs: 10000
});

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
 * Download image from Telegram and convert to Base64 using Axios
 */
async function downloadTelegramImageAsBase64(fileId) {
  if (!env.TELEGRAM_BOT_TOKEN) throw new Error('TELEGRAM_BOT_TOKEN is missing');

  console.log('[VISION] Getting file info from Telegram...');
  const fileRes = await axios.get(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/getFile?file_id=${fileId}`, { httpsAgent: ipv4Agent });
  if (!fileRes.data.ok) throw new Error('Failed to get file info from Telegram');
  
  const filePath = fileRes.data.result.file_path;
  const fileUrl = `https://api.telegram.org/file/bot${env.TELEGRAM_BOT_TOKEN}/${filePath}`;

  console.log('[VISION] Downloading actual file data from Telegram...');
  const response = await axios.get(fileUrl, { 
    responseType: 'arraybuffer',
    httpsAgent: ipv4Agent 
  });
  
  const buffer = Buffer.from(response.data, 'binary');
  const base64Data = buffer.toString('base64');

  const ext = filePath.split('.').pop().toLowerCase();
  let mimeType = 'image/jpeg';
  if (ext === 'png') mimeType = 'image/png';
  if (ext === 'webp') mimeType = 'image/webp';

  return { mimeType, data: base64Data };
}

/**
 * Internal Vision call with a specific Gemini API key, using Axios.
 */
async function callGeminiVision(apiKey, modelName, imageData, caption) {
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
}

/**
 * Process an image with FULL multi-purpose Vision intelligence.
 * Handles: receipts, business cards, event posters, screenshots,
 * handwritten notes, product photos, casual photos, menus, QR codes,
 * tables/reports, and anything else — all routed to correct intent.
 *
 * @param {string} fileId Telegram file_id
 * @param {string} caption Optional caption from user
 * @returns {Promise<string>} Rich textual description ready for AI_Router
 */
async function processTelegramImage(fileId, caption = '') {
  // Tier 1: Primary (2.5 Flash — best multimodal model)
  if (env.GEMINI_API_KEY_PRIMARY) {
    try {
      console.log('[VISION] Processing image with Gemini 2.5 Flash...');
      const imageData = await downloadTelegramImageAsBase64(fileId);
      console.log('[VISION] Image downloaded from Telegram successfully. Size:', imageData.data.length, 'bytes');
      
      console.log('[VISION] Sending payload to Gemini API via Axios...');
      const result = await callGeminiVision(env.GEMINI_API_KEY_PRIMARY, 'gemini-2.5-flash', imageData, caption);
      console.log('[VISION] Primary vision success. Output length:', result.length);
      return result;
    } catch (e) {
      console.warn('[VISION] Primary Gemini 2.5 vision failed:', e.message);
    }
  }

  // Tier 2: Backup (2.0 Flash Lite)
  if (env.GEMINI_API_KEY_BACKUP) {
    try {
      console.log('[VISION] Falling back to Gemini 2.0 Flash Lite for vision...');
      const imageData = await downloadTelegramImageAsBase64(fileId);
      console.log('[VISION] Image downloaded from Telegram successfully. Size:', imageData.data.length, 'bytes');
      
      console.log('[VISION] Sending payload to Gemini API via Axios...');
      const result = await callGeminiVision(env.GEMINI_API_KEY_BACKUP, 'gemini-2.0-flash-lite', imageData, caption);
      console.log('[VISION] Backup vision success. Output length:', result.length);
      return result;
    } catch (e) {
      console.warn('[VISION] Backup Gemini 2.0 vision failed:', e.message);
    }
  }

  throw new Error('All Vision AI tiers failed. Check Gemini API keys.');
}

module.exports = {
  processTelegramImage
};
