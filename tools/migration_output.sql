-- ═══════════════════════════════════════════════════════════════════
-- N.E.X.A Finance Migration: Google Sheets → Supabase
-- Generated: 2026-05-30T09:33:25.854Z
-- Total transactions: 236
-- ═══════════════════════════════════════════════════════════════════

-- STEP 1: Run this FIRST to preview (no data changed)
-- STEP 2: If preview looks correct, remove the ROLLBACK at the bottom and run again

BEGIN;

-- ─── Kategori yang dibutuhkan (pastikan sudah ada di tabel categories) ───
-- Alat tulis, peralatan
-- Alkohol, tembakau
-- Anak-anak
-- Bahan makanan
-- Bar, kafe
-- Belanja
-- Biaya, tarif
-- Elektronik, aksesoris
-- Internet
-- Kesehatan dan kecantikan
-- Lainnya
-- Layanan
-- Makanan dan minuman
-- Pajak
-- Pendapatan
-- Pendidikan, pengembangan diri
-- Perhiasan, aksesoris
-- Peristiwa hidup
-- Pinjaman, bunga
-- Restoran, makanan cepat saji
-- Telepon, ponsel
-- Transfer, penarikan
-- Transportasi

-- ─── Akun yang dibutuhkan (pastikan sudah ada di tabel accounts) ───
-- Bank Mandiri

-- ─── INSERT Transactions ───────────────────────────────────────────────

-- No. 1: 2026-02-09 | INCOME | Pendapatan | Rp3.600.000
INSERT INTO transactions (account_id, category_id, amount, type, transaction_date, transaction_time, description, payment_method)
SELECT
  (SELECT id FROM accounts    WHERE lower(name) LIKE lower('%Bank Mandiri%')  LIMIT 1),
  (SELECT id FROM categories  WHERE lower(name) LIKE lower('%Pendapatan%') AND type = 'income' LIMIT 1),
  3600000,
  'income',
  '2026-02-09',
  '14:45',
  'Jardine scholarship (Biaya hidup triwulan pertama semester 1)',
  NULL;

-- No. 2: 2026-02-09 | INCOME | Pendapatan | Rp1.900.000
INSERT INTO transactions (account_id, category_id, amount, type, transaction_date, transaction_time, description, payment_method)
SELECT
  (SELECT id FROM accounts    WHERE lower(name) LIKE lower('%Bank Mandiri%')  LIMIT 1),
  (SELECT id FROM categories  WHERE lower(name) LIKE lower('%Pendapatan%') AND type = 'income' LIMIT 1),
  1900000,
  'income',
  '2026-02-09',
  '14:45',
  'jardine scholarship reimbursement for ukt smt 1',
  NULL;

-- No. 3: 2026-02-09 | EXPENSE | Elektronik, aksesoris | Rp3.900.000
INSERT INTO transactions (account_id, category_id, amount, type, transaction_date, transaction_time, description, payment_method)
SELECT
  (SELECT id FROM accounts    WHERE lower(name) LIKE lower('%Bank Mandiri%')  LIMIT 1),
  (SELECT id FROM categories  WHERE lower(name) LIKE lower('%Elektronik, aksesoris%') AND type = 'expense' LIMIT 1),
  3900000,
  'expense',
  '2026-02-09',
  '17:14',
  'laptop',
  NULL;

-- No. 4: 2026-02-09 | EXPENSE | Biaya, tarif | Rp5.000
INSERT INTO transactions (account_id, category_id, amount, type, transaction_date, transaction_time, description, payment_method)
SELECT
  (SELECT id FROM accounts    WHERE lower(name) LIKE lower('%Bank Mandiri%')  LIMIT 1),
  (SELECT id FROM categories  WHERE lower(name) LIKE lower('%Biaya, tarif%') AND type = 'expense' LIMIT 1),
  5000,
  'expense',
  '2026-02-09',
  '23:59',
  'biaya administrasi kartu debit',
  NULL;

-- No. 5: 2026-02-09 | EXPENSE | Biaya, tarif | Rp5.000
INSERT INTO transactions (account_id, category_id, amount, type, transaction_date, transaction_time, description, payment_method)
SELECT
  (SELECT id FROM accounts    WHERE lower(name) LIKE lower('%Bank Mandiri%')  LIMIT 1),
  (SELECT id FROM categories  WHERE lower(name) LIKE lower('%Biaya, tarif%') AND type = 'expense' LIMIT 1),
  5000,
  'expense',
  '2026-02-09',
  '23:59',
  'biaya administrasi kartu debit',
  NULL;

-- No. 6: 2026-02-09 | EXPENSE | Biaya, tarif | Rp5.000
INSERT INTO transactions (account_id, category_id, amount, type, transaction_date, transaction_time, description, payment_method)
SELECT
  (SELECT id FROM accounts    WHERE lower(name) LIKE lower('%Bank Mandiri%')  LIMIT 1),
  (SELECT id FROM categories  WHERE lower(name) LIKE lower('%Biaya, tarif%') AND type = 'expense' LIMIT 1),
  5000,
  'expense',
  '2026-02-09',
  '23:59',
  'biaya administrasi kartu debit',
  NULL;

-- No. 7: 2026-02-10 | EXPENSE | Makanan dan minuman | Rp10.000
INSERT INTO transactions (account_id, category_id, amount, type, transaction_date, transaction_time, description, payment_method)
SELECT
  (SELECT id FROM accounts    WHERE lower(name) LIKE lower('%Bank Mandiri%')  LIMIT 1),
  (SELECT id FROM categories  WHERE lower(name) LIKE lower('%Makanan dan minuman%') AND type = 'expense' LIMIT 1),
  10000,
  'expense',
  '2026-02-10',
  '09:12',
  'makan kansas pagi',
  NULL;

-- No. 8: 2026-02-10 | EXPENSE | Lainnya | Rp202.500
INSERT INTO transactions (account_id, category_id, amount, type, transaction_date, transaction_time, description, payment_method)
SELECT
  (SELECT id FROM accounts    WHERE lower(name) LIKE lower('%Bank Mandiri%')  LIMIT 1),
  (SELECT id FROM categories  WHERE lower(name) LIKE lower('%Lainnya%') AND type = 'expense' LIMIT 1),
  202500,
  'expense',
  '2026-02-10',
  '10:16',
  'buat servis motor bapak',
  NULL;

-- No. 9: 2026-02-10 | EXPENSE | Pinjaman, bunga | Rp10.000
INSERT INTO transactions (account_id, category_id, amount, type, transaction_date, transaction_time, description, payment_method)
SELECT
  (SELECT id FROM accounts    WHERE lower(name) LIKE lower('%Bank Mandiri%')  LIMIT 1),
  (SELECT id FROM categories  WHERE lower(name) LIKE lower('%Pinjaman, bunga%') AND type = 'expense' LIMIT 1),
  10000,
  'expense',
  '2026-02-10',
  '13:13',
  'bayar hutang aMaret',
  NULL;

-- No. 10: 2026-02-10 | EXPENSE | Makanan dan minuman | Rp14.000
INSERT INTO transactions (account_id, category_id, amount, type, transaction_date, transaction_time, description, payment_method)
SELECT
  (SELECT id FROM accounts    WHERE lower(name) LIKE lower('%Bank Mandiri%')  LIMIT 1),
  (SELECT id FROM categories  WHERE lower(name) LIKE lower('%Makanan dan minuman%') AND type = 'expense' LIMIT 1),
  14000,
  'expense',
  '2026-02-10',
  '13:42',
  'makan padang klebengan',
  NULL;

-- No. 11: 2026-02-10 | EXPENSE | Elektronik, aksesoris | Rp20.770
INSERT INTO transactions (account_id, category_id, amount, type, transaction_date, transaction_time, description, payment_method)
SELECT
  (SELECT id FROM accounts    WHERE lower(name) LIKE lower('%Bank Mandiri%')  LIMIT 1),
  (SELECT id FROM categories  WHERE lower(name) LIKE lower('%Elektronik, aksesoris%') AND type = 'expense' LIMIT 1),
  20770,
  'expense',
  '2026-02-10',
  '18:14',
  'beli tas laptop',
  NULL;

-- No. 12: 2026-02-10 | EXPENSE | Alat tulis, peralatan | Rp19.759
INSERT INTO transactions (account_id, category_id, amount, type, transaction_date, transaction_time, description, payment_method)
SELECT
  (SELECT id FROM accounts    WHERE lower(name) LIKE lower('%Bank Mandiri%')  LIMIT 1),
  (SELECT id FROM categories  WHERE lower(name) LIKE lower('%Alat tulis, peralatan%') AND type = 'expense' LIMIT 1),
  19759,
  'expense',
  '2026-02-10',
  '18:21',
  'beli pembersih layar dan kuas keyboard',
  NULL;

-- No. 13: 2026-02-10 | EXPENSE | Pinjaman, bunga | Rp302.500
INSERT INTO transactions (account_id, category_id, amount, type, transaction_date, transaction_time, description, payment_method)
SELECT
  (SELECT id FROM accounts    WHERE lower(name) LIKE lower('%Bank Mandiri%')  LIMIT 1),
  (SELECT id FROM categories  WHERE lower(name) LIKE lower('%Pinjaman, bunga%') AND type = 'expense' LIMIT 1),
  302500,
  'expense',
  '2026-02-10',
  '19:02',
  'bayar hutang habibi 200k dan abdu 100k',
  NULL;

-- No. 14: 2026-02-11 | EXPENSE | Kesehatan dan kecantikan | Rp23.084
INSERT INTO transactions (account_id, category_id, amount, type, transaction_date, transaction_time, description, payment_method)
SELECT
  (SELECT id FROM accounts    WHERE lower(name) LIKE lower('%Bank Mandiri%')  LIMIT 1),
  (SELECT id FROM categories  WHERE lower(name) LIKE lower('%Kesehatan dan kecantikan%') AND type = 'expense' LIMIT 1),
  23084,
  'expense',
  '2026-02-11',
  '05:54',
  'Beli Nourish Acne Plast Boy / Penutup Jerawat / Plester Jerawat / Berjerawat / Acne Patch',
  NULL;

-- No. 15: 2026-02-11 | EXPENSE | Kesehatan dan kecantikan | Rp32.549
INSERT INTO transactions (account_id, category_id, amount, type, transaction_date, transaction_time, description, payment_method)
SELECT
  (SELECT id FROM accounts    WHERE lower(name) LIKE lower('%Bank Mandiri%')  LIMIT 1),
  (SELECT id FROM categories  WHERE lower(name) LIKE lower('%Kesehatan dan kecantikan%') AND type = 'expense' LIMIT 1),
  32549,
  'expense',
  '2026-02-11',
  '06:14',
  'Beli Kahf Oil and Acne Care Face Wash',
  NULL;

-- No. 16: 2026-02-11 | EXPENSE | Kesehatan dan kecantikan | Rp17.390
INSERT INTO transactions (account_id, category_id, amount, type, transaction_date, transaction_time, description, payment_method)
SELECT
  (SELECT id FROM accounts    WHERE lower(name) LIKE lower('%Bank Mandiri%')  LIMIT 1),
  (SELECT id FROM categories  WHERE lower(name) LIKE lower('%Kesehatan dan kecantikan%') AND type = 'expense' LIMIT 1),
  17390,
  'expense',
  '2026-02-11',
  '07:35',
  'Beli pelembab Glad2Glow Centella Moisturizer Gel',
  NULL;

-- No. 17: 2026-02-11 | EXPENSE | Makanan dan minuman | Rp18.000
INSERT INTO transactions (account_id, category_id, amount, type, transaction_date, transaction_time, description, payment_method)
SELECT
  (SELECT id FROM accounts    WHERE lower(name) LIKE lower('%Bank Mandiri%')  LIMIT 1),
  (SELECT id FROM categories  WHERE lower(name) LIKE lower('%Makanan dan minuman%') AND type = 'expense' LIMIT 1),
  18000,
  'expense',
  '2026-02-11',
  '16:00',
  'beli magelangan, satu bakawan, dan air es',
  NULL;

-- No. 18: 2026-02-12 | EXPENSE | Makanan dan minuman | Rp11.000
INSERT INTO transactions (account_id, category_id, amount, type, transaction_date, transaction_time, description, payment_method)
SELECT
  (SELECT id FROM accounts    WHERE lower(name) LIKE lower('%Bank Mandiri%')  LIMIT 1),
  (SELECT id FROM categories  WHERE lower(name) LIKE lower('%Makanan dan minuman%') AND type = 'expense' LIMIT 1),
  11000,
  'expense',
  '2026-02-12',
  '00:15',
  'Beli mie jumbo dua',
  NULL;

-- No. 19: 2026-02-12 | EXPENSE | Alkohol, tembakau | Rp11.000
INSERT INTO transactions (account_id, category_id, amount, type, transaction_date, transaction_time, description, payment_method)
SELECT
  (SELECT id FROM accounts    WHERE lower(name) LIKE lower('%Bank Mandiri%')  LIMIT 1),
  (SELECT id FROM categories  WHERE lower(name) LIKE lower('%Alkohol, tembakau%') AND type = 'expense' LIMIT 1),
  11000,
  'expense',
  '2026-02-12',
  '11:04',
  'Beli rokok Surya 3 10K sama admin qris 1k',
  'QRIS';

-- No. 20: 2026-02-12 | EXPENSE | Makanan dan minuman | Rp10.000
INSERT INTO transactions (account_id, category_id, amount, type, transaction_date, transaction_time, description, payment_method)
SELECT
  (SELECT id FROM accounts    WHERE lower(name) LIKE lower('%Bank Mandiri%')  LIMIT 1),
  (SELECT id FROM categories  WHERE lower(name) LIKE lower('%Makanan dan minuman%') AND type = 'expense' LIMIT 1),
  10000,
  'expense',
  '2026-02-12',
  '14:26',
  'Beli nasi padang',
  NULL;

-- No. 21: 2026-02-13 | EXPENSE | Makanan dan minuman | Rp5.000
INSERT INTO transactions (account_id, category_id, amount, type, transaction_date, transaction_time, description, payment_method)
SELECT
  (SELECT id FROM accounts    WHERE lower(name) LIKE lower('%Bank Mandiri%')  LIMIT 1),
  (SELECT id FROM categories  WHERE lower(name) LIKE lower('%Makanan dan minuman%') AND type = 'expense' LIMIT 1),
  5000,
  'expense',
  '2026-02-13',
  '07:01',
  'Beli telor dan kerupuk',
  NULL;

-- No. 22: 2026-02-13 | EXPENSE | Alkohol, tembakau | Rp11.000
INSERT INTO transactions (account_id, category_id, amount, type, transaction_date, transaction_time, description, payment_method)
SELECT
  (SELECT id FROM accounts    WHERE lower(name) LIKE lower('%Bank Mandiri%')  LIMIT 1),
  (SELECT id FROM categories  WHERE lower(name) LIKE lower('%Alkohol, tembakau%') AND type = 'expense' LIMIT 1),
  11000,
  'expense',
  '2026-02-13',
  '23:57',
  'Beli rokok Surya 4 10K sama admin qris 1k',
  'QRIS';

-- No. 23: 2026-02-14 | EXPENSE | Transfer, penarikan | Rp100.000
INSERT INTO transactions (account_id, category_id, amount, type, transaction_date, transaction_time, description, payment_method)
SELECT
  (SELECT id FROM accounts    WHERE lower(name) LIKE lower('%Bank Mandiri%')  LIMIT 1),
  (SELECT id FROM categories  WHERE lower(name) LIKE lower('%Transfer, penarikan%') AND type = 'expense' LIMIT 1),
  100000,
  'expense',
  '2026-02-14',
  '00:00',
  'Mas dennis tuker cash ke saldo',
  NULL;

-- No. 24: 2026-02-14 | EXPENSE | Biaya, tarif | Rp2.500
INSERT INTO transactions (account_id, category_id, amount, type, transaction_date, transaction_time, description, payment_method)
SELECT
  (SELECT id FROM accounts    WHERE lower(name) LIKE lower('%Bank Mandiri%')  LIMIT 1),
  (SELECT id FROM categories  WHERE lower(name) LIKE lower('%Biaya, tarif%') AND type = 'expense' LIMIT 1),
  2500,
  'expense',
  '2026-02-14',
  '00:22',
  'biaya administrasi transfer',
  'Transfer bank';

-- No. 25: 2026-02-14 | EXPENSE | Lainnya | Rp12.000
INSERT INTO transactions (account_id, category_id, amount, type, transaction_date, transaction_time, description, payment_method)
SELECT
  (SELECT id FROM accounts    WHERE lower(name) LIKE lower('%Bank Mandiri%')  LIMIT 1),
  (SELECT id FROM categories  WHERE lower(name) LIKE lower('%Lainnya%') AND type = 'expense' LIMIT 1),
  12000,
  'expense',
  '2026-02-14',
  '00:27',
  'Bayar hutang hilda',
  NULL;

-- No. 26: 2026-02-14 | EXPENSE | Lainnya | Rp28.500
INSERT INTO transactions (account_id, category_id, amount, type, transaction_date, transaction_time, description, payment_method)
SELECT
  (SELECT id FROM accounts    WHERE lower(name) LIKE lower('%Bank Mandiri%')  LIMIT 1),
  (SELECT id FROM categories  WHERE lower(name) LIKE lower('%Lainnya%') AND type = 'expense' LIMIT 1),
  28500,
  'expense',
  '2026-02-14',
  '00:31',
  'Bayar hutang faiz',
  NULL;

-- No. 27: 2026-02-14 | EXPENSE | Lainnya | Rp44.000
INSERT INTO transactions (account_id, category_id, amount, type, transaction_date, transaction_time, description, payment_method)
SELECT
  (SELECT id FROM accounts    WHERE lower(name) LIKE lower('%Bank Mandiri%')  LIMIT 1),
  (SELECT id FROM categories  WHERE lower(name) LIKE lower('%Lainnya%') AND type = 'expense' LIMIT 1),
  44000,
  'expense',
  '2026-02-14',
  '00:35',
  'Bayar hutang adam',
  NULL;

-- No. 28: 2026-02-14 | EXPENSE | Alat tulis, peralatan | Rp22.000
INSERT INTO transactions (account_id, category_id, amount, type, transaction_date, transaction_time, description, payment_method)
SELECT
  (SELECT id FROM accounts    WHERE lower(name) LIKE lower('%Bank Mandiri%')  LIMIT 1),
  (SELECT id FROM categories  WHERE lower(name) LIKE lower('%Alat tulis, peralatan%') AND type = 'expense' LIMIT 1),
  22000,
  'expense',
  '2026-02-14',
  '00:38',
  'Beli bantal guling dan bayar hutang Hasan 2k plus admin',
  NULL;

-- No. 29: 2026-02-14 | EXPENSE | Transfer, penarikan | Rp150.000
INSERT INTO transactions (account_id, category_id, amount, type, transaction_date, transaction_time, description, payment_method)
SELECT
  (SELECT id FROM accounts    WHERE lower(name) LIKE lower('%Bank Mandiri%')  LIMIT 1),
  (SELECT id FROM categories  WHERE lower(name) LIKE lower('%Transfer, penarikan%') AND type = 'expense' LIMIT 1),
  150000,
  'expense',
  '2026-02-14',
  '05:42',
  'Untuk transaksi mobile cepat, dg tujuan menghindari biaya admin',
  NULL;

