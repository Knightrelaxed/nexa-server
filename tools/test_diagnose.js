require('dotenv').config();
const logger = require('../src/utils/logger');
const aiRouter = require('../src/core/AI_Router');

async function runTest() {
  console.log("=== MEMULAI TESTING DIAGNOSE_SYSTEM ===");
  
  // 1. Simulasikan sistem sedang berjalan (Skenario Error Token Gmail)
  console.log("[SERVER] N.E.X.A Engine v2.0 started on port 3000");
  console.log("[CRON] Starting finance email polling (3-minute interval)...");
  console.log("[GMAIL] Attempting to fetch latest emails from inbox.");
  console.error("[GMAIL] Error fetching emails: invalid_grant (Token has been expired or revoked).");
  console.warn("[GMAIL] Invalid_grant detected! Resetting gmailClient to null.");
  console.warn("[TELEGRAM-OUTBOUND] Sending emergency alert: Google OAuth token expired.");
  console.error("[GMAIL] Halting email polling to prevent spam until token is refreshed.");

  // 2. Simulasikan user bertanya santai
  const userQuestion = "Nex, kok dari pagi mutasi bank mandiri saya gak masuk-masuk ke laporan ya?";
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
