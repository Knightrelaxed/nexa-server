// ============================================================
// N.E.X.A — DISCIPLINE & GOD MODE ENFORCEMENT ENGINE
// Multi-Tier Progressive Enforcement Engine (4-Level Escalation)
// Optimized for Samsung Galaxy A33 5G (Android 14 / One UI 6)
// Immortality Protocol v3.1 — Surgical & Dynamic Enforcement
// ============================================================
'use strict';

const env = require('../config/env');
const taskerClient = require('../infrastructure/Tasker_Client');

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
  const currentHour = new Date().getHours();

  let baselineLevel       = 1;
  let maxLevelCap         = 4;
  let messageTone         = 'firm';
  let includeWellnessNote = false;

  // ── MOOD: Atur Ceiling (Batas Atas Eskalasi) ──────────────────────────
  if (mood_24h_state === 'NEGATIVE') {
    maxLevelCap = 3;         // Proteksi dari isolasi total saat burnout/stres berat
    messageTone = 'gentle';
    includeWellnessNote = true;
  } else if (mood_24h_state === 'POSITIVE' && (mood_7d_trend === 'IMPROVING' || mood_7d_trend === 'ASCENDING')) {
    maxLevelCap = 4;
    messageTone = 'firm';    // Mood bagus = toleransi lebih rendah terhadap penundaan
  } else if (mood_24h_state === 'NEUTRAL') {
    maxLevelCap = 4;
    messageTone = 'firm';
  }

  // ── TREN MINGGUAN: Fine-tuning ──────────────────────────────────
  if ((mood_7d_trend === 'DECLINING' || mood_7d_trend === 'DESCENDING') && mood_7d_variance === 'HIGH') {
    // Mood tidak stabil dan memburuk — perlakukan dengan hati-hati
    maxLevelCap = Math.min(maxLevelCap, 3);
    includeWellnessNote = true;
    messageTone = 'gentle';
  }

  if (mood_7d_trend === 'IMPROVING' || mood_7d_trend === 'ASCENDING') {
    // Tren positif = bisa lebih tegas karena resiliensi emosional tinggi
    messageTone = mood_24h_state === 'NEGATIVE' ? 'gentle' : 'urgent';
  }

  // ── RECIDIVISM: Atur Floor (Batas Bawah Eskalasi) ──────────────────────
  // Semakin sering melanggar hari ini, baseline naik
  if (violationsToday >= 3) {
    baselineLevel = Math.min(2, maxLevelCap - 1);
  }
  if (violationsToday >= 5) {
    baselineLevel = Math.min(3, maxLevelCap - 1);
    messageTone = 'urgent'; // Override gentle jika sudah berulang kali (>5x) hari ini
  }

  // ── TIME OF DAY: Safety Cap ─────────────────────────────────────
  // Setelah jam 22.00 malam atau sebelum jam 07.00 pagi — hindari Level 4 keras
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
 * @returns {object} { levelName, title, priority, tags, ntfyMessage, telegramMessage, actions }
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
      // LEVEL 1: COGNITIVE REMINDER (Mengingatkan secara visual dan tegas)
      let ntfyMsg = `SPEAK_ONLY|Tuan Faqih, Anda telah membuka ${violationApp} selama ${duration} menit. Kembalilah fokus ke prioritas Anda hari ini.`;
      let teleMsg = `⚠️ <b>Peringatan Fokus (Level 1)</b>\n\nTuan Faqih, terdeteksi aktivitas di <b>${safeApp}</b> (${duration} menit).\nMohon kembali ke sesi produktif Anda.\n<i>Waktu: ${timeStr}</i>${wellnessText}`;

      if (tone === 'gentle') {
        ntfyMsg = `SPEAK_ONLY|Tuan Faqih, ${violationApp} sudah ${duration} menit. Mari ambil napas dan kembali ke prioritas — tanpa terburu-buru.`;
        teleMsg = `🌱 <b>Pengingat Halus (Level 1)</b>\n\nTuan Faqih, waktu di <b>${safeApp}</b> mencapai ${duration} menit.\nMari perlahan kembali ke fokus utama Anda.\n<i>Waktu: ${timeStr}</i>${wellnessText}`;
      } else if (tone === 'urgent') {
        ntfyMsg = `SPEAK_ONLY|Tuan Faqih, ${violationApp} sudah ${duration} menit! Target penting hari ini belum selesai. Kembali sekarang.`;
        teleMsg = `🚨 <b>Peringatan Mendesak (Level 1)</b>\n\nTuan Faqih, <b>${safeApp}</b> telah menyita ${duration} menit!\nSetiap menit berharga. Kembali ke meja kerja sekarang!\n<i>Waktu: ${timeStr}</i>`;
      }

      return {
        levelName: 'COGNITIVE_REMINDER',
        title: '⚠️ N.E.X.A Focus Reminder',
        priority: 'high',
        tags: 'warning,timer',
        ntfyMessage: ntfyMsg,
        telegramMessage: teleMsg,
        actions: [
          { action: 'EDGE_LIGHTING', params: { color: 'YELLOW', duration_ms: 3000 } },
          { action: 'SHOW_POPUP', params: { title: 'Peringatan N.E.X.A', message: `Waktu di ${violationApp} sudah cukup. Kembali fokus!` } }
        ]
      };
    }

    case 2: {
      // LEVEL 2: INTERACTIVE FRICTION (Memberi friksi nyata agar sadar & konfirmasi Telegram)
      let ntfyMsg = `GO_HOME|Tuan Faqih, sesi ${violationApp} melebihi batas waktu (${duration} menit). Layar dikembalikan ke Home. Konfirmasikan alasan Anda di Telegram.`;
      let teleMsg = `🛑 <b>Intervensi Friksi (Level 2)</b>\n\nTuan Faqih, waktu di <b>${safeApp}</b> melebihi batas.\nLayar Samsung A33 5G diarahkan ke Home Screen.\n\n❓ Apakah ada alasan mendesak (riset/kerja), atau sedang menunda tugas? Silakan gunakan tombol konfirmasi di bawah ini.${wellnessText}`;

      if (tone === 'gentle') {
        ntfyMsg = `GO_HOME|Tuan Faqih, sesi ${violationApp} melebihi batas. Layar diarahkan ke Home. Tidak apa-apa jika perlu konfirmasi dulu di Telegram.`;
      } else if (tone === 'urgent') {
        ntfyMsg = `GO_HOME|Batas final intervensi! ${violationApp} ditutup sementara. Konfirmasikan di Telegram sekarang atau Level 3 aktif.`;
      }

      return {
        levelName: 'INTERACTIVE_FRICTION',
        title: '🛑 N.E.X.A Intervention',
        priority: 'urgent',
        tags: 'hand,stop_sign',
        ntfyMessage: ntfyMsg,
        telegramMessage: teleMsg,
        actions: [
          { action: 'PLAY_ALARM_SOUND', params: { duration_seconds: 2, volume: 'medium' } },
          { action: 'GO_HOME', params: { repeat: 1 } },
          { action: 'SHOW_DIALOG', params: { title: 'Intervensi N.E.X.A', message: 'Layar dikembalikan ke Home. Apakah Anda menunda tugas? Konfirmasikan di Telegram.' } }
        ]
      };
    }

    case 3: {
      // LEVEL 3: SURGICAL RESTRICTION (Memaksa tutup aplikasi & ubah ke Grayscale tanpa mati internet)
      return {
        levelName: 'SURGICAL_RESTRICTION',
        title: '🚫 N.E.X.A Surgical Force',
        priority: 'urgent',
        tags: 'lock,skull',
        ntfyMessage: `FORCE_STOP_APP|Tuan Faqih, pemaksaan bedah level tiga aktif. Aplikasi ${violationApp} ditutup paksa. Mode fokus dan grayscale diaktifkan selama 30 menit. Koneksi komunikasi tetap terbuka.`,
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
      // LEVEL 4: SURGICAL GOD MODE (Pemaksaan mutlak isolasi total)
      // Wi-Fi Off + Mobile Data Off + DND Priority (Favorites) + Focus Mode blocked apps + Screen Lock.
      return {
        levelName: 'GOD_MODE_ULTIMATE',
        title: '🔴 SURGICAL GOD MODE MUTLAK',
        priority: 'urgent',
        tags: 'skull_and_crossbones,warning,sos',
        ntfyMessage: `DISABLE_WIFI_AND_LOCK_SCREEN|Tuan Faqih, surgical god mode level empat aktif. Mode pesawat dinyalakan dan layar dikunci agar Anda kembali ke meja kerja.`,
        telegramMessage: `🔴 <b>SURGICAL GOD MODE MUTLAK (Level 4)</b>\n\nTuan Faqih,\nBatas toleransi penundaan di <b>${safeApp}</b> telah habis.\n\n🔒 <b>Isolasi Fisik Bedah (Samsung A33 5G):</b>\n• Mode Pesawat (Airplane Mode) dinyalakan selama 45 menit (memotong total seluruh koneksi internet Wi-Fi & Kuota)\n• One UI DND Priority Only aktif\n• One UI Focus Mode mengunci aplikasi hiburan\n• Layar ponsel dikunci otomatis tanpa opsi bypass fisik\n\n<i>Kembalilah ke meja kerja Anda. Waktu berlanjut setelah 45 menit.</i>`,
        actions: [
          // Matikan Wi-Fi dan Data Seluler (memotong koneksi internet)
          { action: 'DISABLE_WIFI', params: { duration_minutes: 45 } },
          { action: 'DISABLE_MOBILE_DATA', params: { duration_minutes: 45 } },
          // DND dengan whitelist kontak Favorit (telepon darurat konvensional tetap masuk)
          { action: 'ENABLE_DND_PRIORITY_ONLY', params: {
              allow_calls_from: 'FAVORITES',
              allow_repeat_callers: true,
              duration_minutes: 45
            }
          },
          // Focus Mode One UI 6 memblokir khusus aplikasi hiburan
          { action: 'ENABLE_FOCUS_MODE', params: {
              mode_name: 'GOD MODE',
              blocked_apps: [
                'com.zhiliaoapp.musically', // TikTok
                'com.instagram.android',    // Instagram
                'com.google.android.youtube', // YouTube
                'com.twitter.android'       // X / Twitter
              ],
              duration_minutes: 45
            }
          },
          { action: 'LOCK_SCREEN', params: {
              message: '🔴 GOD MODE: Fokus penuh. Kembali ke meja kerja Anda.'
            }
          },
          { action: 'GO_HOME', params: { repeat: 5 } }
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

    const prompt = `Buatkan tepat 2 kalimat nasihat lisan singkat (untuk dibacakan Google TTS di ponsel Samsung A33 5G) kepada Tuan Faqih yang baru saja terdeteksi membuka ${appName} selama ${duration} menit.
Level intervensi N.E.X.A: Level ${level} (${level === 4 ? 'Isolasi Mutlak: Mode Pesawat diaktifkan dan layar dikunci otomatis' : level === 3 ? 'Surgical Force: Aplikasi ditutup paksa dan layar grayscale' : 'Peringatan kembali ke Home'}).
Nada pembicaraan: ${tone} (${tone === 'gentle' ? 'lembut, empati, menenangkan karena lelah/rentan' : tone === 'urgent' ? 'sangat mendesak, tegas mutlak, tanpa toleransi' : 'tegas, rasional, menyadarkan fokus'}).
ATURAN MUTLAK:
1. Maksimal 2 kalimat singkat yang langsung menusuk kesadaran (maksimal 18 kata per kalimat).
2. Jangan gunakan format markdown, emoji, tanda bintang (*), atau tanda kutip, karena teks ini akan dibacakan suara mesin TTS.
3. Langsung ucapkan kalimat nasihatnya tanpa basa-basi pengantar seperti "Berikut kalimatnya".`;

    const aiText = await aiRouter.callAI(
      prompt,
      "Kamu adalah N.E.X.A, asisten AI otonom penegak disiplin yang berbicara secara lisan kepada Tuan Faqih melalui suara ponsel.",
      0.6,
      false
    );

    if (aiText && typeof aiText === 'string' && aiText.trim().length > 10) {
      // Bersihkan karakter markdown/emoji agar bersih dibacakan Google TTS
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
 * meracik kalimat lisan dinamis untuk dimasukkan ke dalam protokol ntfyMessage.
 */
async function getDynamicEscalationPlan(level = 1, metadata = {}) {
  const plan = getEscalationPlan(level, metadata);

  // Split ntfyMessage menjadi COMMAND dan FALLBACK_SPEECH
  const parts = (plan.ntfyMessage || '').split('|');
  const command = parts[0] || 'SPEAK_ONLY';
  const fallbackSpeech = parts.slice(1).join('|').trim() || parts[0];

  // Hasilkan kalimat lisan real-time dari AI_Router
  console.log(`🧠 [GODMODE AI] Requesting real-time dynamic speech from LLM (Level ${level} | Tone: ${metadata.message_tone || 'firm'})...`);
  const dynamicSpeech = await generateDynamicAISpeech(level, metadata, fallbackSpeech);
  console.log(`🗣️ [GODMODE AI] Speech crafted: "${dynamicSpeech}"`);

  // Kembalikan plan dengan ntfyMessage yang sudah disuntik kalimat AI real-time
  plan.ntfyMessage = `${command}|${dynamicSpeech}`;
  return plan;
}

/**
 * Trigger God Mode Escalation to Android Device via ntfy.sh & Tasker
 * 
 * @param {number} level - Escalation level (1: Reminder, 2: Friction, 3: Surgical Force, 4: Ultimate God Mode)
 * @param {object} metadata - Details about violation (violation_app, duration_minutes, message_tone, include_wellness_note)
 * @returns {Promise<boolean>}
 */
async function triggerGodMode(level = 1, metadata = {}) {
  const timestamp = new Date().toISOString();
  const plan = await getDynamicEscalationPlan(level, metadata);

  console.log(`🎯 [GODMODE ENGINE] Plan Ready: Level ${level} (${plan.levelName}) for app "${metadata.violation_app || 'Unknown'}"`);

  // ============================================================
  // PRIMARY: ntfy.sh direct push via infrastructure client (Instant, DND-proof)
  // ============================================================
  console.log(`📤 [GODMODE OUTBOUND] Pushing instant command to ntfy topic (${plan.priority} priority)...`);
  const ntfySent = await taskerClient.pushNtfy(plan.ntfyMessage, {
    title: plan.title,
    priority: plan.priority,
    tags: plan.tags
  });
  if (ntfySent) {
    console.log(`✅ [GODMODE OUTBOUND] Level ${level} (${plan.levelName}) delivered via ntfy.sh instantly.`);
  } else {
    console.warn(`⚠️ [GODMODE OUTBOUND] Failed to push Level ${level} via ntfy.sh.`);
  }

  // ============================================================
  // SECONDARY: Send message back to Telegram as an alert/audit log
  // Uses sendTelegramOutbound (Cloudflare proxy) — direct api.telegram.org is BLOCKED on HF Docker.
  // ============================================================
  if (env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_CHAT_ID) {
    try {
      const { sendTelegramOutbound } = require('../interfaces/webhook');
      await sendTelegramOutbound(plan.telegramMessage);
      console.log(`📨 [GODMODE AUDIT] Telegram notification sent successfully.`);
    } catch (telegramErr) {
      console.error('[GODMODE AUDIT] Failed to send God Mode audit to Telegram:', telegramErr.message);
    }
  }

  // ============================================================
  // TERTIARY (FALLBACK): Direct HTTP push to Tasker via infrastructure client
  // Only runs if TASKER_WEBHOOK_URL is configured
  // ============================================================
  const directSent = await taskerClient.sendDirectCommand({
    type: 'GOD_MODE_ESCALATION',
    level: Number(level),
    level_name: plan.levelName,
    actions: plan.actions
  }, metadata, { level: Number(level), timestamp });

  if (directSent) {
    console.log(`[DISCIPLINE] Level ${level} delivered via direct Tasker URL.`);
  }

  return true;
}

module.exports = { triggerGodMode, getEscalationPlan, getDynamicEscalationPlan, computeDynamicProfile };
