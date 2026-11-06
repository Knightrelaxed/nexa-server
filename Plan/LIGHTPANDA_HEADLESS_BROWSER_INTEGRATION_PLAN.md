# 🚀 ARCHITECTURE & IMPLEMENTATION PLAN: LIGHTPANDA ULTRA-LIGHT HEADLESS BROWSER FOR N.E.X.A

**Dokumen Perencanaan Teknis & Arsitektur Sistem**  
**Versi:** 1.0.0  
**Tanggal:** 6 November 2026  
**Status:** DRAFT / PROPOSED  
**Target Platform:** N.E.X.A Server v3.4.4+ (Ubuntu 24.04 LTS x86_64 VPS & Node.js CommonJS)

---

## 1. Executive Summary & Latar Belakang

N.E.X.A Server beroperasi pada VPS berbasis cloud dengan sumber daya terbatas (**RAM 892 MB** + **2 GB Swap Space**). Kebutuhan asisten cerdas untuk mengakses konten web modern saat ini menghadapi dua kendala utama:
1. **Keterbatasan Search API (Serper & Tavily):**
   - Serper hanya mengembalikan cuplikan pendek (*snippets* 2–3 kalimat).
   - Tavily AI dibatasi kuota bulanan gratis (1.000 request/bulan).
   - Keduanya tidak dapat melakukan interaksi DOM yang membutuhkan eksekusi JavaScript spesifik, login, navigasi berbasis interaksi, atau pemantauan portal akademik/pribadi.
2. **Kerapuhan Headless Chrome Tradisional (Puppeteer / Playwright Chromium):**
   - Menjalankan Chromium di server kecil memakan memori **250–500 MB per instans**, memuat subsistem grafis (Blink, Skia rasterizer, IPC, audio/video) yang tidak diperlukan oleh AI agent, serta rentan memicu OOM (*Out Of Memory Killer*).

**Lightpanda Browser** (`https://github.com/lightpanda-io/browser`) adalah browser headless modern yang ditulis dari nol menggunakan bahasa **Zig** dengan mesin **Google V8 JavaScript engine**. Tanpa *layout visual rendering engine*, Lightpanda mengonsumsi memori **10x lebih hemat (~15–35 MB per sesi)** dan berjalan **9x lebih cepat**, menjadikannya solusi ideal untuk infrastruktur server N.E.X.A.

---

## 2. Analisis Kompatibilitas Lingkungan Server

| Parameter | Spesifikasi Server VPS N.E.X.A | Kebutuhan Lightpanda | Status Evaluasi |
| :--- | :--- | :--- | :---: |
| **Arsitektur CPU** | `x86_64` (Intel/AMD) | `x86_64` Linux | ✅ 100% Kompatibel |
| **Sistem Operasi** | Ubuntu 24.04.4 LTS | Linux Kernel >= 5.4 | ✅ 100% Kompatibel |
| **RAM Tersedia** | 892 MB RAM + 2 GB Swap | ~15–50 MB RAM per proses | ✅ Sangat Aman |
| **Pustaka GUI (X11/GTK)**| Server Minimal (Headless) | **NOL (Tidak butuh GUI)** | ✅ Tanpa Dependensi Berat |
| **Metode Distribusi** | Standalone Binary (`/usr/local/bin`) | Single Static/Dynamic Binary | ✅ Cepat & Bersih |

---

## 3. Arsitektur Komponen & Alur Data

