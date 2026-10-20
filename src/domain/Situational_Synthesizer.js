/**
 * ============================================================
 * [N.E.X.A v3.4] DYNAMIC SITUATIONAL AWARENESS ENGINE (DSAE)
 * Situational_Synthesizer.js
 * ============================================================
 * Menghasilkan sintesis situasi dan kondisi Tuan Faqih secara real-time
 * dan deterministik (0ms CPU, tanpa halusinasi LLM):
 * 1. Posisi temporal presisi dalam agenda harian (ongoing, jeda/gap, sisa menit riil).
 * 2. Status mobilitas fisik & telemetri sensor (USER_MOVING, lokasi, layar, baterai).
 * 3. Inersia emosional multiturn (15-menit decay) agar empati tidak hilang saat pesan singkat.
 * ============================================================
 */

'use strict';

const presenceModel = require('./Presence_Model');

// In-memory Emotional Inertia Tracker (15 menit TTL)
const EMOTIONAL_DECAY_MS = 15 * 60 * 1000;
let _lastEmotionState = {
  mood: 'NEUTRAL',
  userText: '',
  recordedAt: 0
};

/**
 * Format timestamp ISO / Date ke string jam menit WIB (HH:mm)
 */
function formatHHMM_WIB(dateOrIso) {
  if (!dateOrIso) return '--:--';
  const d = new Date(dateOrIso);
  if (isNaN(d.getTime())) return '--:--';
  return d.toLocaleTimeString('id-ID', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Jakarta'
  }).replace('.', ':');
}

/**
 * Rekam emosi giliran obrolan untuk inersia emosional multiturn
 */
function recordTurnEmotion(mood, userText = '') {
  if (!mood) return;
  const normalized = String(mood).toUpperCase().trim();
  const SIGNIFICANT_MOODS = new Set([
    'STRESSED', 'ANGRY', 'FRUSTRATED', 'TIRED', 'BORED', 'SAD', 'ANXIOUS', 'EXCITED', 'HAPPY', 'MOTIVATED'
  ]);

  if (SIGNIFICANT_MOODS.has(normalized)) {
    _lastEmotionState = {
      mood: normalized,
      userText: String(userText || '').substring(0, 80),
      recordedAt: Date.now()
    };
  } else if (normalized === 'NEUTRAL' || normalized === 'CALM') {
    // Biarkan luruh secara bertahap melalui decay, jangan hapus instan
  }
}

/**
 * Dapatkan inersia emosional aktif
 */
function getActiveEmotionalInertia(now = Date.now()) {
  if (!_lastEmotionState.recordedAt) return null;
  const elapsed = now - _lastEmotionState.recordedAt;
  if (elapsed > EMOTIONAL_DECAY_MS) {
    _lastEmotionState = { mood: 'NEUTRAL', userText: '', recordedAt: 0 };
    return null;
  }
  const minsAgo = Math.max(1, Math.round(elapsed / 60000));
  return {
    mood: _lastEmotionState.mood,
    minsAgo,
    userText: _lastEmotionState.userText
  };
}

/**
 * Evaluasi daftar event kalender hari ini terhadap waktu sekarang
 * @param {Array} events - Daftar event dari Google Workspace
 * @param {number} [nowMs] - Timestamp saat ini (default: Date.now())
 */
