-- =====================================================================
-- N.E.X.A v3.3.2 - directives through the proposal flow + atomic playbook counters
-- Safe to re-run. Apply BEFORE (or together with) deploying v3.3.2. The code degrades gracefully
-- if it is not applied yet (proposals are stored without directive; counters use a read-modify-write fallback).
-- =====================================================================

-- 1) Weekly inference proposals can now carry the directive until approval
ALTER TABLE nexa_identity_proposals
  ADD COLUMN IF NOT EXISTS directive TEXT CHECK (char_length(directive) <= 160);

-- 2) Playbook counters (columns exist from v3.3; last_used_at added defensively)
ALTER TABLE nexa_playbooks ADD COLUMN IF NOT EXISTS last_used_at TIMESTAMPTZ;

CREATE OR REPLACE FUNCTION nexa_bump_playbook_counters(
  p_intent TEXT, p_version INT, p_use INT DEFAULT 0, p_correction INT DEFAULT 0
) RETURNS VOID
LANGUAGE sql SECURITY INVOKER AS $$
  UPDATE nexa_playbooks
     SET use_count        = use_count + GREATEST(p_use, 0),
         correction_count = correction_count + GREATEST(p_correction, 0),
         last_used_at     = CASE WHEN p_use > 0 THEN now() ELSE last_used_at END
   WHERE intent = p_intent AND version = p_version;
$$;

-- Supabase grants EXECUTE on new functions to anon/authenticated by default. Lock it down:
REVOKE ALL ON FUNCTION nexa_bump_playbook_counters(TEXT, INT, INT, INT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION nexa_bump_playbook_counters(TEXT, INT, INT, INT) TO service_role;
