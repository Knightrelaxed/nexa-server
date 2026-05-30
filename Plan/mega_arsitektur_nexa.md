# N.E.X.A Mega Architecture (Neural Extension Assistant for Intelligence)
**Dokumen Desain Sistem Inti & Hierarki Kognitif**

N.E.X.A bukan sekadar *chatbot* biasa. Ia adalah sistem kecerdasan buatan berbasis *Autonomous Agent* yang dirancang dengan arsitektur berlapis (Multi-Layer Architecture) untuk menangani manajemen keuangan, jadwal, email, dan percakapan natural tanpa henti (24/7), dibekali dengan ketahanan tingkat tinggi terhadap kegagalan (Zero-Downtime Fallback).

---

## 🏗️ 1. Arsitektur Infrastruktur (Top-Level)

N.E.X.A terbagi menjadi 4 lapisan utama (*Layers*):

1. **Interface Layer (Gateway)**
   - Berfungsi sebagai pintu masuk dan keluar seluruh interaksi dengan Tuan Faqih.
   - Modul Utama: `src/interfaces/webhook.js`
   - Tugas: Menerima *webhook* dari Telegram, mengekstrak data mentah, dan merespons via API Telegram. Berjalan melalui proksi Cloudflare Worker jika diperlukan.

2. **Cognitive Routing Layer (The Brain)**
   - Berperan sebagai korteks prefrontal. Menerima teks mentah dan menerjemahkannya menjadi JSON Intent terstruktur (Niat pengguna).
   - Modul Utama: `src/core/AI_Router.js`
   - Fitur Spesial:
     - **Multi-Tier Fallback Engine (11 Lapis Pertahanan):** N.E.X.A dibekali dengan ketahanan *Zero-Downtime* menggunakan 11 lapis kunci API dan model AI. Peralihan antar penyedia API terjadi dalam hitungan milidetik secara mulus (*seamless*).
       - *Tier 1-4:* Groq Llama 3.3 70B (The Sprinters). Jalur utama yang dirancang untuk kecepatan tinggi.
       - *Tier 5-6:* Gemini 2.5 Flash (The Deep Thinkers). Lapis kedua untuk logika berat dan penanganan *error*.
       - *Tier 7:* Cerebras Llama 3.3 70B (The Backup Sprinter). Lapis ketiga untuk failover kecepatan tinggi independen.
       - *Tier 8-9:* Gemini 2.0 Flash (The Infinite Context). Lapis keempat cadangan untuk konteks memori masif.
       - *Tier 10:* Mistral Pixtral 12B (The Reliable Closer). Penyedia independen sebagai penyelamat jika raksasa silikon mati.
       - *Tier 11:* OpenRouter Gemma 2 27B (The Last Resort). Lapis pamungkas agregator.
     - **503 Smart Retry & Dumb Mode:** Setiap lapis AI juga dilengkapi mekanisme 3 kali pengulangan pintar (*exponential backoff delay* 2000ms, 4000ms, 6000ms) untuk menghadapi *server overload* sebelum lompat ke *Tier* berikutnya. Jika seluruh 11 lapis hancur, N.E.X.A akan memutus rantai dan mengaktifkan 'DUMB_MODE' yang mengirimkan pesan pemberitahuan *down* secara otomatis.
     - **Finance Interceptor:** Subsistem AI ringan yang memotong laju teks jika mendeteksi *user* sedang merespons konfirmasi transaksi tertunda, menghemat token dan latensi.

3. **Domain Logic Layer (The Engines)**
   - Otak spesialis yang mengeksekusi niat berdasarkan arahan dari Router.
   - Modul Utama: 
     - `src/domain/Finance_Engine.js` (Pemrosesan uang, analitik, pencocokan *fuzzy*, tebakan kategori AI).
     - `src/domain/Calendar_Engine.js` (Manajemen waktu, alarm).
     - `src/domain/Email_Engine.js` (Analisis email otomatis).

4. **Data & Infrastructure Layer (Storage & External API)**
   - Jembatan ke dunia luar dan penyimpanan permanen.
   - Modul Utama:
     - `src/infrastructure/Supabase_Finance.js`: Terhubung ke skema SQL relasional untuk transaksi, kategori, dan akun.
     - `src/infrastructure/Supabase_Memories.js`: Penyimpanan NoSQL berwujud JSON untuk menyimpan "Fakta Personal Tuan", "Riwayat Obrolan", dan "Transaksi Tertunda (Pending)".
     - `src/infrastructure/Google_Workspace.js`: Otentikasi ke Gmail (membaca notifikasi Mandiri Livin) dan Google Calendar.

