# 🤖 PANDUAN AUTOMASI TASKER N.E.X.A
**Platform Server:** Hugging Face Docker Space (`nexa-server`)  
**Versi Arsitektur:** Immortality Protocol v3.0

Dokumen ini adalah panduan lengkap untuk melakukan *setup* aplikasi **Tasker** di HP Android Anda. Tasker bertindak sebagai **"Mata, Telinga, Tangan, dan Jantung"** N.E.X.A di perangkat fisik Anda.

> [!IMPORTANT]
> **Ganti semua placeholder** `<HF_URL>` dengan URL HF Space Anda yang sesungguhnya.  
> Format URL: `https://<HF_USERNAME>-nexa-server.hf.space`  
> Ganti `<GODMODE_SECRET>` dengan nilai `NEXA_GODMODE_SECRET` dari file `.env` Anda: `nexa_godmode_secret_2026`

**Sebelum mulai, pastikan aplikasi berikut sudah terinstal:**
1. **Tasker** (Aplikasi Utama)
2. **AutoNotification** (Plugin gratis — untuk membaca notifikasi Livin' & Telegram)

---

## 📋 DAFTAR SEMUA PROFILE TASKER

| # | Profile | Pemicu | Fungsi |
|---|---|---|---|
| 1 | Sensor Keuangan Livin' | Notifikasi Livin' by Mandiri | Kirim data transaksi ke N.E.X.A |
| 2 | Buffer Fallback Keuangan | Sensor Keuangan gagal POST | Kirim via Telegram sebagai backup |
| 3 | Sensor Screen-Time | Buka TikTok/Instagram >30 menit | Trigger God Mode |
| 4 | God Mode Executor | Event ntfy pesan masuk | Matikan WiFi, Data, Kunci Layar |
| 5 | Alarm Dismissed Briefing | Alarm HP dimatikan | Request Morning Briefing ke N.E.X.A |
| 6 | Watchdog (Lapisan 3) | Setiap 2 jam | Cek kesehatan server, alert jika mati |

---

## 1. 💰 SENSOR KEUANGAN LIVIN' (Auto-Track Transaksi)

Membaca notifikasi transaksi Livin' by Mandiri dan mengirimkan datanya ke N.E.X.A secara real-time.

### A. Membuat Profile (Pemicu Notifikasi)
1. Buka Tasker → Tab **Profiles** → klik `+`
2. Pilih **Event** → **Plugin** → **AutoNotification** → **Intercept**
3. Klik ikon pensil (Configuration)
4. **Action Type:** `Created`
5. **Apps:** Pilih **Livin' by Mandiri**
6. **Text Filter:** `Berhasil` (atau `Rp` untuk lebih sensitif)
7. Simpan

### B. Membuat Task (Kirim ke N.E.X.A)
Buat Task baru: `Kirim Keuangan ke NEXA`

**Aksi 1: HTTP Request ke Server**
- **Method:** `POST`
- **URL:** `<HF_URL>/webhook/tasker`
- **Headers:**
  - `Authorization: Bearer <GODMODE_SECRET>`
  - `Content-Type: application/json`
- **Body:**
  ```json
  {
    "type": "FINANCE_PUSH",
    "data": {
      "nominal": "%antext",
      "merchant": "%antitle",
      "timestamp": "%TIMES"
    }
  }
  ```
  > `%antext` = isi teks notifikasi, `%antitle` = judul notifikasi, `%TIMES` = waktu ISO Tasker
- **Timeout:** 5 (detik)
- Simpan response code ke variabel: `%finance_http_code`

**Aksi 2: If (Fallback ke Buffer jika gagal)**
Tambahkan blok `If` setelah aksi HTTP:
- **Kondisi:** `%finance_http_code` **Isn't Set** OR `%finance_http_code` **!~** `200`
- **Aksi di dalam If:** Lihat **Profile #2 (Buffer Fallback)** di bawah

### C. Prompt Tasker AI Agent
> **"Buat Profile AutoNotification Intercept untuk mencegat notifikasi dari aplikasi Livin' by Mandiri yang berisi teks 'Berhasil'. Jika terpicu, buat Task dengan dua langkah: Langkah 1, kirim HTTP POST Request ke `<HF_URL>/webhook/tasker` dengan header `Authorization: Bearer <GODMODE_SECRET>` dan `Content-Type: application/json`, dengan body JSON `{"type": "FINANCE_PUSH", "data": {"nominal": "%antext", "merchant": "%antitle", "timestamp": "%TIMES"}}`, set timeout 5 detik, simpan HTTP response code ke variabel %finance_http_code. Langkah 2, tambahkan If kondisi: jika %finance_http_code tidak diset atau tidak sama dengan 200, maka kirim pesan HTTP POST ke Telegram API `https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/sendMessage` dengan body `{"chat_id": "<TELEGRAM_CHAT_ID>", "text": "[BUFFER] %antext | %antitle | %TIMES"}`."**

---

## 2. 📦 BUFFER FALLBACK KEUANGAN (Lapisan 4 — Black Box)

Jika server N.E.X.A sedang *cold start* dan tidak merespons dalam 5 detik, Tasker menggunakan jalur darurat via Telegram langsung. Server akan memproses pesan `[BUFFER]` ini saat sudah kembali hidup.

**Format pesan Buffer yang dikirim Tasker:**
```
[BUFFER] <nominal_dari_notifikasi> | <nama_merchant> | <timestamp_ISO>
```

**Task: Kirim Buffer via Telegram API**
- **Method:** `POST`
- **URL:** `https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/sendMessage`
- **Headers:** `Content-Type: application/json`
- **Body:**
  ```json
  {
    "chat_id": "6798861902",
    "text": "[BUFFER] %antext | %antitle | %TIMES"
  }
  ```

> Server N.E.X.A secara otomatis mendeteksi prefix `[BUFFER]`, mem-parsing nominal dan merchant, lalu mencatatnya ke Google Sheets dengan sistem deduplikasi aktif.

---

## 3. ⏱️ SENSOR SCREEN-TIME (Pengawas Disiplin)

Mendeteksi jika Anda membuka aplikasi hiburan terlalu lama dan melaporkan ke N.E.X.A untuk memicu God Mode.

### A. Membuat Profile
1. Buat Profile `+` → **Application**
2. Pilih: **TikTok**, **Instagram**, **YouTube** (semua aplikasi hiburan)
3. Simpan

### B. Membuat Task (Monitor & Eskalasi)
Buat Task: `Monitor Screen Time NEXA`

1. **Wait:** 30 menit
2. **Test App:** Cek apakah aplikasi tersebut masih di *foreground* → simpan ke `%app_active`
3. **If** `%app_active` **~** `true`:
   - **HTTP Request:**
     - **Method:** `POST`
     - **URL:** `<HF_URL>/webhook/tasker`
     - **Headers:** `Authorization: Bearer <GODMODE_SECRET>`, `Content-Type: application/json`
     - **Body:**
       ```json
       {
         "type": "SCREEN_TIME_VIOLATION",
         "data": {
           "app_name": "%app_foreground"
         }
       }
       ```

### C. Prompt Tasker AI Agent
> **"Buat Profile Application untuk TikTok, Instagram, dan YouTube. Jika dibuka, jalankan Task: tunggu 30 menit. Setelah 30 menit, cek apakah salah satu aplikasi tersebut masih aktif di foreground. Jika masih aktif, kirim HTTP POST ke `<HF_URL>/webhook/tasker` dengan header `Authorization: Bearer <GODMODE_SECRET>` dan body JSON `{"type": "SCREEN_TIME_VIOLATION", "data": {"app_name": "%app_foreground"}}`."**

---

## 4. 🔴 GOD MODE EXECUTOR (Algojo Disiplin via ntfy.sh)

Menerima push instan dari N.E.X.A via ntfy.sh dan mengeksekusi intervensi sistem Android secara paksa.

**Arsitektur (Immortality Protocol v3.0 - Direct Push):**
```
Server HF Space → POST ke https://ntfy.sh/<NTFY_TOPIC>
→ Aplikasi ntfy di HP menerima pesan secara instan (lewat Google FCM)
→ Tasker Event mendeteksi pesan ntfy
→ Tasker matikan WiFi + Data + Kunci Layar
```

### A. Persiapan Aplikasi ntfy
1. Install aplikasi **ntfy** dari Google Play Store.
2. Buka aplikasi, tap tanda `+` di kanan bawah (Subscribe to topic).
3. Masukkan topic rahasia Anda (sama persis dengan `NTFY_TOPIC` di `.env`, contoh: `nexa_godmode_faqih_x9k3m2`).
4. Tap tombol Subscribe. (Pastikan aplikasi ntfy berjalan dan tidak dibunuh oleh battery saver Android).

### B. Membuat Profile
1. Buat Profile `+` → **Event** → **Plugin** → **ntfy** → **Message received**
2. Klik ikon pensil (Configuration).
3. Biarkan kosong atau isi filter Topic sesuai `NTFY_TOPIC` Anda agar spesifik.
4. Simpan.

### C. Membuat Task (Eksekusi Paksa)
Buat Task: `Eksekusi God Mode NEXA`

1. **Net → WiFi** → Set: `Off`
2. **Net → Mobile Data** → Set: `Off` *(Butuh izin ADB `WRITE_SECURE_SETTINGS` — jika belum, Tasker akan memberi tahu)*
3. **App → Go Home** (Paksa kembali ke layar utama)
4. **Display → System Lock** (Kunci layar instan)
5. **Tasker → Flash** → Text: `GOD MODE EXECUTED. WAKTUMU BERHARGA!`

### D. Prompt Tasker AI Agent
> **"Buat Profile Event menggunakan Plugin ntfy (Message received). Jika terpicu, jalankan Task secara berurutan: matikan WiFi, matikan Mobile Data, jalankan aksi Go Home (kembali ke layar utama), jalankan aksi System Lock (kunci layar), lalu tampilkan pesan Flash 'GOD MODE EXECUTED. WAKTUMU BERHARGA!'."**

---

## 5. ⏰ ALARM DISMISSED — Morning Briefing Presisi

Memicu N.E.X.A untuk mengirim *Morning Briefing* tepat di detik Anda mematikan alarm pagi — bukan jam 05:30 buta, tapi **tepat saat Anda siap menerimanya**.

### A. Membuat Profile
1. Buat Profile `+` → **Event** → **Date/Time** → **Alarm Done** *(atau gunakan AutoNotification Intercept untuk notifikasi alarm)*
2. Alternatif: **Event → Phone → Call → Alarm Clock** setelah alarm dimatikan

### B. Membuat Task
Buat Task: `Minta Briefing ke NEXA`

- **HTTP Request:**
  - **Method:** `POST`
  - **URL:** `<HF_URL>/webhook/tasker`
  - **Headers:** `Authorization: Bearer <GODMODE_SECRET>`, `Content-Type: application/json`
  - **Body:**
    ```json
    {
      "type": "ALARM_DISMISSED",
      "data": {
        "timestamp": "%TIMES"
      }
    }
    ```

### C. Prompt Tasker AI Agent
> **"Buatkan Profile event Alarm Done. Jika terpicu (alarm HP dimatikan), jalankan Task HTTP POST Request ke `<HF_URL>/webhook/tasker` dengan header `Authorization: Bearer <GODMODE_SECRET>` dan `Content-Type: application/json`. Isi body JSON: `{"type": "ALARM_DISMISSED", "data": {"timestamp": "%TIMES"}}`."**

---

## 6. 🏥 WATCHDOG PING (Lapisan 3 — Dokter Jaga Android)

Mengirim sinyal kesehatan ke server N.E.X.A setiap 2 jam. Jika server tidak merespons, Tasker akan membangunkan server dan memberi notifikasi kepada Anda.

### A. Membuat Profile
1. Buat Profile `+` → **Time** → **Time** → Set: **Repeat every 2 hours**

### B. Membuat Task
Buat Task: `NEXA Watchdog Ping`

**Aksi 1: HTTP POST ke server**
- **Method:** `POST`
- **URL:** `<HF_URL>/webhook/tasker`
- **Headers:** `Authorization: Bearer <GODMODE_SECRET>`, `Content-Type: application/json`
- **Body:**
  ```json
  {
    "type": "WATCHDOG_PING",
    "data": {
      "source": "tasker_watchdog"
    }
  }
  ```
- **Timeout:** 10 detik
- Simpan HTTP code ke: `%watchdog_code`

**Aksi 2: If server mati (response bukan 200)**
- **If** `%watchdog_code` **!~** `200`:
  1. **HTTP GET** ke `<HF_URL>` (URL Space langsung, bukan /webhook) — ini membangunkan container
  2. **Wait:** 30 detik (tunggu cold start selesai)
  3. **Notify:** "⚠️ N.E.X.A Offline terdeteksi! Server sedang dibangunkan..."

### C. Prompt Tasker AI Agent
> **"Buat Profile Time dengan repeat setiap 2 jam. Jalankan Task: kirim HTTP POST ke `<HF_URL>/webhook/tasker` dengan header `Authorization: Bearer <GODMODE_SECRET>` dan body JSON `{"type": "WATCHDOG_PING", "data": {"source": "tasker_watchdog"}}`, timeout 10 detik, simpan HTTP response code ke %watchdog_code. Kemudian tambahkan If kondisi: jika %watchdog_code tidak sama dengan 200, maka: lakukan HTTP GET ke `<HF_URL>`, tunggu 30 detik, lalu tampilkan notifikasi 'N.E.X.A offline terdeteksi, server sedang dibangunkan'."**

---

## ⚙️ RINGKASAN VARIABEL YANG DIGUNAKAN

| Variabel | Nilai |
|---|---|
| `<HF_URL>` | URL HF Space Anda (didapat setelah deploy) |
| `<GODMODE_SECRET>` | `nexa_godmode_secret_2026` |
| `<TELEGRAM_BOT_TOKEN>` | `8646241333:AAE3dNr0fqAbgHiXgm_aIPBjhQmRlbWO0M8` |
| `<TELEGRAM_CHAT_ID>` | `6798861902` |

---

Dengan 6 Profile di atas, Android Anda adalah **kepanjangan tangan penuh** N.E.X.A — mulai dari sensor lapangan, jantung Immortality Protocol, hingga algojo disiplin tingkat sistem.
