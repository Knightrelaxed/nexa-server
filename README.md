
# N.E.X.A — Neural Extension Assistant for Intelligence
> Chief of Staff AI — Immortality Protocol v2.0

**N.E.X.A** adalah asisten AI super cerdas bergaya "J.A.R.V.I.S" yang dirancang khusus untuk menjadi *Chief of Staff* bagi Tuan Faqih. Berbeda dengan chatbot konvensional, N.E.X.A beroperasi secara proaktif (*set-and-forget*), mengelola keuangan, agenda akademik, penjadwalan, hingga memonitor kedisiplinan digital pengguna.

---

## 🏗️ Arsitektur Sistem Utama

Arsitektur N.E.X.A terbagi menjadi dua entitas utama yang bekerja berdampingan:

1. **N.E.X.A Core Server (Backend)**
   - **Lokasi:** Root directory proyek ini.
   - **Stack:** Node.js 20, Express.js.
   - **Hosting:** Hugging Face Docker Spaces (Free, Always-On).
   - **Peran:** Otak utama, pemroses bahasa natural, eksekutor otomasi, dan jembatan ke berbagai API pihak ketiga (Telegram, Google Workspace, LLMs, Supabase).

2. **Nexa Finance Web (Frontend Dashboard)**
   - **Lokasi:** Folder `/nexa-finance-web`
   - **Stack:** Next.js (App Router), React.
   - **Peran:** Aplikasi web visual bagi pengguna untuk memantau data yang telah diproses dan dicatat oleh N.E.X.A Core secara *real-time*.

---

## 🧠 Subsistem N.E.X.A Core

Backend N.E.X.A beroperasi menggunakan berbagai subsistem pintar:

### 1. AI Router & Fallback Engine
- Mengklasifikasikan niat pengguna (*intent*) secara cerdas dari teks Telegram.
- **Failover Anti-Mati:** Jika AI utama (Gemini 2.5 Flash) mengalami *down* atau *rate limit*, sistem otomatis beralih (*fallback*) secara mulus ke model cadangan (Groq Llama 4, Gemini 2.0 Flash) tanpa disadari oleh pengguna.

### 2. Vision & Voice Engine (Multi-Tier)
- **Vision Engine (11-Tier):** Menganalisis gambar yang dikirim pengguna. Mampu membaca teks dokumen, mengekstrak data dari tabel/struk, dan memberikan deskripsi natural. Jika provider utama gagal, ia akan beralih hingga 11 lapisan provider (termasuk Qwen2-VL di Hugging Face).
- **Voice Engine (6-Tier):** Menerima pesan suara (*Voice Note*) dari Telegram dan mentranskripsinya secara akurat.

### 3. Finance Engine
- Bertanggung jawab mencatat, mengkategorikan, dan menganalisis transaksi.
- **Fitur Khusus:** Deduplikasi pintar (mencegah catat ganda), pemulihan transaksi saat server *restart*, *auto-polling* email mutasi bank, dan mendukung instruksi ralat natural (misal: "Nexa, ubah yang tadi jadi 5 ribu").

### 4. Memory & Contextual Awareness (Supabase)
- **Konsolidasi Memori Harian:** Setiap pukul 23:59 WIB, N.E.X.A membaca seluruh transkrip obrolan pada hari itu. AI mengekstrak fakta permanen baru (rutinitas, preferensi) secara cerdas (tanpa menduplikasi data lama) ke dalam memori *Supabase* sehingga N.E.X.A terus berkembang semakin mengenali pengguna.
- **Pembelajaran Pasif:** Otomatis belajar fakta baru di tengah percakapan secara *on-the-fly*.

### 5. Proactive Cron & Behavioral Engine
N.E.X.A tidak sekadar menunggu instruksi, tetapi menyapa duluan:
- **05:30 WIB:** *Morning Briefing*
- **12:00 WIB:** *Midday Pulse* (Ringkasan hari dan progres tugas)
- **17:00 WIB:** *Evening Debrief* (Evaluasi pencapaian harian)
- **21:00 WIB:** *Tomorrow Prep* (Persiapan agenda untuk esok)
- **Proximity Alert:** Mengingatkan 30 menit sebelum jadwal kalender dimulai.

