const { routeUserMessage } = require('./src/core/AI_Router');

async function test() {
  console.log('Testing AI Router for CALENDAR color...');
  const res = await routeUserMessage('Nexa, tambahkan jadwal Rapat Penting warna merah besok jam 4 siang selama 1 jam');
  console.log('Result:', res);
}

test();
