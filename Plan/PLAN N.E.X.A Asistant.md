**PLAN & GUIDEBOOK PROJECT  
N.E.X.A \[Neural Extension Assistant for Intelligence\]**

## PENDAHULUAN  
_(Introduction)_

### Latar Belakang

Menjaga keseimbangan antara tanggung jawab akademik yang masif sebagai mahasiswa Sastra Arab di Universitas Gadjah Mada, mempertahankan standar _Jardine Scholar_, dan mengeksekusi visi jangka panjang menuju karier diplomasi internasional membutuhkan fokus kognitif yang luar biasa. Mengandalkan tekad manual (_willpower_) semata untuk mencatat detail finansial harian, menahan diri dari distraksi media sosial, atau melacak peluang kompetisi akademik sangatlah menguras energi mental yang seharusnya digunakan untuk belajar dan riset. N.E.X.A lahir dari kebutuhan mendesak akan sebuah "otak eksternal" atau _Chief of Staff_ digital yang mampu mengambil alih seluruh beban tersebut secara otonom. N.E.X.A v2.0 dibangun ulang menggunakan arsitektur _Cloud-Native_ untuk menjadi sistem yang tidak pernah tidur, bertindak sebagai pengawas kedisiplinan absolut, melayani setiap hal yang di kehedaki majikannya dan memastikan setiap rutinitas harian selalu sejalan dengan ambisi masa depan.

### Visi & Misi Project

1.  **_Visi_**_:_ Menciptakan _Super AI Assistant_ (sekelas J.A.R.V.I.S.) yang bekerja secara senyap di latar belakang (_set-and-forget_).
2.  **_Misi (Jangka Pendek)_**_:_ Mengotomatisasi seluruh hal yang di butuhkan oleh tuannya seperti pencatatan finansial, pengingat kedisiplinan, pengatur jam tidur, pengatur jadwal akademik keseharian dan kegiatan apapun yang dilakukan Tuan Faqih serta menegakkan kedisiplinan durasi layar (_screen-time_).
3.  **_Misi (Jangka Panjang)_**_:_ Menjadi eksekutif digital proaktif yang mendukung penuh target akademik di Sastra Arab, mempertahankan beasiswa, menavigasi jalur karier diplomasi internasional melalui peringatan peluang (_radar_) dan ringkasan intelijen harian. Dan menjadikan Tuannya menjadi pribadi yang lebih baik kedepannya dengan memanfaatkan tenologi. Dan selalu berkembang mempelajari tentang apapun yang diakukakn oleh Tuannya

### Pengguna

Eksklusif untuk otorisasi tunggal (Tuan Faqih).

### Batasan Sistem_:_

Beroperasi di _cloud server_ (Koyeb) dengan ketergantungan pada perangkat Android utama yang menjalankan aplikasi Tasker sebagai sensor lapangan.

## DESKRIPSI SISTEM  
_(System Overview)_

### Definisi Utama (Executive Summary)

**N.E.X.A (Neural Extension Assistant for Intelligence)** adalah asisten kecerdasan buatan _cloud-native_ yang dirancang sebagai _Chief of Staff_ digital otonom. Sistem ini bertindak sebagai jembatan cerdas antara interaksi natural manusia (melalui teks dan suara) dengan eksekusi teknis tingkat tinggi (manipulasi API, manajemen _database_, hingga intervensi sistem operasi Android). N.E.X.A diciptakan khusus untuk mengambil alih beban kognitif dan administratif harian, memastikan pengguna dapat mempertahankan fokus absolut pada prioritas akademik dan target karier strategis di bidang diplomasi. Dan pastinya memliki tujuan absolut untuk Tuannya.

### Pilar Kapasitas Utama (Core Capabilities)

Sistem N.E.X.A tidak hanya merespons perintah pasif, melainkan digerakkan oleh empat pilar operasional proaktif:

1.  **Sistem Finansial Omnichannel (Omnichannel Finance Tracker)**
2.  **Deskripsi**

