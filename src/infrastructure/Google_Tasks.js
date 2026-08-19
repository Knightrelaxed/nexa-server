const { google } = require('googleapis');
const env = require('../config/env');

let tasksClient = null;
let _cachedTaskLists = null;
let _cachedListsTimestamp = 0;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes cache

function getTasksClient() {
  if (tasksClient) return tasksClient;

  const googleMaster = require('./Google_Master_Client');
  const masterTasks = googleMaster.getTasks();
  if (masterTasks) {
    tasksClient = masterTasks;
    return tasksClient;
  }

  if (!env.GMAIL_CLIENT_ID || !env.GMAIL_CLIENT_SECRET || !env.TASKS_REFRESH_TOKEN) {
    console.error('[TASKS] OAuth2 credentials not fully configured.');
    return null;
  }

  const oauth2Client = new google.auth.OAuth2(
    env.GMAIL_CLIENT_ID,
    env.GMAIL_CLIENT_SECRET,
    'http://localhost:3000/oauth2callback'
  );

  oauth2Client.setCredentials({ refresh_token: env.TASKS_REFRESH_TOKEN });
  tasksClient = google.tasks({ version: 'v1', auth: oauth2Client });
  return tasksClient;
}

// Default task list = "@default" (My Tasks / Tugas Saya)
const DEFAULT_LIST = '@default';

/**
 * Normalize date string to exact Date-Only UTC midnight for Google Tasks API.
 * Accurately prevents off-by-one day bugs caused by local WIB (+07:00) conversions.
 * e.g., "2026-08-20T14:00:00+07:00" -> "2026-08-20T00:00:00.000Z"
 */
function normalizeDateOnly(dateInput) {
  if (!dateInput) return null;
  const str = String(dateInput).trim();
  let datePart = '';
  if (str.includes('T')) {
    // If it contains time and offset, convert to Asia/Jakarta date part first
    try {
      const d = new Date(str);
      if (!isNaN(d.getTime())) {
        datePart = new Intl.DateTimeFormat('en-CA', {
          timeZone: 'Asia/Jakarta',
          year: 'numeric',
          month: '2-digit',
          day: '2-digit'
        }).format(d);
      }
    } catch (_) {}
  }
  if (!datePart) {
    datePart = str.split('T')[0].split(' ')[0];
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(datePart)) {
    return `${datePart}T00:00:00.000Z`;
  }
  return null;
}

/**
 * Get all task lists with caching to minimize latency and API quota
 */
async function getTaskLists(forceRefresh = false) {
  const now = Date.now();
  if (!forceRefresh && _cachedTaskLists && (now - _cachedListsTimestamp < CACHE_TTL_MS)) {
    return _cachedTaskLists;
  }

  const client = getTasksClient();
  if (!client) return [];
  try {
    const res = await client.tasklists.list({ maxResults: 50 });
    _cachedTaskLists = res.data.items || [];
    _cachedListsTimestamp = now;
    return _cachedTaskLists;
  } catch (err) {
    console.error('[TASKS] Error fetching tasklists:', err.message);
    return _cachedTaskLists || [];
  }
}

/**
 * Create a new task with normalized due date
 */
async function createTask({ title, notes = '', dueDate = null, listId = DEFAULT_LIST }) {
  const client = getTasksClient();
  if (!client) throw new Error('Google Tasks belum dikonfigurasi.');
  const task = { title, notes };

  if (dueDate) {
    task.due = normalizeDateOnly(dueDate);
  }

  const res = await client.tasks.insert({ tasklist: listId, requestBody: task });
  return res.data;
}

/**
 * Get all active (incomplete) tasks across a specific list or all lists
 */
async function getActiveTasks(listId = null) {
  const client = getTasksClient();
  if (!client) return [];

  if (listId) {
    const res = await client.tasks.list({
      tasklist: listId,
      showCompleted: false,
      showHidden: false,
      maxResults: 50
    });
    const items = res.data.items || [];
    items.forEach(t => t.listId = listId);
    return items;
  }

  // Fetch from ALL lists
  const lists = await getTaskLists();
  let allTasks = [];
  for (const list of lists) {
    try {
      const res = await client.tasks.list({
        tasklist: list.id,
        showCompleted: false,
        showHidden: false,
        maxResults: 50
      });
      const items = res.data.items || [];
      items.forEach(t => {
        t.listId = list.id;
        t.listTitle = list.title;
      });
      allTasks = allTasks.concat(items);
    } catch (_) {}
  }
  return allTasks;
}

