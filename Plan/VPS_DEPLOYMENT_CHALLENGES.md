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
| **Microsoft Azure (Cloud VPS)** | Enterprise Cloud VPS | Lingkungan runtime sangat stabil & optimal (2 vCPU, 1 GB RAM), namun merupakan layanan enterprise berbayar komersial setelah kredit habis. | ⚠️ Aktif (Tantangan Biaya Enterprise) |
| **Back4App Containers** | Docker Container PaaS | *Free Plan* hanya memberikan **Temporary URL (kedaluwarsa dalam 60 menit)**; butuh upgrade berbayar untuk URL permanen. | ❌ Tidak Viable untuk Webhook |
| **Oracle Cloud (Always Free)** | Enterprise Cloud VPS | Validasi 2-Tahap: Lolos verifikasi bank ($1), namun gagal di *Oracle Policy Validation* karena kartu debit tabungan murni tanpa limit kredit diblokir. Wajib Kartu Kredit fisik. | ❌ Terkendala Kebijakan Kartu Kredit |
| **InstaBox (instabox.sh)** | MicroVM Sandbox | Spesifikasi besar (4 vCPU / 8 GiB RAM), namun dibatasi mati paksa maksimal 8 jam (*max-run limit*) dan hukuman *cooldown* bertingkat hingga 2+ jam. | ❌ Tidak Viable untuk 24/7 Server |

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

### 6. Microsoft Azure (Enterprise Cloud VPS)
* **Karakteristik Asli:** Layanan cloud VPS enterprise kelas dunia (`Standard_B2ats_v2`: 2 vCPU, 1 GB RAM).
* **Keberhasilan & Kecocokan Lingkungan:**
  * Lingkungan runtime terbukti **sangat cocok, stabil, dan optimal** untuk N.E.X.A Server.
  * Alokasi memori PM2 (`max_memory_restart: '650M'` dan heap V8 512MB) berjalan sangat mulus tanpa kebocoran memori.
  * Koneksi HTTPS statis, latensi, dan webhook dua arah (Telegram Bot & Nexa Mobile Bridge) beroperasi secara sempurna.
* **Tantangan Utama:**
  * **Model Biaya Enterprise (Komersial Berbayar):** Meskipun lingkungannya sangat prima, Azure adalah platform komersial enterprise. Begitu masa kredit/trial berakhir, sistem menerapkan tarif *pay-as-you-go* reguler yang memerlukan biaya langganan bulanan berkelanjutan.
  * **Strategi:** Memanfaatkan lingkungan Azure ini secara maksimal hingga masa aktif/kreditnya habis, lalu mengeksekusi migrasi ke platform yang benar-benar *Always Free* (GCP `e2-micro`).

---

### 7. Back4App Containers
* **Karakteristik Asli:** Platform container Docker berbasis repositori GitHub.
* **Keberhasilan:** Berhasil melakukan build image Docker Node.js 20 dan menjalankan server Express N.E.X.A (`DEPLOYMENT READY`).
* **Kendala Fatal untuk Production:**
  1. **Temporary URL (Limitasi 60 Menit):** Back4App Free Tier hanya memberikan URL subdomain publik aktif selama **60 menit**:
     > *"Temporary URL Active: URL is temporary and will be live for 60 minutes. Upgrade for a Permanent URL."*
  2. **Inkompatibilitas Webhook:** Karena URL berubah/mati setiap 60 menit, Webhook Telegram dan Nexa Mobile Bridge tidak dapat mempertahankan koneksi permanen.
  3. **Manajemen Environment Variables:** Tidak tersedianya endpoint REST API terbuka untuk *bulk upload* puluhan kunci API sekaligus dari terminal lokal (harus diinput satu per satu atau via prompt AI chat).

---

### 8. Oracle Cloud Infrastructure (Always Free Tier)
* **Karakteristik Asli:** Platform enterprise cloud dengan alokasi Always Free sangat besar (Ampere ARM64 4 OCPU, 24 GB RAM, 200 GB Storage).
* **Temuan Hasil Investigasi Teknis (Live Support Oracle - November 2026):**
  1. **Sistem Verifikasi 2-Tahap**:
     * *Tahap 1 (Bank Validation)*: Otorisasi saldo sementara $1 USD (~Rp 20.361) berhasil ditarik dan memunculkan centang hijau pada kartu Debit Visa Bank Jago fisik.
     * *Tahap 2 (Oracle Policy Validation)*: Sistem keamanan CyberSource memeriksa nomor BIN kartu ke jaringan Visa/Mastercard.
  2. **Kendala Fatal**:
     * Konfirmasi resmi staf teknis Oracle (George): *"A Debit card isn't eligible for Free trial registration. The Debit card must have a Credit function enabled. Meaning, a pre approved credit limit from the bank."*
     * Kartu debit tabungan murni tanpa limit kredit otomatis digagalkan dengan pesan *"Oops, we're sorry, an error occurred while creating your account"*.
  3. **Solusi yang Valid**: Memerlukan Kartu Kredit fisik murni, *Secured Credit Card* beragunan deposito (BCA / CIMB Niaga), atau kartu kredit fintech resmi (Honest Card / YUP).

---

