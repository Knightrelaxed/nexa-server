# 🏛️ N.E.X.A Server: Blueprint & Panduan Lengkap Migrasi ke Oracle Cloud Always Free

> **Dokumen Perencanaan Arsitektur & Prosedur Migrasi Server**  
> **Target Platform:** Oracle Cloud Infrastructure (OCI) Always Free Tier  
> **Target Timeline:** April 2027 (atau saat kuota $100 Azure for Students berakhir)  
> **Estimasi Downtime Migrasi:** < 5 Menit  
> **Status Dokumen:** Ready for Execution / Reference Plan 📘  

---

## 📑 Daftar Isi
1. [Latar Belakang & Tujuan Migrasi](#1-latar-belakang--tujuan-migrasi)
2. [Spesifikasi & Keunggulan Oracle Cloud Always Free](#2-spesifikasi--keunggulan-oracle-cloud-always-free)
3. [Checklist Persiapan Pra-Migrasi](#3-checklist-persiapan-pra-migrasi)
4. [Panduan Registrasi Akun OCI & Kartu Debit](#4-panduan-registrasi-akun-oci--kartu-debit)
5. [Langkah 1: Pembuatan Instance Compute (ARM Ampere A1)](#5-langkah-1-pembuatan-instance-compute-arm-ampere-a1)
6. [Langkah 2: Konfigurasi Firewall Jaringan (OCI VCN & OS iptables)](#6-langkah-2-konfigurasi-firewall-jaringan-oci-vcn--os-iptables)
7. [Langkah 3: Opsi Domain & Dynamic DNS (DuckDNS / Cloudflare)](#7-langkah-3-opsi-domain--dynamic-dns-duckdns--cloudflare)
8. [Langkah 4: Instalasi Runtime & Deployment N.E.X.A](#8-langkah-4-instalasi-runtime--deployment-nexa)
9. [Langkah 5: Konfigurasi Reverse Proxy & Auto-SSL (Caddy)](#9-langkah-5-konfigurasi-reverse-proxy--auto-ssl-caddy)
10. [Langkah 6: Pengalihan Webhook Telegram & Verifikasi Sistem](#10-langkah-6-pengalihan-webhook-telegram--verifikasi-sistem)
11. [Proteksi Anti-Reclaim Akun Always Free](#11-proteksi-anti-reclaim-akun-always-free)
12. [Rencana Kontinjensi & Rollback](#12-rencana-kontinjensi--rollback)

---

## 1. Latar Belakang & Tujuan Migrasi

Saat ini N.E.X.A Cloud Core 3.0 berjalan secara stabil di Microsoft Azure VPS (Region Jakarta, Indonesia Central) menggunakan alokasi kredit Azure for Students ($100 USD). Berdasarkan kalkulasi konsumsi biaya (sekitar $10-$12/bulan untuk B1s/B2s VM), kredit tersebut diproyeksikan habis pada **April 2027**.

**Tujuan Migrasi:**
* Memindahkan seluruh *workload* komputasi server N.E.X.A ke platform **Oracle Cloud Always Free Tier** agar server dapat berjalan **24/7 secara permanen dan gratis selamanya (Rp 0)** tanpa batasan durasi kredit tahunan.
* Memanfaatkan arsitektur komputasi ARM Ampere A1 yang jauh lebih bertenaga (hingga 4 OCPU dan 24 GB RAM) dibandingkan VPS Azure B-series standar.
* Menjaga integritas data memori, transaksi, dan riwayat obrolan secara utuh karena basis data telah terdesentralisasi di Supabase Cloud.

---

## 2. Spesifikasi & Keunggulan Oracle Cloud Always Free

Oracle Cloud Infrastructure (OCI) menyediakan alokasi *Always Free Resources* paling dermawan di industri cloud:

| Komponen | Alokasi Always Free OCI | Catatan untuk N.E.X.A |
| :--- | :--- | :--- |
| **Arsitektur CPU** | Ampere Altra ARM64 (aarch64) | Mendukung hingga 4 OCPU gratis |
| **Alokasi RAM** | Hingga 24 GB RAM | Sangat melimpah (N.E.X.A hanya butuh ~250 MB) |
| **Storage Disk** | Hingga 200 GB NVMe Boot Volume | Sangat cukup untuk OS, logs, dan vector snapshot |
| **Alokasi Instance** | Bisa dibagi 1 instance (4 OCPU, 24GB RAM) atau 2 instance (2 OCPU, 12GB RAM) | Disarankan 1 VM (2 OCPU, 12 GB RAM) sudah luar biasa kencang |
| **Bandwidth Keluar** | 10 TB per bulan | Bebas biaya egress |
| **Alamat IP Publik** | 1 IPv4 Publik Statis / Reserved Gratis | Tidak berubah saat restart server |

---

## 3. Checklist Persiapan Pra-Migrasi

Sebelum memulai proses migrasi, pastikan hal-hal berikut telah siap:

- [ ] **Kartu Debit / Kredit:** Kartu bank yang mendukung transaksi internasional 3D-Secure untuk otorisasi registrasi ($1 / ~Rp16.000, langsung di-refund).
- [ ] **Akun Oracle Cloud:** Akun OCI telah terverifikasi dengan Home Region terpilih.
- [ ] **Kunci SSH:** Pasangan kunci SSH Publik & Privat untuk login ke server.
- [ ] **Domain / Dynamic DNS:** Subdomain gratis DuckDNS (misal: `nexa-core.duckdns.org`) atau domain pribadi yang diarahkan ke Cloudflare.
- [ ] **Backup Konfigurasi .env:** Salinan file `.env` dari Azure VPS atau repositori lokal.

---

## 4. Panduan Registrasi Akun OCI & Kebijakan Kartu Pembayaran

### A. Kebijakan Resmi Verifikasi 2-Tahap OCI (Hasil Konfirmasi Tim Support Oracle)
Berdasarkan verifikasi langsung dengan staf teknis Oracle (November 2026), pendaftaran OCI Free Tier menerapkan sistem verifikasi **2 tahap beruntun**:

1. **Tahap 1: Validasi Bank (Bank Validation)**:
   * Sistem mendebit dana otorisasi sementara $1 USD (~Rp 20.361).
   * Kartu apa pun yang aktif dan memiliki saldo (termasuk Debit Bank Jago fisik) akan **lolos** dan memunculkan centang hijau.
2. **Tahap 2: Validasi Kebijakan Oracle (Oracle Policy Validation)**:
   * Sistem internal CyberSource memvalidasi tipe kartu ke jaringan Visa/Mastercard.
   * **Aturan Mutlak**: Kartu debit tabungan murni tanpa fasilitas pinjaman/kredit (*pre-approved credit limit*) **DITOLAK OTOMATIS** dengan error *"Oops, we're sorry, an error occurred while creating your account"*.
   * Kartu **WAJIB** berupa Kartu Kredit fisik murni (*Credit Card*) atau kartu yang memiliki fungsi kredit aktif dari bank.

### B. Alternatif Kartu yang Terbukti Lolos di Indonesia
1. **Secured Credit Card (Kartu Kredit Jaminan Deposito)**:
   * Paling direkomendasikan untuk mahasiswa / freelancer tanpa slip gaji.
   * Contoh: **BCA Everyday Card (Secured)** atau **CIMB Niaga**. Cukup tempatkan saldo jaminan deposito (Rp 1-3 juta), bank langsung menerbitkan Kartu Kredit fisik resmi atas nama Anda. Nomor BIN terdaftar 100% sebagai *True Credit Card*.
2. **Kartu Kredit Fintech Resmi OJK**:
   * **Honest Card (Mastercard)**: Pendaftaran full digital via aplikasi HP, diterbitkan kartu kredit fisik resmi terdaftar OJK.
   * **YUP Card**: Kartu fisik dengan fasilitas limit kredit perbankan (*pre-approved credit line*).
3. **Kartu Kredit Keluarga / Orang Tua**:
   * Menggunakan kartu kredit utama keluarga (BCA, Mandiri, BRI, BNI), dengan syarat nama akun Oracle disesuaikan dengan nama pemilik kartu.

### C. Format Standar Alamat (Address Matching)
Sistem Address Verification System (AVS) internasional mewajibkan alamat pada form Oracle cocok dengan data korespondensi bank tanpa karakter khusus:
* **Address Line 1**: `Sered` (atau nama desa/jalan singkat tanpa simbol garis miring `/`)
* **Address Line 2**: `Madukara` (Kecamatan, atau kosongkan)
* **City**: `Banjarnegara` (Kabupaten bertindak sebagai "City")
* **Province**: `Jawa Tengah` (atau biarkan kosong jika opsional)
* **Postal Code / ZIP**: `53482` (Kode pos 5 digit resmi)
* **Home Region**: PILIH **Singapore (`ap-singapore-1`)** untuk latensi terendah ke Indonesia (~15-25 ms).

---

## 5. Langkah 1: Pembuatan Instance Compute (ARM Ampere A1)

1. Masuk ke **OCI Console** -> **Compute** -> **Instances** -> **Create Instance**.
2. **Nama Instance:** `nexa-server-oci`
3. **Placement & Availability Domain:** Pilih AD yang tersedia (biasanya AD-1).
4. **Image and Shape:**
   * **Image:** Ubuntu 24.04 LTS (atau Ubuntu 22.04 LTS) - Minimal / Standard
   * **Shape:** Pilih **Ampere** (ARM Processor)
   * **OCPU:** 2 OCPU
   * **Memory:** 12 GB RAM (atau sesuaikan sesuai keinginan hingga batas 24 GB)
5. **Networking (VCN):**
   * Pilih *Create new virtual cloud network* atau gunakan Default VCN.
   * Pastikan opsi **Assign a public IPv4 address** bernilai **Yes**.
6. **Add SSH Keys:**
   * Unggah file SSH Public Key Anda (`id_rsa.pub` atau `id_ed25519.pub`).
7. **Boot Volume:**
   * Gunakan ukuran default (50 GB hingga 100 GB).
8. Klik **Create**. Tunggu hingga status instance berubah menjadi **RUNNING** (warna hijau). Catat **Public IP Address** yang didapatkan.

---

## 6. Langkah 2: Konfigurasi Firewall Jaringan (OCI VCN & OS iptables)

Oracle memiliki dua lapis firewall: tingkat cloud (VCN Security List) dan tingkat OS (iptables Ubuntu). Keduanya wajib dibuka untuk port 80 (HTTP) dan 443 (HTTPS).

### A. Buka Port di OCI Console (Security List)
1. Buka halaman detail Instance -> Klik nama **Subnet** yang terhubung.
2. Klik **Default Security List for...**.
3. Di bagian **Ingress Rules**, klik **Add Ingress Rules**:
   * **Source CIDR:** `0.0.0.0/0`
   * **IP Protocol:** TCP
   * **Destination Port Range:** `80,443`
   * **Description:** `Allow HTTP and HTTPS for Caddy Reverse Proxy`
4. Klik **Add Ingress Rules**.

### B. Buka Port di OS Ubuntu (iptables & ufw)
Login via SSH ke VM Oracle:
```bash
ssh ubuntu@<PUBLIC_IP_ORACLE>
```

Jalankan perintah berikut untuk membuka port pada firewall internal Ubuntu:
```bash
# 1. Update routing iptables bawaan Oracle
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 80 -j ACCEPT
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 443 -j ACCEPT

# 2. Simpan aturan iptables agar permanen saat reboot
sudo apt install -y iptables-persistent netfilter-persistent
sudo netfilter-persistent save
sudo netfilter-persistent reload

# 3. (Opsional) Jika menggunakan UFW
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw reload
```

---

## 7. Langkah 3: Opsi Domain & Dynamic DNS (DuckDNS / Cloudflare)

Pilih salah satu dari dua metode berikut:

### Opsi A: DuckDNS (100% Gratis Selamanya, Tanpa Beli)
1. Kunjungi [duckdns.org](https://www.duckdns.org) dan login dengan Google atau GitHub.
2. Buat subdomain baru, contoh: `nexa-core` (sehingga menjadi `nexa-core.duckdns.org`).
3. Masukkan **Public IP Oracle** ke kolom IP DuckDNS, lalu klik **Update IP**.
4. Selesai. Domain ini langsung siap dipasang SSL oleh Caddy.

### Opsi B: Domain Pribadi via Cloudflare (Contoh: `.my.id` Rp12rb/tahun)
1. Beli domain di registrar lokal (misal `nexa-ai.my.id`).
2. Masukkan domain ke Cloudflare (Free Plan).
3. Buat **DNS A Record**:
   * **Name:** `@` atau `api`
   * **IPv4 Address:** `<PUBLIC_IP_ORACLE>`
   * **Proxy Status:** DNS Only (warna abu-abu) atau Proxied (orange). *Disarankan DNS Only saat setup awal agar sertifikat Caddy langsung terbit.*

---

## 8. Langkah 4: Instalasi Runtime & Deployment N.E.X.A

Jalankan perintah berikut di terminal SSH server Oracle:

### A. Update Sistem & Install Node.js LTS (v20/v22) + Git
```bash
# Update repository
sudo apt update && sudo apt upgrade -y

# Install tools dasar
sudo apt install -y curl git build-essential

# Install Node.js 22 LTS via NodeSource
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs

# Verifikasi instalasi (Harus arsitektur aarch64)
node -v
npm -v
uname -m
```

### B. Install PM2 (Process Manager)
```bash
sudo npm install -g pm2
pm2 startup
# Ikuti instruksi sudo env PATH... yang dimunculkan PM2
```

### C. Clone Repositori N.E.X.A Server
```bash
cd ~
git clone https://github.com/Knightrelaxed/nexa-server.git
cd nexa-server
npm install
```

### D. Injeksi File Konfigurasi (.env)
Buat file `.env` dan tempelkan seluruh kredensial dari server Azure sebelumnya:
```bash
nano .env
# Tempelkan seluruh variabel env (Supabase, Gemini, Groq, Google OAuth2, Telegram Token, dsb.)
# Simpan dengan menekan Ctrl+O, Enter, lalu Ctrl+X
```

### E. Jalankan Server dengan PM2
```bash
pm2 start src/app.js --name nexa-server
pm2 save
```

Periksa status:
```bash
pm2 status
pm2 logs nexa-server --lines 30
```

---

## 9. Langkah 5: Konfigurasi Reverse Proxy & Auto-SSL (Caddy)

Caddy akan bertindak sebagai garda depan (Reverse Proxy) yang otomatis menangani sertifikat SSL/HTTPS Let's Encrypt secara gratis.

### A. Install Caddy di Ubuntu ARM64
```bash
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https curl
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update
sudo apt install -y caddy
```

### B. Konfigurasi /etc/caddy/Caddyfile
Edit file konfigurasi Caddy:
```bash
sudo nano /etc/caddy/Caddyfile
```

Ganti isinya dengan konfigurasi berikut (sesuaikan nama domain):
```caddy
nexa-core.duckdns.org {
    header {
        Strict-Transport-Security max-age=31536000; includeSubDomains; preload
        X-Content-Type-Options nosniff
        X-Frame-Options DENY
        X-XSS-Protection 1; mode=block
        Referrer-Policy no-referrer
        -Server
    }
    reverse_proxy localhost:3000
}
```

### C. Reload Caddy
```bash
sudo systemctl restart caddy
sudo systemctl status caddy
```

Uji apakah endpoint kesehatan N.E.X.A sudah dapat diakses dari internet publik:
```bash
curl https://nexa-core.duckdns.org/health
```
Jika merespons `{"status":"ALIVE", ...}`, maka layer HTTPS dan reverse proxy telah 100% sukses!

---

## 10. Langkah 6: Pengalihan Webhook Telegram & Verifikasi Sistem

Langkah terakhir adalah memberi tahu bot Telegram agar mengirim seluruh obrolan ke server Oracle yang baru.

### A. Update Webhook Telegram (1 Perintah)
Ganti `<TELEGRAM_BOT_TOKEN>`, `<NEW_DOMAIN>`, dan `<SECRET_TOKEN>` sesuai data Anda:
```bash
curl -F "url=https://nexa-core.duckdns.org/webhook/telegram"      -F "secret_token=YOUR_TELEGRAM_WEBHOOK_SECRET_TOKEN"      https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/setWebhook
```

Periksa info webhook:
```bash
curl https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/getWebhookInfo
```
Pastikan `has_custom_certificate: false` dan `pending_update_count: 0`.

### B. Uji Coba Obrolan Langsung
1. Buka Telegram dan kirim pesan ke N.E.X.A:  
   *"Halo Nexa, cek status sistem server."*
2. Pantau log server secara real-time:
   ```bash
   pm2 logs nexa-server
   ```
3. Verifikasi bahwa N.E.X.A merespons dengan cepat, mengingat identitas Tuan Faqih, dan seluruh memori Supabase terbaca normal.

---

## 11. Proteksi Anti-Reclaim Akun Always Free

Oracle memiliki kebijakan otomatisasi untuk mematikan VM Always Free yang terdeteksi menganggur (*idle*) jika utilisasi CPU di bawah 20% selama 7 hari berturut-turut.

**Strategi Pencegahan:**
1. **Aktivitas N.E.X.A Sendiri:** N.E.X.A memiliki cron jobs harian (Morning Briefing jam 05:30 WIB, Follow-up jam 08:15 WIB, Memory Hygiene jam 03:30 WIB) serta Uptime Monitoring dari UptimeRobot/cron-job.org yang memukul endpoint `/health` setiap 5 menit.
2. **Metode Upgrade PAYG ($0 Cost):** Setelah akun berjalan beberapa bulan, Anda bisa mengubah tipe akun menjadi *Pay As You Go* di console OCI. Selama Anda tetap menggunakan resource dalam batas Always Free, Anda **tidak akan ditagih biaya apa pun ($0)**, tetapi status akun menjadi Premium sehingga VM tidak akan pernah terkena kebijakan reclaim.

---

## 12. Rencana Kontinjensi & Rollback

Jika selama proses migrasi terjadi kendala tak terduga pada OCI:
1. **Server Azure Tetap Utuh:** Jangan langsung menghapus VM Azure sebelum server Oracle diverifikasi 100% stabil.
2. **Rollback Instan:** Jika ingin kembali ke Azure, cukup arahkan kembali webhook Telegram ke URL Azure lama:
   ```bash
   curl -F "url=https://nexa-server.indonesiacentral.cloudapp.azure.com/webhook/telegram"         https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/setWebhook
   ```
3. Dalam hitungan 1 detik, N.E.X.A akan langsung kembali aktif di Azure tanpa gangguan data sama sekali.

---

> **Dokumen Disusun:** Sabtu, 5 September 2026  
> **Status:** Siap Digunakan Kapan Saja Saat Tuan Membutuhkan Migrasi.
