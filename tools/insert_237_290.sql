BEGIN;

-- No. 237: 2026-05-15 | Bahan makanan | Rp19000
INSERT INTO transactions (account_id, category_id, amount, type, transaction_date, transaction_time, description, payment_method)
SELECT
  (SELECT id FROM accounts WHERE lower(name) LIKE lower('%Bank Mandiri%') LIMIT 1),
  (SELECT id FROM categories WHERE lower(name) LIKE lower('%Bahan makanan%') AND type='expense' LIMIT 1),
  19000,
  'expense',
  '2026-05-15',
  '18:26:00',
  'untuk pembelian 7 buah mie instan',
  NULL;

-- No. 238: 2026-05-16 | Transportasi | Rp7000
INSERT INTO transactions (account_id, category_id, amount, type, transaction_date, transaction_time, description, payment_method)
SELECT
  (SELECT id FROM accounts WHERE lower(name) LIKE lower('%Bank Mandiri%') LIMIT 1),
  (SELECT id FROM categories WHERE lower(name) LIKE lower('%Transportasi%') AND type='expense' LIMIT 1),
  7000,
  'expense',
  '2026-05-16',
  '08:14:00',
  '[Menunggu Detail User]',
  NULL;

-- No. 239: 2026-05-16 | Makanan dan minuman | Rp15000
INSERT INTO transactions (account_id, category_id, amount, type, transaction_date, transaction_time, description, payment_method)
SELECT
  (SELECT id FROM accounts WHERE lower(name) LIKE lower('%Bank Mandiri%') LIMIT 1),
  (SELECT id FROM categories WHERE lower(name) LIKE lower('%Makanan dan minuman%') AND type='expense' LIMIT 1),
  15000,
  'expense',
  '2026-05-16',
  '15:21:00',
  'Untuk makan siangan eksa',
  NULL;

-- No. 240: 2026-05-17 | Lainnya | Rp8000
INSERT INTO transactions (account_id, category_id, amount, type, transaction_date, transaction_time, description, payment_method)
SELECT
  (SELECT id FROM accounts WHERE lower(name) LIKE lower('%Bank Mandiri%') LIMIT 1),
  (SELECT id FROM categories WHERE lower(name) LIKE lower('%Lainnya%') AND type='expense' LIMIT 1),
  8000,
  'expense',
  '2026-05-17',
  '09:26:00',
  'Untuk beli ayam geprek',
  NULL;

-- No. 241: 2026-05-18 | Transportasi | Rp6000
INSERT INTO transactions (account_id, category_id, amount, type, transaction_date, transaction_time, description, payment_method)
SELECT
  (SELECT id FROM accounts WHERE lower(name) LIKE lower('%Bank Mandiri%') LIMIT 1),
  (SELECT id FROM categories WHERE lower(name) LIKE lower('%Transportasi%') AND type='expense' LIMIT 1),
  6000,
  'expense',
  '2026-05-18',
  '07:57:00',
  'SSNU',
  NULL;

-- No. 242: 2026-05-18 | Alat tulis, peralatan | Rp4500
INSERT INTO transactions (account_id, category_id, amount, type, transaction_date, transaction_time, description, payment_method)
SELECT
  (SELECT id FROM accounts WHERE lower(name) LIKE lower('%Bank Mandiri%') LIMIT 1),
  (SELECT id FROM categories WHERE lower(name) LIKE lower('%Alat tulis, peralatan%') AND type='expense' LIMIT 1),
  4500,
  'expense',
  '2026-05-18',
  '11:10:00',
  'pengeluaran ke AMIRA FOTOCOPY Sleman',
  NULL;

-- No. 243: 2026-05-18 | Lainnya | Rp22000
INSERT INTO transactions (account_id, category_id, amount, type, transaction_date, transaction_time, description, payment_method)
SELECT
  (SELECT id FROM accounts WHERE lower(name) LIKE lower('%Bank Mandiri%') LIMIT 1),
  (SELECT id FROM categories WHERE lower(name) LIKE lower('%Lainnya%') AND type='expense' LIMIT 1),
  22000,
  'expense',
  '2026-05-18',
  '20:20:00',
  'pengeluaran ke Bakmi Jowo Khas Semarang SLEMAN - ID Tanggal 18 Mei 2026 ',
  NULL;

