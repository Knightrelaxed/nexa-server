const googleTasks = require('../infrastructure/Google_Tasks');

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Format a task for display in Telegram (HTML)
 */
function formatTask(task, index) {
  const isDone = task.status === 'completed';
  const icon = isDone ? '✅' : '🔲';
  let line = `${icon} <b>${index + 1}. ${escapeHtml(task.title || '(Tanpa judul)')}</b>`;
  if (task.due) {
    const due = new Date(task.due);
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
      let msg = `✅ Tugas '<b>${task.title}</b>' berhasil ditambahkan ke Google Tasks.`;
      if (due_date) {
        const dueDate = new Date(due_date.split('T')[0] + 'T00:00:00+07:00');
        msg += `\n📅 Deadline: ${dueDate.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Jakarta' })}`;
        if (timeLabel) msg += ` jam ${timeLabel}`;
      }
      return { status: 'SUCCESS', message: msg };
    }

    // ── READ (active tasks) ─────────────────────────────────
    if (action === 'READ') {
      const tasks = await googleTasks.getActiveTasks();
      if (tasks.length === 0) return { status: 'SUCCESS', message: '✅ Tidak ada tugas yang tertunda, Tuan. Kalender bersih!' };
      const list = tasks.map((t, i) => formatTask(t, i)).join('\n\n');
      return { status: 'SUCCESS', message: `📋 <b>Tugas Aktif (${tasks.length}):</b>\n\n${list}` };
    }

    // ── READ_DONE (completed tasks) ─────────────────────────
    if (action === 'READ_DONE') {
      const tasks = await googleTasks.getCompletedTasks();
      if (tasks.length === 0) return { status: 'SUCCESS', message: '📭 Belum ada tugas yang diselesaikan.' };
      const list = tasks.map((t, i) => formatTask(t, i)).join('\n\n');
      return { status: 'SUCCESS', message: `✅ <b>Tugas Selesai (${tasks.length}):</b>\n\n${list}` };
    }

    // ── COMPLETE ────────────────────────────────────────────
    if (action === 'COMPLETE') {
      if (!search_keyword) return { status: 'FAILED', message: '❌ Sebutkan nama tugas yang ingin ditandai selesai.' };
      const matches = await googleTasks.findTasksByKeyword(search_keyword);
      if (matches.length === 0) return { status: 'FAILED', message: `❌ Tidak ditemukan tugas yang cocok dengan "<b>${escapeHtml(search_keyword)}</b>".` };

      for (const t of matches) await googleTasks.completeTask(t.id);
      const names = matches.map(t => `'<b>${escapeHtml(t.title)}</b>'`).join(', ');
      return { status: 'SUCCESS', message: `✅ Tugas ${names} berhasil ditandai sebagai <b>Selesai</b>!` };
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

module.exports = { handleTaskIntent };
