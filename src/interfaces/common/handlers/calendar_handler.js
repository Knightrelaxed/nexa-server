'use strict';
// ============================================================
// N.E.X.A — COMMON CALENDAR HANDLER
// Handles CALENDAR intent across Telegram and CLI interfaces
// ============================================================

const agendaManager = require('../../../domain/Agenda_Manager');

function _getPendingCalendar(context) {
  if (context.pendingCalendarContext) return context.pendingCalendarContext;
  if (context.pendingCalendar && typeof context.pendingCalendar.get === 'function') {
    return context.pendingCalendar.get(context.sessionKey);
  }
  return null;
}

function _setPendingCalendar(context, val) {
  if (typeof context.setPendingCalendarContext === 'function') {
    return context.setPendingCalendarContext(val);
  }
  if (context.pendingCalendar && typeof context.pendingCalendar.set === 'function') {
    if (val === null) context.pendingCalendar.delete(context.sessionKey);
    else context.pendingCalendar.set(context.sessionKey, val);
  }
}

function _setPendingConflict(context, val) {
  if (typeof context.setPendingConflictEvent === 'function') {
    return context.setPendingConflictEvent(val);
  }
  if (context.pendingConflict && typeof context.pendingConflict.set === 'function') {
    if (val === null) context.pendingConflict.delete(context.sessionKey);
    else context.pendingConflict.set(context.sessionKey, val);
  }
}

async function handleCalendarIntent(routingData, context = {}) {
  const ed = routingData?.extracted_data || {};
  const calData = ed.CALENDAR || ed;
  const textInput = context.textInput || '';
  const pendingCal = _getPendingCalendar(context);

  // Sanitize hallucinated summary untuk READ actions
  if (calData.summary && typeof calData.summary === 'string' && ['READ', 'READ_TODAY', 'READ_TOMORROW', 'READ_UPCOMING'].includes(calData.action)) {
    const sLower = calData.summary.trim().toLowerCase();
    if (sLower.length > 25 || /adalah|tidak ada|jadwal|tugas|jatuh tempo|hari besok|hari ini|minggu ini|senin|selasa|rabu|kamis|jumat|sabtu|minggu|juli|agustus|januari|februari|maret|april|mei|juni|september|oktober|november|desember|202[0-9]/i.test(sLower)) {
      console.warn(`[COMMON-CAL] Hallucinated READ summary ignored: "${calData.summary}"`);
      calData.summary = null;
    }
  }

  // Merge pending calendar jika ada context sebelumnya
  if (pendingCal && calData.action === 'CREATE' && calData.end && !calData.summary) {
    calData.summary = pendingCal.summary;
    calData.start = pendingCal.start;
    agendaManager.cancelPending(pendingCal.summary);
    _setPendingCalendar(context, null);
  }

  const calResult = await agendaManager.handleCalendarIntent(calData, textInput);

  if (calResult?.status === 'PENDING_END' || calResult?.status === 'NEED_INFO') {
    _setPendingCalendar(context, {
      summary: calData.summary,
      start: calData.start,
      askedAt: Date.now()
    });
  } else if (calResult?.status === 'CONFLICT_DETECTED') {
    _setPendingConflict(context, {
      ...calResult.pendingEvent,
      askedAt: Date.now()
    });
  } else if (calResult?.status === 'SUCCESS') {
    _setPendingCalendar(context, null);
    _setPendingConflict(context, null);
    if (typeof context.setPendingProactiveTasks === 'function' && Array.isArray(calResult.proactiveTasks) && calResult.proactiveTasks.length > 0) {
      context.setPendingProactiveTasks({
        summary: calData.summary,
        start: calData.start,
        tasks: calResult.proactiveTasks,
        askedAt: Date.now()
      });
    }
  }

  if (calResult?.message || calResult) {
    const replyMsg = calResult?.message || calResult;
    const action = calData.action;
    let isPast = false;
    if (calData.start) {
      const reqDate = new Date(calData.start);
      const jakartaDateStr = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' });
      const todayJakartaStart = new Date(`${jakartaDateStr}T00:00:00+07:00`);
      if (reqDate < todayJakartaStart) isPast = true;
    }

    if (!isPast && ['CREATE', 'UPDATE', 'READ', 'READ_TODAY', 'READ_TOMORROW', 'READ_UPCOMING'].includes(action)) {
      if (typeof context.triggerSynthesis === 'function') {
        context.triggerSynthesis(textInput, replyMsg, action, context.sessionKey);
      }
    }
    return replyMsg;
  }

  return null;
}

module.exports = {
  handleCalendarIntent
};
