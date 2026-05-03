const { GoogleGenerativeAI } = require('@google/generative-ai');
const axios = require('axios');
const env = require('../config/env');

// Initialize Gemini Client specifically for Vision (Primary only for now to save complexity)
const genAI = env.GEMINI_API_KEY_PRIMARY ? new GoogleGenerativeAI(env.GEMINI_API_KEY_PRIMARY) : null;

/**
 * Download image from Telegram and convert to Base64
 * @param {string} fileId 
 * @returns {Promise<{mimeType: string, data: string}>}
 */
async function downloadTelegramImageAsBase64(fileId) {
  if (!env.TELEGRAM_BOT_TOKEN) throw new Error('TELEGRAM_BOT_TOKEN is missing');

  // 1. Get file path from Telegram
  const fileRes = await axios.get(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/getFile?file_id=${fileId}`);
  if (!fileRes.data.ok) throw new Error('Failed to get file info from Telegram');
  
  const filePath = fileRes.data.result.file_path;
  const fileUrl = `https://api.telegram.org/file/bot${env.TELEGRAM_BOT_TOKEN}/${filePath}`;

  // 2. Download file as arraybuffer
  const response = await axios.get(fileUrl, { responseType: 'arraybuffer' });
  const buffer = Buffer.from(response.data, 'binary');
  const base64Data = buffer.toString('base64');

  // Determine mime type from extension
  const ext = filePath.split('.').pop().toLowerCase();
  let mimeType = 'image/jpeg';
  if (ext === 'png') mimeType = 'image/png';
  if (ext === 'webp') mimeType = 'image/webp';

  return { mimeType, data: base64Data };
}

/**
 * Process an image using Gemini Vision to extract text/data/intent
 * @param {string} fileId Telegram file_id
 * @param {string} caption Optional caption sent with the image
 * @returns {Promise<string>} Detailed textual description or extracted data
 */
async function processTelegramImage(fileId, caption = '') {
  if (!genAI) {
    throw new Error('Gemini API Key is not configured. Vision capabilities are disabled.');
  }

  const { mimeType, data } = await downloadTelegramImageAsBase64(fileId);

  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' }); // Best multimodal intelligence

  const prompt = `Anda adalah N.E.X.A, asisten pintar. 
Tuan Faqih mengirimkan sebuah gambar.
${caption ? `Beliau juga memberikan instruksi/caption berikut: "${caption}"` : 'Beliau tidak memberikan teks tambahan.'}

Tugas Anda:
1. Analisis gambar ini secara detail.
2. Jika ini nota/struk/faktur, ekstrak semua data (nama toko, total, tanggal, daftar barang) menjadi teks terstruktur.
3. Jika ini gambar lain, deskripsikan isi gambar tersebut dengan sangat jelas.
4. Gabungkan instruksi dari Tuan Faqih dengan hasil analisis Anda untuk membentuk SATU pesan instruksi teks lengkap yang akan diproses oleh sistem N.E.X.A selanjutnya.

Contoh output yang diharapkan: "Tuan Faqih mengirimkan nota belanja dari Toko ABC sebesar Rp 50.000 untuk pembelian kopi dan meminta untuk dicatat. Tolong proses ini."`;

  const imagePart = {
    inlineData: {
      data: data,
      mimeType: mimeType
    }
  };

  const result = await model.generateContent([prompt, imagePart]);
  return result.response.text();
}

module.exports = {
  processTelegramImage
};
