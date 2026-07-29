'use strict';
// ============================================================
// N.E.X.A — CLI INTERFACE ADAPTER  (Full Parity v2.9)
// Semua intent domain handler identik dengan telegram/adapter.js
// ============================================================

const aiRouter          = require('../../core/AI_Router');
const { invalidatePersonalFactsCache } = aiRouter;
const supabaseMemories  = require('../../infrastructure/Supabase_Memories');
const anticipatoryEngine = require('../../domain/Anticipatory_Engine');
const financeEngine     = require('../../domain/Finance_Engine');
const godMode           = require('../../domain/Discipline_GodMode');
const taskManager       = require('../../domain/Task_Manager');
const webSearch         = require('../../infrastructure/Web_Search');
const googleWorkspace   = require('../../infrastructure/Google_Workspace');

// ── In-Memory Session Store ──────────────────────────────────
// Menyimpan conversationContext per session_id agar CLI punya
// memori percakapan selama server berjalan.
const cliSessions = new Map();

// ── SSE Active Connections ───────────────────────────────────
const activeCliStreams = new Set();

// ── Pending Contexts (paralel dengan Telegram adapter) ────────
// Setiap session_id memiliki pending context-nya sendiri
const cliPendingCalendar   = new Map(); // session_id → { summary, start, askedAt }
const cliPendingConflict   = new Map(); // session_id → pendingEvent
const cliPendingEmail      = new Map(); // session_id → { searchKeyword, lastBatch, ... }
const cliPendingDatabase   = new Map(); // session_id → { tableName, lastAction, ... }

// ── Advice Session Counter (Overthinking Tracker) ─────────────
const _adviceSessionMap = new Map();
const ADVICE_SESSION_TTL_MS = 60 * 60 * 1000; // 1 jam

function _trackAdviceSession(sessionId) {
  const key = String(sessionId || 'cli-default');
  const now = Date.now();
  const session = _adviceSessionMap.get(key);
  if (!session || (now - session.lastAt) > ADVICE_SESSION_TTL_MS) {
    _adviceSessionMap.set(key, { count: 1, lastAt: now });
    return 1;
  }
  const newCount = session.count + 1;
  _adviceSessionMap.set(key, { count: newCount, lastAt: now });
  return newCount;
}

function _getAdviceSessionCount(sessionId) {
  const key = String(sessionId || 'cli-default');
  const now = Date.now();
  const session = _adviceSessionMap.get(key);
  if (!session || (now - session.lastAt) > ADVICE_SESSION_TTL_MS) return 0;
  return session.count;
}

// ── Helper: strip HTML tags untuk output CLI ─────────────────
function _stripHtml(str) {
  return String(str || '').replace(/<[^>]*>/g, '').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&amp;/g,'&').replace(/&quot;/g,'"');
}

// ── Helper: isFactAboutNexa (copy dari telegram/adapter.js) ───
function _isFactAboutNexa(fact) {
  const f = fact.toLowerCase().trim();
  let score = 0;
  if (/\b(aku|saya|gue|gw)\b/.test(f)) score -= 2;
  const hasTuanName = /\b(tuan|faqih|hidayatulloh)\b/.test(f);
  const tuanIsSubject = /^(tuan|faqih)/.test(f) || /\b(tuan faqih|faqih)\s+(punya|memiliki|suka|biasa|kuliah|adalah)\b/.test(f);
  if (hasTuanName && tuanIsSubject) score -= 2;
  else if (hasTuanName) score -= 1;
  if (/\w+ku\b/.test(f) && !/\b(namaku|diriku sebagai)\b/.test(f)) score -= 1;
  if (/\b(nexa|n\.e\.x\.a)\b/.test(f)) score += 3;
  if (/^(kamu|anda|kau)\b/.test(f)) score += 2;
  if (/\b(kamu|anda|kau)\s+(adalah|itu|merupakan|diciptakan|dibuat|diluncurkan|punya|memiliki|bernama|disebut|bisa|dapat|mampu|tidak bisa|tidak mampu|sering|selalu|harus|jangan)\b/.test(f)) score += 2;
  if (/\b(diciptakan|dibuat|diluncurkan|lahir|dirancang|diprogram|dibangun)\b/.test(f)) score += 1;
  if (/\b(namamu|nama kamu|nama asisten|versimu|versi kamu|kemampuanmu|kemampuan kamu|identitasmu)\b/.test(f)) score += 2;
  if (/\b(kamu|anda|kau)\s+(bisa|dapat|mampu|tidak bisa|tidak mampu|belum bisa)\b/.test(f)) score += 1;
  if (/^(bot|asisten|ai)\b/.test(f)) score += 2;
  if (/\b(bot|asisten ai|model ai|sistem ai|ai asisten|kecerdasan buatan)\b/.test(f)) score += 1;
  if (/\b(dirimu|diri kamu|diri anda)\b/.test(f)) score += 2;
  if (/\b(ingat ya|catat ini|harap|tolong jangan|jangan terlalu|sebaiknya kamu|kamu seharusnya|kamu perlu|kamu harus|kamu sebaiknya)\b/.test(f)) score += 1;
  if (/\b(ternyata kamu|kamu ternyata|sebenarnya kamu|rupanya kamu)\b/.test(f)) score += 2;
  if (/\b(format (jawaban|balasan|respons)|gaya (bahasa|bicara|komunikasi)|responsmu|balasanmu|jawabanmu)\b/.test(f)) score += 1;
  return score > 0;
}

// ── Endpoint SSE GET /webhook/cli/stream ──────────────────────
function handleCliStream(req, res) {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();
  console.log('[CLI-STREAM] Client connected.');
  activeCliStreams.add(res);
  res.write(`data: ${JSON.stringify({ type: 'connected', message: 'SSE Connection Established' })}\n\n`);
  req.on('close', () => {
    console.log('[CLI-STREAM] Client disconnected.');
    activeCliStreams.delete(res);
  });
}

// ── Push Notifikasi ke semua CLI yang terhubung ───────────────
function pushToCli(text) {
  if (activeCliStreams.size === 0) return false;
  const payload = `data: ${JSON.stringify({ type: 'notification', message: text })}\n\n`;
  for (const res of activeCliStreams) {
    try { res.write(payload); } catch (err) {
      console.error('[CLI-STREAM] Error pushing to client:', err.message);
      activeCliStreams.delete(res);
    }
  }
  return true;
}

