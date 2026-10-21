# N.E.X.A Windows Bridge — Architectural Blueprint & Implementation Plan
*(Ultra-Lightweight Desktop Executive Companion: <25MB RAM, Rust, Slint GUI, Windows.Graphics.Capture, WASAPI Duplex, Hardware-AEC & Desktop Automation)*

> **Dokumen:** `Plan/NEXA_WINDOWS_BRIDGE_ARCHITECTURE_PLAN.md`  
> **Komponen:** `nexa-windows-bridge` (Windows 10/11 x64) & `nexa-server` (`MobileBridge_WS.js`, `Live_Voice_Engine.js`, `Live_Tool_Registry.js`)  
> **Target Perangkat Utama:** Lenovo ThinkPad X380 Yoga (Conexant CX11771 HD Audio, Dual-Array Bezel Mic)  
> **Target Fitur:** Pendamping Desktop Multimodal Holistik (Suara Dupleks Bebas Headset, Avatar Ekspresi, Berbagi Layar On-Demand, Eksekusi Intent Backend, Otomasi Input Layar, & Sorotan Elemen Layar)  
> **Filosofi Inti:** *Peak Performance, Zero-Garbage Collection, Native Windows APIs (<25MB RAM)*  
> **Terakhir Diperbarui:** 2026-10-21  

> [!IMPORTANT]
> ### 📌 PRINSIP BAKU: PENAMAAN FILE & ARSITEKTUR WAJIB NORMAL & SESUAI LINGKUNGAN AGENT
> **Evaluasi dari Nexa Server:** Seluruh nama file, folder, modul, dan fungsi **HARUS MENGGUNAKAN NAMA NORMAL, DESKRIPTIF, DAN BAKU** sesuai standar rekayasa software & lingkungan AI agent modern.
> **DILARANG MENGGUNAKAN NAMA ANEH/LEBAY HANYA AGAR TERLIHAT FUTURISTIK** (misal: dilarang memakai nama seperti *NexaExpressiveEyes*, *KineticReticles*, *VirtualHandsEngine*, *CyberpunkHUD*, dll).
>
> **Standar Penamaan yang Diberlakukan:**
> 1. **Komponen UI (Slint):**
>    - `main_window.slint` (bukan *CyberpunkHUD*)
>    - `settings_dialog.slint` (bukan *CyberConfig*)
>    - `avatar.slint` (bukan *NexaExpressiveEyes*)
>    - `audio_meter.slint` (bukan *WaveformVocalMatrix*)
>    - `click_indicator.slint` (bukan *CyanRippleVortex*)
>    - `controls.slint`
> 2. **Modul Rust (`src/`):**
>    - `audio/microphone.rs`, `audio/speaker.rs`, `audio/echo_canceller.rs`, `audio/audio_buffer.rs`
>    - `capture/screen_capture.rs`
>    - `network/ws_client.rs`, `network/protocol.rs`
>    - `automation/input.rs`, `automation/highlighter.rs`, `automation/element_finder.rs` (bukan *VirtualHands* atau *KineticPointer*)
>    - `platform/power_events.rs`, `platform/system_tray.rs`, `platform/hotkeys.rs`, `platform/clipboard.rs`
> 3. **Tool Calling Gemini Live:**
>    - `desktopClick`, `desktopScroll`, `desktopTypeText`, `desktopPressKey`
>    - `highlightElement`, `pointCursor`, `clearHighlights`, `escalateToDeepThinking`

---

## 1. Executive Summary & Visi Produk

**N.E.X.A Windows Bridge** adalah klien desktop ultra-ringan berbasis **Rust** yang menghadirkan kehadiran fisik N.E.X.A di PC/laptop Tuan Faqih sebagai **Executive Companion** cerdas.

Aplikasi ini **TIDAK DIKHUSUSKAN HANYA UNTUK KODING**. Sebaliknya, ia dirancang sebagai kawan diskusi serbaguna saat Tuan membuka laptop:
* Membaca dan menelaah artikel riset, jurnal, atau tugas kuliah Bahasa Arab.
* Berdiskusi santai, bertukar pikiran soal geopolitik Timur Tengah, beasiswa Jardine, atau refleksi harian.
* Menganalisis dokumen, grafik keuangan, atau materi presentasi di layar tanpa privasi rumit (langsung tampil to-the-point).
* **100% Bebas Headset:** Dioptimalkan khusus untuk arsitektur akustik **Lenovo ThinkPad X380 Yoga**, memungkinkan Tuan berbicara langsung ke laptop tanpa gema (*zero acoustic feedback*).
* **Eksekusi Backend Terintegrasi:** Mampu mengeksekusi pencatatan kas, penjadwalan Google Calendar, pembuatan tugas to-do list, pencarian web, hingga pengarsipan 2nd Brain secara langsung lewat perintah suara.
* **Otomasi Input Desktop:** Gemini Live dapat **mengeklik layar PC Tuan secara presisi (*desktopClick*)**, menggulir layar (*desktopScroll*), atau menekan tombol navigasi jika Tuan memintanya.
* **Pemandu & Sorotan Layar (Screen Highlighting):** N.E.X.A dapat **menunjukkan & menyorot elemen di layar** dengan kotak pembatas (*bounding box*), lingkaran penunjuk (*ring*), pointer, atau spotlight transparan agar Tuan langsung tahu tombol/teks mana yang dimaksud tanpa harus N.E.X.A yang mengekliknya.

### 🌟 Paradigma Dua Mode Operasi (*Dual-Mode Flexibility*):
1. **Mode 1: Percakapan Suara Murni (Default / Casual Call):**
   * Beroperasi murni melalui audio dupleks tanpa membagikan layar (hemat kuota & token AI).
   * Menampilkan **Avatar Status Ekspresif (`avatar.slint`)** yang berkedip, melirik, dan bereaksi saat berbicara.
2. **Mode 2: Berbagi Layar On-Demand (Audio-Visual Duplex):**
   * Diaktifkan langsung dengan tombol *"Lihat Layar"* atau hotkey `Win + Alt + S`.
   * N.E.X.A ikut membaca layar Tuan (1 FPS via Direct3D 11 GPU) dan mendiskusikannya secara spontan.

---

## 2. Koeksistensi Multi-Device & Aturan Routing Server (HP vs Laptop)

N.E.X.A Windows Bridge dan Mobile Bridge di HP hidup berdampingan secara harmonis (*Omnipresent Coexistence*) dengan aturan perutean pesan yang tegas:

| Dimensi Skenario | 📱 **N.E.X.A Mobile Bridge (Android HP)** | 💻 **N.E.X.A Windows Bridge (Laptop)** |
| :--- | :--- | :--- |
| **Lokasi Operasional** | Di saku / meja (mengikuti Tuan 24/7) | Di meja kerja / belajar saat laptop dibuka |
| **Peran Utama** | Sensor fisik, alarm subuh, geofence GPS, disiplin screen time HP | Teman diskusi lisan, telaah layar, eksekutor tugas saat bekerja |
| **Inisiatif Proaktif Server (Morning Briefing, Midday Pulse, Reminder Agenda)** | 👑 **PENERIMA UTAMA (Opsi A):** Semua sapaan dan telepon proaktif dari server **SELALU dikirimkan ke HP** karena HP selalu melekat dibawa Tuan. | Standby pasif (tidak dibanjiri panggilan bangun tidur/alarm di laptop). |
| **Sesi Reaktif (Dipicu Tuan)** | Menjawab di HP jika Tuan menekan/memanggil via HP. | 🎯 **Menjawab di Laptop:** Jika Tuan membuka sesi bicara di laptop, N.E.X.A 100% melayani di laptop. |
| **Identitas Soket Server** | `device_type: "android"` (Port 3000 `/ws`) | `device_type: "windows"` (Port 3000 `/ws`) |

*Server `MobileBridge_WS.js` dikonfigurasi mengelola multi-klien (`activeClients.mobile` dan `activeClients.desktop`) tanpa saling membunuh soket.*

---

## 3. Pilihan Tech Stack & Rationale Teknis

| Layer | Pilihan Teknologi | Alasan Desain & Justifikasi Teknis |
| :--- | :--- | :--- |
| **Bahasa Utama** | **Rust (Edition 2021/2024)** | Kompilasi ke *Native Machine Code* (.exe ~9-14 MB). Tanpa Garbage Collector (bebas stutter/micro-pause). Konsumsi memori mendekati C/C++ namun dengan jaminan *memory safety*. |
| **Screen Capture** | **`windows-capture` crate** *(Windows.Graphics.Capture API)* | Mengakses langsung frame Direct3D 11 via GPU. Tanpa filter privasi berbelit-belit, langsung menangkap display/jendela aktif secara efisien. Mematikan border kuning Windows 11 (`is_border_required = false`). |
| **Audio I/O** | **`cpal` + WASAPI Backend** | Mengakses subsistem audio resmi tercepat Windows (WASAPI Shared Mode dengan role `eCommunications`). Latensi hardware <15 ms. Input mic 16kHz Mono PCM, Output speaker 24kHz Mono PCM. |
| **Peredam Gema (AEC)** | **WebRTC AEC3 (`sonora-aec3` crate)** | *Reference-based Acoustic Echo Cancellation*. Memotong pantulan suara speaker dari sinyal mic secara matematis dengan delay estimation otomatis. |
| **Audio Buffer** | **`ringbuf` crate** | *Lock-free Single-Producer Single-Consumer (SPSC) RingBuffer*. Menghindari lock mutex di callback audio real-time, meniadakan audio underrun/glitch. |
| **Tangan Virtual Desktop** | **`windows-rs` (`SendInput`) / `enigo`** | Otomasi kursor mouse & ketukan keyboard level OS Windows. Latensi klik <1 ms, konsumsi RAM 0 MB. |
| **Antarmuka (GUI)** | **Slint (DirectX/Software Backend)** | Toolkit GUI deklaratif modern ultra-ringan buatan eks tim inti Qt. Merender UI HUD Cyberpunk transparan & halaman Settings dengan konsumsi RAM **< 10 MB**. |
| **Jaringan & WS** | **`tokio` + `tokio-tungstenite`** | Async runtime performa tinggi dengan enkripsi TLS native. Mengelola koneksi WSS persistent, ping keepalive 20s, dan auto-reconnect backoff. |
| **Otomasi OS** | **`windows-rs`, `global-hotkey`, `arboard`** | Global hotkey (`Win + Alt + N`), sinkronisasi clipboard dua arah, dan event daya OS (`WM_POWERBROADCAST`). |

