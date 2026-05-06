# 🛠️ Panduan Maintenance & Development N.E.X.A

Dokumen ini adalah buku panduan utama untuk mendiagnosis masalah, melacak error, dan melakukan pemeliharaan (maintenance) pada sistem N.E.X.A.

---

## 📍 1. Peta Error Handling (Di Mana Error Ditemukan?)

Jika N.E.X.A mengalami masalah, sistem pelaporan terbagi menjadi dua jalur berdasarkan tingkat bahayanya:

| Jenis Error / Lapisan | Sistem Pelaporan Saat Ini | Siapa yang Tahu? | Cara Investigasi |
|---|---|---|---|
| **Pesan Telegram Normal** (Domain error) | **Telegram** ✅ (Terkirim via Bot) | Anda (langsung di chat) | Baca pesan error yang dibalas N.E.X.A. |
| **Pesan Tasker Normal** (GodMode/Finance) | Response HTTP 500/400 (Internal Tasker) | Anda (Jika Anda mengecek Tasker log) | Lihat *Run Log* di dalam aplikasi Tasker Android. |
| **Voice / Vision API Gagal** | **Telegram** ✅ (Pesan peringatan multi-tier gagal) | Anda (langsung di chat) | N.E.X.A akan mengirim pesan jika semua 6-tier (Voice) atau 11-tier (Vision) gagal. Cek log HF untuk status HTTP error. |
| **Tasker Webhook Error Internal** | `console.error(...)` 🔴 | Server Log | Buka **Hugging Face Space → Logs** |
| **Fatal: AI Router JSON Parse Error** | **Telegram** ✅ (Disonansi kognitif) | Anda (langsung di chat) | Cek prompt LLM, sesuaikan jika respon LLM tidak berformat JSON. |
| **FATAL: Unhandled Rejection (Safety Net)** | `console.error('[SAFETY NET]...')` 🔴 | Server Log | Buka **Hugging Face Space → Logs**. Ini adalah error kode asinkron yang lolos dari `try-catch`. |
| **FATAL: Uncaught Exception (Safety Net)** | `console.error('[SAFETY NET]...')` 🔴 | Server Log | Buka **Hugging Face Space → Logs**. Error sinkronus mematikan, tetapi server N.E.X.A disetel agar **TETAP HIDUP** (tidak crash). |

> **⚠️ PERHATIAN KE DEPAN:** Sekitar 60% error level-sistem (seperti `SAFETY NET` atau Tasker HTTP 500) saat ini hanya tercatat secara tersembunyi di log Hugging Face. Jika Anda ingin semua error mematikan itu diforward langsung ke Telegram Anda (seperti peringatan "🚨 CRITICAL ERROR"), Anda bisa meminta AI di kemudian hari untuk *"Forward Safety Net error ke Telegram"*.

---

## 🔄 2. Sistem Fallback God Mode (Jika API AI Down)

N.E.X.A versi **God Mode Level 2** dirancang dengan arsitektur multi-tier skala besar, merotasi puluhan kunci API secara dinamis dengan **503 Smart Retry**. Jika satu kunci kena limit 429 atau server mati 503, ia akan pindah ke kunci/provider berikutnya.

### 👁️ Mata N.E.X.A (Vision Engine - 11 Tier)
1. **Tier 1 - 4:** Gemini 2.5 Flash (4x Kunci Google Utama)
2. **Tier 5 - 8:** Groq Llama 4 Scout 17B (4x Kunci Groq)
3. **Tier 9 - 10:** Gemini 2.0 Flash (2x Kunci Google Utama/Fallback)
4. **Tier 11 (Safety Net):** Hugging Face Qwen2-VL-7B-Instruct (Tanpa kuota harian)
> *Jika semua 11 tier hancur, kirim notifikasi darurat Telegram.*

