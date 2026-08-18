const dns = require('dns');
try { dns.setDefaultResultOrder('ipv4first'); } catch (e) {}

require('dotenv').config();
const { executeWithFallback } = require('../src/core/Fallback_Engine.js');

async function testJson() {
  console.log('Testing Gemma in JSON Mode via Gateway:');
  const prompt = 'Halo nexa pagi';
  const sys = 'Kamu adalah N.E.X.A. Kembalikan JSON: {"intent": "NORMAL_CHAT", "reply_message": "Selamat pagi Tuan!"}';
  try {
    const start = Date.now();
    const res = await executeWithFallback(prompt, sys, 0.3, true);
    console.log(`Success (${Date.now() - start} ms):\n`, res);
  } catch (e) {
    console.error('Error:', e.message);
  }
}

testJson().catch(console.error);
