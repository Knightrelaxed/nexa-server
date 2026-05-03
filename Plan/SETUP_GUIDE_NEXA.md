# 🚀 PANDUAN DEPLOYMENT & SETUP N.E.X.A
**Dokumen Khusus Tuan Faqih (Confidential)**

Dokumen ini berisi langkah-langkah teknis berurutan yang harus Anda lakukan di dunia nyata untuk menghidupkan dan menyambungkan N.E.X.A ke seluruh layanan cloud. Seluruh kode program sudah disempurnakan dan 100% siap. Anda hanya perlu mengikuti instruksi penyambungan layanan di bawah ini.

---

## TAHAP 1: PERSIAPAN AKUN & API KEYS

Sebelum menyalakan server, Anda harus mengumpulkan "kunci" (API Keys) dari berbagai layanan gratis berikut. Simpan semua kunci ini sementara di *Notepad* Anda.

1. **Google AI Studio (Gemini)**
   * Daftar/Masuk ke Google AI Studio.
   * Buat API Key untuk Gemini 2.5 Flash.
   * Simpan sebagai `GEMINI_API_KEY_PRIMARY`. (Buat 1 akun Google lagi jika ingin menyetel `GEMINI_API_KEY_BACKUP`).
2. **Groq (Transkripsi Suara Whisper)**
   * Masuk ke console.groq.com.
   * Buat API Key baru. Simpan sebagai `GROQ_API_KEY`.
