const cron = require('node-cron');
const axios = require('axios');
const env = require('../config/env');
const intelligenceBrief = require('../domain/Intelligence_Brief');
const { notifyProactive, getNotifier } = require('../core/Notifier');

/**
 * Audit wrapper for background cron jobs in nexa_job_runs
 */
async function trackJobRun(jobName, runKey, jobFn) {
  const supabaseMemories = require('../infrastructure/Supabase_Memories');
  const sb = supabaseMemories.supabase;
  let jobRecordId = null;

  if (sb) {
    try {
      const { data, error } = await sb
        .from('nexa_job_runs')
        .insert({
          job_name: jobName,
          run_key: runKey,
          status: 'RUNNING',
          started_at: new Date().toISOString()
        })
        .select('id')
        .single();
      if (!error && data) jobRecordId = data.id;
    } catch (_) {}
  }

  try {
    const res = await jobFn();
    if (sb && jobRecordId) {
      await sb
        .from('nexa_job_runs')
        .update({
          status: 'OK',
          finished_at: new Date().toISOString()
        })
        .eq('id', jobRecordId)
        .catch(() => {});
    }
    return res;
  } catch (err) {
    if (sb && jobRecordId) {
      await sb
        .from('nexa_job_runs')
        .update({
          status: 'FAILED',
          finished_at: new Date().toISOString(),
          error: String(err && err.message || err).substring(0, 500)
        })
        .eq('id', jobRecordId)
        .catch(() => {});
    }
    throw err;
  }
}

