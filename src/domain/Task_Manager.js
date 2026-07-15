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

  // Destructure semua field termasuk konteks sinkronisasi kalender (BUG #1 FIX)
  const { title, notes, dueDate, durationMins, syncCalendar, calendarStartTime } = pending;
  const listName = overrideListName || pending.listName;
  const effDuration = durationMins || 60;

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
    msg += `\n📅 Deadline: <b>${d.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Jakarta' })}</b>`;
  }

  // ── Sinkronisasi Kalender (jika syncCalendar === true dari CONFIRM_LIST flow) ──
  if (syncCalendar === true) {
    let calStart = calendarStartTime || null;
    // Validasi: tolak waktu midnight
    if (calStart) {
      const isMidnight = calStart.includes('T00:00:00.000Z') || calStart.includes('T00:00:00Z') ||
        calStart.includes('T17:00:00.000Z') || calStart.includes('T17:00:00Z') || calStart.includes('T00:00:00+');
      if (isMidnight) calStart = null;
    }

    if (calStart) {
      // Buat blok kerja di waktu yang ditentukan user, format +07:00
      const calEndMs = new Date(calStart).getTime() + effDuration * 60000;
      const calEnd = new Date(calEndMs).toLocaleString('sv-SE', { timeZone: 'Asia/Jakarta' }).replace(' ', 'T') + '+07:00';
      try {
        await googleWorkspace.createCalendarEvent(
          `⏰ BLOK KERJA: ${title}`,
          calStart,
          calEnd,
          'Otomatis dijadwalkan oleh N.E.X.A untuk sesi pengerjaan tugas.'
        );
        const calTimeLabel = new Date(calStart).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta' });
        msg += `\n📅 Sesi kerja dijadwalkan di Kalender: <b>${calTimeLabel} WIB</b> selama <b>${effDuration} menit</b>.`;
      } catch (e) {
        console.warn('[TASKS] Failed to create calendar work block:', e.message);
      }
    } else {
      // Tidak ada calendar_start_time → Autonomous Time-Blocking
      const nowMs = Date.now();
      const timeMinIso = new Date(nowMs).toISOString();
      let timeMaxIso;
      if (dueDate) {
        const targetDateMs = new Date(dueDate.split('T')[0] + 'T00:00:00+07:00').getTime();
        timeMaxIso = new Date(Math.max(nowMs + 24 * 3600000, targetDateMs + 24 * 3600000 - 1)).toISOString();
      } else {
        timeMaxIso = new Date(nowMs + 7 * 24 * 3600000).toISOString();
      }
      try {
        const { findEmptySlot } = require('../infrastructure/Google_Workspace');
        const slot = await findEmptySlot(effDuration, timeMinIso, timeMaxIso);
        if (slot) {
          const calEndMs = new Date(slot.start).getTime() + effDuration * 60000;
          const calEnd = new Date(calEndMs).toLocaleString('sv-SE', { timeZone: 'Asia/Jakarta' }).replace(' ', 'T') + '+07:00';
          await googleWorkspace.createCalendarEvent(
            `⏰ BLOK KERJA: ${title}`,
            slot.start,
            calEnd,
            'Otomatis dijadwalkan oleh N.E.X.A Autonomous Time-Blocking.'
          );
          const slotLabel = new Date(slot.start).toLocaleString('id-ID', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta' });
          msg += `\n🤖 <b>Autonomous Time-Blocking:</b> Slot kosong ditemukan — blok kerja <b>${effDuration} menit</b> ditambahkan pada <b>${slotLabel}</b>!`;
        } else {
          msg += `\n⚠️ Tidak ditemukan slot kosong untuk sesi kerja. Silakan atur secara manual di Kalender.`;
        }
      } catch (e) {
        console.error('[AUTONOMOUS BLOCKING] Failed to find slot:', e.message);
      }
    }

    // Event DEADLINE merah jika ada due_date
    if (dueDate) {
      try {
        const deadlineDateStr = dueDate.split('T')[0];
        const deadlineStart = `${deadlineDateStr}T00:00:00+07:00`;
        const deadlineEnd = `${deadlineDateStr}T23:59:00+07:00`;
        await googleWorkspace.createCalendarEvent(
          `🔴 DEADLINE: ${title}`,
          deadlineStart,
          deadlineEnd,
          `Deadline untuk tugas: ${title}`,
          '', [], '', '11'
        );
        const deadlineDateObj = new Date(deadlineDateStr + 'T00:00:00+07:00');
        msg += `\n🔴 Event deadline <b>merah</b> ditambahkan di Kalender: <b>${deadlineDateObj.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Asia/Jakarta' })}</b>.`;
      } catch (e) {
        console.warn('[TASKS] Failed to create deadline calendar event:', e.message);
      }
    }
  }

  return { status: 'SUCCESS', message: msg };
}

