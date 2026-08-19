const googleWorkspace = require('../infrastructure/Google_Workspace');
const googleTasks = require('../infrastructure/Google_Tasks');
const env = require('../config/env');

// Short-term working memory for rendered calendar events (for ordinal commands like "hapus yang pertama", "ubah yang kedua")
let _lastRenderedCalendarEvents = [];
let _lastActionContext = null;
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
 * Ensure calendar working memory is populated even across server restarts
 */
async function _ensureWorkingMemoryCalendar() {
  if (_lastRenderedCalendarEvents.length === 0) {
    try {
      const active = await googleWorkspace.getTodaysEvents();
      if (active && active.length > 0) {
        _lastRenderedCalendarEvents = active.map((e, idx) => ({
          index: idx + 1,
          id: e.id,
          summary: e.summary || '(Tanpa Judul)',
          start: e.start?.dateTime || e.start?.date,
          end: e.end?.dateTime || e.end?.date
        }));
      }
    } catch (_) {}
  }
}

/**
 * Resolve target event ID or summary from working memory or ordinal references
 */
async function _resolveTargetEvent(searchSummary = '', eventId = null) {
  if (eventId) return { id: eventId, summary: typeof searchSummary === 'string' ? searchSummary : (searchSummary?.summary || '') };

  const raw = (typeof searchSummary === 'object' && searchSummary !== null) ? (searchSummary.summary || searchSummary.title || '') : searchSummary;
  const s = String(raw || '').toLowerCase().trim();
  await _ensureWorkingMemoryCalendar();

  // Direct number index check (e.g. "1", "2", "index_1", "jadwal 1")
  const numMatch = s.match(/^(?:index_|nomor\s*|no\s*|jadwal\s*|ke-?)?(\d+)$/i);
  if (numMatch && _lastRenderedCalendarEvents.length > 0) {
    const idx = parseInt(numMatch[1], 10);
    if (idx >= 1 && idx <= _lastRenderedCalendarEvents.length) {
      return _lastRenderedCalendarEvents[idx - 1];
    }
  }

  // 1. Ordinal index resolution: "pertama" / "ke-1" / "INDEX_1"
  if (/^(index_1|pertama|ke-?1|paling\s*atas)$/i.test(s) && _lastRenderedCalendarEvents.length >= 1) {
    return _lastRenderedCalendarEvents[0];
  }
  // "kedua" / "ke-2" / "INDEX_2"
  if (/^(index_2|kedua|ke-?2)$/i.test(s) && _lastRenderedCalendarEvents.length >= 2) {
    return _lastRenderedCalendarEvents[1];
  }
  // "ketiga" / "ke-3" / "INDEX_3"
  if (/^(index_3|ketiga|ke-?3)$/i.test(s) && _lastRenderedCalendarEvents.length >= 3) {
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

/**
 * 🔄 Universal RFC 5545 iCalendar Recurrence Generator
 * Constructs standard compliant RRULE strings for Google Calendar
 */
function buildRRule(rec) {
  if (!rec) return '';
  if (typeof rec === 'string') {
    let s = rec.trim();
    if (!s.toUpperCase().startsWith('RRULE:')) {
      s = `RRULE:${s}`;
    }
    return s;
  }

  if (typeof rec === 'object') {
    const parts = [];
    const freq = (rec.frequency || rec.freq || 'WEEKLY').toUpperCase();
    parts.push(`FREQ=${freq}`);

    if (rec.interval && parseInt(rec.interval) > 1) {
      parts.push(`INTERVAL=${parseInt(rec.interval)}`);
    }

    if (rec.by_day || rec.byday) {
      const days = Array.isArray(rec.by_day || rec.byday) 
        ? (rec.by_day || rec.byday).join(',')
        : String(rec.by_day || rec.byday).toUpperCase();
      parts.push(`BYDAY=${days}`);
    }

    if (rec.by_month_day || rec.bymonthday) {
      parts.push(`BYMONTHDAY=${parseInt(rec.by_month_day || rec.bymonthday)}`);
    }

    if (rec.count && parseInt(rec.count) > 0) {
      parts.push(`COUNT=${parseInt(rec.count)}`);
    } else if (rec.until_date || rec.until) {
      const u = String(rec.until_date || rec.until).replace(/[-:]/g, '');
      if (u.includes('T')) {
        parts.push(`UNTIL=${u.split('.')[0]}Z`);
      } else {
        parts.push(`UNTIL=${u.slice(0, 8)}T235959Z`);
      }
    }

    return `RRULE:${parts.join(';')}`;
  }

  return '';
}

/**
 * 📅 Calculate the first occurrence ISO date-time from an anchor date and day-of-week
 * E.g., anchor = "2026-08-25", day = "MO", time = "08:00"
 * Returns: "2026-08-31T08:00:00+07:00"
 */
function calculateFirstOccurrenceDate(anchorDateStr, dayOfWeekCode = 'MO', timeHHMM = '08:00') {
  const dayMap = {
    SU: 0, SUN: 0, MINGGU: 0,
    MO: 1, MON: 1, SENIN: 1,
    TU: 2, TUE: 2, SELASA: 2,
    WE: 3, WED: 3, RABU: 3,
    TH: 4, THU: 4, KAMIS: 4,
    FR: 5, FRI: 5, JUMAT: 5,
    SA: 6, SAT: 6, SABTU: 6
  };

  const code = String(dayOfWeekCode || '').toUpperCase().trim();
  const targetDay = dayMap[code] !== undefined ? dayMap[code] : 1;

  const anchor = anchorDateStr ? new Date(`${anchorDateStr.split('T')[0]}T00:00:00+07:00`) : new Date();
  const anchorDay = anchor.getDay();

  let daysToAdd = (targetDay - anchorDay + 7) % 7;
  const targetDate = new Date(anchor.getTime() + daysToAdd * 24 * 60 * 60 * 1000);
  const yyyy = targetDate.getFullYear();
  const mm = String(targetDate.getMonth() + 1).padStart(2, '0');
  const dd = String(targetDate.getDate()).padStart(2, '0');

  const cleanTime = (timeHHMM || '08:00').trim();
  const [hh, min] = cleanTime.split(':');
  const finalHH = String(hh || '08').padStart(2, '0');
  const finalMin = String(min || '00').padStart(2, '0');

  return `${yyyy}-${mm}-${dd}T${finalHH}:${finalMin}:00+07:00`;
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
  let { action, summary, start, end, eventId, description, location, reminder_minutes, recurrence, color_id, with_meet, events, semester_start, semester_end, until_date, count } = extractedData;
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
    // 1b. ACTION: CREATE_MULTIPLE (Batch Semester / Multi-Course Scheduling)
    // ════════════════════════════════════════════════════════════════
    else if (action === 'CREATE_MULTIPLE') {
      const eventList = events || [];
      if (eventList.length === 0) {
        return { status: 'FAILED', message: '❌ Tidak ada daftar jadwal atau mata kuliah yang disebutkan untuk dibuat.' };
      }

      const semStart = semester_start || new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' });
      const semEnd = semester_end || until_date || null;
      const createdResults = [];

      for (const ev of eventList) {
        try {
          const evSummary = ev.summary || ev.title;
          if (!evSummary) continue;

          let evStart = ev.start || null;
          let evEnd = ev.end || null;
          const dayCode = ev.day_of_week || ev.day || 'MO';
          const startTimeStr = ev.start_time || '08:00';
          const endTimeStr = ev.end_time || null;

          if (!evStart) {
            evStart = calculateFirstOccurrenceDate(semStart, dayCode, startTimeStr);
          }

          const sDate = new Date(evStart);
          let durationMins = null;
          if (!evEnd) {
            if (endTimeStr) {
              const [eH, eM] = endTimeStr.split(':');
              const eDate = new Date(sDate);
              eDate.setHours(parseInt(eH), parseInt(eM || '0'), 0);
              evEnd = eDate.toISOString();
              durationMins = Math.max(15, Math.round((eDate.getTime() - sDate.getTime()) / 60000));
            } else {
              durationMins = inferProbableDuration(evSummary, rawUserText);
              evEnd = new Date(sDate.getTime() + durationMins * 60000).toISOString();
            }
          } else {
            durationMins = Math.max(15, Math.round((new Date(evEnd).getTime() - sDate.getTime()) / 60000));
          }

          // Build Recurrence Rule
          let rrule = ev.recurrence ? buildRRule(ev.recurrence) : '';
          if (!rrule && (semEnd || count || ev.count || ev.until_date)) {
            rrule = buildRRule({
              frequency: 'WEEKLY',
              by_day: dayCode,
              until_date: semEnd || ev.until_date,
              count: count || ev.count
            });
          } else if (!rrule && semStart) {
            // Default weekly recurrence for courses
            rrule = buildRRule({
              frequency: 'WEEKLY',
              by_day: dayCode,
              until_date: semEnd
            });
          }

          const evColor = ev.color_id || color_id || '7'; // Default 7 = Peacock (Academic Blue)
          const evLocation = ev.location || '';
          const evDesc = ev.description || (rrule ? `Jadwal Berulang Perkuliahan: ${evSummary}` : '');

          await googleWorkspace.createCalendarEvent(
            evSummary,
            evStart,
            evEnd,
            evDesc,
            evLocation,
            reminder_minutes || [30],
            rrule,
            evColor
          );

          const sDayName = sDate.toLocaleDateString('id-ID', { weekday: 'long', timeZone: 'Asia/Jakarta' });
          const sTimeFmt = sDate.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta' });
          const eTimeFmt = new Date(evEnd).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta' });

          const isCollegeContext = /kuliah|matkul|semester|krs|dosen|kampus/i.test(rawUserText || '') || /kuliah|matkul/i.test(evSummary);
          const isPiketContext = /piket|kebersihan|adzan|imam|masjid|sapu|pel|jaga|shift/i.test(rawUserText || '') || /piket|sapu|pel|adzan|imam|galon/i.test(evSummary);
          const itemIcon = isCollegeContext ? '📚' : (isPiketContext ? '📌' : '🗓️');

          createdResults.push(`   • ${itemIcon} <b>${escapeHtml(evSummary)}</b>: ${sDayName}, ${sTimeFmt}–${eTimeFmt} WIB${evLocation ? ` (📍 ${escapeHtml(evLocation)})` : ''}`);
        } catch (e) {
          createdResults.push(`   • ❌ Gagal (${escapeHtml(ev.summary || 'Jadwal')}): ${e.message}`);
        }
      }

      const isCollegeGlobal = /kuliah|matkul|semester|krs|kampus/i.test(rawUserText || '');
      const isPiketGlobal = /piket|kebersihan|adzan|imam|masjid|roster|shift/i.test(rawUserText || '');
      const categoryLabel = isCollegeGlobal ? 'Jadwal Perkuliahan' : (isPiketGlobal ? 'Jadwal Tugas & Piket' : 'Jadwal Kegiatan');

      let responseMsg = `🗓️ <b>${createdResults.length} ${categoryLabel} Berhasil Dibuat di Kalender!</b>\n\n${createdResults.join('\n')}`;
      if (semEnd) {
        const untilFmt = new Date(semEnd).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Jakarta' });
        responseMsg += `\n\n🔄 <i>Terjadwal berulang setiap minggu hingga <b>${untilFmt}</b>.</i>`;
      }

      return { status: 'SUCCESS', message: responseMsg, count: createdResults.length };
    }

    // ════════════════════════════════════════════════════════════════
    // 2. ACTION: UPDATE (With Ordinal & Relative Support)
    // ════════════════════════════════════════════════════════════════
    else if (action === 'UPDATE') {
      const resolved = await _resolveTargetEvent(summary, eventId);
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
      const resolved = await _resolveTargetEvent(summary, eventId);
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
    // 4. ACTION: READ / READ_TODAY / READ_TOMORROW / READ_UPCOMING
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
        const eDate = new Date(end).toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Asia/Jakarta' });
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

/**
 * Backward compatibility helpers for Telegram Adapter
 */
async function tryResolvePending(userText, pendingCtx) {
  return null;
}

function cancelPending(summary) {
  for (const [id, data] of pendingAgendas.entries()) {
    if (data.summary?.toLowerCase() === summary?.toLowerCase()) {
      if (data.timer) clearTimeout(data.timer);
      pendingAgendas.delete(id);
    }
  }
}

module.exports = {
  handleCalendarIntent,
  inferProbableDuration,
  buildRRule,
  calculateFirstOccurrenceDate,
  getLastRenderedCalendarEvents: () => _lastRenderedCalendarEvents,
  tryResolvePending,
  cancelPending
};