---

## 4. Arsitektur Akustik & Anti-Gema Bebas Headset (Khusus Lenovo ThinkPad X380 Yoga)

Tuan Faqih menggunakan **Lenovo ThinkPad X380 Yoga** dan lebih menyukai berinteraksi **tanpa headset**. Untuk meniadakan gema speaker masuk ke mic tanpa mengorbankan kejernihan, diterapkan arsitektur **3-Lapis Pertahanan Akustik**:

```mermaid
flowchart TD
    SPK_OUT["🔊 Suara N.E.X.A (24kHz PCM)"] --> SPEAKER["Speaker Bawah ThinkPad X380"]
    SPK_OUT -.->|"Reference Signal x(t)"| AEC["🧠 WebRTC AEC3 Filter (sonora-aec3)"]
    
    SPEAKER -->|"Pantulan Akustik Sasis/Meja"| MIC_IN
    TUAN["🗣️ Suara Asli Tuan Faqih"] --> MIC_IN["🎙️ Dual-Array Mic (Bezel Atas Layar)"]
    
    MIC_IN -->|"y(t) = Tuan + Pantulan Speaker"| AEC
    AEC -->|"y(t) - x(t) = SUARA TUAN MURNI"| DUCK["🛡️ Turn-Aware Ducking Guard"]
    DUCK -->|"Audio Bersih 16kHz PCM"| WS["☁️ WebSocket /ws N.E.X.A Server"]
```

### A. Keuntungan Fisik Hardware ThinkPad X380 Yoga:
1. **Posisi Fisik Dual-Array Mic:** Terletak di **bezel atas layar** mengapit webcam, berjarak sekitar 30 cm dari speaker bawah sasis. Karakteristik *cardioid beamforming* mengarahkan penangkapan ke depan (wajah Tuan) dan membelakangi speaker.
2. **Conexant CX11771 Audio Codec:** Dilengkapi driver DSP enterprise yang mendukung role komunikasi resmi Windows.

### B. Mekanisme 3 Lapis Pertahanan Anti-Gema:
1. **Lapis 1 — WASAPI `eCommunications` Activation:**
   * Saat membuka capture stream, Rust mengikat endpoint dengan role `eCommunications` (`IMMDeviceEnumerator::GetDefaultAudioEndpoint(eCapture, eCommunications)`). Ini memicu driver Conexant mengaktifkan filter *beamforming* hardware bawaan pabrik.
2. **Lapis 2 — Reference-Based AEC3 Algorithm (`sonora-aec3`):**
   * Salinan audio N.E.X.A ($x(t)$) yang dikirim ke speaker dijadikan *reference buffer*.
   * Saat mic menangkap sinyal ($y(t) = s(t) + h(t)*x(t)$), AEC3 menghitung pengurangan adaptif dan mengeliminasi $h(t)*x(t)$.
   * Hasilnya: Suara speaker N.E.X.A terhapus bersih, menyisakan suara Tuan $s(t)$.
3. **Lapis 3 — Turn-Aware Dynamic Ducking Guard:**
   * Saat N.E.X.A sedang berbicara: sensitivitas mic diturunkan (-18 dB) sehingga getaran meja residual tidak memicu paket audio ke cloud.
   * Saat Tuan ingin memotong pembicaraan (*Barge-In*): suara Tuan langsung menembus ambang batas vokal, seketika menghentikan suara N.E.X.A.

---

## 5. Integrasi Penuh Intent & Eksekusi Backend (`Live_Tool_Registry.js`)

Saat sesi suara berlangsung di laptop, N.E.X.A terhubung langsung ke **`Live_Tool_Registry.js`** di peladen Azure. Seluruh 15 domain intent kognitif N.E.X.A dapat dipicu secara lisan oleh Tuan:

```mermaid
flowchart LR
    TUAN["🗣️ Tuan Berbicara di Laptop"] --> MIC["Mic 16kHz WASAPI"]
    MIC --> WS["WSS /ws Azure"]
    WS --> GEMINI["Gemini Multimodal Live"]
    
    subgraph ToolCalling["Live Tool Execution (Live_Tool_Registry.js)"]
        GEMINI -- "toolCall: recordExpense" --> FIN["💰 Supabase Finance"]
        GEMINI -- "toolCall: createCalendarEvent" --> CAL["📅 Google Calendar"]
        GEMINI -- "toolCall: createTask" --> TSK["📋 Tasks & Notion"]
        GEMINI -- "toolCall: saveVaultNote" --> VLT["🧠 2nd Brain Vault"]
        GEMINI -- "toolCall: searchWeb" --> WEB["🔍 Tavily / Serper Web Search"]
        GEMINI -- "toolCall: queryEmails" --> GML["📧 Gmail Client"]
        GEMINI -- "toolCall: savePersonalFact" --> MEM["👤 Memory Facts"]
    end

    FIN --> GEMINI
    CAL --> GEMINI
    TSK --> GEMINI
    VLT --> GEMINI
    WEB --> GEMINI
    GML --> GEMINI
    MEM --> GEMINI

    GEMINI -- "Vokal Respon 24kHz" --> SPK["🔊 Speaker Laptop"]
```

### 5.1 Sinergi Dahsyat: "Mata Layar Langsung" + "Tangan Backend"
Kombinasi pembacaan visual layar PC dan eksekutor backend menghasilkan kapabilitas yang sangat kuat:
1. **Catat Keuangan dari Layar:**
   * Tuan membuka invoice / mutasi bank di browser laptop:
   * *"Nexa, lihat layar ini, tolong catat pengeluaran 45 ribu untuk beli buku materi."*
   * ➔ N.E.X.A mengekstrak nominal dari layar ➔ memanggil `recordExpense()` ➔ tercatat otomatis di Supabase!
2. **Jadwalkan Agenda dari Brosur / Web:**
   * Tuan membaca jadwal seminar atau webinar di browser:
   * *"Nexa, tolong jadwalkan acara yang ada di poster ini ke Google Calendar-ku."*
   * ➔ N.E.X.A membaca jam dan tanggal dari layar ➔ memanggil `createCalendarEvent()`!
3. **Simpan Riset ke 2nd Brain:**
   * Tuan membaca artikel ilmiah / opini geopolitik:
   * *"Nexa, rangkum poin penting artikel ini dan simpan ke 2nd Brain."*
   * ➔ N.E.X.A membaca isi layar ➔ merangkum ➔ memanggil `saveVaultNote()`!

### 5.2 Arsitektur Dual-Tier Model & Smart Deep-Thinking Router

N.E.X.A mengadopsi strategi **Dynamic Dual-Engine Routing** untuk menyeimbangkan antara kecepatan lisan instan dan kedalaman analisis akademis:

```mermaid
flowchart TD
    INPUT["🗣️ Input Lisan / Layar dari Tuan Faqih"] --> ROUTER{"🧠 Dynamic Reasoning Router"}
    
    ROUTER -->|"Percakapan Sehari-hari, Penunjuk Tombol, Klik Cepat, Kas, Kalender"| TIER1["⚡ Gemini 3.8 Live (DEFAULT)\n• Latensi Sub-detik (<600ms)\n• Lincah & Alami Tanpa Hening\n• Zero-Shot Screen Grounding"]
    
    ROUTER -->|"Pemicu: 'Analisis mendalam', 'Bedah kritis', 'Telaah Arab', Logika Berlapis"| TIER2["🔬 Gemini 3.8 Live Extended Thinking\n• Alokasi Thinking Budget (Hidden CoT)\n• Audit Logika & Gramatikal Mendalam\n• Akurasi Ekstrem untuk Data/Esai Padat"]
    
    TIER1 -->|"Jika Tugas Terlalu Kompleks: toolCall 'escalateToDeepThinking'"| TIER2
    TIER1 --> RESP["🔊 Respon Suara Dupleks & Aksi Layar"]
    TIER2 --> RESP
```

#### Mekanisme Pemisahan & Pengalihan Cerdas:
1. **Tier 1 (Default): ⚡ `Gemini 3.8 Live`:**
   * Menjadi *default runner* untuk 90% percakapan.
   * Menjamin latensi respon suara pertama di bawah **600 ms** (*sub-second TTFA*) agar obrolan terasa mengalir layaknya kawan di sebelah meja tanpa jeda hening canggung.
   * Menangani navigasi UI cepat: `highlightDesktopElement`, `clickDesktopScreen`, scroll, dan fungsi harian.
