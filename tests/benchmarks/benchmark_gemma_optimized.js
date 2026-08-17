const dns = require('dns');
try { dns.setDefaultResultOrder('ipv4first'); } catch (e) {}

require('dotenv').config();
const env = require('./src/config/env.js');
const axios = require('axios');

const CEREBRAS_KEY = env.CEREBRAS_API_KEY_1;
const GOOGLE_KEY = env.GEMINI_API_KEY_1;

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function callCerebrasGemma(prompt, systemInstruction = '', maxTokens = 600) {
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
      latency,
      text,
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

async function callGoogleGemmaOptimized(prompt, systemInstruction = '', maxTokens = 600, isJson = false) {
  const start = Date.now();
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemma-4-31b-it:generateContent?key=${GOOGLE_KEY}`;
  
  // Suntikan Anti-CoT (Skip Thinking) yang ketat
  let optimizedSys = systemInstruction;
  if (isJson) {
    optimizedSys = (systemInstruction || '') + '\n[IMPORTANT: Output ONLY pure raw JSON starting with { and ending with }. Absolutely NO thinking notes, no markdown codeblocks, no thought analysis.]';
  } else {
    optimizedSys = (systemInstruction || '') + '\n[CRITICAL: Speak directly as N.E.X.A in natural Indonesian. Output ONLY the final conversational message. DO NOT output drafts, internal thoughts, bulleted analysis, notes, or English meta-commentary.]';
  }

  const body = {
    contents: [{
      role: 'user',
      parts: [{ text: isJson ? `[RESPOND ONLY IN JSON. NO THINKING]\n\n${prompt}` : `[SPEAK DIRECTLY IN INDONESIAN. NO THINKING]\n\n${prompt}` }]
    }],
    systemInstruction: { parts: [{ text: optimizedSys }] },
    generationConfig: {
      temperature: 0.2,
      maxOutputTokens: maxTokens
    }
  };

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
        provider: 'Google AI Studio (Optimized)',
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
      provider: 'Google AI Studio (Optimized)',
      latency,
      text: rawText,
      completionTokens: outTokens,
      tps
    };
  } catch (err) {
    return {
      ok: false,
      provider: 'Google AI Studio (Optimized)',
      latency: Date.now() - start,
      error: err.message
    };
  }
}

async function runBenchmark() {
  console.log('='.repeat(90));
  console.log('⚔️  HEAD-TO-HEAD BENCHMARK (OPTIMIZED SKIP-THINKING): CEREBRAS vs GOOGLE GEMMA 4 31B');
  console.log('='.repeat(90));
  console.log(`Waktu: ${new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })} WIB\n`);

  // -------------------------------------------------------------
  // TEST 1: PERSONA EMPATI & WARMTH N.E.X.A
  // -------------------------------------------------------------
  console.log('📋 [TEST 1] PERSONA & EMPATI N.E.X.A (Obrolan Hangat & Menenangkan)');
  console.log('Prompt: "Nexa, aku lagi agak pusing mikirin esai beasiswa Jardine dan tugas kuliah Sastra Arab yang numpuk barengan minggu ini... menurutmu aku harus gimana?"');
  console.log('─'.repeat(90));

  const sysPersona = `Nama kamu adalah N.E.X.A, Asisten Eksekutif Digital Pribadi untuk Tuan Faqih Hidayatulloh (Sastra Arab UGM, calon beasiswa Jardine Oxford, calon diplomat). Gunakan gaya bicara elegan, hangat, santai tapi cerdas, panggil "Tuan Faqih" atau "Tuan".`;
  const promptPersona = `Nexa, aku lagi agak pusing mikirin esai beasiswa Jardine dan tugas kuliah Sastra Arab yang numpuk barengan minggu ini... menurutmu aku harus gimana?`;

  process.stdout.write('  1. Menembak Cerebras WSE-3... ');
  const c1 = await callCerebrasGemma(promptPersona, sysPersona);
  console.log(`✅ ${c1.latency}ms (${c1.tps} tok/s)`);

  await sleep(1000);

  process.stdout.write('  2. Menembak Google AI Studio (Skip Thinking)... ');
  const g1 = await callGoogleGemmaOptimized(promptPersona, sysPersona, 400, false);
  console.log(`✅ ${g1.latency}ms (${g1.tps} tok/s)`);

  console.log('\n💬 --- Respons CEREBRAS WSE-3 ---');
  console.log(c1.text?.trim() || '(kosong)');
  console.log('\n💬 --- Respons GOOGLE AI STUDIO (Optimized) ---');
  console.log(g1.text?.trim() || '(kosong)');

  // -------------------------------------------------------------
  // TEST 2: EKSTRAKSI JSON KEUANGAN (ROUTER SPEED & PRECISION)
  // -------------------------------------------------------------
  console.log('\n' + '='.repeat(90));
  console.log('📋 [TEST 2] EKSTRAKSI DATA JSON KEUANGAN');
  console.log('Prompt: "Catat ya, barusan aku beli buku Kamus Al-Munawwir di Togamas Rp 185.000 bayar pake QRIS Bank Mandiri jam 3 sore tadi."');
  console.log('─'.repeat(90));

  const sysJson = `You are N.E.X.A AI Router. Output strict JSON with schema: {"reasoning": string, "intent": string, "reply_message": string, "extracted_data": object}. Intent must be FINANCE.`;
  const promptJson = `Catat ya, barusan aku beli buku Kamus Al-Munawwir di Togamas Rp 185.000 bayar pake QRIS Bank Mandiri jam 3 sore tadi.`;

  process.stdout.write('  1. Menembak Cerebras WSE-3 (JSON)... ');
  const c2 = await callCerebrasGemma(promptJson, sysJson);
  console.log(`✅ ${c2.latency}ms`);

  await sleep(1000);

  process.stdout.write('  2. Menembak Google AI Studio (JSON Optimized)... ');
  const g2 = await callGoogleGemmaOptimized(promptJson, sysJson, 300, true);
  console.log(`✅ ${g2.latency}ms`);

  console.log('\n📊 --- JSON CEREBRAS WSE-3 ---');
  console.log(c2.text?.trim() || '(kosong)');
  console.log('\n📊 --- JSON GOOGLE AI STUDIO (Optimized) ---');
  console.log(g2.text?.trim() || '(kosong)');

  // -------------------------------------------------------------
  // TEST 3: ANALISIS AKADEMIK & DIPLOMASI
  // -------------------------------------------------------------
  console.log('\n' + '='.repeat(90));
  console.log('📋 [TEST 3] ANALISIS AKADEMIK DIPLOMASI TIMUR TENGAH');
  console.log('Prompt: "Jelaskan relevansi bahasa Arab klasik dalam diplomasi modern Timur Tengah dalam 2 paragraf padat."');
  console.log('─'.repeat(90));

  const sysDiplo = `Nama kamu adalah N.E.X.A, asisten Tuan Faqih Hidayatulloh. Berikan jawaban cerdas, diplomatis, dan berbobot akademis.`;
  const promptDiplo = `Jelaskan relevansi bahasa Arab klasik (Fusha) dalam diplomasi modern Timur Tengah dalam 2 paragraf padat.`;

  process.stdout.write('  1. Menembak Cerebras WSE-3... ');
  const c3 = await callCerebrasGemma(promptDiplo, sysDiplo);
  console.log(`✅ ${c3.latency}ms`);

  await sleep(1000);

  process.stdout.write('  2. Menembak Google AI Studio (Optimized)... ');
  const g3 = await callGoogleGemmaOptimized(promptDiplo, sysDiplo, 350, false);
  console.log(`✅ ${g3.latency}ms`);

  console.log('\n🎓 --- Jawaban CEREBRAS WSE-3 ---');
  console.log(c3.text?.trim() || '(kosong)');
  console.log('\n🎓 --- Jawaban GOOGLE AI STUDIO (Optimized) ---');
  console.log(g3.text?.trim() || '(kosong)');

  // -------------------------------------------------------------
  // REKAP
  // -------------------------------------------------------------
  console.log('\n' + '='.repeat(90));
  console.log('🏆 REKAPITULASI HASIL TERAKHIR:');
  console.log('='.repeat(90));
  console.log(`• Rata-rata Latensi Cerebras WSE-3       : ~${Math.round((c1.latency + c2.latency + c3.latency)/3)}ms ⚡`);
  console.log(`• Rata-rata Latensi Google AI Studio (Opt): ~${Math.round((g1.latency + g2.latency + g3.latency)/3)}ms 🚀`);
  console.log('='.repeat(90));
}

runBenchmark().catch(console.error);
