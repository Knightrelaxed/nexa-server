const { createClient } = require('@supabase/supabase-js');
const env = require('../src/config/env');
const sb = createClient(env.SUPABASE_URL, env.SUPABASE_KEY);

async function cleanupGarbage() {
  // 1. Identify valid vs garbage in nexa_pending_intentions
  // Valid intentions from the list:
  // ID 6: "menambahka interface mengunakan whatsapp" (expired already)
  // ID 7: "motor beat" (expired already)
  // ID 13: "beasiswa ku cair / oracle cloud" (expired already)
  // ID 33: "daftar MUN" (ACTIVE)
  // ID 34: "daftar organisasi dan komunitas" (ACTIVE)

  // Everything else is pure garbage (sholat, istirahat, beli makan, jadwal kosong, quote nexa, etc.)
  const { data: allIntentions } = await sb.from('nexa_pending_intentions').select('id, intention, source_text, status');
  
  const garbageIds = [];
  const keepIds = [6, 7, 13, 33, 34];

  for (const row of allIntentions || []) {
    if (!keepIds.includes(row.id)) {
      garbageIds.push(row.id);
    }
  }

  console.log(`Found ${garbageIds.length} garbage intentions to mark CANCELLED`);
  if (garbageIds.length > 0) {
    const { error } = await sb
      .from('nexa_pending_intentions')
      .update({ status: 'CANCELLED' })
      .in('id', garbageIds);
    if (error) console.error('Error cancelling intentions:', error);
    else console.log('✅ Successfully cancelled garbage intentions!');
  }

  // 2. Also cleanup nexa_decision_journal
  // Garbage decisions: "beli bensin", "beli obat", "keluar uang", "berhenti sekarang sudah tepat", etc.
  const { data: allDecisions } = await sb.from('nexa_decision_journal').select('id, decision');
  const garbageDecisionIds = [4, 5, 6, 7, 8, 9, 10, 12, 13, 15, 17];
  console.log(`Cleaning ${garbageDecisionIds.length} garbage decisions...`);
  const { error: dErr } = await sb
    .from('nexa_decision_journal')
    .update({ outcome_received_at: new Date().toISOString(), outcome_result: 'DISCARDED_NOISE' })
    .in('id', garbageDecisionIds);
  if (dErr) console.error('Error cleaning decisions:', dErr);
  else console.log('✅ Successfully cleaned garbage decisions!');
}

cleanupGarbage();
