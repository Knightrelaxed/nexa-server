-- ============================================================
-- N.E.X.A — APP USAGE & DURATION LIMITS MIGRATION
-- Table: nexa_app_limits
-- Platform: Android 16 (Samsung Galaxy A33 5G) Mobile Bridge
-- ============================================================

CREATE TABLE IF NOT EXISTS "public"."nexa_app_limits" (
  "id"                      BIGSERIAL PRIMARY KEY,
  "package_name"            TEXT UNIQUE NOT NULL,
  "app_label"               TEXT NOT NULL,
  "max_session_minutes"     INT NOT NULL DEFAULT 30,  -- Batas per satu sesi aktif
  "max_daily_minutes"       INT NOT NULL DEFAULT 90,  -- Batas total akumulasi per hari
  "warning_threshold_pct"   INT NOT NULL DEFAULT 80,  -- Persentase pemicu peringatan dini (80%)
  "escalation_level"        INT NOT NULL DEFAULT 2,   -- Level penegakan saat pelanggaran (1-4)
  "is_active"               BOOLEAN NOT NULL DEFAULT TRUE,
  "created_at"              TIMESTAMPTZ DEFAULT NOW(),
  "updated_at"              TIMESTAMPTZ DEFAULT NOW()
);

-- Seed default entertainment and social media applications
INSERT INTO "public"."nexa_app_limits" ("package_name", "app_label", "max_session_minutes", "max_daily_minutes", "escalation_level")
VALUES
  ('com.google.android.youtube', 'YouTube', 30, 90, 2),
  ('com.instagram.android', 'Instagram', 20, 60, 2),
  ('com.zhiliaoapp.musically', 'TikTok', 15, 45, 3),
  ('com.twitter.android', 'X (Twitter)', 20, 60, 2),
  ('com.facebook.katana', 'Facebook', 20, 45, 2),
  ('com.netflix.mediaclient', 'Netflix', 45, 120, 2)
ON CONFLICT ("package_name") DO NOTHING;
