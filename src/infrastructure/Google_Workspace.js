const { google } = require('googleapis');
const env = require('../config/env');
const fs = require('fs');

const SCOPES = [
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
  const jakartaDateStr = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' });
  const timeMin = `${jakartaDateStr}T00:00:00+07:00`;
  const timeMax = `${jakartaDateStr}T23:59:59+07:00`;

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
 * Helper: Get all calendar events scheduled for tomorrow (Jakarta Timezone aware)
 */
async function getTomorrowsEvents() {
  const { calendar } = getClients();
  
  // Add 24 hours to current time and format as Jakarta date
  const tmrwDateStr = new Date(Date.now() + 86400000).toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' });
  
  const timeMin = `${tmrwDateStr}T00:00:00+07:00`;
  const timeMax = `${tmrwDateStr}T23:59:59+07:00`;

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

    while (currentStart < blockStart && currentStart < maxEnd) {
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
  createCalendarEvent,
  updateCalendarEvent,
  findEventByTitle,
  deleteCalendarEvent,
  getTodaysEvents,
  getTomorrowsEvents,
  getEventsByDateRange,
  checkCalendarConflicts,
  appendToIdeaDoc,
  readIdeaDoc,
  editIdeaDoc,
  deleteIdeaDoc,
  updateCalendarEventColor,
  getUpcomingEvents,   // [PHASE 6] Proximity Alert
  getTomorrowEvents,   // [PHASE 6] Tomorrow Prep
  getFreeBusy,
  findEmptySlot
  // Note: raw clients (sheets, calendar, docs, drive) not exported.
  // Use the functions above. Clients are lazy-initialized via getClients().
};
