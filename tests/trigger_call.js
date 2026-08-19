const axios = require('axios');
require('dotenv').config();

async function main() {
  console.log('📞 Mengirim sinyal panggilan simulasi ke PM2 instance...');
  const token = process.env.NEXA_CLI_SECRET;
  try {
    const res = await axios.post('http://127.0.0.1:3000/webhook/bridge/simulate-call', {
      callerName: 'N.E.X.A Chief of Staff',
      message: 'Selamat pagi Tuan Faqih. Ini adalah uji coba transmisi suara live Google Gemini. Silakan angkat panggilan.',
      playRingtone: true
    }, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    console.log('✅ Response dari HP:', res.data);
  } catch (e) {
    console.error('❌ Error response:', e.response ? e.response.data : e.message);
  }
}

main().then(() => process.exit(0));
