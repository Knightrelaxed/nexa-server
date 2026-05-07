const { google } = require('googleapis');
const env = require('../config/env');

let tasksClient = null;

function getTasksClient() {
  if (tasksClient) return tasksClient;

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
  const res = await client.tasklists.list({ maxResults: 20 });
  return res.data.items || [];
}

/**
 * Create a new task
 */
async function createTask({ title, notes = '', dueDate = null, listId = DEFAULT_LIST }) {
  const client = getTasksClient();
  const task = { title, notes };
  if (dueDate) task.due = new Date(dueDate).toISOString();

  const res = await client.tasks.insert({ tasklist: listId, requestBody: task });
  return res.data;
}

/**
 * Get all active (incomplete) tasks
 */
async function getActiveTasks(listId = DEFAULT_LIST) {
  const client = getTasksClient();
  const res = await client.tasks.list({
    tasklist: listId,
    showCompleted: false,
    showHidden: false,
    maxResults: 50
  });
  return res.data.items || [];
}

/**
 * Get completed tasks
 */
async function getCompletedTasks(listId = DEFAULT_LIST) {
  const client = getTasksClient();
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
  await client.tasks.delete({ tasklist: listId, task: taskId });
  return true;
}

/**
 * Edit a task's title or due date
 */
async function editTask({ taskId, newTitle, newNotes, newDueDate, listId = DEFAULT_LIST }) {
  const client = getTasksClient();
  const patch = {};
  if (newTitle) patch.title = newTitle;
  if (newNotes) patch.notes = newNotes;
  if (newDueDate) patch.due = new Date(newDueDate).toISOString();

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
async function findTasksByKeyword(keyword, listId = DEFAULT_LIST) {
  const tasks = await getActiveTasks(listId);
  const words = keyword.toLowerCase().split(/\s+/).filter(Boolean);
  return tasks.filter(t =>
    words.every(w => (t.title || '').toLowerCase().includes(w))
  );
}

/**
 * Delete all completed tasks
 */
async function clearCompletedTasks(listId = DEFAULT_LIST) {
  const client = getTasksClient();
  await client.tasks.clear({ tasklist: listId });
  return true;
}

module.exports = {
  getTaskLists,
  createTask,
  getActiveTasks,
  getCompletedTasks,
  completeTask,
  deleteTask,
  editTask,
  findTasksByKeyword,
  clearCompletedTasks
};
