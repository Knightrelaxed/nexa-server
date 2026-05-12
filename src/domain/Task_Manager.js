const googleTasks = require('../infrastructure/Google_Tasks');

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ── PENDING TASK CATEGORY CONFIRMATIONS ─────────────────────────────────────
// When N.E.X.A suggests a category auto-classification, it goes here.
// Auto-confirmed after 5 minutes if no response from Tuan.
const pendingTaskCategories = new Map();

/**
 * Format a task for Telegram display, with overdue highlighting.
 */
function formatTask(task, index) {
  const now = new Date();
  const todayStr = now.toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' });

  let icon = '🔲';
  let overdueTag = '';

  if (task.due) {
    const dueStr = task.due.split('T')[0];
    if (dueStr < todayStr) {
      // Overdue
      const daysLate = Math.floor((now - new Date(dueStr + 'T00:00:00+07:00')) / (1000 * 60 * 60 * 24));
      icon = '🔴';
      overdueTag = ` ⚠️ <b>TERLAMBAT ${daysLate} HARI!</b>`;
    } else if (dueStr === todayStr) {
      icon = '🟡';
      overdueTag = ' (Hari ini!)';
    }
  }

  let line = `${icon} <b>${index + 1}. ${escapeHtml(task.title || '(Tanpa judul)')}</b>${overdueTag}`;
  if (task.due) {
    const due = new Date(task.due.split('T')[0] + 'T00:00:00+07:00');
    line += `\n   📅 Deadline: ${due.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Jakarta' })}`;
  }
  if (task.notes) line += `\n   📝 ${escapeHtml(task.notes)}`;
  return line;
}

/**
 * Main handler for TASK intent from AI Router
 */
async function handleTaskIntent(extractedData) {
  const { action, title, due_date, notes, search_keyword } = extractedData;
  console.log(`[TASKS] Executing Task Intent: ${action}`);

  try {
    // ── CREATE ──────────────────────────────────────────────
    if (action === 'CREATE') {
      if (!title) return { status: 'FAILED', message: '❌ Mohon sebutkan nama tugasnya, Tuan.' };

      // Extract time portion from due_date if provided (Google Tasks only stores date, not time)
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

      const task = await googleTasks.createTask({ title, notes: taskNotes, dueDate: due_date || null });
      let msg = `✅ Tugas '<b>${escapeHtml(task.title)}</b>' berhasil ditambahkan ke Google Tasks.`;
      if (due_date) {
        const dueDate = new Date(due_date.split('T')[0] + 'T00:00:00+07:00');
        msg += `\n📅 Deadline: ${dueDate.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Jakarta' })}`;
        if (timeLabel) msg += ` jam ${timeLabel}`;
      }
      return { status: 'SUCCESS', message: msg };
    }

    // ── READ (active tasks + overdue detection) ────────────
    if (action === 'READ') {
      const tasks = await googleTasks.getActiveTasks();
      if (tasks.length === 0) return { status: 'SUCCESS', message: '✅ Tidak ada tugas yang tertunda, Tuan. Kalender bersih!' };

      const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' });

      // Split into groups for cleaner display
      const overdue = tasks.filter(t => t.due && t.due.split('T')[0] < todayStr);
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

      if (overdue.length > 0) {
        msg += `\n\n⚠️ <i>Tuan memiliki ${overdue.length} tugas yang melewati deadline!</i>`;
      }

      return { status: 'SUCCESS', message: msg };
    }

    // ── READ_DONE (completed tasks) ─────────────────────────
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

    // ── READ_TODAY (tasks due today only) ───────────────────
    if (action === 'READ_TODAY') {
      const tasks = await googleTasks.getTasksDueToday();
      if (tasks.length === 0) return { status: 'SUCCESS', message: '✅ Tidak ada tugas yang jatuh tempo hari ini, Tuan.' };
      const list = tasks.map((t, i) => formatTask(t, i)).join('\n\n');
      return { status: 'SUCCESS', message: `🟡 <b>Tugas Hari Ini (${tasks.length}):</b>\n\n${list}` };
    }

    // ── READ_UPCOMING (tasks in next 7 days) ────────────────
    if (action === 'READ_UPCOMING') {
      const tasks = await googleTasks.getUpcomingTasks(7);
      if (tasks.length === 0) return { status: 'SUCCESS', message: '✅ Tidak ada tugas dalam 7 hari ke depan.' };

      // Group by date
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
      if (matches.length === 0) return { status: 'FAILED', message: `❌ Tidak ditemukan tugas yang cocok dengan "<b>${escapeHtml(search_keyword)}</b>".` };

      for (const t of matches) await googleTasks.completeTask(t.id);
      const names = matches.map(t => `'<b>${escapeHtml(t.title)}</b>'`).join(', ');
      return { status: 'SUCCESS', message: `✅ Tugas ${names} berhasil ditandai sebagai <b>Selesai</b>! 🎉` };
    }

    // ── DELETE ──────────────────────────────────────────────
    if (action === 'DELETE') {
      if (!search_keyword) return { status: 'FAILED', message: '❌ Sebutkan nama tugas yang ingin dihapus.' };
      const matches = await googleTasks.findTasksByKeyword(search_keyword);
      if (matches.length === 0) return { status: 'FAILED', message: `❌ Tidak ditemukan tugas yang cocok dengan "<b>${escapeHtml(search_keyword)}</b>".` };

      for (const t of matches) await googleTasks.deleteTask(t.id);
      const names = matches.map(t => `'<b>${escapeHtml(t.title)}</b>'`).join(', ');
      return { status: 'SUCCESS', message: `🗑️ Tugas ${names} berhasil dihapus.` };
    }

    // ── CLEAR_DONE ──────────────────────────────────────────
    if (action === 'CLEAR_DONE') {
      await googleTasks.clearCompletedTasks();
      return { status: 'SUCCESS', message: '🧹 Semua tugas yang sudah selesai telah dibersihkan.' };
    }

    // ── EDIT ────────────────────────────────────────────────
    if (action === 'EDIT') {
      if (!search_keyword) return { status: 'FAILED', message: '❌ Sebutkan nama tugas yang ingin diubah.' };
      const matches = await googleTasks.findTasksByKeyword(search_keyword);
      if (matches.length === 0) return { status: 'FAILED', message: `❌ Tidak ditemukan tugas yang cocok dengan "<b>${escapeHtml(search_keyword)}</b>".` };

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

module.exports = { handleTaskIntent, pendingTaskCategories };
