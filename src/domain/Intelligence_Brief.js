const axios = require('axios');
const env = require('../config/env');
const googleWorkspace = require('../infrastructure/Google_Workspace');
const googleTasks = require('../infrastructure/Google_Tasks');
const { executeWithFallback } = require('../core/Fallback_Engine');
const { NEXA_PERSONALITY } = require('../config/personality');
const supabaseMemories = require('../infrastructure/Supabase_Memories');

// ============================================================
// HELPER: Get current WIB greeting based on hour
// ============================================================
function _getWibGreeting() {
  const nowWib = new Date(new Date().getTime() + 7 * 60 * 60 * 1000);
  const hour = nowWib.getUTCHours();
  if (hour >= 4 && hour < 11) return 'Selamat pagi';
  if (hour >= 11 && hour < 15) return 'Selamat siang';
  if (hour >= 15 && hour < 19) return 'Selamat sore';
  return 'Selamat malam';
}

// ============================================================
// HELPER: Format time from ISO to HH:MM WIB
// ============================================================
function _formatTimeWib(isoString) {
  return new Date(isoString).toLocaleTimeString('id-ID', {
    hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta'
  });
}

// ============================================================
// [PHASE 6] MORNING BRIEFING — Format Ringkas + Check-In 3 Pertanyaan
// ============================================================
async function generateMorningBriefing() {
  console.log('[INTELLIGENCE] Generating Executive Morning Briefing (4-Pillar Multi-Table Fusion)...');

  // ── 1. Cuaca Yogyakarta ─────────────────────────────────────
  let weatherStr = null;
  let weatherEmoji = '🌤️';
  try {
    if (env.WEATHER_API_KEY) {
      const weatherRes = await axios.get(
        `https://api.weatherapi.com/v1/current.json?key=${env.WEATHER_API_KEY}&q=Yogyakarta`
      );
      const cond = weatherRes.data.current;
      const condText = (cond.condition.text || '').toLowerCase();
      if (/rain|hujan/.test(condText)) weatherEmoji = '🌧️';
      else if (/cloud|berawan/.test(condText)) weatherEmoji = '☁️';
      else if (/storm|petir/.test(condText)) weatherEmoji = '⛈️';
      weatherStr = `${weatherEmoji} Yogyakarta ${Math.round(cond.temp_c)}°C — ${cond.condition.text}`;
    }
  } catch (err) {
    console.warn('[INTELLIGENCE] Failed to get weather:', err.message);
  }

  // ── 2. Agenda Kalender Hari Ini ────────────────────────────
  let agendaLines = [];
  let agendaStr = null;
  try {
    const events = await googleWorkspace.getTodaysEvents();
    if (events && events.length > 0) {
      agendaLines = events.map(e => {
        const startRaw = e.start?.dateTime || e.start?.date;
        const timeLabel = startRaw
          ? (e.start.dateTime ? _formatTimeWib(startRaw) : 'Sepanjang hari')
          : '?';
        return `• ${timeLabel} — ${e.summary || '(Tanpa judul)'}`;
      });
      agendaStr = `📅 *${agendaLines.length} agenda hari ini:*\n${agendaLines.join('\n')}`;
    }
  } catch (err) {
    console.warn('[INTELLIGENCE] Failed to get calendar events:', err.message);
  }

  // ── 3. Tugas Prioritas Utama (Overdue + Due Today) ─────────
  let taskWarning = null;
  try {
    const overdue = await googleTasks.getOverdueTasks();
    const dueToday = await googleTasks.getTasksDueToday();
    const parts = [];
    if (overdue.length > 0) {
      parts.push(`⚠️ *TERLAMBAT (${overdue.length}):* ${overdue.map(t => t.title).join(', ')}`);
    }
    if (dueToday.length > 0) {
      parts.push(`📌 *Jatuh tempo hari ini (${dueToday.length}):* ${dueToday.map(t => t.title).join(', ')}`);
    }
    if (parts.length > 0) taskWarning = parts.join('\n');
  } catch (err) {
    console.warn('[INTELLIGENCE] Failed to get tasks:', err.message);
  }

  // ── 4. Komitmen & Target Intensi Aktif (nexa_intentions) ───
  let activeIntentionsStr = '';
  try {
    const { supabase } = supabaseMemories;
    if (supabase) {
      const { data: intentions } = await supabase
        .from('nexa_intentions')
        .select('title, target_date, category, friction_level')
        .eq('status', 'ACTIVE')
        .order('target_date', { ascending: true })
        .limit(3);
      if (intentions && intentions.length > 0) {
        activeIntentionsStr = intentions.map(i => `• ${i.title}${i.target_date ? ` (Target: ${i.target_date})` : ''}`).join('\n');
      }
    }
  } catch (err) {
    console.warn('[INTELLIGENCE] Failed to get intentions:', err.message);
  }

  // ── 5. Mood / Behavior Context & Ringkasan Kemarin ─────────
  let yesterdayLog = '';
  let moodContextStr = '';
  try {
    const mems = await supabaseMemories.getYesterdayMemories();
    if (mems && mems.length > 0) {
      yesterdayLog = mems.map(m => `[${m.role.toUpperCase()}]: ${m.content}`).join('\n');
    }
  } catch (err) {
    console.warn('[INTELLIGENCE] Failed to get yesterday memories:', err.message);
  }

  try {
    const behaviorEngine = require('./Behavior_Engine');
    const moodTs = await behaviorEngine.computeMoodTimeSeries();
    if (moodTs && moodTs.mood_7d_trend) {
      moodContextStr = `Tren Mood 7 Hari: ${moodTs.mood_7d_trend} (Rata-rata: ${moodTs.mood_7d_avg}/10, Stabilitas: ${moodTs.mood_7d_variance})`;
    }
  } catch (_) { /* Non-critical */ }

  // ── 6. Ringkasan Keuangan Terkini ─────────────────────────
  let financeContextStr = '';
  try {
    const financeEngine = require('./Finance_Engine');
    const recentTx = await financeEngine.getRecentTransactions(3);
    if (recentTx && !recentTx.includes('(Tidak ada transaksi')) {
      financeContextStr = recentTx;
    }
  } catch (_) { /* Non-critical */ }

  // ── 7. Susun Pesan Executive Morning Briefing dengan AI ───
  const greeting = _getWibGreeting();
  
  const prompt = `Anda adalah N.E.X.A, Asisten Eksekutif Digital Pribadi eksklusif Tuan Faqih Hidayatulloh. Susun pesan Executive Morning Briefing (Pukul 05:30 WIB) yang berwibawa, elegan, cerdas, dan membakar semangat layaknya J.A.R.V.I.S.

KOMPONEN DATA HARI INI:
1. Sapaan: "${greeting}, Tuan Faqih. ☀️"
2. Cuaca: ${weatherStr || 'Cerah Berawan di Yogyakarta.'}
3. Agenda Kalender: ${agendaStr ? agendaStr.replace(/\n/g, ' ') : 'Tidak ada agenda terjadwal di kalender.'}
4. Tugas Prioritas: ${taskWarning ? taskWarning.replace(/\n/g, ' ') : 'Tidak ada tugas terlambat/mendesak.'}
5. Komitmen Intensi Aktif: ${activeIntentionsStr || 'Semua komitmen jangka pendek berada pada jalurnya.'}
6. Konteks Emosi & Kebugaran: ${moodContextStr || 'Stabil dan berenergi.'}
7. Catatan Keuangan: ${financeContextStr || 'Kondisi kas terkendali.'}
8. Refleksi Singkat Kemarin: Hubungkan dengan satu benang merah produktif dari obrolan kemarin jika relevan.
9. Check-In Kebugaran Pagi: Tutup dengan menanyakan kualitas tidur semalam (skor 1-5 & cerita), tingkat energi sekarang (skor 1-5 & cerita), dan satu fokus mutlak hari ini. Beri panduan format jawaban natural.

Transkrip Obrolan Kemarin:
${yesterdayLog ? yesterdayLog.substring(0, 2000) : '(Tidak ada percakapan kemarin)'}

PEDOMAN FORMAT:
- Gunakan bahasa Indonesia berkelas, hangat, proaktif, dan berwibawa.
- Sajikan secara elegan dengan bullet point terstruktur (Sapaan & Cuaca, Medan Tempur Hari Ini, Komitmen & Fokus, Check-In).
- DILARANG menggunakan JSON. Langsung output berupa pesan Telegram utuh.
`;

  let finalMessage = `${greeting}, Tuan Faqih. ☀️\n\n`;
  try {
    const aiResponse = await executeWithFallback(prompt, NEXA_PERSONALITY, 0.7, false, { forceHeavy: true });
    finalMessage = aiResponse.replace(/```json/g, '').replace(/```/g, '').trim();
  } catch (err) {
    console.warn('[INTELLIGENCE] Failed to generate AI Morning Briefing, falling back:', err.message);
    const parts = [`${greeting}, Tuan Faqih. ☀️`];
    if (weatherStr) parts.push(weatherStr);
    if (agendaStr) parts.push(agendaStr);
    else parts.push('📅 Tidak ada agenda terjadwal hari ini.');
    if (taskWarning) parts.push(taskWarning);
    if (activeIntentionsStr) parts.push(`🎯 *Komitmen Aktif:*\n${activeIntentionsStr}`);
    parts.push([
      'Sebelum memulai hari, mari kalibrasi kondisi Tuan:',
      '😴 Kualitas tidur semalam? *(Skor 1-5 & cerita kondisi)*',
      '⚡ Tingkat energi sekarang? *(Skor 1-5 & cerita alasannya)*',
      '🎯 Satu fokus utama hari ini?'
    ].join('\n'));
    finalMessage = parts.join('\n\n');
  }

  // Simpan ke behavior log bahwa morning briefing sudah dikirim
  try {
    const { supabase } = supabaseMemories;
    if (supabase) {
      const nowWib = new Date(new Date().getTime() + 7 * 60 * 60 * 1000);
      await supabase.from('nexa_behavior_log').insert([{
        event_type: 'MORNING_BRIEFING_SENT',
        event_data: {
          has_agenda: agendaLines.length > 0,
          agenda_count: agendaLines.length,
          has_task_warning: !!taskWarning,
          habit_context: habitContext || null
        },
        day_of_week: nowWib.getUTCDay(),
        hour_of_day: nowWib.getUTCHours(),
        created_at: new Date().toISOString()
      }]);
    }
  } catch (_) { /* Fire-and-forget: jangan crash briefing utama */ }

  return finalMessage.substring(0, 4000);
}