function initCronJobs() {
  console.log('[CRON] Initializing N.E.X.A background jobs...');

  // 0. The Recurring Subscription & Bill Detector (03:40 WIB)
  // Menganalisis riwayat transaksi 180 hari terakhir, mendeteksi langganan rutin secara deterministik,
  // dan menyimpan ke nexa_recurring_rules di Supabase.
  cron.schedule('40 3 * * *', async () => {
    const todayKey = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' });
    await trackJobRun('detect_recurring_bills', todayKey, async () => {
      console.log('[CRON] Executing Recurring Bills Detection (Finance_Intel)...');
      try {
        const supabaseFinance = require('../infrastructure/Supabase_Finance');
        const financeIntel = require('../domain/Finance_Intel');
        const txs = await supabaseFinance.getAllTransactionsForAnalysis(180);
        if (txs && txs.length > 0) {
          const detected = financeIntel.detectRecurring(txs, { minOccurrences: 2 });
          if (detected && detected.length > 0) {
            const { upserted } = await supabaseFinance.upsertRecurringRules(detected);
            console.log(`[CRON] ✅ Recurring Bills Detection done: ${upserted} rules updated.`);
          }
        }
      } catch (err) {
        console.error('[CRON] Recurring Bills Detection failed:', err.message);
      }
    });
  }, { scheduled: true, timezone: 'Asia/Jakarta' });

  // 0.5. Notifier Flush Digest Pass (12:30 & 19:30 WIB)
  cron.schedule('30 12,19 * * *', async () => {
    try {
      console.log('[CRON] Flushing queued digest notifications...');
      await getNotifier().flushDigest();
    } catch (err) {
      console.warn('[CRON] Flush digest error:', err.message);
    }
  }, { scheduled: true, timezone: 'Asia/Jakarta' });

  // 0.6. Notifier Weekly Engagement Report (Minggu 21:30 WIB)
  cron.schedule('30 21 * * 0', async () => {
    try {
      const rep = await getNotifier().engagementReport();
      console.log('[CRON] Weekly Engagement Report:', JSON.stringify(rep));
    } catch (err) {
      console.warn('[CRON] Weekly engagement report error:', err.message);
    }
  }, { scheduled: true, timezone: 'Asia/Jakarta' });

  // 1. The Diplomat's Morning Briefing (05:30 WIB)
  cron.schedule('30 5 * * *', async () => {
    const todayKey = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' });
    await trackJobRun('morning_briefing', todayKey, async () => {
      console.log('[CRON] Executing Morning Briefing & Flushing Deferred Notifications...');
      // A. Flush deferred notifications dari semalam (Quiet Hours berakhir)
      try {
        await getNotifier().flushDeferred();
      } catch (flushErr) {
        console.warn('[CRON] Flush deferred error:', flushErr.message);
      }

      // B. Generate dan kirim Morning Briefing via Notifier Gate
      try {
        const briefingText = await intelligenceBrief.generateMorningBriefing();
        if (briefingText) {
          await notifyProactive({
            kind: 'SCHEDULED_MORNING_BRIEFING',
            priority: 'P1',
            dedupeKey: `briefing:${todayKey}`,
            text: briefingText,
            isScheduled: true
          });
        }
      } catch (e) {
        console.error('[CRON] Morning briefing failed:', e.message);
      }
    });
  }, { scheduled: true, timezone: 'Asia/Jakarta' });

  // 1.5. The Midnight Check-in (01:00 WIB)
  cron.schedule('0 1 * * *', async () => {
    const todayKey = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' });
    await trackJobRun('midnight_checkin', todayKey, async () => {
      console.log('[CRON] Executing Midnight Check-in evaluation (01:00 WIB)...');
      try {
        const bridgeAdapter = require('./mobile_bridge/adapter');
        const isScreenActive = bridgeAdapter.isScreenActive();

        if (!isScreenActive) {
          console.log('[CRON] 🌙 Midnight Check-in dilewati: Layar HP mati atau Nexa Bridge offline.');
          return;
        }

        console.log('[CRON] 📱 Midnight Check-in AKTIF: Layar HP menyala pada 01:00 WIB.');
        const checkinText = await intelligenceBrief.generateMidnightCheckin({ screenActive: true });

        // 1. Peringatan via Notifier
        await notifyProactive({
          kind: 'midnight_checkin',
          priority: 'P1',
          dedupeKey: `midnight_checkin:${todayKey}`,
          text: checkinText
        });

        // 2. Peringatan Suara Lisan (TTS) via Speaker HP Samsung
        try {
          const ttsSpeech = checkinText
            .replace(/<[^>]*>/g, '')
            .replace(/[*_`#~]/g, '')
            .replace(/\n+/g, ' ')
            .trim();

          if (ttsSpeech) {
            console.log('[CRON] 🎙️ Menyuarakannya via TTS HP Samsung A33 5G...');
            await bridgeAdapter.speakText(ttsSpeech);
          }
        } catch (ttsErr) {
          console.warn('[CRON] Gagal memicu TTS HP pada Midnight Check-in:', ttsErr.message);
        }
      } catch (e) {
        console.error('[CRON] Midnight check-in failed:', e.message);
      }
    });
  }, { scheduled: true, timezone: 'Asia/Jakarta' });

  // [PHASE 6] 1.7. Evening Reflective Diary (20:00 WIB)
  cron.schedule('0 20 * * *', async () => {
    const todayKey = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' });
    await trackJobRun('evening_briefing', todayKey, async () => {
      console.log('[CRON] Executing Evening Reflective Briefing...');
      try {
        const { sendEveningBriefing } = require('./telegram/actions');
        await sendEveningBriefing();
      } catch (e) {
        console.error('[CRON] Evening briefing failed:', e.message);
      }
    });
  }, { scheduled: true, timezone: 'Asia/Jakarta' });

  // [PHASE 6] 1.8. Weekly Cognitive Identity Inference (Minggu 21:00 WIB)
  cron.schedule('0 21 * * 0', async () => {
    const weekKey = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' });
    await trackJobRun('weekly_cognitive_pass', weekKey, async () => {
      console.log('[CRON] ── Weekly Cognitive Sunday Pass starting...');
      try {
        const inferenceEngine = require('../domain/Inference_Engine');

        const result = await inferenceEngine.runWeeklyIdentityInference();
        console.log(`[CRON] Weekly Inference done: saved=${result.saved} pendingSent=${result.pendingSent} staged=${result.staged}`);

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

          await notifyProactive({
            kind: 'SCHEDULED_WEEKLY_INFERENCE',
            priority: 'P1',
            isScheduled: true,
            dedupeKey: `weekly_inference:${weekKey}`,
            text: summaryMsg
          });
          console.log('[CRON] Inference summary sent via Notifier.');
        }

        // STEP 2: Personality Evolution Narrative
        await new Promise(r => setTimeout(r, 5000));
        try {
          const narrative = await inferenceEngine.getPersonalityEvolutionNarrative(30);
          await notifyProactive({
            kind: 'SCHEDULED_PERSONALITY_EVOLUTION',
            priority: 'P1',
            isScheduled: true,
            dedupeKey: `personality_narrative:${weekKey}`,
            text: narrative
          });
          console.log('[CRON] Personality Evolution Narrative sent via Notifier.');
        } catch (narrativeErr) {
          console.warn('[CRON] Personality narrative failed (non-blocking):', narrativeErr.message);
        }

        // STEP 3: Build Causal Knowledge Graph
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
    });
  }, { scheduled: true, timezone: 'Asia/Jakarta' });

  // [PHASE 8 — SELF-LEARNING] Weekly N.E.X.A Self-Reflection Pass (Minggu 16:00 WIB)
  // TERPISAH dari Weekly Cognitive Sunday Pass (21:00 WIB).
  // Fokus: menganalisis koreksi, anjuran, kapabilitas baru, dan keterbatasan N.E.X.A
  // berdasarkan obrolan 7 hari. Hasil langsung di-upsert ke nexa_self_model (senyap).
  // [PHASE 8 — SELF-LEARNING] Weekly N.E.X.A Self-Reflection Pass (Minggu 16:00 WIB)
  cron.schedule('0 16 * * 0', async () => {
    const weekKey = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' });
    await trackJobRun('weekly_self_reflection', weekKey, async () => {
      console.log('[CRON] ── Weekly N.E.X.A Self-Reflection Pass starting (Minggu 16:00 WIB)...');
      try {
        const inferenceEngine = require('../domain/Inference_Engine');

        const result = await inferenceEngine.runWeeklySelfReflectionPass();
        console.log(`[CRON] Self-Reflection done: upserted=${result.upserted} skipped=${result.skipped} errors=${result.errors}`);

        if (result.success && (result.upserted > 0 || result.skipped > 0)) {
          const msgParts = [
            `🪞 <b>Weekly N.E.X.A Self-Reflection Selesai</b>`,
            `<i>(Pemahaman Diri N.E.X.A — Minggu Sore)</i>`,
            ``
          ];

          if (result.upsertedTraits && result.upsertedTraits.length > 0) {
            msgParts.push(`🧩 <b>Fakta Baru / Direvisi (${result.upsertedTraits.length}):</b>`);
            result.upsertedTraits.forEach((t, i) => {
              msgParts.push(`<b>${i + 1}. [${t.layer}]</b> ${t.trait_value}`);
            });
            msgParts.push(``);
          } else {
            msgParts.push(`🧩 Fakta baru / direvisi : <b>0</b>\n`);
          }

          if (result.skippedTraits && result.skippedTraits.length > 0) {
            msgParts.push(`⏭ <b>Dilewati / Tidak Valid (${result.skippedTraits.length}):</b>`);
            result.skippedTraits.forEach((t, i) => {
              const desc = t.trait_value ? `"${t.trait_value.substring(0, 60)}${t.trait_value.length > 60 ? '...' : ''}"` : `<code>${t.trait_key}</code>`;
              msgParts.push(`• ${desc} — <i>${t.reason}</i>`);
            });
            msgParts.push(``);
          }

          msgParts.push(`<i>N.E.X.A telah memperbarui model pemahaman dirinya di database nexa_self_model.</i>`);
          await notifyProactive({
            kind: 'SCHEDULED_SELF_REFLECTION',
            priority: 'P1',
            isScheduled: true,
            dedupeKey: `self_reflection:${weekKey}`,
            text: msgParts.join('\n')
          });
        }
      } catch (e) {
        console.error('[CRON] Weekly Self-Reflection Pass failed:', e.message);
      }
    });
  }, { scheduled: true, timezone: 'Asia/Jakarta' });

  // [PHASE 7 — M1+M3] Daily Evening Pass (setiap hari 23:30 WIB)
  cron.schedule('30 23 * * *', async () => {
    const todayKey = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' });
    await trackJobRun('daily_evening_cognitive', todayKey, async () => {
      console.log('[CRON] Executing Daily Evening Cognitive Pass (MoodTimeSeries + MemoryDecay)...');

      // 1. Compute Mood Time-Series
      try {
        const behaviorEngine = require('../domain/Behavior_Engine');
        const ts = await behaviorEngine.computeMoodTimeSeries();
        if (ts) {
          console.log(`[CRON] Mood Time-Series done: 24h=${ts.mood_24h_state} | 7d=${ts.mood_7d_trend} | var=${ts.mood_7d_variance}`);
        }
      } catch (e) {
        console.error('[CRON] Mood Time-Series failed:', e.message);
      }

      // 2. Memory Decay Pass
      try {
        const inferenceEngine = require('../domain/Inference_Engine');
        const stats = await inferenceEngine.runDailyDecayPass();
        console.log(`[CRON] Decay Pass done: processed=${stats.processed} decayed=${stats.decayed} checkins=${stats.checkins} errors=${stats.errors}`);
      } catch (e) {
        console.error('[CRON] Daily Memory Decay Pass failed:', e.message);
      }

      // 3. Vector Snapshot Full Sync
      try {
        const { generateAndSaveSnapshot } = require('../utils/gemini_vector_cache.js');
        const snap = await generateAndSaveSnapshot();
        console.log(`[CRON] Vector Snapshot full sync done: ${snap.total_profiles} profiles, ${snap.total_identities} identities.`);
      } catch (vErr) {
        console.warn('[CRON] Vector snapshot sync failed (non-blocking):', vErr.message);
      }
    });
  }, { scheduled: true, timezone: 'Asia/Jakarta' });

  // [PHASE 7 — M1+M2] Morning Pass (setiap hari 08:15 WIB)
  cron.schedule('15 8 * * *', async () => {
    const todayKey = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' });
    await trackJobRun('morning_cognitive_pass', todayKey, async () => {
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
    });
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
            await notifyProactive({
              kind: 'pending_transaction_alert',
              priority: 'P0',
              timeSensitive: true,
              dedupeKey: `watchdog:${compositeKey}`,
              text: msg
            });
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
        
        await notifyProactive({
          kind: 'overdue_tasks',
          priority: 'P1',
          dedupeKey: `overdue:${new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' })}`,
          text: alertMsg
        });
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

          // Event proximity is TIME-SENSITIVE P0 and expires when event starts
          const delivered = await notifyProactive({
            kind: 'event_proximity',
            priority: 'P0',
            timeSensitive: true,
            expiresAt: startTime.toISOString(),
            dedupeKey: `proximity:${e.id}`,
            text: msg
          });

          if (delivered && delivered.status === 'SENT') {
            _notifiedEventIds.add(e.id);
            // Hapus dari cache setelah 2 jam
            setTimeout(() => _notifiedEventIds.delete(e.id), 2 * 60 * 60 * 1000);
            console.log(`[CRON-P6] ✅ Proximity alert sent for event: "${e.summary}" (${minutesLeft}m left)`);
          }
        }
      }
    } catch (e) {
      console.error('[CRON-P6] Proximity Alert failed:', e.message);
    }
  }, { scheduled: true, timezone: 'Asia/Jakarta' });

  // 7. [P6] Midday Pulse (12:00 WIB)
  cron.schedule('0 12 * * *', async () => {
    const todayKey = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' });
    await trackJobRun('midday_pulse', todayKey, async () => {
      console.log('[CRON-P6] Executing Midday Pulse...');
      try {
        const googleTasks = require('../infrastructure/Google_Tasks');
        const financeEngine = require('../domain/Finance_Engine');
        const supabaseMemories = require('../infrastructure/Supabase_Memories');
        const { executeWithFallback } = require('../core/Fallback_Engine');

        const [todayTasks, recentFinance, todayMems] = await Promise.allSettled([
          googleTasks.getTasksDueToday(),
          financeEngine.getRecentTransactions(3),
          supabaseMemories.getTodayMemories()
        ]);

        const taskCount = todayTasks.status === 'fulfilled' ? (todayTasks.value || []).length : 0;
        const financeText = recentFinance.status === 'fulfilled' ? recentFinance.value : '(data keuangan tidak tersedia)';
        
        let morningLog = '';
        if (todayMems.status === 'fulfilled' && todayMems.value && todayMems.value.length > 0) {
          morningLog = todayMems.value.map(m => `[${m.role.toUpperCase()}]: ${m.content}`).join('\n');
        }

        const prompt = `Anda adalah N.E.X.A. Susun pesan Midday Pulse (sapaan siang) yang sangat natural, hangat, dan peka konteks untuk Tuan Faqih.

Tugas Jatuh Tempo Hari Ini: ${taskCount} tugas.
Ringkasan Keuangan (3 tx terakhir): ${typeof financeText === 'string' ? financeText.replace(/<[^>]+>/g, '') : '(kosong)'}.

Transkrip Obrolan dari Pagi Tadi (Gunakan sebagai konteks utama):
${morningLog ? morningLog.substring(0, 15000) : '(Belum ada percakapan hari ini)'}

Instruksi:
1. Sapa Tuan Faqih dengan hangat (misal "Selamat siang, Tuan Faqih").
2. Berdasarkan transkrip pagi, tanyakan kelanjutan hal yang dibahas pagi tadi (misalnya apakah fokus hari ini berjalan lancar, atau menanyakan progres masalah spesifik yang sempat dibahas).
3. Singgung tugas (jika ada) dan keuangan dengan luwes, BUKAN seperti robot pembaca laporan.
4. Panjang pesan 3-4 kalimat saja.
5. Jangan gunakan format JSON atau markdown **bold**. Output berupa teks pesan langsung.
`;

        const pulseText = await executeWithFallback(prompt, "Anda adalah N.E.X.A, asisten Tuan Faqih.", 0.7, false, { forceHeavy: true });
        if (pulseText) {
          const cleanPulseText = pulseText.replace(/```json/g, '').replace(/```/g, '').trim();
          await notifyProactive({
            kind: 'SCHEDULED_MIDDAY_PULSE',
            priority: 'P1',
            isScheduled: true,
            dedupeKey: `pulse:${todayKey}`,
            text: `🌤️ <b>Midday Pulse</b>\n\n${cleanPulseText}`
          });
        }
      } catch (e) {
        console.error('[CRON-P6] Midday Pulse failed:', e.message);
      }
    });
  }, { scheduled: true, timezone: 'Asia/Jakarta' });

  // 8. [P6] Evening Debrief (17:00 WIB)
  cron.schedule('0 17 * * *', async () => {
    const todayKey = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' });
    await trackJobRun('evening_debrief', todayKey, async () => {
      console.log('[CRON-P6] Executing Evening Debrief...');
      try {
        const { executeWithFallback } = require('../core/Fallback_Engine');
        const supabaseMemories = require('../infrastructure/Supabase_Memories');

        const jakartaDate = new Date().toLocaleDateString('id-ID', {
          weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
          timeZone: 'Asia/Jakarta'
        });

        const mems = await supabaseMemories.getTodayMemories();
        let dayLog = '';
        if (mems && mems.length > 0) {
          dayLog = mems.map(m => `[${m.role.toUpperCase()}]: ${m.content}`).join('\n');
        }

        const prompt = `Hari ini adalah ${jakartaDate}. Anda adalah N.E.X.A, asisten Tuan Faqih.
Susun pesan Evening Debrief (sapaan sore/penutup hari) yang sangat natural, hangat, dan peka konteks.

Transkrip Obrolan Hari Ini (Gunakan sebagai konteks utama):
${dayLog ? dayLog.substring(0, 15000) : '(Belum ada percakapan hari ini)'}

Instruksi:
1. Ucapkan bahwa hari hampir selesai dengan nada suportif.
2. Berdasarkan transkrip hari ini, singgung progres atau masalah yang dibahas hari ini (terutama sejak siang/Midday Pulse). Jika Tuan Faqih sedang sibuk atau menyelesaikan sesuatu, berikan apresiasi.
3. Tanyakan pencapaian hari ini atau tanyakan apakah ada hal yang perlu dicatat/diingat untuk besok.
4. Panjang pesan 3-4 kalimat saja.
5. Jangan gunakan format JSON atau markdown **bold**. Output berupa teks pesan langsung.
`;

        const debriefText = await executeWithFallback(prompt, "Anda adalah N.E.X.A, asisten Tuan Faqih.", 0.7, false, { forceHeavy: true });
        if (debriefText) {
          const cleanDebriefText = debriefText.replace(/```json/g, '').replace(/```/g, '').trim();
          await notifyProactive({
            kind: 'SCHEDULED_EVENING_DEBRIEF',
            priority: 'P1',
            isScheduled: true,
            dedupeKey: `debrief:${todayKey}`,
            text: `🌇 <b>Evening Debrief</b>\n\n${cleanDebriefText}`
          });
        }
      } catch (e) {
        console.error('[CRON-P6] Evening Debrief failed:', e.message);
      }
    });
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
    const todayKey = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' });
    await trackJobRun('tomorrow_prep', todayKey, async () => {
      console.log('[CRON-P6] Executing Tomorrow Prep...');
      try {
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
          await notifyProactive({
            kind: 'SCHEDULED_TOMORROW_PREP',
            priority: 'P1',
            isScheduled: true,
            dedupeKey: `tomorrow_prep:${todayKey}`,
            text: header + `\n${prepText}`
          });
        }
      } catch (e) {
        console.error('[CRON-P6] Tomorrow Prep failed:', e.message);
      }
    });
  }, { scheduled: true, timezone: 'Asia/Jakarta' });

  // ================================================================
  // [PHASE 6 — Pilar 8.2] BEHAVIORAL PATTERN ENGINE — Weekly Review
  // ================================================================

  // 10. [P6] Weekly Behavior Summary (Every Sunday 20:00 WIB)
  cron.schedule('0 20 * * 0', async () => {
    const weekKey = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' });
    await trackJobRun('weekly_behavior_review', weekKey, async () => {
      console.log('[CRON-P6] Executing Weekly Behavior Review...');
      try {
        const behaviorEngine = require('../domain/Behavior_Engine');

        const summary = await behaviorEngine.getWeeklySummary();
        const formatted = behaviorEngine.formatWeeklySummary(summary);

        if (formatted) {
          await notifyProactive({
            kind: 'SCHEDULED_BEHAVIOR_SUMMARY',
            priority: 'P1',
            isScheduled: true,
            dedupeKey: `behavior_summary:${weekKey}`,
            text: formatted
          });
          console.log('[CRON-P6] Weekly Behavior Review sent.');
        }
      } catch (e) {
        console.error('[CRON-P6] Weekly Behavior Review failed:', e.message);
      }
    });
  }, { scheduled: true, timezone: 'Asia/Jakarta' });

  // [BUG FIX #1] Blok cron Phase 6 '0 21 * * 0' yang duplikat telah DIHAPUS.
  // Logika summaryMsg sudah dipindahkan ke dalam orchestrator Phase 7 di atas (STEP 1).
  // Hanya SATU schedule '0 21 * * 0' yang boleh aktif.


  // ================================================================

  // 11. Daily Memory Consolidation (23:50 WIB - 5 min stagger)
  cron.schedule('50 23 * * *', async () => {
    const todayKey = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' });
    await trackJobRun('daily_memory_consolidation', todayKey, async () => {
      console.log('[CRON-MEM] Executing Daily Memory Consolidation (Dedup-Aware v2)...');
      try {
        const supabaseMemories = require('../infrastructure/Supabase_Memories');
        const aiRouter = require('../core/AI_Router');

        const todayMemories = await supabaseMemories.getTodayMemories();
        if (!todayMemories || todayMemories.length === 0) {
          console.log('[CRON-MEM] No chat activity today. Skipping consolidation.');
          return;
        }

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
          { forceHeavy: true }
        );

        try {
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
            await notifyProactive({
              kind: 'memory_consolidation',
              priority: 'P2',
              dedupeKey: `mem_consolidate:${todayKey}`,
              text: `🧠 <b>Memory Consolidation</b>\n` +
                `Saya mempelajari <b>${parsed.length}</b> fakta baru tentang Tuan hari ini:\n\n` +
                `${factsList}\n\n` +
                `<i>(Duplikasi otomatis diabaikan)</i>`
            });
          } else {
            console.log('[CRON-MEM] No genuinely new facts found — all already known. No write performed.');
          }
        } catch (err) {
          console.log('[CRON-MEM] AI did not return a valid JSON array or no facts found:', result?.substring(0, 200));
        }
      } catch (e) {
        console.error('[CRON-MEM] Memory Consolidation failed:', e.message);
      }
    });
  }, { scheduled: true, timezone: 'Asia/Jakarta' });

  // 12. Weekly Budget Recap (Sunday 23:55 WIB - 5 min stagger)
  cron.schedule('55 23 * * 0', async () => {
    const weekKey = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' });
    await trackJobRun('weekly_budget_recap', weekKey, async () => {
      console.log('[CRON-BUDGET] Executing Weekly Budget Recap...');
      try {
        const budgetEngine = require('../domain/Budget_Engine');
        const msg = await budgetEngine.generatePeriodicRecap('weekly');
        if (msg) {
          await notifyProactive({
            kind: 'SCHEDULED_WEEKLY_BUDGET',
            priority: 'P1',
            isScheduled: true,
            dedupeKey: `budget_weekly:${weekKey}`,
            text: msg
          });
          console.log('[CRON-BUDGET] Weekly Recap sent via Notifier.');
        }
      } catch (e) {
        console.error('[CRON-BUDGET] Weekly Recap failed:', e.message);
      }
    });
  }, { scheduled: true, timezone: 'Asia/Jakarta' });

  // 13. Monthly Budget Recap (Last Day of Month 23:59 WIB)
  cron.schedule('59 23 28-31 * *', async () => {
    const today = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Jakarta' }));
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);
    
    if (tomorrow.getDate() === 1) { // Today is the last day
      const monthKey = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' }).slice(0, 7);
      await trackJobRun('monthly_budget_recap', monthKey, async () => {
        console.log('[CRON-BUDGET] Executing Monthly Budget Recap...');
        try {
          const budgetEngine = require('../domain/Budget_Engine');
          const msg = await budgetEngine.generatePeriodicRecap('monthly');
          if (msg) {
            await notifyProactive({
              kind: 'SCHEDULED_MONTHLY_BUDGET',
              priority: 'P1',
              isScheduled: true,
              dedupeKey: `budget_monthly:${monthKey}`,
              text: msg
            });
            console.log('[CRON-BUDGET] Monthly Recap sent via Notifier.');
          }
        } catch (e) {
          console.error('[CRON-BUDGET] Monthly Recap failed:', e.message);
        }
      });
    }
  }, { scheduled: true, timezone: 'Asia/Jakarta' });

  // 14. [PHASE 8] Auto-Escalation Checker (Every 1 Minute)
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
  cron.schedule('0 2 * * 0', async () => {
    const weekKey = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' });
    await trackJobRun('memory_hygiene', weekKey, async () => {
      console.log('[CRON-HYGIENE] Memory Hygiene Pipeline triggered (Minggu 02:00 WIB)...');
      try {
        const { runFullHygienePipeline } = require('../domain/Memory_Hygiene_Engine');
        await runFullHygienePipeline();
      } catch (e) {
        console.error('[CRON-HYGIENE] Memory Hygiene Pipeline failed:', e.message);
      }
    });
  }, { scheduled: true, timezone: 'Asia/Jakarta' });

  // 15. [PHASE 11] Daily Chrono-Consolidation (03:30 WIB)
  cron.schedule('30 3 * * *', async () => {
    const todayKey = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' });
    await trackJobRun('chrono_consolidation', todayKey, async () => {
      console.log('[CRON-CHRONO] Daily Chrono-Consolidation triggered (03:30 WIB)...');
      try {
        const chrono = require('../domain/Chrono_Consolidator');
        const results = await chrono.runDailyChronoConsolidation({ dryRun: false, maxDaysPerRun: 7, olderThanDays: 90 });
        if (results.savedNarratives > 0) {
          console.log(`[CRON-CHRONO] Successfully consolidated ${results.savedNarratives} days (${results.totalChatsCompressed} raw chats pruned).`);
          await notifyProactive({
            kind: 'chrono_consolidation',
            priority: 'P2',
            dedupeKey: `chrono:${todayKey}`,
            text: `📜 <b>Chrono-Consolidation N.E.X.A</b>\n` +
              `Berhasil mengompresi <b>${results.savedNarratives} hari</b> obrolan lampau (${results.totalChatsCompressed} pesan mentah) menjadi catatan narasi harian permanen.`
          });
        }
      } catch (e) {
        console.error('[CRON-CHRONO] Daily Chrono-Consolidation failed:', e.message);
      }
    });
  }, { scheduled: true, timezone: 'Asia/Jakarta' });

  console.log('[CRON] 🛡️ Telegram Alert Watchdog active (90s interval).');
  console.log('[CRON-PROACTIVE] ✅ Proactive Crons active: Proximity, Midday, Evening, Tomorrow, Weekly Review.');
  console.log('[CRON-MEM] 🧠 Memory Consolidation active (23:59 WIB).');
  console.log('[CRON-BUDGET] 📊 Budget Recaps active (End of Week & Month).');
  console.log('[CRON-DISCIPLINE] ⚡ Discipline Auto-Escalation active (1m interval).');
  console.log('[CRON-HYGIENE] 🧹 Memory Hygiene Pipeline active (Minggu 02:00 WIB).');
  console.log('[CRON-CHRONO] 📜 Chrono-Consolidation active (03:30 WIB).');
}

module.exports = { initCronJobs };
