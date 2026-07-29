// ============================================================
// ⚠️  DEPRECATED — File ini hanya untuk debugging lokal.
// Gunakan Universal CLI dari laptop manapun:
//   npx github:Knightrelaxed/nexa-cli
// File ini menjalankan AI Router di laptop (bukan di server HF),
// sehingga log tidak muncul di container HF dan memori terpisah.
// ============================================================
const readline = require('readline');
const aiRouter = require('../src/core/AI_Router');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

console.log('===========================================================');
console.log('🤖 N.E.X.A TERMINAL INTERACTIVE CHAT SIMULATOR (SACR ROUTER)');
console.log('===========================================================');
console.log('Ketik pesan Anda dan tekan Enter untuk berbicara langsung dengan N.E.X.A.');
console.log('Ketik "exit" atau "keluar" untuk mengakhiri sesi obrolan.\n');

function askQuestion() {
  rl.question('👤 Tuan Faqih: ', async (userText) => {
    const input = userText.trim();
    if (!input) {
      askQuestion();
      return;
    }
    if (['exit', 'keluar', 'q', 'quit'].includes(input.toLowerCase())) {
      console.log('\n👋 N.E.X.A: Sampai jumpa kembali, Tuan Faqih!');
      rl.close();
      return;
    }

    const startTime = Date.now();
    try {
      const response = await aiRouter.routeUserMessage(input, { source: 'terminal_cli' });
      const elapsed = Date.now() - startTime;
      const reply = typeof response === 'string' ? response : (response?.reply_message || JSON.stringify(response, null, 2));
      
      console.log(`\n🤖 N.E.X.A (${elapsed}ms):\n${reply}\n`);
    } catch (e) {
      console.error(`\n❌ Error: ${e.message}\n`);
    }
    askQuestion();
  });
}

askQuestion();
