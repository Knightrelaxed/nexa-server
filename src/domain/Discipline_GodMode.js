// ============================================================
// N.E.X.A — DISCIPLINE & GOD MODE ENFORCEMENT ENGINE
// Multi-Tier Progressive Enforcement Engine (4-Level Escalation)
// Optimized for Samsung Galaxy A33 5G (Android 14 / One UI 6)
// Immortality Protocol v3.1 — Surgical & Dynamic Enforcement
// ============================================================
'use strict';

const env = require('../config/env');

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Menghitung profil dinamis berdasarkan data Behavior Engine & riwayat pelanggaran hari ini.
 * 
 * @param {object} moodData - Output dari behaviorEngine (misal: MOOD_TIME_SERIES)
 * @param {object} historyData - { violationsToday: number }
 * @returns {{ baselineLevel: number, maxLevelCap: number, messageTone: string, includeWellnessNote: boolean }}
 */
function computeDynamicProfile(moodData = {}, historyData = {}) {
  const {
    mood_24h_state   = 'NEUTRAL',   // 'POSITIVE' | 'NEUTRAL' | 'NEGATIVE'
    mood_7d_trend    = 'STABLE',    // 'IMPROVING' | 'STABLE' | 'DECLINING' | 'ASCENDING' | 'DESCENDING'
    mood_7d_variance = 'LOW'        // 'HIGH' | 'MEDIUM' | 'LOW'
  } = moodData;

  const violationsToday = historyData.violationsToday || 0;
  const jakartaTime = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Jakarta' }));
  const currentHour = jakartaTime.getHours();

  let baselineLevel       = 1;
  let maxLevelCap         = 4;
  let messageTone         = 'firm';
  let includeWellnessNote = false;

  // ── MOOD: Atur Ceiling (Batas Atas Eskalasi) ──────────────────────────
  if (mood_24h_state === 'NEGATIVE') {
    maxLevelCap = 2;
    messageTone = 'gentle';
    includeWellnessNote = true;
  } else if (mood_7d_trend === 'DESCENDING' && mood_7d_variance === 'LOW') {
    maxLevelCap = 2;
    messageTone = 'gentle';
    includeWellnessNote = true;
  } else if (mood_24h_state === 'POSITIVE' && mood_7d_trend === 'ASCENDING') {
    baselineLevel = 1;
    maxLevelCap = 4;
    messageTone = 'urgent';
    includeWellnessNote = false;
  }

  // ── HISTORY: Eskalasi Berdasarkan Pelanggaran Berulang Hari Ini ────────
  if (violationsToday === 0) {
    baselineLevel = Math.min(baselineLevel, 1);
  } else if (violationsToday === 1) {
    baselineLevel = Math.max(baselineLevel, 2);
  } else if (violationsToday === 2) {
    baselineLevel = Math.max(baselineLevel, 3);
  } else if (violationsToday >= 3) {
    baselineLevel = Math.max(baselineLevel, 4);
    messageTone = 'urgent';
  }

  // ── TIME OF DAY: Restriksi Malam Hari (22:00 - 07:00 WIB) ────────────
  if (currentHour >= 22 || currentHour < 7) {
    maxLevelCap = Math.min(maxLevelCap, 2);
  }

  return { baselineLevel, maxLevelCap, messageTone, includeWellnessNote };
}

/**
 * Menyusun rencana aksi (actions) dan spesifikasi pesan berdasarkan level eskalasi & nada (tone).
 * 
 * @param {number} level - 1: Reminder, 2: Friction, 3: Surgical Force, 4: Ultimate God Mode
 * @param {object} metadata - Data pelanggaran (misal: violation_app, duration_minutes, message_tone)
 * @returns {object} { levelName, title, telegramMessage, actions }
 */