Mencatat, mengekstrak, dan membukukan transaksi keuangan ke dalam _spreadsheet_ secara _real-time_ melalui berbagai jalur input (_omnichannel_), baik secara otonom di latar belakang maupun melalui perintah interaktif pengguna.

1.  **Mekanisme Teknis (Multi-Input)**

Fleksibilitas pencatatan didukung oleh 5 jalur input yang terbagi dalam dua kategori:

*   1.  **Input Pasif (Otonom)**

Beroperasi tanpa campur tangan pengguna melalui (1) intersepsi notifikasi _push_ M-Banking oleh Tasker, dan (2) _polling_ otomatis _email_ struk dari bank.

*   1.  **Input Aktif (Interaktif)**

Dieksekusi langsung oleh pengguna melalui Telegram Bot berupa (3) instruksi teks natural, (4) _Voice Note_ yang ditranskripsi oleh sistem, dan (5) unggahan foto nota/struk fisik yang diekstrak menggunakan _Vision AI_.

1.  **Deduplication Engine:**

Logika resolusi konflik tingkat lanjut yang diterapkan **secara eksklusif pada Input Pasif** (Notifikasi & Email). Menggunakan _Composite Key_, sistem memastikan transaksi otomatis yang berasal dari dua sumber berbeda pada waktu bersamaan tidak tercatat ganda. Sementara itu, Input Aktif dari Telegram akan di bypass dari mesin deduplikasi dan langsung diproses sebagai instruksi absolut.

1.  **Pusat Memori Kontekstual (Persistent Long-Term Memory)**
2.  **Deskripsi**

Mengeliminasi fenomena "amnesia AI" yang sering terjadi pada bot konvensional dengan mempertahankan rekam jejak obrolan secara utuh.

1.  **Mekanisme Teknis**

Memanfaatkan integrasi _database_ relasional di _cloud_ untuk menyimpan profil, preferensi, dan riwayat gelembung _chat_. N.E.X.A memproses rentetan diskusi sebelumnya setiap kali merespons, menghasilkan komunikasi yang persisten dan saling terhubung layaknya berdiskusi dengan rekan manusia.

1.  **Penegak Kedisiplinan Ekstrem (Productivity Enforcer & God Mode)**
2.  **Deskripsi**

Memitigasi distraksi digital yang mengancam produktivitas dan memotong rantai penundaan (procrastination) secara agresif demi menjaga ritme kerja.

1.  **Mekanisme Teknis**

Secara konstan memantau metrik durasi penggunaan aplikasi (screen-time) di latar belakang. Jika terdeteksi pelanggaran batas waktu pada aplikasi hiburan, N.E.X.A akan mengirimkan teguran eskalatif. Sebagai langkah terakhir, sistem memiliki wewenang memicu God Mode—mengirimkan sinyal balik (webhook) untuk mengambil alih kontrol OS Android dan memutus paksa koneksi jaringan (WiFi/Data) pengguna.

1.  **Pusat Komando Suara Universal (Voice-Activated Universal Router)**
2.  **Deskripsi**

Membebaskan pengguna dari keharusan mengetik dengan menerjemahkan perintah audio menjadi rantai eksekusi program yang presisi.

1.  **Mekanisme Teknis**

Mengubah _Voice Note_ menjadi teks akurasi tinggi, yang kemudian dianalisis oleh _core logic_ AI untuk memicu fungsi spesifik secara otomatis—seperti mengarsipkan gagasan esai, mencari literatur intelijen, atau mencatat metrik harian.

1.  **Pusat Kendali Agenda Otonom (Dynamic Lifecycle & Schedule Manager)**
2.  **Deskripsi**

Bertindak sebagai manajer waktu proaktif yang mengorkestrasi seluruh siklus kegiatan pengguna. N.E.X.A tidak sekadar pasif mencatat, melainkan mengambil alih beban kognitif penjadwalan untuk memastikan setiap target akademik, riset esai, dan rutinitas harian tereksekusi dengan presisi tanpa ada yang tumpang tindih.

1.  **Mekanisme Teknis**

Dibangun di atas ekosistem **Google Calendar API** sebagai fondasi waktu yang efisien dan presisi (bebas dari beban _polling server_).

