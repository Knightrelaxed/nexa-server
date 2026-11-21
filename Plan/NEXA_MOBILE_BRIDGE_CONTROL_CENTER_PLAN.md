# ARCHITECTURE & ROADMAP PLAN: NEXA MOBILE BRIDGE AI CONTROL CENTER
**Dokumen Spesifikasi Teknis & Blueprint Implementasi Tingkat Lanjut**  
*Versi: 2.4 (Code-Grounded Alignment: Protokol JSON `/ws` vs Biner `/io/*`, CommonJS `src/app.js`, & PM2->Systemd + `/monitor` di Tahap 5)*  
*Tanggal: 20 November 2026*  
*Target Implementasi: Samsung Galaxy A33 5G (Android 16, One UI 8) & Azure Linux VPS (Ubuntu)*

> [!IMPORTANT]
> **Status Dokumen: DIBEKUKAN & DISINKRONKAN DENGAN KODE RIIL (FROZEN SPECIFICATION v2.4 - TAHAP 0 SELESAI 20 NOV 2026).**  
> Seluruh item wajib **Tahap 0** (audit `dumpsys meminfo`, `PAGE_SIZE = 4096`, audit `WakeLock`/`WifiLock`, `free -m` VPS, dan **uji IME Samsung Keyboard pada Galaxy A33**) telah tuntas dilaksanakan, ditambah **audit kode mendalam** atas `nexa-server` dan `nexa-mobile-bridge`. Keputusan strategis: **PM2 & PM2+ dipertahankan sementara selama pengerjaan Mobile Bridge (Tahap 1-4)** agar visibilitas desktop tidak terganggu, lalu **Desktop Web Monitor (`/monitor`) + migrasi penuh PM2 ke `systemd`** dieksekusi bersih pada **Tahap 5**.

---

## 1. Ringkasan Eksekutif & Keputusan Arsitektur Final (v2.4)

Mentransformasi **N.E.X.A Mobile Bridge** dari jembatan perangkat keras (*thin client*) menjadi **Pusat Kontrol AI Mandiri (AI Control Center)** bagi Tuan Faqih.

Keputusan arsitektur final yang dikunci pada versi 2.4:

1. **100% Native Jetpack Compose (Bebas Renderer Chromium / WebView):**
   - Menghindari overhead 100-180 MB PSS/RAM dan lonjakan panas CPU Exynos 1280.
   - Chat (Compose + Room DB + Paging 3), Log Viewer, dan Terminal semuanya menggunakan Canvas native Android.
2. **Dual-WebSocket Terpisah dengan Pemisahan Framing yang Aman (`/ws` JSON vs `/io/*` Biner):**
   - **Koneksi A (`/ws` via Node.js `src/app.js`, CommonJS):** Tetap aktif di background untuk sensor, telemetri, kontrol hardware, otentikasi challenge/tiket, step-up finance, dan AI Chat. **Seluruh pesan baru di `/ws` menggunakan JSON text frames** agar **tidak pernah bertabrakan** dengan frame biner `/ws` yang sudah dipakai `Live_Voice_Engine` untuk streaming audio PCM mentah (`src/interfaces/bridge/gateway.js`).
   - **Koneksi B (`/io/logs` & `/io/term` via Go Sidecar `nexa-io`):** Hanya aktif saat tab Log atau Terminal dibuka di layar HP, menggunakan **Binary Frame `[ch:u8][op:u8][payload]`** penuh.
3. **Pemisahan Service Systemd dengan Sandboxing Mandiri:**
   - `nexa-log.service`: user `nexa-log`, grup `systemd-journal`, tanpa shell eksekusi. (Selama masa transisi PM2 pada Tahap 3-4, ikut membaca `./logs/out.log` & `./logs/err.log` secara read-only; beralih 100% ke `journald` pada Tahap 5).
   - `nexa-term.service`: user `nexa-term`, tanpa grup journal, sandboxing ketat via `ProtectSystem=strict`, `ProtectHome=yes`, `InaccessiblePaths=/opt/nexa/server /etc/nexa`.
   - **LoadCredential:** Kunci publik tiket dioper oleh systemd via `LoadCredential=ticket-pub.pem:/etc/nexa/ticket-pub.pem` agar lolos dari blokir sandbox `InaccessiblePaths`.
   - Direktori kerja terminal menggunakan `StateDirectory=nexa-term` (`/var/lib/nexa-term`), menjaga `$HOME` tetap berfungsi normal tanpa membobol keamanan.
4. **Otentikasi Kriptografi Terikat Perangkat (Hardware-Backed Keystore ECDSA P-256):**
   - Kunci publik HP disimpan di database server melalui perintah administratif `nexa-enroll` (tidak diterima dari request publik).
   - Format tanda tangan kanonis: `nexa-ticket-v1\n${nonceB64}\n${scope}\n${sid}` untuk mencegah penipuan tanda tangan lintas fungsi.
   - Penegakan Step-Up FINANCE dilakukan pada level tool Node.js dengan validasi detail kanonis transaksi dan tampilan **Modal Bottom Sheet** di HP (`FLAG_SECURE`).
5. **Protokol Resume Terminal yang Andal:**
   - Server memegang kendali otoritatif atas `sid` (Session ID).
   - Go sidecar menyimpan ring buffer replay (64 KB) untuk mengirim ulang byte yang sedang terbang saat koneksi terputus tiba-tiba.
   - Timer putus koneksi disatukan: 30 detik tanpa frame PING/DATA memicu status *detached*, dilanjutkan masa tenggang 120 detik sebelum eksekusi SIGHUP dan SIGKILL.
6. **Perbaikan Urutan Kerja (Spine Tahap 1.5 & PM2 Deferred ke Tahap 5):**
   - Menyisipkan **Tahap 1.5 (Identitas Perangkat & Fondasi Tiket)** sebelum pengerjaan Chat dan Log untuk membangun tulang punggung keamanan sejak dini.
   - Mempertahankan PM2 sementara selama Tahap 1-4 (dengan pengaman `--max-old-space-size=320` karena baseline Used Heap nyata adalah `173 MiB`), sehingga fokus penuh tertuju pada penyelesaian Mobile Bridge lebih dulu.
7. **`nexa-admin` Ditunda Total:**
   - Rilis pertama difokuskan murni pada Shell Inspeksi. Restart service via Polkit diaktifkan penuh pada Tahap 5 setelah migrasi ke `nexa-server.service`.
8. **Desktop Web Monitor Pribadi (`/monitor`) Pengganti `app.pm2.io` (Tahap 5):**
   - Dikerjakan setelah Mobile Bridge selesai 100%, menggantikan PM2 dan PM2+ dengan paritas metrik lengkap (CPU, RAM/Heap, `perf_hooks` Event Loop Latency p50/p95, HTTP req/min & Mean/P95 Latency, Active handles/requests, Issues, Restarts, Reset Monit, stream `/io/logs`, dan tombol Restart via Polkit). **Biaya RAM = 0 MB saat browser ditutup.**

---

## 2. Baseline Lingkungan Sistem (Terukur 20 November 2026)

> [!NOTE]
> Angka di bawah ini adalah hasil pengukuran langsung (`adb shell` dan `ssh`) pada 20 November 2026, kecuali item yang secara eksplisit ditandai belum diukur.