-- No. 30: 2026-02-14 | INCOME | Pendapatan | Rp26.999
INSERT INTO transactions (account_id, category_id, amount, type, transaction_date, transaction_time, description, payment_method)
SELECT
  (SELECT id FROM accounts    WHERE lower(name) LIKE lower('%Bank Mandiri%')  LIMIT 1),
  (SELECT id FROM categories  WHERE lower(name) LIKE lower('%Pendapatan%') AND type = 'income' LIMIT 1),
  26999,
  'income',
  '2026-02-14',
  '05:51',
  'Penghitungan penuh nominal seutuhnya di akun',
  NULL;

-- No. 31: 2026-02-19 | INCOME | Pendapatan | Rp3.600.000
INSERT INTO transactions (account_id, category_id, amount, type, transaction_date, transaction_time, description, payment_method)
SELECT
  (SELECT id FROM accounts    WHERE lower(name) LIKE lower('%Bank Mandiri%')  LIMIT 1),
  (SELECT id FROM categories  WHERE lower(name) LIKE lower('%Pendapatan%') AND type = 'income' LIMIT 1),
  3600000,
  'income',
  '2026-02-19',
  '07:42',
  'Jardine scholarship (Biaya hidup triwulan kedua semester 1)',
  NULL;

-- No. 32: 2026-02-27 | EXPENSE | Pajak | Rp21.500
INSERT INTO transactions (account_id, category_id, amount, type, transaction_date, transaction_time, description, payment_method)
SELECT
  (SELECT id FROM accounts    WHERE lower(name) LIKE lower('%Bank Mandiri%')  LIMIT 1),
  (SELECT id FROM categories  WHERE lower(name) LIKE lower('%Pajak%') AND type = 'expense' LIMIT 1),
  21500,
  'expense',
  '2026-02-27',
  '21:55',
  'ROTG Mubes IKMASA',
  NULL;

-- No. 33: 2026-02-28 | EXPENSE | Biaya, tarif | Rp5.000
INSERT INTO transactions (account_id, category_id, amount, type, transaction_date, transaction_time, description, payment_method)
SELECT
  (SELECT id FROM accounts    WHERE lower(name) LIKE lower('%Bank Mandiri%')  LIMIT 1),
  (SELECT id FROM categories  WHERE lower(name) LIKE lower('%Biaya, tarif%') AND type = 'expense' LIMIT 1),
  5000,
  'expense',
  '2026-02-28',
  '00:00',
  'biaya administrasi kartu debit',
  NULL;

-- No. 34: 2026-02-28 | EXPENSE | Biaya, tarif | Rp5.000
INSERT INTO transactions (account_id, category_id, amount, type, transaction_date, transaction_time, description, payment_method)
SELECT
  (SELECT id FROM accounts    WHERE lower(name) LIKE lower('%Bank Mandiri%')  LIMIT 1),
  (SELECT id FROM categories  WHERE lower(name) LIKE lower('%Biaya, tarif%') AND type = 'expense' LIMIT 1),
  5000,
  'expense',
  '2026-02-28',
  '21:52',
  'biaya karena saldo melebihi batas saldo minimum',
  NULL;

-- No. 35: 2026-02-28 | EXPENSE | Perhiasan, aksesoris | Rp505.000
INSERT INTO transactions (account_id, category_id, amount, type, transaction_date, transaction_time, description, payment_method)
SELECT
  (SELECT id FROM accounts    WHERE lower(name) LIKE lower('%Bank Mandiri%')  LIMIT 1),
  (SELECT id FROM categories  WHERE lower(name) LIKE lower('%Perhiasan, aksesoris%') AND type = 'expense' LIMIT 1),
  505000,
  'expense',
  '2026-02-28',
  '23:00',
  'beli baju lebaran buat ibu bapak adek',
  NULL;

-- No. 36: 2026-03-02 | EXPENSE | Alkohol, tembakau | Rp17.500
INSERT INTO transactions (account_id, category_id, amount, type, transaction_date, transaction_time, description, payment_method)
SELECT
  (SELECT id FROM accounts    WHERE lower(name) LIKE lower('%Bank Mandiri%')  LIMIT 1),
  (SELECT id FROM categories  WHERE lower(name) LIKE lower('%Alkohol, tembakau%') AND type = 'expense' LIMIT 1),
  17500,
  'expense',
  '2026-03-02',
  '21:34',
  'beli rokok 76 mangga 1 bungkus',
  NULL;

-- No. 37: 2026-03-02 | EXPENSE | Makanan dan minuman | Rp16.000
INSERT INTO transactions (account_id, category_id, amount, type, transaction_date, transaction_time, description, payment_method)
SELECT
  (SELECT id FROM accounts    WHERE lower(name) LIKE lower('%Bank Mandiri%')  LIMIT 1),
  (SELECT id FROM categories  WHERE lower(name) LIKE lower('%Makanan dan minuman%') AND type = 'expense' LIMIT 1),
  16000,
  'expense',
  '2026-03-02',
  '21:38',
  'beli kwiteaw 1',
  NULL;

-- No. 38: 2026-03-03 | EXPENSE | Bar, kafe | Rp40.500
INSERT INTO transactions (account_id, category_id, amount, type, transaction_date, transaction_time, description, payment_method)
SELECT
  (SELECT id FROM accounts    WHERE lower(name) LIKE lower('%Bank Mandiri%')  LIMIT 1),
  (SELECT id FROM categories  WHERE lower(name) LIKE lower('%Bar, kafe%') AND type = 'expense' LIMIT 1),
  40500,
  'expense',
  '2026-03-03',
  '00:00',
  'bukber gugus pionir dan foto studio',
  NULL;

-- No. 39: 2026-03-05 | EXPENSE | Internet | Rp36.000
INSERT INTO transactions (account_id, category_id, amount, type, transaction_date, transaction_time, description, payment_method)
SELECT
  (SELECT id FROM accounts    WHERE lower(name) LIKE lower('%Bank Mandiri%')  LIMIT 1),
  (SELECT id FROM categories  WHERE lower(name) LIKE lower('%Internet%') AND type = 'expense' LIMIT 1),
  36000,
  'expense',
  '2026-03-05',
  '00:00',
  'Beli Kuota 10 GB 28 Hari Im3',
  NULL;

-- No. 40: 2026-03-05 | EXPENSE | Transportasi | Rp6.500
INSERT INTO transactions (account_id, category_id, amount, type, transaction_date, transaction_time, description, payment_method)
SELECT
  (SELECT id FROM accounts    WHERE lower(name) LIKE lower('%Bank Mandiri%')  LIMIT 1),
  (SELECT id FROM categories  WHERE lower(name) LIKE lower('%Transportasi%') AND type = 'expense' LIMIT 1),
  6500,
  'expense',
  '2026-03-05',
  '18:03',
  'Berangkat Grab untuk bukber',
  NULL;

-- No. 41: 2026-03-05 | EXPENSE | Transportasi | Rp6.500
INSERT INTO transactions (account_id, category_id, amount, type, transaction_date, transaction_time, description, payment_method)
SELECT
  (SELECT id FROM accounts    WHERE lower(name) LIKE lower('%Bank Mandiri%')  LIMIT 1),
  (SELECT id FROM categories  WHERE lower(name) LIKE lower('%Transportasi%') AND type = 'expense' LIMIT 1),
  6500,
  'expense',
  '2026-03-05',
  '21:23',
  'pulang dari bukber gugus',
  NULL;

-- No. 42: 2026-03-07 | EXPENSE | Makanan dan minuman | Rp7.500
INSERT INTO transactions (account_id, category_id, amount, type, transaction_date, transaction_time, description, payment_method)
SELECT
  (SELECT id FROM accounts    WHERE lower(name) LIKE lower('%Bank Mandiri%')  LIMIT 1),
  (SELECT id FROM categories  WHERE lower(name) LIKE lower('%Makanan dan minuman%') AND type = 'expense' LIMIT 1),
  7500,
  'expense',
  '2026-03-07',
  '03:06',
  'beli makan sahur',
  NULL;

-- No. 43: 2026-03-07 | EXPENSE | Peristiwa hidup | Rp51.000
INSERT INTO transactions (account_id, category_id, amount, type, transaction_date, transaction_time, description, payment_method)
SELECT
  (SELECT id FROM accounts    WHERE lower(name) LIKE lower('%Bank Mandiri%')  LIMIT 1),
  (SELECT id FROM categories  WHERE lower(name) LIKE lower('%Peristiwa hidup%') AND type = 'expense' LIMIT 1),
  51000,
  'expense',
  '2026-03-07',
  '13:12',
  'beli jajan buat girlfriend',
  NULL;

-- No. 44: 2026-03-08 | EXPENSE | Biaya, tarif | Rp5.500
INSERT INTO transactions (account_id, category_id, amount, type, transaction_date, transaction_time, description, payment_method)
SELECT
  (SELECT id FROM accounts    WHERE lower(name) LIKE lower('%Bank Mandiri%')  LIMIT 1),
  (SELECT id FROM categories  WHERE lower(name) LIKE lower('%Biaya, tarif%') AND type = 'expense' LIMIT 1),
  5500,
  'expense',
  '2026-03-08',
  '23:59',
  'biaya administrasi kartu debit',
  NULL;

-- No. 45: 2026-03-09 | EXPENSE | Makanan dan minuman | Rp9.000
INSERT INTO transactions (account_id, category_id, amount, type, transaction_date, transaction_time, description, payment_method)
SELECT
  (SELECT id FROM accounts    WHERE lower(name) LIKE lower('%Bank Mandiri%')  LIMIT 1),
  (SELECT id FROM categories  WHERE lower(name) LIKE lower('%Makanan dan minuman%') AND type = 'expense' LIMIT 1),
  9000,
  'expense',
  '2026-03-09',
  '00:00',
  'beli sahur',
  NULL;

-- No. 46: 2026-03-11 | INCOME | Pendapatan | Rp3.600.000
INSERT INTO transactions (account_id, category_id, amount, type, transaction_date, transaction_time, description, payment_method)
SELECT
  (SELECT id FROM accounts    WHERE lower(name) LIKE lower('%Bank Mandiri%')  LIMIT 1),
  (SELECT id FROM categories  WHERE lower(name) LIKE lower('%Pendapatan%') AND type = 'income' LIMIT 1),
  3600000,
  'income',
  '2026-03-11',
  '15:01',
  'Jardine scholarship (Biaya hidup triwulan pertama semester 2)',
  NULL;

-- No. 47: 2026-03-14 | EXPENSE | Makanan dan minuman | Rp17.500
INSERT INTO transactions (account_id, category_id, amount, type, transaction_date, transaction_time, description, payment_method)
SELECT
  (SELECT id FROM accounts    WHERE lower(name) LIKE lower('%Bank Mandiri%')  LIMIT 1),
  (SELECT id FROM categories  WHERE lower(name) LIKE lower('%Makanan dan minuman%') AND type = 'expense' LIMIT 1),
  17500,
  'expense',
  '2026-03-14',
  '01:58',
  'Beli indomie sambil bayar hutang pas nongkrong',
  NULL;

-- No. 48: 2026-03-14 | EXPENSE | Pinjaman, bunga | Rp100.000
INSERT INTO transactions (account_id, category_id, amount, type, transaction_date, transaction_time, description, payment_method)
SELECT
  (SELECT id FROM accounts    WHERE lower(name) LIKE lower('%Bank Mandiri%')  LIMIT 1),
  (SELECT id FROM categories  WHERE lower(name) LIKE lower('%Pinjaman, bunga%') AND type = 'expense' LIMIT 1),
  100000,
  'expense',
  '2026-03-14',
  '03:21',
  'Bayar Hutang Aji',
  NULL;

-- No. 49: 2026-03-14 | EXPENSE | Makanan dan minuman | Rp9.500
INSERT INTO transactions (account_id, category_id, amount, type, transaction_date, transaction_time, description, payment_method)
SELECT
  (SELECT id FROM accounts    WHERE lower(name) LIKE lower('%Bank Mandiri%')  LIMIT 1),
  (SELECT id FROM categories  WHERE lower(name) LIKE lower('%Makanan dan minuman%') AND type = 'expense' LIMIT 1),
  9500,
  'expense',
  '2026-03-14',
  '03:22',
  'beli sahur',
  NULL;

-- No. 50: 2026-03-14 | EXPENSE | Makanan dan minuman | Rp5.000
INSERT INTO transactions (account_id, category_id, amount, type, transaction_date, transaction_time, description, payment_method)
SELECT
  (SELECT id FROM accounts    WHERE lower(name) LIKE lower('%Bank Mandiri%')  LIMIT 1),
  (SELECT id FROM categories  WHERE lower(name) LIKE lower('%Makanan dan minuman%') AND type = 'expense' LIMIT 1),
  5000,
  'expense',
  '2026-03-14',
  '00:00',
  'beli es teh tarik',
  NULL;

-- No. 51: 2026-03-16 | EXPENSE | Kesehatan dan kecantikan | Rp20.000
INSERT INTO transactions (account_id, category_id, amount, type, transaction_date, transaction_time, description, payment_method)
SELECT
  (SELECT id FROM accounts    WHERE lower(name) LIKE lower('%Bank Mandiri%')  LIMIT 1),
  (SELECT id FROM categories  WHERE lower(name) LIKE lower('%Kesehatan dan kecantikan%') AND type = 'expense' LIMIT 1),
  20000,
  'expense',
  '2026-03-16',
  '17:11',
  'potong rambut',
  NULL;

-- No. 52: 2026-03-16 | EXPENSE | Makanan dan minuman | Rp10.000
INSERT INTO transactions (account_id, category_id, amount, type, transaction_date, transaction_time, description, payment_method)
SELECT
  (SELECT id FROM accounts    WHERE lower(name) LIKE lower('%Bank Mandiri%')  LIMIT 1),
  (SELECT id FROM categories  WHERE lower(name) LIKE lower('%Makanan dan minuman%') AND type = 'expense' LIMIT 1),
  10000,
  'expense',
  '2026-03-16',
  '00:00',
  'Beli jus buan naga',
  NULL;

-- No. 53: 2026-03-16 | EXPENSE | Lainnya | Rp1.500.000
INSERT INTO transactions (account_id, category_id, amount, type, transaction_date, transaction_time, description, payment_method)
SELECT
  (SELECT id FROM accounts    WHERE lower(name) LIKE lower('%Bank Mandiri%')  LIMIT 1),
  (SELECT id FROM categories  WHERE lower(name) LIKE lower('%Lainnya%') AND type = 'expense' LIMIT 1),
  1500000,
  'expense',
  '2026-03-16',
  '00:00',
  'Mas Dayat minjem uang',
  NULL;

-- No. 54: 2026-03-17 | EXPENSE | Makanan dan minuman | Rp9.500
INSERT INTO transactions (account_id, category_id, amount, type, transaction_date, transaction_time, description, payment_method)
SELECT
  (SELECT id FROM accounts    WHERE lower(name) LIKE lower('%Bank Mandiri%')  LIMIT 1),
  (SELECT id FROM categories  WHERE lower(name) LIKE lower('%Makanan dan minuman%') AND type = 'expense' LIMIT 1),
  9500,
  'expense',
  '2026-03-17',
  '16:00',
  'beli es bua',
  NULL;

-- No. 55: 2026-03-17 | EXPENSE | Makanan dan minuman | Rp19.000
INSERT INTO transactions (account_id, category_id, amount, type, transaction_date, transaction_time, description, payment_method)
SELECT
  (SELECT id FROM accounts    WHERE lower(name) LIKE lower('%Bank Mandiri%')  LIMIT 1),
  (SELECT id FROM categories  WHERE lower(name) LIKE lower('%Makanan dan minuman%') AND type = 'expense' LIMIT 1),
  19000,
  'expense',
  '2026-03-17',
  '16:00',
  'beli jus nanas + nanas potog',
  NULL;

-- No. 56: 2026-03-17 | EXPENSE | Makanan dan minuman | Rp9.500
INSERT INTO transactions (account_id, category_id, amount, type, transaction_date, transaction_time, description, payment_method)
SELECT
  (SELECT id FROM accounts    WHERE lower(name) LIKE lower('%Bank Mandiri%')  LIMIT 1),
  (SELECT id FROM categories  WHERE lower(name) LIKE lower('%Makanan dan minuman%') AND type = 'expense' LIMIT 1),
  9500,
  'expense',
  '2026-03-17',
  '00:00',
  'beli mie instant dua',
  NULL;

-- No. 57: 2026-03-17 | EXPENSE | Biaya, tarif | Rp2.500
INSERT INTO transactions (account_id, category_id, amount, type, transaction_date, transaction_time, description, payment_method)
SELECT
  (SELECT id FROM accounts    WHERE lower(name) LIKE lower('%Bank Mandiri%')  LIMIT 1),
  (SELECT id FROM categories  WHERE lower(name) LIKE lower('%Biaya, tarif%') AND type = 'expense' LIMIT 1),
  2500,
  'expense',
  '2026-03-17',
  '23:30',
  'Biaya transfer BI Fast',
  'Transfer bank';

-- No. 58: 2026-03-17 | EXPENSE | Lainnya | Rp10.000
INSERT INTO transactions (account_id, category_id, amount, type, transaction_date, transaction_time, description, payment_method)
SELECT
  (SELECT id FROM accounts    WHERE lower(name) LIKE lower('%Bank Mandiri%')  LIMIT 1),
  (SELECT id FROM categories  WHERE lower(name) LIKE lower('%Lainnya%') AND type = 'expense' LIMIT 1),
  10000,
  'expense',
  '2026-03-17',
  '23:30',
  'Transfer BI Fast Ke DNID FAQXX HIDXXXXXX 85742594985',
  'Transfer bank';

-- No. 59: 2026-03-17 | INCOME | Pendapatan | Rp14.500
INSERT INTO transactions (account_id, category_id, amount, type, transaction_date, transaction_time, description, payment_method)
SELECT
  (SELECT id FROM accounts    WHERE lower(name) LIKE lower('%Bank Mandiri%')  LIMIT 1),
  (SELECT id FROM categories  WHERE lower(name) LIKE lower('%Pendapatan%') AND type = 'income' LIMIT 1),
  14500,
  'income',
  '2026-03-17',
  '23:31',
  'Transfer antar Mandiri DARI ESPAY DEBIT INDONESI DANA001030414962616 Transfer Fee',
  'Transfer bank';

-- No. 60: 2026-03-18 | EXPENSE | Bahan makanan | Rp8.000
INSERT INTO transactions (account_id, category_id, amount, type, transaction_date, transaction_time, description, payment_method)
SELECT
  (SELECT id FROM accounts    WHERE lower(name) LIKE lower('%Bank Mandiri%')  LIMIT 1),
  (SELECT id FROM categories  WHERE lower(name) LIKE lower('%Bahan makanan%') AND type = 'expense' LIMIT 1),
  8000,
  'expense',
  '2026-03-18',
  '21:13',
  'Pembayaran QR ke CIRCLE K-YOG0207-QRIS 603180522493',
  'QRIS';

