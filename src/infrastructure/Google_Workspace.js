const { google } = require('googleapis');
const env = require('../config/env');
const fs = require('fs');

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
let _oauthDriveClients = null;

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
    drive: google.drive({ version: 'v3', auth }),
    // Drive v2 is used for OCR conversion flags not present in v3
    driveV2: google.drive({ version: 'v2', auth })
  };
  return _clients;
}

function getOAuthDriveClients() {
  if (_oauthDriveClients) return _oauthDriveClients;

  const refreshToken = env.GOOGLE_DRIVE_REFRESH_TOKEN || env.GMAIL_REFRESH_TOKEN || env.TASKS_REFRESH_TOKEN;
  if (!env.GMAIL_CLIENT_ID || !env.GMAIL_CLIENT_SECRET || !refreshToken) {
    throw new Error('[GOOGLE] OAuth Drive fallback belum dikonfigurasi (butuh GMAIL_CLIENT_ID/GMAIL_CLIENT_SECRET + GOOGLE_DRIVE_REFRESH_TOKEN atau token OAuth lain yang memiliki scope Drive).');
  }

  const oauth2Client = new google.auth.OAuth2(
    env.GMAIL_CLIENT_ID,
    env.GMAIL_CLIENT_SECRET,
    'http://localhost:3000/oauth2callback'
  );
  oauth2Client.setCredentials({ refresh_token: refreshToken });

  _oauthDriveClients = {
    drive: google.drive({ version: 'v3', auth: oauth2Client }),
    driveV2: google.drive({ version: 'v2', auth: oauth2Client })
  };
  return _oauthDriveClients;
}