### A. Sisi Klien (Smartphone)
- **Perangkat:** Samsung Galaxy A33 5G (`SM-A336E`, terverifikasi).
- **Chipset:** Samsung Exynos 1280 (8-core mid-range, 5nm).
- **Memori & OS:** RAM 8 GB, One UI 8.0 (`ro.build.version.oneui = 80000`), Android 16 (`API 36`, terverifikasi), ABI `arm64-v8a, armeabi-v7a, armeabi`.
- **Kernel Page Size:** **`4096` byte (4 KB)** (terverifikasi via `adb shell getconf PAGE_SIZE`). Library `.so` di `base.apk` saat ini hanya 3 library AndroidX (`libimage_processing_util_jni.so`, `libdatastore_shared_counter.so`, `libandroidx.graphics.path.so`). Library terminal akan diaudit alignment 16 KB-nya saat dipilih.
- **Identitas & Tipe Build Aplikasi Eksisting:** Package ID **`com.nexa.mobilebridge`** (di `app/build.gradle.kts`, bukan `id.co.nexa.bridge`). APK terpasang saat pengukuran berstatus **`DEBUGGABLE`** (`isMinifyEnabled = false` di release).
- **Konsumsi RAM Eksisting (Terukur via `dumpsys meminfo com.nexa.mobilebridge`):**
  - **Standby background (`Activities: 0, Views: 0`):** **`49.768 KB` (~48,6 MB TOTAL PSS)**, `7.248 KB` Private Dirty, `35.972 KB` SwapPss, `55.856 KB` RSS.
  - **UI terbuka eksisting (`Activities: 1, Views: 9`):** **`93.825 KB` (~91,6 MB TOTAL PSS)**, `54.563 KB` Private Dirty, `157.079 KB` RSS (lonjakan utama berasal dari `Graphics: 19.183 KB` [EGL + GL mtrack], `Code: 22.168 KB`, `Native Heap: 16.764 KB`, `Java Heap: 11.028 KB`).
- **Foreground Service:** Tipe `connectedDevice|specialUse|microphone` sudah dideklarasikan di `AndroidManifest.xml`.
- **Audit WakeLock & WifiLock (TERKONFIRMASI MASALAH):**
  - Di kode (`NexaBridgeService.kt`), `acquireWakeLock()` (`PARTIAL_WAKE_LOCK`) dan `acquireWifiLock()` (`WIFI_MODE_FULL_LOW_LATENCY`) dipanggil langsung di `onCreate()` tanpa timeout dan baru dilepas di `onDestroy()`.
  - Pengukuran live di HP (`dumpsys power` dan `dumpsys wifi`) membuktikan `NexaBridge::WakeLock` ditahan terus-menerus selama **10 jam 32 menit 53 detik (`ACQ=-10h32m53s571ms LONG`)** dan `WifiLock type=4` juga aktif. Wajib direfaktor sesuai `FR-CORE-04` sebelum fitur baru dibangun.
- **Catatan Audit Kode Tambahan:** Di `NexaBridgeService.kt` masih terdapat `launchAccessibilitySelfHealingWatchdog()` yang memeriksa `NexaAccessibilityService.instance`. Wajib dibersihkan agar patuh terhadap larangan `AccessibilityService` (`FR-CORE-03`).

### B. Sisi Server (Cloud VPS)
- **Penyedia:** Microsoft Azure Virtual Machine (Linux Ubuntu).
- **Versi Systemd & Kernel Cgroup (Terverifikasi):** `systemd 255 (255.4-1ubuntu8.18)` (memenuhi syarat `>= 247` untuk `LoadCredential` dan `StateDirectory`), `cgroup2` (`default-hierarchy=unified`) aktif, `/usr/bin/ss` tersedia.
- **Kapasitas & Konsumsi RAM Eksisting (Terukur via `free -m` pada 20 Nov 2026):**
  - **Mem:** total `892 MB`, used `596 MB`, free `97 MB`, buff/cache `349 MB`, **`available 295 MB`**.
  - **Swap:** total `2.047 MB`, used `260 MB`, free `1.787 MB`.
- **Reverse Proxy:** Caddy v2 dengan Automatic HTTPS.
- **Domain:** Menggunakan domain kustom sendiri dengan DNS TTL rendah agar migrasi server di masa depan tidak berdampak pada aplikasi HP.

---

## 3. Spesifikasi Tiga Pilar Fitur Baru

```
+------------------------------------------------------------------------+
|                   NEXA MOBILE BRIDGE CONTROL CENTER                    |
+-------------------+----------------------------+-----------------------+
|   PILAR 1: CHAT   |       PILAR 2: LOG         |   PILAR 3: TERMINAL   |
|   Native Compose  |   Journald Binary Stream   |  Native Terminal View |
|   Room + Paging3  |   LifecycleStartEffect     |  Keystore Auth+Resume |
|   Channel Stream  |   cat_flags & tail_lines   |  LoadCredential Sandbx|
|   Step-Up Action  |   FLAG_SECURE RefCount     |  Replay Ring Buffer   |
|   Checkpoint 5s   |   Stdout Prefix [cat=X]    |  Polkit Service Restrt|
+-------------------+----------------------------+-----------------------+
```

---

### Pilar 1: Native AI Chat Interface & Kustomisasi Total

Antarmuka percakapan native langsung ke mesin N.E.X.A Server tanpa perantara Telegram.

#### A. Arsitektur Komponen UI (Jetpack Compose Stack)
- `ChatScreen.kt`, `ChatViewModel.kt`, `ChatRepository.kt`.
- `LazyColumn` dengan `reverseLayout = true` dan `Paging 3`:
  ```kotlin
  val pager = Pager(
      config = PagingConfig(
          pageSize = 20,
          prefetchDistance = 5,
          enablePlaceholders = false,
          maxSize = 100 // Menjamin entri pesan lama dilepas dari memori RAM
      )
  ) {
      chatMessageDao.getPagedMessages()
  }
  ```

#### B. Skema Database Lokal (Room DB - Offline First)
```kotlin
@Entity(
    tableName = "chat_messages",
    indices = [Index(value = ["clientMsgId", "role"], unique = true)] // Deduplikasi pesan
)
data class ChatMessageEntity(
    @PrimaryKey val id: String = UUID.randomUUID().toString(),
    val clientMsgId: String,
    val role: String, // "user" | "assistant" | "system"
    val content: String,
    val timestamp: Long = System.currentTimeMillis(),
    val status: String, // "SENDING" | "STREAMING" | "SENT" | "INTERRUPTED" | "FAILED"
    val intentTag: String? = null,
    val executionMetadata: String? = null
)
```

```kotlin
@Dao
interface ChatMessageDao {
    @Query("SELECT * FROM chat_messages ORDER BY timestamp DESC")
    fun getPagedMessages(): PagingSource<Int, ChatMessageEntity>

    @Insert(onConflict = OnConflictStrategy.IGNORE)
    suspend fun insertMessage(message: ChatMessageEntity)

    @Query("UPDATE chat_messages SET content = :finalContent, status = :finalStatus WHERE id = :messageId")
    suspend fun finalizeMessage(messageId: String, finalContent: String, finalStatus: String)

    @Query("UPDATE chat_messages SET status = :status WHERE id = :messageId")
    suspend fun updateMessageStatus(messageId: String, status: String)
}
```

#### C. Mekanisme Token Batching dengan Isolasi Per-Stream Channel
Setiap respons percakapan memiliki antrean `Channel<String>` mandiri yang ditutup eksplisit saat menerima sinyal selesai (`STREAM_FINAL` atau `ERROR_ABORT`):

