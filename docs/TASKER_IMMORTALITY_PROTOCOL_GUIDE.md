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
*   **2. Say** (`Text %evtprm32 Engine:Voice com.google.android.tts:id-ID`)
    *(Mengucapkan nasihat dinamis dari cloud secara utuh melalui mesin TTS)*
*   **3. If** `%evtprm31 ~ *GO_HOME*/*Intervention* | %evtprm3 ~ *GO_HOME*`
    *   **4. Go Home** (`Page 0`)
    *   **5. Beep** (`Frequency 8000 Duration 1000`)
*   **6. End If**
*   **7. If** `%evtprm31 ~ *DISABLE_WIFI*/*LOCK_SCREEN*`
    *   **8. Airplane Mode** (`Set On`)
    *   **9. System Lock** (`Membutuhkan izin Admin Perangkat / Device Admin`)
*   **10. End If**
*   **11. If** `%evtprm3 ~ *FORCE_STOP_APP*`
    *   **12. Custom Setting**
        *   **Type**: `Secure`
        *   **Name**: `accessibility_display_daltonizer_enabled`
        *   **Value**: `1`
        *(Mengubah layar Samsung One UI 6 seketika menjadi Hitam Putih / Grayscale tanpa perlu Root)*
    *   **13. Variable Split** (`Name %evtprm3 Splitter :`)
    *   **14. Kill App** (`Use Root Off`)
    *   **15. If** `%err Set`
        *   **16. Flash** (`Text: Aplikasi ditutup paksa oleh N.E.X.A`, `Long`: centang, `Tasker Layout`: centang)
    *   **17. End If**
*   **18. End If**

**Profile (`Ntfy Enforcement`):**
*   **Trigger**: Event ➡️ UI ➡️ Notification (`Notification ntfy, New Only`)
*   **Owner Application**: `ntfy` *(io.heckel.ntfy)*
*   **Title, Text, Subtext, Messages, dll**: Kosongkan / Optional *(Agar seluruh notifikasi perintah baru dari ntfy pasti tertangkap sempurna)*
*   **Entry Task (`➡️`)**: Jalankan task **`NEXA_Executor`**

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

## 🔄 5. Master Skenario & Alur Kerja Bidireksional (`Tasker` ↔ `N.E.X.A Server` ↔ `ntfy` ↔ `Telegram`)

Sistem bekerja dalam ekosistem dua arah (*bidirectional*) yang sangat ketat dan konsisten. Berikut adalah pemetaan seluruh kondisi, skenario, dan respons fisik yang terjadi secara nyata pada perangkat Samsung A33 5G dan server cloud:

### A. Kondisi 0: Penggunaan Aplikasi Normal & Pembatalan Timer (`Exit Task`)
*   **Aktivitas**: Anda membuka aplikasi hiburan (`TikTok / Instagram / eFootball`). Profile `Screen TimeApps Monitor` aktif dan menjalankan `Send_Screen_Violation` (memulai hitungan mundur `Wait 15 Mins / 1 Jam`).
*   **Skenario A1 (Sadar Sebelum Waktu Habis)**: Anda menutup aplikasi setelah 10 menit (kembali ke Home Screen / ganti aplikasi kerja).
    *   **Respons Tasker**: Profile `Screen TimeApps Monitor` memicu `Add Exit Task` (`Stop_Violation` -> `Stop Task: Send_Screen_Violation`).
    *   **Hasil**: Hitungan mundur langsung dimatikan total di latar belakang. Webhook **TIDAK DIKIRIM** ke server karena belum terjadi pelanggaran.
*   **Skenario A2 (Pelanggaran Waktu Terpenuhi)**: Anda tetap nongkrong di aplikasi sampai tepat waktu `Wait` habis.
    *   **Respons Tasker**: Aksi 2 `HTTP Request POST` mengirim payload `SCREEN_TIME_VIOLATION` ke server N.E.X.A (`/webhook/tasker`), lalu memunculkan `Flash` konfirmasi.

---

