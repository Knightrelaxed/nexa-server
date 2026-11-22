# N.E.X.A Pulse Monitor (`/monitor`) — Master Architecture & UI/UX Plan

**Dokumen Perencanaan Teknis, Arsitektur, & Desain Produk (Tahap 5 — Pengganti PM2 / PM2+)**  
*Versi: 1.1 (Locked Name: `N.E.X.A Pulse Monitor` · Frontend Repo/Folder: `nexa-pulse-monitor` · Single-User `scrypt` Auth)*  
*Tanggal: 22 November 2026*  
*Target Infrastruktur: Azure Linux VPS (Ubuntu, 892 MiB RAM, Node.js v22, Caddy, systemd, Go Sidecar `nexa-io`)*  
*Acuan Induk: `NEXA_MOBILE_BRIDGE_CONTROL_CENTER_PLAN.md` (v2.4 — Tahap 5) & `NEXA_MOBILE_BRIDGE_CONTROL_CENTER_PRD.md` (`FR-SRV-01`, `FR-SRV-09`, `FR-SRV-10`, `UC7`)*

---

## 1. Tujuan, Filosofi, & Batasan Utama

### 1.1 Masalah yang Diselesaikan
Saat ini pemantauan server desktop bergantung pada **PM2 + `app.pm2.io` (`free_v4`)** yang memiliki 4 kelemahan struktural bagi ekosistem N.E.X.A:
1. **Overhead RAM ~47 MB:** PM2 God Daemon + agen PM2+ memakan porsi signifikan dari total RAM VPS yang hanya **892 MiB**.
2. **Privasi Log Pihak Ketiga:** Fitur `SHOW LOGS` & telemetri pada `app.pm2.io` mengalirkan data operasional server (termasuk konteks log finansial/pribadi) melalui server cloud pihak ketiga.
3. **Paywall pada Fitur Penting:** Grafik historis (`1h/6h/24h/7d`), Health Heatmap, Historical Issues, Apps Overview, Remote Actions, dan Full-Screen Realtime Logs dikunci di balik paket berbayar PM2 Plus.
4. **UI Padat & Kurang Relevan untuk N.E.X.A:** PM2+ dirancang untuk klaster puluhan proses generik, sehingga tidak memahami unit spesifik N.E.X.A (`nexa-server`, `nexa-log`, `nexa-term`, `caddy`), koneksi **Mobile Bridge / Windows Bridge**, sesi **Live Call**, maupun metrik **AI/LLM**.

### 1.2 Prinsip Desain (Bukan Kloning PM2+)
Referensi 9 layar PM2+ (free & paid) hanya dipakai sebagai **checklist kapabilitas fungsional**. Secara visual dan ergonomi, `/monitor` dibangun dengan identitas yang jauh lebih **minimalis, profesional, dan rapi** (bergaya *developer tools* modern seperti Linear, Vercel, dan Tailscale):
- **Signal-over-Noise:** Menghilangkan elemen dekoratif yang tidak terpakai (tidak ada *box-in-box* bersarang, tidak ada *dropdown* klaster palsu, tidak ada warna pelangi).
- **Full English UI:** Selaras 100% dengan migrasi *Full English UI* di N.E.X.A Mobile Bridge agar istilah teknis (`Heap`, `Event Loop`, `Handles`, `P95 Latency`, `Uptime`, `Unit`) tampil ringkas, tajam, dan profesional.
- **Zero-Overhead saat Idle:** Saat tab browser desktop ditutup, tidak ada WebSocket `/io/logs` yang menyala dan tidak ada push metrik 2-detikan. Beban latar belakang murni dibatasi pada **sampler ringan 1x/menit (~4 KB RAM)** untuk mendukung histori `1h–7d` dan Health Heatmap.
- **Resilient Saat Server Restart:** Aset statis `/monitor` disajikan langsung oleh **Caddy** dan aliran log `/io/logs` terhubung langsung ke sidecar Go **`nexa-log.socket`** (independen dari Node.js). Artinya, **saat `nexa-server` sedang restart atau crash, halaman `/monitor` tetap hidup dan menampilkan log shutdown/boot secara real-time** — lebih andal daripada `app.pm2.io`.

---

## 2. Sistem Desain UI/UX Minimalis & Profesional

### 2.1 Palet Warna & Tema (`System | Dark | Light`)
Selaras dengan token warna N.E.X.A Mobile Bridge:
- **Dark Mode (Default):**
  - Canvas: `#090B10`
  - Surface / Card: `#10131A`
  - Elevated / Hover: `#161B24`
  - Hairline Border: `rgba(255, 255, 255, 0.07)` (hover: `0.14`)
  - Text: Primary `#F3F4F6`, Secondary `#9CA3AF`, Muted `#6B7280`
- **Light Mode (Opsional via Toggle):**
  - Canvas: `#F8FAFC`, Surface `#FFFFFF`, Hairline `rgba(15, 23, 42, 0.08)`, Text `#0F172A` / `#475569`.
- **Aksen Terkendali (Restrained Accents):**
  - **Brand Accent:** Cyan (`#22D3EE` Dark / `#0891B2` Light) — khusus untuk item navigasi aktif, fokus input, dan garis grafik primer.
  - **Semantic Status Only:** Emerald (`#10B981` Online/Healthy), Amber (`#F59E0B` Warning / Heap >80% / Restarting), Rose (`#F43F5E` Error / Down / Critical).

