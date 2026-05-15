# Panduan Arsitektur & Alur Keuangan N.E.X.A

Dokumen ini menjelaskan secara menyeluruh (*Deep Dive*) bagaimana "Otak Keuangan" N.E.X.A bekerja, dari hulu (input masuk) hingga hilir (penyimpanan ke Google Sheets), termasuk penanganan berbagai skenario ekstrem dan *edge case* yang sudah divalidasi.

---

## 1. Sumber Input (Multi-Channel Intake)
N.E.X.A mampu menangkap transaksi dari berbagai jalur secara bersamaan:
1. **Otomatis via Livin' (Gmail Polling):** Setiap ada transfer/pembayaran dari Mandiri Livin', N.E.X.A melakukan *polling* otomatis ke Gmail setiap 3 menit.
2. **Manual Teks (Telegram):** Tuan mengetik langsung (misal: "Catat pengeluaran 15rb buat beli soto").
3. **Voice Note (Telegram):** Melalui *6-Tier God Mode Voice Engine*, N.E.X.A mentranskrip suara Tuan menjadi teks.
4. **Foto/Struk (Telegram):** Melalui *11-Tier Vision Engine*, N.E.X.A membaca rincian struk belanja atau tangkapan layar transfer.

---

## 2. Pemrosesan Awal & Ekstraksi Data (AI Router)
Semua input mentah dilempar ke `AI_Router` untuk diekstrak menjadi format JSON terstruktur:

- **Nominal:** Dikonversi ke angka absolut positif.
- **Tipe:** Pemasukan atau Pengeluaran.
- **Waktu:** N.E.X.A menggunakan waktu tepat saat pesan masuk. **TETAPI**, jika Tuan memberi keterangan waktu abstrak (misal: "kemarin", "tadi malam", "jam 2 siang tadi", "jam 3 subuh"), N.E.X.A akan menghitung mundur dan menyesuaikan jam/tanggalnya secara cerdas. N.E.X.A kemudian **wajib membalas** dengan menyebutkan jam/tanggal yang telah disesuaikan ke kartu konfirmasi. Data pada Google Sheets juga ditulis dengan waktu yang telah disesuaikan (bukan waktu saat pesan dikirim). Jika Tuan menyebut tanggal tanpa jam (misal: "tanggal 5"), N.E.X.A akan menghentikan proses dan bertanya: *"Jam berapa transaksinya?"* (Status `INCOMPLETE_INFO`).

- **Kategori & Catatan — Alur Hierarki 2 Lapisan:**
  1. **Lapisan 1 (dari nama tujuan):** Untuk transaksi Livin', N.E.X.A membaca nama tujuan transfer dan menebak kategori secara otomatis (misal: "STEAM" → "Perangkat lunak, aplikasi"; "GOFOOD" → "Makanan dan minuman").
  2. **Lapisan 2 (dari keterangan Tuan):** Jika Tuan memberikan keterangan tujuan ("untuk beli soto", "buat bayar kos"), N.E.X.A menggunakannya untuk mengisi `Catatan/Detail` dan menyimpulkan kategori yang lebih presisi.

- **Alur Perintah Tidak Lengkap (Wajib Tanya Dulu):**
  Jika Tuan hanya berkata *"catat pengeluaran 10000"* tanpa menyebutkan tujuan atau keterangan apapun, N.E.X.A **wajib bertanya** terlebih dahulu: *"Tuan, uang ini digunakan untuk keperluan apa?"*. Baru setelah Tuan membalas (misal: "beli buku"), N.E.X.A menebak kategori dan mengirimkan kartu konfirmasi yang sudah **lengkap** dengan `Catatan/Detail` dan Kategori yang terisi.

---

## 3. Zero-Duplication Engine (Pencegah Duplikat)
N.E.X.A membuat **Composite Key** dari `Nominal + Tujuan/Merchant` (contoh: `13000_waroengemdje`).

N.E.X.A mengecek database (`nexa_finance_dedup`):
- Jika ada data dengan nominal dan tujuan **yang sama** dalam kurun waktu **24 jam terakhir**, transaksi baru dari *polling* akan dibuang/diabaikan.
- Jika **tidak ada** dalam 24 jam terakhir, proses dilanjutkan.

> **Catatan Penting:** Window 24 jam dipilih karena Tuan Faqih sering melakukan transaksi dengan nominal dan tujuan yang sama namun pada hari yang berbeda (misalnya beli makan siang di tempat yang sama setiap hari). Transaksi seperti ini harus tetap tercatat, bukan dianggap duplikat.

---

