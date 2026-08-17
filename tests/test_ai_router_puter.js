const aiRouter = require('../src/core/AI_Router');
const env = require('../src/config/env');

async function testSimulatedChat() {
  console.log('🤖 SIMULASI INTERAKSI N.E.X.A DENGAN AI ROUTER & PUTER AI\n');

  const sampleMessages = [
    "Halo N.E.X.A, aku merasa agak lelah hari ini setelah riset seharian. Menurutmu aku harus bagaimana?",
    "Coba ingat kembali, tugas sastra diplomasi apa yang kemarin sempat kubahas?",
    "Bagaimana pandanganmu tentang perkembangan teknologi AI dan masa depan diplomasi digital?"
  ];

  for (const msg of sampleMessages) {
    console.log(`===========================================================`);
    console.log(`👤 Tuan Faqih: "${msg}"`);
    console.log(`-----------------------------------------------------------`);
    const startTime = Date.now();
    try {
      const response = await aiRouter.routeUserMessage(msg, { source: 'terminal_simulation' });
      const elapsed = Date.now() - startTime;
      console.log(`🤖 N.E.X.A (${elapsed}ms):\n${response?.reply_message || JSON.stringify(response, null, 2)}`);
    } catch (e) {
      console.error(`❌ Error:`, e.message);
    }
    console.log('\n');
  }
}

testSimulatedChat();
