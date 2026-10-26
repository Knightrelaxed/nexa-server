'use strict';
/**
 * finance_db/recurring.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Subscription and Recurring Expense Rules in Supabase Nexa Finance
 * 
 * Tanggung jawab:
 * 1. VALID_RECURRING_STATUSES: Daftar status sah (CANDIDATE, ACTIVE, REJECTED, ENDED)
 * 2. getRecurringRules(): Ambil aturan langganan berulang (opsional filter status)
 * 3. upsertRecurringRules(): Simpan deteksi langganan baru tanpa menimpa status eksisting
 * 4. updateRecurringRuleStatus(): Ubah status aturan (misal dari inline keyboard Telegram)
 * ─────────────────────────────────────────────────────────────────────────────
 */

const { supabaseFinance } = require('./client');

const VALID_RECURRING_STATUSES = ['CANDIDATE', 'ACTIVE', 'REJECTED', 'ENDED'];

/**
 * Ambil daftar aturan langganan berulang (nexa_recurring_rules)
 */
async function getRecurringRules(statusFilter = null) {
  if (!supabaseFinance) return [];
  try {
    let query = supabaseFinance
      .from('nexa_recurring_rules')
      .select('*')
      .order('confidence', { ascending: false });
    if (statusFilter) {
      query = query.eq('status', statusFilter);
    }
    const { data, error } = await query;
    if (error) {
      console.warn('[SUPABASE_FINANCE] getRecurringRules error:', error.message);
      return [];
    }
    return data || [];
  } catch (err) {
    console.warn('[SUPABASE_FINANCE] getRecurringRules exception:', err.message);
    return [];
  }
}

/**
 * Upsert kandidat atau aturan langganan berulang ke nexa_recurring_rules.
 * Mempertahankan status eksisting (ACTIVE, REJECTED, ENDED) agar tidak tertimpa deteksi otomatis.
 */
async function upsertRecurringRules(rules = []) {
  if (!supabaseFinance || !rules || rules.length === 0) return { upserted: 0, candidates: [] };
  try {
    // 1. Ambil aturan yang sudah ada agar keputusan user tidak tertimpa
    const existingRules = await getRecurringRules();
    const existingMap = new Map();
    for (const ex of existingRules) {
      existingMap.set(`${ex.merchant_key}:${ex.cadence}`, ex);
    }

    const newCandidateKeys = new Set();
    const rows = rules.map(r => {
      const existing = existingMap.get(`${r.merchantKey}:${r.cadence}`);
      let status;
      if (existing) {
        // Pertahankan status yang sudah ada (misal REJECTED, ACTIVE, ENDED)
        status = existing.status;
      } else {
        status = r.confidence >= 0.85 ? 'ACTIVE' : 'CANDIDATE';
        if (status === 'CANDIDATE') {
          newCandidateKeys.add(`${r.merchantKey}:${r.cadence}`);
        }
      }

      return {
        merchant_key: r.merchantKey,
        display_name: existing?.display_name || r.displayName || r.merchantKey,
        cadence: r.cadence,
        amount_median: r.amountMedian,
        next_expected: r.nextExpected,
        last_seen: r.lastSeen,
        occurrences: r.occurrences,
        confidence: r.confidence,
        status,
        updated_at: new Date().toISOString()
      };
    });

    const { data, error } = await supabaseFinance
      .from('nexa_recurring_rules')
      .upsert(rows, { onConflict: 'merchant_key,cadence' })
      .select('id, merchant_key, display_name, cadence, amount_median, status');

    if (error) {
      console.warn('[SUPABASE_FINANCE] upsertRecurringRules error:', error.message);
      return { upserted: 0, candidates: [], error: error.message };
    }

    const candidates = (data || []).filter(row =>
      row.status === 'CANDIDATE' && newCandidateKeys.has(`${row.merchant_key}:${row.cadence}`)
    );

    return { upserted: (data || []).length, candidates };
  } catch (err) {
    console.warn('[SUPABASE_FINANCE] upsertRecurringRules exception:', err.message);
    return { upserted: 0, candidates: [], error: err.message };
  }
}

/**
 * Update status aturan langganan (ACTIVE, REJECTED, ENDED) dari tombol interaktif
 */
async function updateRecurringRuleStatus(ruleId, status) {
  if (!supabaseFinance || !ruleId) return false;
  let targetStatus = String(status || '').toUpperCase();
  if (targetStatus === 'PAUSED') targetStatus = 'ENDED';
  if (!VALID_RECURRING_STATUSES.includes(targetStatus)) {
    console.warn(`[SUPABASE_FINANCE] Invalid recurring rule status: ${status}`);
    return false;
  }
  try {
    const { error } = await supabaseFinance
      .from('nexa_recurring_rules')
      .update({ status: targetStatus, updated_at: new Date().toISOString() })
      .eq('id', ruleId);
    if (error) {
      console.warn('[SUPABASE_FINANCE] updateRecurringRuleStatus error:', error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.error('[SUPABASE_FINANCE] updateRecurringRuleStatus exception:', err.message);
    return false;
  }
}

module.exports = {
  VALID_RECURRING_STATUSES,
  getRecurringRules,
  upsertRecurringRules,
  updateRecurringRuleStatus
};