-- No. 244: 2026-05-18 | Pinjaman, bunga | Rp150000
INSERT INTO transactions (account_id, category_id, amount, type, transaction_date, transaction_time, description, payment_method)
SELECT
  (SELECT id FROM accounts WHERE lower(name) LIKE lower('%Bank Mandiri%') LIMIT 1),
  (SELECT id FROM categories WHERE lower(name) LIKE lower('%Pinjaman, bunga%') AND type='expense' LIMIT 1),
  150000,
  'expense',
  '2026-05-18',
  '21:01:00',
  'Menghutangi aji',
  NULL;

-- No. 245: 2026-05-19 | Lainnya | Rp10000
INSERT INTO transactions (account_id, category_id, amount, type, transaction_date, transaction_time, description, payment_method)
SELECT
  (SELECT id FROM accounts WHERE lower(name) LIKE lower('%Bank Mandiri%') LIMIT 1),
  (SELECT id FROM categories WHERE lower(name) LIKE lower('%Lainnya%') AND type='expense' LIMIT 1),
  10000,
  'expense',
  '2026-05-19',
  '09:04:00',
  'pengeluaran ke nieta kitchen Sleman',
  NULL;

-- No. 246: 2026-05-19 | Makanan dan minuman | Rp5000
INSERT INTO transactions (account_id, category_id, amount, type, transaction_date, transaction_time, description, payment_method)
SELECT
  (SELECT id FROM accounts WHERE lower(name) LIKE lower('%Bank Mandiri%') LIMIT 1),
  (SELECT id FROM categories WHERE lower(name) LIKE lower('%Makanan dan minuman%') AND type='expense' LIMIT 1),
  5000,
  'expense',
  '2026-05-19',
  '10:49:00',
  'Beli tahu di kantin',
  NULL;

-- No. 247: 2026-05-19 | Makanan dan minuman | Rp30000
INSERT INTO transactions (account_id, category_id, amount, type, transaction_date, transaction_time, description, payment_method)
SELECT
  (SELECT id FROM accounts WHERE lower(name) LIKE lower('%Bank Mandiri%') LIMIT 1),
  (SELECT id FROM categories WHERE lower(name) LIKE lower('%Makanan dan minuman%') AND type='expense' LIMIT 1),
  30000,
  'expense',
  '2026-05-19',
  '19:51:00',
  'pengeluaran ke Duta Minang Family Jakal Sleman',
  NULL;

-- No. 248: 2026-05-19 | Lainnya | Rp10000
INSERT INTO transactions (account_id, category_id, amount, type, transaction_date, transaction_time, description, payment_method)
SELECT
  (SELECT id FROM accounts WHERE lower(name) LIKE lower('%Bank Mandiri%') LIMIT 1),
  (SELECT id FROM categories WHERE lower(name) LIKE lower('%Lainnya%') AND type='expense' LIMIT 1),
  10000,
  'expense',
  '2026-05-19',
  '22:19:00',
  'beli soto',
  NULL;

-- No. 249: 2026-05-20 | Makanan dan minuman | Rp15475
INSERT INTO transactions (account_id, category_id, amount, type, transaction_date, transaction_time, description, payment_method)
SELECT
  (SELECT id FROM accounts WHERE lower(name) LIKE lower('%Bank Mandiri%') LIMIT 1),
  (SELECT id FROM categories WHERE lower(name) LIKE lower('%Makanan dan minuman%') AND type='expense' LIMIT 1),
  15475,
  'expense',
  '2026-05-20',
  '09:41:00',
  'pengeluaran ke GRAB FOOD Jakarta Selatan',
  'QRIS';

-- No. 250: 2026-05-20 | Makanan dan minuman | Rp13000
INSERT INTO transactions (account_id, category_id, amount, type, transaction_date, transaction_time, description, payment_method)
SELECT
  (SELECT id FROM accounts WHERE lower(name) LIKE lower('%Bank Mandiri%') LIMIT 1),
  (SELECT id FROM categories WHERE lower(name) LIKE lower('%Makanan dan minuman%') AND type='expense' LIMIT 1),
  13000,
  'expense',
  '2026-05-20',
  '15:45:00',
  'Beli makan nasi sayur',
  NULL;