-- No. 61: 2026-03-19 | EXPENSE | Restoran, makanan cepat saji | Rp11.500
INSERT INTO transactions (account_id, category_id, amount, type, transaction_date, transaction_time, description, payment_method)
SELECT
  (SELECT id FROM accounts    WHERE lower(name) LIKE lower('%Bank Mandiri%')  LIMIT 1),
  (SELECT id FROM categories  WHERE lower(name) LIKE lower('%Restoran, makanan cepat saji%') AND type = 'expense' LIMIT 1),
  11500,
  'expense',
  '2026-03-19',
  '02:21',
  'Pembayaran QR ke PENYETAN MAK TUM 01, NGAG 603595024499',
  'QRIS';

-- No. 62: 2026-03-20 | EXPENSE | Bahan makanan | Rp19.900
INSERT INTO transactions (account_id, category_id, amount, type, transaction_date, transaction_time, description, payment_method)
SELECT
  (SELECT id FROM accounts    WHERE lower(name) LIKE lower('%Bank Mandiri%')  LIMIT 1),
  (SELECT id FROM categories  WHERE lower(name) LIKE lower('%Bahan makanan%') AND type = 'expense' LIMIT 1),
  19900,
  'expense',
  '2026-03-20',
  '01:44',
  'Pembayaran QR ke ALGO MIDI-BOYOLALI-QR 607823395671',
  'QRIS';

-- No. 63: 2026-03-20 | EXPENSE | Anak-anak | Rp12.000
INSERT INTO transactions (account_id, category_id, amount, type, transaction_date, transaction_time, description, payment_method)
SELECT
  (SELECT id FROM accounts    WHERE lower(name) LIKE lower('%Bank Mandiri%')  LIMIT 1),
  (SELECT id FROM categories  WHERE lower(name) LIKE lower('%Anak-anak%') AND type = 'expense' LIMIT 1),
  12000,
  'expense',
  '2026-03-20',
  '03:06',
  'Pembayaran QR ke VALEO BABY KIDS 603204129615',
  'QRIS';

-- No. 64: 2026-03-20 | EXPENSE | Layanan | Rp22.000
INSERT INTO transactions (account_id, category_id, amount, type, transaction_date, transaction_time, description, payment_method)
SELECT
  (SELECT id FROM accounts    WHERE lower(name) LIKE lower('%Bank Mandiri%')  LIMIT 1),
  (SELECT id FROM categories  WHERE lower(name) LIKE lower('%Layanan%') AND type = 'expense' LIMIT 1),
  22000,
  'expense',
  '2026-03-20',
  '15:39',
  'Pembayaran QR ke SMarT LAUNDRY QR BNI 603600357340',
  'QRIS';

-- No. 65: 2026-03-20 | EXPENSE | Restoran, makanan cepat saji | Rp37.000
INSERT INTO transactions (account_id, category_id, amount, type, transaction_date, transaction_time, description, payment_method)
SELECT
  (SELECT id FROM accounts    WHERE lower(name) LIKE lower('%Bank Mandiri%')  LIMIT 1),
  (SELECT id FROM categories  WHERE lower(name) LIKE lower('%Restoran, makanan cepat saji%') AND type = 'expense' LIMIT 1),
  37000,
  'expense',
  '2026-03-20',
  '17:46',
  'Pembayaran QR ke RM. PADANG PERGAULAN 603200716675',
  'QRIS';

-- No. 66: 2026-03-20 | EXPENSE | Biaya, tarif | Rp2.000
INSERT INTO transactions (account_id, category_id, amount, type, transaction_date, transaction_time, description, payment_method)
SELECT
  (SELECT id FROM accounts    WHERE lower(name) LIKE lower('%Bank Mandiri%')  LIMIT 1),
  (SELECT id FROM categories  WHERE lower(name) LIKE lower('%Biaya, tarif%') AND type = 'expense' LIMIT 1),
  2000,
  'expense',
  '2026-03-20',
  '17:59',
  'Biaya Transfer QR',
  'Transfer bank';

-- No. 67: 2026-03-20 | EXPENSE | Lainnya | Rp10.000
INSERT INTO transactions (account_id, category_id, amount, type, transaction_date, transaction_time, description, payment_method)
SELECT
  (SELECT id FROM accounts    WHERE lower(name) LIKE lower('%Bank Mandiri%')  LIMIT 1),
  (SELECT id FROM categories  WHERE lower(name) LIKE lower('%Lainnya%') AND type = 'expense' LIMIT 1),
  10000,
  'expense',
  '2026-03-20',
  '17:59',
  'Transfer QR ke DANA FAQIH HIDAYATULLOH No. Ref. 603208109036',
  'QRIS';

-- No. 68: 2026-03-23 | EXPENSE | Transportasi | Rp44.000
INSERT INTO transactions (account_id, category_id, amount, type, transaction_date, transaction_time, description, payment_method)
SELECT
  (SELECT id FROM accounts    WHERE lower(name) LIKE lower('%Bank Mandiri%')  LIMIT 1),
  (SELECT id FROM categories  WHERE lower(name) LIKE lower('%Transportasi%') AND type = 'expense' LIMIT 1),
  44000,
  'expense',
  '2026-03-23',
  '14:30',
  'Pembayaran QR ke GRAB TRANSPORT 603632213391',
  'QRIS';

-- No. 69: 2026-03-23 | EXPENSE | Restoran, makanan cepat saji | Rp54.800
INSERT INTO transactions (account_id, category_id, amount, type, transaction_date, transaction_time, description, payment_method)
SELECT
  (SELECT id FROM accounts    WHERE lower(name) LIKE lower('%Bank Mandiri%')  LIMIT 1),
  (SELECT id FROM categories  WHERE lower(name) LIKE lower('%Restoran, makanan cepat saji%') AND type = 'expense' LIMIT 1),
  54800,
  'expense',
  '2026-03-23',
  '22:00',
  'Pembayaran QR ke GRAB FOOD 603637160570',
  'QRIS';

-- No. 70: 2026-03-24 | EXPENSE | Biaya, tarif | Rp7.500
INSERT INTO transactions (account_id, category_id, amount, type, transaction_date, transaction_time, description, payment_method)
SELECT
  (SELECT id FROM accounts    WHERE lower(name) LIKE lower('%Bank Mandiri%')  LIMIT 1),
  (SELECT id FROM categories  WHERE lower(name) LIKE lower('%Biaya, tarif%') AND type = 'expense' LIMIT 1),
  7500,
  'expense',
  '2026-03-24',
  '10:24',
  'Biaya penarikan tunai di ATM Link 1140453',
  NULL;

-- No. 71: 2026-03-24 | EXPENSE | Lainnya | Rp300.000
INSERT INTO transactions (account_id, category_id, amount, type, transaction_date, transaction_time, description, payment_method)
SELECT
  (SELECT id FROM accounts    WHERE lower(name) LIKE lower('%Bank Mandiri%')  LIMIT 1),
  (SELECT id FROM categories  WHERE lower(name) LIKE lower('%Lainnya%') AND type = 'expense' LIMIT 1),
  300000,
  'expense',
  '2026-03-24',
  '10:24',
  'Penarikan tunai di ATM Link 1140453',
  NULL;

-- No. 72: 2026-03-28 | EXPENSE | Telepon, ponsel | Rp40.000
INSERT INTO transactions (account_id, category_id, amount, type, transaction_date, transaction_time, description, payment_method)
SELECT
  (SELECT id FROM accounts    WHERE lower(name) LIKE lower('%Bank Mandiri%')  LIMIT 1),
  (SELECT id FROM categories  WHERE lower(name) LIKE lower('%Telepon, ponsel%') AND type = 'expense' LIMIT 1),
  40000,
  'expense',
  '2026-03-28',
  '19:06',
  'Pembayaran QR ke IOH 603685430978',
  'QRIS';

-- No. 73: 2026-03-30 | EXPENSE | Restoran, makanan cepat saji | Rp14.000
INSERT INTO transactions (account_id, category_id, amount, type, transaction_date, transaction_time, description, payment_method)
SELECT
  (SELECT id FROM accounts    WHERE lower(name) LIKE lower('%Bank Mandiri%')  LIMIT 1),
  (SELECT id FROM categories  WHERE lower(name) LIKE lower('%Restoran, makanan cepat saji%') AND type = 'expense' LIMIT 1),
  14000,
  'expense',
  '2026-03-30',
  '08:41',
  'Pembayaran QR ke Kansas Tisaga 603300665258',
  'QRIS';

-- No. 74: 2026-03-30 | EXPENSE | Restoran, makanan cepat saji | Rp13.000
INSERT INTO transactions (account_id, category_id, amount, type, transaction_date, transaction_time, description, payment_method)
SELECT
  (SELECT id FROM accounts    WHERE lower(name) LIKE lower('%Bank Mandiri%')  LIMIT 1),
  (SELECT id FROM categories  WHERE lower(name) LIKE lower('%Restoran, makanan cepat saji%') AND type = 'expense' LIMIT 1),
  13000,
  'expense',
  '2026-03-30',
  '13:29',
  'Pembayaran QR ke WARUNG ALDIANO 603305210593',
  'QRIS';

-- No. 75: 2026-03-30 | EXPENSE | Restoran, makanan cepat saji | Rp19.000
INSERT INTO transactions (account_id, category_id, amount, type, transaction_date, transaction_time, description, payment_method)
SELECT
  (SELECT id FROM accounts    WHERE lower(name) LIKE lower('%Bank Mandiri%')  LIMIT 1),
  (SELECT id FROM categories  WHERE lower(name) LIKE lower('%Restoran, makanan cepat saji%') AND type = 'expense' LIMIT 1),
  19000,
  'expense',
  '2026-03-30',
  '19:09',
  'Pembayaran QR ke WARMINDO 603306116512',
  'QRIS';

-- No. 76: 2026-03-30 | EXPENSE | Restoran, makanan cepat saji | Rp6.000
INSERT INTO transactions (account_id, category_id, amount, type, transaction_date, transaction_time, description, payment_method)
SELECT
  (SELECT id FROM accounts    WHERE lower(name) LIKE lower('%Bank Mandiri%')  LIMIT 1),
  (SELECT id FROM categories  WHERE lower(name) LIKE lower('%Restoran, makanan cepat saji%') AND type = 'expense' LIMIT 1),
  6000,
  'expense',
  '2026-03-30',
  '20:15',
  'Pembayaran QR ke QR Angkringan Pak Panut 603302450165',
  'QRIS';

-- No. 77: 2026-03-30 | EXPENSE | Restoran, makanan cepat saji | Rp8.000
INSERT INTO transactions (account_id, category_id, amount, type, transaction_date, transaction_time, description, payment_method)
SELECT
  (SELECT id FROM accounts    WHERE lower(name) LIKE lower('%Bank Mandiri%')  LIMIT 1),
  (SELECT id FROM categories  WHERE lower(name) LIKE lower('%Restoran, makanan cepat saji%') AND type = 'expense' LIMIT 1),
  8000,
  'expense',
  '2026-03-30',
  '20:53',
  'Pembayaran QR ke QR Angkringan Pak Panut 603302556037',
  'QRIS';

-- No. 78: 2026-03-31 | EXPENSE | Transportasi | Rp6.500
INSERT INTO transactions (account_id, category_id, amount, type, transaction_date, transaction_time, description, payment_method)
SELECT
  (SELECT id FROM accounts    WHERE lower(name) LIKE lower('%Bank Mandiri%')  LIMIT 1),
  (SELECT id FROM categories  WHERE lower(name) LIKE lower('%Transportasi%') AND type = 'expense' LIMIT 1),
  6500,
  'expense',
  '2026-03-31',
  '09:55',
  'Pembayaran QR ke GRAB TRANSPORT 603717441187',
  'QRIS';

-- No. 79: 2026-03-31 | EXPENSE | Restoran, makanan cepat saji | Rp26.000
INSERT INTO transactions (account_id, category_id, amount, type, transaction_date, transaction_time, description, payment_method)
SELECT
  (SELECT id FROM accounts    WHERE lower(name) LIKE lower('%Bank Mandiri%')  LIMIT 1),
  (SELECT id FROM categories  WHERE lower(name) LIKE lower('%Restoran, makanan cepat saji%') AND type = 'expense' LIMIT 1),
  26000,
  'expense',
  '2026-03-31',
  '10:54',
  'Pembayaran QR ke WARMINDO PUTRA BAROKAH 603713695806',
  'QRIS';

-- No. 80: 2026-03-31 | EXPENSE | Restoran, makanan cepat saji | Rp15.500
INSERT INTO transactions (account_id, category_id, amount, type, transaction_date, transaction_time, description, payment_method)
SELECT
  (SELECT id FROM accounts    WHERE lower(name) LIKE lower('%Bank Mandiri%')  LIMIT 1),
  (SELECT id FROM categories  WHERE lower(name) LIKE lower('%Restoran, makanan cepat saji%') AND type = 'expense' LIMIT 1),
  15500,
  'expense',
  '2026-03-31',
  '21:12',
  'Pembayaran QR ke warmindo kedai mutiara 2. 603710669345',
  'QRIS';

-- No. 81: 2026-03-31 | EXPENSE | Biaya, tarif | Rp6.000
INSERT INTO transactions (account_id, category_id, amount, type, transaction_date, transaction_time, description, payment_method)
SELECT
  (SELECT id FROM accounts    WHERE lower(name) LIKE lower('%Bank Mandiri%')  LIMIT 1),
  (SELECT id FROM categories  WHERE lower(name) LIKE lower('%Biaya, tarif%') AND type = 'expense' LIMIT 1),
  6000,
  'expense',
  '2026-03-31',
  '23:59',
  'Biaya administrasi rekening',
  NULL;

-- No. 82: 2026-04-01 | EXPENSE | Restoran, makanan cepat saji | Rp11.000
INSERT INTO transactions (account_id, category_id, amount, type, transaction_date, transaction_time, description, payment_method)
SELECT
  (SELECT id FROM accounts    WHERE lower(name) LIKE lower('%Bank Mandiri%')  LIMIT 1),
  (SELECT id FROM categories  WHERE lower(name) LIKE lower('%Restoran, makanan cepat saji%') AND type = 'expense' LIMIT 1),
  11000,
  'expense',
  '2026-04-01',
  '09:27',
  'Pembayaran QR ke nieta kitchen 604011701790',
  'QRIS';

-- No. 83: 2026-04-01 | EXPENSE | Biaya, tarif | Rp2.500
INSERT INTO transactions (account_id, category_id, amount, type, transaction_date, transaction_time, description, payment_method)
SELECT
  (SELECT id FROM accounts    WHERE lower(name) LIKE lower('%Bank Mandiri%')  LIMIT 1),
  (SELECT id FROM categories  WHERE lower(name) LIKE lower('%Biaya, tarif%') AND type = 'expense' LIMIT 1),
  2500,
  'expense',
  '2026-04-01',
  '11:50',
  'Biaya transfer BI Fast',
  'Transfer bank';

-- No. 84: 2026-04-01 | EXPENSE | Lainnya | Rp150.000
INSERT INTO transactions (account_id, category_id, amount, type, transaction_date, transaction_time, description, payment_method)
SELECT
  (SELECT id FROM accounts    WHERE lower(name) LIKE lower('%Bank Mandiri%')  LIMIT 1),
  (SELECT id FROM categories  WHERE lower(name) LIKE lower('%Lainnya%') AND type = 'expense' LIMIT 1),
  150000,
  'expense',
  '2026-04-01',
  '11:50',
  'Transfer BI Fast Ke DNID SULXXXX FUAXX 88983882984',
  'Transfer bank';

-- No. 85: 2026-04-01 | EXPENSE | Restoran, makanan cepat saji | Rp5.000
INSERT INTO transactions (account_id, category_id, amount, type, transaction_date, transaction_time, description, payment_method)
SELECT
  (SELECT id FROM accounts    WHERE lower(name) LIKE lower('%Bank Mandiri%')  LIMIT 1),
  (SELECT id FROM categories  WHERE lower(name) LIKE lower('%Restoran, makanan cepat saji%') AND type = 'expense' LIMIT 1),
  5000,
  'expense',
  '2026-04-01',
  '15:11',
  'Pembayaran QR ke QR RAWON BU TUTUT. 604016580526',
  'QRIS';

-- No. 86: 2026-04-01 | EXPENSE | Restoran, makanan cepat saji | Rp20.000
INSERT INTO transactions (account_id, category_id, amount, type, transaction_date, transaction_time, description, payment_method)
SELECT
  (SELECT id FROM accounts    WHERE lower(name) LIKE lower('%Bank Mandiri%')  LIMIT 1),
  (SELECT id FROM categories  WHERE lower(name) LIKE lower('%Restoran, makanan cepat saji%') AND type = 'expense' LIMIT 1),
  20000,
  'expense',
  '2026-04-01',
  '22:46',
  'Pembayaran QR ke WARMINDO PUTRA BAROKAH 604418049468',
  'QRIS';

-- No. 87: 2026-04-02 | EXPENSE | Restoran, makanan cepat saji | Rp12.000
INSERT INTO transactions (account_id, category_id, amount, type, transaction_date, transaction_time, description, payment_method)
SELECT
  (SELECT id FROM accounts    WHERE lower(name) LIKE lower('%Bank Mandiri%')  LIMIT 1),
  (SELECT id FROM categories  WHERE lower(name) LIKE lower('%Restoran, makanan cepat saji%') AND type = 'expense' LIMIT 1),
  12000,
  'expense',
  '2026-04-02',
  '07:11',
  'Pembayaran QR ke WARUNG MBAK RUM PUJALE UG 604028579419',
  'QRIS';

-- No. 88: 2026-04-02 | EXPENSE | Restoran, makanan cepat saji | Rp10.000
INSERT INTO transactions (account_id, category_id, amount, type, transaction_date, transaction_time, description, payment_method)
SELECT
  (SELECT id FROM accounts    WHERE lower(name) LIKE lower('%Bank Mandiri%')  LIMIT 1),
  (SELECT id FROM categories  WHERE lower(name) LIKE lower('%Restoran, makanan cepat saji%') AND type = 'expense' LIMIT 1),
  10000,
  'expense',
  '2026-04-02',
  '12:03',
  'Pembayaran QR ke WARUNG P. SUPARDI 604020456595',
  'QRIS';

-- No. 89: 2026-04-02 | EXPENSE | Restoran, makanan cepat saji | Rp24.000
INSERT INTO transactions (account_id, category_id, amount, type, transaction_date, transaction_time, description, payment_method)
SELECT
  (SELECT id FROM accounts    WHERE lower(name) LIKE lower('%Bank Mandiri%')  LIMIT 1),
  (SELECT id FROM categories  WHERE lower(name) LIKE lower('%Restoran, makanan cepat saji%') AND type = 'expense' LIMIT 1),
  24000,
  'expense',
  '2026-04-02',
  '18:36',
  'Pembayaran QR ke WARUNG HIKMAH 604021618141',
  'QRIS';

-- No. 90: 2026-04-02 | EXPENSE | Restoran, makanan cepat saji | Rp18.000
INSERT INTO transactions (account_id, category_id, amount, type, transaction_date, transaction_time, description, payment_method)
SELECT
  (SELECT id FROM accounts    WHERE lower(name) LIKE lower('%Bank Mandiri%')  LIMIT 1),
  (SELECT id FROM categories  WHERE lower(name) LIKE lower('%Restoran, makanan cepat saji%') AND type = 'expense' LIMIT 1),
  18000,
  'expense',
  '2026-04-02',
  '20:47',
  'Pembayaran QR ke NASI GORENG FLAMBOYAN 604422067448',
  'QRIS';

