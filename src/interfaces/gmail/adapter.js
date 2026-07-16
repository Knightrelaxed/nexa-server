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
  // AUDIT FIX (CRITICAL-1): Require a secret token query param to prevent unauthorized
  // API quota drain. Add ?token=<NEXA_GODMODE_SECRET> to the Pub/Sub push URL in GCP.
  const providedToken = String(req.query?.token || '').trim();
  const expectedToken = String(env.NEXA_GODMODE_SECRET || '').trim();
  if (!expectedToken) {
    console.error('[GMAIL WEBHOOK] NEXA_GODMODE_SECRET not configured — rejecting request.');
    return res.status(500).send('Server auth not configured');
  }
  const tokA = Buffer.from(providedToken, 'utf8');
  const tokB = Buffer.from(expectedToken, 'utf8');
  const isValidToken = tokA.length === tokB.length && timingSafeEqual(tokA, tokB);
  if (!isValidToken) {
    console.warn('[GMAIL WEBHOOK] Rejected: invalid or missing token query param.');
    return res.status(403).send('Forbidden');
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
