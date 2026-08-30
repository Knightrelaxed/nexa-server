const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const aiRouter = require('../src/core/AI_Router');

async function testAudit() {
  const query = "Nex, pas 1 Juni kemarin aku sempat beli apa? tolong cek";
  console.log('Query:', query);
  const result = await aiRouter.routeUserMessage(query, 'telegram', {
    chatId: 6798861902
  });
  console.log('\n--- AI ROUTER RESULT ---');
  console.log('Intent:', result?.intent);
  console.log('Extracted Data:', JSON.stringify(result?.extracted_data, null, 2));
  console.log('Reply Message:', result?.reply_message);
}

testAudit();
