# PRD — N.E.X.A Mobile Bridge: AI Control Center

| | |
|---|---|
| **Versi** | 1.2 (Code-Grounded Alignment - 20 November 2026) |
| **Tanggal** | 20 November 2026 |
| **Status** | **Tahap 0 & Audit Kode Selesai.** Gerbang menuju Tahap 1 terbuka. PM2 dipertahankan sementara sampai Mobile Bridge selesai (migrasi PM2->systemd & `/monitor` di Tahap 5) |
| **Pemilik produk** | Pemilik tunggal (owner-operator) |
| **Platform klien** | Samsung Galaxy A33 5G (`SM-A336E`), Android 16 (API 36), One UI 8.0 (`PAGE_SIZE = 4096`). Kotlin + Jetpack Compose (`com.nexa.mobilebridge`) |
| **Platform server** | Ubuntu Linux VPS (Azure saat ini, `systemd 255`, `cgroup2`, Node.js CommonJS `src/app.js`; akan pindah ke 2-6 GB RAM / 2 vCPU) |
| **Dokumen terkait** | Architecture Plan v2.4 (`NEXA_MOBILE_BRIDGE_CONTROL_CENTER_PLAN.md`). Koreksi sebelumnya tercatat di Lampiran E |

> **Cara membaca angka di dokumen ini.** Angka baseline HP (`48,6 MB` standby dan `91,6 MB` UI aktif pada build `DEBUGGABLE`), kernel page size (`4096` byte), audit WakeLock, dan baseline VPS (`892 MB` RAM, `596 MB` used, `295 MB` *available*) merupakan **hasil pengukuran nyata pada 20 November 2026**. Angka target fitur baru (Chat, Log, Terminal) telah dikalibrasi ulang berdasarkan basis nyata tersebut.

---

## Daftar Isi

1. Ringkasan Eksekutif
2. Latar Belakang & Masalah
3. Tujuan, Non-Tujuan, dan Metrik Keberhasilan
4. Pengguna & Skenario Penggunaan
5. Lingkup & Fase Rilis
6. Kebutuhan Fungsional
7. Kebutuhan Non-Fungsional
8. Keamanan & Privasi
9. Arsitektur Tingkat Tinggi & Keputusan Utama
10. Spesifikasi Antarmuka (Protokol)
11. Model Data
12. Kebutuhan UX
13. Siklus Hidup, Memori, & Baterai
14. Observability & Audit
15. Roadmap & Kriteria Keluar Tiap Tahap
16. Strategi Pengujian & Kriteria Rilis
17. Risiko & Mitigasi
18. Asumsi, Dependensi, & Pertanyaan Terbuka
19. Lampiran (A: Unit systemd, B: Caddyfile, C: Otentikasi, D: Glosarium, E: Koreksi atas v2.2)

---

## 1. Ringkasan Eksekutif

**N.E.X.A Mobile Bridge** saat ini adalah jembatan perangkat keras ringan di HP: foreground service yang menyediakan sensor on-demand dan mengeksekusi perintah perangkat (senter, volume, kunci layar, kamera). Produk ini akan ditransformasi menjadi **Pusat Kontrol AI Mandiri** dengan tiga kemampuan baru:

1. **Chat AI native** langsung ke N.E.X.A Server (menggantikan ketergantungan pada Telegram), dengan kustomisasi notifikasi, suara/TTS lokal, tema, dan avatar mata ekspresif.
2. **Monitor log server realtime**: log systemd/journald (N.E.X.A Server, Caddy, dll.) mengalir ke layar HP hanya saat dilihat.
3. **Terminal shell inspeksi** ke VPS: terminal interaktif penuh (ANSI, kursor, auto-complete oleh bash) yang dirender native di HP.

Prinsip desain yang tidak dapat ditawar:

- **Native penuh** (Kotlin + Compose). Tidak memakai WebView.
- **Anggaran sumber daya ketat**: RAM HP ramping, tidak memicu thermal throttling Exynos 1280, hemat baterai; RAM VPS sangat terbatas (`available` 295 MB saat ukur 20 Nov 2026), sehingga fitur berat harus **nol biaya saat tidak dipakai**.
- **100% open-source dan gratis.**
- **Tanpa AccessibilityService**, agar aplikasi mobile banking tidak memblokir perangkat.
- **Aman secara default**: jalur terminal dan data keuangan dilindungi tanda tangan perangkat yang terikat biometrik, bukan token statis.

---

## 2. Latar Belakang & Masalah

### 2.1 Kondisi saat ini

**Klien (HP)**

- Aplikasi native Kotlin + Jetpack Compose (`com.nexa.mobilebridge`), berjalan sebagai Foreground Service `START_STICKY` (`connectedDevice|specialUse|microphone`) dengan notifikasi persisten.
- Fitur: sensor on-demand (baterai, rotasi, status layar, geofencing), eksekutor perangkat keras, `NexaExpressiveEyes` (mata robot vektor 60 fps di Canvas Compose), dan Live Voice full-duplex via WebSocket.
- Memori terukur (build `DEBUGGABLE`, 20 Nov 2026 via `dumpsys meminfo com.nexa.mobilebridge`): **`48,6 MB` (`49.768 KB` TOTAL PSS)** saat standby (`Activities: 0`), dan **`91,6 MB` (`93.825 KB` TOTAL PSS)** saat UI aktif dibuka (`Activities: 1`, `Graphics: 19.183 KB`).
- Temuan audit baterai (20 Nov 2026): `NexaBridgeService.kt` saat ini menahan `PARTIAL_WAKE_LOCK` (`NexaBridge::WakeLock` terukur aktif >10 jam 32 menit) dan `WifiLock` (`WIFI_MODE_FULL_LOW_LATENCY`) terus-menerus sejak `onCreate()`, serta masih memiliki watchdog referensi `NexaAccessibilityService`. Keduanya wajib dibersihkan.

**Server (VPS)**

- Azure Ubuntu VM ekonomis: RAM 892 MB + 2.047 MB swap. Terukur pada 20 Nov 2026 (`free -m`): used `596 MB` (swap used `260 MB`), **`available 295 MB`**. Systemd versi `255 (255.4-1ubuntu8.18)`, `cgroup2` aktif, `/usr/bin/ss` tersedia.
- Caddy v2 (Automatic HTTPS, TLS 1.3) mereverse-proxy ke Node.js di `localhost:3000`.
- Jalur HP ke server: `wss://` dengan Bearer token (`crypto.timingSafeEqual` saat HTTP Upgrade).
- Server ini bersifat sementara. Rencana pindah ke VPS 2-6 GB RAM / 2 vCPU.

### 2.2 Masalah yang diselesaikan

| # | Masalah | Dampak |
|---|---|---|
| P1 | Interaksi dengan N.E.X.A harus lewat Telegram | Ketergantungan pihak ketiga, tidak ada kesadaran konteks perangkat, tidak ada kustomisasi |
| P2 | Memeriksa log server mengharuskan SSH dari laptop atau dashboard web | Lambat untuk pengecekan 10-30 detik (misalnya memastikan transaksi sukses) |
| P3 | Tidak ada akses shell dari HP | Diagnosis darurat bergantung pada laptop |
| P4 | Autentikasi hanya Bearer token statis | Kebocoran token berarti kendali penuh. Tidak boleh dibawa ke fitur terminal dan keuangan |

### 2.3 Kendala teknis (pemicu keputusan desain)

- **K1 — Thermal & GC di Exynos 1280:** terlalu banyak thread latar belakang, alokasi string berulang, dan GC terus-menerus menyebabkan micro-stutter dan panas.
- **K2 — RAM VPS:** fitur terminal dan log dilarang memakan ratusan MB atau memicu OOM pada Node.js.
- **K3 — Tanpa Accessibility:** tidak ada otomasi UI lintas aplikasi. Semua kontrol perangkat memakai API resmi.
- **K4 — Android 15/16:** pembatasan foreground service (tipe wajib, timeout tipe tertentu) dan dukungan page size 16 KB untuk library native.

---

## 3. Tujuan, Non-Tujuan, dan Metrik Keberhasilan

### 3.1 Tujuan

| ID | Tujuan |
|---|---|
| G1 | Chat AI native yang responsif dan hemat sumber daya, dengan riwayat offline-first |
| G2 | Log server realtime yang mengalir hanya saat dilihat, dengan filter dan pewarnaan |
| G3 | Terminal inspeksi interaktif dengan fidelitas ANSI baik dan input yang andal di keyboard virtual |
| G4 | Otentikasi perangkat berbasis hardware (Android Keystore + biometrik) untuk terminal, log, dan aksi keuangan |
| G5 | Biaya nol saat idle di VPS (socket activation) dan batas sumber daya keras per layanan |
| G6 | Migrasi VPS ke spesifikasi lebih besar tanpa mengubah aplikasi HP |

### 3.2 Non-Tujuan (di luar lingkup rilis ini)

| ID | Non-Tujuan | Catatan |
|---|---|---|
| NG1 | Shell admin dengan `sudo` dari HP (`nexa-admin`) | Ditunda. Tugas admin dilakukan via SSH dari laptop |
| NG2 | WebView / xterm.js | Ditolak karena biaya RAM dan panas |
| NG3 | AccessibilityService | Batasan keras (K3) |
| NG4 | Multi-pengguna / multi-perangkat | Satu pemilik, satu perangkat terdaftar |
| NG5 | Sesi terminal persisten otomatis (`tmux` auto-attach) | Pekerjaan lanjutan. Rilis awal hanya resume pendek |
| NG6 | Push notification berbasis FCM | Bukan open-source. Opsi UnifiedPush/ntfy dievaluasi kemudian |
| NG7 | Penyimpanan log jangka panjang di HP | Buffer sementara berukuran tetap saja |
| NG8 | Port iOS atau perangkat lain | Hanya Android pada A33 |

### 3.3 Metrik keberhasilan (dikalibrasi ulang pasca ukur Tahap 0 pada build `DEBUGGABLE`)

| Metrik | Target | Cara ukur |
|---|---|---|
| PSS aplikasi, standby layar mati (`Activities: 0`) | ≤ 55 MB *(baseline terukur: 48,6 MB)* | `adb shell dumpsys meminfo com.nexa.mobilebridge` |
| PSS aplikasi, chat aktif | ≤ 110 MB *(basis UI terukur: 91,6 MB)* | idem |
| PSS aplikasi, log atau terminal terbuka | ≤ 115 MB *(basis UI terukur: 91,6 MB)* | idem |
| PSS puncak (voice + berpindah tab) | ≤ 135 MB | idem |
| *Available* RAM VPS saat semua sidecar idle | ≥ baseline terukur saat ini (+ penghematan PM2) | `free -m` (kolom *available*) |
| Tambahan RAM VPS saat log + terminal aktif | ≤ 60 MB total (sidecar + bash + journalctl) | `systemd-cgls`, `memory.current` |
| Overhead pemrosesan server per ketikan terminal | ≤ 10 ms (di luar RTT jaringan) | Log waktu internal sidecar |
| Latensi *echo* ketikan terminal | Dicatat saat Tahap 0, target awal p95 ≤ 250 ms di jaringan seluler | Uji lapangan |
| Jank frame saat streaming chat | Tidak ada frame > 32 ms yang dapat dikaitkan dengan GC pada sesi streaming 60 detik | Perfetto / JankStats |
| Penghentian stream saat layar mati | 0 stream log dan 0 beban terminal aktif ≤ 5 detik setelah layar mati | Pengamatan server (`ss`, `systemctl`) |
| Penambahan konsumsi baterai standby akibat fitur baru | ≤ 5% relatif terhadap baseline selama 8 jam layar mati | `dumpsys batterystats` / Battery Historian |

---

## 4. Pengguna & Skenario Penggunaan

### 4.1 Persona

**Pemilik-operator (pengguna tunggal).** Mengelola layanan N.E.X.A pribadi (termasuk otomasi keuangan) di VPS, mengandalkan HP sebagai alat kontrol harian. Terbiasa teknis (Linux, Node.js), sensitif terhadap baterai dan privasi.

### 4.2 Skenario utama

| ID | Skenario |
|---|---|
| UC1 | Mengobrol dengan N.E.X.A di HP. N.E.X.A tahu kondisi perangkat (baterai, layar, geofence) dan dapat menyalakan senter atau mengunci layar |
| UC2 | Membuka tab log 10-30 detik untuk memastikan sebuah transaksi atau job berhasil, lalu menutupnya |
| UC3 | Membuka terminal untuk `htop`, `systemctl status`, atau `git status`, dan merestart `nexa-server` saat bermasalah |
| UC4 | Meminta N.E.X.A melakukan aksi keuangan. HP meminta konfirmasi biometrik atas detail aksi yang persis |
| UC5 | Menerima pengingat atau pesan proaktif N.E.X.A saat aplikasi tertutup dan membalas langsung dari notifikasi |
| UC6 | Memindahkan seluruh backend ke VPS baru tanpa memperbarui aplikasi |
| UC7 | Memantau CPU, RAM/Heap, Event Loop Latency, log realtime, dan restart `nexa-server` dari browser desktop (`/monitor`) secara privat tanpa layanan pihak ketiga `pm2.io` |

