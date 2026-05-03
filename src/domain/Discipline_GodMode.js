const axios = require('axios');
const env = require('../config/env');
const security = require('../utils/security');

/**
 * Trigger God Mode Escalation to Android Device (Tasker)
 * @param {number} level - Escalation level (e.g. 3)
 * @param {object} metadata - Details about violation
 */
async function triggerGodMode(level = 3, metadata = {}) {
  if (!env.TASKER_WEBHOOK_URL) {
    console.warn('[DISCIPLINE] TASKER_WEBHOOK_URL not configured. Skipping God Mode.');
    return false;
  }

  const timestamp = new Date().toISOString();
  const signature = security.generateTaskerSignature(timestamp, level);

  const payload = {
    auth: {
      bearer_token: env.NEXA_GODMODE_SECRET,
      timestamp: timestamp
    },
    command: {
      type: "GOD_MODE_ESCALATION",
      level: level,
      actions: [
        { action: "DISABLE_WIFI", params: { duration_minutes: 30 } },
        { action: "DISABLE_MOBILE_DATA", params: { duration_minutes: 30 } },
        { action: "LOCK_SCREEN", params: { message: "Waktumu Berharga!" } },
        { action: "GO_HOME", params: { repeat: 3 } },
        { action: "SHOW_SCENE", params: { 
            scene_name: "DISCIPLINE_RED_ALERT", 
            text: "🔴 GOD MODE AKTIF\n\nTuan Faqih,\nBatas screen-time terlampaui.\nKoneksi internet dimatikan.\n\n-N.E.X.A" 
          } 
        }
      ]
    },
    metadata: metadata
  };

  try {
    console.log(`[DISCIPLINE] Triggering God Mode (Level ${level}) to Tasker...`);
    const response = await axios.post(env.TASKER_WEBHOOK_URL, payload, {
      headers: {
        'Authorization': `Bearer ${env.NEXA_GODMODE_SECRET}`,
        'Content-Type': 'application/json',
        'X-NEXA-Signature': signature
      }
    });
    console.log('[DISCIPLINE] God Mode executed successfully.', response.status);
    return true;
  } catch (err) {
    console.error('[DISCIPLINE] Failed to trigger God Mode:', err.message);
    return false;
  }
}

module.exports = { triggerGodMode };
