## ARSITEKTUR SISTEM  
_(System Architecture)_

Sistem N.E.X.A dibangun di atas arsitektur _Cloud-Native_ tersentralisasi dengan pendekatan _Event-Driven_ (Berbasis Kejadian). Sistem tidak bergerak dalam satu jalur linier, melainkan merespons berbagai _trigger_ dari berbagai _node_ secara asinkron.

### Topologi Jaringan & Aliran Data (The N.E.X.A Lifecycle)

Aliran data dalam N.E.X.A beroperasi melalui siklus 4 fase yang terjadi dalam hitungan milidetik:

1.  **Phase 1: Ingestion & Sensory (Penangkapan Data)**

Sistem menerima stimulus dari lingkungan luar. Ini bisa berupa _Push Event_ aktif (Notifikasi QRIS yang ditangkap Tasker, _Voice Note_ atau perintah via Telegram, Perubahan Google Calendar) atau hasil _Polling/Cron_ pasif (Pengecekan Gmail API, _Scraping News/Lomba_ di pagi hari).

1.  **Phase 2: Contextual Retrieval (Pemanggilan Memori)**

Sebelum merespons, _Server_ bertindak sebagai penengah yang mengambil profil identitas pengguna, status jadwal saat ini, dan 10-20 gelembung riwayat _chat_ dari Supabase untuk membentuk "Konteks Kesadaran" (_State Awareness_).

1.  **Phase 3: Cognitive Processing (Analisis Otak Utama)**

Data mentah beserta konteksnya disuntikkan ke Cognitive Layer (**Groq Whisper API** untuk audio dan **Gemini 2.5 Flash** via Google AI Studio untuk teks). Di sini terjadi proses identifikasi niat (Intent Extraction), NLP (Natural Language Processing), dan penentuan fungsi (Function Calling/Routing)

1.  **Phase 4: Orchestration & Actuation (Eksekusi & Orkes)**

_Server_ menerima instruksi matang dari AI dan mendistribusikan tindakan ke _node_ yang sesuai—menulis baris baru di Google Sheets, memodifikasi Google Calendar, membalas _chat_ di Telegram, atau menembakkan perintah _God Mode_ (Kill Switch) kembali ke OS Android.

### Komponen Utama Berdasarkan Domain (Core Domains)

Arsitektur N.E.X.A dibagi menjadi 5 domain independen yang saling berkomunikasi melalui _API Endpoint_:

*   1.  **Sensory & Interface Domain (Mata, Telinga, & Antarmuka)**
*   **Telegram Bot API:** _Command Center_ utama pengguna. Berfungsi ganda sebagai input (_teks/audio_) dan _dashboard_ output interaktif.
*   **Tasker (Android OS):** Agen telemetri dan kaki tangan di lapangan. Bertugas melakukan intersepsi notifikasi UI sistem (Livin by Mandiri, dan notifikasi aplikasi lainnya) dan memonitor aktivitas tingkat OS (_Screen-time tracker_), serta melakukan berbagai pergerakan dan task di android.
*   **Background Scrapers, Calender API & Gmail API:** Sensor pasif yang beroperasi di latar belakang untuk memindai email perbankan dan menyedot data dari sumber web (peluang akademik/berita).
    1.  **Orchestration & Gateway Domain (Sistem Saraf Pusat)**
*   **Koyeb Node.js Engine (Server):** Otak orkestrasi yang menyala 24/7 di region Singapura (_low-latency_). Berfungsi sebagai penerima _Webhook_, pengelola antrean data, dan rumah bagi _Universal Router_ yang menghubungkan semua API pihak ketiga.
*   **Cron Scheduler:** Mesin penggerak internal di server untuk mengeksekusi tugas **berbasis** waktu (contoh: _Morning Briefing_ pukul 05:30 WIB).
    1.  **Cognitive Domain (Otak Logika)**
*   **Gemini 2.5 Flash (Primary Cognitive Core):** Mesin _Natural Language Processing_ tingkat dewa via Google AI Studio (Free Tier). Bertugas sebagai Dirigen _Universal Router_.
*   **Groq Whisper Large v3 (Transcription Engine):** Mesin _Speech-to-Text_ super cepat bertenaga LPU (100% Gratis) untuk mengubah audio komando menjadi teks presisi tinggi.
    1.  **State & Memory Domain (Pusat Ingatan & Basis Data)**
*   **Supabase**: Database relasional yang menyimpan "Jiwa" N.E.X.A, berisi profil Tuan pengguna, konfigurasi perilaku bot, dan rekam jejak obrolan untuk menjaga persistensi memori. Dan hal terkait database dan lainnya.
*   **Google Calendar API**: Basis data temporal (waktu). Menyimpan state agenda, jadwal, dan tenggat waktu secara dinamis.
*   **Google Sheets API:** Basis data ledger (buku besar). Sebagai repositori catatan finansial terstruktur dan penyedia visualisasi (_dashboard_) anggaran.
    1.  **Actuation & Enforcement Domain (Tangan Eksekutor)**
*   **Tasker (God Mode / Kill Switch):** Bertindak sebagai algojo kedisiplinan. Menerima _Webhook_ dari Koyeb untuk melakukan intervensi tingkat root/system pada Android (memutus WiFi/Data, memaksa Kembali kelayar utama, dan bahkan me-.lock layar). Mengeksekusi intervensi OS Android (Redmi 9C MIUI) tanpa root menggunakan izin tingkat sistem via eksekusi ADB WRITE\_SECURE\_SETTINGS (untuk memutus WiFi/Data) dan akses Device Admin (untuk mengunci layar secara absolut).
*   **Telegram & Calendar Actuators:** Modul yang melakukan mutasi data secara aktif, seperti mengirim peringatan eskalatif atau menghapus/menggeser jadwal secara mandiri.

