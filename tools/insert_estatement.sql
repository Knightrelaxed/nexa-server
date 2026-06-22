BEGIN;

-- No. 237: 2026-05-15 | Lainnya | Rp13000
INSERT INTO transactions (account_id, category_id, amount, type, transaction_date, transaction_time, description, payment_method)
SELECT
  (SELECT id FROM accounts WHERE lower(name) LIKE lower('%Bank Mandiri%') LIMIT 1),
  (SELECT id FROM categories WHERE lower(name) LIKE lower('%Lainnya%') AND type='expense' LIMIT 1),
  13000,
  'expense',
  '2026-05-15',
  '08:00:00',
  'Pembayaran QR ke Waroeng Emdje, Kaliurang 605158951468',
  'QRIS';

-- No. 238: 2026-05-15 | Pendapatan | Rp1700000
INSERT INTO transactions (account_id, category_id, amount, type, transaction_date, transaction_time, description, payment_method)
SELECT
  (SELECT id FROM accounts WHERE lower(name) LIKE lower('%Bank Mandiri%') LIMIT 1),
  (SELECT id FROM categories WHERE lower(name) LIKE lower('%Pendapatan%') AND type='income' LIMIT 1),
  1700000,
  'income',
  '2026-05-15',
  '20:57:00',
  'Transfer BI Fast Dari SEABANK INDONESIA RIZQI HIDAYATULLOH 901410151948',
  'Transfer bank';

-- No. 239: 2026-05-16 | Transportasi | Rp7000
INSERT INTO transactions (account_id, category_id, amount, type, transaction_date, transaction_time, description, payment_method)
SELECT
  (SELECT id FROM accounts WHERE lower(name) LIKE lower('%Bank Mandiri%') LIMIT 1),
  (SELECT id FROM categories WHERE lower(name) LIKE lower('%Transportasi%') AND type='expense' LIMIT 1),
  7000,
  'expense',
  '2026-05-16',
  '08:15:00',
  'Pembayaran QR ke GRAB TRANSPORT 605167172620',
  'QRIS';

-- No. 240: 2026-05-16 | Makanan dan minuman | Rp15000
INSERT INTO transactions (account_id, category_id, amount, type, transaction_date, transaction_time, description, payment_method)
SELECT
  (SELECT id FROM accounts WHERE lower(name) LIKE lower('%Bank Mandiri%') LIMIT 1),
  (SELECT id FROM categories WHERE lower(name) LIKE lower('%Makanan dan minuman%') AND type='expense' LIMIT 1),
  15000,
  'expense',
  '2026-05-16',
  '15:23:00',
  'Untuk makan siangan eksa',
  'QRIS';

-- No. 241: 2026-05-17 | Lainnya | Rp8000
INSERT INTO transactions (account_id, category_id, amount, type, transaction_date, transaction_time, description, payment_method)
SELECT
  (SELECT id FROM accounts WHERE lower(name) LIKE lower('%Bank Mandiri%') LIMIT 1),
  (SELECT id FROM categories WHERE lower(name) LIKE lower('%Lainnya%') AND type='expense' LIMIT 1),
  8000,
  'expense',
  '2026-05-17',
  '09:28:00',
  'Untuk beli ayam geprek',
  'QRIS';

-- No. 242: 2026-05-17 | Lainnya | Rp7500
INSERT INTO transactions (account_id, category_id, amount, type, transaction_date, transaction_time, description, payment_method)
SELECT
  (SELECT id FROM accounts WHERE lower(name) LIKE lower('%Bank Mandiri%') LIMIT 1),
  (SELECT id FROM categories WHERE lower(name) LIKE lower('%Lainnya%') AND type='expense' LIMIT 1),
  7500,
  'expense',
  '2026-05-17',
  '14:15:00',
  'Biaya penarikan tunai di ATM Link 1152146',
  'Tunai';

-- No. 243: 2026-05-17 | Lainnya | Rp200000
INSERT INTO transactions (account_id, category_id, amount, type, transaction_date, transaction_time, description, payment_method)
SELECT
  (SELECT id FROM accounts WHERE lower(name) LIKE lower('%Bank Mandiri%') LIMIT 1),
  (SELECT id FROM categories WHERE lower(name) LIKE lower('%Lainnya%') AND type='expense' LIMIT 1),
  200000,
  'expense',
  '2026-05-17',
  '14:15:00',
  'Penarikan tunai di ATM Link 1152146',
  'Tunai';

-- No. 244: 2026-05-18 | Transportasi | Rp6000
INSERT INTO transactions (account_id, category_id, amount, type, transaction_date, transaction_time, description, payment_method)
SELECT
  (SELECT id FROM accounts WHERE lower(name) LIKE lower('%Bank Mandiri%') LIMIT 1),
  (SELECT id FROM categories WHERE lower(name) LIKE lower('%Transportasi%') AND type='expense' LIMIT 1),
  6000,
  'expense',
  '2026-05-18',
  '07:59:00',
  'SSNU',
  'QRIS';