-- No. 91: 2026-04-03 | EXPENSE | Restoran, makanan cepat saji | Rp19.000
INSERT INTO transactions (account_id, category_id, amount, type, transaction_date, transaction_time, description, payment_method)
SELECT
  (SELECT id FROM accounts    WHERE lower(name) LIKE lower('%Bank Mandiri%')  LIMIT 1),
  (SELECT id FROM categories  WHERE lower(name) LIKE lower('%Restoran, makanan cepat saji%') AND type = 'expense' LIMIT 1),
  19000,
  'expense',
  '2026-04-03',
  '10:35',
  'Pembayaran QR ke WARMINDO PUTRA BAROKAH 604437210228',
  'QRIS';

-- No. 92: 2026-04-04 | EXPENSE | Restoran, makanan cepat saji | Rp21.000
INSERT INTO transactions (account_id, category_id, amount, type, transaction_date, transaction_time, description, payment_method)
SELECT
  (SELECT id FROM accounts    WHERE lower(name) LIKE lower('%Bank Mandiri%')  LIMIT 1),
  (SELECT id FROM categories  WHERE lower(name) LIKE lower('%Restoran, makanan cepat saji%') AND type = 'expense' LIMIT 1),
  21000,
  'expense',
  '2026-04-04',
  '17:51',
  'Pembayaran QR ke Warung Jepun Jogja 1 604442879019',
  'QRIS';

-- No. 93: 2026-04-04 | EXPENSE | Bahan makanan | Rp27.400
INSERT INTO transactions (account_id, category_id, amount, type, transaction_date, transaction_time, description, payment_method)
SELECT
  (SELECT id FROM accounts    WHERE lower(name) LIKE lower('%Bank Mandiri%')  LIMIT 1),
  (SELECT id FROM categories  WHERE lower(name) LIKE lower('%Bahan makanan%') AND type = 'expense' LIMIT 1),
  27400,
  'expense',
  '2026-04-04',
  '21:57',
  'Pembayaran QR ke LWSN 6B06 KALIURANG KM5 260949241496',
  'QRIS';

-- No. 94: 2026-04-05 | EXPENSE | Restoran, makanan cepat saji | Rp19.500
INSERT INTO transactions (account_id, category_id, amount, type, transaction_date, transaction_time, description, payment_method)
SELECT
  (SELECT id FROM accounts    WHERE lower(name) LIKE lower('%Bank Mandiri%')  LIMIT 1),
  (SELECT id FROM categories  WHERE lower(name) LIKE lower('%Restoran, makanan cepat saji%') AND type = 'expense' LIMIT 1),
  19500,
  'expense',
  '2026-04-05',
  '10:07',
  'Pembayaran QR ke WARUNG HIKMAH 604054651021',
  'QRIS';

-- No. 95: 2026-04-05 | EXPENSE | Belanja | Rp34.300
INSERT INTO transactions (account_id, category_id, amount, type, transaction_date, transaction_time, description, payment_method)
SELECT
  (SELECT id FROM accounts    WHERE lower(name) LIKE lower('%Bank Mandiri%')  LIMIT 1),
  (SELECT id FROM categories  WHERE lower(name) LIKE lower('%Belanja%') AND type = 'expense' LIMIT 1),
  34300,
  'expense',
  '2026-04-05',
  '11:33',
  'Pembayaran QR ke Shopee Indonesia 604058752324',
  'QRIS';

-- No. 96: 2026-04-05 | EXPENSE | Belanja | Rp10.000
INSERT INTO transactions (account_id, category_id, amount, type, transaction_date, transaction_time, description, payment_method)
SELECT
  (SELECT id FROM accounts    WHERE lower(name) LIKE lower('%Bank Mandiri%')  LIMIT 1),
  (SELECT id FROM categories  WHERE lower(name) LIKE lower('%Belanja%') AND type = 'expense' LIMIT 1),
  10000,
  'expense',
  '2026-04-05',
  '22:12',
  'Pembayaran QR ke toko rain 604455696531',
  'QRIS';

-- No. 97: 2026-04-05 | EXPENSE | Restoran, makanan cepat saji | Rp25.500
INSERT INTO transactions (account_id, category_id, amount, type, transaction_date, transaction_time, description, payment_method)
SELECT
  (SELECT id FROM accounts    WHERE lower(name) LIKE lower('%Bank Mandiri%')  LIMIT 1),
  (SELECT id FROM categories  WHERE lower(name) LIKE lower('%Restoran, makanan cepat saji%') AND type = 'expense' LIMIT 1),
  25500,
  'expense',
  '2026-04-05',
  '22:56',
  'Pembayaran QR ke Warung Mapan Barokah, TEB 604055775731',
  'QRIS';

-- No. 98: 2026-04-06 | EXPENSE | Restoran, makanan cepat saji | Rp5.000
INSERT INTO transactions (account_id, category_id, amount, type, transaction_date, transaction_time, description, payment_method)
SELECT
  (SELECT id FROM accounts    WHERE lower(name) LIKE lower('%Bank Mandiri%')  LIMIT 1),
  (SELECT id FROM categories  WHERE lower(name) LIKE lower('%Restoran, makanan cepat saji%') AND type = 'expense' LIMIT 1),
  5000,
  'expense',
  '2026-04-06',
  '09:04',
  'Pembayaran QR ke QOMA SALAD INDONESIA 604462493475',
  'QRIS';

-- No. 99: 2026-04-06 | EXPENSE | Restoran, makanan cepat saji | Rp11.000
INSERT INTO transactions (account_id, category_id, amount, type, transaction_date, transaction_time, description, payment_method)
SELECT
  (SELECT id FROM accounts    WHERE lower(name) LIKE lower('%Bank Mandiri%')  LIMIT 1),
  (SELECT id FROM categories  WHERE lower(name) LIKE lower('%Restoran, makanan cepat saji%') AND type = 'expense' LIMIT 1),
  11000,
  'expense',
  '2026-04-06',
  '13:46',
  'Pembayaran QR ke WARUNG P. SUPARDI 604063221246',
  'QRIS';

-- No. 100: 2026-04-06 | EXPENSE | Pendidikan, pengembangan diri | Rp200.000
INSERT INTO transactions (account_id, category_id, amount, type, transaction_date, transaction_time, description, payment_method)
SELECT
  (SELECT id FROM accounts    WHERE lower(name) LIKE lower('%Bank Mandiri%')  LIMIT 1),
  (SELECT id FROM categories  WHERE lower(name) LIKE lower('%Pendidikan, pengembangan diri%') AND type = 'expense' LIMIT 1),
  200000,
  'expense',
  '2026-04-06',
  '21:13',
  'Pembayaran UTBK SNPMB 2026 008222168157327860',
  NULL;

-- No. 101: 2026-04-07 | EXPENSE | Restoran, makanan cepat saji | Rp17.000
INSERT INTO transactions (account_id, category_id, amount, type, transaction_date, transaction_time, description, payment_method)
SELECT
  (SELECT id FROM accounts    WHERE lower(name) LIKE lower('%Bank Mandiri%')  LIMIT 1),
  (SELECT id FROM categories  WHERE lower(name) LIKE lower('%Restoran, makanan cepat saji%') AND type = 'expense' LIMIT 1),
  17000,
  'expense',
  '2026-04-07',
  '09:00',
  'Pembayaran QR ke nieta kitchen 604079212909',
  'QRIS';

-- No. 102: 2026-04-07 | EXPENSE | Restoran, makanan cepat saji | Rp3.000
INSERT INTO transactions (account_id, category_id, amount, type, transaction_date, transaction_time, description, payment_method)
SELECT
  (SELECT id FROM accounts    WHERE lower(name) LIKE lower('%Bank Mandiri%')  LIMIT 1),
  (SELECT id FROM categories  WHERE lower(name) LIKE lower('%Restoran, makanan cepat saji%') AND type = 'expense' LIMIT 1),
  3000,
  'expense',
  '2026-04-07',
  '10:24',
  'Pembayaran QR ke WARUNG TENTREM PUJALE, DE 604070642523',
  'QRIS';

-- No. 103: 2026-04-07 | EXPENSE | Restoran, makanan cepat saji | Rp10.000
INSERT INTO transactions (account_id, category_id, amount, type, transaction_date, transaction_time, description, payment_method)
SELECT
  (SELECT id FROM accounts    WHERE lower(name) LIKE lower('%Bank Mandiri%')  LIMIT 1),
  (SELECT id FROM categories  WHERE lower(name) LIKE lower('%Restoran, makanan cepat saji%') AND type = 'expense' LIMIT 1),
  10000,
  'expense',
  '2026-04-07',
  '10:50',
  'Pembayaran QR ke WARUNG TENTREM PUJALE, DE 604070705576',
  'QRIS';

-- No. 104: 2026-04-07 | EXPENSE | Restoran, makanan cepat saji | Rp15.000
INSERT INTO transactions (account_id, category_id, amount, type, transaction_date, transaction_time, description, payment_method)
SELECT
  (SELECT id FROM accounts    WHERE lower(name) LIKE lower('%Bank Mandiri%')  LIMIT 1),
  (SELECT id FROM categories  WHERE lower(name) LIKE lower('%Restoran, makanan cepat saji%') AND type = 'expense' LIMIT 1),
  15000,
  'expense',
  '2026-04-07',
  '21:12',
  'Pembayaran QR ke Warung Kenari klebengan 604076368715',
  'QRIS';

-- No. 105: 2026-04-07 | EXPENSE | Restoran, makanan cepat saji | Rp500
INSERT INTO transactions (account_id, category_id, amount, type, transaction_date, transaction_time, description, payment_method)
SELECT
  (SELECT id FROM accounts    WHERE lower(name) LIKE lower('%Bank Mandiri%')  LIMIT 1),
  (SELECT id FROM categories  WHERE lower(name) LIKE lower('%Restoran, makanan cepat saji%') AND type = 'expense' LIMIT 1),
  500,
  'expense',
  '2026-04-07',
  '21:12',
  'Pembayaran QR ke Warung Kenari klebengan 604076369946',
  'QRIS';

-- No. 106: 2026-04-08 | EXPENSE | Restoran, makanan cepat saji | Rp9.500
INSERT INTO transactions (account_id, category_id, amount, type, transaction_date, transaction_time, description, payment_method)
SELECT
  (SELECT id FROM accounts    WHERE lower(name) LIKE lower('%Bank Mandiri%')  LIMIT 1),
  (SELECT id FROM categories  WHERE lower(name) LIKE lower('%Restoran, makanan cepat saji%') AND type = 'expense' LIMIT 1),
  9500,
  'expense',
  '2026-04-08',
  '08:10',
  'Pembayaran QR ke WARUNG MAKAN MAK TUM, DEP 604087141065',
  'QRIS';

-- No. 107: 2026-04-08 | EXPENSE | Restoran, makanan cepat saji | Rp16.000
INSERT INTO transactions (account_id, category_id, amount, type, transaction_date, transaction_time, description, payment_method)
SELECT
  (SELECT id FROM accounts    WHERE lower(name) LIKE lower('%Bank Mandiri%')  LIMIT 1),
  (SELECT id FROM categories  WHERE lower(name) LIKE lower('%Restoran, makanan cepat saji%') AND type = 'expense' LIMIT 1),
  16000,
  'expense',
  '2026-04-08',
  '16:35',
  'Pembayaran QR ke AB062 CHINEESE FOOD MO... 604088416246',
  'QRIS';

-- No. 108: 2026-04-08 | INCOME | Pendapatan | Rp50.000
INSERT INTO transactions (account_id, category_id, amount, type, transaction_date, transaction_time, description, payment_method)
SELECT
  (SELECT id FROM accounts    WHERE lower(name) LIKE lower('%Bank Mandiri%')  LIMIT 1),
  (SELECT id FROM categories  WHERE lower(name) LIKE lower('%Pendapatan%') AND type = 'income' LIMIT 1),
  50000,
  'income',
  '2026-04-08',
  '18:12',
  'Transfer BI Fast Dari SULKHAN FUAZI 6288983882984 DANA20260408DANAIDJ101009904849258SULKH',
  'Transfer bank';

-- No. 109: 2026-04-08 | EXPENSE | Restoran, makanan cepat saji | Rp15.500
INSERT INTO transactions (account_id, category_id, amount, type, transaction_date, transaction_time, description, payment_method)
SELECT
  (SELECT id FROM accounts    WHERE lower(name) LIKE lower('%Bank Mandiri%')  LIMIT 1),
  (SELECT id FROM categories  WHERE lower(name) LIKE lower('%Restoran, makanan cepat saji%') AND type = 'expense' LIMIT 1),
  15500,
  'expense',
  '2026-04-08',
  '21:09',
  'Pembayaran QR ke Warung Kenari klebengan 604089260418',
  'QRIS';

-- No. 110: 2026-04-08 | EXPENSE | Biaya, tarif | Rp5.500
INSERT INTO transactions (account_id, category_id, amount, type, transaction_date, transaction_time, description, payment_method)
SELECT
  (SELECT id FROM accounts    WHERE lower(name) LIKE lower('%Bank Mandiri%')  LIMIT 1),
  (SELECT id FROM categories  WHERE lower(name) LIKE lower('%Biaya, tarif%') AND type = 'expense' LIMIT 1),
  5500,
  'expense',
  '2026-04-08',
  '23:59',
  'Biaya administrasi kartu debit',
  NULL;

-- No. 111: 2026-04-09 | EXPENSE | Alat tulis, peralatan | Rp15.000
INSERT INTO transactions (account_id, category_id, amount, type, transaction_date, transaction_time, description, payment_method)
SELECT
  (SELECT id FROM accounts    WHERE lower(name) LIKE lower('%Bank Mandiri%')  LIMIT 1),
  (SELECT id FROM categories  WHERE lower(name) LIKE lower('%Alat tulis, peralatan%') AND type = 'expense' LIMIT 1),
  15000,
  'expense',
  '2026-04-09',
  '12:45',
  'Pembayaran QR ke AMIRA FOTOCOPY 604091793299',
  'QRIS';

-- No. 112: 2026-04-09 | EXPENSE | Restoran, makanan cepat saji | Rp10.500
INSERT INTO transactions (account_id, category_id, amount, type, transaction_date, transaction_time, description, payment_method)
SELECT
  (SELECT id FROM accounts    WHERE lower(name) LIKE lower('%Bank Mandiri%')  LIMIT 1),
  (SELECT id FROM categories  WHERE lower(name) LIKE lower('%Restoran, makanan cepat saji%') AND type = 'expense' LIMIT 1),
  10500,
  'expense',
  '2026-04-09',
  '13:23',
  'Pembayaran QR ke WARUNG TENTREM PUJALE, DE 604096055574',
  'QRIS';

-- No. 113: 2026-04-09 | EXPENSE | Restoran, makanan cepat saji | Rp17.000
INSERT INTO transactions (account_id, category_id, amount, type, transaction_date, transaction_time, description, payment_method)
SELECT
  (SELECT id FROM accounts    WHERE lower(name) LIKE lower('%Bank Mandiri%')  LIMIT 1),
  (SELECT id FROM categories  WHERE lower(name) LIKE lower('%Restoran, makanan cepat saji%') AND type = 'expense' LIMIT 1),
  17000,
  'expense',
  '2026-04-09',
  '21:38',
  'Pembayaran QR ke AB062 CHINEESE FOOD MO... 604097472371',
  'QRIS';

-- No. 114: 2026-04-09 | EXPENSE | Restoran, makanan cepat saji | Rp5.000
INSERT INTO transactions (account_id, category_id, amount, type, transaction_date, transaction_time, description, payment_method)
SELECT
  (SELECT id FROM accounts    WHERE lower(name) LIKE lower('%Bank Mandiri%')  LIMIT 1),
  (SELECT id FROM categories  WHERE lower(name) LIKE lower('%Restoran, makanan cepat saji%') AND type = 'expense' LIMIT 1),
  5000,
  'expense',
  '2026-04-09',
  '21:41',
  'Pembayaran QR ke WARUNG HIKMAH 604097478619',
  'QRIS';

-- No. 115: 2026-04-10 | EXPENSE | Restoran, makanan cepat saji | Rp13.000
INSERT INTO transactions (account_id, category_id, amount, type, transaction_date, transaction_time, description, payment_method)
SELECT
  (SELECT id FROM accounts    WHERE lower(name) LIKE lower('%Bank Mandiri%')  LIMIT 1),
  (SELECT id FROM categories  WHERE lower(name) LIKE lower('%Restoran, makanan cepat saji%') AND type = 'expense' LIMIT 1),
  13000,
  'expense',
  '2026-04-10',
  '08:00',
  'Pembayaran QR ke nieta kitchen 604108055600',
  'QRIS';

-- No. 116: 2026-04-10 | EXPENSE | Restoran, makanan cepat saji | Rp9.500
INSERT INTO transactions (account_id, category_id, amount, type, transaction_date, transaction_time, description, payment_method)
SELECT
  (SELECT id FROM accounts    WHERE lower(name) LIKE lower('%Bank Mandiri%')  LIMIT 1),
  (SELECT id FROM categories  WHERE lower(name) LIKE lower('%Restoran, makanan cepat saji%') AND type = 'expense' LIMIT 1),
  9500,
  'expense',
  '2026-04-10',
  '17:21',
  'Pembayaran QR ke WARUNG HIKMAH 604100740559',
  'QRIS';

-- No. 117: 2026-04-11 | EXPENSE | Bar, kafe | Rp18.000
INSERT INTO transactions (account_id, category_id, amount, type, transaction_date, transaction_time, description, payment_method)
SELECT
  (SELECT id FROM accounts    WHERE lower(name) LIKE lower('%Bank Mandiri%')  LIMIT 1),
  (SELECT id FROM categories  WHERE lower(name) LIKE lower('%Bar, kafe%') AND type = 'expense' LIMIT 1),
  18000,
  'expense',
  '2026-04-11',
  '20:45',
  'Pembayaran QR ke Toko Kopi Sedaya, DEPOK 604118540062',
  'QRIS';

-- No. 118: 2026-04-12 | EXPENSE | Restoran, makanan cepat saji | Rp15.500
INSERT INTO transactions (account_id, category_id, amount, type, transaction_date, transaction_time, description, payment_method)
SELECT
  (SELECT id FROM accounts    WHERE lower(name) LIKE lower('%Bank Mandiri%')  LIMIT 1),
  (SELECT id FROM categories  WHERE lower(name) LIKE lower('%Restoran, makanan cepat saji%') AND type = 'expense' LIMIT 1),
  15500,
  'expense',
  '2026-04-12',
  '02:22',
  'Pembayaran QR ke Nasi Goreng Jembatan Mera 604120203678',
  'QRIS';

-- No. 119: 2026-04-12 | EXPENSE | Restoran, makanan cepat saji | Rp9.000
INSERT INTO transactions (account_id, category_id, amount, type, transaction_date, transaction_time, description, payment_method)
SELECT
  (SELECT id FROM accounts    WHERE lower(name) LIKE lower('%Bank Mandiri%')  LIMIT 1),
  (SELECT id FROM categories  WHERE lower(name) LIKE lower('%Restoran, makanan cepat saji%') AND type = 'expense' LIMIT 1),
  9000,
  'expense',
  '2026-04-12',
  '09:31',
  'Pembayaran QR ke GRAB FOOD 604129612415',
  'QRIS';

