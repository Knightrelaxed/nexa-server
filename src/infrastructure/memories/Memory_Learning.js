/**
 * ============================================================
 * [N.E.X.A] memories/Memory_Learning.js
 * Closed learning loop: event pembelajaran, playbook, micro-reviewer
 *
 * Bagian dari modularisasi Supabase_Memories.js (facade: ../Supabase_Memories.js).
 * Kode dipindahkan verbatim oleh scripts/refactor/split_supabase_memories.js;
 * satu-satunya perubahan adalah jalur require relatif (+1 level).
 * ============================================================
 */

const { supabase } = require('./Memory_Client');

// ── [PHASE 13 / v3.3] Closed Learning Loop & Playbooks ─────────────
async function recordLearningEvent(eventPayload) {
  if (!supabase) return { success: false, error: 'Supabase tidak terhubung.' };
  try {
    const { data, error } = await supabase
      .from('nexa_learning_events')
      .insert([eventPayload])
      .select();
    if (error) {
      console.warn('[SUPABASE] Error recording learning event:', error.message);
      return { success: false, error: error.message };
    }
    return { success: true, data: data?.[0] };
  } catch (err) {
    console.warn('[SUPABASE] Failed to record learning event:', err.message);
    return { success: false, error: err.message };
  }
}

async function getUnprocessedLearningEvents(limit = 20) {
  if (!supabase) return [];
  try {
    const { data, error } = await supabase
      .from('nexa_learning_events')
      .select('*')
      .is('processed_at', null)
      .order('created_at', { ascending: true })
      .limit(limit);
    if (error) {
      console.warn('[SUPABASE] Error fetching unprocessed learning events:', error.message);
      return [];
    }
    return data || [];
  } catch (err) {
    return [];
  }
}

async function markLearningEventsProcessed(eventIds = []) {
  if (!supabase || !eventIds.length) return false;
  try {
    const { error } = await supabase
      .from('nexa_learning_events')
      .update({ processed_at: new Date().toISOString() })
      .in('id', eventIds);
    if (error) {
      console.warn('[SUPABASE] Error marking events processed:', error.message);
      return false;
    }
    return true;
  } catch (err) {
    return false;
  }
}

async function getActivePlaybook(intent) {
  if (!supabase || !intent) return null;
  try {
    const { data, error } = await supabase
      .from('nexa_playbooks')
      .select('*')
      .eq('intent', intent.toUpperCase())
      .eq('status', 'ACTIVE')
      .maybeSingle();
    if (error) {
      console.warn('[SUPABASE] Error fetching active playbook:', error.message);
      return null;
    }
    return data || null;
  } catch (err) {
    return null;
  }
}

async function getAllActivePlaybooks() {
  if (!supabase) return [];
  try {
    const { data, error } = await supabase
      .from('nexa_playbooks')
      .select('*')
      .eq('status', 'ACTIVE')
      .order('intent', { ascending: true });
    if (error) return [];
    return data || [];
  } catch (err) {
    return [];
  }
}

