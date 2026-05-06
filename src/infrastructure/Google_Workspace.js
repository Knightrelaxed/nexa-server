const { google } = require('googleapis');
const env = require('../config/env');

const SCOPES = [
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/documents',
  'https://www.googleapis.com/auth/drive'
];

// Lazy-initialize auth and clients.
// CRITICAL: Do NOT create clients at module load time with auth=undefined.
// If credentials are missing, Node crashes immediately on require().
// Instead, build clients on first use via getClients().
let _clients = null;

function getClients() {
  if (_clients) return _clients;

  if (!env.GOOGLE_SERVICE_ACCOUNT_EMAIL || !env.GOOGLE_PRIVATE_KEY) {
    throw new Error('[GOOGLE] Service Account credentials not configured. Set GOOGLE_SERVICE_ACCOUNT_EMAIL and GOOGLE_PRIVATE_KEY in HF Secrets.');
  }

  const auth = new google.auth.GoogleAuth({
    credentials: {
      client_email: env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      private_key: env.GOOGLE_PRIVATE_KEY
    },
    scopes: SCOPES
  });

  _clients = {
    sheets: google.sheets({ version: 'v4', auth }),
    calendar: google.calendar({ version: 'v3', auth }),
    docs: google.docs({ version: 'v1', auth }),
    drive: google.drive({ version: 'v3', auth })
  };
  return _clients;
}

/**
 * Append a row to the Finance Google Sheet
 * @param {Array<string|number>} rowData - e.g. [Date, Nominal, Merchant, Source]
 */
async function appendFinanceRow(rowData) {
  const { sheets } = getClients();

  // Get the actual first sheet name dynamically to avoid hardcoding errors
  const meta = await sheets.spreadsheets.get({ spreadsheetId: env.GOOGLE_SHEET_ID });
  const sheetName = meta.data.sheets[0].properties.title;
  console.log(`[FINANCE] Appending to sheet: "${sheetName}"`);

  const response = await sheets.spreadsheets.values.append({
    spreadsheetId: env.GOOGLE_SHEET_ID,
    range: `${sheetName}!A:H`,
    valueInputOption: 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS', // Always insert new row, never overwrite
    requestBody: {
      values: [rowData]
    }
  });
  return response.data;
}

/**
 * Read the current month's budget/expenses from the sheet
 * @returns {Array<Array<string>>}
 */
async function getFinanceSummary(range = 'Dashboard!A1:B10') {
  const { sheets } = getClients();

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: env.GOOGLE_SHEET_ID,
    range: range
  });
  return response.data.values;
}

/**
 * Create a new event in Google Calendar
 */
async function createCalendarEvent(summary, startTime, endTime, description = '') {
  const { calendar } = getClients();

  const response = await calendar.events.insert({
    calendarId: env.GOOGLE_CALENDAR_ID || 'primary',
    requestBody: {
      summary,
      description,
      start: { dateTime: startTime, timeZone: 'Asia/Jakarta' },
      end: { dateTime: endTime, timeZone: 'Asia/Jakarta' }
    }
  });
  return response.data;
}

/**
 * Update an existing Google Calendar event by eventId
 */
async function updateCalendarEvent(eventId, summary, startTime, endTime, description = '') {
  const { calendar } = getClients();

  const response = await calendar.events.patch({
    calendarId: env.GOOGLE_CALENDAR_ID || 'primary',
    eventId: eventId,
    requestBody: {
      summary,
      description,
      start: { dateTime: startTime, timeZone: 'Asia/Jakarta' },
      end: { dateTime: endTime, timeZone: 'Asia/Jakarta' }
    }
  });
  return response.data;
}

/**
 * Find events by summary text (for UPDATE flow when no eventId is known)
 */
async function findEventByTitle(summaryKeyword) {
  const { calendar } = getClients();

  const now = new Date();
  const nextWeek = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const response = await calendar.events.list({
    calendarId: env.GOOGLE_CALENDAR_ID || 'primary',
    timeMin: now.toISOString(),
    timeMax: nextWeek.toISOString(),
    q: summaryKeyword,
    singleEvents: true,
    orderBy: 'startTime'
  });
  return response.data.items || [];
}

/**
 * Delete a calendar event
 */
async function deleteCalendarEvent(eventId) {
  const { calendar } = getClients();
  
  await calendar.events.delete({
    calendarId: env.GOOGLE_CALENDAR_ID || 'primary',
    eventId: eventId
  });
  return true;
}

/**
 * Get today's events for Morning Briefing — using Jakarta timezone offset
 */
async function getTodaysEvents() {
  const { calendar } = getClients();

  // Jakarta is UTC+7, so offset = 7 * 60 * 60 * 1000 ms
  const jakartaOffsetMs = 7 * 60 * 60 * 1000;
  const nowUtc = new Date();
  // Get current time in Jakarta
  const nowJakarta = new Date(nowUtc.getTime() + jakartaOffsetMs);
  // Build start of day in Jakarta (midnight), then convert back to UTC ISO
  const startOfDayJakarta = new Date(nowJakarta);
  startOfDayJakarta.setHours(0, 0, 0, 0);
  const endOfDayJakarta = new Date(nowJakarta);
  endOfDayJakarta.setHours(23, 59, 59, 999);
  
  // Convert back: subtract the offset to get the UTC equivalent
  const timeMin = new Date(startOfDayJakarta.getTime() - jakartaOffsetMs).toISOString();
  const timeMax = new Date(endOfDayJakarta.getTime() - jakartaOffsetMs).toISOString();

  const response = await calendar.events.list({
    calendarId: env.GOOGLE_CALENDAR_ID || 'primary',
    timeMin,
    timeMax,
    singleEvents: true,
    orderBy: 'startTime'
  });

  return response.data.items || [];
}