-- No. 120: 2026-04-12 | EXPENSE | Lainnya | Rp400.000
INSERT INTO transactions (account_id, category_id, amount, type, transaction_date, transaction_time, description, payment_method)
SELECT
  (SELECT id FROM accounts    WHERE lower(name) LIKE lower('%Bank Mandiri%')  LIMIT 1),
  (SELECT id FROM categories  WHERE lower(name) LIKE lower('%Lainnya%') AND type = 'expense' LIMIT 1),
  400000,
  'expense',
  '2026-04-12',
  '12:04',
  'Transfer ke BANK MANDIRI ADAM MASDA PUTRA 1370024102234',
  'Transfer bank';

-- No. 121: 2026-04-12 | EXPENSE | Restoran, makanan cepat saji | Rp10.000
INSERT INTO transactions (account_id, category_id, amount, type, transaction_date, transaction_time, description, payment_method)
SELECT
  (SELECT id FROM accounts    WHERE lower(name) LIKE lower('%Bank Mandiri%')  LIMIT 1),
  (SELECT id FROM categories  WHERE lower(name) LIKE lower('%Restoran, makanan cepat saji%') AND type = 'expense' LIMIT 1),
  10000,
  'expense',
  '2026-04-12',
  '14:06',
  'Pembayaran QR ke Warmindo Sami Asih 2 604125507073',
  'QRIS';

-- No. 122: 2026-04-12 | EXPENSE | Makanan dan minuman | Rp10.900
INSERT INTO transactions (account_id, category_id, amount, type, transaction_date, transaction_time, description, payment_method)
SELECT
  (SELECT id FROM accounts    WHERE lower(name) LIKE lower('%Bank Mandiri%')  LIMIT 1),
  (SELECT id FROM categories  WHERE lower(name) LIKE lower('%Makanan dan minuman%') AND type = 'expense' LIMIT 1),
  10900,
  'expense',
  '2026-04-12',
  '18:27',
  'Pembayaran QR ke JUMPSTART 604126265785',
  'QRIS';

-- No. 123: 2026-04-13 | EXPENSE | Restoran, makanan cepat saji | Rp13.000
INSERT INTO transactions (account_id, category_id, amount, type, transaction_date, transaction_time, description, payment_method)
SELECT
  (SELECT id FROM accounts    WHERE lower(name) LIKE lower('%Bank Mandiri%')  LIMIT 1),
  (SELECT id FROM categories  WHERE lower(name) LIKE lower('%Restoran, makanan cepat saji%') AND type = 'expense' LIMIT 1),
  13000,
  'expense',
  '2026-04-13',
  '07:46',
  'Pembayaran QR ke GRAB FOOD 604133571973',
  'QRIS';

-- No. 124: 2026-04-13 | EXPENSE | Restoran, makanan cepat saji | Rp10.000
INSERT INTO transactions (account_id, category_id, amount, type, transaction_date, transaction_time, description, payment_method)
SELECT
  (SELECT id FROM accounts    WHERE lower(name) LIKE lower('%Bank Mandiri%')  LIMIT 1),
  (SELECT id FROM categories  WHERE lower(name) LIKE lower('%Restoran, makanan cepat saji%') AND type = 'expense' LIMIT 1),
  10000,
  'expense',
  '2026-04-13',
  '14:14',
  'Pembayaran QR ke WARUNG TENTREM PUJALE, DE 604138318339',
  'QRIS';

-- No. 125: 2026-04-13 | EXPENSE | Restoran, makanan cepat saji | Rp10.500
INSERT INTO transactions (account_id, category_id, amount, type, transaction_date, transaction_time, description, payment_method)
SELECT
  (SELECT id FROM accounts    WHERE lower(name) LIKE lower('%Bank Mandiri%')  LIMIT 1),
  (SELECT id FROM categories  WHERE lower(name) LIKE lower('%Restoran, makanan cepat saji%') AND type = 'expense' LIMIT 1),
  10500,
  'expense',
  '2026-04-13',
  '22:32',
  'Pembayaran QR ke SINAR MINANG COLOMBO 604539719749',
  'QRIS';

-- No. 126: 2026-04-14 | EXPENSE | Makanan dan minuman | Rp3.000
INSERT INTO transactions (account_id, category_id, amount, type, transaction_date, transaction_time, description, payment_method)
SELECT
  (SELECT id FROM accounts    WHERE lower(name) LIKE lower('%Bank Mandiri%')  LIMIT 1),
  (SELECT id FROM categories  WHERE lower(name) LIKE lower('%Makanan dan minuman%') AND type = 'expense' LIMIT 1),
  3000,
  'expense',
  '2026-04-14',
  '13:04',
  'Pembayaran QR ke Sunflow 604142324113',
  'QRIS';

-- No. 127: 2026-04-14 | EXPENSE | Biaya, tarif | Rp2.500
INSERT INTO transactions (account_id, category_id, amount, type, transaction_date, transaction_time, description, payment_method)
SELECT
  (SELECT id FROM accounts    WHERE lower(name) LIKE lower('%Bank Mandiri%')  LIMIT 1),
  (SELECT id FROM categories  WHERE lower(name) LIKE lower('%Biaya, tarif%') AND type = 'expense' LIMIT 1),
  2500,
  'expense',
  '2026-04-14',
  '13:31',
  'Biaya transfer BI Fast',
  'Transfer bank';

-- No. 128: 2026-04-14 | EXPENSE | Lainnya | Rp35.000
INSERT INTO transactions (account_id, category_id, amount, type, transaction_date, transaction_time, description, payment_method)
SELECT
  (SELECT id FROM accounts    WHERE lower(name) LIKE lower('%Bank Mandiri%')  LIMIT 1),
  (SELECT id FROM categories  WHERE lower(name) LIKE lower('%Lainnya%') AND type = 'expense' LIMIT 1),
  35000,
  'expense',
  '2026-04-14',
  '13:31',
  'Transfer BI Fast Ke HASHIFA ZARA AHFIYAN 85727147960',
  'Transfer bank';

-- No. 129: 2026-04-14 | EXPENSE | Restoran, makanan cepat saji | Rp14.500
INSERT INTO transactions (account_id, category_id, amount, type, transaction_date, transaction_time, description, payment_method)
SELECT
  (SELECT id FROM accounts    WHERE lower(name) LIKE lower('%Bank Mandiri%')  LIMIT 1),
  (SELECT id FROM categories  WHERE lower(name) LIKE lower('%Restoran, makanan cepat saji%') AND type = 'expense' LIMIT 1),
  14500,
  'expense',
  '2026-04-14',
  '16:43',
  'Pembayaran QR ke WARUNG TENTREM PUJALE, DE 604146667056',
  'QRIS';

-- No. 130: 2026-04-15 | EXPENSE | Restoran, makanan cepat saji | Rp15.000
INSERT INTO transactions (account_id, category_id, amount, type, transaction_date, transaction_time, description, payment_method)
SELECT
  (SELECT id FROM accounts    WHERE lower(name) LIKE lower('%Bank Mandiri%')  LIMIT 1),
  (SELECT id FROM categories  WHERE lower(name) LIKE lower('%Restoran, makanan cepat saji%') AND type = 'expense' LIMIT 1),
  15000,
  'expense',
  '2026-04-15',
  '10:13',
  'Pembayaran QR ke KEDAI SITISONYA 604158277805',
  'QRIS';

-- No. 131: 2026-04-15 | EXPENSE | Bahan makanan | Rp6.000
INSERT INTO transactions (account_id, category_id, amount, type, transaction_date, transaction_time, description, payment_method)
SELECT
  (SELECT id FROM accounts    WHERE lower(name) LIKE lower('%Bank Mandiri%')  LIMIT 1),
  (SELECT id FROM categories  WHERE lower(name) LIKE lower('%Bahan makanan%') AND type = 'expense' LIMIT 1),
  6000,
  'expense',
  '2026-04-15',
  '16:55',
  'Pembayaran QR ke MEKAR 1 604151039541',
  'QRIS';

-- No. 132: 2026-04-15 | EXPENSE | Lainnya | Rp1.000.000
INSERT INTO transactions (account_id, category_id, amount, type, transaction_date, transaction_time, description, payment_method)
SELECT
  (SELECT id FROM accounts    WHERE lower(name) LIKE lower('%Bank Mandiri%')  LIMIT 1),
  (SELECT id FROM categories  WHERE lower(name) LIKE lower('%Lainnya%') AND type = 'expense' LIMIT 1),
  1000000,
  'expense',
  '2026-04-15',
  '17:37',
  'Transfer ke BANK MANDIRI ABDUL ROZAK 1850005495574',
  'Transfer bank';

-- No. 133: 2026-04-15 | EXPENSE | Makanan dan minuman | Rp10.900
INSERT INTO transactions (account_id, category_id, amount, type, transaction_date, transaction_time, description, payment_method)
SELECT
  (SELECT id FROM accounts    WHERE lower(name) LIKE lower('%Bank Mandiri%')  LIMIT 1),
  (SELECT id FROM categories  WHERE lower(name) LIKE lower('%Makanan dan minuman%') AND type = 'expense' LIMIT 1),
  10900,
  'expense',
  '2026-04-15',
  '22:35',
  'Pembayaran QR ke JUMPSTART 604155520374',
  'QRIS';

-- No. 134: 2026-04-16 | EXPENSE | Makanan dan minuman | Rp3.500
INSERT INTO transactions (account_id, category_id, amount, type, transaction_date, transaction_time, description, payment_method)
SELECT
  (SELECT id FROM accounts    WHERE lower(name) LIKE lower('%Bank Mandiri%')  LIMIT 1),
  (SELECT id FROM categories  WHERE lower(name) LIKE lower('%Makanan dan minuman%') AND type = 'expense' LIMIT 1),
  3500,
  'expense',
  '2026-04-16',
  '07:02',
  'Pembayaran QR ke Sunflow 604162508437',
  'QRIS';

-- No. 135: 2026-04-16 | EXPENSE | Restoran, makanan cepat saji | Rp11.000
INSERT INTO transactions (account_id, category_id, amount, type, transaction_date, transaction_time, description, payment_method)
SELECT
  (SELECT id FROM accounts    WHERE lower(name) LIKE lower('%Bank Mandiri%')  LIMIT 1),
  (SELECT id FROM categories  WHERE lower(name) LIKE lower('%Restoran, makanan cepat saji%') AND type = 'expense' LIMIT 1),
  11000,
  'expense',
  '2026-04-16',
  '08:56',
  'Pembayaran QR ke nieta kitchen 604166193910',
  'QRIS';

-- No. 136: 2026-04-16 | EXPENSE | Restoran, makanan cepat saji | Rp15.000
INSERT INTO transactions (account_id, category_id, amount, type, transaction_date, transaction_time, description, payment_method)
SELECT
  (SELECT id FROM accounts    WHERE lower(name) LIKE lower('%Bank Mandiri%')  LIMIT 1),
  (SELECT id FROM categories  WHERE lower(name) LIKE lower('%Restoran, makanan cepat saji%') AND type = 'expense' LIMIT 1),
  15000,
  'expense',
  '2026-04-16',
  '14:52',
  'Pembayaran QR ke KEDAI SITISONYA 604167143983',
  'QRIS';

-- No. 137: 2026-04-16 | EXPENSE | Restoran, makanan cepat saji | Rp28.500
INSERT INTO transactions (account_id, category_id, amount, type, transaction_date, transaction_time, description, payment_method)
SELECT
  (SELECT id FROM accounts    WHERE lower(name) LIKE lower('%Bank Mandiri%')  LIMIT 1),
  (SELECT id FROM categories  WHERE lower(name) LIKE lower('%Restoran, makanan cepat saji%') AND type = 'expense' LIMIT 1),
  28500,
  'expense',
  '2026-04-16',
  '21:18',
  'Pembayaran QR ke WARUNG HIKMAH 604168334076',
  'QRIS';

-- No. 138: 2026-04-16 | EXPENSE | Bar, kafe | Rp36.000
INSERT INTO transactions (account_id, category_id, amount, type, transaction_date, transaction_time, description, payment_method)
SELECT
  (SELECT id FROM accounts    WHERE lower(name) LIKE lower('%Bank Mandiri%')  LIMIT 1),
  (SELECT id FROM categories  WHERE lower(name) LIKE lower('%Bar, kafe%') AND type = 'expense' LIMIT 1),
  36000,
  'expense',
  '2026-04-16',
  '22:17',
  'Pembayaran QR ke SHELTER CANOPEE COFFEE, 604168472061',
  'QRIS';

-- No. 139: 2026-04-17 | EXPENSE | Restoran, makanan cepat saji | Rp7.000
INSERT INTO transactions (account_id, category_id, amount, type, transaction_date, transaction_time, description, payment_method)
SELECT
  (SELECT id FROM accounts    WHERE lower(name) LIKE lower('%Bank Mandiri%')  LIMIT 1),
  (SELECT id FROM categories  WHERE lower(name) LIKE lower('%Restoran, makanan cepat saji%') AND type = 'expense' LIMIT 1),
  7000,
  'expense',
  '2026-04-17',
  '08:49',
  'Pembayaran QR ke WARMINDO PUTRA BAROKAH 604570680499',
  'QRIS';

-- No. 140: 2026-04-17 | EXPENSE | Lainnya | Rp100.000
INSERT INTO transactions (account_id, category_id, amount, type, transaction_date, transaction_time, description, payment_method)
SELECT
  (SELECT id FROM accounts    WHERE lower(name) LIKE lower('%Bank Mandiri%')  LIMIT 1),
  (SELECT id FROM categories  WHERE lower(name) LIKE lower('%Lainnya%') AND type = 'expense' LIMIT 1),
  100000,
  'expense',
  '2026-04-17',
  '15:34',
  'Penarikan tunai di ATM BANK MANDIRI SMN ED UNMSIUGM 01',
  NULL;

-- No. 141: 2026-04-18 | EXPENSE | Restoran, makanan cepat saji | Rp16.000
INSERT INTO transactions (account_id, category_id, amount, type, transaction_date, transaction_time, description, payment_method)
SELECT
  (SELECT id FROM accounts    WHERE lower(name) LIKE lower('%Bank Mandiri%')  LIMIT 1),
  (SELECT id FROM categories  WHERE lower(name) LIKE lower('%Restoran, makanan cepat saji%') AND type = 'expense' LIMIT 1),
  16000,
  'expense',
  '2026-04-18',
  '17:50',
  'Pembayaran QR ke Warung Kenari klebengan 604180257161',
  'QRIS';

-- No. 142: 2026-04-18 | EXPENSE | Bar, kafe | Rp5.000
INSERT INTO transactions (account_id, category_id, amount, type, transaction_date, transaction_time, description, payment_method)
SELECT
  (SELECT id FROM accounts    WHERE lower(name) LIKE lower('%Bank Mandiri%')  LIMIT 1),
  (SELECT id FROM categories  WHERE lower(name) LIKE lower('%Bar, kafe%') AND type = 'expense' LIMIT 1),
  5000,
  'expense',
  '2026-04-18',
  '22:55',
  'Pembayaran QR ke GEJOSS 99 CAFE TIMоно 604581220153',
  'QRIS';

-- No. 143: 2026-04-19 | INCOME | Pendapatan | Rp1.500.000
INSERT INTO transactions (account_id, category_id, amount, type, transaction_date, transaction_time, description, payment_method)
SELECT
  (SELECT id FROM accounts    WHERE lower(name) LIKE lower('%Bank Mandiri%')  LIMIT 1),
  (SELECT id FROM categories  WHERE lower(name) LIKE lower('%Pendapatan%') AND type = 'income' LIMIT 1),
  1500000,
  'income',
  '2026-04-19',
  '15:15',
  'Transfer BI Fast Dari RIZQI HIDAYATULLOH 6285877593405 DANA20260419DANAIDJ101009955623718RIZQIH',
  'Transfer bank';

-- No. 144: 2026-04-19 | EXPENSE | Restoran, makanan cepat saji | Rp14.000
INSERT INTO transactions (account_id, category_id, amount, type, transaction_date, transaction_time, description, payment_method)
SELECT
  (SELECT id FROM accounts    WHERE lower(name) LIKE lower('%Bank Mandiri%')  LIMIT 1),
  (SELECT id FROM categories  WHERE lower(name) LIKE lower('%Restoran, makanan cepat saji%') AND type = 'expense' LIMIT 1),
  14000,
  'expense',
  '2026-04-19',
  '17:12',
  'Pembayaran QR ke RM. PADANG PERGAULAN 604196800190',
  'QRIS';

-- No. 145: 2026-04-19 | EXPENSE | Restoran, makanan cepat saji | Rp8.500
INSERT INTO transactions (account_id, category_id, amount, type, transaction_date, transaction_time, description, payment_method)
SELECT
  (SELECT id FROM accounts    WHERE lower(name) LIKE lower('%Bank Mandiri%')  LIMIT 1),
  (SELECT id FROM categories  WHERE lower(name) LIKE lower('%Restoran, makanan cepat saji%') AND type = 'expense' LIMIT 1),
  8500,
  'expense',
  '2026-04-19',
  '17:16',
  'Pembayaran QR ke Warung Mba Rini, DEPOK 604196812866',
  'QRIS';

-- No. 146: 2026-04-20 | EXPENSE | Telepon, ponsel | Rp7.000
INSERT INTO transactions (account_id, category_id, amount, type, transaction_date, transaction_time, description, payment_method)
SELECT
  (SELECT id FROM accounts    WHERE lower(name) LIKE lower('%Bank Mandiri%')  LIMIT 1),
  (SELECT id FROM categories  WHERE lower(name) LIKE lower('%Telepon, ponsel%') AND type = 'expense' LIMIT 1),
  7000,
  'expense',
  '2026-04-20',
  '01:48',
  'Pembayaran QR ke IOH 604194142652',
  'QRIS';

-- No. 147: 2026-04-20 | EXPENSE | Belanja | Rp111.700
INSERT INTO transactions (account_id, category_id, amount, type, transaction_date, transaction_time, description, payment_method)
SELECT
  (SELECT id FROM accounts    WHERE lower(name) LIKE lower('%Bank Mandiri%')  LIMIT 1),
  (SELECT id FROM categories  WHERE lower(name) LIKE lower('%Belanja%') AND type = 'expense' LIMIT 1),
  111700,
  'expense',
  '2026-04-20',
  '11:35',
  'Pembayaran QR ke Shopee Indonesia 604200104681',
  'QRIS';

-- No. 148: 2026-04-20 | EXPENSE | Lainnya | Rp100.000
INSERT INTO transactions (account_id, category_id, amount, type, transaction_date, transaction_time, description, payment_method)
SELECT
  (SELECT id FROM accounts    WHERE lower(name) LIKE lower('%Bank Mandiri%')  LIMIT 1),
  (SELECT id FROM categories  WHERE lower(name) LIKE lower('%Lainnya%') AND type = 'expense' LIMIT 1),
  100000,
  'expense',
  '2026-04-20',
  '13:57',
  'Penarikan tunai di ATM BANK MANDIRI SMN SB UGMFISIPOL 02',
  NULL;