// ============================================================
// [PHASE 6] MORNING BRIEFING DETAIL — Dipanggil jika user balas "Detail"
// Menampilkan berita geopolitik + agenda lengkap
// ============================================================
async function generateMorningBriefingDetail() {
  console.log('[INTELLIGENCE] Generating Morning Briefing DETAIL mode...');

  let newsStr = 'Berita geopolitik tidak tersedia.';
  try {
    if (env.NEWS_API_KEY) {
      const newsRes = await axios.get(
        `https://newsdata.io/api/1/news?apikey=${env.NEWS_API_KEY}&q=Timur%20Tengah%20OR%20Middle%20East&language=id`
      );
      const top3 = newsRes.data.results ? newsRes.data.results.slice(0, 3) : [];
      newsStr = top3.length > 0
        ? top3.map((n, i) => `${i + 1}. ${n.title}`).join('\n')
        : 'Tidak ada berita terbaru.';
    }
  } catch (err) {
    console.warn('[INTELLIGENCE] Failed to get news:', err.message);
  }

  let eventsStr = 'Tidak ada agenda.';
  try {
    const events = await googleWorkspace.getTodaysEvents();
    if (events && events.length > 0) {
      eventsStr = events.map(e => {
        const startRaw = e.start?.dateTime || e.start?.date;
        const endRaw = e.end?.dateTime || e.end?.date;
        const timeLabel = startRaw
          ? (e.start.dateTime
              ? _formatTimeWib(startRaw) + (e.end?.dateTime ? ' - ' + _formatTimeWib(endRaw) : '')
              : 'Sepanjang hari')
          : '?';
        return `• ${timeLabel}: ${e.summary || '(Tanpa judul)'}`;
      }).join('\n');
    }
  } catch (err) {
    console.warn('[INTELLIGENCE] Failed to get calendar events:', err.message);
  }

  const prompt = `
[MODE: DETAIL BRIEFING — User meminta laporan penuh]

Agenda Hari Ini (Lengkap):
${eventsStr}

Berita Geopolitik Terkini (Timur Tengah):
${newsStr}

Buatkan ringkasan intelijen yang komprehensif, tajam, dan sangat informatif untuk Tuan Faqih.
Gaya: Chief of Staff yang cerdas dan berwibawa — padat, berisi, tidak bertele-tele.
Akhiri dengan SATU rekomendasi prioritas eksekutif hari ini.
Output: teks naratif langsung, BUKAN JSON.
`;

  let detail = await executeWithFallback(prompt, `${NEXA_PERSONALITY}\n\nPenting: Output murni string teks naratif, bukan JSON.`, 0.7, false);
  detail = detail.replace(/```json/g, '').replace(/```/g, '').trim();

  try {
    const parsed = JSON.parse(detail);
    return parsed.message || parsed.reply_message || detail;
  } catch (e) {
    if (detail.length > 4000) detail = detail.substring(0, 3990) + '...\n\n[Laporan dipotong otomatis]';
    return detail;
  }
}

