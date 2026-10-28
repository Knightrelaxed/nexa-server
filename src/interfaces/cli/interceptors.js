'use strict';
// ============================================================
// N.E.X.A — CLI INTERCEPTORS (State Machine Handlers)
// Handles pending confirmations: deletions, finance, calendar, tasks
// ============================================================

const financeEngine    = require('../../domain/Finance_Engine');
const supabaseMemories = require('../../infrastructure/Supabase_Memories');
const taskManager      = require('../../domain/Task_Manager');
const agendaManager    = require('../../domain/Agenda_Manager');
const aiRouter         = require('../../core/AI_Router');

// ── In-Memory Pending Contexts per session_id ────────────────
const cliPendingCalendar = new Map(); // session_id → { summary, start, askedAt }
const cliPendingConflict = new Map(); // session_id → pendingEvent
const cliPendingEmail    = new Map(); // session_id → { searchKeyword, lastBatch, ... }
const cliPendingDatabase = new Map(); // session_id → { tableName, lastAction, ... }

// ── Helper: strip HTML tags untuk output terminal CLI ────────
function stripHtml(str) {
  return String(str || '')
    .replace(/<[^>]*>/g, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"');
}

// ── Conversational Synthesis (ringkasan AI setelah aksi domain) ─
function triggerConversationalSynthesis(textInput, resultMessage, _action, sessionId, situationalSummary = null) {
  // [DISABLED] Conversational synthesis was generating delayed secondary messages, causing out-of-order race conditions.
  return;
}

// ── 1. Pending Deletion Interceptor ──────────────────────────
async function handlePendingDeletions(textInput) {
  const pendingDelCtx = financeEngine.getPendingDeletionsContext ? financeEngine.getPendingDeletionsContext() : null;
  if (!pendingDelCtx) return null;

  let delContext = 'hapus transaksi keuangan';
  try {
    const [firstEntry] = pendingDelCtx.values();
    if (firstEntry?.rowData) {
      const r = firstEntry.rowData;
      delContext = `hapus transaksi "${r[6] || r[4] || '-'}" senilai Rp${Math.abs(r[7] || 0).toLocaleString('id-ID')}`;
    }
  } catch (_) {}

  const verdict = await aiRouter.classifyYesNo(textInput, delContext);
  console.log(`[CLI FINANCE INTERCEPTOR] AI deletion verdict: "${verdict}"`);

  if (verdict === 'YES') {
    const rawReply = await financeEngine.confirmDeleteTransaction(true) || '✅ Transaksi telah dihapus.';
    return { handled: true, reply: stripHtml(rawReply), intent: 'FINANCE' };
  } else if (verdict === 'NO') {
    const rawReply = await financeEngine.confirmDeleteTransaction(false) || '✅ Penghapusan dibatalkan.';
    return { handled: true, reply: stripHtml(rawReply), intent: 'FINANCE' };
  }

  // AMBIGUOUS → fall through ke routing normal
  return null;
}

// ── 2. Pending Finance Reply Interceptor ─────────────────────
async function handlePendingFinance(textInput) {
  const pendingFinanceCtx = await financeEngine.getPendingConfirmationsContext();
  if (!pendingFinanceCtx) return null;

  let pendingTxContext = {};
  try {
    const pendingRows = await supabaseMemories.getPendingTransactions();
    if (pendingRows?.length > 0) {
      const rowData = pendingRows[0].tx_data || {};
      pendingTxContext = { nominal: rowData.nominal, destination: rowData.destination, type: rowData.type };
    }
  } catch (_) {}

  const parsedData = await aiRouter.classifyPendingTransactionIntent(textInput, pendingTxContext);
  const pIntent = parsedData.intent;
  console.log(`[CLI FINANCE INTERCEPTOR] AI pending intent: "${pIntent}"`);

  if (pIntent === 'CONFIRM') {
    const confirmReply = await financeEngine.confirmPendingTransactions(true, null, null, null, null, null) || '✅ Transaksi telah dicatat.';
    return { handled: true, reply: stripHtml(confirmReply), intent: 'FINANCE' };
  } else if (pIntent === 'CANCEL') {
    const cancelReply = await financeEngine.confirmPendingTransactions(false, null, null, null, null, null) || '❌ Transaksi dibatalkan.';
    return { handled: true, reply: stripHtml(cancelReply), intent: 'FINANCE' };
  } else if (pIntent === 'UPDATE') {
    const up = parsedData.updates || {};
    const updMsg = await financeEngine.updatePendingTransaction(
      up.description || null, up.category || null, null, up.account || null, up.payment_method || null, null
    ) || '';
    if (updMsg) {
      return { handled: true, reply: stripHtml(updMsg), intent: 'FINANCE' };
    }
    // null → sudah auto-saved, fall through
    return null;
  } else if (pIntent === 'AMBIGUOUS') {
    const ambigReply = '❓ Masih ada transaksi yang menunggu konfirmasi Tuan. Balas:\n• ya / masukkan → simpan\n• batal → batalkan\n• Deskripsi teks → ubah catatan transaksi';
    return { handled: true, reply: stripHtml(ambigReply), intent: 'FINANCE' };
  }

  return null;
}

// ── 3. Pending Calendar Resolution Interceptor ──────────────
async function handlePendingCalendar(textInput, sessionId) {
  const pendingCal = cliPendingCalendar.get(sessionId);
  if (!pendingCal || (Date.now() - (pendingCal.askedAt || 0)) >= 15 * 60 * 1000) {
    return null;
  }

  const resolved = await agendaManager.tryResolvePending(textInput, pendingCal).catch(() => null);
  if (resolved) {
    agendaManager.cancelPending(pendingCal.summary);
    cliPendingCalendar.delete(sessionId);
    if (resolved.status === 'CONFLICT_DETECTED') {
      cliPendingConflict.set(sessionId, { ...resolved.pendingEvent, askedAt: Date.now() });
    }
    const calReply = stripHtml(resolved.message || '');
    if (resolved.status === 'SUCCESS') {
      triggerConversationalSynthesis(textInput, resolved.message, 'PENDING_RESOLVED', sessionId);
    }
    return { handled: true, reply: calReply, intent: 'CALENDAR' };
  }

  return null;
}

// ── 4. Pending Task Category Interceptor ─────────────────────
async function handlePendingTasks(textInput, sessionId) {
  if (!taskManager.pendingTaskCategories?.has(sessionId)) {
    return null;
  }

  const pendingTask = taskManager.pendingTaskCategories.get(sessionId);
  const normalizedInput = textInput.toLowerCase().trim();

  if (normalizedInput === 'batal' || normalizedInput === 'batalkan' || normalizedInput === 'cancel') {
    if (taskManager.cancelPendingTask) taskManager.cancelPendingTask(sessionId);
    else taskManager.pendingTaskCategories.delete(sessionId);
    return { handled: true, reply: '🚫 Penambahan tugas dibatalkan.', intent: 'TASK' };
  }

  if (pendingTask.type === 'CONFIRM_SYNC') {
    const verdict = await aiRouter.classifyYesNo(textInput, `sinkronisasi tugas "${pendingTask.title}" ke kalender`);
    if (verdict === 'NO') {
      if (pendingTask.timerId) clearTimeout(pendingTask.timerId);
      taskManager.pendingTaskCategories.delete(sessionId);
      const floatRes = await taskManager.handleTaskIntent({
        action: 'CREATE', title: pendingTask.title, notes: pendingTask.notes,
        due_date: pendingTask.dueDate, list_name: pendingTask.listName,
        duration_minutes: pendingTask.durationMins, sync_calendar: false, calendar_start_time: null
      }, null);
      const taskReply = stripHtml(floatRes?.message || '✅ Tugas disimpan tanpa sinkronisasi kalender.');
      return { handled: true, reply: taskReply, intent: 'TASK' };
    }
    if (verdict === 'YES') {
      if (pendingTask.timerId) clearTimeout(pendingTask.timerId);
      taskManager.pendingTaskCategories.delete(sessionId);
      const todayIso = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' });
      let calStartTime = null;
      try {
        const aiResp = await aiRouter.callAI(`Extract START time ISO8601+07:00 from user text. Today: ${todayIso}. Reply ONLY ISO or ONLY_TIME_BLOCKING.\nUser: "${textInput}"`);
        if (!aiResp.includes('ONLY_TIME_BLOCKING') && aiResp.includes('T')) calStartTime = aiResp.trim();
      } catch (_) {}
      const syncRes = await taskManager.handleTaskIntent({
        action: 'CREATE', title: pendingTask.title, notes: pendingTask.notes,
        due_date: pendingTask.dueDate, list_name: pendingTask.listName,
        duration_minutes: pendingTask.durationMins || 60, sync_calendar: true, calendar_start_time: calStartTime
      }, null);
      const taskReply = stripHtml(syncRes?.message || '✅ Tugas & jadwal berhasil dibuat.');
      return { handled: true, reply: taskReply, intent: 'TASK' };
    }
    const ambigMsg = `🤔 Apakah tugas '${pendingTask.title}' ingin dijadwalkan di Kalender?\n• Ya, besok jam 8 malam\n• Tidak`;
    return { handled: true, reply: ambigMsg, intent: 'TASK' };
  }

  if (pendingTask.type === 'CONFIRM_DURATION') {
    const aiResp = await aiRouter.callAI(`User replies: "${textInput}". Extract duration in minutes. Reply ONLY integer. If none, reply 0.`).catch(() => '0');
    const parsed = parseInt(aiResp.trim(), 10);
    pendingTask.durationMins = (!isNaN(parsed) && parsed > 0) ? parsed : 30;
    const resTask = await taskManager.executePendingTask(sessionId, pendingTask.listName);
    const taskReply = stripHtml(resTask?.message || '✅ Tugas berhasil dibuat.');
    return { handled: true, reply: taskReply, intent: 'TASK' };
  }

  // CONFIRM_LIST — default
  const verdict = await aiRouter.classifyYesNo(textInput, `konfirmasi task "${pendingTask.title}" ke list "${pendingTask.listName}"`);
  let overrideList = null;
  if (verdict === 'NO') overrideList = 'Tugas Saya';
  else if (verdict === 'AMBIGUOUS') overrideList = textInput.trim();
  const resTask = await taskManager.executePendingTask(sessionId, overrideList);
  const taskReply = stripHtml(resTask?.message || '✅ Tugas berhasil dibuat.');
  return { handled: true, reply: taskReply, intent: 'TASK' };
}

// ── Orchestrator Interceptor Runner ──────────────────────────
async function runPendingInterceptors(textInput, sessionId) {
  // 1. Pending deletions
  const delRes = await handlePendingDeletions(textInput);
  if (delRes?.handled) return delRes;

  // 2. Pending finance
  const finRes = await handlePendingFinance(textInput);
  if (finRes?.handled) return finRes;

  // 3. Pending calendar
  const calRes = await handlePendingCalendar(textInput, sessionId);
  if (calRes?.handled) return calRes;

  // 4. Pending tasks
  const taskRes = await handlePendingTasks(textInput, sessionId);
  if (taskRes?.handled) return taskRes;

  return null;
}

module.exports = {
  cliPendingCalendar,
  cliPendingConflict,
  cliPendingEmail,
  cliPendingDatabase,
  stripHtml,
  _stripHtml: stripHtml,
  triggerConversationalSynthesis,
  _triggerConversationalSynthesis: triggerConversationalSynthesis,
  handlePendingDeletions,
  handlePendingFinance,
  handlePendingCalendar,
  handlePendingTasks,
  runPendingInterceptors
};
