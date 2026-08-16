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

// Active Lockout Map: Map<packageName, { expiry: number, attempts: number, appName: string }>
const _activeLockouts = new Map();
const LOCKOUT_DURATION_MS = 30 * 60 * 1000; // 30 minutes lockout upon limit breach

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

  // ── 0. CEK STATUS LOCKOUT / COOLDOWN (UPAYA MEMBUKA LAGI / NGEYEL) ────────
  if (_activeLockouts.has(pkg)) {
    const lockout = _activeLockouts.get(pkg);
    if (now < lockout.expiry) {
      lockout.attempts = (lockout.attempts || 0) + 1;
      const remainingMinutes = Math.ceil((lockout.expiry - now) / (60 * 1000));
      console.warn(`[APP-DISCIPLINE] ⛔ DEFIANCE DETECTED: Attempted to re-open ${appName} during lockout (Attempt #${lockout.attempts}, ${remainingMinutes}m remaining)!`);

      // Log ke Behavioral Engine (Cognitive Memory)
      try {
        const behaviorEngine = require('./Behavior_Engine');
        behaviorEngine.logPassiveLearning(`Defiance detected: Attempted to open ${appName} during ${remainingMinutes}m lockout (Attempt #${lockout.attempts})`, 'BEHAVIOR_OBSERVATION').catch(() => {});
      } catch (_) {}

      // Trigger GodMode: Level 3 on 1st attempt, Level 4 (Nuclear Lockout) on repeated attempts
      const targetLevel = lockout.attempts >= 2 ? 4 : 3;
      await disciplineGodMode.triggerGodMode(targetLevel, {
        violation_app: `${appName} (Cooldown: ${remainingMinutes}m tersisa, Upaya #${lockout.attempts})`,
        duration_minutes: sessionMinutes,
        message_tone: 'urgent'
      });

      return {
        status: 'LOCKOUT_DEFIANCE_BLOCKED',
        action_taken: `ESCALATION_LEVEL_${targetLevel}`,
        app_name: appName,
        remaining_minutes: remainingMinutes,
        attempts: lockout.attempts
      };
    } else {
      // Masa lockout selesai
      _activeLockouts.delete(pkg);
    }
  }

  console.log(`[APP-DISCIPLINE] ⏱️ Evaluating ${appName} (${pkg}): Session=${sessionMinutes}m/${rule.max_session}m | Daily=${dailyMinutes}m/${rule.max_daily}m`);

  // ── 1. CEK PELANGGARAN BATAS SESI (SESSION LIMIT BREACH) ─────────────────
  if (sessionMinutes >= rule.max_session) {
    const cooldownKey = `${pkg}_session_breach`;
    const lastAlert = _alertCooldowns.get(cooldownKey) || 0;

    if (now - lastAlert >= ALERT_COOLDOWN_MS) {
      _alertCooldowns.set(cooldownKey, now);
      // Set active lockout for 30 minutes
      _activeLockouts.set(pkg, { expiry: now + LOCKOUT_DURATION_MS, attempts: 0, appName });
      console.warn(`[APP-DISCIPLINE] 🚨 SESSION LIMIT BREACH: ${appName} reached ${sessionMinutes} minutes! Entered 30m lockout.`);

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

/**
 * Invalidate RAM cache agar perubahan langsung terbaca.
 */
function invalidateLimitsCache() {
  _cachedDbLimits = null;
  _cacheExpiry = 0;
}

/**
 * Mengambil semua batas aplikasi (CRUD: READ ALL).
 */
async function getAllAppLimits() {
  const sb = getSupabase();
  if (sb) {
    try {
      const { data, error } = await sb
        .from('nexa_app_limits')
        .select('*')
        .order('id', { ascending: true });
      if (!error && data) return data;
    } catch (_) {}
  }
  // Fallback
  const fallbackList = [];
  for (const [pkg, rule] of DEFAULT_LIMITS.entries()) {
    fallbackList.push({
      package_name: pkg,
      app_label: rule.app_label,
      max_session_minutes: rule.max_session,
      max_daily_minutes: rule.max_daily,
      warning_threshold_pct: rule.warning_pct,
      escalation_level: rule.level,
      is_active: true
    });
  }
  return fallbackList;
}

/**
 * Menambahkan atau mengupdate batas aplikasi (CRUD: CREATE / UPDATE).
 */
async function upsertAppLimit(limitData = {}) {
  const pkg = limitData.package_name;
  if (!pkg) throw new Error('package_name is required');

  const payload = {
    package_name: pkg,
    app_label: limitData.app_label || pkg,
    max_session_minutes: Number(limitData.max_session_minutes || 30),
    max_daily_minutes: Number(limitData.max_daily_minutes || 90),
    warning_threshold_pct: Number(limitData.warning_threshold_pct || 80),
    escalation_level: Number(limitData.escalation_level || 2),
    is_active: limitData.is_active !== undefined ? Boolean(limitData.is_active) : true,
    updated_at: new Date().toISOString()
  };

  const sb = getSupabase();
  if (sb) {
    const { data, error } = await sb
      .from('nexa_app_limits')
      .upsert([payload], { onConflict: 'package_name' })
      .select();

    if (error) throw new Error(`Supabase upsert error: ${error.message}`);
    invalidateLimitsCache();
    return { success: true, data: data?.[0] || payload };
  }

  // Update in-memory fallback
  DEFAULT_LIMITS.set(pkg, {
    app_label: payload.app_label,
    max_session: payload.max_session_minutes,
    max_daily: payload.max_daily_minutes,
    warning_pct: payload.warning_threshold_pct,
    level: payload.escalation_level
  });
  invalidateLimitsCache();
  return { success: true, data: payload, note: 'Saved to in-memory fallback' };
}

/**
 * Mengubah sebagian kolom konfigurasi batas aplikasi (CRUD: EDIT / PATCH).
 */
async function updateAppLimit(packageName, updates = {}) {
  if (!packageName) throw new Error('packageName is required');

  const sb = getSupabase();
  if (sb) {
    const patch = { ...updates, updated_at: new Date().toISOString() };
    const { data, error } = await sb
      .from('nexa_app_limits')
      .update(patch)
      .eq('package_name', packageName)
      .select();

    if (error) throw new Error(`Supabase update error: ${error.message}`);
    invalidateLimitsCache();
    return { success: true, data: data?.[0] || patch };
  }

  // Update in-memory fallback
  if (DEFAULT_LIMITS.has(packageName)) {
    const curr = DEFAULT_LIMITS.get(packageName);
    if (updates.max_session_minutes !== undefined) curr.max_session = Number(updates.max_session_minutes);
    if (updates.max_daily_minutes !== undefined) curr.max_daily = Number(updates.max_daily_minutes);
    if (updates.warning_threshold_pct !== undefined) curr.warning_pct = Number(updates.warning_threshold_pct);
    if (updates.escalation_level !== undefined) curr.level = Number(updates.escalation_level);
    if (updates.app_label) curr.app_label = updates.app_label;
    DEFAULT_LIMITS.set(packageName, curr);
  }
  invalidateLimitsCache();
  return { success: true, data: updates, note: 'Updated in-memory fallback' };
}

/**
 * Menghapus batas aplikasi (CRUD: DELETE).
 */
async function deleteAppLimit(packageName) {
  if (!packageName) throw new Error('packageName is required');

  const sb = getSupabase();
  if (sb) {
    const { error } = await sb
      .from('nexa_app_limits')
      .delete()
      .eq('package_name', packageName);

    if (error) throw new Error(`Supabase delete error: ${error.message}`);
  }

  DEFAULT_LIMITS.delete(packageName);
  invalidateLimitsCache();
  return { success: true, package_name: packageName };
}

module.exports = {
  loadAppLimits,
  evaluateAppUsage,
  getAllAppLimits,
  upsertAppLimit,
  updateAppLimit,
  deleteAppLimit,
  invalidateLimitsCache
};