/**
 * Append an idea/fact to the single Master 2nd Brain Google Doc.
 * Instead of creating a new Doc per idea (blocked by Drive storage quota),
 * we append a timestamped entry to one pre-existing document.
 * 
 * @param {string} title - The title/heading of the idea
 * @param {string} content - The body content
 * @param {string} type - 'IDEA' or 'PERSONAL_FACT'
 * @returns {string} URL to the master document
 */
async function appendToIdeaDoc(title, content, type = 'IDEA') {
  const { docs } = getClients();

  const documentId = env.GOOGLE_DOCS_IDEA_ID;
  if (!documentId) {
    throw new Error('[2ND_BRAIN] GOOGLE_DOCS_IDEA_ID not configured. Create a Google Doc, share it with the Service Account, and add the Doc ID to Secrets.');
  }

  // Build a formatted entry with timestamp and divider
  const timestamp = new Date().toLocaleString('id-ID', { 
    timeZone: 'Asia/Jakarta', 
    dateStyle: 'full', 
    timeStyle: 'short' 
  });
  const typeLabel = type === 'PERSONAL_FACT' ? '📌 FAKTA PERSONAL' : '💡 IDE';
  
  const entry = `\n\n═══════════════════════════════════════\n${typeLabel} — ${timestamp}\n\n📋 ${title}\n\n${content}\n═══════════════════════════════════════\n`;

  // Get current document length to know where to append
  const doc = await docs.documents.get({ documentId });
  const endIndex = doc.data.body.content.reduce((max, element) => {
    return Math.max(max, element.endIndex || 0);
  }, 0);

  // Append at the very end of the document
  await docs.documents.batchUpdate({
    documentId,
    requestBody: {
      requests: [{
        insertText: {
          location: { index: endIndex - 1 }, // Insert before the final newline
          text: entry
        }
      }]
    }
  });

  return `https://docs.google.com/document/d/${documentId}`;
}

/**
 * GENERIC SPREADSHEET MANAGEMENT
 */

/**
 * Find a spreadsheet by title in the user's Drive.
 */
async function findSpreadsheetByTitle(title) {
  const { drive } = getClients();
  // Ensure we only look for exact name match and spreadsheet mime type
  // Also only look in the 2nd brain folder if configured, to avoid messing with other files.
  let query = `name = '${title.replace(/'/g, "\\'")}' and mimeType = 'application/vnd.google-apps.spreadsheet' and trashed = false`;
  if (env.GOOGLE_DRIVE_FOLDER_ID) {
    query += ` and '${env.GOOGLE_DRIVE_FOLDER_ID}' in parents`;
  }

  const response = await drive.files.list({
    q: query,
    fields: 'files(id, name)'
  });

  if (response.data.files && response.data.files.length > 0) {
    return response.data.files[0].id;
  }
  return null;
}

/**
 * Create a new spreadsheet with the given title and headers.
 * @returns {string} The spreadsheet URL
 */
async function createGenericSpreadsheet(title, headers) {
  const { sheets, drive } = getClients();

  // 1. Create the spreadsheet
  const response = await sheets.spreadsheets.create({
    requestBody: {
      properties: {
        title: title
      }
    }
  });
  
  const spreadsheetId = response.data.spreadsheetId;

  // 2. Add headers to row 1
  if (headers && headers.length > 0) {
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: 'A1',
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: [headers]
      }
    });
  }

  // 3. Move to 2nd brain folder
  if (env.GOOGLE_DRIVE_FOLDER_ID) {
    try {
      const file = await drive.files.get({
        fileId: spreadsheetId,
        fields: 'parents'
      });
      const previousParents = (file.data.parents || []).join(',');

      await drive.files.update({
        fileId: spreadsheetId,
        addParents: env.GOOGLE_DRIVE_FOLDER_ID,
        removeParents: previousParents,
        fields: 'id, parents'
      });
    } catch (err) {
      console.error('[DRIVE] Failed to move spreadsheet to shared folder:', err.message);
    }
  }

  return { id: spreadsheetId, url: `https://docs.google.com/spreadsheets/d/${spreadsheetId}` };
}

/**
 * Get headers from the first row of a spreadsheet.
 */
async function getSpreadsheetHeaders(spreadsheetId) {
  const { sheets } = getClients();
  try {
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: '1:1' // First row
    });
    if (response.data.values && response.data.values.length > 0) {
      return response.data.values[0];
    }
  } catch (err) {
    console.error('[SHEETS] Failed to get headers:', err.message);
  }
  return [];
}

/**
 * Append a generic row to a spreadsheet.
 */
async function appendGenericRow(spreadsheetId, values) {
  const { sheets } = getClients();
  const response = await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: 'A:Z', // Append to any available column
    valueInputOption: 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS',
    requestBody: {
      values: [values]
    }
  });
  return response.data;
}

/**
 * Delete (trash) a spreadsheet.
 */
async function deleteGenericSpreadsheet(fileId) {
  const { drive } = getClients();
  await drive.files.update({
    fileId,
    requestBody: {
      trashed: true
    }
  });
  return true;
}

module.exports = {
  appendFinanceRow,
  getFinanceSummary,
  createCalendarEvent,
  updateCalendarEvent,
  findEventByTitle,
  deleteCalendarEvent,
  getTodaysEvents,
  appendToIdeaDoc,
  findSpreadsheetByTitle,
  createGenericSpreadsheet,
  getSpreadsheetHeaders,
  appendGenericRow,
  deleteGenericSpreadsheet
  // Note: raw clients (sheets, calendar, docs, drive) not exported.
  // Use the functions above. Clients are lazy-initialized via getClients().
};
