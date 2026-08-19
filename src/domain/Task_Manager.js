const googleTasks = require('../infrastructure/Google_Tasks');
const googleWorkspace = require('../infrastructure/Google_Workspace');
const notionClient = require('../infrastructure/Notion_Client');

// Short-term working memory for rendered tasks (for ordinal references like "tandai yang pertama selesai", "hapus tugas kedua")
let _lastRenderedTasks = [];
let _lastActionTask = null;
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
 * Dynamic Tasklist Matcher
 * Matches task title against live Google Tasklists discovered from user's account.
 */
async function _matchBestTasklist(title = '', preferredListName = null) {
  if (preferredListName) {
    return { name: preferredListName, isExplicit: true };
  }

  const t = (title || '').toLowerCase();
  try {
    const liveLists = await googleTasks.getTaskLists();
    if (liveLists && liveLists.length > 0) {
      for (const list of liveLists) {
        if (!list.title || list.title === 'My Tasks' || list.title === 'Tugas Saya') continue;
        const listTokens = list.title.toLowerCase().split(/\s+/).filter(w => w.length >= 3);
        const hasOverlap = listTokens.some(token => t.includes(token));
        if (hasOverlap) {
          return { name: list.title, id: list.id, isExplicit: false };
        }
      }
    }
  } catch (_) {}

  // Semantic Category Heuristics
  if (/\b(kuliah|matkul|tugas\s*kuliah|essay|esai|makalah|laporan|presentasi|uas|uts|ujian|dosen|skripsi|kampus|sastra\s*arab)\b/i.test(t)) {
    return { name: 'Tugas Kuliah', isExplicit: false };
  }
  if (/\b(belanja|beli|toko|supermarket|minimarket|beras|minyak|sabun|sayur|buah|pesan)\b/i.test(t)) {
    return { name: 'Belanja', isExplicit: false };
  }
  if (/\b(kerja|meeting|rapat|proyek|klien|proposal|coding|deploy|bug|fitur)\b/i.test(t)) {
    return { name: 'Pekerjaan', isExplicit: false };
  }
  if (/\b(baca|buku|artikel|jurnal|riset|penelitian|paper)\b/i.test(t)) {
    return { name: 'Riset & Baca', isExplicit: false };
  }
  if (/\b(bayar|transfer|tagihan|cicilan|biaya|uang|listrik|wifi|pulsa)\b/i.test(t)) {
    return { name: 'Keuangan', isExplicit: false };
  }

  return { name: 'Tugas Saya', isExplicit: false };
}

/**
 * Resolve target task ID or title from working memory or ordinal references
 */
function _resolveTargetTask(searchKeyword = '') {
  const s = String(searchKeyword || '').toLowerCase().trim();

  // 1. Ordinal index resolution: "pertama" / "ke-1" / "INDEX_1"
  if (/^(index_1|pertama|ke-?1|nomor\s*1|no\s*1|paling\s*atas)$/i.test(s) && _lastRenderedTasks.length >= 1) {
    return _lastRenderedTasks[0];
  }
  // "kedua" / "ke-2" / "INDEX_2"
  if (/^(index_2|kedua|ke-?2|nomor\s*2|no\s*2)$/i.test(s) && _lastRenderedTasks.length >= 2) {
    return _lastRenderedTasks[1];
  }
  // "ketiga" / "ke-3" / "INDEX_3"
  if (/^(index_3|ketiga|ke-?3|nomor\s*3|no\s*3)$/i.test(s) && _lastRenderedTasks.length >= 3) {
    return _lastRenderedTasks[2];
  }
  // "terakhir" / "paling bawah"
  if (/^(index_last|terakhir|paling\s*bawah)$/i.test(s) && _lastRenderedTasks.length > 0) {
    return _lastRenderedTasks[_lastRenderedTasks.length - 1];
  }
  // "yang tadi" / "barusan" / "LATEST"
  if (/^(latest|yang\s*tadi|barusan|tadi)$/i.test(s) && _lastActionTask) {
    return _lastActionTask;
  }

  // Fallback: match by title substring in working memory
  if (s && _lastRenderedTasks.length > 0) {
    const match = _lastRenderedTasks.find(t => (t.title || '').toLowerCase().includes(s));
    if (match) return match;
  }

  return { id: null, title: searchKeyword };
}

