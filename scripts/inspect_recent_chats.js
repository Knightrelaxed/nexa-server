const { createClient } = require('@supabase/supabase-js');
const env = require('../src/config/env');
const sb = createClient(env.SUPABASE_URL, env.SUPABASE_KEY);

async function inspectRecentChats() {
  console.log('--- SAMPLE RECENT CHATS IN nexa_chat_memories (0-90 days) ---');
  
  // Juni 2026
  const { data: june } = await sb
    .from('nexa_chat_memories')
    .select('created_at, role, content')
    .gte('created_at', '2026-06-01T00:00:00+07:00')
    .lt('created_at', '2026-07-01T00:00:00+07:00')
    .eq('role', 'user')
    .limit(3);
  console.log('Juni 2026:', june);

  // Juli 2026
  const { data: july } = await sb
    .from('nexa_chat_memories')
    .select('created_at, role, content')
    .gte('created_at', '2026-07-01T00:00:00+07:00')
    .lt('created_at', '2026-08-01T00:00:00+07:00')
    .eq('role', 'user')
    .limit(3);
  console.log('Juli 2026:', july);

  // Agustus 2026
  const { data: aug } = await sb
    .from('nexa_chat_memories')
    .select('created_at, role, content')
    .gte('created_at', '2026-08-01T00:00:00+07:00')
    .eq('role', 'user')
    .limit(3);
  console.log('Agustus 2026:', aug);
}

inspectRecentChats();
