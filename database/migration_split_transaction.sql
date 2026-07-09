-- ============================================================
-- Migration: Tambah kolom split_group_id dan split_label
-- di tabel transactions untuk fitur Split Transaction N.E.X.A
--
-- JALANKAN SEKALI di Supabase SQL Editor sebelum deploy.
-- ============================================================

-- Kolom 1: split_group_id
-- UUID yang sama untuk semua baris yang berasal dari satu transaksi yang di-split.
-- NULL = transaksi biasa (bukan hasil split).
ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS split_group_id UUID DEFAULT NULL;

-- Kolom 2: split_label
-- Deskripsi singkat item split (e.g. "beras & telur", "es krim", "sabun muka").
-- NULL = transaksi biasa.
ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS split_label TEXT DEFAULT NULL;

-- Index untuk mempercepat kueri grouping (opsional tapi direkomendasikan)
CREATE INDEX IF NOT EXISTS idx_transactions_split_group
  ON transactions(split_group_id)
  WHERE split_group_id IS NOT NULL;

-- Verifikasi kolom sudah ada
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'transactions'
  AND column_name IN ('split_group_id', 'split_label')
ORDER BY column_name;
