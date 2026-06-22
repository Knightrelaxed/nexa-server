# Arsitektur N.E.X.A 3.0 (Hybrid Agentic dengan n8n)

Berikut adalah diagram aliran kerja (*workflow*) yang menggambarkan komunikasi dari ujung ke ujung pada N.E.X.A 3.0.

## 1. Master Canvas: Autonomous Executor (The Tentacles)
Ini adalah kanvas utama tempat n8n menerima perintah dari N.E.X.A Core. Dengan mengumpulkan semua alat (*Tools*) di bawah satu Agen Otonom, kita tidak perlu mengatur logika rute (IF/ELSE) sama sekali. Agen ini akan merogoh kotak peralatannya dan memilih alat yang tepat berdasarkan teks Anda.

```text
========================================================================================
             MASTER CANVAS: N.E.X.A 3.0 AUTONOMOUS AGENT (n8n)
========================================================================================

                         [ 📥 WEBHOOK TRIGGER ]
                         (Endpoint: /webhook/nexa-command)
                         (Menerima JSON: raw_text, context, time)
                                    │
                                    ▼
                         [ 🤖 AI AGENT: NEXA SUPERVISOR ] 
                         (Menggunakan arsitektur LangChain)
          ┌─────────────────────────┼─────────────────────────┐
          │                         │                         │
    ┌─────▼─────┐             ┌─────▼─────┐             ┌─────▼─────┐ 
    │ 🧠 MODEL  │             │ 💾 MEMORY │             │ 🛠️ TOOLS  │ (Senjata Agen)
    │Groq Llama 3             │Window Buff│             └─────┬─────┘
    │(70B Fast) │             │(Mengingat │                   │
    └───────────┘             │konteks)   │                   │
                              └───────────┘                   │
   ┌──────────────────────────────────────────────────────────┘
   │
   ├─▶ [ 📅 TOOL: Google Calendar ] (Tugas: Membuat/Mengubah/Membaca Jadwal)
   │
   ├─▶ [ 📓 TOOL: Notion Client ] (Tugas: Zettelkasten, Skripsi Kanban, Personal CRM)
   │
   ├─▶ [ 📊 TOOL: Google Sheets ] (Tugas: Finance Engine & Subscription Tracker)
   │
   ├─▶ [ 📧 TOOL: Gmail ] (Tugas: Membaca kotak masuk & Mengirim Email)
   │
   └─▶ [ 🌐 TOOL: Web Scraper ] (Tugas: Merangkum isi website/jurnal dari internet)
                                                              │
   ┌──────────────────────────────────────────────────────────┘
   │ (Setelah Agent mengeksekusi Tool dan mendapatkan hasilnya)
   ▼
[ 🔀 ERROR CATCHER / IF NODE ]
   │
   ├─ (SUKSES) ─▶ [ 📤 HTTP REQUEST (Sukses) ] ─▶ (Balik ke N.E.X.A Core / Telegram)
   │
   └─ (GAGAL) ──▶ [ 📤 HTTP REQUEST (Gagal) ]  ─▶ (N.E.X.A Core meminta maaf & Analisis)
```

## 2. Watcher Canvas: The Proactive Eyes
Kanvas kedua ini berjalan secara mandiri di n8n tanpa menunggu perintah dari Anda. Ia berfungsi sebagai "Mata-Mata" yang selalu mengawasi dunia luar dan melapor ke N.E.X.A Core.

```text
========================================================================================
             WATCHER CANVAS: PROACTIVE MONITORING (n8n)
========================================================================================

   [ ⏰ SCHEDULE TRIGGER ] (Berjalan setiap jam 08:00)
             │
             ▼
   [ 📓 NOTION DATABASE NODE ] 
   (Membaca tabel "Skripsi Kanban" dan "Personal CRM")
             │
             ▼
   [ ⚙️ FILTER / LOGIC NODE ]
   (Apakah ada tugas yang nyangkut > 14 hari? Apakah ada dosen yang belum disapa?)
             │
             ├── (TIDAK) ─▶ [ 🛑 Berhenti / Diam saja ]
             │
             └── (YA) ────┐
                          ▼
               [ 📤 HTTP REQUEST (Peringatan Bahaya) ]
               (Mengirim Webhook ke N.E.X.A Core)
                          │
                          ▼
            (N.E.X.A Core merangkum teguran di Telegram)
            "Tuan Faqih, Bab 2 Skripsi Anda nyangkut selama 14 hari."
========================================================================================
```

## 2. Alur Pengamatan / Watcher (Eksternal ke N.E.X.A)
Digunakan saat n8n mendeteksi kejadian di luar lalu melaporkannya secara proaktif kepada Anda.

```text
 📘 APLIKASI LUAR (Misal: Ada email masuk atau ada event di kalender)
      │
      │ 1. Terdeteksi perubahan
      ▼
 🐙 SPACE 2: n8n-Tentacle (Hugging Face)
 ┌─────────────────────────────────────────────────────────┐
 │ [ ⏰ Trigger Node: Schedule / Polling ]                 │
 │  n8n mendeteksi: "Eh ada email penting masuk!"          │
 │            │                                            │
 │            ▼                                            │
 │ [ 📤 Action Node: HTTP Request ]                        │
 │  Mengirim Webhook notifikasi ke N.E.X.A  ──────────────┼──┐
 └─────────────────────────────────────────────────────────┘   │ 2. Webhook dikirim ke N.E.X.A
                                                               │
 🧠 SPACE 1: NEXA-Core-Server (Hugging Face)                   ▼
 ┌─────────────────────────────────────────────────────────┐
 │ 1. Endpoint /webhook/n8n menerima peringatan            │
 │ 2. N.E.X.A merangkumnya dengan gaya bahasanya           │
 │ 3. N.E.X.A mengirim pesan proaktif ke Telegram Anda     │
 └─────────────────────────────────────────────────────────┘
      │
      │ 3. Notifikasi Proaktif
      ▼
 📱 TELEGRAM (Anda)
    "Tuan Faqih, n8n mendeteksi ada tagihan masuk di email Anda."
```
