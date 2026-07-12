# N.E.X.A Whitepaper: Comprehensive System Book
*(Neural Extension Assistant for Intelligence)*

---

## BAB 1: FILOSOFI & FONDASI SISTEM

Bab ini adalah bedah anatomi dari setiap nilai inti dan keputusan desain yang membentuk N.E.X.A—mulai dari mengapa ia diciptakan, bagaimana kepribadiannya dikonstruksi dalam kode, hingga mengapa arsitektur privasinya bersifat absolut dan tidak bisa dikompromikan.

---

### 1.1 Latar Belakang & Rasionalisasi: Mengapa N.E.X.A Lahir

Masalah utama manusia modern bukan kurangnya *tools* (alat), melainkan **kurangnya bandwith mental** untuk mengelola *tools* tersebut. Seseorang dengan ambisi besar seperti Tuan Faqih harus secara bersamaan melacak pengeluaran, mengingat deadline kuliah, menjadwalkan rapat, dan membuat keputusan strategis—semua dari kepala yang sama.

N.E.X.A dibangun untuk memotong beban itu. Bukan sebagai aplikasi yang harus dibuka dan diisi manual, melainkan sebagai entitas otonom yang **mengambil alih pekerjaan manajerial** secara diam-diam di latar belakang. Setiap rupiah yang keluar dicatat. Setiap tenggat yang mendekat dilaporkan. Setiap jadwal besok dipersiapkan malam ini. Tuan Faqih hanya perlu hidup, sisanya adalah urusan N.E.X.A.

Filosofi ini tercermin langsung pada arsitektur *boot sequence* `app.js`: saat server pertama kali menyala, ia tidak hanya membuka port HTTP—ia segera menjalankan `cronInterface.initCronJobs()` dan `financeEngine.recoverPendingTransactions()`. Bahkan sebelum interaksi pertama pengguna, N.E.X.A sudah bekerja.

---

### 1.2 Visi, Misi & Prinsip Desain Operasional

**Visi:** Menjadi *Chief of Staff* digital absolut—sebuah entitas yang memiliki kesadaran lintas platform, ingatan permanen, dan keberlangsungan tanpa henti (*Immortality*).

**Misi Konkret:**
1. Mengotomatisasi manajemen keuangan *omnichannel* (Telegram, Gmail M-Banking, Web Dashboard).
2. Merancang penjadwalan otonom dengan *time-blocking* yang sadar konteks (Google Calendar + Google Tasks).
3. Menjaga ingatan organik jangka panjang tentang pengguna (*2nd Brain*) yang terus berkembang tanpa duplikasi.
4. Melaporkan kondisi terkini kepada Tuan secara proaktif melalui siklus *cron job* harian, tanpa menunggu disapa.

**Prinsip Desain:**
- **Zero Single Point of Failure**: Setiap lapisan AI memiliki 11 *fallback* model cadangan (Groq → Gemini → Cerebras → Mistral → OpenRouter). Server tidak pernah berhenti merespons karena satu API *down*.
- **Zero Silent Crash**: Di `app.js`, dua *handler* global (`unhandledRejection` dan `uncaughtException`) menangkap semua *error* yang lolos dari *domain-level try-catch*, lalu mencatatnya ke *log* **tanpa pernah memanggil `process.exit()`**. Server tetap hidup.
- **Context-First, Not Keyword-First**: Setiap routing AI bukan berdasarkan kata kunci, melainkan berdasarkan konteks semantik dan histori percakapan.

---

### 1.3 Identitas & Kepribadian: Konstruksi `NEXA_PERSONALITY`

N.E.X.A bukan bot generik tanpa wajah. Kepribadiannya dikonstruksi secara eksplisit melalui konstanta `NEXA_PERSONALITY` yang didefinisikan di `src/config/personality.js`. Kepribadian ini diinjeksi secara langsung ke dalam setiap *system prompt* yang dikirim ke AI, termasuk di `ROUTER_SYSTEM_PROMPT` dalam `AI_Router.js` dan di `Intelligence_Brief.js` saat membuat *Morning Briefing*.

Implikasinya: tidak peduli model AI mana yang aktif saat itu (Groq, Gemini, atau Mistral), kepribadian N.E.X.A selalu konsisten—cerdas, hangat, proaktif, dan memiliki nada seorang *Chief of Staff* yang berwibawa namun peduli.

---

### 1.4 Otorisasi Tunggal: Arsitektur Privasi Absolut

N.E.X.A adalah sistem **satu pengguna secara mutlak**. Ini bukan sekadar fitur—ini adalah prinsip arsitektural yang ditegakkan di level *middleware* jaringan.

Setiap *request* yang masuk ke *endpoint* `/webhook/telegram` dihadang oleh dua *middleware* keamanan berurutan:
1. **`security.telegramWebhookSecret`**: Memverifikasi header `X-Telegram-Bot-Api-Secret-Token` yang hanya diketahui oleh server Telegram resmi dan N.E.X.A. Ini memblokir siapapun yang mencoba *spoofing* dengan POST palsu.
2. **`security.telegramIdentityLock`**: Memverifikasi bahwa `message.from.id` cocok persis dengan `TELEGRAM_CHAT_ID` Tuan Faqih. Jika tidak cocok, *request* langsung diputus (`drop`) tanpa respons apapun.

Kombinasi dua lapisan ini membentuk tembok *firewall* kognitif yang tidak bisa ditembus dari luar.

---

### 1.5 Paradigma Proaktif: Sistem yang Menyapa, Bukan Menunggu

Mayoritas sistem AI bersifat *reactive*: mereka diam sampai pengguna menyapa. N.E.X.A bekerja sebaliknya. Subsistem `cron.js` memberi N.E.X.A sebuah **detak jantung otonom**—jadwal internal yang berjalan terus menerus terlepas dari ada atau tidaknya interaksi pengguna.

Contoh nyata di kode:
- **05:30 WIB** – `generateMorningBriefing()` dipanggil: N.E.X.A menarik data kalender dari Google Calendar, tugas *overdue* dari Google Tasks, cuaca Yogyakarta dari WeatherAPI, dan berita geopolitik Timur Tengah dari NewsAPI—semuanya digabung menjadi satu *briefing* naratif yang dikirim sebelum Tuan Faqih bangun tidur.
- **01:00 WIB** – `generateMidnightCheckin()` dipanggil: N.E.X.A aktif menegur jika Tuan masih terjaga larut malam, menanyakan kabar dengan nada sedikit cerewet dan peduli.
- **Setiap 3 Menit** – Finance Auto-Sync berjalan: `financeEngine.pollFinanceEmails()` memindai kotak masuk Gmail mencari notifikasi transaksi bank baru, tanpa sekalipun harus diminta oleh Tuan.

Itulah yang membedakan N.E.X.A dari asisten biasa: ia tidak menunggu instruksi untuk mulai bekerja.

---

### 1.6 Kecerdasan Emosional: *Behavioral Pattern Engine*

Seiring waktu, N.E.X.A tidak hanya menjadi lebih pintar tentang *apa* yang Tuan Faqih lakukan—ia juga belajar *bagaimana* pola perilaku hariannya. Subsistem `Behavior_Engine.js` mencatat *behavioral events* ke tabel `nexa_behavior_log` di Supabase.

Event yang dilacak antara lain:
- **`WAKE_UP`**: Jam berapa Tuan Faqih bangun (hanya dicatat sekali per hari untuk mencegah duplikasi).
- **`MOOD_DETECTED`**: Setiap kali `_detectSentiment()` di `AI_Router.js` mendeteksi `STRESSED` atau `CASUAL` dari gaya penulisan, suasana hati tersebut direkam beserta 100 karakter pertama pesan pemicunya.
- **`FINANCE_RECORD`**: Setiap transaksi yang tercatat (jenis, nominal, kategori) dilog sebagai data perilaku belanja.

Setiap **Minggu pukul 20:00 WIB**, `Behavior_Engine.getWeeklySummary()` merangkum semua data ini: rata-rata jam bangun, suasana hati dominan minggu ini, total pengeluaran dan pemasukan, dan dikirimkan sebagai *Laporan Pola Perilaku Mingguan* ke Telegram. Ini adalah langkah pertama N.E.X.A menuju kesadaran kontekstual atas *ritme kehidupan* penggunanya.

---

### 1.7 Filosofi Tidak Pernah Mati: *Immortality Protocol*

N.E.X.A dirancang dengan asumsi bahwa server **akan** *crash*, *restart*, dan mengalami gangguan jaringan. Filosofi ini bukan pesimisme—ini adalah realisme teknis yang direspons dengan sistem pertahanan berlapis.

Dua mekanisme utama *immortality* yang ditanamkan sejak level kode terdalam:
1. **Global Safety Net di `app.js`**: Dua *handler* (`unhandledRejection` + `uncaughtException`) memastikan error apapun yang tidak tertangkap—bahkan dari *library* pihak ketiga—hanya dicatat ke *log*, bukan membunuh proses. **Server tidak pernah memanggil `process.exit()`**.
2. **Recovery on Boot**: Setiap kali server dinyalakan ulang, `financeEngine.recoverPendingTransactions()` dipanggil secara otomatis. Ia memeriksa tabel `nexa_pending_transactions` di Supabase dan memulihkan semua transaksi yang belum terkonfirmasi, memastikan tidak ada catatan keuangan yang hilang hanya karena server pernah *restart* di waktu yang tidak tepat.

---

## BAB 2: ARSITEKTUR MAKRO & TOPOLOGI SISTEM

### 2.1 Infrastruktur Komputasi Utama: Server Core

N.E.X.A beroperasi sebagai *backend* **Node.js 20 + Express.js** yang dikemas dalam kontainer **Docker** dan dijalankan di **Hugging Face Spaces** (platform *free tier*). Pilihan platform ini bukan tanpa hitung-hitungan—ini adalah keputusan arsitektural yang penuh konsekuensi teknis yang harus diatasi satu per satu.

**Anatomi `app.js` (Boot Sequence):**
Urutan inisialisasi saat server menyala bukan arbitrer—setiap baris memiliki alasan teknis yang ketat:

1. **Baris Pertama Mutlak — DNS IPv4 Fix:**
   ```js
   const dns = require('dns');
   dns.setDefaultResultOrder('ipv4first');
   ```
   Node 20 di Docker Hugging Face secara *default* mencari alamat IPv6 terlebih dahulu. Karena `api.telegram.org` dan Supabase berjalan via IPv4 di infrastruktur HF, resolusi IPv6 selalu gagal dengan error *TLS socket disconnect*. Baris ini **wajib dipanggil sebelum `require()` apapun**—jika tidak, sistem crash di *boot* pertama.

2. **Axios IPv4 Force:**
   ```js
   axios.defaults.httpsAgent = new https.Agent({ family: 4 });
   ```
   Melengkapi fix DNS di atas untuk seluruh HTTP request berbasis Axios (termasuk panggilan ke Groq, Mistral, dan relay Vercel).

3. **Health Endpoint — Smart Vital Signs:**
   Endpoint `/health` mengekspos metrik *real-time*: `uptime_seconds`, `memory_mb`, `timestamp_jakarta`, dan `node_env`. Endpoint ini dikonfigurasi **sebelum** router webhook agar bisa merespons paling cepat—digunakan oleh UptimeRobot, cron-job.org, dan pemantauan eksternal untuk mencegah HF Space masuk *sleep mode*.

