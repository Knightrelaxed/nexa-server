# 🚀 PANDUAN DEPLOYMENT N.E.X.A — Immortality Protocol v3.0
**Platform:** Hugging Face Docker Spaces + Immortality Protocol 4-Layer Defense  
**Estimasi waktu:** 30–45 menit  
**Prasyarat:** Akun GitHub, Akun Hugging Face, HP Android + Tasker

---

## FASE 1: Persiapan GitHub Repository

### Langkah 1 — Push Kode N.E.X.A ke GitHub
1. Buka **github.com** → Login → Klik **"New"** (buat repositori baru)
2. Nama repositori: `nexa-server` (atau sesuai keinginan)
3. Set ke **Private** (agar `.env` tidak bocor jika tidak sengaja ter-include)
4. Jangan centang "Initialize with README" (kita sudah punya kode)
5. Klik **"Create repository"**

Setelah itu, buka terminal di folder `N.E.X.A Asistant` dan jalankan:

```bash
git init
git add .
git commit -m "feat: N.E.X.A v2.0 — Initial deployment"
git branch -M main
git remote add origin https://github.com/<USERNAME_GITHUB_ANDA>/nexa-server.git
git push -u origin main
```

> [!CAUTION]
> **WAJIB PERIKSA:** Pastikan file `.env` ada di dalam `.gitignore` sebelum push!
> Jalankan `git status` dan pastikan `.env` **tidak** ada dalam daftar file yang akan di-commit.
> Jika ada, segera tambahkan `.env` ke file `.gitignore` dan jalankan `git rm --cached .env`.

---

## FASE 2: Membuat Hugging Face Space

### Langkah 2 — Daftar / Login Hugging Face
1. Buka **huggingface.co** → Daftar menggunakan email atau akun GitHub
2. Verifikasi email jika diminta

### Langkah 3 — Buat Space Baru
1. Klik foto profil → **"New Space"**
2. Isi form:
   - **Space name:** `nexa-server`
   - **License:** MIT
   - **Select the Space SDK:** Pilih **"Docker"** ← PENTING
   - **Docker template:** Pilih **"Blank"**
   - **Space hardware:** CPU Basic · 2 vCPU · 16 GB · FREE ← pilih yang gratis
   - **Visibility:** Private (lebih aman)
3. Klik **"Create Space"**

> Setelah dibuat, URL permanen N.E.X.A Anda akan menjadi:  
> `https://<HF_USERNAME>-nexa-server.hf.space`

### Langkah 4 — Sambungkan Space ke GitHub Repository
1. Di halaman Space yang baru dibuat, pergi ke tab **"Files"**
2. Klik **"Settings"** di halaman Space
3. Cari bagian **"Repository"** → **"Link to a GitHub repository"**
4. Otorisasi Hugging Face untuk mengakses GitHub Anda
5. Pilih repositori `nexa-server` yang sudah dibuat di Langkah 1
6. Branch: `main`
7. Klik **"Link repository"**

Setelah terhubung, setiap `git push` ke GitHub akan **otomatis trigger rebuild** di Hugging Face Space.

---

## FASE 3: Konfigurasi Environment Variables (KRUSIAL)

### Langkah 5 — Masukkan Semua Secret ke HF Space
Di Hugging Face Space, pergi ke **Settings → Variables and Secrets**

Klik **"New secret"** dan masukkan satu per satu **semua variabel** dari file `.env` lokal Anda:

| Nama Variable | Nilai |
|---|---|
| `TELEGRAM_BOT_TOKEN` | Token bot dari BotFather |
| `TELEGRAM_CHAT_ID` | Chat ID Anda |
| `GEMINI_API_KEY_PRIMARY` | API Key Gemini utama |
| `GEMINI_API_KEY_BACKUP` | API Key Gemini cadangan |
| `GROQ_API_KEY` | API Key Groq |
| `WEATHER_API_KEY` | API Key WeatherAPI |
| `NEWS_API_KEY` | API Key NewsData.io |
| `OPENROUTER_API_KEY` | API Key OpenRouter |
| `NEXA_GODMODE_SECRET` | Secret key God Mode |
| `TASKER_WEBHOOK_URL` | Kosongkan dulu, isi nanti dari Tasker |
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` | Email service account |
| `GOOGLE_PRIVATE_KEY` | Private key (copy SELURUHNYA termasuk `-----BEGIN...-----END-----`) |
| `GOOGLE_SHEET_ID` | ID Google Sheet |
| `GOOGLE_CALENDAR_ID` | `dazatulloh2@gmail.com` |
| `GOOGLE_DRIVE_FOLDER_ID` | ID folder Drive |
| `SUPABASE_URL` | URL Supabase project |
| `SUPABASE_KEY` | Anon public key Supabase |

> [!IMPORTANT]
> Untuk `GOOGLE_PRIVATE_KEY`: Saat memasukkan ke HF Secret, pastikan baris baru (`\n`) dalam private key **dipertahankan**. Copy paste seluruh isi mulai dari `-----BEGIN RSA PRIVATE KEY-----` hingga `-----END RSA PRIVATE KEY-----`.

---

## FASE 4: Verifikasi Deployment

### Langkah 6 — Tunggu Build Selesai
1. Kembali ke halaman Space → Tab **"App"**
2. Tunggu status berubah dari `Building` → `Running` (biasanya 2–5 menit)
3. Jika ada error, klik tab **"Logs"** untuk melihat detail

### Langkah 7 — Test Health Endpoint
Buka browser, akses:
```
https://<HF_USERNAME>-nexa-server.hf.space/health
```

Respons yang diharapkan:
```json
{
  "status": "ALIVE",
  "service": "N.E.X.A Cloud Core",
  "version": "2.0.0",
  "uptime_seconds": 120,
  "uptime_human": "0h 2m",
  "timestamp_jakarta": "...",
  "memory_mb": 150
}
```

---

## FASE 5: Setup Telegram Webhook

### Langkah 8 — Daftarkan URL Server ke Telegram
Buka browser dan akses URL berikut (ganti placeholder):
```
https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/setWebhook?url=https://<HF_USERNAME>-nexa-server.hf.space/webhook/telegram
```

Respons sukses:
```json
{"ok": true, "result": true, "description": "Webhook was set"}
```

### Langkah 9 — Verifikasi Webhook
```
https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/getWebhookInfo
```
Pastikan `url` menunjuk ke HF Space Anda dan `pending_update_count` = 0.

---

## FASE 6: Immortality Protocol — Setup Anti-Sleep (3 Lapisan)

### Lapisan 1A — UptimeRobot (Ping setiap 5 menit)
1. Buka **uptimerobot.com** → Daftar gratis (hanya email)
2. Klik **"Add New Monitor"**
3. Isi:
   - **Monitor Type:** HTTP(s)
   - **Friendly Name:** N.E.X.A Server
   - **URL:** `https://<HF_USERNAME>-nexa-server.hf.space/health`
   - **Monitoring Interval:** 5 minutes
4. Klik **"Create Monitor"**

### Lapisan 1B — cron-job.org (Ping setiap 10 menit, server berbeda)
1. Buka **cron-job.org** → Daftar gratis
2. Klik **"Create cronjob"**
3. Isi:
   - **Title:** NEXA Server Keepalive
   - **URL:** `https://<HF_USERNAME>-nexa-server.hf.space/health`
   - **Schedule:** Setiap 10 menit (pilih "Every" → "10 Minutes")
   - **Request method:** GET
4. Klik **"Create"**

### Lapisan 3 — Tasker Watchdog (Ping setiap 2 jam + Alert jika mati)