function getEscalationPlan(level = 1, metadata = {}) {
  const violationApp = metadata.violation_app || metadata.app_name || 'Aplikasi Hiburan';
  const duration = metadata.duration_minutes || 30;
  const tone = metadata.message_tone || 'firm';
  const includeWellnessNote = metadata.include_wellness_note || false;
  const safeApp = escapeHtml(violationApp);
  const timeStr = new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' });

  const wellnessText = includeWellnessNote
    ? '\n\n💙 <i>N.E.X.A mendeteksi tekanan emosional Anda hari ini. Istirahat 5 menit setelah ini adalah produktif, bukan kalah.</i>'
    : '';

  switch (Number(level)) {
    case 1: {
      let teleMsg = `⚠️ <b>Peringatan Fokus (Level 1)</b>\n\nTuan Faqih, terdeteksi aktivitas di <b>${safeApp}</b> (${duration} menit).\nMohon kembali ke sesi produktif Anda.\n<i>Waktu: ${timeStr}</i>${wellnessText}`;

      if (tone === 'gentle') {
        teleMsg = `🌱 <b>Pengingat Halus (Level 1)</b>\n\nTuan Faqih, waktu di <b>${safeApp}</b> mencapai ${duration} menit.\nMari perlahan kembali ke fokus utama Anda.\n<i>Waktu: ${timeStr}</i>${wellnessText}`;
      } else if (tone === 'urgent') {
        teleMsg = `🚨 <b>Peringatan Mendesak (Level 1)</b>\n\nTuan Faqih, <b>${safeApp}</b> telah menyita ${duration} menit!\nSetiap menit berharga. Kembali ke meja kerja sekarang!\n<i>Waktu: ${timeStr}</i>`;
      }

      return {
        levelName: 'COGNITIVE_REMINDER',
        title: '⚠️ N.E.X.A Focus Reminder',
        telegramMessage: teleMsg,
        actions: [
          { action: 'EDGE_LIGHTING', params: { color: 'YELLOW', duration_ms: 3000 } },
          { action: 'SHOW_POPUP', params: { title: 'Peringatan N.E.X.A', message: `Waktu di ${violationApp} sudah cukup. Kembali fokus!` } }
        ]
      };
    }

    case 2: {
      let teleMsg = `🛑 <b>Intervensi Friksi (Level 2)</b>\n\nTuan Faqih, waktu di <b>${safeApp}</b> melebihi batas.\nLayar Samsung A33 5G diarahkan ke Home Screen.\n\n❓ Apakah ada alasan mendesak (riset/kerja), atau sedang menunda tugas? Silakan gunakan tombol konfirmasi di bawah ini.${wellnessText}`;

      return {
        levelName: 'INTERACTIVE_FRICTION',
        title: '🛑 N.E.X.A Intervention',
        telegramMessage: teleMsg,
        actions: [
          { action: 'PLAY_ALARM_SOUND', params: { duration_seconds: 2, volume: 'medium' } },
          { action: 'GO_HOME', params: { repeat: 1 } },
          { action: 'SHOW_DIALOG', params: { title: 'Intervensi N.E.X.A', message: 'Layar dikembalikan ke Home. Apakah Anda menunda tugas? Konfirmasikan di Telegram.' } }
        ]
      };
    }

    case 3: {
      return {
        levelName: 'SURGICAL_RESTRICTION',
        title: '🚫 N.E.X.A Surgical Force',
        telegramMessage: `🚫 <b>Pemaksaan Bedah / Surgical Force (Level 3)</b>\n\nTuan Faqih,\nAplikasi <b>${safeApp}</b> telah ditutup paksa.\n\n⚙️ <b>Tindakan Fisik di Samsung A33 5G:</b>\n• Force Stop: ${safeApp}\n• Layar diubah ke Grayscale (Hitam Putih)\n• Samsung Focus Mode diaktifkan (30 menit)\n• Komunikasi penting tetap aktif.\n\n<i>Waktu: ${timeStr}</i>${wellnessText}`,
        actions: [
          { action: 'FORCE_STOP_APP', params: { app_name: violationApp } },
          { action: 'ENABLE_GRAYSCALE', params: { duration_minutes: 30 } },
          { action: 'ENABLE_FOCUS_MODE', params: { mode_name: 'Diplomacy Focus', duration_minutes: 30 } },
          { action: 'GO_HOME', params: { repeat: 3 } }
        ]
      };
    }

    case 4:
    default: {
      return {
        levelName: 'GOD_MODE_ULTIMATE',
        title: '🔴 SURGICAL GOD MODE MUTLAK',
        telegramMessage: `🔴 <b>SURGICAL GOD MODE MUTLAK (Level 4)</b>\n\nTuan Faqih,\nBatas toleransi penundaan di <b>${safeApp}</b> telah habis.\n\n🔒 <b>Isolasi Fisik Bedah (Samsung A33 5G):</b>\n• Mode Pesawat (Airplane Mode) dinyalakan selama 45 menit (memotong total seluruh koneksi internet Wi-Fi & Kuota)\n• One UI DND Priority Only aktif\n• One UI Focus Mode mengunci aplikasi hiburan\n• Layar ponsel dikunci otomatis tanpa opsi bypass fisik\n\n<i>Kembalilah ke meja kerja Anda. Waktu berlanjut setelah 45 menit.</i>`,
        actions: [
          { action: 'DISABLE_WIFI', params: { duration_minutes: 45 } },
          { action: 'DISABLE_MOBILE_DATA', params: { duration_minutes: 45 } },
          { action: 'ENABLE_DND_PRIORITY_ONLY', params: {
              allow_calls_from: 'FAVORITES',
              allow_repeat_callers: true,
              duration_minutes: 45
            }
          },
          { action: 'ENABLE_FOCUS_MODE', params: {
              mode_name: 'God Mode Isolation',
              block_all_downloaded_apps: true,
              duration_minutes: 45
            }
          },
          { action: 'LOCK_SCREEN', params: { timeout_seconds: 0, show_lock_message: true } }
        ]
      };
    }
  }
}