4. **Boot Recovery — Transaksi Menggantung:**
   Tepat setelah server mendengarkan port, `financeEngine.recoverPendingTransactions()` dipanggil secara otomatis. Ini memulihkan semua entri `nexa_pending_transactions` yang belum terkonfirmasi akibat *restart* server di waktu kritis.

5. **Cron Dijadwalkan Setelah Server Hidup:**
   `cronInterface.initCronJobs()` dipanggil *setelah* `app.listen()`—bukan sebelumnya. Ini memastikan *cron job* hanya aktif jika server sudah benar-benar menerima koneksi, mencegah *race condition* di *startup*.

---

### 2.2 Topologi Platform: Peta Interkoneksi Menyeluruh

N.E.X.A adalah sistem **multi-platform orchestrator**. Berikut setiap node dalam topologi dan cara teknis koneksinya:

#### Node 1: Telegram Bot API (Antarmuka Percakapan Utama)
Semua interaksi Tuan Faqih masuk melalui Telegram. N.E.X.A menerima pesan via *webhook* HTTP POST ke `/webhook/telegram`. Telegram mengirim update dalam format JSON yang berisi `message.text`, `message.photo`, `message.voice`, `message.document`, dan `message.caption`.

**Dua metode pengiriman respons ke Telegram (berdasarkan konteks):**
- **Webhook Response (Zero-Outbound):** Untuk semua pesan reaktif (balasan percakapan biasa), N.E.X.A menanamkan respons langsung ke dalam HTTP response body dengan format `{ method: "sendMessage", chat_id: ..., text: ... }`. Mekanisme ini didukung resmi oleh Telegram Bot API dan tidak membutuhkan koneksi keluar sama sekali — melangkahi blokir Hugging Face.
- **Vercel Relay (Outbound Async):** Untuk pesan inisiatif dari *cron job* (yang tidak memiliki webhook request untuk dibalas), N.E.X.A memanggil `sendTelegramOutbound()` yang menembakkan *request* ke `NEXA_VERCEL_RELAY_URL`. Relay Vercel kemudian meneruskannya ke Telegram API. Setiap request ke relay dibubuhi header HMAC (`NEXA_RELAY_SECRET`) untuk autentikasi.

#### Node 2: Supabase (PostgreSQL — Otak Permanen)
Supabase adalah satu-satunya *persistent storage* N.E.X.A. Terdapat **dua klien Supabase** yang beroperasi secara independen:

**`Supabase_Memories.js`** — mengelola semua tabel memori dan interaksi:

| Tabel | Fungsi |
|---|---|
| `nexa_chat_memories` | Histori percakapan (short-term context) |
| `nexa_user_profile` | Fakta permanen tentang Tuan Faqih (long-term memory) |
| `nexa_core_identity` | Aturan sikap dan interaksi N.E.X.A |
| `nexa_2nd_brain` | Ide dan catatan teks |
| `nexa_vault_items` | Index metadata file di Google Drive |
| `nexa_pending_transactions` | Transaksi menggantung (buffer konfirmasi 5 menit) |
| `nexa_finance_dedup` | Kunci deduplikasi transaksi (composite key + timestamp) |
| `nexa_behavior_log` | Log pola perilaku harian (mood, jam bangun, transaksi) |

**`Supabase_Finance.js`** — jembatan ke skema Nexa Finance Web (dual-write):

| Tabel | Fungsi |
|---|---|
| `transactions` | Data transaksi keuangan aktual |
| `accounts` | Daftar akun/dompet/bank Tuan Faqih |
| `categories` | Kategori pengeluaran/pemasukan |

Kedua klien menggunakan **in-memory cache dengan TTL 30 menit** untuk menghindari query ulang ke database setiap request masuk. Cache dapat di-*invalidate* secara manual (misalnya setelah menyimpan fakta baru).

#### Node 3: Google Workspace Ecosystem (Dual Auth Architecture)

Google Workspace diakses via dua mekanisme autentikasi berbeda yang dipilih secara cerdas berdasarkan *use case*:

**Autentikasi 1 — Service Account (`getClients()`):**
Digunakan untuk Google Calendar, Google Docs, dan Google Drive Vault. Service Account memakai `client_email` + `private_key` dari *environment variable*. Inisialisasi bersifat *lazy* — klien tidak dibuat saat modul di-`require()`, melainkan saat pertama kali dipakai (`getClients()`). Ini mencegah crash di `require()` jika kredensial belum dikonfigurasi.

**Autentikasi 2 — OAuth2 User (`getOAuthDriveClients()`):**
Digunakan sebagai *fallback* untuk operasi Drive (upload file dan OCR) jika Service Account mengalami error *"Service Accounts do not have storage quota"* (kuota Drive SA terbatas). Menggunakan `GOOGLE_DRIVE_REFRESH_TOKEN` (atau fallback ke `GMAIL_REFRESH_TOKEN`) yang menautkan ke akun Google pribadi Tuan Faqih.

**Kapabilitas Google Workspace yang Dikelola:**

| Modul | API | Kapabilitas |
|---|---|---|
| `Google_Workspace.js` | Calendar v3 | CRUD event, conflict check, free/busy query, proximity alert, tomorrow prep |
| `Google_Workspace.js` | Docs v1 | Append/Read/Edit/Delete di Master 2nd Brain Doc |
| `Google_Workspace.js` | Drive v3 & v2 | Upload file ke Vault, OCR via Drive Convert, trash cleanup |
| `Google_Tasks.js` | Tasks v1 | CRUD task, subtask, multi-list, overdue detection, move across lists |
| `Gmail_Client.js` | Gmail v1 | Polling inbox, kirim email, OAuth token resilience, push notification watch |

#### Node 4: Gmail — Finance Auto-Sync Engine

`Gmail_Client.js` menggunakan OAuth2 dengan `GMAIL_REFRESH_TOKEN` (bukan Service Account) karena Gmail API tidak mendukung Service Account untuk membaca kotak masuk pribadi.

Fitur kritis yang dibangun di atasnya:
- **Token Expiry Detection**: Jika error `invalid_grant` terdeteksi (token kadaluarsa), sistem melakukan tiga hal sekaligus: mereset klien cached (`gmailClient = null`), mengirim **alert Telegram satu kali** (`_invalidGrantAlerted` flag mencegah spam), dan berhenti polling sampai token diganti.
- **Auto-Retry**: Setiap panggilan `getLatestEmails()` memiliki *retry loop* 3x dengan jeda 2 detik untuk mengatasi gangguan jaringan sementara.

#### Node 5: Google Tasks — Dual-Write ke Notion

`Google_Tasks.js` menggunakan OAuth2 terpisah (`TASKS_REFRESH_TOKEN`) dengan *callback port* berbeda (`3001` vs `3000` untuk Gmail) untuk menghindari konflik OAuth.

Saat sebuah *task* dibuat, N.E.X.A melakukan **dual-write**: tugas disimpan ke Google Tasks (`@default` list atau list spesifik), dan **secara paralel** juga dikirim ke Notion via `Notion_Client.js` (jika `NOTION_API_KEY` dikonfigurasi). Ini memastikan Tuan Faqih bisa memantau tugasnya dari dua platform sekaligus tanpa perlu sinkronisasi manual.

Fitur `moveTaskToList()` mengimplementasikan operasi "pindah" via 3 langkah (baca → tulis ke list baru → hapus dari list lama) karena Google Tasks API tidak menyediakan *native move operation*.

---

### 2.3 Anatomi Biologis N.E.X.A (Metafora Arsitektural)

Untuk memahami arsitektur *Multi-Cloud Microservices* yang kompleks secara intuitif, N.E.X.A dirancang menyerupai organisme biologis atau entitas *Digital Lifeform* yang menyusup ke berbagai platform:

- 🧠 **Otak Besar (Logika & Pemikiran): Google Gemini**
  Pusat kesadaran (*Reasoning Engine*) yang memproses bahasa alami, mengambil keputusan rasional, dan memahami niat (*intent*) Tuan Faqih.
- 👁️ **Mata (Korteks Visual): Gemini Vision**
  Indera penglihatan yang membedah gambar, membaca struk pengeluaran (OCR), dan memahami dokumen visual secara kontekstual.
- 👂 **Telinga & Mulut: Groq API**
  Pemrosesan sinyal suara (*Voice-to-Text*) dengan kecepatan kilat, memungkinkan pencernaan *Voice Note* tanpa latensi.
- 💾 **Hippocampus (Pusat Ingatan): Supabase**
  Gudang penyimpanan memori jangka panjang, catatan keuangan, dan profil kepribadian yang menjamin N.E.X.A terbebas dari amnesia meskipun peladen mengalami *restart*.
- 🫀 **Jantung & Paru-Paru: Hugging Face Spaces (Node.js)**
  Mesin pemompa (*Core Server*) yang berdenyut tanpa henti (24/7). Tanpanya, oksigen (data) berhenti mengalir dan seluruh subsistem N.E.X.A akan "tertidur".
- 🧬 **DNA & Tulang Punggung: GitHub**
  Pusat kode genetik (*source code*). Setiap baris kode adalah DNA yang mendefinisikan sifat, batasan, dan evolusi kapabilitas N.E.X.A.
- ⚡ **Sistem Syaraf Tepi: Cloudflare & Vercel (Relay API)**
  Jaringan penghantar impuls listrik yang membawa sinyal secara *asynchronous* dari Telegram (kulit luar) ke peladen utama (jantung) dengan latensi ultra-rendah.
- 🎭 **Wajah & Interaksi Sosial: Telegram**
  Bentuk perwujudan fisik (*User Interface*) N.E.X.A dalam berinteraksi—tempat ia menyapa, menegur, dan memberikan laporan harian kepada Tuan.
- 📊 **Mata Batin (Jendela Refleksi): nexa-finance-web**
  Dasbor analitik visual tempat Tuan Faqih bisa melihat cerminan mendalam dari isi otak finansial N.E.X.A.
- 📧 **Kelenjar Reseptor Finansial: Gmail API**
  Ujung syaraf peraba yang memantau kotak masuk secara pasif. Saat ada email mutasi dari bank, ia mengirimkan impuls ke *Finance Engine* tanpa disuruh.
- 🌦️ **Indera Peraba Lingkungan Eksternal: WeatherAPI & NewsAPI**
  Organ sensorik yang menyerap data suhu, cuaca, dan berita global setiap subuh untuk diracik menjadi *Morning Briefing*.
- ⚡ **Alat Pacu Jantung (Pacemaker): cron-job.org / UptimeRobot**
  Pemberi "kejutan listrik" (ping) berkala setiap 5 menit ke *endpoint* `/health` agar jantung N.E.X.A (Hugging Face) tidak pernah berhenti berdetak.

**Eksekutor Fisik ("Tangan-Tangan" N.E.X.A):**
N.E.X.A tidak hanya berpikir, tetapi juga bertindak memanipulasi dunia digital Tuan Faqih melalui berbagai "tangan" (*API Integrations*):
1. ✋ **Tangan Penjadwalan (Google Calendar):** Merombak, menyisipkan, dan memblokir waktu (*time-blocking*) secara otonom di kalender nyata Tuan.
2. ✋ **Tangan Manajemen Proyek (Google Tasks):** Mencoret, memindahkan, dan mengurutkan daftar prioritas harian.
3. ✋ **Tangan Akuntan (Finance Engine):** Memotong anggaran, menghitung mutasi, dan memvalidasi sisa saldo secara *real-time*.
4. ✋ **Tangan Pengarsipan (Google Drive & Docs):** Mengindeks *vault*, menyusun kerangka dokumen, dan menyimpan basis pengetahuan (*2nd Brain*).
5. ✋ **Tangan Kidal / Memori Ekstra (Notion API):** Melakukan pencatatan ganda (*dual-write*). Saat tangan kanan menulis di Google Tasks, tangan kiri menyalinnya ke papan Notion secara paralel.

