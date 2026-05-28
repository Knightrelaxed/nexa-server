# Arsitektur & Sistem Kode N.E.X.A
*(Neural Extension Assistant for Intelligence)*

## 1. Executive Summary
**N.E.X.A** adalah asisten kecerdasan buatan berbasis *Cloud-Native* yang dirancang sebagai *Chief of Staff* digital otonom. Sistem ini mengintegrasikan pemrosesan bahasa alami, pengenalan suara, visi komputer, dan otomatisasi produktivitas (Spreadsheet, Calendar, Tasks, Gmail) serta intervensi OS Android untuk membentuk sebuah asisten pribadi yang responsif dan proaktif. Sistem berjalan tanpa henti di latar belakang, bertindak sebagai pengawas kedisiplinan, pengelola finansial, dan pengatur jadwal harian.

## 2. Tech Stack & Ekosistem
- **Core Server:** Node.js 20, Express 5 (Di-deploy pada Hugging Face Docker Spaces)
- **Database:** Supabase (PostgreSQL)
- **Cognitive Engines:** Gemini 2.0 Flash / 2.5 Flash (Primary AI Router & Vision), Groq Whisper Large v3 (Voice Transcription)
- **Integrations:** Google Workspace (Sheets, Calendar, Gmail, Tasks) via Service Account
- **Sensory & Actuation (Android):** Tasker, AutoRemote/Telegram Intercept
- **External APIs:** WeatherAPI, NewsData.io, OpenRouter (Llama 3.1 Fallback AI)

## 3. Struktur Direktori & Komponen Kode (Codebase Architecture)
Aplikasi ini diimplementasikan menggunakan pendekatan *Domain-Driven Design* (DDD) yang direpresentasikan dalam struktur direktori `src/`.

### 3.1. `src/interfaces/` (Entry Points)
Lapisan antarmuka yang menerima input dari luar.
- **`webhook.js`**: Endpoint utama (`/webhook/telegram`, `/webhook/tasker`). Menerima chat Telegram dari pengguna, intervensi notifikasi dari Tasker (keuangan), serta pemicu peringatan pelanggaran disiplin.
- **`cron.js`**: Menjalankan *background tasks* berbasis waktu. Memanggil fungsi *Morning Briefing* atau *polling* otomatis Gmail untuk data keuangan terbaru.

### 3.2. `src/core/` (Cognitive & Routing)
Otak AI yang memproses input mentah (suara, gambar, teks kasual) menjadi *intent* yang terstruktur.
- **`AI_Router.js`**: Pusat syaraf utama yang menggunakan Gemini 2.5 Flash. Menerima instruksi pengguna dan menentukan *intent* (misalnya: `FINANCE_TRACK`, `CALENDAR_ADD`, `TASK_CREATE`).
- **`Voice_Engine.js`**: Menggunakan Groq Whisper API untuk mentranskripsi *Voice Note* (audio) dari Telegram menjadi teks dengan sangat cepat.
- **`Vision_Engine.js`**: Menggunakan kemampuan *vision* dari Gemini untuk mengekstrak data nominal dan nama *merchant* dari foto struk belanja fisik.
- **`Fallback_Engine.js`**: Menjamin ketersediaan sistem (*High Availability*) dengan mengalihkan *routing* logika ke model *open-source* (Llama 3.1 via OpenRouter) jika API utama mengalami limitasi.

### 3.3. `src/domain/` (Business Logic)
Lapisan logika bisnis yang menangani aturan sistem untuk masing-masing fungsi.
- **`Finance_Engine.js`**: Jantung dari pengelola keuangan omnichannel. Berisi logika *Deduplication Engine* yang mengekstrak nominal dan merchant, lalu mencegah pencatatan ganda melalui *Composite Key* sebelum diteruskan ke *Spreadsheet*.
- **`Agenda_Manager.js`**: Logika pengelolaan jadwal yang memproses pembuatan, modifikasi, dan penghapusan *event* secara dinamis.
- **`Task_Manager.js`**: Integrasi dengan manajemen *to-do list* dan penugasan langsung.
- **`Discipline_GodMode.js`**: Logika hukuman dan peringatan (*Screen-time Enforcer*). Menentukan kapan harus menegur pengguna via teks atau kapan menembak balik *webhook* ke Tasker untuk mengunci perangkat.
- **`Intelligence_Brief.js`**: Merangkai ringkasan laporan pagi hari (*Morning Briefing*), menggabungkan jadwal hari itu, cuaca, dan ekstraksi berita geopolitik.

