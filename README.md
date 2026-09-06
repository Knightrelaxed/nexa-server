# N.E.X.A: Neural Executive with Xenial Agent
> Chief of Staff AI: Immortality Protocol v3.1

**N.E.X.A (Neural Executive with Xenial Agent)** adalah sistem kecerdasan buatan otonom bergaya "J.A.R.V.I.S" yang dirancang khusus untuk bertindak sebagai *Chief of Staff* digital personal bagi Tuan Faqih. Berbeda dengan chatbot konvensional yang bersifat pasif, N.E.X.A beroperasi secara proaktif (*set-and-forget*), mengorkestrasi tata kelola keuangan, agenda akademik dan diplomasi, integrasi ekosistem Google Workspace, manajemen memori jangka panjang, hingga penegakan kedisiplinan digital secara fisik.

---

## 🏗️ Arsitektur Sistem Utama

Arsitektur N.E.X.A terbagi menjadi dua entitas utama yang saling terhubung secara *real-time*:

1. **N.E.X.A Core Server (Backend & Cognitive Brain)**
   - **Direktori:** Root repository ini (`/src`)
   - **Runtime:** Node.js 20 LTS, Express.js, WebSocket Engine, PM2 Process Manager
   - **Infrastruktur Produksi:** Ubuntu Linux VPS (Azure Jakarta & Oracle Cloud OCI)
   - **Peran:** Otak pusat otonom, pemroses bahasa natural, eksekutor domain, orkestrator Google Master OAuth 2.0, dan jembatan API multi-provider (Telegram, Supabase PostgreSQL, Gemini, Groq, Cerebras, Notion).

2. **Nexa Finance Web (Frontend GUI Dashboard)**
   - **Direktori:** `/nexa-finance-web`
   - **Framework:** Next.js (App Router), React, Tailwind CSS
   - **Peran:** Antarmuka visual analitik keuangan untuk memantau arus kas, distribusi pos pengeluaran, dan audit histori transaksi secara *real-time*.

---

## 🧠 Subsistem N.E.X.A Core Engine

Backend N.E.X.A digerakkan oleh subsistem modular terintegrasi:

### 1. Smart Intention Reconciler & AI Router
- **Multi-Account AI Backbone:** Memanfaatkan Google Gemini 2.5 Flash, Groq Llama 3.3 70B, Cerebras Llama 3.1 8B, Puter AI, Mistral, dan OpenRouter dengan mekanisme *zero-downtime automatic failover*.
- **11 Domain Intents:** Mengklasifikasikan dan mengeksekusi niat pengguna secara presisi:
  - `FINANCE`: Pencatatan mutasi, ralat pengeluaran natural, dan deteksi duplikasi.
  - `DISCIPLINE`: Pemantauan waktu layar (*screen time*) dan penegakan fokus aplikasi.
  - `CALENDAR`: Penjadwalan rapat, sinkronisasi Google Calendar, dan *proximity alerts*.
  - `TASK`: Manajemen tugas terintegrasi Google Tasks dan Notion DB.
  - `WEB_SEARCH`: Penelusuran web real-time (Serper.dev, Tavily AI, Brave Place API).
  - `USER_PROFILE`: Manajemen fakta dinamis dan personalisasi pengguna.
  - `CORE_IDENTITY`: Penegakan aturan dasar dan prinsip operasional N.E.X.A.
  - `EMAIL`: Audit kotak masuk Gmail, pembuatan draf, dan pengiriman email otomatis.
  - `DATABASE`: Kueri analitik dan pelaporan data via Supabase PostgreSQL.
  - `EDIT`: Ralat entri transaksi atau agenda masa lalu secara natural.
  - `DIAGNOSE_SYSTEM`: Pemeriksaan kesehatan server, memori heap, latensi, dan konektivitas API.

### 2. Chrono-Episodic Memory & Daily Consolidation (23:59 WIB)
- **Episodic Narrative Engine:** Setiap hari pukul 23:59 WIB, N.E.X.A menganalisis transkrip percakapan harian, mereduksinya menjadi narasi reflektif, dan memperbarui memori jangka panjang tanpa duplikasi.
- **Dynamic Word Resonance & Vector Cache:** Snapshot vektor lokal (`data/facts_vectors.json`) mengeliminasi *cold-start latency* database, memangkas konsumsi token hingga 75% sampai 85% per prompt injection.
- **7-Layer Cognitive Model:** Struktur hierarkis yang membagi pengetahuan diri dan profil pengguna secara terisolasi dan akurat.

### 3. Cognitive Sunday Pass (Weekly Identity Inference)
- Setiap hari Minggu pukul 23:59 WIB, N.E.X.A menjalankan siklus refleksi mingguan untuk menyimpulkan hipotesis baru terkait preferensi, pola kebiasaan, dan gaya komunikasi pengguna sebelum disahkan ke memori inti permanen.

### 4. Live Voice Engine (Full-Duplex Streaming)
- Dukungan interaksi suara dua arah secara langsung via WebSocket audio streaming, transkripsi multi-tier (Groq Whisper, Gemini Audio), dan sintesis suara alami berlatensi rendah.

### 5. Multi-Tier Vision Engine (11-Tier Failover)
- Kemampuan membaca dan mengekstrak dokumen, struk transaksi, bagan, dan foto visual dengan rantai failover cerdas hingga 11 lapisan provider (Gemini 2.5, Gemini 2.0, Groq Llama Vision, Qwen2-VL, HuggingFace).

### 6. Unified Google Master OAuth 2.0 & Workspace Matrix
- Integrasi satu pintu (*Single Master Refresh Token*) untuk seluruh ekosistem Google Workspace: Gmail, Google Calendar, Google Tasks, Google Drive, Google Docs (2nd Brain Ideation Master Doc), dan Google Sheets.

### 7. Proactive Chrono-Pulse Engine
N.E.X.A aktif memberikan pembaruan rutin terjadwal:
- **05:30 WIB:** *Morning Briefing* (Cuaca, agenda harian, dan prioritas tugas)
- **12:00 WIB:** *Midday Pulse* (Evaluasi paruh hari dan progres tugas)
- **17:00 WIB:** *Evening Debrief* (Rekapitulasi pencapaian harian)
- **21:00 WIB:** *Tomorrow Prep* (Penyusunan jadwal dan persiapan esok)
- **Proximity Alert:** Notifikasi 30 menit sebelum jadwal kalender dimulai.

### 8. God Mode & Physical Discipline Enforcement
- Terhubung dengan aplikasi Android **N.E.X.A Mobile Bridge**.
- Menerapkan tindakan penegakan fokus fisik bertingkat saat pengguna melebihi kuota aplikasi rekreasional (Peringatan Suara TTS, Lempar ke Home Screen, Layar Monokrom Grayscale, hingga Kunci Layar).

---

## 🛡️ Immortality Protocol v3.1

Untuk menjamin ketersediaan layanan 24/7 tanpa henti:
1. **Multi-Tier Heartbeat & Uptime Monitoring:** Endpoint `GET /health` dipantau secara berkala untuk mendeteksi anomali memori heap atau kegagalan event loop.
2. **Mobile Bridge Offline Resiliency Buffer:** Perangkat mobile menyimpan transaksi dan telemetri secara lokal saat konektivitas jaringan terputus, dan otomatis mem-push data ke server ketika koneksi kembali normal.
3. **Automated Vector Snapshot Refresh:** Memori semantik disinkronkan secara konsisten ke penyimpanan memori lokal untuk performa respon sub-detik.

---
*Dikelola dengan dedikasi penuh oleh N.E.X.A untuk Tuan Faqih.*
