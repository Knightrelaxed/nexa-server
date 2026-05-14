# 🧪 SKENARIO PENGUJIAN: N.E.X.A FASE 4

Dokumen ini berisi perintah untuk menguji fitur **Advanced Workflow & Two-Way Sync** yang diimplementasikan pada Fase 4.

---

## ✅ TEST 1: Two-Way Status Sync (Calendar Auto-Grey on Task Complete)

**Tujuan:** Memastikan ketika tugas ditandai selesai, blok kalender DEADLINE terkait berubah warna menjadi abu-abu.

**Langkah:**
1. Buat tugas dengan deadline + jam spesifik:
   > "Nexa, buat tugas: selesaikan laporan keuangan, deadline besok jam 10 pagi."
   
2. Cek Google Calendar — harus muncul blok `⏰ DEADLINE: selesaikan laporan keuangan`.

3. Tandai tugas selesai:
   > "Nexa, tandai selesai tugas laporan keuangan."

**Ekspektasi:** N.E.X.A membalas dengan konfirmasi bahwa "1 jadwal deadline di Kalender otomatis diredupkan (abu-abu)."
Cek Google Calendar — blok `⏰ DEADLINE: selesaikan laporan keuangan` harus berubah menjadi warna abu-abu/graphite.

---

## ✅ TEST 2: Task Migration (Pemindahan Lintas-List)

**Tujuan:** Memastikan tugas bisa dipindahkan dari satu list ke list lain.

**Perintah:**
> "Nexa, pindahkan tugas laporan keuangan ke list Pekerjaan."

**Ekspektasi:** N.E.X.A mengkonfirmasi bahwa tugas berhasil dipindahkan. Cek Google Tasks — tugas harus hilang dari list lama dan muncul di list "Pekerjaan".

---

## ✅ TEST 3: Smart Color Coding Calendar Event

**Tujuan:** Memastikan event kalender dibuat dengan warna sesuai instruksi pengguna.

**Perintah:**
> "Nexa, tambahkan jadwal Rapat Penting warna merah besok jam 2 siang selama 1 jam."

**Ekspektasi:** Jadwal ditambahkan ke kalender dengan warna **merah (Tomato)** yang terlihat di Google Calendar. N.E.X.A juga membalas "🎨 Warna event disesuaikan."

---

## ✅ TEST 4: Task Priority Marking (⭐)

**Tujuan:** Memastikan fitur prioritas menambahkan label ⭐ pada judul tugas.

**Perintah:**
> "Nexa, prioritaskan tugas laporan keuangan."

**Ekspektasi:** N.E.X.A membalas konfirmasi ⭐. Di Google Tasks, judul tugas berubah menjadi "⭐ [PRIORITAS] selesaikan laporan keuangan".

---

## ✅ TEST 5: Proactive Calendar-to-Task Generation

**Tujuan:** Memastikan N.E.X.A secara proaktif menyarankan tugas persiapan setelah agenda penting ditambahkan.

**Perintah:**
> "Nexa, tambahkan jadwal Seminar Linguistik Nasional hari Senin jam 9 pagi selama 3 jam."

**Ekspektasi:**
1. Jadwal berhasil ditambahkan ke kalender.
2. N.E.X.A menambahkan **💡 Saran Proaktif N.E.X.A:** dengan 1-2 rekomendasi tugas persiapan.
3. Jika Tuan membalas "Buatkan tugas untuk persiapan agenda tersebut", N.E.X.A membuat task tersebut di Google Tasks.

---

*Dokumen ini dibuat oleh N.E.X.A untuk panduan pengujian Fase 4.*