---

## 5. Lingkup & Fase Rilis

| Fase | Isi | Prasyarat |
|---|---|---|
| **Tahap 0** | Audit & baseline: ukur memori HP/VPS, `PAGE_SIZE`, uji IME di A33, audit kode mendalam (`[SELESAI]`) | Tidak ada |
| **Tahap 1** | Fondasi Server Ringkas + Core Hygiene HP: domain/Caddy, izin berkas, keypair Ed25519, redaksi `logger.js`, fix `WakeLock`/`WifiLock`, bersihkan `AccessibilityService`, kerangka 4 tab (PM2 tetap aktif sementara) | Tahap 0 |
| **Tahap 1.5** | **Identitas Perangkat**: enrollment CLI (`scripts/nexa-enroll.js`), kunci Keystore ECDSA, layanan challenge JSON di `/ws`, verifikator tiket Go, rate limit, audit log | Tahap 1 |
| **Tahap 2** | Chat native (`mobile_chat` JSON `/ws`, Room + Paging 3) + Modal Bottom Sheet step-up keuangan | Tahap 1.5 |
| **Tahap 3** | Log monitor on-demand (`nexa-log`: journald + file log PM2 selama transisi) | Tahap 1.5 |
| **Tahap 4** | Terminal inspeksi (`nexa-term`) + resume 64 KB + 9-key 44x48 dp Accessory Bar | Tahap 1.5, 3 |
| **Tahap 5** | **Pasca-Selesai Mobile Bridge:** Desktop Web Monitor `/monitor` (paritas metrik PM2+), migrasi penuh PM2 -> `nexa-server.service` systemd (+47 MB RAM), alihkan `nexa-log` ke 100% journald, aktifkan Polkit restart | Tahap 4 |
| **Ditunda** | `nexa-admin`, `tmux` auto-attach, UnifiedPush, multi-perangkat | Setelah Tahap 5 stabil |

---

## 6. Kebutuhan Fungsional

Prioritas: **P0** wajib untuk rilis fase terkait, **P1** sebaiknya ada, **P2** opsional/ditunda.

### 6.1 Core Bridge (eksisting, dipertahankan)

| ID | Kebutuhan | Prio | Kriteria penerimaan |
|---|---|---|---|
| FR-CORE-01 | Foreground service tetap berjalan dengan tipe yang dideklarasikan: `specialUse` (telemetri/hardware) dan `microphone` (sesi suara) | P0 | Manifest mendeklarasikan tipe. Layanan tidak dihentikan sistem akibat timeout tipe |
| FR-CORE-02 | Sensor on-demand (baterai, rotasi, status layar, geofence) dan eksekutor perangkat (senter, volume, kunci layar, kamera) tetap berfungsi | P0 | Regresi fungsional lulus |
| FR-CORE-03 | **Tidak** memakai AccessibilityService | P0 | Tidak ada deklarasi atau penggunaan layanan aksesibilitas di manifest atau kode |
| FR-CORE-04 | WakeLock/WifiLock hanya ditahan selama transfer aktif dan dilepas saat idle | P0 | Audit kode terdokumentasi (Tahap 0). `dumpsys power` tidak menunjukkan WakeLock persisten saat idle |
| FR-CORE-05 | Loop animasi mata 60 fps berhenti saat UI tidak terlihat atau layar mati | P0 | Tidak ada callback frame saat `Lifecycle < STARTED` (Perfetto) |
| FR-CORE-06 | Kontrol perangkat via chat dieksekusi lokal oleh `DeviceCommandDispatcher` tanpa round-trip tambahan setelah intent diterima | P1 | Perintah "nyalakan senter" selesai ≤ 500 ms setelah pesan dipahami (di luar waktu inferensi) |
| FR-CORE-07 | **Layar HUD / Bridge Status** dipertahankan dan ditingkatkan: menampilkan status WS-A (`domain:443`) & WS-B ("Tidak terhubung (on-demand)"), ringkasan konteks sensor nyata (baterai, status layar, status WakeLock, geofence tanpa metrik fiktif), riwayat eksekusi `DeviceCommandDispatcher` rata-kiri (perintah keuangan disamarkan), serta tombol hentikan layanan yang dilindungi *hold-to-confirm*/dialog (≥ 48 dp). Tanpa tombol `Banking Shield` (karena `AccessibilityService` dihapus) dan tanpa `Restart Bridge` yang ambigu | P0 | Status akurat tanpa polling latar tambahan. Penghentian FGS tidak bisa terjadi karena salah sentuh 1-klik |

### 6.2 Chat AI Native

| ID | Kebutuhan | Prio | Kriteria penerimaan |
|---|---|---|---|
| FR-CHAT-01 | Antarmuka obrolan dengan `LazyColumn` (`reverseLayout = true`), top bar avatar mata, dan kolom input | P0 | Pesan baru muncul di bawah. Keyboard muncul tanpa merusak posisi scroll |
| FR-CHAT-02 | Riwayat disimpan di Room (offline-first). Dapat dibaca saat offline | P0 | Mode pesawat: riwayat tampil lengkap |
| FR-CHAT-03 | Paging 3 dengan `pageSize=20`, `prefetchDistance=5`, `enablePlaceholders=false`, **`maxSize=100`** | P0 | Scroll ke riwayat lama tidak menambah item di memori di atas 100 (diverifikasi lewat heap dump) |
| FR-CHAT-04 | Streaming token dikumpulkan di memori dan dikirim ke UI per ~33 ms. UI tidak diperbarui per token | P0 | Pada streaming 60 detik, tidak ada pembaruan state UI lebih sering dari ~30 kali/detik |
| FR-CHAT-05 | Satu **channel token per stream**. Channel ditutup saat `STREAM_FINAL`, dibatalkan saat `ERROR_ABORT` | P0 | Dua stream berurutan tidak saling mencampur token |
| FR-CHAT-06 | Penulisan ke Room: sisipkan baris `STREAMING` di awal, **checkpoint tiap ~5 detik**, finalisasi sekali di akhir | P0 | Proses dimatikan di tengah stream: pesan tersisa dengan isi terakhir checkpoint (maks 5 detik hilang) |
| FR-CHAT-07 | Finalisasi berjalan di `NonCancellable`. Status: `SENT` jika selesai, `INTERRUPTED` jika dibatalkan atau error, `FAILED` jika pengiriman gagal | P0 | Pembatalan coroutine tidak meninggalkan baris di `STREAMING` |
| FR-CHAT-08 | Deduplikasi dengan `clientMsgId` (UUID dari klien) dan **indeks unik** `(clientMsgId, role)` | P0 | Pengiriman ulang setelah reconnect tidak menggandakan pesan |
| FR-CHAT-09 | Antrean pengiriman offline: pesan `SENDING` dikirim ulang idempoten dengan `clientMsgId` yang sama saat koneksi pulih. Setelah batas percobaan menjadi `FAILED` dengan tombol kirim ulang | P1 | Putus koneksi 30 detik saat mengirim: pesan terkirim tepat satu kali setelah pulih |
| FR-CHAT-10 | **Resume chat**: setelah reconnect, klien mengirim `{client_msg_id, last_seq}`. Server mengirim ulang chunk yang terlewat (buffer balasan terbaru disimpan beberapa menit) | P1 | Putus koneksi di tengah stream: balasan lengkap tanpa duplikasi setelah pulih |
| FR-CHAT-11 | Markdown dirender inkremental: hanya blok terakhir yang di-parse ulang | P1 | Tidak ada parse ulang seluruh pesan pada tiap pembaruan |
| FR-CHAT-12 | Konteks perangkat (baterai, status layar, gerak, geofence) disertakan sebagai konteks N.E.X.A | P1 | Pertanyaan "baterai berapa?" dijawab dengan nilai terkini |
| FR-CHAT-13 | Avatar mata merespons state `IDLE`, `LISTENING`, `THINKING`, `STREAMING`, `ALERT` | P1 | Transisi state sesuai peristiwa chat |
| FR-CHAT-14 | **Notifikasi cerdas**: heads-up dengan *Direct Reply* saat aplikasi tertutup | P1 | Balasan dari bilah notifikasi sampai ke N.E.X.A tanpa membuka aplikasi |
| FR-CHAT-15 | Nada notifikasi kustom lewat `NotificationChannel` (mengubah nada berarti membuat channel baru). URI audio memakai izin persisten SAF | P2 | Nada pilihan terdengar pada pesan baru setelah aplikasi dimulai ulang |
| FR-CHAT-16 | TTS lokal (`TextToSpeech` bawaan perangkat). Tombol baca pada setiap balon N.E.X.A | P1 | Berfungsi tanpa internet |
| FR-CHAT-17 | Haptik halus (`EFFECT_TICK`) saat kirim dan tombol utama | P2 | Dapat dimatikan di pengaturan |
| FR-CHAT-18 | Kustomisasi tema visual (warna aksen, mode gelap/terang) | P2 | Pilihan tersimpan antar sesi |
| FR-CHAT-19 | **`intent_hint` dari klien hanya petunjuk UI, bukan penentu keamanan** (lihat FR-AUTH-07) | P0 | Mengubah `intent_hint` tidak mengubah keputusan otorisasi di server |

### 6.3 Log Monitor

| ID | Kebutuhan | Prio | Kriteria penerimaan |
|---|---|---|---|
| FR-LOG-01 | Tab log membuka koneksi B (`/io/logs`) hanya saat tab terlihat. Server mengirim `tail` baris terakhir lalu mengalir realtime | P0 | Sebelum tab dibuka: tidak ada proses `nexa-log` maupun `journalctl` |
| FR-LOG-02 | Sumber tunggal: journald (`journalctl -f -o json`) untuk unit whitelist: `nexa-server`, `caddy`, dan unit sistem terpilih. Klien **tidak** boleh menentukan nama unit mentah | P0 | Permintaan unit di luar whitelist ditolak |
| FR-LOG-03 | Streaming berhenti dan buffer lokal dikosongkan saat (a) composable keluar dari layar, **atau** (b) `ON_STOP` (layar mati/pindah aplikasi). Dipulihkan saat `ON_START` | P0 | Layar dikunci: ≤ 5 detik kemudian tidak ada `journalctl` aktif untuk sesi ini. Tidak ada langganan ganda saat masuk layar |
| FR-LOG-04 | Format record log biner terstruktur (lihat §10.3) dengan prioritas, unit, dan kategori | P0 | Parser klien dan server lolos uji golden-file |
| FR-LOG-05 | Filter sisi server: `unit_mask`, `min_prio`, `cat_mask`, `tail` pada payload `OPEN` | P0 | Filter `FINANCE` hanya menerima record berkategori itu |
| FR-LOG-06 | Pewarnaan per prioritas dan chip filter `ALL`, `FINANCE`, `BRIDGE`, `ERRORS ONLY` | P1 | Chip mengubah langganan (bukan hanya tampilan) |
| FR-LOG-07 | Server menggabungkan baris per 150 ms, membatasi ≤ ~200 baris/detik, dan membuang yang tertua dengan penanda "N baris dilewati" saat lonjakan | P0 | Banjir 10.000 baris/detik tidak membuat RAM sidecar melewati batas |
| FR-LOG-08 | Kategori `FINANCE`/`BRIDGE`/`AUTH` dibawa lewat **awalan pesan** `[cat=NAMA] ` yang diurai dan dibuang oleh sidecar | P0 | Pesan tanpa awalan mendapat `cat_flags=0` |
| FR-LOG-09 | Buffer HP: ring berukuran tetap (2.000 entri) dengan akses indeks aman (`getOrNull`) dan key item berupa nomor urut stabil | P0 | Tidak ada crash saat `clear()` di tengah komposisi |
| FR-LOG-10 | Kontrol Pause/Resume bersifat tingkat protokol (menahan `CREDIT`). Pause > 5 menit menutup stream | P1 | Saat pause, buffer HP tidak bertambah dan log tidak hilang di journald |
| FR-LOG-11 | Tombol auto-scroll dan "Clear Local Buffer" (hanya lokal) | P2 | Server tidak terpengaruh |
| FR-LOG-12 | `FLAG_SECURE` aktif selama layar log tampil (lihat FR-SEC-06) | P0 | Screenshot/perekaman layar diblokir |
| FR-LOG-13 | Akses memerlukan tiket `scope=logs` (lihat FR-AUTH) | P0 | Tanpa tiket valid: koneksi ditolak |

### 6.4 Terminal Inspeksi

