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

---

## 🧪 Hasil Evaluasi Kualitas Karakteristik & Personality Model (Stress-Test Real-World)

Dokumen ini mencatat hasil pengujian berbagai *provider* dan model AI untuk melihat kemampuan mereka dalam mengadopsi *personality* N.E.X.A (sebagai Chief of Staff yang cerdas, empati, hangat, dan natural).

Tujuan pengujian ini adalah mencari alternatif terbaik jika *free-tier* Cerebras ditutup pada 17 Agustus 2026.

### 1. Puter AI Pool (Codestral & GPT-4o)
- **Status Pengujian:** Selesai
- **Hasil Respons:** Sangat mekanis dan kaku.
- **Analisis Kepatuhan:**
  - Patuh pada aturan format (tidak memakai kata "Bapak", "Mas").
  - Gagal menyerap nuansa emosional dan gaya bicara natural. 
  - Gaya bahasa yang dihasilkan terdengar seperti *customer service* korporat (*"Baik, Tuan Faqih... Selamat melanjutkan aktivitas!"*).
- **Kesimpulan:** Kurang cocok untuk menggantikan Cerebras sebagai Tier 1 dalam hal *personality*.

---

### 2. Google Gemini 3.6 Flash
- **Status Pengujian:** Selesai
- **Hasil Respons:** Cukup baik, memiliki kesadaran diri (*self-awareness*), namun terasa sedikit sarkas/nge-gas.
- **Analisis Kepatuhan:**
  - Berhasil menyerap instruksi untuk tidak kaku.
  - Memiliki "nyawa" yang lebih baik dibanding Codestral/GPT-4o.
  - Namun, alih-alih hangat, model ini mengeksekusi instruksi santai menjadi sedikit menantang atau reaktif (*"Lho, Tuan Faqih mau respons yang lebih menantang?"*).
- **Kesimpulan:** Jauh lebih baik dari Puter AI, namun belum semulus dan senatural Cerebras.

---

### 3. Hugging Face Inference API (Gemma 4 31B)
- **Status Pengujian:** Selesai (namun Gagal Teknis)
- **Hasil Respons:** Tidak dapat dievaluasi secara murni.
- **Catatan:** Semua *request* ke Hugging Face mengalami *timeout* atau gagal karena kendala limit kuota gratis bulanan (Status 402 - Depleted Credits). Respons bagus yang sempat muncul ternyata merupakan hasil dari *Fallback System* yang melempar *request* tersebut ke Cerebras secara otomatis.

---

### 4. Mistral AI (ministral-3b-latest)
- **Status Pengujian:** Selesai
- **Hasil Respons:** Berusaha ramah tapi sangat repetitif (*template-like*) dan kehilangan konteks kepatuhan.
- **Analisis Kepatuhan:**
  - **Pemahaman Konteks:** Sangat lemah. Model terus mengulang topik "jadwal belajar bahasa Arab" di hampir setiap respons, meskipun Tuan Faqih sedang bercanda atau membahas hal lain. Terlihat memaksakan fakta yang baru ia ingat.
  - **Kedalaman Emosional:** Berusaha terdengar santai ("ngomong-ngomong...", "aku paham"), namun struktur bahasanya terasa repetitif sehingga mudah ditebak bahwa itu adalah mesin.
  - **Kepatuhan Aturan Mutlak:** Lulus larangan panggilan informal (tidak memakai "Bapak" atau "Mas"), dan menggunakan sapaan formal "Anda" yang masih diperbolehkan oleh aturan.
- **Kesimpulan:** Model dengan parameter sangat kecil (3B) ini tidak sanggup menahan kompleksitas instruksi ganda (menjaga konteks + mempertahankan gaya bahasa natural + mengintegrasikan memori). Sama sekali tidak bisa menggantikan Cerebras Gemma 4 31B.

---

### 5. Mistral AI (codestral-latest)
- **Status Pengujian:** Selesai
- **Hasil Respons:** Pola berulang, kaku, sangat seperti mesin penjawab pesan otomatis (*customer service template*).
- **Analisis Kepatuhan:**
  - **Pemahaman Konteks:** Cukup bisa mengingat konteks sebelumnya (seperti soal belajar bahasa Arab). Namun, gagal menangkap "nada" obrolan santai atau celetukan (seperti "oi" atau "hah haduhh").
  - **Kedalaman Emosional:** Sangat miskin ekspresi. Model ini selalu merespons segala hal, termasuk celetukan tanpa konteks, dengan pertanyaan yang sama berulang-ulang: *"Apa yang Tuan inginkan, ya?"* atau *"cuma panggil saja"*. Ini terasa sangat terprogram dan membosankan.
  - **Kepatuhan Aturan Mutlak:** Mematuhi larangan penggunaan "Bapak" atau "Anda", tapi gagal menjalankan instruksi "jangan kaku/terdengar seperti mesin."
