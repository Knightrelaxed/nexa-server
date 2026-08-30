const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, '../data/transcripts_dump');
const files = fs.readdirSync(dir).filter(f => f.endsWith('.json')).sort();

for (const file of files) {
  const data = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));
  const userMsgs = data.messages.filter(m => (m.role || '').toLowerCase() === 'user').map(m => m.content);
  console.log(`=== ${data.date} (${data.dayName}) - ${data.messageCount} msgs (${userMsgs.length} user) ===`);
  console.log('User sample queries:');
  userMsgs.slice(0, 8).forEach(u => console.log(`  - "${String(u).substring(0, 80)}"`));
  console.log('');
}
