/**
 * ============================================================
 * [PHASE 6 — Pilar 8.2] BEHAVIORAL PATTERN ENGINE
 * ============================================================
 * Logs behavioral events to `nexa_behavior_log` in Supabase.
 * Used to track daily routines (wake time, mood, finance activity)
 * and generate weekly insight reports.
 *
 * TABLE (must exist in Supabase — see database/schema.sql):
 *   nexa_behavior_log (
 *     id          BIGSERIAL PRIMARY KEY,
 *     event_type  TEXT NOT NULL,
 *     event_data  JSONB DEFAULT '{}',
 *     day_of_week INT,
 *     hour_of_day INT,
 *     created_at  TIMESTAMPTZ DEFAULT NOW()
 *   )
 *
 * DESIGN RULES:
 * - All writes are fire-and-forget (errors logged, never thrown).
 * - Reading is only done for the weekly summary cron.
 * - This module has NO knowledge of Telegram or cron — it only logs/reads.
 * ============================================================
 */

const { createClient } = require('@supabase/supabase-js');
const env = require('../config/env');

const TABLE = 'nexa_behavior_log';

// Use the same Supabase connection as Supabase_Memories, initialized lazily
let _supabase = null;
function getSupabase() {
  if (_supabase) return _supabase;
  if (!env.SUPABASE_URL || !env.SUPABASE_KEY) return null;
  _supabase = createClient(env.SUPABASE_URL, env.SUPABASE_KEY);
  return _supabase;
}

/**
 * Get current Jakarta time details (hour and day of week).
 * @returns {{ hour: number, dayOfWeek: number, isoString: string }}
 */
function _getJakartaTimeDetails() {
  const now = new Date();
  const jakartaStr = now.toLocaleString('en-US', { timeZone: 'Asia/Jakarta' });
  const jakarta = new Date(jakartaStr);
  return {
    hour: jakarta.getHours(),
    dayOfWeek: jakarta.getDay(), // 0=Sunday, 6=Saturday
    isoString: now.toISOString()
  };
}

/**
 * Log a behavioral event to Supabase.
 * This is the single write primitive for the entire engine.
 * All public functions call this internally.
 *
 * @param {string} eventType - e.g. 'WAKE_UP', 'MOOD_DETECTED', 'FINANCE_RECORD'
 * @param {object} [eventData] - Optional JSON payload with additional context
 */
async function logBehaviorEvent(eventType, eventData = {}) {
  const sb = getSupabase();
  if (!sb) {
    console.warn('[BEHAVIOR] Supabase not configured. Skipping behavior log.');
    return;
  }

  const { hour, dayOfWeek } = _getJakartaTimeDetails();

  try {
    const { error } = await sb.from(TABLE).insert([{
      event_type: String(eventType).toUpperCase(),
      event_data: eventData,
      day_of_week: dayOfWeek,
      hour_of_day: hour,
      created_at: new Date().toISOString()
    }]);
    if (error) {
      // Table may not exist yet — log but don't crash
      console.warn(`[BEHAVIOR] Failed to log event '${eventType}':`, error.message);
    } else {
      console.log(`[BEHAVIOR] Logged: ${eventType} (day=${dayOfWeek}, hour=${hour})`);
    }
  } catch (e) {
    console.warn(`[BEHAVIOR] Unexpected error logging '${eventType}':`, e.message);
  }
}

/**
 * Log a WAKE_UP event.
 * Called when morning wake up event fires.
 * Only logs once per day — checks if a WAKE_UP has already been logged today.
 */