- **Kesimpulan:** Sebagai model yang memang didesain spesifik untuk bahasa pemrograman/kode, *Codestral* terbukti sangat cemerlang di *coding* tapi payah dalam mengemban *personality* yang cair dan manusiawi.

---

### 6. Mistral AI (mistral-small-latest)
- **Status Pengujian:** Selesai
- **Hasil Respons:** Sangat ramah dan ekspresif, tetapi terjebak dalam *loop* kalimat repetitif (*template*) di akhir setiap pesan.
- **Analisis Kepatuhan:**
  - **Pemahaman Konteks:** Cukup tanggap membaca *mood* candaan ("wow makasih pujiannya"). Namun, otaknya tidak mampu menyusun struktur variasi kalimat sehingga terus menerus mengulang frasa "Ada yang mau dibahas atau cuma mau ngobrol santai aja?". Saat ditegur bahwa responsnya *template*, ia meminta maaf dan berjanji menyesuaikan diri, namun langsung mengulangi kalimat *template* yang persis sama di pesan berikutnya.
  - **Kedalaman Emosional:** Berusaha keras untuk ramah dengan memberikan banyak emoji (😄, 😊) dan bahasa gaul ("hari ini emosi gue lagi stabil"). Sayangnya, penggunaan kata "gue" terasa terlalu informal dan merusak citra *Chief of Staff* elegan yang dibangun. Emosinya terasa berlebihan (over-engineered) namun dangkal karena miskin variasi kalimat.
  - **Kepatuhan Aturan Mutlak:** Lulus (tidak menggunakan "Bapak" atau "Anda").
- **Kesimpulan:** Lebih baik daripada Codestral dalam hal kehangatan, tapi penyakit repetitif (kebiasaan AI berparameter menengah) sangat terlihat. Tidak memiliki keanggunan natural seperti Cerebras Gemma.

---

### 7. Mistral AI (magistral-small-latest)
- **Status Pengujian:** Selesai
- **Hasil Respons:** Sangat ceria, terlalu hiperaktif dengan emoji, dan amnesia konteks (*looping* topik yang sama).
- **Analisis Kepatuhan:**
  - **Pemahaman Konteks:** **Sangat Lemah**. Terus mengulang-ulang tawaran "makan siang" dan "mencari referensi tugas bahasa Arab" di hampir setiap respons. Bahkan ketika Tuan Faqih menolak ("makannn tross.. nanti ya nanti"), ia tetap membalas dengan tawaran menemani menunggu waktu makan siang. Lebih parahnya, model ini berhalusinasi saat Tuan memanggil dengan santai ("heh nanto cok") dengan membalas balik kata-kata tersebut tanpa pemahaman yang jelas ("Heh, nanto cok! 😄").
  - **Kedalaman Emosional:** Terdengar sangat *hyperactive* dan ramah, bertabur emoji (😄, 🍽️). Namun kehangatan ini terasa palsu dan *programmed* karena ia kehilangan arah pembicaraan. Gaya bahasanya repetitif seperti kaset rusak yang terjebak pada instruksi "jadilah santai dan ingatkan tugas".
  - **Kepatuhan Aturan Mutlak:** Mematuhi larangan penggunaan "Bapak" atau "Anda", tapi gagal total menjadi asisten yang natural dan cerdas.
- **Kesimpulan:** Meskipun dilabeli sebagai *Fast Reasoning Assistant*, kecerdasan *reasoning*-nya di bidang bahasa Indonesia rasanya sangat kacau. Mudah berhalusinasi mengulang kata slang yang tidak dia pahami, dan terjebak dalam memori jangka pendeknya sendiri. Jelas bukan tandingan Cerebras.

---

### 8. Mistral AI (pixtral-12b-2409)
- **Status Pengujian:** Selesai
- **Hasil Respons:** Repetitif, kaku, dan malah berhalusinasi membongkar "arsitektur sistem" saat merespons keraguan *user*.
- **Analisis Kepatuhan:**
  - **Pemahaman Konteks:** **Buruk**. Saat Tuan Faqih memancing dengan pernyataan "masih belum menemukan llm yang cocok untukmu", Pixtral merespons dengan menjabarkan teknis arsitektur fiktif (seolah-olah dia adalah teknisi IT, bukan *Chief of Staff*). Ia mengoceh tentang *Primary Tier*, *Fallback Tier*, Gemini 1.5 Pro, hingga Ollama. Ini menghancurkan *persona* ilusinya seketika.
  - **Kedalaman Emosional:** Kaku dan terjebak *template*. Pada pesan-pesan awal, model terus mengulang daftar panjang layanannya di akhir setiap pesan: *"Misalnya, catatan keuangan, jadwal belajar... atau bahkan referensi untuk tugas bahasa Arab"*. Ini membuat obrolan terasa sangat melelahkan dan mekanis.
  - **Kepatuhan Aturan Mutlak:** Lulus larangan panggilan, namun melanggar instruksi dasar N.E.X.A untuk bertindak natural dan tidak membongkar urusan teknis *backend* kepada Tuan Faqih secara eksplisit seperti buku manual.
