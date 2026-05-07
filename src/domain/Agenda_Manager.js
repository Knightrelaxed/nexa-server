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
 * Uses fast regex for obvious cases, then falls back to AI for creative/ambiguous phrasing.
 * Handles: "setengah jam", "sejam", "½ jam", "¾ jam", "dua jam", "kira-kira 2 jam lah",
 *          "sekitar 45 menit", "1 jam 30 menit", "an hour", "30 minutes", bare numbers, etc.
 */
async function parseDurationMinutes(text) {
  if (!text) return null;
  const t = text.toLowerCase().trim();

  // --- FAST PATH: Obvious regex cases ---

  // Unicode fractions: ½ jam, ¼ jam, ¾ jam
  if (t.includes('½') || t.includes('0.5 jam') || t.includes('0,5 jam')) {
    const base = t.match(/(\d+)\s*½\s*jam/);
    return base ? parseInt(base[1]) * 60 + 30 : 30;
  }
  if (t.includes('¼ jam') || t.includes('quarter')) return 15;
  if (t.includes('¾ jam')) return 45;

  // "sejam" / "sejaman" (Indonesian shorthand for "satu jam")
  if (/\bsejam\w*\b/.test(t)) return 60;

  // "setengah jam" / "half hour" / "half an hour"
  if (/setengah\s*jam|half[\s-]*(an\s*)?hour/.test(t)) return 30;

  // "X jam Y menit" — e.g. "1 jam 30 menit", "2 jam 15 menit"
  const jamMenitMatch = t.match(/(\d+(?:[.,]\d+)?)\s*jam\s*(\d+)\s*menit/);
  if (jamMenitMatch) return Math.round(parseFloat(jamMenitMatch[1].replace(',', '.')) * 60) + parseInt(jamMenitMatch[2]);

  // "X,5 jam" / "X.5 jam" — e.g. "1,5 jam"
  const halfJamMatch = t.match(/(\d+)[.,]5\s*jam/);
  if (halfJamMatch) return parseInt(halfJamMatch[1]) * 60 + 30;

  // "X jam" — e.g. "2 jam", "1 jam"
  const jamMatch = t.match(/(\d+(?:[.,]\d+)?)\s*jam/);
  if (jamMatch) return Math.round(parseFloat(jamMatch[1].replace(',', '.')) * 60);

  // "X menit" / "X minutes" — e.g. "45 menit", "90 minutes"
  const menitMatch = t.match(/(\d+)\s*(menit|minutes?|min)/);
  if (menitMatch) return parseInt(menitMatch[1]);

  // "X hours" / "X hour" (English)
  const hourMatch = t.match(/(\d+(?:[.,]\d+)?)\s*hours?/);
  if (hourMatch) return Math.round(parseFloat(hourMatch[1].replace(',', '.')) * 60);

  // Bare small number (< 360 treated as minutes, e.g. user says "60" or "90")
  const bareNum = t.match(/^\s*(\d{1,3})\s*$/);
  if (bareNum && parseInt(bareNum[1]) <= 360) return parseInt(bareNum[1]);

  // --- SLOW PATH: Ask AI to extract duration ---
  // Guard: only call AI if the text actually LOOKS like a duration answer
  // Must have a number+unit OR well-known shorthand - NOT just a time reference like "jam 7 malam"
  const durationPatterns = /\d+\s*(jam|menit|hours?|minutes?|min)|sejam\w*|setengah\s*jam|half[\s-]*(an\s*)?hour|\b\u00bd|\b\u00bc|\b\u00be/i;
  if (!durationPatterns.test(t)) {
    return null;
  }

  try {
    const aiRouter = require('../core/AI_Router');
    const prompt = `Ekstrak HANYA jumlah menit dari teks berikut. Jawab HANYA dengan angka bulat, tanpa teks lain. Jika tidak ada durasi waktu kegiatan, jawab 0.\n\nTeks: "${text}"`;
    const raw = await aiRouter.callAI(prompt);
    const num = parseInt(String(raw).trim());
    if (!isNaN(num) && num > 0 && num <= 1440) {
      console.log(`[AGENDA] AI parsed duration: "${text}" → ${num} menit`);
      return num;
    }
  } catch (e) {
    console.error('[AGENDA] AI duration parse failed:', e.message);
  }

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
        // Validate start before doing any date math
        const startDate = new Date(start);
        if (isNaN(startDate.getTime())) {
          return { status: 'FAILED', message: `❌ Format waktu untuk kegiatan '${summary}' tidak valid. Mohon sebutkan ulang waktunya, Tuan? (Contoh: "jam 7 malam" atau "19:00")` };
        }

        // Try to extract duration from rawUserText (for follow-up answers like "setengah jam")
        const durationMins = await parseDurationMinutes(rawUserText);
        if (durationMins) {
          startDate.setMinutes(startDate.getMinutes() + durationMins);
          const computedEnd = startDate.toISOString();
          const result = await googleWorkspace.createCalendarEvent(summary, start, computedEnd, description || '');
          return { status: 'SUCCESS', message: `✅ Jadwal '<b>${summary}</b>' berhasil ditambahkan ke kalender (durasi <b>${durationMins} menit</b>).`, eventId: result.id };
        }

        // No duration in text → return PENDING_END and schedule auto-create after 15 min
        const pendingId = `${summary}_${start}`;
        if (!pendingAgendas.has(pendingId)) {
          const autoEnd = new Date(startDate.getTime() + 60 * 60 * 1000).toISOString();
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
  const durationMins = await parseDurationMinutes(userText);
  if (!durationMins) return null; // Not a duration answer, let AI Router handle it

  try {
    const startDate = new Date(pendingCtx.start);
    if (isNaN(startDate.getTime())) {
      // start stored in context is invalid — ask the user to re-state the full event
      return {
        status: 'FAILED',
        message: `❌ Maaf Tuan, saya kehilangan informasi waktu mulai untuk '<b>${pendingCtx.summary}</b>'. Mohon ulangi perintahnya lengkap ya, contoh: "<i>Tambahkan makan malam jam 7 malam, durasi 2 jam</i>"`
      };
    }
    startDate.setMinutes(startDate.getMinutes() + durationMins);
    const computedEnd = startDate.toISOString();
    await googleWorkspace.createCalendarEvent(pendingCtx.summary, pendingCtx.start, computedEnd, '');
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
