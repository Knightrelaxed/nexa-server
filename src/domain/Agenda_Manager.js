const googleWorkspace = require('../infrastructure/Google_Workspace');

async function handleCalendarIntent(extractedData) {
  const { action, summary, start, end, eventId, description } = extractedData;
  console.log(`[AGENDA] Executing Calendar Intent: ${action}`);

  try {
    if (action === 'CREATE') {
      if (!summary || !start || !end) {
        return { status: 'FAILED', message: 'Data tidak lengkap untuk membuat jadwal. Butuh: judul, waktu mulai, dan waktu selesai.' };
      }
      const result = await googleWorkspace.createCalendarEvent(summary, start, end, description || '');
      return { status: 'SUCCESS', message: `Jadwal '${summary}' berhasil ditambahkan ke kalender.`, eventId: result.id };
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
      // Guard: only update time if both start AND end are provided by AI.
      // Prevents sending undefined to Google API if user only wants to update the title.
      if (!start || !end) {
        return { status: 'FAILED', message: 'Untuk memperbarui jadwal, sebutkan juga waktu mulai dan selesai yang baru.' };
      }
      await googleWorkspace.updateCalendarEvent(targetEventId, summary, start, end, description || '');
      return { status: 'SUCCESS', message: `Jadwal '${summary}' berhasil diperbarui di kalender.` };
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

module.exports = { handleCalendarIntent };