/**
 * Get completed tasks
 */
async function getCompletedTasks(listId = DEFAULT_LIST) {
  const client = getTasksClient();
  if (!client) return [];
  const res = await client.tasks.list({
    tasklist: listId,
    showCompleted: true,
    showHidden: true,
    maxResults: 50
  });
  const all = res.data.items || [];
  return all.filter(t => t.status === 'completed');
}

/**
 * Mark a task as completed
 */
async function completeTask(taskId, listId = DEFAULT_LIST) {
  const client = getTasksClient();
  if (!client) throw new Error('Google Tasks belum dikonfigurasi.');
  const res = await client.tasks.patch({
    tasklist: listId,
    task: taskId,
    requestBody: { status: 'completed' }
  });
  return res.data;
}

/**
 * Delete a task by ID
 */
async function deleteTask(taskId, listId = DEFAULT_LIST) {
  const client = getTasksClient();
  if (!client) throw new Error('Google Tasks belum dikonfigurasi.');
  await client.tasks.delete({ tasklist: listId, task: taskId });
  return true;
}

/**
 * Edit a task's title, notes, or due date
 */
async function editTask({ taskId, newTitle, newNotes, newDueDate, listId = DEFAULT_LIST }) {
  const client = getTasksClient();
  if (!client) throw new Error('Google Tasks belum dikonfigurasi.');
  const patch = {};
  if (newTitle) patch.title = newTitle;
  if (newNotes !== undefined) patch.notes = newNotes;
  if (newDueDate) {
    patch.due = normalizeDateOnly(newDueDate);
  }

  const res = await client.tasks.patch({
    tasklist: listId,
    task: taskId,
    requestBody: patch
  });
  return res.data;
}

/**
 * Find tasks by keyword (fuzzy match against title or notes)
 */
async function findTasksByKeyword(keyword, listId = null) {
  const tasks = await getActiveTasks(listId);
  const words = keyword.toLowerCase().split(/\s+/).filter(Boolean);
  return tasks.filter(t => {
    const text = `${t.title || ''} ${t.notes || ''}`.toLowerCase();
    return words.every(w => text.includes(w));
  });
}

/**
 * Delete all completed tasks
 */
async function clearCompletedTasks(listId = null) {
  const client = getTasksClient();
  if (!client) throw new Error('Google Tasks belum dikonfigurasi.');
  
  if (listId) {
    await client.tasks.clear({ tasklist: listId });
    return true;
  }
  
  // Clear completed tasks from ALL lists
  const lists = await getTaskLists();
  for (const list of lists) {
    try {
      await client.tasks.clear({ tasklist: list.id });
    } catch (_) {}
  }
  return true;
}

/**
 * Reliable Jakarta YYYY-MM-DD date calculation with optional day offset
 */
function _getJakartaDateStr(daysOffset = 0) {
  const now = new Date();
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(now);
  const year = parseInt(parts.find(p => p.type === 'year').value, 10);
  const month = parseInt(parts.find(p => p.type === 'month').value, 10) - 1;
  const day = parseInt(parts.find(p => p.type === 'day').value, 10);
  const target = new Date(Date.UTC(year, month, day + daysOffset));
  return target.toISOString().split('T')[0];
}

/**
 * Get tasks due specifically today (Jakarta timezone)
 */
async function getTasksDueToday(listId = null) {
  const tasks = await getActiveTasks(listId);
  const todayStr = _getJakartaDateStr(0);
  return tasks.filter(t => t.due && t.due.startsWith(todayStr));
}

/**
 * Get tasks due specifically tomorrow (Jakarta timezone)
 */
async function getTasksDueTomorrow(listId = null) {
  const tasks = await getActiveTasks(listId);
  const tmrwStr = _getJakartaDateStr(1);
  return tasks.filter(t => t.due && t.due.startsWith(tmrwStr));
}

/**
 * Get tasks past their due date (overdue, still active)
 */