### 2.2 Tipografi & Tata Letak
- **Zero External CDN (CSP `default-src 'self'`):** Menggunakan *clean system UI sans* (`Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`) untuk label/navigasi, dan *tabular monospace* (`"JetBrains Mono", "Cascadia Code", ui-monospace, monospace` dengan `font-variant-numeric: tabular-nums`) **khusus** untuk angka metrik, timestamp, PID, hash Git, dan log — memastikan angka live tidak bergetar ke kiri/kanan setiap 2 detik.
- **Grid & Kepadatan:** Maksimal lebar konten `1360px` (kecuali halaman `Logs` yang *full-bleed*), jarak antar kartu konsisten `16px`, radius `10px` (rapi dan tajam, bukan terlalu membulat), tanpa bayangan tebal (*flat hairline surfaces*).

### 2.3 Struktur Shell Navigasi (5 Halaman Inti)
Memangkas 14 menu PM2+ menjadi **5 halaman yang padat guna** tanpa menu mati:

```text
┌────────────────────────────────────────────────────────────────────────────┐
│ [Visor] N.E.X.A Monitor   ● Online · 6d 4h · main@7c511ed   [⌘K] [☾] [Out] │  ← 48px Top Bar
├──────────────────┬─────────────────────────────────────────────────────────┤
│                  │                                                         │
│  ● Overview      │   Active Page Workspace                                 │
│  ◷ Metrics       │   (Clean hairline cards / full-bleed log console)       │
│  ≡ Logs          │                                                         │
│  △ Issues   [0]  │                                                         │
│  ⚙ Controls      │                                                         │
│                  │                                                         │
│  ──────────────  │                                                         │
│  VPS 892 MiB     │                                                         │
│  Avail 341 MiB   │                                                         │
│  Session · 11h   │                                                         │
└──────────────────┴─────────────────────────────────────────────────────────┘
   208px Slim Rail
   (collapsible 56px)
```

- **Command Palette (`Ctrl+K` / `⌘K`):** Akses instan via keyboard untuk lompat halaman (`Go to Logs`, `Go to Metrics 24h`), menjalankan aksi (`Restart nexa-server`, `Reset Metrics`), atau langsung mencari log/issue.

---

## 3. Perencanaan Mendalam Per Halaman & Per Fitur

### Halaman 1: `Overview` (Ringkasan Kesehatan & Layanan)
*Menggabungkan & menyederhanakan `Processes Overview` + `Apps Overview` + inti `App Dashboard` PM2+.*

#### Reasoning UX
Saat Tuan membuka `/monitor`, pertanyaan pertama dalam 3 detik pertama adalah: **"Apakah N.E.X.A sehat, seberapa lega RAM VPS, apakah Mobile/Windows Bridge terhubung, dan adakah error belakangan ini?"** Maka halaman Overview harus menjawab 4 hal itu *above the fold* tanpa scroll.

#### Komponen & Fitur
1. **Top KPI Row (4 Kartu Minimalis dengan Mini Sparkline 1 Jam):**
   - **CPU Usage:** Persentase CPU `nexa-server` + beban VPS (`loadavg 1m/5m`), sparkline garis halus.
   - **Memory (VPS & Node):** Angka utama **Node RSS** (mis. `186 MiB`) + subteks **V8 Heap** (`92 / 118 MiB · 78%`) dan **VPS Available** (`341 / 892 MiB`). Bar progres tipis dengan garis batas `MemoryHigh (320M)` dan `MemoryMax (420M)`.
   - **Event Loop Delay:** Mean (`0.3 ms`) + P95 (`1.3 ms`) dari `perf_hooks.monitorEventLoopDelay()`, indikator warna jika P95 > 50 ms.
   - **HTTP & Issues:** `HTTP Mean / P95` (`1.2 ms / 5.4 ms` · `req/min`) + status ringkas error `1h / 24h / 7d` (`0 / 0 / 2`) yang bisa diklik langsung menuju halaman `Issues`.
2. **Application Health Strip (7-Day / 30-Day Uptime & Health Heatmap):**
   - Terinspirasi dari *Application Health over time* PM2 Plus, namun disajikan jauh lebih bersih: strip kotak per jam (7 hari terakhir = 168 sel rapi) atau per hari.
   - Warna sel mencerminkan kondisi faktual: Emerald (`Healthy`), Amber (`Degraded` — Heap >85% / Event Loop P95 >50ms / 1–4 error), Rose (`Incident` — crash/restart tak terduga atau >=5 error), Slate (`No data / Down`). Hover menampilkan ringkasan jam tersebut (avg RAM, max CPU, error count).
