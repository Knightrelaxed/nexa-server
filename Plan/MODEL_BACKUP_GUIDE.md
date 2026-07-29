# 🛡️ Panduan & Blueprint Pencadangan Model AI N.E.X.A (`MODEL_BACKUP_GUIDE.md`)

Dokumen ini adalah acuan darurat eksekutif (*Emergency Contingency Guide*) dan katalog cadangan untuk mengelola transisi, penghentian (*deprecation*), serta penggantian model AI pada sistem **N.E.X.A Assistant** agar sistem dapat terus beroperasi 24/7 tanpa henti dengan konfigurasi minimal (`tinggal setup sedikit`).

---

## 📅 Jadwal Kritis Penghentian / Perubahan Model AI

| Tanggal / Status | Penyedia & Model | Mesin Terdampak | Status / Tindakan yang Diperlukan |
| :--- | :--- | :--- | :--- |
| **17 Juli 2026 (HARI INI)** | **Groq `Llama 4 Scout 17B`** | **Vision Engine (`Tier 9-12`)** | ⚠️ **DIMATIKAN GROQ.** Telah diperbarui pada 17 Juli 2026 menjadi `llama-3.2-90b-vision-preview` di `Vision_Engine.js` baris 229. |
| **16 Agustus 2026** | **Groq `Llama 3.3 70B Versatile`** | **Text / AI Router (`Tier 5-8`)** | 🔔 Evaluasi transisi ke `open-mistral-nemo` (`MISTRAL_API_KEY`) atau `llama-3.1-8b-instant` jika skema berubah. |
| **17 Agustus 2026** | **Cerebras `Gemma 4 31B`** | **Text (`Tier 1-4`) & Vision (`Tier 1-4`)** | ⚠️ **TRANSISI FREE TIER.** Wajib verifikasi kartu kredit untuk $5 free credits ($20 total untuk 4 akun), atau biarkan sistem melompat otomatis ke Gemini & Groq, atau promokan **Mistral `pixtral-12b-2409`** ke Tier atas. |

---

## 💥 Katalog Live & Hasil Benchmark Spesifikasi Mistral AI (`MISTRAL_API_KEY`)

Berdasarkan hasil pemindaian langsung (*live terminal request*) dan pengujian benchmark head-to-head ke API Mistral, akun kita memiliki akses ke **72 Model Aktif** dengan kecepatan dan kuota yang sangat masif (*monster limits*). Berikut adalah peringkat 8 model pilihan terbaik beserta hasil pengukurannya:

| Peringkat & Nama Model (`model_id`) | Kategori & Tingkat Kecerdasan | Kecepatan Generasi (*TPS*) | Kuota TPM (*Tokens/Min*) | Kuota RPM (*Req/Min*) | Jendela Konteks | Keunggulan & Peran Terbaik di N.E.X.A |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **🥇 `ministral-3b-latest`** | **Ultra-Fast Speed Champion (3B)** | **`130.1 tokens/sec`** 🚀 | `625.000 TPM` | `188 RPM` | `128.000 token` | **Juara Mutlak Kecepatan Mistral.** Sangat ringan, gesit, dan menyemburkan balasan hanya dalam 1,3 detik! Pilihan terbaik untuk percakapan kilat. |
| **🥈 `codestral-latest`** | **Master Pemrograman** *(Sangat Cerdas untuk Kode)* | **`96.8 tokens/sec`** ⚡ | **`625.000 TPM`** | **`125 RPM`** | `256.000 token` | **Spesialis Coding.** Peringkat #2 tercepat. Kode multi-bahasa, perbaikan *bug*, dan otomatisasi dengan kuota monster. |
| **🥉 `mistral-small-latest`** | **Balanced Fast Assistant** *(Kecerdasan Standar)* | **`85.1 tokens/sec`** 🏎️ | `50.000 TPM` | `50 RPM` | `32.000 token` | Model serbaguna seimbang yang sangat cepat dan cerdas untuk percakapan sehari-hari. |
| **4. `magistral-small-latest`** | **Fast Reasoning Assistant** | **`80.8 tokens/sec`** | `50.000 TPM` | `50 RPM` | `32.000 token` | Varian penalaran cepat (*magistral*) untuk logika dan analisis gesit. |
| **5. `pixtral-12b-2409`** *(Tier 1 saat ini)* | **Multimodal Vision & Teks** *(Kecerdasan Tinggi)* | `72.7 tokens/sec` *(~3,3s)* | **`937.500 TPM`** *(Hampir 1 Juta!)* | `30 RPM` | `128.000 token` | **Juara TPM.** Mampu menganalisis gambar maupun balasan teks panjang dengan kuota terbesar. |
| **6. `ministral-8b-latest`** | **Ultra-Lightweight & Fast (8B)** | `50.7 tokens/sec` *(~3,5s)* | **`625.000 TPM`** | **`188 RPM`** *(RPM Tertinggi)* | `128.000 token` | **Juara RPM.** Cocok untuk klasifikasi intent, rangkuman cepat, atau obrolan santai tanpa jeda. |
| **7. `open-mistral-nemo`** | **Open-Source Generalist (12B)** | `37.8 tokens/sec` *(~4,7s)* | **`500.000 TPM`** *(Setengah Juta!)* | `30 RPM` | `128.000 token` | **Master Konteks Panjang.** Sangat tangguh untuk membaca dokumen panjang dan riwayat percakapan yang banyak. |
| **8. `voxtral-small-latest`** | **Audio & Voice Processing** | **🔊 Audio Fast** | `50.000 TPM` | `60 RPM` | Khusus Audio | Mampu mentranskripsikan suara maupun analisis audio langsung dari ekosistem Mistral. |