*   1.  **Manipulasi Instan (Read/Write Access)**

Terintegrasi dengan _Universal Voice Router dan input teks._ Pengguna cukup mendelegasikan instruksi secara natural via teks atau suara di Bot Telegram (contoh: _"Bro, jadwal diskusi geopolitik hari ini batal, geser ke besok jam 4 sore dan kosongin jadwal pagi"_). N.E.X.A secara otomatis akan membedah intent, mengekstrak data waktu, dan menembakkan _request_ API untuk membuat, mengedit, atau menghapus blok jadwal di kalender secara seketika tanpa pengguna perlu membuka aplikasi.

*   1.  **Orkestrasi Proaktif (Push & Cron)**

Memanfaatkan _Push Notification_ Webhook dari kalender dan _Cron Job_ server Koyeb. N.E.X.A memindai peta jadwal secara berkala dan menembakkan pengingat eskalatif berlapis—menyajikan ringkasan apa yang harus dieksekusi hari ini pada pukul 05:30 pagi, memberikan peringatan 10 menit sebelum agenda dimulai, dan tersinkronisasi langsung dengan _God Mode_ untuk menampilkan layer merah (scenes) atau menekan tombol kembali kelayar utama (Go Home) secara berulang atau bahkan mengunci perangkat jika jadwal krusial tersebut malah dihabiskan untuk _memainkan_ aplikasi hiburan.

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

## LOGIKA & ALUR KERJA  
_(Logic & Workflows)_

N.E.X.A beroperasi menggunakan _State Machine_ yang dinamis (Universal Loop), di mana aliran data tidak dikodekan secara kaku (_hardcoded_), melainkan dipandu oleh kecerdasan buatan (Gemini 2.5 Flash) untuk memahami _intent_ (niat/konteks) sebelum melakukan eksekusi.

### Universal State Machine (Alur Kerja Utama)

Setiap interaksi atau pemicu akan melewati 5 tahapan esensial ini:

1.  **Trigger (Pemicu Masuk):** Menerima stimulus dari Telegram (_Teks/Voice Note_), Tasker (_Notifikasi/Screen-time_), atau _Cron Job_ (Jadwal Waktu).
2.  **Authentication & Context (Gerbang & Memori):** Server Koyeb memvalidasi identitas (via Chat ID atau Secret Token) ➔ Mengambil riwayat 10-20 _chat_ terakhir dan status profil dari Supabase.
3.  **Cognitive Routing (Analisis Niat):** Data + Konteks dilempar ke Gemini 2.5 Flash API. Gemini 2.5 Flash bertugas sebagai "Dirigen" untuk menentukan: _Apakah ini perintah jadwal? Catatan keuangan? Pertanyaan? Atau pelanggaran disiplin?_
4.  **Targeted Execution (Eksekusi Spesifik):** Koyeb menjalankan modul (_Function Calling_) yang dipilih Gemini (contoh: Menulis ke Google Calendar API, mengeksekusi financeEngine.js, atau menyimpan ide ke _database 2nd Brain, atau function yang lain_).
5.  **Feedback/Actuation (Umpan Balik):** Mengirim konfirmasi ke Telegram pengguna, atau menembakkan _Webhook_ balik ke Tasker untuk mengeksekusi _God Mode atau hal teknis lainnya_.

### Contoh Skenario Alur Kerja Berdasarkan Modul

Untuk memperjelas _Universal Loop_ di atas, berikut adalah jabaran dari 4 skenario fungsional utama N.E.X.A:

*   **Skenario 1: Manipulasi Jadwal Otonom (Universal Command)**
    *   **_Trigger_**_:_ Pengguna mengirim _Voice Note_: _"Bro, rapat jam 2 batal, pindah besok pagi."_
    *   **_Routing_**_:_ **Groq Whisper API** mengubah audio menjadi teks ➔ Gemini 2.5 Flash menganalisis intent: UPDATE\_CALENDAR.
    *   **_Execution_**_:_ Node.js mengirim _request_ ke Google Calendar API untuk menghapus jadwal jam 2 dan membuat jadwal baru di esok hari.
    *   **_Feedback_**_:_ Bot Telegram merespons: _"Siap Tuan, jadwal udah digeser. Besok pagi jadwal anda padat."_
