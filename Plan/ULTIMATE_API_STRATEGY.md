# 🚀 ULTIMATE API STRATEGY (GOD MODE LEVEL 2)
**Dokumen Induk Arsitektur Fallback N.E.X.A Assistant**

Tujuan dari strategi ini adalah menciptakan asisten dengan **Zero Downtime, Konteks Super Panjang, dan Nol Biaya**, memanfaatkan penggabungan 4 Akun Google gratis beserta *free tier* dari berbagai provider AI terkemuka.

---

## 🔑 SUMBER API KEY & REGISTRASI
Berikut adalah daftar API Key yang dibutuhkan, di mana mendapatkannya, dan batasannya:

1. **Google Gemini (Butuh 4 Akun Google)**
   - **Daftar:** `aistudio.google.com` (Gunakan 4 email berbeda).
   - **Variabel:** `GEMINI_API_KEY_1`, `GEMINI_API_KEY_2`, `GEMINI_API_KEY_3`, `GEMINI_API_KEY_4`.
   - **Fungsi:** Backbone utama untuk Vision, penalaran panjang, dan Native Audio.
2. **Groq**
   - **Daftar:** `console.groq.com`.
   - **Variabel:** `GROQ_API_KEY`.
   - **Fungsi:** Ujung tombak berkecepatan tinggi (Router, Vision Backup, Whisper Voice).
3. **OpenRouter**
   - **Daftar:** `openrouter.ai`.
   - **Variabel:** `OPENROUTER_API_KEY`.
   - **Fungsi:** Agregator model gratis (Gemma, Nemotron) sebagai *Safety Net* terakhir Text Engine.
4. **Cerebras**
   - **Daftar:** `cloud.cerebras.ai`.
   - **Variabel:** `CEREBRAS_API_KEY`.
   - **Fungsi:** Backup instan untuk Text Router dengan kecepatan *inference* tercepat di dunia.
5. **Mistral**
   - **Daftar:** `console.mistral.ai`.
   - **Variabel:** `MISTRAL_API_KEY`.
   - **Fungsi:** Jaring pengaman tambahan untuk Text Engine.
6. **Hugging Face**
   - **Daftar:** `huggingface.co/settings/tokens`.
   - **Variabel:** `HF_TOKEN`.
   - **Fungsi:** Pengaman terakhir untuk Vision Engine menggunakan model *Open Source* tanpa limit harian (hanya limit per IP/jam).

---

## 🧠 ARSITEKTUR TIER (DISTRIBUSI BEBAN)

### 1. VISION ENGINE (Mata N.E.X.A)
*Membaca struk, foto, dan menganalisis visual Telegram.*
*   **Tier 1-4 (Premium Quality):** `gemini-2.5-flash` menggunakan bergantian 4 Akun Google.
*   **Tier 5-8 (Balanced):** Groq `meta-llama/llama-4-scout-17b-16e-instruct` (Vision Llama terbaru, terbukti stabil).
*   **Tier 9-10 (Generous Quota):** `gemini-2.0-flash` menggunakan 2 Akun Google (Kapasitas tampung raksasa).
*   **Tier 11 (Safety Net Terakhir):** Hugging Face Inference API `Qwen2-VL-7B-Instruct`. Gratis tanpa kuota akun.
*   **Fallback Final:** Jika **SEMUA** Tier di atas gagal/down, sistem mengirim notifikasi langsung ke Telegram Anda: *"⚠️ Sistem Penglihatan Down Total."*

### 2. TEXT ENGINE & AI ROUTER (Otak N.E.X.A)
*Routing pesan, identifikasi Intent (Finance/Schedule), dan balasan chat.*
*   **Tier 1 (The Sprinter):** Groq `llama-3.3-70b-versatile`. Ultra-cepat, ideal untuk Router.
*   **Tier 2 (The Backup Sprinter):** Cerebras `llama-3.1-70b`. Mengambil alih seketika dengan kecepatan ekstrim.
*   **Tier 3-6 (The Deep Thinkers):** `gemini-2.5-flash` (4 Keys Google). Untuk penalaran mendalam.
*   **Tier 7-8 (The Infinite Context):** `gemini-2.0-flash` (2 Keys Google).
*   **Tier 9 (The Mistral):** Mistral API Free `open-mixtral-8x22b` atau `pixtral-12b`.
*   **Tier 10 (The OpenRouter Net):** OpenRouter `google/gemma-4-26b-a4b-it:free` atau `nvidia/nemotron-nano-12b-v2-vl:free` (Sistem memilih acak).
*   **Fallback Final:** Jika gagal semua, kirim peringatan darurat ke Telegram.

### 3. VOICE ENGINE (Telinga N.E.X.A)
*Transkripsi Audio OGG/OGA dari Telegram.*
*   **Tier 1:** Groq `whisper-large-v3`. Akurasi tertinggi, selesai dalam ~3 detik.
*   **Tier 2-5 (NATIVE AUDIO):** `gemini-2.0-flash` (4 Keys Google). Model ini dapat menerima file OGG secara native lewat base64 `inlineData` `audio/ogg`, sehingga tidak butuh Whisper lagi jika Groq mati.
*   **Fallback Final:** Jika gagal semua, N.E.X.A membalas di Telegram: *"⚠️ Sistem Pendengaran Down Total."*

---
**Aturan Emas:** Semua panggilan API ke Google, Groq, Cerebras, Mistral, dan HF **WAJIB** menggunakan mekanisme *Smart Retry* jika mendapat respons `HTTP 503 (Service Unavailable)`. Ini mencegah tier terbuang sia-sia akibat gangguan server sementara (micro-downtime).