-- No. 251: 2026-05-20 | Transportasi | Rp5000
INSERT INTO transactions (account_id, category_id, amount, type, transaction_date, transaction_time, description, payment_method)
SELECT
  (SELECT id FROM accounts WHERE lower(name) LIKE lower('%Bank Mandiri%') LIMIT 1),
  (SELECT id FROM categories WHERE lower(name) LIKE lower('%Transportasi%') AND type='expense' LIMIT 1),
  5000,
  'expense',
  '2026-05-20',
  '16:06:00',
  'Transportasi ke takom',
  NULL;

-- No. 252: 2026-05-20 | Makanan dan minuman | Rp23000
INSERT INTO transactions (account_id, category_id, amount, type, transaction_date, transaction_time, description, payment_method)
SELECT
  (SELECT id FROM accounts WHERE lower(name) LIKE lower('%Bank Mandiri%') LIMIT 1),
  (SELECT id FROM categories WHERE lower(name) LIKE lower('%Makanan dan minuman%') AND type='expense' LIMIT 1),
  23000,
  'expense',
  '2026-05-20',
  '18:39:00',
  'Beli mie instan dan kopi di takom',
  NULL;

-- No. 253: 2026-05-20 | Lainnya | Rp14000
INSERT INTO transactions (account_id, category_id, amount, type, transaction_date, transaction_time, description, payment_method)
SELECT
  (SELECT id FROM accounts WHERE lower(name) LIKE lower('%Bank Mandiri%') LIMIT 1),
  (SELECT id FROM categories WHERE lower(name) LIKE lower('%Lainnya%') AND type='expense' LIMIT 1),
  14000,
  'expense',
  '2026-05-20',
  '22:24:00',
  'Beli nasi Padang',
  NULL;

-- No. 254: 2026-05-21 | Lainnya | Rp11000
INSERT INTO transactions (account_id, category_id, amount, type, transaction_date, transaction_time, description, payment_method)
SELECT
  (SELECT id FROM accounts WHERE lower(name) LIKE lower('%Bank Mandiri%') LIMIT 1),
  (SELECT id FROM categories WHERE lower(name) LIKE lower('%Lainnya%') AND type='expense' LIMIT 1),
  11000,
  'expense',
  '2026-05-21',
  '08:55:00',
  'pengeluaran ke nieta kitchen Sleman',
  NULL;

-- No. 255: 2026-05-21 | Makanan dan minuman | Rp4000
INSERT INTO transactions (account_id, category_id, amount, type, transaction_date, transaction_time, description, payment_method)
SELECT
  (SELECT id FROM accounts WHERE lower(name) LIKE lower('%Bank Mandiri%') LIMIT 1),
  (SELECT id FROM categories WHERE lower(name) LIKE lower('%Makanan dan minuman%') AND type='expense' LIMIT 1),
  4000,
  'expense',
  '2026-05-21',
  '09:08:00',
  'Beli Ades 600 ml (Dharma Wanita)',
  NULL;

-- No. 256: 2026-05-21 | Makanan dan minuman | Rp13000
INSERT INTO transactions (account_id, category_id, amount, type, transaction_date, transaction_time, description, payment_method)
SELECT
  (SELECT id FROM accounts WHERE lower(name) LIKE lower('%Bank Mandiri%') LIMIT 1),
  (SELECT id FROM categories WHERE lower(name) LIKE lower('%Makanan dan minuman%') AND type='expense' LIMIT 1),
  13000,
  'expense',
  '2026-05-21',
  '13:05:00',
  'Jajan pangsit Chili oil',
  NULL;