```kotlin
// ChatViewModel.kt
private val _streamingUiText = MutableStateFlow("")
val streamingUiText: StateFlow<String> = _streamingUiText.asStateFlow()

fun consumeStream(messageId: String, streamChannel: Channel<String>, initialDraft: String = "") {
    viewModelScope.launch(Dispatchers.Default) {
        val sb = StringBuilder(initialDraft)
        var completed = false
        var lastCheckpoint = System.currentTimeMillis()

        try {
            for (firstToken in streamChannel) {
                sb.append(firstToken)
                delay(33L) // Akumulasi token selama ~33ms (~30 fps UI)
                while (true) {
                    val nextToken = streamChannel.tryReceive().getOrNull() ?: break
                    sb.append(nextToken)
                }
                _streamingUiText.value = sb.toString() // Update state memori RAM saja

                // Checkpoint: simpan ke Room setiap 5 detik untuk mencegah kehilangan jika proses mati
                val now = System.currentTimeMillis()
                if (now - lastCheckpoint >= 5_000L) {
                    withContext(NonCancellable + Dispatchers.IO) {
                        chatRepository.finalizeMessage(messageId, sb.toString(), "STREAMING")
                    }
                    lastCheckpoint = now
                }
            }
            completed = true
        } finally {
            withContext(NonCancellable + Dispatchers.IO) {
                val finalStatus = if (completed) "SENT" else "INTERRUPTED"
                chatRepository.finalizeMessage(messageId, sb.toString(), finalStatus)
            }
            _streamingUiText.value = ""
        }
    }
}
```

#### D. Penegakan Step-Up Biometrik pada Level Tool Node.js (FINANCE)
Penegakan keamanan tidak bergantung pada `intent_hint` klien atau output teks LLM:
1. Saat model LLM memutuskan memanggil tool transfer (misalnya `tool_execute_transfer`), Node.js membekukan aksi tersebut dan menyimpannya di memori:
   ```js
   const pendingActions = new Map(); // actionId -> { type, amount, targetAccount, nonce, exp }
   ```
2. Node.js mengirim permintaan otorisasi ke HP yang memuat `actionId`, detail transfer kanonis, dan `nonce` acak.
3. HP menampilkan rincian transfer dari server di dalam **Modal Bottom Sheet** (menutup keyboard otomatis, mengaktifkan `FLAG_SECURE` berhitung referensi, banner warna amber "Butuh konfirmasi sidik jari", menampilkan nama penerima utuh tanpa ellipsis, 4-6 digit rekening terakhir, bank, status whitelist, sisa batas harian, `actionId`, dan hitung mundur 30 detik, serta mengisi title/subtitle `BiometricPrompt` sistem dengan nominal dan 4 digit terakhir).
4. Sensor biometrik HP menandatangani payload kanonis:
   `nexa-action-v1\n${nonceB64}\n${actionId}\n${sha256(canonicalPayload)}`
5. Node.js memverifikasi tanda tangan menggunakan kunci publik HP yang telah terdaftar di database server. Jika cocok, tool dieksekusi satu kali dan `actionId` langsung dihapus.

---

### Pilar 2: Realtime Server Log Monitor On-Demand & Zero-Footprint

Pemantau log server VPS langsung dari HP dengan sistem keran tertutup.

#### A. Format Record Log Biner Terstruktur (13 Byte Header)
Format data minimal tanpa overhead JSON:

```text
Struktur Record Log Biner:
[prio: 1 byte][unit_id: 1 byte][cat_flags: 1 byte][timestamp_ms: 8 bytes big-endian][msg_len: 2 bytes big-endian][message: UTF-8]
Total Header = 1 + 1 + 1 + 8 + 2 = 13 Bytes.

Kamus Unit ID (unit_id):
  0x00 = nexa-server (Node.js Core)
  0x01 = caddy (Web Server)
  0x02 = systemd / kernel
  0x03 = nexa-io / sidecar

Kamus Priority (prio):
  3 = ERROR / FATAL (Merah)
  4 = WARNING (Kuning Amber)
  6 = INFO (Abu-abu / Putih)
  7 = DEBUG (Biru redup)

Kamus Category Flags (cat_flags, bitmask):
  0x01 = FINANCE (Mutasi, saldo, transaksi)
  0x02 = BRIDGE  (Status koneksi HP/Laptop)
  0x04 = AUTH    (Tiket, enrollment, verifikasi)
  0x08 = CADANGAN (Pengembangan mendatang)

Pemotongan Pesan:
  Maksimal ukuran frame adalah 4.096 byte. Jika pesan melebihi batas,
  pesan dipotong pada batas karakter UTF-8 terdekat dan diberi akhiran
  "[TRUNCATED]" (11 byte).
```

#### B. Parsing Kategori Log via Stdout Prefix (Bebas Addon Native)
Node.js memancarkan log standar ke stdout dengan format prefix konvensional:
`console.log('[cat=FINANCE] Mutasi rekening terdeteksi: Rp50.000');`
Daemon Go membaca baris log dari journald, membedah prefix `[cat=...]`, mengisi byte `cat_flags`, menghapus prefix dari teks pesan, lalu meneruskannya ke HP.

#### C. Payload OPEN Kanal Log (`ch=0x03`):
```text
[unit_mask: 1 byte][min_prio: 1 byte][cat_mask: 1 byte][tail_lines: 2 bytes big-endian]
Keterangan: unit_mask dihitung dengan rumus (1 << unit_id).
```

#### D. Pengendali `FLAG_SECURE` dan Siklus Hidup UI
- **Pembersihan Layar Mati:** Menggunakan `LifecycleStartEffect` (dari pustaka `lifecycle-runtime-compose`) untuk menghentikan aliran log dan membersihkan buffer saat aplikasi masuk ke background (`ON_STOP`).
- **Helper Anti-Sadap Layar:**
  ```kotlin
  fun Context.findActivity(): Activity? = when (this) {
      is Activity -> this
      is ContextWrapper -> baseContext.findActivity()
      else -> null
  }
  ```
- **Wadah Buffer Tahan Crash:**
  ```kotlin
  class CircularLogBuffer(val capacity: Int = 2000) {
      private val buffer = ArrayDeque<LogEntry>(capacity + 1)
      private var nextId = 0L
      private val _version = MutableStateFlow(0L)
      val version: StateFlow<Long> = _version.asStateFlow()

      @Synchronized fun push(entry: LogEntry) {
          if (buffer.size >= capacity) buffer.removeFirst()
          buffer.addLast(entry.copy(stableId = ++nextId))
          _version.value++
      }

      @Synchronized fun getOrNull(index: Int): LogEntry? = buffer.getOrNull(index)
      @Synchronized fun size(): Int = buffer.size
      @Synchronized fun clear() { buffer.clear(); _version.value++ }
  }
  ```

#### E. Pendamping Desktop Web Monitor (`/monitor`) Pengganti PM2+ (`app.pm2.io`) - Dikerjakan di Tahap 5
Agar Tuan tetap dapat memantau kesehatan server dan membaca log langsung dari browser desktop tanpa ketergantungan pada server cloud pihak ketiga (`pm2.io`), modul ini dibangun pada **Tahap 5** (setelah seluruh Mobile Bridge selesai & stabil, sehingga PM2+ tetap aman dipakai selama Tahap 1-4):
1. **Prinsip Zero-Overhead:** Disajikan sebagai halaman HTML/JS statis ringan (`vanilla JS`, tanpa bundler berat atau CDN eksternal) di bawah route `/monitor` dengan Content Security Policy ketat (`default-src 'self'`). Saat tab browser ditutup, tidak ada polling atau konsumsi memori tambahan di server.
2. **Paritas Metrik PM2+ On-Demand:**
   - Saat tab `/monitor` aktif terbuka, Node.js melaporkan secara ringan per 2 detik: `process.memoryUsage()` (RSS, Heap Size, Used Heap Size, Heap Usage %), CPU %, Event Loop Latency (`perf_hooks.monitorEventLoopDelay()` mean & p95), HTTP `req/min`, HTTP Mean & P95 Latency (ring buffer ringan), Active Handles & Active Requests (`process._getActiveHandles().length`), Issues counter (unhandled errors), Restarts counter, tombol **Reset Monit**, serta `/proc/meminfo` (`MemAvailable`).
