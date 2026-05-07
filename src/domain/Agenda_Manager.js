const googleWorkspace = require('../infrastructure/Google_Workspace');
const env = require('../config/env');
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);

const pendingAgendas = new Map();

async function sendTelegramOutbound(text) {
  try {
    if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID) return;
    const botToken = env.TELEGRAM_BOT_TOKEN.trim();
    const chatId = env.TELEGRAM_CHAT_ID.trim();
    const safeText = String(text).substring(0, 4000);
    const telegramUrl = `https://api.telegram.org/bot${botToken}/sendMessage?chat_id=${chatId}&parse_mode=HTML&text=${encodeURIComponent(safeText)}`;
    const targetUrl = env.TELEGRAM_PROXY_URL ? `${env.TELEGRAM_PROXY_URL}${encodeURIComponent(telegramUrl)}` : telegramUrl;
    await execPromise(`curl -sS --ipv4 --connect-timeout 10 --max-time 15 "${targetUrl}"`, { maxBuffer: 1 * 1024 * 1024 });
  } catch (e) {
    console.error('[AGENDA] Failed to send outbound telegram:', e.message);
  }
}

/**
 * Parse natural language duration into minutes.
 * Examples: "setengah jam" → 30, "1 jam" → 60, "2 jam" → 120, "45 menit" → 45
 */
function parseDurationMinutes(text) {
  if (!text) return null;
  const t = text.toLowerCase();
  // setengah jam / half hour
  if (t.includes('setengah jam') || t.includes('half hour') || t.includes('30 menit')) return 30;
  // X jam Y menit
  const jamMenitMatch = t.match(/(\d+(?:[.,]\d+)?)\s*jam\s*(\d+)\s*menit/);
  if (jamMenitMatch) return Math.round(parseFloat(jamMenitMatch[1]) * 60) + parseInt(jamMenitMatch[2]);
  // X.5 jam
  const halfJamMatch = t.match(/(\d+)[.,]5\s*jam/);
  if (halfJamMatch) return parseInt(halfJamMatch[1]) * 60 + 30;
  // X jam
  const jamMatch = t.match(/(\d+(?:[.,]\d+)?)\s*jam/);
  if (jamMatch) return Math.round(parseFloat(jamMatch[1].replace(',', '.')) * 60);
  // X menit
  const menitMatch = t.match(/(\d+)\s*menit/);
  if (menitMatch) return parseInt(menitMatch[1]);
  return null;
}

