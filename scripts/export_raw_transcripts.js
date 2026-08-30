const fs = require('fs');
const path = require('path');
const supabaseMemories = require('../src/infrastructure/Supabase_Memories');

async function exportTranscripts() {
  const dates = await supabaseMemories.getCandidateDatesToConsolidate(90);
  const outDir = path.join(__dirname, '../data/transcripts_dump');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  for (const d of dates) {
    const { messages, messageIds } = await supabaseMemories.getChatsForDateWib(d);
    const dayName = require('../src/domain/Chrono_Consolidator').getIndonesianDayName(d);
    const filePath = path.join(outDir, `${d}.json`);
    fs.writeFileSync(filePath, JSON.stringify({
      date: d,
      dayName,
      messageCount: messages.length,
      messageIds,
      messages
    }, null, 2), 'utf8');
    console.log(`Exported ${d} (${messages.length} msgs)`);
  }
}

exportTranscripts();