-- No. 149: 2026-04-21 | EXPENSE | Biaya, tarif | Rp7.500
INSERT INTO transactions (account_id, category_id, amount, type, transaction_date, transaction_time, description, payment_method)
SELECT
  (SELECT id FROM accounts    WHERE lower(name) LIKE lower('%Bank Mandiri%')  LIMIT 1),
  (SELECT id FROM categories  WHERE lower(name) LIKE lower('%Biaya, tarif%') AND type = 'expense' LIMIT 1),
  7500,
  'expense',
  '2026-04-21',
  '21:48',
  'Biaya penarikan tunai di ATM Link 1152146',
  NULL;

-- No. 150: 2026-04-21 | EXPENSE | Lainnya | Rp100.000
INSERT INTO transactions (account_id, category_id, amount, type, transaction_date, transaction_time, description, payment_method)
SELECT
  (SELECT id FROM accounts    WHERE lower(name) LIKE lower('%Bank Mandiri%')  LIMIT 1),
  (SELECT id FROM categories  WHERE lower(name) LIKE lower('%Lainnya%') AND type = 'expense' LIMIT 1),
  100000,
  'expense',
  '2026-04-21',
  '21:48',
  'Penarikan tunai di ATM Link 1152146',
  NULL;

-- No. 151: 2026-04-23 | EXPENSE | Biaya, tarif | Rp4.000
INSERT INTO transactions (account_id, category_id, amount, type, transaction_date, transaction_time, description, payment_method)
SELECT
  (SELECT id FROM accounts    WHERE lower(name) LIKE lower('%Bank Mandiri%')  LIMIT 1),
  (SELECT id FROM categories  WHERE lower(name) LIKE lower('%Biaya, tarif%') AND type = 'expense' LIMIT 1),
  4000,
  'expense',
  '2026-04-23',
  '17:38',
  'Biaya cek saldo di ATM',
  NULL;

-- No. 152: 2026-04-23 | EXPENSE | Biaya, tarif | Rp7.500
INSERT INTO transactions (account_id, category_id, amount, type, transaction_date, transaction_time, description, payment_method)
SELECT
  (SELECT id FROM accounts    WHERE lower(name) LIKE lower('%Bank Mandiri%')  LIMIT 1),
  (SELECT id FROM categories  WHERE lower(name) LIKE lower('%Biaya, tarif%') AND type = 'expense' LIMIT 1),
  7500,
  'expense',
  '2026-04-23',
  '17:38',
  'Biaya penarikan tunai di ATM Link 1152146',
  NULL;

-- No. 153: 2026-04-23 | EXPENSE | Lainnya | Rp100.000
INSERT INTO transactions (account_id, category_id, amount, type, transaction_date, transaction_time, description, payment_method)
SELECT
  (SELECT id FROM accounts    WHERE lower(name) LIKE lower('%Bank Mandiri%')  LIMIT 1),
  (SELECT id FROM categories  WHERE lower(name) LIKE lower('%Lainnya%') AND type = 'expense' LIMIT 1),
  100000,
  'expense',
  '2026-04-23',
  '17:38',
  'Penarikan tunai di ATM Link 1152146',
  NULL;

-- No. 154: 2026-04-26 | EXPENSE | Bar, kafe | Rp14.000
INSERT INTO transactions (account_id, category_id, amount, type, transaction_date, transaction_time, description, payment_method)
SELECT
  (SELECT id FROM accounts    WHERE lower(name) LIKE lower('%Bank Mandiri%')  LIMIT 1),
  (SELECT id FROM categories  WHERE lower(name) LIKE lower('%Bar, kafe%') AND type = 'expense' LIMIT 1),
  14000,
  'expense',
  '2026-04-26',
  '19:56',
  'Pembayaran QR ke Warkop Woenderbar 604268403388',
  'QRIS';

-- No. 155: 2026-04-27 | EXPENSE | Restoran, makanan cepat saji | Rp10.000
INSERT INTO transactions (account_id, category_id, amount, type, transaction_date, transaction_time, description, payment_method)
SELECT
  (SELECT id FROM accounts    WHERE lower(name) LIKE lower('%Bank Mandiri%')  LIMIT 1),
  (SELECT id FROM categories  WHERE lower(name) LIKE lower('%Restoran, makanan cepat saji%') AND type = 'expense' LIMIT 1),
  10000,
  'expense',
  '2026-04-27',
  '08:39',
  'Pembayaran QR ke nieta kitchen 604279407106',
  'QRIS';

-- No. 156: 2026-04-27 | EXPENSE | Restoran, makanan cepat saji | Rp5.000
INSERT INTO transactions (account_id, category_id, amount, type, transaction_date, transaction_time, description, payment_method)
SELECT
  (SELECT id FROM accounts    WHERE lower(name) LIKE lower('%Bank Mandiri%')  LIMIT 1),
  (SELECT id FROM categories  WHERE lower(name) LIKE lower('%Restoran, makanan cepat saji%') AND type = 'expense' LIMIT 1),
  5000,
  'expense',
  '2026-04-27',
  '08:56',
  'Pembayaran QR ke QOMA SALAD INDONESIA 604679441579',
  'QRIS';

-- No. 157: 2026-04-27 | EXPENSE | Telepon, ponsel | Rp40.000
INSERT INTO transactions (account_id, category_id, amount, type, transaction_date, transaction_time, description, payment_method)
SELECT
  (SELECT id FROM accounts    WHERE lower(name) LIKE lower('%Bank Mandiri%')  LIMIT 1),
  (SELECT id FROM categories  WHERE lower(name) LIKE lower('%Telepon, ponsel%') AND type = 'expense' LIMIT 1),
  40000,
  'expense',
  '2026-04-27',
  '11:45',
  'Pembayaran QR ke IOH 604279831177',
  'QRIS';

-- No. 158: 2026-04-27 | EXPENSE | Restoran, makanan cepat saji | Rp14.000
INSERT INTO transactions (account_id, category_id, amount, type, transaction_date, transaction_time, description, payment_method)
SELECT
  (SELECT id FROM accounts    WHERE lower(name) LIKE lower('%Bank Mandiri%')  LIMIT 1),
  (SELECT id FROM categories  WHERE lower(name) LIKE lower('%Restoran, makanan cepat saji%') AND type = 'expense' LIMIT 1),
  14000,
  'expense',
  '2026-04-27',
  '13:01',
  'Pembayaran QR ke WARUNG ALDIANO 604271555604',
  'QRIS';

-- No. 159: 2026-04-27 | EXPENSE | Restoran, makanan cepat saji | Rp12.500
INSERT INTO transactions (account_id, category_id, amount, type, transaction_date, transaction_time, description, payment_method)
SELECT
  (SELECT id FROM accounts    WHERE lower(name) LIKE lower('%Bank Mandiri%')  LIMIT 1),
  (SELECT id FROM categories  WHERE lower(name) LIKE lower('%Restoran, makanan cepat saji%') AND type = 'expense' LIMIT 1),
  12500,
  'expense',
  '2026-04-27',
  '23:11',
  'Pembayaran QR ke SINAR MINANG COLOMBO 604676861294',
  'QRIS';

-- No. 160: 2026-04-28 | EXPENSE | Restoran, makanan cepat saji | Rp10.500
INSERT INTO transactions (account_id, category_id, amount, type, transaction_date, transaction_time, description, payment_method)
SELECT
  (SELECT id FROM accounts    WHERE lower(name) LIKE lower('%Bank Mandiri%')  LIMIT 1),
  (SELECT id FROM categories  WHERE lower(name) LIKE lower('%Restoran, makanan cepat saji%') AND type = 'expense' LIMIT 1),
  10500,
  'expense',
  '2026-04-28',
  '14:47',
  'Pembayaran QR ke WARUNG TENTREM PUJALE, DE 604288422852',
  'QRIS';

-- No. 161: 2026-04-28 | EXPENSE | Restoran, makanan cepat saji | Rp6.000
INSERT INTO transactions (account_id, category_id, amount, type, transaction_date, transaction_time, description, payment_method)
SELECT
  (SELECT id FROM accounts    WHERE lower(name) LIKE lower('%Bank Mandiri%')  LIMIT 1),
  (SELECT id FROM categories  WHERE lower(name) LIKE lower('%Restoran, makanan cepat saji%') AND type = 'expense' LIMIT 1),
  6000,
  'expense',
  '2026-04-28',
  '16:57',
  'Pembayaran QR ke RISMA WULANDARI II, 604288776517',
  'QRIS';

-- No. 162: 2026-04-28 | EXPENSE | Restoran, makanan cepat saji | Rp12.500
INSERT INTO transactions (account_id, category_id, amount, type, transaction_date, transaction_time, description, payment_method)
SELECT
  (SELECT id FROM accounts    WHERE lower(name) LIKE lower('%Bank Mandiri%')  LIMIT 1),
  (SELECT id FROM categories  WHERE lower(name) LIKE lower('%Restoran, makanan cepat saji%') AND type = 'expense' LIMIT 1),
  12500,
  'expense',
  '2026-04-28',
  '22:39',
  'Pembayaran QR ke SINAR MINANG COLOMBO 604689832085',
  'QRIS';

-- No. 163: 2026-04-29 | EXPENSE | Transportasi | Rp7.000
INSERT INTO transactions (account_id, category_id, amount, type, transaction_date, transaction_time, description, payment_method)
SELECT
  (SELECT id FROM accounts    WHERE lower(name) LIKE lower('%Bank Mandiri%')  LIMIT 1),
  (SELECT id FROM categories  WHERE lower(name) LIKE lower('%Transportasi%') AND type = 'expense' LIMIT 1),
  7000,
  'expense',
  '2026-04-29',
  '07:40',
  'Pembayaran QR ke GRAB TRANSPORT 604291826909',
  'QRIS';

-- No. 164: 2026-04-29 | EXPENSE | Restoran, makanan cepat saji | Rp10.000
INSERT INTO transactions (account_id, category_id, amount, type, transaction_date, transaction_time, description, payment_method)
SELECT
  (SELECT id FROM accounts    WHERE lower(name) LIKE lower('%Bank Mandiri%')  LIMIT 1),
  (SELECT id FROM categories  WHERE lower(name) LIKE lower('%Restoran, makanan cepat saji%') AND type = 'expense' LIMIT 1),
  10000,
  'expense',
  '2026-04-29',
  '14:38',
  'Pembayaran QR ke nieta kitchen 604296582989',
  'QRIS';

-- No. 165: 2026-04-29 | EXPENSE | Restoran, makanan cepat saji | Rp4.000
INSERT INTO transactions (account_id, category_id, amount, type, transaction_date, transaction_time, description, payment_method)
SELECT
  (SELECT id FROM accounts    WHERE lower(name) LIKE lower('%Bank Mandiri%')  LIMIT 1),
  (SELECT id FROM categories  WHERE lower(name) LIKE lower('%Restoran, makanan cepat saji%') AND type = 'expense' LIMIT 1),
  4000,
  'expense',
  '2026-04-29',
  '14:48',
  'Pembayaran QR ke nieta kitchen 604296609295',
  'QRIS';

-- No. 166: 2026-04-29 | EXPENSE | Restoran, makanan cepat saji | Rp10.000
INSERT INTO transactions (account_id, category_id, amount, type, transaction_date, transaction_time, description, payment_method)
SELECT
  (SELECT id FROM accounts    WHERE lower(name) LIKE lower('%Bank Mandiri%')  LIMIT 1),
  (SELECT id FROM categories  WHERE lower(name) LIKE lower('%Restoran, makanan cepat saji%') AND type = 'expense' LIMIT 1),
  10000,
  'expense',
  '2026-04-29',
  '21:32',
  'Pembayaran QR ke BAKSO&MIE AYAM &#39;SUKSES&#39;, 604294231039',
  'QRIS';

-- No. 167: 2026-04-30 | EXPENSE | Transportasi | Rp7.000
INSERT INTO transactions (account_id, category_id, amount, type, transaction_date, transaction_time, description, payment_method)
SELECT
  (SELECT id FROM accounts    WHERE lower(name) LIKE lower('%Bank Mandiri%')  LIMIT 1),
  (SELECT id FROM categories  WHERE lower(name) LIKE lower('%Transportasi%') AND type = 'expense' LIMIT 1),
  7000,
  'expense',
  '2026-04-30',
  '07:18',
  'Pembayaran QR ke GRAB TRANSPORT 604308565205',
  'QRIS';

-- No. 168: 2026-04-30 | EXPENSE | Restoran, makanan cepat saji | Rp10.000
INSERT INTO transactions (account_id, category_id, amount, type, transaction_date, transaction_time, description, payment_method)
SELECT
  (SELECT id FROM accounts    WHERE lower(name) LIKE lower('%Bank Mandiri%')  LIMIT 1),
  (SELECT id FROM categories  WHERE lower(name) LIKE lower('%Restoran, makanan cepat saji%') AND type = 'expense' LIMIT 1),
  10000,
  'expense',
  '2026-04-30',
  '11:01',
  'Pembayaran QR ke nieta kitchen 604309085545',
  'QRIS';

-- No. 169: 2026-04-30 | EXPENSE | Restoran, makanan cepat saji | Rp7.500
INSERT INTO transactions (account_id, category_id, amount, type, transaction_date, transaction_time, description, payment_method)
SELECT
  (SELECT id FROM accounts    WHERE lower(name) LIKE lower('%Bank Mandiri%')  LIMIT 1),
  (SELECT id FROM categories  WHERE lower(name) LIKE lower('%Restoran, makanan cepat saji%') AND type = 'expense' LIMIT 1),
  7500,
  'expense',
  '2026-04-30',
  '22:39',
  'Pembayaran QR ke WARUNG HIKMAH 604302855867',
  'QRIS';

-- No. 170: 2026-04-30 | EXPENSE | Biaya, tarif | Rp6.000
INSERT INTO transactions (account_id, category_id, amount, type, transaction_date, transaction_time, description, payment_method)
SELECT
  (SELECT id FROM accounts    WHERE lower(name) LIKE lower('%Bank Mandiri%')  LIMIT 1),
  (SELECT id FROM categories  WHERE lower(name) LIKE lower('%Biaya, tarif%') AND type = 'expense' LIMIT 1),
  6000,
  'expense',
  '2026-04-30',
  '23:59',
  'Biaya administrasi rekening',
  NULL;

-- No. 171: 2026-05-01 | EXPENSE | Restoran, makanan cepat saji | Rp15.000
INSERT INTO transactions (account_id, category_id, amount, type, transaction_date, transaction_time, description, payment_method)
SELECT
  (SELECT id FROM accounts    WHERE lower(name) LIKE lower('%Bank Mandiri%')  LIMIT 1),
  (SELECT id FROM categories  WHERE lower(name) LIKE lower('%Restoran, makanan cepat saji%') AND type = 'expense' LIMIT 1),
  15000,
  'expense',
  '2026-05-01',
  '20:24',
  'Pembayaran QR ke RM. PADANG PERGAULAN 605011220911',
  'QRIS';

-- No. 172: 2026-05-01 | EXPENSE | Restoran, makanan cepat saji | Rp7.000
INSERT INTO transactions (account_id, category_id, amount, type, transaction_date, transaction_time, description, payment_method)
SELECT
  (SELECT id FROM accounts    WHERE lower(name) LIKE lower('%Bank Mandiri%')  LIMIT 1),
  (SELECT id FROM categories  WHERE lower(name) LIKE lower('%Restoran, makanan cepat saji%') AND type = 'expense' LIMIT 1),
  7000,
  'expense',
  '2026-05-01',
  '20:51',
  'Pembayaran QR ke OPAPER INTER INDONESIA 605011339923',
  'QRIS';

-- No. 173: 2026-05-01 | EXPENSE | Transportasi | Rp7.000
INSERT INTO transactions (account_id, category_id, amount, type, transaction_date, transaction_time, description, payment_method)
SELECT
  (SELECT id FROM accounts    WHERE lower(name) LIKE lower('%Bank Mandiri%')  LIMIT 1),
  (SELECT id FROM categories  WHERE lower(name) LIKE lower('%Transportasi%') AND type = 'expense' LIMIT 1),
  7000,
  'expense',
  '2026-05-01',
  '22:16',
  'Pembayaran QR ke GRAB TRANSPORT 605015236878',
  'QRIS';

-- No. 174: 2026-05-02 | EXPENSE | Biaya, tarif | Rp2.500
INSERT INTO transactions (account_id, category_id, amount, type, transaction_date, transaction_time, description, payment_method)
SELECT
  (SELECT id FROM accounts    WHERE lower(name) LIKE lower('%Bank Mandiri%')  LIMIT 1),
  (SELECT id FROM categories  WHERE lower(name) LIKE lower('%Biaya, tarif%') AND type = 'expense' LIMIT 1),
  2500,
  'expense',
  '2026-05-02',
  '10:48',
  'Biaya transfer BI Fast',
  'Transfer bank';

-- No. 175: 2026-05-02 | EXPENSE | Lainnya | Rp100.000
INSERT INTO transactions (account_id, category_id, amount, type, transaction_date, transaction_time, description, payment_method)
SELECT
  (SELECT id FROM accounts    WHERE lower(name) LIKE lower('%Bank Mandiri%')  LIMIT 1),
  (SELECT id FROM categories  WHERE lower(name) LIKE lower('%Lainnya%') AND type = 'expense' LIMIT 1),
  100000,
  'expense',
  '2026-05-02',
  '10:48',
  'Transfer BI Fast Ke BRI VADILA FITRIANA WAHY 137201006513502',
  'Transfer bank';

-- No. 176: 2026-05-02 | EXPENSE | Restoran, makanan cepat saji | Rp14.000
INSERT INTO transactions (account_id, category_id, amount, type, transaction_date, transaction_time, description, payment_method)
SELECT
  (SELECT id FROM accounts    WHERE lower(name) LIKE lower('%Bank Mandiri%')  LIMIT 1),
  (SELECT id FROM categories  WHERE lower(name) LIKE lower('%Restoran, makanan cepat saji%') AND type = 'expense' LIMIT 1),
  14000,
  'expense',
  '2026-05-02',
  '18:44',
  'Pembayaran QR ke RM. PADANG PERGAULAN 605028065156',
  'QRIS';

-- No. 177: 2026-05-02 | EXPENSE | Restoran, makanan cepat saji | Rp14.500
INSERT INTO transactions (account_id, category_id, amount, type, transaction_date, transaction_time, description, payment_method)
SELECT
  (SELECT id FROM accounts    WHERE lower(name) LIKE lower('%Bank Mandiri%')  LIMIT 1),
  (SELECT id FROM categories  WHERE lower(name) LIKE lower('%Restoran, makanan cepat saji%') AND type = 'expense' LIMIT 1),
  14500,
  'expense',
  '2026-05-02',
  '20:21',
  'Pembayaran QR ke WARUNG HIKMAH 605024849609',
  'QRIS';

