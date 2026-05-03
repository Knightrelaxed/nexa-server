require('dotenv').config();

module.exports = {
  PORT: process.env.PORT || 3000,
  TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN,
  TELEGRAM_CHAT_ID: process.env.TELEGRAM_CHAT_ID,
  SUPABASE_URL: process.env.SUPABASE_URL,
  SUPABASE_KEY: process.env.SUPABASE_KEY,
  GEMINI_API_KEY_PRIMARY: process.env.GEMINI_API_KEY_PRIMARY,
  GEMINI_API_KEY_BACKUP: process.env.GEMINI_API_KEY_BACKUP,
  GROQ_API_KEY: process.env.GROQ_API_KEY,
  WEATHER_API_KEY: process.env.WEATHER_API_KEY,
  NEWS_API_KEY: process.env.NEWS_API_KEY,
  NEXA_GODMODE_SECRET: process.env.NEXA_GODMODE_SECRET,
  NTFY_TOPIC: process.env.NTFY_TOPIC, // Required for God Mode execution via ntfy.sh
  TASKER_WEBHOOK_URL: process.env.TASKER_WEBHOOK_URL, // Optional direct push fallback
  GOOGLE_SERVICE_ACCOUNT_EMAIL: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
  GOOGLE_PRIVATE_KEY: process.env.GOOGLE_PRIVATE_KEY ? process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n') : '',
  GOOGLE_SHEET_ID: process.env.GOOGLE_SHEET_ID,
  GOOGLE_CALENDAR_ID: process.env.GOOGLE_CALENDAR_ID,
  GOOGLE_DRIVE_FOLDER_ID: process.env.GOOGLE_DRIVE_FOLDER_ID,
  OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY // For Llama 3.1 fallback
};
