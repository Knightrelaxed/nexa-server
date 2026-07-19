# N.E.X.A — Immortality Protocol v3.1: Panduan Integrasi Tasker, ntfy, dan One UI 6

Dokumen ini adalah panduan teknis dan operasional lengkap untuk pengonfigurasian **Tasker**, **ntfy**, dan **Bot Telegram** pada perangkat fisik **Samsung Galaxy A33 5G (Android 14 / One UI 6)** yang terintegrasi langsung dengan server cloud N.E.X.A (`https://nexa-asistant-nexa-core-server.hf.space`).

---

## 🏗️ 1. Arsitektur & Alur Kerja (*Immortality Protocol v3.1*)

Sistem bekerja dalam siklus tertutup (*closed-loop feedback*) dengan 4 level eskalasi dinamis yang disesuaikan dengan *Behavior Engine* (analisis mood harian N.E.X.A):

```mermaid
sequenceDiagram
    autonumber
    actor User as Tuan Faqih (Samsung A33 5G)
    participant Tasker as Tasker & ntfy (Android 14)
    participant Server as N.E.X.A Cloud Server (HF Space)
    participant Telegram as Bot Telegram N.E.X.A

    Note over User,Tasker: Buka TikTok > 15 Menit
    Tasker->>Server: HTTP POST Webhook: SCREEN_TIME_VIOLATION
    Server->>Server: Cek Mood & Hitung Level Eskalasi (Level 1 / 2)
    
    alt Eskalasi Level 1 (Cognitive Reminder)
        Server->>Tasker: Push ntfy (Peringatan Fokus)
        Tasker->>User: Muncul Notifikasi & Getaran Peringatan
    else Eskalasi Level 2 (Interactive Friction)
        Server->>Tasker: Push ntfy: GO_HOME
        Tasker->>User: Bunyi Beep + Lempar ke Home Screen seketika (<0.5s)
        Server->>Telegram: Kirim 3 Tombol Pilihan Interaktif (Grace Period 3 Menit)
    end

    Note over User,Telegram: Masa Toleransi 3 Menit
    alt Tombol [ ✅ Ini Riset Penting ] ditekan
        Telegram->>Server: d:ok → Reset Level 0 (Normal)
    alt Tombol [ ⏰ +10 Menit ] ditekan (Maks 2x/hari)
        Telegram->>Server: d:ext → Perpanjang masa aktif +10 menit
    alt Abaikan / Tombol [ ❌ Saya Menunda ] ditekan
        Server->>Server: Cron Watchdog Aktifkan Level 3 / Level 4
        Server->>Tasker: Push ntfy: DISABLE_WIFI / LOCK_SCREEN / FORCE_STOP_APP
        Tasker->>User: System Lock + Matikan Wi-Fi + Tutup Paksa Aplikasi
    end
```

---

## ⚙️ 2. Konfigurasi Sistem Khusus Samsung Galaxy A33 5G (One UI 6)

Sistem One UI 6 memiliki penghemat baterai agresif dan pemetaan variabel notifikasi khusus yang wajib disetel agar sistem bekerja 100% tanpa hambatan:

### A. Pengaturan Baterai Tidak Dibatasi (*Unrestricted Battery*)
Wajib diberlakukan pada aplikasi **ntfy** dan **Tasker** agar tidak dimatikan saat layar ponsel mati (*Doze Mode*):
1. Buka **Pengaturan Ponsel (Settings)** ➡️ **Aplikasi (Apps)**.
2. Cari aplikasi **ntfy** ➡️ pilih menu **Baterai (Battery)** ➡️ pilih **Tidak Dibatasi (Unrestricted)**.
3. Ulangi langkah yang sama untuk aplikasi **Tasker**.

