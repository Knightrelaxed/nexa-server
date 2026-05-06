const fs = require('fs');
const path = require('path');
const os = require('os');
const util = require('util');
const exec = util.promisify(require('child_process').exec);
const env = require('../config/env');
const Groq = require('groq-sdk');

const groq = env.GROQ_API_KEY ? new Groq({ apiKey: env.GROQ_API_KEY }) : null;

/**
 * Download Voice Note from Telegram via proxy and Transcribe using Groq Whisper Large v3
 * Uses same Cloudflare Worker relay as Vision Engine to bypass HuggingFace firewall.
 * @param {string} fileId
 * @returns {string} Transcribed text
 */
async function transcribeTelegramVoice(fileId) {
  if (!groq) throw new Error('Groq API Key missing');
  if (!env.TELEGRAM_BOT_TOKEN) throw new Error('Telegram Bot Token missing');

  const proxyBase = env.TELEGRAM_PROXY_URL;

  // ── Step 1: Get file path from Telegram (via proxy) ──────────────────────
  const getFileUrl = `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/getFile?file_id=${fileId}`;
  const proxiedGetFileUrl = proxyBase ? `${proxyBase}${encodeURIComponent(getFileUrl)}` : getFileUrl;

  console.log('[VOICE] Getting file info from Telegram...');
  let fileInfoRaw;
  try {
    const result = await exec(
      `curl -sS --ipv4 --connect-timeout 15 --max-time 30 "${proxiedGetFileUrl}"`,
      { maxBuffer: 1 * 1024 * 1024 }
    );
    fileInfoRaw = result.stdout.trim();
  } catch (e) {
    throw new Error(`Voice getFile failed: ${e.stderr || e.message}`);
  }

  if (!fileInfoRaw.startsWith('{')) {
    throw new Error(`Telegram getFile non-JSON: ${fileInfoRaw.substring(0, 200)}`);
  }

  const fileInfo = JSON.parse(fileInfoRaw);
  if (!fileInfo.ok || !fileInfo.result) {
    throw new Error(`Telegram getFile error: ${JSON.stringify(fileInfo)}`);
  }

  const filePath = fileInfo.result.file_path;
  console.log('[VOICE] File path received:', filePath);

  // ── Step 2: Download audio binary via proxy → save to temp file ──────────
  const downloadUrl = `https://api.telegram.org/file/bot${env.TELEGRAM_BOT_TOKEN}/${filePath}`;
  const proxiedDownloadUrl = proxyBase ? `${proxyBase}${encodeURIComponent(downloadUrl)}` : downloadUrl;

  const tmpFilePath = path.join(os.tmpdir(), `nexa_voice_${Date.now()}.ogg`);
  console.log('[VOICE] Downloading audio binary...');

  try {
    // Write binary directly to temp file with curl -o (avoids stdout encoding issues)
    await exec(
      `curl -sS --ipv4 --connect-timeout 15 --max-time 60 -o "${tmpFilePath}" "${proxiedDownloadUrl}"`,
      { maxBuffer: 10 * 1024 * 1024 }
    );

    const fileSize = fs.existsSync(tmpFilePath) ? fs.statSync(tmpFilePath).size : 0;
    if (fileSize < 100) throw new Error(`Downloaded audio too small (${fileSize} bytes) — possible proxy error`);
    console.log(`[VOICE] Audio downloaded. Size: ${fileSize} bytes`);

    // ── Step 3: Transcribe with Groq Whisper ─────────────────────────────
    console.log('[VOICE] Sending to Groq Whisper Large v3...');
    const transcription = await groq.audio.transcriptions.create({
      file: fs.createReadStream(tmpFilePath),
      model: 'whisper-large-v3',
      response_format: 'json',
      language: 'id'
    });

    console.log('[VOICE] Transcription complete. Length:', transcription.text?.length);
    return transcription.text;

  } finally {
    // Always clean up temp file
    try {
      if (fs.existsSync(tmpFilePath)) fs.unlinkSync(tmpFilePath);
    } catch (cleanupErr) {
      console.warn('[VOICE] Failed to cleanup temp file:', cleanupErr.message);
    }
  }
}

module.exports = { transcribeTelegramVoice };
