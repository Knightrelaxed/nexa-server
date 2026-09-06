const { createClient } = require('@supabase/supabase-js');
const env = require('../src/config/env');
const sb = createClient(env.SUPABASE_URL, env.SUPABASE_KEY);

async function searchDatabase() {
  console.log('Searching Supabase tables for old acronym...');
  const tables = [
    'nexa_core_identity',
    'nexa_user_profile',
    'nexa_2nd_brain',
    'nexa_daily_narratives',
    'nexa_chat_memories'
  ];

  for (const table of tables) {
    try {
      const { data, error } = await sb.from(table).select('*').limit(500);
      if (error) {
        console.log(`Table ${table} error:`, error.message);
        continue;
      }
      if (!data) continue;

      const matches = data.filter(row => {
        const str = JSON.stringify(row);
        return /Neural\s*Extension/i.test(str) || /Extension\s*Assistant/i.test(str) || /Assistant\s*for\s*Intelligence/i.test(str);
      });

      console.log(`Table ${table}: found ${matches.length} matching rows.`);
      for (const m of matches) {
        console.log(`  - [ID: ${m.id}]:`, JSON.stringify(m).substring(0, 150));
      }
    } catch (e) {
      console.log(`Error searching ${table}:`, e.message);
    }
  }
}

searchDatabase();