3. **Integrasi Stream Log & Kontrol Restart:**
   - **Live Logs:** Langsung memakai **daemon `nexa-log` (`/io/logs`) yang sudah matang dari Tahap 3**, menggantikan tombol `SHOW LOGS` PM2+.
   - **Tombol Restart:** Memicu restart aman `nexa-server.service` melalui aturan Polkit sempit (hanya `nexa-server.service` dengan verb `restart`), dicatat ke audit log.
4. **Otentikasi Desktop yang Aman:**
   - Karena browser desktop tidak memakai Android Keystore HP, akses `/monitor` dilindungi otentikasi **WebAuthn / Passkey** (sidik jari Windows Hello di ThinkPad) atau persetujuan sekali ketuk dari aplikasi HP (*Out-of-Band Approval*), yang menerbitkan cookie sesi `HttpOnly; Secure; SameSite=Strict` berumur pendek (1-4 jam) + rate limit login. Tidak mengandalkan Bearer token statis tanpa pengaman.

---

### Pilar 3: VPS Remote Interactive Terminal (Shell Inspeksi)

Terminal Linux interaktif penuh dari HP Samsung A33 5G ke VPS Azure.

#### A. Model Hak Akses: Shell Inspeksi (Default) tanpa nexa-admin
- **User Linux:** `nexa-term` (tanpa akses login password SSH).
- **Hak Akses:** `NoNewPrivileges=yes`. Tidak ada akses sudo.
- **Restart Service Tertentu via Polkit:**
  Dikonfigurasi pada file `/etc/polkit-1/rules.d/50-nexa-term.rules`:
  ```js
  polkit.addRule(function(action, subject) {
    if (action.id === "org.freedesktop.systemd1.manage-units" &&
        subject.user === "nexa-term" &&
        action.lookup("unit") === "nexa-server.service" &&
        action.lookup("verb") === "restart") {
      return polkit.Result.YES;
    }
  });
  ```
- **Sandboxing Filesystem:**
  - Menggunakan direktori state `StateDirectory=nexa-term` yang secara otomatis dialokasikan ke `/var/lib/nexa-term` dengan kepemilikan user `nexa-term`.
  - Lingkungan bash dikonfigurasi `Environment=HOME=/var/lib/nexa-term`.
  - Seluruh file source code dan kredensial dikunci: `InaccessiblePaths=/opt/nexa/server /etc/nexa`.
  - Seluruh direktori home user lain dikunci: `ProtectHome=yes`.
  - Sistem file Linux diproteksi: `ProtectSystem=strict`.
- **Batas Sumber Daya Cgroups:** `MemoryHigh=128M`, `MemoryMax=160M`, `CPUQuota=40%`, `TasksMax=128`.

#### B. Mekanisme Resume Sesi Terminal & Replay Buffer
1. **Server-Authoritative Session ID (`sid`):**
   - Node.js bertindak sebagai pemegang otoritas tunggal atas `sid`. Saat sesi terminal pertama dibuka, Node.js menerbitkan `sid` 16-byte acak dan mencatatnya ke memori: `sessions.set(sid, { deviceId, exp })` (TTL 4 jam).
   - Tiket Ed25519 memuat klaim `sid`. Go sidecar menerima tiket dan mengaitkan proses bash PTY ke `sid` tersebut.
2. **Replay Buffer In-Flight (64 KB Ring Buffer):**
   - Go sidecar menyimpan 64 KB output PTY terakhir di dalam memori ring buffer per sesi.
   - HP mencatat total byte yang telah sukses diterima dan dirender (`received_offset: u64`).
   - Saat menyambung ulang, HP mengirim frame `RESUME`:
     `Payload: [session_id: 16 bytes][received_offset: 8 bytes big-endian]`
   - Go sidecar membandingkan offset klien dengan ring buffer:
     - Jika offset masih berada dalam rentang buffer 64 KB, Go langsung menyemburkan byte yang tertinggal sehingga tampilan layar terminal HP kembali utuh tanpa teks terpotong.
     - Jika koneksi terputus terlalu lama dan offset sudah terlewati dari ring buffer, Go mengirimkan sinyal reset terminal disusul `SIGWINCH` untuk memaksa aplikasi terminal (seperti `top` atau `nano`) menggambar ulang seluruh layar (*redraw*).
3. **Penyatuan Aturan Timer Putus Koneksi (Dead-Man Switch):**
   - Klien mengirim frame `PING` setiap 15 detik ke kanal kontrol (`ch=0x00`).
   - Jika server tidak menerima frame apapun dari HP selama **30 detik**, atau jika koneksi socket TCP/WSS terputus, status sesi diubah menjadi **DETACHED**.
   - Pada kondisi DETACHED, aliran data PTY dibekukan dan hitungan mundur **Grace Period 120 detik** dimulai.
   - Jika HP melakukan *reconnect* sebelum 120 detik habis, sesi langsung pulih.
   - Jika 120 detik terlampaui tanpa ada rekoneksi, Go sidecar mengeksekusi pembersihan bersih: mengirim `SIGHUP` ke process group bash, disusul `SIGKILL` setelah 2 detik.

---

## 4. Cetak Biru Server VPS: Caddy, Systemd, & Sandboxing

### A. Konfigurasi Caddyfile
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

### B. Unit File Log Streamer (`nexa-log.socket` & `.service`)
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
Restart=no
KillMode=control-group
NoNewPrivileges=yes
PrivateTmp=yes
ProtectHome=yes
ProtectSystem=strict
InaccessiblePaths=/opt/nexa/server /etc/nexa
LoadCredential=ticket-pub.pem:/etc/nexa/ticket-pub.pem
MemoryHigh=36M
MemoryMax=48M
TasksMax=32
CPUQuota=20%
```

### C. Unit File Terminal Interaktif (`nexa-term.socket` & `.service`)
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
StateDirectory=nexa-term
Environment=HOME=/var/lib/nexa-term
ExecStart=/opt/nexa/bin/nexa-io --mode=terminal
Restart=no
KillMode=control-group
NoNewPrivileges=yes
PrivateTmp=yes
ProtectHome=yes
ProtectSystem=strict
InaccessiblePaths=/opt/nexa/server /etc/nexa
LoadCredential=ticket-pub.pem:/etc/nexa/ticket-pub.pem
MemoryHigh=128M
MemoryMax=160M
TasksMax=128
CPUQuota=40%
```

### D. Pengujian Keamanan Sandbox
Pengujian isolasi mount namespace systemd dilakukan dari dalam sesi terminal aktif atau menggunakan alat audit resmi systemd:
```bash
# Uji isolasi dari luar:
systemd-analyze security nexa-term.service

# Uji dari dalam sesi shell terminal aktif:
cat /opt/nexa/server/.env
# Respon yang benar: No such file or directory / Permission denied
```

---

## 5. Arsitektur Otentikasi Hardware-Backed & Pendaftaran Kunci Perangkat

### A. Pendaftaran Kunci Perangkat via CLI Administratif (`nexa-enroll`)
Kunci publik Android Keystore tidak pernah diterima dari endpoint publik demi mencegah bypass biometrik:

```
Tuan (Di Server / SSH)          Aplikasi HP (Nexa Mobile)         Database Server (/etc/nexa)
┌───────────────────────┐       ┌───────────────────────┐        ┌─────────────────────────┐
│ 1. Jalankan CLI:      │       │ 2. Buat Keypair       │        │                         │
│    nexa-enroll start  │       │    Keystore ECDSA P256│        │                         │
│    (Generate Token)   │       │ 3. Pindai QR / Input  │        │                         │
│ 4. Verifikasi & Simpan├───────┤    Token Enrollment   │───────►│ 5. Simpan Kunci Publik  │
│    ID Perangkat Sah   │       │                       │        │    enrolled_devices.json│
└───────────────────────┘       └───────────────────────┘        └─────────────────────────┘
```

1. **Struktur Penyimpanan Kunci Terdaftar (`/etc/nexa/enrolled_devices.json`):**
   File dikunci dengan izin `chmod 0600` dan dimiliki oleh user `nexa:nexa`:
   ```json
   {
     "samsung-a33-tuan": {
       "deviceId": "samsung-a33-tuan",
       "publicKeySpkiDerB64": "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE...",
       "enrolledAt": 1731934800,
       "status": "ACTIVE"
     }
   }
   ```
2. **Alur Pemulihan Re-Enrollment:**
   Jika Tuan menambahkan sidik jari baru di pengaturan Android, Android Keystore secara otomatis memusnahkan kunci privat lama (`KeyPermanentlyInvalidatedException`). Aplikasi HP mendeteksi kondisi ini, menampilkan dialog pemulihan, dan meminta Tuan menjalankan CLI `nexa-enroll re-pair` di server untuk mendaftarkan kunci publik baru tanpa harus mereset konfigurasi server.

### B. Spesifikasi Kunci Android Keystore
```kotlin
val keySpec = KeyGenParameterSpec.Builder("nexa_device_key", KeyProperties.PURPOSE_SIGN)
    .setAlgorithmParameterSpec(ECGenParameterSpec("secp256r1"))
    .setDigests(KeyProperties.DIGEST_SHA256)
    .setUserAuthenticationRequired(true)
    .setUserAuthenticationParameters(0, KeyProperties.AUTH_BIOMETRIC_STRONG) // Biometrik wajib setiap tanda tangan
    .setInvalidatedByBiometricEnrollment(true) // Invalid jika ada sidik jari baru di OS
    .build()
```

### C. Alur Tantangan Nonce & Penerbitan Tiket di Node.js
```js
// ticket-service.js
import { createPublicKey, createPrivateKey, sign, verify, randomBytes } from 'node:crypto';
import fs from 'node:fs';

const serverPriv = createPrivateKey(fs.readFileSync('/etc/nexa/ticket-priv.pem'));
const enrolledDevices = new Map(); // Dimuat saat startup dari /etc/nexa/enrolled_devices.json
const pendingChallenges = new Map(); // nonceB64 -> { deviceId, scope, exp }
const activeSessions = new Map(); // sid -> { deviceId, scope, exp }

// Pembersihan berkala nonce kadaluarsa setiap 60 detik (mencegah memory leak)
setInterval(() => {
    const now = Date.now();
    for (const [nonce, data] of pendingChallenges.entries()) {
        if (now > data.exp) pendingChallenges.delete(nonce);
    }
}, 60_000);

export function makeChallenge(deviceId, scope) {
    // Batasi antrean pending maksimal 8 per perangkat
    let count = 0;
    for (const data of pendingChallenges.values()) {
        if (data.deviceId === deviceId) count++;
    }
    if (count >= 8) throw new Error('TOO_MANY_PENDING_CHALLENGES');

    const nonce = randomBytes(32).toString('base64url');
    pendingChallenges.set(nonce, { deviceId, scope, exp: Date.now() + 30_000 });
    return { nonce, scope, exp: pendingChallenges.get(nonce).exp };
}

export function issueTicket(deviceId, nonceB64, scope, clientSid, sigDer) {
    const challenge = pendingChallenges.get(nonceB64);
    pendingChallenges.delete(nonceB64); // Hapus seketika (sekali pakai)

    if (!challenge || challenge.deviceId !== deviceId || challenge.scope !== scope || Date.now() > challenge.exp) {
        return null;
    }

    const device = enrolledDevices.get(deviceId);
    if (!device || device.status !== 'ACTIVE') return null;

    // String tanda tangan kanonis
    const sidToSign = clientSid || '';
    const canonicalMessage = Buffer.from(`nexa-ticket-v1\n${nonceB64}\n${scope}\n${sidToSign}`, 'utf8');
    const pubKey = createPublicKey({ key: Buffer.from(device.publicKeySpkiDerB64, 'base64'), format: 'der', type: 'spki' });
    const isValid = verify('sha256', canonicalMessage, { key: pubKey, dsaEncoding: 'der' }, sigDer);

    if (!isValid) return null;

    // Kelola Session ID secara otoritatif
    let finalSid = clientSid;
    if (scope === 'term') {
        if (finalSid) {
            const existing = activeSessions.get(finalSid);
            if (!existing || existing.deviceId !== deviceId) return null; // Tolak resume ilegal
        } else {
            finalSid = randomBytes(16).toString('base64url');
            activeSessions.set(finalSid, { deviceId, scope, exp: Date.now() + (4 * 3600_000) });
        }
    }

    const payload = JSON.stringify({
        scope,
        exp: Math.floor(Date.now() / 1000) + 45,
        jti: randomBytes(12).toString('base64url'),
        sid: finalSid
    });

    const b64u = (b) => Buffer.from(b).toString('base64url');
    const payloadBuf = Buffer.from(payload);
    const signature = sign(null, payloadBuf, serverPriv);
    return { ticket: `${b64u(payloadBuf)}.${b64u(signature)}`, sid: finalSid };
}
```

---

## 6. Penanganan Keyboard Virtual & IME di Android

### A. Komponen Input Tersembunyi (`TerminalInputSink`) - TERUJI DI SAMSUNG A33 (20 NOV 2026)

> [!NOTE]
> **Hasil Uji Nyata Tahap 0 (`com.nexa.imetest` di Samsung Galaxy A33, One UI 8.0):**
> 1. Pada Compose BOM `2026.03.01`, konstanta `KeyboardType.VisiblePassword` **tidak ada** (gagal compile). Penggantinya adalah **`KeyboardType.Password`** (dengan `VisualTransformation.None` bawaan `BasicTextField` agar teks tidak disamarkan).
> 2. Dengan `KeyboardType.Password` + `autoCorrectEnabled = false`, Samsung Keyboard **mematikan baris saran kata, menonaktifkan auto-correct (`composition = null` di tiap ketikan), dan mematikan *swipe typing***.
> 3. Tombol `Enter` tertangkap oleh `onPreviewKeyEvent` dan memancarkan `0x0D` (`\r`), tombol `Backspace` tertangkap bersih sebagai `0x7F` tanpa duplikasi diff, dan `CTRL + c` memancarkan `0x03` (`^C`).
> 4. Sebagai pengaman tambahan untuk keyboard lain, `emit()` tetap menormalisasi karakter `\n` menjadi `\r`. Tidak diperlukan fallback `AndroidView(EditText)`.

Menggunakan `ModifierState` yang dioper dari ViewModel induk agar tombol pada Accessory Bar dan input sink selalu sinkron:

