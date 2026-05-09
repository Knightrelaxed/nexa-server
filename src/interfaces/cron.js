const cron = require('node-cron');
const axios = require('axios');
const env = require('../config/env');
const intelligenceBrief = require('../domain/Intelligence_Brief');

function initCronJobs() {
  console.log('[CRON] Initializing N.E.X.A background jobs...');

  // 1. The Diplomat's Morning Briefing (05:30 WIB)
  cron.schedule('30 5 * * *', async () => {
    console.log('[CRON] Executing Morning Briefing...');
    try {
      const briefingText = await intelligenceBrief.generateMorningBriefing();
      
      if (env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_CHAT_ID) {
        await axios.post(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
          chat_id: env.TELEGRAM_CHAT_ID,
          text: briefingText
        });
        const supabase = require('../infrastructure/Supabase_Memories');
        try { await supabase.saveChatMemory('assistant', briefingText); } catch(e) {}
        console.log('[CRON] Morning Briefing delivered successfully.');
      } else {
        console.warn('[CRON] Telegram bot not configured. Briefing not sent.');
      }
    } catch (e) {
      console.error('[CRON] Morning briefing failed:', e.message);
    }
  }, {
    scheduled: true,
    timezone: "Asia/Jakarta"
  });

  // 2. Scholarship / Competition Radar (Every Sunday 08:00 WIB)
  cron.schedule('0 8 * * 0', async () => {
    console.log('[CRON] Executing Scholarship Radar (Placeholder)...');
    // Future expansion: RSS/Scraping for opportunities
  }, {
    scheduled: true,
    timezone: "Asia/Jakarta"
  });

  // 3. Livin' Auto-Sync (Every 3 minutes)
  cron.schedule('*/3 * * * *', async () => {
    console.log('[CRON] Executing Livin Auto-Sync...');
    try {
      const financeEngine = require('../domain/Finance_Engine');
      const count = await financeEngine.pollLivinEmails();
      if (count > 0) {
        console.log(`[CRON] Livin Auto-Sync processed ${count} new transactions.`);
      }
    } catch (e) {
      console.error('[CRON] Livin Auto-Sync failed:', e.message);
    }
  }, {
    scheduled: true,
    timezone: "Asia/Jakarta"
  });
}

module.exports = { initCronJobs };