| ID | Kebutuhan | Prio | Kriteria penerimaan |
|---|---|---|---|
| FR-TERM-01 | Shell interaktif `/bin/bash -l` melalui PTY (`creack/pty`) sebagai user `nexa-term` tanpa `sudo` | P0 | `id` menunjukkan `nexa-term` tanpa grup istimewa. `sudo -n true` gagal |
| FR-TERM-02 | Emulator terminal native (`termlib`/libvterm, atau emulator Java Termux yang di-vendor) dengan ANSI 256 warna/TrueColor, UTF-8, tebal/garis bawah, kursor | P0 | `htop`, `nano`, `vim` (bila terpasang) tampil benar |
| FR-TERM-03 | Keputusan engine ditetapkan di Tahap 0 berdasarkan audit alignment `.so` (16 KB) | P0 | Hasil audit terdokumentasi. Engine terpilih lolos |
| FR-TERM-04 | `Ctrl+C`/`Ctrl+Z` menghasilkan `SIGINT`/`SIGTSTP`. Auto-complete (Tab) dikerjakan bash/readline di server | P0 | `Tab` melengkapi perintah. `Ctrl+C` menghentikan `ping` |
| FR-TERM-05 | Resize `rows×cols` dikirim saat keyboard muncul/hilang atau rotasi (debounce ~150 ms), menghasilkan `SIGWINCH` | P0 | `htop` menyesuaikan ukuran tanpa rusak |
| FR-TERM-06 | Input melalui `TerminalInputSink` (field tak terlihat dengan sentinel `\u200B`, `KeyboardType.Password` dengan `VisualTransformation.None`, `autoCorrectEnabled=false`). Enter → `0x0D`, Backspace → `0x7F`, Tab → `0x09` *(catatan Tahap 0: `VisiblePassword` tidak ada di Compose BOM 2026.03.01; `Password` lulus uji A33)* | P0 | Hasil uji IME di A33 tercatat (Tahap 0: saran kata mati, `comp=null`, swipe mati, Enter=`0x0D`, Backspace=`0x7F`, CTRL+c=`0x03`) |
| FR-TERM-07 | `ModifierState` (CTRL/ALT sticky: sekali pakai, kunci, nonaktif) dibagi satu instans antara accessory bar dan input sink | P0 | `CTRL` lalu `c` mengirim `0x03`. Bar dan sink tidak berselisih state |
| FR-TERM-08 | Accessory bar dua baris (lihat §12.3) dengan tombol panah *key-repeat* | P1 | Tahan panah: ulang setelah ~400 ms tiap ~40 ms |
| FR-TERM-09 | Scrollback ≤ 1.000 baris di HP | P0 | Memori terminal tidak tumbuh tanpa batas |
| FR-TERM-10 | Backpressure berbasis kredit: jendela awal 64 KiB. Tanpa kredit, server berhenti membaca PTY | P0 | `yes` tidak membuat RAM sidecar tumbuh |
| FR-TERM-11 | **Resume** (lihat §10.4): server menyimpan ring output 64-128 KB per sesi. `RESUME` membawa `received_offset` untuk pengiriman ulang | P0 | Putus koneksi 20 detik saat `ping`: setelah pulih tidak ada output hilang atau escape sequence terpotong |
| FR-TERM-12 | Aturan detach: sesi dianggap *detached* setelah 30 detik tanpa frame dari klien (atau socket tertutup). Proses dimatikan 120 detik setelah detach (`SIGHUP` ke process group, `SIGKILL` setelah 2 detik) | P0 | Tutup tab: proses bash dan anak-anaknya hilang ≤ 3 detik. Zombie = 0 |
| FR-TERM-13 | Layar mati = *pause* (berhenti mengirim `CREDIT`), bukan kill. Perilaku stall proses panjang didokumentasikan di UI dan dokumen | P0 | `apt`/kompilasi panjang dilarang pada shell inspeksi. UI menampilkan peringatan jika proses berjalan lama |
| FR-TERM-14 | Batas durasi sesi absolut 4 jam. Setelah itu biometrik ulang | P0 | Sesi ke-4 jam ditutup dan diminta ulang |
| FR-TERM-15 | Restart `nexa-server.service` melalui aturan polkit (bukan sudo). Aturan hanya untuk unit dan verb itu | P1 | `systemctl restart nexa-server` berhasil. Unit lain ditolak |
| FR-TERM-16 | `FLAG_SECURE` aktif pada layar terminal | P0 | Screenshot diblokir |
| FR-TERM-17 | Akses memerlukan tiket `scope=term` dengan klaim `sid` | P0 | Tanpa tiket valid: koneksi ditolak |
| FR-TERM-18 | Sakelar server-side (*kill switch*) untuk menonaktifkan seluruh fitur terminal. Default: **nonaktif** sampai diaktifkan eksplisit | P0 | Saat nonaktif: `/io/term` menolak koneksi |

### 6.5 Identitas Perangkat & Otorisasi

| ID | Kebutuhan | Prio | Kriteria penerimaan |
|---|---|---|---|
| FR-AUTH-01 | **Enrollment** kunci publik perangkat lewat CLI server `nexa-enroll` (kode sekali pakai, fingerprint kunci dikonfirmasi di HP). Kunci publik disimpan di **penyimpanan server** (file root-only/SQLite), tidak pernah diambil dari request | P0 | Kunci yang tidak terdaftar tidak dapat menerima tiket |
| FR-AUTH-02 | Kunci perangkat di Android Keystore: EC `secp256r1`, `PURPOSE_SIGN`, SHA-256, otentikasi pengguna wajib per penggunaan (`BIOMETRIC_STRONG`), invalid saat sidik jari baru ditambahkan | P0 | Penandatanganan tanpa biometrik gagal |
| FR-AUTH-03 | **Pemulihan**: bila kunci gugur (sidik jari baru), pemilik dapat mendaftar ulang lewat `nexa-enroll` tanpa terkunci dari sistem | P0 | Alur pemulihan teruji |
| FR-AUTH-04 | Challenge-response: server membuat nonce 32 byte (TTL 30 detik, sekali pakai). Klien menandatangani `"nexa-ticket-v1\n" + nonce + "\n" + scope + "\n" + sid` | P0 | Nonce dipakai ulang atau kedaluwarsa: ditolak. Scope berbeda: ditolak |
| FR-AUTH-05 | Setelah verifikasi, Node menerbitkan tiket Ed25519 (TTL 45 detik) berklaim `{scope, exp, jti, sid}`. Sidecar memverifikasi offline dengan kunci publik, memakai `jti` sekali pakai | P0 | Tiket kedua kali dipakai: ditolak. Tiket `logs` tidak membuka `term` |
| FR-AUTH-06 | `sid` ditentukan server. Resume memakai ulang `sid` yang sama hanya bila `sid` itu milik perangkat peminta (peta `sid → deviceId` di memori Node, masa berlaku sesuai batas sesi) | P0 | Resume dengan `sid` milik perangkat lain: ditolak |
| FR-AUTH-07 | **Step-up aksi keuangan** ditegakkan di lapisan eksekusi tool Node (bukan klasifikasi LLM atau `intent_hint`): Node menyimpan `pending_action` kanonis. Di HP, permintaan disajikan sebagai **Modal Bottom Sheet** (menutup IME otomatis, mengaktifkan `FLAG_SECURE`, menonaktifkan input chat, banner warna amber "Butuh konfirmasi sidik jari") yang menampilkan nama penerima utuh tanpa ellipsis, 4-6 digit rekening terakhir, bank, status whitelist, sisa batas harian, `action_id`, dan timer 30 detik. Title/subtitle `BiometricPrompt` sistem juga memuat nominal dan 4 digit terakhir. HP menandatangani `nonce ‖ scope ‖ sha256(aksi)`. Node memverifikasi dan mengeksekusi **sekali** | P0 | Pemanggilan tool transfer tanpa otorisasi valid ditolak apa pun isi pesan chat. Nominal dan penerima tidak pernah tergulir keluar layar saat konfirmasi |
| FR-AUTH-08 | Batas keuangan: nominal harian maksimum dan whitelist penerima di sisi server | P1 | Aksi di luar batas ditolak |
| FR-AUTH-09 | Penyimpanan nonce tertunda dibatasi: **sapuan berkala** untuk entri kedaluwarsa dan batas ≤ 8 nonce tertunda per perangkat | P0 | Banjir `TICKET_REQ` tidak menaikkan memori Node tanpa batas |
| FR-AUTH-10 | Rate limit `TICKET_REQ` per `device_id` (bukan per koneksi): maks 5/menit. Blokir 15 menit setelah 3 kegagalan verifikasi, hanya untuk penerbitan tiket (tidak memblokir chat) | P0 | Uji beban lolos |
| FR-AUTH-11 | Koneksi terminal dibatasi per `sid`/perangkat (1 aktif + 1 sedang resume) dan batas global sesi bersamaan | P0 | Sesi ke-3 ditolak |

### 6.6 Platform Server

| ID | Kebutuhan | Prio | Kriteria penerimaan |
|---|---|---|---|
| FR-SRV-01 | Migrasi PM2 ke `nexa-server.service` systemd (user `nexa`, entry `src/app.js`, `Restart=on-failure`, `MemoryHigh/Max`, `NODE_OPTIONS=--max-old-space-size=320`, log ke journald). Dikerjakan pada **Tahap 5** setelah Mobile Bridge selesai & `/monitor` siap | P0 | `pm2` tidak terpasang pasca Tahap 5. Node berjalan di bawah systemd |
| FR-SRV-02 | Dua layanan sidecar terpisah dari satu biner `nexa-io --mode=logs` atau `--mode=terminal`, masing-masing dengan socket unit sendiri. Aktivasi socket, `Restart=no`, keluar bersih setelah idle 90 detik (> TTL tiket) | P0 | Idle > 90 detik: tidak ada proses `nexa-io` |
| FR-SRV-03 | `nexa-log`: user `nexa-log`, grup `systemd-journal`, tanpa shell. `nexa-term`: user `nexa-term`, **tanpa** grup journal | P0 | Shell tidak dapat membaca journal penuh |
| FR-SRV-04 | Sandboxing `nexa-term`/`nexa-log`: `NoNewPrivileges`, `PrivateTmp`, `ProtectHome`, `ProtectSystem=strict`, `InaccessiblePaths=/opt/nexa/server /etc/nexa`, `StateDirectory` untuk `HOME`, `LoadCredential` untuk kunci publik | P0 | Dari dalam sesi terminal: `.env` dan `/etc/nexa` tidak terbaca. `systemd-analyze security` dicatat |
| FR-SRV-04a | Izin berkas: `.env` mode 0600 dan direktori aplikasi 0700, milik `nexa`. Kunci privat tiket 0600 milik `nexa`. Shell tidak dapat membacanya | P0 | Verifikasi dari dalam sandbox (bukan hanya `sudo -u`) |
| FR-SRV-05 | Domain sendiri (CNAME/A). HP memakai nama domain itu. Pindah VPS = ubah DNS | P0 | Cutover tanpa merilis ulang aplikasi |
| FR-SRV-06 | Caddy merutekan `/ws` ke Node dan `/io/logs`, `/io/term` ke Unix socket sidecar | P0 | Setiap rute berfungsi lewat `wss://` |
| FR-SRV-07 | Prosedur cutover VPS dan batas cgroup di *drop-in file* agar mudah disetel ulang | P1 | Dokumen cutover teruji pada VM uji |
| FR-SRV-08 | Rate limit dan audit (lihat §14) diimplementasikan di Node dan Go (Caddy tidak punya rate limit bawaan) | P0 | Uji beban |
| FR-SRV-09 | **Desktop Web Monitor Mandiri (`/monitor`)**: halaman web statis ringan pengganti `app.pm2.io` untuk browser desktop, menampilkan CPU, RAM/Heap, Event Loop Latency (`perf_hooks`), log server realtime (berbagi stream `nexa-log` `/io/logs`), dan tombol restart `nexa-server` via Polkit. Biaya 0 MB saat browser ditutup | P1 | Browser tertutup = 0 polling/overhead. Log tidak melewati cloud pihak ketiga |
| FR-SRV-10 | Otentikasi `/monitor` desktop memakai WebAuthn/Passkey (sidik jari perangkat desktop) atau persetujuan dari HP (*Out-of-Band*), dengan cookie sesi `HttpOnly; Secure; SameSite=Strict` berumur terbatas (1-4 jam) dan CSP ketat `default-src 'self'` | P0 | Akses tanpa sesi valid ditolak (401). Tidak memakai token statis tanpa pengaman |

---

## 7. Kebutuhan Non-Fungsional

### 7.1 Performa & sumber daya