```mermaid
flowchart TD
    User["Tuan Faqih (Telegram / Voice / Mobile)"] -->|Kirim Link / Perintah Buka Web| Router["Router_Classifier & AI Router"]
    
    subgraph Routing_Decision["Logika Seleksi Intent"]
        Router -->|Intent: WEB_SEARCH (action: READ_URL)| Handler["system_handler.js"]
        Router -->|Live Voice Tool: readWebPage| ToolReg["Live_Tool_Registry.js"]
    end
    
    Handler --> Engine["Lightpanda_Client.js (Infrastructure)"]
    ToolReg --> Engine
    
    subgraph Execution_Engine["Engine Lightpanda di VPS"]
        Engine -->|Mode 1: One-Shot CLI Fast Dump| FetchCLI["lightpanda fetch --dump markdown --wait-ms 1500 <URL>"]
        Engine -->|Mode 2: Persistent CDP Automation| CDPServer["lightpanda serve (Port 9222 / Unix Socket)"]
        CDPServer --> Playwright["Playwright connectOverCDP (Interaksi Form/Klik)"]
    end
    
    FetchCLI -->|Markdown Bersih| Sanitizer["Content Normalizer & Token Guard"]
    Playwright -->|Data Terstruktur| Sanitizer
    
    Sanitizer --> AI_Synthesizer["Gemini / Groq AI Synthesizer"]
    AI_Synthesizer -->|Rangkuman Eksekutif + Poin Kunci| OutputDelivery["Telegram Outbound / Voice Response"]
```

---

## 4. Rincian Modul yang Akan Dibangun

### Modul A: `src/infrastructure/Lightpanda_Client.js`
Komponen *low-level* untuk berinteraksi dengan binary Lightpanda di VPS:
* **Fungsi `fetchMarkdown(url, options)`**:
  - Menjalankan `lightpanda fetch --dump markdown --obey-robots --wait-ms 1500 <url>` via `child_process.execFile`.
  - Dilengkapi *Timeout Guard* (maksimal 15 detik) untuk mencegah proses menggantung (*hanging*).
  - Dilengkapi *Buffer Truncation* (maksimal 30.000 karakter) agar tidak meledakkan *context window* LLM.
* **Fungsi `fetchStructuredData(url)`**:
  - Menjalankan `lightpanda fetch --dump structured_data <url>` untuk mengambil JSON-LD, metadata OpenGraph, dan ringkasan artikel.
* **Fungsi `isLightpandaAvailable()`**:
  - Mendeteksi ketersediaan binary `lightpanda` di sistem (`/usr/local/bin/lightpanda`). Jika belum terpasang, otomatis *fallback* ke metode HTTP `axios + cheerio`.

### Modul B: Integrasi Router & Prompt (`Router_Classifier.js` & `Router_Prompts.js`)
* Penambahan deteksi pola URL (*Regex URL Detector*):
  - Jika pesan berisi tautan `http://` atau `https://` disertai instruksi seperti *"baca"*, *"ringkas"*, *"cek web"*, *"rangkum"*, *"ada info apa di link ini"*.
  - Klasifikasi intent diarahkan ke:
    ```json
    {
      "intent": "WEB_SEARCH",
      "extracted_data": {
        "action": "READ_URL",
        "url": "https://..."
      }
    }
    ```

### Modul C: Registrasi Tool pada `Live_Tool_Registry.js`
* Pendaftaran tool baru untuk Gemini Live Voice & Agen Otomatis:
  ```javascript
  {
    name: 'readWebPage',
    description: 'Membuka dan membaca konten lengkap halaman web secara headless (mengeksekusi JavaScript) dan mengembalikan teks bersih dalam format Markdown.',
    parameters: {
      url: { type: 'STRING', description: 'URL lengkap halaman web yang ingin dibaca (contoh: https://kompas.com/...)' }
    }
  }
  ```

### Modul D: Handlers & Response Formatting (`system_handler.js`)
* Menangani eksekusi `action === 'READ_URL'`:
  1. Menampilkan status *typing* / *action* di Telegram (*N.E.X.A sedang membaca halaman...*).
  2. Membaca isi halaman via Lightpanda.
  3. Memproses Markdown mentah melalui LLM peringkas (*Executive Synthesizer*).
  4. Mengirimkan balasan kaya dengan format:
     - 📌 **Judul / Sumber Halaman**
     - 📝 **Rangkuman Eksekutif (Poin-Poin Utama)**
     - 💡 **Wawasan / Implikasi Relevan untuk Tuan**
     - 🔗 **Tautan Asli**

---