function stripHtml(text = '') {
  return String(text).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

async function uploadFileToVault({ filePath, fileName, mimeType, folderId }) {
  const { drive } = getClients();
  const targetFolder = folderId || env.GOOGLE_VAULT_FOLDER_ID;
  if (!targetFolder) throw new Error('GOOGLE_VAULT_FOLDER_ID / GOOGLE_DRIVE_FOLDER_ID belum dikonfigurasi.');

  const buildCreatePayload = () => ({
    requestBody: {
      name: fileName,
      parents: [targetFolder]
    },
    media: {
      mimeType,
      // IMPORTANT: create a fresh stream per attempt (SA first, OAuth retry)
      body: fs.createReadStream(filePath)
    },
    fields: 'id, webViewLink, name, mimeType',
    supportsAllDrives: true
  });

  try {
    const res = await drive.files.create(buildCreatePayload());
    return res.data;
  } catch (err) {
    const msg = err?.message || '';
    if (!/Service Accounts do not have storage quota/i.test(msg)) {
      throw err;
    }

    console.warn('[DRIVE] Service Account quota issue detected. Retrying Vault upload with OAuth user credentials...');
    const { drive: oauthDrive } = getOAuthDriveClients();
    const res = await oauthDrive.files.create(buildCreatePayload());
    return res.data;
  }
}

async function extractOcrTextViaDriveOcr({ filePath, fileName, mimeType, folderId }) {
  const { driveV2 } = getClients();
  const targetFolder = folderId || env.GOOGLE_VAULT_FOLDER_ID;
  if (!targetFolder) throw new Error('GOOGLE_VAULT_FOLDER_ID / GOOGLE_DRIVE_FOLDER_ID belum dikonfigurasi.');
  const doOcrWithClient = async (client) => {
    // Create a Google Doc with OCR+convert (Drive v2)
    const docRes = await client.files.insert({
      ocr: true,
      convert: true,
      supportsAllDrives: true,
      requestBody: {
        title: `OCR_${fileName || 'vault'}`,
        parents: [{ id: targetFolder }]
      },
      media: {
        mimeType,
        body: fs.createReadStream(filePath)
      }
    });

    const docId = docRes.data.id;
    try {
      const exported = await client.files.export({
        fileId: docId,
        mimeType: 'text/plain'
      }, { responseType: 'arraybuffer' });

      const text = Buffer.from(exported.data).toString('utf8');
      return stripHtml(text);
    } finally {
      // Best-effort cleanup: move OCR doc to trash to keep Drive tidy
      try {
        await client.files.trash({ fileId: docId });
      } catch (_) {}
    }
  };

  try {
    return await doOcrWithClient(driveV2);
  } catch (err) {
    const msg = err?.message || '';
    if (!/Service Accounts do not have storage quota/i.test(msg)) {
      throw err;
    }
    console.warn('[DRIVE] Service Account quota issue detected. Retrying OCR with OAuth user credentials...');
    const { driveV2: oauthDriveV2 } = getOAuthDriveClients();
    return await doOcrWithClient(oauthDriveV2);
  }
}

/**
 * Get the current month sheet name in Indonesian (e.g. "Februari 2026")
 */
function getCurrentMonthSheetName() {
  const now = new Date();
  // Use Jakarta time for year resolution
  const jakartaDate = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Jakarta' }));
  return jakartaDate.getFullYear().toString(); // e.g. "2026"
}

/**
 * Append one transaction row to the Buku Kas Bank Mandiri Livin sheet.
 * Targets the current month's tab (e.g. "Februari 2026").
 * Writes columns A-J with Google Sheets formulas for Saldo (I) and Nominal+ (J).
 *
 * Sheet structure (row 4 = headers, data starts at row 5):
 * A: No | B: Tanggal | C: Waktu | D: Tipe | E: Kategori | F: Akun
 * G: Catatan/Detail | H: Nominal (Rp) | I: Saldo (Rp) [formula] | J: Nominal (+) [formula]
 *
 * @param {object} txData - { tanggal, waktu, tipe, kategori, akun, catatan, nominal }
 */
async function appendFinanceRow(txData) {
  const { sheets } = getClients();
  const sheetId = env.GOOGLE_SHEET_ID;
  if (!sheetId) throw new Error('GOOGLE_SHEET_ID tidak dikonfigurasi di Secrets.');

  const sheetName = getCurrentMonthSheetName();
  console.log(`[FINANCE] Target sheet: "${sheetName}"`);

  // --- Step 1: Find the next empty data row ---
  // Read column A (No) from row 5 downward to count existing rows
  const readRange = `'${sheetName}'!A5:A`;
  let existingRows = 0;
  try {
    const readRes = await sheets.spreadsheets.values.get({
      spreadsheetId: sheetId,
      range: readRange
    });
    existingRows = readRes.data.values ? readRes.data.values.length : 0;
  } catch (e) {
    // Sheet may be empty — that's fine, existingRows stays 0
    console.warn(`[FINANCE] Could not read existing rows (possibly empty sheet): ${e.message}`);
  }

  const nextRowNumber = 5 + existingRows;        // Absolute row in sheet (1-indexed)
  const noValue = existingRows + 1;               // Sequential No. for column A
  const prevRow = nextRowNumber - 1;              // Row above for Saldo formula

  // --- Step 2: Build Saldo (I) and Nominal+ (J) formulas ---
  // I: Running balance. First data row (row 5) = H5. Subsequent rows = I{prev}+H{current}
  const saldoFormula = nextRowNumber === 5
    ? `=H${nextRowNumber}`
    : `=I${prevRow}+H${nextRowNumber}`;

  // J: Positive value of pengeluaran only. Uses semicolons — Google Sheets locale ID format
  const nominalPlusFormula = `=IF(H${nextRowNumber}<0; ABS(H${nextRowNumber}); 0)`;

  // --- Step 3: Build the row array (A to J) ---
  const row = [
    noValue,               // A: No
    txData.tanggal,        // B: Tanggal
    txData.waktu,          // C: Waktu
    txData.tipe,           // D: Tipe (Pemasukan/Pengeluaran)
    txData.kategori,       // E: Kategori
    txData.akun || 'Bank Mandiri Livin', // F: Akun
    txData.catatan,        // G: Catatan / Detail
    txData.nominal,        // H: Nominal (Rp) — negative for Pengeluaran
    saldoFormula,          // I: Saldo (Rp) — Google Sheets formula
    nominalPlusFormula     // J: Nominal (+) — Google Sheets formula
  ];

  // --- Step 4: Write to exact row using update (not append) to preserve formula integrity ---
  const writeRange = `'${sheetName}'!A${nextRowNumber}:J${nextRowNumber}`;
  const response = await sheets.spreadsheets.values.update({
    spreadsheetId: sheetId,
    range: writeRange,
    valueInputOption: 'USER_ENTERED', // Interprets formula strings as actual formulas
    requestBody: { values: [row] }
  });

  console.log(`[FINANCE] Row written at ${writeRange}. No: ${noValue}`);
  return { rowNumber: nextRowNumber, noValue, sheetName, response: response.data };
}

/**
 * Read recent transactions from the current month's sheet.
 * Returns raw values array (rows 5 to lastRow, columns A-J).
 * @param {number} limit - Number of recent rows to return (default 5)
 */
async function getFinanceSummary(limit = 5) {
  const { sheets } = getClients();
  const sheetId = env.GOOGLE_SHEET_ID;
  const sheetName = getCurrentMonthSheetName();

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: sheetId,
    range: `'${sheetName}'!A5:J`
  });

  const allRows = response.data.values || [];
  if (allRows.length === 0) return [];
  // Return the last `limit` rows (most recent first)
  return allRows.slice(-limit).reverse();
}

