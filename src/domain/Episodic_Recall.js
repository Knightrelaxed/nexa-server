/**
 * ============================================================
 * [PHASE 11] EPISODIC RECALL ENGINE — Episodic_Recall.js
 * ============================================================
 * The Time-Machine Retrieval Gateway for Consolidated Daily Chronicles
 *
 * TUGAS UTAMA:
 *   Menyediakan akses instan ke memori masa lalu (> 90 hari) yang sudah
 *   dikonsolidasi ke dalam nexa_daily_narratives secara cepat tanpa
 *   membebani konteks token dengan ribuan log chat mentah.
 * ============================================================
 */

'use strict';

const supabaseMemories = require('../infrastructure/Supabase_Memories');

const INDONESIAN_MONTHS = {
  'januari': '01', 'jan': '01',
  'februari': '02', 'feb': '02',
  'maret': '03', 'mar': '03',
  'april': '04', 'apr': '04',
  'mei': '05', 'may': '05',
  'juni': '06', 'jun': '06',
  'juli': '07', 'jul': '07',
  'agustus': '08', 'ags': '08', 'agu': '08',
  'september': '09', 'sep': '09',
  'oktober': '10', 'okt': '10',
  'november': '11', 'nov': '11',
  'desember': '12', 'des': '12'
};

const STOPWORDS_ID = new Set([
  'yang', 'untuk', 'pada', 'ke', 'di', 'dari', 'dan', 'atau', 'ini', 'itu',
  'dengan', 'adalah', 'saya', 'aku', 'kamu', 'anda', 'tuan', 'nexa', 'apakah',
  'bagaimana', 'kapan', 'kenapa', 'mengapa', 'apa', 'saja', 'ada', 'gak', 'nggak',
  'tidak', 'bisa', 'dong', 'sih', 'kan', 'lah', 'ya', 'waktu', 'pas', 'saat',
  'tentang', 'ingat', 'inget', 'pernah', 'ngapain', 'gimana', 'kemarin', 'lalu',
  'kita', 'sempat', 'ngeluh'
]);

/**
 * Extract natural date like "17 Mei", "14 Mei 2026", "2026-05-14", dll. (Mendukung 12 Bulan)
 */
function extractNaturalDate(text) {
  if (!text) return null;
  const isoMatch = text.match(/\b(202\d-\d{2}-\d{2})\b/);
  if (isoMatch) return isoMatch[1];

  const monthRegex = /\b(\d{1,2})\s+(januari|februari|maret|april|mei|juni|juli|agustus|september|oktober|november|desember|jan|feb|mar|apr|may|jun|jul|ags|agu|sep|okt|nov|des)(?:\s+(202\d))?\b/i;
  const match = text.match(monthRegex);
  if (match) {
    const day = String(parseInt(match[1], 10)).padStart(2, '0');
    const monthKey = match[2].toLowerCase();
    const month = INDONESIAN_MONTHS[monthKey] || '05';
    const year = match[3] || '2026';
    return `${year}-${month}-${day}`;
  }
  return null;
}

/**
 * Extract salient search keywords from user query by stripping conversational stopwords
 */
function extractKeywords(text) {
  if (!text) return [];
  const words = text
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length >= 3 && !STOPWORDS_ID.has(w));
  return Array.from(new Set(words));
}

/**
 * Recall exact memory by target date (YYYY-MM-DD).
 * Checks nexa_daily_narratives (>90 days) first, falls back to nexa_chat_memories (0-90 days).
 */
async function recallDate(dateStr) {
  if (!dateStr) return null;
  // Tier 1: Consolidated Daily Chronicles (>90 days)
  const narrative = await supabaseMemories.getDailyNarrativeByDate(dateStr);
  if (narrative) return narrative;

  // Tier 2: Raw Chat Memories Buffer (0-90 days)
  const { messages } = await supabaseMemories.getChatsForDateWib(dateStr);
  if (messages && messages.length > 0) {
    const userSnippets = messages.filter(m => (m.role || '').toLowerCase() === 'user').map(m => m.content);
    const dayName = new Date(`${dateStr}T12:00:00+07:00`).toLocaleDateString('id-ID', { weekday: 'long', timeZone: 'Asia/Jakarta' });
    return {
      narrative_date: dateStr,
      day_name: dayName,
      narrative: `Tercatat pada riwayat percakapan tanggal ${dateStr}, Tuan berinteraksi mengenai: ${userSnippets.slice(0, 4).map(s => `"${s}"`).join(', ')}.`,
      key_events: userSnippets.slice(0, 3).map(s => ({ category: 'CHAT', detail: s })),
      total_chat_count: messages.length,
      is_raw_buffer: true
    };
  }

  return null;
}