### 6. God Mode & Digital Discipline
Bekerja sama erat dengan aplikasi **Tasker** di Android pengguna. N.E.X.A bertindak sebagai polisi disiplin. Jika terdeteksi pengguna membuka aplikasi hiburan (TikTok/Instagram) > 30 menit, N.E.X.A mengirim *webhook* darurat untuk mematikan koneksi internet dan mengunci layar ponsel pengguna.

---

## 📊 Nexa Finance Web

Terletak di dalam direktori `nexa-finance-web/`, ini adalah antarmuka visual modern untuk sistem keuangan N.E.X.A.

- **Dashboard:** Menyajikan ringkasan makro tentang status keuangan (pemasukan, pengeluaran mingguan/bulanan, dan tren visual).
- **Analytics:** Menganalisis pengeluaran berdasarkan kategori untuk mengetahui porsi bocor halus atau pos pengeluaran terbesar.
- **Records:** Menampilkan daftar *ledger* transaksi secara detail, yang ditarik langsung dari database *Supabase* N.E.X.A.
- **Sinkronisasi:** N.E.X.A Core yang bekerja di Telegram mengumpulkan dan mencatat data, sementara Nexa Finance Web bertugas menampilkannya dalam format GUI yang memanjakan mata untuk evaluasi berkala.

---

## 🚀 Deployment (Core Server)

1. Push repo ini ke **GitHub** (Private).
2. Buat **Hugging Face Space** → SDK: Docker → Hardware: CPU Basic (Free).
3. Sambungkan Space ke repo GitHub ini.
4. Masukkan semua **Secrets** di HF Space Settings (lihat tabel di bawah).
5. Tunggu `Building` → `Running`.
6. Set Telegram Webhook dengan URL Space Anda:
   ```
   https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://<HF_USER>-nexa-server.hf.space/webhook/telegram
   ```

---

## 🔑 Environment Variables (HF Secrets)

| Variable | Keterangan |
|---|---|
| `TELEGRAM_BOT_TOKEN` | Token dari @BotFather |
| `TELEGRAM_CHAT_ID` | Chat ID Telegram Tuan Faqih (Proteksi Akses) |
| `GEMINI_API_KEY_1`..`4` | API Key Google Gemini (Primary & Backup) |
| `GROQ_API_KEY_1`..`4` | API Key Groq (Whisper & Llama Fallback) |
| `HF_TOKEN` | Token akses HuggingFace API |
| `NEXA_GODMODE_SECRET` | Bearer token untuk autentikasi rute `/webhook/tasker` |
| `SUPABASE_URL` | URL project Supabase |
| `SUPABASE_KEY` | Anon key Supabase |
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` | Email robot Service Account Google |
| `GOOGLE_PRIVATE_KEY` | Private key lengkap Service Account |

> ⚠️ **JANGAN** commit file `.env` ke GitHub. Pastikan tetap berada di `.gitignore`.

---

## 🛡️ Immortality Protocol v2.0

Untuk memastikan server di Hugging Face tidak pernah "tertidur" (*sleep*):
1. **UptimeRobot / cron-job.org** melakukan ping berkala ke endpoint `GET /health`.
2. **Tasker Watchdog** mengirim sinyal ping dari Android setiap 2 jam via Telegram/Webhook.
3. **Tasker Buffer System** menampung transaksi finansial sementara secara lokal di HP jika server N.E.X.A kebetulan sedang *restart* atau lambat, lalu mengirim ulang (`[BUFFER]`) saat server online kembali.

---
title: NEXA Core Server
emoji: 🤖
colorFrom: blue
colorTo: indigo
sdk: docker
pinned: false
app_port: 7860
---