Buat **Profile** baru di Tasker:
- **Trigger:** Time → Repeat every 2 hours
- **Task Actions:**
  1. **HTTP Request:**
     - Method: `POST`
     - URL: `https://<HF_USERNAME>-nexa-server.hf.space/webhook/tasker`
     - Headers: `Authorization: Bearer <NEXA_GODMODE_SECRET>`; `Content-Type: application/json`
     - Body: `{"type": "WATCHDOG_PING", "data": {"source": "tasker_watchdog"}}`
     - Timeout: 10 seconds
     - Simpan respons ke variabel: `%watchdog_response`
  2. **If** `%http_response_code` **!~** `200`:
     - **Action:** Notify → "⚠️ N.E.X.A OFFLINE! Server tidak merespons. Cek HF Space dashboard."

---

## FASE 7: Setup Tasker Buffer Fallback (Lapisan 4 — Black Box)

Ini dikonfigurasi di **Task yang sudah ada** untuk menangkap notifikasi Livin'.

Pada Task "FINANCE_PUSH" yang sudah ada di Tasker, **tambahkan langkah jika POST gagal:**

**Struktur Task:**
1. HTTP Request ke `/webhook/tasker` dengan body `FINANCE_PUSH`
2. **If** `%http_response_code` **!~** `200` **OR** timeout:
   - Kirim pesan Telegram: `[BUFFER] %nominal | %merchant | %TIMES`
   - Format `%TIMES` = timestamp ISO dari Tasker variable

**Body pesan Telegram fallback (via Telegram API):**
```
URL: https://api.telegram.org/bot<TOKEN>/sendMessage
Body: {"chat_id": "<CHAT_ID>", "text": "[BUFFER] %nominal | %merchant | %TIMES"}
```

---

## FASE 8: Final End-to-End Testing

| Test | Cara | Hasil yang Diharapkan |
|---|---|---|
| ✅ Health Check | Browser ke `/health` | JSON `{"status": "ALIVE", ...}` |
| ✅ Telegram Text | Kirim "halo nexa" ke bot | N.E.X.A membalas sebagai Chief of Staff |
| ✅ Voice Note | Kirim pesan suara ke bot | Ditranskrip + direspons |
| ✅ Finance | Ucapkan "catat pengeluaran 25 ribu beli kopi" | Masuk ke Google Sheets |
| ✅ Calendar | Ucapkan "buat jadwal besok jam 9 meeting online" | Masuk ke Google Calendar |
| ✅ 2nd Brain | Ucapkan "simpan ide: bikin startup edtech" | Masuk Supabase + Google Docs |
| ✅ Buffer Test | Kirim pesan `[BUFFER] 50000 \| Test \| 2026-05-03T10:00:00Z` | Masuk Google Sheets dengan category "Auto-Buffer Recovery" |
| ✅ Watchdog | POST `{"type":"WATCHDOG_PING","data":{}}` ke `/webhook/tasker` | Respons JSON `{"status":"ALIVE",...}` |
| ✅ Alarm Briefing | POST `{"type":"ALARM_DISMISSED","data":{"timestamp":""}}` ke `/webhook/tasker` | Morning Briefing dikirim ke Telegram |
| ✅ God Mode | POST `{"type":"SCREEN_TIME_VIOLATION","data":{"app_name":"TikTok"}}` | Tasker menerima perintah God Mode |

---

## Referensi URL Penting

| Service | URL |
|---|---|
| HF Space Dashboard | `https://huggingface.co/spaces/<username>/nexa-server` |
| N.E.X.A Server | `https://<username>-nexa-server.hf.space` |
| Health Endpoint | `https://<username>-nexa-server.hf.space/health` |
| Telegram Webhook | `https://<username>-nexa-server.hf.space/webhook/telegram` |
| Tasker Webhook | `https://<username>-nexa-server.hf.space/webhook/tasker` |
| UptimeRobot Dashboard | `https://uptimerobot.com/dashboard` |
| cron-job.org Dashboard | `https://cron-job.org/en/members/jobs/` |
