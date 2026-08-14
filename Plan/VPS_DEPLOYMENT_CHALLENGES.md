# Dokumentasi Evaluasi & Kendala Deployment Cloud / VPS (2026)

Dokumen ini mencatat secara menyeluruh hasil riset, uji coba *deployment*, serta kendala teknis dan administratif yang dihadapi saat mencoba menjalankan **N.E.X.A Core Server** di berbagai platform *Cloud, PaaS, dan VPS* tanpa menggunakan kartu debit/kredit.

---

## 📌 Ringkasan Eksekutif (Status Deployment)

| Platform | Kategori | Kendala Utama | Status |
|---|---|---|---|
| **Hugging Face Spaces** | AI PaaS | Kebijakan baru memaksakan *ZeroGPU*; *Docker* & *CPU Basic* dikunci berbayar; Kubernetes scanner membunuh container non-GPU. | ❌ Gagal (Terkunci Kebijakan) |
| **Render.com** | Modern PaaS | Meminta otorisasi kartu debit $1 (kebijakan anti-bot/fraud regional) meskipun memilih *Free Tier*. | ❌ Terkendala Kartu |
| **Koyeb.com** | Container PaaS | Wajib verifikasi kartu debit dengan penahanan saldo (*hold*) sebesar **$29 USD** saat registrasi. | ❌ Terkendala Kartu ($29) |
| **Alwaysdata.com** | Shared/Cloud Hosting | Form pendaftaran memblokir akun baru jika tidak melakukan *Credit card validation*. | ❌ Terkendala Kartu |
| **Serv00.com** | FreeBSD Shell / Hosting | Verifikasi keamanan CAPTCHA dinamis menolak jawaban nama perusahaan induk (*hostUNO/MyDevil*). | ❌ Gagal Registrasi |
| **Microsoft Azure for Students** | Enterprise Cloud VPS | Mengalami *login loop* dan kegagalan redirect SSO/autentikasi akun akademik. | ❌ Akses Terblokir |
| **Back4App Containers** | Docker Container PaaS | *Free Plan* hanya memberikan **Temporary URL (kedaluwarsa dalam 60 menit)**; butuh upgrade berbayar untuk URL permanen. | ❌ Tidak Viable untuk Webhook |

---

## 🔍 Analisis Mendalam Per Platform

### 1. Hugging Face Spaces (Gradio & Docker)
* **Karakteristik Asli:** Menyediakan komputasi awan gratis dengan jembatan Python ASGI.
* **Kendala yang Ditemukan:**
  1. **Paksaan ZeroGPU:** Akun gratis tidak lagi dapat memilih *CPU Basic*. Semua space `sdk: gradio` dialokasikan ke mesin *ZeroGPU (Nvidia A100)*.
  2. **Docker SDK Berbayar:** Opsi `sdk: docker` yang sebelumnya gratis telah dikunci menjadi fitur berbayar (PRO Subscription).
  3. **Pemindai AST Kubernetes:** *Backend* HF memindai kode `app.py`. Jika tidak ada fungsi `@spaces.GPU` yang terdaftar di level terluar (*top-level*), Kubernetes HF mematikan (*SIGKILL/shutdown*) pod container secara sepihak setelah status `Uvicorn running`.
  4. **Konflik Dependensi Library:** `spaces` SDK memicu pemanggilan `gradio` yang memerlukan modul `HfFolder` dari `huggingface_hub` (modul ini telah dihapus pada versi `huggingface_hub >= 0.30`, memicu `ImportError`).

---

### 2. Render.com
* **Karakteristik Asli:** Platform Git-to-Deploy modern berbasis Linux.
* **Kendala yang Ditemukan:**
  * Meskipun pengguna secara eksplisit memilih opsi **Free ($0/month, 512MB RAM, 0.1 CPU)**, saat tombol *Deploy Web Service* diklik, muncul modal popup:
    > *"Add Card — To verify your card, Render will perform a temporary authorization for $1 USD. You won't be charged."*
  * **Penyebab:** Pengetatan sistem pencegahan penyalahgunaan (*anti-abuse & cryptomining*) untuk akun baru dari wilayah regional tertentu (termasuk IP Indonesia).

---

### 3. Koyeb.com
* **Karakteristik Asli:** Penyedia serverless container berkecepatan tinggi.
* **Kendala yang Ditemukan:**
  * Koyeb mewajibkan verifikasi kartu pada saat pendaftaran akun baru.
  * Sistem melakukan *temporary pre-authorization hold* sebesar **$29 USD** pada kartu pengguna untuk validasi identitas, sehingga tidak dapat digunakan tanpa kartu debit/kredit yang memiliki saldo aktif.

---

