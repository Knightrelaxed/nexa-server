-- =====================================================================
-- N.E.X.A v3.3: Closed Learning Loop & Dialectic Architecture Migration
-- Safe to re-run. RLS enabled: service_role has full access.
-- =====================================================================

-- 1) Learning events: cheap, LLM-free signals captured every turn ------
CREATE TABLE IF NOT EXISTS nexa_learning_events (
  id               BIGSERIAL PRIMARY KEY,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  session_key      TEXT NOT NULL,        -- conversation episode, e.g. '2026-10-11:tg:1'
  event_type       TEXT NOT NULL CHECK (event_type IN (
                     'CORRECTION',       -- "terlalu panjang", "jangan pakai bullet"
                     'REPHRASE',         -- user re-asks the same thing differently
                     'ACCEPT',           -- thanks / suggestion executed
                     'OVERRIDE',         -- user rejects an action or suggestion
                     'IGNORED',          -- proactive message with no engagement
                     'EXPLICIT_REMEMBER',-- "ingat ini"
                     'OVER_CITATION')),  -- reply quoted an injected private trait verbatim
  intent           TEXT,                 -- router intent on that turn
  topic            TEXT,
  signal           JSONB NOT NULL DEFAULT '{}',        -- {"dimension":"length","direction":"shorter"}
  injected_refs    JSONB NOT NULL DEFAULT '{}',        -- {"playbook":"EMAIL_DRAFT@1","traits":["HABITS/sleep"]}
  user_turn_excerpt TEXT CHECK (char_length(user_turn_excerpt) <= 300),  -- user-authored text only
  processed_at     TIMESTAMPTZ           -- set when a reviewer consumed the event
);

CREATE INDEX IF NOT EXISTS idx_learning_events_unprocessed
  ON nexa_learning_events (created_at) WHERE processed_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_learning_events_intent
  ON nexa_learning_events (intent, event_type, created_at DESC);

ALTER TABLE nexa_learning_events ENABLE ROW LEVEL SECURITY;

-- Service role bypass policy for nexa_learning_events
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'nexa_learning_events' AND policyname = 'service_role_all_learning_events'
  ) THEN
    CREATE POLICY service_role_all_learning_events ON nexa_learning_events FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;


-- 2) Playbooks: procedural memory, one ACTIVE playbook per intent class --
CREATE TABLE IF NOT EXISTS nexa_playbooks (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  intent             TEXT NOT NULL,      -- BRIEFING_MORNING, EMAIL_DRAFT, FINANCE_REPLY, ...
  version            INT  NOT NULL DEFAULT 1,
  status             TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','PROPOSED','ARCHIVED')),
  rules              JSONB NOT NULL,     -- {"length":"short","format":[...],"tone":[...],"pitfalls":[...]}
  rendered           TEXT NOT NULL,      -- prompt-ready text, hard-capped
  evidence_event_ids BIGINT[] NOT NULL DEFAULT '{}',
  parent_id          UUID REFERENCES nexa_playbooks(id),
  use_count          INT NOT NULL DEFAULT 0,
  correction_count   INT NOT NULL DEFAULT 0,    -- corrections received while this version was active
  last_used_at       TIMESTAMPTZ,
  pinned             BOOLEAN NOT NULL DEFAULT false,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT playbook_rendered_len CHECK (char_length(rendered) <= 700)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_playbook_active_intent
  ON nexa_playbooks (intent) WHERE status = 'ACTIVE';

ALTER TABLE nexa_playbooks ENABLE ROW LEVEL SECURITY;

-- Service role bypass policy for nexa_playbooks
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'nexa_playbooks' AND policyname = 'service_role_all_playbooks'
  ) THEN
    CREATE POLICY service_role_all_playbooks ON nexa_playbooks FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;


-- 3) Identity model: add the operational translation of each trait -------
ALTER TABLE nexa_identity_model
  ADD COLUMN IF NOT EXISTS directive    TEXT CHECK (char_length(directive) <= 160),
  ADD COLUMN IF NOT EXISTS scope        TEXT NOT NULL DEFAULT 'global',   -- 'global' | 'intent:EMAIL_DRAFT'
  ADD COLUMN IF NOT EXISTS sensitivity  TEXT NOT NULL DEFAULT 'normal',   -- 'normal' | 'private' (never voiced)
  ADD COLUMN IF NOT EXISTS evidence_count INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS use_count    INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_used_at TIMESTAMPTZ;


-- 4) Raw conversation recall (full-text, no LLM) ---------------------------
CREATE EXTENSION IF NOT EXISTS pg_trgm;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'nexa_chat_memories' AND column_name = 'fts'
  ) THEN
    ALTER TABLE nexa_chat_memories
      ADD COLUMN fts tsvector
      GENERATED ALWAYS AS (to_tsvector('simple', coalesce(content, ''))) STORED;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_chat_memories_fts ON nexa_chat_memories USING GIN (fts);