-- No. 245: 2026-05-18 | Alat tulis, peralatan | Rp4500
INSERT INTO transactions (account_id, category_id, amount, type, transaction_date, transaction_time, description, payment_method)
SELECT
  (SELECT id FROM accounts WHERE lower(name) LIKE lower('%Bank Mandiri%') LIMIT 1),
  (SELECT id FROM categories WHERE lower(name) LIKE lower('%Alat tulis, peralatan%') AND type='expense' LIMIT 1),
  4500,
  'expense',
  '2026-05-18',
  '11:12:00',
  'pengeluaran ke AMIRA FOTOCOPY Sleman',
  'QRIS';

-- No. 246: 2026-05-18 | Lainnya | Rp22000
INSERT INTO transactions (account_id, category_id, amount, type, transaction_date, transaction_time, description, payment_method)
SELECT
  (SELECT id FROM accounts WHERE lower(name) LIKE lower('%Bank Mandiri%') LIMIT 1),
  (SELECT id FROM categories WHERE lower(name) LIKE lower('%Lainnya%') AND type='expense' LIMIT 1),
  22000,
  'expense',
  '2026-05-18',
  '20:22:00',
  'pengeluaran ke Bakmi Jowo Khas Semarang SLEMAN - ID Tanggal 18 Mei 2026 ',
  'QRIS';

-- No. 247: 2026-05-18 | Biaya, tarif | Rp2500
INSERT INTO transactions (account_id, category_id, amount, type, transaction_date, transaction_time, description, payment_method)
SELECT
  (SELECT id FROM accounts WHERE lower(name) LIKE lower('%Bank Mandiri%') LIMIT 1),
  (SELECT id FROM categories WHERE lower(name) LIKE lower('%Biaya, tarif%') AND type='expense' LIMIT 1),
  2500,
  'expense',
  '2026-05-18',
  '21:03:00',
  'Biaya transfer BI Fast',
  'Transfer bank';

-- No. 248: 2026-05-18 | Pinjaman, bunga | Rp150000
INSERT INTO transactions (account_id, category_id, amount, type, transaction_date, transaction_time, description, payment_method)
SELECT
  (SELECT id FROM accounts WHERE lower(name) LIKE lower('%Bank Mandiri%') LIMIT 1),
  (SELECT id FROM categories WHERE lower(name) LIKE lower('%Pinjaman, bunga%') AND type='expense' LIMIT 1),
  150000,
  'expense',
  '2026-05-18',
  '21:03:00',
  'Menghutangi aji',
  'Transfer bank';

-- No. 249: 2026-05-19 | Lainnya | Rp10000
INSERT INTO transactions (account_id, category_id, amount, type, transaction_date, transaction_time, description, payment_method)
SELECT
  (SELECT id FROM accounts WHERE lower(name) LIKE lower('%Bank Mandiri%') LIMIT 1),
  (SELECT id FROM categories WHERE lower(name) LIKE lower('%Lainnya%') AND type='expense' LIMIT 1),
  10000,
  'expense',
  '2026-05-19',
  '09:06:00',
  'pengeluaran ke nieta kitchen Sleman',
  'QRIS';

-- No. 250: 2026-05-19 | Makanan dan minuman | Rp5000
INSERT INTO transactions (account_id, category_id, amount, type, transaction_date, transaction_time, description, payment_method)
SELECT
  (SELECT id FROM accounts WHERE lower(name) LIKE lower('%Bank Mandiri%') LIMIT 1),
  (SELECT id FROM categories WHERE lower(name) LIKE lower('%Makanan dan minuman%') AND type='expense' LIMIT 1),
  5000,
  'expense',
  '2026-05-19',
  '10:51:00',
  'Beli tahu di kantin',
  'QRIS';

-- No. 251: 2026-05-19 | Lainnya | Rp10000
INSERT INTO transactions (account_id, category_id, amount, type, transaction_date, transaction_time, description, payment_method)
SELECT
  (SELECT id FROM accounts WHERE lower(name) LIKE lower('%Bank Mandiri%') LIMIT 1),
  (SELECT id FROM categories WHERE lower(name) LIKE lower('%Lainnya%') AND type='expense' LIMIT 1),
  10000,
  'expense',
  '2026-05-19',
  '13:55:00',
  'beli soto',
  'QRIS';

-- No. 252: 2026-05-19 | Makanan dan minuman | Rp30000
INSERT INTO transactions (account_id, category_id, amount, type, transaction_date, transaction_time, description, payment_method)
SELECT
  (SELECT id FROM accounts WHERE lower(name) LIKE lower('%Bank Mandiri%') LIMIT 1),
  (SELECT id FROM categories WHERE lower(name) LIKE lower('%Makanan dan minuman%') AND type='expense' LIMIT 1),
  30000,
  'expense',
  '2026-05-19',
  '19:53:00',
  'pengeluaran ke Duta Minang Family Jakal Sleman',
  'QRIS';