| ID | Kebutuhan | Target |
|---|---|---|
| NFR-PERF-01 | Anggaran memori HP (PSS, basis build `DEBUGGABLE`) | Standby ≤ 55 MB (terukur 48,6 MB), basis UI 91,6 MB (terukur), chat ≤ 110 MB, log/terminal ≤ 115 MB, puncak ≤ 135 MB (build `release` ditargetkan lebih rendah) |
| NFR-PERF-02 | Tidak ada thread latar belakang tambahan per fitur. Satu thread I/O socket. Pekerjaan kanal memakai coroutine dengan `Channel` berkapasitas terbatas | Review kode |
| NFR-PERF-03 | Streaming chat memperbarui UI ≤ ~30 kali/detik dan tidak menulis ke disk per token | Lihat FR-CHAT-04/06 |
| NFR-PERF-04 | Anggaran RAM VPS: `nexa-log` ≤ 48 MB (cgroup), `nexa-term` ≤ 160 MB (cgroup), Node `MemoryMax` ≤ 400 MB. Biaya tambahan saat aktif ≤ 60 MB | `memory.current`, `free -m` |
| NFR-PERF-05 | Biaya VPS saat idle: 0 proses sidecar | `systemctl is-active` |
| NFR-PERF-06 | Lonjakan log tidak menaikkan CPU sidecar di atas `CPUQuota` (20% log, 40% terminal) | Uji banjir log |
| NFR-PERF-07 | Frame hot-path (terminal/log) ≤ 4 KiB. Prioritas penulis: control > terminal > chat > telemetri > log | Uji latensi ketikan saat log membanjir |

### 7.2 Baterai

| ID | Kebutuhan |
|---|---|
| NFR-BAT-01 | Koneksi A (selalu hidup) memakai interval heartbeat yang dapat dikonfigurasi. Nilai awal 60 detik (layar menyala) dan lebih panjang saat layar mati. Disetel ulang berdasarkan uji NAT seluler |
| NFR-BAT-02 | Koneksi B hanya ada saat tab log/terminal terlihat. Heartbeat aplikasi 15 detik hanya saat layar menyala |
| NFR-BAT-03 | Telemetri dibatching dan sampel lama dibuang saat antrean kirim OkHttp menumpuk (cek `queueSize()`) |
| NFR-BAT-04 | Loop animasi mata dan semua stream berhenti saat layar mati (FR-CORE-05, FR-LOG-03) |
| NFR-BAT-05 | Tipe FGS `dataSync` tidak dipakai (batas waktu pada Android 15+). Gunakan `specialUse` dan `microphone` |

### 7.3 Keandalan

| ID | Kebutuhan |
|---|---|
| NFR-REL-01 | Koneksi A menyambung ulang dengan *exponential backoff* + jitter dan mendeteksi *half-open* lewat ping/pong |
| NFR-REL-02 | Cleanup server dipicu oleh penutupan koneksi/timeout (dead-man switch), tidak hanya oleh pesan `CLOSE` |
| NFR-REL-03 | Crash atau OOM sidecar tidak boleh menjatuhkan Node.js (isolasi proses) |
| NFR-REL-04 | Klien menyiapkan satu percobaan ulang otomatis untuk jendela race saat sidecar keluar karena idle |
| NFR-REL-05 | Terminal/log tidak boleh dapat membuat VPS kehabisan memori (batas cgroup keras per layanan) |

### 7.4 Kompatibilitas

| ID | Kebutuhan |
|---|---|
| NFR-COMP-01 | Android 16 (API 36) pada Galaxy A33 5G. Pustaka native (`.so`) wajib mendukung page size 16 KB (alignment LOAD ≥ 0x4000), dengan `abiFilters = arm64-v8a` |
| NFR-COMP-02 | Server: Ubuntu LTS dengan cgroup v2 dan systemd (mendukung `LoadCredential`, `StateDirectory`) |
| NFR-COMP-03 | Seluruh dependensi berlisensi open-source yang kompatibel. Lisensi diperiksa sebelum dipakai (termasuk modul terminal) |

### 7.5 Pemeliharaan

| ID | Kebutuhan |
|---|---|
| NFR-MNT-01 | Satu biner Go (`nexa-io`) dengan dua mode. Protokol frame dan paket verifikasi tiket dipakai bersama |
| NFR-MNT-02 | Spesifikasi protokol (§10) adalah sumber kebenaran. Perubahan wajib memperbarui uji golden-file di klien dan server |
| NFR-MNT-03 | Konfigurasi sensitif lewat systemd credentials/berkas berizin ketat, bukan variabel lingkungan yang diwarisi shell |

---

## 8. Keamanan & Privasi

### 8.1 Model ancaman

| # | Ancaman | Mitigasi |
|---|---|---|
| T1 | Bearer token koneksi A bocor | Terminal, log, dan aksi keuangan **tidak** dapat dijangkau dengan Bearer saja. Semuanya membutuhkan tanda tangan Keystore yang terikat biometrik dan kunci publik terdaftar di server (FR-AUTH-01..07) |
| T2 | Penyerang menyuplai kunci publik sendiri saat meminta tiket | Kunci publik hanya dari penyimpanan server hasil enrollment CLI (FR-AUTH-01) |
| T3 | HP dipinjam atau dicuri tanpa terkunci | Biometrik per penggunaan (bukan timeout). `FLAG_SECURE`. Batas sesi 4 jam |
| T4 | Replay tiket/nonce/tanda tangan | Nonce sekali pakai TTL 30 detik terikat scope dan `sid`. `jti` sekali pakai. Tiket TTL 45 detik. Masa tenggang idle (90 detik) > TTL tiket |
| T5 | Sidecar atau shell dibobol, lalu menerbitkan tiket palsu | Sidecar hanya memegang kunci publik Ed25519 (asimetris). Kunci privat hanya milik user `nexa` |
| T6 | Shell membaca rahasia aplikasi (`.env`, kunci) | Izin berkas ketat + `InaccessiblePaths` + user terpisah + env bersih + tanpa grup journal |
| T7 | Prompt injection (mis. via email yang di-parse) memicu transfer | Otorisasi di lapisan eksekusi tool, bukan klasifikasi LLM. Biometrik atas aksi persis. Batas nominal/whitelist |
| T8 | Eskalasi hak dari shell | `NoNewPrivileges`, tanpa sudo, polkit sempit hanya untuk satu unit/verb |
| T9 | Fork bomb atau penghabisan sumber daya | Cgroup: `MemoryMax`, `TasksMax`, `CPUQuota` |
| T10 | DoS memori pada Node lewat banjir permintaan tiket | Sapuan nonce, batas jumlah, rate limit per perangkat |
| T11 | Kebocoran data keuangan lewat log/layar | Redaksi di sumber (Node), `FLAG_SECURE`, tiket `logs` terpisah |
| T12 | Kehilangan akses karena kunci gugur | Alur pemulihan lewat CLI (FR-AUTH-03) |

### 8.2 Persyaratan keamanan tambahan

| ID | Kebutuhan |
|---|---|
| FR-SEC-01 | Tiket dikirim lewat header `Authorization: Bearer` pada HTTP Upgrade, bukan lewat query string |
| FR-SEC-02 | Semua pembandingan rahasia menggunakan perbandingan waktu-konstan (`crypto.timingSafeEqual`, `hmac.Equal`) |
| FR-SEC-03 | Shell dijalankan dengan lingkungan bersih (`HOME`, `USER`, `TERM`, `LANG`, `PATH`). Tidak mewarisi variabel lingkungan sidecar |
| FR-SEC-04 | Redaksi data sensitif (nomor rekening, token) dilakukan **di sumber** sebelum log ditulis. Sidecar menambah jaring pengaman pola token. Sumber utama tetap "jangan pernah mencatat rahasia" |
| FR-SEC-05 | Audit log untuk setiap permintaan tiket dan sesi (lihat §14) |
| FR-SEC-06 | `FLAG_SECURE` diatur oleh pengendali **berhitung referensi** (bukan `addFlags/clearFlags` langsung per layar) dan memakai helper `findActivity()` yang membuka `ContextWrapper`. Gagal menemukan Activity dianggap error (fail closed). **Wajib aktif pada:** layar **Log**, **Terminal**, **Pengaturan (Settings)**, serta saat **Modal Bottom Sheet Step-Up Keuangan** tampil di Chat |
| FR-SEC-07 | Terminal nonaktif secara default di server (kill switch) |
| FR-SEC-08 | Tidak menyimpan rahasia (kunci privat tiket, token) di repositori atau di dalam APK |

### 8.3 Privasi data

- Riwayat chat disimpan lokal di HP (Room). Tidak ada telemetri ke pihak ketiga.
- Log di HP hanya di memori (ring), tidak ditulis ke disk, dan dihapus saat `ON_STOP`.
- Konteks sensor dikirim hanya ke server pribadi milik pemilik.

---

## 9. Arsitektur Tingkat Tinggi & Keputusan Utama

### 9.1 Diagram

```
HP (Kotlin / Compose)                                    VPS (Ubuntu, systemd)
+--------------------------------+                    +------------------------------------------+
| FGS (specialUse, microphone)   |   WSS /ws          |  Caddy (Auto HTTPS)                      |
| OkHttp WS-A  (selalu hidup)    |<------------------>|   |-- /ws       --> Node N.E.X.A (:3000) |
|  - chat, telemetri, kontrol    |                    |   |     (AI, chat, challenge, penerbit   |
|                                |                    |   |      tiket, tool keuangan)           |
| OkHttp WS-B  (on-demand)       |   WSS /io/logs     |   |-- /io/logs  --> nexa-log.sock        |
|  - log / terminal              |<------------------>|   |                  (aktivasi socket)   |
|                                |   WSS /io/term     |   |-- /io/term  --> nexa-term.sock       |
| Room (chat)  Ring buffer (log) |<------------------>|                      (aktivasi socket)   |
| Terminal engine (native)       |                    +------------------------------------------+
| Android Keystore (EC P-256)    |
+--------------------------------+
```

### 9.2 Stack teknologi

| Lapisan | Pilihan | Alasan |
|---|---|---|
| UI HP | Kotlin, Jetpack Compose, Canvas | Tanpa proses renderer tambahan (WebView menambah proses Chromium terpisah) |
| Jaringan HP | OkHttp WebSocket, `kotlinx.serialization` (JSON/CBOR untuk kanal dingin) | Ringan. Tanpa Socket.IO |
| Data HP | Room (SQLite), Paging 3 | Riwayat offline, jendela memori terbatas |
| Terminal HP | `termlib` (ConnectBot) atau emulator Java Termux yang di-vendor | Native, ringan. Dipilih setelah audit 16 KB (Tahap 0) |
| Autentikasi HP | Android Keystore (EC P-256), `BiometricPrompt` + `CryptoObject` | Kunci terikat perangkat dan biometrik |
| Server inti | Node.js + `ws` (tetap) | Ekosistem SDK AI. Jalur I/O berat dipisah |
| Sidecar I/O | Go: `creack/pty`, `coder/websocket`, stdlib `crypto/ed25519` | RAM kecil, binary statis, isolasi dari Node |
| Proses | systemd (service, socket activation, cgroup v2, credentials) | Pengganti PM2. Batas sumber daya dan idle nol |
| Reverse proxy | Caddy v2 | Sudah dipakai. Rute per path ke TCP/Unix socket |

### 9.3 Keputusan arsitektur (ringkas)

| Keputusan | Alternatif yang ditolak | Alasan |
|---|---|---|
| Native Compose penuh | WebView + xterm.js, Flutter, React Native | WebView menambah biaya RAM signifikan dan panas. Framework lain tidak lebih hemat dari Compose |
| Dua koneksi WebSocket (A selalu hidup, B on-demand) | Satu koneksi multipleks | HOL TCP tidak dapat dihilangkan pada satu koneksi. Memisahkan jalur berat melindungi chat/telemetri dan menghemat baterai |
| Sidecar Go terpisah | `node-pty` di dalam Node | Isolasi crash/OOM. RAM idle nol via socket activation |
| Dua service (`nexa-log`, `nexa-term`) | Satu sidecar untuk keduanya | Least privilege: shell tidak mewarisi grup `systemd-journal`. Limit berbeda per fungsi |
| Tiket Ed25519 (asimetris) | HMAC dengan secret bersama, JWT penuh | Shell adalah turunan sidecar, sehingga secret simetris bisa dibaca shell. Asimetris membuat pemalsuan tiket tidak mungkin dari sidecar |
| Challenge-response Keystore terikat biometrik | `BiometricPrompt` saja (cek klien) | Pemeriksaan biometrik di klien saja tidak dapat dibuktikan ke server |
| ECDSA P-256 untuk kunci perangkat | Ed25519 di Keystore | Dukungan P-256 di Keystore paling pasti. Ed25519 di Keystore bergantung versi Android |
| journald sebagai sumber log tunggal | File log + inotify | Satu sumber untuk Node dan Caddy. Backpressure alami via pipe. CPU dikendalikan oleh rate limit Go |
| Kategori log via awalan pesan | Field journald kustom (`NEXA_CAT`) | Node tidak punya dukungan bawaan untuk protokol native journald dengan stdout biasa |
| Shell inspeksi (tanpa sudo), `nexa-admin` ditunda | Shell admin dari HP | Admin dari HP menjadikan kompromi jalur biometrik/tiket setara akses root. Manfaatnya kecil dibanding SSH laptop |
| Restart service lewat polkit | sudo terbatas | `NoNewPrivileges` menonaktifkan setuid. Polkit bekerja lewat D-Bus tanpa setuid |

