// ============================================================
// N.E.X.A — FACADE WEBHOOK ROUTER (Zero-Loss Surgical Protocol)
// Router utama untuk semua endpoint /webhook/*
// Membagi lalu lintas ke adapter terisolasi per platform tanpa
// mengubah kontrak eksternal atau memecahkan impor eksisting.
// ============================================================
'use strict';

const express = require('express');
const router = express.Router();
const security = require('../utils/security');

// Adapters
const { handleTelegramWebhook } = require('./telegram/adapter');
const { handleCliWebhook, handleCliStream } = require('./cli/adapter');
const { handleGmailWebhook } = require('./gmail/adapter');

// Outbound Actions (di-export ulang demi backward compatibility)
const {
  sendTelegramOutbound,
  sendIdentityProposalToTelegram,
  sendEveningBriefing,
  sendTelegramQrDelivery
} = require('./telegram/actions');

// ============================================================
// ENDPOINT ROUTING
// ============================================================

// 1. Telegram Webhook & Callback Query Handler
router.post('/telegram', security.telegramWebhookSecret, security.telegramIdentityLock, handleTelegramWebhook);

// 2. Gmail Webhook (Google Cloud Pub/Sub -> N.E.X.A Server)
router.post('/gmail', handleGmailWebhook);

// 4. CLI Remote Interface (Laptop manapun → N.E.X.A Server HF)
// Dilindungi oleh Bearer + NEXA_CLI_SECRET
router.post('/cli', security.cliAuth, handleCliWebhook);
router.get('/cli/stream', security.cliAuth, handleCliStream); // SSE Push Channel

// 5. WhatsApp Login & Logout Webhooks (Fase 4 Coupling)
router.post('/wa-login', security.webhookAuth, async (req, res) => {
  try {
    const waAdapter = require('./whatsapp/adapter');
    res.status(200).json({ status: 'booting', message: 'Memuat sesi baru WhatsApp dan mengirimkan foto QR ke Telegram...' });
    await waAdapter.startWhatsAppSocket({ forceNewSession: true });
  } catch (err) {
    console.error('[WEBHOOK-WA-LOGIN] Error starting WhatsApp socket:', err.message);
    if (!res.headersSent) res.status(500).json({ status: 'error', error: err.message });
  }
});

router.post('/wa-logout', security.webhookAuth, async (req, res) => {
  try {
    const waAdapter = require('./whatsapp/adapter');
    await waAdapter.logoutWhatsAppSession();
    res.status(200).json({ status: 'success', message: 'Sesi WhatsApp berhasil diputuskan dan dibersihkan.' });
  } catch (err) {
    console.error('[WEBHOOK-WA-LOGOUT] Error logging out WhatsApp:', err.message);
    if (!res.headersSent) res.status(500).json({ status: 'error', error: err.message });
  }
});

// 6. Mobile Bridge Remote Command Dispatcher
router.post('/bridge/command', security.cliAuth, async (req, res) => {
  try {
    const { action, params } = req.body;
    const adapter = require('./mobile_bridge/adapter');
    const result = await adapter.execute(action, params || {});
    res.status(200).json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/bridge/simulate-call', security.cliAuth, async (req, res) => {
  try {
    const { callerName, message, playRingtone } = req.body;
    const adapter = require('./mobile_bridge/adapter');
    const result = await adapter.simulateIncomingCall(
      callerName || 'N.E.X.A Assistant',
      message || 'Tuan Faqih, ada interupsi penting dari N.E.X.A.',
      playRingtone !== undefined ? playRingtone : true
    );
    res.status(200).json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// EXPORTS
// ============================================================
module.exports = router;
module.exports.sendTelegramOutbound = sendTelegramOutbound;
module.exports.sendIdentityProposalToTelegram = sendIdentityProposalToTelegram;
module.exports.sendEveningBriefing = sendEveningBriefing;
module.exports.sendTelegramQrDelivery = sendTelegramQrDelivery;
