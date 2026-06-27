# N.E.X.A Whitepaper: Comprehensive System Book

Dokumen ini adalah cetak biru (blueprint) dari "Buku Putih N.E.X.A". Kerangka ini dirancang secara berjenjang—mulai dari landasan filosofis, gambaran arsitektur level tinggi, hingga ke penyelaman teknis terdalam di tingkat kode (source code).

---

## BAB 1: FILOSOFI & FONDASI SISTEM
Bab ini menjelaskan **"Mengapa"** N.E.X.A eksis, mencakup latar belakang kebutuhan, target jangka panjang pengguna, dan definisi operasionalnya sebagai Chief of Staff digital.
*   **1.1 Latar Belakang & Rasionalisasi:** Kebutuhan menggantikan *willpower* manual demi fokus akademik dan diplomasi.
*   **1.2 Visi & Misi:** Otomasi *set-and-forget* (jangka pendek) dan pemandu karier diplomasi (jangka panjang).
*   **1.3 Profil Pengguna Eksekutif:** Penjelasan tentang otorisasi eksklusif (Tuan Faqih) dan batasan privasi.
*   **1.4 Paradigma *Chief of Staff* Digital:** Pergeseran dari interaksi chatbot pasif menjadi sistem otonom proaktif.

## BAB 2: ARSITEKTUR MAKRO & TOPOLOGI SISTEM
Bab ini memaparkan **"Di Mana"** sistem beroperasi dan bagaimana setiap *node* saling berkomunikasi, serta protokol penjaga kelangsungannya.
*   **2.1 Infrastruktur Komputasi Utama:** N.E.X.A Core Server (Node.js 20, Express, Hugging Face Docker Space).
*   **2.2 Antarmuka Web Visual:** Arsitektur Dasbor Nexa Finance Web (Next.js/React).
*   **2.3 Peta Interkoneksi Lintas Platform:** Diagram data flow antara Telegram, Supabase, dan Ekosistem Google.
*   **2.4 *Immortality Protocol v3.0*:** Mekanisme anti-downtime, *Watchdog recovery*, dan pencegahan *TLS disconnects*.

## BAB 3: KOGNISI AI & UNIVERSAL STATE MACHINE
Bab ini membedah **"Bagaimana Otak N.E.X.A Berpikir"**, menganalisis alur masuk data dari mentah hingga menjadi tindakan tereksekusi.
*   **3.1 Siklus Universal (5 Tahap Utama):** *Trigger* $\rightarrow$ *Auth* $\rightarrow$ *Cognitive Routing* $\rightarrow$ *Targeted Execution* $\rightarrow$ *Feedback*.
*   **3.2 *AI Router & Cognitive Parser*:** Teknik parsing JSON berbasis instruksi ketat dan pemetaan *Intent* biner maupun semantik.
*   **3.3 *Heuristic Sentiment Detection* & Injeksi Fakta:** Deteksi otomatis emosi teks (STRESSED/CASUAL) *zero-latency* dan Fusi Lintas Domain (Cross-Domain Context).
*   **3.4 *Multi-Tier Fallback System*:** Manajemen krisis dan *failover* API berlapis (Gemini $\rightarrow$ Groq Llama $\rightarrow$ Emergency Dumb Mode).

## BAB 4: THE OMNICHANNEL FINANCE ENGINE (OTAK KEUANGAN)
Membedah salah satu subsistem tergila di N.E.X.A, yang memfasilitasi pencatatan uang otonom dan manual.
*   **4.1 Arsitektur Input Lintas Saluran:** Pemicu dari Telegram teks, *Voice Notes*, Ekstraksi Struk (*Vision*), hingga Polling M-Banking otomatis (Gmail API).
*   **4.2 Pemrosesan & *Smart Categorization*:** Cara algoritma menentukan kategori secara semantik (Objek vs Kata Permukaan).
*   **4.3 *Zero-Duplication Engine*:** Pembuatan *Composite Key* dan sistem interseptor deduplikasi transaksi berulang.
*   **4.4 Resolusi Asinkron & Jendela 5-Menit:** Cara sistem mengelola interaksi konfirmasi parsial, menyimpan ke RAM, Supabase, hingga Google Sheets.
*   **4.5 *Budget Engine*:** Deteksi pengeluaran melampaui batas dan perhitungan analitik Dasbor (*Savings Rate*, Rata-rata Harian).