/**
 * Get ALL transactions from the current month's sheet (used for Edit/Delete operations).
 */
async function getAllFinanceRows() {
  const { sheets } = getClients();
  const sheetId = env.GOOGLE_SHEET_ID;
  const sheetName = getCurrentMonthSheetName();

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: sheetId,
    range: `'${sheetName}'!A5:J`
  });

  return response.data.values || [];
}

/**
 * Overwrite the entire finance data block (A5:J) to ensure formulas and numbering stay perfectly intact
 * after an edit or delete operation. Clears leftover rows below the new data.
 */
async function overwriteFinanceSheet(newRowsData) {
  const { sheets } = getClients();
  const sheetId = env.GOOGLE_SHEET_ID;
  const sheetName = getCurrentMonthSheetName();

  console.log(`[FINANCE] Overwriting sheet "${sheetName}" with ${newRowsData.length} rows.`);

  // Prepare new values with recalculated No, Saldo, and Nominal+ formulas
  const values = newRowsData.map((tx, index) => {
    const rowNum = 5 + index;
    const prevRow = rowNum - 1;
    
    // tx should be an array: [0:No, 1:Tanggal, 2:Waktu, 3:Tipe, 4:Kategori, 5:Akun, 6:Catatan, 7:Nominal]
    // We recalculate 0(No), 8(Saldo), 9(Nominal+)
    
    const saldoFormula = rowNum === 5 ? `=H${rowNum}` : `=I${prevRow}+H${rowNum}`;
    const nominalPlusFormula = `=IF(D${rowNum}="Pengeluaran";-H${rowNum};0)`;
    
    return [
      index + 1,        // No
      tx[1],            // Tanggal
      tx[2],            // Waktu
      tx[3],            // Tipe
      tx[4],            // Kategori
      tx[5],            // Akun
      tx[6],            // Catatan
      tx[7],            // Nominal (Rp)
      saldoFormula,     // Saldo
      nominalPlusFormula// Nominal (+)
    ];
  });

  // 1. Clear existing data starting from A5 to J1000 (arbitrary large number to clear old data)
  await sheets.spreadsheets.values.clear({
    spreadsheetId: sheetId,
    range: `'${sheetName}'!A5:J1000`
  });

  // 2. Write new data if there is any
  if (values.length > 0) {
    await sheets.spreadsheets.values.update({
      spreadsheetId: sheetId,
      range: `'${sheetName}'!A5:J${5 + values.length - 1}`,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values }
    });
  }
  
  return true;
}



