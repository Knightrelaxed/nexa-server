const fs = require('fs');
const path = require('path');
const os = require('os');
const axios = require('axios');
const { downloadProxyToFile, fetchProxyJSON } = require('../utils/telegram_proxy.js');
const env = require('../config/env');
const Groq = require('groq-sdk');

// ============================================================
// MULTI-KEY GROQ POOL FOR WHISPER
// ============================================================
const GROQ_KEYS = [
  env.GROQ_API_KEY_1,
  env.GROQ_API_KEY_2,
  env.GROQ_API_KEY_3,
  env.GROQ_API_KEY_4,
].filter(Boolean);

const GROQ_CLIENTS = GROQ_KEYS.map(key => new Groq({ apiKey: key }));

// Gemini 2.0 Flash keys for Native Audio fallback (Tier 5-6)
const GEMINI_NATIVE_KEYS = [
  env.GEMINI_API_KEY_1,
  env.GEMINI_API_KEY_2,
].filter(Boolean);

// Build proxy URL list for parallel racing
function getProxyUrls(targetUrl) {
  const urls = [];
  if (env.TELEGRAM_PROXY_URL) {
    urls.push(`${env.TELEGRAM_PROXY_URL}${encodeURIComponent(targetUrl)}`);
  } else {
    // Only fallback to AllOrigins if Custom Relay is missing, because AllOrigins is currently extremely slow/dead
    urls.push(`https://api.allorigins.win/raw?url=${encodeURIComponent(targetUrl)}`);
  }
  return urls;
}

// ============================================================
// STEP 1: Download voice note from Telegram via parallel race
// Returns: local temp file path
// ============================================================
async function downloadVoiceToTempFile(fileId) {
  if (!env.TELEGRAM_BOT_TOKEN) throw new Error('TELEGRAM_BOT_TOKEN is missing');

  const getFileUrl = `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/getFile?file_id=${fileId}`;
  console.log('[VOICE] Step 1: Getting file info...');

  // Retry with fast 6s timeout so 3 attempts fit inside Telegram's 25s webhook window
  const proxyUrls = getProxyUrls(getFileUrl);
  const fileData = await fetchProxyJSON(proxyUrls, 6000, 3);
  if (!fileData || !fileData.ok) throw new Error('Telegram getFile error: ' + JSON.stringify(fileData));
  const filePath = fileData.result.file_path;
  console.log('[VOICE] Step 1 complete. File path acquired.');

  const fileUrl = `https://api.telegram.org/file/bot${env.TELEGRAM_BOT_TOKEN}/${filePath}`;
  const downloadProxyUrls = getProxyUrls(fileUrl);

  console.log('[VOICE] Step 2: Downloading audio binary...');
  const result = await downloadProxyToFile(downloadProxyUrls, 'ogg', 20 * 1024 * 1024);
  return result.filePath;
}

// ============================================================
// GROQ WHISPER CALLER — with 503 Smart Retry
// ============================================================
async function callGroqWhisper(groqClient, tmpFilePath, retries = 3) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const transcription = await groqClient.audio.transcriptions.create({
        file: fs.createReadStream(tmpFilePath),
        model: 'whisper-large-v3',
        response_format: 'json',
        language: 'id'
      });
      if (!transcription.text) throw new Error('Whisper returned empty transcription');
      return transcription.text;
    } catch (e) {
      const status = e.status || e.response?.status;
      if (status === 503 && attempt < retries) {
        const delay = attempt * 2000;
        console.warn(`[VOICE] Groq Whisper 503 attempt ${attempt}/${retries}, retry in ${delay}ms...`);
        await new Promise(r => setTimeout(r, delay));
        continue;
      }
      throw e;
    }
  }
}

