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

async function handleCalendarIntent(extractedData) {
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
        const pendingId = `${summary}_${start}`;
        if (!pendingAgendas.has(pendingId)) {
          const startDate = new Date(start);
          startDate.setHours(startDate.getHours() + 1);
          const finalEnd = startDate.toISOString();
          
          const timer = setTimeout(async () => {
            if (pendingAgendas.has(pendingId)) {
              try {
                const data = pendingAgendas.get(pendingId);
                const result = await googleWorkspace.createCalendarEvent(data.summary, data.start, data.end, data.description || '');
                sendTelegramOutbound(`⏳ Waktu konfirmasi habis! Jadwal '${data.summary}' telah otomatis ditambahkan ke kalender dengan durasi standar (1 jam).`);
              } catch (e) {
                console.error('[AGENDA] Auto-create failed:', e);
              }
              pendingAgendas.delete(pendingId);
            }
          }, 15 * 60 * 1000); // 15 minutes

          pendingAgendas.set(pendingId, { summary, start, end: finalEnd, description, timer });
        }
        return { status: 'FAILED', message: `❌ Kira-kira berapa lama durasi untuk kegiatan '${summary}' ini, Tuan?\n\n_(Jika tidak ada jawaban dalam 15 menit, N.E.X.A akan otomatis menambahkannya dengan durasi standar 1 jam)_` };
      }

      // If we reach here, end is provided. Clear any pending matching agendas!
      for (const [id, data] of pendingAgendas.entries()) {
        if (data.summary.toLowerCase() === summary.toLowerCase() || data.start === start) {
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

module.exports = { handleCalendarIntent };