-- No. 257: 2026-05-21 | Lainnya | Rp10000
INSERT INTO transactions (account_id, category_id, amount, type, transaction_date, transaction_time, description, payment_method)
SELECT
  (SELECT id FROM accounts WHERE lower(name) LIKE lower('%Bank Mandiri%') LIMIT 1),
  (SELECT id FROM categories WHERE lower(name) LIKE lower('%Lainnya%') AND type='expense' LIMIT 1),
  10000,
  'expense',
  '2026-05-21',
  '15:36:00',
  'nge gym',
  NULL;

-- No. 258: 2026-05-21 | Makanan dan minuman | Rp9000
INSERT INTO transactions (account_id, category_id, amount, type, transaction_date, transaction_time, description, payment_method)
SELECT
  (SELECT id FROM accounts WHERE lower(name) LIKE lower('%Bank Mandiri%') LIMIT 1),
  (SELECT id FROM categories WHERE lower(name) LIKE lower('%Makanan dan minuman%') AND type='expense' LIMIT 1),
  9000,
  'expense',
  '2026-05-21',
  '17:20:00',
  'Makan nasi sayur krupuk',
  NULL;

-- No. 259: 2026-05-22 | Alkohol, tembakau | Rp12500
INSERT INTO transactions (account_id, category_id, amount, type, transaction_date, transaction_time, description, payment_method)
SELECT
  (SELECT id FROM accounts WHERE lower(name) LIKE lower('%Bank Mandiri%') LIMIT 1),
  (SELECT id FROM categories WHERE lower(name) LIKE lower('%Alkohol, tembakau%') AND type='expense' LIMIT 1),
  12500,
  'expense',
  '2026-05-22',
  '16:50:00',
  'beli rokok 2 batang',
  NULL;

-- No. 260: 2026-05-22 | Lainnya | Rp15475
INSERT INTO transactions (account_id, category_id, amount, type, transaction_date, transaction_time, description, payment_method)
SELECT
  (SELECT id FROM accounts WHERE lower(name) LIKE lower('%Bank Mandiri%') LIMIT 1),
  (SELECT id FROM categories WHERE lower(name) LIKE lower('%Lainnya%') AND type='expense' LIMIT 1),
  15475,
  'expense',
  '2026-05-22',
  '13:57:00',
  'pengeluaran ke GRAB FOOD Jakarta Selatan',
  'QRIS';

-- No. 261: 2026-05-22 | Lainnya | Rp6000
INSERT INTO transactions (account_id, category_id, amount, type, transaction_date, transaction_time, description, payment_method)
SELECT
  (SELECT id FROM accounts WHERE lower(name) LIKE lower('%Bank Mandiri%') LIMIT 1),
  (SELECT id FROM categories WHERE lower(name) LIKE lower('%Lainnya%') AND type='expense' LIMIT 1),
  6000,
  'expense',
  '2026-05-22',
  '11:41:00',
  'pengeluaran ke GRAB TRANSPORT Jakarta Selatan',
  'QRIS';

-- No. 262: 2026-05-22 | Lainnya | Rp12000
INSERT INTO transactions (account_id, category_id, amount, type, transaction_date, transaction_time, description, payment_method)
SELECT
  (SELECT id FROM accounts WHERE lower(name) LIKE lower('%Bank Mandiri%') LIMIT 1),
  (SELECT id FROM categories WHERE lower(name) LIKE lower('%Lainnya%') AND type='expense' LIMIT 1),
  12000,
  'expense',
  '2026-05-22',
  '08:45:00',
  'pengeluaran ke Waroeng Emdje',
  NULL;

-- No. 263: 2026-05-22 | Perawatan diri | Rp20000
INSERT INTO transactions (account_id, category_id, amount, type, transaction_date, transaction_time, description, payment_method)
SELECT
  (SELECT id FROM accounts WHERE lower(name) LIKE lower('%Bank Mandiri%') LIMIT 1),
  (SELECT id FROM categories WHERE lower(name) LIKE lower('%Perawatan diri%') AND type='expense' LIMIT 1),
  20000,
  'expense',
  '2026-05-22',
  '20:29:00',
  'pengeluaran ke ACE BABERSHOP SLEMAN',
  NULL;