-- No. 253: 2026-05-20 | Makanan dan minuman | Rp15475
INSERT INTO transactions (account_id, category_id, amount, type, transaction_date, transaction_time, description, payment_method)
SELECT
  (SELECT id FROM accounts WHERE lower(name) LIKE lower('%Bank Mandiri%') LIMIT 1),
  (SELECT id FROM categories WHERE lower(name) LIKE lower('%Makanan dan minuman%') AND type='expense' LIMIT 1),
  15475,
  'expense',
  '2026-05-20',
  '09:42:00',
  'pengeluaran ke GRAB FOOD Jakarta Selatan',
  'QRIS';

-- No. 254: 2026-05-20 | Makanan dan minuman | Rp13000
INSERT INTO transactions (account_id, category_id, amount, type, transaction_date, transaction_time, description, payment_method)
SELECT
  (SELECT id FROM accounts WHERE lower(name) LIKE lower('%Bank Mandiri%') LIMIT 1),
  (SELECT id FROM categories WHERE lower(name) LIKE lower('%Makanan dan minuman%') AND type='expense' LIMIT 1),
  13000,
  'expense',
  '2026-05-20',
  '15:47:00',
  'Beli makan nasi sayur',
  'QRIS';

-- No. 255: 2026-05-20 | Transportasi | Rp5000
INSERT INTO transactions (account_id, category_id, amount, type, transaction_date, transaction_time, description, payment_method)
SELECT
  (SELECT id FROM accounts WHERE lower(name) LIKE lower('%Bank Mandiri%') LIMIT 1),
  (SELECT id FROM categories WHERE lower(name) LIKE lower('%Transportasi%') AND type='expense' LIMIT 1),
  5000,
  'expense',
  '2026-05-20',
  '16:07:00',
  'Transportasi ke takom',
  'QRIS';

-- No. 256: 2026-05-20 | Makanan dan minuman | Rp23000
INSERT INTO transactions (account_id, category_id, amount, type, transaction_date, transaction_time, description, payment_method)
SELECT
  (SELECT id FROM accounts WHERE lower(name) LIKE lower('%Bank Mandiri%') LIMIT 1),
  (SELECT id FROM categories WHERE lower(name) LIKE lower('%Makanan dan minuman%') AND type='expense' LIMIT 1),
  23000,
  'expense',
  '2026-05-20',
  '18:40:00',
  'Beli mie instan dan kopi di takom',
  'QRIS';

-- No. 257: 2026-05-20 | Lainnya | Rp14000
INSERT INTO transactions (account_id, category_id, amount, type, transaction_date, transaction_time, description, payment_method)
SELECT
  (SELECT id FROM accounts WHERE lower(name) LIKE lower('%Bank Mandiri%') LIMIT 1),
  (SELECT id FROM categories WHERE lower(name) LIKE lower('%Lainnya%') AND type='expense' LIMIT 1),
  14000,
  'expense',
  '2026-05-20',
  '22:25:00',
  'Beli nasi Padang',
  'QRIS';

-- No. 258: 2026-05-21 | Lainnya | Rp11000
INSERT INTO transactions (account_id, category_id, amount, type, transaction_date, transaction_time, description, payment_method)
SELECT
  (SELECT id FROM accounts WHERE lower(name) LIKE lower('%Bank Mandiri%') LIMIT 1),
  (SELECT id FROM categories WHERE lower(name) LIKE lower('%Lainnya%') AND type='expense' LIMIT 1),
  11000,
  'expense',
  '2026-05-21',
  '08:57:00',
  'pengeluaran ke nieta kitchen Sleman',
  'QRIS';

-- No. 259: 2026-05-21 | Makanan dan minuman | Rp13000
INSERT INTO transactions (account_id, category_id, amount, type, transaction_date, transaction_time, description, payment_method)
SELECT
  (SELECT id FROM accounts WHERE lower(name) LIKE lower('%Bank Mandiri%') LIMIT 1),
  (SELECT id FROM categories WHERE lower(name) LIKE lower('%Makanan dan minuman%') AND type='expense' LIMIT 1),
  13000,
  'expense',
  '2026-05-21',
  '13:07:00',
  'Jajan pangsit Chili oil',
  'QRIS';

-- No. 260: 2026-05-21 | Lainnya | Rp10000
INSERT INTO transactions (account_id, category_id, amount, type, transaction_date, transaction_time, description, payment_method)
SELECT
  (SELECT id FROM accounts WHERE lower(name) LIKE lower('%Bank Mandiri%') LIMIT 1),
  (SELECT id FROM categories WHERE lower(name) LIKE lower('%Lainnya%') AND type='expense' LIMIT 1),
  10000,
  'expense',
  '2026-05-21',
  '15:37:00',
  'nge gym',
  'QRIS';

