# Panduan Arsitektur & Alur Keuangan N.E.X.A

Dokumen ini menjelaskan secara menyeluruh (*Deep Dive*) bagaimana "Otak Keuangan" N.E.X.A bekerja, dari hulu (input masuk) hingga hilir (penyimpanan ke Google Sheets), termasuk penanganan berbagai skenario ekstrem (seperti peladen mati, pesan duplikat, dan tebakan kecerdasan buatan).

---

## 1. Sumber Input (Multi-Channel Intake)
N.E.X.A mampu menangkap transaksi dari berbagai jalur secara bersamaan:
1. **Otomatis via Livin' (Gmail Polling/Tasker):** Setiap ada transfer/pembayaran dari Mandiri Livin', email notifikasi ditangkap oleh n8n/Tasker dan diteruskan ke webhook N.E.X.A, atau N.E.X.A melakukan *polling* otomatis ke Gmail.
2. **Manual Teks (Telegram):** Tuan mengetik langsung (misal: "Catat pengeluaran 15rb buat beli soto").
3. **Voice Note (Telegram):** Melalui *6-Tier God Mode Voice Engine*, N.E.X.A mentranskrip suara Tuan menjadi teks.
4. **Foto/Struk (Telegram):** Melalui *11-Tier Vision Engine*, N.E.X.A membaca rincian struk belanja atau tangkapan layar transfer.

---

## 2. Pemrosesan Awal & Ekstraksi Data (AI Router)
Semua input mentah akan dilempar ke `AI_Router` untuk diekstrak menjadi format JSON terstruktur:
- **Nominal:** Dikonversi ke angka absolut.
- **Tipe:** Pemasukan atau Pengeluaran.
- **Waktu:** N.E.X.A akan menggunakan waktu saat pesan masuk. **TETAPI**, jika Tuan memberi keterangan waktu (misal: "kemarin", "tadi malam", "jam 2 siang tadi"), N.E.X.A akan menghitung mundur dan menyesuaikan jam/tanggalnya secara cerdas. Jika Tuan menyebut tanggal tanpa jam (misal: "tanggal 5 kemarin"), N.E.X.A akan menghentikan proses dan membalas untuk menanyakan *"Jam berapa transaksinya?"* (Status `INCOMPLETE_INFO`).
- **Kategori & Catatan:** N.E.X.A mencoba menebak kategori dari 70+ kategori *default*. Jika tidak ada keterangan (hanya nominal dan tujuan), catatan diset ke `[Menunggu Detail User]`.

---