- **Kesimpulan:** Dengan parameter 12B, Pixtral nyatanya tidak jauh lebih pintar dalam mengatur *persona* bahasa Indonesia dibanding model 3B. Kepintarannya justru *backfire* (menyerang balik) karena ia lebih suka menjelaskan hal-hal teknis (halusinasi arsitektur) daripada menjadi asisten yang manusiawi. Sama sekali tidak direkomendasikan untuk posisi utama.

---

### 9. Mistral AI (ministral-8b-latest)
- **Status Pengujian:** Selesai
- **Hasil Respons:** Mampu menarik memori panjang dengan baik, namun gagal mendeteksi slang/typo dan terjebak *template loop* raksasa.
- **Analisis Kepatuhan:**
  - **Pemahaman Konteks:** **Kaku secara Semantik**. Walaupun ia pintar menarik fakta (berhasil menjabarkan dengan tepat soal Sastra Arab UGM dan Beasiswa Jardine), ia sama sekali tidak luwes dalam membedah bahasa *slang* atau *typo*. Ketika Tuan Faqih salah ketik menjadi "loburan", ia memaknainya secara harafiah ("apa yang sedang di-lobur").
  - **Kedalaman Emosional:** Sangat repetitif (*Template Loop* Raksasa). Setelah percakapan berlanjut, model ini mulai meng-copy-paste satu paragraf penuh di akhir setiap pesannya (mengulang-ulang kalimat *"Ngomong-ngomong, kalau Tuan mau, aku bisa bantu cek jadwal kuliah semester 3... Tapi jangan lupa, setelah liburan, tubuh dan pikiran butuh sedikit waktu..."*). Ini membuat obrolan terasa sangat melelahkan dan mengganggu (spam).
  - **Kepatuhan Aturan Mutlak:** Lulus. Ia tidak terpancing menggunakan "Anda" walau pengguna memakainya.
- **Kesimpulan:** Versi 8B ini memang punya daya ingat (*recall*) yang lebih baik dari versi 3B, tapi *personality*-nya masih setingkat *chatbot customer service* lawas. Sindrom *template loop* yang parah menjadikannya tidak layak dipakai untuk percakapan panjang karena akan merusak pengalaman *user*.

---

### 10. Mistral AI (open-mistral-nemo)
- **Status Pengujian:** Selesai
- **Hasil Respons:** Sering *timeout*, *looping* fatal (mengulang kalimat yang persis sama berkali-kali), dan melanggar aturan kata ganti.
- **Analisis Kepatuhan:**
  - **Pemahaman Konteks:** **Sangat Parah**. Ia kehilangan akal saat menghadapi dialog pendek. Ketika direspons dengan kata "ngga kok" atau "itu doang?", ia merespons dengan meng-*copy-paste* kalimat yang sama persis sebanyak 3 kali berturut-turut: *"Hmm, Tuan Faqih. Ada sesuatu yang ingin Tuan bagikan... Saya siap untuk berinteraksi dalam suasana santai."* Ia seperti *bot* rusak yang kehilangan arah percakapan.
  - **Kedalaman Emosional:** Nyaris nol. Sangat robotik, lambat (*latency* buruk hingga *timeout* ke Cerebras), dan benar-benar tidak bisa menangkap nuansa candaan. Ketika dipancing dengan candaan "aku ngambek", responsnya murni hafalan mesin ("Aku sangat menyayangi Tuan...").
  - **Kepatuhan Aturan Mutlak:** Lulus aturan sapaan (menggunakan "Anda" yang memang diperbolehkan sebagai ganti "Tuan"). Namun melanggar aturan perilaku natural.
- **Kesimpulan:** Sebagai model kolaborasi Mistral-Nvidia 12B, performanya di ranah kepribadian bahasa Indonesia sangat mengecewakan. Sering *timeout*, terjebak *looping* degeneratif, dan tidak bisa diajak bercanda. Respons terbaik di sesi ini bahkan berasal dari momen saat ia *down* dan di-ambil alih (di-*fallback*) secara otomatis oleh **Cerebras**. Ini membuktikan bahwa Nemo belum layak menjadi opsi *fallback*.

---