---

## 🛠️ Panduan Penggantian Cepat (*Quick Switch Shortcuts*)

### 1. 👁️ Mengganti Model Groq Vision (Menangani Penghentian `Llama Scout` 17 Juli)
Buka berkas: `src/core/Vision_Engine.js`
Cari fungsi `callGroqVision()` (baris 229):
```javascript
// SEBELUM (Mati per 17 Juli 2026):
model: 'meta-llama/llama-4-scout-17b-16e-instruct',

// SESUDAH (Model pengganti resmi Groq yang aktif & cepat — SUDAH TERPASANG):
model: 'llama-3.2-90b-vision-preview',
```

---

### 2. 🚀 Mempromosikan Mistral Pixtral / Open Nemo ke Tier Utama (`Fallback_Engine.js`)
Jika Cerebras (`gemma-4-31b`) wajib kartu kredit per 17 Agustus 2026 dan Anda ingin langsung mempromosikan **Mistral** yang super kencang ini:
1. Buka `src/core/Fallback_Engine.js`.
2. Pada fungsi `callCerebras()` atau `callGroq()`, Anda bisa langsung mengarahkan pemanggilan ke fungsi `callMistral(prompt, systemInstruction, temperature, jsonMode)` atau mengganti parameter model pada fungsi `callMistral` (baris 224) dari `pixtral-12b-2409` menjadi `open-mistral-nemo` atau `codestral-latest` sesuai kebutuhan beban kerja.

---

### 3. 🧠 Mengganti Model Teks Cerebras dengan Hugging Face
Jika ingin beralih ke Hugging Face Inference API dengan model yang 100% sama dengan Cerebras:
* Endpoint URL: `https://router.huggingface.co/hf-inference/models/google/gemma-4-31B-it`
* Auth Header: `Bearer ${env.HF_INFERENCE_TOKEN}`

---

### 4. 👂 Mempertahankan Kekuatan Voice Engine (`Whisper Large v3 Turbo` & `Voxtral`)
Mesin suara kita saat ini dalam kondisi **Sangat Kokoh & Aman**:
* **Tier 1-4:** Menggunakan `openai/whisper-large-v3-turbo` dari **Hugging Face (`HF_INFERENCE_TOKEN`)** yang dijalankan dalam 4 slot percobaan berurutan.
* **Tier 5-8:** Menggunakan **Google Gemini 2.5 Flash Native Audio** (4 API Key terpisah).
* **Tier 9-12:** Menggunakan **Groq Whisper** (`whisper-large-v3` LPU) atau **Mistral `voxtral-small-latest`** sebagai pertahanan terakhir.

---

## 📂 Lokasi Blueprint JSON Terstruktur
Untuk membaca seluruh spesifikasi, URL endpoint, dan pemetaan API Key secara komputasional oleh agen AI atau script otomatis, silakan merujuk ke berkas pendamping:
👉 `src/config/model_backup_plan.json`
