const fs = require('fs');
const path = require('path');
const os = require('os');
const axios = require('axios');
const { downloadProxyToFile, downloadRelayB64ToFile, fetchProxyJSON } = require('../utils/telegram_proxy.js');
const { buildProxyChain, postToRelay } = require('../utils/telegram_network');
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

// Gemini 2.5 Flash keys for Native Audio fallback (Tier 5-8)
const GEMINI_NATIVE_KEYS = [
  env.GEMINI_API_KEY_1,
  env.GEMINI_API_KEY_2,
  env.GEMINI_API_KEY_3,
  env.GEMINI_API_KEY_4,
].filter(Boolean);

// ============================================================
// PROXY HELPER
// ============================================================
// Proxy list untuk JSON (getFile API) - Custom Relay cocok untuk ini
function getProxyList(targetUrl) {
  return buildProxyChain(targetUrl);
}

// Proxy list untuk BINARY download (audio/gambar)
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
      console.log(`[VOICE] Getting JSON via: ${proxy.name}...`);
      const parsed = await fetchProxyJSON(proxy.url, timeoutMs, 3, proxy.headers);
      if (parsed.ok !== undefined) {
        console.log(`[VOICE] ${proxy.name} JSON fetch succeeded.`);
        return parsed;
      }
    } catch (err) {
      console.warn(`[VOICE] ${proxy.name} JSON fetch failed: [${err.code || 'NO_CODE'}] ${err.message}`);
    }
  }
  throw new Error('All download paths failed to retrieve valid JSON from Telegram.');
}

