# 📋 Rencana Implementasi: Transfer Antar-Akun dengan Biaya Admin Otomatis (Opsi B)

**Status:** PROPOSED / READY FOR REVIEW  
**Tipe Solusi:** Opsi B (Pasangan Transfer + Catatan Pengeluaran Biaya Admin Otomatis)  
**Tujuan:** Memungkinkan pencatatan transfer dengan biaya admin secara instan dari satu kalimat natural (misal: *"aku transfer 500.000 dari Bank Mandiri ke Dana dengan admin 2.000"*), yang secara otomatis menghasilkan 3 blok transaksi terikat dengan deskripsinya masing-masing.

---

## 1. Arsitektur 3 Blok Transaksi & Deskripsi Mandiri

Setiap kali transfer dengan biaya admin dicatat, sistem akan membuat 3 baris mutasi di Supabase yang terikat dengan satu `split_group_id` yang sama:

| No | Akun | Tipe Transaksi | Split Label | Nominal | Kategori | Deskripsi Mandiri |
| :-: | :--- | :--- | :--- | :---: | :--- | :--- |
| **1** | **Bank Mandiri** *(Asal)* | `transfer` | `transfer_out` | `Rp500.000` | Pengeluaran tidak tercatat | `Transfer ke Dana` *(atau `Transfer ke Dana: [catatan]`)* |
| **2** | **Dana** *(Tujuan)* | `transfer` | `transfer_in` | `+Rp500.000` | Pengeluaran tidak tercatat | `Transfer dari Bank Mandiri` *(atau `Transfer dari Bank Mandiri: [catatan]`)* |
| **3** | **Bank Mandiri** *(Asal)* | `expense` | `admin_fee` | `Rp2.000` | `Biaya Admin / Layanan` | `Biaya admin transfer ke Dana` *(atau `Biaya admin transfer ke Dana: [catatan]`)* |

### Dampak Matematis:
* **Saldo Bank Mandiri:** Terpotong tepat `Rp502.000` (`500.000 + 2.000`).
* **Saldo Dana:** Bertambah tepat `Rp500.000`.
* **Total Aset Bersih (*Net Worth*):** Berkurang tepat `Rp2.000`.
* **Analitik Pengeluaran Bulanan:** Tercatat pengeluaran riil `Rp2.000` pada kategori resmi **`Biaya Admin / Layanan`**.

---

## 2. Rincian Modul yang Akan Dimodifikasi

### A. Router & Prompts (`src/core/router/Router_Prompts.js` & `Router_Classifier.js`)
* Tambahkan field `admin_fee: number` pada skema JSON intent `FINANCE`.
* Tambahkan aturan dan contoh beberapa variasi pada prompt:
  - *"transfer 500rb dari mandiri ke dana admin 2000"* $\rightarrow$ `action="RECORD"`, `type="TRANSFER"`, `nominal=500000`, `admin_fee=2000`, `from_account="Bank Mandiri"`, `to_account="Dana"`.
  - *"tf jago ke spay 10rb biaya 1000"* $\rightarrow$ `admin_fee=1000`.

### B. Handler Layer (`src/interfaces/common/handlers/finance_handler.js`)
* Ekstrak `adminFee` dari `ed.admin_fee || ed.adminFee`.
* Pasang *regex fallback parser* jika AI melewatkan angka admin:
  `/(?:biaya\s*admin|biaya\s*transfer|admin|biaya|adm|fee)\s*(?:sebesar|sejumlah|rp\.?)?\s*([0-9][0-9\.\,]*\s*(?:k|rb|ribu)?)/i`
* Teruskan `adminFee` ke dalam `txData` yang dikirim ke `requestTransactionConfirmation`.

### C. Konfirmasi Transaksi (`src/domain/finance/Finance_Confirmations.js`)
* Dukung `tx.adminFee` di `requestTransactionConfirmation`.
* Di fungsi `_buildConfirmationMessage`, perbarui kartu preview:
  - Tampilkan rincian:
    - **Nominal Transfer:** `Rp500.000`
    - **Biaya Admin:** `Rp2.000`
    - **Sumber:** `Bank Mandiri (-Rp502.000)`
    - **Tujuan:** `Dana (+Rp500.000)`
  - Rincian saldo saat ini untuk kedua akun.
* Di fungsi `updatePendingTransaction`, dukung jika Tuan mengoreksi admin fee di chat (misal: *"adminnya 2500"* atau *"tanpa admin"*).
* Saat konfirmasi/auto-save dipanggil, teruskan `adminFee` ke `supabaseFinance.writeTransferPair`.

### D. Database Layer (`src/infrastructure/finance_db/transactions.js`)
* Perbarui `writeTransferPair({ fromAccountName, toAccountName, nominal, adminFee = 0, description, dateISO, timeHHMM })`:
  1. Cari `categoryId` untuk transfer: `'Pengeluaran tidak tercatat '`.
  2. Jika `adminFee > 0`, cari `adminCategoryId` untuk kategori: `'Biaya Admin / Layanan'`.
  3. Generate `pairId = crypto.randomUUID()`.
  4. Siapkan deskripsi mandiri:
     - Out: `userCustomDesc ? "Transfer ke " + toAccountName + ": " + userCustomDesc : "Transfer ke " + toAccountName`
     - In: `userCustomDesc ? "Transfer dari " + fromAccountName + ": " + userCustomDesc : "Transfer dari " + fromAccountName`
     - Admin: `userCustomDesc ? "Biaya admin transfer ke " + toAccountName + " (" + userCustomDesc + ")" : "Biaya admin transfer ke " + toAccountName`
  5. Buat 3 rows (Row 1: transfer_out `nominal`, Row 2: transfer_in `nominal`, Row 3: expense `adminFee`).
  6. Insert secara bersamaan ke tabel `transactions` Supabase.

### E. Koreksi / Pembatalan Terikat (`src/infrastructure/finance_db/transactions.js` & `Finance_Corrections.js`)
* Perbarui `deleteTransaction`: jika transaksi yang dihapus memiliki `split_group_id`, hapus seluruh mutasi saudara (*sibling transactions*) yang memiliki `split_group_id` yang sama sehingga transfer dan biaya admin terhapus bersih secara atomik.

---

## 3. Rencana Pengujian (Testing Plan)

1. **Unit Test `writeTransferPair` dengan `adminFee`**:
   - Memastikan saat transfer Rp500.000 + admin Rp2.000, terbuat 3 row di database.
   - Memastikan row 1 bernilai 500.000, row 2 bernilai 500.000, row 3 bernilai 2.000 bertipe `expense` dengan kategori `Biaya Admin / Layanan`.
   - Memastikan ketiga row memiliki `split_group_id` yang sama.
2. **Unit Test Saldo Akun (`getAccountBalances`)**:
   - Memverifikasi akun sumber terpotong Rp502.000 dan akun tujuan bertambah Rp500.000.
3. **Unit Test Regex Fallback & AI Routing**:
   - Menguji berbagai variasi input Tuan:
     - *"aku transfer 500.000 dari Bank Mandiri ke Dana dengan admin 2.000"*
     - *"tf dari jago ke spay 10rb admin 1000"*
     - *"transfer 100k mandiri ke dana biaya admin 2500 buat bayar listrik"*
4. **Verifikasi Test Suite**:
   - Menjalankan `npm test` untuk memastikan seluruh 457 test tetap lulus tanpa regresi.

---

Dokumen ini siap dieksekusi setelah Tuan memberikan persetujuan!
