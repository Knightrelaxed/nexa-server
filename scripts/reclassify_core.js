'use strict';
/**
 * scripts/reclassify_core.js
 *
 * One-off audit: re-run the 5-tier cognitive classifier over every live CORE row
 * across both nexa_user_profile and nexa_core_identity.
 * Dry-run by default. Rows that are still CORE are never touched.
 *
 * Usage:
 *   node scripts/reclassify_core.js            # dry-run report only
 *   node scripts/reclassify_core.js --apply    # write demotions to Supabase
 */

const { createClient } = require('@supabase/supabase-js');
const env = require('../src/config/env');
const { _classifyMemoryCategory } = require('../src/core/router/Memory_Classifier');

if (!env.SUPABASE_URL || !env.SUPABASE_KEY) {
  console.error('[RECLASSIFY] Error: SUPABASE_URL and SUPABASE_KEY are required in .env');
  process.exit(1);
}

const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_KEY);

const APPLY = process.argv.includes('--apply');
const PAUSE_MS = 800; // rate limit guard
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function auditTable(tableName, hasLifecycleMeta = true) {
  console.log(`\n============================================================`);
  console.log(`[RECLASSIFY] Auditing ${tableName} CORE rows... Mode: ${APPLY ? 'APPLY' : 'DRY-RUN'}`);
  console.log(`============================================================`);

  const { data: rows, error } = await supabase
    .from(tableName)
    .select('id, content')
    .eq('category_type', 'CORE')
    .in('status', ['ACTIVE', 'STAGED_FOR_PRUNING'])
    .order('id');

  if (error) {
    console.error(`[RECLASSIFY] Error fetching rows from ${tableName}:`, error.message);
    return { total: 0, kept: 0, changed: 0 };
  }

  console.log(`[RECLASSIFY] Found ${rows.length} active CORE rows in ${tableName}.\n`);

  const chapters = new Set();
  let kept = 0;
  let changed = 0;

  for (const row of rows) {
    const cls = await _classifyMemoryCategory(row.content, { activeChapters: [...chapters] });
    if (cls.chapter) chapters.add(cls.chapter);

    if (cls.label === 'CORE') {
      kept++;
      console.log(`[STAYS CORE] #${row.id}: "${row.content.slice(0, 90)}"`);
      await sleep(PAUSE_MS);
      continue;
    }

    changed++;
    console.log(`\n[DEMOTE] #${row.id} CORE -> ${cls.label}`);
    console.log(`  Content:    "${row.content.slice(0, 100)}"`);
    console.log(`  valid_days: ${cls.valid_days} | chapter: ${cls.chapter || '(none)'} | end_event: "${cls.end_event || 'none'}"`);
    console.log(`  confidence: ${cls.confidence} | source: ${cls.source}`);

    if (APPLY && cls.source !== 'fallback') {
      const patch = { category_type: cls.label };
      if (hasLifecycleMeta) {
        patch.valid_days = cls.valid_days;
        patch.chapter = cls.chapter;
        patch.end_event = cls.end_event;
      }
      const { error: upErr } = await supabase.from(tableName).update(patch).eq('id', row.id);

      if (upErr) {
        console.error(`  ❌ Update failed for #${row.id} in ${tableName}:`, upErr.message);
      } else {
        console.log(`  ✅ Successfully updated #${row.id} to ${cls.label} in ${tableName}`);
      }
    }
    await sleep(PAUSE_MS);
  }

  console.log(`\n[RECLASSIFY] Summary for ${tableName}: Total=${rows.length}, Stayed CORE=${kept}, Demoted=${changed}`);
  return { total: rows.length, kept, changed };
}

(async () => {
  const profileStats = await auditTable('nexa_user_profile', true);
  const identityStats = await auditTable('nexa_core_identity', false);

  console.log(`\n============================================================`);
  console.log(`[RECLASSIFY] FULL AUDIT COMPLETE`);
  console.log(`  nexa_user_profile: Total=${profileStats.total}, CORE=${profileStats.kept}, Demoted=${profileStats.changed}`);
  console.log(`  nexa_core_identity: Total=${identityStats.total}, CORE=${identityStats.kept}, Demoted=${identityStats.changed}`);
  console.log(`  Mode: ${APPLY ? 'APPLIED TO DATABASE' : 'DRY-RUN (nothing written)'}`);
  console.log(`============================================================\n`);
})().catch(e => {
  console.error('[RECLASSIFY] Fatal error:', e);
  process.exit(1);
});