## BAB 5: MANAJEMEN WAKTU & ORKESTRASI PRODUKTIVITAS
Sistem pendelegasian kalender, tugas, dan sinkronisasi lintas perangkat (Google Calendar & Google Tasks).
*   **5.1 *Agenda Manager* & Resolusi Konflik:** Parsing durasi teks natural (*Fast Regex* + AI) dan manajemen tumpang-tindih kalender.
*   **5.2 *Task Manager* & Prioritisasi:** Mekanisme *Two-Way Sync*, pewarnaan status tugas, dan parallel sync ke Notion.
*   **5.3 *Autonomous Time-Blocking*:** Algoritma N.E.X.A mencari slot waktu kosong untuk menempatkan blok fokus secara otomatis berdasarkan *due date* tugas.
*   **5.4 Mesin Prediksi Konteks:** Bagaimana acara jadwal dapat memunculkan saran dokumen Vault atau memori catatan yang relevan secara otomatis.

## BAB 6: MEMORI ORGANIK & KESADARAN KONTEKSTUAL
Bagaimana N.E.X.A berevolusi seiring waktu tanpa kehilangan ingatan, berbeda dengan chatbot sesi tunggal.
*   **6.1 Hierarki Penyimpanan Jangka Panjang:** Perbedaan antara Riwayat Obrolan, *Core Identity*, *User Profile*, dan *2nd Brain Vault*.
*   **6.2 *Daily Memory Consolidation v2*:** *Cron job* yang bekerja setiap tengah malam mengekstrak *Personal Facts* baru tanpa membuat duplikat semantik.
*   **6.3 Ekstraksi Metadata Vault 5-Lapis:** Alur data unggahan gambar $\rightarrow$ Identifikasi Multimodal Direct JSON $\rightarrow$ Simpanan *Google Drive* $\rightarrow$ Indeks Supabase.

## BAB 7: THE PULSE ENGINE (RUTINITAS CRON PROAKTIF)
Bagaimana N.E.X.A yang menyapa pengguna, bukan sebaliknya.
*   **7.1 Sapaan Siklus Harian:** *Morning Briefing* (05:30), *Midday Pulse* (12:00), *Evening Debrief* (17:00), *Tomorrow Prep* (21:00).
*   **7.2 *Proximity Alerts* & *Watchdog Patrols*:** Patroli pemantauan transaksi *pending* 90 detik, dan peringatan 30 menit pralaga acara.

## BAB 8: JARINGAN, KEAMANAN, & MANAJEMEN DEPLOYMENT
Penyelaman teknis ke level server (DevOps & Networking).
*   **8.1 *Zero-Outbound Telegram Bypass*:** Penjelasan *hack* HTTP respons `webhook.js` dan Cloudflare Relay untuk mengatasi larangan Hugging Face Docker.
*   **8.2 Postur Keamanan & Isolasi Data:** *Telegram Identity Lock*, HMAC / *Bearer Token Webhook*, dan *Zero-Password OAuth2*.
*   **8.3 Manajemen Variabel & Panduan Peluncuran:** Pemetaan *Environment Variables* (.env) yang diperlukan dan tata cara *deploy*.

## BAB 9: PETA KODE (CODEBASE MAPPING) & PANDUAN PENGEMBANGAN
Dokumentasi tata letak folder bagi developer atau instruksi perbaikan teknis.
*   **9.1 Anatomi Root & `src/`:** Direktori `core/`, `domain/`, `infrastructure/`, `interfaces/`, dan `utils/`.
*   **9.2 Alur Modifikasi Fitur:** Panduan menyuntikkan subsistem bisnis baru di `src/domain/` tanpa merusak *Universal State Machine*.
