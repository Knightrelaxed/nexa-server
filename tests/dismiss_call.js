const axios = require('axios');
require('dotenv').config();

async function main() {
  const token = process.env.NEXA_CLI_SECRET;
  try {
    const res1 = await axios.post('http://127.0.0.1:3000/webhook/bridge/command', { action: 'STOP_MEDIA' }, { headers: { 'Authorization': `Bearer ${token}` } });
    console.log('STOP_MEDIA:', res1.data);
    const res2 = await axios.post('http://127.0.0.1:3000/webhook/bridge/command', { action: 'GO_HOME_SCREEN' }, { headers: { 'Authorization': `Bearer ${token}` } });
    console.log('GO_HOME_SCREEN:', res2.data);
  } catch (e) {
    console.error('Error dismissing call:', e.message);
  }
}

main().then(() => process.exit(0));