### 4. Alwaysdata.com
* **Karakteristik Asli:** Penyedia cloud hosting asal Prancis dengan dukungan Node.js dan SSH.
* **Kendala yang Ditemukan:**
  * Pada langkah akhir pengisian profil registrasi, sistem menampilkan peringatan merah:
    > *"Attention: To continue your registration and to prevent misuse, you must validate a credit or debit card."*
  * Pendaftaran akun gratis langsung dihentikan jika tombol *Validate my card* tidak diselesaikan.

---

### 5. Serv00.com
* **Karakteristik Asli:** Layanan hosting non-profit berbasis FreeBSD di Polandia dengan dukungan SSH dan proses latar belakang (*PM2 / Devil*).
* **Kendala yang Ditemukan:**
  * Sistem verifikasi pendaftaran menggunakan pertanyaan keamanan dinamis buatan sendiri (misal: *"What is the name of the hosting service whose free version is serv00.com?"*).
  * Sistem validasi form sering menolak jawaban yang valid (`serv00.com`, `hostUNO.com`, `MyDevil.net`) atau membatasi pembuatan akun baru karena kuota server harian penuh.

---

### 6. Microsoft Azure for Students
* **Karakteristik Asli:** Program VPS gratis (B1s Ubuntu VM) selama 12 bulan dengan saldo $100 untuk mahasiswa terverifikasi.
* **Kendala yang Ditemukan:**
  * Portal autentikasi Microsoft sering mengalami *login loop* tak berujung (berpindah-pindah antara Microsoft Account personal dan akun institusi pendidikan / SSO Kampus).
  * Proses verifikasi domain akademik sering gagal melakukan sinkronisasi dengan Azure Active Directory (Entra ID).

---

### 7. Back4App Containers
* **Karakteristik Asli:** Platform container Docker berbasis repositori GitHub.
* **Keberhasilan:** Berhasil melakukan build image Docker Node.js 20 dan menjalankan server Express N.E.X.A (`DEPLOYMENT READY`).
* **Kendala Fatal untuk Production:**
  1. **Temporary URL (Limitasi 60 Menit):** Back4App Free Tier hanya memberikan URL subdomain publik aktif selama **60 menit**:
     > *"Temporary URL Active — URL is temporary and will be live for 60 minutes. Upgrade for a Permanent URL."*
  2. **Inkompatibilitas Webhook:** Karena URL berubah/mati setiap 60 menit, Webhook Telegram dan Webhook Tasker tidak dapat mempertahankan koneksi permanen.
  3. **Manajemen Environment Variables:** Tidak tersedianya endpoint REST API terbuka untuk *bulk upload* puluhan kunci API sekaligus dari terminal lokal (harus diinput satu per satu atau via prompt AI chat).

---

## 📊 Kesimpulan Engineering & Realita Cloud 2026

1. **Pengetatan Free-Tier Global:** Sejak 2024–2026, hampir seluruh penyedia infrastruktur cloud global (PaaS/VPS) telah menutup akses *pure-anonymous free tier* untuk mencegah botnet dan penyalahgunaan AI scraping. Kartu debit/kredit dijadikan instrumen utama verifikasi identitas (KYC).
2. **Kebutuhan Nyata N.E.X.A:**
   * N.E.X.A Core **hanya membutuhkan daya komputasi ringan** (~70MB RAM, 0.1 vCPU).
   * Namun N.E.X.A **memerlukan URL HTTPS Statis Permanen** agar webhook dua arah (Telegram Bot, Tasker Android, dan Cron Health Check) dapat bekerja tanpa putus.

---

## 🛣️ Rekomendasi Solusi Berkelanjutan

Jika ingin mendapatkan server/VPS permanen tanpa terbentur limitasi gratisan yang tidak stabil:
1. **Opsi Kartu Debit Virtual (VCC / Bank Digital):** Menggunakan kartu debit bank digital Indonesia (seperti Bank Jago, Jenius BTPN, atau Seabank) yang memiliki saldo minimal Rp 20.000–50.000 untuk melewati verifikasi otorisasi $1 di platform kelas dunia seperti **Render.com** atau **Oracle Cloud Always Free (4 Core, 24GB RAM Gratis Selamanya)**.
2. **Opsi Dedicated VPS Murah / Lokal:** Menyewa VPS Linux unmanaged termurah (misal: IDCloudHost, DomaiNesia, RackNerd seharga ~Rp 15.000–30.000/bulan) via pembayaran QRIS/GoPay/DANA tanpa memerlukan kartu kredit.
3. **Opsi KVM Community VPS:** Memanfaatkan layanan KVM berbasis autentikasi Telegram murni seperti **Hax.co.id** dengan konfigurasi *Cloudflare Tunnel* untuk routing IPv4.
