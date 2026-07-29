# Master Plan: N.E.X.A Mobile Bridge (Android Companion App)

Dokumen ini berisi rencana komprehensif, arsitektur teknis, dan tahapan pengembangan aplikasi **N.E.X.A Mobile Bridge**—sebuah *thin client companion app* buatan sendiri yang menghubungkan **N.E.X.A Cloud Server** dengan utilitas hardware & OS pada smartphone **Samsung Galaxy A33 5G**.

---

## 🎯 1. Visi & Filosofi Arsitektur

### Mengapa Bukan Tasker atau Termux?
- **Tanpa Setup Profil Rumit:** Tidak perlu konfigurasi manual profil Tasker yang melelahkan setiap kali ingin menambah fitur baru.
- **Bukan Termux:** Bebas dari kelemahan aplikasi yang *clunky*, boros baterai, atau keterbatasan antarmuka.
- **Native OS Execution:** Kode Kotlin murni langsung memanggil API resmi Android OS (`CameraManager`, `AudioManager`, `BatteryManager`, `PackageManager`, `FusedLocationProvider`).

### Model Client-Server Asimetris
```
┌─────────────────────────────────────────────────────────────────┐
│                    N.E.X.A CLOUD SERVER                         │
│  (Otak Utama: 15-Tier AI Router, Gemini 3.6 Flash, Supabase,    │
│   Memory Engine, Function Calling Registry)                     │
└────────────────────────────────┬────────────────────────────────┘
                                 │  Dual-Way Realtime Connection
                                 │  (WebSocket WSS / Cellular & WiFi)
┌────────────────────────────────▼────────────────────────────────┐
│             N.E.X.A MOBILE BRIDGE (ANDROID APP)                 │
│  (Thin Client: Hanya "Bridge" & Executor Hardware HP Samsung)   │
└─────────────────────────────────────────────────────────────────┘
```
- **Server Tetap Berat & Cerdas:** Semua pemrosesan LLM, logika ingatan, dan router tetap berada di server.
- **HP Tetap Ringan & Hemat Baterai:** HP tidak menjalankan model AI lokal, melainkan hanya bertindak sebagai "tangan & telinga" fisik N.E.X.A.

---

## 🌐 2. Akses Jaringan & Biaya (Network & Cost Specification)

| Parameter | Spesifikasi |
| :--- | :--- |
| **Target Perangkat** | Samsung Galaxy A33 5G (Android OS) |
| **Konektivitas** | Data Seluler 5G / 4G & WiFi Manapun (Koneksi Anywhere) |
| **Protokol** | Secure WebSocket (`wss://`) dengan *Heartbeat Auto-Reconnect* |
| **Biaya Development** | **Rp 0 (100% Gratis)** menggunakan Kotlin, Android CLI, Gradle |
| **Biaya Server & API** | **Rp 0** (Memanfaatkan `nexa-server` dan internet yang sudah ada) |
| **Distribusi App** | Sideload File `.apk` langsung ke Samsung A33 (Tanpa Play Store $25) |

---

## 📦 3. Tahapan Pengembangan (Roadmap Fitur)

### 🚀 FASE 1: Minimum Viable Product / MVP (V1.0 - Fitur Dasar & Hardware)
Fokus utama Fase 1 adalah membangun **Pipa Koneksi Realtime** yang 100% stabil, lalu memasang handler utilitas dasar:

1. **Modul Kontrol Hardware & Suara**
   - 🔦 **Senter (Flashlight):** Sakelar on/off instan via perintah N.E.X.A.
   - 🔊 **Volume & DND:** Pengaturan volume media/ringtone & toggle mode *Do Not Disturb*.
   - 🔋 **Status Baterai:** Cek persentase daya & status pengisian secara realtime.

2. **Modul Navigasi & Pembuka Aplikasi Pihak Ke-3**
   - 📱 **App Launcher:** N.E.X.A bisa membuka aplikasi apa pun di Samsung Anda (Tokopedia, Gojek, Instagram, WhatsApp, dll) via `PackageManager`.

