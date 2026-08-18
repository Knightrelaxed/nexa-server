# 🏛️ N.E.X.A Cloud Core — Unified Google Master OAuth 2.0 Architecture & Migration Blueprint

> **Dokumen Perencanaan Arsitektur & Transisi Infrastruktur Google**  
> **Status:** Planning / Ready for Implementation 📋  
> **Target Rilis:** N.E.X.A Core v3.1  
> **Waktu Pembuatan:** Selasa, 18 Agustus 2026  
> **Author:** N.E.X.A Development Team & Tuan Faqih  

---

## 📑 Daftar Isi
1. [Latar Belakang & Masalah Sistemik (Asal-Sebab)](#1-latar-belakang--masalah-sistemik-asal-sebab)
2. [Komparasi Fundamental: Service Account vs Unified Master OAuth 2.0](#2-komparasi-fundamental-service-account-vs-unified-master-oauth-20)
3. [Analisis Keamanan, Kuota Google API, & Polling Real-Time](#3-analisis-keamanan-kuota-google-api--polling-real-time)
4. [Matriks Cakupan Master Scopes (Full Read & Write)](#4-matriks-cakupan-master-scopes-full-read--write)
5. [Arsitektur Teknis Sistem (Unified Google Master Client)](#5-arsitektur-teknis-sistem-unified-google-master-client)
6. [Reduksi Kompleksitas `.env` & Eliminasi Kunci RSA](#6-reduksi-kompleksitas-env--eliminasi-kunci-rsa)
7. [Roadmap Implementasi Bertahap (Step-by-Step Migration)](#7-roadmap-implementasi-bertahap-step-by-step-migration)
8. [Rancangan Skrip Generator Token Interaktif](#8-rancangan-skrip-generator-token-interaktif)
9. [Strategi Pengujian & Verifikasi Kesiapan](#9-strategi-pengujian--verifikasi-kesiapan)

---

## 1. Latar Belakang & Masalah Sistemik (Asal-Sebab)

### A. Fragmentasi Kredensial di Codebase Saat Ini
Pada arsitektur N.E.X.A saat ini, konektivitas ke layanan Google terfragmentasi menjadi 3 subsistem berbeda dengan metode otentikasi yang saling terpisah:
1. **Google Workspace (Drive, Calendar, Docs):** Menggunakan *Google Service Account* (`GOOGLE_SERVICE_ACCOUNT_EMAIL` dan `GOOGLE_PRIVATE_KEY` RSA 2048-bit).
2. **Gmail Engine:** Menggunakan OAuth 2.0 terpisah (`GMAIL_REFRESH_TOKEN`).
3. **Google Tasks:** Menggunakan OAuth 2.0 terpisah lainnya (`TASKS_REFRESH_TOKEN`).

### B. Kendala Struktural yang Dihadapi:
1. **Keterbatasan Mutlak Akun Robot (Service Account):**
   * *Google Tasks:* Service Account **tidak memiliki akses** ke Google Tasks pribadi pengguna (Google Tasks tidak memiliki fitur sharing/delegasi ke email lain).
   * *Gmail:* Service Account tidak dapat membaca kotak masuk Gmail akun gratisan (`@gmail.com`).
   * *Sharing Overhead:* Setiap membuat folder Drive baru atau kalender baru, Tuan Faqih harus manual membagikan (*share*) hak akses ke email bot yang panjang (`bot-nexa@project.iam.gserviceaccount.com`). Jika lupa, bot buta terhadap event tersebut.
2. **Masalah Buffer Overflow saat Injeksi Kunci RSA via SSH:**
   * Kunci `GOOGLE_PRIVATE_KEY` berukuran ~1.800 karakter dengan banyak baris escape (`\n`).
   * Saat melakukan setup server baru (seperti pada migrasi ke Azure VPS), proses *copy-paste* string RSA panjang sering mengalami pemotongan karakter (*buffer truncation*), menyebabkan error `error:0909006C:PEM routines:get_name:no start line`.
3. **Kebutuhan Asisten Eksekutif Menyeluruh (Full Read & Write):**
   * N.E.X.A membutuhkan kemampuan menulis draf dokumen di Docs, mengelola spreadsheet kas di Sheets, menjadwalkan rapat Meet, mengelola tugas di Tasks, dan mengorganisasi berkas di Drive secara terpadu langsung di akun pribadi Tuan Faqih.

---

## 2. Komparasi Fundamental: Service Account vs Unified Master OAuth 2.0

| Parameter | Service Account (Metode Lama) | **Unified Master OAuth 2.0 (Metode Baru)** |
|---|---|---|
| **Entitas Pemilik Data** | Akun robot GCP independen (`bot@iam...`) | **Akun Google Pribadi Tuan Faqih (`faqih@gmail.com`)** |
| **Akses Google Tasks** | ❌ GAGAL (Tidak didukung Google) | 🟢 **100% Penuh (Baca, Buat, Centang Selesai)** |
| **Akses Gmail** | ❌ GAGAL (Diblokir untuk akun non-GSuite) | 🟢 **100% Penuh (Baca Struk, Draf, Kirim Resmi)** |
| **Akses Drive & Kalender** | 🟡 Terbatas pada folder yang di-share manual | 🟢 **Akses Penuh Seluruh File & Kalender Pribadi** |
| **Akses Docs, Sheets, Slides** | 🟡 Butuh izin edit per-dokumen | 🟢 **Akses Langsung Read & Write Tanpa Share** |
| **Akses Kontak (People API)** | ❌ Tidak Ada | 🟢 **Bisa simpan & cari kontak kenalan di HP** |
| **Format Kredensial `.env`** | 50+ baris Private Key RSA yang rapuh | **1 Kunci Master Refresh Token ringkas** |
| **Persetujuan Pengguna** | Setup manual via GCP IAM Console | **1x Klik Consent Screen di Browser (Granular)** |

---

## 3. Analisis Keamanan, Kuota Google API, & Polling Real-Time

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

## 4. Matriks Cakupan Master Scopes (Full Read & Write)

Seluruh 13 layanan Google digabungkan ke dalam 1 sesi otorisasi *Multi-Scope*:

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

*(Catatan: Google Maps, Geocoding, dan Places menggunakan `GOOGLE_MAPS_API_KEY` karena merupakan data geospasial publik).*

---

## 5. Arsitektur Teknis Sistem (Unified Google Master Client)

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

### B. Modul Terpadu: `src/infrastructure/Google_Master_Client.js`
Modul ini bertindak sebagai *Singleton Factory* yang menginisialisasi seluruh Google API Client dengan satu *OAuth2 Auth Provider* yang otomatis menangani *Auto-Refresh Token* di background.

---

## 6. Reduksi Kompleksitas `.env` & Eliminasi Kunci RSA

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

# Resource IDs (Alamat File & Folder Target di Akun Tuan)
GOOGLE_CALENDAR_ID=primary
GOOGLE_SHEET_ID=1uNd-UWxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
GOOGLE_VAULT_FOLDER_ID=18qkZJtOkTl1Eqr_9MpezELGKZO0PZjCZ
GOOGLE_DOCS_IDEA_ID=1Yrxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

---

## 7. Roadmap Implementasi Bertahap (Step-by-Step Migration)

### Tahap 1: Konfigurasi Google Cloud Console (5 Menit)
1. Buka [Google Cloud Console](https://console.cloud.google.com/).
2. Pada **OAuth Consent Screen**:
   * User Type: **External**.
   * Publishing Status: Set ke **Production** *(agar token tidak expired 7 hari)*.
   * Scopes: Tambahkan seluruh 13 scope master.
3. Pada **Credentials**:
   * Buat / gunakan **OAuth 2.0 Client ID** bertipe *Desktop App* atau *Web Application*.
   * Dapatkan `GOOGLE_CLIENT_ID` dan `GOOGLE_CLIENT_SECRET`.

### Tahap 2: Eksekusi Skrip Otorisasi Sekali Klik
1. Jalankan `node scripts/generate_google_master_token.js` di terminal.
2. Buka URL yang dihasilkan di browser.
3. Login menggunakan akun Google Tuan Faqih $\rightarrow$ Centang **"Select all"** $\rightarrow$ Klik **"Continue"**.
4. Salin kode `GOOGLE_MASTER_REFRESH_TOKEN` yang dihasilkan ke file `.env`.

### Tahap 3: Pembuatan Modul `Google_Master_Client.js`
1. Bangun `src/infrastructure/Google_Master_Client.js`.
2. Sediakan method `getGmail()`, `getTasks()`, `getCalendar()`, `getDrive()`, `getDocs()`, `getSheets()`, `getContacts()`.

### Tahap 4: Refactoring Modular Codebase
1. Refactor `src/infrastructure/Gmail_Client.js` agar menggunakan `Google_Master_Client`.
2. Refactor `src/infrastructure/Google_Tasks.js` agar menggunakan `Google_Master_Client`.
3. Refactor `src/infrastructure/Google_Workspace.js` agar menggantikan pemanggilan Service Account dengan `Google_Master_Client`.

### Tahap 5: Deployment & Uji Operasional di Azure VPS
1. Push commit ke GitHub `main`.
2. SSH ke Azure VPS (`48.193.41.76`), jalankan `git pull`, update `.env`, dan `pm2 restart nexa-server`.
3. Lakukan pengujian integrasi live (baca Gmail, tambah task, buat event, dan simpan dokumen Vault).

---

## 8. Rancangan Skrip Generator Token Interaktif

File: `scripts/generate_google_master_token.js`
```javascript
const { google } = require('googleapis');
const http = require('http');
const url = require('url');
const destroyer = require('server-destroy');

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
    console.error('❌ Gunakan: node scripts/generate_google_master_token.js <CLIENT_ID> <CLIENT_SECRET>');
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

  console.log('\n══════════════════════════════════════════════════════════════');
  console.log('🔑 BUKA URL INI DI BROWSER UNTUK MEMBERIKAN IZIN MASTER:');
  console.log('══════════════════════════════════════════════════════════════\n');
  console.log(authUrl);
  console.log('\n══════════════════════════════════════════════════════════════\n');

  const server = http.createServer(async (req, res) => {
    if (req.url.startsWith('/oauth2callback')) {
      const qs = new url.URL(req.url, 'http://localhost:3000').searchParams;
      const code = qs.get('code');
      res.end('<h1>✅ Otorisasi Berhasil!</h1><p>Silakan kembali ke terminal.</p>');
      server.destroy();

      const { tokens } = await oauth2Client.getToken(code);
      console.log('🎉 MASTER REFRESH TOKEN BERHASIL DIPEROLEH:\n');
      console.log(`GOOGLE_MASTER_REFRESH_TOKEN=${tokens.refresh_token}\n`);
      console.log('Salin baris di atas ke file .env Anda di Azure VPS.');
    }
  }).listen(3000, () => console.log('⏳ Menunggu otorisasi browser di http://localhost:3000...'));
  destroyer(server);
}

main().catch(console.error);
```

---

## 9. Strategi Pengujian & Verifikasi Kesiapan

1. **Uji Validasi Identitas & Email:**
   * Verifikasi pemanggilan `oauth2Client.getTokenInfo()`.
2. **Uji Full Access Tasks:**
   * Buat tugas baru via script $\rightarrow$ Periksa aplikasi Google Tasks di HP Samsung A33 Tuan.
3. **Uji Full Access Gmail:**
   * Jalankan `pollFinanceEmails()` $\rightarrow$ Verifikasi pembacaan struk tanpa error 403.
4. **Uji Full Access Drive & Docs:**
   * Buat file draf baru $\rightarrow$ Verifikasi file muncul langsung di Google Drive utama Tuan tanpa butuh sharing.

---

> **Kesimpulan:** Arsitektur *Unified Google Master OAuth 2.0* memberikan kedaulatan penuh, kecepatan eksekusi tinggi, eliminasi ketergantungan pada akun robot rapuh, serta menyederhanakan pemeliharaan server N.E.X.A untuk masa depan yang tahan banting. 🚀🛡️
