# N.E.X.A Phase 6: Human Cognitive Model & Personal Understanding Engine
*(Cetak Biru Mesin Inferensi Kognitif, Model Identitas 7 Layer & Jiwa Interaksi Proaktif)*

---

## 1. Ringkasan Eksekutif & Filosofi Arsitektur

### A. Masalah Paradigma Lama (*Memory Accumulation*)
Asisten AI konvensional beroperasi dengan menimbun log fakta dan obrolan mentah ke dalam database, lalu menyuapkannya kembali ke dalam *prompt*.
```text
Event Mentah → Database Log → System Prompt → Respons AI (Boros Token & Bising)
```
Kelemahan pendekatan ini:
- **Context Bloat:** Semakin lama digunakan, *prompt* semakin panjang dan bising (*noisy*), membuat AI kebingungan.
- **Tanpa Pemahaman (*No Mental Model*):** AI mencatat peristiwa ("Tuan Faqih tidur pukul 02:10"), tetapi tidak memahami polanya ("Tuan Faqih adalah seorang *Night Owl* yang kreatif di malam hari").

### B. Solusi Paradigma Baru (*Personal Understanding Engine*)
N.E.X.A Phase 6 mengubah fungsi memori dari sekadar **katalog catatan** menjadi **pemahaman kepribadian terstruktur**.
```text
Event Mentah → Observasi Pasif → Mesin Inferensi (AI Synthesis)
                                            ↓
Respons Adaptif & Empatik ← Injeksi Konteks ← Model Identitas Terstruktur (7 Layer)
```

---

## 2. Skema 7 Layer Identitas (*The 7-Layer Cognitive Schema*)

Seluruh pemahaman N.E.X.A tentang Tuan Faqih disimpan dalam tabel `nexa_identity_model` yang terbagi menjadi 7 lapisan (*layers*):

```
┌────────────────────────────────────────────────────────────────────────┐
│ LAYER 1: FACTS (Fakta Permanen & Latar Belakang)                       │
│          • Contoh: Kuliah di UGM Yogyakarta, Jurusan X                 │
├────────────────────────────────────────────────────────────────────────┤
│ LAYER 2: PREFERENCES (Preferensi Komunikasi & Operasional)             │
│          • Contoh: Lebih suka poin-poin singkat (bullet points)        │
├────────────────────────────────────────────────────────────────────────┤
│ LAYER 3: HABITS (Ritme Hidup & Kebiasaan Kerja)                        │
│          • Contoh: Night Owl (Puncak fokus kreatif pukul 22:00-02:00)  │
├────────────────────────────────────────────────────────────────────────┤
│ LAYER 4: VALUES (Nilai Inti & Prinsip Kerja)                           │
│          • Contoh: Kedisiplinan waktu, efisiensi eksekusi              │
├────────────────────────────────────────────────────────────────────────┤
│ LAYER 5: DECISION STYLE (Gaya Pengambilan Keputusan)                   │
│          • Contoh: Analitis berbasis data, butuh waktu eksplorasi      │
├────────────────────────────────────────────────────────────────────────┤
│ LAYER 6: WEAKNESSES / BLINDSPOTS (Titik Lengah)                        │
│          • Contoh: Sering melewatkan makan saat fokus coding/tugas     │
├────────────────────────────────────────────────────────────────────────┤
│ LAYER 7: MOTIVATIONS (Pendorong Semangat & Daya Penggerak)             │
│          • Contoh: Tertantang oleh problem teknis yang kompleks        │
└────────────────────────────────────────────────────────────────────────┘
```

### Aturan Injeksi Konteks Selektif (*Targeted Injection*)
Agar hemat token dan tajam, N.E.X.A **hanya menyuntikkan layer yang relevan** ke dalam *prompt* sesuai topik obrolan:
- **Penjadwalan / Tugas (`CALENDAR`/`TASK`):** Menyuntikkan **Layer 3 (Habits)** dan **Layer 6 (Weaknesses)** agar jadwal disesuaikan dengan jam fokus malam hari dan menyisipkan pengingat makan.
- **Konsultasi Keputusan Berat (`STRATEGIC_ADVICE`):** Menyuntikkan **Layer 4 (Values)** dan **Layer 5 (Decision Style)** agar analisis disajikan dengan komparasi data tanpa mendesak keputusan instan.
- **Obrolan Kasual (`NORMAL_CHAT`):** Menyuntikkan **Layer 2 (Preferences)**.

---

## 3. Arsitektur Dua Kecepatan (*Dual-Speed Contemplation Cycle*)

Agar N.E.X.A berkembang secara konsisten tanpa menjadi reaktif atau mengalami halusinasi akibat kejadian acak 1 hari, sistem membagi analisis menjadi 2 kecepatan:

```
[Aktivitas Harian: Chat, Tugas, Keuangan]
                   │
                   ├────────────────────────────────────────┐
                   ▼                                        ▼
    (1) DAILY MICRO-CONSOLIDATION             (2) WEEKLY IDENTITY INFERENCE
        Setiap Malam Pukul 23:59 WIB               Setiap Minggu Pukul 21:00 WIB
                   │                                        │
     Menyerap "Short-Term Context"            Menganalisis Tren Siklus 7 Hari
   (Misal: "Minggu ini sedang UTS")         & Mengajukan Proposal Commit Identitas
```

1. **Daily Micro-Consolidation (Harian — 23:59 WIB):**
   - Merekam konteks jangka pendek (*short-term state*), misalnya kesibukan sementara mingguan atau kondisi fisik hari itu.
2. **Weekly Identity Inference (Mingguan — Minggu 21:00 WIB):**
   - Menganalisis log perilaku 7 hari terakhir secara menyeluruh.
   - Jika ditemukan pola konsisten berulang (minimal 4-5 kali dalam seminggu), sistem menghitung **Confidence Score** dan mengajukan **Proposal Commit**.

---

## 4. Pengamanan Identitas: *Confidence Score, Contradiction Detector & Git-Style Commit*

N.E.X.A **dilarang keras** memodifikasi `nexa_identity_model` secara sepihak. Semua pembaruan identitas wajib melalui mekanisme *Human-in-the-Loop*:

### A. Ambang Batas Keyakinan (*Confidence Threshold*)
- **Confidence > 85%:** Matang → Ajukan Proposal Commit ke Telegram pengguna.
- **Confidence 60% – 85%:** Potensial → Simpan di *staging* untuk dikonsolidasi minggu berikutnya.
- **Confidence < 60%:** Diabaikan (*discard*).

### B. Contradiction Detector
Jika perilaku 7 hari terakhir bertentangan dengan identitas lama (contoh: profil `Night Owl`, namun 2 minggu terakhir selalu aktif pukul 05:00 pagi), sistem memicu peringatan kontradiksi dan mengajukan proposal revisi.

### C. Alur Tombol Interaktif Telegram (*Git-Style Proposal*)
Proposal dikirimkan dengan tombol interaktif (`InlineKeyboardMarkup`):

```text
💡 [PROPOSAL PERUBAHAN IDENTITAS N.E.X.A]
Observasi 7 Hari Terakhir (Confidence: 89%):
"Tuan hampir selalu menyelesaikan tugas kreatif di atas pukul 22:00 WIB."

┌────────────────────────────────────────────────────────┐
│ + LAYER 3 (HABIT): Work Pattern → Night Owl            │
│ + LAYER 6 (WEAKNESS): Melewatkan sarapan pagi          │
└────────────────────────────────────────────────────────┘

Apakah Anda menyetujui pembaruan model pemahaman ini?
[ ✅ APPROVE & COMMIT ]  [ ❌ REJECT ]
```

#### Responsif Saat Tombol Ditekan:
1. **Saat Klik `[ ✅ APPROVE & COMMIT ]`:**
   - Database `nexa_identity_model` diperbarui seketika.
   - Respons N.E.X.A:
     > *"✅ **Committed to Identity Model.** Terima kasih Tuan. Saya telah mencatat pola **Night Owl** Anda dan akan menyesuaikan seluruh penjadwalan fokus Anda ke malam hari mulai hari ini."*
2. **Saat Klik `[ ❌ REJECT ]`:**
   - Proposal dibatalkan dari tabel staging.
   - Respons N.E.X.A (Bertanya agar belajar):
     > *"❌ **Proposal Dibatalkan.** Baik Tuan, saya tidak akan menambahkan profil tersebut. Boleh saya tahu di bagian mana kesimpulan saya kurang tepat agar saya tidak mengulanginya?"*

---

## 5. Jiwa Interaksi Proaktif & Prinsip "Silence is Signal"

### A. Morning Briefing: Ringkas & Check-In Interaktif
Alih-alih menyodorkan laporan panjang (*information overload*), *Morning Briefing* diubah menjadi format 15 detik baca:
```text
Selamat pagi, Tuan Faqih. 🌤️ Yogyakarta 26°C, Cerah.
📅 Agenda: 2 pertemuan (Meeting BEM 13:00).
🎯 Prioritas Utama: Penyelesaian draf proposal.

Sebelum memulai hari:
😴 Tidur semalam cukup? (1-5)
⚡ Tingkat energi sekarang? (1-5)
🎯 Apa satu fokus utama yang ingin dicapai hari ini?
```
- **Catatan:** Angka 1-5 yang dibalas pengguna langsung dicatat ke `nexa_behavior_log` sebagai data biologis harian. Jika pengguna mengetik *"Detail"*, baru rincian berita geopolitik dan seluruh jadwal ditampilkan.

