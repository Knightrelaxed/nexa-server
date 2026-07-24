require('dotenv').config();
const { executeWithFallback } = require('../src/core/Fallback_Engine');

async function runBenchmarkScenario(name, userPrompt, contextSize, jsonMode, forceHeavy = false) {
  console.log(`\n====================================================`);
  console.log(`🧪 TESTING SCENARIO: ${name}`);
  console.log(`====================================================`);

  const baseInstruction = `
Kamu adalah N.E.X.A (Neural Executive Assistant), AI personal assistant tingkat lanjut milik Tuan Faqih.
Selalu bersikap proaktif, sopan, cerdas, dan presisi. Jawab dengan ramah dan lugas.
  `;
  
  const sampleSystemInstruction = baseInstruction + `\n[MEMORI KONTEKS AKTIF]: ` + "Data konteks riwayat percakapan dan memori N.E.X.A. ".repeat(Math.ceil(contextSize / 50));

  const sysCharCount = sampleSystemInstruction.length;
  const userCharCount = userPrompt.length;
  const totalPromptChars = sysCharCount + userCharCount;
  
  const totalEstInputTokens = Math.round(totalPromptChars / 4);

  console.log(`📊 INPUT PAYLOAD:`);
  console.log(` - System Context : ${sysCharCount.toLocaleString()} karakter`);
  console.log(` - User Message    : ${userCharCount.toLocaleString()} karakter`);
  console.log(` - TOTAL PROMPT    : ${totalPromptChars.toLocaleString()} karakter (~${totalEstInputTokens.toLocaleString()} token)`);

  const startTime = Date.now();
  try {
    const response = await executeWithFallback(
      userPrompt,
      sampleSystemInstruction,
      0.3,
      jsonMode, // jsonMode according to chat type
      { forceHeavy }
    );

    const endTime = Date.now();
    const durationMs = endTime - startTime;
    const durationSec = (durationMs / 1000).toFixed(2);

    const responseCharCount = response ? response.length : 0;
    const responseEstTokens = Math.round(responseCharCount / 4);

    console.log(`\n📈 RESULTS FOR [${name}]:`);
    console.log(` ⏱️ Duration          : ${durationMs} ms (${durationSec} detik)`);
    console.log(` 📝 Response Output   : ${responseCharCount.toLocaleString()} karakter (~${responseEstTokens.toLocaleString()} token)`);
    console.log(` 🔄 Total Round-Trip  : ~${(totalEstInputTokens + responseEstTokens).toLocaleString()} token`);
    console.log(` 🚀 Speed Throughput  : ~${Math.round(responseEstTokens / (durationMs / 1000))} token/detik`);
    return { name, durationMs, totalPromptChars, totalEstInputTokens, responseEstTokens };
  } catch (err) {
    console.error(`❌ Scenario ${name} failed:`, err.message);
    return null;
  }
}

async function runAllBenchmarks() {
  console.log('🚀 STARTING ACCURATE MULTI-SCENARIO CHAT BENCHMARK');

  const r1 = await runBenchmarkScenario(
    'Skenario 1: Chat Teks Harian (LIGHT Mode - Plain Text)',
    'Halo N.E.X.A, bagaimana kondisi sistem malam ini?',
    1500,
    false, // Plain text output mode (NORMAL_CHAT)
    false
  );

  const r2 = await runBenchmarkScenario(
    'Skenario 2: Query Kalender/Tugas (LIGHT Mode - Plain Text)',
    'Tolong berikan laporan ringkas persiapan agenda terdekat dan daftar tugas saya.',
    8000,
    false, // Plain text output mode
    false
  );

  const r3 = await runBenchmarkScenario(
    'Skenario 3: Analisis Mendalam (HEAVY Mode - Gemini 3.6 Flash)',
    'Tolong berikan analisis mendalam dan evaluasi strategis mengenai efisiensi arsitektur N.E.X.A.',
    25000,
    false,
    true
  );

  console.log('\n====================================================');
  console.log('📋 ACCURATE BENCHMARK SUMMARY TABLE');
  console.log('====================================================');
  const results = [r1, r2, r3].filter(Boolean);
  results.forEach((r) => {
    console.log(`- ${r.name.padEnd(55)} | Payload: ${r.totalPromptChars.toLocaleString()} chars (~${r.totalEstInputTokens} tokens) | Time: ${r.durationMs}ms (${(r.durationMs/1000).toFixed(2)}s)`);
  });
  console.log('====================================================\n');
}

runAllBenchmarks();
