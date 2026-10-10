// ============================================================
// N.E.X.A — GMAIL ADAPTER
// Menangani Google Cloud Pub/Sub push notifications untuk Gmail Auto-Sync
// Path lama: src/interfaces/webhook.js (lines 3303-3342)
// Path baru: src/interfaces/gmail/adapter.js
// ============================================================
'use strict';

const env = require('../../config/env');
const { timingSafeEqual } = require('crypto');

async function handleGmailWebhook(req, res) {
  // Support Authorization: Bearer <token> header or ?token=<secret> query param
  const authHeader = req.headers.authorization;
  const headerToken = authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;
  const providedToken = headerToken || String(req.query?.token || '').trim();
  const primaryToken = String(env.GMAIL_WEBHOOK_SECRET || '').trim();
  const fallbackToken = String(env.NEXA_GODMODE_SECRET || '').trim();

  if (!primaryToken && !fallbackToken) {
    console.error('[GMAIL WEBHOOK] Neither GMAIL_WEBHOOK_SECRET nor NEXA_GODMODE_SECRET configured — rejecting request.');
    return res.status(500).send('Server auth not configured');
  }

  const checkMatch = (target) => {
    if (!target) return false;
    const tokA = Buffer.from(providedToken, 'utf8');
    const tokB = Buffer.from(target, 'utf8');
    return tokA.length === tokB.length && timingSafeEqual(tokA, tokB);
  };

  const isPrimaryValid = checkMatch(primaryToken);
  const isFallbackValid = !isPrimaryValid && checkMatch(fallbackToken);

  if (!isPrimaryValid && !isFallbackValid) {
    console.warn('[GMAIL WEBHOOK] Rejected: invalid or missing token authentication.');
    return res.status(403).send('Forbidden');
  }

  if (isFallbackValid) {
    console.warn('[GMAIL WEBHOOK] Note: Authenticated via legacy NEXA_GODMODE_SECRET fallback. Please update GCP Pub/Sub to GMAIL_WEBHOOK_SECRET.');
  }

  // Google Pub/Sub sends data in req.body.message
  if (!req.body || !req.body.message) {
    return res.status(400).send('Invalid Pub/Sub payload');
  }

  console.log('[GMAIL WEBHOOK] Received authenticated push notification from Pub/Sub');

  // Acknowledge the webhook immediately so Google doesn't retry
  res.status(200).send('OK');

  try {
    const financeEngine = require('../../domain/Finance_Engine');
    // Instantly trigger polling logic without waiting for the 3-minute cron
    const count = await financeEngine.pollFinanceEmails();
    if (count > 0) {
      console.log(`[GMAIL WEBHOOK] Instantly processed ${count} new Auto-Sync transactions.`);
    }
  } catch (err) {
    console.error('[GMAIL WEBHOOK] Error processing instant poll:', err.message);
  }
}

module.exports = { handleGmailWebhook };
