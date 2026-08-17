const dns = require('dns');
try { dns.setDefaultResultOrder('ipv4first'); } catch (e) {}

require('dotenv').config();
const env = require('./src/config/env.js');

const GEMINI_KEYS = [
  env.GEMINI_API_KEY_1,
  env.GEMINI_API_KEY_2,
  env.GEMINI_API_KEY_3,
  env.GEMINI_API_KEY_4
].filter(Boolean);

console.log('='.repeat(80));
console.log('🔍 CEK KETERSEDIAAN MODEL "GEMMA" VIA GOOGLE GEMINI API KEY');
console.log('='.repeat(80));
console.log(`Jumlah Kunci Gemini Aktif: ${GEMINI_KEYS.length}`);

async function check() {
  const key = GEMINI_KEYS[0];
  const listUrl = `https://generativelanguage.googleapis.com/v1beta/models?key=${key}`;
  
  try {
    const res = await fetch(listUrl);
    if (!res.ok) {
      console.log(`❌ Error fetching models: HTTP ${res.status} ${res.statusText}`);
      return;
    }

    const data = await res.json();
    const models = data.models || [];
    
    console.log(`\n📋 Ditemukan ${models.length} model resmi di Google AI Studio (Gemini API):\n`);

    // 1. Cek Model Gemma
    const gemmaList = models.filter(m => m.name.toLowerCase().includes('gemma'));
    console.log('🌟 [1] APAKAH ADA MODEL GEMMA DI GOOGLE AI STUDIO?');
    if (gemmaList.length > 0) {
      gemmaList.forEach(m => {
        console.log(`  ✅ ${m.name.replace('models/', '').padEnd(30)} | Input: ${m.inputTokenLimit} | Display: ${m.displayName}`);
      });
    } else {
      console.log('  ❌ TIDAK DITEMUKAN model bernama "Gemma" di katalog v1beta Gemini API.');
    }

    // 2. Daftar Model Google AI Studio
    console.log('\n🌟 [2] DAFTAR LENGKAP MODEL AKTIF GOOGLE AI STUDIO:');
    models.forEach(m => {
      const id = m.name.replace('models/', '').padEnd(35);
      const inLimit = String(m.inputTokenLimit || '-').padEnd(10);
      const name = (m.displayName || '').padEnd(30);
      console.log(`  • ${id} | In: ${inLimit} | ${name}`);
    });

    // 3. Test Penembakan Langsung ke Varian Gemma
    console.log('\n🌟 [3] TEST PENEMBAKAN LANGSUNG KE VARIAN GEMMA DI GOOGLE API:');
    const testIds = [
      'gemma-4-31b-it',
      'gemma-4-26b-a4b-it',
      'gemma-3-27b-it',
      'gemma-2-27b-it',
      'gemma-2-9b-it',
      'gemma-2-2b-it'
    ];

    for (const tid of testIds) {
      const genUrl = `https://generativelanguage.googleapis.com/v1beta/models/${tid}:generateContent?key=${key}`;
      try {
        const r = await fetch(genUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ role: 'user', parts: [{ text: 'Hai!' }] }]
          })
        });
        if (r.ok) {
          const json = await r.json();
          const reply = json.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '(berhasil)';
          console.log(`  ✅ ${tid.padEnd(20)} : 200 OK -> ${reply.replace(/\n/g, ' ').substring(0, 50)}`);
        } else {
          console.log(`  ❌ ${tid.padEnd(20)} : HTTP ${r.status} (${r.statusText})`);
        }
      } catch (err) {
        console.log(`  ❌ ${tid.padEnd(20)} : ${err.message}`);
      }
    }

  } catch (err) {
    console.error('Error request:', err.message);
  }
}

check();