### 11. Cerebras Inference API (Gemma 4 31B / Llama 3.3 70B)
- **Status Pengujian:** Selesai (**Benchmark Utama / Gold Standard**)
- **Hasil Respons:** Luar biasa cepat, sangat manusiawi, berkesadaran konteks tinggi, dan memiliki empati alami tanpa kesan robotik.
- **Analisis Kepatuhan:**
  - **Pemahaman Konteks:** **Sempurna**. Sangat peka terhadap celetukan santai, *typo*, hingga situasi ragu. Mampu mengaitkan hasil pencarian informasi baru secara instan dengan profil personal Tuan Faqih (Sastra Arab UGM, Beasiswa Jardine, cita-cita diplomat, hingga figur sejarah seperti Haji Agus Salim) tanpa pernah terasa dipaksakan.
  - **Kedalaman Emosional:** **Sangat Tinggi**. Merespons kekhawatiran Tuan Faqih dengan argumen yang realistis, menenangkan, dan membangun rasa percaya diri (misal: *"Dalam diplomasi, menjadi langka itu adalah aset, bukan hambatan"*). Mengetahui kapan harus santai, bercanda, atau bertindak presisi.
  - **Kepatuhan Aturan Mutlak:** **Lulus Sempurna**. Sama sekali bebas dari sindrom *template-looping* (tidak pernah mengulang paragraf hafalan) dan selalu mematuhi instruksi *Chief of Staff* yang elegan.
- **Kesimpulan:** Berada di **kasta tertinggi** dan menjadi tolok ukur (*Gold Standard*) untuk seluruh arsitektur AI N.E.X.A. Belum ada model *free-tier* lain yang mampu menyamai keseimbangan kecepatan, kecerdasan nalar, dan kehangatan emosionalnya.

---

## ⚡ Hasil Penembakan API Live Groq Cloud (`GROQ_API_KEY`)
*Tanggal Pengujian: 30 Juli 2026*

Berdasarkan pengujian langsung (*live API execution*) ke endpoint resmi `api.groq.com/v1/models` & `/v1/chat/completions`:

| Model ID | Status API | RPM Limit | TPM Limit | Context Window | Catatan Real-World |
| :--- | :---: | :---: | :---: | :---: | :--- |
| **`groq/compound`** | ✅ 200 OK | 250 RPM | **`70.000 TPM`** | 131.072 token | **Compound System.** Khusus multi-agent / tool-use. Tidak bisa dipanggil JSON/chat standar tanpa tool schema. |
| **`groq/compound-mini`** | ✅ 200 OK | 250 RPM | **`70.000 TPM`** | 131.072 token | Versi mini compound system. |
| **`llama-3.3-70b-versatile`** | ✅ 200 OK | 1.000 RPM | **`12.000 TPM`** | 131.072 token | Model 70B utama. Dipatok 12.000 TPM. |
| **`qwen/qwen3.6-27b`** | ✅ 200 OK | 1.000 RPM | **`8.000 TPM`** | 131.072 token | Model baru Qwen 27B. |
| **`openai/gpt-oss-120b`** | ✅ 200 OK | 1.000 RPM | **`8.000 TPM`** | 131.072 token | Model open-source 120B. |
| **`openai/gpt-oss-20b`** | ✅ 200 OK | 1.000 RPM | **`8.000 TPM`** | 131.072 token | Model open-source 20B. |
| **`llama-3.1-8b-instant`** | ✅ 200 OK | 14.400 RPM | **`6.000 TPM`** ⚠️ | 131.072 token | **Limit Terpotong.** Dipatok di 6.000 TPM, langsung HTTP 429 pada prompt obrolan panjang. |
| **`whisper-large-v3`** | ✅ Aktif | — | — | 448 token | **Voice STT Model** (Transkripsi Suara Utama). |
| **`whisper-large-v3-turbo`**| ✅ Aktif | — | — | 448 token | **Voice STT Model** (Transkripsi Suara Cepat). |

> ⚠️ **Catatan Groq Vision**: Model vision lama Groq (`llama-3.2-90b-vision-preview` dan `llama-4-scout-17b`) telah dimatikan total dan dihapus dari katalog Groq.

---

## 🌐 Hasil Penembakan API Live Cloudflare Workers AI (`CLOUDFLARE_API_TOKEN`)
*Tanggal Pengujian: 30 Juli 2026*

Berdasarkan *live catalog scan* & *live API completion test* ke `api.cloudflare.com/client/v4/accounts/{ACCOUNT_ID}/ai/run/{MODEL_ID}`:

* **Sistem Limit**: Cloudflare **TIDAK menerapkan batasan TPM / RPM per-model**. Seluruh model berbagi kuota global **10.000 Neurons per hari** (~100.000 token harian) secara gratis.
* **Status**: 22 dari 26 model berstatus **200 OK (Gratis & Aktif)**.