```kotlin
// TerminalInputSink.kt
private const val SENTINEL = "\u200B"

@Composable
fun TerminalInputSink(
    modifiers: ModifierState,
    onSendBytes: (ByteArray) -> Unit,
    modifier: Modifier = Modifier
) {
    var tfv by remember { mutableStateOf(TextFieldValue(SENTINEL, TextRange(SENTINEL.length))) }

    fun emit(chars: String) {
        val (isCtrl, isAlt) = modifiers.consume()
        val normalized = chars.replace('\n', '\r')
        val bytes = when {
            isCtrl -> {
                normalized.map { ch ->
                    val code = ch.uppercaseChar().code
                    if (code in 64..95) (code and 0x1F).toByte() else ch.code.toByte()
                }.toByteArray()
            }
            isAlt -> byteArrayOf(0x1B) + normalized.toByteArray(Charsets.UTF_8)
            else -> normalized.toByteArray(Charsets.UTF_8)
        }
        onSendBytes(bytes)
    }

    BasicTextField(
        value = tfv,
        onValueChange = { new ->
            val text = new.text
            when {
                !text.startsWith(SENTINEL) -> onSendBytes(byteArrayOf(0x7F)) // Backspace
                text.length > SENTINEL.length -> emit(text.removePrefix(SENTINEL))
            }
            tfv = TextFieldValue(SENTINEL, TextRange(SENTINEL.length))
        },
        modifier = modifier
            .size(1.dp)
            .alpha(0.01f)
            .onPreviewKeyEvent { keyEvent ->
                if (keyEvent.type == KeyEventType.KeyDown) {
                    when (keyEvent.key) {
                        Key.Enter -> { onSendBytes(byteArrayOf(0x0D)); true } // Wajib \r untuk PTY
                        Key.Tab -> { onSendBytes(byteArrayOf(0x09)); true }
                        Key.Backspace -> { onSendBytes(byteArrayOf(0x7F)); true }
                        else -> false
                    }
                } else false
            },
        keyboardOptions = KeyboardOptions(
            capitalization = KeyboardCapitalization.None,
            autoCorrectEnabled = false,
            keyboardType = KeyboardType.Password, // Teruji di Samsung A33 (Compose BOM 2026.03.01)
            imeAction = ImeAction.None
        )
    )
}
```

### B. Ergonomi Accessory Bar (411 dp Galaxy A33) & Perilaku Keyboard (`WindowInsets.isImeVisible`)
- **Penyembunyian Bottom Nav Saat Keyboard Terbuka:** Di seluruh layar, Bottom Navigation Bar (4 tab: `Chat` | `HUD` | `Logs` | `Shell`) otomatis disembunyikan saat `WindowInsets.isImeVisible == true`.
- **Header Tunggal Terminal (40 dp):** Toolbar dan session banner digabung menjadi satu baris (`nexa-term@vps · Aktif · Sisa 3j 52m · ⋮`) agar kanvas terminal mendapat ~22-24 baris saat keyboard terbuka.
- **Susunan Accessory Bar (Tombol >= 44x48 dp):**
  ```text
  Baris 1 (9 tombol tetap, 44x48 dp) : [ESC] [TAB] [CTRL] [ALT] [ ← ] [ ↓ ] [ ↑ ] [ → ] [ ⋯ ]
  Baris 2 (LazyRow geser, 44x48 dp)  : [^C] [^D] [^Z] [^L] [ - ] [ / ] [ | ] [ ~ ] [ $ ] [ * ] [Home] [End] [PgUp] [PgDn]
  ```
  - Baris 2 default tersembunyi dan dibuka/ditutup lewat tombol `⋯`.
  - State `CTRL`/`ALT` dibedakan dengan tiga penanda visual (bukan warna saja): `IDLE` (normal), `ONCE` (outline aksen + titik/garis bawah), `LOCKED` (fill `#00B8D4` + ikon gembok kecil).

### C. Standar Warna OLED, Aksesibilitas WCAG AA, `FLAG_SECURE`, & Hemat GPU
- **Perluasan `FLAG_SECURE` Berhitung Referensi:** Aktif pada layar **Log**, **Terminal**, **Settings**, dan saat **Modal Bottom Sheet Step-Up `FINANCE`** tampil di Chat.
- **Palet Warna & Kontras (>= 4,5:1):** Latar `#0A0E14`, Surface `#111720`, Elevasi `#1A2232`, Outline komponen `1 dp` `#2A3548`, Teks utama `#E2E8F0`, Teks sekunder `#9FB0C7`.
- **Dua Tingkat Cyan (Anti-Silau OLED):** `#00E5FF` untuk outline/ikon/aksen kecil; **`#00B8D4`** (teks `#04181F`) untuk tombol fill besar (`Kirim`, `Terapkan`, `CTRL Locked`). Untuk Mode Terang (P2), cyan menggunakan `#007C91` (~4,9:1 di atas putih).
- **Disiplin 4 Warna Semantik & Hemat GPU (`Graphics` Baseline 19,2 MB):** Hanya Cyan (merek/aksi utama), Hijau `#00E676` (online/sukses/`FINANCE`), Amber `#FFAB40` (step-up/`WARN`/paused), dan Merah `#FF5252` (error/destruktif). Tanpa `Modifier.blur` / shadow berlapis dan tanpa titik berkedip konstan.

---

## 7. Spesifikasi Protokol WebSocket (Koneksi A JSON vs Koneksi B Biner)

### 7.1 Koneksi A (`/ws` pada Node.js `src/interfaces/bridge/gateway.js`)
Hasil audit kode `gateway.js` menunjukkan seluruh **binary frames** di `/ws` diarahkan langsung ke `Live_Voice_Engine` sebagai aliran audio PCM mentah. Karena itu, **seluruh pesan kontrol, otentikasi, step-up, dan AI Chat di Koneksi A WAJIB menggunakan JSON Text Frames** (dengan field `type`, kompatibel penuh dengan `NexaWebSocketClient.kt` dan `windows_bridge`):

- **Auth & Ticket:** `TICKET_REQ`, `CHALLENGE`, `CHALLENGE_RESP`, `TICKET`, `AUTH_ERR`
- **Chat AI Native:** `CHAT_SEND` (`client_msg_id`, `content`, `intent_hint`, `ts`), `CHAT_CHUNK` (`client_msg_id`, `seq`, `status`, `chunk`), `CHAT_FINAL`, `CHAT_RESUME` (`client_msg_id`, `last_seq`), `CHAT_STOP`
- **Finance Step-Up:** `ACTION_PENDING` (`action_id`, `canonical_summary`, `amount`, `recipient_full`, `bank`, `acct_last4`, `whitelisted`, `daily_remaining`, `expires_at`), `ACTION_AUTH` (`action_id`, `nonce`, `signature_b64`, `device_id`), `ACTION_RESULT`

### 7.2 Koneksi B (`/io/logs` dan `/io/term` pada Go Sidecar `nexa-io`)
Struktur frame biner murni untuk efisiensi jalur panas (log dan PTY):

```text
Struktur Frame Biner Koneksi B:
[ch: u8][op: u8][payload: N bytes] (Big-Endian)

Kanal (Channel ID - ch):
  0x00 = CONTROL   (Ping, Pong, Hello, Heartbeat)
  0x03 = LOGS      (Aliran Log Server via /io/logs)
  0x10..0xFF = TERMINAL SESSION (via /io/term)

Opcode (op):
  0x01 = OPEN    (Buka kanal baru)
  0x02 = DATA    (Payload teks / record biner streaming)
  0x03 = CREDIT  (Flow control backpressure)
  0x04 = CLOSE   (Penutupan kanal)
  0x05 = RESIZE  (Perubahan ukuran PTY rows x cols)
  0x06 = ERR     (Laporan kesalahan)
  0x07 = PING    (Cek koneksi heartbeat)
  0x08 = PONG    (Balasan heartbeat)
  0x09 = RESUME  (Menyambung kembali sesi terminal)
```