async function upsertPlaybook(playbook, createNewVersion = false) {
  if (!supabase || !playbook || !playbook.intent || !playbook.rendered) {
    return { success: false, error: 'Intent and rendered content are required.' };
  }
  try {
    const intentUpper = String(playbook.intent).toUpperCase().trim();
    const existing = await getActivePlaybook(intentUpper);

    const payload = {
      intent: intentUpper,
      version: playbook.version || (existing ? existing.version : 1),
      status: 'ACTIVE',
      rules: playbook.rules || (existing ? existing.rules : {}),
      rendered: String(playbook.rendered).slice(0, 700), // Enforce hard cap <= 700
      pinned: playbook.pinned !== undefined ? Boolean(playbook.pinned) : (existing ? existing.pinned : false),
      updated_at: new Date().toISOString()
    };
    if (playbook.evidence_event_ids) payload.evidence_event_ids = playbook.evidence_event_ids;

    if (existing) {
      if (existing.pinned && playbook.isReviewer) {
        return { success: false, error: 'Playbook is pinned by user and cannot be altered by automated reviewer.' };
      }

      if (createNewVersion) {
        payload.version = (existing.version || 1) + 1;
        payload.parent_id = existing.id;

        // Archive existing version first to satisfy partial unique index
        const { error: archErr } = await supabase
          .from('nexa_playbooks')
          .update({ status: 'ARCHIVED', updated_at: new Date().toISOString() })
          .eq('id', existing.id);
        if (archErr) return { success: false, error: archErr.message };

        // Insert new active version
        const { data, error } = await supabase.from('nexa_playbooks').insert([payload]).select();
        if (error) {
          // If insert fails, immediately rollback previous version to ACTIVE so no intent is left unserved
          await supabase
            .from('nexa_playbooks')
            .update({ status: 'ACTIVE', updated_at: new Date().toISOString() })
            .eq('id', existing.id);
          return { success: false, error: error.message };
        }

        return { success: true, data: data?.[0] };
      } else {
        // Update active version in-place
        const { data, error } = await supabase
          .from('nexa_playbooks')
          .update(payload)
          .eq('id', existing.id)
          .select();
        if (error) return { success: false, error: error.message };
        return { success: true, data: data?.[0] };
      }
    } else {
      // First time insert for this intent
      const { data, error } = await supabase.from('nexa_playbooks').insert([payload]).select();
      if (error) return { success: false, error: error.message };
      return { success: true, data: data?.[0] };
    }
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/**
 * [v3.3.1] Persist poison-pill attempts on the event row so a restart cannot reset the counter.
 * Returns { [eventId]: attempts } or null when the column/table is unavailable (caller falls back).
 */
async function incrementLearningEventAttempts(eventIds = []) {
  if (!supabase || !eventIds.length) return null;
  try {
    const { data, error } = await supabase
      .from('nexa_learning_events').select('id, attempts').in('id', eventIds);
    if (error) return null;
    const out = {};
    for (const row of data || []) {
      const next = (row.attempts || 0) + 1;
      const { error: upErr } = await supabase
        .from('nexa_learning_events').update({ attempts: next }).eq('id', row.id);
      if (upErr) return null;
      out[row.id] = next;
    }
    return out;
  } catch (_) {
    return null;
  }
}

/** [v3.3.1] Persisted count of micro-review runs for a WIB date key (null if unavailable). */
async function countMicroReviewRunsToday(dateKey) {
  if (!supabase) return null;
  try {
    const { count, error } = await supabase
      .from('nexa_job_runs')
      .select('id', { count: 'exact', head: true })
      .eq('job_name', 'micro_review')
      .like('run_key', `${dateKey}:%`);
    if (error) return null;
    return count || 0;
  } catch (_) {
    return null;
  }
}

/** [v3.3.1] Record one micro-review run so the daily cap survives restarts. */
async function recordMicroReviewRun(dateKey) {
  if (!supabase) return false;
  try {
    const { error } = await supabase.from('nexa_job_runs').insert({
      job_name: 'micro_review',
      run_key: `${dateKey}:${Date.now()}`,
      status: 'OK',
      finished_at: new Date().toISOString()
    });
    return !error;
  } catch (_) {
    return false;
  }
}

/**
 * [v3.3.2] Atomically bump a playbook version's counters. Uses the nexa_bump_playbook_counters RPC and falls
 * back to a read-modify-write when the migration has not been applied yet. Never throws.
 */
async function bumpPlaybookCounters({ intent, version, use = 0, correction = 0 } = {}) {
  if (!supabase || !intent || !(use || correction)) return false;
  try {
    const intentUpper = String(intent).toUpperCase().trim();
    const v = Number(version) || 1;
    const { error } = await supabase.rpc('nexa_bump_playbook_counters', {
      p_intent: intentUpper, p_version: v, p_use: use, p_correction: correction
    });
    if (!error) return true;
    const { data } = await supabase.from('nexa_playbooks')
      .select('id, use_count, correction_count').eq('intent', intentUpper).eq('version', v).limit(1);
    const row = data && data[0];
    if (!row) return false;
    const patch = {
      use_count: (row.use_count || 0) + use,
      correction_count: (row.correction_count || 0) + correction
    };
    if (use) patch.last_used_at = new Date().toISOString();
    const { error: upErr } = await supabase.from('nexa_playbooks').update(patch).eq('id', row.id);
    return !upErr;
  } catch (_) {
    return false;
  }
}

module.exports = {
  recordLearningEvent,
  getUnprocessedLearningEvents,
  markLearningEventsProcessed,
  getActivePlaybook,
  getAllActivePlaybooks,
  upsertPlaybook,
  incrementLearningEventAttempts,
  countMicroReviewRunsToday,
  recordMicroReviewRun,
  bumpPlaybookCounters
};