-- No. 178: 2026-05-03 | EXPENSE | Restoran, makanan cepat saji | Rp14.000
INSERT INTO transactions (account_id, category_id, amount, type, transaction_date, transaction_time, description, payment_method)
SELECT
  (SELECT id FROM accounts    WHERE lower(name) LIKE lower('%Bank Mandiri%')  LIMIT 1),
  (SELECT id FROM categories  WHERE lower(name) LIKE lower('%Restoran, makanan cepat saji%') AND type = 'expense' LIMIT 1),
  14000,
  'expense',
  '2026-05-03',
  '10:34',
  'Pembayaran QR ke MOM BAROKAH 605431478766',
  'QRIS';

-- No. 179: 2026-05-03 | EXPENSE | Restoran, makanan cepat saji | Rp19.000
INSERT INTO transactions (account_id, category_id, amount, type, transaction_date, transaction_time, description, payment_method)
SELECT
  (SELECT id FROM accounts    WHERE lower(name) LIKE lower('%Bank Mandiri%')  LIMIT 1),
  (SELECT id FROM categories  WHERE lower(name) LIKE lower('%Restoran, makanan cepat saji%') AND type = 'expense' LIMIT 1),
  19000,
  'expense',
  '2026-05-03',
  '21:21',
  'Pembayaran QR ke BAKSO URAT & MIE AYAM GOY 605033576374',
  'QRIS';

-- No. 180: 2026-05-04 | EXPENSE | Restoran, makanan cepat saji | Rp10.000
INSERT INTO transactions (account_id, category_id, amount, type, transaction_date, transaction_time, description, payment_method)
SELECT
  (SELECT id FROM accounts    WHERE lower(name) LIKE lower('%Bank Mandiri%')  LIMIT 1),
  (SELECT id FROM categories  WHERE lower(name) LIKE lower('%Restoran, makanan cepat saji%') AND type = 'expense' LIMIT 1),
  10000,
  'expense',
  '2026-05-04',
  '08:53',
  'Pembayaran QR ke WARUNG TENTREM PUJALE, DE 605048056904',
  'QRIS';

-- No. 181: 2026-05-04 | EXPENSE | Restoran, makanan cepat saji | Rp15.000
INSERT INTO transactions (account_id, category_id, amount, type, transaction_date, transaction_time, description, payment_method)
SELECT
  (SELECT id FROM accounts    WHERE lower(name) LIKE lower('%Bank Mandiri%')  LIMIT 1),
  (SELECT id FROM categories  WHERE lower(name) LIKE lower('%Restoran, makanan cepat saji%') AND type = 'expense' LIMIT 1),
  15000,
  'expense',
  '2026-05-04',
  '14:13',
  'Pembayaran QR ke RM. PADANG PERGAULAN 605040369459',
  'QRIS';

-- No. 182: 2026-05-04 | EXPENSE | Transportasi | Rp7.000
INSERT INTO transactions (account_id, category_id, amount, type, transaction_date, transaction_time, description, payment_method)
SELECT
  (SELECT id FROM accounts    WHERE lower(name) LIKE lower('%Bank Mandiri%')  LIMIT 1),
  (SELECT id FROM categories  WHERE lower(name) LIKE lower('%Transportasi%') AND type = 'expense' LIMIT 1),
  7000,
  'expense',
  '2026-05-04',
  '20:52',
  'Pembayaran QR ke GRAB TRANSPORT 605041582376',
  'QRIS';

-- No. 183: 2026-05-05 | EXPENSE | Transportasi | Rp6.000
INSERT INTO transactions (account_id, category_id, amount, type, transaction_date, transaction_time, description, payment_method)
SELECT
  (SELECT id FROM accounts    WHERE lower(name) LIKE lower('%Bank Mandiri%')  LIMIT 1),
  (SELECT id FROM categories  WHERE lower(name) LIKE lower('%Transportasi%') AND type = 'expense' LIMIT 1),
  6000,
  'expense',
  '2026-05-05',
  '07:21',
  'Pembayaran QR ke GRAB TRANSPORT 605056098845',
  'QRIS';

-- No. 184: 2026-05-05 | EXPENSE | Restoran, makanan cepat saji | Rp10.000
INSERT INTO transactions (account_id, category_id, amount, type, transaction_date, transaction_time, description, payment_method)
SELECT
  (SELECT id FROM accounts    WHERE lower(name) LIKE lower('%Bank Mandiri%')  LIMIT 1),
  (SELECT id FROM categories  WHERE lower(name) LIKE lower('%Restoran, makanan cepat saji%') AND type = 'expense' LIMIT 1),
  10000,
  'expense',
  '2026-05-05',
  '09:15',
  'Pembayaran QR ke nieta kitchen 605056337383',
  'QRIS';

-- No. 185: 2026-05-05 | INCOME | Pendapatan | Rp400.000
INSERT INTO transactions (account_id, category_id, amount, type, transaction_date, transaction_time, description, payment_method)
SELECT
  (SELECT id FROM accounts    WHERE lower(name) LIKE lower('%Bank Mandiri%')  LIMIT 1),
  (SELECT id FROM categories  WHERE lower(name) LIKE lower('%Pendapatan%') AND type = 'income' LIMIT 1),
  400000,
  'income',
  '2026-05-05',
  '17:10',
  'Transfer dari BANK MANDIRI ADAM MASDA PUTRA 1370024102234',
  'Transfer bank';

-- No. 186: 2026-05-05 | EXPENSE | Restoran, makanan cepat saji | Rp8.000
INSERT INTO transactions (account_id, category_id, amount, type, transaction_date, transaction_time, description, payment_method)
SELECT
  (SELECT id FROM accounts    WHERE lower(name) LIKE lower('%Bank Mandiri%')  LIMIT 1),
  (SELECT id FROM categories  WHERE lower(name) LIKE lower('%Restoran, makanan cepat saji%') AND type = 'expense' LIMIT 1),
  8000,
  'expense',
  '2026-05-05',
  '18:50',
  'Pembayaran QR ke Cici mila 605058138450',
  'QRIS';

-- No. 187: 2026-05-05 | EXPENSE | Restoran, makanan cepat saji | Rp5.000
INSERT INTO transactions (account_id, category_id, amount, type, transaction_date, transaction_time, description, payment_method)
SELECT
  (SELECT id FROM accounts    WHERE lower(name) LIKE lower('%Bank Mandiri%')  LIMIT 1),
  (SELECT id FROM categories  WHERE lower(name) LIKE lower('%Restoran, makanan cepat saji%') AND type = 'expense' LIMIT 1),
  5000,
  'expense',
  '2026-05-05',
  '18:51',
  'Pembayaran QR ke Cici mila 605054448434',
  'QRIS';

-- No. 188: 2026-05-05 | EXPENSE | Restoran, makanan cepat saji | Rp13.500
INSERT INTO transactions (account_id, category_id, amount, type, transaction_date, transaction_time, description, payment_method)
SELECT
  (SELECT id FROM accounts    WHERE lower(name) LIKE lower('%Bank Mandiri%')  LIMIT 1),
  (SELECT id FROM categories  WHERE lower(name) LIKE lower('%Restoran, makanan cepat saji%') AND type = 'expense' LIMIT 1),
  13500,
  'expense',
  '2026-05-05',
  '20:59',
  'Pembayaran QR ke SINARMINANG KLEBENGAN 605050038191',
  'QRIS';

-- No. 189: 2026-05-05 | EXPENSE | Restoran, makanan cepat saji | Rp6.000
INSERT INTO transactions (account_id, category_id, amount, type, transaction_date, transaction_time, description, payment_method)
SELECT
  (SELECT id FROM accounts    WHERE lower(name) LIKE lower('%Bank Mandiri%')  LIMIT 1),
  (SELECT id FROM categories  WHERE lower(name) LIKE lower('%Restoran, makanan cepat saji%') AND type = 'expense' LIMIT 1),
  6000,
  'expense',
  '2026-05-05',
  '21:05',
  'Pembayaran QR ke MEKAR 1 605050062004',
  'QRIS';

-- No. 190: 2026-05-05 | EXPENSE | Restoran, makanan cepat saji | Rp11.500
INSERT INTO transactions (account_id, category_id, amount, type, transaction_date, transaction_time, description, payment_method)
SELECT
  (SELECT id FROM accounts    WHERE lower(name) LIKE lower('%Bank Mandiri%')  LIMIT 1),
  (SELECT id FROM categories  WHERE lower(name) LIKE lower('%Restoran, makanan cepat saji%') AND type = 'expense' LIMIT 1),
  11500,
  'expense',
  '2026-05-05',
  '21:08',
  'Pembayaran QR ke Warung Mapan Barokah, TEB 605058659768',
  'QRIS';

-- No. 191: 2026-05-05 | EXPENSE | Belanja | Rp17.500
INSERT INTO transactions (account_id, category_id, amount, type, transaction_date, transaction_time, description, payment_method)
SELECT
  (SELECT id FROM accounts    WHERE lower(name) LIKE lower('%Bank Mandiri%')  LIMIT 1),
  (SELECT id FROM categories  WHERE lower(name) LIKE lower('%Belanja%') AND type = 'expense' LIMIT 1),
  17500,
  'expense',
  '2026-05-05',
  '21:50',
  'Pembayaran QR ke TOKO ASIYVA 605050214131',
  'QRIS';

-- No. 192: 2026-05-06 | EXPENSE | Transportasi | Rp7.000
INSERT INTO transactions (account_id, category_id, amount, type, transaction_date, transaction_time, description, payment_method)
SELECT
  (SELECT id FROM accounts    WHERE lower(name) LIKE lower('%Bank Mandiri%')  LIMIT 1),
  (SELECT id FROM categories  WHERE lower(name) LIKE lower('%Transportasi%') AND type = 'expense' LIMIT 1),
  7000,
  'expense',
  '2026-05-06',
  '11:06',
  'Pembayaran QR ke GRAB TRANSPORT 605065076910',
  'QRIS';

-- No. 193: 2026-05-06 | EXPENSE | Layanan | Rp22.000
INSERT INTO transactions (account_id, category_id, amount, type, transaction_date, transaction_time, description, payment_method)
SELECT
  (SELECT id FROM accounts    WHERE lower(name) LIKE lower('%Bank Mandiri%')  LIMIT 1),
  (SELECT id FROM categories  WHERE lower(name) LIKE lower('%Layanan%') AND type = 'expense' LIMIT 1),
  22000,
  'expense',
  '2026-05-06',
  '11:08',
  'Pembayaran QR ke SMART LAUNDRY QR BNI 605061535549',
  'QRIS';

-- No. 194: 2026-05-06 | EXPENSE | Restoran, makanan cepat saji | Rp11.000
INSERT INTO transactions (account_id, category_id, amount, type, transaction_date, transaction_time, description, payment_method)
SELECT
  (SELECT id FROM accounts    WHERE lower(name) LIKE lower('%Bank Mandiri%')  LIMIT 1),
  (SELECT id FROM categories  WHERE lower(name) LIKE lower('%Restoran, makanan cepat saji%') AND type = 'expense' LIMIT 1),
  11000,
  'expense',
  '2026-05-06',
  '11:28',
  'Pembayaran QR ke Warung makan Rizky, DEPOK 605061594406',
  'QRIS';

-- No. 195: 2026-05-06 | EXPENSE | Transportasi | Rp7.000
INSERT INTO transactions (account_id, category_id, amount, type, transaction_date, transaction_time, description, payment_method)
SELECT
  (SELECT id FROM accounts    WHERE lower(name) LIKE lower('%Bank Mandiri%')  LIMIT 1),
  (SELECT id FROM categories  WHERE lower(name) LIKE lower('%Transportasi%') AND type = 'expense' LIMIT 1),
  7000,
  'expense',
  '2026-05-06',
  '13:29',
  'Pembayaran QR ke GRAB TRANSPORT 605065555091',
  'QRIS';

-- No. 196: 2026-05-06 | EXPENSE | Restoran, makanan cepat saji | Rp11.500
INSERT INTO transactions (account_id, category_id, amount, type, transaction_date, transaction_time, description, payment_method)
SELECT
  (SELECT id FROM accounts    WHERE lower(name) LIKE lower('%Bank Mandiri%')  LIMIT 1),
  (SELECT id FROM categories  WHERE lower(name) LIKE lower('%Restoran, makanan cepat saji%') AND type = 'expense' LIMIT 1),
  11500,
  'expense',
  '2026-05-06',
  '21:29',
  'Pembayaran QR ke GRAB FOOD 605063567134',
  'QRIS';

-- No. 197: 2026-05-07 | EXPENSE | Restoran, makanan cepat saji | Rp13.000
INSERT INTO transactions (account_id, category_id, amount, type, transaction_date, transaction_time, description, payment_method)
SELECT
  (SELECT id FROM accounts    WHERE lower(name) LIKE lower('%Bank Mandiri%')  LIMIT 1),
  (SELECT id FROM categories  WHERE lower(name) LIKE lower('%Restoran, makanan cepat saji%') AND type = 'expense' LIMIT 1),
  13000,
  'expense',
  '2026-05-07',
  '12:51',
  'Pembayaran QR ke warung Makan Murah Neng S 605074855265',
  'QRIS';

-- No. 198: 2026-05-07 | EXPENSE | Makanan dan minuman | Rp5.000
INSERT INTO transactions (account_id, category_id, amount, type, transaction_date, transaction_time, description, payment_method)
SELECT
  (SELECT id FROM accounts    WHERE lower(name) LIKE lower('%Bank Mandiri%')  LIMIT 1),
  (SELECT id FROM categories  WHERE lower(name) LIKE lower('%Makanan dan minuman%') AND type = 'expense' LIMIT 1),
  5000,
  'expense',
  '2026-05-07',
  '19:35',
  'Pembayaran QR ke ALKID CENTRAL ICE, KRATON 605075324831',
  'QRIS';

-- No. 199: 2026-05-07 | EXPENSE | Lainnya | Rp100.000
INSERT INTO transactions (account_id, category_id, amount, type, transaction_date, transaction_time, description, payment_method)
SELECT
  (SELECT id FROM accounts    WHERE lower(name) LIKE lower('%Bank Mandiri%')  LIMIT 1),
  (SELECT id FROM categories  WHERE lower(name) LIKE lower('%Lainnya%') AND type = 'expense' LIMIT 1),
  100000,
  'expense',
  '2026-05-07',
  '20:05',
  'Transfer ke BANK MANDIRI MUHAMMAD CAVAN RIJAL 1370026390951',
  'Transfer bank';

-- No. 200: 2026-05-07 | INCOME | Pendapatan | Rp3.600.000
INSERT INTO transactions (account_id, category_id, amount, type, transaction_date, transaction_time, description, payment_method)
SELECT
  (SELECT id FROM accounts    WHERE lower(name) LIKE lower('%Bank Mandiri%')  LIMIT 1),
  (SELECT id FROM categories  WHERE lower(name) LIKE lower('%Pendapatan%') AND type = 'income' LIMIT 1),
  3600000,
  'income',
  '2026-05-07',
  '21:02',
  'Jardine scholarship (Biaya hidup triwulan kedua semester 2)',
  NULL;

-- No. 201: 2026-05-07 | EXPENSE | Restoran, makanan cepat saji | Rp13.000
INSERT INTO transactions (account_id, category_id, amount, type, transaction_date, transaction_time, description, payment_method)
SELECT
  (SELECT id FROM accounts    WHERE lower(name) LIKE lower('%Bank Mandiri%')  LIMIT 1),
  (SELECT id FROM categories  WHERE lower(name) LIKE lower('%Restoran, makanan cepat saji%') AND type = 'expense' LIMIT 1),
  13000,
  'expense',
  '2026-05-07',
  '21:39',
  'Pembayaran QR ke BAKSO URAT & MIE AYAM GOY 605071621590',
  'QRIS';

-- No. 202: 2026-05-08 | EXPENSE | Restoran, makanan cepat saji | Rp9.000
INSERT INTO transactions (account_id, category_id, amount, type, transaction_date, transaction_time, description, payment_method)
SELECT
  (SELECT id FROM accounts    WHERE lower(name) LIKE lower('%Bank Mandiri%')  LIMIT 1),
  (SELECT id FROM categories  WHERE lower(name) LIKE lower('%Restoran, makanan cepat saji%') AND type = 'expense' LIMIT 1),
  9000,
  'expense',
  '2026-05-08',
  '08:08',
  'Pembayaran QR ke Waroeng Emdje, Kaliurang 605082432560',
  'QRIS';

-- No. 203: 2026-05-08 | EXPENSE | Restoran, makanan cepat saji | Rp15.000
INSERT INTO transactions (account_id, category_id, amount, type, transaction_date, transaction_time, description, payment_method)
SELECT
  (SELECT id FROM accounts    WHERE lower(name) LIKE lower('%Bank Mandiri%')  LIMIT 1),
  (SELECT id FROM categories  WHERE lower(name) LIKE lower('%Restoran, makanan cepat saji%') AND type = 'expense' LIMIT 1),
  15000,
  'expense',
  '2026-05-08',
  '08:50',
  'Pembayaran QR ke SS ONE 605086744842',
  'QRIS';

-- No. 204: 2026-05-08 | EXPENSE | Makanan dan minuman | Rp6.000
INSERT INTO transactions (account_id, category_id, amount, type, transaction_date, transaction_time, description, payment_method)
SELECT
  (SELECT id FROM accounts    WHERE lower(name) LIKE lower('%Bank Mandiri%')  LIMIT 1),
  (SELECT id FROM categories  WHERE lower(name) LIKE lower('%Makanan dan minuman%') AND type = 'expense' LIMIT 1),
  6000,
  'expense',
  '2026-05-08',
  '13:19',
  'Pembayaran QR ke NICETEA, DEPOK 605087571537',
  'QRIS';

-- No. 205: 2026-05-08 | EXPENSE | Biaya, tarif | Rp5.500
INSERT INTO transactions (account_id, category_id, amount, type, transaction_date, transaction_time, description, payment_method)
SELECT
  (SELECT id FROM accounts    WHERE lower(name) LIKE lower('%Bank Mandiri%')  LIMIT 1),
  (SELECT id FROM categories  WHERE lower(name) LIKE lower('%Biaya, tarif%') AND type = 'expense' LIMIT 1),
  5500,
  'expense',
  '2026-05-08',
  '23:59',
  'Biaya administrasi kartu debit',
  NULL;

-- No. 206: 2026-05-09 | EXPENSE | Restoran, makanan cepat saji | Rp8.000
INSERT INTO transactions (account_id, category_id, amount, type, transaction_date, transaction_time, description, payment_method)
SELECT
  (SELECT id FROM accounts    WHERE lower(name) LIKE lower('%Bank Mandiri%')  LIMIT 1),
  (SELECT id FROM categories  WHERE lower(name) LIKE lower('%Restoran, makanan cepat saji%') AND type = 'expense' LIMIT 1),
  8000,
  'expense',
  '2026-05-09',
  '02:19',
  'Pembayaran QR ke GRAB FOOD 605080769900',
  'QRIS';

-- No. 207: 2026-05-09 | EXPENSE | Restoran, makanan cepat saji | Rp5.899
INSERT INTO transactions (account_id, category_id, amount, type, transaction_date, transaction_time, description, payment_method)
SELECT
  (SELECT id FROM accounts    WHERE lower(name) LIKE lower('%Bank Mandiri%')  LIMIT 1),
  (SELECT id FROM categories  WHERE lower(name) LIKE lower('%Restoran, makanan cepat saji%') AND type = 'expense' LIMIT 1),
  5899,
  'expense',
  '2026-05-09',
  '11:48',
  'Pembayaran QR ke GRAB FOOD 605095005244',
  'QRIS';