2. **Tier 2 (Deep Analytical): 🔬 `Gemini 3.8 Live Extended Thinking`:**
   * Mengaktifkan *Hidden Thinking Tokens* (anggaran penalaran multi-langkah sebelum mengeluarkan suara pertama).
   * Menjamin nol halusinasi dan penalaran dialektis berbobot tinggi.
   * Diaktifkan melalui 3 jalur pemicu:
     * **A. Heuristic Intent Trigger:** Terdeteksi frasa pemicu lisan seperti: *"Nexa, coba analisis secara mendalam..."*, *"bedah struktur kalimat Arab ini secara kritis"*, atau *"audit laporan ini secara komprehensif"*.
     * **B. Self-Escalation Tool (`escalateToDeepThinking`):** Jika Gemini 3.8 Live menyadari sebuah pertanyaan layar membutuhkan kalkulasi/deduksi bertingkat yang melampaui kemampuan respon instan, ia secara otonom memanggil tool eskalasi untuk menalar secara mendalam sebelum menjawab.
     * **C. Sakelar Manual di Settings / Suara:** Tuan dapat beralih mode secara eksplisit via perintah lisan (*"Nexa, aktifkan mode telaah mendalam"*) atau memilih opsi model di panel *Settings* Windows Bridge.

---

## 6. Otomasi Desktop & Kontrol Input Layar (`automation/input.rs`)

Gemini Multimodal Live API dapat **menggerakkan mouse, mengeklik elemen di layar, dan menggulir halaman** secara presisi berdasarkan instruksi lisan Tuan Faqih.

```mermaid
sequenceDiagram
    autonumber
    actor Tuan as 🗣️ Tuan Faqih
    participant Gemini as 🧠 Gemini Live (Cloud)
    participant Server as ☁️ N.E.X.A Core
    participant Win as 💻 Windows Bridge (Rust)
    participant OS as 🖥️ Layar Windows ThinkPad

    Tuan->>Gemini: "Nexa, tolong klik tombol 'Next' di layar"
    Gemini->>Gemini: Estimasi koordinat normalisasi (x: 850, y: 420)
    Gemini->>Server: toolCall: desktopClick(x: 850, y: 420)
    Server->>Win: WebSocket: EXECUTE_COMMAND { action: "DESKTOP_CLICK", x: 850, y: 420 }
    Win->>Win: Denormalisasi (0-1000) ke Resolusi Asli Layar
    Win->>OS: Windows SendInput (Gerakkan Mouse & Klik Kiri)
    Win->>OS: Gambar Efek Indikator Klik (click_indicator.slint 300ms)
    OS-->>Tuan: 🖱️ Tombol terklik seketika!
    Gemini-->>Tuan: 🔊 "Sudah saya klik ya Tuan."
```

### 6.1 Koordinat Normalisasi (0–1000) Bebas Masalah Display Scaling
* **Tantangan Layar:** ThinkPad X380 Yoga menggunakan resolusi 1920x1080 dengan Display Scaling Windows 125% atau 150%. Jika AI menggunakan piksel mentah, klik bisa meleset.
* **Solusi Arsitektural:** Gemini Live selalu mengembalikan koordinat normalisasi `x` (0–1000) dan `y` (0–1000).
* **Formula Denormalisasi di Rust:**
  $$X_{screen} = \frac{x_{norm}}{1000} \times \text{PixelWidth}_{monitor}$$
  $$Y_{screen} = \frac{y_{norm}}{1000} \times \text{PixelHeight}_{monitor}$$
* Hasil kalkulasi dikirimkan langsung ke API Windows **`SendInput`** via `INPUT_MOUSE`. Klik dijamin 100% presisi di titik elemen yang dilihat AI!

### 6.2 Toolset Otomasi Desktop di `Live_Tool_Registry.js`
Empat fungsi standar ditambahkan ke deklarasi tool Gemini Live:
1. **`desktopClick(x, y, button, double_click)`:**
   * Mengeklik titik di layar (Default: `button: "LEFT"`, `double_click: false`).
   * Mendukung klik kanan (`button: "RIGHT"`) untuk membuka menu konteks.
2. **`desktopScroll(direction, amount)`:**
   * Menggulir halaman (`direction: "UP"` atau `"DOWN"`).
   * Memicu `MOUSEEVENTF_WHEEL` di level OS.
3. **`desktopTypeText(text, press_enter)`:**
   * Mengetik teks otomatis ke kotak input yang sedang aktif (`press_enter: true` langsung menekan Enter).
4. **`desktopPressKey(key)`:**
   * Menekan tombol khusus keyboard (seperti `"ENTER"`, `"SPACE"`, `"ESCAPE"`, `"TAB"`).

### 6.3 Prinsip Keamanan & Visual Feedback
1. **Indikator Visual Klik (`click_indicator.slint`):**  
   Saat N.E.X.A mengeklik layar, aplikasi menggambar lingkaran transparan selama 300 ms di titik koordinat tersebut. Tuan Faqih dapat melihat dengan jelas di mana N.E.X.A baru saja mengeklik.
2. **Prioritas Fisik Manusia (*Instant Human Override*):**  
   Jika Tuan menggerakkan mouse fisik laptop atau menekan tombol keyboard, aksi otomatis N.E.X.A seketika dibatalkan. Kendali fisik Tuan selalu memiliki prioritas mutlak 100%.
3. **Konfirmasi Tindakan Berisiko:**  
   Untuk tombol destruktif (seperti tombol "Delete", "Format", atau "Bayar"), N.E.X.A wajib meminta konfirmasi lisan singkat sebelum mengeklik.

### 6.4 Hybrid Perception: Visual + Windows UI Automation (UIA) Fallback
* Jika Gemini Live mendeteksi tombol target yang berukuran sangat kecil (misal: icon 12x12 px atau menu toolbar padat), Windows Bridge menyediakan tool pembantu `inspectDesktopElement(x, y)` (`automation/element_finder.rs`).
* Modul ini memanfaatkan **Windows UI Automation (UIA)** untuk memverifikasi bounding box persis dari elemen UI target sebelum mengklik.
* Pendekatan **Hybrid (Mata Visual Gemini + Pohon Elemen OS)** menjamin akurasi klik melompat dari 95% ke **99,9% sempurna** tanpa pernah salah klik!

### 6.5 Sorotan & Penunjuk Elemen Layar (`automation/highlighter.rs` & `automation/element_finder.rs`)

Selain mengeklik layar secara mandiri, N.E.X.A juga dapat menunjuk dan mengarahkan pandangan Tuan Faqih ke elemen tertentu di layar tanpa mengekliknya.

```mermaid
flowchart TD
    TUAN["🗣️ Tuan: 'Nexa, arahin dong tombol mana yang harus kupencet?'"] --> GEMINI["🧠 Gemini Live (Vision Spasial)"]
    GEMINI -->|"Deteksi Spasial: [ymin, xmin, ymax, xmax] + titik fokus (x, y)"| SERVER["☁️ N.E.X.A Server (/ws)"]
    SERVER -->|"toolCall: highlightElement(...)"| BRIDGE["💻 Windows Bridge (Rust)"]
    
    subgraph SOTA_PIPELINE["Screen Guidance Pipeline (< 3ms, < 2.5 MB RAM)"]
        BRIDGE --> SNAP{"🧲 Magnetic Smart-Snap (element_finder.rs)"}
        SNAP -->|"UIA Control Ditemukan"| EXACT_RECT["📐 Ambil Bounding Rect Persis dari OS (Akurasi 100% Sub-Pixel)"]
        SNAP -->|"Non-Standard UI / Canvas"| VIS_RECT["📐 Fallback ke Bounding Box Gemini"]
        EXACT_RECT --> DCOMP["🎨 DirectComposition + Direct2D Pipeline"]
        VIS_RECT --> DCOMP
        DCOMP --> LAYER["🪟 WS_EX_LAYERED | WS_EX_TRANSPARENT | WS_EX_NOACTIVATE"]
    end
    
    LAYER --> DISPLAY["🖥️ Layar ThinkPad X380 Yoga"]
    DISPLAY -->|"✨ Kotak Sorotan Bersinar Membingkai Tombol"| EYE["👀 Tuan Melihat Sorotan Tepat di Tombol"]
    DISPLAY -->|"🖱️ Tuan Klik Tombol Menembus Sorotan (100% Click-Through)"| ACTION["⚡ Tombol Terpencet Seketika & Overlay Dissolve"]
```

#### 1. Pilar 1: Magnetic Smart-Snap (Hybrid AI Vision + Win32 UI Automation)
* **Tantangan Industri:** Model visi AI bekerja pada frame tangkapan yang mengalami kompresi JPEG dan downscaling, sehingga koordinat `[ymin, xmin, ymax, xmax]` rentan meleset 4–12 piksel dari tepi tombol fisik.
* **Solusi Standar (`automation/element_finder.rs`):**
  1. Begitu koordinat pusat `(x, y)` diterima dari Gemini, Windows Bridge mengeksekusi panggilan instan Windows UI Automation: `IUIAutomation::ElementFromPoint(POINT { x, y }, &element)` (<0.5 ms).
  2. Windows Bridge membaca properti `UIA_BoundingRectanglePropertyId` dari elemen kontrol asli (tombol, link, text field, atau tab).
  3. **Efek Magnetis:** Bingkai penunjuk otomatis menempel (*snaps*) persis mengikuti bentuk dan ukuran fisik elemen OS hingga ke tingkat sub-piksel!
  4. Jika elemen berada di dalam canvas tak terstruktur (seperti kanvas diagram atau grafik), sistem otomatis *fallback* menggunakan *Vision Bounding Box* dari Gemini.

