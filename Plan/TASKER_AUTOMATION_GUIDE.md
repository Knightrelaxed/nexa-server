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

| # | Profile | Pemicu | Fungsi |
|---|---|---|---|
| 1 | Sensor Screen-Time | Buka TikTok/Instagram >30 menit | Trigger God Mode |
| 2 | God Mode Executor | Event ntfy pesan masuk | Matikan WiFi, Data, Kunci Layar |
| 3 | Alarm Dismissed Briefing | Alarm HP dimatikan | Request Morning Briefing ke N.E.X.A |

> **Catatan:** Automasi tracking keuangan (Livin') tidak lagi menggunakan Tasker karena *rawan data terpotong oleh limitasi notifikasi Android*. N.E.X.A kini **secara otomatis memindai Gmail Anda setiap 10 menit** untuk mengekstrak transaksi Livin' secara 100% akurat tanpa memerlukan campur tangan Tasker. Watchdog ping juga telah dihapus karena Hugging Face memiliki Uptime Robot tersendiri.

---

## 1. ⏱️ SENSOR SCREEN-TIME (Pengawas Disiplin)

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

## 2. 🔴 GOD MODE EXECUTOR (Algojo Disiplin via ntfy.sh)

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

## 3. ⏰ ALARM DISMISSED — Morning Briefing Presisi

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



## ⚙️ RINGKASAN VARIABEL YANG DIGUNAKAN

| Variabel | Nilai |
|---|---|
| `<HF_URL>` | URL HF Space Anda (didapat setelah deploy) |
| `<GODMODE_SECRET>` | `nexa_godmode_secret_2026` |
| `<TELEGRAM_BOT_TOKEN>` | `8646241333:AAE3dNr0fqAbgHiXgm_aIPBjhQmRlbWO0M8` |
| `<TELEGRAM_CHAT_ID>` | `6798861902` |

---

Dengan 3 Profile esensial di atas, Android Anda adalah **kepanjangan tangan penuh** N.E.X.A — mulai dari sensor lapangan, hingga algojo disiplin tingkat sistem.