3. **NewsData.io (Pengganti NewsAPI yang Terblokir)**
   * Masuk ke [newsdata.io](https://newsdata.io) (menggunakan paket gratis).
   * Ambil API Key-nya. Simpan sebagai `NEWS_API_KEY`.
4. **WeatherAPI (Cuaca)**
   * Masuk ke weatherapi.com, daftar paket gratis.
   * Ambil API Key-nya. Simpan sebagai `WEATHER_API_KEY`.
5. **Telegram Bot Father**
   * Cari bot `@BotFather` di Telegram. Buat bot baru (misal: `NEXA_Bot`).
   * Salin Token yang diberikan. Simpan sebagai `TELEGRAM_BOT_TOKEN`.
   * **Untuk `TELEGRAM_CHAT_ID`:** Kirim pesan apa saja ke bot Anda, lalu buka `https://api.telegram.org/bot<TOKEN_ANDA>/getUpdates` di browser untuk melihat kumpulan angka Chat ID Anda.
6. **Supabase (Memori & Database)**
   * Buat *Project* gratis di Supabase.
   * Masuk ke Settings > API.
   * Salin Project URL sebagai `SUPABASE_URL`.
   * Salin `anon` / `service_role` key sebagai `SUPABASE_KEY`.
   * *(Anda juga harus membuat tabel `nexa_chat_memories`, `nexa_finance_dedup`, dan `nexa_2nd_brain` melalui SQL Editor di Supabase).*

---

## TAHAP 2: KONFIGURASI GOOGLE WORKSPACE (AKUN ROBOT)

N.E.X.A menggunakan **Service Account** (Akun Robot/Server) agar dapat menyala 24/7 tanpa perlu Anda login terus menerus. 

### A. Membuat Service Account
1. Buka **Google Cloud Console** (console.cloud.google.com).
2. Buat Project baru bernama "NEXA Core".
3. Cari menu **APIs & Services** > **Enabled APIs & Services**. Aktifkan 4 API ini:
   * Google Sheets API
   * Google Calendar API
   * Google Drive API
   * Google Docs API
4. Masuk ke menu **Credentials**, klik **Create Credentials** > **Service Account**.
5. Beri nama (misal: `nexa-bot`). Anda akan mendapatkan email robot seperti: `nexa-bot@nexa-core-123.iam.gserviceaccount.com`. Salin email ini!
6. Klik Service Account tersebut, pergi ke tab **Keys** > **Add Key** > **Create New Key** (Pilih JSON).
7. File JSON akan terunduh. Buka file tersebut menggunakan *Notepad*.
   * Masukkan isi `client_email` ke variabel `GOOGLE_SERVICE_ACCOUNT_EMAIL`.
   * Masukkan isi `private_key` (seluruh teks panjang yang diawali `-----BEGIN PRIVATE KEY-----`) ke variabel `GOOGLE_PRIVATE_KEY`.

### B. Memberi Izin (Share) Kalender & Keuangan
Karena N.E.X.A memiliki email sendiri, Anda harus memberikan dia izin masuk ke file pribadi Anda.
1. **Keuangan (Google Sheets):**
   * Buat Google Sheet kosong di akun pribadi Anda (untuk mencatat uang).
   * Klik tombol **Share**, masukkan email robot N.E.X.A (yang berakhiran `.iam.gserviceaccount.com`), jadikan sebagai **Editor**.
   * Lihat URL Google Sheet-nya. Salin ID acak panjang yang ada di tengah URL. Masukkan ke `GOOGLE_SHEET_ID`.
2. **Jadwal (Google Calendar):**
   * Buka kalender pribadi Anda (atau buat kalender sekunder khusus).
   * Masuk ke **Settings and sharing** pada kalender tersebut.
   * Tambahkan orang, masukkan email robot N.E.X.A, berikan izin **"Make changes to events"**.
   * Gulir ke bawah ke bagian *Integrate calendar*, salin *Calendar ID* (biasanya alamat email Anda sendiri jika itu kalender utama). Masukkan ke `GOOGLE_CALENDAR_ID`.

### C. Menyiapkan Folder "Ide (2nd Brain)" di Google Drive
Langkah ini agar setiap ide pemikiran yang diketikkan N.E.X.A menjadi *Google Docs* akan otomatis terlempar masuk ke dalam Google Drive Pribadi Anda.
1. Buka Google Drive pribadi Anda.
2. Buat folder baru, beri nama (misal: `Ide N.E.X.A`).
3. Klik kanan folder tersebut > **Share** (Bagikan).
4. Masukkan **email robot N.E.X.A** (sama seperti di atas), lalu jadikan **Editor**.
5. Masuk ke dalam folder tersebut di dalam browser.
6. Lihat URL pada browser, contohnya: `https://drive.google.com/drive/folders/1aBcDeFgH_IjKlMnOpQrStUvWxYz`.
7. Salin kode acak di bagian belakang URL tersebut (`1aBcDeFgH_IjKlMnOpQrStUvWxYz`).
8. Simpan sebagai variabel `GOOGLE_DRIVE_FOLDER_ID`.

---

## TAHAP 3: DEPLOYMENT KE SERVER (HUGGING FACE SPACES)

Karena Koyeb sudah tidak memiliki *free tier* murni, kita menggunakan arsitektur **Immortality Protocol v3.0** di Hugging Face Spaces (Docker).

1. Push seluruh kode N.E.X.A ke repositori **GitHub** Anda (buat Private agar aman). Pastikan file `.env` tidak ikut ter-push!
2. Buat akun di **Hugging Face** (huggingface.co).
3. Buat **New Space** dengan konfigurasi:
   * **SDK:** Docker
   * **Template:** Blank
   * **Hardware:** CPU Basic (Free)
4. Sambungkan Space tersebut ke repositori GitHub N.E.X.A Anda.
5. **Memasukkan Environment Variables (SANGAT PENTING):**
   * Di dashboard Space, masuk ke **Settings > Variables and Secrets**.
   * Masukkan *SEMUA* kunci (API Key, Token, Email, ID Folder, `GOOGLE_PRIVATE_KEY` lengkap, dsb) dari `.env` lokal Anda sebagai Secret.
6. Tunggu proses **Building** selesai menjadi **Running**.
7. Salin URL publik server Anda (contoh: `https://<username>-nexa-server.hf.space`).

> **PANDUAN DETAIL:** Untuk detail langkah per langkah deployment, baca file **`Plan/DEPLOYMENT_GUIDE.md`**.

### Menyalakan Webhook Telegram
Agar Telegram mengirim pesan Anda ke server HF Space, jalankan *link* ini di browser Anda (Ganti `<TOKEN_BOT_ANDA>` dan `<HF_URL_ANDA>`):
`https://api.telegram.org/bot<TOKEN_BOT_ANDA>/setWebhook?url=<HF_URL_ANDA>/webhook/telegram`

---

## TAHAP 4: MENYAMBUNGKAN ANDROID (TASKER)

Tasker kini memiliki 6 Profil penting untuk menjalankan fungsi N.E.X.A, termasuk fungsi *Watchdog* untuk menjaga server tetap hidup.

1. Buka aplikasi **Tasker** di Android Anda.
2. Setup Profil **Keuangan Livin'**, **Screen-Time**, **God Mode Executor**, dan **Alarm Dismissed** sesuai panduan.
3. Setup **Watchdog Ping** (ping tiap 2 jam ke server) dan **Buffer Fallback** (mengamankan data saat server *cold start*).
4. Di setiap Task HTTP Request, pastikan menggunakan target URL: `<HF_URL_ANDA>/webhook/tasker`
5. Wajib masukkan header: `Authorization: Bearer <NEXA_GODMODE_SECRET_ANDA>`

> **PANDUAN DETAIL:** Untuk script dan prompt lengkap setup 6 Profil Tasker ini, **WAJIB** membaca file **`Plan/TASKER_AUTOMATION_GUIDE.md`**.

---
**SELESAI.** N.E.X.A kini sepenuhnya hidup di Hugging Face Spaces, mengawasi, dan melayani Anda 24 jam penuh di latar belakang dengan perlindungan Immortality Protocol! 🌐