-- No. 261: 2026-05-21 | Makanan dan minuman | Rp9000
INSERT INTO transactions (account_id, category_id, amount, type, transaction_date, transaction_time, description, payment_method)
SELECT
  (SELECT id FROM accounts WHERE lower(name) LIKE lower('%Bank Mandiri%') LIMIT 1),
  (SELECT id FROM categories WHERE lower(name) LIKE lower('%Makanan dan minuman%') AND type='expense' LIMIT 1),
  9000,
  'expense',
  '2026-05-21',
  '17:21:00',
  'Makan nasi sayur krupuk',
  'QRIS';

-- No. 262: 2026-05-22 | Lainnya | Rp12000
INSERT INTO transactions (account_id, category_id, amount, type, transaction_date, transaction_time, description, payment_method)
SELECT
  (SELECT id FROM accounts WHERE lower(name) LIKE lower('%Bank Mandiri%') LIMIT 1),
  (SELECT id FROM categories WHERE lower(name) LIKE lower('%Lainnya%') AND type='expense' LIMIT 1),
  12000,
  'expense',
  '2026-05-22',
  '08:47:00',
  'pengeluaran ke Waroeng Emdje',
  'QRIS';

-- No. 263: 2026-05-22 | Lainnya | Rp6000
INSERT INTO transactions (account_id, category_id, amount, type, transaction_date, transaction_time, description, payment_method)
SELECT
  (SELECT id FROM accounts WHERE lower(name) LIKE lower('%Bank Mandiri%') LIMIT 1),
  (SELECT id FROM categories WHERE lower(name) LIKE lower('%Lainnya%') AND type='expense' LIMIT 1),
  6000,
  'expense',
  '2026-05-22',
  '11:43:00',
  'pengeluaran ke GRAB TRANSPORT Jakarta Selatan',
  'QRIS';

-- No. 264: 2026-05-22 | Lainnya | Rp15475
INSERT INTO transactions (account_id, category_id, amount, type, transaction_date, transaction_time, description, payment_method)
SELECT
  (SELECT id FROM accounts WHERE lower(name) LIKE lower('%Bank Mandiri%') LIMIT 1),
  (SELECT id FROM categories WHERE lower(name) LIKE lower('%Lainnya%') AND type='expense' LIMIT 1),
  15475,
  'expense',
  '2026-05-22',
  '13:59:00',
  'pengeluaran ke GRAB FOOD Jakarta Selatan',
  'QRIS';

-- No. 265: 2026-05-22 | Alkohol, tembakau | Rp12500
INSERT INTO transactions (account_id, category_id, amount, type, transaction_date, transaction_time, description, payment_method)
SELECT
  (SELECT id FROM accounts WHERE lower(name) LIKE lower('%Bank Mandiri%') LIMIT 1),
  (SELECT id FROM categories WHERE lower(name) LIKE lower('%Alkohol, tembakau%') AND type='expense' LIMIT 1),
  12500,
  'expense',
  '2026-05-22',
  '16:51:00',
  'beli rokok 2 batang',
  'QRIS';

-- No. 266: 2026-05-22 | Kesehatan dan kecantikan | Rp20000
INSERT INTO transactions (account_id, category_id, amount, type, transaction_date, transaction_time, description, payment_method)
SELECT
  (SELECT id FROM accounts WHERE lower(name) LIKE lower('%Bank Mandiri%') LIMIT 1),
  (SELECT id FROM categories WHERE lower(name) LIKE lower('%Kesehatan dan kecantikan%') AND type='expense' LIMIT 1),
  20000,
  'expense',
  '2026-05-22',
  '20:30:00',
  'pengeluaran ke ACE BABERSHOP SLEMAN',
  'QRIS';

-- No. 267: 2026-05-22 | Restoran, makanan cepat saji | Rp28000
INSERT INTO transactions (account_id, category_id, amount, type, transaction_date, transaction_time, description, payment_method)
SELECT
  (SELECT id FROM accounts WHERE lower(name) LIKE lower('%Bank Mandiri%') LIMIT 1),
  (SELECT id FROM categories WHERE lower(name) LIKE lower('%Restoran, makanan cepat saji%') AND type='expense' LIMIT 1),
  28000,
  'expense',
  '2026-05-22',
  '20:35:00',
  'pengeluaran ke RM. PADANG PERGAULAN SLEMAN',
  'QRIS';

-- No. 268: 2026-05-22 | Biaya, tarif | Rp2500
INSERT INTO transactions (account_id, category_id, amount, type, transaction_date, transaction_time, description, payment_method)
SELECT
  (SELECT id FROM accounts WHERE lower(name) LIKE lower('%Bank Mandiri%') LIMIT 1),
  (SELECT id FROM categories WHERE lower(name) LIKE lower('%Biaya, tarif%') AND type='expense' LIMIT 1),
  2500,
  'expense',
  '2026-05-22',
  '21:45:00',
  'Biaya transfer BI Fast',
  'Transfer bank';

