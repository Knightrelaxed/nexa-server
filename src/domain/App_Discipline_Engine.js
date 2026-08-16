// ============================================================
// N.E.X.A — APP USAGE & DISCIPLINE ENGINE
// Real-Time App Usage & Screen-Time Evaluator
// Integrates with Nexa Mobile Bridge (Android 16 / One UI 8)
// ============================================================
'use strict';

const { createClient } = require('@supabase/supabase-js');
const env = require('../config/env');
const disciplineGodMode = require('./Discipline_GodMode');

let _supabase = null;
function getSupabase() {
  if (_supabase) return _supabase;
  if (!env.SUPABASE_URL || !env.SUPABASE_KEY) return null;
  _supabase = createClient(env.SUPABASE_URL, env.SUPABASE_KEY);
  return _supabase;
}

// Fallback in-memory default limits if Supabase table is not yet migrated
const DEFAULT_LIMITS = new Map([
  ['com.google.android.youtube',   { app_label: 'YouTube',     max_session: 30, max_daily: 90,  warning_pct: 80, level: 2 }],
  ['com.instagram.android',        { app_label: 'Instagram',   max_session: 20, max_daily: 60,  warning_pct: 80, level: 2 }],
  ['com.zhiliaoapp.musically',     { app_label: 'TikTok',      max_session: 15, max_daily: 45,  warning_pct: 80, level: 3 }],
  ['com.twitter.android',          { app_label: 'X (Twitter)', max_session: 20, max_daily: 60,  warning_pct: 80, level: 2 }],
  ['com.facebook.katana',          { app_label: 'Facebook',    max_session: 20, max_daily: 45,  warning_pct: 80, level: 2 }],
  ['com.netflix.mediaclient',      { app_label: 'Netflix',     max_session: 45, max_daily: 120, warning_pct: 80, level: 2 }]
]);

// Anti-spam cooldown cache: Map<`${pkg}_${type}`, lastTriggerTimestamp>
const _alertCooldowns = new Map();
const ALERT_COOLDOWN_MS = 10 * 60 * 1000; // 10 minutes cooldown per app alert

// RAM cache for database limits (10 min TTL)
let _cachedDbLimits = null;
let _cacheExpiry = 0;

/**
 * Memuat batas waktu aplikasi dari Supabase (atau fallback).
 * @returns {Promise<Map<string, object>>}
 */
async function loadAppLimits() {
  const now = Date.now();
  if (_cachedDbLimits && now < _cacheExpiry) {
    return _cachedDbLimits;
  }

  const sb = getSupabase();
  const limitsMap = new Map(DEFAULT_LIMITS);

  if (sb) {
    try {
      const { data, error } = await sb
        .from('nexa_app_limits')
        .select('*')
        .eq('is_active', true);

      if (!error && data && data.length > 0) {
        for (const row of data) {
          limitsMap.set(row.package_name, {
            app_label:   row.app_label || row.package_name,
            max_session: row.max_session_minutes || 30,
            max_daily:   row.max_daily_minutes || 90,
            warning_pct: row.warning_threshold_pct || 80,
            level:       row.escalation_level || 2
          });
        }
      }
    } catch (err) {
      console.warn('[APP-DISCIPLINE] Failed to load limits from DB, using defaults:', err.message);
    }
  }

  _cachedDbLimits = limitsMap;
  _cacheExpiry = now + (10 * 60 * 1000);
  return limitsMap;
}

/**
 * Mengevaluasi telemetry penggunaan aplikasi yang diterima dari Android Nexa Bridge.
 * 
 * @param {object} telemetry - Data dari Android
 * @param {string} telemetry.package_name - e.g. "com.google.android.youtube"
 * @param {string} [telemetry.app_name] - e.g. "YouTube"
 * @param {number} telemetry.session_minutes - Durasi sesi aktif saat ini
 * @param {number} [telemetry.daily_total_minutes] - Total akumulasi hari ini
 * @returns {Promise<{ status: string, action_taken?: string, message?: string }>}
 */
