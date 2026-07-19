// ============================================================
// N.E.X.A — TASKER INFRASTRUCTURE CLIENT
// Outbound Client untuk berkomunikasi dari N.E.X.A Core Server (HF Space)
// menuju perangkat Android Tuan Faqih (Tasker & ntfy.sh Gateway).
// ============================================================
'use strict';

const axios = require('axios');
const env = require('../config/env');
const security = require('../utils/security');

/**
 * Cek apakah ntfy.sh push gateway sudah dikonfigurasi di .env
 * @returns {boolean}
 */
function isNtfyConfigured() {
  return Boolean(env.NTFY_TOPIC && String(env.NTFY_TOPIC).trim() !== '');
}

/**
 * Cek apakah direct webhook Tasker sudah dikonfigurasi di .env
 * @returns {boolean}
 */
function isDirectWebhookConfigured() {
  return Boolean(env.TASKER_WEBHOOK_URL && String(env.TASKER_WEBHOOK_URL).trim() !== '');
}

/**
 * Cek apakah ada minimal satu jalur koneksi ke Tasker/Android (ntfy atau direct)
 * @returns {boolean}
 */
function isConfigured() {
  return isNtfyConfigured() || isDirectWebhookConfigured();
}

/**
 * Mengirim notifikasi push instan ke Android via ntfy.sh.
 * Sangat ideal untuk eksekusi sub-detik dan menembus mode Do Not Disturb (DND).
 * 
 * @param {string} message - Isi pesan notifikasi
 * @param {Object} [options] - Opsi header tambahan
 * @param {string} [options.title='N.E.X.A Alert'] - Judul notifikasi
 * @param {string} [options.priority='default'] - Prioritas ('min', 'low', 'default', 'high', 'urgent')
 * @param {string} [options.tags='robot'] - Tag/emoji untuk ntfy (misal: 'warning,skull')
 * @returns {Promise<boolean>} true jika berhasil, false jika gagal
 */
async function pushNtfy(message, options = {}) {
  if (!isNtfyConfigured()) {
    console.warn('[TASKER CLIENT] NTFY_TOPIC not configured. Push via ntfy.sh disabled.');
    return false;
  }

  const {
    title = 'N.E.X.A Alert',
    priority = 'default',
    tags = 'robot'
  } = options;

  const startTime = Date.now();
  const summaryMsg = message.length > 80 ? message.substring(0, 80) + '...' : message;
  console.log(`📡 [NTFY PUSH] Sending to topic "${env.NTFY_TOPIC}" | Title: "${title}" | Tags: [${tags}] | Preview: "${summaryMsg}"`);

  try {
    await axios.post(`https://ntfy.sh/${env.NTFY_TOPIC}`, message, {
      headers: {
        'Title': title,
        'Priority': priority,
        'Tags': tags
      },
      timeout: 5000
    });
    const elapsed = Date.now() - startTime;
    console.log(`📡 [NTFY PUSH] Push delivered successfully in ${elapsed}ms!`);
    return true;
  } catch (err) {
    console.error(`❌ [NTFY PUSH ERROR] Failed to send push after ${Date.now() - startTime}ms:`, err.message);
    return false;
  }
}

/**
 * Mengirim payload HTTP langsung ke endpoint Tasker (AutoRemote / ngrok / direct webhook).
 * Otomatis melampirkan HMAC SHA-256 signature pada header X-NEXA-Signature & Bearer Token.
 * 
 * @param {Object} commandPayload - Objek perintah untuk Tasker (misal: { type: 'GOD_MODE_ESCALATION', level: 3, actions: [...] })
 * @param {Object} [metadata={}] - Metadata kontekstual tambahan
 * @param {Object} [options={}] - Opsi tambahan (level eskalasi, timestamp kustom)
 * @param {number} [options.level=1] - Level eskalasi untuk HMAC signature
 * @param {string} [options.timestamp] - ISO timestamp (jika kosong, menggunakan waktu sekarang)
 * @returns {Promise<boolean>} true jika berhasil, false jika gagal
 */
async function sendDirectCommand(commandPayload, metadata = {}, options = {}) {
  if (!isDirectWebhookConfigured()) {
    return false;
  }

  const level = options.level || commandPayload?.level || 1;
  const timestamp = options.timestamp || new Date().toISOString();
  const signature = security.generateTaskerSignature(timestamp, level);

  const payload = {
    auth: {
      bearer_token: env.NEXA_GODMODE_SECRET,
      timestamp: timestamp
    },
    command: commandPayload,
    metadata: metadata
  };

  try {
    await axios.post(env.TASKER_WEBHOOK_URL, payload, {
      headers: {
        'Authorization': `Bearer ${env.NEXA_GODMODE_SECRET}`,
        'Content-Type': 'application/json',
        'X-NEXA-Signature': signature
      },
      timeout: 5000
    });
    return true;
  } catch (err) {
    console.warn('[TASKER CLIENT] Direct Tasker push failed:', err.message);
    return false;
  }
}

/**
 * Mengirimkan tindakan sistem standar ke Tasker (misal: mematikan Wi-Fi, menyalakan alarm, dll.)
 * Menggunakan pushNtfy (Primer) dan sendDirectCommand (Tersier/Fallback).
 * 
 * @param {string} actionType - Nama aksi (misal: 'DISABLE_WIFI', 'SET_ALARM')
 * @param {Object} [params={}] - Parameter aksi
 * @param {Object} [options={}] - Opsi push
 * @returns {Promise<{ ntfySent: boolean, directSent: boolean }>} Status pengiriman
 */
async function sendSystemAction(actionType, params = {}, options = {}) {
  const {
    title = `N.E.X.A Action: ${actionType}`,
    priority = 'high',
    tags = 'gear',
    level = 1
  } = options;

  const ntfyMessage = `[ACTION] ${actionType}\n${JSON.stringify(params, null, 2)}`;
  const ntfySent = await pushNtfy(ntfyMessage, { title, priority, tags });

  const directSent = await sendDirectCommand({
    type: 'SYSTEM_ACTION',
    level: level,
    actions: [{ action: actionType, params }]
  }, {}, { level });

  return { ntfySent, directSent };
}

module.exports = {
  isConfigured,
  isNtfyConfigured,
  isDirectWebhookConfigured,
  pushNtfy,
  sendDirectCommand,
  sendSystemAction
};
