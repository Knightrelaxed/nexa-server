-- =====================================================================
-- N.E.X.A upgrade migration: Notifier & Recurring Intelligence
-- All tables enable RLS with NO policies: only the service_role key
-- (the N.E.X.A server) can read or write them. The anon key sees nothing.
-- =====================================================================

-- 1) Notification gateway ----------------------------------------------
CREATE TABLE IF NOT EXISTS nexa_notifications (
  id          BIGSERIAL PRIMARY KEY,
  kind        TEXT NOT NULL,
  priority    TEXT NOT NULL CHECK (priority IN ('P0','P1','P2')),
  dedupe_key  TEXT,
  text        TEXT NOT NULL,
  status      TEXT NOT NULL CHECK (status IN ('SENT','QUEUED_DIGEST','QUEUED_DEFERRED','DIGESTED','DROPPED','FAILED')),
  reason      TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_at     TIMESTAMPTZ,
  expires_at  TIMESTAMPTZ,
  engaged_at  TIMESTAMPTZ,
  engagement  TEXT
);
CREATE INDEX IF NOT EXISTS idx_notif_status_created ON nexa_notifications (status, created_at);
CREATE INDEX IF NOT EXISTS idx_notif_dedupe ON nexa_notifications (dedupe_key, sent_at DESC) WHERE dedupe_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_notif_sent ON nexa_notifications (sent_at DESC) WHERE status = 'SENT';
ALTER TABLE nexa_notifications ENABLE ROW LEVEL SECURITY;

-- 2) Recurring rules -----------------------------------------------------
CREATE TABLE IF NOT EXISTS nexa_recurring_rules (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_key   TEXT NOT NULL,
  display_name   TEXT,
  cadence        TEXT NOT NULL CHECK (cadence IN ('WEEKLY','BIWEEKLY','MONTHLY','QUARTERLY','YEARLY')),
  amount_median  NUMERIC(14,0) NOT NULL,
  next_expected  TIMESTAMPTZ,
  last_seen      TIMESTAMPTZ,
  occurrences    INT,
  confidence     NUMERIC(3,2),
  status         TEXT NOT NULL DEFAULT 'CANDIDATE' CHECK (status IN ('CANDIDATE','ACTIVE','REJECTED','ENDED')),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (merchant_key, cadence)
);
ALTER TABLE nexa_recurring_rules ENABLE ROW LEVEL SECURITY;

-- 3) Cron job ledger (idempotency, catch-up on boot, dead-man alerts) ----
CREATE TABLE IF NOT EXISTS nexa_job_runs (
  id           BIGSERIAL PRIMARY KEY,
  job_name     TEXT NOT NULL,
  run_key      TEXT NOT NULL,            -- e.g. '2026-10-12' or '2026-W41'
  status       TEXT NOT NULL CHECK (status IN ('RUNNING','OK','FAILED')),
  started_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at  TIMESTAMPTZ,
  error        TEXT,
  UNIQUE (job_name, run_key)             -- claim-then-run: a second insert fails = already done
);
ALTER TABLE nexa_job_runs ENABLE ROW LEVEL SECURITY;

-- 4) LLM call ledger (measure before optimizing routing) ------------------
CREATE TABLE IF NOT EXISTS nexa_llm_calls (
  id            BIGSERIAL PRIMARY KEY,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  task          TEXT,                    -- 'route','categorize','synthesis','reflection',...
  tier          TEXT,
  tokens_in     INT,
  tokens_out    INT,
  latency_ms    INT,
  ok            BOOLEAN,
  validation_ok BOOLEAN,
  error_class   TEXT
);
CREATE INDEX IF NOT EXISTS idx_llm_calls_created ON nexa_llm_calls (created_at DESC);
ALTER TABLE nexa_llm_calls ENABLE ROW LEVEL SECURITY;