## FITUR DAN FUNGSI  
_(Features & Functions)_

Sebagai _Universal Assistant_, kapasitas N.E.X.A dibagi ke dalam 4 domain utama operasional yang mencakup seluruh manajemen hidup pengguna:

### Domain Manajemen Finansial (Financial Intelligence)

1.  **Dual-Channel Finance Auto-Track (Deduplication Engine)**

*   **Deskripsi:** Sistem pembukuan pengeluaran ganda tingkat lanjut yang memastikan tidak ada data _double_ (_zero-duplication_).
*   **Cara Penggunaan/Trigger:** Berjalan senyap di latar belakang. Terpicu otomatis saat Tasker menangkap notifikasi Livin by Mandiri di HP, DAN ATAU saat _Cron Job_ di Koyeb menarik data _email_ struk via Gmail API. N.E.X.A akan mengekstrak nominal dan nama _merchant_, lalu menuliskannya langsung ke Google Sheets.

1.  **Dynamic Budget Analytics**

*   **Deskripsi:** Laporan kondisi keuangan _real-time_ tanpa harus membuka _spreadsheet_ atau aplikasi bank.
*   **Cara Penggunaan/Trigger:** Pengguna mengirimkan _prompt_ kasual (Teks/Voice) di Telegram: _"Bro, sisa kuota jajan gue bulan ini berapa?"_. N.E.X.A akan membaca Google Sheets, mengkalkulasi saldo, dan memberikan laporan persentase pengeluaran.

### Domain Pengendali Waktu & Disiplin (Time & Productivity Mastery)

1.  **Dynamic Lifecycle & Schedule Manager**

*   **Deskripsi:** Pengatur jadwal proaktif yang mengambil alih beban administratif penjadwalan. Memiliki akses baca/tulis penuh ke Google Calendar.
*   **Cara Penggunaan/Trigger:** Pengguna memberikan instruksi natural via Telegram (misal: "Bro, pindahin jadwal riset esai ke besok jam 3 sore"). Gemini menganalisis intent, lalu N.E.X.A mengeksekusi manipulasi jadwal di Google Calendar secara otomatis.

1.  **Screen-Time Enforcer & God Mode**

*   **Deskripsi:** Algojo kedisiplinan ekstrem untuk memutus rantai penundaan (_procrastination_) dan menjaga fokus target akademik.
*   **Cara Penggunaan/Trigger:** Otomatis. Jika Tasker mendeteksi penggunaan aplikasi hiburan melampaui batas wajar, N.E.X.A mengirim peringatan eskalatif ke Telegram. Jika diabaikan, N.E.X.A (via Koyeb) menembakkan _Webhook_ balik ke Tasker untuk mengeksekusi _God Mode_—mematikan paksa koneksi WiFi/Data pengguna.

### Domain Akselerator Akademik & Karier (Academic & Career Accelerator)

1.  **The Diplomat’s Morning Briefing**

*   **Deskripsi:** Ekstrak intelijen harian yang disajikan di awal hari untuk membangun wawasan global.
*   **Cara Penggunaan/Trigger:** Terpicu otomatis via _Cron Job_ Koyeb setiap hari pukul 05:30 WIB. Mengirimkan satu laporan terpadu ke Telegram berisi: Ringkasan cuaca, peta jadwal kalender hari itu, dan 3 _headline_ berita geopolitik Timur Tengah terkini (via News API).

1.  **Competition & Scholarship Radar**

*   **Deskripsi:** Mesin pencari otonom yang bekerja sebagai agen pemantau peluang akademik.
*   **Cara Penggunaan/Trigger:** _Cron Job_ mingguan berjalan di latar belakang untuk melakukan _web_ scraping atau memindai RSS _feed_ dari portal beasiswa/Lomba Karya Tulis Ilmiah. N.E.X.A akan mem-_forward_ peluang yang relevan ke Telegram.

1.  **2nd Brain Idea Vault**

*   **Deskripsi:** Lemari besi penyimpanan kilat untuk mengarsipkan gagasan riset, draf esai, atau catatan penting sebelum terlupa.
*   **Cara Penggunaan/Trigger:** Pengguna mengirim _Voice Note_ atau teks: _"Bro, simpan ide ini buat lomba_ Phoenix_: diplomasi budaya via sastra..."_. N.E.X.A akan merapikan teks tersebut dan mengirimkannya langsung ke _database 2nd Brain_ (Notion/Supabase).

### Domain Komando & Otak Utama (Core Command & Memory)

1.  **Universal Voice Router**

*   **_Deskripsi_**_: Pusat penerjemah komando suara tingkat tinggi. Fitur yang memungkinkan N.E.X.A dikendalikan 100% hands-free._
*   **_Cara Penggunaan/Trigger_**_: Pengguna merekam Voice Note di Telegram ➔_ Groq Whisper API _mengubahnya menjadi teks presisi tinggi ➔ Gemini API membedah niat (intent) pengguna dan menentukan modul mana (Finansial/Jadwal/Ide) yang harus dieksekusi_.

1.  **Persistent Contextual Memory**

*   **Deskripsi:** Sistem anti-amnesia. Kemampuan AI untuk mengingat konteks diskusi sebelumnya sehingga percakapan terasa natural dan berkelanjutan.
*   **Cara Penggunaan/Trigger:** Otomatis. Setiap kali ada _request_ masuk ke Telegram, server Koyeb akan menarik 10-20 gelembung _chat_ terakhir dari Supabase dan _menyuntikkannya_ ke Gemini sebagai _context awareness_ sebelum merespons.