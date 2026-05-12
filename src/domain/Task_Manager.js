const googleTasks = require('../infrastructure/Google_Tasks');

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
 * Execute pending task creation (called after confirmation OR after 5-min timeout).
 */
async function executePendingTask(chatId, overrideListName = null) {
  const pending = pendingTaskCategories.get(chatId);
  if (!pending) return null;

  // Cancel the auto-timer if manually confirmed
  if (pending.timerId) clearTimeout(pending.timerId);
  pendingTaskCategories.delete(chatId);

  const { title, notes, dueDate } = pending;
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
  let msg = `✅ Tugas '<b>${escapeHtml(task.title)}</b>' berhasil ditambahkan ke list <b>${escapeHtml(listName || 'Tugas Saya')}</b>.`;
  if (dueDate) {
    const d = new Date(dueDate.split('T')[0] + 'T00:00:00+07:00');
    msg += `\n📅 Deadline: ${d.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Jakarta' })}`;
  }
  return { status: 'SUCCESS', message: msg };
}

/**
 * Main handler for TASK intent from AI Router
 */
async function handleTaskIntent(extractedData, chatId = null) {
  const { action, title, due_date, notes, search_keyword, list_name, parent_task_keyword } = extractedData;
  console.log(`[TASKS] Executing Task Intent: ${action}`);

  try {
    // ── CREATE ──────────────────────────────────────────────
    if (action === 'CREATE') {
      if (!title) return { status: 'FAILED', message: '❌ Mohon sebutkan nama tugasnya, Tuan.' };

      let taskNotes = notes || '';
      let timeLabel = null;
      if (due_date) {
        const dueMs = new Date(due_date);
        if (!isNaN(dueMs.getTime())) {
          const h = dueMs.toLocaleString('en-US', { timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit', hour12: false });
          if (h && h !== '00:00') {
            timeLabel = h + ' WIB';
            taskNotes = taskNotes ? `⏰ Jam: ${timeLabel}\n${taskNotes}` : `⏰ Jam: ${timeLabel}`;
          }
        }
      }

      // Determine target list
      let resolvedList = list_name || null;
      if (!resolvedList) resolvedList = suggestList(title);

      // If chatId is provided and we have a suggestion, set up 5-min confirmation
      // If chatId is not provided, skip confirmation and create directly
      if (chatId && resolvedList && resolvedList !== 'Tugas Saya') {
        return { status: 'PENDING_CONFIRM', pendingListName: resolvedList, title, notes: taskNotes, due_date, chatId };
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

      const task = await googleTasks.createTask({ title, notes: taskNotes, dueDate: due_date || null, listId });
      let msg = `✅ Tugas '<b>${escapeHtml(task.title)}</b>' ditambahkan ke <b>${escapeHtml(resolvedList || 'Tugas Saya')}</b>.`;
      if (due_date) {
        const dueDate = new Date(due_date.split('T')[0] + 'T00:00:00+07:00');
        msg += `\n📅 Deadline: ${dueDate.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Jakarta' })}`;
        if (timeLabel) msg += ` jam ${timeLabel}`;
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
      if (!search_keyword) return { status: 'FAILED', message: '❌ Sebutkan nama tugas yang ingin ditandai selesai.' };
      const matches = await googleTasks.findTasksByKeyword(search_keyword);
      if (matches.length === 0) return { status: 'FAILED', message: `❌ Tidak ditemukan tugas cocok dengan "<b>${escapeHtml(search_keyword)}</b>".` };
      for (const t of matches) await googleTasks.completeTask(t.id);
      const names = matches.map(t => `'<b>${escapeHtml(t.title)}</b>'`).join(', ');
      return { status: 'SUCCESS', message: `✅ Tugas ${names} ditandai <b>Selesai</b>! 🎉` };
    }

    // ── DELETE ──────────────────────────────────────────────
    if (action === 'DELETE') {
      if (!search_keyword) return { status: 'FAILED', message: '❌ Sebutkan nama tugas yang ingin dihapus.' };
      const matches = await googleTasks.findTasksByKeyword(search_keyword);
      if (matches.length === 0) return { status: 'FAILED', message: `❌ Tidak ditemukan tugas cocok dengan "<b>${escapeHtml(search_keyword)}</b>".` };
      for (const t of matches) await googleTasks.deleteTask(t.id);
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
      if (!search_keyword) return { status: 'FAILED', message: '❌ Sebutkan nama tugas yang ingin dipindahkan.' };
      if (!list_name) return { status: 'FAILED', message: '❌ Sebutkan nama list tujuan.' };

      const matches = await googleTasks.findTasksByKeyword(search_keyword);
      if (matches.length === 0) return { status: 'FAILED', message: `❌ Tidak ditemukan tugas cocok dengan "<b>${escapeHtml(search_keyword)}</b>".` };

      const task = matches[0];
      await googleTasks.moveTaskToList(task.id, list_name);
      return { status: 'SUCCESS', message: `✅ Tugas '<b>${escapeHtml(task.title)}</b>' berhasil dipindahkan ke list <b>${escapeHtml(list_name)}</b>.` };
    }

    // ── EDIT ────────────────────────────────────────────────
    if (action === 'EDIT') {
      if (!search_keyword) return { status: 'FAILED', message: '❌ Sebutkan nama tugas yang ingin diubah.' };
      const matches = await googleTasks.findTasksByKeyword(search_keyword);
      if (matches.length === 0) return { status: 'FAILED', message: `❌ Tidak ditemukan tugas cocok dengan "<b>${escapeHtml(search_keyword)}</b>".` };
      for (const t of matches) {
        await googleTasks.editTask({ taskId: t.id, newTitle: title || t.title, newNotes: notes, newDueDate: due_date });
      }
      return { status: 'SUCCESS', message: `✏️ Tugas '<b>${escapeHtml(matches[0].title)}</b>' berhasil diperbarui.` };
    }

    return { status: 'FAILED', message: `Aksi task tidak dikenali: ${action}` };

  } catch (error) {
    console.error('[TASKS] Error:', error.message);
    return { status: 'FAILED', message: `❌ Operasi task gagal: ${error.message}` };
  }
}

module.exports = { handleTaskIntent, pendingTaskCategories, executePendingTask, suggestList };
