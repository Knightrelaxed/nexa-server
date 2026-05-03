# 💡 IDE PENGEMBANGAN N.E.X.A (Ekspansi Masa Depan)

Dokumen ini berisi cetak biru (blueprint) ide-ide ekspansi tingkat lanjut untuk membuat sistem N.E.X.A menjadi lebih cerdas dan proaktif di masa mendatang.

---

## 1. Pemicu *Morning Briefing* Berbasis Alarm (Sinkronisasi Waktu Bangun)
**Konsep:** Alih-alih mengirim *briefing* pada pukul 05:30 WIB secara buta oleh Cron Job server, N.E.X.A kini **sudah diimplementasikan** untuk mengirim laporan tepat di detik Anda mematikan alarm. Ini lebih presisi dan personal.
**Cara Kerja:** Tasker mendeteksi alarm HP dimatikan ➔ Menembakkan *webhook* ke **N.E.X.A HF Space** ➔ Server memanggil API Cuaca, Berita, dan Kalender ➔ N.E.X.A mengirim *briefing* ke Telegram seketika.

### 🤖 Prompt Tasker AI Agent:
> **"Buatkan Profile event Alarm Done. Jika terpicu, jalankan Task HTTP POST Request ke `<HF_URL>/webhook/tasker` dengan headers `Authorization: Bearer <GODMODE_SECRET>` dan `Content-Type: application/json`. Isi body JSON: `{"type": "ALARM_DISMISSED", "data": {"timestamp": "%TIMES"}}`.**"

