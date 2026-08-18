const dns = require('dns');
try { dns.setDefaultResultOrder('ipv4first'); } catch (e) {}

require('dotenv').config();

const GATEWAY_URL = 'https://nexa-relay.dazatulloh2.workers.dev';

const keys = [
  process.env.GEMINI_API_KEY_1 || process.env.GEMINI_API_KEY,
  process.env.GEMINI_API_KEY_2,
  process.env.GEMINI_API_KEY_3,
  process.env.GEMINI_API_KEY_4
].filter(Boolean);

async function testGateway() {
  console.log('='.repeat(90));
  console.log('🚀 TESTING CLOUDFLARE EDGE AI GATEWAY DARI AZURE VPS');
  console.log(`Gateway: ${GATEWAY_URL}`);
  console.log('='.repeat(90));

  // 1. Test Google Gemma 4 31B via Gateway
  console.log('\n[1] Testing Google Gemma 4 31B (Anti-CoT) via Gateway:');
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    const url = `${GATEWAY_URL}/v1beta/models/gemma-4-31b-it:generateContent?key=${key}`;
    const start = Date.now();
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            role: 'user',
            parts: [{ text: 'Halo Nexa, perkenalkan dirimu dalam satu kalimat singkat.' }]
          }]
        })
      });

      const latency = Date.now() - start;
      const data = await res.json();

      if (res.ok) {
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
        console.log(`  ✅ [Key ${i + 1}] Gemma 4 SUCCESS (${latency} ms): "${text.substring(0, 80)}..."`);
      } else {
        console.log(`  ❌ [Key ${i + 1}] Gemma 4 FAILED: [${res.status}] ${data.error?.message || res.statusText}`);
      }
    } catch (e) {
      console.log(`  ❌ [Key ${i + 1}] Gemma 4 ERROR: ${e.message}`);
    }
  }

  // 2. Test Gemini 3.7 / 3.6 Flash via Gateway
  console.log('\n' + '-'.repeat(90));
  console.log('[2] Testing Gemini 3.7 Flash via Gateway:');
  const key = keys[0];
  const url37 = `${GATEWAY_URL}/v1beta/models/gemini-3.7-flash:generateContent?key=${key}`;
  const start37 = Date.now();
  try {
    const res = await fetch(url37, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: 'Halo' }] }]
      })
    });
    const data = await res.json();
    console.log(`  [Gemini 3.7] Status [${res.status}] (${Date.now() - start37} ms):`, res.ok ? 'SUCCESS' : data.error?.message);
  } catch (e) {
    console.log('  [Gemini 3.7] Error:', e.message);
  }

  console.log('\n' + '='.repeat(90));
}

testGateway().catch(console.error);
