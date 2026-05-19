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

  // 1.5. The Midnight Check-in (01:00 WIB)
  cron.schedule('0 1 * * *', async () => {
    console.log('[CRON] Executing Midnight Check-in...');
    try {
      const checkinText = await intelligenceBrief.generateMidnightCheckin();
      if (env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_CHAT_ID) {
        const { sendTelegramOutbound } = require('./webhook');
        await sendTelegramOutbound(checkinText);
      } else {
        console.warn('[CRON] Telegram bot not configured. Midnight check-in not sent.');
      }
    } catch (e) {
      console.error('[CRON] Midnight check-in failed:', e.message);
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
      if (!rows || rows.length === 0) { watchdogRunning = false; return; }

      for (const row of rows) {
        try {
          const tx = row.tx_data;
          const compositeKey = row.composite_key;
          const ageMs = Date.now() - new Date(row.created_at).getTime();

          if (ageMs >= 5 * 60 * 1000) {
            // Expired — auto-save without asking user
            // DEDUP GUARD: Check before saving to prevent race condition with recoverPendingTransactions
            const txTime = new Date(row.created_at);
            const alreadySaved = await supabase.isDuplicateTransaction(compositeKey, txTime, false);
            if (alreadySaved) {
              console.log(`[WATCHDOG] ${compositeKey} already saved. Cleaning up stale pending record.`);
              await supabase.deletePendingTransaction(compositeKey);
              continue;
            }
            console.log(`[WATCHDOG] Tx ${compositeKey} expired (${Math.round(ageMs/60000)}m old). Auto-saving...`);
            await financeEngine.autoSaveFromWatchdog(compositeKey, tx);
          } else if (!row.telegram_sent) {
            // Not yet sent to Telegram AND still within 5-min window — resend
            const msg = await financeEngine.buildConfirmationMessage(tx, 'TRANSAKSI LIVIN TERBARU');
            await sendTelegramOutbound(msg);
            await supabase.markPendingTransactionSent(compositeKey);
            console.log(`[WATCHDOG] ✅ Alert resent successfully for: ${compositeKey}`);
          }
          // else: telegram_sent=true AND still within 5-min window → do nothing, wait for user response
        } catch (e) {
          console.error('[WATCHDOG] Error processing pending tx:', e.message);
        }
      }
    } catch (e) {
      console.error('[WATCHDOG] Watchdog error:', e.message);
    }
    watchdogRunning = false;
  }, 90 * 1000);

  // 5. Overdue Task Alert (07:00 WIB)
  cron.schedule('0 7 * * *', async () => {
    console.log('[CRON] Executing Overdue Task Alert...');
    try {
      const googleTasks = require('../infrastructure/Google_Tasks');
      const overdueTasks = await googleTasks.getOverdueTasks();
      
      if (overdueTasks && overdueTasks.length > 0) {
        let alertMsg = `🔴 <b>REMINDER: ${overdueTasks.length} tugas Tuan sudah terlambat:</b>\n`;
        overdueTasks.forEach((t, i) => {
          const d = new Date(t.due);
          // Calculate diff days correctly based on start of days
          const now = new Date();
          now.setHours(0,0,0,0);
          d.setHours(0,0,0,0);
          const diffDays = Math.max(1, Math.ceil((now - d) / (1000 * 60 * 60 * 24)));
          alertMsg += `${i + 1}. ${t.title} (terlambat ${diffDays} hari)\n`;
        });
        
        if (env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_CHAT_ID) {
          const { sendTelegramOutbound } = require('./webhook');
          await sendTelegramOutbound(alertMsg);
        }
      }
    } catch (e) {
      console.error('[CRON] Overdue Task Alert failed:', e.message);
    }
  }, { scheduled: true, timezone: 'Asia/Jakarta' });

  // ================================================================
  // [PHASE 6 — Pilar 8.1] PROACTIVE CRON EXPANSION
  // ================================================================

  // 6. [P6] Event Proximity Alert (every 30 minutes)
  // Sends a notification 30 minutes BEFORE a calendar event starts.
  // Uses a session-level Set to prevent double-notifications for the same event.
  const _notifiedEventIds = new Set();
  cron.schedule('*/30 * * * *', async () => {
    console.log('[CRON-P6] Executing Proximity Alert check...');
    try {
      const googleWorkspace = require('../infrastructure/Google_Workspace');
      const { sendTelegramOutbound } = require('./webhook');

      const events = await googleWorkspace.getUpcomingEvents(30, 3);
      if (!events || events.length === 0) return;

      for (const e of events) {
        // Skip events already notified this session
        if (_notifiedEventIds.has(e.id)) continue;

        const startTime = new Date(e.start.dateTime);
        const minutesLeft = Math.round((startTime - Date.now()) / 60000);

        // Only notify if within the 25–35 minute window to avoid repeat-fire edge cases
        if (minutesLeft < 25 || minutesLeft > 35) continue;

        const timeLabel = startTime.toLocaleTimeString('id-ID', {
          hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta'
        });
        const locationPart = e.location ? `\n📍 ${e.location}` : '';
        const msg = `⏰ <b>Pengingat 30 Menit!</b>\n\n` +
          `<b>${e.summary || '(Tanpa Judul)'}</b> dimulai pukul <b>${timeLabel} WIB</b>.\n` +
          `${locationPart}\n\nSudah siap, Tuan?`;

        await sendTelegramOutbound(msg);
        _notifiedEventIds.add(e.id);

        // Auto-evict from set after 2 hours to prevent unbounded memory growth
        setTimeout(() => _notifiedEventIds.delete(e.id), 2 * 60 * 60 * 1000);
        console.log(`[CRON-P6] Proximity alert sent for event: "${e.summary}"`);
      }
    } catch (e) {
      console.error('[CRON-P6] Proximity Alert failed:', e.message);
    }
  }, { scheduled: true, timezone: 'Asia/Jakarta' });

  // 7. [P6] Midday Pulse (12:00 WIB)
  // A brief proactive check-in: pending tasks + spending summary for today.
  cron.schedule('0 12 * * *', async () => {
    console.log('[CRON-P6] Executing Midday Pulse...');
    try {
      const { sendTelegramOutbound } = require('./webhook');
      const googleTasks = require('../infrastructure/Google_Tasks');
      const financeEngine = require('../domain/Finance_Engine');
      const aiRouter = require('../core/AI_Router');

      // Gather data in parallel — Promise.allSettled ensures one failure can't kill the whole cron
      const [todayTasks, recentFinance] = await Promise.allSettled([
        googleTasks.getTasksDueToday(),
        financeEngine.getRecentTransactions(3)
      ]);

      const taskCount = todayTasks.status === 'fulfilled' ? (todayTasks.value || []).length : 0;
      const financeText = recentFinance.status === 'fulfilled' ? recentFinance.value : '(data keuangan tidak tersedia)';

      // Ask AI to synthesize a short midday pulse message
      const prompt = `Tuan Faqih memiliki ${taskCount} tugas jatuh tempo hari ini. ` +
        `Berikut ringkasan keuangan terkini (3 transaksi terakhir): ${typeof financeText === 'string' ? financeText.replace(/<[^>]+>/g, '') : '(kosong)'}. ` +
        `Tulis pesan Midday Pulse singkat (2-3 kalimat) dalam bahasa Indonesia yang hangat dan proaktif. ` +
        `Tanyakan progress tugas hari ini, dan sapa seperti seorang asisten yang peduli. ` +
        `Jangan gunakan format JSON atau markdown **bold**.`;

      const pulseText = await aiRouter.callAI(prompt);
      if (pulseText) {
        await sendTelegramOutbound(`🌤️ <b>Midday Pulse</b>\n\n${pulseText}`);
      }
    } catch (e) {
      console.error('[CRON-P6] Midday Pulse failed:', e.message);
    }
  }, { scheduled: true, timezone: 'Asia/Jakarta' });

  // 8. [P6] Evening Debrief (17:00 WIB)
  // Recap + open-ended question to capture notes from the user's day.
  cron.schedule('0 17 * * *', async () => {
    console.log('[CRON-P6] Executing Evening Debrief...');
    try {
      const { sendTelegramOutbound } = require('./webhook');
      const aiRouter = require('../core/AI_Router');

      const jakartaDate = new Date().toLocaleDateString('id-ID', {
        weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
        timeZone: 'Asia/Jakarta'
      });

      const prompt = `Hari ini adalah ${jakartaDate}. ` +
        `Tulis pesan Evening Debrief singkat (2-3 kalimat) dalam bahasa Indonesia yang hangat. ` +
        `Ucapkan bahwa hari hampir selesai, tanyakan pencapaian apa yang sudah dilakukan hari ini, ` +
        `dan apakah ada yang perlu dicatat atau diingat untuk besok. ` +
        `Nada: hangat, suportif, seperti asisten yang benar-benar peduli dengan hari-hari Tuan Faqih. ` +
        `Jangan gunakan format JSON atau markdown **bold**.`;

      const debriefText = await aiRouter.callAI(prompt);
      if (debriefText) {
        await sendTelegramOutbound(`🌇 <b>Evening Debrief</b>\n\n${debriefText}`);
      }
    } catch (e) {
      console.error('[CRON-P6] Evening Debrief failed:', e.message);
    }
  }, { scheduled: true, timezone: 'Asia/Jakarta' });

  // 9. [P6] Tomorrow Prep (21:00 WIB)
  // Preview agenda besok + deadline kritis.
  cron.schedule('0 21 * * *', async () => {
    console.log('[CRON-P6] Executing Tomorrow Prep...');
    try {
      const { sendTelegramOutbound } = require('./webhook');
      const googleWorkspace = require('../infrastructure/Google_Workspace');
      const googleTasks = require('../infrastructure/Google_Tasks');
      const aiRouter = require('../core/AI_Router');

      // Fetch tomorrow's events and upcoming tasks in parallel
      const [tomorrowEvents, upcomingTasks] = await Promise.allSettled([
        googleWorkspace.getTomorrowEvents(),
        googleTasks.getUpcomingTasks(2) // Tasks due within next 2 days
      ]);

      const events = tomorrowEvents.status === 'fulfilled' ? (tomorrowEvents.value || []) : [];
      const tasks = upcomingTasks.status === 'fulfilled' ? (upcomingTasks.value || []) : [];

      // Build a plain-text summary for the AI to synthesize
      const eventSummary = events.length > 0
        ? events.map(e => {
          const t = e.start?.dateTime
            ? new Date(e.start.dateTime).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta' })
            : 'Seharian';
          return `${t}: ${e.summary || '(Tanpa judul)'}`;
        }).join(', ')
        : 'Tidak ada event kalender';

      const taskSummary = tasks.length > 0
        ? tasks.map(t => t.title).join(', ')
        : 'Tidak ada tugas mendesak';

      const prompt = `Besok, Tuan Faqih memiliki jadwal: ${eventSummary}. ` +
        `Tugas yang akan jatuh tempo: ${taskSummary}. ` +
        `Tulis pesan Tomorrow Prep singkat (3-4 kalimat) dalam bahasa Indonesia yang strategis dan hangat. ` +
        `Berikan gambaran agenda besok, ingatkan tentang tugas jika ada, dan beri 1 kalimat rekomendasi prioritas. ` +
        `Nada: Chief of Staff yang cerdas dan peduli. Jangan gunakan format JSON atau markdown **bold**.`;

      const prepText = await aiRouter.callAI(prompt);
      if (prepText) {
        let header = `🌙 <b>Persiapan untuk Besok</b>\n\n`;
        if (events.length > 0) {
          header += `📅 <b>Agenda:</b> ${events.length} event\n`;
        }
        if (tasks.length > 0) {
          header += `📋 <b>Tugas Mendesak:</b> ${tasks.length}\n`;
        }
        await sendTelegramOutbound(header + `\n${prepText}`);
      }
    } catch (e) {
      console.error('[CRON-P6] Tomorrow Prep failed:', e.message);
    }
  }, { scheduled: true, timezone: 'Asia/Jakarta' });

  // ================================================================
  // [PHASE 6 — Pilar 8.2] BEHAVIORAL PATTERN ENGINE — Weekly Review
  // ================================================================

  // 10. [P6] Weekly Behavior Summary (Every Sunday 20:00 WIB)
  // Reads the nexa_behavior_log table and sends a formatted behavior report.
  cron.schedule('0 20 * * 0', async () => {
    console.log('[CRON-P6] Executing Weekly Behavior Review...');
    try {
      const { sendTelegramOutbound } = require('./webhook');
      const behaviorEngine = require('../domain/Behavior_Engine');

      const summary = await behaviorEngine.getWeeklySummary();
      const formatted = behaviorEngine.formatWeeklySummary(summary);

      if (formatted) {
        await sendTelegramOutbound(formatted);
        console.log('[CRON-P6] Weekly Behavior Review sent.');
      }
    } catch (e) {
      console.error('[CRON-P6] Weekly Behavior Review failed:', e.message);
    }
  }, { scheduled: true, timezone: 'Asia/Jakarta' });

  console.log('[CRON] 🛡️ Telegram Alert Watchdog active (90s interval).');
  console.log('[CRON-P6] ✅ Phase 6 Proactive Crons active: Proximity, Midday, Evening, Tomorrow, Weekly Review.');
}

module.exports = { initCronJobs };
