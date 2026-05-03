const axios = require('axios');
const env = require('../config/env');
const security = require('../utils/security');

/**
 * Trigger God Mode Escalation to Android Device via Telegram Intercept
 * 
 * ARCHITECTURE (Immortality Protocol v3.0):
 * Server cannot push directly to Android (HP behind NAT/CGNAT = no public IP).
 * Instead: Server → sends "🔴 GOD MODE AKTIF" Telegram message
 *         → Tasker intercepts the notification → Tasker executes system actions
 * 
 * TASKER_WEBHOOK_URL is kept as an OPTIONAL direct-push fallback
 * (e.g. if user later configures AutoRemote or ngrok tunnel)
 * 
 * @param {number} level - Escalation level (e.g. 3)
 * @param {object} metadata - Details about violation
 */
async function triggerGodMode(level = 3, metadata = {}) {
  if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID) {
    console.warn('[DISCIPLINE] Telegram credentials not configured. God Mode cannot be delivered.');
    return false;
  }

  const timestamp = new Date().toISOString();
  const violationInfo = metadata.violation_app
    ? `App: ${metadata.violation_app}`
    : metadata.source || 'Manual trigger';

  // ============================================================
  // PRIMARY: Kirim pesan ke Telegram — Tasker mencegat notifikasi ini
  // Tasker Profile #4 (God Mode Executor) mendeteksi teks "🔴 GOD MODE AKTIF"
  // dan mengeksekusi: matikan WiFi + Data + kunci layar + Go Home
  // ============================================================
  const godModeMessage = `🔴 GOD MODE AKTIF

Tuan Faqih,
Batas screen-time terlampaui.
Koneksi internet dimatikan.

Pelanggaran: ${violationInfo}
Level: ${level}
Waktu: ${new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })}

-N.E.X.A`;

  try {
    await axios.post(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
      chat_id: env.TELEGRAM_CHAT_ID,
      text: godModeMessage
      // NO parse_mode — plain text for reliable Tasker text filter matching
    });
    console.log(`[DISCIPLINE] God Mode (Level ${level}) delivered via Telegram. Tasker will intercept and execute.`);
  } catch (telegramErr) {
    console.error('[DISCIPLINE] Failed to send God Mode via Telegram:', telegramErr.message);
    return false;
  }

  // ============================================================
  // OPTIONAL FALLBACK: Direct HTTP push to Tasker (AutoRemote/ngrok)
  // Only runs if TASKER_WEBHOOK_URL is configured — safe to leave empty
  // ============================================================
  if (env.TASKER_WEBHOOK_URL) {
    const signature = security.generateTaskerSignature(timestamp, level);
    const payload = {
      auth: {
        bearer_token: env.NEXA_GODMODE_SECRET,
        timestamp: timestamp
      },
      command: {
        type: 'GOD_MODE_ESCALATION',
        level: level,
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
      await axios.post(env.TASKER_WEBHOOK_URL, payload, {
        headers: {
          'Authorization': `Bearer ${env.NEXA_GODMODE_SECRET}`,
          'Content-Type': 'application/json',
          'X-NEXA-Signature': signature
        },
        timeout: 5000
      });
      console.log('[DISCIPLINE] God Mode also delivered via direct Tasker URL (bonus).');
    } catch (directErr) {
      // Direct push failure is non-fatal — Telegram intercept already handles it
      console.warn('[DISCIPLINE] Direct Tasker push failed (non-fatal):', directErr.message);
    }
  }

  return true;
}

module.exports = { triggerGodMode };
