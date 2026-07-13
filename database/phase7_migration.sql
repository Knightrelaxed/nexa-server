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

-- ============================================================
-- MILESTONE 2: Stated-vs-Revealed Reconciler + Decision Journal
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- TABEL 3: nexa_pending_intentions
-- Menyimpan intensi / niat yang diucapkan oleh Tuan Faqih dalam
-- percakapan sehari-hari (misalnya: "aku mau mulai olahraga tiap hari").
-- Setelah deadline_at terlewati, N.E.X.A mengirim gentle friction
-- ke Telegram untuk menanyakan perkembangan niat tersebut.
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "public"."nexa_pending_intentions" (
  "id"          BIGSERIAL PRIMARY KEY,
  "intention"   TEXT NOT NULL,                    -- Niat yang dideteksi (teks bersih)
  "source_text" TEXT,                             -- Teks asli pesan Tuan Faqih
  "status"      TEXT NOT NULL DEFAULT 'ACTIVE',   -- ACTIVE | FULFILLED | EXPIRED | CANCELLED
  "deadline_at" TIMESTAMPTZ NOT NULL,             -- Kapan N.E.X.A tanya ulang (14 hari default)
  "created_at"  TIMESTAMPTZ DEFAULT NOW()
);

-- Index untuk cron pass: cari intensi ACTIVE yang sudah melewati deadline
CREATE INDEX IF NOT EXISTS "idx_pending_intentions_deadline"
  ON "public"."nexa_pending_intentions" ("deadline_at" ASC)
  WHERE "status" = 'ACTIVE';

-- ────────────────────────────────────────────────────────────
-- TABEL 4: nexa_decision_journal
-- Merekam keputusan penting yang terdeteksi dari percakapan.
-- Setelah outcome_check_at tiba, N.E.X.A proaktif menanyakan
-- hasil keputusan tersebut untuk membangun feedback loop kualitas
-- keputusan Tuan Faqih dari waktu ke waktu.
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "public"."nexa_decision_journal" (
  "id"                BIGSERIAL PRIMARY KEY,
  "decision"          TEXT NOT NULL,                -- Ringkasan keputusan
  "context"           TEXT,                         -- Konteks situasi saat keputusan dibuat
  "emotional_state"   TEXT DEFAULT 'NEUTRAL',       -- STRESSED | NEUTRAL | CASUAL | EXCITED
  "decision_time"     TIMESTAMPTZ NOT NULL,         -- Waktu keputusan dibuat
  "intent_trigger"    TEXT,                         -- Intent yang memicu (FINANCE, DISCIPLINE, dll.)
  "outcome_check_at"  TIMESTAMPTZ NOT NULL,         -- Kapan N.E.X.A menanyakan hasilnya (30 hari)
  "outcome_result"    TEXT DEFAULT NULL,            -- Diisi setelah user menjawab outcome
  "outcome_received_at" TIMESTAMPTZ DEFAULT NULL,   -- Kapan outcome diisi
  "created_at"        TIMESTAMPTZ DEFAULT NOW()
);

-- Index untuk cron pass: cari keputusan yang belum ada outcome dan sudah waktunya ditanyakan
CREATE INDEX IF NOT EXISTS "idx_decision_journal_outcome_check"
  ON "public"."nexa_decision_journal" ("outcome_check_at" ASC)
  WHERE "outcome_result" IS NULL;

-- ────────────────────────────────────────────────────────────
-- VERIFIKASI M2: Cek tabel berhasil dibuat
-- ────────────────────────────────────────────────────────────
SELECT table_name, column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN ('nexa_pending_intentions', 'nexa_decision_journal')
ORDER BY table_name, ordinal_position;

-- ============================================================
-- MILESTONE 3: Emotional Time-Series Engine + Personality Version History
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- TABEL 5: nexa_identity_history
-- Mencatat setiap perubahan yang terjadi pada nexa_identity_model
-- saat Tuan Faqih menyetujui proposal. Digunakan untuk melacak
-- "kecepatan pergeseran kepribadian" dan menghasilkan narasi evolusi.
--
-- shift_velocity : (confidence_new - confidence_old) / days_since_last_reinforced
--                  Mengukur seberapa cepat perubahan terjadi (poin/hari).
-- shift_trigger  : Ringkasan konteks atau reasoning yang memicu perubahan.
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "public"."nexa_identity_history" (
  "id"               BIGSERIAL PRIMARY KEY,
  "layer"            TEXT NOT NULL,
  "trait_key"        TEXT NOT NULL,
  "trait_value_old"  TEXT,                        -- Nilai sebelum diubah (NULL jika trait baru)
  "trait_value_new"  TEXT NOT NULL,               -- Nilai baru setelah approval
  "confidence_old"   NUMERIC(4,2),               -- Confidence sebelum diubah
  "confidence_new"   NUMERIC(4,2),               -- Confidence setelah diubah
  "shift_velocity"   NUMERIC(6,4),               -- Kecepatan pergeseran (poin confidence/hari)
  "shift_trigger"    TEXT,                        -- Konteks / reasoning pemicu perubahan
  "approved_at"      TIMESTAMPTZ DEFAULT NOW()
);

-- Index untuk query riwayat per trait
CREATE INDEX IF NOT EXISTS "idx_identity_history_trait"
  ON "public"."nexa_identity_history" ("layer", "trait_key", "approved_at" DESC);

-- Index untuk query narasi evolusi terbaru
CREATE INDEX IF NOT EXISTS "idx_identity_history_approved_at"
  ON "public"."nexa_identity_history" ("approved_at" DESC);

-- ────────────────────────────────────────────────────────────
-- VERIFIKASI M3: Cek tabel berhasil dibuat
-- ────────────────────────────────────────────────────────────
SELECT table_name, column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'nexa_identity_history'
ORDER BY ordinal_position;