// ============================================================
// STEP 1: Download voice note from Telegram via failover
// Returns: local temp file path
// ============================================================
async function downloadVoiceToTempFile(fileId) {
  if (!env.TELEGRAM_BOT_TOKEN) throw new Error('TELEGRAM_BOT_TOKEN is missing');

  const getFileUrl = `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/getFile?file_id=${fileId}`;
  console.log('[VOICE] Step 1: Getting file info...');

  const fileData = await fetchJsonWithFailover(getFileUrl);
  if (!fileData.ok) throw new Error('Telegram getFile error: ' + JSON.stringify(fileData));
  const filePath = fileData.result.file_path;

  // Download audio binary directly to disk via stream
  const fileUrl = `https://api.telegram.org/file/bot${env.TELEGRAM_BOT_TOKEN}/${filePath}`;
  // Gunakan getBinaryProxyList - Custom Relay dilewati karena Cloudflare Worker timeout saat stream file besar
  const proxies = getBinaryProxyList(fileUrl);

  console.log('[VOICE] Step 2: Downloading audio binary...');

  for (const proxy of proxies) {
    try {
      console.log(`[VOICE] Downloading binary via: ${proxy.name}...`);
      
      let result;
      if (proxy.useB64) {
        // Mode B64: Cloudflare Worker encode biner jadi JSON (bypass HF egress firewall)
        result = await downloadRelayB64ToFile(proxy.url, proxy.targetUrl, 'ogg', 20 * 1024 * 1024);
      } else {
        // Mode normal: streaming langsung
        result = await downloadProxyToFile(proxy.url, 'ogg', 20 * 1024 * 1024);
      }
      
      if (result.sizeBytes > 100) {
        console.log(`[VOICE] Audio downloaded via ${proxy.name}. Size: ${result.sizeBytes} bytes`);
        return result.filePath;
      }
    } catch (err) {
      console.warn(`[VOICE] ${proxy.name} binary download failed: [${err.code || 'NO_CODE'}] ${err.message}`);
    }
  }

  throw new Error('Audio download failed across all proxies. The proxy may be timing out or blocked.');
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
  const mimeType = tmpFilePath.endsWith('.wav') ? 'audio/wav' : 'audio/ogg';

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
  const payload = {
    contents: [{
      parts: [
        {
          text: 'Tolong transkripsi audio ini secara tepat ke dalam teks. Tulis hanya teks yang diucapkan, tanpa penjelasan tambahan. Jika bahasa Indonesia, pertahankan bahasa Indonesia. Jika ada nama, tulis dengan benar.'
        },
        {
          inlineData: {
            mimeType: mimeType,
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
// HUGGING FACE WHISPER TURBO CALLER (Safety Net Tier 7)
// ============================================================
async function callHuggingFaceWhisper(tmpFilePath, retries = 2) {
  const token = env.HF_INFERENCE_TOKEN;
  if (!token) throw new Error('No HF_INFERENCE_TOKEN configured');

  const audioBuffer = fs.readFileSync(tmpFilePath);
  const contentType = tmpFilePath.endsWith('.wav') ? 'audio/wav' : 'audio/ogg';
  const url = 'https://router.huggingface.co/hf-inference/models/openai/whisper-large-v3-turbo';

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const response = await axios.post(url, audioBuffer, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': contentType
        },
        maxBodyLength: Infinity,
        maxContentLength: Infinity,
        timeout: 45000
      });

      const text = typeof response.data === 'string' ? response.data : (response.data.text || JSON.stringify(response.data));
      if (!text || text.trim().length < 1) throw new Error('Hugging Face Whisper returned empty transcription');
      return text.trim();
    } catch (e) {
      if (attempt < retries) {
        await new Promise(r => setTimeout(r, 1500));
        continue;
      }
      throw e;
    }
  }
}

// ============================================================
// TIER 0: WORKER TRANSCRIPTION — The Game Changer
// Worker mendownload audio DAN memanggil Groq langsung dari Cloudflare.
// N.E.X.A hanya menerima JSON kecil berisi teks transkripsi.
// TIDAK ADA file biner besar yang perlu diunduh oleh HF container!
// ============================================================
async function callWorkerTranscription(fileId) {
  const relayBase = env.NEXA_VERCEL_RELAY_URL || env.TELEGRAM_PROXY_URL;
  if (!relayBase || !env.TELEGRAM_BOT_TOKEN) {
    throw new Error('Vercel relay URL or Bot Token not configured');
  }

  const getFileUrl = `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/getFile?file_id=${fileId}`;
  const proxies = getProxyList(getFileUrl);

  console.log('[VOICE-W0] Getting file path via relay...');
  let fileData = null;
  for (const proxy of proxies) {
    try {
      fileData = await fetchProxyJSON(proxy.url, 30000, 2, proxy.headers);
      if (fileData?.ok) break;
    } catch (e) {
      console.warn(`[VOICE-W0] getFile via ${proxy.name} failed: ${e.message}`);
    }
  }
  if (!fileData?.ok || !fileData.result?.file_path) {
    throw new Error(`Telegram getFile error: ${JSON.stringify(fileData).substring(0, 100)}`);
  }
  const filePath = fileData.result.file_path;

  if (GROQ_KEYS.length === 0) throw new Error('No Groq API keys configured');
  const groqKey = GROQ_KEYS[Math.floor(Math.random() * GROQ_KEYS.length)];

  console.log('[VOICE-W0] Requesting Vercel relay to transcribe...');
  const result = await postToRelay('/api/transcribe', {
    file_path: filePath,
    bot_token: env.TELEGRAM_BOT_TOKEN,
    groq_key: groqKey,
  });

  if (!result.ok || !result.text) {
    throw new Error(`Relay transcription failed: ${result.error || 'empty result'}`);
  }

  console.log('[VOICE-W0] Relay transcription SUCCESS! Length:', result.text.length);
  return result.text;
}

// ============================================================
// MAIN ENTRY POINT — 8-TIER GOD MODE VOICE FALLBACK
// Tier 0:   Worker Transcription (Cloudflare does everything)
// Tier 1-4: Groq Whisper Large v3 (4 Keys) + local file
// Tier 5-6: Gemini 2.5 Flash Native Audio (2 Keys) + local file
// Tier 7:   Hugging Face Whisper Large v3 Turbo (HF_INFERENCE_TOKEN) + local file
// ============================================================
async function transcribeTelegramVoice(fileId) {
  // ============================================================
  // TIER 0: Coba Worker Transcription DULU (no binary download!)
  // ============================================================
  try {
    const workerResult = await callWorkerTranscription(fileId);
    return workerResult;
  } catch (workerErr) {
    console.warn(`[VOICE-W0] Worker Transcription FAILED: ${workerErr.message}. Falling back to local download...`);
  }

  // ============================================================
  // TIER 1-6: Download audio ONCE, then try all AI providers
  // ============================================================
  let tmpFilePath = null;
  try {
    tmpFilePath = await downloadVoiceToTempFile(fileId);
  } catch (downloadErr) {
    throw new Error(`[VOICE] Audio download failed: ${downloadErr.message}`);
  }

  try {
    // Build tier list dynamically based on priorities:
    // Tier 1-4: Hugging Face Whisper Large v3 Turbo (4 Attempts / Slots)
    // Tier 5-8: Gemini 2.5 Flash Native Audio (Keys 1-4)
    // Tier 9-12: Groq Whisper Large v3 (Keys 1-4 as backup)
    const tiers = [
      // Tier 1-4: Hugging Face Whisper Large v3 Turbo (Ultra-Fast 4 Slots)
      ...Array.from({ length: 4 }).map((_, i) => ({
        name: `Tier${i + 1} (HuggingFace Whisper Large v3 Turbo Slot ${i + 1})`,
        fn: () => callHuggingFaceWhisper(tmpFilePath)
      })),
      // Tier 5-8: Gemini 2.5 Flash Native Audio (Keys 1-4)
      ...GEMINI_NATIVE_KEYS.map((key, i) => ({
        name: `Tier${i + 5} (Gemini 2.5 Flash Native Audio Key ${i + 1})`,
        fn: () => callGeminiNativeAudio(key, tmpFilePath)
      })),
      // Tier 9-12: Groq Whisper (Backup Keys)
      ...GROQ_CLIENTS.map((client, i) => ({
        name: `Tier${i + 5 + GEMINI_NATIVE_KEYS.length} (Groq Whisper Key ${i + 1})`,
        fn: () => callGroqWhisper(client, tmpFilePath)
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
    throw new Error('⚠️ VOICE DOWN TOTAL: Semua 8 Tier Telinga N.E.X.A gagal (Worker + 4x Groq Whisper + 2x Gemini 2.5 Audio + HF Whisper Turbo).');

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

// ============================================================
// PCM TO WAV BUFFER CONVERTER (Helper for Android Mobile Bridge Calls)
// ============================================================
function pcmToWavBuffer(pcmBuffer, sampleRate = 16000, channels = 1, bitDepth = 16) {
  const byteRate = sampleRate * channels * (bitDepth / 8);
  const blockAlign = channels * (bitDepth / 8);
  const dataSize = pcmBuffer.length;
  const buffer = Buffer.alloc(44 + dataSize);

  // RIFF chunk descriptor
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVE', 8);

  // fmt sub-chunk
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16); // Subchunk1Size (16 for PCM)
  buffer.writeUInt16LE(1, 20);  // AudioFormat (1 for PCM)
  buffer.writeUInt16LE(channels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(byteRate, 28);
  buffer.writeUInt16LE(blockAlign, 32);
  buffer.writeUInt16LE(bitDepth, 34);

  // data sub-chunk
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);

  // Copy raw PCM data
  pcmBuffer.copy(buffer, 44);

  return buffer;
}

// ============================================================
// MOBILE BRIDGE CALL VOICE TRANSCRIBER (Raw PCM Base64)
// Transkripsi audio suara dari Nexa Bridge FakeCallActivity
// ============================================================
async function transcribePcmBase64(pcmBase64, opts = {}) {
  if (!pcmBase64 || typeof pcmBase64 !== 'string') {
    throw new Error('Invalid PCM Base64 audio data');
  }

  const pcmBuffer = Buffer.from(pcmBase64, 'base64');
  if (pcmBuffer.length < 500) {
    console.warn('[VOICE-BRIDGE] Audio buffer too short or empty.');
    return '';
  }

  const sampleRate = opts.sampleRate || 16000;
  const channels = opts.channels || 1;
  const bitDepth = opts.bitDepth || 16;

  const wavBuffer = pcmToWavBuffer(pcmBuffer, sampleRate, channels, bitDepth);
  const tmpWavPath = path.join(os.tmpdir(), `bridge_call_${Date.now()}_${Math.random().toString(36).substring(2, 7)}.wav`);
  fs.writeFileSync(tmpWavPath, wavBuffer);

  try {
    // Build tier list dynamically — IDENTICAL to Telegram Voice Note pipeline:
    // Tier 1-4: Hugging Face Whisper Large v3 Turbo (Ultra-Fast 4 Slots)
    // Tier 5-8: Gemini 2.5 Flash Native Audio (Keys 1-4)
    // Tier 9-12: Groq Whisper Large v3 (Keys 1-4)
    const tiers = [
      // Tier 1-4: Hugging Face Whisper Large v3 Turbo (Ultra-Fast 4 Slots)
      ...Array.from({ length: 4 }).map((_, i) => ({
        name: `Tier ${i + 1} (HuggingFace Whisper Large v3 Turbo Slot ${i + 1})`,
        fn: () => callHuggingFaceWhisper(tmpWavPath)
      })),
      // Tier 5-8: Gemini 2.5 Flash Native Audio (Keys 1-4)
      ...GEMINI_NATIVE_KEYS.map((key, i) => ({
        name: `Tier ${i + 5} (Gemini 2.5 Flash Native Audio Key ${i + 1})`,
        fn: () => callGeminiNativeAudio(key, tmpWavPath)
      })),
      // Tier 9-12: Groq Whisper (Backup Keys)
      ...GROQ_CLIENTS.map((client, i) => ({
        name: `Tier ${i + 5 + GEMINI_NATIVE_KEYS.length} (Groq Whisper Key ${i + 1})`,
        fn: () => callGroqWhisper(client, tmpWavPath)
      }))
    ];

    for (const tier of tiers) {
      try {
        console.log(`[VOICE-BRIDGE] Transcribing via ${tier.name}...`);
        const result = await tier.fn();
        if (result && result.trim().length > 0) {
          console.log(`[VOICE-BRIDGE] ✅ ${tier.name} SUCCESS: "${result.trim()}"`);
          return result.trim();
        }
      } catch (err) {
        console.warn(`[VOICE-BRIDGE] ⚠️ ${tier.name} failed: ${err.message}`);
        await new Promise(r => setTimeout(r, 300));
      }
    }

    throw new Error('All voice transcription tiers failed for bridge call audio');
  } finally {
    try {
      if (fs.existsSync(tmpWavPath)) {
        fs.unlinkSync(tmpWavPath);
      }
    } catch (_) {}
  }
}

module.exports = {
  transcribeTelegramVoice,
  transcribePcmBase64,
  pcmToWavBuffer
};