// ============================================================
// [PHASE 6] EVENING BRIEFING — Reflective Diary
// Menggantikan format lama yang hanya laporan agenda esok
// ============================================================
async function generateEveningBriefing() {
  console.log('[INTELLIGENCE] Generating Evening Briefing (Phase 6 — Reflective Diary)...');

  // Ambil agenda esok
  // [BUG FIX #3] Sebelumnya memanggil getTodaysEvents() — data hari INI yang sudah berlalu.
  // Diganti dengan getTomorrowEvents() yang benar agar Evening Briefing menampilkan
  // persiapan esok hari yang relevan.
  let tomorrowAgenda = 'Tidak ada agenda terjadwal esok.';
  try {
    const events = await googleWorkspace.getTomorrowEvents();
    if (events && events.length > 0) {
      tomorrowAgenda = events.map(e => {
        const startRaw = e.start?.dateTime || e.start?.date;
        const timeLabel = startRaw ? _formatTimeWib(startRaw) : '?';
        return `• ${timeLabel} — ${e.summary || '(Tanpa judul)'}`;
      }).slice(0, 5).join('\n');
    }
  } catch (err) {
    console.warn('[INTELLIGENCE] Failed to get tomorrow events:', err.message);
  }

  // Susun pesan Evening Briefing — Reflective Diary
  const message = [
    '🌙 *Refleksi Malam, Tuan Faqih.*',
    '',
    `📅 *Persiapan Esok:*\n${tomorrowAgenda}`,
    '',
    'Sebelum beristirahat, boleh saya bertanya sejenak?',
    '',
    '✨ Apa *satu hal* yang paling membanggakan dari hari ini?',
    '🧠 Apakah ada hal yang masih mengganjal di pikiran?',
    '',
    '_Ceritakan saja apa adanya — saya akan menyimpannya sebagai bagian dari perjalanan Anda._',
    '_Atau balas "Tidak ada" jika ingin langsung istirahat._'
  ].join('\n');

  // Log ke behavior log
  try {
    const { supabase } = supabaseMemories;
    if (supabase) {
      const nowWib = new Date(new Date().getTime() + 7 * 60 * 60 * 1000);
      await supabase.from('nexa_behavior_log').insert([{
        event_type: 'EVENING_BRIEFING_SENT',
        event_data: { has_tomorrow_agenda: tomorrowAgenda !== 'Tidak ada agenda terjadwal esok.' },
        day_of_week: nowWib.getUTCDay(),
        hour_of_day: nowWib.getUTCHours(),
        created_at: new Date().toISOString()
      }]);
    }
  } catch (_) { /* Fire-and-forget */ }

  return message.substring(0, 4000);
}

