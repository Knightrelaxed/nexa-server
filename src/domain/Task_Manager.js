const googleTasks = require('../infrastructure/Google_Tasks');
const googleWorkspace = require('../infrastructure/Google_Workspace');
const notionClient = require('../infrastructure/Notion_Client');

// ── CATEGORY KEYWORDS → LIST NAME MAPPING ──────────────────────────────────
// Used for auto-categorization suggestion
const CATEGORY_MAP = [
  { keywords: ['kuliah', 'matkul', 'tugas kuliah', 'essay', 'makalah', 'laporan', 'presentasi', 'uas', 'uts', 'ujian'], list: 'Tugas Kuliah' },
  { keywords: ['belanja', 'beli', 'toko', 'supermarket', 'beras', 'minyak', 'sabun'], list: 'Belanja' },
  { keywords: ['kerja', 'meeting', 'rapat', 'deadline proyek', 'klien', 'proposal kerja'], list: 'Pekerjaan' },
  { keywords: ['baca', 'buku', 'artikel', 'jurnal', 'riset', 'penelitian'], list: 'Riset & Baca' },
  { keywords: ['bayar', 'transfer', 'tagihan', 'cicilan', 'biaya', 'uang'], list: 'Keuangan' },
];

// ── 5-MINUTE AUTO-CONFIRM STORE ──────────────────────────────────────────────
// key: chatId (string), value: { title, notes, dueDate, listName, timerId }
const pendingTaskCategories = new Map();

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Auto-categorize a task title by checking keywords.
 * Returns suggested list name, or null if no match.
 */
function suggestList(title) {
  const t = (title || '').toLowerCase();
  for (const cat of CATEGORY_MAP) {
    if (cat.keywords.some(k => t.includes(k))) return cat.list;
  }
  return null;
}

/**
 * Format a task for Telegram display, with overdue highlighting and subtask indent.
 */
function formatTask(task, index, indent = 0) {
  const now = new Date();
  const todayStr = now.toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' });
  const prefix = '   '.repeat(indent);

  let icon = '🔲';
  let overdueTag = '';

  if (task.due) {
    const dueStr = task.due.split('T')[0];
    if (dueStr < todayStr) {
      const daysLate = Math.floor((now - new Date(dueStr + 'T00:00:00+07:00')) / (1000 * 60 * 60 * 24));
      icon = '🔴';
      overdueTag = ` ⚠️ <b>TERLAMBAT ${daysLate} HARI!</b>`;
    } else if (dueStr === todayStr) {
      icon = '🟡';
      overdueTag = ' (Hari ini!)';
    }
  }

  let line = `${prefix}${icon} <b>${index + 1}. ${escapeHtml(task.title || '(Tanpa judul)')}</b>${overdueTag}`;
  if (task.due) {
    const due = new Date(task.due.split('T')[0] + 'T00:00:00+07:00');
    line += `\n${prefix}   📅 ${due.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Jakarta' })}`;
  }
  if (task.notes) {
    const notesPreview = task.notes.split('\n')[0];
    line += `\n${prefix}   📝 ${escapeHtml(notesPreview)}`;
  }
  return line;
}

/**
 * Helper to auto-create a Calendar event for tasks with a specific deadline time.
 *
 * CRITICAL GUARD: Only fires if due_date has an EXPLICIT time component (contains 'T').
 * A bare date string like "2026-05-09" MUST NOT enter here — JS parses it as midnight UTC
 * which converts to 07:00 WIB, creating phantom calendar spam.
 */
