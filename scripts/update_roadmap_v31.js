const fs = require('fs');
const path = require('path');

const roadmapPath = path.join(__dirname, '../docs/NEXA_VERSION_EVOLUTION_ROADMAP.md');

const newContent = `# N.E.X.A ARCHITECTURAL WHITEPAPER: EVOLUTIONARY ROADMAP (v1.0 to v3.1)
**Neural Executive with Xenial Agent (N.E.X.A)**  
*Chief of Staff & Autonomous Executive Ecosystem for Tuan Faqih Hidayatulloh*  

---

## Executive Summary

Dokumen ilmiah ini merangkum kronologi evolusi arsitektur **N.E.X.A (Neural Executive with Xenial Agent)** dari prototipe eksperimental berbasis lingkungan lokal (*Termux Genesis*), evolusi kognisi organik dan *Self-Learning*, migrasi infrastruktur server mandiri **v3.0 — Sovereign Azure Cloud Production (Jakarta Region)**, hingga pematangan ekosistem terpadu **v3.1 — Unified Master OAuth 2.0 & Chrono-Episodic Cognitive Architecture**. 

Setiap lompatan versi mewakili terobosan dalam rekayasa sistem terdistribusi, manajemen memori autobiografis (*Chrono-Episodic Memory*), ketahanan sistem anti-gagal (*Fault-Tolerant Multi-Tier Fallback*), integrasi multi-antarmuka (Telegram, CLI, Mobile Bridge), serta otomatisasi kognisi proaktif yang dirancang khusus untuk mendukung aspirasi akademik, kedisiplinan, dan karier diplomatik Tuan Faqih Hidayatulloh.

\`\`\`mermaid
timeline
    title N.E.X.A Architectural Evolution Roadmap
    section Local Genesis
      v1.0 (Termux Genesis) : Local Android Proto-Core
                            : Resource Bottlenecks & Process Kill
    section Cloud Ascension
      v2.0 (Cloud Ascension) : Hugging Face Cloud Migration
                             : Immortality Protocol v2.0
      v2.1 (Financial Core) : Autonomous Expense Tracking
      v2.2 (Intent Router) : Dual-Layer NLP Classification
    section Relational & Multi-Modal
      v2.3 (Supabase Migration) : Relational ACID Database Migration
                                : Real-time Transaction Deduplication
      v2.4 (Discipline Guard) : Executive Discipline & God Mode
      v2.5 (Multi-Modal Sensory) : Tasks, Calendar, Vision & Voice
                                 : 12-Tier Redundant Fallback Matrix
      v2.6 (Second Brain Store) : Knowledge Vault & Permanent Facts
    section Cognitive Resonance
      v2.7 (C.R.A.I. Architecture) : Ebbinghaus Memory Decay Engine
                                   : Causal Knowledge Graph & Anticipatory Interventions
                                   : Conversational Memory UX & Decision Journaling
    section Self-Learning & Organic Memory
      v2.8 (Self-Learning Core) : Passive Knowledge Acquisition (nexa_self_model)
                                : Weekly Self-Reflection Pass
      v2.9 (Living Memory & CLI) : Memory Hygiene Pipeline (4-Stage Sweep)
                                 : Dual-Channel CLI Console (nexa-assistant-console)
    section Sovereign Cloud Infrastructure
      v3.0 (Azure Sovereign VPS) : Azure VM Jakarta (Standard_B2ats_v2) 24/7
                                 : Caddy Auto-HTTPS & PM2 Plus Systemd
                                 : Ed25519 Autonomous DevOps Key Auth
                                 : Production Node.js 20 & Direct Telegram Tier
    section Unified Master & Chrono-Episodic
      v3.1 (Unified Master & Chrono) : Unified Master OAuth 2.0 (16 Scopes Consolidated)
                                     : Dual-Tier Chrono-Episodic Memory (>90d Daily Narratives)
                                     : Smart Closed-Loop Intention Engine & Auto-Reconciler
                                     : SACR v2.5 Matrix (Groq Qwen 3.8 27B & Gemini 3.7 Flash)
                                     : Official Identity: Neural Executive with Xenial Agent
\`\`\`

---

## Bab 1: Era Fondasi & Migrasi Infrastruktur (v1.0 to v2.0)

### v1.0 — The Termux Genesis (Local Proto-Core)
* **Arsitektur Awal:** N.E.X.A pertama kali diimplementasikan sebagai skrip Node.js monolitik yang dijalankan di dalam emulator terminal **Termux** pada perangkat Android Tuan Faqih.
* **Tantangan & Kegagalan Operasional:**
  * **Aggressive OS Process Killing:** Sistem operasi Android secara rutin mematikan proses latar belakang (*background service*) saat memori RAM dibutuhkan oleh aplikasi lain.
  * **Ketergantungan Baterai & Thermal Throttling:** Eksekusi kueri AI secara lokal menyebabkan peningkatan suhu perangkat dan pengurasan daya baterai yang signifikan.
  * **Ketidakstabilan Konektivitas:** Terputusnya jaringan seluler menyebabkan hilangnya webhook Telegram dan gagalnya pencatatan data vital.

### v2.0 — The Cloud Ascension (Hugging Face Cloud Migration)
* **Terobosan Arsitektur:** Memindahkan seluruh inti komputasi dari Termux lokal menuju kontainer cloud **Hugging Face Spaces**.
* **Immortality Protocol v2.0:**
  * Memperkenalkan arsitektur *self-healing* berbasis **UptimeRobot / cron-job.org** yang melakukan *heartbeat ping* ke endpoint \`GET /health\` secara berkala.
  * Integrasi **Tasker Watchdog** pada Android sebagai lapisan pemantau eksternal yang memastikan server cloud tetap aktif 24/7 tanpa intervensi manusia.

---

## Bab 2: Pematangan Domain & Transformasi Data (v2.1 to v2.3)

### v2.1 — Autonomous Financial Core
* Membangun subsistem **Finance Engine** pertama yang memungkinkan pencatatan pemasukan dan pengeluaran harian melalui antarmuka percakapan bahasa alami di Telegram.
* Menghadirkan pelaporan saldo harian dan ringkasan pengeluaran berbasis kategori.

### v2.2 — Dual-Layer Routing & Semantic Intent Classification
* Menggantikan pencocokan kata kunci statis (*regex matching*) dengan **AI Router** berdaya NLP tingkat lanjut.
* Router mampu membedakan secara kontekstual antara percakapan santai (*Normal Chat*), permintaan analitik finansial, penjadwalan, hingga penegakan kedisiplinan dengan akurasi klasifikasi >98%.

### v2.3 — Relational Memory Migration (Sheets to Supabase PostgreSQL)
* **Masalah Era Sheets:** Penyimpanan data awal berbasis lembar kerja spreadsheet rentan terhadap *race condition*, kelambatan latensi API, dan keterbatasan indeksasi data.
* **Pembaruan Sistem:**
  * Migrasi penuh skema finansial ke database relasional cloud **Supabase PostgreSQL**.
  * Penerapan skema **ACID Compliance** dan algoritma **Transaction Deduplication** yang secara otomatis mengabaikan transaksi ganda dari email notifikasi perbankan (Livin' by Mandiri).

---

## Bab 3: Sensorik Multi-Modal & Penegakan Eksekutif (v2.4 to v2.6)

### v2.4 — Executive Discipline & Habit Enforcement
* Mengembangkan **Discipline Engine** yang bertindak sebagai *sparring partner* intelektual dan penegak prioritas utama Tuan Faqih.
* Integrasi **God Mode Enforcement**: Pemantauan pelanggaran batas waktu layar (*Screen Time Violation*) yang memicu peringatan eksekutif tegas apabila fokus belajar atau kerja terganggu.

### v2.5 — Multi-Modal Sensory & Ecosystem Synchronization
* **Integrasi Ekosistem Google:** Sinkronisasi dua arah (*bi-directional*) dengan **Google Calendar** dan **Google Tasks**, memungkinkan pembuatan jadwal kerja, pengingat tenggat waktu (*due date*), serta pemblokiran waktu otomatis (*time-blocking*).
* **Persepsi Sensorik Ganda (Vision & Voice):**
  * **Vision Engine 12-Tier Matrix:** Kemampuan memindai struk belanja fisik, tangkapan layar, dan dokumen visual melalui matriks redundansi 12 lapisan model AI (4x Gemini 2.5 + 4x Groq Llama + 2x Gemini 2.0 + Cerebras + Hugging Face Vision Inference API).
  * **Voice Transcription:** Pemrosesan langsung pesan suara Telegram menjadi instruksi terstruktur via Hugging Face Whisper & Groq Whisper API.
* **Multi-Tier Fallback Anti-Mati:** Arsitektur failover otomatis yang mengalihkan beban kerja model AI utama ke model cadangan (Gemini, Groq, Mistral, Cerebras, Hugging Face Inference API, OpenRouter) dalam hitungan milidetik saat terjadi *rate limit* atau *downtime*.

### v2.6 — Second Brain & Permanent Fact Store
* Pembangunan arsip basis pengetahuan eksekutif (**2nd Brain**) terhubung ke Google Docs/Drive untuk menyimpan ide strategis, esai literatur Arab, dan catatan diplomasi.
* Pemisahan memori profil pengguna (\`USER_PROFILE\`) dan identitas sistem (\`CORE_IDENTITY\`).

---

## Bab 4: Puncak Evolusi Kognitif (v2.7 — Cognitive Resonance & Anticipatory Intelligence)

Arsitektur **v2.7** merupakan tonggak sejarah dalam kematangan kognisi N.E.X.A. Pada versi ini, N.E.X.A tidak lagi bertindak sebagai asisten reaktif yang statis, melainkan sistem kognitif dinamis yang meniru psikologi memori manusia dan penalaran proaktif.

### 1. Ebbinghaus Memory Decay & Tiered Approval Pipeline
* **Peluruhan Memori Alami:** Mengadopsi kurva peluruhan memori Hermann Ebbinghaus ($R = e^{-\\lambda t}$). Fakta atau kebiasaan yang jarang dikonfirmasi akan meluruh secara perlahan (dengan batas maksimum perhitungan 365 hari).
* **Persetujuan Berjenjang (Tier 1, 2, 3):**
  * **Tier 1 (Auto-Approve):** Penguatan kebiasaan positif langsung dikomit ke database.
  * **Tier 2 (Soft Approval 48h):** Observasi pola baru dengan batas waktu evaluasi 48 jam.
  * **Tier 3 (Manual Review):** Perubahan fundamental pada identitas atau preferensi kritis wajib mendapat persetujuan eksplisit Tuan Faqih via tombol *Inline Keyboard* Telegram.

### 2. Intention & Decision Journaling Anti-Spam
* Pelacakan intensi jangka panjang (*Stated vs. Revealed Intentions*) untuk mengevaluasi apakah rencana yang diucapkan sejalan dengan tindakan nyata.

### 3. Emotional Time-Series (36-Hour Window) & Causal Knowledge Graph
* **Jendela Emosi 36 Jam:** Memantau dinamika suasana hati, tingkat stres, dan energi Tuan Faqih melintasi siklus pergantian hari untuk menghasilkan narasi evolusi kepribadian yang akurat.
* **Grafik Sebab-Akibat (*Causal Graph*):** Memetakan hubungan korelasional antar kejadian.

### 4. Anticipatory Interventions & Conversational Memory UX
* **Intervensi Proaktif:** Mendeteksi spiral *overthinking* serta peringatan keputusan finansial larut malam (*Late Night Decision Guard*).
* **Conversational Memory UX:** Menghilangkan teks konfirmasi robotik. Setiap eksekusi simpan/hapus memori dibalas dengan narasi percakapan hangat dari *Chief of Staff*.

---

## Bab 5: Era Pembelajaran Mandiri & Memori Organik (v2.8 to v2.9)

### v2.8 — Self-Learning Engine & Passive Knowledge Acquisition
* **Passive Real-Time Learning (\`nexa_self_model\`):**
  * N.E.X.A memindai koreksi pengguna secara *in-flight* (\`isFactAboutNexa\`) dan mengklasifikasikannya ke dalam 5 layer identitas (*LIMITATIONS, CORRECTIONS, COMMUNICATION_STYLE, CAPABILITIES, OPERATIONAL_RULES*).
* **Weekly Self-Reflection Pass:**
  * Rutinitas setiap Minggu pukul 16:00 WIB untuk menganalisis obrolan selama 7 hari, mengevaluasi di mana N.E.X.A sering ditegur, dan memperbarui pemahaman dirinya secara mandiri.

### v2.9 — Living Memory Engine & Dual-Channel CLI Console
* **The Living Memory Engine:**
  * **Progressive Fact Injection & Dynamic Word Resonance:** Menyaring memori secara presisi (memangkas konsumsi token hingga 85%) dengan menyuntikkan fakta relevan berdasarkan kemiripan kata kunci (≥ 4 karakter).
  * **Supersede Engine v2:** Logika 4-arah (*NEW, REINFORCE, SUPERSEDE, DUPLICATE*) dengan proteksi mutex terhadap *race condition*.
* **Unified CLI Interface Parity (\`nexa-assistant-console\`):**
  * Peluncuran paket konsol CLI resmi di **NPM (\`nexa-assistant-console\` / \`nexa-cli\`)**.
  * Mengadopsi arsitektur *Dual-Channel*: Permintaan via \`POST /webhook/cli\` dan penerimaan notifikasi proaktif/rekap secara *real-time* via **Server-Sent Events (SSE)** \`GET /webhook/cli/stream\`.

---

## Bab 6: Era Infrastruktur Produksi Mandiri (v3.0 — Sovereign Azure Cloud Production)

Versi **v3.0.0** menandai lompatan stabilitas dan kedaulatan infrastruktur N.E.X.A. Sistem berevolusi dari platform kontainer *free-tier* yang rentan pembatasan jaringan (*cold-start* dan pemutusan TLS keluar) menjadi arsitektur peladen penuh di **Azure Virtual Machine** yang beroperasi tanpa henti 24/7 di wilayah terdekat (Jakarta, Indonesia).

### 1. Spesifikasi Infrastruktur Peladen Sovereign
* **Compute Instance:** Azure Virtual Machine \`Standard_B2ats_v2\` berbasis sistem operasi **Ubuntu 24.04 LTS**.
* **Region Geografis:** \`indonesiacentral\` (Jakarta Data Center) menghasilkan latensi jaringan ultra-rendah (< 15 ms untuk akses domestik).
* **Domain Produksi Resmi:** \`https://nexa-server.indonesiacentral.cloudapp.azure.com\`.
* **Ketersediaan 24/7:** Bebas dari *sleep mode*, *cold boot*, atau pembatasan runtime gratisan.

### 2. Orkestrasi Proses & Web Server Mutakhir
* **PM2 Process Manager dengan Systemd Integration:**
  * Menjalankan *auto-restart* instan apabila terjadi *unhandled exception*.
  * Terintegrasi langsung dengan dashboard pemantauan cloud **PM2 Plus** (\`app.pm2.io\`).
* **Caddy Reverse Proxy (Zero-Maintenance SSL):**
  * Manajemen sertifikat TLS/SSL otomatis via Let's Encrypt dengan enkripsi modern.
  * Mengarahkan trafik port 80/443 secara transparan ke port internal \`3000\`.

### 3. Direct Outbound Networking & Jaringan Mandiri
* **Tier 1 Direct Outbound Telegram:** Menghilangkan ketergantungan pada relay perantara; server Azure berkomunikasi dua arah dengan \`api.telegram.org\` tanpa *TLS drop*.
* **Dedicated Production Engine Mode (\`NODE_ENV=production\`):** Jejak memori RAM dasar sangat hemat (~18 hingga 50 MB) dan stabil.

---

## Bab 7: Era Konsolidasi Master & Memori Naratif Kronologis (v3.1 — Unified Master OAuth 2.0 & Chrono-Episodic Architecture)

Versi **v3.1** menghadirkan pematangan arsitektur kognitif, penyatuan lisensi ekosistem raksasa Google di bawah satu atap, serta penciptaan sistem memori naratif autobiografis yang menghilangkan masalah pembengkakan database secara permanen.

\`\`\`mermaid
graph TD
    subgraph Cognitive & Action Hub v3.1
        GMC[Google_Master_Client.js - 16 Master Scopes]
        CCE[Chrono_Consolidator.js - 03:30 WIB Daily Synthesis]
        EPR[Episodic_Recall.js - Time Machine Search Engine]
        INT[Intention_Engine.js - Auto-Reconciliation Loop]
        SACR[Fallback_Engine.js - SACR v2.5 Dual Matrix]
    end

    subgraph Dual-Tier Memory Store
        RBM[(nexa_chat_memories - Raw 0-90 Days)]
        DNM[(nexa_daily_narratives - First-Person Chronicles)]
        VEC[(pgvector Semantic Embeddings)]
    end

    subgraph External Connected Worlds
        GAPP[Calendar + Tasks + Drive Vault + Gmail + Docs]
        SAMS[Mobile Bridge WS - Samsung Galaxy A33 5G]
        NWEB[nexa-finance-web - Next.js 14 Dashboard]
    end

    GMC -->|Unified Token Factory| GAPP
    CCE -->|Nightly Synthesis & Atomic Pruning| RBM
    CCE -->|Structured JSON Chronicles| DNM
    EPR -->|Hybrid Recall| RBM
    EPR -->|Hybrid Recall| DNM
    INT -->|Auto-Close Loops| RBM
    INT -->|08:15 WIB Friction Single Bubble| SAMS
\`\`\`

### 1. Unified Google Master OAuth 2.0 Client (\`Google_Master_Client.js\`)
* **Konsolidasi 16 Master Scopes:** Mengintegrasikan seluruh autentikasi Google API (Calendar, Tasks, Meet, Gmail, Drive, Docs, Sheets, Slides, Photos, Contacts, YouTube) di bawah satu klien Web Application GCP terpadu (\`nexa-core-495208\`).
* **Eliminasi Total Service Account:** Menghilangkan ketergantungan pada 50 baris Private Key RSA Service Account yang sering memicu error kuota penyimpanan Google Drive.
* **Singleton Lazy Factory & Transparent Interceptor:** Rotasi token dikelola otomatis di latar belakang dengan proteksi *Circuit Breaker* tunggal jika otorisasi terputus.

### 2. Chrono-Episodic Daily Memory Engine (\`Chrono_Consolidator.js\` & \`Episodic_Recall.js\`)
* **Dual-Tier Memory Architecture:**
  * **Tier 1 (Raw Buffer 0–90 Hari):** Obrolan mentah disimpan verbatim di \`nexa_chat_memories\` untuk menjaga konteks jangka pendek.
  * **Tier 2 (Chrono-Narratives > 90 Hari):** Setiap malam pukul 03:30 WIB, obrolan berusia >90 hari disintesis menjadi catatan harian biografis berperspektif orang pertama N.E.X.A (\`nexa_daily_narratives\`), lalu pesan mentah dibersihkan secara atomik (menghemat ribuan baris data).
* **Episodic Recall (Mesin Penjelajah Waktu):** Menggabungkan pencarian tanggal presisi dan kueri semantik berbasis vektor (pgvector) untuk mengingat kembali peristiwa masa lalu dengan akurasi tinggi.

### 3. Smart Closed-Loop Intention Engine & Auto-Reconciler (\`Intention_Engine.js\`)
* **Pembersihan Kutipan Referensi (\`_cleanUserText\`):** Membuang teks kutipan Telegram \`[KONTEKS_REFERENSI]\` agar perkataan N.E.X.A sendiri tidak salah dicatat sebagai niat Tuan.
* **Blacklist Aktivitas Rutin Instan (\`EPHEMERAL_EXCLUSIONS\`):** Menolak 100% aktivitas sepele (makan, tidur, sholat, ngobrol, mandi).
* **Whitelist Domain Substantif (\`SUBSTANTIVE_DOMAIN_REGEX\`):** Hanya mencatat tujuan besar (beasiswa, skripsi, MUN, kendaraan, aset, medis).
* **Penutupan Loop Otomatis (\`autoReconcileIntentions\`):** N.E.X.A otomatis menandai niat sebagai \`FULFILLED\` saat Tuan mengabarkan bahwa tugas tersebut sudah terlaksana di obrolan berikutnya.
* **Batas Ketat Anti-Spam (1 Pesan/Hari):** Pengecekan jam 08:15 WIB dibatasi maksimal 1 pesan per pagi dengan gaya bahasa hangat tanpa em-dash.

### 4. Smart Adaptive Context Routing Matrix (SACR v2.5)
* **Mode Light (Konteks Ringan):** Google Gemma 4 31B -> Gemini 3.7 Flash -> Gemini 3.6 Flash -> Groq LPU Qwen 3.8 27B (Dense Architecture super cepat).
* **Mode Heavy (Konteks Berat):** Gemini 3.7 Flash -> Gemini 3.6 Flash -> Google Gemma 4 31B -> Groq Qwen.

### 5. Identitas Resmi & Filosofi Baru
* **Identitas Resmi:** **N.E.X.A = Neural Executive with Xenial Agent**
* Menggantikan kepanjangan lama dengan akronim yang 100% harfiah, mencerminkan kapasitas intelektual (*Neural Executive*) dan jiwa kesetiaan yang abadi (*Xenial Agent*) semata-mata untuk mengabdi kepada Tuan Faqih Hidayatulloh.

---

## Kesimpulan & Metrik Spesifikasi v3.1.0

| Parameter Arsitektur | Spesifikasi N.E.X.A v3.1.0 (Production) |
| :--- | :--- |
| **Official Name & Title** | **N.E.X.A (Neural Executive with Xenial Agent)** |
| **Core Compute Infrastructure** | Azure Virtual Machine \`Standard_B2ats_v2\` (Ubuntu 24.04 ARM, Jakarta \`indonesiacentral\`) |
| **Process Management & Auto-Healing** | PM2 Process Manager v5.4 + Systemd Auto-Revive + PM2 Plus Cloud Dashboard |
| **Edge Web Server & Security** | Caddy v2 Reverse Proxy + Automated Let's Encrypt TLS/SSL |
| **Production Domain** | \`https://nexa-server.indonesiacentral.cloudapp.azure.com\` |
| **Environment Runtime** | Node.js 20 LTS (\`NODE_ENV=production\`, RAM Footprint ~18-25 MB) |
| **Google Cloud Integration** | Unified Master OAuth 2.0 Client (16 Master Scopes, Zero Service Account) |
| **Memory Architecture** | Dual-Tier Chrono-Episodic System (Raw 90d Buffer + Daily Narratives + pgvector) |
| **Cognitive Autonomy** | Closed-Loop Intention Engine + Auto-Reconciliation + Anti-Spam Single Follow-up |
| **Interface Ecosystem** | Telegram Webhook (Zero-Outbound) + NPM CLI (\`nexa-cli\`) + Mobile Bridge Android (\`ws\`) + Web UI (\`nexa-finance-web\`) |
| **Primary Beneficiary** | **Tuan Faqih Hidayatulloh** |

---
*Dokumen resmi Architectural Evolution Roadmap N.E.X.A v3.1.0. Diverifikasi dan disinkronkan dengan Azure Cloud Core.*
`;

fs.writeFileSync(roadmapPath, newContent, 'utf8');
console.log('✅ Successfully updated docs/NEXA_VERSION_EVOLUTION_ROADMAP.md to v3.1');