// ============================================================
// [PHASE 6] CHECKIN PARSER — Synchronous Regex (Fast-path legacy)
// ============================================================
function parseMorningCheckIn(text) {
  if (!text) return null;
  const raw = String(text).trim();
  const patterns = [
    /^(\d)\s*[,;\/\s]\s*(\d)\s*[,;\/\s]\s*(.+)$/is,
    /tidur[:\s]+(\d)[,;\/\s]+(?:energi|energy)[:\s]+(\d)[,;\/\s]+(?:fokus)?[:\s]*(.+)/is,
    /^(\d)\s+dan\s+(\d)[,.]?\s+(.+)$/is,
  ];
  for (const pattern of patterns) {
    const match = raw.match(pattern);
    if (match) {
      const sleep = parseInt(match[1], 10);
      const energy = parseInt(match[2], 10);
      const focus = match[3]?.trim();
      if (sleep >= 1 && sleep <= 5 && energy >= 1 && energy <= 5 && focus) {
        return { sleep, energy, focus, raw_story: raw, calibration_notes: 'Angka eksplisit' };
      }
    }
  }
  return null;
}

// ============================================================
// [PHASE 6] AI-CALIBRATED CHECKIN PARSER (Narrative Evaluation)
// Mengevaluasi cerita/alasan pengguna, mengkalibrasi skor biologis
// yang akurat (1-5), dan menyusun 2 bubble respons empati.
// ============================================================
async function parseMorningCheckInWithAI(text) {
  if (!text) return null;

  // Gunakan fast path (tanpa AI) jika panjang teks < 45 ATAU tidak ada kata keterangan/alasan/cerita
  const hasNarrativeWords = /\b(karena|karna|tapi|namun|gara|soalnya|sebab|walau|meski|cuma|cuman|jadinya|makanya|terus|agak|lumayan|banget|sangat|pusing|capek|lelah|ngantuk|sakit|begadang|tadi|semalam|kemarin|pas|waktu|mikir|bingung|stres|kurang|telat|baru|kesiangan|alasan|malas|males|mager|lemes|lemas|cape|letih|lesu|loyo|drop|meriang|demam|flu|batuk|migrain|insomnia|nyeri|pegal|pegel|badmood|mood|marah|kesel|sedih|kacau|berantakan|mumet|penat|hancur|berat|seger|segar|fit|semangat|siap|santai|selow|padahal|sedangkan|malah|malahan|akhirnya|ujungnya|bikin|buat|kepikiran|terlalu|kemaleman|kepagian|kebablasan|lupa|inget|ingat|dikit|banyak|pol|parah|gila|ampun|tugas|revisi|makalah|skripsi|dosen|kampus|kuliah|kerja|rapat|meeting)\b/i.test(text);

  // FIX: variabel 'quick' adalah hasil fast-path parseMorningCheckIn (regex-based, zero AI).
  // Baris assignment ini hilang saat refactoring — menyebabkan ReferenceError: quick is not defined.
  // parseMorningCheckIn adalah fungsi yang benar (bukan parseExplicitScores yang tidak ada).
  const quick = parseMorningCheckIn(text);
  if (quick && (text.length < 45 && !hasNarrativeWords)) {
    return quick;
  }

  const prompt = `
Tuan Faqih membalas Morning Check-In dengan pesan berikut:
"${text}"

Tugas Anda sebagai N.E.X.A Cognitive Evaluator:
1. Cek apakah pesan ini berkaitan dengan balasan Morning Check-In (menjelaskan tidur, energi, kondisi pagi, atau fokus hari ini).
2. JANGAN mentah-mentah memasukkan angka jika Tuan Faqih memberikan cerita/alasan (mis. "Kasih 4 tapi semalam cuma tidur 3 jam karena revisi bab 3"). Evaluasi fakta ceritanya dan kalibrasi skor biologis sebenarnya:
   - Kualitas Tidur (skor integer 1 sampai 5)
   - Tingkat Energi Pagi (skor integer 1 sampai 5)
3. Ekstrak satu fokus utama hari ini (jika tidak eksplisit disebutkan, simpan fokus dari cerita atau "Menjalani rutinitas hari ini").
4. Buat catatan kalibrasi singkat ("calibration_notes") mengapa skor tersebut ditetapkan berdasarkan cerita Tuan Faqih.
5. Buat balasan N.E.X.A DALAM 2 BUBBLE PESAN TERPISAH:
   - "bubble1": Konfirmasi penerimaan cerita/alasan & penjelasan hasil kalibrasi kualitas tidur dan energi secara hangat. Contoh format: "🌅 Catatan Kondisi Pagi Diterima & Dikalibrasi.\n\nTerima kasih atas cerita alasannya, Tuan. Mengingat semalam Anda baru tidur pukul 3 pagi karena revisi bab 3 dan kepala pusing, saya mengkalibrasi kualitas tidur Anda di 3/5 dan energi di 2/5 agar jadwal hari ini lebih realistis."
   - "bubble2": Penegasan fokus hari ini beserta saran strategi N.E.X.A yang relevan. Contoh format: "🎯 Fokus Hari Ini: Bimbingan dosen jam 10\n\n💡 Saran N.E.X.A: Karena energi pagi ini sedang moderat, utamakan bimbingan jam 10 terlebih dahulu, lalu jadwalkan istirahat siang sebelum melanjutkan revisi."

Keluarkan dalam format JSON murni TANPA markdown/backticks:
{
  "is_checkin": true,
  "sleep": 3,
  "energy": 2,
  "focus": "...",
  "calibration_notes": "...",
  "bubble1": "...",
  "bubble2": "..."
}
`;

  try {
    let response = await executeWithFallback(prompt, `${NEXA_PERSONALITY}\n\nKeluarkan JSON murni saja.`, 0.3, false);
    response = response.replace(/```json/g, '').replace(/```/g, '').trim();
    const parsed = JSON.parse(response);
    if (parsed && parsed.is_checkin) {
      return {
        sleep: Math.max(1, Math.min(5, parseInt(parsed.sleep, 10) || 3)),
        energy: Math.max(1, Math.min(5, parseInt(parsed.energy, 10) || 3)),
        focus: parsed.focus || 'Fokus hari ini',
        raw_story: text,
        calibration_notes: parsed.calibration_notes || 'AI Narrative Calibration',
        reply_bubbles: {
          bubble1: parsed.bubble1 || `🌅 Catatan Kondisi Pagi Diterima & Dikalibrasi.\n\nKualitas tidur: ${parsed.sleep}/5 | Energi: ${parsed.energy}/5.`,
          bubble2: parsed.bubble2 || `🎯 Fokus Hari Ini: ${parsed.focus}`
        }
      };
    }
  } catch (e) {
    console.warn('[INTELLIGENCE] AI Check-in evaluation fallback:', e.message);
  }

  return parseMorningCheckIn(text);
}