// ── Conversational Synthesis (ringkasan AI setelah aksi domain) ─
function _triggerConversationalSynthesis(textInput, resultMessage, _action, sessionId) {
  setTimeout(async () => {
    try {
      const { executeWithFallback } = require('../../core/Fallback_Engine');
      const { NEXA_PERSONALITY } = require('../../config/personality');
      const prompt = `System Time (Asia/Jakarta): ${new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })}\nUser Asked: "${textInput}"\n\nDashboard / Result:\n${resultMessage}\n\nTask: Write a 1-2 sentence friendly, caring response IN INDONESIAN analyzing the operation or schedule above. Act as a dedicated, elegant personal assistant. Provide a brief relevant suggestion, encouragement, prep tip, priority guidance, or warm appreciation. DO NOT repeat the items, events, or confirmation text. Keep it concise, warm, and natural. DO NOT wrap your response in quotation marks or speech marks. Answer directly without quotes.`;
      const advice = await executeWithFallback(prompt, NEXA_PERSONALITY, 0.7, false);
      if (advice && !advice.includes('DUMB_MODE')) {
        pushToCli(advice.replace(/^["']|["']$/g, ''));
      }
    } catch (_) {}
  }, 1500);
}

// ============================================================
// ── FULL INTENT DOMAIN DISPATCHER ────────────────────────────
// Identik dengan switch-case di telegram/adapter.js
// ============================================================
async function _dispatchIntent(intent, routingData, textInput, sessionId) {
  let domainReply = null;
  const ed = routingData?.extracted_data || {};

  // Helper format memory reply
  const _formatMemoryReply = (aiReply, fallbackText, badgeText) => {
    const base = (aiReply && typeof aiReply === 'string' && aiReply.trim().length > 3)
      ? aiReply.trim() : fallbackText;
    return `${base}\n\n${badgeText}`;
  };

  switch (intent) {

    // ────────────────────────────────────────────────────────
    // FINANCE — semua 18+ sub-action identik Telegram
    // ────────────────────────────────────────────────────────
    case 'FINANCE': {
      if (ed.action === 'IMPORT_FROM_EMAIL') {
        const gmailClient = require('../../infrastructure/Gmail_Client');
        const pendingEmail = cliPendingEmail.get(sessionId);
        const candidateEmails = pendingEmail?.lastBatch?.length
          ? pendingEmail.lastBatch
          : await gmailClient.getLatestEmails('livin OR from:noreply.livin@bankmandiri.co.id', 30);
        const txRows = _extractFinanceTxFromEmails(candidateEmails);
        if (txRows.length === 0) {
          domainReply = '📭 Data transaksi keuangan otomatis tidak ditemukan di email yang dianalisis. Coba sebutkan rentang waktu yang lebih jelas, Tuan.';
          break;
        }
        let success = 0, duplicate = 0;
        for (const tx of txRows.slice(0, 20)) {
          try {
            const result = await financeEngine.processTransaction(tx, 'GMAIL_POLLING');
            if (result?.status === 'DUPLICATE') duplicate++;
            else success++;
          } catch (_) {}
        }
        domainReply = `✅ Sinkronisasi Keuangan selesai.\n- Berhasil dicatat: ${success}\n- Duplikasi diabaikan: ${duplicate}\n- Sumber dianalisis: ${txRows.length} transaksi email`;

      } else if (ed.action === 'READ_LATEST') {
        const hasFilter = ed.date_text || ed.search_keyword || ed.type || ed.category;
        if (hasFilter) {
          domainReply = await financeEngine.searchTransactions({ date_text: ed.date_text || ed.time || null, keyword: ed.search_keyword || null, type: ed.type || null, category: ed.category || null, limit: ed.limit || 30 });
        } else {
          domainReply = await financeEngine.getRecentTransactions(5);
        }

      } else if (ed.action === 'READ_ANALYTICS') {
        const analyticsData = await financeEngine.getFinanceAnalytics(ed.date_text);
        domainReply = (routingData.reply_message ? routingData.reply_message + '\n\n' : '') + analyticsData;

      } else if (ed.action === 'DELETE') {
        const result = await financeEngine.deleteTransaction(ed.search_keyword);
        domainReply = result.message;

      } else if (ed.action === 'UNDO_DELETE') {
        const result = await financeEngine.undoDeleteTransaction();
        domainReply = result.message;

      } else if (ed.action === 'CONFIRM_TRANSACTION') {
        const confirmationReply = await financeEngine.confirmPendingTransactions(true, ed.description || null, ed.category || null, null, null, null);
        domainReply = confirmationReply || '✅ Tidak ada transaksi yang tertunda. Kemungkinan transaksi telah disimpan otomatis karena melewati batas waktu 5 menit.';

      } else if (ed.action === 'UPDATE_PENDING') {
        const updatedMsg = await financeEngine.updatePendingTransaction(ed.description || null, ed.category || null, ed.nominal || null, ed.account || null, ed.payment_method || null, null);
        domainReply = updatedMsg || '❌ Tidak ada transaksi yang tertunda untuk diubah.';

      } else if (ed.action === 'CANCEL_TRANSACTION') {
        const confirmationReply = await financeEngine.confirmPendingTransactions(false, null, null, null, null, null);
        domainReply = confirmationReply || 'Tidak ada transaksi yang tertunda.';

      } else if (ed.action === 'EDIT') {
        let kw = ed.search_keyword;
        if (!kw || /^(ini|itu|transaksi|kategori|perbaiki|ubah|sesuaikan|yang|saya|\s)*$/i.test(String(kw).trim())) {
          kw = 'latest';
        }
        const result = await financeEngine.editTransaction(kw, ed.nominal, ed.description || ed.destination, ed.category, ed.account, ed.payment_method);
        domainReply = result.message;

      } else if (ed.action === 'CATEGORY_BREAKDOWN') {
        domainReply = await financeEngine.getCategoryInsight(ed.date_text || null);

      } else if (ed.action === 'PERIOD_COMPARISON') {
        domainReply = await financeEngine.getPeriodComparisonReport(ed.date_text || null);

      } else if (ed.action === 'TOP_EXPENSES') {
        domainReply = await financeEngine.getTopExpensesReport(ed.date_text || null, ed.limit || 5);

      } else if (ed.action === 'ACCOUNT_BALANCES') {
        domainReply = await financeEngine.getAccountBalancesReport();

      } else if (ed.action === 'DAILY_TREND') {
        domainReply = await financeEngine.getDailyTrendReport(ed.date_text || null);

      } else if (ed.action === 'SMART_SUMMARY') {
        domainReply = await financeEngine.getSmartFinanceSummary(ed.date_text || null);

      } else if (ed.action === 'MONTHLY_SUMMARY') {
        domainReply = await financeEngine.getMonthlySummaryReport();

      } else if (ed.action === 'SAVING_RATE') {
        domainReply = await financeEngine.getSavingRateReport(ed.date_text || null);

      } else if (ed.action === 'BALANCE_TREND') {
        domainReply = await financeEngine.getDailyBalanceTrendReport(ed.date_text || null);

      } else if (ed.action === 'RECORD_MULTIPLE' && Array.isArray(ed.transactions)) {
        const replies = [];
        for (const tx of ed.transactions) {
          const txData = {
            nominal: tx.nominal, type: tx.type || 'EXPENSE',
            destination: tx.destination || tx.merchant || 'Unknown',
            category: tx.category || 'Uncategorized',
            description: tx.description || '-',
            time: tx.time || new Date().toISOString(),
            account: tx.account || null, payment_method: tx.payment_method || null
          };
          const confirmMsg = await financeEngine.requestTransactionConfirmation(txData, 'PENCATATAN KEUANGAN BARU');
          replies.push(confirmMsg || `⚠️ Transaksi ${txData.nominal} ke ${txData.destination} tampaknya sudah dicatat.`);
          const cKey = `${txData.nominal}_${(txData.destination || '').toLowerCase().replace(/[^a-z0-9]/g, '')}`;
          supabaseMemories.markPendingTransactionSent(cKey).catch(() => {});
        }
        domainReply = replies.join('\n\n---\n\n');

      } else if (ed.nominal || ed.action === 'RECORD') {
        const txData = {
          nominal: ed.nominal, type: ed.type || 'EXPENSE',
          destination: ed.destination || ed.merchant || 'Unknown',
          category: ed.category || 'Uncategorized',
          description: ed.description || '-',
          time: ed.time || new Date().toISOString(),
          account: ed.account || null, payment_method: ed.payment_method || null
        };
        const confirmMsg = await financeEngine.requestTransactionConfirmation(txData, 'PENCATATAN KEUANGAN BARU');
        if (confirmMsg) {
          domainReply = confirmMsg;
          const cKey = `${txData.nominal}_${(txData.destination || '').toLowerCase().replace(/[^a-z0-9]/g, '')}`;
          supabaseMemories.markPendingTransactionSent(cKey).catch(() => {});
        } else {
          domainReply = '⚠️ Transaksi ini tampaknya sudah pernah dicatat sebelumnya (duplikat) atau sedang menunggu konfirmasi.';
        }
      }
      break;
    }

    // ────────────────────────────────────────────────────────
    // DISCIPLINE — God Mode trigger
    // ────────────────────────────────────────────────────────
    case 'DISCIPLINE': {
      if (routingData.god_mode_trigger) {
        await godMode.triggerGodMode(3, { source: 'CLI Instruction' });
      }
      domainReply = routingData.reply_message || '⚡ Mode disiplin diaktifkan.';
      break;
    }

    // ────────────────────────────────────────────────────────
    // CALENDAR — via Agenda_Manager
    // ────────────────────────────────────────────────────────
    case 'CALENDAR': {
      if (ed) {
        const agendaManager = require('../../domain/Agenda_Manager');
        const calData = ed.CALENDAR || ed;
        const pendingCal = cliPendingCalendar.get(sessionId);

        // Sanitize hallucinated summary untuk READ actions
        if (calData.summary && typeof calData.summary === 'string' && ['READ', 'READ_TODAY', 'READ_TOMORROW', 'READ_UPCOMING'].includes(calData.action)) {
          const sLower = calData.summary.trim().toLowerCase();
          if (sLower.length > 25 || /adalah|tidak ada|jadwal|tugas|jatuh tempo|hari besok|hari ini|minggu ini|senin|selasa|rabu|kamis|jumat|sabtu|minggu|juli|agustus|januari|februari|maret|april|mei|juni|september|oktober|november|desember|202[0-9]/i.test(sLower)) {
            console.warn(`[CLI-CAL] Hallucinated READ summary ignored: "${calData.summary}"`);
            calData.summary = null;
          }
        }

        // Merge pending calendar jika ada context sebelumnya
        if (pendingCal && calData.action === 'CREATE' && calData.end && !calData.summary) {
          calData.summary = pendingCal.summary;
          calData.start = pendingCal.start;
          agendaManager.cancelPending(pendingCal.summary);
          cliPendingCalendar.delete(sessionId);
        }

        const calResult = await agendaManager.handleCalendarIntent(calData, textInput);

        if (calResult?.status === 'PENDING_END') {
          cliPendingCalendar.set(sessionId, { summary: calData.summary, start: calData.start, askedAt: Date.now() });
        } else if (calResult?.status === 'CONFLICT_DETECTED') {
          cliPendingConflict.set(sessionId, { ...calResult.pendingEvent, askedAt: Date.now() });
        } else if (calResult?.status === 'SUCCESS') {
          cliPendingCalendar.delete(sessionId);
          cliPendingConflict.delete(sessionId);
        }

        if (calResult?.message) {
          domainReply = calResult.message;
          const action = calData.action;
          let isPast = false;
          if (calData.start) {
            const reqDate = new Date(calData.start);
            const jakartaDateStr = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' });
            const todayJakartaStart = new Date(`${jakartaDateStr}T00:00:00+07:00`);
            if (reqDate < todayJakartaStart) isPast = true;
          }
          if (!isPast && ['CREATE', 'UPDATE', 'READ', 'READ_TODAY', 'READ_TOMORROW', 'READ_UPCOMING'].includes(action)) {
            _triggerConversationalSynthesis(textInput, calResult.message, action, sessionId);
          }
        }
      }
      break;
    }

    // ────────────────────────────────────────────────────────
    // TASK — via Task_Manager + pending context + auto-timer
    // ────────────────────────────────────────────────────────
    case 'TASK': {
      if (ed) {
        const taskResult = await taskManager.handleTaskIntent(ed, sessionId);

        if (taskResult?.status === 'PENDING_CONFIRM') {
          const { pendingTaskCategories, executePendingTask } = taskManager;
          const old = pendingTaskCategories.get(sessionId);
          if (old?.timerId) clearTimeout(old.timerId);
          const timerId = setTimeout(async () => {
            if (pendingTaskCategories.has(sessionId)) {
              try {
                const res = await executePendingTask(sessionId);
                if (res?.message) pushToCli(res.message + '\n\n(Dikategorikan otomatis karena tidak ada konfirmasi dalam 5 menit)');
              } catch (e) { console.error('[CLI-TASK] Auto-confirm failed:', e.message); }
            }
          }, 5 * 60 * 1000);
          pendingTaskCategories.set(sessionId, {
            type: 'CONFIRM_LIST', title: taskResult.title, notes: taskResult.notes,
            dueDate: taskResult.due_date, listName: taskResult.pendingListName,
            durationMins: taskResult.durationMins, hasAutonomousBlock: taskResult.hasAutonomousBlock,
            syncCalendar: taskResult.sync_calendar || false,
            calendarStartTime: taskResult.calendar_start_time || null,
            timerId, chatId: sessionId
          });
          domainReply = `📋 Tugas '${taskResult.title}' akan saya masukkan ke list ${taskResult.pendingListName}.\n\nKonfirmasi? Balas:\n• ya — masukkan sekarang\n• nama list lain — pindah ke list tersebut\n• tidak — masukkan ke Tugas Saya\n\n⏱️ Auto-masuk dalam 5 menit jika tidak ada respons.`;

        } else if (taskResult?.status === 'PENDING_DURATION') {
          const { pendingTaskCategories, executePendingTask } = taskManager;
          const old = pendingTaskCategories.get(sessionId);
          if (old?.timerId) clearTimeout(old.timerId);
          const timerId = setTimeout(async () => {
            if (pendingTaskCategories.has(sessionId)) {
              try {
                const res = await executePendingTask(sessionId);
                if (res?.message) pushToCli(res.message);
              } catch (e) { console.error('[CLI-TASK] Auto-create without block failed:', e.message); }
            }
          }, 5 * 60 * 1000);
          pendingTaskCategories.set(sessionId, {
            type: 'CONFIRM_DURATION', title: taskResult.title, notes: taskResult.notes,
            dueDate: taskResult.due_date, listName: taskResult.list_name,
            durationMins: 0, hasAutonomousBlock: false, timerId, chatId: sessionId
          });
          domainReply = taskResult.message;

        } else if (taskResult?.status === 'PENDING_SYNC_CONFIRM') {
          const { pendingTaskCategories } = taskManager;
          const old = pendingTaskCategories.get(sessionId);
          if (old?.timerId) clearTimeout(old.timerId);
          const timerId = setTimeout(async () => {
            if (pendingTaskCategories.has(sessionId)) {
              try {
                const pd = pendingTaskCategories.get(sessionId);
                pendingTaskCategories.delete(sessionId);
                const floatRes = await taskManager.handleTaskIntent({
                  action: 'CREATE', title: pd.title, notes: pd.notes,
                  due_date: pd.dueDate, list_name: pd.listName,
                  duration_minutes: pd.durationMins, sync_calendar: false, calendar_start_time: null,
                }, null);
                if (floatRes?.message) pushToCli(floatRes.message + '\n\n(Tugas disimpan tanpa sinkronisasi kalender karena tidak ada respons dalam 5 menit)');
              } catch (e) { console.error('[CLI-TASK SYNC] Auto-create floating failed:', e.message); }
            }
          }, 5 * 60 * 1000);
          pendingTaskCategories.set(sessionId, {
            type: 'CONFIRM_SYNC', title: taskResult.title, notes: taskResult.notes,
            dueDate: taskResult.due_date, listName: taskResult.list_name,
            durationMins: taskResult.duration_minutes || 60, timerId, chatId: sessionId
          });
          domainReply = taskResult.message;

        } else if (taskResult?.message) {
          domainReply = taskResult.message;
          const action = ed.action;
          if (['CREATE', 'CREATE_SUBTASK', 'READ', 'READ_TODAY', 'READ_TOMORROW', 'READ_UPCOMING', 'READ_OVERDUE', 'READ_LISTS', 'COMPLETE'].includes(action)) {
            _triggerConversationalSynthesis(textInput, taskResult.message, action, sessionId);
          }
        }
      }
      break;
    }

    // ────────────────────────────────────────────────────────
    // WEB_SEARCH — real search + AI synthesis
    // ────────────────────────────────────────────────────────
    case 'WEB_SEARCH': {
      const query = ed.query || textInput;
      const searchType = ed.type || 'search';
      console.log(`[CLI-SEARCH] Searching web: "${query}" [type: ${searchType}]`);
      const searchResult = await webSearch.searchWeb(query, searchType);
      console.log('[CLI-SEARCH] Synthesizing response with AI...');
      const prompt = `Sebagai N.E.X.A, asisten AI pribadi Tuan Faqih Hidayatulloh, Anda baru saja melakukan penelusuran web untuk menjawab pernyataannya.\n        \nPernyataan/Pertanyaan Tuan Faqih: "${textInput}"\n\nHasil Penelusuran Web:\n${searchResult}\n\nTugas: Jawablah Tuan Faqih secara natural, cerdas, dan luwes berdasarkan hasil penelusuran di atas. Berikan jawaban yang informatif seolah Anda sedang berdiskusi. Jangan sekadar menyalin ulang hasil pencariannya. Berikan kesimpulan atau opini jika relevan.`;
      domainReply = await aiRouter.callAI(prompt);
      break;
    }

    // ────────────────────────────────────────────────────────
    // 2ND_BRAIN — READ / EDIT / DELETE / APPEND
    // ────────────────────────────────────────────────────────
    case '2ND_BRAIN': {
      if (ed) {
        const brainAction = (ed.action || 'APPEND').toUpperCase();
        if (brainAction === 'READ') {
          const docContent = await googleWorkspace.readIdeaDoc();
          domainReply = `📖 Isi Arsip 2nd Brain:\n\n${String(docContent).substring(0, 3000)}${String(docContent).length > 3000 ? '\n\n...(terpotong)' : ''}`;

        } else if (brainAction === 'EDIT') {
          const vaultRes = await supabaseMemories.editIdeaInVault(ed.search_keyword, ed.content).catch(e => { console.error('[CLI-2ND_BRAIN] Supabase edit error:', e); return null; });
          let docsSuccess = false;
          if (vaultRes?.success && vaultRes.editedRows?.length > 0) {
            for (const row of vaultRes.editedRows) {
              docsSuccess = await googleWorkspace.editIdeaDoc(row.content, ed.content);
            }
          } else {
            docsSuccess = await googleWorkspace.editIdeaDoc(ed.search_keyword, ed.content);
          }
          invalidatePersonalFactsCache();
          domainReply = (vaultRes?.success || docsSuccess) ? '✅ Arsip berhasil diubah di Database (dan sinkronisasi Docs).' : '❌ Gagal menemukan/mengubah arsip.';

        } else if (brainAction === 'DELETE') {
          const vaultRes = await supabaseMemories.deleteIdeaFromVault(ed.search_keyword).catch(e => { console.error('[CLI-2ND_BRAIN] Supabase delete error:', e); return null; });
          let docsSuccess = false;
          if (vaultRes?.success && vaultRes.deletedRows?.length > 0) {
            for (const row of vaultRes.deletedRows) {
              docsSuccess = await googleWorkspace.deleteIdeaDoc(row.content);
            }
          } else {
            docsSuccess = await googleWorkspace.deleteIdeaDoc(ed.search_keyword);
          }
          invalidatePersonalFactsCache();
          domainReply = (vaultRes?.success || docsSuccess) ? '🗑️ Arsip berhasil dihapus dari Database (dan sinkronisasi Docs).' : '❌ Gagal menemukan/menghapus arsip.';

        } else if (ed.content) { // APPEND
          await supabaseMemories.saveIdeaToVault(ed.content).catch(e => console.error('[CLI-2ND_BRAIN] Supabase vault save error:', e));
          const docUrl = await googleWorkspace.appendToIdeaDoc(ed.title || 'Ideation N.E.X.A', ed.content, 'IDEA').catch(e => { console.error('[CLI-2ND_BRAIN] Google Doc error:', e); return null; });
          if (docUrl) {
            domainReply = `✅ Ide berhasil disimpan ke arsip dan Google Docs:\n${docUrl}`;
          }
          console.log('[CLI-2ND_BRAIN] Saved IDEA to Supabase and Google Docs.');
        }
      }
      break;
    }

    // ────────────────────────────────────────────────────────
    // USER_PROFILE — APPEND / DELETE / READ + smart dedup
    // ────────────────────────────────────────────────────────
    case 'USER_PROFILE': {
      if (ed) {
        const action = ed.action || (ed.content ? 'APPEND' : 'READ');
        if (action === 'APPEND' && ed.content) {
          const content = ed.content;
          if (_isFactAboutNexa(content)) {
            console.log('[CLI] USER_PROFILE redirected to CORE_IDENTITY:', content);
            const saved = await aiRouter.deduplicateAndSaveFact(content, 'CORE_IDENTITY');
            invalidatePersonalFactsCache();
            domainReply = _formatMemoryReply(routingData.reply_message,
              saved ? 'Baik Tuan Faqih, fakta mengenai diri saya (N.E.X.A) telah saya pelajari dan saya tanamkan ke memori inti.' : 'Tentu Tuan Faqih, hal mengenai diri saya tersebut memang sudah tersimpan di dalam memori inti saya.',
              saved ? '✅ Tersimpan di Memori Inti N.E.X.A' : 'ℹ️ Sudah Tercatat di Memori Inti');
          } else {
            const saved = await aiRouter.deduplicateAndSaveFact(content, 'USER_PROFILE');
            invalidatePersonalFactsCache();
            domainReply = _formatMemoryReply(routingData.reply_message,
              saved ? 'Siap Tuan Faqih, informasi tersebut sudah saya catat dan simpan ke dalam profil personal Anda.' : 'Tentu Tuan Faqih, fakta tersebut memang sudah ada di dalam catatan profil Anda sebelumnya.',
              saved ? '✅ Tersimpan di Memori Personal' : 'ℹ️ Sudah Tercatat di Memori Personal');
          }
        } else if (action === 'DELETE' && ed.search_keyword) {
          const kw = ed.search_keyword;
          let deletedLayer = null;
          if (await supabaseMemories.deleteFromUserProfile(kw)) deletedLayer = 'Personal';
          else if (await supabaseMemories.deleteFromCoreIdentity(kw)) deletedLayer = 'Inti N.E.X.A';
          else if (typeof supabaseMemories.deleteFromSelfModel === 'function' && await supabaseMemories.deleteFromSelfModel(kw)) deletedLayer = 'Self-Learning (Phase 8)';
          invalidatePersonalFactsCache();
          domainReply = _formatMemoryReply(routingData.reply_message,
            deletedLayer ? `Baik Tuan Faqih, catatan/aturan terkait telah saya hapus dari memori ${deletedLayer}.` : 'Maaf Tuan Faqih, saya tidak menemukan catatan/aturan terkait hal tersebut di seluruh sistem memori.',
            deletedLayer ? `🗑️ Dihapus dari Memori ${deletedLayer}` : '❌ Fakta Tidak Ditemukan di Seluruh Memori');
        } else if (action === 'READ') {
          const keyword = ed.search_keyword || textInput;
          const facts = await supabaseMemories.getPersonalFacts();
          const relevantFacts = facts.userProfile ? aiRouter.selectUserProfileFacts(facts.userProfile, textInput) : [];
          const relevantVault = (facts.vaultItems && aiRouter.selectVaultFacts) ? aiRouter.selectVaultFacts(facts.vaultItems, textInput) : [];
          if (relevantFacts.length > 0 || relevantVault.length > 0) {
            const list = [...relevantFacts.map(f => `- [USER PROFILE] ${f}`), ...relevantVault.map(f => `- [VAULT DOKUMEN/ARSIP] ${f}`)].join('\n');
            const prompt = `FILTERED PERMANENT FACTS & VAULT DOCUMENTS ABOUT TUAN FAQIH:\n${list}\n\nUSER ASKED: "${keyword}"\n\nTASK: Answer the user's question accurately using ONLY the relevant facts and vault document metadata above. If the answer (such as birth place, NIK, birth date, name, address) is found in the VAULT DOKUMEN/ARSIP metadata, answer clearly and proudly citing that it is recorded in their vaulted documents. Summarize them into a warm, natural narrative from an assistant's perspective. Do NOT use bullet points unless requested. CRITICAL RULE: ALWAYS address and refer to the user as "Tuan" or "Tuan Faqih". NEVER address or refer to the user as "Bapak", "Mas", or "Anda". MUST answer in fluent, elegant Indonesian.`;
            domainReply = await aiRouter.callAI(prompt);
          } else {
            domainReply = '🧠 Saat ini saya belum memiliki catatan fakta personal permanen maupun arsip di Vault terkait hal tersebut, Tuan Faqih.';
          }
        }
      }
      break;
    }

    // ────────────────────────────────────────────────────────
    // CORE_IDENTITY — APPEND / DELETE / READ
    // ────────────────────────────────────────────────────────
    case 'CORE_IDENTITY': {
      if (ed) {
        const action = ed.action || (ed.content ? 'APPEND' : 'READ');
        if (action === 'APPEND' && ed.content) {
          const saved = await aiRouter.deduplicateAndSaveFact(ed.content, 'CORE_IDENTITY');
          invalidatePersonalFactsCache();
          domainReply = _formatMemoryReply(routingData.reply_message,
            saved ? 'Dimengerti Tuan Faqih, aturan identitas dan pedoman perilaku utama N.E.X.A telah saya perbarui.' : 'Tentu Tuan Faqih, pedoman tersebut sudah ada di memori identitas inti saya.',
            saved ? '✅ Tersimpan di Memori Inti N.E.X.A' : 'ℹ️ Sudah Tercatat di Memori Inti');
        } else if (action === 'DELETE' && ed.search_keyword) {
          const kw = ed.search_keyword;
          let deletedLayer = null;
          if (await supabaseMemories.deleteFromCoreIdentity(kw)) deletedLayer = 'Inti N.E.X.A';
          else if (typeof supabaseMemories.deleteFromSelfModel === 'function' && await supabaseMemories.deleteFromSelfModel(kw)) deletedLayer = 'Self-Learning (Phase 8)';
          else if (await supabaseMemories.deleteFromUserProfile(kw)) deletedLayer = 'Personal';
          invalidatePersonalFactsCache();
          domainReply = _formatMemoryReply(routingData.reply_message,
            deletedLayer ? `Baik Tuan Faqih, aturan identitas/fakta terkait telah saya hapus dari memori ${deletedLayer}.` : 'Maaf Tuan Faqih, aturan/catatan tersebut tidak ditemukan di seluruh sistem memori (Inti, Self-Learning, maupun Personal).',
            deletedLayer ? `🗑️ Dihapus dari Memori ${deletedLayer}` : '❌ Aturan Tidak Ditemukan di Seluruh Memori');
        } else if (action === 'READ') {
          const keyword = ed.search_keyword || textInput;
          const facts = await supabaseMemories.getPersonalFacts();
          if (facts.coreIdentity && facts.coreIdentity.length > 0) {
            const relevantIdentity = aiRouter.selectCoreIdentityFacts(facts.coreIdentity, textInput);
            const list = relevantIdentity.map(f => `- ${f}`).join('\n');
            const prompt = `FILTERED N.E.X.A CORE IDENTITIES & RULES:\n${list}\n\nUSER ASKED: "${keyword}"\n\nTASK: Answer the user gracefully and authoritatively based on your identity rules above. If it's a casual greeting, respond naturally as an assistant. Do NOT ask the user to specify aspects unless they requested the full list. CRITICAL RULE: ALWAYS address and refer to the user as "Tuan" or "Tuan Faqih". NEVER address or refer to the user as "Bapak", "Mas", or "Anda". MUST answer in fluent, elegant Indonesian.`;
            domainReply = await aiRouter.callAI(prompt);
          } else {
            domainReply = '🤖 Saat ini tidak ada aturan identitas inti khusus yang diterapkan.';
          }
        }
      }
      break;
    }

    // ────────────────────────────────────────────────────────
    // EMAIL — READ / SEND / DELETE (via Gmail_Client)
    // ────────────────────────────────────────────────────────
    case 'EMAIL': {
      const gmailClient = require('../../infrastructure/Gmail_Client');
      const pendingEmail = cliPendingEmail.get(sessionId) || null;
      if (ed) {
        const action = ed.action;
        if (action === 'READ') {
          const searchKeyword = ed.search_keyword || '';
          const baseQuery = searchKeyword || 'livin OR from:noreply.livin@bankmandiri.co.id';
          const maxResults = Math.min(parseInt(ed.max_results, 10) || 5, 10);

          const followUpPrevious = Boolean(ed.before_current);
          let emails = [];
          let contextCursorIndex = 0;
          let candidateEmailsForContext = [];

          if (followUpPrevious && pendingEmail) {
            const fullBatch = await gmailClient.getLatestEmails(searchKeyword || pendingEmail.searchKeyword || baseQuery, 20);
            candidateEmailsForContext = fullBatch;
            const nextCursor = (pendingEmail.cursorIndex || 0) + 1;
            if (nextCursor < fullBatch.length) {
              emails = [fullBatch[nextCursor]];
              contextCursorIndex = nextCursor;
            }
          } else {
            const candidateEmails = await gmailClient.getLatestEmails(baseQuery, Math.max(maxResults, 20));
            candidateEmailsForContext = candidateEmails;
            emails = candidateEmails.slice(0, maxResults);
          }

          if (emails.length === 0) {
            domainReply = 'Kotak masuk kosong atau tidak ada email yang cocok dengan pencarian.';
          } else {
            domainReply = `📧 Email Terbaru (${emails.length}):\n\n` + emails.map(e => {
              return `[${e.date}]\nDari: ${e.from}\nSubjek: ${e.subject}\nSnippet: ${e.snippet}\n`;
            }).join('\n---\n');
            cliPendingEmail.set(sessionId, {
              searchKeyword, lastLimit: maxResults,
              cursorIndex: contextCursorIndex,
              lastBatch: candidateEmailsForContext.slice(0, 50),
              askedAt: Date.now()
            });
          }

        } else if (action === 'SEND') {
          const success = await gmailClient.sendEmail(ed.to, ed.subject, ed.content);
          cliPendingEmail.delete(sessionId);
          domainReply = success ? `✅ Email berhasil dikirim ke ${ed.to}.` : '❌ Gagal mengirim email.';

        } else if (action === 'DELETE') {
          const emails = await gmailClient.getLatestEmails(ed.search_keyword, 1);
          if (emails.length > 0) {
            const success = await gmailClient.deleteEmail(emails[0].id);
            domainReply = success ? `🗑️ Email dengan subjek "${emails[0].subject}" berhasil dihapus.` : '❌ Gagal menghapus email.';
          } else {
            domainReply = 'Tidak ditemukan email dengan kata kunci tersebut untuk dihapus.';
          }
          cliPendingEmail.delete(sessionId);
        }
      }
      break;
    }

    // ────────────────────────────────────────────────────────
    // DATABASE — full CRUD ke tabel Supabase
    // ────────────────────────────────────────────────────────
    case 'DATABASE': {
      const dbAction = ed.action || 'LIST_TABLES';
      const tableName = ed.table_name;
      const pendingDb = cliPendingDatabase.get(sessionId) || null;

      if (!tableName && dbAction !== 'LIST_TABLES') {
        domainReply = '❓ Tabel Supabase mana yang ingin Anda kelola?\nPilih salah satu:\n- nexa_chat_memories\n- nexa_finance_dedup\n- nexa_user_profile\n- nexa_core_identity\n- nexa_2nd_brain';
        cliPendingDatabase.set(sessionId, { tableName: '', lastAction: dbAction, askedAt: Date.now() });
        break;
      }

      if (dbAction === 'LIST_TABLES') {
        const overview = await supabaseMemories.getDatabaseOverview();
        if (!overview.success) { domainReply = `❌ Gagal membaca overview database: ${overview.error}`; break; }
        const lines = overview.tables.map(t => {
          const info = overview.counts[t];
          if (info?.error) return `- ${t}: error (${info.error})`;
          return `- ${t}: ${info?.count || 0} baris`;
        });
        domainReply = `🗄️ Overview Supabase (tabel N.E.X.A):\n${lines.join('\n')}\n\nBalas dengan aksi jelas, misalnya:\n- "baca nexa_core_identity 5 data"\n- "tambah nexa_user_profile: aku suka teh"\n- "hapus nexa_2nd_brain id 12"`;
        cliPendingDatabase.set(sessionId, { tableName: '', lastAction: dbAction, askedAt: Date.now() });

      } else if (dbAction === 'READ_TABLE') {
        const result = await supabaseMemories.readDatabaseTable(tableName, { limit: ed.max_results || 5, searchKeyword: ed.search_keyword || '' });
        if (!result.success) { domainReply = `❌ Gagal membaca tabel ${tableName}: ${result.error}`; break; }
        if (!result.rows?.length) { domainReply = `📭 Tabel ${result.table} tidak memiliki data yang cocok.`; break; }
        const rowsPreview = result.rows.map(r => {
          const summary = Object.entries(r).slice(0, 4).map(([k, v]) => `${k}: ${String(v).substring(0, 80)}`).join(' | ');
          return `• ${summary}`;
        }).join('\n');
        domainReply = `📚 Data ${result.table} (${result.rows.length} baris):\n${rowsPreview}`;
        cliPendingDatabase.set(sessionId, { tableName: result.table, lastAction: dbAction, askedAt: Date.now() });

      } else if (dbAction === 'INSERT_ROW') {
        const result = await supabaseMemories.insertDatabaseRow(tableName, ed.row_data || {});
        domainReply = result.success ? `✅ Insert berhasil ke ${result.table} (id: ${result.row?.id || '-'})` : `❌ Insert gagal ke ${tableName}: ${result.error}`;
        cliPendingDatabase.set(sessionId, { tableName: result.table || tableName, lastAction: dbAction, askedAt: Date.now() });

      } else if (dbAction === 'UPDATE_ROW') {
        const result = await supabaseMemories.updateDatabaseRows(tableName, ed.update_data || {}, { rowId: ed.row_id, searchKeyword: ed.search_keyword });
        domainReply = result.success ? `✅ Update berhasil di ${result.table}. Baris terubah: ${result.updatedRows.length}` : `❌ Update gagal di ${tableName}: ${result.error}`;
        cliPendingDatabase.set(sessionId, { tableName: result.table || tableName, lastAction: dbAction, askedAt: Date.now() });

      } else if (dbAction === 'DELETE_ROW') {
        const result = await supabaseMemories.deleteDatabaseRows(tableName, { rowId: ed.row_id, searchKeyword: ed.search_keyword });
        domainReply = result.success ? `🗑️ Delete berhasil di ${result.table}. Baris terhapus: ${result.deletedRows.length}` : `❌ Delete gagal di ${tableName}: ${result.error}`;
        cliPendingDatabase.set(sessionId, { tableName: result.table || tableName, lastAction: dbAction, askedAt: Date.now() });

      } else if (dbAction === 'DELETE_ALL_ROWS') {
        domainReply = routingData.reply_message || `⚠️ PERINGATAN! Anda meminta untuk menghapus SELURUH isi dari tabel ${tableName}.\n\nApakah Anda benar-benar yakin? Balas "YA" untuk mengeksekusi, atau "BATAL".`;
        cliPendingDatabase.set(sessionId, { tableName, lastAction: dbAction, awaitingConfirmation: true, askedAt: Date.now() });

      } else if (dbAction === 'DELETE_ALL_ROWS_CONFIRMED') {
        const targetTable = tableName || pendingDb?.tableName;
        if (!targetTable) {
          domainReply = '❌ N.E.X.A lupa tabel mana yang ingin dihapus massal. Silakan ulangi dari awal.';
          cliPendingDatabase.delete(sessionId);
        } else {
          let driveDeletedMsg = '';
          if (targetTable === 'nexa_vault_items') {
            const driveSuccess = await googleWorkspace.deleteAllVaultFiles();
            driveDeletedMsg = driveSuccess ? '\n🗑️ Semua file fisik di Google Drive Vault juga telah dimasukkan ke Trash.' : '\n⚠️ Gagal menghapus file fisik di Google Drive Vault.';
          }
          const result = await supabaseMemories.deleteAllDatabaseRows(targetTable);
          domainReply = result.success
            ? `💥 Pemusnahan Massal Selesai.\nSeluruh data di tabel ${result.table} telah dihapus. Baris terdampak: ${result.deletedRows.length}${driveDeletedMsg}`
            : `❌ Gagal memusnahkan isi tabel ${targetTable}: ${result.error}`;
          cliPendingDatabase.delete(sessionId);
        }

      } else if (dbAction === 'CANCEL_ACTION') {
        domainReply = '✅ Aksi database dibatalkan, Tuan.';
        cliPendingDatabase.delete(sessionId);

      } else {
        domainReply = `❌ Aksi database tidak dikenali: ${dbAction}`;
      }
      break;
    }

    // ────────────────────────────────────────────────────────
    // EDIT — fallback redirect ke financeEngine.editTransaction
    // ────────────────────────────────────────────────────────
    case 'EDIT': {
      let editKw = ed.search_keyword || 'latest';
      if (/^(ini|itu|transaksi|perbaiki|ubah|sesuaikan|\s)*$/i.test(String(editKw).trim())) {
        editKw = 'latest';
      }
      const editResult = await financeEngine.editTransaction(
        editKw, ed.nominal,
        ed.description || ed.destination,
        ed.category, ed.account, ed.payment_method
      );
      domainReply = editResult.message;
      break;
    }

    // ────────────────────────────────────────────────────────
    // DIAGNOSE_SYSTEM — analisis log via AI
    // ────────────────────────────────────────────────────────
    case 'DIAGNOSE_SYSTEM': {
      const logger = require('../../utils/logger');
      const recentLogs = logger.getRecentLogs();
      if (!recentLogs || recentLogs.trim() === '') {
        domainReply = '✅ Sistem berjalan normal. Belum ada log baru yang terekam di memori saat ini.';
      } else {
        domainReply = await aiRouter.analyzeSystemLogs(textInput, recentLogs);
      }
      break;
    }

    // ────────────────────────────────────────────────────────
    // SEMUA INTENT LAIN — pakai reply_message dari AI Router
    // (NORMAL_CHAT, GREETING, ADVICE, MOTIVATE, dll.)
    // ────────────────────────────────────────────────────────
    default:
      domainReply = routingData?.reply_message || null;
      break;
  }

  return domainReply;
}

// ── Helper ekstrak transaksi dari email (lokal, tanpa import Telegram) ─
function _extractFinanceTxFromEmails(emails) {
  const rows = [];
  for (const email of emails || []) {
    const body = String(email.snippet || email.body || '');
    const nominalMatch = body.match(/Rp\.?\s*([\d.,]+)/i);
    if (!nominalMatch) continue;
    const nominal = parseInt(nominalMatch[1].replace(/[^0-9]/g, ''), 10);
    if (!nominal || nominal < 100) continue;
    rows.push({
      nominal, type: 'EXPENSE',
      destination: email.from || 'Email Import',
      category: 'Import Email',
      description: (email.subject || '').substring(0, 80),
      time: email.date || new Date().toISOString(),
    });
  }
  return rows;
}

// ============================================================
// ── HANDLER UTAMA POST /webhook/cli ──────────────────────────
// ============================================================
async function handleCliWebhook(req, res) {
  const { message, session_id = 'cli-default' } = req.body || {};

  if (!message || typeof message !== 'string' || message.trim().length === 0) {
    return res.status(400).json({ ok: false, error: 'Field "message" wajib diisi dan tidak boleh kosong.' });
  }

  const textInput = message.trim();
  const startTime = Date.now();

  // ── Ping Check ───────────────────────────────────────────
  if (textInput === '__ping__') {
    console.log('[CLI] Ping check received — setup verification');
    return res.status(200).json({ ok: true, reply: 'pong', intent: 'PING', elapsed_ms: 0 });
  }

  console.log(`[CLI] Received message: ${textInput}`);

  // ── Persist User Message ─────────────────────────────────
  await supabaseMemories.saveChatMemory('user', textInput, 'cli').catch(err => {
    console.error(`[CLI] Warning: Failed to save user chat memory: ${err.message}`);
  });

  try {
    // ── Load Conversation Context ────────────────────────────
    const conversationContext = cliSessions.get(session_id) || null;

    // ── Route ke AI Router ───────────────────────────────────
    const routingData = await aiRouter.routeUserMessage(textInput, {
      conversationContext,
      source: 'cli'
    });

    const intent = String(routingData?.intent || 'UNKNOWN').toUpperCase();

    // ── Intent Domain Dispatcher (Full Parity) ────────────────
    let reply = await _dispatchIntent(intent, routingData, textInput, session_id);

    // Fallback jika dispatcher tidak menghasilkan balasan
    if (reply && typeof reply === 'object') {
      reply = reply.text || reply.message || JSON.stringify(reply);
    }
    if (!reply || String(reply).trim().length === 0) {
      reply = routingData?.reply_message || '(N.E.X.A tidak menghasilkan balasan untuk pesan ini.)';
    }

    // Strip HTML tags untuk output CLI (yang tampil di terminal)
    reply = _stripHtml(String(reply));

    const elapsed = Date.now() - startTime;

    // ── Persist Assistant Reply ──────────────────────────────
    await supabaseMemories.saveChatMemory('nexa', String(reply).substring(0, 4000), 'cli').catch(err => {
      console.error(`[CLI] Warning: Failed to save assistant chat memory: ${err.message}`);
    });

    // ── Update Session Context ───────────────────────────────
    cliSessions.set(session_id, {
      intent,
      extractedData: routingData?.extracted_data || null,
      lastUserText: textInput,
      lastAssistantReply: reply,
      askedAt: Date.now()
    });

    // ── [PHASE 6] Log perilaku interaksi user & fakta ─────────
    const behaviorEngine = require("../../domain/Behavior_Engine");
    behaviorEngine.logUserInteraction(intent, textInput, routingData?.mood || 'NEUTRAL').catch(() => {});
    if (routingData?.mood && routingData.mood !== 'NEUTRAL') {
      behaviorEngine.logMood(routingData.mood, textInput).catch(() => {});
    }

    // ── [PHASE 8] Passive Background Learning (Auto-Extraction) 
    // Fakta tentang Tuan Faqih → disimpan ke nexa_user_profile
    // Fakta tentang N.E.X.A    → DIALIHKAN senyap ke nexa_self_model
    if (routingData?.learned_user_facts && Array.isArray(routingData.learned_user_facts) && routingData.learned_user_facts.length > 0) {
      for (const fact of routingData.learned_user_facts) {
        if (typeof fact === 'string' && fact.trim().length > 0) {
          if (_isFactAboutNexa(fact)) {
            console.log('[CLI SELF-MODEL] Passive Learning → Self-Model:', fact.substring(0, 80));
            aiRouter.deduplicateAndSaveSelfFact(fact, 'IDENTITY_TRAITS', 'PASSIVE_LEARNING', fact).catch(() => {});
          } else {
            console.log('[CLI ROUTER] Passive Learning - User Fact:', fact);
            aiRouter.deduplicateAndSaveFact(fact, 'USER_PROFILE').catch(() => {});
            behaviorEngine.logPassiveLearning(fact, 'USER_PROFILE').catch(() => {});
          }
        }
      }
      invalidatePersonalFactsCache();
    }

    if (routingData?.learned_core_identities && Array.isArray(routingData.learned_core_identities) && routingData.learned_core_identities.length > 0) {
      for (const fact of routingData.learned_core_identities) {
        if (typeof fact === 'string' && fact.trim().length > 0) {
          console.log('[CLI SELF-MODEL] Passive Learning (core):', fact.substring(0, 80));
          aiRouter.deduplicateAndSaveSelfFact(fact, 'IDENTITY_TRAITS', 'PASSIVE_LEARNING', fact).catch(() => {});
        }
      }
    }

    // ── [PHASE 7 — M2] Intention Engine (Decision & Intention) ─
    if (textInput && textInput.length >= 10) {
      const intentionEngine = require("../../domain/Intention_Engine");
      intentionEngine.detectAndSaveIntention(textInput, routingData).catch(() => {});
      const DECISION_INTENTS = new Set(['FINANCE', 'DISCIPLINE', 'CALENDAR', 'ADVICE', 'NORMAL_CHAT']);
      if (DECISION_INTENTS.has(intent)) {
        intentionEngine.detectAndSaveDecision(textInput, routingData, routingData?.detected_mood || 'NEUTRAL').catch(() => {});
      }
    }

    // ── Anticipatory Engine ──────────────────────────────────
    const sessionAdviceCount = intent === 'ADVICE'
      ? _trackAdviceSession(session_id)
      : _getAdviceSessionCount(session_id);

    const jakartaHour = new Date(new Date().getTime() + 7 * 60 * 60 * 1000).getUTCHours();

    (async () => {
      try {
        const moodCtx = await anticipatoryEngine.getLatestMoodContext();
        await anticipatoryEngine.runAnticipationPass({
          intent,
          mood:             routingData?.detected_mood || 'NEUTRAL',
          hour:             jakartaHour,
          mood_7d_trend:    moodCtx.mood_7d_trend,
          mood_7d_variance: moodCtx.mood_7d_variance,
          sessionAdviceCount
        });
      } catch (_) {}
    })();

    console.log(`[CLI] Replying with intent: ${intent} (${elapsed}ms)`);
    return res.status(200).json({ ok: true, reply, intent, elapsed_ms: elapsed });

  } catch (error) {
    const elapsed = Date.now() - startTime;
    console.error(`[CLI] Error processing message: ${error.message}`);
    return res.status(500).json({
      ok: false,
      error: `N.E.X.A mengalami gangguan internal: ${error.message}`,
      elapsed_ms: elapsed
    });
  }
}

module.exports = { handleCliWebhook, handleCliStream, pushToCli };