## 4. Sistem Konfirmasi Tertunda (The 5-Minute Window)

Setelah lolos dedup, transaksi masuk ke **Ruang Tunggu (Pending Confirmations)** di RAM dan disalin ke Supabase. N.E.X.A mengirim kartu konfirmasi:

> 💸 **TRANSAKSI LIVIN TERBARU**
>
> **No:** [Auto]
> **Tanggal:** 15 Mei 2026
> **Waktu:** 07.58
> **Tipe:** Pengeluaran
> **Kategori:** Makanan dan minuman
> **Akun:** Bank Mandiri Livin
> **Catatan / Detail:** pengeluaran ke Waroeng Emdje
> **Nominal (Rp):** Rp13.000
> **Saldo (Rp) Saat Ini:** Rp4.019 *(selalu dihitung ulang saat kartu dikirim)*
>
> ❓ **N.E.X.A mencatat pengeluaran ke Waroeng Emdje.**
> Tuan, uang ini digunakan untuk keperluan apa ya? *(Tanpa balasan, N.E.X.A akan menebak kategorinya dalam 5 menit).*

> **Catatan:** Kolom `Saldo (Rp) Saat Ini` **selalu dihitung ulang secara real-time** saat kartu konfirmasi dikirimkan ke Tuan (bukan nilai statis).

### Mekanisme Interceptor (Menangkap Balasan Tuan)
Semua balasan Tuan dicegat (*intercept*) **SEBELUM** dipikirkan sebagai topik obrolan baru oleh AI Router.

**Skenario Balasan Tuan:**
1. **Konfirmasi Langsung ("ya", "catat", "oke", "gas", "masukkan"):**
   N.E.X.A segera mengeluarkan data dari ruang tunggu dan mencatatnya ke baris baru di Google Sheets.
2. **Pembatalan ("batal", "tidak", "jangan", "hapus"):**
   N.E.X.A membatalkan transaksi dan membersihkannya dari ruang tunggu.
3. **Penambahan Detail / Deskripsi ("untuk beli soto bro", "buat bayar listrik"):**
   N.E.X.A menyimpan teks tersebut sebagai `Catatan/Detail`, sekaligus **menebak ulang kategori** berdasarkan deskripsi yang diberikan. Kartu konfirmasi dikirim ulang dengan data yang sudah diperbarui. Timer 5 menit di-reset ulang dari awal.
4. **Koreksi Kategori ("kategorinya amal", "kategori: transportasi"):**
   N.E.X.A mendeteksi kata kunci "kategorinya/kategori:" dan mengubah kategori sesuai instruksi. Kartu konfirmasi dikirim ulang.

---

## 5. Skenario Ekstrem & Self-Healing (Kemampuan Pemulihan)

### Skenario A: Tuan Tidak Membalas Selama 5 Menit (Timeout)
Fungsi otomatis akan berjalan. N.E.X.A akan:
1. Membaca nama *Merchant* / tujuan transfer.
2. Menggunakan AI Router untuk **menebak kategori** secara cerdas.
3. Menyimpan ke Google Sheets dengan kolom `No` diisi `[Auto]`.
4. Mengirim notifikasi ke Telegram: *"⏳ Waktu habis. Transaksi Rp13.000 telah disimpan otomatis. Kategori AI: Makanan dan minuman."*

### Skenario B: Server Restart Saat Menunggu Konfirmasi
Jika peladen (Hugging Face) restart, RAM terhapus. Ketika Tuan membalas, interceptor akan:
1. Cek RAM → kosong.
2. **Fallback ke Supabase** secara otomatis.
3. Menemukan transaksi yang usianya < 5 menit → **bangkitkan ulang ke RAM**.
4. Balasan Tuan tetap diproses seolah server tidak pernah restart.

### Skenario C: Timeout + Server Sedang Mati
**Watchdog** di `cron.js` berpatroli setiap **90 detik**. Jika menemukan transaksi menggantung berusia > 5 menit di Supabase, Watchdog mengambil alih: menebak kategori → simpan ke Sheets → bersihkan Supabase.

---

## Kesimpulan UX (Pengalaman Pengguna)
Tuan Faqih bisa:
1. Membayar di kasir Livin' tanpa menyentuh Telegram — N.E.X.A mencatat otomatis.
2. Jika ingin rapi, balas pesan N.E.X.A dengan santai ("buat beli makan siang") → kartu diperbarui otomatis.
3. Jika sibuk/lelah, abaikan → N.E.X.A menyimpan otomatis dengan kategori tebakan AI.
4. Tidak ada duplikat, tidak ada transaksi hilang meski server mati.