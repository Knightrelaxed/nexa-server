-- ============================================================
-- N.E.X.A Phase 7 — Cognitive Evolution System: Database Migration
-- Milestone 1: Memory Decay Engine + Tiered Auto-Approval
-- ============================================================
-- Jalankan SQL ini di Supabase Dashboard > SQL Editor
-- URUTAN EKSEKUSI HARUS SESUAI: atas ke bawah
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- PERUBAHAN 1: Tambah kolom Memory Decay ke nexa_identity_model
--
-- last_reinforced_at : Kapan terakhir trait ini diperkuat oleh observasi baru.
--                      Diperbarui setiap kali proposal Tier 1 auto-approved atau
--                      user menekan tombol APPROVE.
-- decay_lambda       : Konstanta peluruhan per layer (λ dalam fungsi Ebbinghaus).
--                      Semakin tinggi nilai λ, semakin cepat trait pudar.
-- ────────────────────────────────────────────────────────────
ALTER TABLE "public"."nexa_identity_model"
  ADD COLUMN IF NOT EXISTS "last_reinforced_at" TIMESTAMPTZ DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS "decay_lambda"        NUMERIC(5,4) DEFAULT 0.020;

-- Nilai λ default per layer berdasarkan volatilitas psikologis
-- (diisi via UPDATE setelah kolom ditambahkan)
-- FACTS:         0.005  → Fakta objektif (tempat lahir, dll) sangat stabil
-- PREFERENCES:   0.015  → Preferensi berubah perlahan
-- HABITS:        0.040  → Kebiasaan paling volatile
-- VALUES:        0.008  → Nilai fundamental, sangat stabil
-- DECISION_STYLE:0.020  → Gaya keputusan berubah sedang
-- WEAKNESSES:    0.035  → Hambatan bisa diatasi seiring waktu
-- MOTIVATIONS:   0.025  → Motivasi naik-turun cukup cepat

UPDATE "public"."nexa_identity_model" SET "decay_lambda" = 0.005 WHERE "layer" = 'FACTS';
UPDATE "public"."nexa_identity_model" SET "decay_lambda" = 0.015 WHERE "layer" = 'PREFERENCES';
UPDATE "public"."nexa_identity_model" SET "decay_lambda" = 0.040 WHERE "layer" = 'HABITS';
UPDATE "public"."nexa_identity_model" SET "decay_lambda" = 0.008 WHERE "layer" = 'VALUES';
UPDATE "public"."nexa_identity_model" SET "decay_lambda" = 0.020 WHERE "layer" = 'DECISION_STYLE';
UPDATE "public"."nexa_identity_model" SET "decay_lambda" = 0.035 WHERE "layer" = 'WEAKNESSES';
UPDATE "public"."nexa_identity_model" SET "decay_lambda" = 0.025 WHERE "layer" = 'MOTIVATIONS';

-- ────────────────────────────────────────────────────────────
-- PERUBAHAN 2: Tambah kolom approval_tier ke nexa_identity_proposals
--
-- approval_tier  : Tier persetujuan yang diklasifikasikan saat proposal dibuat.
--                  1 = Auto-Approve (tidak perlu user action)
--                  2 = Soft-Approve (auto-approve setelah 48 jam)
--                  3 = Hard-Approve (wajib klik tombol secara eksplisit)
--
-- soft_approve_after : Timestamp batas waktu untuk Tier 2. Jika user tidak
--                      bereaksi sampai waktu ini, sistem auto-approve.
--                      NULL untuk Tier 1 dan Tier 3.
-- ────────────────────────────────────────────────────────────
ALTER TABLE "public"."nexa_identity_proposals"
  ADD COLUMN IF NOT EXISTS "approval_tier"       INT DEFAULT 3,
  ADD COLUMN IF NOT EXISTS "soft_approve_after"  TIMESTAMPTZ DEFAULT NULL;

-- ────────────────────────────────────────────────────────────
-- PERUBAHAN 3: Index baru untuk performa query Decay & Tier 2
-- ────────────────────────────────────────────────────────────

-- Untuk Daily Decay Pass: menemukan trait yang perlu di-decay
CREATE INDEX IF NOT EXISTS "idx_identity_model_last_reinforced"
  ON "public"."nexa_identity_model" ("last_reinforced_at" ASC);

-- Untuk Tier 2 auto-approve cron: menemukan proposal yang sudah melewati batas waktu
CREATE INDEX IF NOT EXISTS "idx_identity_proposals_soft_approve"
  ON "public"."nexa_identity_proposals" ("soft_approve_after" ASC)
  WHERE "status" = 'PENDING' AND "approval_tier" = 2;

-- ────────────────────────────────────────────────────────────
-- VERIFIKASI: Cek kolom berhasil ditambahkan
-- ────────────────────────────────────────────────────────────
SELECT
  column_name,
  data_type,
  column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN ('nexa_identity_model', 'nexa_identity_proposals')
  AND column_name IN ('last_reinforced_at', 'decay_lambda', 'approval_tier', 'soft_approve_after')
ORDER BY table_name, column_name;
