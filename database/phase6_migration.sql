-- ============================================================
-- N.E.X.A Phase 6: Human Cognitive Model — Database Migration
-- Jalankan SQL ini di Supabase Dashboard > SQL Editor
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- TABEL 1: nexa_identity_model
-- Menyimpan model identitas Tuan Faqih yang sudah TERKONFIRMASI.
-- Setiap baris adalah satu "fakta kognitif" tentang pengguna
-- yang sudah disetujui (APPROVE) oleh Tuan Faqih sendiri.
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS nexa_identity_model (
  id          BIGSERIAL PRIMARY KEY,

  -- Salah satu dari 7 Layer: FACTS | PREFERENCES | HABITS |
  -- VALUES | DECISION_STYLE | WEAKNESSES | MOTIVATIONS
  layer       TEXT NOT NULL,

  -- Nama kunci unik untuk trait ini (snake_case)
  -- Contoh: 'work_pattern', 'meal_skipping', 'preferred_format'
  trait_key   TEXT NOT NULL,

  -- Nilai dari trait tersebut
  -- Contoh: 'Night Owl (22:00-02:00)', 'bullet_points'
  trait_value TEXT NOT NULL,

  -- Skor keyakinan AI saat hipotesis ini dikonfirmasi (0.00 - 1.00)
  confidence  NUMERIC(4,2) DEFAULT 0.90,

  -- Ringkasan observasi mentah yang menjadi dasar hipotesis ini
  inferred_from_summary TEXT,

  updated_at  TIMESTAMPTZ DEFAULT NOW(),

  -- Kombinasi layer + trait_key harus unik (satu fakta per layer per kunci)
  UNIQUE(layer, trait_key)
);

-- ────────────────────────────────────────────────────────────
-- TABEL 2: nexa_identity_proposals
-- Menyimpan hipotesis BARU atau REVISI identitas yang sedang
-- menunggu persetujuan (PENDING) dari Tuan Faqih via Telegram.
-- N.E.X.A dilarang memindahkan proposal ke nexa_identity_model
-- tanpa status = 'APPROVED'.
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS nexa_identity_proposals (
  id              BIGSERIAL PRIMARY KEY,

  layer           TEXT NOT NULL,
  trait_key       TEXT NOT NULL,
  proposed_value  TEXT NOT NULL,

  -- Diisi jika ini adalah proposal REVISI (ada nilai lama yang akan diganti).
  -- NULL jika ini adalah hipotesis BARU.
  old_value       TEXT DEFAULT NULL,

  -- Skor keyakinan AI untuk proposal ini (0.00 - 1.00)
  confidence      NUMERIC(4,2) NOT NULL,

  -- Penjelasan detail AI mengapa mengajukan proposal ini
  -- (observasi apa saja yang menjadi buktinya)
  reasoning       TEXT NOT NULL,

  -- Alur status: PENDING → APPROVED atau REJECTED
  -- PENDING  : Sudah dikirim ke Telegram, menunggu balasan Tuan Faqih
  -- APPROVED : Tuan Faqih klik Approve. Data dipindah ke nexa_identity_model.
  -- REJECTED : Tuan Faqih klik Reject. Data disimpan sebagai catatan pembelajaran.
  -- STAGED   : Confidence 60-85%. Disimpan dulu, belum dikirim ke Telegram.
  status          TEXT NOT NULL DEFAULT 'STAGED',

  -- ID pesan Telegram yang dikirimkan (untuk edit/update pesan setelah Approve/Reject)
  telegram_message_id BIGINT DEFAULT NULL,

  -- Alasan penolakan dari Tuan Faqih (diisi jika REJECTED dan user membalas alasannya)
  rejection_reason TEXT DEFAULT NULL,

  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ────────────────────────────────────────────────────────────
-- INDEX untuk performa query yang sering dipakai
-- ────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_identity_model_layer
  ON nexa_identity_model(layer);

CREATE INDEX IF NOT EXISTS idx_identity_proposals_status
  ON nexa_identity_proposals(status);

-- Optimasi query mingguan (7 hari terakhir) oleh Inference Engine pada tabel nexa_behavior_log
CREATE INDEX IF NOT EXISTS idx_behavior_log_created_event
  ON nexa_behavior_log(created_at DESC, event_type);

-- ────────────────────────────────────────────────────────────
-- FUNGSI OTOMATIS: Update kolom updated_at saat ada perubahan
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_identity_model_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER trigger_identity_model_updated_at
  BEFORE UPDATE ON nexa_identity_model
  FOR EACH ROW EXECUTE FUNCTION update_identity_model_timestamp();

-- ────────────────────────────────────────────────────────────
-- CLEAN SLATE PHASE 6: Pembersihan nexa_behavior_log
-- Membersihkan log testing lama (Mei dsb) agar Mesin Inferensi
-- Kognitif Phase 6 memulai observasi perilaku dari lembaran bersih.
-- Catatan: Data transaksi utama tetap aman di tabel "transactions".
-- ────────────────────────────────────────────────────────────
TRUNCATE TABLE nexa_behavior_log;
