const dns = require('dns');
try { dns.setDefaultResultOrder('ipv4first'); } catch (e) {}

require('dotenv').config();

const googleApiKeys = [
  process.env.GEMINI_API_KEY_1 || process.env.GEMINI_API_KEY,
  process.env.GEMINI_API_KEY_2,
  process.env.GEMINI_API_KEY_3,
  process.env.GEMINI_API_KEY_4
].filter(Boolean);

const modelsToTest = [
  'gemini-2.5-flash',
  'gemini-2.0-flash',
  'gemini-1.5-flash',
  'gemini-1.5-pro',
  'gemini-3.7-flash',
  'gemini-3.6-flash',
  'gemma-4-31b-it',
  'gemma-4-26b-a4b-it'
];

async function probeAll() {
  console.log('='.repeat(95));
  console.log('🔍 PROBING GOOGLE AI STUDIO MODELS FROM CURRENT MACHINE (VPS/LOCAL)');
  console.log(`Total Keys: ${googleApiKeys.length}`);
  console.log('='.repeat(95));

  for (let k = 0; k < googleApiKeys.length; k++) {
    const apiKey = googleApiKeys[k];
    console.log(`\n🔑 Testing Key #${k + 1} (Prefix: ${apiKey.substring(0, 8)}...):`);
    console.log('─'.repeat(95));

    for (const model of modelsToTest) {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
      const start = Date.now();
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: 'Halo ping' }] }]
          }),
          signal: AbortSignal.timeout(8000)
        });

        const latency = Date.now() - start;
        if (res.ok) {
          const data = await res.json();
          const txt = data.candidates?.[0]?.content?.parts?.[0]?.text?.replace(/\n/g, ' ').substring(0, 40) || 'OK';
          console.log(`  ✅ [${res.status}] ${model.padEnd(20)} | ${latency} ms | Resp: "${txt}..."`);
        } else {
          const err = await res.json().catch(() => ({}));
          console.log(`  ❌ [${res.status}] ${model.padEnd(20)} | ${latency} ms | Err: ${err.error?.message || res.statusText}`);
        }
      } catch (e) {
        console.log(`  ⚠️ [TIMEOUT/ERR] ${model.padEnd(20)} | ${Date.now() - start} ms | ${e.message}`);
      }
    }
  }
}

probeAll().catch(console.error);
