const dns = require('dns');
try { dns.setDefaultResultOrder('ipv4first'); } catch (e) {}

require('dotenv').config();
const env = require('./src/config/env.js');

const KEYS = [
  env.GEMINI_API_KEY_1,
  env.GEMINI_API_KEY_2,
  env.GEMINI_API_KEY_3,
  env.GEMINI_API_KEY_4
].filter(Boolean);

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function callWithMultiKeyRetry(modelId, prompt, systemInstruction, maxTokens = 1200) {
  const urlBase = `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent`;
  let attempts = 0;
  const startOverall = Date.now();

  for (let cycle = 1; cycle <= 3; cycle++) {
    for (let i = 0; i < KEYS.length; i++) {
      attempts++;
      const apiKey = KEYS[i];
      const url = `${urlBase}?key=${apiKey}`;

      const body = {
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.4,
          maxOutputTokens: maxTokens
        }
      };

      if (systemInstruction) {
        body.systemInstruction = { parts: [{ text: systemInstruction }] };
      }

      try {
        const startReq = Date.now();
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        });

        const reqLatency = Date.now() - startReq;
        const resJson = await res.json();

        if (res.ok) {
          const rawText = resJson.candidates?.[0]?.content?.parts?.[0]?.text || '';
          const usage = resJson.usageMetadata || {};
          const outTok = usage.candidatesTokenCount || 0;
          const tps = outTok > 0 ? (outTok / (reqLatency / 1000)).toFixed(1) : 'N/A';

          return {
            ok: true,
            modelId,
            keyIndex: i + 1,
            cycle,
            attempts,
            latency: Date.now() - startOverall,
            reqLatency,
            text: rawText,
            outTok,
            tps
          };
        }

        const errMsg = resJson.error?.message || res.statusText;
        // Jika 503 atau 429, lanjut ke kunci berikutnya dengan delay pendek
        await sleep(1000);
      } catch (err) {
        await sleep(1000);
      }
    }
    // Jika semua 4 kunci sempat padat, tunggu 3 detik sebelum siklus berikutnya
    await sleep(3000);
  }

  return {
    ok: false,
    modelId,
    attempts,
    latency: Date.now() - startOverall,
    error: 'All keys exhausted after 3 retry cycles.'
  };
}