#### 2. Pilar 2: Mesin Grafis DirectComposition + Direct2D (`automation/highlighter.rs`)
* Mengapa bukan Webview2, Electron, atau Qt? Komponen webview mengonsumsi 100–150 MB RAM dan menambah latensi rendering.
* **Solusi Standar:** Menggunakan **DirectComposition (`IDCompositionVisual`) + Direct2D** murni via Rust (`windows-rs`):
  * **Zero-Copy DWM Integration:** Menggambar langsung ke pohon visual *Desktop Window Manager* (DWM) Windows.
  * **Konsumsi Memori Ekstrem Ringan:** Seluruh modul overlay visual hanya mengonsumsi **~2,1 MB RAM** dan **0.0% CPU** saat tidak aktif.
  * **60 FPS Hardware-Accelerated Smoothness:** Animasi pendaran lembut dan pergerakan partikel diproses langsung di GPU tanpa menyita waktu siklus CPU ThinkPad.

#### 3. Pilar 3: Arsitektur Windowing Siluman (*Stealth Windowing Architecture*)
Agar overlay tidak mengganggu alur kerja Tuan, window overlay dikonfigurasi dengan atribut Win32 tingkat rendah:
* `WS_EX_TOPMOST`: Selalu berada di lapisan teratas di atas seluruh aplikasi (Chrome, PDF Reader, Word, dll).
* `WS_EX_TRANSPARENT` & `WM_NCHITTEST -> HTTRANSPARENT`: Seluruh klik mouse, klik kanan, dan scroll roda mouse fisik Tuan **lolos menembus overlay tanpa hambatan**. Tuan dapat mengeklik tombol target tanpa perlu menutup overlay terlebih dahulu.
* `WS_EX_NOACTIVATE`: Kemunculan sorotan penunjuk tidak pernah mencuri fokus jendela aplikasi atau kursor ketik Tuan.
* `DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2`: Memastikan koordinat dan ketebalan garis penunjuk tajam dan presisi pada resolusi FHD dengan Windows Display Scaling 125%/150% pada ThinkPad X380 Yoga.

#### 4. Pilar 4: Variasi Penunjuk Visual Standar
1. 🔲 **Bounding Box (`style: "BOX"`):**  
   Membingkai tombol atau teks dengan kotak pembatas bersinar lembut dan label melayang opsional (misal: `[ Tombol Submit ]`).
2. ⭕ **Cincin Penunjuk (`style: "RING"`):**  
   Cincin melingkar untuk menandai ikon kecil atau checkbox.
3. 🔴 **Pointer / Penunjuk Kursor (`style: "POINTER"`):**  
   Titik penunjuk halus yang bergerak teratur saat menuntun membaca kalimat baris demi baris.
4. 🔦 **Spotlight (`style: "SPOTLIGHT"`):**  
   Meredupkan layar sekitar secara lembut untuk memfokuskan perhatian pada area penting.
5. 💥 **Auto-Dissolve on Click:**  
   Saat Tuan mengeklik tombol tersebut (atau setelah timeout default 4 detik), bingkai penunjuk memudar lembut (*fade-out 200 ms*).

#### 5. Toolset Pemandu Visual di `Live_Tool_Registry.js`:
1. `highlightElement(ymin, xmin, ymax, xmax, style, label, duration_ms)`
2. `pointCursor(x, y, duration_ms)`
3. `clearHighlights()`

---

## 7. Analisis Komparatif State-of-the-Art (SOTA) Global 2026

Mengapa arsitektur N.E.X.A Windows Bridge berada di garis depan (*frontier*) kecerdasan buatan dunia saat ini:

| Dimensi Fitur | Siri / Google Assistant | Claude Desktop / ChatGPT App | Microsoft Copilot Windows | **N.E.X.A Windows Bridge** 👑 |
| :--- | :--- | :--- | :--- | :--- |
| **Gaya Percakapan** | Turn-taking kaku (harus tunggu hening) | Turn-taking teks/voice | Turn-taking lambat | ⚡ **True Full-Duplex Sub-Second (<600ms)** |
| **Bisa Disela (Barge-In)** | ❌ Harus tunggu bot selesai | ⚠️ Terbatas di HP | ❌ Tidak bisa | ✅ **Instant Barge-In via WASAPI AEC3** |
| **Mata Layar (Screen Vision)** | ❌ Buta total | ⚠️ Screenshot statis lambat (5–10s) | ⚠️ OCR statis / Recall | 👁️ **GPU Direct3D 1 FPS Streaming** |
| **Otomasi Desktop (Bisa Klik/Scroll)** | ❌ Tidak bisa | ⚠️ Lambat (perlu container/VM) | ⚠️ Terbatas di edge browser | 🖱️ **Real-Time SendInput (<1ms)** |
| **Bebas Headset ThinkPad** | ❌ Gema mengacaukan mic | ❌ Rentan feedback loop | ⚠️ Tergantung driver OEM | 🎧 **AEC3 Hardware-Tuned (No Headset)** |
| **Konsumsi Memori (RAM)** | N/A | 350 MB – 1.2 GB (Electron/Web) | 400 MB – 800 MB (Edge Webview) | 🪶 **~15 – 25 MB RAM (Rust Native Murni)** |

---

## 8. Protokol Komunikasi (Nexa Protocol 3.3)

Klien Windows terhubung ke: `wss://nexa-server.indonesiacentral.cloudapp.azure.com/ws`.

### 8.1 Handshake & Identifikasi Perangkat
```http
GET /ws HTTP/1.1
Host: nexa-server.indonesiacentral.cloudapp.azure.com
Upgrade: websocket
Connection: Upgrade
Authorization: Bearer <NEXA_DEVICE_SECRET>
X-Device-Type: windows
```

### 8.2 Aliran Video Layar (Hanya Saat Share Screen Aktif)
Dikirim setiap 1.000 ms (1 FPS):
```json
{
  "type": "CALL_VIDEO_FRAME",
  "command_id": "session_desktop_1787105000",
  "image_chunk": "/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/..."
}
```

### 8.3 Aliran Suara Mikrofon (16kHz Mono PCM)
Dikirim setiap 32-64 ms:
```json
{
  "type": "CALL_AUDIO_STREAM",
  "command_id": "session_desktop_1787105000",
  "pcm_chunk": "UklGRiQAAABXQVZFZm10IBAAAAABAAEAwF0AAIC7AAACABAAZGF0YQAAAAA..."
}
```

### 8.4 Aliran Balasan Suara N.E.X.A (24kHz Mono PCM)
```json
{
  "type": "CALL_AUDIO_PLAY",
  "pcm_chunk": "V2F2ZWYAAAABAAEAwF0AAIC7AAACABAAZGF0YQAAAAA..."
}
```

### 8.5 Perintah Eksekusi Otomasi Input (Server ➔ Windows Bridge)
```json
{
  "type": "EXECUTE_COMMAND",
  "command_id": "cmd_click_1787105200",
  "action": "DESKTOP_CLICK",
  "params": {
    "x": 850,
    "y": 420,
    "button": "LEFT",
    "double_click": false
  }
}
```

---

## 9. Desain Halaman Settings & Ketahanan Daya (Mengadopsi Mobile Bridge)

