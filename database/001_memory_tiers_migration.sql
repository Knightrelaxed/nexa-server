-- =====================================================================
-- N.E.X.A Memory Tiers Migration (v3.4.4 - 2026-10-31)
-- Harmonized for nexa_user_profile & nexa_core_identity
-- PERMANENT_FACT -> CORE, add PHASE, add lifecycle columns.
-- Idempotent & Safe: Run in Supabase SQL Editor.
-- =====================================================================
BEGIN;

-- 0. Safety backups (Bisa di-drop nanti setelah diverifikasi) ----------
CREATE TABLE IF NOT EXISTS nexa_user_profile_bak_20261031 AS
  SELECT * FROM nexa_user_profile;

CREATE TABLE IF NOT EXISTS nexa_core_identity_bak_20261031 AS
  SELECT * FROM nexa_core_identity;

-- 1. Drop old CHECK constraints dynamically on category_type ----------
DO $$
DECLARE r RECORD;
BEGIN
  -- Drop constraint on nexa_user_profile
  FOR r IN
    SELECT con.conname
    FROM pg_constraint con
    WHERE con.conrelid = 'public.nexa_user_profile'::regclass
      AND con.contype = 'c'
      AND pg_get_constraintdef(con.oid) ILIKE '%category_type%'
  LOOP
    EXECUTE format('ALTER TABLE public.nexa_user_profile DROP CONSTRAINT %I', r.conname);
  END LOOP;

  -- Drop constraint on nexa_core_identity
  FOR r IN
    SELECT con.conname
    FROM pg_constraint con
    WHERE con.conrelid = 'public.nexa_core_identity'::regclass
      AND con.contype = 'c'
      AND pg_get_constraintdef(con.oid) ILIKE '%category_type%'
  LOOP
    EXECUTE format('ALTER TABLE public.nexa_core_identity DROP CONSTRAINT %I', r.conname);
  END LOOP;
END $$;

-- 2. New lifecycle columns on nexa_user_profile -----------------------
-- Menggunakan TEXT / VARCHAR(255) agar aman dari error string truncation
ALTER TABLE nexa_user_profile
  ADD COLUMN IF NOT EXISTS valid_days    INT,
  ADD COLUMN IF NOT EXISTS chapter       VARCHAR(50),
  ADD COLUMN IF NOT EXISTS end_event     TEXT,
  ADD COLUMN IF NOT EXISTS superseded_by BIGINT
      REFERENCES nexa_user_profile(id) ON DELETE SET NULL;

COMMENT ON COLUMN nexa_user_profile.valid_days    IS 'Estimasi hari fakta valid dari last_reinforced_at. NULL untuk CORE/PREFERENCE/untimed RULE.';
COMMENT ON COLUMN nexa_user_profile.chapter       IS 'Slug babak/fase hidup (misal: university, housing, career).';
COMMENT ON COLUMN nexa_user_profile.end_event     IS 'Peristiwa hidup yang membuat fakta ini berakhir / tidak lagi berlaku.';
COMMENT ON COLUMN nexa_user_profile.superseded_by IS 'ID fakta baru yang menggantikan baris ini (bi-temporal closed).';

-- 3. Rename PERMANENT_FACT -> CORE di kedua tabel ---------------------
UPDATE nexa_user_profile
SET    category_type = 'CORE'
WHERE  category_type = 'PERMANENT_FACT';

-- Di nexa_core_identity, migrasi PERMANENT_FACT dan legacy categories (misal: CAPABILITY)
UPDATE nexa_core_identity
SET    category_type = 'CORE'
WHERE  category_type IN ('PERMANENT_FACT', 'CAPABILITY');

-- Sanitasi fail-safe: pastikan semua baris di nexa_core_identity masuk dalam taksonomi resmi
UPDATE nexa_core_identity
SET    category_type = 'RULE'
WHERE  category_type NOT IN ('CORE', 'PHASE', 'PREFERENCE', 'RULE', 'EPHEMERAL');

-- 4. Koreksi Nyata: Fakta Semesteran & Domisili Kuliah -> PHASE --------
-- Fact 240: UTS Praktik Bahasa Arab Diplomasi (Semesteran)
UPDATE nexa_user_profile
SET    category_type = 'PHASE',
       valid_days    = 120,
       chapter       = 'university',
       end_event     = 'semester ends'
WHERE  id = 240;

-- Fact 272: Domisili Jogja saat kuliah / Banjarnegara saat liburan
UPDATE nexa_user_profile
SET    category_type = 'PHASE',
       valid_days    = 365,
       chapter       = 'university',
       end_event     = 'college graduation or housing move'
WHERE  id = 272;

-- 5. Pasang CHECK Constraints Baru ------------------------------------
ALTER TABLE nexa_user_profile DROP CONSTRAINT IF EXISTS nup_category_type_chk;
ALTER TABLE nexa_user_profile
  ADD CONSTRAINT nup_category_type_chk
  CHECK (category_type IN ('CORE','PHASE','PREFERENCE','RULE','EPHEMERAL'));

ALTER TABLE nexa_core_identity DROP CONSTRAINT IF EXISTS nci_category_type_chk;
ALTER TABLE nexa_core_identity
  ADD CONSTRAINT nci_category_type_chk
  CHECK (category_type IN ('CORE','PHASE','PREFERENCE','RULE','EPHEMERAL'));

ALTER TABLE nexa_user_profile DROP CONSTRAINT IF EXISTS nup_valid_days_chk;
ALTER TABLE nexa_user_profile
  ADD CONSTRAINT nup_valid_days_chk
  CHECK (valid_days IS NULL OR valid_days BETWEEN 1 AND 3650);

ALTER TABLE nexa_user_profile DROP CONSTRAINT IF EXISTS nup_no_self_supersede_chk;
ALTER TABLE nexa_user_profile
  ADD CONSTRAINT nup_no_self_supersede_chk
  CHECK (superseded_by IS NULL OR superseded_by <> id);

-- 6. Indexes untuk performa hygiene sweep & chapter query --------------
CREATE INDEX IF NOT EXISTS idx_nup_live_category
  ON nexa_user_profile (category_type)
  WHERE status <> 'ARCHIVED';

CREATE INDEX IF NOT EXISTS idx_nup_live_chapter
  ON nexa_user_profile (chapter)
  WHERE chapter IS NOT NULL AND status <> 'ARCHIVED';

COMMIT;
