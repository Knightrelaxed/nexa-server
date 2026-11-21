const fs = require('fs');
const path = require('path');
const os = require('os');
const axios = require('axios');
const { downloadProxyToFile, downloadRelayB64ToFile, fetchProxyJSON } = require('../utils/telegram_proxy.js');
const { buildProxyChain, postToRelay } = require('../utils/telegram_network');
const env = require('../config/env');
const Groq = require('groq-sdk');

// ============================================================
// MULTI-KEY GROQ POOL FOR WHISPER (V-01: bounded timeout, no hidden SDK retries)
// ============================================================
const GROQ_KEYS = [
  env.GROQ_API_KEY_1,
  env.GROQ_API_KEY_2,
  env.GROQ_API_KEY_3,
  env.GROQ_API_KEY_4,
].filter(Boolean);

const GROQ_CLIENTS = GROQ_KEYS.map(key => new Groq({ apiKey: key, timeout: 20000, maxRetries: 0 }));

const NON_RETRYABLE_STATUSES = new Set([400, 401, 402, 403, 404, 413, 422]);
const DEFAULT_MOBILE_STT_DEADLINE_MS = 45000;

function isAbortError(err) {
  return Boolean(err && (err.name === 'AbortError' || err.code === 'ERR_CANCELED' || err.message === 'STT_ABORTED'));
}

function throwIfAborted(signal) {
  if (signal && signal.aborted) {
    const err = new Error('STT_ABORTED');
    err.name = 'AbortError';
    throw err;
  }
}

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
function resolveAudioMimeType(filePath, explicitMime) {
  if (explicitMime && typeof explicitMime === 'string') {
    const clean = explicitMime.split(';')[0].trim().toLowerCase();
    if (clean === 'audio/ogg' || clean === 'audio/wav' || clean === 'audio/mp4' || clean === 'audio/m4a' || clean === 'audio/webm') {
      return clean === 'audio/m4a' ? 'audio/mp4' : clean;
    }
  }
  const lower = String(filePath || '').toLowerCase();
  if (lower.endsWith('.wav')) return 'audio/wav';
  if (lower.endsWith('.m4a') || lower.endsWith('.mp4')) return 'audio/mp4';
  if (lower.endsWith('.webm')) return 'audio/webm';
  return 'audio/ogg';
}

function resolveAudioExt(explicitExt, explicitMime) {
  const ext = String(explicitExt || '').replace(/^\./, '').trim().toLowerCase();
  if (ext === 'ogg' || ext === 'wav' || ext === 'm4a' || ext === 'webm') return ext;
  const mime = resolveAudioMimeType('', explicitMime);
  if (mime === 'audio/wav') return 'wav';
  if (mime === 'audio/mp4') return 'm4a';
  if (mime === 'audio/webm') return 'webm';
  return 'ogg';
}

async function callGeminiNativeAudio(apiKey, tmpFilePath, retries = 3, explicitMime = null) {
  // Read audio file and encode to base64 at Node level
  const audioBuffer = fs.readFileSync(tmpFilePath);
  const base64Audio = audioBuffer.toString('base64');
  const mimeType = resolveAudioMimeType(tmpFilePath, explicitMime);

  const url = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';
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
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey
        },
        maxBodyLength: Infinity,
        maxContentLength: Infinity,
        timeout: 45000
      });

      const text = response.data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!text || text.trim().length < 1) throw new Error('Gemini returned empty transcription');
      return text.trim();
    } catch (e) {
      const status = e.response?.status;
      if (NON_RETRYABLE_STATUSES.has(status) || isAbortError(e)) throw e;
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
async function callHuggingFaceWhisper(tmpFilePath, retries = 2, explicitMime = null) {
  const token = env.HF_INFERENCE_TOKEN;
  if (!token) throw new Error('No HF_INFERENCE_TOKEN configured');

  const audioBuffer = fs.readFileSync(tmpFilePath);
  const contentType = resolveAudioMimeType(tmpFilePath, explicitMime);
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
        timeout: 20000
      });

      const text = typeof response.data === 'string'
        ? response.data
        : (typeof response.data?.text === 'string' ? response.data.text : '');
      if (!text || text.trim().length < 1) {
        const errDetail = response.data && typeof response.data === 'object' && response.data.error
          ? `: ${response.data.error}`
          : '';
        throw new Error(`Hugging Face Whisper returned empty or invalid transcription${errDetail}`);
      }
      return text.trim();
    } catch (e) {
      const status = e.response?.status;
      if (NON_RETRYABLE_STATUSES.has(status) || isAbortError(e)) throw e;
      if (attempt < retries) {
        await new Promise(r => setTimeout(r, 1500));
        continue;
      }
      throw e;
    }
  }
}

