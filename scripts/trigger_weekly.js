const env = require('../src/config/env');
const inferenceEngine = require('../src/domain/Inference_Engine');
const { sendTelegramOutbound } = require('../src/interfaces/webhook');

(async () => {
  console.log('🚀 Memulai Manual Trigger Weekly Cognitive Sunday Pass...');
  try {
    const result = await inferenceEngine.runWeeklyIdentityInference();
    console.log('✅ Selesai:', result);

    if (result.success && result.saved > 0) {
      const summaryMsg = [
        `🧠 <b>Weekly Identity Inference Selesai</b>`,
        `<i>(Siklus Pemahaman Mingguan N.E.X.A — Manual Trigger)</i>`,
        '',
        `📊 Hipotesis yang dianalisis : <b>${result.totalHypotheses}</b>`,
        `✅ Proposal baru tersimpan   : <b>${result.saved}</b>`,
        `📨 Dikirim untuk review      : <b>${result.pendingSent}</b>`,
        `📂 Di-stage (bukti kurang)   : <b>${result.staged}</b>`,
        `⚡ Diabaikan (duplikat/lemah): <b>${result.skipped}</b>`,
        '',
        result.pendingSent > 0
          ? `💡 Silakan review proposal identitas di atas, Tuan.`
          : `📝 Semua hipotesis minggu ini di-stage untuk observasi lanjutan.`
      ].join('\n');
      await sendTelegramOutbound(summaryMsg, true);
    } else {
      await sendTelegramOutbound(`🧠 <b>Weekly Identity Inference Selesai</b>\n\nTidak ada hipotesis baru (atau observasi belum cukup untuk menarik kesimpulan baru). Model identitas stabil.`, true);
    }
  } catch (err) {
    console.error('❌ Error:', err.message);
  } finally {
    process.exit(0);
  }
})();
