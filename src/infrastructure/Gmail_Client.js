const { google } = require('googleapis');
const env = require('../config/env');

let gmailClient = null;

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

      // Extract body snippet
      const snippet = msgData.data.snippet;

      emails.push({
        id: msg.id,
        from,
        subject,
        date,
        snippet
      });
    }

    return emails;
  } catch (error) {
    console.error('[GMAIL] Error reading emails:', error.message);
    return [];
  }
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

module.exports = {
  getLatestEmails,
  deleteEmail,
  sendEmail
};