async function evaluateAppUsage(telemetry = {}) {
  const pkg = telemetry.package_name || telemetry.current_foreground_app;
  if (!pkg) return { status: 'IGNORED_NO_PACKAGE' };

  const sessionMinutes = Number(telemetry.session_minutes || telemetry.current_session_minutes || 0);
  const dailyMinutes = Number(telemetry.daily_total_minutes || telemetry.total_daily_minutes || sessionMinutes);
  const appLimits = await loadAppLimits();

  const rule = appLimits.get(pkg);
  if (!rule) {
    // Aplikasi tidak termasuk dalam daftar pantauan ketat
    return { status: 'UNMONITORED_APP', package_name: pkg };
  }

  const appName = rule.app_label || telemetry.app_name || pkg;
  const now = Date.now();

  console.log(`[APP-DISCIPLINE] ⏱️ Evaluating ${appName} (${pkg}): Session=${sessionMinutes}m/${rule.max_session}m | Daily=${dailyMinutes}m/${rule.max_daily}m`);

  // ── 1. CEK PELANGGARAN BATAS SESI (SESSION LIMIT BREACH) ─────────────────
  if (sessionMinutes >= rule.max_session) {
    const cooldownKey = `${pkg}_session_breach`;
    const lastAlert = _alertCooldowns.get(cooldownKey) || 0;

    if (now - lastAlert >= ALERT_COOLDOWN_MS) {
      _alertCooldowns.set(cooldownKey, now);
      console.warn(`[APP-DISCIPLINE] 🚨 SESSION LIMIT BREACH: ${appName} reached ${sessionMinutes} minutes!`);

      // Trigger GodMode escalation
      await disciplineGodMode.triggerGodMode(rule.level, {
        violation_app: appName,
        duration_minutes: sessionMinutes,
        message_tone: 'urgent'
      });

      return {
        status: 'SESSION_LIMIT_BREACH',
        action_taken: `ESCALATION_LEVEL_${rule.level}`,
        app_name: appName,
        session_minutes: sessionMinutes
      };
    }
  }

  // ── 2. CEK PELANGGARAN BATAS HARIAN (DAILY TOTAL BREACH) ──────────────────
  if (dailyMinutes >= rule.max_daily) {
    const cooldownKey = `${pkg}_daily_breach`;
    const lastAlert = _alertCooldowns.get(cooldownKey) || 0;

    if (now - lastAlert >= ALERT_COOLDOWN_MS) {
      _alertCooldowns.set(cooldownKey, now);
      console.warn(`[APP-DISCIPLINE] 🚨 DAILY TOTAL BREACH: ${appName} reached ${dailyMinutes} minutes today!`);

      await disciplineGodMode.triggerGodMode(rule.level, {
        violation_app: `${appName} (Akumulasi Harian)`,
        duration_minutes: dailyMinutes,
        message_tone: 'urgent'
      });

      return {
        status: 'DAILY_LIMIT_BREACH',
        action_taken: `ESCALATION_LEVEL_${rule.level}`,
        app_name: appName,
        daily_minutes: dailyMinutes
      };
    }
  }

  // ── 3. CEK AMBANG PERINGATAN DINI (80% WARNING NUDGE) ────────────────────
  const warningMinutes = Math.floor((rule.max_session * rule.warning_pct) / 100);
  if (sessionMinutes >= warningMinutes) {
    const cooldownKey = `${pkg}_warning`;
    const lastAlert = _alertCooldowns.get(cooldownKey) || 0;

    if (now - lastAlert >= ALERT_COOLDOWN_MS) {
      _alertCooldowns.set(cooldownKey, now);
      console.log(`[APP-DISCIPLINE] ⚠️ Approaching limit: ${appName} at ${sessionMinutes}m (${rule.warning_pct}% of ${rule.max_session}m)`);

      // Kirim pengingat halus Level 1
      await disciplineGodMode.triggerGodMode(1, {
        violation_app: appName,
        duration_minutes: sessionMinutes,
        message_tone: 'gentle',
        include_wellness_note: true
      });

      return {
        status: 'WARNING_NUDGE_SENT',
        app_name: appName,
        session_minutes: sessionMinutes
      };
    }
  }

  return { status: 'WITHIN_LIMITS', app_name: appName, session_minutes: sessionMinutes };
}

module.exports = {
  loadAppLimits,
  evaluateAppUsage
};
