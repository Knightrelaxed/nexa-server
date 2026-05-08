const axios = require('axios');
const env = require('../config/env');
const security = require('../utils/security');

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Trigger God Mode Escalation to Android Device via ntfy.sh
 * 
 * ARCHITECTURE (Immortality Protocol v3.0):
 * Server cannot push directly to Android (HP behind NAT/CGNAT = no public IP).
 * Instead: Server → POST https://ntfy.sh/<secret-topic>
 *         → ntfy app intercepts instantly via FCM
 *         → Tasker Event: ntfy message received → Tasker executes system actions
 * 
 * This guarantees sub-second latency and bypasses Telegram delays or DND modes.
 * 
 * @param {number} level - Escalation level (e.g. 3)
 * @param {object} metadata - Details about violation
 */
async function triggerGodMode(level = 3, metadata = {}) {
  const timestamp = new Date().toISOString();
  const violationInfo = metadata.violation_app
    ? `App: ${metadata.violation_app}`
    : metadata.source || 'Manual trigger';

  // ============================================================
  // PRIMARY: ntfy.sh direct push (Instant, DND-proof)
  // ============================================================
  if (env.NTFY_TOPIC) {
    const godModeMessage = `Tuan Faqih,\nBatas screen-time terlampaui.\nKoneksi internet dimatikan.\n\nPelanggaran: ${violationInfo}\nLevel: ${level}`;
    try {
      await axios.post(`https://ntfy.sh/${env.NTFY_TOPIC}`, godModeMessage, {
        headers: {
          'Title': '🔴 GOD MODE AKTIF',
          'Priority': 'urgent',
          'Tags': 'warning,skull'
        }
      });
      console.log(`[DISCIPLINE] God Mode (Level ${level}) delivered via ntfy.sh instantly.`);
    } catch (ntfyErr) {
      console.error('[DISCIPLINE] Failed to send God Mode via ntfy.sh:', ntfyErr.message);
    }
  } else {
    console.warn('[DISCIPLINE] NTFY_TOPIC not configured. Primary God Mode push disabled.');
  }

  // ============================================================
  // SECONDARY: Send message back to Telegram as an alert/audit log
  // ============================================================
  if (env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_CHAT_ID) {
    const safeViolationInfo = escapeHtml(violationInfo);
    const telegramMessage = `🔴 <b>GOD MODE AKTIF</b>\n\nTuan Faqih,\nBatas screen-time terlampaui.\nKoneksi internet dimatikan.\n\nPelanggaran: ${safeViolationInfo}\nLevel: ${level}\nWaktu: ${new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })}`;
    try {
      await axios.post(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
        chat_id: env.TELEGRAM_CHAT_ID,
        text: telegramMessage,
        parse_mode: 'HTML'
      });
    } catch (telegramErr) {
      console.error('[DISCIPLINE] Failed to send God Mode audit to Telegram:', telegramErr.message);
    }
  }

  // ============================================================
  // TERTIARY (FALLBACK): Direct HTTP push to Tasker (AutoRemote/ngrok)
  // Only runs if TASKER_WEBHOOK_URL is configured
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
      console.log('[DISCIPLINE] God Mode delivered via direct Tasker URL.');
    } catch (directErr) {
      console.warn('[DISCIPLINE] Direct Tasker push failed:', directErr.message);
    }
  }

  return true;
}

module.exports = { triggerGodMode };
