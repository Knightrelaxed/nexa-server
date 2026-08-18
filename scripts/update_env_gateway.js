const fs = require('fs');
const path = require('path');

const envPath = path.resolve(__dirname, '../.env');
if (fs.existsSync(envPath)) {
  let content = fs.readFileSync(envPath, 'utf-8');
  if (!content.includes('GEMINI_BASE_URL=')) {
    content += '\nGEMINI_BASE_URL=https://nexa-relay.dazatulloh2.workers.dev\n';
  } else {
    content = content.replace(/GEMINI_BASE_URL=.*/, 'GEMINI_BASE_URL=https://nexa-relay.dazatulloh2.workers.dev');
  }
  fs.writeFileSync(envPath, content, 'utf-8');
  console.log('✅ .env updated with GEMINI_BASE_URL=https://nexa-relay.dazatulloh2.workers.dev');
} else {
  console.error('❌ .env not found');
}