---

## 10. Spesifikasi Antarmuka (Protokol)

Bagian ini adalah **sumber kebenaran** protokol. Semua integer *big-endian*.

### 10.1 Frame umum

```text
[ch: u8][op: u8][payload: N bytes]      // satu frame = satu pesan WebSocket biner
```

| `ch` | Kanal | Koneksi |
|---|---|---|
| `0x00` | CONTROL (hello, heartbeat, tiket, otorisasi aksi) | A, B-logs, B-term |
| `0x01` | TELEMETRY | A |
| `0x02` | CHAT | A |
| `0x03` | LOGS | B-logs |
| `0x10`-`0xFF` | Sesi terminal (ID dialokasikan klien) | B-term |

| `op` | Nama | Keterangan |
|---|---|---|
| `0x01` | OPEN | Membuka kanal |
| `0x02` | DATA | Data (byte mentah untuk log/terminal, JSON/CBOR untuk kanal dingin) |
| `0x03` | CREDIT | Memberi izin kirim tambahan (backpressure) |
| `0x04` | CLOSE | Menutup kanal |
| `0x05` | RESIZE | Ukuran PTY |
| `0x06` | ERR | Kesalahan |
| `0x07` | PING | Heartbeat aplikasi (klien → server) |
| `0x08` | PONG | Balasan heartbeat |
| `0x09` | RESUME | Menyambung kembali ke sesi terminal/stream chat |

**Aturan umum**

- `permessage-deflate` dimatikan. Maksimum payload frame hot-path: **4 KiB**.
- Jendela kredit awal: terminal 64 KiB, log 32 KiB. Kredit dikirim ulang saat ≥ setengah jendela telah dikonsumsi.
- Penjadwal penulis server memakai antrean berprioritas: control > terminal > chat > telemetri > log.
- Server menutup koneksi dengan `ERR` untuk frame yang tidak valid.

### 10.2 Payload per opcode

| Op | Kanal | Payload |
|---|---|---|
| OPEN | Terminal | `[rows: u16][cols: u16][sid: 16 bytes]` |
| OPEN | Logs | `[unit_mask: u8][min_prio: u8][cat_mask: u8][tail: u16]` |
| RESUME | Terminal | `[sid: 16 bytes][received_offset: u64]` |
| RESUME | Chat | `[client_msg_id: 16 bytes][last_seq: u32]` |
| RESIZE | Terminal | `[rows: u16][cols: u16]` |
| CREDIT | Terminal/Log | `[bytes: u32]` |
| CLOSE | Semua | `[reason: u8]` |
| ERR | Semua | `[code: u8][message: UTF-8]` |
| PING / PONG | Control | (kosong) |

**Kode `CLOSE.reason`:** `0` normal, `1` keluar oleh klien, `2` idle, `3` batas sesi, `4` autentikasi, `5` server berhenti, `6` masa detach habis.

**Kode `ERR.code`:** `1` frame tidak valid, `2` tidak terotorisasi, `3` unit terlarang, `4` dibatasi laju, `5` fitur dinonaktifkan, `6` batas sumber daya, `7` resume gagal.

### 10.3 Format record log (kanal `0x03`, `DATA`)

```text
Record = [prio: u8][unit_id: u8][cat_flags: u8][timestamp_ms: u64][msg_len: u16][message: UTF-8]
         \_________________ header 13 byte _________________/
```
Satu frame `DATA` boleh memuat beberapa record berurutan, total ≤ 4 KiB.

| Field | Nilai |
|---|---|
| `prio` | `3` ERROR/FATAL, `4` WARNING, `6` INFO, `7` DEBUG (RFC 5424) |
| `unit_id` | `0` nexa-server, `1` caddy, `2` systemd/kernel, `3` nexa-io. `unit_mask` bit ke-*n* = `1 << unit_id` |
| `cat_flags` | `0x01` FINANCE, `0x02` BRIDGE, `0x04` AUTH, `0x80` SYNTHETIC (penanda sistem, mis. "N baris dilewati"). Bit lain dicadangkan |
| Pemotongan | Pesan maksimum **2048 byte**, dipotong di batas karakter UTF-8 yang valid, lalu ditambah akhiran `[TRUNCATED]` (11 byte) |

**Sumber kategori:** Node menulis awalan `[cat=FINANCE] ` (atau `BRIDGE`, `AUTH`) pada awal pesan. Sidecar mengurai awalan itu menjadi `cat_flags` dan **membuangnya** dari teks. Prioritas diambil dari `PRIORITY` journald (Node memakai awalan `<N>` pada stdout, didukung systemd secara default).

### 10.4 Semantik resume terminal

1. Output terminal adalah aliran byte. Server menghitung `sent_offset` kumulatif. Klien menghitung `received_offset` kumulatif.
2. Server menyimpan **ring** output terakhir per sesi (64-128 KB, sebanding dengan jendela kredit).
3. Saat koneksi putus, server menandai sesi *detached* (tanpa frame klien 30 detik atau socket tertutup) dan berhenti membaca PTY (kredit tidak datang). Bash memblok bila buffer PTY kernel penuh. Ini perilaku yang **diharapkan**.
4. `RESUME` membawa `received_offset`. Bila `received_offset ≥ sent_offset - panjang_ring`, server mengirim ulang byte dari offset itu. Bila lebih lama dari ring, server mengirim `ERR(7)` atau memicu reset layar + `SIGWINCH` agar aplikasi layar penuh menggambar ulang.
5. Resume memerlukan tiket baru (`scope=term`, `sid` sama) yang diperoleh dengan biometrik baru. Sidecar mencocokkan `sid` tiket dengan sesi aktif.
6. 120 detik setelah detach tanpa resume: `SIGHUP` ke process group, `SIGKILL` setelah 2 detik.

### 10.5 Protokol Koneksi A (`/ws` JSON Text Frame: Chat, Auth & Step-Up)

> **Catatan Audit Kode (`src/interfaces/bridge/gateway.js`):** Pada Koneksi A (`/ws`), seluruh frame WebSocket bertipe biner (`isBinary === true`) sudah didedikasikan secara eksklusif untuk aliran audio PCM `Live_Voice_Engine`. Oleh karena itu, seluruh protokol kanal dingin (Otentikasi Challenge/Tiket, Chat AI Native, dan Step-Up Keuangan) di `/ws` menggunakan **JSON Text Frames** (dengan field `type`), sedangkan **Binary Frame `[ch:u8][op:u8][payload]` (§10.1-10.4)** berlaku murni pada **Koneksi B (`/io/logs`, `/io/term`)** milik Go sidecar `nexa-io`.

```text
Klien -> Server (JSON): { "type": "CHAT_SEND", "client_msg_id": "<uuid>", "ts": 1763620000000, "intent_hint": "AUTO", "content": "..." }
Server -> Klien (JSON): { "type": "CHAT_CHUNK", "client_msg_id": "<uuid>", "seq": 1, "status": "STREAMING_CHUNK|STREAM_FINAL|EXECUTION_RESULT|ERROR_ABORT", "chunk": "..." }
Klien -> Server (JSON): { "type": "CHAT_RESUME", "client_msg_id": "<uuid>", "last_seq": 12 }
```
`seq` naik monoton per balasan. Server menyimpan balasan terbaru beberapa menit untuk dikirim ulang lewat `CHAT_RESUME`.

### 10.6 Pesan kontrol (kanal `0x00`, `DATA`, JSON UTF-8)

| Tipe | Arah | Isi |
|---|---|---|
| `TICKET_REQ` | HP → Node | `{device_id, scope, resume_sid?}` |
| `CHALLENGE` | Node → HP | `{nonce, scope, sid, exp}` (nonce 32 byte base64url, TTL 30 detik) |
| `CHALLENGE_RESP` | HP → Node | `{device_id, nonce, sig}` (`sig` DER base64) |
| `TICKET` | Node → HP | `{ticket, sid}` |
| `ACTION_PENDING` | Node → HP | `{action_id, summary, canonical_hash, nonce, exp}` (rincian ditampilkan dari data server) |
| `ACTION_AUTH` | HP → Node | `{action_id, nonce, sig}` |

**Pesan yang ditandatangani HP**

- Tiket: `"nexa-ticket-v1\n" + nonce + "\n" + scope + "\n" + sid` (UTF-8).
- Aksi keuangan: `"nexa-action-v1\n" + nonce + "\n" + action_id + "\n" + canonical_hash`.

**Klaim tiket Ed25519:** `{scope, exp, jti, sid}`. Format: `base64url(payload) + "." + base64url(sig)` dengan tanda tangan atas byte payload apa adanya.

---

## 11. Model Data

### 11.1 Klien (Room)

```kotlin
@Entity(
    tableName = "chat_messages",
    indices = [Index(value = ["clientMsgId", "role"], unique = true),
               Index(value = ["timestamp"])]
)
data class ChatMessageEntity(
    @PrimaryKey val id: String = UUID.randomUUID().toString(),
    val clientMsgId: String,
    val role: String,            // "user" | "assistant" | "system"
    val content: String,
    val timestamp: Long = System.currentTimeMillis(),
    val status: String,          // SENDING | STREAMING | SENT | INTERRUPTED | FAILED
    val intentTag: String? = null,
    val executionMetadata: String? = null
)
```

Dao: `getPagedMessages()` (`ORDER BY timestamp DESC`), `insertMessage` (`IGNORE`), `finalizeMessage(id, content, status)`, `updateStatus(id, status)`.

### 11.2 Server (Node)

| Entitas | Isi | Penyimpanan |
|---|---|---|
| Perangkat terdaftar | `device_id`, kunci publik SPKI DER, label, dibuat, dicabut | File root-only/SQLite, ditulis oleh `nexa-enroll` |
| Nonce tertunda | `nonce → {scope, sid, exp}` (dibatasi ≤ 8 per perangkat, disapu berkala) | Memori |
| Sesi aktif | `sid → {device_id, exp}` (maks 4 jam) | Memori |
| Aksi tertunda | `action_id → {detail kanonis, exp}` | Memori |
| Buffer balasan chat | Balasan terbaru per `client_msg_id` | Memori, beberapa menit |

### 11.3 Sidecar (Go)

Set `jti` terpakai (memori, TTL = kedaluwarsa tiket), peta `sid → sesi PTY` (PID/pgid, ring output, offset), dan penghitung koneksi aktif untuk logika idle.

---

## 12. Kebutuhan UX

### 12.1 Layar, navigasi, dan perilaku keyboard (IME)

- **Top AppBar Tunggal Seragam:** Di semua tab utama, Top Bar menampilkan kapsul mata OLED `NexaExpressiveEyes` (36-40 dp, dua mata horizontal tanpa mulut, bentuk berbeda dari ikon Pause `||`), judul `"N.E.X.A"`, status koneksi singkat (ikon + teks), tombol cepat Live Voice Call (pada Chat/HUD), dan **satu ikon Pengaturan (Settings)**. Tidak memakai ikon profil pengguna (aplikasi single-user).
- **Bottom Navigation Bar 4 Tab (`Chat` | `HUD` | `Logs` | `Shell`):** Memakai indikator aktif yang seragam di semua layar.
- **Penyembunyian Saat Keyboard Naik (`WindowInsets.isImeVisible`):** Saat keyboard virtual terbuka di layar mana pun, **Bottom Navigation Bar otomatis disembunyikan** untuk menghemat 64 dp ruang vertikal.

