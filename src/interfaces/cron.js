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
  cron.schedule('0 21 * * 0', async () => {
    console.log('[CRON] Executing Weekly Cognitive Identity Inference...');
    try {
      const inferenceEngine = require('../domain/Inference_Engine');
      await inferenceEngine.runWeeklyIdentityInference();
    } catch (e) {
      console.error('[CRON] Weekly Identity Inference failed:', e.message);
    }
  }, { scheduled: true, timezone: 'Asia/Jakarta' });

  // [PHASE 7 — M1] Daily Memory Decay Pass (setiap hari 23:30 WIB)
  // Menjalankan fungsi Ebbinghaus decay pada semua trait di nexa_identity_model.
  // Trait yang confidence-nya turun di bawah 60% akan memicu soft check-in ke Telegram.
  cron.schedule('30 23 * * *', async () => {
    console.log('[CRON] Executing Daily Memory Decay Pass...');
    try {
      const inferenceEngine = require('../domain/Inference_Engine');
      const stats = await inferenceEngine.runDailyDecayPass();
      console.log(`[CRON] Decay Pass done: processed=${stats.processed} decayed=${stats.decayed} checkins=${stats.checkins} errors=${stats.errors}`);
    } catch (e) {
      console.error('[CRON] Daily Memory Decay Pass failed:', e.message);
    }
  }, { scheduled: true, timezone: 'Asia/Jakarta' });

  // [PHASE 7 — M1] Tier 2 Soft-Approve Pass (setiap hari 08:15 WIB)
  // Memeriksa proposal Tier 2 yang sudah >48 jam tanpa respons user.
  // Jika ditemukan, proposal tersebut auto-approved dan dikunci ke identity_model.
  cron.schedule('15 8 * * *', async () => {
    console.log('[CRON] Executing Tier 2 Soft-Approve Pass...');
    try {
      const inferenceEngine = require('../domain/Inference_Engine');
      const stats = await inferenceEngine.runTier2SoftApprovePass();
      if (stats.autoApproved > 0) {
        console.log(`[CRON] Tier 2 Pass done: autoApproved=${stats.autoApproved} errors=${stats.errors}`);
      }
    } catch (e) {
      console.error('[CRON] Tier 2 Soft-Approve Pass failed:', e.message);
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

  // ================================================================
  // [PHASE 6] COGNITIVE IDENTITY ENGINE — Weekly Identity Inference
  // ================================================================

  // [P6] Weekly Identity Inference (Every Sunday 21:00 WIB)
  // Menjalankan Mesin Inferensi Kognitif:
  //   1. Baca 7 hari observasi (behavior log + chat memories)
  //   2. AI mensintesis hipotesis 7 Layer Identitas
  //   3. Filter berdasarkan Confidence Score
  //   4. Kirim proposal ke Telegram jika confidence > 85%
  //   5. Stage jika confidence 60-85% (konsolidasi minggu depan)
  // NOTE: Dijalankan 1 jam SETELAH Weekly Behavior Review (20:00) agar tidak
  //       tumpang tindih dan behavior summary sudah terkirim lebih dulu.
  cron.schedule('0 21 * * 0', async () => {
    console.log('[CRON-INFERENCE] Executing Weekly Identity Inference (Phase 6)...');
    try {
      const inferenceEngine = require('../domain/Inference_Engine');
      const result = await inferenceEngine.runWeeklyIdentityInference();

      const { sendTelegramOutbound } = require('./webhook');

      if (result.success && result.saved > 0) {
        // Kirim ringkasan proses inferensi ke Telegram
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

        await sendTelegramOutbound(summaryMsg, true); // skipMemory=true karena ini sistem
        console.log('[CRON-INFERENCE] Identity Inference summary sent to Telegram.');

      } else if (result.success && result.saved === 0) {
        console.log('[CRON-INFERENCE] No new identity proposals this week. Model is stable.');
      } else {
        console.error('[CRON-INFERENCE] Inference failed:', result.error);
      }

    } catch (e) {
      console.error('[CRON-INFERENCE] Weekly Identity Inference failed:', e.message);
    }
  }, { scheduled: true, timezone: 'Asia/Jakarta' });


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
${existingFactsText.substring(0, 4000)}

=== TRANSKRIP OBROLAN HARI INI ===
${chatLog.substring(0, 6000)}

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
        true
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
              await supabaseMemories.saveUserProfile(fact.trim());
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

  console.log('[CRON] 🛡️ Telegram Alert Watchdog active (90s interval).');
  console.log('[CRON-P6] ✅ Phase 6 Proactive Crons active: Proximity, Midday, Evening, Tomorrow, Weekly Review.');
  console.log('[CRON-MEM] 🧠 Memory Consolidation active (23:59 WIB).');
  console.log('[CRON-BUDGET] 📊 Budget Recaps active (End of Week & Month).');
}

module.exports = { initCronJobs };