/**
 * Main handler for TASK intent from AI Router
 */
async function handleTaskIntent(extractedData, chatId = null) {
  const { action, title, due_date, notes, search_keyword, list_name, parent_task_keyword, duration_minutes, sync_calendar, calendar_start_time } = extractedData;
  console.log(`[TASKS] Executing Task Intent: ${action}`);

  try {
    // ── CREATE ──────────────────────────────────────────────
    if (action === 'CREATE') {
      if (!title) return { status: 'FAILED', message: '❌ Mohon sebutkan nama tugasnya, Tuan.' };

      let taskNotes = notes || '';
      // Duration for the calendar WORK BLOCK (default 60 menit jika tidak disebutkan)
      const durationMins = (duration_minutes && duration_minutes > 0) ? duration_minutes : 60;

      // ── STEP 1: Tentukan apakah perlu sinkronisasi kalender ──
      // sync_calendar = true  → user sudah minta sinkronisasi (mungkin beserta calendar_start_time)
      // sync_calendar = false → user tidak mau disinkron, jadikan floating task
      // sync_calendar = null  → user belum menyebutkan, TANYA dulu
      if (sync_calendar === null || sync_calendar === undefined) {
        // User belum menyebutkan preferensi sinkronisasi → tanya dulu
        if (chatId) {
          return {
            status: 'PENDING_SYNC_CONFIRM',
            title,
            notes: taskNotes,
            due_date: due_date || null,
            list_name,
            duration_minutes: durationMins,
            chatId,
            message: `📋 Tugas '<b>${escapeHtml(title)}</b>' siap dicatat!${due_date ? `\n📅 Deadline: <b>${new Date(due_date.split('T')[0] + 'T00:00:00+07:00').toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Jakarta' })}</b>` : ''}\n\n🗓️ Apakah Tuan ingin menjadwalkan <b>waktu pengerjaannya</b> di Kalender juga?\n\n• Balas <b>"Ya, [waktu]"</b> — contoh: <i>"Ya, besok jam 8 malam"</i>\n• Balas <b>"Tidak"</b> — tugas bebas dikerjakan kapan saja\n\n<i>⏳ Jika tidak ada respons dalam 5 menit, tugas akan disimpan tanpa blok kalender.</i>`
          };
        }
        // Jika tidak ada chatId (cron/webhook lain), buat saja langsung sebagai floating task
      }

      // ── STEP 2: Eksekusi pembuatan tugas ──
      // Resolve list target
      let resolvedList = list_name || null;
      let isSuggested = false;
      if (!resolvedList) {
        resolvedList = suggestList(title);
        isSuggested = !!resolvedList;
      }

      // Jika list disarankan otomatis (bukan dari user), minta konfirmasi list (existing flow)
      if (chatId && resolvedList && resolvedList !== 'Tugas Saya' && isSuggested) {
        return { status: 'PENDING_CONFIRM', pendingListName: resolvedList, title, notes: taskNotes, due_date: due_date || null, sync_calendar: sync_calendar || false, calendar_start_time: calendar_start_time || null, durationMins, hasAutonomousBlock: false, chatId };
      }

      // Dapatkan listId
      let listId = '@default';
      if (resolvedList && resolvedList !== 'Tugas Saya') {
        try {
          const list = await googleTasks.findOrCreateList(resolvedList);
          listId = list.id;
        } catch (e) {
          console.warn('[TASKS] List lookup failed, using default:', e.message);
        }
      }

      // Buat tugas di Google Tasks — due_date MURNI sebagai deadline
      // Google Tasks hanya menerima format tanggal (bukan waktu), jadi kita kirim hanya tanggal
      const taskDueDate = due_date ? due_date : null;
      const task = await googleTasks.createTask({ title, notes: taskNotes, dueDate: taskDueDate, listId });

      // [PHASE: Parallel Sync to Notion] - Fire and forget
      notionClient.createTask(title, taskNotes, taskDueDate).catch(e => console.error('[NOTION SYNC] Failed:', e.message));

      let msg = `✅ Tugas '<b>${escapeHtml(task.title)}</b>' ditambahkan ke <b>${escapeHtml(resolvedList || 'Tugas Saya')}</b>.`;

      // Tampilkan info deadline jika ada
      if (due_date) {
        const dueDateObj = new Date(due_date.split('T')[0] + 'T00:00:00+07:00');
        msg += `\n📅 Deadline: <b>${dueDateObj.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Jakarta' })}</b>`;
      }

      // ── STEP 3: Sinkronisasi Kalender ──
      if (sync_calendar === true) {
        let calStartTime = calendar_start_time || null;
        let hasAutonomousBlock = false;

        if (calStartTime) {
          // Validasi: jangan pakai waktu midnight UTC
          const isMidnight = calStartTime.includes('T00:00:00.000Z') || calStartTime.includes('T00:00:00Z') || calStartTime.includes('T17:00:00.000Z') || calStartTime.includes('T17:00:00Z') || calStartTime.includes('T00:00:00+');
          if (isMidnight) calStartTime = null;
        }

        if (calStartTime) {
          // Gunakan calendar_start_time yang diberikan user sebagai waktu blok kerja
          // BUG #2 FIX: format +07:00 agar konsisten, hindari campuran UTC(Z) dan offset
          const calEndMs = new Date(calStartTime).getTime() + durationMins * 60000;
          const calEnd = new Date(calEndMs).toLocaleString('sv-SE', { timeZone: 'Asia/Jakarta' }).replace(' ', 'T') + '+07:00';
          try {
            await googleWorkspace.createCalendarEvent(
              `⏰ BLOK KERJA: ${title}`,
              calStartTime,
              calEnd,
              'Otomatis dijadwalkan oleh N.E.X.A untuk sesi pengerjaan tugas.'
            );
            const calStartMs = new Date(calStartTime);
            const calTimeLabel = calStartMs.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta' });
            msg += `\n📅 Sesi kerja dijadwalkan di Kalender: <b>${calTimeLabel} WIB</b> selama <b>${durationMins} menit</b>.`;
          } catch (e) {
            console.warn('[TASKS] Failed to create calendar work block:', e.message);
          }
        } else {
          // Tidak ada calendar_start_time → cari slot kosong (Autonomous Time-Blocking)
          const refDate = due_date ? due_date : null;
          const nowMs = Date.now();
          const timeMinIso = new Date(nowMs).toISOString();
          let timeMaxIso;
          if (refDate) {
            const targetDateMs = new Date(refDate.split('T')[0] + 'T00:00:00+07:00').getTime();
            timeMaxIso = new Date(Math.max(nowMs + 24 * 3600000, targetDateMs + 24 * 3600000 - 1)).toISOString();
          } else {
            timeMaxIso = new Date(nowMs + 7 * 24 * 3600000).toISOString();
          }

          try {
            const { findEmptySlot } = require('../infrastructure/Google_Workspace');
            const slot = await findEmptySlot(durationMins, timeMinIso, timeMaxIso);
            if (slot) {
              // BUG #2 FIX: format +07:00 agar konsisten
              const calEndMs = new Date(slot.start).getTime() + durationMins * 60000;
              const calEnd = new Date(calEndMs).toLocaleString('sv-SE', { timeZone: 'Asia/Jakarta' }).replace(' ', 'T') + '+07:00';
              await googleWorkspace.createCalendarEvent(
                `⏰ BLOK KERJA: ${title}`,
                slot.start,
                calEnd,
                'Otomatis dijadwalkan oleh N.E.X.A Autonomous Time-Blocking.'
              );
              hasAutonomousBlock = true;
              const slotMs = new Date(slot.start);
              const slotLabel = slotMs.toLocaleString('id-ID', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta' });
              msg += `\n🤖 <b>Autonomous Time-Blocking:</b> Slot kosong ditemukan — blok kerja <b>${durationMins} menit</b> ditambahkan pada <b>${slotLabel}</b>!`;
            } else {
              msg += `\n⚠️ Tidak ditemukan slot kosong untuk sesi kerja. Silakan atur secara manual di Kalender.`;
            }
          } catch (e) {
            console.error('[AUTONOMOUS BLOCKING] Failed to find slot:', e.message);
          }
        }

        // Tambahkan event DEADLINE di Kalender dengan warna merah (Tomato = color_id 11)
        // hanya jika due_date ada
        if (due_date) {
          try {
            const deadlineDateStr = due_date.split('T')[0];
            // Buat event seharian (all-day) sebagai penanda deadline
            const deadlineStart = `${deadlineDateStr}T00:00:00+07:00`;
            const deadlineEnd = `${deadlineDateStr}T23:59:00+07:00`;
            await googleWorkspace.createCalendarEvent(
              `🔴 DEADLINE: ${title}`,
              deadlineStart,
              deadlineEnd,
              `Deadline untuk tugas: ${title}`,
              '', // location
              [], // reminders
              '', // recurrence
              '11' // color_id 11 = Tomato (merah)
            );
            const deadlineDateObj = new Date(deadlineDateStr + 'T00:00:00+07:00');
            msg += `\n🔴 Event deadline <b>merah</b> ditambahkan di Kalender: <b>${deadlineDateObj.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Asia/Jakarta' })}</b>.`;
          } catch (e) {
            console.warn('[TASKS] Failed to create deadline calendar event:', e.message);
          }
        }
      } else {
        // sync_calendar === false: tidak ada sinkronisasi kalender
        if (due_date) {
          msg += `\n✔️ Tugas ini bersifat <i>floating</i> — bebas dikerjakan kapan saja sebelum deadline.`;
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

    // ── READ_TOMORROW ───────────────────────────────────────
    if (action === 'READ_TOMORROW') {
      const tasks = await googleTasks.getTasksDueTomorrow();
      if (tasks.length === 0) return { status: 'SUCCESS', message: '✅ Tidak ada tugas yang jatuh tempo besok, Tuan.' };
      const list = tasks.map((t, i) => formatTask(t, i)).join('\n\n');
      return { status: 'SUCCESS', message: `🟠 <b>Tugas Besok (${tasks.length}):</b>\n\n${list}` };
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
          const dlEvents = await googleWorkspace.findEventByTitle(`🔴 DEADLINE: ${t.title}`);
          const wbEvents = await googleWorkspace.findEventByTitle(`⏰ BLOK KERJA: ${t.title}`);
          const allEvents = [...(dlEvents || []), ...(wbEvents || [])];
          for (const ev of allEvents) {
            await googleWorkspace.updateCalendarEventColor(ev.id, '8'); // 8 = Graphite
            syncedEvents++;
          }
        } catch (e) {
          console.warn('[TASKS] Failed to sync calendar color on task completion:', e.message);
        }
      }
      
      const names = matches.map(t => `'<b>${escapeHtml(t.title)}</b>'`).join(', ');
      let msg = `✅ Tugas ${names} ditandai <b>Selesai</b>! 🎉`;
      if (syncedEvents > 0) {
        msg += `\n📅 ${syncedEvents} jadwal (deadline & blok kerja) di Kalender otomatis diredupkan (abu-abu).`;
      }
      return { status: 'SUCCESS', message: msg };
    }

    // ── DELETE ──────────────────────────────────────────────
    if (action === 'DELETE') {
      const keyword = search_keyword || title;
      if (!keyword) return { status: 'FAILED', message: '❌ Sebutkan nama tugas yang ingin dihapus.' };
      const matches = await googleTasks.findTasksByKeyword(keyword);
      if (matches.length === 0) return { status: 'FAILED', message: `❌ Tidak ditemukan tugas cocok dengan "<b>${escapeHtml(keyword)}</b>".` };
      
      let deletedEvents = 0;
      for (const t of matches) {
        await googleTasks.deleteTask(t.id, t.listId);
        // [PHASE: Parallel Sync to Notion]
        notionClient.deleteTask(t.title).catch(e => console.error('[NOTION SYNC] Failed:', e.message));

        try {
          const dlEvents = await googleWorkspace.findEventByTitle(`🔴 DEADLINE: ${t.title}`);
          const wbEvents = await googleWorkspace.findEventByTitle(`⏰ BLOK KERJA: ${t.title}`);
          const allEvents = [...(dlEvents || []), ...(wbEvents || [])];
          for (const ev of allEvents) {
            await googleWorkspace.deleteCalendarEvent(ev.id);
            deletedEvents++;
          }
        } catch (e) {
          console.warn('[TASKS] Failed to delete calendar events on task deletion:', e.message);
        }
      }
      const names = matches.map(t => `'<b>${escapeHtml(t.title)}</b>'`).join(', ');
      let msg = `🗑️ Tugas ${names} berhasil dihapus.`;
      if (deletedEvents > 0) {
        msg += `\n📅 ${deletedEvents} jadwal terkait (deadline & blok kerja) otomatis dihapus dari Kalender.`;
      }
      return { status: 'SUCCESS', message: msg };
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