## 3. Zero-Duplication Engine (Pencegah Duplikat)
Sebelum sebuah transaksi diproses lebih lanjut, N.E.X.A membuat **Composite Key** (Kunci Unik) yang terdiri dari `Nominal + Tujuan/Merchant` (contoh: `13000_waroengemdje`).
N.E.X.A mengecek database (`nexa_finance_dedup`):
- Jika transaksi otomatis (Livin') ini **sudah pernah masuk** di hari/jam yang berdekatan, transaksi akan langsung **dibuang/diabaikan** tanpa mengganggu Tuan.

---

## 4. Sistem Konfirmasi Tertunda (The 5-Minute Window)
N.E.X.A tidak pernah asal mencatat data buta ke dalam Google Sheets. Jika input lolos pengecekan duplikat, N.E.X.A akan meletakkannya di **Ruang Tunggu (Pending Confirmations)** di RAM dan disalin ke database Supabase.

N.E.X.A kemudian mengirim kartu konfirmasi ke Telegram Tuan:

> 💸 **TRANSAKSI LIVIN TERBARU**
> 
> **No:** [Auto]
> **Tanggal:** 15 Mei 2026
> **Waktu:** 15.37
> **Tipe:** Pengeluaran
> **Kategori:** [Auto-AI]
> **Akun:** Bank Mandiri Livin
> **Catatan / Detail:** [KOSONG - Tujuan: Waroeng Emdje]
> **Nominal (Rp):** Rp13.000
> **Saldo (Rp) Saat Ini:** Rp4,019
> 
> ❓ **N.E.X.A mencatat pengeluaran ke Waroeng Emdje.**
> Tuan, uang ini digunakan untuk keperluan apa ya? *(Tanpa balasan, N.E.X.A akan menebak kategorinya dalam 5 menit).*

### Mekanisme Interceptor (Menangkap Balasan Tuan)
Ketika transaksi sedang di Ruang Tunggu (maksimal 5 menit), sistem masuk ke status bersiaga. Apapun balasan Tuan selanjutnya akan dicegat (*intercept*) oleh N.E.X.A **sebelum** dipikirkan sebagai topik obrolan baru.

**Skenario Balasan Tuan:**
1. **Konfirmasi Langsung ("ya", "catat", "oke", "gas"):**
   N.E.X.A segera mengeluarkan data dari ruang tunggu, menghitung saldo, dan mencatatnya ke baris Google Sheets.
2. **Pembatalan ("batal", "tidak", "jangan", "hapus"):**
   N.E.X.A membatalkan transaksi dan menghapusnya dari ruang tunggu.
3. **Koreksi / Penambahan Detail ("untuk beli soto bro", "salah, itu 15rb", "kategorinya amal"):**
   N.E.X.A akan memperbarui memori yang tertunda dengan deskripsi baru. Kartu konfirmasi di atas akan dikirim ulang dengan `Catatan / Detail` yang sudah Tuan sebutkan. Waktu hitung mundur 5 menit di-reset ulang dari awal.

---

## 5. Skenario Ekstrem & Self-Healing (Kemampuan Pemulihan)

Apa yang terjadi jika hal tak terduga terjadi saat transaksi sedang berada di Ruang Tunggu?

### Skenario A: Tuan Tidak Membalas Selama 5 Menit (Timeout)
Jika Tuan sedang sibuk (rapat/tidur) dan mengabaikan kartu konfirmasi, fungsi otomatis (*timeout*) akan berjalan. N.E.X.A akan:
1. Membaca nama *Merchant* / Tujuan transfer.
2. Menggunakan AI Router untuk **menebak secara cerdas** apa kategori transaksi tersebut. (Misal: Jika tujuannya "Steam", dikategorikan "Perangkat lunak, aplikasi, permainan". Jika "Indomaret", dikategorikan "Bahan makanan").
3. Menyimpan otomatis ke Google Sheets.
4. Mengirim notifikasi: *"⏳ Waktu habis. Transaksi Rp13.000 telah disimpan otomatis."*

### Skenario B: Server Mati/Restart Saat Menunggu Konfirmasi (Fatal Crash)
Inilah letak kecanggihan N.E.X.A. Jika peladen (Hugging Face) tiba-tiba mati karena kehabisan RAM atau *restart*, ruang tunggu di RAM akan terhapus. Tuan membalas "untuk beli soto", tapi peladen baru saja nyala dan tidak tahu ada transaksi yang menunggu.
**Cara N.E.X.A Mengatasinya:**
- Saat fungsi *interceptor* berjalan, ia akan mengecek RAM. Jika kosong, ia bersifat *Async* dan **langsung mengecek ke *database* Supabase**. 
- Jika di Supabase ada transaksi yang usianya masih di bawah 5 menit, N.E.X.A akan **membangkitkan (re-register)** transaksi tersebut kembali ke RAM.
- Balasan "untuk beli soto" Tuan tetap berhasil memperbarui catatan transaksi secara ajaib tanpa menimbulkan *error* duplikat.

### Skenario C: Timeout Tapi Server Sedang Mati
Jika waktu 5 menit habis tapi peladen sedang mati (sehingga *timeout* gagal terpicu), N.E.X.A memiliki fitur **Watchdog (Anjing Penjaga)** di modul `cron.js`.
Setiap 90 detik, Watchdog akan berpatroli ke database Supabase. Jika ia menemukan transaksi menggantung yang usianya sudah lebih dari 5 menit, Watchdog akan mengambil alih, menebak kategorinya, menyimpan ke Google Sheets secara paksa, dan membersihkan database Supabase.

---

## Kesimpulan UX (Pengalaman Pengguna)
Dengan arsitektur ini, N.E.X.A bertindak seolah ia tidak pernah mati. Tuan Faqih bisa:
1. Membayar Livin' di kasir tanpa harus membuka Telegram.
2. Jika Tuan mau transaksinya rapi, Tuan cukup membalas pesan N.E.X.A dengan santai ("buat bayar kos", "beli makan siang").
3. Jika Tuan lelah atau sibuk, abaikan saja pesannya. N.E.X.A akan merapikan dan memasukkannya sendiri.
4. Semua duplikasi, kesalahan jaringan, atau *crash* server ditangani sepenuhnya di latar belakang. Anda hanya melihat hasil akhirnya: Laporan Keuangan yang selalu seimbang (*Balance*).