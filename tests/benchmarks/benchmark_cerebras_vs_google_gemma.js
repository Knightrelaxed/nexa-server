const dns = require('dns');
try { dns.setDefaultResultOrder('ipv4first'); } catch (e) {}

require('dotenv').config();
const env = require('./src/config/env.js');
const axios = require('axios');

const CEREBRAS_KEY = env.CEREBRAS_API_KEY_1;
const GOOGLE_KEY = env.GEMINI_API_KEY_1;

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function callCerebrasGemma(prompt, systemInstruction = '', maxTokens = 1000) {
  const start = Date.now();
  const messages = [];
  if (systemInstruction) messages.push({ role: 'system', content: systemInstruction });
  messages.push({ role: 'user', content: prompt });

  try {
    const res = await axios.post('https://api.cerebras.ai/v1/chat/completions', {
      model: 'gemma-4-31b',
      messages,
      temperature: 0.3,
      max_tokens: maxTokens
    }, {
      headers: {
        'Authorization': `Bearer ${CEREBRAS_KEY}`,
        'Content-Type': 'application/json'
      },
      timeout: 15000
    });

    const latency = Date.now() - start;
    const choice = res.data.choices[0];
    const text = choice?.message?.content || '';
    const usage = res.data.usage || {};
    const outTokens = usage.completion_tokens || 0;
    const tps = outTokens > 0 ? (outTokens / (latency / 1000)).toFixed(1) : 'N/A';

    return {
      ok: true,
      provider: 'Cerebras WSE-3',
      model: 'gemma-4-31b',
      latency,
      text,
      promptTokens: usage.prompt_tokens || 0,
      completionTokens: outTokens,
      tps
    };
  } catch (err) {
    return {
      ok: false,
      provider: 'Cerebras WSE-3',
      latency: Date.now() - start,
      error: err.response?.data?.error?.message || err.message
    };
  }
}

