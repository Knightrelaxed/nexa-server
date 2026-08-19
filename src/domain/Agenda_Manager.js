const googleWorkspace = require('../infrastructure/Google_Workspace');
const googleTasks = require('../infrastructure/Google_Tasks');
const env = require('../config/env');

// Short-term working memory for rendered calendar events (for ordinal commands like "hapus yang pertama", "ubah yang kedua")
let _lastRenderedCalendarEvents = [];
let _lastActionContext = null;

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * 📊 Bayesian / Probabilistic Semantic Duration Inference Matrix
 * Infers the most natural event duration in minutes based on keywords and activity context.
 */
function inferProbableDuration(summary = '', rawText = '') {
  const combined = `${summary} ${rawText}`.toLowerCase();

  // 1. Explicit Duration via Natural Language Regex Fast Path
  const explicitMins = _parseExplicitDuration(combined);
  if (explicitMins) return explicitMins;

  // 2. Semantic Matrix Heuristics
  // Academic / Course / Lecture (Standar 2-3 SKS UGM: 100 - 120 menit)
  if (/\b(kuliah|matkul|mata\s*kuliah|praktikum|kelas|lecture|lab|tutorial|sks)\b/i.test(combined)) {
    return 100;
  }

  // Academic Consultation / Thesis Guidance (30 - 45 menit)
  if (/\b(bimbingan|konsultasi|tatap\s*muka\s*dosen|revisi\s*skripsi|dosen\s*pembimbing|dospem)\b/i.test(combined)) {
    return 45;
  }

  // Formal Exam / Defense / Thesis Defense (90 - 120 menit)
  if (/\b(ujian|uts|uas|sidang|pendadaran|komprehensif|test|evaluasi\s*akhir)\b/i.test(combined)) {
    return 100;
  }

  // Social / Casual / Dining / Hangout (90 menit)
  if (/\b(ngopi|warkop|cafe|makan|lunch|dinner|sarapan|nongkrong|hangout|silaturahmi|buka\s*bersama|bukber)\b/i.test(combined)) {
    return 90;
  }

  // Quick Communication / Phone Call / Virtual Meeting (30 menit)
  if (/\b(telpon|telepon|call|zoom|gmeet|google\s*meet|voice\s*call|video\s*call)\b/i.test(combined)) {
    return 30;
  }

  // Meeting / Corporate / Project Discussion (60 menit)
  if (/\b(rapat|meeting|diskusi|briefing|koordinasi|sync|evaluasi|workshop|webinar|seminar)\b/i.test(combined)) {
    return 60;
  }

  // Sports / Exercise / Gym (75 menit)
  if (/\b(olahraga|gym|fitness|futsal|badminton|bulutangkis|jogging|workout|renang)\b/i.test(combined)) {
    return 75;
  }

  // Default Failsafe Duration (60 menit)
  return 60;
}

/**
 * Fast regex parser for explicit duration mentions in Indonesian & English
 */
function _parseExplicitDuration(text = '') {
  const t = text.toLowerCase().trim();

  // Unicode fractions: ½ jam, ¼ jam, ¾ jam
  if (t.includes('½') || t.includes('0.5 jam') || t.includes('0,5 jam')) {
    const base = t.match(/(\d+)\s*½\s*jam/);
    return base ? parseInt(base[1]) * 60 + 30 : 30;
  }
  if (t.includes('¼ jam') || t.includes('quarter')) return 15;
  if (t.includes('¾ jam')) return 45;

  // "sejam" / "sejaman"
  if (/\bsejam\w*\b/.test(t)) return 60;

  // "setengah jam" / "half hour"
  if (/setengah\s*jam|half[\s-]*(an\s*)?hour/.test(t)) return 30;

  // "X jam Y menit" — e.g. "1 jam 30 menit"
  const jamMenitMatch = t.match(/(\d+(?:[.,]\d+)?)\s*jam\s*(\d+)\s*menit/);
  if (jamMenitMatch) return Math.round(parseFloat(jamMenitMatch[1].replace(',', '.')) * 60) + parseInt(jamMenitMatch[2]);

  // "X,5 jam"
  const halfJamMatch = t.match(/(\d+)[.,]5\s*jam/);
  if (halfJamMatch) return parseInt(halfJamMatch[1]) * 60 + 30;

  // "X jam"
  const jamMatch = t.match(/(\d+(?:[.,]\d+)?)\s*jam/);
  if (jamMatch) return Math.round(parseFloat(jamMatch[1].replace(',', '.')) * 60);

  // "X menit"
  const menitMatch = t.match(/(\d+)\s*(menit|minutes?|min)/);
  if (menitMatch) return parseInt(menitMatch[1]);

  // "X hours"
  const hourMatch = t.match(/(\d+(?:[.,]\d+)?)\s*hours?/);
  if (hourMatch) return Math.round(parseFloat(hourMatch[1].replace(',', '.')) * 60);

  return null;
}

