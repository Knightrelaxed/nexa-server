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
  // Telegram update structures may be: message, edited_message, channel_post, callback_query, etc.
  const chat =
    req.body?.message?.chat ||
    req.body?.edited_message?.chat ||
    req.body?.channel_post?.chat ||
    req.body?.edited_channel_post?.chat ||
    req.body?.callback_query?.message?.chat;
  
  if (!chat || !chat.id) {
    // Non-message updates are valid from Telegram; acknowledge to avoid retries/spam.
    return res.status(200).send('OK');
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
 * Middleware to protect incoming CLI webhooks (from nexa-cli)
 * Requires 'Authorization: Bearer <NEXA_CLI_SECRET>' header
 */
function cliAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  const configuredSecret = String(env.NEXA_CLI_SECRET || '').trim();

  if (!configuredSecret) {
    console.error('[SECURITY] NEXA_CLI_SECRET is missing. Rejecting CLI webhook request.');
    return res.status(500).json({ error: 'Server CLI auth not configured' });
  }
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or invalid Authorization header' });
  }

  const token = String(authHeader.slice('Bearer '.length)).trim();
  
  if (!token || !safeEqual(token, configuredSecret)) {
    console.warn(`[SECURITY] Unauthorized CLI webhook attempt with invalid token`);
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

/**
 * Security Guard to ensure WhatsApp messages ONLY come from Tuan Faqih (authorized owner).
 * Works both as direct validator function (returning boolean) and as Express/WebSocket middleware.
 * @param {Object|string} messageOrReq - WhatsApp message object, sender JID string, or Express req object.
 * @param {Object} [res] - Express res object (if used as HTTP middleware).
 * @param {Function} [next] - Express next function (if used as HTTP middleware).
 * @returns {boolean|void} True if authorized, False (or HTTP 403) if rejected.
 */
function whatsappIdentityLock(messageOrReq, res, next) {
  let senderJid = '';

  if (typeof messageOrReq === 'string') {
    senderJid = messageOrReq;
  } else if (messageOrReq?.key) {
    // BUGFIX: Always check participant first for WhatsApp Group messages
    senderJid = messageOrReq.key.participant || messageOrReq.key.remoteJid || '';
  } else if (messageOrReq?.body) {
    const b = messageOrReq.body;
    senderJid = b.message?.key?.participant || b.message?.key?.remoteJid || b.participant || b.remoteJid || '';
  }

  const cleanSender = String(senderJid || '').trim().toLowerCase();
  const cleanNumber = cleanSender.replace(/@.*$/, '').replace(/[^0-9]/g, '');

  const ownerJid = String(env.WHATSAPP_OWNER_JID || '').trim().toLowerCase();
  const ownerNumber = String(env.WHATSAPP_OWNER_NUMBER || '').trim().replace(/[^0-9]/g, '');

  if (cleanSender.includes('status@broadcast')) {
    if (res && typeof res.status === 'function') return res.status(200).send('OK');
    return false;
  }

  if (!ownerJid && !ownerNumber) {
    console.warn('[SECURITY] whatsappIdentityLock triggered but WHATSAPP_OWNER_JID/NUMBER is not set in env.');
    if (res && typeof res.status === 'function') return res.status(403).send('Forbidden: WhatsApp owner not configured');
    return false;
  }

  const isAuthorized =
    (ownerJid && cleanSender === ownerJid) ||
    (ownerNumber && cleanNumber === ownerNumber);

  if (!isAuthorized) {
    console.warn(`[SECURITY] Unauthorized WhatsApp access attempt blocked from sender: ${cleanSender || 'UNKNOWN'}`);
    if (res && typeof res.status === 'function') return res.status(403).send('Forbidden: Identity Lock Active');
    return false;
  }

  if (typeof next === 'function') return next();
  return true;
}

module.exports = {
  telegramIdentityLock,
  whatsappIdentityLock,
  telegramWebhookSecret,
  webhookAuth,
  cliAuth,
  generateTaskerSignature
};
