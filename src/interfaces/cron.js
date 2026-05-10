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
        const { sendTelegramOutbound } = require('./webhook');
        await sendTelegramOutbound(briefingText);
      } else {
        console.warn('[CRON] Telegram bot not configured. Briefing not sent.');
      }
    } catch (e) {
      console.error('[CRON] Morning briefing failed:', e.message);
    }
  }, { scheduled: true, timezone: 'Asia/Jakarta' });

  // 2. Scholarship / Competition Radar (Every Sunday 08:00 WIB)
  cron.schedule('0 8 * * 0', async () => {
    console.log('[CRON] Executing Scholarship Radar (Placeholder)...');
    // Future expansion: RSS/Scraping for opportunities
  }, { scheduled: true, timezone: 'Asia/Jakarta' });

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
  }, { scheduled: true, timezone: 'Asia/Jakarta' });

  // 4. Telegram Alert Watchdog (Every 90 seconds)
  // Scans Supabase for pending transactions where telegram_sent = false.
  // Retries sending the alert. If > 5 minutes old, auto-saves instead.
  // This ensures TLS blips (which last seconds to minutes) never silently
  // swallow a Livin notification.
  let watchdogRunning = false;
  setInterval(async () => {
    if (watchdogRunning) return; // prevent overlap if previous run is slow
    watchdogRunning = true;
    try {
      const supabase = require('../infrastructure/Supabase_Memories');
      const financeEngine = require('../domain/Finance_Engine');
      const { sendTelegramOutbound } = require('./webhook');
      const rows = await supabase.getPendingTransactions();
      const unsent = rows.filter(r => !r.telegram_sent);
      if (unsent.length === 0) { watchdogRunning = false; return; }

      console.log(`[WATCHDOG] Found ${unsent.length} unsent Telegram alert(s). Retrying...`);
      for (const row of unsent) {
        try {
          const tx = row.tx_data;
          const compositeKey = row.composite_key;
          const ageMs = Date.now() - new Date(row.created_at).getTime();

          if (ageMs >= 5 * 60 * 1000) {
            // Expired — auto-save without asking user
            console.log(`[WATCHDOG] Tx ${compositeKey} expired (${Math.round(ageMs/60000)}m old). Auto-saving...`);
            await financeEngine.autoSaveFromWatchdog(compositeKey, tx);
          } else {
            // Still within window — resend via curl+proxy (proven to work on HF)
            const msg = await financeEngine.buildConfirmationMessage(tx, 'TRANSAKSI LIVIN TERBARU');
            await sendTelegramOutbound(msg);
            await supabase.markPendingTransactionSent(compositeKey);
            console.log(`[WATCHDOG] ✅ Alert resent successfully for: ${compositeKey}`);
          }
        } catch (e) {
          console.error('[WATCHDOG] Error processing pending tx:', e.message);
        }
      }
    } catch (e) {
      console.error('[WATCHDOG] Watchdog error:', e.message);
    }
    watchdogRunning = false;
  }, 90 * 1000);

  console.log('[CRON] 🛡️ Telegram Alert Watchdog active (90s interval).');
}

module.exports = { initCronJobs };