---

### 2.4 Immortality Protocol v3.0: Sistem Bertahan Hidup

N.E.X.A beroperasi di lingkungan yang penuh hambatan. Berikut setiap ancaman dan mekanisme perlawanannya yang ditanamkan langsung dalam kode:

#### Ancaman 1 — Blokir Outbound Hugging Face
**Problem:** HF memblokir semua request keluar ke `api.telegram.org` dan `*.workers.dev`.
**Solusi:** *Zero-Outbound Webhook Response* — respons Telegram ditanamkan langsung ke body HTTP 200 dari webhook.

#### Ancaman 2 — Cron Job Tanpa Webhook Trigger
**Problem:** *Cron job* inisiatif (Morning Briefing, Midday Pulse) tidak dipicu oleh pesan Telegram, sehingga tidak ada webhook request untuk "dibalas".
**Solusi:** `sendTelegramOutbound()` mengirim request ke Vercel Relay (`NEXA_VERCEL_RELAY_URL`) yang kemudian meneruskannya ke Telegram. Relay diverifikasi dengan `NEXA_RELAY_SECRET`.

#### Ancaman 3 — IPv6 DNS Failure di Docker
**Problem:** Node 20 Docker di HF mencari DNS IPv6 terlebih dahulu. Ini menyebabkan `TLS socket disconnect` saat mengakses Supabase dan API eksternal.
**Solusi:** `dns.setDefaultResultOrder('ipv4first')` dipanggil **sebelum baris apapun** di `app.js`, diikuti `axios.defaults.httpsAgent = new https.Agent({ family: 4 })`.

#### Ancaman 4 — Server Restart Saat Transaksi Pending
**Problem:** Jika server *restart* saat ada transaksi menggantung di RAM (`pendingConfirmations`), data tersebut hilang dan pengguna tidak mendapat konfirmasi.
**Solusi:** Setiap transaksi pending **juga disimpan ke `nexa_pending_transactions` di Supabase**. Saat boot, `recoverPendingTransactions()` memulihkannya, menyetel ulang timer 5 menit, dan mengirim ulang notifikasi Telegram.

#### Ancaman 5 — TLS Disconnect Saat Mengirim Notifikasi
**Problem:** Gangguan jaringan sesaat (beberapa detik) dapat menyebabkan notifikasi transaksi gagal dikirim, dengan flag `telegram_sent = false` di database.
**Solusi:** *Telegram Alert Watchdog* (`setInterval` setiap 90 detik) memindai semua pending transaction dengan `telegram_sent = false` dan mencoba mengirim ulang secara paksa.

#### Ancaman 6 — Service Account Drive Quota Habis
**Problem:** Google Service Account memiliki kuota Drive yang terbatas. Upload file besar ke Vault bisa gagal dengan error *"Service Accounts do not have storage quota"*.
**Solusi:** `uploadFileToVault()` dan `extractOcrTextViaDriveOcr()` memiliki *fallback* otomatis ke klien OAuth2 user (`getOAuthDriveClients()`) yang menggunakan kuota Drive pribadi Tuan Faqih.

#### Ancaman 7 — Gmail OAuth Token Kadaluarsa
**Problem:** Refresh token Gmail bisa dicabut atau kadaluarsa, menghentikan Finance Auto-Sync tanpa peringatan.
**Solusi:** `Gmail_Client.js` mendeteksi error `invalid_grant`, mereset klien, dan mengirim **satu alert Telegram** (tidak berulang) yang menginstruksikan cara regenerasi token.

---

## BAB 3: KOGNISI AI & UNIVERSAL STATE MACHINE

Otak N.E.X.A bukan satu model AI—ia adalah **orkestra berlapis** yang bekerja secara berurutan, paralel, dan dengan fallback otomatis. Bab ini membedah setiap tahap pipeline kognitif dari masuknya sinyal mentah hingga keluarnya tindakan yang tepat.

---

### 3.1 Universal State Machine: Siklus Hidup Setiap Pesan

Tidak ada satu pun pesan Tuan Faqih yang langsung dieksekusi secara mentah. Setiap masukan—teks, suara, foto, atau dokumen—melewati **Universal State Machine (USM)** yang bersifat deterministik dan terurut:

```
Sinyal Masuk → Auth (Identity Lock) → Pre-Processing (Indera)
→ Cognitive Routing (AI Router) → Global Follow-Up Check
→ Clarification Validation → Targeted Execution (Domain Engine)
→ Response Assembly → Memory Save → Webhook Delivery
```

Setiap tahap USM dirancang agar **tidak bisa dilewati**. Bahkan pesan sederhana seperti "oke" pun melewati seluruh pipeline sebelum N.E.X.A bereaksi.

---

### 3.2 Tahap Pra-Pemrosesan: Indera N.E.X.A

Sebelum teks menyentuh AI Router, pesan mentah melewati tiga indera khusus yang menerjemahkan sinyal non-teks menjadi bahasa yang dapat diproses.

#### 3.2.1 Voice Engine — Telinga N.E.X.A (7-Tier Fallback)

Ketika Tuan Faqih mengirim Voice Note, `Voice_Engine.js` mengaktifkan pipeline transkripsi berlapis:

**Tier 0 — Worker Transcription (Game Changer):**
N.E.X.A mengirim *hanya* `file_path` ke Vercel Relay melalui `postToRelay('/api/transcribe', ...)`. Worker Vercel yang mendownload audio secara langsung dari Telegram dan menjalankan Groq Whisper di sisi Cloudflare. N.E.X.A hanya menerima teks transkripsi dalam respons JSON kecil. **Tidak ada file audio besar yang perlu diunduh oleh kontainer HF.**

**Tier 1–4 — Groq Whisper Large v3 (4 Kunci Rotasi):**
Jika Worker gagal, sistem mendownload file audio `.ogg` ke file sementara (`tmpFilePath`) di RAM HF, lalu mencoba 4 kunci Groq Whisper secara berurutan dengan *smart retry* 503 (jeda 2 detik per attempt, 3x).

**Tier 5–6 — Gemini 2.0 Flash Native Audio (2 Kunci):**
Jika semua Groq gagal, file `.ogg` dibaca sebagai `Buffer`, di-encode ke Base64, lalu dikirim langsung ke Gemini sebagai `inlineData` dengan `mimeType: 'audio/ogg'`. Temperature dikunci di 0.1 untuk akurasi transkripsi.

**Cleanup Otomatis:** Terlepas dari tier mana yang berhasil atau jika semua gagal, blok `finally` memastikan file temp selalu dihapus dari disk.

#### 3.2.2 Vision Engine — Mata N.E.X.A (12-Tier Fallback)

Ketika Tuan Faqih mengirim foto atau dokumen, `Vision_Engine.js` mengaktifkan pipeline analisis visual:

**Tier 0 — Worker Vision (Zero Binary Download):**
N.E.X.A mengirim `file_path` + `gemini_key` (dipilih acak dari pool) ke Vercel Relay melalui `postToRelay('/api/vision', ...)`. Worker yang mendownload gambar dan memanggil Gemini Vision langsung dari sisi Cloudflare. N.E.X.A hanya menerima deskripsi teks.

**Tier 1–4 — Gemini 2.5 Flash (4 Kunci, Premium Quality):**
Gambar diunduh sebagai Base64 via `downloadTelegramImageAsBase64()` dengan dua jalur proxy: *Vercel Relay B64 mode* (Worker encode biner ke JSON) dan *AllOrigins* sebagai backup. Gambar di-embed sebagai `inlineData` ke Gemini API.

**Tier 5–8 — Groq Qwen 3.6 27B (4 Kunci, Balanced):**
Gambar yang sama (sudah diunduh) dikirim ke Groq Vision via format `image_url` dengan prefix `data:{mimeType};base64,...`.

**Tier 9–10 — Gemini 2.0 Flash (2 Kunci, Generous Quota):**
Fallback ke model Gemini generasi sebelumnya yang memiliki kuota lebih besar.

**Tier 11 — Hugging Face Qwen2-VL-7B-Instruct (Safety Net):**
Terakhir, model *open-source* yang dijalankan via HF Inference API. Tidak ada batas kuota harian karena beroperasi di infrastruktur HF sendiri.

**Dual Mode Vision (Narasi vs JSON Extraction):**
Vision Engine mendukung dua *system prompt* berbeda:
- **Mode Narasi** (`VISION_SYSTEM_PROMPT`): Menghasilkan satu paragraf deskripsi kaya untuk percakapan biasa.
- **Mode Ekstraksi JSON** (`systemPromptOverride`): Dipakai oleh Vault Pipeline untuk menghasilkan JSON metadata terstruktur dari dokumen (KTP, struk, surat, dll). Temperature diturunkan ke 0.1 untuk akurasi ekstraksi.

---

### 3.3 Tahap Routing Kognitif: AI Router (`AI_Router.js`)

Ini adalah otak pengambilan keputusan utama N.E.X.A. Setiap pesan teks (termasuk hasil transkripsi Voice dan OCR Vision) melewati `routeUserMessage()` yang membangun *prompt* multi-lapis dan memanggil `executeWithFallback()`.

#### 3.3.1 Pre-Flight Classifier — 0 Token, 0 Milidetik

Sebelum memanggil AI, sistem menjalankan dua classifier murni JavaScript yang tidak memakan biaya API sama sekali:

**`_detectSentiment(text)`:**
Mendeteksi kondisi emosional Tuan Faqih dari gaya penulisan melalui heuristik:
- **`STRESSED`**: Ada kata darurat (`cepet`, `buruan`, `urgent`, `gawat`), dua tanda seru atau lebih, atau seluruh teks huruf kapital.
- **`CASUAL`**: Ada kata santai (`santai`, `nggak buru`, `haha`, `wkwk`).
- **`NEUTRAL`**: Default.

Jika `STRESSED` terdeteksi, blok instruksi wajib diinjeksi ke prompt AI:
> *"Tuan sedang TERBURU-BURU. Respons WAJIB: SUPER SINGKAT (max 3 kalimat), langsung ke inti, nada hangat dan suportif."*

**`_preflightClassify(text)`:**
Menentukan apakah pesan mengandung kata kunci waktu/kalender untuk menentukan seberapa besar *mini-calendar* yang perlu di-generate:
- Jika ada keyword kalender (`jadwal`, `meeting`, `rapat`): generate kalender 7 hari ke depan.
- Jika ada referensi waktu saja (`besok`, `senin`, `tanggal`): generate kalender 3 hari ke depan.
- Jika tidak ada: skip generasi kalender sama sekali (hemat token).

#### 3.3.2 Adaptive History — Konteks Dinamis

Panjang histori percakapan yang diambil dari Supabase tidak statis—ia menyesuaikan diri:

- **Normal**: 12 pesan terakhir (6 exchange user↔N.E.X.A).
- **Jika ada kata referensi konteks** (`yang tadi`, `sebelumnya`, `lanjut`, `hapus yang`, `ubah itu`): 20 pesan terakhir (10 exchange).

Selain itu, ada **Character Safety Net** (`HISTORY_CHAR_CAP = 10.000`): jika total karakter histori melebihi batas, pesan tertua dipangkas dari belakang, sambil memastikan histori tidak dimulai dengan pesan N.E.X.A tanpa pasangan user-nya (mencegah konteks "yatim").