async function autoCreateCalendarBlock(title, due_date, durationMinutes = 30) {
  if (!due_date) return false;
  // GUARD: Reject pure date strings — they have no user-specified time.
  if (!due_date.includes('T')) return false;
  // GUARD: Reject midnight times which are usually just parsed date-only strings
  if (due_date.includes('T00:00:00.000Z') || due_date.includes('T00:00:00Z') || due_date.includes('T00:00:00+')) return false;
  if (due_date.includes('T17:00:00.000Z') || due_date.includes('T17:00:00Z')) return false; // 17:00 UTC is midnight Jakarta

  const dueMs = new Date(due_date);
  if (isNaN(dueMs.getTime())) return false;
  const h = dueMs.toLocaleString('en-US', { timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit', hour12: false });
  // Only create a block if there is a meaningful time (not midnight WIB which could also be an unintended offset)
  if (h && h !== '00:00' && h !== '24:00' && h !== '07:00') { // Also ignore 07:00 to prevent the UTC midnight bug entirely
    // Time is explicitly set. Create a calendar block for the deadline.
    const startIso = dueMs.toISOString();
    const endIso = new Date(dueMs.getTime() + durationMinutes * 60000).toISOString();
    try {
      await googleWorkspace.createCalendarEvent(
        `⏰ BLOK KERJA: ${title}`,
        startIso,
        endIso,
        'Otomatis dijadwalkan oleh N.E.X.A Autonomous Time-Blocking.'
      );
      return true;
    } catch (e) {
      console.warn('[TASKS] Failed to auto-create calendar block:', e.message);
    }
  }
  return false;
}

/**
 * Cancel a pending task creation.
 */
function cancelPendingTask(chatId) {
  const pending = pendingTaskCategories.get(chatId);
  if (!pending) return false;
  if (pending.timerId) clearTimeout(pending.timerId);
  pendingTaskCategories.delete(chatId);
  return true;
}

/**
 * Execute pending task creation (called after confirmation OR after 5-min timeout).
 */
async function executePendingTask(chatId, overrideListName = null) {
  const pending = pendingTaskCategories.get(chatId);
  if (!pending) return null;

  // Cancel the auto-timer if manually confirmed
  if (pending.timerId) clearTimeout(pending.timerId);
  pendingTaskCategories.delete(chatId);

  const { title, notes, dueDate, durationMins, hasAutonomousBlock } = pending;
  const listName = overrideListName || pending.listName;

  let listId = '@default';
  if (listName && listName !== 'Tugas Saya') {
    try {
      const list = await googleTasks.findOrCreateList(listName);
      listId = list.id;
    } catch (e) {
      console.warn('[TASKS] Could not find/create list, using default:', e.message);
    }
  }

  const task = await googleTasks.createTask({ title, notes, dueDate, listId });
  
  // [PHASE: Parallel Sync to Notion] - Fire and forget
  notionClient.createTask(title, notes, dueDate).catch(e => console.error('[NOTION SYNC] Failed:', e.message));

  let msg = `✅ Tugas '<b>${escapeHtml(task.title)}</b>' berhasil ditambahkan ke list <b>${escapeHtml(listName || 'Tugas Saya')}</b>.`;
  if (dueDate) {
    const d = new Date(dueDate.split('T')[0] + 'T00:00:00+07:00');
    msg += `\n📅 Deadline: ${d.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Jakarta' })}`;
    
    // Auto-create calendar block if time is specified
    const hasCalBlock = await autoCreateCalendarBlock(title, dueDate, durationMins || 30);
    if (hasCalBlock) {
      if (hasAutonomousBlock) {
        msg += `\n🤖 <b>Autonomous Time-Blocking:</b> Menemukan slot kosong dan otomatis menambahkan blok kerja ${durationMins} menit di Kalender!`;
      } else {
        msg += `\n📅 Otomatis menambahkan blok waktu di Google Calendar!`;
      }
    }
  }
  return { status: 'SUCCESS', message: msg };
}

/**
 * Main handler for TASK intent from AI Router
 */
async function handleTaskIntent(extractedData, chatId = null) {
  const { action, title, due_date, notes, search_keyword, list_name, parent_task_keyword, duration_minutes } = extractedData;
  console.log(`[TASKS] Executing Task Intent: ${action}`);

  try {
    // ── CREATE ──────────────────────────────────────────────
    if (action === 'CREATE') {
      if (!title) return { status: 'FAILED', message: '❌ Mohon sebutkan nama tugasnya, Tuan.' };

      let taskNotes = notes || '';
      let timeLabel = null;
      let durationMins = duration_minutes || 0; // AI Router extracts this naturally
      let hasAutonomousBlock = false;
      let resolvedDueDate = due_date;

      // [AI-DRIVEN DURATION]: If AI Router detected a duration, use it.
      // If NOT detected (null/0) AND task has a deadline, proactively ask the user.
      if (!durationMins && resolvedDueDate && chatId) {
        // Return PENDING_DURATION — NEXA will ask the user how long the task takes
        return {
          status: 'PENDING_DURATION',
          title,
          notes: taskNotes,
          due_date: resolvedDueDate,
          list_name,
          chatId,
          message: `⏱️ Tugas '<b>${escapeHtml(title)}</b>' sudah saya catat.\n\nKira-kira <b>berapa lama</b> waktu yang dibutuhkan untuk mengerjakannya, Tuan?\n<i>(Contoh: "2 jam", "45 menit", "30m")\nSaya akan otomatis mencarikan slot kosong di Kalender Tuan!</i>\n\n<i>⏳ Jika tidak ada respons dalam 5 menit, tugas akan dibuat tanpa blok waktu otomatis.</i>`
        };
      }

      // If duration was provided (from AI or from PENDING_DURATION confirmation)
      if (durationMins > 0) {
        // CRITICAL FIX: Only extract explicit time if due_date has an EXPLICIT 'T' time component.
        if (resolvedDueDate && resolvedDueDate.includes('T')) {
          const isMidnightUTC = resolvedDueDate.includes('T00:00:00.000Z') || resolvedDueDate.includes('T00:00:00Z') || resolvedDueDate.includes('T17:00:00.000Z') || resolvedDueDate.includes('T17:00:00Z') || resolvedDueDate.includes('T00:00:00+');
          if (!isMidnightUTC) {
            const dueMs = new Date(resolvedDueDate);
            if (!isNaN(dueMs.getTime())) {
              const h = dueMs.toLocaleString('en-US', { timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit', hour12: false });
              if (h && h !== '00:00') {
                timeLabel = h + ' WIB';
                taskNotes = taskNotes ? `⏰ Jam: ${timeLabel}\n${taskNotes}` : `⏰ Jam: ${timeLabel}`;
              }
            }
          }
        } else if (resolvedDueDate) {
          // [AUTONOMOUS TIME BLOCKING]
          // Date only AND duration is known! Find an empty slot automatically.
          const targetDateMs = new Date(resolvedDueDate.split('T')[0] + 'T00:00:00+07:00').getTime();
          const nowMs = Date.now();
          const timeMinIso = new Date(nowMs).toISOString();
          const timeMaxIso = new Date(Math.max(nowMs + 24 * 3600000, targetDateMs + 24 * 3600000 - 1)).toISOString();

          try {
            const { findEmptySlot } = require('../infrastructure/Google_Workspace');
            const slot = await findEmptySlot(durationMins, timeMinIso, timeMaxIso);
            if (slot) {
              resolvedDueDate = slot.start;
              const dueMs = new Date(resolvedDueDate);
              const h = dueMs.toLocaleString('en-US', { timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit', hour12: false });
              timeLabel = `${h} WIB (Auto-Blocked)`;
              taskNotes = taskNotes ? `⏰ Jam: ${timeLabel}\n${taskNotes}` : `⏰ Jam: ${timeLabel}`;
              hasAutonomousBlock = true;
            }
          } catch (e) {
            console.error('[AUTONOMOUS BLOCKING] Failed to find slot:', e.message);
          }
        }
      } else if (resolvedDueDate && resolvedDueDate.includes('T')) {
        // No duration but explicit time — just label it
        const isMidnightUTC = resolvedDueDate.includes('T00:00:00.000Z') || resolvedDueDate.includes('T00:00:00Z') || resolvedDueDate.includes('T17:00:00.000Z') || resolvedDueDate.includes('T17:00:00Z') || resolvedDueDate.includes('T00:00:00+');
        if (!isMidnightUTC) {
          const dueMs = new Date(resolvedDueDate);
          if (!isNaN(dueMs.getTime())) {
            const h = dueMs.toLocaleString('en-US', { timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit', hour12: false });
            if (h && h !== '00:00') {
              timeLabel = h + ' WIB';
              taskNotes = taskNotes ? `⏰ Jam: ${timeLabel}\n${taskNotes}` : `⏰ Jam: ${timeLabel}`;
            }
          }
        }
      }

      // Determine target list
      let resolvedList = list_name || null;
      let isSuggested = false;
      if (!resolvedList) {
        resolvedList = suggestList(title);
        isSuggested = !!resolvedList;
      }

      // If chatId is provided and we auto-suggested a list (not explicitly asked), set up 5-min confirmation
      if (chatId && resolvedList && resolvedList !== 'Tugas Saya' && isSuggested) {
        return { status: 'PENDING_CONFIRM', pendingListName: resolvedList, title, notes: taskNotes, due_date: resolvedDueDate, durationMins, hasAutonomousBlock, chatId };
      }

      // If no chatId or list is default, create directly without confirmation

      // Otherwise create directly in the specified or default list
      let listId = '@default';
      if (resolvedList && resolvedList !== 'Tugas Saya') {
        try {
          const list = await googleTasks.findOrCreateList(resolvedList);
          listId = list.id;
        } catch (e) {
          console.warn('[TASKS] List lookup failed, using default:', e.message);
        }
      }

      const task = await googleTasks.createTask({ title, notes: taskNotes, dueDate: resolvedDueDate || null, listId });
      
      // [PHASE: Parallel Sync to Notion] - Fire and forget
      notionClient.createTask(title, taskNotes, resolvedDueDate || null).catch(e => console.error('[NOTION SYNC] Failed:', e.message));
      
      let msg = `✅ Tugas '<b>${escapeHtml(task.title)}</b>' ditambahkan ke <b>${escapeHtml(resolvedList || 'Tugas Saya')}</b>.`;
      if (resolvedDueDate) {
        const dueDateObj = new Date(resolvedDueDate.split('T')[0] + 'T00:00:00+07:00');
        msg += `\n📅 Deadline: ${dueDateObj.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Jakarta' })}`;
        if (timeLabel) msg += ` jam ${timeLabel}`;
        
        // Auto-create calendar block if time is specified
        const hasCalBlock = await autoCreateCalendarBlock(title, resolvedDueDate, durationMins);
        if (hasCalBlock) {
          if (hasAutonomousBlock) {
            msg += `\n🤖 <b>Autonomous Time-Blocking:</b> Menemukan slot kosong dan otomatis menambahkan blok kerja ${durationMins} menit di Kalender!`;
          } else {
            msg += `\n📅 Otomatis menambahkan blok waktu di Google Calendar!`;
          }
        }
      }
      return { status: 'SUCCESS', message: msg };
    }

    // ── CREATE_SUBTASK ───────────────────────────────────────
    if (action === 'CREATE_SUBTASK') {
      if (!title) return { status: 'FAILED', message: '❌ Sebutkan nama sub-tugasnya, Tuan.' };
      if (!parent_task_keyword) return { status: 'FAILED', message: '❌ Sebutkan nama tugas utama yang akan ditambahkan sub-tugas.' };

      const parents = await googleTasks.findTasksByKeyword(parent_task_keyword);
      if (parents.length === 0) return { status: 'FAILED', message: `❌ Tugas utama '<b>${escapeHtml(parent_task_keyword)}</b>' tidak ditemukan.` };
      const parent = parents[0];

      const sub = await googleTasks.createSubtask({ title, notes: notes || '', dueDate: due_date || null, parentId: parent.id });
      return { status: 'SUCCESS', message: `✅ Sub-tugas '<b>${escapeHtml(sub.title)}</b>' ditambahkan ke bawah tugas '<b>${escapeHtml(parent.title)}</b>'.` };
    }

    // ── READ (active tasks + overdue detection) ────────────
    if (action === 'READ') {
      const tasks = await googleTasks.getActiveTasks();
      if (tasks.length === 0) return { status: 'SUCCESS', message: '✅ Tidak ada tugas yang tertunda, Tuan. Kalender bersih!' };

      const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' });
      const overdue  = tasks.filter(t => t.due && t.due.split('T')[0] < todayStr);
      const dueToday = tasks.filter(t => t.due && t.due.split('T')[0] === todayStr);
      const upcoming = tasks.filter(t => !t.due || t.due.split('T')[0] > todayStr);

      let msg = `📋 <b>Tugas Aktif (${tasks.length}):</b>`;
      if (overdue.length > 0) {
        msg += `\n\n🔴 <b>TERLAMBAT (${overdue.length}):</b>\n`;
        msg += overdue.map((t, i) => formatTask(t, i)).join('\n\n');
      }
      if (dueToday.length > 0) {
        msg += `\n\n🟡 <b>HARI INI (${dueToday.length}):</b>\n`;
        msg += dueToday.map((t, i) => formatTask(t, i)).join('\n\n');
      }
      if (upcoming.length > 0) {
        msg += `\n\n🔲 <b>MENDATANG (${upcoming.length}):</b>\n`;
        msg += upcoming.map((t, i) => formatTask(t, i)).join('\n\n');
      }
      if (overdue.length > 0) msg += `\n\n⚠️ <i>Tuan memiliki ${overdue.length} tugas yang melewati deadline!</i>`;
      return { status: 'SUCCESS', message: msg };
    }

    // ── READ_LIST ────────────────────────────────────────────
    if (action === 'READ_LIST') {
      const targetList = list_name || search_keyword;
      if (!targetList) return { status: 'FAILED', message: '❌ Sebutkan nama list yang ingin ditampilkan.' };
      const tasks = await googleTasks.getTasksFromList(targetList);
      if (tasks.length === 0) return { status: 'SUCCESS', message: `📋 List '<b>${escapeHtml(targetList)}</b>' kosong atau tidak ditemukan.` };
      const list = tasks.map((t, i) => formatTask(t, i)).join('\n\n');
      return { status: 'SUCCESS', message: `📋 <b>List "${escapeHtml(targetList)}" (${tasks.length}):</b>\n\n${list}` };
    }

    // ── READ_LISTS ───────────────────────────────────────────
    if (action === 'READ_LISTS') {
      const lists = await googleTasks.getTaskLists();
      if (lists.length === 0) return { status: 'SUCCESS', message: '📋 Belum ada daftar tugas, Tuan.' };
      const lines = lists.map((l, i) => `${i + 1}. 📁 <b>${escapeHtml(l.title)}</b>`).join('\n');
      return { status: 'SUCCESS', message: `📁 <b>Daftar List Tugas (${lists.length}):</b>\n\n${lines}` };
    }

    // ── READ_DONE ───────────────────────────────────────────
    if (action === 'READ_DONE') {
      const tasks = await googleTasks.getCompletedTasks();
      if (tasks.length === 0) return { status: 'SUCCESS', message: '📭 Belum ada tugas yang diselesaikan.' };
      const list = tasks.map((t, i) => formatTask(t, i)).join('\n\n');
      return { status: 'SUCCESS', message: `✅ <b>Tugas Selesai (${tasks.length}):</b>\n\n${list}` };
    }

    // ── READ_OVERDUE ─────────────────────────────────────────
    if (action === 'READ_OVERDUE') {
      const tasks = await googleTasks.getOverdueTasks();
      if (tasks.length === 0) return { status: 'SUCCESS', message: '🎉 Tidak ada tugas yang terlambat, Tuan. Semua on-track!' };
      const list = tasks.map((t, i) => formatTask(t, i)).join('\n\n');
      return { status: 'SUCCESS', message: `🔴 <b>Tugas Terlambat (${tasks.length}):</b>\n\n${list}\n\n⚠️ <i>Segera selesaikan tugas-tugas di atas, Tuan!</i>` };
    }

    // ── READ_TODAY ──────────────────────────────────────────
    if (action === 'READ_TODAY') {
      const tasks = await googleTasks.getTasksDueToday();
      if (tasks.length === 0) return { status: 'SUCCESS', message: '✅ Tidak ada tugas yang jatuh tempo hari ini, Tuan.' };
      const list = tasks.map((t, i) => formatTask(t, i)).join('\n\n');
      return { status: 'SUCCESS', message: `🟡 <b>Tugas Hari Ini (${tasks.length}):</b>\n\n${list}` };
    }

    // ── READ_UPCOMING ───────────────────────────────────────
    if (action === 'READ_UPCOMING') {
      const tasks = await googleTasks.getUpcomingTasks(7);
      if (tasks.length === 0) return { status: 'SUCCESS', message: '✅ Tidak ada tugas dalam 7 hari ke depan.' };
      const byDate = {};
      for (const t of tasks) {
        const d = (t.due || '').split('T')[0];
        if (!byDate[d]) byDate[d] = [];
        byDate[d].push(t);
      }
      let msg = `📅 <b>Tugas 7 Hari ke Depan (${tasks.length}):</b>`;
      for (const [date, group] of Object.entries(byDate).sort()) {
        const label = new Date(date + 'T00:00:00+07:00').toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'short' });
        msg += `\n\n📌 <b>${label}:</b>`;
        for (const t of group) {
          msg += `\n   🔲 ${escapeHtml(t.title)}`;
          if (t.notes) msg += `\n      📝 ${escapeHtml(t.notes.split('\n')[0])}`;
        }
      }
      return { status: 'SUCCESS', message: msg };
    }

    // ── COMPLETE ────────────────────────────────────────────
    if (action === 'COMPLETE') {
      const keyword = search_keyword || title;
      if (!keyword) return { status: 'FAILED', message: '❌ Sebutkan nama tugas yang ingin ditandai selesai.' };
      const matches = await googleTasks.findTasksByKeyword(keyword);
      if (matches.length === 0) return { status: 'FAILED', message: `❌ Tidak ditemukan tugas cocok dengan "<b>${escapeHtml(keyword)}</b>".` };
      
      let syncedEvents = 0;
      for (const t of matches) {
        await googleTasks.completeTask(t.id, t.listId);
        
        // [PHASE: Parallel Sync to Notion]
        notionClient.completeTask(t.title).catch(e => console.error('[NOTION SYNC] Failed:', e.message));
        
        // [PHASE 4: Two-Way Status Sync]
        try {
          const events = await googleWorkspace.findEventByTitle(`⏰ DEADLINE: ${t.title}`);
          if (events && events.length > 0) {
            await googleWorkspace.updateCalendarEventColor(events[0].id, '8'); // 8 = Graphite
            syncedEvents++;
          }
        } catch (e) {
          console.warn('[TASKS] Failed to sync calendar color on task completion:', e.message);
        }
      }
      
      const names = matches.map(t => `'<b>${escapeHtml(t.title)}</b>'`).join(', ');
      let msg = `✅ Tugas ${names} ditandai <b>Selesai</b>! 🎉`;
      if (syncedEvents > 0) {
        msg += `\n📅 ${syncedEvents} jadwal deadline di Kalender otomatis diredupkan (abu-abu).`;
      }
      return { status: 'SUCCESS', message: msg };
    }

    // ── DELETE ──────────────────────────────────────────────
    if (action === 'DELETE') {
      const keyword = search_keyword || title;
      if (!keyword) return { status: 'FAILED', message: '❌ Sebutkan nama tugas yang ingin dihapus.' };
      const matches = await googleTasks.findTasksByKeyword(keyword);
      if (matches.length === 0) return { status: 'FAILED', message: `❌ Tidak ditemukan tugas cocok dengan "<b>${escapeHtml(keyword)}</b>".` };
      for (const t of matches) {
        await googleTasks.deleteTask(t.id, t.listId);
        // [PHASE: Parallel Sync to Notion]
        notionClient.deleteTask(t.title).catch(e => console.error('[NOTION SYNC] Failed:', e.message));
      }
      const names = matches.map(t => `'<b>${escapeHtml(t.title)}</b>'`).join(', ');
      return { status: 'SUCCESS', message: `🗑️ Tugas ${names} berhasil dihapus.` };
    }

    // ── CLEAR_DONE ──────────────────────────────────────────
    if (action === 'CLEAR_DONE') {
      await googleTasks.clearCompletedTasks();
      return { status: 'SUCCESS', message: '🧹 Semua tugas yang sudah selesai telah dibersihkan.' };
    }

    // ── MOVE ────────────────────────────────────────────────
    if (action === 'MOVE') {
      const keyword = search_keyword || title;
      if (!keyword) return { status: 'FAILED', message: '❌ Sebutkan nama tugas yang ingin dipindahkan.' };
      if (!list_name) return { status: 'FAILED', message: '❌ Sebutkan nama list tujuan.' };

      const matches = await googleTasks.findTasksByKeyword(keyword);
      if (matches.length === 0) return { status: 'FAILED', message: `❌ Tidak ditemukan tugas cocok dengan "<b>${escapeHtml(keyword)}</b>".` };

      const task = matches[0];
      await googleTasks.moveTaskToList(task.id, list_name, task.listId);
      return { status: 'SUCCESS', message: `✅ Tugas '<b>${escapeHtml(task.title)}</b>' berhasil dipindahkan ke list <b>${escapeHtml(list_name)}</b>.` };
    }

    // ── EDIT ────────────────────────────────────────────────
    if (action === 'EDIT') {
      const keyword = search_keyword || title;
      if (!keyword) return { status: 'FAILED', message: '❌ Sebutkan nama tugas yang ingin diubah.' };
      const matches = await googleTasks.findTasksByKeyword(keyword);
      if (matches.length === 0) return { status: 'FAILED', message: `❌ Tidak ditemukan tugas cocok dengan "<b>${escapeHtml(keyword)}</b>".` };
      for (const t of matches) {
        await googleTasks.editTask({ taskId: t.id, newTitle: title || t.title, newNotes: notes, newDueDate: due_date, listId: t.listId });
      }
      return { status: 'SUCCESS', message: `✏️ Tugas '<b>${escapeHtml(matches[0].title)}</b>' berhasil diperbarui.` };
    }

    // ── SET_PRIORITY ─────────────────────────────────────────
    if (action === 'SET_PRIORITY') {
      const keyword = search_keyword || title;
      if (!keyword) return { status: 'FAILED', message: '❌ Sebutkan nama tugas yang ingin diprioritaskan, Tuan.' };
      const matches = await googleTasks.findTasksByKeyword(keyword);
      if (matches.length === 0) return { status: 'FAILED', message: `❌ Tidak ditemukan tugas cocok dengan "<b>${escapeHtml(keyword)}</b>".` };

      const task = matches[0];
      const alreadyPriority = task.title.startsWith('⭐ [PRIORITAS]');
      if (alreadyPriority) {
        return { status: 'SUCCESS', message: `⭐ Tugas '<b>${escapeHtml(task.title)}</b>' sudah ditandai sebagai prioritas tinggi, Tuan.` };
      }
      const newTitle = `⭐ [PRIORITAS] ${task.title}`;
      await googleTasks.editTask({ taskId: task.id, newTitle, listId: task.listId });
      return { status: 'SUCCESS', message: `⭐ Tugas '<b>${escapeHtml(task.title)}</b>' berhasil ditandai sebagai <b>Prioritas Tinggi</b>!` };
    }


    // ── CREATE_MULTIPLE ──────────────────────────────────────
    if (action === 'CREATE_MULTIPLE') {
      const tasks = extractedData.tasks || [];
      if (tasks.length === 0) return { status: 'FAILED', message: '❌ Tidak ada tugas yang disebutkan untuk dibuat.' };

      const results = [];
      for (const t of tasks) {
        try {
          const taskTitle = t.title || t;
          if (!taskTitle) continue;
          const taskNotes = t.notes || '';
          const taskDue = t.due_date || null;
          let resolvedList = t.list_name || suggestList(taskTitle) || 'Tugas Saya';

          let listId = '@default';
          if (resolvedList && resolvedList !== 'Tugas Saya') {
            try {
              const list = await googleTasks.findOrCreateList(resolvedList);
              listId = list.id;
            } catch (e) {
              console.warn('[TASKS] List lookup failed for multi-create, using default:', e.message);
            }
          }
          const created = await googleTasks.createTask({ title: taskTitle, notes: taskNotes, dueDate: taskDue, listId });
          results.push(`✅ <b>${escapeHtml(created.title)}</b> → <i>${escapeHtml(resolvedList)}</i>`);
        } catch (e) {
          results.push(`❌ Gagal membuat tugas: ${e.message}`);
        }
      }
      return { status: 'SUCCESS', message: `📋 <b>${results.length} tugas berhasil dibuat:</b>\n${results.join('\n')}` };
    }

    return { status: 'FAILED', message: `Aksi task tidak dikenali: ${action}` };

  } catch (error) {
    console.error('[TASKS] Error:', error.message);
    return { status: 'FAILED', message: `❌ Operasi task gagal: ${error.message}` };
  }
}

module.exports = { handleTaskIntent, pendingTaskCategories, executePendingTask, cancelPendingTask, suggestList };