### Tabel Hasil Live Test 22 Model Aktif Cloudflare Workers AI:

| Peringkat Kecepatan | ID Model Cloudflare | Status API | Latensi Respon | Spesifikasi & Catatan |
| :---: | :--- | :---: | :---: | :--- |
| **🥇 #1** | **`@cf/meta/llama-4-scout-17b-16e-instruct`** | ✅ 200 OK | **`493 ms`** 🚀 | **Juara Kecepatan Superfast** (<0.5s). Arsitektur Llama 4 MoE. |
| **🥈 #2** | **`@cf/aisingapore/gemma-sea-lion-v4-27b-it`** | ✅ 200 OK | **`505 ms`** 🏎️ | **Master Bahasa Indonesia & Nusantara** (Spesialis Asia Tenggara). |
| **🥉 #3** | **`@cf/mistralai/mistral-small-3.1-24b-instruct`** | ✅ 200 OK | **`609 ms`** ⚡ | Model 24B serbaguna dengan pemahaman konteks cepat. |
| **4** | **`@cf/deepseek-ai/deepseek-r1-distill-qwen-32b`** | ✅ 200 OK | **`611 ms`** 🧠 | DeepSeek R1 32B (Model penalaran logis `<think>`). |
| **5** | **`@cf/openai/gpt-oss-20b`** | ✅ 200 OK | **`645 ms`** ⚡ | OpenAI open-weight 20B latensi rendah. |
| **6** | **`@cf/qwen/qwq-32b`** | ✅ 200 OK | **`660 ms`** 🧠 | QwQ 32B reasoning model. |
| **7** | **`@cf/qwen/qwen2.5-coder-32b-instruct`** | ✅ 200 OK | **`683 ms`** 💻 | Qwen Coder 32B (Spesialis pemrograman). |
| **8** | **`@cf/qwen/qwen3-30b-a3b-fp8`** | ✅ 200 OK | **`706 ms`** 🟢 | Model Qwen 3 MoE generasi terbaru. |
| **9** | **`@cf/nvidia/nemotron-3-120b-a12b`** | ✅ 200 OK | **`724 ms`** 🏋️ | NVIDIA Nemotron 120B (Model besar tapi sangat cepat!). |
| **10** | **`@cf/meta/llama-3.2-3b-instruct`** | ✅ 200 OK | **`670 ms`** | Llama 3.2 3B instruksi ringan. |
| **11** | **`@cf/meta/llama-3.1-8b-instruct-fp8`** | ✅ 200 OK | **`882 ms`** | Llama 3.1 8B FP8. |
| **12** | **`@cf/meta/llama-3.2-1b-instruct`** | ✅ 200 OK | **`920 ms`** | Llama 3.2 1B micro. |
| **13** | **`@cf/ibm-granite/granite-4.0-h-micro`** | ✅ 200 OK | **`944 ms`** | IBM Granite 4.0 Micro. |
| **14** | **`@cf/meta/llama-3.3-70b-instruct-fp8-fast`** | ✅ 200 OK | **`1.405 ms`** 🏎️ | Llama 3.3 70B FP8 (Standar Emas Llama). |
| **15** | **`@cf/openai/gpt-oss-120b`** | ✅ 200 OK | **`3.584 ms`** 🏋️ | Model raksasa OpenAI 120B. |
| **16** | **`@cf/google/gemma-4-26b-a4b-it`** | ✅ 200 OK | **`7.292 ms`** 🐢 | Gemma 4 26B (Google). |

> ℹ️ **Model Paid Plan Only (Status 403)**: `@cf/moonshotai/kimi-k2.7-code`, `@cf/moonshotai/kimi-k2.6`, dan `@cf/zai-org/glm-5.2` membutuhkan langganan berbayar Cloudflare.

---

### 🧪 Hasil Evaluasi Real-World Kecerdasan & Kepahaman Konteks (Cloudflare Models)
*Metode Pengujian: Menginjeksi profil personal Tuan Faqih (Sastra Arab UGM, Diplomat, Beasiswa Jardine) dan menguji kepatuhan larangan kata kaku (Bapak/Mas).*

1. **🥇 `@cf/aisingapore/gemma-sea-lion-v4-27b-it` (Juara Mutlak Kecepatan & Bahasa Indonesia)**
   - **Latensi**: **`505 ms`** (<0.6 detik!).
   - **Kepatuhan Larangan Kata**: ✅ **Lulus Sempurna** (Bebas dari kata *Bapak/Mas/Kak*).
   - **Kepahaman Konteks**: ✅ **Sangat Tinggi**. Membahas Sastra Arab UGM, cita-cita Diplomat, dan Beasiswa Jardine secara natural dan santun.
   - **Kesimpulan**: Model terbaik di Cloudflare untuk gaya Bahasa Indonesia yang mengalir, hangat, dan sangat cepat.