// ============================================================
// [PHASE 6] Simpan data Check-In ke nexa_behavior_log
// ============================================================
async function saveCheckInData(sleep, energy, focus, rawStory = null, calibrationNotes = null) {
  try {
    const { supabase } = supabaseMemories;
    if (!supabase) return;
    const nowWib = new Date(new Date().getTime() + 7 * 60 * 60 * 1000);
    await supabase.from('nexa_behavior_log').insert([{
      event_type: 'MORNING_CHECKIN',
      event_data: {
        sleep_score: sleep,
        energy_score: energy,
        daily_focus: focus,
        raw_story: rawStory,
        ai_calibration_notes: calibrationNotes
      },
      day_of_week: nowWib.getUTCDay(),
      hour_of_day: nowWib.getUTCHours(),
      created_at: new Date().toISOString()
    }]);
    console.log(`[INTELLIGENCE] ✅ Morning Check-In logged: sleep=${sleep}, energy=${energy}, focus="${focus}" (calibrated: ${calibrationNotes})`);
  } catch (err) {
    console.warn('[INTELLIGENCE] Failed to save check-in data:', err.message);
  }
}

// ============================================================
// [PHASE 6] Generate Check-In Response dari N.E.X.A (2 Bubbles)
// ============================================================
async function generateCheckInResponse(sleep, energy, focus, prebuiltReply = null) {
  if (prebuiltReply && typeof prebuiltReply === 'object' && prebuiltReply.bubble1) {
    return prebuiltReply;
  }

  const sleepDesc = sleep <= 2 ? 'sangat kurang' : sleep === 3 ? 'cukup' : 'sangat baik';
  const energyDesc = energy <= 2 ? 'rendah' : energy === 3 ? 'cukup' : 'tinggi';

  const prompt = `
Tuan Faqih baru saja menjawab Morning Check-In paginya:
- Skor Kualitas Tidur: ${sleep}/5 (${sleepDesc})
- Skor Energi Saat Ini: ${energy}/5 (${energyDesc})
- Fokus Utama Hari Ini: "${focus}"

Sebagai N.E.X.A, buatlah balasan DALAM 2 BUBBLE PESAN TERPISAH (JSON format):
- bubble1: Konfirmasi penerimaan dan penilaian tidur/energi (1-2 kalimat hangat).
- bubble2: Fokus hari ini dan saran tindakan/strategi N.E.X.A (1-2 kalimat hangat).

Keluarkan JSON murni:
{
  "bubble1": "...",
  "bubble2": "..."
}
`;

  try {
    let response = await executeWithFallback(prompt, `${NEXA_PERSONALITY}\n\nPenting: Output JSON murni saja.`, 0.7, false);
    response = response.replace(/```json/g, '').replace(/```/g, '').trim();
    const parsed = JSON.parse(response);
    return {
      bubble1: parsed.bubble1 || `🌅 Catatan Kondisi Pagi Diterima.\n\nKualitas tidur Anda: ${sleep}/5 | Energi: ${energy}/5.`,
      bubble2: parsed.bubble2 || `🎯 Fokus Hari Ini: ${focus}\n\n💡 Saran N.E.X.A: Tetap jaga ritme kerja Anda hari ini.`
    };
  } catch (e) {
    return {
      bubble1: `🌅 Catatan Kondisi Pagi Diterima.\n\nKualitas tidur Anda dicatat ${sleep}/5 dan energi ${energy}/5.`,
      bubble2: `🎯 Fokus Hari Ini: ${focus}\n\n💡 Saran N.E.X.A: Semangat menyelesaikan fokus hari ini!`
    };
  }
}

