const { createClient } = require('@supabase/supabase-js');
const env = require('../src/config/env');
const sb = createClient(env.SUPABASE_URL, env.SUPABASE_KEY);

async function checkOldest() {
  const { data, error } = await sb
    .from('nexa_chat_memories')
    .select('id, role, content, created_at, platform')
    .order('created_at', { ascending: true })
    .limit(5);

  if (error) {
    console.error('Error:', error.message);
    return;
  }

  if (!data || data.length === 0) {
    console.log('Tabel nexa_chat_memories kosong.');
    return;
  }

  const now = new Date();
  console.log('=== DATA CHAT MEMORIES TERTUA DI SUPABASE ===');
  console.log('Waktu Sekarang (WIB):', new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' }));
  console.log('');

  data.forEach((m, idx) => {
    const createdAt = new Date(m.created_at);
    const diffMs = now - createdAt;
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    const diffMonths = (diffDays / 30.44).toFixed(1);
    const wibStr = createdAt.toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' });

    console.log(`[${idx + 1}] ID: ${m.id} | Platform: ${m.platform}`);
    console.log(`    Waktu Dibuat : ${m.created_at} (${wibStr} WIB)`);
    console.log(`    Usia Chat    : ${diffDays} Hari (~${diffMonths} Bulan)`);
    console.log(`    Status > 90d : ${diffDays >= 90 ? '✅ SUDAH LEBIH DARI 3 BULAN' : '⏳ BELUM 3 BULAN'}`);
    console.log(`    Role / Pesan : [${m.role}] "${String(m.content).substring(0, 80)}..."`);
    console.log('------------------------------------------------------------');
  });
}

checkOldest();
