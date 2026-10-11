-- =====================================================================
-- N.E.X.A v3.3.1 - persisted poison-pill attempts for the Micro-Reviewer
-- Safe to re-run. Code falls back to in-memory counting if this is not applied.
-- =====================================================================
ALTER TABLE nexa_learning_events
  ADD COLUMN IF NOT EXISTS attempts INT NOT NULL DEFAULT 0;

-- One-off cleanup (review first, then run manually): rows written by tests that ran
-- with production credentials before this fix.
-- SELECT id, created_at, event_type, intent FROM nexa_learning_events WHERE session_key LIKE 'test:%';
-- DELETE FROM nexa_learning_events WHERE session_key LIKE 'test:%';