async function logWakeUp() {
  const sb = getSupabase();
  if (!sb) return;

  // Dedup: only log once per calendar day (Jakarta time)
  const now = new Date();
  const jakartaNow = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Jakarta' }));
  const startOfDay = new Date(jakartaNow);
  startOfDay.setHours(0, 0, 0, 0);
  // Convert start-of-day back to UTC for Supabase comparison
  const startOfDayUtc = new Date(startOfDay.getTime() - 7 * 60 * 60 * 1000).toISOString();

  try {
    const { data } = await sb
      .from(TABLE)
      .select('id')
      .eq('event_type', 'WAKE_UP')
      .gte('created_at', startOfDayUtc)
      .limit(1);

    if (data && data.length > 0) {
      console.log('[BEHAVIOR] WAKE_UP already logged today. Skipping duplicate.');
      return;
    }
  } catch (e) {
    // Table may not exist yet — safe to continue and attempt insert
    console.warn('[BEHAVIOR] Could not check WAKE_UP dedup:', e.message);
  }

  const { hour } = _getJakartaTimeDetails();
  await logBehaviorEvent('WAKE_UP', { wake_hour: hour });
}

/**
 * Log a FINANCE_RECORD event whenever a transaction is saved.
 * @param {{ type: string, nominal: number, category: string }} txSummary
 */
async function logFinanceRecord(txSummary = {}) {
  await logBehaviorEvent('FINANCE_RECORD', {
    type: txSummary.type || 'UNKNOWN',
    nominal: txSummary.nominal || 0,
    category: txSummary.category || 'Lainnya'
  });
}

/**
 * Log a MOOD_DETECTED event from AI_Router.
 * @param {string} mood - e.g. 'STRESSED', 'HAPPY', 'TIRED', 'FOCUSED', 'BORED', 'NEUTRAL'
 * @param {string} [sourceText] - First 100 chars of the user message that triggered detection
 */
async function logMood(mood, sourceText = '') {
  if (!mood || mood === 'NEUTRAL') return; // Don't clutter the log with every neutral message
  await logBehaviorEvent('MOOD_DETECTED', {
    mood: String(mood).toUpperCase(),
    source_preview: String(sourceText).substring(0, 100)
  });
}

/**
 * Log a PASSIVE_LEARNING event whenever N.E.X.A learns a fact about the user.
 * @param {string} fact - The extracted user fact
 * @param {string} type - 'USER_PROFILE' or 'CORE_IDENTITY'
 */
async function logPassiveLearning(fact, type = 'USER_PROFILE') {
  await logBehaviorEvent('PASSIVE_LEARNING', {
    fact: String(fact).substring(0, 200),
    type
  });
}

/**
 * Log a USER_INTERACTION event to track daily activity and intent patterns.
 * @param {string} intent - The identified intent
 * @param {string} [sourceText] - First 80 chars of user message
 * @param {string} [mood] - Detected mood
 */
async function logUserInteraction(intent, sourceText = '', mood = 'NEUTRAL') {
  await logBehaviorEvent('USER_INTERACTION', {
    intent: String(intent || 'NORMAL_CHAT'),
    preview: String(sourceText).substring(0, 80),
    mood: String(mood || 'NEUTRAL')
  });
}

/**
 * Fetch a summary of behavior events for the past 7 days.
 * Returns grouped counts by event_type and statistics about routines.
 * Used by the Weekly Strategic Review cron.
 *
 * @returns {Promise<object>} Summary object with stats
 */
