require('dotenv').config(); // Asumsi environment Supabase menggunakan dotenv
const budgetEngine = require('./src/domain/Budget_Engine');

async function runTest() {
  console.log("Memulai simulasi pencatatan pengeluaran Rp 45.000...");
  
  // Asumsi ini masuk sebagai expense
  const alertMsg = await budgetEngine.checkAndAlertBudget({
    nominal: 45000,
    categoryName: 'Makan Berat / Makan Luar',
    description: 'Beli sate ayam (Testing)',
    date: new Date()
  });

  if (alertMsg) {
    console.log("\n=== 🚨 PERINGATAN GENERATED ===");
    console.log(alertMsg);
    console.log("===============================\n");
  } else {
    console.log("✅ TIDAK ADA PERINGATAN (Masih aman / dibawah 80%)");
  }
  
  process.exit(0);
}

runTest().catch(console.error);
