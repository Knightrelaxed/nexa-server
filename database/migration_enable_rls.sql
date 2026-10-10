-- ============================================================
-- NEXA FINANCE - ROW LEVEL SECURITY (RLS) ACTIVATION
-- Mengamankan Database Supabase agar hanya dapat diakses
-- oleh user yang terautentikasi (Tuan Faqih) dan Server N.E.X.A.
-- ============================================================

-- 1. Aktifkan RLS pada tabel inti keuangan
ALTER TABLE IF EXISTS accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS budget_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS budgets ENABLE ROW LEVEL SECURITY;

-- 2. Hapus policy lama jika ada (idempoten)
DROP POLICY IF EXISTS "Allow authenticated full access on accounts" ON accounts;
DROP POLICY IF EXISTS "Allow authenticated full access on categories" ON categories;
DROP POLICY IF EXISTS "Allow authenticated full access on transactions" ON transactions;
DROP POLICY IF EXISTS "Allow authenticated full access on budget_groups" ON budget_groups;
DROP POLICY IF EXISTS "Allow authenticated full access on budgets" ON budgets;

-- 3. Berikan hak akses penuh untuk pengguna yang telah login (authenticated)
-- Browser dengan anon key TANPA login akan diblokir total (0 rows dikembalikan).
CREATE POLICY "Allow authenticated full access on accounts"
  ON accounts FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

CREATE POLICY "Allow authenticated full access on categories"
  ON categories FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

CREATE POLICY "Allow authenticated full access on transactions"
  ON transactions FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

CREATE POLICY "Allow authenticated full access on budget_groups"
  ON budget_groups FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

CREATE POLICY "Allow authenticated full access on budgets"
  ON budgets FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

-- CATATAN PENTING:
-- Server N.E.X.A (Telegram bot & background cron) harus menggunakan SUPABASE_KEY
-- dengan role `service_role`. Service Role Key secara otomatis mem-BYPASS RLS,
-- sehingga transaksi via Telegram, WhatsApp, dan Google Workspace tetap berjalan
-- dengan kecepatan native tanpa halangan.