/**
 * Menghasilkan kalimat lisan dinamis real-time dari LLM (AI_Router) yang disesuaikan
 * dengan konteks aplikasi, durasi, dan mood pengguna saat itu.
 */
async function generateDynamicAISpeech(level, metadata = {}, fallbackSpeechText = '') {
  try {
    const aiRouter = require('../core/AI_Router');
    const appName = metadata.violation_app || metadata.app_name || 'Aplikasi Hiburan';
    const duration = metadata.duration_minutes || 15;
    const tone = metadata.message_tone || 'firm';

    const prompt = `Buatkan tepat 2 kalimat nasihat lisan singkat kepada Tuan Faqih yang baru saja terdeteksi membuka ${appName} selama ${duration} menit.
Level intervensi N.E.X.A: Level ${level} (${level === 4 ? 'Isolasi Mutlak: Mode Pesawat diaktifkan dan layar dikunci otomatis' : level === 3 ? 'Surgical Force: Aplikasi ditutup paksa dan layar grayscale' : 'Peringatan kembali ke Home'}).
Nada pembicaraan: ${tone} (${tone === 'gentle' ? 'lembut, empati, menenangkan karena lelah/rentan' : tone === 'urgent' ? 'sangat mendesak, tegas mutlak, tanpa toleransi' : 'tegas, rasional, menyadarkan fokus'}).
ATURAN MUTLAK:
1. Maksimal 2 kalimat singkat yang langsung menusuk kesadaran (maksimal 18 kata per kalimat).
2. Jangan gunakan format markdown, emoji, tanda bintang (*), atau tanda kutip.
3. Langsung ucapkan kalimat nasihatnya tanpa basa-basi pengantar.`;

    const aiText = await aiRouter.callAI(
      prompt,
      "Kamu adalah N.E.X.A, asisten AI otonom penegak disiplin yang berbicara kepada Tuan Faqih.",
      0.6,
      false
    );

    if (aiText && typeof aiText === 'string' && aiText.trim().length > 10) {
      const cleanText = aiText.trim()
        .replace(/["'\*#_`~]/g, '')
        .replace(/[\u2700-\u27BF]|[\uE000-\uF8FF]|\uD83C[\uDC00-\uDFFF]|\uD83D[\uDC00-\uDFFF]|[\u2011-\u26FF]|\uD83E[\uDD10-\uDDFF]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
      if (cleanText.length > 10) {
        console.log(`[GODMODE-AI] Dynamic speech generated: "${cleanText}"`);
        return cleanText;
      }
    }
  } catch (err) {
    console.error('[GODMODE-AI] Dynamic speech generation fallback triggered:', err.message);
  }
  return fallbackSpeechText;
}

/**
 * Versi async dari getEscalationPlan yang secara real-time meminta LLM
 * meracik kalimat lisan dinamis untuk dimasukkan ke dalam rencana intervensi.
 */
async function getDynamicEscalationPlan(level = 1, metadata = {}) {
  const plan = getEscalationPlan(level, metadata);
  const fallbackSpeech = `Tuan Faqih, waktu di ${metadata.violation_app || 'aplikasi'} sudah mencukupi. Mari kembali ke prioritas Anda.`;

  console.log(`[GODMODE AI] Requesting real-time dynamic speech from LLM (Level ${level} | Tone: ${metadata.message_tone || 'firm'})...`);
  const dynamicSpeech = await generateDynamicAISpeech(level, metadata, fallbackSpeech);
  console.log(`[GODMODE AI] Speech crafted: "${dynamicSpeech}"`);

  plan.speechMessage = dynamicSpeech;
  return plan;
}

/**
 * Trigger God Mode Escalation to Telegram & Peripheral Devices
 * 
 * @param {number} level - Escalation level (1: Reminder, 2: Friction, 3: Surgical Force, 4: Ultimate God Mode)
 * @param {object} metadata - Details about violation (violation_app, duration_minutes, message_tone, include_wellness_note)
 * @returns {Promise<boolean>}
 */
async function triggerGodMode(level = 1, metadata = {}) {
  const plan = await getDynamicEscalationPlan(level, metadata);

  console.log(`[GODMODE ENGINE] Plan Ready: Level ${level} (${plan.levelName}) for app "${metadata.violation_app || 'Unknown'}"`);

  // Kirim notifikasi / audit log ke Telegram
  if (env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_CHAT_ID) {
    try {
      const { sendTelegramOutbound } = require('../interfaces/webhook');
      await sendTelegramOutbound(plan.telegramMessage);
      console.log(`[GODMODE AUDIT] Telegram notification sent successfully.`);
    } catch (telegramErr) {
      console.error('[GODMODE AUDIT] Failed to send God Mode audit to Telegram:', telegramErr.message);
    }
  }

  // Kirim perintah fisik ke Nexa Bridge Android App jika terhubung
  try {
    const mobileBridgeWs = require('../interfaces/mobile_bridge/MobileBridge_WS');
    if (mobileBridgeWs && typeof mobileBridgeWs.sendCommand === 'function') {
      // 1. Suara TTS AI (untuk semua level)
      if (plan.speechMessage) {
        mobileBridgeWs.sendCommand('SPEAK_TEXT', { text: plan.speechMessage }).catch(() => {});
      }

      // 2. Aksi Berdasarkan Level
      if (Number(level) === 2) {
        // Level 2: Kembalikan ke Home Screen
        mobileBridgeWs.sendCommand('GO_HOME_SCREEN', {}).catch(() => {});
      } else if (Number(level) === 3) {
        // Level 3: Re-bounce ke Home Screen + Overlay
        mobileBridgeWs.sendCommand('GO_HOME_SCREEN', {}).catch(() => {});
        mobileBridgeWs.sendCommand('SHOW_OVERLAY_MSG', { message: 'SESI FOKUS DIAKTIFKAN: Waktu aplikasi telah habis.', duration_seconds: 10 }).catch(() => {});
      } else if (Number(level) >= 4) {
        // Level 4 (Ultimate God Mode): Kunci Layar Fisik + DND Total
        mobileBridgeWs.sendCommand('FORCE_DND', { enabled: true }).catch(() => {});
        mobileBridgeWs.sendCommand('LOCK_SCREEN', {}).catch(() => {});
      }
    }
  } catch (bridgeErr) {
    console.warn('[GODMODE] Mobile Bridge command dispatch error:', bridgeErr.message);
  }

  return true;
}

module.exports = { triggerGodMode, getEscalationPlan, getDynamicEscalationPlan, computeDynamicProfile };