### B. Izin Akses Notifikasi Khusus (*Notification Access*)
Agar Tasker dapat membaca notifikasi masuk dari `ntfy` dan memicu aksi seketika:
1. Buka **Pengaturan Ponsel (Settings)** ➡️ **Aplikasi (Apps)**.
2. Tekan **ikon 3 titik (⋮)** di pojok kanan atas ➡️ pilih **Akses Khusus (Special access)**.
3. Pilih **Akses Notifikasi (Notification access)**.
4. Aktifkan saklar **Tasker** (Toggle ON) dan berikan izin penuh.

### C. Konfigurasi Aplikasi `ntfy`
1. Subscribe ke topik rahasia N.E.X.A: `nexa_godmode_x9k3m2`
2. **(PENTING)** Saat subscribe atau di pengaturan topik, centang opsi:
   `[ ✔ ] Instant delivery in doze mode ⚡`
   *(Menjamin latensi pengiriman < 0.5 detik bahkan saat ponsel dalam keadaan idle deep-sleep).*

---

## 🚨 3. Penemuan Teknis Kritis: Pemetaan Variabel Notifikasi One UI 6

Saat melakukan *Scientific Debugging* melalui aksi pop-up Flash, ditemukan perbedaan mendasar cara Tasker pada Android 14 / One UI 6 memetakan data notifikasi yang masuk dari event `Notification`:

| Variabel Tasker Standar | Status di Android 14 (One UI 6) | Keterangan & Isi Aktual |
| :--- | :--- | :--- |
| `%ntext` | **KOSONG / TIDAK DIKENALI** | Jika dipakai dalam rumus `If`, akan selalu bernilai *False*. |
| `%evtprm1` | **Aktif** | Berisi nama paket aplikasi pengirim (`io.heckel.ntfy`). |
| `%evtprm2` | **Aktif** | Berisi **Judul Notifikasi** (`N.E.X.A Intervention`, dll). |
| **`%evtprm3`** | **Aktif (VARIABEL UTAMA)** | Berisi **Teks Perintah Eksekusi** (`GO_HOME`, `DISABLE_WIFI`, `LOCK_SCREEN`, `FORCE_STOP_APP`). |

> [!IMPORTANT]
> Seluruh pengecekan kondisi `If` di dalam Tasker eksekutor **wajib menggunakan variabel `%evtprm3`**, bukan `%ntext`.

---

## 📱 4. Struktur Profile & Task di dalam Tasker

### A. Task 1: `NEXA_Executor` (Eksekutor Perintah dari ntfy)
Bertugas menjalankan hukuman fisik di ponsel begitu menerima sinyal ntfy yang menggunakan format protokol `COMMAND|SPOKEN_TEXT` (`%evtprm3`):

*   **1. Variable Split** (`Name %evtprm3 Splitter |`)
    *(Memecah data ntfy: `%evtprm31` = Kode Perintah, `%evtprm32` = Teks Suara Dinamis dari AI)*
*   **2. If** `%evtprm32 Set`
    *   **3. Say** (`Text %evtprm32 Engine:Voice default:id-ID Stream Alarm Continue Task Immediately [ ]`)
    *(Mengucapkan nasihat dinamis dari cloud secara utuh dan lantang hingga selesai sebelum eksekusi penguncian)*
*   **4. End If**
*   **5. If** `%evtprm31 ~ *GO_HOME* | %evtprm2 ~ *Intervention*`
    *   **6. Go Home** (`Page 0`)
*   **7. End If**
*   **8. If** `%evtprm31 ~ *DISABLE_WIFI*/*LOCK_SCREEN*`
    *   **9. Airplane Mode** (`Set On`) *ATAU* **Mobile Data (`Set Off`) + Custom Setting (`Global: wifi_on = 0`)**
    *   **10. System Lock** (`Membutuhkan izin Admin Perangkat / Device Admin`)
*   **11. End If**
*   **12. If** `%evtprm31 ~ *FORCE_STOP_APP*`
    *   **13. Variable Split** (`Name %evtprm31 Splitter :`)
    *   **14. Kill App** (`Use Root Off`)
    *   **15. If** `%err Set`
        *   **16. Flash** (`Text Aplikasi ditutup paksa oleh N.E.X.A`)
    *   **17. End If**