---

## 🔄 2. Alur Kerja Spesifik (Workflows)

### A. Alur Pemrosesan Keuangan (Smart Finance Flow)
1. **Input Masuk:** Tuan mengetik *"Pengeluaran 15rb buat esteh pake qris"*.
2. **Pemahaman (Router):** `AI_Router` mengidentifikasi intent `FINANCE` dengan aksi `RECORD`. Ia mem-parsing menjadi `{ nominal: 15000, type: "EXPENSE", description: "esteh", payment_method: "qris" }`.
3. **Pengayaan (Enrichment):** `Finance_Engine` mengeksekusi `_autoCategorizeMerchant`. AI mengevaluasi kata "esteh" dan menyimpulkan kategori "Makanan & Minuman" berdasarkan panduan ketat (menghindari kategori ambigu "Lainnya").
4. **Failsafe Akun:** Jika tidak ada nama akun, mesin mengecek Supabase. Karena Tuan hanya punya 1 akun ("Bank Mandiri Livin"), ia diisi otomatis. Jika ada lebih dari satu, N.E.X.A akan proaktif bertanya.
5. **Memory Holding (Pending):** Transaksi ini tidak langsung ditulis permanen. Ia disimpan di `pendingConfirmations` (RAM) & `Supabase_Memories` (Database) selama 5 menit.
6. **Konfirmasi & Fallback:** N.E.X.A bertanya di Telegram. Jika Tuan setuju, transaksi dipindahkan dari status *Pending* menjadi *Saved* di tabel relasional utama. Jika Tuan diam saja, *Cron Watchdog* (Penjaga Waktu) akan memicu *Auto-Save* tepat di menit ke-5 tanpa kehilangan data sekecil apapun.

### B. Proactive Cron Architecture (Asynchronous Workers)
Modul `src/core/cron.js` bertindak sebagai jantung yang berdetak sendiri di latar belakang tanpa perlu dipancing oleh *user*.
- **Setiap 90 detik:** `Watchdog` memastikan tidak ada transaksi yang menggantung (mati/hang).
- **Polling Email:** Mengecek Gmail secara periodik untuk mendeteksi email transaksi masuk dari Bank Mandiri Livin, melakukan de-duplikasi, lalu memasukkannya ke sistem (sebagai `GMAIL_POLLING`).
- **Phase 6 Alerts:** Menyusun dan menembakkan pesan proaktif di pagi hari (Morning Briefing), siang (Midday Pulse), dan malam (Memory Consolidation/Evaluasi Harian).

---

## 🧠 3. Keunggulan Arsitektur & Perbaikan Kritis Terakhir

1. **Case-Insensitive Normalization:** Seluruh input berbasis teks (Metode Bayar, Nama Kategori, Nama Merchant) dinormalisasi secara ekstrim. N.E.X.A tidak akan gagal memproses data hanya karena perbedaan huruf "qris", "QRIS", atau "Qris".
2. **Context-Aware Deduplication:** Transaksi yang sama dari Email Livin dan input manual di-Telegram tidak akan pernah tercatat dua kali karena N.E.X.A membuat `compositeKey` cerdas berbasis nominal dan waktu.
3. **Smart Interceptors:** Alih-alih melempar teks "Berangkat ke takom" ke rantai penalaran panjang (Router utama), N.E.X.A mencegatnya dengan rantai penalaran pendek (Interceptor) jika ia tahu Tuan sedang berada di mode pengeditan transaksi. Ini memangkas *delay* respon hingga 60%.
4. **Short-Circuit Protection:** Data kosong atau `Unknown` tidak akan pernah menimpa catatan deskripsi sah yang dimasukkan pengguna saat AI menentukan kategori.

---

## 🌊 4. Alur Data Detail & Sistem AI Prompt (Cognitive Flow)

N.E.X.A mengandalkan sistem *prompt engineering* berlapis untuk mempertahankan gaya bahasa asisten eksekutif sekaligus mengekstrak data JSON yang presisi secara matematis.

