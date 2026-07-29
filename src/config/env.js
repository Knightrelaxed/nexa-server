require('dotenv').config();

module.exports = {
  PORT: process.env.PORT || 3000,
  TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN,
  TELEGRAM_CHAT_ID: process.env.TELEGRAM_CHAT_ID,
  TELEGRAM_PROXY_URL: process.env.TELEGRAM_PROXY_URL, // Legacy relay (workers.dev is BLOCKED on HF — use NEXA_VERCEL_RELAY_URL)
  NEXA_VERCEL_RELAY_URL: process.env.NEXA_VERCEL_RELAY_URL, // Vercel relay base, e.g. https://nexa-relay.vercel.app
  NEXA_RELAY_SECRET: process.env.NEXA_RELAY_SECRET, // Shared secret for Vercel relay auth
  TELEGRAM_WEBHOOK_SECRET_TOKEN: process.env.TELEGRAM_WEBHOOK_SECRET_TOKEN, // Optional hardening: verify X-Telegram-Bot-Api-Secret-Token header
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
  CEREBRAS_API_KEY_1: process.env.CEREBRAS_API_KEY_1,
  CEREBRAS_API_KEY_2: process.env.CEREBRAS_API_KEY_2,
  CEREBRAS_API_KEY_3: process.env.CEREBRAS_API_KEY_3,
  CEREBRAS_API_KEY_4: process.env.CEREBRAS_API_KEY_4,
  MISTRAL_API_KEY: process.env.MISTRAL_API_KEY,
  HF_TOKEN: process.env.HF_TOKEN, // Khusus untuk repo write/sync GitHub Actions
  HF_INFERENCE_TOKEN: process.env.HF_INFERENCE_TOKEN, // Khusus untuk AI Inference Providers
  PUTER_AUTH_TOKEN: process.env.PUTER_AUTH_TOKEN, // Auth token untuk Puter AI API
  WEATHER_API_KEY: process.env.WEATHER_API_KEY,
  NEWS_API_KEY: process.env.NEWS_API_KEY,
  NEXA_GODMODE_SECRET: process.env.NEXA_GODMODE_SECRET,
  NEXA_CLI_SECRET: process.env.NEXA_CLI_SECRET || process.env.NEXA_GODMODE_SECRET, // Fallback ke godmode jika belum diset di .env
  NTFY_TOPIC: process.env.NTFY_TOPIC, // Required for God Mode execution via ntfy.sh
  TASKER_WEBHOOK_URL: process.env.TASKER_WEBHOOK_URL, // Optional direct push fallback
  GOOGLE_SERVICE_ACCOUNT_EMAIL: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
  GOOGLE_PRIVATE_KEY: process.env.GOOGLE_PRIVATE_KEY ? process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n').replace(/^["']|["']$/g, '').trim() : '',
  GOOGLE_SHEET_ID: process.env.GOOGLE_SHEET_ID,
  GOOGLE_CALENDAR_ID: process.env.GOOGLE_CALENDAR_ID,
  GOOGLE_DRIVE_FOLDER_ID: process.env.GOOGLE_DRIVE_FOLDER_ID,
  GOOGLE_VAULT_FOLDER_ID: process.env.GOOGLE_VAULT_FOLDER_ID || process.env.GOOGLE_DRIVE_FOLDER_ID, // Optional separate folder for vault uploads
  GOOGLE_DOCS_IDEA_ID: process.env.GOOGLE_DOCS_IDEA_ID, // Single master doc for 2nd Brain ideation (append-only)
  OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY, // For Llama 3.1 fallback

  // Gmail OAuth2 Credentials
  GMAIL_CLIENT_ID: process.env.GMAIL_CLIENT_ID,
  GMAIL_CLIENT_SECRET: process.env.GMAIL_CLIENT_SECRET,
  GMAIL_REFRESH_TOKEN: process.env.GMAIL_REFRESH_TOKEN,
  GOOGLE_DRIVE_REFRESH_TOKEN: process.env.GOOGLE_DRIVE_REFRESH_TOKEN, // Optional dedicated OAuth refresh token with Drive scopes

  // Google Tasks OAuth2 (uses same Client ID/Secret as Gmail)
  TASKS_REFRESH_TOKEN: process.env.TASKS_REFRESH_TOKEN,

  // Serper.dev Web Search API
  SERPER_API_KEY: process.env.SERPER_API_KEY,

  // Notion API
  NOTION_API_KEY: process.env.NOTION_API_KEY,
  NOTION_TASKS_DB_ID: process.env.NOTION_TASKS_DB_ID,

  // WhatsApp Pintu 2 Security & Owner JID
  WHATSAPP_OWNER_JID: process.env.WHATSAPP_OWNER_JID,
  WHATSAPP_OWNER_NUMBER: process.env.WHATSAPP_OWNER_NUMBER,
  // Deno Deploy WSS Relay URL to bypass Meta's IP block
  NEXA_WA_RELAY_URL: process.env.NEXA_WA_RELAY_URL || 'wss://peppy-horse-9232.knightrelaxed.deno.net',
};
