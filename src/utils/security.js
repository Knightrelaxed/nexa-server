const crypto = require('crypto');
const env = require('../config/env');

function safeEqual(a, b) {
  const aBuf = Buffer.from(String(a || ''), 'utf8');
  const bBuf = Buffer.from(String(b || ''), 'utf8');
  if (aBuf.length !== bBuf.length) return false;
  return crypto.timingSafeEqual(aBuf, bBuf);
}

/**
 * Middleware to ensure requests to /webhook/telegram 
 * only come from the authorized chat ID (Tuan Faqih).
 * Note: Telegram webhooks don't send headers easily, so we check the body.
 */
function telegramIdentityLock(req, res, next) {
  // Telegram update structure: req.body.message.chat.id
  const chat = req.body?.message?.chat || req.body?.callback_query?.message?.chat;
  
  if (!chat || !chat.id) {
    // Drop silent if invalid structure
    return res.status(400).send('Bad Request');
  }

  // Convert both to string for safe comparison
  if (String(chat.id) !== String(env.TELEGRAM_CHAT_ID)) {
    console.warn(`[SECURITY] Unauthorized Telegram access attempt from Chat ID: ${chat.id}`);
    return res.status(403).send('Forbidden: Identity Lock Active');
  }

  next();
}

/**
 * Optional Telegram webhook header verification.
 * If TELEGRAM_WEBHOOK_SECRET_TOKEN is configured, enforce exact match.
 * Header name from Telegram: X-Telegram-Bot-Api-Secret-Token
 */
function telegramWebhookSecret(req, res, next) {
  const configuredSecret = String(env.TELEGRAM_WEBHOOK_SECRET_TOKEN || '').trim();
  if (!configuredSecret) return next();

  const provided = String(req.headers['x-telegram-bot-api-secret-token'] || '').trim();
  if (!provided || !safeEqual(provided, configuredSecret)) {
    console.warn('[SECURITY] Rejected Telegram webhook: invalid secret token header.');
    return res.status(403).send('Forbidden');
  }

  next();
}

/**
 * Middleware to protect incoming webhooks (from Tasker → N.E.X.A HF Space)
 * Requires 'Authorization: Bearer <SECRET_TOKEN>' header
 */
function webhookAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  const configuredSecret = String(env.NEXA_GODMODE_SECRET || '').trim();

  if (!configuredSecret) {
    console.error('[SECURITY] NEXA_GODMODE_SECRET is missing. Rejecting webhook request.');
    return res.status(500).json({ error: 'Server webhook auth not configured' });
  }
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or invalid Authorization header' });
  }

  const token = String(authHeader.slice('Bearer '.length)).trim();
  
  if (!token || !safeEqual(token, configuredSecret)) {
    console.warn(`[SECURITY] Unauthorized webhook attempt with invalid token`);
    return res.status(403).json({ error: 'Forbidden: Invalid token' });
  }

  next();
}

/**
 * Utility to generate HMAC signature for outgoing requests to Tasker
 * @param {string} timestamp - ISO timestamp string
 * @param {number} level - Escalation level
 * @returns {string} HMAC SHA-256 signature
 */
function generateTaskerSignature(timestamp, level) {
  const payload = `${timestamp}${level}${env.NEXA_GODMODE_SECRET}`;
  return crypto.createHmac('sha256', env.NEXA_GODMODE_SECRET)
               .update(payload)
               .digest('hex');
}

module.exports = {
  telegramIdentityLock,
  telegramWebhookSecret,
  webhookAuth,
  generateTaskerSignature
};
