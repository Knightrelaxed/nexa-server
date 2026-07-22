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

  // [PHASE 6] 1.7. Evening Reflective Diary (20:00 WIB)
  // Mengirim Evening Briefing ringkas + pertanyaan reflektif malam hari
  cron.schedule('0 20 * * *', async () => {
    console.log('[CRON] Executing Evening Reflective Briefing...');
    try {
      if (env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_CHAT_ID) {
        const { sendEveningBriefing } = require('./webhook');
        await sendEveningBriefing();
      } else {
        console.warn('[CRON] Telegram bot not configured. Evening briefing not sent.');
      }
    } catch (e) {
      console.error('[CRON] Evening briefing failed:', e.message);
    }
  }, { scheduled: true, timezone: 'Asia/Jakarta' });

  // [PHASE 6] 1.8. Weekly Cognitive Identity Inference (Minggu 21:00 WIB)
  // [PHASE 7 — M3] Setelah inferensi, generate & kirim Personality Evolution Narrative
  // [PHASE 7 — M4] Kemudian bangun/perbarui Causal Knowledge Graph
  cron.schedule('0 21 * * 0', async () => {
    console.log('[CRON] ── Weekly Cognitive Sunday Pass starting...');

    // STEP 1: Weekly Identity Inference [PHASE 6]
    // [BUG FIX #1] Blok Phase 6 lama yang duplikat sudah dihapus. Hanya satu cron
    // '0 21 * * 0' yang boleh berjalan — orchestrator ini.
    try {
      const inferenceEngine = require('../domain/Inference_Engine');
      const { sendTelegramOutbound } = require('./webhook');

      const result = await inferenceEngine.runWeeklyIdentityInference();
      console.log(`[CRON] Weekly Inference done: saved=${result.saved} pendingSent=${result.pendingSent} staged=${result.staged}`);

      // Kirim ringkasan hasil inferensi ke Telegram (dipindahkan dari cron Phase 6)
      if (result.success && result.saved > 0) {
        const summaryMsg = [
          `🧠 <b>Weekly Identity Inference Selesai</b>`,
          `<i>(Siklus Pemahaman Mingguan N.E.X.A)</i>`,
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
        console.log('[CRON] Inference summary sent to Telegram.');
      } else if (result.success && result.saved === 0) {
        console.log('[CRON] No new identity proposals this week. Model is stable.');
      }

      // STEP 2: [PHASE 7 — M3] Personality Evolution Narrative
      // Delay 5 detik agar notifikasi proposal tidak bertabrakan
      await new Promise(r => setTimeout(r, 5000));
      try {
        const narrative = await inferenceEngine.getPersonalityEvolutionNarrative(30);
        await sendTelegramOutbound(narrative, true);
        console.log('[CRON] Personality Evolution Narrative sent to Telegram.');
      } catch (narrativeErr) {
        console.warn('[CRON] Personality narrative failed (non-blocking):', narrativeErr.message);
      }

      // STEP 3: [PHASE 7 — M4] Build Causal Knowledge Graph
      // Delay tambahan 3 detik sebelum AI call berikutnya
      await new Promise(r => setTimeout(r, 3000));
      try {
        const anticipatoryEngine = require('../domain/Anticipatory_Engine');
        const gStats = await anticipatoryEngine.buildCausalGraph();
        console.log(`[CRON] Causal Graph built: new=${gStats.newEdges} updated=${gStats.updatedEdges} errors=${gStats.errors}`);
      } catch (graphErr) {
        console.warn('[CRON] Causal Graph build failed (non-blocking):', graphErr.message);
      }

    } catch (e) {
      console.error('[CRON] Weekly Cognitive Sunday Pass failed:', e.message);
    }

    console.log('[CRON] ── Weekly Cognitive Sunday Pass complete.');
  }, { scheduled: true, timezone: 'Asia/Jakarta' });

  // [PHASE 8 — SELF-LEARNING] Weekly N.E.X.A Self-Reflection Pass (Minggu 16:00 WIB)
  // TERPISAH dari Weekly Cognitive Sunday Pass (21:00 WIB).
  // Fokus: menganalisis koreksi, anjuran, kapabilitas baru, dan keterbatasan N.E.X.A
  // berdasarkan obrolan 7 hari. Hasil langsung di-upsert ke nexa_self_model (senyap).
  cron.schedule('0 16 * * 0', async () => {
    console.log('[CRON] ── Weekly N.E.X.A Self-Reflection Pass starting (Minggu 16:00 WIB)...');
    try {
      const inferenceEngine = require('../domain/Inference_Engine');
      const { sendTelegramOutbound } = require('./webhook');

      const result = await inferenceEngine.runWeeklySelfReflectionPass();
      console.log(`[CRON] Self-Reflection done: upserted=${result.upserted} skipped=${result.skipped} errors=${result.errors}`);

      if (result.success && result.upserted > 0) {
        const msg = [
          `🪞 <b>Weekly N.E.X.A Self-Reflection Selesai</b>`,
          `<i>(Pemahaman Diri N.E.X.A — Minggu Sore)</i>`,
          ``,
          `🧩 Fakta baru / direvisi : <b>${result.upserted}</b>`,
          `⏭ Dilewati (tidak valid) : <b>${result.skipped}</b>`,
          ``,
          `N.E.X.A telah memperbarui pemahamannya tentang dirinya sendiri berdasarkan obrolan minggu ini.`
        ].join('\n');
        await sendTelegramOutbound(msg, true);
      }
    } catch (e) {
      console.error('[CRON] Weekly Self-Reflection Pass failed:', e.message);
    }
  }, { scheduled: true, timezone: 'Asia/Jakarta' });

  // [PHASE 7 — M1+M3] Daily Evening Pass (setiap hari 23:30 WIB)
  // Menjalankan dua operasi kognitif malam berurutan:
  //   1. Mood Time-Series: hitung dan simpan tren emosional 24h/7d ke behavior_log
  //   2. Memory Decay: jalankan Ebbinghaus decay pada semua trait identity_model
  cron.schedule('30 23 * * *', async () => {
    console.log('[CRON] Executing Daily Evening Cognitive Pass (MoodTimeSeries + MemoryDecay)...');

    // 1. Compute Mood Time-Series [PHASE 7 — M3]
    try {
      const behaviorEngine = require('../domain/Behavior_Engine');
      const ts = await behaviorEngine.computeMoodTimeSeries();
      if (ts) {
        console.log(`[CRON] Mood Time-Series done: 24h=${ts.mood_24h_state} | 7d=${ts.mood_7d_trend} | var=${ts.mood_7d_variance}`);
      }
    } catch (e) {
      console.error('[CRON] Mood Time-Series failed:', e.message);
    }

    // 2. Memory Decay Pass [PHASE 7 — M1]
    try {
      const inferenceEngine = require('../domain/Inference_Engine');
      const stats = await inferenceEngine.runDailyDecayPass();
      console.log(`[CRON] Decay Pass done: processed=${stats.processed} decayed=${stats.decayed} checkins=${stats.checkins} errors=${stats.errors}`);
    } catch (e) {
      console.error('[CRON] Daily Memory Decay Pass failed:', e.message);
    }

  }, { scheduled: true, timezone: 'Asia/Jakarta' });

  // [PHASE 7 — M1+M2] Morning Pass (setiap hari 08:15 WIB)
  // Menjalankan tiga operasi kognitif secara berurutan setiap pagi:
  //   1. Tier 2 Soft-Approve: auto-approve proposal identitas yang sudah >48 jam tanpa respons
  //   2. Intention Check: kirim gentle friction untuk niat yang belum terwujud (14 hari)
  //   3. Outcome Check: tanyakan hasil keputusan penting (30 hari setelah keputusan dibuat)
  cron.schedule('15 8 * * *', async () => {
    console.log('[CRON] Executing Morning Cognitive Pass (Tier2 + Intention + Outcome)...');

    // 1. Tier 2 Soft-Approve Pass
    try {
      const inferenceEngine = require('../domain/Inference_Engine');
      const stats = await inferenceEngine.runTier2SoftApprovePass();
      if (stats.autoApproved > 0) {
        console.log(`[CRON] Tier 2 Pass done: autoApproved=${stats.autoApproved} errors=${stats.errors}`);
      }
    } catch (e) {
      console.error('[CRON] Tier 2 Soft-Approve Pass failed:', e.message);
    }

    // 2. Intention Check Pass (Stated-vs-Revealed)
    try {
      const intentionEngine = require('../domain/Intention_Engine');
      const iStats = await intentionEngine.runIntentionCheckPass();
      if (iStats.sent > 0) {
        console.log(`[CRON] Intention Pass done: sent=${iStats.sent} errors=${iStats.errors}`);
      }
    } catch (e) {
      console.error('[CRON] Intention Check Pass failed:', e.message);
    }

    // 3. Outcome Check Pass (Decision Journal)
    try {
      const intentionEngine = require('../domain/Intention_Engine');
      const oStats = await intentionEngine.runOutcomeCheckPass();
      if (oStats.sent > 0) {
        console.log(`[CRON] Outcome Pass done: sent=${oStats.sent} errors=${oStats.errors}`);
      }
    } catch (e) {
      console.error('[CRON] Outcome Check Pass failed:', e.message);
    }

    // 4. Finance Dedup Table Cleanup (> 7 hari)
    try {
      const supabaseMemories = require('../infrastructure/Supabase_Memories');
      await supabaseMemories.cleanupOldFinanceDedup(7);
    } catch (e) {
      console.error('[CRON] Finance Dedup Cleanup failed:', e.message);
    }

  }, { scheduled: true, timezone: 'Asia/Jakarta' });

  cron.schedule('0 8 * * 0', async () => {
    console.log('[CRON] Executing Scholarship Radar (Placeholder)...');
    // Future expansion: RSS/Scraping for opportunities
  }, { scheduled: true, timezone: 'Asia/Jakarta' });

  // 3. Finance Auto-Sync (Every 3 minutes)
  cron.schedule('*/3 * * * *', async () => {
    console.log('[CRON] Executing Finance Auto-Sync...');
    try {
      const financeEngine = require('../domain/Finance_Engine');
      const count = await financeEngine.pollFinanceEmails();
      if (count > 0) {
        console.log(`[CRON] Finance Auto-Sync processed ${count} new transactions.`);
      }
    } catch (e) {
      console.error('[CRON] Finance Auto-Sync failed:', e.message);
    }
  }, { scheduled: true, timezone: 'Asia/Jakarta' });

  // 4. Telegram Alert Watchdog (Every 90 seconds)
  // Scans Supabase for pending transactions where telegram_sent = false.
  // Retries sending the alert. If > 5 minutes old, auto-saves instead.
  // This ensures TLS blips (which last seconds to minutes) never silently
  // swallow a finance notification.
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
            const msg = await financeEngine.buildConfirmationMessage(tx, 'SINKRONISASI KEUANGAN TERBARU');
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

  // 6. [P6] Event Proximity Alert (setiap 10 menit)
  // Memeriksa event kalender yang akan dimulai dalam 15-30 menit ke depan.
  const _notifiedEventIds = new Set();
  cron.schedule('*/10 * * * *', async () => {
    try {
      const googleWorkspace = require('../infrastructure/Google_Workspace');
      const { sendTelegramOutbound } = require('./webhook');

      // Ambil event yang dimulai dalam 45 menit ke depan
      const events = await googleWorkspace.getUpcomingEvents(45, 5);
      if (!events || events.length === 0) return;

      for (const e of events) {
        if (_notifiedEventIds.has(e.id)) continue;

        const startTime = new Date(e.start.dateTime);
        const minutesLeft = Math.round((startTime - Date.now()) / 60000);

        // Kirim pengingat jika event dimulai dalam rentang 5–30 menit lagi
        if (minutesLeft <= 30 && minutesLeft >= 5) {
          const timeLabel = startTime.toLocaleTimeString('id-ID', {
            hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta'
          });
          const locationPart = e.location ? `\n📍 ${e.location}` : '';
          const msg = `⏰ <b>Pengingat ${minutesLeft} Menit!</b>\n\n` +
            `<b>${e.summary || '(Tanpa Judul)'}</b> dimulai pukul <b>${timeLabel} WIB</b>.${locationPart}\n\nSudah siap, Tuan?`;

          await sendTelegramOutbound(msg);
          _notifiedEventIds.add(e.id);

          // Hapus dari cache setelah 2 jam
          setTimeout(() => _notifiedEventIds.delete(e.id), 2 * 60 * 60 * 1000);
          console.log(`[CRON-P6] ✅ Proximity alert sent for event: "${e.summary}" (${minutesLeft}m left)`);
        }
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

  // 9. [P6] Tomorrow Prep (21:00 WIB, Senin–Sabtu)
  // Preview agenda besok + deadline kritis.
  // [BUG FIX #4] Jadwal diubah dari '0 21 * * *' (setiap hari) ke '0 21 * * 1-6' (Senin-Sabtu).
  // Setiap Minggu pukul 21:00, jadwal '0 21 * * 0' (Weekly Cognitive Sunday Pass) sudah aktif
  // menjalankan proses berat: Identity Inference + Personality Narrative + Causal Graph Build.
  // Apabila Tomorrow Prep juga aktif bersamaan, terjadi 4 AI call simultan + pesan Telegram
  // bertabrakan. Pada hari Minggu, Weekly Cognitive Pass sudah mencakup tinjauan strategis
  // yang jauh lebih komprehensif dari Tomorrow Prep, sehingga skip Minggu tidak mengurangi nilai.
  cron.schedule('0 21 * * 1-6', async () => {
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

  // [BUG FIX #1] Blok cron Phase 6 '0 21 * * 0' yang duplikat telah DIHAPUS.
  // Logika summaryMsg sudah dipindahkan ke dalam orchestrator Phase 7 di atas (STEP 1).
  // Hanya SATU schedule '0 21 * * 0' yang boleh aktif.


  // ================================================================

  // 11. Daily Memory Consolidation (23:59 WIB)
  // Reads all chat memories from today, extracts new permanent facts about the user,
  // and saves them to the User Profile table to give N.E.X.A long-term organic memory.
  // [v2] DEDUP-AWARE: Reads existing memories first to prevent duplicate facts.
  cron.schedule('59 23 * * *', async () => {
    console.log('[CRON-MEM] Executing Daily Memory Consolidation (Dedup-Aware v2)...');
    try {
      const supabaseMemories = require('../infrastructure/Supabase_Memories');
      const aiRouter = require('../core/AI_Router');
      const { sendTelegramOutbound } = require('./webhook');

      const todayMemories = await supabaseMemories.getTodayMemories();
      if (!todayMemories || todayMemories.length === 0) {
        console.log('[CRON-MEM] No chat activity today. Skipping consolidation.');
        return;
      }

      // ── ANTI-DUPLIKASI: Baca memori yang SUDAH ADA di Supabase ────────────
      // Tanpa langkah ini, AI akan mengekstrak "Tuan Faqih ingin menjadi diplomat"
      // setiap hari walaupun fakta itu sudah tersimpan berkali-kali sebelumnya.
      const existingFacts = await supabaseMemories.getPersonalFacts();
      const existingFactsText = [
        ...(existingFacts.userProfile || []),
        ...(existingFacts.coreIdentity || [])
      ].join('\n');
      console.log(`[CRON-MEM] Loaded ${(existingFacts.userProfile?.length || 0) + (existingFacts.coreIdentity?.length || 0)} existing facts as dedup context.`);

      const chatLog = todayMemories.map(m => `[${m.role.toUpperCase()}]: ${m.content}`).join('\n');

      const prompt = `Anda adalah Subsistem Memori N.E.X.A. Tugas Anda adalah membaca transkrip obrolan hari ini antara Tuan Faqih dan N.E.X.A, lalu MENGEKSTRAK HANYA FAKTA PERMANEN JANGKA PANJANG (Personality, Core Preferences, Rules of Engagement) yang belum ada dalam memori yang sudah tersimpan.

=== MEMORI YANG SUDAH TERSIMPAN (JANGAN DUPLIKASI INI) ===
${existingFactsText.substring(0, 35000)}

=== TRANSKRIP OBROLAN HARI INI ===
${chatLog.substring(0, 60000)}

=== ATURAN EKSTRAKSI KETAT (CRITICAL) ===
1. HANYA ekstrak SIFAT/KEPRIBADIAN PERMANEN, NILAI HIDUP, KEBIASAAN KONSISTEN, atau ATURAN INTERAKSI (misal: "Tuan tidak suka dipanggil dengan formal", "Tuan alergi kacang", "Tuan selalu bangun jam 4 pagi").
2. DILARANG KERAS (TIDAK BOLEH) mengekstrak hal-hal berikut:
   - Transaksi atau pembelian tunggal (misal: beli nasi telur pakai QRIS, beli kopi).
   - Angka/data keuangan (misal: anggaran harian Rp50.000, batas saldo, harga barang). Ini diurus oleh mesin terpisah.
   - Jadwal, agenda, atau tugas spesifik (misal: jadwal rapat besok, deadline tugas).
3. HANYA ekstrak fakta yang benar-benar BARU secara semantik. Jika sudah ada di memori tersimpan, ABAIKAN (jangan duplikasi).
4. Jika obrolan hari ini hanya berisi rutinitas mencatat uang, tugas, sapaan, atau aktivitas harian biasa, ANDA WAJIB mengembalikan array kosong []. Ini sangat normal dan sangat diharapkan.
5. Format output: kalimat third-person yang baku dan lugas.

Kembalikan hasil dalam bentuk JSON Array of Strings MURNI. Jangan gunakan backtick atau markdown apapun.`;

      const { executeWithFallback } = require('../core/Fallback_Engine');
      const result = await executeWithFallback(
        prompt,
        "Anda adalah AI Pengekstrak Fakta Anti-Duplikasi. Output WAJIB JSON Array of Strings murni. Kembalikan [] jika tidak ada fakta baru yang genuinely belum tersimpan.",
        0.15,
        true,
        { forceHeavy: true } // [SACR] Kategori A — Selalu Gemini 3.6 Flash (Daily Memory Consolidation)
      );

      try {
        // Bersihkan jika AI tetap mengembalikan markdown block
        let cleanStr = result.replace(/```json/gi, '').replace(/```/g, '').trim();
        const firstBracket = cleanStr.indexOf('[');
        const lastBracket = cleanStr.lastIndexOf(']');
        if (firstBracket !== -1 && lastBracket > firstBracket) {
          cleanStr = cleanStr.substring(firstBracket, lastBracket + 1);
        }

        const parsed = JSON.parse(cleanStr);
        if (Array.isArray(parsed) && parsed.length > 0) {
          console.log(`[CRON-MEM] Extracted ${parsed.length} genuinely new facts (dedup-aware).`);
          for (const fact of parsed) {
            if (typeof fact === 'string' && fact.trim().length > 10) {
              await aiRouter.deduplicateAndSaveFact(fact.trim(), 'USER_PROFILE');
            }
          }
          aiRouter.invalidatePersonalFactsCache();

          const factsList = parsed.map((f, i) => `${i + 1}. ${f}`).join('\n');
          await sendTelegramOutbound(
            `🧠 <b>Memory Consolidation</b>\n` +
            `Saya mempelajari <b>${parsed.length}</b> fakta baru tentang Tuan hari ini:\n\n` +
            `${factsList}\n\n` +
            `<i>(Duplikasi otomatis diabaikan)</i>`
          );
        } else {
          console.log('[CRON-MEM] No genuinely new facts found — all already known. No write performed.');
        }
      } catch (err) {
        console.log('[CRON-MEM] AI did not return a valid JSON array or no facts found:', result?.substring(0, 200));
      }
    } catch (e) {
      console.error('[CRON-MEM] Memory Consolidation failed:', e.message);
    }
  }, { scheduled: true, timezone: 'Asia/Jakarta' });

  // 12. Weekly Budget Recap (Sunday 23:59 WIB)
  cron.schedule('59 23 * * 0', async () => {
    console.log('[CRON-BUDGET] Executing Weekly Budget Recap...');
    try {
      const budgetEngine = require('../domain/Budget_Engine');
      const { sendTelegramOutbound } = require('./webhook');
      const msg = await budgetEngine.generatePeriodicRecap('weekly');
      if (msg) {
        await sendTelegramOutbound(msg);
        console.log('[CRON-BUDGET] Weekly Recap sent.');
      }
    } catch (e) {
      console.error('[CRON-BUDGET] Weekly Recap failed:', e.message);
    }
  }, { scheduled: true, timezone: 'Asia/Jakarta' });

  // 13. Monthly Budget Recap (Last Day of Month 23:59 WIB)
  cron.schedule('59 23 28-31 * *', async () => {
    try {
      const today = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Jakarta' }));
      const tomorrow = new Date(today);
      tomorrow.setDate(today.getDate() + 1);
      
      if (tomorrow.getDate() === 1) { // Today is the last day
        console.log('[CRON-BUDGET] Executing Monthly Budget Recap...');
        const budgetEngine = require('../domain/Budget_Engine');
        const { sendTelegramOutbound } = require('./webhook');
        const msg = await budgetEngine.generatePeriodicRecap('monthly');
        if (msg) {
          await sendTelegramOutbound(msg);
          console.log('[CRON-BUDGET] Monthly Recap sent.');
        }
      }
    } catch (e) {
      console.error('[CRON-BUDGET] Monthly Recap failed:', e.message);
    }
  }, { scheduled: true, timezone: 'Asia/Jakarta' });

  // 14. [PHASE 8] Auto-Escalation Checker (Every 1 Minute)
  // Memeriksa sesi disiplin yang pending_callback = true dan waktu konfirmasi telah habis (callback_expires_at < NOW).
  // Jika ditemukan, eskalasi otomatis ke Level 3 dan hapus tombol di Telegram.
  cron.schedule('* * * * *', async () => {
    try {
      if (!env.SUPABASE_URL || !env.SUPABASE_KEY) return;
      const { createClient } = require('@supabase/supabase-js');
      const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_KEY);

      const nowIso = new Date().toISOString();
      const { data: expiredSessions, error } = await supabase
        .from('nexa_discipline_state')
        .select('*')
        .eq('pending_callback', true)
        .lt('callback_expires_at', nowIso);

      if (error || !expiredSessions || expiredSessions.length === 0) return;

      console.log(`[CRON-DISCIPLINE] Found ${expiredSessions.length} expired pending callback(s). Escalating to Level 3...`);
      const godMode = require('../domain/Discipline_GodMode');
      const { editTelegramMessage } = require('./telegram/actions');

      for (const session of expiredSessions) {
        try {
          await supabase
            .from('nexa_discipline_state')
            .update({ pending_callback: false, current_level: 3 })
            .eq('session_key', session.session_key);

          await godMode.triggerGodMode(3, {
            violation_app: session.app_name,
            message_tone: session.message_tone,
            session_key: session.session_key
          });

          if (session.callback_message_id) {
            await editTelegramMessage(
              session.callback_message_id,
              `⚠️ <b>Batas waktu konfirmasi habis.</b>\n\nTuan Faqih tidak merespons tombol dalam batas waktu toleransi.\nSurgical Force (Level 3) diaktifkan otomatis.`
            );
          }
        } catch (itemErr) {
          console.error(`[CRON-DISCIPLINE] Error escalating session ${session.session_key}:`, itemErr.message);
        }
      }
    } catch (e) {
      console.error('[CRON-DISCIPLINE] Check error:', e.message);
    }
  });

  // [PHASE 9] Memory Hygiene: Minggu 02:00 WIB
  // Berjalan sebelum Weekly Identity Inference (21:00 WIB) agar memori bersih
  // sebelum AI membuat hipotesis identitas baru.
  cron.schedule('0 2 * * 0', async () => {
    console.log('[CRON-HYGIENE] Memory Hygiene Pipeline triggered (Minggu 02:00 WIB)...');
    try {
      const { runFullHygienePipeline } = require('../domain/Memory_Hygiene_Engine');
      await runFullHygienePipeline();
    } catch (e) {
      console.error('[CRON-HYGIENE] Memory Hygiene Pipeline failed:', e.message);
    }
  }, { scheduled: true, timezone: 'Asia/Jakarta' });

  console.log('[CRON] 🛡️ Telegram Alert Watchdog active (90s interval).');
  console.log('[CRON-P6] ✅ Phase 6 Proactive Crons active: Proximity, Midday, Evening, Tomorrow, Weekly Review.');
  console.log('[CRON-MEM] 🧠 Memory Consolidation active (23:59 WIB).');
  console.log('[CRON-BUDGET] 📊 Budget Recaps active (End of Week & Month).');
  console.log('[CRON-DISCIPLINE] ⚡ Discipline Auto-Escalation active (1m interval).');
  console.log('[CRON-HYGIENE] 🧹 Memory Hygiene Pipeline active (Minggu 02:00 WIB).');
}

module.exports = { initCronJobs };