-- No. 269: 2026-05-22 | Pinjaman, bunga | Rp25000
INSERT INTO transactions (account_id, category_id, amount, type, transaction_date, transaction_time, description, payment_method)
SELECT
  (SELECT id FROM accounts WHERE lower(name) LIKE lower('%Bank Mandiri%') LIMIT 1),
  (SELECT id FROM categories WHERE lower(name) LIKE lower('%Pinjaman, bunga%') AND type='expense' LIMIT 1),
  25000,
  'expense',
  '2026-05-22',
  '21:45:00',
  'Manghutangi aji',
  'Transfer bank';

-- No. 270: 2026-05-23 | Restoran, makanan cepat saji | Rp15475
INSERT INTO transactions (account_id, category_id, amount, type, transaction_date, transaction_time, description, payment_method)
SELECT
  (SELECT id FROM accounts WHERE lower(name) LIKE lower('%Bank Mandiri%') LIMIT 1),
  (SELECT id FROM categories WHERE lower(name) LIKE lower('%Restoran, makanan cepat saji%') AND type='expense' LIMIT 1),
  15475,
  'expense',
  '2026-05-23',
  '10:10:00',
  'Beli mie ayam',
  'QRIS';

-- No. 271: 2026-05-23 | Makanan dan minuman | Rp15000
INSERT INTO transactions (account_id, category_id, amount, type, transaction_date, transaction_time, description, payment_method)
SELECT
  (SELECT id FROM accounts WHERE lower(name) LIKE lower('%Bank Mandiri%') LIMIT 1),
  (SELECT id FROM categories WHERE lower(name) LIKE lower('%Makanan dan minuman%') AND type='expense' LIMIT 1),
  15000,
  'expense',
  '2026-05-23',
  '17:10:00',
  'beli batagor dan bayar bensin buat hasan',
  'QRIS';

-- No. 272: 2026-05-23 | Pendapatan | Rp300000
INSERT INTO transactions (account_id, category_id, amount, type, transaction_date, transaction_time, description, payment_method)
SELECT
  (SELECT id FROM accounts WHERE lower(name) LIKE lower('%Bank Mandiri%') LIMIT 1),
  (SELECT id FROM categories WHERE lower(name) LIKE lower('%Pendapatan%') AND type='income' LIMIT 1),
  300000,
  'income',
  '2026-05-23',
  '21:42:00',
  'Transfer antar Mandiri DARI ESPAY DEBIT INDONESI DANA001032217569918 Transfer Fee 032217569918',
  'Transfer bank';

-- No. 273: 2026-05-23 | Makanan dan minuman | Rp14000
INSERT INTO transactions (account_id, category_id, amount, type, transaction_date, transaction_time, description, payment_method)
SELECT
  (SELECT id FROM accounts WHERE lower(name) LIKE lower('%Bank Mandiri%') LIMIT 1),
  (SELECT id FROM categories WHERE lower(name) LIKE lower('%Makanan dan minuman%') AND type='expense' LIMIT 1),
  14000,
  'expense',
  '2026-05-23',
  '21:44:00',
  'Beli naspad',
  'QRIS';

-- No. 274: 2026-05-23 | Biaya, tarif | Rp2500
INSERT INTO transactions (account_id, category_id, amount, type, transaction_date, transaction_time, description, payment_method)
SELECT
  (SELECT id FROM accounts WHERE lower(name) LIKE lower('%Bank Mandiri%') LIMIT 1),
  (SELECT id FROM categories WHERE lower(name) LIKE lower('%Biaya, tarif%') AND type='expense' LIMIT 1),
  2500,
  'expense',
  '2026-05-23',
  '22:27:00',
  'Biaya transfer BI Fast',
  'Transfer bank';

-- No. 275: 2026-05-23 | Elektronik, aksesoris | Rp2100000
INSERT INTO transactions (account_id, category_id, amount, type, transaction_date, transaction_time, description, payment_method)
SELECT
  (SELECT id FROM accounts WHERE lower(name) LIKE lower('%Bank Mandiri%') LIMIT 1),
  (SELECT id FROM categories WHERE lower(name) LIKE lower('%Elektronik, aksesoris%') AND type='expense' LIMIT 1),
  2100000,
  'expense',
  '2026-05-23',
  '22:27:00',
  'Transfer BI Fast Ke SEABANK INDONESIA FIRMAN RAHMANDANA 901639253172',
  'Transfer bank';

-- No. 276: 2026-05-24 | Alkohol, tembakau | Rp5500
INSERT INTO transactions (account_id, category_id, amount, type, transaction_date, transaction_time, description, payment_method)
SELECT
  (SELECT id FROM accounts WHERE lower(name) LIKE lower('%Bank Mandiri%') LIMIT 1),
  (SELECT id FROM categories WHERE lower(name) LIKE lower('%Alkohol, tembakau%') AND type='expense' LIMIT 1),
  5500,
  'expense',
  '2026-05-24',
  '17:11:00',
  'Beli rokok dua batang',
  'QRIS';