/**
 * Format a task for Telegram display
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
      overdueTag = ` ⚠️ <b>(TERLAMBAT ${daysLate} HARI!)</b>`;
    } else if (dueStr === todayStr) {
      icon = '🟡';
      overdueTag = ' <b>(Hari ini!)</b>';
    }
  }

  let line = `${prefix}${icon} <b>${index + 1}. ${escapeHtml(task.title || '(Tanpa judul)')}</b>${overdueTag}`;
  if (task.due) {
    const due = new Date(task.due.split('T')[0] + 'T00:00:00+07:00');
    line += `\n${prefix}   📅 <i>Deadline: ${due.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Jakarta' })}</i>`;
  }
  if (task.notes) {
    const notesPreview = task.notes.split('\n')[0];
    line += `\n${prefix}   📝 ${escapeHtml(notesPreview)}`;
  }
  return line;
}

/**
 * Main handler for TASK intent from AI Router (Zero-Friction & Natural)
 */
async function handleTaskIntent(extractedData, chatId = null) {
  const { action, title, due_date, notes, search_keyword, list_name, parent_task_keyword, duration_minutes, sync_calendar, calendar_start_time, tasks } = extractedData;
  console.log(`[TASKS] Executing Task Intent: ${action} | title: "${title}"`);

  try {
    // ════════════════════════════════════════════════════════════════
    // 1. ACTION: CREATE (Instant & Zero Friction)
    // ════════════════════════════════════════════════════════════════
    if (action === 'CREATE') {
      if (!title) return { status: 'FAILED', message: '❌ Mohon sebutkan nama tugasnya, Tuan.' };

      const taskNotes = notes || '';
      const durationMins = (duration_minutes && duration_minutes > 0) ? duration_minutes : 60;

      // Dynamic Tasklist Discovery
      const matched = await _matchBestTasklist(title, list_name);
      let targetListId = '@default';
      if (matched.name && matched.name !== 'Tugas Saya' && matched.name !== 'My Tasks') {
        try {
          const listObj = await googleTasks.findOrCreateList(matched.name);
          targetListId = listObj.id;
        } catch (_) {}
      }

      // Create in Google Tasks with normalized Date-Only deadline
      const createdTask = await googleTasks.createTask({
        title,
        notes: taskNotes,
        dueDate: due_date || null,
        listId: targetListId
      });

      // Cache as last action
      _lastActionTask = { id: createdTask.id, title, listId: targetListId };

      // Optional Parallel Sync to Notion
      notionClient.createTask(title, taskNotes, due_date || null).catch(() => {});

      let msg = `✅ Tugas '<b>${escapeHtml(createdTask.title)}</b>' berhasil dicatat ke list <b>${escapeHtml(matched.name)}</b>.`;

      if (due_date) {
        const dObj = new Date(due_date.split('T')[0] + 'T00:00:00+07:00');
        msg += `\n📅 Deadline: <b>${dObj.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Jakarta' })}</b>`;
      }

      // ── Optional Smart Calendar Work Block ───────────────────────
      if (sync_calendar === true || calendar_start_time) {
        let calStart = calendar_start_time;
        if (calStart) {
          const isMidnight = calStart.includes('T00:00:00.000Z') || calStart.includes('T00:00:00Z') || calStart.includes('T17:00:00.000Z') || calStart.includes('T17:00:00Z');
          if (isMidnight) calStart = null;
        }

        if (calStart) {
          const calEnd = new Date(new Date(calStart).getTime() + durationMins * 60000).toISOString();
          try {
            await googleWorkspace.createCalendarEvent(
              `⏰ BLOK KERJA: ${title}`,
              calStart,
              calEnd,
              'Otomatis dijadwalkan oleh N.E.X.A untuk sesi pengerjaan tugas.'
            );
            const calTimeLabel = new Date(calStart).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta' });
            msg += `\n📅 Blok kerja dijadwalkan di Kalender: <b>${calTimeLabel} WIB</b> (durasi <b>${durationMins} menit</b>).`;
          } catch (_) {}
        }
      }

      return { status: 'SUCCESS', message: msg, taskId: createdTask.id };
    }

    // ════════════════════════════════════════════════════════════════
    // 2. ACTION: CREATE_SUBTASK
    // ════════════════════════════════════════════════════════════════
    if (action === 'CREATE_SUBTASK') {
      if (!title) return { status: 'FAILED', message: '❌ Sebutkan nama sub-tugasnya, Tuan.' };
      if (!parent_task_keyword) return { status: 'FAILED', message: '❌ Sebutkan nama tugas utama yang akan ditambahkan sub-tugas.' };

      const parents = await googleTasks.findTasksByKeyword(parent_task_keyword);
      if (parents.length === 0) return { status: 'FAILED', message: `❌ Tugas utama '<b>${escapeHtml(parent_task_keyword)}</b>' tidak ditemukan.` };
      const parent = parents[0];

      const sub = await googleTasks.createSubtask({ title, notes: notes || '', dueDate: due_date || null, parentId: parent.id, listId: parent.listId || '@default' });
      return { status: 'SUCCESS', message: `✅ Sub-tugas '<b>${escapeHtml(sub.title)}</b>' ditambahkan ke bawah tugas '<b>${escapeHtml(parent.title)}</b>'.` };
    }

    // ════════════════════════════════════════════════════════════════
    // 3. ACTION: CREATE_MULTIPLE
    // ════════════════════════════════════════════════════════════════
    if (action === 'CREATE_MULTIPLE') {
      const taskListToCreate = tasks || [];
      if (taskListToCreate.length === 0) return { status: 'FAILED', message: '❌ Tidak ada tugas yang disebutkan untuk dibuat.' };

      const results = [];
      for (const t of taskListToCreate) {
        try {
          const taskTitle = t.title || t;
          if (!taskTitle) continue;
          const taskNotes = t.notes || '';
          const taskDue = t.due_date || null;
          const matched = await _matchBestTasklist(taskTitle, t.list_name);

          let listId = '@default';
          if (matched.name && matched.name !== 'Tugas Saya') {
            try {
              const listObj = await googleTasks.findOrCreateList(matched.name);
              listId = listObj.id;
            } catch (_) {}
          }
          const created = await googleTasks.createTask({ title: taskTitle, notes: taskNotes, dueDate: taskDue, listId });
          results.push(`✅ <b>${escapeHtml(created.title)}</b> → <i>${escapeHtml(matched.name)}</i>`);
        } catch (e) {
          results.push(`❌ Gagal: ${e.message}`);
        }
      }
      return { status: 'SUCCESS', message: `📋 <b>${results.length} tugas berhasil dibuat:</b>\n${results.join('\n')}` };
    }

    // ════════════════════════════════════════════════════════════════
    // 4. ACTION: COMPLETE (With Ordinal & Relative Support)
    // ════════════════════════════════════════════════════════════════
    if (action === 'COMPLETE') {
      const keyword = search_keyword || title;
      if (!keyword) return { status: 'FAILED', message: '❌ Sebutkan nama atau nomor tugas yang ingin ditandai selesai.' };

      const resolved = _resolveTargetTask(keyword);
      let matches = [];

      if (resolved.id) {
        matches = [{ id: resolved.id, title: resolved.title, listId: resolved.listId || '@default' }];
      } else {
        matches = await googleTasks.findTasksByKeyword(resolved.title || keyword);
      }

      if (matches.length === 0) {
        return { status: 'FAILED', message: `❌ Tidak ditemukan tugas yang cocok dengan "<b>${escapeHtml(keyword)}</b>".` };
      }

      for (const t of matches) {
        await googleTasks.completeTask(t.id, t.listId || '@default');
        notionClient.completeTask(t.title).catch(() => {});

        // Gray out calendar work block if present
        try {
          const wbEvents = await googleWorkspace.findEventByTitle(`⏰ BLOK KERJA: ${t.title}`);
          for (const ev of (wbEvents || [])) {
            await googleWorkspace.updateCalendarEventColor(ev.id, '8'); // 8 = Graphite
          }
        } catch (_) {}
      }

      // Remove from working memory
      _lastRenderedTasks = _lastRenderedTasks.filter(t => !matches.some(m => m.id === t.id));

      const names = matches.map(t => `'<b>${escapeHtml(t.title)}</b>'`).join(', ');
      return { status: 'SUCCESS', message: `✅ Tugas ${names} berhasil ditandai <b>Selesai</b>! 🎉` };
    }

    // ════════════════════════════════════════════════════════════════
    // 5. ACTION: DELETE (With Ordinal & Relative Support)
    // ════════════════════════════════════════════════════════════════
    if (action === 'DELETE') {
      const keyword = search_keyword || title;
      if (!keyword) return { status: 'FAILED', message: '❌ Sebutkan nama atau nomor tugas yang ingin dihapus.' };

      const resolved = _resolveTargetTask(keyword);
      let matches = [];

      if (resolved.id) {
        matches = [{ id: resolved.id, title: resolved.title, listId: resolved.listId || '@default' }];
      } else {
        matches = await googleTasks.findTasksByKeyword(resolved.title || keyword);
      }

      if (matches.length === 0) {
        return { status: 'FAILED', message: `❌ Tidak ditemukan tugas yang cocok dengan "<b>${escapeHtml(keyword)}</b>".` };
      }

      for (const t of matches) {
        await googleTasks.deleteTask(t.id, t.listId || '@default');
        notionClient.deleteTask(t.title).catch(() => {});

        try {
          const wbEvents = await googleWorkspace.findEventByTitle(`⏰ BLOK KERJA: ${t.title}`);
          for (const ev of (wbEvents || [])) {
            await googleWorkspace.deleteCalendarEvent(ev.id);
          }
        } catch (_) {}
      }

      _lastRenderedTasks = _lastRenderedTasks.filter(t => !matches.some(m => m.id === t.id));

      const names = matches.map(t => `'<b>${escapeHtml(t.title)}</b>'`).join(', ');
      return { status: 'SUCCESS', message: `🗑️ Tugas ${names} berhasil dihapus dari Google Tasks.` };
    }

    // ════════════════════════════════════════════════════════════════
    // 6. ACTION: READ / READ_TODAY / READ_OVERDUE / READ_UPCOMING
    // ════════════════════════════════════════════════════════════════
    if (action === 'READ' || action === 'READ_TODAY' || action === 'READ_TOMORROW' || action === 'READ_UPCOMING' || action === 'READ_OVERDUE') {
      let taskList = [];
      let headerTitle = 'DAFTAR TUGAS AKTIF';

      if (action === 'READ_TODAY') {
        taskList = await googleTasks.getTasksDueToday();
        headerTitle = 'TUGAS JATUH TEMPO HARI INI';
      } else if (action === 'READ_TOMORROW') {
        taskList = await googleTasks.getTasksDueTomorrow();
        headerTitle = 'TUGAS JATUH TEMPO BESOK';
      } else if (action === 'READ_OVERDUE') {
        taskList = await googleTasks.getOverdueTasks();
        headerTitle = 'TUGAS TERLAMBAT (OVERDUE)';
      } else if (action === 'READ_UPCOMING') {
        taskList = await googleTasks.getUpcomingTasks(7);
        headerTitle = 'TUGAS 7 HARI KE DEPAN';
      } else {
        taskList = await googleTasks.getActiveTasks();
        headerTitle = 'SEMUA TUGAS AKTIF';
      }

      if (!taskList || taskList.length === 0) {
        return { status: 'SUCCESS', message: `✅ Tidak ada tugas yang tertunda untuk kategori ini, Tuan. Semuanya bersih! 🎉` };
      }

      // Update Working Memory Cache
      _lastRenderedTasks = taskList.map((t, idx) => ({
        index: idx + 1,
        id: t.id,
        title: t.title || '(Tanpa Judul)',
        listId: t.listId || '@default',
        due: t.due
      }));

      let msg = `📋 <b>${headerTitle} (${taskList.length}):</b>\n\n`;
      msg += taskList.map((t, idx) => formatTask(t, idx)).join('\n\n');

      return { status: 'SUCCESS', message: msg, tasksCount: taskList.length };
    }

    // ── READ_LIST ────────────────────────────────────────────
    if (action === 'READ_LIST') {
      const targetList = (list_name || search_keyword || '').trim();
      const isGeneric = !targetList || /^(aktif|semua|daftar|tugas|list|undefined)$/i.test(targetList);

      if (isGeneric) {
        const taskList = await googleTasks.getActiveTasks();
        if (!taskList || taskList.length === 0) {
          return { status: 'SUCCESS', message: `✅ Tidak ada tugas yang tertunda, Tuan. Semuanya bersih! 🎉` };
        }
        _lastRenderedTasks = taskList.map((t, idx) => ({
          index: idx + 1,
          id: t.id,
          title: t.title || '(Tanpa Judul)',
          listId: t.listId || '@default',
          due: t.due
        }));
        let msg = `📋 <b>DAFTAR TUGAS AKTIF (${taskList.length}):</b>\n\n`;
        msg += taskList.map((t, idx) => formatTask(t, idx)).join('\n\n');
        return { status: 'SUCCESS', message: msg, tasksCount: taskList.length };
      }

      const taskList = await googleTasks.getTasksFromList(targetList);
      if (taskList.length === 0) return { status: 'SUCCESS', message: `📋 List '<b>${escapeHtml(targetList)}</b>' kosong atau tidak ditemukan.` };
      
      _lastRenderedTasks = taskList.map((t, idx) => ({
        index: idx + 1,
        id: t.id,
        title: t.title || '(Tanpa Judul)',
        listId: t.listId || '@default',
        due: t.due
      }));

      const listOutput = taskList.map((t, i) => formatTask(t, i)).join('\n\n');
      return { status: 'SUCCESS', message: `📋 <b>List "${escapeHtml(targetList)}" (${taskList.length}):</b>\n\n${listOutput}` };
    }

    // ── READ_LISTS ───────────────────────────────────────────
    if (action === 'READ_LISTS') {
      const lists = await googleTasks.getTaskLists();
      if (!lists || lists.length === 0) return { status: 'SUCCESS', message: '📋 Belum ada daftar tasklist di Google Tasks.' };
      const lines = lists.map((l, i) => `   <b>${i + 1}.</b> 📁 <b>${escapeHtml(l.title)}</b>`).join('\n');
      return { status: 'SUCCESS', message: `📁 <b>Daftar Tasklist (${lists.length}):</b>\n\n${lines}` };
    }

    // ── READ_DONE ───────────────────────────────────────────
    if (action === 'READ_DONE') {
      const taskList = await googleTasks.getCompletedTasks();
      if (taskList.length === 0) return { status: 'SUCCESS', message: '📭 Belum ada tugas yang diselesaikan.' };
      const listOutput = taskList.map((t, i) => formatTask(t, i)).join('\n\n');
      return { status: 'SUCCESS', message: `✅ <b>Tugas Selesai (${taskList.length}):</b>\n\n${listOutput}` };
    }

    // ── CLEAR_DONE ──────────────────────────────────────────
    if (action === 'CLEAR_DONE') {
      await googleTasks.clearCompletedTasks();
      return { status: 'SUCCESS', message: '🧹 Semua tugas yang sudah selesai telah dibersihkan dari Google Tasks.' };
    }

    // ── MOVE ────────────────────────────────────────────────
    if (action === 'MOVE') {
      const keyword = search_keyword || title;
      if (!keyword) return { status: 'FAILED', message: '❌ Sebutkan nama tugas yang ingin dipindahkan.' };
      if (!list_name) return { status: 'FAILED', message: '❌ Sebutkan nama list tujuan.' };

      const resolved = _resolveTargetTask(keyword);
      let matches = [];
      if (resolved.id) {
        matches = [{ id: resolved.id, title: resolved.title, listId: resolved.listId || '@default' }];
      } else {
        matches = await googleTasks.findTasksByKeyword(resolved.title || keyword);
      }
      if (matches.length === 0) return { status: 'FAILED', message: `❌ Tidak ditemukan tugas cocok dengan "<b>${escapeHtml(keyword)}</b>".` };

      const task = matches[0];
      await googleTasks.moveTaskToList(task.id, list_name, task.listId);
      return { status: 'SUCCESS', message: `✅ Tugas '<b>${escapeHtml(task.title)}</b>' berhasil dipindahkan ke list <b>${escapeHtml(list_name)}</b>.` };
    }

    // ── EDIT ────────────────────────────────────────────────
    if (action === 'EDIT') {
      const keyword = search_keyword || title;
      if (!keyword) return { status: 'FAILED', message: '❌ Sebutkan nama atau nomor tugas yang ingin diubah.' };

      const resolved = _resolveTargetTask(keyword);
      let matches = [];

      if (resolved.id) {
        matches = [{ id: resolved.id, title: resolved.title, listId: resolved.listId || '@default' }];
      } else {
        matches = await googleTasks.findTasksByKeyword(resolved.title || keyword);
      }

      if (matches.length === 0) {
        return { status: 'FAILED', message: `❌ Tidak ditemukan tugas cocok dengan "<b>${escapeHtml(keyword)}</b>".` };
      }

      for (const t of matches) {
        await googleTasks.editTask({
          taskId: t.id,
          newTitle: title || t.title,
          newNotes: notes,
          newDueDate: due_date,
          listId: t.listId || '@default'
        });
      }
      return { status: 'SUCCESS', message: `✏️ Tugas '<b>${escapeHtml(matches[0].title)}</b>' berhasil diperbarui.` };
    }

    // ── SET_PRIORITY ─────────────────────────────────────────
    if (action === 'SET_PRIORITY') {
      const keyword = search_keyword || title;
      if (!keyword) return { status: 'FAILED', message: '❌ Sebutkan nama tugas yang ingin diprioritaskan, Tuan.' };
      const resolved = _resolveTargetTask(keyword);
      let matches = [];
      if (resolved.id) {
        matches = [{ id: resolved.id, title: resolved.title, listId: resolved.listId || '@default' }];
      } else {
        matches = await googleTasks.findTasksByKeyword(resolved.title || keyword);
      }
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

    return { status: 'FAILED', message: `Aksi task '${action}' tidak dikenali.` };

  } catch (error) {
    console.error('[TASKS] Error:', error);
    return { status: 'FAILED', message: `❌ Operasi task gagal: ${error.message}` };
  }
}

function cancelPendingTask(chatId) {
  const pending = pendingTaskCategories.get(chatId);
  if (!pending) return false;
  if (pending.timerId) clearTimeout(pending.timerId);
  pendingTaskCategories.delete(chatId);
  return true;
}

async function executePendingTask(chatId, overrideListName = null) {
  const pending = pendingTaskCategories.get(chatId);
  if (!pending) return null;
  if (pending.timerId) clearTimeout(pending.timerId);
  pendingTaskCategories.delete(chatId);

  return handleTaskIntent({
    action: 'CREATE',
    title: pending.title,
    notes: pending.notes,
    due_date: pending.dueDate,
    list_name: overrideListName || pending.listName,
    sync_calendar: pending.syncCalendar,
    calendar_start_time: pending.calendarStartTime,
    duration_minutes: pending.durationMins
  }, null);
}

function suggestList(title = '') {
  const t = title.toLowerCase();
  if (/\b(kuliah|matkul|tugas|essay|makalah|uas|uts|ujian)\b/i.test(t)) return 'Tugas Kuliah';
  if (/\b(belanja|beli|toko|beras|minyak|sabun)\b/i.test(t)) return 'Belanja';
  if (/\b(kerja|meeting|rapat|proyek)\b/i.test(t)) return 'Pekerjaan';
  if (/\b(baca|buku|artikel|jurnal|riset)\b/i.test(t)) return 'Riset & Baca';
  if (/\b(bayar|transfer|tagihan|cicilan)\b/i.test(t)) return 'Keuangan';
  return null;
}

module.exports = {
  handleTaskIntent,
  getLastRenderedTasks: () => _lastRenderedTasks,
  pendingTaskCategories,
  cancelPendingTask,
  executePendingTask,
  suggestList
};
