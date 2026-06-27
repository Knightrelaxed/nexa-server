require('dotenv').config();
const logger = require('../src/utils/logger');
const aiRouter = require('../src/core/AI_Router');

async function runTest() {
  console.log("=== MEMULAI TESTING DIAGNOSE_SYSTEM ===");
  
  // 1. Simulasikan sistem sedang berjalan (Normal/Tanpa Error)
  console.log("[SERVER] N.E.X.A Engine v2.0 started on port 3000");
  console.log("[TELEGRAM] Received webhook message: 'buatkan jadwal rapat besok'");
  console.log("[ROUTER] Intent identified: CALENDAR_CREATE");
  console.log("[CALENDAR] Checking Google Calendar for conflicts tomorrow...");
  console.log("[CALENDAR] Free slot found. Creating event: Rapat");
  console.log("[SUPABASE] Saving conversation context to short-term memory.");

  // 2. Simulasikan user bertanya santai
  const userQuestion = "Nex, kamu lagi ngerjain apa di belakang layar?";
  console.log(`\nPERTANYAAN USER: "${userQuestion}"`);

  // 3. Panggil fungsi analyzeSystemLogs
  const recentLogs = logger.getRecentLogs();
  
  console.log("\n=== MEMANGGIL AI UNTUK DIAGNOSIS ===");
  try {
    const aiAnswer = await aiRouter.analyzeSystemLogs(userQuestion, recentLogs);
    console.log("\n=== JAWABAN N.E.X.A ===");
    console.log(aiAnswer);
  } catch (error) {
    console.error("Test Error:", error);
  }
}

runTest();