/**
 * Resolve target event ID or summary from working memory or ordinal references
 */
function _resolveTargetEvent(searchSummary = '', eventId = null) {
  if (eventId) return { id: eventId, summary: searchSummary };

  const s = String(searchSummary || '').toLowerCase().trim();

  // 1. Ordinal index resolution: "pertama" / "ke-1" / "INDEX_1"
  if (/^(index_1|pertama|ke-?1|nomor\s*1|no\s*1|paling\s*atas)$/i.test(s) && _lastRenderedCalendarEvents.length >= 1) {
    return _lastRenderedCalendarEvents[0];
  }
  // "kedua" / "ke-2" / "INDEX_2"
  if (/^(index_2|kedua|ke-?2|nomor\s*2|no\s*2)$/i.test(s) && _lastRenderedCalendarEvents.length >= 2) {
    return _lastRenderedCalendarEvents[1];
  }
  // "ketiga" / "ke-3" / "INDEX_3"
  if (/^(index_3|ketiga|ke-?3|nomor\s*3|no\s*3)$/i.test(s) && _lastRenderedCalendarEvents.length >= 3) {
    return _lastRenderedCalendarEvents[2];
  }
  // "terakhir" / "paling bawah"
  if (/^(index_last|terakhir|paling\s*bawah)$/i.test(s) && _lastRenderedCalendarEvents.length > 0) {
    return _lastRenderedCalendarEvents[_lastRenderedCalendarEvents.length - 1];
  }
  // "yang tadi" / "barusan" / "LATEST"
  if (/^(latest|yang\s*tadi|barusan|tadi)$/i.test(s) && _lastActionContext) {
    return _lastActionContext;
  }

  // Fallback: match by title substring in working memory
  if (s && _lastRenderedCalendarEvents.length > 0) {
    const match = _lastRenderedCalendarEvents.find(e => (e.summary || '').toLowerCase().includes(s));
    if (match) return match;
  }

  return { id: null, summary: searchSummary };
}

async function _tryProactiveTaskSuggestion(summary) {
  try {
    const { callAI } = require('../core/AI_Router');
    const aiPrompt = `Acara kalender baru ditambahkan: "${summary}". Apakah acara ini (rapat, seminar, ujian, kuliah, presentasi, tugas kelompok, dll) umumnya membutuhkan 1-2 tugas persiapan yang terukur (seperti menyiapkan dokumen, membaca materi, membuat slide)? Jawab HANYA dengan format ini jika Ya:\nYa, saya rekomendasikan tugas persiapan:\n1. [Tugas 1]\n2. [Tugas 2]\n\nATAU jawab "Tidak" jika acaranya kasual/tidak butuh persiapan. Jangan bertele-tele.`;
    const aiResponse = await callAI(aiPrompt);
    if (aiResponse && aiResponse.toLowerCase().startsWith('ya')) {
      const tasks = [];
      const lines = aiResponse.split('\n');
      for (const line of lines) {
        const m = line.match(/^\d+\.\s*(.+)$/);
        if (m && m[1]) {
          tasks.push(m[1].trim());
        }
      }
      return {
        text: `\n\n💡 <b>Saran Proaktif N.E.X.A:</b>\n${escapeHtml(aiResponse)}\n<i>(Balas: "Buatkan tugas persiapan" jika ingin dicatat ke Google Tasks)</i>`,
        tasks
      };
    }
  } catch (_) {}
  return null;
}

/**
 * Main handler for Calendar Intent (Zero-Friction & Probabilistic)
 */
