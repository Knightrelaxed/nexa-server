const supabaseMemories = require('../src/infrastructure/Supabase_Memories');

async function getFirstDay() {
  const result = await supabaseMemories.getChatsForDateWib('2026-05-12');
  console.log('Total pesan pada 12 Mei 2026:', result.messages.length);
  console.log('====================================================\n');
  result.messages.forEach((m, idx) => {
    const timeStr = m.created_at
      ? new Date(m.created_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: 'Asia/Jakarta' })
      : '--:--';
    console.log(`[${idx + 1}] [${timeStr} WIB] [${m.role.toUpperCase()}]:`);
    console.log(m.content);
    console.log('----------------------------------------------------');
  });
}

getFirstDay();
