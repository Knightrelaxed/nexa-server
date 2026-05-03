const axios = require('axios');
const env = require('../config/env');
const security = require('../utils/security');

/**
 * Trigger God Mode Escalation to Android Device (Tasker)
 * 
 * PRIMARY CHANNEL: Telegram notification → Tasker AutoNotification Intercept
 * Server kirim "🔴 GOD MODE AKTIF" via Telegram → Tasker mencegat → eksekusi punishment
 * 
 * SECONDARY CHANNEL (optional): Direct HTTP POST ke TASKER_WEBHOOK_URL
 * Membutuhkan AutoRemote atau layanan sejenis. Boleh dikosongkan.
 * 
 * @param {number} level - Escalation level (e.g. 3)
 * @param {object} metadata - Details about violation
 */
async function triggerGodMode(level = 3, metadata = {}) {
  console.log(`[DISCIPLINE] Triggering God Mode (Level ${level})...`);
  let telegramSent = false;

  // ============================================================
  // JALUR 1 (UTAMA): Telegram Notification → Tasker Intercept
  // Tasker profile: AutoNotification Intercept → teks "🔴 GOD MODE AKTIF"
  // ============================================================
  if (env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_CHAT_ID) {
    const violationApp = metadata.violation_app || metadata.source || 'Aplikasi Hiburan';
    const godModeText = `🔴 GOD MODE AKTIF\n\nTuan Faqih,\nBatas screen-time untuk ${violationApp} telah terlampaui.\nKoneksi internet dimatikan sekarang.\n\n— N.E.X.A Discipline System`;

    await axios.post(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
      chat_id: env.TELEGRAM_CHAT_ID,
      text: godModeText
    }).then(() => {
      telegramSent = true;
      console.log('[DISCIPLINE] God Mode Telegram alert sent. Tasker Intercept will execute.');
    }).catch(e => {
      console.error('[DISCIPLINE] Failed to send Telegram God Mode alert:', e.message);
    });
  } else {
    console.warn('[DISCIPLINE] Telegram not configured — cannot trigger God Mode via Telegram Intercept.');
  }

  // ============================================================
  // JALUR 2 (OPSIONAL): Direct Webhook ke Tasker via TASKER_WEBHOOK_URL
  // Membutuhkan AutoRemote atau URL publik di HP. Boleh dikosongkan.
  // ============================================================
  if (env.TASKER_WEBHOOK_URL) {
    const timestamp = new Date().toISOString();
    const signature = security.generateTaskerSignature(timestamp, level);

    const payload = {
      auth: {
        bearer_token: env.NEXA_GODMODE_SECRET,
        timestamp
      },
      command: {
        type: 'GOD_MODE_ESCALATION',
        level,
        actions: [
          { action: 'DISABLE_WIFI', params: { duration_minutes: 30 } },
          { action: 'DISABLE_MOBILE_DATA', params: { duration_minutes: 30 } },
          { action: 'LOCK_SCREEN', params: { message: 'Waktumu Berharga!' } },
          { action: 'GO_HOME', params: { repeat: 3 } }
        ]
      },
      metadata
    };

    try {
      const response = await axios.post(env.TASKER_WEBHOOK_URL, payload, {
        headers: {
          'Authorization': `Bearer ${env.NEXA_GODMODE_SECRET}`,
          'Content-Type': 'application/json',
          'X-NEXA-Signature': signature
        }
      });
      console.log('[DISCIPLINE] Direct Tasker webhook executed.', response.status);
    } catch (err) {
      console.error('[DISCIPLINE] Direct Tasker webhook failed (non-fatal):', err.message);
    }
  } else {
    console.log('[DISCIPLINE] TASKER_WEBHOOK_URL not set — using Telegram Intercept only (normal).');
  }

  return telegramSent;
}

module.exports = { triggerGodMode };
