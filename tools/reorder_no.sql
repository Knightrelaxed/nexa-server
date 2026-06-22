BEGIN;

-- 1. Mengurutkan ulang kolom 'no' dari 1 sampai 300 berdasarkan urutan 'no' sebelumnya
WITH reordered AS (
  SELECT id, row_number() OVER (ORDER BY no ASC) as new_no
  FROM transactions
)
UPDATE transactions t
SET no = r.new_no
FROM reordered r
WHERE t.id = r.id;

-- 2. Mengatur ulang auto-increment (sequence) agar insert berikutnya dimulai dari 301
SELECT setval(pg_get_serial_sequence('transactions', 'no'), coalesce((SELECT MAX(no) FROM transactions), 1));

COMMIT;
