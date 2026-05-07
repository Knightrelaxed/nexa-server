require('dotenv').config();

module.exports = {
  PORT: process.env.PORT || 3000,
  TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN,
  TELEGRAM_CHAT_ID: process.env.TELEGRAM_CHAT_ID,
  TELEGRAM_PROXY_URL: process.env.TELEGRAM_PROXY_URL, // Cloudflare Worker relay for Vision image downloads
  SUPABASE_URL: process.env.SUPABASE_URL,
  SUPABASE_KEY: process.env.SUPABASE_KEY,
  GEMINI_API_KEY_1: process.env.GEMINI_API_KEY_1,
  GEMINI_API_KEY_2: process.env.GEMINI_API_KEY_2,
  GEMINI_API_KEY_3: process.env.GEMINI_API_KEY_3,
  GEMINI_API_KEY_4: process.env.GEMINI_API_KEY_4,
  GROQ_API_KEY_1: process.env.GROQ_API_KEY_1,
  GROQ_API_KEY_2: process.env.GROQ_API_KEY_2,
  GROQ_API_KEY_3: process.env.GROQ_API_KEY_3,
  GROQ_API_KEY_4: process.env.GROQ_API_KEY_4,
  CEREBRAS_API_KEY: process.env.CEREBRAS_API_KEY,
  MISTRAL_API_KEY: process.env.MISTRAL_API_KEY,
  HF_TOKEN: process.env.HF_TOKEN,
  WEATHER_API_KEY: process.env.WEATHER_API_KEY,
  NEWS_API_KEY: process.env.NEWS_API_KEY,
  NEXA_GODMODE_SECRET: process.env.NEXA_GODMODE_SECRET,
  NTFY_TOPIC: process.env.NTFY_TOPIC, // Required for God Mode execution via ntfy.sh
  TASKER_WEBHOOK_URL: process.env.TASKER_WEBHOOK_URL, // Optional direct push fallback
  GOOGLE_SERVICE_ACCOUNT_EMAIL: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
  GOOGLE_PRIVATE_KEY: process.env.GOOGLE_PRIVATE_KEY ? process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n').replace(/^["']|["']$/g, '').trim() : '',
  GOOGLE_SHEET_ID: process.env.GOOGLE_SHEET_ID,
  GOOGLE_CALENDAR_ID: process.env.GOOGLE_CALENDAR_ID,
  GOOGLE_DRIVE_FOLDER_ID: process.env.GOOGLE_DRIVE_FOLDER_ID,
  GOOGLE_DOCS_IDEA_ID: process.env.GOOGLE_DOCS_IDEA_ID, // Single master doc for 2nd Brain ideation (append-only)
  OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY, // For Llama 3.1 fallback

  // Gmail OAuth2 Credentials
  GMAIL_CLIENT_ID: process.env.GMAIL_CLIENT_ID,
  GMAIL_CLIENT_SECRET: process.env.GMAIL_CLIENT_SECRET,
  GMAIL_REFRESH_TOKEN: process.env.GMAIL_REFRESH_TOKEN,
};