/**
 * Read the Analytics/Summary table from the current month's sheet.
 * Assumes the table is located at L5:S9 based on user specification.
 */
async function getFinanceAnalytics() {
  const { sheets } = getClients();
  const sheetId = env.GOOGLE_SHEET_ID;
  const sheetName = getCurrentMonthSheetName();

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: sheetId,
    range: `'${sheetName}'!L5:S9`
  });

  return response.data.values || [];
}

/**
 * Create a new event in Google Calendar
 */
async function createCalendarEvent(summary, startTime, endTime, description = '', location = '', reminderMinutes = [], recurrence = '', colorId = '') {
  const { calendar } = getClients();

  const requestBody = {
    summary,
    description,
    location,
    start: { dateTime: startTime, timeZone: 'Asia/Jakarta' },
    end: { dateTime: endTime, timeZone: 'Asia/Jakarta' }
  };

  // Add color if provided (Google Calendar colorId: 1-11)
  if (colorId && colorId !== '') {
    requestBody.colorId = String(colorId);
  }

  // Add reminders if provided
  if (reminderMinutes && reminderMinutes.length > 0) {
    requestBody.reminders = {
      useDefault: false,
      overrides: reminderMinutes.map(minutes => ({
        method: 'popup',
        minutes: minutes
      }))
    };
  }

  // Add recurrence if provided (RRULE string)
  if (recurrence) {
    requestBody.recurrence = [recurrence];
  }

  const response = await calendar.events.insert({
    calendarId: env.GOOGLE_CALENDAR_ID || 'primary',
    requestBody
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
 * Update the color of an existing Google Calendar event.
 * Color ID '8' is Graphite/Grey, often used for completed/inactive events.
 */
async function updateCalendarEventColor(eventId, colorId = '8') {
  const { calendar } = getClients();

  const response = await calendar.events.patch({
    calendarId: env.GOOGLE_CALENDAR_ID || 'primary',
    eventId: eventId,
    requestBody: {
      colorId: String(colorId)
    }
  });
  return response.data;
}

/**
 * Find events by summary text (for UPDATE flow when no eventId is known)
 */
async function findEventByTitle(summaryKeyword, daysAhead = 60) {
  const { calendar } = getClients();

  const now = new Date();
  const future = new Date(now.getTime() + daysAhead * 24 * 60 * 60 * 1000);
  const response = await calendar.events.list({
    calendarId: env.GOOGLE_CALENDAR_ID || 'primary',
    timeMin: now.toISOString(),
    timeMax: future.toISOString(),
    q: summaryKeyword,
    singleEvents: true,
    orderBy: 'startTime'
  });
  return response.data.items || [];
}

/**
 * Delete a calendar event.
 * @param {string} eventId - The event ID to delete
 * @param {'THIS_ONLY'|'ALL_FOLLOWING'|'ALL'} mode
 *   - THIS_ONLY (default): delete only this one occurrence
 *   - ALL: delete the master recurring event (removes all future occurrences of the series)
 *   - ALL_FOLLOWING: cut recurrence from this date forward (not used often, reserved)
 */
async function deleteCalendarEvent(eventId, mode = 'THIS_ONLY') {
  const { calendar } = getClients();

  // First, fetch the event to check if it is a recurring event instance
  let targetId = eventId;
  if (mode === 'ALL') {
    try {
      const ev = await calendar.events.get({
        calendarId: env.GOOGLE_CALENDAR_ID || 'primary',
        eventId: eventId
      });
      // If this is a recurring instance, its recurringEventId points to the master event
      if (ev.data.recurringEventId) {
        targetId = ev.data.recurringEventId;
        console.log(`[CALENDAR] Recurring event detected. Deleting master ID: ${targetId}`);
      }
    } catch (e) {
      console.warn('[CALENDAR] Could not fetch event before delete:', e.message);
    }
  }

  await calendar.events.delete({
    calendarId: env.GOOGLE_CALENDAR_ID || 'primary',
    eventId: targetId
  });
  return { deleted: targetId, mode };
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
 * Get events within a specific date range
 */
async function getEventsByDateRange(timeMin, timeMax) {
  const { calendar } = getClients();
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
 * Check for calendar conflicts within a specific time range
 * Returns array of conflicting events
 */
async function checkCalendarConflicts(startTime, endTime, excludeEventId = null) {
  const { calendar } = getClients();
  
  // Expand search window by 1 hour on each side to catch nearby events
  const searchStart = new Date(new Date(startTime).getTime() - 60 * 60 * 1000).toISOString();
  const searchEnd = new Date(new Date(endTime).getTime() + 60 * 60 * 1000).toISOString();

  const response = await calendar.events.list({
    calendarId: env.GOOGLE_CALENDAR_ID || 'primary',
    timeMin: searchStart,
    timeMax: searchEnd,
    singleEvents: true,
    orderBy: 'startTime'
  });

  const events = response.data.items || [];
  const conflicts = [];

  const newStart = new Date(startTime);
  const newEnd = new Date(endTime);

  for (const event of events) {
    // Skip the event we're checking (for updates)
    if (excludeEventId && event.id === excludeEventId) continue;

    const eventStart = new Date(event.start?.dateTime || event.start?.date);
    const eventEnd = new Date(event.end?.dateTime || event.end?.date);

    // Check for overlap: (StartA < EndB) and (EndA > StartB)
    if (newStart < eventEnd && newEnd > eventStart) {
      conflicts.push({
        id: event.id,
        summary: event.summary || '(Tanpa judul)',
        start: eventStart,
        end: eventEnd,
        location: event.location || ''
      });
    }
  }

  return conflicts;
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
 * Read the entire text content of the 2nd Brain Google Doc.
 */
async function readIdeaDoc() {
  const { docs } = getClients();
  const documentId = env.GOOGLE_DOCS_IDEA_ID;
  if (!documentId) return 'Google Docs Idea ID belum dikonfigurasi.';

  const doc = await docs.documents.get({ documentId });
  let textContent = '';
  
  if (doc.data.body && doc.data.body.content) {
    doc.data.body.content.forEach(element => {
      if (element.paragraph && element.paragraph.elements) {
        element.paragraph.elements.forEach(el => {
          if (el.textRun && el.textRun.content) {
            textContent += el.textRun.content;
          }
        });
      }
    });
  }
  return textContent;
}

/**
 * Find and replace text in the Google Doc.
 */
async function editIdeaDoc(keyword, newText) {
  const { docs } = getClients();
  const documentId = env.GOOGLE_DOCS_IDEA_ID;
  if (!documentId) return false;

  await docs.documents.batchUpdate({
    documentId,
    requestBody: {
      requests: [
        {
          replaceAllText: {
            containsText: {
              text: keyword,
              matchCase: false
            },
            replaceText: newText
          }
        }
      ]
    }
  });
  return true;
}

/**
 * Find and delete text in the Google Doc by replacing it with empty string.
 */
async function deleteIdeaDoc(keyword) {
  return await editIdeaDoc(keyword, '');
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

/**
 * Trash all files inside the Google Drive Vault Folder.
 */
async function deleteAllVaultFiles() {
  if (!env.GOOGLE_VAULT_FOLDER_ID) return false;

  const doDeleteWithClient = async (clientDrive) => {
    const res = await clientDrive.files.list({
      q: `'${env.GOOGLE_VAULT_FOLDER_ID}' in parents and trashed = false`,
      fields: 'files(id)'
    });
    const files = res.data.files || [];
    for (const f of files) {
      await clientDrive.files.update({ fileId: f.id, requestBody: { trashed: true } });
    }
    return true;
  };

  try {
    const { drive } = getClients();
    return await doDeleteWithClient(drive);
  } catch (err) {
    console.warn('[DRIVE] Service Account failed to delete vault files. Retrying with OAuth user credentials...');
    try {
      const { drive: oauthDrive } = getOAuthDriveClients();
      return await doDeleteWithClient(oauthDrive);
    } catch (oauthErr) {
      console.error('[DRIVE] OAuth fallback failed to delete vault files:', oauthErr.message);
      return false;
    }
  }
}

/**
 * [PHASE 6 — Pilar 8.1] Get events starting within the next N minutes.
 * Used by the Proximity Alert cron to notify 30 minutes before an event.
 * Only returns events with a specific dateTime (not all-day events).
 * @param {number} withinMinutes - Look-ahead window in minutes (default: 30)
 * @param {number} maxResults - Maximum events to return (default: 3)
 */
async function getUpcomingEvents(withinMinutes = 30, maxResults = 3) {
  const { calendar } = getClients();

  // Use precise UTC now → UTC future window
  const now = new Date();
  const future = new Date(now.getTime() + withinMinutes * 60 * 1000);

  const response = await calendar.events.list({
    calendarId: env.GOOGLE_CALENDAR_ID || 'primary',
    timeMin: now.toISOString(),
    timeMax: future.toISOString(),
    singleEvents: true,
    orderBy: 'startTime',
    maxResults
  });

  // Filter out all-day events (those only have event.start.date, not event.start.dateTime)
  return (response.data.items || []).filter(e => !!e.start?.dateTime);
}

/**
 * [PHASE 6 — Pilar 8.1] Get all events for tomorrow (Jakarta timezone).
 * Used by the Tomorrow Prep cron at 21:00 WIB.
 */
async function getTomorrowEvents() {
  const { calendar } = getClients();

  const jakartaOffsetMs = 7 * 60 * 60 * 1000;
  const nowUtc = new Date();
  const nowJakarta = new Date(nowUtc.getTime() + jakartaOffsetMs);

  // Tomorrow start/end in Jakarta time, then converted back to UTC for the API
  const tomorrowJakarta = new Date(nowJakarta);
  tomorrowJakarta.setDate(tomorrowJakarta.getDate() + 1);
  tomorrowJakarta.setHours(0, 0, 0, 0);
  const tomorrowEndJakarta = new Date(tomorrowJakarta);
  tomorrowEndJakarta.setHours(23, 59, 59, 999);

  const timeMin = new Date(tomorrowJakarta.getTime() - jakartaOffsetMs).toISOString();
  const timeMax = new Date(tomorrowEndJakarta.getTime() - jakartaOffsetMs).toISOString();

  const response = await calendar.events.list({
    calendarId: env.GOOGLE_CALENDAR_ID || 'primary',
    timeMin,
    timeMax,
    singleEvents: true,
    orderBy: 'startTime',
    maxResults: 10
  });

  return response.data.items || [];
}

/**
 * [AUTONOMOUS TIME BLOCKING] Query Google Calendar Free/Busy API.
 */
async function getFreeBusy(timeMin, timeMax) {
  const { calendar } = getClients();
  const calendarId = env.GOOGLE_CALENDAR_ID || 'primary';
  const response = await calendar.freebusy.query({
    requestBody: {
      timeMin,
      timeMax,
      items: [{ id: calendarId }]
    }
  });
  return response.data.calendars[calendarId].busy || [];
}

/**
 * [AUTONOMOUS TIME BLOCKING] Find an empty slot of a given duration.
 * Ensures the slot is within working hours (08:00 - 22:00 Jakarta Time).
 */
async function findEmptySlot(durationMinutes, timeMinIso, timeMaxIso) {
  const busyBlocks = await getFreeBusy(timeMinIso, timeMaxIso);
  busyBlocks.sort((a, b) => new Date(a.start) - new Date(b.start));

  let currentStart = new Date(timeMinIso);
  const maxEnd = new Date(timeMaxIso);
  const durationMs = durationMinutes * 60 * 1000;

  const isValidWorkingHour = (date) => {
    const localUtc = new Date(date.getTime() + 7 * 60 * 60 * 1000);
    const h = localUtc.getUTCHours();
    return h >= 8 && h < 22;
  };

  const adjustToWorkingHours = (date) => {
    let localUtc = new Date(date.getTime() + 7 * 60 * 60 * 1000);
    let h = localUtc.getUTCHours();
    if (h < 8) {
      localUtc.setUTCHours(8, 0, 0, 0);
    } else if (h >= 22) {
      localUtc.setUTCDate(localUtc.getUTCDate() + 1);
      localUtc.setUTCHours(8, 0, 0, 0);
    }
    return new Date(localUtc.getTime() - 7 * 60 * 60 * 1000);
  };

  currentStart = adjustToWorkingHours(currentStart);
  // Optional round up to nearest 30 mins
  if (currentStart.getMinutes() % 30 !== 0) {
    currentStart = new Date(currentStart.getTime() + (30 - currentStart.getMinutes() % 30) * 60 * 1000);
  }

  for (const block of busyBlocks) {
    const blockStart = new Date(block.start);
    const blockEnd = new Date(block.end);

    while (currentStart < blockStart) {
      let candidateEnd = new Date(currentStart.getTime() + durationMs);
      if (candidateEnd <= blockStart && candidateEnd <= maxEnd && isValidWorkingHour(currentStart) && isValidWorkingHour(new Date(candidateEnd.getTime() - 1))) {
        return { start: currentStart.toISOString(), end: candidateEnd.toISOString() };
      }
      currentStart = new Date(currentStart.getTime() + 30 * 60 * 1000);
      currentStart = adjustToWorkingHours(currentStart);
    }

    if (blockEnd > currentStart) {
      currentStart = adjustToWorkingHours(blockEnd);
      if (currentStart.getMinutes() % 30 !== 0) {
        currentStart = new Date(currentStart.getTime() + (30 - currentStart.getMinutes() % 30) * 60 * 1000);
      }
    }
  }

  while (currentStart < maxEnd) {
    let candidateEnd = new Date(currentStart.getTime() + durationMs);
    if (candidateEnd <= maxEnd && isValidWorkingHour(currentStart) && isValidWorkingHour(new Date(candidateEnd.getTime() - 1))) {
      return { start: currentStart.toISOString(), end: candidateEnd.toISOString() };
    }
    currentStart = new Date(currentStart.getTime() + 30 * 60 * 1000);
    currentStart = adjustToWorkingHours(currentStart);
  }

  return null;
}

module.exports = {
  uploadFileToVault,
  deleteAllVaultFiles,
  extractOcrTextViaDriveOcr,
  appendFinanceRow,
  getFinanceSummary,
  getFinanceAnalytics,
  getAllFinanceRows,
  overwriteFinanceSheet,
  createCalendarEvent,
  updateCalendarEvent,
  findEventByTitle,
  deleteCalendarEvent,
  getTodaysEvents,
  getEventsByDateRange,
  checkCalendarConflicts,
  appendToIdeaDoc,
  readIdeaDoc,
  editIdeaDoc,
  deleteIdeaDoc,
  findSpreadsheetByTitle,
  createGenericSpreadsheet,
  getSpreadsheetHeaders,
  appendGenericRow,
  deleteGenericSpreadsheet,
  updateCalendarEventColor,
  getUpcomingEvents,   // [PHASE 6] Proximity Alert
  getTomorrowEvents,   // [PHASE 6] Tomorrow Prep
  getFreeBusy,
  findEmptySlot
  // Note: raw clients (sheets, calendar, docs, drive) not exported.
  // Use the functions above. Clients are lazy-initialized via getClients().
};