3. **Services & Bridges Matrix (Pengganti `Apps Overview`):**
   Tabel tunggal yang sangat rapi dengan kolom: `Service`, `State`, `Mode`, `RAM`, `CPU / Latency`, `Errors (1h / 24h / 7d)`, `Uptime`, `Action`:
   - **Systemd Units VPS:**
     - `nexa-server.service` (`Active` · Node v22 · RSS + CPU + quick actions `Logs` & `Restart`)
     - `nexa-log.service` (`Idle / 0 MB` atau `Active · N conns` · Socket-activated)
     - `nexa-term.service` (`Idle / 0 MB` atau `Active` · Badge status Kill Switch `OFF`/`ON`)
     - `caddy.service` (`Active` · TLS reverse proxy)
   - **Connected Ecosystem Bridges:**
     - `Mobile Bridge` (Samsung A33 · `Online / Offline`, last heartbeat, WS latency)
     - `Windows Bridge` (ThinkPad · `Online / Offline`, last heartbeat)
4. **Runtime, Git Versioning & Quick Telemetry Row (2 Kartu Sejajar):**
   - **Runtime & Deployment Card:** Memperbaiki kelemahan `Versioning: N/A` di PM2+! Menampilkan **Git branch + short hash** (mis. `main @ 7c511ed`), pesan commit terakhir, badge `Clean` / `Unstaged changes`, `Node.js v22.x`, `PID`, `NODE_ENV=production`, `Restarts` (dari `systemd NRestarts`), dan waktu *last deploy*.
   - **N.E.X.A Live Telemetry Snapshot:** Tabel 2-kolom ringkas bergaya *key-value* monospace: `Active Handles`, `Active Requests`, `Live Voice Calls`, `AI Req/min`, `Offline Notif Queue`, `Enrolled Devices`.

---

### Halaman 2: `Metrics` (Realtime + Historical Time-Series)
*Menggabungkan `Realtime Metrics` (Free) dan `Metrics Histograms` (Paid) dalam satu antarmuka terpadu.*

#### Reasoning UX
Di PM2+, `Realtime Metrics` dan `Metrics Histograms` terpisah menjadi dua menu berbeda padahal grafiknya identik — bedanya hanya rentang waktu. Di `/monitor`, keduanya disatukan lewat satu **Segmented Time-Range Bar** yang responsif.

#### Komponen & Fitur
1. **Control Strip:**
   - **Time Range:** `Live (2s)` | `1h` | `6h` | `24h` | `7d` (seluruhnya gratis & instan).
   - **Live Status & Pause:** Indikator titik berkedip saat mode `Live`, tombol `Pause` untuk membekukan grafik saat sedang menginspeksi lonjakan, dan tombol `Reset Monit` (mereset histogram latency & peak sementara di memori).
   - **Quick Filter Tabs:** `All` | `System & V8` | `HTTP & Network` | `N.E.X.A Domain`.
2. **Engine Grafik Minimalis (`<canvas>` Native, Zero Library Bloat):**
   - Dibangun dengan modul Vanilla JS Canvas (~150–250 baris, `<5 KB`, dukungan HiDPI `devicePixelRatio`).
   - Fitur interaktif: **synchronized hover crosshair** (menggerakkan kursor di satu grafik menyelaraskan garis vertikal & tooltip angka tepat di semua grafik pada timestamp yang sama!), garis putus-putus ambang batas (*threshold line*, misal batas `Heap 320 MiB` atau `VPS RAM 892 MiB`), serta nilai `Current / Avg / Max` di sudut kanan atas tiap kartu grafik.
3. **Daftar Grafik per Grup (Grid 2 Kolom Rapi):**
   - **Grup A — System & V8 Runtime:**
     1. `CPU Usage (%)` — proses `nexa-server` + garis sekunder CPU total VPS.
     2. `Memory (RSS vs VPS Available)` — kurva `Node RSS` + `VPS MemAvailable` agar terlihat langsung ruang napas VPS `892 MiB`.
     3. `V8 Heap (Used vs Total & %)` — menggabungkan 3 grafik terpisah PM2 (`Heap Size`, `Used Heap Size`, `Heap Usage %`) menjadi 1 grafik *layered* yang jauh lebih informatif (tetap menampilkan ketiganya di legend & tooltip).
     4. `Event Loop Latency (Mean & P95)` — menggabungkan `Event Loop Latency` & `p95` dalam 1 grafik dual-line (`perf_hooks.monitorEventLoopDelay`).
   - **Grup B — HTTP & Concurrency:**
     5. `HTTP Throughput (req/min)` & `Active Requests`.
     6. `HTTP Latency (Mean & P95 ms)` — dari middleware timing ringan Express (ring buffer 1.000 sampel).
     7. `Active Handles` — dari `process.getActiveResourcesInfo()` untuk mendeteksi kebocoran socket/timer secara dini (seperti kasus kebocoran klien Supabase sebelumnya).
   - **Grup C — N.E.X.A Domain Metrics (Custom Metrics Khusus N.E.X.A):**
     8. `AI / LLM Operations` — `AI req/min` + `LLM Mean Response Latency` (chat & voice tool calls).
     9. `Bridges & Realtime Sessions` — status uptime `Mobile Bridge` & `Windows Bridge`, jumlah sesi `Live Call` aktif, dan ukuran antrian `Offline Catch-up Queue`.

---

### Halaman 3: `Logs` (Full-Screen Live Stream Console)
*Mengadopsi kenyamanan full-screen `Realtime Logs` PM2 Plus + kekuatan arsitektur `nexa-io` (`/io/logs`) yang sudah kita miliki.*

