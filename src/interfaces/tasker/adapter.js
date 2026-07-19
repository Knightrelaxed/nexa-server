// ============================================================
// N.E.X.A — TASKER ADAPTER & ESCALATION STATE MACHINE
// Menangani event dari Android Tasker (SCREEN_TIME_VIOLATION, ALARM_DISMISSED)
// Mengelola 4-tier progressive escalation state di Supabase (nexa_discipline_state)
// ============================================================
'use strict';

const { createClient } = require('@supabase/supabase-js');
const env = require('../../config/env');
const godMode = require('../../domain/Discipline_GodMode');
const behaviorEngine = require('../../domain/Behavior_Engine');
const taskerClient = require('../../infrastructure/Tasker_Client');
const { sendTelegramOutbound, sendTelegramWithKeyboard } = require('../telegram/actions');

let _supabase = null;
function getSupabase() {
  if (_supabase) return _supabase;
  if (!env.SUPABASE_URL || !env.SUPABASE_KEY) return null;
  _supabase = createClient(env.SUPABASE_URL, env.SUPABASE_KEY);
  return _supabase;
}

/**
 * Ambil atau buat sesi disiplin hari ini untuk aplikasi target.
 * Session key format: "{appName}:{YYYY-MM-DD}" → otomatis reset setiap hari.
 */
async function getOrInitSession(appName) {
  const supabase = getSupabase();
  const today = new Date().toISOString().split('T')[0];
  const sessionKey = `${appName}:${today}`;

  if (!supabase) {
    // Fallback jika supabase tidak terhubung: return state lokal sementara
    return {
      session_key: sessionKey,
      app_name: appName,
      current_level: 0,
      violation_count: 0,
      mood_baseline: 1,
      max_level_cap: 4,
      message_tone: 'firm'
    };
  }

  const { data } = await supabase
    .from('nexa_discipline_state')
    .select('*')
    .eq('session_key', sessionKey)
    .gt('expires_at', new Date().toISOString())
    .maybeSingle();

  if (data) return data;

  // Sesi baru — konsultasi Behavior Engine untuk mood profile & hitung pelanggaran hari ini
  let moodProfile = {};
  try {
    moodProfile = await behaviorEngine.computeMoodTimeSeries() || {};
  } catch (_) {}

  let violationsToday = 0;
  try {
    const { count } = await supabase
      .from('nexa_discipline_state')
      .select('session_key', { count: 'exact', head: true })
      .gt('violation_count', 0)
      .like('session_key', `%:${today}`);
    violationsToday = count || 0;
  } catch (_) {}

  const profile = godMode.computeDynamicProfile(moodProfile, { violationsToday });

  const newSession = {
    session_key:     sessionKey,
    app_name:        appName,
    current_level:   0,
    violation_count: 0,
    mood_baseline:   profile.baselineLevel,
    max_level_cap:   profile.maxLevelCap,
    message_tone:    profile.messageTone,
    expires_at:      `${today}T23:59:59+07:00`
  };

  const { error: insertErr } = await supabase.from('nexa_discipline_state').insert(newSession);
  if (insertErr) {
    console.error('[TASKER-STATE] Insert session error:', insertErr.message);
  }

  return newSession;
}

/**
 * Naikkan level satu langkah dan simpan ke Supabase.
 * Menghormati batas atas (max_level_cap) dari profil mood.
 */
async function advanceLevel(session) {
  const rawNext = (session.current_level || 0) + 1;
  const nextLevel = Math.min(rawNext, session.max_level_cap || 4, 4);

  const supabase = getSupabase();
  if (supabase && session.session_key) {
    const { error: updateErr } = await supabase
      .from('nexa_discipline_state')
      .update({
        current_level:     nextLevel,
        violation_count:   (session.violation_count || 0) + 1,
        last_triggered_at: new Date().toISOString()
      })
      .eq('session_key', session.session_key);
    if (updateErr) console.error('[TASKER-STATE] Update level error:', updateErr.message);
  }

  return nextLevel;
}

/**
 * Eksekusi Level 2 dengan Feedback Loop via Telegram Inline Keyboard
 * dan notifikasi instan ke Android via ntfy.sh.
 */
async function fireLevel2WithFeedback(session, metadata) {
  const plan = await godMode.getDynamicEscalationPlan(2, {
    ...metadata,
    message_tone: session.message_tone,
    include_wellness_note: session.mood_baseline > 1 || session.message_tone === 'gentle'
  });

  const keyboard = {
    inline_keyboard: [[
      { text: '✅ Ini Riset Penting',  callback_data: `d:ok:${session.session_key}` },
      { text: '❌ Saya Menunda',       callback_data: `d:no:${session.session_key}` },
      { text: '⏰ +10 Menit',          callback_data: `d:ext:${session.session_key}` }
    ]]
  };

  // 1. Kirim notifikasi ntfy (aksi fisik suara alarm + go home di Android)
  await taskerClient.pushNtfy(plan.ntfyMessage, {
    title: plan.title,
    priority: plan.priority,
    tags: plan.tags
  });

  // 2. Kirim Telegram dengan tombol interaktif
  const msgResult = await sendTelegramWithKeyboard(plan.telegramMessage, keyboard);

  // 3. Simpan pending callback state dengan timeout 3 menit
  const supabase = getSupabase();
  if (supabase && session.session_key) {
    const expiresAt = new Date(Date.now() + 3 * 60 * 1000).toISOString();
    const { error: cbErr } = await supabase
      .from('nexa_discipline_state')
      .update({
        pending_callback:    true,
        callback_expires_at: expiresAt,
        callback_message_id: String(msgResult?.message_id || '')
      })
      .eq('session_key', session.session_key);
    if (cbErr) console.error('[TASKER-STATE] Update pending callback error:', cbErr.message);
  }
}