*   **Skenario 2: Finance Auto-Track (The Dual-Channel System)**
    *   **Trigger (Pemicu Ganda):** Data transaksi masuk melalui dua jalur independen yang saling _backup_:
    *   **Jalur 1 (Fast/Real-time):** Tasker/MacroDroid menangkap _Push Notification_ Livin di layar HP secara seketika dan menembakkan POST /webhook/notif ke server Koyeb.
    *   **Jalur 2 (Reliable/Polling):** _Cron Job_ di server Node.js menyala setiap 15 menit untuk menarik data struk transaksi terbaru via integrasi **Gmail API**.
    *   **Routing & Parsing:** Data mentah dari mana pun asalnya (baik teks notifikasi UI maupun _body email_) dilempar ke **Gemini 2.5 Flash** **API Parser**. **Gemini 2.5 Flash** bertugas mengekstrak variabel absolut: NOMINAL, MERCHANT, dan waktu transaksi.
    *   **Execution (Deduplication Logic):** Di sinilah keajaibannya terjadi. Data yang **_sudah_** rapi masuk ke Deduplication Engine. Sistem akan merakit _Composite Key_ (Nominal + Merchant + Time dengan toleransi ±10 menit). Karena satu transaksi yang sama akan ditangkap dua kali (oleh HP dan oleh Email), mesin ini akan mencegat data kedua yang masuk. **Hanya jika** _Composite Key_ tersebut belum pernah dicatat, sistem akan mengeksekusi **Google Sheets API** untuk menulis baris baru.
    *   **Feedback:** Setelah berhasil dicatat di buku besar, Koyeb mengirimkan konfirmasi (_Telegram Confirmation_) ke pengguna, memastikan bahwa Tuan Faqih tahu transaksinya sudah terbukukan dengan aman.
*   **Skenario 3: Penegakan Disiplin (The God Mode)**
    *   _Trigger:_ Tasker mendeteksi aplikasi TikTok/Instagram atau aplikasi hiburan lainnya dibuka >30 menit ➔ Kirim Webhook ke Koyeb.
    *   _Routing:_ Gemini 2.5 Flash mendeteksi pelanggaran: DISCIPLINE\_VIOLATION.
    *   _Execution:_ Koyeb menembak perintah _Kill Switch_ ke URL _Webhook_ Tasker di HP pengguna.
    *   _Feedback:_ Tasker di HP secara paksa mematikan koneksi WiFi/Data, memunculkan _pop-up_: _"Waktumu Berharga!"_ dan Koyeb mengirim laporan pelanggaran ke Telegram.
*   **Skenario 4: The Diplomat Briefing (Proaktif)**
    *   _Trigger:_ _Cron Job_ di server Koyeb menyala pukul 05:30 WIB.
    *   _Routing:_ Server mengambil data _News API_ dan _Google Calendar API_ hari ini ➔ Gemini 2.5 Flash merangkum menjadi 3 poin singkat.
    *   _Execution & Feedback:_ Mengirim satu pesan panjang terstruktur ke Telegram sebagai briefing pagi hari saat pengguna bangun.

### Mekanisme Penanganan Masalah (Error Handling & Fallbacks)

Sebagai sistem kritis, N.E.X.A memiliki jaring pengaman (_fail-safe_) jika komponen utamanya bermasalah:

*   **Multi-Tier AI Fallback:** Jika otak utama bermasalah, N.E.X.A memiliki jaring pengaman **berlapis**:
*   **Primary:** Gemini 2.5 Flash via Google AI Studio (Free Tier).
*   **Fallback 1:** Gemini 2.5 Flash via Google AI Studio akun yang berbeda (Free Tier).
*   **Fallback 2:** Meta Llama 3.1 8B via OpenRouter (Open-source, uptime tinggi).
*   **Emergency:** Mode Dumb/Template respons otomatis ("Transaksi tercatat, sistem AI sedang offline") ditambah logging manual. N.E.X.A masuk ke _"Dumb Mode"_. Sistem akan otomatis membalas di Telegram: _"Sistem otak utama saya sedang down/limit. Pesan anda saya simpan di buffer, akan diproses manual nanti."_ Data mentah (audio/teks) akan diamankan sementara di Supabase.
*   **Jika Tasker Gagal Mengirim Webhook (Sinyal Offline):** Tasker di Android dikonfigurasi dengan _Local Queue System_. Jika _HTTP POST_ ke Koyeb gagal (comtoh jika karena pengguna sedang di area _blank spot_ saat transaksi QRIS), Tasker akan menahan data tersebut di dalam variabel lokal dan melakukan _retry loop_ (percobaan ulang) setiap 15 menit hingga koneksi internet kembali.
*   **Jika Google API Gagal (Sheets/Calendar Down):** Server Koyeb akan menangkap status _error 500_ dari Google, menahan perubahan, dan mengirim _Alert_ Darurat ke Telegram pengguna agar tidak terjadi korupsi data.

### Postur Keamanan & Otentikasi (Security Posture)

N.E.X.A memiliki akses yang sangat dalam ke kehidupan finansial dan privasi pengguna. Lapisan keamanan diatur secara ekstrem:

1.  **Telegram Identity Lock:** API Bot dilengkapi validasi TELEGRAM\_CHAT\_ID statis. Jika ada ID asing (orang lain) yang mencoba mengirim pesan ke Bot, sistem tidak akan membalas dan langsung memblokir instruksi tersebut di level _Gateway_ (Koyeb).
2.  **Webhook Bearer Token:** Endpoint Koyeb yang terbuka untuk publik (seperti /webhook/tasker) wajib menerima Authorization: Bearer <SECRET\_TOKEN> di _header_\-nya. Ini mencegah _hacker_ iseng menembakkan data keuangan palsu ke server tuan.
3.  **Zero-Password Architecture:** Interaksi dengan ekosistem Google (Calendar, Sheets, Gmail) murni menggunakan token _OAuth2_. N.E.X.A tidak akan pernah menyimpan kata sandi akun Google mentah milik pengguna.
4.  **Database Isolation:** Supabase dikonfigurasi untuk hanya menerima _request_ internal dari _Server_ Node.js (Koyeb). Akses publik ke _database_ sepenuhnya ditutup.

---

### ⚠️ REVISI FEASIBILITAS TEKNIS (CRITICAL LOGIC FIXES)
Berdasarkan pemindaian teknis mendalam terhadap rencana di atas, terdapat dua cacat logika sistem yang *tidak mungkin* diterapkan di dunia nyata jika tidak direvisi. Berikut adalah penyesuaian wajibnya:

1.  **Mitos "Webhook Langsung" ke Android (Tasker Target):**
    *   **Rencana Lama:** Server Koyeb mengirim _HTTP POST Webhook_ secara langsung ke HP Android (Tasker) untuk memicu _God Mode_.
    *   **Realita Teknis:** HP Android menggunakan jaringan seluler/WiFi yang berada di belakang NAT (CGNAT). HP Anda **tidak memiliki Public IP Address** terbuka. Koyeb _tidak akan pernah bisa_ menembak _request_ langsung ke HP Anda.
    *   **Solusi Revisi:** Kita akan menggunakan **AutoRemote** (Plugin gratis Tasker) yang menyediakan _Public URL_ untuk diteruskan ke HP Anda, ATAU menggunakan metode **Telegram Intercept** (N.E.X.A mengirim pesan kode khusus ke Telegram secara senyap, lalu Tasker di HP mencegat notifikasi Telegram tersebut untuk memicu _God Mode_). Metode kedua 100% gratis dan andal.

