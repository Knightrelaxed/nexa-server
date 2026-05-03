# 🛠️ Panduan Maintenance & Development N.E.X.A

Dokumen ini adalah buku panduan utama untuk mendiagnosis masalah, melacak error, dan melakukan pemeliharaan (maintenance) pada sistem N.E.X.A.

---

## 📍 1. Peta Error Handling (Di Mana Error Ditemukan?)

Jika N.E.X.A mengalami masalah, sistem pelaporan terbagi menjadi dua jalur berdasarkan tingkat bahayanya:

| Jenis Error / Lapisan | Sistem Pelaporan Saat Ini | Siapa yang Tahu? | Cara Investigasi |
|---|---|---|---|
| **Pesan Telegram Normal** (Domain error) | **Telegram** ✅ (Terkirim via Bot) | Anda (langsung di chat) | Baca pesan error yang dibalas N.E.X.A. |
| **Pesan Tasker Normal** (GodMode/Finance) | Response HTTP 500/400 (Internal Tasker) | Anda (Jika Anda mengecek Tasker log) | Lihat *Run Log* di dalam aplikasi Tasker Android. |
| **Voice / Vision API Gagal** | **Telegram** ✅ (Terkirim via Bot) | Anda (langsung di chat) | Cek kuota API Gemini / Groq. |
| **Tasker Webhook Error Internal** | `console.error(...)` 🔴 | Server Log | Buka **Hugging Face Space → Logs** |
| **Fatal: AI Router JSON Parse Error** | **Telegram** ✅ (Disonansi kognitif) | Anda (langsung di chat) | Cek prompt LLM, sesuaikan jika respon LLM tidak berformat JSON. |
| **FATAL: Unhandled Rejection (Safety Net)** | `console.error('[SAFETY NET]...')` 🔴 | Server Log | Buka **Hugging Face Space → Logs**. Ini adalah error kode asinkron yang lolos dari `try-catch`. |
| **FATAL: Uncaught Exception (Safety Net)** | `console.error('[SAFETY NET]...')` 🔴 | Server Log | Buka **Hugging Face Space → Logs**. Error sinkronus mematikan, tetapi server N.E.X.A disetel agar **TETAP HIDUP** (tidak crash). |

> **⚠️ PERHATIAN KE DEPAN:** Sekitar 60% error level-sistem (seperti `SAFETY NET` atau Tasker HTTP 500) saat ini hanya tercatat secara tersembunyi di log Hugging Face. Jika Anda ingin semua error mematikan itu diforward langsung ke Telegram Anda (seperti peringatan "🚨 CRITICAL ERROR"), Anda bisa meminta AI di kemudian hari untuk *"Forward Safety Net error ke Telegram"*.

---

## 🔄 2. Sistem Fallback Multi-Tier (Jika API AI Down)

N.E.X.A dirancang agar tidak pernah mati meskipun Google atau OpenAI sedang *down*. Berikut adalah sistem keamanannya (`Fallback_Engine.js`):

1. 🥇 **Primary:** `gemini-2.5-flash` (Paling cerdas, multi-modal).
2. 🥈 **Backup:** `gemini-2.0-flash` (Stabil, diakses jika 2.5 timeout).
3. 🥉 **Tier 3:** `llama-3.1-8b` via OpenRouter (Berjalan jika seluruh infrastruktur Google hancur).
4. 🆘 **Dumb Mode:** Pesan statis ("Otak saya sedang kelebihan beban") dikirim ke Telegram, server tetap hidup.

---

## 🗄️ 3. Arsitektur Memori 

Memori N.E.X.A ditangani oleh Supabase. Jika Supabase down, N.E.X.A akan mengaktifkan *Silent Fail Strategy* — dia akan tetap membalas, tapi tanpa konteks masa lalu.

- **Memori Jangka Pendek (7 chat terakhir):** Tabel `nexa_chat_memories`.
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
   - Cari kata kunci `[SAFETY NET]` atau `error` (huruf kecil).
3. **Cek Limit API**
   - Apakah kuota gratis Google AI Studio bulan ini habis?
   - Apakah Supabase project sedang ter-*pause* (inactive selama 7 hari)?
4. **Bawa Log ke AI**
   - Copy teks error berwarna merah dari Hugging Face Logs.
   - Kirim ke AI Assistant (seperti saya) dengan perintah: *"Analisis error log N.E.X.A berikut: [paste error]"*.

---

## 🔒 5. Sistem Keamanan & Autentikasi

- **Telegram:** Dilindungi oleh `telegramIdentityLock`. Pesan dari chat ID yang tidak dikenal akan langsung di-drop.
- **Tasker:** Membutuhkan Header `Authorization: Bearer <NEXA_GODMODE_SECRET>`. Akses tanpa secret akan mendapatkan status 403 Forbidden.
