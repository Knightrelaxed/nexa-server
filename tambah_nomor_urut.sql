-- 1. Buat sistem penomoran otomatis (sequence)
CREATE SEQUENCE IF NOT EXISTS transactions_no_seq;

-- 2. Tambahkan kolom "no" ke tabel transactions
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS no BIGINT;

-- 3. Isi nomor untuk data lama secara KRONOLOGIS (dari yang terlama ke terbaru)
WITH ordered AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY transaction_date ASC, transaction_time ASC, created_at ASC) as rn
  FROM transactions
)
UPDATE transactions
SET no = ordered.rn
FROM ordered
WHERE transactions.id = ordered.id;

-- 4. Hubungkan nomor terakhir agar transaksi baru melanjutkannya
SELECT setval('transactions_no_seq', (SELECT COALESCE(MAX(no), 1) FROM transactions));

-- 5. Buat kolom ini otomatis terisi untuk transaksi di masa depan
ALTER TABLE transactions ALTER COLUMN no SET DEFAULT nextval('transactions_no_seq');

-- 6. (Opsional tapi disarankan) Jadikan "no" unik
ALTER TABLE transactions ADD CONSTRAINT transactions_no_key UNIQUE (no);