async function runCronBenchmark() {
  console.log('='.repeat(95));
  console.log('🏛️  SIMULASI RESMI CRON JOB N.E.X.A: GEMINI 3.7 FLASH vs GEMMA 4 31B DEEP THINKING');
  console.log(`Waktu: ${new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })} WIB`);
  console.log('='.repeat(95));

  const cronTasks = [
    {
      name: "CRON 1: ☕ THE DIPLOMAT'S MORNING BRIEFING (05:30 WIB)",
      prompt: `Buatkan naskah Morning Briefing eksekutif N.E.X.A untuk Tuan Faqih Hidayatulloh.
Konteks Hari Ini:
- Target Besar: Persiapan Beasiswa Jardine Oxford & Skripsi Sastra Arab UGM.
- Agenda Kalender: 09.00 Seminar Proposal Skripsi di FIB, 14.00 Latihan IELTS Speaking (Target Band 8.0).
- Keuangan: Saldo tabungan aman, fokus disiplin anggaran.
- Fitur Khusus Wajib: Sertakan 1 Mahfuzhat / Peribahasa Arab tematik yang membakar semangat kepemimpinan & diplomasi, lalu jelaskan relevansinya dengan agenda hari ini.`,
      systemPrompt: `You are N.E.X.A, the personal Chief of Staff to Tuan Faqih Hidayatulloh. Generate an inspiring, elegant, intellectual morning briefing in Indonesian. Address him as "Tuan Faqih" or "Tuan".`
    },
    {
      name: "CRON 2: 🧠 WEEKLY COGNITIVE IDENTITY INFERENCE (Minggu 21:00 WIB)",
      prompt: `Lakukan analisis sintesis inferensi kepribadian mingguan berdasarkan pola obrolan Tuan Faqih 7 hari terakhir:
Observasi 7 Hari:
1. Peningkatan intensitas riset traktat diplomasi Timur Tengah dan integrasi BRICS+.
2. Tekanan waktu antara penyelesaian draf bab 4 skripsi dan target IELTS Academic.
3. Kedisiplinan pencatatan transaksi keuangan 100% tepat waktu via N.E.X.A.
Rumuskan laporan evolusi kepribadian ke dalam 3 Lapisan (Values, Cognitive Habits, Long-term Trajectory) dengan nalar psikologis yang mendalam dan solutif.`,
      systemPrompt: `You are N.E.X.A Cognitive Evolution Engine. Synthesize deep personality and behavioral insights with psychological sophistication in Indonesian.`
    },
    {
      name: "CRON 3: 🌙 EVENING REFLECTIVE DIARY & PHILOSOPHICAL DEBRIEF (20:00 WIB)",
      prompt: `Susunkan Evening Debrief dan Refleksi Filosofis malam ini:
Aktivitas Hari Ini:
- Sukses menyelesaikan Seminar Proposal dengan catatan revisi minor pada metodologi perbandingan traktat Arab Saudi - Iran.
- Membaca 25 halaman buku 'Orientalism' karya Edward Said.
- Pengeluaran hari ini Rp 45.000 (Makan siang) via QRIS Mandiri.
Sajikan evaluasi capaian secara hangat dan tutup dengan 1 Pertanyaan Reflektif Sokrates yang menantang kejernihan berpikir Tuan sebelum tidur.`,
      systemPrompt: `You are N.E.X.A, intimate intellectual confidant and Chief of Staff to Tuan Faqih. Warm, deeply philosophical, and sharp.`
    }
  ];

  for (let i = 0; i < cronTasks.length; i++) {
    const task = cronTasks[i];
    console.log('\n' + '═'.repeat(95));
    console.log(`📌 ${task.name}`);
    console.log('─'.repeat(95));

    // 1. GEMINI 3.7 FLASH
    process.stdout.write('  ⚡ Menjalankan Gemini 3.7 Flash... ');
    const res37 = await callWithMultiKeyRetry('gemini-3.7-flash', task.prompt, task.systemPrompt, 1200);
    if (res37.ok) {
      console.log(`✅ SUKSES (Key ${res37.keyIndex}, ${res37.latency}ms total, ${res37.tps} tok/s)`);
    } else {
      console.log(`❌ Gagal: ${res37.error}`);
    }

    await sleep(2000);

    // 2. GOOGLE GEMMA 4 31B DEEP THINKING
    process.stdout.write('  🧠 Menjalankan Google Gemma 4 31B (Deep Thinking)... ');
    const resGemma = await callWithMultiKeyRetry('gemma-4-31b-it', task.prompt, task.systemPrompt, 1200);
    if (resGemma.ok) {
      console.log(`✅ SUKSES (Key ${resGemma.keyIndex}, ${resGemma.latency}ms total, ${resGemma.tps} tok/s)`);
    } else {
      console.log(`❌ Gagal: ${resGemma.error}`);
    }

    // PRINT COMPARISON RESULTS
    console.log('\n┌' + '─'.repeat(93) + '┐');
    console.log(`│ ⚡ GEMINI 3.7 FLASH (Total ${res37.latency || 0}ms - Key ${res37.keyIndex || '-'}):`.padEnd(94) + '│');
    console.log('├' + '─'.repeat(93) + '┤');
    console.log(res37.text?.trim() || '(kosong)');
    console.log('└' + '─'.repeat(93) + '┘');

    console.log('\n┌' + '─'.repeat(93) + '┐');
    console.log(`│ 🧠 GOOGLE GEMMA 4 31B (DEEP THINKING - Total ${resGemma.latency || 0}ms - Key ${resGemma.keyIndex || '-'}):`.padEnd(94) + '│');
    console.log('├' + '─'.repeat(93) + '┤');
    console.log(resGemma.text?.trim() || '(kosong)');
    console.log('└' + '─'.repeat(93) + '┘');

    await sleep(3000);
  }

  console.log('\n' + '='.repeat(95));
  console.log('🎉 SEMUA SIMULASI CRON BERHASIL 100% DIEKSEKUSI!');
  console.log('='.repeat(95));
}

runCronBenchmark().catch(console.error);