-- No. 264: 2026-05-22 | Restoran, makanan cepat saji | Rp28000
INSERT INTO transactions (account_id, category_id, amount, type, transaction_date, transaction_time, description, payment_method)
SELECT
  (SELECT id FROM accounts WHERE lower(name) LIKE lower('%Bank Mandiri%') LIMIT 1),
  (SELECT id FROM categories WHERE lower(name) LIKE lower('%Restoran, makanan cepat saji%') AND type='expense' LIMIT 1),
  28000,
  'expense',
  '2026-05-22',
  '20:34:00',
  'pengeluaran ke RM. PADANG PERGAULAN SLEMAN',
  NULL;

-- No. 265: 2026-05-22 | Pinjaman, bunga | Rp25000
INSERT INTO transactions (account_id, category_id, amount, type, transaction_date, transaction_time, description, payment_method)
SELECT
  (SELECT id FROM accounts WHERE lower(name) LIKE lower('%Bank Mandiri%') LIMIT 1),
  (SELECT id FROM categories WHERE lower(name) LIKE lower('%Pinjaman, bunga%') AND type='expense' LIMIT 1),
  25000,
  'expense',
  '2026-05-22',
  '21:44:00',
  'Manghutangi aji',
  NULL;

-- No. 266: 2026-05-22 | Pinjaman, bunga | Rp27500
INSERT INTO transactions (account_id, category_id, amount, type, transaction_date, transaction_time, description, payment_method)
SELECT
  (SELECT id FROM accounts WHERE lower(name) LIKE lower('%Bank Mandiri%') LIMIT 1),
  (SELECT id FROM categories WHERE lower(name) LIKE lower('%Pinjaman, bunga%') AND type='expense' LIMIT 1),
  27500,
  'expense',
  '2026-05-22',
  '21:44:00',
  'Untuk menghutangi aji',
  NULL;

-- No. 267: 2026-05-23 | Restoran, makanan cepat saji | Rp15475
INSERT INTO transactions (account_id, category_id, amount, type, transaction_date, transaction_time, description, payment_method)
SELECT
  (SELECT id FROM accounts WHERE lower(name) LIKE lower('%Bank Mandiri%') LIMIT 1),
  (SELECT id FROM categories WHERE lower(name) LIKE lower('%Restoran, makanan cepat saji%') AND type='expense' LIMIT 1),
  15475,
  'expense',
  '2026-05-23',
  '10:08:00',
  'Beli mie ayam',
  NULL;

-- No. 268: 2026-05-23 | Makanan dan minuman | Rp15000
INSERT INTO transactions (account_id, category_id, amount, type, transaction_date, transaction_time, description, payment_method)
SELECT
  (SELECT id FROM accounts WHERE lower(name) LIKE lower('%Bank Mandiri%') LIMIT 1),
  (SELECT id FROM categories WHERE lower(name) LIKE lower('%Makanan dan minuman%') AND type='expense' LIMIT 1),
  15000,
  'expense',
  '2026-05-23',
  '17:09:00',
  'beli batagor dan bayar bensin buat hasan',
  NULL;

-- No. 269: 2026-05-23 | Makanan dan minuman | Rp14000
INSERT INTO transactions (account_id, category_id, amount, type, transaction_date, transaction_time, description, payment_method)
SELECT
  (SELECT id FROM accounts WHERE lower(name) LIKE lower('%Bank Mandiri%') LIMIT 1),
  (SELECT id FROM categories WHERE lower(name) LIKE lower('%Makanan dan minuman%') AND type='expense' LIMIT 1),
  14000,
  'expense',
  '2026-05-23',
  '21:43:00',
  'Beli naspad',
  NULL;

-- No. 270: 2026-05-23 | Elektronik, aksesoris | Rp2102500
INSERT INTO transactions (account_id, category_id, amount, type, transaction_date, transaction_time, description, payment_method)
SELECT
  (SELECT id FROM accounts WHERE lower(name) LIKE lower('%Bank Mandiri%') LIMIT 1),
  (SELECT id FROM categories WHERE lower(name) LIKE lower('%Elektronik, aksesoris%') AND type='expense' LIMIT 1),
  2102500,
  'expense',
  '2026-05-23',
  '22:25:00',
  'Untuk COD HP Samsung terbaru',
  NULL;