async function handleCalendarIntent(extractedData, rawUserText = '') {
  const { action, summary, start, end, eventId, description } = extractedData;
  console.log(`[AGENDA] Executing Calendar Intent: ${action}`);

  try {
    if (action === 'CREATE') {
      if (!summary) {
        return { status: 'FAILED', message: '❌ Mohon sebutkan nama kegiatannya, Tuan.' };
      }
      if (!start) {
        return { status: 'FAILED', message: `❌ Kapan kegiatan '${summary}' ini dilaksanakan, Tuan?` };
      }
      if (!end) {
        // Try to extract duration from rawUserText (for follow-up answers like "setengah jam")
        const durationMins = parseDurationMinutes(rawUserText);
        if (durationMins) {
          const startDate = new Date(start);
          startDate.setMinutes(startDate.getMinutes() + durationMins);
          const computedEnd = startDate.toISOString();
          const result = await googleWorkspace.createCalendarEvent(summary, start, computedEnd, description || '');
          return { status: 'SUCCESS', message: `✅ Jadwal '${summary}' berhasil ditambahkan ke kalender (durasi ${durationMins} menit).`, eventId: result.id };
        }

        // No duration in text → return PENDING_END and schedule auto-create after 15 min
        const pendingId = `${summary}_${start}`;
        if (!pendingAgendas.has(pendingId)) {
          const autoEnd = new Date(new Date(start).getTime() + 60 * 60 * 1000).toISOString();
          const timer = setTimeout(async () => {
            if (pendingAgendas.has(pendingId)) {
              try {
                const d = pendingAgendas.get(pendingId);
                await googleWorkspace.createCalendarEvent(d.summary, d.start, d.end, d.description || '');
                sendTelegramOutbound(`⏳ Waktu konfirmasi habis! Jadwal '<b>${d.summary}</b>' otomatis ditambahkan ke kalender (durasi standar 1 jam).`);
              } catch (e) { console.error('[AGENDA] Auto-create failed:', e); }
              pendingAgendas.delete(pendingId);
            }
          }, 15 * 60 * 1000);
          pendingAgendas.set(pendingId, { summary, start, end: autoEnd, description, timer });
        }
        return { status: 'PENDING_END', message: `❓ Kira-kira berapa lama durasi untuk '<b>${summary}</b>' ini, Tuan?

<i>(Jika tidak ada jawaban dalam 15 menit, N.E.X.A akan otomatis menambahkannya dengan durasi standar 1 jam)</i>` };
      }

      // end is provided — clear any matching pending
      for (const [id, data] of pendingAgendas.entries()) {
        if (data.summary.toLowerCase() === summary.toLowerCase()) {
          clearTimeout(data.timer);
          pendingAgendas.delete(id);
        }
      }

      const result = await googleWorkspace.createCalendarEvent(summary, start, end, description || '');
      return { status: 'SUCCESS', message: `✅ Jadwal '${summary}' berhasil ditambahkan ke kalender.`, eventId: result.id };
    }
    else if (action === 'UPDATE') {
      // If we have eventId directly from AI, use it. Otherwise, find the event by title.
      let targetEventId = eventId;
      if (!targetEventId && summary) {
        const found = await googleWorkspace.findEventByTitle(summary);
        if (found.length > 0) targetEventId = found[0].id;
      }
      if (!targetEventId) {
        return { status: 'FAILED', message: 'Tidak bisa memperbarui jadwal karena event tidak ditemukan. Coba sebutkan judul acaranya lebih spesifik.' };
      }
      // Guard: only update time if at least one is provided
      if (start && !end) {
        return { status: 'FAILED', message: `❌ Tuan merubah jam mulainya. Kira-kira akan selesai jam berapa acaranya?` };
      } else if (!start && end) {
        return { status: 'FAILED', message: `❌ Tuan merubah jam selesainya. Kira-kira acaranya dimulai jam berapa?` };
      }

      await googleWorkspace.updateCalendarEvent(targetEventId, summary, start, end, description || '');
      return { status: 'SUCCESS', message: `✅ Jadwal '${summary}' berhasil diperbarui di kalender.` };
    }
    else if (action === 'DELETE') {
      // Try to find by eventId first, then by title
      let targetEventId = eventId;
      if (!targetEventId && summary) {
        const found = await googleWorkspace.findEventByTitle(summary);
        if (found.length > 0) targetEventId = found[0].id;
      }
      if (!targetEventId) {
        return { status: 'FAILED', message: `Gagal menghapus: event '${summary || '(tanpa judul)'}' tidak ditemukan di kalender.` };
      }
      await googleWorkspace.deleteCalendarEvent(targetEventId);
      return { status: 'SUCCESS', message: `Jadwal '${summary || targetEventId}' berhasil dihapus dari kalender.` };
    }
    else if (action === 'READ') {
      // Return today's events as a readable summary for the AI to relay
      const events = await googleWorkspace.getTodaysEvents();
      if (!events || events.length === 0) {
        return { status: 'SUCCESS', message: 'Kalender hari ini kosong, Tuan.' };
      }
      const eventList = events.map((e, i) => {
        const startRaw = e.start?.dateTime || e.start?.date;
        const timeLabel = e.start?.dateTime
          ? new Date(startRaw).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta' })
          : 'Sepanjang hari';
        return `${i + 1}. ${timeLabel} — ${e.summary || '(Tanpa judul)'}`;
      }).join('\n');
      return { status: 'SUCCESS', message: `Agenda hari ini:\n${eventList}` };
    }
    else {
      return { status: 'FAILED', message: `Aksi kalender tidak dikenali: ${action}` };
    }
  } catch (error) {
    console.error('[AGENDA] Failed to manipulate calendar:', error.message);
    // Return structured error instead of throwing — prevents webhook.js from crashing
    return { status: 'FAILED', message: `Operasi kalender gagal: ${error.message}` };
  }
}

/**
 * Try to resolve a pending calendar event using the user's follow-up text.
 * Returns a result object if resolved, or null if text is not a recognizable duration.
 * @param {string} userText
 * @param {{ summary: string, start: string }} pendingCtx
 */
async function tryResolvePending(userText, pendingCtx) {
  const durationMins = parseDurationMinutes(userText);
  if (!durationMins) return null; // Not a duration answer, let AI Router handle it

  try {
    const startDate = new Date(pendingCtx.start);
    startDate.setMinutes(startDate.getMinutes() + durationMins);
    const computedEnd = startDate.toISOString();
    const result = await googleWorkspace.createCalendarEvent(pendingCtx.summary, pendingCtx.start, computedEnd, '');
    return { status: 'SUCCESS', message: `✅ Jadwal '<b>${pendingCtx.summary}</b>' berhasil ditambahkan ke kalender (durasi <b>${durationMins} menit</b>).` };
  } catch (e) {
    console.error('[AGENDA] tryResolvePending error:', e.message);
    return { status: 'FAILED', message: `❌ Gagal menyimpan jadwal: ${e.message}` };
  }
}

/**
 * Cancel the 15-minute auto-create timer for a pending event by summary name.
 * @param {string} summary
 */
function cancelPending(summary) {
  for (const [id, data] of pendingAgendas.entries()) {
    if (data.summary.toLowerCase() === summary.toLowerCase()) {
      clearTimeout(data.timer);
      pendingAgendas.delete(id);
      console.log(`[AGENDA] Pending timer for '${summary}' cancelled.`);
    }
  }
}

module.exports = { handleCalendarIntent, tryResolvePending, cancelPending };