### Tabel Rincian Payload per Opcode

| Opcode | Kanal | Payload (Big-Endian) |
|---|---|---|
| OPEN (0x01) | Terminal (0x10) | `[rows: u16][cols: u16]` |
| OPEN (0x01) | Logs (0x03) | `[unit_mask: u8][min_prio: u8][cat_mask: u8][tail_lines: u16]` |
| RESUME (0x09) | Terminal (0x10) | `[session_id: 16 bytes][received_offset: u64]` |
| RESIZE (0x05) | Terminal (0x10) | `[rows: u16][cols: u16]` |
| CREDIT (0x03) | Terminal / Logs | `[bytes_credit: u32]` |
| CLOSE (0x04) | Semua | `[reason_code: u8]` |
| PING (0x07) | Control (0x00) | (kosong) |
| PONG (0x08) | Control (0x00) | (kosong) |

---

## 8. Anggaran Memori (RAM Budget) - KALIBRASI TAHAP 0 (20 NOV 2026)

> [!NOTE]
> Angka untuk kondisi **Standby**, **UI Terbuka Eksisting**, dan **Baseline VPS** di bawah ini adalah **HASIL UKUR NYATA** (`dumpsys meminfo` dan `free -m`, 20 Nov 2026) pada build `DEBUGGABLE`. Target untuk fitur baru (Chat, Log, Terminal) telah dikalibrasi ulang agar realistis berdasarkan basis UI nyata (`91,6 MB`). Build `release` (apalagi dengan R8) nantinya berpotensi lebih rendah.

### A. Penggunaan RAM HP Android per Skenario (Terukur vs Target Terkalibrasi)
```
+----------------------------------------------------+---------------------+------------------+-----------------+
| Skenario Nyata                                     | Status / Angka PSS  | Target Budget    | Persen dari 8 GB|
+----------------------------------------------------+---------------------+------------------+-----------------+
| 1. Standby Background (Activities: 0, Views: 0)    | 48,6 MB (TERUKUR)   | <= 55 MB         |  ~0.6%          |
| 2. UI Dasar Terbuka Eksisting (Compose + Eyes)     | 91,6 MB (TERUKUR)   | (Basis UI)       |  ~1.1%          |
| 3. Sedang Chat Aktif (Basis UI + Room + Paging3)   | Estimasi kalibrasi  | <= 110 MB        |  ~1.3%          |
| 4. Sedang Call Voice Live (PCM + Eyes 60fps)       | Estimasi kalibrasi  | <= 115 MB        |  ~1.4%          |
| 5. Sedang Buka Log Server (Basis UI + Ring 2.000)  | Estimasi kalibrasi  | <= 115 MB        |  ~1.4%          |
| 6. Sedang Buka Terminal Linux (Basis UI + Native)  | Estimasi kalibrasi  | <= 115 MB        |  ~1.4%          |
| 7. Puncak Multitasking (Voice + Switch Terminal)   | Estimasi kalibrasi  | <= 135 MB        |  ~1.7%          |
+----------------------------------------------------+---------------------+------------------+-----------------+
Rincian terukur UI Terbuka Eksisting (93.825 KB): Graphics 19.183 KB (EGL 13.839 + GL 5.344), Code 22.168 KB,
Native Heap 16.764 KB, Java Heap 11.028 KB, Private Other 9.364 KB, Stack 1.360 KB, System 13.958 KB.
```

### B. Anggaran RAM VPS Azure (Ubuntu 892 MB RAM Fisik, Terukur 20 Nov 2026)
| Komponen VPS | Kondisi Saat Ini (Terukur) | Target Standby (Pasca Migrasi PM2) | Target Aktif (Log + Terminal) |
|---|---|---|---|
| **Total Used RAM VPS (`free -m`)** | `596 MB` (Swap `260 MB`) | estimasi `~549 MB` (hemat PM2) | estimasi `~575 - 605 MB` |
| **Go Sidecar `nexa-log`** | Belum dipasang (`0 MB`) | `0 MB` (socket activation) | estimasi `+8 - 12 MB` |
| **Go Sidecar `nexa-term`** | Belum dipasang (`0 MB`) | `0 MB` (socket activation) | estimasi `+10 - 15 MB` |
| **Proses `bash` + `journalctl`** | Belum dipasang (`0 MB`) | `0 MB` | estimasi `+9 - 14 MB` |
| **Sisa RAM *Available* (`free -m`)** | **`295 MB` (TERUKUR)** | estimasi **`~342 MB`** | estimasi **`~285 - 315 MB`** |

---

## 9. Roadmap Langkah Kerja Implementasi

```
TAHAP 0           TAHAP 1            TAHAP 1.5         TAHAP 2            TAHAP 3            TAHAP 4            TAHAP 5 (PASCA-MOBILE)
Audit Baseline    Fondasi + Core HP  Device Spine      Native Chat        Log Monitor        Terminal PTY       Web /monitor + Systemd
[SELESAI 20 NOV]  - Domain & Caddy   - CLI nexa-enroll - Compose + Room   - Go nexa-log      - Go nexa-term     - Web /monitor (PM2+ parity)
- meminfo:48.6/91 - Chmod 0600/0700  - Keystore ECDSA  - JSON /ws Chat    - Journald+PM2 log - LoadCredential   - Migrasi PM2 -> systemd
- free -m: 295 MB - Ed25519 keypair  - JSON Challenge  - Per-stream chan  - Binary rec 13B   - 64KB Replay Ring - Hapus PM2 (+47MB RAM)
- PAGE_SIZE: 4096 - Fix Wake/WifiLk  - Go ticket lib   - Modal Step-Up    - LifecycleStart   - 9-key 44x48dp    - Log 100% journald
- IME A33: LULUS  - Clean AccessSvc  - Walking Skel    - Checkpoint 5s    - FLAG_SECURE ref  - Kill switch      - Polkit Restart aktif
```

### Tahap 0: Baseline Audit & Pengujian Perangkat Riil (Gerbang Wajib - SELESAI)
1. **[SELESAI]** Audit memori baseline HP (`adb shell dumpsys meminfo com.nexa.mobilebridge`): `48,6 MB` standby, `91,6 MB` UI terbuka (build `DEBUGGABLE`).
2. **[SELESAI]** Cek kernel page size (`adb shell getconf PAGE_SIZE`): **`4096` byte**. Audit `.so` saat ini hanya 3 library AndroidX. (Audit `.so` `termlib` 16 KB tetap dilakukan saat library dipilih sebelum Tahap 4).
3. **[SELESAI]** Audit WakeLock/WifiLock & kode: terkonfirmasi `NexaBridge::WakeLock` ditahan >10,5 jam dan `WifiLock type=4` ditahan terus sejak `onCreate()`, plus `NexaAccessibilityService` masih terpasang di manifest/kode.
4. **[SELESAI]** Baseline VPS & verifikasi infra (`free -m`): `892 MB` total, `596 MB` used, **`295 MB` available** (`Swap 260 MB`), `systemd 255`, `cgroup2`, `/usr/bin/ss` tersedia.
5. **[SELESAI]** Uji IME Samsung Keyboard di A33 (`com.nexa.imetest`): `KeyboardType.Password` + `autoCorrectEnabled=false` mematikan saran kata, prediksi, dan swipe typing (`comp=null`); Enter=`0x0D`, Backspace=`0x7F`, `CTRL+c`=`0x03` terverifikasi di layar dan hex log.
6. **[SELESAI]** Audit kode mendalam `nexa-server` (CommonJS `src/app.js`, binary `/ws` = PCM Live Voice, `logger.js` central hook, `ecosystem.config.js` heap/log paths) dan `nexa-mobile-bridge` (radius dampak `AccessibilityService`). **Gerbang menuju Tahap 1 terbuka.**