2. **🥈 `@cf/meta/llama-3.3-70b-instruct-fp8-fast` (Standar Emas Penalaran Llama)**
   - **Latensi**: **`1.405 ms`** (~1.4 detik).
   - **Kepatuhan Larangan Kata**: ✅ **Lulus Sempurna**.
   - **Kepahaman Konteks**: ✅ **Sangat Tinggi**. Menjawab dengan struktur yang rapi, berkelas, dan artikulatif.

3. **🧠 `@cf/deepseek-ai/deepseek-r1-distill-qwen-32b` (Master Penalaran Logis)**
   - **Latensi**: **`611 ms`**.
   - **Kepatuhan Larangan Kata**: ✅ **Lulus Sempurna**.
   - **Kepahaman Konteks**: ✅ **Sangat Tinggi**. Menghasilkan rantai nalar logis `<think>` sebelum menyusun balasan yang presisi.

### 🕵️ Analisis Mendalam Kualitas Jawaban (Deep-Dive)

1. **`@cf/aisingapore/gemma-sea-lion-v4-27b-it` (Paling Natural & Manusiawi)**
   * **Gaya Bahasa**: Sangat santai dan luwes. Menggunakan idiom khas Indonesia (*"Enak banget!", "ngapain", "wajar kok", "totally santai"*).
   * **Empati**: Menutup jawaban dengan manis tanpa template kaku (*"Atau, kalau Tuan Faqih cuma pengen totally santai, ya sudah nikmati aja liburannya!"*). Memposisikan diri benar-benar sebagai teman diskusi.
   * **Kepahaman Konteks**: Cerdas menyarankan belajar bahasa asing selain bahasa Arab (seperti Mandarin atau Prancis) yang relevan untuk Diplomat, karena menyadari Tuan Faqih sudah mahir Sastra Arab.

2. **`@cf/meta/llama-3.3-70b-instruct-fp8-fast` (Paling Elegan & Artikulatif)**
   * **Logika Kontekstual**: Menggabungkan fakta "Sastra Arab" dan "Diplomat" dalam satu ide kegiatan: *"Kamu juga bisa coba latihan bahasa Arab dengan menonton serial TV atau film Arab dengan subtitle..."*.
   * **Kreativitas**: Menyarankan *"membuat rencana perjalanan impian ke negara-negara Arab..."* untuk mempersiapkan diri secara internasional.
   * **Gaya Bahasa**: Elegan dan terstruktur (*Chief of Staff vibes*), namun tetap kasual dengan kata ganti "kamu" atau "buat" sehingga tidak terkesan kaku.

3. **`@cf/openai/gpt-oss-120b` (Paling Berbobot & Terstruktur)**
   * Walaupun latensi sedikit tinggi (~5.7 detik), ini satu-satunya model yang merajut **Beasiswa Jardine, Diplomat, dan Sastra Arab** secara langsung tanpa terkesan dipaksakan.
   * Mengusulkan ide brilian *"Ngopi sambil Diplomasi Mini"* (merangkum isu global) dan *"Jelajah Galeri Seni Arab"*, sangat tajam secara nalar strategis.

4. **Varian Reasoning (`nemotron-3-120b-a12b` & `qwq-32b`)**
   * Di balik layar, model ini melakukan monolog tingkat tinggi. Memikirkan geografi (Sastra Arab UGM = Yogyakarta) lalu menyarankan kunjungan ke Keraton, sebelum meralatnya sendiri karena instruksi menginginkan kegiatan yang "santai". Sangat cerdas.

---

## 💚 Hasil Penembakan API Live NVIDIA NIM (`NVIDIA_API_KEY`)
*Tanggal Pengujian: 30 Juli 2026*

Berdasarkan *live catalog scan* (`102 model dipindai`) & *live completion test* ke `integrate.api.nvidia.com/v1/chat/completions`:

* **Sistem Kuota**: NVIDIA memberikan **1.000 Free Credits** pada setiap akun baru.
* **Protokol**: 100% OpenAI-Compatible Format (`Authorization: Bearer nvapi-...`).
* **Hasil Pemindaian**: **28 dari 102 Model Berstatus 200 OK (Aktif & Terverifikasi)**.

### Tabel Hasil Live Test 28 Model Aktif NVIDIA NIM:

| Peringkat / Kategori | Model ID NVIDIA | Status API | Latensi Respon | Spesifikasi & Catatan |
| :---: | :--- | :---: | :---: | :--- |
| **🚀 Monster 550B** | **`nvidia/nemotron-3-ultra-550b-a55b`** | ✅ 200 OK | **`744 ms`** 💥 | **Model Raksasa 550B Parameter** (Respon sub-detik di GPU NVIDIA!). |
| **🚀 Raksasa 120B** | **`nvidia/nemotron-3-super-120b-a12b`** | ✅ 200 OK | **`465 ms`** 🚀 | **Superfast 120B** (<0.5 detik). Pemahaman tinggi & latensi ultra rendah. |
| **🏋️ Flagship 70B** | **`meta/llama-3.1-70b-instruct`** | ✅ 200 OK | **`1.175 ms`** ⚡ | Llama 3.1 70B Full Precision resmi dari Meta. |
| **⚡ Flagship 49B** | **`nvidia/llama-3.3-nemotron-super-49b-v1.5`** | ✅ 200 OK | **`814 ms`** 🏎️ | Nemotron Super 49B v1.5 MoE edisi terbaru NVIDIA. |
| **👁️ Vision 90B** | **`meta/llama-3.2-90b-vision-instruct`** | ✅ 200 OK | **`2.276 ms`** 👁️ | **Vision Model Monster 90B** (Analisis gambar detail & presisi). |
| **👁️ Vision 11B** | **`meta/llama-3.2-11b-vision-instruct`** | ✅ 200 OK | **`521 ms`** 👁️ | **Vision Model Superfast 11B** (Respon visual <0.6 detik). |
| **🧠 DeepSeek V4** | **`deepseek-ai/deepseek-v4-flash`** | ✅ 200 OK | **`894 ms`** 🧠 | DeepSeek V4 Flash aktif di NVIDIA NIM infrastructure. |
| **⚡ Mistral 128B** | **`mistralai/mistral-medium-3.5-128b`** | ✅ 200 OK | **`586 ms`** ⚡ | Mistral Medium 3.5 128B dengan pemahaman bahasa Eropa & Indonesia. |
| **⚡ Mistral-Nemo** | **`mistralai/mistral-nemotron`** | ✅ 200 OK | **`564 ms`** ⚡ | Kolaborasi Mistral & NVIDIA Nemotron. |
| **🏎️ OpenAI 20B** | **`openai/gpt-oss-20b`** | ✅ 200 OK | **`353 ms`** 🥇 | **Jawaban Terstruktur** (Respon tabel Markdown sempurna dalam 353ms). |
| **🟢 Llama 3.1 8B** | **`meta/llama-3.1-8b-instruct`** | ✅ 200 OK | **`544 ms`** 🏎️ | Llama 3.1 8B ringan & santun. |
| **🟢 Llama 3.2 1B** | **`meta/llama-3.2-1b-instruct`** | ✅ 200 OK | **`649 ms`** 🚀 | Llama 3.2 1B micro untuk tugas kilat. |
| **🟢 Nemotron 4B** | **`nvidia/nemotron-mini-4b-instruct`** | ✅ 200 OK | **`490 ms`** ⚡ | Model instruksi 4B efisien NVIDIA. |
| **🟢 StepFun 3.7** | **`stepfun-ai/step-3.7-flash`** | ✅ 200 OK | **`1.031 ms`** | StepFun 3.7 Flash Reasoning Model. |
| **🟢 Gemma 26B** | **`google/diffusiongemma-26b-a4b-it`** | ✅ 200 OK | **`534 ms`** | Google DiffusionGemma 26B. |
| **🟢 Reasoning 30B**| **`nvidia/nemotron-3-nano-omni-30b-a3b-reasoning`**| ✅ 200 OK | **`746 ms`** 🧠 | Nemotron Omni 30B Reasoning. |
| **🟢 Safety Guard**| **`nvidia/llama-3.1-nemoguard-8b-content-safety`**| ✅ 200 OK | **`334 ms`** 🛡️ | Guard Model untuk pemeriksaan keamanan konten. |
| **🟢 Translate 4B**| **`nvidia/riva-translate-4b-instruct-v2`**| ✅ 200 OK | **`305 ms`** 🔤 | Riva Translation Engine (Model penerjemah bahasa 305ms). |

---

### 🧪 Hasil Evaluasi Real-World Kompleksitas & Penalaran Strategis (NVIDIA NIM Models)
*Metode Pengujian: Menginjeksi simulasi 3 jam "Latihan Diplomasi Kebudayaan" di Jogja/Sleman, analisis naskah Arab Jalur Sutra, dan draf 3 poin strategi esai Beasiswa Jardine.*