-- No. 271: 2026-05-24 | Alkohol, tembakau | Rp5500
INSERT INTO transactions (account_id, category_id, amount, type, transaction_date, transaction_time, description, payment_method)
SELECT
  (SELECT id FROM accounts WHERE lower(name) LIKE lower('%Bank Mandiri%') LIMIT 1),
  (SELECT id FROM categories WHERE lower(name) LIKE lower('%Alkohol, tembakau%') AND type='expense' LIMIT 1),
  5500,
  'expense',
  '2026-05-24',
  '17:10:00',
  'Beli rokok dua batang',
  NULL;

-- No. 272: 2026-05-24 | Makanan dan minuman | Rp12000
INSERT INTO transactions (account_id, category_id, amount, type, transaction_date, transaction_time, description, payment_method)
SELECT
  (SELECT id FROM accounts WHERE lower(name) LIKE lower('%Bank Mandiri%') LIMIT 1),
  (SELECT id FROM categories WHERE lower(name) LIKE lower('%Makanan dan minuman%') AND type='expense' LIMIT 1),
  12000,
  'expense',
  '2026-05-24',
  '17:28:00',
  'Beli nasi sayur dan esteh',
  NULL;

-- No. 273: 2026-05-25 | Kesehatan dan kecantikan | Rp51000
INSERT INTO transactions (account_id, category_id, amount, type, transaction_date, transaction_time, description, payment_method)
SELECT
  (SELECT id FROM accounts WHERE lower(name) LIKE lower('%Bank Mandiri%') LIMIT 1),
  (SELECT id FROM categories WHERE lower(name) LIKE lower('%Kesehatan dan kecantikan%') AND type='expense' LIMIT 1),
  51000,
  'expense',
  '2026-05-25',
  '07:12:00',
  'Untuk topup shopee pay buat beli skincare',
  NULL;

-- No. 274: 2026-05-25 | Restoran, makanan cepat saji | Rp16500
INSERT INTO transactions (account_id, category_id, amount, type, transaction_date, transaction_time, description, payment_method)
SELECT
  (SELECT id FROM accounts WHERE lower(name) LIKE lower('%Bank Mandiri%') LIMIT 1),
  (SELECT id FROM categories WHERE lower(name) LIKE lower('%Restoran, makanan cepat saji%') AND type='expense' LIMIT 1),
  16500,
  'expense',
  '2026-05-25',
  '08:31:00',
  'beli magelangan',
  NULL;

-- No. 275: 2026-05-25 | Perawatan kendaraan | Rp152500
INSERT INTO transactions (account_id, category_id, amount, type, transaction_date, transaction_time, description, payment_method)
SELECT
  (SELECT id FROM accounts WHERE lower(name) LIKE lower('%Bank Mandiri%') LIMIT 1),
  (SELECT id FROM categories WHERE lower(name) LIKE lower('%Perawatan kendaraan%') AND type='expense' LIMIT 1),
  152500,
  'expense',
  '2026-05-25',
  '09:01:00',
  'Untuk kirim bapak uang buat servis motor',
  NULL;

-- No. 276: 2026-05-25 | Internet | Rp40000
INSERT INTO transactions (account_id, category_id, amount, type, transaction_date, transaction_time, description, payment_method)
SELECT
  (SELECT id FROM accounts WHERE lower(name) LIKE lower('%Bank Mandiri%') LIMIT 1),
  (SELECT id FROM categories WHERE lower(name) LIKE lower('%Internet%') AND type='expense' LIMIT 1),
  40000,
  'expense',
  '2026-05-25',
  '13:26:00',
  'Buat beli kuota internet 11 gb',
  NULL;

-- No. 277: 2026-05-25 | Restoran, makanan cepat saji | Rp11500
INSERT INTO transactions (account_id, category_id, amount, type, transaction_date, transaction_time, description, payment_method)
SELECT
  (SELECT id FROM accounts WHERE lower(name) LIKE lower('%Bank Mandiri%') LIMIT 1),
  (SELECT id FROM categories WHERE lower(name) LIKE lower('%Restoran, makanan cepat saji%') AND type='expense' LIMIT 1),
  11500,
  'expense',
  '2026-05-25',
  '13:38:00',
  'beli nasi sayur ayam',
  NULL;