### B. Kondisi 1: Pelanggaran Pertama — `Level 1` (`COGNITIVE REMINDER`)
*Dipicu seketika oleh Server saat menerima tembakan Webhook pertama (`current_level = 0` -> `nextLevel = 1`).*
*   **Tindakan Server**:
    *   Menghitung batas toleransi dari *Behavior Engine* (analisis mood & tingkat kelelahan Anda hari ini).
    *   Menghasilkan kalimat nasihat lisan AI (maksimal 2 kalimat menusuk kesadaran via `AI_Router`).
    *   Mengirim sinyal `ntfy` ke topik ponsel dengan format `SPEAK_ONLY|Tuan Faqih, Anda telah membuka...`.
    *   Mengirim pesan chat peringatan teks ke Bot Telegram N.E.X.A.
*   **Tindakan Tasker (`NEXA_Executor`) di HP Samsung**:
    *   Menangkap notifikasi `ntfy` (`Notification ntfy, New Only`).
    *   Aksi 1 (`Variable Split %evtprm3`) memecah data menjadi `%evtprm31` (`SPEAK_ONLY`) dan `%evtprm32` (nasihat AI).
    *   Aksi 2 (`Say`) membacakan suara AI dengan lantang menggunakan TTS Google (`com.google.android.tts:id-ID`).
*   **Status Akhir Level 1**: Anda hanya diperingatkan secara lisan dan visual. **Belum ada pelemparan ke Home Screen dan belum ada tombol Telegram interaktif.**

---

### C. Kondisi 2: Pelanggaran Kedua — `Level 2` (`INTERACTIVE FRICTION` & Tombol Telegram)
*Dipicu jika Anda mengabaikan peringatan Level 1 dan tetap melanjutkan aplikasi hiburan sampai tembakan Webhook kedua masuk (`nextLevel = 2`).*
*   **Tindakan Server**:
    *   Mengirim sinyal `ntfy` dengan format `GO_HOME|Tuan Faqih, sesi aplikasi melebihi batas. Layar dikembalikan ke Home...`.
    *   Mengirim pesan chat ke Telegram yang dilengkapi **3 Tombol Konfirmasi (`Inline Keyboard`)**:
        *   `[ ✅ Ini Riset Penting ]`
        *   `[ ❌ Saya Menunda ]`
        *   `[ ⏰ +10 Menit ]`
    *   Mengaktifkan masa tunggu (*Grace Period / Pending Callback*) di database Supabase selama **3 Menit** (`callback_expires_at`).
*   **Tindakan Tasker (`NEXA_Executor`) di HP Samsung**:
    *   Aksi 2 (`Say`) membacakan teguran lisan AI.
    *   Aksi 3 - 6 (`If %evtprm31 ~ *GO_HOME* OR %evtprm3 ~ *GO_HOME*`) memicu **`Go Home` (Page 0)** dan bunyi **`Beep` (8000Hz, 1s)**.
*   **Status Akhir Level 2**: Layar ponsel Anda dilempar paksa ke Home Screen seketika (<0.5 detik). Anda diwajibkan mengonfirmasi alasan Anda di Telegram dalam rentang waktu 3 menit.

---

### D. Kondisi 3: Interaksi Tombol Telegram di `Level 2` (`Feedback Loop`)
Selama masa tunggu 3 menit di Level 2, nasib eskalasi bergantung pada respons tombol yang Anda pilih:
*   **Skenario D1 — Tombol `[ ✅ Ini Riset Penting ]` Ditekan**:
    *   **Proses**: Bot Telegram menembak callback `d:ok:session_key` ke server.
    *   **Respons Server**: Server memverifikasi bahwa aplikasi tersebut memang dibutuhkan untuk riset/kerja saat itu. Status pelanggaran direset kembali ke `Level 0` (`current_level = 0, pending_callback = false`).
    *   **Hasil**: Anda dibebaskan dari pemantauan sementara, dapat membuka kembali aplikasi tanpa dilempar atau dihukum.
*   **Skenario D2 — Tombol `[ ⏰ +10 Menit ]` Ditekan**:
    *   **Proses**: Bot Telegram menembak callback `d:ext:session_key`.
    *   **Respons Server**: Server memberikan perpanjangan waktu sementara +10 menit (maksimal 2x per hari).
    *   **Hasil**: Eskalasi ditunda selama 10 menit ke depan.
*   **Skenario D3 — Tombol `[ ❌ Saya Menunda ]` Ditekan ATAU Diabaikan (> 3 Menit)**:
    *   **Proses**: Jika Anda mengaku menunda (`d:no`), atau jika Cron latar belakang server (`Discipline Auto-Escalation` - berjalan setiap 1 menit) mendeteksi masa tunggu 3 menit telah habis tanpa jawaban (`callback_expires_at < now`), maka **Server langsung menaikkan status Anda ke `Level 3` (`SURGICAL_RESTRICTION`)!**