| Layar | Isi utama |
|---|---|
| **Chat** | Daftar pesan (`LazyColumn` reverse), balon markdown + tombol TTS per balon N.E.X.A, indikator status pengiriman (`SENDING`/`SENT`/`INTERRUPTED`/`FAILED` dengan tombol kirim ulang), kolom input ("Tanya atau perintahkan N.E.X.A"), serta **Modal Bottom Sheet Step-Up Keuangan** (banner amber, detail penerima utuh tanpa ellipsis, 4-6 digit rekening, bank, status whitelist, sisa batas harian, `action_id`, timer 30 detik, tombol "Konfirmasi dengan sidik jari" dan "Batalkan" ≥ 48 dp) |
| **HUD** | Dua kartu status (`WS-A Core` terhubung ke `domain:443` dan `WS-B Sidecar` "Tidak terhubung (on-demand)"), grid telemetri 2x2 nyata (Baterai, Status Layar, WakeLock, Geofence), daftar `Command Log` rata-kiri (perintah keuangan disamarkan), tombol `Live Voice Call`, serta tombol `Hentikan Layanan` (≥ 48 dp, diproteksi *hold-to-confirm* / dialog konfirmasi di area terpisah) |
| **Log** | Sub-header ringkas dengan status (`LIVE` / `PAUSED`), ikon gembok kecil ("Layar terlindungi"), tombol Pause/Play, Auto-Scroll, dan Clear Local Buffer (tanpa tombol Export/unduh dan tanpa input regex di bawah layar). Baris chip filter 48 dp (`ALL` / `FINANCE` / `BRIDGE` / `ERRORS ONLY`) yang konsisten dengan isi daftar. Entri log memisahkan slot badge prioritas (`ERROR`/`WARN`/`INFO`/`DEBUG`) dan slot kategori (`FINANCE`/`BRIDGE`/`AUTH`), mendukung baris sintetis "N baris dilewati". Footer: `"x / 2.000 baris • Dilewati: n • Berhenti saat layar mati"` |
| **Terminal** | Sub-header digabung menjadi **satu baris ringkas 40 dp** (`nexa-term@vps · Aktif · Sisa 3j 52m · ⋮` berisi ukuran font & `Putuskan Sesi` dengan konfirmasi bila ada proses aktif) agar kanvas mendapat **~22-24 baris** saat keyboard terbuka. Kanvas ANSI `xterm-256color`, footer ringkas (`"xterm-256color • UTF-8 • 120/1.000 baris"`), dan Accessory Bar 2 baris (§12.3). Mode landscape masuk ke tampilan imersif (~100+ kolom) |
| **Pengaturan** | Dilindungi `FLAG_SECURE`. Kartu Identitas Perangkat (`ID Perangkat: samsung-a33-tuan`, level keamanan Keystore aktual dari `KeyInfo.securityLevel`, `BIOMETRIC_STRONG`, fingerprint SHA-256 **32 oktet penuh** 4 baris × 8 oktet + tombol salin, status `ACTIVE` & tanggal enroll, state belum terdaftar/input kode/QR, serta panduan dialog `nexa-enroll re-pair` saat kunci gugur). Kartu Koneksi Server (domain read-only setelah enroll, intip token wajib biometrik + auto-hide 10 detik tanpa tombol salin pubkey di dekatnya, dua kontrol terpisah untuk heartbeat Layar Nyala 60s dan Layar Mati 120s, tombol "Terapkan & sambung ulang"). Kartu Preferensi (auto-apply tanpa tombol Save global: nada notifikasi, TTS lokal `id-ID`, haptik, slider font terminal 8-16 sp, pemilih aksen warna 48 dp dengan label penuh, toggle tema gelap/terang, serta status kill switch terminal read-only) |

### 12.2 Avatar mata (`NexaExpressiveEyes`)

| State | Perilaku |
|---|---|
| `IDLE` | Mata terbuka, kedip periodik 3,5-5 detik (render hanya saat kedip, bukan 60 fps konstan) |
| `LISTENING` | Pupil membesar, melirik ke kolom input |
| `THINKING` | Pupil menyempit perlahan, pose asimetris hijau emerald |
| `STREAMING` | Gerak ekspresif mengikuti ritme token |
| `ALERT` | Aksen merah/oranye untuk peringatan genting |

Loop animasi berhenti saat `Lifecycle < STARTED`.

### 12.3 Accessory bar terminal (Amandemen Ergonomi 411 dp Galaxy A33)

Agar setiap tombol memenuhi syarat target sentuh **≥ 44×48 dp** pada lebar layar 411 dp Galaxy A33:

```text
Baris 1 (9 tombol tetap, 44x48 dp) : [ESC] [TAB] [CTRL] [ALT] [ ← ] [ ↓ ] [ ↑ ] [ → ] [ ⋯ ]
Baris 2 (LazyRow geser, 44x48 dp)  : [^C] [^D] [^Z] [^L] [ - ] [ / ] [ | ] [ ~ ] [ $ ] [ * ] [Home] [End] [PgUp] [PgDn]
```

- **Baris 1** (9 tombol) selalu tampak saat terminal aktif. **Baris 2** tersembunyi secara default dan dibuka/ditutup lewat tombol `⋯` (berupa `LazyRow` horizontal yang dapat digeser).
- Kluster panah di kanan (jangkauan ibu jari kanan) dengan *key-repeat*.
- `CTRL`/`ALT` sticky memiliki 3 state yang dibedakan bukan dari warna saja:
  - Nonaktif (`IDLE`): tampilan tombol standar.
  - Sekali pakai (`ONCE`): border/aksen aktif + indikator titik/garis bawah.
  - Terkunci (`LOCKED`): fill aksen teduh (`#00B8D4`) + ikon gembok kecil.
- `[^C]` mengirim `0x03` langsung tanpa perlu CTRL.
- Bar menempel di atas keyboard (`imePadding`). Perubahan ukuran memicu `RESIZE`.

### 12.4 Keadaan kosong, galat, dan aksesibilitas

- **Belum terdaftar:** layar Log/Terminal mengarahkan pemilik ke prosedur `nexa-enroll`.
- **Kunci gugur:** pesan jelas + dialog panduan pendaftaran ulang (`nexa-enroll re-pair`).
- **Fitur terminal dinonaktifkan server:** pesan "Terminal dinonaktifkan di server".
- **Terputus:** banner "Menyambung kembali" dengan hitung mundur masa resume (120 detik).
- **Proses panjang:** peringatan bahwa layar mati menjeda output dan sesi dihentikan jika tidak kembali dalam 120 detik.
- **Aksesibilitas & Target Sentuh:** semua tombol interaktif memiliki tinggi **≥ 48 dp** (accessory bar ≥ 44×48 dp) dengan jarak ≥ 8 dp di sekitar aksi destruktif. Ukuran teks informatif ≥ 12 sp (metadata ≥ 11 sp). Seluruh teks dan label wajib lulus kontras **WCAG AA (≥ 4,5:1)** baik pada tema gelap maupun tema terang. Status tidak pernah bergantung pada warna saja (selalu disertai ikon atau teks label).

### 12.5 Sistem Warna, Tipografi, & Efisiensi GPU (Exynos 1280)

- **Palet Mode Gelap (Default OLED):**
  - Latar utama: `#0A0E14`, Kartu/Surface: `#111720`, Elevasi: `#1A2232`, **Outline/Border komponen: `1 dp` `#2A3548`** (agar batas kartu dan tombol tegas tanpa *shadow* berat).
  - Teks utama: `#E2E8F0`, Teks sekunder/muted: `#9FB0C7` (kontras ≥ 4,5:1 di atas `#0A0E14` dan `#111720`).
  - **Cyan Merek (2 tingkat untuk mencegah silau/halation OLED):** `#00E5FF` khusus untuk garis outline, ikon tab aktif, dan teks aksen kecil; **`#00B8D4`** (dengan teks gelap `#04181F`) untuk fill tombol besar (`Kirim`, `Terapkan`, `CTRL Locked`).
  - **Disiplin 4 Warna Semantik:** Cyan (`#00E5FF`/`#00B8D4` = merek/aksi utama), Hijau Emerald (`#00E676` = online/sukses/`FINANCE`), Amber (`#FFAB40` = menunggu step-up/`WARN`/paused/detached), Merah (`#FF5252` = error/destruktif).
- **Palet Mode Terang (P2 - Keterbacaan Luar Ruangan):** Latar `#F8FAFC`, Surface `#FFFFFF`, Border `#CBD5E1`, Teks `#0F172A`, Aksen Cyan gelap `#007C91` (kontras ~4,9:1 di atas putih).
- **Tipografi & Bahasa:** Gunakan **Bahasa Indonesia *sentence case*** untuk seluruh label UI, tombol, dan pesan status. Gunakan `JetBrains Mono` (monospace) khusus untuk log server, kanvas terminal, angka telemetri, `action_id`, dan fingerprint SHA-256. Hindari penggunaan ALL-CAPS kecuali pada badge kategori/prioritas singkat.
- **Aturan Hemat GPU (`Graphics` Baseline 19,2 MB):** Dilarang menggunakan `Modifier.blur`, *drop shadow* besar, atau *glow* berlapis yang memicu alokasi *offscreen buffer*. Indikator `ONLINE`/`LIVE` bersifat statis (tanpa animasi berkedip terus-menerus). Animasi hanya diizinkan pada: hitung mundur step-up (1 Hz teks), kursor terminal (1 Hz saat foreground), dan kedipan `NexaExpressiveEyes`.

---

## 13. Siklus Hidup, Memori, & Baterai

| Kondisi | HP | Server |
|---|---|---|
| Tab Log/Terminal ditutup (sengaja) | Kirim `CLOSE`, tutup koneksi B, kosongkan buffer | Log: hentikan `journalctl` seketika. Terminal: `SIGHUP` ke process group lalu `SIGKILL` setelah 2 detik |
| Layar mati / app ke background (`ON_STOP`) | Log: hentikan stream, kosongkan buffer. Terminal: *pause* (stop `CREDIT`), buffer emulator dipertahankan | Log: proses dihentikan. Terminal: sesi menunggu hingga 30 detik lalu *detached*, dibunuh 120 detik kemudian |
| Layar menyala (`ON_START`) | Log: sambung ulang dengan tiket baru. Terminal: `RESUME` dengan tiket baru (biometrik) bila dalam masa resume | Cocokkan `sid`, kirim ulang dari offset |
| Koneksi putus mendadak (half-open) | Backoff + jitter, tampilkan status | Dead-man switch: tanpa frame 30 detik → detached |
| Tidak ada koneksi aktif 90 detik | n/a | Sidecar `os.Exit(0)`. Socket tetap dipegang systemd |
| Chat streaming saat proses dimatikan sistem | Pesan tersisa dengan isi checkpoint terakhir | Buffer balasan memungkinkan `RESUME` |
| `onTrimMemory(UI_HIDDEN)` | Kosongkan buffer log/terminal | n/a |

**Catatan memori:** pelepasan objek tidak selalu langsung menurunkan PSS karena heap ART dipakai ulang dan di-trim secara malas. Anggaran diukur pada kondisi mapan (setelah GC), bukan sesaat setelah keluar layar.

---

## 14. Observability & Audit

### 14.1 Audit log (server, ke journald)

| Peristiwa | Field |
|---|---|
| Permintaan tiket | `timestamp`, `scope`, `device_id`, IP sumber, `result` (`OK`, `FAIL_ECDSA`, `REPLAY`, `EXPIRED`, `RATE_LIMITED`, `UNKNOWN_DEVICE`) |
| Sesi terminal | Mulai, resume, berakhir (alasan `CLOSE.reason`), durasi, IP |
| Aksi keuangan | `action_id`, hasil otorisasi, hasil eksekusi (tanpa data rekening mentah) |
| Perubahan konfigurasi | Sakelar terminal, enrollment, pencabutan perangkat |

### 14.2 Pengukuran

- **HP:** `dumpsys meminfo`, Perfetto (frame/jank/GC), `batterystats`.
- **Server:** `free -m`, `memory.current` dan `cpu.stat` dari cgroup v2 (dibaca langsung sebagai file, tanpa spawn proses), `systemd-cgls`.
- Hasil Tahap 0 dan tiap tahap disimpan sebagai tabel baseline di repositori dokumen.

### 14.3 Aturan logging

- Rahasia (token, kunci, nomor rekening) tidak pernah ditulis ke log (redaksi di sumber).
- Tiket tidak pernah dicatat penuh (maksimal `jti`).

---

## 15. Roadmap & Kriteria Keluar Tiap Tahap

Setiap tahap adalah **gerbang**: tahap berikutnya tidak dimulai sebelum kriteria keluar terpenuhi.

### Tahap 0 - Audit & Baseline (Status 20 Nov 2026: SELESAI - Gerbang Tahap 1 Terbuka)

| Pekerjaan | Kriteria keluar | Status |
|---|---|---|
| `adb shell dumpsys meminfo com.nexa.mobilebridge` | Standby: **48,6 MB** (`49.768 KB`), UI terbuka (`DEBUGGABLE`): **91,6 MB** (`93.825 KB`) | **Selesai** |
| `adb shell getconf PAGE_SIZE` & audit `.so` | `PAGE_SIZE = 4096` byte. `base.apk` hanya memuat 3 `.so` AndroidX. Alignment `.so` `termlib` diaudit saat dipilih (Tahap 4) | **Selesai (siap)** |
| Uji IME di A33 dengan `TerminalInputSink` minimal (`com.nexa.imetest`) | `KeyboardType.Password` (pengganti `VisiblePassword` yang tidak ada di Compose BOM `2026.03.01`) mematikan saran kata, `comp=null`, swipe mati; Enter=`0x0D`, Backspace=`0x7F`, `CTRL+c`=`0x03`. §6.4 FR-TERM-06 diperbarui | **Selesai (LULUS)** |
| `free -m` VPS (kolom *available*) | `892 MB` total, `596 MB` used, **`295 MB` available** (`Swap 260 MB`), `systemd 255`, `cgroup2` | **Selesai** |
| Audit WakeLock/WifiLock aplikasi eksisting | Terkonfirmasi ditahan kontinu di `NexaBridgeService.kt` (`WakeLock` >10,5 jam & `WifiLock type=4`). Wajib diperbaiki sesuai `FR-CORE-04` (plus hapus watchdog `NexaAccessibilityService` sesuai `FR-CORE-03`) | **Terkonfirmasi (Wajib fix sebelum fitur baru)** |
| Tetapkan angka target final menggantikan estimasi | §3.3 dan §7.1 (NFR-PERF-01) diperbarui ke target terkalibrasi (110/115/135 MB) | **Selesai** |