-- No. 277: 2026-05-24 | Makanan dan minuman | Rp12000
INSERT INTO transactions (account_id, category_id, amount, type, transaction_date, transaction_time, description, payment_method)
SELECT
  (SELECT id FROM accounts WHERE lower(name) LIKE lower('%Bank Mandiri%') LIMIT 1),
  (SELECT id FROM categories WHERE lower(name) LIKE lower('%Makanan dan minuman%') AND type='expense' LIMIT 1),
  12000,
  'expense',
  '2026-05-24',
  '17:29:00',
  'Beli nasi sayur dan esteh',
  'QRIS';

-- No. 278: 2026-05-25 | Biaya, tarif | Rp1000
INSERT INTO transactions (account_id, category_id, amount, type, transaction_date, transaction_time, description, payment_method)
SELECT
  (SELECT id FROM accounts WHERE lower(name) LIKE lower('%Bank Mandiri%') LIMIT 1),
  (SELECT id FROM categories WHERE lower(name) LIKE lower('%Biaya, tarif%') AND type='expense' LIMIT 1),
  1000,
  'expense',
  '2026-05-25',
  '07:14:00',
  'Biaya transaksi bank Pembayaran ShopeePay 893085742594985',
  NULL;

-- No. 279: 2026-05-25 | Lainnya | Rp50000
INSERT INTO transactions (account_id, category_id, amount, type, transaction_date, transaction_time, description, payment_method)
SELECT
  (SELECT id FROM accounts WHERE lower(name) LIKE lower('%Bank Mandiri%') LIMIT 1),
  (SELECT id FROM categories WHERE lower(name) LIKE lower('%Lainnya%') AND type='expense' LIMIT 1),
  50000,
  'expense',
  '2026-05-25',
  '07:14:00',
  'Pembayaran ShopeePay 893085742594985',
  NULL;

-- No. 280: 2026-05-25 | Restoran, makanan cepat saji | Rp16500
INSERT INTO transactions (account_id, category_id, amount, type, transaction_date, transaction_time, description, payment_method)
SELECT
  (SELECT id FROM accounts WHERE lower(name) LIKE lower('%Bank Mandiri%') LIMIT 1),
  (SELECT id FROM categories WHERE lower(name) LIKE lower('%Restoran, makanan cepat saji%') AND type='expense' LIMIT 1),
  16500,
  'expense',
  '2026-05-25',
  '08:32:00',
  'beli magelangan',
  'QRIS';

-- No. 281: 2026-05-25 | Biaya, tarif | Rp2500
INSERT INTO transactions (account_id, category_id, amount, type, transaction_date, transaction_time, description, payment_method)
SELECT
  (SELECT id FROM accounts WHERE lower(name) LIKE lower('%Bank Mandiri%') LIMIT 1),
  (SELECT id FROM categories WHERE lower(name) LIKE lower('%Biaya, tarif%') AND type='expense' LIMIT 1),
  2500,
  'expense',
  '2026-05-25',
  '09:03:00',
  'Biaya transfer BI Fast',
  'Transfer bank';

-- No. 282: 2026-05-25 | Perawatan kendaraan | Rp150000
INSERT INTO transactions (account_id, category_id, amount, type, transaction_date, transaction_time, description, payment_method)
SELECT
  (SELECT id FROM accounts WHERE lower(name) LIKE lower('%Bank Mandiri%') LIMIT 1),
  (SELECT id FROM categories WHERE lower(name) LIKE lower('%Perawatan kendaraan%') AND type='expense' LIMIT 1),
  150000,
  'expense',
  '2026-05-25',
  '09:03:00',
  'Transfer BI Fast Ke SEABANK INDONESIA RIZQI HIDAYATULLOH 901410151948',
  'Transfer bank';

-- No. 283: 2026-05-25 | Internet | Rp40000
INSERT INTO transactions (account_id, category_id, amount, type, transaction_date, transaction_time, description, payment_method)
SELECT
  (SELECT id FROM accounts WHERE lower(name) LIKE lower('%Bank Mandiri%') LIMIT 1),
  (SELECT id FROM categories WHERE lower(name) LIKE lower('%Internet%') AND type='expense' LIMIT 1),
  40000,
  'expense',
  '2026-05-25',
  '13:27:00',
  'Buat beli kuota internet 11 gb',
  'QRIS';

-- No. 284: 2026-05-25 | Restoran, makanan cepat saji | Rp11500
INSERT INTO transactions (account_id, category_id, amount, type, transaction_date, transaction_time, description, payment_method)
SELECT
  (SELECT id FROM accounts WHERE lower(name) LIKE lower('%Bank Mandiri%') LIMIT 1),
  (SELECT id FROM categories WHERE lower(name) LIKE lower('%Restoran, makanan cepat saji%') AND type='expense' LIMIT 1),
  11500,
  'expense',
  '2026-05-25',
  '13:40:00',
  'beli nasi sayur ayam',
  'QRIS';