async function getOverdueTasks(listId = null) {
  const tasks = await getActiveTasks(listId);
  const todayStr = _getJakartaDateStr(0);
  return tasks.filter(t => t.due && t.due.split('T')[0] < todayStr);
}

/**
 * Get active tasks due within the next N days
 */
async function getUpcomingTasks(daysAhead = 7, listId = null) {
  const tasks = await getActiveTasks(listId);
  const todayStr = _getJakartaDateStr(0);
  const futureStr = _getJakartaDateStr(daysAhead);
  return tasks.filter(t => {
    if (!t.due) return false;
    const d = t.due.split('T')[0];
    return d >= todayStr && d <= futureStr;
  });
}

/**
 * Get tasks due within a specific ISO date range
 */
async function getTasksByDateRange(startIso, endIso, listId = null) {
  const tasks = await getActiveTasks(listId);
  const startStr = startIso ? new Date(startIso).toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' }) : null;
  const endStr = endIso ? new Date(endIso).toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' }) : null;
  
  return tasks.filter(t => {
    if (!t.due) return false;
    const d = t.due.split('T')[0];
    if (startStr && endStr) return d >= startStr && d <= endStr;
    if (startStr) return d === startStr;
    return false;
  });
}

/**
 * Find a task list by name, or create it if it doesn't exist.
 */
async function findOrCreateList(name) {
  const lists = await getTaskLists(true);
  const found = lists.find(l => l.title && l.title.toLowerCase() === name.toLowerCase());
  if (found) return found;

  const client = getTasksClient();
  if (!client) throw new Error('Google Tasks belum dikonfigurasi.');
  const created = await client.tasklists.insert({ requestBody: { title: name } });
  await getTaskLists(true); // refresh cache
  return created.data;
}

/**
 * Create a subtask under a parent task
 */
async function createSubtask({ title, notes = '', dueDate = null, parentId, listId = DEFAULT_LIST }) {
  const client = getTasksClient();
  if (!client) throw new Error('Google Tasks belum dikonfigurasi.');
  const task = { title, notes };
  if (dueDate) {
    task.due = normalizeDateOnly(dueDate);
  }
  const res = await client.tasks.insert({
    tasklist: listId,
    parent: parentId,
    requestBody: task
  });
  return res.data;
}

/**
 * Get all subtasks (children) of a given parent task
 */
async function getSubtasks(parentId, listId = DEFAULT_LIST) {
  const tasks = await getActiveTasks(listId);
  return tasks.filter(t => t.parent === parentId);
}

/**
 * Get tasks from a specific named list
 */
async function getTasksFromList(listName) {
  const lists = await getTaskLists();
  const found = lists.find(l => l.title && l.title.toLowerCase() === listName.toLowerCase());
  if (!found) return [];
  return getActiveTasks(found.id);
}

/**
 * Move a task to a different task list
 */
async function moveTaskToList(taskId, targetListName, sourceListId = DEFAULT_LIST) {
  const client = getTasksClient();
  if (!client) throw new Error('Google Tasks belum dikonfigurasi.');

  const originalTask = await client.tasks.get({
    tasklist: sourceListId,
    task: taskId
  });

  const targetList = await findOrCreateList(targetListName);

  const newTask = {
    title: originalTask.data.title,
    notes: originalTask.data.notes || '',
    status: originalTask.data.status || 'needsAction'
  };

  if (originalTask.data.due) {
    newTask.due = originalTask.data.due;
  }

  const created = await client.tasks.insert({
    tasklist: targetList.id,
    requestBody: newTask
  });

  await client.tasks.delete({
    tasklist: sourceListId,
    task: taskId
  });

  return created.data;
}

module.exports = {
  getTaskLists,
  findOrCreateList,
  createTask,
  createSubtask,
  getSubtasks,
  getTasksFromList,
  getActiveTasks,
  getCompletedTasks,
  getTasksDueToday,
  getTasksDueTomorrow,
  getOverdueTasks,
  getUpcomingTasks,
  getTasksByDateRange,
  completeTask,
  deleteTask,
  editTask,
  findTasksByKeyword,
  clearCompletedTasks,
  moveTaskToList,
  normalizeDateOnly
};