## 5. Rencana Instalasi di VPS (Deployment Steps)

Langkah-langkah instalasi binary resmi Lightpanda di VPS Ubuntu 24.04:

```bash
# 1. Unduh rilis binary terbaru untuk Linux x86_64
cd /tmp
curl -s https://api.github.com/repos/lightpanda-io/browser/releases/latest \
  | grep "browser_download_url.*linux.*x86_64" \
  | cut -d : -f 2,3 \
  | tr -d \" \
  | wget -qi -

# 2. Ekstrak dan pindahkan binary ke path sistem
tar -xzf lightpanda-*.tar.gz
sudo mv lightpanda /usr/local/bin/
sudo chmod +x /usr/local/bin/lightpanda

# 3. Verifikasi instalasi
lightpanda --version
```

---

## 6. Manajemen Sumber Daya & Pengaman (Safety & Resource Guards)

1. **Anti-OOM & Memory Isolation:**
   - Sesi CLI one-shot (`fetch`) dijalankan dalam *sub-process* terisolasi. Begitu selesai mengekstrak teks, proses langsung *exit*, mengembalikan memori 100% ke sistem operasi.
   - VPS kini telah dilengkapi **Swap 2 GB**, sehingga lonjakan sementara tidak akan pernah mematikan proses utama Node.js.
2. **Robots.txt Compliance:**
   - Mengaktifkan opsi bawaan `--obey-robots` agar N.E.X.A mematuhi aturan privasi dan pencegahan pemblokiran dari situs web sasaran.
3. **Execution Timeout:**
   - Batas waktu maksimal eksekusi halaman ditetapkan 12.000 ms (12 detik). Jika halaman lambat atau *infinite loop*, proses di-*kill* secara paksa (SIGKILL) dan N.E.X.A memberikan pesan kegagalan yang ramah.
4. **Token Budget Guard:**
   - Konten Markdown yang melebihi 25.000 karakter akan dipotong secara cerdas pada batas paragraf terdekat untuk menghemat token API LLM.

---

## 7. Rencana Pengujian (Testing & Verification Matrix)

| Skenario Uji | Deskripsi Uji | Target Hasil |
| :--- | :--- | :--- |
| **Unit Test Client** | Memanggil `fetchMarkdown` pada situs uji lokal / mock | Mengembalikan string Markdown terformat tanpa error |
| **Dynamic JS Page** | Membaca situs SPA (Single Page Application - React/Vue) | Berhasil membaca konten yang baru muncul via JavaScript |
| **Timeout Guard** | Membuka URL yang sengaja dibuat lambat (delay 20s) | Proses terhenti dalam 12 detik tanpa *crash* di Node.js |
| **Telegram End-to-End** | Tuan mengirim URL artikel berita ke bot Telegram | Bot membalas dengan ringkasan terstruktur dan tautan sumber |
| **Resource Check** | Mengukur lonjakan RAM saat membuka 5 halaman simultan | Kenaikan RAM tidak melebihi 50 MB |

---

## 8. Jadwal Pelaksanaan (Implementation Milestones)

* **Fase 1: Instalasi Binary di VPS & Verifikasi CLI**
  - Download binary Lightpanda x86_64 di VPS.
  - Uji perintah `lightpanda fetch --dump markdown https://example.com`.
* **Fase 2: Pembuatan Modul `Lightpanda_Client.js` & Unit Test**
  - Buat wrapper Node.js CommonJS dengan kontrol timeout dan pembersihan buffer.
  - Tambahkan unit test ke dalam suite `npm test`.
* **Fase 3: Integrasi Router, Handler & Telegram Bot**
  - Pasang deteksi URL pada `Router_Classifier.js`.
  - Pasang handler `READ_URL` pada `system_handler.js`.
* **Fase 4: Deployment & Uji Lapangan**
  - Deploy ke server VPS dan uji langsung melalui interaksi obrolan Telegram.

---
*Dokumen ini siap dieksekusi setelah mendapatkan konfirmasi lanjutan dari Tuan.*