### Tahap 1 - Fondasi Server Ringkas & Core Hygiene HP (PM2 Tetap Aktif Sementara)

| Pekerjaan | Kriteria keluar |
|---|---|
| Domain sendiri (atau domain aktif saat ini), Caddyfile rute `/ws`, `/io/logs`, `/io/term` | Rute berfungsi (uji `wss`) tanpa memutus bridge aktif |
| Izin berkas (`.env` 0600, direktori server 0700, kunci privat Ed25519 `/etc/nexa/ticket-priv.pem` 0600) | Verifikasi izin & keypair lulus |
| Penyetelan `ecosystem.config.js` (`--max-old-space-size=320`, `max_memory_restart: '420M'`), CORS `NEXA_DOMAIN` di `src/app.js`, serta redaksi rahasia + prefix `[cat=...]` terpusat di `src/utils/logger.js` | `npm test` lulus, rahasia ter-redaksi di log |
| Perbaikan Core HP: lepas `WakeLock`/`WifiLock` saat idle (`NexaBridgeService.kt`), hapus `NexaAccessibilityService` (`FR-CORE-03`, setelah konfirmasi perintah terdampak), alihkan `AppUsageTracker` ke `UsageStatsManager.queryEvents()`, dan pasang kerangka navigasi 4 tab + tema WCAG AA | `dumpsys power` tidak menahan WakeLock saat idle; tidak ada deklarasi AccessibilityService |

### Tahap 1.5 - Identitas Perangkat

| Pekerjaan | Kriteria keluar |
|---|---|
| CLI CommonJS `scripts/nexa-enroll.js` dan penyimpanan `/etc/nexa/enrolled_devices.json` | Perangkat terdaftar tanpa mengirim kunci lewat jalur tak tepercaya |
| Kunci Keystore ECDSA P-256 + `BiometricPrompt`/`CryptoObject` + Settings Security v3 (`FLAG_SECURE`) | Penandatanganan tanpa biometrik gagal |
| Layanan challenge JSON di `/ws` Node (nonce sapuan/batas, rate limit, audit log) | Uji replay dan banjir lulus |
| Paket verifikasi tiket Ed25519 Go (dipakai kedua mode) | Uji: kedaluwarsa, replay `jti`, scope salah, tanda tangan salah |
| Alur pemulihan kunci gugur (`KeyPermanentlyInvalidatedException`) | Teruji end-to-end |

### Tahap 2 - Chat Native

Fitur FR-CHAT-01..19 (`mobile_chat` JSON `/ws`, Room + Paging 3), step-up keuangan Modal Bottom Sheet (FR-AUTH-07/08) dan rancangan `pending_action`.
**Keluar:** uji streaming/chunking 60 detik tanpa jank terkait GC. Uji putus koneksi (`CHAT_RESUME` tanpa duplikasi). Uji proses dimatikan di tengah stream (checkpoint 5s). Pemanggilan aksi keuangan sensitif tanpa otorisasi ditolak.

### Tahap 3 - Log Monitor

Fitur FR-LOG-01..13, unit `nexa-log`, sandbox, `LoadCredential`, `FLAG_SECURE` ref-counted, dan pembacaan gabungan `journald` + file log PM2 (`./logs/out.log`, `./logs/err.log`) selama masa transisi PM2.
**Keluar:** layar dikunci = stream berhenti <= 5 detik. Tidak ada langganan ganda. Banjir log tidak melewati `MemoryMax`/`CPUQuota`. `FLAG_SECURE` aktif pada semua transisi layar. Tidak ada tombol Export.

### Tahap 4 - Terminal Inspeksi

Audit `.so` 16 KB `termlib` vs Termux Java emulator, fitur FR-TERM-01..18, unit `nexa-term`, sandbox, `RESUME` dengan ring 64 KB dan offset, 9-key 44x48 dp Accessory Bar + `KeyboardType.Password`, kill switch default OFF.
**Keluar:** `htop`/`nano` benar. Resume 20 detik tanpa output hilang. Tutup tab membersihkan seluruh proses (zombie = 0). Verifikasi sandbox dari dalam sesi (`.env`, `/etc/nexa` tidak terbaca). Kill switch berfungsi. Sesi 4 jam ditutup.

### Tahap 5 - Pasca-Selesai Mobile Bridge: Desktop Web Monitor (`/monitor`) & Migrasi PM2 ke Systemd

| Pekerjaan | Kriteria keluar |
|---|---|
| Halaman **Desktop Web Monitor (`/monitor`)** (FR-SRV-09/10) dengan paritas metrik PM2+ (CPU, RAM/Heap, `perf_hooks` Event Loop Latency p50/p95, HTTP req/min & Mean/P95 Latency, Active handles/requests, Issues, Restarts, Reset Monit) + live `/io/logs` | Browser tertutup = 0 overhead. Akses tanpa sesi WebAuthn/HP approval ditolak (401) |
| Migrasi penuh PM2 -> `nexa-server.service` systemd (`src/app.js`, `--max-old-space-size=320`) + aktifkan Polkit restart `nexa-server.service` + hapus PM2/PM2+ | `free -m` naik sesuai penghematan PM2 (~47 MB). Tombol restart di `/monitor` & shell `nexa-term` berfungsi |
| Alihkan `nexa-log` menjadi 100% pembaca `journald` murni (hapus tail file log PM2) | Semua unit (`nexa-server`, `caddy`, `systemd`, `nexa-io`) mengalir lewat `journald` |

### Pasca-Tahap 5 (belum dijadwalkan)

`tmux` auto-attach, UnifiedPush/ntfy, evaluasi `nexa-admin` (bila diperlukan, dengan socket/scope terpisah, jendela waktu terbatas, dan polkit hanya untuk satu unit).

---

## 16. Strategi Pengujian & Kriteria Rilis

### 16.1 Lapisan pengujian

| Lapisan | Cakupan |
|---|---|
| Unit | Parser/encoder frame, record log, `ModifierState`, ring buffer, token consumer (batching, cancel, checkpoint), verifikasi tiket |
| Golden file protokol | Vektor uji biner bersama dipakai klien (Kotlin) dan server (Node, Go). Perubahan spesifikasi wajib memperbarui vektor |
| Integrasi server | Node + sidecar + Caddy pada VM uji: challenge → tiket → PTY → resume → kill |
| Perangkat | Galaxy A33: IME, Keystore/biometrik, lifecycle layar mati, FLAG_SECURE, notifikasi, TTS |
| Ketahanan | Putus sinyal mendadak, mode pesawat, NAT idle, restart Caddy, restart sidecar saat idle |
| Performa | Perfetto (jank/GC), `meminfo` pada skenario SKN-1..6, banjir log, `yes`/`cat` besar di terminal, uji latensi ketikan saat log membanjir |
| Soak | Layar terminal terbuka berjam-jam: RAM HP dan VPS stabil. Chat streaming berulang: tidak ada kebocoran |
| Keamanan | Tiket kedaluwarsa/replay/scope salah, kunci publik tak terdaftar, banjir `TICKET_REQ`, pembacaan `.env` dari shell, fork bomb, `FLAG_SECURE` saat berpindah layar, prompt injection terhadap tool transfer |

### 16.2 Skenario ukur memori (SKN)

1. Standby layar mati. 2. Chat aktif. 3. Voice live. 4. Log terbuka. 5. Terminal terbuka. 6. Puncak (voice + berpindah tab).

### 16.3 Kriteria rilis (go/no-go)

- Semua kebutuhan **P0** fase terkait lulus kriteria penerimaan.
- Tabel baseline HP/VPS berisi angka terukur dan berada dalam anggaran (atau anggaran direvisi dengan alasan tertulis).
- Tidak ada temuan keamanan terbuka berprioritas tinggi pada daftar §8.1.
- Prosedur cutover VPS dan pemulihan kunci telah dicoba sekali (dry run).
- `systemd-analyze security` untuk kedua sidecar dicatat dan ditinjau.

---

## 17. Risiko & Mitigasi

| ID | Risiko | Dampak | Mitigasi |
|---|---|---|---|
| R1 | `.so` termlib tidak selaras 16 KB | Terminal tidak dapat dipakai pada perangkat/kernel 16 KB | Audit di Tahap 0. Rebuild dengan NDK r28+ atau vendor emulator Java Termux |
| R2 | Samsung Keyboard mengabaikan petunjuk "tanpa saran" | Input terminal rusak | Uji Tahap 0. Cadangan: `View` kustom dengan `InputConnection` sendiri (`NO_SUGGESTIONS`) |
| R3 | Estimasi memori meleset | Anggaran dilanggar | Tahap 0 sebagai gerbang. Anggaran diperbarui dengan angka ukur |
| R4 | Kunci Keystore gugur karena sidik jari baru | Terkunci dari terminal/log | Alur pemulihan CLI (FR-AUTH-03) |
| R5 | Memori Node bocor lewat nonce/sesi tertunda | OOM Node | Sapuan berkala, batas per perangkat, rate limit |
| R6 | Page cache journal ikut dihitung di cgroup `nexa-log` (`MemoryHigh=36M`) | Throttling saat membaca journal besar | Uji dengan ukuran journal nyata. Naikkan `MemoryHigh`/atur `SystemMaxUse` journald |
| R7 | NAT seluler memutus koneksi A saat idle | Pesan terlambat/reconnect boros baterai | Interval heartbeat dapat dikonfigurasi, uji lapangan |
| R8 | Batas FGS Android 15/16 | Layanan dihentikan sistem | Tipe `specialUse` dan `microphone` dideklarasikan. Hindari `dataSync` |
| R9 | Perilaku polkit berbeda antar-versi Ubuntu | Restart service dari terminal gagal | Uji di versi target. Cadangan: tanpa restart dari HP (SSH laptop) |
| R10 | Prompt injection memicu aksi keuangan | Kerugian finansial | Otorisasi di lapisan tool + biometrik atas aksi persis + batas nominal/whitelist |
| R11 | Bash memblok saat detach (proses panjang) | Pekerjaan terhenti dan dibunuh | Terdokumentasi. Peringatan UI. Gunakan `tmux`/`nohup` secara opt-in. `tmux` auto-attach pasca-rilis |
| R12 | Thermal throttling pada render terminal/streaming | Stutter, panas | Batching 33 ms. Gambar hanya baris yang berubah. Loop animasi berhenti saat tak terlihat |
| R13 | Domain baru: penerbitan sertifikat lambat saat cutover | Downtime singkat | Turunkan TTL DNS sebelum cutover. Arahkan DNS lebih dulu |
| R14 | Konvensi `[cat=...]` tidak diterapkan di semua titik log Node | Filter kategori tidak lengkap | Utilitas logger tunggal di Node. Uji pemindai pada kode |

---

## 18. Asumsi, Dependensi, & Pertanyaan Terbuka

### 18.1 Asumsi

- Satu pemilik dan satu perangkat terdaftar.
- Server memakai systemd (≥ 247 untuk `LoadCredential`) dengan cgroup v2.
- Domain milik pemilik tersedia dan dapat diatur DNS-nya.
- Jaringan seluler memungkinkan koneksi `wss` (port 443).

### 18.2 Dependensi eksternal

AndroidX (Compose, Room, Paging 3, Lifecycle, Biometric), OkHttp, Android Keystore, `termlib`/libvterm (atau emulator Java Termux), Node.js + `ws`, Go + `creack/pty` + `coder/websocket`, Caddy v2, systemd, polkit, `journalctl`. Lisensi semuanya diperiksa sebelum dipakai.

### 18.3 Pertanyaan terbuka