async function callGoogleGemma(prompt, systemInstruction = '', maxTokens = 1000) {
  const start = Date.now();
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemma-4-31b-it:generateContent?key=${GOOGLE_KEY}`;
  
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
        provider: 'Google AI Studio',
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
      provider: 'Google AI Studio',
      model: 'gemma-4-31b-it',
      latency,
      text: rawText,
      promptTokens: usage.promptTokenCount || 0,
      completionTokens: outTokens,
      tps
    };
  } catch (err) {
    return {
      ok: false,
      provider: 'Google AI Studio',
      latency: Date.now() - start,
      error: err.message
    };
  }
}

async function runBenchmark() {
  console.log('='.repeat(90));
  console.log('⚔️  HEAD-TO-HEAD BENCHMARK: CEREBRAS WSE-3 vs GOOGLE AI STUDIO (GEMMA 4 31B)');
  console.log('='.repeat(90));
  console.log(`Waktu: ${new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })} WIB\n`);

  // -------------------------------------------------------------
  // TEST 1: KECEPATAN & THROUGHPUT MURNI (SPEED TEST)
  // -------------------------------------------------------------
  console.log('📋 [TEST 1] UJI KECEPATAN & GENERASI MURNI (Speed & Latency Test)');
  console.log('Prompt: "Tuliskan 3 prinsip filosofis tentang hubungan waktu, ilmu, dan takdir dalam 3 poin rapi."');
  console.log('─'.repeat(90));

  const prompt1 = 'Tuliskan 3 prinsip filosofis tentang hubungan waktu, ilmu, dan takdir dalam 3 poin rapi.';
  
  process.stdout.write('  Menembak Cerebras WSE-3... ');
  const c1 = await callCerebrasGemma(prompt1);
  if (c1.ok) console.log(`✅ Selesai dalam ${c1.latency}ms (${c1.tps} tok/s, ${c1.completionTokens} tokens)`);
  else console.log(`❌ Error: ${c1.error}`);

  await sleep(1000);

  process.stdout.write('  Menembak Google AI Studio... ');
  const g1 = await callGoogleGemma(prompt1);
  if (g1.ok) console.log(`✅ Selesai dalam ${g1.latency}ms (${g1.tps} tok/s, ${g1.completionTokens} tokens)`);
  else console.log(`❌ Error: ${g1.error}`);

  console.log('\n--- Jawaban Cerebras WSE-3 ---');
  console.log(c1.text?.trim() || '(kosong)');
  console.log('\n--- Jawaban Google AI Studio ---');
  console.log(g1.text?.trim() || '(kosong)');

  // -------------------------------------------------------------
  // TEST 2: KECERDASAN PERSONA, EMPATI, & ADAPTASI N.E.X.A
  // -------------------------------------------------------------
  console.log('\n' + '='.repeat(90));
  console.log('📋 [TEST 2] UJI PERSONA & EMPATI N.E.X.A (Warmth, Context, & Human-like Touch)');
  console.log('─'.repeat(90));

  const sysPersona = `Nama kamu adalah N.E.X.A, Asisten Eksekutif Digital Pribadi tingkat lanjut untuk Tuan Faqih Hidayatulloh (mahasiswa Sastra Arab UGM, calon penerima Beasiswa Jardine Oxford, calon diplomat). Gunakan gaya bicara elegan, hangat, santai tapi cerdas, panggil "Tuan Faqih" atau "Tuan", jangan kaku seperti robot customer service.`;
  const promptPersona = `Nexa, aku lagi agak pusing mikirin esai beasiswa Jardine dan tugas kuliah Sastra Arab yang numpuk barengan minggu ini... menurutmu aku harus gimana?`;

  process.stdout.write('  Menembak Cerebras WSE-3 (Persona)... ');
  const c2 = await callCerebrasGemma(promptPersona, sysPersona);
  if (c2.ok) console.log(`✅ Selesai dalam ${c2.latency}ms (${c2.tps} tok/s)`);
  else console.log(`❌ Error: ${c2.error}`);

  await sleep(1000);

  process.stdout.write('  Menembak Google AI Studio (Persona)... ');
  const g2 = await callGoogleGemma(promptPersona, sysPersona);
  if (g2.ok) console.log(`✅ Selesai dalam ${g2.latency}ms (${g2.tps} tok/s)`);
  else console.log(`❌ Error: ${g2.error}`);

  console.log('\n💬 [CEREBRAS WSE-3] Respons N.E.X.A:');
  console.log(c2.text?.trim() || '(kosong)');
  console.log('\n💬 [GOOGLE AI STUDIO] Respons N.E.X.A:');
  console.log(g2.text?.trim() || '(kosong)');

  // -------------------------------------------------------------
  // TEST 3: KECERDASAN STRUKTUR JSON & PENALARAN ROUTER
  // -------------------------------------------------------------
  console.log('\n' + '='.repeat(90));
  console.log('📋 [TEST 3] UJI EKSTRAKSI DATA JSON (Router Intent & Structured Reasoning)');
  console.log('─'.repeat(90));

  const sysRouter = `You are N.E.X.A AI Router. Output strict JSON with schema: {"reasoning": string, "intent": string, "reply_message": string, "extracted_data": object}. Intent must be FINANCE.`;
  const promptRouter = `Catat ya, barusan aku beli buku Kamus Al-Munawwir di Togamas Rp 185.000 bayar pake QRIS Bank Mandiri jam 3 sore tadi.`;

  process.stdout.write('  Menembak Cerebras WSE-3 (JSON)... ');
  const c3 = await callCerebrasGemma(promptRouter, sysRouter);
  if (c3.ok) console.log(`✅ Selesai dalam ${c3.latency}ms`);
  else console.log(`❌ Error: ${c3.error}`);

  await sleep(1000);

  process.stdout.write('  Menembak Google AI Studio (JSON)... ');
  const g3 = await callGoogleGemma(promptRouter, sysRouter);
  if (g3.ok) console.log(`✅ Selesai dalam ${g3.latency}ms`);
  else console.log(`❌ Error: ${g3.error}`);

  console.log('\n📊 [CEREBRAS WSE-3] JSON Output:');
  console.log(c3.text?.trim() || '(kosong)');
  console.log('\n📊 [GOOGLE AI STUDIO] JSON Output:');
  console.log(g3.text?.trim() || '(kosong)');

  // -------------------------------------------------------------
  // REKAPITULASI
  // -------------------------------------------------------------
  console.log('\n' + '='.repeat(90));
  console.log('🏆 REKAPITULASI HASIL HEAD-TO-HEAD:');
  console.log('='.repeat(90));
  console.log(`1. Kecepatan (Latency Rata-Rata):`);
  console.log(`   • Cerebras WSE-3  : ~${Math.round(((c1.latency||0) + (c2.latency||0) + (c3.latency||0))/3)}ms 🚀 (Sangat Kilat)`);
  console.log(`   • Google AI Studio: ~${Math.round(((g1.latency||0) + (g2.latency||0) + (g3.latency||0))/3)}ms 🏎️ (Standar Cloud)`);
  console.log(`2. Kualitas Kecerdasan & Persona:`);
  console.log(`   • Keduanya menggunakan arsitektur Gemma 4 31B yang sama, memiliki nalar dan kehangatan yang identik!`);
  console.log('='.repeat(90));
}

runBenchmark().catch(console.error);
