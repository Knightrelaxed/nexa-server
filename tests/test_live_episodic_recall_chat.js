const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const aiRouter = require('../src/core/AI_Router');

async function testChatQuestions() {
  console.log('====================================================');
  console.log('🧪 TEST: LIVE AI ROUTER EPISODIC RECALL CHAT');
  console.log('====================================================\n');

  const questions = [
    "Nexa, kamu ingat gak waktu ulang tahunku bulan Mei kemarin kita ngapain?",
    "Nex, waktu tanggal 23 Mei kemarin aku sempat ngeluh apa ya ke kamu?"
  ];

  for (const q of questions) {
    console.log(`\n💬 TUAN FAQIH: "${q}"`);
    console.log('⏳ N.E.X.A sedang mengingat & memproses...');
    try {
      const result = await aiRouter.routeUserMessage(q, 'telegram', {
        chatId: 6798861902
      });
      console.log(`🤖 N.E.X.A:`);
      console.log(result?.reply_message || JSON.stringify(result));
      console.log(`\n[Intent: ${result?.intent} | Mood: ${result?.mood}]`);
    } catch (e) {
      console.error('Error routing message:', e.message);
    }
    console.log('----------------------------------------------------');
  }
}

testChatQuestions();
