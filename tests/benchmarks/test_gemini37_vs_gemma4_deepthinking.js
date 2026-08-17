const dns = require('dns');
try { dns.setDefaultResultOrder('ipv4first'); } catch (e) {}

require('dotenv').config();
const env = require('./src/config/env.js');

const KEY_GEMINI = env.GEMINI_API_KEY_1;
const KEY_GEMMA = env.GEMINI_API_KEY_2 || env.GEMINI_API_KEY_1;

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function callGoogleModel(apiKey, modelId, prompt, systemInstruction = '', maxTokens = 1200, isGemmaWithThinking = false) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent?key=${apiKey}`;
  
  const body = {
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: 0.3,
      maxOutputTokens: maxTokens
    }
  };

  if (systemInstruction) {
    body.systemInstruction = { parts: [{ text: systemInstruction }] };
  }

  for (let attempt = 1; attempt <= 3; attempt++) {
    const start = Date.now();
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });

      const latency = Date.now() - start;
      const resJson = await res.json();

      if (res.ok) {
        const rawText = resJson.candidates?.[0]?.content?.parts?.[0]?.text || '';
        const usage = resJson.usageMetadata || {};
        const outTokens = usage.candidatesTokenCount || 0;
        const tps = outTokens > 0 ? (outTokens / (latency / 1000)).toFixed(1) : 'N/A';

        return {
          ok: true,
          modelId,
          latency,
          text: rawText,
          promptTokens: usage.promptTokenCount || 0,
          candidatesTokens: outTokens,
          tps,
          attempt
        };
      }

      if (res.status === 503 || res.status === 429) {
        if (attempt < 3) {
          await sleep(2500 * attempt);
          continue;
        }
      }

      return {
        ok: false,
        modelId,
        latency,
        error: resJson.error?.message || res.statusText,
        attempt
      };
    } catch (err) {
      if (attempt < 3) {
        await sleep(2000 * attempt);
        continue;
      }
      return { ok: false, modelId, latency: Date.now() - start, error: err.message, attempt };
    }
  }
}

async function runDuel() {
  console.log('='.repeat(90));
  console.log('⚔️  DUEL MAUT: GEMINI 3.7 FLASH vs GOOGLE GEMMA 4 31B (WITH DEEP THINKING)');
  console.log('='.repeat(90));
  console.log(`Waktu: ${new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })} WIB\n`);

  const sysPersona = `Nama kamu adalah N.E.X.A, Asisten Eksekutif Digital Pribadi tingkat lanjut untuk Tuan Faqih Hidayatulloh (mahasiswa Sastra Arab UGM, calon beasiswa Jardine Oxford, calon diplomat). Gunakan gaya bicara elegan, hangat, santai tapi cerdas, panggil "Tuan Faqih" atau "Tuan".`;

  const tests = [
    {
      title: '1. RESPON TAKTIS & KETENANGAN (Tactical Advice)',
      prompt: 'Nexa, apa nasihat terpenting untuk seorang diplomat muda saat menghadapi negosiator lawan yang sangat agresif?'
    },
    {
      title: '2. ANALISIS GEOPOLITIK TINGKAT TINGGI (Petrodolar, BRICS+ & Diplomasi Arab)',
      prompt: 'Bagaimana pergeseran dari hegemoni unipolar ke tatanan multipolar memengaruhi diplomasi bahasa Arab di panggung global, khususnya terkait petrodolar dan integrasi ekonomi BRICS+? Berikan analisis tajam dalam 2 paragraf padat.'
    },
    {
      title: '3. DILEMA STRATEGIS NON-BLOK (Third-Way Non-Aligned Framework)',
      prompt: 'Rancang formula negosiasi 3 pilar bagi negara berkembang agar bisa menerima investasi infrastruktur dan pinjaman lunak dari dua negara adidaya yang saling bersaing tanpa terjerat perangkap kedaulatan.'
    }
  ];

  for (let i = 0; i < tests.length; i++) {
    const t = tests[i];
    console.log('═'.repeat(90));
    console.log(`📌 ${t.title}`);
    console.log(`💬 Prompt: "${t.prompt}"`);
    console.log('─'.repeat(90));

    // 1. Google Gemma 4 31B (With Deep Thinking)
    process.stdout.write('  🧠 Menembak Google Gemma 4 31B (Native Deep Thinking)... ');
    const resGemma = await callGoogleModel(KEY_GEMMA, 'gemma-4-31b-it', t.prompt, sysPersona, 1000, true);
    if (resGemma.ok) {
      console.log(`✅ ${resGemma.latency}ms | ${resGemma.tps} tok/s | ${resGemma.candidatesTokens} tok`);
    } else {
      console.log(`❌ Error: ${resGemma.error}`);
    }

    await sleep(2000);

    // 2. Google Gemini 3.7 Flash
    process.stdout.write('  ⚡ Menembak Google Gemini 3.7 Flash... ');
    const res37 = await callGoogleModel(KEY_GEMINI, 'gemini-3.7-flash', t.prompt, sysPersona, 1000, false);
    if (res37.ok) {
      console.log(`✅ ${res37.latency}ms | ${res37.tps} tok/s | ${res37.candidatesTokens} tok`);
    } else {
      console.log(`❌ Error: ${res37.error}`);
    }

    console.log('\n┌' + '─'.repeat(88) + '┐');
    console.log('│ 🧠 GOOGLE GEMMA 4 31B (WITH DEEP THINKING):'.padEnd(89) + '│');
    console.log('├' + '─'.repeat(88) + '┤');
    console.log(resGemma.text?.trim() || '(kosong)');
    console.log('└' + '─'.repeat(88) + '┘');

    console.log('\n┌' + '─'.repeat(88) + '┐');
    console.log('│ ⚡ GOOGLE GEMINI 3.7 FLASH:'.padEnd(89) + '│');
    console.log('├' + '─'.repeat(88) + '┤');
    console.log(res37.text?.trim() || '(kosong)');
    console.log('└' + '─'.repeat(88) + '┘\n');

    await sleep(2500);
  }

  console.log('='.repeat(90));
  console.log('🎉 PENGUJIAN DUEL MAUT SELESAI!');
  console.log('='.repeat(90));
}

runDuel().catch(console.error);
