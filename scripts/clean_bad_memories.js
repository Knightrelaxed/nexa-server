'use strict';
const { createClient } = require('@supabase/supabase-js');
const env = require('../src/config/env');

async function main() {
  const sb = createClient(env.SUPABASE_URL, env.SUPABASE_KEY);

  console.log('--- Checking nexa_core_identity ---');
  const { data: ciRows, error: ciErr } = await sb
    .from('nexa_core_identity')
    .select('id, content, category_type, created_at')
    .order('created_at', { ascending: false })
    .limit(20);

  if (ciErr) {
    console.error('Error fetching nexa_core_identity:', ciErr.message);
  } else {
    for (const r of ciRows || []) {
      console.log(`[CI] ${r.id} | ${r.category_type} | ${r.created_at} | ${r.content.slice(0, 80)}`);
      if (
        r.content.includes('transkrip') ||
        r.content.includes('format JSON') ||
        r.content.includes('Silakan berikan') ||
        r.content.includes('contoh instruksi')
      ) {
        console.log(`--> DELETING bad CI row: ${r.id}`);
        await sb.from('nexa_core_identity').delete().eq('id', r.id);
      }
    }
  }

  console.log('--- Checking nexa_user_profile ---');
  const { data: upRows, error: upErr } = await sb
    .from('nexa_user_profile')
    .select('id, content, category_type, created_at')
    .order('created_at', { ascending: false })
    .limit(20);

  if (upErr) {
    console.error('Error fetching nexa_user_profile:', upErr.message);
  } else {
    for (const r of upRows || []) {
      console.log(`[UP] ${r.id} | ${r.category_type} | ${r.created_at} | ${r.content.slice(0, 80)}`);
      if (
        r.content.includes('transkrip') ||
        r.content.includes('format JSON') ||
        r.content.includes('Silakan berikan') ||
        r.content.includes('contoh instruksi')
      ) {
        console.log(`--> DELETING bad UP row: ${r.id}`);
        await sb.from('nexa_user_profile').delete().eq('id', r.id);
      }
    }
  }

  console.log('--- Rebuilding Vector Snapshot ---');
  try {
    const { generateAndSaveSnapshot } = require('../src/utils/gemini_vector_cache');
    await generateAndSaveSnapshot();
    console.log('Vector snapshot rebuilt successfully.');
  } catch (err) {
    console.warn('Vector snapshot rebuild warning:', err.message);
  }

  console.log('Cleanup finished.');
}

main().catch(console.error);