-- No. 278: 2026-05-25 | Restoran, makanan cepat saji | Rp16000
INSERT INTO transactions (account_id, category_id, amount, type, transaction_date, transaction_time, description, payment_method)
SELECT
  (SELECT id FROM accounts WHERE lower(name) LIKE lower('%Bank Mandiri%') LIMIT 1),
  (SELECT id FROM categories WHERE lower(name) LIKE lower('%Restoran, makanan cepat saji%') AND type='expense' LIMIT 1),
  16000,
  'expense',
  '2026-05-25',
  '20:10:00',
  'beli nasi sayur',
  NULL;

-- No. 279: 2026-05-25 | Layanan | Rp22000
INSERT INTO transactions (account_id, category_id, amount, type, transaction_date, transaction_time, description, payment_method)
SELECT
  (SELECT id FROM accounts WHERE lower(name) LIKE lower('%Bank Mandiri%') LIMIT 1),
  (SELECT id FROM categories WHERE lower(name) LIKE lower('%Layanan%') AND type='expense' LIMIT 1),
  22000,
  'expense',
  '2026-05-25',
  '20:29:00',
  'pengeluaran ke OPAPER INTER INDONESIA JAKARTA PUSAT',
  NULL;

-- No. 280: 2026-05-26 | Pinjaman, bunga | Rp152500
INSERT INTO transactions (account_id, category_id, amount, type, transaction_date, transaction_time, description, payment_method)
SELECT
  (SELECT id FROM accounts WHERE lower(name) LIKE lower('%Bank Mandiri%') LIMIT 1),
  (SELECT id FROM categories WHERE lower(name) LIKE lower('%Pinjaman, bunga%') AND type='expense' LIMIT 1),
  152500,
  'expense',
  '2026-05-26',
  '13:35:00',
  'Untuk menghutangi aji',
  NULL;

-- No. 281: 2026-05-27 | Bahan makanan | Rp5000
INSERT INTO transactions (account_id, category_id, amount, type, transaction_date, transaction_time, description, payment_method)
SELECT
  (SELECT id FROM accounts WHERE lower(name) LIKE lower('%Bank Mandiri%') LIMIT 1),
  (SELECT id FROM categories WHERE lower(name) LIKE lower('%Bahan makanan%') AND type='expense' LIMIT 1),
  5000,
  'expense',
  '2026-05-27',
  '07:20:00',
  'pengeluaran ke TOKO DIFA',
  NULL;

-- No. 282: 2026-05-27 | Restoran, makanan cepat saji | Rp13000
INSERT INTO transactions (account_id, category_id, amount, type, transaction_date, transaction_time, description, payment_method)
SELECT
  (SELECT id FROM accounts WHERE lower(name) LIKE lower('%Bank Mandiri%') LIMIT 1),
  (SELECT id FROM categories WHERE lower(name) LIKE lower('%Restoran, makanan cepat saji%') AND type='expense' LIMIT 1),
  13000,
  'expense',
  '2026-05-27',
  '07:39:00',
  'pengeluaran ke Warmindo Sami Asih Sleman',
  NULL;

-- No. 283: 2026-05-27 | Alkohol, tembakau | Rp5500
INSERT INTO transactions (account_id, category_id, amount, type, transaction_date, transaction_time, description, payment_method)
SELECT
  (SELECT id FROM accounts WHERE lower(name) LIKE lower('%Bank Mandiri%') LIMIT 1),
  (SELECT id FROM categories WHERE lower(name) LIKE lower('%Alkohol, tembakau%') AND type='expense' LIMIT 1),
  5500,
  'expense',
  '2026-05-27',
  '16:53:00',
  'beli rokok 2 batang',
  NULL;

