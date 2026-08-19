# 🏛️ N.E.X.A Cloud Core — Unified Google Master OAuth 2.0 Architecture & Migration Blueprint

> **Dokumen Perencanaan Arsitektur, Logika Sistem, & Fase Implementasi Terstruktur**  
> **Status:** Planning / Production-Ready Architecture 📋  
> **Target Rilis:** N.E.X.A Core v3.1  
> **Waktu Pembuatan:** Rabu, 19 Agustus 2026  
> **Author:** N.E.X.A Development Team & Tuan Faqih  

---

## 📑 Daftar Isi
1. [Latar Belakang & Masalah Sistemik (Root Cause Analysis)](#1-latar-belakang--masalah-sistemik-root-cause-analysis)
2. [Komparasi Fundamental: Service Account vs Unified Master OAuth 2.0](#2-komparasi-fundamental-service-account-vs-unified-master-oauth-20)
3. [Analisis Keamanan, Kuota Google API, & Polling Economics](#3-analisis-keamanan-kuota-google-api--polling-economics)
4. [Matriks Cakupan 14 Master Scopes (Full Read & Write)](#4-matriks-cakupan-14-master-scopes-full-read--write)
5. [Arsitektur Teknis Sistem (The Unified Master Client Pattern)](#5-arsitektur-teknis-sistem-the-unified-master-client-pattern)
6. [Mekanisme Ketahanan, Circuit Breaker, & Token Lifecycle](#6-mekanisme-ketahanan-circuit-breaker--token-lifecycle)
7. [Reduksi Kompleksitas `.env` & Eliminasi Kunci RSA](#7-reduksi-kompleksitas-env--eliminasi-kunci-rsa)
8. [Strategi Otorisasi Multi-Environment (Local & Cloud VPS)](#8-strategi-otorisasi-multi-environment-local--cloud-vps)
9. [Fase-Fase Implementasi Terstruktur (Step-by-Step Implementation Roadmap)](#9-fase-fase-implementasi-terstruktur-step-by-step-implementation-roadmap)
   * [Fase 1: Setup GCP Console & Generator Token Master](#fase-1-setup-gcp-console--generator-token-master)
   * [Fase 2: Pembangunan Core Engine `Google_Master_Client.js`](#fase-2-pembangunan-core-engine-google_master_clientjs)
   * [Fase 3: Refactoring Modular Facade & Deprikasi Service Account](#fase-3-refactoring-modular-facade--deprikasi-service-account)
   * [Fase 4: Ekspansi Fitur Domain Baru (Docs, Sheets, Slides, Contacts, Meet)](#fase-4-ekspansi-fitur-domain-baru-docs-sheets-slides-contacts-meet)
   * [Fase 5: Deployment Azure VPS, Pembersihan `.env`, & Verifikasi Total](#fase-5-deployment-azure-vps-pembersihan-env--verifikasi-total)
10. [Rancangan Kode Produksi: `Google_Master_Client.js`](#10-rancangan-kode-produksi-google_master_clientjs)
11. [Rancangan Skrip Otorisasi: `generate_google_master_token.js`](#11-rancangan-skrip-otorisasi-generate_google_master_tokenjs)
12. [Matriks Pengujian & Verifikasi Kesiapan Operasional](#12-matriks-pengujian--verifikasi-kesiapan-operasional)

---

## 1. Latar Belakang & Masalah Sistemik (Root Cause Analysis)

### A. Fragmentasi Kredensial di Codebase Lama
Pada arsitektur N.E.X.A sebelumnya, konektivitas ke ekosistem Google terfragmentasi menjadi 3 subsistem terpisah dengan metode otentikasi yang tidak seragam:
1. **Google Workspace (`Google_Workspace.js`):** Menggunakan *Google Service Account* (`GOOGLE_SERVICE_ACCOUNT_EMAIL` dan `GOOGLE_PRIVATE_KEY` RSA 2048-bit) untuk Drive, Calendar, dan Docs.
2. **Gmail Engine (`Gmail_Client.js`):** Menggunakan OAuth 2.0 terpisah dengan `GMAIL_REFRESH_TOKEN` (hanya scope baca email).
3. **Google Tasks (`Google_Tasks.js`):** Menggunakan OAuth 2.0 terpisah dengan `TASKS_REFRESH_TOKEN`.

### B. Kendala Struktural yang Menghambat Pertumbuhan Sistem:
1. **Keterbatasan Mutlak Akun Robot (Service Account):**
   * *Google Tasks:* Service Account **tidak memiliki akses** ke Google Tasks pribadi pengguna karena Google Tasks tidak menyediakan mekanisme *sharing/delegation* ke email pihak ketiga. Akibatnya, manajemen tugas pribadi Tuan tidak bisa diintegrasikan dengan bot service.
   * *Gmail:* Service Account ditolak oleh Google API untuk akun konsumen standar (`@gmail.com`), sehingga pembacaan struk email harus dipaksa menggunakan OAuth terpisah.
   * *Overhead Pembagian Izin (Sharing Friction):* Setiap kali Tuan membuat folder Drive baru atau kalender baru, Tuan harus secara manual membagikan (*share*) hak akses ke email bot robot yang panjang (`bot-nexa@project.iam.gserviceaccount.com`). Jika ada 1 file yang lupa di-share, N.E.X.A langsung mengalami *blind spot* (`404 Not Found`).
2. **Masalah Buffer Overflow saat Injeksi Kunci RSA via SSH:**
   * Kunci `GOOGLE_PRIVATE_KEY` berukuran ~1.800 karakter dengan format multi-line escape (`\n`).
   * Saat melakukan setup server baru di Azure VPS melalui terminal SSH, proses *copy-paste* string RSA panjang sering mengalami pemotongan karakter (*buffer truncation*), memicu error fatal `error:0909006C:PEM routines:get_name:no start line`.
3. **Tuntutan Kapabilitas Asisten Eksekutif Sejati (Full Read & Write):**
   * N.E.X.A membutuhkan kemampuan menulis draf dokumen di Docs, mengelola spreadsheet kas di Sheets, menjadwalkan rapat Meet, mengelola to-do list di Tasks, dan mengorganisasi berkas di Drive secara terpadu langsung di akun pribadi Tuan Faqih tanpa sekat folder.

---

## 2. Komparasi Fundamental: Service Account vs Unified Master OAuth 2.0

| Parameter | Service Account (Metode Lama) | **Unified Master OAuth 2.0 (Metode Baru)** |
|---|---|---|
| **Entitas Pemilik Data** | Akun robot GCP independen (`bot@iam...`) | **Akun Google Pribadi Tuan Faqih (`faqih@gmail.com`)** |
| **Akses Google Tasks** | ❌ GAGAL (Tidak didukung Google) | 🟢 **100% Penuh (Baca, Tambah, Edit, Centang Selesai)** |
| **Akses Gmail Pribadi** | ❌ GAGAL (Diblokir untuk akun non-GSuite) | 🟢 **100% Penuh (Baca Struk, Draf, Kirim Resmi)** |
| **Akses Drive & Kalender** | 🟡 Terbatas pada folder yang di-share manual | 🟢 **Akses Penuh Seluruh File & Kalender Pribadi** |
| **Akses Docs, Sheets, Slides** | 🟡 Butuh izin edit per-dokumen | 🟢 **Akses Langsung Read & Write Tanpa Share** |
| **Akses Kontak (People API)** | ❌ Tidak Ada | 🟢 **Bisa simpan & cari kontak kenalan di HP** |
| **Format Kredensial `.env`** | 50+ baris Private Key RSA yang rapuh | **1 Kunci Master Refresh Token ringkas** |
| **Persetujuan Pengguna** | Setup manual via GCP IAM Console | **1x Klik Consent Screen di Browser (Granular)** |
| **Biaya / Billing GCP** | Rp 0 (Gratis) | **Rp 0 (Gratis 100% Selamanya)** |

---

## 3. Analisis Keamanan, Kuota Google API, & Polling Economics

### A. Mengapa Polling Tiap 3 Menit 100% Aman & Bukan Spam?
Sistem N.E.X.A menjalankan pemindaian otomatis (*CRON Polling*) setiap 3 menit (`*/3 * * * *`) untuk mendeteksi email struk perbankan (Bank Mandiri, BCA, GoPay, dll.).

1. **Definisi Spam vs API Polling:**
   * *Spam:* Aktivitas pengiriman email massal keluar (`gmail.send`) tanpa persetujuan penerima.
   * *API Polling:* Permintaan HTTP GET (`users.messages.list`) untuk memeriksa kotak masuk milik sendiri. Google **tidak pernah** mengklasifikasikan pembacaan data via OAuth sebagai spam.
2. **Perhitungan Matematis Konsumsi Kuota (Official Google Quota):**
   * Batas Kecepatan (*Rate Limit*): Maksimal **250 request per detik**. *(N.E.X.A hanya 1 request per 180 detik).*
   * Batas Kuota Harian Gratis: **250.000 quota units / hari**.
   * Frekuensi Polling: 480 kali per hari.
   * Biaya API `messages.list`: 5 quota units.
   * **Total Konsumsi Harian:** $480 \times 5 = \mathbf{2.400\text{ units/hari}}$ (**Hanya 0,96% dari jatah gratis Google**).
3. **Kesesuaian dengan Standar Industri:**
   * Aplikasi email tier-1 (Apple Mail, Microsoft Outlook, Spark, Todoist) menggunakan metode polling OAuth 2.0 serupa setiap 1–5 menit.

### B. Keabadian Refresh Token (*Token Longevity*):
* Dengan menyetel *OAuth Consent Screen* di Google Cloud Console ke status **Production / External (Personal Use)**, `refresh_token` bersifat **permanen dan abadi** (tidak kedaluwarsa dalam 7 hari).
* Token hanya akan kedaluwarsa jika Tuan Faqih sengaja mencabut aksesnya di menu *Google Security Settings* atau mengganti kata sandi akun Google.

---

## 4. Matriks Cakupan 14 Master Scopes (Full Read & Write)

Seluruh 14 layanan Google digabungkan ke dalam 1 sesi otorisasi *Multi-Scope*:

```
openid 
https://www.googleapis.com/auth/userinfo.email 
https://www.googleapis.com/auth/userinfo.profile 
https://www.googleapis.com/auth/tasks 
https://www.googleapis.com/auth/calendar 
https://www.googleapis.com/auth/meetings.space.created 
https://mail.google.com/ 
https://www.googleapis.com/auth/contacts 
https://www.googleapis.com/auth/drive 
https://www.googleapis.com/auth/documents 
https://www.googleapis.com/auth/spreadsheets 
https://www.googleapis.com/auth/presentations 
https://www.googleapis.com/auth/photoslibrary 
https://www.googleapis.com/auth/youtube
```

### Rincian Kapabilitas per Layanan:

| No | Layanan | Scope URL | Kapabilitas di N.E.X.A |
|---|---|---|---|
| 1 | **Google Tasks** | `.../auth/tasks` | Kelola to-do list harian, deadline, dan checklist tugas kuliah/proyek. |
| 2 | **Google Calendar** | `.../auth/calendar` | Jadwalkan agenda, deteksi bentrok, reminder, dan sinkronisasi otomatis. |
| 3 | **Google Meet** | `.../auth/meetings.space.created` | Generate room rapat video instan saat membuat agenda di kalender. |
| 4 | **Gmail** | `https://mail.google.com/` | Auto-sync finansial, pencarian email penting dosen, draf balasan, & kirim email. |
| 5 | **Google Contacts** | `.../auth/contacts` | Pencarian nomor telepon dan penyimpanan kontak relasi baru. |
| 6 | **Google Drive** | `.../auth/drive` | Manajemen berkas Vault, upload KTP/KTM, organisasi folder cloud. |
| 7 | **Google Docs** | `.../auth/documents` | Pembuatan draf esai, makalah, notulensi, dan dokumen 2nd Brain. |
| 8 | **Google Sheets** | `.../auth/spreadsheets` | Sinkronisasi buku kas real-time dan rekapitulasi analitik anggaran. |
| 9 | **Google Slides** | `.../auth/presentations` | Pembuatan outline presentasi otomatis. |
| 10 | **Google Photos** | `.../auth/photoslibrary` | Akses dan pencadangan foto media beresolusi tinggi. |
| 11 | **YouTube Data** | `.../auth/youtube` | Kelola playlist riset video, bookmark materi diplomasi/bahasa. |
| 12 | **User Profile** | `openid`, `.../userinfo.email`, `.../userinfo.profile` | Verifikasi identitas pemilik akun (Tuan Faqih). |

---

## 5. Arsitektur Teknis Sistem (The Unified Master Client Pattern)

### A. Diagram Arsitektur Baru:

```mermaid
graph TD
    User[Tuan Faqih] -->|1x Login di Browser| GoogleAuth[Google OAuth 2.0 Consent Screen]
    GoogleAuth -->|Issues Master Refresh Token| TokenGen[scripts/generate_google_master_token.js]
    TokenGen -->|Save to .env| EnvConfig[GOOGLE_MASTER_REFRESH_TOKEN]
    
    EnvConfig --> MasterClient[src/infrastructure/Google_Master_Client.js]
    
    subgraph Google API Suite
        MasterClient --> GmailAPI[Gmail API v1]
        MasterClient --> TasksAPI[Tasks API v1]
        MasterClient --> CalendarAPI[Calendar API v3]
        MasterClient --> DriveAPI[Drive API v3]
        MasterClient --> DocsAPI[Docs API v1]
        MasterClient --> SheetsAPI[Sheets API v4]
        MasterClient --> PeopleAPI[People/Contacts API v1]
        MasterClient --> YouTubeAPI[YouTube API v3]
    end
    
    GmailAPI --> FinanceEngine[Finance Auto-Sync Engine]
    TasksAPI --> TaskManager[Task & Agenda Manager]
    CalendarAPI --> IntelligenceBrief[Morning/Evening Briefing]
    DriveAPI --> VaultEngine[N.E.X.A Secure Vault]
```

### B. Pola Desain *Singleton Factory* dengan *Lazy Initialization*:
1. **Zero Cold-Start Overhead:** Google API Client (Gmail, Drive, Tasks, dll.) **tidak dibuat saat modul di-require**. Instance baru dibangun saat fungsi pertama kali dipanggil (`lazy-load`), menjaga penggunaan RAM server Azure VPS tetap sangat rendah (~170 MB).
2. **Koneksi Tunggal (*Single Auth State*):** Seluruh API client berbagi 1 instance `oauth2Client`. Ketika `access_token` diperbarui, seluruh layanan langsung mendapatkan token aktif tanpa perlu request otentikasi terpisah.

---

## 6. Mekanisme Ketahanan, Circuit Breaker, & Token Lifecycle

### A. Siklus Hidup Token (*Automatic Refresh Cycle*)
1. Saat boot, `oauth2Client.setCredentials({ refresh_token: GOOGLE_MASTER_REFRESH_TOKEN })`.
2. Ketika N.E.X.A melakukan request API (misal `gmail.messages.list`), pustaka `googleapis` secara otomatis memeriksa apakah `access_token` masih valid (~3600 detik).
3. Jika sudah kedaluwarsa, pustaka secara transparan menghubungi endpoint `oauth2.googleapis.com/token` untuk mengambil token baru dan melanjutkan request tanpa mengganggu jalannya aplikasi (*zero downtime*).

### B. Penanganan Error `invalid_grant` (Circuit Breaker)
Jika Tuan sengaja mencabut izin di Google Security atau mengganti password:
1. Google mengembalikan error `invalid_grant`.
2. **Circuit Breaker:** `Google_Master_Client.js` mendeteksi error ini, menghentikan loop polling agar tidak melakukan spam error ke server Google.
3. **Proactive Alert:** N.E.X.A segera mengirimkan notifikasi satu kali ke Telegram Tuan:  
   `⚠️ Kredensial Google Master Token telah kedaluwarsa/dicabut. Silakan jalankan generate_google_master_token.js untuk memperbarui akses.`

### C. Retry Berbasis Exponential Backoff & Jitter
Untuk error transient (misal `503 Service Unavailable` atau `429 Rate Limit`):
$$\text{Delay} = 2^{\text{attempt}} \times 1000\text{ ms} + \text{random\_jitter}(0, 500\text{ ms})$$

---

## 7. Reduksi Kompleksitas `.env` & Eliminasi Kunci RSA

### Perbandingan Konfigurasi Lingkungan:

#### ❌ Konfigurasi Lama (Penuh Beban & Rapuh):
```env
# Google Workspace Service Account (HAPUS)
GOOGLE_SERVICE_ACCOUNT_EMAIL=bot-nexa@project-123.iam.gserviceaccount.com
GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nMIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQC7r6...\n... (ratusan karakter rawan korup saat SSH) ...\n-----END PRIVATE KEY-----\n"

# Token-token Terpecah (HAPUS)
GMAIL_CLIENT_ID=xxx.apps.googleusercontent.com
GMAIL_CLIENT_SECRET=GOCSPX-xxx
GMAIL_REFRESH_TOKEN=1//0g_gmail_token
TASKS_REFRESH_TOKEN=1//0g_tasks_token
GOOGLE_DRIVE_REFRESH_TOKEN=1//0g_drive_token
```

#### ✅ Konfigurasi Baru (Super Ringkas & Bersih):
```env
# ════════════════════════════════════════════════════════════
# GOOGLE UNIFIED MASTER OAUTH 2.0 (ALL-IN-ONE)
# ════════════════════════════════════════════════════════════
GOOGLE_CLIENT_ID=xxx.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-xxx
GOOGLE_MASTER_REFRESH_TOKEN=1//0g_unified_master_token_disini

# Resource Target IDs (Alamat File & Folder Target di Akun Tuan)
GOOGLE_CALENDAR_ID=primary
GOOGLE_SHEET_ID=1uNd-UWxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
GOOGLE_VAULT_FOLDER_ID=18qkZJtOkTl1Eqr_9MpezELGKZO0PZjCZ
GOOGLE_DOCS_IDEA_ID=1Yrxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

---

## 8. Strategi Otorisasi Multi-Environment (Local & Cloud VPS)

Skrip generator token mendukung 2 mode eksekusi:

1. **Mode A: Local / Desktop Browser (ThinkPad):**  
   Membuka server lokal di `http://localhost:3000/oauth2callback`. Begitu Tuan login di browser, token langsung tertangkap secara otomatis.
2. **Mode B: Headless Server (Azure VPS via SSH):**  
   Jika dijalankan di terminal Linux tanpa GUI, skrip menampilkan URL otorisasi Google. Tuan membukanya di HP/Laptop, lalu menyalin *Authorization Code* yang diberikan Google kembali ke terminal VPS.

---

## 9. Fase-Fase Implementasi Terstruktur (Step-by-Step Implementation Roadmap)

Untuk menjamin proses migrasi berjalan mulus tanpa downtime, eksekusi dibagi menjadi **5 Fase Terurut**:

```
 ┌─────────────────────────────────────────────────────────────────────────────────┐
 │                   ROADMAP MIGRASI UNIFIED GOOGLE MASTER OAUTH 2.0               │
 └─────────────────────────────────────────────────────────────────────────────────┘
         │
         ▼
 ┌───────────────────┐      ┌─────────────────────────┐      ┌─────────────────────────┐
 │      FASE 1       │ ───► │         FASE 2          │ ───► │         FASE 3          │
 │ Setup GCP & Token │      │ Core Master Client & CB │      │ Facade Refactor & Deprec│
 └───────────────────┘      └─────────────────────────┘      └─────────────────────────┘
                                                                          │
                                                                          ▼
                            ┌─────────────────────────┐      ┌─────────────────────────┐
                            │         FASE 5          │ ◄─── │         FASE 4          │
                            │ Deploy VPS & Full Audit │      │ New Domain Capabilities │
                            └─────────────────────────┘      └─────────────────────────┘
```

---

### 🔹 Fase 1: Setup GCP Console & Generator Token Master
*Tujuan: Mempersiapkan kredensial OAuth 2.0 di Google Cloud Console dan memperoleh Master Refresh Token permanen.*

* **Langkah 1.1:** Buka [Google Cloud Console](https://console.cloud.google.com/).
* **Langkah 1.2:** Pada menu **OAuth Consent Screen**:
  * Pilih User Type: **External**.
  * Ubah Publishing Status ke **Production** *(Krusial: agar token tidak expired dalam 7 hari)*.
  * Tambahkan 14 Master Scopes (Tasks, Calendar, Meet, Gmail, Contacts, Drive, Docs, Sheets, Slides, Photos, YouTube, UserInfo).
* **Langkah 1.3:** Pada menu **Credentials**:
  * Buat **OAuth 2.0 Client ID** bertipe *Web Application* (Redirect URI: `http://localhost:3000/oauth2callback`).
  * Simpan `GOOGLE_CLIENT_ID` dan `GOOGLE_CLIENT_SECRET`.
* **Langkah 1.4:** Buat skrip `scripts/generate_google_master_token.js` di codebase.
* **Langkah 1.5:** Jalankan skrip di terminal ThinkPad, lakukan 1x klik login di browser, centang **Select all**, dan dapatkan string `GOOGLE_MASTER_REFRESH_TOKEN`.
* **Output Deliverable:** Token master `GOOGLE_MASTER_REFRESH_TOKEN` tersimpan aman di `.env` lokal.

---

### 🔹 Fase 2: Pembangunan Core Engine `Google_Master_Client.js`
*Tujuan: Membangun modul singleton factory terpusat dengan mekanisme lazy-loading, auto-refresh, dan circuit breaker.*

* **Langkah 2.1:** Buat file baru `src/infrastructure/Google_Master_Client.js`.
* **Langkah 2.2:** Terapkan Singleton `getOAuth2Client()` dengan listener rotasi token (`_oauth2Client.on('tokens')`).
* **Langkah 2.3:** Terapkan helper factory `_createServiceClient()` untuk instansiasi lazy-loading:
  * `getGmail()`, `getTasks()`, `getCalendar()`, `getDrive()`, `getDocs()`, `getSheets()`, `getSlides()`, `getPeople()`, `getYouTube()`.
* **Langkah 2.4:** Terapkan Circuit Breaker `handleAuthError()` untuk mendeteksi `invalid_grant` dan mengirim peringatan instan ke Telegram tanpa loop spamming.
* **Langkah 2.5:** Tambahkan unit test verifikasi inisialisasi client di `tests/test_google_master_client.js`.
* **Output Deliverable:** Modul `Google_Master_Client.js` selesai, lulus uji otentikasi lokal, dan siap dipakai modul lain.

---

### 🔹 Fase 3: Refactoring Modular Facade & Deprikasi Service Account
*Tujuan: Mengalihkan seluruh modul lama ke Google Master Client tanpa merusak (zero-breaking) pemanggilan yang ada.*

* **Langkah 3.1: Refactor `src/infrastructure/Gmail_Client.js`**
  * Ganti pembuatan auth OAuth internal dengan `googleMasterClient.getGmail()`.
  * Pertahankan fungsi helper domain (`getLatestEmails`, `sendEmail`, `createDraft`, dll.).
* **Langkah 3.2: Refactor `src/infrastructure/Google_Tasks.js`**
  * Ganti pembuatan auth OAuth internal dengan `googleMasterClient.getTasks()`.
  * Pertahankan fungsi helper domain (`getTasksDueToday`, `createTask`, `updateTask`, `deleteTask`).
* **Langkah 3.3: Refactor `src/infrastructure/Google_Workspace.js`**
  * Ganti instansiasi Service Account RSA (`GoogleAuth`) dengan `googleMasterClient.getCalendar()`, `googleMasterClient.getDrive()`, dan `googleMasterClient.getDocs()`.
  * Hapus ketergantungan pada `GOOGLE_SERVICE_ACCOUNT_EMAIL` dan `GOOGLE_PRIVATE_KEY`.
* **Langkah 3.4: Update `src/config/env.js`**
  * Daftarkan variabel lingkungan baru: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_MASTER_REFRESH_TOKEN`.
  * Jadikan variabel Service Account lama opsional/deprecated (tidak menyebabkan server crash jika tidak ada).
* **Output Deliverable:** Seluruh subsistem lama (Finance Polling, Agenda Manager, Task Manager, Vault) berjalan 100% via Master Client.

---

### 🔹 Fase 4: Ekspansi Fitur Domain Baru (Docs, Sheets, Slides, Contacts, Meet)
*Tujuan: Membuka fitur-fitur baru asisten eksekutif yang sebelumnya tidak bisa dilakukan oleh akun robot.*

* **Langkah 4.1: Google Docs & 2nd Brain Live Writer**
  * Tambahkan fungsi `createDocument(title, folderId)` dan `appendContent(docId, text)`.
  * Integrasikan dengan intent `2ND_BRAIN` di `AI_Router.js`.
* **Langkah 4.2: Google Sheets Financial Spreadsheet Sync**
  * Tambahkan fungsi `appendExpenseRow(sheetId, txData)` dan `createSpreadsheet(title)`.
  * Integrasikan ke `Finance_Engine.js` agar selain Supabase, transaksi juga bisa langsung ditulis ke spreadsheet pribadi Tuan.
* **Langkah 4.3: Google Contacts (People API)**
  * Tambahkan fungsi `searchContactByName(name)` dan `createContact(name, phone, email)`.
  * N.E.X.A bisa langsung mencari kontak atau menyimpan nomor baru via chat Telegram.
* **Langkah 4.4: Google Meet Instant Meeting Room Generator**
  * Tambahkan parameter `conferenceData` pada `calendar.events.insert()` untuk menghasilkan link Google Meet otomatis saat membuat janji temu.
* **Output Deliverable:** N.E.X.A memiliki kapabilitas penuh mengelola seluruh dokumen, spreadsheet, kontak, dan rapat Tuan.

---

### 🔹 Fase 5: Deployment Azure VPS, Pembersihan `.env`, & Verifikasi Total
*Tujuan: Mempublikasikan kode ke server produksi Azure VPS di Jakarta, membersihkan konfigurasi, dan verifikasi menyeluruh.*

* **Langkah 5.1:** Update file `.env` di server Azure VPS:
  * Hapus baris `GOOGLE_SERVICE_ACCOUNT_EMAIL` dan `GOOGLE_PRIVATE_KEY` (50 baris).
  * Masukkan baris `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, dan `GOOGLE_MASTER_REFRESH_TOKEN`.
* **Langkah 5.2:** Commit dan Push seluruh perubahan codebase ke branch `main` GitHub.
* **Langkah 5.3:** Eksekusi update via SSH ke Azure VPS:
  ```powershell
  ssh nexa@48.193.41.76 "cd ~/nexa-server && git pull && pm2 restart nexa-server"
  ```
* **Langkah 5.4:** Jalankan **Matriks Pengujian Produksi (6 Skenario)**:
  1. Uji pemindaian Finance Auto-Sync (Gmail API polling 3 menit).
  2. Uji pembuatan tugas Google Tasks via Telegram.
  3. Uji pembuatan jadwal Google Calendar + Google Meet via Telegram.
  4. Uji upload dokumen Vault ke Google Drive.
  5. Uji pembuatan draf Google Docs baru.
  6. Pantau log real-time di PM2 (`pm2 logs nexa-server`) untuk memastikan 0 error otentikasi.
* **Output Deliverable:** N.E.X.A Cloud Core v3.1 aktif 24/7 di Azure VPS dengan arsitektur Google Master OAuth 2.0 murni.

---

## 10. Rancangan Kode Produksi: `Google_Master_Client.js`

File: `src/infrastructure/Google_Master_Client.js`

```javascript
const { google } = require('googleapis');
const env = require('../config/env');

let _oauth2Client = null;
let _clients = {};
let _invalidGrantAlerted = false;

/**
 * Singleton OAuth2 Auth Client
 */
function getOAuth2Client() {
  if (_oauth2Client) return _oauth2Client;

  const clientId = env.GOOGLE_CLIENT_ID || env.GMAIL_CLIENT_ID;
  const clientSecret = env.GOOGLE_CLIENT_SECRET || env.GMAIL_CLIENT_SECRET;
  const refreshToken = env.GOOGLE_MASTER_REFRESH_TOKEN || env.GMAIL_REFRESH_TOKEN;

  if (!clientId || !clientSecret || !refreshToken) {
    console.warn('[GOOGLE_MASTER] Kredensial Master OAuth 2.0 belum lengkap di .env');
    return null;
  }

  _oauth2Client = new google.auth.OAuth2(
    clientId,
    clientSecret,
    'http://localhost:3000/oauth2callback'
  );

  _oauth2Client.setCredentials({ refresh_token: refreshToken });

  // Listener jika Google melakukan rotasi refresh token
  _oauth2Client.on('tokens', (tokens) => {
    if (tokens.refresh_token) {
      console.log('[GOOGLE_MASTER] 🔄 Refresh token baru diterima dari Google.');
    }
  });

  return _oauth2Client;
}

/**
 * Helper pembungkus API dengan Error Interceptor
 */
function _createServiceClient(serviceName, version) {
  const auth = getOAuth2Client();
  if (!auth) return null;
  return google[serviceName]({ version, auth });
}

module.exports = {
  getAuthClient: getOAuth2Client,
  getGmail: () => _clients.gmail || (_clients.gmail = _createServiceClient('gmail', 'v1')),
  getCalendar: () => _clients.calendar || (_clients.calendar = _createServiceClient('calendar', 'v3')),
  getTasks: () => _clients.tasks || (_clients.tasks = _createServiceClient('tasks', 'v1')),
  getDrive: () => _clients.drive || (_clients.drive = _createServiceClient('drive', 'v3')),
  getDocs: () => _clients.docs || (_clients.docs = _createServiceClient('docs', 'v1')),
  getSheets: () => _clients.sheets || (_clients.sheets = _createServiceClient('sheets', 'v4')),
  getSlides: () => _clients.slides || (_clients.slides = _createServiceClient('slides', 'v1')),
  getPeople: () => _clients.people || (_clients.people = _createServiceClient('people', 'v1')),
  getYouTube: () => _clients.youtube || (_clients.youtube = _createServiceClient('youtube', 'v3')),
  
  handleAuthError: async (error, context = '') => {
    if (error.message?.includes('invalid_grant') && !_invalidGrantAlerted) {
      _invalidGrantAlerted = true;
      console.error(`[GOOGLE_MASTER] 🚨 FATAL: Refresh token invalid/revoked (${context}).`);
      try {
        const { sendTelegramOutbound } = require('../interfaces/webhook');
        await sendTelegramOutbound('⚠️ <b>Peringatan Keamanan N.E.X.A:</b>\n\nKredensial Google Master OAuth telah kedaluwarsa atau dicabut. Silakan generate ulang token di server.');
      } catch (_) {}
    }
  }
};
```

---

## 11. Rancangan Skrip Otorisasi: `generate_google_master_token.js`

File: `scripts/generate_google_master_token.js`

```javascript
const { google } = require('googleapis');
const http = require('http');
const url = require('url');

const SCOPES = [
  'openid',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile',
  'https://www.googleapis.com/auth/tasks',
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/meetings.space.created',
  'https://mail.google.com/',
  'https://www.googleapis.com/auth/contacts',
  'https://www.googleapis.com/auth/drive',
  'https://www.googleapis.com/auth/documents',
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/presentations',
  'https://www.googleapis.com/auth/photoslibrary',
  'https://www.googleapis.com/auth/youtube'
];

async function main() {
  const clientId = process.env.GOOGLE_CLIENT_ID || process.argv[2];
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET || process.argv[3];

  if (!clientId || !clientSecret) {
    console.error('\n❌ Gunakan perintah:');
    console.error('node scripts/generate_google_master_token.js <CLIENT_ID> <CLIENT_SECRET>\n');
    process.exit(1);
  }

  const oauth2Client = new google.auth.OAuth2(
    clientId,
    clientSecret,
    'http://localhost:3000/oauth2callback'
  );

  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: SCOPES
  });

  console.log('\n══════════════════════════════════════════════════════════════════');
  console.log('🔑 BUKA URL BERIKUT DI BROWSER UNTUK MEMBERIKAN IZIN MASTER:');
  console.log('══════════════════════════════════════════════════════════════════\n');
  console.log(authUrl);
  console.log('\n══════════════════════════════════════════════════════════════════\n');

  // Start local server to capture redirect
  const server = http.createServer(async (req, res) => {
    if (req.url.startsWith('/oauth2callback')) {
      const qs = new url.URL(req.url, 'http://localhost:3000').searchParams;
      const code = qs.get('code');
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end('<h1>✅ Otorisasi Master Berhasil!</h1><p>Kunci token telah diterima. Silakan kembali ke terminal.</p>');
      server.close();

      try {
        const { tokens } = await oauth2Client.getToken(code);
        console.log('🎉 ══════════════════════════════════════════════════════════');
        console.log('🎉 GOOGLE MASTER REFRESH TOKEN BERHASIL DIPEROLEH:');
        console.log('🎉 ══════════════════════════════════════════════════════════\n');
        console.log(`GOOGLE_MASTER_REFRESH_TOKEN=${tokens.refresh_token}\n`);
        console.log('Tambahkan baris di atas ke file .env di Azure VPS Anda.\n');
        process.exit(0);
      } catch (err) {
        console.error('❌ Gagal menukar token:', err.message);
        process.exit(1);
      }
    }
  }).listen(3000, () => {
    console.log('⏳ Menunggu respons browser di http://localhost:3000/oauth2callback ...');
    console.log('💡 (Jika di VPS tanpa browser, Anda juga dapat menyalin code dari URL callback).');
  });
}

main().catch(console.error);
```

---

## 12. Matriks Pengujian & Verifikasi Kesiapan Operasional

Sebelum dinyatakan aktif di produksi, sistem wajib lolos pengujian integrasi berikut:

| No | Modul Uji | Skenario Verifikasi | Indikator Sukses |
|---|---|---|---|
| 1 | **Otentikasi Identitas** | Pemanggilan info profil pengguna | Mengembalikan email `faqih@gmail.com` dan status aktif. |
| 2 | **Google Tasks** | Membuat tugas baru *"Uji Coba N.E.X.A"* | Tugas langsung muncul di aplikasi Google Tasks di HP Samsung A33. |
| 3 | **Google Calendar** | Menjadwalkan event 15 menit ke depan | Muncul di kalender primer dengan link Google Meet aktif. |
| 4 | **Gmail Auto-Sync** | Menjalankan `pollFinanceEmails()` | Mampu membaca email struk tanpa error `403 / 401`. |
| 5 | **Google Drive & Docs** | Membuat dokumen draf baru di Drive | File muncul di Google Drive utama tanpa perlu izin share. |
| 6 | **Google Sheets** | Menulis baris transaksi uji coba | Baris baru tercatat di spreadsheet keuangan. |

---

> **Kesimpulan:** Arsitektur *Unified Google Master OAuth 2.0* memberikan kedaulatan data penuh, kecepatan respon tinggi, mengeliminasi risiko corrupt kredensial RSA, serta menyederhanakan pemeliharaan server N.E.X.A di Azure VPS untuk masa depan yang tangguh dan elegan. 🚀🦾
