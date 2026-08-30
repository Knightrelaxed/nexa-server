require('dotenv').config();

module.exports = {
  // ============================================================
  // 1. SERVER & SYSTEM PORT
  // ============================================================
  PORT: process.env.PORT || 3000,

  // ============================================================
  // 2. TELEGRAM BOT & RELAY WEBHOOKS
  // ============================================================
  TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN,
  TELEGRAM_CHAT_ID: process.env.TELEGRAM_CHAT_ID,
  TELEGRAM_PROXY_URL: process.env.TELEGRAM_PROXY_URL, // Legacy Cloudflare Worker proxy
  NEXA_VERCEL_RELAY_URL: process.env.NEXA_VERCEL_RELAY_URL, // Primary Vercel Relay (e.g. https://nexa-relay.vercel.app)
  NEXA_RELAY_SECRET: process.env.NEXA_RELAY_SECRET, // Shared secret for Vercel relay authentication
  TELEGRAM_WEBHOOK_SECRET_TOKEN: process.env.TELEGRAM_WEBHOOK_SECRET_TOKEN, // Optional: X-Telegram-Bot-Api-Secret-Token verification

  // ============================================================
  // 3. DATABASE & PERSISTENT MEMORY
  // ============================================================
  SUPABASE_URL: process.env.SUPABASE_URL,
  SUPABASE_KEY: process.env.SUPABASE_KEY,

  // ============================================================
  // 4. AI BACKBONE ENGINE (MULTI-ACCOUNT PROVIDERS & FALLBACKS)
  // ============================================================
  // Google Gemini Accounts (1 to 4)
  GEMINI_API_KEY_1: process.env.GEMINI_API_KEY_1,
  GEMINI_API_KEY_2: process.env.GEMINI_API_KEY_2,
  GEMINI_API_KEY_3: process.env.GEMINI_API_KEY_3,
  GEMINI_API_KEY_4: process.env.GEMINI_API_KEY_4,
  GEMINI_LIVE_VOICE: process.env.GEMINI_LIVE_VOICE || 'Pegasus',

  // Groq Llama Accounts (1 to 4)
  GROQ_API_KEY_1: process.env.GROQ_API_KEY_1,
  GROQ_API_KEY_2: process.env.GROQ_API_KEY_2,
  GROQ_API_KEY_3: process.env.GROQ_API_KEY_3,
  GROQ_API_KEY_4: process.env.GROQ_API_KEY_4,

  // Cerebras Llama-3.1 Ultra-Fast Keys (1 to 4)
  CEREBRAS_API_KEY_1: process.env.CEREBRAS_API_KEY_1,
  CEREBRAS_API_KEY_2: process.env.CEREBRAS_API_KEY_2,
  CEREBRAS_API_KEY_3: process.env.CEREBRAS_API_KEY_3,
  CEREBRAS_API_KEY_4: process.env.CEREBRAS_API_KEY_4,

  // Secondary LLM Providers
  MISTRAL_API_KEY: process.env.MISTRAL_API_KEY,
  OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY,
  HF_TOKEN: process.env.HF_TOKEN, // GitHub Actions & Repo sync token
  HF_INFERENCE_TOKEN: process.env.HF_INFERENCE_TOKEN, // Hugging Face AI Inference token
  PUTER_AUTH_TOKEN: process.env.PUTER_AUTH_TOKEN, // Puter AI Auth token
  CLOUDFLARE_ACCOUNT_ID: process.env.CLOUDFLARE_ACCOUNT_ID,
  CLOUDFLARE_API_TOKEN: process.env.CLOUDFLARE_API_TOKEN,
  NVIDIA_API_KEY: process.env.NVIDIA_API_KEY,

  // ============================================================
  // 5. GOOGLE WORKSPACE & OAUTH2 CREDENTIALS
  // ============================================================
  // Service Account Credentials
  GOOGLE_SERVICE_ACCOUNT_EMAIL: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
  GOOGLE_PRIVATE_KEY: process.env.GOOGLE_PRIVATE_KEY
    ? process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n').replace(/^["']|["']$/g, '').trim()
    : '',

  // Resource IDs
  GOOGLE_SHEET_ID: process.env.GOOGLE_SHEET_ID,
  GOOGLE_CALENDAR_ID: process.env.GOOGLE_CALENDAR_ID,
  GOOGLE_DRIVE_FOLDER_ID: process.env.GOOGLE_DRIVE_FOLDER_ID,
  GOOGLE_VAULT_FOLDER_ID: process.env.GOOGLE_VAULT_FOLDER_ID || process.env.GOOGLE_DRIVE_FOLDER_ID, // Dedicated Vault folder
  GOOGLE_DOCS_IDEA_ID: process.env.GOOGLE_DOCS_IDEA_ID, // 2nd Brain master ideation doc

  // Unified Google Master OAuth2 Credentials (All-in-One: Tasks, Calendar, Meet, Gmail, Drive, Docs, Sheets, Slides, Contacts, Photos, YouTube)
  GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID || process.env.GMAIL_CLIENT_ID,
  GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET || process.env.GMAIL_CLIENT_SECRET,
  GOOGLE_MASTER_REFRESH_TOKEN: process.env.GOOGLE_MASTER_REFRESH_TOKEN || process.env.GMAIL_REFRESH_TOKEN,

  // Legacy OAuth2 Refresh Tokens (Backward Compatibility Fallback)
  GMAIL_CLIENT_ID: process.env.GMAIL_CLIENT_ID || process.env.GOOGLE_CLIENT_ID,
  GMAIL_CLIENT_SECRET: process.env.GMAIL_CLIENT_SECRET || process.env.GOOGLE_CLIENT_SECRET,
  GMAIL_REFRESH_TOKEN: process.env.GMAIL_REFRESH_TOKEN || process.env.GOOGLE_MASTER_REFRESH_TOKEN,
  TASKS_REFRESH_TOKEN: process.env.TASKS_REFRESH_TOKEN || process.env.GOOGLE_MASTER_REFRESH_TOKEN,
  GOOGLE_DRIVE_REFRESH_TOKEN: process.env.GOOGLE_DRIVE_REFRESH_TOKEN || process.env.GOOGLE_MASTER_REFRESH_TOKEN,

  // ============================================================
  // 6. SEARCH ENGINES & THIRD-PARTY APIS
  // ============================================================
  SERPER_API_KEY: process.env.SERPER_API_KEY, // Serper.dev Google Search API
  TAVILY_API_KEY: process.env.TAVILY_API_KEY, // Tavily AI Advanced Search API
  BRAVE_API_KEY: process.env.BRAVE_API_KEY, // Brave Place Search API
  MAPBOX_ACCESS_TOKEN: process.env.MAPBOX_ACCESS_TOKEN, // Mapbox Location & Routing API
  WEATHER_API_KEY: process.env.WEATHER_API_KEY,
  NEWS_API_KEY: process.env.NEWS_API_KEY,
  NOTION_API_KEY: process.env.NOTION_API_KEY,
  NOTION_TASKS_DB_ID: process.env.NOTION_TASKS_DB_ID,

  // ============================================================
  // 7. SECURITY, GOD MODE & WHATSAPP BRIDGE
  // ============================================================
  NEXA_DEVICE_SECRET: process.env.NEXA_DEVICE_SECRET || process.env.NEXA_GODMODE_SECRET,
  NEXA_GODMODE_SECRET: process.env.NEXA_GODMODE_SECRET,
  NEXA_CLI_SECRET: process.env.NEXA_CLI_SECRET, // Strict CLI isolation (No Fallback)
  WHATSAPP_OWNER_NUMBER: process.env.WHATSAPP_OWNER_NUMBER,
  WHATSAPP_OWNER_JID: process.env.WHATSAPP_OWNER_JID,
  NEXA_WA_RELAY_URL: process.env.NEXA_WA_RELAY_URL || 'wss://peppy-horse-9232.knightrelaxed.deno.net',
};
