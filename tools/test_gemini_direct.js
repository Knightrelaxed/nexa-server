require('dotenv').config();
const { GoogleGenerativeAI } = require('@google/generative-ai');

async function testGeminiKey(keyName, apiKey, modelName) {
  if (!apiKey) {
    console.log(`[SKIP] ${keyName}: Key not found in .env`);
    return;
  }
  console.log(`\n=== Testing ${keyName} (${modelName}) ===`);
  try {
    const client = new GoogleGenerativeAI(apiKey);
    const model = client.getGenerativeModel({
      model: modelName,
      systemInstruction: 'Anda adalah asisten singkat.',
      generationConfig: { temperature: 0.1 }
    });

    const startTime = Date.now();
    const result = await model.generateContent('Jawab 1 kalimat dalam bahasa Indonesia: Apakah sistem model Gemini kamu berfungsi normal saat ini?');
    const responseText = result.response.text();
    const duration = Date.now() - startTime;
    console.log(`[SUCCESS] (${duration}ms) Response:`, responseText.trim());
  } catch (error) {
    const msg = error.message || JSON.stringify(error);
    console.error(`[ERROR] ${msg.substring(0, 300)}`);
  }
}

async function runGeminiTests() {
  console.log("=== MEMULAI SANDBOX TESTING GEMINI API KEYS ===");
  await testGeminiKey("GEMINI_API_KEY_1 (Tier 5)", process.env.GEMINI_API_KEY_1, "gemini-2.5-flash");
  await testGeminiKey("GEMINI_API_KEY_2 (Tier 6)", process.env.GEMINI_API_KEY_2, "gemini-2.5-flash");
  await testGeminiKey("GEMINI_API_KEY_3 (Tier 8)", process.env.GEMINI_API_KEY_3, "gemini-2.5-flash");
  await testGeminiKey("GEMINI_API_KEY_4 (Tier 9)", process.env.GEMINI_API_KEY_4, "gemini-2.5-flash");
  console.log("\n=== SELESAI ===");
}

runGeminiTests();
