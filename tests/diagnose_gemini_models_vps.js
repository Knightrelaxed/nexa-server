const dns = require('dns');
try { dns.setDefaultResultOrder('ipv4first'); } catch (e) {}

require('dotenv').config();

const keys = [
  process.env.GEMINI_API_KEY_1 || process.env.GEMINI_API_KEY,
  process.env.GEMINI_API_KEY_2,
  process.env.GEMINI_API_KEY_3,
  process.env.GEMINI_API_KEY_4
].filter(Boolean);

const modelsToTest = [
  'gemini-2.5-flash',
  'gemini-2.5-flash-lite',
  'gemini-3.5-flash',
  'gemini-3.5-flash-lite',
  'gemini-3.6-flash',
  'gemini-3.7-flash',
  'gemma-4-31b-it',
  'gemma-4-26b-a4b-it'
];

async function testAllGeminiModelsOnVps() {
  console.log('='.repeat(85));
  console.log('🔍 DIAGNOSTIK LENGKAP MODEL GOOGLE AI STUDIO DARI AZURE VPS');
  console.log(`Jumlah Kunci Terdeteksi: ${keys.length}`);
  console.log('='.repeat(85));

  for (const model of modelsToTest) {
    for (let k = 0; k < keys.length; k++) {
      const apiKey = keys[k];
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
      const start = Date.now();
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ role: 'user', parts: [{ text: 'Ping' }] }]
          })
        });

        const data = await res.json();
        const latency = Date.now() - start;

        if (res.ok) {
          const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
          console.log(`✅ [Key ${k + 1}] ${model.padEnd(25)} -> SUKSES (${latency} ms) : "${text.substring(0, 30)}"`);
        } else {
          console.log(`❌ [Key ${k + 1}] ${model.padEnd(25)} -> [${res.status}] ${data.error?.message || res.statusText}`);
        }
      } catch (e) {
        console.log(`❌ [Key ${k + 1}] ${model.padEnd(25)} -> EXCEPTION: ${e.message}`);
      }
    }
    console.log('-'.repeat(85));
  }
}

testAllGeminiModelsOnVps().catch(console.error);