// ============================================================
// IN-MEMORY BUFFER STT CALLERS (V-01 / V-02 / V-03)
// Zero temp files, zero blocking fs.readFileSync, AbortSignal-aware
// ============================================================
async function callGroqWhisperBuffer(groqClient, audioBuffer, ext, mimeType, signal) {
  throwIfAborted(signal);
  const file = await Groq.toFile(audioBuffer, `mobile_voice.${ext}`, { type: mimeType });
  const transcription = await groqClient.audio.transcriptions.create({
    file,
    model: 'whisper-large-v3',
    response_format: 'json',
    language: 'id'
  }, signal ? { signal } : undefined);
  if (!transcription || !transcription.text || !transcription.text.trim()) {
    throw new Error('Groq Whisper returned empty transcription');
  }
  return transcription.text.trim();
}

async function callGeminiNativeAudioBuffer(apiKey, base64Audio, mimeType, signal) {
  throwIfAborted(signal);
  const url = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';
  const payload = {
    contents: [{
      parts: [
        {
          text: 'Tolong transkripsi audio ini secara tepat ke dalam teks. Tulis hanya teks yang diucapkan, tanpa penjelasan tambahan. Jika bahasa Indonesia, pertahankan bahasa Indonesia. Jika ada nama, tulis dengan benar.'
        },
        {
          inlineData: {
            mimeType,
            data: base64Audio
          }
        }
      ]
    }],
    generationConfig: { temperature: 0.1 }
  };

  const response = await axios.post(url, payload, {
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': apiKey
    },
    maxBodyLength: Infinity,
    maxContentLength: Infinity,
    timeout: 20000,
    signal
  });

  const text = response.data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text || text.trim().length < 1) {
    throw new Error('Gemini Native Audio returned empty transcription');
  }
  return text.trim();
}

