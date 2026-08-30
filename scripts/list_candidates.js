const supabaseMemories = require('../src/infrastructure/Supabase_Memories');

async function listCandidates() {
  const dates = await supabaseMemories.getCandidateDatesToConsolidate(90);
  console.log(`Ditemukan ${dates.length} tanggal kandidat (> 90 hari):`);
  for (const d of dates) {
    const { messages } = await supabaseMemories.getChatsForDateWib(d);
    console.log(`- Tanggal ${d}: ${messages.length} pesan`);
  }
}

listCandidates();