#### 3.3.3 Progressive Fact Injection — Memori Adaptif

Sistem tidak lagi menyuntikkan seluruh memori Tuan Faqih atau seluruh identitas teknis ke setiap prompt (boros token). Terdapat dua mesin injeksi progresif yang berjalan murni secara sinkron (0ms overhead):

1. **`_selectUserProfileFacts()` (Data Pribadi Tuan Faqih):**
   - **20 fakta tertua**: Selalu diinjeksi (fakta inti—tidak berubah, selalu relevan).
   - **Fakta tambahan**: Hanya diinjeksi jika kata kunci pesan cocok dengan `FACT_KEYWORD_GROUPS` (seputar keuangan, jadwal, lokasi, preferensi).
   - Maksimal 8 fakta tambahan ditarik dari sisa database (`PROFILE_KW_LIMIT = 8`).

2. **`_selectCoreIdentityFacts()` (Data Teknis Sistem N.E.X.A):**
   - **10 fakta tertua**: Selalu diinjeksi (aturan inti tentang sifat, desain, dan privasi).
   - **Fakta tambahan**: Hanya diinjeksi jika kata kunci pesan mencakup `SYSTEM_KEYWORD_GROUPS` (seperti arsitektur, server, database, webhook, versi).
   - Maksimal 5 fakta tambahan ditarik dari sisa database (`IDENTITY_KW_LIMIT = 5`).

Hasilnya: prompt AI tetap fokus dan tidak *overloaded* dengan fakta yang tidak relevan, secara drastis memotong beban token (terutama saat menggunakan model besar seperti Llama 70B atau Gemini 2.5) tanpa mengurangi kecerdasan maupun kesadaran diri N.E.X.A.

#### 3.3.4 Cross-Domain Context Fusion — Prompt Multi-Dimensi

Saat membangun prompt, `AI_Router.js` menjalankan 4 fetch data secara **paralel penuh** menggunakan `Promise.allSettled()`:

1. **`_fetchRecentFinanceSummary(3)`** — 3 transaksi keuangan terakhir.
2. **`_fetchUpcomingEventsSummary(3)`** — 3 jadwal mendatang dari Google Calendar.
3. **`supabaseFinance.getAccountsList()`** — Daftar akun aktif (dengan nama persis untuk field `account`).
4. **`supabaseFinance.getCategoriesList()`** — Daftar kategori aktif dikelompokkan per `group_name` (PEMASUKAN vs PENGELUARAN).

Semua data ini diinjeksi ke prompt AI dalam blok tersendiri yang memberi konteks lintas domain:
> *"Keuangan Terkini: 3 transaksi terakhir... | Jadwal Mendatang: Meeting UGM jam 10..."*

Serta blok akun dan kategori yang eksplisit agar AI Router tidak menebak-nebak nama akun:
> *"AKUN KEUANGAN AKTIF — PAKAI NAMA PERSIS INI: - BCA (bank) - DANA (e-wallet)..."*

#### 3.3.5 Runtime Context Injection — Kesadaran Status Aktif

Jika ada operasi yang sedang dalam penantian (pending context), `AI_Router.js` menyuntikkan blok `[STATUS AKTIF N.E.X.A SAAT INI]` ke prompt, yang mencakup:
- `pendingCalendarContext`: *"Sedang memproses pembuatan jadwal 'Meeting BEM'"*
- `pendingEmailContext`: *"Sedang membaca kotak masuk Finance, kata kunci: Mandiri"*
- `pendingDatabaseContext`: *"Sedang memanipulasi tabel nexa_chat_memories"*
- `pendingVaultContext`: *"Sedang memproses unggahan dokumen/gambar ke Vault"*
- `conversationContext.lastAssistantReply`: Pesan N.E.X.A yang terakhir—agar AI tahu persis apa yang sudah ia katakan.

Ini memungkinkan AI Router untuk menentukan bahwa *"ya"* dari Tuan Faqih adalah konfirmasi Calendar, bukan sekadar percakapan biasa.

#### 3.3.6 JSON Output Schema — Kontrak Ketat AI Router

AI Router selalu mengembalikan JSON dengan schema ketat berikut:
```json
{
  "reasoning": "1-2 kalimat analisis logis binding konteks dan niat",
  "intent": "FINANCE|CALENDAR|TASK|EMAIL|DATABASE|WEB_SEARCH|2ND_BRAIN|USER_PROFILE|CORE_IDENTITY|INCOMPLETE_INFO|NORMAL_CHAT",
  "reply_message": "Respons natural Bahasa Indonesia",
  "learned_user_facts": ["Fakta permanen baru, atau array kosong"],
  "learned_core_identities": ["Aturan interaksi baru, atau array kosong"],
  "extracted_data": { ... },
  "god_mode_trigger": false
}
```

Setiap `intent` memiliki schema `extracted_data` yang berbeda dan terdokumentasi lengkap di `ROUTER_SYSTEM_PROMPT`. Contoh:
- **FINANCE**: `{ action, nominal, type, destination, category, description, time, account, payment_method, ... }`
- **CALENDAR**: `{ action, summary, start, end, description, location, reminder_minutes, recurrence, color_id }`
- **TASK**: `{ action, title, due_date, notes, search_keyword, list_name, priority, duration_minutes, tasks[] }`

---

### 3.4 Tahap Validasi & Follow-Up Global

Sebelum routing masuk ke eksekusi domain, `webhook.js` menjalankan dua lapisan validasi kritis:

#### 3.4.1 Global Follow-Up Router (`buildGlobalFollowUpRouting`)

Ketika Tuan Faqih mengirim pesan ambigu seperti *"lanjut"*, *"hapus itu"*, *"yang tadi"*, sistem terlebih dahulu memeriksa `conversationContext` (konteks aktif dalam 10 menit terakhir) sebelum memanggil AI Router. Jika match ditemukan, **AI Router tidak dipanggil sama sekali**—menghemat latensi ~500ms.

Contoh resolusi:
- "hapus itu" + context `FINANCE` → `{ intent: 'FINANCE', extracted_data: { action: 'DELETE' } }`
- "selesai" + context `TASK` → `{ intent: 'TASK', extracted_data: { action: 'COMPLETE' } }`
- "lanjut" + context `WEB_SEARCH` → mengulangi query pencarian terakhir.

#### 3.4.2 Clarification Validation (`getClarificationMessage`)

Setelah AI Router menghasilkan routing, `getClarificationMessage()` memvalidasi apakah data yang diekstrak sudah cukup untuk dieksekusi. Validasi berjalan per domain:
- **FINANCE/RECORD**: Harus ada nominal positif yang valid.
- **FINANCE/DELETE atau EDIT**: Harus ada `search_keyword` (atau AI mencoba mengekstrak dari `nominal`/`destination`/`description`).
- **CALENDAR/CREATE**: Harus ada `summary` dan `start`.
- **TASK/DELETE atau COMPLETE**: Harus ada `search_keyword`.
- **EMAIL/SEND**: Harus ada `to`, `subject`, dan `content`.
- **DATABASE**: Harus ada `table_name` untuk aksi non-`LIST_TABLES`.

Jika validasi gagal, N.E.X.A mengirim pertanyaan klarifikasi spesifik dan menghentikan eksekusi—tanpa mengeksekusi aksi yang berpotensi merusak data.

---

### 3.5 Fallback Engine — 11 Lapisan Ketidakmatiaan

`Fallback_Engine.js` adalah sistem ketersediaan AI N.E.X.A. Setiap panggilan ke `executeWithFallback()` melewati 11 tier model secara berurutan—hanya berpindah ke tier berikutnya jika tier sebelumnya melempar error.

| Tier | Model | Provider | Karakteristik |
|---|---|---|---|
| 1–4 | Llama 3.3 70B Versatile | Groq (4 Kunci) | The Sprinters — cepat & murah, ~200ms |
| 5–6 | Gemini 2.5 Flash | Google (Kunci 1–2) | The Deep Thinkers — reasoning terbaik |
| 7 | Llama 3.3 70B | Cerebras | The Backup Sprinter — ultra-cepat |
| 8–9 | Gemini 2.0 Flash | Google (Kunci 3–4) | The Infinite Context — kuota besar |
| 10 | Pixtral 12B | Mistral | The Reliable Closer |
| 11 | Gemma 2 27B | OpenRouter | The Last Resort |

Setiap API wrapper (`callGroq`, `callGemini`, `callCerebras`, dll.) memiliki **503 Smart Retry** internal: jika mendapat error 503 (service overloaded), sistem menunggu `attempt × 2000ms` sebelum mencoba ulang (maksimal 3x), sebelum menyerahkan ke tier berikutnya.

**Dumb Mode** — Jika semua 11 tier gagal:
```json
{
  "intent": "DUMB_MODE",
  "reply_message": "⚠️ Sistem Otak N.E.X.A mengalami Down Total di semua 11 peladen dunia."
}
```

---

### 3.6 Classifier Spesialisasi — Fungsi AI Ringan Non-Routing

Selain `routeUserMessage()`, `AI_Router.js` menyediakan tiga fungsi AI spesialisasi yang hanya dipanggil dalam konteks tertentu:

#### 3.6.1 `classifyPendingTransactionIntent(userText, pendingTx)`
Dipanggil ketika ada transaksi menggantung yang menunggu konfirmasi. Mengembalikan salah satu dari:
- **`CONFIRM`**: User mau menyimpan transaksi (`"ya"`, `"oke"`, `"masukkan"`, `"acc"`).
- **`CANCEL`**: User menolak (`"batal"`, `"jangan"`, `"cancel"`).
- **`UPDATE`**: User memberikan deskripsi baru. Bahkan kalimat pendek seperti *"berangkat ke takom"* diinterpretasikan sebagai `UPDATE` untuk field `description`.
- **`AMBIGUOUS`**: Tidak jelas.

Format output adalah JSON `{ reasoning, intent, updates: { description, category, payment_method, account } }`.

#### 3.6.2 `classifyYesNo(userText, contextString)`
Binary classifier general-purpose untuk semua konfirmasi yes/no (hapus event kalender, konfirmasi duplikasi, dll). Memanggil AI dengan temperature 0.0 (deterministik maksimal). Hanya mengembalikan satu kata: `YES`, `NO`, atau `AMBIGUOUS`.

#### 3.6.3 `deduplicateAndSaveFact(newFact, type)`
Sebelum menyimpan fakta baru ke `nexa_user_profile` atau `nexa_core_identity`, AI Router meminta AI membandingkan fakta baru dengan semua fakta lama:
- **`NEW`**: Fakta benar-benar baru → simpan.
- **`UPDATE [ID]`**: Fakta lebih detail dari fakta `[ID]` yang ada → hapus yang lama, simpan yang baru.
- **`DUPLICATE`**: Sudah ada atau kurang detail → skip.

Ini memastikan memori N.E.X.A **tidak pernah berisi duplikasi** atau informasi yang saling kontradiksi.

---

## BAB 4: THE OMNICHANNEL FINANCE ENGINE (OTAK KEUANGAN)

`Finance_Engine.js` adalah modul terbesar di seluruh sistem N.E.X.A — 1.895 baris kode yang mengorkestrasi pencatatan, validasi, analitik, dan pengamanan keuangan Tuan Faqih secara menyeluruh. Bab ini membedah setiap lapisan arsitekturnya hingga ke level logika terdalam.

