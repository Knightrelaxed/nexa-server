/**
 * ============================================================
 * [N.E.X.A] memories/Memory_Client.js
 * Klien Supabase + helper tabel/ID bersama (lapisan terbawah, tanpa dependensi internal)
 *
 * Bagian dari modularisasi Supabase_Memories.js (facade: ../Supabase_Memories.js).
 * Kode dipindahkan verbatim oleh scripts/refactor/split_supabase_memories.js;
 * satu-satunya perubahan adalah jalur require relatif (+1 level).
 * ============================================================
 */

const { createClient } = require('@supabase/supabase-js');
const env = require('../../config/env');

// Initialize only if URL and KEY are provided to avoid crashing on empty .env
const supabase = (env.SUPABASE_URL && env.SUPABASE_KEY) 
  ? createClient(env.SUPABASE_URL, env.SUPABASE_KEY)
  : null;

const SUPABASE_TABLES = [
  'nexa_chat_memories',
  'nexa_daily_narratives',    // [CHRONO-EPISODIC] 90-Day Rolling Daily Chronicles
  'nexa_finance_dedup',
  'nexa_user_profile',
  'nexa_core_identity',
  'nexa_2nd_brain',
  'nexa_vault_items',
  'nexa_pending_transactions',
  'nexa_behavior_log',         // [PHASE 6 — Pilar 8.2]
  'nexa_identity_model',       // [PHASE 6 — Cognitive Identity Layer]
  'nexa_identity_proposals',   // [PHASE 6 — Git-Style Proposal Staging]
  'nexa_self_model',           // [PHASE 8 — Self-Learning Engine]
  'nexa_app_limits',           // App Usage & Duration Limiting System
  'nexa_learning_events',      // [v3.3 — Closed Learning Loop Events]
  'nexa_playbooks'             // [v3.3 — Procedural Memory Playbooks]
];

function resolveAllowedTableName(tableName) {
  const normalized = String(tableName || '').trim().toLowerCase();
  if (SUPABASE_TABLES.includes(normalized)) return normalized;
  return null;
}

/**
 * Smart matcher for IDs, ranges, or keywords
 */
function findMatchingIds(rows, searchKeyword) {
  if (!rows || !Array.isArray(rows) || rows.length === 0 || !searchKeyword) return [];
  const sk = String(searchKeyword).toLowerCase().trim();
  const targetIds = new Set();

  // 0. Check exact match on content / trait_value / trait_key first!
  for (const r of rows) {
    if (!r || typeof r !== 'object') continue;
    const val = r.content || r.trait_value || r.trait_key || '';
    if (val && String(val).toLowerCase().trim() === sk) {
      return [r.id];
    }
  }

  // 1. Check if it's an exact ID number
  if (!isNaN(sk) && /^\d+$/.test(sk)) {
    targetIds.add(parseInt(sk, 10));
    return Array.from(targetIds);
  }

  // 2. Check if it's explicitly asking for a range of IDs ("id 10 sampai 16" or short string "10-16")
  const explicitRangeMatch = sk.match(/(?:id|nomor|no|^)\s*(\d+)\s*(?:sampai|-|to)\s*(\d+)\s*$/i);
  if (explicitRangeMatch && sk.length <= 35) {
    const start = parseInt(explicitRangeMatch[1], 10);
    const end = parseInt(explicitRangeMatch[2], 10);
    for (let i = Math.min(start, end); i <= Math.max(start, end); i++) {
      targetIds.add(i);
    }
    return Array.from(targetIds);
  }
  
  // 3. Check if it mentions "id 18" or "nomor 18" explicitly
  const idMatch = sk.match(/(?:id|nomor|no)\s+(\d+)\b/i);
  if (idMatch && sk.length <= 35) {
    targetIds.add(parseInt(idMatch[1], 10));
    return Array.from(targetIds);
  }

  // 4. Fallback: Keyword splitting
  const keywords = sk.split(' ').filter(w => w.length > 2);
  rows.forEach(r => {
    const rowText = typeof r === 'object' ? JSON.stringify(r) : String(r);
    const contentLower = rowText.toLowerCase();
    if (keywords.length > 0 && keywords.every(kw => contentLower.includes(kw))) {
      targetIds.add(r.id);
    }
  });

  return Array.from(targetIds);
}

module.exports = {
  supabase,
  SUPABASE_TABLES,
  resolveAllowedTableName,
  findMatchingIds
};
