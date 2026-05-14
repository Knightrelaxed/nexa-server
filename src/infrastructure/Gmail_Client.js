const { google } = require('googleapis');
const env = require('../config/env');

let gmailClient = null;
let _invalidGrantAlerted = false; // Prevent spamming Telegram with the same alert

function decodeBase64Url(data = '') {
  if (!data) return '';
  try {
    const normalized = String(data).replace(/-/g, '+').replace(/_/g, '/');
    return Buffer.from(normalized, 'base64').toString('utf8');
  } catch (_) {
    return '';
  }
}

function extractTextParts(payload) {
  if (!payload) return '';

  const mimeType = String(payload.mimeType || '').toLowerCase();
  if (payload.body?.data && (mimeType.startsWith('text/plain') || mimeType.startsWith('text/html'))) {
    const raw = decodeBase64Url(payload.body.data);
    if (mimeType.startsWith('text/html')) {
      return raw.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    }
    return raw.replace(/\s+/g, ' ').trim();
  }

  const parts = Array.isArray(payload.parts) ? payload.parts : [];
  for (const part of parts) {
    const found = extractTextParts(part);
    if (found) return found;
  }

  return '';
}

function getGmailClient() {
  if (gmailClient) return gmailClient;

  if (!env.GMAIL_CLIENT_ID || !env.GMAIL_CLIENT_SECRET || !env.GMAIL_REFRESH_TOKEN) {
    console.error('[GMAIL] OAuth2 Credentials not fully configured in .env');
    return null;
  }

  const oauth2Client = new google.auth.OAuth2(
    env.GMAIL_CLIENT_ID,
    env.GMAIL_CLIENT_SECRET,
    'http://localhost:3000/oauth2callback'
  );

  oauth2Client.setCredentials({
    refresh_token: env.GMAIL_REFRESH_TOKEN
  });

  gmailClient = google.gmail({ version: 'v1', auth: oauth2Client });
  console.log('[GMAIL] Auth Client initialized using Refresh Token.');
  
  return gmailClient;
}

/**
 * Read latest emails matching a query.
 * @param {string} query Search query (e.g. 'from:no-reply@bankmandiri.co.id')
 * @param {number} maxResults 
 */
async function getLatestEmails(query = '', maxResults = 5) {
  const gmail = getGmailClient();
  if (!gmail) return [];

  let retries = 3;
  while (retries > 0) {
    try {
      const res = await gmail.users.messages.list({
        userId: 'me',
        q: query,
        maxResults
      });

      const messages = res.data.messages || [];
      const emails = [];

      for (const msg of messages) {
        const msgData = await gmail.users.messages.get({
          userId: 'me',
          id: msg.id,
          format: 'full'
        });
        
        const payload = msgData.data.payload;
        const headers = payload.headers;
        
        const subject = headers.find(h => h.name.toLowerCase() === 'subject')?.value || 'No Subject';
        const from = headers.find(h => h.name.toLowerCase() === 'from')?.value || 'Unknown';
        const date = headers.find(h => h.name.toLowerCase() === 'date')?.value || '';

        const snippet = msgData.data.snippet;
        const body = extractTextParts(payload);

        emails.push({
          id: msg.id,
          from,
          subject,
          date,
          snippet,
          body
        });
      }

      return emails; // Success!
    } catch (error) {
      console.error(`[GMAIL] Error reading emails (Retries left: ${retries - 1}):`, error.message);

      // Detect expired/revoked OAuth2 refresh token
      if (error.message && error.message.includes('invalid_grant')) {
        console.error('[GMAIL] ❌ CRITICAL: Refresh Token is EXPIRED or REVOKED. Email polling is dead until token is refreshed.');
        // Reset cached client so a new token (if updated via env) can take effect
        gmailClient = null;
        // Send one-time Telegram alert
        if (!_invalidGrantAlerted) {
          _invalidGrantAlerted = true;
          try {
            const { sendTelegramOutbound } = require('../interfaces/webhook');
            await sendTelegramOutbound(
              '🔴 <b>ALERT: Gmail OAuth Token Expired!</b>\n\n' +
              'N.E.X.A tidak dapat mengakses email Tuan karena Refresh Token OAuth2 telah kadaluarsa.\n\n' +
              '<b>Solusi:</b> Generate refresh token baru dengan menjalankan <code>node generate_token.js</code>, lalu update di HF Secrets → <code>GMAIL_REFRESH_TOKEN</code> dan restart Space.'
            );
          } catch (_) { /* best effort */ }
        }
        return []; // Don't retry — it will always fail until token is replaced
      }

      retries--;
      if (retries === 0) return [];
      await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2s before retry
    }
  }
  return [];
}

/**
 * Delete a specific email by ID
 */
async function deleteEmail(messageId) {
  const gmail = getGmailClient();
  if (!gmail) return false;

  try {
    await gmail.users.messages.trash({
      userId: 'me',
      id: messageId
    });
    return true;
  } catch (error) {
    console.error('[GMAIL] Error deleting email:', error.message);
    return false;
  }
}

/**
 * Send an email
 */
async function sendEmail(to, subject, textContent) {
  const gmail = getGmailClient();
  if (!gmail) return false;

  try {
    const utf8Subject = `=?utf-8?B?${Buffer.from(subject).toString('base64')}?=`;
    const messageParts = [
      `To: ${to}`,
      'Content-Type: text/plain; charset=utf-8',
      'MIME-Version: 1.0',
      `Subject: ${utf8Subject}`,
      '',
      textContent
    ];
    const message = messageParts.join('\n');
    const encodedMessage = Buffer.from(message)
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');

    await gmail.users.messages.send({
      userId: 'me',
      requestBody: {
        raw: encodedMessage
      }
    });
    return true;
  } catch (error) {
    console.error('[GMAIL] Error sending email:', error.message);
    return false;
  }
}

/**
 * Enable Gmail Push Notifications via Pub/Sub
 */
async function watchMailbox(topicName) {
  const gmail = getGmailClient();
  if (!gmail) return false;

  try {
    const res = await gmail.users.watch({
      userId: 'me',
      requestBody: {
        labelIds: ['INBOX'],
        labelFilterAction: 'include',
        topicName: topicName // e.g. 'projects/YOUR_PROJECT_ID/topics/YOUR_TOPIC_NAME'
      }
    });
    console.log('[GMAIL] Watch initiated successfully:', res.data);
    return res.data;
  } catch (error) {
    console.error('[GMAIL] Error initiating watch:', error.message);
    return false;
  }
}

/**
 * Reset the cached Gmail client (e.g. after updating refresh token at runtime).
 */
function resetGmailClient() {
  gmailClient = null;
  _invalidGrantAlerted = false;
  console.log('[GMAIL] Client reset. Will re-initialize on next call.');
}

module.exports = {
  getLatestEmails,
  deleteEmail,
  sendEmail,
  watchMailbox,
  resetGmailClient
};