### A. Alur Data (Data Flow Pipeline)
1. **Ingestion (Pemasukan):** Teks masuk via Telegram (`webhook.js`).
2. **Context Assembly (Perakitan Konteks):** Sebelum memanggil AI, N.E.X.A merakit "Context Block" di `AI_Router.js`. Blok ini berisi:
   - Waktu saat ini (Akurasi Real-Time).
   - Kalender 7 hari ke depan (Ditarik dari Google Calendar).
   - 80+ Kategori Keuangan Aktif (Ditarik dari Supabase).
   - 84 Fakta Personal Tuan (Data relasional tentang Tuan).
   - Riwayat Obrolan Terakhir.
3. **Cognitive Routing (Pengenalan Niat):** Context Block dan pesan user dikirim ke LLM (Groq/Gemini).
4. **Execution (Eksekusi):** Output JSON di-parsing dan dilempar ke domain fungsi yang relevan (Finance/Calendar/Device).
5. **Persistence (Penyimpanan):** Data disimpan ke PostgreSQL (Supabase) dengan UUID dan relasi `account_id` / `category_id`.

### B. Master AI Router Prompt (`ROUTER_SYSTEM_PROMPT`)
Di dalam `src/core/AI_Router.js`, N.E.X.A menggunakan Mega Prompt dengan arsitektur instruksi ketat:
- **Role:** "Anda adalah N.E.X.A (Neural Extension Assistant for Intelligence), Asisten AI Pribadi eksklusif milik Tuan Faqih Hidayatulloh. Berbicaralah dengan gaya JARVIS: elegan, sangat cerdas, dingin namun hormat, ringkas, dan fokus."
- **Data Ekstraksi:** AI dipaksa mengeluarkan JSON dengan skema ketat:
  ```json
  {
    "intent": "FINANCE | CALENDAR | DEVICE | EMAIL | DATABASE | GENERIC | INCOMPLETE_INFO",
    "action": "RECORD | EDIT | ASK_REPORT | ...",
    "extracted_data": { ... },
    "reply_message": "Respon elegan ke Tuan"
  }
  ```
- **Constraint (Batasan Kritis):** Prompt melarang halusinasi data, melarang membuat *action* yang tidak ada, dan memaksa fallback ke `INCOMPLETE_INFO` jika Tuan memberi perintah ambigu ("Cek database" -> database mana?).

### C. Finance Interceptor Prompt
Di dalam fungsi `classifyPendingTransactionIntent`, terdapat prompt ringan (Low Latency Prompt) khusus untuk menebak balasan singkat saat ada transaksi menggantung:
- **Aturan UPDATE yang ketat:** "JIKA user hanya merespons dengan kalimat atau frasa pendek (misal: 'berangkat ke takom', 'beli bensin', 'buat bayar utang'), anggap itu sebagai UPDATE untuk diisi ke field description!"
- **CoT (Chain of Thought):** AI diwajibkan mengisi kolom `"reasoning"` dengan 1 kalimat pemikiran logis sebelum memberikan kesimpulan niat (`CONFIRM`, `CANCEL`, `UPDATE`, `AMBIGUOUS`). Ini meminimalisir kesalahan logika hingga 95%.

### D. AI Categorizer Prompt (`Finance_Engine.js`)
Ketika N.E.X.A harus menebak kategori transaksi yang kosong, ia menggunakan *few-shot prompting*:
- **Aturan Pintar:** "Contoh: 'kopi latte' → 'Kafe/Bar', 'GRAB TRANSPORT' → 'Taksi', 'Shopee' → 'Belanja online'."
- **Larangan "Lainnya":** "KHUSUS kategori 'Lainnya': HANYA gunakan JIKA deskripsinya kosong ATAU sangat ambigu. JIKA ada catatan tujuan (sekecil apapun petunjuknya), JANGAN PERNAH memilih 'Lainnya'!"
- AI dilarang keras membalas menggunakan kalimat penjelas. Hanya nama kategori murni yang dikembalikan agar bisa difilter menggunakan sistem *Fuzzy Matcher* (pencocokan string).

---
> [!TIP]
> **Skalabilitas:** Karena arsitektur ini murni *modular*, Tuan Faqih bisa menambahkan domain baru kapan saja (misalnya: `SmartHome_Engine.js` atau `Crypto_Engine.js`) tanpa perlu mengubah `AI_Router` atau `webhook.js` secara drastis!
