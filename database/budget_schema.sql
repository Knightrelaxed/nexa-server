-- ==========================================
-- BUDGETING / JATAH FEATURE MIGRATION
-- Jalankan skrip ini di Supabase SQL Editor
-- ==========================================

-- 1. Tabel Kelompok Kategori (Budget Groups)
-- Digunakan untuk mengelompokkan kategori menjadi satu kesatuan limit (misal: "Makanan" = Jajan + Makan Berat + Bahan Makanan)
CREATE TABLE IF NOT EXISTS budget_groups (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name        TEXT NOT NULL,          -- Contoh: "Makanan", "Transportasi"
  color       TEXT DEFAULT '#10b981', -- Warna hex untuk UI
  icon        TEXT DEFAULT 'utensils',-- Ikon lucide-react
  category_ids UUID[] DEFAULT '{}',   -- Array UUID dari tabel categories yang sudah ada
  is_archived BOOLEAN DEFAULT FALSE,
  sort_order  INT DEFAULT 0,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Tabel Anggaran (Budgets)
-- Menyimpan batas nominal per periode. budget_group_id NULL berarti Global Budget.
CREATE TABLE IF NOT EXISTS budgets (
  id             UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  budget_group_id UUID REFERENCES budget_groups(id) ON DELETE CASCADE, -- NULL = Global
  period         TEXT NOT NULL CHECK (period IN ('daily', 'weekly', 'monthly')),
  amount         NUMERIC(15,2) NOT NULL,  -- Nominal jatah (contoh: 50000, 350000)
  is_active      BOOLEAN DEFAULT TRUE,
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  updated_at     TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (budget_group_id, period) -- 1 anggaran per kelompok per periode
);

CREATE INDEX IF NOT EXISTS idx_budgets_group ON budgets(budget_group_id);
CREATE INDEX IF NOT EXISTS idx_budgets_period ON budgets(period);

-- ==========================================
-- NOTE: 
-- Anda dapat menambahkan dan mengatur Anggaran serta Kelompok Kategori
-- sepenuhnya melalui Dasbor Nexa Finance Web.
-- ==========================================
