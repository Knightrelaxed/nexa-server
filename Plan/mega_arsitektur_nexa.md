# N.E.X.A Mega Architecture (Nexa Engine for eXecutive Assistance)
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
     - **Multi-Tier Fallback Engine:** N.E.X.A memiliki 5 lapis kunci API (4 kunci Groq LLaMA-3, 1 kunci Gemini 2.5 Flash). Jika kunci 1 terkena *Rate Limit* atau *Error 413 (Payload Too Large)*, sistem akan otomatis turun ke kunci 2, 3, 4, hingga 5 tanpa disadari oleh *user*.
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
> [!TIP]
> **Skalabilitas:** Karena arsitektur ini murni *modular*, Tuan Faqih bisa menambahkan domain baru kapan saja (misalnya: `SmartHome_Engine.js` atau `Crypto_Engine.js`) tanpa perlu mengubah `AI_Router` atau `webhook.js` secara drastis!