3. **Modul Waktu & Alarm**
   - ⏰ **Jam & Alarm:** Memasang alarm atau pengatur waktu (*timer*) baru di HP.

4. **Modul Telemetri Lokasi & Sensor**
   - 📍 **GPS Location:** Mengirim koordinat lokasi terkini ke N.E.X.A saat diminta.
   - 🏃 **Motion Sensor:** Membaca data akselerometer (HP sedang diam, digenggam, atau bergerak).

---

### 🔮 FASE 2: Advanced Services (V2.0 - Fitur Lanjutan Masa Depan)
Setelah V1.0 teruji 100% lancar, fitur-fitur tingkat lanjut ini akan ditambahkan secara modular:

1. 🏦 **`NotificationListenerService` (Auto-Finance & Alert Stream)**
   - Membaca notifikasi m-Banking (BCA, Mandiri, GoPay, OVO, ShopeePay) yang masuk di status bar Samsung A33 5G Anda.
   - Secara otomatis mengirimkan teks notifikasi ke N.E.X.A Server untuk pencatatan keuangan otomatis di Supabase.

2. 🔐 **`BiometricPrompt` Manager (Verifikasi Sidik Jari)**
   - Meminta otentikasi sidik jari di layar Samsung A33 5G saat N.E.X.A akan melakukan aksi sensitif di server (misal: mengakses Vault rahasia).

3. 🤖 **`AccessibilityService` (Otomatisasi Klik Layar)**
   - Memberikan N.E.X.A kemampuan membaca antarmuka aplikasi dan melakukan klik otomatis atas izin pengguna.

---

## ⚙️ 4. Komponen & Protokol Teknis

### A. Modul Backend N.E.X.A Server (`src/interfaces/device_bridge.js`)
- **WebSocket Server (`ws`):** Mengelola koneksi *realtime* dari HP Samsung Anda.
- **Authentication Guard:** Verifikasi kunci rahasia (`DEVICE_BRIDGE_SECRET`) agar koneksi HP aman dari pihak luar.
- **Function Calling Registry:** Mendaftarkan tool `control_phone_hardware` dan `get_phone_telemetry` ke Gemini 3.6 Flash / AI Router.

### B. Modul Android Companion App (`nexa-mobile-bridge`)
- **Bahasa:** Kotlin + Jetpack Compose.
- **`NexaBridgeService.kt`:** *Foreground Service* dengan notifikasi latar belakang agar sistem One UI Samsung tidak mematikan koneksi.
- **`NexaWebSocketClient.kt`:** Klien WebSocket dengan fitur *Auto-Reconnect* otomatis saat berganti dari WiFi ke Data Seluler 5G.
- **`DeviceCommandDispatcher.kt`:** Penerjemah perintah JSON dari N.E.X.A Server ke API Native Android OS.

### C. Protokol JSON Data (Over WebSocket)
#### Perintah dari N.E.X.A Server ke HP:
```json
{
  "type": "EXECUTE_COMMAND",
  "command_id": "cmd_90123",
  "action": "TOGGLE_FLASHLIGHT",
  "params": { "enabled": true }
}
```

#### Balasan Hasil dari HP ke Server:
```json
{
  "type": "COMMAND_RESULT",
  "command_id": "cmd_90123",
  "status": "SUCCESS",
  "message": "Senter berhasil dinyalakan."
}
```

---

## 🏁 5. Status Rencana & Langkah Selanjutnya

- [x] Perancangan Arsitektur Client-Server
- [x] Pemilihan Teknologi (Kotlin Native + Node.js WebSocket)
- [x] Dokumen Rencana Master (`Plan/NEXA_MOBILE_BRIDGE_PLAN.md`)
- [ ] **Langkah Berikutnya (Tahap 1):** Pembangunan Modul Backend `src/interfaces/device_bridge.js` di `nexa-server`.