| # | Pertanyaan | Pemilik keputusan | Batas waktu |
|---|---|---|---|
| Q1 | `PAGE_SIZE` A33 sebenarnya? Apakah `.so` termlib selaras 16 KB? | Tahap 0 | **`PAGE_SIZE` terjawab: `4096` byte (4 KB).** Audit `.so` `termlib` dilakukan saat integrasi Tahap 4 |
| Q2 | Hasil uji IME Samsung Keyboard di A33 | Tahap 0 | **Terjawab (LULUS, 20 Nov 2026):** `KeyboardType.VisiblePassword` tidak ada di Compose BOM `2026.03.01`; `KeyboardType.Password` mematikan saran kata & swipe (`comp=null`), Enter=`0x0D`, Backspace=`0x7F`, `CTRL+c`=`0x03` |
| Q3 | Apakah WakeLock/WifiLock eksisting ditahan terus-menerus? | Tahap 0 | **Terjawab (YA): ditahan kontinu** di `NexaBridgeService.kt` (`WakeLock` terukur >10,5 jam, `WifiLock type=4`). Wajib diperbaiki sebelum fitur baru |
| Q4 | Haruskah tiket `logs` meminta biometrik setiap membuka tab (keamanan) atau ada jendela singkat (kenyamanan)? Default PRD: setiap kali | Pemilik | Sebelum Tahap 3 |
| Q5 | Interval heartbeat koneksi A yang optimal terhadap NAT operator | Uji lapangan | Tahap 2 |
| Q6 | Kompatibilitas aturan polkit pada versi Ubuntu target | Tahap 1 | Sebelum Tahap 4 |
| Q7 | Cukupkah `MemoryHigh=36M` untuk `nexa-log` dengan ukuran journal nyata? | Tahap 3 | Tahap 3 |
| Q8 | Seberapa besar refactor logger Node untuk awalan `<N>` dan `[cat=...]`? | Tahap 3 | Tahap 3 |
| Q9 | Rincian UX enrollment (kode sekali pakai, QR di terminal, konfirmasi fingerprint) | Pemilik | Tahap 1.5 |
| Q10 | Nilai batas nominal harian dan daftar whitelist penerima | Pemilik | Tahap 2 |
| Q11 | Lama retensi buffer balasan chat di server (menit) | Pemilik | Tahap 2 |
| Q12 | Versi Ubuntu/systemd di VPS baru | Pemilik | Sebelum cutover |

---

## 19. Lampiran

### Lampiran A — Unit systemd

```ini
# /etc/systemd/system/nexa-server.service
[Unit]
Description=N.E.X.A Server
After=network-online.target

[Service]
User=nexa
WorkingDirectory=/opt/nexa/server
Environment=NODE_ENV=production NODE_OPTIONS=--max-old-space-size=320
LoadCredential=ticket-priv.pem:/etc/nexa/ticket-priv.pem
ExecStart=/usr/bin/node src/app.js
Restart=on-failure
RestartSec=3
MemoryHigh=380M
MemoryMax=480M
SyslogIdentifier=nexa-server

[Install]
WantedBy=multi-user.target
```

```ini
# /etc/systemd/system/nexa-log.socket
[Unit]
Description=N.E.X.A Log Streamer Socket

[Socket]
ListenStream=/run/nexa-log.sock
SocketUser=root
SocketGroup=caddy
SocketMode=0660
Accept=no

[Install]
WantedBy=sockets.target
```

```ini
# /etc/systemd/system/nexa-log.service
[Unit]
Description=N.E.X.A Log Streamer Worker
Requires=nexa-log.socket

[Service]
User=nexa-log
SupplementaryGroups=systemd-journal
ExecStart=/opt/nexa/bin/nexa-io --mode=logs
LoadCredential=ticket-pub.pem:/etc/nexa/ticket-pub.pem
Restart=no
KillMode=control-group
NoNewPrivileges=yes
PrivateTmp=yes
ProtectHome=yes
ProtectSystem=strict
InaccessiblePaths=/opt/nexa/server /etc/nexa
MemoryHigh=36M
MemoryMax=48M
TasksMax=32
CPUQuota=20%
```

```ini
# /etc/systemd/system/nexa-term.socket
[Unit]
Description=N.E.X.A Terminal Shell Socket

[Socket]
ListenStream=/run/nexa-term.sock
SocketUser=root
SocketGroup=caddy
SocketMode=0660
Accept=no

[Install]
WantedBy=sockets.target
```

```ini
# /etc/systemd/system/nexa-term.service
[Unit]
Description=N.E.X.A Terminal Shell Worker
Requires=nexa-term.socket

[Service]
User=nexa-term
ExecStart=/opt/nexa/bin/nexa-io --mode=terminal
LoadCredential=ticket-pub.pem:/etc/nexa/ticket-pub.pem
StateDirectory=nexa-term
Environment=HOME=/var/lib/nexa-term
Restart=no
KillMode=control-group
NoNewPrivileges=yes
PrivateTmp=yes
ProtectHome=yes
ProtectSystem=strict
InaccessiblePaths=/opt/nexa/server /etc/nexa
MemoryHigh=128M
MemoryMax=160M
TasksMax=128
CPUQuota=40%
```

```js
// /etc/polkit-1/rules.d/50-nexa-term.rules  (uji pada Ubuntu target)
polkit.addRule(function(action, subject) {
  if (action.id === "org.freedesktop.systemd1.manage-units" &&
      subject.user === "nexa-term" &&
      action.lookup("unit") === "nexa-server.service" &&
      action.lookup("verb") === "restart") {
    return polkit.Result.YES;
  }
});
```

Catatan: sidecar membaca kunci publik dari `$CREDENTIALS_DIRECTORY/ticket-pub.pem`. Jika `ProtectSystem=strict` mengganggu alat inspeksi tertentu, longgarkan secara selektif lewat `ReadWritePaths=`.

### Lampiran B — Caddyfile

```caddyfile
{$NEXA_DOMAIN} {
    header {
        Strict-Transport-Security "max-age=31536000; includeSubDomains; preload"
        X-Content-Type-Options nosniff
        X-Frame-Options DENY
        -Server
    }

    handle /io/logs {
        reverse_proxy unix//run/nexa-log.sock
    }

    handle /io/term {
        reverse_proxy unix//run/nexa-term.sock
    }

    handle /ws {
        reverse_proxy 127.0.0.1:3000
    }

    handle {
        reverse_proxy 127.0.0.1:3000
    }
}
```

### Lampiran C — Otentikasi

**Kunci Keystore (HP, dibuat sekali):**

```kotlin
val keySpec = KeyGenParameterSpec.Builder("nexa_device_key", KeyProperties.PURPOSE_SIGN)
    .setAlgorithmParameterSpec(ECGenParameterSpec("secp256r1"))
    .setDigests(KeyProperties.DIGEST_SHA256)
    .setUserAuthenticationRequired(true)
    .setUserAuthenticationParameters(0, KeyProperties.AUTH_BIOMETRIC_STRONG) // per penggunaan
    .setInvalidatedByBiometricEnrollment(true)
    .build()
```
`BiometricPrompt` memakai `BIOMETRIC_STRONG` saja (tanpa fallback PIN). Tangani `KeyPermanentlyInvalidatedException` dengan mengarahkan ke pendaftaran ulang.

**Challenge dan penerbitan tiket (Node):**

```js
const MAX_PENDING_PER_DEVICE = 8;
const pending  = new Map();  // nonce -> { deviceId, scope, sid, exp }
const sessions = new Map();  // sid   -> { deviceId, exp }
// enrolled: Map(deviceId -> { publicKey (KeyObject dari SPKI DER), revoked }) dimuat dari penyimpanan server

setInterval(() => {           // sapuan entri kedaluwarsa
  const now = Date.now();
  for (const [k, v] of pending)  if (v.exp < now) pending.delete(k);
  for (const [k, v] of sessions) if (v.exp < now) sessions.delete(k);
}, 10_000).unref();

export function makeChallenge(deviceId, scope, resumeSid) {
  const dev = enrolled.get(deviceId);
  if (!dev || dev.revoked) return null;
  let count = 0;
  for (const v of pending.values()) if (v.deviceId === deviceId) count++;
  if (count >= MAX_PENDING_PER_DEVICE) return null;

  const resumable = resumeSid && sessions.get(resumeSid)?.deviceId === deviceId;
  const sid   = resumable ? resumeSid : randomBytes(16).toString('base64url');
  const nonce = randomBytes(32).toString('base64url');
  const exp   = Date.now() + 30_000;
  pending.set(nonce, { deviceId, scope, sid, exp });
  return { nonce, scope, sid, exp };
}

export function issueTicket(deviceId, nonce, sigDer) {
  const p = pending.get(nonce);
  pending.delete(nonce);                                   // sekali pakai, apa pun hasilnya
  if (!p || p.deviceId !== deviceId || Date.now() > p.exp) return null;
  const dev = enrolled.get(deviceId);                      // kunci publik dari penyimpanan server
  if (!dev || dev.revoked) return null;

  const msg = Buffer.from(`nexa-ticket-v1\n${nonce}\n${p.scope}\n${p.sid}`, 'utf8');
  if (!verify('sha256', msg, { key: dev.publicKey, dsaEncoding: 'der' }, sigDer)) return null;

  if (!sessions.has(p.sid)) sessions.set(p.sid, { deviceId, exp: Date.now() + 4 * 3600_000 });
  const payload = Buffer.from(JSON.stringify({
    scope: p.scope, sid: p.sid,
    exp: Math.floor(Date.now() / 1000) + 45,
    jti: randomBytes(12).toString('base64url'),
  }));
  const sig = sign(null, payload, serverPriv);             // Ed25519
  return { ticket: `${payload.toString('base64url')}.${sig.toString('base64url')}`, sid: p.sid };
}
```

**Sidecar (Go):** memverifikasi `ed25519.Verify(pub, payload, sig)` atas byte payload, memeriksa `exp` (dan `exp - now ≤ 120`), `scope`, dan mencatat `jti` sekali pakai. Masa tenggang idle (90 detik) harus lebih panjang dari TTL tiket (45 detik) agar set `jti` bertahan selama tiket masih sah.

### Lampiran D — Glosarium

| Istilah | Arti |
|---|---|
| FGS | Foreground Service Android |
| PTY | Pseudo-terminal Linux |
| Socket activation | systemd menjalankan layanan hanya saat ada koneksi masuk ke socket yang dipegangnya |
| Sidecar | Proses pendamping terpisah dari Node.js (`nexa-io`) |
| HOL blocking | Head-of-line blocking: satu aliran yang macet menahan aliran lain pada koneksi yang sama |
| Kredit | Jatah byte yang boleh dikirim pengirim (flow control) |
| Detached | Sesi terminal yang kehilangan klien namun masih dalam masa tenggang resume |
| SID | Session ID terminal yang ditentukan server |
| Step-up | Otentikasi tambahan (biometrik) untuk aksi sensitif |
| PSS | Proportional Set Size, ukuran memori proses di Android |

### Lampiran E — Koreksi atas Architecture Plan v2.2 yang diterapkan di PRD ini

| # | Temuan pada v2.2 | Penyelesaian di PRD |
|---|---|---|
| 1 | Sumber kunci publik perangkat dan enrollment tidak ditentukan (`issueTicket` menerima kunci dari pemanggil) | FR-AUTH-01/03, §11.2, Lampiran C |
| 2 | `InaccessiblePaths=/etc/nexa` memblokir kunci publik yang dibaca sidecar. `ProtectHome` bertabrakan dengan `HOME` | `LoadCredential`, `StateDirectory`, `HOME` baru (FR-SRV-04, Lampiran A) |
| 3 | `sid` bertentangan (klien vs server). Byte tak terkirim hilang saat resume. Aturan timer PING/PONG ambigu | FR-AUTH-06, §10.4 (ring + offset), FR-TERM-11/12 |
| 4 | Urutan roadmap: Keystore/tiket dikerjakan setelah log dan step-up yang membutuhkannya | Tahap 1.5 (§15) |
| 5 | `pendingChallenges` tanpa sapuan/batas (memori Node) | FR-AUTH-09, Lampiran C |
| 6 | `startLogStream()` terpanggil ganda. `FLAG_SECURE` gagal terbuka dan berpacu saat transisi layar | FR-LOG-03, FR-SEC-06 |
| 7 | `CircularLogBuffer`: `IndexOutOfBounds` saat `clear()`. Key berbasis indeks | FR-LOG-09 |
| 8 | Salah hitung spesifikasi record (header 13 byte, `[TRUNCATED]` 11 byte) | §10.3 |
| 9 | `NEXA_CAT` sebagai field journald kustom tidak layak via stdout | Awalan `[cat=...]` (FR-LOG-08, §10.3) |
| 10 | Rate limit "per `jti`" tidak bermakna. Per koneksi mudah dihindari | FR-AUTH-10/11 |
| 11 | Satu channel token bersama. Tidak ada resume chat | FR-CHAT-05/10, §10.5 |
| 12 | Spesifikasi step-up FINANCE belum konkret | FR-AUTH-07, `ACTION_PENDING`/`ACTION_AUTH` (§10.6) |
| 13 | `ModifierState` default `remember{}` dapat menghasilkan instans terpisah | FR-TERM-07 |

---

*Akhir dokumen PRD v1.1 (Tahap 0 Selesai 20 November 2026 - Gerbang menuju Tahap 1 terbuka). Audit `.so` `termlib` 16 KB dilakukan saat integrasi library terminal di Tahap 4.*