// ============================================================
// GEMINI NATIVE AUDIO CALLER (Tier 5-6 Fallback)
// Sends raw OGG binary via inlineData — no Whisper needed
// ============================================================
async function callGeminiNativeAudio(apiKey, tmpFilePath, retries = 3) {
  // Read audio file and encode to base64 at Node level
  // Audio files are small enough (usually <500KB) to be safe
  const audioBuffer = fs.readFileSync(tmpFilePath);
  const base64Audio = audioBuffer.toString('base64');

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;
  const payload = {
    contents: [{
      parts: [
        {
          text: 'Tolong transkripsi audio ini secara tepat ke dalam teks. Tulis hanya teks yang diucapkan, tanpa penjelasan tambahan. Jika bahasa Indonesia, pertahankan bahasa Indonesia. Jika ada nama, tulis dengan benar.'
        },
        {
          inlineData: {
            mimeType: 'audio/ogg',
            data: base64Audio
          }
        }
      ]
    }],
    generationConfig: { temperature: 0.1 } // Low temp for transcription accuracy
  };

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const response = await axios.post(url, payload, {
        headers: { 'Content-Type': 'application/json' },
        maxBodyLength: Infinity,
        maxContentLength: Infinity,
        timeout: 45000
      });

      if (!response.data.candidates || response.data.candidates.length === 0) {
        throw new Error('Gemini Native Audio returned no candidates.');
      }
      const text = response.data.candidates[0].content.parts[0].text;
      if (!text || text.trim().length < 1) throw new Error('Gemini returned empty transcription');
      return text.trim();
    } catch (e) {
      const status = e.response?.status;
      if (status === 503 && attempt < retries) {
        const delay = attempt * 2000;
        console.warn(`[VOICE] Gemini Native Audio 503 attempt ${attempt}/${retries}, retry in ${delay}ms...`);
        await new Promise(r => setTimeout(r, delay));
        continue;
      }
      throw e;
    }
  }
}

// ============================================================
// MAIN ENTRY POINT — 6-TIER GOD MODE VOICE FALLBACK
// Tier 1-4: Groq Whisper Large v3 (4 Keys)
// Tier 5-6: Gemini 2.0 Flash Native Audio (2 Keys)
// Fallback Final: Throw descriptive error for Telegram alert
// ============================================================
async function transcribeTelegramVoice(fileId) {
  // Download audio ONCE — reused across all tiers
  let tmpFilePath = null;
  try {
    tmpFilePath = await downloadVoiceToTempFile(fileId);
  } catch (downloadErr) {
    throw new Error(`[VOICE] Audio download failed: ${downloadErr.message}`);
  }

  try {
    // Build tier list dynamically from available keys
    const tiers = [
      // Tier 1-4: Groq Whisper (4 Keys)
      ...GROQ_CLIENTS.map((client, i) => ({
        name: `Tier${i + 1} (Groq Whisper Key ${i + 1})`,
        fn: () => callGroqWhisper(client, tmpFilePath)
      })),
      // Tier 5-6: Gemini 2.0 Flash Native Audio (2 Keys)
      ...GEMINI_NATIVE_KEYS.map((key, i) => ({
        name: `Tier${GROQ_CLIENTS.length + i + 1} (Gemini 2.0 Native Audio Key ${i + 1})`,
        fn: () => callGeminiNativeAudio(key, tmpFilePath)
      }))
    ];

    for (const tier of tiers) {
      try {
        console.log(`[VOICE] Trying ${tier.name}...`);
        const result = await tier.fn();
        console.log(`[VOICE] ${tier.name} SUCCESS. Transcription length:`, result.length);
        return result;
      } catch (e) {
        const status = e.status || e.response?.status || 'NET';
        const apiData = e.response?.data ? JSON.stringify(e.response.data) : '';
        const errMsg = e.message || 'Unknown error';
        console.warn(`[VOICE] ${tier.name} FAILED (${status}): ${errMsg} ${apiData ? '| ' + apiData : ''}`.substring(0, 500));
        // 500ms cooling before trying next tier
        await new Promise(r => setTimeout(r, 500));
      }
    }

    // FALLBACK FINAL — All tiers exhausted
    throw new Error('⚠️ VOICE DOWN TOTAL: Semua 6 Tier Telinga N.E.X.A gagal (4x Groq Whisper + 2x Gemini Native Audio).');

  } finally {
    // Always clean up temp file — even if all tiers fail
    try {
      if (tmpFilePath && fs.existsSync(tmpFilePath)) {
        fs.unlinkSync(tmpFilePath);
        console.log('[VOICE] Temp audio file cleaned up.');
      }
    } catch (cleanupErr) {
      console.warn('[VOICE] Failed to cleanup temp file:', cleanupErr.message);
    }
  }
}

module.exports = { transcribeTelegramVoice };