*(Status: ✅ SUDAH DIIMPLEMENTASIKAN di `webhook.js` — handler `ALARM_DISMISSED` aktif. Lihat `TASKER_AUTOMATION_GUIDE.md` Profil #5 untuk konfigurasi Tasker-nya).*

---

## 2. Sensor Geofencing / Lokasi Kampus (UGM)
**Konsep:** Asisten proaktif yang memiliki kesadaran lokasi fisik (*spatial awareness*).
**Cara Kerja:** GPS HP mendeteksi Anda memasuki kawasan Universitas Gadjah Mada (FIB Sastra Arab). Tasker mengirim sinyal "TIBA_DI_KAMPUS" ke server. N.E.X.A merespons dengan otomatis memperbarui status *Google Calendar* Anda menjadi "Sedang di Kampus", atau memeriksa apakah ada tugas perpustakaan hari ini dan mengingatkan Anda.

### 🤖 Prompt Tasker AI Agent:
> **"Buatkan Profile Location dengan radius Universitas Gadjah Mada. Jika saya memasuki area tersebut, jalankan Task HTTP POST Request ke `<HF_URL>/webhook/tasker` dengan body JSON: `{"type": "LOCATION_ENTERED", "data": {"location": "Kampus UGM"}}`.**"

*(Catatan Backend: Harus ditambahkan handler `LOCATION_ENTERED` di `webhook.js` N.E.X.A untuk analisis lokasi oleh Gemini).*

---

## 3. *Study Mode* (Fokus Absolut Aktif)
**Konsep:** Intervensi balik dari server untuk mengisolasi HP Anda secara proaktif. Ini adalah pelengkap *God-Mode*; alih-alih menghukum Anda karena melanggar, mode ini melindungi Anda sebelum Anda terdistraksi saat mengerjakan tugas.
**Cara Kerja:** Anda memerintahkan via Telegram: *"Nexa, setel study mode 2 jam"*. N.E.X.A membalas dengan perintah rahasia: `🔵 STUDY MODE AKTIF`. Tasker mencegat perintah itu di HP Anda.

### 🤖 Prompt Tasker AI Agent:
> **"Buatkan Profile AutoNotification Intercept untuk aplikasi Telegram. Filter teksnya mengandung kata '🔵 STUDY MODE AKTIF'. Jika terpicu, jalankan Task berikut secara berurutan: hidupkan mode Do Not Disturb (DND), setel Media Volume ke 0, dan set timer tunggu selama 2 jam. Setelah 2 jam berlalu, kembalikan DND dan Volume ke pengaturan normal."**

---

## 4. 🚀 DEPLOYMENT: "Immortality Protocol v3.0" — Hugging Face + 4-Layer Defense

**Konsep:** Menggantikan platform Koyeb (berbayar) dengan arsitektur gratis permanen menggunakan Hugging Face Docker Spaces, diperkuat oleh sistem pertahanan berlapis agar N.E.X.A tetap hidup 24/7 tanpa biaya sepeser pun dan tanpa Kartu Kredit.

**Prasyarat:** Hugging Face Spaces (Docker, gratis), akun UptimeRobot, akun cron-job.org, Tasker.

**Platform:** Hugging Face Docker Space
- Spesifikasi: 16 GB RAM, 2 vCPU — gratis permanen
- Tidur setelah 48 jam tanpa trafik → diatasi oleh 4 lapisan pertahanan di bawah
- Port wajib: `7860`
- Tanpa Kartu Kredit

---

### Arsitektur 4 Lapisan: "Defensive in Depth"

#### 🏛️ LAPISAN 1 — Bunker (Triple Redundancy Anti-Sleep)
Tiga sumber ping INDEPENDEN dari infrastruktur berbeda menembak endpoint `/health` N.E.X.A:
- **UptimeRobot** (gratis): Ping setiap **5 menit** — 99.9% uptime sejak 15 tahun beroperasi
- **cron-job.org** (gratis): Ping setiap **10 menit** — server berbeda, backup independen, 15+ tahun beroperasi
- **Tasker Android**: Ping setiap **2 jam** — berjalan di perangkat Anda sendiri
- **Logika Matematis:** Ketiga sistem harus serentak gagal selama 48 jam berturut-turut untuk bisa tidur. Probabilitas: ~0.000001%

#### 🏥 LAPISAN 2 — Paramedis (Smart Health Endpoint)
Endpoint `GET /health` yang cerdas ditambahkan ke `app.js`:
```json
{ "status": "ALIVE", "uptime_seconds": 3600, "timestamp_jakarta": "...", "memory_mb": 120 }
```
UptimeRobot tidak hanya mendeteksi "hidup/mati", tapi juga bisa mendeteksi kebocoran memori atau server yang merespons tapi tidak sehat.

#### 🤖 LAPISAN 3 — Android Watchdog (Tasker sebagai Dokter Jaga Aktif)
Tasker bukan sekadar pinger pasif. Ia berfungsi sebagai dokter jaga:
1. Kirim GET ke `/health` setiap 2 jam
2. Jika `200 OK` → Log diam-diam (hemat baterai, tanpa notifikasi)
3. Jika **GAGAL/TIMEOUT** → Tasker langsung akses URL Space HF secara penuh (mensimulasikan kunjungan manusia) untuk membangunkan kontainer
4. Tunggu 30 detik → Ping ulang untuk verifikasi
5. Jika masih mati → Push notifikasi ke Anda: *"⚠️ N.E.X.A offline. Cek HF dashboard."*

#### 📦 LAPISAN 4 — Black Box (Emergency Telegram Buffer)
Inovasi arsitektur untuk mencegah kehilangan data transaksi Livin' saat server sedang cold start:
1. Tasker mencoba POST ke `/webhook/tasker` — timeout 5 detik
2. Jika GAGAL → Tasker memforward data transaksi sebagai pesan teks ke Bot Telegram dengan prefix `[BUFFER]`:
   - Format: `[BUFFER] 75000 | Kopi Kenangan | 2026-05-03T17:45:00`
3. Saat server hidup kembali dan menerima pesan ini, AI Router mengenali prefix `[BUFFER]` dan memprosesnya sebagai transaksi manual
4. **Hasil: 0 transaksi hilang**, bahkan saat server mati total

---

### File yang Harus Dibuat/Dimodifikasi:

| File | Aksi | Keterangan |
|---|---|---|
| `Dockerfile` | **[BARU]** | Kontainer Node.js untuk HF Spaces, port 7860 |
| `.dockerignore` | **[BARU]** | Mengecualikan `node_modules`, `.env` dari build |
| `src/app.js` | **[MODIFIKASI]** | Tambah `/health` endpoint, ganti PORT ke 7860 |
| `src/interfaces/webhook.js` | **[MODIFIKASI]** | Tambah parser prefix `[BUFFER]` dari Telegram |
| `Plan/DEPLOYMENT_GUIDE.md` | **[BARU]** | Panduan step-by-step deploy ke HF + setup UptimeRobot + cron-job.org + Tasker Watchdog |

---

*Dokumen ini merupakan keranjang ide dan akan terus berkembang seiring berjalannya waktu dan bertambahnya kebutuhan Anda sebagai seorang mahasiswa, peneliti, dan diplomat di masa depan.*
