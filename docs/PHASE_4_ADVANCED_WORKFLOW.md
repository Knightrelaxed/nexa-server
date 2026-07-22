# 🚀 RENCANA EKSEKUSI FASE 4: ADVANCED WORKFLOW & TWO-WAY SYNC

Fase ini bertujuan untuk memberikan N.E.X.A "Mata Ketiga" dan kesadaran kontekstual penuh (Proactive Intelligence) dalam mengelola jadwal dan tugas Tuan Faqih.

**STATUS: ✅ SEMUA FITUR UTAMA TELAH DIIMPLEMENTASIKAN & LULUS UJI ROUTER**

---

## 🎯 DAFTAR FITUR & STATUS IMPLEMENTASI

### 1. ✅ Two-Way Status Sync (Sinkronisasi Kalender Balik)
**Status:** SELESAI | Diuji: Router = PASS, `action=COMPLETE` diklasifikasi benar
* **Mekanisme:**
  1. Tuan memerintahkan: *"Nexa, tugas makalah sudah selesai."*
  2. `Task_Manager.js` mengeksekusi fungsi `COMPLETE` di Google Tasks.
  3. Sistem kemudian otomatis mencari di Google Calendar untuk agenda yang berbunyi `⏰ DEADLINE: Makalah` pada rentang waktu yang sesuai.
  4. Panggil `updateCalendarEventColor(eventId, colorId)` dengan `colorId: 8` (Abu-abu / Graphite).
* **File Terdampak:** `src/domain/Task_Manager.js`, `src/infrastructure/Google_Workspace.js`.

### 2. Proactive Calendar-to-Task Generation
**Tujuan:** N.E.X.A bisa menawarkan pembuatan tugas persiapan (sub-task) saat Tuan menambahkan jadwal penting.
* **Mekanisme:**
  1. Tuan menginput: *"Tambahkan rapat BEM besok jam 2."*
  2. N.E.X.A membuat agenda di Kalender.
  3. Secara transparan di `Agenda_Manager.js`, panggil `callAI()` ringan untuk mendeteksi apakah acara ini butuh persiapan.
  4. N.E.X.A membalas: *"✅ Jadwal Rapat BEM ditambahkan. Tuan, apakah Tuan ingin saya otomatis menambahkan tugas: 'Baca notulensi' dan 'Siapkan laporan' ke Google Tasks?"*
  5. Jika dibalas "Ya", N.E.X.A mengeksekusi pembuatan task.
* **File Terdampak:** `src/domain/Agenda_Manager.js`, `src/interfaces/webhook.js`.

### 3. Smart Color Coding & Priority Marking
**Tujuan:** Pengelompokan warna di kalender berdasarkan tingkat kepentingan, dan pemberian tanda "Penting" di Google Tasks.
* **Mekanisme:**
  1. *Prompt Schema* `AI_Router` di-update untuk mengenali permintaan warna (contoh: *"rapat BEM warna merah"*).
  2. Mapping warna: Merah (11), Biru (9), Hijau (2), Kuning (5).
  3. Untuk Tasks, jika Tuan menyebut *"ini sangat penting"*, N.E.X.A akan menambahkan emoji `⭐ [PRIORITAS]` di awal judul Tugas untuk mensimulasikan fitur Star.
* **File Terdampak:** `src/core/AI_Router.js`, `src/infrastructure/Google_Workspace.js`, `src/domain/Task_Manager.js`.

### 4. Task Migration (Pemindahan Lintas-List)
**Tujuan:** Fitur untuk memindahkan tugas dari satu list ke list lain jika salah menempatkan.
* **Mekanisme:**
  1. *Prompt Schema* `AI_Router` ditambahkan action `MOVE`.
  2. Algoritma: Cari task di seluruh list -> Ambil datanya -> Hapus dari list lama -> Buat ulang dengan data yang sama di `destination_list`.
  3. Konfirmasi: *"✅ Tugas 'Beli Sabun' berhasil dipindahkan dari 'Tugas Saya' ke list 'Belanja'."*
* **File Terdampak:** `src/core/AI_Router.js`, `src/domain/Task_Manager.js`.

---

## 🛠️ URUTAN PENGERJAAN YANG DIREKOMENDASIKAN

1. **TAHAP 1 (Fondasi Sinkronisasi)**
   - Implementasi Fitur #1 (Two-Way Status Sync). Ini paling krusial untuk menjaga kalender tetap bersih dari tumpukan deadline yang sebenarnya sudah selesai dikerjakan.
   - Implementasi Fitur #4 (Task Migration).

2. **TAHAP 2 (Kosmetik & Proaktif)**
   - Implementasi Fitur #3 (Smart Color Coding). Membutuhkan update schema JSON di AI Router.
   - Implementasi Fitur #2 (Proactive Task Generation). Ini sentuhan akhir yang akan membuat N.E.X.A terasa 100% "hidup".

---
*(Dokumen ini dibuat otomatis oleh N.E.X.A untuk panduan navigasi arsitektur berikutnya.)*
