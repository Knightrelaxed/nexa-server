-- ============================================================
-- NEXA CORE & DOMAIN - COMPREHENSIVE ROW LEVEL SECURITY (RLS)
-- Mengamankan seluruh 19+ tabel internal N.E.X.A agar tidak bisa
-- dibaca/ditulis oleh anon key yang terekspos di browser client.
--
-- Server N.E.X.A (VPS) menggunakan SUPABASE_KEY ber-role `service_role`
-- yang secara default mem-bypass RLS, sehingga sistem berjalan 100%
-- tanpa gangguan maupun latensi tambahan.
-- ============================================================

DO $$ 
DECLARE 
  r RECORD;
BEGIN
  FOR r IN (
    SELECT tablename 
    FROM pg_tables 
    WHERE schemaname = 'public' 
      AND tablename LIKE 'nexa_%'
  ) LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', r.tablename);
    RAISE NOTICE 'RLS Enabled on table: %', r.tablename;
  END LOOP;
END $$;

-- Verifikasi status RLS seluruh tabel di public schema
SELECT tablename, rowsecurity 
FROM pg_tables 
WHERE schemaname = 'public' 
ORDER BY tablename;
