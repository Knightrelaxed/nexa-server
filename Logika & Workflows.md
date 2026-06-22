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