const { Client } = require('@notionhq/client');
const env = require('../config/env');

let notion = null;
if (env.NOTION_API_KEY) {
  notion = new Client({ auth: env.NOTION_API_KEY });
}

async function isConfigured() {
  return notion !== null && env.NOTION_TASKS_DB_ID;
}

/**
 * Creates a new task in the Notion database.
 * Requires columns: "Title" (title), "Catatan" (rich_text), "Deadline" (date), "Selesai" (checkbox).
 */
async function createTask(title, notes = '', dueDate = null) {
  if (!await isConfigured()) return null;
  try {
    const properties = {
      "Title": {
        title: [{ text: { content: title } }]
      }
    };

    if (notes) {
      properties["Catatan"] = {
        rich_text: [{ text: { content: notes } }]
      };
    }

    if (dueDate) {
      // dueDate might be '2026-05-09T00:00:00+07:00' or similar
      properties["Deadline"] = {
        date: { start: dueDate }
      };
    }

    properties["Selesai"] = {
      checkbox: false
    };

    const response = await notion.pages.create({
      parent: { database_id: env.NOTION_TASKS_DB_ID },
      properties: properties
    });

    console.log('[NOTION] Task created:', response.id);
    return response.id;
  } catch (error) {
    console.error('[NOTION] Failed to create task. Check if Notion DB properties match: Title, Catatan, Deadline, Selesai.', error.message);
    return null;
  }
}

/**
 * Marks a task as completed in Notion.
 * Matches by exact title.
 */
async function completeTask(title) {
  if (!await isConfigured()) return null;
  try {
    const response = await notion.databases.query({
      database_id: env.NOTION_TASKS_DB_ID,
      filter: {
        property: "Title",
        title: { equals: title }
      }
    });

    if (response.results.length === 0) return null;

    const pageId = response.results[0].id;
    await notion.pages.update({
      page_id: pageId,
      properties: { "Selesai": { checkbox: true } }
    });

    console.log('[NOTION] Task marked as complete:', pageId);
    return pageId;
  } catch (error) {
    console.error('[NOTION] Failed to complete task:', error.message);
    return null;
  }
}

/**
 * Archives (deletes) a task from Notion.
 * Matches by exact title.
 */
async function deleteTask(title) {
  if (!await isConfigured()) return null;
  try {
    const response = await notion.databases.query({
      database_id: env.NOTION_TASKS_DB_ID,
      filter: {
        property: "Title",
        title: { equals: title }
      }
    });

    if (response.results.length === 0) return null;

    const pageId = response.results[0].id;
    await notion.pages.update({
      page_id: pageId,
      archived: true
    });

    console.log('[NOTION] Task archived/deleted:', pageId);
    return pageId;
  } catch (error) {
    console.error('[NOTION] Failed to delete task:', error.message);
    return null;
  }
}

module.exports = {
  createTask,
  completeTask,
  deleteTask
};
