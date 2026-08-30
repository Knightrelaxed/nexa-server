# N.E.X.A Whitepaper: Comprehensive System Book
*(Neural Extension Assistant for Intelligence — v3.1 "Unified Master OAuth 2.0 & Human-Centric Cognitive Ergonomics")*

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

N.E.X.A beroperasi sebagai *backend* **Node.js 20 + Express.js** yang berjalan di atas **Azure Virtual Machine** (VM `Standard_B2ats_v2`, Ubuntu 24.04 ARM, Jakarta — `indonesiacentral`). Ini adalah infrastruktur *production-grade* 24/7 yang dikelola oleh **PM2** (process manager dengan integrasi systemd) dan **Caddy** (HTTPS reverse proxy dengan SSL otomatis via Let's Encrypt). Domain resmi produksi: `https://nexa-server.indonesiacentral.cloudapp.azure.com`.

**Anatomi `app.js` (Boot Sequence):**
Urutan inisialisasi saat server menyala bukan arbitrer—setiap baris memiliki alasan teknis yang ketat:

1. **Baris Pertama Mutlak — DNS IPv4 Fix:**
   ```js
   const dns = require('dns');
   dns.setDefaultResultOrder('ipv4first');
   ```
   Node 20 di Docker Azure secara *default* mencari alamat IPv6 terlebih dahulu. Karena `api.telegram.org` dan Supabase berjalan via IPv4 di infrastruktur Azure, resolusi IPv6 selalu gagal dengan error *TLS socket disconnect*. Baris ini **wajib dipanggil sebelum `require()` apapun**—jika tidak, sistem crash di *boot* pertama.

2. **Axios IPv4 Force:**
   ```js
   axios.defaults.httpsAgent = new https.Agent({ family: 4 });
   ```
   Melengkapi fix DNS di atas untuk seluruh HTTP request berbasis Axios (termasuk panggilan ke Groq, Mistral, dan relay Vercel).

3. **Health Endpoint — Smart Vital Signs:**
   Endpoint `/health` mengekspos metrik *real-time*: `uptime_seconds`, `memory_mb`, `timestamp_jakarta`, dan `node_env`. Endpoint ini dikonfigurasi **sebelum** router webhook agar bisa merespons paling cepat—digunakan untuk pemantauan kesehatan server secara eksternal. Karena N.E.X.A kini berjalan di Azure VPS (bukan platform serverless), tidak ada risiko *sleep mode*; server aktif 24/7 dijamin oleh `pm2 startup` + `systemd`.

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
- **Webhook Response (Zero-Outbound):** Untuk semua pesan reaktif (balasan percakapan biasa), N.E.X.A menanamkan respons langsung ke dalam HTTP response body dengan format `{ method: "sendMessage", chat_id: ..., text: ... }`. Mekanisme ini didukung resmi oleh Telegram Bot API dan tidak membutuhkan koneksi keluar sama sekali — melangkahi blokir Azure.
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

#### Node 3: Unified Google Master OAuth 2.0 Client (`Google_Master_Client.js`)

Sejak v3.1, N.E.X.A mengonsolidasikan seluruh autentikasi Google API yang sebelumnya terfragmentasi (Service Account RSA yang rapuh, token Gmail port 3000, token Tasks port 3001) menjadi **Satu Master OAuth 2.0 Client Tunggal** (`Google_Master_Client.js`) di bawah Web Application Client GCP `nexa-core-495208`.

**Spesifikasi Master Client:**
- **16 Master Scopes Resmi:** Mencakup Google Calendar (`calendar`, `calendar.events`), Google Tasks (`tasks`), Google Meet (`meetings.space.created`), Gmail (`gmail.modify`, `gmail.send`), Google Drive (`drive`, `drive.file`, `drive.appdata`), Google Docs (`documents`), Google Sheets (`spreadsheets`), Google Slides (`presentations`), Google Photos (`photoslibrary.readonly`), Google Contacts (`contacts.readonly`), YouTube (`youtube.readonly`), dan Profil Pengguna (`userinfo.profile`, `userinfo.email`).
- **Singleton Lazy Factory:** Instance `google.auth.OAuth2` dibuat sekali dan dibagikan ke seluruh subsistem. Modul API (`getCalendar()`, `getTasks()`, `getGmail()`, `getDrive()`, `getDocs()`) diinisialisasi secara malas (*lazy-initialized*), menghasilkan cold-start 0ms dan konsumsi RAM yang sangat hemat (<170 MB di Azure VPS).
- **Auto Background Token Refresh & Transparent Interceptor:** `google-auth-library` mengelola rotasi token secara otomatis di latar belakang. Jika terjadi kegagalan token sementara (status 401), sistem melakukan refresh senyap tanpa memutus alur percakapan Telegram.
- **Circuit Breaker & Single Proactive Alert:** Jika token dicabut (`invalid_grant`), *Circuit Breaker* aktif: caching klien di-reset, status isolasi diaktifkan, dan sistem mengirim **satu alert Telegram proaktif** tanpa membanjiri chat Tuan.
- **Eliminasi Total Service Account:** Menghilangkan ketergantungan pada 50 baris Private Key RSA (`.json` Service Account) yang sering memicu error kuota penyimpanan Google Drive (*"Service Accounts do not have storage quota"*).

**Kapabilitas Google Ecosystem yang Dikelola Master Client:**

| Modul | API Terpadu | Kapabilitas Utama |
|---|---|---|
| `Google_Workspace.js` | Calendar v3 | Optimistic CRUD event, conflict check, free/busy, proximity alert, tomorrow prep |
| `Google_Workspace.js` | Docs v1 | Append/Read/Edit/Delete di Master 2nd Brain Doc |
| `Google_Workspace.js` | Drive v3 & v2 | Upload file ke Vault pribadi, OCR via Drive Convert, trash cleanup |
| `Google_Tasks.js` | Tasks v1 | Dynamic Tasklist Discovery (5 Live Lists), CRUD task, subtask, overdue detection |
| `Gmail_Client.js` | Gmail v1 | Finance polling (24/7 tiap 3 menit), kirim email, watch push notification |

#### Node 4: Gmail — Finance Auto-Sync Engine (24/7 di Azure VPS)

`Gmail_Client.js` mendelegasikan autentikasi ke `Google_Master_Client.getGmail()`. Fitur kritis yang berjalan otomatis:
- **Continuous Polling 3 Menit:** `pollFinanceEmails()` berjalan tanpa henti via *cron cycle* di Azure VPS, mendeteksi mutasi Bank Mandiri (Livin') dan BCA, mengekstrak data nominal, dan mencatat transaksi ke database tanpa campur tangan Tuan.
- **Zero-Interruption Token Handling:** Menggunakan Master Refresh Token yang tidak pernah kadaluarsa selama aplikasi berstatus *Production Ready* di Google Cloud Console.

#### Node 5: Google Tasks — Dynamic Discovery & Dual-Write ke Notion

`Google_Tasks.js` mendelegasikan autentikasi ke `Google_Master_Client.getTasks()`.
- **Dynamic Tasklist Discovery:** Sistem tidak lagi mengandalkan ID kaku, melainkan membaca langsung daftar tasklist aktif milik Tuan (`Tugas Saya`, `Tugas Kuliah`, `Pekerjaan`, `Riset & Baca`, `Belanja`) dengan in-memory cache 5 menit.
- **Timezone Preservation (`normalizeDateOnly`):** Normalisasi string tanggal lokal WIB (+07:00) ke Date-Only UTC midnight (`YYYY-MM-DDT00:00:00.000Z`), menjamin deadline di HP Samsung A33 Tuan tidak pernah melompat hari.
- **Parallel Sync ke Notion:** Setiap operasi tugas secara paralel disinkronkan ke Notion database via `Notion_Client.js`.

#### Node 6: Universal Remote CLI Client (`nexa-cli`) & SSE Real-Time Push

`nexa-cli` beroperasi sebagai antarmuka terminal portabel yang dapat dijalankan secara instan dari laptop manapun di dunia via `npx github:Knightrelaxed/nexa-cli`. Node ini terhubung ke N.E.X.A Server melalui dua saluran:
- **`POST /webhook/cli`**: Mengirim instruksi interaktif yang dilindungi header `Authorization: Bearer <NEXA_CLI_SECRET>`.
- **`GET /webhook/cli/stream`**: Koneksi HTTP *keep-alive* berbasis *Server-Sent Events* (SSE). Server menyimpan objek koneksi di memori (`activeCliStreams`), memungkinkan penyiaran notifikasi proaktif (*Morning Briefing*, *Cron Alerts*, *Discipline Godmode*) langsung ke layar terminal pengguna secara *real-time*.

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
- 🫀 **Jantung & Paru-Paru: Azure VPS Jakarta (Node.js + PM2)**
  Mesin pemompa (*Core Server*) yang berdenyut tanpa henti 24/7 di atas Azure Virtual Machine `Standard_B2ats_v2` region `indonesiacentral` (Jakarta). Dijaga oleh PM2 + systemd sehingga otomatis bangkit kembali setelah reboot. Tanpanya, oksigen (data) berhenti mengalir dan seluruh subsistem N.E.X.A akan berhenti.
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
- ⚡ **Alat Pacu Jantung (Pacemaker): PM2 Plus + systemd**
  Penjaga detak jantung permanen N.E.X.A. PM2 mengelola proses Node.js dengan *auto-restart* pada crash, sementara systemd memastikan PM2 sendiri hidup kembali setelah reboot VM. Dashboard pemantauan real-time tersedia di `https://app.pm2.io`. Tidak lagi membutuhkan ping eksternal (cron-job.org / UptimeRobot) karena VPS tidak pernah *sleep*.

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

#### Ancaman 1 — Blokir Outbound Azure
**Problem:** Azure memblokir semua request keluar ke `api.telegram.org` dan `*.workers.dev`.
**Solusi:** *Zero-Outbound Webhook Response* — respons Telegram ditanamkan langsung ke body HTTP 200 dari webhook.

#### Ancaman 2 — Cron Job Tanpa Webhook Trigger
**Problem:** *Cron job* inisiatif (Morning Briefing, Midday Pulse) tidak dipicu oleh pesan Telegram, sehingga tidak ada webhook request untuk "dibalas".
**Solusi:** `sendTelegramOutbound()` mengirim request ke Vercel Relay (`NEXA_VERCEL_RELAY_URL`) yang kemudian meneruskannya ke Telegram. Relay diverifikasi dengan `NEXA_RELAY_SECRET`.

#### Ancaman 3 — IPv6 DNS Failure di Docker
**Problem:** Node 20 Docker di Azure mencari DNS IPv6 terlebih dahulu. Ini menyebabkan `TLS socket disconnect` saat mengakses Supabase dan API eksternal.
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

### 2.5 Arsitektur Universal Remote CLI (`nexa-assistant-console`) & Real-Time Push Stream (SSE)

N.E.X.A v2.8 menghadirkan antarmuka remote terminal tanpa dependensi eksternal (*Zero External Dependencies*), memungkinkan Tuan Faqih mengakses seluruh daya kognitif N.E.X.A langsung dari terminal laptop manapun di dunia secara resmi melalui NPM Registry (`nexa-assistant-console` v2.8.0) atau GitHub Repository (`Knightrelaxed/nexa-cli`).

#### 1. Arsitektur Dual-Channel Komunikasi (POST + SSE)
CLI beroperasi dengan arsitektur dua saluran independen namun saling melengkapi:
- **Outbound Request-Response (CLI → Server):** Setiap instruksi atau pesan dari Tuan dikirim via `POST /webhook/cli` yang dilindungi oleh middleware `security.cliAuth` menggunakan `NEXA_CLI_SECRET` (`cLiNeXa17`).
- **Inbound Real-Time Push Stream (Server → CLI):** Saat CLI diinisialisasi, klien membuat koneksi HTTP `GET /webhook/cli/stream` yang ditahan oleh server (`text/event-stream`). Server menampung *connection object* di memori RAM (`activeCliStreams` Set).

#### 2. Mekanisme Penyiaran Proaktif (`pushToCli`)
Setiap kali fungsi `sendTelegramOutbound()` di `telegram/actions.js` dipanggil (oleh Cron Jobs seperti Morning Briefing, Alert Watchdog, atau Anticipatory Godmode), sistem secara otomatis menduplikasi pesan tersebut dan menyiarkannya via `pushToCli(cleanText)`. Jika ada koneksi CLI yang aktif, notifikasi akan langsung terdorong ke layar terminal pengguna secara *real-time*.

#### 3. Penyelarasan Memori Lintas Platform (Omnipresent Awareness)
Setiap interaksi CLI secara otomatis disimpan ke tabel `nexa_chat_memories` di Supabase dengan parameter `platform: 'cli'`. Saat `AI_Router.js` membaca memori percakapan, timestamps dikonversi ke **WIB (`Asia/Jakarta`)** dengan format `[DD/MM HH:mm WIB | via PLATFORM]` sehingga N.E.X.A memiliki kesadaran temporal dan spasial penuh lintas Telegram, WhatsApp, dan CLI.

#### 4. Anti-Overthinking Tracker (`_trackAdviceSession`)
Adapter CLI (`cli/adapter.js`) mengintegrasikan pelacak sesi keluhan (`_trackAdviceSession`). Jika pengguna mengajukan pertanyaan berulang berkategori `ADVICE` dalam jendela 1 jam, sistem memicu `Anticipatory_Engine.runAnticipationPass()` untuk mengintervensi *overthinking* secara proaktif lewat protokol Godmode.

#### 5. Sistem Rendering Cyberpunk HUD v2.8 (Pixel-Perfect ASCII & Accent Bar)
Untuk mengatasi bug perbedaan render kolom karakter emoji (`🤖` / `●`) di Windows PowerShell, `nexa-cli` mengimplementasikan:
- Rumus penghitung panjang teks bebas warna menggunakan regex ANSI komprehensif (`/\x1b\[[0-9;]*[a-zA-Z]/g`).
- Desain **Left Accent Bar (`│`) Minimalis** yang responsif terhadap semua resolusi dan lebar jendela terminal tanpa risiko pemotongan teks.
- Pembersihan tag HTML mentah (`<br>`) menjadi *newline* organik (`\n`).

#### 6. Panduan Penggunaan & Operasional CLI (User & Administrator Guide)

##### A. Cara Menjalankan CLI Publik via NPM Registry (Resmi & Universal)
Buka terminal (PowerShell, Command Prompt, atau Terminal Linux/macOS) di perangkat manapun di dunia, lalu ketik:
```bash
npx nexa-assistant-console
```
*(Atau gunakan perintah alias NPM resmi):*
```bash
npx nexa-cli
```

##### B. Cara Menjalankan CLI Langsung dari GitHub Source (Developer Mode)
```bash
npx -y github:Knightrelaxed/nexa-cli
```

##### C. Konfigurasi Shortcut Aman di PowerShell Laptop Utama (`nexa-cli`)
Agar tidak perlu mengetik panjang setiap hari, shortcut aman telah terkonfigurasi di `Microsoft.PowerShell_profile.ps1`:
```powershell
if (!(Test-Path $PROFILE)) { New-Item -Type File -Force $PROFILE }; Add-Content $PROFILE "`nfunction nexa-cli { npx -y github:Knightrelaxed/nexa-cli }"
```
*Penggunaan:* Cukup buka PowerShell dan ketik **`nexa-cli`**!

##### D. Setup Konfigurasi Pertama Kali (First-Time Setup)
Saat pertama kali dijalankan, CLI akan meminta dua input konfigurasi yang disimpan secara aman di file lokal `~/.nexa-config.json`:
1. **NEXA Server URL:**
   - **Mode Lokal (Development):** `http://127.0.0.1:3000`
   - **Mode Cloud / Production (Azure VPS 24/7):** `https://nexa-server.indonesiacentral.cloudapp.azure.com`
2. **Secret Key (NEXA_CLI_SECRET):**
   - Masukkan kunci rahasia: `cLiNeXa17`

##### E. Beralih Antara Server Lokal dan Azure VPS
Jika Tuan ingin mengganti endpoint server (misalnya dari server lokal ke Azure VPS Jakarta), hapus file konfigurasi lama di terminal:
- **Windows PowerShell:**
  ```powershell
  Remove-Item ~/.nexa-config.json
  ```
- **Linux / macOS:**
  ```bash
  rm ~/.nexa-config.json
  ```
Setelah itu, jalankan `npx nexa-assistant-console` kembali dan masukkan URL server tujuan.

##### F. Perintah Keluar (Session Disconnect)
Untuk mengakhiri sesi interaktif dan menutup terminal dengan aman, ketik salah satu perintah berikut: `exit`, `keluar`, `q`, atau `quit`.
```text
❖ TUAN FAQIH ──❯ exit

👋 N.E.X.A: Terima kasih Tuan Faqih. Terminal offline.
```

##### G. Prosedur Pembaruan & Publish Package NPM (Release & Maintenance Guide)
Setiap kali Tuan Faqih melakukan perbaikan kode atau penambahan fitur pada CLI dan ingin mem-publish versi baru ke NPM Registry (`nexa-assistant-console`), jalankan perintah rilis berikut:

1. **Commit & Push Perubahan ke GitHub**:
   ```bash
   git add .
   git commit -m "feat: deskripsi perubahan fitur CLI"
   git push origin main
   ```

2. **BUMP Nomor Versi di `package.json`**:
   - Untuk perbaikan bug (Fix): `npm version patch` (`2.8.0` ➔ `2.8.1`)
   - Untuk fitur baru (Update): `npm version minor` (`2.8.0` ➔ `2.9.0`)

3. **Publish ke NPM Registry (Perintah 1 Baris)**:
   ```powershell
   cd "d:\N.E.X.A Asistant\scratch\nexa-cli-repo"; npm publish --access public
   ```
   *(Catatan: Karena `.npmrc` dengan token Bypass 2FA `npm_mWAMZupE2xsCX...` sudah terkonfigurasi di folder `d:\N.E.X.A Asistant\scratch\nexa-cli-repo`, eksekusi perintah publish di atas akan berjalan 100% otomatis tanpa meminta kode OTP manual).*

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

#### 3.2.1 Voice Engine — Telinga N.E.X.A (13-Tier Fallback)

Ketika Tuan Faqih mengirim Voice Note, `Voice_Engine.js` mengaktifkan pipeline transkripsi berlapis:

**Tier 0 — Worker Transcription (Game Changer):**
N.E.X.A mengirim *hanya* `file_path` ke Vercel Relay melalui `postToRelay('/api/transcribe', ...)`. Worker Vercel yang mendownload audio secara langsung dari Telegram dan menjalankan transkripsi di sisi Edge. N.E.X.A hanya menerima teks transkripsi dalam respons JSON kecil. **Tidak ada file audio besar yang perlu diunduh oleh kontainer Azure.**

**Tier 1–4 — Azure Whisper Large v3 Turbo (4 Attempts / Slots):**
Jika Worker gagal, sistem mendownload file audio `.ogg` ke file sementara (`tmpFilePath`) di RAM Azure, lalu menjalankan transkripsi kilat dengan model Whisper Large v3 Turbo.

**Tier 5–8 — Gemini 3.6 Flash Native Audio (4 Kunci Rotasi):**
Jika Azure gagal, file `.ogg` dibaca sebagai `Buffer`, di-encode ke Base64, lalu dikirim langsung ke Gemini 3.6 Flash sebagai `inlineData` dengan `mimeType: 'audio/ogg'`.

**Tier 9–12 — Groq Whisper Large v3 (4 Kunci Rotasi sebagai Backup):**
Jika seluruh tier di atas gagal, sistem beralih ke 4 kunci Groq Whisper Large v3 secara berurutan dengan *smart retry* internal.

**Cleanup Otomatis:** Terlepas dari tier mana yang berhasil atau jika semua gagal, blok `finally` memastikan file temp selalu dihapus dari disk.

#### 3.2.2 Vision Engine — Mata N.E.X.A (14-Tier Fallback)

Ketika Tuan Faqih mengirim foto atau dokumen, `Vision_Engine.js` mengaktifkan pipeline analisis visual:

**Tier 0 — Worker Vision (Zero Binary Download):**
N.E.X.A mengirim `file_path` + `gemini_key` ke Vercel Relay melalui `postToRelay('/api/vision', ...)`. Worker yang mendownload gambar dan memanggil Gemini Vision langsung dari sisi Edge.

**Tier 1–4 — Cerebras Gemma 4 31B Vision (4 Kunci WSE-3 Ultra-Fast):**
Gambar diunduh sebagai Base64 dan diproses dengan kecepatan kilat chip Cerebras WSE-3.

**Tier 5–8 — Gemini 3.6 Flash Vision (4 Kunci Rotasi, Premium Quality):**
Analisis visual mendalam menggunakan model multimodal Google Gemini 3.6 Flash terbaru.

**Tier 9–12 — Groq Vision Llama 3.2 90B/11B Vision (4 Kunci Rotasi):**
Penalaran visual berkecepatan tinggi menggunakan Llama 3.2 Vision di infrastruktur Groq Cloud.

**Tier 13 — Azure Qwen2-VL Vision (Free Safety Net):**
Terakhir, model multimodal *open-weight* yang dijalankan via Azure Inference API tanpa batasan kuota harian.

**Dual Mode Vision (Narasi vs JSON Extraction):**
Vision Engine mendukung dua *system prompt* berbeda:
- **Mode Narasi** (`VISION_SYSTEM_PROMPT`): Menghasilkan satu paragraf deskripsi kaya untuk percakapan biasa.
- **Mode Ekstraksi JSON** (`systemPromptOverride`): Dipakai oleh Vault Pipeline untuk menghasilkan JSON metadata terstruktur dari dokumen (KTP, struk, surat, dll). Temperature diturunkan ke 0.1 untuk akurasi ekstraksi.

---

### 3.3 Tahap Routing Kognitif: AI Router (`AI_Router.js`)

Ini adalah otak pengambilan keputusan utama N.E.X.A. Setiap pesan teks (termasuk hasil transkripsi Voice dan OCR Vision) melewati `routeUserMessage()` yang membangun *prompt* multi-lapis dan memanggil `executeWitAzureallback()`.

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

#### 3.3.3 SACR Hybrid Semantic Gateway v3.0 — The Ultimate Cognitive Resonance Engine

Pada versi 3.0, N.E.X.A mengintegrasikan arsitektur penelusuran semantik generasi terbaru: **SACR Hybrid Semantic Gateway v3.0**. Sistem ini memadukan kecerdasan **Google Gemini Cloud Embedding (`gemini-embedding-2`)**, **In-Memory Vector Snapshot (`data/facts_vectors.json`)**, dan **Masked Parallel Execution Pipeline (`Promise.all`)**.

---

##### A. Latar Belakang & Evaluasi Kegagalan Arsitektur Pendahulu

Sebelum mencapai arsitektur v3.0, sistem melalui 3 tahap evaluasi komparatif yang menghasilkan keputusan desain final:

| Pendekatan yang Diuji | Hasil Pengujian & Karakteristik | Alasan Kegagalan / Batasan |
|---|---|---|
| **1. Lexical Keyword Matching Murni** | ⚡ Latensi 0.00 ms, 0 MB RAM | ❌ **Kaku & Gagal pada Bahasa Bebas:** Gagal mengenali sinonim implisit (misal: *"kalau server mati cadangannya apa?"* tidak cocok jika kamus hanya mencari kata *"failover"*). |
| **2. Local ONNX Model di VPS (`@xenova/transformers`)** | 🎯 Akurasi tinggi, mandiri | ❌ **Memory Deadlock / Freeze:** Mengonsumsi ~500 MB RAM saat inisialisasi WASM C++. Pada Azure VPS 1.0 GiB RAM tanpa Swap Space, memori menabrak batas fisik dan membekukan OS. |
| **3. Cloud API Naif (Sekuensial)** | 🎯 Akurasi tinggi, 0 MB RAM VPS | ⚠️ **Latensi Tambahan 200–350 ms:** Menembak API embedding sebelum query database menambah waktu jeda balasan chat pengguna secara berurutan. |
| **4. SACR Hybrid Semantic Gateway v3.0 ⭐** | 👑 **Akurasi 100%, 0 ms Added Latency, 0 MB RAM Overhead** | ✅ **Solusi Master:** Menggunakan *Parallel Masking*, *Vector Snapshot Caching*, dan *Fast-Path Reflex Gate*. |

---

##### B. Arsitektur 4 Lapis Pertahanan (*Four-Tier Semantic Gateway*)

```text
┌─────────────────────────────────────────────────────────────────────────┐
│ [1] PESAN MASUK DARI TUAN FAQIH VIA TELEGRAM WEBHOOK                    │
└────────────────────────────────────┬────────────────────────────────────┘
                                     │
                                     ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ 🛡️ LAPIS 1: Fast-Path Reflex Gate (0.00 ms Overhead)                    │
│ Pesan pendek ("halo", "ping", "pagi", "catat 20rb") langsung dilewatkan │
│ tanpa memanggil embedding eksternal.                                    │
└────────────────────────────────────┬────────────────────────────────────┘
                                     │ (Jika pesan butuh pemahaman konteks)
                                     ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ ⚡ LAPIS 2: Masked Parallel Pipeline (Latensi Tambahan = 0.00 ms)       │
│ Eksekusi Promise.all() Serentak:                                        │
│   ├── Jalur A: Fetch Riwayat Obrolan Supabase (~150 ms)                │
│   └── Jalur B: Fetch Vektor Query Gemini Cloud (~150 ms - Tersembunyi!)│
└────────────────────────────────────┬────────────────────────────────────┘
                                     │
                                     ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ 💾 LAPIS 3: In-Memory Vector Snapshot (Komputasi 0.001 Detik di RAM)    │
│ 292 Fakta Memori termuat di RAM dari data/facts_vectors.json (~400 KB). │
│ Eksekusi Cosine Similarity terhadap seluruh fakta selesai dalam 0.1 ms! │
└────────────────────────────────────┬────────────────────────────────────┘
                                     │
                                     ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ 🛡️ LAPIS 4: Zero-Downtime Circuit Breaker Safety Net                    │
│ Jika Google API timeout (> 1.5 detik), sistem seketika meluncur ke     │
│ pencocokan leksikal bawaan tanpa pernah membiarkan bot terdiam.        │
└─────────────────────────────────────────────────────────────────────────┘
```

---

##### C. Formulasi Matematika & Algoritma Cosine Similarity

Setiap fakta dalam memori N.E.X.A (`nexa_user_profile` dan `nexa_core_identity`) dikonversi menjadi vektor bernilai riil $d$-dimensi ($d = 3072$ untuk `gemini-embedding-2`).

Kecocokan semantik antara vektor pertanyaan pengguna $\mathbf{q}$ dan vektor fakta memori $\mathbf{f}_i$ dihitung secara instan di RAM menggunakan perkalian titik normalisasi (*Cosine Similarity*):

$$\text{Similarity}(\mathbf{q}, \mathbf{f}_i) = \cos(\theta) = \frac{\mathbf{q} \cdot \mathbf{f}_i}{\|\mathbf{q}\| \|\mathbf{f}_i\|} = \frac{\sum_{k=1}^{d} q_k f_{i,k}}{\sqrt{\sum_{k=1}^{d} q_k^2} \sqrt{\sum_{k=1}^{d} f_{i,k}^2}}$$

Fakta dengan skor $\ge 0.58$ diurutkan secara menurun (*descending*), dan $K$ fakta teratas langsung diinjeksi ke dalam blok fakta permanen sistem.

---

##### D. Hasil Benchmark Akurasi Semantik Realtime

Pengujian nyata dengan pertanyaan kasual Tuan Faqih:
> 💬 *"kalau server mati atau hang cadangannya apa aja?"*

Hasil pemeringkatan otomatis Google Gemini Semantic Gateway:
1. 🏆 **ID #248 (`70.64%`) — SACR 16-Tier Fallback Redundancy [TOP #1 MATCH]**
2. 🥈 **ID #45 (`67.62%`) — Uptime Watchdog Health Monitoring [Sangat Relevan]**
3. 🥈 **ID #215 (`67.22%`) — Azure VPS Production Architecture [Sangat Relevan]**
4. ❌ **ID #88 (`64.36%`) — Supabase PostgreSQL Database [Diabaikan]**
5. ❌ **ID #105 (`52.02%`) — Kebiasaan Makan & Minum [Diabaikan]**
6. ❌ **ID #5 (`51.28%`) — Transaksi Keuangan QRIS [Diabaikan]**
7. ❌ **ID #1 (`47.26%`) — Profil Kuliah UGM & Beasiswa Jardine [Diabaikan]**

Gemini Embedding secara cerdas mengenali bahwa **16-Tier Fallback, Uptime Watchdog, dan Azure VPS Architecture** adalah satu rumpun ekosistem perlindungan kegagalan server, tanpa membutuhkan satu pun kata kunci persis!

---

##### E. Metrik Kinerja & Efisiensi Sumber Daya Produksi di Azure VPS

| Indikator Metrik | Nilai Aktual Produksi di Azure VPS Jakarta | Keterangan |
|---|:---:|---|
| **Waktu Boot Server (Snapshot Load)** | **`0.001 detik (1.1 ms)`** | Membaca file 400 KB ke struktur data RAM |
| **Latensi Tambahan yang Dirasakan Pengguna**| **`0.00 ms`** | Waktu API embedding tertutup oleh latensi database |
| **Penggunaan RAM Tambahan di VPS** | **`0 MB`** | Neural embedding 100% diproses di Google Cloud |
| **Total Konsumsi RAM Server (PM2)** | **`189 MiB` (dari 893 MiB)** | Stabil di zona hijau (~21% kapasitas memori) |
| **Beban CPU Saat Retrieval** | **`0.0% – 0.2%`** | Sangat dingin tanpa lonjakan prosesor |
| **Event Loop Latency Node.js** | **`0.6 ms`** | Responsivitas ultra-cepat (< 1 ms) |

---

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

### 3.5 Fallback Engine — 16 Lapisan Ketangguhan Kognitif & Redundansi Global (SACR v2.1)

`Fallback_Engine.js` adalah benteng pertahanan terakhir ketersediaan AI N.E.X.A. Setiap pemanggilan kognitif melewati 16 tier model secara berurutan, berpindah ke tier berikutnya (*instant failover*) jika tier sebelumnya mengalami error jaringan, timeout, atau rate limit.

| Tier | Model | Provider / Endpoint Gateway | Kuota & Karakteristik |
|---|---|---|---|
| **1–4** | **Google Gemma 4 31B (Anti-CoT)** | Cloudflare Edge AI Gateway (4 Kunci Rotasi) | **57.600 Chat/Hari (14.4K RPD x 4)** — Super Cerdas, 0 Geo-block |
| **5–8** | **Google Gemini 3.7 Flash** | Cloudflare Edge AI Gateway (4 Kunci Rotasi) | Deep Reasoning & Adaptive Thinking (Reset Harian 07:00 WIB) |
| **9–12** | **Google Gemini 3.6 Flash** | Cloudflare Edge AI Gateway (4 Kunci Rotasi) | Ultra Long Context 1M Token & High Reliability |
| **13** | **Cerebras Gemma 4 31B** | Cerebras Cloud AI | PayGo Ultra-Fast Inference Backup |
| **14** | **Mistral Pixtral 12B / Large** | Mistral AI API | European Independent Inference (691 ms Latency) |
| **15** | **Puter AI Multi-Model Pool** | Puter.js Global Pool | Codestral, GPT-4o, dan Claude Backup Pool |
| **16** | **OpenRouter Multi-Model Pool** | OpenRouter Global | LLaMA 3.3 70B & Qwen 2.5 72B Indestructible Safety Net |

---

#### 3.5.1 Penanganan Masalah Geolocation & Cloud Datacenter ASN (`400 User location is not supported`)

**Akar Masalah:**  
Google AI Studio *Free Tier* menerapkan filter keamanan geografis otomatis berbasis Autonomous System Number (ASN). IP publik Azure VPS Jakarta (`48.193.41.76`) terdaftar sebagai `AS8075 (Microsoft Corporation Cloud Hosting)`. Google menolak request dari IP data center cloud komersial dengan error `400 Bad Request: User location is not supported for the API use`, sementara koneksi dari IP perumahan/laptop (Telkomsel/Indihome) diizinkan normal.

**Solusi Arsitektur: Cloudflare Edge AI Gateway (`nexa-relay.dazatulloh2.workers.dev`)**  
N.E.X.A mengarahkan semua traffic Google Generative Language API melalui Cloudflare Worker Reverse Proxy 12 baris:
```javascript
export default {
  async fetch(request) {
    const url = new URL(request.url);
    url.hostname = 'generativelanguage.googleapis.com';
    const newRequest = new Request(url.toString(), {
      method: request.method,
      headers: request.headers,
      body: request.body
    });
    return fetch(newRequest);
  }
};
```
- **Latensi Tambahan:** Hanya **~1–3 milidetik** karena Cloudflare memiliki Point of Presence (PoP) di Jakarta (`CGK`), satu kota dengan Azure VPS Jakarta kita.
- **Hasil:** Google AI Studio menerima koneksi dari Cloudflare Edge IP secara legal dan mengembalikan respon **`200 OK`**, membuka kembali 100% kapasitas kuota 57.600 request/hari Google Gemma 4 dan Gemini 3.7/3.6.

---

#### 3.5.2 Penanganan Multi-Part Thought & "Empty Response String" pada Google Gemma 4

**Akar Masalah:**  
Google Gemma 4 31B mengembalikan struktur respon multi-part pada API v1beta:
- `parts[0]`: Wadah *thought container* kosong (`{ text: "", thought: true }`).
- `parts[1]`: Wadah teks jawaban nyata (`{ text: "{\"intent\": ...}" }`).

Jika kode membaca `parts[0].text`, server menerima string kosong `""` dan melempar error `Empty response string`.

**Solusi Standar Resmi Google v1beta:**
```javascript
const parts = resJson.candidates?.[0]?.content?.parts || [];
const rawText = parts
  .filter(p => !p.thought)
  .map(p => p.text || '')
  .join('\n')
  .trim() || (parts[parts.length - 1]?.text || '');
```
Logika ini 100% kompatibel universal:
- Menyaring wadah thought kosong pada **Gemma 4**.
- Membuang monolog internal draf pada **Gemini 3.7 Thinking Mode**.
- Menjaga 100% keutuhan teks pada **Gemini 3.6 Flash Normal Single-Part**.

---

#### 3.5.3 Robust JSON Parsing: Balanced-Brace Depth Parser (`extractFirstValidJson`)

**Akar Masalah:**  
Ketika model LLM menghasilkan output dengan catatan pemikiran internal, *code blocks*, atau beberapa opsi JSON sekaligus, pemotongan string berbasis `lastIndexOf('}')` dapat menangkap karakter non-JSON di antara kurung kurawal, memicu error `Unexpected non-whitespace character after JSON`.

**Solusi Algoritma Depth Parser:**
Fungsi `extractFirstValidJson()` melacak kedalaman kurung kurawal (`depth counter`) dan status escape string secara sekuensial:
```javascript
function extractFirstValidJson(str) {
  if (!str || typeof str !== 'string') return null;
  let text = str.replace(/```json/gi, '').replace(/```/g, '').trim();
  const startIdx = text.indexOf('{');
  if (startIdx === -1) return null;

  let depth = 0, inString = false, escape = false;
  for (let i = startIdx; i < text.length; i++) {
    const char = text[i];
    if (escape) { escape = false; continue; }
    if (char === '\\') { escape = true; continue; }
    if (char === '"') { inString = !inString; continue; }
    if (!inString) {
      if (char === '{') depth++;
      else if (char === '}') {
        depth--;
        if (depth === 0) {
          const candidate = text.substring(startIdx, i + 1);
          try { JSON.parse(candidate); return candidate; } catch (e) {}
        }
      }
    }
  }
  return null;
}
```
Algoritma ini menjamin bahwa objek JSON valid pertama yang selesai langsung diekstrak secara murni, kebal dari segala bentuk kebocoran teks atau monolog LLM.

---

#### 3.5.4 Proteksi Timeout (15s AbortSignal) & Smart Rate-Limit Circuit Breaker

1. **Strict Timeout Guard:** Setiap panggilan API eksternal dibatasi dengan `AbortSignal.timeout(15000)`. Jika server AI global mengalami *hang/stuck*, N.E.X.A memutus koneksi dalam 15 detik dan melompat ke tier berikutnya tanpa membiarkan bot Telegram terdiam.
2. **TPM / RPD Quota Shield:** 
   - Batas **16.000 TPM (Token Per Menit)** dan **20 RPD (Request Per Hari)** pada free-tier ditangani dengan rotasi 4 kunci API independen.
   - Jika satu kunci terkena status `429 Too Many Requests`, sistem langsung mencoba kunci ke-2, ke-3, hingga ke-4 secara mulus (*Zero User Interruption*).

---

#### 3.5.5 Dumb Mode — Jaring Pengaman Terakhir

Jika seluruh 16 lapisan peladen dunia mengalami pemadaman total secara bersamaan, sistem mengembalikan struktur darurat terisolasi tanpa crash:
```json
{
  "intent": "DUMB_MODE",
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

### 4.1 Arsitektur Input Omnichannel: 2 Jalur Masuk Transaksi

Tidak ada satu jalur tunggal untuk mencatat transaksi. N.E.X.A menerima data keuangan dari dua sumber yang benar-benar berbeda, masing-masing dengan karakteristik uniknya:

#### Jalur 1 — `TELEGRAM_MANUAL` (Input Aktif Pengguna)
Tuan Faqih mengetik pesan seperti *"beli kopi 25rb di starbucks"* atau mengirim voice note. AI Router mengekstrak `{ nominal, type, destination, category, description, account, payment_method }` lalu memanggil `processTransaction(data, 'TELEGRAM_MANUAL')`. Jalur ini **tidak melewati deduplication check** — asumsinya setiap input manual adalah unik dan disengaja.

#### Jalur 2 — `GMAIL_POLLING` (Finance Auto-Sync)
Setiap 3 menit, `pollFinanceEmails()` memindai kotak masuk Gmail mencari notifikasi mutasi bank (Mandiri, BCA, dll.). Email yang ditemukan diparsing untuk mengekstrak nominal, tipe transaksi, dan nama merchant. Jalur ini **wajib melewati Zero-Duplication Engine** sebelum disimpan. Akun default-nya adalah `'Bank Mandiri'` karena email notifikasi diasumsikan berasal dari rekening bank utama.

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

Bab ini mengupas bagaimana N.E.X.A bertindak sebagai Kepala Staf (*Chief of Staff*) yang proaktif, berempati, dan bebas hambatan (*Zero-Friction*) dalam mengelola alokasi waktu Tuan Faqih menggunakan `Agenda_Manager.js` dan `Task_Manager.js` yang terintegrasi secara *native* dengan Google Calendar dan Google Tasks melalui **Master OAuth 2.0 Client**.

---

### 5.1 Agenda Manager: Mesin Inferensi Durasi Probabilistik (*Zero-Friction Execution*)

Pada versi terdahulu, ketiadaan jam selesai (*end time*) memaksa sistem berhenti di status jeda `PENDING_END` dan menginterogasi durasi kegiatan kepada pengguna. Di v3.1, paradigma tersebut dirombak total menuju **Eksekusi Optimistik Bebas Hambatan (*Zero-Friction Optimistic Execution*)**.

Setiap kali Tuan menyebutkan kegiatan tanpa durasi eksplisit (contoh: *"besok jam 2 siang ada bimbingan skripsi"*), sistem mengaktifkan **Bayesian Semantic Duration Inference Matrix** (`inferProbableDuration`):

1. **Jalur Cepat Regex Eksplisit:** Mendeteksi frasa durasi alami seperti `sejam`, `setengah jam`, `1 jam 30 menit`, dan fraksi unicode `½ jam` $\rightarrow$ 30–90 menit.
2. **Matriks Semantik Probabilistik Kontekstual:**
   - 🎓 **Perkuliahan / Matkul / Praktikum / SKS:** $\rightarrow$ **100 menit** (Sesuai bobot standar 2–3 SKS perkuliahan).
   - 👨‍🏫 **Bimbingan Skripsi / Konsultasi Dosen:** $\rightarrow$ **45 menit**.
   - 📝 **Ujian / UTS / UAS / Sidang Pendadaran:** $\rightarrow$ **100 menit**.
   - ☕ **Sosial / Ngopi / Warkop / Kuliner / Nongkrong:** $\rightarrow$ **90 menit**.
   - 📞 **Komunikasi Cepat / Zoom / Google Meet / Telpon:** $\rightarrow$ **30 menit**.
   - 💼 **Rapat / Meeting / Diskusi Tim / Evaluasi:** $\rightarrow$ **60 menit**.
   - 🏃 **Olahraga / Gym / Futsal / Badminton:** $\rightarrow$ **75 menit**.
   - 🛡️ **Default Failsafe:** $\rightarrow$ **60 menit**.

Jadwal **langsung dibuat seketika di Google Calendar** tanpa interogasi. N.E.X.A mengonfirmasi dengan pesan elegan satu-baris yang menyertakan durasi terpasang, memberikan kenyamanan psikologis (*psychological comfort*) bahwa Tuan memegang kendali penuh dan dapat mengubahnya kapan saja secara santai.

#### Kalender Anti-Bentrok (Conflict Detection)
Sebelum acara ditambahkan, `googleWorkspace.checkCalendarConflicts` melakukan kueri ke API Free/Busy Google Calendar. Jika waktu tersebut bertabrakan dengan jadwal aktif lain, sistem melontarkan status `CONFLICT_DETECTED` ke Telegram beserta rincian acara yang bentrok untuk meminta konfirmasi Tuan.

---

### 5.2 Task Manager: *Dynamic Tasklist Discovery* & Ekosistem 17 Aksi

N.E.X.A tidak lagi menggunakan pencocokan ID atau tabel kata kunci statis yang kaku. `Task_Manager.js` mengimplementasikan **Dynamic Tasklist Discovery** (`_matchBestTasklist`):

1. **Sinkronisasi Langsung ke Google Tasks:** Sistem membaca daftar tasklist aktual milik Tuan di Google Cloud (`Tugas Saya`, `Tugas Kuliah`, `Pekerjaan`, `Riset & Baca`, `Belanja`) dengan in-memory cache 5 menit.
2. **Pencocokan Semantik Fleksibel:** Judul tugas dicocokkan secara dinamis dengan nama-nama list yang ada di akun Tuan.
3. **Dukungan Penuh 17 Aksi Manajemen Tugas:**
   - `CREATE`, `CREATE_SUBTASK`, `CREATE_MULTIPLE`
   - `READ`, `READ_LIST`, `READ_LISTS`, `READ_TODAY`, `READ_TOMORROW`, `READ_UPCOMING`, `READ_OVERDUE`, `READ_DONE`
   - `COMPLETE`, `DELETE`, `EDIT`, `MOVE`, `CLEAR_DONE`, `SET_PRIORITY`
4. **Paralel Sinkronisasi ke Notion:** Setiap operasi tugas di Google Tasks secara paralel disalin ke database Notion (`notionClient.createTask`, `completeTask`, `deleteTask`) untuk menjamin konsistensi lintas platform.

---

### 5.3 Memori Kerja Jangka Pendek (*Working Memory & Ordinal Context Resolution*)

Manusia berkomunikasi secara relatif terhadap apa yang baru saja mereka lihat di layar. N.E.X.A v3.1 menanamkan **Short-Term Working Memory Cache** (`_lastRenderedCalendarEvents` dan `_lastRenderedTasks`):

- **Resolusi Kata Kunci Ordinal:**
  - *"Tandai tugas yang **pertama** / **nomor 1** selesai"* $\rightarrow$ Menargetkan item indeks #1 (`INDEX_1`).
  - *"Hapus tugas yang **kedua**"* $\rightarrow$ Menargetkan item indeks #2 (`INDEX_2`).
  - *"Hapus tugas yang **terakhir** / **paling bawah**"* $\rightarrow$ Menargetkan item indeks paling akhir.
- **Resolusi Relatif Temporal (*"Yang Tadi"*):**
  - *"Ubah jadwal yang **tadi barusan** jadi jam 3 sore"* $\rightarrow$ N.E.X.A merujuk ke aksi kalender terakhir (`_lastActionContext`).
- **Jangkar Temporal Bahasa Alami (WIB):**
  - `pagi` = 09:00 WIB, `siang` = 13:00 WIB, `sore` = 16:00 WIB, `malam` = 20:00 WIB, `habis/ba'da ashar` = 15:30 WIB, `ba'da isya` = 19:30 WIB.

---

### 5.4 Autonomous Time-Blocking & Presisi Penanggalan (*Timezone Integrity*)

Jika sebuah tugas memiliki tenggat waktu (*Deadline Date*) **DAN** preferensi waktu pengerjaan, N.E.X.A mengaktifkan `findEmptySlot()` dan menjadwalkan blok kerja:
- Menambahkan *Event* `"⏰ BLOK KERJA: [Nama Tugas]"` pada kalender kerja (08:00 – 22:00 WIB).
- Menambahkan *Event All-Day* `"🔴 DEADLINE: [Nama Tugas]"` berwarna merah (*Tomato*) pada hari H.
- **Two-Way Status Sync:** Saat tugas ditandai selesai (`COMPLETE`), blok kerja dan deadline di Google Calendar otomatis diubah warnanya menjadi **Graphite (Abu-abu, `colorId: 8`)** untuk menandakan penyelesaian secara visual.

**Presisi Timezone Asia/Jakarta (`normalizeDateOnly`):**  
Google Tasks API hanya menerima format string Date-Only UTC (`YYYY-MM-DDT00:00:00.000Z`). Fungsi `normalizeDateOnly` mengunci representasi tanggal lokal WIB (+07:00) ke UTC midnight secara deterministik, meniadakan bug pergeseran tanggal (*off-by-one day*) di HP Samsung Galaxy A33 Tuan.

---

### 5.5 Predictive Context Engine (Kesadaran Memori Agenda)

N.E.X.A bukan sekadar pembaca jadwal, melainkan entitas yang **membaca dan mengantisipasi**:
1. Saat menampilkan jadwal (`READ_TODAY`), sistem mengekstrak topik acara (misal: *"Meeting Skripsi"* $\rightarrow$ *"skripsi"*).
2. Menghubungkan metadata terkait dari `nexa_vault_items` (berkas dokumen Google Drive) dan `nexa_2nd_brain` (catatan memori).
3. Menyajikan tautan konteks langsung di bawah jadwal di Telegram.
4. Memberikan **Saran Proaktif Otomatis** untuk membuat tugas persiapan di Google Tasks jika acara terindikasi formal (seminar, presentasi, sidang). 
Google Tasks hanya menyimpan tanggal (*Date-Only*) untuk jatuh tempo, tanpa jam. Di NodeJS, mem-*parse* string `2026-05-09` menghasilkan objek waktu Midnight UTC (`00:00:00Z`), yang setara dengan **07:00 WIB pagi**. N.E.X.A menggunakan perlindungan mutlak di *Task Manager* untuk memfilter *midnight strings* ini agar tidak menjadi *ghost event* (acara tanpa jam yang menumpuk di pagi hari). Selain itu, konstruksi rentang waktu (*start/end*) dikalibrasi ketat ke format ISO dengan offset absolut `+07:00` (menggunakan manipulasi lokal `sv-SE`), mencegah pergeseran jam sepihak oleh sistem *backend* Google Calendar.

---

### 5.6 The Discipline God Mode & Native Android 16 Physical Enforcement (Nexa Bridge Protocol v3.0)

Manajemen waktu N.E.X.A dilengkapi dengan **Discipline God Mode** (`Discipline_GodMode.js`) dan **App Discipline Engine** (`App_Discipline_Engine.js`), sebuah sistem penegakan kedisiplinan dua arah (*closed-loop bidirectional enforcement*) yang menghubungkan kognisi cloud langsung dengan perangkat fisik Tuan Faqih (Samsung Galaxy A33 5G / Android 16 One UI 8) melalui **Nexa Mobile Bridge** (*Native Kotlin WebSocket Gateway* `MobileBridge_WS.js`).

#### 1. Arsitektur Pelacakan Native Android 16 (`AppUsageTracker.kt`)
Pelacakan waktu aplikasi tidak mengandalkan aplikasi pihak ketiga, melainkan memanfaatkan dua API native Android 16:
- **`AccessibilityService.TYPE_WINDOW_STATE_CHANGED`**: Menangkap detik perpindahan aplikasi secara instan dan menghitung *Live Active Session Duration* (durasi sesi berjalan).
- **`UsageStatsManager.queryUsageStats()`**: Membaca data historis akumulasi pemakaian harian (`totalTimeInForeground`) dari sistem operasi.
- **`nexa_app_limits` (Supabase Central Policy Table)**: Pusat kendali batas waktu per sesi (`max_session_minutes`), batas harian (`max_daily_minutes`), dan level eskalasi yang dapat diedit secara dinamis kapan saja tanpa perlu mengompilasi ulang aplikasi HP.

#### 2. Arsitektur Eskalasi Dinamis 4 Level (*Multi-Stage Defiance Hierarchy*)
Sistem mengukur durasi dan frekuensi pelanggaran untuk menentukan level penindakan fisik:
- **Level 1 (*Cognitive Reminder & Gentle Nudge*):** Dipicu saat sesi mencapai **80% dari batas** (misal menit ke-24 pada sesi 30m). Server meracik kalimat nasihat lembut via LLM real-time, mengirim pengingat Telegram, dan membunyikan suara TTS di HP tanpa mengganggu tampilan layar.
- **Level 2 (*Active Friction & Force Home*):** Dipicu saat batas sesi/harian mencapai **100%**. Server mengeksekusi `GO_HOME_SCREEN` via Accessibility Service yang seketika melempar pengguna ke *Home Screen*, memutar suara peringatan tegas J.A.R.V.I.S, mengirim laporan audit Telegram, dan memasukkan aplikasi ke dalam **Masa Lockout 30 Menit**.
- **Level 3 (*Surgical Restriction & Instant Re-Bounce*):** Dipicu jika pengguna mencoba membuka kembali aplikasi (*Ngeyel Upaya #1*) selama masa lockout 30 menit. Sistem mengeksekusi *Re-Bounce Instan (<0.5 detik)*, menampilkan layar pelindung penuh (*Focus Shield Overlay* `OverlayActivity`), memperdengarkan suara dingin AI, dan mencatat pembangkangan ke tabel memori perilaku `nexa_behavior_log`.
- **Level 4 (*God Mode Ultimate - Physical Screen Lockout*):** Dipicu jika terjadi pembangkangan berulang (*Ngeyel Upaya #2+*). Server mengeksekusi **Penguncian Layar Fisik Otomatis (`LOCK_SCREEN` via Global Accessibility Action)**, mengaktifkan mode senyap total (`FORCE_DND Priority Only`), memperdengarkan suara otoritatif AI, serta menyiarkan peringatan darurat (*Red Alert*) ke Telegram.

#### 3. Infrastruktur Nol-Latensi & Efisiensi Daya (*Battery-Optimized WebSocket*)
Komunikasi fisik mengandalkan koneksi WebSocket aman (`wss://.../ws`) dengan mekanisme *Event-Driven*:
- **Zero Handshake Overhead**: Satu soket TCP persisten dengan latensi eksekusi **< 100 ms**.
- **Deep Sleep Immunity**: Saat layar ponsel mati atau pengguna berada di Launcher sistem, prosesor HP tidur total (*0% pemborosan baterai*).
- **Graceful Failover**: Dilengkapi *in-memory policy cache* dan pemulihan otomatis jika koneksi jaringan terputus.

#### 4. Panduan & Tutorial Konfigurasi Dinamis (*CRUD App Limits Management*)

Aturan pembatasan aplikasi bersifat **100% dinamis** dan dapat diubah kapan saja tanpa perlu meng-install ulang atau mengompilasi file APK Android di ponsel.

##### A. Struktur Metadata Tabel `nexa_app_limits` (Supabase)
| Kolom | Tipe | Penjelasan |
| :--- | :---: | :--- |
| `package_name` | `TEXT (UNIQUE)` | Package ID Android (misal: `com.google.android.youtube`). |
| `app_label` | `TEXT` | Nama aplikasi yang ramah manusia (misal: `YouTube`). |
| `max_session_minutes` | `INT` | Batas durasi maksimum per satu kali sesi aktif. |
| `max_daily_minutes` | `INT` | Batas total akumulasi waktu pemakaian per hari (00:00 - 23:59). |
| `warning_threshold_pct`| `INT` | Persentase pemicu peringatan dini (default: `80`%). |
| `escalation_level` | `INT` | Level eskalasi awal saat batas terlampaui (`1` - `4`). |
| `is_active` | `BOOLEAN` | Status saklar pemantauan (`true` = dipantau, `false` = bebas). |

##### B. Cara Utama: Mengubah Batas Waktu Langsung Lewat Chat Telegram
Tuan Faqih cukup mengirim pesan obrolan natural ke bot Telegram N.E.X.A seperti berbicara dengan asisten pribadi:

* **Melihat Daftar Batas Aplikasi:**
  > *"Nexa, cek batas aplikasi"* atau *"Nexa, tampilkan daftar screen time"*
* **Mengedit Batas Durasi:**
  > *"Nexa, ubah batas waktu YouTube jadi 45 menit"*
  > *"Nexa, set limit Instagram maksimal 30 menit per sesi"*
* **Menambahkan Aplikasi Baru:**
  > *"Nexa, tambahkan Mobile Legends dengan batas 20 menit sesi dan 40 menit harian"*
* **Menonaktifkan / Membebaskan Batas:**
  > *"Nexa, matikan pemantauan TikTok"*
  > *"Nexa, hapus batas waktu Instagram"*

##### C. Metode Tingkat Lanjut: Melalui Supabase SQL Editor
Selain melalui chat, modifikasi langsung via SQL database juga didukung penuh:

* **Mengubah Batas Durasi:**
```sql
UPDATE "public"."nexa_app_limits"
SET "max_session_minutes" = 45, "max_daily_minutes" = 120, "updated_at" = NOW()
WHERE "package_name" = 'com.google.android.youtube';
```

* **Menambahkan Aplikasi Baru:**
```sql
INSERT INTO "public"."nexa_app_limits" 
  ("package_name", "app_label", "max_session_minutes", "max_daily_minutes", "escalation_level")
VALUES 
  ('com.mobile.legends', 'Mobile Legends', 25, 60, 3)
ON CONFLICT ("package_name") 
DO UPDATE SET 
  "max_session_minutes" = EXCLUDED.max_session_minutes,
  "max_daily_minutes" = EXCLUDED.max_daily_minutes;
```

* **Menonaktifkan Sementara atau Menghapus:**
```sql
-- Nonaktifkan sementara:
UPDATE "public"."nexa_app_limits" SET "is_active" = false WHERE "package_name" = 'com.google.android.youtube';

-- Hapus permanen:
DELETE FROM "public"."nexa_app_limits" WHERE "package_name" = 'com.mobile.legends';
```

*Setiap kali operasi CRUD di atas dijalankan, fungsi `invalidateLimitsCache()` pada server akan otomatis membersihkan RAM cache, sehingga aturan baru langsung aktif dalam hitungan milidetik tanpa perlu me-restart server ataupun aplikasi HP.*

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
Jika kuota *Service Account* Azure (yang sering dibatasi Google) habis (`"Service Accounts do not have storage quota"`), sebuah *try-catch* *handler* khusus segera menangkap *error* tersebut dan **melakukan fallback paksa** menggunakan kredensial OAuth2 User Tuan Faqih (via `getOAuthDriveClients()`). Hasil ekstrak teks OCR ini kemudian di-simpan utuh ke tabel `nexa_vault_items` agar bisa dicari secara semantik kapanpun.

### 6.5 *Cognitive Identity Engine* (Phase 6)

Sistem N.E.X.A kini dilengkapi dengan **Cognitive Identity Engine**, sebuah arsitektur yang mampu menyintesis dan mengembangkan pemahamannya tentang Tuan Faqih secara mandiri (evolusi identitas).

1. **Inference Engine (`Inference_Engine.js`)**: Berjalan setiap Minggu pukul 21:00 WIB. AI mensintesis seluruh riwayat percakapan seminggu terakhir (`nexa_chat_memories`) beserta *behavior log* (`nexa_behavior_log`), dan mengevaluasinya pada **7 Dimensi Identitas**: *FACTS, PREFERENCES, HABITS, VALUES, DECISION_STYLE, WEAKNESSES, MOTIVATIONS*.
2. **Identity Proposals (Persetujuan Telegram)**: Setiap hipotesis tentang diri Tuan Faqih akan dicatat sebagai proposal (STAGED). Proposal dengan tingkat keyakinan tinggi (>85%) akan masuk ke status PENDING dan dikirim via Webhook Telegram menggunakan *Inline Keyboard*. Tuan Faqih memiliki kuasa mutlak untuk **APPROVE** atau **REJECT**. Jika ditolak, N.E.X.A akan menanyakan alasan penolakan dan mempelajarinya agar tidak mengulangi simpulan yang sama.
3. **AI-Calibrated Morning Check-In (`Intelligence_Brief.js`)**: Metrik biologis (tidur, energi, fokus) pada pagi hari tidak lagi diproses secara kaku. N.E.X.A dibekali *regex parser* ekstensif dengan **80+ kosakata narasi informal & keluhan** (contoh: *mager, capek, karena, soalnya, pusing, kepikiran*). Jika kata-kata ini terdeteksi, AI Parser secara otomatis mengevaluasi narasi tersebut, memvalidasi skor aslinya, dan menyimpan analisis mendalam ke dalam *behavior log*.

### 6.6 *Cognitive Resonance & Anticipatory Intelligence* (N.E.X.A v2.7)

Puncak kematangan kognisi N.E.X.A dicapai melalui evolusi arsitektural **v2.7 ("Cognitive Resonance & Anticipatory Intelligence")**. Pada versi ini, sistem memori dan penalaran N.E.X.A beralih dari penyimpanan statis menuju **model kognisi organik dan intervensi proaktif**.

```mermaid
flowchart TD
    A[User Event / Message] --> B[AI Router & NLP Classifier]
    B --> C[Ebbinghaus Memory Decay Engine]
    C -->|R = e^(-\lambda t)| D[Tiered Approval Pipeline]
    D -->|Tier 1: Auto-Commit| E[(Supabase Fact Store)]
    D -->|Tier 2/3: Review| F[Telegram Inline Keyboard]
    
    B --> G[Anticipatory Engine]
    G -->|36h Emotional Time-Series| H[Causal Knowledge Graph]
    H -->|Overthinking / Late Night| I[Proactive Intervention Alert]
    
    E --> J[Conversational Memory UX]
    J --> K[Natural Executive Narrative + Status Badge]
```

#### 1. *Ebbinghaus Memory Decay Engine & 365-Day Cap*
Memori manusia tidak bersifat permanen statis; ingatan yang tidak diperkuat akan meluruh. N.E.X.A mengadopsi kurva peluruhan biologis Hermann Ebbinghaus dengan rumusan matematis:
\[R = e^{-\lambda t}\]
Di mana \(R\) adalah kekuatan retensi memori, \(\lambda\) adalah laju peluruhan spesifik per lapisan identitas (`HABITS` memiliki \(\lambda\) yang lebih kecil dibanding preferensi kasual), dan \(t\) adalah waktu terlewat dalam hari. Untuk mencegah kesalahan kalkulasi ekstrem (*extreme underflow*) pada data lampau atau migrasi lama, sistem menerapkan pengaman batas maksimum 365 hari (`Math.min(daysSince, 365)`).

#### 2. *Tiered Approval Pipeline* (Persetujuan Berjenjang Tier 1, 2, 3)
Agar N.E.X.A dapat belajar secara mandiri tanpa membebani Tuan Faqih dengan notifikasi berlebih, inferensi identitas dikelompokkan ke dalam tiga jalur:
- **Tier 1 (*Auto-Approve*):** Penguatan kebiasaan positif atau pengulangan fakta yang sudah sejalan langsung dikomit ke database utama.
- **Tier 2 (*Soft Approval 48h*):** Hipotesis pola perilaku baru yang dievaluasi dalam masa penantian 48 jam sebelum dikonsolidasikan.
- **Tier 3 (*Manual Review*):** Perubahan fundamental pada prinsip hidup atau preferensi strategis wajib mendapatkan persetujuan eksplisit melalui tombol interaktif Telegram.

#### 3. *Intention & Decision Journaling Anti-Spam* (`Intention_Engine.js`)
Sistem melacak keselarasan antara niat yang diucapkan (*Stated Intention*) dengan tindakan nyata (*Revealed Action*). Untuk menjaga kenyamanan eksekutif, modul ini dilengkapi filter anti-spam berbasis *null-check pointer* (`.is('outcome_received_at', null)`), memastikan penagihan evaluasi keputusan hanya dikirimkan tepat **satu kali** saat jatuh tempo.

#### 4. *36-Hour Emotional Time-Series & Causal Knowledge Graph*
- **Jendela Emosi 36 Jam:** Menganalisis fluktuasi suasana hati melintasi siklus hari kerja malam menuju pagi esoknya, mengenali varians tinggi (*High Variance*) maupun tren penurunan energi untuk menyusun narasi evolusi kepribadian mingguan.
- **Grafik Sebab-Akibat (*Causal Knowledge Graph*):** Menghubungkan simpul-simpul kejadian empiris (contoh: *hubungan antara tidur larut malam dengan impulsivitas pengeluaran esok harinya*) di dalam database.

#### 5. *Anticipatory Interventions & Conversational Memory UX*
- **Intervensi Proaktif:** N.E.X.A bertindak sebagai pelindung kognitif yang memutus *Overthinking Spiral* saat mendeteksi sesi konsultasi berlarut-larut tanpa keputusan, serta mengaktifkan peringatan *Late Night Decision Guard* saat mendeteksi transaksi finansial berisiko di tengah malam.
- **Conversational Memory UX:** Menghapus balasan konfirmasi robotik. Setiap operasi penyimpanan atau penghapusan fakta kini dijawab dengan narasi hangat natural dari AI Router yang dikombinasikan dengan *status badge* transparan (`✅ Tersimpan di Memori Personal` atau `🗑️ Dihapus dari Memori Personal`).

### 6.7 *Phase 8: Self-Learning Engine & Passive Knowledge Acquisition*

Evolusi tertinggi dari sistem memori N.E.X.A diwujudkan melalui arsitektur *Self-Learning Engine* (Phase 8). Pada fase ini, N.E.X.A tidak lagi bergantung pada *hardcoded rules* di dalam *source code* untuk memperbaiki pelayanannya. Ia belajar secara pasif (*passive learning*) dari setiap percakapan.

#### 1. Arsitektur Dual-Layer Learning
Terdapat dua lapisan pembelajaran otonom yang bekerja bersamaan namun terisolasi dari *System Seed* (Aturan Dasar):

- **Layer 1: Passive Real-Time Learning (Senyap & Langsung)**
  Setiap pesan dari Tuan Faqih dipindai oleh sub-rutin NLP ringan (`isFactAboutNexa`) di `adapter.js`. Jika terdeteksi bahwa pesan tersebut berisi koreksi, teguran, atau observasi tentang perilaku N.E.X.A (contoh: *"jangan pakai format poin lagi"*, *"format balasanmu terlalu formal"*), pesan ini dicegat dan diklasifikasikan ke dalam 5 dimensi (LIMITATIONS, CORRECTIONS, COMMUNICATION_STYLE, CAPABILITIES, OPERATIONAL_RULES). Data kemudian di-*upsert* secara senyap ke tabel `nexa_self_model` menggunakan *fire-and-forget promise*, tanpa mengganggu atau memperlambat respons utama obrolan. Mekanisme ini menggunakan *trait_key* unik untuk memastikan revisi *in-place* tanpa duplikasi atau kontradiksi.

- **Layer 2: Weekly Self-Reflection Pass (Refleksi Mingguan)**
  Setiap hari Minggu pukul 16:00 WIB, N.E.X.A mengeksekusi `runWeeklySelfReflectionPass()`. Ia menarik seluruh log percakapan selama 7 hari terakhir beserta profil emosionalnya, lalu melakukan kontemplasi internal: *"Apa yang saya pelajari tentang diri saya minggu ini? Di mana saya paling sering ditegur? Kapabilitas baru apa yang sering saya lakukan dengan baik?"*. Hasil kontemplasi ini menghasilkan sintesis identitas baru yang akan memperkuat pemahamannya tentang dirinya sendiri.

#### 2. Konteks Injeksi 5-Fakta
Agar N.E.X.A dapat langsung mengaplikasikan apa yang baru saja ia pelajari tanpa menghabiskan kuota token berlebih, `AI_Router` dilengkapi mekanisme injeksi cerdas. Sebelum meracik *prompt* untuk AI eksekutor, N.E.X.A memanggil `getSelfModel(5)` untuk menarik 5 fakta pembelajaran teratas. Kelima fakta ini diinjeksi tepat di bawah blok instruksi utamanya dengan tajuk `[PEMAHAMAN DIRI N.E.X.A (SELF-AWARENESS)]`. Ini memastikan bahwa Tuan Faqih tidak perlu mengulangi instruksi gaya komunikasi atau batasan operasional yang sama dua kali.

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

Beroperasi di atas **Azure VPS Jakarta** (`Standard_B2ats_v2`, Ubuntu 24.04, `indonesiacentral`) dengan domain produksi `https://nexa-server.indonesiacentral.cloudapp.azure.com`, N.E.X.A mengimplementasikan rekayasa jaringan (*network engineering*) dan protokol keamanan tingkat militer untuk menjaga ketersediaan layanan dan privasi mutlak Tuan Faqih.

### 8.1 *Zero-Outbound Telegram Bypass* & *Relay Chain*

Meskipun N.E.X.A kini berjalan di Azure VPS (bukan platform serverless), strategi *Dual-Strategy Routing* tetap dipertahankan demi ketahanan jaringan berlapis. Koneksi langsung ke Telegram (`Direct` tier) kini menjadi jalur utama (Tier 1), sementara Vercel Relay dan AllOrigins berfungsi sebagai *fallback* cadangan jika terjadi gangguan jaringan sesaat.

N.E.X.A mengatasi limitasi fisik peladen ini dengan **Dual-Strategy Routing** di `telegram_network.js`:
1. **Zero-Outbound Webhook**: Untuk pesan obrolan biasa, modul `webhook.js` tidak membuat koneksi baru. Ia menanamkan *payload* `JSON { method: "sendMessage", text: "..." }` langsung ke dalam **HTTP Webhook Response (res.status(200).json)**. Balasan meluncur dengan 0 koneksi keluar.
2. **Vercel Relay & Failover Chain**: Untuk operasi latar belakang (*Cron Jobs*) yang tidak diinisiasi oleh pesan masuk, N.E.X.A membidik *request* ke infrastruktur Vercel (`NEXA_VERCEL_RELAY_URL`) yang mem- *proxy* pesan ke Telegram. Jika Vercel mati, `fetchWitAzureailover` secara otomatis me- *routing* ulang permintaan lewat AllOrigins API, menciptakan ketahanan jaringan berlapis.

### 8.2 Postur Keamanan & *Firewall* Isolasi Data (`security.js`)

Semua lalu lintas HTTP masuk dijaga oleh *middleware* keamanan sebelum mencapai mesin kognitif:

1. **Telegram Identity Lock**: N.E.X.A membedah struktur Webhook Telegram (*message*, *callback_query*, *channel_post*). Jika *Chat ID* pengirim tidak sama persis dengan `TELEGRAM_CHAT_ID` Tuan Faqih, koneksi seketika digugurkan dengan respons *403 Forbidden*.
2. **Anti-Spoofing Webhook**: Mencegah *hacker* mengirim *request* palsu ke *endpoint* N.E.X.A. Sistem memverifikasi *Header* `X-Telegram-Bot-Api-Secret-Token` murni dari *server* Telegram.
3. **Mobile Bridge WebSocket Handshake Authentication**: Sambungan WebSocket dari ponsel Android Samsung Galaxy A33 5G (`wss://.../ws`) dijaga dengan verifikasi `Authorization: Bearer <NEXA_DEVICE_SECRET>` pada saat handshake koneksi awal.
4. **Timing Attack Immunity**: Seluruh pencocokan *password/secret* di N.E.X.A menggunakan `crypto.timingSafeEqual()`, memastikan peretas tidak bisa menebak *password* berdasarkan waktu respons CPU.

### 8.3 Orkestrasi *Environment Variables* Terpusat (`env.js`)

Modul `env.js` mengelola lebih dari 30 *credential* rahasia untuk mengeksekusi integrasi lintas platform, meliputi:

- **LLM Key Rotation & Multi-Modal Inference**: N.E.X.A siap menghadapi *Rate Limit* gratisan dengan menyiapkan slot rotasi untuk 4 Kunci Gemini (`GEMINI_API_KEY_1-4`), 4 Kunci Groq, Cerebras, Mistral, **Hugging Face Inference API** (`HF_TOKEN` untuk Vision OCR, Whisper Voice, dan model fallback), hingga *fallback* premium via OpenRouter.
- **Dual Google Authentication**: Menggunakan JSON *Service Account* (`GOOGLE_PRIVATE_KEY`) untuk operasi Google Drive, namun menggunakan sistem kredensial manusia (OAuth2 `GMAIL_REFRESH_TOKEN` & `TASKS_REFRESH_TOKEN`) untuk mengakses *inbox* email dan daftar tugas Tuan Faqih secara mandiri.
- **Node Fisik & Integrasi Eksternal**: Kunci akses untuk Supabase (Memori Permanen), Notion (Task Sync), Serper.dev (Pencarian Web), dan Nexa Mobile Bridge Secret (`NEXA_DEVICE_SECRET` untuk Eksekutor God Mode Android).

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

---

---

## BAB 10: THE LIVING MEMORY ENGINE (SISTEM MEMORI ORGANIS)

Bab ini mendokumentasikan pembaruan revolusioner **Phase 9**, di mana N.E.X.A berevolusi dari sekadar pengingat pasif menjadi sistem yang memiliki ingatan organik—layaknya otak manusia yang dapat belajar, menegaskan kembali (*reinforce*), melupakan hal yang tak lagi relevan (*decay*), dan menyembuhkan dirinya dari kontradiksi.

---

### 10.1 Progressive Fact Injection: Resolusi Beban Kognitif
Masalah sistem memori konvensional adalah penumpukan konteks: jika pengguna memiliki 250 baris memori (fakta dan preferensi), memuat seluruhnya ke dalam prompt akan menghancurkan kuota token dan membingungkan AI.

N.E.X.A menyelesaikan ini dengan **Progressive Fact Injection & Dynamic Word Resonance** di `AI_Router.js`:
- **Core Limit**: Hanya 10 fakta paling krusial (`PROFILE_CORE_COUNT`) dari `nexa_user_profile` dan 10 identitas pokok dari `nexa_core_identity` yang di-injeksi secara paksa.
- **Dynamic Resonance**: Maksimal 10 fakta tambahan di-injeksi **hanya jika** terdapat kecocokan kata kunci minimum 4 huruf (mengabaikan stop words) antara pesan pengguna dan fakta di database. 
- **Self-Model Injection**: Selalu mengambil 5 fakta terbaru (*Top 5*) dari tabel `nexa_self_model` agar N.E.X.A menyadari kapabilitas terbarunya tanpa membanjiri konteks.
- **Efisiensi**: Memangkas penggunaan token hingga 85% untuk chat sehari-hari dengan mempertahankan 100% kesadaran kontekstual yang relevan.

---

### 10.2 Supersede Engine v2: Resolusi Ingatan Baru
Ketika Tuan Faqih memberitahu informasi baru, fungsi `deduplicateAndSaveFact` dipanggil. Ini bukan sekadar insert data, melainkan logika 4 arah:
1. **NEW**: Fakta benar-benar baru → Simpan dengan status `ACTIVE`.
2. **REINFORCE**: Fakta sudah ada → Naikkan `evidence_count` +1, perbarui `last_reinforced_at` ke waktu sekarang.
3. **SUPERSEDE**: Fakta berlawanan atau menggantikan yang lama (Misal: "Dulu suka kopi, sekarang suka teh") → Fakta lama di-`ARCHIVED`, fakta baru disimpan, kategori diwarisi dari fakta lama.
4. **DUPLICATE**: Sama persis tanpa detail baru → Abaikan sepenuhnya.

**Concurrency Protection**: Dilengkapi dengan mutex `_dedupInFlight` untuk mencegah *race condition* jika Tuan Faqih mengirim pesan bertubi-tubi yang memicu ekstraksi fakta ganda di waktu bersamaan.

---

### 10.3 Memory Hygiene Pipeline: Pembersihan Memori 4-Tahap
Agar ingatan tetap segar dan tidak menjadi tempat sampah informasi usang, N.E.X.A menjalankan siklus `runFullHygienePipeline` setiap hari Minggu pukul 02:00 WIB.

#### Step 1: Ephemeral Sweep (Penyapuan Fakta Sementara)
Memori dengan `category_type = 'EPHEMERAL'` (seperti mood sesaat atau fokus mingguan) dipindai secara matematis murni. Jika umurnya melebihi 30 hari tanpa penegasan (`last_reinforced_at`), statusnya diubah dari `ACTIVE` menjadi `ARCHIVED`. 

#### Step 2: Ebbinghaus Decay Score (Peluruhan Ingatan)
Meniru kelupaan alami manusia. Kurva Ebbinghaus ($R = e^{-\lambda \cdot t}$) diterapkan pada fakta `PREFERENCE`.
- `PERMANENT_FACT` dan `RULE` dikecualikan secara absolut.
- Jika skor kepercayaan ($R$) turun di bawah **60%**, fakta dikelompokkan ke `STAGED_FOR_PRUNING` (Memudar).
- Jika skor anjlok di bawah **30%**, fakta langsung dipindahkan ke `ARCHIVED`.
- **Zero Token Cost**: Eksekusi ini 100% matematis tanpa memanggil API LLM.

#### Step 3: Contradiction Batch Audit (Penalaran AI Tingkat Tinggi)
Satu-satunya tahap yang menggunakan penalaran AI secara berat. Seluruh sisa memori aktif dimasukkan ke dalam prompt.
- Memaksa penggunaan **Gemini 2.5 Flash** melalui `{ forceHeavy: true }` (me-bypass SACR).
- AI ditugaskan khusus mencari fakta yang berkontradiksi atau berlebihan. 
- Fakta berbenturan diarsipkan, dan AI menghasilkan kalimat *merger* tunggal yang komprehensif, ditulis dengan prespektif orang ketiga yang netral ("Tuan Faqih suka...").
- *Output constraint*: Dipaksa murni menggunakan JSON array (tanpa markdown).

#### Step 4: Laporan Interaktif Telegram
Sistem menjunjung tinggi kontrol pengguna. Fakta yang berada di ambang batas pemudaran (di Step 2) dilaporkan ke Telegram Tuan Faqih dengan *Inline Keyboard*:
- **[ ✅ Arsipkan Semua ]**: Eksekusi penghapusan (status `ARCHIVED`).
- **[ ❌ Tahan Semua ]**: Membatalkan penghapusan (mengembalikan ke `ACTIVE`).
- **[ 🔍 Pilih Manual ]**: Memungkinkan Tuan Faqih mengatur secara manual baris demi baris via chat teks.

Keseluruhan sistem ini menjadikan N.E.X.A asisten pertama yang memiliki kognisi organik—mengingat sekuat komputer, namun memilah serelevan manusia.

---

## BAB 11: NEXA MOBILE BRIDGE — NEURAL-PERIPHERAL EXTENSION (TUBUH, INDERA & EKSEKUTOR FISIK)

Bab ini mendokumentasikan terobosan arsitektural **N.E.X.A 3.0 Mobile Bridge**, yang menghubungkan *Cloud Brain* (Azure VPS) dengan perangkat fisik Android (Samsung Galaxy A33 5G / Android 16 One UI 8). Melalui jembatan ini, N.E.X.A tidak lagi terkurung sebagai teks di dalam chat, melainkan memiliki mata, tangan, telinga, lokasi, dan suara di dunia nyata.

---

### 11.1 Filosofi "Otak di Cloud, Tubuh di Android"

Sistem AI asisten konvensional umumnya terbagi menjadi dua kompromi buruk:
1. **On-Device AI Lemah**: Model AI kecil yang dijalankan lokal di HP boros baterai, cepat panas, dan bodoh.
2. **Chatbot Terisolasi**: AI berbasis cloud yang pintar tetapi buta dan lumpuh—tidak tahu di mana pengguna berada, tidak bisa melihat layar, dan tidak bisa mengoperasikan aplikasi HP.

N.E.X.A memecahkan dilema ini dengan arsitektur **Neural-Peripheral Separation**:
- **Otak (Cloud Core)**: Berada di Azure VPS (PM2, Node.js 20, LLM Multi-Tier Router, Supabase Memory). Bebas dari batasan daya dan baterai.
- **Tubuh (Mobile Bridge Native)**: Aplikasi Android native (Kotlin, Coroutines, Jetpack Compose, AccessibilityService, Foreground Service) yang bertindak sebagai sensor nirkabel (*Sensory Ingestion*) dan aktuator perangkat (*Hardware Actuator*).

```
 ┌─────────────────────────────────────────────────────────────┐
 │               N.E.X.A CLOUD CORE (Azure VPS)                │
 │  AI Router • Fallback Engine • Memory • Location • Voice    │
 └──────────────────────────────┬──────────────────────────────┘
                                │
               Duplex WSS Link (Encrypted WebSocket)
               Port 3000 /ws (Protected by Caddy & TLS)
                                │
 ┌──────────────────────────────▼──────────────────────────────┐
 │         N.E.X.A MOBILE BRIDGE (Samsung Galaxy A33 5G)       │
 │  Mata (Kamera/Layar) • Tangan (Accessibility) • Suara (TTS) │
 │  Lokasi (Dual GPS Fix) • Interupsi (FakeCallActivity)       │
 └─────────────────────────────────────────────────────────────┘
```

---

### 11.2 Topologi Protokol Komunikasi & Keamanan Jaringan

Komunikasi antara Cloud Core dan HP menggunakan protokol **Nexa Bi-directional WebSocket (WSS)** yang beroperasi di atas `/ws` dengan standar keamanan perbankan:

1. **Timing-Safe Constant-Time Token Handshake**:
   Setiap koneksi WebSocket dari Android wajib menyertakan header otorisasi `Authorization: Bearer <CONFIGURED_SECRET>`. Di sisi server (`MobileBridge_WS.js`), verifikasi token menggunakan `crypto.timingSafeEqual` pada *raw byte buffer*. Ini mencegah serangan *timing attack* secara matematis. Percobaan koneksi tanpa token langsung diputus dengan kode `4001 Unauthorized`.
2. **Single-Device Instant Termination**:
   Untuk mencegah konflik *split-brain* atau koneksi ganda akibat pergantian jaringan (Wi-Fi ke 4G), server secara instan mematikan (*terminate*) soket lama saat soket baru tersambung.
3. **Anti-Ghost Promise Cleanup & Fail-Safe Memory Purge**:
   Setiap perintah ke HP memiliki batas waktu (*timeout* 5–12 detik). Jika HP terputus di tengah eksekusi perintah, seluruh *pending promise* di memori server langsung dibersihkan (`resolve({ success: false, status: 'DISCONNECTED' })`), mencegah *event loop deadlock* di Node.js.
4. **Heartbeat Proaktif (PING/PONG)**:
   Interval detak jantung periodik setiap 30 detik untuk mendeteksi *silent network drop* dari ISP seluler.

---

### 11.3 Indera Penglihatan & Persepsi Visual (*Eyes of NEXA*)

N.E.X.A memiliki akses visual penuh terhadap lingkungan fisik dan lingkungan digital pengguna:

1. **Fotografi Senyap Latar Belakang (`TAKE_PHOTO`)**:
   - Dieksekusi melalui `TransparentCameraActivity` menggunakan Android CameraX API.
   - Parameter `camera_facing`: `'front'` (kamera swafoto depan) atau `'back'` (kamera utama belakang).
   - Mengambil foto secara hening tanpa menampilkan *preview frame* yang mengganggu, mengompres gambar ke JPEG Base64, dan mengirimkannya ke `Vision_Engine` untuk analisis AI (membaca dokumen, memverifikasi situasi, atau mendeteksi objek).
2. **Tangkapan Layar Real-Time (`TAKE_SCREENSHOT`)**:
   - Menggunakan `MediaProjection` / `AccessibilityService` Android untuk merekam layar HP saat itu juga.
   - Berguna saat Tuan Faqih bertanya: *"Nexa, apa yang salah dengan error di layar saya?"*.
3. **Pembedahan Hirarki UI (`DUMP_UI_HIERARCHY`)**:
   - Membaca seluruh pohon elemen XML antarmuka yang sedang aktif (teks tombol, koordinat *bounding box*, status *clickable*, ID elemen).
   - Memungkinkan N.E.X.A memahami konteks aplikasi apa yang sedang dibuka oleh Tuan Faqih.

---

### 11.4 Tangan & Eksekutor Aksesibilitas (*Hands of NEXA*)

Melalui `NexaAccessibilityService`, N.E.X.A dapat mengoperasikan aplikasi Android secara otonom:

1. **Gestur Sentuhan (`ACCESSIBILITY_CLICK`)**:
   - Mendukung klik berbasis koordinat piksel mutlak `(x, y)` maupun pencarian berbasis teks / ID elemen (`target`).
2. **Pengetikan Formulir (`ACCESSIBILITY_INPUT_TEXT`)**:
   - Menginjeksi teks secara otomatis ke dalam kolom input atau formulir yang sedang fokus.
3. **Navigasi Gulir (`ACCESSIBILITY_SCROLL`)**:
   - Menggulir layar ke depan (`FORWARD`) atau ke belakang (`BACKWARD`).
4. **Sinkronisasi Clipboard (`GET_CLIPBOARD` / `SET_CLIPBOARD`)**:
   - Membaca dan menyalin teks ke papan klip HP secara instan.
5. **Perisai Keamanan Finansial (`MBankingShieldManager`)**:
   - Fitur perlindungan bawaan: Jika pengguna membuka aplikasi perbankan (BCA Mobile, Livin by Mandiri, BRImo, dll.), layanan aksesibilitas otomatis membekukan diri (*Safe Banking Mode*) untuk menjamin keamanan PIN dan kredensial finansial Tuan Faqih.

---

### 11.5 Indera Spasial & 100% Free Open-Source Spatial Stack

N.E.X.A 3.0 menanggalkan ketergantungan pada API berbayar seperti Google Maps Platform, Mapbox, atau Brave Search API yang memerlukan kartu kredit. Sebagai gantinya, N.E.X.A membangun **Open-Source Spatial Stack** yang 100% gratis, tanpa API Key, dan berkecepatan sub-detik:

```
[Permintaan Spasial: "pom bensin terdekat"]
                     │
                     ▼
       ┌───────────────────────────┐
       │ Multi-Stage Query Cleaner │ (Membersihkan kata tanya/filler: "adakah", "tolong", dll)
       └─────────────┬─────────────┘
                     │
                     ▼
       ┌───────────────────────────┐
       │   OSM Category Expander   │ (Memetakan ke entitas resmi: "SPBU Pertamina", "SPBU")
       └─────────────┬─────────────┘
                     │
                     ▼
       ┌───────────────────────────┐
       │  Resolusi GPS Dual-Fix    │ (<50ms Cached Fix + Parallel High Accuracy dari Bridge)
       └─────────────┬─────────────┘
                     │
       ┌─────────────┴────────────────────────┐
       ▼                                      ▼
┌──────────────────────────────┐ ┌──────────────────────────────┐
│ Tier 1: Nominatim Bounded    │ │ Tier 2: Photon Proximity     │
│ Viewbox Search (Radius <10km)│ │ Search + Hard Distance Filter│
└──────────────┬───────────────┘ └──────────────┬───────────────┘
               └──────────────┬─────────────────┘
                              │
                              ▼
               ┌──────────────────────────────┐
               │    OSRM Routing Engine       │ (Estimasi jarak & durasi rute motor/mobil)
               └──────────────────────────────┘
```

1. **Dual-Tier Android GPS Resolver (`LocationHandler.kt`)**:
   - **Tier 1 (Instant Cache <50ms)**: Mengambil `getLastKnownLocation` dari GPS Provider dan Network Provider secara instan.
   - **Tier 2 (Parallel Fresh Fix)**: Membuka *listener* `getCurrentLocation` dengan `PRIORITY_HIGH_ACCURACY` dan `PRIORITY_BALANCED_POWER_ACCURACY` secara paralel dengan *timeout* ketat 4 detik.
2. **Multi-Stage Query Sanitizer (`Location_Orchestrator.js`)**:
   - Menghapus seluruh kata basa-basi (*nexa, tolong, adakah, apakah, coba, carikan, dll.*) secara rekursif hingga menyisakan kata benda murni (*"pom bensin"*).
   - Memperluas sinonim percakapan Indonesia ke tag OSM resmi (`POI_SYNONYMS`: *pom bensin* → `SPBU Pertamina`, `SPBU`; *ngopi* → `warkop`, `cafe`; *minimarket* → `Indomaret`, `Alfamart`).
3. **Bounded Viewbox Engine (Nominatim & Photon)**:
   - Mengunci area pencarian dalam kotak pembatas geografis (*Viewbox Bounding Box* $\pm 0.09^{\circ} \approx 10\text{ km}$) di sekitar koordinat GPS pengguna (*Sinduadi, Sleman*).
   - **Hard Distance Filter**: Membuang semua POI di luar radius terdekat sehingga hasil yang disajikan murni berada dalam jangkauan 1–3 km di sekitar posisi pengguna.

---

### 11.6 Interaksi Suara Real-Time & Panggilan Multimodal (*Live Voice Engine*)

N.E.X.A 3.0 berevolusi dari sekadar panggilan berbasis *Text-to-Speech* menjadi **Real-Time Multimodal Full-Duplex Voice Engine** yang memanfaatkan **Google Gemini Multimodal Live API (`BidiGenerateContent`)** berlatensi sub-detik (**TTFA <600ms**):

```mermaid
sequenceDiagram
    autonumber
    actor Tuan as 🗣️ Tuan Faqih (Mic HP)
    participant Bridge as 📱 Nexa Bridge (VoiceStreamHandler)
    participant Relay as 🌐 Cloudflare Worker Relay (nexa-relay)
    participant Server as ☁️ N.E.X.A Core (Live_Voice_Engine)
    participant Google as 🧠 Google Gemini Live API
    participant Tools as 🛠️ Live Tool Registry & DB

    Note over Tuan,Tools: FASE 1: HANDSHAKE & SETUP WSS
    Server->>Relay: WSS Handshake via wss://nexa-relay.../ws/...
    Relay->>Google: BidiGenerateContent (Gemini 3.1 Flash Live Preview)
    Google-->>Server: setupComplete: {}
    Server-->>Bridge: CALL_LIVE_READY (Session Handshake Confirmed)

    Note over Tuan,Tools: FASE 2: PERCAKAPAN AUDIO DUA ARAH (TURN-AWARE DUPLEX)
    Tuan->>Bridge: "Catat pengeluaran 20 ribu beli bensin pakai Cash"
    Bridge->>Server: CALL_AUDIO_STREAM (16kHz PCM Base64)
    Server->>Google: realtimeInput.audio { mimeType: "audio/pcm;rate=16000", data }
    
    Note over Google,Tools: FASE 3: EKSEKUSI INTENT ROUTER NYATA (TOOL CALLING)
    Google-->>Server: toolCall: recordExpense(amount: 20000, desc: "bensin", method: "Cash")
    Server->>Tools: writeTransaction() -> Simpan ke Database Supabase (1ms)
    Tools-->>Server: { status: "SUCCESS", transaction_id: "trx_99182" }
    Server-->>Google: toolResponse: { status: "SUCCESS", message: "Tersimpan" }
    
    Note over Google,Tuan: FASE 4: STREAMING SUARA VOKAL FENRIR
    Google-->>Server: modelTurn.parts[].inlineData (24kHz PCM Base64)
    Server-->>Bridge: CALL_AUDIO_PLAY (24kHz PCM Base64)
    Bridge->>Tuan: 🔊 Loudspeaker / Earpiece Suara Fenrir Bersuara Lancar
```

#### 🛡️ Terobosan Akustik & Manajemen Status (*Turn-Aware Duplex Architecture*):
1. **Cloudflare Worker Relay WebSocket Routing (`nexa-relay`)**:
   - Merutekan sesi WebSocket Google Gemini Live API melalui jaringan tepi Cloudflare untuk membebaskan server dari restriksi IP datacenter cloud (`Code 1007 Location Block`).
2. **Turn-Aware Duplex Gating**:
   - **Saat Asisten Berbicara (Downlink Priority):** Jalur mikrofon dijeda sementara (*gated*), sehingga suara dari speaker utama tidak memantul masuk ke mic dan tidak memicu *False Barge-In* di server Google.
   - **Saat Giliran Pengguna Berbicara (Listening Mode):** Mikrofon seketika terbuka 100% sensitif (Threshold = 0 RMS) untuk menangkap setiap kata dan bisikan pengguna.
3. **Hardware DSP AudioSession Pairing**:
   - `AudioRecord` dan `AudioTrack` dikunci pada satu `hardwareSessionId` yang sama, memungkinkan chip DSP Samsung Exynos (`AcousticEchoCanceler` & `NoiseSuppressor`) melakukan peredaman gema aktif di level prosesor audio.
4. **Mekanisme Panggilan Mirip WhatsApp (*WhatsApp-Style Fullscreen Overlay & Zero-Footprint Task*)**:
   - **Bangun Otomatis Saat Terkunci:** Menggunakan `PowerManager.SCREEN_BRIGHT_WAKE_LOCK`, `setShowWhenLocked(true)`, `setTurnScreenOn(true)`, dan `requestDismissKeyguard()`, layar HP seketika menyala terang dan menampilkan panggilan di atas layar kunci tanpa perlu membuka PIN/sidik jari.
   - **Zero-Footprint Task Return:** `FakeCallActivity` diisolasi ke task stack tersendiri (`taskAffinity="com.nexa.mobilebridge.call"` + `launchMode="singleInstance"`). Ketika panggilan dimatikan via `finishAndRemoveTask()`, layar seketika kembali ke aplikasi pengguna sebelumnya (Galeri, WhatsApp, Home Screen) tanpa pernah memunculkan dashboard Nexa Bridge.
5. **Desain UI Minimalis Ikonik (*Icon-Only Floating Buttons*)**:
   - Tombol Kiri: Ikon Speaker Tergaris Miring Merah (*Earpiece / Speaker Atas*) $\leftrightarrow$ Ikon Speaker Berpendar Cyan (*Loudspeaker / Speaker Utama*).
   - Tombol Kanan: Lingkaran Merah Elegan (*End Call Button*).

---

### 11.7 Telemetri Sensorik Kontinu & Kesadaran Kontekstual

Selain mengeksekusi perintah, Nexa Bridge bertindak sebagai sistem saraf otonom yang melaporkan kondisi lingkungan ke server:

| Tipe Laporan | Parameter yang Dikirim | Pemicu & Pemanfaatan di Server |
|---|---|---|
| **`TELEMETRY_REPORT`** | `battery_level`, `is_charging`, `network_type`, `wifi_ssid`, `signal_rssi` | Dikirim periodik tiap 5 menit untuk memantau daya baterai dan konektivitas HP Tuan. |
| **`CONTEXT_UPDATE`** | `USER_ARRIVED_HOME`, `USER_LEFT_HOME` | Pemicu Geofence: Menyalakan/mematikan rutinitas rumah tangga otomatis. |
| **`CONTEXT_UPDATE`** | `PHONE_PICKUP_MORNING`, `ALARM_DISMISSED` | Pemicu Pagi: N.E.X.A mendeteksi Tuan telah bangun dan mengirimkan *Morning Briefing*. |
| **`CALL_EVENT`** | `CALL_ACCEPTED`, `CALL_REJECTED`, `CALL_AUDIO_REPLY` | Pemantauan interaksi panggilan dan eskalasi kedisiplinan (*Discipline GodMode*). |

---

### 11.8 Rangkuman Aksi Perangkat (*Hardware Actions Matrix*)

Seluruh kendali perangkat didefinisikan dalam konstanta `NexaActions` dan dieksekusi secara terpusat oleh `DeviceCommandDispatcher.kt` dan `Device_Control_Engine.js`:

| Aksi Perangkat | Parameter | Deskripsi & Dampak Nyata |
|---|---|---|
| `TOGGLE_FLASHLIGHT` | `enabled: boolean` | Menyalakan atau mematikan lampu senter HP. |
| `SET_VOLUME` | `stream: string`, `level: 0-100` | Mengatur volume suara (*MUSIC*, *RING*, *NOTIFICATION*). |
| `FORCE_DND` | `enabled: boolean` | Mengaktifkan mode Jangan Ganggu (*Do Not Disturb*). |
| `LOCK_SCREEN` | *(none)* | Mengunci layar HP secara instan. |
| `GET_LOCATION` | *(none)* | Mengambil koordinat GPS live presisi tinggi. |
| `SPEAK_TEXT` | `text: string` | Membicarakan kalimat bahasa Indonesia via TTS di speaker HP. |
| `TAKE_PHOTO` | `camera_facing: 'front'\|'back'` | Mengambil foto hening dari kamera depan/belakang. |
| `TAKE_SCREENSHOT` | *(none)* | Mengambil gambar layar HP aktif. |
| `LAUNCH_APP` | `package_name: string` | Membuka aplikasi Android tertentu secara langsung. |
| `SHOW_OVERLAY_MSG` | `title: string`, `message: string` | Memunculkan dialog pop-up di atas semua aplikasi. |
| `SIMULATE_INCOMING_CALL` | `caller_name`, `message` | Menjalankan panggilan masuk fullscreen interaktif. |
| `PLAY_RINGTONE` | *(none)* | Membunyikan nada dering alarm darurat pada volume maksimal. |

---

---

## BAB 12: ARSITEKTUR v3.1 — UNIFIED MASTER OAUTH 2.0 & COGNITIVE ERGONOMICS

Pembaruan v3.1 menandai lompatan evolusioner terbesar dalam efisiensi autentikasi eksternal dan kenyamanan interaksi manusia (*Human-Centric Cognitive Ergonomics*).

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    N.E.X.A CLOUD CORE (v3.1 AZURE VPS)                  │
├───────────────────────────────────┬─────────────────────────────────────┤
│   UNIFIED GOOGLE MASTER CLIENT    │   COGNITIVE ERGONOMIC INTERFACES    │
│  (16 Scopes • Singleton Factory)  │ (Probabilistic Bayesian Durations)  │
│                                   │                                     │
│  • Google Calendar v3             │  • Zero-Friction Event Creation     │
│  • Google Tasks v1 (5 Lists)      │  • Dynamic Tasklist Discovery       │
│  • Gmail v1 (3-Min Polling)       │  • Short-Term Working Memory Cache  │
│  • Google Drive & Docs v1-v3      │  • Ordinal Resolution (INDEX_1..N)  │
│  • Google Meet, Sheets, Photos    │  • WIB Date-Only UTC Preservation   │
└───────────────────────────────────┴─────────────────────────────────────┘
```

---

### 12.1 Transformasi Autentikasi: Dari Fragmentasi ke Master Client Tunggal

1. **Eliminasi 50 Baris RSA Private Key:** Arsitektur lama yang mengandalkan file kunci JSON Service Account Google Cloud dihentikan total, menghapus masalah kehabisan kuota Drive dan kerumitan konfigurasi lingkungan.
2. **Web Application Master Client GCP:** Seluruh 14 Google API kini diotentikasi di bawah satu Client ID & Secret (`nexa-core-495208`) dengan Master Refresh Token yang aman di server Azure VPS Jakarta.
3. **Zero-Downtime Token Interception:** `Google_Master_Client.js` secara transparan memperbarui akses token di latar belakang. Jika terjadi invalidasi token, *Circuit Breaker* mengirimkan satu notifikasi peringatan elegan ke Telegram tanpa merusak antrean cron job lainnya.

---

### 12.2 Human-Centric Ergonomics: Eksekusi Bebas Hambatan (*Zero Friction*)

1. **Bayesian Semantic Duration Matrix:**
   - Perkuliahan / SKS $\rightarrow$ **100 menit**
   - Bimbingan Skripsi $\rightarrow$ **45 menit**
   - Rapat / Diskusi Tim $\rightarrow$ **60 menit**
   - Warkop / Ngopi / Kuliner $\rightarrow$ **90 menit**
   - Quick Call / Zoom $\rightarrow$ **30 menit**
   - Olahraga / Gym $\rightarrow$ **75 menit**
2. **Dynamic Tasklist Discovery:** N.E.X.A secara cerdas mendeteksi dan mengarahkan tugas ke 5 Tasklist asli milik Tuan (`Tugas Saya`, `Tugas Kuliah`, `Pekerjaan`, `Riset & Baca`, `Belanja`) tanpa aturan regex manual yang kaku.
3. **Working Memory & Resolusi Ordinal:** N.E.X.A mengingat konteks layar terakhir, memungkinkan instruksi alami seperti *"Tandai tugas yang pertama selesai"* atau *"Hapus tugas kedua"* tanpa perlu menyebutkan judul tugas secara berulang.

---

### 12.3 Verifikasi & Kestabilan Produksi

Sistem v3.1 telah diuji secara otomatis melalui suite uji `tests/test_natural_calendar_tasks.js` dengan hasil **12/12 Lulus (100% Sukses)**:
- ✅ Akurasi Durasi Probabilistik Semantik (7/7 Kasus)
- ✅ Presisi Normalisasi Tanggal Anti Off-by-One Day (2/2 Kasus)
- ✅ Dynamic Tasklist Discovery Live Google Tasks (1/1 Kasus)
- ✅ Calendar READ & Working Memory Cache (1/1 Kasus)
- ✅ Tasks READ & Working Memory Cache (1/1 Kasus)

Beroperasi 24/7 di atas **Azure Virtual Machine** (`Standard_B2ats_v2`, Jakarta `indonesiacentral`) dengan monitoring PM2 Plus dan enkripsi SSL Caddy TLS 1.3.

---

## BAB 13: DILEMA KOGNITIF ENTERPRISE — PROMPT BLOAT, ATTENTION SALIENCE & ARSITEKTUR LEAN ROUTER

### 13.1 The Enterprise Frontier: Dilema Antara "Full Context Awareness" vs "Prompt Bloat"

Dalam evolusi menuju asisten AI otonom (*Chief of Staff*), sistem dihadapkan pada salah satu tantangan rekayasa kecerdasan buatan paling rumit di tingkat *frontier/enterprise*: **Trade-off antara Kesadaran Konteks Total (*Omnipresent Context*) dan Efisiensi Komputasi (*Inference & Token Efficiency*)**.

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                        DILEMA KOGNITIF: MEGA-PROMPT vs SLIM-ROUTER                     │
├───────────────────────────────────────────┬────────────────────────────────────────────┤
│ EKSTREM A: MEGA-PROMPT MONOLITIK          │ EKSTREM B: AGGRESSIVE FILTERING (SLIM)     │
├───────────────────────────────────────────┼────────────────────────────────────────────┤
│ • Injeksi SEMUA data (Kalender, Finansial,│ • Menyaring ketat data sebelum ke LLM      │
│   Profil, Identitas, Vault, Akun, Chat).  │ • Prompt sangat kecil (< 1.500 char)       │
│ • Ukuran Prompt: ~45.000 char (11K Token).│ • Respon instan (0.3s), hemat kuota        │
│ ⚠️ Resiko: Cognitive overload, instruction │ ⚠️ Resiko: "Kebutaan Konteks", gagal paham │
│   neglect, rate-limit 429, latensi tinggi.│   pesan implisit, hilang sentuhan proaktif.│
└───────────────────────────────────────────┴────────────────────────────────────────────┘
```

#### Anatomi Ketimpangan Payload Saat Ini:
Pada arsitektur `AI_Router.js`, setiap pesan singkat (misal: *"Beli es teh 5rb"* atau *"Pagi Nexa"* yang hanya berukuran ~15 karakter) direspons dengan menyusun prompt raksasa sebesar **~45.000 karakter (~11.000 token)**:
1. **Aturan Dasar & Persona (`NEXA_PERSONALITY`):** ~12.000 karakter.
2. **Spesifikasi Skema 15 Intent & 27 Aksi Device:** ~15.000 karakter.
3. **Katalog Kategori Keuangan Pemasukan & Pengeluaran (100+ entitas):** ~4.500 karakter.
4. **Daftar Akun Bank/Dompet & 3 Transaksi Terakhir:** ~1.500 karakter.
5. **Kalender Referensi 7 Hari & Agenda Mendatang:** ~1.200 karakter.
6. **Profil Pengguna, Core Identity, & 7-Layer Cognitive Model:** ~6.500 karakter.
7. **Riwayat Chat History (12–20 Pesan):** ~8.000 karakter.

Rasio efisiensi muatan pesan pengguna terhadap konteks yang disodorkan adalah **1 : 3.000**. Ini membebani *Tokens Per Minute* (TPM) pada penyedia inference cepat (Cerebras/Groq) dan menimbulkan fenomena *Lost in the Middle* (penurunan daya tangkap LLM terhadap instruksi di tengah teks panjang).

---

### 13.2 Paradigma "Asisten Manusiawi Sejati": Kesegaran Data vs Ketepatan Momen (*Salience*)

Merujuk pada wawasan fundamental dalam perancangan agen kognitif:

> *"Proaktif dan manusiawi tidak sama dengan melakukan fetch dan dump semua data di setiap pesan. Asisten pribadi manusia yang andal tidak menghitung ulang saldo rekening dan mengecek seluruh agenda setiap kali Anda menyapa 'Pagi'. Yang membuatnya terasa 'selalu ingat' adalah ia sudah memiliki **Working Mental Model** di kepalanya, dan ia baru menyuarakan informasi tersebut ketika momennya memang **Salient (Relevan dan Penting)**."*

Rasa proaktif dan kecerdasan manusiawi bersumber dari dua pilar yang terpisah:
1. **Kesegaran Informasi (*Data Freshness*):**
   Dicapai melalui sinkronisasi latar belakang (*asynchronous background sync*) dan *short-term RAM cache*, bukan dengan query langsung ke database di setiap putaran obrolan.
2. **Ketepatan Momen (*Salience Logic*):**
   Kemampuan kognitif untuk menentukan **kapan suatu data layak dimunculkan ke ruang kesadaran**, bukan menumpahkan seluruh isi memori ke dalam satu prompt.

---

### 13.3 Analisis Kritis: 5 Titik Rawan (*Failure Modes*) & Mitigasi

Penyederhanaan atau penyaringan prompt yang tidak dirancang dengan hati-hati dapat memicu titik kegagalan (*vulnerabilities*) baru:

```
               ┌────────────────────────────────────────────────────────────┐
               │         5 TITIK RAWAN ARSITEKTUR KOGNITIF & MITIGASINYA    │
               └─────────────────────────────┬──────────────────────────────┘
                                             │
      ┌──────────────────┬───────────────────┼──────────────────┬──────────────────┐
      ▼                  ▼                   ▼                  ▼                  ▼
[Kebutaan Konteks]  [State Drift]       [Race Condition]   [Kehilangan     [Overhead & Bug
 (False Negative)    (Memori Basi)       (Async Amnesia)   Proaktivitas]   Maintenance]
   Pesan implisit     Data Web/HP beda    Pesan beruntun    Tidak ada korelasi  State sync
   kehilangan tool.   dgn cache RAM.      baca state lama.  lintas-domain.      makin rumit.
```

1. **Kebutaan Konteks pada Pesan Implisit (*False Negative Gating*):**
   - *Masalah:* Jika filter kata kunci/heuristik menyaring konteks sebelum ke LLM, pesan multitafsir seperti *"Tolong pisahin yang kemarin beli di minimarket buat jajan sama kosan"* akan kehilangan daftar kategori keuangan karena tidak menyebut angka.
   - *Mitigasi:* Menggunakan **Micro-Summary Injection** (menyuntikkan ringkasan 1 baris tentang saldo dan agenda aktif, bukan membuang konteks sama sekali) serta fallback **Native Tool Calling**.
2. **Kerentanan Memori Basi (*Working Memory Drift*):**
   - *Masalah:* Snapshot status di RAM bisa tertinggal jika data diubah dari luar (misal input via Next.js Web Dashboard atau Google Calendar langsung).
   - *Mitigasi:* Event-driven cache invalidation dan TTL pendek (3–5 menit) untuk data dinamis.
3. **Race Condition pada Pembelajaran Asinkron (*Async Amnesia*):**
   - *Masalah:* Jika ekstraksi preferensi baru dilakukan secara asinkron di background, pesan susulan yang dikirim 2 detik kemudian bisa dieksekusi dengan memori lama.
   - *Mitigasi:* **Write-Through In-Memory Cache**: preferensi yang terdeteksi langsung memperbarui state RAM secara instan sebelum commit database selesai.
4. **Kehilangan Serendipitas Proaktif Lintas Domain:**
   - *Masalah:* Pemisahan domain yang terlalu kaku membuat AI kehilangan celetukan cerdas (misal: mengaitkan rasa lapar Tuan dengan sisa budget harian dan jadwal kuliah 30 menit lagi).
   - *Mitigasi:* Mempertahankan *Global Situational Awareness Context* (~50 token) yang merangkum kesehatan finansial dan waktu secara konstan.
5. **Kerapuhan Tumpukan Regex (*Brittle Heuristics Anti-Pattern*):**
   - *Masalah:* Menumpuk ratusan baris kamus kata kasar, sinonim, dan stemmer bahasa Indonesia membuat sistem mudah patah oleh typo atau bahasa gaul baru.
   - *Mitigasi:* Beralih penuh ke **Semantic Vector Embeddings (Cosine Similarity)** dan **Native Function Calling LLM**.

---

### 13.4 Blueprint Arsitektur v3.2: *The Lean Cognitive Router*

Berdasarkan *Agentic Design Patterns* (Google Cloud / Springer) dan evaluasi di atas, N.E.X.A v3.2 mengadopsi arsitektur Router modular:

```
[ Pesan Masuk Tuan Faqih ]
            │
            ▼
┌─────────────────────────────────────────────────────────────┐
│  1. COMPACT SITUATIONAL STATE (Working Memory di RAM ~0ms)  │
│  Snapshot ringkas kesadaran situasi (~50 token):            │
│  - Jam/Hari: Selasa, 14:30 WIB                              │
│  - Status: Di Kampus / Mode Fokus                           │
│  - Situasi: Baru mencatat makan siang, agenda 16:00 Kuliah  │
│  - Pending: (Transaksi/Jadwal tertunda jika ada)            │
└──────────────────────────────┬──────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────┐
│  2. NATIVE FUNCTION CALLING & SEMANTIC TOOL BINDING         │
│  Model secara native memilih alat yang dibutuhkan:          │
│  • record_transaction()                                     │
│  • schedule_calendar_event()                                │
│  • manage_task()                                            │
│  • control_mobile_device()                                  │
│  (Mengeliminasi Mega-JSON Schema di system prompt!)         │
└──────────────────────────────┬──────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────┐
│  3. SINGLE-TURN UNIFIED EXECUTION (~4.000 char prompt)      │
│  • Model: Cerebras Gemma 31B / Gemini 3.7 Flash             │
│  • Latensi: 0.3s – 0.6s (Super Cepat, Bebas Rate-Limit)     │
│  • Menghasilkan: Tindakan Presisi + Balasan Bahasa Alami    │
└──────────────────────────────┬──────────────────────────────┘
                               │
                               ▼ (Asinkron di Latar Belakang)
┌─────────────────────────────────────────────────────────────┐
│  4. ASYNC PASSIVE LEARNING WORKER                           │
│  Ekstraksi fakta baru & konsolidasi memori dieksekusi       │
│  di latar belakang tanpa menahan jalur pesan utama.         │
└─────────────────────────────────────────────────────────────┘
```

---

### 13.5 Matriks Evaluasi & Target Performa

| Parameter Teknis | Arsitektur v3.1 (Lama) | Arsitektur v3.2 (Lean Cognitive) |
|---|---|---|
| **Ukuran Prompt Rata-rata** | ~45.000 karakter | **~4.000 – 6.500 karakter** (📉 -85%) |
| **Konsumsi Token per Pesan** | ~11.000 token | **~1.000 – 1.500 token** (📉 -88%) |
| **Latensi Respons (Round-Trip)** | 2.5 – 4.2 detik | **⚡ 0.4 – 0.8 detik** |
| **Resiko Rate-Limit (Groq/Cerebras)**| Tinggi (mendekati 12K TPM) | **🛡️ Nol (Sangat Aman)** |
| **Ketahanan terhadap Typo/Slang** | Rendah (Ketergantungan Regex) | **🎯 Tinggi (Native Semantic & Embeddings)** |
| **Kepribadian & Proaktivitas** | Sering kaku terbebani data | **❤️ Alami, fokus, dan relevan** |

---

Dengan formalisasi **Bab 13** ini ke dalam Whitepaper, N.E.X.A mengukuhkan komitmen desainnya: menjadi asisten cerdas yang tidak hanya tangguh dalam otomasi fisik dan finansial, tetapi juga memiliki arsitektur kognitif yang ramping, elegan, dan setara dengan standar riset AI enterprise global.

---

---
**~ TAMAT ~**
*Mahakarya arsitektur The Chief of Staff, secara eksklusif dikembangkan untuk memperluas kognisi dan otonomi penggunanya, Tuan Faqih Hidayatulloh.*

