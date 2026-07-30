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

## 📂 Lokasi Blueprint JSON Terstruktur
Untuk membaca seluruh spesifikasi, URL endpoint, dan pemetaan API Key secara komputasional oleh agen AI atau script otomatis, silakan merujuk ke berkas pendamping:
👉 `src/config/model_backup_plan.json`

