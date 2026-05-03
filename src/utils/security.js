const crypto = require('crypto');
const env = require('../config/env');

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
 * Middleware to protect incoming webhooks (from Tasker → N.E.X.A HF Space)
 * Requires 'Authorization: Bearer <SECRET_TOKEN>' header
 */
function webhookAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or invalid Authorization header' });
  }

  const token = authHeader.split(' ')[1];
  
  if (token !== env.NEXA_GODMODE_SECRET) {
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
  webhookAuth,
  generateTaskerSignature
};
