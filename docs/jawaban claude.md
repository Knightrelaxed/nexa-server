Baik, saya sudah membaca semua enam file secara langsung. Berikut adalah audit lengkap yang berbasis pada kode sesungguhnya, bukan hanya dokumentasi.

---

## ✅ Yang Sudah Benar-Benar Baik

Sebelum masuk ke kritik, ada hal-hal yang perlu diapresiasi karena ini bukan pekerjaan pemula:

**Arsitektur berlapis (`Layered Architecture`)** sudah tepat — infrastruktur, domain, dan interface terpisah dengan jelas. `AI_Router.js` dengan sistem cache dua lapis (personal facts + identity model) dan `_applyTokenBudgetGuard` adalah solusi pragmatis yang cerdas untuk menghindari 413 error dari Groq. `parseDurationMinutes` di `Agenda_Manager.js` dengan pola fast-path/slow-path juga merupakan desain yang solid dan efisien.

---

## 🔴 Bug Kritis — Ditemukan Langsung dari Kode

### Bug #1 — Proactive Task Suggestion Hanya Terpanggil di Satu Jalur

Di `Agenda_Manager.js`, blok proaktif (baris 209–220) hanya dapat dicapai jika `end` langsung tersedia. Jalur `parseDurationMinutes` (baris 128–154) langsung `return` setelah `createCalendarEvent` tanpa pernah menyentuh blok proaktif tersebut.

**Artinya**: ucapan seperti *"rapat besok jam 10 pagi selama 1 jam"* tidak pernah menghasilkan saran tugas persiapan.

**Rekomendasi fix:**
```javascript
// Setelah baris 154 (setelah return SUCCESS dari jalur duration)
// Pindahkan proactive block ke sebuah helper function, lalu panggil di KEDUA jalur.
async function _tryProactiveTaskSuggestion(summary) {
  // ... logika AI saat ini dari baris 210-219
}
// Panggil di akhir KEDUA jalur sukses (baris ~154 dan ~221)
```

---

### Bug #2 — `⏰ BLOK KERJA` Tidak Ikut Dibersihkan saat COMPLETE atau DELETE

Di `Task_Manager.js`, blok `COMPLETE` (baris 550–560):
```javascript
const events = await googleWorkspace.findEventByTitle(`🔴 DEADLINE: ${t.title}`);
// Hanya DEADLINE yang diubah warnanya. BLOK KERJA tidak disentuh sama sekali.
```

Dan blok `DELETE` (baris 571–584) bahkan **tidak ada** operasi kalender sama sekali — tidak ada penghapusan `🔴 DEADLINE` maupun `⏰ BLOK KERJA`.

Ini berarti setiap kali tugas dihapus, kalender Anda akan terus penuh oleh event-event hantu yang sudah tidak relevan.

**Rekomendasi fix:**
```javascript
// Tambahkan ke COMPLETE dan DELETE:
const workBlockEvents = await googleWorkspace.findEventByTitle(`⏰ BLOK KERJA: ${t.title}`);
for (const ev of workBlockEvents) {
  if (action === 'COMPLETE') await googleWorkspace.updateCalendarEventColor(ev.id, '8');
  if (action === 'DELETE') await googleWorkspace.deleteCalendarEvent(ev.id);
}

// Untuk DELETE, juga hapus DEADLINE:
const deadlineEvents = await googleWorkspace.findEventByTitle(`🔴 DEADLINE: ${t.title}`);
for (const ev of deadlineEvents) await googleWorkspace.deleteCalendarEvent(ev.id);
```

---

### Bug #3 — Memori Saran Proaktif Hilang Total (`Context Amnesia`)

Di `webhook.js`, setelah N.E.X.A mengirim pesan berisi saran proaktif seperti *"💡 1. Siapkan slide..."*, tidak ada satupun variabel yang menyimpan daftar saran tersebut. Ketika user membalas *"Buatkan"*, `AI_Router` menerima pesan kosong konteks dan mem-routing-nya ke TASK CREATE biasa.

Ini adalah celah UX paling krusial karena fitur yang kelihatannya berjalan ternyata tidak berfungsi hingga tuntas.

**Rekomendasi fix:**
```javascript
// Di webhook.js, tambahkan state baru:
let pendingProactiveTasks = null; 
// Struktur: { eventSummary, suggestedTasks: ["Siapkan slide", "Baca materi"], askedAt }

// Isi setelah AI generate saran, lalu di handler TASK:
// Cek classifyYesNo(textInput) → jika YES, buat tugas dari pendingProactiveTasks
```

---

### Bug #4 — Pre-flight Classifier Salah Kategori di `AI_Router.js`

Di baris 26–29, `_CAL_DOMAIN_KWS` mengandung:
```javascript
'tugas hari ini', 'deadline', 'jadwal hari'
```

Kata `'deadline'` dan `'tugas hari ini'` adalah kata kunci TASK, bukan CALENDAR. Ini menyebabkan pesan bertema tugas secara tidak perlu melewati jalur pemeriksaan kalender di pre-flight, yang berpotensi mempengaruhi *token budget allocation* dan scoring.