// ============================================================
// [PHASE 6] EVENING REFLECTIVE RESPONSE
// N.E.X.A merespons cerita malam dari pengguna dengan empati
// ============================================================
async function generateEveningReflectiveResponse(userText) {
  const prompt = `
Tuan Faqih baru saja membagikan refleksi malam harinya kepada N.E.X.A:
"${userText}"

Sebagai N.E.X.A, asisten pribadinya yang peduli dan cerdas, berikan respons yang:
1. Hangat, empatik, dan memvalidasi perasaan/pencapaian yang diceritakan.
2. Jika ia menyebut pencapaian, rayakan dengan tulus (bukan berlebihan).
3. Jika ia menyebut hal yang mengganjal, berikan satu kalimat reframing yang positif dan realistis.
4. Di akhir, tanyakan apakah ia sudah minum air atau sudah bersiap tidur — sebagai bentuk kepedulian.
Output: teks naratif hangat, 3-4 kalimat, bukan JSON.
`;

  let response = await executeWithFallback(prompt, `${NEXA_PERSONALITY}\n\nPenting: Output teks naratif singkat, bukan JSON.`, 0.9, false);
  response = response.replace(/```json/g, '').replace(/```/g, '').trim();

  try {
    const parsed = JSON.parse(response);
    return parsed.message || parsed.reply_message || response;
  } catch (e) {
    return response.substring(0, 2000);
  }
}