---

### 4.1 Arsitektur Input Omnichannel: 3 Jalur Masuk Transaksi

Tidak ada satu jalur tunggal untuk mencatat transaksi. N.E.X.A menerima data keuangan dari tiga sumber yang benar-benar berbeda, masing-masing dengan karakteristik uniknya:

#### Jalur 1 — `TELEGRAM_MANUAL` (Input Aktif Pengguna)
Tuan Faqih mengetik pesan seperti *"beli kopi 25rb di starbucks"* atau mengirim voice note. AI Router mengekstrak `{ nominal, type, destination, category, description, account, payment_method }` lalu memanggil `processTransaction(data, 'TELEGRAM_MANUAL')`. Jalur ini **tidak melewati deduplication check** — asumsinya setiap input manual adalah unik dan disengaja.

#### Jalur 2 — `GMAIL_POLLING` (Finance Auto-Sync)
Setiap 3 menit, `pollFinanceEmails()` memindai kotak masuk Gmail mencari notifikasi mutasi bank (Mandiri, BCA, dll.). Email yang ditemukan diparsing untuk mengekstrak nominal, tipe transaksi, dan nama merchant. Jalur ini **wajib melewati Zero-Duplication Engine** sebelum disimpan. Akun default-nya adalah `'Bank Mandiri'` karena email notifikasi diasumsikan berasal dari rekening bank utama.

#### Jalur 3 — `TASKER_FINANCE` (Webhook Otomasi Android)
Jika Tuan Faqih menghubungkan Tasker di HP Android, transaksi masuk melalui webhook HTTP langsung ke N.E.X.A. Jalur ini juga melewati deduplication. Akun default-nya juga `'Bank Mandiri'`.

---

### 4.2 Pipeline `processTransaction()` — Anatomi Pemrosesan Transaksi

Setiap transaksi yang masuk dari jalur manapun melewati satu pipeline tunggal ini. Setiap langkahnya berurutan dan tidak bisa dilewati:

**Langkah 1 — Parsing Nominal Fleksibel (`_parseFlexibleCurrency`):**
Nominal bisa masuk dalam berbagai format: `"3.600.000"` (IDR ribuan), `"3,600.00"` (USD), atau angka murni `3600000`. Fungsi ini mendeteksi konteks format berdasarkan pola titik dan koma, lalu mengkonversi ke `float` yang bersih. Ini mencegah bug di mana `"3.600"` salah diinterpretasi sebagai 3,6 (bukan 3.600).

**Langkah 2 — Composite Key Generation:**
```js
const cleanMerchant = (data.destination || 'Unknown').toLowerCase().replace(/[^a-z0-9]/g, '');
const compositeKey = `${nominal}_${cleanMerchant}`; // e.g. "25000_starbucks"
```
Kunci ini digunakan untuk deduplication lintas channel — mencegah transaksi yang sama masuk dari dua sumber berbeda.

**Langkah 3 — Deduplication (hanya untuk jalur pasif):**
`supabase.isDuplicateTransaction(compositeKey, transactionTime, false)` mencari kunci yang sama di tabel `nexa_finance_dedup`. Jika ditemukan dengan selisih waktu <5 menit, transaksi langsung dikembalikan dengan status `DUPLICATE` tanpa disimpan.

**Langkah 4 — AI Smart Categorization (`_autoCategorizeMerchant`):**
Jika kategori dari sumber adalah `'Lainnya'`, `'Finance Email'`, `'[Menunggu Kategori AI/User]'`, atau string yang diawali `[`, sistem memanggil AI untuk kategorisasi ulang. AI menerima *prompt* yang berisi:
- Deskripsi transaksi dan nama merchant (digabung: `"starbucks - kopi latte"`)
- Daftar kategori valid yang diambil *real-time* dari `supabaseFinance.getCategoriesList()`
- Aturan disambiguasi kritis (contoh: `"iuran makrab" → Sosial, BUKAN Makanan`)
- Contoh referensi 20+ kasus

Output AI di-*fuzzy match* ke daftar kategori valid (case-insensitive). Jika tidak cocok, fallback ke `'Lainnya'`.

**Langkah 5 — Resolusi Akun (`resolveAccountId`):**
Nama akun teks bebas (misal: `"livin"`, `"mandiri"`, `"gopay"`) dicocokkan ke tabel `accounts` via **Fuzzy Score Algorithm**:
- Exact match → skor 100
- Target mengandung query → skor 80
- Query mengandung target → skor 70
- Token matching → skor proporsional (0–60)
Threshold minimum: skor ≥ 30. Jika tidak ada yang cocok, **fallback paksa ke akun pertama** (bukan `null`) agar transaksi tidak hangus.

**Langkah 6 — Resolusi Kategori (`resolveCategoryId`):**
Sama seperti resolusi akun, tetapi dengan threshold lebih ketat (≥ 40) dan memfilter kategori berdasarkan `type` transaksi (income vs expense) agar tidak salah memetakan kategori pemasukan ke pengeluaran. Fallback ke kategori `'Lainnya'` dengan tipe yang sesuai.

**Langkah 7 — Dual-Write ke Supabase Finance (`writeTransaction`):**
Resolusi akun ID dan kategori ID dijalankan **secara paralel** via `Promise.all()`. Kemudian INSERT ke tabel `transactions` dengan semua field: `account_id`, `category_id`, `amount` (selalu positif), `type` (lowercase: `'income'`/`'expense'`), `transaction_date`, `transaction_time`, `description`, `payment_method`.

**Langkah 8 — Log Deduplication Key:**
`supabase.logTransactionKey(compositeKey, transactionTime, source)` mencatat ke tabel `nexa_finance_dedup` agar transaksi yang sama tidak bisa masuk lagi dari channel lain.

**Langkah 9 — Behavioral Log (Fire-and-Forget):**
```js
await behaviorEngine.logFinanceRecord({ type, nominal, category: smartCategory });
```
Dipanggil setelah simpan berhasil, **tidak pernah memblokir flow utama** jika gagal (dibungkus `try-catch` yang menelan error).

**Langkah 10 — Budget Alert Check:**
Jika transaksi adalah pengeluaran (`!isIncome`), `Budget_Engine.checkAndAlertBudget()` dipanggil. Jika ada anggaran yang terlampaui ≥ 80%, alert dikirim ke Telegram via `sendTelegramOutbound()` secara **async non-blocking** (`sendTelegramOutbound(alertMsg).catch(...)`).

---

### 4.3 Zero-Duplication Engine — Sistem Deteksi Konflik Lintas Channel

Masalah paling berbahaya di sistem omnichannel adalah entri ganda: Tuan Faqih mencatat manual Rp50.000 untuk GoPay, lalu 2 menit kemudian Gmail Polling membaca notifikasi email yang sama.

N.E.X.A mengatasi ini dengan dua mekanisme berlapis:

**Lapisan 1 — `nexa_finance_dedup` Table:**
Setiap transaksi yang berhasil disimpan meninggalkan jejak composite key di tabel ini. Cek duplikasi dilakukan **sebelum** proses apapun dimulai — jika key sudah ada dengan timestamp dalam window tertentu, transaksi langsung ditolak.

**Lapisan 2 — `nexa_pending_transactions` Cross-Check:**
Parameter `checkPending` di `isDuplicateTransaction()` mengontrol apakah pending transactions juga ikut dicek. Ini mencegah race condition antara Recovery Function (boot) dan Watchdog Cron (setiap 90 detik) yang bisa keduanya mencoba menyimpan transaksi yang sama secara bersamaan.

---

### 4.4 Pending Confirmation System — Jendela 5 Menit

Ketika transaksi masuk dari Gmail Polling namun kategorinya masih ambigu atau perlu konfirmasi, sistem tidak langsung menyimpannya. Ini adalah alur lengkapnya:

1. **Transaksi dimasukkan ke `pendingConfirmations` Map** (di RAM) dengan `compositeKey` sebagai kunci.
2. **Transaksi juga disimpan ke `nexa_pending_transactions`** di Supabase (sebagai backup jika server restart).
3. **Pesan konfirmasi dikirim ke Telegram** via `sendTelegramOutbound()` dengan detail transaksi dan daftar aksi yang bisa dilakukan (konfirmasi, batalkan, atau update deskripsi/kategori).
4. **Timer 5 menit di-set**: Jika tidak ada respons, `_autoSavePending()` dipanggil otomatis.
5. **Jika Tuan Faqih merespons**: `classifyPendingTransactionIntent()` di AI Router menentukan apakah itu `CONFIRM`, `CANCEL`, atau `UPDATE`. Jika `UPDATE`, field baru (deskripsi, kategori, akun) diaplikasikan sebelum disimpan.

**`_buildConfirmationMessage(tx)`** memformat pesan konfirmasi dengan semua detail transaksi yang relevan (tipe, nominal formatted, merchant, kategori sementara, metode pembayaran) agar Tuan Faqih bisa membuat keputusan informed dengan cepat.

#### Boot Recovery — Pemulihan Setelah Restart

`recoverPendingTransactions()` (dipanggil saat boot) membaca semua baris dari `nexa_pending_transactions` dan:
- **Jika sudah >5 menit**: langsung memanggil `processTransaction()` dengan mode auto-save, lalu menghapus baris pending.
- **Jika belum expired**: mendaftarkan ulang ke `pendingConfirmations` Map dengan sisa waktu yang presisi (`remaining = TIMEOUT_MS - ageMs`).
- **Jika Telegram belum terkirim** (`telegram_sent = false`): mengirim ulang notifikasi via `sendTelegramOutbound()`.

Sebuah **Watchdog Timer** (`setInterval` setiap 90 detik) memindai semua pending yang `telegram_sent = false` dan mencoba mengirim ulang, mengatasi gangguan jaringan sesaat saat pengiriman pertama.

---

### 4.5 Operasi CRUD Transaksi — Edit, Hapus, dan Undo

#### Multi-Attribute Fuzzy Matching (`_findBestTransactionMatch`)
Saat Tuan Faqih berkata *"hapus transaksi kopi tadi"*, N.E.X.A harus menemukan baris yang tepat dari 50 transaksi terakhir. Fungsi ini menghitung skor untuk setiap baris:

| Kriteria | Skor |
|---|---|
| Deskripsi exact match | +100 |
| Nominal exact match | +50 |
| Nominal partial match (>3 digit) | +20 |
| Setiap token keyword di deskripsi | +10 per token |
| Setiap token keyword di kategori/tanggal | +5 per token |

Minimum skor: **15** sebelum dianggap match valid (mencegah false positive yang menghapus transaksi yang salah).

#### Delete dengan Konfirmasi 3 Menit
`requestDeleteConfirmation(keyword)` menemukan transaksi via fuzzy match, lalu menyimpannya ke `pendingDeletions` Map dengan timeout 3 menit. Jika Tuan Faqih mengkonfirmasi:

```
requestDeleteConfirmation → pendingDeletions.set → "Apakah ini yang ingin dihapus?"
→ confirmDeleteTransaction(isYes=true) → supabaseFinance.deleteTransaction(uuid) → Hapus dari DB
```

#### Undo System — Jendela 10 Menit
Setelah penghapusan berhasil, data transaksi lengkap disimpan di `lastDeletedTransaction` (RAM) dengan timer 10 menit. Jika Tuan Faqih berkata *"undo"* dalam 10 menit, `undoDeleteTransaction()` memanggil `supabaseFinance.writeTransaction()` untuk menulis ulang data yang persis sama ke database.