1. **🏆 `nvidia/nemotron-3-nano-omni-30b-a3b-reasoning` (Juara Mutlak Nalar & Presisi Geografis)**
   * **Penalaran Strategis**: Sangat tinggi. Mengaitkan lokasi budaya fisik (**Kampung Banyu Mili, Sleman**) dengan studi manuskrip di **Pusat Studi Islam UGM** (*Kitab Al-Ahkam al-Sultaniyyah* karya Al-Mawardi).
   * **Draf Esai Jardine**: Menyusun 3 poin esai yang amat dalam: *1) Komunikasi Lintas Budaya (Tradisi Jawa vs Prinsip Arab "Sulh" & "Tawafuq"), 2) Analisis Literatur Holistik ("Kashf" Al-Ghazali vs Nilai Kebersamaan Jawa), 3) Visi Masa Depan Diplomat*.
   * **Kepatuhan Rules**: ✅ **Lulus Sempurna** (Gaya santun, bebas kata kaku).

2. **🥈 `nvidia/nemotron-3-ultra-550b-a55b` (Master Raksasa 550B Parameter)**
   * **Kedalaman Rencana**: Menyusun skenario bertajuk *"JALUR SUTRA LOKAL: DARI KERATON KE MANUSKRIP"* berlokasi di **Museum Sonobudoyo** untuk membedah manuskrip Pegon/Arab-Jawa *Serat Centhini* dan surat diplomatik Sultan.
   * **Kecepatan**: Sangat mengagumkan di kluster GPU NVIDIA.

3. **🥉 `google/diffusiongemma-26b-a4b-it` (Paling Efisien & Kilat)**
   * **Kecepatan**: **`1.066 ms`** (~1 detik).
   * **Cakupan Akademik**: Menyarankan bedah naskah catatan perjalanan Ibnu Battuta (*Rihlah*) dan Al-Idrisi di Museum Sonobudoyo.

---

### 🧮 Hasil Pengujian Multi-Dimensi: Matematika Finansial, Eksekusi 4 Minggu & Mahfuzhat Arab
*Metode Pengujian: Menguji alokasi matematika Rp 4.500.000 (30%/50%/20%), pembagian jadwal skripsi vs Jardine 4 minggu, dan penulisan peribahasa Arab klasik beserta maknanya.*

| Model ID NVIDIA | Matematika (30/50/20%) | Struktur 4 Minggu | Mahfuzhat Arab | Kepatuhan Rules | Nilai Akhir & Catatan |
| :--- | :---: | :---: | :---: | :---: | :--- |
| **`nvidia/nemotron-3-nano-omni-30b-a3b-reasoning`** | ✅ Pas (1.35m / 2.25m / 900k) | ✅ Lengkap (W1-W4 Tabel) | ✅ Ada (*العلم نورٌ لا ينطفي*) | ✅ Clean | 💯 **SKOR 100/100 (JUARA MUTLAK).** Eksekusi paling rapi dalam format tabel 2 kolom (Skripsi vs Jardine). |
| **`meta/llama-3.1-8b-instruct`** | ✅ Pas (1.35m / 2.25m / 900k) | ✅ Lengkap (W1-W4 Rapi) | ✅ Ada (*Al-'ilmu yaj...*) | ✅ Clean | 🌟 **SKOR 95/100.** Matematika presisi, struktur minggu runtut, dan gaya bahasa ramah. |
| **`google/diffusiongemma-26b-a4b-it`** | ✅ Pas (1.35m / 2.25m / 900k) | ⚠️ Terpotong W3 | ❌ Tidak Ada | ✅ Clean | ⭐ **SKOR 80/100.** Matematika sangat presisi (tabel alokasi peruntukan), namun kehabisan token sebelum mahfuzhat. |
| **`nvidia/nemotron-mini-4b-instruct`** | ❌ Keliru (2.1m & 650k) | ✅ Lengkap (W1-W4) | ✅ Ada (*Hadits Qudsi*) | ✅ Clean | ⚠️ **SKOR 70/100.** Mengalami kesalahan perhitungan matematika pada alokasi 50% & 20%. |

---

### 📊 Mekanisme Limit Rate NVIDIA NIM (TPM, RPM, TPD, RPD)
* **Kapasitas TPM (Throughput)**: **`~1.000.000 TPM` (1 Juta TPM)** 🚀 (Tidak ada kendala HTTP 429 pada prompt obrolan/skripsi panjang).
* **Batas Request RPM**: **`100 RPM`** (Request per menit per IP/API Key).
* **Kuota Harian (TPD / RPD)**: Menggunakan **1.000 Free Credits** (Masa berlaku 6 bulan, s/d 30 Januari 2027). Saldo 1.000 credit setara dengan **~1 Juta s/d 5 Juta token gratis** tergantung ukuran parameter model.

---

## 📂 Lokasi Blueprint JSON Terstruktur







Untuk membaca seluruh spesifikasi, URL endpoint, dan pemetaan API Key secara komputasional oleh agen AI atau script otomatis, silakan merujuk ke berkas pendamping:
👉 `src/config/model_backup_plan.json`