function evaluateAgendaPosition(events = [], nowMs = Date.now()) {
  if (!Array.isArray(events) || events.length === 0) {
    return {
      status: 'NO_EVENTS',
      ongoingEvent: null,
      nextUpcomingEvent: null,
      lastCompletedEvent: null,
      summaryText: 'Tidak ada agenda terjadwal di kalender hari ini.'
    };
  }

  const timedEvents = [];
  const allDayEvents = [];

  for (const ev of events) {
    const summary = ev.summary || '(Tanpa Judul)';
    const location = ev.location || null;
    const startRaw = ev.start?.dateTime || ev.start?.date;
    const endRaw = ev.end?.dateTime || ev.end?.date;

    if (!startRaw || !endRaw) continue;

    const isAllDay = !ev.start?.dateTime;
    if (isAllDay) {
      allDayEvents.push({ summary, location });
      continue;
    }

    const startMs = new Date(startRaw).getTime();
    const endMs = new Date(endRaw).getTime();

    if (isNaN(startMs) || isNaN(endMs)) continue;

    timedEvents.push({
      id: ev.id,
      summary,
      location,
      startMs,
      endMs,
      startHHMM: formatHHMM_WIB(startMs),
      endHHMM: formatHHMM_WIB(endMs)
    });
  }

  // Urutkan event berdasarkan jam mulai
  timedEvents.sort((a, b) => a.startMs - b.startMs);

  let ongoingEvent = null;
  let nextUpcomingEvent = null;
  let lastCompletedEvent = null;

  for (const ev of timedEvents) {
    if (nowMs >= ev.startMs && nowMs <= ev.endMs) {
      // Event sedang berlangsung saat ini
      const startedAgoMins = Math.max(0, Math.round((nowMs - ev.startMs) / 60000));
      const remainingMins = Math.max(0, Math.round((ev.endMs - nowMs) / 60000));
      ongoingEvent = {
        ...ev,
        startedAgoMins,
        remainingMins
      };
    } else if (nowMs < ev.startMs) {
      // Event mendatang pertama
      if (!nextUpcomingEvent) {
        const startsInMins = Math.max(1, Math.round((ev.startMs - nowMs) / 60000));
        nextUpcomingEvent = {
          ...ev,
          startsInMins
        };
      }
    } else if (nowMs > ev.endMs) {
      // Event yang sudah lewat (ambil yang paling akhir selesai)
      const endedAgoMins = Math.max(0, Math.round((nowMs - ev.endMs) / 60000));
      lastCompletedEvent = {
        ...ev,
        endedAgoMins
      };
    }
  }

  let summaryText = '';
  let status = 'IDLE';

  if (ongoingEvent) {
    status = 'ONGOING';
    const locStr = ongoingEvent.location ? ` di ${ongoingEvent.location}` : '';
    summaryText = `SEDANG BERLANGSUNG '${ongoingEvent.summary}'${locStr} (dimulai ${ongoingEvent.startHHMM} WIB, selesai ${ongoingEvent.endHHMM} WIB — TERSISA ~${ongoingEvent.remainingMins} MENIT LAGI).`;
    if (nextUpcomingEvent) {
      const nextLoc = nextUpcomingEvent.location ? ` di ${nextUpcomingEvent.location}` : '';
      summaryText += ` Agenda berikutnya '${nextUpcomingEvent.summary}'${nextLoc} pukul ${nextUpcomingEvent.startHHMM} WIB (dimulai dalam ~${nextUpcomingEvent.startsInMins} menit lagi).`;
    }
  } else if (nextUpcomingEvent && lastCompletedEvent) {
    status = 'GAP';
    summaryText = `WAKTU JEDA / TRANSISI. Baru saja selesai '${lastCompletedEvent.summary}' (${lastCompletedEvent.endedAgoMins} menit lalu). Agenda berikutnya '${nextUpcomingEvent.summary}' pukul ${nextUpcomingEvent.startHHMM} WIB (dalam ~${nextUpcomingEvent.startsInMins} menit lagi).`;
  } else if (nextUpcomingEvent && !lastCompletedEvent) {
    status = 'BEFORE_FIRST';
    summaryText = `BELUM ADA SESI DIMULAI. Agenda pertama hari ini: '${nextUpcomingEvent.summary}' pukul ${nextUpcomingEvent.startHHMM} WIB (dalam ~${nextUpcomingEvent.startsInMins} menit lagi).`;
  } else if (!nextUpcomingEvent && lastCompletedEvent) {
    status = 'ALL_COMPLETED';
    summaryText = `SELURUH AGENDA HARI INI TELAH SELESAI. Sesi terakhir adalah '${lastCompletedEvent.summary}' (selesai ${lastCompletedEvent.endHHMM} WIB). Tuan dalam waktu luang / istirahat.`;
  } else if (allDayEvents.length > 0) {
    status = 'ALL_DAY_ONLY';
    summaryText = `Agenda seharian aktif: ${allDayEvents.map(a => a.summary).join(', ')}.`;
  } else {
    status = 'NO_EVENTS';
    summaryText = 'Tidak ada agenda terjadwal di kalender hari ini.';
  }

  return {
    status,
    ongoingEvent,
    nextUpcomingEvent,
    lastCompletedEvent,
    allDayEvents,
    summaryText
  };
}

/**
 * Sintesis status fisik dan mobilitas dari Presence_Model
 */