// ============================================================
// LEGACY: Midnight Check-In (Tidak Diubah)
// ============================================================
async function generateMidnightCheckin() {
  console.log('[INTELLIGENCE] Generating Midnight Check-in...');
  const prompt = `
Tuan Faqih saat ini belum tidur (atau sistem sedang mengecek keadaannya karena sudah lewat larut malam, sekitar jam 01:00 pagi).
Sebagai asisten pribadi N.E.X.A yang super pintar, sangat peduli, dan proaktif, sapa Tuan Faqih.
SANGAT PENTING: Tanya dengan nada hangat tapi sedikit cerewet/penasaran: "Ini sudah jam berapa kok belum tidur?", "Lagi ngerjain apa malam-malam begini?", "Apakah ada yang mengganggu pikiran?".
Tunjukkan kepedulian tingkat tinggi terhadap kesehatan dan jam tidurnya. Jangan terlalu panjang, cukup 2-3 paragraf natural yang memancing Tuan Faqih untuk membalas dan bercerita.
Penting: Output murni teks naratif (jangan JSON), tanpa awalan kaku.
`;
  let checkin = await executeWithFallback(prompt, `${NEXA_PERSONALITY}\n\nPenting: Output murni string teks naratif, bukan JSON.`, 0.8, false);
  checkin = checkin.replace(/```json/g, '').replace(/```/g, '').trim();

  try {
    const parsed = JSON.parse(checkin);
    return parsed.message || parsed.reply_message || checkin;
  } catch (e) {
    if (checkin.length > 4000) checkin = checkin.substring(0, 3990);
    return checkin;
  }
}

module.exports = {
  generateMorningBriefing,
  generateMorningBriefingDetail,
  generateEveningBriefing,
  generateMidnightCheckin,
  parseMorningCheckIn,
  parseMorningCheckInWithAI,
  saveCheckInData,
  generateCheckInResponse,
  generateEveningReflectiveResponse,
};
