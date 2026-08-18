require('dotenv').config();
const { routeUserMessage } = require('../src/core/AI_Router');

async function test() {
  const start = Date.now();
  console.log('Testing live chat on VPS...');
  const res = await routeUserMessage('cek halo');
  console.log('⏱️ Router finished in:', Date.now() - start, 'ms');
  console.log('Intent:', res.intent);
  console.log('Reply:\n', res.reply_message);
}

test().catch(console.error);
