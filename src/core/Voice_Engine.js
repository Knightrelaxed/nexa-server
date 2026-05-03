const axios = require('axios');
const fs = require('fs');
const path = require('path');
const os = require('os');
const env = require('../config/env');
const Groq = require('groq-sdk');

const groq = env.GROQ_API_KEY ? new Groq({ apiKey: env.GROQ_API_KEY }) : null;

/**
 * Download Voice Note from Telegram and Transcribe using Groq Whisper Large v3
 * @param {string} fileId 
 * @returns {string} Transcribed text
 */
async function transcribeTelegramVoice(fileId) {
  if (!groq) throw new Error("Groq API Key missing");
  if (!env.TELEGRAM_BOT_TOKEN) throw new Error("Telegram Bot Token missing");

  // 1. Get file path from Telegram
  const getFileUrl = `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/getFile?file_id=${fileId}`;
  const fileInfo = await axios.get(getFileUrl);
  
  if (!fileInfo.data || !fileInfo.data.result) {
    throw new Error("Failed to get file info from Telegram");
  }
  
  const filePath = fileInfo.data.result.file_path;

  // 2. Download the audio file (Telegram usually sends .oga / OGG)
  const downloadUrl = `https://api.telegram.org/file/bot${env.TELEGRAM_BOT_TOKEN}/${filePath}`;
  const audioResponse = await axios.get(downloadUrl, { responseType: 'arraybuffer' });
  
  // 3. Save temporarily
  const tmpFilePath = path.join(os.tmpdir(), `nexa_voice_${Date.now()}.ogg`);
  fs.writeFileSync(tmpFilePath, audioResponse.data);

  try {
    // 4. Transcribe with Groq Whisper
    const transcription = await groq.audio.transcriptions.create({
      file: fs.createReadStream(tmpFilePath),
      model: "whisper-large-v3",
      response_format: "json",
      language: "id" // Default to Indonesian
    });
    
    // Cleanup
    fs.unlinkSync(tmpFilePath);
    
    return transcription.text;
  } catch (error) {
    if (fs.existsSync(tmpFilePath)) fs.unlinkSync(tmpFilePath);
    throw error;
  }
}

module.exports = { transcribeTelegramVoice };