*   **18. End If**

**Profile 1 (`Ntfy Enforcement`):**
*   **Trigger**: Event ➡️ UI ➡️ Notification
*   **Owner Application**: `ntfy` *(Pilih langsung dari ikon 9 kotak)*
*   **Title**: *(Dapat dikosongkan agar semua perintah ntfy masuk, atau ketik: `*N.E.X.A*/*Intervention*/*GOD MODE*/*Surgical*`)*
*   **Action**: Jalankan task `NEXA_Executor`

---

### B. Task 2: `Send_Screen_Violation` (Pelaporan Pelanggaran Waktu Layar Multi-Aplikasi)
Bertugas memonitor durasi penggunaan aplikasi hiburan (`TikTok`, `Instagram`, `eFootball`, dll) dan mengirim Webhook ke server N.E.X.A saat waktu layar melebihi batas.

Susunan Task yang bersih, rapi, dan stabil (3 Langkah):
*   **1. Wait** `15 Mins` *(Atau `59 Mins, 59 Seconds` / sesuai batas waktu layar yang Anda tetapkan)*
*   **2. HTTP Request**
    *   **Method**: `POST`
    *   **URL**: `https://nexa-asistant-nexa-core-server.hf.space/webhook/tasker`
    *   **Headers**:
        ```text
        Authorization: Bearer Uo3BFTgX2TBPGca7lnTOGrvsU7ed_hPY
        Content-Type: application/json
        ```
    *   **Body (JSON)**:
        ```json
        {
          "type": "SCREEN_TIME_VIOLATION",
          "data": {
            "app_name": "Aplikasi Hiburan",
            "duration_minutes": 15
          }
        }
        ```
*   **3. Flash** (`Text N.E.X.A: Pelanggaran waktu layar TikTok (15+ menit) telah dilaporkan ke server.`, `Long`: centang, `Tasker Layout`: centang)

**Profile 2 (`Screen TimeApps Monitor`):**
*   **Trigger**: Application ➡️ Pilih aplikasi hiburan/game Anda (`TikTok, eFootball™, Instagram...`)
*   **Entry Task (`➡️`)**: Jalankan task **`Send_Screen_Violation`**
*   **Exit Task (`⬅️` - Sangat Penting agar Timer Batal jika Keluar Aplikasi Sebelum Waktu Habis):**
    *   Tekan tahan nama task `Send_Screen_Violation` di kanan Profile ini ➡️ pilih **`Add Exit Task`** ➡️ `New Task` (`Stop_Violation`) ➡️ pilih aksi **`Task` ➡️ `Stop`** ➡️ ketik/pilih **`Send_Screen_Violation`**.
    *   *(Dengan Exit Task ini, jika Anda keluar dari Instagram sebelum 15 menit/1 jam, penghitungan mundur otomatis dibatalkan, sehingga laporan tidak dikirim saat Anda sudah di luar aplikasi).*

---

## 🤖 5. Prompt Generator untuk Tasker AI (Gemini Built-in)

Jika sewaktu-waktu Anda perlu menyusun ulang Profile dan Task menggunakan fitur AI di dalam aplikasi Tasker, salin-tempel prompt berbahasa Inggris berikut:

### Prompt 1 (Untuk Eksekutor ntfy — `%evtprm3`):
```text
Create a Tasker Profile and Task to act as an automated system enforcement executor and voice assistant based on incoming push notifications from ntfy on a Samsung Galaxy A33 5G (Android 14 / One UI 6).

Profile Requirements:
- Trigger Type: Event -> UI -> Notification.
- Owner Application: ntfy (io.heckel.ntfy).

Task Requirements (Name the task "NEXA_Executor"):
CRITICAL INSTRUCTION: On One UI 6, notification body text is stored in %evtprm3 and title is stored in %evtprm2 (%ntext is empty). N.E.X.A sends payloads in format "COMMAND|SPOKEN_TEXT".
1. First action: Variable Split %evtprm3 with splitter "|". This splits the payload into %evtprm31 (Command Code) and %evtprm32 (Dynamic AI Speech Text).
2. Check if %evtprm32 is Set. If true:
   - Execute action: Alert -> Say (Text: %evtprm32, Engine:Voice: default:id-ID, Stream: Media, Continue Task Immediately: CHECKED). This speaks the AI advice right while running physical actions.
3. Check if %evtprm31 contains "GO_HOME" or if %evtprm2 contains "Intervention". If true:
   - Execute action: App -> Go Home (Page 0).
4. Check if %evtprm31 contains "DISABLE_WIFI" or "LOCK_SCREEN". If true:
   - Execute action: Net -> Wi-Fi -> Set Off.
   - Execute action: Display -> System Lock.
5. Check if %evtprm31 contains "FORCE_STOP_APP". If true:
   - Variable Split %evtprm31 with splitter ":".
   - Execute action: App -> Kill App (Use Root Off).

Important Constraint: Never disable Mobile Data (cellular data) so emergency communication channels remain open.
```

### Prompt 2 (Untuk Pelaporan Webhook TikTok):
```text
Create a Tasker Profile and Task that monitors screen time for TikTok and sends an HTTP POST Webhook alert directly to the N.E.X.A cloud server if the app is used continuously for more than 15 minutes on Android 14.

Profile Requirements:
- Trigger Type: Application -> Select "TikTok" (com.zhiliaoapp.musically).

Task Requirements (Name the task "Send_TikTok_Violation"):
1. Execute action: Task -> Wait for 15 minutes.
2. After the wait, verify if the current active front application is still TikTok using App -> Test App (Type: This Package, Store Result In %IsTikTokActive).
3. If %IsTikTokActive = 1 (or true), execute action: Net -> HTTP Request:
   - Method: POST
   - URL: https://nexa-asistant-nexa-core-server.hf.space/webhook/tasker
   - Headers:
     Authorization: Bearer Uo3BFTgX2TBPGca7InTOGrvsU7ed_hPY
     Content-Type: application/json
   - Body (JSON exactly):
     {
       "type": "SCREEN_TIME_VIOLATION",
       "data": {
         "app_name": "TikTok",
         "duration_minutes": 15
       }
     }
4. Execute action: Alert -> Flash with text "N.E.X.A: Pelanggaran waktu layar dilaporkan ke server."
```

---

## 🧪 6. Panduan Pengujian & Prosedur Debugging

### A. Pengujian Tembakan Live dari Terminal / Cloud
Untuk mengetes apakah ponsel berespons terhadap perintah dari server tanpa harus menunggu 15 menit, jalankan perintah `curl` berikut melalui terminal PowerShell / Bash:

```bash
# Tes Level 2 (Beep & Go Home)
curl.exe -d "GO_HOME" -H "Title: N.E.X.A Intervention" https://ntfy.sh/nexa_godmode_x9k3m2

# Tes Level 4 (System Lock & Matikan Wi-Fi)
curl.exe -d "LOCK_SCREEN" -H "Title: 🔴 SURGICAL GOD MODE MUTLAK" https://ntfy.sh/nexa_godmode_x9k3m2
```

### B. Teknik Scientific Debugging (*Intip Variabel*)
Jika sewaktu-waktu Tasker tidak merespons notifikasi baru, tambahkan aksi **Flash** di urutan paling atas (Nomor 1) pada Task `NEXA_Executor` dengan teks:
`Text: [%ntext] | Prm2: [%evtprm2] | Prm3: [%evtprm3]`

Dengan aksi ini, setiap kali notifikasi masuk, layar ponsel akan langsung memunculkan isi asli dari variabel yang ditangkap Tasker sehingga kesalahan pemetaan variabel dapat ditemukan dalam hitungan detik.
