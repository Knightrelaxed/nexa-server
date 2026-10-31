-- ============================================================
-- Migration: Tambah 'Direct Debit' ke check constraint payment_method
-- di tabel transactions untuk Nexa Finance
--
-- JALANKAN SEKALI di Supabase SQL Editor:
-- https://supabase.com/dashboard/project/higkcusencotahphhzsz/sql
-- ============================================================

-- 1. Hapus constraint lama jika ada
ALTER TABLE transactions 
  DROP CONSTRAINT IF EXISTS transactions_payment_method_check;

-- 2. Buat ulang constraint dengan menambahkan 'Direct Debit'
ALTER TABLE transactions 
  ADD CONSTRAINT transactions_payment_method_check 
  CHECK (
    payment_method IS NULL OR 
    payment_method IN ('QRIS', 'Transfer bank', 'Kartu Kredit', 'Tunai', 'Direct Debit')
  );

-- 3. Verifikasi definisi constraint
SELECT conname, pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conrelid = 'transactions'::regclass
  AND conname = 'transactions_payment_method_check';