async function handleCalendarIntent(extractedData, rawUserText = '') {
  let { action, summary, start, end, eventId, description, location, reminder_minutes, recurrence, color_id, with_meet } = extractedData;
  console.log(`[AGENDA] Executing Calendar Intent: ${action} | summary: "${summary}"`);

  // Sanitize hallucinated summaries in READ actions
  if (summary && typeof summary === 'string' && ['READ', 'READ_TODAY', 'READ_TOMORROW', 'READ_UPCOMING'].includes(action)) {
    const sLower = summary.trim().toLowerCase();
    if (sLower.length > 25 || /adalah|tidak ada|jadwal|tugas|jatuh tempo|hari besok|hari ini|minggu ini|senin|selasa|rabu|kamis|jumat|sabtu|minggu|juli|agustus|202[0-9]/i.test(sLower)) {
      summary = null;
    }
  }

  try {
    // ════════════════════════════════════════════════════════════════
    // 1. ACTION: CREATE (Optimistic & Zero Friction)
    // ════════════════════════════════════════════════════════════════
    if (action === 'CREATE') {
      if (!summary) {
        return { status: 'FAILED', message: '❌ Mohon sebutkan nama kegiatannya, Tuan.' };
      }
      if (!start) {
        return { status: 'FAILED', message: `❌ Kapan kegiatan '<b>${escapeHtml(summary)}</b>' ini dilaksanakan, Tuan?` };
      }

      // Check if start has date only (no time)
      const isMidnightUTC = start.includes('T00:00:00.000Z') || start.includes('T00:00:00Z') || start.includes('T17:00:00.000Z') || start.includes('T17:00:00Z');
      if (!start.includes('T') || isMidnightUTC) {
        return { status: 'FAILED', message: `❌ Tanggal untuk '<b>${escapeHtml(summary)}</b>' sudah saya mengerti, tapi jam berapa pelaksanaannya, Tuan? (Contoh: "jam 2 siang" atau "14:00")` };
      }

      const startDate = new Date(start);
      if (isNaN(startDate.getTime())) {
        return { status: 'FAILED', message: `❌ Format waktu untuk '<b>${escapeHtml(summary)}</b>' tidak valid. Mohon sebutkan ulang jamnya, Tuan.` };
      }

      // ── Calculate End Time via Probabilistic Duration Matrix ──────
      let durationMins = null;
      if (!end) {
        durationMins = inferProbableDuration(summary, rawUserText);
        const endDate = new Date(startDate.getTime() + durationMins * 60000);
        end = endDate.toISOString();
      } else {
        const endDate = new Date(end);
        if (!isNaN(endDate.getTime())) {
          durationMins = Math.max(15, Math.round((endDate.getTime() - startDate.getTime()) / 60000));
        } else {
          durationMins = 60;
          end = new Date(startDate.getTime() + 60 * 60000).toISOString();
        }
      }

      // ── Conflict Check ──────────────────────────────────────────
      const conflicts = await googleWorkspace.checkCalendarConflicts(start, end);
      if (conflicts && conflicts.length > 0) {
        const conflictList = conflicts.map(c => {
          const sTime = new Date(c.start).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta' });
          const eTime = new Date(c.end).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta' });
          return `   ⚠️ ${sTime}–${eTime}: <b>${escapeHtml(c.summary)}</b>${c.location ? ` (📍 ${escapeHtml(c.location)})` : ''}`;
        }).join('\n');
        return {
          status: 'CONFLICT_DETECTED',
          message: `⚠️ <b>Konflik Jadwal Terdeteksi!</b>\n\nKegiatan '<b>${escapeHtml(summary)}</b>' bertabrakan dengan jadwal aktif:\n${conflictList}\n\nApakah tetap ingin ditambahkan? (Balas: "<i>ya</i>" untuk lanjut, "<i>batal</i>" untuk batalkan)`,
          conflicts,
          pendingEvent: { summary, start, end, description, location, reminder_minutes, recurrence, color_id, with_meet }
        };
      }

      // ── Instant Calendar Event Creation ─────────────────────────
      const result = await googleWorkspace.createCalendarEvent(
        summary,
        start,
        end,
        description || '',
        location || '',
        reminder_minutes || [30],
        recurrence || '',
        color_id || ''
      );

      // Cache as last action
      _lastActionContext = { id: result.id, summary, start, end };

      // Format elegant confirmation
      const sDateStr = startDate.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Jakarta' });
      const sTimeStr = startDate.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta' });
      const eTimeStr = new Date(end).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta' });

      let successMsg = `✅ Jadwal '<b>${escapeHtml(summary)}</b>' berhasil dicatat di Kalender!\n` +
        `📅 <b>${sDateStr}</b>\n` +
        `⏰ <b>${sTimeStr} – ${eTimeStr} WIB</b> (durasi <b>${durationMins} menit</b>)`;

      if (location) successMsg += `\n📍 Lokasi: ${escapeHtml(location)}`;
      if (recurrence) successMsg += `\n🔄 Terjadwal berulang.`;

      // Proactive Task Suggestion (Non-blocking)
      const proactive = await _tryProactiveTaskSuggestion(summary);
      let proactiveTasks = null;
      if (proactive) {
        successMsg += proactive.text;
        if (proactive.tasks && proactive.tasks.length > 0) {
          proactiveTasks = { summary, tasks: proactive.tasks };
        }
      } else {
        successMsg += `\n<i>(Balas jika ingin mengubah jam atau durasi, Tuan)</i>`;
      }

      return { status: 'SUCCESS', message: successMsg, eventId: result.id, proactiveTasks };
    }

    // ════════════════════════════════════════════════════════════════
    // 2. ACTION: UPDATE (With Ordinal & Relative Support)
    // ════════════════════════════════════════════════════════════════
    else if (action === 'UPDATE') {
      const resolved = _resolveTargetEvent(summary, eventId);
      let targetEventId = resolved.id;

      if (!targetEventId && summary) {
        const found = await googleWorkspace.findEventByTitle(summary);
        if (found.length > 0) {
          targetEventId = found[0].id;
          resolved.summary = found[0].summary;
        }
      }

      if (!targetEventId) {
        return { status: 'FAILED', message: '❌ Tidak menemukan jadwal yang dimaksud. Coba sebutkan judul acaranya lebih spesifik.' };
      }

      // If user changed start time but not end time, apply probabilistic duration
      if (start && !end) {
        const dur = inferProbableDuration(resolved.summary || summary, rawUserText);
        end = new Date(new Date(start).getTime() + dur * 60000).toISOString();
      }

      await googleWorkspace.updateCalendarEvent(targetEventId, summary || resolved.summary, start, end, description || '');
      return { status: 'SUCCESS', message: `✅ Jadwal '<b>${escapeHtml(resolved.summary || summary)}</b>' berhasil diperbarui di kalender.` };
    }

    // ════════════════════════════════════════════════════════════════
    // 3. ACTION: DELETE (With Ordinal & Relative Support)
    // ════════════════════════════════════════════════════════════════
    else if (action === 'DELETE') {
      const resolved = _resolveTargetEvent(summary, eventId);
      let targetEventId = resolved.id;

      if (!targetEventId && summary) {
        const found = await googleWorkspace.findEventByTitle(summary);
        if (found.length > 0) {
          targetEventId = found[0].id;
          resolved.summary = found[0].summary;
        }
      }

      if (!targetEventId) {
        return { status: 'FAILED', message: `❌ Gagal menghapus: event '<b>${escapeHtml(summary || '(tanpa judul)')}</b>' tidak ditemukan di kalender.` };
      }

      await googleWorkspace.deleteCalendarEvent(targetEventId, 'THIS_ONLY');
      
      // Remove from working memory
      _lastRenderedCalendarEvents = _lastRenderedCalendarEvents.filter(e => e.id !== targetEventId);

      return { status: 'SUCCESS', message: `🗑️ Jadwal '<b>${escapeHtml(resolved.summary || summary || targetEventId)}</b>' berhasil dihapus dari kalender.` };
    }

    // ════════════════════════════════════════════════════════════════
    // 4. ACTION: READ / READ_TODAY / READ_TOMORROW
    // ════════════════════════════════════════════════════════════════
    else if (action === 'READ' || action === 'READ_TODAY' || action === 'READ_TOMORROW' || action === 'READ_UPCOMING') {
      let events = [];
      let tasks = [];
      let dateLabel = '';
      let dashboardTitle = 'DASHBOARD AGENDA';

      const now = new Date();

      if (action === 'READ_TODAY' || (!start && !end && action === 'READ')) {
        events = await googleWorkspace.getTodaysEvents();
        tasks = await googleTasks.getTasksDueToday();
        dateLabel = now.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Jakarta' });
        dashboardTitle = 'DASHBOARD HARI INI';
      } else if (action === 'READ_TOMORROW') {
        const tmrw = new Date(now.getTime() + 86400000);
        const s = new Date(tmrw.setHours(0, 0, 0, 0)).toISOString();
        const e = new Date(tmrw.setHours(23, 59, 59, 999)).toISOString();
        events = await googleWorkspace.getEventsByDateRange(s, e);
        tasks = await googleTasks.getTasksDueTomorrow();
        dateLabel = tmrw.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Jakarta' });
        dashboardTitle = 'DASHBOARD BESOK';
      } else if (action === 'READ_UPCOMING') {
        events = await googleWorkspace.getUpcomingEvents(7 * 24 * 60, 20);
        tasks = await googleTasks.getUpcomingTasks(7);
        dateLabel = '7 Hari ke Depan';
        dashboardTitle = 'AGENDA MINGGU INI';
      } else if (start && end) {
        events = await googleWorkspace.getEventsByDateRange(start, end);
        tasks = await googleTasks.getTasksByDateRange(start, end);
        const sDate = new Date(start).toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Asia/Jakarta' });
        const eDate = new Date(end).toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Jakarta' });
        dateLabel = sDate === eDate ? sDate : `${sDate} – ${eDate}`;
      } else if (start) {
        const sD = new Date(start);
        const eD = new Date(sD);
        eD.setHours(23, 59, 59, 999);
        events = await googleWorkspace.getEventsByDateRange(start, eD.toISOString());
        tasks = await googleTasks.getTasksByDateRange(start, eD.toISOString());
        dateLabel = sD.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Jakarta' });
      }

      // Filter by summary keyword if provided
      if (summary) {
        const kw = summary.toLowerCase();
        events = events.filter(e => (e.summary || '').toLowerCase().includes(kw));
        dashboardTitle = `PENCARIAN: '${summary.toUpperCase()}'`;
      }

      // Update Working Memory Cache
      _lastRenderedCalendarEvents = events.map((e, idx) => ({
        index: idx + 1,
        id: e.id,
        summary: e.summary || '(Tanpa Judul)',
        start: e.start?.dateTime || e.start?.date,
        end: e.end?.dateTime || e.end?.date
      }));

      let msg = `🗓️ <b>${dashboardTitle}</b>\n<i>${dateLabel}</i>\n`;

      // Format Calendar Events
      if (events && events.length > 0) {
        msg += `\n📅 <b>JADWAL ACARA (${events.length}):</b>\n`;
        const lines = events.map((e, idx) => {
          const sRaw = e.start?.dateTime || e.start?.date;
          const eRaw = e.end?.dateTime || e.end?.date;
          let timeLabel = 'Sepanjang hari';
          if (e.start?.dateTime && e.end?.dateTime) {
            const sT = new Date(sRaw).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta' });
            const eT = new Date(eRaw).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta' });
            timeLabel = `${sT}–${eT}`;
          }
          let itemLine = `   <b>${idx + 1}.</b> [${timeLabel}] <b>${escapeHtml(e.summary || '(Tanpa Judul)')}</b>`;
          if (e.location) itemLine += `\n      📍 ${escapeHtml(e.location)}`;
          if (e.hangoutLink) itemLine += `\n      🎥 <a href="${e.hangoutLink}">Google Meet</a>`;
          return itemLine;
        });
        msg += lines.join('\n');
      } else {
        msg += `\n📅 <b>JADWAL ACARA:</b> Tidak ada jadwal tercatat.\n`;
      }

      // Format Google Tasks
      if (tasks && tasks.length > 0) {
        msg += `\n\n📋 <b>TUGAS JATUH TEMPO (${tasks.length}):</b>\n`;
        msg += tasks.map((t, idx) => {
          let tLine = `   🔲 <b>${idx + 1}.</b> ${escapeHtml(t.title || '(Tanpa Judul)')}`;
          if (t.notes) tLine += `\n      📝 ${escapeHtml(t.notes.split('\n')[0])}`;
          return tLine;
        }).join('\n');
      }

      return { status: 'SUCCESS', message: msg, eventsCount: events.length, tasksCount: tasks.length };
    }

    return { status: 'FAILED', message: `Aksi kalender '${action}' tidak dikenali.` };
  } catch (err) {
    console.error('[AGENDA] Calendar handler error:', err);
    return { status: 'ERROR', message: `❌ Terjadi kendala pada Kalender: ${err.message}` };
  }
}

module.exports = {
  handleCalendarIntent,
  inferProbableDuration,
  getLastRenderedCalendarEvents: () => _lastRenderedCalendarEvents
};