-- No. 285: 2026-05-25 | Restoran, makanan cepat saji | Rp16000
INSERT INTO transactions (account_id, category_id, amount, type, transaction_date, transaction_time, description, payment_method)
SELECT
  (SELECT id FROM accounts WHERE lower(name) LIKE lower('%Bank Mandiri%') LIMIT 1),
  (SELECT id FROM categories WHERE lower(name) LIKE lower('%Restoran, makanan cepat saji%') AND type='expense' LIMIT 1),
  16000,
  'expense',
  '2026-05-25',
  '20:12:00',
  'beli nasi sayur',
  'QRIS';

-- No. 286: 2026-05-25 | Layanan | Rp22000
INSERT INTO transactions (account_id, category_id, amount, type, transaction_date, transaction_time, description, payment_method)
SELECT
  (SELECT id FROM accounts WHERE lower(name) LIKE lower('%Bank Mandiri%') LIMIT 1),
  (SELECT id FROM categories WHERE lower(name) LIKE lower('%Layanan%') AND type='expense' LIMIT 1),
  22000,
  'expense',
  '2026-05-25',
  '20:30:00',
  'pengeluaran ke OPAPER INTER INDONESIA JAKARTA PUSAT',
  'QRIS';

-- No. 287: 2026-05-26 | Biaya, tarif | Rp2500
INSERT INTO transactions (account_id, category_id, amount, type, transaction_date, transaction_time, description, payment_method)
SELECT
  (SELECT id FROM accounts WHERE lower(name) LIKE lower('%Bank Mandiri%') LIMIT 1),
  (SELECT id FROM categories WHERE lower(name) LIKE lower('%Biaya, tarif%') AND type='expense' LIMIT 1),
  2500,
  'expense',
  '2026-05-26',
  '13:37:00',
  'Biaya transfer BI Fast',
  'Transfer bank';

-- No. 288: 2026-05-26 | Pinjaman, bunga | Rp150000
INSERT INTO transactions (account_id, category_id, amount, type, transaction_date, transaction_time, description, payment_method)
SELECT
  (SELECT id FROM accounts WHERE lower(name) LIKE lower('%Bank Mandiri%') LIMIT 1),
  (SELECT id FROM categories WHERE lower(name) LIKE lower('%Pinjaman, bunga%') AND type='expense' LIMIT 1),
  150000,
  'expense',
  '2026-05-26',
  '13:37:00',
  'Transfer BI Fast Ke DNID SULXXXX FUAXX 88983882984',
  'Transfer bank';

-- No. 289: 2026-05-27 | Bahan makanan | Rp5000
INSERT INTO transactions (account_id, category_id, amount, type, transaction_date, transaction_time, description, payment_method)
SELECT
  (SELECT id FROM accounts WHERE lower(name) LIKE lower('%Bank Mandiri%') LIMIT 1),
  (SELECT id FROM categories WHERE lower(name) LIKE lower('%Bahan makanan%') AND type='expense' LIMIT 1),
  5000,
  'expense',
  '2026-05-27',
  '07:21:00',
  'pengeluaran ke TOKO DIFA',
  'QRIS';

-- No. 290: 2026-05-27 | Restoran, makanan cepat saji | Rp13000
INSERT INTO transactions (account_id, category_id, amount, type, transaction_date, transaction_time, description, payment_method)
SELECT
  (SELECT id FROM accounts WHERE lower(name) LIKE lower('%Bank Mandiri%') LIMIT 1),
  (SELECT id FROM categories WHERE lower(name) LIKE lower('%Restoran, makanan cepat saji%') AND type='expense' LIMIT 1),
  13000,
  'expense',
  '2026-05-27',
  '07:41:00',
  'pengeluaran ke Warmindo Sami Asih Sleman',
  'QRIS';

-- No. 291: 2026-05-27 | Alkohol, tembakau | Rp5500
INSERT INTO transactions (account_id, category_id, amount, type, transaction_date, transaction_time, description, payment_method)
SELECT
  (SELECT id FROM accounts WHERE lower(name) LIKE lower('%Bank Mandiri%') LIMIT 1),
  (SELECT id FROM categories WHERE lower(name) LIKE lower('%Alkohol, tembakau%') AND type='expense' LIMIT 1),
  5500,
  'expense',
  '2026-05-27',
  '16:55:00',
  'beli rokok 2 batang',
  'QRIS';

-- No. 292: 2026-05-27 | Restoran, makanan cepat saji | Rp34000
INSERT INTO transactions (account_id, category_id, amount, type, transaction_date, transaction_time, description, payment_method)
SELECT
  (SELECT id FROM accounts WHERE lower(name) LIKE lower('%Bank Mandiri%') LIMIT 1),
  (SELECT id FROM categories WHERE lower(name) LIKE lower('%Restoran, makanan cepat saji%') AND type='expense' LIMIT 1),
  34000,
  'expense',
  '2026-05-27',
  '22:15:00',
  'Beli makan malam dan bayar hutang Hasan 17 rb',
  'QRIS';

