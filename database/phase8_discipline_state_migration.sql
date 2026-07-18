-- ============================================================
-- N.E.X.A — PHASE 8 MIGRATION: DISCIPLINE STATE & ESCALATION ENGINE
-- ============================================================
-- Creates nexa_discipline_state table to track stateful progressive
-- enforcement sessions (session_key = "{app_name}:{YYYY-MM-DD}").
-- ============================================================

CREATE TABLE IF NOT EXISTS nexa_discipline_state (
  session_key         TEXT PRIMARY KEY,        -- "{app_name}:{YYYY-MM-DD}"
  app_name            TEXT NOT NULL,
  current_level       INTEGER DEFAULT 0,
  violation_count     INTEGER DEFAULT 0,
  
  -- Feedback loop state (Telegram Inline Keyboard)
  pending_callback    BOOLEAN DEFAULT FALSE,
  callback_expires_at TIMESTAMPTZ,
  callback_message_id TEXT,                    -- Telegram message_id untuk diedit
  ten_min_used_count  INTEGER DEFAULT 0,
  
  -- Dynamic profile (dari Behavior Engine)
  mood_baseline       INTEGER DEFAULT 1,
  max_level_cap       INTEGER DEFAULT 4,
  message_tone        TEXT DEFAULT 'firm',     -- 'gentle' | 'firm' | 'urgent'
  
  first_triggered_at  TIMESTAMPTZ DEFAULT NOW(),
  last_triggered_at   TIMESTAMPTZ,
  expires_at          TIMESTAMPTZ NOT NULL,    -- TTL: akhir hari (23:59:59)
  
  created_at          TIMESTAMPTZ DEFAULT NOW()
);

-- Index untuk cron job query (expired callbacks check)
CREATE INDEX IF NOT EXISTS idx_discipline_pending 
  ON nexa_discipline_state(pending_callback, callback_expires_at) 
  WHERE pending_callback = TRUE;
