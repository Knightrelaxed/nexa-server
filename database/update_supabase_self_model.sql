

-- 1. Buat tabel utama
CREATE TABLE IF NOT EXISTS nexa_self_model (
  id            BIGSERIAL PRIMARY KEY,
  layer         TEXT NOT NULL CHECK (layer IN ('CAPABILITIES','LIMITATIONS','OPERATIONAL_RULES','CORRECTIONS','COMMUNICATION_STYLE')),
  trait_key     TEXT NOT NULL UNIQUE,  -- Kunci unik per fakta, untuk upsert/revisi otomatis
  trait_value   TEXT NOT NULL,
  confidence    NUMERIC(4,2) DEFAULT 0.85 CHECK (confidence >= 0 AND confidence <= 1),
  source        TEXT DEFAULT 'PASSIVE_LEARNING' CHECK (source IN ('PASSIVE_LEARNING','WEEKLY_REFLECTION','MANUAL')),
  inferred_from TEXT,                  -- Kutipan/kalimat asli dari obrolan yang memicu pembelajaran ini
  updated_at    TIMESTAMPTZ DEFAULT now(),
  created_at    TIMESTAMPTZ DEFAULT now()
);

-- 2. Index untuk query efisien
CREATE INDEX IF NOT EXISTS idx_nexa_self_model_layer   ON nexa_self_model (layer);
CREATE INDEX IF NOT EXISTS idx_nexa_self_model_updated ON nexa_self_model (updated_at DESC);

-- 3. Trigger: auto-update kolom updated_at saat baris direvisi
CREATE OR REPLACE FUNCTION update_nexa_self_model_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_nexa_self_model_updated_at ON nexa_self_model;
CREATE TRIGGER trg_nexa_self_model_updated_at
  BEFORE UPDATE ON nexa_self_model
  FOR EACH ROW
  EXECUTE FUNCTION update_nexa_self_model_timestamp();

-- 4. (Opsional) Seed awal — fakta dasar yang sudah diketahui tentang N.E.X.A
-- Uncomment baris di bawah jika ingin mengisi data awal:
-- INSERT INTO nexa_self_model (layer, trait_key, trait_value, source, inferred_from) VALUES
--   ('CAPABILITIES', 'finance_auto_sync', 'N.E.X.A mampu menyinkronisasi mutasi keuangan secara otomatis dari email Livin Mandiri', 'MANUAL', 'System Seed'),
--   ('CAPABILITIES', 'cognitive_weekly_pass', 'N.E.X.A menjalankan Weekly Cognitive Pass setiap Minggu malam untuk memperbarui pemahaman tentang Tuan Faqih', 'MANUAL', 'System Seed'),
--   ('LIMITATIONS', 'context_window_limit', 'N.E.X.A memiliki batas memori percakapan; konteks yang sangat panjang (>50 pesan) dapat terpotong', 'MANUAL', 'System Seed')
-- ON CONFLICT (trait_key) DO NOTHING;

-- ============================================================
-- SELESAI — Jalankan SELECT * FROM nexa_self_model; untuk verifikasi.
-- ============================================================