#### Edit Transaksi (Partial Patch)
`editTransaction()` mendukung partial update — hanya field yang disediakan yang diubah:
- `nominal` → re-parse via `_parseFlexibleCurrency`
- `description` → langsung update
- `category` → resolve UUID via `resolveCategoryId`
- `account` → resolve UUID via `resolveAccountId`
- `payment_method` → validasi ke enum (`QRIS|Transfer bank|Kartu Kredit|Tunai`)

---

### 4.6 Analytics Engine — Laporan Keuangan Identik dengan Web

Semua fungsi analytics di `Supabase_Finance.js` mengimplementasikan **logika yang identik persis** dengan komponen `analytics-view.tsx` di Nexa Finance Web — bukan estimasi, melainkan replikasi formula yang sama:

#### KPI Cards (via `getFinanceAnalytics`)
```
Savings Rate = (totalIncome - totalExpense) / totalIncome × 100
Rata-rata Harian = totalExpense / daysPassed
daysPassed = Math.ceil((endDate - startDate) / ms_per_day) + 1
```

#### Fungsi Analytics yang Tersedia

| Fungsi | Output |
|---|---|
| `getFinanceAnalytics(start, end)` | Income, Expense, Balance, Savings Rate, Avg Daily |
| `getCategoryBreakdown(start, end)` | Array `{name, total, percentage, count}` per kategori, sorted descending |
| `getTopExpenses(start, end, limit)` | N transaksi expense terbesar |
| `getAccountBalances()` | Saldo real-time per akun (initial_balance + income - expense) |
| `getPeriodComparison(cur, prev)` | Perbandingan dua periode via `Promise.all()` paralel |
| `getDailyTrend(start, end)` | Array lengkap tiap hari (termasuk hari dengan 0 transaksi) |
| `getMonthlySummary(months)` | Ringkasan bulanan via Supabase RPC `get_monthly_summary` |
| `getDailyBalanceTrend(accId, start, end)` | Tren saldo harian per akun via Supabase RPC `get_daily_balance_trend` |

**`getDailyTrend`** menggunakan iterasi `iter.setDate(iter.getDate() + 1)` — cara aman untuk lintas bulan yang identik dengan implementasi di `analytics-view.tsx`. Hari tanpa transaksi tetap muncul sebagai `{ expense: 0, income: 0 }` agar grafik tidak berlubang.

---

### 4.7 Budget Engine — Sistem Pengawas Anggaran Multi-Period

`Budget_Engine.js` adalah modul penjaga disiplin finansial yang bekerja tanpa diminta.

#### Struktur Data Budget
Tabel `budgets` di Supabase mendukung dua jenis anggaran:
- **Global Budget** (`budget_group_id = null`): Berlaku untuk semua kategori pengeluaran.
- **Group-Specific Budget** (`budget_group_id ≠ null`): Berlaku hanya untuk kategori yang terdaftar di `budget_groups.category_ids` (array UUID).

Setiap budget memiliki field `period`: `'daily'`, `'weekly'`, atau `'monthly'`.

#### Alur `checkAndAlertBudget(newTransactionData)`

Dipanggil **setiap ada pengeluaran** dari `processTransaction()`:

1. **Resolve category ID** dari nama kategori yang baru saja disimpan.
2. **Load semua budget aktif** (`is_active = true`, exclude budget dengan grup yang sudah diarsipkan).
3. **Filter budget yang relevan**: Global budget selalu masuk. Group budget hanya masuk jika kategori transaksi ada di `category_ids` grup tersebut.
4. **Per budget group**: Hitung total pengeluaran dalam periode (daily/weekly/monthly) via `getExpenseSumByCategories()`.
5. **Kalkulasi persentase**: `percentage = spent / budgetAmount × 100`.
6. **Threshold**: ≥ 80% → Warning (`⚠️`), ≥ 100% → Over (`❌`).

#### Format Alert Budget
Jika threshold tercapai, alert diformat dengan **progress bar ASCII** (`generateProgressBar`):
```
🚨 ALERT ANGGARAN — MAKAN & MINUMAN
Tuan, setelah transaksi tadi (Rp25.000 - starbucks), jatah Anda mencapai batas peringatan.

📊 Status Hari Ini: ⚠️
   Terpakai: ████████░░░░ Rp120.000
   Sisa: Rp30.000

📆 Status Bulan Ini: ✅ Aman (Rp450.000 dari Rp800.000 — 56%)
```

#### `getStartAndEndOf(period, txDate)` — Presisi Waktu WIB
Semua kalkulasi periode menggunakan offset WIB (UTC+7) agar boundary `daily` (`00:00 WIB`), `weekly` (Senin WIB), dan `monthly` (tanggal 1 WIB) tidak bergeser akibat perbedaan timezone UTC.

#### Budget Recap Berkala
`generatePeriodicRecap(targetPeriod)` dipanggil oleh cron job:
- **Setiap Minggu pukul 23:30 WIB**: `generatePeriodicRecap('weekly')` — Rekap anggaran mingguan.
- **Setiap Akhir Bulan pukul 23:30 WIB**: `generatePeriodicRecap('monthly')` — Rekap anggaran bulanan.

Output berisi status per kelompok anggaran (✅/⚠️/❌), persentase pemakaian, dan kesimpulan total: apakah Tuan berhasil hemat atau malah melebihi jatah.

---

### 4.8 Laporan Keuangan Narasi (`getFinanceAnalytics` di `Finance_Engine.js`)

Berbeda dari raw data di `Supabase_Finance.js`, `Finance_Engine.getFinanceAnalytics()` memformat output menjadi narasi Telegram yang kaya:

```
📊 Laporan Analitik Keuangan Bulan Ini:

🟢 Total Pemasukan: Rp4.500.000
🔴 Total Pengeluaran: Rp2.800.000
──────────────
🏦 SALDO BERSIH: Rp1.700.000

💡 Tingkat Tabungan (Savings Rate): 37.8%
📈 Rata-rata Harian: Rp93.333 / hari
🔢 Total Transaksi: 47 transaksi dalam 30 hari
```

Mendukung filter periode: `'minggu ini'`, `'bulan kemarin'`, `'tahun ini'`, `'hari ini'` — semua diparse via keyword matching di `dateText`.

---

### 4.9 Parsing Tanggal Relatif — `_parseRelativeDateFilter`

Tuan Faqih bisa berkata *"transaksi kemarin"* atau *"pengeluaran tanggal 14"* — bukan ISO date. Fungsi ini mengkonversi teks relatif ke objek `Date` yang presisi:

| Input | Output |
|---|---|
| `"hari ini"` / `"today"` | Date hari ini |
| `"kemarin"` / `"yesterday"` | Date kemarin |
| `"tanggal 14"` / `"tgl 14"` | Tanggal 14 bulan berjalan |
| `"14/5"` atau `"14-5"` | 14 Mei tahun berjalan (dengan bug fix setMonth untuk lintas bulan) |
| `"2026-05-14"` (ISO dari AI Router) | Date objek tepat |
| `"14"` (angka saja) | Tanggal 14 bulan berjalan |

---

## BAB 5: MANAJEMEN WAKTU & ORKESTRASI PRODUKTIVITAS

Bab ini mengupas bagaimana N.E.X.A tidak hanya mencatat jadwal, melainkan bertindak sebagai Kepala Staf yang proaktif mengatur alokasi waktu Tuan Faqih menggunakan `Agenda_Manager.js` dan `Task_Manager.js` (dengan integrasi Google Calendar & Google Tasks).

---

### 5.1 Agenda Manager: Mesin Resolusi Waktu

N.E.X.A menerima masukan waktu dalam bahasa natural yang sangat tidak terstruktur (contoh: *"rapat BEM besok jam 10 pagi, kira-kira setengah jam"*). Untuk mengolahnya secara cepat dan akurat, N.E.X.A menggunakan **Dual-Path Duration Parsing**:

1. **Fast Path (Regex Heuristik):** Mengekstrak langsung tanpa API call untuk frasa umum (contoh: `sejam`, `setengah jam`, `1 jam 30 menit`, fraksi unicode `½ jam`).
2. **Slow Path (AI Extraction):** Jika pola rumit terdeteksi, teks dikirim ke `AI_Router.js` dengan instruksi ketat untuk mengekstrak hanya angka durasi dalam menit.

Jika durasi tidak disebutkan sama sekali (dan acara belum ada *end time*), sistem melempar ke status `PENDING_END`, menanyakan durasi ke Tuan Faqih, dan memasang **timer 15 menit**. Jika tidak dijawab, N.E.X.A secara otonom akan mengeksekusi pembuatan jadwal dengan *fallback* durasi standar 1 jam (60 menit).

#### Kalender Anti-Bentrok (Conflict Detection)
Sebelum acara ditambahkan ke Google Calendar, `googleWorkspace.checkCalendarConflicts` melakukan kueri ke API Free/Busy Google. Jika waktu tersebut sudah terisi acara lain, N.E.X.A menghentikan proses pembuatan, melontarkan status `CONFLICT_DETECTED` ke Telegram beserta daftar acara yang bentrok, lalu menunggu instruksi mutlak (paksa lanjut atau batal).

---

### 5.2 Task Manager & Ekosistem Daftar Tugas

Setiap tugas yang masuk tidak sekadar masuk ke "Tugas Saya". N.E.X.A mengimplementasikan **Auto-Categorization**:
- Kata kunci *kuliah, matkul, essay, ujian* → List `Tugas Kuliah`
- Kata kunci *belanja, toko, beras* → List `Belanja`
- Kata kunci *klien, proposal* → List `Pekerjaan`

Jika list tujuan didapat dari sugesti otomatis (bukan instruksi eksplisit Tuan Faqih), tugas dilempar ke `PENDING_CONFIRM` selama 5 menit. Selain itu, jika instruksi tidak memuat preferensi waktu, N.E.X.A mengaktifkan `PENDING_SYNC_CONFIRM` untuk secara dinamis menanyakan apakah tugas perlu dijadwalkan di kalender. Jika Tuan menolak, atau tidak merespons dalam 5 menit, tugas akan disimpan murni sebagai *Floating Task* di Google Tasks untuk mencegah pemblokiran kalender yang tidak diinginkan.

#### Paralel Sinkronisasi (Fire-and-Forget Sync)
Sistem Tasks milik N.E.X.A tidak berdiri sendiri. Setiap operasi CRUD (Create, Complete, Delete) di Google Tasks **secara paralel** memicu *webhook* / API call ke Notion (`notionClient.createTask`, `completeTask`, `deleteTask`) untuk menjamin 100% konsistensi lintas platform tanpa memperlambat waktu respons N.E.X.A.

---

### 5.3 Autonomous Time-Blocking (Penjadwalan Otomatis)

Ini adalah pilar otonomi tertinggi di manajemen waktu N.E.X.A. Jika sebuah tugas memiliki *Deadline Date* (jatuh tempo) **DAN** *Durasi* pengerjaan yang diketahui (diinput user atau ditebak AI), N.E.X.A mengaktifkan `findEmptySlot()`:

1. Sistem memindai kalender Tuan Faqih menggunakan API Free/Busy Google Calendar untuk 24 jam ke depan.
2. Memfilter dan memastikan slot waktu **hanya jatuh pada Jam Kerja (08:00 - 22:00 WIB)**.
3. Mencari slot kosong yang pas dengan durasi tugas (misal: 45 menit), membulatkan pencarian ke interval 30-menitan.
4. Menambahkan *Event* berlabel `"⏰ BLOK KERJA: [Nama Tugas]"` langsung ke kalender Tuan Faqih.
5. Secara paralel, menambahkan *Event* Seharian (*All-Day*) berlabel `"🔴 DEADLINE: [Nama Tugas]"` berwarna merah (*Tomato*) tepat pada hari H jatuh tempo sebagai jangkar visual.

