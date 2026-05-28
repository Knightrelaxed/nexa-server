-- ============================================================
-- Nexa Finance – Supabase Database Schema
-- ============================================================

-- ----------------------------------------------------------------
-- 1. TABLES
-- ----------------------------------------------------------------

-- accounts
CREATE TABLE IF NOT EXISTS accounts (
  id                 uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  name               text         NOT NULL,
  type               text         NOT NULL CHECK (type IN ('cash', 'bank', 'e-wallet')),
  initial_balance    decimal      DEFAULT 0,
  currency           text         DEFAULT 'IDR',
  color              text         DEFAULT '#22d3ee',
  icon_key           text         DEFAULT 'wallet',
  is_archived        boolean      DEFAULT false,
  exclude_from_stats boolean      DEFAULT false,
  created_at         timestamptz  DEFAULT now()
);

-- categories
CREATE TABLE IF NOT EXISTS categories (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text        NOT NULL,
  type       text        NOT NULL CHECK (type IN ('income', 'expense')),
  group_name text,
  icon_key   text        NOT NULL,
  icon_bg    text,
  icon_color text,
  color_hex  text,
  sort_order int         DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

-- transactions
CREATE TABLE IF NOT EXISTS transactions (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id       uuid        REFERENCES accounts(id) ON DELETE CASCADE NOT NULL,
  category_id      uuid        REFERENCES categories(id) NOT NULL,
  amount           decimal     NOT NULL CHECK (amount > 0),
  type             text        NOT NULL CHECK (type IN ('income', 'expense', 'transfer')),
  transaction_date date        NOT NULL,
  transaction_time text,
  description      text,
  created_at       timestamptz DEFAULT now()
);

-- ----------------------------------------------------------------
-- 2. INDEXES
-- ----------------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_transactions_date
  ON transactions (transaction_date);

CREATE INDEX IF NOT EXISTS idx_transactions_account
  ON transactions (account_id);

CREATE INDEX IF NOT EXISTS idx_transactions_category
  ON transactions (category_id);



-- ----------------------------------------------------------------
-- 4. FUNCTIONS
-- ----------------------------------------------------------------

-- get_monthly_summary: returns month, total_income, total_expense for last N months
CREATE OR REPLACE FUNCTION get_monthly_summary(
  p_months  int DEFAULT 7
)
RETURNS TABLE (
  month          text,
  total_income   decimal,
  total_expense  decimal
)
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  RETURN QUERY
  SELECT
    to_char(date_trunc('month', t.transaction_date), 'YYYY-MM') AS month,
    COALESCE(SUM(CASE WHEN t.type = 'income'  THEN t.amount ELSE 0 END), 0) AS total_income,
    COALESCE(SUM(CASE WHEN t.type = 'expense' THEN t.amount ELSE 0 END), 0) AS total_expense
  FROM transactions t
  WHERE
    t.transaction_date >= date_trunc('month', now()) - ((p_months - 1) * INTERVAL '1 month')
    AND t.transaction_date <  date_trunc('month', now()) +   INTERVAL '1 month'
  GROUP BY date_trunc('month', t.transaction_date)
  ORDER BY date_trunc('month', t.transaction_date);
END;
$$;

-- get_daily_balance_trend: running balance day by day for a given account and date range
CREATE OR REPLACE FUNCTION get_daily_balance_trend(
  p_account_id uuid,
  p_start      date,
  p_end        date
)
RETURNS TABLE (
  day             date,
  daily_income    decimal,
  daily_expense   decimal,
  running_balance decimal
)
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_initial decimal;
BEGIN
  -- grab initial balance for the account
  SELECT COALESCE(a.initial_balance, 0)
    INTO v_initial
    FROM accounts a
   WHERE a.id = p_account_id;

  RETURN QUERY
  WITH date_series AS (
    SELECT generate_series(p_start, p_end, INTERVAL '1 day')::date AS day
  ),
  daily AS (
    SELECT
      t.transaction_date                                                    AS day,
      COALESCE(SUM(CASE WHEN t.type = 'income'  THEN t.amount ELSE 0 END), 0) AS daily_income,
      COALESCE(SUM(CASE WHEN t.type = 'expense' THEN t.amount ELSE 0 END), 0) AS daily_expense
    FROM transactions t
    WHERE
      t.account_id = p_account_id
      AND t.transaction_date BETWEEN p_start AND p_end
    GROUP BY t.transaction_date
  )
  SELECT
    ds.day,
    COALESCE(d.daily_income,  0) AS daily_income,
    COALESCE(d.daily_expense, 0) AS daily_expense,
    v_initial + SUM(COALESCE(d.daily_income, 0) - COALESCE(d.daily_expense, 0))
      OVER (ORDER BY ds.day ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS running_balance
  FROM date_series ds
  LEFT JOIN daily d ON d.day = ds.day
  ORDER BY ds.day;
END;
$$;

-- ----------------------------------------------------------------
-- 5. SEED DATA FUNCTION
-- ----------------------------------------------------------------

CREATE OR REPLACE FUNCTION seed_default_categories()
RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  -- expense categories
  INSERT INTO categories (group_name, name, type, icon_key, icon_bg, icon_color, sort_order) VALUES
    ('Makanan & Minuman', 'Makanan dan minuman', 'expense', 'utensils', 'bg-rose-100', 'text-rose-500', 1),
    ('Makanan & Minuman', 'Bar, kafe', 'expense', 'coffee', 'bg-orange-100', 'text-orange-500', 2),
    ('Makanan & Minuman', 'Restoran, makanan cepat saji', 'expense', 'pizza', 'bg-red-100', 'text-red-500', 3),
    ('Makanan & Minuman', 'Bahan makanan', 'expense', 'shopping-cart', 'bg-emerald-100', 'text-emerald-500', 4),

    ('Belanja', 'Apotek, obat-obatan', 'expense', 'pill', 'bg-cyan-100', 'text-cyan-500', 5),
    ('Belanja', 'Belanja', 'expense', 'shopping-bag', 'bg-pink-100', 'text-pink-500', 6),
    ('Belanja', 'Waktu luang', 'expense', 'gamepad-2', 'bg-purple-100', 'text-purple-500', 7),
    ('Belanja', 'Alat tulis, peralatan', 'expense', 'pen-tool', 'bg-gray-100', 'text-gray-500', 8),
    ('Belanja', 'Hadiah, kesenangan', 'expense', 'gift', 'bg-rose-100', 'text-rose-400', 9),
    ('Belanja', 'Elektronik, aksesoris', 'expense', 'smartphone', 'bg-slate-100', 'text-slate-500', 10),
    ('Belanja', 'Hewan peliharaan, hewan', 'expense', 'heart', 'bg-amber-100', 'text-amber-500', 11),
    ('Belanja', 'Rumah, taman', 'expense', 'home', 'bg-green-100', 'text-green-500', 12),
    ('Belanja', 'Anak-anak', 'expense', 'baby', 'bg-blue-100', 'text-blue-400', 13),
    ('Belanja', 'Kesehatan dan kecantikan', 'expense', 'sparkles', 'bg-pink-100', 'text-pink-400', 14),
    ('Belanja', 'Perhiasan, aksesoris', 'expense', 'gem', 'bg-indigo-100', 'text-indigo-400', 15),
    ('Belanja', 'Pakaian dan alas kaki', 'expense', 'shirt', 'bg-violet-100', 'text-violet-500', 16),

    ('Perumahan', 'Asuransi properti', 'expense', 'shield-check', 'bg-blue-100', 'text-blue-500', 17),
    ('Perumahan', 'Perumahan', 'expense', 'building', 'bg-stone-100', 'text-stone-500', 18),
    ('Perumahan', 'Perawatan, perbaikan', 'expense', 'wrench', 'bg-gray-100', 'text-gray-600', 19),
    ('Perumahan', 'Layanan', 'expense', 'briefcase', 'bg-amber-100', 'text-amber-600', 20),
    ('Perumahan', 'Energi, utilitas', 'expense', 'zap', 'bg-yellow-100', 'text-yellow-500', 21),
    ('Perumahan', 'Hipotek', 'expense', 'home', 'bg-orange-100', 'text-orange-600', 22),
    ('Perumahan', 'Sewa', 'expense', 'key', 'bg-teal-100', 'text-teal-500', 23),

    ('Transportasi', 'Transportasi', 'expense', 'bus', 'bg-blue-100', 'text-blue-600', 24),
    ('Transportasi', 'Perjalanan dinas', 'expense', 'briefcase', 'bg-slate-100', 'text-slate-600', 25),
    ('Transportasi', 'Jarak jauh', 'expense', 'plane', 'bg-sky-100', 'text-sky-500', 26),
    ('Transportasi', 'Taksi', 'expense', 'car', 'bg-yellow-100', 'text-yellow-600', 27),
    ('Transportasi', 'Transportasi umum', 'expense', 'train', 'bg-emerald-100', 'text-emerald-600', 28),

    ('Kendaraan', 'Leasing', 'expense', 'file-text', 'bg-gray-100', 'text-gray-500', 29),
    ('Kendaraan', 'Asuransi kendaraan', 'expense', 'shield', 'bg-blue-100', 'text-blue-400', 30),
    ('Kendaraan', 'Kendaraan', 'expense', 'car', 'bg-zinc-100', 'text-zinc-600', 31),
    ('Kendaraan', 'Sewa-menyewa', 'expense', 'key', 'bg-cyan-100', 'text-cyan-500', 32),
    ('Kendaraan', 'Perawatan kendaraan', 'expense', 'wrench', 'bg-stone-100', 'text-stone-600', 33),
    ('Kendaraan', 'Parkir', 'expense', 'circle-parking', 'bg-slate-100', 'text-slate-500', 34),
    ('Kendaraan', 'Bahan bakar', 'expense', 'fuel', 'bg-red-100', 'text-red-500', 35),

    ('Hiburan & Kehidupan', 'Hiburan dan kehidupan', 'expense', 'music', 'bg-purple-100', 'text-purple-500', 36),
    ('Hiburan & Kehidupan', 'Lotere, judi', 'expense', 'dices', 'bg-rose-100', 'text-rose-600', 37),
    ('Hiburan & Kehidupan', 'Alkohol, tembakau', 'expense', 'wine', 'bg-red-100', 'text-red-600', 38),
    ('Hiburan & Kehidupan', 'Amal, hadiah', 'expense', 'heart', 'bg-rose-100', 'text-rose-400', 39),
    ('Hiburan & Kehidupan', 'Liburan, perjalanan, hotel', 'expense', 'plane', 'bg-sky-100', 'text-sky-400', 40),
    ('Hiburan & Kehidupan', 'TV, streaming', 'expense', 'tv', 'bg-indigo-100', 'text-indigo-500', 41),
    ('Hiburan & Kehidupan', 'Buku, audio, langganan', 'expense', 'book', 'bg-orange-100', 'text-orange-500', 42),
    ('Hiburan & Kehidupan', 'Pendidikan, pengembangan diri', 'expense', 'graduation-cap', 'bg-blue-100', 'text-blue-500', 43),
    ('Hiburan & Kehidupan', 'Hobi', 'expense', 'palette', 'bg-pink-100', 'text-pink-400', 44),
    ('Hiburan & Kehidupan', 'Peristiwa hidup', 'expense', 'cake', 'bg-rose-100', 'text-rose-400', 45),
    ('Hiburan & Kehidupan', 'Budaya, acara olahraga', 'expense', 'ticket', 'bg-amber-100', 'text-amber-500', 46),
    ('Hiburan & Kehidupan', 'Olahraga aktif, kebugaran', 'expense', 'dumbbell', 'bg-slate-100', 'text-slate-600', 47),
    ('Hiburan & Kehidupan', 'Kesehatan, kecantikan', 'expense', 'heart-pulse', 'bg-rose-100', 'text-rose-500', 48),
    ('Hiburan & Kehidupan', 'Perawatan kesehatan, dokter', 'expense', 'stethoscope', 'bg-cyan-100', 'text-cyan-600', 49),

    ('Komunikasi, PC', 'Komunikasi, PC', 'expense', 'monitor', 'bg-gray-100', 'text-gray-500', 50),
    ('Komunikasi, PC', 'Layanan pos', 'expense', 'mail', 'bg-yellow-100', 'text-yellow-600', 51),
    ('Komunikasi, PC', 'Perangkat lunak, aplikasi, permainan', 'expense', 'box', 'bg-indigo-100', 'text-indigo-400', 52),
    ('Komunikasi, PC', 'Internet', 'expense', 'wifi', 'bg-blue-100', 'text-blue-500', 53),
    ('Komunikasi, PC', 'Telepon, ponsel', 'expense', 'phone', 'bg-green-100', 'text-green-500', 54),

    ('Pengeluaran keuangan', 'Pengeluaran keuangan', 'expense', 'credit-card', 'bg-slate-100', 'text-slate-600', 55),
    ('Pengeluaran keuangan', 'Tunjangan anak', 'expense', 'baby', 'bg-blue-100', 'text-blue-500', 56),
    ('Pengeluaran keuangan', 'Biaya, tarif', 'expense', 'receipt', 'bg-gray-100', 'text-gray-500', 57),
    ('Pengeluaran keuangan', 'Konsultasi', 'expense', 'message-circle', 'bg-blue-100', 'text-blue-400', 58),
    ('Pengeluaran keuangan', 'Denda', 'expense', 'alert-triangle', 'bg-red-100', 'text-red-500', 59),
    ('Pengeluaran keuangan', 'Pinjaman, bunga', 'expense', 'landmark', 'bg-amber-100', 'text-amber-600', 60),
    ('Pengeluaran keuangan', 'Asuransi', 'expense', 'shield', 'bg-blue-100', 'text-blue-500', 61),
    ('Pengeluaran keuangan', 'Pajak', 'expense', 'file-text', 'bg-red-100', 'text-red-400', 62),

    ('Investasi', 'Investasi', 'expense', 'trending-up', 'bg-emerald-100', 'text-emerald-600', 63),
    ('Investasi', 'Koleksi', 'expense', 'archive', 'bg-orange-100', 'text-orange-500', 64),
    ('Investasi', 'Tabungan', 'expense', 'piggy-bank', 'bg-pink-100', 'text-pink-500', 65),
    ('Investasi', 'Investasi keuangan', 'expense', 'line-chart', 'bg-teal-100', 'text-teal-600', 66),
    ('Investasi', 'Kendaraan, barang bergerak', 'expense', 'car', 'bg-stone-100', 'text-stone-500', 67),
    ('Investasi', 'Properti', 'expense', 'building', 'bg-blue-100', 'text-blue-600', 68),

    ('Lainnya', 'Hilangan', 'expense', 'trending-down', 'bg-red-100', 'text-red-500', 69),
    ('Lainnya', 'Lainnya', 'expense', 'more-horizontal', 'bg-gray-100', 'text-gray-500', 70);

  -- income categories
  INSERT INTO categories (group_name, name, type, icon_key, icon_bg, icon_color, sort_order) VALUES
    ('Pendapatan', 'Pendapatan', 'income', 'wallet', 'bg-emerald-100', 'text-emerald-600', 1),
    ('Pendapatan', 'Hadiah', 'income', 'gift', 'bg-rose-100', 'text-rose-500', 2),
    ('Pendapatan', 'Pengembalian dana pajak, pembelian', 'income', 'receipt', 'bg-teal-100', 'text-teal-600', 4),
    ('Pendapatan', 'Cek, kupon', 'income', 'ticket', 'bg-amber-100', 'text-amber-500', 5),
    ('Pendapatan', 'Pendapatan dari meminjamkan', 'income', 'coins', 'bg-yellow-100', 'text-yellow-600', 6),
    ('Pendapatan', 'Iuran & hibah', 'income', 'hand-heart', 'bg-pink-100', 'text-pink-500', 7),
    ('Pendapatan', 'Pendapatan sewa', 'income', 'key', 'bg-indigo-100', 'text-indigo-500', 8),
    ('Pendapatan', 'Penjualan', 'income', 'shopping-bag', 'bg-purple-100', 'text-purple-500', 9),
    ('Pendapatan', 'Bunga, dividen', 'income', 'percent', 'bg-emerald-100', 'text-emerald-500', 10),
    ('Pendapatan', 'Gaji, faktur', 'income', 'briefcase', 'bg-green-100', 'text-green-600', 11);
END;
$$;