### 3.4. `src/infrastructure/` (External Integrations)
Penghubung sistem N.E.X.A ke platform pihak ketiga.
- **`Google_Workspace.js`**: Kelas utama untuk mengatur kredensial dan manipulasi Google Calendar & Google Sheets.
- **`Google_Tasks.js`**: Infrastruktur untuk komunikasi dengan Google Tasks API.
- **`Gmail_Client.js`**: Infrastruktur *polling* untuk membaca *body* surel mutasi perbankan.
- **`Supabase_Memories.js`**: Bertanggung jawab atas persistensi data. Melakukan operasi baca-tulis *history chat* pengguna (Contextual Memory) dan menyimpan konfigurasi *state* deduplikasi keuangan.
- **`Web_Search.js`**: Integrasi *scraping* berita atau mesin pencari secara *headless*.

## 4. Aliran Data & Logika (The Universal State Machine)
Setiap interaksi pada sistem (contohnya pengguna mengirim *Voice Note* untuk menggeser jadwal) berjalan dalam *pipeline* asinkron berikut:

1. **Trigger (Sensory):** Audio masuk ke `/webhook/telegram` di `interfaces/webhook.js`.
2. **Pre-processing (Core):** Audio diteruskan ke `Voice_Engine.js` (Groq Whisper) dan diubah menjadi teks.
3. **Contextualization (Infrastructure):** N.E.X.A menarik 10 *chat* terakhir dari `Supabase_Memories.js`.
4. **Routing (Core):** Teks + Konteks dimasukkan ke `AI_Router.js` (Gemini). AI membalas dalam bentuk JSON. Contoh: `{"intent": "CALENDAR_UPDATE", "target": "15:00", "task": "Diskusi Akademik"}`.
5. **Execution (Domain & Infrastructure):** `Agenda_Manager.js` menerima JSON tersebut dan menjalankan fungsi *API request* spesifik pada `Google_Workspace.js` (Calendar).
6. **Actuation:** Server membalas Tuan pengguna melalui Telegram dengan pesan konfirmasi verbal.

## 5. Fitur Unik Tingkat Kode
- **Dual-Channel Finance Deduplication:** `Finance_Engine.js` menerima data dari 2 kanal: *Push* instan dari Livin' (melalui Tasker -> `webhook.js`) dan *Pull* berkala dari Email (melalui `cron.js` -> `Gmail_Client.js`). Kode ini membangun *hash* waktu ±15 menit dan membandingkannya secara *real-time* dengan memori di Supabase untuk meniadakan entri ganda di Google Sheets.
- **God-Mode Actuation:** `Discipline_GodMode.js` memfasilitasi panggilan HTTP kembali (*call back*) ke IP publik Tuan atau melalui Telegram Intercept untuk memerintahkan Tasker menjalankan aksi penalti (mematikan WiFi, mengunci layar).
- **Graceful Fallbacks:** Diimplementasikan melalui blok `try-catch` terpusat. Jika panggilan utama Google API gagal (*500 Server Error*) atau kuota Gemini habis, `Fallback_Engine.js` akan mengambil alih secara senyap, mengamankan antrean tugas di Supabase, dan mengubah *bot* ke *Dumb Mode* sementara (transaksi masuk di-*buffer*).

---
*Dokumen ini merupakan panduan arsitektur kode komprehensif. Diharapkan agar struktur `src/` dipertahankan terpisah sesuai fungsi untuk menghindari monolithic spaghettification.*