#### Reasoning UX
Pengalaman membaca log di desktop jauh lebih lega daripada HP. Halaman `Logs` dibuat *full-bleed* (memanfaatkan penuh lebar dan tinggi viewport) dengan kontrol yang tidak memakan lebih dari 1 baris tipis (`44px`), dan **langsung memakai Go sidecar `nexa-io` `/io/logs`** sehingga tetap berjalan meski `nexa-server` sedang restart.

#### Komponen & Fitur
1. **Single-Row Toolbar (`44px`):**
   - **Category Filter Pills:** `All`, `Errors` (`WARN+ERROR`), `Core`, `Bridge`, `Finance`, `Auth` — memetakan langsung ke `categoryMask` biner protokol `nexa-io` (`0x08`, `0x02`, `0x01`, `0x04`).
   - **Unit Filter Dropdown:** `All Units`, `nexa-server`, `caddy`, `nexa-io`, `systemd` (`unitMask` biner `0x0F`).
   - **Instant Search Input (`/` shortcut):** Filter substring / highlight lokal tanpa memutus stream WebSocket.
   - **Controls:** `Pause / Resume` (menghentikan konsumsi `CREDIT` sesuai protokol flow-control `nexa-io`), `Clear`, `Wrap Lines` toggle, dan counter `420 / 2,000 lines`.
2. **High-Legibility Monochrome Monospace Console (Bersih Putih Seragam):**
   - **Virtual Rendering:** Hanya merender baris yang terlihat di viewport dari ring buffer maks `2.000` baris (sama seperti standar PRD) agar tetap 60 FPS tanpa membebani browser.
   - **Tipografi Bersih Tanpa Warna-Warni:** Seluruh teks log (INFO, WARN, ERROR, hingga stack trace) tampil **putih bersih seragam** (`#E5E7EB` / `#F3F4F6` di Dark Mode; `#111827` di Light Mode) tanpa warna-warni baris, tanpa badge warna-warni, dan tanpa tint latar belakang merah/kuning — hanya kolom timestamp & nama unit di kiri yang sedikit lebih redup (`#6B7280`) agar mata tetap nyaman memindai log padat. Pemilahan level error cukup dilakukan lewat pill filter `Errors` atau pencarian instan.
   - **Kolom Terstruktur:** `[Timestamp WIB] [unit] [Message]` dalam satu aliran monospace rata.
   - **Collapsible Stack Traces:** Baris stack trace (`at ...`) otomatis dikelompokkan rapi dalam blok hairline netral monokrom di bawah baris error utama agar tidak membanjiri layar, bisa di-expand dengan 1 klik.
   - **Monochrome Minimap Scrollbar:** Strip `<canvas>` selebar `10px` di tepi kanan scrollbar dengan garis kepadatan monokrom netral untuk navigasi cepat dalam buffer 2.000 baris.
   - **Floating `Latest ↓` Pill:** Muncul otomatis saat Tuan scroll ke atas membaca histori (disertai badge `+N new` bila ada log baru masuk), klik untuk langsung melompat kembali ke baris terbaru.
3. **Keamanan & Privasi (`FR-SEC-04`):**
   - Seluruh redaksi token/secret sudah dikerjakan di sisi server (`nexa-io` `tokenSafetyRegex` + Node `redactSecrets`).
   - Tidak ada tombol export massal ke layanan cloud; hanya salin baris terpilih (*copy line/block*) untuk debugging lokal.

---

### Halaman 4: `Issues` (Realtime & Historical Error Tracker)
*Menggabungkan `Realtime Issues` (Free) dan `Historical Issues` (Paid) PM2+.*

#### Reasoning UX
Log mentah cepat bergulir dan error mudah terlewat. Halaman `Issues` merangkum **error yang dikelompokkan berdasarkan akar penyebab (fingerprint)** sehingga 50 error yang sama tidak muncul sebagai 50 baris terpisah, melainkan 1 item dengan counter `50x`.

#### Komponen & Fitur
1. **Summary Strip (4 Kartu Ringkas):**
   - `Last 1 Hour`, `Last 24 Hours`, `Last 7 Days`, dan `Unresolved Issues`.
2. **Filter & Search Bar:**
   - Filter status (`Unresolved` | `Resolved` | `All`), filter severity (`Fatal/Uncaught`, `HTTP 5xx`, `Subsystem Error`), dan pencarian pesan error.
3. **Grouped Issues Table:**
   - Setiap baris menampilkan:
     - **Fingerprint Title & Subsystem Tag** (`[SAFETY-NET]`, `[HTTP-5XX]`, `[LIVE-VOICE]`, `[FINANCE]`, `[BRIDGE]`, `[CRON]`).
     - **Events Count** (mis. `12x` + mini bar distribusi 24 jam).
     - **First Seen / Last Seen** (relatif & absolut WIB).
     - **Quick Action:** `Resolve` / `Jump to Logs` (membuka halaman `Logs` di sekitar waktu kejadian / filter `Errors`).
4. **Slide-Over Detail Drawer (Saat Klik Issue):**
   - Menampilkan pesan error lengkap, **stack trace terformat** (sudah melalui `redactSecrets`), metadata konteks aman (HTTP method + route path tersanitasi, tanpa header auth/body sensitif), versi Git commit saat error terjadi, dan riwayat 10 timestamp kemunculan terakhir.
