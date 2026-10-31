'use strict';
/**
 * scripts/reclassify_core.js
 *
 * One-off audit: re-run the 5-tier cognitive classifier over every live CORE row.
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

(async () => {
  console.log(`[RECLASSIFY] Auditing nexa_user_profile CORE rows... Mode: ${APPLY ? 'APPLY' : 'DRY-RUN'}`);

  const { data: rows, error } = await supabase
    .from('nexa_user_profile')
    .select('id, content')
    .eq('category_type', 'CORE')
    .in('status', ['ACTIVE', 'STAGED_FOR_PRUNING'])
    .order('id');

  if (error) throw error;

  console.log(`[RECLASSIFY] Found ${rows.length} active CORE rows to audit.\n`);

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
      const { error: upErr } = await supabase.from('nexa_user_profile').update({
        category_type: cls.label,
        valid_days: cls.valid_days,
        chapter: cls.chapter,
        end_event: cls.end_event,
      }).eq('id', row.id);

      if (upErr) {
        console.error(`  ❌ Update failed for #${row.id}:`, upErr.message);
      } else {
        console.log(`  ✅ Successfully updated #${row.id} to ${cls.label}`);
      }
    }
    await sleep(PAUSE_MS);
  }

  console.log(`\n============================================================`);
  console.log(`[RECLASSIFY] Audit complete.`);
  console.log(`  Total audited: ${rows.length}`);
  console.log(`  Stayed CORE:   ${kept}`);
  console.log(`  Demoted:       ${changed}`);
  console.log(`  Mode:          ${APPLY ? 'APPLIED TO DATABASE' : 'DRY-RUN (nothing written)'}`);
  console.log(`============================================================\n`);
})().catch(e => {
  console.error('[RECLASSIFY] Fatal error:', e);
  process.exit(1);
});