2.  **Kerapuhan Deduplication Engine (Beda Format Nama):**
    *   **Rencana Lama:** Mesin deduplikasi mencocokkan `Nominal` + `Nama Merchant` + `Waktu` secara presisi absolut.
    *   **Realita Teknis:** Format notifikasi UI Livin dan format di Email Bank seringkali berbeda (contoh: di notifikasi tertulis "QRIS YAYASAN ABC", tapi di Email tertulis "YAYASAN ABC JKT"). Jika kita mensyaratkan pencocokan _string_ eksak, AI akan menganggapnya sebagai dua transaksi berbeda sehingga terjadi entri ganda!
    *   **Solusi Revisi:** Mesin Deduplikasi disetel untuk mengandalkan **Nominal + Waktu (±15 menit)** sebagai filter utama yang paling kuat. N.E.X.A (Gemini AI) ditugaskan untuk menormalisasi nama _merchant_ (menghapus kata "QRIS", lokasi, dll) sebelum disimpan ke _database_ untuk memastikan deduplikasi bekerja 100% sempurna tanpa salah sasaran.

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

## RENCANA PENGEMBANGAN & PEMBANGUNAN BERTAHAP  
_(Build Order Roadmap - REVISI ARSITEKTUR)_

> [!WARNING]
> **Koreksi Arsitektural:** Pada rencana sebelumnya, pembuatan fitur Kalender (Fase 3) dan Input Telegram Finansial (Fase 1) dilakukan *sebelum* pembuatan AI Router (Fase 4). Secara *software engineering*, ini adalah kesalahan logika fatal karena N.E.X.A membutuhkan "Otak Utama" (AI Router) untuk membedah *intent* (niat) natural pengguna sebelum bisa memanggil fungsi spesifik. 
> 
> Berikut adalah urutan pembangunan (Build Order) yang benar, presisi, dan komprehensif:

Mengingat kompleksitas arsitektur N.E.X.A dan prioritas pengguna pada studi akademik, sistem ini tidak dibangun secara serentak. Pengembangan menggunakan metode _Iterative Development_. Kode Node.js di server akan terus berevolusi pada setiap fase tanpa merusak fondasi yang sudah stabil.

### Fase 0: Persiapan Infrastruktur & Hak Akses (Pre-requisites)
Sebelum menulis satu baris kode pun, seluruh lingkungan eksekusi harus dikunci:
*   **Infrastruktur Server & Database:** Membuat akun Koyeb (Node.js Engine) dan Supabase (Database Relasional).
*   **Kredensial API (Zero-Cost Ecosystem):** Mengamankan API Key dari Google AI Studio (Gemini 2.5 Flash), Groq (Whisper Large v3), OpenRouter (Llama 3.1 8B), akun Service Account Google Workspace, dan Token Telegram Bot.
*   **Bypass Limitasi OS Android:** Eksekusi perintah ADB (`adb shell pm grant net.dinglisch.android.taskerm android.permission.WRITE_SECURE_SETTINGS`) dan mengaktifkan _Device Admin_ untuk Tasker.

### Fase 1: Sistem Saraf Pusat & Otak Utama (Telegram Gateway, AI Router, & Memory)
**Fokus:** Membangun "Otak" N.E.X.A terlebih dahulu. Tanpa fase ini, tidak ada perintah natural yang bisa diproses.
*   **Logika Inti Server:**
    *   Membangun _endpoint Webhook_ Telegram (`/webhook/telegram`) lengkap dengan Filter Keamanan (Identity Lock).
    *   Integrasi SDK Supabase untuk **Persistent Contextual Memory** (Menyimpan dan menarik 10 riwayat chat terakhir agar AI tidak amnesia).
    *   Membangun **AI Router & Fallback Engine** menggunakan Gemini 2.5 Flash. Sistem harus bisa membedah teks pengguna menjadi JSON terstruktur (menentukan apakah perintah ini untuk `FINANCE`, `CALENDAR`, `DISCIPLINE`, dsb).
*   **Indikator Keberhasilan:** Anda bisa mengirim chat ke N.E.X.A, AI bisa membalas dengan mengingat chat sebelumnya, dan *console server* berhasil memisahkan *intent* perintah Anda.