5. **Sumber Data & Retensi Ringan:**
   - Terpasang pada hook `uncaughtException`, `unhandledRejection`, Express error middleware (`5xx`), serta helper `monitor.recordIssue(subsystem, err)` pada titik kritis `nexa-server`.
   - Disimpan dalam ring buffer terbatas (maks **200 grup issue unik** terakhir) di file JSON atomik `/var/lib/nexa/monitor_issues.json` (<150 KB disk) agar histori 7 hari tetap bertahan melewati restart server.

---

### Halaman 5: `Controls & Security` (Operasional, Alerts, & Sesi)
*Menggabungkan `Remote Actions` + `Notifications` PM2 Plus + Audit Keamanan PRD.*

#### Reasoning UX
Aksi destruktif/operasional (restart server, revoke sesi, aturan alert) dipisahkan secara sadar dari halaman pemantauan pasif agar tidak pernah terpencet tidak sengaja, namun tetap mudah dijangkau dalam 1 klik (atau via `Ctrl+K`).

#### Komponen & Fitur
1. **Service & Runtime Controls:**
   - **Restart `nexa-server` (Polkit):** Tombol dengan dialog konfirmasi 2-langkah (menunjukkan status Live Call aktif jika sedang ada panggilan suara agar tidak memutus panggilan secara tidak sengaja!). Setelah dikonfirmasi, memanggil `POST /monitor/api/actions/restart`, menampilkan *live restart stepper* (`Sending SIGTERM` → `Draining connections` → `Waiting for /health` → `Online with new PID`) sembari log boot tetap mengalir!
   - **Reset Runtime Metrics:** Mengosongkan histogram latency HTTP/Event Loop dan puncak sementara di memori (`RESET MONIT`).
   - **Remote Terminal Kill Switch (Read-Only):** Menampilkan status `/opt/nexa/etc/terminal.enabled` (`OFF` / `ON`) — sesuai PRD, pengaktifan tetap dilakukan via SSH VPS agar tidak melemahkan batas keamanan.
2. **Proactive Server Alerts → N.E.X.A Mobile Bridge:**
   - Menggantikan fitur berbayar *Notifications* PM2 Plus dengan menyalurkannya langsung ke **N.E.X.A Mobile Bridge** via `Notifier.js` (dengan fallback Telegram jika Mobile offline):
     - Toggle & ambang batas yang bisa dikonfigurasi:
       - `Fatal Uncaught Exception / Unexpected Restart` (default: ON)
       - `High Node RSS (> 300 MiB sustained 3 min)` (default: ON)
       - `Low VPS Available RAM (< 120 MiB sustained 3 min)` (default: ON)
       - `Event Loop Stall (P95 > 100 ms sustained 1 min)` (default: ON)
       - `Repeated 5xx Spike (>= 5 errors in 5 min)` (default: OFF/ON)
     - Dilengkapi *cooldown* 15 menit per aturan agar tidak terjadi badai notifikasi.
3. **Authentication, Credentials & Active Sessions:**
   - Informasi akun single-user (`NEXA_MONITOR_USER` dari `.env`, algoritma `scrypt` + `timingSafeEqual`) dengan panduan ubah password via CLI server (`node scripts/nexa_monitor_set_password.js`) agar rotasi kredensial tidak mengubah file sensitif secara sembarangan dari browser.
   - Daftar sesi browser `/monitor` aktif (IP, browser UA ringkas, waktu kedaluwarsa hingga 12 jam) + tombol `Sign Out All Sessions`.
   - **Security Audit Feed:** 50 catatan audit terakhir (login sukses/gagal, brute-force lockout, aksi restart server, pembuatan tiket log).

---

## 4. Arsitektur Teknis, Protokol, & Integrasi Codebase Nyata

### 4.1 Topologi & Routing Caddy (Resilient Design)
```text
Browser Desktop (ThinkPad)
  │
  ├── HTTPS GET  /monitor/*              ──▶ Caddy static file_server (/opt/nexa/monitor-web)
  │                                          [0 MB Node RAM; tetap bisa dibuka saat Node restart/crash]
  │
  ├── HTTPS/WSS  /monitor/api/*          ──▶ Caddy reverse_proxy ──▶ 127.0.0.1:3000 (nexa-server)
  │              /monitor/ws/metrics         [Gated by HttpOnly; Secure; SameSite=Strict session cookie]
  │                                          [Metrics push 2s hanya aktif saat tab terbuka]
  │
  └── WSS        /io/logs                ──▶ Caddy reverse_proxy ──▶ unix//run/nexa/log.sock (nexa-log)
                 (Sec-WebSocket-Protocol)    [Independen dari Node.js! Tetap live saat nexa-server restart]
```