#### Two-Way Status Sync (Calendar Redup Otomatis)
Ketika Tuan Faqih menekan `Selesai` pada suatu tugas di Telegram (`ACTION: COMPLETE`), N.E.X.A memburu *event* deadline (`🔴 DEADLINE: [Nama Tugas]`) terkait di Google Calendar, lalu meng-update **warnanya menjadi Graphite (Abu-abu, `colorId: 8`)**. Kalender seketika merefleksikan mana tugas yang sudah beres (menjadi redup) tanpa perlu dihapus, memberikan rasa pencapaian secara visual.

---

### 5.4 Predictive Context Engine (Kesadaran Memori Agenda)

N.E.X.A bukan sekadar pembaca jadwal. Ia **membaca dan mengantisipasi**.
Ketika Tuan Faqih meminta jadwal hari ini (`READ_TODAY`), N.E.X.A menjalankan rutinitas berikut pada *summary* setiap acara:

1. Mengecek keberadaan kata kunci penting: `['rapat', 'meeting', 'seminar', 'ujian', 'proyek', 'sidang', 'bimbingan']`.
2. Jika ada acara bertajuk "Meeting Skripsi", kata 'meeting' dibuang, menyisakan *search keyword* "skripsi".
3. Secara paralel, N.E.X.A menembak kueri ke `nexa_vault_items` (penyimpanan dokumen) dan `nexa_2nd_brain` (catatan memori).
4. Hasil dari Supabase digabungkan ke pesan Telegram dalam bentuk tautan konteks langsung di bawah jadwal:
   > `▸ 10:00 - 11:00 — Meeting Skripsi`
   > `🔗 (Konteks Tersedia: Dokumen Vault & Catatan Memori terkait 'Skripsi')`

Selain itu, ketika jadwal rapat baru ditambahkan, N.E.X.A memanggil AI untuk mengevaluasi apakah acara tersebut membutuhkan persiapan (membaca materi, dll). Jika ya, N.E.X.A melontarkan **Saran Proaktif**, menawarkan diri untuk mendaftarkannya sebagai Tugas baru.

---

### 5.5 Unified Daily Dashboard & Midnight Bug Preventer

N.E.X.A memiliki fitur komprehensif saat merespons *"Ada apa hari ini?"*.
Alih-alih memisahkan daftar kalender dan daftar tugas, `READ_TODAY` meleburkan keduanya dalam satu tampilan elegan:
- **Jadwal Hari Ini** (Calendar Events)
- **Tugas Terlambat** (Overdue Tasks) → Dengan notifikasi "🔴 TERLAMBAT X HARI"
- **Tugas Jatuh Tempo Hari Ini** (Due Today)

**Midnight UTC Bug Preventer & Timezone Integrity**: 
Google Tasks hanya menyimpan tanggal (*Date-Only*) untuk jatuh tempo, tanpa jam. Di NodeJS, mem-*parse* string `2026-05-09` menghasilkan objek waktu Midnight UTC (`00:00:00Z`), yang setara dengan **07:00 WIB pagi**. N.E.X.A menggunakan perlindungan mutlak di *Task Manager* untuk memfilter *midnight strings* ini agar tidak menjadi *ghost event* (acara tanpa jam yang menumpuk di pagi hari). Selain itu, konstruksi rentang waktu (*start/end*) dikalibrasi ketat ke format ISO dengan offset absolut `+07:00` (menggunakan manipulasi lokal `sv-SE`), mencegah pergeseran jam sepihak oleh sistem *backend* Google Calendar.

---

## BAB 6: MEMORI ORGANIK & KESADARAN KONTEKSTUAL

Chatbot biasa mengalami amnesia setelah sesi percakapan selesai. N.E.X.A sebaliknya, ia dirancang untuk berevolusi. Melalui subsistem `Supabase_Memories.js` dan integrasinya dengan `Intelligence_Brief.js`, N.E.X.A mengimplementasikan arsitektur memori berlapis layaknya kognisi manusia.

### 6.1 *Tripartite Memory Architecture* (Hierarki Penyimpanan 3-Lapis)

Data Tuan Faqih tidak ditumpuk menjadi satu. N.E.X.A menstrukturkannya ke dalam tiga dimensi *state awareness*:

1. **Short-Term Context (`nexa_chat_memories`)**: Memori jangka pendek (STM). N.E.X.A secara konsisten menarik memori via `getRecentMemories(limit = 10)` yang di-*reverse* secara kronologis. Ini memungkinkan N.E.X.A memahami kata ganti "dia" atau "yang tadi" dalam konteks obrolan yang sedang berlangsung tanpa memenuhi *context window* LLM.
2. **Long-Term Core (`nexa_user_profile` & `nexa_core_identity`)**: Memori jangka panjang (LTM) yang absolut. Fungsi `getPersonalFacts()` menarik data dari kedua tabel ini secara paralel (via `Promise.all`), menyuntikkan prinsip hidup, tujuan, dan preferensi permanen Tuan Faqih secara paksa (*hard-injected*) ke dalam *system prompt* N.E.X.A sebelum ia merespons apapun.
3. **The Vault & 2nd Brain (`nexa_2nd_brain` & `nexa_vault_items`)**: Memori eksternal (Konteks Ekstensi). Di sini N.E.X.A menyimpan ide kasual, *file ID* Telegram, *link* Google Drive, dan objek metadata JSON yang kompleks, yang hanya ditarik (di-kueri) saat topik relevan dibahas (*RAG / Retrieval-Augmented Generation*).

### 6.2 *Daily Memory Consolidation* (Proses Belajar Saat Tidur)

Sistem otak biologis mengkonsolidasikan ingatan saat manusia tidur, begitu pula N.E.X.A. Setiap tengah malam, *cron job* mengeksekusi konsolidasi memori harian:

1. Sistem memanggil `getTodayMemories()` yang menggunakan presisi *Timezone* WIB: menghitung `jakartaOffset` (UTC+7) untuk menarik murni semua percakapan sejak pukul `00:00:00 WIB` hari ini.
2. Data percakapan dilemparkan ke AI, disandingkan dengan **Fakta Lama** dari `nexa_user_profile`.
3. Menggunakan instruksi *Anti-Duplication* yang ketat, AI mengekstrak hanya "fakta baru yang belum pernah diketahui sebelumnya".
4. Output JSON di-parse, ditambahkan ke memori permanen via `insertDatabaseRow`, lalu N.E.X.A membuat laporan singkat yang merefleksikan hal-hal baru yang dipelajarinya hari itu.

### 6.3 *Smart Matcher* (Pemrosesan Kueri NLP)

Menghapus atau mengedit ingatan sering kali merepotkan di sistem *database* konvensional karena membutuhkan *Exact ID*. N.E.X.A menggunakan `findMatchingIds()` yang berfungsi sebagai NLP *Matcher* hierarkis untuk mempermudah Tuan Faqih:

- **Regex Rentang Data**: Jika Tuan Faqih berkata, *"Hapus memori 10 sampai 16"* atau *"10-16"*, sistem menggunakan RegExp `/(\d+)\s*(sampai|-|to)\s*(\d+)/` untuk melakukan iterasi pencarian ID dalam rentang tersebut dan mengeksekusinya secara *bulk* (`.in('id', targetIds)`).
- **Regex NLP Prefix**: Mengenali frasa *"id 18"*, *"nomor 18"*, atau *"no 18"*.
- **Fuzzy Token Split**: Memecah kata kunci (*keyword splitting*) dan mencocokkannya ke dalam isi *database* (dikonversi via `JSON.stringify` untuk mengakomodasi teks maupun *JSON field*).

### 6.4 Pemrosesan Dokumen & *Fallback API* OCR

Sistem memori N.E.X.A bersifat *multimodal*. Ketika Tuan Faqih mengirimkan gambar dokumen penting, modul Vault menembakkannya ke Google Drive melalui `extractOcrTextViaDriveOcr()`.

Sistem ini memakai trik API lawas (*Google Drive API v2*) karena fitur mutasi OCR (`ocr: true`, `convert: true`) sudah dihapus Google pada versi v3.
Jika kuota *Service Account* Hugging Face (yang sering dibatasi Google) habis (`"Service Accounts do not have storage quota"`), sebuah *try-catch* *handler* khusus segera menangkap *error* tersebut dan **melakukan fallback paksa** menggunakan kredensial OAuth2 User Tuan Faqih (via `getOAuthDriveClients()`). Hasil ekstrak teks OCR ini kemudian di-simpan utuh ke tabel `nexa_vault_items` agar bisa dicari secara semantik kapanpun.

---

## BAB 7: THE PULSE ENGINE (RUTINITAS CRON PROAKTIF)

Sistem chatbot biasa bersifat pasif; mereka menunggu instruksi. N.E.X.A dirancang sebagai *Chief of Staff* yang proaktif mendatangi Tuannya. Jantung dari otonomi ini berada di modul `cron.js` yang mengorkestrasi 11 rutinitas latar belakang tanpa henti.

### 7.1 Sapaan Siklus Harian (The Proactive Quartet)

Siklus sapaan N.E.X.A berpusat pada empat titik waktu kritis yang dieksekusi melalui `Intelligence_Brief.js` dan dibantu dengan AI:

