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
 * Memuat batas waktu aplikasi 100% langsung dari database Supabase.
 * @returns {Promise<Map<string, object>>}
 */
async function loadAppLimits() {
  const now = Date.now();
  if (_cachedDbLimits && now < _cacheExpiry) {
    return _cachedDbLimits;
  }

  const sb = getSupabase();
  const limitsMap = new Map();

  if (sb) {
    try {
      const { data, error } = await sb
        .from('nexa_app_limits')
        .select('*')
        .eq('is_active', true);

      if (!error && Array.isArray(data)) {
        for (const row of data) {
          limitsMap.set(row.package_name, {
            app_label:   row.app_label || row.package_name,
            max_session: Number(row.max_session_minutes) || 30,
            max_daily:   Number(row.max_daily_minutes) || 120,
            warning_pct: Number(row.warning_threshold_pct) || 80,
            level:       Number(row.escalation_level) || 2
          });
        }
      } else if (error) {
        console.warn('[APP-DISCIPLINE] Supabase query error:', error.message);
      }
    } catch (err) {
      console.warn('[APP-DISCIPLINE] Failed to load limits from DB:', err.message);
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
async function evaluateAppUsage(telemetry) {
  const data = (telemetry && typeof telemetry === 'object') ? telemetry : {};
  const pkg = data.package_name || data.current_foreground_app;
  if (!pkg || typeof pkg !== 'string' || pkg.trim().length === 0) return { status: 'IGNORED_NO_PACKAGE' };

  const cleanPkg = pkg.trim();
  const sessionMinutes = Number(data.session_minutes || data.current_session_minutes || 0);
  const dailyMinutes = Number(data.daily_total_minutes || data.total_daily_minutes || sessionMinutes);
  const appLimits = await loadAppLimits();

  const rule = appLimits.get(cleanPkg);
  if (!rule) {
    // Aplikasi tidak termasuk dalam daftar pantauan ketat
    return { status: 'UNMONITORED_APP', package_name: cleanPkg };
  }

  const appName = rule.app_label || data.app_name || cleanPkg;
  const now = Date.now();

  // ── 0. CEK STATUS LOCKOUT / COOLDOWN (UPAYA MEMBUKA LAGI / NGEYEL) ────────
  if (_activeLockouts.has(cleanPkg)) {
    const lockout = _activeLockouts.get(cleanPkg);
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
async function upsertAppLimit(limitData) {
  const data = (limitData && typeof limitData === 'object') ? limitData : {};
  const pkg = data.package_name;
  if (!pkg || typeof pkg !== 'string' || pkg.trim().length === 0) {
    throw new Error('package_name is required and must be a non-empty string');
  }

  const cleanPkg = pkg.trim();
  const payload = {
    package_name: cleanPkg,
    app_label: data.app_label || cleanPkg,
    max_session_minutes: Number(data.max_session_minutes || 30),
    max_daily_minutes: Number(data.max_daily_minutes || 90),
    warning_threshold_pct: Number(data.warning_threshold_pct || 80),
    escalation_level: Number(data.escalation_level || 2),
    is_active: data.is_active !== undefined ? Boolean(data.is_active) : true,
    updated_at: new Date().toISOString()
  };

  const sb = getSupabase();
  if (sb) {
    const { data: inserted, error } = await sb
      .from('nexa_app_limits')
      .upsert([payload], { onConflict: 'package_name' })
      .select();

    if (error) throw new Error(`Supabase upsert error: ${error.message}`);
    invalidateLimitsCache();
    return { success: true, data: inserted?.[0] || payload };
  }

  // Update in-memory fallback
  DEFAULT_LIMITS.set(cleanPkg, {
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
async function updateAppLimit(packageName, updates) {
  if (!packageName || typeof packageName !== 'string' || packageName.trim().length === 0) {
    throw new Error('packageName is required and must be a non-empty string');
  }

  const cleanPkg = packageName.trim();
  const patch = (updates && typeof updates === 'object') ? { ...updates } : {};
  patch.updated_at = new Date().toISOString();

  const sb = getSupabase();
  if (sb) {
    const { data, error } = await sb
      .from('nexa_app_limits')
      .update(patch)
      .eq('package_name', cleanPkg)
      .select();

    if (error) throw new Error(`Supabase update error: ${error.message}`);
    invalidateLimitsCache();
    return { success: true, data: data?.[0] || patch };
  }

  // Update in-memory fallback
  if (DEFAULT_LIMITS.has(cleanPkg)) {
    const curr = DEFAULT_LIMITS.get(cleanPkg);
    if (patch.max_session_minutes !== undefined) curr.max_session = Number(patch.max_session_minutes);
    if (patch.max_daily_minutes !== undefined) curr.max_daily = Number(patch.max_daily_minutes);
    if (patch.warning_threshold_pct !== undefined) curr.warning_pct = Number(patch.warning_threshold_pct);
    if (patch.escalation_level !== undefined) curr.level = Number(patch.escalation_level);
    if (patch.app_label) curr.app_label = patch.app_label;
    DEFAULT_LIMITS.set(cleanPkg, curr);
  }
  invalidateLimitsCache();
  return { success: true, data: patch, note: 'Updated in-memory fallback' };
}

/**
 * Menghapus batas aplikasi (CRUD: DELETE).
 */
async function deleteAppLimit(packageName) {
  if (!packageName || typeof packageName !== 'string' || packageName.trim().length === 0) {
    throw new Error('packageName is required and must be a non-empty string');
  }

  const cleanPkg = packageName.trim();
  const sb = getSupabase();
  if (sb) {
    const { error } = await sb
      .from('nexa_app_limits')
      .delete()
      .eq('package_name', cleanPkg);

    if (error) throw new Error(`Supabase delete error: ${error.message}`);
  }

  invalidateLimitsCache();
  return { success: true, package_name: cleanPkg };
}

const APP_PACKAGE_MAP = {
  'youtube': 'com.google.android.youtube',
  'yt': 'com.google.android.youtube',
  'gotube': 'premium.gotube.adblock.utube',
  'youtube music': 'com.google.android.apps.youtube.music',
  'yt music': 'com.google.android.apps.youtube.music',
  'instagram': 'com.instagram.android',
  'ig': 'com.instagram.android',
  'threads': 'com.instagram.barcelona',
  'tiktok': 'com.ss.android.ugc.trill',
  'tt': 'com.ss.android.ugc.trill',
  'twitter': 'com.twitter.android',
  'x': 'com.twitter.android',
  'facebook': 'com.facebook.lite',
  'fb': 'com.facebook.lite',
  'facebook lite': 'com.facebook.lite',
  'fb lite': 'com.facebook.lite',
  'efootball': 'jp.konami.pesam',
  'pes': 'jp.konami.pesam',
  'pes mobile': 'jp.konami.pesam',
  'capcut': 'com.lemon.lvoverseas',
  'pinterest': 'com.pinterest',
  'spotify': 'com.spotify.music',
  'canva': 'com.canva.editor',
  'chatgpt': 'com.openai.chatgpt',
  'gemini': 'com.google.android.apps.bard',
  'grok': 'ai.x.grok',
  'kimi': 'com.moonshot.kimichat',
  'notion': 'notion.id',
  'duolingo': 'com.duolingo',
  'netflix': 'com.netflix.mediaclient',
  'mobile legends': 'com.mobile.legends',
  'ml': 'com.mobile.legends',
  'mlbb': 'com.mobile.legends',
  'genshin': 'com.miHoYo.GenshinImpact',
  'pubg': 'com.tencent.ig',
  'free fire': 'com.dts.freefireth',
  'ff': 'com.dts.freefireth',
  'whatsapp': 'com.whatsapp',
  'wa': 'com.whatsapp',
  'telegram': 'org.telegram.messenger',
  'chrome': 'com.android.chrome',
  'shopee': 'com.shopee.id',
  'tokopedia': 'com.tokopedia.tkpd',
  'gojek': 'com.gojek.app',
  'grab': 'com.grabtaxi.passenger',
  'livin': 'id.bmri.livin',
  'brimo': 'id.co.bri.brimo',
  'dana': 'id.dana',
  'ovo': 'ovo.id'
};

/**
 * Mencocokkan nama aplikasi kasual ke Package ID Android.
 * Mencari dari database yang sedang dimuat, atau kamus alias umum.
 */
function resolveAppPackage(nameOrPkg) {
  if (!nameOrPkg || typeof nameOrPkg !== 'string') return null;
  const str = nameOrPkg.trim().toLowerCase();
  if (str.includes('.')) return nameOrPkg.trim();

  // 1. Cek dari database limits yang aktif
  if (_cachedDbLimits && _cachedDbLimits.size > 0) {
    for (const [pkg, meta] of _cachedDbLimits.entries()) {
      if (meta.app_label && meta.app_label.toLowerCase() === str) {
        return pkg;
      }
    }
  }

  // 2. Cek kamus alias umum
  return APP_PACKAGE_MAP[str] || null;
}

/**
 * Handler pemrosesan intent DISCIPLINE langsung dari chat Telegram Tuan Faqih.
 * Mendukung pembacaan, pengubahan batas waktu, penambahan, dan penghapusan batas.
 * 
 * @param {object} extractedData - Data hasil ekstraksi AI Router
 * @param {string} [textInput] - Pesan teks asli pengguna
 * @returns {Promise<string>} Pesan balasan siap kirim ke Telegram
 */
async function handleDisciplineChatIntent(extractedData, textInput) {
  // ── Null / type guard ────────────────────────────────────────────────────
  const ed = (extractedData && typeof extractedData === 'object') ? extractedData : {};

  const action     = String(ed.action     || '').toUpperCase();
  const rawTarget  = String(ed.package_name || ed.app_name || ed.target_app || ed.app_label || '').trim();
  const resolvedPkg = resolveAppPackage(rawTarget);

  // ── UPDATE ────────────────────────────────────────────────────────────────
  if (action === 'UPDATE_LIMIT' || action === 'EDIT' || (resolvedPkg && (ed.max_session_minutes || ed.max_daily_minutes))) {
    const pkg = resolvedPkg || rawTarget;
    if (!pkg) return '❌ Mohon sebutkan nama aplikasi yang ingin diubah batasnya (misal: YouTube, Instagram, TikTok).';

    const updates = {};
    if (ed.max_session_minutes)   updates.max_session_minutes   = Number(ed.max_session_minutes);
    if (ed.max_daily_minutes)     updates.max_daily_minutes     = Number(ed.max_daily_minutes);
    if (ed.warning_threshold_pct) updates.warning_threshold_pct = Number(ed.warning_threshold_pct);
    if (ed.escalation_level)      updates.escalation_level      = Number(ed.escalation_level);
    if (ed.is_active !== undefined) updates.is_active           = Boolean(ed.is_active);

    const appLabel = ed.app_label || ed.app_name || rawTarget || pkg;
    updates.app_label = appLabel;

    const result = await upsertAppLimit({ package_name: pkg, app_label: appLabel, ...updates });
    const d = (result && result.data) ? result.data : {};
    return `✅ <b>Batas Aplikasi Berhasil Diperbarui!</b>\n• Aplikasi: <b>${d.app_label || appLabel}</b>\n• Batas Sesi: <b>${d.max_session_minutes != null ? d.max_session_minutes : (ed.max_session_minutes ?? '-')} menit</b>\n• Batas Harian: <b>${d.max_daily_minutes != null ? d.max_daily_minutes : (ed.max_daily_minutes ?? '-')} menit</b>\n• Level Penegakan: <b>Level ${d.escalation_level || 2}</b>\n• Status: <b>${d.is_active !== false ? 'Aktif 🟢' : 'Nonaktif ⚪'}</b>\n\n<i>Aturan baru langsung aktif seketika di ponsel Tuan.</i>`;
  }

  // ── ADD ───────────────────────────────────────────────────────────────────
  if (action === 'ADD_LIMIT' || action === 'CREATE') {
    const pkg = resolvedPkg || (rawTarget.includes('.') ? rawTarget : `com.${rawTarget.toLowerCase().replace(/\s+/g, '')}`);
    const appLabel    = ed.app_label || ed.app_name || rawTarget;
    const sessionMins = Number(ed.max_session_minutes || 30);
    const dailyMins   = Number(ed.max_daily_minutes   || 120);
    const level       = Number(ed.escalation_level    || 2);

    const result = await upsertAppLimit({
      package_name: pkg, app_label: appLabel,
      max_session_minutes: sessionMins, max_daily_minutes: dailyMins,
      warning_threshold_pct: 80, escalation_level: level, is_active: true
    });
    const d = (result && result.data) ? result.data : {};
    return `✅ <b>Aplikasi Baru Berhasil Ditambahkan ke Pantauan!</b>\n• Aplikasi: <b>${d.app_label || appLabel}</b> (<code>${d.package_name || pkg}</code>)\n• Batas Sesi: <b>${d.max_session_minutes || sessionMins} menit</b>\n• Batas Harian: <b>${d.max_daily_minutes || dailyMins} menit</b>\n• Eskalasi: <b>Level ${d.escalation_level || level}</b>\n\n<i>Ponsel Samsung A33 5G Tuan sekarang memantau pemakaian aplikasi ini.</i>`;
  }

  // ── DELETE ────────────────────────────────────────────────────────────────
  if (action === 'DELETE_LIMIT' || action === 'DELETE' || action === 'REMOVE') {
    const pkg = resolvedPkg || rawTarget;
    if (!pkg) return '❌ Mohon sebutkan nama aplikasi yang ingin dihapus batasnya (misal: "Hapus batas YouTube").';
    await deleteAppLimit(pkg);
    return `🗑️ <b>Pemantauan Dihapus:</b>\nAplikasi <b>${rawTarget || pkg}</b> telah dihapus dari daftar batasan. Tuan sekarang bebas membukanya tanpa batasan waktu.`;
  }

  // ── DISABLE ───────────────────────────────────────────────────────────────
  if (action === 'DISABLE_LIMIT' || action === 'DISABLE') {
    const pkg = resolvedPkg || rawTarget;
    if (!pkg) return '❌ Mohon sebutkan nama aplikasi yang ingin dinonaktifkan (misal: "Matikan pantauan TikTok").';
    await updateAppLimit(pkg, { is_active: false });
    return `⚪ <b>Pemantauan Dinonaktifkan Sementara:</b>\nBatas waktu untuk <b>${rawTarget || pkg}</b> telah dimatikan sementara tanpa menghapus datanya.`;
  }

  // ── ENABLE ────────────────────────────────────────────────────────────────
  if (action === 'ENABLE_LIMIT' || action === 'ENABLE') {
    const pkg = resolvedPkg || rawTarget;
    if (!pkg) return '❌ Mohon sebutkan nama aplikasi yang ingin diaktifkan kembali (misal: "Aktifkan kembali batas Instagram").';
    await updateAppLimit(pkg, { is_active: true });
    return `🟢 <b>Pemantauan Diaktifkan Kembali:</b>\nBatas waktu untuk <b>${rawTarget || pkg}</b> kini aktif kembali.`;
  }

  // ── READ / FALLBACK ───────────────────────────────────────────────────────
  const all = await getAllAppLimits();
  if (!all || all.length === 0) {
    return '📱 <b>Daftar Batas Aplikasi N.E.X.A:</b>\nBelum ada aplikasi yang dikonfigurasi dalam daftar pantauan.';
  }
  const lines = all.map((app, idx) => {
    const icon = app.is_active !== false ? '🟢' : '⚪ (Nonaktif)';
    return `${idx + 1}. ${icon} <b>${app.app_label || app.package_name}</b>\n   • Maks Sekali Sesi: <b>${app.max_session_minutes || 30} menit</b>\n   • Total Kuota Harian: <b>${app.max_daily_minutes || 90} menit</b>\n   • Tingkat Eskalasi: <b>Level ${app.escalation_level || 2}</b>`;
  });
  return `📱 <b>Daftar Batas Aplikasi Aktif (Samsung A33 5G):</b>\n\n${lines.join('\n\n')}\n\n<i>💡 Tuan bisa mengubahnya kapan saja, misal: "Ubah batas YouTube jadi 45 menit" atau "Tambahkan game ML batas 25 menit".</i>`;
}


module.exports = {
  loadAppLimits,
  evaluateAppUsage,
  getAllAppLimits,
  upsertAppLimit,
  updateAppLimit,
  deleteAppLimit,
  invalidateLimitsCache,
  resolveAppPackage,
  handleDisciplineChatIntent
};