async function getWeeklySummary() {
  const sb = getSupabase();
  if (!sb) return null;

  // 7 days ago in UTC
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  try {
    const { data, error } = await sb
      .from(TABLE)
      .select('event_type, event_data, hour_of_day, day_of_week, created_at')
      .gte('created_at', sevenDaysAgo)
      .order('created_at', { ascending: true });

    if (error) {
      console.warn('[BEHAVIOR] Failed to fetch weekly summary:', error.message);
      return null;
    }

    if (!data || data.length === 0) return { totalEvents: 0, events: [] };

    // ── Group by event_type ───────────────────────────────────────────────
    const grouped = {};
    for (const row of data) {
      if (!grouped[row.event_type]) grouped[row.event_type] = [];
      grouped[row.event_type].push(row);
    }

    // ── Wake time analysis ───────────────────────────────────────────────
    const wakeUps = grouped['WAKE_UP'] || [];
    const wakeHours = wakeUps.map(r => r.event_data?.wake_hour).filter(h => h !== undefined);
    const avgWakeHour = wakeHours.length > 0
      ? Math.round(wakeHours.reduce((a, b) => a + b, 0) / wakeHours.length)
      : null;

    // ── Mood analysis ─────────────────────────────────────────────────────
    const moods = grouped['MOOD_DETECTED'] || [];
    const moodCounts = {};
    for (const m of moods) {
      const mood = m.event_data?.mood || 'UNKNOWN';
      moodCounts[mood] = (moodCounts[mood] || 0) + 1;
    }
    const dominantMood = Object.entries(moodCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || 'NEUTRAL';

    // ── Finance activity ──────────────────────────────────────────────────
    const financeRecords = grouped['FINANCE_RECORD'] || [];
    const totalSpending = financeRecords
      .filter(r => r.event_data?.type === 'EXPENSE')
      .reduce((sum, r) => sum + (r.event_data?.nominal || 0), 0);
    const totalIncome = financeRecords
      .filter(r => r.event_data?.type === 'INCOME')
      .reduce((sum, r) => sum + (r.event_data?.nominal || 0), 0);

    return {
      totalEvents: data.length,
      periodDays: 7,
      wakeUp: {
        count: wakeUps.length,
        avgHour: avgWakeHour,
        avgHourLabel: avgWakeHour !== null ? `${avgWakeHour.toString().padStart(2, '0')}:00 WIB` : 'N/A'
      },
      mood: {
        dominant: dominantMood,
        counts: moodCounts,
        totalLogged: moods.length
      },
      finance: {
        transactionCount: financeRecords.length,
        totalSpending,
        totalIncome,
        avgDailySpending: Math.round(totalSpending / 7)
      },
      rawGrouped: grouped
    };
  } catch (e) {
    console.warn('[BEHAVIOR] Unexpected error in getWeeklySummary:', e.message);
    return null;
  }
}

/**
 * Format the weekly behavior summary into a Telegram-ready string.
 * @param {object} summary - Result of getWeeklySummary()
 * @returns {string}
 */
function formatWeeklySummary(summary) {
  if (!summary || summary.totalEvents === 0) {
    return '📊 Belum ada data perilaku yang tercatat minggu ini, Tuan.';
  }

  const { wakeUp, mood, finance } = summary;
  const formatRp = (n) => `Rp${Math.abs(n || 0).toLocaleString('id-ID')}`;

  let msg = `📊 <b>Laporan Pola Perilaku Mingguan</b>\n`;
  msg += `<i>(${summary.periodDays} hari terakhir — ${summary.totalEvents} event tercatat)</i>\n\n`;

  msg += `⏰ <b>Rutinitas Bangun:</b>\n`;
  msg += `   Rata-rata jam bangun: <b>${wakeUp.avgHourLabel}</b>\n`;
  msg += `   Tercatat ${wakeUp.count}x dalam 7 hari\n\n`;

  msg += `🧠 <b>Mood Dominan:</b> ${mood.dominant}\n`;
  if (mood.totalLogged > 0) {
    const moodLines = Object.entries(mood.counts)
      .sort((a, b) => b[1] - a[1])
      .map(([m, c]) => `   ${m}: ${c}x`)
      .join('\n');
    msg += moodLines + '\n\n';
  } else {
    msg += `   (Belum ada mood yang terdeteksi)\n\n`;
  }

  msg += `💸 <b>Aktivitas Keuangan:</b>\n`;
  msg += `   Total transaksi: ${finance.transactionCount}x\n`;
  msg += `   Total pengeluaran: <b>${formatRp(finance.totalSpending)}</b>\n`;
  msg += `   Total pemasukan: <b>${formatRp(finance.totalIncome)}</b>\n`;
  msg += `   Rata-rata pengeluaran/hari: ${formatRp(finance.avgDailySpending)}\n`;

  return msg;
}

// ============================================================
// [PHASE 7 — M3] EMOTIONAL TIME-SERIES ENGINE
// ============================================================

/**
 * Menghitung dan menyimpan 3 metrik mood rolling berdasarkan data 7 hari terakhir.
 * Dipanggil oleh cron.js setiap malam agar Inference Engine selalu punya
 * gambaran tren emosional terbaru saat menjalankan Weekly Identity Inference.
 *
 * Menghasilkan event MOOD_TIME_SERIES dengan 3 dimensi:
 *   - mood_24h_state  : NEGATIVE | NEUTRAL | POSITIVE   (snapshot 24 jam terakhir)
 *   - mood_7d_trend   : ASCENDING | STABLE | DESCENDING (tren 7 hari)
 *   - mood_7d_variance: LOW | HIGH                      (konsistensi emosi)
 *
 * Algoritma:
 *   1. Bagi 7 hari menjadi dua paruh: 3 hari pertama (lama) vs 4 hari terakhir (baru)
 *   2. Hitung skor rata-rata mood tiap paruh (POSITIVE=+1, NEUTRAL=0, NEGATIVE=-1)
 *   3. Tren = perbedaan skor antar paruh (>0.2 = ASCENDING, <-0.2 = DESCENDING)
 *   4. Variance = standar deviasi skor (>0.7 = HIGH)
 *
 * @returns {Promise<{mood_24h_state: string, mood_7d_trend: string, mood_7d_variance: string}|null>}
 */
async function computeMoodTimeSeries() {
  const sb = getSupabase();
  if (!sb) {
    console.warn('[BEHAVIOR] Supabase not configured. Skipping Mood Time-Series.');
    return null;
  }

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const oneDayAgo    = new Date(Date.now() - 1  * 24 * 60 * 60 * 1000).toISOString();

  try {
    // Ambil semua MOOD_DETECTED dan USER_INTERACTION 7 hari terakhir
    const { data, error } = await sb
      .from(TABLE)
      .select('event_type, event_data, created_at')
      .in('event_type', ['MOOD_DETECTED', 'USER_INTERACTION'])
      .gte('created_at', sevenDaysAgo)
      .order('created_at', { ascending: true });

    if (error) {
      console.warn('[BEHAVIOR] Failed to fetch mood data for time-series:', error.message);
      return null;
    }

    if (!data || data.length === 0) {
      console.log('[BEHAVIOR] No mood data in last 7 days. Skipping time-series.');
      return null;
    }

    // ── Fungsi pemetaan mood ke skor numerik ─────────────────────────────
    const MOOD_SCORE = {
      'HAPPY':    1.0,  'EXCITED':  1.0, 'MOTIVATED': 0.8, 'FOCUSED':   0.5,
      'POSITIVE': 1.0,  'NEUTRAL':  0.0, 'CALM':      0.2,
      'TIRED':   -0.5,  'BORED':   -0.3, 'STRESSED': -0.8, 'NEGATIVE': -1.0,
      'ANXIOUS': -0.7,  'ANGRY':   -0.8, 'SAD':      -0.9, 'UNKNOWN':   0.0,
    };

    const getMoodScore = (eventData, eventType) => {
      const mood = eventType === 'USER_INTERACTION'
        ? eventData?.mood
        : eventData?.mood;
      if (!mood) return null;
      const upper = String(mood).toUpperCase();
      return MOOD_SCORE[upper] ?? 0.0;
    };

    // ── Pisahkan data berdasarkan waktu ───────────────────────────────────
    const now = Date.now();
    const threeDaysAgo = now - 3 * 24 * 60 * 60 * 1000;

    const scores7d  = [];  // Semua skor 7 hari
    const scoresOld = [];  // Skor 3 hari pertama (hari ke 7-4)
    const scoresNew = [];  // Skor 4 hari terakhir (hari ke 3-0)
    // [BUG FIX #4] Array scores24h dihapus karena dead code — menggunakan
    // oneDayAgo.length (panjang string ISO = 24 char) sebagai millisecond,
    // bukan 24 jam. Diganti dengan scores24hReal di bawah yang sudah benar.

    for (const row of data) {
      const score = getMoodScore(row.event_data, row.event_type);
      if (score === null) continue;

      const ts = new Date(row.created_at).getTime();
      scores7d.push(score);

      // [BUG FIX #4] Kondisi scores24h dihapus (dead code, lihat komentar di atas).
      // Pemisahan old/new tetap dipertahankan untuk kalkulasi tren 7 hari:
      if (ts < threeDaysAgo) {
        scoresOld.push(score);
      } else {
        scoresNew.push(score);
      }
    }

    // Hitung ulang scores24h dengan perbandingan timestamp yang benar
    const scores24hReal = data
      .filter(r => new Date(r.created_at).getTime() >= Date.now() - 24 * 60 * 60 * 1000)
      .map(r => getMoodScore(r.event_data, r.event_type))
      .filter(s => s !== null);

    // ── Hitung metrik 24h ─────────────────────────────────────────────────
    let mood_24h_state = 'NEUTRAL';
    if (scores24hReal.length > 0) {
      const avg24h = scores24hReal.reduce((a, b) => a + b, 0) / scores24hReal.length;
      if (avg24h > 0.25)       mood_24h_state = 'POSITIVE';
      else if (avg24h < -0.25) mood_24h_state = 'NEGATIVE';
      else                     mood_24h_state = 'NEUTRAL';
    }

    // ── Hitung tren 7 hari ────────────────────────────────────────────────
    let mood_7d_trend = 'STABLE';
    if (scoresOld.length > 0 && scoresNew.length > 0) {
      const avgOld = scoresOld.reduce((a, b) => a + b, 0) / scoresOld.length;
      const avgNew = scoresNew.reduce((a, b) => a + b, 0) / scoresNew.length;
      const delta  = avgNew - avgOld;
      if      (delta > 0.20)  mood_7d_trend = 'ASCENDING';
      else if (delta < -0.20) mood_7d_trend = 'DESCENDING';
      else                    mood_7d_trend = 'STABLE';
    }

    // ── Hitung variance 7 hari ────────────────────────────────────────────
    let mood_7d_variance = 'LOW';
    if (scores7d.length >= 3) {
      const mean = scores7d.reduce((a, b) => a + b, 0) / scores7d.length;
      const variance = scores7d.reduce((sum, s) => sum + Math.pow(s - mean, 2), 0) / scores7d.length;
      const stdDev = Math.sqrt(variance);
      mood_7d_variance = stdDev > 0.50 ? 'HIGH' : 'LOW';
    }

    // ── Simpan sebagai event MOOD_TIME_SERIES di nexa_behavior_log ────────
    const timeSeries = { mood_24h_state, mood_7d_trend, mood_7d_variance };
    await logBehaviorEvent('MOOD_TIME_SERIES', {
      ...timeSeries,
      sample_count:    scores7d.length,
      sample_count_24h: scores24hReal.length,
      computed_at:     new Date().toISOString()
    });

    console.log(`[BEHAVIOR] 📊 Mood Time-Series computed: 24h=${mood_24h_state} | 7d_trend=${mood_7d_trend} | variance=${mood_7d_variance}`);
    return timeSeries;

  } catch (e) {
    console.warn('[BEHAVIOR] Unexpected error in computeMoodTimeSeries:', e.message);
    return null;
  }
}

module.exports = {
  logBehaviorEvent,
  logWakeUp,
  logFinanceRecord,
  logMood,
  logPassiveLearning,
  logUserInteraction,
  getWeeklySummary,
  formatWeeklySummary,
  computeMoodTimeSeries,   // [PHASE 7 — M3]
};