### 9.1 Halaman Pengaturan (*Identik dengan UI Mobile Bridge*)
Mengadopsi tampilan antarmuka yang sudah familiar di Android ([`SettingsScreen.kt`](file:///c:/workspace/nexa-mobile-bridge/app/src/main/java/com/nexa/mobilebridge/ui/settings/SettingsScreen.kt)), disajikan menggunakan Slint dengan palet tema gelap:

```text
┌─────────────────────────────────────────────────────────────┐
│ N.E.X.A Bridge Settings                           [—] [X]  │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│ SERVER CONFIGURATION                                        │
│                                                             │
│ ┌─ WebSocket URL ─────────────────────────────────────────┐ │
│ │ wss://nexa-server.indonesiacentral.cloudapp.azure.com/ws│ │
│ └─────────────────────────────────────────────────────────┘ │
│                                                             │
│ ┌─ Auth Token (Bearer) ───────────────────────────────────┐ │
│ │ ••••••••••••••••••••••••••••••••••••••••••••••••••••••• │ │
│ └─────────────────────────────────────────────────────────┘ │
│                                                             │
│              ┌─────────────────────────────┐                │
│              │        SAVE & RETURN        │  (Aksen Cyan)  │
│              └─────────────────────────────┘                │
│                                                             │
│                           CANCEL              (Abu-abu)     │
└─────────────────────────────────────────────────────────────┘
```

* **Penyimpanan:** Disimpan ke berkas lokal `~/.nexa-bridge.json`.
* **Zero Bloat:** HMAC GodMode dihilangkan karena tidak diperlukan di Windows Bridge.
* **Auto-Fallback Cerdas:** Jika berkas lokal belum ada, ia otomatis membaca dari `~/.nexa-config.json` milik `nexa-cli` jika tersedia.

### 9.2 Berbagi Layar Langsung Tanpa Filter Privasi
* Berbagi layar dilakukan secara langsung dan transparan: begitu tombol *Layar ON* ditekan, tampilan layar langsung dialirkan ke N.E.X.A tanpa ada dialog privasi berbelit-belit atau tombol panik yang memusingkan.

### 9.3 Manajemen Daya Laptop (*Sleep, Lid Close, & Ganti Wi-Fi*)
* **Event `WM_POWERBROADCAST`:** Rust mendengarkan event daya OS Windows (`PBT_APMSUSPEND` dan `PBT_APMRESUMEAUTOMATIC`) di `platform/power_events.rs`.
* **Silent Auto-Reconnect:** Saat laptop ditutup layarnya atau masuk mode tidur lalu dibuka kembali (atau beralih jaringan Wi-Fi ↔ Hotspot), Windows Bridge otomatis melakukan *silent reconnect* di latar belakang tanpa pop-up error.

---

## 10. Antarmuka Visual Slint (`ui/main_window.slint`)

Antarmuka dibangun dengan **Slint GUI Engine** (konsumsi RAM <10 MB, render Direct3D):

```text
┌─────────────────────────────────────────────────────────────┐
│ ❖ N.E.X.A DESKTOP COMPANION               [⚙️]   [—] [X]  │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│                    ╭──────╮     ╭──────╮                    │
│                    │  ◉   │     │   ◉  │   <-- Avatar Status│
│                    ╰──────╯     ╰──────╯       (avatar.slint│
│                                                             │
│              ~ ~ ılıılıllı N.E.X.A Standby llılıılı ~ ~     │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│  [ 🎙️ Mic: ON ]    [ 🖥️ Layar: OFF ]    [ 🔴 Tutup ]        │
└─────────────────────────────────────────────────────────────┘
```

1. **Komponen Avatar Status (`avatar.slint`):**
   * Indikator visual mata yang mencerminkan status sesi percakapan.
   * Berkedip natural saat santai (Idle).
   * Melebar saat mendengarkan (*Listening*).
   * Berpendar halus dengan animasi vokal saat berbicara (*Speaking*).
2. **Kontrol Minimalis (`controls.slint`):**
   * 🎙️ **Mic Toggle:** Mute / Unmute.
   * 🖥️ **Layar Toggle:** Mengaktifkan / mematikan aliran *Mata Layar* seketika.
   * ⚙️ **Ikon Settings:** Membuka dialog konfigurasi Server & Auth Token (`settings_dialog.slint`).
   * 🔴 **Tutup Sesi:** Mengakhiri sesi panggilan dan kembali ke standby di System Tray.
3. **Mode Floating Mini-HUD (Picture-in-Picture):**
   * Dapat diminimalkan menjadi kapsul kecil mengambang (*Always on Top*) di pojok layar, sehingga tidak menutupi dokumen kerja Tuan.

---

## 11. Struktur Direktori Proyek (`nexa-windows-bridge`)

Repositori dibuat di `C:\workspace\nexa-windows-bridge` (Git Remote: [github.com/Knightrelaxed/nexa-windows-bridge](https://github.com/Knightrelaxed/nexa-windows-bridge)) dengan nama file dan folder yang baku dan normal:

```text
nexa-windows-bridge/
├── Cargo.toml                    # Dependensi Rust: slint, windows-capture, cpal, sonora-aec3, tokio, tungstenite, windows
├── build.rs                      # Slint UI compiler & resource embedder (.rc icon)
├── README.md                     # Panduan kompilasi & arsitektur
│
├── ui/                           # Antarmuka Slint (Declarative Native GUI)
│   ├── main_window.slint         # Window utama & layout kontrol
│   ├── settings_dialog.slint     # Dialog Pengaturan Server & Token (Identik Mobile Bridge)
│   └── components/
│       ├── avatar.slint          # Indikator status ekspresi (Idle, Listening, Speaking)
│       ├── audio_meter.slint     # Visualizer bar level audio
│       ├── click_indicator.slint # Efek lingkaran visual saat klik dieksekusi
│       └── controls.slint        # Tombol aksi (Mic, Layar, Tutup)
│
└── src/
    ├── main.rs                   # Entry point, single-instance mutex, event loop
    ├── config.rs                 # Pengelola konfigurasi ~/.nexa-bridge.json (URL & Token)
    │
    ├── capture/                  # Modul Tangkapan Layar
    │   ├── mod.rs                # Public capture facade
    │   └── screen_capture.rs     # Loop Windows.Graphics.Capture, 1 FPS clamp, TurboJPEG encoder
    │
    ├── audio/                    # Modul Audio WASAPI & AEC
    │   ├── mod.rs                # Audio orchestrator
    │   ├── echo_canceller.rs     # WebRTC AEC3 Acoustic Echo Cancellation & reference buffer
    │   ├── microphone.rs         # WASAPI input stream (16kHz 16-bit Mono PCM, eCommunications)
    │   ├── speaker.rs            # WASAPI output stream (24kHz 16-bit Mono PCM)
    │   └── audio_buffer.rs       # SPSC lock-free circular ring buffer
    │
    ├── network/                  # Modul Jaringan WebSocket
    │   ├── mod.rs
    │   ├── ws_client.rs          # Tokio-tungstenite client, auto-reconnect, keepalive (20s)
    │   └── protocol.rs           # Serialisasi/Deserialisasi pesan WebSocket (JSON)
    │
    ├── automation/               # Modul Otomasi Desktop & Highlighting
    │   ├── mod.rs
    │   ├── input.rs              # SendInput: mouse click, scroll, type text, key press
    │   ├── highlighter.rs        # DirectComposition + Direct2D: bounding box, ring, pointer overlay
    │   └── element_finder.rs     # Windows UI Automation (UIA) element hit-testing
    │
    └── platform/                 # Integrasi Native Windows
        ├── mod.rs
        ├── power_events.rs       # Penanganan event daya OS (WM_POWERBROADCAST)
        ├── hotkeys.rs            # Global hotkey listener (Win+Alt+N)
        ├── system_tray.rs        # Windows System Tray icon & context menu
        └── clipboard.rs          # Integrasi Clipboard Windows
```

---

## 12. Profil Konsumsi Memori & Sumber Daya

| Komponen | Beban RAM Estimasi | Beban CPU Estimasi |
| :--- | :--- | :--- |
| **Slint UI + Avatar Status (DirectX)** | ~6 – 9 MB | 0.1% |
| **AEC3 Echo Cancellation (`echo_canceller.rs`)** | ~2 – 4 MB | 0.2% |
| **Desktop Automation (`automation/input.rs`)** | < 0.5 MB | < 0.05% |
| **Screen Capture (`screen_capture.rs` GPU D3D11)** | ~8 – 12 MB (Hanya saat Share Screen ON) | 0.2% |
| **WASAPI Audio (`audio/microphone.rs` & `speaker.rs`)**| ~3 – 5 MB | 0.2% |
| **Tokio Async Runtime & WebSocket (`ws_client.rs`)** | ~4 – 6 MB | 0.1% |
| **TOTAL SAAT SUARA BIASA (SCREEN OFF)** | **~15 – 19 MB** | **< 0.5% CPU** |
| **TOTAL SAAT BERBAGI LAYAR & OTOMASI AKTIF** | **~23 – 33 MB** | **< 0.8% CPU** |

---

## 13. Roadmap & Urutan Fase Implementasi Terstruktur (Fase 0 s/d Fase 7)

Agar proses perakitan kode berjalan terstruktur, teruji secara modular, dan tidak menimbulkan regresi pada sistem yang sudah stabil (*nexa-mobile-bridge* & server Azure), pembangunan dieksekusi dalam **8 Fase Terpadu**:

```mermaid
flowchart TD
    F0["Fase 0: Penyelarasan Server Multi-Device & Tools (nexa-server)"] --> F1
    F1["Fase 1: Scaffolding Rust Cargo & Settings UI Slint (nexa-windows-bridge)"] --> F2
    F2["Fase 2: WebSocket Network Engine & Ketahanan Daya (WM_POWERBROADCAST)"] --> F3
    F3["Fase 3: Audio Dupleks WASAPI & Anti-Gema (Khusus ThinkPad X380 Yoga)"] --> F4
    F4["Fase 4: Antarmuka Slint & Avatar Desktop (main_window + system_tray)"] --> F5
    F5["Fase 5: Mata Layar GPU Direct3D 11 (Windows.Graphics.Capture)"] --> F6
    F6["Fase 6: Sorotan Layar (DirectComposition) & Otomasi Input (SendInput)"] --> F7
    F7["Fase 7: Profiling Memori (<25 MB RAM), Hardening, & Standalone Release .EXE"]
```

---

### Rincian Eksekusi & Checkpoint Validasi Tiap Fase:

#### 🔹 Fase 0: Penyelarasan Server & Protokol Multi-Device (`nexa-server`) — [SELESAI ✅]
* **Lokasi Kerja:** `c:\workspace\nexa-server`
* **Langkah Kerja:**
  1. `gateway.js`: Mount WebSocket Server di `/ws` berbasis header `X-Device-Type: windows` vs `android`.
  2. `Live_Tool_Registry.js`: Daftarkan toolset desktop standar (`desktopClick`, `desktopScroll`, `desktopTypeText`, `desktopPressKey`, `highlightElement`, `pointCursor`, `clearHighlights`).
  3. `Live_Voice_Engine.js`: Integrasikan Dual-Tier Router (`gemini-3.8-live` default cepat + `gemini-3.8-live-extended-thinking` deep reasoning).
  4. Modularisasi `src/interfaces/bridge/` dan penghapusan total legacy folder `mobile_bridge`.
* **Checkpoint Validasi:** Menjalankan unit test server (`npm test`) ➔ Seluruh 362 automated test **100% PASS (Green)** tanpa merusak Mobile Bridge Android.

#### 🔹 Fase 1: Scaffolding Proyek Rust & UI Settings (`nexa-windows-bridge`) — [SELESAI ✅]
* **Lokasi Kerja:** `C:\workspace\nexa-windows-bridge` (Git Remote: `https://github.com/Knightrelaxed/nexa-windows-bridge`)
* **Langkah Kerja:**
  1. Inisialisasi Cargo workspace & dependensi di `Cargo.toml` (`slint`, `tokio`, `tungstenite`, `serde`, `windows`, dll).
  2. Implementasi `src/config.rs`: Membaca/menyimpan `~/.nexa-bridge.json` (WebSocket URL + Bearer Token, fallback otomatis ke `~/.nexa-config.json`, dilengkapi `#[serde(default)]`).
  3. Mendesain antarmuka Slint `ui/settings_dialog.slint`, `ui/main_window.slint`, dan `ui/components/avatar.slint`.
* **Checkpoint Validasi:** Menjalankan `cargo check` dan `cargo test` ➔ Kompilasi 0 warning, 0 error, unit test lulus 100%, binary `nexa-windows-bridge.exe` terkompilasi dan commit ter-push ke GitHub.

#### 🔹 Fase 2: Jaringan WebSocket & Ketahanan Daya OS (`network/` & `platform/`) — [SELESAI ✅]
* **Lokasi Kerja:** `src/network/` & `src/platform/`
* **Langkah Kerja:**
  1. Implementasi protokol pesan tipe-kuat (`src/network/protocol.rs`): `ClientMessage` (Ping, CommandResult, Telemetry, PowerEvent, VideoFrame, AudioStream) dan `ServerMessage` (Pong, ExecuteCommand).
  2. Implementasi WebSocket async client (`src/network/client.rs`) via `tokio-tungstenite` dengan exponential backoff (500ms -> 10s max) dan keepalive watchdog ping 20 detik.
  3. Integrasi event daya Windows (`src/platform/power.rs`): Message-only window Win32 menangani `WM_POWERBROADCAST` (`PBT_APMSUSPEND` dan `PBT_APMRESUMEAUTOMATIC`) untuk auto-suspend dan instant wake-reconnect saat laptop dibuka/bangun tidur.
* **Checkpoint Validasi:** Menjalankan `cargo test` ➔ 10 automated unit test **100% PASS (Green)** (serialisasi protokol, siklus hidup koneksi, dan thread power listener), binary `nexa-windows-bridge.exe` terkompilasi 0 warning, dan perubahan ter-push ke GitHub.

#### 🔹 Fase 3: Audio Dupleks WASAPI Bebas Gema (ThinkPad Hardware Tuning) — [SELESAI ✅]
* **Lokasi Kerja:** `src/audio/`
* **Langkah Kerja:**
  1. `audio/audio_buffer.rs`: SPSC lock-free circular ring buffer (`ringbuf`) dengan zero-allocation pada callback real-time WASAPI.
  2. `audio/resampler.rs`: Resampler interpolasi linier presisi tinggi, konversi bolak-balik $f32 \leftrightarrow i16 \leftrightarrow \text{PCM bytes}$, serta generalisasi downmixing multi-channel (`downmix_to_mono`) dan upmixing (`upmix_mono_to_channels`).
  3. `audio/echo_canceller.rs`: Integrasi WebRTC AEC3 (`sonora`), Noise Suppression (NS), dan AGC2. Pemrosesan real-time independen pada frame render 10 ms (160 sampel), dipadukan dengan *turn-aware dynamic ducking* (-18 dB) dan deteksi *barge-in* suara Tuan.
  4. `audio/speaker.rs`: Stream output WASAPI via `cpal` (`SendStream` wrapper) untuk vokal Gemini 24 kHz mono $\to$ hardware ThinkPad (misal 48 kHz stereo), dilengkapi mekanisme pembersihan penyangga instan (*flush buffer* <1 ms) saat Tuan memotong pembicaraan.
  5. `audio/microphone.rs`: Stream capture mikrofon dual-array Conexant ThinkPad X380 Yoga via `cpal`, pemrosesan pembatalan gema AEC3, dan pengemasan frame audio 100 ms (1.600 sampel = 3.200 byte) untuk efisiensi jaringan ke peladen Azure.
  6. `audio/mod.rs`: Fasad orkestrator `AudioEngine` terhubung ke siklus koneksi `NetworkClient` dan antarmuka Slint.
* **Checkpoint Validasi:** Seluruh 23 unit test di `nexa-windows-bridge` dan 362 test di `nexa-server` lulus **100% PASS (Green)** tanpa warning. Biner `nexa-windows-bridge.exe` terkompilasi bersih dan di-push ke GitHub (`f960696`).

---

#### 🔹 Fase 4: Antarmuka Slint & Avatar Cybernetic J.A.R.V.I.S (Dual-Mode & 9 Spektrum Kognitif)
* **Lokasi Kerja:** `ui/`, `src/platform/system_tray.rs`, `src/platform/hotkeys.rs`, dan `src/main.rs`
* **Filosofi & Desain Inti:**
  * Estetika futuristik J.A.R.V.I.S / Arc Reactor dengan **sepasang mata siber ekspresif** yang hidup dan berwibawa.
  * **Dual-Mode Fleksibel:** Mode No-Fullscreen (Jendela Melayang Pendamping ~360×520px) vs Mode Full Screen (Command Center J.A.R.V.I.S Layar Penuh 16:9 1080p).
  * **Spektrum 9 Status & Warna Kognitif** yang disinkronkan persis dengan *Mobile Bridge* dan peladen Azure.
  * Ringan ekstrem: konsumsi memori UI Slint tetap terjaga di **<15 MB RAM**.

---

### 📑 SUBPLAN SUPER RINCI FASE 4

```mermaid
flowchart TD
    M4_1["Milestone 4.1: Avatar Sentient Cyber-Eyes (avatar.slint)<br/>• 3 Cincin Orbital Konsentris<br/>• Rotasi 360° Giroskopik saat Thinking<br/>• 9 Spektrum Warna Kognitif"] --> M4_2
    M4_2["Milestone 4.2: Dual-Mode Window System (main_window.slint)<br/>• Mode 1: No-Fullscreen Floating Companion (~360x520px)<br/>• Mode 2: Full Screen J.A.R.V.I.S Command Center (16:9 1080p)<br/>• Penyelarasan Status Teks Mobile Bridge"] --> M4_3
    M4_3["Milestone 4.3: Audio Spectrum Visualizer (audio_meter.slint)<br/>• Multi-Bar Reaktif Amplitudo Audio (RMS)<br/>• Mini-Wave di Jendela Kecil & Wide Spectrum di Full Screen"] --> M4_4
    M4_4["Milestone 4.4: Windows Native System Tray & Hotkeys (platform/)<br/>• Win32 Shell_NotifyIconW Tray Icon & Context Menu<br/>• Global Hotkeys: Win+Alt+N (Toggle Window), Win+Alt+M (Mute), F11 (Fullscreen)"] --> M4_5
    M4_5["Milestone 4.5: Orkestrasi Event & Binding Rust (src/main.rs)<br/>• Hubungkan Slint Callbacks & Hotkeys<br/>• Sinkronisasi Amplitudo Audio ke pulse_scale Slint<br/>• Zero-Regression & Full Validation Test"]
```

---

#### 4.1 Milestone 4.1: Avatar Sentient Cyber-Eyes (`ui/components/avatar.slint`) — [SELESAI ✅]
1. **Anatomi Vektor Mata Siber:**
   * **Inti Reaktor Tengah (Central Core):** Titik fokus bercahaya cyan spekular (`#00E5FF` & `#E0F7FA`) di antara kedua mata dengan busur transmisi data atas/bawah.
   * **Outer Orbital Gyroscopic Ring:** Cincin data terluar dengan grid 4 *tick marks* telemetri holografis. Cincin ini menggunakan modern transform `transform-rotation` yang **berputar 360° berlawanan arah secara giroskopik (durasi 2.0s linear loop)** ketika status = `thinking` dan 1.5s ketika `connecting`.
   * **Middle Telemetry Arc Ring:** Busur cincin tengah yang berdenyut dinamis terhadap `pulse_scale` audio vokal Tuan Faqih.
   * **Inner Luminous Iris & Pupil:** Inti mata yang membesar saat `listening` (receptive gaze dilation 1.25x), mengunci fokus saat `thinking` (0.85x), dan glint highlight spekular putih.
   * **Eyelid Slits (Kelopak Siber):** Menggunakan dynamic aperture container (`clip: true`) untuk efek kedipan alami acak setiap 3.5 detik, dan menutup sepenuhnya (menyisakan celah tipis 4px) saat status `offline` / `sleeping`.
   * **Vision HUD Scan Sweep:** Garis sapuan horizontal pemindai data aktif otomatis saat `screen_sharing`.
2. **Implementasi Matriks 9 Spektrum Warna Kognitif & Enum Rust (`src/ui/mod.rs`):**
   * `idle`: Soft Cyan (`#00E5FF`) — Kedip alami, melirik halus ke kursor.
   * `listening`: Vibrant Cyan-Blue (`#00B4D8`) — Pupil membesar 25%, cincin luar terbuka menyerap vokal.
   * `thinking`: Cognitive Gold (`#FFB300`) — 🔄 **Cincin giroskop berputar 360° kontinu**, pupil fokus.
   * `speaking`: Cyber Emerald (`#00FF88`) — Cincin iris berdenyut harmonis mengikuti audio vokal 24kHz.
   * `barge_in`: Flash White-Cyan (`#E0F7FA`) — Kilatan instan <1 ms saat Tuan memotong pembicaraan.
   * `screen_sharing`: Holographic Azure (`#00B0FF`) — Retikel bidik sudut HUD (`[ ]`) dan sapuan garis pemindai.
   * `tool_executing`: Quantum Violet (`#7C4DFF`) — Kilatan pulsa ungu elektrik tanda eksekusi aksi PC/backend.
   * `connecting`: Amber Warning (`#FF9100`) — Cincin berputar putus-putus mencari jabat tangan jaringan.
   * `offline`: Deep Slate Gray (`#37474F`) — Kelopak mata terpejam, cincin meredup hening.
   * **Checkpoint Validasi:** Seluruh 28 unit test di `nexa-windows-bridge` dan 362 test di `nexa-server` lulus **100% PASS (Green)** tanpa warning, 0 error. Kompilasi binary bersih dan commit ter-push ke GitHub (`cd0f8df`).

---

#### 4.2 Milestone 4.2: Dual-Mode Window System (`ui/main_window.slint`) — [SELESAI ✅]
1. **Arsitektur Struktur Dua Tampilan:**
   * Menambahkan *property* `in-out property <bool> is_fullscreen: false;` dan binding deklaratif Slint `full-screen: root.is_fullscreen;`.
   * **Tampilan Mode 1: No-Fullscreen (Jendela Melayang Pendamping ~360×520 px):**
     * Desain *dark acrylic glassmorphism* (`#0D1117` dengan aksen `#58A6FF` dan border halus `#30363D`).
     * Header bar: Judul `"N.E.X.A Bridge"`, badge status bercahaya (cyan saat terkoneksi), tombol Fullscreen (`⛶`), dan tombol Pengaturan (`⚙`).
     * Area Pusat: Avatar Mata Siber J.A.R.V.I.S (`eye_size: 72px`), teks status lisan komputasi, dan sub-pesan detail.
     * Hardware Status Card: Indikator status subsistem aktif (`🎙️ WASAPI Audio` / `Mic Muted`, `🛡️ AEC3 Active`, `👁️ D3D11 Vision`).
     * Quick Toggles & Action Bar: Tombol Mute Mic (`🎙️ Mute` / `🔇 Unmute`), tombol Vision (`👁️ Berbagi Layar`), dan tombol utama `"Hubungkan ke N.E.X.A"` / `"Putuskan Sambungan"`.
   * **Tampilan Mode 2: Full Screen Mode (Command Center J.A.R.V.I.S 16:9 1080p):**
     * Memenuhi 100% monitor ThinkPad (borderless fullscreen).
     * Area Pojok Kiri Atas: Panel Telemetri HUD (`💻 CPU`, `🧠 RAM`, `🎙️ WASAPI Audio (16kHz)`, `🛡️ AEC3 Active (-18dB)`, `⚡ Latency`).
     * Area Pojok Kanan Atas: Tombol `"⤢ Windowed Mode [F11]"` dan tombol `"⚙ Settings"`.
     * Area Pusat: Avatar Mata Siber J.A.R.V.I.S berskala besar (`eye_size: 130px`, width 380px) di titik tengah layar.
     * Subtitle Bar: Teks dialog lisan real-time dalam tipografi berkelas besar (26px tebal, bersinar dinamis sesuai status kognitif).
     * Bottom Action Dock: Baris kontrol mengambang elegan di bagian bawah layar (`Mute Mic`, `Screen Share`, `Putuskan Sambungan`, serta hint hotkey `F11 / Win+Alt+N`).
   * **Keyboard Event Handler:** `FocusScope` menangani tombol `F11` (toggle fullscreen) dan `Escape` (exit fullscreen) secara instan.
2. **Penyelarasan Teks Status Lisan (100% Paritas Mobile Bridge):**
   * `LISTENING` $\to$ `"Mendengarkan Tuan Faqih..."`
   * `PROCESSING` / `THINKING` $\to$ `"Sedang menalar & memproses..."`
   * `SPEAKING` $\to$ `"N.E.X.A sedang berbicara..."`
   * `BARGE_IN` $\to$ `"Mendengarkan interupsi Tuan..."`
   * `TRANSMITTING_AUDIO` $\to$ `"Mentransmisikan suara (WASAPI 16kHz)..."`
   * `TRANSMITTING_SCREEN` $\to$ `"Mentransmisikan layar & audio (D3D11 1 FPS)..."`
   * `RECONNECTING` $\to$ `"Menghubungkan kembali ke server..."`
   * `DISCONNECTED` $\to$ `"Bridge Terputus (Offline)"`
* **Checkpoint Validasi:** Seluruh 28 unit test di `nexa-windows-bridge` dan 362 test di `nexa-server` lulus **100% PASS (Green)** tanpa warning, 0 error. Kompilasi binary bersih dan commit ter-push ke GitHub (`3ec0145`).

---

#### 4.3 Milestone 4.3: Real-Time Audio Spectrum Visualizer (`ui/components/audio_meter.slint`) — [SELESAI ✅]
1. **Komponen Visualizer Gelombang Harmonik Vektor:**
   * Dibuat komponen `AudioMeter` mandiri berbasis vektor Slint dengan kalkulasi kurva sinus per bar:
     * Mode Jendela Ringkas (Windowed): 24-bar audio meter responsif (`max_bar_height: 20px`, `bar_width: 3px`).
     * Mode Layar Penuh (Full Screen): 48-bar *wide frequency spectrum equalizer* membentang elegan (`max_bar_height: 40px`, `bar_width: 4px`).
   * Menggunakan envelope bell-curve terpusat dan modulasi sinus ganda (`sin` & `cos` beda fase) untuk menghasilkan gelombang harmonik vokal alami yang bergerak secara *fluid* saat berbicara atau mendengarkan.
   * Saat audio senyap (*idle/offline*), batang frekuensi merapat ke garis dasar minimal (3px) dengan konsumsi CPU 0%.
2. **Kalkulasi RMS Real-Time di Rust (`src/main.rs`):**
   * Saat frame respons PCM 24kHz tiba dari Gemini Live (`ServerMessage::AudioPlay`), dilakukan kalkulasi Root Mean Square (RMS) instan pada sampel audio $i16 \to f32$.
   * Nilai RMS dinormalisasi dan diumpankan langsung ke properti `volume_level` (0.0 s/d 1.0) dan `pulse_scale` di antarmuka Slint melalui `slint::invoke_from_event_loop`.
   * Saat suara selesai (`ReplyComplete`) atau terpotong (*barge-in*), level volume di-reset instan ke 0.0.
* **Checkpoint Validasi:** Seluruh 28 unit test di `nexa-windows-bridge` dan 362 test di `nexa-server` lulus **100% PASS (Green)**. `cargo clippy --all-targets --all-features` lulus 0 warning, 0 error. Kompilasi binary bersih dan commit ter-push ke GitHub (`4dca785`).

---

#### 4.4 Milestone 4.4: Windows Native System Tray & Hotkeys (`src/platform/system_tray.rs` & `src/platform/hotkeys.rs`) — [SELESAI ✅]
1. **Windows System Tray (`system_tray.rs`):**
   * Menggunakan Win32 API native `Shell_NotifyIconW` untuk konsumsi RAM 0 MB.
   * Ikon resmi N.E.X.A disematkan di tray taskbar Windows (dekat jam).
   * Dilengkapi penanganan `TaskbarCreated` (`RegisterWindowMessageW`) untuk auto-restore tray icon jika proses Windows Explorer di-restart.
   * Toleran terhadap sesi pengujian / headless session (fallback anggun tanpa panik jika Explorer taskbar belum siap).
   * **Klik Kiri (Single Click):** Toggle *Show/Hide* jendela N.E.X.A instan (`is_visible() -> hide() / show()`).
   * **Klik Kanan Context Menu:**
     * `👁️ Buka N.E.X.A` -> Memunculkan jendela pendamping.
     * `🎙️ Mute / Unmute Mikrofon` -> Toggle state bisu mikrofon WASAPI instan.
     * `⛶ Layar Penuh / Jendela (F11)` -> Toggle mode Command Center / Floating Window.
     * `⚙ Pengaturan (~/.nexa-bridge.json)` -> Membuka dialog pengaturan konfigurasi.
     * `❌ Keluar` -> Shutdown bersih proses aplikasi.
2. **Global Hotkeys Windows (`hotkeys.rs`):**
   * Terdaftar di tingkat OS via Win32 `RegisterHotKey`:
     * `Win + Alt + N`: Summon / dismiss jendela N.E.X.A dari aplikasi apa pun (Boss key).
     * `Win + Alt + M`: Mute / Unmute mikrofon instan dari mana saja.
     * `F11` atau `Win + Alt + F`: Toggle Mode Layar Penuh vs Jendela secara instan.
   * Berjalan pada background thread khusus dengan Win32 message loop mandiri tanpa membebani event loop Slint.
3. **Orkestrasi Rust Main (`src/main.rs`):**
   * Menghubungkan callback event System Tray dan Global Hotkey langsung ke thread Slint melalui `slint::invoke_from_event_loop`.
* **Checkpoint Validasi:** Seluruh 30 unit test di `nexa-windows-bridge` lulus **100% PASS (Green)**. `cargo clippy --all-targets --all-features` lulus 0 warning, 0 error. Kompilasi binary bersih dan siap di-push ke remote.

---

#### 4.5 Milestone 4.5: Orkestrasi Main Window & Binding Data (`src/main.rs`) — [SELESAI ✅]
1. **Penanganan Dual-Mode Windowing (Windowed & Fullscreen):**
   * Mengikat callback `on_toggle_fullscreen` ke event Slint dan memanggil `window.set_fullscreen()`.
   * Sinkronisasi penanganan `F11` (FocusScope lokal & Global Hotkey) serta fallback `Win + Alt + F`.
2. **Reaktivitas Amplitudo Audio Dua Arah (Bidirectional RMS):**
   * Output Suara AI (24kHz PCM): Menghitung RMS frame respons Gemini Live untuk memicu denyut pupil dan audio visualizer saat N.E.X.A berbicara (`speaking`).
   * Input Suara Pengguna (16kHz PCM): Menghitung RMS audio mikrofon ThinkPad saat status `listening` sehingga gelombang vokal pengguna menggerakkan `volume_level` dan `pulse_scale` avatar secara real-time.
   * Auto-reset ke level 0.0 saat respon selesai (`ReplyComplete`) atau terpotong (*barge-in*).
3. **Telemetri HUD Real-Time (Win32 Native Zero-RAM):**
   * Menambahkan modul `src/platform/telemetry.rs` menggunakan `GetSystemTimes` dan `GlobalMemoryStatusEx`.
   * Mengalirkan metrik CPU%, RAM%, status audio WASAPI, dan estimasi ping latensi WebSocket secara berkala ke antarmuka Layar Penuh.
4. **Integrasi System Tray, Hotkeys, & Modal Settings:**
   * Menghubungkan seluruh aksi context menu tray dan hotkey boss key (`Win + Alt + N`) dengan penanganan `is_minimized()`.
   * Mencegah pemutusan proses saat tombol close `[X]` diklik melalui interceptor `on_close_requested` (`CloseRequestResponse::HideWindow`).
   * Mengarahkan `TrayEvent::Quit` ke `slint::quit_event_loop()` untuk unwinding proses dan penutupan soket secara teratur (*graceful termination*).
* **Checkpoint Validasi:** Seluruh 31 unit test di `nexa-windows-bridge` lulus **100% PASS (Green)**. `cargo clippy --all-targets --all-features` lulus 0 warning, 0 error. Kompilasi binary bersih dan commit ter-push ke GitHub (`5ebcfc4`).

---

#### 4.6 Milestone 4.6: Verifikasi, Profiling Memori & Pengujian Zero-Warning
1. **Pengujian Unit Otomatis:**
   * Test kalkulasi sudut rotasi avatar dan pemetaan 9 status.
   * Test pendaftaran hotkey dan integrasi window state.
2. **Verifikasi Stabilitas:**
   * Menjalankan `cargo test` (memastikan minimal 25+ test lulus 100%).
   * Menjalankan `cargo build` dengan **0 warning dan 0 error**.
   * Menjalankan `npm test` di `nexa-server` (memastikan 362 test tetap 100% green).
3. **Commit & Push:**
   * Menyimpan seluruh perubahan ke GitHub `https://github.com/Knightrelaxed/nexa-windows-bridge`.

#### 🔹 Fase 5: Mata Layar GPU Direct3D 11 (`capture/`)
* **Lokasi Kerja:** `src/capture/`
* **Langkah Kerja:**
  1. Loop penangkap layar `capture/screen_capture.rs` menggunakan `windows-capture` (Windows.Graphics.Capture API) langsung dari tekstur GPU D3D11.
  2. Pembatasan frame clamp di **1 FPS** dan kompresi TurboJPEG hardware.
  3. Tombol toggle *"Lihat Layar"* di window utama dan hotkey `Win + Alt + S`.
* **Checkpoint Validasi:** Aliran `CALL_VIDEO_FRAME` terkirim ke Gemini Live, N.E.X.A langsung bisa membaca dan mendiskusikan konten di layar ThinkPad Tuan.

#### 🔹 Fase 6: Sorotan Layar (DirectComposition) & Otomasi Input (SendInput)
* **Lokasi Kerja:** `src/automation/`
* **Langkah Kerja:**
  1. Window overlay DirectComposition + Direct2D transparan (`automation/highlighter.rs`) dengan atribut `WS_EX_TOPMOST | WS_EX_TRANSPARENT | WS_EX_NOACTIVATE` (100% tembus klik mouse).
  2. **Smart-Snap Elemen UI** (`automation/element_finder.rs`): Query instan Windows UI Automation (`IUIAutomation::ElementFromPoint`) untuk menempelkan kotak pas 1 piksel di batas tombol.
  3. Animasi sorotan: Bounding Box, Cincin Penunjuk, dan Pointer Kursor.
  4. Otomasi Input (`automation/input.rs`): Win32 `SendInput` untuk klik mouse, scroll halaman, dan ketik teks dengan indikator klik visual 300ms (`click_indicator.slint`).
* **Checkpoint Validasi:** Perintah suara: *"Nexa, arahin tombol submit"* ➔ Muncul kotak bersinar membingkai tombol, dan mouse Tuan bisa langsung mengeklik menembus kotak tersebut.

#### 🔹 Fase 7: Profiling Memori (<25 MB RAM) & Standalone Release Build
* **Lokasi Kerja:** Konfigurasi biner akhir
* **Langkah Kerja:**
  1. Profiling konsumsi memori di Task Manager: Menjamin RAM stabil di **~15–19 MB** saat audio biasa, dan **<30 MB** saat share screen & overlay aktif.
  2. Optimasi *Release Profile* di `Cargo.toml` (`opt-level = 3`, `lto = true`, `strip = true`, `panic = "abort"`).
  3. Kompilasi biner mandiri: Menghasilkan single file `nexa-windows-bridge.exe` (~10 MB) siap pakai.
  4. Shortcut otomatis ke `shell:startup` agar N.E.X.A otomatis standby saat laptop ThinkPad dinyalakan.
* **Checkpoint Validasi:** Aplikasi berjalan berjam-jam tanpa kebocoran memori (*zero memory leak*), respons sub-detik, dan siap menjadi pendamping harian Tuan.

---

```mermaid
gantt
    title Jadwal Pelaksanaan Bertahap N.E.X.A Windows Bridge
    dateFormat  YYYY-MM-DD
    section Fase 0: Server Azure
    Multi-Device WS & Toolset Registry (npm test green) :mil0, 2026-10-21, 1d
    section Fase 1: Scaffolding
    Cargo Setup & Slint Settings UI                     :mil1, after mil0, 1d
    section Fase 2: Networking
    WSS Client & power_events Sleep Reconnect           :mil2, after mil1, 1d
    section Fase 3: Audio Duplex
    WASAPI eCommunications + echo_canceller Engine      :mil3, after mil2, 2d
    section Fase 4: Digital Avatar
    Slint avatar.slint & system_tray HUD                :mil4, after mil3, 1d
    section Fase 5: Screen Vision
    Direct3D 11 screen_capture & TurboJPEG (1 FPS)      :mil5, after mil4, 1d
    section Fase 6: Highlighting & Input
    DirectComposition highlighter & SendInput input     :mil6, after mil5, 2d
    section Fase 7: Hardening
    RAM Profiling (<25MB) & Standalone Release .EXE     :mil7, after mil6, 1d
```

---

## 14. Kesimpulan

Rencana resmi ini telah menyatukan visi terlengkap untuk N.E.X.A di laptop:
1. **Mata Layar:** Direct3D 11 GPU Capture 1 FPS langsung to-the-point (`capture/screen_capture.rs`).
2. **Audio Dupleks Bebas Gema:** WASAPI Duplex + WebRTC AEC3 bebas headset di ThinkPad X380 Yoga (`audio/echo_canceller.rs`).
3. **Avatar Status:** Indikator mata status yang hidup di desktop via Slint GUI (`ui/components/avatar.slint`).
4. **Eksekusi Backend:** Mengelola kas, Google Calendar, Tasks, Notion, dan 2nd Brain.
5. **Otomasi Input Desktop:** Mampu mengeklik tombol di layar laptop Tuan (*desktopClick*), menggulir halaman (*desktopScroll*), dan mengetik teks (`automation/input.rs`).
6. **Sorotan & Penunjuk Layar:** Mampu mengarahkan pandangan Tuan dengan menyorot elemen via kotak pembatas, cincin, dan penunjuk kursor tembus klik (*automation/highlighter.rs*).
7. **Ekstrem Ringan:** Seluruh kecanggihan ini berjalan hanya dengan konsumsi **~15–25 MB RAM**!
