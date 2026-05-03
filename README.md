---
title: NEXA Core Server
emoji: 🤖
colorFrom: blue
colorTo: indigo
sdk: docker
pinned: false
app_port: 7860
---
# N.E.X.A — Neural Extension Assistant for Intelligence
> Chief of Staff AI — Immortality Protocol v3.0 | Hugging Face Docker Space

**Stack:** Node.js 20 · Express 5 · Gemini 2.0 Flash · Groq Whisper · Supabase · Google Workspace  
**Platform:** Hugging Face Docker Spaces (Free, Always-On)

---

## 🚀 Deployment

1. Push repo ini ke **GitHub** (Private)
2. Buat **Hugging Face Space** → SDK: Docker → Hardware: CPU Basic (Free)
3. Sambungkan Space ke repo GitHub ini
4. Masukkan semua **Secrets** di HF Space Settings (lihat tabel di bawah)
5. Tunggu `Building` → `Running`
6. Set Telegram Webhook:
   ```
   https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://<HF_USER>-nexa-server.hf.space/webhook/telegram
   ```

---

## 🔑 Environment Variables (HF Secrets)

| Variable | Keterangan |
|---|---|
| `TELEGRAM_BOT_TOKEN` | Token dari @BotFather |
| `TELEGRAM_CHAT_ID` | Chat ID Anda |
| `GEMINI_API_KEY_PRIMARY` | Gemini API Key utama |
| `GEMINI_API_KEY_BACKUP` | Gemini API Key cadangan |
| `GROQ_API_KEY` | Groq Whisper (transkripsi suara) |
| `OPENROUTER_API_KEY` | Llama 3.1 fallback (opsional) |
| `WEATHER_API_KEY` | WeatherAPI.com |
| `NEWS_API_KEY` | NewsData.io |
| `NEXA_GODMODE_SECRET` | Bearer token untuk `/webhook/tasker` |
| `SUPABASE_URL` | URL project Supabase |
| `SUPABASE_KEY` | Anon key Supabase |
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` | Email robot Service Account |
| `GOOGLE_PRIVATE_KEY` | Private key lengkap (termasuk `-----BEGIN...-----END-----`) |
| `GOOGLE_SHEET_ID` | ID Google Sheet keuangan |
| `GOOGLE_CALENDAR_ID` | ID Google Calendar (biasanya email Anda) |
| `GOOGLE_DRIVE_FOLDER_ID` | ID folder Google Drive untuk 2nd Brain |

> ⚠️ **JANGAN** commit file `.env` ke GitHub. Sudah diproteksi `.gitignore`.

---

## 🌐 Endpoints

| Method | Path | Fungsi |
|---|---|---|
| `GET` | `/health` | Status server (uptime, memory, timestamp Jakarta) |
| `POST` | `/webhook/telegram` | Terima pesan dari Telegram Bot |
| `POST` | `/webhook/tasker` | Terima event dari Tasker Android (butuh Bearer token) |

---

## 🤖 Tasker — 6 Profile Wajib

| # | Profile | Fungsi |
|---|---|---|
| 1 | Sensor Keuangan Livin' | POST `FINANCE_PUSH` saat ada notifikasi transaksi |
| 2 | Buffer Fallback | Kirim `[BUFFER] nominal \| merchant \| timestamp` via Telegram jika server tidak respons |
| 3 | Screen-Time Monitor | POST `SCREEN_TIME_VIOLATION` setelah 30 menit buka app hiburan |
| 4 | God Mode Executor | Matikan WiFi+Data+kunci layar saat terima notif `🔴 GOD MODE AKTIF` |
| 5 | Alarm Dismissed | POST `ALARM_DISMISSED` saat alarm dimatikan → trigger Morning Briefing |
| 6 | Watchdog Ping | POST `WATCHDOG_PING` setiap 2 jam → alert jika server mati |

> 📖 Detail lengkap: `Plan/TASKER_AUTOMATION_GUIDE.md`

---

## 🛡️ Immortality Protocol v3.0 — 4 Lapisan Anti-Sleep

| Lapisan | Komponen | Interval |
|---|---|---|
| 1A | UptimeRobot → `GET /health` | Setiap 5 menit |
| 1B | cron-job.org → `GET /health` | Setiap 10 menit |
| 2 | Smart `/health` endpoint (uptime, memory, timestamp) | On demand |
| 3 | Tasker Watchdog → `POST /webhook/tasker` WATCHDOG_PING | Setiap 2 jam |
| 4 | Tasker Buffer → `[BUFFER]` via Telegram | Saat server cold start |

---

## 🗄️ Database (Supabase)

Jalankan `database/schema.sql` di Supabase SQL Editor **sebelum deploy**. Tabel:
- `nexa_chat_memories` — Konteks obrolan (memori AI)
- `nexa_finance_dedup` — Deduplikasi transaksi keuangan
- `nexa_2nd_brain` — Arsip ide mentah

---

## ⚠️ Security

- `/webhook/telegram` → diproteksi `TELEGRAM_CHAT_ID` lock (hanya Anda yang bisa akses)
- `/webhook/tasker` → diproteksi `Authorization: Bearer <NEXA_GODMODE_SECRET>`
- File `nexa-core-*.json` (Service Account key) **DILARANG** masuk ke repo (sudah di `.gitignore`)