/**
 * Main Webhook Handler untuk event dari Android Tasker
 */
async function handleTaskerWebhook(req, res) {
  const { type, data } = req.body;

  if (!type) {
    return res.status(400).json({ error: 'Missing event type' });
  }
  if (!data || typeof data !== 'object') {
    return res.status(400).json({ error: 'Missing or invalid data payload' });
  }

  console.log(`\n🚨 [TASKER WEBHOOK] INCOMING EVENT: ${type}`);

  if (type === 'SCREEN_TIME_VIOLATION') {
    const appName = data.app_name || 'Aplikasi Hiburan';
    const duration = data.duration_minutes || 'unknown';
    console.log(`[PAYLOAD] Target App: "${appName}" | Reported Duration: ${duration} min(s)`);

    try {
      console.log(`[SESSION] Loading or initializing database state for "${appName}"...`);
      const session = await getOrInitSession(appName);

      // [AUDIT FIX] Lindungi masa toleransi Level 2 (Grace Period) dari trigger berulang Tasker
      if (session.pending_callback && session.callback_expires_at && new Date(session.callback_expires_at) > new Date()) {
        console.log(`[GRACE PERIOD] "${appName}" violation received during active Level 2 grace period (until ${session.callback_expires_at}). Suppressing immediate escalation.\n`);
        return res.status(200).json({ status: 'in_grace_period', expires_at: session.callback_expires_at });
      }

      const prevLevel = session.current_level || 0;
      const nextLevel = await advanceLevel(session);

      console.log(`[STATE TRANSITION] Level ${prevLevel} -> Escalating to Level ${nextLevel} (Max Cap: ${session.max_level_cap} | Tone: ${session.message_tone})`);

      if (nextLevel === 2) {
        console.log(`[EXECUTION] Triggering Level 2 Interactive Friction with Telegram Inline Buttons...`);
        await fireLevel2WithFeedback(session, { violation_app: appName, duration_minutes: duration });
      } else {
        console.log(`[EXECUTION] Triggering God Mode Protocol Level ${nextLevel}...`);
        await godMode.triggerGodMode(nextLevel, {
          violation_app: appName,
          duration_minutes: duration,
          message_tone:  session.message_tone,
          include_wellness_note: session.mood_baseline > 1 || session.message_tone === 'gentle',
          session_key:   session.session_key
        });
      }

      // Log ke Behavior Engine untuk analitik mingguan
      try {
        await behaviorEngine.logBehaviorEvent('DISCIPLINE_ESCALATION', {
          app_name:  appName,
          level:     nextLevel,
          tone:      session.message_tone
        });
        console.log(`[AUDIT LOG] Event saved to Behavior Engine and Supabase.`);
      } catch (_) {}

      console.log(`[TASKER WEBHOOK] Processing completed successfully (Status 200 OK)\n`);
      res.status(200).json({ status: 'ok', level: nextLevel });
    } catch (e) {
      console.error(`[TASKER WEBHOOK CRITICAL ERROR] State machine failure: ${e.message}\n`);
      res.status(500).json({ error: 'Escalation failed', detail: e.message });
    }

  } else if (type === 'ALARM_DISMISSED') {
    if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID) {
      console.error('[TASKER] ALARM_DISMISSED: Telegram credentials not configured.');
      return res.status(500).json({ error: 'Telegram not configured on server' });
    }
    try {
      const intelligenceBrief = require('../../domain/Intelligence_Brief');
      const briefingText = await intelligenceBrief.generateMorningBriefing();
      const safeText = String(briefingText).substring(0, 4000);
      await sendTelegramOutbound(safeText);

      // Log wake-up event for behavioral tracking
      try {
        await behaviorEngine.logWakeUp();
      } catch (_) {}

      res.status(200).json({ status: 'Briefing sent' });
    } catch (e) {
      console.error('[TASKER] Alarm briefing failed:', e.message);
      res.status(500).json({ error: 'Briefing Failed', detail: e.message });
    }

  } else {
    res.status(400).json({ error: `Unknown event type: ${type}` });
  }
}

module.exports = { handleTaskerWebhook, getOrInitSession, advanceLevel, fireLevel2WithFeedback };
