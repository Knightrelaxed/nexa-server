const { google } = require('googleapis');
const env = require('../config/env');

let tasksClient = null;

function getTasksClient() {
  if (tasksClient) return tasksClient;

  if (!env.GMAIL_CLIENT_ID || !env.GMAIL_CLIENT_SECRET || !env.TASKS_REFRESH_TOKEN) {
    console.error('[TASKS] OAuth2 credentials not fully configured.');
    return null;
  }

  const oauth2Client = new google.auth.OAuth2(
    env.GMAIL_CLIENT_ID,
    env.GMAIL_CLIENT_SECRET,
    'http://localhost:3001/oauth2callback'
  );

  oauth2Client.setCredentials({ refresh_token: env.TASKS_REFRESH_TOKEN });
  tasksClient = google.tasks({ version: 'v1', auth: oauth2Client });
  return tasksClient;
}

// Default task list = "@default" (My Tasks)
const DEFAULT_LIST = '@default';

/**
 * Get all task lists
 */
async function getTaskLists() {
  const client = getTasksClient();
  if (!client) return [];
  const res = await client.tasklists.list({ maxResults: 20 });
  return res.data.items || [];
}

/**
 * Create a new task
 */
async function createTask({ title, notes = '', dueDate = null, listId = DEFAULT_LIST }) {
  const client = getTasksClient();
  if (!client) throw new Error('Google Tasks belum dikonfigurasi.');
  const task = { title, notes };

  if (dueDate) {
    // Google Tasks 'due' field is DATE-ONLY (time is ignored).
    // To avoid off-by-one timezone errors, extract the local date portion
    // and always store as midnight UTC of that same calendar date.
    const localDateStr = dueDate.split('T')[0]; // e.g. "2026-05-09"
    task.due = `${localDateStr}T00:00:00.000Z`;
  }

  const res = await client.tasks.insert({ tasklist: listId, requestBody: task });
  return res.data;
}

/**
 * Get all task lists
 */
async function getAllLists() {
  const client = getTasksClient();
  if (!client) return [];
  const res = await client.tasklists.list({ maxResults: 50 });
  return res.data.items || [];
}

/**
 * Get all active (incomplete) tasks
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
  const lists = await getAllLists();
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
      items.forEach(t => t.listId = list.id);
      allTasks = allTasks.concat(items);
    } catch (e) {}
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
 * Edit a task's title or due date
 */
async function editTask({ taskId, newTitle, newNotes, newDueDate, listId = DEFAULT_LIST }) {
  const client = getTasksClient();
  if (!client) throw new Error('Google Tasks belum dikonfigurasi.');
  const patch = {};
  if (newTitle) patch.title = newTitle;
  if (newNotes) patch.notes = newNotes;
  if (newDueDate) {
    const localDateStr = String(newDueDate).split('T')[0];
    patch.due = `${localDateStr}T00:00:00.000Z`;
  }

  const res = await client.tasks.patch({
    tasklist: listId,
    task: taskId,
    requestBody: patch
  });
  return res.data;
}

/**
 * Find tasks by keyword (fuzzy match against title)
 */
async function findTasksByKeyword(keyword, listId = null) {
  const tasks = await getActiveTasks(listId);
  const words = keyword.toLowerCase().split(/\s+/).filter(Boolean);
  return tasks.filter(t =>
    words.every(w => (t.title || '').toLowerCase().includes(w))
  );
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
  const lists = await getAllLists();
  for (const list of lists) {
    try {
      await client.tasks.clear({ tasklist: list.id });
    } catch (e) {}
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
 * Returns the list object { id, title }.
 */
async function findOrCreateList(name) {
  const client = getTasksClient();
  if (!client) throw new Error('Google Tasks belum dikonfigurasi.');
  const res = await client.tasklists.list({ maxResults: 50 });
  const lists = res.data.items || [];
  const found = lists.find(l => l.title && l.title.toLowerCase() === name.toLowerCase());
  if (found) return found;
  // Create new list
  const created = await client.tasklists.insert({ requestBody: { title: name } });
  return created.data;
}

/**
 * Create a subtask under a parent task.
 * @param {{ title, notes, dueDate, parentId, listId }}
 */
async function createSubtask({ title, notes = '', dueDate = null, parentId, listId = DEFAULT_LIST }) {
  const client = getTasksClient();
  if (!client) throw new Error('Google Tasks belum dikonfigurasi.');
  const task = { title, notes };
  if (dueDate) {
    const localDateStr = String(dueDate).split('T')[0];
    task.due = `${localDateStr}T00:00:00.000Z`;
  }
  const res = await client.tasks.insert({
    tasklist: listId,
    parent: parentId,
    requestBody: task
  });
  return res.data;
}

/**
 * Get all subtasks (children) of a given parent task.
 */
async function getSubtasks(parentId, listId = DEFAULT_LIST) {
  const tasks = await getActiveTasks(listId);
  return tasks.filter(t => t.parent === parentId);
}

/**
 * Get tasks from a specific named list (find list first).
 */
async function getTasksFromList(listName) {
  const client = getTasksClient();
  if (!client) return [];
  const res = await client.tasklists.list({ maxResults: 50 });
  const lists = res.data.items || [];
  const found = lists.find(l => l.title && l.title.toLowerCase() === listName.toLowerCase());
  if (!found) return [];
  return getActiveTasks(found.id);
}

/**
 * Move a task to a different task list
 * Google Tasks API doesn't have a direct "move" operation, so we:
 * 1. Read the task details
 * 2. Create a new task in the target list
 * 3. Delete the original task
 * @param {string} taskId - The task ID to move
 * @param {string} targetListName - The name of the target list
 * @param {string} sourceListId - The source list ID (optional, defaults to @default)
 */
async function moveTaskToList(taskId, targetListName, sourceListId = DEFAULT_LIST) {
  const client = getTasksClient();
  if (!client) throw new Error('Google Tasks belum dikonfigurasi.');

  // 1. Get the original task details
  const originalTask = await client.tasks.get({
    tasklist: sourceListId,
    task: taskId
  });

  // 2. Find or create the target list
  const targetList = await findOrCreateList(targetListName);

  // 3. Create the task in the target list
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

  // 4. Delete the original task
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
  moveTaskToList
};
