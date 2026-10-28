'use strict';
// ============================================================
// N.E.X.A — TELEGRAM STATE INTERCEPTORS
// Handles pending confirmation loops before routing to AI:
// 1. Awaiting Identity Rejection Reason
// 2. Morning Check-In & Detail brief
// 3. Pending Calendar Duration
// 4. Pending Finance Deletions
// 5. Pending Split Receipts & Remainder
// 6. Pending Finance Confirmations (Confirm / Cancel / Update / Split)
// 7. Pending Task Sync / Duration / Category
// 8. Pending Calendar Conflict
// 9. Pending Proactive Prep Tasks
// ============================================================

const financeEngine = require('../../domain/Finance_Engine');
const taskManager = require('../../domain/Task_Manager');
const supabaseMemories = require('../../infrastructure/Supabase_Memories');
const googleWorkspace = require('../../infrastructure/Google_Workspace');
const telegramActions = require('./actions');

const escapeHtml = (str) => String(str || '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

let _chatTurnCounter = new Map();

function _normalizeChatKey(chatId) {
  if (!chatId) return 'default';
  return String(chatId).replace(/^tg:/, '').trim();
}

function recordChatActivity(chatId = 'default') {
  const key = _normalizeChatKey(chatId);
  const nextTurn = (_chatTurnCounter.get(key) || 0) + 1;
  _chatTurnCounter.set(key, nextTurn);
  return nextTurn;
}

function triggerConversationalSynthesis(textInput, resultMessage, action, sessionId = null, situationalSummary = null) {
  const chatIdKey = _normalizeChatKey(sessionId);
  let currentTurn = _chatTurnCounter.get(chatIdKey);
  if (currentTurn === undefined) {
    currentTurn = 1;
    _chatTurnCounter.set(chatIdKey, currentTurn);
  }
  const turnId = currentTurn;

  setTimeout(async () => {
    try {
      const { executeWithFallback } = require('../../core/Fallback_Engine');
      const { NEXA_PERSONALITY } = require('../../config/personality');
      
      const situationalLine = situationalSummary ? `\nKonteks Situasi Waktu Nyata: ${situationalSummary}\n` : '';
      const prompt = `System Time (Asia/Jakarta): ${new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })}\nUser Asked: "${textInput}"${situationalLine}\n\nDashboard / Result:\n${resultMessage}\n\nTask: Write a 1-2 sentence friendly, caring response IN INDONESIAN analyzing the operation or schedule above. Act as a dedicated, elegant personal assistant. Provide a brief relevant suggestion, encouragement, prep tip, priority guidance, or warm appreciation. If the user asks about their ongoing activity, schedule, or remaining time, use the Konteks Situasi Waktu Nyata to respond accurately and naturally. DO NOT repeat the items, events, or confirmation text. Keep it concise, warm, and natural. DO NOT wrap your response in quotation marks or speech marks. Answer directly without quotes.`;
      
      const advice = await executeWithFallback(prompt, NEXA_PERSONALITY, 0.7, false);

      // Guard: Discard stale synthesis if user has already sent a newer message in this chat
      const activeTurn = _chatTurnCounter.get(chatIdKey) || 0;
      if (activeTurn !== turnId) {
        console.log(`[CONVERSATIONAL SYNTHESIS] Discarding stale advice for turn ${turnId} — chat is now at turn ${activeTurn}.`);
        return;
      }

      if (advice && !advice.includes('DUMB_MODE')) {
        const cleanAdvice = telegramActions.stripSurroundingQuotes(advice);
        await telegramActions.sendTelegramOutbound(cleanAdvice);
      }
    } catch (err) {
      console.error('[CONVERSATIONAL SYNTHESIS] Failed:', err.message);
    }
  }, 1500);
}

// ── 1. Awaiting Identity Rejection Reason ─────────────────────
async function handleAwaitingIdentityReason(conversationContext, textInput, { respondToTelegram, deliverWebhookReply }) {
  if (conversationContext?.intent !== 'AWAITING_IDENTITY_REJECTION_REASON' || !textInput) {
    return { handled: false, updatedContext: conversationContext };
  }

  const ageMs = Date.now() - (conversationContext.askedAt || 0);
  const looksLikeCheckin = /^\d/.test(textInput.trim()) || /\b(tidur|energi|fokus|skor)\b/i.test(textInput);

  if (ageMs <= 10 * 60 * 1000 && !looksLikeCheckin) {
    const proposalId = conversationContext.extractedData?.proposalId;
    const userReason = String(textInput).trim();
    const isSkip = /tidak apa.apa|skip|tidak perlu|ga perlu|nggak perlu/i.test(userReason);

    if (proposalId && !isSkip) {
      await supabaseMemories.rejectIdentityProposal(proposalId, userReason).catch(() => {});
      console.log(`[IDENTITY] Rejection reason recorded for proposal #${proposalId}: "${userReason}"`);
      await respondToTelegram(
        `🧠 Terima kasih atas koreksinya, Tuan. Saya mencatat bahwa: _"${userReason}"_\n\nSaya akan memperhitungkan konteks ini agar tidak mengulang kesimpulan yang sama di masa mendatang. Pemahaman saya tentang Anda terus berkembang.`
      );
    } else {
      await respondToTelegram(
        `Baik, Tuan. Tidak masalah — saya akan lebih berhati-hati dalam menarik kesimpulan ke depannya. 🙏`
      );
    }
    deliverWebhookReply();
    return { handled: true, updatedContext: null };
  }

  return { handled: false, updatedContext: null };
}

// ── 2. Morning Check-In & Detail ──────────────────────────────
async function handleMorningCheckIn(textInput, { respondToTelegram, deliverWebhookReply }) {
  if (!textInput) return false;
  const intelligenceBrief = require('../../domain/Intelligence_Brief');

  let morningBriefingSentToday = false;
  try {
    const { supabase } = supabaseMemories;
    if (supabase) {
      const fourHoursAgo = new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString();
      const { data: briefLogs } = await supabase
        .from('nexa_behavior_log')
        .select('id')
        .eq('event_type', 'MORNING_BRIEFING_SENT')
        .gte('created_at', fourHoursAgo)
        .limit(1);
      morningBriefingSentToday = !!(briefLogs && briefLogs.length > 0);
    }
  } catch (_) { }

  if (morningBriefingSentToday && !/^detail$/i.test(textInput.trim())) {
    const hasCheckinKeyword = /\b(tidur|energi|fokus|skor|semalam|bangun|kondisi)\b/i.test(textInput) || /^\d/.test(textInput.trim());
    let checkInData = null;
    if (hasCheckinKeyword) {
      checkInData = await intelligenceBrief.parseMorningCheckInWithAI(textInput);
    }

    if (checkInData) {
      console.log(`[INTELLIGENCE] Morning Check-In calibrated: sleep=${checkInData.sleep}, energy=${checkInData.energy}, focus="${checkInData.focus}"`);

      await intelligenceBrief.saveCheckInData(
        checkInData.sleep,
        checkInData.energy,
        checkInData.focus,
        checkInData.raw_story,
        checkInData.calibration_notes
      );

      const checkInReplies = await intelligenceBrief.generateCheckInResponse(
        checkInData.sleep,
        checkInData.energy,
        checkInData.focus,
        checkInData.reply_bubbles
      );

      if (typeof checkInReplies === 'object' && checkInReplies.bubble1) {
        await respondToTelegram(checkInReplies.bubble1);
        if (checkInReplies.bubble2) {
          await sendTelegramOutbound(checkInReplies.bubble2);
        }
      } else {
        await respondToTelegram(String(checkInReplies));
      }
      deliverWebhookReply();
      return true;
    }
  }

  if (/^detail$/i.test(textInput.trim()) && morningBriefingSentToday) {
    console.log('[INTELLIGENCE] User requested Morning Briefing DETAIL mode.');
    const detailBriefing = await intelligenceBrief.generateMorningBriefingDetail();
    await respondToTelegram(detailBriefing);
    deliverWebhookReply();
    return true;
  }

  return false;
}

// ── 3. Pending Calendar Resolution ────────────────────────────
async function handlePendingCalendar(textInput, pendingCalendarContext, { respondToTelegram }) {
  if (!pendingCalendarContext) return { handled: false, updatedPendingCalendar: null, newConflict: null };

  const agendaManager = require('../../domain/Agenda_Manager');
  const resolved = await agendaManager.tryResolvePending(textInput, pendingCalendarContext);
  if (resolved) {
    agendaManager.cancelPending(pendingCalendarContext.summary);
    let newConflict = null;
    if (resolved.status === 'CONFLICT_DETECTED') {
      newConflict = { ...resolved.pendingEvent, askedAt: Date.now() };
    }

    await respondToTelegram(resolved.message);
    if (resolved.status === 'SUCCESS') {
      setTimeout(async () => {
        try {
          const { executeWithFallback } = require('../../core/Fallback_Engine');
          const { NEXA_PERSONALITY } = require('../../config/personality');
          const prompt = `System Time (Asia/Jakarta): ${new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })}\nUser Asked: "${textInput}"\n\nCalendar Result:\n${resolved.message}\n\nTask: Write a 1-2 sentence friendly response IN INDONESIAN analyzing the newly added calendar event above. Act as a caring personal assistant. Provide a brief prep suggestion or encouragement. DO NOT repeat the confirmation text. Keep it concise, warm, and natural. DO NOT wrap your response in quotation marks or speech marks. Answer directly without quotes.`;
          const advice = await executeWithFallback(prompt, NEXA_PERSONALITY, 0.7, false);
          if (advice && !advice.includes('DUMB_MODE')) {
            await sendTelegramOutbound(stripSurroundingQuotes(advice));
          }
        } catch (err) { console.error('[CALENDAR PENDING] Advice failed:', err.message); }
      }, 1500);
    }
    return { handled: true, updatedPendingCalendar: null, newConflict };
  }

  return { handled: false, updatedPendingCalendar: pendingCalendarContext, newConflict: null };
}

// ── 4. Pending Finance Deletion Confirmation ───────────────────
async function handlePendingDeletions(textInput, { respondToTelegram }) {
  const pendingDelCtx = financeEngine.getPendingDeletionsContext();
  if (!pendingDelCtx) return false;

  let delContext = 'hapus transaksi keuangan';
  try {
    const [firstEntry] = pendingDelCtx.values();
    if (firstEntry && firstEntry.rowData) {
      const r = firstEntry.rowData;
      delContext = `hapus transaksi "${r[6] || r[4] || '-'}" senilai Rp${Math.abs(r[7] || 0).toLocaleString('id-ID')}`;
    }
  } catch (_) {}

  const { classifyYesNo } = require('../../core/AI_Router');
  const verdict = await classifyYesNo(textInput, delContext);
  console.log(`[FINANCE INTERCEPTOR] AI deletion verdict: "${verdict}" for input: "${textInput}"`);

  if (verdict === 'YES') {
    const reply = await financeEngine.confirmDeleteTransaction(true);
    await respondToTelegram(reply || '✅ Transaksi telah dihapus.');
    return true;
  } else if (verdict === 'NO') {
    const reply = await financeEngine.confirmDeleteTransaction(false);
    await respondToTelegram(reply || '✅ Penghapusan dibatalkan.');
    return true;
  }
  return false;
}

// ── 5. Pending Split Remainder & Receipts ─────────────────────
async function handlePendingSplitRemainder(chatId, textInput, { respondToTelegram }) {
  const splitEngine = require('../../domain/Split_Engine');
  const chatIdStr = String(chatId);
  if (splitEngine.hasPendingRemainder(chatIdStr) && textInput) {
    console.log(`[SPLIT] Menerima balasan keterangan untuk sisa nominal split dari chat ${chatIdStr}: "${textInput}"`);
    const remReplyMsg = await splitEngine.resolveRemainderReply(chatIdStr, textInput);
    if (remReplyMsg) {
      await respondToTelegram(remReplyMsg);
      return true;
    }
  }
  return false;
}

async function handlePendingSplitReceiptPhoto(message, chatId, { respondToTelegram }) {
  const pendingCountForSplit = financeEngine.getPendingConfirmationsCount
    ? financeEngine.getPendingConfirmationsCount()
    : 0;
  if (!message.photo || message.photo.length === 0 || pendingCountForSplit <= 0) {
    return false;
  }

  try {
    const splitEngine = require('../../domain/Split_Engine');
    const largestPhoto = message.photo[message.photo.length - 1];

    const pendingCtxForSplit = await financeEngine.getPendingConfirmationsContext();
    const firstPendingKey = pendingCtxForSplit ? Object.keys(pendingCtxForSplit)[0] : null;
    const firstPendingTx = firstPendingKey ? pendingCtxForSplit[firstPendingKey] : null;
    const totalNominalForSplit = firstPendingTx ? (firstPendingTx.nominal || null) : null;

    console.log(`[SPLIT] Foto struk diterima saat ada ${pendingCountForSplit} pending tx. Memproses sebagai struk split...`);
    const splitItems = await splitEngine.parseSplitFromImage(largestPhoto.file_id, totalNominalForSplit);

    if (splitItems && splitItems.length >= 2) {
      const dDate = firstPendingTx?.time ? new Date(firstPendingTx.time) : new Date();
      const baseTx = {
        type: firstPendingTx?.type || 'EXPENSE',
        account: firstPendingTx?.account || null,
        dateISO: firstPendingTx?.dateISO || dDate.toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' }),
        timeHHMM: firstPendingTx?.timeHHMM || (firstPendingTx?.time ? dDate.toLocaleTimeString('en-GB', { timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit' }) : null),
        paymentMethod: firstPendingTx?.paymentMethod || firstPendingTx?.payment_method || null,
      };
      await financeEngine.confirmPendingTransactions(false, null, null, null, null, firstPendingKey);
      const storeName = firstPendingTx?.destination || 'Belanja';
      const splitMsg = await splitEngine.handleSplitWithRemainder(String(chatId), splitItems, totalNominalForSplit, baseTx, storeName, null, respondToTelegram);
      await respondToTelegram(splitMsg);
      return true;
    }
  } catch (e) {
    console.error('[SPLIT] Error saat parse struk:', e.message);
  }
  return false;
}

// ── 6. Pending Finance Confirmations ──────────────────────────
async function handlePendingFinanceConfirmation(message, textInput, chatId, { respondToTelegram }) {
  const pendingFinanceCtx = await financeEngine.getPendingConfirmationsContext();
  if (!pendingFinanceCtx) return false;

  let targetKey = null;
  const replySnippet = message.reply_to_message && message.reply_to_message.text
    ? message.reply_to_message.text.substring(0, 500)
    : null;
  if (replySnippet) {
    targetKey = financeEngine.resolveTargetKeyFromSnippet(replySnippet);
    if (targetKey) {
      console.log(`[FINANCE INTERCEPTOR] Reply targeted to pending tx key: ${targetKey}`);
    }
  }

  let pendingTxContext = {};
  try {
    const pendingRows = await supabaseMemories.getPendingTransactions();
    if (pendingRows && pendingRows.length > 0) {
      let contextRow = null;
      if (targetKey) {
        contextRow = pendingRows.find(r => r.composite_key === targetKey);
      }
      const rowData = (contextRow || pendingRows[0]).tx_data || {};
      pendingTxContext = { nominal: rowData.nominal, destination: rowData.destination, type: rowData.type };
    }
  } catch (_) {}

  const { classifyPendingTransactionIntent } = require('../../core/AI_Router');
  const parsedData = await classifyPendingTransactionIntent(textInput, pendingTxContext);
  const intent = parsedData.intent;
  console.log(`[FINANCE INTERCEPTOR] AI classified intent: "${intent}" for input: "${textInput}"`, parsedData.updates);

  if (intent === 'CONFIRM') {
    const confirmReply = await financeEngine.confirmPendingTransactions(true, null, null, null, null, targetKey);
    await respondToTelegram(confirmReply || '✅ Transaksi telah dicatat.');
    return true;
  } else if (intent === 'CANCEL') {
    const cancelReply = await financeEngine.confirmPendingTransactions(false, null, null, null, null, targetKey);
    await respondToTelegram(cancelReply || '❌ Transaksi dibatalkan.');
    return true;
  } else if (intent === 'UPDATE') {
    const up = parsedData.updates || {};
    const updatedMsg = await financeEngine.updatePendingTransaction(
      up.description || null,
      up.category || null,
      null,
      up.account || null,
      up.payment_method || null,
      targetKey
    );
    if (updatedMsg) {
      await respondToTelegram(updatedMsg);
      return true;
    }
  } else {
    // Cek kemungkinan split teks
    const splitEngine = require('../../domain/Split_Engine');
    const rawInputForSplit = textInput || '';
    if (splitEngine.isSplitIntent(rawInputForSplit)) {
      try {
        let targetPendingTx = null;
        try {
          const pendingRows = await supabaseMemories.getPendingTransactions();
          if (pendingRows && pendingRows.length > 0) {
            const contextRow = targetKey ? pendingRows.find(r => r.composite_key === targetKey) : null;
            targetPendingTx = (contextRow || pendingRows[0]).tx_data || null;
          }
        } catch (_) {}

        const totalNomForSplit = targetPendingTx?.nominal || null;
        const storeForSplit = targetPendingTx?.destination || '';
        console.log(`[SPLIT] Teks split terdeteksi saat pending. Total: ${totalNomForSplit}. Parsing...`);

        const splitItems = await splitEngine.parseSplitFromText(rawInputForSplit, totalNomForSplit, storeForSplit);
        if (splitItems && splitItems.length >= 2) {
          const dDate = targetPendingTx?.time ? new Date(targetPendingTx.time) : new Date();
          const baseTx = {
            type: targetPendingTx?.type || 'EXPENSE',
            account: targetPendingTx?.account || null,
            dateISO: targetPendingTx?.dateISO || dDate.toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' }),
            timeHHMM: targetPendingTx?.timeHHMM || (targetPendingTx?.time ? dDate.toLocaleTimeString('en-GB', { timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit' }) : null),
            paymentMethod: targetPendingTx?.paymentMethod || targetPendingTx?.payment_method || null,
          };
          await financeEngine.confirmPendingTransactions(false, null, null, null, null, targetKey);
          const splitMsg = await splitEngine.handleSplitWithRemainder(String(chatId), splitItems, totalNomForSplit, baseTx, storeForSplit, null, respondToTelegram);
          await respondToTelegram(splitMsg);
          return true;
        }
      } catch (splitErr) {
        console.error('[SPLIT] Error saat parse teks split:', splitErr.message);
      }
    }

    await respondToTelegram(
      `❓ Masih ada transaksi yang menunggu konfirmasi Tuan. Balas:\n` +
      `• <b>ya / masukkan / catat</b> → simpan transaksi\n` +
      `• <b>batal</b> → batalkan transaksi\n` +
      `• <b>Kalimat deskripsi</b> → ubah catatan transaksi\n` +
      `• <b>Foto struk / rincian item</b> → pecah ke beberapa kategori (split)`
    );
    return true;
  }

  return false;
}

// ── 7. Pending Task Interceptor ───────────────────────────────
async function handlePendingTasks(chatId, textInput, { respondToTelegram }) {
  const chatIdStr = String(chatId);
  if (!taskManager.pendingTaskCategories || !taskManager.pendingTaskCategories.has(chatIdStr)) {
    return false;
  }

  const pendingTask = taskManager.pendingTaskCategories.get(chatIdStr);
  const normalized = textInput.toLowerCase().trim();

  if (normalized === 'batal' || normalized === 'batalkan' || normalized === 'cancel') {
    taskManager.cancelPendingTask(chatIdStr);
    await respondToTelegram('🚫 Penambahan tugas dibatalkan.');
    return true;
  }

  if (pendingTask.type === 'CONFIRM_SYNC') {
    const { classifyYesNo, callAI } = require('../../core/AI_Router');
    const syncContext = `sinkronisasi tugas "${pendingTask.title}" ke kalender`;
    const verdict = await classifyYesNo(textInput, syncContext);
    console.log(`[TASK SYNC INTERCEPTOR] AI verdict: "${verdict}" for input: "${textInput}"`);

    if (verdict === 'NO') {
      if (pendingTask.timerId) clearTimeout(pendingTask.timerId);
      taskManager.pendingTaskCategories.delete(chatIdStr);
      const floatResult = await taskManager.handleTaskIntent({
        action: 'CREATE',
        title: pendingTask.title,
        notes: pendingTask.notes,
        due_date: pendingTask.dueDate,
        list_name: pendingTask.listName,
        duration_minutes: pendingTask.durationMins,
        sync_calendar: false,
        calendar_start_time: null,
      }, null);
      if (floatResult && floatResult.message) {
        await respondToTelegram(floatResult.message);
        triggerConversationalSynthesis(textInput, floatResult.message, 'CREATE', chatIdStr);
      }
      return true;
    }

    if (verdict === 'YES') {
      if (pendingTask.timerId) clearTimeout(pendingTask.timerId);
      taskManager.pendingTaskCategories.delete(chatIdStr);

      const todayIso = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' });
      const extractPrompt = `Extract task START time from the user text as ISO 8601 with +07:00 offset. Today's ISO date: ${todayIso}. If no specific time is mentioned, reply ONLY_TIME_BLOCKING. Reply ONLY with the ISO string or ONLY_TIME_BLOCKING.\n\nUser text: "${textInput}"`;
      let calStartTime = null;
      try {
        const aiResp = await callAI(extractPrompt);
        const cleaned = aiResp.trim();
        if (cleaned !== 'ONLY_TIME_BLOCKING' && cleaned.includes('T') && (cleaned.includes('+') || cleaned.includes('Z'))) {
          calStartTime = cleaned;
        }
      } catch (e) {
        console.warn('[TASK SYNC INTERCEPTOR] Failed to extract calendar_start_time:', e.message);
      }

      let durationMins = pendingTask.durationMins || 60;
      try {
        const durPrompt = `Extract task duration in minutes from the user text. Reply ONLY with an integer. If not mentioned, reply 0.\n\nUser text: "${textInput}"`;
        const durResp = await callAI(durPrompt);
        const parsedDur = parseInt(durResp.trim());
        if (!isNaN(parsedDur) && parsedDur > 0) durationMins = parsedDur;
      } catch (e) { }

      if (!pendingTask.dueDate && calStartTime) {
        pendingTask.dueDate = calStartTime.split('T')[0];
      }

      const syncResult = await taskManager.handleTaskIntent({
        action: 'CREATE',
        title: pendingTask.title,
        notes: pendingTask.notes,
        due_date: pendingTask.dueDate,
        list_name: pendingTask.listName,
        duration_minutes: durationMins,
        sync_calendar: true,
        calendar_start_time: calStartTime,
      }, null);
      if (syncResult && syncResult.message) {
        await respondToTelegram(syncResult.message);
        triggerConversationalSynthesis(textInput, syncResult.message, 'CREATE', chatIdStr);
      }
      return true;
    }

    await respondToTelegram(`🤔 Maaf Tuan, saya kurang menangkap. Apakah tugas '<b>${escapeHtml(pendingTask.title)}</b>' ingin dijadwalkan di Kalender?\n\n• <b>Ya</b>, besok jam 8 malam\n• <b>Tidak</b>`);
    return true;
  }

  if (pendingTask.type === 'CONFIRM_DURATION') {
    const { callAI } = require('../../core/AI_Router');
    const aiPrompt = `User replies: "${textInput}". Extract the intended duration in minutes. If no duration is mentioned, respond with "0".`;
    const aiResp = await callAI(aiPrompt);
    const parsed = parseInt(aiResp.trim());
    let durationMins = (!isNaN(parsed) && parsed > 0) ? parsed : 30;

    pendingTask.durationMins = durationMins;

    if (pendingTask.dueDate) {
      const targetDateMs = new Date(pendingTask.dueDate.split('T')[0] + 'T00:00:00+07:00').getTime();
      const nowMs = Date.now();
      const timeMinIso = new Date(nowMs).toISOString();
      const timeMaxIso = new Date(Math.max(nowMs + 24 * 3600000, targetDateMs + 24 * 3600000 - 1)).toISOString();

      try {
        const { findEmptySlot } = require('../../infrastructure/Google_Workspace');
        const slot = await findEmptySlot(durationMins, timeMinIso, timeMaxIso);
        if (slot) {
          pendingTask.dueDate = slot.start;
          const dueMs = new Date(pendingTask.dueDate);
          const h = dueMs.toLocaleString('en-US', { timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit', hour12: false });
          const timeLabel = `${h} WIB (Auto-Blocked)`;
          pendingTask.notes = pendingTask.notes ? `⏰ Jam: ${timeLabel}\n${pendingTask.notes}` : `⏰ Jam: ${timeLabel}`;
          pendingTask.hasAutonomousBlock = true;
        }
      } catch (e) {
        console.error('[AUTONOMOUS BLOCKING] Failed to find slot:', e.message);
      }
    }

    const resTask = await taskManager.executePendingTask(chatIdStr, pendingTask.listName);
    if (resTask && resTask.message) {
      await respondToTelegram(resTask.message);
      triggerConversationalSynthesis(textInput, resTask.message, 'CREATE', chatIdStr);
      return true;
    }
  } else {
    const { classifyYesNo } = require('../../core/AI_Router');
    const taskTitle = pendingTask && pendingTask.title ? pendingTask.title : 'tugas baru';
    const suggestedList = pendingTask && pendingTask.listName ? pendingTask.listName : 'daftar tugas';
    const taskContext = `konfirmasi apakah tugas "${taskTitle}" dimasukkan ke list "${suggestedList}"`;

    const verdict = await classifyYesNo(textInput, taskContext);
    console.log(`[TASK INTERCEPTOR] AI verdict: "${verdict}" for input: "${textInput}"`);

    let overrideList = null;
    if (verdict === 'YES') {
      overrideList = null;
    } else if (verdict === 'NO') {
      overrideList = 'Tugas Saya';
    } else {
      overrideList = textInput.trim();
    }

    const resTask = await taskManager.executePendingTask(chatIdStr, overrideList);
    if (resTask && resTask.message) {
      await respondToTelegram(resTask.message);
      triggerConversationalSynthesis(textInput, resTask.message, 'CREATE', chatIdStr);
      return true;
    }
  }

  return false;
}

// ── 8. Pending Calendar Conflict Confirmation ─────────────────
async function handlePendingConflict(textInput, pendingConflictEvent, { respondToTelegram }) {
  if (!pendingConflictEvent || (Date.now() - (pendingConflictEvent.askedAt || 0)) >= 10 * 60 * 1000) {
    return { handled: false, updatedConflict: null };
  }

  const ev = pendingConflictEvent;
  const conflictContext = `tambahkan jadwal "${ev.summary}" walaupun ada bentrok jadwal lain`;
  const { classifyYesNo } = require('../../core/AI_Router');
  const verdict = await classifyYesNo(textInput, conflictContext);
  console.log(`[CALENDAR INTERCEPTOR] AI conflict verdict: "${verdict}" for input: "${textInput}"`);

  if (verdict === 'YES' || verdict === 'NO') {
    if (verdict === 'YES') {
      try {
        await googleWorkspace.createCalendarEvent(
          ev.summary, ev.start, ev.end, ev.description || '',
          ev.location || '', ev.reminder_minutes || [], ev.recurrence || ''
        );
        let successMsg = `✅ Jadwal '<b>${ev.summary}</b>' berhasil ditambahkan (meskipun ada bentrok).`;
        if (ev.location) successMsg += `\n📍 Lokasi: ${ev.location}`;
        if (ev.recurrence) successMsg += `\n🔄 Dijadwalkan berulang.`;
        await respondToTelegram(successMsg);
      } catch (e) {
        await respondToTelegram(`❌ Gagal menambahkan jadwal: ${e.message}`);
      }
    } else {
      await respondToTelegram('🚫 Baik Tuan, penambahan jadwal dibatalkan karena ada bentrok.');
    }
    return { handled: true, updatedConflict: null };
  }

  return { handled: false, updatedConflict: pendingConflictEvent };
}

// ── 9. Pending Proactive Tasks Confirmation ───────────────────
async function handlePendingProactiveTasks(textInput, pendingProactiveTasks, chatId, { respondToTelegram }) {
  if (!pendingProactiveTasks || (Date.now() - (pendingProactiveTasks.askedAt || 0)) >= 15 * 60 * 1000) {
    return { handled: false, updatedProactiveTasks: null };
  }

  const pTasks = pendingProactiveTasks;
  const proactiveContext = `buatkan tugas persiapan untuk agenda "${pTasks.summary}" (${(pTasks.tasks || []).join(', ')})`;
  const { classifyYesNo } = require('../../core/AI_Router');
  const verdict = await classifyYesNo(textInput, proactiveContext);
  console.log(`[PROACTIVE TASKS INTERCEPTOR] AI verdict: "${verdict}" for input: "${textInput}"`);

  if (verdict === 'YES' || verdict === 'NO') {
    if (verdict === 'YES') {
      try {
        let createdCount = 0;
        const createdNames = [];
        const targetDue = pTasks.start ? pTasks.start.split('T')[0] : new Date(Date.now() + 86400000).toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' });
        for (const taskTitle of (pTasks.tasks || [])) {
          await taskManager.handleTaskIntent({
            action: 'CREATE',
            title: taskTitle,
            due_date: targetDue,
            notes: `Tugas persiapan proaktif untuk agenda: ${pTasks.summary}`,
            sync_calendar: false,
            calendar_start_time: null
          }, String(chatId));
          createdCount++;
          createdNames.push(`'<b>${escapeHtml(taskTitle)}</b>'`);
        }
        const successText = `✅ Berhasil membuat <b>${createdCount} tugas persiapan</b> untuk agenda '<b>${escapeHtml(pTasks.summary)}</b>':\n${createdNames.join('\n')}`;
        await respondToTelegram(successText);
        triggerConversationalSynthesis(textInput, successText, 'CREATE', String(chatId));
      } catch (e) {
        await respondToTelegram(`❌ Gagal membuat tugas persiapan: ${e.message}`);
      }
    } else {
      await respondToTelegram(`🚫 Baik Tuan, saran tugas persiapan untuk '<b>${escapeHtml(pTasks.summary)}</b>' dilewatkan.`);
    }
    return { handled: true, updatedProactiveTasks: null };
  }

  return { handled: false, updatedProactiveTasks: pendingProactiveTasks };
}

module.exports = {
  recordChatActivity,
  triggerConversationalSynthesis,
  handleAwaitingIdentityReason,
  handleMorningCheckIn,
  handlePendingCalendar,
  handlePendingDeletions,
  handlePendingSplitRemainder,
  handlePendingSplitReceiptPhoto,
  handlePendingFinanceConfirmation,
  handlePendingTasks,
  handlePendingConflict,
  handlePendingProactiveTasks
};
