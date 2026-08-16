# 🏛️ N.E.X.A Cloud Core 3.0 — Azure VPS Production Architecture & Deployment Documentation

> **Dokumentasi Resmi Implementasi Infrastruktur Cloud VPS**  
> **Status:** Production / Active 24/7 🟢  
> **Lokasi Data Center:** 🇮🇩 Jakarta, Indonesia (`indonesiacentral`)  
> **Domain HTTPS:** `https://nexa-server-faqih.indonesiacentral.cloudapp.azure.com`  
> **Waktu Implementasi:** Minggu, 16 Agustus 2026

---

## 📑 Daftar Isi
1. [Latar Belakang & Titik Balik](#1-latar-belakang--titik-balik)
2. [Investigasi Kebijakan Azure & Pemilihan Region](#2-investigasi-kebijakan-azure--pemilihan-region)
3. [Spesifikasi Server & Infrastruktur VM](#3-spesifikasi-server--infrastruktur-vm)
4. [Konfigurasi Jaringan & Firewall (NSG)](#4-konfigurasi-jaringan--firewall-nsg)
5. [Instalasi Runtime, Git, & Injeksi Konfigurasi](#5-instalasi-runtime-git--injeksi-konfigurasi)
6. [Manajemen Proses & Autostart 24/7 (PM2 + systemd)](#6-manajemen-proses--autostart-247-pm2--systemd)
7. [Pemantauan Real-Time Web GUI (PM2 Plus)](#7-pemantauan-real-time-web-gui-pm2-plus)
8. [Refactoring Codebase: Eliminasi Keterbatasan HuggingFace](#8-refactoring-codebase-eliminasi-keterbatasan-huggingface)
9. [Arsitektur HTTPS Permanen & Reverse Proxy (Caddy + Azure DNS)](#9-arsitektur-https-permanen--reverse-proxy-caddy--azure-dns)
10. [Pendaftaran Webhook Telegram & Verifikasi Sistem](#10-pendaftaran-webhook-telegram--verifikasi-sistem)
11. [Cheat Sheet Pemeliharaan & Troubleshooting](#11-cheat-sheet-pemeliharaan--troubleshooting)

---

## 1. Latar Belakang & Titik Balik

Sebelumnya, sistem N.E.X.A Server menghadapi kendala struktural pada platform PaaS/Free Hosting:
- **Hugging Face Spaces:** Terkendala limitasi ZeroGPU watchdog (mematikan aplikasi non-Gradio), isolasi socket TLS ke `api.telegram.org`, dan pemaksaan port 7860.
- **Back4App / Free PaaS lain:** URL bersifat sementara (*ephemeral*), sering mengalami *cold-start delay* (tertidur saat idle), dan tidak memberikan akses SSH penuh.
- **Opsi VPS Gratisan (Hax / Woiden):** Sering kehabisan kuota pendaftaran, masa aktif mingguan/bulanan yang harus diperpanjang manual, serta konektivitas yang tidak stabil.

**Keputusan Strategis:**  
Beralih ke infrastruktur Cloud Tingkat Enterprise menggunakan akun **Microsoft Azure for Students** ($100 Credit / 12 Bulan), yang memberikan kebebasan penuh atas OS Ubuntu, port jaringan, isolasi proses, dan IP Publik statis.

---

## 2. Investigasi Kebijakan Azure & Pemilihan Region

### A. Masalah Kebijakan: `RequestDisallowedByAzure`
Saat pertama kali mencoba men-deploy VM di region populer seperti `Sweden Central`, `East US`, `North Europe`, atau `Central US`, deployment ditolak secara otomatis oleh sistem dengan error:
```json
{
  "code": "RequestDisallowedByAzure",
  "message": "Resource was disallowed by Azure: This policy maintains a set of best available regions where your subscription can deploy resources."
}
```

### B. Investigasi via Azure Cloud Shell (CLI)
Kami melakukan inspeksi mendalam terhadap aturan *policy restriction* pada langganan Azure for Students:

```bash
# 1. Menemukan nama policy yang aktif
az policy assignment list --query "[].{Name:name, PolicyId:policyDefinitionId}" -o table
# Output: sys.regionrestriction

# 2. Membaca daftar region yang diizinkan (Whitelist)
az policy assignment show --name sys.regionrestriction --query "parameters" -o json
```

**Hasil Whitelist Policy:**
```json
{
  "listOfAllowedLocations": {
    "value": [
      "australiaeast",
      "eastasia",
      "centralindia",
      "indonesiacentral",
      "japanwest"
    ]
  }
}
```

### C. Pemilihan Pemenang: `indonesiacentral` (Jakarta) ⭐
Region **Indonesia Central (Jakarta)** tersedia dalam whitelist. Ini adalah skenario terbaik karena:
* **Latensi Minimal:** Hanya ~5–15 ms ke perangkat Tuan Faqih di Indonesia.
* **Data Center Baru:** Kapasitas komputasi Azure di Jakarta masih sangat lapang dan tidak terkena *quota exhaustion*.

---

## 3. Spesifikasi Server & Infrastruktur VM

| Parameter | Spesifikasi | Keterangan |
|---|---|---|
| **Cloud Provider** | Microsoft Azure | Azure for Students Subscription |
| **Virtual Machine Name** | `nexa-server` | Dedicated Instance |
| **Region** | `indonesiacentral` | Data Center Jakarta, Indonesia |
| **VM Size / SKU** | `Standard_B2ats_v2` | 2 vCPUs (AMD EPYC), 1.0 GiB RAM |
| **Operating System** | Ubuntu 24.04.4 LTS | Linux 6.17 Kernel x86_64 |
| **Public IP** | `48.193.41.76` | Static IPv4 (Primary NIC) |
| **Private IP** | `172.16.0.4` | Virtual Network Subnet |
| **Security Type** | Standard | Menghindari bug Trusted Launch pada B-series |
| **OS Disk** | 30 GiB Premium SSD | SCSI Disk Controller |

---

## 4. Konfigurasi Jaringan & Firewall (NSG)

Pada Azure **Network Security Group (`nexa-server-nsg`)**, aturan Inbound dikonfigurasi sebagai berikut:

| Priority | Name | Port | Protocol | Source | Action | Tujuan |
|---|---|---|---|---|---|---|
| **300** | `HTTP` | `80` | TCP | Any | **Allow** | Let's Encrypt ACME Challenge |
| **320** | `HTTPS` | `443` | TCP | Any | **Allow** | Lalu Lintas Webhook & API Terenkripsi |
| **340** | `SSH` | `22` | TCP | Any | **Allow** | Akses Remote Shell Admin |
| **350** | `Port_3000` | `3000` | Any | Any | **Allow** | Internal N.E.X.A Server Direct |

---

## 5. Instalasi Runtime, Git, & Injeksi Konfigurasi

### A. Instalasi Node.js 20 LTS & PM2
```bash
# Update repository package & install Node.js 20 LTS
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs git

# Instalasi Process Manager PM2 secara global
sudo npm install -g pm2
```

### B. Clone Repositori N.E.X.A
```bash
git clone https://github.com/Knightrelaxed/nexa-server.git
cd nexa-server
npm install
```

### C. Injeksi Konfigurasi `.env` (Teknik Base64 Anti-Korup)
*Tantangan:* Mem-paste file konfigurasi panjang berisi sertifikat RSA Private Key via SSH Windows sering mengalami *buffer overflow* / karakter terpotong.  
*Solusi:* Mengonversi seluruh file `.env` ke format Base64 (1 string murni tanpa karakter escape), lalu di-decode langsung di dalam terminal server:

```bash
echo "<BASE64_ENCODED_STRING>" | base64 -d > .env
```

---

## 6. Manajemen Proses & Autostart 24/7 (PM2 + systemd)

Agar N.E.X.A otomatis menyala kembali jika VM di-restart oleh Azure, PM2 diintegrasikan dengan `systemd`:

```bash
# 1. Menjalankan N.E.X.A sebagai daemon
pm2 start src/app.js --name nexa-server

# 2. Menyimpan daftar proses aktif
pm2 save

# 3. Mendaftarkan hook autostart ke systemd Ubuntu
sudo env PATH=$PATH:/usr/bin /usr/lib/node_modules/pm2/bin/pm2 startup systemd -u nexa --hp /home/nexa
```

---

## 7. Pemantauan Real-Time Web GUI (PM2 Plus)

Server dihubungkan ke dashboard web **[PM2 Plus (app.pm2.io)](https://app.pm2.io)**:

```bash
pm2 link d2uflwik6mh7tit n6r85u98vor6sly
```

### Fitur Monitoring Aktif:
* 📈 **Live CPU & RAM Tracking:** Penggunaan RAM konstan stabil di ~150–160 MiB.
* ⚡ **Event Loop Latency:** `0.4 ms` (Ultra-responsif).
* 🚀 **HTTP Latency:** `1 ms` (Kecepatan jaringan lokal Jakarta).
* 📜 **Live Streaming Logs:** Dapat melihat interaksi AI dan log Telegram secara real-time langsung dari web browser laptop/HP tanpa perlu membuka terminal SSH.

---

## 8. Refactoring Codebase: Eliminasi Keterbatasan HuggingFace

Seluruh codebase N.E.X.A dibersihkan dari *workaround* peninggalan Hugging Face:

### 1. `src/utils/telegram_network.js` (Peningkatan Arsitektur Utama ⭐)
* **Kondisi Lama:** Seluruh pesan outbound ke Telegram dipaksa memutar ke Vercel Relay di AS/Eropa karena HF memblokir koneksi langsung ke `api.telegram.org`.
* **Kondisi Baru (VPS):** Menambahkan jalur **`Direct`** sebagai **Tier 1 (Prioritas Utama)** pada `buildProxyChain()`. Outbound kini langsung ditembak dari Jakarta ke Telegram API. Vercel Relay dan AllOrigins tetap dipertahankan sebagai **Tier 2 & Tier 3 (Automatic Fallback)** jika terjadi gangguan jaringan internasional.

### 2. `src/app.js` & `Dockerfile`
* Default port fallback dikembalikan dari `7860` ke port standar **`3000`**.
* URL logging saat boot diubah dari `hf.space` ke IP/Domain VPS.
* Komentar IPv4 disesuaikan menjadi *VPS Network Best Practice*.

### 3. Pembersihan Interface & Error Message
* `src/interfaces/telegram/adapter.js`: Pesan error internal diarahkan ke *PM2 Dashboard*.
* `src/interfaces/whatsapp/adapter.js`: Panduan konfigurasi diarahkan ke `.env VPS`.
* `src/interfaces/whatsapp/auth_storage.js` & `src/utils/security.js`: Dokumentasi konteks disesuaikan ke Azure VPS.

---

## 9. Arsitektur HTTPS Permanen & Reverse Proxy (Caddy + Azure DNS)

### A. Kebijakan Wajib Telegram: Webhook Harus HTTPS
Telegram API secara ketat menolak pendaftaran Webhook yang menggunakan URL `http://` tanpa sertifikat SSL.

### B. Solusi Enterprise: Azure DNS Label + Caddy Reverse Proxy
1. **Azure DNS Name:** Dikonfigurasi pada Azure Public IP:
   `nexa-server-faqih.indonesiacentral.cloudapp.azure.com`
2. **Caddy Web Server:** Menggantikan kebutuhan manual Certbot/Nginx. Caddy otomatis meminta, memverifikasi, dan memperpanjang sertifikat SSL Let's Encrypt secara mandiri.

**Konfigurasi `/etc/caddy/Caddyfile`:**
```caddy
nexa-server-faqih.indonesiacentral.cloudapp.azure.com {
    reverse_proxy localhost:3000
}
```

**Menerapkan Konfigurasi:**
```bash
sudo systemctl restart caddy
```

---

## 10. Pendaftaran Webhook Telegram & Verifikasi Sistem

Pendaftaran Webhook dieksekusi langsung ke Telegram API:
```
https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/setWebhook?url=https://nexa-server-faqih.indonesiacentral.cloudapp.azure.com/webhook/telegram
```

**Respon API:**
```json
{
  "ok": true,
  "result": true,
  "description": "Webhook was set"
}
```

### Hasil Pengujian Langsung:
* ✅ **Pesan Uji:** `ping` ➔ Dijawab instan: *"Pong! Masih di sini, Tuan Faqih. Sinyal aman, sistem prima..."*
* ✅ **Pesan Uji:** `cek` ➔ Dijawab instan: *"Masuk, Tuan Faqih! Saya standby dan siap sedia..."*
* ✅ **Health Check Endpoint (`/health`):**
  ```json
  {
    "status": "ALIVE",
    "service": "N.E.X.A Cloud Core",
    "version": "3.0.0",
    "uptime_human": "1h 8m",
    "timestamp_jakarta": "16/8/2026, 11.32.58",
    "memory_mb": 157,
    "node_env": "development"
  }
  ```

---

## 11. Cheat Sheet Pemeliharaan & Troubleshooting

### A. Cara Login Remote via SSH
```powershell
ssh nexa@48.193.41.76
```

### B. Perintah Operasional PM2 (Di Terminal Server)
```bash
# Melihat status seluruh proses
pm2 status

# Melihat log streaming secara realtime
pm2 logs nexa-server

# Melihat visual dashboard interaktif
pm2 monit

# Restart server setelah update kode
pm2 restart nexa-server

# Reload konfigurasi Caddy (jika ada perubahan domain)
sudo systemctl reload caddy
```

### C. Alur Update Kode dari GitHub ke VPS (Workflow CI/CD Ringan)
Jika ada pembaruan kode di masa depan:
1. **Di Laptop ThinkPad:**
   ```powershell
   git add -A
   git commit -m "update: fitur baru"
   git push origin main
   ```
2. **Di Terminal SSH Server:**
   ```bash
   cd ~/nexa-server && git pull && pm2 restart nexa-server
   ```
   *(Selesai! Update aktif dalam 2 detik tanpa downtime).*

---

> **Kesimpulan:** N.E.X.A Cloud Core 3.0 kini telah memiliki "rumah permanen" dengan arsitektur cloud tingkat enterprise di Jakarta, respons ultra-cepat, keamanan HTTPS penuh, pemantauan realtime, dan ketahanan autostart 24/7. 🚀🦾
