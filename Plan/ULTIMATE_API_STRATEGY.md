# 🚀 ULTIMATE API STRATEGY (GOD MODE LEVEL 2)
**Dokumen Induk Arsitektur Fallback N.E.X.A Assistant**

Tujuan dari strategi ini adalah menciptakan asisten dengan **Zero Downtime, Konteks Super Panjang (1Jt+ Token), dan Nol Biaya**, memanfaatkan penggabungan 4 Akun Google gratis beserta *free tier* dari berbagai provider AI terkemuka di dunia.

---

## 🔑 ASET PROVIDER & API KEY YANG DIGUNAKAN
1. **Google Gemini (4 Akun = 4 Kunci Independen)**
   - `GEMINI_API_KEY_1` (Utama)
   - `GEMINI_API_KEY_2` (Backup 1)
   - `GEMINI_API_KEY_3` (Backup 2)
   - `GEMINI_API_KEY_4` (Backup 3)
2. **Groq** (`GROQ_API_KEY`) - Ultra fast inference (Llama 3.3 70B & Llama 3.2 11B Vision)
3. **OpenRouter** (`OPENROUTER_API_KEY`) - Agregator model gratis (Gemma, Nemotron)
4. **Cerebras** (`CEREBRAS_API_KEY`) - Fast inference Llama 3.1 70B
5. **Mistral** (`MISTRAL_API_KEY`) - Mistral API Free (Nemo / Pixtral)
6. **Hugging Face** (`HF_TOKEN`) - Inference API gratis (Whisper, Qwen2-VL)

---

## 🧠 DISTRIBUSI BEBAN (LOAD BALANCING) TIGA MESIN

### 1. TEXT ENGINE & AI ROUTER (Otak Pengendali Utama)
*Kebutuhan: Harus instan, deterministik, dan logis. Tidak butuh kuota berat.*

*   **Tier 1 (The Sprinter):** Groq `llama-3.3-70b-versatile`. Kecepatan 800 token/detik. Sangat sempurna untuk mengekstrak *intent* (niat pengguna).
*   **Tier 2 (The Backup Sprinter):** Cerebras `llama-3.1-70b`. Mengambil alih seketika jika Groq tumbang.
*   **Tier 3-6 (The Deep Thinkers):** Gemini `gemini-2.5-flash` (mengurutkan 4 kunci Google). Digunakan untuk perintah kompleks yang butuh penalaran dalam. Batas 20/hari/key (Total 80/hari).
*   **Tier 7-10 (The Infinite Context):** Gemini `gemini-1.5-flash` (mengurutkan 4 kunci Google). Digunakan khusus jika input membutuhkan konteks raksasa (membaca PDF/Dokumen panjang). Batas 1,500/hari/key (Total 6.000/hari).
*   **Tier 11 (The Mistral):** Mistral API `open-mixtral-8x22b`.
*   **Tier 12 (The Safety Net):** OpenRouter (pilih dinamis dari pool gratis: Gemma 4 26B, Nemotron 12B).

### 2. VISION ENGINE (Mata N.E.X.A)
*Kebutuhan: Model vision yang kuat, toleransi tinggi terhadap format file.*

*   **Tier 1-4 (Premium Vision):** Gemini `gemini-2.5-flash` (4 Kunci). Kualitas pembacaan struk, nota, dan teks gambar tertinggi.
*   **Tier 5-8 (Balanced Vision):** Gemini `gemini-2.0-flash` (4 Kunci).
*   **Tier 9-12 (Heavy Duty Vision):** Gemini `gemini-1.5-flash` (4 Kunci). Kuota raksasa untuk pemrosesan banyak gambar sekaligus.
*   **Tier 13 (Independent Vision):** Groq `llama-3.2-11b-vision-preview`. 
*   **Tier 14 (Open Source Vision):** Hugging Face Inference API `Qwen2-VL-7B-Instruct` (Tangguh untuk OCR ringan).

### 3. VOICE ENGINE (Telinga N.E.X.A)
*Kebutuhan: Cepat mengubah audio OGG dari Telegram menjadi Teks.*

*   **Tier 1 (Utama):** Groq `whisper-large-v3`. Akurasi bahasa Indonesia tertinggi, selesai di bawah 3 detik.
*   **Tier 2-5 (Native Audio Fallback):** Gemini `gemini-1.5-flash` (4 Kunci). *Rahasia:* Gemini 1.5 mendukung input binary audio/ogg langsung! Sangat cepat dan kuotanya besar (6000 req/hari gabungan).
*   **Tier 6 (Safety Net):** Hugging Face Inference API `openai/whisper-large-v3`.

---

## ⚡ LOGIKA SMART RETRY 503
Di seluruh pemanggilan API, N.E.X.A **harus** mengimplementasikan logika pencegatan status HTTP `503 Service Unavailable`.
Jika `503` terdeteksi, N.E.X.A tidak boleh menyerah atau melempar error. Ia harus melakukan jeda (Delay 2 detik) dan mencoba ulang maksimal 3x sebelum membuang *tier* tersebut. Ini menyelamatkan API dari kegagalan sinkronisasi mikro-detik.