-- No. 208: 2026-05-09 | EXPENSE | Belanja | Rp17.000
INSERT INTO transactions (account_id, category_id, amount, type, transaction_date, transaction_time, description, payment_method)
SELECT
  (SELECT id FROM accounts    WHERE lower(name) LIKE lower('%Bank Mandiri%')  LIMIT 1),
  (SELECT id FROM categories  WHERE lower(name) LIKE lower('%Belanja%') AND type = 'expense' LIMIT 1),
  17000,
  'expense',
  '2026-05-09',
  '20:21',
  'Pembayaran QR ke TOKO ASIYVA 605094075623',
  'QRIS';

-- No. 209: 2026-05-09 | EXPENSE | Transportasi | Rp7.000
INSERT INTO transactions (account_id, category_id, amount, type, transaction_date, transaction_time, description, payment_method)
SELECT
  (SELECT id FROM accounts    WHERE lower(name) LIKE lower('%Bank Mandiri%')  LIMIT 1),
  (SELECT id FROM categories  WHERE lower(name) LIKE lower('%Transportasi%') AND type = 'expense' LIMIT 1),
  7000,
  'expense',
  '2026-05-09',
  '20:37',
  'Pembayaran QR ke GRAB TRANSPORT 605096849564',
  'QRIS';

-- No. 210: 2026-05-09 | EXPENSE | Bar, kafe | Rp15.000
INSERT INTO transactions (account_id, category_id, amount, type, transaction_date, transaction_time, description, payment_method)
SELECT
  (SELECT id FROM accounts    WHERE lower(name) LIKE lower('%Bank Mandiri%')  LIMIT 1),
  (SELECT id FROM categories  WHERE lower(name) LIKE lower('%Bar, kafe%') AND type = 'expense' LIMIT 1),
  15000,
  'expense',
  '2026-05-09',
  '20:39',
  'Pembayaran QR ke 2Tress Coffee, Lempuyanga 605096857407',
  'QRIS';

-- No. 211: 2026-05-09 | EXPENSE | Restoran, makanan cepat saji | Rp16.000
INSERT INTO transactions (account_id, category_id, amount, type, transaction_date, transaction_time, description, payment_method)
SELECT
  (SELECT id FROM accounts    WHERE lower(name) LIKE lower('%Bank Mandiri%')  LIMIT 1),
  (SELECT id FROM categories  WHERE lower(name) LIKE lower('%Restoran, makanan cepat saji%') AND type = 'expense' LIMIT 1),
  16000,
  'expense',
  '2026-05-09',
  '21:13',
  'Pembayaran QR ke NASI GORENG GAJAH MUNGKUR 605094268841',
  'QRIS';

-- No. 212: 2026-05-10 | EXPENSE | Biaya, tarif | Rp2.500
INSERT INTO transactions (account_id, category_id, amount, type, transaction_date, transaction_time, description, payment_method)
SELECT
  (SELECT id FROM accounts    WHERE lower(name) LIKE lower('%Bank Mandiri%')  LIMIT 1),
  (SELECT id FROM categories  WHERE lower(name) LIKE lower('%Biaya, tarif%') AND type = 'expense' LIMIT 1),
  2500,
  'expense',
  '2026-05-10',
  '02:41',
  'Biaya transfer BI Fast',
  'Transfer bank';

-- No. 213: 2026-05-10 | EXPENSE | Lainnya | Rp10.000
INSERT INTO transactions (account_id, category_id, amount, type, transaction_date, transaction_time, description, payment_method)
SELECT
  (SELECT id FROM accounts    WHERE lower(name) LIKE lower('%Bank Mandiri%')  LIMIT 1),
  (SELECT id FROM categories  WHERE lower(name) LIKE lower('%Lainnya%') AND type = 'expense' LIMIT 1),
  10000,
  'expense',
  '2026-05-10',
  '02:41',
  'Transfer BI Fast Ke BRI FAQIH HIDAYATULLOH 174601004631507',
  'Transfer bank';

-- No. 214: 2026-05-10 | EXPENSE | Biaya, tarif | Rp2.500
INSERT INTO transactions (account_id, category_id, amount, type, transaction_date, transaction_time, description, payment_method)
SELECT
  (SELECT id FROM accounts    WHERE lower(name) LIKE lower('%Bank Mandiri%')  LIMIT 1),
  (SELECT id FROM categories  WHERE lower(name) LIKE lower('%Biaya, tarif%') AND type = 'expense' LIMIT 1),
  2500,
  'expense',
  '2026-05-10',
  '10:19',
  'Biaya transfer BI Fast',
  'Transfer bank';

-- No. 215: 2026-05-10 | EXPENSE | Lainnya | Rp65.000
INSERT INTO transactions (account_id, category_id, amount, type, transaction_date, transaction_time, description, payment_method)
SELECT
  (SELECT id FROM accounts    WHERE lower(name) LIKE lower('%Bank Mandiri%')  LIMIT 1),
  (SELECT id FROM categories  WHERE lower(name) LIKE lower('%Lainnya%') AND type = 'expense' LIMIT 1),
  65000,
  'expense',
  '2026-05-10',
  '10:19',
  'Transfer BI Fast Ke BRI VADILA FITRIANA WAHY 137201006513502',
  'Transfer bank';

-- No. 216: 2026-05-10 | EXPENSE | Biaya, tarif | Rp2.500
INSERT INTO transactions (account_id, category_id, amount, type, transaction_date, transaction_time, description, payment_method)
SELECT
  (SELECT id FROM accounts    WHERE lower(name) LIKE lower('%Bank Mandiri%')  LIMIT 1),
  (SELECT id FROM categories  WHERE lower(name) LIKE lower('%Biaya, tarif%') AND type = 'expense' LIMIT 1),
  2500,
  'expense',
  '2026-05-10',
  '11:40',
  'Biaya transfer BI Fast',
  'Transfer bank';

-- No. 217: 2026-05-10 | EXPENSE | Lainnya | Rp20.000
INSERT INTO transactions (account_id, category_id, amount, type, transaction_date, transaction_time, description, payment_method)
SELECT
  (SELECT id FROM accounts    WHERE lower(name) LIKE lower('%Bank Mandiri%')  LIMIT 1),
  (SELECT id FROM categories  WHERE lower(name) LIKE lower('%Lainnya%') AND type = 'expense' LIMIT 1),
  20000,
  'expense',
  '2026-05-10',
  '11:40',
  'Transfer BI Fast Ke BCA OMY RENO VERDINAN 2390689384',
  'Transfer bank';

-- No. 218: 2026-05-10 | EXPENSE | Restoran, makanan cepat saji | Rp5.000
INSERT INTO transactions (account_id, category_id, amount, type, transaction_date, transaction_time, description, payment_method)
SELECT
  (SELECT id FROM accounts    WHERE lower(name) LIKE lower('%Bank Mandiri%')  LIMIT 1),
  (SELECT id FROM categories  WHERE lower(name) LIKE lower('%Restoran, makanan cepat saji%') AND type = 'expense' LIMIT 1),
  5000,
  'expense',
  '2026-05-10',
  '12:16',
  'Pembayaran QR ke GRAB FOOD 605100948794',
  'QRIS';

-- No. 219: 2026-05-10 | EXPENSE | Bar, kafe | Rp31.000
INSERT INTO transactions (account_id, category_id, amount, type, transaction_date, transaction_time, description, payment_method)
SELECT
  (SELECT id FROM accounts    WHERE lower(name) LIKE lower('%Bank Mandiri%')  LIMIT 1),
  (SELECT id FROM categories  WHERE lower(name) LIKE lower('%Bar, kafe%') AND type = 'expense' LIMIT 1),
  31000,
  'expense',
  '2026-05-10',
  '17:47',
  'Pembayaran QR ke Warkop Woenderbar 605109614665',
  'QRIS';

-- No. 220: 2026-05-11 | EXPENSE | Lainnya | Rp30.000
INSERT INTO transactions (account_id, category_id, amount, type, transaction_date, transaction_time, description, payment_method)
SELECT
  (SELECT id FROM accounts    WHERE lower(name) LIKE lower('%Bank Mandiri%')  LIMIT 1),
  (SELECT id FROM categories  WHERE lower(name) LIKE lower('%Lainnya%') AND type = 'expense' LIMIT 1),
  30000,
  'expense',
  '2026-05-11',
  '11:40',
  'Pembayaran QR ke Mitsal Kayyisa Rahadatu&#39;a 605116702440',
  'QRIS';

-- No. 221: 2026-05-11 | EXPENSE | Restoran, makanan cepat saji | Rp9.000
INSERT INTO transactions (account_id, category_id, amount, type, transaction_date, transaction_time, description, payment_method)
SELECT
  (SELECT id FROM accounts    WHERE lower(name) LIKE lower('%Bank Mandiri%')  LIMIT 1),
  (SELECT id FROM categories  WHERE lower(name) LIKE lower('%Restoran, makanan cepat saji%') AND type = 'expense' LIMIT 1),
  9000,
  'expense',
  '2026-05-11',
  '12:45',
  'Pembayaran QR ke nieta kitchen 605114208800',
  'QRIS';

-- No. 222: 2026-05-11 | EXPENSE | Restoran, makanan cepat saji | Rp4.000
INSERT INTO transactions (account_id, category_id, amount, type, transaction_date, transaction_time, description, payment_method)
SELECT
  (SELECT id FROM accounts    WHERE lower(name) LIKE lower('%Bank Mandiri%')  LIMIT 1),
  (SELECT id FROM categories  WHERE lower(name) LIKE lower('%Restoran, makanan cepat saji%') AND type = 'expense' LIMIT 1),
  4000,
  'expense',
  '2026-05-11',
  '12:54',
  'Pembayaran QR ke QOMA SALAD INDONESIA 605116958537',
  'QRIS';

-- No. 223: 2026-05-11 | EXPENSE | Belanja | Rp24.500
INSERT INTO transactions (account_id, category_id, amount, type, transaction_date, transaction_time, description, payment_method)
SELECT
  (SELECT id FROM accounts    WHERE lower(name) LIKE lower('%Bank Mandiri%')  LIMIT 1),
  (SELECT id FROM categories  WHERE lower(name) LIKE lower('%Belanja%') AND type = 'expense' LIMIT 1),
  24500,
  'expense',
  '2026-05-11',
  '14:55',
  'Pembayaran QR ke TOKO ASIYVA 605114568314',
  'QRIS';

-- No. 224: 2026-05-11 | EXPENSE | Restoran, makanan cepat saji | Rp21.500
INSERT INTO transactions (account_id, category_id, amount, type, transaction_date, transaction_time, description, payment_method)
SELECT
  (SELECT id FROM accounts    WHERE lower(name) LIKE lower('%Bank Mandiri%')  LIMIT 1),
  (SELECT id FROM categories  WHERE lower(name) LIKE lower('%Restoran, makanan cepat saji%') AND type = 'expense' LIMIT 1),
  21500,
  'expense',
  '2026-05-11',
  '18:28',
  'Pembayaran QR ke warmindo kedai mutiara 2. 605110311487',
  'QRIS';

-- No. 225: 2026-05-11 | EXPENSE | Restoran, makanan cepat saji | Rp4.000
INSERT INTO transactions (account_id, category_id, amount, type, transaction_date, transaction_time, description, payment_method)
SELECT
  (SELECT id FROM accounts    WHERE lower(name) LIKE lower('%Bank Mandiri%')  LIMIT 1),
  (SELECT id FROM categories  WHERE lower(name) LIKE lower('%Restoran, makanan cepat saji%') AND type = 'expense' LIMIT 1),
  4000,
  'expense',
  '2026-05-11',
  '22:55',
  'Pembayaran QR ke GRAB FOOD 605118728091',
  'QRIS';

-- No. 226: 2026-05-12 | EXPENSE | Transportasi | Rp6.000
INSERT INTO transactions (account_id, category_id, amount, type, transaction_date, transaction_time, description, payment_method)
SELECT
  (SELECT id FROM accounts    WHERE lower(name) LIKE lower('%Bank Mandiri%')  LIMIT 1),
  (SELECT id FROM categories  WHERE lower(name) LIKE lower('%Transportasi%') AND type = 'expense' LIMIT 1),
  6000,
  'expense',
  '2026-05-12',
  '07:25',
  'Pembayaran QR ke GRAB TRANSPORT 605121582379',
  'QRIS';

-- No. 227: 2026-05-12 | EXPENSE | Restoran, makanan cepat saji | Rp10.000
INSERT INTO transactions (account_id, category_id, amount, type, transaction_date, transaction_time, description, payment_method)
SELECT
  (SELECT id FROM accounts    WHERE lower(name) LIKE lower('%Bank Mandiri%')  LIMIT 1),
  (SELECT id FROM categories  WHERE lower(name) LIKE lower('%Restoran, makanan cepat saji%') AND type = 'expense' LIMIT 1),
  10000,
  'expense',
  '2026-05-12',
  '09:03',
  'Pembayaran QR ke nieta kitchen 605129407729',
  'QRIS';

-- No. 228: 2026-05-13 | EXPENSE | Restoran, makanan cepat saji | Rp4.500
INSERT INTO transactions (account_id, category_id, amount, type, transaction_date, transaction_time, description, payment_method)
SELECT
  (SELECT id FROM accounts    WHERE lower(name) LIKE lower('%Bank Mandiri%')  LIMIT 1),
  (SELECT id FROM categories  WHERE lower(name) LIKE lower('%Restoran, makanan cepat saji%') AND type = 'expense' LIMIT 1),
  4500,
  'expense',
  '2026-05-13',
  '10:03',
  'Pembayaran QR ke GRAB FOOD 605130200019',
  'QRIS';

-- No. 229: 2026-05-13 | EXPENSE | Restoran, makanan cepat saji | Rp9.500
INSERT INTO transactions (account_id, category_id, amount, type, transaction_date, transaction_time, description, payment_method)
SELECT
  (SELECT id FROM accounts    WHERE lower(name) LIKE lower('%Bank Mandiri%')  LIMIT 1),
  (SELECT id FROM categories  WHERE lower(name) LIKE lower('%Restoran, makanan cepat saji%') AND type = 'expense' LIMIT 1),
  9500,
  'expense',
  '2026-05-13',
  '10:14',
  'Pembayaran QR ke GRAB FOOD 605130227516',
  'QRIS';

-- No. 230: 2026-05-13 | EXPENSE | Belanja | Rp5.500
INSERT INTO transactions (account_id, category_id, amount, type, transaction_date, transaction_time, description, payment_method)
SELECT
  (SELECT id FROM accounts    WHERE lower(name) LIKE lower('%Bank Mandiri%')  LIMIT 1),
  (SELECT id FROM categories  WHERE lower(name) LIKE lower('%Belanja%') AND type = 'expense' LIMIT 1),
  5500,
  'expense',
  '2026-05-13',
  '20:12',
  'Pembayaran QR ke TOKO ASIYVA 605132138166',
  'QRIS';

-- No. 231: 2026-05-14 | EXPENSE | Biaya, tarif | Rp2.500
INSERT INTO transactions (account_id, category_id, amount, type, transaction_date, transaction_time, description, payment_method)
SELECT
  (SELECT id FROM accounts    WHERE lower(name) LIKE lower('%Bank Mandiri%')  LIMIT 1),
  (SELECT id FROM categories  WHERE lower(name) LIKE lower('%Biaya, tarif%') AND type = 'expense' LIMIT 1),
  2500,
  'expense',
  '2026-05-14',
  '09:34',
  'Biaya transfer BI Fast',
  'Transfer bank';

-- No. 232: 2026-05-14 | EXPENSE | Lainnya | Rp2.000.000
INSERT INTO transactions (account_id, category_id, amount, type, transaction_date, transaction_time, description, payment_method)
SELECT
  (SELECT id FROM accounts    WHERE lower(name) LIKE lower('%Bank Mandiri%')  LIMIT 1),
  (SELECT id FROM categories  WHERE lower(name) LIKE lower('%Lainnya%') AND type = 'expense' LIMIT 1),
  2000000,
  'expense',
  '2026-05-14',
  '09:34',
  'Transfer BI Fast Ke DNID RIZXX HIDXXXXXX 85877593405',
  'Transfer bank';

-- No. 233: 2026-05-14 | EXPENSE | Restoran, makanan cepat saji | Rp15.500
INSERT INTO transactions (account_id, category_id, amount, type, transaction_date, transaction_time, description, payment_method)
SELECT
  (SELECT id FROM accounts    WHERE lower(name) LIKE lower('%Bank Mandiri%')  LIMIT 1),
  (SELECT id FROM categories  WHERE lower(name) LIKE lower('%Restoran, makanan cepat saji%') AND type = 'expense' LIMIT 1),
  15500,
  'expense',
  '2026-05-14',
  '09:37',
  'Pembayaran QR ke WARUNG MAKAN MAK TUM, DEP 605146002738',
  'QRIS';

-- No. 234: 2026-05-14 | EXPENSE | Restoran, makanan cepat saji | Rp4.000
INSERT INTO transactions (account_id, category_id, amount, type, transaction_date, transaction_time, description, payment_method)
SELECT
  (SELECT id FROM accounts    WHERE lower(name) LIKE lower('%Bank Mandiri%')  LIMIT 1),
  (SELECT id FROM categories  WHERE lower(name) LIKE lower('%Restoran, makanan cepat saji%') AND type = 'expense' LIMIT 1),
  4000,
  'expense',
  '2026-05-14',
  '10:47',
  'Pembayaran QR ke GRAB FOOD 605143587844',
  'QRIS';

-- No. 235: 2026-05-14 | EXPENSE | Transportasi | Rp10.000
INSERT INTO transactions (account_id, category_id, amount, type, transaction_date, transaction_time, description, payment_method)
SELECT
  (SELECT id FROM accounts    WHERE lower(name) LIKE lower('%Bank Mandiri%')  LIMIT 1),
  (SELECT id FROM categories  WHERE lower(name) LIKE lower('%Transportasi%') AND type = 'expense' LIMIT 1),
  10000,
  'expense',
  '2026-05-14',
  '16:43',
  'Pembayaran QR ke GRAB TRANSPORT 605147248319',
  'QRIS';

-- No. 236: 2026-05-14 | EXPENSE | Restoran, makanan cepat saji | Rp17.000
INSERT INTO transactions (account_id, category_id, amount, type, transaction_date, transaction_time, description, payment_method)
SELECT
  (SELECT id FROM accounts    WHERE lower(name) LIKE lower('%Bank Mandiri%')  LIMIT 1),
  (SELECT id FROM categories  WHERE lower(name) LIKE lower('%Restoran, makanan cepat saji%') AND type = 'expense' LIMIT 1),
  17000,
  'expense',
  '2026-05-14',
  '18:15',
  'Pembayaran QR ke RM PADANG EMBUN PAGI, DEP 605140084657',
  'QRIS';

-- ─── Preview hasil insert ──────────────────────────────────────────────
SELECT count(*) as total_inserted FROM transactions;

-- HAPUS baris ROLLBACK di bawah ini jika hasilnya sudah benar, lalu run ulang
ROLLBACK;

-- Jika sudah yakin, ganti ROLLBACK dengan:
-- COMMIT;