async function callHuggingFaceWhisperBuffer(audioBuffer, mimeType, signal) {
  throwIfAborted(signal);
  const token = env.HF_INFERENCE_TOKEN;
  if (!token) throw new Error('No HF_INFERENCE_TOKEN configured');

  const url = 'https://router.huggingface.co/hf-inference/models/openai/whisper-large-v3-turbo';
  const response = await axios.post(url, audioBuffer, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': mimeType
    },
    maxBodyLength: Infinity,
    maxContentLength: Infinity,
    timeout: 20000,
    signal
  });

  const text = typeof response.data === 'string'
    ? response.data
    : (typeof response.data?.text === 'string' ? response.data.text : '');
  if (!text || text.trim().length < 1) {
    const errDetail = response.data && typeof response.data === 'object' && response.data.error
      ? `: ${response.data.error}`
      : '';
    throw new Error(`Hugging Face Whisper returned empty transcription${errDetail}`);
  }
  return text.trim();
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
    // Build tier list dynamically: Groq Whisper -> Gemini 2.5 Audio -> 1x HF Whisper
    const tiers = [
      ...GROQ_CLIENTS.map((client, i) => ({
        name: `Groq Whisper Key ${i + 1}`,
        fn: () => callGroqWhisper(client, tmpFilePath)
      })),
      ...GEMINI_NATIVE_KEYS.map((key, i) => ({
        name: `Gemini 2.5 Flash Native Audio Key ${i + 1}`,
        fn: () => callGeminiNativeAudio(key, tmpFilePath)
      })),
      ...(env.HF_INFERENCE_TOKEN ? [{
        name: 'HuggingFace Whisper Large v3 Turbo',
        fn: () => callHuggingFaceWhisper(tmpFilePath)
      }] : [])
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
// SHARED IN-MEMORY STT PIPELINE (Groq -> Gemini -> 1x HF)
// Zero temp files, AbortSignal-aware, bounded deadline, fail-fast on 4xx
// ============================================================
async function runInMemorySttTiers(audioBuffer, { ext, mimeType, tag, signal, deadlineMs = DEFAULT_MOBILE_STT_DEADLINE_MS }) {
  throwIfAborted(signal);
  const controller = new AbortController();
  let timedOut = false;

  const onExternalAbort = () => controller.abort(signal.reason || new Error('Aborted'));
  if (signal) {
    if (signal.aborted) {
      onExternalAbort();
    } else {
      signal.addEventListener('abort', onExternalAbort, { once: true });
    }
  }

  const effectiveDeadline = Number.isFinite(deadlineMs) && deadlineMs > 0
    ? deadlineMs
    : DEFAULT_MOBILE_STT_DEADLINE_MS;
  const deadlineTimer = setTimeout(() => {
    timedOut = true;
    controller.abort(new Error(`STT deadline exceeded (${effectiveDeadline}ms)`));
  }, effectiveDeadline);
  if (typeof deadlineTimer.unref === 'function') deadlineTimer.unref();

  try {
    let cachedBase64 = null;
    const getBase64 = () => {
      if (cachedBase64 === null) {
        cachedBase64 = audioBuffer.toString('base64');
      }
      return cachedBase64;
    };

    const tiers = [
      ...GROQ_CLIENTS.map((client, i) => ({
        name: `Groq Whisper Key ${i + 1}`,
        fn: () => callGroqWhisperBuffer(client, audioBuffer, ext, mimeType, controller.signal)
      })),
      ...GEMINI_NATIVE_KEYS.map((key, i) => ({
        name: `Gemini 2.5 Flash Native Audio Key ${i + 1}`,
        fn: () => callGeminiNativeAudioBuffer(key, getBase64(), mimeType, controller.signal)
      })),
      ...(env.HF_INFERENCE_TOKEN ? [{
        name: 'HuggingFace Whisper Large v3 Turbo',
        fn: () => callHuggingFaceWhisperBuffer(audioBuffer, mimeType, controller.signal)
      }] : [])
    ];

    if (tiers.length === 0) {
      throw new Error('No STT provider keys configured');
    }

    for (const tier of tiers) {
      throwIfAborted(controller.signal);
      try {
        console.log(`[${tag}] Transcribing (${mimeType}, ${audioBuffer.length}B) via ${tier.name}...`);
        const result = await tier.fn();
        if (result && result.trim().length > 0) {
          console.log(`[${tag}] ${tier.name} SUCCESS (len=${result.trim().length}).`);
          return result.trim();
        }
      } catch (err) {
        if (controller.signal.aborted || isAbortError(err)) {
          if (timedOut) {
            throw new Error(`STT deadline exceeded (${effectiveDeadline}ms)`);
          }
          const abortErr = new Error('Voice transcription aborted');
          abortErr.name = 'AbortError';
          abortErr.code = 'ABORT_ERR';
          throw abortErr;
        }
        const status = err.status || err.response?.status || 'NET';
        console.warn(`[${tag}] ${tier.name} failed (${status}): ${err.message}`);
      }
    }

    throw new Error(`All voice transcription tiers failed (${tag})`);
  } finally {
    clearTimeout(deadlineTimer);
    if (signal) {
      signal.removeEventListener('abort', onExternalAbort);
    }
  }
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
  return runInMemorySttTiers(wavBuffer, {
    ext: 'wav',
    mimeType: 'audio/wav',
    tag: 'VOICE-BRIDGE',
    signal: opts.signal,
    deadlineMs: opts.deadlineMs
  });
}

// ============================================================
// GENERIC AUDIO BUFFER TRANSCRIBER (Mobile Voice Notes: OGG/Opus, M4A, WAV)
// In-memory pipeline: Groq Whisper -> Gemini 2.5 Audio -> 1x HF Whisper
// ============================================================
async function transcribeAudioBuffer(audioBuffer, opts = {}) {
  if (!Buffer.isBuffer(audioBuffer)) {
    throw new Error('Invalid audio buffer');
  }
  if (audioBuffer.length < 128) {
    console.warn('[VOICE-MOBILE] Audio buffer too short or empty.');
    return '';
  }

  const ext = resolveAudioExt(opts.ext, opts.mimeType);
  const mimeType = resolveAudioMimeType('.' + ext, opts.mimeType);
  return runInMemorySttTiers(audioBuffer, {
    ext,
    mimeType,
    tag: 'VOICE-MOBILE',
    signal: opts.signal,
    deadlineMs: opts.deadlineMs
  });
}

module.exports = {
  transcribeTelegramVoice,
  transcribePcmBase64,
  transcribeAudioBuffer,
  pcmToWavBuffer
};