### 🧠 Otak N.E.X.A (Text Engine / AI Router - 9 Tier)
1. **Tier 1 - 2:** Groq Llama 3.3 70B (The Sprinter)
2. **Tier 3 - 4:** Gemini 2.5 Flash (The Deep Thinkers)
3. **Tier 5:** Cerebras Llama 3.1 70B (The Backup Sprinter)
4. **Tier 6 - 7:** Gemini 2.0 Flash (The Infinite Context)
5. **Tier 8:** Mistral Pixtral 12B (The Mistral)
6. **Tier 9:** OpenRouter Gemma 2 (The OpenRouter Net)
> *Jika semua 9 tier hancur, masuk ke Dumb Mode (Balasan Statis).*

### 👂 Telinga N.E.X.A (Voice Engine - 6 Tier)
1. **Tier 1 - 4:** Groq Whisper Large v3 (4x Kunci Groq)
2. **Tier 5 - 6:** Gemini 2.0 Flash Native Audio (2x Kunci Google Utama/Fallback)
> *Jika semua 6 tier hancur, kirim notifikasi darurat Telegram.*

---

## 🗄️ 3. Arsitektur Memori 

Memori N.E.X.A ditangani oleh Supabase. Jika Supabase down, N.E.X.A akan mengaktifkan *Silent Fail Strategy* — dia akan tetap membalas, tapi tanpa konteks masa lalu.

- **Memori Jangka Pendek (10 chat terakhir):** Tabel `nexa_chat_memories`.
- **Fakta Personal Jangka Panjang:** Tabel `nexa_2nd_brain` (`type = 'PERSONAL_FACT'`).
  - *Performa:* Fakta personal **di-cache ke dalam RAM server** (`AI_Router.js`). Tidak ada query database tambahan per pesan.
  - *Invalidation:* Jika Anda menyimpan fakta personal baru, cache otomatis dibersihkan dan difetch ulang pada chat berikutnya.
- **Arsip Ide 2nd Brain:** Tabel `nexa_2nd_brain` (`type = 'IDEA'`). Disimpan juga di Google Docs.

---

## 🩺 4. Protokol Diagnosis (Langkah-Langkah Pemecahan Masalah)

Jika N.E.X.A bertingkah aneh atau diam saja, lakukan langkah berikut secara berurutan:

1. **Cek Uptime (Kesehatan Server)**
   - Akses: `https://<HF_USERNAME>-nexa-server.hf.space/health`
   - Harapan: Tampil JSON dengan `"status": "ALIVE"`.
2. **Cek Log Hugging Face (Jantung Log)**
   - Buka dashboard Space, masuk ke tab **Logs**.
   - Cari kata kunci `[SAFETY NET]` atau `error` (huruf kecil), atau status fallback `[FALLBACK]`, `[VISION]`, `[VOICE]`.
3. **Cek Limit API**
   - Apakah kuota gratis API Groq/Google AI Studio bulan ini habis? (Jika semua 11 tier mati, kemungkinan besar masalah jaringan HF atau akun kena ban massal).
   - Apakah Supabase project sedang ter-*pause* (inactive selama 7 hari)?
4. **Bawa Log ke AI**
   - Copy teks error dari Hugging Face Logs.
   - Kirim ke AI Assistant (seperti saya) dengan perintah: *"Analisis error log N.E.X.A berikut: [paste error]"*.

---

## 🔒 5. Sistem Keamanan & Autentikasi

- **Telegram:** Dilindungi oleh `telegramIdentityLock`. Pesan dari chat ID yang tidak dikenal akan langsung di-drop.
- **Tasker:** Membutuhkan Header `Authorization: Bearer <NEXA_GODMODE_SECRET>`. Akses tanpa secret akan mendapatkan status 403 Forbidden.
- **Jaringan Hugging Face:** Panggilan Telegram dan Vision didesain melewati `TELEGRAM_PROXY_URL` untuk menghindari blokir firewall dari infrastruktur HF.
