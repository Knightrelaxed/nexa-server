const { createClient } = require('@supabase/supabase-js');
const env = require('../src/config/env');
const sb = createClient(env.SUPABASE_URL, env.SUPABASE_KEY);

async function inspectAll() {
  const { data, error } = await sb.from('nexa_pending_intentions').select('*');
  if (error) {
    console.error(error);
  } else {
    console.log('Total rows:', data.length);
    data.forEach(r => {
      const src = (r.source_text || '').replace(/\n/g, ' ').substring(0, 60);
      console.log(`ID:${r.id} | Status:${r.status} | Created:${r.created_at?.substring(0,10)} | Intention: "${r.intention}" | Source: "${src}"`);
    });
  }
}
inspectAll();
