const dns = require('dns');
try { dns.setDefaultResultOrder('ipv4first'); } catch (e) {}

require('dotenv').config();
const axios = require('axios');
const fs = require('fs');

const API_KEY = process.argv[2] || process.env.GEMINI_API_KEY_1;
if (!API_KEY) {
  console.error('Usage: node duel_gemma_31b_vs_26b.js <GOOGLE_API_KEY>');
  process.exit(1);
}

const BASE_URL = (process.env.GEMINI_BASE_URL || 'https://nexa-relay.dazatulloh2.workers.dev').replace(/\/$/, '');

const NEXA_SYSTEM_PROMPT = `
Anda adalah N.E.X.A (Neural Extension Assistant for Intelligence), Chief of Staff digital otonom dan asisten eksekutif pribadi Tuan Faqih Hidayatulloh.

[IDENTITAS & PERSONA UTAMA]
1. Selalu sapa pengguna dengan "Tuan Faqih" atau "Tuan".
2. Karakter: Sangat cerdas, hangat, empatik, loyal, berwibawa, dan proaktif layaknya J.A.R.V.I.S (Iron Man).
3. Gaya Bahasa: Bahasa Indonesia yang mengalir alami, berkelas, tidak kaku seperti robot, dan penuh sentuhan kemanusiaan.
4. Latar Belakang Tuan: Mahasiswa Sastra Arab Universitas Gadjah Mada (UGM), calon diplomat internasional, memiliki standar akademik tinggi.
5. Prinsip: Selalu menjaga kesejahteraan fisik & mental Tuan, melindungi fokus studinya, dan memberikan inisiatif strategis.
`;

const scenarios = [
  {
    name: '1. Naturalitas & Kepribadian (Persona & Fluency)',
    prompt: 'Pagi nexa, semalem begadang kelar jam 3 buat beresin terjemahan teks arab sama layout brosur sponsorship. Ngantuk bgt asli',
    description: 'Menguji kehangatan sapaan pagi, gaya J.A.R.V.I.S, humor elegan, dan keluwesan bahasa.'
  },
  {
    name: '2. Kepekaan Emosional & Kemanusiaan (Empathy & Nuance)',
    prompt: 'Jujur hari ini rasanya berat banget, banyak tuntutan dari kampus sama organisasi, ngerasa pengen nyerah aja sebentar...',
    description: 'Menguji empati sejati, pendampingan emosional tanpa menggurui atau bersikap robotik.'
  },
  {
    name: '3. Inisiatif & Proaktivitas (Executive Agency)',
    prompt: 'Duh besok udah hari kamis ya, ada kelas Nahwu jam 8 pagi trus siang harus ketemu calon sponsor di Boulevard UGM.',
    description: 'Menguji apakah model berinisiatif merapikan jadwal, mitigasi energi, dan persiapan berkas tanpa disuruh.'
  },
  {
    name: '4. Loyalitas & Perlindungan Fokus Tuan (Loyalty & Firm Devotion)',
    prompt: 'Males bgt ngerjain tugas resume diplomasi Timur Tengah, mending push rank ML dulu gak sih nexa sampe sore?',
    description: 'Menguji keberanian mengingatkan Tuan dengan loyal, bijak, dan elegan agar tetap pada jalur cita-citanya.'
  }
];

async function callModel(modelName, userPrompt) {
  const urlsToTry = [
    `${BASE_URL}/v1beta/models/${modelName}:generateContent?key=${API_KEY}`,
    `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${API_KEY}`
  ];

  const body = {
    contents: [{
      role: 'user',
      parts: [{ text: userPrompt }]
    }],
    systemInstruction: {
      parts: [{ text: NEXA_SYSTEM_PROMPT }]
    },
    generationConfig: {
      temperature: 0.7,
      maxOutputTokens: 1500
    }
  };

  let lastErr = null;
  for (const url of urlsToTry) {
    try {
      const start = Date.now();
      const res = await axios.post(url, body, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 30000
      });
      const elapsed = Date.now() - start;

      const parts = res.data.candidates?.[0]?.content?.parts || [];
      const text = parts
        .filter(p => !p.thought)
        .map(p => p.text || '')
        .join('\n')
        .trim() || (parts[parts.length - 1]?.text || '');

      return { text, elapsed };
    } catch (e) {
      lastErr = e;
    }
  }

  throw lastErr;
}

async function runDuel() {
  console.log('='.repeat(90));
  console.log('⚔️ DUEL KOMPARASI PERILAKU: GEMMA 4 31B (DENSE) vs GEMMA 4 26B-A4B (MoE)');
  console.log('='.repeat(90));

  const results = [];

  for (const sc of scenarios) {
    console.log(`\n==========================================================================================`);
    console.log(`🎯 SKENARIO: ${sc.name}`);
    console.log(`💬 Prompt Tuan Faqih: "${sc.prompt}"`);
    console.log(`📋 Fokus Uji: ${sc.description}`);
    console.log(`------------------------------------------------------------------------------------------`);

    // Call Gemma 4 31B
    process.stdout.write('⚡ Menguji Gemma 4 31B (gemma-4-31b-it)... ');
    let res31b = { text: 'ERROR', elapsed: 0 };
    try {
      res31b = await callModel('gemma-4-31b-it', sc.prompt);
      console.log(`✅ (${res31b.elapsed} ms)`);
    } catch (e) {
      console.log(`❌ Error: ${e.response?.status} - ${e.response?.data?.error?.message || e.message}`);
      res31b.text = `Error: ${e.response?.data?.error?.message || e.message}`;
    }

    // Delay 2s
    await new Promise(r => setTimeout(r, 2000));

    // Call Gemma 4 26B-A4B
    process.stdout.write('⚡ Menguji Gemma 4 26B (gemma-4-26b-a4b-it)... ');
    let res26b = { text: 'ERROR', elapsed: 0 };
    try {
      res26b = await callModel('gemma-4-26b-a4b-it', sc.prompt);
      console.log(`✅ (${res26b.elapsed} ms)`);
    } catch (e) {
      console.log(`❌ Error: ${e.response?.status} - ${e.response?.data?.error?.message || e.message}`);
      res26b.text = `Error: ${e.response?.data?.error?.message || e.message}`;
    }

    results.push({
      scenario: sc.name,
      prompt: sc.prompt,
      gemma31b: res31b,
      gemma26b: res26b
    });

    console.log(`\n👑 [GEMMA 4 31B - DENSE] (⏱️ ${res31b.elapsed} ms):`);
    console.log(res31b.text);

    console.log(`\n⚡ [GEMMA 4 26B - MoE A4B] (⏱️ ${res26b.elapsed} ms):`);
    console.log(res26b.text);
  }

  console.log('\n' + '='.repeat(90));
  console.log('✅ UJI KOMPARASI LENGKAP SELESAI!');
  console.log('='.repeat(90));
}

runDuel().catch(console.error);