### 9. InstaBox (instabox.sh)
* **Karakteristik Asli:** Cloud sandbox microVM (Firecracker) berbasis Debian 13 untuk AI coding agents dan CI/CD.
* **Keunggulan:** Spesifikasi Free Tier sangat besar (4 vCPU, 8 GiB RAM, 20 GiB disk) tanpa kartu kredit.
* **Kendala Fatal untuk Production Server 24/7:**
  1. **Auto-Pause 30 Menit**: Mesin otomatis tertidur jika idle 30 menit. Akibatnya, internal *node-cron* NEXA berhenti berjalan dan *cold-start wake* (hingga 45 detik) memicu *timeout* pada webhook Telegram (ambang 5-10 detik).
  2. **Hard Max-Run 8 Jam (480 Menit)**: Meskipun diberi *traffic* terus-menerus via cron, mesin dipaksa mati setiap 8 jam.
  3. **Hukuman Cooldown Lockout Bertingkat**: Setelah mati paksa 8 jam, mesin terkunci total (`409 machine_cooldown`) selama 15-20 menit (siklus 1), 60-75 menit (siklus 2), dan 120-135 menit (siklus 3+). Selama masa ini, webhook Telegram mati total.
  4. **Status Kelayakan**: Sangat bagus sebagai lab sandbox eksperimen, namun tidak layak sebagai server produksi 24/7.

---

## 📊 Kesimpulan Engineering & Realita Cloud 2026

1. **Pengetatan Free-Tier Global:** Sejak 2024-2026, hampir seluruh penyedia infrastruktur cloud global (PaaS/VPS) telah menutup akses *pure-anonymous free tier* untuk mencegah botnet dan penyalahgunaan AI scraping. Kartu debit/kredit dijadikan instrumen utama verifikasi identitas (KYC).
2. **Kebutuhan Nyata N.E.X.A:**
   * N.E.X.A Core **hanya membutuhkan daya komputasi ringan** (~70MB RAM, 0.1 vCPU).
   * Namun N.E.X.A **memerlukan URL HTTPS Statis Permanen** agar webhook dua arah (Telegram Bot, Nexa Mobile Bridge Android, dan Cron Health Check) dapat bekerja tanpa putus.

---

## 🛣️ Rekomendasi Solusi Berkelanjutan

Jika ingin mendapatkan server/VPS permanen tanpa terbentur limitasi gratisan yang tidak stabil:
1. **Opsi Kartu Kredit Agunan Deposito (Secured CC):** Menggunakan Secured Credit Card bank resmi (BCA / CIMB Niaga) atau kartu kredit fintech resmi (Honest Card) untuk membuka akses Oracle Cloud Always Free selamanya.
2. **Opsi Dedicated VPS Murah / Lokal:** Menyewa VPS Linux unmanaged termurah (misal: IDCloudHost, DomaiNesia, RackNerd seharga ~Rp 15.000-30.000/bulan) via pembayaran QRIS/GoPay/DANA tanpa memerlukan kartu kredit.
3. **Opsi KVM Community VPS:** Memanfaatkan layanan KVM berbasis autentikasi Telegram murni seperti **Hax.co.id** dengan konfigurasi *Cloudflare Tunnel* untuk routing IPv4.

---

## 🚀 Rencana Selanjutnya: Migrasi ke GCP Always Free Tier (Pasca-Azure)

### 1. Status Saat Ini
* **Infrastruktur Aktif:** N.E.X.A Server saat ini berjalan stabil di **Azure VPS** (`Standard_B2ats_v2` — 2 vCPU, 1 GB RAM) dengan konfigurasi PM2 yang sudah teroptimasi (`max_memory_restart: '650M'`, `node_args: '--max-old-space-size=512'`).
* **Strategi:** Mempertahankan Azure VPS hingga masa aktif / kuota kredit habis karena lingkungannya sudah sangat cocok dan stabil.

### 2. Target Platform Berikutnya: Google Cloud Platform (GCP) — Always Free Tier
Ketika periode Azure berakhir, server akan dimigrasikan ke GCP Compute Engine yang memiliki kuota gratis selamanya:
* **Spesifikasi Mesin:** 1x VM `e2-micro` (2 vCPU burstable, 1 GB RAM, 30 GB Disk).
* **Pilihan Region Wajib (Always Free):** `us-central1` (Iowa), `us-east1` (South Carolina), atau `us-west1` (Oregon).
* **Status Biaya:** **Always Free (Gratis Selamanya)**. Kredit $300 di awal hanya berlaku 90 hari untuk eksplorasi, tetapi VM `e2-micro` tetap berjalan gratis $0/bulan bahkan setelah masa 90 hari lewat (ada proteksi *No automatic charges*).

### 3. Checklist & Rekomendasi Teknis Saat Setup di GCP
1. **Wajib Buat Swap Memory (2 GB – 4 GB):**
   * RAM fisik `e2-micro` adalah 1 GB. Untuk mencegah *Out Of Memory (OOM) killer* saat menjalankan `npm install` atau proses berat, wajib alokasikan file Swap dari disk 30 GB (`fallocate -l 2G /swapfile`).
2. **Pilihan Disk & Network:**
   * Pilih **Standard Persistent Disk** (maksimal 30 GB, jangan SSD).
   * Pilih **Network Service Tier: Standard** (kuota egress gratis 1 GB/bulan).
3. **IP Eksternal:**
   * Gunakan 1 IP eksternal standar yang terpasang langsung ke VM (gratis selama VM aktif). Jangan menyisakan IP statis yang menganggur (*unattached*).
4. **Budget Alert:**
   * Pasang *Budget & Alert* di GCP Billing sebesar **$1 USD** sebagai pengaman jika ada pemakaian di luar batas Always Free.