---

### Bug #5 — Timezone Fragility di `Google_Tasks.js`

`getTasksDueTomorrow` (baris ~165):
```javascript
const tmrwStr = new Date(Date.now() + 86400000).toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' });
```

Menambahkan 86.400.000 ms (24 jam) ke timestamp saat ini tidak memperhitungkan Daylight Saving Time (DST). Meskipun Indonesia tidak menggunakan DST, pola ini berbahaya jika server dijalankan di lingkungan dengan timezone berbeda. Metode yang lebih aman adalah menggunakan `Intl.DateTimeFormat` untuk mendapatkan tanggal besok secara eksplisit dalam zona waktu Jakarta, seperti yang sudah dilakukan oleh `getTasksDueToday`.

---

## 🟡 Masalah Arsitektur

### A — State Tidak Persisten (Server Restart = Data Hilang)

Ada **lima** variabel state yang seluruhnya hanya hidup di RAM:

| Variabel | Lokasi | Risiko |
|---|---|---|
| `pendingAgendas` | `Agenda_Manager.js` | Konfirmasi durasi/conflict hilang |
| `pendingTaskCategories` | `Task_Manager.js` | Pending list & sync hilang |
| `pendingCalendarContext` | `webhook.js` | Context kalender hilang |
| `pendingConflictEvent` | `webhook.js` | Konfirmasi konflik hilang |
| `pendingProactiveTasks` | (belum ada) | — |

Anda sudah memiliki Supabase. Semua state ini seharusnya disimpan di sana dengan TTL, sehingga server restart tidak memutus alur percakapan yang sedang berjalan.

---

### B — State Task Terpecah di Dua Modul

`pendingTaskCategories` Map ada di `Task_Manager.js`, tetapi timer-nya di-set dan di-manage dari `webhook.js` (baris 2523–2553). Artinya logika yang sama tersebar di dua tempat, yang membuat debugging dan pemeliharaan menjadi sulit.

**Rekomendasi**: Buat satu `PendingStateManager` terpusat (bisa sederhana saja — sebuah class atau module terpisah) yang menangani semua state dan timer, baik untuk Calendar maupun Task.

---

### C — Duplikasi Kode Deteksi Konflik

Di `Agenda_Manager.js`, blok pengecekan konflik (baris 134–147 dan baris 187–201) adalah kode yang hampir identik — hanya konteksnya yang berbeda. Ini adalah pelanggaran DRY yang cukup serius karena jika logika format pesan konflik berubah, harus diubah di dua tempat.

**Rekomendasi**: Ekstrak ke satu helper function `_formatConflictResponse(summary, conflicts, pendingEvent)`.

---

### D — `findEventByTitle` Tidak Ada Filter Tanggal

Ketika COMPLETE atau DELETE mencari event `🔴 DEADLINE: [judul]` di kalender, pencarian dilakukan tanpa batasan tanggal. Jika Anda pernah memiliki dua tugas berbeda dengan nama yang mirip di waktu berbeda, atau jika nama tugas yang dihapus pernah ada sebelumnya, sistem bisa salah mengubah/menghapus event yang tidak terkait.

---

## 🟢 Rekomendasi Prioritas Pengembangan

Berdasarkan dampak dan kompleksitas implementasi, urutannya adalah:

**Jangka Pendek (Perbaikan Bug — bisa dikerjakan segera):**
1. Tambahkan cleanup `⏰ BLOK KERJA` di COMPLETE dan DELETE — dampak langsung, bersih
2. Pindahkan blok proactive task suggestion ke helper function dan panggil dari kedua jalur sukses di Agenda_Manager
3. Perbaiki `_CAL_DOMAIN_KWS` — hapus `'deadline'` dan `'tugas hari ini'`

**Jangka Menengah (Fitur Baru):**
4. Implementasikan `pendingProactiveTasks` di `webhook.js` sebagai memory bridge saran tugas
5. Tambahkan TASK Conversational Synthesis — sejajarkan dengan Kalender yang sudah ada timeout 1,5 detik
6. Tambahkan filter tanggal ke `findEventByTitle` agar lebih presisi

**Jangka Panjang (Arsitektur):**
7. Migrasi semua pending state ke Supabase dengan kolom `expires_at`
8. Buat `PendingStateManager` terpusat yang dipakai bersama oleh Agenda_Manager, Task_Manager, dan webhook.js
9. Cross-Intent Context Store — ketika user membicarakan kalender lalu tiba-tiba beralih ke tugas, konteks tidak hilang

---

Secara keseluruhan, sistem N.E.X.A sudah memiliki fondasi arsitektur yang solid dan pemikiran desain yang matang. Bug-bug yang ada bukan berasal dari pemahaman yang lemah, melainkan dari kompleksitas integrasi dua domain (Kalender dan Tugas) yang tumbuh secara organik. Prioritas utama saat ini adalah menutup celah sinkronisasi dua arah, karena itu yang paling terlihat oleh pengguna saat menggunakan sistem sehari-hari.