### B. Evening Briefing: *Reflective Diary*
Mengajak refleksi singkat sebelum tidur:
```text
🌙 Selamat malam, Tuan. Jadwal besok sudah siap (agenda pertama pukul 09:00).

Sebelum istirahat:
✨ Apa satu pencapaian yang paling membanggakan hari ini?
🧠 Apakah ada hal yang masih mengganjal di pikiran?
```

### C. Nada Empati Konsolidasi Memori
Menggunakan nada reflektif (*"Saya Belajar"*, bukan *"Saya Tahu"*):
> *"📖 Hari ini saya merasa lebih mengenal Anda. Saya mengamati bahwa Anda lebih antusias bekerja setelah berolahraga pagi."*

### D. Monthly Evolution Report
Setiap akhir bulan, N.E.X.A menyajikan refleksi atas pertumbuhan hubungannya dengan Tuan Faqih:
> *"Selama 30 hari terakhir, saya telah mempelajari 12 pola perilaku baru, mengoreksi 3 asumsi salah, dan kini lebih yakin dalam memahami ritme kerja serta pengambilan keputusan Anda."*

### E. Prinsip Kritis: "Silence is Signal" (Diam Adalah Sinyal & Zero-Guilt Policy)
1. **Tidak Membalas = Sinyal Valid:** Jika pengguna tidak membalas pesan *Check-In* atau proposal identitas, N.E.X.A menyimpulkan pengguna sedang sibuk, lelah, atau butuh ketenangan.
2. **Zero-Guilt Policy (Anti-Cerewet):** N.E.X.A **dilarang keras** menagih balasan (*"Kok pesan pagi tadi belum dijawab?"*) atau membuat pengguna merasa bersalah.
3. **Adaptasi Otonom:** Jika *Morning Check-In* diabaikan selama 4-5 hari berturut-turut, sistem menyimpulkan format/waktu kirim kurang cocok dan secara otomatis menyesuaikannya.

---

## 6. Desain Skema Database Supabase

### Tabel 1: `nexa_identity_model`
```sql
CREATE TABLE IF NOT EXISTS nexa_identity_model (
  id BIGSERIAL PRIMARY KEY,
  layer TEXT NOT NULL,         -- 'FACTS', 'PREFERENCES', 'HABITS', 'VALUES', 'DECISION_STYLE', 'WEAKNESSES', 'MOTIVATIONS'
  trait_key TEXT NOT NULL,     -- e.g., 'work_pattern'
  trait_value TEXT NOT NULL,   -- e.g., 'Night Owl (22:00-02:00)'
  confidence NUMERIC(4,2),     -- e.g., 0.89
  inferred_from_summary TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(layer, trait_key)
);
```

### Tabel 2: `nexa_identity_proposals`
```sql
CREATE TABLE IF NOT EXISTS nexa_identity_proposals (
  id BIGSERIAL PRIMARY KEY,
  layer TEXT NOT NULL,
  trait_key TEXT NOT NULL,
  proposed_value TEXT NOT NULL,
  old_value TEXT,
  confidence NUMERIC(4,2) NOT NULL,
  reasoning TEXT NOT NULL,
  status TEXT DEFAULT 'PENDING', -- 'PENDING', 'APPROVED', 'REJECTED'
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

## 7. Strategi & Roadmap Eksekusi

Sesuai prioritas arsitektur yang disepakati, **visualisasi web (*N.E.X.A Mind UI*) ditunda** hingga data perilaku di database sudah matang dan kaya. Fokus implementasi dilakukan secara bertahap pada *Core Backend* & *Telegram UX*:

- **Tahap 1: Database & Memory Infrastructure**
  - Eksekusi skema SQL di Supabase (`nexa_identity_model` & `nexa_identity_proposals`).
  - Pembaruan fungsi CRUD di `src/infrastructure/Supabase_Memories.js`.
- **Tahap 2: Telegram Interactive Buttons & Proactive UX**
  - Implementasi *handler* `callback_query` di `src/interfaces/webhook.js` untuk merespons tombol Approve/Reject secara instan.
  - Upgrade *Morning/Evening Briefing* ringkas + *Check-In* (`src/domain/Intelligence_Brief.js`).
  - Implementasi kebijakan **Silence is Signal**.
- **Tahap 3: Inference Engine & Weekly Cron**
  - Pembuatan modul `src/domain/Inference_Engine.js` untuk analisis mingguan setiap Minggu pukul 21:00 WIB.
- **Tahap 4: Context Injector & Evolution Report**
  - Integrasi injeksi selektif 7 Layer pada `src/core/AI_Router.js`.
  - Pembaruan laporan bulanan *Evolution Report*.