### 4.2 Temuan Kritis Codebase: Koneksi Browser ke `nexa-io` (`/io/logs`)
Berdasarkan inspeksi langsung pada [streamer.go](file:///c:/workspace/nexa-server/nexa-io/internal/logstream/streamer.go#L347-L368):
- Saat ini `nexa-io` menolak `?ticket=` di query string (`FR-SEC-01`) dan **hanya** membaca header `Authorization: Bearer <ticket>`.
- **Fakta Browser API:** `new WebSocket(url)` di browser **tidak mengizinkan custom header `Authorization`**.
- **Solusi Bersih & Aman (Tetap Patuh `FR-SEC-01`):**
  1. Browser yang sudah terotentikasi meminta tiket sekali pakai (`45s TTL`, `scope=logs`, `dev=web-monitor-<sessionId>`) ke `POST /monitor/api/logs/ticket` (memakai `TicketService` Ed25519 yang sama di [ticket_service.js](file:///c:/workspace/nexa-server/src/core/auth/ticket_service.js)).
  2. Browser membuka `new WebSocket('wss://<domain>/io/logs', ['nexa-io-v1', 'nexa-ticket.' + ticket])`.
  3. Di `nexa-io/internal/logstream/streamer.go` & `internal/ws/conn.go`:
     - Tambahkan fallback ekstraksi tiket dari header `Sec-WebSocket-Protocol` (`nexa-ticket.<token>`) **hanya bila** header `Authorization` kosong.
     - Saat handshake `101 Switching Protocols`, `nexa-io` membalas **hanya** `Sec-WebSocket-Protocol: nexa-io-v1` (tiket tidak pernah dipantulkan kembali dan tidak pernah muncul di URL/history/access log Caddy).
     - Mobile Bridge Android tetap 100% tidak terpengaruh (tetap memakai `Authorization: Bearer`).

### 4.3 Skema Otentikasi `/monitor` (Single-User Username + Password, Zero Dependency)
Karena dashboard ini khusus untuk 1 operator tunggal (Tuan sendiri) dan harus tetap dapat diakses meskipun Supabase sedang bermasalah, otentikasi dibangun 100% mandiri memakai modul bawaan `node:crypto`:
1. **Kredensial `scrypt` di `.env` (Tanpa Plaintext & Tanpa Database Eksternal):**
   - Disetel via CLI lokal VPS (`node scripts/nexa_monitor_set_password.js`) yang menghasilkan `NEXA_MONITOR_USER` dan `NEXA_MONITOR_PASS_HASH` (format `scrypt$<N>$<r>$<p>$<saltHex>$<hashHex>`) untuk disimpan di `.env` (`chmod 0600`).
   - Proses login (`POST /monitor/api/auth/login`) membandingkan username dan turunan `crypto.scryptSync` memakai `crypto.timingSafeEqual` untuk mencegah *timing attack*.
2. **Keamanan Sesi, Cookie, & Anti Brute-Force:**
   - **Session Cookie:** Server menerbitkan ID sesi acak 256-bit (`crypto.randomBytes(32).toString('hex')`) yang disimpan di map sesi memori server (maks 4 sesi aktif, TTL 12 jam, *sliding* tidak melebihi batas keras 24 jam). Cookie bertanda `HttpOnly; Secure; SameSite=Strict; Path=/monitor`.
   - **CSRF Protection:** Semua mutasi (`POST/DELETE`) memvalidasi header `Origin` cocok dengan `NEXA_DOMAIN` (`cors_config.js`) + header kustom `X-Nexa-Monitor: 1`.
   - **Tameng Anti Brute-Force:** Maks **5 percobaan gagal dalam 15 menit** per IP → otomatis terkunci `HTTP 429` selama 15 menit, dicatat ke Security Audit Log, dan mengirim **alert keamanan ke Mobile Bridge / Telegram** via `Notifier.js`.
   - **Header Keamanan Caddy untuk `/monitor`:**
     - `Content-Security-Policy: default-src 'self'; connect-src 'self' wss://<domain>; style-src 'self'; script-src 'self'; img-src 'self' data:; frame-ancestors 'none'`
     - `X-Robots-Tag: noindex, nofollow`
     - `Cache-Control: no-store` untuk semua `/monitor/api/*`.

### 4.4 Penyimpanan Metrik Historis & Issues (Ultra-Ringan untuk VPS 892 MiB)
Agar grafik `1h / 6h / 24h / 7d` dan **7-Day Health Heatmap** berjalan tanpa database berat:
- **Sampler 1 Menit (`src/monitor/metrics_collector.js`):**
  - Menggunakan `perf_hooks.monitorEventLoopDelay({ resolution: 20 })` (selalu aktif dengan biaya CPU ~0.01%), middleware durasi HTTP (ring buffer 1.000 sampel terakhir ≈ 8 KB), `process.memoryUsage()`, `v8.getHeapStatistics()`, `process.cpuUsage()`, `/proc/meminfo`, `process.getActiveResourcesInfo()`, dan counter domain N.E.X.A.
  - Menyimpan **60 sampel terakhir (1 jam)** di memori (`~4 KB`).
  - Setiap **5 menit**, melakukan flush ke file ring buffer biner berukuran tetap `/var/lib/nexa/monitor_metrics_7d.bin`:
    - Kapasitas tetap: **10.080 slot** (7 hari × 1.440 menit) × **72 byte/slot** = **~726 KB total ukuran file permanen** (tidak pernah membengkak, tidak butuh `logrotate` atau *vacuum*).
    - Setiap slot memuat: `timestampSec`, `cpuPct`, `vpsAvailMb`, `rssMb`, `heapUsedMb`, `heapTotalMb`, `elMeanMs`, `elP95Ms`, `httpReqMin`, `httpMeanMs`, `httpP95Ms`, `activeHandles`, `activeReqs`, `issuesDelta`, `aiReqMin`, `aiMeanMs`, `flagsBitmask` (`mobileOnline`, `winOnline`, `liveCallActive`, `restarted`).
  - Saat browser meminta `6h / 24h / 7d`, server membaca irisan file biner (`<2 ms`), melakukan *LTTB/bucket downsampling* menjadi maksimal **180 titik** per grafik sebelum dikirim ke browser, lalu membebaskan buffer.
- **Realtime Push 2-Detikan (`/monitor/ws/metrics`):**
  - Timer `setInterval(..., 2000)` **hanya hidup jika `monitorWsClients.size > 0`**. Begitu tab terakhir ditutup, timer langsung di-`clearInterval()` (**0% CPU & 0 MB overhead saat idle**).
- **Restart Aman via Polkit (`51-nexa-monitor.rules`):**
  - Menambahkan aturan Polkit sempit di `/etc/polkit-1/rules.d/51-nexa-monitor.rules` (hanya mengizinkan user `nexa` menjalankan `restart` pada `nexa-server.service`, tanpa `sudo`).
  - Endpoint `POST /monitor/api/actions/restart` menulis audit log, mengembalikan `HTTP 202 Accepted`, lalu setelah delay `150 ms` mengeksekusi `systemctl --no-block restart nexa-server.service` sehingga systemd melakukan *graceful shutdown* (`SIGTERM`) dan menghidupkan proses baru secara bersih.

### 4.5 Struktur File Baru di `nexa-server`
```text
nexa-server/
├── src/
│   └── monitor/
│       ├── index.js                 # Facade & Express router (/monitor/api/*) + WS /monitor/ws/metrics
│       ├── metrics_collector.js     # perf_hooks, HTTP ring buffer, /proc/meminfo, N.E.X.A custom counters
│       ├── history_store.js         # Fixed-size 726 KB circular binary file (7d history + health heatmap)
│       ├── issue_tracker.js         # Deduplicated error fingerprinting + 200-issue atomic JSON store
│       ├── auth_service.js          # scrypt + timingSafeEqual login, anti brute-force & server-side session cookie
│       ├── systemd_inspector.js     # Read-only status unit (nexa-server/log/term/caddy) & Polkit restart
│       └── alert_engine.js          # Threshold evaluation + 15m cooldown -> Notifier.js (Mobile Bridge)
├── scripts/
│   └── nexa_monitor_set_password.js # CLI lokal untuk generate NEXA_MONITOR_USER & scrypt NEXA_MONITOR_PASS_HASH
├── deploy/systemd/
│   ├── nexa-server.service          # Unit systemd pengganti PM2 (MemoryHigh=320M, MemoryMax=420M)
│   └── 51-nexa-monitor.rules        # Polkit narrow restart rule untuk user nexa
└── tests/
    ├── monitor_metrics_store.test.js
    ├── monitor_issue_tracker.test.js
    └── monitor_auth_api.test.js

nexa-pulse-monitor/                  # Repo/folder frontend statis terpisah (disajikan Caddy di /monitor)
├── index.html                       # App shell + Login gate (Username + Password)
├── styles.css                       # Design tokens (Dark/Light), hairline layout, tabular-nums
└── js/                              # app.js, api.js, charts.js, logs_client.js, views/*
```

---

## 5. Rencana Fase Implementasi & Cutover Aman (PM2 → `systemd`)

Eksekusi dibagi menjadi **5 fase terukur** agar server produksi tidak pernah terganggu dan `/monitor` bisa diuji berdampingan dengan PM2 terlebih dahulu sebelum PM2 dilepas.

### Fase 5A: Fondasi Backend Telemetry, History Ring Buffer, & Issue Tracker
- Bangun `metrics_collector.js`, `history_store.js`, `issue_tracker.js`, `systemd_inspector.js`, dan `alert_engine.js`.
- Pasang middleware timing HTTP ringan & hook `uncaughtException`/`unhandledRejection`/`5xx` di [app.js](file:///c:/workspace/nexa-server/src/app.js) serta ekspos counter domain di Bridge/Live Voice/AI router (tanpa mengubah logika bisnis).
- Tulis unit test lengkap (`monitor_metrics_store.test.js`, `monitor_issue_tracker.test.js`).
- **Verifikasi:** Overhead RAM Node < 3 MB, file history stabil 726 KB, seluruh test suite `npm test` lulus 100%.

### Fase 5B: Keamanan, Otentikasi `scrypt` Session, & `nexa-io` Subprotocol
- Bangun `auth_service.js`, endpoint `/monitor/api/*`, `/monitor/ws/metrics`, dan CLI `scripts/nexa_monitor_set_password.js`.
- Tambahkan dukungan fallback `Sec-WebSocket-Protocol: nexa-ticket.<token>` di `nexa-io/internal/logstream/streamer.go` + unit test Go (`go test -race ./...`).
- Tambahkan unit test keamanan (`monitor_auth_api.test.js`: 401 tanpa sesi, CSRF Origin check, `scrypt` verification, brute-force lockout, tiket single-use).
- **Verifikasi:** Akses tanpa sesi ditolak `401`, tidak ada tiket di URL query, login Username + Password + lockout berfungsi akurat.

### Fase 5C: Frontend Minimalis Vanilla (`nexa-pulse-monitor/`) — 6 Layar
- Bangun UI statis di folder/repo `nexa-pulse-monitor/` mengacu desain Stitch proyek `7542566404729596731` (Dark/Light theme, `Overview`, `Metrics`, `Logs` putih bersih monokrom, `Issues`, `Controls`, `Sign In` Username + Password, `Ctrl+K` palette).
- Integrasikan binary decoder protokol `nexa-io` (`logs_client.js`) + minimap monokrom + `Latest ↓` + virtual scrolling 2.000 baris.
- **Verifikasi:** Uji visual & responsif di browser desktop, cek CSP `default-src 'self'` bebas pelanggaran di DevTools, cek 0 polling & 0 WS saat tab ditutup.

### Fase 5D: Deploy Side-by-Side di VPS (PM2 Masih Aktif)
- Update `Caddyfile` di VPS: mount static `/monitor` → `/opt/nexa/nexa-pulse-monitor`, proxy `/monitor/api/*` & `/monitor/ws/metrics` → `127.0.0.1:3000`.
- Rebuild binary `nexa-io` dengan dukungan subprotocol browser, setel `NEXA_MONITOR_USER` & `NEXA_MONITOR_PASS_HASH` di `.env` VPS via CLI.
- **Verifikasi Side-by-Side:** Bandingkan angka CPU, RSS, Heap, Event Loop, HTTP Latency, dan Live Logs di `/monitor` langsung terhadap `app.pm2.io` untuk memastikan akurasi 1:1.

### Fase 5E: Migrasi PM2 → `systemd` & Pelepasan PM2 (+47 MB RAM)
1. Pasang `/etc/systemd/system/nexa-server.service` (`NODE_OPTIONS=--max-old-space-size=320`, `MemoryHigh=320M`, `MemoryMax=420M`, log ke `journald`) dan `/etc/polkit-1/rules.d/51-nexa-monitor.rules`.
2. Perbarui [deploy.sh](file:///c:/workspace/nexa-server/deploy.sh) agar me-restart `nexa-server.service` via `systemctl` (bukan `pm2 restart`).
3. **Cutover:** `pm2 stop nexa-server` → `sudo systemctl enable --now nexa-server.service`.
4. **Verifikasi Penuh:** Cek `/health`, `/ws` (Mobile & Windows Bridge), Telegram, Live Call, tombol **Restart `nexa-server`** langsung dari `/monitor` sambil melihat log boot mengalir live tanpa putus di `/io/logs`.
5. **Masa Observasi & Pembersihan Final (24–48 jam pasca-cutover):** Setelah stabil, jalankan `pm2 kill && pm2 unstartup`, hapus pembacaan file log PM2 dari `nexa-log.service` (100% murni `journald`), dan verifikasi kenaikan `MemAvailable` (~45–50 MB) via `free -m` dan tampilan `/monitor`.

---

## 6. Estimasi Dampak Resource VPS (Target Terukur)

| Komponen | Sebelum (PM2 + PM2+) | Sesudah (`/monitor` + `systemd`) | Selisih |
|---|---|---|---|
| Process Manager Overhead | ~47 MB (`PM2 God Daemon` + agen `PM2+`) | **0 MB** (`systemd` kernel bawaan) | **-47 MB** |
| `/monitor` saat browser ditutup | — | **~1–2 MB RAM** (collector + 1h buffer + issue map) | +1–2 MB |
| `/monitor` saat browser dibuka | — | **+2–4 MB** (Node WS) + `nexa-log` on-demand (`<=36 MB`, mati 90s idle) | Sementara saja |
| Disk Historis 7 Hari + Issues | Cloud `pm2.io` (berbayar) | **< 900 KB** permanen di `/var/lib/nexa/` (fixed ring) | < 1 MB disk |
| **Netto `MemAvailable` VPS Standby** | **~295 MB** | **~340+ MB** | **+45 MB lebih lega** |

---

## 7. Keputusan Terkunci (Siap Eksekusi)
1. **Nama Resmi & Repo:** **`N.E.X.A Pulse Monitor`** dengan folder/repo frontend **`nexa-pulse-monitor`** (disajikan statis oleh Caddy di `/monitor`), sementara backend telemetry & API (`src/monitor/`) serta `nexa-io` berada di `nexa-server`.
2. **Metode Login:** Single-user **Username + Password** (`scrypt` + `timingSafeEqual` di `.env`, zero external auth/Supabase dependency, server-side `HttpOnly; Secure; SameSite=Strict` session cookie, lockout 5x gagal/15m + alert ke Mobile Bridge/Telegram).
3. **Desain Visual:** Proyek Stitch `7542566404729596731` disetujui & dikunci (minimalis gelap `#090B10` / `#10131A`, dengan `Logs` tampil putih bersih monokrom seragam).
4. **Urutan Kerja:** Langsung mengeksekusi bertahap dari **Fase 5A → 5E** (perubahan Opsi 1 Mobile Bridge dibiarkan terpisah).