-- No. 293: 2026-05-28 | Lainnya | Rp17500
INSERT INTO transactions (account_id, category_id, amount, type, transaction_date, transaction_time, description, payment_method)
SELECT
  (SELECT id FROM accounts WHERE lower(name) LIKE lower('%Bank Mandiri%') LIMIT 1),
  (SELECT id FROM categories WHERE lower(name) LIKE lower('%Lainnya%') AND type='expense' LIMIT 1),
  17500,
  'expense',
  '2026-05-28',
  '01:35:00',
  'Pembayaran QR ke WARUNG BU RT, DEPОК 605670840438',
  'QRIS';

-- No. 294: 2026-05-28 | Makanan dan minuman | Rp14000
INSERT INTO transactions (account_id, category_id, amount, type, transaction_date, transaction_time, description, payment_method)
SELECT
  (SELECT id FROM accounts WHERE lower(name) LIKE lower('%Bank Mandiri%') LIMIT 1),
  (SELECT id FROM categories WHERE lower(name) LIKE lower('%Makanan dan minuman%') AND type='expense' LIMIT 1),
  14000,
  'expense',
  '2026-05-28',
  '13:52:00',
  'pengeluaran ke warmindo',
  'QRIS';

-- No. 295: 2026-05-28 | Taksi | Rp7000
INSERT INTO transactions (account_id, category_id, amount, type, transaction_date, transaction_time, description, payment_method)
SELECT
  (SELECT id FROM accounts WHERE lower(name) LIKE lower('%Bank Mandiri%') LIMIT 1),
  (SELECT id FROM categories WHERE lower(name) LIKE lower('%Taksi%') AND type='expense' LIMIT 1),
  7000,
  'expense',
  '2026-05-28',
  '13:58:00',
  'pengeluaran ke GRAB TRANSPORT Jakarta Selatan',
  'QRIS';

-- No. 296: 2026-05-28 | Makanan dan minuman | Rp15000
INSERT INTO transactions (account_id, category_id, amount, type, transaction_date, transaction_time, description, payment_method)
SELECT
  (SELECT id FROM accounts WHERE lower(name) LIKE lower('%Bank Mandiri%') LIMIT 1),
  (SELECT id FROM categories WHERE lower(name) LIKE lower('%Makanan dan minuman%') AND type='expense' LIMIT 1),
  15000,
  'expense',
  '2026-05-28',
  '14:26:00',
  'beli teh tarik di takom',
  'QRIS';

-- No. 297: 2026-05-28 | Makanan dan minuman | Rp12000
INSERT INTO transactions (account_id, category_id, amount, type, transaction_date, transaction_time, description, payment_method)
SELECT
  (SELECT id FROM accounts WHERE lower(name) LIKE lower('%Bank Mandiri%') LIMIT 1),
  (SELECT id FROM categories WHERE lower(name) LIKE lower('%Makanan dan minuman%') AND type='expense' LIMIT 1),
  12000,
  'expense',
  '2026-05-28',
  '16:34:00',
  'Untuk beli expreso di takom',
  'QRIS';

-- No. 298: 2026-05-29 | Makanan dan minuman | Rp28000
INSERT INTO transactions (account_id, category_id, amount, type, transaction_date, transaction_time, description, payment_method)
SELECT
  (SELECT id FROM accounts WHERE lower(name) LIKE lower('%Bank Mandiri%') LIMIT 1),
  (SELECT id FROM categories WHERE lower(name) LIKE lower('%Makanan dan minuman%') AND type='expense' LIMIT 1),
  28000,
  'expense',
  '2026-05-29',
  '02:01:00',
  'pengeluaran ke SABANA MURAH NAGA Sleman',
  'QRIS';

-- No. 299: 2026-05-29 | Lainnya | Rp8000
INSERT INTO transactions (account_id, category_id, amount, type, transaction_date, transaction_time, description, payment_method)
SELECT
  (SELECT id FROM accounts WHERE lower(name) LIKE lower('%Bank Mandiri%') LIMIT 1),
  (SELECT id FROM categories WHERE lower(name) LIKE lower('%Lainnya%') AND type='expense' LIMIT 1),
  8000,
  'expense',
  '2026-05-29',
  '08:33:00',
  'Pembayaran QR ke Waroeng Emdje, Kaliurang 605694422870',
  'QRIS';

-- No. 300: 2026-05-29 | Makanan dan minuman | Rp15475
INSERT INTO transactions (account_id, category_id, amount, type, transaction_date, transaction_time, description, payment_method)
SELECT
  (SELECT id FROM accounts WHERE lower(name) LIKE lower('%Bank Mandiri%') LIMIT 1),
  (SELECT id FROM categories WHERE lower(name) LIKE lower('%Makanan dan minuman%') AND type='expense' LIMIT 1),
  15475,
  'expense',
  '2026-05-29',
  '13:16:00',
  'Pembayaran QR ke GRAB FOOD 605690327841',
  'QRIS';

SELECT count(*) as total_inserted FROM transactions;

ROLLBACK;