### Tahap 1: Fondasi Server Ringkas & Core Hygiene HP (PM2 Dipertahankan Sementara)
1. **Server (tanpa mematikan PM2 dulu):**
   - Menyetel izin berkas ketat: `chmod 0700` direktori server, `chmod 0600 .env`.
   - Menghasilkan keypair server Ed25519: `/etc/nexa/ticket-priv.pem` (`0600` milik `nexa`) dan `/etc/nexa/ticket-pub.pem` (`0644`).
   - Memperbarui `ecosystem.config.js` (`--max-old-space-size=320`, `max_memory_restart: '420M'`, aman di atas baseline Used Heap 173 MiB) dan CORS `NEXA_DOMAIN` di `src/app.js`.
   - Menyiapkan Caddyfile dengan domain kustom (atau domain aktif saat ini sampai DNS siap) + placeholder route `/io/logs` dan `/io/term`.
   - Menambahkan hook redaksi rahasia (`FR-SEC-04`) dan prefix `[cat=...]` terpusat di `src/utils/logger.js`.
2. **Android Core Hygiene (`nexa-mobile-bridge`):**
   - Memperbaiki `WakeLock` & `WifiLock` di `NexaBridgeService.kt` (`FR-CORE-04`: lepas saat idle, tahan hanya saat transfer/panggilan aktif).
   - Membersihkan `NexaAccessibilityService` & `MBankingShieldManager` (`FR-CORE-03`, setelah konfirmasi daftar perintah terdampak dari Tuan) serta mengalihkan `AppUsageTracker` ke `UsageStatsManager.queryEvents()`.
   - Menyiapkan kerangka navigasi 4 tab (`Chat | HUD | Logs | Shell`) + Design System tokens (`NexaCyberDark` & `NexaLight` WCAG AA) + sembunyikan Bottom Nav saat `WindowInsets.isImeVisible`.

### Tahap 1.5: Identitas Perangkat & Fondasi Kriptografi (Device Identity Spine)
1. Membangun CLI server CommonJS `scripts/nexa-enroll.js` untuk registrasi perangkat tepercaya ke `/etc/nexa/enrolled_devices.json`.
2. Menerapkan generator kunci ECDSA P-256 di Android Keystore + `BiometricPrompt` (`CryptoObject`) + layar Settings Security v3 (`FLAG_SECURE`, SHA-256 32 oktet penuh, status enrollment & recovery `KeyPermanentlyInvalidatedException`).
3. Menyusun modul layanan `challenge` dan verifikasi tanda tangan kanonis JSON di `nexa-server` (`/ws`) lengkap dengan rate limit & audit log.
4. Membangun paket pustaka verifikasi tiket Ed25519 di Go (`nexa-io/internal/ticket`, dipakai bersama oleh mode logs dan term).
5. Menerapkan *Walking Skeleton*: menguji alur challenge -> biometrik HP -> tiket Ed25519 -> verifikasi Go sidecar sebelum membangun UI Chat/Log/Terminal.

### Tahap 2: Native AI Chat Interface & Step-Up Finance di HP
1. Membangun modul `mobile_chat` di `nexa-server` (JSON `/ws`: `CHAT_SEND`, `CHAT_CHUNK`, `CHAT_FINAL`, `CHAT_RESUME`) yang terhubung ke `AI_Router` + `domain_dispatcher.js` dan menyimpan riwayat `platform = 'mobile'`.
2. Membangun Room DB + Paging 3 (`maxSize = 100`, index unique `clientMsgId`) di Android.
3. Membangun `ChatScreen` Jetpack Compose (sesuai Blueprint Stitch v2) dengan coroutine consumer per-stream, 33ms batching, `NonCancellable` finalize, checkpoint 5 detik, dan kontrol TTS/haptik.
4. Menerapkan penegakan Step-Up Biometrik pada level tool Node.js untuk aksi sensitif `FINANCE`, ditampilkan sebagai **Modal Bottom Sheet** (`FLAG_SECURE`, detail penuh tanpa ellipsis, timer TTL, input chat terkunci).
5. Memastikan render mata robot `NexaExpressiveEyes` dijeda otomatis saat layar mati / background.

### Tahap 3: Log Monitor On-Demand Terstruktur Biner
1. Mengompilasi daemon biner Go mini `nexa-io --mode=logs` (`nexa-log.socket` & `nexa-log.service`) dengan socket activation, `LoadCredential`, dan sandboxing ketat.
2. Selama PM2 masih aktif (Tahap 3-4), `nexa-log` membaca gabungan `journald` (Caddy/system) + file log PM2 (`./logs/out.log`, `./logs/err.log`) secara read-only; mengurai `[cat=...]` ke `cat_flags` 13-byte record biner.
3. Membangun `LogViewerScreen` native (sesuai Blueprint Stitch v2: filter chip + search toggle, Pause/Resume, Auto-Scroll, Clear Buffer, indikator baris terlewat `0x80`, TANPA tombol Export) dengan `LifecycleStartEffect` dan `CircularLogBuffer`.
4. Menerapkan helper `findActivity()` ref-counted untuk proteksi `FLAG_SECURE`.

### Tahap 4: Remote Terminal Interaktif PTY Penuh
1. Audit alignment 16 KB `.so` pada `termlib` vs emulator Java Termux, lalu pilih engine terminal Android.
2. Mengompilasi mode terminal pada `nexa-io --mode=terminal` (`nexa-term.socket` & `nexa-term.service`) dengan `creack/pty`, `StateDirectory=nexa-term`, `LoadCredential`, sandboxing ketat, dan kill switch default OFF.
3. Mengimplementasikan protokol `RESUME (opcode 0x09)` dengan ring buffer replay 64 KB, Dead-Man Switch (30s detach + 120s grace), batas sesi absolut 4 jam, dan audit logging.
4. Membangun `TerminalScreen` (sesuai Blueprint Stitch v2) dengan `TerminalInputSink` (`KeyboardType.Password`), `ModifierState` (single-shot vs locked non-warna), dan Accessory Bar 9 tombol `44x48 dp` + baris 2 `LazyRow`.

### Tahap 5 (Pasca-Rilis Mobile Bridge): Desktop Web Monitor `/monitor` & Migrasi PM2 ke Systemd
1. Membangun halaman **Desktop Web Monitor (`/monitor`)** (sesuai Blueprint Stitch v2, paritas penuh metrik PM2+: CPU, RAM/Heap, `perf_hooks` Event Loop Latency p50/p95, HTTP req/min & Mean/P95 Latency, Active handles/requests, Issues, Restarts, Reset Monit, stream live `/io/logs`, otentikasi WebAuthn/HP approval).
2. Mengaktifkan unit `nexa-server.service` (entry point `src/app.js`, `--max-old-space-size=320`, log ke `journald`) dan aturan Polkit restart `nexa-server.service` (untuk tombol Restart di `/monitor` dan shell `nexa-term`).
3. Mematikan dan menghapus PM2 + PM2+ secara permanen (`pm2 kill && pm2 unstartup`), verifikasi penghematan ~47 MB RAM via `free -m`.
4. Mengalihkan `nexa-log` menjadi 100% pembaca `journald` murni (menghapus pembacaan file log PM2).

---
*Dokumen ini merupakan cetak biru spesifikasi arsitektur final v2.4 (Code-Grounded Alignment) yang siap dieksekusi bertahap mulai dari Tahap 1.*