/**
 * Search episodic memories with generalized dynamic keyword resolution.
 * Searches across BOTH nexa_daily_narratives (>90 days) AND nexa_chat_memories (0-90 days).
 */
async function searchMemories(queryOrKeywords, limit = 3) {
  if (!queryOrKeywords) return [];
  
  // 1. Jika terdeteksi tanggal (misal: "1 Juni", "16 Agustus", "17 Mei"), cari tanggal eksak
  if (typeof queryOrKeywords === 'string') {
    const detectedDate = extractNaturalDate(queryOrKeywords);
    if (detectedDate) {
      const directRecord = await recallDate(detectedDate);
      if (directRecord) return [directRecord];
    }
  }

  // 2. Ekstrak token kata kunci bersih tanpa kata hubung
  const keywords = typeof queryOrKeywords === 'string'
    ? extractKeywords(queryOrKeywords)
    : (Array.isArray(queryOrKeywords) ? queryOrKeywords : []);

  if (keywords.length === 0) return [];

  // 3. Cari ke nexa_daily_narratives (>90 hari)
  const narrativeResults = await supabaseMemories.searchDailyNarratives(keywords, limit);
  if (narrativeResults && narrativeResults.length > 0) {
    return narrativeResults;
  }

  // 4. Jika belum dirangkum (>90 hari), fallback cari ke nexa_chat_memories (0-90 hari)
  const rawResults = await supabaseMemories.searchRawChats(keywords, limit);
  return rawResults || [];
}

/**
 * Format a recalled daily narrative into a natural markdown/HTML response.
 */
function formatSingleDayNarrative(record) {
  if (!record) return 'Tidak ditemukan catatan memori untuk tanggal tersebut.';

  const formattedDate = new Date(`${record.narrative_date}T12:00:00+07:00`).toLocaleDateString('id-ID', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'Asia/Jakarta'
  });

  let text = `📜 <b>Catatan Memori N.E.X.A (${formattedDate})</b>\n\n`;
  text += `${record.narrative}\n\n`;

  if (record.key_events && Array.isArray(record.key_events) && record.key_events.length > 0) {
    text += `📌 <b>Poin Peristiwa Kunci:</b>\n`;
    record.key_events.forEach(ev => {
      text += `• <b>[${ev.category || 'EVENT'}]</b> ${ev.detail}\n`;
    });
    text += '\n';
  }

  if (record.unresolved_loops && Array.isArray(record.unresolved_loops) && record.unresolved_loops.length > 0) {
    text += `⏳ <b>Rencana / Open Loops:</b>\n`;
    record.unresolved_loops.forEach(loop => {
      text += `• <i>${loop}</i>\n`;
    });
    text += '\n';
  }

  if (record.mood_state) {
    text += `🧠 <i>Suasana Hari: ${record.mood_state} | Total Percakapan: ${record.total_chat_count || 0} pesan</i>`;
  }

  return text.trim();
}

/**
 * Format search results into a concise summary card.
 */
function formatSearchResults(keyword, records) {
  if (!records || records.length === 0) {
    return `🔍 Tidak ditemukan catatan masa lalu terkait "<b>${keyword}</b>".`;
  }

  let text = `🔍 <b>Ditemukan ${records.length} Catatan Memori Terkait "${keyword}":</b>\n\n`;
  records.forEach((r, idx) => {
    const shortDate = new Date(`${r.narrative_date}T12:00:00+07:00`).toLocaleDateString('id-ID', {
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    });
    const snippet = r.narrative ? String(r.narrative).substring(0, 150) + '...' : '(tanpa narasi)';
    text += `<b>${idx + 1}. ${shortDate} (${r.day_name || 'Hari'})</b>\n${snippet}\n\n`;
  });

  return text.trim();
}

module.exports = {
  recallDate,
  searchMemories,
  formatSingleDayNarrative,
  formatSearchResults
};
