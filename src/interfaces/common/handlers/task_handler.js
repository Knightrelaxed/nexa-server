'use strict';
// ============================================================
// N.E.X.A — COMMON TASK HANDLER
// Handles TASK intent across Telegram and CLI interfaces
// ============================================================

const taskManager = require('../../../domain/Task_Manager');

async function handleTaskIntent(routingData, context = {}) {
  const ed = routingData?.extracted_data || {};
  const sessionKey = context.sessionKey || context.chatId;
  const textInput = context.textInput || '';

  // Defensive contextual fallback: if COMPLETE or DELETE has missing or undefined targets,
  // feed the raw user textInput into search_keyword so contextual resolver can inspect phrases
  // like "dua tugas tadi" or "yang deadline hari ini"
  if (['COMPLETE', 'DELETE'].includes(ed.action)) {
    const hasValidTarget = (ed.title && ed.title !== 'undefined') ||
                           (ed.search_keyword && ed.search_keyword !== 'undefined') ||
                           (Array.isArray(ed.tasks) && ed.tasks.length > 0);
    if (!hasValidTarget && textInput) {
      ed.search_keyword = textInput;
    }
  }

  const taskResult = await taskManager.handleTaskIntent(ed, sessionKey);
  const notify = typeof context.notifyClient === 'function' ? context.notifyClient : () => {};

  if (taskResult?.status === 'PENDING_CONFIRM') {
    const { pendingTaskCategories, executePendingTask } = taskManager;
    const old = pendingTaskCategories.get(sessionKey);
    if (old?.timerId) clearTimeout(old.timerId);

    const timerId = setTimeout(async () => {
      if (pendingTaskCategories.has(sessionKey)) {
        try {
          const res = await executePendingTask(sessionKey);
          if (res?.message) notify(res.message + '\n\n(Dikategorikan otomatis karena tidak ada konfirmasi dalam 5 menit)');
        } catch (e) { console.error('[TASK-HANDLER] Auto-confirm failed:', e.message); }
      }
    }, 5 * 60 * 1000);

    pendingTaskCategories.set(sessionKey, {
      type: 'CONFIRM_LIST',
      title: taskResult.title,
      notes: taskResult.notes,
      dueDate: taskResult.due_date,
      listName: taskResult.pendingListName,
      durationMins: taskResult.durationMins,
      hasAutonomousBlock: taskResult.hasAutonomousBlock,
      syncCalendar: taskResult.sync_calendar || false,
      calendarStartTime: taskResult.calendar_start_time || null,
      timerId,
      chatId: sessionKey
    });

    return `📋 Tugas '${taskResult.title}' akan saya masukkan ke list ${taskResult.pendingListName}.\n\nKonfirmasi? Balas:\n• ya — masukkan sekarang\n• nama list lain — pindah ke list tersebut\n• tidak — masukkan ke Tugas Saya\n\n⏱️ Auto-masuk dalam 5 menit jika tidak ada respons.`;
  }

  if (taskResult?.status === 'PENDING_DURATION') {
    const { pendingTaskCategories, executePendingTask } = taskManager;
    const old = pendingTaskCategories.get(sessionKey);
    if (old?.timerId) clearTimeout(old.timerId);

    const timerId = setTimeout(async () => {
      if (pendingTaskCategories.has(sessionKey)) {
        try {
          const res = await executePendingTask(sessionKey);
          if (res?.message) notify(res.message);
        } catch (e) { console.error('[TASK-HANDLER] Auto-create without block failed:', e.message); }
      }
    }, 5 * 60 * 1000);

    pendingTaskCategories.set(sessionKey, {
      type: 'CONFIRM_DURATION',
      title: taskResult.title,
      notes: taskResult.notes,
      dueDate: taskResult.due_date,
      listName: taskResult.list_name,
      durationMins: 0,
      hasAutonomousBlock: false,
      timerId,
      chatId: sessionKey
    });

    return taskResult.message;
  }

  if (taskResult?.status === 'PENDING_SYNC_CONFIRM') {
    const { pendingTaskCategories } = taskManager;
    const old = pendingTaskCategories.get(sessionKey);
    if (old?.timerId) clearTimeout(old.timerId);

    const timerId = setTimeout(async () => {
      if (pendingTaskCategories.has(sessionKey)) {
        try {
          const pd = pendingTaskCategories.get(sessionKey);
          pendingTaskCategories.delete(sessionKey);
          const floatRes = await taskManager.handleTaskIntent({
            action: 'CREATE', title: pd.title, notes: pd.notes,
            due_date: pd.dueDate, list_name: pd.listName,
            duration_minutes: pd.durationMins, sync_calendar: false, calendar_start_time: null,
          }, null);
          if (floatRes?.message) notify(floatRes.message + '\n\n(Tugas disimpan tanpa sinkronisasi kalender karena tidak ada respons dalam 5 menit)');
        } catch (e) { console.error('[TASK-HANDLER SYNC] Auto-create floating failed:', e.message); }
      }
    }, 5 * 60 * 1000);

    pendingTaskCategories.set(sessionKey, {
      type: 'CONFIRM_SYNC',
      title: taskResult.title,
      notes: taskResult.notes,
      dueDate: taskResult.due_date,
      listName: taskResult.list_name,
      durationMins: taskResult.duration_minutes || 60,
      timerId,
      chatId: sessionKey
    });

    return taskResult.message;
  }

  if (taskResult?.message || taskResult) {
    const replyMsg = taskResult?.message || taskResult;
    const action = ed.action || 'READ';
    if (['CREATE', 'CREATE_SUBTASK', 'READ', 'READ_TODAY', 'READ_TOMORROW', 'READ_UPCOMING', 'READ_OVERDUE', 'READ_LISTS', 'COMPLETE'].includes(action)) {
      if (typeof context.triggerSynthesis === 'function') {
        context.triggerSynthesis(textInput, replyMsg, action, sessionKey);
      }
    }
    return replyMsg;
  }

  return null;
}

module.exports = {
  handleTaskIntent
};
