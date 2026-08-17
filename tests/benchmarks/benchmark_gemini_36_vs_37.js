const dns = require('dns');
try { dns.setDefaultResultOrder('ipv4first'); } catch (e) {}

require('dotenv').config();
const env = require('./src/config/env.js');

const GOOGLE_KEY = env.GEMINI_API_KEY_1;

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function callGemini(modelName, prompt, systemInstruction = '', jsonMode = false, maxTokens = 800) {
  const start = Date.now();
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${GOOGLE_KEY}`;
  
  const body = {
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: 0.3,
      maxOutputTokens: maxTokens
    }
  };

  if (jsonMode) {
    body.generationConfig.responseMimeType = 'application/json';
  }

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
        modelName,
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
      modelName,
      latency,
      text: rawText,
      promptTokens: usage.promptTokenCount || 0,
      candidatesTokens: outTokens,
      tps
    };
  } catch (err) {
    return {
      ok: false,
      modelName,
      latency: Date.now() - start,
      error: err.message
    };
  }
}

async function runComparison() {
  console.log('='.repeat(90));
  console.log('⚔️  HEAD-TO-HEAD BENCHMARK: GOOGLE GEMINI 3.6 FLASH vs GEMINI 3.7 FLASH');
  console.log('='.repeat(90));
  console.log(`Waktu: ${new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })} WIB\n`);

  // -------------------------------------------------------------
  // TEST 1: KECEPATAN & LATENSI GENERASI KILAT
  // -------------------------------------------------------------
  console.log('📋 [TEST 1] UJI KECEPATAN & THROUGHPUT MURNI (Speed & Latency Test)');
  console.log('Prompt: "Tuliskan 3 prinsip kepemimpinan strategis dalam diplomasi internasional dalam 3 poin padat."');
  console.log('─'.repeat(90));

  const prompt1 = 'Tuliskan 3 prinsip kepemimpinan strategis dalam diplomasi internasional dalam 3 poin padat.';
  
  process.stdout.write('  1. Menembak Gemini 3.6 Flash... ');
  const m36_1 = await callGemini('gemini-3.6-flash', prompt1);
  if (m36_1.ok) console.log(`✅ ${m36_1.latency}ms (${m36_1.tps} tok/s, ${m36_1.candidatesTokens} tok)`);
  else console.log(`❌ Error: ${m36_1.error}`);

  await sleep(1000);

  process.stdout.write('  2. Menembak Gemini 3.7 Flash... ');
  const m37_1 = await callGemini('gemini-3.7-flash', prompt1);
  if (m37_1.ok) console.log(`✅ ${m37_1.latency}ms (${m37_1.tps} tok/s, ${m37_1.candidatesTokens} tok)`);
  else console.log(`❌ Error: ${m37_1.error}`);

  console.log('\n💬 --- Jawaban Gemini 3.6 Flash ---');
  console.log(m36_1.text?.trim() || '(kosong)');
  console.log('\n💬 --- Jawaban Gemini 3.7 Flash ---');
  console.log(m37_1.text?.trim() || '(kosong)');

  // -------------------------------------------------------------
  // TEST 2: KECERDASAN PENALARAN, LOGIKA & STRATEGI KOMPLEKS
  // -------------------------------------------------------------
  console.log('\n' + '='.repeat(90));
  console.log('📋 [TEST 2] UJI NALAR & KECERDASAN STRATEGIS (Complex Logic & Synthesis)');
  console.log('Prompt: Analisis dilema geopolitik Selat Malaka bagi Indonesia: integrasi ekonomi vs kedaulatan maritim.');
  console.log('─'.repeat(90));

  const promptLogic = `Berikan analisis strategis diplomasi: Bagaimana Indonesia harus menyeimbangkan keterbukaan jalur perdagangan internasional Selat Malaka dengan kedaulatan pengawasan maritim tanpa memicu eskalasi militer antar-negara adidaya? Uraikan dalam 2 paragraf analitis berbobot.`;

  process.stdout.write('  1. Menembak Gemini 3.6 Flash (Reasoning)... ');
  const m36_2 = await callGemini('gemini-3.6-flash', promptLogic);
  if (m36_2.ok) console.log(`✅ ${m36_2.latency}ms (${m36_2.tps} tok/s)`);
  else console.log(`❌ Error: ${m36_2.error}`);

  await sleep(1000);

  process.stdout.write('  2. Menembak Gemini 3.7 Flash (Reasoning)... ');
  const m37_2 = await callGemini('gemini-3.7-flash', promptLogic);
  if (m37_2.ok) console.log(`✅ ${m37_2.latency}ms (${m37_2.tps} tok/s)`);
  else console.log(`❌ Error: ${m37_2.error}`);

  console.log('\n🧠 --- Analisis Gemini 3.6 Flash ---');
  console.log(m36_2.text?.trim() || '(kosong)');
  console.log('\n🧠 --- Analisis Gemini 3.7 Flash ---');
  console.log(m37_2.text?.trim() || '(kosong)');

  // -------------------------------------------------------------
  // TEST 3: PERSONA EMPATI & KELUWESAN N.E.X.A
  // -------------------------------------------------------------
  console.log('\n' + '='.repeat(90));
  console.log('📋 [TEST 3] UJI PERSONA N.E.X.A (Warmth, Tone, & Executive Assistant Touch)');
  console.log('─'.repeat(90));

  const sysPersona = `Nama kamu adalah N.E.X.A, Asisten Eksekutif Digital Pribadi tingkat lanjut untuk Tuan Faqih Hidayatulloh (mahasiswa Sastra Arab UGM, calon beasiswa Jardine Oxford, calon diplomat). Gunakan gaya bicara elegan, hangat, santai tapi cerdas, panggil "Tuan Faqih" atau "Tuan", jangan kaku seperti robot.`;
  const promptPersona = `Nexa, tadi abis diskusi panjang sama dosen soal persiapan wawancara beasiswa... rasanya standarku masih jauh banget dibanding kandidat lain. Menurutmu gimana?`;

  process.stdout.write('  1. Menembak Gemini 3.6 Flash (Persona)... ');
  const m36_3 = await callGemini('gemini-3.6-flash', promptPersona, sysPersona);
  if (m36_3.ok) console.log(`✅ ${m36_3.latency}ms (${m36_3.tps} tok/s)`);
  else console.log(`❌ Error: ${m36_3.error}`);

  await sleep(1000);

  process.stdout.write('  2. Menembak Gemini 3.7 Flash (Persona)... ');
  const m37_3 = await callGemini('gemini-3.7-flash', promptPersona, sysPersona);
  if (m37_3.ok) console.log(`✅ ${m37_3.latency}ms (${m37_3.tps} tok/s)`);
  else console.log(`❌ Error: ${m37_3.error}`);

  console.log('\n💬 --- Respons Persona Gemini 3.6 Flash ---');
  console.log(m36_3.text?.trim() || '(kosong)');
  console.log('\n💬 --- Respons Persona Gemini 3.7 Flash ---');
  console.log(m37_3.text?.trim() || '(kosong)');

  // -------------------------------------------------------------
  // TEST 4: EKSTRAKSI DATA STRUKTUR JSON (Router Fidelity)
  // -------------------------------------------------------------
  console.log('\n' + '='.repeat(90));
  console.log('📋 [TEST 4] UJI EKSTRAKSI DATA JSON (Router Accuracy & JSON Schema)');
  console.log('─'.repeat(90));

  const sysJson = `You are N.E.X.A AI Router. Output strict JSON with schema: {"reasoning": string, "intent": string, "reply_message": string, "extracted_data": object}. Intent must be FINANCE.`;
  const promptJson = `Catat pengeluaran beli tiket kereta Taksaka Jogja-Gambir Rp 550.000 bayar pake QRIS Livin Mandiri buat jadwal berangkat tanggal 25 Agustus jam 08.00 pagi.`;

  process.stdout.write('  1. Menembak Gemini 3.6 Flash (JSON Mode)... ');
  const m36_4 = await callGemini('gemini-3.6-flash', promptJson, sysJson, true);
  if (m36_4.ok) console.log(`✅ ${m36_4.latency}ms`);
  else console.log(`❌ Error: ${m36_4.error}`);

  await sleep(1000);

  process.stdout.write('  2. Menembak Gemini 3.7 Flash (JSON Mode)... ');
  const m37_4 = await callGemini('gemini-3.7-flash', promptJson, sysJson, true);
  if (m37_4.ok) console.log(`✅ ${m37_4.latency}ms`);
  else console.log(`❌ Error: ${m37_4.error}`);

  console.log('\n📊 --- JSON Gemini 3.6 Flash ---');
  console.log(m36_4.text?.trim() || '(kosong)');
  console.log('\n📊 --- JSON Gemini 3.7 Flash ---');
  console.log(m37_4.text?.trim() || '(kosong)');

  // -------------------------------------------------------------
  // REKAPITULASI
  // -------------------------------------------------------------
  console.log('\n' + '='.repeat(90));
  console.log('🏆 REKAPITULASI BENCHMARK: GEMINI 3.6 FLASH vs GEMINI 3.7 FLASH');
  console.log('='.repeat(90));
  const avg36 = Math.round(((m36_1.latency||0) + (m36_2.latency||0) + (m36_3.latency||0) + (m36_4.latency||0))/4);
  const avg37 = Math.round(((m37_1.latency||0) + (m37_2.latency||0) + (m37_3.latency||0) + (m37_4.latency||0))/4);
  console.log(`• Rata-rata Latensi Gemini 3.6 Flash : ~${avg36}ms`);
  console.log(`• Rata-rata Latensi Gemini 3.7 Flash : ~${avg37}ms`);
  console.log('='.repeat(90));
}

runComparison().catch(console.error);
