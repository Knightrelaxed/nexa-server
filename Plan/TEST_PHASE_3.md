# 🧪 SKENARIO PENGUJIAN: N.E.X.A FASE 3

Dokumen ini berisi daftar perintah (prompt) yang dirancang khusus untuk menguji fitur-fitur mutakhir yang baru saja diselesaikan pada eksekusi **Fase 3: Integrasi Cerdas Task ↔ Calendar**.

Silakan *copy-paste* perintah-perintah ini ke chat Telegram N.E.X.A untuk memverifikasi fungsi sistem.

---

## 🟢 TEST 1: Task Deadline → Calendar Block (Otomatis)
**Tujuan:** Memastikan bahwa ketika Anda membuat tugas dengan jam spesifik, N.E.X.A tidak hanya mencatatnya di Google Tasks, tetapi juga menanamkan blok acara "DEADLINE" di Google Calendar.

**Perintah yang harus di-copy:**
> "Nexa, tolong buatkan tugas: Kumpul Makalah Linguistik Terapan. Deadlinenya besok jam 14.30 sore ya."

**Ekspektasi Sistem:**
1. N.E.X.A akan mengkategorikan tugas tersebut (mungkin akan meminta konfirmasi masuk ke list "Tugas Kuliah").
2. Jika ada konfirmasi, jawab **"YA"**.
3. Setelah sukses, cek **Google Calendar** Tuan besok di jam 14.30. Harus ada blok kalender berdurasi 30 menit berjudul: `⏰ DEADLINE: Kumpul Makalah Linguistik Terapan`.

---

## 🟢 TEST 2: Conflict Detection & Fallback (Verifikasi Fase 2 & 3)
**Tujuan:** Memastikan N.E.X.A mendeteksi bentrok jadwal kalender, dan fungsi batal/paksa berfungsi dengan sempurna.

**Perintah yang harus di-copy:**
> "Nexa, tambahkan jadwal ngopi bareng teman besok jam 14.30 sore di Starbucks."

**Ekspektasi Sistem:**
1. N.E.X.A akan mendeteksi bahwa pada besok jam 14.30 sudah ada `⏰ DEADLINE: Kumpul Makalah Linguistik Terapan` (dari hasil Test 1).
2. N.E.X.A akan memberi peringatan **[BENTROK JADWAL]** dan bertanya apakah ingin dilanjutkan.
3. Anda bisa membalas **"BATAL"** (jadwal dibatalkan) atau **"YA"** (jadwal tetap dipaksa masuk kalender).

---

## 🟢 TEST 3: Multi-List Search Audit (Hasil Pengecekan Bug)
**Tujuan:** Memastikan bahwa tugas yang dimasukkan ke kategori spesifik (selain "Tugas Saya") bisa ditemukan, diedit, diselesaikan, atau dihapus oleh N.E.X.A.

**Perintah yang harus di-copy:**
> "Nexa, hapus tugas makalah linguistik terapan."

**Ekspektasi Sistem:**
1. N.E.X.A akan mencari di seluruh Task List (bukan hanya list default).
2. N.E.X.A menemukan tugas tersebut di list "Tugas Kuliah".
3. N.E.X.A akan mengonfirmasi bahwa tugas berhasil dihapus. Cek Google Tasks untuk memastikannya hilang.

---

## 🟢 TEST 4: Smart Morning Briefing Enhancement
**Tujuan:** Memastikan kecerdasan buatan N.E.X.A (Prompt AI) telah diperbarui untuk menyertakan analisis tugas (terutama yang overdue/jatuh tempo) dan secara tegas merekomendasikan **SATU prioritas utama** hari ini.

*Karena Cron Job berjalan setiap pagi pukul 05:30 WIB, kita akan memaksa N.E.X.A membacakannya sekarang secara manual.*

**Perintah yang harus di-copy:**
> "Nexa, tolong berikan saya Morning Briefing untuk hari ini sekarang juga."

**Ekspektasi Sistem:**
1. N.E.X.A akan merangkai laporan gaya *Chief of Staff*.
2. Laporan harus mengandung: Salam hormat, Cuaca Jogja, Berita Geopolitik TimTeng, Jadwal hari ini, dan **Status Tugas**.
3. Di akhir paragraf, harus ada **satu kalimat tegas** mengenai apa prioritas utama Tuan Faqih hari ini berdasarkan jadwal dan tugas.

---

## 🟢 TEST 5: Overdue Cron Alert (Mekanisme Alarm)
**Tujuan:** Fitur ini berjalan otomatis setiap jam 07:00 WIB untuk mengingatkan tugas yang sudah lewat batas waktu.

*Untuk menguji ini secara manual (karena kita tidak ingin menunggu jam 7 pagi):*
1. Buat tugas sembarang lewat N.E.X.A.
2. Buka aplikasi Google Tasks Tuan secara manual, lalu **ubah deadline** tugas tersebut ke tanggal kemaren atau 2 hari yang lalu.
3. Kirim perintah ini ke N.E.X.A:
> "Nexa, tampilkan semua tugas saya hari ini."

**Ekspektasi Sistem:**
1. N.E.X.A akan menampilkan tugas yang baru Tuan ubah tadi dengan label **🔴 TERLAMBAT**.
2. Besok jam 07:00 WIB pagi, N.E.X.A secara mandiri akan mengirimkan chat Telegram berisi peringatan `🔴 REMINDER: ... tugas Tuan sudah terlambat`.

---

Silakan laporkan hasil pengujian ini kepada saya, Tuan. Jika ada skenario yang tidak berjalan mulus, saya akan langsung membongkar dan menambalnya di tempat!