---

### E. Kondisi 4: Eskalasi Bedah Paksa — `Level 3` (`SURGICAL RESTRICTION` - Grayscale Hitam Putih)
*Dipicu otomatis oleh Cron Server (`Discipline Auto-Escalation`) saat tombol Level 2 diabaikan.*
*   **Tindakan Server**:
    *   Mengirim sinyal `ntfy` dengan format `FORCE_STOP_APP|Tuan Faqih, pemaksaan bedah level tiga aktif. Aplikasi ditutup paksa. Mode grayscale diaktifkan...`.
    *   Mencatat audit log ke Telegram (*Surgical Force Level 3 Aktif*).
*   **Tindakan Tasker (`NEXA_Executor`) di HP Samsung**:
    *   Aksi 2 (`Say`) membacakan pengumuman bedah paksa.
    *   Aksi 11 (`If %evtprm3 ~ *FORCE_STOP_APP*`) aktif memicu 3 langkah penindakan ganda:
        1.  **Aksi 12 (`Custom Setting`)**: Mengubah `Secure` setting `accessibility_display_daltonizer_enabled` menjadi `1`. **Layar Samsung One UI 6 seketika berubah menjadi Hitam Putih (`Grayscale`) tanpa Root.**
        2.  **Aksi 13 & 14 (`Split & Kill App`)**: Menutup paksa proses aplikasi hiburan yang sedang berjalan (`Use Root Off`).
        3.  **Aksi 16 (`Flash`)**: Menampilkan notifikasi `Aplikasi ditutup paksa oleh N.E.X.A` sebagai umpan balik sistem.
*   **Status Akhir Level 3**: Aplikasi tertutup paksa dan layar HP menjadi hitam putih total, mematikan seluruh rangsangan visual/dopamin dari aplikasi hiburan selama 30 menit.

---

### F. Kondisi 5: Isolasi Mutlak — `Level 4` (`SURGICAL GOD MODE ULTIMATE`)
*Dipicu jika Anda tetap berusaha membobol atau membuka kembali aplikasi hiburan setelah Level 3, hingga mencapai batas atas toleransi mood hari itu (`max_level_cap`).*
*   **Tindakan Server**:
    *   Mengirim sinyal `ntfy` dengan format `DISABLE_WIFI_AND_LOCK_SCREEN|Tuan Faqih, surgical god mode level empat aktif. Mode pesawat dinyalakan dan layar dikunci...`.
*   **Tindakan Tasker (`NEXA_Executor`) di HP Samsung**:
    *   Aksi 7 - 10 (`If %evtprm31 ~ *DISABLE_WIFI*/*LOCK_SCREEN*`) aktif memicu:
        1.  **Aksi 8 (`Airplane Mode Set On`)**: Mengaktifkan Mode Pesawat untuk memotong seluruh koneksi internet Wi-Fi maupun Kuota Seluler selama 45 menit.
        2.  **Aksi 9 (`System Lock`)**: Mengunci layar ponsel fisik secara otomatis (membutuhkan izin *Device Admin*).
*   **Status Akhir Level 4**: Ponsel terisolasi total dan terkunci rapat, memaksa Anda untuk kembali duduk di meja kerja menyelesaikan prioritas utama.

---

### G. Kondisi 6: Pemulihan Warna & Normalisasi (`Restoref_Color`)
Setelah masa hukuman Level 3 selesai atau saat Anda ingin mengembalikan warna layar secara manual melalui shortcut Home Screen:
*   **Prosedur Pemulihan**:
    1.  Jalankan Task **`Restoref_Color`** (atau ketuk widget shortcut di Home Screen).
    2.  Task ini menjalankan aksi **`Custom Setting`** dengan parameter:
        *   **Type**: `Secure`
        *   **Name**: `accessibility_display_daltonizer_enabled`
        *   **Value**: `0` *(Mengembalikan warna layar normal)*
        *   *(Opsional: matikan/ubah sakelar `accessibility_display_daltonizer` jika aktif)*.

---

## 🤖 6. Prompt Generator untuk Tasker AI (Gemini Built-in)

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

## 🧪 7. Panduan Pengujian & Prosedur Debugging

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