1. **05:30 WIB (The Diplomat's Morning Briefing)**: Rutinitas pembuka hari. N.E.X.A mengumpulkan data Cuaca (via WeatherAPI), Agenda hari ini, Status Tugas, dan Berita Geopolitik (Timur Tengah via NewsData). Semua disintesis oleh AI menjadi sapaan elegan bergaya diplomat, lengkap dengan saran prioritas.
2. **12:00 WIB (Midday Pulse)**: Pengecekan *progress* siang hari. N.E.X.A menggunakan `Promise.allSettled` untuk menarik tugas hari ini dan 3 transaksi keuangan terakhir, menyajikannya dalam pesan evaluasi singkat tanpa takut *crash* jika salah satu API gagal.
3. **17:00 WIB (Evening Debrief)**: Sapaan reflektif sore hari. AI menanyakan pencapaian hari ini dan memancing Tuan Faqih untuk menitipkan catatan/ide untuk besok.
4. **21:00 WIB (Tomorrow Prep)**: Persiapan H+1. N.E.X.A menarik acara kalender esok hari (`getTomorrowEvents()`) dan tugas dalam 2 hari ke depan (`getUpcomingTasks(2)`) sebagai alarm dini strategis.

Selain itu, terdapat **Midnight Check-in (01:00 WIB)**, di mana N.E.X.A akan menegur dengan hangat jika mendeteksi Tuan Faqih belum tidur (atau memancing percakapan jika ada pikiran yang mengganggu di larut malam).

### 7.2 Orkestrasi Waktu & Disiplin Otomatis

N.E.X.A tidak kenal ampun dalam menegakkan kedisiplinan dan menjaga ketepatan waktu:

1. **Overdue Task Alert (07:00 WIB)**: Mengekstrak seluruh tugas yang tertunggak dari Google Tasks, menghitung selisih hari ketelambatan (`diffDays`), dan melontarkan daftar "Tugas Merah" setiap pagi.
2. **Event Proximity Alert (Setiap 30 Menit)**: Mengecek jadwal di Google Calendar. Jika ada acara yang akan dimulai dalam **25-35 menit**, N.E.X.A mengirim Telegram *alert*. Untuk mencegah *spam* notifikasi pada acara yang sama, N.E.X.A menggunakan `_notifiedEventIds (Set)` di RAM yang secara otomatis dibersihkan (*auto-evicted*) setiap 2 jam.
3. **Weekly Behavior Summary (Minggu 20:00 WIB)**: Menjalankan rutinitas evaluasi dari `Behavior_Engine.js` untuk merangkum kedisiplinan Tuan Faqih selama sepekan.
4. **Scholarship Radar (Minggu 08:00 WIB)**: *(Placeholder)* Rutinitas untuk men-*scraping* info beasiswa/kompetisi secara otomatis.

### 7.3 *Engine* Penjaga Data (Patroli Latar Belakang)

Dua *cron* bekerja dengan tempo yang sangat cepat untuk memastikan data tetap konsisten:

1. **Finance Auto-Sync (Setiap 3 Menit)**: Memanggil `pollFinanceEmails()` untuk membaca Gmail, mencari mutasi bank terbaru, lalu mencatatnya tanpa intervensi manusia.
2. **Telegram Alert Watchdog (Setiap 90 Detik)**: Bertugas sebagai resolusi TLS Blips.
   - Platform *cloud* gratis sering memutuskan koneksi jaringan secara sepihak. Jika N.E.X.A gagal mengirim notifikasi ke Telegram (karena koneksi putus), transaksi tersebut akan menggantung di `nexa_pending_transactions` dengan `telegram_sent = false`.
   - Watchdog memindai tabel ini setiap 90 detik. Jika pesan belum terkirim, Watchdog akan melakukan **pengiriman ulang paksa** (*force resend*).
   - Jika transaksi menggantung lebih dari 5 menit tanpa respons pengguna, Watchdog mengamankannya dengan cara melakukan **Auto-Save**, memastikan uang Tuan Faqih tercatat secara permanen.
3. **Daily Memory Consolidation (23:59 WIB)**: Mengekstraksi obrolan harian untuk membangun Long-Term Memory (dibahas detail di Bab 6).

---

## BAB 8: JARINGAN, KEAMANAN, & MANAJEMEN DEPLOYMENT

Beroperasi di atas infrastruktur *cloud* gratis Hugging Face Spaces menuntut rekayasa jaringan (*network engineering*) dan protokol keamanan tingkat militer untuk mengakali blokir peladen dan menjaga privasi mutlak Tuan Faqih.

### 8.1 *Zero-Outbound Telegram Bypass* & *Relay Chain*

Hugging Face Spaces memiliki regulasi ketat: secara sepihak memutuskan koneksi *outbound TLS* ke domain tertentu seperti `api.telegram.org` dan Cloudflare Workers. Jika `axios.post` langsung ke Telegram, *server* akan mengalami *Timeout*.

N.E.X.A mengatasi limitasi fisik peladen ini dengan **Dual-Strategy Routing** di `telegram_network.js`:
1. **Zero-Outbound Webhook**: Untuk pesan obrolan biasa, modul `webhook.js` tidak membuat koneksi baru. Ia menanamkan *payload* `JSON { method: "sendMessage", text: "..." }` langsung ke dalam **HTTP Webhook Response (res.status(200).json)**. Balasan meluncur dengan 0 koneksi keluar.
2. **Vercel Relay & Failover Chain**: Untuk operasi latar belakang (*Cron Jobs*) yang tidak diinisiasi oleh pesan masuk, N.E.X.A membidik *request* ke infrastruktur Vercel (`NEXA_VERCEL_RELAY_URL`) yang mem- *proxy* pesan ke Telegram. Jika Vercel mati, `fetchWithFailover` secara otomatis me- *routing* ulang permintaan lewat AllOrigins API, menciptakan ketahanan jaringan berlapis.

### 8.2 Postur Keamanan & *Firewall* Isolasi Data (`security.js`)

Semua lalu lintas HTTP masuk dijaga oleh *middleware* keamanan sebelum mencapai mesin kognitif:

1. **Telegram Identity Lock**: N.E.X.A membedah struktur Webhook Telegram (*message*, *callback_query*, *channel_post*). Jika *Chat ID* pengirim tidak sama persis dengan `TELEGRAM_CHAT_ID` Tuan Faqih, koneksi seketika digugurkan dengan respons *403 Forbidden*.
2. **Anti-Spoofing Webhook**: Mencegah *hacker* mengirim *request* palsu ke *endpoint* N.E.X.A. Sistem memverifikasi *Header* `X-Telegram-Bot-Api-Secret-Token` murni dari *server* Telegram.
3. **God Mode Authentication**: *Endpoint* yang terhubung ke otomasi Android (Tasker) dijaga dengan verifikasi *Header* `Authorization: Bearer`.
4. **Timing Attack Immunity**: Seluruh pencocokan *password/secret* di N.E.X.A menggunakan `crypto.timingSafeEqual()`, memastikan peretas tidak bisa menebak *password* berdasarkan waktu respons CPU.

### 8.3 Orkestrasi *Environment Variables* Terpusat (`env.js`)

Modul `env.js` mengelola lebih dari 30 *credential* rahasia untuk mengeksekusi integrasi lintas platform, meliputi:

- **LLM Key Rotation**: N.E.X.A siap menghadapi *Rate Limit* gratisan dengan menyiapkan slot rotasi untuk 4 Kunci Gemini (`GEMINI_API_KEY_1-4`), 4 Kunci Groq, Cerebras, Mistral, hingga *fallback* premium via OpenRouter.
- **Dual Google Authentication**: Menggunakan JSON *Service Account* (`GOOGLE_PRIVATE_KEY`) untuk operasi Google Drive, namun menggunakan sistem kredensial manusia (OAuth2 `GMAIL_REFRESH_TOKEN` & `TASKS_REFRESH_TOKEN`) untuk mengakses *inbox* email dan daftar tugas Tuan Faqih secara mandiri.
- **Node Fisik & Integrasi Eksternal**: Kunci akses untuk Supabase (Memori Permanen), Notion (Task Sync), Serper.dev (Pencarian Web), dan NTFY (Eksekutor God Mode Android).

## BAB 9: PETA KODE (*CODEBASE MAPPING*) & PANDUAN PENGEMBANGAN

Di tingkat fondasi *software engineering*, arsitektur N.E.X.A mematuhi prinsip *Domain-Driven Design* (DDD) secara absolut. Tidak ada *Spaghetti Code*; setiap batas domain dipisahkan dengan sangat ketat agar asisten ini bisa terus berevolusi di masa depan tanpa merusak fitur lama.

### 9.1 Anatomi Root & Struktur `src/`

Otak N.E.X.A terpusat di dalam direktori `src/`, terbagi atas 6 wilayah eksklusif:

1. **`src/core/` (Kognisi Sentral)**
   Pusat kesadaran buatan. Menampung:
   - `AI_Router.js`: Sang *Universal State Machine*. Membaca niat Tuan Faqih dan memecahnya menjadi JSON terstruktur.
   - `Fallback_Engine.js`: Pemindah gigi LLM otomatis jika server utama *down*.
   - `Vision_Engine.js` & `Voice_Engine.js`: Mata dan telinga (OCR multimodal & Voice-to-Text).
2. **`src/domain/` (Otak Logika Bisnis)**
   Tempat logika fitur bermukim, terbebas dari hal teknis jaringan. Menampung:
   - `Finance_Engine.js` & `Budget_Engine.js` (Keuangan)
   - `Task_Manager.js` & `Agenda_Manager.js` (Produktivitas)
   - `Behavior_Engine.js`, `Intelligence_Brief.js`, `Discipline_GodMode.js`
3. **`src/infrastructure/` (Eksternal *Driver*)**
   Penghubung teknis murni ke dunia luar. Menampung kode API Supabase (`Supabase_Finance.js`, `Supabase_Memories.js`), Google Ecosystem (`Google_Tasks.js`, `Google_Workspace.js`), Notion, Web Search (Serper), hingga integrasi Gmail.
4. **`src/interfaces/` (Gerbang I/O)**
   Pintu masuk interaksi. Menampung `webhook.js` (gerbang reaktif pasif yang menerima pesan Telegram) dan `cron.js` (gerbang aktif-proaktif berbasis waktu).
5. **`src/utils/` (Pertahanan & Jaringan)**
   Menampung `security.js` (*Firewall*, Identity Lock) dan `telegram_network.js` (Vercel Relay & pencegah *Timeout*).
6. **`src/config/` (Konfigurasi Induk)**
   Menampung `env.js` (Orkestrasi kredensial lintas platform) dan `personality.js` (Sikap & Persona N.E.X.A).

### 9.2 The Universal State Machine (Hukum Keteraturan)

Tidak seperti *bot* konvensional yang menebak kata kunci secara harfiah (seperti `if (text.includes('uang'))`), N.E.X.A menggunakan `AI_Router.js` sebagai pintu gerbang tunggal (*Single Point of Entry*).
Setiap pesan Telegram yang masuk akan dimasukkan ke *Router* ini terlebih dahulu, menghasilkan keluaran JSON seperti:
```json
{
  "intent": "FINANCE",
  "extractedData": { "nominal": 50000, "merchant": "gojek" }
}
```
Atas dasar `intent` inilah *switch-case* di `AI_Router.js` mengarahkan `extractedData` tersebut ke salah satu *Domain Engine*. Ini mencegah ambiguitas jika Tuan Faqih mengetik pesan kompleks seperti, *"Masukkan rapat 1 jam soal budget uang 50.000"*.

### 9.3 Panduan Ekstensibilitas (Aturan Menambah Fitur Baru)

N.E.X.A dirancang untuk bisa dikembangkan. Jika di masa depan Tuan Faqih ingin menyuntikkan fitur baru (misal: **Health & Fitness Tracker** untuk mencatat kalori dan lari), maka hukum *Universal State Machine* melarang keras mengutak-atik `webhook.js`.
Berikut adalah langkah injeksi yang benar:

1. **Buat Logika Domain**: Buat file `Health_Engine.js` di dalam folder `src/domain/`. Tulis semua logika pengolahan data kalori di sini.
2. **Buat Infrastruktur (Jika Ada)**: Jika butuh tabel Supabase baru, buat `Supabase_Health.js` di `src/infrastructure/`.
3. **Pendaftaran Niat (*Intent Mapping*)**: Buka `src/core/AI_Router.js`. Di bagian `system_prompt`, daftarkan `intent` baru bernama `"HEALTH"` beserta instruksi parameternya (seperti `kalori_dibakar`, `durasi_lari`).
4. **Sambungkan Soket (*Wiring*)**: Di fungsi `routeUserMessage` pada `AI_Router.js`, tambahkan *case* `"HEALTH"` yang meneruskan hasil JSON ke `Health_Engine.logWorkout(data)`.

Dengan menaati protokol ini, fitur baru bisa disuntikkan dalam hitungan menit tanpa mendisrupsi nol-latensi dan ketahanan *fallback* sistem lama. N.E.X.A tidak akan pernah berbenturan (*crash*) akibat fitur tumpang tindih.

---
**~ TAMAT ~**
*Mahakarya arsitektur The Chief of Staff, secara eksklusif dikembangkan untuk memperluas kognisi dan otonomi penggunanya, Tuan Faqih Hidayatulloh.*
