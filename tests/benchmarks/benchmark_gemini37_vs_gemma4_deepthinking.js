const dns = require('dns');
try { dns.setDefaultResultOrder('ipv4first'); } catch (e) {}

require('dotenv').config();
const env = require('./src/config/env.js');

const KEY_GEMINI = env.GEMINI_API_KEY_3 || env.GEMINI_API_KEY_4 || env.GEMINI_API_KEY_1;
const KEY_GEMMA  = env.GEMINI_API_KEY_2 || env.GEMINI_API_KEY_1;

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function callGoogleApi(apiKey, modelId, prompt, systemInstruction = '', maxTokens = 1000) {
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

  const start = Date.now();
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });

    const latency = Date.now() - start;
    const resJson = await res.json();

    if (!res.ok) {
      return {
        ok: false,
        latency,
        error: resJson.error?.message || res.statusText
      };
    }

    const rawText = resJson.candidates?.[0]?.content?.parts?.[0]?.text || '';
    const usage = resJson.usageMetadata || {};
    const outTokens = usage.candidatesTokenCount || 0;
    const tps = outTokens > 0 ? (outTokens / (latency / 1000)).toFixed(1) : 'N/A';

    return {
      ok: true,
      latency,
      text: rawText,
      promptTokens: usage.promptTokenCount || 0,
      candidatesTokens: outTokens,
      tps
    };
  } catch (err) {
    return { ok: false, latency: Date.now() - start, error: err.message };
  }
}

async function runBenchmark() {
  console.log('='.repeat(95));
  console.log('⚔️  DUEL KECERDASAN & KECEPATAN: GEMINI 3.7 FLASH vs GOOGLE GEMMA 4 31B (DEEP THINKING)');
  console.log(`Waktu: ${new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })} WIB`);
  console.log('='.repeat(95));

  const sysPersona = `Nama kamu adalah N.E.X.A, Asisten Eksekutif Digital Pribadi untuk Tuan Faqih Hidayatulloh (mahasiswa Sastra Arab UGM, calon beasiswa Jardine Oxford, calon diplomat). Gunakan gaya bicara elegan, hangat, santai tapi cerdas, panggil "Tuan Faqih" atau "Tuan".`;

  const tests = [
    {
      title: 'ROUND 1: RESPON TAKTIS DIPLOMASI (Tactical Advice & Reflex)',
      prompt: 'Nexa, singkat dalam 2-3 kalimat: apa prinsip terpenting bagi seorang diplomat saat menghadapi lawan negosiasi yang sengaja memotong pembicaraan dan merendahkan argumen kita?'
    },
    {
      title: 'ROUND 2: ANALISIS GEOPOLITIK & DIPLOMASI ARAB (BRICS+ & Petrodolar)',
      prompt: 'Bagaimana pergeseran dari hegemoni unipolar ke tatanan multipolar memengaruhi diplomasi bahasa Arab di panggung global, khususnya terkait petrodolar dan integrasi ekonomi BRICS+? Berikan analisis tajam dalam 2 paragraf padat.'
    },
    {
      title: 'ROUND 3: FORMULA STRATEGIS NON-BLOK (Third-Way Negotiation Framework)',
      prompt: 'Rancang formula negosiasi 3 pilar bagi negara berkembang agar bisa menerima investasi infrastruktur pelabuhan dari Adidaya X dan pinjaman lunak dari Adidaya Y tanpa terjerat "debt-trap" maupun kehilangan hak suara independen di PBB.'
    }
  ];

  for (let i = 0; i < tests.length; i++) {
    const t = tests[i];
    console.log('\n' + '═'.repeat(95));
    console.log(`📌 ${t.title}`);
    console.log(`💬 Prompt: "${t.prompt}"`);
    console.log('─'.repeat(95));

    // 1. GEMINI 3.7 FLASH
    process.stdout.write('  ⚡ Menembak Google Gemini 3.7 Flash... ');
    const res37 = await callGoogleApi(KEY_GEMINI, 'gemini-3.7-flash', t.prompt, sysPersona, 1000);
    if (res37.ok) {
      console.log(`✅ ${res37.latency}ms | ${res37.tps} tok/s | ${res37.candidatesTokens} tok`);
    } else {
      console.log(`❌ Gagal: ${res37.error}`);
    }

    await sleep(2500);

    // 2. GOOGLE GEMMA 4 31B (WITH DEEP THINKING)
    process.stdout.write('  🧠 Menembak Google Gemma 4 31B (Native Deep Thinking)... ');
    const resGemma = await callGoogleApi(KEY_GEMMA, 'gemma-4-31b-it', t.prompt, sysPersona, 1000);
    if (resGemma.ok) {
      console.log(`✅ ${resGemma.latency}ms | ${resGemma.tps} tok/s | ${resGemma.candidatesTokens} tok`);
    } else {
      console.log(`❌ Gagal: ${resGemma.error}`);
    }

    // PRINT COMPARISON BOXES
    console.log('\n┌' + '─'.repeat(93) + '┐');
    console.log(`│ ⚡ GEMINI 3.7 FLASH (${res37.latency || 0}ms):`.padEnd(94) + '│');
    console.log('├' + '─'.repeat(93) + '┤');
    console.log(res37.text?.trim() || '(kosong / error)');
    console.log('└' + '─'.repeat(93) + '┘');

    console.log('\n┌' + '─'.repeat(93) + '┐');
    console.log(`│ 🧠 GOOGLE GEMMA 4 31B (DEEP THINKING - ${resGemma.latency || 0}ms):`.padEnd(94) + '│');
    console.log('├' + '─'.repeat(93) + '┤');
    console.log(resGemma.text?.trim() || '(kosong / error)');
    console.log('└' + '─'.repeat(93) + '┘');

    await sleep(3500);
  }

  console.log('\n' + '='.repeat(95));
  console.log('🎉 DUEL LENGKAP SELESAI!');
  console.log('='.repeat(95));
}

runBenchmark().catch(console.error);
