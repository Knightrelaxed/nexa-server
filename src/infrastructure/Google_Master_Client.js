const { google } = require('googleapis');
const env = require('../config/env');

let _oauth2Client = null;
const _serviceClients = {};
let _invalidGrantAlerted = false;

/**
 * Singleton OAuth2 Auth Client
 * Automatically manages access_token lifetime and transparent background refreshes.
 */
function getOAuth2Client() {
  if (_oauth2Client) return _oauth2Client;

  const clientId = env.GOOGLE_CLIENT_ID || env.GMAIL_CLIENT_ID;
  const clientSecret = env.GOOGLE_CLIENT_SECRET || env.GMAIL_CLIENT_SECRET;
  const refreshToken = env.GOOGLE_MASTER_REFRESH_TOKEN || env.GMAIL_REFRESH_TOKEN || env.TASKS_REFRESH_TOKEN;

  if (!clientId || !clientSecret || !refreshToken) {
    console.warn('[GOOGLE_MASTER] Kredensial Master OAuth 2.0 belum lengkap di .env');
    return null;
  }

  _oauth2Client = new google.auth.OAuth2(
    clientId,
    clientSecret,
    'http://localhost:3000/oauth2callback'
  );

  _oauth2Client.setCredentials({ refresh_token: refreshToken });

  // Listener jika Google melakukan rotasi refresh token otomatis
  _oauth2Client.on('tokens', (tokens) => {
    if (tokens.refresh_token) {
      console.log('[GOOGLE_MASTER] 🔄 Refresh token baru diterima dari Google.');
    }
  });

  return _oauth2Client;
}

/**
 * Lazy Service Factory
 * Builds Google API client instances on-demand (0ms startup overhead, <170MB RAM).
 */
function _getServiceClient(serviceName, version) {
  const key = `${serviceName}_${version}`;
  if (_serviceClients[key]) return _serviceClients[key];

  const auth = getOAuth2Client();
  if (!auth) return null;

  _serviceClients[key] = google[serviceName]({ version, auth });
  return _serviceClients[key];
}

/**
 * Circuit Breaker & Proactive Security Alerting
 */
async function handleAuthError(error, context = '') {
  if (!error) return;
  const errMsg = error.message || String(error);

  if (errMsg.includes('invalid_grant') && !_invalidGrantAlerted) {
    _invalidGrantAlerted = true;
    console.error(`[GOOGLE_MASTER] 🚨 FATAL: Master Refresh Token revoked/expired in (${context}).`);
    try {
      const { sendTelegramOutbound } = require('../interfaces/webhook');
      await sendTelegramOutbound(
        '⚠️ <b>Peringatan Keamanan N.E.X.A:</b>\n\n' +
        'Kredensial Google Master OAuth telah kedaluwarsa atau dicabut oleh pengguna.\n' +
        '<i>Silakan jalankan skrip otorisasi ulang di terminal untuk memperbarui akses.</i>'
      );
    } catch (_) {}
  }
}

/**
 * Transparent Retry Helper with Exponential Backoff & Jitter
 */
async function withRetry(operationFn, { maxRetries = 3, context = 'GoogleAPI' } = {}) {
  let attempt = 0;
  while (attempt < maxRetries) {
    try {
      return await operationFn();
    } catch (err) {
      attempt++;
      await handleAuthError(err, context);

      const isRateLimit = err.status === 429 || err.code === 429 || (err.message && err.message.includes('rateLimitExceeded'));
      const isTransient = err.status >= 500 || err.code === 'ECONNRESET' || err.code === 'ETIMEDOUT';

      if ((isRateLimit || isTransient) && attempt < maxRetries) {
        const jitter = Math.floor(Math.random() * 500);
        const delayMs = Math.pow(2, attempt) * 1000 + jitter;
        console.warn(`[GOOGLE_MASTER] ${context} error (${err.message}). Retrying attempt ${attempt}/${maxRetries} in ${delayMs}ms...`);
        await new Promise(res => setTimeout(res, delayMs));
        continue;
      }
      throw err;
    }
  }
}

module.exports = {
  getAuthClient: getOAuth2Client,
  getGmail: () => _getServiceClient('gmail', 'v1'),
  getCalendar: () => _getServiceClient('calendar', 'v3'),
  getTasks: () => _getServiceClient('tasks', 'v1'),
  getDrive: () => _getServiceClient('drive', 'v3'),
  getDocs: () => _getServiceClient('docs', 'v1'),
  getSheets: () => _getServiceClient('sheets', 'v4'),
  getSlides: () => _getServiceClient('slides', 'v1'),
  getPeople: () => _getServiceClient('people', 'v1'),
  getYouTube: () => _getServiceClient('youtube', 'v3'),
  handleAuthError,
  withRetry
};