### Fase 2: Fondasi Finansial (Omnichannel Tracker & Deduplication)
**Fokus:** Menghubungkan *intent* keuangan dari AI Router ke Google Sheets, serta membangun jalur otomatis.
*   **Logika Inti Server:**
    *   Integrasi Google Sheets API (via Service Account).
    *   Merakit **Deduplication Engine** di Supabase (Composite Key: Nominal + Merchant ±10 menit).
    *   Membangun _endpoint Webhook Tasker_ (`/webhook/tasker`) untuk menerima _Push Notification_ dari Livin.
    *   Menghubungkan _intent_ `FINANCE` dari Telegram (Input Aktif) untuk membay-pass deduplikasi dan langsung menulis ke buku besar.
*   **Indikator Keberhasilan:** Transaksi Livin otomatis masuk ke Sheets tanpa *double*, dan Anda bisa bertanya "Berapa sisa budget?" lalu AI membaca dasbor Sheets.

### Fase 3: Penguasaan Waktu (Google Calendar Integration)
**Fokus:** Memberikan hak akses baca/tulis penuh kepada N.E.X.A untuk memanipulasi jadwal secara otonom.
*   **Logika Inti Server:**
    *   Integrasi Google Calendar API.
    *   Membangun logika _Agenda Manager_: Memetakan *intent* `CALENDAR` (dari Fase 1) menjadi fungsi CRUD spesifik (Create, Update, Delete) ke Google Calendar.
*   **Indikator Keberhasilan:** Anda mengetik: "Bro, geser jadwal diskusi ke jam 4 sore", dan N.E.X.A secara seketika memodifikasi kalender di HP Anda.

### Fase 4: Telinga Universal & Ideation (Groq Whisper & 2nd Brain)
**Fokus:** Mengaktifkan interaksi _Hands-Free_ tingkat tinggi dan lemari besi ide.
*   **Logika Inti Server:**
    *   Integrasi **Groq API**: Menangkap _Voice Note_ Telegram, mengonversinya menjadi teks dengan Whisper Large v3 dalam hitungan milidetik, lalu mengopernya ke AI Router.
    *   Membangun fungsi integrasi `2ND_BRAIN` ke Supabase atau Google Docs untuk mengarsipkan ide esai.
*   **Indikator Keberhasilan:** Anda mengirim _Voice Note_ tentang ide esai panjang, dan N.E.X.A membalas serta menyimpannya ke database dengan rapi.

### Fase 5: Algojo Kedisiplinan Ekstrem (Screen-Time Tracker & God Mode)
**Fokus:** Rantai penegakan kedisiplinan dan hukuman (Actuation).
*   **Logika Inti Server:**
    *   Membangun skrip penanganan di Koyeb saat menerima webhook peringatan pelanggaran `SCREEN_TIME` dari Tasker.
    *   Membangun fungsi penembak balik (_Kill Switch_) yang mengirim _payload_ ke Tasker HP Anda dengan header `X-NEXA-Signature` (HMAC-SHA256).
*   **Setup Tasker:**
    *   Mengonfigurasi Tasker untuk mengeksekusi _actions_: Memutus WiFi/Data, _Lock Screen_, dan memunculkan pop-up "Waktumu Berharga!".
*   **Indikator Keberhasilan:** Jika Anda buka TikTok >30 menit, HP Anda mendadak kehilangan sinyal internet dan layar terkunci dengan pesan dari N.E.X.A.

### Fase 6: Inisiatif Proaktif (The Diplomat Briefing & Cron Jobs)
**Fokus:** Otomatisasi pengingat dan ringkasan wawasan harian tanpa perlu diminta.
*   **Logika Inti Server:**
    *   Mengimplementasikan `node-cron` di server.
    *   Membangun **Intelligence Briefing**: Pada pukul 05:30 WIB, N.E.X.A menarik data cuaca (WeatherAPI), Agenda Kalender, dan berita Timur Tengah (NewsAPI), lalu diolah Gemini menjadi laporan naratif elegan dan dikirim ke Telegram Tuan Faqih.
*   **Indikator Keberhasilan:** Setiap pagi setelah bangun tidur, Anda langsung disuguhi satu pesan komprehensif berisi jadwal dan rangkuman intelijen geopolitik terbaru.