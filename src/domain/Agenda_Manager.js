const googleWorkspace = require('../infrastructure/Google_Workspace');
const googleTasks = require('../infrastructure/Google_Tasks');
const env = require('../config/env');
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);

const pendingAgendas = new Map();

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
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
  const { action, summary, start, end, eventId, description, location, reminder_minutes, recurrence, color_id } = extractedData;
  console.log(`[AGENDA] Executing Calendar Intent: ${action}`);

  try {
    if (action === 'CREATE') {
      if (!summary) {
        return { status: 'FAILED', message: '❌ Mohon sebutkan nama kegiatannya, Tuan.' };
      }
      if (!start) {
        return { status: 'FAILED', message: `❌ Kapan kegiatan '${summary}' ini dilaksanakan, Tuan?` };
      }
      const isMidnightUTC = start.includes('T00:00:00.000Z') || start.includes('T00:00:00Z') || start.includes('T17:00:00.000Z') || start.includes('T17:00:00Z');
      if (!start.includes('T') || isMidnightUTC) {
        return { status: 'FAILED', message: `❌ Tanggal untuk kegiatan '${summary}' sudah saya mengerti, tapi jam berapa pelaksanaannya, Tuan?` };
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

          // Check for conflicts before creating
          const conflicts = await googleWorkspace.checkCalendarConflicts(start, computedEnd);
          if (conflicts.length > 0) {
            const conflictList = conflicts.map(c => {
              const sTime = new Date(c.start).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta' });
              const eTime = new Date(c.end).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta' });
              return `   ⚠️ ${sTime}-${eTime}: ${c.summary}${c.location ? ` (${c.location})` : ''}`;
            }).join('\n');
            return {
              status: 'CONFLICT_DETECTED',
              message: `⚠️ <b>Konflik Jadwal Terdeteksi!</b>\n\nKegiatan '<b>${escapeHtml(summary)}</b>' bentrok dengan:\n${conflictList}\n\nApakah tetap ingin ditambahkan? (Balas: "ya" untuk lanjut, "batal" untuk membatalkan)`,
              conflicts: conflicts,
              pendingEvent: { summary, start, end: computedEnd, description, location, reminder_minutes, recurrence, color_id }
            };
          }

          const result = await googleWorkspace.createCalendarEvent(summary, start, computedEnd, description || '', location || '', reminder_minutes || [], recurrence || '', color_id || '');
          let successMsg = `✅ Jadwal '<b>${escapeHtml(summary)}</b>' berhasil ditambahkan ke kalender (durasi <b>${durationMins} menit</b>).`;
          if (location) successMsg += `\n📍 Lokasi: ${escapeHtml(location)}`;
          if (recurrence) successMsg += `\n🔄 Dijadwalkan berulang.`;
          if (color_id) successMsg += `\n🎨 Warna event disesuaikan.`;
          return { status: 'SUCCESS', message: successMsg, eventId: result.id };
        }

        // No duration in text → return PENDING_END and schedule auto-create after 15 min
        const pendingId = `${summary}_${start}`;
        if (!pendingAgendas.has(pendingId)) {
          const autoEnd = new Date(startDate.getTime() + 60 * 60 * 1000).toISOString();
          const timer = setTimeout(async () => {
            if (pendingAgendas.has(pendingId)) {
              try {
                const d = pendingAgendas.get(pendingId);
                await googleWorkspace.createCalendarEvent(d.summary, d.start, d.end, d.description || '', d.location || '', d.reminder_minutes || [], d.recurrence || '', d.color_id || '');
                const { sendTelegramOutbound } = require('../interfaces/webhook');
                sendTelegramOutbound(`⏳ Waktu konfirmasi habis! Jadwal '<b>${escapeHtml(d.summary)}</b>' otomatis ditambahkan ke kalender (durasi standar 1 jam).`);
              } catch (e) { console.error('[AGENDA] Auto-create failed:', e); }
              pendingAgendas.delete(pendingId);
            }
          }, 15 * 60 * 1000);
          pendingAgendas.set(pendingId, { summary, start, end: autoEnd, description, location, reminder_minutes, recurrence, color_id, timer });
        }
        return { status: 'PENDING_END', message: `❓ Kira-kira berapa lama durasi untuk '<b>${escapeHtml(summary)}</b>' ini, Tuan?

<i>(Jika tidak ada jawaban dalam 15 menit, N.E.X.A akan otomatis menambahkannya dengan durasi standar 1 jam)</i>` };
      }

      // end is provided — clear any matching pending
      for (const [id, data] of pendingAgendas.entries()) {
        if (data.summary.toLowerCase() === summary.toLowerCase()) {
          clearTimeout(data.timer);
          pendingAgendas.delete(id);
        }
      }

      // Check for conflicts before creating when end is provided
      const conflicts = await googleWorkspace.checkCalendarConflicts(start, end);
      if (conflicts.length > 0) {
        const conflictList = conflicts.map(c => {
          const sTime = new Date(c.start).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta' });
          const eTime = new Date(c.end).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta' });
          return `   ⚠️ ${sTime}-${eTime}: ${c.summary}${c.location ? ` (${c.location})` : ''}`;
        }).join('\n');
        return {
          status: 'CONFLICT_DETECTED',
          message: `⚠️ <b>Konflik Jadwal Terdeteksi!</b>\n\nKegiatan '<b>${escapeHtml(summary)}</b>' bentrok dengan:\n${conflictList}\n\nApakah tetap ingin ditambahkan? (Balas: "ya" untuk lanjut, "batal" untuk membatalkan)`,
          conflicts: conflicts,
          pendingEvent: { summary, start, end, description, location, reminder_minutes, recurrence, color_id }
        };
      }

      const result = await googleWorkspace.createCalendarEvent(summary, start, end, description || '', location || '', reminder_minutes || [], recurrence || '', color_id || '');
      let successMsg = `✅ Jadwal '${escapeHtml(summary)}' berhasil ditambahkan ke kalender.`;
      if (location) successMsg += `\n📍 Lokasi: ${escapeHtml(location)}`;
      if (recurrence) successMsg += `\n🔄 Dijadwalkan berulang.`;
      if (color_id) successMsg += `\n🎨 Warna event disesuaikan.`;

      // [PHASE 4: Proactive Calendar-to-Task Generation]
      try {
        const { callAI } = require('../core/AI_Router');
        const aiPrompt = `Acara kalender baru ditambahkan: "${summary}". Apakah acara ini (rapat, seminar, ujian, dll) umumnya membutuhkan 1-2 tugas persiapan yang terukur (seperti menyiapkan dokumen, membaca materi)? Jawab HANYA dengan "Ya, saya rekomendasikan tugas persiapan: 1. [Tugas 1] 2. [Tugas 2]" ATAU jawab "Tidak" jika acaranya kasual/tidak butuh persiapan. Jangan bertele-tele.`;
        const aiResponse = await callAI(aiPrompt);
        if (aiResponse.toLowerCase().startsWith('ya')) {
          successMsg += `\n\n💡 <b>Saran Proaktif N.E.X.A:</b>\n${escapeHtml(aiResponse)}\n<i>(Jika Tuan setuju, balas: "Buatkan tugas untuk persiapan agenda tersebut")</i>`;
        }
      } catch (e) {
        console.warn('[AGENDA] Failed to generate proactive tasks:', e.message);
      }

      return { status: 'SUCCESS', message: successMsg, eventId: result.id };
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
      return { status: 'SUCCESS', message: `✅ Jadwal '${escapeHtml(summary)}' berhasil diperbarui di kalender.` };
    }
    else if (action === 'DELETE') {
      // Try to find by eventId first, then by title
      let targetEventId = eventId;
      if (!targetEventId && summary) {
        const found = await googleWorkspace.findEventByTitle(summary);
        if (found.length > 0) targetEventId = found[0].id;
      }
      if (!targetEventId) {
        return { status: 'FAILED', message: `Gagal menghapus: event '${escapeHtml(summary || '(tanpa judul)')}' tidak ditemukan di kalender.` };
      }
      
      // Default to deleting THIS_ONLY to avoid accidentally nuking the entire series of a recurring event.
      const res = await googleWorkspace.deleteCalendarEvent(targetEventId, 'THIS_ONLY');
      const extraMsg = res.mode === 'ALL' ? ' beserta seluruh jadwal ulangannya (jika ada)' : '';
      return { status: 'SUCCESS', message: `Jadwal '${escapeHtml(summary || targetEventId)}'${extraMsg} berhasil dihapus dari kalender.` };
    }
    else if (action === 'READ') {
      let events;
      let contextLabel = 'Agenda hari ini:';
      if (start && end) {
        events = await googleWorkspace.getEventsByDateRange(start, end);
        contextLabel = `Agenda dari ${new Date(start).toLocaleDateString('id-ID')} sampai ${new Date(end).toLocaleDateString('id-ID')}:`;
      } else if (start) {
        // If only start is provided, assume that specific day
        const startDate = new Date(start);
        const endDate = new Date(startDate);
        endDate.setHours(23, 59, 59, 999);
        events = await googleWorkspace.getEventsByDateRange(start, endDate.toISOString());
        contextLabel = `Agenda untuk tanggal ${startDate.toLocaleDateString('id-ID')}:`;
      } else {
        events = await googleWorkspace.getTodaysEvents();
      }

      // If a summary search keyword was provided, filter the events
      if (summary) {
        const keyword = summary.toLowerCase();
        events = events.filter(e => (e.summary || '').toLowerCase().includes(keyword));
        contextLabel = `Hasil pencarian jadwal untuk '${summary}':`;
      }

      if (!events || events.length === 0) {
        return { status: 'SUCCESS', message: `${contextLabel}\n(Kosong / Tidak ada jadwal yang ditemukan)` };
      }
      
      const eventLines = await Promise.all(events.map(async (e, i) => {
        const startRaw = e.start?.dateTime || e.start?.date;
        const endRaw = e.end?.dateTime || e.end?.date;
        
        let timeLabel = '';
        if (e.start?.dateTime && e.end?.dateTime) {
           const sTime = new Date(startRaw).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta' });
           const eTime = new Date(endRaw).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta' });
           const sDate = new Date(startRaw).toLocaleDateString('id-ID', { day: '2-digit', month: 'short' });
           timeLabel = `${sDate} ${sTime} - ${eTime}`;
        } else {
           const sDate = new Date(startRaw).toLocaleDateString('id-ID', { day: '2-digit', month: 'short' });
           timeLabel = `${sDate} (Sepanjang hari)`;
        }
        let line = `${i + 1}. ${timeLabel} — ${e.summary || '(Tanpa judul)'}`;

        // [PREDICTIVE CONTEXT ENGINE]
        const lowerSummary = (e.summary || '').toLowerCase();
        const importantKeywords = ['rapat', 'meeting', 'seminar', 'ujian', 'proyek', 'presentasi', 'kuliah', 'tugas', 'sidang', 'bimbingan'];
        const isImportant = importantKeywords.some(kw => lowerSummary.includes(kw));
        
        if (isImportant) {
          try {
            const { readDatabaseTable } = require('../infrastructure/Supabase_Memories');
            
            let searchKw = lowerSummary;
            for (const kw of importantKeywords) {
              searchKw = searchKw.replace(kw, '').trim();
            }
            
            if (searchKw.length >= 3) {
              const vaultRes = await readDatabaseTable('nexa_vault_items', { searchKeyword: searchKw, limit: 1 });
              const hasVault = vaultRes.success && vaultRes.rows && vaultRes.rows.length > 0;
              
              const brainRes = await readDatabaseTable('nexa_2nd_brain', { searchKeyword: searchKw, limit: 1 });
              const hasBrain = brainRes.success && brainRes.rows && brainRes.rows.length > 0;
              
              if (hasVault || hasBrain) {
                const foundItems = [];
                if (hasVault) foundItems.push(`Dokumen Vault`);
                if (hasBrain) foundItems.push(`Catatan Memori`);
                line += `\n   🔗 <i>(Konteks Tersedia: ${foundItems.join(' & ')} terkait '${searchKw}')</i>`;
              }
            }
          } catch (err) {
            console.error('[AGENDA] Context prediction failed:', err.message);
          }
        }
        return line;
      }));
      const eventList = eventLines.join('\n');
      
      return { status: 'SUCCESS', message: `${contextLabel}\n${eventList}` };
    }
    else if (action === 'READ_TODAY') {
      // ── UNIFIED DAILY DASHBOARD: Calendar + Tasks ─────────
      const todayLabel = new Date().toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Jakarta' });
      let msg = `🗓️ <b>DASHBOARD HARI INI</b>\n<i>${todayLabel}</i>\n`;

      // 1. Calendar events today
      try {
        const events = await googleWorkspace.getTodaysEvents();
        if (events && events.length > 0) {
          msg += `\n📅 <b>JADWAL (${events.length}):</b>\n`;
          const eventLines = await Promise.all(events.map(async (e) => {
            const startRaw = e.start?.dateTime || e.start?.date;
            const endRaw = e.end?.dateTime || e.end?.date;
            let timeLabel = 'Sepanjang hari';
            if (e.start?.dateTime && e.end?.dateTime) {
              const s = new Date(startRaw).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta' });
              const en = new Date(endRaw).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta' });
              timeLabel = `${s} - ${en}`;
            }
            
            let line = `   ▸ ${timeLabel} — ${e.summary || '(Tanpa judul)'}`;

            // [PREDICTIVE CONTEXT ENGINE]
            const lowerSummary = (e.summary || '').toLowerCase();
            const importantKeywords = ['rapat', 'meeting', 'seminar', 'ujian', 'proyek', 'presentasi', 'kuliah', 'tugas', 'sidang', 'bimbingan'];
            const isImportant = importantKeywords.some(kw => lowerSummary.includes(kw));
            
            if (isImportant) {
              try {
                const { readDatabaseTable } = require('../infrastructure/Supabase_Memories');
                
                let searchKw = lowerSummary;
                for (const kw of importantKeywords) {
                  searchKw = searchKw.replace(kw, '').trim();
                }
                
                if (searchKw.length >= 3) {
                  const vaultRes = await readDatabaseTable('nexa_vault_items', { searchKeyword: searchKw, limit: 1 });
                  const hasVault = vaultRes.success && vaultRes.rows && vaultRes.rows.length > 0;
                  
                  const brainRes = await readDatabaseTable('nexa_2nd_brain', { searchKeyword: searchKw, limit: 1 });
                  const hasBrain = brainRes.success && brainRes.rows && brainRes.rows.length > 0;
                  
                  if (hasVault || hasBrain) {
                    const foundItems = [];
                    if (hasVault) foundItems.push(`Dokumen Vault`);
                    if (hasBrain) foundItems.push(`Catatan Memori`);
                    line += `\n     🔗 <i>(Konteks Tersedia: ${foundItems.join(' & ')} terkait '${searchKw}')</i>`;
                  }
                }
              } catch (err) {
                console.error('[AGENDA] Context prediction failed:', err.message);
              }
            }
            return line;
          }));
          msg += eventLines.join('\n');
        } else {
          msg += `\n📅 <b>JADWAL:</b> Tidak ada jadwal hari ini.\n`;
        }
      } catch (e) {
        msg += `\n📅 <b>JADWAL:</b> Gagal memuat (${e.message})\n`;
      }

      // 2. Overdue tasks alert
      try {
        const overdue = await googleTasks.getOverdueTasks();
        if (overdue.length > 0) {
          msg += `\n🔴 <b>TUGAS TERLAMBAT (${overdue.length}):</b>\n`;
          msg += overdue.map(t => {
            const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' });
            const dueStr = t.due.split('T')[0];
            const days = Math.floor((new Date() - new Date(dueStr + 'T00:00:00+07:00')) / (1000 * 60 * 60 * 24));
            return `   🔴 ${t.title} <i>(terlambat ${days} hari)</i>`;
          }).join('\n');
        }
      } catch (e) { /* ignore */ }

      // 3. Tasks due today
      try {
        const todayTasks = await googleTasks.getTasksDueToday();
        if (todayTasks.length > 0) {
          msg += `\n\n🟡 <b>TUGAS HARI INI (${todayTasks.length}):</b>\n`;
          msg += todayTasks.map(t => `   🔲 ${t.title}${t.notes ? `\n      📝 ${t.notes.split('\n')[0]}` : ''}`).join('\n');
        } else {
          msg += `\n\n📋 <b>TUGAS HARI INI:</b> Tidak ada tugas jatuh tempo hari ini.`;
        }
      } catch (e) { /* ignore */ }

      return { status: 'SUCCESS', message: msg };
    }
    else if (action === 'READ_UPCOMING') {
      // ── 7-DAY FORWARD VIEW: Calendar + Tasks ──────────────
      // Use locale-aware date calculation for Jakarta timezone
      const nowJakarta = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Jakarta' }));
      const startOfToday = new Date(nowJakarta); startOfToday.setHours(0, 0, 0, 0);
      const endOf7Days = new Date(nowJakarta); endOf7Days.setDate(endOf7Days.getDate() + 7); endOf7Days.setHours(23, 59, 59, 999);

      // Convert back to UTC for Google Calendar API
      const timeMin = new Date(startOfToday.toLocaleString('en-US', { timeZone: 'UTC' })).toISOString();
      const timeMax = new Date(endOf7Days.toLocaleString('en-US', { timeZone: 'UTC' })).toISOString();

      let msg = `📆 <b>7 HARI KE DEPAN</b>\n`;

      // Calendar events
      try {
        const events = await googleWorkspace.getEventsByDateRange(timeMin, timeMax);
        if (events && events.length > 0) {
          msg += `\n📅 <b>JADWAL (${events.length} acara):</b>\n`;
          msg += events.map(e => {
            const startRaw = e.start?.dateTime || e.start?.date;
            const dayLabel = new Date(startRaw).toLocaleDateString('id-ID', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Asia/Jakarta' });
            const timeStr = e.start?.dateTime ? new Date(startRaw).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta' }) : '';
            return `   ▸ ${dayLabel}${timeStr ? ' ' + timeStr : ''} — ${e.summary || '(Tanpa judul)'}`;
          }).join('\n');
        } else {
          msg += `\n📅 Tidak ada jadwal dalam 7 hari ke depan.\n`;
        }
      } catch (e) { msg += `\n📅 Gagal memuat jadwal (${e.message})\n`; }

      // Upcoming tasks
      try {
        const upTasks = await googleTasks.getUpcomingTasks(7);
        if (upTasks.length > 0) {
          msg += `\n\n📋 <b>TUGAS MENDATANG (${upTasks.length}):</b>\n`;
          const byDate = {};
          for (const t of upTasks) {
            const d = (t.due || '').split('T')[0];
            if (!byDate[d]) byDate[d] = [];
            byDate[d].push(t);
          }
          for (const [date, group] of Object.entries(byDate).sort()) {
            const label = new Date(date + 'T00:00:00+07:00').toLocaleDateString('id-ID', { weekday: 'short', day: 'numeric', month: 'short' });
            msg += `   📌 <b>${label}:</b> ${group.map(t => t.title).join(', ')}\n`;
          }
        } else {
          msg += `\n\n📋 Tidak ada tugas dalam 7 hari ke depan.`;
        }
      } catch (e) { /* ignore */ }

      return { status: 'SUCCESS', message: msg };
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
        message: `❌ Maaf Tuan, saya kehilangan informasi waktu mulai untuk '<b>${escapeHtml(pendingCtx.summary)}</b>'. Mohon ulangi perintahnya lengkap ya, contoh: "<i>Tambahkan makan malam jam 7 malam, durasi 2 jam</i>"`
      };
    }
    startDate.setMinutes(startDate.getMinutes() + durationMins);
    const computedEnd = startDate.toISOString();
    
    // Check for conflicts
    const conflicts = await googleWorkspace.checkCalendarConflicts(pendingCtx.start, computedEnd);
    if (conflicts.length > 0) {
      const conflictList = conflicts.map(c => {
        const sTime = new Date(c.start).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta' });
        const eTime = new Date(c.end).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta' });
        return `   ⚠️ ${sTime}-${eTime}: ${c.summary}${c.location ? ` (${c.location})` : ''}`;
      }).join('\n');
      
      const summary = pendingCtx.summary;
      const start = pendingCtx.start;
      const end = computedEnd;
      
      return {
        status: 'CONFLICT_DETECTED',
        message: `⚠️ <b>Konflik Jadwal Terdeteksi!</b>\n\nKegiatan '<b>${escapeHtml(summary)}</b>' bentrok dengan:\n${conflictList}\n\nApakah tetap ingin ditambahkan? (Balas: "ya" untuk lanjut, "batal" untuk membatalkan)`,
        conflicts: conflicts,
        pendingEvent: { summary, start, end }
      };
    }

    await googleWorkspace.createCalendarEvent(pendingCtx.summary, pendingCtx.start, computedEnd, '');
    return { status: 'SUCCESS', message: `✅ Jadwal '<b>${escapeHtml(pendingCtx.summary)}</b>' berhasil ditambahkan ke kalender (durasi <b>${durationMins} menit</b>).` };
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
