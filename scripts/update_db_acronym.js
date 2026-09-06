const { createClient } = require('@supabase/supabase-js');
const env = require('../src/config/env');
const sb = createClient(env.SUPABASE_URL, env.SUPABASE_KEY);

const OLD_NAME = 'Neural Extension Assistant for Intelligence';
const NEW_NAME = 'Neural Executive with Xenial Agent';

async function updateDatabase() {
  console.log('=== Updating Supabase database ===');

  // 1. nexa_core_identity
  const coreIds = [1, 132, 137];
  for (const id of coreIds) {
    const { data: row } = await sb.from('nexa_core_identity').select('content').eq('id', id).single();
    if (row && row.content) {
      const updated = row.content.replace(new RegExp(OLD_NAME, 'g'), NEW_NAME);
      await sb.from('nexa_core_identity').update({ content: updated }).eq('id', id);
      console.log(`✅ Updated nexa_core_identity ID ${id}`);
    }
  }

  // 2. nexa_daily_narratives ID 27
  const { data: dRow } = await sb.from('nexa_daily_narratives').select('narrative').eq('id', 27).single();
  if (dRow && dRow.narrative) {
    const updated = dRow.narrative.replace(new RegExp(OLD_NAME, 'g'), NEW_NAME);
    await sb.from('nexa_daily_narratives').update({ narrative: updated }).eq('id', 27);
    console.log(`✅ Updated nexa_daily_narratives ID 27`);
  }

  console.log('=== Database update complete ===');
}

updateDatabase();