-- No. 284: 2026-05-27 | Restoran, makanan cepat saji | Rp34000
INSERT INTO transactions (account_id, category_id, amount, type, transaction_date, transaction_time, description, payment_method)
SELECT
  (SELECT id FROM accounts WHERE lower(name) LIKE lower('%Bank Mandiri%') LIMIT 1),
  (SELECT id FROM categories WHERE lower(name) LIKE lower('%Restoran, makanan cepat saji%') AND type='expense' LIMIT 1),
  34000,
  'expense',
  '2026-05-27',
  '22:13:00',
  'Beli makan malam dan bayar hutang Hasan 17 rb',
  NULL;

-- No. 285: 2026-05-27 | Makanan dan minuman | Rp17500
INSERT INTO transactions (account_id, category_id, amount, type, transaction_date, transaction_time, description, payment_method)
SELECT
  (SELECT id FROM accounts WHERE lower(name) LIKE lower('%Bank Mandiri%') LIMIT 1),
  (SELECT id FROM categories WHERE lower(name) LIKE lower('%Makanan dan minuman%') AND type='expense' LIMIT 1),
  17500,
  'expense',
  '2026-05-27',
  '23:07:00',
  'pengeluaran ke WARUNG BU RT',
  NULL;

-- No. 286: 2026-05-28 | Makanan dan minuman | Rp14000
INSERT INTO transactions (account_id, category_id, amount, type, transaction_date, transaction_time, description, payment_method)
SELECT
  (SELECT id FROM accounts WHERE lower(name) LIKE lower('%Bank Mandiri%') LIMIT 1),
  (SELECT id FROM categories WHERE lower(name) LIKE lower('%Makanan dan minuman%') AND type='expense' LIMIT 1),
  14000,
  'expense',
  '2026-05-28',
  '13:50:00',
  'pengeluaran ke warmindo',
  NULL;

-- No. 287: 2026-05-28 | Taksi | Rp7000
INSERT INTO transactions (account_id, category_id, amount, type, transaction_date, transaction_time, description, payment_method)
SELECT
  (SELECT id FROM accounts WHERE lower(name) LIKE lower('%Bank Mandiri%') LIMIT 1),
  (SELECT id FROM categories WHERE lower(name) LIKE lower('%Taksi%') AND type='expense' LIMIT 1),
  7000,
  'expense',
  '2026-05-28',
  '13:57:00',
  'pengeluaran ke GRAB TRANSPORT Jakarta Selatan',
  'QRIS';

-- No. 288: 2026-05-28 | Makanan dan minuman | Rp15000
INSERT INTO transactions (account_id, category_id, amount, type, transaction_date, transaction_time, description, payment_method)
SELECT
  (SELECT id FROM accounts WHERE lower(name) LIKE lower('%Bank Mandiri%') LIMIT 1),
  (SELECT id FROM categories WHERE lower(name) LIKE lower('%Makanan dan minuman%') AND type='expense' LIMIT 1),
  15000,
  'expense',
  '2026-05-28',
  '14:25:00',
  'beli teh tarik di takom',
  NULL;

-- No. 289: 2026-05-28 | Makanan dan minuman | Rp12000
INSERT INTO transactions (account_id, category_id, amount, type, transaction_date, transaction_time, description, payment_method)
SELECT
  (SELECT id FROM accounts WHERE lower(name) LIKE lower('%Bank Mandiri%') LIMIT 1),
  (SELECT id FROM categories WHERE lower(name) LIKE lower('%Makanan dan minuman%') AND type='expense' LIMIT 1),
  12000,
  'expense',
  '2026-05-28',
  '16:32:00',
  'Untuk beli expreso di takom',
  NULL;

-- No. 290: 2026-05-29 | Makanan dan minuman | Rp28000
INSERT INTO transactions (account_id, category_id, amount, type, transaction_date, transaction_time, description, payment_method)
SELECT
  (SELECT id FROM accounts WHERE lower(name) LIKE lower('%Bank Mandiri%') LIMIT 1),
  (SELECT id FROM categories WHERE lower(name) LIKE lower('%Makanan dan minuman%') AND type='expense' LIMIT 1),
  28000,
  'expense',
  '2026-05-29',
  '0:16:00',
  'pengeluaran ke SABANA MURAH NAGA Sleman',
  NULL;

SELECT count(*) as total_inserted FROM transactions;

ROLLBACK;