function evaluatePhysicalState(now = Date.now()) {
  const snap = presenceModel.snapshot ? presenceModel.snapshot() : {};
  const lines = [];

  // 1. Lokasi Spasial
  if (snap.place) {
    const placeAgo = snap.placeAt ? Math.round((now - snap.placeAt) / 60000) : null;
    const agoStr = placeAgo !== null ? (placeAgo <= 0 ? 'baru saja' : `${placeAgo}m lalu`) : '';
    lines.push(`Lokasi: ${snap.place}${agoStr ? ` (${agoStr})` : ''}`);
  }

  // 2. Mobilitas & Pergerakan (dari Tasker sensor)
  if (snap.lastEvent) {
    const isMoving = snap.lastEvent === 'USER_MOVING' || snap.lastEvent.includes('MOVING');
    const eventAgo = snap.lastEventAt ? Math.round((now - snap.lastEventAt) / 60000) : null;
    if (isMoving && eventAgo !== null && eventAgo <= 20) {
      lines.push(`Mobilitas: Terdeteksi sedang bergerak / berjalan / berpindah tempat (${eventAgo <= 0 ? 'baru saja' : `${eventAgo}m lalu`})`);
    } else if (snap.lastEvent && eventAgo !== null && eventAgo <= 15) {
      lines.push(`Sensor Terakhir: ${snap.lastEvent} (${eventAgo <= 0 ? 'baru saja' : `${eventAgo}m lalu`})`);
    }
  }

  // 3. Telemetri HP (Layar & Baterai)
  const deviceDetails = [];
  if (snap.isScreenOn !== null && snap.isScreenOn !== undefined) {
    deviceDetails.push(`Layar ${snap.isScreenOn ? 'Menyala' : 'Mati'}`);
  }
  if (snap.batteryLevel !== null && snap.batteryLevel !== undefined) {
    deviceDetails.push(`Baterai ${snap.batteryLevel}%`);
  }
  if (snap.light && snap.light.condition) {
    deviceDetails.push(`Ruangan ${snap.light.condition}`);
  }
  if (deviceDetails.length > 0) {
    lines.push(`Perangkat HP: ${deviceDetails.join(', ')}`);
  }

  return lines.length > 0 ? lines.join(' | ') : 'Kondisi fisik: Standby normal';
}

/**
 * Bangun blok prompt komprehensif untuk diinjeksi ke AI Router
 * @param {object} params
 * @param {Array} [params.calendarEvents] - Daftar event hari ini (dari Google_Workspace)
 * @param {number} [params.nowMs] - Timestamp sekarang
 */
function buildSituationalPromptBlock(params = {}) {
  const nowMs = params.nowMs || Date.now();
  const calendarEvents = params.calendarEvents || [];

  const agendaEval = evaluateAgendaPosition(calendarEvents, nowMs);
  const physicalState = evaluatePhysicalState(nowMs);
  const emotionInertia = getActiveEmotionalInertia(nowMs);

  const lines = [
    `[SITUASI & KONDISI NYATA TUAN FAQIH (REAL-TIME SITUATIONAL AWARENESS)]:`,
    `- Status Agenda: ${agendaEval.summaryText}`
  ];

  if (agendaEval.ongoingEvent) {
    lines.push(`  * PERINGATAN TEMPORAL: Sesi '${agendaEval.ongoingEvent.summary}' MASIH BERLANGSUNG hingga pukul ${agendaEval.ongoingEvent.endHHMM} WIB (sisa ${agendaEval.ongoingEvent.remainingMins} menit lagi). JANGAN PERNAH menyatakan sesi ini sudah selesai!`);
  }

  lines.push(`- Status Fisik & Sensor: ${physicalState}`);

  if (emotionInertia) {
    lines.push(`- Inersia Suasana Hati: Tuan menunjukkan tanda '${emotionInertia.mood}' (${emotionInertia.minsAgo}m lalu: "${emotionInertia.userText}"). Tetap responsif, hangat, dan berempati.`);
  }

  lines.push(`PANDUAN OPERASIONAL: Integrasikan pemahaman situasi di atas secara luwes. Jika Tuan bertanya atau menguji situasi ("lagi apa", "selesai jam berapa", "berapa menit lagi"), jawab langsung dengan fakta waktu & durasi riil di atas secara alami dan presisi.`);

  return `\n${lines.join('\n')}\n`;
}

module.exports = {
  recordTurnEmotion,
  getActiveEmotionalInertia,
  evaluateAgendaPosition,
  evaluatePhysicalState,
  buildSituationalPromptBlock,
  formatHHMM_WIB
};
